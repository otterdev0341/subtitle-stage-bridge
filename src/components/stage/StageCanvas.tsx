import { SOURCES, sourceTitle } from "@/lib/sources";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { FileVideo2, Languages, Move } from "lucide-react";
import {
  arrangementRegions,
  clampToRegion,
  moveRect,
  type Corner,
  type LayerName,
  type LayerRect,
  type StageLayout,
} from "@/lib/stage-layout";

function useHoldTransition(hold: StageLayout["hold"], cut: boolean) {
  const [shown, setShown] = useState(hold);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (hold) {
      setShown(hold);
      setLeaving(false);
      return undefined;
    }
    if (cut) {
      setShown(null);
      return undefined;
    }
    setLeaving(true);
    const t = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, 450);
    return () => window.clearTimeout(t);
  }, [hold?.id, hold?.target, cut]);
  return { shown, leaving };
}
import { HoldSlide } from "./HoldSlide";
import { StageMedia, SourcePlane } from "./StageMedia";
import {
  freezeContent,
  resolveContent,
  resizeContent,
  resizeMask,
  translateGroup,
  type StageEditMode,
  type SourceSize,
} from "@/lib/stage-geometry";

type Props = {
  layout: StageLayout;
  streams: Partial<Record<LayerName, MediaStream | null>>;
  caption: string;
  editable: boolean;
  editMode?: StageEditMode;
  onSelect?: (name: LayerName) => void;
  onChangeLayer?: (name: LayerName, rect: LayerRect) => void;
  onSourceSize?: (name: LayerName, size: SourceSize) => void;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  children?: React.ReactNode;
  onEditStart?: () => void;
  onEditEnd?: () => void;
};

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const MASK_HANDLES: Corner[] = [...CORNERS, "n", "s", "w", "e"];
const label = (name: LayerName, title?: string) => `จอ ${sourceTitle(name, title)}`;

