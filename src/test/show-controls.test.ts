import { describe, expect, it } from "vitest";
import { commandForKey, reduceShowCommand } from "@/lib/show-controls";
import { BUILT_IN_TEMPLATES, defaultLayout } from "@/lib/stage-layout";
import { resizeCrop } from "@/lib/screen-crop";

describe("show commands", () => {
  it("resizes a crop edge without moving the other axis", () => {
    const crop = { x: 10, y: 60, w: 70, h: 20 };
    expect(resizeCrop(crop, "e", 5, 30, undefined, 1920, 1080)).toEqual({ ...crop, w: 75 });
    expect(resizeCrop(crop, "n", 30, -5, undefined, 1920, 1080)).toEqual({ ...crop, y: 55, h: 25 });
  });
  it("keeps repeated hold commands on screen and returns live explicitly", () => {
    const hold = reduceShowCommand(defaultLayout(), "wait");
    expect(reduceShowCommand(hold, "wait").hold).toEqual({ id: "wait", target: "stage" });
    expect(reduceShowCommand({ ...hold, blackout: true }, "live")).toMatchObject({
      hold: null,
      blackout: false,
    });
  });
  it("changes a shared custom slot under the current hold/blackout", () => {
    const original = reduceShowCommand(defaultLayout(), "technical");
    const custom = { ...BUILT_IN_TEMPLATES[4]!, id: "custom", name: "งานวันนี้" };
    const next = reduceShowCommand({ ...original, blackout: true, quickSlots: [custom] }, "slot1");
    expect(next.layers).toEqual(custom.layout.layers);
    expect(next.hold).toEqual(original.hold);
    expect(next.blackout).toBe(true);
    expect(next.quickSlots?.[0]?.name).toBe("งานวันนี้");
  });
  it("toggles layers independently and preserves crops", () => {
    const layout = defaultLayout();
    layout.layers.translation.sourceCrop = { x: 10, y: 70, w: 80, h: 20 };
    const hidden = reduceShowCommand(layout, "toggleB");
    expect(hidden.layers.translation.visible).toBe(false);
    expect(hidden.layers.presentation).toEqual(layout.layers.presentation);
    expect(reduceShowCommand(hidden, "toggleB")).toEqual(layout);
  });
  it("supports Thai keyboard physical key positions and numpad numbers", () => {
    expect(commandForKey({ key: "้", code: "KeyH" })).toBe("toggleB");
    expect(commandForKey({ key: "ๅ", code: "Digit1" })).toBe("wait");
    expect(commandForKey({ key: "1", code: "Numpad1" })).toBe("wait");
  });
});
