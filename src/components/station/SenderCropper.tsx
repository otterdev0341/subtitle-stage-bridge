import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { CROP_SHAPES, FULL_CROP, fitAspect, normalizeCrop, resizeCrop, type CropRect, type CropShape } from "@/lib/screen-crop";

type Props = {
  stream: MediaStream;
  crop: CropRect;
  shape: CropShape;
  paused: boolean;
  outSize: { w: number; h: number };
  onChange: (crop: CropRect, shape: CropShape) => void;
  onPause: (paused: boolean) => void;
};
const CORNERS = ["nw", "ne", "sw", "se"] as const;

export function SenderCropper({ stream, crop, shape, paused, outSize, onChange, onPause }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 16, h: 9 });
  const drag = useRef<{ mode: "move" | (typeof CORNERS)[number]; sx: number; sy: number; start: CropRect } | null>(null);
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
    const next = d.mode === "move" ? normalizeCrop({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }) : resizeCrop(d.start, d.mode, dx, dy, ratio, dims.w, dims.h);
    onChange(next, shape === "full" ? "free" : shape);
  };
  const end = () => { drag.current = null; };
  const pick = (s: CropShape) => {
    const r = CROP_SHAPES.find((x) => x.id === s)?.ratio;
    onChange(s === "full" ? FULL_CROP : r ? fitAspect(s === shape ? crop : FULL_CROP, r, dims.w, dims.h) : crop, s);
  };
  const isFull = crop.w >= 99.5 && crop.h >= 99.5;

  return (
    <div className="relay-cropper">
      <div ref={boxRef} className="relay-cropper-stage" style={{ aspectRatio: `${dims.w} / ${dims.h}` }}>
        <video className="relay-cropper-video" autoPlay muted playsInline onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth) setDims({ w: v.videoWidth, h: v.videoHeight }); }} ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }} />
        <div className={`relay-cropper-box${paused ? " is-paused" : ""}`} style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }} onPointerDown={begin("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <span className="relay-cropper-tag">{paused ? "หยุดส่งชั่วคราว" : "ส่วนที่ส่ง"}</span>
          {CORNERS.map((c) => <span key={c} role="button" aria-label="ลากมุมเพื่อปรับขนาดพื้นที่ส่ง" className={`relay-cropper-handle relay-cropper-handle-${c}`} onPointerDown={begin(c)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />)}
        </div>
      </div>
      <div className="relay-cropper-tools">
        <div className="relay-cropper-shapes" role="group" aria-label="รูปทรงพื้นที่ส่ง">
          {CROP_SHAPES.map((s) => <button key={s.id} type="button" className={`relay-cropper-chip${shape === s.id ? " is-active" : ""}`} onClick={() => pick(s.id)}>{s.label}</button>)}
        </div>
        <button type="button" className={`relay-cropper-chip relay-cropper-pause${paused ? " is-active" : ""}`} onClick={() => onPause(!paused)}>{paused ? <><Play size={13} /> ส่งต่อ</> : <><Pause size={13} /> หยุดส่งชั่วคราว</>}</button>
      </div>
      <p className="relay-cropper-status">{paused ? "หยุดส่งภาพอยู่ — ห้องควบคุมเห็นจอดำ" : `กำลังส่ง ${outSize.w || "…"}×${outSize.h || "…"} · ${isFull ? "เต็มจอ" : "บางส่วนของจอ"}`} · ส่วนนอกกรอบไม่ถูกส่งออกจากเครื่องนี้</p>
    </div>
  );
}
