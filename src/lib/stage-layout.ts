import type { CropRect } from "./screen-crop";
import { freezeContent, type PixelRect, type SourceSize } from "./stage-geometry";
import { SOURCES, type SourceId } from "./sources";
export type LayerName = SourceId;
export type LegacyLayerName = "presentation" | "translation";
export type Corner = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";
/** Mask is stored in stage %. Content is independent stage pixels. Fit/zoom/cropX/Y only migrate old layouts. */
export type LayerRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  visible: boolean;
  z: number;
  fit: boolean;
  knockout: boolean;
  opacity?: number;
  zoom?: number;
  locked?: boolean;
  lockAspect?: boolean;
  sourceCrop?: CropRect;
  content?: PixelRect;
  sourceSize?: SourceSize;
  name?: string;
};
export type HoldSlideId = "wait" | "title" | "technical";
export type HoldTarget = "stage" | LayerName;
export type HoldTexts = Record<HoldSlideId, { title: string; subtitle: string }>;
export type StageLayout = {
  layers: Record<LayerName, LayerRect>;
  activeLayer: LayerName;
  aspect: { w: number; h: number };
  fontScale: number;
  hold: { id: HoldSlideId; target: HoldTarget } | null;
  holdTexts: HoldTexts;
  transition: TransitionKind;
  holdImages?: Partial<Record<HoldSlideId, string>>;
  arrangement?: Arrangement;
  split?: number;
  splitSwap?: boolean;
  blackout?: boolean;
  quickSlots?: StageTemplate[];
};
export type Arrangement = "overlay" | "stack" | "side";
export type Region = { x: number; y: number; width: number; height: number };
export type TransitionKind = "fade" | "slide" | "zoom" | "cut";
export const TRANSITIONS: Array<{ id: TransitionKind; label: string }> = [
  { id: "fade", label: "จางเข้า" },
  { id: "slide", label: "เลื่อนขึ้น" },
  { id: "zoom", label: "ซูม" },
  { id: "cut", label: "ตัดทันที" },
];
export type StageTemplate = {
  id: string;
  name: string;
  builtIn?: boolean;
  layout: Omit<
    StageLayout,
    "hold" | "holdTexts" | "activeLayer" | "transition" | "holdImages" | "quickSlots" | "blackout"
  >;
};

export const MIN_SIZE = 8;
export const ASPECT_PRESETS = [
  { label: "16:9 · 1920×1080", w: 1920, h: 1080 },
  { label: "16:10 · 1920×1200", w: 1920, h: 1200 },
  { label: "4:3 · 1440×1080", w: 1440, h: 1080 },
  { label: "21:9 · 2560×1080", w: 2560, h: 1080 },
];

export const DEFAULT_HOLD_TEXTS: HoldTexts = {
  wait: { title: "กรุณารอสักครู่", subtitle: "การนำเสนอจะเริ่มต่อในอีกไม่ช้า" },
  title: { title: "Botnoi Live Relay", subtitle: "ชื่อผู้บรรยาย · หัวข้อการนำเสนอ" },
  technical: { title: "ขัดข้องทางเทคนิค", subtitle: "ทีมงานกำลังแก้ไข ขออภัยในความไม่สะดวก" },
};

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  z: number,
  extra: Partial<LayerRect> = {},
): LayerRect => ({
  x,
  y,
  width,
  height,
  cropX: 50,
  cropY: 50,
  visible: true,
  z,
  fit: false,
  knockout: false,
  ...extra,
});

export function normalizeLayers(
  layers: Partial<Record<LayerName, LayerRect>>,
): Record<LayerName, LayerRect> {
  return Object.fromEntries(
    SOURCES.map((source, i) => [
      source.id,
      layers[source.id] ??
        rect(15 + i * 2, 15 + i * 2, 60, 60, i + 1, {
          visible: false,
          fit: true,
          name: source.name,
        }),
    ]),
  ) as Record<LayerName, LayerRect>;
}
export function normalizeLayout(layout: StageLayout): StageLayout {
  return { ...layout, layers: normalizeLayers(layout.layers) };
}

