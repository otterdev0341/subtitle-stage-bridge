import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SOURCES, sourceTitle, type SourceId } from "@/lib/sources";
import type { StageLayout } from "@/lib/stage-layout";
import type { SourceCandidate } from "@/lib/use-broadcast-session";
import type { SourceStreams } from "@/lib/program-pipeline";
import type { SourceSize } from "@/lib/stage-geometry";

function InputVideo({
  stream,
  onSize,
  onHealth,
}: {
  stream: MediaStream;
  onSize?: ((size: SourceSize) => void) | undefined;
  onHealth?: ((healthy: boolean) => void) | undefined;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null),
    reportHealth = useRef(onHealth);
  reportHealth.current = onHealth;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let last = Date.now(),
      lastTime = -1,
      frame = 0,
      cancelled = false,
      previous: boolean | null = null;
    const report = (value: boolean) => {
      if (previous !== value) {
        previous = value;
        reportHealth.current?.(value);
      }
    };
    const tick = () => {
      if (cancelled) return;
      last = Date.now();
      report(true);
      frame = video.requestVideoFrameCallback?.(tick) ?? 0;
    };
    frame = video.requestVideoFrameCallback?.(tick) ?? 0;
    const timer = setInterval(() => {
      const tracks = stream.getVideoTracks();
      if (
        !video.requestVideoFrameCallback &&
        video.readyState >= 2 &&
        video.currentTime !== lastTime
      ) {
        lastTime = video.currentTime;
        last = Date.now();
        report(true);
      }
      const box = video.getBoundingClientRect();
      const inView =
        document.visibilityState !== "hidden" && box.bottom > 0 && box.top < window.innerHeight;
      if (
        tracks.every((t) => t.readyState === "ended") ||
        tracks.some((t) => t.muted) ||
        (inView && Date.now() - last > 5000)
      )
        report(false);
      else if (!inView) report(true);
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (frame) video.cancelVideoFrameCallback?.(frame);
    };
  }, [stream]);
  const report = (v: HTMLVideoElement) => {
    if (v.videoWidth && v.videoHeight) onSize?.({ w: v.videoWidth, h: v.videoHeight });
  };
  return (
    <video
      autoPlay
      muted
      playsInline
      ref={(el) => {
        videoRef.current = el;
        if (el && el.srcObject !== stream) el.srcObject = stream;
      }}
      onLoadedMetadata={(e) => report(e.currentTarget)}
      onResize={(e) => report(e.currentTarget)}
    />
  );
}
export function SourcePreview({
  layout,
  streams,
  onSelect,
  onToggle,
  onCopy,
  copied,
  onSize,
  candidates,
  onReplace,
  health,
  onHealth,
}: {
  layout: StageLayout;
  streams: SourceStreams;
  onSelect: (id: SourceId) => void;
  onToggle: (id: SourceId) => void;
  onCopy: (id: SourceId) => void;
  copied: string | null;
  onSize: (id: SourceId, size: SourceSize) => void;
  health: Partial<Record<SourceId, boolean>>;
  onHealth: (id: SourceId, healthy: boolean) => void;
  candidates: SourceCandidate[];
  onReplace: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<SourceId | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
  }, [expanded]);
  const status = (id: SourceId) => {
    const healthy = Boolean(streams[id]) && health[id] !== false;
    const layer = layout.layers[id];
    if (!healthy) return "OFFLINE";
    if (!layer.visible) return "ซ่อนจาก LIVE";
    return layout.blackout || layout.hold?.target === "stage" || layout.hold?.target === id
      ? "พักภาพอยู่"
      : "ON AIR";
  };
  return (
    <section className="relay-sources" aria-label="Source Preview A–E">
      <div className="relay-sources-heading">
        <div>
          <h2>Source Preview</h2>
          <p>เลือกแท็บเพื่อดูภาพต้นทางและแก้ไขจอนั้น · ไม่เปลี่ยนการแสดงใน LIVE</p>
        </div>
        <span>{SOURCES.filter((s) => streams[s.id]).length}/5 เชื่อมต่อ</span>
      </div>
      <div className="relay-source-tabs" role="tablist" aria-label="เลือกจอ Source Preview">
        {SOURCES.map((source, index) => (
          <button
            key={source.id}
            type="button"
            role="tab"
            id={`source-tab-${source.id}`}
            aria-label={`จอ ${source.letter} · ${layout.layers[source.id].name || source.name}`}
            aria-selected={layout.activeLayer === source.id}
            aria-controls={`source-panel-${source.id}`}
            tabIndex={layout.activeLayer === source.id ? 0 : -1}
            style={{ "--source-color": source.color } as CSSProperties}
            onClick={() => onSelect(source.id)}
            onKeyDown={(e) => {
              let next = index;
              if (e.key === "ArrowRight") next = (index + 1) % SOURCES.length;
              else if (e.key === "ArrowLeft") next = (index + SOURCES.length - 1) % SOURCES.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = SOURCES.length - 1;
              else return;
              e.preventDefault();
              onSelect(SOURCES[next]!.id);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            <strong>{sourceTitle(source.id, layout.layers[source.id].name)}</strong>
            <span
              className={`relay-tab-status${status(source.id) === "ON AIR" ? " is-on-air" : ""}`}
            >
              {status(source.id)}
            </span>
            {candidates.some((p) => p.role === source.id) && <small>มีเครื่องรอใช้ช่องนี้</small>}
          </button>
        ))}
      </div>
      <div className="relay-source-panels">
        {SOURCES.map((source) => {
          const layer = layout.layers[source.id],
            stream = streams[source.id],
            selected = layout.activeLayer === source.id;
          const healthy = Boolean(stream) && health[source.id] !== false;
          const onAir =
            layer.visible &&
            healthy &&
            !layout.blackout &&
            layout.hold?.target !== "stage" &&
            layout.hold?.target !== source.id;
          return (
            <article
              key={source.id}
              className="relay-source-panel"
              role="tabpanel"
              id={`source-panel-${source.id}`}
              aria-labelledby={`source-tab-${source.id}`}
              hidden={!selected}
              style={{ "--source-color": source.color } as CSSProperties}
            >
              <div className="relay-source-panel-preview">
                <span className="relay-source-thumbnail">
                  {stream ? (
                    <InputVideo
                      stream={stream}
                      onSize={(size) => onSize(source.id, size)}
                      onHealth={(value) => onHealth(source.id, value)}
                    />
                  ) : (
                    <span>ยังไม่มีสัญญาณ {source.letter}</span>
                  )}
                  <span className={`relay-source-air${onAir ? " is-on-air" : ""}`}>
                    {onAir
                      ? "ON AIR"
                      : !healthy
                        ? "OFFLINE"
                        : layer.visible
                          ? "พักภาพอยู่"
                          : "ซ่อนจาก LIVE"}
                  </span>
                  {stream && !healthy && <span className="relay-source-lost">สัญญาณขาด</span>}
                </span>
              </div>
              <div className="relay-source-panel-tools">
                <div className="relay-source-panel-title">
                  <strong>{sourceTitle(source.id, layer.name)}</strong>
                  <span>กำลังดูและแก้ไขจอนี้</span>
                </div>
                <div className="relay-source-meta">
                  {layer.sourceSize && stream
                    ? `${layer.sourceSize.w}×${layer.sourceSize.h}`
                    : "รอภาพต้นทาง"}
                </div>
                <button
                  type="button"
                  className={`relay-source-visibility${layer.visible ? " is-on" : ""}`}
                  aria-label={`${layer.visible ? "ซ่อน" : "แสดง"}จอ ${source.letter} ใน LIVE`}
                  aria-pressed={layer.visible}
                  onClick={() => onToggle(source.id)}
                >
                  {layer.visible ? "◉ แสดงใน LIVE · กดเพื่อซ่อน" : "○ ซ่อนอยู่ · กดเพื่อแสดง"}
                </button>
                <div className="relay-source-actions">
                  <button type="button" onClick={() => onCopy(source.id)}>
                    {copied === source.id ? "คัดลอกแล้ว" : `ลิงก์ส่งภาพ ${source.letter}`}
                  </button>
                  <button type="button" disabled={!stream} onClick={() => setExpanded(source.id)}>
                    ขยาย Preview
                  </button>
                </div>
                {candidates
                  .filter((p) => p.role === source.id)
                  .map((p) => (
                    <div className="relay-source-conflict" key={p.id}>
                      <span>มีเครื่องใหม่รอใช้ช่อง {source.letter}</span>
                      <button type="button" onClick={() => onReplace(p.id)}>
                        ใช้เครื่องนี้แทน
                      </button>
                    </div>
                  ))}
              </div>
            </article>
          );
        })}
      </div>
      {expanded && (
        <dialog
          ref={dialog}
          className="relay-source-dialog"
          onCancel={() => setExpanded(null)}
          onClose={() => setExpanded(null)}
        >
          <header>
            <h2>Source {sourceTitle(expanded, layout.layers[expanded].name)} · ไม่เปลี่ยนภาพ LIVE</h2>
            <button
              type="button"
              onClick={() => {
                dialog.current?.close();
                setExpanded(null);
              }}
            >
              ปิด Preview
            </button>
          </header>
          {streams[expanded] ? <InputVideo stream={streams[expanded]!} /> : <p>สัญญาณต้นทางขาด</p>}
        </dialog>
      )}
    </section>
  );
}
