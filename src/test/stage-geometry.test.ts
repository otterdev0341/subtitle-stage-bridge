import { describe, expect, it } from "vitest";
import {
  applyArrangement,
  applyTemplate,
  defaultLayout,
  loadTemplates,
  saveTemplate,
  type LayerRect,
} from "@/lib/stage-layout";
import {
  clearSourceTrim,
  freezeContent,
  maskPixels,
  placeContent,
  receiveSourceSize,
  resizeContent,
  resizeMask,
  resolveContent,
  scaleContent,
  translateGroup,
} from "@/lib/stage-geometry";

const stage = { w: 1920, h: 1080 };
const legacy: LayerRect = {
  x: 25,
  y: 25,
  width: 50,
  height: 50,
  cropX: 50,
  cropY: 50,
  visible: true,
  z: 1,
  fit: true,
  knockout: false,
};
const layer = receiveSourceSize(legacy, stage, stage);

describe("independent Content and Mask", () => {
  it("migrates an old fit layout at the same position and scale", () => {
    expect(layer.content).toEqual({ x: 480, y: 270, width: 960, height: 540 });
    expect(resolveContent({ ...legacy, height: 25 }, stage, stage)).toEqual({
      x: 720,
      y: 270,
      width: 480,
      height: 270,
    });
    expect(resolveContent({ ...legacy, height: 25, fit: false, zoom: 200 }, stage, stage)).toEqual({
      x: 0,
      y: -135,
      width: 1920,
      height: 1080,
    });
  });
  it("halves mask height without scaling or moving content (40px text stays 40px)", () => {
    const cropped = resizeMask(layer, "s", 0, -270, stage);
    expect(maskPixels(cropped, stage).height).toBe(270);
    expect(cropped.content).toEqual(layer.content);
    expect(resolveContent(cropped, stage)).toEqual(resolveContent(layer, stage));
  });
  it("changes mask position independently and allows a one-pixel window", () => {
    const thin = resizeMask(layer, "s", 0, -10000, stage);
    expect(maskPixels(thin, stage).height).toBeCloseTo(1);
    expect(thin.content).toEqual(layer.content);
    expect(resolveContent({ ...layer, x: 40 }, stage)).toEqual(layer.content);
  });
  it("keeps content aspect for every corner and opposite corner stationary", () => {
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      const before = layer.content!,
        after = resizeContent(before, corner, 200, -70);
      expect(after.width / after.height).toBeCloseTo(16 / 9);
      expect(corner.includes("w") ? after.x + after.width : after.x).toBeCloseTo(
        corner.includes("w") ? before.x + before.width : before.x,
      );
      expect(corner.includes("n") ? after.y + after.height : after.y).toBeCloseTo(
        corner.includes("n") ? before.y + before.height : before.y,
      );
    }
  });
  it("doubles content with the same center, leaving the mask unchanged", () => {
    const before = layer.content!,
      after = scaleContent(before, 2);
    expect(after).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(maskPixels({ ...layer, content: after }, stage)).toEqual(maskPixels(layer, stage));
  });
  it("locked mask corners respond to vertical motion and stay proportional at stage boundaries", () => {
    const grown = resizeMask(layer, "se", 0, 10000, stage, true);
    const mask = maskPixels(grown, stage);
    expect(mask.width).toBeGreaterThan(maskPixels(layer, stage).width);
    expect(mask.width / mask.height).toBeCloseTo(16 / 9);
    expect(mask.x + mask.width).toBeLessThanOrEqual(stage.w);
    expect(mask.y + mask.height).toBeLessThanOrEqual(stage.h);
    expect(grown.content).toEqual(layer.content);
  });
  it("translates group by exactly the same stage displacement", () => {
    const next = translateGroup(layer, { ...layer, x: 30, y: 35 }, stage);
    expect(next.content!.x - layer.content!.x).toBeCloseTo(96);
    expect(next.content!.y - layer.content!.y).toBeCloseTo(108);
    expect(next.content!.width).toBe(layer.content!.width);
  });
  it("Fit/Fill run once and Center never changes size", () => {
    const wide = { ...layer, height: 25 };
    const fit = placeContent(wide, stage, "fit");
    expect(fit.content!.width).toBe(480);
    const fill = placeContent(wide, stage, "fill");
    expect(fill.content!.width).toBe(960);
    expect(
      placeContent({ ...fill, content: { ...fill.content!, x: -500 } }, stage, "center").content,
    ).toEqual(fill.content);
    expect(resolveContent({ ...fit, height: 40 }, stage)).toEqual(fit.content);
  });
  it("source resolution changes preserve displayed width and update the true ratio", () => {
    const next = receiveSourceSize(layer, stage, { w: 1000, h: 1000 });
    expect(next.content!.width).toBe(960);
    expect(next.content!.height).toBe(960);
    expect(receiveSourceSize(next, stage, { w: 1000, h: 1000 })).toBe(next);
  });
  it("output aspect changes cannot stretch an existing content transform", () => {
    expect(resolveContent(layer, { w: 1024, h: 768 })).toEqual(layer.content);
  });
  it("legacy source trim can be restored without changing the visible pixel scale", () => {
    const trimmed = freezeContent(
      { ...legacy, sourceCrop: { x: 10, y: 20, w: 80, h: 50 } },
      stage,
      stage,
    );
    const full = clearSourceTrim(trimmed, stage);
    expect(full.content!.width * 0.8).toBeCloseTo(trimmed.content!.width);
    expect(full.content!.x + full.content!.width * 0.1).toBeCloseTo(trimmed.content!.x);
    expect(full.content!.y + full.content!.height * 0.2).toBeCloseTo(trimmed.content!.y);
    expect(full.content!.width / full.content!.height).toBeCloseTo(16 / 9);
  });
  it("split sliders resize masks while preserving content", () => {
    const original = defaultLayout();
    original.layers.presentation = layer;
    const next = applyArrangement({ ...original, arrangement: "stack", split: 70 });
    expect(next.layers.presentation.height).toBe(70);
    expect(next.layers.presentation.content).toEqual(layer.content);
  });
  it("templates round-trip both transforms and resolve legacy templates with known source metadata", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const layout = defaultLayout();
    layout.layers.presentation = layer;
    saveTemplate(storage, "scene", layout);
    const restored = applyTemplate(defaultLayout(), loadTemplates(storage)[0]!);
    expect(restored.layers.presentation.content).toEqual(layer.content);
    const old = {
      id: "old",
      name: "old",
      layout: { ...defaultLayout(), layers: { ...defaultLayout().layers, presentation: legacy } },
    };
    expect(applyTemplate(layout, old).layers.presentation.content).toEqual(layer.content);
  });
});
