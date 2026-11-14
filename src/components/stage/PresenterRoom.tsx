import { useEffect, useRef, useState } from "react";
import { useBroadcastSession } from "@/lib/use-broadcast-session";
import { ProgramVideo } from "./ProgramVideo";
export function PresenterRoom({ roomId }: { roomId: string }) {
  const session = useBroadcastSession(roomId);
  const { start, stop } = session;
  const root = useRef<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false),
    [controls, setControls] = useState(true);
  useEffect(() => {
    void start("presenter");
    return () => stop();
  }, [roomId, start, stop]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    setControls(true);
    let timer = window.setTimeout(() => setControls(false), 2500);
    const wake = () => {
      setControls(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setControls(false), 2500);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
    };
  }, [fullscreen]);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyF" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <main ref={root} className={`relay-presenter${fullscreen && !controls ? " is-idle" : ""}`}>
      <ProgramVideo stream={session.programStream} />
      <button
        className={`relay-presenter-fullscreen${!controls ? " is-hidden" : ""}`}
        type="button"
        onClick={toggle}
      >
        {fullscreen ? "ออกจากเต็มจอ" : "เปิดเต็มจอ"} · F
      </button>
      {session.error && !session.programStream && (
        <p className="relay-presenter-error" role="status">
          {session.error}
        </p>
      )}
    </main>
  );
}
