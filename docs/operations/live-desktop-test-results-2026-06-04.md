# Live Desktop Test Results — 2026-06-04

> Companion to `docs/operations/otzar-company-live-test-runbook.md`
> and `docs/operations/live-test-results-2026-06-04.md`. Records
> the actual end-to-end visual launch executed for the Founder per
> the [FOUNDER-AUTH — RUN OTZAR VISUALLY ON MY DESKTOP / REAL
> CUSTOMER EXPERIENCE TEST] directive.

## 1. What's running RIGHT NOW

| Service | URL / path | Status |
|---|---|---|
| Postgres 16 + pgvector (existing test DB) | `localhost:5433/foundation_test` | container `niov-foundation-test-db` healthy |
| Redis 7 (new local) | `localhost:6379` | container `niov-demo-redis` running |
| Foundation API (Fastify + tsx) | `http://localhost:3000` | health: `/api/v1/health` → `{"ok":true,"database":"connected"}` |
| Python intelligence runtime | `http://localhost:8000` | health: `/health` → `{"status":"ok"}` |
| BEAM Collaboration Supervisor | `http://localhost:4001` | health: `/health` → `{"status":"ok","service":"collaboration_supervisor"}` |
| Control Tower web UI (Vite dev) | `http://localhost:5173` | **opened in browser** |
| Otzar.app (Tauri macOS native) | `~/.../src-tauri/target/release/bundle/macos/Otzar.app` | **launched, PID 63341 running** |

## 2. Demo login credentials

A local-dev-only seed (`scripts/demo-seed.ts`) created the demo
org + admin + employee + Twin + project + autonomous-flow
collaboration policy. Login at `http://localhost:5173/login` OR
inside the Otzar.app window:

| Role | Email | Password |
|---|---|---|
| Org admin | `DEMO-2026-06-04-admin@niov.demo` | `demo-password-123` |
| Employee | `DEMO-2026-06-04-employee@niov.demo` | `demo-password-123` |

These credentials are LOCAL-DEV-ONLY. The seed refuses to run when
`DATABASE_URL` does not point at `localhost`. Demo data is tagged
with the `DEMO-2026-06-04-` prefix so re-running the seed cleans up
prior demo rows.

## 3. Verified end-to-end smoke

```
$ curl -s http://localhost:3000/api/v1/health
{"ok":true,"version":"0.0.1","timestamp":"...","database":"connected"}

$ curl -s http://localhost:8000/health
{"status":"ok","service":"niov-python-intelligence","version":"0.1.0"}

$ curl -s http://localhost:4001/health
{"status":"ok","service":"collaboration_supervisor","version":"0.1.0"}

$ curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -d '{"email":"DEMO-2026-06-04-admin@niov.demo",
       "password":"demo-password-123",
       "requested_operations":["read","write","admin_org"]}'
{"ok":true,"token":"...","session_id":"...","expires_at":"...",
 "allowed_operations":["read","write","admin_org"],"clearance_ceiling":0}

$ curl -s http://localhost:3000/api/v1/orgs/me/connector-providers \
  -H "Authorization: Bearer $TOKEN"
{"ok":true,"providers":[<14 canonical providers>]}
```

## 4. Visual walkthrough — admin path

Open `http://localhost:5173` in the browser (already opened) OR
look at the Otzar.app window.

1. Log in with the **admin** credentials above
2. Land on the admin home (`/`)
3. Navigate to `Collaboration Policy` (`/collaboration-policy`) — the
   demo seed already filled `SAME_TEAM` + `SAME_PROJECT` → `ALLOW`
   for autonomous-internal-flow defaults
4. Click `Apply preset` → "Autonomous internal flow" to add the rest
   of the canonical rows + confirm 5 entries
