import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { createGeminiLiveToken } from "@/lib/gemini-live.functions";
import { LANGUAGES, swapLanguages, translationPrompt } from "@/lib/gemini-live";
import { GeminiSession, type GeminiStatus } from "@/lib/gemini-session";
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



/**
 * Live translation: the Control Room microphone streams to Gemini Live and the
 * translated transcription is published as Program captions.
 */
export function GeminiDock({
  settings,
  onSettings,
  onPublish,
  active = true,
  ready = true,
}: {
  settings: TranslationSettings;
  onSettings: (next: TranslationSettings) => void;
  onPublish: (source: string, text: string) => void;
  active?: boolean;
  ready?: boolean;
}) {
  const getToken = useServerFn(createGeminiLiveToken);
  const [status, setStatus] = useState<GeminiStatus>("idle");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState("");
  const [line, setLine] = useState("");
  const [glossary, setGlossary] = useState(settings.glossary);
  const running = useRef(false);
  const session = useRef<GeminiSession | null>(null);
  const startEpoch = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
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

  const releaseMicrophone = useCallback(() => {
    audio.current?.stream.getTracks().forEach((track) => track.stop());
    void audio.current?.ctx.close();
    audio.current = null;
  }, []);

  const stop = useCallback(() => {
    running.current = false;
    startEpoch.current++;
    session.current?.stop();
    session.current = null;
    releaseMicrophone();
    flush(true);
    setError("");
    setStatus("idle");
  }, [releaseMicrophone, flush]);
  useEffect(() => stop, [stop]);

  const start = async () => {
    if (running.current || !ready) return;
    running.current = true;
    const epoch = ++startEpoch.current;
    setStatus("connecting");
    setError("");
    let stream: MediaStream | undefined;
    let ctx: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      if (!running.current || epoch !== startEpoch.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      ctx = new AudioContext({ sampleRate: 16000 });
      audio.current = { ctx, stream };
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      if (!running.current || epoch !== startEpoch.current) return;
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      // A silent destination keeps the worklet processing without microphone feedback.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(silent).connect(ctx.destination);
      await ctx.resume();
      if (!running.current || epoch !== startEpoch.current) return;
      const liveSession = new GeminiSession({
        getToken,
        prompt: () => translationPrompt(settingsRef.current.source, settingsRef.current.target, settingsRef.current.glossary),
        onState: (next, message) => { setStatus(next); setError(message); },
        onFatal: () => { running.current = false; releaseMicrophone(); flush(true); },
        onMessage: (msg) => {
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
        },
      });
      session.current = liveSession;
      node.port.onmessage = (event: MessageEvent<Float32Array>) => liveSession.sendAudio(toBase64Pcm(event.data));
      for (const track of stream.getAudioTracks()) track.addEventListener("ended", () => {
        if (!running.current || epoch !== startEpoch.current) return;
        stop();
        setStatus("error");
        setError("ไมโครโฟนหยุดทำงาน กรุณาเชื่อมต่อไมค์แล้วเริ่มใหม่");
      }, { once: true });
      liveSession.start();
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (ctx && ctx.state !== "closed") void ctx.close();
      if (epoch !== startEpoch.current) return;
      running.current = false;
      audio.current = null;
      setStatus("error");
      setError("เปิดไมโครโฟนไม่สำเร็จ กรุณาอนุญาตไมค์แล้วลองใหม่");
    }
  };

  const live = status === "live" || status === "connecting" || status === "reconnecting";
  const swap = useCallback(() => {
    const next = swapLanguages(settingsRef.current);
    settingsRef.current = next;
    onSettings(next);
    if (running.current) {
      flush(true);
      session.current?.restart();
    }
  }, [onSettings, flush]);
  useEffect(() => {
    if (!active || !ready) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !e.isComposing) {
        e.preventDefault();
        swap();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [swap, active, ready]);
  return (
    <section className="control-gemini" aria-label="แปลสด">
      <div className="control-lang-row">
        <label>
          ภาษาที่พูด
          <select disabled={live || !ready} value={settings.source} onChange={(e) => onSettings({ ...settings, source: e.target.value })}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <Button disabled={!ready} type="button" variant="outline" size="icon" className="control-lang-swap" onClick={swap} aria-label="สลับภาษา (S)" title="สลับภาษา (S)">
          <ArrowLeftRight size={18} />
        </Button>
        <label>
          แปลเป็น
          <select disabled={live || !ready} value={settings.target} onChange={(e) => onSettings({ ...settings, target: e.target.value })}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </div>
      <label>
        คำศัพท์เฉพาะ (บรรทัดละคำ รูปแบบ คำ = คำแปล)
        <textarea
          disabled={live || !ready}
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
          <Button disabled={!ready} onClick={() => void start()}>
            <Mic size={16} /> เริ่มแปลจากไมค์เครื่องนี้
          </Button>
        )}
        <span className={`control-gemini-status is-${status}`}>
          {status === "live" ? "กำลังแปลสด" : status === "reconnecting" ? "กำลังเชื่อมต่อใหม่…" : status === "connecting" ? "กำลังเชื่อมต่อ…" : status === "error" ? "มีปัญหา" : "ยังไม่เริ่ม"}
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
