# Enterprise Handoff Runbook

**Phase 1242.** The operator-facing script for handing Otzar +
Foundation to a real enterprise client. Every step below works today
unless explicitly marked as credential- or schema-gated. The
machine-readable mirror is `GET /api/v1/otzar/production-readiness`
(admin-scoped) and the human mirror is
`client-handoff-readiness-matrix.md`.

## 1. Start the local demo

```bash
cd niov-foundation
bash scripts/start-demo-api.sh        # API with real LLM keys from .env; DB forced to localhost
```

Login: any seeded `@niovlabs.com` user with the local demo password
(see `docs/operations/local-demo-logins.md`).

## 2. Run the test suites

```bash
# Foundation (containerized test DB; ADR-0035 §37 — never bare vitest)
npm run db:test:up && npm run db:push:test
npm run test:unit && npm run test:integration

# Control Tower
cd ../otzar-control-tower && npm run typecheck && npm run lint && npm run test && npm run build
```

If the Prisma push trips over the Ecto-owned tables, use the canonical
refresh: `bash scripts/local-test-db-refresh.sh`.

## 3. Rebuild Otzar.app

```bash
cd otzar-control-tower && npm run tauri:build
# Bundles land at src-tauri/target/release/bundle/{macos,dmg}/
```

## 4. Seed a demo org safely

Demo seeding is gated to localhost (`start-demo-api.sh` refuses
non-localhost DATABASE_URL). Production mode (onboarding `PUT
/api/v1/onboarding/mode` → PRODUCTION) gates demo flows off.

## 5–6. Create admin/users, roles & archetypes

- Admins are entities with clearance ≥ 4 + an active org membership.
- Role labels: EntityProfile `job_title`; archetypes: the 13-role
  registry (Phase 1218).
- AI Employees: `POST /api/v1/otzar/ai-employees` (admin) — boundaries
  apply by construction; deactivation is the one-action kill switch.

## 7–12. Verify the employee experience

| Verify | How |
|---|---|
| My Day | Open `/app` — "What matters today" ranks real signals (built-in ranking; intelligence service upgrades it via `PYTHON_INTELLIGENCE_RUNTIME_URL`). |
| Dandelion | Admin: People & Collaboration → "Help your organization grow". Employee: `/app/welcome` → greeting, pronunciation ask, consent-gated memory (approve in Action Center). |
| Observe/OCR | `/app/observe` → "Try a sample" or paste text → decisions/commitments/follow-ups → attach to a workspace. |
| Meeting capture | `/app/meeting-captures` → manual transcript → consent → workspace import. |
| Voice + quiet mode | The Talk-to-Otzar dock; quiet mode via the moon toggle; auto-quiet fires from a scheduled MeetingCapture window. |
| Notifications/actions/replies | Chat → draft → approve → recipient sees the note → inline reply → Action Center updates. Full audit chain per action. |

## 13. Verify compliance share packages

Admin: `POST /api/v1/compliance/share-packages` (purpose, scopes,
time-box) → regulator (addressee only) reads
`GET .../:id/evidence` — redacted counts/types/timestamps only.
Revoke or expiry cuts access immediately. (Live on the local/test DB
today; production activation rides the schema push.)

## 14. Verify no external writes

`INVOKE_CONNECTOR` is the single external seat and sits inside the
Action runtime (policy + approval). With no connector credentials
configured, no external write path exists at all — the enforcement
matrix (`dmw-cosmp-enforcement-matrix.md`) is the evidence record.

## 15. What requires credentials

Google Workspace/Gmail/Calendar (+ Google app review), Slack,
Microsoft 365, Zoom, Whisper (`OPENAI_API_KEY`), Deepgram
(`DEEPGRAM_API_KEY`), cloud OCR (AWS/Google). Every one already has
an adapter + honest status + setup guidance in Connector Health and
the readiness endpoint. Voice provider activation order:
`docs/voice-first/voice-provider-recommendation-2026-06.md`.

