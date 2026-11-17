import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { TranslationDock } from "@/components/stage/TranslationDock";
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

describe("translation dock", () => {
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
  const renderDock = (connected = true) =>
    render(<TranslationDock roomId={crypto.randomUUID()} roomConnected={connected} />);
  const setUp = async () => {
    fireEvent.click(screen.getByRole("button", { name: "เริ่มถ่ายทอดเสียง" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("API key"), {
      target: { value: "key-12345678" },
    });
    fireEvent.change(within(dialog).getByLabelText("Code ใช้งาน"), {
      target: { value: "EVENT2026" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  };

  it("asks for setup once, then streams the room creator's mic in an embedded page", async () => {
    const open = vi.spyOn(window, "open");
    api.create.mockResolvedValue(session);
    renderDock();
    await setUp();
    expect(api.create).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "เริ่มถ่ายทอดเสียง" })),
    );
    expect(api.create.mock.calls[0]![0].data).toMatchObject({
      apiKey: "key-12345678",
      code: "EVENT2026",
      sourceLanguage: "th",
      targetLanguages: ["en"],
    });
    const frame = screen.getByTitle(/หน้าไมค์ผู้พูด/) as HTMLIFrameElement;
    expect(frame.src).toBe(session.speakerUrl);
    expect(frame.getAttribute("allow")).toContain("microphone");
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByAltText(/QR สำหรับผู้ฟัง/)).toHaveAttribute("src", session.qrPngUrl);
    expect(JSON.parse(localStorage.getItem("relay-botnoi-credentials")!).code).toBe("EVENT2026");
    // Collapsing keeps the stream running.
    fireEvent.click(screen.getByRole("button", { name: "ย่อ" }));
    expect(screen.getByTitle(/หน้าไมค์ผู้พูด/)).toBeInTheDocument();
    open.mockRestore();
  });

  it("switches language in place without leaving the Control Room", async () => {
    api.create.mockResolvedValue(session);
    api.stop.mockResolvedValue({ ok: true });
    renderDock();
    await setUp();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "เริ่มถ่ายทอดเสียง" })),
    );
    api.create.mockResolvedValue({
      ...session,
      id: crypto.randomUUID(),
      targetLanguages: ["ja"],
      speakerUrl: "https://botnoi.live/partner/live/next",
    });
    fireEvent.change(screen.getByLabelText("ภาษาแปล"), { target: { value: "ja" } });
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(api.stop.mock.calls[0]![0].data.id).toBe(session.id);
    expect(api.create.mock.calls[1]![0].data.targetLanguages).toEqual(["ja"]);
    await waitFor(() =>
      expect((screen.getByTitle(/หน้าไมค์ผู้พูด/) as HTMLIFrameElement).src).toBe(
        "https://botnoi.live/partner/live/next",
      ),
    );
    expect(screen.getByText(/สลับภาษาแล้ว/)).toBeInTheDocument();
  });

  it("does not retry a failed language switch in a loop", async () => {
    api.create.mockResolvedValue(session);
    api.stop.mockResolvedValue({ ok: true });
    renderDock();
    await setUp();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "เริ่มถ่ายทอดเสียง" })),
    );
    api.create.mockRejectedValue(
      new Error("Code ใช้งานนี้ถูกปิดหรือเวลาหมดแล้ว กรุณาใช้ code ใหม่"),
    );
    fireEvent.change(screen.getByLabelText("ภาษาแปล"), { target: { value: "ja" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("code ใหม่"), {
      timeout: 3000,
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "เริ่มถ่ายทอดเสียง" })).toBeEnabled();
  });

  it("tests room, Botnoi key, code and the microphone", async () => {
    api.languages.mockResolvedValue({ languages: ["th", "en", "ja"] });
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
    });
    vi.stubGlobal(
      "AudioContext",
      class {
        createAnalyser() {
          return {
            fftSize: 0,
            getFloatTimeDomainData: (data: Float32Array) => data.fill(0.3),
          };
        }
        createMediaStreamSource() {
          return { connect: vi.fn() };
        }
        close = vi.fn().mockResolvedValue(undefined);
      },
    );
    localStorage.setItem(
      "relay-botnoi-credentials",
      JSON.stringify({ apiKey: "key-12345678", code: "EVENT2026" }),
    );
    renderDock(false);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "ทดสอบการเชื่อมต่อ" })),
    );
    await waitFor(() => expect(screen.getByText("ได้ยินเสียงชัดเจน")).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(screen.getByText(/รองรับ 3 ภาษา/)).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่เชื่อมต่อห้อง/)).toBeInTheDocument();
    expect(screen.getByText(/ตรวจ code ตอนเริ่มถ่ายทอด/)).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
    vi.unstubAllGlobals();
  }, 10_000);
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
