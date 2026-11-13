export type LayerName = "presentation" | "translation";
export type Corner = "nw" | "ne" | "sw" | "se";
export type LayerRect = { x: number; y: number; width: number; height: number; cropX: number; cropY: number; visible: boolean; z: number; fit: boolean; knockout: boolean };
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
};
export type StageTemplate = { id: string; name: string; builtIn?: boolean; layout: Omit<StageLayout, "hold" | "holdTexts" | "activeLayer"> };

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

const rect = (x: number, y: number, width: number, height: number, z: number, extra: Partial<LayerRect> = {}): LayerRect =>
  ({ x, y, width, height, cropX: 50, cropY: 50, visible: true, z, fit: false, knockout: false, ...extra });

export const BUILT_IN_TEMPLATES: StageTemplate[] = [
  { id: "builtin-lower", name: "คำบรรยายแถบล่าง", builtIn: true, layout: { aspect: { w: 1920, h: 1080 }, fontScale: 50, layers: { presentation: rect(0, 0, 100, 100, 1, { fit: true }), translation: rect(10, 78, 80, 18, 2, { knockout: true }) } } },
  { id: "builtin-split", name: "แบ่งครึ่งซ้าย-ขวา", builtIn: true, layout: { aspect: { w: 1920, h: 1080 }, fontScale: 50, layers: { presentation: rect(0, 0, 64, 100, 1, { fit: true }), translation: rect(64, 0, 36, 100, 2) } } },
  { id: "builtin-pip", name: "ภาพซ้อนมุมขวา", builtIn: true, layout: { aspect: { w: 1920, h: 1080 }, fontScale: 50, layers: { presentation: rect(0, 0, 100, 100, 1, { fit: true }), translation: rect(64, 64, 32, 30, 2) } } },
];

export const defaultLayout = (): StageLayout => ({
  ...structuredClone(BUILT_IN_TEMPLATES[0]!.layout),
  activeLayer: "translation",
  hold: null,
  holdTexts: structuredClone(DEFAULT_HOLD_TEXTS),
});

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Resize a rect by dragging one corner by (dx, dy) percent of the stage, keeping it inside 0–100. */
export function resizeFromCorner(start: LayerRect, corner: Corner, dx: number, dy: number, keepRatio = false): LayerRect {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let left = start.x, top = start.y, r = right, b = bottom;
  if (corner.includes("w")) left = clamp(start.x + dx, 0, right - MIN_SIZE); else r = clamp(right + dx, start.x + MIN_SIZE, 100);
  if (corner.includes("n")) top = clamp(start.y + dy, 0, bottom - MIN_SIZE); else b = clamp(bottom + dy, start.y + MIN_SIZE, 100);
  let width = r - left, height = b - top;
  if (keepRatio && start.width > 0) {
    const ratio = start.height / start.width;
    height = width * ratio;
    if (corner.includes("n")) top = bottom - height;
    if (top < 0 || top + height > 100) { height = corner.includes("n") ? bottom : 100 - top; top = corner.includes("n") ? 0 : top; width = height / ratio; if (corner.includes("w")) left = right - width; }
  }
  return { ...start, x: left, y: top, width, height };
}

export function moveRect(start: LayerRect, dx: number, dy: number): LayerRect {
  return { ...start, x: clamp(start.x + dx, 0, 100 - start.width), y: clamp(start.y + dy, 0, 100 - start.height) };
}

export function bringToFront(layers: StageLayout["layers"], name: LayerName): StageLayout["layers"] {
  const other: LayerName = name === "presentation" ? "translation" : "presentation";
  return { ...layers, [name]: { ...layers[name], z: 2 }, [other]: { ...layers[other], z: 1 } } as StageLayout["layers"];
}
export function sendToBack(layers: StageLayout["layers"], name: LayerName) {
  return bringToFront(layers, name === "presentation" ? "translation" : "presentation");
}
export function swapOrder(layers: StageLayout["layers"]): StageLayout["layers"] {
  return { presentation: { ...layers.presentation, z: layers.translation.z }, translation: { ...layers.translation, z: layers.presentation.z } };
}

export const TEMPLATE_KEY = "botnoi-relay-templates";
export function loadTemplates(storage: Pick<Storage, "getItem">): StageTemplate[] {
  try {
    const parsed = JSON.parse(storage.getItem(TEMPLATE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
export function saveTemplate(storage: Pick<Storage, "getItem" | "setItem">, name: string, layout: StageLayout): StageTemplate[] {
  const list = loadTemplates(storage).filter((t) => t.name !== name);
  const entry: StageTemplate = { id: crypto.randomUUID(), name, layout: { layers: structuredClone(layout.layers), aspect: { ...layout.aspect }, fontScale: layout.fontScale } };
  const next = [...list, entry];
  storage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  return next;
}
export function deleteTemplate(storage: Pick<Storage, "getItem" | "setItem">, id: string): StageTemplate[] {
  const next = loadTemplates(storage).filter((t) => t.id !== id);
  storage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  return next;
}
export function applyTemplate(current: StageLayout, template: StageTemplate): StageLayout {
  return { ...current, ...structuredClone(template.layout) };
}
export const HOLD_KEY = "botnoi-relay-hold-texts";
