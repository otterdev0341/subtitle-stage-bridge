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
- Stage composition is one serializable StageLayout (two layers A/B with z-order, aspect, hold slide) in src/lib/stage-layout.ts, broadcast whole via the existing layout signal; templates live in the director's localStorage so no login is needed.
- Screen A/B senders crop on their own device: the raw capture is drawn into a canvas (worker-timed so background tabs keep sending) and only the canvas stream is sent, so pixels outside the crop never leave the sender.
