import { useState } from "react";
import { Button } from "@/components/ui/button";
import { defaultCaption, type CaptionTrack } from "@/lib/captions";

/** Manual subtitle layer on Program: type, publish, hold, hide, clear and style. */
export function CaptionControls({
  track,
  onChange,
  onPublish,
}: {
  track: CaptionTrack;
  onChange: (next: CaptionTrack) => void;
  onPublish: (source: string, text: string) => void;
}) {
  const [text, setText] = useState("");
  const style = track.style ?? defaultCaption().style;
  return (
    <div className="control-translation">
      <label>
        ข้อความซับที่ต้องการส่ง
        <textarea
          lang={track.targetLanguage}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder="พิมพ์ข้อความ เช่น ชื่อผู้พูด หัวข้อ หรือประกาศ"
        />
      </label>
      <div className="control-actions">
        <Button disabled={!text.trim()} onClick={() => onPublish("", text)}>
          ส่งซับขึ้น LIVE
        </Button>
        <Button
          variant="outline"
          aria-pressed={track.held}
          onClick={() =>
            onChange({
              ...track,
              held: !track.held,
              expiresAt:
                track.held && style.readingSeconds
                  ? Date.now() + style.readingSeconds * 1000
                  : track.expiresAt,
            })
          }
        >
          {track.held ? "ปล่อยซับ" : "ค้างซับปัจจุบัน"}
        </Button>
        <Button
          variant="outline"
          aria-pressed={!track.visible}
          onClick={() => onChange({ ...track, visible: !track.visible })}
        >
          {track.visible ? "ซ่อนซับ" : "แสดงซับ"}
        </Button>
        <Button variant="outline" onClick={() => onPublish("", "")}>
          ล้างซับบนจอ
        </Button>
      </div>
      <div className="control-form-row">
        {(
          [
            ["fontSize", "ขนาดตัวอักษร (px)", 20, 120],
            ["maxLines", "จำนวนบรรทัด", 1, 4],
            ["bottom", "ระยะจากขอบล่าง (%)", 0, 40],
            ["background", "ความเข้มพื้นหลัง (%)", 0, 100],
            ["readingSeconds", "ค้างข้อความ (วินาที · 0 = ไม่หมดเวลา)", 0, 60],
          ] as const
        ).map(([key, label, min, max]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={min}
              max={max}
              value={style[key]}
              onChange={(e) =>
                onChange({
                  ...track,
                  style: {
                    ...style,
                    [key]: Math.max(min, Math.min(max, Number(e.target.value))),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
