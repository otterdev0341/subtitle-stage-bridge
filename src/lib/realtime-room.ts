import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Realtime client for room signaling.
 *
 * Browsers throttle timers in hidden tabs (for example the Control Room while a
 * full-screen Presenter window is in front). The default Realtime heartbeat runs
 * on a main-thread timer, so a hidden director tab could miss heartbeats and drop
 * the room. This client sends heartbeats from a Web Worker instead. It is
 * separate from the generated client so auth/session behaviour stays untouched.
 */
let client: SupabaseClient | undefined;

export function roomRealtime(): Pick<SupabaseClient, "channel" | "removeChannel"> {
  if (typeof window === "undefined" || typeof Worker === "undefined") return supabase;
  if (client) return client;
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  if (!url || !key) return supabase;
  client = createClient(url, key, {
    realtime: { worker: true },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "relay-room-realtime",
    },
  });
  return client;
}

/**
 * setInterval driven by a Web Worker so it keeps its pace in hidden tabs.
 * Falls back to window.setInterval where workers are unavailable (SSR/tests).
 */
export function workerInterval(callback: () => void, ms: number): () => void {
  if (typeof Worker === "undefined" || typeof URL.createObjectURL !== "function") {
    const id = window.setInterval(callback, ms);
    return () => window.clearInterval(id);
  }
  try {
    const url = URL.createObjectURL(
      new Blob([`setInterval(() => postMessage(0), ${Math.max(100, Math.round(ms))});`], {
        type: "text/javascript",
      }),
    );
    const worker = new Worker(url);
    worker.onmessage = () => callback();
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setInterval(callback, ms);
    return () => window.clearInterval(id);
  }
}
