import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUpRight, RadioTower } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Botnoi Live Relay — ถ่ายทอดภาพและคำบรรยายสด" },
      { name: "description", content: "ส่งภาพพรีเซนต์และคำบรรยายสดจากสองเครื่อง แล้วจัดวางซ้อนบนเวทีเดียวกัน" },
      { property: "og:title", content: "Botnoi Live Relay — ถ่ายทอดภาพและคำบรรยายสด" },
      { property: "og:description", content: "เชื่อมจอพรีเซนต์และจอแปลสดเข้ากับเวทีเดียว" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  const createRoom = () => {
    const id = crypto.randomUUID();
    void navigate({ to: "/room/$roomId", params: { roomId: id }, search: { view: "director" } });
  };

  const enterRoom = () => {
    const id = roomId.trim();
    if (id.length > 0) {
      void navigate({ to: "/room/$roomId", params: { roomId: id }, search: { view: "director" } });
    }
  };

  return (
    <main className="relay-home min-h-screen px-5 py-6 sm:px-10 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between">
          <a href="/" className="relay-brand" aria-label="Botnoi Live Relay home">
            <span className="relay-brand-mark"><RadioTower size={18} strokeWidth={2.2} /></span>
            <span>botnoi<span className="relay-brand-light">{" live relay"}</span></span>
          </a>
          <div className="relay-live-label"><span className="relay-live-dot" /> LIVE BROADCAST</div>
        </header>

        <section className="relay-home-intro grid items-end gap-10 pb-12 pt-14 md:grid-cols-[1.15fr_.85fr] md:pb-16 md:pt-24">
          <div>
            <div className="relay-overline"><span>ภาพพรีเซนต์</span><span className="relay-overline-line" /><span>คำแปลสด</span></div>
            <h1 className="relay-display-title">สองจอ.<br /><em>เวทีเดียว.</em></h1>
          </div>
          <div className="relay-intro-aside">
            <p>รวมภาพพรีเซนต์กับคำบรรยายจากอีกเครื่อง จัดวางให้พอดี แล้วส่งภาพจริงขึ้นจอได้ทันที</p>
            <Button className="relay-primary-button mt-7" onClick={createRoom}>
              สร้างห้องควบคุม <ArrowUpRight size={17} />
            </Button>
          </div>
        </section>

        <section className="relay-workspace" aria-label="ตั้งค่าการถ่ายทอดสด">
          <div className="relay-workspace-heading flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="relay-overline-small">เริ่มต้นถ่ายทอด</span>
              <h2>เตรียมการเชื่อมต่อ</h2>
            </div>
            <div className="relay-step-index"><span>01</span><span className="relay-step-separator">·</span><span>02</span><span className="relay-step-separator">·</span><span>03</span></div>
          </div>

          <div className="relay-setup-grid">
              <div className="relay-setup-step">
                <div className="relay-setup-number">01</div>
                <div className="relay-setup-step-content">
                  <span className="relay-overline-small">ผู้ดำเนินรายการ</span>
                  <h3>เปิดห้องควบคุม</h3>
                  <p>สร้างห้องส่วนตัวสำหรับงานของคุณ ระบบจะเตรียมลิงก์สำหรับคอมทั้งสองเครื่องให้อัตโนมัติ</p>
                  <Button variant="outline" className="relay-outline-button" onClick={createRoom}>
                    <RadioTower size={16} /> สร้างห้องใหม่
                  </Button>
                </div>
              </div>
              <div className="relay-setup-divider"><span><ArrowDown size={15} /></span></div>
              <div className="relay-setup-step">
                <div className="relay-setup-number">02</div>
                <div className="relay-setup-step-content">
                  <span className="relay-overline-small">คอมสองเครื่อง</span>
                  <h3>ส่งลิงก์ให้เครื่องแชร์จอ</h3>
                  <p>ในห้องจะมีลิงก์ 2 แบบ — ลิงก์ "จอ A" และ "จอ B" ส่งให้แต่ละเครื่อง แชร์หน้าจอใดก็ได้ เช่น สไลด์ คำแปล หรือวิดีโอ เปิดลิงก์แล้วกดแชร์จอได้ทันที</p>
                </div>
              </div>
              <div className="relay-setup-divider"><span><ArrowDown size={15} /></span></div>
              <div className="relay-setup-step">
                <div className="relay-setup-number">03</div>
                <div className="relay-setup-step-content">
                  <span className="relay-overline-small">จอฉายหน้างาน</span>
                  <h3>จัดวางภาพบนเวที</h3>
                  <p>ลาก ย้าย และครอปกรอบคำบรรยายให้ซ้อนบนภาพพรีเซนต์ แล้วเปิดจอฉายเต็มจอได้เลย</p>
                </div>
              </div>
          </div>

          <div className="relay-rejoin">
            <div className="relay-rejoin-text">
              <span className="relay-overline-small">มีรหัสห้องอยู่แล้ว</span>
              <p>วางรหัสห้องเพื่อกลับเข้าสู่ห้องควบคุมเดิม</p>
            </div>
            <form className="relay-room-entry" onSubmit={(event) => { event.preventDefault(); enterRoom(); }}>
              <label className="sr-only" htmlFor="room-code">รหัสห้อง</label>
              <input id="room-code" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="วางรหัสห้องที่นี่" />
              <Button variant="ghost" size="icon" disabled={!roomId.trim()} aria-label="เข้าห้อง" title="เข้าห้อง"><ArrowUpRight size={17} /></Button>
            </form>
          </div>
        </section>

        <footer className="relay-home-footer flex flex-wrap items-center justify-between gap-3 py-7">
          <span>BOTNOI LIVE RELAY <span className="relay-footer-dot">·</span> LIVE COMPOSITION</span>
          <span>การเชื่อมต่อเข้ารหัสระหว่างอุปกรณ์</span>
        </footer>
      </div>
    </main>
  );
}