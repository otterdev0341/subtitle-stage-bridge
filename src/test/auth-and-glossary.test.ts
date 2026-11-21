import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth-redirect";
import { parseGlossary, translationPrompt } from "@/lib/gemini-live";

describe("post-login redirect", () => {
  it("returns to the share link that was opened", () => {
    expect(safeNextPath("/room/abc?view=source&slot=B")).toBe("/room/abc?view=source&slot=B");
  });
  it("refuses other sites", () => {
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
  });
});

describe("glossary", () => {
  it("reads 'term = translation' lines and skips malformed ones", () => {
    expect(parseGlossary("บอทน้อย = Botnoi\nbad line\n = x")).toEqual([["บอทน้อย", "Botnoi"]]);
  });
  it("puts the glossary and target language in the instruction", () => {
    const p = translationPrompt("th", "en", "บอทน้อย = Botnoi");
    expect(p).toContain('"บอทน้อย" => "Botnoi"');
    expect(p).toContain("(en)");
  });
});
