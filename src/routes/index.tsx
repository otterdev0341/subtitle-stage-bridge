import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Languages, MonitorUp, Presentation, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/AccountMenu";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live Relay — รวมจอและแปลสดบนเวทีเดียว" },
      { name: "description", content: "รับภาพแชร์จอสูงสุด 5 เครื่อง จัดวางบนเวที แปลเสียงพูดสดด้วย Gemini Live แล้วส่งขึ้นจอ Presenter" },
      { property: "og:title", content: "Live Relay — รวมจอและแปลสดบนเวทีเดียว" },
      { property: "og:description", content: "แชร์จอ จัดเวที และขึ้นซับแปลสดจากห้องควบคุมเดียว" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const STEPS = [
  { icon: RadioTower, title: "สร้างห้อง", text: "ห้องและการจัดเวทีจำไว้ในบัญชี เปิดจากเครื่องไหนก็ได้" },
  { icon: MonitorUp, title: "ส่งลิงก์แชร์จอ", text: "ส่งลิงก์ A–E ให้แต่ละเครื่อง เลือกจอและครอปเฉพาะส่วนที่ต้องการ" },
  { icon: Languages, title: "แปลสด", text: "เลือกภาษาและคำศัพท์เฉพาะ เสียงพูดกลายเป็นซับบนจอทันที" },
  { icon: Presentation, title: "เปิด Presenter", text: "ลิงก์ Presenter แสดงเวทีเต็มจอบนโปรเจกเตอร์" },
];

/** Decorative miniature of the live stage: two sources + caption bar. */
function StageMock() {
  return (
    <div className="relay-stage-mock" aria-hidden="true">
      <div className="relay-stage-mock-screen">
        <div className="relay-stage-mock-layer relay-stage-mock-a">
          <span>A</span>
        </div>
        <div className="relay-stage-mock-layer relay-stage-mock-b">
          <span>B</span>
        </div>
        <div className="relay-stage-mock-caption">
          <span className="relay-stage-mock-live" />
          กำลังแปลสด…
        </div>
      </div>
      <div className="relay-stage-mock-bar">
        <span className="relay-stage-mock-dot is-live" /> PROGRAM
        <span className="relay-stage-mock-dot" /> PREVIEW
      </div>
    </div>
  );
}

function Home() {
  return (
    <main className="relay-home">
      <section className="relay-hero">
        <div className="mx-auto max-w-6xl px-5 sm:px-10">
          <header className="flex items-center justify-between py-6">
            <Link to="/" className="relay-brand relay-brand-inverse" aria-label="Live Relay">
              <span className="relay-brand-mark">
                <RadioTower size={18} strokeWidth={2.2} />
              </span>
              <span>
                live<span className="relay-brand-light">{" relay"}</span>
              </span>
            </Link>
            <AccountMenu inverse />
          </header>
          <div className="relay-hero-grid grid items-center gap-12 pb-16 pt-10 md:grid-cols-[1.05fr_.95fr] md:pb-24 md:pt-16">
            <div>
              <p className="relay-hero-kicker">
                <span className="relay-hero-kicker-dot" /> LIVE COMPOSITION
              </p>
              <h1 className="relay-display-title">
                ห้าจอ.
                <br />
                <em>เวทีเดียว.</em>
              </h1>
              <p className="relay-hero-sub">
                รวมภาพจากหลายเครื่อง จัดวางบนเวที ขึ้นซับแปลสด แล้วส่งขึ้นจอจริงได้ทันที
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button asChild className="relay-primary-button relay-primary-button-lg">
                  <Link to="/rooms">
                    ไปที่ห้องของฉัน <ArrowUpRight size={17} />
                  </Link>
                </Button>
                <span className="relay-hero-note">ภาพส่งตรงระหว่างอุปกรณ์ ไม่ผ่านเซิร์ฟเวอร์</span>
              </div>
            </div>
            <StageMock />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-10" aria-label="ขั้นตอน">
        <p className="relay-steps-kicker">เริ่มใน 4 ขั้นตอน</p>
        <div className="relay-steps">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="relay-step-card">
              <span className="relay-setup-number">0{i + 1}</span>
              <Icon size={20} />
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="relay-home-footer mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-7 sm:px-10">
        <span>LIVE RELAY · LIVE COMPOSITION</span>
        <span>ภาพส่งตรงระหว่างอุปกรณ์</span>
      </footer>
    </main>
  );
}
