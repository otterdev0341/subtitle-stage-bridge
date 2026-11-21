import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, SquareDashedMousePointer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CroppedVideo } from "@/components/stage/CroppedVideo";
import { CROP_SHAPES, FULL_CROP, fitAspect, normalizeCrop, resizeCrop, type CropRect, type CropShape } from "@/lib/screen-crop";

type Props = {
  stream: MediaStream;
  crop: CropRect;
  shape: CropShape;
  paused: boolean;
  outSize: { w: number; h: number };
  onChange: (crop: CropRect, shape: CropShape) => void;
  onPause: (paused: boolean) => void;
  showPause?: boolean;
  previewLabel?: string;
};
const CORNERS = ["nw", "ne", "sw", "se", "n", "s", "e", "w"] as const;

export function SenderCropper({ stream, crop, shape, paused, outSize, onChange, onPause, showPause = true, previewLabel = "ภาพที่ห้องควบคุมจะได้รับ" }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 16, h: 9 });
  const drag = useRef<{ mode: "draw" | "move" | (typeof CORNERS)[number]; sx: number; sy: number; start: CropRect } | null>(null);
  const [drawing, setDrawing] = useState(true);
  const ratio = CROP_SHAPES.find((s) => s.id === shape)?.ratio;

  useEffect(() => {
    const t = stream.getVideoTracks()[0]?.getSettings();
    if (t?.width && t?.height) setDims({ w: t.width, h: t.height });
  }, [stream]);

  const begin = (mode: "move" | (typeof CORNERS)[number]) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: crop };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current, box = boxRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.sx) / box.width * 100, dy = (e.clientY - d.sy) / box.height * 100;
    const next = d.mode === "draw" ? normalizeCrop({ x: Math.min(d.start.x, d.start.x + dx), y: Math.min(d.start.y, d.start.y + dy), w: Math.abs(dx), h: Math.abs(dy) }) : d.mode === "move" ? normalizeCrop({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }) : resizeCrop(d.start, d.mode, dx, dy, ratio, dims.w, dims.h);
    onChange(next, d.mode === "draw" || shape === "full" ? "free" : shape);
  };
  const end = () => { drag.current = null; setDrawing(false); };
  const pick = (s: CropShape) => {
    setDrawing(false);
    const r = CROP_SHAPES.find((x) => x.id === s)?.ratio;
    onChange(s === "full" ? FULL_CROP : r ? fitAspect(s === shape ? crop : FULL_CROP, r, dims.w, dims.h) : crop, s);
  };
  const isFull = crop.w >= 99.5 && crop.h >= 99.5;

  return (
    <div className="relay-cropper">
      <div className="sender-crop-original">
      <div className="sender-preview-heading"><h2>ภาพต้นฉบับ</h2>
        <Button type="button" variant="outline" size="icon" title="วาดกรอบใหม่" aria-label="วาดกรอบใหม่" aria-pressed={drawing}
          className={`relay-cropper-chip${drawing ? " is-active" : ""}`} onClick={() => setDrawing(!drawing)}><SquareDashedMousePointer size={16} /></Button>
      </div>
      <div ref={boxRef} className="relay-cropper-stage" style={{ aspectRatio: `${dims.w} / ${dims.h}`, cursor: drawing ? "crosshair" : undefined }}
        onPointerDown={e => {
          if (!drawing && e.target !== e.currentTarget) return;
          const box = e.currentTarget.getBoundingClientRect();
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { mode: "draw", sx: e.clientX, sy: e.clientY, start: { x: (e.clientX - box.left) / box.width * 100, y: (e.clientY - box.top) / box.height * 100, w: 0, h: 0 } };
        }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
        <video className="relay-cropper-video" autoPlay muted playsInline onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth) setDims({ w: v.videoWidth, h: v.videoHeight }); }} ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }} />
        <div className={`relay-cropper-box${paused ? " is-paused" : ""}`} style={{ pointerEvents: drawing ? "none" : undefined, left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }} onPointerDown={begin("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
          <span className="relay-cropper-tag">{paused ? "หยุดส่งชั่วคราว" : "ส่วนที่ส่ง"}</span>
          {CORNERS.map((c) => <span key={c} role="button" aria-label={`ลากขอบหรือมุม ${c} เพื่อปรับขนาดพื้นที่ส่ง`} className={`relay-cropper-handle relay-cropper-handle-${c}`} onPointerDown={begin(c)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />)}
        </div>
      </div>
      <div className="relay-cropper-tools">
        <div className="relay-cropper-shapes" role="group" aria-label="รูปทรงพื้นที่ส่ง">
          {CROP_SHAPES.map((s) => <Button key={s.id} type="button" variant="outline" aria-pressed={shape === s.id} className={`relay-cropper-chip${shape === s.id ? " is-active" : ""}`} onClick={() => pick(s.id)}>{s.label}</Button>)}
          <Button type="button" variant="outline" className="relay-cropper-chip" onClick={() => { setDrawing(false); onChange({ x: 0, y: 75, w: 100, h: 25 }, "free"); }}>แถบคำบรรยาย</Button>
        </div>
        {showPause && <Button type="button" variant="outline" className={`relay-cropper-chip relay-cropper-pause${paused ? " is-active" : ""}`} onClick={() => onPause(!paused)}>{paused ? <><Play size={13} /> ส่งต่อ</> : <><Pause size={13} /> หยุดส่งชั่วคราว</>}</Button>}
      </div>
      </div>
      <div className="sender-crop-result">
      <div className="sender-preview-heading"><h2>{previewLabel}</h2><span>{isFull ? "เต็มจอ" : "เฉพาะพื้นที่เลือก"}</span></div>
      <div className="relay-crop-output" style={{ aspectRatio: `${dims.w * crop.w} / ${dims.h * crop.h}` }}><CroppedVideo stream={stream} crop={crop} /></div>
      {showPause && <p className="relay-cropper-status">{paused ? "หยุดส่งภาพอยู่ — ห้องควบคุมเห็นจอดำ" : `กำลังส่ง ${outSize.w || "…"}×${outSize.h || "…"}`}</p>}
      </div>
    </div>
  );
}
