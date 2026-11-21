import { useEffect, useState, type CSSProperties } from "react";
import { captionIsVisible, defaultCaption, type CaptionTrack } from "@/lib/captions";

export function CaptionOverlay({ track }: { track: CaptionTrack | undefined }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!track?.expiresAt || track.held) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, track.expiresAt - Date.now()) + 10,
    );
    return () => window.clearTimeout(timer);
  }, [track]);
  const visible = !!track && captionIsVisible(track, now);
  const [retained, setRetained] = useState(visible ? track : undefined);
  const animation = track?.style.animation ?? "fill-fade";
  useEffect(() => {
    if (visible) {
      setRetained(track);
      return;
    }
    if (animation === "none") {
      setRetained(undefined);
      return;
    }
    const timer = window.setTimeout(() => setRetained(undefined), 300);
    return () => window.clearTimeout(timer);
  }, [track, visible, animation]);
  const shown = visible ? track : animation === "none" ? undefined : retained;
  if (!shown || !shown.text) return null;
  const appearance = { ...defaultCaption().style, ...shown.style };
  const style = {
    bottom: `${appearance.bottom}%`,
    fontSize: `${appearance.fontSize / 19.2}cqw`,
    background: `rgb(0 0 0 / ${appearance.background}%)`,
    "--caption-lines": appearance.maxLines,
  } as CSSProperties;
  return (
    <div key={shown.segmentId} className={`control-caption caption-${animation}${visible ? "" : " caption-exiting"}`} style={style}>
      {appearance.bilingual && shown.source && (
        <p lang={shown.sourceLanguage} className="control-caption-original">
          {shown.source}
        </p>
      )}
      <p lang={shown.targetLanguage}>{shown.text}</p>
    </div>
  );
}
