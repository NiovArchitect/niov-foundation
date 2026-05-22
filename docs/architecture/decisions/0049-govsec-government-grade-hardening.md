# ADR-0049 — Government-Grade Hardening and Gap-Closure Program for Foundation/COSMP

- **Status:** Proposed
- **Date:** 2026-05-20
- **Phase:** GOVSEC (master government-grade gap-closure arc) — GOVSEC.1 (umbrella ADR + control matrix + gap-closure register + optimization register)
- **Supersedes:** none
- **Amends:** none at GOVSEC.1 (later phases amend ADR-0002/0019/0026/0037/0041/0046 per the phase decomposition)

## Context

Phase 3 (Dynamic Memory Accuracy at Scale) is globally closed; AUDIT.1
(personalization audit-literal clean-transition) and WSAPI (working-set API
exposure) are landed on `origin/main` at `8674fca`. The Foundation/COSMP
substrate is already heavily hardened at the architectural register — RULE 0
permission gating, an append-only SHA-256 hash-chained audit, a single-wallet
COE spine, dual-control middleware, a frozen `CRYPTO_CONFIG`, the consumer/admin
working-set view split, and AI-access caps all exist and are tested.

What does **not** yet exist is a single canonical program that (a) maps the
current government/enterprise security standards to the **concrete repo
surfaces** that implement them, (b) enumerates **every meaningful gap** required
for true government-grade implementation so that no gap is left unowned, and
(c) sequences the gap closures into small, CI-verifiable phases. GOVSEC.1
creates that canonical foundation. It is docs-only.

A read-only planning pass (substrate inspection across 11 areas + RULE 21
current-source research on 10 standards, all retrieved 2026-05-20) preceded this
ADR. Its findings are carried into the Master Gap-Closure Register (this ADR §10
summary; `docs/reference/govsec-control-matrix.md` authoritative) and the RULE 13
blind-spot resolutions (§14).

## Founder Doctrine

GOVSEC is governed by an explicit Founder doctrine:

- **Deeper than FedRAMP paperwork.** GOVSEC is not a compliance-narrative
  exercise. Cosmetic documentation, control renaming, and standards name-dropping
  are forbidden shortcuts (§16).
- **Not security theater.** Each control must map to a real, named repo surface
  (file + function/symbol) or to a concrete planned surface.
- **All meaningful gaps must be owned.** Every gap discovered in the planning
  pass is registered with a phase owner, a closure type, required tests, and
  closure criteria. No known gap is left unassigned.
- **GOVSEC is not security-only.** It is the master government-grade gap-closure
  arc spanning security, privacy, auditability, identity/session, AI/agent abuse,
  tenant isolation, supply chain, incident response, cryptography, operational
  resilience, correctness, scalability, and optimization.
- **Optimization is part of government-grade readiness** wherever it affects
  security under load, bot/swarm resistance, backpressure, latency under
  adversarial traffic, audit throughput, high-concurrency correctness, AI-agent
  coordination safety, tenant isolation at scale, reliability during attacks or
  degraded states, or government/enterprise/consumer production readiness.
  Optimization is therefore registered alongside security gaps (§11; matrix
  Optimization/Resilience Register), never treated as a separate concern.

## Decision

Establish **GOVSEC** as the master government-grade hardening and gap-closure
program for Foundation/COSMP, anchored by:

1. **This umbrella ADR (ADR-0049)** — the program decision, doctrine, standards
   basis, threat model, gap-closure register summary, optimization register
   summary, phase decomposition, and per-phase closure criteria.
2. **`docs/reference/govsec-control-matrix.md`** — the canonical
   standards-to-substrate matrix, full threat model A–L, Master Gap-Closure
   Register, Optimization/Resilience Register, phase-ownership matrix, test-
   strategy matrix, and closure-criteria matrix.
3. **A 10-phase decomposition** (§12) in which GOVSEC.1 is docs-only and
   GOVSEC.2–10 are forward-substrate code/infra/policy phases, each gated by a
   separate Founder QLOCK authorization per the established workflow.

GOVSEC.1 lands the canonical foundation only. It implements no code.

## Scope (GOVSEC.1)

- NEW ADR-0049 (this file).
- NEW `docs/reference/govsec-control-matrix.md`.
- Tracker update (`docs/reference/section-12-progress.md`).
- Build-state update (`docs/CURRENT_BUILD_STATE.md`).
- ADR catalog entry + RULE 14 bidirectional citation (`docs/architecture/README.md`).
- ADR catalog line in `CLAUDE.md` (no new RULE).

## Non-Scope for GOVSEC.1

No code (`apps/**`, `packages/**`, `scripts/**`). No schema/migration. No
`.github/**` CI. No Elixir. No `.husky/**`. No `package.json`/lockfile. No new
CLAUDE.md RULE. No admin endpoint. No Otzar UX/frontend. No GOVSEC.2–10
implementation. No optimization code. No production-affecting action.

## Standards Basis (RULE 21 current-source research; all retrieved 2026-05-20)

- **FedRAMP 20x** — automation-first authorization; OSCAL machine-readable
  packages + continuous monitoring; machine-readable requirements effective
  2026-09-30 (RFC-0024/0008). (fedramp.gov/20x)
- **NIST SP 800-53 Rev. 5 (upd1)** — 20 control families; GOVSEC anchors on
  **AC, AU, IA, SC, SI, IR, SR**. (csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
- **NIST SP 800-63-4** — finalized 2025-07-31; AAL2 session ≤24h / idle ≤1h,
  AAL3 session ≤12h / idle ≤15min, ≥64-bit session secrets, server-side
  invalidation on logout, CSRF on state-change. (pages.nist.gov/800-63-4)
- **NIST AI RMF (AI 100-1) + GenAI Profile (AI 600-1)** — GOVERN/MAP/MEASURE/
  MANAGE. (nist.gov/itl/ai-risk-management-framework)
- **NIST PQC** — FIPS 203/204/205 finalized 2024-08-13; SP 800-227 final
  2025-09; crypto-agility is the expected posture; symmetric-only stacks
  (HMAC-SHA256, AES-256-GCM, SHA-256, bcrypt) are already PQC-resilient — only
  asymmetric surfaces are Shor-exposed. (csrc.nist.gov/pubs/fips/203/final)
- **CISA Zero Trust Maturity Model v2.0 + Secure-by-Design** — 5 pillars +
  3 cross-cutting; Secure-by-Design Goal 6 "Evidence of Intrusions" (logging/
  audit). (cisa.gov/zero-trust-maturity-model)
- **OWASP API Security Top 10 (2023)** — API1 BOLA … API4 Unrestricted Resource
  Consumption … API10. (owasp.org/API-Security/editions/2023)
- **OWASP LLM/GenAI Top 10 (2025)** — LLM01 Prompt Injection … LLM06 Excessive
  Agency … LLM08 Vector/Embedding Weaknesses. (genai.owasp.org/llm-top-10)
- **SLSA v1.0 + sigstore + SBOM (SPDX/CycloneDX)** — Build L1→L3; L2 = signed
  provenance. (slsa.dev/spec/v1.0/levels)
- **SOC 2 Trust Services Criteria** — Security/Common Criteria CC1–CC9; CC6/CC7/
  CC8 most relevant. (aicpa.org)

## Current Substrate Summary

Hardened (cited by symbol per RULE 12; line numbers volatile):

- Identity/auth: `auth.service.ts` `validateSession` (7-step: JWT verify → expiry
  → session row → TAR-hash binding → operation scope → nonce presence); bcrypt-12;
  5-strike lockout; atomic logout + nonce delete; `LOGIN_SUCCESS` audit.
- Audit: `packages/database/src/queries/audit.ts` `writeAuditEvent` (SHA-256
  14-field canonical record + `previous_event_hash` chain + per-chain advisory
  lock), `applyAuditEventTriggers` (BEFORE UPDATE/DELETE append-only),
  `verifyAuditChain`, `satisfies` literal guard, 5 frozen SYSTEM_PRINCIPALS.
- Gateway: `gateway.middleware.ts` `RateLimitPolicy` + `detectOperation` (Redis
  fixed-window; login limited; IP whitelist); `setMultiplier` throttle hook.
- Privacy: `working-set-views.ts` `projectConsumerView` allow-list; single-wallet
  COE spine `coe.service.ts` `assembleContext`; `similarity.service.ts`
  SQL-projection (no raw vector/distance/cosine).
- AI governance: `negotiate.service.ts` `isRestrictedAiClass`, AI FULL→SUMMARY
  cap + `ai_capped`, `requires_validation`→COMPLIANCE_GATE; LLM materializes the
  working set before the model call (Foundation decides context; LLM06 mitigation).
- Crypto: frozen `CRYPTO_CONFIG` (HS256/AES-256-GCM/SHA-256/bcrypt) — symmetric-
  only, already PQC-resilient; boot gates JWT_SECRET/ENCRYPTION_KEY/BCRYPT.
- Supply chain: pinned Node + pgvector; `npm ci`; 4-job CI; pre-commit guards.
- Monitoring: Pino + Fastify redaction; Loop-5 anomaly detector
  (`ANOMALY_RATIO_THRESHOLD`, `ANOMALY_THROTTLE_MULTIPLIER`) wired to
  `setMultiplier`; 7 seeded compliance frameworks; deployment runbook (ADR-0047).

## Master Threat Model A–L (summary; matrix authoritative)

A. Identity/session · B. API abuse + bot/swarm · C. Admin/privilege escalation ·
D. AI/agent abuse + confused-deputy · E. Prompt/tool/model/provider compromise ·
F. Tenant isolation + cross-wallet leakage · G. Audit/evidence tampering ·
H. Privacy/logging/metadata leakage · I. Supply-chain + CI/CD · J. Crypto/key/
quantum-readiness · K. Insider threat + break-glass misuse · L. Incident response
+ continuous monitoring. Each category's per-threat detail (evidence, protection,
gap, severity, likelihood, candidate, tests, phase, ADR, tier) is in
`docs/reference/govsec-control-matrix.md` §3.

