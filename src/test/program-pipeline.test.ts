import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramPipeline } from "@/lib/program-pipeline";
import { defaultLayout } from "@/lib/stage-layout";
import { SOURCES } from "@/lib/sources";

const drawImage = vi.fn(),
  fillText = vi.fn(),
  rect = vi.fn(),
  stopTrack = vi.fn();
beforeEach(() => {
  const ctx = {
    drawImage,
    fillText,
    rect,
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    measureText: (s: string) => ({ width: s.length * 5 }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
    configurable: true,
    value: () => ({
      getVideoTracks: () => [{ contentHint: "" }],
      getTracks: () => [{ stop: stopTrack }],
    }),
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(2);
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1920);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(1080);
  vi.stubGlobal(
    "Worker",
    class {
      onmessage = null;
      terminate = vi.fn();
    },
  );
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL() {
        return "blob:test";
      }
      static override revokeObjectURL() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).captureStream;
});
const sourceStream = () =>
  ({ getVideoTracks: () => [{ readyState: "live" }] }) as unknown as MediaStream;
describe("single program bus", () => {
  it("composites five sources in z order, clips masks, and never paints hidden sources", () => {
    const layout = defaultLayout();
    layout.transition = "cut";
    for (const { id } of SOURCES)
      layout.layers[id] = {
        ...layout.layers[id],
        visible: true,
        sourceSize: { w: 1920, h: 1080 },
        content: { x: 100, y: 200, width: 960, height: 540 },
      };
    const streams = Object.fromEntries(SOURCES.map((s) => [s.id, sourceStream()]));
    const program = new ProgramPipeline(layout);
    program.update(layout, streams, "");
    program.draw();
    expect(drawImage.mock.calls.filter((call) => call[0] instanceof HTMLVideoElement)).toHaveLength(
      5,
    );
    expect(drawImage.mock.calls[0]?.slice(-4)).toEqual([100, 200, 960, 540]);
    expect(rect).toHaveBeenCalledTimes(5);
    drawImage.mockClear();
    layout.layers["source-c"].visible = false;
    program.update(layout, streams, "");
    program.draw();
    expect(drawImage.mock.calls.filter((call) => call[0] instanceof HTMLVideoElement)).toHaveLength(
      4,
    );
    program.stop();
    expect(stopTrack).toHaveBeenCalled();
  });
  it("full-stage hold and blackout contain no source pixels", () => {
    const layout = defaultLayout();
    layout.transition = "cut";
    const program = new ProgramPipeline(layout);
    program.update(
      { ...layout, hold: { id: "wait", target: "stage" } },
      { presentation: sourceStream() },
      "",
    );
    program.draw();
    expect(drawImage).not.toHaveBeenCalled();
    expect(fillText).toHaveBeenCalled();
    fillText.mockClear();
    program.update({ ...layout, blackout: true }, { presentation: sourceStream() }, "");
    program.draw();
    expect(drawImage).not.toHaveBeenCalled();
    expect(fillText).not.toHaveBeenCalled();
    program.stop();
  });
  it("mask edits cannot rescale the source in the actual outgoing canvas", () => {
    const layout = defaultLayout();
    layout.transition = "cut";
    layout.layers.translation.visible = false;
    layout.layers.presentation.content = { x: 50, y: 60, width: 960, height: 540 };
    const program = new ProgramPipeline(layout),
      streams = { presentation: sourceStream() };
    program.update(layout, streams, "");
    program.draw();
    const first = drawImage.mock.calls
      .filter((call) => call[0] instanceof HTMLVideoElement)
      .at(-1)!
      .slice(-4);
    const changed = {
      ...layout,
      layers: {
        ...layout.layers,
        presentation: { ...layout.layers.presentation, width: 30, height: 10 },
      },
    };
    program.update(changed, streams, "");
    program.draw();
    expect(
      drawImage.mock.calls
        .filter((call) => call[0] instanceof HTMLVideoElement)
        .at(-1)!
        .slice(-4),
    ).toEqual(first);
    program.stop();
  });
});
