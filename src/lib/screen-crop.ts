export type CropRect = { x: number; y: number; w: number; h: number }; // percent of source frame
export type CropShape = "free" | "full" | "16:9" | "4:3" | "1:1";
export const CROP_SHAPES: Array<{ id: CropShape; label: string; ratio?: number }> = [
  { id: "full", label: "เต็มจอ" }, { id: "16:9", label: "16:9", ratio: 16 / 9 }, { id: "4:3", label: "4:3", ratio: 4 / 3 }, { id: "1:1", label: "1:1", ratio: 1 }, { id: "free", label: "อิสระ" },
];
export const FULL_CROP: CropRect = { x: 0, y: 0, w: 100, h: 100 };
export const MIN_CROP = 5;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function normalizeCrop(r: CropRect): CropRect {
  const w = clamp(r.w, MIN_CROP, 100), h = clamp(r.h, MIN_CROP, 100);
  return { w, h, x: clamp(r.x, 0, 100 - w), y: clamp(r.y, 0, 100 - h) };
}

/** Converts a percent crop to integer source pixels inside the frame (even sizes for encoders). */
export function cropToPixels(r: CropRect, vw: number, vh: number) {
  const n = normalizeCrop(r);
  let w = Math.max(2, Math.round((n.w / 100) * vw / 2) * 2);
  let h = Math.max(2, Math.round((n.h / 100) * vh / 2) * 2);
  w = Math.min(w, vw - (vw % 2)); h = Math.min(h, vh - (vh % 2));
  const x = clamp(Math.round((n.x / 100) * vw), 0, vw - w);
  const y = clamp(Math.round((n.y / 100) * vh), 0, vh - h);
  return { x, y, w, h };
}

/** Largest rect with pixel ratio `ratio` that fits in `r`, centered on it. */
export function fitAspect(r: CropRect, ratio: number, vw: number, vh: number): CropRect {
  const n = normalizeCrop(r);
  const pw = (n.w / 100) * vw, ph = (n.h / 100) * vh;
  let w = pw, h = pw / ratio;
  if (h > ph) { h = ph; w = ph * ratio; }
  const wp = (w / vw) * 100, hp = (h / vh) * 100;
  return normalizeCrop({ x: n.x + (n.w - wp) / 2, y: n.y + (n.h - hp) / 2, w: wp, h: hp });
}

/** Resize from a corner while optionally keeping a pixel ratio. */
export function resizeCrop(start: CropRect, corner: "nw" | "ne" | "sw" | "se", dx: number, dy: number, ratio: number | undefined, vw: number, vh: number): CropRect {
  const right = start.x + start.w, bottom = start.y + start.h;
  let l = start.x, t = start.y, r = right, b = bottom;
  if (corner.includes("w")) l = clamp(l + dx, 0, right - MIN_CROP); else r = clamp(r + dx, l + MIN_CROP, 100);
  if (corner.includes("n")) t = clamp(t + dy, 0, bottom - MIN_CROP); else b = clamp(b + dy, t + MIN_CROP, 100);
  let w = r - l, h = b - t;
  if (ratio) {
    h = (w * vw / ratio) / vh;
    if (corner.includes("n")) t = bottom - h;
    if (t < 0 || t + h > 100) { h = corner.includes("n") ? bottom : 100 - t; if (corner.includes("n")) t = 0; w = (h * vh * ratio) / vw; if (corner.includes("w")) l = right - w; }
  }
  return normalizeCrop({ x: l, y: t, w, h });
}

export const cropKey = (roomId: string, role: string) => `botnoi-relay-crop-${roomId}-${role}`;
