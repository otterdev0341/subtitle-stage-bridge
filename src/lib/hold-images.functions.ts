import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TYPES = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" } as const;

/** Uploads a break-slide image with server privileges and returns a time-limited signed URL. The bucket has no client policies. */
export const uploadHoldImage = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    roomId: z.string().uuid(),
    slide: z.enum(["wait", "title", "technical"]),
    type: z.enum(["image/png", "image/jpeg", "image/webp"]),
    data: z.string().min(1).max(7_000_000),
  }))
  .handler(async ({ data }) => {
    const bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 5 MB");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.roomId}/${data.slide}-${crypto.randomUUID()}.${TYPES[data.type]}`;
    const up = await supabaseAdmin.storage.from("hold-slides").upload(path, bytes, { contentType: data.type });
    if (up.error) { console.error(up.error); throw new Error("upload failed"); }
    const signed = await supabaseAdmin.storage.from("hold-slides").createSignedUrl(path, 60 * 60 * 24 * 30);
    if (signed.error || !signed.data) { console.error(signed.error); throw new Error("sign failed"); }
    return { url: signed.data.signedUrl };
  });
