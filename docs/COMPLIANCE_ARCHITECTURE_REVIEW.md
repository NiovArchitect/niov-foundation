# Compliance Architecture Review — Foundation @ ee4dafb

**Status: FINAL DRAFT — Checkpoint 4 complete. Awaiting user
end-to-end review and commit approval.**

Foundation HEAD: `ee4dafb` (TwinDetail read endpoint, 443 + 1 skipped).
Otzar Control Tower HEAD: `0a28f90` (Section 12B.4 closed, 12 tests).
Review scope: 24 compliance dimensions across 3 sections.

## Executive Summary

This review evaluates `niov-foundation` HEAD `ee4dafb` against 24
compliance dimensions distributed across three production-required
postures: tenant-internal compliance (already substantially baked
through Section 12B), regulatory inbound access (credentialed
regulators reading tenant data under lawful authority), and
enterprise outbound verification (enterprises proving compliance
to customers, auditors, partners, data subjects, insurers, and
M&A teams). Commercial-first, government-primed: Foundation must
keep FedRAMP / IL4-IL6 / CMMC paths reachable without rework
while shipping commercial-tier features today.

The headline finding is that Foundation's substrate is meaningfully
more advanced than typical greenfield platforms in three specific
ways: (1) the audit-of-record hash chain (`audit.ts:210-236`) with
Postgres-trigger append-only enforcement + per-actor canonical-hash
chain + advisory-lock serialization is GREEN against NIST 800-53
AU-9 and exceeds FedRAMP Moderate AU-10 requirements; (2) the
runtime compliance framework engine (`compliance.service.ts:80-145`,
seven seed frameworks with `required_audit_events` mappings and
`EntityComplianceProfile` attachment) carries substantial lift for
several Section 2 + 3 dimensions; (3) the Hive intelligence
primitive + `MonetizationSuggestion` privacy-invariant pattern
(already protected by US 12,517,919) make cross-tenant compliance
benchmarking a direct continuation rather than new substrate.
None of the 13 RED findings represent architectural choices that
*close off* a compliance path — every one is "specific work
needed; path not blocked" or "rework needed but rework is well-
scoped."

The patent-relevance pass surfaced six claim families across nine
flagged dimensions. The strongest direct continuations are 3.8
(compliance state as part of capsule provenance — single JSON
field on MemoryCapsule, direct extension of US 12,164,537) and
3.5 (cross-tenant compliance benchmarking via Hive — direct
extension of US 12,517,919's privacy-preserving aggregation
pattern, already cited in `schema.prisma:990-1006`). The largest
commercial-market opportunity is Family 2 (DMW-anchored AI agent
decisional reproducibility + customer-facing attestation export),
which addresses EU AI Act + NYC AEDT + California ADMT + emerging
FTC AI rulemaking — markets currently underserved by existing GRC
platforms.

**Final status table (24 dimensions):**

| Section | Dimensions | GREEN | YELLOW | RED | INSUFFICIENT |
|---|---|---|---|---|---|
| 1. Government priming | 8 | 1 | 5 | 2 | 0 |
| 2. Regulatory inbound | 8 | 0 | 1 | 6 | 1 |
| 3. Enterprise outbound | 8 | 0 | 4 | 4 | 0 |
| **Cumulative** | **24** | **1** | **10** | **12** | **1** |

**Patent-relevance findings**: 9 dimensions tagged
[PATENT-RELEVANT] under Discipline B/C, consolidating into 6
claim families (see Patent-Relevance Catalog below). Each
rationale specifically answers: extends COSMP capsule structure?
extends DMW boundary semantics? composes with audit chain via
canonical hash binding? Patterns answering "no" or "indirect" to
all three are flagged "novel but not patent-family extending"
without the tag (1.1, 1.5, 1.6, 1.7, 1.8, 2.1, 2.4, 3.3, 3.4, 3.7
residual).

**Top 5 findings across all 24 dimensions (ranked by strategic
importance):**

1. **3.8 Capsule compliance provenance — RED + [PATENT-RELEVANT
   direct continuation of US 12,164,537]** (Medium remediation).
   Smallest schema delta in the entire review (one JSON field on
   MemoryCapsule); largest patent-claim-shape clarity. Pairs with
   1.6 + 3.4 in one Section 12.5 sub-box.

2. **2.5 + 3.6 DMW-anchored AI agent decisional reproducibility +
   customer-facing attestation — RED + [PATENT-RELEVANT, single
   claim family]** (Medium remediation). Largest commercial market
   addressed by the review (EU AI Act, NYC AEDT, California ADMT,
   FTC AI rulemaking). Section 12.5 sub-box paired with 2.7.

3. **2.8 Right-to-deletion vs audit immutability — RED +
   [PATENT-RELEVANT extends 12,164,537 + 12,399,904]** (Medium
   remediation). Foundation's "Rule 10: nothing is ever hard
   deleted" doctrine directly conflicts with GDPR Article 17;
   pseudonymization-with-attestation pattern resolves the
   tension and is itself patent-extending. Blocks EU tenant
   onboarding until resolved.

4. **1.5 Multi-person integrity capability — RED** (Medium
   remediation, NOT patent-relevant). No EscalationRequest /
   DualControl primitive; deferred to "Section 14" in TODO
   comments. With elevated compliance scope (regulator inbound +
   outbound verification), Section 14 deferral is no longer
   adequate. Section 12.5 sub-box; gates several downstream
   sub-boxes (regulator access grants).

5. **3.5 Cross-tenant compliance benchmarking — YELLOW +
   [PATENT-RELEVANT direct continuation of US 12,517,919]**
   (Medium remediation). Most leveraged of any dimension —
   substrate is the existing Hive primitive + privacy-preserving
   aggregation pattern already cited in `schema.prisma:990-1006`
   with an existing `feedback.test.ts` invariant test. Cleanest
   *direct* continuation in the entire review.

**Recommended sequencing (see full dependency graph below):** 12C.0
batch covers nine Quick items including the original four endpoint
extensions plus 1.1 algorithm pin, 1.3 retention posture
documentation, 1.4 system actors, 1.7 structured logging, 3.3
compliance-state endpoint. Section 12.5 organizes nine medium
sub-boxes ordered by dependency, beginning with 1.5
(EscalationRequest, no upstream dependencies) and 1.6/2.4
(jurisdiction tagging, foundational for several downstream items).
Three items defer to Section-level future work (1.2 external Merkle
anchoring for FedRAMP High only, 3.2-Stage-B zk-SNARK proofs, 2.6
treaty routing operational layer).

**Patent-relevance summary (6 claim families):** see Patent-
Relevance Catalog. Two direct continuations of existing patents
(3.5 → 12,517,919; 3.8 → 12,164,537), three new continuations
extending the family into AI governance / regulator access /
verifiable deletion territory, one continuation potentially
consolidating with a sibling family pending IP counsel review.
Foundation's existing IP positions the platform well for
commercial enterprise tier today and government tier with the
Section 12.5 work landed.

**This review is procurement-ready** and may be surfaced to
enterprise CISOs reviewing vendor compliance, FedRAMP 3PAOs
scoping ATO assessments, or IP counsel evaluating continuation
filings — once committed.

═══════════════════════════════════════════════════════════════════

## Section 1: Government Priming

### Dimension 1.1: Cryptography Library Validation Path

**Requirement**: FIPS 140-3 validatable libraries for keys-at-rest and
keys-in-transit are mandatory for government tenants. The validation
must come from FIPS-listed cryptographic modules and cannot be
bolted on after the fact. Password hashing must follow NIST SP 800-63B
guidance; symmetric / asymmetric / hash primitives must be in NIST
SP 800-131A's transition-acceptable set. JWT signing algorithms must
be from the FIPS-acceptable subset (RS256, ES256, EdDSA, HS256 with
sufficient key length).

**Foundation Current State**:

- `package.json` declares `bcrypt` (transitive via `@niov/auth`) and
  `jsonwebtoken` `^9.0.2` as runtime dependencies.
- `packages/auth/src/password.ts:9` imports `bcrypt`. Constant
  `BCRYPT_ROUNDS = 12` (production) / `4` (test) at line 19.
- `packages/auth/src/crypto.ts:34` uses `aes-256-gcm` for capsule
  content encryption via Node `node:crypto` `createCipheriv`.
- `packages/auth/src/crypto.ts:79` falls back to
  `SHA-256(JWT_SECRET)` as a derived encryption key when
  `ENCRYPTION_KEY` is unset.
- `apps/api/src/services/auth.service.ts:301-304` calls
  `jwt.sign(payload, this.config.jwtSecret, signOptions)` with
  `signOptions = { expiresIn: sessionTtlSeconds }` only — no
  explicit `algorithm`, so `jsonwebtoken` defaults apply (HS256).
- `node:crypto` is used directly for `randomUUID`, `randomBytes`,
  `createHash` (SHA-256), and AES-GCM cipher construction.

**Gap Analysis**:

The cryptographic *algorithm* choices are FIPS-acceptable
(AES-256-GCM, SHA-256, bcrypt with rounds ≥ 10, HS256 with
sufficient key length). The *runtime* path to FIPS validation
requires either a Node.js binary compiled against FIPS-validated
OpenSSL (e.g., RHEL 9 in FIPS mode, AWS Nitro Enclaves with
validated module) or a managed runtime that supplies validated
crypto. The application code does not preclude this path, but
neither does it pin runtime requirements documenting the FIPS
deployment posture.

The HS256 default is a forward-compatibility concern: HS256 is
symmetric, requiring secret distribution to every verifier. For
federated verification (regulators verifying tokens without
possessing the secret), RS256 / ES256 would be needed. This is an
architectural choice, not a FIPS issue.

The `ENCRYPTION_KEY` fallback to `SHA-256(JWT_SECRET)` (`crypto.ts:79`)
is acceptable for development but should be removed for FIPS-mode
deployments; key derivation from a JWT secret is not an approved
KDF.

**Status**: YELLOW

**Recommended Remediation**:

- **Quick (12C.0 batch)**: Document the FIPS deployment posture in
  `docs/` — required Node.js build, OpenSSL FIPS configuration,
  secret-management posture for `ENCRYPTION_KEY`, key-rotation
  cadence. Pin algorithm explicitly in `signOptions`
  (`algorithm: "HS256"`) so an upstream library default change
  cannot silently shift to a non-FIPS algorithm.
- **Medium (Section 12.5)**: Add asymmetric JWT signing path
  (RS256 or ES256) with public key publication endpoint to
  enable federated verification (necessary for regulator-side
  attestation flows in Section 2). The HS256 path stays for
  internal session tokens; asymmetric path covers compliance
  attestations and external regulator verification.
- Remove the `SHA-256(JWT_SECRET)` `ENCRYPTION_KEY` fallback for
  production builds; add a boot-validation check that the
  ENCRYPTION_KEY is explicitly set in production NODE_ENV.

**Patent Relevance**: None.

**Citations**: FIPS 140-3 (Security Requirements for Cryptographic
Modules); NIST SP 800-63B (Digital Identity Guidelines —
Authentication and Lifecycle Management, password-hashing guidance);
NIST SP 800-131A (Transitioning the Use of Cryptographic Algorithms
and Key Lengths).

---

### Dimension 1.2: Audit Log Immutability Primitive

**Requirement**: Audit logs must be tamper-evident beyond code
convention. The standard contains four protections in ascending
strength: (a) database-level append-only constraint, (b) hash chain
linking each event to the prior event, (c) per-actor chain
serialization preventing concurrent-write reordering, (d) periodic
external anchoring (Merkle root publication, blockchain anchor).
NIST 800-53 Rev 5 AU-9 specifies "audit log protection";
FedRAMP High elevates this to AU-9(2) (audit records on separate
physical systems) and AU-10 (non-repudiation).

**Foundation Current State**:

- `packages/database/prisma/schema.prisma:249-271` defines
  `AuditEvent` with `event_hash` and `previous_event_hash` columns.
- `packages/database/src/queries/audit.ts:210-236` installs a
  Postgres `CREATE OR REPLACE FUNCTION audit_events_immutable()` plus
  `BEFORE UPDATE` and `BEFORE DELETE` triggers that
  `RAISE EXCEPTION 'audit_events is append-only'`.
- `audit.ts:140-156` defines a recursive `canonicalJson` so the SHA-256
  input is deterministic regardless of object key insertion order.
- `audit.ts:254-257` acquires `pg_advisory_xact_lock(hashtext($1))`
  per chain so concurrent writers cannot link to the same prior
  event.
- `audit.ts:385-429` `verifyAuditChain` walks an entity's chain and
  reports the first `audit_id` whose recomputed hash diverges.
- Chain is per-actor: `chainKey = input.actor_entity_id ?? SYSTEM_CHAIN_KEY`
  (`audit.ts:131`, `audit.ts:251`).

**Gap Analysis**:

Three of four standard protections are present: append-only
constraint (database trigger), hash chain (event_hash + previous_event_hash
+ canonical SHA-256), per-chain serialization (advisory lock).
External anchoring is not present — there is no scheduled job
publishing periodic Merkle roots externally (e.g., to a public
ledger or a customer-controlled escrow). For FedRAMP Moderate this
is acceptable; for FedRAMP High AU-9(2) (audit records on separate
physical systems) and external anchoring, additional infrastructure
work is needed.

The triggers run at the Postgres trigger layer; an operator with DDL
access can disable them. The hash chain is the second line of
defense — modifications break verifyAuditChain. This is a sound
defense-in-depth posture.

**Status**: GREEN

**Recommended Remediation**:

- For FedRAMP High readiness only: add scheduled Merkle-root
  publication (Section-level future work). Not required for
  Moderate. Not blocking for commercial enterprise tier.

**Patent Relevance**: The hash-chain pattern is conventional;
external anchoring with COSMP capsule provenance integration could
be patent-relevant if pursued (deferred — flag at the corresponding
attestation dimensions in Section 3).

**Citations**: NIST 800-53 Rev 5 AU-9 (Protection of Audit
Information); FedRAMP High Baseline AU-9(2), AU-10
(Non-repudiation).

---

### Dimension 1.3: Audit Log Retention

**Requirement**: FedRAMP Moderate / High specify minimum retention
windows (typically 1 year online + total 3 years for Moderate; 3
years online + 12 years total archive for High). Commercial regimes
vary: SOX 802 mandates 7 years for financial audit trails; HIPAA
164.316(b)(2) specifies 6 years; GDPR retention is by lawful basis
and member-state-specific.

**Foundation Current State**:

- `schema.prisma:249-271` — `AuditEvent` has no `expires_at`,
  `retention_until`, or comparable retention column.
- The `BEFORE DELETE` trigger (`audit.ts:228-235`) prevents deletion
  unconditionally — including by automated retention-rotation jobs.
- No documented retention policy in `docs/` or in code comments.
- No archival or cold-storage migration path is implemented.

**Gap Analysis**:

Foundation enforces *no* retention ceiling — audit events
accumulate indefinitely under the append-only trigger. This is
*more* than commercial / FedRAMP Moderate requires, which is
neutral-to-good. However, three concerns surface:

1. **Storage scaling**: at production volume audit_events grows
   unbounded; no index-level partitioning or hot/cold tier
   migration is in place.
2. **GDPR right-to-erasure conflict**: this dimension intersects 2.8
   (right-to-deletion vs immutability). If audit rows reference
   personal data directly (vs pseudonymous IDs), GDPR Article 17
   compels deletion that the trigger forbids. Today the trigger
   wins; the schema does not yet pseudonymize.
3. **Regulatory clarity**: a documented retention policy is itself
   a SOC 2 / ISO 27001 evidence requirement. "We never delete" is
   acceptable but must be stated.

**Status**: YELLOW

**Recommended Remediation**:

- **Quick (12C.0 batch)**: Document the retention posture in
  `docs/` — explicit "audit_events are never deleted; archival
  posture is operational concern" statement. Acceptable for SOC 2
  / FedRAMP Moderate as long as documented.
