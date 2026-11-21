import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiSession } from "@/lib/gemini-session";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  onopen?: () => void;
  onmessage?: (event: { data: string }) => Promise<void>;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor() { Socket.instances.push(this); }
  async message(data: object) { await this.onmessage?.({ data: JSON.stringify(data) }); }
}
function socket() {
  const last = Socket.instances.at(-1);
  if (!last) throw new Error("Expected a Live socket");
  return last;
}
function fixture() {
  const options = {
    getToken: vi.fn().mockResolvedValue({ token: "test-authorization", model: "test-model" }),
    prompt: () => "Translate Thai into English",
    onState: vi.fn(), onMessage: vi.fn(), onFatal: vi.fn(),
  };
  return { session: new GeminiSession(options), options };
}
beforeEach(() => { vi.useFakeTimers(); Socket.instances = []; vi.stubGlobal("WebSocket", Socket); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Gemini Live continuity", () => {
  it("sends microphone audio only after setup confirmation", async () => {
    const { session } = fixture();
    session.start(); await Promise.resolve();
    socket().onopen?.();
    session.sendAudio("pcm-frame");
    expect(socket().send).toHaveBeenCalledTimes(1);
    await socket().message({ setupComplete: {} });
    expect(JSON.parse(socket().send.mock.calls[1]?.[0] ?? "{}")).toEqual({ realtimeInput: { audio: { data: "pcm-frame", mimeType: "audio/pcm;rate=16000" } } });
  });
  it("resumes the previous session after a transport interruption", async () => {
    const { session, options } = fixture();
    session.start(); await Promise.resolve();
    await socket().message({ setupComplete: {}, sessionResumptionUpdate: { resumable: true, newHandle: "test-handle" } });
    await socket().message({ sessionResumptionUpdate: { resumable: false } });
    socket().onclose?.({ code: 1006 });
    expect(options.onState).toHaveBeenLastCalledWith("reconnecting", expect.any(String));
    await vi.advanceTimersByTimeAsync(1000);
    socket().onopen?.();
    const setup = JSON.parse(socket().send.mock.calls[0]?.[0] ?? "{}").setup;
    expect(setup.sessionResumption).toEqual({ handle: "test-handle" });
    expect(setup.contextWindowCompression).toEqual({ slidingWindow: {} });
  });
  it("hands over before the provider GoAway deadline", async () => {
    const { session } = fixture();
    session.start(); await Promise.resolve();
    const old = socket();
    await old.message({ sessionResumptionUpdate: { resumable: true, newHandle: "test-handle" }, goAway: { timeLeft: "3s" } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(Socket.instances).toHaveLength(2);
    expect(old.close).toHaveBeenCalledWith(1000);
    socket().onopen?.();
    expect(JSON.parse(socket().send.mock.calls[0]?.[0] ?? "{}").setup.sessionResumption).toEqual({ handle: "test-handle" });
  });
  it("Stop cancels pending token requests without creating another connection", async () => {
    let complete: ((value: { token: string; model: string }) => void) | undefined;
    const { session, options } = fixture();
    options.getToken.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    session.start(); session.stop();
    complete?.({ token: "test-authorization", model: "test-model" });
    await Promise.resolve();
    expect(Socket.instances).toHaveLength(0);
  });
  it("Stop cancels a scheduled reconnect and discards late captions", async () => {
    const { session, options } = fixture();
    session.start(); await Promise.resolve();
    const old = socket();
    old.onclose?.({ code: 1006 });
    session.stop();
    await old.message({ serverContent: { outputTranscription: { text: "late" } } });
    await vi.advanceTimersByTimeAsync(20000);
    expect(Socket.instances).toHaveLength(1);
    expect(options.onMessage).not.toHaveBeenCalled();
  });
  it("language swaps never resume old instructions", async () => {
    const { session } = fixture();
    session.start(); await Promise.resolve();
    await socket().message({ sessionResumptionUpdate: { resumable: true, newHandle: "test-handle" } });
    session.restart(); await Promise.resolve();
    socket().onopen?.();
    expect(JSON.parse(socket().send.mock.calls[0]?.[0] ?? "{}").setup.sessionResumption).toEqual({});
  });
  it("stops on permission failures instead of retrying endlessly", async () => {
    const { session, options } = fixture();
    session.start(); await Promise.resolve();
    socket().onclose?.({ code: 1008 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(options.onFatal).toHaveBeenCalledTimes(1);
    expect(Socket.instances).toHaveLength(1);
  });
  it("bounds consecutive transport recovery attempts", async () => {
    const { session, options } = fixture();
    session.start(); await Promise.resolve();
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      socket().onclose?.({ code: 1006 });
      await vi.advanceTimersByTimeAsync(delay);
    }
    socket().onclose?.({ code: 1006 });
    expect(options.onFatal).toHaveBeenCalledTimes(1);
    expect(Socket.instances).toHaveLength(6);
  });
});