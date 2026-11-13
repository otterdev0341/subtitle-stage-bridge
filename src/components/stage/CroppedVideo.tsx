import { useState } from "react";
import { FULL_CROP, normalizeCrop, type CropRect } from "@/lib/screen-crop";

/** The only source here is the already-cropped stream received from a sender. */
export function CroppedVideo({
  stream,
  crop = FULL_CROP,
  fit = true,
  zoom = 100,
  x = 50,
  y = 50,
}: {
  stream: MediaStream;
  crop?: CropRect;
  fit?: boolean;
  zoom?: number;
  x?: number;
  y?: number;
}) {
  const settings = stream.getVideoTracks()[0]?.getSettings();
  const [size, setSize] = useState({ w: settings?.width || 16, h: settings?.height || 9 });
  const c = normalizeCrop(crop);
  const ratio = (size.w * c.w) / (size.h * c.h);
  return (
    <div className="relay-video-viewport" style={{ containerType: "size" }}>
      <div
        className="relay-video-content"
        style={{
          width: fit ? `min(100cqw, ${ratio * 100}cqh)` : `max(100cqw, ${ratio * 100}cqh)`,
          height: fit ? `min(100cqh, ${100 / ratio}cqw)` : `max(100cqh, ${100 / ratio}cqw)`,
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-${x}%, -${y}%) scale(${zoom / 100})`,
          transformOrigin: `${x}% ${y}%`,
        }}
      >
        <video
          autoPlay
          muted
          playsInline
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
          onResize={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth) setSize({ w: v.videoWidth, h: v.videoHeight });
          }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth) setSize({ w: v.videoWidth, h: v.videoHeight });
          }}
          style={{
            position: "absolute",
            maxWidth: "none",
            width: `${10000 / c.w}%`,
            height: `${10000 / c.h}%`,
            left: `${(-c.x / c.w) * 100}%`,
            top: `${(-c.y / c.h) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
