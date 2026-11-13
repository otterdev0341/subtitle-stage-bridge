import { describe, expect, it } from "vitest";
import { roomInviteUrl, roomPath } from "@/lib/room-links";

describe("Room invitations", () => {
  const origin = "https://subtitle-stage-bridge.lovable.app";
  const roomId = "3d5ee1b2-efe6-4d7f-83f2-338892a8593d";

  it("copies a full web URL for the presentation computer", () => {
    expect(roomInviteUrl(origin, roomId, "presentation")).toBe(`${origin}/room/${roomId}?view=presentation`);
  });

  it("copies the translation role for the translation computer", () => {
    expect(roomInviteUrl(origin, roomId, "translation")).toBe(`${origin}/room/${roomId}?view=translation`);
  });

  it("keeps stage links on the current web origin", () => {
    expect(roomInviteUrl("https://relay.example.org", roomId, "stage")).toBe(`https://relay.example.org/room/${roomId}?view=stage`);
  });

  it("keeps navigation browser-safe without requiring window during rendering", () => {
    expect(roomPath("room with space", "presentation")).toBe("/room/room%20with%20space?view=presentation");
  });

  it("rejects file URLs instead of sharing a local file address", () => {
    expect(() => roomInviteUrl("file:///room/local", roomId, "presentation")).toThrow("web origin");
  });
});