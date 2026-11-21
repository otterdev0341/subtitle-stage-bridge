import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GEMINI_LIVE_MODEL } from "./gemini-live";

/** Short-lived, single-use Gemini Live token so the API key never reaches the browser. */
export const createGeminiLiveToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) throw new Error("ยังไม่ได้ใส่คีย์ Gemini ของระบบ");
    const now = Date.now();
    const res = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
      }),
    });
    if (!res.ok) {
      console.error("gemini token", res.status, await res.text());
      throw new Error("ขอสิทธิ์เชื่อมต่อ Gemini ไม่สำเร็จ ตรวจสอบคีย์ Gemini");
    }
    const body = (await res.json()) as { name?: string };
    if (!body.name) throw new Error("Gemini ไม่ส่งสิทธิ์เชื่อมต่อกลับมา");
    return { token: body.name, model: GEMINI_LIVE_MODEL };
  });
