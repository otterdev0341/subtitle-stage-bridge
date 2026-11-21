import { describe, expect, it } from "vitest";
import { canShareInRoom } from "@/lib/room-access";

describe("room sharing availability", () => {
  it("allows sharing in an open room with a current connection key", () => {
    expect(canShareInRoom({ is_open: true, is_owner: false, signaling_key: "session-1" })).toBe(true);
  });
  it("blocks sharing in a closed room even with an old connection key", () => {
    expect(canShareInRoom({ is_open: false, is_owner: false, signaling_key: "old-session" })).toBe(false);
  });
  it("does not exempt owners from the closed room rule", () => {
    expect(canShareInRoom({ is_open: false, is_owner: true, signaling_key: "old-session" })).toBe(false);
  });
  it("blocks missing rooms and unavailable connection keys", () => {
    expect(canShareInRoom(null)).toBe(false);
    expect(canShareInRoom({ is_open: true, is_owner: false, signaling_key: null })).toBe(false);
  });
});