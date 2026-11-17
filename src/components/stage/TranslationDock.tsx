import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  botnoiCreateSession,
  botnoiGetSession,
  botnoiLanguages,
  botnoiRenewSpeakerLink,
  botnoiStopSession,
} from "@/lib/botnoi-live.functions";
import type { BotnoiSession } from "@/lib/botnoi-live.server";

/*
 * Live speech translation is handled by Botnoi Live. The room creator's
 * microphone streams through Botnoi's speaker page, embedded here so it keeps
 * streaming for the whole show, on every tab of the Control Room. Presenter
 * and screen-sharing machines never send audio.
 */

const FALLBACK_LANGUAGES = ["th", "en", "zh", "ja", "ko"];
const MAX_TARGETS = 6;
const POLL_MS = 10_000;
const SWITCH_DEBOUNCE_MS = 700;
const CREDENTIALS_KEY = "relay-botnoi-credentials";
const SETTINGS_KEY = "relay-botnoi-settings";
const sessionKey = (roomId: string) => `relay-botnoi-session-${roomId}`;

type Credentials = { apiKey: string; code: string };
type Settings = { sourceLanguage: string; targetLanguages: string[]; glossary: string };
type Connected = Settings;
type Saved = { session: BotnoiSession; connected: Connected };
type CheckState = "running" | "ok" | "warn" | "fail" | "info";
type Check = { id: string; label: string; state: CheckState; detail: string };

