# Opening screen links on Android and iPad

## What's possible
- Web browsers on iPad/iPhone (all browsers, since they all run on Safari) **cannot share the screen** at all. Apple blocks it.
- Chrome on Android phones/tablets also **does not support** screen sharing from a web page.
- So the link can't share the whole screen on these devices. Only a native app could do that, and this project can't make one.

## What we can do instead
1. **Detect the device** when the screen A/B link opens. If screen sharing isn't available, show a clear Thai message instead of a button that fails: "อุปกรณ์นี้แชร์หน้าจอผ่านเว็บไม่ได้".
2. **Camera mode** as a backup on those devices: a "ใช้กล้องแทน" button sends the tablet's camera (switch between front and back) to screen A or B. For example, point it at a whiteboard, a document, or the speaker. It travels the same direct device-to-device way, so the control room and stage need no changes.
3. **Hint for the full screen on iPad**: a short note explaining another option. Use AirPlay or a cable to a Mac/PC, then open the link on that computer to share.
4. Desktop browsers keep working exactly as they do now.

## Technical details
- Feature check: `navigator.mediaDevices?.getDisplayMedia` present, plus a user-agent check for iPadOS/Android as a fallback.
- Camera: `getUserMedia({ video: { facingMode } })`, with a flip button that swaps the track by restarting the session with the new stream.
- Small unit test for the support check helper (iPad UA gives no screen share, desktop Chrome gives screen share).
