import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, CircleStop, Crop, Expand, Eye, EyeOff, FileVideo2, Languages, Link2, LoaderCircle, MonitorUp, Move, RadioTower, Settings2, Share2, Type, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useBroadcastSession, type BroadcastRole } from "@/lib/use-broadcast-session";

type RoomView = "director" | "presentation" | "translation" | "stage";

export const Route = createFileRoute("/room/$roomId")({
  validateSearch: (search: Record<string, unknown>): { view: RoomView } => ({
    view: search["view"] === "presentation" || search["view"] === "translation" || search["view"] === "stage" ? (search["view"] as RoomView) : "director",
  }),
  head: ({ params }) => ({
    meta: [
      { title: `ห้อง ${params.roomId.slice(0, 8)} — Canvas Relay` },
      { name: "description", content: "เชื่อมภาพพรีเซนต์กับคำบรรยายสดและปรับตำแหน่งได้แบบเรียลไทม์" },
      { property: "og:title", content: `ห้องถ่ายทอดสด — Canvas Relay` },
      { property: "og:description", content: "ประกอบภาพพรีเซนต์และคำบรรยายแปลจากสองเครื่องบนเวทีเดียวกัน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BroadcastRoom,
});

function BroadcastRoom() {
  const { roomId } = Route.useParams();
  const { view } = Route.useSearch();

  if (view === "presentation" || view === "translation") {
    return <RemoteStation roomId={roomId} role={view} />;
  }
  return <DirectorRoom roomId={roomId} stageOnly={view === "stage"} />;
}

function RemoteStation({ roomId, role }: { roomId: string; role: "presentation" | "translation" }) {
  const [text, setText] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [screenMode, setScreenMode] = useState(false);
  const captionScreenRef = useRef<HTMLDivElement | null>(null);
  const { connected, participants, error, start, stop, sendCaption } = useBroadcastSession(roomId);
  const roleText = role === "presentation" ? "ภาพพรีเซนต์" : "คำบรรยายแปล";

  useEffect(() => {
    if (role !== "translation" || !screenMode || !connected) return undefined;
    const timer = window.setTimeout(() => sendCaption(text.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [connected, role, screenMode, sendCaption, text]);

  const updateText = (value: string) => {
    setText(value.slice(0, 320));
    sendCaption(value.slice(0, 320));
  };

  const startSharing = async () => {
    setStarting(true);
    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 24 }, audio: false });
      setStream(nextStream);
      for (const track of nextStream.getTracks()) {
        track.addEventListener("ended", () => {
          setStream(null);
          setScreenMode(false);
        }, { once: true });
      }
      await start(role, nextStream);
      setScreenMode(true);
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name !== "NotAllowedError") {
        window.alert("เปิดแชร์จอไม่สำเร็จ กรุณาอนุญาตการแชร์หน้าจอแล้วลองอีกครั้ง");
      }
    } finally {
      setStarting(false);
    }
  };

  const stopSharing = () => {
    stop();
    setStream(null);
    setScreenMode(false);
  };

  const enterFullscreen = () => {
    void captionScreenRef.current?.requestFullscreen?.();
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}?view=${role}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (role === "translation" && screenMode) {
    return (
    <main className="relay-translation-screen relay-translation-share-mode">
        <div className="relay-translation-topline"><span className="relay-live-dot" /><span>LIVE TRANSLATION</span><span className="relay-screen-room">{roomId.slice(0, 8).toUpperCase()}</span></div>
        <div className="relay-translation-canvas relay-translation-edit-canvas" ref={captionScreenRef}>
          <div className="relay-translation-caption" lang="th" role="textbox" aria-label="ข้อความคำแปลที่กำลังแชร์" contentEditable suppressContentEditableWarning onInput={(event) => updateText(event.currentTarget.innerText)}>{text || "คลิกตรงนี้แล้วพิมพ์คำแปล"}</div>
        </div>
        <StationFooter connected={connected} roleText={roleText} stopSharing={stopSharing} />
      </main>
    );
  }

  return (
    <main className={`relay-station relay-station-${role}`}>
      <header className="relay-station-header">
        <Link to="/" className="relay-brand relay-brand-inverse" aria-label="กลับหน้าหลัก"><span className="relay-brand-mark"><RadioTower size={18} /></span><span>canvas<span className="relay-brand-light">relay</span></span></Link>
        <div className="relay-station-status"><span className={connected ? "relay-live-dot" : "relay-status-wait"} /> {connected ? "เชื่อมต่อห้องแล้ว" : "เตรียมอุปกรณ์"}</div>
      </header>
      <div className="relay-station-content">
        {role === "presentation" ? (
          <>
            <div className="relay-station-kicker"><FileVideo2 size={15} /> PRESENTATION INPUT</div>
            <h1 className="relay-station-title">จอพรีเซนต์<br /><em>พร้อมส่งภาพ</em></h1>
            <div className="relay-presentation-preview">
              {stream ? <video className="relay-self-preview" autoPlay muted playsInline ref={(element) => { if (element && element.srcObject !== stream) element.srcObject = stream; }} /> : <div className="relay-presentation-placeholder"><MonitorUp size={38} /><span>แชร์สไลด์หรือหน้าต่างพรีเซนต์</span></div>}
            </div>
            <div className="relay-station-actions">
              <Button className="relay-stage-button" disabled={starting} onClick={stream ? stopSharing : startSharing}>{starting ? <LoaderCircle className="relay-spin" size={17} /> : stream ? <CircleStop size={17} /> : <MonitorUp size={17} />}{starting ? "กำลังเชื่อมต่อ" : stream ? "หยุดแชร์หน้าจอ" : "เลือกจอที่จะแชร์"}</Button>
              <Button variant="outline" className="relay-copy-invite" onClick={() => void copyInvite()}>{copied ? <Check size={16} /> : <Share2 size={16} />} {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เข้าห้อง"}</Button>
            </div>
            <p className="relay-station-footnote">เลือกทั้งหน้าจอหรือเฉพาะหน้าต่างสไลด์ จากนั้นคงแท็บนี้ไว้ระหว่างการนำเสนอ</p>
            <StationConnections connected={connected} participants={participants.length} error={error} />
          </>
        ) : (
          <>
            <div className="relay-station-kicker"><Languages size={15} /> TRANSLATION INPUT</div>
            <div className="relay-translation-editor-title flex items-end justify-between gap-4">
              <div><h1 className="relay-station-title">คำบรรยาย<br /><em>แปลสด</em></h1></div>
              <Button variant="ghost" className="relay-icon-action" onClick={enterFullscreen} title="ขยายจอแปล" aria-label="ขยายจอแปล"><Expand size={17} /></Button>
            </div>
            <div className="relay-translation-output" ref={captionScreenRef}>
              <div className="relay-translation-live-indicator"><span className={connected ? "relay-live-dot" : "relay-status-wait"} /> {connected ? "LIVE CAPTION" : "READY"}</div>
              <p className="relay-translation-caption" lang="th">{text || "คำแปลของคุณจะปรากฏตรงนี้"}</p>
              <button type="button" className="relay-output-expand" onClick={enterFullscreen} aria-label="เปิดข้อความเต็มจอ"><Expand size={17} /></button>
            </div>
            <label className="relay-overline-small" htmlFor="translation-text">ข้อความแปล</label>
            <textarea id="translation-text" value={text} onChange={(event) => updateText(event.target.value)} placeholder="พิมพ์หรือวางคำแปลของคุณ..." maxLength={320} className="relay-translation-input" />
            <div className="relay-station-actions">
              <Button className="relay-stage-button" disabled={starting} onClick={stream ? stopSharing : startSharing}>{starting ? <LoaderCircle className="relay-spin" size={17} /> : stream ? <CircleStop size={17} /> : <MonitorUp size={17} />}{starting ? "กำลังเชื่อมต่อ" : stream ? "หยุดแชร์หน้าจอ" : "แชร์จอคำบรรยาย"}</Button>
              <Button variant="outline" className="relay-copy-invite" onClick={() => void copyInvite()}>{copied ? <Check size={16} /> : <Share2 size={16} />} {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เข้าห้อง"}</Button>
            </div>
            <p className="relay-station-footnote">เปิดแชร์แท็บนี้จากหน้าต่างที่มีคำบรรยาย เพื่อส่งภาพข้อความพื้นดำไปยังเวที</p>
            <StationConnections connected={connected} participants={participants.length} error={error} />
          </>
        )}
      </div>
      <footer className="relay-station-footer"><span>ROOM <b>{roomId.slice(0, 8).toUpperCase()}</b></span><span>PEER-TO-PEER BROADCAST</span></footer>
    </main>
  );
}

function StationConnections({ connected, participants, error }: { connected: boolean; participants: number; error: string }) {
  return (
    <div className="relay-station-connection">
      <span className={`relay-connection-light${connected ? " is-online" : ""}`} />
      <span>{connected ? `${participants} เครื่องเชื่อมต่อห้องแล้ว` : "รอห้องควบคุมเชื่อมต่อ"}</span>
      {error && <span className="relay-connection-error">{error}</span>}
    </div>
  );
}

function StationFooter({ connected, roleText, stopSharing }: { connected: boolean; roleText: string; stopSharing: () => void }) {
  return <footer className="relay-translation-footbar"><span><span className={connected ? "relay-live-dot" : "relay-status-wait"} /> {roleText} · {connected ? "กำลังถ่ายทอด" : "ยังไม่เชื่อมต่อ"}</span><Button variant="ghost" className="relay-icon-action" onClick={stopSharing} title="หยุดแชร์หน้าจอ" aria-label="หยุดแชร์หน้าจอ"><CircleStop size={17} /></Button></footer>;
}

type LayerName = "presentation" | "translation";
type OverlayGeometry = { x: number; y: number; width: number; height: number; cropX: number; cropY: number };
const DEFAULT_GEOMETRY: OverlayGeometry = { x: 62, y: 68, width: 31, height: 24, cropX: 50, cropY: 50 };

function DirectorRoom({ roomId, stageOnly }: { roomId: string; stageOnly: boolean }) {
  const [layer, setLayer] = useState<LayerName>("translation");
  const [visible, setVisible] = useState(true);
  const [geometry, setGeometry] = useState<OverlayGeometry>(DEFAULT_GEOMETRY);
  const [fontScale, setFontScale] = useState(50);
  const [copied, setCopied] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [activeDrag, setActiveDrag] = useState(false);
  const [screenStreams, setScreenStreams] = useState<Record<LayerName, MediaStream | null>>({ presentation: null, translation: null });
  const [speakers, setSpeakers] = useState<Array<{ role: BroadcastRole; stream: MediaStream }>>([]);
  const [fitPreview, setFitPreview] = useState(false);
  const [pointerOffset, setPointerOffset] = useState<{ x: number; y: number; mode: "move" | "resize"; width: number; height: number; startX: number; startY: number } | null>(null);
  const [mobileTools, setMobileTools] = useState(false);
  const [liveError, setLiveError] = useState("");
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageVideoRef = useRef<HTMLVideoElement | null>(null);

  const session = useBroadcastSession(roomId);
  const participants = session.participants;
  const caption = session.caption;
  const error = session.error || liveError;

  useEffect(() => {
    void session.start(stageOnly ? "translation-display" : "director");
    return () => session.stop();
  }, [roomId, stageOnly, session.start, session.stop]);

  useEffect(() => {
    setSpeakers(participants.flatMap((participant) => participant.stream
      ? [{ role: participant.role, stream: participant.stream }]
      : []));
  }, [participants]);

  useEffect(() => {
    const keys = ["presentation", "translation"] as const;
    const next = Object.fromEntries(keys.map((role) => [
      role,
      speakers.find((speaker) => speaker.role === role)?.stream ?? null,
    ])) as Record<LayerName, MediaStream | null>;
    setScreenStreams((current) => current.presentation === next.presentation && current.translation === next.translation ? current : next);
  }, [speakers]);

  const presentation = screenStreams.presentation;
  const translation = screenStreams.translation;
  const selectedStream = layer === "presentation" ? presentation : translation;
  const imageStream = layer === "presentation" ? presentation : translation;
  const remoteRoleStatus = (role: LayerName) => participants.some((participant) => participant.role === role && participant.stream);

  useEffect(() => {
    const video = stageVideoRef.current;
    if (video && video.srcObject !== imageStream) video.srcObject = imageStream ?? null;
  }, [imageStream]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
      if (event.key.toLowerCase() === "f" && !stageOnly && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") toggleFullscreen();
    };
    const onFullscreen = () => setFullScreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [stageOnly]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (stageRef.current) {
      void stageRef.current.requestFullscreen();
    }
  };

  const setMode = (nextLayer: LayerName) => {
    setLayer(nextLayer);
    setGeometry((current) => nextLayer === "translation"
      ? { ...current, x: 62, y: 68 }
      : { ...current, x: 65, y: 15, width: 28, height: 25 });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stageOnly || !visible) return;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const localX = (event.clientX - stage.left) / stage.width * 100;
    const localY = (event.clientY - stage.top) / stage.height * 100;
    setPointerOffset({ x: localX - geometry.x, y: localY - geometry.y, mode: "move", width: geometry.width, height: geometry.height, startX: event.clientX, startY: event.clientY });
    setActiveDrag(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerOffset || !stageRef.current) return;
    const stage = stageRef.current.getBoundingClientRect();
    if (pointerOffset.mode === "resize") {
      setGeometry((current) => ({
        ...current,
        width: clamp(pointerOffset.width + (event.clientX - pointerOffset.startX) / stage.width * 100, 12, Math.min(90, 100 - current.x)),
        height: clamp(pointerOffset.height + (event.clientY - pointerOffset.startY) / stage.height * 100, 12, Math.min(70, 100 - current.y)),
      }));
      return;
    }
    setGeometry((current) => ({
      ...current,
      x: clamp((event.clientX - stage.left) / stage.width * 100 - pointerOffset.x, 0, 100 - current.width),
      y: clamp((event.clientY - stage.top) / stage.height * 100 - pointerOffset.y, 0, 100 - current.height),
    }));
  };

  const handlePointerEnd = () => { setPointerOffset(null); setActiveDrag(false); };

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointerOffset({ x: 0, y: 0, mode: "resize", width: geometry.width, height: geometry.height, startX: event.clientX, startY: event.clientY });
    setActiveDrag(true);
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerOffset || !stageRef.current || pointerOffset.mode !== "resize") return;
    const stage = stageRef.current.getBoundingClientRect();
    setGeometry((current) => ({
      ...current,
      width: clamp(pointerOffset.width + (event.clientX - pointerOffset.startX) / stage.width * 100, 12, Math.min(90, 100 - current.x)),
      height: clamp(pointerOffset.height + (event.clientY - pointerOffset.startY) / stage.height * 100, 12, Math.min(70, 100 - current.y)),
    }));
  };

  const setGeometryValue = (key: "width" | "height" | "cropX" | "cropY", value: number) => {
    setGeometry((current) => ({
      ...current,
      [key]: value,
      ...(key === "width" ? { x: Math.min(current.x, 100 - value) } : {}),
      ...(key === "height" ? { y: Math.min(current.y, 100 - value) } : {}),
    }));
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setLiveError("คัดลอกลิงก์ไม่สำเร็จ โปรดคัดลอกจากแถบที่อยู่โดยตรง");
    }
  };

  const shareWindow = (view: RoomView) => `${window.location.origin}/room/${roomId}?view=${view}`;

  const layerActions = { presentation, translation };
  const variableGeometry: React.CSSProperties = {
    "--layer-left": `${geometry.x}%`,
    "--layer-top": `${geometry.y}%`,
    "--layer-width": `${geometry.width}%`,
    "--layer-height": `${geometry.height}%`,
  } as React.CSSProperties;
  const cropPosition = `${geometry.cropX}% ${geometry.cropY}%`;

  if (stageOnly) {
    return (
      <main ref={stageRef} className="relay-audience-stage" onTouchStart={(event) => {
        const startX = event.touches[0]?.clientX ?? 0;
        const end = (changed: TouchEvent) => {
          const delta = (changed.changedTouches[0]?.clientX ?? startX) - startX;
          if (Math.abs(delta) > 70) setMode(delta < 0 ? "translation" : "presentation");
          window.removeEventListener("touchend", end);
        };
        window.addEventListener("touchend", end, { once: true });
      }}>
        <StageVideo stream={presentation ?? null} videoRef={stageVideoRef} fit={fitPreview} />
        {!presentation && <StagePlaceholder />}
        {visible && (imageStream || caption) && (
          <div className={`relay-floating-layer ${imageStream ? "has-shared-screen" : "has-translation"}`} style={variableGeometry}>
            {imageStream && <video className="relay-layer-video" ref={(element) => { if (element && element.srcObject !== imageStream) element.srcObject = imageStream; }} autoPlay muted playsInline style={{ objectPosition: cropPosition }} />}
            {layer === "presentation" && caption && <div className="relay-layer-caption" style={{ "--caption-scale": String(fontScale / 50) } as React.CSSProperties}>{caption}</div>}
          </div>
        )}
        <Button variant="ghost" className="relay-audience-fullscreen" onClick={toggleFullscreen} title="เปิดเต็มจอ" aria-label="เปิดเต็มจอ"><Expand size={19} /></Button>
      </main>
    );
  }

  return (
    <main className={`relay-director ${fullScreen ? "relay-director-is-fullscreen" : ""}`}>
      <header className="relay-director-topbar">
        <Link to="/" className="relay-brand" aria-label="กลับหน้าหลัก"><span className="relay-brand-mark"><RadioTower size={17} /></span><span>canvas<span className="relay-brand-light">relay</span></span></Link>
        <div className="relay-room-topbar-middle"><span className={`relay-live-dot${session.connected ? "" : " relay-dot-muted"}`} /><span>{session.connected ? "ห้องถ่ายทอดสด" : "เชื่อมต่อห้อง"}</span><span className="relay-room-separator">/</span><span>{roomId.slice(0, 8).toUpperCase()}</span></div>
        <div className="relay-director-top-actions">
          <span className="relay-participant-count"><Users size={15} /> {participants.filter((participant) => participant.stream).length}</span>
          <Button asChild variant="outline" className="relay-share-room-btn"><a href={shareWindow("stage")} target="_blank" rel="noreferrer"><Expand size={15} /> เปิดจอฉาย</a></Button>
          <Button className="relay-director-present" onClick={() => void navigate({ to: "/room/$roomId", params: { roomId }, search: { view: "stage" } })}><Expand size={16} /> จอฉาย</Button>
        </div>
      </header>

      <div className="relay-director-body">
        <section className="relay-stage-workspace">
          <div className="relay-stage-header flex items-center justify-between gap-3">
            <div><span className="relay-overline-small">LIVE COMPOSITION</span><h1>จัดภาพบนเวที</h1></div>
            <div className="relay-stage-quick-actions">
              <Button variant="ghost" className="relay-stage-action" onClick={() => setVisible((current) => !current)} title={visible ? "ซ่อนคำบรรยาย" : "แสดงคำบรรยาย"} aria-label={visible ? "ซ่อนคำบรรยาย" : "แสดงคำบรรยาย"}>{visible ? <Eye size={16} /> : <EyeOff size={16} />} <span>{visible ? "แสดงคำบรรยาย" : "ซ่อนคำบรรยาย"}</span></Button>
              <Button variant="ghost" className="relay-icon-action" title="เต็มจอ (F)" aria-label="เปิดเวทีเต็มจอ" onClick={toggleFullscreen}><Expand size={16} /></Button>
            </div>
          </div>

          <div className="relay-composition-shell">
            <div className={`relay-composition${fullScreen ? " relay-composition-is-fullscreen" : ""}`} ref={stageRef}>
              <StageVideo stream={presentation} fit={fitPreview} videoRef={stageVideoRef} />
              {!presentation && <StagePlaceholder />}
              <div className="relay-stage-safe-frame" aria-hidden="true" />
              {visible && (selectedStream || caption) && (
                <div
                  className={`relay-floating-layer ${activeDrag ? "is-dragging" : ""} ${selectedStream ? "has-shared-screen" : "has-translation"}`}
                  style={variableGeometry}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                >
                    {selectedStream && <video className="relay-layer-video" ref={(element) => { if (element && element.srcObject !== selectedStream) element.srcObject = selectedStream; }} autoPlay muted playsInline style={{ objectPosition: cropPosition }} />}
                  {!selectedStream && caption && <div className="relay-caption-overlay" lang="th">{caption}</div>}
                    {selectedStream && layer === "presentation" && caption && <div className="relay-layer-caption" style={{ "--caption-scale": String(fontScale / 50) } as React.CSSProperties}>{caption}</div>}
                  {!stageOnly && <div className="relay-layer-tools"><span><Move size={13} /> ลากเพื่อย้าย</span><span className="relay-layer-grip" title="ลากขอบเพื่อปรับขนาด"><Crop size={13} /></span></div>}
                  {!stageOnly && <button type="button" className="relay-layer-resize" aria-label="ปรับขนาดกรอบ" onPointerDown={handleResizePointerDown} onPointerMove={handleResizePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd} />}
                </div>
              )}
              {!presentation && !selectedStream && !caption && <div className="relay-stage-empty-message"><span><RadioTower size={20} /></span><div><b>เวทีพร้อมถ่ายทอด</b><small>ส่งลิงก์ให้สองเครื่อง เพื่อเริ่มแชร์ภาพ</small></div></div>}
              <div className="relay-composition-chrome"><span><span className="relay-live-dot" /> LIVE</span><span>{roomId.slice(0, 8).toUpperCase()}</span></div>
            </div>
          </div>

          <div className="relay-stage-statusline">
            <div><span className={`relay-connection-light${remoteRoleStatus("presentation") ? " is-online" : ""}`} /><span>จอพรีเซนต์</span><b>{remoteRoleStatus("presentation") ? "LIVE" : "รอจอ"}</b></div>
            <span className="relay-status-separator" />
            <div><span className={`relay-connection-light${remoteRoleStatus("translation") ? " is-online" : ""}`} /><span>จอคำแปล</span><b>{remoteRoleStatus("translation") ? "LIVE" : "รอจอ"}</b></div>
            <Button variant="ghost" className="relay-icon-action" title="ปรับขนาดภาพให้พอดี" aria-label="ปรับขนาดภาพให้พอดี" onClick={() => setFitPreview((value) => !value)}><Crop size={15} /></Button>
          </div>

          {error && <p className="relay-error-notice" role="status">{error}</p>}

          <div className="relay-phone-controls-trigger"><Button variant="outline" className="relay-phone-tools" onClick={() => setMobileTools((value) => !value)}><Settings2 size={16} /> จัดการภาพและลิงก์ <ChevronDown size={15} /></Button></div>
        </section>

        <aside className={`relay-control-panel ${mobileTools ? "relay-control-panel-open" : ""}`}>
          <div className="relay-panel-heading"><div><span className="relay-overline-small">CONTROL ROOM</span><h2>จัดการเลเยอร์</h2></div><Button variant="ghost" className="relay-panel-close" aria-label="ปิดเมนูควบคุม" onClick={() => setMobileTools(false)}><X size={17} /></Button></div>

          <section className="relay-panel-section relay-share-section">
            <div className="relay-panel-section-title"><span>01</span><h3>เชื่อมต่อจอ</h3></div>
            <ShareControlCard number="A" role="presentation" isConnected={Boolean(presentation)} href={shareWindow("presentation")} copy={() => void copyLink(shareWindow("presentation"))} />
            <ShareControlCard number="B" role="translation" isConnected={Boolean(translation)} href={shareWindow("translation")} copy={() => void copyLink(shareWindow("translation"))} />
          </section>

          <section className="relay-panel-section relay-inputs-section">
            <div className="relay-panel-section-title"><span>02</span><h3>แหล่งภาพซ้อน</h3></div>
            <div className="relay-layer-select" role="group" aria-label="เลือกภาพซ้อน">
              <Button variant="ghost" className={`relay-layer-select-button ${layer === "presentation" ? "is-selected" : ""}`} onClick={() => setMode("presentation")}><FileVideo2 size={16} /><span>ภาพพรีเซนต์</span><span className={presentation ? "relay-source-live" : "relay-source-idle"} /></Button>
              <Button variant="ghost" className={`relay-layer-select-button ${layer === "translation" ? "is-selected" : ""}`} onClick={() => setMode("translation")}><Languages size={16} /><span>คำบรรยายแปล</span><span className={translation ? "relay-source-live" : "relay-source-idle"} /></Button>
            </div>
            <div className="relay-translation-live-copy"><span>ข้อความแปลล่าสุด</span><p lang="th">{caption || "ยังไม่มีข้อความแปลเข้ามา"}</p></div>
          </section>

          <section className="relay-panel-section relay-controls-section">
            <div className="relay-panel-section-title"><span>03</span><h3>จัดตำแหน่ง</h3></div>
            <div className="relay-position-instruction"><Move size={15} /><span>ลากกรอบบนเวทีเพื่อย้ายตำแหน่ง</span></div>
            <ControlSlider label="ความกว้าง" value={geometry.width} onChange={(value) => setGeometryValue("width", value)} />
            <ControlSlider label="ความสูง" value={geometry.height} onChange={(value) => setGeometryValue("height", value)} />
            <ControlSlider label="ครอปแนวนอน" value={geometry.cropX} onChange={(value) => setGeometryValue("cropX", value)} />
            <ControlSlider label="ครอปแนวตั้ง" value={geometry.cropY} onChange={(value) => setGeometryValue("cropY", value)} />
            <div className="relay-control-tool-row">
              <button type="button" className="relay-fit-toggle" onClick={() => setFitPreview((value) => !value)}><Crop size={14} /><span>{fitPreview ? "พอดีกรอบ" : "ครอปภาพ"}</span></button>
              <ControlSlider label="ขนาดตัวอักษร" value={fontScale} min={25} max={90} onChange={setFontScale} icon={<Type size={14} />} />
            </div>
          </section>

          <section className="relay-panel-section relay-caption-share-section">
            <div className="relay-director-caption-row"><Languages size={15} /><div><span>ข้อความคำแปล</span><b>{caption ? "มีข้อความถ่ายทอด" : "รอข้อความจากผู้แปล"}</b></div><span className={`relay-connection-light${caption ? " is-online" : ""}`} /></div>
            <Button variant="ghost" className="relay-add-layer" onClick={() => setVisible((current) => !current)} disabled={!layerActions[layer]}>{visible ? <EyeOff size={14} /> : <Eye size={14} />} {visible ? "ซ่อนภาพซ้อน" : "แสดงภาพซ้อน"}</Button>
          </section>

          <footer className="relay-panel-footer"><span><LockIcon /> ข้อมูลภาพส่งตรงระหว่างเครื่อง</span><a href={shareWindow("stage")} target="_blank" rel="noreferrer">เปิดหน้าจอฉาย <Link2 size={13} /></a></footer>
        </aside>
      </div>
    </main>
  );
}