## 16. What requires production schema approval

15 additive tables (listed in the readiness endpoint and the matrix).
**Nothing touches production until the Founder types
`APPROVE PROD SCHEMA PUSH`.** The diff is additive only; the
verification commands are in the readiness matrix §1.

## 17. What NOT to claim yet

- Live Google Meet/Zoom/Teams auto-ingest (manual upload is the demo).
- Production-quality voice (browser TTS/STT until provider keys land).
- Automatic calendar quiet mode via Google/Microsoft (works from
  scheduled captures today).
- Circle/Base/USDC settlement (deliberately last; rails prepared).
- SOC 2 / HIPAA / FedRAMP certification (architecturally ready;
  certification processes are separate — matrix §4).

## 18. The canonical 28-step handoff demo (Phase 1245)

Deterministic, credential-free, end-to-end. Every step names its
proving substrate; fixture mode is honest everywhere.

| # | Demo step | How (no credentials needed) |
|---|---|---|
| 1 | Admin sets up org | Demo seed org + Phase 1230 checklist on Production Readiness |
| 2 | Admin invites users | Seeded `@niovlabs.com` users; checklist ADMINS_INVITED auto-readies |
| 3 | Roles/archetypes assigned | EntityProfile job titles + the 13-archetype registry (Phase 1218) |
| 4 | Admin configures policy | ActionPolicy seed (Phase 1209); checklist step |
| 5 | Admin sees connector readiness | Connector Health + "How to connect" (Phases 1220/1244) |
| 6 | Employee opens ambient My Day | `/app` — calm shell, collapsed nav (Phase 1235) |
| 7 | My Day shows ranked intelligence | "What matters today" (Phase 1234; fixture ranker honest) |
| 8 | Voice-first interaction | Talk-to-Otzar dock; browser STT/TTS (Phase 1223) |
| 9 | Otzar goes quiet in meetings | Schedule a MeetingCapture window → auto quiet (Phase 1236) |
| 10 | Capture/ingest context | Meeting capture manual transcript OR Observe sample (Phases 1222/1227) |
| 11 | Internal + external participants identified | Launch Collaboration + MICE fixtures (Phase 1221) |
| 12 | Decisions + commitments extracted | DEMO_SCRIPTED extraction (Phase 1213 canonical fixture) |
| 13 | Owners assigned correctly | Roster-aware resolver; unresolved stays UNRESOLVED for human confirm |
| 14 | User approves actions | ProposedActionCard → Action Center (Phase 1208) |
| 15 | DMW authority checked | Authority grants + revocation gate (Phases 1228/1229) |
| 16 | COSMP memory permissions checked | COE assembleContext is the only memory path (ADR-0048) |
| 17 | Policy evaluates | ADR-0057 evaluator (AUTO_APPROVE low-risk internal) |
| 18 | Action executes | Executor cron → SUCCEEDED |
| 19 | Notification appears | Recipient unread note (Phase 1209 live-verified) |
| 20 | Reply loop works | Inline reply round-trip (Phase 1215) |
| 21 | Action Center updates | Status + audit timestamps |
| 22 | Workspace updates | Commitments by owner; they-owe-us/we-owe-them |
| 23 | Memory candidate governed | Dandelion welcome → consent → approve in Action Center (Phase 1237) |
| 24 | Compliance/audit evidence exists | ACTION_* chain per action (ADR-0002 tamper-evident) |
| 25 | Company creates regulator share package | Phase 1233 create (local/test DB today) |
| 26 | Regulator sees only scoped/redacted evidence | Phase 1233 evidence read (counts/types/timestamps only) |
| 27 | External collaborator sees only shared context | EXTERNAL_ALLOWED workspace scoping (Phase 1221) |
| 28 | No unapproved external write | No connector credentials = no external write path exists; enforcement matrix is the evidence |

Steps 10/22/23/25/26 run on the local/test DB today and flip to
production with the schema push. Everything else is PROD now.