## Master Gap-Closure Register Summary

The full register (`docs/reference/govsec-control-matrix.md` §4) enumerates every
discovered gap with: gap id, category, current evidence, current protection, gap
description, severity, likelihood, phase owner, closure type (docs/test/code/
schema/CI-infra/policy-runbook/research-design), required tests, required audit/
evidence, optimization impact, closure criteria, and disposition (blocker /
high-priority forward-substrate / future-substrate). Representative ids:
GAP-A1 idle-session timeout · GAP-A3 device/session binding · GAP-A4 refresh
rotation/old-session revocation · GAP-B1 unmapped-route rate-limit · GAP-B2
bot/swarm resistance · GAP-B3 anomaly→backpressure wiring · GAP-C1 dual-control
self-approval placeholder · GAP-D1 AI-as-grantor enforcement · GAP-D2 AI
SESSION_ONLY grant enforcement · GAP-E1 prompt/tool injection handling · GAP-F1
hive/department filtering · GAP-G1 session-lifecycle audit emission (SESSION_
EXPIRED/REVOKED) · GAP-G2 machine-readable (OSCAL) evidence export · GAP-I1
dependency scanning · GAP-I2 SBOM/provenance · GAP-J1 key rotation/KMS · GAP-K1
break-glass absence · GAP-L1 alerting/SIEM. No gap is unowned.

## Optimization and Resilience Register Summary

Optimization is registered as government-grade readiness, not separate cleanup
(`docs/reference/govsec-control-matrix.md` §5). Representative ids: GAP-O1 audit
write throughput + hash-chain advisory-lock contention · GAP-O2 gateway rate-
limit performance under adversarial load · GAP-O3 AI-agent coordination under
high concurrency · GAP-O4 tenant isolation at scale · GAP-O5 government/
enterprise/consumer security-profile separation · plus Redis nonce/session
validation perf, backpressure under bot/swarm, working-set route latency under
adversarial volume, CI runtime + security-scan cost, telemetry overhead, and
fail-closed behavior under partial outages. Each carries a measurement strategy
and closure criteria.

## GOVSEC Phase Decomposition

- **GOVSEC.1** — ADR-0049 + control matrix + master gap-closure register +
  optimization/resilience register. *(this phase; docs-only)*
- **GOVSEC.2** — Audit/security-event completion + machine-readable evidence
  foundation (SESSION_EXPIRED/REVOKED emission; OSCAL-style export). *(amends
  ADR-0002)*
- **GOVSEC.3** — Auth/session hardening (idle timeout, device/session binding,
  refresh rotation, password-change invalidation) toward 800-63-4 AAL2/AAL3.
- **GOVSEC.4** — Gateway rate limits, bot/swarm backpressure, high-volume abuse
  protection, and performance under adversarial load (API4/LLM10).
- **GOVSEC.5** — Admin privilege, break-glass, dual-control self-approval
  resolution, insider-threat controls. *(amends ADR-0026/0027)*
- **GOVSEC.6** — AI/agent abuse, confused-deputy hardening, prompt/tool/model/
  provider compromise controls, AI-grantor + SESSION_ONLY enforcement. *(amends
  ADR-0046)*
- **GOVSEC.7** — Tenant isolation, government profile controls, department/hive
  filtering, cross-org/cross-wallet denial proofs. *(amends ADR-0037/0041)*
- **GOVSEC.8** — Supply-chain, CI/CD, dependency scanning, SBOM, provenance,
  secret scanning (SLSA L2→L3).
- **GOVSEC.9** — Crypto agility, key rotation/KMS design, FIPS/PQC readiness.
  *(amends ADR-0019)*
- **GOVSEC.10** — Incident response, monitoring, alerting, continuous evidence,
  closure cascade.

## Closure Criteria (per phase)

- **GOVSEC.1** CLOSED when: ADR-0049 + control matrix + gap register +
  optimization register exist; threat model covers A–L; every minimum gap is
  registered with an owner; the 7 RULE 13 blind spots are resolved; tracker +
  build-state updated; verifier PASS; regression baselines unchanged.
- **GOVSEC.2** CLOSED when: session-lifecycle audit literals are emitted at their
  source sites with chain integrity preserved; an OSCAL-style evidence export
  exists; unit + integration tests prove emission; ADR-0002 amended.
- **GOVSEC.3** CLOSED when: idle timeout + device/session binding + refresh
  rotation land with 800-63-4 AAL targets documented; unit + integration +
  adversarial replay tests pass.
- **GOVSEC.4** CLOSED when: previously unmapped routes are rate-governed,
  anomaly→backpressure is wired, and adversarial-load tests prove backpressure
  without correctness loss.
- **GOVSEC.5** CLOSED when: dual-control self-approval is resolved, break-glass
  exists with mandatory time-boxed audit, privileged routes are throttled; tests
  prove self-approval rejection + break-glass audit completeness.
- **GOVSEC.6** CLOSED when: AI-grantor rejection + SESSION_ONLY-for-AI-grants are
  enforced in code, confused-deputy chains are blocked, output-handling/prompt-
  leak controls exist; adversarial agent tests pass.
- **GOVSEC.7** CLOSED when: department/hive filtering is confirmed or added,
  cross-org escalation isolation is enforced, and a failed cross-wallet NEGOTIATE
  denial regression exists.
- **GOVSEC.8** CLOSED when: dependency scanning + secret scanning + CodeQL/SAST +
  SBOM + signed provenance gate CI at SLSA L2→L3.
- **GOVSEC.9** CLOSED when: key-rotation/KMS design lands, algorithm references
  route through CRYPTO_CONFIG, a FIPS/PQC readiness check + asymmetric-import
  guard exist.
- **GOVSEC.10** CLOSED when: alerting + SIEM/OSCAL export + post-incident runbook
  + health telemetry exist and the GOVSEC closure cascade lands.

## RULE 13 Blind-Spot Resolutions

Resolved at GOVSEC.1 pre-flight by grep against current substrate (`8674fca`):

- **BS1 — ADMIN_ACTION emission.** RESOLVED: `ADMIN_ACTION` is emitted widely —
  `dual-control.middleware.ts` (6 sites), `org.routes.ts`, `developer.routes.ts`,
  `platform.routes.ts`, `auth-admin.routes.ts`, `twin.service.ts`,
  `dandelion.service.ts`, `escalation.service.ts`, `system-permission.ts`,
  `coe.service.ts`. The planning-pass "defined-not-emitted" claim was incorrect;
  ADMIN_ACTION is **not** a gap.
- **BS2 — SESSION lifecycle emission.** RESOLVED (partial gap): `SESSION_CREATED`
  is emitted at the refresh route (`auth-admin.routes.ts`). `session.ts`
  createSession/terminate/expiry use a separate `action` field
  (`SESSION_CREATE`/`SESSION_TERMINATE`/`SESSION_EXPIRY_SWEEP`), not the audit
  `event_type` chain. `SESSION_EXPIRED` and `SESSION_REVOKED` are defined-not-
  emitted as audit literals → GAP-G1 (GOVSEC.2).
- **BS3 — AI-as-grantor / SESSION_ONLY.** RESOLVED (gap confirmed): the
  consumption-side AI cap is enforced (`negotiate.service.ts` `isRestrictedAiClass`,
  `ai_capped`, `allow_ai_full` override). A grantor-side "AI cannot grant to AI"
  rejection and a SESSION_ONLY default for AI grants were **not** located in the
  grant-creation path (`share.service.ts` / `system-permission.ts`). Treated as
  documented-intent not yet code-verified → GAP-D1/GAP-D2 (GOVSEC.6).
