import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageCanvas } from "@/components/stage/StageCanvas";
import { StageMedia } from "@/components/stage/StageMedia";
import { defaultLayout } from "@/lib/stage-layout";
import { receiveSourceSize } from "@/lib/stage-geometry";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("stage renderer and drag modes", () => {
  const makeLayout = () => {
    const layout = defaultLayout();
    layout.layers.translation = receiveSourceSize(
      { ...layout.layers.translation, x: 25, y: 25, width: 50, height: 50, fit: true },
      layout.aspect,
      layout.aspect,
    );
    return layout;
  };
  it("mask resize changes viewport percentages, with the same stage pixel image size", () => {
    const layout = makeLayout(),
      layer = layout.layers.translation;
    const { container, rerender } = render(
      <StageMedia stream={null} layer={layer} aspect={layout.aspect} caption="40px text" />,
    );
    const before = container.querySelector<HTMLElement>(".relay-content-transform")!.style;
    const width = (parseFloat(before.width) * layer.width) / 100;
    const height = (parseFloat(before.height) * layer.height) / 100;
    rerender(
      <StageMedia
        stream={null}
        layer={{ ...layer, width: 25, height: 25 }}
        aspect={layout.aspect}
        caption="40px text"
      />,
    );
    const after = container.querySelector<HTMLElement>(".relay-content-transform")!.style;
    expect((parseFloat(after.width) * 25) / 100).toBe(width);
    expect((parseFloat(after.height) * 25) / 100).toBe(height);
  });
  it.each(["mask", "content", "group"] as const)(
    "%s pointer mode changes only the intended geometry even with workspace zoom",
    (mode) => {
      vi.stubGlobal("PointerEvent", MouseEvent);
      HTMLElement.prototype.setPointerCapture = vi.fn();
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 960,
        bottom: 540,
        width: 960,
        height: 540,
        toJSON: () => ({}),
      });
      const layout = makeLayout(),
        before = layout.layers.translation;
      const onChange = vi.fn();
      const { container } = render(
        <StageCanvas
          layout={layout}
          streams={{ presentation: null, translation: null }}
          caption=""
          editable
          editMode={mode}
          onChangeLayer={onChange}
        />,
      );
      const target = container.querySelector(
        mode === "content" ? ".relay-content-guide" : ".relay-stage-layer-translation",
      )!;
      fireEvent.pointerDown(target, { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(target, { clientX: 148, clientY: 127 });
      fireEvent.pointerUp(target);
      const next = onChange.mock.calls.at(-1)![1];
      if (mode === "mask") {
        expect(next.content).toEqual(before.content);
        expect(next.x).toBe(30);
      }
      if (mode === "content") {
        expect(next.x).toBe(before.x);
        expect(next.content.x - before.content!.x).toBe(96);
      }
      if (mode === "group") {
        expect(next.x).toBe(30);
        expect(next.content.x - before.content!.x).toBe(96);
      }
    },
  );
  it("projection has no editor guides, ghosts or interactive handles", () => {
    const { container } = render(
      <StageCanvas
        layout={makeLayout()}
        streams={{ presentation: null, translation: null }}
        caption=""
        editable={false}
      />,
    );
    expect(
      container.querySelector(".relay-content-guide, .relay-content-ghost, .relay-stage-handle"),
    ).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
