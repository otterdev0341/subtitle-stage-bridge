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
          bus.messages.push(message.payload);
          bus.channels.filter((c) => c !== channel).forEach((c) => c.handler(message));
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
  bus.channels = [];
  bus.messages = [];
});
describe("stage → director → all stage screens", () => {
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