function StageVideo({ stream, videoRef, fit }: { stream: MediaStream | null; videoRef: React.MutableRefObject<HTMLVideoElement | null>; fit: boolean }) {
  return (
    <video
      className={`relay-stage-video${fit ? " is-fitted" : ""}`}
      ref={(element) => {
        if (videoRef) videoRef.current = element;
        if (element && element.srcObject !== stream) element.srcObject = stream;
      }}
      autoPlay
      muted
      playsInline
      aria-label="ภาพจากจอพรีเซนต์"
    />
  );
}

function StagePlaceholder() {
  return <div className="relay-stage-placeholder"><div className="relay-placeholder-corner relay-placeholder-top-left" /><div className="relay-placeholder-corner relay-placeholder-bottom-right" /><span className="relay-placeholder-mark"><RadioTower size={21} /></span><p>ภาพเวทีแสดงตรงนี้</p><span className="relay-placeholder-subtitle">ส่งลิงก์ให้เครื่องพรีเซนต์เพื่อเริ่มถ่ายทอด</span></div>;
}

function ShareControlCard({ number, role, isConnected, href, copy }: { number: string; role: "presentation" | "translation"; isConnected: boolean; href: string; copy: () => void }) {
  const title = role === "presentation" ? "จอพรีเซนต์" : "จอคำบรรยาย";
  return (
    <div className="relay-share-control">
      <span className="relay-share-control-number">{number}</span><span className="relay-share-control-mark">{role === "presentation" ? <FileVideo2 size={15} /> : <Languages size={15} />}</span>
      <div className="relay-share-control-info"><strong>{title}</strong><small>{isConnected ? "กำลังส่งภาพ" : role === "presentation" ? "แชร์สไลด์" : "พิมพ์คำแปลและแชร์จอ"}</small></div>
      <span className={`relay-connection-light${isConnected ? " is-online" : ""}`} />
      <Button asChild variant="ghost" size="icon" title={`เปิดลิงก์${title}`}><a href={href} target="_blank" rel="noreferrer" aria-label={`เปิดลิงก์${title}`}><Link2 size={15} /></a></Button>
      <Button variant="ghost" size="icon" title={`คัดลอกลิงก์${title}`} onClick={copy} aria-label={`คัดลอกลิงก์${title}`}><Share2 size={15} /></Button>
    </div>
  );
}

function ControlSlider({ label, value, onChange, min = 12, max = 55, icon }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; icon?: React.ReactNode }) {
  return (
    <div className="relay-slider-control"><label>{icon}{label}<span>{Math.round(value)}%</span></label><Slider min={min} max={max} step={1} value={[value]} onValueChange={(values) => { const next = values[0]; if (next !== undefined) onChange(next); }} aria-label={label} /></div>
  );
}

function LockIcon() {
  return <span aria-label="เชื่อมต่อโดยตรง" className="relay-privacy-mark"><Check size={11} /></span>;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}