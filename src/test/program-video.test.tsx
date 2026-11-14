import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProgramVideo } from "@/components/stage/ProgramVideo";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("detects stalled program and recovers without a frame-callback API", () => {
  vi.useFakeTimers();
  let time = 0;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(2);
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(() => time);
  const stream = {
    getVideoTracks: () => [{ readyState: "live", muted: false }],
  } as unknown as MediaStream;
  render(<ProgramVideo stream={stream} />);
  expect(screen.getByRole("status")).toHaveTextContent("กำลังเปิดภาพ LIVE");
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(6500));
  expect(screen.getByRole("status")).toHaveTextContent("สัญญาณ LIVE ขาด");
  time = 2;
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("status")).toBeNull();
});
