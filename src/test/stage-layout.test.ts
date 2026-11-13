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
