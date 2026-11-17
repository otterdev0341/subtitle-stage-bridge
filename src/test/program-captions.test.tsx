import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultLayout,
  normalizeLayout,
  applyTemplate,
  BUILT_IN_TEMPLATES,
} from "@/lib/stage-layout";
import { sceneIsDirty, takeScene } from "@/lib/program-state";
import { captionIsVisible, defaultCaption, publishCaption } from "@/lib/captions";
import { CaptionOverlay } from "@/components/stage/CaptionOverlay";
import { StageCanvas } from "@/components/stage/StageCanvas";
import { emptyStreams } from "@/lib/sources";
import { parseRoomView, roomInviteUrl } from "@/lib/room-links";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Preview and Program", () => {
  it("commits geometry only on TAKE and preserves live emergency state and captions", () => {
    const program = {
      ...defaultLayout(),
      blackout: true,
      captions: publishCaption(defaultCaption(), "สวัสดี", "Hello"),
    };
    const draft = structuredClone(program);
    draft.layers.presentation.x = 20;
    draft.blackout = false;
    draft.captions.text = "obsolete draft";
    expect(program.layers.presentation.x).toBe(0);
    expect(sceneIsDirty(program, draft)).toBe(true);
    const taken = takeScene(program, draft);
    expect(taken.layers.presentation.x).toBe(20);
    expect(taken.blackout).toBe(true);
    expect(taken.captions?.text).toBe("Hello");
    expect(sceneIsDirty(taken, draft)).toBe(false);
    draft.layers.presentation.x = 40;
    expect(taken.layers.presentation.x).toBe(20);
  });
  it("selection never makes a pending scene and old A/B layouts migrate with hidden C-E", () => {
    const original = defaultLayout();
    const selected = { ...original, activeLayer: "source-e" as const };
    expect(sceneIsDirty(original, selected)).toBe(false);
    const old = structuredClone(original);
    delete (old.layers as Partial<typeof old.layers>)["source-c"];
    const migrated = normalizeLayout(old);
    expect(migrated.layers["source-c"].visible).toBe(false);
    expect(migrated.layers.presentation).toEqual(original.layers.presentation);
    expect(Object.keys(applyTemplate(migrated, BUILT_IN_TEMPLATES.at(-1)!).layers)).toHaveLength(5);
  });
});
describe("caption presentation", () => {
  it.each(["presentation", "stage"] as const)(
    "keeps independent captions on a %s hold only when the whole stage is not held",
    (target) => {
      const layout = {
        ...defaultLayout(),
        captions: publishCaption(defaultCaption(), "ต้นฉบับ", "Independent subtitle"),
        hold: { id: "wait" as const, target },
      };
      render(<StageCanvas layout={layout} streams={emptyStreams()} caption="" editable={false} />);
      expect(!!screen.queryByText("Independent subtitle")).toBe(target !== "stage");
    },
  );
  it("renders text subtitles alongside an active B video stream", () => {
    const streams = emptyStreams();
    streams.translation = {} as MediaStream;
    render(
      <StageCanvas
        layout={{
          ...defaultLayout(),
          captions: publishCaption(defaultCaption(), "ต้นฉบับ", "Alongside B"),
        }}
        streams={streams}
        caption=""
        editable={false}
      />,
    );
    expect(screen.getByText("Alongside B")).toBeTruthy();
  });
  it("expires text at a shared timestamp, while hold and hide remain independent", () => {
    const track = publishCaption(defaultCaption(), "หนึ่ง", "One", 1000);
    expect(captionIsVisible(track, 1001)).toBe(true);
    expect(captionIsVisible(track, 14000)).toBe(false);
    expect(captionIsVisible({ ...track, held: true }, 14000)).toBe(true);
    expect(captionIsVisible({ ...track, held: true, visible: false }, 14000)).toBe(false);
  });
  it("removes expired captions from the DOM and retains held text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const track = publishCaption(defaultCaption(), "ต้นฉบับ", "Subtitle", 1000);
    const view = render(<CaptionOverlay track={track} />);
    expect(screen.getByText("Subtitle")).toBeTruthy();
    act(() => vi.advanceTimersByTime(13000));
    expect(screen.queryByText("Subtitle")).toBeNull();
    view.rerender(<CaptionOverlay track={{ ...track, held: true }} />);
    expect(screen.getByText("Subtitle")).toBeTruthy();
  });
  it("creates ordered segments and clears them without forcing visibility", () => {
    const first = publishCaption({ ...defaultCaption(), visible: false }, "A", "B");
    const clear = publishCaption(first, "", "");
    expect(clear.sequence).toBe(first.sequence + 1);
    expect(clear.segmentId).not.toBe(first.segmentId);
    expect(clear.visible).toBe(false);
    expect(captionIsVisible(clear)).toBe(false);
  });
});
it("retains all source and Presenter invitation roles", () => {
  expect(parseRoomView({ view: "source", slot: "E" })).toBe("source-e");
  expect(parseRoomView({ view: "presenter" })).toBe("presenter");
  expect(roomInviteUrl("https://relay.example", "room", "source-d")).toBe(
    "https://relay.example/room/room?view=source&slot=D",
  );
});