- **Medium (Section 12.5)**: Add per-tenant retention configuration
  schema (`OrgRetentionPolicy` model) so enterprise tenants can
  declare their regime (SOX 7yr, HIPAA 6yr, GDPR by purpose) for
  evidence packaging without changing the actual storage
  retention. The retention metadata is published in compliance
  reports; the underlying storage stays append-only.
- **Heavy (future)**: Hot/cold tier migration to S3 Glacier /
  GovCloud archive class for storage cost management at scale.

**Patent Relevance**: None.

**Citations**: NIST 800-53 Rev 5 AU-11 (Audit Record Retention);
FedRAMP High Baseline AU-11; SOX Section 802; HIPAA Security Rule
45 CFR § 164.316(b)(2)(i); GDPR Article 5(1)(e) (storage
limitation).

---

### Dimension 1.4: Account-of-Record Discipline

**Requirement**: Every audit event must map to a real authenticated
entity. Shared service accounts, system principals masquerading as
humans, and anonymous actions in privileged paths are
non-compliant. Where system actions are unavoidable
(scheduled jobs, periodic checks), they must be enumerable as
distinct system actor identities — not collapsed into a single
"system" sentinel.

**Foundation Current State**:

- `schema.prisma:252` — `actor_entity_id String? @db.Uuid` (nullable).
- `audit.ts:131` — `const SYSTEM_CHAIN_KEY = "__niov_system_chain__"`.
- `audit.ts:247-265` — when `actor_entity_id` is null, the audit row
  joins the SYSTEM chain via the sentinel.
- `apps/api/src/services/feedback/scheduler.ts:54-94` — the
  scheduler emits `console.error` lines but does not name itself as
  an audit actor (does not call `writeAuditEvent` for every cron
  tick).
- `apps/api/src/services/cosmp/share.service.ts` — service-emitted
  audit events use the calling session's `entity_id` as actor (not
  null).
- Routes that pass through `requireAdminCapability` populate
  `request.auth.entity_id` (`admin.middleware.ts:74-79`); audit
  emissions in those handlers carry that entity_id.

**Gap Analysis**:

User-initiated audit events all carry the authenticated
`entity_id`. The nullable column exists for system-initiated events,
which all chain under one sentinel. Two concerns:

1. The single SYSTEM sentinel collapses every system action into one
   chain. FedRAMP / SOC 2 reviewers prefer enumerated system
   identities (SCHEDULER, BOOT_VALIDATOR, COMPLIANCE_SEEDER,
   FEEDBACK_LOOP_2..7) so audit reconstruction can attribute system
   actions to a specific subsystem.
2. Background loops in `scheduler.ts:54-94` log failures via
   `console.error` only — they do not emit audit events for their
   own operation. NIST 800-53 AU-2 requires audit coverage of system
   activities, including scheduled processes.

**Status**: YELLOW

**Recommended Remediation**:

- **Quick (12C.0 batch)**: Replace single `SYSTEM_CHAIN_KEY`
  sentinel with an enumerated system-actor type (a small enum of
  named system principals: SCHEDULER, COMPLIANCE_SEEDER,
  FEEDBACK_LOOP, BOOT_VALIDATOR). Add audit emissions to scheduler
  loop runs (success + failure outcomes per loop, not per item).
  This is a small schema + emit-call change.
- Document explicitly in `docs/` which audit emissions are
  user-initiated vs system-initiated and which system principal
  each system event uses.

**Patent Relevance**: None.

**Citations**: NIST 800-53 Rev 5 AC-2 (Account Management), AU-2
(Event Logging — what / who / when / where / source / outcome
fields), AU-3 (Content of Audit Records).

---

### Dimension 1.5: Multi-Person Integrity Capability

**Requirement**: Capability for two-person rule on privileged
operations. FedRAMP High AC-3(2) requires it for specific admin
actions (account creation with high-clearance, encryption key
access, audit log deletion attempts). CMMC 2.0 Level 3 AC.L3-3.1.4
extends to general access control. The schema primitive must exist
even if dormant; bolting it on after operations are live requires
data migration of in-flight grants.

**Foundation Current State**:

- No `EscalationRequest`, `TwoPersonRule`, `DualControl`, or
  `ApprovalRequest` model in `schema.prisma` (lines 1-1067 surveyed).
- `apps/api/src/routes/org.routes.ts:1009-1038` — multiple TODO
  comments name "Section 14: EscalationRequest table" as the
  intended landing site.
- `TwinConfig.approver_entity_id` (`schema.prisma:743`) exists for
  twin behavior policy approvals only — single-approver, not
  dual-control. Not a general primitive.
- `apps/api/src/services/otzar/priming.ts:124` — comment "EscalationRequest
  table doesn't exist yet. The Section 14..." names the deferral.
- The Otzar Control Tower frontend stubs `pending_approvals_count: 0`
  through 12B-12D explicitly.

**Gap Analysis**:

The primitive is absent. The TODO comments document the gap as
"Section 14" — a downstream section, not pre-existing substrate.
This is a known blocker. For commercial enterprise tier without
two-person-rule operations the absence is acceptable; for FedRAMP
High and CMMC 2.0 Level 3 it is non-negotiable.

The architectural choice to defer to "Section 14" predates this
review's elevated compliance scope. The deferral made sense when
the workload was tenant-internal compliance only; with regulatory
inbound and outbound verification dimensions added, the primitive
needs to land sooner than Section 14.

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box)**: Add `EscalationRequest` model
  with status enum (PENDING / APPROVED / REJECTED / EXPIRED),
  initiator_entity_id, target_action (typed enum of ops requiring
  dual control), required_approvers (array of TAR capabilities),
  approver_entity_ids (array tracking who has approved),
  decision_at, expires_at. Add `runtime requireDualControl()`
  middleware that gates flagged operations behind a pending
  approval check. Wire the highest-stakes operations (account
  creation with `can_admin_niov`, audit-trigger-disable attempts,
  capsule mass-deletion) into the gate. Otzar Control Tower
  Approvals screen consumes this surface.
- This is the single most important Section 12.5 candidate
  surfaced by the review.

**Patent Relevance**: None — two-person rule is conventional. The
*integration* with COSMP grant flows (dual-control on grant
issuance) might be a continuation territory but is not surfaced
yet.

**Citations**: NIST 800-53 Rev 5 AC-3(2) (Dual Authorization);
CMMC 2.0 Level 3 AC.L3-3.1.4 (Separation of Duties); FedRAMP High
Baseline AC-3(2).

---

### Dimension 1.6: Data Residency / Region-Locking

**Requirement**: Government tenants need US-only storage (FedRAMP),
GovCloud (IL4+), or classified networks (IL5/IL6). Multinational
enterprises need EU-only storage for GDPR-covered data subjects per
Schrems II. Cross-border transfer requires explicit lawful basis.
Architecture must support deployment topology choices, not assume
single-region.

**Foundation Current State**:

- `MemoryCapsule` schema (`schema.prisma:81-156`) — no `jurisdiction`,
  `region`, or `data_subject_jurisdiction` field.
- `Entity` schema (`schema.prisma:22-52`) — no jurisdiction-of-
  residence or jurisdiction-of-operation field.
- `ComplianceFramework` (`schema.prisma:527-540`) — has
  `jurisdiction String[]` (e.g., `["EU", "EEA"]` for GDPR).
- `EntityComplianceProfile` (`schema.prisma:546-556`) — has
  `jurisdiction String[]` (per-entity declaration of which
  jurisdictions apply).
- `apps/api/src/services/compliance/compliance.service.ts:80-145`
  — seven seed frameworks each carry jurisdiction arrays.
- No region tagging on data tier; deployment-topology assumptions
  are implicit (single Postgres, single object storage).

**Gap Analysis**:

The compliance-framework layer knows about jurisdictions; the
data-storage layer does not. Today, GDPR enforcement is "this
entity declares EU jurisdiction → these capsule_types are gated";
not "this capsule was created in the EU and never leaves the EU."
The latter is what Schrems II + GDPR Articles 44-50 actually require
for personal data of EU residents.

For FedRAMP, a single AWS commercial region deployment cannot serve
GovCloud tenants — but Foundation does not yet model the deployment
boundary inside the data, so the schema would not block a
multi-region deployment. The lift is moderate: add jurisdiction
fields to Entity + MemoryCapsule + AuditEvent, with default values
seeded by tenant configuration.

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box)**: Add `jurisdiction: String?` (or
  jurisdiction_codes: String[]) to `Entity`, `MemoryCapsule`, and
  `AuditEvent`. Default at create-time from `OrgSettings` (which
  needs a `default_jurisdiction` field added) or from
  `EntityComplianceProfile`. Wire the field into permission /
  share / read flows so cross-jurisdictional access surfaces a
  flag the caller can act on (block, log, prompt). Add a runtime
  `assertJurisdictionalScope()` check that prevents cross-region
  reads where lawful basis is not declared.
- The schema change is small; the runtime integration is moderate.
  Together this is one Section 12.5 sub-box.

**Patent Relevance**: None directly — region tagging is conventional.
However, the *intersection* of jurisdictional tagging with COSMP
capsule provenance + cross-tenant hive intelligence is potentially
patent-relevant (deferred to Section 3.5 cross-tenant compliance
benchmarking).

**Citations**: GDPR Articles 44-50 (international data transfers);
Schrems II decision (CJEU C-311/18, July 2020); FedRAMP boundary
requirements; CMMC 2.0 Level 2 SC.L2-3.13 (system / communications
boundary).

---

### Dimension 1.7: Continuous Monitoring Hooks

**Requirement**: Structured logging output (JSON to stdout, syslog
with structured fields, OpenTelemetry traces, Prometheus metrics)
consumable by SIEM tools (Splunk, Datadog, Sentinel, Chronicle).
FedRAMP ConMon (Continuous Monitoring) requires continuous metric
and log forwarding to the authorizing agency's SOC.

**Foundation Current State**:

- `apps/api/src/server.ts:225` — `Fastify({ logger: false })`. The
  built-in pino structured JSON logger is explicitly disabled.
- `apps/api/src/services/feedback/scheduler.ts:54-94` and
  similar — diagnostic output is unstructured `console.error` /
  `console.warn` strings.
- `apps/api/src/routes/health.routes.ts:17-31` — `GET /api/v1/health`
  exists with database-reachability sub-status. Returns JSON.
- No `/metrics` endpoint (Prometheus / OpenMetrics format).
- No OpenTelemetry instrumentation. No `@opentelemetry/*` packages
  in `package.json`.
- No syslog forwarding configuration.
- `boot-validation.ts:42` — uses `console.warn` for boot env
  warnings. Boot validation exists but doesn't emit structured
  events.

**Gap Analysis**:

The health endpoint is GREEN. Everything else is unstructured
strings to stdout. SIEM ingestion of `console.error` strings via
container log collection is technically possible but fragile —
strings drift, fields are not typed, and parsing is error-prone.
FedRAMP ConMon explicitly calls out "automated log analysis" which
requires structured input.

The lift is small: re-enable Fastify's pino logger with a JSON
formatter, replace `console.*` with `request.log.*` or
`fastify.log.*`. Add a `/metrics` endpoint emitting at least
request count / latency / error rate / database-pool state. Add
OpenTelemetry SDK (Node.js auto-instrumentation) for traces.

**Status**: YELLOW

**Recommended Remediation**:

- **Quick (12C.0 batch)**: Re-enable Fastify pino logger with
  production-mode JSON output (`logger: { level: 'info' }` plus
  serializers). Add request-id correlation. Replace top-priority
  `console.*` call sites in scheduler.ts + boot-validation.ts +
  cosmp/read.service.ts with structured logger calls. Define a
  field schema documenting expected log keys (event_id, actor_id,
  session_id, op, outcome, duration_ms).
- **Medium (Section 12.5)**: Add `/metrics` endpoint (Prometheus
  format), OpenTelemetry SDK with auto-instrumentation, and a
  documented SIEM-ingestion recipe for Splunk / Datadog / Sentinel.

**Patent Relevance**: None.

**Citations**: NIST 800-53 Rev 5 CA-7 (Continuous Monitoring), AU-6
(Audit Record Review, Analysis, and Reporting); FedRAMP ConMon
guidance.

---

### Dimension 1.8: NIST 800-53 Control Mapping Discipline

**Requirement**: Privileged operations gated by capability checks
must be traceable to NIST control families. Audit event types must
map to NIST audit-event categories. Required for SSP (System
Security Plan) authoring during ATO assessment — without these
mappings, the assessor's evidence-collection burden is manual and
error-prone, and the assessment timeline extends substantially.

**Foundation Current State**:

- `apps/api/src/middleware/admin.middleware.ts:33-81` — defines
  `requireAdminCapability` for `can_admin_org` and `can_admin_niov`.
  No NIST control reference in JSDoc or argument metadata.
- `packages/database/src/queries/audit.ts:23-57` — `AuditEventType`
  union enumerates 30 event types. No NIST AU-2 category mapping
  in code or comments.
- `apps/api/src/services/compliance/compliance.service.ts:80-145` —
  `SEED_FRAMEWORKS` includes `FedRAMP_Moderate` and `CMMC_Level2`
  with `required_audit_events` arrays. This is a *coarser* control
  mapping (framework → required event types) without per-control
  granularity (e.g., NIST AC-2 / AU-2 / IA-5 individually).
- `TokenAttributeRepository.compliance_frameworks String[]`
  (`schema.prisma:187`) — per-entity declared frameworks.
- No `control_id` or `nist_control` field on `AuditEvent`,
  `Permission`, or any other model.

**Gap Analysis**:

Foundation has compliance posture as data — the framework engine is
genuinely advanced. What it lacks is per-NIST-control granularity:
each capability gate should annotate which NIST controls it
implements (AC-3, AC-6, AU-12), each audit event should tag which
control's evidence it satisfies (AU-2 evidence vs AU-3 evidence).
With those annotations, SSP authoring becomes a query against
existing data rather than manual table-walking.

This is YELLOW because the substrate is in place; what's missing
is annotation layer, not architecture.

**Status**: YELLOW

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box)**: Add a `control_mappings`
  module: a TypeScript constant mapping each `AuditEventType`
  literal to NIST 800-53 control IDs, each capability flag in TAR
  to its enforcement controls, and each ComplianceFramework to its
  applicable NIST baseline (Low / Moderate / High). Surface via a
  `/compliance/controls` endpoint that returns the live mapping
  for SSP authoring tooling. Ship a control-coverage report
  generator (per-framework: how many of X applicable controls
  have Foundation-tagged evidence).
- This work also serves Dimension 3.4 (control-to-evidence binding).

**Patent Relevance**: None directly. The automated SSP-evidence
generation pattern (Dimension 3.4) is potentially patent-relevant,
but discussed under that dimension.

**Citations**: NIST 800-53 Rev 5 control catalog (full Access
Control, Audit & Accountability, Identification & Authentication
families); FedRAMP SSP Template guidance.

═══════════════════════════════════════════════════════════════════

## Section 2: Regulatory Inbound Access

**Section-level note:** Foundation's runtime compliance framework
engine (`compliance.service.ts:80-145`, 7 seed frameworks with
`required_audit_events` mappings + `EntityComplianceProfile`
attachment) is meaningfully advanced substrate. Several Section 2
findings have less Foundation lift than expected because framework
awareness already exists. Each dimension below names whether it
extends the existing engine or requires net-new primitives.

### Dimension 2.1: REGULATOR Entity Type

**Requirement**: First-class entity type for regulators distinct from
PERSON, AI_AGENT, COMPANY, GOVERNMENT (the latter representing a
*tenant* government, not an external authority). SEC examiners,
OSHA inspectors, HHS auditors, EU DPA officials accessing tenant
data are not Members; they are scoped third-party authenticated
entities with time-bounded jurisdiction-bounded read grants under
lawful authority. The TAR (Trust Anchor Record) for a regulator
must encode jurisdiction-of-authority + scope-of-authority, not the
generic capability flags humans get.

**Foundation Current State**:

- `schema.prisma:331-338` — `EntityType` enum has six values:
  `PERSON, COMPANY, AI_AGENT, DEVICE, APPLICATION, GOVERNMENT`. No
  REGULATOR / AUTHORITY / EXAMINER literal.
