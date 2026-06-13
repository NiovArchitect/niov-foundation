# Key Rotation Runbook — Chat-Exposed & Semi-Exposed Provider Secrets

**Status:** Phase 1261 deliverable (2026-06-12), extended in Phase 1263
to cover the OAuth connector secrets. Founder-assisted — rotation
happens ONLY with the Founder logged into each provider console. Secrets
are never typed into chat, never printed, never committed; old and new
values exist only in the provider console and the deployment secret store
(local dev: gitignored `.env` — confirm with `git check-ignore .env`
before any commit).

**Why:** four AI/voice keys were pasted into a chat session during Phase
1258 setup (OpenAI, Deepgram, ElevenLabs, AssemblyAI). Three OAuth
connector secrets (Google, Slack, Zoom) are semi-exposed by virtue of
living in local `.env` and passing through demo-launcher allowlists. Chat
transcripts and local backups are an exposure surface; rotate at the next
convenient moment. (Phase 1263 also added `.env.save` / `*.env.save`
guards to `.gitignore` so an editor/shell backup of `.env` can never be
staged by `git add -A`.)

## Universal secret-handling discipline

These rules apply to EVERY secret in this runbook. They are not optional.

- **Never paste secrets into ChatGPT or Claude Code.** AI chat surfaces
  are exposure surfaces; a pasted secret is a rotated secret.
- **Never print secrets** to a terminal, log, or PR.
- **Never commit secrets.** Confirm `git check-ignore .env` before any
  commit. `.env.save` and `*.env.save` are now gitignored too.
- **Never log secrets.** No secret value belongs in application logs.
- **Never echo `.env`** (`cat`, `echo`, `head`, etc.). Edit it in place
  with an editor or a console paste; never read it back to stdout.
- **Local dev secrets go only in the gitignored `.env`.** Nowhere else
  on the local machine, and never in a tracked file.
