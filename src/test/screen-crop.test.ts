import { describe, expect, it } from "vitest";
import { cropToPixels, fitAspect, FULL_CROP, resizeCrop } from "@/lib/screen-crop";
describe("sender crop", () => {
  it("full crop is the whole frame", () => expect(cropToPixels(FULL_CROP, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 }));
  it("16:9 lock keeps the ratio on a 4:3 source", () => {
    const r = fitAspect(FULL_CROP, 16 / 9, 1440, 1080);
    const px = cropToPixels(r, 1440, 1080);
    expect(px.w / px.h).toBeCloseTo(16 / 9, 1);
  });
  it("stays inside the frame", () => {
    const px = cropToPixels({ x: 90, y: 90, w: 50, h: 50 }, 1920, 1080);
    expect(px.x + px.w).toBeLessThanOrEqual(1920);
    expect(px.y + px.h).toBeLessThanOrEqual(1080);
  });
  it("corner resize with 1:1 keeps a square", () => {
    const r = resizeCrop({ x: 10, y: 10, w: 20, h: 20 }, "se", 10, 0, 1, 1000, 1000);
    expect(r.w).toBeCloseTo(r.h, 5);
  });
});
