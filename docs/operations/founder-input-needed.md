# Founder Input Needed — Consolidated Package

**Generated 2026-06-11 (unattended completion run).** Everything below
is the COMPLETE list of inputs only the Founder can provide. All
engineering on the other side of each item is already built, tested,
and merged: adapters, setup UI, honest status, mock/demo fallbacks,
and docs exist for every entry. Machine mirror:
`GET /api/v1/otzar/production-readiness`.

## 0. URGENT — production database credentials (discovered this run)

The production schema push was Founder-approved and the preflight was
attempted — it **aborted safely at authentication**: both
`DATABASE_URL` and `DIRECT_URL` in the deployment env fail with
Prisma P1000 (invalid credentials) against the production Supabase
host. No diff ran; nothing was pushed; nothing was harmed.

**Needed:** rotate/refresh the production Supabase credentials and
update `.env` (`DATABASE_URL` + `DIRECT_URL`).
**Then run** (from the readiness matrix §1):

```bash
cd niov-foundation && set -a && . ./.env && set +a && cd packages/database
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
# READ THE SCRIPT — proceed only if additive-only (CREATE TABLE/TYPE/INDEX, ALTER TYPE ADD VALUE; zero DROPs)
npx prisma db push --schema=prisma/schema.prisma --skip-generate
```

Unlocks (flips PROD-READY → PROD): Collaboration Workspaces +
External Collaborators, Meeting Capture, Voice tables, Observe/OCR,
Onboarding persistence, Regulator Share Packages (15 additive tables).

## 1. API keys (each activates instantly; adapter + status + fallback already shipped)

| Env var | Unlocks | Verify after entering |
|---|---|---|
| `DEEPGRAM_API_KEY` | Production streaming voice input (first paid STT seat) | STT provider row flips to CONFIGURED on `GET /api/v1/otzar/observe/providers`-style voice status + Connector Health |
| `OPENAI_API_KEY` | Whisper STT + OpenAI Realtime natural-conversation seat (+ optional LLM) | Voice provider status + readiness runtimes row |
| `ELEVENLABS_API_KEY` | Production voice output (~75ms TTS) | Connector Health → ElevenLabs row CONFIGURED |
| `ASSEMBLYAI_API_KEY` | Meeting diarization seat | Connector Health → AssemblyAI row CONFIGURED |
| `ANTHROPIC_API_KEY` (prod deploy) | Production LLM | Readiness runtimes → "Language intelligence" CONFIGURED |
| `PYTHON_INTELLIGENCE_RUNTIME_URL` | Upgrades My Day from built-in to the intelligence service | My Day provider footer reads "intelligence service"; deploy `services/python-intelligence` (Dockerfile included) |
| `BEAM_RUNTIME_ENABLED=true` + `BEAM_RUNTIME_URL` | Live BEAM supervision (OTP apps already built/tested) | `GET /api/v1/otzar/beam/status` → ACTIVE |
| `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION` or `GOOGLE_CLOUD_VISION_API_KEY` | Cloud OCR (optional — pasted text + sample work today) | Connector Health OCR rows |

## 2. OAuth apps + app review (longest lead time — start Google first)

| Provider | Credentials | App review | Unlocks |
|---|---|---|---|
| Google Cloud | `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` | **Yes — ~6 weeks for restricted scopes** | Gmail, Calendar (fully automatic quiet mode), Meet ingest, Drive |
| Slack | `SLACK_CLIENT_ID`/`_SECRET`/`_SIGNING_SECRET` | Workspace install | Slack notifications/sends (approval-gated) |
| Microsoft Entra | `MICROSOFT_GRAPH_CLIENT_ID`/`_SECRET`/`_TENANT_ID` | Admin consent | M365 email, Teams |
| Zoom | `ZOOM_OAUTH_CLIENT_ID`/`_SECRET` | Marketplace review if published | Zoom recording ingest (consent-gated) |

Setup steps for every provider are in Connector Health → "How to
connect" (admin) and the registry (`connector-adapter-registry.ts`).

## 3. Settlement (deliberately last; architecture complete per ADR-0094)

- `CIRCLE_API_KEY` and/or `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`
- **Plus your explicit written authorization to wire the settlement
  implementation.** Test-locked invariant: credentials alone flip
  rails only to NOT_AUTHORIZED — never live.
- Mock rail (`MOCK_RAIL`) exists for safe pipeline development.

## 4. Honest non-input residuals (no action needed from you)

- Chat proposed-action extractor: regex-canonical today; the
  structured-output upgrade is queued (deliberately not rushed
  unattended — core chat path).
- ADR-0030 COSMP gRPC migration step 2 (BEAM production-path
  expansion).
- Tesseract local OCR dependency (RULE 21 research arc before adding).
- SOC 2 / HIPAA / FedRAMP: certification processes, not code.

## 5. What needs nothing — live today

Identity, Actions + policy + dual-control, notifications + replies,
audit chain, COSMP + DMW (registry, revocation, enforcement), My Day
intelligence, ambient shell + quiet mode (manual + capture-driven
auto), Dandelion (growth + welcome + consent-gated memory), AI
Employees + kill switch, Twin collaboration governance, BEAM status
surfaces, readiness aggregate + runbook + the executable 28-step demo
walk, connector registry with setup guidance (17 providers), mock
settlement rail. Otzar.app bundles fresh.
