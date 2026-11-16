/** Mono PCM WAV for a bounded gateway request. Audio never enters the room video transport. */
export function encodeWav(samples: Float32Array, rate = 16000): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer);
  const word = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) =>
    view.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767),
      true,
    ),
  );
  return bytes;
}
export function audioBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** Keep upload size bounded even when a device uses a 44.1/48 kHz audio context. */
export function resampleMono(samples: Float32Array, inputRate: number, outputRate = 16000) {
  if (inputRate === outputRate) return samples;
  const result = new Float32Array(Math.floor((samples.length * outputRate) / inputRate));
  const ratio = inputRate / outputRate;
  for (let i = 0; i < result.length; i++) {
    const start = Math.floor(i * ratio),
      end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < Math.min(end, samples.length); j++) sum += samples[j]!;
    result[i] = sum / (Math.min(end, samples.length) - start);
  }
  return result;
}

export class CaptionAudioCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private frames: number[] = [];
  private silence = 0;
  private speech = false;
  private busy = false;
  private stopped = false;
  async start(
    kind: "microphone" | "tab",
    deviceId: string,
    onSegment: (audio: string) => Promise<void>,
    onLevel: (level: number) => void,
    onError: (message: string) => void,
  ) {
    try {
      const stream =
        kind === "tab"
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({
              audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            });
      this.stream = stream;
      if (this.stopped) {
        this.stop();
        return;
      }
      if (!stream.getAudioTracks().length)
        throw new Error("ไม่มีเสียงจากแท็บที่เลือก กรุณาเลือกแท็บพร้อมเปิดแชร์เสียง หรือต่อเสียงผ่านไมโครโฟน/มิกเซอร์");
      stream.getTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => {
            if (!this.stopped) {
              this.stop();
              onError("แหล่งเสียงหยุดทำงาน กรุณาเริ่มรับเสียงใหม่");
            }
          },
          { once: true },
        ),
      );
      const context = new AudioContext();
      this.context = context;
      const module = URL.createObjectURL(
        new Blob(
          [
            `class CaptionPCM extends AudioWorkletProcessor { process(inputs, outputs) { const input = inputs[0]; if (input && input[0]) { const mono = new Float32Array(input[0].length); for (const channel of input) for (let i=0;i<mono.length;i++) mono[i] += channel[i]/input.length; this.port.postMessage(mono); } return true; } } registerProcessor('caption-pcm', CaptionPCM);`,
          ],
          { type: "text/javascript" },
        ),
      );
      try {
        await context.audioWorklet.addModule(module);
      } finally {
        URL.revokeObjectURL(module);
      }
      if (this.stopped) return;
      const node = new AudioWorkletNode(context, "caption-pcm");
      this.node = node;
      context.createMediaStreamSource(stream).connect(node);
      // The processor writes silence to its output; no microphone monitoring/feedback.
      node.connect(context.destination);
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (this.stopped) return;
        const samples = event.data;
        const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
        onLevel(Math.min(100, rms * 600));
        const rate = context.sampleRate;
        if (rms > 0.012) {
          this.speech = true;
          this.silence = 0;
        } else this.silence += samples.length;
        this.frames.push(...samples);
        if (!this.speech) {
          if (this.frames.length > rate * 0.3) this.frames.splice(0, samples.length);
          return;
        }
        if (
          this.frames.length < rate * 8 &&
          !(this.frames.length > rate * 2 && this.silence > rate * 0.6)
        )
          return;
        const audio = audioBase64(encodeWav(resampleMono(Float32Array.from(this.frames), rate)));
        this.frames = [];
        this.speech = false;
        this.silence = 0;
        if (this.busy) {
          this.stop();
          onError("การแปลตามเสียงไม่ทัน หยุดรับเสียงแล้วเพื่อไม่ส่งซับล่าช้า กรุณาลองใหม่");
          return;
        }
        this.busy = true;
        void onSegment(audio)
          .catch((error) => {
            this.stop();
            onError(error instanceof Error ? error.message : "แปลเสียงไม่สำเร็จ");
          })
          .finally(() => {
            this.busy = false;
          });
      };
      await context.resume();
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  stop() {
    this.stopped = true;
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.frames = [];
  }
}
