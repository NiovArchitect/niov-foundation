# Official Documentation Ingest Map — Providers vs Repo Truth

**Status:** Phase 1260 deliverable (2026-06-12). Operations register —
not an ADR; decisions stay in `docs/architecture/decisions/`.
**Purpose:** one map from every external provider the platform touches
to (a) its official documentation, (b) what this repo ACTUALLY
implements today (file paths), and (c) known drift between provider
reality and repo assumptions. Re-verify the "Verified" column before
relying on a row; provider docs move faster than this file.

Ground truth sources: `apps/api/src/services/connectors/connector-adapter-registry.ts`
(19 provider rows), `apps/api/src/services/voice/tts-preview.service.ts`,
`apps/api/src/services/llm/llm.service.ts`, root `package.json`,
ADR-0094 (GATS doctrine + 5 inviolable bans).

## 1. AI / LLM providers (LIVE)

| Provider | Official docs | Repo truth | Env vars | Verified |
|---|---|---|---|---|
| Anthropic (Claude) | https://docs.anthropic.com | `@anthropic-ai/sdk@^0.92.0` (root package.json); `llm.service.ts` AnthropicProvider behind circuit breaker; production `LLM_PROVIDER=anthropic` | `ANTHROPIC_API_KEY`, `LLM_PROVIDER` | 2026-06-12 |
| OpenAI | https://platform.openai.com/docs | `openai@^6.35.0`; OpenAIProvider in `llm.service.ts` (currently 429 — account needs billing; optional); Whisper fallback STT + OPENAI_REALTIME adapter row registered, realtime runtime not wired | `OPENAI_API_KEY` | 2026-06-12 |

## 2. Voice providers (keys configured; TTS LIVE, STT runtime pending)

| Provider | Official docs | Repo truth | Env vars | Verified |
|---|---|---|---|---|
| ElevenLabs (TTS) | https://elevenlabs.io/docs | LIVE: `tts-preview.service.ts` — raw HTTP to `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`; default voice `EXAVITQu4vr4xnSDxMaL` (Sarah, premade — free-tier-safe; LIBRARY voices 402 on free tier), model `eleven_turbo_v2_5`, 600-char cap, "Otzar"→"OatZar" spoken transform | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | 2026-06-12 (live 200 audio/mpeg) |
| Deepgram (streaming STT) | https://developers.deepgram.com | Registry row + key configured; streaming runtime is forward-substrate (no `@deepgram/sdk` dependency yet) | `DEEPGRAM_API_KEY` | 2026-06-12 |
| AssemblyAI (diarization) | https://www.assemblyai.com/docs | Registry row + key configured; diarization runtime forward-substrate | `ASSEMBLYAI_API_KEY` | 2026-06-12 |
| OpenAI Realtime | https://platform.openai.com/docs/guides/realtime | Registry row only; realtime voice runtime forward-substrate | `OPENAI_API_KEY` | 2026-06-12 |

## 3. Data platform (LIVE)

| Provider | Official docs | Repo truth | Env vars | Verified |
|---|---|---|---|---|
| Supabase Postgres | https://supabase.com/docs | Production schema LIVE (pushed 2026-06-11; additive-only, post-push diff EMPTY). Prisma via pooler :6543 (`DATABASE_URL`) + direct :5432 (`DIRECT_URL`); values stored quoted — strip quotes in shell. pgvector per ADR-0043 | `DATABASE_URL`, `DIRECT_URL` | 2026-06-12 |
| Upstash Redis | https://upstash.com/docs | `ioredis@^5.4.1` cache tier | `REDIS_URL` (deployment-specific) | 2026-06-12 |

## 4. Priority C OAuth connectors (registry rows LIVE; OAuth runtime forward-substrate)

Foundation-tier OAuth callback routes do NOT exist yet — the registry
rows are honest setup contracts. Console setup steps live in
`docs/operations/oauth-priority-c-setup-runbook.md`.

| Provider | Official docs | Required envs (registry) | Scopes (registry) |
|---|---|---|---|
| Google Workspace | https://developers.google.com/identity/protocols/oauth2 | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | `calendar.readonly`, `gmail.readonly`, `drive.metadata.readonly` |
| Slack | https://docs.slack.dev | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | `channels:read`, `channels:history`, `users:read`, `chat:write` |
| Microsoft 365 (Graph) | https://learn.microsoft.com/graph | `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `MICROSOFT_GRAPH_TENANT_ID` | `Mail.Read`, `Calendars.Read`, `Files.Read.All`, `User.Read` |
| Zoom | https://developers.zoom.us/docs | `ZOOM_OAUTH_CLIENT_ID`, `ZOOM_OAUTH_CLIENT_SECRET` | `recording:read` |

Other registered connectors (same registry; not Priority C): Jira,
GitHub, Linear, SMTP, Tesseract/AWS Textract/Google Vision OCR,
Twilio, LiveKit, WhatsApp Business.

## 5. Settlement rails (registered, BANNED at runtime per ADR-0094 §2)

Both rows exist in the connector registry as setup contracts ONLY.
The policy gate forbids CIRCLE_GATEWAY / COINBASE_BASE intents even
with credentials present (ADR-0094 Amendment 1 test locks). Only
MOCK_RAIL is executable.

| Provider | Official docs | Repo truth | Env vars |
|---|---|---|---|
| Coinbase Base / CDP | https://docs.cdp.coinbase.com · https://docs.base.org | Registry row (phase 1247); NO SDK installed; NO runtime wiring (ban 2 + 4) | `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` |
| Circle (USDC) | https://developers.circle.com | Registry row (phase 1247); NO runtime wiring (ban 3) | `CIRCLE_API_KEY` |
| x402 protocol | https://docs.x402.org · https://github.com/x402-foundation/x402 | Doctrine-only per ADR-0094; NO live settlement (ban 5) | — |

**Drift notes (2026-06-12, vs ADR-0094 §4 research of 2026-06-02):**
see `docs/operations/x402-base-cdp-architecture-validation.md` §3 —
x402 is now protocol v2 (renamed headers/packages, CAIP-2 network
IDs), the `base-mcp` npm package is archived in favor of the hosted
`https://mcp.base.org` remote MCP, and CDP Server Wallet v1 /
`@coinbase/coinbase-sdk` are deprecated in favor of
`@coinbase/cdp-sdk` Server Wallets v2. None of these change the
bans; all of them change what a future GA6+ slice would build
against.

## 6. Maintenance discipline

- A row is stale the moment its provider ships a breaking change —
  re-verify official docs BEFORE any GA-slice or connector slice
  builds against a row here (RULE 21).
- New providers enter via the connector registry FIRST; this map
  documents, never invents (RULE 12/13: pre-flight grep the registry,
  surface drift inline).
- Secrets never appear here — env var NAMES only.
