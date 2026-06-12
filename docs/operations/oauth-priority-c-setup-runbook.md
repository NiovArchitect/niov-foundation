# Priority C OAuth App Setup Runbook — Google → Slack → Microsoft → Zoom

**Status:** Phase 1260 deliverable (2026-06-12). Founder-assisted:
each provider console requires the Founder's account; this runbook is
the exact script. **No secrets in chat, git, or screenshots — client
secrets go straight into the deployment `.env` (gitignored) and
nowhere else.**

**Honest substrate note:** Foundation-tier OAuth callback ROUTES do
not exist yet — the connector registry rows
(`apps/api/src/services/connectors/connector-adapter-registry.ts`)
are the setup contract. Apps can be created and credentials stored
now; the callback/token-exchange slice lands separately and will use
the canonical redirect URI pattern below. Until that slice lands, the
connectors stay honestly "Needs credentials"/"Not connected" in CT —
never fake-green.

## Canonical redirect URI pattern (reserve in every console)

```
Local dev:   http://localhost:3000/api/v1/connectors/oauth/callback/{provider}
Production:  https://<your-api-domain>/api/v1/connectors/oauth/callback/{provider}
```

`{provider}` ∈ `google` | `slack` | `microsoft` | `zoom`. If the
callback slice changes this path, update the consoles AND this file
in the same change (RULE 13 — no silent drift).

## 1. Google Workspace

Console: https://console.cloud.google.com → APIs & Services.

1. Create/select a project (suggest `niov-otzar-prod`).
2. Enable APIs: Google Calendar API, Gmail API, Google Drive API.
3. OAuth consent screen: **Internal** if the org is Workspace-managed
   (skips Google app review); otherwise External → Testing while
   developing. App name "Otzar", support email, domain.
4. Scopes (must match the registry row exactly):
   `https://www.googleapis.com/auth/calendar.readonly`,
   `https://www.googleapis.com/auth/gmail.readonly`,
   `https://www.googleapis.com/auth/drive.metadata.readonly`.
   Gmail/Drive scopes are **restricted/sensitive** — External apps
   need Google verification before production use.
5. Credentials → Create OAuth client ID → Web application → add both
   redirect URIs above.
6. Store as `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
   in the API `.env`.

## 2. Slack

Console: https://api.slack.com/apps → Create New App → From scratch.

1. App name "Otzar", pick the workspace.
2. OAuth & Permissions → Redirect URLs: add both URIs (Slack requires
   HTTPS in production; localhost http is allowed for dev).
3. Bot token scopes (registry row): `channels:read`,
   `channels:history`, `users:read`, `chat:write`.
4. Basic Information → App Credentials: store `SLACK_CLIENT_ID`,
   `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`.
5. Org-wide install stays OFF until the callback slice lands.

## 3. Microsoft 365 (Graph)

Console: https://entra.microsoft.com → App registrations → New.

1. Name "Otzar"; supported account types: **single tenant** (org-scoped
   per the NIOV credential law).
2. Redirect URI (Web): both URIs above.
3. API permissions → Microsoft Graph → **Delegated**: `Mail.Read`,
   `Calendars.Read`, `Files.Read.All`, `User.Read`. `Files.Read.All`
   needs admin consent — click "Grant admin consent" as tenant admin.
4. Certificates & secrets → New client secret (set a calendar reminder
   for its expiry — Entra secrets max out at 24 months).
5. Store `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`,
   `MICROSOFT_GRAPH_TENANT_ID` (Directory/tenant ID from Overview).

## 4. Zoom

Console: https://marketplace.zoom.us → Develop → Build App →
**General App** (OAuth user-managed).

1. App name "Otzar"; user-managed; no marketplace publish needed for
   org-internal use.
2. OAuth redirect URL: both URIs above.
3. Scopes: `recording:read` (registry row; Zoom's granular-scopes UI
   may present it as `cloud_recording:read:list_user_recordings` —
   choose the read-only recording listing/read scopes only).
4. Store `ZOOM_OAUTH_CLIENT_ID`, `ZOOM_OAUTH_CLIENT_SECRET`.

## 5. After each console pass

1. Add the env vars to the API `.env` (gitignored — verify with
   `git check-ignore .env` before committing anything).
2. If running the demo launcher, extend the env allowlist in
   `scripts/start-demo-api.sh` with the new names (precedent: voice
   keys, PR #361 — missing allowlist entries read as
   MISSING_CREDENTIAL).
3. Restart the API; the connector registry row flips from
   "Needs credentials" to "Configured" in CT Integrations — that is
   the ONLY truthful green until the callback slice lands.
4. Never paste a secret into chat. If one leaks, rotate it in the
   console immediately (same law as the four voice keys queued for
   rotation).
