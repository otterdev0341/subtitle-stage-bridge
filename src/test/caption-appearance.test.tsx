import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CaptionAppearance } from "@/components/stage/CaptionAppearance";
import { CaptionOverlay } from "@/components/stage/CaptionOverlay";
import { defaultCaption, publishCaption } from "@/lib/captions";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([1, 2, 3, 4])("publishes the selected %i line limit", (lines) => {
  const change = vi.fn();
  const track = defaultCaption();
  render(<CaptionAppearance track={track} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: `${lines} บรรทัด` }));
  expect(change.mock.calls[0]?.[0].style.maxLines).toBe(lines);
});

it("preserves the chosen animation and line count when new translation arrives", () => {
  const track = defaultCaption();
  track.style.maxLines = 3;
  track.style.animation = "fade";
  const next = publishCaption(track, "ต้นฉบับ", "คำแปล");
  expect(next.style.maxLines).toBe(3);
  expect(next.style.animation).toBe("fade");
});

it("retains expired text only during the fade-out and does not erase replacement text", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const track = publishCaption(defaultCaption(), "", "คำแปลแรก", 1000);
  const view = render(<CaptionOverlay track={track} />);
  act(() => vi.advanceTimersByTime(12020));
  expect(screen.queryByText("คำแปลแรก")).toBeTruthy();
  const next = publishCaption(track, "", "คำแปลใหม่");
  view.rerender(<CaptionOverlay track={next} />);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByText("คำแปลแรก")).toBeNull();
  expect(screen.queryByText("คำแปลใหม่")).toBeTruthy();
  view.rerender(<CaptionOverlay track={{ ...next, visible: false }} />);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByText("คำแปลใหม่")).toBeNull();
});