import { describe, expect, it } from "vitest";
import { resizeFromCorner, moveRect, swapOrder, saveTemplate, loadTemplates, deleteTemplate, applyTemplate, defaultLayout, MIN_SIZE, type LayerRect } from "@/lib/stage-layout";

const r: LayerRect = { x: 20, y: 20, width: 40, height: 30, cropX: 50, cropY: 50, visible: true, z: 1, fit: false, knockout: false };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("stage layout", () => {
  it("bottom-right corner grows size, top-left stays", () => {
    expect(resizeFromCorner(r, "se", 10, 5)).toMatchObject({ x: 20, y: 20, width: 50, height: 35 });
  });
  it("top-left corner moves origin and keeps bottom-right fixed", () => {
    expect(resizeFromCorner(r, "nw", -10, -10)).toMatchObject({ x: 10, y: 10, width: 50, height: 40 });
  });
  it("cannot shrink below minimum or past stage edge", () => {
    expect(resizeFromCorner(r, "se", -100, -100)).toMatchObject({ width: MIN_SIZE, height: MIN_SIZE });
    expect(resizeFromCorner(r, "se", 200, 200)).toMatchObject({ width: 80, height: 80 });
  });
  it("move stays inside stage", () => {
    expect(moveRect(r, 100, -100)).toMatchObject({ x: 60, y: 0 });
  });
  it("swap exchanges front/back", () => {
    const l = defaultLayout().layers;
    const s = swapOrder(l);
    expect(s.presentation.z).toBe(l.translation.z);
    expect(s.translation.z).toBe(l.presentation.z);
  });
  it("saves, loads, applies and deletes templates", () => {
    const store = mem();
    const layout = { ...defaultLayout(), aspect: { w: 1440, h: 1080 } };
    const [t] = saveTemplate(store, "เวทีใหญ่", layout);
    expect(loadTemplates(store)).toHaveLength(1);
    expect(applyTemplate(defaultLayout(), t!).aspect).toEqual({ w: 1440, h: 1080 });
    expect(deleteTemplate(store, t!.id)).toHaveLength(0);
  });
});

import { arrangementRegions, clampToRegion } from "@/lib/stage-layout";
describe("split arrangements", () => {
  it("stack 75/25", () => {
    const r = arrangementRegions("stack", 75)!;
    expect(r.presentation).toEqual({ x: 0, y: 0, width: 100, height: 75 });
    expect(r.translation).toEqual({ x: 0, y: 75, width: 100, height: 25 });
  });
  it("side 70/30", () => {
    const r = arrangementRegions("side", 70)!;
    expect(r.presentation).toEqual({ x: 0, y: 0, width: 70, height: 100 });
    expect(r.translation).toEqual({ x: 70, y: 0, width: 30, height: 100 });
  });
  it("swap puts B first and keeps no overlap", () => {
    const r = arrangementRegions("stack", 75, true)!;
    expect(r.translation).toEqual({ x: 0, y: 0, width: 100, height: 25 });
    expect(r.presentation.y).toBe(25);
  });
  it("overlay has no regions", () => expect(arrangementRegions("overlay")).toBeNull());
  it("clamps a dragged rect into its region", () => {
    const c = clampToRegion({ x: 0, y: 60, width: 100, height: 40, cropX: 50, cropY: 50, visible: true, z: 1, fit: true, knockout: false }, { x: 0, y: 0, width: 100, height: 75 });
    expect(c.y + c.height).toBeLessThanOrEqual(75);
  });
});