- `schema.prisma:891` — `ExternalEntity.entity_type` is a free
  string field documented as `CLIENT|PARTNER|VENDOR|COMPETITOR|REGULATOR`.
  This is a *tracking* table for entities the tenant *mentions*
  in conversations — NOT for authenticating regulator access.
- `TokenAttributeRepository` (`schema.prisma:172-200`) capability
  flags are tenant-internal: `can_login`, `can_read_capsules`,
  `can_share_capsules`, etc. No `is_regulator`,
  `regulator_jurisdiction`, or `regulator_authority_scope` field.
- No regulator-specific authentication / authorization flow in
  `apps/api/src/services/auth.service.ts` or routes.

**Gap Analysis**:

The primitive is absent. `GOVERNMENT` is a tenant entity type (a
public-sector agency operating Foundation as their own tenant) —
not a regulator type (an external authority accessing another
tenant's data under lawful authority). Conflating the two is a
correctness hazard: a SEC examiner reading a regulated bank's data
must not have the same TAR shape as the SEC's own internal
deployment of Foundation.

This is independent of Dimension 1.4 (account-of-record): adding
REGULATOR doesn't change account-of-record discipline; it adds a
new principal class.

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box, paired with 2.2)**: Add
  `REGULATOR` to `EntityType` enum. Add regulator-specific TAR
  fields: `regulator_jurisdiction: String[]`,
  `regulator_authority_scope: String[]` (e.g.,
  `["HEALTHCARE_HIPAA_AUDIT"]`), `regulator_credentialed_by: String?`
  (the credentialing authority — DOJ, EU DPA, etc.). Add an
  authentication flow that verifies regulator credentials against a
  trusted credentialing source (initial implementation can use a
  signed certificate from the credentialing authority; later can
  integrate with national PKI / EU eIDAS).
- This sub-box is a paired build with 2.2 lawful-basis attestation
  — they share schema territory.

**Patent Relevance**: None under Discipline B. Adding an enum value
and TAR fields is conventional schema work; it does not extend
COSMP / DMW capsule structure or audit-chain primitives.

**Citations**: Conventional GRC pattern; no specific NIST / FedRAMP
citation maps to "regulator entity type" because compliance
standards typically presume external regulators access logs *outside*
the system. The novelty here is bringing regulator access *into* the
COSMP envelope — but that's a product choice, not a regulatory
mandate.

---

### Dimension 2.2: Lawful-Basis Attestation

**Requirement**: Every regulator access must carry lawful-basis
attestation in the access record. Schema fields needed:
`lawful_basis_type` (subpoena / regulatory_authority / court_order /
DPA_request / MLAT_request / consent_of_data_subject),
`lawful_basis_reference` (case number, subpoena ID, treaty article),
`jurisdiction_invoked` (US-federal, US-state-X, EU-member-state-Y),
`valid_until` (lawful-basis windows are always time-bounded).
Without these fields, regulator access is indistinguishable from
unauthorized admin access in the audit-of-record — a defensibility
failure for both the tenant (cannot prove compliance with regulator
demand) and the regulator (cannot prove access was lawful).

**Foundation Current State**:

- `schema.prisma:249-271` — `AuditEvent` schema has no
  `lawful_basis_*` fields. The `details Json @default("{}")` column
  could carry them as free-Json, but no structured contract exists.
- `Permission` schema (`schema.prisma:279-306`) has no lawful-basis
  fields. `conditions Json @default("{}")` is similarly free-form.
- `compliance.service.ts:99` — GDPR seed framework rule includes
  `right_to_erasure: true` but no lawful-basis-of-access rule
  primitive.
- No "external authority access" audit pattern in
  `audit.ts:23-57` event types; closest is `ADMIN_ACTION` which is
  internal-admin.

**Gap Analysis**:

Foundation has no structured lawful-basis primitive. The audit chain
is robust (Dimension 1.2 GREEN) but cannot distinguish "the org's
own admin read this data" from "the SEC examiner read this data
under subpoena 24-cv-1234 valid through 2026-08-01." For regulatory
inbound access to be defensible, the lawful basis must be an audit
field, not a free-Json key.

The remediation has natural pairing with 2.1 (REGULATOR entity
type) — together they establish "who accessed under what authority."

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box, paired with 2.1)**: Add structured
  lawful-basis fields to `AuditEvent` (preferred: a separate
  `LawfulBasis` model with `audit_id` foreign key, since not every
  audit event has a lawful basis — only regulator-driven ones do).
  Fields: `basis_type` (enum: SUBPOENA, REGULATORY_AUTHORITY,
  COURT_ORDER, DPA_REQUEST, MLAT_REQUEST, CONSENT_OF_DATA_SUBJECT),
  `basis_reference` (string — case ID), `jurisdiction_invoked`
  (string), `valid_from / valid_until` (DateTime). Add new
  AuditEventType literals: `REGULATOR_ACCESS_GRANTED`,
  `REGULATOR_ACCESS_REVOKED`, `REGULATOR_ACCESS_EXPIRED`. Wire the
  share/read/permission flows to require lawful-basis when actor
  type is REGULATOR.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline B.

*Rationale*: The pattern "lawful-basis attestation cryptographically
linked to a COSMP capsule access record via the existing hash-chain
audit-of-record" extends US 12,164,537 (COSMP) and US 12,399,904
(DMW) into regulatory-access territory. The novelty over generic
"log who accessed data" prior art is the *binding* — the lawful
basis attestation is included in the canonical hash input
(`audit.ts:178-191`) so regulator authority cannot be retroactively
asserted or denied without breaking chain verification. This is
specifically a COSMP extension, not a generic audit feature.

**Citations**: GDPR Article 6 (lawfulness of processing); GDPR
Article 30 (records of processing activities); Schrems II decision
on lawful basis for cross-border data transfer.

---

### Dimension 2.3: Tenant Visibility of Regulator Access

**Requirement**: When a regulator accesses tenant data, the tenant's
org admin sees it in real-time in their Security & Audit screen.
Tenant cannot block lawful access (obstruction concern), but
retains awareness. This is the core trust property: enterprises
accept regulator access only if they retain visibility.

**Foundation Current State**:

- `apps/api/src/routes/org.routes.ts` — `GET /api/v1/org/audit`
  returns audit events scoped to the caller's org (existing in
  12B). Read-side substrate present.
- 12B.4 frontend exposes Security & Audit screen scaffolding in the
  Otzar Control Tower at `/security` route (per route table in
  `src/App.tsx`).
- No regulator-specific event filtering exists yet because no
  REGULATOR principal exists (Dimension 2.1). Once 2.1 + 2.2 land,
  regulator access events will flow through the existing audit
  chain and surface via the existing /org/audit endpoint —
  contingent on the audit emission scoping (regulator events
  scoped to the tenant whose data was accessed).

**Gap Analysis**:

The substrate is GREEN — the audit chain + /org/audit endpoint +
frontend screen. The dimension is YELLOW because the *behavior*
("tenant sees regulator access in real-time") cannot be tested
until 2.1 + 2.2 land. There is no architectural blocker; this is a
downstream wiring task.

The trust property requires the regulator *cannot* suppress the
tenant-visible audit emission. The append-only trigger (Dimension
1.2 GREEN) enforces this at the database layer — even with
elevated privileges, the regulator cannot delete their access
record.

**Status**: YELLOW

**Recommended Remediation**:

- **Quick (12C.0 batch, contingent on 2.1 + 2.2 landing)**: Once
  REGULATOR principal exists, ensure regulator audit events
  surface via `/api/v1/org/audit` filtered to events targeting
  the tenant's org_entity_id. No new endpoint needed.
- **Medium (Section 12.5)**: Add a Security & Audit screen filter
  for "Regulator access" with a separate visual treatment so the
  org admin can spot it among general audit traffic.

**Cross-Section Interaction**: This dimension has zero new
remediation cost — it's the downstream wiring of 2.1 + 2.2. The
existing audit-chain (1.2) and /org/audit endpoint substrate carry
it.

**Patent Relevance**: None under Discipline B. Surfacing audit
events in a UI is conventional; the underlying audit chain
(1.2) is where the patent-relevant work lives.

**Citations**: GDPR Article 15 (right of access by data subject —
tenant analog); SOC 2 CC6.1 (logical access controls — visibility
of administrative access).

---

### Dimension 2.4: Jurisdiction-Aware Data Segregation

**Requirement**: Capsules and entities tagged by
jurisdiction-of-creation. Permissions scoped by data-subject
jurisdiction. A French regulator (CNIL) gets a different surface
than US FTC. Cross-border access requires explicit lawful basis
(intersects 2.2). EU resident data must be processable only under
GDPR-compatible bases when accessed.

**Foundation Current State**:

- `MemoryCapsule` schema (`schema.prisma:81-156`) — no
  `jurisdiction` or `data_subject_jurisdiction` field.
- `Entity` schema (`schema.prisma:22-52`) — no
  jurisdiction-of-residence field.
- `EntityComplianceProfile.jurisdiction String[]`
  (`schema.prisma:551`) — per-entity declaration, populated by
  tenant onboarding flow.
- `ComplianceFramework.jurisdiction String[]`
  (`schema.prisma:530`) — framework-level jurisdiction
  (HIPAA=`["US"]`, GDPR=`["EU","EEA"]`, etc.).
- `compliance.service.ts:80-145` — runtime predicates can be
  framework-jurisdiction-aware but not capsule-jurisdiction-aware.

**Gap Analysis**:

This is the same architectural work as Dimension 1.6 (Data
Residency). Adding `jurisdiction` to Entity + MemoryCapsule +
AuditEvent serves both dimensions: 1.6 (storage residency for
FedRAMP / GovCloud) and 2.4 (regulator jurisdictional scope).

**Cross-Section Interaction**: 2.4 ≡ 1.6. Same remediation.
Single Section 12.5 sub-box covers both. Do not double-count cost.

**Status**: RED (status follows 1.6).

**Recommended Remediation**: See 1.6. No additional work beyond
that sub-box.

**Patent Relevance**: None directly. Region tagging is
conventional. The intersection with cross-tenant hive intelligence
is patent-relevant (deferred to 3.5).

**Citations**: GDPR Articles 44-50; Schrems II (CJEU C-311/18);
HIPAA 164.308(a)(8) (evaluation in light of jurisdictional
context).

---

### Dimension 2.5: AI Agent Decisional Provenance

**Requirement**: When OSHA / EEOC / FTC investigates AI-mediated
discriminatory or harmful decisions, regulators need full
decisional context: what data the agent had access to, what
reasoning chain it used, what it was instructed to do, what it was
prevented from doing, what model + version produced the output. AI
agent reproducibility on demand for regulatory inquiry. EU AI Act
Articles 13 (transparency), 14 (human oversight), 15 (accuracy)
mandate this for high-risk AI systems.

**Foundation Current State**:

- `apps/api/src/services/otzar/otzar.service.ts:399-402` —
  `this.llmProvider.generateResponse({ system: systemPrompt, user:
  userPrompt })`. The LLM call point. The system + user prompts are
  built from layered context (`L1..L8`) at lines 382-397 but are
  not persisted.
- `otzar.service.ts:439-448` — `CONVERSATION_STARTED` audit emits
  `details: { conversation_id, twin_id }` only. No prompt content.
- `otzar.service.ts:592` — `CONVERSATION_CLOSED` audit emits
  `details: { conversation_id, capsule_id, capsule_ids_used,
  ... }`. The list of capsules that informed the conversation is
  captured at close-time.
- `OtzarConversation` table (`schema.prisma:1037-1050`) tracks
  `message_count` only — not message content.
- `COEOutcome` (`schema.prisma:632-645`) records per-session
  `tokens_loaded / tokens_used / success` — outcome-level, not
  reasoning-trace-level.
- LLM model + version + provider not recorded in audit; the
  `LLMProvider` abstraction (`apps/api/src/services/llm/llm.service.ts`
  per import) is interface-bound, not audit-emitting.

**Gap Analysis**:

Partial provenance exists: capsule_ids_used at close-time gives
*which* capsules informed a conversation, and the audit chain
(1.2) makes that record tamper-evident. What's missing for full
EU AI Act Article 14 / 15 reproducibility:

1. Per-message LLM input prompt snapshot (system + user content).
2. LLM model + version + temperature + provider tag.
3. Per-message output snapshot (already in `response` returned to
   caller, but not persisted).
4. Mapping from each message to the specific capsule_ids retrieved
   at *that* turn (not just close-time aggregate).

Items (1)-(4) are additive; the existing audit chain + capsule
provenance carry the tamper-evidence layer for free. The
remediation is moderate, not heavy.

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box)**: Add `DecisionRecord` model
  (one row per LLM invocation): `decision_id`, `conversation_id`,
  `message_index`, `system_prompt_hash` (SHA-256 of canonical form
  — store hash + actual content in object storage encrypted-at-rest
  to manage row size), `user_prompt_hash`, `model_id`,
  `model_version`, `temperature`, `output_hash`,
  `capsule_ids_consulted: String[]`, `actor_entity_id`,
  `target_entity_id`, `created_at`. Emit a new
  `AI_DECISION_RECORDED` audit event per invocation linking to the
  DecisionRecord. The hash+content split lets the audit chain
  verify integrity without making AuditEvent rows huge.
- Define a new compliance framework seed: `EU_AI_ACT` with
  `required_audit_events: ["AI_DECISION_RECORDED",
  "PERMISSION_CREATED"]` so high-risk-AI tenants surface
  framework-aware coverage automatically.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline B.

*Rationale*: The pattern "AI agent decisional reproducibility
anchored in the DMW-verified audit chain, where verifiable
attestation proves the agent at time T had access to capsules
{X,Y,Z} and produced output O under model M" specifically extends
US 12,164,537 (COSMP capsule structure) and US 12,399,904 (DMW)
into AI-governance territory. The novelty over generic "log AI
decisions with audit trail" prior art is two-part: (a) the capsule
provenance is the *retrieval substrate* (not just a log entry —
the capsules are first-class COSMP primitives whose access is
already governed by the patent claims), and (b) the audit-chain
verification is the *attestation primitive*, making the
reproducibility claim cryptographically defensible without needing
external timestamping. Commercial value: EU AI Act compliance + NYC
AEDT + California ADMT + emerging FTC AI rulemaking — large market
with thin platform-native coverage today.

**Citations**: EU AI Act Articles 13 (transparency for high-risk
AI), 14 (human oversight), 15 (accuracy / robustness / cybersecurity);
NYC Local Law 144 (AEDT bias audits); California ADMT regulations
(CPRA Rev. 2024); NIST AI Risk Management Framework AI RMF 1.0
(MEASURE, MANAGE functions).

---

### Dimension 2.6: Cross-Jurisdictional Treaty Compliance

**Requirement**: When a US regulator wants data physically located
in the EU, the path is MLAT (Mutual Legal Assistance Treaty) or a
specific framework (EU-US Data Privacy Framework, post-Schrems II).
Foundation must be aware of cross-jurisdictional requests and route
them through appropriate treaty paths — or at minimum recognize
when a request is cross-jurisdictional so the tenant's legal
counsel can intervene.

**Foundation Current State**:

- No request-routing layer. All regulator access (when it
  eventually exists per 2.1 + 2.2) would route through the same
  `/api/v1/cosmp/*` endpoints as tenant access.
- No model of "data physical location" (intersects 1.6 + 2.4).
- No model of "regulator jurisdiction vs data jurisdiction"
  comparison.

**Gap Analysis**:

This is genuinely Section-level work — beyond Foundation
primitives. The treaty-routing layer is operational +
legal-counsel + integration territory (e.g., MLAT requests go
through DOJ Office of International Affairs, not through an API).
What Foundation can usefully provide is *recognition*: when 2.1 +
2.2 + 2.4 land, Foundation can detect "regulator jurisdiction !=
capsule jurisdiction" and surface a flag for tenant legal review
before processing the access. The actual treaty navigation happens
outside the platform.

**Status**: INSUFFICIENT EVIDENCE

