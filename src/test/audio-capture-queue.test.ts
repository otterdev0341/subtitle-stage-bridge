import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptionAudioCapture } from "@/lib/audio-capture";

const RATE = 16000;
let port: { onmessage: ((event: { data: Float32Array }) => void) | null };

function installFakeAudio() {
  port = { onmessage: null };
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  class FakeContext {
    sampleRate = RATE;
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createMediaStreamSource() {
      return { connect: vi.fn() };
    }
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  }
  class FakeNode {
    port = port;
    connect = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("AudioWorkletNode", FakeNode);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
}

/** Push `seconds` of loud speech in 0.5 s chunks, which forces an 8 s segment cut. */
function speak(seconds: number) {
  for (let i = 0; i < seconds * 2; i++)
    port.onmessage!({ data: new Float32Array(RATE / 2).fill(0.2) });
}

afterEach(() => vi.unstubAllGlobals());

describe("audio capture when translation is slower than speech", () => {
  it("queues the next segment instead of stopping, and never overlaps requests", async () => {
    installFakeAudio();
    const resolvers: Array<() => void> = [];
    let inFlight = 0,
      maxInFlight = 0;
    const onSegment = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          resolvers.push(() => {
            inFlight--;
            resolve();
          });
        }),
    );
    const onError = vi.fn();
    const onLag = vi.fn();
    const capture = new CaptionAudioCapture();
    await capture.start("microphone", "", onSegment, vi.fn(), onError, onLag);

    speak(8); // segment 1 sent
    speak(8); // segment 2 queued while 1 is still translating
    speak(8); // backlog would be 16 s: older audio trimmed to 12 s
    expect(onSegment).toHaveBeenCalledTimes(1);
    expect(onLag).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    resolvers.shift()!();
    await vi.waitFor(() => expect(onSegment).toHaveBeenCalledTimes(2));
    const wav = atob((onSegment.mock.calls[1] as unknown as [string])[0]);
    expect(wav.length).toBe(44 + 12 * RATE * 2);

    resolvers.shift()!();
    await Promise.resolve();
    speak(8);
    expect(onSegment).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
    expect(onError).not.toHaveBeenCalled();
    capture.stop();
  });

  it("still stops and reports when a translation request fails", async () => {
    installFakeAudio();
    const onError = vi.fn();
    const capture = new CaptionAudioCapture();
    await capture.start(
      "microphone",
      "",
      vi.fn().mockRejectedValue(new Error("ถึงขีดจำกัด")),
      vi.fn(),
      onError,
    );
    speak(8);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("ถึงขีดจำกัด"));
  });
});
