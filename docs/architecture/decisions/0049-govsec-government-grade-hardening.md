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