*Rationale for INSUFFICIENT*: This dimension is not a Foundation
primitive question. It's an operational + legal question that
*depends on* 1.6 / 2.1 / 2.2 / 2.4 landing first. Until those
exist, there's nothing concrete to evaluate at Foundation level.
After they land, the question becomes "should Foundation surface a
cross-jurisdictional flag?" which is a Quick-sized addition.

**Recommended Remediation**:

- **Quick (post-Section-12.5, after 2.1 + 2.2 + 2.4 land)**: Add a
  cross-jurisdictional detection check: when an access request's
  `actor.regulator_jurisdiction` does not include the
  `capsule.jurisdiction`, emit a
  `CROSS_JURISDICTIONAL_ACCESS_FLAGGED` audit event and surface
  the flag in the access response so calling code can route to
  legal review. The actual MLAT navigation is operational.

**Patent Relevance**: None under Discipline B. Treaty routing is
operational, not architectural.

**Citations**: MLAT framework (28 USC § 1782); EU-US Data Privacy
Framework (October 2023); Schrems II (CJEU C-311/18); CLOUD Act
2018.

---

### Dimension 2.7: Right-to-Explanation Surface for Affected Individuals

**Requirement**: GDPR Article 22, EU AI Act Articles 13-14, NYC
AEDT (Local Law 144), California ADMT all require that data
subjects can request explanation of AI-mediated decisions affecting
them. Different access pattern than regulators — the data subject
is requesting *their own* data and the decisions affecting them,
not auditing a tenant. Must be answerable without revealing other
data subjects' information (intersects selective disclosure / 3.2).

**Foundation Current State**:

- No "data subject" entity concept distinct from `PERSON` Member.
  Data subjects who are *not* tenant members (e.g., a job applicant
  whose resume an AI agent screened) have no representation in the
  schema.
- No request flow for non-tenant individuals to request explanation
  of decisions affecting them.
- The substrate that *would* answer such requests exists:
  CONVERSATION_LEARNING capsules in employee wallets,
  capsule_ids_used in CONVERSATION_CLOSED audit events, the
  DecisionRecord model proposed under 2.5.

**Gap Analysis**:

Foundation has no data-subject-facing exposure layer. The
right-to-explanation surface needs (a) a way for an external
individual to authenticate as the data subject, (b) a way to
*identify* which capsules / decisions affect them, (c) a
verifiable disclosure response that proves "this is what the AI
agent considered when making decision D about you" without
revealing other individuals' data.

(a) is conventional (signed assertion from a credentialing
authority — eIDAS in EU, ID.me / Login.gov in US). (b) requires a
*data-subject-index* on capsules — capsules tag which external
individuals they discuss. (c) is verifiable disclosure (intersects
3.2).

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box, pairs with 2.5 DecisionRecord)**:
  Add `DataSubjectReference` model: `reference_id`, `external_subject_id`
  (cryptographic hash of subject's verified credential),
  `capsule_id` or `decision_id` foreign key, `jurisdiction`
  (governs which framework's right-to-explanation applies).
  Capsules tag affected data subjects at create time. Add a
  `/data-subject/explanation-request` endpoint that authenticates
  external individuals and returns capsule provenance + decision
  records affecting them (with selective disclosure scaffolding —
  full ZK redaction is Heavy/3.2).
- This is paired build with 2.5 because DecisionRecord is the
  underlying primitive.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline B.

*Rationale*: The pattern "DMW-anchored verifiable explanation
delivered to a data subject under their own credential, where the
explanation is provable from COSMP capsule provenance without
exposing other data subjects' capsules" extends US 12,164,537 +
12,399,904 + 12,517,919 (the privacy-preserving aggregation patent)
into the right-to-explanation surface. The novelty over generic
"explanation API" prior art is (a) the capsule provenance is the
*explanation substrate* (not just a generated text — the actual
COSMP capsules consulted are the explanation), and (b) the
selective disclosure preserves multi-subject privacy via the same
hash + canonical form pattern that anchors the audit chain. This
specifically extends 12,517,919 territory into AI-decision-explanation
context.

**Citations**: GDPR Article 22 (automated individual decision-making);
GDPR Article 15 (right of access); EU AI Act Articles 13-14; NYC
Local Law 144 (AEDT); California ADMT (CPRA Rev. 2024); FTC
authority under FTC Act § 5 for unfair / deceptive AI practices.

---

### Dimension 2.8: Right-to-Deletion vs Audit Immutability

**Requirement**: GDPR Article 17 right-to-be-forgotten requires
removing personal data of EU data subjects. Audit-log immutability
(Dimension 1.2) requires never altering audit records. These
conflict directly. Standard resolution: pseudonymous identifiers in
audit logs (UUIDs, not names / emails / addresses), and a
*separate* deletable mapping table that links UUID → real identity.
When deletion is requested, the mapping is deleted; audit records
remain valid (UUIDs intact) but no longer link to the deleted
person.

**Foundation Current State**:

- `AuditEvent.actor_entity_id String? @db.Uuid` — UUID, not
  direct PII. Pseudonymous-via-UUID ✓.
- `AuditEvent.target_entity_id` and `target_capsule_id` — UUIDs ✓.
- `AuditEvent.details Json @default("{}")` — **free-Json escape
  hatch**. Services control what they put here. A service emitting
  `{ email: "alice@example.com" }` would put PII directly in the
  audit chain. Not currently audited or constrained.
- `Entity` schema (`schema.prisma:22-52`) — `email`, `display_name`,
  `password_hash` are direct PII columns. Soft delete via
  `deleted_at` (`entity.ts:217-218`).
- `packages/database/src/queries/capsule.ts:427-431` — JSDoc:
  `"Rule 10 -- nothing is ever hard deleted. Soft delete keeps the"`.
- `compliance.service.ts:99` — GDPR seed framework rule
  `right_to_erasure: true` is a *flag*, not an enforced
  primitive.
- No pseudonymization utility, no separate identity-mapping table,
  no GDPR-Article-17 deletion flow.

**Gap Analysis**:

Foundation's "Rule 10: nothing is ever hard deleted" architecture
explicitly conflicts with GDPR Article 17. The rule was sound for
audit integrity (1.2 GREEN derives from it) but predates the
elevated scope of this review.

The resolution path is well-known: pseudonymization-with-attestation.
Specifically:

1. UUIDs in audit_events are already pseudonymous — preserve.
2. Free-Json `details` becomes a *constrained* schema (typed event
   detail per AuditEventType) so PII cannot leak in via free-form
   service emissions.
3. PII columns on `Entity` (email, display_name) move to a
   separate `EntityIdentity` table with FK to Entity.entity_id.
   When right-to-erasure is invoked, the `EntityIdentity` row is
   hard-deleted; `Entity` row remains (with deleted_at + status =
   DELETED) so audit references still resolve to a UUID with
   "[redacted under GDPR Article 17]" display.
4. A `GDPR_ERASURE_EXECUTED` audit event is emitted, itself
   anchored in the audit chain, recording *that* erasure happened
   (without the erased identity content). This is the
   "verifiable attestation" component.

This is meaningful work — Section 12.5 sub-box at minimum,
potentially Heavy if combined with Dimension 3.7 (right-to-deletion
attestation).

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box, pairs with 3.7)**: (1) Move PII
  columns from Entity to a separate `EntityIdentity` table.
  (2) Constrain `AuditEvent.details` to typed event-detail schemas
  (one TypeScript discriminated union per AuditEventType, rejecting
  unknown keys at write time). (3) Add `eraseDataSubject()` flow:
  hard-deletes EntityIdentity row, marks Entity status=DELETED,
  emits GDPR_ERASURE_EXECUTED audit event into the chain.
  (4) Update `verifyAuditChain` to handle "[redacted]" identity
  references gracefully — chain integrity survives, identity
  resolution returns a sentinel.
- **Cross-Section Interaction**: This sub-box also delivers most of
  Dimension 3.7 (right-to-deletion attestation) — the
  GDPR_ERASURE_EXECUTED audit event IS the attestation. Don't
  double-count.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline B.

*Rationale*: The pattern "pseudonymization-with-verifiable-attestation
that preserves COSMP audit-chain hash integrity while honoring data
subject deletion requests" extends US 12,164,537 (COSMP) and
US 12,399,904 (DMW) into GDPR Article 17 territory. The novelty
over generic "log retention with deletion" prior art is the
*structural* preservation of chain integrity: the audit chain hash
covers UUID references, not PII, by deliberate construction; the
identity-mapping table is a separate primitive whose deletion does
not break chain verification. The verifiable-attestation component
(GDPR_ERASURE_EXECUTED event in the chain) provides a defensible
proof to the data subject that erasure occurred without exposing
the erased content. This specifically extends the COSMP capsule
provenance + DMW patents into a deletion-capable variant — a claim
shape with both technical novelty and a large commercial market.

**Citations**: GDPR Article 17 (right to erasure); GDPR Recital
65-66 (rationale for erasure); Article 29 Working Party WP259
(consent); CPRA § 1798.105 (California right to delete).

═══════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════

## Section 3: Enterprise Outbound Verification

**Section-level note:** Discipline C tightens patent-relevance
criteria. Each Section 3 [PATENT-RELEVANT] tag explicitly answers:
(a) extends COSMP capsule structure? (b) extends DMW boundary
semantics? (c) composes with existing audit chain via canonical
hash binding? Patterns answering "no" or "indirect" to all three
are flagged "novel but not patent-family extending."

### Dimension 3.1: Cryptographically-Attested Compliance Reports

**Requirement**: When an enterprise generates compliance evidence
for a customer / auditor / regulator / insurer, the report is
digitally signed by Foundation, timestamped, and verifiable by the
recipient without trusting the sender. Recipient verifies the
signature against Foundation's published key. This eliminates
"my-attestation-is-just-text" failures common in current GRC
practice — auditors cannot tell signed PDFs apart from edited
ones, customers cannot independently verify vendor compliance
claims.

**Foundation Current State**:

- `apps/api/src/routes/compliance.routes.ts:101-129` —
  `GET /api/v1/compliance/report` returns `ComplianceReport`
  JSON: `entity_id, framework, date_from, date_to, passed_count,
  failed_count, recent_failures: AuditEvent[]`.
- The endpoint returns plain JSON. No signature, no timestamping,
  no verifiable-credentials envelope.
- `compliance.service.ts:243-290` — `runComplianceChecks` emits
  `COMPLIANCE_CHECK_PASSED` / `COMPLIANCE_CHECK_FAILED` audit
  events. These ARE in the audit chain, so the underlying evidence
  has tamper-evidence (1.2 GREEN substrate). But the *report*
  packaging that surfaces evidence to external parties does not
  carry the chain hash forward.
- No Foundation public key for verification; no W3C Verifiable
  Credentials format support; no JWT or COSE signing of report
  bodies.

**Gap Analysis**:

The substrate is excellent — audit events are tamper-evident, the
predicate engine has run-time verdicts. What's missing is the
*packaging* layer: turning a query result into a recipient-verifiable
artifact.

Per Discipline C, two report variants must be distinguished:

(i) Generic signed-JSON-report variant: enterprise receives a JSON
report with a JWT/JWS signature over the body. Recipient verifies
signature against Foundation's published JWK. This is conventional
W3C Verifiable Credentials work — useful, but not patent-extending.

(ii) **Capsule-provenance-attested report variant**: report
embeds COSMP capsule provenance (which capsules informed which
compliance verdicts), the canonical hash of the audit-chain segment
the report covers, and selective-disclosure scaffolding. Recipient
verifies (a) the signature, (b) the chain hash matches Foundation's
published chain head at report timestamp, (c) the included capsule
provenance is internally consistent. This variant *is*
patent-extending under Discipline C.

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box)**: Add `ComplianceAttestation`
  model with signed-report payload + Foundation's signing key
  metadata. Add `POST /api/v1/compliance/attestation` that builds
  variant (ii) — report body includes `audit_chain_segment_hash`
  (canonical SHA-256 over the audit events covered by the report)
  + `capsule_provenance: { capsule_ids, capsule_types, count }`
  + `framework_verdict: { framework, passed, failed }`. JWT-sign
  the canonical body using a dedicated attestation key (asymmetric
  RS256 / ES256 — see Dimension 1.1 federated-verification
  remediation, where the key infrastructure is added). Add
  `GET /.well-known/jwks.json` for recipient verification.
- Pairs with 1.1's RS256/ES256 federated-verification path. The
  attestation key can be the same key.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline C —
*specifically* for the variant (ii) capsule-provenance-attested
form. The generic JWT-signed-report form is NOT patent-extending
and does not warrant the tag.

*Rationale*:
- Extends COSMP capsule structure? **YES** — the report
  *embeds* capsule provenance (capsule_ids + types + canonical
  reference) so that the compliance assertion is *backed by* the
  COSMP primitive, not just a derived statement.
- Extends DMW boundary semantics? **YES (indirect)** — the
  report respects the three-wallet boundary (org-wallet capsules
  surface; cross-wallet capsules are referenced by hash only,
  preserving the patent's portability claim).
- Composes with audit chain via canonical hash binding? **YES** —
  `audit_chain_segment_hash` is the canonical-form SHA-256 over
  audit events covered, identical to the canonical-record pattern
  in `audit.ts:178-191`. A recipient can independently verify the
  hash against Foundation's published chain head.

All three Discipline C criteria answered yes for variant (ii).

**Citations**: W3C Verifiable Credentials Data Model 2.0
(verifiable-credentials structure); RFC 7519 (JWT); RFC 8152 (COSE);
NIST SP 800-63A (Identity Assurance — credential verification).

---

### Dimension 3.2: Selective Disclosure with Zero-Knowledge Properties

**Requirement**: Prove compliance assertions without revealing more
than necessary. "We are HIPAA compliant" provable without exposing
PHI. "All AI agents logged reasoning" provable without exposing the
decisions themselves. Touches verifiable credentials with selective
disclosure (BBS+ signatures, JWT VC + claim hiding) and, for the
strongest properties, zero-knowledge proofs (Groth16, PlonK,
zk-SNARKs).

**Foundation Current State**:

- No ZK proof libraries (`@noble/*`, `circomlib`, `snarkjs`,
  `arkworks`) in `package.json`.
- No selective-disclosure JWT VC implementation.
- `compliance.service.ts` returns full predicate verdicts (passed
  / failed + reason) — no redaction layer.
- BBS+ / blind-signature primitives not present.

**Gap Analysis**:

This dimension is the heaviest in the entire review. ZK proof
infrastructure is genuinely substantial work — circuit design,
trusted setup ceremonies (or transparent setups for STARKs),
proof-generation tooling, verifier libraries on the recipient side.
Implementing this naively is a multi-quarter project; implementing
it well requires cryptography expertise.

The pragmatic path is staged:

- **Stage A (Section 12.5):** BBS+ signature implementation for
  selective-disclosure JWT VCs. Proves "this attestation was
  signed by Foundation; the disclosed fields are valid; the
  undisclosed fields exist but are hidden." This is conventional
  W3C VC work, not ZK in the strict sense. Feasible.
- **Stage B (Section-level future work):** Full zk-SNARK
  proofs for "we ran predicate P over audit events {E1..En}, and
  P returned compliant=true, without revealing the events." This
  is genuine ZK and substantial.

**Status**: RED (Stage A is medium; Stage B is heavy)

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box)**: Stage A — BBS+ signatures on
  ComplianceAttestation reports (Dimension 3.1). The variant (ii)
  patent-extending form pairs naturally with selective disclosure:
  the report body's claims are individually selectively disclosable
  (e.g., disclose framework_verdict.passed_count without disclosing
  recent_failures content).
- **Heavy (Section-level future work)**: Stage B — zk-SNARK
  predicate-evaluation proofs. Defer.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline C —
*specifically* for the variant where selective disclosure is
applied to COSMP capsule provenance, NOT for the generic ZK
infrastructure.

*Rationale*:
- Extends COSMP capsule structure? **YES** — the disclosure
  primitive operates over capsule_ids + capsule_types + provenance
  fields specific to COSMP. A recipient verifying a redacted
  attestation can confirm "the redacted capsules exist in the org
  wallet at chain head H" without learning their identities.
  This specifically extends 12,164,537.
