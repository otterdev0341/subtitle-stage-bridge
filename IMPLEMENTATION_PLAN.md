# Control Room and Gemini captions implementation

## Outcome

Build on the restored 8dc2411 composition behavior. Operators prepare a scene in Preview, explicitly TAKE it to Program, and control live holds/blackout independently. Five cropped P2P video sources and a separate text caption track feed clean Presenter outputs.

## Implementation order

1. Extend the serializable layout to five sources; migrate A/B templates without changing independent Content/Mask geometry. Keep extra sources hidden initially.
2. Separate draft scene history from authoritative Program. Selection and workspace zoom remain local. TAKE commits scene composition; show shortcuts operate on Program immediately. Use accessible Live / Sources / Scene Editor / Translation tabs.
3. Add structured captions (sequence, segment, revision, language, visibility, hold, reading timeout and style). Broadcast full current state and replay it to late/reconnected outputs. Keep source B independent.
4. Add server-only Gemini translation through the Lovable gateway. Support typed transcripts and microphone/tab-audio capture in bounded WAV segments. Serialize requests, discard obsolete results after stop/language changes, show errors, retain manual publication, and cap requests. Do not claim Gemini Live Translate support through the gateway without a verified transport. No migration or new secret values in the repository.
5. Add five-source previews, sender links and a read-only Presenter link. Reuse P2P source video; do not relay screen video through a server or require LiveKit.
6. Verify geometry regression, draft/Program isolation, caption ordering/expiry/replay, source routing, request failures and shortcuts while typing. Run Vitest, TypeScript, production build and focused UI checks. Commit normally and push the connected branch.

## Acceptance

- Moving/resizing Preview never changes Program until TAKE; masks do not rescale content.
- Selected, connected and on-air are distinct. A–E have explicit show/hide controls.
- Presenter renders Program and captions without editing controls; new outputs get the latest state.
- One translation request produces one caption update for all outputs. Late responses cannot overwrite newer manual edits or a changed language session.
- Pause translation, hold caption, hide caption and clear caption are separate actions.
- Model credentials are server-only. Missing gateway configuration and quota/network errors are visible and leave stage video usable.
- Tabs, numeric geometry controls, focus states and show shortcuts work with keyboard. Captions use Thai-aware wrapping and adjustable reading settings.

## References and deployment verification

- https://github.com/steveseguin/vdo.ninja — director/source/viewer roles.
- https://obsproject.com/kb/obs-studio-overview#studio-mode — Preview / Program.
- https://github.com/bitfocus/companion — show controls and feedback.
- https://github.com/SakiRinn/LiveCaptions-Translator — translation operator workflow.
- https://github.com/google-gemini/gemini-live-translate-livekit — shared translation sessions; reference only, no LiveKit migration.
- https://docs.lovable.dev/features/ai — gateway and server credentials.

Live gateway audio acceptance, Thai/English accuracy, actual latency/cost, multi-device capture permissions, P2P connectivity and a 30-minute rehearsal require configured cloud credentials and real devices. Automated provider tests use mocked HTTP, not paid requests. Continuous Gemini Live WebSocket translation is a separate transport upgrade; this implementation uses bounded audio segments through the existing gateway.

## Verification completed — 2026-11-16

- 72 Vitest tests passed, including all five sender crop flows, isolated TAKE, caption expiry/hold, caption plus B video, late-output replay, stale Program rejection, refreshed director recovery and delayed Gemini response rejection.
- TypeScript `--noEmit` and production build passed. Edited TypeScript files have no ESLint errors; the existing StageCanvas effect dependency warning remains. Repository-wide lint still fails on pre-existing formatting/CRLF violations in untouched files.
- Inspected the local app in the browser: changed B's mask X from 192px to 300px; Preview changed while Program remained at 192px, then TAKE updated Program. Verified A–E preview tabs and E sender link.
- Published a manual test caption over the actual room signaling channel, verified the same caption on Presenter, verified clean fullscreen and replay after reloading Presenter.
- No local `LOVABLE_API_KEY` was configured, so actual Gemini inference and audio acceptance were not run. Provider request/error behavior is covered with mocked HTTP. No real microphone/screen permission or five-device rehearsal was performed.
