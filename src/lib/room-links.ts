export type RoomLinkView = "director" | "presentation" | "translation" | "stage";

export function roomPath(roomId: string, view: RoomLinkView): string {
  return `/room/${encodeURIComponent(roomId)}?view=${view}`;
}

export function roomInviteUrl(origin: string, roomId: string, view: RoomLinkView): string {
  const base = new URL(origin);
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("Room invitations require a web origin");
  }
  return new URL(roomPath(roomId, view), base.origin).href;
}