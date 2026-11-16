import { SOURCES, isSourceId, type SourceId } from "./sources";
export type RoomLinkView = "director" | SourceId | "stage" | "presenter";

export function roomPath(roomId: string, view: RoomLinkView): string {
  if (isSourceId(view) && view.startsWith("source-"))
    return `/room/${encodeURIComponent(roomId)}?view=source&slot=${SOURCES.find((s) => s.id === view)!.letter}`;
  return `/room/${encodeURIComponent(roomId)}?view=${view}`;
}

export function roomInviteUrl(origin: string, roomId: string, view: RoomLinkView): string {
  const base = new URL(origin);
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("Room invitations require a web origin");
  }
  return new URL(roomPath(roomId, view), base.origin).href;
}
export function parseRoomView(search: Record<string, unknown>): RoomLinkView {
  if (search["view"] === "source")
    return SOURCES.find((s) => s.letter === search["slot"])?.id ?? "presentation";
  const value = search["view"];
  return isSourceId(value) || value === "stage" || value === "presenter" ? value : "director";
}