5. Navigate to **Connector Rails** (`/connector-rails`) — Phase 6 page:
   - **Provider catalog**: 14 cards (Google Workspace, Microsoft 365,
     Slack, Jira, Linear, Salesforce, HubSpot, GitHub, GitLab, Notion,
     Confluence, Internal API, MCP Server, Custom). Each card shows
     read/draft/write badges + default-write-mode + amber "Writes
     require Founder authorization" pill when applicable
   - **MCP server connections** — try "New MCP server connection":
     - Display name: `Acme MCP test`
     - Server URL: `https://mcp.example.com`
     - Vault path: `niov/tenants/<demo-org-id>/mcp/local-test/secret`
     - Click Create → row appears with `NOT_CONFIGURED` status
     - **Important safety demo**: try pasting `xoxp-1234-fake-slack-token`
       as the vault path → API rejects with `SECRET_REF_LOOKS_LIKE_RAW_SECRET`
       and the UI surfaces the closed-vocab code in a toast
   - **MCP tool policies** — create a `list_files` / `READ` / `ALLOW`
     policy against the created MCP server
6. Navigate to `Connectors` (`/connectors`) — existing 6/6 OPERATING
   vendor matrix (Slack, M365, Google Workspace, Jira, Linear, GitHub).
   These connectors are read-first; writes are gated
7. Navigate to `Audit Events` if visible — confirm `ADMIN_ACTION` audit
   rows with `details.action` discriminators have been written for every
   admin create/revoke action

## 5. Visual walkthrough — employee path

Log out of the admin session, log back in with the **employee**
credentials.

1. Land on the employee shell (`/app`)
2. `My Twin` (`/app/my-twin`) — Twin identity card + role-scope
   profile + sidecars panel render (sidecars may be empty on a
   fresh demo — that is correct)
3. `Authority` (`/app/authority-grants`) — Phase 4B page:
   - Create an authority grant: `PERSONAL` scope + `SESSION`
     duration + `MODERATE` sensitivity + purpose "Draft follow-up
     emails for me" → row appears
   - Revoke it → row updates to revoked state
4. `Preferences` (`/app/preferences`) — Phase 4C page:
   - Create a `TONE_PREFERENCE` for the Twin → row appears
   - Remove it
5. `Collaboration` (`/app/collaboration`) — Phase 4D page:
   - The autonomous-flow policy is already applied at the org level,
     so a `STATUS_REQUEST` to a same-team coworker will land
     `REQUESTED` (auto-routed) rather than `NEEDS_APPROVAL`
6. `Work Projects` (`/app/work-projects`) — Phase 4E page:
   - The demo seed already created a `Phoenix launch` project with
     Eli as OWNER
7. `Voice` (`/app/voice-ready`) — Phase 4G page:
   - Paste a transcript like "what should I do today?" → structured
     reply card renders with `provider_mode=TEXT_ONLY` and
     `voice_output_supported=false`
   - Per ADR-0085/0089: live mic capture + raw audio retention
     default OFF; this surface accepts a typed transcript only
8. `Chat` (`/app/chat`):
   - "what should I do today?" → `next_step=ANSWERED`
   - "send a slack message to ops" → `next_step=NEEDS_APPROVAL` +
     `approval_reason=CONNECTOR_ACCESS` (the safety gate — chat
     does NOT auto-create an action)
   - "loop in legal on this contract" →
     `next_step=COLLABORATION_REQUEST_SUGGESTED` +
     `target_type=TEAM`
9. `Conversations` (`/app/conversations`) — list of past conversations
10. `Corrections` (`/app/corrections`) — Wave 2C free-form correction
    surface

## 6. Visual walkthrough — desktop path

The **Otzar.app** native window is open (PID 63341). It is wrapping
the SAME Control Tower SPA you see in the browser, served from the
production Vite build.

Confirm in the Otzar.app window:

1. Native macOS chrome / dock icon shows "Otzar"
2. The window content is the Control Tower login screen
3. Log in with either credential set above — the desktop shell hits
   the same Foundation API at `http://localhost:3000/api/v1`
