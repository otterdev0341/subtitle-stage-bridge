import { z } from "zod";

// Botnoi AI Live Translation — Partner API client (server only).
// The operator types the API key and time code in the Control Room; they are
// forwarded to this server module per request and never stored on the server.
export const BOTNOI_LIVE_BASE =
  "https://uwdbmmdnyjjblzsxoevy.supabase.co/functions/v1/partner-api/v1";

const languageCode = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);

export const botnoiCredentials = z.object({
  apiKey: z.string().trim().min(8, "กรุณากรอก API key ของ Botnoi Live").max(512),
});

export const botnoiSessionInput = botnoiCredentials.extend({
  code: z.string().trim().min(1, "กรุณากรอก code ใช้งาน (time code)").max(128),
  sourceLanguage: languageCode,
  targetLanguages: z
    .array(languageCode)
    .min(1, "เลือกภาษาปลายทางอย่างน้อย 1 ภาษา")
    .max(6, "เลือกภาษาปลายทางได้สูงสุด 6 ภาษา"),
  glossary: z.string().max(8000, "Glossary ยาวเกิน 8000 ตัวอักษร").default(""),
  title: z.string().trim().max(200).optional(),
  speakerName: z.string().trim().max(120).optional(),
  voiceOutput: z.boolean().default(true),
  returnUrl: z.string().url().startsWith("https://", "return_url ต้องเป็น https://").optional(),
});
export type BotnoiSessionInput = z.infer<typeof botnoiSessionInput>;

export const botnoiSessionRef = botnoiCredentials.extend({ id: z.string().uuid() });
export type BotnoiSessionRef = z.infer<typeof botnoiSessionRef>;

const codeInfo = z
  .object({
    code: z.string(),
    remaining_minutes: z.number().nullable().optional(),
    active: z.boolean().optional(),
  })
  .passthrough();

const sessionShape = z
  .object({
    id: z.string(),
    status: z.enum(["created", "opened", "ended"]).or(z.string()),
    room_code: z.string().optional(),
    source_language: z.string().optional(),
    target_languages: z.array(z.string()).optional(),
    speaker_url: z.string().optional(),
    listen_url: z.string().optional(),
    qr_png_url: z.string().optional(),
    speaker_link_expires_at: z.string().nullable().optional(),
    code: codeInfo.nullable().optional(),
  })
  .passthrough();

export type BotnoiSession = {
  id: string;
  status: string;
  roomCode?: string | undefined;
  sourceLanguage?: string | undefined;
  targetLanguages: string[];
  speakerUrl?: string | undefined;
  listenUrl?: string | undefined;
  qrPngUrl?: string | undefined;
  speakerLinkExpiresAt?: string | null | undefined;
  code?: { code: string; remainingMinutes: number | null; active: boolean } | undefined;
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "API key ไม่ถูกต้อง ถูกยกเลิก หรือไม่ได้กรอก กรุณาตรวจสอบกับผู้ดูแล Botnoi",
  code_exhausted: "Code ใช้งานนี้ถูกปิดหรือเวลาหมดแล้ว กรุณาใช้ code ใหม่",
  code_not_found: "ไม่พบ code ใช้งานนี้ กรุณาตรวจสอบตัวสะกด",
  code_required: "กรุณากรอก code ใช้งาน",
  invalid_languages: "ภาษาที่เลือกไม่รองรับ กรุณาเลือกใหม่",
  invalid_glossary: "Glossary ไม่ถูกต้อง (สูงสุด 300 คำ / 8000 ตัวอักษร)",
  not_found: "ไม่พบ session นี้ หรือ session ไม่ได้เป็นของ API key นี้",
  ended: "Session นี้จบไปแล้ว กรุณาเชื่อมต่อใหม่",
  rate_limited: "เปิด session ถี่เกินไป (เกิน 20 ครั้ง/นาที) กรุณารอสักครู่",
};

export class BotnoiLiveError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BotnoiLiveError";
  }
}

