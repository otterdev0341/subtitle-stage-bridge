import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUpRight, Check, Clapperboard, Copy, Link2, MonitorUp, RadioTower } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canvas Relay — ถ่ายทอดภาพและคำบรรยายสด" },
      { name: "description", content: "ส่งภาพพรีเซนต์และคำบรรยายสดจากสองเครื่อง แล้วจัดวางซ้อนบนเวทีเดียวกัน" },
      { property: "og:title", content: "Canvas Relay — ถ่ายทอดภาพและคำบรรยายสด" },
      { property: "og:description", content: "เชื่อมจอพรีเซนต์และจอแปลสดเข้ากับเวทีเดียว" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [roomId, setRoomId] = useState("");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const navigate = useNavigate();

  const createRoom = () => {
    const id = crypto.randomUUID();
    setCreatedRoomId(id);
    void navigate({ to: "/room/$roomId", params: { roomId: id }, search: { view: "director" } });
  };

  const enterRoom = () => {
    const id = roomId.trim();
    if (id.length > 0) {
      void navigate({ to: "/room/$roomId", params: { roomId: id }, search: { view: "director" } });
    }
  };

  const stageHref = createdRoomId
    ? `/room/${createdRoomId}?view=director`
    : "";

  const shareHref = (view: "presentation" | "translation") =>
    createdRoomId ? `${window.location.origin}/room/${createdRoomId}?view=${view}` : "";

  const copyLink = async (view: "presentation" | "translation") => {
    const href = shareHref(view);
    if (href) {
      await navigator.clipboard.writeText(href);
    }
  };

  return (
    <main className="relay-home min-h-screen px-5 py-6 sm:px-10 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between">
          <a href="/" className="relay-brand" aria-label="Canvas Relay home">
            <span className="relay-brand-mark"><RadioTower size={18} strokeWidth={2.2} /></span>
            <span>canvas<span className="relay-brand-light">relay</span></span>
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
            <div className="relay-step-index"><span>01</span><span className="relay-step-separator">/</span><span>03</span></div>
          </div>

          {createdRoomId ? (
            <div className="relay-room-ready">
              <div className="relay-room-ready-heading">
                <span className="relay-room-icon"><Check size={20} /></span>
                <div><span className="relay-overline-small">ห้องถ่ายทอดพร้อมแล้ว</span><h3>รหัส {createdRoomId.slice(0, 8).toUpperCase()}</h3></div>
              </div>
              <div className="relay-share-grid">
                <RoomShareLink number="01" title="ภาพพรีเซนต์" hint="แชร์หน้าจอที่ใช้ฉายสไลด์" href={shareHref("presentation")} icon={<Clapperboard size={19} />} onCopy={() => void copyLink("presentation")} />
                <RoomShareLink number="02" title="คำบรรยายแปล" hint="พิมพ์คำแปลและแชร์หน้าจอข้อความ" href={shareHref("translation")} icon={<MonitorUp size={19} />} onCopy={() => void copyLink("translation")} />
              </div>
              <Button asChild className="relay-primary-button mt-7">
                <a href={stageHref}><RadioTower size={17} /> เปิดห้องควบคุม <ArrowUpRight size={17} /></a>
              </Button>
            </div>
          ) : (
            <div className="relay-setup-grid">
              <div className="relay-setup-step">
                <div className="relay-setup-number">01</div>
                <div className="relay-setup-step-content">
                  <span className="relay-overline-small">ผู้ดำเนินรายการ</span>
                  <h3>เปิดห้องควบคุม</h3>
                  <p>สร้างลิงก์ห้องส่วนตัว แล้วส่งไปยังสองเครื่องที่ต้องการแชร์จอ</p>
                  <Button variant="outline" className="relay-outline-button" onClick={createRoom}>
                    <RadioTower size={16} /> สร้างห้องใหม่
                  </Button>
                </div>
              </div>
              <div className="relay-setup-divider"><span><ArrowDown size={15} /></span></div>
              <div className="relay-setup-step relay-join-step">
                <div className="relay-setup-number">↳</div>
                <div className="relay-setup-step-content">
                  <span className="relay-overline-small">มีรหัสห้องแล้ว</span>
                  <h3>กลับเข้าสู่ห้อง</h3>
                  <p>วางรหัสห้องที่ได้รับ เพื่อเปิดเวทีและควบคุมภาพ</p>
                  <form className="relay-room-entry" onSubmit={(event) => { event.preventDefault(); enterRoom(); }}>
                    <label className="sr-only" htmlFor="room-code">รหัสห้อง</label>
                    <input id="room-code" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="วางรหัสห้องที่นี่" />
                    <Button variant="ghost" size="icon" disabled={!roomId.trim()} aria-label="เข้าห้อง" title="เข้าห้อง"><ArrowUpRight size={17} /></Button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </section>

        <footer className="relay-home-footer flex flex-wrap items-center justify-between gap-3 py-7">
          <span>CANVAS RELAY <span className="relay-footer-dot">·</span> LIVE COMPOSITION</span>
          <span>การเชื่อมต่อเข้ารหัสระหว่างอุปกรณ์</span>
        </footer>
      </div>
    </main>
  );
}

function RoomShareLink({ number, title, hint, href, icon, onCopy }: { number: string; title: string; hint: string; href: string; icon: React.ReactNode; onCopy: () => void }) {
  return (
    <div className="relay-share-link">
      <span className="relay-share-number">{number}</span>
      <span className="relay-share-icon">{icon}</span>
      <div className="relay-share-copy"><strong>{title}</strong><span>{hint}</span></div>
      <Button variant="ghost" size="icon" onClick={onCopy} aria-label={`คัดลอกลิงก์${title}`} title={`คัดลอกลิงก์${title}`}><Copy size={16} /></Button>
      <Button asChild variant="ghost" size="icon" title={`เปิด${title}`}>
        <a href={href} target="_blank" rel="noreferrer" aria-label={`เปิด${title}`}><Link2 size={16} /></a>
      </Button>
    </div>
  );
}