- Extends DMW boundary semantics? **YES (strong)** — selective
  disclosure preserves the three-wallet boundary at the recipient:
  the recipient can verify that org-wallet capsules backed an
  attestation without crossing into PERSONAL or AI_AGENT wallets,
  which the patent's portability claim requires stay invisible.
- Composes with audit chain via canonical hash binding? **YES** —
  the canonical-form hash pattern from `audit.ts:140-156` extends
  to the selective-disclosure form: redacted fields are replaced
  by their canonical-form hashes, preserving overall chain
  integrity.

All three Discipline C criteria answered yes. Generic ZK
infrastructure (Stage B without COSMP binding) would NOT be
patent-extending — flag the IP territory carefully.

**Citations**: W3C Verifiable Credentials with selective
disclosure (BBS+ signatures, IETF draft-ietf-cose-bls-key-representations);
Camenisch-Lysyanskaya 2002 (anonymous credentials); Groth16 (2016)
zk-SNARK construction; Bünz et al. (2018) Bulletproofs.

---

### Dimension 3.3: Continuous Compliance State Versus Point-in-Time

**Requirement**: SOC 2 Type II, ISO 27001 continuous monitoring,
FedRAMP ConMon all require *continuous* compliance state, not
point-in-time snapshots. Foundation needs a queryable compliance
posture surface that evaluates the live state of controls and
returns the current verdict.

**Foundation Current State**:

- `compliance.service.ts:243-290` — `runComplianceChecks` evaluates
  per-operation verdicts, emitting COMPLIANCE_CHECK_PASSED /
  COMPLIANCE_CHECK_FAILED audit events.
- `compliance.service.ts:218-233` — `getApplicableFrameworks`
  returns the frameworks an entity is profiled under.
- `compliance.routes.ts:101-129` — `GET /compliance/report` returns
  passed/failed counts over a date range. This is point-in-time
  aggregation of past checks, not live state.
- No `/compliance/state` endpoint that returns current control
  posture.
- No background process that periodically re-evaluates predicates
  to detect newly-non-compliant state.

**Gap Analysis**:

The runtime predicate engine is genuinely advanced (per Framing A
from Checkpoint 1). What's missing is two things:

(i) A poll-friendly `GET /compliance/state` endpoint that returns
the live compliance posture (per-framework: compliant=true/false,
since=T, last_check=T, evaluated_against_N_operations).

(ii) A periodic re-evaluation loop that runs predicates over
recent activity windows, surfacing drift as audit events.

Neither is heavy work. The substrate carries most of the lift —
this is wiring + a small endpoint + a scheduler hook.

**Status**: YELLOW

**Recommended Remediation**:

- **Quick (12C.0 batch)**: Add `GET /api/v1/compliance/state`
  endpoint that returns per-framework posture aggregated from
  recent COMPLIANCE_CHECK_* audit events. Returns
  `{ framework, compliant, since, last_check, sample_failure_count_24h }`
  per applicable framework. Read-only; computes from existing audit
  chain.
- **Medium (Section 12.5)**: Add periodic compliance-evaluation
  loop (extends the existing scheduler pattern at
  `apps/api/src/services/feedback/scheduler.ts`) that runs framework
  predicates over a sliding window and emits drift events.

**Cross-Section Interaction**: 3.3 leverages the compliance.service.ts
runtime engine (Framing A substrate) and the audit chain (1.2
GREEN). No new primitives required.

**Patent Relevance**: None under Discipline C.

*Rationale*: Generic continuous-monitoring endpoint pattern. Does
not extend COSMP capsule structure (the endpoint reads audit
verdicts; capsules are not the substrate). Does not extend DMW
boundary semantics. Does not introduce a novel canonical-hash
binding. Conventional ConMon work.

**Citations**: NIST 800-53 Rev 5 CA-7 (Continuous Monitoring);
SOC 2 Type II Trust Services Criteria CC4.1 (monitoring activities);
ISO 27001 Annex A.18 (compliance with legal requirements); FedRAMP
ConMon strategy guide.

---

### Dimension 3.4: Compliance-Control-to-System-Evidence Binding

**Requirement**: SOC 2 has 64+ Common Criteria + Trust Services
Criteria. ISO 27001 has 93 Annex A controls. NIST 800-53 Rev 5 has
hundreds. Each control needs evidence — system logs, configuration
state, access reviews, training records. Foundation needs to bind
audit events and system state to specific control IDs so SSP
authoring, SOC 2 evidence packaging, and continuous-control
monitoring become queries against existing data rather than manual
table-walking.

**Foundation Current State**:

- `ComplianceFramework.required_audit_events String[]`
  (`schema.prisma:534`) — coarse mapping (framework → list of
  AuditEventType literals).
- `compliance.service.ts:80-145` — seven seed frameworks each
  carry `required_audit_events` arrays. This is framework-level
  binding, not control-level.
- No `control_id` or `nist_control` field on `AuditEvent`,
  `Permission`, `MemoryCapsule`, or any other model.
- No SSP-evidence-package generator.

**Gap Analysis**:

This dimension is the same architectural work as Dimension 1.8
(NIST 800-53 control mapping). Adding a `control_mappings` module
+ control-tag fields on key models serves both dimensions.

**Cross-Section Interaction**: 3.4 ≡ 1.8. Single Section 12.5
sub-box covers both. Do not double-count remediation.

**Status**: YELLOW (status follows 1.8)

**Recommended Remediation**: See 1.8. No additional work beyond
that sub-box. The SSP-evidence-package generator is an additive
output pattern that consumes the same control_mappings module.

**Patent Relevance**: None under Discipline C.

*Rationale*:
- Extends COSMP capsule structure? **NO** — control_id field on
  AuditEvent is conventional schema work; capsule structure
  unchanged.
- Extends DMW boundary semantics? **NO** — control mapping is
  cross-cutting metadata, not boundary-aware.
- Composes with audit chain via canonical hash binding?
  **INDIRECT** — control_id would be in the canonical hash input
  (since AuditEvent fields are hashed), but adding a field is not
  itself a novel hash-chain pattern. Generic schema extension.

All three Discipline C criteria answered no/indirect. **Novel
but not patent-family extending.** Large compliance value;
conventional implementation.

**Citations**: NIST 800-53 Rev 5 control catalog; SOC 2 Trust
Services Criteria 2017 (TSP 100); ISO 27001:2022 Annex A; FedRAMP
SSP Template guidance; CSA Cloud Controls Matrix v4 (cross-
framework mapping).

---

### Dimension 3.5: Cross-Tenant Compliance Benchmarking Without Data Leakage

**Requirement**: Enterprises want to know "how does our AI
oversight compare to peer institutions?" without revealing data
and without learning peers' data. Standard pattern: a privacy-
preserving aggregation layer that produces anonymized statistics
across many tenants while guaranteeing individual tenant data
never leaves its boundary. Hive-intelligence pattern from existing
patent family applied to compliance metrics.

**Foundation Current State**:

- `Hive` model (`schema.prisma:476-496`) — many-entity collective
  with `aggregate_capsule_id` (a single MemoryCapsule holding the
  anonymized aggregate). JSDoc at lines 463-475: *"the system
  computes an anonymized aggregate (common topic tags across
  members) and stores it as a single MemoryCapsule that every
  active member can read. The aggregate NEVER contains individual
  entity_ids -- privacy is enforced at build time."*
- `HiveMembership` (`schema.prisma:503-521`) — tracks per-entity
  contribution_scope + access_scope + capsule_types_contributed.
- `MonetizationSuggestion` schema comment (`schema.prisma:990-1006`)
  — *"PRIVACY-CRITICAL: rows in this table NEVER contain accessor
  identity. ... See patent claim US 12,517,919 + the privacy
  invariant test in tests/unit/feedback.test.ts."* The privacy-
  preserving aggregation pattern is BOTH the patent claim AND
  enforced by an existing test.
- `apps/api/src/services/hive/hive.service.ts` (referenced from
  `server.ts:20`) — Hive aggregation logic.

**Gap Analysis**:

Foundation has the Hive primitive AND a documented privacy-
preserving aggregation pattern protected by US 12,517,919. The
compliance-benchmarking dimension is a *direct extension* — apply
the same pattern to compliance metrics (control coverage rates,
audit-event-frequency distributions, AI oversight scores) instead
of to capsule content.

What's net-new: a `ComplianceMetricHive` (or extension to existing
HiveType enum) that aggregates per-tenant compliance posture into
anonymized cross-tenant percentiles. The aggregate is itself a
COSMP MemoryCapsule (per the existing pattern), maintaining the
patent's structure.

**Status**: YELLOW

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box)**: Add `COMPLIANCE_BENCHMARK` to
  `HiveType` enum. Add a new compliance-metric aggregation job
  that reads per-tenant `compounding_metrics` + framework-pass-
  rates and writes anonymized aggregate capsules. Surface via
  `GET /api/v1/compliance/benchmark` returning the org's percentile
  positioning across the COMPLIANCE_BENCHMARK hive, with no
  identifiable peer data exposed.
- The implementation pattern mirrors the existing
  MonetizationSuggestion privacy invariant — `GROUP BY` on
  framework + capsule_type only, NEVER on individual tenant
  entity_id. Reuse the `feedback.test.ts` privacy-invariant test
  pattern.

**Cross-Section Interaction**: Direct leverage of existing Hive
+ MonetizationSuggestion privacy patterns. Only the metric pipeline
is net-new.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline C —
strongest direct extension of US 12,517,919.

*Rationale*:
- Extends COSMP capsule structure? **YES** — the cross-tenant
  benchmark IS a COSMP MemoryCapsule (extending the existing Hive
  aggregate_capsule pattern). The capsule provenance carries
  metric-domain extensions (framework_id, percentile_position) that
  are novel relative to the existing intelligence-aggregate
  pattern.
- Extends DMW boundary semantics? **YES (strong)** — the three-
  wallet boundary is preserved at the metric layer: per-tenant
  metrics never leave the tenant wallet; only the anonymized
  aggregate is cross-wallet visible (via the existing Hive
  membership pattern). This directly extends the patent's
  portability claim into the compliance-metric domain.
- Composes with audit chain via canonical hash binding? **YES** —
  benchmark capsule construction emits PERMISSION_CREATED +
  HIVE_AGGREGATE_BUILT audit events, anchoring the construction in
  the existing chain. The aggregate's content_hash is computed
  identically to other capsules.

All three Discipline C criteria answered strongly yes. **Direct
continuation of US 12,517,919 into compliance benchmarking
domain** — the cleanest patent territory in the review for a
direct continuation rather than a new claim shape.

**Citations**: Differential privacy (Dwork & Roth 2014); k-anonymity
(Sweeney 2002); ISO/IEC 20889 (privacy enhancing data de-identification
techniques); NIST IR 8053 (de-identification); existing US 12,517,919.

---

### Dimension 3.6: Verifiable AI Agent Behavior Attestation

**Requirement**: Enterprise tells customer "our AI agent never
accessed your data outside the scope you authorized." Must be
cryptographically provable. Tamper-evident logs. Customer auditor
can verify without enterprise cherry-picking. This is potentially
the highest-value commercial claim in the AI-agent governance
market — verifiable AI behavior attestation via DMW-anchored audit
chain.

**Foundation Current State**:

- `apps/api/src/services/cosmp/share.service.ts` — Share /
  permission grants are linked to COSMP capsules + audit events.
- `audit.ts` AuditEventType union includes `PERMISSION_CREATED`,
  `PERMISSION_REVOKED`, `CAPSULE_CONTENT_READ`,
  `CAPSULE_METADATA_READ` — every AI-agent action against a
  customer's capsules generates an auditable event.
- `Permission.bridge_id` (`schema.prisma:281`) — permissions in the
  same SHARE share a bridge_id, enabling "this scope was the
  customer's authorization" provability.
- AI agent identity primitives (`AI_AGENT` EntityType + `TwinConfig`)
  exist; the agent's actions chain in audit-of-record under its
  own actor_entity_id.
- No customer-facing attestation export. No "prove this agent's
  behavior was within scope X" endpoint.

**Gap Analysis**:

The substrate is genuinely strong — every agent action is audit-
chained, every grant has a bridge_id linking to the original
customer authorization. What's missing is the customer-facing
*export*: take a bridge_id + a date range, produce a signed
attestation that says "agent A's actions against capsules in
bridge B during window W were limited to scopes [METADATA_ONLY,
SUMMARY], with N read events all chained in audit-of-record."

This depends on Dimension 2.5 (DecisionRecord) for full
"reasoning provenance" — without DecisionRecord, the attestation
covers actions but not reasoning. With DecisionRecord, the
attestation also covers "what the agent considered when deciding."

**Cross-Section Interaction**: Patent territory consolidates with
2.5 (DMW-anchored AI decisional reproducibility). The attestation
export is the *customer-facing surface* of the same primitive.
Patent counsel may collapse 2.5 + 3.6 into one continuation
claim covering both reproducibility and attestation; flagged
separately for completeness but they should not be priced as two
patents.

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box, pairs with 2.5 + 3.1)**: Add
  `POST /api/v1/compliance/agent-attestation` endpoint that
  accepts `{ agent_entity_id, bridge_id, customer_entity_id,
  window: { start, end } }` and returns a signed attestation
  (variant (ii) from 3.1) covering all agent actions in scope.
  Body includes audit_chain_segment_hash (over the agent's audit
  events in the window), capsule_provenance, scope_assertion (max
  scope used + number of reads + number of writes blocked by
  scope). JWT-signed via the same key as 3.1.
- Requires 2.5 DecisionRecord to be feature-complete; otherwise
  the attestation covers only access patterns, not reasoning.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline C —
**but consolidates with 2.5 patent territory; treat as one claim
family, not two**.

*Rationale*:
- Extends COSMP capsule structure? **YES** — attestation export
  embeds the agent's per-capsule access record from the existing
  COSMP Permission model.
- Extends DMW boundary semantics? **YES** — attestation respects
  the three-wallet boundary; cross-wallet access is referenced
  by hash, never by content.
- Composes with audit chain via canonical hash binding? **YES** —
  audit_chain_segment_hash binds the attestation to a specific
  point in Foundation's audit chain. Recipient can independently
  verify the chain head against Foundation's published state.

All three Discipline C criteria yes. **Same patent family as 2.5.**
Patent counsel will likely consolidate the claim shape.

**Citations**: NIST AI RMF 1.0 (MEASURE function — measurement of
AI risks, GOVERN function — accountability); ISO/IEC 23894:2023
(AI guidance on risk management); EU AI Act Article 14 (human
oversight); FTC enforcement under FTC Act § 5 for AI claims.

---

### Dimension 3.7: Right-to-Deletion / Right-to-Be-Forgotten Attestation

**Requirement**: When data subject exercises right-to-deletion,
enterprise must prove deletion happened. Audit logs reference
pseudonymous IDs (per Dimension 2.8); the *attestation that
pseudonymization happened correctly* is itself a verifiable
assertion the data subject and regulators can verify.

**Per Discipline D**: Section 2.8 already delivers most of 3.7.
The `GDPR_ERASURE_EXECUTED` audit event proposed under 2.8 IS the
right-to-deletion attestation primitive. Don't re-analyze the same
architecture.

**Foundation Current State**: See Dimension 2.8.

**Gap Analysis (residual after 2.8 covers GDPR):**

What 2.8 covers: GDPR Article 17 erasure attestation via
GDPR_ERASURE_EXECUTED event in the audit chain.

What 2.8 does *not* cover and 3.7 must address:

1. **Non-GDPR jurisdiction erasure**: CCPA/CPRA right-to-delete
   (California) has different procedural requirements than GDPR
   Article 17 — different verification methods for the requesting
   data subject, different exception lists, different response
   timelines. The attestation event needs jurisdiction tagging
   (intersects 1.6 / 2.4) so a single deletion attestation can
   surface differently for GDPR vs CCPA recipients.
