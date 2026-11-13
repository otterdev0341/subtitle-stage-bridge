import { Clock, RadioTower, Wrench } from "lucide-react";
import type { HoldSlideId, HoldTexts } from "@/lib/stage-layout";

export function HoldSlide({ id, texts, image }: { id: HoldSlideId; texts: HoldTexts; image?: string | undefined }) {
  const t = texts[id];
  if (image) return <div className="relay-hold-slide relay-hold-image"><img src={image} alt={t.title} /></div>;
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
