# Founder Input Needed — Consolidated Package

**Generated 2026-06-11 (unattended completion run).** Everything below
is the COMPLETE list of inputs only the Founder can provide. All
engineering on the other side of each item is already built, tested,
and merged: adapters, setup UI, honest status, mock/demo fallbacks,
and docs exist for every entry. Machine mirror:
`GET /api/v1/otzar/production-readiness`.

## 0. ✅ DONE 2026-06-12 — credentials rotated + production schema pushed

RESOLVED: credentials were rotated and verified 2026-06-12; the
preflight ran clean (verified additive-only — 52 tables / 69 types /
177 indexes / 19 columns / 2 enum values; ZERO destructive
operations; saved at /tmp/prod-schema-diff-verified-20260612-0503.sql)
and the Founder typed the exact approval phrase. The push completed
in 34s; the post-push diff is EMPTY ("This is an empty migration.").
All schema-pending capabilities are now schema-live.

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
Onboarding persistence, Regulator Share Packages, and the Work Comms substrate (25 additive tables — 15 product + 10 Work Comms).

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

## 3. Settlement (deliberately last; architecture complete per ADR-0094; governance PROVEN per Phase 1250)

What exists today (no input needed):

- **Governed transaction substrate: PROD** on the current schema —
  DMW actors propose intents, policy gates (AI/devices never
  auto-approve; dual control ≥ $1,000), humans approve, the mock rail
  emits clearly-labeled proofs, every step audit-chained. Demo-walk
  step 29 proves it end-to-end. Admin truth at
  `GET /api/v1/otzar/settlement/readiness`.
- Mock rail (`MOCK_RAIL`): DEMO_ONLY, settles nothing.

What real Circle/Base/USDC settlement needs from you (in order):

1. `CIRCLE_API_KEY` and/or `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`.
2. **Your explicit written authorization to wire a real rail** (per
   ADR-0094 the five bans — no real USDC / CDP / Circle / Base / x402
   live — stay canonical until you lift one explicitly; each rail
   needs its own RULE 21 research arc per the GA6+ ladder).
3. Test-locked invariants that survive both inputs: credentials alone
   flip rails only to NOT_AUTHORIZED — never live; a non-mock rail on
   an intent is FORBIDDEN at the policy gate.

Private keys: NOT_HANDLED — custody stays with the external provider
under any future authorization. Real funds: NOT_AUTHORIZED.

### Work Comms providers (Phase 1254 — when you want Work Comms live)

- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` — work-line voice/SMS +
  phone-number OTP verification.
- `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` + `LIVEKIT_URL` —
  app-native work calls.
- `WHATSAPP_BUSINESS_TOKEN` + `WHATSAPP_BUSINESS_PHONE_ID` — official
  Meta Business API only (app review required). Personal WhatsApp
  monitoring is not supported and will not be built.
- Plus your explicit authorization for the additive Work Comms schema
  (10 models, design in docs/otzar/WORK_COMMS_DESIGN.md).

## 4. Honest non-input residuals (no action needed from you)

- Chat proposed-action extractor: regex-canonical today; the
  structured-output upgrade is queued (deliberately not rushed
  unattended — core chat path).
- ADR-0030 COSMP gRPC migration step 2 (BEAM production-path
  expansion).
- Tesseract local OCR dependency (RULE 21 research arc before adding).
- SOC 2 / HIPAA / FedRAMP: certification processes, not code.

### Dependency updates awaiting your merge (Phase 1248 note)

GitHub reports 9 Dependabot vulnerabilities on the foundation default
branch (2 critical, 2 high, 5 moderate) and 6 open Dependabot PRs.
Unattended policy: external PRs are not merged by the agent.

- **Low-risk, CI green — merge first:** #350 `@grpc/grpc-js`
  1.14.3 → 1.14.4 (patch); #42 `brace-expansion` 5.0.5 → 5.0.6 (patch;
  comment `@dependabot rebase` first — its CI run is stale).
- **Major bumps — need a deliberate ADR-0016 pin review, do NOT
  rubber-stamp:** #303 vitest 2 → 3, #293 pytest 8 → 9, #44 vite +
  vitest, #43 esbuild + vitest (test-runner/build-tool majors can
  change behavior).
- Review the alert list at GitHub → Security → Dependabot to confirm
  which alerts the patch PRs actually close.

## 5. What needs nothing — live today

Identity, Actions + policy + dual-control, notifications + replies,
audit chain, COSMP + DMW (registry, revocation, enforcement), My Day
intelligence, ambient shell + quiet mode (manual + capture-driven
auto), Dandelion (growth + welcome + consent-gated memory), AI
Employees + kill switch, Twin collaboration governance, BEAM status
surfaces, readiness aggregate + runbook + the executable 29-step demo
walk, connector registry with setup guidance (17 providers), mock
settlement rail. Otzar.app bundles fresh.
