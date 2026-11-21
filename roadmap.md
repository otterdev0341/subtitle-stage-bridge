# Live subtitle broadcast

- [x] Add live translation line-count controls and fill-in/fade appearance shared with Presenter; 18 tests pass, signed-in Director-to-Presenter delivery shows the selected three-line limit, clear fades out, and mobile has no horizontal overflow.

- [x] Sweep translation continuity, keyboard scope, room/source navigation, sender cleanup and provider failures; verified all director tabs, real resumed translation, late Presenter captions and room-close cleanup. Existing account settings and records preserved; cross-device video delivery remains unverified.

- [x] Stabilize Gemini Live audio startup, reconnection and session continuity; verified real microphone translation, forced-disconnect recovery, tab switching and Stop.
- [x] Simplify the screen-sharing page with preparation, crop confirmation and live states; sender flow and desktop/mobile previews verified. Headless receiver video remained blank, so cross-device picture delivery remains unverified.

- [x] Replace native room-close confirmations with a shared modal and verify cancellation and closing while signed in.

- [x] Add owner-controlled room open/close and status lights; stop existing shares and block closed-room invitations.
- [x] Default My Rooms to cards with a remembered table option; verify signed-in room lifecycle.

- [x] Fix copied screen invitations to use complete web URLs and make each copy button explicit; verify both recipient pages.

- [x] Build Thai-language broadcast controls and room-link sharing.
- [x] Connect presentation and translation display shares peer-to-peer with movable, resizable layout controls.
- [x] Verify room navigation, typechecking, route tests, and preview behavior; cross-device broadcast requires testing in browsers that can grant screen sharing.
- [x] Stage: A/B frames, corner resize, swap order, aspect/resolution, templates, hold slides