2. **Non-erasure deletions**: an enterprise admin deletes a
   capsule for tenant-internal reasons (not subject-driven). The
   audit chain already records this via `CAPSULE_DELETED`, but
   the attestation surface (3.1) should include these
   non-erasure deletions when generating a "what was deleted in
   the last quarter" report for SOC 2 evidence.
3. **Pseudonymization-quality attestation**: 2.8 deletes the
   identity-mapping row but should *also* attest to the deletion
   methodology (e.g., "no PII was retained in audit details JSON
   — confirmed via the typed-detail-schema constraint").

**Status**: YELLOW (mostly covered by 2.8; residual is small)

**Recommended Remediation**:

- **Quick (12C.0 batch, post-2.8)**: Add jurisdiction tagging to
  the GDPR_ERASURE_EXECUTED audit event (rename to
  ERASURE_EXECUTED with jurisdiction field). Add CCPA/CPRA
  variant detection in the eraseDataSubject flow. Add a
  pseudonymization-quality assertion to the attestation
  (boolean: "no_pii_in_details=true" computed from the typed
  schema check).

**Cross-Section Interaction**: **2.8 delivers ~80% of 3.7.**
Single Section 12.5 sub-box for 2.8; 3.7 residual is a small
follow-on quick-fit.

**Patent Relevance**: None additional under Discipline C.

*Rationale*: The patent territory was claimed under 2.8
(pseudonymization-with-verifiable-attestation preserving hash-
chain integrity). 3.7's residual work (jurisdiction tagging,
non-erasure deletion attestations) is conventional schema +
endpoint work; does not extend COSMP, does not extend DMW
beyond what 2.8 already does, does not introduce a new canonical-
hash binding pattern. **Novel but not patent-family extending**
beyond 2.8's claim.

**Citations**: GDPR Article 17 (covered by 2.8); CPRA § 1798.105
(California right to delete); CCPA § 1798.105; LGPD Article 18
(Brazil); UK GDPR Article 17.

---

### Dimension 3.8: Compliance State as Part of Capsule Provenance

**Requirement**: Every COSMP capsule carries provenance per the
existing patent family. Extend the capsule provenance to carry
compliance state at time of creation: "this decision was made
under SOC 2-attested controls" or "this data was processed under
HIPAA-covered-entity protocols." Small schema addition; massive
compliance value. Per Framing A pre-Section-3 hint: "may be the
cleanest patent continuation in the entire review."

**Foundation Current State**:

- `MemoryCapsule` schema (`schema.prisma:81-156`) provenance fields:
  `created_by`, `created_session_id`, `write_reason`, `updated_by`,
  `updated_session_id`, `previous_version`, `created_at`,
  `last_updated_at`. No compliance-state-at-creation field.
- `MemoryCapsule.content_hash` (`schema.prisma:116`) — SHA-256 of
  encrypted ciphertext per `crypto.ts:90-94` JSDoc.
- `ComplianceFramework` model exists; `EntityComplianceProfile`
  attaches frameworks to entities; no link from MemoryCapsule
  back to the framework state under which the capsule was
  created.
- `compliance.service.ts:243-290` — runComplianceChecks runs
  per-operation. The verdict is an audit event; it is *not*
  embedded in the capsule.

**Gap Analysis**:

The capsule provenance pattern is robust. Adding a
`compliance_attestation_at_creation` field — a JSON object
recording the framework verdict + control posture at write time —
makes every capsule self-attesting. A consumer reading capsule C
six months later can verify (a) the capsule's content_hash, (b)
the provenance fields, AND (c) the compliance posture under
which it was created — all from the capsule itself.

This is the *direct* extension of US 12,164,537 (COSMP capsule
structure) flagged in Framing A as the cleanest patent
continuation. The schema change is small; the implementation is
tight (run runComplianceChecks at write time, embed verdict).
The commercial value is large — every existing GRC platform
treats compliance posture as separate metadata; treating it as
*part of capsule provenance* is genuinely novel.

**Status**: RED

**Recommended Remediation**:

- **Medium (Section 12.5 sub-box, paired with 1.6 jurisdiction +
  3.4 control mapping)**: Add `compliance_attestation_at_creation
  Json @default("{}")` to MemoryCapsule. Schema:
  `{ frameworks: [{ name, verdict, controls_satisfied: [string] }],
  jurisdiction: string[], audit_event_id }`. Populate at write
  time by calling runComplianceChecks against the capsule's
  context. Include in canonical content_hash input so tampering
  detectable.
- This sub-box pairs with 1.6 (jurisdiction tagging) and 3.4 /
  1.8 (control mapping) — they share write-time wiring. Combine
  into one Section 12.5 build.

**Patent Relevance**: **[PATENT-RELEVANT]** under Discipline C —
**direct continuation of US 12,164,537**.

*Rationale*:
- Extends COSMP capsule structure? **YES (direct)** — adds a new
  provenance field to the COSMP capsule primitive itself. This is
  the most direct possible extension of 12,164,537's claim shape.
- Extends DMW boundary semantics? **YES** — capsule-level
  compliance attestation respects wallet boundaries; per-wallet
  attestations carry per-wallet compliance posture (org wallet
  may be under SOC 2, personal wallet under GDPR consent
  framework).
- Composes with audit chain via canonical hash binding? **YES** —
  the attestation field is included in the capsule's content_hash
  AND the capsule creation generates a CAPSULE_CREATED audit
  event whose canonical form covers the attestation. Tampering
  with the attestation breaks both the capsule hash AND the audit
  chain.

All three Discipline C criteria answered strongly yes.
**Likely the cleanest patent continuation in the entire
review.** Small schema delta, large compliance value, direct
claim shape on US 12,164,537.

**Citations**: Existing US 12,164,537 (COSMP capsule structure);
NIST 800-53 Rev 5 SI-12 (Information Management and Retention);
ISO 27001 Annex A.5.33 (protection of records); EU AI Act
Article 12 (record-keeping requirements).

═══════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════

## Cross-Cutting Tensions

The 24-dimension analysis surfaces five places where dimensions
pull in opposing directions and require explicit architectural
resolution rather than independent remediation.

### Tension 1 — Right-to-deletion (2.8) vs Audit immutability (1.2)

**The conflict:** Foundation's "Rule 10: nothing is ever hard
deleted" (`packages/database/src/queries/capsule.ts:427-431`) is
the architectural property that makes Dimension 1.2 GREEN — append-
only triggers, hash chain, advisory-lock serialization. GDPR
Article 17 requires hard deletion of personal data on data subject
request. Naively, these are mutually exclusive.

**Resolution: pseudonymization-with-verifiable-attestation.**

The hash chain is structurally compatible with deletion *if* the
chain hash covers UUIDs only — which it already does today (every
`actor_entity_id`, `target_entity_id`, `target_capsule_id` field
is `String? @db.Uuid`). The PII (email, display_name, profile
fields) lives on Entity / EntityProfile / EntityIdentity rows
referenced by UUID, not embedded in audit rows.

Three structural moves complete the resolution:

1. **Move PII to a separate `EntityIdentity` table** (FK to
   Entity.entity_id). Audit rows reference Entity by UUID; the
   UUID survives erasure, the PII row does not.
2. **Constrain `AuditEvent.details Json`** to typed schemas (one
   TypeScript discriminated union per AuditEventType). This closes
   the free-Json escape hatch where a service could currently leak
   PII into the audit chain.
3. **Add `ERASURE_EXECUTED` AuditEventType** chained in audit-of-
   record. The chain hash covers the erasure event itself —
   making the deletion *verifiable* without leaking what was
   erased.

