# Sender-side crop on the screen A/B link

Goal: the person who opens the share link chooses exactly which part of their screen is sent. Anything outside the chosen area never leaves their computer.

## What the sender gets
1. After pressing "เลือกจอที่จะแชร์", the preview shows the whole captured screen with a **crop box** on top.
   - Drag the middle to move it, and drag the corners to resize it.
   - The area outside the box is dimmed, and only the area inside the box is sent.
2. **Quick shape buttons**: เต็มจอ, 16:9, 4:3, 1:1, and อิสระ (free).
3. **Live / Pause buttons**:
   - "หยุดส่งชั่วคราว" freezes the last frame or shows black, so the sender can switch windows privately.
   - "ส่งต่อ" resumes.
4. A small label shows what is being sent, for example "กำลังส่ง 1280×720 · บางส่วนของจอ".
5. The crop is remembered on that computer for the next time the same link opens.
6. The control room sees only the cropped picture. Its own crop, zoom, opacity and layouts still work on top.

## Technical details
- The sender draws the captured video into an offscreen canvas at the crop rect, about 30fps, using requestVideoFrameCallback when available. `canvas.captureStream(30)` provides the track that goes to the peer connection. The raw screen track is never added to the connection.
- Changing the crop box only changes the canvas source rect and output size. When the output size changes, the track keeps running, so no reconnection is needed.
- Pause = stop drawing and fill black (option: keep the last frame).
- Pure helper `cropToPixels(rectPct, videoW, videoH, aspect?)` with unit tests:
  - full = whole frame
  - 16:9 lock keeps the ratio
  - the result stays inside the frame
- Crop is stored in localStorage per room + screen.
