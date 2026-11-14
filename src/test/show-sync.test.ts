import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLayout } from "@/lib/stage-layout";
import type { ShowCommand } from "@/lib/show-controls";
import type { StageLayout } from "@/lib/stage-layout";
import { reduceShowCommand } from "@/lib/show-controls";

type Packet = {
  action?: string;
  role?: string;
  from?: string;
  to?: string;
  requestId?: string;
  layout?: StageLayout;
};
type Envelope = { payload: Packet };
type Channel = {
  handler: (message: Envelope) => void;
  on: (type: unknown, filter: unknown, handler: (message: Envelope) => void) => Channel;
  subscribe: (callback: (status: string) => void) => Channel;
  send: (message: Envelope) => Promise<string>;
};
const bus = vi.hoisted(() => ({ channels: [] as Channel[], messages: [] as Packet[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => {
      const channel: Channel = {
        handler: () => {},
        on: (_: unknown, __: unknown, handler: (message: Envelope) => void) => {
          channel.handler = handler;
          return channel;
        },
        subscribe: (callback: (status: string) => void) => {
          bus.channels.push(channel);
          callback("SUBSCRIBED");
          return channel;
        },
        send: (message: Envelope) => {
          const serialized = JSON.parse(JSON.stringify(message)) as Envelope;
          bus.messages.push(serialized.payload);
          bus.channels.filter((c) => c !== channel).forEach((c) => c.handler(serialized));
          return Promise.resolve("ok");
        },
      };
      return channel;
    },
    removeChannel: (channel: Channel) => {
      bus.channels = bus.channels.filter((c) => c !== channel);
    },
  },
}));
import { useBroadcastSession } from "@/lib/use-broadcast-session";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  bus.channels = [];
  bus.messages = [];
});
describe("stage → director → all stage screens", () => {
  it("shares independent Content/Mask geometry with late screens and custom scene shortcuts", async () => {
    let state = defaultLayout();
    state.layers.translation = {
      ...state.layers.translation,
      height: 10,
      content: { x: -200, y: 640, width: 1600, height: 900 },
      sourceSize: { w: 1920, h: 1080 },
    };
    const layers = structuredClone(state.layers);
    layers.translation.content!.width = 800;
    layers.translation.content!.height = 450;
    state.quickSlots = [
      { id: "scene", name: "Content+Mask", layout: { ...defaultLayout(), layers } },
    ];
    const director = renderHook(() =>
      useBroadcastSession("test", (command) => {
        state = reduceShowCommand(state, command);
        return state;
      }),
    );
    const stage = renderHook(() => useBroadcastSession("test"));
    await act(async () => {
      await director.result.current.start("director");
      director.result.current.sendLayout(state);
      await stage.result.current.start("translation-display");
    });
    expect(stage.result.current.layout?.layers.translation).toEqual(state.layers.translation);
    act(() => stage.result.current.sendCommand("slot1"));
    expect(stage.result.current.layout?.layers.translation.content?.width).toBe(800);
    expect(stage.result.current.layout?.layers.translation.height).toBe(10);
    const late = renderHook(() => useBroadcastSession("test"));
    await act(async () => {
      await late.result.current.start("translation-display");
    });
    expect(late.result.current.layout?.layers).toEqual(state.layers);
  });
  it("confirms commands, shares custom slots, and applies a duplicate request only once", async () => {
    let authoritative = defaultLayout();
    const handler = vi.fn((command: ShowCommand) => {
      authoritative = reduceShowCommand(authoritative, command);
      return authoritative;
    });
    const director = renderHook(() => useBroadcastSession("test", handler));
    const stage = renderHook(() => useBroadcastSession("test"));
    const secondStage = renderHook(() => useBroadcastSession("test"));
    await act(async () => {
      await director.result.current.start("director");
      director.result.current.sendLayout(authoritative);
      await stage.result.current.start("translation-display");
      await secondStage.result.current.start("translation-display");
    });
    act(() => stage.result.current.sendCommand("wait"));
    expect(stage.result.current.layout?.hold).toEqual({ id: "wait", target: "stage" });
    expect(secondStage.result.current.layout?.hold).toEqual(stage.result.current.layout?.hold);
    expect(stage.result.current.commandPending).toBe(false);
    act(() => stage.result.current.sendCommand("toggleB"));
    const request = bus.messages.filter((m) => m.action === "command").at(-1);
    act(() => bus.channels[0]!.handler({ payload: request! }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(secondStage.result.current.layout?.layers.translation.visible).toBe(false);
    act(() => stage.result.current.sendCommand("live"));
    expect(stage.result.current.layout?.hold).toBeNull();
  });
  it("reports an absent director instead of changing local output optimistically", async () => {
    vi.useFakeTimers();
    const stage = renderHook(() => useBroadcastSession("empty"));
    await act(async () => {
      await stage.result.current.start("translation-display");
    });
    act(() => stage.result.current.sendCommand("blackout"));
    expect(stage.result.current.layout).toBeNull();
    expect(stage.result.current.commandPending).toBe(true);
    act(() => vi.advanceTimersByTime(4000));
    expect(stage.result.current.error).toContain("หน้าควบคุมไม่ตอบรับ");
    expect(stage.result.current.commandPending).toBe(false);
  });
});

describe("five-input admission and program-only output", () => {
  it("limits each slot to one sender, replaces explicitly, and sends only program to Presenter", async () => {
    const created: FakePeer[] = [];
    class FakePeer {
      connectionState = "new";
      signalingState = "stable";
      localDescription: RTCSessionDescriptionInit | null = null;
      remoteDescription: RTCSessionDescriptionInit | null = null;
      onconnectionstatechange: (() => void) | null = null;
      onicecandidate = null;
      ontrack = null;
      senders: Array<{ track: MediaStreamTrack; replaceTrack: ReturnType<typeof vi.fn> }> = [];
      constructor() {
        created.push(this);
      }
      addTrack(track: MediaStreamTrack) {
        this.senders.push({ track, replaceTrack: vi.fn().mockResolvedValue(undefined) });
      }
      getSenders() {
        return this.senders;
      }
      addTransceiver() {}
      async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: "offer", sdp: "test" };
      }
      async setLocalDescription(sdp: RTCSessionDescriptionInit) {
        this.localDescription = sdp;
        this.signalingState = "have-local-offer";
      }
      close() {
        this.connectionState = "closed";
      }
    }
    vi.stubGlobal("RTCPeerConnection", FakePeer);
    const handler = vi.fn(() => defaultLayout());
    const director = renderHook(() => useBroadcastSession("five", handler));
    await act(async () => {
      await director.result.current.start("director");
    });
    const receiver = bus.channels[0]!;
    const ids = ["presentation", "translation", "source-c", "source-d", "source-e"];
    await act(async () => {
      ids.forEach((role, i) =>
        receiver.handler({ payload: { action: "ready", from: `sender${i}`, role } }),
      );
    });
    expect(director.result.current.participants).toHaveLength(5);
    expect(created).toHaveLength(5);
    expect(created.every((pc) => pc.senders.length === 0)).toBe(true);
    await act(async () =>
      receiver.handler({ payload: { action: "ready", from: "sixth", role: "source-f" } }),
    );
    expect(created).toHaveLength(5);
    await act(async () =>
      receiver.handler({ payload: { action: "ready", from: "replacement", role: "source-e" } }),
    );
    expect(created).toHaveLength(5);
    expect(director.result.current.candidates).toEqual([{ id: "replacement", role: "source-e" }]);
    await act(async () => director.result.current.acceptSource("replacement"));
    expect(director.result.current.participants).toHaveLength(5);
    expect(created[4]!.connectionState).toBe("closed");
    const programTrack = { kind: "video", id: "PROGRAM" } as MediaStreamTrack;
    const program = {
      getTracks: () => [programTrack],
      getVideoTracks: () => [programTrack],
    } as unknown as MediaStream;
    await act(async () => {
      director.result.current.publishProgram(program);
      receiver.handler({ payload: { action: "ready", from: "viewer", role: "presenter" } });
    });
    const viewer = created.at(-1)!;
    expect(viewer.senders.map((s) => s.track.id)).toEqual(["PROGRAM"]);
    act(() =>
      receiver.handler({
        payload: {
          action: "command",
          from: "viewer",
          role: "presenter",
          requestId: "bad",
          command: "blackout",
        } as Packet,
      }),
    );
    expect(handler).not.toHaveBeenCalled();
    act(() =>
      receiver.handler({ payload: { action: "left", from: "sender0", role: "presentation" } }),
    );
    expect(director.result.current.participants.some((p) => p.id === "sender0")).toBe(false);
  });
  it("Presenter API cannot send show-control commands", async () => {
    const presenter = renderHook(() => useBroadcastSession("readonly"));
    await act(async () => {
      await presenter.result.current.start("presenter");
    });
    act(() => presenter.result.current.sendCommand("blackout"));
    expect(bus.messages.some((m) => m.action === "command")).toBe(false);
  });
});