Chain integrity survives erasure by construction. `verifyAuditChain`
walks UUIDs; identity resolution returns "[redacted under GDPR
Article 17]" for erased entities. The data subject receives a
verifiable attestation that erasure occurred (the
ERASURE_EXECUTED event, signed by Foundation's attestation key).

This pattern is itself [PATENT-RELEVANT] — see Patent-Relevance
Catalog, Family 4.

### Tension 2 — Per-tenant residency (1.6) vs Cross-tenant benchmarking (3.5)

**The conflict:** Per-tenant jurisdictional segregation requires
that EU resident data stay in EU storage, US tenant data stay in
US storage, etc. Cross-tenant aggregate metrics require pulling
data across tenants to compute peer benchmarks.

**Resolution: anonymization layer with meta-jurisdictional
aggregates.**

The existing Hive primitive (`schema.prisma:476-496`) already
implements the privacy-preserving aggregation pattern protected by
US 12,517,919 — the aggregate capsule contains no per-entity
identifiers; aggregation is enforced at *build time*. Extending
this into compliance benchmarking respects the residency boundary
naturally:

1. **Per-tenant data stays per-tenant.** Individual compliance
   metrics (per-tenant control coverage, per-tenant audit-event
   distributions) are tagged with the tenant's jurisdiction
   (EU / US / etc.) and never leave the tenant's wallet boundary.
2. **Aggregate capsules carry meta-jurisdiction tags.** The cross-
   tenant aggregate is itself a COSMP capsule (per existing Hive
   pattern); it can be tagged "EU-aggregate" (built only from
   EU-resident tenant contributions) or "US-aggregate" (built
   only from US-resident tenant contributions) so cross-
   jurisdictional benchmarking respects treaty boundaries.
3. **Mixed aggregates only across consenting jurisdictions.** A
   "global compliance benchmark" capsule could exist but only
   from tenants who declared consent for cross-jurisdictional
   aggregation — opt-in, not default.

This composes the existing 12,517,919 invariant with the proposed
1.6 jurisdiction tagging. Same Section 12.5 sub-box dependency
chain.

### Tension 3 — Multi-person integrity (1.5) vs Operational velocity

**The conflict:** Dual-control on every privileged action would
destroy throughput. A FedRAMP High deployment cannot tolerate
that, but the schema primitive must exist or rework is required.

**Resolution: enumerated dual-control set.**

The `EscalationRequest` model gates only an explicitly enumerated
list of operations — an **enumerated set, not a general primitive**
(dual-control on every privileged action would destroy throughput;
the gate is conservative by construction).

**Amendment (sub-phase B of the Sub-box 2 Phase 1 arc; commit
[SEC-TENSION-3-AMENDMENT]):** the original 6-operation enumeration
was ahead of the substrate at the time of writing. Substrate-state
verification at the Sub-box 2 Phase 1 pre-flight (per RULE 13 +
RULE 18) confirmed that 5 of the 6 named operations do not yet exist
as Fastify routes — operation 1 (account creation with
`can_admin_niov`) is not a route today (account creation operates at
`can_admin_org` tier in `apps/api/src/routes/auth-admin.routes.ts`);
operations 4 + 5 (REGULATOR access grant + lawful-basis attestation)
require Sub-box 3/4 substrate that has not yet shipped; operation 2
(audit-trigger-disable) is DB-tier substrate per ADR-0002 and is not
route-gateable; operation 3 (Capsule mass-deletion) contradicts
RULE 10 (Capsules are soft-deleted via `deleted_at` per
`packages/database/prisma/schema.prisma:35` + `:153` + `:165` with
`@@index([deleted_at])`; bulk hard-delete is not a substrate
operation); operation 6 (TAR clearance-ceiling mutation) has a
service-tier flow at `apps/api/src/services/tar.ts:407` but no
Fastify route surfaces it today. The substrate-honest reframe below
organizes the 6 operations into 4 categories, preserving the
"enumerated set, not a general primitive" architectural principle
while correcting the substrate-state framing. The `EscalationType`
enum value `DUAL_CONTROL_REQUIRED` (schema-canonical at
[SEC-DUAL-CONTROL-ENUM] `b34c5cf`) is the canonical escalation type
for category (1) LIVE operations.

**Category (1) — LIVE Phase 1 bindings (substrate-active at
sub-phases F + G of the Sub-box 2 Phase 1 arc):**

- **Operation A — `PATCH /api/v1/platform/monetization/config`**
  (the 70/30 revenue-split mutation; `can_admin_niov`-gated; the
  highest economic-impact substrate operation in the Foundation —
  a change affects every holder's monetization economics).
  Substrate-state observation: the route exists today at
  `apps/api/src/routes/platform.routes.ts`; the `requireDualControl`
  Fastify preHandler binds here. Forward path: LIVE at sub-phase F
  `[SEC-DUAL-CONTROL-BINDING-CONFIG]`.
- **Operation B — `POST /api/v1/platform/orgs`** (org creation;
  Dandelion Phase 0; `can_admin_niov`-gated; provisions new tenants
  on the Foundation). Substrate-state observation: the route exists
  today at `apps/api/src/routes/platform.routes.ts`; the
  `requireDualControl` Fastify preHandler binds here. Forward path:
  LIVE at sub-phase G `[SEC-DUAL-CONTROL-BINDING-ORGS]`.

**Category (2) — Forward-substrate route-tier operations (land as
LIVE bindings when the target substrate ships):**

- **Operation 1** (original Tension 3 entry: "Account creation with
  `can_admin_niov`"). Substrate-state observation: no
  `can_admin_niov`-tier account-creation route exists today; account
  creation operates at `can_admin_org` tier in
  `apps/api/src/routes/auth-admin.routes.ts`. The substrate-honest
  reframe: high-stakes account creation should be dual-control-gated
  regardless of admin tier; this becomes a LIVE binding at Sub-box 2
  Phase 2 once the substrate-state observation surfaces the canonical
  scope. Forward path: Sub-box 2 Phase 2 LIVE binding.
- **Operation 4** (original Tension 3 entry: "Regulator access
  grant"). Substrate-state observation: the `EntityType` enum at
  `packages/database/prisma/schema.prisma:343-350` is `PERSON /
  COMPANY / AI_AGENT / DEVICE / APPLICATION / GOVERNMENT` — no
  `REGULATOR` value. REGULATOR substrate is explicitly Sub-box 3
  territory per this document's "Engineering surface" Sub-box
  enumeration. Forward path: LIVE binding at Sub-box 3 when the
  REGULATOR EntityType ships.
- **Operation 5** (original Tension 3 entry: "Lawful-basis
  attestation issuance with no documented reference"). Substrate-state
  observation: no lawful-basis attestation substrate exists today;
  this is Sub-box 3/4 territory (REGULATOR + Lawful-Basis at
  Sub-box 3; DecisionRecord + DataSubjectReference + Agent
  Attestation at Sub-box 4). Forward path: LIVE binding at Sub-box 3
  or 4 when the lawful-basis substrate ships.
- **Operation 6** (original Tension 3 entry: "TAR mutation lifting
  clearance ceiling above a threshold"). Substrate-state observation:
  `clearance_ceiling` exists on the TAR per
  `packages/database/prisma/schema.prisma`; a service-tier update
  flow exists at `apps/api/src/services/tar.ts:407`; no Fastify route
  currently surfaces this mutation. Forward path: Sub-box 2 Phase 2
  or 3 LIVE binding when the route substrate surfaces.

**Category (3) — DB-tier substrate (not route-gateable; dual-control
enforced at the PostgreSQL role-permission tier, not the Fastify
preHandler tier):**

- **Operation 2** (original Tension 3 entry: "Audit-trigger-disable
  attempts"). Substrate-state observation: the
  `audit_events_immutable` BEFORE DELETE trigger is DB-level per
  ADR-0002 — this is DDL substrate, not a Fastify route. The
  dual-control enforcement on this operation lives at the PostgreSQL
  role-permission tier: the database role required to drop the trigger
  has its credentials dual-control-gated at the secrets-management
  substrate. Forward path: substrate-honest documentation that this
  operation's dual-control enforcement is architecturally distinct
  from category (1) LIVE bindings — it is NOT in the
  `requireDualControl` middleware scope; the secrets-management
  substrate documents the role-credential dual-control discipline per
  ADR-0002.

**Category (4) — RULE-10-retired (substrate-canonical entry retired
as incompatible with a Foundation invariant):**

- **Operation 3** (original Tension 3 entry: "Capsule mass-deletion
  exceeding N capsules in a single operation"). Substrate-state
  observation: per RULE 10 (the Capsule soft-delete invariant —
  "Nothing is ever deleted"), Capsules are soft-deleted via the
  `deleted_at` field (`schema.prisma:35` + `:153` + `:165` with
  `@@index([deleted_at])`); bulk hard-delete of Capsules is not a
  substrate operation in the Foundation. The "mass-deletion" framing
  contradicts RULE 10 and is retired from the substrate-canonical
  enumeration. Forward path: none — the substrate-state observation
  closes this entry as architecturally incompatible with Foundation
  invariants.

**Category cross-references:** category (1) LIVE bindings land at
sub-phases F (`[SEC-DUAL-CONTROL-BINDING-CONFIG]`) + G
(`[SEC-DUAL-CONTROL-BINDING-ORGS]`) of the Sub-box 2 Phase 1 arc (10
commits A-J; ADR-0026 at sub-phase H bundles the full dual-control
middleware + privileged-endpoint-registry + per-route-binding
discipline pattern; ADR-0028 at sub-phase J documents the
Elixir/BEAM coordination-layer forward-substrate). Category (2)
forward-substrate operations land at their respective Sub-box scopes
(operation 1 → Sub-box 2 Phase 2; operations 4 + 5 → Sub-box 3/4;
operation 6 → Sub-box 2 Phase 2 or 3). Category (3) DB-tier substrate
is documented at the secrets-management register per ADR-0002.
Category (4) is retired per RULE 10. The implementation-facing
per-operation canonical record (route paths, authorization tiers,
Zone U1 audit substrate, dual-control enforcement mechanisms, the
`EscalationRequest` model fields, the `escalation.service.ts`
surface, the `requireDualControl` verification flow, the Zone U1
audit-event sequence, the 6 BEAM-compatibility patterns, the
10-commit arc) is at
`docs/architecture/dual-control-operations-canonical-record.md`
(landed at sub-phase C `[SEC-DUAL-CONTROL-CANONICAL-RECORD]`).

Everything else stays single-actor. The schema primitive is
present, the runtime gate is conservative, throughput is preserved
for the routine 99% of admin operations.

### Tension 4 — Generic signed reports (3.1-i) vs Capsule-provenance-attested reports (3.1-ii)

**The conflict:** Both report variants have legitimate use cases.
Generic JWT-signed JSON reports cover SOC 2 evidence packages where
auditors want a portable artifact; capsule-provenance-attested
reports cover high-value verification where a customer's auditor
wants cryptographic backing for vendor compliance claims.

**Resolution: ship both, distinguish in product positioning.**

- **Variant (i)**: `GET /api/v1/compliance/report` (extends
  existing endpoint with a JWT signature wrapping the existing
  JSON body). Conventional W3C Verifiable Credentials work. Useful
  product feature; **NOT patent-extending**.
- **Variant (ii)**: `POST /api/v1/compliance/attestation` (new
  endpoint). Body embeds COSMP capsule provenance +
  `audit_chain_segment_hash` + framework verdict. Recipient can
  verify against Foundation's published chain head. **Patent-
  extending under Discipline C** (see Family 5).

Documentation explicitly marks which path is patent-extending so
IP counsel and product teams have a clear claim shape, and
customers / auditors / regulators who need the stronger guarantee
have a clear endpoint to call.

### Tension 5 — Audit chain integrity (1.2) vs DecisionRecord size (2.5)

**The conflict:** Embedding full LLM input prompts + outputs in
audit rows would balloon the AuditEvent table (input prompts can
be tens of kilobytes; outputs similar). The audit chain's
canonical-hash recomputation cost would scale poorly.

**Resolution: hash + content split.**

`AuditEvent` carries cryptographic hashes only:
`{ system_prompt_hash, user_prompt_hash, output_hash, model_id,
model_version, capsule_ids_consulted: String[] }`. Actual
prompt + output content lives in a separate `DecisionRecord`
table (or object storage with the row pointing to a blob).

Chain integrity verifies hashes (cheap, scales). Reproducibility
verifies content against the stored hashes (only invoked when a
specific decision needs reconstructing for regulator inquiry).

The split also serves Tension 1 — full LLM prompts can carry PII
about external data subjects (e.g., a job applicant's resume); by
keeping content out of the audit chain, the audit chain stays
PII-free without needing per-decision pseudonymization.

═══════════════════════════════════════════════════════════════════

## Recommended Sequencing

Three buckets ordered by remediation cost. The Section 12.5
sub-boxes are explicitly dependency-ordered so the build sequence
is unambiguous.

### Bucket A — 12C.0 Batch (Quick items, two-commit Foundation pattern)

These items fit the existing `[SECTION-XX-FOUNDATION]` →
`[SECTION-XX]` two-commit pattern. Each is a small Foundation
extension landed first, then frontend (where applicable) consumes
in a second commit.

Original four endpoint extensions (carried from 12B closure):
1. `DELETE /org/ai-teammates/:id/skills/:package_id` (12B.3 Q5
   remove-skill)
2. `PATCH /org/entities/:id` audit_event_id surfacing (eliminates
   last sentinel in the codebase)
3. `GET /org/audit ?event_type= + ?actor_entity_id=` filters
4. `GET /org/permissions ?bridge_id=` filter

New 12C.0 additions from this review:
5. **1.1 algorithm pin + ENCRYPTION_KEY production validation** —
   add explicit `algorithm: "HS256"` to `signOptions`; remove
   SHA-256(JWT_SECRET) fallback for `NODE_ENV=production`; document
   FIPS deployment posture in `docs/`.
6. **1.3 retention posture documentation** — explicit "audit_events
   are never deleted" policy doc; SOC 2 / FedRAMP-acceptable as
   long as documented.
7. **1.4 enumerated system actors + scheduler audit emissions** —
   replace single `SYSTEM_CHAIN_KEY` with named system principals
   (SCHEDULER, COMPLIANCE_SEEDER, FEEDBACK_LOOP, BOOT_VALIDATOR);
   add audit emissions to scheduler loop runs.
8. **1.7 re-enable Fastify pino logger** — `Fastify({ logger:
   { level: 'info' } })` with JSON formatter + request-id
   correlation; replace top-priority `console.*` call sites in
   scheduler.ts + boot-validation.ts + cosmp/read.service.ts.
9. **3.3 GET /api/v1/compliance/state endpoint** — read-only;
   computes per-framework posture from existing audit chain.
10. **2.3 + 3.7 residual** — POST-Section-12.5 follow-on quick-fits
    (jurisdiction-tagged ERASURE_EXECUTED variants for CCPA/CPRA);
    not in 12C.0 batch itself but flagged for the post-Section-12.5
    quick-fit sweep.

**Total Bucket A: 9 items. Two-commit pattern continues. Estimated
3-5 days of build work post-frontend dependency wiring.**

### Bucket B — Section 12.5 Sub-Boxes (Medium, dependency-ordered)

Each sub-box gets a full plan-build-verify-commit cycle following
the established Section 12 discipline cadence. Ordered by
dependency: upstream sub-boxes land before downstream sub-boxes
that consume their primitives.

#### Sub-box 1 — EscalationRequest + dual-control middleware (1.5)
**Upstream dependencies:** none.
**Downstream consumers:** Sub-box 3 (regulator access grants).
**Scope:** Add `EscalationRequest` Prisma model
(status enum, initiator_entity_id, target_action enum,
required_approvers, approver_entity_ids, decision_at, expires_at).
Add `requireDualControl()` Fastify middleware. Wire enumerated
operations from Tension 3. Otzar Control Tower Approvals screen
consumes the surface.
**Patent relevance:** None.

#### Sub-box 2 — Jurisdiction tagging (1.6 + 2.4)
**Upstream dependencies:** none.
**Downstream consumers:** Sub-box 3 (lawful-basis jurisdiction);
Sub-box 4 (data subject jurisdiction); Sub-box 5
(jurisdiction-aware deletion variants); Sub-box 8
(meta-jurisdiction aggregates); Sub-box 9 (capsule jurisdiction
in compliance attestation).
**Scope:** Add `jurisdiction: String?` (or `jurisdiction_codes:
String[]`) to Entity, MemoryCapsule, AuditEvent. Default at
create-time from OrgSettings (add `default_jurisdiction` field) or
EntityComplianceProfile. Wire `assertJurisdictionalScope()` runtime
check into permission / share / read flows.
**Patent relevance:** None directly.

#### Sub-box 3 — REGULATOR + Lawful-Basis (2.1 + 2.2)
**Upstream dependencies:** Sub-box 1 (regulator access grants
require dual-control), Sub-box 2 (jurisdiction tagging on
lawful basis).
**Downstream consumers:** Sub-box 7 (attestation reports may
include regulator-access subreports).
**Scope:** Add `REGULATOR` to EntityType enum. Add regulator-
specific TAR fields. Add `LawfulBasis` Prisma model (basis_type
enum, basis_reference, jurisdiction_invoked, valid_from / until,
audit_id FK). Add `REGULATOR_ACCESS_GRANTED`,
`REGULATOR_ACCESS_REVOKED`, `REGULATOR_ACCESS_EXPIRED`
AuditEventTypes. Wire share/read flows to require lawful-basis
when actor is REGULATOR.
**Patent relevance:** Family 1 (2.2 lawful-basis attestation on
COSMP audit chain).

#### Sub-box 4 — DecisionRecord + DataSubjectReference + Agent Attestation (2.5 + 2.7 + 3.6)
**Upstream dependencies:** Sub-box 2 (data subject jurisdiction).
**Downstream consumers:** Sub-box 7 (attestation reports embed
decision provenance); Sub-box 9 (capsule attestation references
decisions made under controls).
**Scope:** Add `DecisionRecord` model (decision_id, conversation_id,
message_index, system_prompt_hash, user_prompt_hash, model_id,
model_version, temperature, output_hash, capsule_ids_consulted,
actor_entity_id, target_entity_id). Per Tension 5, content goes
to object storage; row carries hashes only. Add
`AI_DECISION_RECORDED` AuditEventType.

Add `DataSubjectReference` model (reference_id,
external_subject_id (cryptographic hash of credential),
capsule_id or decision_id FK, jurisdiction). Capsules tag
affected data subjects at create time.

Add `POST /api/v1/compliance/agent-attestation` endpoint
(customer-facing export per 3.6). Add
`POST /api/v1/data-subject/explanation-request` endpoint (per
2.7). Add `EU_AI_ACT` to SEED_FRAMEWORKS with
`required_audit_events: ["AI_DECISION_RECORDED"]`.
**Patent relevance:** Family 2 (2.5 + 3.6 consolidated); Family 3
(2.7 — may consolidate into Family 5; IP counsel decision).

#### Sub-box 5 — EntityIdentity + Pseudonymization + Erasure (2.8 + 3.7)
**Upstream dependencies:** Sub-box 2 (jurisdiction-aware deletion
variants for GDPR vs CCPA).
**Downstream consumers:** None (terminal in dependency graph).
**Scope:** Move PII columns from Entity to separate
`EntityIdentity` table (FK Entity.entity_id). Constrain
`AuditEvent.details` to typed event-detail schemas (TypeScript
discriminated union per AuditEventType, rejecting unknown keys at
write time). Add `eraseDataSubject()` flow: hard-deletes
EntityIdentity row, marks Entity status=DELETED, emits
`ERASURE_EXECUTED` audit event with jurisdiction tag (GDPR vs
CCPA / CPRA / LGPD). Update `verifyAuditChain` to handle redacted
identity references gracefully.
**Patent relevance:** Family 4 (2.8 pseudonymization-with-
verifiable-attestation).

#### Sub-box 6 — NIST Control Mappings + SSP Evidence Generator (1.8 + 3.4)
**Upstream dependencies:** none.
**Downstream consumers:** Sub-box 7 (control mappings populate
attestation report bodies); Sub-box 9 (capsule attestation
references controls satisfied at write time).
**Scope:** Add `control_mappings` TypeScript module mapping each
AuditEventType to NIST 800-53 control IDs, each TAR capability flag
to its enforcement controls, each ComplianceFramework to its
applicable NIST baseline. Add `GET /api/v1/compliance/controls`
endpoint returning the live mapping for SSP authoring tooling.
Ship a control-coverage report generator (per-framework: how
many of N applicable controls have Foundation-tagged evidence).
**Patent relevance:** None (conventional schema work; Discipline C
all-no).

#### Sub-box 7 — ComplianceAttestation + Selective Disclosure (3.1 + 3.2-Stage-A)
**Upstream dependencies:** 1.1 Medium remediation (asymmetric
RS256 / ES256 signing infrastructure); Sub-box 6 (control
mappings for report body); Sub-box 4 (decision provenance for
agent-attestation reports).
**Downstream consumers:** None (terminal).
**Scope:** Add `ComplianceAttestation` Prisma model. Add
`POST /api/v1/compliance/attestation` endpoint building variant
(ii) reports — body includes `audit_chain_segment_hash`,
`capsule_provenance`, `framework_verdict`, jurisdiction tags.
JWT-sign canonical body using attestation key. Add
`/.well-known/jwks.json` for recipient verification. Implement
BBS+ signature library integration for Stage A selective
disclosure on COSMP capsule provenance fields.
**Patent relevance:** Family 5 (3.1 variant ii + 3.2 Stage A;
potentially consolidates with Sub-box 9 / 3.8 — IP counsel
decision).

#### Sub-box 8 — Cross-Tenant Compliance Benchmarking (3.5)
**Upstream dependencies:** Sub-box 2 (jurisdiction tagging for
meta-jurisdiction aggregates per Tension 2).
**Downstream consumers:** None (terminal).
**Scope:** Add `COMPLIANCE_BENCHMARK` to HiveType enum. Add
compliance-metric aggregation job reading per-tenant
`compounding_metrics` + framework pass rates; writes anonymized
aggregate capsules respecting jurisdictional boundaries (per
Tension 2). Reuse `feedback.test.ts` privacy-invariant test
pattern. Add `GET /api/v1/compliance/benchmark` returning the
org's percentile positioning across the COMPLIANCE_BENCHMARK
hive.
**Patent relevance:** Family 6 (3.5 direct continuation of
US 12,517,919 — cleanest direct continuation in review).

#### Sub-box 9 — Capsule Compliance Provenance (3.8)
**Upstream dependencies:** Sub-box 2 (jurisdiction tagging),
Sub-box 6 (control mappings to populate at write time).
**Downstream consumers:** None (terminal).
**Scope:** Add `compliance_attestation_at_creation: Json
@default("{}")` to MemoryCapsule. Schema: `{ frameworks: [{ name,
verdict, controls_satisfied: [string] }], jurisdiction: string[],
audit_event_id }`. Populate at write time by calling
runComplianceChecks against capsule context. Include in
canonical content_hash input. Tampering detectable via existing
hash verification.
**Patent relevance:** Family 5 (3.8 direct continuation of
US 12,164,537 — cleanest continuation in review; may consolidate
with Sub-box 7 in IP counsel review).

**Total Bucket B: 9 sub-boxes. Estimated 1-2 weeks each (per
existing Section 12 cadence). Total ~3-4 months calendar work
for Section 12.5.**

### Bucket C — Section-Level Future Work (Heavy, deferred)

Three items justify Section-level treatment rather than Section
12.5 sub-boxes:

1. **1.2 External Merkle-root anchoring** (FedRAMP High AU-9(2)
   only; not required for Moderate / commercial). Scheduled job
   publishes periodic Merkle roots externally (public ledger or
   customer-controlled escrow). Section-level infrastructure
   project.
2. **3.2 Stage B zk-SNARK predicate-evaluation proofs.** Genuine
   ZK infrastructure — circuit design, trusted setup, proof
   generation tooling, verifier libraries. Defer until commercial
   demand justifies the cryptography engineering investment.
3. **2.6 Cross-jurisdictional treaty routing operational layer.**
   Post-Sub-box 3 + Sub-box 2 land. Foundation surfaces a
   cross-jurisdictional flag (small Quick add); the actual MLAT
   navigation is operational + legal-counsel territory, not
   Foundation primitive work.

═══════════════════════════════════════════════════════════════════

## Patent-Relevance Catalog

The 9 individually-flagged dimensions consolidate into 6 claim
families for IP counsel discussion. Each family identifies the
specific COSMP/DMW extension, prior-art dependencies, commercial
value tier, continuation-vs-new-application flag, and
Discipline B/C answers.

### Family 1 — Lawful-Basis Attestation on COSMP Audit Chain (2.2)

**Specific extension:** Lawful-basis fields cryptographically bound
to capsule access via the existing canonical-hash audit chain.
Lawful-basis attestation included in canonical hash input — chain
verification fails if regulator authority is retroactively
asserted or denied.

**Prior-art dependencies:** Extends US 12,164,537 (COSMP capsule
structure) and US 12,399,904 (DMW).

**Commercial value tier:** Medium. Addresses regulator inbound
access market — significant for regulated-industry tenants
(healthcare, finance, defense). Not the largest market but
defensibility-critical for compliance-heavy enterprise tier.

**Continuation or new application:** Continuation extending the
audit-chain claim shape into regulator-with-lawful-authority
territory.

**Discipline C answers:**
- Extends COSMP capsule structure? Indirect (extends audit chain
  of capsule access, not capsule itself).
- Extends DMW boundary semantics? No directly.
- Composes with audit chain via canonical hash binding? **YES
  (strong)** — primary anchor.

### Family 2 — DMW-Anchored AI Agent Decisional Reproducibility + Customer Attestation (2.5 + 3.6)

**Specific extension:** Reproducibility primitive where capsule
provenance is the retrieval substrate (first-class COSMP claim,
not a derived log) and audit-chain verification is the attestation
primitive. Customer-facing attestation export proves "agent A's
actions against capsules in bridge B during window W were limited
to scope X" — cryptographically defensible.

**Prior-art dependencies:** Extends US 12,164,537 + US 12,399,904.

**Commercial value tier:** **High.** Largest commercial market
addressed by the review — EU AI Act Articles 13-15, NYC Local Law
144 (AEDT), California ADMT (CPRA Rev. 2024), emerging FTC AI
rulemaking under FTC Act § 5. Markets currently underserved by
existing GRC platforms; many enterprise AI-governance vendors
lack platform-native reproducibility.

**Continuation or new application:** Single continuation
consolidating 2.5 (reproducibility) + 3.6 (customer-facing
attestation export). IP counsel may file as one application with
multiple claims rather than two.

**Discipline C answers:**
- Extends COSMP capsule structure? **YES** (capsule provenance
  is the explanation substrate).
- Extends DMW boundary semantics? **YES** (three-wallet
  boundary preserved; cross-wallet capsules referenced by hash).
- Composes with audit chain via canonical hash binding? **YES**
  (audit_chain_segment_hash binds attestation to chain head).

### Family 3 — DMW-Verifiable Explanation to Data Subjects (2.7)

**Specific extension:** External-individual right-to-explanation
surface where the explanation IS the COSMP capsule provenance
(not a generated text description), and selective disclosure
preserves multi-subject privacy via the same canonical-hash
pattern that anchors the audit chain.

**Prior-art dependencies:** Extends US 12,517,919 (privacy-
preserving aggregation) into AI-decision-explanation context.

**Commercial value tier:** Medium. Addresses GDPR Article 22 +
EU AI Act + NYC AEDT + California ADMT data-subject-facing
surface. Subset of Family 2's market but distinct legal
requirement (data subject access vs regulator access vs customer
verification).

**Continuation or new application:** **IP counsel decision
required.** Family 3 may stand alone OR consolidate into Family 5
(3.1 + 3.2 + 3.8 compliance-attested capsules) since both use
selective disclosure on COSMP capsule provenance. Surface to
counsel as a flagged choice.

**Discipline C answers:**
- Extends COSMP capsule structure? **YES** (capsules are the
  explanation).
- Extends DMW boundary semantics? **YES** (selective disclosure
  preserves multi-subject privacy).
- Composes with audit chain via canonical hash binding? **YES**
  (canonical-form hash pattern carries to selective disclosure).

### Family 4 — Pseudonymization-with-Verifiable-Attestation Preserving Hash-Chain Integrity (2.8)

**Specific extension:** Resolves GDPR Article 17 ↔ audit
immutability tension via structural separation: chain hash covers
UUIDs only by deliberate construction, identity-mapping table is
a separate primitive whose deletion does not break chain
verification, ERASURE_EXECUTED event in the chain is the
verifiable attestation that erasure occurred.

**Prior-art dependencies:** Extends US 12,164,537 + US 12,399,904
into deletion-capable variant.

**Commercial value tier:** **High.** Required to onboard EU
tenants under GDPR; also covers CCPA / CPRA / LGPD / UK GDPR
right-to-delete. Without this, EU enterprise tier is
operationally blocked. Patent territory has both technical
novelty and a large commercial moat.

**Continuation or new application:** Standalone continuation.
The deletion-capable variant is structurally distinct enough to
merit its own claim shape.

**Discipline C answers:**
- Extends COSMP capsule structure? **YES** (capsule references
  survive erasure via UUID; identity mapping is separate).
- Extends DMW boundary semantics? **YES** (DMW operations
  continue functioning post-erasure; portability claim
  preserved).
- Composes with audit chain via canonical hash binding? **YES**
  (chain integrity by construction; ERASURE_EXECUTED event in
  chain).

### Family 5 — Compliance-Attested COSMP Capsules + Verifiable Reports (3.1 variant ii + 3.2 Stage A + 3.8)

**Specific extension:** Three-part composition:
- 3.8: Compliance-state-at-creation embedded as capsule provenance
  (single JSON field on MemoryCapsule, included in content_hash).
- 3.1 variant (ii): Compliance reports embedding COSMP capsule
  provenance + audit_chain_segment_hash; recipient-verifiable
  against published chain head.
- 3.2 Stage A: Selective disclosure on the compliance-attested
  capsule provenance via BBS+ signatures.

**Prior-art dependencies:** Extends US 12,164,537 (COSMP capsule
structure) directly. Composes with Foundation's existing audit
chain pattern.

**Commercial value tier:** **High.** Customer-facing compliance
verification is a frequent enterprise procurement requirement
(SOC 2 evidence packaging, vendor compliance attestations, M&A
due-diligence packages). Patent territory has direct claim shape
on existing 12,164,537.

**Continuation or new application:** **IP counsel decision
required.** Family 5 may file as one composite claim or split
into:
- 5a: 3.8 compliance-state in capsule provenance (smallest /
  cleanest continuation).
- 5b: 3.1 variant ii + 3.2 Stage A reports + selective disclosure
  (broader claim covering report-packaging + verification).

3.8 standalone is the *cleanest single-claim continuation* in the
review and is recommended even if 5b is filed separately or
deferred. Surface the split decision to IP counsel explicitly.

**Discipline C answers:**
- Extends COSMP capsule structure? **YES (direct, all three
  components)** — 3.8 adds a provenance field to MemoryCapsule
  itself.
- Extends DMW boundary semantics? **YES** — wallet-aware
  attestation; per-wallet compliance posture.
- Composes with audit chain via canonical hash binding? **YES**
  — content_hash covers attestation; CAPSULE_CREATED event covers
  the canonical form.

### Family 6 — Cross-Tenant Compliance Benchmarking via Hive-Intelligence Pattern (3.5)

**Specific extension:** Direct application of the privacy-
preserving aggregation pattern (already protected by
US 12,517,919 and cited in `schema.prisma:990-1006` for
MonetizationSuggestion) to compliance metrics rather than
intelligence content. The aggregate capsule respects
jurisdictional meta-tagging per Tension 2 resolution.

**Prior-art dependencies:** **Direct continuation of US
12,517,919.** Foundation's `schema.prisma:990-1006` already names
this patent in the codebase as protecting the privacy invariant.

**Commercial value tier:** Medium-to-High. Peer benchmarking is
a frequently-requested enterprise feature ("how does our
compliance posture compare to peer institutions?"). Not as broad
a market as Family 2 but with high willingness-to-pay among
larger enterprise tenants.

**Continuation or new application:** **Direct continuation** —
the cleanest direct continuation in the entire review. Same
claim structure as 12,517,919, applied to compliance metrics
domain instead of monetization metrics domain.

**Discipline C answers:**
- Extends COSMP capsule structure? **YES** (benchmark capsule IS
  a COSMP MemoryCapsule per existing Hive aggregate_capsule
  pattern).
- Extends DMW boundary semantics? **YES (strong)** — three-
  wallet boundary preserved at metric layer; per-tenant metrics
  never leave tenant wallet, only anonymized aggregate is
  cross-wallet visible.
- Composes with audit chain via canonical hash binding? **YES**
  — benchmark construction emits `HIVE_AGGREGATE_BUILT` audit
  event in chain.

### Patent-Relevance Catalog Summary

| Family | Dimensions | Tier | Continuation? | IP-Counsel Decision Needed |
|---|---|---|---|---|
| 1. Lawful-basis attestation | 2.2 | Medium | Yes | No |
| 2. AI agent reproducibility + attestation | 2.5 + 3.6 | **High** | Yes | No |
| 3. Data-subject explanation | 2.7 | Medium | Yes | **Yes — fold into Family 5?** |
| 4. Deletion-capable variant | 2.8 | **High** | Yes | No |
| 5. Compliance-attested capsules + reports | 3.1-ii + 3.2-A + 3.8 | **High** | Yes | **Yes — split 5a/5b?** |
| 6. Compliance benchmarking via Hive | 3.5 | Medium-High | **Direct continuation of 12,517,919 (cleanest)** | No |

Two IP counsel decisions flagged. Six families, four "no decision
needed" + two flagged choices. Total filing recommendation: 4-6
continuations depending on counsel review of Family 3 and
Family 5 splits.

═══════════════════════════════════════════════════════════════════

## Citations

All standards, regulations, and prior-art references consolidated
for cross-reference. Citations are paraphrased per copyright
discipline (no verbatim text from standards documents).

### Cryptography

- **FIPS 140-3** — Security Requirements for Cryptographic
  Modules (NIST). Validatable cryptographic modules required for
  government tenants.
- **NIST SP 800-63B** — Digital Identity Guidelines: Authentication
  and Lifecycle Management. Password-hashing guidance (bcrypt,
  argon2id, PBKDF2 acceptable parameters).
- **NIST SP 800-131A** — Transitioning the Use of Cryptographic
  Algorithms and Key Lengths. Algorithm transition timelines.
- **RFC 7519** — JSON Web Token (JWT). Signing algorithms.
- **RFC 8152** — CBOR Object Signing and Encryption (COSE).

### NIST 800-53 Rev 5 Controls Referenced

- **AC-2** Account Management
- **AC-3(2)** Dual Authorization (FedRAMP High AC-3(2))
- **AC-6** Least Privilege
- **AU-2** Event Logging (who / what / when / where / source /
  outcome)
- **AU-3** Content of Audit Records
- **AU-6** Audit Record Review, Analysis, and Reporting
- **AU-9** Protection of Audit Information
- **AU-9(2)** Audit Records on Separate Physical Systems (FedRAMP
  High)
- **AU-10** Non-repudiation
- **AU-11** Audit Record Retention
- **AU-12** Audit Generation
- **CA-7** Continuous Monitoring (FedRAMP ConMon)
- **IA-5** Authenticator Management
- **SC.L2-3.13** System and Communications Boundary (CMMC 2.0
  Level 2)
- **SI-12** Information Management and Retention

### FedRAMP

- FedRAMP Moderate Baseline (commercial enterprise + lower-
  sensitivity government tenants)
- FedRAMP High Baseline (high-impact government data; AC-3(2),
  AU-9(2), AU-10 required)
- FedRAMP ConMon (Continuous Monitoring) Strategy Guide
- FedRAMP SSP (System Security Plan) Template guidance

### CMMC

- CMMC 2.0 Level 2 — SC.L2-3.13 (boundary protection)
- CMMC 2.0 Level 3 — AC.L3-3.1.4 (separation of duties)

### GDPR (EU)

- **Article 5(1)(e)** Storage Limitation
- **Article 6** Lawfulness of Processing
- **Article 15** Right of Access by Data Subject
- **Article 17** Right to Erasure (Right to be Forgotten)
- **Article 22** Automated Individual Decision-Making
- **Articles 30** Records of Processing Activities
- **Articles 44-50** International Data Transfers
- Recital 65-66 (rationale for erasure)

### EU AI Act

- **Article 12** Record-keeping Requirements (high-risk AI)
- **Article 13** Transparency for High-Risk AI Systems
- **Article 14** Human Oversight
- **Article 15** Accuracy, Robustness, and Cybersecurity

### HIPAA Security Rule (US)

- **45 CFR § 164.308(a)(8)** Evaluation in Light of Jurisdictional
  Context
- **45 CFR § 164.316(b)(2)(i)** Documentation Retention

### US State Privacy Laws

- **CCPA** § 1798.105 (California Consumer Privacy Act —
  right to delete)
- **CPRA** § 1798.105 (California Privacy Rights Act —
  right to delete)
- **California ADMT** (Automated Decisionmaking Technology
  regulations, CPRA Rev. 2024)
- **NYC Local Law 144** (Automated Employment Decision Tool —
  AEDT bias audits)

### Other International

- **LGPD** Article 18 (Brazil — right to erasure)
- **UK GDPR** Article 17 (UK — right to erasure)
- **eIDAS** Regulation (EU electronic identification framework)

### Other US Federal

- **SOX** Section 802 (Sarbanes-Oxley financial audit retention)
- **CLOUD Act** 2018 (Clarifying Lawful Overseas Use of Data)
- **FTC Act § 5** (unfair / deceptive practices, AI enforcement
  authority)
- **MLAT framework** under 28 USC § 1782

### Compliance Frameworks (general)

- **SOC 2 Type II** Trust Services Criteria 2017 (TSP 100;
  CC4.1 monitoring activities, CC6.1 logical access controls)
- **ISO 27001:2022** Annex A controls; A.5.33 (protection of
  records); A.18 (compliance with legal requirements)
- **NIST AI Risk Management Framework (AI RMF 1.0)** — GOVERN,
  MAP, MEASURE, MANAGE functions
- **ISO/IEC 23894:2023** AI guidance on risk management
- **CSA Cloud Controls Matrix v4** (cross-framework mapping)

### Cross-Border / Treaty

- **Schrems II decision** (CJEU C-311/18, July 2020) — invalidation
  of EU-US Privacy Shield; lawful basis for cross-border data
  transfer
- **EU-US Data Privacy Framework** (October 2023, post-Schrems II)
- **MLAT** (Mutual Legal Assistance Treaty) — operational layer
  for cross-jurisdictional regulator requests

### W3C / Identity Standards

- **W3C Verifiable Credentials Data Model 2.0** (verifiable-
  credentials structure for compliance attestations)
- **NIST SP 800-63A** — Identity Assurance: credential
  verification

### Cryptographic Literature

- **Camenisch-Lysyanskaya** (2002) — Anonymous credentials
- **Groth16** (2016) — zk-SNARK construction
- **Bünz et al.** (2018) — Bulletproofs
- **BBS+ Signatures** (IETF draft-ietf-cose-bls-key-
  representations) — selective disclosure
- **Dwork & Roth** (2014) — The Algorithmic Foundations of
  Differential Privacy
- **Sweeney** (2002) — k-anonymity
- **ISO/IEC 20889** — Privacy Enhancing Data De-identification
  Techniques
- **NIST IR 8053** — De-identification of Personal Information

### Foundation's Existing Patents (Prior-Art Dependencies)

- **US 12,164,537** — COSMP capsule structure. Direct continuation
  candidates: 3.8 (capsule compliance provenance), 3.5
  (compliance benchmarking via Hive aggregate capsule).
- **US 12,399,904** — DMW (Decentralized Memory Wallet)
  boundary. Extension dependencies: 2.2, 2.5, 2.7, 2.8, 3.1,
  3.2, 3.6.
- **US 12,517,919** — Privacy-preserving aggregation pattern.
  Direct continuation: 3.5 (cross-tenant compliance
  benchmarking). Extension dependency: 2.7 (selective disclosure
  on multi-subject explanations).

═══════════════════════════════════════════════════════════════════

*End of Compliance Architecture Review.*

