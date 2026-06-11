# NIOV Foundation — Current Build State

**Status:** Tier 2 of the Foundation 5-tier docs hierarchy.
Lean master index by design. Tier 1 operational baton:
[`docs/NEXT_ACTION.md`](NEXT_ACTION.md). Tier 3 per-section
detail: [`docs/current-build-state/`](current-build-state/).
Tier 4 PR-specific build-log:
[`docs/build-log/`](build-log/). Tier 5 ADRs:
[`docs/architecture/decisions/`](architecture/decisions/).

**Last updated:** 2026-06-10
(**Otzar Phases 1221 + 1222 + 1223 + 1228 + 1229 + 1230 + 1231 +
1224/1225/1226/1227 connector substrate LANDED 2026-06-10** —
bounded Founder queue 1215–1232 substantially complete.

### Final close-out state (Founder closeout #2)

- **Phase 1221** True Collaboration Workspace + External
  Collaborator — DONE. PRs niov-foundation #315/#316/#318 +
  otzar-control-tower #64. Integration test 4/4 green.
- **Phase 1222** Provider-agnostic Meeting Capture — DONE.
  PRs niov-foundation #317 + otzar-control-tower #65.
  Integration test 3/3 green. Real Google Meet / Zoom / Teams
  auto-ingest BLOCKED_BY_CREDENTIAL.
- **Phase 1223** Voice/STT pipeline — DONE. PRs
  niov-foundation #320 + otzar-control-tower #67.
  Integration test 7/7 green. DEMO_FIXTURE + LOCAL_BROWSER
  paths always work; WHISPER_API + DEEPGRAM
  BLOCKED_BY_CREDENTIAL.
- **Phase 1228** DMW Registry — DONE. PR niov-foundation
  #321. 10 DMW types as closed-vocab projection over existing
  EntityType + ExternalRelationshipType + WalletType.
  Integration test 7/7 green. **No schema migration needed.**
- **Phase 1229** COSMP Capsule management — DONE. PR
  niov-foundation #322. List / revoke / audit + DMW revocation
  gate. Integration test 6/6 green. **No schema migration
  needed.**
- **Phase 1230** Production onboarding / admin readiness —
  DONE. PRs niov-foundation #323 + otzar-control-tower #66.
  11-step admin checklist + DEMO/PRODUCTION mode toggle.
  Integration test 4/4 green.
- **Phase 1231** Client handoff readiness matrix — DONE +
  updated for all new substrate. PRs niov-foundation #318 +
  #324.
- **Phases 1224/1225/1226/1227** connector adapter substrate
  — DONE. PR niov-foundation #325. Provider-adapter registry
  declares GOOGLE_WORKSPACE / SLACK / MICROSOFT_365 / ZOOM /
  JIRA / GITHUB / LINEAR / SMTP_EMAIL / 3 OCR providers with
  required envs + OAuth scopes + status reporting. Real OAuth
  + send paths BLOCKED_BY_CREDENTIAL + BLOCKED_BY_APP_REVIEW
  per provider. Unit test 6/6 green.
- **Phase 1232** Circle / Base / USDC — per Founder directive,
  remains LAST. NOT_STARTED.
- **Phase 1233** Compliance share packages (company-controlled
  regulator sharing) — DONE. `ComplianceSharePackage` substrate:
  purpose-bound, time-boxed (max 365 days), revocable grants
  through which a REGULATOR entity reads REDACTED evidence
  (audit summary / action compliance / memory lineage /
  connector access / onboarding readiness — counts + event
  types + outcomes + timestamps ONLY; never `details` JSON,
  capsule payloads, or connector config). 4 routes at
  `/api/v1/compliance/share-packages/*`; 4 new append-only
  audit literals (COMPLIANCE_SHARE_PACKAGE_CREATED / _ACCESSED
  / _REVOKED / _EXPIRED); lapsed packages flip to EXPIRED on
  first touch. Unit test 8/8 + integration test 7/7 green.
  **Needs prod schema push** for `compliance_share_packages`.

### Production schema push status

Phases 1221 + 1222 + 1223 + 1230 add **13 new Prisma tables**:

- 1221 (8): `collaboration_workspaces`,
  `collaboration_memberships`, `collaboration_decisions`,
  `collaboration_commitments`, `collaboration_shared_context`,
  `external_collaborators`, `workspace_external_memberships`,
  `external_commitments`.
- 1222 (2): `meeting_captures`,
  `meeting_participant_consents`.
- 1223 (2): `audio_captures`, `transcript_segments`.
- 1230 (1): `org_onboarding_states`.
- 1233 (1): `compliance_share_packages` (+ 3 enums:
  `SharePackageStatus`, `SharePackageScope`,
  `SharePackageRedactionProfile`).

Plus **35 new append-only audit literals** (10 WORKSPACE_* + 7
EXTERNAL_* + 6 MEETING_CAPTURE_* + 6 AUDIO_CAPTURE_/STT_* + 3
ONBOARDING_* + 3 from Phase 1221 + Phase 1230). All additive per
ADR-0042 §Q-γ.1 — no ADR-0002 amendment required.

Local test DB carries the full schema; integration tier proves
the substrate (32/32 across 6 phases + 6 unit tests for the
connector adapter registry + 9 unit tests for the resolver +
720+ CT tests). Production Supabase still on the pre-1221
schema; **PROD-READY flip requires explicit Founder `APPROVE
PROD SCHEMA PUSH` authorization**.

Phases 1228 + 1229 use existing substrate — no migration needed.

### Otzar.app build state

Last rebundle 2026-06-10 16:27:36 (Phase 1221 + 1222 surfaces).
**Final rebuild pending after CT PRs #66 + #67 merge.**

(**Earlier context — Phase 1221 PLAN LANDED 2026-06-10**)

### Current state truth (per Founder closeout directive)

- **Phase 1221 True Collaboration Workspace** — DONE locally + in
  the app's UI. Production schema push to Supabase is **PENDING
  Founder explicit `APPROVE PROD SCHEMA PUSH` authorization**. PRs
  niov-foundation #315 + #316 + otzar-control-tower #64 all merged.
  Integration test 4/4 green; resolver unit tests 9/9 green; CT
  test suite 720/720 green.
- **Phase 1222 Live Meeting Capture** — Provider-agnostic substrate
  DONE (Google Meet / Zoom / Microsoft Teams / MANUAL_UPLOAD /
  API_INGEST). Real live Google Meet + Zoom + Teams auto-ingest
  remains **BLOCKED by connector credentials + provider app
  approvals** (Google Cloud Console verification ~6 weeks for
  restricted scopes; Zoom Marketplace review; Microsoft 365 OAuth
  app). PRs niov-foundation #317 + otzar-control-tower #65 merged;
  integration test 3/3 green.
- **Phase 1231 Client Handoff Readiness Matrix** — DONE
  (`docs/operations/client-handoff-readiness-matrix.md` is the
  authoritative source). PR niov-foundation #318 merged.
- **Phases 1223 / 1228 / 1229 / 1230** — IN FLIGHT per Founder
  directive (continue autonomously past OAuth blockers). Phase
  1223 builds a STT provider-adapter interface + demo/sample
  mode; Phase 1228 builds the full DMW registry backend; Phase
  1229 builds the full COSMP capsule backend; Phase 1230 builds
  the production onboarding wizard.
- **Phases 1224 / 1225 / 1226** — **BLOCKED_BY_CREDENTIAL** —
  provider-adapter substrate ships with mock/dev paths; real
  OAuth wiring waits for credential provisioning.
- **Phase 1227 OCR / Observe** — substrate ships with manual
  upload path; real OCR provider selection (Tesseract.js / AWS
  Textract / Google Vision) deferred.
- **Phase 1232 Circle / Base / USDC** — per Founder directive,
  remains LAST.

### Otzar.app build state

Last rebundle 2026-06-10 16:27:36 (after Phase 1221 + 1222
merges). All surfaces verified in shipped JS: "Collaboration
Workspaces", "External stakeholders", "Commitments by owner",
"They owe us"/"We owe them", "Meeting captures", "Capture a
meeting", participant consent UI, `BLOCKED_PARTICIPANT_CONSENT`
status. 14× `collaboration-workspaces` route refs + 10×
`meeting-captures` route refs.

### Production schema push status

Phase 1221 + 1222 add 10 NEW Prisma tables to schema.prisma:

- `collaboration_workspaces`
- `collaboration_memberships`
- `collaboration_decisions`
- `collaboration_commitments`
- `collaboration_shared_context`
- `external_collaborators`
- `workspace_external_memberships`
- `external_commitments`
- `meeting_captures`
- `meeting_participant_consents`

Plus 23 NEW append-only `AUDIT_EVENT_TYPE_VALUES` literals (10
WORKSPACE_* + 7 EXTERNAL_* + 6 MEETING_CAPTURE_*). All additive
per ADR-0042 §Q-γ.1 (no ADR-0002 amendment required). Local test
DB at localhost:5433/foundation_test carries the full schema and
proves the substrate at integration tier (4/4 + 3/3 + 9/9 +
720/720 green). Production Supabase still on the pre-1221 schema;
PROD-READY flip requires explicit Founder `APPROVE PROD SCHEMA
PUSH` authorization.

(**Earlier last-updated context — Phase 1221 PLAN LANDED
2026-06-10** — True Collaboration Workspace end-to-end. Founder-
issued addendum required a written audit + plan in this document
BEFORE implementation.

### Existing collaboration substrate (audited 2026-06-10)
- **`TwinCollaborationRequest`** (`schema.prisma:2390`) — single-shot
  request between two parties (REQUESTED → APPROVED/REJECTED/etc.).
  10 closed-vocab `TwinCollaborationRequestType` values. NOT a
  persistent shared workspace. EDX-6 inbox surfaces it.
- **`WorkProject`** + **`WorkProjectMember`** (`schema.prisma:2463`/
  `:2479`) — EDX project substrate. `WorkProjectMemberRole` is a
  CLOSED enum `OWNER | MEMBER | REVIEWER`. NO free-text role label,
  NO responsibility summary, NO visibility, NO source_type, NO
  attached-conversation column.
- **`OrgCollaborationPolicy`** (`schema.prisma:2543`) — per-org
  policy gate for cross-org collaboration; useful as the
  external-collaborator gate.
- **`OtzarConversation`** (`:1525`) — conversation session model.
- **`MemoryCapsule.conversation_id`** (`:170`) — nullable linkage
  precedent per ADR-0055.
- **`Action`** (`:1768`) — ADR-0057 substrate.
  `SEND_INTERNAL_NOTIFICATION` proven live (Phases 1209 / 1215).
- **`Notification`** (`:1311`) + `SafeNotificationView`.
- **`AuditEvent`** (`:318`) + closed-vocab `AUDIT_EVENT_TYPE_VALUES`.
  Additive literals allowed without ADR-0002 amendment per ADR-0050
  precedent.

### Existing APIs (Foundation)
- `otzar-collaboration.routes.ts` — `TwinCollaborationRequest`
  routes (create/list/transition).
- `otzar-work-project.routes.ts` — WorkProject routes
  (create/list/archive/member-add/list).
- `org-collaboration-policy.routes.ts` — policy read/upsert.
- `otzar.routes.ts` — `POST /otzar/comms/extract`,
  `POST /otzar/conversation/start|message|close`.
- `notification.routes.ts` — list / mark-read / reply.
- `actions.routes.ts` — list / create / get.

### Existing UI pages (Otzar Control Tower / employee shell)
- `src/pages/app/Collaboration.tsx` (Phase 1216) — PeopleDirectory
  + `TwinCollaborationRequest` inbox.
- `src/pages/app/ActionCenter.tsx` — Action lifecycle list.
- `src/components/otzar/NotificationBell.tsx` — Notification
  dropdown with reply.
- `src/components/otzar/PeopleDirectory.tsx` (Phase 1216).
- `src/pages/app/Comms.tsx` — comms-extract demo surface.

### What can be reused (NO new substrate)
- `AuditEvent` (Founder explicit: "If existing audit_events can
  cover this, use existing audit_events instead").
- `Action` + `SEND_INTERNAL_NOTIFICATION` + executor + auto-approve
  for `confirm commitment → action`.
- `Notification` + `SafeNotificationView` for owner-side delivery.
- `OtzarConversation.conversation_id` for `source_conversation_id`.
- `comms-extract.service.ts` DEMO_SCRIPTED fixture
  (`buildDemoExtraction`) — matches Founder's Launch Follow-Up
  Meeting fixture VERBATIM: 2 decisions + 3 commitments + 3
  suggested `SEND_INTERNAL_NOTIFICATION` actions resolved
  HIGH/RESOLVED against the roster when David / Samiksha / Annie
  exist.
- `OrgCollaborationPolicy` + `OrgSettings` as the
  external-collaborator policy gate.
- `IdentityContext.org_roster` for member candidate lookup.
- Patterns from `twin-collaboration.service.ts` (audit + same-org
  guard + auth) as the canonical template for the new service.

### What is missing (must be added — additive only)
- A PERSISTENT shared workspace concept distinct from one-shot
  `TwinCollaborationRequest` and from fixed-enum-role `WorkProject`.
- Free-text `role_label` + `responsibility_summary` per member.
- `member_type INTERNAL | EXTERNAL` + `access_level VIEW | COMMENT |
  CONTRIBUTE | APPROVE`.
- `visibility INTERNAL_ONLY | EXTERNAL_ALLOWED`.
- Persistent `CollaborationDecision` + `CollaborationCommitment`
  rows attached to a workspace so a workspace shows decisions /
  commitments without re-running extraction each time.
- `CollaborationSharedContext` row per share to record what's
  shared and sensitivity.
- `CollaborationCommitment.assignment_reason` + `confidence` +
  `resolution_status` + `related_action_id` + 5-state status
  `PROPOSED | CONFIRMED | ACTION_CREATED | COMPLETED | BLOCKED`.
- ~10 additive audit literals (`WORKSPACE_CREATED`,
  `WORKSPACE_MEMBER_ADDED`, `WORKSPACE_MEMBER_REVOKED`,
  `WORKSPACE_CONTEXT_SHARED`, `WORKSPACE_DECISION_ADDED`,
  `WORKSPACE_COMMITMENT_ADDED`, `WORKSPACE_COMMITMENT_CONFIRMED`,
  `WORKSPACE_ACTION_LINKED`, `WORKSPACE_PERMISSION_BLOCKED`,
  `WORKSPACE_ARCHIVED`).

### Backend changes required? YES
CT-only is NOT sufficient. A persistent shared workspace cannot be
faked client-side without leaking governance to the client. Backend
substrate is required for durability, audit, permission gates,
action linkage, and cross-member visibility.

### Phase 1221 implementation plan (exact)
1. **Schema** — 5 new models (`CollaborationWorkspace`,
   `CollaborationMembership`, `CollaborationDecision`,
   `CollaborationCommitment`, `CollaborationSharedContext`).
   Migrate via `scripts/prisma-db-push-test.sh` per ADR-0025. NO
   new `CapsuleType`. NO new `ActionType`. NO
   `CollaborationAuditEvent` table — reuse `AuditEvent`.
2. **Audit literals** — 10 additive literals to
   `AUDIT_EVENT_TYPE_VALUES` in
   `packages/database/src/queries/audit.ts`.
3. **Assignment resolver** —
   `apps/api/src/services/otzar/collaboration-assignment-resolver.ts`
   (pure function) implementing the 8-priority cascade
   (EXPLICIT_AGREEMENT → EXPLICIT_ASK → ROLE_RESPONSIBILITY →
   ROLE_ARCHETYPE → PROJECT_MEMBERSHIP → UNKNOWN → AMBIGUOUS →
   RESTRICTED) with explicit `assignment_reason` prose and
   confidence + resolution_status fields. NO fuzzy match, NO LLM
   disambiguation, NO entity-id fabrication.
4. **Services** — `collaboration-workspace.service.ts` with
   `*ForCaller` exports per ADR-0004: create / list / detail /
   addMember / attachConversation / importCommsOutput /
   confirmCommitment / listActions.
5. **Routes** — 8 additive routes under
   `otzar-collaboration-workspace.routes.ts` matching the
   Founder's spec verbatim.
6. **Backend tests** — 12 integration tests covering all 12
   Founder assertions.
7. **CT types + api client** — `api.collaborationWorkspaces.*`
   namespace + types in `src/lib/types/foundation.ts`.
8. **CT UI** — `CollaborationWorkspaces.tsx` (list + create) and
   `CollaborationWorkspaceDetail.tsx` (Overview / People /
   Decisions / Commitments / Follow-ups / Shared context /
   Audit). Plain-language only; no DMW / COSMP / payload /
   binding / adapter strings.
9. **CT tests** — 16 vitest tests covering the Founder's list.
10. **Live probe** — rebuild Otzar.app, log in as Sadeil, walk
    the full Launch Collaboration scenario, verify all 19
    acceptance criteria.

### Remains partial after Phase 1221
- Live meeting capture transport (Google Meet / Zoom hosts; needs
  connector OAuth) — Phase 1222.
- Voice / STT real-time pipeline — Phase 1223.
- External writes (Slack / email / Jira) — Phases 1225 / 1226 /
  later.
- AI Twin auto-confirming commitments (Twin in this phase READS
  workspace context; confirmation remains human-approved).
- Cross-workspace memory propagation.
- Workspace-scoped DMW / COSMP substrate amendments — Phases
  1228 / 1229.
- Workspace billing / seat metering — Phase 1230 / 1231.

### Invariants preserved
- RULE 0 — sovereignty preserved; AI Twin reads only within
  scope; external members default-deny.
- RULE 1 — additive only; no deletion / restructuring of
  existing collaboration / project substrates.
- RULE 4 — audit emit BEFORE service returns success.
- RULE 9 — service-owned `*ForCaller` gate per ADR-0004.
- RULE 10 — soft-delete via `deleted_at` on all 5 new tables.
- RULE 13 — drift surfaced inline (existing substrate enumerated
  + decision rationale documented above).
- RULE 16 — no `console.*` in `apps/api/src`.
- RULE 20 — no CLAUDE.md or ADR modifications; the audit-literal
  additions follow the ADR-0050 / Sub-box-3 / ADR-0042 §Q-γ.1
  append-only precedent (additive literal class — no ADR
  amendment required).

Earlier last-updated context:
**Otzar Phase 1215–1220 LANDED 2026-06-10** — bounded
employee-shell readiness slice (snapshot PR #314).
**ADR-0071 IMPLEMENTATION LANDED 2026-05-31** — PR #132
`ffc0548` ships Section 7 cross-scope audit `verify-chain`
per ADR-0071 with **Option A clean break** Founder QLOCK
(consumer-mapping evidence confirmed zero external HTTP
consumers + only the route's own integration test consumed
the prior `valid` / `total_events` / `broken_at` fields +
aliases would have been semantically misleading). `GET
/api/v1/audit/verify-chain` extended from self-only to the
canonical 4-scope matrix (`self` / `org` / `platform` /
`regulator`). NEW canonical response: `verified` /
`checked_event_count` / `chain_algorithm` (`"SHA-256/14-field-
canonical-record"`) / `window_start/end` / `first_event_id`
+ `first_event_hash` / `last_event_id` + `last_event_hash` /
`broken_at_event_id` / `failure_reason` closed-vocab /
`lawful_basis_id` / `evidence_note` / `honest_note`. Old
field aliases NOT emitted. Internal Prisma primitive
`verifyAuditChain(entity_id)` backward-compat preserved
(camelCase fields stay; window-aware variant additive only).
`VERIFY_CHAIN_MAX_EVENTS = 10_000` perf cap mirroring
`EXPORT_AUDIT_EVENTS_MAX_ROWS` precedent. Default 30-day
window for org/platform; regulator window bounded by
LawfulBasis `valid_from`→`valid_until`. ADR-0036 9-condition
LawfulBasis enforcement reused verbatim via
`getActiveLawfulBasisForRegulator`. Regulator-scope
continuity verification reads prior row's `event_hash` only
(one column) without surfacing data fields per ADR-0071
§7.3. ZERO new audit literal — extended
`AUDIT_VIEW_VERIFY_CHAIN` meta. ZERO schema migration.
20 new integration tests + 77 audit-viewer regression + 40
audit unit + 32 verify-chain-primitive-consumer regression
all green. Closes ADR-0070 §Forward queue item 1 at the
canonical-execution register. Earlier last-updated context:
**Otzar Wave 3 IMPLEMENTATION LANDED 2026-05-31** — PR #127
`8474863` ships scoped Twin proactivity per ADR-0068: NEW
optional `proactive_cards?[]` sidecar on `MyTwinView`
projected via a NEW pure-function
`assembleProactiveCards` helper in NEW
`apps/api/src/services/otzar/proactivity.service.ts` from
existing self-scoped substrate (Wave 5 PROPOSED/ACCEPTED
readers + NEW Wave 4A `computeStaleContextLabelForEntity`
pure helper + NEW Wave 4C `computeDriftRollupLabelForEntity`
pure helper + ACCEPTED `reviewed_at` periodic check-in). 5
closed-vocab card_types live: ACCEPTED_PATTERN_REMINDER +
PROPOSED_PATTERN_REVIEW_AVAILABLE +
STALE_CONTEXT_REFRESH_SUGGESTED + DRIFT_REVIEW_SUGGESTED +
ALIGNMENT_CHECK_IN. Cap 4 cards per response. Deterministic
SHA-256 16-char `card_key` for client-side dismiss (hashes
only SAFE components). `?include_proactive_cards=false`
opt-out on `GET /api/v1/otzar/my-twin`. **ZERO** schema
migration. **ZERO** new audit literal. **ZERO**
`NotificationService` integration. **ZERO** Action /
`OtzarProposedPattern` / `MemoryCapsule` / `OtzarConversation`
mutation. **ZERO** `conductSession` / `assembleContext`
touch. **ZERO** LLM-generated text. **ZERO** manager
visibility. **ZERO** external delivery. 18 integration tests
+ 90/90 Wave 5/6A/6B/4A/4C regression preserved. RULE 13 +
RULE 18 substrate-honest correction surfaced inline:
existing Wave 4A/4C analyze* + Wave 5 list() emit audit +
re-validate session, so Wave 3 cannot consume them from
inside getMyTwin without violating ADR-0068 §11 "ZERO new
audit row" — resolved via 3 NEW additive pure helpers that
share the derivation logic verbatim. RULE 1 additive-only;
existing routes preserved unchanged. Earlier last-updated
context: **Section 1 Wave 6B IMPLEMENTATION LANDED 2026-05-31** —
PR #124 `625ddbf` ships the symbiotic priming hook into
`COE.assembleContext` per ADR-0067: NEW optional
`alignment_patterns?` sidecar on `AssembleContextSuccess` +
NEW optional `include_alignment_patterns?: boolean` opt-out
on `POST /api/v1/coe/context` body + NEW labeled
`L_ALIGNMENT` prompt section in `conductSession` 8-layer
assembly. Sidecar-field design lock (Option d); reuses
Wave 6A `AcceptedPatternAdvisoryView` projection verbatim;
ZERO score-boost (ADR-0022 frozen anchor preserved); ZERO
capsule pipeline mutation (counters identical with/without
sidecar); ZERO new audit literal; ZERO schema migration; 14
integration tests. **Active-pattern-consumption is now
FULLY LIVE** (Wave 6A visibility + Wave 6B influence;
symbiotic alignment loop closed). Earlier last-updated
context: **Section 1 Wave 6A LANDED 2026-05-30** — PR #121
`6b84a99`
ships the symbiotic advisory surface on `GET /api/v1/otzar/
my-twin` (NEW `accepted_patterns[]` field projecting the
caller's OWN ACCEPTED OtzarProposedPattern rows as visible
alignment guidance). Symbiotic framing per Founder Wave 6A
clarification: the user teaches the Twin through review-and-
acceptance; the Twin reflects accepted patterns back as
visible alignment memory — NOT correction logging, NOT
employee coaching, NOT compliance reminders, NOT
surveillance. NO assembleContext touch (Wave 6B forward-
substrate). NO new audit literal. NO schema migration. 15
integration tests. Earlier last-updated context: **Section 6
Wave 7 LANDED 2026-05-30** — PR #119 `2b83116`
ships NEW `POST /api/v1/analytics/compliance-posture` +
`getCompliancePostureForOrg` AnalyticsService method + 20
integration tests per ADR-0061 §8 forward queue. Org-level
metadata-only compliance posture (NOT legal advice; NOT
certification; NOT employee compliance scoring); 5-label
closed-vocab (HEALTHY / WATCH / DEGRADED / NOT_CONFIGURED /
INSUFFICIENT_POPULATION); ADMIN_ACTION:ANALYTICS_READ audit
(ZERO new audit literal). 6 live aggregates total. Earlier
last-updated context: **Section 6 Wave 6 LANDED 2026-05-30**
— PR #117 `2c4336a` ships NEW
`POST /api/v1/analytics/action-runtime-by-action-type`
+ `getActionRuntimeByActionTypeForOrg` AnalyticsService method
+ 16 integration tests per ADR-0061 §8 forward queue. Per-
ActionType breakdown of action-runtime health; envelope-tier k=5
+ per-row ACTION_RUNTIME_MIN_VOLUME=10 redaction; ADMIN_ACTION:
ANALYTICS_READ audit (ZERO new audit literal). 5 live aggregates
total (v1 4 + Wave 6). Earlier last-updated context:
**Section 1 Wave 5 IMPLEMENTATION LANDED 2026-05-30** —
PR #114 `7661ba9` ships NEW `OtzarProposedPattern` Prisma model
+ 4 self-scoped review routes + `OtzarProposedPatternService` +
36 integration tests per ADR-0066 §3-§7. Auto-write =
AUTO-PROPOSE, NOT auto-commit; owner-first self-scope; ZERO new
audit literal (ADMIN_ACTION + 5-discriminator pattern); existing
org-scoped `IntelligencePattern` preserved unchanged per RULE 1
+ verified untouched across full test cycle; schema migration
via npm run db:push:test per ADR-0025. Earlier last-updated
context: **ADR-0066 LANDED design-only** —
`OtzarProposedPattern` review-gated proposal lifecycle for
recurring drift themes. Closes ADR-0058 §"Forward queue"
item 1 at the design register. NEW Prisma model proposed
(separate from existing org-scoped `IntelligencePattern`
which stays unchanged per RULE 1); 14 fields + 4 closed-vocab
discriminators + 4-route self-scoped review surface +
ADMIN_ACTION + 5-discriminator audit (no new audit literal).
All 12 v1 design questions resolved at ADR; implementation
slice forward-substrate behind separate Founder
authorization per RULE 20 + ADR-0066 §11. **Section 5 Wave
4 LANDED earlier 2026-05-30 — Agent Playground persistent
named scenarios** per ADR-0065 §7. PR #111 ships
`PlaygroundScenario` Prisma model + 5 owner-first CRUD routes
+ `PlaygroundScenarioService` + 38 integration tests. SAFE
persistence layer for future Waves 5-8; zero execution / LLM
/ multi-agent / external provider / Action creation / side
effects. ADMIN_ACTION + details.action discriminator audit;
no new audit literal; soft-archive per RULE 10. Schema
migration via npm run db:push:test per ADR-0025. Earlier
last-updated context preserved below for chronology. Plus
**Section 6 PRODUCTION-GRADE COMPLETE for Foundation backend
scope (v1).** 4-aggregate arc closure on top of ADR-0061
Wave 1 design: CORRECTION velocity 7d (PR #103) +
action-runtime success rate (PR #104) + connector activity
(PR #105) + hive participation (PR #106). All 4 aggregates
SAFE-projected; same-org sovereignty enforced by construction;
k=5 HIPAA Safe Harbor floor universal; can_admin_org gate
universal; ADMIN_ACTION + ANALYTICS_READ audit universal; no
new audit literal across any wave; zero schema migration;
zero new external dependencies; 55 integration tests across
4 test files. Foundation-strategic-context coherent (generic
Entity model + no blockchain/payment surface + no surveillance
framing). Plus Section 5 Waves 1+2+3 LIVE (inspector
foundation + product-vision ADR-0065). Section 3
PRODUCTION-GRADE COMPLETE for v1 same-org Foundation backend
scope.

Earlier last-updated context: Section 5 Wave 2 LANDED — Agent
Playground v1 implementation per ADR-0060 + Founder Wave 2
authorization.
**Important framing**: this is the **first backend substrate /
inspector foundation** for the long-term Agent Playground
product vision (enterprise simulation + multi-agent scenario
exploration + outcome comparison + best-path recommender +
governed transition from simulation to Action runtime;
DGI-style enterprise domain) — NOT the full product. 3
sandbox-only operator inspector routes shipped: policy-
evaluator tester via pure `evaluateActionPolicy`; connector
dry-run hard-wired to `FixtureBasedConnectorProvider`
(production providers unreachable by construction);
working-set inspector via `COE.assembleContext` with SAFE
projection stripping raw `content`. PlaygroundService class
+ 17 integration tests + barrel exports + server.ts wiring.
Zero side effects: no Action/ActionAttempt/Notification/
OtzarConversation/MemoryCapsule/ConnectorBinding row creation.
Zero new audit literals; zero schema migration; zero new
external dependencies. Wave 3 Control Tower frontend consumer
+ Wave 4+ multi-agent simulation engine + persistent scenario
memory + outcome comparison + best-path recommender + real-
provider dry-run all forward-substrate. ADR-0060 broadening
(or new product-vision ADR) recommended before Wave 3+. Plus
Section 3 PRODUCTION-GRADE COMPLETE for v1 same-org Foundation
backend scope from earlier today.).

## Current state

- **Latest main HEAD:** `4ede29f` (PR #251 Workflow stage 3+ B5-α + B6-α LIVE 2026-06-03). **CT main HEAD:** `de77cdf` (CT PR #32 INVOKE_CONNECTOR CT surface LIVE 2026-06-02). **LEI sequence COMPLETE end-to-end** at the substantive runtime register + **BILLING-WIRING ROUND COMPLETE** (PRs #244-#251; 8 substantive PRs across one overnight session closing 7 of 11 Founder-named billing-tier targets — Connector adapter invocation gate+meter (#244/#245) + Twin creation gate+meter (#246) + Audit export volume meter (#247) + Regulator evidence packages meter (#248) + Dandelion enterprise activation gate+meter (#249) + Dandelion team+business activation gate+meter (#250) + Workflow stage 3+ gate+meter (#251)). NEW pure helper `assertEntitledForOrgSoftGate` at `apps/api/src/services/billing/entitlement-check.service.ts` (soft-gate posture so pre-billing orgs unaffected — `NO_ENTITLEMENT_ROW_BACKWARD_COMPAT` reason; row exists → normal `evaluateEntitlement`). All billing-wiring rides existing `ENTITLEMENT_CHECK_DENIED` + `USAGE_METER_RECORDED` — NO NEW AUDIT LITERAL across this round. 1678/1678 unit tier passing (+22 from billing-wiring round start; was 1656). **ADR-0092 §4 ALL 3 CANDIDATES LIVE end-to-end** (Consent+Receipt + Scoped Voice Memory Gate + AI Teammate Delegation Frame). Section 6 AnalyticsService: 8 LIVE aggregates.
- **Latest merged PR:** [#251](https://github.com/NiovArchitect/niov-foundation/pull/251) — Wire B5-α + B6-α at workflow create — closes "workflow stage 3+" target (soft-gate when `actions.length >= 3`; meter delta = `max(1, actions.length)`).
- **Active branch / PR:** `foundation-closeout-billing-wiring-round` — docs-only closeout consolidating the 8-PR billing-wiring round (PRs #244-#251).
- **Section 1 status:** PRODUCTION-GRADE COMPLETE for v1 Foundation drift-detection backend scope. Section 6 PRODUCTION-GRADE COMPLETE earlier 2026-05-30. Section 3 PRODUCTION-GRADE COMPLETE earlier 2026-05-30. **Section 5 PARTIAL with Waves 1+2+3+4+5+6+7+8 LIVE 2026-05-31** (Wave 7 ADR-0074 + Option A LIVE; Wave 8 ADR-0075 + Option A LIVE — Wave 8 is the FIRST Section 5 wave that creates Section 2 Action rows via `createActionForCaller` per ADR-0057; Wave 9 contract ADR-0076 design-only forward-queued; 209 Section 5 integration tests passing; Section 2 retains all execution authority). — Wave 4 persistence (PR #111) + Wave 5 contract ADR-0072 + Option A `POST /scenarios/:id/candidates` (PR #136 `e708fa7`) + Wave 6 contract ADR-0073 + Option A `POST /scenarios/:id/outcome-comparisons` (PR #139 `02410ee`) + Wave 7 contract ADR-0074 + Option A `POST /scenarios/:id/best-path-recommendations` (PR #142 `80a60f1`); Wave 5/6/7 Option B Python (ADR-0069 §2.4 boundary ADR required) + Option C BEAM + Waves 8/9/10 forward-substrate per Founder autonomy directive.
- **TypeScript baseline:** exactly 4 canonical residual errors per ADR-0015 Decision B Amendment 1.
- **Live `ACTION_*` audit emitters:** 10 of 10 (canonical ADR-0057 §10 vocabulary fully wired).
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION per Wave 11 internal-only handler).
- **Cancel surface:** non-RUNNING (any source caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050) + process-local AbortController plumbing for mid-attempt interruption.
- **Read surface:** create + cancel + GET viewer + GET list + GET attempt detail — Action Inbox / Detail / Attempt drilldown complete.
- **Repo posture:** PUBLIC. Branch protection on `main`: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot security updates enabled. `required_approving_review_count = 0` (solo-developer pragmatic).

## 10 production section status

| # | Section | Status | Detail |
|---|---|---|---|
| 1 | Employee Intelligence Core | **PRODUCTION-GRADE COMPLETE for v1 Foundation drift-detection + Wave 5 review-gated proposed-pattern + Wave 6A symbiotic advisory surface + Wave 6B priming hook + Wave 3 scoped Twin proactivity 2026-05-31** — **Otzar Wave 3 IMPLEMENTATION LANDED PR #127 `8474863`** per ADR-0068 ships scoped Twin proactivity: NEW optional `proactive_cards?[]` sidecar on `MyTwinView` projected via NEW pure-function `assembleProactiveCards` helper at NEW `apps/api/src/services/otzar/proactivity.service.ts`; derived from existing self-scoped substrate (Wave 5 PROPOSED/ACCEPTED readers + NEW Wave 4A `computeStaleContextLabelForEntity` pure helper + NEW Wave 4C `computeDriftRollupLabelForEntity` pure helper + ACCEPTED `reviewed_at` periodic check-in). 5 closed-vocab card_types: `ACCEPTED_PATTERN_REMINDER` + `PROPOSED_PATTERN_REVIEW_AVAILABLE` + `STALE_CONTEXT_REFRESH_SUGGESTED` + `DRIFT_REVIEW_SUGGESTED` + `ALIGNMENT_CHECK_IN`. Cap 4 cards per response. Deterministic SHA-256 16-char `card_key` (hashes only SAFE components). `?include_proactive_cards=false` opt-out on `GET /api/v1/otzar/my-twin`. ZERO schema migration; ZERO new audit literal; ZERO `NotificationService` integration; ZERO Action / `OtzarProposedPattern` / `MemoryCapsule` / `OtzarConversation` mutation; ZERO `conductSession` / `assembleContext` touch; ZERO LLM-generated text; ZERO manager visibility; ZERO external delivery; 18 integration tests + 90/90 Wave 5/6A/6B/4A/4C regression preserved. RULE 13/18 correction surfaced inline: Wave 4A/4C analyze* + Wave 5 list() emit audit + re-validate session, so 3 NEW pure helpers were extracted to preserve ADR-0068 §11 ZERO-new-audit posture (additive only; existing routes verbatim). Earlier: — **Wave 6B IMPLEMENTATION LANDED PR #124 `625ddbf`** per ADR-0067 closes the influence half of active-pattern-consumption (sidecar-field design lock; NEW `alignment_patterns?` on `AssembleContextSuccess` + NEW `include_alignment_patterns?` opt-out on `POST /api/v1/coe/context` + NEW labeled `L_ALIGNMENT` prompt section in `conductSession` 8-layer assembly; reuses Wave 6A `AcceptedPatternAdvisoryView` projection verbatim; ZERO score-boost (ADR-0022 frozen anchor preserved); ZERO capsule pipeline mutation; ZERO new audit literal; ZERO schema migration; 14 integration tests). Active-pattern-consumption FULLY LIVE (Wave 6A visibility + Wave 6B influence). Earlier: — Wave 6A LANDED PR #121 `6b84a99` ships NEW symbiotic `accepted_patterns[]` projection on `GET /api/v1/otzar/my-twin` (caller's OWN ACCEPTED patterns as visible alignment guidance; SAFE projection enforced by AcceptedPatternAdvisoryView; v1 limit 5 / cap 25; reviewed_at DESC; symbiotic advisory_note template per pattern_label; NO assembleContext touch; NO new audit literal; NO schema migration; 15 integration tests). Wave 6B (priming hook into assembleContext) remains ADR/design forward-substrate per Founder operating direction. Earlier: — ADR-0066 + PR #114 (`7661ba9`) ship NEW `OtzarProposedPattern` Prisma model + 4 self-scoped review routes + `OtzarProposedPatternService` + recurrence-detection function + 36 integration tests. Auto-write = AUTO-PROPOSE, NOT auto-commit; owner-first self-scope; 3 closed-vocab source signal types (PER_CONVERSATION_DRIFT / WALLET_STALE_CONTEXT / CROSS_CONVERSATION_ROLLUP) + 3 pattern labels + 4-status lifecycle (PROPOSED / ACCEPTED / REJECTED / ARCHIVED); ADMIN_ACTION + 5-discriminator audit; ZERO new audit literal; existing org-scoped `IntelligencePattern` preserved unchanged per RULE 1 + verified untouched across full test cycle. Closes ADR-0058 §"Forward queue" item 1 at the implementation register. Otzar Wave 2A/B/C all LIVE (`3bb773d`/`1ffa01d`/`c56bd57`, 2026-05-27/28). Drift-detection arc complete: Wave 3 per-conversation drift signals (`779a286`/`e7b4a17`); **Wave 4A stale-context wallet signal** (PR #108); **Wave 4C cross-conversation rollup** (PR #109). 3 live drift-signal routes — all self-scoped + closed-vocab + locked coaching/boundary copy explicitly disclaiming surveillance framing; bearer + "read" only (never admin gate, never manager surface); `ADMIN_ACTION + DRIFT_SIGNAL_READ` audit with `source_signal` discriminator pattern (zero new audit literals); zero schema migration; 38 drift-arc integration tests. **Wave 4B (role-scope-conflict)** intentionally SKIPPED per RULE 13 — ADR-0058 §9 referenced POLICY_DRIFT error_class which is NOT emitted by any current handler; substrate-derivation impossible at v1. **Important scope wording**: closes the Foundation backend drift-detection substrate + active-pattern-consumption + scoped Twin proactivity for v1 self-scoped coaching/alignment/symbiotic trust loop — NOT all future Employee Intelligence product work. Forward-substrate: persistent `ProactiveCardDismissal` model; Twin-as-source `NotificationService` extension; `conductSession` proactivity preamble; NEW `/proactive-cards` route; external delivery via Section 4 connectors; LLM-generated proactive text; background scheduler / cadence persistence; Control Tower proactivity UX (out-of-Foundation-scope); operator-tunable thresholds; drift digest connector fan-out; role-scope-conflict signal pending a POLICY_DRIFT producer. | [`01-employee-intelligence-core.md`](current-build-state/01-employee-intelligence-core.md) |
| 2 | Autonomous Execution Core | **PRODUCTION-GRADE COMPLETE for internal Foundation autonomous-execution-substrate scope** (Wave 12 closeout). Create + cancel (non-RUNNING + RUNNING-via-break-glass) + GET viewer + GET list + GET attempt detail + GET attempt list LIVE; 10 of 10 `ACTION_*` emitters LIVE; 3 of 3 real handlers LIVE; admin `/org/action-policies` LIVE with operator-tunable retry_budget + attempt_timeout_ms_override; forensic-visibility loop CLOSED end-to-end; 3 internal-only notification inbox routes LIVE per PR #58 (GET list + PUT read + PUT dismiss; SAFE projection; enumeration-safe 404). Internal-only = the Foundation autonomous-execution-substrate is complete; external tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** under **Section 4 — MCP / Connectors** as governed adapters. Per-Notification audit literals / admin-cross-recipient list / cache / `NotificationPreference` opt-out intentional future-substrate. | [`02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) |
| 3 | Hives / Team Intelligence | **PRODUCTION-GRADE COMPLETE for v1 same-org Foundation backend scope** (final closeout 2026-05-30). 5-wave arc closure: Wave 1 ADR-0059 design (#85); Wave 2 service-tier safety enforcement (#88, +15 tests, 4 new failure codes); Wave 3 admin routes (#90/#91, 4 admin routes + SAFE projections + idempotent dissolve/force-remove + AI_AGENT admin-tier cleanup, +20 tests); Wave 4 governance_terms policy evaluator (#93/#94, 9 of 10 v1 terms wired; `require_admin_approval_for_invites` deferred; 6 new HiveFailure codes; ADR-0063 3-layer governance architecture; +20 tests); Wave 5 Hive Events producer spine (#96/#97, NEW `hive-events.ts` module + `HiveEventBus` + 5 closed-vocab events on same-org topics + SAFE payload projection + fire-and-forget; +13 tests). 8 live routes (4 public + 4 admin). 10 HiveService methods. 82 Section-3-specific test cases. Zero schema migrations + zero new audit literals across all 5 waves. RULE 0 same-org sovereignty enforced at 6 distinct points; no-leak protections enforced at 6 distinct surfaces (verified with secret-marker integration tests). **Important scope wording**: closes the **Foundation backend substrate for v1 same-org Hives** — NOT all future Hives/Team Intelligence product work. **Forward-substrate** (separate Founder authorization at each slice): Wave 4 Layer 2 enterprise governance policy registry + Wave 4 Layer 3 external governance source feeds + `require_admin_approval_for_invites` term + `HIVE_GOVERNANCE_ZERO_STATE` event + default `HiveEventBus` instantiation at server.ts + BEAM bridge / Phoenix.PubSub consumer half + Broadway guaranteed delivery + hive weighting algorithm + Twin-to-Twin proactive runtime + Otzar Twin subscription + Control Tower WebSocket bridge + Section 4 connector fan-out bridge + cross-org Hives + AI-generated executive summaries + `createTwin` standard-branch AI_AGENT carve-out resolution. | [`03-hives-team-intelligence.md`](current-build-state/03-hives-team-intelligence.md) |
| 4 | MCP / Connectors | **PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5+7 LIVE + Hardening Wave B LIVE.** Provider abstraction + `ConnectorBinding` model (secret_ref env-var NAME only) + 5 admin routes + `INVOKE_CONNECTOR` ActionType + `OutboundWebhookProvider` (HTTPS POST + HMAC-SHA-256) + `NotificationService` fan-out bridge (Wave 5 direct-mode default + Wave 7 Action-routed opt-in via `config.fan_out_mode`) + `verifyInboundHmac` reusable receive-side verifier. 5 admin `ADMIN_ACTION` discriminators + 3 fan-out discriminators (DISPATCHED + FAILED + ENQUEUED) — **zero new audit literals**. SDK-bound connectors + encrypted-at-rest secret column = forward-substrate behind their own future QLOCKs. | [`04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md) |
| 5 | Agent Playground | **LIVE end-to-end with ADR-0076 §4.2 + §5.2 vNext runtime + Section 2 Action read-surface lifecycle integration 2026-05-31 — Foundation Waves 1+2+3+4+5+6+7+8+9 LIVE + Wave 10 consumer-experience contract ADR-0077 design-only LANDED + Wave 10 implementation slice LIVE in `otzar-control-tower` at NEW route `/agent-playground` (preserves existing `/playground` Placeholder per ADR-0077 §11 Option A per Founder UX decision). **vNext runtime LIVE in lockstep across both repos**: Foundation PR #152 `7593e6f` (Wave 9 service migration; 51 Wave 9 integration tests + 192 Wave 4-8 regression preserved) + CT PR #7 `ff6e54b` (Wave 10 type mirror + MSW + tests; 110/110 CT tests passing). **Wave 10 Section 2 Action read-surface integration LIVE at CT PR #8 `ade4981` 2026-05-31** — closes ADR-0077 §8.4 three-state-lifecycle honesty as canonical (simulation / proposed / executed); ZERO Foundation backend changes (consumes existing `GET /api/v1/actions/:id` per ADR-0057 §9 + §10 verbatim); NEW `ActionLifecyclePanel` embedded in Governed Transition panel; lazy TanStack Query (no polling); user-initiated `Refresh action status` button only; closed-vocab `actionLifecycleSummary()` maps each Section 2 ActionStatus → honest copy; NEW `api.actions.getAction(actionId)` namespace + `ActionStatus` + `SafeActionView` + `SafeActionDetailView` + `ActionDetailResponse` type mirrors; lifecycle panel footer: *"This Action detail is a read-only lifecycle view. It does not approve, execute, retry, or cancel the Action. Execution authority remains with the Section 2 Action Runtime per ADR-0057."*; 16 NEW Section 2 lifecycle tests + 126/126 total CT tests passing; zero regression; NO Execute / Approve / Cancel / Retry button in Wave 10 anywhere; NO Section 2 mutation surface; NO Section 2 bypass; NO new Foundation API / schema / audit literal; NO raw payload / secrets / policy internals / raw audit / memory / transcript / prompt / chain-of-thought exposure. vNext branches (RECOMMENDED_PATH / LOW_RISK_PATH / COMPLIANCE_FIRST_PATH / RESILIENCE_FIRST_PATH / HUMAN_REVIEW_PATH / DO_NOT_PROCEED_PATH) + vNext roles (OWNER_OPERATOR / POLICY_REVIEWER / COMPLIANCE_REVIEWER / SECURITY_REVIEWER / DATA_GOVERNANCE_REVIEWER / CONNECTOR_ADMIN / ACTION_APPROVER / CUSTOMER_OR_STAKEHOLDER_ADVOCATE / OPERATIONS_LEAD / RESILIENCE_REVIEWER) replace v1 cleanly per ADR-0076 §17A; default 4×6=24 (§11 ceiling preserved); 2 opt-in branches + 4 opt-in roles via explicit body params; v1 names rejected as INVALID_REQUEST. `api.playground.*` namespace with 10 methods extends existing `src/lib/api.ts` `ApiResult<T>` pattern; Wave 4-9 Foundation type mirrors landed at `src/lib/types/foundation.ts`; 6 panels Scenario / Candidates / Comparison / Recommendation / Simulation+Enterprise-Posture / Governed-Transition; 4 honesty postures hierarchy + conversation-context + evidence-posture + execution-boundary; NO Execute button; NO Wave 8 bypass; NO new Foundation API; NO schema; NO new audit literal; NO organizational graph at v1; conversation-context substrate forward-substrate. (inspector foundation + product-vision ADR + persistent named scenarios + candidate-generation Option A + outcome-comparison Option A + best-path-recommendation Option A + governed-transition Option A + multi-agent simulation orchestration Option A). Wave 8 is the FIRST Section 5 wave that creates Section 2 Action rows via existing `createActionForCaller` in PROPOSED status per ADR-0057; Wave 9 creates ZERO Action rows (Wave 8 owns transitions). 256 Section 5 integration tests passing.** **Wave 9 ADR-0076 LANDED 2026-05-31 (PR #146; `b077a0e`)** — design-only multi-agent simulation contract; 3 orchestration_modes + 5 branch_definitions + 6 agent_roles + closed-vocab projection labels; ADR-0069 §6 8-question check LOCKED v1 at TypeScript §2.1; Option C BEAM forward-substrate. **Wave 9 Option A LANDED 2026-05-31 (PR #147; `340d37f`)** — deterministic TypeScript multi-agent simulation: NEW `PlaygroundSimulationService` + NEW route `POST /api/v1/playground/scenarios/:id/simulations` + 47 integration tests. Sequential `Promise.allSettled` over (branch_definition × agent_role) combinations capped at 24 per §11 (4 default branches × 6 default roles); each combination invokes Wave 7 `recommendBestPath` once; each Wave 7 result projected through a closed-vocab agent_role lens. NO agent-to-agent message-passing; NO LLM-generated agent personas; NO raw chain-of-thought; NO numeric scoring / ranking / winner field names; NO Action creation; NO connector / external provider / LLM / Python / BEAM at v1. Founder enterprise-decision-output clarification 2026-05-31 applied as additive `enterprise_decision_posture` extension (primary_recommended_branch_id + primary_recommendation_reasons[] + viable_alternative_branch_ids[] capped at 3 + evidence_posture[] 12 closed-vocab values + blockers_before_action[] 10 closed-vocab values + safe_next_step 7 closed-vocab values). Founder behavioral clarification 2026-05-31 — *"Wave 9 is not autonomous agent debate. Wave 9 is governed role-perspective simulation before action."* Computed-on-read; ZERO persistence / schema / new audit literal. `ADMIN_ACTION + details.action="PLAYGROUND_SIMULATION_EXECUTED"` audit safe-metadata only per §14; each Wave 7 sub-invocation also emits its own PLAYGROUND_BEST_PATH_RECOMMENDED audit row (not suppressed). Owner-first + same-org SCENARIO_NOT_FOUND gate inherited via Wave 7 → Wave 6 → Wave 5 → Wave 4 delegation. Mandatory `caller_confirmation: true` per §2. Partial Wave 7 sub-invocation failures projected as INSUFFICIENT_DATA closed-vocab branches per §12 fault-isolation guarantee. Founder's recommended expanded vocab (10 agent_roles + 6 branch_types incl. OWNER_OPERATOR / POLICY_REVIEWER / ACTION_APPROVER / RECOMMENDED_PATH / DO_NOT_PROCEED_PATH) + `conversation_context_signals[]` substrate are forward-substrate for future ADR-0076 amendments per RULE 20. Wave 1 ADR-0060 (#86) locks v1 inspector scope. Wave 2 (PR #100) ships 3 sandbox-only inspector routes (policy-evaluator / connector-dry-run / working-set) + PlaygroundService + 17 integration tests. Wave 3 ADR-0065 LANDED 2026-05-30 as NEW ADR sitting ABOVE ADR-0060 at the product-vision tier — canonicalizes the long-term DGI vision + 13-input set + 10-output set + human-in-the-loop doctrine + universal safety/no-leak doctrine + canonical 10-wave forward map. **Wave 4 LANDED 2026-05-30 (PR #111; `a2988ee`)** — NEW `PlaygroundScenario` Prisma model + 5 owner-first CRUD routes (`POST/GET /api/v1/playground/scenarios` + `GET/PUT/DELETE /api/v1/playground/scenarios/:id`) + `PlaygroundScenarioService` + 38 integration tests. SAFE persistence layer for the future Wave 5+ candidate-generation / outcome-comparison / best-path-recommender / governed-transition substrate. Owner-first self-scope per RULE 0; same-org enforcement when `org_entity_id` non-null; cross-owner/cross-org/unknown id all fold to `SCENARIO_NOT_FOUND` enumeration-safe 404; forbidden-field rejection on PUT; soft-archive per RULE 10 with idempotency. ADMIN_ACTION + details.action discriminator audit (CREATED/UPDATED/ARCHIVED); ZERO new audit literal; safe details only (no title/description text; no raw Json payloads). Schema migration via `npm run db:push:test` per ADR-0025. **Wave 5 contract ADR-0072 LANDED 2026-05-31 (PR #134; `11b80cb`)** — design-only contract closing ADR-0065 §7 Wave 5 forward-queue line at the contract register; sits ABOVE ADR-0060 and BELOW ADR-0065 at the contract tier; 20 sub-decisions locking the scenario candidate shape + 4 closed vocabularies (`candidate_type` 9 / `governance_findings` 11 / `action_runtime_transition_hint` 7 / `confidence_label` 4) + 12-input canonical allowed source set + forbidden inputs + bounded counts + universal safety / no-leak doctrine + legal-advice posture inherited verbatim from ADR-0070 §9 + human-in-the-loop doctrine + three implementation-method comparison. **Wave 5 Option A LANDED 2026-05-31 (PR #136; `e708fa7`)** — deterministic / template-first TypeScript implementation. NEW `PlaygroundCandidateService` + NEW route `POST /api/v1/playground/scenarios/:id/candidates` + 33 integration tests. Computed-on-read; ZERO persistence; ZERO new Prisma model; ZERO schema migration; ZERO new audit literal; ZERO LLM / model calls; ZERO Python; ZERO BEAM; ZERO Action creation; ZERO connector invocation; ZERO external provider call; ZERO Control Tower frontend; ZERO outcome comparison / scoring / best-path recommendation / governed transition / multi-agent runtime at this slice. Owner-first + same-org `SCENARIO_NOT_FOUND` gate delegated verbatim to `PlaygroundScenarioService.getScenario` (canonical Wave 4 enumeration-safe 404 path reused). `ADMIN_ACTION + details.action = "PLAYGROUND_CANDIDATES_GENERATED"` audit with safe metadata only (NEVER raw candidate text; NEVER raw scenario JSON; safe metadata = scenario_id + candidate_count + generation_mode + source_summary + policy_review_required + blocked_count). Closed-vocab template library covers all 9 ADR-0072 §2 candidate types; default set emits 5 types (STATUS_QUO + LOW_RISK_INCREMENTAL + COMPLIANCE_FIRST + OPERATIONAL_RESILIENCE + HUMAN_REVIEW_REQUIRED) + DO_NOT_PROCEED when scenario.status === ARCHIVED; the 3 framing-loaded types (SPEED_OPTIMIZED / COST_OPTIMIZED / CUSTOMER_IMPACT_FIRST) are opt-in via explicit `candidate_types` filter only. Every candidate carries the mandatory ADR-0072 §11 `honest_note` (advisory + not executed + not legal advice + requires human/governance review). Deterministic SHA-256 16-char `candidate_key` per ADR-0068 precedent. Bounded count `CANDIDATES_PER_CALL_MAX = 8` per ADR-0072 §18. Wave 5 Option B Python (requires ADR-0069 §2.4 boundary ADR first) + Option C BEAM (folds into ADR-0065 §7 Wave 9) + Waves 6-10 remain forward-substrate behind separate Founder authorization. **Wave 6 contract ADR-0073 LANDED 2026-05-31 (PR #138; `1c85985`)** — design-only outcome-comparison contract closing ADR-0065 §7 Wave 6 forward-queue line at the contract register; 22 sub-decisions; 5 closed vocabularies; canonical "Wave 6 calls Wave 5 internally" decision; bounded counts; ADR-0070 §9 legal-advice posture inherited verbatim; NO numeric scoring; NO winner selection. **Wave 6 Option A LANDED 2026-05-31 (PR #139; `02410ee`)** — deterministic / template-first TypeScript outcome-comparison: NEW `PlaygroundOutcomeComparisonService` + NEW route `POST /api/v1/playground/scenarios/:id/outcome-comparisons` + 39 integration tests. Computed-on-read; internally invokes Wave 5 candidate service per ADR-0073 §10 (NEVER caller-supplied candidate payloads); NO `candidate_keys[]` in v1 per Founder QLOCK 2; ZERO persistence / schema migration / new audit literal / LLM / Python / BEAM / numeric scoring / winner selection / best-path recommendation / Action creation / connector invocation / external provider call / Control Tower frontend / multi-agent runtime / outcome-comparison persistence. Owner-first + same-org SCENARIO_NOT_FOUND gate inherits via Wave 5 → Wave 4 delegation. `ADMIN_ACTION + details.action = "PLAYGROUND_OUTCOMES_COMPARED"` audit with safe metadata only. DETERMINISTIC_RUBRIC mode maps Wave 5 candidate fields → outcome dimension ratings + risk_findings + dependency_findings + required_reviews via closed-vocab rubric library. CANDIDATE_FIELD_PROJECTION mode echoes Wave 5 closed-vocab fields verbatim. Every matrix item + top-level response carries mandatory ADR-0073 §16 `honest_note`. TradeoffSummary = 4 closed-vocab `candidate_key` sets — NEVER a ranking. `candidates_per_comparison_max = 8` per ADR-0073 §11. Wave 6 Option B Python + Option C BEAM + Waves 7-10 remain forward-substrate behind separate Founder authorization. **Wave 7 contract ADR-0074 LANDED 2026-05-31 (PR #141; `8922f66`)** — design-only best-path recommendation contract closing ADR-0065 §7 Wave 7 forward-queue line at the contract register; 23 sub-decisions; deterministic 10-gate priority ladder + 11th tie-breaker; 4 closed vocabularies (recommendation_reasons 11 + action_transition_readiness 8 + reason_not_recommended 10 + recommendation_mode 4); canonical "Wave 7 calls Wave 6 internally" decision; bounded counts; ADR-0070 §9 legal-advice posture inherited verbatim + extended for Wave 7; mandatory `human_decision_required` boolean per §16; §22 future-generalization strategic context (preserves architecture for trust-governed life decision support WITHOUT authorizing personal-life automation). **Wave 7 Option A LANDED 2026-05-31 (PR #142; `80a60f1`)** — deterministic / template-first TypeScript best-path recommendation: NEW `PlaygroundBestPathRecommendationService` + NEW route `POST /api/v1/playground/scenarios/:id/best-path-recommendations` + 39 integration tests. Computed-on-read; internally invokes Wave 6 outcome-comparison service per ADR-0074 §10 (NEVER caller-supplied comparison/candidate payloads); NO `candidate_keys[]` in v1 per Founder QLOCK 2; ZERO persistence per Founder QLOCK 1 / schema migration / new audit literal / LLM / Python / BEAM / numeric scoring / winner-declaration framing / best-path execution / Action creation / connector invocation / governed transition / multi-agent runtime / Control Tower frontend. Owner-first + same-org SCENARIO_NOT_FOUND gate inherits via Wave 6 → Wave 5 → Wave 4 delegation. `ADMIN_ACTION + details.action = "PLAYGROUND_BEST_PATH_RECOMMENDED"` audit with safe metadata only (NEVER raw recommendation/comparison/candidate text or scenario JSON). 4 recommendation modes live (DETERMINISTIC_POLICY_FIRST default + DETERMINISTIC_GOVERNANCE_FIRST + DETERMINISTIC_RESILIENCE_FIRST + DETERMINISTIC_HUMAN_REVIEW_FIRST). Deterministic 10-gate priority ladder + 11th deterministic tie-breaker by candidate_key lexical ASC. Top-level response + each `AlternativeConsidered` carries mandatory `honest_note` + top-level `human_decision_required` boolean (TRUE unless 6-condition unanimous safe-state holds per ADR-0074 §16). `alternatives_considered` surfaces N-1 non-recommended candidates with closed-vocab `reason_not_recommended` per pair. Bounded counts per ADR-0074 §11 (`candidates_considered_max = 8`). Wave 7 Option B Python + Option C BEAM + Waves 8/9/10 remain forward-substrate per Founder autonomy directive. | [`05-agent-playground.md`](current-build-state/05-agent-playground.md) |
| 6 | Enterprise Analytics | **PRODUCTION-GRADE COMPLETE for Foundation backend scope (v1) + Wave 6 + Wave 7 extensions LIVE** (final v1 closeout 2026-05-30; Wave 6 LIVE 2026-05-30; Wave 7 LIVE 2026-05-30). 4-aggregate v1 arc + Wave 6 per-ActionType breakdown + Wave 7 compliance-posture on top of ADR-0061 Wave 1 design (#87): Wave 2 CORRECTION velocity 7d (#103); Wave 3 action-runtime success rate org-wide (#104); Wave 4 connector activity (#105); Wave 5 hive participation (#106); Wave 6 per-ActionType action-runtime health (PR #117; `2c4336a`); **Wave 7 org-level compliance-posture (PR #119; `2b83116`)** — metadata-only org-level posture surface (NOT legal advice; NOT certification; NOT employee compliance scoring); 5-label closed-vocab HEALTHY / WATCH / DEGRADED / NOT_CONFIGURED / INSUFFICIENT_POPULATION; reads EntityComplianceProfile + ComplianceFramework + recent COMPLIANCE_CHECK_PASSED/FAILED audit counts; deliberate exclusion of LawfulBasis + REGULATOR_ACCESS_* counts per substrate-honest finding (no org_entity_id column at v1); same auth + same-org + k=5 + ANALYTICS_READ (zero new audit literal); 20 integration tests. 6 live aggregates total (v1 4 + Wave 6 + Wave 7). All 4 aggregates SAFE-projected; same-org sovereignty enforced by construction; k=5 HIPAA Safe Harbor floor universal; `can_admin_org` gate universal; `ADMIN_ACTION + details.action="ANALYTICS_READ"` audit universal; no new audit literal across any wave; zero schema migration; zero new external dependencies; 55 integration tests. **Important scope wording**: closes the Foundation backend analytics substrate for v1 same-org admin reads — NOT all future analytics product work. **Forward-substrate**: additional aggregates + persistent projections + operator-tunable per-org threshold + cross-org analytics + differential privacy + AI-generated executive summaries + Control Tower UX + real-time/streaming + compliance-framework-specific aggregates (each its own slice + separate Founder authorization). Foundation-strategic-context coherent: generic Entity model preserved (AI_AGENT/DEVICE/APPLICATION/COMPANY aggregate identically), no blockchain/payment surface, no surveillance framing. | [`06-enterprise-analytics.md`](current-build-state/06-enterprise-analytics.md) |
| 7 | Full Audit Viewer | **PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5 LIVE + Hardening Wave A (CSV export) LIVE + ADR-0071 cross-scope verify-chain LIVE (PR #132 `ffc0548`).** Canonical 4-scope matrix (self / org-admin / niov-admin / regulator) now LIVE across **all 4 read shapes** — list / single-event / export / verify-chain — closing ADR-0070 §Forward queue item 1 at the canonical-execution register. ADR-0071 Option A clean break per Founder QLOCK: NEW `verified` / `checked_event_count` / `chain_algorithm` / `window_start/end` / `first_event_id+hash` / `last_event_id+hash` / `broken_at_event_id` / `failure_reason` / `lawful_basis_id` / `evidence_note` / `honest_note` canonical fields; old `valid` / `total_events` / `broken_at` / `actor_entity_id` aliases NOT emitted. `VERIFY_CHAIN_MAX_EVENTS = 10_000` perf cap; 30-day default window for org/platform; regulator window bounded by LawfulBasis `valid_from`→`valid_until`. ADR-0036 9-condition LawfulBasis enforcement reused verbatim. Regulator-scope continuity verification reads prior row's `event_hash` only (one column) without surfacing data fields per ADR-0071 §7.3. ZERO new audit literal — extended `AUDIT_VIEW_VERIFY_CHAIN` meta. ZERO schema migration. 20 new integration tests + 77 audit-viewer regression preserved. Regulator access via ADR-0036 LawfulBasis 9-condition enforcement (Wave 5 PR #68). Export supports both `format=ndjson` (Wave 4) and `format=csv` (Hardening A PR #76; RFC 4180; CRLF terminators; `x-audit-format` header). All gates TAR-authoritative; filters AND-narrow; cross-basis isolation tested; SAFE projection; ADMIN_ACTION:AUDIT_VIEW_* (no new audit literal across any wave). Control Tower UX + cross-chain verify-chain = forward-substrate. **Proactive `REGULATOR_ACCESS_EXPIRED` emitter LIVE via Hardening Wave D (PR #79 / `dcff369`; 2026-05-29)** — `tickRegulatorAccessExpirySweep` on the Action scheduler cron host every 60s; idempotent + supersession-aware; `REGULATOR_ACCESS_EXPIRED` audit literal reserved at CAR Sub-box 3 sub-phase 5; 7 integration tests. (Substrate-honest doc-drift correction landed 2026-05-30: prior version of this row listed the emitter as forward-substrate.) | [`07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md) |
| 8 | Billing / Entitlements | **Foundation entitlement + usage-meter substrate LIVE end-to-end 2026-06-03 (PRs #232/#233 + billing-wiring round PRs #244-#251)**. B5-α `assertEntitledForCaller` + NEW `assertEntitledForOrgSoftGate` helper + ADR-0093 §10 always-allow base-tier features set; B6-α `recordUsageForOrg` + composite (org_entity_id, meter_id) PK + BigInt counter precision. 7 of 11 Founder-named billing-tier targets wired as soft-gate consumers (connector activation + twin creation + audit export + regulator-view + Dandelion D6 enterprise/team/business + workflow stage 3+). Provider-agnostic; NO Stripe / Coinbase / Circle / Base / Paddle / Chargebee / x402 selected. Soft-gate posture for backward-compat — orgs without an Entitlement row continue to use the consumer surface; orgs WITH a row get standard `evaluateEntitlement` gating. Monetization (70/30 split + `PRICING_TABLE`) preserved. Forward-substrate: B5-β seat lifecycle mutation surface + B6-β enforcement (throttle / quota / overage; needs Founder pricing direction) + payment provider integration (B7) + Hive premium signals + Agent Playground gate + DMW advanced governance gate + remaining vague billing targets (each its own slice). | [`08-billing-entitlements.md`](current-build-state/08-billing-entitlements.md) |
| 9 | Admin / Governance Control Tower | **Backend contracts substantively complete for a Control Tower v1 frontend.** Live surfaces: Otzar Wave 2A/B/C (per Section 1 confirmation) + Action runtime (Section 2) + Audit viewer (Section 7 self/org/platform/regulator + NDJSON + CSV) + Connector admin (Section 4 — 5 routes + INVOKE_CONNECTOR + fan-out + inbound HMAC verifier) + break-glass + regulator window + escalations. AI-generated executive summary projections per ADR-0052 doctrine remain forward-substrate behind a Founder product decision. CT frontend lives in [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower). | [`09-admin-governance-control-tower.md`](current-build-state/09-admin-governance-control-tower.md) |
| 10 | Deployment / Security / Go-Live | Track A closed; ADR-0011/0013/0015/0018/0019/0024/0025/0047 substrate LIVE; GOVSEC.5 (ADR-0050) Accepted; GOVSEC.2–4 + GOVSEC.6–10 forward-substrate. | [`10-deployment-security-go-live.md`](current-build-state/10-deployment-security-go-live.md) |

## Recent merges (last 10 implementation + docs PRs)

| PR | Commit | Description |
|---|---|---|
| [#147](https://github.com/NiovArchitect/niov-foundation/pull/147) | `340d37f` | Add Section 5 Wave 9 Option A — Agent Playground deterministic multi-agent simulation orchestration (47 tests) |
| [#146](https://github.com/NiovArchitect/niov-foundation/pull/146) | `b077a0e` | Close out Section 5 Wave 8 Option A + Add ADR-0076 design-only — Section 5 Wave 9 multi-agent simulation orchestration contract |
| [#145](https://github.com/NiovArchitect/niov-foundation/pull/145) | `8a69863` | Add Section 5 Wave 8 Option A — Agent Playground deterministic governed transition (43 tests) |
| [#144](https://github.com/NiovArchitect/niov-foundation/pull/144) | `3cffcc8` | Add ADR-0075 design-only — Section 5 Wave 8 Agent Playground governed-transition contract |
| [#143](https://github.com/NiovArchitect/niov-foundation/pull/143) | `90bf0e2` | Close out Section 5 Wave 7 Option A — deterministic / template-first TypeScript best-path recommendation LIVE |
| [#142](https://github.com/NiovArchitect/niov-foundation/pull/142) | `80a60f1` | Add Section 5 Wave 7 Option A — Agent Playground deterministic / template-first best-path recommendation (39 tests) |
| [#141](https://github.com/NiovArchitect/niov-foundation/pull/141) | `8922f66` | Add ADR-0074 design-only — Section 5 Wave 7 Agent Playground best-path recommendation contract |
| [#140](https://github.com/NiovArchitect/niov-foundation/pull/140) | `c0dc6e2` | Close out Section 5 Wave 6 Option A — deterministic / template-first TypeScript outcome comparison LIVE |
| [#139](https://github.com/NiovArchitect/niov-foundation/pull/139) | `02410ee` | Add Section 5 Wave 6 Option A — Agent Playground deterministic / template-first outcome comparison (39 tests) |
| [#138](https://github.com/NiovArchitect/niov-foundation/pull/138) | `1c85985` | Add ADR-0073 design-only — Section 5 Wave 6 Agent Playground outcome-comparison contract |
| [#137](https://github.com/NiovArchitect/niov-foundation/pull/137) | `aca9a71` | Close out Section 5 Wave 5 Option A — deterministic / template-first TypeScript candidate generation LIVE |
| [#136](https://github.com/NiovArchitect/niov-foundation/pull/136) | `e708fa7` | Add Section 5 Wave 5 Option A — Agent Playground deterministic / template-first candidate generation (33 tests) |
| [#134](https://github.com/NiovArchitect/niov-foundation/pull/134) | `11b80cb` | Add ADR-0072 design-only — Section 5 Wave 5 Agent Playground candidate-generation contract |
| [#119](https://github.com/NiovArchitect/niov-foundation/pull/119) | `2b83116` | Add Section 6 Wave 7 — org-level compliance-posture aggregate (20 tests) |
| [#118](https://github.com/NiovArchitect/niov-foundation/pull/118) | `81eabd4` | Close out Section 6 Wave 6 — per-ActionType action-runtime health docs |
| [#117](https://github.com/NiovArchitect/niov-foundation/pull/117) | `2c4336a` | Add Section 6 Wave 6 — per-ActionType action-runtime health aggregate (16 tests) |
| [#116](https://github.com/NiovArchitect/niov-foundation/pull/116) | `e77bc82` | RULE 13 substrate-honest correction — Section 7 REGULATOR_ACCESS_EXPIRED emitter LIVE since Hardening Wave D |
| [#115](https://github.com/NiovArchitect/niov-foundation/pull/115) | `a1b7ca4` | Close out Section 1 Wave 5 — Otzar proposed-pattern docs |
| [#114](https://github.com/NiovArchitect/niov-foundation/pull/114) | `7661ba9` | Add Section 1 Wave 5 — Otzar proposed-pattern from recurring drift (36 tests) |
| [#113](https://github.com/NiovArchitect/niov-foundation/pull/113) | `ffa13a6` | Add Section 1 Wave 5 ADR-0066 — design-only |
| [#112](https://github.com/NiovArchitect/niov-foundation/pull/112) | `dbbe9c7` | Close out Section 5 Wave 4 — Agent Playground persistent named scenarios |
| [#111](https://github.com/NiovArchitect/niov-foundation/pull/111) | `a2988ee` | Add Section 5 Wave 4 — Agent Playground persistent named scenarios + safe CRUD |
| [#110](https://github.com/NiovArchitect/niov-foundation/pull/110) | `09f4144` | Close out Section 1 — Otzar drift detection production-grade complete (v1) |
| [#109](https://github.com/NiovArchitect/niov-foundation/pull/109) | `6bd0b70` | Add Section 1 Wave 4C — Otzar cross-conversation drift rollup |
| [#108](https://github.com/NiovArchitect/niov-foundation/pull/108) | `b6b4a16` | Add Section 1 Wave 4A — Otzar stale-context drift signal |
| [#107](https://github.com/NiovArchitect/niov-foundation/pull/107) | `2aa203a` | Close out Section 6 — Enterprise Analytics PRODUCTION-GRADE COMPLETE |
| [#106](https://github.com/NiovArchitect/niov-foundation/pull/106) | `a3d484c` | Add Section 6 Wave 5 — hive-participation aggregate |
| [#105](https://github.com/NiovArchitect/niov-foundation/pull/105) | `f629e23` | Add Section 6 Wave 4 — connector-activity aggregate |
| [#104](https://github.com/NiovArchitect/niov-foundation/pull/104) | `c8362cd` | Add Section 6 Wave 3 — action-runtime success rate aggregate |
| [#103](https://github.com/NiovArchitect/niov-foundation/pull/103) | `2d95597` | Add Section 6 Wave 2 — CORRECTION velocity 7d aggregate |
| [#102](https://github.com/NiovArchitect/niov-foundation/pull/102) | `40c3e80` | Add Section 5 Wave 3 — ADR-0065 Agent Playground long-term product-vision |
| [#101](https://github.com/NiovArchitect/niov-foundation/pull/101) | `9c34151` | Close out Section 5 Wave 2 — Agent Playground v1 docs |
| [#100](https://github.com/NiovArchitect/niov-foundation/pull/100) | `fd35c62` | Add Section 5 Wave 2 — Agent Playground v1 implementation |
| [#99](https://github.com/NiovArchitect/niov-foundation/pull/99) | `8807428` | Close out Section 3 — production-grade complete for v1 same-org Foundation backend scope |
| [#98](https://github.com/NiovArchitect/niov-foundation/pull/98) | `5c2308f` | Close out Section 3 Wave 5 — Hive Events producer docs |
| [#97](https://github.com/NiovArchitect/niov-foundation/pull/97) | `056c7c7` | Add Section 3 Wave 5 v1 — Hive Events producer substrate |
## Immediate next work queue

> **Section 5 Wave 4 LANDED** (PR #111 `a2988ee` 2026-05-30) — `PlaygroundScenario` persistence substrate. Section 6 + Section 1 + Section 3 + Section 4 + Section 7 each PRODUCTION-GRADE COMPLETE for their Foundation backend scope. Section 5 PARTIAL with Waves 1+2+3+4 LIVE; Wave 5 candidate-generation contract is the recommended next slice per ADR-0065 §7.

**Next-section preference order:**

1. ~~**Section 3 Hives / Team Intelligence**~~ — PRODUCTION-GRADE COMPLETE (closeout PR #99 2026-05-30).
2. ~~**Section 9 Admin / Governance backend contracts**~~ — substantively complete per Hardening Wave C.
3. ~~**Section 5 Agent Playground Waves 1-4**~~ — LIVE; Wave 5+ (candidate generation + outcome comparison + best-path recommender + governed transition to Action runtime + multi-agent orchestration + Control Tower frontend) requires separate Founder authorization at each slice per ADR-0065 §7.
4. ~~**Section 6 Enterprise Analytics**~~ — **PRODUCTION-GRADE COMPLETE for Foundation backend scope (v1)** (4-aggregate arc closure 2026-05-30; closeout PR #107).

**Forward-substrate within closed/partial sections:**

- **Section 1 advanced drift signals** (stale-context per ADR-0044/0045; role-scope-conflict per Section 2 ActionAttempt POLICY_DRIFT; cross-conversation Twin rollup; operator-tunable thresholds; drift digest connector fan-out via Section 4) — all forward-substrate per ADR-0058 §9; each is its own slice.
- **Section 8 Billing / Entitlements** — Founder-excluded scope (per session-start direction).
- **Section 10 GOVSEC.6–10** — each phase RULE 20-gated by ADR-0049 umbrella.

**Section 4 forward-substrate (RULE 20-gated; sequencing only):**

- SDK-bound connectors (Slack OAuth / Gmail / Microsoft Graph / Salesforce / Linear / Jira / SMS / Push) — each its own QLOCK + RULE 21 research arc; each requires OAuth token storage schema + key-management.
- Encrypted-at-rest secret column for per-tenant credentials (ADR-0019 cryptographic-suite extension).
- Action-runtime-integrated fan-out variant (current Wave 5 is fire-and-forget; the variant would couple Section 2 ↔ Action runtime for retry guarantees).
- Control Tower connector admin UX (frontend; out of Foundation scope).

**Section 7 forward-substrate (autonomous-clean if/when prioritized):**

- ~~Proactive `REGULATOR_ACCESS_EXPIRED` emitter via SCHEDULER sweep~~ — **LIVE** via Hardening Wave D (PR #79 / `dcff369`; 2026-05-29). Substrate-honest doc-drift correction landed 2026-05-30.
- ~~Org-admin / platform / regulator `verify-chain` (cross-chain perf + leakage review; separate QLOCK)~~ — **IMPLEMENTATION LANDED PR #132 `ffc0548` 2026-05-31** per ADR-0071 with Option A clean break Founder QLOCK.
- Control Tower audit-viewer UX (frontend; out of Foundation scope).

**Section 9 forward-substrate (Founder product decision required):**

- AI-generated executive summary projections per ADR-0052 doctrine (what-happened / why / needs-approval / risk / recommended-action) — needs Founder direction on which summaries + how scoped before implementation.

## Critical Do-NOT-claim list (global truths)

- "Autonomous Execution is fully live." — runtime executes through **stub handlers only**; real per-`ActionType` business effects are forward-substrate.
- "AI Twins can fully execute actions on real systems." — they cannot until per-type handlers land.
- "Connectors / MCP are live." — deferred per ADR-0057 §17 + ADR-0058.
- "Cancel works for any RUNNING action unconditionally." — RUNNING cancellation requires an ACTIVE GOVSEC.5 break-glass grant (ADR-0050) for `action_type = "ACTION_RUNNING_CANCEL"`; non-privileged callers without a grant get 403. The grant is single-use (status: ACTIVE → USED on consumption).
- "`ACTION_TIMED_OUT` is an audit literal." — no; the vocabulary is closed at 10. Timeouts emit `ACTION_FAILED` with `error_class = "EXECUTOR_TIMEOUT"`.
- "Sesame / voice / desktop edge / wearable lens UX is live." — forward product architecture, not implemented.
- "Otzar supports browser automation / native-app automation / MCP connectors." — false; future authorized slices only.
- "TypeScript has zero errors." — baseline is 4 canonical residuals (ADR-0015 Decision B Amendment 1).
- "All 10 production sections are complete." — only Section 1 (foundational) + Section 2 (PARTIAL) + CI-guard pre-arm are at production grade.
- "Migrations were applied." — only when explicitly authorized + executed via `db:push:test` (ADR-0025).

## Global product directives (preserved)

- **Otzar is voice-first, low-click, ambient, desktop/laptop edge-native, wearable-ready.** Ambient screen-edge confirmations / risks / approvals / blockers / next actions are the daily surface; the lens edge-of-vision is the future surface. **Canonicalized 2026-06-02 by ADR-0085** per `[FOUNDER-CORRECTION — OTZAR IS VOICE-FIRST / SESAME IS CORE PRODUCT REQUIREMENT]`; voice-first substrate at `docs/voice-first/` includes the 4 doctrine lines + 13-surface interaction map + 10-gate Sesame readiness assessment + `VoiceProviderAdapter` seam + `VoiceIntentEnvelope` substrate object + LOW/MEDIUM/HIGH risk-tiered action model + VF.1 → VF.7 implementation sequence.
- **Sesame-style voice MUST map into the governed Action runtime.** Voice is the interface; COSMP / governance is the law; Otzar is the agentic enterprise brain; Actions are the body; the ambient edge is the daily surface. Voice MUST NEVER bypass policy, scoped permissions, audit, dual-control, or approvals.
- **Perplexity Computer / Comet is a competitive forcing function**, not a feature directive. Personal AI computer / browser automation / native-app automation / web tools / connectors / voice are becoming table stakes; Otzar's moat is governed enterprise autonomy, scoped memory, Action runtime + dual-control, role hierarchy, audit, team / hive intelligence, voice-first, ambient edge UX, enterprise-context native.
- **Perplexity may win "personal AI computer." Otzar must win "governed autonomous enterprise."**

## Docs architecture rule (mandatory)

5-tier hierarchy: tier 1 [`NEXT_ACTION.md`](NEXT_ACTION.md) → tier 2 this file → tier 3 [`current-build-state/XX-section.md`](current-build-state/) → tier 4 [`build-log/`](build-log/) → tier 5 [`architecture/decisions/`](architecture/decisions/). Companion: [`research/`](research/) holds RULE 21 pre-authorization research arcs for future substrate-architectural pastes — research is not modification, so AI assistants land arcs autonomously; the substantive implementation wave that consumes an arc requires Founder QLOCK per RULE 20.

Per `[FOUNDATION-VELOCITY-CORRECTION]`, docs refresh fires **once per completed wave**, not after every individual PR. Update **all** of:

1. [`docs/NEXT_ACTION.md`](NEXT_ACTION.md) — operational baton (≤ 150 lines).
2. The relevant `docs/current-build-state/XX-section.md` — detailed canonical record (don't starve of necessary detail).
3. This master file ONLY for: latest main HEAD, latest merged PR, 10-section status row changes, next-work-queue re-order, global do-not-claim list changes.
4. A tier-4 `docs/build-log/YYYY-MM-DD-pr-XX-slug.md` entry ONLY for **major** architectural landings (new substrate cluster, security/governance landing, schema change, cross-section integration, complex runtime behavior, RULE 21 paste). Routine routes skip this.

**Do not** bloat this master with per-PR file-by-file detail. That belongs in the section file or the build-log entry.

Master target size: ≤ 500 lines. Cap: 1,000 lines.

Lean docs ≠ less rigorous docs. Move detail to the correct layer; do not delete clarity. See [`current-build-state/README.md`](current-build-state/README.md) + [`build-log/README.md`](build-log/README.md) for the full refresh discipline.

## Founder authorization

This index + the per-section split landed per Founder QLOCK
`[FOUNDATION-CURRENT-BUILD-STATE-SPLIT-ARCHITECTURE-QLOCK]`
(2026-05-29). RULE / ADR modifications continue to require
explicit Founder authorization per RULE 20.
