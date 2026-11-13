import { Clock, RadioTower, Wrench } from "lucide-react";
import type { HoldSlideId, HoldTexts } from "@/lib/stage-layout";

export function HoldSlide({ id, texts }: { id: HoldSlideId; texts: HoldTexts }) {
  const t = texts[id];
  const Icon = id === "wait" ? Clock : id === "title" ? RadioTower : Wrench;
  return (
    <div className={`relay-hold-slide relay-hold-${id}`}>
      <span className="relay-hold-icon"><Icon /></span>
      <strong>{t.title}</strong>
      <small>{t.subtitle}</small>
      <span className="relay-hold-brand">BOTNOI LIVE RELAY</span>
    </div>
  );
}
