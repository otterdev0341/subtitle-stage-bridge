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

function Home() {
  return (
    <main className="relay-home min-h-screen px-5 py-6 sm:px-10 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between">
          <Link to="/" className="relay-brand" aria-label="Live Relay">
            <span className="relay-brand-mark">
              <RadioTower size={18} strokeWidth={2.2} />
            </span>
            <span>
              live<span className="relay-brand-light">{" relay"}</span>
            </span>
          </Link>
          <AccountMenu />
        </header>
        <section className="relay-home-intro grid items-end gap-10 pb-12 pt-14 md:grid-cols-[1.15fr_.85fr] md:pb-16 md:pt-24">
          <h1 className="relay-display-title">
            ห้าจอ.
            <br />
            <em>เวทีเดียว.</em>
          </h1>
          <div className="relay-intro-aside">
            <p>รวมภาพจากหลายเครื่อง จัดวางบนเวที ขึ้นซับแปลสด แล้วส่งขึ้นจอจริงได้ทันที</p>
            <Button asChild className="relay-primary-button mt-7">
              <Link to="/rooms">
                ไปที่ห้องของฉัน <ArrowUpRight size={17} />
              </Link>
            </Button>
          </div>
        </section>
        <section className="relay-steps" aria-label="ขั้นตอน">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="relay-step-card">
              <span className="relay-setup-number">0{i + 1}</span>
              <Icon size={20} />
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </section>
        <footer className="relay-home-footer flex flex-wrap items-center justify-between gap-3 py-7">
          <span>LIVE RELAY · LIVE COMPOSITION</span>
          <span>ภาพส่งตรงระหว่างอุปกรณ์</span>
        </footer>
      </div>
    </main>
  );
}
