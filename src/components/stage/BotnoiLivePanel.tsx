import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  botnoiCreateSession,
  botnoiGetSession,
  botnoiLanguages,
  botnoiRenewSpeakerLink,
  botnoiStopSession,
} from "@/lib/botnoi-live.functions";
import type { BotnoiSession } from "@/lib/botnoi-live.server";

const BOTNOI_FALLBACK_LANGUAGES = ["th", "en", "zh", "ja", "ko"];
const MAX_TARGETS = 6;
const POLL_MS = 10_000;
const CREDENTIALS_KEY = "relay-botnoi-credentials";
const sessionKey = (roomId: string) => `relay-botnoi-session-${roomId}`;
const settingsKey = (roomId: string) => `relay-botnoi-settings-${roomId}`;

type Credentials = { apiKey: string; code: string };
type Settings = {
  sourceLanguage: string;
  targetLanguages: string[];
  glossary: string;
  title: string;
  speakerName: string;
  voiceOutput: boolean;
};

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
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

const sameLanguages = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Open a tab synchronously inside the click so pop-up blockers allow it, then point it at the URL. */
function openPendingTab() {
  const win = window.open("", "_blank");
  if (win) {
    try {
      win.document.title = "Botnoi Live";
      win.document.body.innerHTML =
        '<p style="font:18px system-ui;padding:24px">กำลังเปิดหน้าผู้พูด Botnoi Live…</p>';
    } catch {
      /* cross-origin or blocked */
    }
  }
  return {
    go(url: string) {
      if (!win || win.closed) return false;
      try {
        win.opener = null;
      } catch {
        /* ignore */
      }
      win.location.href = url;
      return true;
    },
    close() {
      if (win && !win.closed) win.close();
    },
  };
}