- **BS4 — Hive/department capsule filtering.** RESOLVED (gap confirmed): grep of
  `read.service.ts` + `negotiate.service.ts` for department/hive/team_graph
  filtering returned nothing. Isolation relies on wallet_id + permission +
  clearance, not department sub-scoping → GAP-F1 (GOVSEC.7).
- **BS5 — COE assembleContext citation.** RESOLVED: `assembleContext` is the
  async method in `coe.service.ts` (wallet-lock select + capsule filter follow);
  cite by symbol, not line.
- **BS6 — synthetic-DMW regression file.** RESOLVED: both
  `tests/integration/synthetic-dmw-simulation.test.ts` (S1–S10, incl. S2 cross-
  wallet exclusion and S7 twin NEGOTIATE-DENIED) and
  `tests/integration/working-set-route.test.ts` (WSAPI) exist. Remaining gap
  narrows to an explicit **employee non-AI cross-wallet NEGOTIATE-denial**
  regression → GAP-F3 (GOVSEC.7).
- **BS7 — detectOperation default.** RESOLVED: `detectOperation` returns `null`
  for unmapped routes → pass-through, no limiting; unmapped routes (incl.
  `/coe/context`, `/personalization/working-set`) are ungoverned → GAP-B1
  (GOVSEC.4).

## Forward-Substrate Items

GOVSEC.2–10 are forward-substrate; each requires a separate Founder QLOCK. Within
phases, dormant items are explicitly reserved (e.g., OSCAL export depth, KMS
provider selection, SIEM connector choice) and remain dormant until a Founder-
authorized phase lands them. The optimization register items become first-class
acceptance criteria of their owning phases, not separate work.

## Forbidden Shortcuts

- Cosmetic documentation that does not map to a real or concrete-planned surface.
- Renaming an existing control as "government-grade" without closing its gap.
- Treating FedRAMP/NIST/SOC 2/CISA/OWASP/zero-trust as buzzwords.
- Collapsing GOVSEC into generic application security.
- Treating optimization as out of scope.
- Modifying any RULE or any other ADR without explicit Founder authorization
  (RULE 20).

## Founder Authorization Lineage

GOVSEC.1 authorized at `[GOVSEC-GOVERNMENT-GRADE-HARDENING-HAWKSEYE-QLOCK]`
(read-only planning) + `[GOVSEC-GOVERNMENT-GRADE-HARDENING-G1-EXECUTE-VERIFY-AUTH]`
(this docs-only landing; RULE 20 explicit authorization for ADR-0049 creation +
the CLAUDE.md catalog edit). 2026-05-20.

## GOVSEC.2A Implementation Note (2026-05-20)

GOVSEC.2A (the first code-bearing GOVSEC phase) closed **GAP-G1** (session-
lifecycle audit emission). `validateSession` now emits the modern hash-chained
`SESSION_EXPIRED` / `SESSION_REVOKED` literals at its failure-detection branches
(`apps/api/src/services/auth.service.ts`, private `emitSessionDenial` helper),
on the actor's per-user chain, with safe class metadata only
(`reason`/`subreason` enums; never token/nonce/TAR-hash/secret/raw content). The
`SESSION_INVALIDATED` branches map to `SESSION_REVOKED` (no new literal);
`SESSION_CREATED` is preserved as-is (emitted at refresh).

**RULE 13 — two audit systems (clarification).** Foundation has two distinct
audit surfaces: (1) a **legacy** `audit_logs` table written via
`writeAudit({action})` (`packages/database/src/audit.ts`, used by
`packages/database/src/queries/session.ts` for `SESSION_CREATE` /
`SESSION_TERMINATE` / `SESSION_EXPIRY_SWEEP`), which is **not** hash-chained; and
(2) the **modern** append-only SHA-256 hash-chained `audit_events` table written
via `writeAuditEvent({event_type})` (`packages/database/src/queries/audit.ts`).
**GOVSEC.2A targets the modern `audit_events` chain only.** The legacy
`audit_logs` session path is intentionally left untouched.

**ADR-0002 amendment re-scope.** This ADR's §Phase Decomposition and §Closure
Criteria originally stated that GOVSEC.2 "amends ADR-0002." That expectation is
**re-scoped**: GOVSEC.2A emits **already-defined** literals through the
**existing, unchanged** append-only hash-chain architecture (no change to
`writeAuditEvent`, `canonicalRecord`, the advisory-lock discipline, the
append-only triggers, or `verifyAuditChain`). Because no audit-architecture
change occurs, **ADR-0002 is not amended** at GOVSEC.2A. An ADR-0002 amendment
may be reconsidered later only if GOVSEC.2B (machine-readable evidence export)
introduces new audit-derived-evidence semantics. GAP-O1 (audit-throughput /
hash-chain advisory-lock contention) is addressed by design at 2A (per-user
chain, failure-path only) and remains a future-substrate optimization-measurement
item.

## GOVSEC.2B Implementation Note (2026-05-20)

GOVSEC.2B established the **GAP-G2** machine-readable evidence-export substrate.
It is **substrate-complete through a helper/service** — two additive
`ComplianceService` methods (`generateEvidenceExport(orgEntityId, options)` pure
core + `generateEvidenceExportForCaller(sessionToken, options)` org-scoped auth
gate mirroring `getComplianceStateForCaller`). The output is an OSCAL-compatible
**assessment-results summary** (`export_type: "OSCAL_ASSESSMENT_RESULTS_SUMMARY"`;
field names mirror OSCAL `observations`/`findings`/`control-id` lowercase-dotted
e.g. `au-2`) carrying **counts and classes only** — never raw `AuditEvent` rows,
`ip_address`, `event_hash`, `details` JSON, actor/target ids beyond the caller's
org, or `recent_failures`. It is a **read-only projection** over
`getComplianceState` + strict `prisma.auditEvent.count` scoped by
`target_entity_id` (org); it never calls `writeAuditEvent` and does not touch the
hash chain (GAP-O1 unaffected).

**Route exposure deferred.** GOVSEC.2B adds **no route**. Route exposure is
deferred to **GOVSEC.5** (admin/authz + dual-control self-approval resolution per
ADR-0026) and/or **GOVSEC.7** (tenant isolation). The `…ForCaller` helper
establishes the safe org-scoped contract a future route will reuse.

**No ADR-0002 amendment.** The evidence export is a read-only projection over the
existing audit/compliance data; it changes no audit architecture, so ADR-0002 is
not amended (consistent with the GOVSEC.2A re-scope).

**RULE 13 — pre-existing `/compliance/report` exposure surfaced (not fixed
here).** `GET /api/v1/compliance/report` is bearer-only with **no entity-scoping
authorization** (BOLA) and returns **full `AuditEvent` rows** via
`generateComplianceReport.recent_failures` (including `ip_address`, `event_hash`,
`details`). GOVSEC.2B deliberately does the OPPOSITE (org-scoped `…ForCaller` +
counts-only) and does **not** modify or fix that route — the access-control +
full-row-exposure remediation is assigned to **GOVSEC.5 (authz) / GOVSEC.7
(tenant isolation)**. GOVSEC.2B does not modify GOVSEC.2A.

## GOVSEC.3A Implementation Note (2026-05-20)

GOVSEC.3A (the first GOVSEC.3 auth/session hardening subphase) **closes GAP-A4
by default** using **always-rotate**. `POST /api/v1/auth/refresh` now revokes the
prior session: after the new session + nonce are created, it terminates the old
session (existing `terminateSession`), deletes the old nonce, and emits a modern
hash-chained `SESSION_REVOKED` (outcome `SUCCESS`, `details.reason: "rotated"`,
`session_id` = the old session). The old token can no longer be used; the new
token + its `SESSION_CREATED` emission remain valid.

**Always-rotate vs opt-in flag.** An opt-in `revoke_prior` flag (the option the
prior code comment anticipated) was **rejected** because it leaves GAP-A4
partially open by default. Always-rotate is the genuine closure and aligns with
OWASP (renew session ID + destroy old on re-authentication), NIST SP 800-53 AC-12
(session termination) / IA-11 (re-authentication), and CISA secure-by-default
short-lived sessions.

**Multi-tab tradeoff accepted.** Refresh previously kept the prior session ACTIVE
to support multiple tabs. Always-rotate intentionally ends the prior session;
other tabs holding the old token must re-authenticate/recover per existing client
behavior. This is accepted as a government-grade security posture.

**Audit semantics (no new literal).** `SESSION_REVOKED` is reused. `outcome:
SUCCESS` + `reason: "rotated"` denotes a **successful lifecycle rotation**;
GOVSEC.2A's `outcome: DENIED` SESSION_REVOKED (rejected use of an already-dead
session) remains distinct and unchanged. No `SESSION_ROTATED` literal was added.