4. Every employee + admin flow works identically inside the desktop
   window
5. **No native command bypass** — the Tauri capability allowlist is
   `core:default + shell:allow-open + opener:default` only (per
   `src-tauri/capabilities/default.json`). No filesystem write, no
   clipboard, no process spawn, no Foundation-API-bypass

## 7. Bounded friction fixed during the launch

Issues surfaced + fixed inline during the visual launch:

1. **BEAM startup failed at first attempt** — `mix run --no-halt`
   from the umbrella root tried to start `cosmp_router` which
   requires `DATABASE_URL`. Re-launched from
   `apps/collaboration_supervisor/` directory with env loaded → BEAM
   starts cleanly with only its own dependencies.
2. **Foundation API login returned `INVALID_CREDENTIALS`** — first
   seed pass left `password_hash` empty because the demo-seed script
   passed `password_hash` instead of `password`. Fixed: use the
   canonical `password` field on `CreateEntityInput` which goes
   through `bcrypt(12)` automatically.
3. **Foundation API login crashed with `maxRetriesPerRequest=2`** —
   the demo env had `REDIS_URL=redis://localhost:6379` but no Redis
   was running. Spun up `niov-demo-redis` (Redis 7 container) on
   `6379` → login + nonce store work cleanly.
4. **`scripts/demo-seed.ts` initially failed Prisma validation** —
   `WorkProject.create` data shape took multiple iterations to match
   the current schema (`name` required; `display_name` /
   `purpose_summary` not on the model). Fixed.
5. **`OrgCollaborationPolicy.upsert` rejected null `request_type`
   in the composite where clause** — switched to plain `create`
   since the demo seed nukes prior demo rows before each run.

None required a code change to Foundation runtime — only the local
demo seed script + the local env file.

## 8. What is NOT activated in this demo run

All forward-substrate per `docs/operations/live-test-results-2026-06-04.md`
§10:

- No real Anthropic / OpenAI / Azure LLM calls (NODE_ENV=test uses
  `MockLLMProvider` returning deterministic strings)
- No real Apple notarization on the Otzar.app bundle (running an
  unsigned local build; macOS Gatekeeper may prompt on first launch)
- No live microphone capture (`LIVE_MIC_CAPTURE_ENABLED=false`)
- No raw audio retention (`RAW_AUDIO_RETENTION_ENABLED=false`)
- No connector writes (`CONNECTOR_WRITE_ENABLED=false`)
- No payment / billing rails (`PAYMENT_RAILS_ENABLED=false`)
- No external send actions (the chat surface marks them
  `NEEDS_APPROVAL` rather than auto-creating)
- No customer connector OAuth flows (vault paths are placeholders
  only — `niov/tenants/<demo-org-id>/...`)

## 9. Tear-down

When done watching:

```sh
# Stop Foundation API
# (the running tsx process; can ^C the terminal or kill the pid)

# Stop Python intelligence
# (uvicorn process; ^C or kill)

# Stop BEAM
# (mix run --no-halt process; ^C or kill)

# Stop Vite dev server (Control Tower)
# (vite process; ^C or kill)

# Quit Otzar.app from the Apple menu

# Stop the demo Redis container
docker stop niov-demo-redis && docker rm niov-demo-redis
```

The `niov-foundation-test-db` Postgres container is shared with
other workflows — leave it running.

## 10. Repo touch from this launch

Two files added under the niov-foundation repo (NOT yet committed —
local-dev artifacts):

- `scripts/demo-seed.ts` — the one-shot seeder; **commit candidate**
  for a follow-up PR if the Founder wants this to land canonical
- `.env.demo.local` — local-dev env (gitignored; matches `.env.demo*`
  exclusion if a `.gitignore` rule is added; currently NOT in
  `.gitignore`)
- `docs/operations/live-desktop-test-results-2026-06-04.md` — this
  document
