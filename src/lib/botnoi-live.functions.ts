import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Server functions proxy the Botnoi Live Partner API so the browser never calls
// it directly. The operator-supplied key travels only to our own server.
// Validation lives in botnoi-live.server.ts; these loose schemas only bound size.
const credentials = { apiKey: z.string().max(512) };
const sessionRef = z.object({ ...credentials, id: z.string().max(64) });

async function run<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new Error(error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
    throw new Error(error instanceof Error ? error.message : "Botnoi Live ผิดพลาด");
  }
}

export const botnoiLanguages = createServerFn({ method: "POST" })
  .validator(z.object(credentials))
  .handler(({ data }) =>
    run(async () => {
      const { botnoiCredentials, createBotnoiLiveClient } = await import("./botnoi-live.server");
      const { apiKey } = botnoiCredentials.parse(data);
      return { languages: await createBotnoiLiveClient(apiKey).languages() };
    }),
  );

export const botnoiCreateSession = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ...credentials,
      code: z.string().max(128),
      sourceLanguage: z.string().max(16),
      targetLanguages: z.array(z.string().max(16)).max(12),
      glossary: z.string().max(8000),
      title: z.string().max(200).optional(),
      speakerName: z.string().max(120).optional(),
      voiceOutput: z.boolean(),
    }),
  )
  .handler(({ data }) =>
    run(async () => {
      const { botnoiSessionInput, createBotnoiLiveClient } = await import("./botnoi-live.server");
      const input = botnoiSessionInput.parse(data);
      return createBotnoiLiveClient(input.apiKey).createSession(input);
    }),
  );

export const botnoiGetSession = createServerFn({ method: "POST" })
  .validator(sessionRef)
  .handler(({ data }) =>
    run(async () => {
      const { botnoiSessionRef, createBotnoiLiveClient } = await import("./botnoi-live.server");
      const ref = botnoiSessionRef.parse(data);
      return createBotnoiLiveClient(ref.apiKey).getSession(ref.id);
    }),
  );

export const botnoiRenewSpeakerLink = createServerFn({ method: "POST" })
  .validator(sessionRef)
  .handler(({ data }) =>
    run(async () => {
      const { botnoiSessionRef, createBotnoiLiveClient } = await import("./botnoi-live.server");
      const ref = botnoiSessionRef.parse(data);
      return createBotnoiLiveClient(ref.apiKey).renewSpeakerLink(ref.id);
    }),
  );

export const botnoiStopSession = createServerFn({ method: "POST" })
  .validator(sessionRef)
  .handler(({ data }) =>
    run(async () => {
      const { botnoiSessionRef, createBotnoiLiveClient } = await import("./botnoi-live.server");
      const ref = botnoiSessionRef.parse(data);
      return createBotnoiLiveClient(ref.apiKey).stopSession(ref.id);
    }),
  );
