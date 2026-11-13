import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStageHistory } from "@/hooks/use-stage-history";

describe("composition history", () => {
  it("does not record metadata hydration; undo/redo restores both independent boxes", () => {
    const { result } = renderHook(useStageHistory);
    const content = { x: 100, y: 200, width: 960, height: 540 };
    act(() =>
      result.current.setLayout(
        (l) => ({
          ...l,
          layers: { ...l.layers, translation: { ...l.layers.translation, content } },
        }),
        false,
      ),
    );
    expect(result.current.canUndo).toBe(false);
    const height = result.current.layout.layers.translation.height;
    act(() =>
      result.current.setLayout((l) => ({
        ...l,
        layers: { ...l.layers, translation: { ...l.layers.translation, height: 8 } },
      })),
    );
    act(() => result.current.undo());
    expect(result.current.layout.layers.translation.height).toBe(height);
    expect(result.current.layout.layers.translation.content).toEqual(content);
    act(() => result.current.redo());
    expect(result.current.layout.layers.translation.height).toBe(8);
    expect(result.current.layout.layers.translation.content).toEqual(content);
  });
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
