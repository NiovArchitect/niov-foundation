# Otzar — Client Handoff Readiness Matrix

**Last updated:** 2026-06-11 (Phase 1240 AI Employee boundaries landed)
**Maintained by:** Founder + automated PR updates
**Purpose:** One-page truth about what is production-ready vs.
demo-only vs. blocked-on-runtime-configuration for an enterprise
client handoff. Read this before claiming a feature is
"production-ready."

---

## Legend

| Marker | Meaning |
|---|---|
| **PROD** | Live in production. Real Foundation runtime + real backend + real authorized users. |
| **PROD-READY** | Substrate is complete + tested + merged. Becomes PROD on the next prod schema push. |
| **DEMO** | Working at the substrate tier with mock / manual / fixture inputs. Real provider integration requires OAuth keys + connector configuration. |
| **PARTIAL** | Some flows live, others mock. Specific gaps documented. |
| **BLOCKED** | Requires Founder-authorized destructive action (prod schema migration, OAuth provisioning, third-party contract) before going live. |
| **NOT_STARTED** | Bounded queue item not yet built. |

---

## Substrate readiness (Foundation backend)

| Surface | Status | Evidence | Gating to PROD |
|---|---|---|---|
| Entity + EntityProfile + EntityMembership | **PROD** | Hundreds of integration tests; substrate predates Phase 1215. | — |
| Notification + SafeNotificationView + reply mediator | **PROD** | Phase 1215 (PR #313) live; round-trip verified end-to-end. | — |
| Action runtime + 10-state lifecycle + auto-approve policy | **PROD** | ADR-0057; Phase 1209 / 1215 round-trips. | — |
| AuditEvent + SHA-256 chain + BEFORE DELETE trigger | **PROD** | ADR-0002 + ADR-0071 verify-chain (4-scope). | — |
| MemoryCapsule + 30-field schema | **PROD** | ADR-0033 Ecto mirror; pgvector embeddings live. | — |
| OtzarConversation + message lifecycle | **PROD** | Section 11D; conversation-detail / corrections live. | — |
| CollaborationWorkspace family (5 tables + 8 enums + 10 audit literals) | **PROD-READY** | Foundation PR #315 (merged); integration test #316 (4/4 green). | Push schema to production Supabase. |
| ExternalCollaborator family (3 tables + 7 audit literals) | **PROD-READY** | Same Foundation PR #315; service + 7 routes wired. | Push schema to production Supabase. |
| MeetingCapture family (2 tables + 6 audit literals) | **PROD-READY** | Foundation PR #317; integration test 3/3 green. | Push schema to production Supabase. |

---

## Bounded queue 1215–1232

| Phase | Subject | Status | Notes |
|---|---|---|---|
| 1215 | Reply-to-note round-trip mediator | **PROD** | Live; SafeNotificationView privacy preserved. |
| 1216 | People & Collaboration (Dandelion rename) + PeopleDirectory | **PROD** | Roster-aware UI live. |
| 1217 | My Organization view | **PROD** | Surveillance-language ban test-locked. |
| 1218 | 13 role archetypes (Wave 2.1) | **PROD** | Static metadata registry. |
| 1219 | My Digital Work Wallet (DMW rename for employees) | **PROD** | Internal jargon ban test-locked. |
| 1220 | Connector Health honest catalogue | **PROD** | 10 categories; admin overlay + 403 fallback. |
| 1221 | True Collaboration Workspace end-to-end (+ External Collaborator) | **PROD-READY** | Foundation #315/#316 + CT #64 merged; integration test 4/4. **Needs prod schema push.** |
| 1222 | Live meeting capture (Google Meet / Zoom / Teams / manual) | **DEMO** | Manual transcript upload exercises full pipeline. Real Google Meet / Zoom / Teams adapters deferred to 1224 / forward. |
| 1223 | Voice / STT end-to-end | **PROD-READY** (DEMO_FIXTURE + LOCAL_BROWSER paths always work; Whisper / Deepgram = BLOCKED_BY_KEY) | Foundation #320 merged; provider-adapter pattern lands 4 providers (DEMO_FIXTURE / LOCAL_BROWSER / WHISPER_API / DEEPGRAM); 2 NEW tables + 6 audit literals + 4 routes; integration test 7/7 green; **needs prod schema push to flip to PROD**. Whisper / Deepgram activate when `OPENAI_API_KEY` / `DEEPGRAM_API_KEY` are set. |
| 1224 | Google Workspace end-to-end | **BLOCKED_BY_CREDENTIAL** | OAuth credentials required (Google Cloud project + verified consent screen). |
| 1225 | Slack end-to-end | **BLOCKED_BY_CREDENTIAL** | OAuth app credentials required (Slack workspace install). |
| 1226 | Email end-to-end | **BLOCKED_BY_CREDENTIAL** | Gmail OAuth (reuses 1224) + Microsoft 365 OAuth + SMTP gateway. |
| 1227 | OCR / Observe end-to-end | **PROD-READY** (DEMO_FIXTURE + PLAIN_TEXT always work; TESSERACT_LOCAL = NEEDS_PROVIDER_INSTALL; AWS Textract / Google Vision = BLOCKED_BY_CREDENTIAL) | Governed Observe pipeline: capture → provider text extraction → Phase 1213 structured extraction (decisions / commitments / roster-aware suggested follow-ups) → workspace attach imports the ledger (UNRESOLVED commitments; human confirms owners). Suggested follow-ups are never auto-executed. 4 routes at /api/v1/otzar/observe/*; 1 NEW table + 3 enums + 5 audit literals; unit 9/9 + integration 8/8 green. CT half landed (otzar-control-tower #69 — 'Let Otzar read this' on the Observe page; observe suites 11/11; full CT suite 731/731); Otzar.app rebuilt with the new surfaces. **Needs prod schema push** for `observe_captures`. |
| 1228 | DMW backend substrate | **PROD-READY** | Foundation #321 merged; DMW Registry as unified read view over existing substrate (Entity + ConsentGrant + TeamDelegation + SwarmBoundary + ExternalCollaborator); 10 DMW types as closed-vocab projection (HUMAN/ENTERPRISE/AI_TWIN/etc.); 6 routes at /api/v1/dmw/*; integration test 7/7 green. **No prod schema migration needed** — uses existing substrate. |
| 1229 | COSMP backend substrate | **PROD-READY** | Foundation #322 merged; COSMP capsule list / revoke / audit surface; DMW revocation gate integration (`isCapsuleUsable` refuses revoked DMWs); 3 routes at /api/v1/cosmp/capsules/*; integration test 6/6 green. **No prod schema migration needed** — uses existing MemoryCapsule substrate. |
| 1230 | Production onboarding / admin readiness | **PROD-READY** | Foundation #323 merged; 11-step admin checklist + DEMO/PRODUCTION mode; auto-computed from existing substrate (ActionPolicy / OrgSettings / ConnectorBinding / STT providers); 3 routes at /api/v1/onboarding/*; integration test 4/4 green. **Needs prod schema push** for `OrgOnboardingState` table. |
| 1231 | Client handoff readiness matrix | **PROD** | This document. Auto-updated by future PRs. |
| 1232 | Circle / Base / USDC settlement | **NOT_STARTED** | Per Founder: LAST. Connector + governed approval required. |
| 1233 | Compliance share packages (regulator evidence sharing) | **PROD-READY** | `ComplianceSharePackage`: company-controlled, purpose-bound, time-boxed, revocable, REDACTED regulator evidence views over existing substrate; 4 routes at /api/v1/compliance/share-packages/*; 4 audit literals; unit 8/8 + integration 7/7 green. **Needs prod schema push** for `compliance_share_packages`. |
| 1240 | AI Employee boundaries + DMW formalization | **PROD** (no schema changes) | Foundation: provision (org admin) creates the ADR-0046 Enterprise AI Agent context — AI_AGENT + EXPLICIT ENTERPRISE wallet + org membership + APPROVAL_REQUIRED autonomy with a HUMAN approver; RULE 0 boundary set holds by construction (TAR ceiling 2, no admin caps, no external API — test-proven); DMW Registry projects AI_EMPLOYEE; deactivation = one-action kill switch (suspend + revoke all ACTIVE authority grants, audited); org-scoped with no existence oracle; personal twins never listed as AI Employees. 3 routes at /api/v1/otzar/ai-employees/*; 6 integration tests green. |
| 1239 | AI Twin collaboration protocol verification | **PROD** (verification phase; no code changes needed) | All 11 Founder requirements verified with existing evidence — same-org guard, project-membership blocks, policy-gated approval (sensitive → dual control), memory-tight by construction (only the 500-char safe_summary crosses Twins; zero MemoryCapsule/COE access in the protocol), audit via TWIN_COLLABORATION_* discriminators. Evidence: dmw-cosmp-enforcement-matrix.md §Phase 1239. 24+18+13 existing tests lock the behaviors. |
| 1237 | Dandelion org growth + voice-first onboarding (Foundation) | **PROD** (no schema changes) | Foundation: GET /api/v1/otzar/dandelion/org-growth (admin; governed recommendations from real substrate — unowned external relationships, overloaded commitment owners, disconnected teammates, onboarding gaps; display names only) + GET /api/v1/otzar/dandelion/onboarding (employee-scoped intros + consent note) + POST .../onboarding/memory-candidates (consent gate: Action(PROPOSED, RECORD_CAPSULE) via dual-control — NO capsule until the user approves; idempotent retries). 5 unit + 6 integration green. CT half landed (otzar-control-tower #72 — admin growth card on People & Collaboration + voice-first /app/welcome with consent-gated memory; dandelion suite 6/6; full CT suite 766/766); Otzar.app rebuilt with the new surfaces. |
| 1236 | Calendar-aware automatic quiet mode | **PROD** for the substrate-driven path (no schema changes); real Google/Microsoft calendar clients = BLOCKED_BY_CREDENTIAL | Foundation #333: GET /api/v1/otzar/calendar/context — meeting detection from the caller's own MeetingCapture scheduled windows (credential-free) + MOCK_CALENDAR_FIXTURE demo states; provider_mode flips to *_CONFIGURED when OAuth envs exist. CT #71: AmbientOtzarBar auto-quiets (stops listening, cancels speech, suppresses auto-speak) with 'Otzar went quiet for your meeting.' + Resume-voice session override; failing endpoint never breaks the shell. 7+5 Foundation tests; CT suite 759/759. |
| 1235 | Ambient employee shell (collapsed nav + role-gated admin entries + global copy sweep + quiet mode) | **PROD** (CT-only; no Foundation changes) | otzar-control-tower #70: 'More' nav collapsed by default (7 primary surfaces visible), adminOnly entries hidden from non-admins, global ambient-copy sweep locks raw internals + developer vocabulary out of all 19 employee pages, AmbientOtzarBar quiet mode (manual; auto via calendar lands with the calendar connector). Full CT suite 756/756. |
| 1234 | My Day intelligence (Python runtime first product consumer) | **PROD-READY** (fixture path always works; Python path activates when `PYTHON_INTELLIGENCE_RUNTIME_URL` is set + service deployed) | `GET /api/v1/otzar/my-day/intelligence`; SAFE caller-scoped signal pack → `rankEmployeeTwinNextActions`; honest provider_status; unit 6/6 + integration 6/6. **No schema migration needed.** CT half landed (otzar-control-tower #68 — 'What matters today' card on My Day; my-day suite 15/15; full CT suite 725/725); Otzar.app rebuilt with the new surface. |

---

## What blocks an enterprise client handoff

These are the items a real enterprise client needs before signing a contract. Without them, the handoff is a demo, not a deployment.

### 1. Production schema migration (Phase 1221 + Phase 1222 + Phase 1223 + Phase 1230) — **Founder-authorized destructive action**

The Phase 1221 / 1222 / 1223 / 1230 substrates add a total of **13 new tables** that are PROD-READY in code but not pushed to production Supabase:

| Phase | New tables |
|---|---|
| 1221 | `collaboration_workspaces`, `collaboration_memberships`, `collaboration_decisions`, `collaboration_commitments`, `collaboration_shared_context`, `external_collaborators`, `workspace_external_memberships`, `external_commitments` |
| 1222 | `meeting_captures`, `meeting_participant_consents` |
| 1223 | `audio_captures`, `transcript_segments` |
| 1230 | `org_onboarding_states` |
| 1233 | `compliance_share_packages` |
| 1227 | `observe_captures` |

Plus **32 new audit literals** (10 WORKSPACE_* + 7 EXTERNAL_* + 6 MEETING_CAPTURE_* + 6 AUDIO_CAPTURE_/STT_* + 3 ONBOARDING_*).

Founder runs:

```bash
# Set env to production
export DATABASE_URL="postgresql://postgres.<prod-host>...?pgbouncer=true"
export DIRECT_URL="postgresql://postgres.<prod-host>...:5432/postgres"

# Verify schema diff is additive only (no destructive changes)
cd packages/database
npx prisma migrate diff \
  --from-url $DATABASE_URL \
  --to-schema-datamodel prisma/schema.prisma \
  --script

# Apply
npx prisma db push --schema=prisma/schema.prisma --skip-generate
```

**Verification before push:** the diff MUST be additive only — 10 NEW tables + 17 NEW audit literals (no column drops, no enum value removals, no index changes on existing tables).

### 2. OAuth provisioning (Phases 1224 / 1225 / 1226)

Each external connector needs:
- An OAuth app registered with the provider (Google Cloud Console, Slack API portal, Zoom Marketplace).
- A verified consent screen + scope review (Google: app verification takes ~6 weeks for restricted scopes).
- Per-tenant client_id / client_secret stored in the per-tenant vault path per ADR-0089 (vault path `niov/tenants/{org_entity_id}/connectors/{connection_id}/secret`).
- Per-employee scoped grants via existing `ConnectorScopeGrant` substrate.

### 3. Real-time transports (Phase 1222 live + Phase 1223)

For live in-meeting capture (vs. post-meeting transcript ingest):
- Recall.ai bot (third-party SaaS, $40/meeting baseline) — fastest path.
- OR custom Daily.co + meeting platform SDK + STT provider — 6-8 weeks engineering.
- Voice / STT: see `docs/voice-first/voice-provider-recommendation-2026-06.md` (research-verified 2026-06-11): Deepgram streaming = first paid STT seat (adapter already merged; key-activated); ElevenLabs Flash v2.5 = first paid TTS seat; Sesame CSM-1B (fal.ai / self-hosted) = premium natural-conversation seat; OpenAI Realtime-2 = true barge-in speech-to-speech seat; AssemblyAI Universal-3 Pro = meeting diarization seat.

### 4. Compliance certifications (continuous)

- **SOC 2 Type II** — Otzar's substrate is SOC-2-ready architecturally (audit chain, RBAC, data segregation). Audit firm + ~6 months of evidence collection required for cert.
- **HIPAA** — substrate-compatible; BAA + DPA required per customer.
- **GDPR / SCC** — Foundation jurisdiction tagging (ADR-0037) supports per-region data residency.
- **FedRAMP** — Foundation deployment-target agnostic per ADR-0018. AWS GovCloud RDS for PostgreSQL is the canonical path; ATO process ~12-18 months.

---

## Demo-vs-prod capability matrix (by employee-facing feature)

| Capability | Demo path | Prod path | Gap |
|---|---|---|---|
| **Notes between teammates** | Real Foundation Notification + reply round-trip | Live | None |
| **Action Center lifecycle** | Real Action runtime; auto-approve LOW risk; cron executes | Live | None |
| **Collaboration workspaces** | Real `CollaborationWorkspace` on local test DB | Push schema to prod | 1 destructive Founder action |
| **External stakeholders tracking** | Real `ExternalCollaborator` on local test DB | Push schema to prod | 1 destructive Founder action |
| **Meeting capture (manual transcript)** | Real `MeetingCapture` on local test DB | Push schema to prod | 1 destructive Founder action |
| **Meeting capture (Google Meet auto-ingest)** | Manual transcript paste | OAuth Google Workspace + Drive API + post-meeting recording webhook | 1224 implementation + Google app verification |
| **Meeting capture (Zoom auto-ingest)** | Manual transcript paste | OAuth Zoom + Cloud Recording API webhook | Zoom Marketplace app review |
| **Talk to Otzar (voice in)** | Browser SpeechRecognition (varies by browser) | Deepgram streaming STT + WebRTC client | 1223 implementation |
| **Otzar talks back (voice out)** | Browser SpeechSynthesis | ElevenLabs / OpenAI TTS | 1223 implementation |
| **Slack notifications** | "Send to Slack" button creates draft Action only | OAuth Slack + Webhook + per-channel scope grant | 1225 implementation |
| **Email send** | Draft-only via existing Comms surface | OAuth Gmail (1224) or Microsoft Graph or SMTP gateway | 1226 implementation |
| **Jira ticket creation** | Draft-only | OAuth Atlassian + REST API | future phase |
| **OCR / document capture (Observe)** | Real governed Observe pipeline on local test DB (sample + pasted text → decisions/commitments/follow-ups → workspace attach) | Push schema to prod; real image OCR engines activate by provider swap (Tesseract install or AWS/Google credentials) | 1 destructive Founder action + provider activation |
| **DMW consent / scope management** | Underlying Foundation substrate live | Public CT consent UI + permission revocation flow | 1228 CT integration |
| **COSMP 7-op routing** | Live in Elixir/BEAM coordination layer | Public CT layer translating user actions → COSMP ops | 1229 CT integration |
| **Org onboarding (first-run)** | Manual operator seed | Wizard + admin invite + default ActionPolicy seeding | 1230 implementation |
| **Regulator evidence sharing** | Real `ComplianceSharePackage` on local test DB (create / list / revoke / scoped redacted evidence read) | Push schema to prod | 1 destructive Founder action |
| **Settlement (Circle / Base / USDC)** | None | Circle account + Base on-chain settlement + per-action approval gate | 1232 implementation (LAST) |

---

## "Walk me through it" — the canonical demo today

These flows work TODAY against the local test DB or PROD (where marked):

1. **Notes flow (PROD)** — Log in → My Day → write a follow-up to David → David receives Notification → David replies → Sadeil sees reply Action + Notification. Full audit chain.

2. **Workspace flow (PROD-READY local-only)** — Create "Launch Collaboration" workspace → add David / Samiksha / Annie → paste the Launch Follow-Up transcript → resolver assigns owners correctly → confirm each follow-up → 3 SEND_INTERNAL_NOTIFICATION Actions → each owner receives Notification.

3. **External stakeholder flow (PROD-READY local-only)** — Create "MICE Event Expansion" workspace with visibility EXTERNAL_ALLOWED → track Maria / Carlos from MICE Global → record their commitments via ExternalCommitment → no external messages sent → internal-reminder Actions created for the internal owner.

4. **Meeting capture flow (DEMO)** — Pick MANUAL_UPLOAD → paste a transcript → mark participant consent → attach to a workspace → decisions + commitments imported automatically → resolver assigns + confirm flows work.

---

## Maintenance

This document is the source of truth for "what's real." When a phase completes:

1. Update the row in the bounded queue table.
2. Update the "Demo-vs-prod" matrix where the capability changed.
3. Update the "Last updated" line.
4. Add a "Walk me through it" entry if a new canonical demo exists.

When a destructive Founder action ships (e.g., production schema push for Phase 1221 / 1222), update PROD-READY rows to **PROD**.