export const BUILT_IN_TEMPLATES: StageTemplate[] = [
  {
    id: "builtin-lower",
    name: "คำบรรยายแถบล่าง",
    builtIn: true,
    layout: {
      aspect: { w: 1920, h: 1080 },
      fontScale: 50,
      layers: normalizeLayers({
        presentation: rect(0, 0, 100, 100, 1, { fit: true }),
        translation: rect(10, 78, 80, 18, 2, { knockout: true }),
      }),
    },
  },
  {
    id: "builtin-split",
    name: "แบ่งครึ่งซ้าย-ขวา",
    builtIn: true,
    layout: {
      aspect: { w: 1920, h: 1080 },
      fontScale: 50,
      layers: normalizeLayers({
        presentation: rect(0, 0, 64, 100, 1, { fit: true }),
        translation: rect(64, 0, 36, 100, 2),
      }),
    },
  },
  {
    id: "builtin-stack",
    name: "บน-ล่าง ไม่ซ้อน",
    builtIn: true,
    layout: {
      aspect: { w: 1920, h: 1080 },
      fontScale: 50,
      arrangement: "stack",
      split: 75,
      splitSwap: false,
      layers: normalizeLayers({
        presentation: rect(0, 0, 100, 75, 1, { fit: true }),
        translation: rect(0, 75, 100, 25, 2, { fit: true }),
      }),
    },
  },
  {
    id: "builtin-side",
    name: "ซ้าย-ขวา ไม่ซ้อน",
    builtIn: true,
    layout: {
      aspect: { w: 1920, h: 1080 },
      fontScale: 50,
      arrangement: "side",
      split: 70,
      splitSwap: false,
      layers: normalizeLayers({
        presentation: rect(0, 0, 70, 100, 1, { fit: true }),
        translation: rect(70, 0, 30, 100, 2, { fit: true }),
      }),
    },
  },
  {
    id: "builtin-pip",
    name: "ภาพซ้อนมุมขวา",
    builtIn: true,
    layout: {
      aspect: { w: 1920, h: 1080 },
      fontScale: 50,
      layers: normalizeLayers({
        presentation: rect(0, 0, 100, 100, 1, { fit: true }),
        translation: rect(64, 64, 32, 30, 2),
      }),
    },
  },
];

BUILT_IN_TEMPLATES.push({
  id: "builtin-five",
  name: "5 จอ · 2 บน / 3 ล่าง",
  builtIn: true,
  layout: {
    aspect: { w: 1920, h: 1080 },
    fontScale: 50,
    layers: normalizeLayers(
      Object.fromEntries(
        SOURCES.map((source, i) => [
          source.id,
          rect(
            i < 2 ? i * 50 : (i - 2) * (100 / 3),
            i < 2 ? 0 : 50,
            i < 2 ? 50 : 100 / 3,
            50,
            i + 1,
            { fit: true, name: source.name },
          ),
        ]),
      ),
    ),
  },
});

export const defaultLayout = (): StageLayout => ({
  ...structuredClone(BUILT_IN_TEMPLATES[0]!.layout),
  activeLayer: "translation",
  hold: null,
  holdTexts: structuredClone(DEFAULT_HOLD_TEXTS),
  transition: "fade",
});

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Resize a rect by dragging one corner by (dx, dy) percent of the stage, keeping it inside 0–100. */
export function resizeFromCorner(
  start: LayerRect,
  corner: Corner,
  dx: number,
  dy: number,
  keepRatio = false,
): LayerRect {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let left = start.x,
    top = start.y,
    r = right,
    b = bottom;
  if (corner.includes("w")) left = clamp(start.x + dx, 0, right - MIN_SIZE);
  else if (corner.includes("e")) r = clamp(right + dx, start.x + MIN_SIZE, 100);
  if (corner.includes("n")) top = clamp(start.y + dy, 0, bottom - MIN_SIZE);
  else if (corner.includes("s")) b = clamp(bottom + dy, start.y + MIN_SIZE, 100);
  let width = r - left,
    height = b - top;
  if (keepRatio && start.width > 0) {
    const ratio = start.height / start.width;
    if (corner === "n" || corner === "s") {
      width = height / ratio;
      if (left + width > 100) width = 100 - left;
    }
    height = width * ratio;
    if (corner.includes("n")) top = bottom - height;
    if (top < 0 || top + height > 100) {
      height = corner.includes("n") ? bottom : 100 - top;
      top = corner.includes("n") ? 0 : top;
      width = height / ratio;
      if (corner.includes("w")) left = right - width;
    }
  }
  return { ...start, x: left, y: top, width, height };
}

export function moveRect(start: LayerRect, dx: number, dy: number): LayerRect {
  return {
    ...start,
    x: clamp(start.x + dx, 0, 100 - start.width),
    y: clamp(start.y + dy, 0, 100 - start.height),
  };
}

