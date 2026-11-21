import { GEMINI_LIVE_WS } from "./gemini-live";

export type GeminiStatus = "idle" | "connecting" | "reconnecting" | "live" | "error";
export type GeminiMessage = {
  setupComplete?: unknown;
  sessionResumptionUpdate?: { resumable?: boolean; newHandle?: string };
  goAway?: { timeLeft?: string };
  error?: { code?: number; status?: string };
  serverContent?: {
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    turnComplete?: boolean;
  };
};

/** One microphone run, multiple resumable Live connections; handles stay in memory. */
export class GeminiSession {
  private socket: WebSocket | null = null;
  private active = false;
  private ready = false;
  private epoch = 0;
  private attempts = 0;
  private handle: string | undefined;
  private frames: string[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private setupTimer: ReturnType<typeof setTimeout> | undefined;
  private stableTimer: ReturnType<typeof setTimeout> | undefined;
  private rotateTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: {
    getToken: () => Promise<{ token: string; model: string }>;
    prompt: () => string;
    onState: (status: GeminiStatus, error: string) => void;
    onMessage: (message: GeminiMessage) => void;
    onFatal: () => void;
  }) {}

  start() {
    if (this.active) return;
    this.active = true;
    this.attempts = 0;
    void this.connect();
  }

  stop() {
    this.active = false;
    this.epoch++;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    this.frames = [];
    this.handle = undefined;
    socket?.close(1000);
  }

  restart() {
    if (!this.active) return;
    // Language swaps start a fresh interpretation context, never reuse old instructions.
    this.handle = undefined;
    this.frames = [];
    this.attempts = 0;
    this.replace();
  }

  sendAudio(data: string) {
    if (!this.active) return;
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) {
      // Keep at most two seconds during a short handover, not an unbounded backlog.
      this.frames.push(data);
      if (this.frames.length > 20) this.frames.shift();
      return;
    }
    this.socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }));
  }

  private clearTimers() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.setupTimer);
    clearTimeout(this.stableTimer);
    clearTimeout(this.rotateTimer);
  }

  private fatal(message: string) {
    this.stop();
    this.options.onState("error", message);
    this.options.onFatal();
  }

  private retry() {
    if (!this.active) return;
    if (this.attempts >= 5) {
      this.fatal("เชื่อมต่อใหม่ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วกดเริ่มแปลอีกครั้ง");
      return;
    }
    this.options.onState("reconnecting", "การเชื่อมต่อขาดช่วง กำลังเชื่อมต่อใหม่…");
    const delay = Math.min(1000 * 2 ** this.attempts++, 16000);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private replace() {
    this.epoch++;
    this.clearTimers();
    this.ready = false;
    const old = this.socket;
    this.socket = null;
    old?.close(1000);
    void this.connect();
  }

  private async connect() {
    if (!this.active) return;
    const epoch = ++this.epoch;
    this.options.onState(this.attempts || this.handle ? "reconnecting" : "connecting", "");
    try {
      const { token, model } = await this.options.getToken();
      if (!this.active || epoch !== this.epoch) return;
      const socket = new WebSocket(`${GEMINI_LIVE_WS}?access_token=${encodeURIComponent(token)}`);
      this.socket = socket;
      this.ready = false;
      this.setupTimer = setTimeout(() => {
        if (this.socket !== socket || !this.active) return;
        this.socket = null;
        socket.close(1000);
        this.retry();
      }, 15000);
      socket.onopen = () => {
        if (this.socket !== socket || !this.active) return;
        socket.send(JSON.stringify({ setup: {
          model: `models/${model}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          systemInstruction: { parts: [{ text: this.options.prompt() }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: this.handle ? { handle: this.handle } : {},
        } }));
      };
      socket.onmessage = async (event) => {
        if (this.socket !== socket || !this.active) return;
        try {
          const raw = event.data;
          const text = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : await (raw as Blob).text();
          if (this.socket !== socket || !this.active) return;
          const message = JSON.parse(text) as GeminiMessage;
          if (message.error) {
            this.fatal(message.error.code === 429 || message.error.status === "RESOURCE_EXHAUSTED"
              ? "Gemini จำกัดการใช้งานชั่วคราว กรุณาตรวจโควตาหรือเครดิตก่อนเริ่มใหม่"
              : "Gemini ไม่รับการเชื่อมต่อ กรุณาตรวจสิทธิ์ของคีย์แล้วลองใหม่");
            return;
          }
          if (message.setupComplete) {
            clearTimeout(this.setupTimer);
            this.ready = true;
            this.options.onState("live", "");
            this.stableTimer = setTimeout(() => { this.attempts = 0; }, 30000);
            const frames = this.frames;
            this.frames = [];
            for (const frame of frames) this.sendAudio(frame);
          }
          const update = message.sessionResumptionUpdate;
          // During generation Gemini temporarily sends resumable=false; retain the
          // last checkpoint rather than discarding the entire interpretation context.
          if (update?.resumable && update.newHandle) this.handle = update.newHandle;
          this.options.onMessage(message);
          if (message.goAway) {
            const seconds = Number.parseFloat(message.goAway.timeLeft ?? "5s");
            clearTimeout(this.rotateTimer);
            this.rotateTimer = setTimeout(() => {
              if (this.socket === socket && this.active) this.replace();
            }, Number.isFinite(seconds) ? Math.max(0, Math.min(5000, (seconds - 1) * 1000)) : 4000);
          }
        } catch {
          // Ignore a malformed frame, rather than crashing the audio receiver.
        }
      };
      socket.onerror = () => {
        // Browser sockets deliver onclose after transport errors; retry there only once.
        if (this.socket === socket) this.options.onState("reconnecting", "กำลังตรวจการเชื่อมต่อ…");
      };
      socket.onclose = (event) => {
        if (this.socket !== socket || !this.active) return;
        this.socket = null;
        this.ready = false;
        clearTimeout(this.setupTimer);
        clearTimeout(this.stableTimer);
        clearTimeout(this.rotateTimer);
        if ([1003, 1007, 1008, 4401, 4403].includes(event.code)) {
          this.fatal("Gemini ปฏิเสธการเชื่อมต่อ กรุณาตรวจสิทธิ์และโควตาก่อนเริ่มใหม่");
        } else this.retry();
      };
    } catch {
      if (this.active && epoch === this.epoch) this.retry();
    }
  }
}