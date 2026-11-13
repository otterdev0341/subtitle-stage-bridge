import type { StageTemplate } from "@/lib/stage-layout";

export function TemplatePreview({ template }: { template: StageTemplate }) {
  const { layers, aspect } = template.layout;
  return (
    <span className="relay-template-preview" style={{ aspectRatio: `${aspect.w} / ${aspect.h}` }} aria-hidden="true">
      {(["presentation", "translation"] as const).map((name) => {
        const r = layers[name];
        if (!r.visible) return null;
        return <span key={name} className={`relay-template-preview-layer is-${name}`} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%`, zIndex: r.z }}>{name === "presentation" ? "A" : "B"}</span>;
      })}
    </span>
  );
}
