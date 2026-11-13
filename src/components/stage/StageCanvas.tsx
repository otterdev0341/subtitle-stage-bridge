import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { FileVideo2, Languages, Move } from "lucide-react";
import { arrangementRegions, clampToRegion, moveRect, resizeFromCorner, type Corner, type LayerName, type LayerRect, type StageLayout } from "@/lib/stage-layout";

function useHoldTransition(hold: StageLayout["hold"], cut: boolean) {
  const [shown, setShown] = useState(hold);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (hold) { setShown(hold); setLeaving(false); return undefined; }
    if (cut) { setShown(null); return undefined; }
    setLeaving(true);
    const t = window.setTimeout(() => { setShown(null); setLeaving(false); }, 450);
    return () => window.clearTimeout(t);
  }, [hold?.id, hold?.target, cut]);
  return { shown, leaving };
}
import { HoldSlide } from "./HoldSlide";

type Props = {
  layout: StageLayout;
  streams: Record<LayerName, MediaStream | null>;
  caption: string;
  editable: boolean;
  onSelect?: (name: LayerName) => void;
  onChangeLayer?: (name: LayerName, rect: LayerRect) => void;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  children?: React.ReactNode;
};

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const LABEL: Record<LayerName, string> = { presentation: "จอ A", translation: "จอ B" };

export function StageCanvas({ layout, streams, caption, editable, onSelect, onChangeLayer, stageRef, className, children }: Props) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ name: LayerName; mode: "move" | Corner; sx: number; sy: number; start: LayerRect } | null>(null);

  const begin = (name: LayerName, mode: "move" | Corner) => (event: React.PointerEvent) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(name);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
    drag.current = { name, mode, sx: event.clientX, sy: event.clientY, start: layout.layers[name] };
  };
  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    const box = innerRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (event.clientX - d.sx) / box.width * 100;
    const dy = (event.clientY - d.sy) / box.height * 100;
    let next = d.mode === "move" ? moveRect(d.start, dx, dy) : resizeFromCorner(d.start, d.mode, dx, dy, event.shiftKey);
    const regions = arrangementRegions(layout.arrangement, layout.split, layout.splitSwap);
    if (regions) next = clampToRegion(next, regions[d.name]);
    onChangeLayer?.(d.name, next);
  };
  const end = () => { drag.current = null; setDragging(false); };

  const { shown, leaving } = useHoldTransition(layout.hold, layout.transition === "cut");
  const holdTarget = shown?.target;
  const animClass = `relay-hold-anim relay-hold-anim-${layout.transition ?? "fade"}${leaving ? " is-leaving" : ""}`;
  const names: LayerName[] = ["presentation", "translation"];

  return (
    <div ref={stageRef} className={`relay-stage-frame ${className ?? ""}`}>
      <div ref={innerRef} className={`relay-stage-box${dragging ? " is-dragging" : ""}`} style={{ aspectRatio: `${layout.aspect.w} / ${layout.aspect.h}` }}>
        {names.map((name) => {
          const rect = layout.layers[name];
          if (!rect.visible) return null;
          const stream = streams[name];
          const active = editable && layout.activeLayer === name;
          return (
            <div
              key={name}
              className={`relay-stage-layer relay-stage-layer-${name}${active ? " is-active" : ""}${editable ? " is-editable" : ""}${rect.knockout ? " is-knockout" : ""}`}
              style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, zIndex: rect.z, opacity: (rect.opacity ?? 100) / 100 }}
              onPointerDown={begin(name, "move")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              {holdTarget === name && shown && <div key={shown.id} className={`relay-stage-hold-layer ${animClass}`}><HoldSlide id={shown.id} texts={layout.holdTexts} image={layout.holdImages?.[shown.id]} /></div>}
              {stream ? (
                <video className="relay-stage-layer-video" style={{ objectFit: rect.fit ? "contain" : "cover", objectPosition: `${rect.cropX}% ${rect.cropY}%`, transform: `scale(${(rect.zoom ?? 100) / 100})`, transformOrigin: `${rect.cropX}% ${rect.cropY}%` }} autoPlay muted playsInline ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }} />
              ) : name === "translation" && caption ? (
                <div className="relay-stage-layer-caption" lang="th" style={{ "--caption-scale": String(layout.fontScale / 50) } as React.CSSProperties}>{caption}</div>
              ) : editable ? (
                <div className="relay-stage-layer-empty">{name === "presentation" ? <FileVideo2 size={20} /> : <Languages size={20} />}<span>รอภาพจากจอ {name === "presentation" ? "A" : "B"}</span></div>
              ) : null}
              {editable && (
                <>
                  <span className="relay-stage-layer-tag">{LABEL[name]}{active && <Move size={11} />}</span>
                  {active && CORNERS.map((c) => (
                    <span key={c} role="button" aria-label={`ลากมุมเพื่อปรับขนาด ${LABEL[name]}`} className={`relay-stage-handle relay-stage-handle-${c}`} onPointerDown={begin(name, c)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
                  ))}
                </>
              )}
            </div>
          );
        })}
        {holdTarget === "stage" && shown && <div key={shown.id} className={`relay-stage-hold-full ${animClass}`}><HoldSlide id={shown.id} texts={layout.holdTexts} image={layout.holdImages?.[shown.id]} /></div>}
        {children}
      </div>
    </div>
  );
}
