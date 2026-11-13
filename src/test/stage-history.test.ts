import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStageHistory } from "@/hooks/use-stage-history";

describe("composition history", () => {
  it("groups a pointer drag into one undo and keeps an active hold", () => {
    const { result } = renderHook(useStageHistory);
    const initial = result.current.layout.layers.translation.x;
    act(() => {
      result.current.beginEdit();
      for (const x of [12, 16, 20])
        result.current.setLayout((l) => ({
          ...l,
          layers: { ...l.layers, translation: { ...l.layers.translation, x } },
        }));
      result.current.endEdit();
      result.current.setLayout((l) => ({
        ...l,
        hold: { id: "wait", target: "stage" },
        blackout: true,
      }));
    });
    act(() => result.current.undo());
    expect(result.current.layout.layers.translation.x).toBe(initial);
    expect(result.current.layout.hold?.id).toBe("wait");
    expect(result.current.layout.blackout).toBe(true);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    expect(result.current.layout.layers.translation.x).toBe(20);
  });
});
