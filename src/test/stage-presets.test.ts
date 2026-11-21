import { describe, expect, it } from "vitest";
import { ASPECT_PRESETS } from "@/lib/stage-layout";
import { swapLanguages } from "@/lib/gemini-live";

describe("resolution presets", () => {
  it("are valid and unique", () => {
    for (const p of ASPECT_PRESETS) expect(p.w > 0 && p.h > 0).toBe(true);
    expect(new Set(ASPECT_PRESETS.map((p) => `${p.w}x${p.h}`)).size).toBe(ASPECT_PRESETS.length);
    expect(ASPECT_PRESETS.some((p) => p.w === 3840 && p.h === 2160)).toBe(true);
  });
});
describe("swapLanguages", () => {
  it("swaps source and target and keeps glossary", () => {
    expect(swapLanguages({ source: "th", target: "en", glossary: "a = b" })).toEqual({ source: "en", target: "th", glossary: "a = b" });
  });
});
