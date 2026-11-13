import * as React from "react";
import { useRef } from "react";
import { FileVideo2, Languages, Move } from "lucide-react";
import { moveRect, resizeFromCorner, type Corner, type LayerName, type LayerRect, type StageLayout } from "@/lib/stage-layout";
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
const LABEL: Record<LayerName, string> = { presentation: "A · สไลด์", translation: "B · คำแปล" };

export function StageCanvas({ layout, streams, caption, editable, onSelect, onChangeLayer, stageRef, className, children }: Props) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ name: LayerName; mode: "move" | Corner; sx: number; sy: number; start: LayerRect } | null>(null);

  const begin = (name: LayerName, mode: "move" | Corner) => (event: React.PointerEvent) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(name);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { name, mode, sx: event.clientX, sy: event.clientY, start: layout.layers[name] };
  };
  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    const box = innerRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (event.clientX - d.sx) / box.width * 100;
    const dy = (event.clientY - d.sy) / box.height * 100;
    onChangeLayer?.(d.name, d.mode === "move" ? moveRect(d.start, dx, dy) : resizeFromCorner(d.start, d.mode, dx, dy, event.shiftKey));
  };
  const end = () => { drag.current = null; };

  const holdTarget = layout.hold?.target;
  const names: LayerName[] = ["presentation", "translation"];

  return (
    <div ref={stageRef} className={`relay-stage-frame ${className ?? ""}`}>
      <div ref={innerRef} className="relay-stage-box" style={{ aspectRatio: `${layout.aspect.w} / ${layout.aspect.h}` }}>
        {names.map((name) => {
          const rect = layout.layers[name];
          if (!rect.visible) return null;
          const stream = streams[name];
          const active = editable && layout.activeLayer === name;
          return (
            <div
              key={name}
              className={`relay-stage-layer relay-stage-layer-${name}${active ? " is-active" : ""}${editable ? " is-editable" : ""}${rect.knockout ? " is-knockout" : ""}`}
              style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, zIndex: rect.z }}
              onPointerDown={begin(name, "move")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              {holdTarget === name && layout.hold ? <HoldSlide id={layout.hold.id} texts={layout.holdTexts} /> : stream ? (
                <video className="relay-stage-layer-video" style={{ objectFit: rect.fit ? "contain" : "cover", objectPosition: `${rect.cropX}% ${rect.cropY}%` }} autoPlay muted playsInline ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }} />
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
        {holdTarget === "stage" && layout.hold && <div className="relay-stage-hold-full"><HoldSlide id={layout.hold.id} texts={layout.holdTexts} /></div>}
        {children}
      </div>
    </div>
  );
}
