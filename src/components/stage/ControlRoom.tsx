import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useStageHistory } from "@/hooks/use-stage-history";
import { useShowKeyboard } from "@/hooks/use-show-keyboard";
import { useBroadcastSession } from "@/lib/use-broadcast-session";
import { defaultCaption, publishCaption, type CaptionTrack } from "@/lib/captions";
import { sceneIsDirty, takeScene } from "@/lib/program-state";
import { reduceShowCommand, type ShowCommand } from "@/lib/show-controls";
import { SOURCES, sourceTitle, emptyStreams, type SourceId } from "@/lib/sources";
import { roomInviteUrl, roomPath, type RoomLinkView } from "@/lib/room-links";
import {
  ASPECT_PRESETS,
  TRANSITIONS,
  BUILT_IN_TEMPLATES,
  HOLD_KEY,
  HOLD_IMG_KEY,
  HOLD_IMAGE_MAX_BYTES,
  HOLD_IMAGE_TYPES,
  applyArrangement,
  applyTemplate,
  bringToFront,
  sendToBack,
  defaultLayout,
  normalizeLayout,
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  type HoldSlideId,
  type LayerRect,
  type StageLayout,
  type StageTemplate,
} from "@/lib/stage-layout";
import {
  freezeContent,
  receiveSourceSize,
  type StageEditMode,
  type SourceSize,
} from "@/lib/stage-geometry";
import { uploadHoldImage } from "@/lib/hold-images.functions";
import { StageCanvas } from "./StageCanvas";
import { CroppedVideo } from "./CroppedVideo";
import { LayerGeometryControls } from "./LayerGeometryControls";
import { TemplatePreview } from "./TemplatePreview";
import { CaptionControls } from "./CaptionControls";
import { GeminiDock } from "./GeminiDock";
import { AccountMenu } from "@/components/AccountMenu";
import { useRoomSync } from "@/lib/account-sync";
import { ShowToolbar } from "./ShowToolbar";

