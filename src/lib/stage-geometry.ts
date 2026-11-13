import { FULL_CROP, normalizeCrop } from "./screen-crop";
import type { Corner, LayerRect, StageLayout } from "./stage-layout";

export type PixelRect = { x: number; y: number; width: number; height: number };
export type SourceSize = { w: number; h: number };
export type StageEditMode = "mask" | "content" | "group";
type Aspect = StageLayout["aspect"];

export function maskPixels(layer: LayerRect, stage: Aspect): PixelRect {
  return {
    x: (layer.x * stage.w) / 100,
    y: (layer.y * stage.h) / 100,
    width: (layer.width * stage.w) / 100,
    height: (layer.height * stage.h) / 100,
  };
}

export function sourceAspect(
  layer: LayerRect,
  size: SourceSize = layer.sourceSize ?? { w: 16, h: 9 },
) {
  const c = normalizeCrop(layer.sourceCrop ?? FULL_CROP);
  return (size.w * c.w) / (size.h * c.h);
}

/** Legacy Fit/Fill is resolved once. Subsequent mask edits never recalculate this rect. */
export function resolveContent(layer: LayerRect, stage: Aspect, size?: SourceSize): PixelRect {
  if (layer.content) return layer.content;
  const mask = maskPixels(layer, stage);
  const ratio = sourceAspect(layer, size);
  const width = layer.fit
    ? Math.min(mask.width, mask.height * ratio)
    : Math.max(mask.width, mask.height * ratio);
  const zoom = (layer.zoom ?? 100) / 100;
  const w = width * zoom,
    h = (width / ratio) * zoom;
  return {
    x: mask.x + ((mask.width - w) * layer.cropX) / 100,
    y: mask.y + ((mask.height - h) * layer.cropY) / 100,
    width: w,
    height: h,
  };
}

export function freezeContent(layer: LayerRect, stage: Aspect, size?: SourceSize): LayerRect {
  return layer.content ? layer : { ...layer, content: resolveContent(layer, stage, size) };
}

/** Metadata resolution is owned by the director and shared as ordinary layout state. */
export function receiveSourceSize(layer: LayerRect, stage: Aspect, size: SourceSize): LayerRect {
  if (size.w <= 0 || size.h <= 0 || !Number.isFinite(size.w + size.h)) return layer;
  if (layer.content && layer.sourceSize?.w === size.w && layer.sourceSize.h === size.h)
    return layer;
  const content = resolveContent(layer, stage, size);
  const height = content.width / sourceAspect(layer, size);
  return {
    ...layer,
    sourceSize: size,
    content: { ...content, y: content.y + (content.height - height) / 2, height },
  };
}

export function placeContent(
  layer: LayerRect,
  stage: Aspect,
  placement: "fit" | "fill" | "center",
): LayerRect {
  const mask = maskPixels(layer, stage),
    before = resolveContent(layer, stage);
  const ratio = before.width / before.height;
  const width =
    placement === "center"
      ? before.width
      : placement === "fit"
        ? Math.min(mask.width, mask.height * ratio)
        : Math.max(mask.width, mask.height * ratio);
  const height = width / ratio;
  return {
    ...layer,
    content: {
      x: mask.x + (mask.width - width) / 2,
      y: mask.y + (mask.height - height) / 2,
      width,
      height,
    },
  };
}

