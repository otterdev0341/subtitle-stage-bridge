import { useId } from "react";
import { Button } from "@/components/ui/button";
import { defaultCaption, type CaptionTrack } from "@/lib/captions";

export function CaptionAppearance({ track, onChange }: {
  track: CaptionTrack;
  onChange: (next: CaptionTrack) => void;
}) {
  const style = { ...defaultCaption().style, ...track.style };
  const labelId = useId();
  return (
    <div className="control-form-row">
      <div>
        <span id={labelId}>จำนวนบรรทัดคำแปล</span>
        <div className="control-actions" role="group" aria-labelledby={labelId}>
          {[1, 2, 3, 4].map((lines) => (
            <Button key={lines} size="sm" variant={style.maxLines === lines ? "default" : "outline"}
              aria-pressed={style.maxLines === lines}
              onClick={() => onChange({ ...track, style: { ...style, maxLines: lines } })}>
              {lines} บรรทัด
            </Button>
          ))}
        </div>
      </div>
      <label>
        การเคลื่อนไหวคำแปล
        <select value={style.animation} onChange={(event) => {
          const animation = event.target.value;
          if (animation !== "none" && animation !== "fade" && animation !== "fill-fade") return;
          onChange({ ...track, style: { ...style, animation } });
        }}>
          <option value="fill-fade">เติมข้อความ + จางเข้า–ออก</option>
          <option value="fade">จางเข้า–ออก</option>
          <option value="none">ไม่มี</option>
        </select>
      </label>
    </div>
  );
}