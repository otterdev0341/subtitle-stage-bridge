import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GeminiDock } from "@/components/stage/GeminiDock";
import { useShowKeyboard } from "@/hooks/use-show-keyboard";

const token = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", async (original) => ({
  ...(await original<typeof import("@tanstack/react-start")>()),
  useServerFn: () => token,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("S swaps languages only in the active translation tab and never also hides captions", () => {
  const save = vi.fn(), execute = vi.fn();
  function Harness({ active }: { active: boolean }) {
    useShowKeyboard(execute, () => {});
    return <GeminiDock active={active} settings={{ source: "th", target: "en", glossary: "" }} onSettings={save} onPublish={() => {}} />;
  }
  const view = render(<Harness active={false} />);
  fireEvent.keyDown(window, { key: "s", code: "KeyS" });
  expect(save).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledTimes(1);
  execute.mockClear();
  view.rerender(<Harness active={true} />);
  fireEvent.keyDown(window, { key: "s", code: "KeyS" });
  expect(save).toHaveBeenCalledWith({ source: "en", target: "th", glossary: "" });
  expect(execute).not.toHaveBeenCalled();
});

it("does not acquire a microphone or change languages before account settings finish loading", () => {
  const getUserMedia = vi.fn(), save = vi.fn();
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
  render(<GeminiDock ready={false} settings={{ source: "th", target: "en", glossary: "" }} onSettings={save} onPublish={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "เริ่มแปลจากไมค์เครื่องนี้" }));
  fireEvent.keyDown(window, { key: "s", code: "KeyS" });
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it("Stop during microphone permission releases the late stream without starting Gemini", async () => {
  let resolve: ((stream: MediaStream) => void) | undefined;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>((done) => { resolve = done; }));
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  render(<GeminiDock settings={{ source: "th", target: "en", glossary: "" }} onSettings={() => {}} onPublish={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "เริ่มแปลจากไมค์เครื่องนี้" }));
  fireEvent.click(screen.getByRole("button", { name: "หยุดแปล" }));
  await act(async () => { resolve?.(stream); });
  expect(stopTrack).toHaveBeenCalledTimes(1);
  expect(token).not.toHaveBeenCalled();
});