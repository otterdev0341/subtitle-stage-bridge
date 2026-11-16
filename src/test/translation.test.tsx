import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translationInput, translateWithGateway } from "@/lib/translation.server";
import { defaultCaption } from "@/lib/captions";
const api = vi.hoisted(() => ({ translate: vi.fn() }));
vi.mock("@/lib/translation.functions", () => ({ translateCaption: api.translate }));
import { TranslationConsole } from "@/components/stage/TranslationConsole";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});
const input = () =>
  translationInput.parse({
    roomId: crypto.randomUUID(),
    text: "สวัสดี",
    sourceLanguage: "th",
    targetLanguage: "en",
  });
describe("server gateway adapter", () => {
  it("uses server authorization, a Gemini model and validates structured output", async () => {
    const provider = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"source":"สวัสดี","translation":"Hello"}' } }],
        }),
      ),
    );
    const result = await translateWithGateway(input(), "test-key", provider);
    expect(result.translation).toBe("Hello");
    const [url, options] = provider.mock.calls[0]!;
    expect(url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(options.body).model).toMatch(/^google\/gemini-/);
  });
  it("sends audio as WAV and never silently retries a paid request", async () => {
    const provider = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    await expect(
      translateWithGateway({ ...input(), audio: "UklGRg==" }, "key", provider),
    ).rejects.toThrow("โควตา");
    expect(provider).toHaveBeenCalledTimes(1);
    const request = JSON.parse(provider.mock.calls[0]![1].body);
    expect(request.messages[1].content[1].input_audio.format).toBe("wav");
  });
  it("rejects missing credentials, invalid input and malformed model output", async () => {
    const provider = vi.fn();
    await expect(translateWithGateway(input(), undefined, provider)).rejects.toThrow("Secrets");
    expect(provider).not.toHaveBeenCalled();
    expect(() => translationInput.parse({ ...input(), text: "" })).toThrow();
    provider.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] })),
    );
    await expect(translateWithGateway(input(), "key", provider)).rejects.toThrow("รูปแบบ");
  });
});
describe("translation operator races", () => {
  it("discards a delayed result after an operator edits the caption", async () => {
    let resolve!: (value: { source: string; translation: string; latencyMs: number }) => void;
    api.translate.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const publish = vi.fn();
    render(
      <TranslationConsole
        roomId={crypto.randomUUID()}
        track={defaultCaption()}
        onChange={vi.fn()}
        onPublish={publish}
      />,
    );
    fireEvent.change(screen.getByLabelText("ข้อความต้นฉบับ"), { target: { value: "สวัสดี" } });
    fireEvent.click(screen.getByRole("button", { name: "แปลด้วย Gemini" }));
    fireEvent.change(screen.getByLabelText("คำแปล / ซับที่ต้องการส่ง"), {
      target: { value: "Operator correction" },
    });
    await act(async () =>
      resolve({ source: "สวัสดี", translation: "Late translation", latencyMs: 50 }),
    );
    expect((screen.getByLabelText("คำแปล / ซับที่ต้องการส่ง") as HTMLTextAreaElement).value).toBe(
      "Operator correction",
    );
    expect(publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ส่งซับขึ้น LIVE" }));
    expect(publish).toHaveBeenCalledWith("สวัสดี", "Operator correction");
  });
  it("rejects a result when languages change and keeps manual publication available on failure", async () => {
    let reject!: (reason: Error) => void;
    api.translate.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const track = defaultCaption();
    const view = render(
      <TranslationConsole
        roomId={crypto.randomUUID()}
        track={track}
        onChange={vi.fn()}
        onPublish={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("ข้อความต้นฉบับ"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "แปลด้วย Gemini" }));
    view.rerender(
      <TranslationConsole
        roomId={crypto.randomUUID()}
        track={{ ...track, targetLanguage: "ja" }}
        onChange={vi.fn()}
        onPublish={vi.fn()}
      />,
    );
    await act(async () => reject(new Error("Quota exceeded")));
    expect(screen.getByRole("alert").textContent).toContain("Quota exceeded");
    fireEvent.change(screen.getByLabelText("คำแปล / ซับที่ต้องการส่ง"), { target: { value: "Manual" } });
    expect(
      (screen.getByRole("button", { name: "ส่งซับขึ้น LIVE" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