export function StageCanvas({
  layout,
  streams,
  caption,
  editable,
  onSelect,
  onChangeLayer,
  stageRef,
  className,
  children,
  onEditStart,
  onEditEnd,
  editMode = "mask",
  onSourceSize,
}: Props) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    name: LayerName;
    mode: "move" | Corner;
    sx: number;
    sy: number;
    start: LayerRect;
    editMode: StageEditMode;
  } | null>(null);

  const begin = (name: LayerName, mode: "move" | Corner) => (event: React.PointerEvent) => {
    if (!editable || layout.layers[name].locked) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(name);
    if (editMode === "group" && mode !== "move") return;
    onEditStart?.();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
    drag.current = {
      name,
      mode,
      sx: event.clientX,
      sy: event.clientY,
      start: freezeContent(layout.layers[name], layout.aspect),
      editMode,
    };
  };
  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    const box = innerRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = ((event.clientX - d.sx) / box.width) * 100;
    const dy = ((event.clientY - d.sy) / box.height) * 100;
    let next: LayerRect;
    if (d.editMode === "content") {
      const content = resolveContent(d.start, layout.aspect);
      const px = (dx * layout.aspect.w) / 100,
        py = (dy * layout.aspect.h) / 100;
      next = {
        ...d.start,
        content:
          d.mode === "move"
            ? { ...content, x: content.x + px, y: content.y + py }
            : resizeContent(content, d.mode, px, py),
      };
    } else {
      next =
        d.mode === "move"
          ? moveRect(d.start, dx, dy)
          : resizeMask(
              d.start,
              d.mode,
              (dx * layout.aspect.w) / 100,
              (dy * layout.aspect.h) / 100,
              layout.aspect,
              event.shiftKey || !!d.start.lockAspect,
            );
      const regions = arrangementRegions(layout.arrangement, layout.split, layout.splitSwap);
      if (regions?.[d.name])
        next = clampToRegion(next, regions[d.name]!, event.shiftKey || !!d.start.lockAspect);
      if (d.editMode === "group") next = translateGroup(d.start, next, layout.aspect);
    }
    onChangeLayer?.(d.name, next);
  };
  const end = () => {
    if (drag.current) onEditEnd?.();
    drag.current = null;
    setDragging(false);
  };

  const { shown, leaving } = useHoldTransition(layout.hold, layout.transition === "cut");
  const holdTarget = shown?.target;
  const animClass = `relay-hold-anim relay-hold-anim-${layout.transition ?? "fade"}${leaving ? " is-leaving" : ""}`;
  const selected = layout.layers[layout.activeLayer];
  const selectedContent = resolveContent(selected, layout.aspect);
  const contentStyle = {
    left: `${(selectedContent.x / layout.aspect.w) * 100}%`,
    top: `${(selectedContent.y / layout.aspect.h) * 100}%`,
    width: `${(selectedContent.width / layout.aspect.w) * 100}%`,
    height: `${(selectedContent.height / layout.aspect.h) * 100}%`,
  };
  const guides = editable && !shown && !layout.blackout;
  const ghostClip = `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${selected.x}% ${selected.y}%, ${selected.x}% ${selected.y + selected.height}%, ${selected.x + selected.width}% ${selected.y + selected.height}%, ${selected.x + selected.width}% ${selected.y}%, ${selected.x}% ${selected.y}%)`;
  const names: LayerName[] = SOURCES.map((s) => s.id);

  return (
    <div ref={stageRef} className={`relay-stage-frame ${className ?? ""}`}>
      <div
        ref={innerRef}
        className={`relay-stage-box${dragging ? " is-dragging" : ""}`}
        style={
          {
            aspectRatio: `${layout.aspect.w} / ${layout.aspect.h}`,
            "--stage-fit-width": `${(100 * layout.aspect.w) / layout.aspect.h}cqh`,
            "--stage-fit-height": `${(100 * layout.aspect.h) / layout.aspect.w}cqw`,
          } as React.CSSProperties
        }
      >
        {guides && streams[layout.activeLayer] && (
          <div className="relay-content-ghost" style={{ clipPath: ghostClip }}>
            <div style={{ position: "absolute", ...contentStyle }}>
              <SourcePlane stream={streams[layout.activeLayer] ?? null} layer={selected} />
            </div>
          </div>
        )}
        {names.map((name) => {
          const rect = layout.layers[name];
          if (!rect.visible && (!editable || layout.activeLayer !== name)) return null;
          const stream = streams[name] ?? null;
          const active = editable && layout.activeLayer === name;
          return (
            <div
              key={name}
              className={`relay-stage-layer relay-stage-layer-${name}${active ? " is-active" : ""}${editable ? " is-editable" : ""}${rect.knockout ? " is-knockout" : ""}${!rect.visible ? " is-hidden-layer" : ""}`}
              style={{
                left: `${rect.x}%`,
                top: `${rect.y}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
                zIndex: rect.z,
                opacity: (rect.opacity ?? 100) / 100,
              }}
              onPointerDown={editMode === "content" ? () => onSelect?.(name) : begin(name, "move")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onLostPointerCapture={end}
            >
              {holdTarget === name && shown && (
                <div key={shown.id} className={`relay-stage-hold-layer ${animClass}`}>
                  <HoldSlide
                    id={shown.id}
                    texts={layout.holdTexts}
                    image={layout.holdImages?.[shown.id]}
                  />
                </div>
              )}
              <StageMedia
                stream={stream}
                layer={rect}
                aspect={layout.aspect}
                caption={name === "translation" ? caption : ""}
                fontScale={layout.fontScale}
                onSourceSize={onSourceSize ? (size) => onSourceSize(name, size) : undefined}
              />
              {!stream && !(name === "translation" && caption) && editable && (
                <div className="relay-stage-layer-empty relay-empty-overlay">
                  {name === "presentation" ? <FileVideo2 size={20} /> : <Languages size={20} />}
                  <span>รอภาพจากจอ {sourceTitle(name, rect.name)}</span>
                </div>
              )}
              {editable && (
                <>
                  <span className="relay-stage-layer-tag">
                    {label(name, rect.name)} · Mask{active && <Move size={11} />}
                  </span>
                  {active &&
                    editMode === "mask" &&
                    !rect.locked &&
                    MASK_HANDLES.map((c) => (
                      <span
                        key={c}
                        role="button"
                        aria-label={`ปรับ Mask ${label(name, rect.name)} ขอบ ${c}`}
                        className={`relay-stage-handle relay-stage-handle-${c}`}
                        onPointerDown={begin(name, c)}
                        onPointerMove={move}
                        onPointerUp={end}
                        onPointerCancel={end}
                        onLostPointerCapture={end}
                      />
                    ))}
                </>
              )}
            </div>
          );
        })}
        {guides && (
          <div
            className={`relay-content-guide${editMode === "content" ? " is-editing" : ""}`}
            style={contentStyle}
            onPointerDown={begin(layout.activeLayer, "move")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
          >
            <span className="relay-content-guide-label">
              {sourceTitle(layout.activeLayer, selected.name)} · Content ·{" "}
              {Math.round(selectedContent.width)}×{Math.round(selectedContent.height)}
            </span>
            {editMode === "content" &&
              !selected.locked &&
              CORNERS.map((c) => (
                <span
                  key={c}
                  role="button"
                  aria-label={`ปรับ Content มุม ${c}`}
                  className={`relay-stage-handle relay-stage-handle-${c}`}
                  onPointerDown={begin(layout.activeLayer, c)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onLostPointerCapture={end}
                />
              ))}
          </div>
        )}
        {holdTarget === "stage" && shown && (
          <div key={shown.id} className={`relay-stage-hold-full ${animClass}`}>
            <HoldSlide
              id={shown.id}
              texts={layout.holdTexts}
              image={layout.holdImages?.[shown.id]}
            />
          </div>
        )}
        {layout.blackout && <div className="relay-blackout" />}
        {children}
      </div>
    </div>
  );
}
