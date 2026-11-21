import { supabase } from "@/integrations/supabase/client";

export type RoomAccess = { is_open: boolean; is_owner: boolean; signaling_key: string | null };

export function canShareInRoom(access: RoomAccess | null | undefined): boolean {
  return access?.is_open === true && Boolean(access.signaling_key);
}

export async function getRoomAccess(roomId: string): Promise<RoomAccess | null> {
  const { data, error } = await supabase.rpc("get_room_access", { _room_id: roomId });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function setRoomOpen(roomId: string, isOpen: boolean) {
  const { data, error } = await supabase.from("rooms")
    .update({ is_open: isOpen, updated_at: new Date().toISOString() })
    .eq("id", roomId).select("id").single();
  if (error || !data) throw error ?? new Error("เปลี่ยนสถานะห้องไม่สำเร็จ");
}