export function scaleContent(rect: PixelRect, factor: number): PixelRect {
  const bounded = Math.max(0.01, Math.min(100, factor));
  const width = rect.width * bounded,
    height = rect.height * bounded;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

/** Project pointer motion onto the diagonal: both axes resize, source aspect stays locked. */
export function resizeContent(rect: PixelRect, corner: Corner, dx: number, dy: number): PixelRect {
  const sx = corner.includes("w") ? -1 : 1,
    sy = corner.includes("n") ? -1 : 1;
  const factor = Math.max(
    0.01,
    Math.min(
      100,
      1 + (sx * dx * rect.width + sy * dy * rect.height) / (rect.width ** 2 + rect.height ** 2),
    ),
  );
  const width = rect.width * factor,
    height = rect.height * factor;
  return {
    x: sx < 0 ? rect.x + rect.width - width : rect.x,
    y: sy < 0 ? rect.y + rect.height - height : rect.y,
    width,
    height,
  };
}

export function translateGroup(start: LayerRect, nextMask: LayerRect, stage: Aspect): LayerRect {
  const content = resolveContent(start, stage);
  return {
    ...nextMask,
    content: {
      ...content,
      x: content.x + ((nextMask.x - start.x) * stage.w) / 100,
      y: content.y + ((nextMask.y - start.y) * stage.h) / 100,
    },
  };
}

export function resizeMask(
  start: LayerRect,
  handle: Corner,
  dx: number,
  dy: number,
  stage: Aspect,
  keepRatio = false,
): LayerRect {
  const mask = maskPixels(start, stage),
    right = mask.x + mask.width,
    bottom = mask.y + mask.height;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  let x = handle.includes("w") ? clamp(mask.x + dx, 0, right - 1) : mask.x;
  let y = handle.includes("n") ? clamp(mask.y + dy, 0, bottom - 1) : mask.y;
  let width = (handle.includes("e") ? clamp(right + dx, mask.x + 1, stage.w) : right) - x;
  let height = (handle.includes("s") ? clamp(bottom + dy, mask.y + 1, stage.h) : bottom) - y;
  if (keepRatio) {
    const vertical = handle === "n" || handle === "s";
    const factor =
      handle.length === 2
        ? 1 +
          ((handle.includes("w") ? -dx : dx) * mask.width +
            (handle.includes("n") ? -dy : dy) * mask.height) /
            (mask.width ** 2 + mask.height ** 2)
        : vertical
          ? height / mask.height
          : width / mask.width;
    const anchorX = handle.includes("w") ? right : vertical ? mask.x + mask.width / 2 : mask.x;
    const anchorY = handle.includes("n")
      ? bottom
      : handle === "e" || handle === "w"
        ? mask.y + mask.height / 2
        : mask.y;
    const maxW = vertical
      ? 2 * Math.min(anchorX, stage.w - anchorX)
      : handle.includes("w")
        ? anchorX
        : stage.w - anchorX;
    const maxH =
      handle === "e" || handle === "w"
        ? 2 * Math.min(anchorY, stage.h - anchorY)
        : handle.includes("n")
          ? anchorY
          : stage.h - anchorY;
    const bounded = Math.max(
      Math.max(1 / mask.width, 1 / mask.height),
      Math.min(factor, maxW / mask.width, maxH / mask.height),
    );
    width = mask.width * bounded;
    height = mask.height * bounded;
    x = handle.includes("w") ? anchorX - width : vertical ? anchorX - width / 2 : anchorX;
    y = handle.includes("n")
      ? anchorY - height
      : handle === "e" || handle === "w"
        ? anchorY - height / 2
        : anchorY;
  }
  return {
    ...start,
    x: (x / stage.w) * 100,
    y: (y / stage.h) * 100,
    width: (width / stage.w) * 100,
    height: (height / stage.h) * 100,
  };
}

/** Keep the current image scale when restoring a legacy source trim. */
export function clearSourceTrim(layer: LayerRect, stage: Aspect): LayerRect {
  const content = resolveContent(layer, stage),
    crop = normalizeCrop(layer.sourceCrop ?? FULL_CROP);
  const width = (content.width * 100) / crop.w,
    height = (content.height * 100) / crop.h;
  return {
    ...layer,
    sourceCrop: FULL_CROP,
    content: {
      x: content.x - (width * crop.x) / 100,
      y: content.y - (height * crop.y) / 100,
      width,
      height,
    },
  };
}
