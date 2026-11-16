import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Import the provider and credential access only inside the server handler.
export const translateCaption = createServerFn({ method: "POST" })
  .validator(
    z.object({
      roomId: z.string().uuid(),
      sourceLanguage: z.string(),
      targetLanguage: z.string(),
      text: z.string().max(2000),
      glossary: z.string().max(4000),
      audio: z.string().max(600_000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { translationInput, translateWithGateway } = await import("./translation.server");
    try {
      return await translateWithGateway(
        translationInput.parse(data),
        process.env["LOVABLE_API_KEY"],
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new Error("AI ตอบกลับช้าเกินไป กรุณาลองใหม่");
      throw error;
    }
  });
