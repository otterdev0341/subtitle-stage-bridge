# Opening screen links on Android and iPad

## What's possible
- Web browsers on iPad/iPhone (all browsers, since they all run on Safari) **cannot share the screen** at all. Apple blocks it.
- Chrome on Android phones/tablets also **does not support** screen sharing from a web page.
- So the link can't share the whole screen on these devices. Only a native app could do that, and this project can't make one.

## What we can do instead
1. **Detect the device** when the screen A/B link opens. If screen sharing isn't available, show a clear Thai message instead of a button that fails: "อุปกรณ์นี้แชร์หน้าจอผ่านเว็บไม่ได้".
2. **Camera mode on every device** (desktop, Android, iPad, phone), for live shots of the event atmosphere: the A/B link page gets two choices, "แชร์หน้าจอ" and "แชร์กล้อง". Camera mode shows a live preview, switches between front and back cameras, and has a quality choice (720p smooth / 1080p sharp). On devices that can't share the screen, only the camera choice is shown. The camera picture goes to screen A or B the same direct device-to-device way, so all layouts, crop, zoom and opacity work on it unchanged.
   - Keep the phone awake while sending (screen wake lock) so the camera doesn't stop when the screen dims.
3. **Hint for the full screen on iPad**: a short note explaining another option. Use AirPlay or a cable to a Mac/PC, then open the link on that computer to share.
4. Desktop browsers keep working exactly as they do now.

## Lag
- The picture travels directly between devices, so the usual delay is about 0.2–0.5 seconds on the same Wi-Fi.
- Quality lowers automatically when the network is weak, so the picture keeps moving instead of freezing.
- 720p at 30fps is the default for smoothness.
- Known limit: some strict networks (venue/corporate Wi-Fi, some mobile data) may block direct connections. A relay server would fix this, but it isn't set up yet.

## Technical details
- Feature check: `navigator.mediaDevices?.getDisplayMedia` present, plus a user-agent check for iPadOS/Android as a fallback.
- Camera: `getUserMedia({ video: { facingMode, width, height, frameRate: 30 }, audio: false })`, `contentHint = "motion"`, Wake Lock API when available, with a flip button that swaps the track by restarting the session with the new stream.
- Small unit test for the support check helper (iPad UA gives no screen share, desktop Chrome gives screen share).
