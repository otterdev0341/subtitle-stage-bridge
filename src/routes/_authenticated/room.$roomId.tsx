import { useEffect, useRef, useState } from "react";
import "@/control-room.css";
import "@/station.css";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  CircleStop,
  FileVideo2,
  LoaderCircle,
  MonitorUp,
  RadioTower,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBroadcastSession } from "@/lib/use-broadcast-session";
import { SenderCropper } from "@/components/station/SenderCropper";
import { CropPipeline } from "@/lib/crop-pipeline";
import {
  FULL_CROP,
  cropKey,
  normalizeCrop,
  type CropRect,
  type CropShape,
} from "@/lib/screen-crop";
import { CroppedVideo } from "@/components/stage/CroppedVideo";
import { ControlRoom } from "@/components/stage/ControlRoom";
import { OutputRoom } from "@/components/stage/OutputRoom";
import { roomInviteUrl, parseRoomView, type RoomLinkView } from "@/lib/room-links";
import { isSourceId, sourceInfo, type SourceId } from "@/lib/sources";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Power } from "lucide-react";
import { RoomStatus } from "@/components/RoomStatus";
import { CloseRoomDialog } from "@/components/CloseRoomDialog";
import { useRoomAccess } from "@/hooks/use-room-access";
import { canShareInRoom, setRoomOpen } from "@/lib/room-access";

