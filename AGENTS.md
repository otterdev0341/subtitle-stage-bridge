<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Broadcast rooms use shared Lovable Cloud Realtime channels for short-lived WebRTC signaling; screen video stays peer-to-peer so captures are neither stored nor relayed through the app.
- Generate copied room invitations with the shared URL helper and the browser's web origin inside click handlers; keep navigation paths relative so SSR stays safe and recipients receive complete web links.
- Stage composition is one serializable StageLayout (five source layers A–E, independent caption track, z-order, aspect and hold slide) in src/lib/stage-layout.ts. Broadcast authoritative Program only; draft selection and geometry stay local until TAKE. Templates sync to the account (localStorage is the working copy) and the current Program is recovered from the director tab's sessionStorage.
- Screen A–E senders crop on their own device: the raw capture is drawn into a canvas (worker-timed so background tabs keep sending) and only the canvas stream is sent, so pixels outside the crop never leave the sender.
- Live speech translation uses Gemini Live: a requireSupabaseAuth server function mints a single-use ephemeral token (GEMINI_API_KEY stays server-side), and the Control Room GeminiDock streams its own microphone over the Live WebSocket and publishes output transcription as Program captions. Source A–E and Presenter pages never send audio; keep caption sequence/order and Program replay intact for late and reconnected outputs.
- Every page except /, /auth and /reset-password lives under src/routes/_authenticated (client-only gate that remembers the requested path). Room state, translation settings and templates are mirrored between the account (rooms, stage_templates tables) and the browser storage keys the Control Room already reads, via src/lib/account-sync.ts.
- Room signaling uses src/lib/realtime-room.ts (Realtime heartbeat and hello/ready timers in Web Workers) so hidden director tabs stay connected.
- Room availability is owner-controlled in rooms.is_open; invitation readers get only availability, ownership and the current open-session key via get_room_access. Rotate the signaling key on status changes, gate every broadcast start, and unmount active media when availability checks close or fail so old sessions cannot resume after reopening.
- Profile reads must be restricted by database policy to the authenticated user's own ID; account display names are private, not a shared directory.
- Room closing uses the shared CloseRoomDialog in both room-list views and the director page so confirmation and pending/error behavior stay consistent.
- Gemini Live connection lifecycle is managed by GeminiSession with in-memory resumption, bounded retries and setup-gated audio; keep microphone capture mounted during transport handovers and release it on Stop or terminal failure.
- Keep the translation tab force-mounted and hidden when inactive so switching director tabs does not stop the microphone or lose the live interpretation session.
- Sender presentation styles are scoped by sender-page in station.css so preparation, crop preview and live states do not alter director or presenter styling.
