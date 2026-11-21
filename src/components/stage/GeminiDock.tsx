import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { createGeminiLiveToken } from "@/lib/gemini-live.functions";
import { GEMINI_LIVE_WS, LANGUAGES, swapLanguages, translationPrompt } from "@/lib/gemini-live";
import type { TranslationSettings } from "@/lib/account-sync";

const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.b=[];this.n=0}
process(i){const c=i[0]&&i[0][0];if(c){this.b.push(new Float32Array(c));this.n+=c.length;
if(this.n>=1600){const o=new Float32Array(this.n);let k=0;for(const x of this.b){o.set(x,k);k+=x.length}
this.port.postMessage(o,[o.buffer]);this.b=[];this.n=0}}return true}}registerProcessor("pcm-capture",P)`;

function toBase64Pcm(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}

type Status = "idle" | "connecting" | "live" | "error";

/**
 * Live translation: the Control Room microphone streams to Gemini Live and the
 * translated transcription is published as Program captions.
 */
export function GeminiDock({
  settings,
  onSettings,
  onPublish,
}: {
  settings: TranslationSettings;
  onSettings: (next: TranslationSettings) => void;
  onPublish: (source: string, text: string) => void;
}) {
  const getToken = useServerFn(createGeminiLiveToken);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState("");
  const [line, setLine] = useState("");
  const [glossary, setGlossary] = useState(settings.glossary);
  const running = useRef(false);
  const ws = useRef<WebSocket | null>(null);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);
  const buf = useRef({ src: "", out: "", last: 0 });
  const publishRef = useRef(onPublish);
  publishRef.current = onPublish;
  useEffect(() => setGlossary(settings.glossary), [settings.glossary]);

  const flush = useCallback((final: boolean) => {
    const b = buf.current;
    const text = b.out.trim();
    if (text && (final || Date.now() - b.last > 400)) {
      publishRef.current(b.src.trim(), text);
      b.last = Date.now();
    }
    if (final) {
      b.src = "";
      b.out = "";
    }
  }, []);

  const connect = useCallback(async () => {
    if (!running.current) return;
    setStatus("connecting");
    try {
      const { token, model } = await getToken();
      const socket = new WebSocket(`${GEMINI_LIVE_WS}?access_token=${encodeURIComponent(token)}`);
      ws.current = socket;
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: translationPrompt(settings.source, settings.target, settings.glossary) }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      socket.onmessage = async (event) => {
        const raw = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
        const msg = JSON.parse(raw) as {
          setupComplete?: unknown;
          serverContent?: {
            inputTranscription?: { text?: string };
            outputTranscription?: { text?: string };
            turnComplete?: boolean;
          };
        };
        if (msg.setupComplete) setStatus("live");
        const sc = msg.serverContent;
        if (!sc) return;
        if (sc.inputTranscription?.text) {
          buf.current.src += sc.inputTranscription.text;
          setHeard(buf.current.src);
        }
        if (sc.outputTranscription?.text) {
          buf.current.out += sc.outputTranscription.text;
          setLine(buf.current.out);
          flush(false);
        }
        if (sc.turnComplete) flush(true);
      };
      socket.onclose = (ev) => {
        if (ws.current !== socket) return;
        ws.current = null;
        if (running.current) {
          // Sessions are time-limited; reconnect quietly while still running.
          if (ev.code !== 1000 && ev.code !== 4000 && ev.reason) setError(ev.reason);
          else setError("");
          window.setTimeout(() => void connectRef.current(), ev.code === 4000 ? 50 : 800);
        }
      };
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "เชื่อมต่อ Gemini ไม่สำเร็จ");
      running.current = false;
    }
  }, [getToken, settings, flush]);

  const connectRef = useRef(connect);
  connectRef.current = connect;

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const socket = ws.current;
        if (socket?.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64Pcm(e.data), mimeType: "audio/pcm;rate=16000" } } }));
      };
      ctx.createMediaStreamSource(stream).connect(node);
      audio.current = { ctx, stream };
      running.current = true;
      await connect();
    } catch {
      setStatus("error");
      setError("เปิดไมโครโฟนไม่สำเร็จ กรุณาอนุญาตไมค์แล้วลองใหม่");
    }
  };
  const stop = useCallback(() => {
    running.current = false;
    const socket = ws.current;
    ws.current = null;
    socket?.close(1000);
    audio.current?.stream.getTracks().forEach((t) => t.stop());
    void audio.current?.ctx.close();
    audio.current = null;
    setStatus("idle");
  }, []);
  useEffect(() => stop, [stop]);

  const live = status === "live" || status === "connecting";
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const swap = useCallback(() => {
    onSettings(swapLanguages(settingsRef.current));
    // While live, drop the session; onclose reconnects with the new languages.
    if (running.current) {
      flush(true);
      ws.current?.close(4000, "swap");
    }
  }, [onSettings, flush]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        swap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swap]);
  return (
    <section className="control-gemini" aria-label="แปลสด">
      <div className="control-lang-row">
        <label>
          ภาษาที่พูด
          <select disabled={live} value={settings.source} onChange={(e) => onSettings({ ...settings, source: e.target.value })}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <button type="button" className="control-lang-swap" onClick={swap} aria-label="สลับภาษา (S)" title="สลับภาษา (S)">
          <ArrowLeftRight size={18} />
        </button>
        <label>
          แปลเป็น
          <select disabled={live} value={settings.target} onChange={(e) => onSettings({ ...settings, target: e.target.value })}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </div>
      <label>
        คำศัพท์เฉพาะ (บรรทัดละคำ รูปแบบ คำ = คำแปล)
        <textarea
          disabled={live}
          value={glossary}
          maxLength={8000}
          onChange={(e) => setGlossary(e.target.value)}
          onBlur={() => glossary !== settings.glossary && onSettings({ ...settings, glossary })}
          placeholder={"บอทน้อย = Botnoi\nสมชาย ใจดี = Somchai Jaidee"}
        />
      </label>
      <div className="control-actions">
        {live ? (
          <Button variant="destructive" onClick={stop}>
            <MicOff size={16} /> หยุดแปล
          </Button>
        ) : (
          <Button onClick={() => void start()}>
            <Mic size={16} /> เริ่มแปลจากไมค์เครื่องนี้
          </Button>
        )}
        <span className={`control-gemini-status is-${status}`}>
          {status === "live" ? "กำลังแปลสด" : status === "connecting" ? "กำลังเชื่อมต่อ…" : status === "error" ? "มีปัญหา" : "ยังไม่เริ่ม"}
        </span>
      </div>
      {error && <p className="control-error" role="status">{error}</p>}
      {(heard || line) && (
        <div className="control-gemini-live">
          <p><small>ได้ยิน</small>{heard || "…"}</p>
          <p><small>คำแปล</small>{line || "…"}</p>
        </div>
      )}
    </section>
  );
}
