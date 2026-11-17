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
import { CaptionControls } from "@/components/stage/CaptionControls";
import { defaultCaption } from "@/lib/captions";

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
  const fakeWindow = () => ({
    closed: false,
    opener: {},
    location: { href: "" },
    close: vi.fn(),
    document: { body: {} },
  });
  const fill = () => {
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "key-12345678" } });
    fireEvent.change(screen.getByLabelText("Code ใช้งาน (time code)"), {
      target: { value: "EVENT2026" },
    });
  };
  const renderPanel = () =>
    render(<BotnoiLivePanel roomId={crypto.randomUUID()} defaultSource="th" defaultTarget="en" />);

  it("starts listening in a speaker window, shows the QR and reconnects on new settings", async () => {
    const speaker = fakeWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(speaker as unknown as Window);
    api.create.mockResolvedValue(session);
    api.stop.mockResolvedValue({ ok: true });
    renderPanel();
    const start = screen.getByRole("button", { name: "เริ่มรับเสียง" });
    expect(start).toBeDisabled();
    fill();
    fireEvent.change(screen.getByLabelText(/^Glossary/), { target: { value: "Botnoi = บอทน้อย" } });
    await act(async () => fireEvent.click(start));
    expect(open.mock.calls[0]![1]).toMatch(/^botnoi-speaker-/);
    expect(open.mock.calls[0]![2]).toContain("popup");
    expect(speaker.location.href).toBe(session.speakerUrl);
    expect(api.create.mock.calls[0]![0].data).toMatchObject({
      apiKey: "key-12345678",
      code: "EVENT2026",
      sourceLanguage: "th",
      targetLanguages: ["en"],
      glossary: "Botnoi = บอทน้อย",
    });
    expect(screen.getByAltText(/QR สำหรับผู้ฟัง/)).toHaveAttribute("src", session.qrPngUrl);
    expect(screen.getByRole("button", { name: "หยุดรับเสียง" })).toBeEnabled();

    fireEvent.click(screen.getByLabelText(/ญี่ปุ่น|ja/));
    expect(screen.getByText(/เปลี่ยนภาษาหรือ Glossary แล้ว/)).toBeInTheDocument();
    api.create.mockResolvedValue({
      ...session,
      id: crypto.randomUUID(),
      targetLanguages: ["en", "ja"],
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "เชื่อมต่อใหม่ด้วยค่าใหม่" })),
    );
    expect(api.stop.mock.calls[0]![0].data.id).toBe(session.id);
    expect(api.create.mock.calls[1]![0].data.targetLanguages).toEqual(["en", "ja"]);
    await waitFor(() =>
      expect(screen.queryByText(/เปลี่ยนภาษาหรือ Glossary แล้ว/)).not.toBeInTheDocument(),
    );
    open.mockRestore();
  });

  it("warns when the speaker window is closed and reopens it with a new link", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const speaker = fakeWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(speaker as unknown as Window);
    api.create.mockResolvedValue(session);
    api.get.mockResolvedValue({ ...session, status: "opened" });
    api.renew.mockResolvedValue({ speakerUrl: "https://botnoi.live/partner/live/new" });
    renderPanel();
    fill();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "เริ่มรับเสียง" })));
    speaker.closed = true;
    await act(async () => vi.advanceTimersByTime(2100));
    expect(screen.getByText(/หน้าต่างผู้พูดถูกปิด/)).toBeInTheDocument();
    const again = fakeWindow();
    open.mockReturnValue(again as unknown as Window);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "เปิดหน้าผู้พูดใหม่" })),
    );
    expect(again.location.href).toBe("https://botnoi.live/partner/live/new");
    expect(screen.queryByText(/หน้าต่างผู้พูดถูกปิด/)).not.toBeInTheDocument();
    open.mockRestore();
    vi.useRealTimers();
  });

  it("keeps credentials out of localStorage unless the operator opts in", () => {
    renderPanel();
    fill();
    expect(localStorage.getItem("relay-botnoi-credentials")).toBeNull();
    fireEvent.click(screen.getByLabelText("จำ key และ code ในเครื่องนี้"));
    expect(JSON.parse(localStorage.getItem("relay-botnoi-credentials")!).code).toBe("EVENT2026");
  });

  it("shows Botnoi errors without leaving a stray window", async () => {
    const speaker = fakeWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(speaker as unknown as Window);
    api.create.mockRejectedValue(
      new Error("Code ใช้งานนี้ถูกปิดหรือเวลาหมดแล้ว กรุณาใช้ code ใหม่"),
    );
    renderPanel();
    fill();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "เริ่มรับเสียง" })));
    expect(screen.getByRole("alert")).toHaveTextContent("code ใหม่");
    expect(speaker.close).toHaveBeenCalled();
    open.mockRestore();
  });
});

describe("manual Program captions", () => {
  it("publishes, holds, hides and clears without any AI call", () => {
    const publish = vi.fn();
    const change = vi.fn();
    const track = defaultCaption();
    render(<CaptionControls track={track} onChange={change} onPublish={publish} />);
    const send = screen.getByRole("button", { name: "ส่งซับขึ้น LIVE" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("ข้อความซับที่ต้องการส่ง"), {
      target: { value: "Dr. Somchai" },
    });
    fireEvent.click(send);
    expect(publish).toHaveBeenCalledWith("", "Dr. Somchai");
    fireEvent.click(screen.getByRole("button", { name: "ค้างซับปัจจุบัน" }));
    expect(change.mock.calls[0]![0].held).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ซ่อนซับ" }));
    expect(change.mock.calls[1]![0].visible).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "ล้างซับบนจอ" }));
    expect(publish).toHaveBeenLastCalledWith("", "");
  });
});
