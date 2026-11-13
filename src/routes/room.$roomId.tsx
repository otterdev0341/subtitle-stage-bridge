import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpDown, BringToFront, Check, ChevronDown, CircleStop, Crop, Expand, Eye, EyeOff, FileVideo2, Languages, Layers, Link2, LoaderCircle, MonitorUp, Pencil, RadioTower, Save, SendToBack, Settings2, Share2, Trash2, Type, ImagePlus, Sun, ZoomIn, Users, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useBroadcastSession } from "@/lib/use-broadcast-session";
import { uploadHoldImage as uploadHoldImageFn } from "@/lib/hold-images.functions";
import { StageCanvas } from "@/components/stage/StageCanvas";
import { HoldSlide } from "@/components/stage/HoldSlide";
import { TemplatePreview } from "@/components/stage/TemplatePreview";
import { ASPECT_PRESETS, BUILT_IN_TEMPLATES, HOLD_KEY, HOLD_IMG_KEY, applyArrangement, type Arrangement, HOLD_IMAGE_MAX_BYTES, HOLD_IMAGE_TYPES, applyTemplate, bringToFront, defaultLayout, deleteTemplate, loadTemplates, saveTemplate, sendToBack, swapOrder, TRANSITIONS, type TransitionKind, type HoldSlideId, type HoldTarget, type LayerName, type LayerRect, type StageLayout, type StageTemplate } from "@/lib/stage-layout";
import { roomInviteUrl, roomPath } from "@/lib/room-links";

type RoomView = "director" | "presentation" | "translation" | "stage";

