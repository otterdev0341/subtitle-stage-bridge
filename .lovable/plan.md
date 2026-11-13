# Side-by-side layouts (no overlap)

Goal: let the director place screen A (slides) and screen B (subtitles) in separate areas, each scaled down, so subtitles never cover the slides.

## What the user gets
1. **Quick layout buttons** in the "ปรับจอ" tab and the quick bar:
   - ซ้อนทับ (current overlay)
   - บน-ล่าง: A on top, B below (divider default 75/25)
   - ซ้าย-ขวา: A left, B right (default 70/30)
   - สลับตำแหน่ง: swap which screen takes which area
2. **Split slider** "สัดส่วนพื้นที่" (50–90%) to set how much space A gets; B fills the rest. Both areas resize together.
3. **No-overlap mode**: while บน-ล่าง or ซ้าย-ขวา is active, dragging or corner-resizing one screen keeps it inside its own area, so it can't slide over the other. Choosing ซ้อนทับ unlocks free placement.
4. **Fit inside the area**: in split modes each screen shows its whole picture inside its area (with letterboxing if needed), so slides shrink instead of being cut off. Crop and zoom still work if the user wants to trim edges.
5. **Two new built-in templates**: "บน-ล่าง ไม่ซ้อน" and "ซ้าย-ขวา ไม่ซ้อน", with thumbnails. Saved templates remember the split mode and ratio.
6. The projector screen shows exactly what the control room shows; transitions animate the change.

## Technical details
- `StageLayout` gains `arrangement: "overlay" | "stack" | "side"`, `split: number` and `splitSwap: boolean` (all optional, defaults to overlay, so existing templates keep working).
- A pure helper `applyArrangement(layout)` in `src/lib/stage-layout.ts` computes both layer rects from arrangement, split and swap, and sets `fit: true`. `clampToRegion(rect, region)` limits drag/resize in StageCanvas while a split mode is on.
- New unit tests: stack 75/25 gives A {y:0,h:75} and B {y:75,h:25}; side 70/30 gives A {x:0,w:70} and B {x:70,w:30}; swap reverses them; the rects never overlap; a resize clamped to its region stays inside it.
- Layout is still broadcast whole through the existing signal, so the projector needs no changes.
