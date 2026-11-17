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

const FALLBACK_LANGUAGES = ["th", "en", "zh", "ja", "ko"];
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
/** What the running Botnoi session was opened with; languages/glossary are fixed per session. */
type Connected = { sourceLanguage: string; targetLanguages: string[]; glossary: string };
type Saved = { session: BotnoiSession; connected: Connected };

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
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Open the speaker page in its own window, synchronously inside the click so
 * pop-up blockers allow it. A separate window (not a tab) stays visible while
 * the Presenter is full screen elsewhere, so the browser keeps the microphone
 * page running at full speed.
 */
function openSpeakerWindow(name: string) {
  const win = window.open("", name, "popup,width=520,height=780");
  if (win) {
    try {
      win.document.title = "Botnoi Live";
      win.document.body.innerHTML =
        '<p style="font:18px system-ui;padding:24px">กำลังเปิดหน้าผู้พูด Botnoi Live…</p>';
    } catch {
      /* already on another origin */
    }
  }
  return {
    win,
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
  const [accountOpen, setAccountOpen] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    sourceLanguage: defaultSource,
    targetLanguages: defaultTarget !== defaultSource ? [defaultTarget] : ["en"],
    glossary: "",
    title: "",
    speakerName: "",
    voiceOutput: true,
  });
  const [languages, setLanguages] = useState<string[]>(FALLBACK_LANGUAGES);
  const [languagesLoaded, setLanguagesLoaded] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [speakerUrl, setSpeakerUrl] = useState("");
  const [speakerClosed, setSpeakerClosed] = useState(false);
  const [busy, setBusy] = useState<"" | "languages" | "connect" | "link" | "stop">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const speakerWindow = useRef<Window | null>(null);
  const session = saved?.session ?? null;
  const windowName = `botnoi-speaker-${roomId}`;

  // Restore credentials, settings and the running session for this room.
  useEffect(() => {
    const remembered = read<Credentials>("local", CREDENTIALS_KEY);
    const tabOnly = read<Credentials>("session", CREDENTIALS_KEY);
    if (remembered) setRemember(true);
    const creds = tabOnly ?? remembered;
    if (creds) setCredentials({ apiKey: creds.apiKey ?? "", code: creds.code ?? "" });
    // Fold the account step away when it is already filled in.
    setAccountOpen(!(creds?.apiKey && creds?.code));
    const savedSettings = read<Settings>("local", settingsKey(roomId));
    if (savedSettings) setSettings((current) => ({ ...current, ...savedSettings }));
    const savedSession = read<Saved>("session", sessionKey(roomId));
    if (savedSession?.session && savedSession.session.status !== "ended") setSaved(savedSession);
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
  const save = useCallback(
    (next: Saved | null) => {
      setSaved(next);
      // The one-time speaker URL is useless after one open; keep it out of storage.
      write(
        "session",
        sessionKey(roomId),
        next ? { ...next, session: { ...next.session, speakerUrl: undefined } } : null,
      );
    },
    [roomId],
  );

  const targets = settings.targetLanguages.filter((l) => l !== settings.sourceLanguage);
  const active = !!session && session.status !== "ended";
  const changed =
    active &&
    !!saved &&
    (saved.connected.sourceLanguage !== settings.sourceLanguage ||
      !sameSet(saved.connected.targetLanguages, targets) ||
      saved.connected.glossary !== settings.glossary);
  const hasCredentials = !!credentials.apiKey.trim() && !!credentials.code.trim();
  const canStart = hasCredentials && targets.length > 0 && !busy;

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

  // Poll status / remaining minutes while a session runs.
  const sessionId = session?.id;
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
          setSpeakerUrl("");
          setNotice(
            next.code && next.code.remainingMinutes === 0
              ? "หยุดรับเสียงแล้ว เพราะเวลาของ code หมด"
              : "Session จบแล้ว",
          );
        }
      } catch {
        /* transient; the next poll retries */
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sessionId, sessionStatus, credentials.apiKey, roomId]);

  // Warn as soon as the speaker window is closed: no audio reaches Botnoi then.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const win = speakerWindow.current;
      if (win && win.closed) {
        speakerWindow.current = null;
        setSpeakerClosed(true);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active]);

  const opened = (win: Window | null) => {
    speakerWindow.current = win;
    setSpeakerClosed(false);
  };

  const start = async () => {
    const speaker = openSpeakerWindow(windowName);
    const version = ++generation.current;
    setBusy("connect");
    setError("");
    setNotice("");
    try {
      if (session && session.status !== "ended") {
        // Languages and glossary are fixed per Botnoi session: end the old one first.
        await botnoiStopSession({ data: { apiKey: credentials.apiKey, id: session.id } }).catch(
          () => undefined,
        );
      }
      const connected: Connected = {
        sourceLanguage: settings.sourceLanguage,
        targetLanguages: targets,
        glossary: settings.glossary,
      };
      const created = await botnoiCreateSession({
        data: {
          apiKey: credentials.apiKey,
          code: credentials.code,
          sourceLanguage: connected.sourceLanguage,
          targetLanguages: connected.targetLanguages,
          glossary: connected.glossary,
          title: settings.title || undefined,
          speakerName: settings.speakerName || undefined,
          voiceOutput: settings.voiceOutput,
        },
      });
      if (version !== generation.current) return;
      save({ session: created, connected });
      if (created.speakerUrl && speaker.go(created.speakerUrl)) {
        opened(speaker.win);
        setSpeakerUrl("");
        setNotice(
          "เปิดหน้าผู้พูดในหน้าต่างใหม่แล้ว · กดอนุญาตไมโครโฟนในหน้าต่างนั้นแล้วเริ่มพูดได้เลย",
        );
      } else {
        speaker.close();
        setSpeakerUrl(created.speakerUrl ?? "");
        setNotice(
          "เบราว์เซอร์บล็อกหน้าต่างใหม่ · กดลิงก์ผู้พูดด้านล่างเพื่อเปิด (เปิดได้ครั้งเดียว)",
        );
      }
    } catch (failure) {
      speaker.close();
      fail(failure, "เริ่มรับเสียงไม่สำเร็จ");
    } finally {
      if (version === generation.current) setBusy("");
    }
  };

  const reopenSpeaker = async () => {
    if (!session) return;
    const speaker = openSpeakerWindow(windowName);
    setBusy("link");
    setError("");
    try {
      const link = await botnoiRenewSpeakerLink({
        data: { apiKey: credentials.apiKey, id: session.id },
      });
      if (saved)
        save({
          ...saved,
          session: { ...saved.session, speakerLinkExpiresAt: link.speakerLinkExpiresAt },
        });
      if (speaker.go(link.speakerUrl)) {
        opened(speaker.win);
        setSpeakerUrl("");
        setNotice("เปิดหน้าผู้พูดด้วยลิงก์ใหม่แล้ว · ลิงก์เดิมใช้ไม่ได้อีก");
      } else {
        speaker.close();
        setSpeakerUrl(link.speakerUrl);
        setNotice("เบราว์เซอร์บล็อกหน้าต่างใหม่ · กดลิงก์ผู้พูดด้านล่างเพื่อเปิด");
      }
    } catch (failure) {
      speaker.close();
      fail(failure, "เปิดหน้าผู้พูดใหม่ไม่สำเร็จ");
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
      save({ ...saved, session: { ...session, status: "ended" } });
      setSpeakerUrl("");
      setSpeakerClosed(false);
      speakerWindow.current = null;
      setNotice("หยุดรับเสียงแล้ว · หน้าผู้พูดจะปิดเองภายในประมาณ 15 วินาที");
    } catch (failure) {
      fail(failure, "หยุดรับเสียงไม่สำเร็จ");
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

  const languageOptions = useMemo(
    () =>
      [...new Set([...languages, settings.sourceLanguage, ...settings.targetLanguages])].filter(
        Boolean,
      ),
    [languages, settings.sourceLanguage, settings.targetLanguages],
  );

  const statusLabel =
    busy === "connect"
      ? "กำลังเชื่อมต่อ"
      : !session
        ? "ยังไม่เริ่ม"
        : session.status === "created"
          ? "รอผู้พูดเปิดหน้าไมค์"
          : session.status === "opened"
            ? speakerClosed
              ? "หน้าผู้พูดถูกปิด"
              : "กำลังรับเสียง"
            : session.status === "ended"
              ? "หยุดแล้ว"
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
          <h2>แปลเสียงสด · Botnoi Live</h2>
          <p>เลือกภาษาและ Glossary → เริ่มรับเสียง → ผู้ฟังสแกน QR ฟังเสียงแปลและอ่านซับ</p>
        </div>
        <span className="control-badge" role="status">
          {statusLabel}
        </span>
      </div>

      <details
        className="control-botnoi-step"
        open={accountOpen}
        onToggle={(e) => setAccountOpen(e.currentTarget.open)}
      >
        <summary>
          1 · บัญชี Botnoi Live{" "}
          <span className="control-muted">
            {hasCredentials ? `· code ${credentials.code}` : "· กรอก API key และ code ใช้งาน"}
          </span>
        </summary>
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
            <input
              type="checkbox"
              checked={showKey}
              onChange={(e) => setShowKey(e.target.checked)}
            />
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
          เวลาที่ใช้หักจาก code และระบบหยุดเองเมื่อเวลาหมด
        </p>
      </details>

      <section className="control-botnoi-step">
        <h3>2 · ภาษาและ Glossary</h3>
        <div className="control-form-row">
          <label>
            ภาษาต้นทาง (ภาษาที่ผู้พูดใช้)
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
          <legend>ภาษาปลายทาง (ภาษาที่ผู้ฟังเลือกได้ · สูงสุด {MAX_TARGETS})</legend>
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
        <label>
          Glossary · ชื่อคน บริษัท และศัพท์เฉพาะ หนึ่งคำต่อบรรทัด (term = คำแปล)
          <textarea
            value={settings.glossary}
            maxLength={8000}
            onChange={(e) => updateSettings({ glossary: e.target.value })}
            placeholder={"Botnoi = บอทน้อย\nLLM"}
          />
        </label>
        <details>
          <summary>ตัวเลือกเพิ่มเติม</summary>
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
        </details>
      </section>

      <section className="control-botnoi-step">
        <h3>3 · รับเสียง</h3>
        {changed && (
          <p className="control-error" role="alert">
            เปลี่ยนภาษาหรือ Glossary แล้ว · ต้องเชื่อมต่อใหม่จึงจะมีผล (session เดิมจะหยุด QR
            และลิงก์ผู้ฟังจะเปลี่ยน)
          </p>
        )}
        {speakerClosed && active && (
          <p className="control-error" role="alert">
            หน้าต่างผู้พูดถูกปิด · เสียงไม่ได้ส่งไป Botnoi แล้ว กด “เปิดหน้าผู้พูดใหม่”
            เพื่อรับเสียงต่อ
          </p>
        )}
        <div className="control-actions">
          {!active || changed ? (
            <Button disabled={!canStart} onClick={() => void start()}>
              {busy === "connect"
                ? "กำลังเชื่อมต่อ…"
                : changed
                  ? "เชื่อมต่อใหม่ด้วยค่าใหม่"
                  : "เริ่มรับเสียง"}
            </Button>
          ) : (
            <Button disabled={!!busy} onClick={() => void stop()}>
              {busy === "stop" ? "กำลังหยุด…" : "หยุดรับเสียง"}
            </Button>
          )}
          {active && (
            <Button variant="outline" disabled={!!busy} onClick={() => void reopenSpeaker()}>
              {busy === "link" ? "กำลังขอลิงก์…" : "เปิดหน้าผู้พูดใหม่"}
            </Button>
          )}
          {active && changed && (
            <Button variant="outline" disabled={!!busy} onClick={() => void stop()}>
              หยุดรับเสียง
            </Button>
          )}
        </div>
        {!hasCredentials && (
          <p className="control-muted">กรอก API key และ code ใช้งานในข้อ 1 ก่อนเริ่มรับเสียง</p>
        )}
        <p className="control-muted">
          เสียงจะถูกส่งจากหน้าต่างผู้พูดของ Botnoi (ไม่ใช่หน้านี้)
          ระหว่างพูดอย่าปิดหรือย่อหน้าต่างนั้น · เปิด Presenter เป็นหน้าต่างแยกบนจอโปรเจกเตอร์
          หน้านี้จะได้ไม่ถูกบัง
        </p>
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
            <a
              href={speakerUrl}
              target={windowName}
              rel="noreferrer"
              onClick={() => setSpeakerUrl("")}
            >
              เปิดหน้าผู้พูด (ใช้ได้ครั้งเดียว ภายใน 15 นาที)
            </a>
          </p>
        )}
      </section>

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
            {session.listenUrl && session.status !== "ended" && (
              <>
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
                <p className="control-muted">
                  ต้องการซับบนเวที: เปิดลิงก์ผู้ฟังบนเครื่องจอ B แล้วแชร์จอเข้ามาเป็นแหล่งภาพ B
                </p>
              </>
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
