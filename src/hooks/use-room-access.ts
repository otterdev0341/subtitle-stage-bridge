import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRoomAccess } from "@/lib/room-access";
import { workerInterval } from "@/lib/realtime-room";

export function useRoomAccess(roomId: string) {
  const query = useQuery({
    queryKey: ["room-access", roomId],
    queryFn: () => getRoomAccess(roomId),
    retry: false,
    refetchOnWindowFocus: "always",
  });
  const { refetch } = query;
  useEffect(() => workerInterval(() => { void refetch(); }, 2000), [refetch]);
  return query;
}