export function bringToFront(
  layers: StageLayout["layers"],
  name: LayerName,
): StageLayout["layers"] {
  const order = SOURCES.map((s) => s.id)
    .filter((id) => id !== name)
    .sort((a, b) => layers[a].z - layers[b].z);
  order.push(name);
  return Object.fromEntries(
    order.map((id, i) => [id, { ...layers[id], z: i + 1 }]),
  ) as StageLayout["layers"];
}
export function sendToBack(layers: StageLayout["layers"], name: LayerName): StageLayout["layers"] {
  const order = SOURCES.map((s) => s.id)
    .filter((id) => id !== name)
    .sort((a, b) => layers[a].z - layers[b].z);
  order.unshift(name);
  return Object.fromEntries(
    order.map((id, i) => [id, { ...layers[id], z: i + 1 }]),
  ) as StageLayout["layers"];
}
export function swapOrder(layers: StageLayout["layers"]): StageLayout["layers"] {
  return {
    ...layers,
    presentation: { ...layers.presentation, z: layers.translation.z },
    translation: { ...layers.translation, z: layers.presentation.z },
  };
}

export const TEMPLATE_KEY = "botnoi-relay-templates";
export function loadTemplates(storage: Pick<Storage, "getItem">): StageTemplate[] {
  try {
    const parsed = JSON.parse(storage.getItem(TEMPLATE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map((t) => ({
          ...t,
          layout: { ...t.layout, layers: normalizeLayers(t.layout.layers) },
        }))
      : [];
  } catch {
    return [];
  }
}
export function saveTemplate(
  storage: Pick<Storage, "getItem" | "setItem">,
  name: string,
  layout: StageLayout,
): StageTemplate[] {
  const list = loadTemplates(storage).filter((t) => t.name !== name);
  const entry: StageTemplate = {
    id: crypto.randomUUID(),
    name,
    layout: {
      layers: structuredClone(layout.layers),
      aspect: { ...layout.aspect },
      fontScale: layout.fontScale,
      arrangement: layout.arrangement ?? "overlay",
      split: layout.split ?? 75,
      splitSwap: layout.splitSwap ?? false,
    },
  };
  const next = [...list, entry];
  storage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  return next;
}
export function deleteTemplate(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
): StageTemplate[] {
  const next = loadTemplates(storage).filter((t) => t.id !== id);
  storage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  return next;
}
export function applyTemplate(current: StageLayout, template: StageTemplate): StageLayout {
  const next = normalizeLayout({ ...current, ...structuredClone(template.layout) });
  for (const { id: name } of SOURCES) {
    if (current.layers[name].name !== undefined)
      next.layers[name] = { ...next.layers[name], name: current.layers[name].name };
    const layer = next.layers[name],
      size = current.layers[name].sourceSize;
    if (!layer.content && size)
      next.layers[name] = freezeContent({ ...layer, sourceSize: size }, next.aspect, size);
  }
  return next;
}
export const HOLD_KEY = "botnoi-relay-hold-texts";
export const HOLD_IMG_KEY = "botnoi-relay-hold-images";
export const HOLD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const HOLD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Area each screen owns in a split arrangement; null in overlay mode. */
export function arrangementRegions(
  arrangement: Arrangement | undefined,
  split = 75,
  swap = false,
): (Record<LegacyLayerName, Region> & Partial<Record<LayerName, Region>>) | null {
  if (!arrangement || arrangement === "overlay") return null;
  const a = clamp(split, 10, 90),
    b = 100 - a;
  const first: Region =
    arrangement === "stack"
      ? { x: 0, y: 0, width: 100, height: a }
      : { x: 0, y: 0, width: a, height: 100 };
  const second: Region =
    arrangement === "stack"
      ? { x: 0, y: a, width: 100, height: b }
      : { x: a, y: 0, width: b, height: 100 };
  if (!swap) return { presentation: first, translation: second };
  // swapped: B takes the first slot with the smaller size
  const bFirst: Region =
    arrangement === "stack"
      ? { x: 0, y: 0, width: 100, height: b }
      : { x: 0, y: 0, width: b, height: 100 };
  const aSecond: Region =
    arrangement === "stack"
      ? { x: 0, y: b, width: 100, height: a }
      : { x: b, y: 0, width: a, height: 100 };
  return { presentation: aSecond, translation: bFirst };
}

export function applyArrangement(layout: StageLayout): StageLayout {
  const regions = arrangementRegions(layout.arrangement, layout.split, layout.splitSwap);
  if (!regions) return layout;
  const layers = { ...layout.layers };
  (Object.keys(regions) as LayerName[]).forEach((n) => {
    layers[n] = { ...freezeContent(layers[n], layout.aspect), ...regions[n]! };
  });
  return { ...layout, layers };
}

export function clampToRegion(r: LayerRect, region: Region, keepRatio = !!r.lockAspect): LayerRect {
  const factor = Math.min(1, region.width / r.width, region.height / r.height);
  const width = keepRatio ? r.width * factor : Math.min(r.width, region.width),
    height = keepRatio ? r.height * factor : Math.min(r.height, region.height);
  const x = clamp(r.x, region.x, region.x + region.width - width);
  const y = clamp(r.y, region.y, region.y + region.height - height);
  return { ...r, x, y, width, height };
}