**No ADR-0002 amendment** — GOVSEC.3A reuses the existing append-only hash-chain
architecture + the existing literal; it changes no audit architecture. **No
schema** (reuses `status`/`terminated_at`). `validateSession` /
`emitSessionDenial` (GOVSEC.2A) are unchanged; the validateSession hot path is
untouched (only refresh pays the rotation cost, on the actor's per-user chain).

**Forward-substrate (still open in GOVSEC.3).** GAP-A1/A2 (idle/abandoned-session
timeout) and GAP-A3 (device/session binding) remain forward-substrate — each
needs a schema field (`last_activity` / `ip`-`ua`-`device`) and lands in
GOVSEC.3C / GOVSEC.3D. GAP-A5 (password-change session invalidation) remains
forward-substrate (GOVSEC.3B): the `invalidateEntitySessions` helper is ready,
but there is no real password-change/reset flow yet (the current admin-reset is a
stub; the flow ships with email infrastructure, Section 14+) to hook it to.

## GOVSEC.3B Readiness Note — GAP-A5 Credential-Change Session Invalidation (2026-05-20)

GAP-A5 is **prerequisite-gated**. There is no real credential-change flow today:
`POST /auth/admin-reset` is a stub (it returns a one-time token but does not
persist a reset-token, send email, or update `password_hash`), and `password_hash`
has no update path (written only at entity creation). The GAP-A5 risk — a stale
session surviving a credential change — is therefore **unreachable** until Section
14+ ships credential-change / password-reset / email infrastructure. Building the
invalidation now would be speculative uncalled code designed for a caller that does
not yet exist; GOVSEC.3B instead lands the **closure contract** so the gap is
closed correctly when the flow ships.

**Closure contract (canonical).** When a credential-change / password-change /
password-reset flow ships, it MUST:
1. List the entity's previously-ACTIVE sessions (`prisma.session.findMany
   {entity_id, status:"ACTIVE"}`).
2. Call `invalidateEntitySessions(entity_id, "credential_changed", actor_id)`.
3. Delete the Redis nonces for those previously-ACTIVE sessions.
4. Emit ONE aggregate modern hash-chained `SESSION_REVOKED` event:
   - `outcome: "SUCCESS"`
   - `details.reason: "credential_changed"`
   - `details.invalidated_count: N`
   - `actor_entity_id`: the actor performing the credential change
   - `target_entity_id` (or equivalent target scope) if existing audit policy supports it
5. Keep metadata safe and minimized.
6. Add replay tests proving old sessions cannot validate after credential change.
7. Preserve `verifyAuditChain` validity.

**Reuse `SESSION_REVOKED`; add no new literal.** Do NOT use per-session modern
audit events unless a later QLOCK proves evidence requires it — per-session events
may create avoidable actor-chain contention. On later use of an invalidated
session, GOVSEC.2A already emits `SESSION_REVOKED` reason `invalidated`.

**Substrate gaps to address in that flow's helper.** `invalidateEntitySessions`
currently (a) writes only legacy `audit_logs` (no modern `audit_events`) and (b)
does not delete Redis nonces. Security is preserved today regardless (the DB
INVALIDATED status check fires before the nonce check in `validateSession` and
GOVSEC.2A maps it to `SESSION_REVOKED` reason `invalidated`), but the future
helper must add modern hash-chained audit + nonce deletion per the contract.

**Safe future audit metadata:** `reason: "credential_changed"`,
`invalidated_count`, and a class-only credential-change source if needed (e.g.
`"self_service_password_change"` / `"admin_password_reset_completed"`).
**Forbidden future audit metadata:** no password / password hash / reset token /
bearer token / JWT / nonce value / secret / raw or previous TAR hash / raw PII
beyond existing allowed identifiers / raw capsule content / memory text / vectors /
embeddings / distance / cosine / private enterprise content / cross-wallet data /
precise location / full audit rows / consumer diagnostics.

**No ADR-0002 amendment** — GOVSEC.3B changes no audit architecture (docs-only
contract). **No schema** in GOVSEC.3B. Section 14+ password / email / reset-token
infrastructure remains outside this phase. GAP-A5 is marked **deferred-with-
contract**; it closes when the credential-change flow lands and satisfies the
contract above.

## GOVSEC.3C-A Implementation Note — GAP-A1/A2 Idle-Session Activity Tracking (2026-05-20)

GAP-A1 (idle timeout) and GAP-A2 (abandoned-session reaping) require **activity
tracking before enforcement** — a session has no idle baseline until its activity
is recorded. GOVSEC.3C is therefore **split** to isolate the schema/tracking
substrate (3C-A) from the behavior-changing enforcement (3C-B):

- **GOVSEC.3C-A (this phase):** adds a nullable `Session.last_activity_at`
  (additive; no backfill; no NOT NULL); `createSession` initializes it to
  `issued_at`; `validateSession` updates it on the **success path** via the
  throttled, audit-free `touchSessionActivity` helper (single atomic `updateMany`
  whose WHERE clause encodes the throttle: write only when `last_activity_at` is
  null or older than the threshold — default 60s — and status ACTIVE). The touch
  is **best-effort** (try/catch): validation already succeeded, so a failed
  tracking write must not fail the request (availability) and cannot make an
  invalid session valid; a lagging write only makes the session appear slightly
  more idle to 3C-B (conservative/safe).
- **3C-A does NOT enforce idle timeout**, adds **no `idle_timeout_minutes`**,
  emits **no new audit event**, and performs **no Redis TTL refresh** (θ-1: the
  DB `last_activity_at` is authoritative; activity does not extend the nonce TTL).

**GOVSEC.3C-B (forward-substrate)** will add a nullable
`OrgSettings.idle_timeout_minutes` (NULL = idle disabled) and enforce the idle
window in `validateSession`: when `now - COALESCE(last_activity_at, issued_at) >
idle_window`, mark the session EXPIRED, delete its nonce, and emit
`SESSION_EXPIRED` with `details.reason: "idle_timeout"` — **reusing the existing
literal (no new literal)** — once at the detection transition (not per request).

**Government-grade AAL targets (documented from the planning pass):**
- AAL2 inactivity timeout ≤ **1 hour** (overall/reauth ≤ 24h).
- AAL3 inactivity timeout ≤ **15 minutes** (overall/reauth ≤ 12h).
- Activity resets the inactivity timer; on expiry the session is terminated
  server-side (NIST SP 800-63B-4; NIST SP 800-53 AC-11 / AC-12 / IA-11; OWASP
  Session Management; CISA secure-by-default short-lived sessions).

**No ADR-0002 amendment** — 3C-A changes no audit architecture (tracking is a
metadata write; no `writeAuditEvent`/`verifyAuditChain`/literal change). The
schema addition is an additive nullable column documented here (no separate
schema ADR). **No proactive abandoned-session sweep in 3C-A** — GAP-A2 is closed
by lazy enforcement at next use (3C-B) plus the absolute TTL cap; a proactive
idle-sweep needs a scheduler (none live) and is deferred to a future operational
phase. The `touchSessionActivity` barrel re-export in `packages/database/src/index.ts`
is the single additive line authorized as the 8th GOVSEC.3C-A file.

## GOVSEC.3C-B1 Implementation Note — GAP-A1/A2 Idle-Window Snapshot (Option B) (2026-05-20)

GOVSEC.3C-B is split into **B1 (idle-window snapshot substrate)** and **B2 (idle
enforcement)**. This note records B1.

**Performance decision (Option B snapshot).** Planning found that fetching org
settings inside `validateSession` to discover the idle window would be expensive:
`getOrgSettingsOrDefaults` for a PERSON caller walks `EntityMembership` (up to 7
hops) + reads `OrgSettings` — **~3 reads typical, up to ~16 worst-case per
authenticated request** — and `validateSession` does not fetch org settings today.
That would be a 2-8× hot-path read amplification, paid **even for null-idle orgs**
(the default). Therefore the idle window is **snapshotted onto the session row at
creation**, exactly as `clearance_ceiling` and `allowed_operations` already are.
B2 enforcement reads `sessionRow.idle_timeout_minutes` from the already-fetched
row → **zero extra `validateSession` reads**, including for null-idle sessions.

**B1 substrate:**
- `OrgSettings.idle_timeout_minutes Int?` (per-org config; null = disabled).
- `Session.idle_timeout_minutes Int?` (per-session snapshot; null = disabled).
- `ORG_SETTINGS_DEFAULTS.idle_timeout_minutes = null` + `MergedOrgSettings` +
  `getOrgSettingsOrDefaults` row-mapping carry it through.
- `createSession` persists an optional `idle_timeout_minutes`; **login** and
  **refresh** (the two createSession callers, both of which already read org
  settings) snapshot it. The refresh change is a one-line additive snapshot pass;
  the GOVSEC.3A rotation logic is unchanged.
- `validateSession` is **unchanged** in B1 — no org-settings lookup, no idle
  check, no enforcement. GOVSEC.3C-A success-path activity tracking + GOVSEC.2A
  failure-branch emissions are preserved.

**Null-default posture (standards-aligned, honest GAP status).** NIST SP 800-53
AC-11/AC-12 treat the inactivity period as **organization-defined**; OWASP ties
the idle window to risk tier. A per-org configured idle window with null-default
is therefore standards-aligned and avoids surprising consumer/enterprise tenants.
The **GOVSEC government profile MUST mandate** AAL2 idle ≤ 60 minutes / AAL3 idle ≤
15 minutes. Honest GAP-A1 status: **B1 lands the snapshot substrate; runtime
closure requires B2 enforcement; per-org closure requires deployment config
(government profile).**

**B2 (forward-substrate)** will, in `validateSession` after the DB status checks,
compute idle from `sessionRow.idle_timeout_minutes` + `sessionRow.last_activity_at`
(both already fetched), `markSessionIdleExpired` (atomic ACTIVE→EXPIRED, emit once
when count===1), best-effort nonce delete, and emit `SESSION_EXPIRED` reason
`idle_timeout` (reusing the literal; no new literal). GAP-A2 closes via lazy
enforcement + the absolute TTL cap; no proactive sweep (no scheduler).

**No ADR-0002 amendment** (no audit-architecture change in B1; both schema
additions are additive nullable columns documented here). **No new audit literal.**
**No enforcement in B1.**

## GOVSEC.3C-B2 Implementation Note — GAP-A1/A2 Idle-Timeout Enforcement (2026-05-20)

GOVSEC.3C-B2 completes runtime idle-timeout enforcement on the B1 snapshot + the
3C-A activity substrate. **No schema change, no new audit literal, no new return
code, no org-settings lookup in `validateSession`.**

**Enforcement.** In `validateSession`, **after the DB status checks (the EXPIRED
branch) and before the TAR / operation / nonce checks**, the session is known
ACTIVE. Enforcement uses **only the already-fetched session row**:
- baseline = `COALESCE(last_activity_at, issued_at)` (3C-A activity, falling back
  to issue time for pre-3C-A sessions whose `last_activity_at` is null);
- window = `sessionRow.idle_timeout_minutes * 60_000` (the B1 snapshot; **null ⇒
  no enforcement**);
- if `Date.now() - baseline > window`, call `markSessionIdleExpired(session_id)`.

This adds **zero extra `validateSession` reads** (Option B pays off). Placing it
before TAR/operation/nonce means an idle-expired session is rejected without that
downstream work; placing it before the 3C-A success-path touch means an
idle-expired session is **never touched**.

**`markSessionIdleExpired`** (NEW in `session.ts`; barrel re-exported from
`index.ts` per the 3C-A `touchSessionActivity` 8th-file precedent) is a single
**atomic `updateMany` WHERE `{session_id, status:"ACTIVE"}` SET
`{status:"EXPIRED"}`** returning `count > 0`. It is **audit-free and Redis-free**:
no timestamp is written (`status = EXPIRED` is the transition).

**Concurrency / single-emit.** The atomic `status="ACTIVE"` guard guarantees
exactly one concurrent caller observes `count === 1`. Only that winner emits, so
there is **no duplicate `idle_timeout` event** under concurrency.

**Audit.** On a won transition, `validateSession` reuses the GOVSEC.2A
`emitSessionDenial` helper to write `SESSION_EXPIRED` / outcome `DENIED` /
`details.reason = "idle_timeout"` on the actor's own hash chain (reusing the
existing literal — **no ADR-0002 amendment**, no new literal). The audit emit is
**awaited / fail-closed per RULE 4**. Later uses of the now-EXPIRED session take
the existing EXPIRED-status branch and emit `row_expired` (GOVSEC.2A) — the idle
cause is recorded once, at the transition.

**Nonce.** After a won transition, the nonce is deleted **best-effort** (try/catch);
the **DB `EXPIRED` status is authoritative**, so a failed nonce delete does not
change the outcome (the request still returns `SESSION_EXPIRED`, and every future
use is gated by the DB status). No Redis TTL refresh.

**Return code** is the existing `SESSION_EXPIRED` (ι-1; no `SESSION_IDLE_TIMEOUT`).

**GAP closure.** GAP-A1 runtime-closes for any session whose org sets
`idle_timeout_minutes` (the GOVSEC government profile mandates AAL2 ≤60min / AAL3
≤15min). GAP-A2 (abandoned sessions) closes via **lazy enforcement** — an
abandoned session is transitioned EXPIRED at its next use — plus the absolute TTL
cap; **no proactive sweep / scheduler**.

## GOVSEC.3D-A Implementation Note — GAP-A3 Device-Binding Snapshot (2026-05-21)

GOVSEC.3D is split into **3D-A (device-binding snapshot substrate)**, **3D-B
(client-context threading + advisory/config-gated mismatch detection)**, and
**3D-C (hard revoke + recovery/step-up UX, gated on GOVSEC.5)**. This note
records 3D-A.

**Planning findings (why snapshot-only).** GAP-A3 planning found (1) the
`Session` row has **no** device/user-agent/IP field — IP is only logged in
`audit_events` ("logged not bound"); and (2) **`validateSession` receives no
client context from any of its four hot-path callers** (`auth.middleware.ts`,
`admin.middleware.ts`, `developer.routes.ts`, `working-set.routes.ts`). So
enforcement-at-validate cannot exist until client context is threaded to those
callers — a distinct, cross-cutting phase. 3D-A therefore lands the **snapshot
substrate only**.

**3D-A substrate:**
- `Session.device_binding_hash String?` (nullable additive; no index; no
  backfill).
- `AuthService.deviceBindingHash(userAgent)` = **HMAC-SHA256(normalized
  user-agent, jwtSecret)** (hex), via Node built-in `crypto` — no dependency.
  Trim-only normalization (case in a UA token is meaningful, so it is preserved
  to avoid collapsing genuinely-distinct clients); a missing/empty/whitespace
  user-agent yields **null** (unbound).
- **login** (`auth.routes.ts` passes `request.headers["user-agent"]` into the
  login context; `auth.service.login` computes and snapshots) and **refresh**
  (`auth-admin.routes.ts` — one additive line; GOVSEC.3A rotation unchanged)
  snapshot `device_binding_hash` via `createSession`.
- `validateSession` is **unchanged** in 3D-A — no enforcement, no context
  threading. GOVSEC.3C-A touch + 3C-B2 idle enforcement + GOVSEC.2A failure
  branches preserved.

**Binding-material decision (privacy-preserving).** The binding material is the
**normalized user-agent only**. **IP is excluded** because it is brittle across
mobile/NAT/VPN/proxy contexts (OWASP Session Management Cheat Sheet) and would
produce false mismatches when enforcement lands. The **raw user-agent and raw IP
are never stored** — only the keyed HMAC, which is not reversible to the raw UA
and cannot be correlated across servers. No fingerprinting library; no precise
fingerprinting. The HMAC key reuses the existing **auth secret / `jwtSecret`**
(HS256 family per ADR-0019 / `CRYPTO_CONFIG`); a dedicated `DEVICE_BINDING_KEY`
may be future substrate. A `jwtSecret` rotation invalidates binding hashes, but
it already ends all sessions (JWTs become unverifiable), so the coupling is
consistent.

**No enforcement, no audit change in 3D-A.** No mismatch rejection; no audit
events; **no new audit literal**. Null/missing user-agent snapshots null.

**3D-B / 3D-C (forward-substrate).** 3D-B must thread the client context
(user-agent) into the four `validateSession` callers and decide **advisory**
mismatch detection vs **config-gated** enforcement (`OrgSettings.device_binding_mode`).
Future mismatch enforcement should **reuse `SESSION_REVOKED` with
`details.reason = "device_mismatch"`** (the `tar_hash_mismatch` precedent) unless
a later QLOCK proves a new literal is required. 3D-C must address **hard revoke,
recovery, break-glass, or step-up UX before hard-blocking** mismatches (OWASP:
blocking mismatches is impractical for multi-device users) — gated on GOVSEC.5.

**No ADR-0002 amendment** (no audit-architecture change in 3D-A; the schema
addition is one additive nullable column documented here, applied via the
ADR-0025 `prisma db push` flow). **No enforcement in 3D-A.**

## GOVSEC.3D-B Implementation Note — GAP-A3 Context Threading + Advisory Detection (2026-05-21)

GOVSEC.3D-B threads the client user-agent into the normal-use `validateSession`
callers and adds an **advisory** device-binding comparison. **No denial, no
revoke, no audit, no schema** — enforcement is GOVSEC.3D-C.

**Caller-set finding (RULE 13).** Pre-flight found the actual
`AuthService.validateSession` caller set is **6 files / 8 call sites**, not the 4
initially named: `auth.middleware.ts`, `admin.middleware.ts`,
`developer.routes.ts` (3 sites), `working-set.routes.ts`, `wallet.routes.ts`, and
`auth-admin.routes.ts:336` (refresh old-token validation).
`session-context-resolver.ts` depends on a narrow `SessionValidator` interface,
not the `AuthService` class, and is **not** a caller.

**Threading disposition.** The **5 normal-use callers are threaded** via a NEW
`clientContextFrom(request)` helper (`apps/api/src/middleware/request-context.ts`)
that returns `{ ip_address, user_agent }` (no hashing/normalization there; no IP
binding; no raw storage). **`auth-admin.routes.ts:336` (refresh) is intentionally
left unthreaded** because it authorizes refresh *rotation*, not normal-use access;
the refreshed session already snapshots a fresh `device_binding_hash` from the
current user-agent (3D-A); comparing the refreshing client's live UA to the old
session's snapshot would be ambiguous advisory with no consumer; and GOVSEC.3A
rotation must remain unchanged.

**Advisory comparison.** `ValidateSessionContext` gains `user_agent?`;
`ValidateSuccess` gains `device_bound?: boolean | null`. On the success path
(θ-3), after every existing check (incl. the 3C-B2 idle enforcement and the 3C-A
activity touch), validateSession computes:
- `device_bound = true` when the live user-agent's HMAC (via the existing
  `deviceBindingHash`) equals `sessionRow.device_binding_hash`;
- `device_bound = false` on mismatch — **the session remains valid** (advisory);
- `device_bound = null` when `sessionRow.device_binding_hash` is null (unbound) OR
  no live user-agent is present (no detection).
Computed from the already-fetched session row + the threaded context — **zero
extra DB reads**.

**Why no audit in 3D-B.** The modern `AuditEventType` set is
`SESSION_CREATED/EXPIRED/REVOKED`. An advisory mismatch (session still valid)
cannot honestly use `SESSION_REVOKED` (a DENIED outcome on a valid session is
contradictory), and a new literal is not warranted; per-request advisory audit on
user-agent churn (browser/OS updates) would be noise without a schema throttle.
The accurate `SESSION_REVOKED` / `details.reason = "device_mismatch"` audit lands
in **GOVSEC.3D-C**, where the session is actually revoked (making the literal
truthful) and config-gating bounds emission.

**No enforcement, no schema, no nonce change.** A mismatch never denies, revokes,
or deletes the nonce. No `OrgSettings.device_binding_mode` and no
`Session.device_mismatch_seen_at` are added (those belong to 3D-C if/when
config-gating + audit land). **No ADR-0002 amendment** (no audit-architecture
change). **No IP binding; no raw user-agent/IP stored.**

**3D-C (forward-substrate).** GOVSEC.3D-C owns `OrgSettings.device_binding_mode`,
config-gated enforcement, the accurate `SESSION_REVOKED device_mismatch` audit,
and recovery/step-up/break-glass integration with GOVSEC.5 — hard-blocking
mismatches must not ship before recovery exists (OWASP: blocking mismatches is
impractical for multi-device users).

## GOVSEC.3D-C Readiness Note — GAP-A3 Device-Mismatch Enforcement (deferred to GOVSEC.5) (2026-05-21)

GOVSEC.3D-C is a **docs-only readiness contract**. It records why hard
device-mismatch enforcement is **not coherent to ship today** and specifies the
future enforcement contract + its dependency. **No code, no schema, no config
substrate, no enforcement.**

**Enforcement blocker (decisive).** Planning found **no recovery / step-up /
break-glass substrate exists**:
- `/api/v1/auth/admin-reset` is a **stub** — it validates membership and emits a
  `PASSWORD_RESET_TRIGGERED` legacy audit, but has **no reset-completion flow**.
- `OrgSettings.mfa_required` exists (org.ts) but is an **unenforced** org/compliance
  flag — it is referenced by neither `auth.service.ts` nor the middleware; there is
  no runtime step-up.
- There is **no TOTP / second-factor / step-up challenge route** and **no
  break-glass recovery path**.
- The **only practical recovery from a revoked session today is a full re-login**.

Because user-agent strings churn (browser/OS updates, multi-device users,
APIs/bots, missing user-agent, mobile/proxy variability), a hard deny/revoke on
user-agent mismatch would create **surprise re-login lockouts** with no gentler
alternative — the government-grade-coherent response to a mismatch is a **step-up
challenge** (re-verify), which is a **GOVSEC.5** capability. Therefore hard
enforcement is **blocked until GOVSEC.5** (κ-1). This mirrors the GOVSEC.3B
posture (a closure contract gated on a missing prerequisite).

**Live behavior today.** GOVSEC.3D-B advisory `device_bound` detection (true /
false / null) on the validateSession success path remains the **only** live
device-binding behavior. A mismatch does **not** deny, revoke, or audit.

**GAP-A3 honest status:**
- 3D-A captured + snapshotted the device-binding material (`Session.device_binding_hash`).
- 3D-B threaded client context and surfaced advisory `device_bound`.
- 3D-C documents the enforcement contract + the GOVSEC.5 dependency.
- **Runtime rejection/revoke is NOT active.** GAP-A3 is **detection-ready, not
  runtime-enforcement closed.**

**Future enforcement contract (deferred; lands in a post-GOVSEC.5 phase):**
- **Config-gated.** Likely `OrgSettings.device_binding_mode` + a
  `Session.device_binding_mode` **snapshot** read free from the already-fetched
  session row (the GOVSEC.3C-B1 idle-snapshot precedent — avoids a validateSession
  org-settings hot-path read). **Default null/off** (γ-1; no surprise lockouts).
  The **enum/value shape is deferred until GOVSEC.5 capabilities are known**
  (off / advisory / step-up / deny / revoke depends on what recovery enables).
- **Enforcement point.** The existing θ-3 `device_bound` computation point, gated
  by the snapshot mode. Uses already-fetched `Session` fields + the threaded
  `user_agent` — **zero extra DB reads**. **θ-1** missing live user-agent ⇒ no
  enforcement; **ι-1** null stored `device_binding_hash` ⇒ no enforcement.
- **Revoke helper.** A future `markSessionDeviceMismatch` mirroring
  `markSessionIdleExpired`: atomic `ACTIVE -> TERMINATED` (or `-> INVALIDATED`)
  `updateMany` returning a transitioned boolean; **audit-free, Redis-free**.
- **Audit.** Reuse **`SESSION_REVOKED` with `details.reason = "device_mismatch"`**
  on an **actual revoke only** (the `tar_hash_mismatch` precedent) — **no new
  audit literal, no ADR-0002 amendment**. Emit **only** when the atomic transition
  wins (`count === 1`) → single emission under concurrency (ζ-1).
- **Nonce.** Best-effort delete on actual revoke (η-2); DB status authoritative;
  audit fail-closed per RULE 4.

**No ADR-0002 amendment** (no audit-architecture change in 3D-C; the future
`device_mismatch` reuses the existing `SESSION_REVOKED` literal). **No schema, no
config substrate, no enforcement in 3D-C.**

## GOVSEC.4 G4-A Implementation Note — GAP-B1 Unmapped-Route Governance (2026-05-21)

GOVSEC.4 (gateway / rate-limit / abuse-control) is **split**: **G4-A = GAP-B1**
(unmapped-route governance + auth-endpoint coverage); **G4-B = GAP-B2/B3**
(bot/swarm resistance + wiring the Loop-5 anomaly detector to backpressure, plus
any rate-limit/anomaly audit); **G4-C = GAP-B4** (privileged-route throttle,
coordinated with GOVSEC.5); **G4-D = GAP-O2/O7** (measured performance hardening).

**Planning finding.** The gateway limiter **already existed and was wired** —
`gateway.middleware.ts` (`RateLimitPolicy`, `DEFAULT_LIMITS`, `OPERATION_RULES`/
`detectOperation`, `makeGatewayHook`) is registered via
`app.addHook("onRequest", makeGatewayHook(...))` in `server.ts`, backed by
`rate-limit.ts` (`RedisRateLimitStore` prod / `MemoryRateLimitStore` test, ioredis
INCR+EXPIRE). **G4-A is gap-closure, not greenfield.**

**GAP-B1 root cause.** `detectOperation` returned null for unmapped routes →
`if (operation === null) return;` **passed them through ungoverned**; and
`POST /api/v1/auth/refresh` + `POST /api/v1/auth/admin-reset` were **absent** from
`OPERATION_RULES`/`DEFAULT_LIMITS` (auth-abuse-sensitive but unthrottled).

**G4-A fix:**
- NEW `OPERATION_RULES` + `DEFAULT_LIMITS` for **refresh** (20/min entity) and
  **admin_reset** (5/min entity — high-risk trigger; the GOVSEC.3B/3D-C notes
  record admin-reset as a stub).
- NEW `DEFAULT_FALLBACK` (300/min entity), exposed as `DEFAULT_LIMITS.default`
  (overridable via `buildApp({ rateLimitOverrides: { default } })`). The
  `operation === null` / `policy === undefined` pass-throughs are replaced by the
  fallback policy keyed on a shared `default` bucket (entity, IP fallback when
  unauthenticated) — **no route passes the gateway ungoverned**.
- NEW narrow `isExemptPath` / `EXEMPT_RULES` so `GET /api/v1/health` stays
  **exempt** — deploy/CI/platform probes are high-frequency by design and must
  never be throttled (a throttled probe would self-DoS the deployment).
- `detectOperation` still returns null for unmapped routes (the fallback lives in
  the hook, not the matcher); existing governed ops + the ip_whitelist STEP-1 +
  the Loop-5 multiplier are unchanged.

**Keying (γ-3):** operation (or `default`) + entity when a token-derived entity is
available, IP fallback otherwise. **No raw IP/user-agent stored; no new org read.**

**No audit in G4-A (δ-1).** A rate-limit denial is not a session-lifecycle event
(often unauthenticated, no session), so no existing literal fits; per-request 429
audit would be spam + chain contention (GAP-O1). The rate-limit/anomaly audit
(with a first-breach-per-window single-emit and a justified new literal) is a
**G4-B** decision. **No new audit literal; no ADR-0002 amendment.** **No schema;
no dependency** (reuses the ioredis-backed store). **Reuses the existing 429
envelope** (`RATE_LIMIT_EXCEEDED` + `Retry-After`).

**Scope boundary.** G4-A does **not** address GAP-B2 (bot/swarm), GAP-B3
(anomaly→backpressure wiring), GAP-B4 (privileged-route throttle), or GAP-O2/O7
(perf) — those are G4-B/C/D. **GAP-B1 status after G4-A: closed** (unmapped routes
governed + auth endpoints covered + health exempt; tested under burst).

## GOVSEC.4 G4-B1 Implementation Note — Rate-Limit-Denial Audit + GAP-B3 Correction (2026-05-21)

GOVSEC.4 G4-B is **split**: **G4-B1** = rate-limit-denial audit + a GAP-B3
documentation correction; **G4-B2** = general bot/swarm resistance (GAP-B2),
deferred.

**GAP-B3 correction (RULE 13).** Planning found GAP-B3
("anomaly detector not wired to backpressure") is **largely already closed for
`read_content`**: `feedback.service.ts` `runLoop5Once` — invoked live via
`readService.onContentRead` (server.ts) — emits the **existing**
`ANOMALY_DETECTED` audit (safe details only) **and** calls
`setMultiplier("read_content:entity:<id>", 0.5, 3600)`; the gateway reads the
**matching** `getMultiplier("read_content:entity:<id>")` and applies
`effectiveLimit = policy.perMinute * multiplier` (0.5 ⇒ stricter). So
anomaly→backpressure is wired end-to-end for read_content. **G4-B1 does not
re-wire anomaly/backpressure**; the residual (generalizing beyond read_content)
folds into GAP-B2 / G4-B2. The control matrix is corrected accordingly.

**Rate-limit-denial audit (GAP-B1/B4 evidence).** A rate-limit denial is not a
session-lifecycle event (often unauthenticated, no session), so no existing
literal fits. G4-B1 adds a NEW additive `RATE_LIMITED` literal (union +
`AUDIT_EVENT_TYPE_VALUES`; the `ANOMALY_DETECTED` precedent). In the gateway 429
branch:
- a **structured-logger** warn fires for **all** denials (cheap, contention-free
  operational evidence; safe/minimized fields: operation, scope, limit, count,
  `ip_hash`, entity_id, first_breach);
- a **hash-chained `RATE_LIMITED`** (outcome DENIED) fires **only on the first
  breach per key/window** (`count > effectiveLimit && count - 1 <= effectiveLimit`
  — robust for fractional Loop-5 multipliers) **and only when an authenticated
  entity is present**.

**Why authenticated-only on the chain.** The audit chain-key priority is
`actor_entity_id` → per-entity chain; a null-actor (unauthenticated) event falls
to the shared `SYSTEM_CHAIN_KEY`, where a distributed swarm of distinct-IP
first-breaches would cause `pg_advisory_xact_lock` contention (GAP-O1 — the
audit-before-response becoming a DoS vector). Restricting the chain emit to
authenticated entities keeps each chain per-entity and bounded; unauthenticated
denials are logger-only.

**Privacy.** `ip_hash = HMAC-SHA256(request.ip, jwtSecret)` — correlatable, not
reversible. **Never** raw IP, user-agent, Authorization header, JWT, nonce,
request body/query, route params, or private content in audit/log metadata.

**No ADR-0002 amendment** — `RATE_LIMITED` is additive to the literal set; the
hash-chain architecture, `writeAuditEvent`, and `verifyAuditChain` are unchanged.
**No backpressure/multiplier change** (reuses the existing store; semantics
unchanged). **No rate-limit.ts/redis.ts/feedback.service.ts/auth change; no
schema; no dependency.** G4-A keying/fallback/health-exemption/429 envelope
preserved.

**Scope boundary.** G4-B1 does **not** implement general bot/swarm resistance
(GAP-B2 → G4-B2), privileged-route throttle (GAP-B4 → G4-C w/ GOVSEC.5), or perf
hardening (GAP-O2/O7 → G4-D). **GAP-B1/B4 rate-limit-denial evidence is closed for
authenticated denials; unauthenticated denials have logger evidence.**

## GOVSEC.4 G4-B2-A Implementation Note — Adversarial Swarm Harness + Readiness (2026-05-21)

GOVSEC.4 G4-B2 (general bot/swarm resistance, GAP-B2) is **split**: **G4-B2-A** =
adversarial-sim harness + readiness/design (this commit; test + docs only);
**G4-B2-B** = the production swarm counter, **sequenced after G4-D** perf.

**Why split (GAP-B2 ↔ GAP-O2 coupling).** A general swarm signal — coordinated
distributed abuse where each source stays under its own per-key limit — requires
an **aggregate counter**. An operation-global counter (`swarm:op:<op>`) is a
single Redis **hot key**: every request INCRs it → hot-key contention, which is
exactly **GAP-O2** ("Redis INCR hot-key contention under adversarial load"),
assigned to **G4-D**. A hashed-IP-cluster counter (`swarm:op:<op>:cluster:<HMAC(ip)%N>`)
distributes the load N× but still adds a **per-request Redis op** whose latency
must be measured. Productionizing a swarm counter before G4-D would land a
hot-key-class change ahead of its own perf measurement. Therefore G4-B2-A lands
only the **adversarial-sim harness + the B2-B design**; it is **not** behavioral
closure of GAP-B2.

**Current posture (proven by the harness).** G4-A per-key limits **shed
single-source floods** (login + default fallback); a **distributed-under-limit
swarm is NOT shed today** — the residual GAP-B2. Loop-5 already sheds the
read_content anomaly (GAP-B3). The harness
(`tests/integration/gateway-swarm.test.ts`) asserts this current behavior and
names the residual tests so G4-B2-B can flip the "not shed" expectation to "shed"
when the production counter lands.

**Future G4-B2-B design (deferred).**
- Synthetic swarm keys via the **existing `RateLimitStore.hit`** (no interface
  change); **operation + hashed-IP cluster** (`HMAC(ip)%N`) to distribute the
  hot key.
- Backpressure via the **existing `setMultiplier`/`getMultiplier`** path (the
  Loop-5 mechanism generalized to a swarm/cluster key) — tightening limits, not
  dropping valid traffic below the floor (no correctness loss).
- **Unauthenticated** swarm signals: **logger-only / hashed-IP operational
  evidence — no `SYSTEM_CHAIN_KEY` chain audit** (GAP-O1, per G4-B1). Authenticated
  denials continue through the G4-B1 `RATE_LIMITED` first-breach audit. **No new
  `SWARM_DETECTED` literal** unless a later QLOCK proves it necessary.
- **Never** raw IP/user-agent/body/query/headers/private content; hashed IP only.
- **Final thresholds + the per-request-op budget are set after G4-D** measures the
  gateway's perf envelope.

**Scope.** **No ADR-0002 amendment** (no audit change). G4-D owns measured
perf/hot-key (GAP-O2/O7); G4-C owns privileged-route throttle (GAP-B4) with
GOVSEC.5. GOVSEC.5/7 untouched.

## GOVSEC.4 G4-D-D1 Implementation Note — Gateway Perf Op-Count Baseline (2026-05-21)

GOVSEC.4 G4-D (gateway perf / hot-key hardening, GAP-O2 + GAP-O7) is **split**:
**D1** = op-count baseline + p99 runbook + docs (this commit; test + docs only);
**D2** = hot-path optimization; **D3** = post-optimization verification. G4-B2-B
(the swarm counter) lands **after D3**.

**Measure-first finding (RULE 13).** **CI has no Redis service, and the test
environment uses `MemoryRateLimitStore`** (`makeDefaultRateLimitStore` →
memory when `NODE_ENV=test`). So the real Redis `INCR`/hot-key behavior — the
core GAP-O2 concern — is **not measurable in CI**. D1 therefore lands a
**deterministic op-count contract** (CI-gated) + a **local Redis p99 runbook**
(`docs/reference/govsec-perf-budget.md`, manual). No CI timing/p99 assertions.

**Documented baseline.** `RedisRateLimitStore.hit` is **not pipelined**: `INCR` +
(first-hit) `EXPIRE` + (every-hit) `TTL` ≈ **2-3 round-trips**; `getMultiplier`
issues a `GET` even when no multiplier is active ≈ 1 round-trip; so a governed
request ≈ **3-4 Redis round-trips**, plus the authenticated STEP-1
`getOrgSettingsOrDefaults` ip_whitelist **DB read**. The op-count contract pins
the per-request `store.*` call budget (health 0; governed 1 `hit` + 1
`getMultiplier`; 429 adds no store calls).

**D2 owns optimization** (pipeline `hit`; avoid the unconditional `TTL`;
conditional/cached `getMultiplier` without breaking Loop-5 read_content
backpressure; cache/defer the ip_whitelist DB read). **D3 owns verification.**
**G4-B2-B waits until after D3** — a swarm counter must not stack a 3rd Redis op
on an un-optimized hot path. **Operation-global swarm counter rejected**;
**hashed-IP-cluster** preferred; final cluster count + thresholds after G4-D.
**GAP-O7** (working-set route p99 under volume) is a focused follow-on, not closed
by D1's gateway op-budget.

**No ADR-0002 amendment** (no audit-architecture change; D1 is test + docs only).

## GOVSEC.4 G4-D-D2-A Implementation Note — Redis `hit` Hot-Path Optimization (2026-05-21)

**D2 is split.** **D2-A** (this commit) optimizes **only** `RedisRateLimitStore.hit`.
**D2-B** (`getMultiplier`) and **D2-C** (the authenticated STEP-1
`getOrgSettingsOrDefaults` ip_whitelist DB read) are **deferred**: D2-B is
co-designed with **G4-B2-B** (the swarm counter) because both touch the multiplier
key space, and today only the Loop-5 `read_content` path sets a multiplier;
D2-C moves to **GOVSEC.7** (cache staleness / multi-instance / control-order risk).

**What changed.** `hit` is now a **single atomic Lua `EVAL`** (`HIT_LUA` in
`apps/api/src/rate-limit.ts`): `INCR` + conditional first-hit `EXPIRE` + `TTL`,
returning `{count, ttl}` → **1 round-trip** (down from the ~2-3 of the prior
non-pipelined `INCR` + first-hit `EXPIRE` + every-hit `TTL`). Lua is used rather
than pipeline/MULTI because the `EXPIRE` is **conditional on the `INCR` result**
(`if c == 1`), which a single pipeline cannot express; an unconditional pipelined
`EXPIRE` would slide the window on every hit.

**Latent-race fix.** Atomicity also removes a real bug in the prior form: a crash
between the separate `INCR` and the first-hit `EXPIRE` could orphan a counter with
**no TTL** — a permanent block for that key. The EVAL makes INCR + first-hit
EXPIRE + TTL indivisible.

**Behavior preserved.** `count`, `ttl_seconds` (same `> 0 ? ttl : ttlSeconds`
fallback so the 429 `Retry-After` is unchanged), and error propagation (no new
fail-open / fail-closed / retry) are identical. `MemoryRateLimitStore`,
`setMultiplier`, `getMultiplier`, and `reset` are **untouched**, so the test
environment (`MemoryRateLimitStore`) and the G4-D-D1 op-count contract
(`gateway-perf-budget.test.ts` — the gateway still calls `hit` exactly once)
stay green unchanged. NEW unit `tests/unit/rate-limit.test.ts` pins the EVAL
contract with a hand-rolled fake ioredis client (no real Redis, no timing/p99).

**Closure status.** **GAP-O2 closure remains pending D3** (post-optimization
verification). **GAP-O7** (working-set route p99) is **not** closed here.
**G4-B2-B** still lands after D3.

**No ADR-0002 amendment** (no audit-architecture change). No schema / dependency /
package / lockfile / CI / Elixir / `gateway.middleware.ts` change.

## GOVSEC.4 G4-D-D3 Implementation Note — Post-Optimization Verification (2026-05-21)

**G4-D-D3 verifies the D2-A Redis hit optimization and op-count budget, records GAP-O2 as optimization-verified under the documented local/manual p99 posture, keeps GAP-O7 open, and unblocks G4-B2-B without implementing it.**

D3 is **docs-only**: production behavior is already verified by the existing tests
and CI, no new code is needed, no new test artifact is needed, and D3's only
remaining work is status/closure recording.

**Optimization landed + CI-green.** G4-D-D2-A landed at
`b6fe3b0aa84ac2630da0614041fcdfef344c7c51`; CI run `26265354599` passed all four
jobs (Typecheck, Unit, Integration, Elixir).

**Verification evidence (re-confirmed at D3).** `apps/api/src/rate-limit.ts`
defines `HIT_LUA` performing `INCR` + conditional `EXPIRE` when `count == 1` +
`TTL`; `RedisRateLimitStore.hit` issues **one** `this.client.eval` call; the
`ttl_seconds` fallback remains `ttl > 0 ? ttl : ttlSeconds`; existing error
propagation is preserved; **no** separate `client.incr` / `client.expire` /
`client.ttl` hot-path calls remain. `tests/unit/rate-limit.test.ts` verifies the
EVAL semantics + fallback; `tests/integration/gateway-perf-budget.test.ts`
verifies the gateway op-count budget (the gateway still calls `hit` once per
governed request; governed budget = 1 `hit` + 1 `getMultiplier` + 0
`setMultiplier`; the 429 path adds no extra store calls). `gateway-swarm` is
green, full integration is green, full CI is green. The no-TTL orphan-key race is
fixed because INCR + first-hit EXPIRE + TTL are indivisible inside the atomic Lua
EVAL.

**GAP-O2 (conservative D3 wording).** Optimization verified; op-count budget
verified; **G4-B2-B unblocked** (the post-optimization budget is verified). **Redis
p99 / wall-clock burst behavior remains governed by the documented local/manual
runbook (`docs/reference/govsec-perf-budget.md` §6/§9) and is NOT asserted as
CI-closed.** No CI p99/timing assertions are added.

**GAP-O7 remains open** — working-set route p99 under adversarial volume is not
solved and not closed by D3.

**G4-B2-B is unblocked but NOT implemented here** — it remains a separate future
phase. No production swarm counter, `swarm:op` keys, gateway `setMultiplier` call,
or multiplier / backpressure / ip_whitelist change is made.

**Deferrals preserved.** D2-B (`getMultiplier` optimization) deferred + co-designed
with G4-B2-B; D2-C (ip_whitelist / `getOrgSettingsOrDefaults` DB read) deferred to
GOVSEC.7; G4-C (privileged-route throttle) separate, tied to GOVSEC.5 coordination;
GOVSEC.5 / GOVSEC.7 untouched.

**No ADR-0002 amendment** (no audit-architecture change). No production / test /
schema / dependency / package / lockfile / CI / Elixir / `gateway.middleware.ts` /
CLAUDE.md / README change.

## References / Source Notes (retrieved 2026-05-20)

Standards sources are listed in §Standards Basis with URLs. Internal references:
ADR-0002 (append-only audit chain), ADR-0019 (cryptographic-suite posture),
ADR-0022 (combined_score), ADR-0026 (dual-control), ADR-0027 (contributor/AI
governance), ADR-0036 (REGULATOR + lawful basis), ADR-0037 (jurisdiction),
ADR-0041 (capsule layer umbrella), ADR-0046 (AI_AGENT dual-context routing),
ADR-0047 (production-readiness hardening), ADR-0048 (personalization
orchestration). Companion canonical document: `docs/reference/govsec-control-
matrix.md`. Governing rules: RULE 0, RULE 4, RULE 10, RULE 11, RULE 12, RULE 13,
RULE 18, RULE 20, RULE 21.
