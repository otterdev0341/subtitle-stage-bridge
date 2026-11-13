import { FULL_CROP } from "@/lib/screen-crop";
import {
  arrangementRegions,
  clampToRegion,
  type LayerRect,
  type StageLayout,
} from "@/lib/stage-layout";
import {
  clearSourceTrim,
  freezeContent,
  maskPixels,
  placeContent,
  resolveContent,
  scaleContent,
  translateGroup,
  type StageEditMode,
} from "@/lib/stage-geometry";

export function LayerGeometryControls({
  layer,
  layout,
  mode,
  onChange,
}: {
  layer: LayerRect;
  layout: StageLayout;
  mode: StageEditMode;
  onChange: (next: LayerRect) => void;
}) {
  const stable = freezeContent(layer, layout.aspect),
    content = resolveContent(stable, layout.aspect);
  const mask = maskPixels(layer, layout.aspect);
  const displayed = mode === "content" ? content : mask;
  const crop = layer.sourceCrop ?? FULL_CROP;
  const sourceWidth = ((layer.sourceSize?.w ?? layout.aspect.w) * crop.w) / 100;
  return (
    <fieldset disabled={!!layer.locked} className="relay-geometry-controls">
      <legend>
        {mode === "content"
          ? "Content · ภาพต้นทาง"
          : mode === "mask"
            ? "Mask · ช่องเปิดภาพ"
            : "ย้ายทั้งเลเยอร์"}{" "}
        · พิกเซลบนเวที
      </legend>
      <p>
        {mode === "mask"
          ? "เปลี่ยนช่องเปิดเท่านั้น ภาพข้างในคงขนาดและตำแหน่งเดิม"
          : mode === "content"
            ? "เลื่อนหรือขยายภาพโดยคงสัดส่วน · Mask อยู่ที่เดิม"
            : "ย้าย Content และ Mask พร้อมกัน โดยไม่เปลี่ยนขนาด"}
      </p>
      <div className="relay-display-fields">
        {(
          [
            ["x", "ตำแหน่ง X"],
            ["y", "ตำแหน่ง Y"],
            ["width", "ความกว้าง"],
            ["height", "ความสูง"],
          ] as const
        )
          .filter(([key]) => mode !== "group" || key === "x" || key === "y")
          .map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step={1}
                aria-label={`${mode} ${label}`}
                value={Math.round(displayed[key] * 100) / 100}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const value = Number(e.target.value);
                  if (!Number.isFinite(value)) return;
                  if (mode === "content") {
                    const next =
                      key === "width" || key === "height"
                        ? scaleContent(content, Math.max(1, value) / content[key])
                        : { ...content, [key]: value };
                    onChange({ ...stable, content: next });
                    return;
                  }
                  const axis = key === "x" || key === "width" ? layout.aspect.w : layout.aspect.h;
                  const next = {
                    ...stable,
                    [key]: Math.max(
                      key === "width" || key === "height" ? 100 / axis : 0,
                      Math.min(100, (value / axis) * 100),
                    ),
                  };
                  if (layer.lockAspect && (key === "width" || key === "height")) {
                    const factor = Math.min(
                      next[key] / stable[key],
                      100 / stable.width,
                      100 / stable.height,
                    );
                    next.width = stable.width * factor;
                    next.height = stable.height * factor;
                  }
                  next.x = Math.min(next.x, 100 - next.width);
                  next.y = Math.min(next.y, 100 - next.height);
                  const regions = arrangementRegions(
                    layout.arrangement,
                    layout.split,
                    layout.splitSwap,
                  );
                  const bounded = regions ? clampToRegion(next, regions[layout.activeLayer]) : next;
                  onChange(
                    mode === "group" ? translateGroup(stable, bounded, layout.aspect) : bounded,
                  );
                }}
              />
            </label>
          ))}
        {mode === "content" && (
          <label>
            Scale (%)
            <input
              type="number"
              min={1}
              step={1}
              aria-label="Content Scale (%)"
              value={Math.round((content.width / sourceWidth) * 10000) / 100}
              onChange={(e) => {
                const scale = Number(e.target.value);
                if (scale > 0 && Number.isFinite(scale))
                  onChange({
                    ...stable,
                    content: scaleContent(content, (sourceWidth * scale) / 100 / content.width),
                  });
              }}
            />
          </label>
        )}
      </div>
      <div className="relay-editor-tools">
        <button type="button" onClick={() => onChange(placeContent(stable, layout.aspect, "fit"))}>
          Fit Content
        </button>
        <button type="button" onClick={() => onChange(placeContent(stable, layout.aspect, "fill"))}>
          Fill Mask
        </button>
        <button
          type="button"
          onClick={() => onChange(placeContent(stable, layout.aspect, "center"))}
        >
          Center Content
        </button>
      </div>
      <small>Fit/Fill/Center ทำครั้งเดียวเมื่อกด การลาก Mask หลังจากนั้นไม่ปรับภาพตาม</small>
      {layer.sourceCrop && (crop.w < 100 || crop.h < 100) && (
        <p>
          ภาพนี้มี crop จาก Layout เดิม{" "}
          <button type="button" onClick={() => onChange(clearSourceTrim(stable, layout.aspect))}>
            คืนภาพเต็มที่ A/B ส่งมา
          </button>
        </p>
      )}
    </fieldset>
  );
}
