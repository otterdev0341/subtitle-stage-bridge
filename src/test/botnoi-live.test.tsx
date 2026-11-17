import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOTNOI_LIVE_BASE,
  botnoiSessionInput,
  createBotnoiLiveClient,
  parseGlossary,
} from "@/lib/botnoi-live.server";

const api = vi.hoisted(() => ({
  languages: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  renew: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@/lib/botnoi-live.functions", () => ({
  botnoiLanguages: api.languages,
  botnoiCreateSession: api.create,
  botnoiGetSession: api.get,
  botnoiRenewSpeakerLink: api.renew,
  botnoiStopSession: api.stop,
}));
import { BotnoiLivePanel } from "@/components/stage/BotnoiLivePanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const sessionPayload = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  status: "created",
  room_code: "PAB12C",
  source_language: "th",
  target_languages: ["en", "ja"],
  speaker_url: "https://botnoi.live/partner/live/token",
  listen_url: "https://botnoi.live/voice-live/join/PAB12C?session=x",
  qr_png_url: "https://api.qrserver.com/v1/create-qr-code/?data=x",
  speaker_link_expires_at: "2026-11-17T01:00:00Z",
  code: { code: "EVENT2026", remaining_minutes: 118, active: true },
};

describe("Botnoi Live partner client", () => {
  it("sends the operator key as x-api-key and maps the session", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(sessionPayload, 201));
    const input = botnoiSessionInput.parse({
      apiKey: "key-12345678",
      code: "EVENT2026",
      sourceLanguage: "th",
      targetLanguages: ["en", "th", "ja", "en"],
      glossary: "Botnoi = บอทน้อย\nLLM",
      voiceOutput: true,
    });
    const session = await createBotnoiLiveClient(input.apiKey, fetcher).createSession(input);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${BOTNOI_LIVE_BASE}/sessions`);
    expect(init.headers["x-api-key"]).toBe("key-12345678");
    const body = JSON.parse(init.body);
    expect(body.target_languages).toEqual(["en", "ja"]);
    expect(body.glossary).toEqual([{ term: "Botnoi", translation: "บอทน้อย" }, { term: "LLM" }]);
    expect(session.speakerUrl).toContain("botnoi.live/partner/live");
    expect(session.code?.remainingMinutes).toBe(118);
  });
  it("turns partner error codes into operator messages", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ error: { code: "code_exhausted", message: "x" } }, 402));
    await expect(createBotnoiLiveClient("key-12345678", fetcher).languages()).rejects.toThrow(
      "code ใหม่",
    );
  });
  it("treats stopping an ended session as done", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ error: { code: "ended" } }, 409));
    await expect(
      createBotnoiLiveClient("key-12345678", fetcher).stopSession(sessionPayload.id),
    ).resolves.toEqual({ ok: true });
  });
  it("validates key, code and target count before calling Botnoi", () => {
    const base = { apiKey: "key-12345678", code: "C", sourceLanguage: "th", glossary: "" };
    expect(() => botnoiSessionInput.parse({ ...base, targetLanguages: [] })).toThrow();
    expect(() =>
      botnoiSessionInput.parse({ ...base, targetLanguages: ["a", "b", "c", "d", "e", "f", "g"] }),
    ).toThrow();
    expect(() =>
      botnoiSessionInput.parse({ ...base, code: " ", targetLanguages: ["en"] }),
    ).toThrow();
    expect(parseGlossary("A: B; C -> D")).toEqual([
      { term: "A", translation: "B" },
      { term: "C", translation: "D" },
    ]);
  });
});

describe("Botnoi Live panel", () => {
  const session = {
    id: sessionPayload.id,
    status: "created",
    roomCode: "PAB12C",
    sourceLanguage: "th",
    targetLanguages: ["en"],
    speakerUrl: "https://botnoi.live/partner/live/token",
    listenUrl: "https://botnoi.live/voice-live/join/PAB12C",
    qrPngUrl: "https://api.qrserver.com/qr.png",
    code: { code: "EVENT2026", remainingMinutes: 100, active: true },
  };
  const fill = () => {
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "key-12345678" } });
    fireEvent.change(screen.getByLabelText("Code ใช้งาน (time code)"), {
      target: { value: "EVENT2026" },
    });
  };

  it("opens the speaker page, shows the QR and reconnects when languages change", async () => {
    const tab = { closed: false, opener: {}, location: { href: "" }, close: vi.fn(), document: {} };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    api.create.mockResolvedValue(session);
    api.stop.mockResolvedValue({ ok: true });
    render(<BotnoiLivePanel roomId={crypto.randomUUID()} defaultSource="th" defaultTarget="en" />);
    const connect = screen.getByRole("button", { name: /เชื่อมต่อ Botnoi Live/ });
    expect(connect).toBeDisabled();
    fill();
    await act(async () => fireEvent.click(connect));
    expect(open).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe(session.speakerUrl);
    expect(api.create.mock.calls[0]![0].data).toMatchObject({
      apiKey: "key-12345678",
      code: "EVENT2026",
      sourceLanguage: "th",
      targetLanguages: ["en"],
    });
    expect(screen.getByAltText(/QR สำหรับผู้ฟัง/)).toHaveAttribute("src", session.qrPngUrl);

    fireEvent.click(screen.getByLabelText(/ญี่ปุ่น|ja/));
    expect(screen.getByText(/เปลี่ยนภาษาแล้ว/)).toBeInTheDocument();
    api.create.mockResolvedValue({
      ...session,
      id: crypto.randomUUID(),
      targetLanguages: ["en", "ja"],
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "เชื่อมต่อใหม่ด้วยภาษาใหม่" })),
    );
    expect(api.stop.mock.calls[0]![0].data.id).toBe(session.id);
    expect(api.create.mock.calls[1]![0].data.targetLanguages).toEqual(["en", "ja"]);
    await waitFor(() => expect(screen.queryByText(/เปลี่ยนภาษาแล้ว/)).not.toBeInTheDocument());
    open.mockRestore();
  });

  it("keeps credentials out of localStorage unless the operator opts in", () => {
    render(<BotnoiLivePanel roomId={crypto.randomUUID()} defaultSource="th" defaultTarget="en" />);
    fill();
    expect(localStorage.getItem("relay-botnoi-credentials")).toBeNull();
    fireEvent.click(screen.getByLabelText("จำ key และ code ในเครื่องนี้"));
    expect(JSON.parse(localStorage.getItem("relay-botnoi-credentials")!).code).toBe("EVENT2026");
  });

  it("shows Botnoi errors without opening a stray tab", async () => {
    const tab = { closed: false, location: { href: "" }, close: vi.fn(), document: {} };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    api.create.mockRejectedValue(
      new Error("Code ใช้งานนี้ถูกปิดหรือเวลาหมดแล้ว กรุณาใช้ code ใหม่"),
    );
    render(<BotnoiLivePanel roomId={crypto.randomUUID()} defaultSource="th" defaultTarget="en" />);
    fill();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /เชื่อมต่อ Botnoi Live/ })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("code ใหม่");
    expect(tab.close).toHaveBeenCalled();
    open.mockRestore();
  });
});
