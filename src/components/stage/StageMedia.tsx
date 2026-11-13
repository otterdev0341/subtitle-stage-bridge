import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FULL_CROP, normalizeCrop } from "@/lib/screen-crop";
import { maskPixels, resolveContent, type SourceSize } from "@/lib/stage-geometry";
import type { LayerRect, StageLayout } from "@/lib/stage-layout";

export function SourcePlane({
  stream,
  layer,
  onSourceSize,
  caption = "",
  fontScale = 50,
}: {
  stream: MediaStream | null;
  layer: LayerRect;
  onSourceSize?: ((size: SourceSize) => void) | undefined;
  caption?: string;
  fontScale?: number;
}) {
  const crop = normalizeCrop(layer.sourceCrop ?? FULL_CROP);
  const report = (video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight)
      onSourceSize?.({ w: video.videoWidth, h: video.videoHeight });
  };
  return (
    <div className="relay-source-plane">
      {stream ? (
        <video
          autoPlay
          muted
          playsInline
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
          onLoadedMetadata={(e) => report(e.currentTarget)}
          onResize={(e) => report(e.currentTarget)}
          style={{
            position: "absolute",
            maxWidth: "none",
            width: `${10000 / crop.w}%`,
            height: `${10000 / crop.h}%`,
            left: `${(-crop.x / crop.w) * 100}%`,
            top: `${(-crop.y / crop.h) * 100}%`,
          }}
        />
      ) : caption ? (
        <div
          className="relay-source-caption"
          lang="th"
          style={{ fontSize: `${(2.4 * fontScale) / 50}cqw` }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}

/** Content uses stage coordinates. The mask is only a clipping window, never a sizing input. */
export function StageMedia({
  stream,
  layer,
  aspect,
  onSourceSize,
  caption = "",
  fontScale = 50,
}: {
  stream: MediaStream | null;
  layer: LayerRect;
  aspect: StageLayout["aspect"];
  onSourceSize?: ((size: SourceSize) => void) | undefined;
  caption?: string;
  fontScale?: number;
}) {
  const [size, setSize] = useState<SourceSize | null>(null);
  const reporter = useRef(onSourceSize);
  reporter.current = onSourceSize;
  useEffect(() => {
    if (size && (!layer.content || layer.sourceSize?.w !== size.w || layer.sourceSize.h !== size.h))
      reporter.current?.(size);
  }, [size, layer.content, layer.sourceSize]);
  const mask = maskPixels(layer, aspect),
    content = resolveContent(layer, aspect, size ?? layer.sourceSize);
  const style: CSSProperties = {
    position: "absolute",
    left: `${((content.x - mask.x) / mask.width) * 100}%`,
    top: `${((content.y - mask.y) / mask.height) * 100}%`,
    width: `${(content.width / mask.width) * 100}%`,
    height: `${(content.height / mask.height) * 100}%`,
  };
  return (
    <div className="relay-stage-media relay-mask-viewport">
      <div className="relay-content-transform" style={style}>
        <SourcePlane
          stream={stream}
          layer={layer}
          caption={caption}
          fontScale={fontScale}
          onSourceSize={(next) => {
            setSize((before) => (before?.w === next.w && before.h === next.h ? before : next));
          }}
        />
      </div>
    </div>
  );
}