const read = <T,>(storage: "local" | "session", key: string): T | null => {
  try {
    const raw = (storage === "local" ? localStorage : sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (storage: "local" | "session", key: string, value: unknown) => {
  try {
    const target = storage === "local" ? localStorage : sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, JSON.stringify(value));
  } catch {
    /* storage optional */
  }
};
function languageName(code: string) {
  try {
    const name = new Intl.DisplayNames(["th"], { type: "language" }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}
const sameSettings = (a: Settings, b: Settings) =>
  a.sourceLanguage === b.sourceLanguage &&
  a.glossary === b.glossary &&
  [...a.targetLanguages].sort().join() === [...b.targetLanguages].sort().join();
const message = (failure: unknown, fallback: string) =>
  failure instanceof Error && failure.message ? failure.message : fallback;

/** Listen to the default microphone briefly and report the loudest level (0–1). */
async function probeMicrophone(ms = 2500): Promise<number> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  try {
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let peak = 0;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      analyser.getFloatTimeDomainData(data);
      for (const value of data) peak = Math.max(peak, Math.abs(value));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return peak;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  }
}

export function TranslationDock({
  roomId,
  roomConnected,
}: {
  roomId: string;
  roomConnected: boolean;
}) {
  const [credentials, setCredentials] = useState<Credentials>({ apiKey: "", code: "" });
  const [remember, setRemember] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    sourceLanguage: "th",
    targetLanguages: ["en"],
    glossary: "",
  });
  const [languages, setLanguages] = useState<string[]>(FALLBACK_LANGUAGES);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [speakerSrc, setSpeakerSrc] = useState("");
  const [micPanelOpen, setMicPanelOpen] = useState(true);
  const [busy, setBusy] = useState<"" | "start" | "switch" | "stop" | "resume">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const generation = useRef(0);
  const restored = useRef(false);
  /** Settings a switch already failed for; retried only after the operator changes them again. */
  const failedSwitch = useRef("");
  const session = saved?.session ?? null;
  const live = !!session && session.status !== "ended";
  const hasCredentials = !!credentials.apiKey.trim() && !!credentials.code.trim();
  const targets = settings.targetLanguages.filter((l) => l !== settings.sourceLanguage);

  const save = useCallback(
    (next: Saved | null) => {
      setSaved(next);
      write(
        "session",
        sessionKey(roomId),
        next ? { ...next, session: { ...next.session, speakerUrl: undefined } } : null,
      );
    },
    [roomId],
  );

  // Restore credentials and settings (shared across rooms) and this room's session.
  useEffect(() => {
    const local = read<Credentials>("local", CREDENTIALS_KEY);
    const tab = read<Credentials>("session", CREDENTIALS_KEY);
    const creds = tab ?? local;
    if (creds) setCredentials({ apiKey: creds.apiKey ?? "", code: creds.code ?? "" });
    if (tab && !local) setRemember(false);
    const stored = read<Settings>("local", SETTINGS_KEY);
    if (stored?.sourceLanguage) setSettings((current) => ({ ...current, ...stored }));
    const running = read<Saved>("session", sessionKey(roomId));
    if (running?.session && running.session.status !== "ended") setSaved(running);
    restored.current = true;
  }, [roomId]);

  const storeCredentials = (next: Credentials, keep: boolean) => {
    setCredentials(next);
    write("session", CREDENTIALS_KEY, next);
    write("local", CREDENTIALS_KEY, keep ? next : null);
  };
  const storeSettings = (next: Settings) => {
    setSettings(next);
    write("local", SETTINGS_KEY, next);
  };

  /** Open a Botnoi session and stream the room creator's mic through the embedded page. */
  const openStream = useCallback(
    async (cfg: Settings, replace: BotnoiSession | null) => {
      const version = ++generation.current;
      if (replace && replace.status !== "ended") {
        await botnoiStopSession({ data: { apiKey: credentials.apiKey, id: replace.id } }).catch(
          () => undefined,
        );
        // The old stream is gone; reflect that even if opening the new one fails.
        setSpeakerSrc("");
        setSaved((current) =>
          current && current.session.id === replace.id
            ? { ...current, session: { ...current.session, status: "ended" } }
            : current,
        );
      }
      const created = await botnoiCreateSession({
        data: {
          apiKey: credentials.apiKey,
          code: credentials.code,
          sourceLanguage: cfg.sourceLanguage,
          targetLanguages: cfg.targetLanguages.filter((l) => l !== cfg.sourceLanguage),
          glossary: cfg.glossary,
          voiceOutput: true,
        },
      });
      if (version !== generation.current) return;
      save({ session: created, connected: cfg });
      setSpeakerSrc(created.speakerUrl ?? "");
      setMicPanelOpen(true);
    },
    [credentials.apiKey, credentials.code, save],
  );

  const start = async () => {
    if (!hasCredentials) {
      setNotice("ใส่ API key และ code ใช้งานของ Botnoi ก่อน (ตั้งค่าครั้งเดียว)");
      setSettingsOpen(true);
      return;
    }
    if (!targets.length) {
      setError("เลือกภาษาปลายทางที่ต่างจากภาษาต้นทาง");
      return;
    }
    setBusy("start");
    setError("");
    setNotice("");
    try {
      await openStream(settings, null);
      setNotice("กดอนุญาตไมโครโฟนในกรอบ Botnoi ด้านล่าง แล้วเริ่มพูดได้เลย");
    } catch (failure) {
      setError(message(failure, "เริ่มถ่ายทอดเสียงไม่สำเร็จ"));
    } finally {
      setBusy("");
    }
  };

  const stop = async () => {
    if (!session || !saved) return;
    generation.current++;
    setBusy("stop");
    setError("");
    try {
      await botnoiStopSession({ data: { apiKey: credentials.apiKey, id: session.id } });
    } catch (failure) {
      setError(message(failure, "หยุดไม่สำเร็จ"));
    } finally {
      save({ ...saved, session: { ...session, status: "ended" } });
      setSpeakerSrc("");
      setNotice("หยุดถ่ายทอดเสียงแล้ว");
      setBusy("");
    }
  };

  // Changing languages or glossary while live switches the stream in place.
  const liveConnected = saved?.connected;
  useEffect(() => {
    if (!live || !liveConnected || busy || sameSettings(liveConnected, settings)) return;
    if (!targets.length) return;
    const key = JSON.stringify(settings);
    if (failedSwitch.current === key) return;
    const timer = window.setTimeout(async () => {
      setBusy("switch");
      setError("");
      try {
        await openStream(settings, session);
        setNotice("สลับภาษาแล้ว · ถ่ายทอดต่อเนื่อง · ผู้ฟังต้องสแกน QR ใหม่");
      } catch (failure) {
        failedSwitch.current = key;
        setError(message(failure, "สลับภาษาไม่สำเร็จ · การถ่ายทอดเดิมอาจหยุดแล้ว กดเริ่มใหม่"));
      } finally {
        setBusy("");
      }
    }, SWITCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, live, liveConnected, busy]);

  // After a refresh, pick the running stream back up with a fresh one-time link.
  const sessionId = session?.id;
  useEffect(() => {
    if (!restored.current || !sessionId || speakerSrc || busy || !credentials.apiKey) return;
    if (session?.status === "ended") return;
    let cancelled = false;
    setBusy("resume");
    botnoiRenewSpeakerLink({ data: { apiKey: credentials.apiKey, id: sessionId } })
      .then((link) => {
        if (!cancelled) setSpeakerSrc(link.speakerUrl);
      })
      .catch(() => {
        if (!cancelled) save(null);
      })
      .finally(() => {
        if (!cancelled) setBusy("");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, credentials.apiKey]);

  // Status and remaining minutes.
  const sessionStatus = session?.status;
  useEffect(() => {
    if (!sessionId || sessionStatus === "ended" || !credentials.apiKey) return;
    const version = generation.current;
    const timer = window.setInterval(async () => {
      try {
        const next = await botnoiGetSession({
          data: { apiKey: credentials.apiKey, id: sessionId },
        });
        if (version !== generation.current) return;
        setSaved((current) => {
          if (!current || current.session.id !== next.id) return current;
          const updated = { ...current, session: next };
          write("session", sessionKey(roomId), updated);
          return updated;
        });
        if (next.status === "ended") {
          setSpeakerSrc("");
          setNotice(
            next.code?.remainingMinutes === 0
              ? "หยุดถ่ายทอดแล้ว เพราะเวลาของ code หมด"
              : "การถ่ายทอดจบแล้ว",
          );
        }
      } catch {
        /* transient */
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sessionId, sessionStatus, credentials.apiKey, roomId]);

  // Closing the Control Room ends the microphone stream: warn first.
  useEffect(() => {
    if (!live) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [live]);

  const runTest = async () => {
    const list: Check[] = [
      { id: "room", label: "ห้องและจอ Presenter", state: "running", detail: "" },
      { id: "botnoi", label: "Botnoi API key", state: "running", detail: "" },
      { id: "code", label: "Code ใช้งาน", state: "running", detail: "" },
      {
        id: "mic",
        label: "ไมโครโฟนของเครื่องนี้",
        state: "running",
        detail: "พูดใส่ไมค์ 2–3 วินาที…",
      },
      { id: "stream", label: "สตรีมเสียงไป Botnoi", state: "running", detail: "" },
    ];
    setChecks(list);
    const update = (id: string, state: CheckState, detail: string) =>
      setChecks((current) =>
        (current ?? list).map((check) => (check.id === id ? { ...check, state, detail } : check)),
      );
    update(
      "room",
      roomConnected ? "ok" : "fail",
      roomConnected ? "เชื่อมต่อห้องอยู่" : "ยังไม่เชื่อมต่อห้อง · ตรวจอินเทอร์เน็ตแล้วรอสักครู่",
    );
    update(
      "code",
      !credentials.code.trim() ? "fail" : live ? "ok" : "info",
      !credentials.code.trim()
        ? "ยังไม่ได้ใส่ code"
        : live
          ? `เหลือ ${session?.code?.remainingMinutes ?? "?"} นาที`
          : "Botnoi ตรวจ code ตอนเริ่มถ่ายทอด",
    );
    update(
      "stream",
      !live ? "info" : session?.status === "opened" ? "ok" : "warn",
      !live
        ? "ยังไม่เริ่มถ่ายทอด"
        : session?.status === "opened"
          ? "Botnoi กำลังรับเสียงจากเครื่องนี้"
          : "รอหน้าไมค์เชื่อมต่อ · กดอนุญาตไมโครโฟนในกรอบ Botnoi",
    );
    const botnoi = (async () => {
      if (!credentials.apiKey.trim()) return update("botnoi", "fail", "ยังไม่ได้ใส่ API key");
      try {
        const result = await botnoiLanguages({ data: { apiKey: credentials.apiKey } });
        if (result.languages.length) setLanguages(result.languages);
        update("botnoi", "ok", `เชื่อมต่อได้ · รองรับ ${result.languages.length} ภาษา`);
      } catch (failure) {
        update("botnoi", "fail", message(failure, "เชื่อมต่อ Botnoi ไม่ได้"));
      }
    })();
    const mic = (async () => {
      try {
        const peak = await probeMicrophone();
        if (peak > 0.05) update("mic", "ok", "ได้ยินเสียงชัดเจน");
        else if (peak > 0.005) update("mic", "warn", "เสียงเบา · ขยับใกล้ไมค์หรือเพิ่ม gain");
        else update("mic", "fail", "ไม่ได้ยินเสียง · ตรวจไมค์ที่เลือกในการตั้งค่าเสียงของเครื่อง");
      } catch {
        update("mic", "fail", "เปิดไมโครโฟนไม่ได้ · อนุญาตไมโครโฟนให้หน้านี้");
      }
    })();
    await Promise.all([botnoi, mic]);
  };

  const languageOptions = useMemo(
    () =>
      [...new Set([...languages, settings.sourceLanguage, ...settings.targetLanguages])].filter(
        Boolean,
      ),
    [languages, settings.sourceLanguage, settings.targetLanguages],
  );

  const status =
    busy === "start" || busy === "resume"
      ? { tone: "pending", label: "กำลังเชื่อมต่อ" }
      : busy === "switch"
        ? { tone: "pending", label: "กำลังสลับภาษา" }
        : !live
          ? { tone: "idle", label: "ยังไม่ถ่ายทอด" }
          : session?.status === "opened"
            ? { tone: "live", label: "กำลังถ่ายทอดเสียง" }
            : { tone: "pending", label: "รออนุญาตไมโครโฟน" };

  return (
    <section className="control-tdock" aria-label="แปลเสียงสด">
      <div className="control-tdock-bar">
        <div className="control-tdock-title">
          <strong>แปลเสียงสด</strong>
          <span className={`control-tdock-status is-${status.tone}`} role="status">
            {status.label}
          </span>
          {live && session?.code?.remainingMinutes != null && (
            <span className="control-muted">เหลือ {session.code.remainingMinutes} นาที</span>
          )}
        </div>
        <div className="control-tdock-langs">
          <label>
            <span>พูดเป็น</span>
            <select
              aria-label="ภาษาที่พูด"
              value={settings.sourceLanguage}
              disabled={busy === "switch"}
              onChange={(e) => storeSettings({ ...settings, sourceLanguage: e.target.value })}
            >
              {languageOptions.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label>
            <span>แปลเป็น</span>
            <select
              aria-label="ภาษาแปล"
              value={targets[0] ?? ""}
              disabled={busy === "switch"}
              onChange={(e) =>
                storeSettings({
                  ...settings,
                  targetLanguages: [
                    e.target.value,
                    ...settings.targetLanguages.filter(
                      (l) => l !== e.target.value && l !== targets[0],
                    ),
                  ],
                })
              }
            >
              {!targets[0] && <option value="">เลือกภาษา</option>}
              {languageOptions
                .filter((code) => code !== settings.sourceLanguage)
                .map((code) => (
                  <option key={code} value={code}>
                    {languageName(code)}
                  </option>
                ))}
            </select>
          </label>
          {targets.length > 1 && <span className="control-muted">+{targets.length - 1} ภาษา</span>}
        </div>
        <div className="control-tdock-actions">
          <Button variant="outline" onClick={() => void runTest()}>
            ทดสอบการเชื่อมต่อ
          </Button>
          {live ? (
            <Button variant="destructive" disabled={!!busy} onClick={() => void stop()}>
              {busy === "stop" ? "กำลังหยุด…" : "หยุดถ่ายทอด"}
            </Button>
          ) : (
            <Button disabled={!!busy} onClick={() => void start()}>
              {busy === "start" ? "กำลังเชื่อมต่อ…" : "เริ่มถ่ายทอดเสียง"}
            </Button>
          )}
          <Button
            variant="ghost"
            aria-label="ตั้งค่าการแปล"
            title="ตั้งค่าการแปล"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙ ตั้งค่า
          </Button>
        </div>
      </div>

      {error && (
        <p className="control-error" role="alert">
          {error}
        </p>
      )}
      {notice && !error && <p className="control-tdock-notice">{notice}</p>}

      {checks && (
        <div className="control-tdock-checks">
          <ul>
            {checks.map((check) => (
              <li key={check.id} className={`is-${check.state}`}>
                <span aria-hidden="true">
                  {check.state === "running"
                    ? "…"
                    : check.state === "ok"
                      ? "✓"
                      : check.state === "fail"
                        ? "✕"
                        : check.state === "warn"
                          ? "!"
                          : "–"}
                </span>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => setChecks(null)}>
            ปิดผลทดสอบ
          </Button>
        </div>
      )}

      {live && (
        <div className="control-tdock-live">
          <div className={`control-tdock-mic${micPanelOpen ? "" : " is-collapsed"}`}>
            <div className="control-tdock-mic-head">
              <span>ไมค์ของเครื่องนี้ → Botnoi (อนุญาตไมโครโฟนในกรอบนี้)</span>
              <Button variant="ghost" size="sm" onClick={() => setMicPanelOpen((open) => !open)}>
                {micPanelOpen ? "ย่อ" : "แสดง"}
              </Button>
            </div>
            {speakerSrc && (
              <iframe
                title="Botnoi Live · หน้าไมค์ผู้พูด"
                src={speakerSrc}
                allow="microphone; autoplay; clipboard-write"
              />
            )}
          </div>
          <div className="control-tdock-listen">
            {session?.qrPngUrl && (
              <img
                src={session.qrPngUrl}
                alt={`QR สำหรับผู้ฟัง ห้อง ${session.roomCode ?? ""}`}
                width={140}
                height={140}
              />
            )}
            <div>
              <strong>ผู้ฟังสแกน QR</strong>
              <p className="control-muted">เลือกภาษา ฟังเสียงแปล และอ่านซับ · ไม่ต้องมีบัญชี</p>
              {session?.listenUrl && (
                <p className="control-tdock-links">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void navigator.clipboard?.writeText(session.listenUrl ?? "")}
                  >
                    คัดลอกลิงก์ผู้ฟัง
                  </Button>
                  {session.qrPngUrl && (
                    <a href={session.qrPngUrl} target="_blank" rel="noreferrer">
                      QR ขนาดใหญ่
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        credentials={credentials}
        remember={remember}
        settings={settings}
        languages={languageOptions}
        onLoadLanguages={async (apiKey) => {
          const result = await botnoiLanguages({ data: { apiKey } });
          if (result.languages.length) setLanguages(result.languages);
          return result.languages.length;
        }}
        onSave={(nextCreds, keep, nextSettings) => {
          setRemember(keep);
          storeCredentials(nextCreds, keep);
          storeSettings(nextSettings);
          setNotice("");
          setSettingsOpen(false);
        }}
      />
    </section>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  credentials,
  remember,
  settings,
  languages,
  onLoadLanguages,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: Credentials;
  remember: boolean;
  settings: Settings;
  languages: string[];
  onLoadLanguages: (apiKey: string) => Promise<number>;
  onSave: (credentials: Credentials, remember: boolean, settings: Settings) => void;
}) {
  const [draft, setDraft] = useState(credentials);
  const [keep, setKeep] = useState(remember);
  const [extra, setExtra] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState("");
  useEffect(() => {
    if (!open) return;
    setDraft(credentials);
    setKeep(remember);
    setExtra(settings);
    setLoading("");
  }, [open, credentials, remember, settings]);
  const targets = extra.targetLanguages.filter((l) => l !== extra.sourceLanguage);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="control-tdock-dialog">
        <DialogHeader>
          <DialogTitle>ตั้งค่าการแปล · Botnoi Live</DialogTitle>
          <DialogDescription>
            ใส่ครั้งเดียว ระบบจำไว้ในเครื่องนี้ · การแปลทำโดย Botnoi ทั้งหมด
          </DialogDescription>
        </DialogHeader>
        <label>
          API key
          <input
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={draft.apiKey}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            placeholder="x-api-key จากผู้ดูแล Botnoi"
          />
        </label>
        <label>
          Code ใช้งาน
          <input
            autoComplete="off"
            spellCheck={false}
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="เช่น EVENT2026"
          />
        </label>
        <div className="control-tdock-dialog-row">
          <label className="control-checkbox">
            <input
              type="checkbox"
              checked={showKey}
              onChange={(e) => setShowKey(e.target.checked)}
            />
            แสดง key
          </label>
          <label className="control-checkbox">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            จำในเครื่องนี้
          </label>
        </div>
        <details>
          <summary>ภาษาเพิ่มเติมและ Glossary (ไม่บังคับ)</summary>
          <fieldset className="control-botnoi-targets">
            <legend>ภาษาที่ผู้ฟังเลือกได้ · สูงสุด {MAX_TARGETS}</legend>
            {languages
              .filter((code) => code !== extra.sourceLanguage)
              .map((code) => (
                <label key={code} className="control-checkbox">
                  <input
                    type="checkbox"
                    checked={extra.targetLanguages.includes(code)}
                    disabled={
                      !extra.targetLanguages.includes(code) && targets.length >= MAX_TARGETS
                    }
                    onChange={(e) =>
                      setExtra({
                        ...extra,
                        targetLanguages: e.target.checked
                          ? [...extra.targetLanguages, code]
                          : extra.targetLanguages.filter((l) => l !== code),
                      })
                    }
                  />
                  {languageName(code)}
                </label>
              ))}
          </fieldset>
          <Button
            variant="outline"
            size="sm"
            disabled={!draft.apiKey.trim() || loading === "…"}
            onClick={() => {
              setLoading("…");
              onLoadLanguages(draft.apiKey)
                .then((count) => setLoading(`โหลดแล้ว ${count} ภาษา`))
                .catch((failure) => setLoading(message(failure, "โหลดภาษาไม่สำเร็จ")));
            }}
          >
            โหลดภาษาทั้งหมดจาก Botnoi
          </Button>{" "}
          <span className="control-muted">{loading}</span>
          <label>
            Glossary · หนึ่งคำต่อบรรทัด (term = คำแปล)
            <textarea
              value={extra.glossary}
              maxLength={8000}
              onChange={(e) => setExtra({ ...extra, glossary: e.target.value })}
              placeholder={"Botnoi = บอทน้อย\nLLM"}
            />
          </label>
        </details>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            onClick={() =>
              onSave(
                { apiKey: draft.apiKey.trim(), code: draft.code.trim() },
                keep,
                extra.targetLanguages.some((l) => l !== extra.sourceLanguage)
                  ? extra
                  : { ...extra, targetLanguages: settings.targetLanguages },
              )
            }
          >
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
