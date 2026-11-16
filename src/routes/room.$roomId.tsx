import { useEffect, useRef, useState } from "react";
import "@/control-room.css";
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

export const Route = createFileRoute("/room/$roomId")({
  validateSearch: (search: Record<string, unknown>): { view: RoomLinkView } => ({
    view: parseRoomView(search),
  }),
  head: ({ params }) => ({
    meta: [
      { title: `ห้อง ${params.roomId.slice(0, 8)} — Botnoi Live Relay` },
      { name: "description", content: "เชื่อมภาพพรีเซนต์กับคำบรรยายสดและปรับตำแหน่งได้แบบเรียลไทม์" },
      { property: "og:title", content: `ห้องถ่ายทอดสด — Botnoi Live Relay` },
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

  if (isSourceId(view)) return <RemoteStation roomId={roomId} role={view} />;
  if (view === "stage" || view === "presenter")
    return <OutputRoom roomId={roomId} presenter={view === "presenter"} />;
  return <ControlRoom roomId={roomId} />;
}

export function RemoteStation({ roomId, role }: { roomId: string; role: SourceId }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
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
    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
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
        window.alert("เปิดแชร์จอไม่สำเร็จ กรุณาอนุญาตการแชร์หน้าจอแล้วลองอีกครั้ง");
      }
    } finally {
      setStarting(false);
    }
  };

  const applySendingCrop = async () => {
    if (!stream) return;
    setStarting(true);
    try {
      changeCrop(normalizeCrop(draftCrop), draftShape);
      if (!sending) {
        const pipeline = new CropPipeline(stream, normalizeCrop(draftCrop));
        pipeline.paused = paused;
        pipelineRef.current = pipeline;
        await start(role, pipeline.stream);
        setSending(true);
      }
      setEditingCrop(false);
    } catch {
      pipelineRef.current?.stop();
      pipelineRef.current = null;
      window.alert("เริ่มส่งภาพไม่สำเร็จ กรุณาลองอีกครั้ง");
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
    await navigator.clipboard.writeText(roomInviteUrl(window.location.origin, roomId, role));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className={`relay-station relay-station-${role}`}>
      <header className="relay-station-header">
        <Link to="/" className="relay-brand relay-brand-inverse" aria-label="กลับหน้าหลัก">
          <span className="relay-brand-mark">
            <RadioTower size={18} />
          </span>
          <span>
            botnoi<span className="relay-brand-light">{" live relay"}</span>
          </span>
        </Link>
        <div className="relay-station-status">
          <span className={connected ? "relay-live-dot" : "relay-status-wait"} />{" "}
          {connected ? "เชื่อมต่อห้องแล้ว" : "เตรียมอุปกรณ์"}
        </div>
      </header>
      <div className="relay-station-content">
        <>
          <div className="relay-station-kicker">
            <FileVideo2 size={15} /> SCREEN {sourceInfo(role).letter} INPUT
          </div>
          <h1 className="relay-station-title">
            จอ {sourceInfo(role).letter}
            <br />
            <em>พร้อมส่งภาพ</em>
          </h1>
          {stream && editingCrop && (
            <>
              <SenderCropper
                stream={stream}
                crop={draftCrop}
                shape={draftShape}
                paused={paused}
                outSize={outSize}
                onChange={(c, s) => {
                  setDraftCrop(c);
                  setDraftShape(s);
                }}
                onPause={changePaused}
                showPause={false}
                previewLabel="ตัวอย่างพื้นที่ที่เลือก (ยังไม่ใช้จนกดยืนยัน)"
              />
              <div className="relay-station-actions">
                <Button disabled={starting} onClick={() => void applySendingCrop()}>
                  {sending ? "ใช้พื้นที่นี้" : "เริ่มส่งภาพเฉพาะส่วนนี้"}
                </Button>
                {sending && (
                  <Button variant="outline" onClick={() => setEditingCrop(false)}>
                    ยกเลิก
                  </Button>
                )}
              </div>
            </>
          )}
          {stream && sending && !editingCrop && (
            <div className="relay-send-status">
              <p>
                {paused
                  ? "หยุดส่งชั่วคราว — ปลายทางเห็นจอดำ"
                  : `กำลังส่ง ${outSize.w}×${outSize.h} · เฉพาะส่วนที่เลือก`}
              </p>
              {pipelineRef.current && (
                <div
                  className="relay-crop-output"
                  style={{ aspectRatio: `${outSize.w || 16} / ${outSize.h || 9}` }}
                >
                  <CroppedVideo stream={pipelineRef.current.stream} />
                </div>
              )}
              <Button
                onClick={() => {
                  setDraftCrop(crop);
                  setDraftShape(shape);
                  setEditingCrop(true);
                }}
              >
                ปรับพื้นที่ส่ง
              </Button>
              <Button variant="outline" onClick={() => changePaused(!paused)}>
                {paused ? "ส่งต่อ" : "หยุดส่งชั่วคราว"}
              </Button>
            </div>
          )}
          <div className="relay-presentation-preview" hidden={Boolean(stream)}>
            {stream ? null : (
              <div className="relay-presentation-placeholder">
                <MonitorUp size={38} />
                <span>แชร์ทั้งหน้าจอ หน้าต่าง หรือแท็บใดก็ได้</span>
              </div>
            )}
          </div>
          <div className="relay-station-actions">
            <Button
              className="relay-stage-button"
              disabled={starting}
              onClick={stream ? stopSharing : startSharing}
            >
              {starting ? (
                <LoaderCircle className="relay-spin" size={17} />
              ) : stream ? (
                <CircleStop size={17} />
              ) : (
                <MonitorUp size={17} />
              )}
              {starting ? "กำลังเชื่อมต่อ" : stream ? "หยุดแชร์หน้าจอ" : "เลือกจอที่จะแชร์"}
            </Button>
            <Button
              variant="outline"
              className="relay-copy-invite"
              onClick={() => void copyInvite()}
            >
              {copied ? <Check size={16} /> : <Share2 size={16} />}{" "}
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เข้าห้อง"}
            </Button>
          </div>
          <p className="relay-station-footnote">
            เลือกทั้งหน้าจอหรือเฉพาะหน้าต่างที่ต้องการ จากนั้นคงแท็บนี้ไว้ระหว่างการนำเสนอ
          </p>
          <StationConnections
            connected={connected}
            participants={participants.length}
            error={error}
          />
        </>
      </div>
      <footer className="relay-station-footer">
        <span>
          ROOM <b>{roomId.slice(0, 8).toUpperCase()}</b>
        </span>
        <span>PEER-TO-PEER BROADCAST</span>
      </footer>
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