export function BotnoiLivePanel({
  roomId,
  defaultSource,
  defaultTarget,
}: {
  roomId: string;
  defaultSource: string;
  defaultTarget: string;
}) {
  const [credentials, setCredentials] = useState<Credentials>({ apiKey: "", code: "" });
  const [remember, setRemember] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    sourceLanguage: defaultSource,
    targetLanguages: defaultTarget !== defaultSource ? [defaultTarget] : ["en"],
    glossary: "",
    title: "",
    speakerName: "",
    voiceOutput: true,
  });
  const [languages, setLanguages] = useState<string[]>(BOTNOI_FALLBACK_LANGUAGES);
  const [languagesLoaded, setLanguagesLoaded] = useState(false);
  const [session, setSession] = useState<BotnoiSession | null>(null);
  const [speakerUrl, setSpeakerUrl] = useState("");
  const [busy, setBusy] = useState<"" | "languages" | "connect" | "link" | "stop">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);

  // Restore credentials, settings and the running session for this room.
  useEffect(() => {
    const remembered = read<Credentials>("local", CREDENTIALS_KEY);
    const tabOnly = read<Credentials>("session", CREDENTIALS_KEY);
    if (remembered) setRemember(true);
    const saved = tabOnly ?? remembered;
    if (saved) setCredentials({ apiKey: saved.apiKey ?? "", code: saved.code ?? "" });
    const savedSettings = read<Settings>("local", settingsKey(roomId));
    if (savedSettings) setSettings((current) => ({ ...current, ...savedSettings }));
    const savedSession = read<BotnoiSession>("session", sessionKey(roomId));
    if (savedSession && savedSession.status !== "ended") setSession(savedSession);
  }, [roomId]);

  const updateCredentials = (next: Credentials, keep = remember) => {
    setCredentials(next);
    write("session", CREDENTIALS_KEY, next);
    write("local", CREDENTIALS_KEY, keep ? next : null);
  };
  const updateSettings = (patch: Partial<Settings>) =>
    setSettings((current) => {
      const next = { ...current, ...patch };
      write("local", settingsKey(roomId), next);
      return next;
    });
  const saveSession = useCallback(
    (next: BotnoiSession | null) => {
      setSession(next);
      // Keep the one-time speaker URL out of storage; it is useless after one open.
      write("session", sessionKey(roomId), next ? { ...next, speakerUrl: undefined } : null);
    },
    [roomId],
  );

  const active = !!session && session.status !== "ended";
  const connectedSource = session?.sourceLanguage ?? "";
  const connectedTargets = session?.targetLanguages ?? [];
  const languageChanged =
    active &&
    (connectedSource !== settings.sourceLanguage ||
      !sameLanguages(
        connectedTargets,
        settings.targetLanguages.filter((l) => l !== settings.sourceLanguage),
      ));
  const targets = settings.targetLanguages.filter((l) => l !== settings.sourceLanguage);
  const canConnect =
    !!credentials.apiKey.trim() && !!credentials.code.trim() && targets.length > 0 && !busy;

  const fail = (failure: unknown, fallback: string) =>
    setError(failure instanceof Error && failure.message ? failure.message : fallback);

  const loadLanguages = async () => {
    setBusy("languages");
    setError("");
    try {
      const result = await botnoiLanguages({ data: { apiKey: credentials.apiKey } });
      if (result.languages.length) {
        setLanguages(result.languages);
        setLanguagesLoaded(true);
      }
    } catch (failure) {
      fail(failure, "โหลดรายการภาษาไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  // Poll the running session for status and remaining minutes.
  const sessionId = session?.id;
  const sessionStatus = session?.status;
  useEffect(() => {
    if (!sessionId || sessionStatus === "ended" || !credentials.apiKey) return;
    const id = sessionId;
    const version = generation.current;
    const timer = window.setInterval(async () => {
      try {
        const next = await botnoiGetSession({ data: { apiKey: credentials.apiKey, id } });
        if (version !== generation.current) return;
        saveSession(next);
        if (next.status === "ended") {
          setSpeakerUrl("");
          setNotice(
            next.code && next.code.remainingMinutes === 0
              ? "Session จบแล้วเพราะเวลาของ code หมด"
              : "Session จบแล้ว",
          );
        }
      } catch {
        /* transient; next poll retries */
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sessionId, sessionStatus, credentials.apiKey, saveSession]);

  const connect = async () => {
    const tab = openPendingTab();
    const version = ++generation.current;
    setBusy("connect");
    setError("");
    setNotice("");
    try {
      if (session && session.status !== "ended") {
        // Languages are fixed per Botnoi session: end the old one before opening a new one.
        await botnoiStopSession({ data: { apiKey: credentials.apiKey, id: session.id } }).catch(
          () => undefined,
        );
        saveSession({ ...session, status: "ended" });
      }
      const created = await botnoiCreateSession({
        data: {
          apiKey: credentials.apiKey,
          code: credentials.code,
          sourceLanguage: settings.sourceLanguage,
          targetLanguages: targets,
          glossary: settings.glossary,
          title: settings.title || undefined,
          speakerName: settings.speakerName || undefined,
          voiceOutput: settings.voiceOutput,
        },
      });
      if (version !== generation.current) return;
      saveSession(created);
      setSpeakerUrl(created.speakerUrl ?? "");
      if (created.speakerUrl && tab.go(created.speakerUrl)) {
        setSpeakerUrl("");
        setNotice("เปิดหน้าผู้พูดในแท็บใหม่แล้ว · อนุญาตไมโครโฟนในแท็บนั้นเพื่อเริ่มส่งเสียง");
      } else {
        tab.close();
        setNotice("เบราว์เซอร์บล็อกแท็บใหม่ · กดลิงก์ผู้พูดด้านล่างเพื่อเปิด (เปิดได้ครั้งเดียว)");
      }
    } catch (failure) {
      tab.close();
      fail(failure, "เชื่อมต่อ Botnoi Live ไม่สำเร็จ");
    } finally {
      if (version === generation.current) setBusy("");
    }
  };

  const renewLink = async () => {
    if (!session) return;
    const tab = openPendingTab();
    setBusy("link");
    setError("");
    try {
      const link = await botnoiRenewSpeakerLink({
        data: { apiKey: credentials.apiKey, id: session.id },
      });
      saveSession({ ...session, speakerLinkExpiresAt: link.speakerLinkExpiresAt });
      if (tab.go(link.speakerUrl)) {
        setSpeakerUrl("");
        setNotice("เปิดหน้าผู้พูดด้วยลิงก์ใหม่แล้ว · ลิงก์เดิมใช้ไม่ได้อีก");
      } else {
        tab.close();
        setSpeakerUrl(link.speakerUrl);
        setNotice("เบราว์เซอร์บล็อกแท็บใหม่ · กดลิงก์ผู้พูดด้านล่างเพื่อเปิด");
      }
    } catch (failure) {
      tab.close();
      fail(failure, "ขอลิงก์ผู้พูดใหม่ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const stop = async () => {
    if (!session) return;
    generation.current++;
    setBusy("stop");
    setError("");
    try {
      await botnoiStopSession({ data: { apiKey: credentials.apiKey, id: session.id } });
      saveSession({ ...session, status: "ended" });
      setSpeakerUrl("");
      setNotice("หยุด session แล้ว · หน้าผู้พูดจะปิดภายในประมาณ 15 วินาที");
    } catch (failure) {
      fail(failure, "หยุด session ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const toggleTarget = (code: string, checked: boolean) => {
    const next = checked
      ? [...settings.targetLanguages.filter((l) => l !== code), code]
      : settings.targetLanguages.filter((l) => l !== code);
    if (next.filter((l) => l !== settings.sourceLanguage).length > MAX_TARGETS) {
      setError(`เลือกภาษาปลายทางได้สูงสุด ${MAX_TARGETS} ภาษา`);
      return;
    }
    setError("");
    updateSettings({ targetLanguages: next });
  };

  const languageOptions = useMemo(() => {
    const all = new Set([...languages, settings.sourceLanguage, ...settings.targetLanguages]);
    return [...all].filter(Boolean);
  }, [languages, settings.sourceLanguage, settings.targetLanguages]);

  const statusLabel = !session
    ? "ยังไม่เชื่อมต่อ"
    : session.status === "created"
      ? "รอผู้พูดเปิดลิงก์"
      : session.status === "opened"
        ? "ผู้พูดเชื่อมต่อแล้ว"
        : session.status === "ended"
          ? "จบ session"
          : session.status;
  const expires = session?.speakerLinkExpiresAt
    ? new Date(session.speakerLinkExpiresAt).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="control-translation control-botnoi">
      <div className="control-section-heading">
        <div>
          <h2>Botnoi Live · แปลเสียงสด</h2>
          <p>ส่งเสียงผู้พูดไปบอทน้อย → ผู้ฟังสแกน QR เลือกภาษา ฟังเสียงแปลและอ่านซับ</p>
        </div>
        <span className="control-badge" role="status">
          {busy === "connect" ? "กำลังเชื่อมต่อ" : statusLabel}
        </span>
      </div>

      <div className="control-form-row">
        <label>
          API key
          <input
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={credentials.apiKey}
            onChange={(e) => updateCredentials({ ...credentials, apiKey: e.target.value })}
            placeholder="x-api-key จากผู้ดูแล Botnoi"
          />
        </label>
        <label>
          Code ใช้งาน (time code)
          <input
            autoComplete="off"
            spellCheck={false}
            value={credentials.code}
            onChange={(e) => updateCredentials({ ...credentials, code: e.target.value })}
            placeholder="เช่น EVENT2026"
          />
        </label>
      </div>
      <div className="control-form-row">
        <label className="control-checkbox">
          <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} />
          แสดง API key
        </label>
        <label className="control-checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              updateCredentials(credentials, e.target.checked);
            }}
          />
          จำ key และ code ในเครื่องนี้
        </label>
      </div>
      <p className="control-muted">
        Key และ code ส่งผ่านเซิร์ฟเวอร์ของแอปไป Botnoi เท่านั้น ไม่ได้บันทึกบนเซิร์ฟเวอร์ ·
        ถ้าไม่เลือก “จำ” จะหายเมื่อปิดแท็บ · เวลาใช้งานหักจาก code และหยุดเองเมื่อเวลาหมด
      </p>

      <div className="control-form-row">
        <label>
          ภาษาต้นทาง (ผู้พูด)
          <select
            value={settings.sourceLanguage}
            onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
          >
            {languageOptions.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <Button
            variant="outline"
            disabled={!credentials.apiKey.trim() || !!busy}
            onClick={() => void loadLanguages()}
          >
            {busy === "languages"
              ? "กำลังโหลดภาษา…"
              : languagesLoaded
                ? "โหลดภาษาใหม่"
                : "โหลดภาษาที่ Botnoi รองรับ"}
          </Button>
        </div>
      </div>
      <fieldset className="control-botnoi-targets">
        <legend>ภาษาปลายทาง (ผู้ฟัง · สูงสุด {MAX_TARGETS})</legend>
        {languageOptions
          .filter((code) => code !== settings.sourceLanguage)
          .map((code) => (
            <label key={code} className="control-checkbox">
              <input
                type="checkbox"
                checked={settings.targetLanguages.includes(code)}
                onChange={(e) => toggleTarget(code, e.target.checked)}
              />
              {languageName(code)}
            </label>
          ))}
      </fieldset>

      <details>
        <summary>รายละเอียด session และ Glossary</summary>
        <div className="control-form-row">
          <label>
            ชื่อหัวข้อ
            <input
              value={settings.title}
              maxLength={200}
              onChange={(e) => updateSettings({ title: e.target.value })}
              placeholder="เช่น Keynote: AI in Thailand"
            />
          </label>
          <label>
            ชื่อผู้พูด
            <input
              value={settings.speakerName}
              maxLength={120}
              onChange={(e) => updateSettings({ speakerName: e.target.value })}
            />
          </label>
          <label className="control-checkbox">
            <input
              type="checkbox"
              checked={settings.voiceOutput}
              onChange={(e) => updateSettings({ voiceOutput: e.target.checked })}
            />
            ให้ผู้ฟังได้ยินเสียงแปล
          </label>
        </div>
        <label>
          Glossary · หนึ่งคำต่อบรรทัด (term = คำแปล)
          <textarea
            value={settings.glossary}
            maxLength={8000}
            onChange={(e) => updateSettings({ glossary: e.target.value })}
            placeholder={"Botnoi = บอทน้อย\nLLM"}
          />
        </label>
        <p className="control-muted">
          สูงสุด 300 คำ / 8000 ตัวอักษร · ใช้ตอนเชื่อมต่อ ถ้าแก้ต้องเชื่อมต่อใหม่
        </p>
      </details>

      {languageChanged && (
        <p className="control-error" role="alert">
          เปลี่ยนภาษาแล้ว · Botnoi กำหนดภาษาตอนเปิด session จึงต้องเชื่อมต่อใหม่ (session
          เดิมจะถูกหยุด และผู้พูดต้องเปิดลิงก์ใหม่)
        </p>
      )}

      <div className="control-actions">
        <Button disabled={!canConnect} onClick={() => void connect()}>
          {busy === "connect"
            ? "กำลังเชื่อมต่อ…"
            : !active
              ? "เชื่อมต่อ Botnoi Live และเปิดหน้าผู้พูด"
              : languageChanged
                ? "เชื่อมต่อใหม่ด้วยภาษาใหม่"
                : "เชื่อมต่อใหม่"}
        </Button>
        <Button
          variant="outline"
          disabled={!active || !!busy || !credentials.apiKey}
          onClick={() => void renewLink()}
        >
          {busy === "link" ? "กำลังขอลิงก์…" : "เปิดหน้าผู้พูดอีกครั้ง (ลิงก์ใหม่)"}
        </Button>
        <Button
          variant="outline"
          disabled={!active || !!busy || !credentials.apiKey}
          onClick={() => void stop()}
        >
          {busy === "stop" ? "กำลังหยุด…" : "หยุด session"}
        </Button>
      </div>

      {error && (
        <p className="control-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="control-muted" role="status">
          {notice}
        </p>
      )}
      {speakerUrl && (
        <p>
          <a href={speakerUrl} target="_blank" rel="noreferrer" onClick={() => setSpeakerUrl("")}>
            เปิดหน้าผู้พูด (ใช้ได้ครั้งเดียว ภายใน 15 นาที)
          </a>
        </p>
      )}

      {session && (
        <section className="control-botnoi-session">
          <div>
            <p>
              ห้อง <strong>{session.roomCode ?? "-"}</strong> ·{" "}
              {languageName(session.sourceLanguage ?? "")} →{" "}
              {session.targetLanguages.map(languageName).join(", ")}
            </p>
            <p className="control-muted">
              {session.code
                ? `Code ${session.code.code} · เหลือ ${session.code.remainingMinutes ?? "?"} นาที${
                    session.code.active ? "" : " · ปิดใช้งาน"
                  }`
                : ""}
              {expires && session.status === "created" ? ` · ลิงก์ผู้พูดหมดอายุ ${expires}` : ""}
            </p>
            {session.listenUrl && (
              <p className="control-botnoi-links">
                <a href={session.listenUrl} target="_blank" rel="noreferrer">
                  ลิงก์ผู้ฟัง
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(session.listenUrl ?? "")}
                >
                  คัดลอกลิงก์ผู้ฟัง
                </Button>
                {session.qrPngUrl && (
                  <a href={session.qrPngUrl} target="_blank" rel="noreferrer">
                    เปิด QR ขนาดใหญ่
                  </a>
                )}
              </p>
            )}
          </div>
          {session.qrPngUrl && session.status !== "ended" && (
            <img
              className="control-botnoi-qr"
              src={session.qrPngUrl}
              alt={`QR สำหรับผู้ฟัง ห้อง ${session.roomCode ?? ""}`}
              width={180}
              height={180}
            />
          )}
        </section>
      )}
    </div>
  );
}
