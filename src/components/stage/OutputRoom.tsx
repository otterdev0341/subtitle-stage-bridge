import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBroadcastSession } from "@/lib/use-broadcast-session";
import { useShowKeyboard } from "@/hooks/use-show-keyboard";
import { defaultLayout } from "@/lib/stage-layout";
import { SOURCES, emptyStreams } from "@/lib/sources";
import { roomPath } from "@/lib/room-links";
import { StageCanvas } from "./StageCanvas";
import { ShowToolbar } from "./ShowToolbar";

export function OutputRoom({ roomId, presenter }: { roomId: string; presenter: boolean }) {
  const session = useBroadcastSession(roomId);
  const { start, stop } = session;
  const ref = useRef<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [awake, setAwake] = useState(true);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    void start("translation-display");
    return stop;
  }, [start, stop]);
  useEffect(() => {
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!fullscreen || help) {
      setAwake(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setAwake(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!document.activeElement?.closest(".control-output-actions")) setAwake(false);
      }, 2500);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [fullscreen, help]);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen();
  };
  useShowKeyboard((command) => {
    if (!presenter) session.sendCommand(command);
  }, toggleFullscreen);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !presenter &&
        event.key === "?" &&
        !(
          event.target instanceof Element &&
          event.target.closest("input,textarea,select,[contenteditable]")
        )
      )
        setHelp((value) => !value);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [presenter]);
  const streams = emptyStreams();
  for (const source of SOURCES)
    streams[source.id] =
      session.participants.find((p) => p.role === source.id && p.stream)?.stream ?? null;
  return (
    <main ref={ref} className={`control-output${fullscreen && !awake ? " is-idle" : ""}`}>
      {session.layout ? (
        <StageCanvas
          layout={session.layout}
          streams={streams}
          caption=""
          editable={false}
          className="control-output-canvas relay-stage-frame-audience"
        />
      ) : (
        <div className="control-output-wait" role="status">
          รอ Program จาก Control Room…
        </div>
      )}
      {!presenter && (
        <div hidden={fullscreen && !awake && !help} className="control-output-actions">
          <ShowToolbar
            layout={session.layout ?? defaultLayout()}
            execute={session.sendCommand}
            disabled={!session.connected || !session.layout}
          />
          <div className="control-actions">
            <Button onClick={toggleFullscreen}>{fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"} · F</Button>
            <Button variant="outline" onClick={() => setHelp((value) => !value)}>
              ปุ่มลัด · ?
            </Button>
            <a href={roomPath(roomId, "director")}>กลับ Control Room</a>
          </div>
          {session.commandPending && <p role="status">กำลังรอ Control Room ยืนยัน…</p>}
          {session.error && <p role="alert">{session.error}</p>}
          {help && (
            <p>
              0 LIVE · 1–3 พักจอ · 4–8 Layout · P/H/C/D/E ซ่อนภาพ · S ซ่อนซับ · K จอดำ · F เต็มจอ · Esc
              ออกเต็มจอ
            </p>
          )}
        </div>
      )}
      {presenter && !fullscreen && (
        <div className="control-presenter-start">
          <span>
            Presenter · Program เท่านั้น · {session.connected ? "เชื่อมต่อห้องแล้ว" : "กำลังเชื่อมต่อ"}
          </span>
          <Button onClick={toggleFullscreen}>เปิดเต็มจอ · F</Button>
          {session.error && <p role="status">{session.error}</p>}
        </div>
      )}
    </main>
  );
}
