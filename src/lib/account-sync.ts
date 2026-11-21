import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { HOLD_IMG_KEY, HOLD_KEY, TEMPLATE_KEY, loadTemplates, type StageTemplate } from "@/lib/stage-layout";

export type RoomState = {
  holdTexts?: unknown;
  holdImages?: unknown;
  quickSlots?: unknown;
  program?: unknown;
};
export type TranslationSettings = { source: string; target: string; glossary: string };
export const DEFAULT_TRANSLATION: TranslationSettings = { source: "th", target: "en", glossary: "" };

const slotsKey = (roomId: string) => `relay-slots-${roomId}`;
const programKey = (roomId: string) => `relay-program-${roomId}`;
const MIGRATED = "relay-templates-migrated";

/**
 * Mirrors the signed-in owner's saved room + templates into the browser storage
 * keys the Control Room already reads, then saves changes back (debounced).
 * Rooms owned by someone else stay local-only (owned=false).
 */
export function useRoomSync(roomId: string) {
  const [ready, setReady] = useState(false);
  const [owned, setOwned] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [translation, setTranslation] = useState<TranslationSettings>(DEFAULT_TRANSLATION);
  const userRef = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        userRef.current = uid;
        if (!uid) return;
        let { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
        if (!room) {
          // Claim a room link that nobody owns yet (fails silently if someone else owns it).
          const { data: created } = await supabase
            .from("rooms")
            .insert({ id: roomId, owner_id: uid, name: `ห้อง ${roomId.slice(0, 8)}` })
            .select("*")
            .maybeSingle();
          room = created;
        }
        if (room && alive) {
          setOwned(true);
          setRoomName(room.name);
          const state = (room.state ?? {}) as RoomState;
          if (state.holdTexts) localStorage.setItem(HOLD_KEY, JSON.stringify(state.holdTexts));
          if (state.holdImages) localStorage.setItem(HOLD_IMG_KEY, JSON.stringify(state.holdImages));
          if (state.quickSlots) localStorage.setItem(slotsKey(roomId), JSON.stringify(state.quickSlots));
          if (state.program && !sessionStorage.getItem(programKey(roomId)))
            sessionStorage.setItem(programKey(roomId), JSON.stringify(state.program));
          setTranslation({ ...DEFAULT_TRANSLATION, ...((room.translation ?? {}) as Partial<TranslationSettings>) });
        }
        // Templates: upload local-only ones once, then use the account copy.
        const local = loadTemplates(localStorage);
        if (!localStorage.getItem(MIGRATED) && local.length) {
          await supabase.from("stage_templates").upsert(
            local.map((t) => ({ id: t.id, owner_id: uid, name: t.name, layout: t.layout as unknown as Json })),
          );
        }
        localStorage.setItem(MIGRATED, "1");
        const { data: tpl } = await supabase.from("stage_templates").select("id, name, layout").order("created_at");
        if (tpl) localStorage.setItem(TEMPLATE_KEY, JSON.stringify(tpl));
      } catch {
        /* offline: keep local copies */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
  }, [roomId]);

  const saveState = useCallback(
    (state: RoomState) => {
      if (!owned) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void supabase
          .from("rooms")
          .update({ state: state as Json, updated_at: new Date().toISOString() })
          .eq("id", roomId);
      }, 1500);
    },
    [owned, roomId],
  );
  const saveTranslation = useCallback(
    (next: TranslationSettings) => {
      setTranslation(next);
      if (owned) void supabase.from("rooms").update({ translation: next as unknown as Json }).eq("id", roomId);
    },
    [owned, roomId],
  );
  const syncTemplates = useCallback(async (list: StageTemplate[]) => {
    const uid = userRef.current;
    if (!uid) return;
    const ids = list.map((t) => t.id);
    if (ids.length)
      await supabase.from("stage_templates").upsert(
        list.map((t) => ({ id: t.id, owner_id: uid, name: t.name, layout: t.layout as unknown as Json })),
      );
    const q = supabase.from("stage_templates").delete().eq("owner_id", uid);
    await (ids.length ? q.not("id", "in", `(${ids.join(",")})`) : q);
  }, []);

  return { ready, owned, roomName, translation, saveState, saveTranslation, syncTemplates };
}