export function ControlRoom({ roomId }: { roomId: string }) {
  const history = useStageHistory();
  const { layout: draft, setLayout: setDraft } = history;
  const [program, renderProgram] = useState<StageLayout>(() => ({
    ...defaultLayout(),
    captions: defaultCaption(),
  }));
  const programRef = useRef(program);
  const [restored, setRestored] = useState(false);
  const [tab, setTab] = useState("live");
  const [mode, setMode] = useState<StageEditMode>("mask");
  const [zoom, setZoom] = useState(0);
  const [notice, setNotice] = useState("");
  const [templates, setTemplates] = useState<StageTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [uploading, setUploading] = useState(false);
  const workspace = useRef<HTMLDivElement | null>(null);
  const commit = useCallback((action: SetStateAction<StageLayout>) => {
    const next = typeof action === "function" ? action(programRef.current) : action;
    programRef.current = next;
    renderProgram(next);
    return next;
  }, []);
  const onCommand = useCallback(
    (command: ShowCommand) => commit((current) => reduceShowCommand(current, command)),
    [commit],
  );
  const session = useBroadcastSession(roomId, onCommand);
  const { start, stop, sendLayout } = session;
  const sync = useRoomSync(roomId);
  const { saveState } = sync;
  useEffect(() => {
    void start("director");
    return stop;
  }, [start, stop]);
  useEffect(() => {
    if (!restored) return;
    sendLayout(program);
    try {
      sessionStorage.setItem(`relay-program-${roomId}`, JSON.stringify(program));
    } catch {
      /* optional recovery */
    }
  }, [program, sendLayout, restored, roomId]);
  useEffect(() => {
    if (!restored) return;
    saveState({
      holdTexts: draft.holdTexts,
      holdImages: draft.holdImages,
      quickSlots: draft.quickSlots,
      program,
    });
  }, [draft.holdTexts, draft.holdImages, draft.quickSlots, program, restored, saveState]);
  useEffect(() => {
    if (!sync.ready) return;
    setTemplates(loadTemplates(localStorage));
    try {
      const holdTexts = JSON.parse(localStorage.getItem(HOLD_KEY) ?? "null");
      const holdImages = JSON.parse(localStorage.getItem(HOLD_IMG_KEY) ?? "null");
      const quickSlots = JSON.parse(localStorage.getItem(`relay-slots-${roomId}`) ?? "null");
      const savedProgram = JSON.parse(sessionStorage.getItem(`relay-program-${roomId}`) ?? "null");
      if (savedProgram?.layers && savedProgram?.aspect?.w > 0 && savedProgram?.aspect?.h > 0) {
        const recovered = normalizeLayout(savedProgram as StageLayout);
        commit(recovered);
        setDraft(recovered, false);
      }
      setDraft(
        (current) => ({
          ...current,
          ...(holdTexts ? { holdTexts: { ...current.holdTexts, ...holdTexts } } : {}),
          ...(holdImages ? { holdImages } : {}),
          ...(Array.isArray(quickSlots) && quickSlots.length === 5 ? { quickSlots } : {}),
        }),
        false,
      );
    } catch {
      /* persisted settings are optional */
    }
    setRestored(true);
  }, [roomId, setDraft, commit, sync.ready]);
  const streams = emptyStreams();
  for (const source of SOURCES)
    streams[source.id] =
      session.participants.find((p) => p.role === source.id && p.stream)?.stream ?? null;
  const active = draft.activeLayer,
    layer = draft.layers[active];
  const dirty = sceneIsDirty(program, draft);
  const take = () => {
    commit((current) => takeScene(current, draft));
    setNotice("ส่ง Preview ขึ้น Program แล้ว");
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void workspace.current?.requestFullscreen().catch(() => setNotice("เปิดเต็มจอไม่สำเร็จ"));
  };
  useShowKeyboard(onCommand, fullscreen, history.undo, history.redo, take);
  const copy = async (view: RoomLinkView) => {
    try {
      await navigator.clipboard.writeText(roomInviteUrl(window.location.origin, roomId, view));
      setNotice(`คัดลอกลิงก์ ${view === "presenter" ? "Presenter" : view} แล้ว`);
    } catch {
      setNotice("คัดลอกลิงก์ไม่สำเร็จ กรุณาเปิดลิงก์แล้วคัดลอกจากแถบที่อยู่");
    }
  };
  const select = (id: SourceId) => setDraft((current) => ({ ...current, activeLayer: id }), false);
  const changeLayer = (id: SourceId, patch: Partial<LayerRect>) =>
    setDraft((current) => ({
      ...current,
      layers: {
        ...current.layers,
        [id]: { ...freezeContent(current.layers[id], current.aspect), ...patch },
      },
    }));
  const sourceSize = (id: SourceId, size: SourceSize) =>
    setDraft((current) => {
      const next = receiveSourceSize(current.layers[id], current.aspect, size);
      return next === current.layers[id]
        ? current
        : { ...current, layers: { ...current.layers, [id]: next } };
    }, false);
  const setCaptions = (next: CaptionTrack) =>
    commit((current) => ({
      ...current,
      captions: { ...next, sequence: (current.captions?.sequence ?? 0) + 1 },
    }));
  const publish = (source: string, text: string) =>
    commit((current) => ({
      ...current,
      captions: publishCaption(current.captions ?? defaultCaption(), source, text),
    }));
  const upload = async (id: HoldSlideId, file: File | undefined) => {
    if (!file) return;
    if (!HOLD_IMAGE_TYPES.includes(file.type) || file.size > HOLD_IMAGE_MAX_BYTES) {
      setNotice("ใช้ภาพ PNG/JPEG/WebP ขนาดไม่เกิน 5 MB");
      return;
    }
    setUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const result = await uploadHoldImage({
        data: { roomId, slide: id, type: file.type as "image/png", data: btoa(binary) },
      });
      setDraft((current) => {
        const holdImages = { ...current.holdImages, [id]: result.url };
        localStorage.setItem(HOLD_IMG_KEY, JSON.stringify(holdImages));
        return { ...current, holdImages };
      });
    } catch {
      setNotice("อัปโหลดภาพพักจอไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploading(false);
    }
  };
  const allTemplates = [...BUILT_IN_TEMPLATES, ...templates];
  return (
    <main className="control-room">
      <header className="control-header">
        <Link to="/rooms" className="control-brand" title="กลับไปห้องของฉัน">
          live <span>relay</span>
        </Link>
        <div className="control-room-id">
          {sync.roomName || `ROOM ${roomId.slice(0, 8).toUpperCase()}`}{" "}
          <span className={`control-badge${session.connected ? " is-online" : ""}`}>
            {session.connected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ"}
          </span>
        </div>
        <div className="control-actions">
          <Button variant="outline" onClick={() => void copy("presenter")}>
            คัดลอก Presenter Link
          </Button>
          <Button asChild variant="outline">
            <a
              href={roomPath(roomId, "presenter")}
              target={`presenter-${roomId}`}
              rel="noreferrer"
              title="เปิดเป็นหน้าต่างแยก ลากไปจอโปรเจกเตอร์แล้วกด F"
              onClick={(event) => {
                // A separate window keeps this Control Room visible (and unthrottled)
                // while the Presenter is full screen on the projector.
                const win = window.open(
                  roomPath(roomId, "presenter"),
                  `presenter-${roomId}`,
                  "popup,width=1280,height=720",
                );
                if (win) event.preventDefault();
              }}
            >
              เปิด Presenter
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={roomPath(roomId, "stage")} target="_blank" rel="noreferrer">
              จอฉายพร้อมปุ่มลัด
            </a>
          </Button>
          <AccountMenu />
        </div>
      </header>
      <div className="control-main">
        <div className="control-summary">
          <div>
            <h1>Control Room</h1>
            <p className="control-status-line">
              <span
                className={`control-state-pill ${
                  program.blackout ? "is-blackout" : program.hold ? "is-hold" : "is-live"
                }`}
              >
                {program.blackout
                  ? "จอดำ"
                  : program.hold
                    ? `พักจอ · ${program.holdTexts[program.hold.id].title}`
                    : "LIVE"}
              </span>
              <span>{SOURCES.filter((s) => streams[s.id]).length}/5 แหล่งภาพ</span>
              <span className={dirty ? "control-dirty" : "control-muted"}>
                {dirty ? "● มี Preview รอส่ง" : "ฉากตรงกับ Program"}
              </span>
            </p>
          </div>
          <Button className="control-take" onClick={take}>
            TAKE · ส่ง Preview ขึ้น LIVE <kbd>Space</kbd>
          </Button>
        </div>
        {(notice || session.error) && (
          <p className={session.error ? "control-error" : "control-notice"} role="status">
            {session.error || notice}
          </p>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="control-main-tabs" aria-label="งานควบคุมเวที">
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="links">ลิงก์</TabsTrigger>
            <TabsTrigger value="sources">แหล่งภาพ</TabsTrigger>
            <TabsTrigger value="scene">จัดเวที · เทมเพลต · พักจอ</TabsTrigger>
            <TabsTrigger value="translate">แปลสด</TabsTrigger>
          </TabsList>
          <TabsContent value="live">
            <div className="control-monitor-grid">
              <section className="control-card">
                <div className="control-section-heading">
                  <h2>PREVIEW · ฉากที่เตรียม</h2>
                  <Button variant="outline" onClick={() => setTab("scene")}>
                    แก้ไขฉาก
                  </Button>
                </div>
                <StageCanvas
                  layout={{
                    ...draft,
                    hold: null,
                    blackout: false,
                    captions: program.captions ?? defaultCaption(),
                  }}
                  streams={streams}
                  caption=""
                  editable={false}
                />
                <p className="control-muted">ปรับภาพใน Scene Editor แล้วกด TAKE เมื่อพร้อม</p>
              </section>
              <section className="control-card control-program">
                <h2>● PROGRAM · ผู้ชมเห็นภาพนี้</h2>
                <StageCanvas layout={program} streams={streams} caption="" editable={false} />
                <p className="control-muted">ภาพเดียวกับ Presenter · ไม่มีกรอบแก้ไข</p>
              </section>
            </div>
            <div className="control-source-strip">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    select(s.id);
                    setTab("sources");
                  }}
                >
                  <strong>{s.letter}</strong>
                  <span className="control-source-row">
                    <span className={`control-source-dot${streams[s.id] ? " is-online" : ""}`} />
                    {streams[s.id] ? "เชื่อมต่อ" : "ไม่มีสัญญาณ"}
                  </span>
                  <span className="control-muted">
                    {program.layers[s.id].visible ? "บน Program" : "ซ่อน"}
                  </span>
                </button>
              ))}
            </div>
            <details className="control-card">
              <summary>พักจอเฉพาะแหล่งภาพ · คำสั่ง LIVE ทันที</summary>
              <label>
                แหล่งภาพที่จะพัก
                <select value={active} onChange={(e) => select(e.target.value as SourceId)}>
                  {SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sourceTitle(s.id, draft.layers[s.id].name)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="control-actions">
                {(["wait", "title", "technical"] as const).map((id) => (
                  <Button
                    key={id}
                    variant="outline"
                    onClick={() =>
                      commit((current) => ({
                        ...current,
                        hold: { id, target: active },
                        blackout: false,
                      }))
                    }
                  >
                    {program.holdTexts[id].title} · เฉพาะ {sourceTitle(active)}
                  </Button>
                ))}
              </div>
            </details>
            <details className="control-card control-caption-manual">
              <summary>ซับข้อความบนจอ Program · พิมพ์เอง (ไม่บังคับ)</summary>
              <p className="control-muted">
                ข้อความทับภาพ เช่น ชื่อผู้พูด หัวข้อ หรือประกาศ · ใช้ปุ่ม S ซ่อน/แสดงได้ ·
                คำแปลสดจากแท็บ "แปลสด" จะขึ้นที่นี่อัตโนมัติ
              </p>
              <CaptionControls
                track={program.captions ?? defaultCaption()}
                onChange={setCaptions}
                onPublish={publish}
              />
            </details>
          </TabsContent>
          <TabsContent value="links">
            <section className="control-card">
              <h2>ลิงก์ของห้องนี้</h2>
              <p className="control-muted">ทุกลิงก์ต้องเข้าสู่ระบบก่อนเปิด · ส่งลิงก์ให้แต่ละเครื่องที่จะแชร์จอ</p>
              <ul className="control-link-list">
                {SOURCES.map((s) => (
                  <li key={s.id}>
                    <span className={`relay-connection-light${streams[s.id] ? " is-online" : ""}`} />
                    <strong>จอ {s.letter}</strong>
                    <span className="control-muted">{streams[s.id] ? "กำลังส่งภาพ" : "ยังไม่เชื่อมต่อ"}</span>
                    <Button variant="outline" size="sm" onClick={() => void copy(s.id)}>คัดลอกลิงก์</Button>
                    <Button asChild variant="ghost" size="sm">
                      <a href={roomPath(roomId, s.id)} target="_blank" rel="noreferrer">เปิด</a>
                    </Button>
                  </li>
                ))}
                <li>
                  <span className={`relay-connection-light${session.participants.some((p) => p.role === "translation-display") ? " is-online" : ""}`} />
                  <strong>Presenter เต็มจอ</strong>
                  <span className="control-muted">เปิดบนเครื่องที่ต่อโปรเจกเตอร์</span>
                  <Button variant="outline" size="sm" onClick={() => void copy("presenter")}>คัดลอกลิงก์</Button>
                  <Button asChild variant="ghost" size="sm">
                    <a href={roomPath(roomId, "presenter")} target="_blank" rel="noreferrer">เปิด</a>
                  </Button>
                </li>
              </ul>
            </section>
          </TabsContent>
          <TabsContent value="translate">
            <section className="control-card">
              <h2>แปลสดด้วย Gemini Live</h2>
              <p className="control-muted">ใช้ไมค์ของเครื่องนี้ คำแปลขึ้นเป็นซับบน Program ทันที ปรับขนาดหรือซ่อนซับได้ในแท็บ Live</p>
              <GeminiDock settings={sync.translation} onSettings={sync.saveTranslation} onPublish={publish} />
            </section>
          </TabsContent>
          <TabsContent value="sources">
            <section className="control-card">
              <h2>Source Preview</h2>
              <p className="control-muted">
                เลือกดูและแก้ไขได้ทีละแหล่ง · การเลือกแท็บไม่เปลี่ยนภาพบน LIVE
              </p>
              <Tabs value={active} onValueChange={(id) => select(id as SourceId)}>
                <TabsList className="control-source-tabs" aria-label="เลือกแหล่งภาพ A ถึง E">
                  {SOURCES.map((s) => (
                    <TabsTrigger key={s.id} value={s.id}>
                      {s.letter} · {draft.layers[s.id].name || s.name} ·{" "}
                      {streams[s.id] ? "เชื่อมต่อ" : "Offline"}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {SOURCES.map((s) => (
                  <TabsContent key={s.id} value={s.id}>
                    <div className="control-source-detail">
                      <div className="control-source-video">
                        {streams[s.id] ? (
                          <CroppedVideo stream={streams[s.id]!} />
                        ) : (
                          <p>ยังไม่มีสัญญาณจากจอ {s.letter}</p>
                        )}
                      </div>
                      <div>
                        <h3>{sourceTitle(s.id, draft.layers[s.id].name)}</h3>
                        <p>
                          กำลังเลือก: {s.letter} ·{" "}
                          {streams[s.id] ? "เชื่อมต่อแล้ว" : "รอเครื่องส่ง"}
                        </p>
                        <p>
                          Program: {program.layers[s.id].visible ? "เปิดแสดง" : "ซ่อนอยู่"}
                          {program.blackout || program.hold?.target === "stage"
                            ? " · ถูกปิดทับด้วยพักจอ/จอดำ"
                            : ""}
                        </p>
                        <label>
                          ชื่อแหล่งภาพ
                          <input
                            maxLength={60}
                            value={draft.layers[s.id].name ?? s.name}
                            onChange={(e) => changeLayer(s.id, { name: e.target.value })}
                          />
                        </label>
                        <div className="control-actions">
                          <Button variant="outline" onClick={() => void copy(s.id)}>
                            คัดลอกลิงก์ส่งภาพ {s.letter}
                          </Button>
                          <Button asChild variant="outline">
                            <a href={roomPath(roomId, s.id)} target="_blank" rel="noreferrer">
                              เปิดเครื่องส่ง {s.letter}
                            </a>
                          </Button>
                          <Button onClick={() => setTab("scene")}>จัดตำแหน่งใน Preview</Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </section>
            <div className="control-source-strip">
              {SOURCES.map((s) => (
                <div key={s.id}>
                  <strong>{s.letter}</strong>
                  <span>{streams[s.id] ? "เชื่อมต่อแล้ว" : "Offline"}</span>
                  <Button
                    variant="outline"
                    aria-pressed={program.layers[s.id].visible}
                    onClick={() =>
                      commit((current) => ({
                        ...current,
                        layers: {
                          ...current.layers,
                          [s.id]: {
                            ...current.layers[s.id],
                            visible: !current.layers[s.id].visible,
                          },
                        },
                      }))
                    }
                  >
                    {program.layers[s.id].visible
                      ? `ซ่อน ${s.letter} จาก LIVE`
                      : `แสดง ${s.letter} บน LIVE`}
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="scene">
            <div className="control-editor-grid">
              <section className="control-card">
                <div className="control-section-heading">
                  <div>
                    <h2>PREVIEW · กำลังแก้ {sourceTitle(active, layer.name)}</h2>
                    <p>การปรับในหน้านี้รอ TAKE ก่อนออก LIVE</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        ...takeScene(current, program),
                        activeLayer: current.activeLayer,
                      }))
                    }
                  >
                    คืนฉากจาก Program
                  </Button>
                </div>
                <div className="control-editor-tools">
                  {(
                    [
                      ["mask", "Mask · ช่องเปิดภาพ"],
                      ["content", "Content · ภาพด้านใน"],
                      ["group", "ย้ายทั้งเลเยอร์"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={mode === id}
                      onClick={() => setMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                  <label>
                    ซูมพื้นที่ทำงาน
                    <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                      {[0, 50, 100, 150, 200].map((z) => (
                        <option key={z} value={z}>
                          {z ? `${z}%` : "Fit"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" disabled={!history.canUndo} onClick={history.undo}>
                    Undo
                  </button>
                  <button type="button" disabled={!history.canRedo} onClick={history.redo}>
                    Redo
                  </button>
                </div>
                <div ref={workspace} className="control-editor-viewport">
                  <div
                    style={{ width: zoom ? (draft.aspect.w * zoom) / 100 : "100%", flexShrink: 0 }}
                  >
                    <StageCanvas
                      layout={{ ...draft, hold: null, blackout: false }}
                      streams={streams}
                      caption=""
                      editable
                      editMode={mode}
                      onSelect={select}
                      onChangeLayer={changeLayer}
                      onSourceSize={sourceSize}
                      onEditStart={history.beginEdit}
                      onEditEnd={history.endEdit}
                    />
                  </div>
                </div>
                <p className="control-muted">
                  {mode === "mask"
                    ? "Mask เปลี่ยนช่องเปิด · ไม่ย่อหรือขยายภาพด้านใน"
                    : mode === "content"
                      ? "Content เลื่อน/ขยายภาพโดยคงสัดส่วน · Mask คงเดิม"
                      : "ย้าย Content และ Mask พร้อมกัน"}
                </p>
              </section>
              <aside className="control-card">
                <label>
                  กำลังแก้ Source
                  <select value={active} onChange={(e) => select(e.target.value as SourceId)}>
                    {SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {sourceTitle(s.id, draft.layers[s.id].name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="control-checkbox">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => changeLayer(active, { visible: e.target.checked })}
                  />
                  แสดงใน Preview
                </label>
                <label className="control-checkbox">
                  <input
                    type="checkbox"
                    checked={!!layer.locked}
                    onChange={(e) => changeLayer(active, { locked: e.target.checked })}
                  />
                  ล็อกเลเยอร์
                </label>
                <label className="control-checkbox">
                  <input
                    type="checkbox"
                    checked={!!layer.lockAspect}
                    onChange={(e) => changeLayer(active, { lockAspect: e.target.checked })}
                  />
                  ล็อกสัดส่วน Mask
                </label>
                <label>
                  ความทึบ (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={layer.opacity ?? 100}
                    onChange={(e) =>
                      changeLayer(active, {
                        opacity: Math.max(0, Math.min(100, Number(e.target.value))),
                      })
                    }
                  />
                </label>
                <label className="control-checkbox">
                  <input
                    type="checkbox"
                    checked={layer.knockout}
                    onChange={(e) => changeLayer(active, { knockout: e.target.checked })}
                  />
                  Screen blend · พื้นดำโปร่งใส
                </label>
                <LayerGeometryControls
                  layer={layer}
                  layout={draft}
                  mode={mode}
                  onChange={(next) => changeLayer(active, next)}
                />
                <div className="control-actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        layers: bringToFront(current.layers, active),
                      }))
                    }
                  >
                    นำมาด้านหน้า
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        layers: sendToBack(current.layers, active),
                      }))
                    }
                  >
                    ส่งไปด้านหลัง
                  </Button>
                </div>
              </aside>
            </div>
            <section className="control-card">
              <h2>รูปแบบเวทีและเทมเพลต</h2>
              <div className="control-form-row">
                <label>
                  ขนาดเวที
                  <select
                    value={`${draft.aspect.w}:${draft.aspect.h}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split(":").map(Number);
                      setDraft((current) => ({ ...current, aspect: { w: w!, h: h! } }));
                    }}
                  >
                    {!ASPECT_PRESETS.some(
                      (p) => p.w === draft.aspect.w && p.h === draft.aspect.h,
                    ) && (
                      <option value={`${draft.aspect.w}:${draft.aspect.h}`}>
                        กำหนดเอง · {draft.aspect.w}×{draft.aspect.h}
                      </option>
                    )}
                    {ASPECT_PRESETS.map((p) => (
                      <option key={p.label} value={`${p.w}:${p.h}`}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                {(["w", "h"] as const).map((axis) => (
                  <label key={axis}>
                    {axis === "w" ? "ความกว้างเวที (px)" : "ความสูงเวที (px)"}
                    <input
                      type="number"
                      min={320}
                      max={8192}
                      value={draft.aspect[axis]}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value) && value >= 320 && value <= 8192)
                          setDraft((current) => ({
                            ...current,
                            aspect: { ...current.aspect, [axis]: value },
                          }));
                      }}
                    />
                  </label>
                ))}
                <label>
                  เอฟเฟกต์พักจอ
                  <select
                    value={draft.transition}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        transition: e.target.value as StageLayout["transition"],
                      }))
                    }
                  >
                    {TRANSITIONS.map((transition) => (
                      <option key={transition.id} value={transition.id}>
                        {transition.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  การจัด A/B
                  <select
                    value={draft.arrangement ?? "overlay"}
                    onChange={(e) =>
                      setDraft((current) =>
                        applyArrangement({
                          ...current,
                          arrangement: e.target.value as "overlay" | "stack" | "side",
                        }),
                      )
                    }
                  >
                    <option value="overlay">อิสระ</option>
                    <option value="stack">บน / ล่าง</option>
                    <option value="side">ซ้าย / ขวา</option>
                  </select>
                </label>
                <label>
                  สัดส่วน A/B (%)
                  <input
                    type="number"
                    min={10}
                    max={90}
                    value={draft.split ?? 75}
                    onChange={(e) =>
                      setDraft((current) =>
                        applyArrangement({
                          ...current,
                          split: Math.max(10, Math.min(90, Number(e.target.value))),
                        }),
                      )
                    }
                  />
                </label>
                <label className="control-checkbox">
                  <input
                    type="checkbox"
                    checked={!!draft.splitSwap}
                    onChange={(e) =>
                      setDraft((current) =>
                        applyArrangement({ ...current, splitSwap: e.target.checked }),
                      )
                    }
                  />
                  สลับ A/B
                </label>
              </div>
              <div className="control-template-grid">
                {allTemplates.map((t) => (
                  <div key={t.id}>
                    <button
                      type="button"
                      onClick={() => setDraft((current) => applyTemplate(current, t))}
                    >
                      <TemplatePreview template={t} />
                      <span>{t.name}</span>
                    </button>
                    {!t.builtIn && (
                      <button
                        type="button"
                        aria-label={`ลบเทมเพลต ${t.name}`}
                        onClick={() => {
                          const list = deleteTemplate(localStorage, t.id);
                          setTemplates(list);
                          void sync.syncTemplates(list);
                        }}
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="control-actions">
                <input
                  aria-label="ชื่อเทมเพลต"
                  placeholder="ชื่อเทมเพลต"
                  maxLength={60}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!templateName.trim()}
                  onClick={() => {
                    {
                      const list = saveTemplate(localStorage, templateName.trim(), draft);
                      setTemplates(list);
                      void sync.syncTemplates(list);
                    }
                    setTemplateName("");
                  }}
                >
                  บันทึก Preview
                </Button>
              </div>
              <div className="control-form-row">
                {[0, 1, 2, 3, 4].map((i) => (
                  <label key={i}>
                    ปุ่ม {i + 4} · Layout {i + 1}
                    <select
                      value={(draft.quickSlots ?? BUILT_IN_TEMPLATES)[i]?.id}
                      onChange={(e) => {
                        const slots = [...(draft.quickSlots ?? BUILT_IN_TEMPLATES.slice(0, 5))];
                        slots[i] = allTemplates.find((t) => t.id === e.target.value)!;
                        setDraft((current) => ({ ...current, quickSlots: slots }));
                        localStorage.setItem(`relay-slots-${roomId}`, JSON.stringify(slots));
                      }}
                    >
                      {allTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>
            <section className="control-card">
              <h2>เตรียมพักจอ · ใช้หลัง TAKE</h2>
              <div className="control-form-row">
                {(["wait", "title", "technical"] as const).map((id) => (
                  <div key={id}>
                    <label>
                      หัวข้อ {id}
                      <input
                        value={draft.holdTexts[id].title}
                        onChange={(e) =>
                          setDraft((current) => {
                            const holdTexts = {
                              ...current.holdTexts,
                              [id]: { ...current.holdTexts[id], title: e.target.value },
                            };
                            localStorage.setItem(HOLD_KEY, JSON.stringify(holdTexts));
                            return { ...current, holdTexts };
                          })
                        }
                      />
                    </label>
                    <label>
                      ข้อความรอง
                      <input
                        value={draft.holdTexts[id].subtitle}
                        onChange={(e) =>
                          setDraft((current) => {
                            const holdTexts = {
                              ...current.holdTexts,
                              [id]: { ...current.holdTexts[id], subtitle: e.target.value },
                            };
                            localStorage.setItem(HOLD_KEY, JSON.stringify(holdTexts));
                            return { ...current, holdTexts };
                          })
                        }
                      />
                    </label>
                    <label>
                      ภาพพักจอ
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploading}
                        onChange={(e) => void upload(id, e.target.files?.[0])}
                      />
                    </label>
                    {draft.holdImages?.[id] && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setDraft((current) => {
                            const holdImages = { ...current.holdImages };
                            delete holdImages[id];
                            localStorage.setItem(HOLD_IMG_KEY, JSON.stringify(holdImages));
                            return { ...current, holdImages };
                          })
                        }
                      >
                        ใช้ข้อความแทนภาพ
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>
        </Tabs>
        <footer className="control-show-dock">
          <div>
            <strong>คำสั่ง LIVE ทันที</strong>
            <span>0 กลับ LIVE · 1–3 พักจอ · 4–8 Layout · S ซับ · K จอดำ · F เต็มจอ</span>
          </div>
          <ShowToolbar layout={program} execute={onCommand} />
        </footer>
      </div>
    </main>
  );
}