/** Accept "term = translation" / "term: translation" lines and pass them as structured terms. */
export function parseGlossary(text: string) {
  const lines = text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 300);
  return lines.map((line) => {
    const match = line.match(/^(.+?)\s*(?:=|:|→|->)\s*(.+)$/);
    if (!match) return { term: line.slice(0, 200) };
    return { term: match[1]!.slice(0, 200), translation: match[2]!.slice(0, 400) };
  });
}

function toSession(raw: unknown): BotnoiSession {
  const s = sessionShape.parse(raw);
  return {
    id: s.id,
    status: s.status,
    roomCode: s.room_code,
    sourceLanguage: s.source_language,
    targetLanguages: s.target_languages ?? [],
    speakerUrl: s.speaker_url,
    listenUrl: s.listen_url,
    qrPngUrl: s.qr_png_url,
    speakerLinkExpiresAt: s.speaker_link_expires_at ?? null,
    code: s.code
      ? {
          code: s.code.code,
          remainingMinutes: s.code.remaining_minutes ?? null,
          active: s.code.active ?? true,
        }
      : undefined,
  };
}

export function createBotnoiLiveClient(apiKey: string, fetcher: typeof fetch = fetch) {
  const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
    let response: Response;
    try {
      response = await fetcher(`${BOTNOI_LIVE_BASE}${path}`, {
        method,
        headers: {
          "x-api-key": apiKey,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? null : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new BotnoiLiveError("Botnoi Live ตอบกลับช้าเกินไป กรุณาลองใหม่", "timeout", 504);
      throw new BotnoiLiveError(
        "เชื่อมต่อ Botnoi Live ไม่ได้ กรุณาตรวจอินเทอร์เน็ต",
        "network",
        502,
      );
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code: string = payload?.error?.code ?? `http_${response.status}`;
      const message =
        ERROR_TEXT[code] ??
        (payload?.error?.message
          ? `Botnoi Live: ${String(payload.error.message).slice(0, 300)}`
          : `Botnoi Live ตอบกลับผิดพลาด (${response.status})`);
      throw new BotnoiLiveError(message, code, response.status);
    }
    return payload;
  };

  return {
    async languages(): Promise<string[]> {
      const payload = await call("GET", "/languages");
      return z.object({ languages: z.array(z.string()) }).parse(payload).languages;
    },
    async createSession(input: BotnoiSessionInput): Promise<BotnoiSession> {
      const targets = [...new Set(input.targetLanguages)].filter(
        (lang) => lang !== input.sourceLanguage,
      );
      if (!targets.length)
        throw new BotnoiLiveError("ภาษาปลายทางต้องต่างจากภาษาต้นทาง", "invalid_languages", 400);
      const glossary = parseGlossary(input.glossary);
      return toSession(
        await call("POST", "/sessions", {
          code: input.code,
          source_language: input.sourceLanguage,
          target_languages: targets,
          ...(glossary.length ? { glossary } : {}),
          ...(input.title ? { title: input.title } : {}),
          ...(input.speakerName ? { speaker_name: input.speakerName } : {}),
          voice_output: input.voiceOutput,
          ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
        }),
      );
    },
    async getSession(id: string) {
      return toSession(await call("GET", `/sessions/${encodeURIComponent(id)}`));
    },
    async renewSpeakerLink(id: string) {
      const payload = await call("POST", `/sessions/${encodeURIComponent(id)}/speaker-link`);
      return z
        .object({
          speaker_url: z.string(),
          speaker_link_expires_at: z.string().nullable().optional(),
        })
        .passthrough()
        .transform((v) => ({
          speakerUrl: v.speaker_url,
          speakerLinkExpiresAt: v.speaker_link_expires_at ?? null,
        }))
        .parse(payload);
    },
    async stopSession(id: string) {
      try {
        await call("POST", `/sessions/${encodeURIComponent(id)}/stop`);
      } catch (error) {
        // Stopping an already-ended session is a no-op for the operator.
        if (error instanceof BotnoiLiveError && error.code === "ended") return { ok: true };
        throw error;
      }
      return { ok: true };
    },
  };
}
