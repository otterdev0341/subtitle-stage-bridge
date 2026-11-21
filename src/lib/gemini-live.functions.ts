import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GEMINI_LIVE_MODEL } from "./gemini-live";
import { GEMINI_TOKEN_ERRORS } from "./gemini-errors";

/** Short-lived, single-use Gemini Live token so the API key never reaches the browser. */
export const createGeminiLiveToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) throw new Error(GEMINI_TOKEN_ERRORS.missing);
    const now = Date.now();
    const res = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
      }),
    });
    if (!res.ok) {
      console.error("Gemini authorization rejected", res.status);
      throw new Error(res.status === 429 ? GEMINI_TOKEN_ERRORS.quota
        : res.status === 401 || res.status === 403 ? GEMINI_TOKEN_ERRORS.access
        : res.status >= 500 ? GEMINI_TOKEN_ERRORS.unavailable : GEMINI_TOKEN_ERRORS.invalid);
    }
    const body = (await res.json()) as { name?: string };
    if (!body.name) throw new Error(GEMINI_TOKEN_ERRORS.invalid);
    return { token: body.name, model: GEMINI_LIVE_MODEL };
  });
