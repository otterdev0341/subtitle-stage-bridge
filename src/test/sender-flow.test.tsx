import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CropRect } from "@/lib/screen-crop";

const session = vi.hoisted(() => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn() }));
const pipelines = vi.hoisted(
  () => [] as Array<{ crop: CropRect; paused: boolean; stop: () => void }>,
);
vi.mock("@/lib/use-broadcast-session", () => ({
  useBroadcastSession: () => ({ ...session, connected: true, participants: [], error: "" }),
}));
vi.mock("@/lib/crop-pipeline", () => ({
  CropPipeline: class {
    crop: CropRect;
    paused = false;
    stream = { getVideoTracks: () => [] };
    outSize = { w: 100, h: 100 };
    stop = vi.fn();
    constructor(_: MediaStream, crop: CropRect) {
      this.crop = crop;
      pipelines.push(this);
    }
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
}));
import { RemoteStation } from "@/routes/room.$roomId";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  pipelines.length = 0;
  localStorage.clear();
});
describe.each(["presentation", "translation"] as const)("%s sender", (role) => {
  it("sends nothing before crop confirmation; cancel preserves the live crop", async () => {
    const rawStop = vi.fn();
    const track = {
      getSettings: () => ({ width: 1920, height: 1080 }),
      addEventListener: vi.fn(),
      stop: rawStop,
    };
    const raw = { getVideoTracks: () => [track], getTracks: () => [track] };
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(raw) },
    });
    render(<RemoteStation roomId="crop-test" role={role} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "เลือกจอที่จะแชร์" })));
    expect(session.start).not.toHaveBeenCalled();
    expect(pipelines).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "แถบคำบรรยาย" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "เริ่มส่งภาพเฉพาะส่วนนี้" })),
    );
    expect(session.start).toHaveBeenCalledTimes(1);
    expect(pipelines[0]?.crop).toEqual({ x: 0, y: 75, w: 100, h: 25 });
    fireEvent.click(screen.getByRole("button", { name: "ปรับพื้นที่ส่ง" }));
    fireEvent.click(screen.getByRole("button", { name: "เต็มจอ" }));
    expect(pipelines[0]?.crop.h).toBe(25);
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(pipelines[0]?.crop.h).toBe(25);
    fireEvent.click(screen.getByRole("button", { name: "ปรับพื้นที่ส่ง" }));
    fireEvent.click(screen.getByRole("button", { name: "เต็มจอ" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "ใช้พื้นที่นี้" })));
    expect(pipelines[0]?.crop).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(session.start).toHaveBeenCalledTimes(1);
    expect(pipelines).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "หยุดแชร์หน้าจอ" }));
    expect(rawStop).toHaveBeenCalled();
  });
});
