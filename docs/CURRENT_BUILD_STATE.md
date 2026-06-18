# NIOV Foundation — Current Build State

**Status:** Tier 2 of the Foundation 5-tier docs hierarchy.
Lean master index by design. Tier 1 operational baton:
[`docs/NEXT_ACTION.md`](NEXT_ACTION.md). Tier 3 per-section
detail: [`docs/current-build-state/`](current-build-state/).
Tier 4 PR-specific build-log:
[`docs/build-log/`](build-log/). Tier 5 ADRs:
[`docs/architecture/decisions/`](architecture/decisions/).

**Last updated:** 2026-06-17 — **Foundation-Scale Arc IN FLIGHT** (see
"Foundation-Scale Arc (Phase 1288+)" section below; 1288-B Generalized
Entity & Authority Envelope LANDED, PR #425). Earlier 2026-06-12 —
**PRODUCTION SCHEMA PUSHED** (Founder
typed APPROVE PROD SCHEMA PUSH; credentials rotated + verified;
preflight additive-only — 52 tables / 69 types / 177 indexes /
19 columns, zero destructive ops; post-push diff EMPTY; pending set
now empty). AI brain LIVE on Anthropic; full voice stack keyed
(Deepgram + Whisper + ElevenLabs + AssemblyAI + OpenAI Realtime;
OpenAI account still needs billing). Phase 1259 premium TTS runtime
in flight.
(**Otzar Phases 1221 + 1222 + 1223 + 1228 + 1229 + 1230 + 1231 +
1224/1225/1226/1227 connector substrate LANDED 2026-06-10** —
bounded Founder queue 1215–1232 substantially complete.

## Foundation-Scale Arc (Phase 1288+) — IN FLIGHT

**Founder re-anchor (2026-06-17):** Foundation is the governed substrate for
AI agents, devices, apps, games, SaaS, worlds, marketplaces, decentralized
memory, microtransactions, and ambient computing. **Otzar is the first proving
application, not the platform.** The ambient AI brain and Foundation-scale
substrate are still forming — these phases harden the primitives that let
agents/devices/applications/worlds operate safely at scale. Memory Capsules
remain first-class (DMW = container, Capsule = atomic unit, COSMP = access
protocol, COE = scoped assembly, Authority Envelope = know/do/request/pay/
approve, Audit/Proof = evidence). Authority is decided by Foundation only —
never by an LLM, Python, BEAM, a device, or an app.

Authorized autonomous sequence (back-to-back; mock-only economics; stop only on
a true stop condition):

- **1288-B Generalized Entity & Authority Envelope — LANDED 2026-06-17**
  (PR [#425](https://github.com/NiovArchitect/niov-foundation/pull/425) `e53a215`).
  NEW `apps/api/src/services/foundation/authority.service.ts`
  (`computeAuthorityEnvelope` pure + deterministic; `FoundationAuthorityService`
  with `getMyAuthorityForCaller` + `evaluateAuthorityForCaller`) + NEW
  `apps/api/src/routes/foundation.routes.ts` (`GET /api/v1/foundation/authority/me`
  + `GET /api/v1/foundation/entities/:entity_id/authority`) + additive audit
  literal `AUTHORITY_ENVELOPE_EVALUATED`. Read-only projection derived from
  Entity+TAR+Wallet; five dimensions (can_know/can_do/can_request/can_pay/
  requires_approval) + explicit `memory_scope` + device/app/spend scope.
  `can_pay` settlement_mode = DISABLED (1290-A may move to MOCK_ONLY only).
  Cross-tenant fail-closed; non-human entities cannot self-authorize; RULE 0
  sovereignty (only PERSON). +16 tests; CI green (typecheck 0 / unit 371 /
  integration 111 / Python / Elixir); live-proven. **No schema migration.**
  RULE 13 catch: the dual-control target-resolver self-deadlock is ALREADY
  CLOSED on main (`resolveDualControlTarget`) — 1288-B did not touch
  dual-control. `work-os/authority-context.service.ts` is the distinct
  Otzar-layer concept (not duplicated).
- **1289-A COSMP / DMW / Memory Capsule Hardening — LANDED 2026-06-17.**
  (A.1) NEW `apps/api/src/services/foundation/proof-of-access.service.ts` +
  `GET /api/v1/foundation/capsules/:capsule_id/access-proof` — read-only
  `MemoryCapsuleAccessProof` (permission state incl. REVOKED/EXPIRED + capsule
  governance flags + tamper-evident audit evidence via queryAuditEvents +
  verifyAuditChain; enumeration-safe `CAPSULE_NOT_FOUND`; no-leak: no
  content/storage/embedding/raw payload). (A.2) APPLICATION added to the
  restricted (non-human) class in `negotiate.service.ts:isRestrictedAiClass`
  (+ authority.service mirror) — apps now respect `ai_access_blocked` +
  `requires_validation` on NON-OWNED capsules like AI_AGENT/DEVICE; verified
  zero-regression additive hardening (no APPLICATION capsule-read flow exists;
  owner-shortcut + own-wallet reads unaffected; PERSON unchanged; AI_AGENT
  FULL→SUMMARY cap stays AI_AGENT-only). No schema migration.
  **SURFACED FINDING (A.3, RULE 13):** cascade revocation is NOT implemented
  because the substrate cannot support it safely AND there is nothing to
  cascade to — the Permission model records NO grant lineage (no
  parent/source/derived column) and sovereignty rules forbid a non-owner from
  granting, so transitive re-sharing (A→B→C) is structurally impossible and
  `can_share_forward` is inert. Per the Founder directive ("if full cascade is
  not possible, document the exact reason and add a safe denied state rather
  than pretending cascade exists"), 1289-A documents this honestly: ProofOfAccess
  `notes` carries `transitive_sharing_supported:false` +
  `cascade_revocation_supported:false` + `memory_portability_supported:false`;
  the existing ownership gate already fail-closes (`CAPSULES_NOT_OWNED`); and
  `revokeBridge` invalidates the direct grantee's sessions. **Backlog
  (forward-substrate, needs Founder authorization):** permission-lineage
  columns + cascade-revoke + memory portability/federation across apps/worlds
  + cross-entity/admin proof-of-access.
- **1290-A Economic substrate contracts — LANDED 2026-06-17.** NEW
  `apps/api/src/services/foundation/economic-policy.service.ts` +
  `POST /api/v1/foundation/economic/quote` — a mock-only **spend-policy
  evaluator** (`evaluateSpendPolicy`: ALLOW_MOCK / NEEDS_APPROVAL / DENIED;
  per-transaction cap + spend-limit + GATS amount tiers; non-human actors
  AI_AGENT/DEVICE/APPLICATION NEVER auto-originate per RULE 0 + ADR-0094 §8;
  dual-control ≥ $1000) + an **HTTP 402-style quote / payment-required
  handshake** (`PaymentRequiredQuote`: 200 ALLOWED_MOCK / 402 PAYMENT_REQUIRED
  / 403 DENIED) + the **economic-intent purpose vocabulary** (AGENT_TO_AGENT /
  DEVICE_TO_DEVICE / APP_TO_AGENT / SERVICE/TOOL/COMPUTE_USAGE /
  MEMORY_CAPSULE_READ/WRITE/SHARE / MEMORY_RETRIEVAL_QUERY /
  MARKETPLACE_PURCHASE / SUBSCRIPTION / METERED_ACCESS). Additive audit literal
  `ECONOMIC_INTENT_QUOTED`; metering hook `meter.economic-intent-quotes.v1`.
  **COMPOSES, does not duplicate, GATS (ADR-0094):** GATS owns the mock-intent
  lifecycle (propose/approve/revoke/settle, event-sourced, USDC_MOCK/MOCK_RAIL);
  the quote's `next_step` points to the GATS surface. **Mock-only by
  construction** — only `MOCK_ONLY` is executable; `PROVIDER_DEFERRED` /
  `FUTURE_ONCHAIN` / `DISABLED` are DENIED with honest "Founder decision
  required" reasons; `real_provider_enabled` hardcoded false; no real provider/
  funds/secrets/chain (ADR-0094 five inviolable bans preserved). No schema
  migration. **Backlog (Founder-gated):** persistent SpendPolicy /
  SpendingCapability / PaymentIntent models; real provider selection (separate
  RULE 21 research arc + Founder decision); marketplace seller offers.
- **1291-A Ambient device protocol — LANDED 2026-06-17.** Promotes the
  1287-A device-capture adapter into a reusable Foundation protocol. NEW
  `apps/api/src/services/foundation/ambient-device.service.ts` +
  `POST /api/v1/foundation/devices/ambient-packets` — pure `evaluateAmbientPacket`
  renders a governed `AmbientMemoryDisposition` (TRANSIENT_ONLY /
  WORK_LEDGER_ONLY / MEMORY_CAPSULE_PRIVATE / MEMORY_CAPSULE_ORG /
  REQUIRES_CONFIRMATION / BLOCKED) for an ambient device packet (glasses / lens
  / goggles / earbuds / desktop / mobile). Preserves every 1287-A prohibition:
  TEXT ONLY (raw frames/visual/biometric keys → BLOCKED), no face/biometric
  recognition, no location capture, consent required (no always-on), device-
  claimed identity NEVER trusted/stored. **Verifiable no-view/voice
  confirmation**: no_view_command / audio_confirmation → REQUIRES_CONFIRMATION
  unless `user_confirmed` with a real `confirmation_mode` (a recorded
  voice_confirmed flag alone is NOT enough — no fake confirmation).
  **Bystander-sensitive NEVER becomes org memory** (downgrades to PRIVATE or
  REQUIRES_CONFIRMATION). Org memory gated on visibility=org + confirmed +
  caller `memory_scope.can_write_capsules` (composes the 1288-B authority
  envelope). Additive audit literal `AMBIENT_PACKET_EVALUATED` (SAFE metadata
  only — never packet text / device_id / raw media). No schema migration.
  The disposition IS the policy contract; actual capsule-write-under-policy is
  forward-substrate (keeps it additive). **Backlog (Founder-gated):** wiring the
  capsule write per disposition; device entity identity model; additional device
  source types.
- **1292-A Marketplace substrate (TWO lanes) — LANDED 2026-06-17.** The
  governed exchange layer for the Oasis/Foundation vision: capabilities AND
  permissioned data access. NEW `apps/api/src/services/foundation/marketplace.service.ts`
  + `/api/v1/foundation/marketplace/*` routes, + additive Prisma tables
  `marketplace_listings` + `marketplace_data_packages` (Prisma-owned; no Ecto
  mirror).
  **Lane 1 — Capability marketplace:** `MarketplaceListing` (AGENT / SKILL /
  TOOL / DEVICE / APP / WORLD / CONNECTOR / SERVICE) + create / discover / get /
  `…/access` evaluator (can_discover/use/request/pay/requires_approval) composing
  the 1288-B authority envelope + 1290-A mock-only spend-policy. Tenant-scoped
  discovery (own + PUBLISHED in-org; cross-org invisible).
  **Lane 2 — Data marketplace:** `DATA_PACKAGE` listing type + `MarketplaceDataPackage`
  companion (a PERMISSIONED ACCESS PRODUCT over capsule scopes — the provider's
  DMW stays the governed container; never raw uncontrolled data). `DataAccessMode`
  enum (PROOF_ONLY / SAFE_PROJECTION / RETRIEVAL_QUERY / CAPSULE_REFERENCE /
  AGGREGATED_SIGNAL / DEPERSONALIZED_SIGNAL / MEMORY_CAPSULE_BUNDLE /
  LLM_CONTEXT_ACCESS / APP_WORLD_PERSONALIZATION). `DATA_USE_RIGHTS` closed vocab
  (APP_FEATURE / AGENT_RUNTIME / TOOL_RUNTIME / LLM_CONTEXT / ANALYTICS /
  PERSONALIZATION / EVALUATION / TRAINING / MODEL_IMPROVEMENT / RESEARCH /
  MARKETPLACE_SERVICE). `…/data-access` evaluator composes authority + package
  policy + 1290-A mock economics; **safe defaults** (raw capsule body NEVER
  returned; training / model-improvement / redistribution / commercial DENIED
  unless opted in; consent + opt-in + revocation + proof required by default).
  Honors clearance/jurisdiction/retention/revocation at COSMP read time
  (`raw_body_excluded:true`; actual content via COSMP + 1289-A ProofOfAccess
  only). Non-human buyers (AI_AGENT/DEVICE/APPLICATION) never auto-originate
  payment (NEEDS_APPROVAL). 4 added economic purposes (MEMORY_CAPSULE_EXPORT_PROOF
  / MEMORY_RETRIEVAL_QUERY / MEMORY_ENRICHMENT / APP_MEMORY_ACCESS /
  WORLD_MEMORY_ACCESS). Additive audit literals MARKETPLACE_LISTING_CREATED /
  MARKETPLACE_ACCESS_EVALUATED / MARKETPLACE_DATA_ACCESS_EVALUATED (SAFE metadata
  only). Mock-only economics throughout (no real provider/funds/secrets/chain).
  **Backlog (Founder-gated):** wiring an actual COSMP-governed data grant +
  ProofOfAccess delivery per data-access decision; capsule_id_allowlist (raw-ref)
  variant; consent/opt-in record persistence; cross-org marketplace discovery;
  bystander-block enforcement at listing creation; CT marketplace UI.
- **1293-A GOVSEC / observability / metering / production hardening — LANDED
  2026-06-17.** NEW `apps/api/src/services/foundation/observability.service.ts`
  + `GET /api/v1/foundation/observability/snapshot` +
  `POST /api/v1/foundation/observability/meter-check`. (1) `buildObservabilityEnvelope`
  — a SAFE, correlation-bearing structured record (correlation_id / runtime /
  action / outcome / latency / policy_decision + entity/org ID refs; never
  email/display_name/content). (2) `evaluateMeterThreshold` — the metering-
  ENFORCEMENT evaluator the substrate lacked (ALLOW / WARN ≥80% / DENY ≥limit),
  turning the tracking-only 1290-A/B6-α meters into a governable gate. (3)
  `getObservabilitySnapshotForCaller` (SAFE own-org meter snapshot) +
  `checkMeterThresholdForCaller` (emits `USAGE_METER_THRESHOLD_REACHED` on
  WARN/DENY). Additive audit literal `USAGE_METER_THRESHOLD_REACHED`. No schema
  migration. **Honest scope (RULE 13, not theater):** the evaluator is OPT-IN
  (not silently wired to auto-deny existing flows — live per-meter enforcement
  still needs a Founder pricing decision per ADR-0093); a full OpenTelemetry/
  Prometheus export pipeline (GOVSEC.6) + an automated key-rotation service
  (GOVSEC.9) are genuine multi-phase efforts documented as forward-substrate,
  not faked. BEAM already has its own telemetry (sub-phase 11). Key-rotation
  posture: frozen `CRYPTO_CONFIG` + boot-validation remain the anchor.
  **Backlog (Founder-gated):** OTel/Prometheus exporter; cross-runtime trace
  propagation; automated key rotation; wiring meter enforcement into specific
  flows once pricing lands; SLO definitions/alerting.

### Phase 1294-A — Data Marketplace Grants + Consent Ledger + COSMP Access Delivery — LANDED 2026-06-17

Makes the 1292-A data marketplace actionable: turns an approved data-access
decision into a **durable, governed, revocable** access right — without faking
raw data sales or real settlement. NEW additive Prisma tables
`marketplace_data_grants` + `marketplace_data_consents` + `DataSensitivityClass`
+ `MarketplaceDataGrantStatus` enums + `sensitivity_class`/`sensitive_categories`
on `marketplace_data_packages`. Routes:
`POST /foundation/marketplace/listings/:id/data-grants` (create),
`POST /foundation/marketplace/data-grants/:id/revoke`,
`GET /foundation/marketplace/data-grants`,
`GET …/data-grants/:id`. Additive audit literals
MARKETPLACE_DATA_CONSENT_RECORDED / _GRANT_EVALUATED / _GRANT_CREATED /
_GRANT_REVOKED.
- **Grant lifecycle:** re-runs the governed access evaluation (authority +
  allowed-use + **sensitivity gate**) → requires explicit `consent_confirmed`
  (409 CONSENT_REQUIRED) + `opt_in_confirmed` (409 OPT_IN_REQUIRED) → records a
  durable `MarketplaceDataConsent` + an ACTIVE `MarketplaceDataGrant`. Revoke →
  REVOKED (idempotent); revoked/expired grant is not usable. No cascade claimed
  (no lineage; 1289-A).
- **Proof (honest):** ProofOfAccess is per-capsule, so the grant carries
  `proof_required` + `proof_delivery: "PER_CAPSULE_AT_READ_TIME"` — **no faked
  package-level proof**; content is delivered only via COSMP + ProofOfAccess at
  actual read time, honoring clearance/jurisdiction/retention/revocation.
  `raw_body_excluded: true` everywhere.
- **Economics:** mock-only via 1290-A spend-policy (`economic_decision` recorded;
  non-human buyers → NEEDS_APPROVAL; never real settlement).
- **Personal DMW first-class:** `provider_org_entity_id` + `buyer_org_entity_id`
  are NULLABLE; an individual (self-as-org → null) creates personal data
  packages + grants; personal packages require consent/opt-in by default; a
  different user cannot see/grant a personal listing (invisible without grant).
- **Sensitivity / health:** `HIGH_SENSITIVITY` or any policy-gated category
  (HEALTH / MEDICAL / BIOMETRIC / CHILDREN) → grant **DENIED**
  (`high-sensitivity-requires-dedicated-policy-gate`) until a dedicated policy
  gate is authorized. Extensible (`sensitive_categories` open label list) so new
  high-sensitivity kinds are governable without a schema change.
- Defaults: raw denied · training/model-improvement/redistribution/commercial
  denied unless opted in · revocable · proof required · safe projection
  preferred.
- Tests (+27): integration foundation-data-grants (10, incl. personal-DMW +
  health-sensitivity) + foundation-marketplace (15 regression) + audit lock (2).
  Typecheck 0; full unit 2419/2420 (1 = local-.env connector-oauth artifact).
- **Backlog (Founder-gated):** actual COSMP capsule-read delivery via the grant;
  provider-initiated personal grants to a named buyer; dedicated high-sensitivity
  /health/children/biometric policy gates; consent for third-party data subjects;
  cross-org discovery; CT UI; real settlement.

### Phase 1299-A — Org-Compliance Reviewer Delegation — LANDED 2026-06-18

Widens high-sensitivity review authority from "only the package provider entity"
(1297-A) to a governed delegation model — without ever granting new access
rights or weakening any prior gate. **No schema change** (reuses
`EntityMembership.is_admin` / `role_title` / `is_active`, `TAR.can_admin_org`,
provider-org membership) → no `prisma db push`.

- **NEW** `apps/api/src/services/foundation/high-sensitivity-reviewer-policy.ts`
  — PURE `evaluateHighSensitivityReviewerEligibility(facts)` over RESOLVED facts
  (the service owns all I/O). Returns `{ eligible, reviewer_scope (OWNER |
  PERSONAL_OWNER | ORG_ADMIN | COMPLIANCE | GOVERNANCE | SUPERVISOR | DENIED),
  reason_codes (closed vocab), approval_limitations (pinned false), audit_required }`.
- **Decision tree (RULE 0 first):** non-human (AI_AGENT/DEVICE/APPLICATION) →
  DENY `REVIEWER_IS_NON_HUMAN`; CHILDREN → DENY `CHILDREN_DATA_REVIEW_NOT_SUPPORTED`;
  provider entity → OWNER / PERSONAL_OWNER; a buyer (≠ provider) → DENY
  `REVIEWER_IS_BUYER` (no self-serve, even if org admin); personal package +
  non-owner → DENY `REVIEWER_NOT_PROVIDER_OWNER`; org package + reviewer not in
  provider org → DENY `REVIEWER_CROSS_TENANT`; inactive provider-org membership →
  `REVIEWER_MEMBERSHIP_INACTIVE`; provider-org admin membership / admin role →
  ORG_ADMIN; compliance/privacy/legal/DPO → COMPLIANCE; data-governance/steward →
  GOVERNANCE; supervisory → SUPERVISOR; else → DENY `REVIEWER_NOT_ORG_AUTHORIZED`.
- **Confused-deputy guard (Founder-directed mid-phase):** reviewer role/admin
  facts are resolved STRICTLY from the provider-org membership
  (`child_id = reviewer, parent_id = provider_org`) — a reviewer's admin role in
  ANY OTHER org never authorizes here. The loader's org-delegated visibility is
  likewise scoped to an ACTIVE provider-org membership (cross-tenant → invisible
  `REVIEW_NOT_FOUND`).
- **RULE 13 surface — global TAR `can_admin_org`:** TAR is a per-entity (global)
  flag, so it can be true because the entity administers a *different* org.
  It is therefore treated as **corroborating only** (recorded in audit) and does
  NOT independently elevate a plain provider-org member — admin elevation
  requires a provider-org-attributable signal (`membership.is_admin` or an admin
  role title). This is the fail-closed reading of the Founder's "membership PLUS
  the TAR signal" (literal) vs "authority from the provider org, not any other
  org" (prose); independent TAR elevation for provider-org members is a one-line
  Founder-authorized change if desired.
- **Revoke preserves shipped buyer stop-use:** provider OR buyer OR an
  org-authorized reviewer may revoke (1297-A buyer stop-use intact).
- **Delegation grants NO new rights:** raw body / training / model-improvement /
  redistribution / commercial stay pinned false; the read path is unchanged (only
  the approved safe mode; no raw content). Role-keyword matching is substring-based
  (e.g. "Lead"/"Manager" → SUPERVISOR), consistent with the Founder-authorized
  supervisory-reviewer scope.
- **Audit literal (additive, 1):** `HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED`
  (SUCCESS on eligible, DENIED on every ineligible attempt; safe labels +
  candidate_reviewer_entity_id + reviewer_scope + reason_codes; never raw content).
- **DB-guard compliance (1297-B):** no schema push performed. Never raw content;
  mock economics unchanged; no AI/Python/BEAM/device/app self-authorization.
- **Tests:** unit `foundation-high-sensitivity-reviewer-policy` (16, incl. both
  confused-deputy channels) + audit lock (2) + integration
  `foundation-reviewer-delegation` (14: PENDING opens, buyer/AI/unauthorized/
  cross-tenant/inactive/global-TAR-plain-member all denied, org admin + compliance
  approve, read no-raw, buyer + org revoke, personal-DMW non-owner denied, audited).
  Typecheck 0; full unit tier 2492/2493 (1 known connector-oauth `.env` artifact);
  integration `foundation-reviewer-delegation` 14/14 + `foundation-high-sensitivity-review`
  regression 13/13. Two 1297-A assertions refined to the new closed reviewer codes.
- **Backlog (Founder-gated):** real per-capsule content read; CT UI; real
  settlement; cross-org discovery.

### Phase 1298-A — Retention-Policy Enforcement Engine — LANDED 2026-06-17

Makes retention real and enforceable: access can no longer live longer than
policy allows. **No schema change** (grant + review statuses already include
`EXPIRED`; consent enforced lazily) → no `prisma db push`.

- **NEW** `apps/api/src/services/foundation/retention-policy.service.ts` — pure
  `evaluateRetentionPolicy` / `computeExpiryFromRetentionPolicy` /
  `normalizeRetentionPolicy` (closed `RETENTION_POLICY_KINDS` vocab) +
  `FoundationRetentionService.sweepExpiredMarketplaceAccess`.
- **Two-layer enforcement.** Layer 1 (lazy at use): grant creation derives +
  validates a finite expiry via the evaluator; grant read fails closed on
  expired grant/consent/review, lazily marks the grant `EXPIRED`, and audits
  (`MARKETPLACE_DATA_GRANT_EXPIRED` / `MARKETPLACE_DATA_CONSENT_EXPIRED`, reason
  `RETENTION_EXPIRED`). Layer 2 (sweep): `sweepExpiredMarketplaceAccess` marks
  expired `ACTIVE` grants + `APPROVED` reviews `EXPIRED`, audits expired
  consents, emits `RETENTION_SWEEP_COMPLETED`; wired as an **hourly cron tick**
  in the existing scheduler (NO-OP in test, audited under
  `SYSTEM_PRINCIPALS.SCHEDULER`); never deletes rows.
- **Retention rules.** High-sensitivity is **always finite** — never
  `UNTIL_REVOKED`; missing retention **default-applies** a finite 30d window
  (audited `RETENTION_DEFAULT_APPLIED`, so 1296-A's grantable HEALTH stays
  grantable); explicit `UNTIL_REVOKED` or an unrecognized retention string on
  high-sensitivity is rejected; window capped at 90d
  (`RETENTION_TOO_LONG_FOR_SENSITIVITY`); a reviewed grant's expiry caps to (and
  never outlives) the governing review. Standard/low sensitivity may be
  until-revoked (null). Review approval now enforces the same 90d ceiling.
  Consent expiry capped to the grant's.
- **Audit literals (additive, 4):** `RETENTION_POLICY_EVALUATED`,
  `MARKETPLACE_DATA_GRANT_EXPIRED`, `MARKETPLACE_DATA_CONSENT_EXPIRED`,
  `RETENTION_SWEEP_COMPLETED`.
- **DB-guard compliance (1297-B):** no schema push performed; if one were
  needed it would go through `npm run db:push:test`. Never raw content; mock
  economics unchanged; AI/device/app cannot extend retention.
- **Tests:** unit `foundation-retention-policy` (13) + audit lock (4) +
  integration `foundation-retention` (11: default finite HS expiry, standard
  until-revoked, 7-day window, ONE_YEAR-too-long deny, expired grant/consent
  fail-closed + audit, sweep expires grants + reviews + emits sweep-complete,
  safe read before expiry, AI retention enforced, RETENTION_POLICY_EVALUATED).
  Typecheck 0; unit 2475/2476 (1 known connector-oauth `.env` artifact);
  integration regression 60/60. No route added (system sweep runs via the
  scheduler tick; an admin route is deferred).
- **Backlog (Founder-gated):** real per-capsule content read; CT UI; real
  settlement; cross-org discovery; org-compliance reviewer delegation.

### Phase 1297-B — Production Schema-Push Incident Closeout + DB Guard Hardening — LANDED 2026-06-17

Production-safety hardening only (no product-feature changes). Closes out the
Phase 1297-A incident where a schema push reached production.

- **Root cause:** a bare `npx prisma db push` was run with only `DATABASE_URL`
  set inline. The datasource declares `directUrl = env("DIRECT_URL")`
  (`schema.prisma:15`) and `prisma db push` connects via **directUrl**; Prisma
  auto-loaded `.env` (production creds), so the additive DDL applied to the
  production Supabase DB. The canonical wrapper (`npm run db:push:test`) was
  bypassed, and the pre-commit db-push guard only inspects **staged files** — it
  cannot see an interactively-typed command.
- **Impact:** **additive but unauthorized** — `CREATE TABLE high_sensitivity_reviews`
  + `CREATE TYPE HighSensitivityReviewStatus`, no drops (`prisma db push`
  reported "in sync"; everything else was already in sync from prior merges).
  Empty table, identical to the deploy-time DDL this work requires. Assessed
  from the schema diff, **not** a production read: a direct prod query was
  correctly blocked by auto-mode and was not performed. **No production
  inspection or rollback was performed** (would require explicit Founder
  authorization). This is NOT called harmless — it was a process violation.
- **Hardening (fail-closed, ambient-env):** NEW `scripts/prisma-db-push-guard.sh`
  validates **both** `DATABASE_URL` and `DIRECT_URL` before any push — both must
  be set and `localhost`/`127.0.0.1`; cloud/pooler hosts (supabase, pooler,
  amazonaws, rds, neon, render, azure) are rejected; destructive flags
  (`--accept-data-loss`/`--force-reset`) are refused; only redacted host
  summaries are printed; **no production escape path** (prod goes through the
  deploy pipeline per ADR-0025). Supports `--check` (validate-only).
- **Routing:** root `db:push` and the `@niov/database` workspace `db:push` now
  invoke the guard (bare `prisma db push` removed from both). The wrapper
  `scripts/prisma-db-push-test.sh` pins `.env.test` then delegates to the guard
  (single validation core). CI's `npm run db:push` (unit + integration + Elixir
  jobs) validates its localhost job-env and passes; a prod-env push is blocked.
  The guard is allowlisted in `.husky/pre-commit`.
- **.env.save:** added to `.gitignore` (`.env.save` / `.env.*.save` / `*.env.save`);
  it was already untracked and was never committed.
- **Tests:** `tests/unit/db-push-guard.test.ts` (12, CI-enforced) — allow
  localhost+localhost; deny the literal incident (DIRECT_URL unset); deny prod
  DIRECT_URL with localhost DATABASE_URL; deny pooler host; deny unset
  DATABASE_URL; refuse destructive flag; redaction; both `db:push` scripts route
  through the guard; no `scripts/*.sh` bare-pushes outside the allowlist;
  `.env.save` git-ignored. Wrapper smoke test 3/3. Exact CI path
  (`npm run db:push`, both localhost) exercised locally → push succeeds.
- **Operational rule going forward:** *Prisma `db push` must only be run through
  the guarded scripts that pin/validate BOTH `DATABASE_URL` and `DIRECT_URL`
  (`npm run db:push:test`, or `npm run db:push` which now routes through the
  guard). A bare `npx prisma db push` is forbidden.*
- **Residual (honest):** a hand-typed bare `npx prisma db push` outside the npm
  scripts cannot be intercepted by tooling — the class is **reduced, not
  eliminated**; it is documented as forbidden and the pre-commit guard catches it
  if ever committed.
- **ADR note (RULE 20):** ADR-0025 (Schema-Push-Target Discipline) was **not
  edited** — RULE/ADR changes are Founder-only. A proposed ADR-0025 amendment
  (add the ambient-env guard + mandatory-DIRECT_URL + cloud-denylist to the
  canonical discipline) is available for Founder review but is not applied.

### Phase 1297-A — High-Sensitivity Review Workflow Engine — LANDED 2026-06-17

Turns the 1296-A `REQUIRES_REVIEW` decision (previously a dead end) into a
durable, governed, scope-bound, EXPIRING human-review workflow. NEW model
`HighSensitivityReview` + `HighSensitivityReviewStatus` (PENDING_REVIEW /
APPROVED / DENIED / EXPIRED / REVOKED), Prisma-owned (no Ecto mirror), all policy
evidence typed (sensitivity_class, sensitive_categories, policy_decision,
policy_reason_codes, approved_access_modes + pinned-false invariant columns).
NEW `apps/api/src/services/foundation/high-sensitivity-review.service.ts`
(create / get / list / approve / deny / revoke + shared
`resolveReviewDecisionForGrantRead`). 6 routes under
`/api/v1/foundation/high-sensitivity/reviews`. 5 additive audit literals
(`HIGH_SENSITIVITY_REVIEW_CREATED/APPROVED/DENIED/REVOKED/EXPIRED`).
- **Approvable-modes fix:** the 1296-A evaluator returns
  `allowed_access_modes:[]` for every REQUIRES_REVIEW case, so a new pure helper
  `highSensitivityReviewApprovableModes` (co-located in the policy module) defines
  the category-aware set a human may authorize (MEDICAL→PROOF_ONLY; BIOMETRIC/
  BYSTANDER→proof+aggregate/deperson; HEALTH/LOCATION→up to safe projection;
  CHILDREN/unknown/no-consent/training→∅). Raw never; elevated rights never.
- **Shared resolver** consulted at BOTH grant creation and read: an APPROVED,
  live (not expired/revoked) review upgrades REQUIRES_REVIEW into an effective
  ALLOW for the approved safe mode; grant is downgraded to that mode; read
  re-checks liveness every time (revoke/expire block instantly). Read now honors
  the **grant's** access_mode, not the package's (latent widening bug fixed).
- **Reviewer eligibility:** human-class only (AI_AGENT/DEVICE/APPLICATION →
  `NON_HUMAN_REVIEWER_FORBIDDEN`); must be the package provider (buyer
  self-approval structurally blocked); personal-DMW owner self-review allowed
  only for PROOF_ONLY, audited. CHILDREN recorded DENIED, never approvable.
  Never raw content; cross-tenant reviews invisible.
- Tests (+~36): unit foundation-high-sensitivity-review (approvable modes +
  gate-reason set) + audit lock (5 literals) + integration
  foundation-high-sensitivity-review (13 cases: lifecycle, eligibility,
  no-broaden, revoke/expire-blocks-read, personal self-review, cross-tenant,
  audit). Typecheck 0; full unit 2448/2449 (1 = known connector-oauth `.env`
  artifact); integration regression 54/54 (review+data-read+data-grants+
  marketplace+proof).
- **⚠ Production-safety incident (surfaced per RULE 13):** the initial schema
  push used a raw `npx prisma db push` with only `DATABASE_URL` set inline; the
  datasource also reads `directUrl = env("DIRECT_URL")`, which Prisma loaded from
  `.env` → the migration ran against **production Supabase** instead of the local
  test DB. The change was purely additive (`CREATE TABLE high_sensitivity_reviews`
  + `CREATE TYPE` — no drops, table empty, identical to the deploy-time DDL this
  PR requires), so no data was lost. The canonical guarded wrapper
  `npm run db:push:test` (pins BOTH `DATABASE_URL` + `DIRECT_URL` to localhost,
  fail-closed) was then used for the local push and is the discipline going
  forward; raw `prisma db push` for the test DB is the trap (ADR-0025 /
  D-2D-D10-4). Flagged for Founder awareness.
- **Backlog (Founder-gated):** real decrypted content read; CT review/marketplace
  UI; retention-enforcement engine; org-compliance reviewer delegation;
  cross-org discovery; real settlement.

### Phase 1296-A — High-Sensitivity Policy Gates — LANDED 2026-06-17

Replaces the 1294-A/1295-A blanket high-sensitivity DENY with a dedicated graded
policy gate. NEW pure module
`apps/api/src/services/foundation/high-sensitivity-policy.ts`
(`evaluateHighSensitivityAccess` → ALLOW_SAFE_PROJECTION / ALLOW_PROOF_ONLY /
ALLOW_AGGREGATED / REQUIRES_REVIEW / DENY + closed-vocab reason codes), wired
into `evaluateDataAccessForCaller` (grant eval/creation) + `readDataGrantForCaller`
(read). No schema migration. Additive audit literal
`HIGH_SENSITIVITY_POLICY_EVALUATED`.
- **Invariants:** `raw_body_allowed:false` always; `proof_required:true` always;
  training / model-improvement / redistribution / commercial **force-denied**;
  consent + opt-in mandatory; training/model-improvement intents denied outright.
- **Category behavior:** CHILDREN → DENY; MEDICAL + BIOMETRIC → ALLOW_PROOF_ONLY
  if mode PROOF_ONLY else REQUIRES_REVIEW; HEALTH → ALLOW_SAFE_PROJECTION (proof
  + safe projection) under strict controls; BYSTANDER → ALLOW_AGGREGATED /
  proof-only / review; LOCATION → safe projection only with retention else
  review; HIGH_SENSITIVITY with no recognized category → REQUIRES_REVIEW
  (fail-safe). Worst category wins; unknown kinds → review (never silent-allow).
- **Behavior change (RULE 13):** HEALTH safe-projection is now grantable +
  readable under strict controls (was blanket-denied); the two existing tests
  updated (data-grants MEDICAL keeps denial with new
  `MEDICAL_DATA_REQUIRES_DEDICATED_REVIEW` reason + adds HEALTH-allowed; data-read
  defense switched to CHILDREN). Still **never raw content**.
- Personal DMW high-sensitivity follows the same gates; AI/DEVICE/APPLICATION
  cannot bypass. Tests (+18): unit foundation-high-sensitivity-policy + audit lock
  + integration HEALTH-allowed / MEDICAL-review / CHILDREN-deny at grant + read.
  Typecheck 0; full unit 2433/2434; integration regression 41/41.
- **Backlog (Founder-gated):** dedicated children/biometric/medical review
  programs; real decrypted content read; retention-enforcement engine; CT UI;
  real settlement; cross-org discovery.

### Phase 1295-A — COSMP Data-Read Delivery for Marketplace Grants — LANDED 2026-06-17

Makes an ACTIVE data grant usable via a COSMP-governed **safe-projection** read
path — never raw data export, never a COSMP bypass. NEW
`apps/api/src/services/foundation/marketplace-data-delivery.service.ts` +
`POST /foundation/marketplace/data-grants/:id/read`. No schema migration.
Additive audit literal `MARKETPLACE_DATA_GRANT_READ_EVALUATED`.
- **Authorization basis = the grant** (a marketplace buyer holds no Permission
  on the provider's capsules; the grant authorizes safe-projection access).
  Validates buyer-only + enumeration-safe; grant ACTIVE + not expired; consent
  active; package not HIGH_SENSITIVITY/policy-gated; intended_use still allowed;
  requested mode == grant mode or PROOF_ONLY (narrower).
- **Safe projection only** — provider-wallet capsules in `capsule_type_allowlist`,
  `deleted_at null`, `clearance_required ≤ buyer ceiling`, EXCLUDING
  ai_access_blocked + requires_validation (non-owner buyer) + jurisdiction
  mismatch; returns capsule_type + (renamed) `safe_summary` where the mode
  permits + sensitivity + timestamps + provenance + per-item grant-proof
  attestation. NEVER raw body / payload_content / storage_location /
  content_hash / embedding (`raw_body_excluded:true`). Modes: PROOF_ONLY (no
  summary) / SAFE_PROJECTION / MEMORY_CAPSULE_BUNDLE / CAPSULE_REFERENCE /
  RETRIEVAL_QUERY (deterministic scoped filter; Python rerank deferred).
- **Honest proof:** per-item `result: "MARKETPLACE_GRANT_AUTHORIZED"` +
  `proof_delivery: "PER_CAPSULE_AT_READ_TIME"` + `chain_verified` — NOT a faked
  COSMP Permission proof; decrypted content still needs an explicit COSMP
  permission (forward-substrate).
- Personal DMW reads work (null org); AI/DEVICE/APPLICATION cannot bypass
  (ai_access_blocked/requires_validation capsules excluded for all marketplace
  buyers). Tests (+11): integration foundation-data-read (8) + audit lock (2);
  typecheck 0; full unit 2421/2422; marketplace+grants+proof regression 30/30.
- **Backlog (Founder-gated):** real per-capsule COSMP Permission read of
  decrypted content; Python rerank for RETRIEVAL_QUERY; high-sensitivity gates
  (1296-A); CT UI; real settlement; cross-org discovery.

### Foundation-Scale Arc — sequence complete (1288-B → 1293-A)

All six authorized phases LANDED + CI-green + merged + live-proven:
1288-B Entity & Authority Envelope · 1289-A COSMP/DMW/Memory-Capsule hardening
(ProofOfAccess + APPLICATION gate) · 1290-A Economic substrate (spend policy +
HTTP 402 quote, mock-only) · 1291-A Ambient device protocol · 1292-A Marketplace
substrate (capability + governed data lanes, mock-only) · 1293-A Observability +
metering enforcement. Foundation is the platform; Otzar is the proving app.
Everything mock-only for economics (no real provider/funds/secrets/chain) and
additive (only one schema migration: the 1292-A marketplace tables). The ambient
AI brain + Foundation-scale substrate remain forming — these phases hardened the
governed primitives. **Phase-global status NOT auto-flipped** (closure of this
arc is scoped to these six phases; broader Foundation completion is a separate
Founder decision).

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
- **Production schema push attempt (unattended run)** — ABORTED
  SAFELY at preflight. The Founder-approved push could not proceed:
  both production DATABASE_URL and DIRECT_URL fail authentication
  (Prisma P1000 — credentials need rotation). No diff ran; nothing
  was pushed; nothing was harmed. Recovery procedure + the complete
  consolidated Founder input package:
  docs/operations/founder-input-needed.md (NEW).
- **Phase 1249** Voice-seat provider registry — DONE. The three
  recommended voice seats (per the research-verified provider
  recommendation) join the connector registry with honest
  BLOCKED_BY_CREDENTIAL status, setup steps, and demo fallbacks:
  ELEVENLABS_TTS, ASSEMBLYAI_STT, OPENAI_REALTIME ('speech never
  bypasses approval' stated in steps). This completes the
  credential enumeration — every key the Founder needs now appears
  in the readiness endpoint and Connector Health. NO schema
  changes.
- **Enterprise Reality Hardening Pass (2026-06-11)** — DONE.
  Three parallel read-only audits (CT UI copy/fragility, Foundation
  governance/secrets, docs truth-drift) triaged to 3 real findings,
  all fixed and merged: readiness-matrix table-count drift 13 → 15
  (foundation #352); protocol name removed from employee-ambient CT
  copy (footer badge / Login / nav — 'COSMP' now in the employee ban
  list; buyer-facing Playground patent demo deliberately keeps it) +
  VoiceCaptures load failures now render truthful "Couldn't load"
  copy instead of the empty state + CT lint restored to 0/0
  (otzar-control-tower #75, 775/775 green, Otzar.app rebuilt and
  shipped-JS verified). Foundation governance audit: 0 real issues
  (all 51 routes auth-gated via the three canonical patterns; raw SQL
  parameterized; no response leaks; no secrets in docs). Two stale
  local branches removed. 6 Dependabot PRs + 9 GitHub vulnerability
  alerts recorded for Founder review in founder-input-needed.md §4
  (external PRs are not merged unattended). Prod schema push remains
  pending invalid credentials per §0 — not retried.
- **Phase 1251** Otzar Ambient Work OS / Edge Presence (2026-06-11)
  — DONE (otzar-control-tower #77; CT-only code + this docs pointer).
  Founder Design Law implemented: presence store with the nine-state
  edge language (idle/listening/thinking/recommendation/approval/
  success/blocked/quiet/failure), AmbientEdgeGlow (pointer-safe,
  reduced-motion-safe state halo), the orb (state-aware collapsed
  dock), AmbientNotificationStack (≤2 truthful plain-language cards),
  AdminCommandLayer (⌘K plain-language navigation), Dandelion
  root-first propagation copy, governed shared-screen story on
  Observe. Canonical law:
  otzar-control-tower/docs/product/otzar-ambient-work-os-design-law.md
  (pointer: docs/otzar/AMBIENT_WORK_OS_DESIGN_LAW_POINTER.md). Native
  Tauri edge window (transparent / always-on-top / tray / global
  shortcut) documented as the follow-up slice. 792/792 CT tests;
  Otzar.app rebuilt + shipped-JS verified.
- **Phase 1250** Governed Transaction Readiness (2026-06-11) — DONE.
  ZERO schema changes; runs on the CURRENT production schema. NEW
  governed-transaction.service.ts + otzar-settlement.routes.ts +
  5 append-only TRANSACTION_* audit literals: DMW actors (humans,
  AI Twins, AI Employees, devices, agents) propose MOCK transaction
  intents; the pure policy gate tiers by amount (micro ≤ $1 may
  auto-approve for humans only when the org opts in; dual control =
  two distinct human approvers ≥ $1,000) and actor class (AI /
  device / machine NEVER auto-approve; regulators and external
  collaborators cannot transact; suspended actors blocked at propose
  AND settle — the AI-Employee kill switch is exercised end-to-end);
  the append-only audit chain IS the intent store (event-sourced,
  immutable per ADR-0002). MOCK_RAIL emits clearly-labeled proofs;
  CIRCLE_GATEWAY / COINBASE_BASE intents are FORBIDDEN at the policy
  gate even with credentials present (test-locked, twice). Regulator
  share packages surface transaction evidence redacted (event types
  only — no amounts, no counterparties). Capability truth: governance
  substrate PROD + mock rail DEMO_ONLY + Circle/Base
  BLOCKED_BY_CREDENTIALS unchanged. Demo walk extended to 29 steps
  (step 29 = AI Employee proposes → human approves → mock proof →
  3 audit events). 10 unit + 9 integration tests green. ADR-0094's
  five bans intact: no real USDC, no CDP, no Circle, no Base, no
  x402; real funds NOT_AUTHORIZED; private keys NOT_HANDLED.
- **Phase 1248** Mock/dev settlement rail — DONE (the final
  authorized prep deliverable). settlement-readiness.service.ts
  implements the ADR-0094 rail-adapter seam: MOCK_RAIL produces
  clearly-labeled mock receipts (is_mock: true; 'no funds moved')
  so the governed pipeline can be built and demoed safely; real
  rails surface honest BLOCKED_BY_CREDENTIALS, and even with
  credentials present they flip only to NOT_AUTHORIZED — explicit
  Founder authorization stays required (test-locked). 4 unit tests
  green; NO schema changes; NO route exposure yet (service-tier
  seam only; routes land with the authorized implementation phase).
- **Phase 1247** Circle/Base settlement architecture preparation —
  DONE (prep only). ADR-0094 (Governed Agent Transaction Standard)
  is the canonical architecture: rails reference Foundation's
  cryptographically-chained authorization evidence; Foundation never
  moves funds. Phase 1247 registered the CIRCLE_GATEWAY +
  COINBASE_BASE adapters (SETTLEMENT category; BLOCKED_BY_CREDENTIAL;
  can_write false until wiring is explicitly authorized; approval
  gate stated in every setup step) and aligned CAPABILITY_TRUTH +
  the readiness matrix. NO funds, NO keys, NO transactions, NO
  schema changes. Implementation remains gated on explicit Founder
  authorization.
- **Phase 1246** Final readiness truth pass — DONE. The Circle/Base
  gate condition is MET: every non-blockchain capability is PROD,
  PROD-READY pending APPROVE PROD SCHEMA PUSH (25 additive tables — 15 product + 10 Work Comms),
  or honestly credential/app-review blocked. Truth is
  triple-mirrored: the readiness matrix (human), CAPABILITY_TRUTH in
  handoff-readiness.service.ts (machine, test-locked), and the
  executable 29-step demo walk (1/1 green). Honest residual
  improvements recorded (extractor schema validation, ADR-0030 gRPC
  migration, BEAM CT diagnostics, Tesseract dependency arc) — all
  enhancements, none handoff gaps. Circle/Base/USDC remains gated on
  explicit Founder authorization.
- **Phase 1245** Final enterprise demo path — DONE (docs + code).
  The canonical 29-step handoff demo is recorded in
  enterprise-handoff-runbook.md §18 AND executable:
  tests/integration/enterprise-demo-walk.test.ts walks the
  credential-free chain end-to-end in ONE deterministic scenario —
  org/admin/employee setup, the 11-step checklist, the readiness
  aggregate's honest schema/connector truth, My Day fixture
  ranking, calendar-driven auto-quiet, Dandelion growth + the
  consent gate (zero capsules until approval), AI Employee
  provisioning with boundaries, Observe extraction → workspace
  ledger import (owners UNRESOLVED until humans confirm),
  compliance share package → regulator redacted read → revocation
  cutoff, ZERO external writes across the entire walk, and audit
  coverage. 1/1 green.
- **Phase 1244** Ambient shell completion (connector guidance) —
  DONE. otzar-control-tower #74: admin-gated 'How to connect' on
  Connector Health consuming the Phase 1243 hardened registry —
  friendly status badges, 'Demo works today' flags, numbered
  plain-English setup steps, honest missing-env names (admin
  diagnostics tier). Hidden for non-admins (test-locked);
  non-blocking on failure. Suite 9 → 11; full CT 771/771;
  Otzar.app rebuilt 07:43 with surfaces verified.
- **Phase 1243** Connector setup/status hardening — DONE
  (Foundation). All 11 registry adapters now declare plain-English
  `setup_steps` (guidance only; the no-secrets pattern is
  test-locked, and every write-capable provider must state the
  approval gate in its steps — also test-locked) plus a
  `demo_mode_available` flag. The fields flow through the existing
  connector-adapter-status route and the Phase 1242 readiness
  aggregate automatically. Registry suite 6 → 8. NO schema changes.
  CT setup-guidance surfacing rides the Phase 1244 shell pass.
- **Phase 1242** Production onboarding / enterprise handoff polish —
  Foundation half DONE. `GET /api/v1/otzar/production-readiness`
  (admin-scoped): the single truthful handoff aggregate — Phase 1230
  checklist progress, 6 honest runtime rows, the full connector
  registry with credential/app-review blockers (env NAMES only —
  no-secrets boundary test-proven with a canary), the pending
  15-table additive schema diff + the explicit APPROVE PROD SCHEMA
  PUSH phrase, demo/prod separation, audit/compliance status, and
  the closed-vocab capability truth table (CAPABILITY_TRUTH — the
  code-maintained mirror of this matrix). NEW
  docs/operations/enterprise-handoff-runbook.md: the 17-step
  operator script (demo start, tests, rebuild, seeding, verify
  flows, credential/schema gates, what NOT to claim). 5 integration
  tests green; NO schema changes. CT half landed: otzar-control-tower
  #73 adds the 'What's ready vs blocked' section to Production
  Readiness — calm headline, the amber APPROVE PROD SCHEMA PUSH
  callout, four friendly capability buckets (raw enums never shown),
  honest runtime notes, non-blocking on failure. handoff suite 3/3;
  full CT suite 769/769; Otzar.app rebuilt 07:22 and shipped JS
  verified.
- **Phase 1241** BEAM production-path integration — DONE (first
  consumer). The Phase-6 BEAM Collaboration Supervisor wrapper
  (previously zero consumers) joins the live HTTP surface:
  `GET /api/v1/otzar/beam/status` reports honest closed-vocab
  runtime status (DISABLED when the flag is off / READY_NOT_ACTIVE
  when enabled without a URL / ACTIVE on healthy probe /
  UNREACHABLE on failure — never throws), and
  `GET /api/v1/otzar/collaboration/:id/supervised-status` serves
  participant-scoped supervised status — the live BEAM per-
  collaboration process state when reachable, a deterministic
  Foundation projection otherwise. Observation-only by design: BEAM
  is never a policy authority, reads never mutate (test-proven),
  non-participants get no existence oracle. Activation is deploy
  config (BEAM_RUNTIME_ENABLED + BEAM_RUNTIME_URL → the
  collaboration_supervisor OTP app's HTTP listener). 5 integration
  tests green; NO schema changes. Expansion path: ADR-0030 COSMP
  gRPC migration remains the next BEAM production step.
- **Phase 1240** AI Employee boundaries + DMW formalization — DONE.
  AI Employees are the ADR-0046 Enterprise AI Agent context made
  first-class: `POST /api/v1/otzar/ai-employees` (org admin) creates
  AI_AGENT + EXPLICIT ENTERPRISE wallet + org EntityMembership +
  APPROVAL_REQUIRED autonomy with the provisioning admin as the
  HUMAN approver. The RULE 0 boundary set holds by construction and
  is test-proven: TAR clearance_ceiling 2, can_admin_org/niov false,
  can_access_external_api false — NO broad default access.
  `GET /api/v1/otzar/ai-employees` lists org-scoped safe views (the
  Phase 1228 DMW Registry projects them as AI_EMPLOYEE; personal
  twins are excluded). `POST .../:id/deactivate` is the one-action
  kill switch: entity SUSPENDED + every ACTIVE TwinAuthorityGrant
  REVOKED in one transaction, audited (ENTITY_SUSPENDED +
  AI_EMPLOYEE_DEACTIVATED discriminator). Cross-org probes get 404
  (no existence oracle). 6 integration tests green; NO schema
  changes; no new audit literals.
- **Phase 1239** AI Twin collaboration protocol — VERIFIED, no gaps.
  All 11 Founder requirements hold with existing evidence: routes
  gated; Twins act under PERSONAL DMWs (ADR-0046); the protocol is
  memory-tight by construction (only the caller-authored 500-char
  safe_summary crosses Twins — grep-verified zero MemoryCapsule/COE
  access); same-org guard (CROSS_ORG_DENIED) + project-membership
  blocks (MISSING_PROJECT_MEMBERSHIP) + policy-gated approval
  (sensitive sensitivity_class → DUAL_CONTROL_REQUIRED →
  NEEDS_APPROVAL); no Actions created by the protocol; audit via
  TWIN_COLLABORATION_* discriminators; safe view collapses target
  FKs to booleans (test-locked). Evidence section added to
  dmw-cosmp-enforcement-matrix.md. 24 service + 18 policy + 13 route
  tests already lock the behaviors — no code changes were needed.
- **Phase 1237** Dandelion org growth + voice-first onboarding —
  Foundation half DONE. Per the Founder Dandelion addendum: Dandelion
  is the organic org-growth/pollination intelligence layer.
  `GET /api/v1/otzar/dandelion/org-growth` (org admin): "Otzar found
  N ways to strengthen your organization this week" — governed
  recommendations computed from REAL substrate (external
  relationships lacking internal owners / overloaded commitment
  owners / disconnected teammates + safe introduction pairing /
  onboarding gaps), display names only, recommendations never
  execute anything. `GET /api/v1/otzar/dandelion/onboarding`
  (employee-scoped): warm greeting, teammates to meet, workspaces to
  join, first steps, and the consent note ("Otzar only remembers
  what you approve"). `POST .../onboarding/memory-candidates`: the
  consent gate — preferred name / pronunciation / communication +
  quiet preferences become Action(PROPOSED, RECORD_CAPSULE) through
  the dual-control pipeline; NO capsule is written until the user
  approves in Action Center; retries are idempotent. 5 unit + 6
  integration green; NO schema changes. CT half landed:
  otzar-control-tower #72 — admin-gated 'Help your organization
  grow' card on People & Collaboration (plain-language why + next
  step, local dismiss, 'Suggestions only — nothing happens without
  you') + NEW /app/welcome voice-first Dandelion welcome (Hear-it
  TTS greeting, preferred name + pronunciation + communication/quiet
  preferences, consent gate pointing to Action Center approval).
  Dandelion suite 6/6; ambient sweep now 20 pages; full CT suite
  766/766; Otzar.app rebuilt and shipped JS verified.
- **Phase 1236** Calendar-aware automatic quiet mode — DONE.
  Foundation #333: `GET /api/v1/otzar/calendar/context` — the meeting
  signal is REAL substrate (caller's MeetingCapture scheduled
  windows), credential-free; safe current_event/next_event
  projections (bounded titles, boolean external flag, consent-derived
  capture status — never attendee emails or bodies);
  MOCK_CALENDAR_FIXTURE drives FOCUS_TIME demos; provider_mode is
  honest readiness (MOCK_CALENDAR today, *_CONFIGURED when OAuth envs
  exist — real clients are the credential-gated follow-on into the
  same shape). CT #71: AmbientOtzarBar polls the context and
  auto-quiets with explainer copy + Resume-voice session override
  (no re-quiet loop; override clears when the recommendation lifts).
  7 unit + 5 integration Foundation tests; CT 759/759. NO schema
  changes. Real Google/Microsoft calendar = BLOCKED_BY_CREDENTIAL.
- **Phase 1235** Ambient employee shell — DONE (CT-only). Per the
  Founder ambient/border-first/voice-first product-intent addendum:
  EmployeeNav 'More' section collapsed by default (employees see 7
  primary surfaces + one quiet disclosure, not 22 links); adminOnly
  nav entries hidden from non-admins ('Production readiness' first);
  NEW global ambient-copy sweep test renders all 19 top-level
  employee pages and bans raw internals everywhere + developer
  vocabulary on employee-tier pages (all pages passed without copy
  fixes); AmbientOtzarBar quiet mode (moon toggle; stops listening +
  cancels speech on entry; auto-speak suppressed; mic paused; muted
  'Otzar · quiet' collapsed pill; banner is honest that automatic
  meeting quiet-mode lands with the calendar connector).
  otzar-control-tower #70; full CT suite 756/756; Otzar.app rebuilt.
  No Foundation changes; no schema impact.
- **Phase 1227** OCR / Observe — DONE (backend). Governed Observe
  pipeline: `GET/POST /api/v1/otzar/observe/*` — provider adapter
  (DEMO_FIXTURE + PLAIN_TEXT always work; TESSERACT_LOCAL honestly
  NEEDS_PROVIDER_INSTALL pending a RULE 21 dependency arc; AWS
  Textract / Google Vision BLOCKED_BY_CREDENTIAL, and honest
  NEEDS_PROVIDER_INSTALL even when keys are present until the real
  clients land) → Phase 1213 structured extraction (summary /
  decisions / commitments / roster-aware suggested follow-ups) →
  `ObserveCapture` row → optional workspace attach that imports
  decisions + UNRESOLVED commitments into the collaboration ledger.
  Suggested follow-ups are NEVER auto-executed (zero Action rows
  created; Phase 1208 confirm path only). 5 NEW audit literals.
  Unit 9/9 + integration 8/8 green. **Needs prod schema push** for
  `observe_captures` (+3 enums). CT half landed: otzar-control-tower
  #69 restructures the Observe page around 'Let Otzar read this'
  (provider chips with friendly labels, sample + pasted-text
  reading, 'Otzar found text' results with approval-gated
  follow-ups via ProposedActionCard, attach-to-workspace with
  imported ledger counts; pre-1227 quick-note flow preserved).
  Observe suites 11/11; full CT suite 731/731; Otzar.app rebuilt
  and shipped JS verified.
- **Phase 1234** My Day intelligence (first real Python
  intelligence consumer) — DONE. `GET
  /api/v1/otzar/my-day/intelligence` builds the caller's SAFE
  scoped signal pack (proposed Actions / unread Notifications /
  pending+blocked TwinCollaborationRequests / ACTIVE-only
  TwinAuthorityGrants incl. expiring + sensitive-case-by-case /
  active WorkProjects / open CollaborationCommitments /
  waiting-on-external ExternalCommitments by direction) and
  runs it through `rankEmployeeTwinNextActions` — the Python
  runtime when `PYTHON_INTELLIGENCE_RUNTIME_URL` is configured,
  honest deterministic fixture otherwise. Calm user-safe
  response (headline + ranked suggestions + closed-vocab
  provider_status: PYTHON_CONFIGURED / FIXTURE_*). Counts +
  closed-vocab labels only; no payloads, no audit details, no
  external-collaborator private fields. Unit 6/6 + integration
  6/6 green (org isolation, revoked-grant exclusion, no-leak
  boundary proven). **No schema changes.** CT half landed:
  otzar-control-tower #68 adds the 'What matters today' card to
  My Day (calm headline + top-3 ranked suggestions with friendly
  closed-vocab reason copy + one-click Open links +
  waiting-on-external line + honest provider footer; card hides
  non-blockingly when the call fails). my-day suite 15/15; full
  CT suite 725/725; Otzar.app rebuilt and shipped JS verified to
  contain the new surface.

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
- 1227 (1): `observe_captures` (+ 3 enums: `OCRProviderType`,
  `ObserveSourceType`, `ObserveCaptureStatus`).
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