export const Route = createFileRoute("/_authenticated/room/$roomId")({
  validateSearch: (search: Record<string, unknown>): { view: RoomLinkView } => ({
    view: parseRoomView(search),
  }),
  head: ({ params }) => ({
    meta: [
      { title: `ห้อง ${params.roomId.slice(0, 8)} — Live Relay` },
      { name: "description", content: "เชื่อมภาพพรีเซนต์กับคำบรรยายสดและปรับตำแหน่งได้แบบเรียลไทม์" },
      { property: "og:title", content: `ห้องถ่ายทอดสด — Live Relay` },
      {
        property: "og:description",
        content: "ประกอบภาพพรีเซนต์และคำบรรยายแปลจากสองเครื่องบนเวทีเดียวกัน",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BroadcastRoom,
});

function BroadcastRoom() {
  const { roomId } = Route.useParams();
  const { view } = Route.useSearch();
  const access = useRoomAccess(roomId);
  const qc = useQueryClient();
  const [confirmClose, setConfirmClose] = useState(false);
  const toggle = useMutation({
    mutationFn: (open: boolean) => setRoomOpen(roomId, open),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["room-access", roomId] });
      await qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: () => toast.error("เปลี่ยนสถานะห้องไม่สำเร็จ"),
  });
  const owner = access.data?.is_owner === true;
  const open = !access.isError && canShareInRoom(access.data);
  const director = !isSourceId(view) && view !== "stage" && view !== "presenter";

  if (access.isPending) return <main className="room-unavailable"><LoaderCircle className="relay-spin" /><p>กำลังตรวจสถานะห้อง…</p></main>;
  if (!open || (director && !owner)) return <main className="room-unavailable">
    <RoomStatus open={false} />
    <h1>{access.isError ? "ตรวจสถานะห้องไม่ได้" : !access.data ? "ไม่พบห้องนี้" : director && !owner ? "เฉพาะเจ้าของห้อง" : "ห้องนี้ปิดอยู่"}</h1>
    <p>{access.isError ? "กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง" : "ไม่สามารถส่งภาพเข้าห้องได้จนกว่าเจ้าของจะเปิดห้อง"}</p>
    {owner && <Button disabled={toggle.isPending} onClick={() => toggle.mutate(true)}><Power /> เปิดห้อง</Button>}
    {access.isError && <Button onClick={() => void access.refetch()}>ลองอีกครั้ง</Button>}
    <Button asChild variant="outline"><Link to="/rooms">ห้องของฉัน</Link></Button>
  </main>;

  return <div key={access.data?.signaling_key}>
    {director && <div className="room-session-bar">
      <RoomStatus open={true} />
      <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => setConfirmClose(true)}><Power size={14} /> ปิดห้อง</Button>
    </div>}
    <CloseRoomDialog open={confirmClose} onOpenChange={setConfirmClose} pending={toggle.isPending}
      onConfirm={() => toggle.mutateAsync(false)} />
    {isSourceId(view) ? <RemoteStation key={`${roomId}-${view}`} roomId={roomId} role={view} /> : director ? <ControlRoom key={roomId} roomId={roomId} /> : <OutputRoom key={`${roomId}-${view}`} roomId={roomId} presenter={view === "presenter"} />}
  </div>;
}

export function RemoteStation({ roomId, role }: { roomId: string; role: SourceId }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [senderError, setSenderError] = useState("");
  const [copied, setCopied] = useState(false);
  const { connected, participants, error, start, stop } = useBroadcastSession(roomId);
  const pipelineRef = useRef<CropPipeline | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [shape, setShape] = useState<CropShape>("full");
  const [paused, setPaused] = useState(false);
  const [outSize, setOutSize] = useState({ w: 0, h: 0 });
  const [sending, setSending] = useState(false);
  const [editingCrop, setEditingCrop] = useState(true);
  const [draftCrop, setDraftCrop] = useState<CropRect>(FULL_CROP);
  const [draftShape, setDraftShape] = useState<CropShape>("full");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(cropKey(roomId, role)) ?? "null");
      if (saved?.crop) {
        setCrop(saved.crop);
        setShape(saved.shape ?? "free");
      }
    } catch {
      /* ignore */
    }
  }, [roomId, role]);
  const changeCrop = (next: CropRect, nextShape: CropShape) => {
    setCrop(next);
    setShape(nextShape);
    if (pipelineRef.current) pipelineRef.current.crop = next;
    window.localStorage.setItem(
      cropKey(roomId, role),
      JSON.stringify({ crop: next, shape: nextShape }),
    );
  };
  const changePaused = (p: boolean) => {
    setPaused(p);
    if (pipelineRef.current) pipelineRef.current.paused = p;
  };
  useEffect(() => {
    if (!stream) return undefined;
    const t = window.setInterval(() => {
      const o = pipelineRef.current?.outSize;
      if (o) setOutSize((c) => (c.w === o.w && c.h === o.h ? c : { ...o }));
    }, 500);
    return () => window.clearInterval(t);
  }, [stream]);
  useEffect(
    () => () => {
      pipelineRef.current?.stop();
      rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const startSharing = async () => {
    setStarting(true);
    setSenderError("");
    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      if (!mounted.current) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      rawStreamRef.current = nextStream;
      setStream(nextStream);
      setDraftCrop(normalizeCrop(crop));
      setDraftShape(shape);
      setEditingCrop(true);
      setSending(false);
      for (const track of nextStream.getTracks()) {
        track.addEventListener(
          "ended",
          () => {
            stop();
            pipelineRef.current?.stop();
            pipelineRef.current = null;
            setSending(false);
            setStream(null);
          },
          { once: true },
        );
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name !== "NotAllowedError") {
        setSenderError("เปิดแชร์จอไม่สำเร็จ กรุณาอนุญาตการแชร์หน้าจอแล้วลองอีกครั้ง");
      }
    } finally {
      setStarting(false);
    }
  };

  const applySendingCrop = async () => {
    if (!stream) return;
    setStarting(true);
    setSenderError("");
    try {
      changeCrop(normalizeCrop(draftCrop), draftShape);
      if (!sending) {
        const pipeline = new CropPipeline(stream, normalizeCrop(draftCrop));
        pipeline.paused = paused;
        pipelineRef.current = pipeline;
        await start(role, pipeline.stream);
        if (!mounted.current || rawStreamRef.current !== stream || pipelineRef.current !== pipeline) {
          pipeline.stop();
          return;
        }
        setSending(true);
      }
      setEditingCrop(false);
    } catch {
      pipelineRef.current?.stop();
      pipelineRef.current = null;
      setSending(false);
      setSenderError("เริ่มส่งภาพไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setStarting(false);
    }
  };

  const stopSharing = () => {
    stop();
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    setStream(null);
    setSending(false);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(roomInviteUrl(window.location.origin, roomId, role));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setSenderError("คัดลอกลิงก์ไม่สำเร็จ กรุณาคัดลอกจากแถบที่อยู่ของหน้านี้");
    }
  };

  const step = !stream ? 1 : editingCrop ? 2 : 3;
  return (
    <main className={`relay-station relay-station-${role} sender-page`}>
      <header className="relay-station-header">
        <Link to="/rooms" className="relay-brand" aria-label="กลับห้องของฉัน">
          <span className="relay-brand-mark"><RadioTower size={18} /></span>
          <span>live<span className="relay-brand-light">{" relay"}</span></span>
        </Link>
        <span className="sender-room">ห้อง {roomId.slice(0, 8).toUpperCase()}</span>
      </header>
      <div className="relay-station-content">
        <div className="sender-heading">
          <div><div className="sender-eyebrow"><FileVideo2 size={16} /> จอ {sourceInfo(role).letter}</div>
            <h1>แชร์ภาพเข้าห้อง</h1></div>
          <span className={`sender-state${sending && !paused ? " is-live" : ""}`} role="status">
            <span className={sending && !paused ? "relay-live-dot" : "relay-status-wait"} />
            {sending ? paused ? "พักการส่งภาพ" : "กำลังส่งภาพ" : stream ? "ยังไม่ส่งภาพ" : "ยังไม่ได้เลือกจอ"}
          </span>
        </div>
        <ol className="sender-steps" aria-label="สถานะการแชร์ภาพ">
          {["เลือกจอ", "เลือกพื้นที่", "ส่งภาพ"].map((label, index) => <li key={label}
            className={step === index + 1 ? "is-current" : step > index + 1 ? "is-complete" : ""}
            aria-current={step === index + 1 ? "step" : undefined}>
            <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>{label}
          </li>)}
        </ol>
        {!stream && <div className="sender-empty">
          <MonitorUp size={48} />
          <h2>ภาพจากเครื่องนี้</h2>
          <div className="sender-source-types"><span>หน้าจอ</span><span>หน้าต่าง</span><span>แท็บ</span></div>
          <Button size="lg" disabled={starting} onClick={() => void startSharing()}>
            {starting ? <LoaderCircle className="relay-spin" size={18} /> : <MonitorUp size={18} />}
            {starting ? "กำลังเปิดหน้าจอ…" : "เลือกจอที่จะแชร์"}
          </Button>
        </div>}
        {stream && editingCrop && <>
          {sending && <div className="sender-edit-notice">กำลังปรับพื้นที่ · ภาพเดิมยังส่งอยู่</div>}
          <SenderCropper stream={stream} crop={draftCrop} shape={draftShape} paused={paused} outSize={outSize}
            onChange={(c, s) => { setDraftCrop(c); setDraftShape(s); }} onPause={changePaused}
            showPause={false} previewLabel="ภาพที่จะส่ง" />
          <div className="sender-action-bar">
            <span className="sender-action-status">{sending ? "รอยืนยันพื้นที่ใหม่" : "ยังไม่มีภาพส่งออก"}</span>
            <div><Button disabled={starting} onClick={() => void applySendingCrop()}>
              {starting ? <LoaderCircle className="relay-spin" size={16} /> : <Share2 size={16} />}
              {sending ? "ใช้พื้นที่นี้" : "เริ่มส่งภาพเฉพาะส่วนนี้"}
            </Button>
            {sending && <Button disabled={starting} variant="outline" onClick={() => setEditingCrop(false)}>ยกเลิก</Button>}</div>
          </div>
        </>}
        {stream && sending && !editingCrop && <section className="sender-live-preview">
          <div className="sender-preview-heading"><h2>ภาพที่ส่งเข้าห้อง</h2><span>{outSize.w || "…"} × {outSize.h || "…"}</span></div>
          {pipelineRef.current && <div className="relay-crop-output" style={{ aspectRatio: `${outSize.w || 16} / ${outSize.h || 9}` }}>
            <CroppedVideo stream={pipelineRef.current.stream} />
          </div>}
          {paused && <p className="sender-edit-notice">พักการส่งภาพ · ปลายทางเห็นจอดำ</p>}
          <div className="sender-action-bar"><span className="sender-action-status">{connected ? "เชื่อมต่อห้องแล้ว" : "กำลังเชื่อมต่อห้อง…"}</span><div>
            <Button variant="outline" onClick={() => { setDraftCrop(crop); setDraftShape(shape); setEditingCrop(true); }}>ปรับพื้นที่ส่ง</Button>
            <Button variant={paused ? "default" : "outline"} onClick={() => changePaused(!paused)}>{paused ? "ส่งต่อ" : "หยุดส่งชั่วคราว"}</Button>
          </div></div>
        </section>}
        {senderError && <p className="sender-error" role="alert">{senderError}</p>}
        <div className="sender-bottom-bar">
          <StationConnections connected={connected} participants={participants.length} error={error} />
          <div>{stream && <Button variant="destructive" disabled={starting} onClick={stopSharing}><CircleStop size={16} />หยุดแชร์หน้าจอ</Button>}
            <Button variant="ghost" size="icon" title={copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เข้าห้อง"}
              aria-label={copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เข้าห้อง"} onClick={() => void copyInvite()}>
              {copied ? <Check size={16} /> : <Share2 size={16} />}
            </Button></div>
        </div>
      </div>
      <footer className="relay-station-footer"><span>จอ {sourceInfo(role).letter}</span><span>LIVE RELAY</span></footer>
    </main>
  );
}

function StationConnections({
  connected,
  participants,
  error,
}: {
  connected: boolean;
  participants: number;
  error: string;
}) {
  return (
    <div className="relay-station-connection">
      <span className={`relay-connection-light${connected ? " is-online" : ""}`} />
      <span>{connected ? `${participants} เครื่องเชื่อมต่อห้องแล้ว` : "รอห้องควบคุมเชื่อมต่อ"}</span>
      {error && <span className="relay-connection-error">{error}</span>}
    </div>
  );
}