export const Route = createFileRoute("/room/$roomId")({
  validateSearch: (search: Record<string, unknown>): { view: RoomView } => ({
    view: search["view"] === "presentation" || search["view"] === "translation" || search["view"] === "stage" ? (search["view"] as RoomView) : "director",
  }),
  head: ({ params }) => ({
    meta: [
      { title: `ห้อง ${params.roomId.slice(0, 8)} — Botnoi Live Relay` },
      { name: "description", content: "เชื่อมภาพพรีเซนต์กับคำบรรยายสดและปรับตำแหน่งได้แบบเรียลไทม์" },
      { property: "og:title", content: `ห้องถ่ายทอดสด — Botnoi Live Relay` },
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
    if (role !== "translation" || !connected) return undefined;
    const timer = window.setTimeout(() => sendCaption(text.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [connected, role, sendCaption, text]);

  const updateText = (value: string) => {
    setText(value.slice(0, 320));
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
    await navigator.clipboard.writeText(roomInviteUrl(window.location.origin, roomId, role));
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

type PanelTab = "connect" | "layer" | "stage" | "hold";
const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "connect", label: "เชื่อมต่อ" }, { id: "layer", label: "ปรับจอ" }, { id: "stage", label: "เทมเพลต" }, { id: "hold", label: "พักจอ" },
];

function DirectorRoom({ roomId, stageOnly }: { roomId: string; stageOnly: boolean }) {
  const [layout, setLayout] = useState<StageLayout>(defaultLayout);
  const [copied, setCopied] = useState<RoomView | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [mobileTools, setMobileTools] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [templates, setTemplates] = useState<StageTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [holdTarget, setHoldTarget] = useState<HoldTarget>("stage");
  const [editingHold, setEditingHold] = useState<HoldSlideId | null>(null);
  const [tab, setTab] = useState<PanelTab>("connect");
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const session = useBroadcastSession(roomId);
  const participants = session.participants;
  const caption = session.caption;
  const error = session.error || liveError;

  useEffect(() => {
    setTemplates(loadTemplates(window.localStorage));
    try {
      const saved = JSON.parse(window.localStorage.getItem(HOLD_KEY) ?? "null");
      if (saved) setLayout((l) => ({ ...l, holdTexts: { ...l.holdTexts, ...saved } }));
      const imgs = JSON.parse(window.localStorage.getItem(HOLD_IMG_KEY) ?? "null");
      if (imgs) setLayout((l) => ({ ...l, holdImages: imgs }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (stageOnly && session.layout && "layers" in session.layout) setLayout(session.layout);
  }, [stageOnly, session.layout]);

  useEffect(() => {
    void session.start(stageOnly ? "translation-display" : "director");
    return () => session.stop();
  }, [roomId, stageOnly, session.start, session.stop]);

  useEffect(() => {
    if (!stageOnly) session.sendLayout(layout);
  }, [stageOnly, layout, session.sendLayout]);

  const streams: Record<LayerName, MediaStream | null> = {
    presentation: participants.find((p) => p.role === "presentation" && p.stream)?.stream ?? null,
    translation: participants.find((p) => p.role === "translation" && p.stream)?.stream ?? null,
  };

  useEffect(() => {
    const onFullscreen = () => setFullScreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  };

  const active = layout.activeLayer;
  const activeRect = layout.layers[active];
  const updateLayer = (name: LayerName, patch: Partial<LayerRect>) => setLayout((l) => ({ ...l, layers: { ...l.layers, [name]: { ...l.layers[name], ...patch } } }));
  const select = (name: LayerName) => setLayout((l) => ({ ...l, activeLayer: name }));
  const setHold = (id: HoldSlideId | null) => setLayout((l) => ({ ...l, hold: id ? { id, target: holdTarget } : null }));
  const [uploading, setUploading] = useState<HoldSlideId | null>(null);
  const [uploadError, setUploadError] = useState("");
  const setHoldImage = (id: HoldSlideId, url: string | null) => setLayout((l) => {
    const holdImages = { ...(l.holdImages ?? {}) };
    if (url) holdImages[id] = url; else delete holdImages[id];
    window.localStorage.setItem(HOLD_IMG_KEY, JSON.stringify(holdImages));
    return { ...l, holdImages };
  });
  const uploadHoldImage = async (id: HoldSlideId, file: File | undefined) => {
    if (!file) return;
    setUploadError("");
    if (!HOLD_IMAGE_TYPES.includes(file.type)) { setUploadError("รองรับเฉพาะไฟล์ PNG, JPG หรือ WebP"); return; }
    if (file.size > HOLD_IMAGE_MAX_BYTES) { setUploadError("ไฟล์ใหญ่เกิน 5 MB"); return; }
    setUploading(id);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const data = await uploadHoldImageFn({ data: { roomId, slide: id, type: file.type as "image/png", data: btoa(bin) } });
      setHoldImage(id, data.url);
    } catch { setUploadError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setUploading(null); }
  };
  const arrange = (patch: Partial<Pick<StageLayout, "arrangement" | "split" | "splitSwap">>) => setLayout((l) => applyArrangement({ ...l, ...patch }));
  const arrangement: Arrangement = layout.arrangement ?? "overlay";
  const ARRANGEMENTS: Array<[Arrangement, string]> = [["overlay", "ซ้อนทับ"], ["stack", "บน-ล่าง"], ["side", "ซ้าย-ขวา"]];
  const toggleLayer = (name: LayerName) => setLayout((l) => ({ ...l, layers: { ...l.layers, [name]: { ...l.layers[name], visible: !l.layers[name].visible } } }));
  const setHoldText = (id: HoldSlideId, key: "title" | "subtitle", value: string) => setLayout((l) => {
    const holdTexts = { ...l.holdTexts, [id]: { ...l.holdTexts[id], [key]: value } };
    window.localStorage.setItem(HOLD_KEY, JSON.stringify(holdTexts));
    return { ...l, holdTexts };
  });

  useEffect(() => {
    if (stageOnly) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, HoldSlideId | null> = { "1": "wait", "2": "title", "3": "technical", "0": null };
      if (e.key === "h" || e.key === "H") { e.preventDefault(); toggleLayer("translation"); return; }
      if (e.key === "p" || e.key === "P") { e.preventDefault(); toggleLayer("presentation"); return; }
      if (e.key in map) { e.preventDefault(); setLayout((l) => ({ ...l, hold: map[e.key] ? { id: map[e.key]!, target: holdTarget } : null })); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stageOnly, holdTarget]);

  const copyLink = async (view: RoomView) => {
    try {
      await navigator.clipboard.writeText(roomInviteUrl(window.location.origin, roomId, view));
      setCopied(view);
      window.setTimeout(() => setCopied((current) => current === view ? null : current), 1800);
    } catch {
      setLiveError("คัดลอกลิงก์ไม่สำเร็จ โปรดคัดลอกจากแถบที่อยู่โดยตรง");
    }
  };
  const shareWindow = (view: RoomView) => roomPath(roomId, view);

  if (stageOnly) {
    return (
      <main className="relay-audience-stage">
        <StageCanvas layout={layout} streams={streams} caption={caption} editable={false} stageRef={stageRef} className="relay-stage-frame-audience" />
        <Button variant="ghost" className="relay-audience-fullscreen" onClick={toggleFullscreen} title="เปิดเต็มจอ" aria-label="เปิดเต็มจอ"><Expand size={19} /></Button>
      </main>
    );
  }

  const isCustomAspect = !ASPECT_PRESETS.some((p) => p.w === layout.aspect.w && p.h === layout.aspect.h);
  const allTemplates = [...BUILT_IN_TEMPLATES, ...templates];

  return (
    <main className={`relay-director ${fullScreen ? "relay-director-is-fullscreen" : ""}`}>
      <header className="relay-director-topbar">
        <Link to="/" className="relay-brand" aria-label="กลับหน้าหลัก"><span className="relay-brand-mark"><RadioTower size={17} /></span><span>botnoi live<span className="relay-brand-light"> relay</span></span></Link>
        <div className="relay-room-topbar-middle"><span className={`relay-live-dot${session.connected ? "" : " relay-dot-muted"}`} /><span>{session.connected ? "ห้องถ่ายทอดสด" : "เชื่อมต่อห้อง"}</span><span className="relay-room-separator">/</span><span>{roomId.slice(0, 8).toUpperCase()}</span></div>
        <div className="relay-director-top-actions">
          <span className="relay-participant-count"><Users size={15} /> {participants.filter((p) => p.stream).length}</span>
          <Button asChild variant="outline" className="relay-share-room-btn"><a href={shareWindow("stage")} target="_blank" rel="noreferrer"><Expand size={15} /> เปิดจอฉาย</a></Button>
          <Button className="relay-director-present" onClick={() => void navigate({ to: "/room/$roomId", params: { roomId }, search: { view: "stage" } })}><Expand size={16} /> จอฉาย</Button>
        </div>
      </header>

      <div className="relay-director-body">
        <section className="relay-stage-workspace">
          <div className="relay-stage-header flex items-center justify-between gap-3">
            <div><span className="relay-overline-small">LIVE COMPOSITION · {layout.aspect.w}×{layout.aspect.h}</span><h1>จัดภาพบนเวที</h1></div>
            <div className="relay-stage-quick-actions">
              <div className="relay-ab-switch" role="group" aria-label="เลือกจอที่จะปรับ">
                <button type="button" className={`relay-ab-chip relay-ab-a${active === "presentation" ? " is-active" : ""}`} onClick={() => select("presentation")}>A · สไลด์</button>
                <button type="button" className={`relay-ab-chip relay-ab-b${active === "translation" ? " is-active" : ""}`} onClick={() => select("translation")}>B · คำแปล</button>
              </div>
              <Button variant="ghost" className="relay-stage-action" onClick={() => setLayout((l) => ({ ...l, layers: swapOrder(l.layers) }))} title="สลับหน้า-หลัง"><ArrowUpDown size={15} /> <span>สลับ A↔B</span></Button>
              <Button variant="ghost" className="relay-icon-action" title="เต็มจอ" aria-label="เปิดเวทีเต็มจอ" onClick={toggleFullscreen}><Expand size={16} /></Button>
            </div>
          </div>

          <div className="relay-composition-shell">
            <StageCanvas layout={layout} streams={streams} caption={caption} editable stageRef={stageRef} onSelect={select} onChangeLayer={(name, rect) => updateLayer(name, rect)}>
              <div className="relay-composition-chrome"><span><span className="relay-live-dot" /> {layout.hold ? "พักจอ" : "LIVE"}</span><span>{roomId.slice(0, 8).toUpperCase()}</span></div>
            </StageCanvas>
          </div>

          <div className="relay-stage-statusline">
            <div><span className={`relay-connection-light${streams.presentation ? " is-online" : ""}`} /><span>จอ A พรีเซนต์</span><b>{streams.presentation ? "LIVE" : "รอจอ"}</b></div>
            <span className="relay-status-separator" />
            <div><span className={`relay-connection-light${streams.translation ? " is-online" : ""}`} /><span>จอ B คำแปล</span><b>{streams.translation ? "LIVE" : "รอจอ"}</b></div>
            <span className="relay-status-hint">ลากกลางกรอบเพื่อย้าย · ลากจุดมุมเพื่อย่อ/ขยาย · กด Shift เพื่อคงสัดส่วน</span>
          </div>

          <div className="relay-quick-hold" role="toolbar" aria-label="สลับสไลด์พักจอด่วน">
            <span className="relay-quick-hold-label"><Zap size={13} /> สลับด่วน</span>
            <button type="button" className={`relay-quick-btn is-live-btn${!layout.hold ? " is-active" : ""}`} onClick={() => setHold(null)}><span className="relay-live-dot" /> LIVE <kbd>0</kbd></button>
            {(Object.keys(layout.holdTexts) as HoldSlideId[]).map((id, i) => (
              <button key={id} type="button" className={`relay-quick-btn${layout.hold?.id === id ? " is-active" : ""}`} onClick={() => setHold(layout.hold?.id === id ? null : id)}>{layout.holdTexts[id].title} <kbd>{i + 1}</kbd></button>
            ))}
            <span className="relay-status-separator" />
            {ARRANGEMENTS.map(([v, label]) => <button key={v} type="button" className={`relay-quick-btn${arrangement === v ? " is-active" : ""}`} onClick={() => arrange({ arrangement: v, split: layout.split ?? (v === "side" ? 70 : 75) })}>{label}</button>)}
            <span className="relay-status-separator" />
            <button type="button" className={`relay-quick-btn relay-quick-toggle${layout.layers.translation.visible ? " is-active" : ""}`} onClick={() => toggleLayer("translation")} title="แสดง/ซ่อนจอคำแปลบนพรีเซนต์">{layout.layers.translation.visible ? <Eye size={13} /> : <EyeOff size={13} />} B {layout.layers.translation.visible ? "แสดง" : "ซ่อน"} <kbd>H</kbd></button>
            <button type="button" className={`relay-quick-btn relay-quick-toggle${layout.layers.presentation.visible ? " is-active" : ""}`} onClick={() => toggleLayer("presentation")} title="แสดง/ซ่อนจอพรีเซนต์">{layout.layers.presentation.visible ? <Eye size={13} /> : <EyeOff size={13} />} A <kbd>P</kbd></button>
            <select className="relay-quick-select" value={holdTarget} aria-label="แสดงสไลด์พักจอที่" onChange={(e) => { const v = e.target.value as HoldTarget; setHoldTarget(v); setLayout((l) => l.hold ? { ...l, hold: { ...l.hold, target: v } } : l); }}>
              <option value="stage">ทั้งเวที</option><option value="presentation">แทนจอ A</option><option value="translation">แทนจอ B</option>
            </select>
            <select className="relay-quick-select" value={layout.transition} aria-label="เอฟเฟกต์เปลี่ยนภาพ" onChange={(e) => setLayout((l) => ({ ...l, transition: e.target.value as TransitionKind }))}>
              {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {error && <p className="relay-error-notice" role="status">{error}</p>}
          <div className="relay-phone-controls-trigger"><Button variant="outline" className="relay-phone-tools" onClick={() => setMobileTools((v) => !v)}><Settings2 size={16} /> จัดการภาพและลิงก์ <ChevronDown size={15} /></Button></div>
        </section>

        <aside className={`relay-control-panel ${mobileTools ? "relay-control-panel-open" : ""}`}>
          <div className="relay-panel-heading"><div><span className="relay-overline-small">CONTROL ROOM</span><h2>จัดการเวที</h2></div><Button variant="ghost" className="relay-panel-close" aria-label="ปิดเมนูควบคุม" onClick={() => setMobileTools(false)}><X size={17} /></Button></div>
          <div className="relay-panel-tabs" role="tablist">
            {PANEL_TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`relay-panel-tab${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>

          {tab === "connect" && (
          <section className="relay-panel-section relay-share-section">
            <div className="relay-panel-section-title"><span>01</span><h3>เชื่อมต่อจอ</h3></div>
            <ShareControlCard number="A" role="presentation" isConnected={Boolean(streams.presentation)} href={shareWindow("presentation")} copied={copied === "presentation"} copy={() => void copyLink("presentation")} />
            <ShareControlCard number="B" role="translation" isConnected={Boolean(streams.translation)} href={shareWindow("translation")} copied={copied === "translation"} copy={() => void copyLink("translation")} />
          </section>
          )}

          {tab === "layer" && (
          <section className="relay-panel-section">
            <div className="relay-panel-section-title"><span>02</span><h3>ปรับจอ {active === "presentation" ? "A · สไลด์" : "B · คำแปล"}</h3></div>
            <div className="relay-hold-target" role="group" aria-label="รูปแบบการวางจอ">
              {ARRANGEMENTS.map(([v, label]) => <button key={v} type="button" className={`relay-aspect-chip${arrangement === v ? " is-active" : ""}`} onClick={() => arrange({ arrangement: v, split: layout.split ?? (v === "side" ? 70 : 75) })}>{label}</button>)}
              {arrangement !== "overlay" && <button type="button" className="relay-aspect-chip" onClick={() => arrange({ splitSwap: !layout.splitSwap })}><ArrowUpDown size={12} /> สลับตำแหน่ง</button>}
            </div>
            {arrangement !== "overlay" && <ControlSlider label="สัดส่วนพื้นที่จอ A (%)" value={layout.split ?? 75} min={50} max={90} onChange={(v) => arrange({ split: v })} />}
            {arrangement !== "overlay" && <p className="relay-hold-note">โหมดไม่ซ้อน: แต่ละจอถูกจำกัดอยู่ในพื้นที่ของตัวเอง เลือก "ซ้อนทับ" เพื่อวางอิสระ</p>}
            <div className="relay-control-tool-row">
              <button type="button" className="relay-fit-toggle" onClick={() => updateLayer(active, { visible: !activeRect.visible })}>{activeRect.visible ? <Eye size={14} /> : <EyeOff size={14} />}<span>{activeRect.visible ? "แสดงอยู่" : "ซ่อนอยู่"}</span></button>
              <button type="button" className="relay-fit-toggle" onClick={() => setLayout((l) => ({ ...l, layers: bringToFront(l.layers, active) }))}><BringToFront size={14} /><span>นำขึ้นหน้า</span></button>
              <button type="button" className="relay-fit-toggle" onClick={() => setLayout((l) => ({ ...l, layers: sendToBack(l.layers, active) }))}><SendToBack size={14} /><span>ส่งไปหลัง</span></button>
            </div>
            <ControlSlider label="ความกว้าง" value={activeRect.width} min={8} max={100} onChange={(v) => updateLayer(active, { width: v, x: Math.min(activeRect.x, 100 - v) })} />
            <ControlSlider label="ความสูง" value={activeRect.height} min={8} max={100} onChange={(v) => updateLayer(active, { height: v, y: Math.min(activeRect.y, 100 - v) })} />
            <ControlSlider label="ครอปแนวนอน" value={activeRect.cropX} min={0} max={100} onChange={(v) => updateLayer(active, { cropX: v })} />
            <ControlSlider label="ครอปแนวตั้ง" value={activeRect.cropY} min={0} max={100} onChange={(v) => updateLayer(active, { cropY: v })} />
            <div className="relay-control-tool-row">
              <button type="button" className="relay-fit-toggle" onClick={() => updateLayer(active, { fit: !activeRect.fit })}><Crop size={14} /><span>{activeRect.fit ? "พอดีกรอบ" : "ครอปเต็มกรอบ"}</span></button>
              <button type="button" className={`relay-fit-toggle${activeRect.knockout ? " is-on" : ""}`} onClick={() => updateLayer(active, { knockout: !activeRect.knockout })} title="ทำให้พื้นดำโปร่งใส เหมาะกับคำบรรยาย"><Layers size={14} /><span>{activeRect.knockout ? "ตัดพื้นดำ: เปิด" : "ตัดพื้นดำ: ปิด"}</span></button>
            </div>
            <ControlSlider label="ความโปร่งใส (Opacity)" value={activeRect.opacity ?? 100} min={10} max={100} onChange={(v) => updateLayer(active, { opacity: v })} icon={<Sun size={14} />} />
            <ControlSlider label={active === "translation" ? "ขยายภาพ / ขนาดตัวอักษร" : "ขยายภาพ (ซูม)"} value={activeRect.zoom ?? 100} min={100} max={300} onChange={(v) => updateLayer(active, { zoom: v })} icon={<ZoomIn size={14} />} />
            {active === "translation" && <p className="relay-hold-note">จอคำแปลเป็นภาพแชร์จอ จึงปรับขนาดตัวอักษรด้วยการซูม แล้วใช้ครอปเลือกตำแหน่งข้อความ</p>}
            {active === "translation" && <ControlSlider label="ขนาดตัวอักษร (ข้อความสำรอง)" value={layout.fontScale} min={25} max={90} onChange={(v) => setLayout((l) => ({ ...l, fontScale: v }))} icon={<Type size={14} />} />}
          </section>
          )}

          {tab === "stage" && (
          <section className="relay-panel-section">
            <div className="relay-panel-section-title"><span>03</span><h3>ความละเอียดเวที</h3></div>
            <div className="relay-aspect-grid">
              {ASPECT_PRESETS.map((p) => (
                <button key={p.label} type="button" className={`relay-aspect-chip${p.w === layout.aspect.w && p.h === layout.aspect.h ? " is-active" : ""}`} onClick={() => setLayout((l) => ({ ...l, aspect: { w: p.w, h: p.h } }))}>{p.label}</button>
              ))}
            </div>
            <div className="relay-aspect-custom">
              <span>{isCustomAspect ? "กำหนดเอง" : "หรือกำหนดเอง"}</span>
              <input type="number" min={320} max={7680} value={layout.aspect.w} aria-label="ความกว้าง (พิกเซล)" onChange={(e) => { const w = Number(e.target.value); if (w > 0) setLayout((l) => ({ ...l, aspect: { ...l.aspect, w } })); }} />
              <span>×</span>
              <input type="number" min={240} max={4320} value={layout.aspect.h} aria-label="ความสูง (พิกเซล)" onChange={(e) => { const h = Number(e.target.value); if (h > 0) setLayout((l) => ({ ...l, aspect: { ...l.aspect, h } })); }} />
            </div>
          </section>
          )}

          {tab === "stage" && (
          <section className="relay-panel-section">
            <div className="relay-panel-section-title"><span>04</span><h3>เทมเพลต</h3></div>
            <div className="relay-template-list">
              {allTemplates.map((t) => (
                <div key={t.id} className="relay-template-item">
                  <button type="button" className="relay-template-apply" onClick={() => setLayout((l) => applyTemplate(l, t))}><TemplatePreview template={t} /><span>{t.name}<small>{t.layout.aspect.w}×{t.layout.aspect.h}</small></span></button>
                  {!t.builtIn && <button type="button" aria-label={`ลบเทมเพลต ${t.name}`} onClick={() => setTemplates(deleteTemplate(window.localStorage, t.id))}><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
            <form className="relay-template-save" onSubmit={(e) => { e.preventDefault(); const name = templateName.trim(); if (!name) return; setTemplates(saveTemplate(window.localStorage, name, layout)); setTemplateName(""); }}>
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="ตั้งชื่อเทมเพลต" maxLength={40} aria-label="ชื่อเทมเพลต" />
              <Button type="submit" variant="outline" disabled={!templateName.trim()}><Save size={14} /> บันทึก</Button>
            </form>
          </section>
          )}

          {tab === "hold" && (
          <section className="relay-panel-section">
            <div className="relay-panel-section-title"><span>05</span><h3>สไลด์พักจอ</h3></div>
            <div className="relay-hold-target" role="group" aria-label="แสดงที่">
              {([["stage", "ทั้งเวที"], ["presentation", "แทนจอ A"], ["translation", "แทนจอ B"]] as const).map(([v, label]) => (
                <button key={v} type="button" className={`relay-aspect-chip${holdTarget === v ? " is-active" : ""}`} onClick={() => { setHoldTarget(v); setLayout((l) => l.hold ? { ...l, hold: { ...l.hold, target: v } } : l); }}>{label}</button>
              ))}
            </div>
            <p className="relay-hold-note">ภาพที่รองรับ: PNG, JPG, WebP ไม่เกิน 5 MB · ควรใช้สัดส่วนเดียวกับเวที <b>{layout.aspect.w}×{layout.aspect.h}</b> (เช่น 16:9 = 1920×1080) ภาพสัดส่วนอื่นจะถูกวางกลางพร้อมขอบดำ</p>
            {uploadError && <p className="relay-hold-note relay-hold-error" role="alert">{uploadError}</p>}
            <div className="relay-hold-grid">
              {(Object.keys(layout.holdTexts) as HoldSlideId[]).map((id) => (
                <div key={id} className={`relay-hold-card${layout.hold?.id === id ? " is-live" : ""}`}>
                  <button type="button" className="relay-hold-thumb" onClick={() => setHold(layout.hold?.id === id ? null : id)} aria-label={`ขึ้นจอ ${layout.holdTexts[id].title}`}>
                    <HoldSlide id={id} texts={layout.holdTexts} image={layout.holdImages?.[id]} />
                    <span className="relay-hold-badge">{layout.hold?.id === id ? "กำลังแสดง" : "กดเพื่อขึ้นจอ"}</span>
                  </button>
                  <button type="button" className="relay-hold-edit" onClick={() => setEditingHold(editingHold === id ? null : id)}><Pencil size={12} /> แก้ข้อความ</button>
                  <label className="relay-hold-edit relay-hold-upload">{uploading === id ? <LoaderCircle size={12} className="animate-spin" /> : <ImagePlus size={12} />} {layout.holdImages?.[id] ? "เปลี่ยนภาพ" : "อัปโหลดภาพ"}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading !== null} onChange={(e) => { void uploadHoldImage(id, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {layout.holdImages?.[id] && <button type="button" className="relay-hold-edit" onClick={() => setHoldImage(id, null)}><Trash2 size={12} /> ใช้แบบข้อความ</button>}
                  {editingHold === id && (
                    <div className="relay-hold-editor">
                      <input value={layout.holdTexts[id].title} onChange={(e) => setHoldText(id, "title", e.target.value)} aria-label="หัวข้อ" maxLength={60} />
                      <input value={layout.holdTexts[id].subtitle} onChange={(e) => setHoldText(id, "subtitle", e.target.value)} aria-label="ข้อความรอง" maxLength={100} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {layout.hold && <Button className="relay-stage-button w-full" onClick={() => setHold(null)}><RadioTower size={15} /> กลับสู่การถ่ายทอด</Button>}
          </section>
          )}

          <footer className="relay-panel-footer"><span><LockIcon /> ข้อมูลภาพส่งตรงระหว่างเครื่อง</span><a href={shareWindow("stage")} target="_blank" rel="noreferrer">เปิดหน้าจอฉาย <Link2 size={13} /></a></footer>
        </aside>
      </div>
    </main>
  );
}

function ShareControlCard({ number, role, isConnected, href, copied, copy }: { number: string; role: "presentation" | "translation"; isConnected: boolean; href: string; copied: boolean; copy: () => void }) {
  const title = role === "presentation" ? "จอพรีเซนต์" : "จอคำบรรยาย";
  return (
    <div className="relay-share-control">
      <span className="relay-share-control-number">{number}</span><span className="relay-share-control-mark">{role === "presentation" ? <FileVideo2 size={15} /> : <Languages size={15} />}</span>
      <div className="relay-share-control-info"><strong>{title}</strong><small>{isConnected ? "กำลังส่งภาพ" : role === "presentation" ? "แชร์สไลด์" : "พิมพ์คำแปลและแชร์จอ"}</small></div>
      <span className={`relay-connection-light${isConnected ? " is-online" : ""}`} />
      <Button asChild variant="ghost" size="icon" title={`เปิดลิงก์${title}`}><a href={href} target="_blank" rel="noreferrer" aria-label={`เปิดลิงก์${title}`}><Link2 size={15} /></a></Button>
      <Button variant="outline" className="relay-copy-screen-link" title={`คัดลอกลิงก์${title}`} onClick={copy} aria-label={`คัดลอกลิงก์${title}`}>{copied ? <Check size={15} /> : <Share2 size={15} />}{copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</Button>
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