- **Production secrets go only in the hosting/deployment secret
  settings** (the platform's secret manager / env-var settings UI) — not
  in any repo file.
- **Future customer/org credentials must be org-scoped and
  vault/secret-ref based** — stored as a secret reference resolved at
  runtime, never inline, never shared across orgs.
- **After rotation, restart the Foundation API** so the new value loads.
- **After an OAuth client-secret rotation, re-consent may be required** —
  the existing token/refresh-token may be invalidated by the provider.
- **VERIFIED must only return after a live provider probe.** Env presence
  is "Configured," not "Verified." Never hand-set a green state.
- **Revoke old/exposed secrets only AFTER the new ones are verified
  live.** Rotating-then-revoking before verification can break the demo.
- **Document status without revealing values.** State "Configured,"
  "Verified," "runtime-pending," or "provider-billing-pending" — never
  the secret itself.

## AI / voice provider rotation (≈3 minutes each)

| # | Provider | Console | Steps |
|---|---|---|---|
| 1 | OpenAI | https://platform.openai.com/api-keys | Create new secret key → replace `OPENAI_API_KEY` in the deployment secret store → delete the old key in the console |
| 2 | Deepgram | https://console.deepgram.com → API Keys | Create new key → replace `DEEPGRAM_API_KEY` → delete old key |
| 3 | ElevenLabs | https://elevenlabs.io → Profile → API Keys | Regenerate/create key → replace `ELEVENLABS_API_KEY` (leave `ELEVENLABS_VOICE_ID` unchanged — Sarah `EXAVITQu4vr4xnSDxMaL`) → remove old key |
| 4 | AssemblyAI | https://www.assemblyai.com/app → API Keys | Rotate key → replace `ASSEMBLYAI_API_KEY` → invalidate old |

Placeholder convention for every value below:
`<enter-new-secret-in-local-env>`.

### 1. OpenAI

- Create a new key in the OpenAI platform.
- Update local/deployment secret storage (`OPENAI_API_KEY =
  <enter-new-secret-in-local-env>`).
- Verify the key honestly via a live call path.
- Revoke the old key only after successful verification.
- If billing/rate-limit blocks usage, report as
  **provider-billing-pending**, not green.

### 2. Deepgram

- Create a new key in the Deepgram console.
- Update local/deployment secret storage (`DEEPGRAM_API_KEY =
  <enter-new-secret-in-local-env>`).
- Verify status honestly.
- If the live STT runtime is not fully wired, say **runtime-pending**,
  not verified.

### 3. ElevenLabs

- Create a new key in the ElevenLabs console.
- Update local/deployment secret storage (`ELEVENLABS_API_KEY =
  <enter-new-secret-in-local-env>`; leave `ELEVENLABS_VOICE_ID`
  unchanged).
- Verify the premium TTS preview path (POST
  `/api/v1/otzar/voice/tts-preview` returns `audio/mpeg`, or
  Voice Providers → "Hear it" plays the premium voice).
- Browser/device TTS must be **fallback only and visibly labeled** — it
  is never the verified premium path.

### 4. AssemblyAI

- Create a new key in the AssemblyAI console.
- Update local/deployment secret storage (`ASSEMBLYAI_API_KEY =
  <enter-new-secret-in-local-env>`).
- Verify honestly.
- If not actively wired, say **provider-configured** or
  **runtime-pending**, not fake green.

## OAuth connector secret rotation

These secrets back the live OAuth connectors (Google Workspace, Slack,
Zoom). Rotating an OAuth **client secret** can invalidate the existing
authorization; budget for a reconnect/re-consent after each.

| # | Secret | Console | Steps |
|---|--------|---------|-------|
| 5 | Google OAuth client secret | https://console.cloud.google.com → APIs & Services → Credentials | Rotate the OAuth 2.0 client secret → replace `GOOGLE_OAUTH_CLIENT_SECRET` → restart API → reconnect/re-consent if token exchange requires it |
| 6 | Slack OAuth client secret | https://api.slack.com/apps → your app → Basic Information → App Credentials | Rotate the client secret → replace `SLACK_CLIENT_SECRET` → restart API → reconnect/re-consent if required |
| 7 | Slack signing secret (if used) | https://api.slack.com/apps → your app → Basic Information → App Credentials | Regenerate the signing secret → replace `SLACK_SIGNING_SECRET` → restart API |
| 8 | Zoom OAuth client secret | https://marketplace.zoom.us → Manage → your app → Basic Information | Rotate the client secret → replace `ZOOM_CLIENT_SECRET` → restart API → reconnect/re-consent if required |

> Note: Slack carries **two** secret types — the OAuth client secret and
> the request-signing secret. Although the program counts Slack as one
> provider in the "seven keys" framing, both Slack secrets are listed
> separately here because both may be in use; rotate whichever the
> deployment actually configures.

### 5. Google OAuth

- Rotate the client secret in Google Cloud Console (APIs & Services →
  Credentials).
- Update local/deployment secret storage
  (`GOOGLE_OAUTH_CLIENT_SECRET = <enter-new-secret-in-local-env>`).
- Restart the Foundation API.
- Reconnect / re-consent if the token exchange requires it.
- Verify only through a **live Google probe** (e.g. the Calendar probe
  used in prior phases) — never hand-set Verified.
- Keep the Google **Internal/Testing** note if it is still true for this
  app.
- Production **External** use later requires Google app verification
  (consent-screen review) — that is a separate, future step.

### 6 & 7. Slack OAuth

- Rotate the Slack **client secret**.
- Rotate the Slack **signing secret** as well, if applicable.
- Update local/deployment secret storage (`SLACK_CLIENT_SECRET` and, if
  used, `SLACK_SIGNING_SECRET`, each = `<enter-new-secret-in-local-env>`).
- Restart the Foundation API.
- Reconnect / re-consent if required.
- Verify only through a **live Slack identity probe** (`auth.test` or
  equivalent). **Do not send Slack messages** as a verification — a
  read-only identity check is the proof.

### 8. Zoom OAuth

- Rotate the Zoom **client secret** in the Zoom Marketplace app.
- Update local/deployment secret storage
  (`ZOOM_CLIENT_SECRET = <enter-new-secret-in-local-env>`).
- Restart the Foundation API.
- Reconnect / re-consent if required.
- Verify only through a **live read-only probe** (e.g. the recordings
  list probe). **Do not create meetings or send messages** as
  verification.
- Scope-history note: Zoom previously required the
  `cloud_recording:read:list_user_recordings` scope for the recordings
  probe — preserve that scope when reconnecting.

## Microsoft 365 — parked (do NOT rotate or create anything now)

- Microsoft 365 is **intentionally parked** until the Microsoft/Entra
  account setup is ready. Do not rotate or create any Microsoft
  credential in this phase.
- Once the account is ready, the connector will require
  `MICROSOFT_GRAPH_*` values (client ID / client secret / tenant).
- Verify only through a **live Microsoft Graph identity probe** — never
  a hand-set green state.

## After each rotation

1. Restart the API (the demo launcher `scripts/start-demo-api.sh`
   already allowlists the AI/voice names; OAuth names land via the Phase
   1262 launcher allowlist).
2. Re-verify readiness honestly — see the per-provider verify notes
   above. Env presence is "Configured"; only a live probe yields
   "Verified."
3. If anything reads "Needs credentials" after rotation, the new value
   didn't load — check `.env` quoting (strip quotes in shell) and restart
   again. **Never paste the secret into chat to debug.**
4. Revoke the old secret only after the new one verifies live.

## Discipline

- One provider at a time; verify before moving to the next.
- If a rotation breaks voice mid-demo, ElevenLabs is the only
  user-audible dependency — rotate it last or off-hours.
- An OAuth client-secret rotation may force a reconnect/re-consent —
  schedule it when a brief connector outage is acceptable.
- Anthropic (`ANTHROPIC_API_KEY`) was NOT chat-exposed; no rotation
  required. Supabase credentials were already rotated in Phase 1258.
