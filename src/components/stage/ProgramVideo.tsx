import { useEffect, useRef, useState } from "react";
export function ProgramVideo({
  stream,
  className = "",
}: {
  stream: MediaStream | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [fresh, setFresh] = useState(false),
    [stalled, setStalled] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    setFresh(false);
    setStalled(false);
    if (!video || !stream) return;
    video.srcObject = stream;
    let last = Date.now(),
      lastTime = -1,
      frame = 0,
      cancelled = false;
    const frameReady = () => {
      if (cancelled) return;
      last = Date.now();
      setFresh(true);
      setStalled(false);
      frame = video.requestVideoFrameCallback?.(frameReady) ?? 0;
    };
    frame = video.requestVideoFrameCallback?.(frameReady) ?? 0;
    const check = setInterval(() => {
      if (
        !video.requestVideoFrameCallback &&
        video.readyState >= 2 &&
        video.currentTime !== lastTime &&
        stream.getVideoTracks().some((track) => track.readyState === "live" && !track.muted)
      ) {
        lastTime = video.currentTime;
        last = Date.now();
        setFresh(true);
        setStalled(false);
      }
      if (Date.now() - last > 5000) {
        setFresh(false);
        setStalled(true);
      }
    }, 1000);
    void video.play().catch(() => {});
    return () => {
      cancelled = true;
      clearInterval(check);
      if (frame) video.cancelVideoFrameCallback?.(frame);
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <div className={`relay-program-video ${className}`}>
      <video ref={videoRef} autoPlay muted playsInline onPlaying={() => setFresh(true)} />
      {(!stream || !fresh) && (
        <div className="relay-program-wait" role="status">
          {stream
            ? stalled
              ? "สัญญาณ LIVE ขาด · กำลังรอภาพใหม่"
              : "กำลังเปิดภาพ LIVE"
            : "รอสัญญาณ LIVE จาก CONTROL ROOM"}
        </div>
      )}
    </div>
  );
}
