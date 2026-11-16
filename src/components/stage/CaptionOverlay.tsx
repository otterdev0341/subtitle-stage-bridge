import { useEffect, useState, type CSSProperties } from "react";
import { captionIsVisible, type CaptionTrack } from "@/lib/captions";

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
  if (!track || !captionIsVisible(track, now)) return null;
  const style = {
    bottom: `${track.style.bottom}%`,
    fontSize: `${track.style.fontSize / 19.2}cqw`,
    background: `rgb(0 0 0 / ${track.style.background}%)`,
    "--caption-lines": track.style.maxLines,
  } as CSSProperties;
  return (
    <div className="control-caption" style={style}>
      {track.style.bilingual && track.source && (
        <p lang={track.sourceLanguage} className="control-caption-original">
          {track.source}
        </p>
      )}
      <p lang={track.targetLanguage}>{track.text}</p>
    </div>
  );
}
