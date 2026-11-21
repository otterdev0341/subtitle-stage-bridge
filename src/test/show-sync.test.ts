import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLayout } from "@/lib/stage-layout";
import type { ShowCommand } from "@/lib/show-controls";
import type { StageLayout } from "@/lib/stage-layout";
import { reduceShowCommand } from "@/lib/show-controls";

type Packet = {
  action?: string;
  from?: string;
  to?: string;
  requestId?: string;
  layout?: StageLayout;
  layoutSequence?: number;
  role?: string;
};
type Envelope = { payload: Packet };
type Channel = {
  handler: (message: Envelope) => void;
  on: (type: unknown, filter: unknown, handler: (message: Envelope) => void) => Channel;
  subscribe: (callback: (status: string) => void) => Channel;
  send: (message: Envelope) => Promise<string>;
};
const bus = vi.hoisted(() => ({ channels: [] as Channel[], messages: [] as Packet[] }));
const access = vi.hoisted(() => ({ open: true, owner: true, key: "current-session" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => ({
    data: [{ is_open: access.open, is_owner: access.owner, signaling_key: access.open ? access.key : null }],
    error: null,
  })) },
}));
vi.mock("@/lib/realtime-room", () => ({
  workerInterval: (callback: () => void, ms: number) => {
    const id = setInterval(callback, ms);
    return () => clearInterval(id);
  },
  roomRealtime: () => ({
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
  }),
}));
import { useBroadcastSession } from "@/lib/use-broadcast-session";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  bus.channels = [];
  bus.messages = [];
  access.open = true;
  access.owner = true;
});
describe("room admission", () => {
  it("does not join a closed room and stops the outgoing track", async () => {
    access.open = false;
    const station = renderHook(() => useBroadcastSession("closed"));
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    await act(async () => {
      await expect(station.result.current.start("presentation", stream)).rejects.toThrow("ห้องปิดอยู่");
    });
    expect(bus.channels).toHaveLength(0);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(station.result.current.connected).toBe(false);
  });
  it("does not let a non-owner start a director session", async () => {
    access.owner = false;
    const director = renderHook(() => useBroadcastSession("owned"));
    await act(async () => { await director.result.current.start("director"); });
    expect(bus.channels).toHaveLength(0);
    expect(director.result.current.connected).toBe(false);
  });
});
describe("stage → director → all stage screens", () => {
  it("replays caption state to late outputs and ignores an older Program packet", async () => {
    const { defaultCaption, publishCaption } = await import("@/lib/captions");
    const director = renderHook(() => useBroadcastSession("captions"));
    const first = renderHook(() => useBroadcastSession("captions"));
    const state = {
      ...defaultLayout(),
      captions: publishCaption(defaultCaption(), "ต้นฉบับ", "Latest caption"),
    };
    await act(async () => {
      await director.result.current.start("director");
      director.result.current.sendLayout(defaultLayout());
      await first.result.current.start("translation-display");
    });
    const old = bus.messages.find((packet) => packet.action === "layout")!;
    act(() => director.result.current.sendLayout(state));
    expect(first.result.current.layout?.captions?.text).toBe("Latest caption");
    act(() => bus.channels[1]!.handler({ payload: old }));
    expect(first.result.current.layout?.captions?.text).toBe("Latest caption");
    const late = renderHook(() => useBroadcastSession("captions"));
    await act(async () => {
      await late.result.current.start("translation-display");
    });
    expect(late.result.current.layout?.captions).toEqual(state.captions);
    await act(async () => {
      first.result.current.stop();
      await first.result.current.start("translation-display");
    });
    expect(first.result.current.layout?.captions).toEqual(state.captions);
  });
  it("recovers a refreshed director after a lost leave packet without accepting an old sequence", async () => {
    vi.useFakeTimers();
    const director = renderHook(() => useBroadcastSession("refresh"));
    const output = renderHook(() => useBroadcastSession("refresh"));
    await act(async () => {
      await director.result.current.start("director");
      director.result.current.sendLayout(defaultLayout());
      director.result.current.sendLayout(defaultLayout());
      await output.result.current.start("translation-display");
    });
    vi.setSystemTime(Date.now() + 13_000);
    const resumed = { ...defaultLayout(), blackout: true };
    act(() => {
      bus.channels[1]!.handler({
        payload: { action: "hello", from: "refreshed-director", role: "director" },
      });
      bus.channels[1]!.handler({
        payload: {
          action: "layout",
          from: "refreshed-director",
          layoutSequence: 1,
          layout: resumed,
        },
      });
    });
    expect(output.result.current.layout?.blackout).toBe(true);
  });
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
