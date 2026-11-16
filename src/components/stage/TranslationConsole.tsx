import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CaptionAudioCapture } from "@/lib/audio-capture";
import { translateCaption } from "@/lib/translation.functions";
import { defaultCaption, type CaptionTrack } from "@/lib/captions";

const LANGUAGES = [
  ["th", "ไทย"],
  ["en", "English"],
  ["ja", "日本語"],
  ["zh", "中文"],
  ["ko", "한국어"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["es", "Español"],
];
type Entry = { id: string; source: string; text: string; latency: number };
export function TranslationConsole({
  roomId,
  track,
  onChange,
  onPublish,
}: {
  roomId: string;
  track: CaptionTrack;
  onChange: (next: CaptionTrack) => void;
  onPublish: (source: string, text: string) => void;
}) {
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [glossary, setGlossary] = useState("");
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [kind, setKind] = useState<"microphone" | "tab">("microphone");
  const [device, setDevice] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const capture = useRef<CaptionAudioCapture | null>(null);
  const generation = useRef(0),
    request = useRef(0),
    pending = useRef(false),
    count = useRef(0);
  const latest = useRef({ track, auto, glossary, onPublish });
  latest.current = { track, auto, glossary, onPublish };
  const stop = () => {
    generation.current++;
    capture.current?.stop();
    capture.current = null;
    setListening(false);
    setLevel(0);
  };
  useEffect(
    () => () => {
      generation.current++;
      capture.current?.stop();
    },
    [],
  );
  useEffect(() => {
    stop();
  }, [track.sourceLanguage, track.targetLanguage]);
  useEffect(() => {
    try {
      setGlossary(localStorage.getItem(`relay-glossary-${roomId}`) ?? "");
    } catch {
      /* storage optional */
    }
  }, [roomId]);
  const translate = async (audio?: string) => {
    if (pending.current) throw new Error("กำลังแปลข้อความก่อนหน้า กรุณารอสักครู่");
    if (count.current >= 300) throw new Error("ครบ 300 คำขอในรอบนี้แล้ว กรุณาเปิดห้องใหม่เพื่อเริ่มรอบถัดไป");
    pending.current = true;
    setBusy(true);
    setError("");
    const version = generation.current,
      id = ++request.current;
    count.current++;
    const settings = latest.current;
    try {
      const result = await translateCaption({
        data: {
          roomId,
          text: audio ? "" : source,
          sourceLanguage: settings.track.sourceLanguage,
          targetLanguage: settings.track.targetLanguage,
          glossary: settings.glossary,
          ...(audio ? { audio } : {}),
        },
      });
      if (version !== generation.current || id !== request.current) return;
      setSource(result.source);
      setText(result.translation);
      if (result.translation) {
        setHistory((entries) =>
          [
            {
              id: crypto.randomUUID(),
              source: result.source,
              text: result.translation,
              latency: result.latencyMs,
            },
            ...entries,
          ].slice(0, 50),
        );
        if (latest.current.auto && !latest.current.track.held)
          latest.current.onPublish(result.source, result.translation);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const begin = async () => {
    stop();
    setError("");
    setListening(true);
    const next = new CaptionAudioCapture();
    capture.current = next;
    try {
      await next.start(
        kind,
        device,
        (audio) => translate(audio),
        setLevel,
        (message) => {
          stop();
          setError(message);
        },
      );
      if (capture.current === next)
        setDevices(
          (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"),
        );
    } catch (failure) {
      stop();
      setError(failure instanceof Error ? failure.message : "เปิดเสียงไม่ได้ กรุณาตรวจสิทธิ์ไมโครโฟน");
    }
  };
  const style = track.style ?? defaultCaption().style;
  return (
    <div className="control-translation">
      <div className="control-section-heading">
        <div>
          <h2>Translation · ซับ Gemini</h2>
          <p>รับข้อความหรือเสียงเป็นช่วง → ตรวจคำแปล → ส่งขึ้น LIVE</p>
        </div>
        <span className="control-badge" role="status">
          {busy ? "กำลังแปล" : listening ? "กำลังฟัง" : "หยุดรับเสียง"}
        </span>
      </div>
      <div className="control-form-row">
        <label>
          ภาษาต้นทาง
          <select
            value={track.sourceLanguage}
            onChange={(e) => onChange({ ...track, sourceLanguage: e.target.value })}
          >
            {LANGUAGES.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          ภาษาแปล
          <select
            value={track.targetLanguage}
            onChange={(e) => onChange({ ...track, targetLanguage: e.target.value })}
          >
            {LANGUAGES.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          การส่งซับ
          <select
            value={auto ? "auto" : "review"}
            onChange={(e) => setAuto(e.target.value === "auto")}
          >
            <option value="review">Review · ตรวจแล้วส่ง</option>
            <option value="auto">Auto · ส่งเมื่อแปลเสร็จ</option>
          </select>
        </label>
      </div>
      <div className="control-audio-row">
        <label>
          แหล่งเสียง
          <select
            disabled={listening}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="microphone">ไมโครโฟน / มิกเซอร์</option>
            <option value="tab">เสียงจากแท็บที่แชร์</option>
          </select>
        </label>
        {kind === "microphone" && (
          <label>
            อุปกรณ์
            <select disabled={listening} value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="">อุปกรณ์เริ่มต้น</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Microphone"}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button disabled={busy && !listening} onClick={() => (listening ? stop() : void begin())}>
          {listening ? "หยุดรับเสียง / พักแปล" : "เริ่มรับเสียงเพื่อแปล"}
        </Button>
        <meter min={0} max={100} value={level} aria-label="ระดับเสียงเข้า" />
      </div>
      <p className="control-muted">
        เสียงจะส่งไป AI เมื่อเริ่มรับเสียงเท่านั้น · ใช้ช่วงเสียง 2–8 วินาที ·
        เสียงจากแท็บต้องเปิดแชร์เสียงในหน้าต่างเลือกของเบราว์เซอร์
      </p>
      <div className="control-transcript-grid">
        <label>
          ข้อความต้นฉบับ
          <textarea
            lang={track.sourceLanguage}
            value={source}
            maxLength={2000}
            onChange={(e) => {
              generation.current++;
              setSource(e.target.value);
            }}
            placeholder="พิมพ์หรือวางข้อความเพื่อแปล"
          />
        </label>
        <label>
          คำแปล / ซับที่ต้องการส่ง
          <textarea
            lang={track.targetLanguage}
            value={text}
            maxLength={2000}
            onChange={(e) => {
              generation.current++;
              setText(e.target.value);
            }}
            placeholder="แก้คำแปลหรือพิมพ์ซับเองได้"
          />
        </label>
      </div>
      <div className="control-actions">
        <Button
          variant="outline"
          disabled={busy || listening || !source.trim()}
          onClick={() =>
            void translate().catch((failure) =>
              setError(failure instanceof Error ? failure.message : "แปลไม่สำเร็จ"),
            )
          }
        >
          {busy ? "กำลังแปล…" : "แปลด้วย Gemini"}
        </Button>
        <Button
          disabled={!text.trim()}
          onClick={() => {
            generation.current++;
            onPublish(source, text);
          }}
        >
          ส่งซับขึ้น LIVE
        </Button>
        <Button
          variant="outline"
          aria-pressed={track.held}
          onClick={() =>
            onChange({
              ...track,
              held: !track.held,
              expiresAt:
                track.held && style.readingSeconds
                  ? Date.now() + style.readingSeconds * 1000
                  : track.expiresAt,
            })
          }
        >
          {track.held ? "ปล่อยซับ / รับข้อความต่อ" : "ค้างซับปัจจุบัน"}
        </Button>
        <Button
          variant="outline"
          aria-pressed={!track.visible}
          onClick={() => onChange({ ...track, visible: !track.visible })}
        >
          {track.visible ? "ซ่อนซับ" : "แสดงซับ"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            generation.current++;
            onPublish("", "");
          }}
        >
          ล้างซับบนจอ
        </Button>
      </div>
      {error && (
        <p className="control-error" role="alert">
          {error}
        </p>
      )}
      <details>
        <summary>รูปแบบซับและคำศัพท์เฉพาะ</summary>
        <div className="control-form-row">
          {(
            [
              ["fontSize", "ขนาดตัวอักษร (px)", 20, 120],
              ["maxLines", "จำนวนบรรทัดต่อภาษา", 1, 4],
              ["bottom", "ระยะจากขอบล่าง (%)", 0, 40],
              ["background", "ความเข้มพื้นหลัง (%)", 0, 100],
              ["readingSeconds", "ค้างข้อความ (วินาที · 0 = ไม่หมดเวลา)", 0, 60],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                value={style[key]}
                onChange={(e) =>
                  onChange({
                    ...track,
                    style: {
                      ...style,
                      [key]: Math.max(min, Math.min(max, Number(e.target.value))),
                    },
                  })
                }
              />
            </label>
          ))}
          <label className="control-checkbox">
            <input
              type="checkbox"
              checked={style.bilingual}
              onChange={(e) =>
                onChange({ ...track, style: { ...style, bilingual: e.target.checked } })
              }
            />
            แสดงสองภาษา
          </label>
        </div>
        <label>
          Glossary · ชื่อคน บริษัท และศัพท์เฉพาะ
          <textarea
            value={glossary}
            maxLength={4000}
            onChange={(e) => {
              setGlossary(e.target.value);
              generation.current++;
              try {
                localStorage.setItem(`relay-glossary-${roomId}`, e.target.value);
              } catch {
                /* optional */
              }
            }}
            placeholder="เช่น Botnoi = บอทน้อย; คงชื่อผลิตภัณฑ์เป็นภาษาอังกฤษ"
          />
        </label>
      </details>
      <section className="control-caption-history">
        <h3>ประวัติรอบนี้ · {count.current}/300 คำขอ</h3>
        <p className="control-muted">เก็บ 50 รายการล่าสุดในหน้านี้ · กดนำกลับมาแก้ก่อนส่งได้</p>
        {history.map((entry) => (
          <button
            type="button"
            key={entry.id}
            onClick={() => {
              generation.current++;
              setSource(entry.source);
              setText(entry.text);
            }}
          >
            <span>{entry.source}</span>
            <strong>{entry.text}</strong>
            <small>{(entry.latency / 1000).toFixed(1)}s</small>
          </button>
        ))}
      </section>
    </div>
  );
}
