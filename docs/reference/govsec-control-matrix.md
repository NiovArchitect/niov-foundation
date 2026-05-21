# GOVSEC Control Matrix, Threat Model, and Gap-Closure Register

Canonical companion to **ADR-0049** (Government-Grade Hardening and Gap-Closure
Program for Foundation/COSMP). This document maps current security/privacy/
operational standards to **concrete repo surfaces**, enumerates the full threat
model (A–L), and owns every meaningful gap discovered in the GOVSEC planning
pass. Citations are symbol-based (file + function/symbol) per RULE 12; line
numbers are volatile and intentionally omitted.

**GOVSEC is the master government-grade gap-closure arc — not security-only and
not compliance theater.** Optimization is registered here as government-grade
readiness (§5), not as separate cleanup.

---

## 1. Source Notes (RULE 21; all retrieved 2026-05-20)

| Standard | Version / status | Primary source |
|---|---|---|
| FedRAMP 20x | announced 2025-03-24; machine-readable reqs effective 2026-09-30 | fedramp.gov/20x |
| NIST SP 800-53 | Rev. 5 (upd1), in force; 20 families | csrc.nist.gov/pubs/sp/800/53/r5/upd1/final |
| NIST SP 800-63-4 | finalized 2025-07-31 (AAL session guidance) | pages.nist.gov/800-63-4 |
| NIST AI RMF | AI 100-1 (2023) + GenAI Profile AI 600-1 (2024-07-26) | nist.gov/itl/ai-risk-management-framework |
| NIST PQC | FIPS 203/204/205 final 2024-08-13; SP 800-227 final 2025-09 | csrc.nist.gov/pubs/fips/203/final |
| CISA Zero Trust Maturity Model (ZTMM) | v2.0 (2023) + Secure-by-Design pledge | cisa.gov/zero-trust-maturity-model |
| OWASP API Top 10 | 2023 edition | owasp.org/API-Security/editions/2023 |
| OWASP LLM/GenAI Top 10 | 2025 edition | genai.owasp.org/llm-top-10 |
| SLSA / SBOM | SLSA v1.0; SPDX/CycloneDX; sigstore | slsa.dev/spec/v1.0/levels |
| SOC 2 TSC | Security/Common Criteria CC1–CC9 | aicpa.org |

---

## 2. Standards-to-Substrate Matrix

Standards mapped to the **named repo surface** that implements (or will
implement) them.

| Standard / control | Concrete repo surface (symbol) | Status |
|---|---|---|
| **NIST 800-53 AC** (Access Control) | RULE 0 permission gating; `negotiate.service.ts` clearance + permission checks; `admin.middleware.ts` `requireAdminCapability` | hardened; route-throttle gap (GAP-B4) |
| **NIST 800-53 AU** (Audit & Accountability) | `audit.ts` `writeAuditEvent` + `applyAuditEventTriggers` + `verifyAuditChain` | hardened; session-lifecycle emission gap (GAP-G1), OSCAL export gap (GAP-G2) |
| **NIST 800-53 IA** (Identification & Authentication) | `auth.service.ts` `validateSession`; bcrypt-12; nonce store | hardened; idle/device/refresh gaps (GAP-A1/A3/A4) |
| **NIST 800-53 SC** (System & Comms Protection) | `CRYPTO_CONFIG` (HS256/AES-256-GCM/SHA-256/bcrypt); TLS at deploy tier | hardened; key-rotation/agility gaps (GAP-J1/J2) |
| **NIST 800-53 SI** (System & Info Integrity) | input validation at routes; Loop-5 anomaly detector (`ANOMALY_RATIO_THRESHOLD`) | partial; anomaly→backpressure unwired (GAP-B3) |
| **NIST 800-53 IR** (Incident Response) | `compliance.service.ts` reports; deployment runbook (ADR-0047) | partial; alerting/SIEM/playbook gaps (GAP-L1/L2) |
| **NIST 800-53 SR** (Supply Chain Risk Mgmt) | `package-lock.json` pins; `npm ci`; `.github/workflows/ci.yml` | weak; scanning/SBOM/provenance gaps (GAP-I1/I2/I3/I4) |
| **NIST 800-63-4** (session/AAL) | `auth.service.ts` `validateSession`; `session.ts`; nonce TTL | partial; idle ≤1h/≤15min + device binding gaps (GAP-A1/A3) |
| **NIST AI RMF / GenAI** (GOVERN/MAP/MEASURE/MANAGE) | RULE 0 ceilings; `negotiate.service.ts` AI caps; LLM-context materialized by Foundation (`coe.service.ts` `assembleContext`) | hardened core; grantor-side + output-handling gaps (GAP-D1/D2/E1) |
| **CISA ZTMM v2.0** (Identity/Data pillars) + Secure-by-Design Goal 6 | append-only audit = "Evidence of Intrusions"; `projectConsumerView` data minimization | hardened; SIEM/visibility gap (GAP-L1) |
| **OWASP API 2023** (API1/3/5 authz; API4 resource) | per-route auth gate; org-scope filter narrowing; `detectOperation` rate-limit | authz hardened; API4 unmapped-route gap (GAP-B1) |
| **OWASP LLM 2025** (LLM01/06/08) | Foundation-decides-context (LLM06); `similarity.service.ts` SQL projection no raw vectors (LLM08) | hardened; output-handling/prompt-leak gaps (GAP-E1) |
| **SLSA v1.0 / SBOM / provenance** | `.github/workflows/ci.yml` (no provenance today) | SLSA L0; gap (GAP-I2) |
| **SOC 2 CC6/CC7/CC8** | logical access (`validateSession`); monitoring (anomaly detector); change mgmt (ADR discipline) | partial; monitoring/alerting gap (GAP-L1/L3) |

---

## 3. Threat Model A–L

Per-threat fields: evidence → protection → gap → severity / likelihood →
candidate → tests → phase → ADR → tier.

### A. Identity/session threats
- Evidence: `auth.service.ts` `validateSession`; `session.ts`; nonce store.
- Protection: 7-step validate, TAR-hash binding, nonce revocation, bcrypt-12,
  5-strike lockout, absolute expiry.
- Gaps: no idle timeout (GAP-A1), abandoned sessions (GAP-A2), no device/session
  binding (GAP-A3), no refresh rotation/old-session revocation (GAP-A4), no
  password-change invalidation (GAP-A5). Sev High / Like Med (vs 800-63-4 AAL2/3).
- Candidate: `last_activity` idle cap; session `ip`/`ua`/device binding; refresh
  rotation + revoke_prior; invalidate-on-password-change. Tests: unit+integration
  +adversarial replay. Phase GOVSEC.3. New-ADR. Tier code+schema.

### B. API abuse and bot/swarm threats
- Evidence: `gateway.middleware.ts` `detectOperation`/`RateLimitPolicy`;
  `rate-limit.ts` `setMultiplier`.
- Protection: login limited; IP whitelist; Redis fixed-window.
- Gaps: `detectOperation` returns null → unmapped routes ungoverned (GAP-B1);
  no bot/swarm resistance (GAP-B2); anomaly detector not wired to backpressure
  (GAP-B3); privileged endpoints unthrottled (GAP-B4). Sev High / Like High
  (API4/LLM10). Candidate: governed default for unmapped routes + per-entity
  quotas + wire anomaly→`setMultiplier` + privileged-route limits. Tests:
  unit+integration+adversarial burst. Phase GOVSEC.4. New-ADR. Tier code.
- **G4-A status (LANDED `fea17ea`):** GAP-B1 CLOSED — unmapped routes governed by
  a default fallback; `refresh`/`admin-reset` rate-limited; health exempt.
- **G4-B1 status (this commit):** GAP-B3 found **largely already closed for
  `read_content`** — `feedback.service.ts` `runLoop5Once` (invoked via
  `readService.onContentRead`) emits `ANOMALY_DETECTED` and calls
  `setMultiplier("read_content:entity:<id>", 0.5, 3600)`; the gateway reads the
  **matching** `getMultiplier("read_content:entity:<id>")` and applies
  `effectiveLimit = perMinute * multiplier`, so anomaly→backpressure IS wired for
  read_content. G4-B1 adds the `RATE_LIMITED` audit (bounded: first-breach per
  key/window, authenticated-entity chain only — unauthenticated denials are
  logger-only to avoid SYSTEM_CHAIN_KEY contention per GAP-O1) for GAP-B1/B4
  rate-limit-denial evidence. **General bot/swarm resistance (GAP-B2) and any
  anomaly generalization beyond read_content remain open → G4-B2.** Privileged-
  route throttle (GAP-B4) → G4-C w/ GOVSEC.5; perf (GAP-O2/O7) → G4-D.

### C. Admin/privilege escalation threats
- Evidence: `admin.middleware.ts` `requireAdminCapability`; `dual-control.middleware.ts`.
- Protection: per-request TAR fetch; dual-control + Zone-U1 ADMIN_ACTION audit;
  `PRIVILEGED_ENDPOINTS` registry.
- Gaps: dual-control self-approval placeholder (GAP-C1). Sev High / Like Low-Med.
  Candidate: org-admin-set approver resolution. Tests: unit+integration (self-
  approval rejection). Phase GOVSEC.5. Amend ADR-0026. Tier code.

### D. AI/agent abuse and confused-deputy threats
- Evidence: `negotiate.service.ts` `isRestrictedAiClass`, `ai_capped`,
  `allow_ai_full`; `share.service.ts`; `system-permission.ts`.
- Protection: consumption-side AI FULL→SUMMARY cap; `requires_validation`
  escalation; AI clearance ceiling.
- Gaps: AI-as-grantor rejection not located in grant path (GAP-D1); SESSION_ONLY
  default for AI grants not located (GAP-D2); confused-deputy chains (GAP-D3).
  Sev High / Like Med (LLM06). Candidate: grantor-type rejection + SESSION_ONLY
  temporal class + deputy-chain guard. Tests: unit+integration+adversarial.
  Phase GOVSEC.6. Amend ADR-0046. Tier code.

### E. Prompt/tool/model/provider compromise threats
- Evidence: `llm.service.ts` scoped `{system,user,context}`; Foundation
  materializes the working set before the model call.
- Protection: LLM never selects its own memory (LLM06 mitigation); scoped args.
- Gaps: no downstream output-handling/validation (GAP-E1); no provider-compromise
  containment doc (GAP-E2); cross-context not re-audited (GAP-E3). Sev Med /
  Like Med (LLM01/05/07). Candidate: output validation + provider-failure
  containment + cross-context audit literal. Tests: unit+adversarial injection
  corpus. Phase GOVSEC.6. Amend ADR-0046/0048. Tier code+test.

### F. Tenant isolation and cross-wallet leakage threats
- Evidence: `coe.service.ts` `assembleContext` single-wallet spine;
  `permission-envelope.service.ts` domain enforcement; `negotiate.service.ts`
  jurisdiction + clearance.
- Protection: wallet-locked retrieval; personal/enterprise domain split;
  jurisdiction match; synthetic-DMW S2/S7 regression.
- Gaps: hive/department filtering absent in read/negotiate (GAP-F1); cross-org
  escalation isolation unverified (GAP-F2); no employee non-AI cross-wallet
  NEGOTIATE-denial regression (GAP-F3). Sev High / Like Low. Candidate: confirm/
  add dept filter + org-scoped escalation + denial regression. Tests:
  integration+synthetic-DMW failure paths. Phase GOVSEC.7. Amend ADR-0037/0041.
  Tier code+test.

### G. Audit/evidence tampering threats
- Evidence: `audit.ts` `writeAuditEvent` hash chain + `applyAuditEventTriggers`
  + `verifyAuditChain`.
- Protection: SHA-256 chain, BEFORE UPDATE/DELETE triggers, tamper detection.
- Gaps: SESSION_EXPIRED/REVOKED defined-not-emitted (GAP-G1); no machine-readable
  (OSCAL) evidence export (GAP-G2). Sev Med / Like Low. Candidate: emit session-
  lifecycle literals at source; OSCAL export. Tests: unit+integration. Phase
  GOVSEC.2. Amend ADR-0002. Tier code.

### H. Privacy/logging/metadata leakage threats
- Evidence: `working-set-views.ts` `projectConsumerView`; Fastify redaction;
  `similarity.service.ts` no-raw-vectors.
- Protection: consumer-view allow-list; redaction paths; SQL projection.
- Gaps: no DB-tier metadata-privacy guard (GAP-H1); no side-channel review
  (GAP-H2). Sev Med / Like Low. Candidate: emission-layer privacy lint/test +
  side-channel note. Tests: unit forbidden-token guards. Phase GOVSEC.7 (with F)
  or GOVSEC.2. Tier test+code.

### I. Supply-chain and CI/CD threats
- Evidence: `.github/workflows/ci.yml`; `package-lock.json`; `mix.lock`.
- Protection: pinned deps; `npm ci`; pre-commit guards.
- Gaps: no dependency scanning/npm audit (GAP-I1); no SBOM/provenance (GAP-I2);
  no secret scanning (GAP-I3); no CodeQL/SAST (GAP-I4). Sev High / Like Med.
  Candidate: npm audit + CodeQL + secret scanning + CycloneDX SBOM + sigstore
  provenance (SLSA L2→L3). Tests: CI job assertions. Phase GOVSEC.8. New-ADR.
  Tier CI/infra.

### J. Crypto/key/quantum-readiness threats
- Evidence: frozen `CRYPTO_CONFIG`; `boot-validation.ts` gates.
- Protection: symmetric-only (PQC-resilient); single swap-point; boot gates.
- Gaps: no key rotation/KMS (GAP-J1); hardcoded algorithm strings bypass
  CRYPTO_CONFIG (GAP-J2); no FIPS/PQC readiness check + asymmetric-import guard
  (GAP-J3). Sev Med / Like Low. Candidate: rotation design + route algos through
  CRYPTO_CONFIG + getFips boot gate + import lint. Tests: unit+boot-validation.
  Phase GOVSEC.9. Amend ADR-0019. Tier code+policy.

### K. Insider threat and break-glass misuse threats
- Evidence: dual-control + append-only audit.
- Protection: two-person dual-control on privileged ops; immutable audit.
- Gaps: no break-glass (GAP-K1); no least-privilege capability review (GAP-K2).
  Sev Med / Like Low. Candidate: break-glass with mandatory time-boxed two-person
  audit; least-privilege review. Tests: integration break-glass audit
  completeness. Phase GOVSEC.5. Amend ADR-0026/0027. Tier code+policy.

### L. Incident response and continuous monitoring gaps
- Evidence: Loop-5 anomaly detector; `compliance.service.ts`; ADR-0047 runbook.
- Protection: anomaly throttle hook; compliance reports; deployment runbook.
- Gaps: advisory-only anomaly (no alert/block) + no SIEM (GAP-L1); no post-
  incident playbook (GAP-L2); no telemetry aggregation (GAP-L3). Sev Med /
  Like Med. Candidate: alerting hook + SIEM/OSCAL export + post-incident runbook
  + health telemetry. Tests: unit alert trigger + doc. Phase GOVSEC.10. New-ADR.
  Tier code+infra+doc.

---

## 4. Master Gap-Closure Register

Every discovered gap is owned. Disposition: **B**=blocker for gov-grade,
**H**=high-priority forward-substrate, **F**=future-substrate. Closure types:
docs / test / code / schema / CI-infra / policy-runbook / research-design.

| Gap ID | Category | Current evidence | Current protection | Gap | Sev | Like | Phase | Closure type | Required tests | Required audit/evidence | Optimization impact | Closure criteria | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GAP-A1 | A Identity | `auth.service.ts`/`session.ts` | absolute expiry only | no idle timeout | High | Med | GOVSEC.3 | code+schema | unit+integration | reauth/idle audit | sessions reaped sooner under load | idle cap ≤1h (AAL2)/≤15m (AAL3) enforced+tested | H |
| GAP-A2 | A Identity | session row | expiry sweep | abandoned-session reaping coarse | Med | Med | GOVSEC.3 | code | unit+integration | sweep audit | reduces live-session memory | abandoned sessions reaped on idle cap | H |
| GAP-A3 | A Identity | IP logged not bound | none on row | no device/session binding | High | Med | GOVSEC.3 | code+schema | integration+adversarial | rebind audit | — | session bound to ip/ua/device; mismatch rejected+tested | H |
| GAP-A4 | A Identity | `auth-admin.routes.ts` refresh | rolling window | old session not revoked | High | Med | GOVSEC.3 | code | unit+integration | rotation audit | — | refresh rotates+revokes prior; tested | H |
| GAP-A5 | A Identity | admin-reset stub | none | no password-change session invalidation | Med | Low | GOVSEC.3 | code | unit+integration | invalidation audit | — | password change invalidates sessions+tested | H |
| GAP-B1 | B API | `gateway.middleware.ts` `detectOperation` | null→pass-through | unmapped routes ungoverned | High | High | GOVSEC.4 | code | unit+integration+adversarial | rate-limit audit | core: bounds adversarial volume | unmapped routes governed; tested under burst | B |
| GAP-B2 | B API | gateway static limits | per-op limits | no bot/swarm resistance | High | High | GOVSEC.4 | code | adversarial sim | anomaly audit | core: swarm backpressure | swarm load shed without correctness loss | B |
| GAP-B3 | B API | `feedback.service.ts` anomaly + `setMultiplier` | **G4-B1 correction: largely WIRED for read_content** (runLoop5Once → ANOMALY_DETECTED audit + setMultiplier("read_content:entity:<id>",0.5,3600) via readService.onContentRead; gateway getMultiplier matching key). Residual generalization beyond read_content → G4-B2 | High | Med | GOVSEC.4 | code | integration+adversarial | ANOMALY_DETECTED audit (exists) | core: dynamic throttle | anomaly drives throttle for read_content; generalization tested in G4-B2 | B |
| GAP-B4 | B API/C | privileged routes | dual-control | privileged endpoints unthrottled | Med | Med | GOVSEC.4 | code | integration | rate-limit audit | — | privileged routes throttled; tested | H |
| GAP-C1 | C Admin | `dual-control.middleware.ts` | placeholder target=caller | self-approval possible | High | Low | GOVSEC.5 | code | unit+integration | ADMIN_ACTION audit | — | org-admin-set approver; self-approval rejected+tested | B |
| GAP-D1 | D AI | `share.service.ts`/`system-permission.ts` | consumption cap only | AI-as-grantor not rejected | High | Med | GOVSEC.6 | code | unit+integration+adversarial | grant audit | — | AI grantor rejected/constrained; tested | B |
| GAP-D2 | D AI | grant path | none located | SESSION_ONLY default for AI grants absent | High | Med | GOVSEC.6 | code | unit+integration | grant audit | — | AI grants default SESSION_ONLY; tested | B |
| GAP-D3 | D AI | agent chains | clearance ceiling | confused-deputy chains | Med | Med | GOVSEC.6 | code | adversarial | chain audit | AI coordination safety | deputy chains blocked; tested | H |
| GAP-E1 | E Prompt | `llm.service.ts` | scoped args | no output-handling validation | Med | Med | GOVSEC.6 | code+test | adversarial injection | — | — | model output validated downstream; tested | H |
| GAP-E2 | E Prompt | provider boundary | scoped call | provider-compromise containment undoc | Med | Low | GOVSEC.6 | research-design+policy | — | containment doc | resilience under provider fault | containment posture documented | F |
| GAP-E3 | E Prompt/H | NEGOTIATE | domain split | cross-context not re-audited | Med | Low | GOVSEC.6 | code | integration | cross-context audit literal | — | cross-context request audited; tested | H |
| GAP-F1 | F Tenant | `read.service.ts`/`negotiate.service.ts` | wallet+permission+clearance | hive/dept filtering absent | Med | Low | GOVSEC.7 | code | integration | filter audit | isolation at scale | dept filtering confirmed/added; tested | H |
| GAP-F2 | F Tenant | escalation service | entity ids | cross-org escalation isolation unverified | Med | Low | GOVSEC.7 | code | integration | escalation audit | — | org-scoped escalation enforced; tested | H |
| GAP-F3 | F Tenant | synthetic-DMW S2/S7 | success+twin-denial | no employee non-AI cross-wallet denial regression | Low | Low | GOVSEC.7 | test | integration | NEGOTIATE-denial audit | — | denial regression added+green | H |
| GAP-G1 | G Audit | `session.ts` `action` field | LOGIN_SUCCESS+SESSION_CREATED only | SESSION_EXPIRED/REVOKED unemitted | Med | Low | GOVSEC.2 | code | unit+integration | session-lifecycle audit | audit completeness | session-lifecycle literals emitted; chain intact | B |
| GAP-G2 | G Audit | `verifyAuditChain` | internal only | no machine-readable (OSCAL) export | Med | Med | GOVSEC.2 | code | unit | OSCAL export | continuous-monitoring throughput | OSCAL-style evidence export exists; tested | H |
| GAP-H1 | H Privacy | emission-layer discipline | manual | no DB-tier metadata-privacy guard | Med | Low | GOVSEC.2/7 | test+code | unit forbidden-token | privacy lint | — | metadata-privacy guard test exists | H |
| GAP-H2 | H Privacy | error responses | generic denials | no side-channel review | Low | Low | GOVSEC.7 | research-design | — | side-channel note | — | timing/header side-channel reviewed+documented | F |
| GAP-I1 | I Supply | `ci.yml` | pinned deps | no dependency scanning/npm audit | High | Med | GOVSEC.8 | CI-infra | CI job assertion | scan evidence | CI cost | npm audit gate in CI; tested | B |
| GAP-I2 | I Supply | `ci.yml` | none | no SBOM/provenance | High | Med | GOVSEC.8 | CI-infra | CI job assertion | SBOM artifact | CI cost | CycloneDX SBOM + sigstore provenance (SLSA L2→L3) | B |
| GAP-I3 | I Supply | `ci.yml` | none | no secret scanning | High | Med | GOVSEC.8 | CI-infra | CI job assertion | scan evidence | — | secret scanning gate in CI | B |
| GAP-I4 | I Supply | `ci.yml` | none | no CodeQL/SAST | Med | Med | GOVSEC.8 | CI-infra | CI job assertion | SAST evidence | CI cost | CodeQL/SAST gate in CI | H |
| GAP-J1 | J Crypto | `crypto.ts` comment | operator-manual | no key rotation/KMS | Med | Low | GOVSEC.9 | research-design+code | unit | rotation evidence | — | rotation/KMS design + version hooks | H |
| GAP-J2 | J Crypto | `crypto.ts` literals | frozen config | hardcoded algorithm strings bypass CRYPTO_CONFIG | Med | Low | GOVSEC.9 | code | unit | — | — | all algo refs route through CRYPTO_CONFIG; tested | H |
| GAP-J3 | J Crypto | `boot-validation.ts` | symmetric-only | no FIPS/PQC readiness + asymmetric-import guard | Med | Low | GOVSEC.9 | code+policy | unit+boot | FIPS evidence | — | getFips boot gate + asymmetric-import lint | H |
| GAP-K1 | K Insider | dual-control | two-person | no break-glass | Med | Low | GOVSEC.5 | code+policy | integration | break-glass audit | resilience when approver locked out | break-glass with time-boxed two-person audit | H |
| GAP-K2 | K Insider | TAR caps | clearance ceiling | no least-privilege capability review | Low | Low | GOVSEC.5 | policy-runbook | — | review record | — | least-privilege review documented | F |
| GAP-L1 | L IR | anomaly detector | advisory throttle | no alerting/SIEM | Med | Med | GOVSEC.10 | code+infra | unit alert trigger | alert evidence | — | alerting + SIEM/OSCAL export exist; tested | H |
| GAP-L2 | L IR | ADR-0047 runbook | deploy runbook | no post-incident playbook | Med | Low | GOVSEC.10 | policy-runbook | — | playbook | — | post-incident playbook + escalation matrix exist | H |
| GAP-L3 | L IR | org telemetry TODO | none | no telemetry aggregation | Med | Med | GOVSEC.10 | code+infra | unit | metrics | overhead measured | telemetry pipeline + health probes exist | H |

---

## 5. Optimization / Resilience Register

Optimization is government-grade readiness wherever it affects security under
load, correctness, or scale. For each: bottleneck/risk · security relevance ·
correctness relevance · scale/concurrency relevance · phase owner · measurement
strategy · closure criteria.

| Gap ID | Bottleneck / risk | Security relevance | Correctness relevance | Scale/concurrency relevance | Phase | Measurement | Closure criteria |
|---|---|---|---|---|---|---|---|
| GAP-O1 | audit write throughput + per-chain `pg_advisory_xact_lock` contention in `writeAuditEvent` | RULE 4 audit-before-response must not become a DoS vector | hash-chain order must hold under concurrency | per-actor chain serializes; hot actors bottleneck | GOVSEC.2 | bench audit writes/sec at N concurrent actors; lock-wait histogram | throughput target met; chain integrity preserved under load test |
| GAP-O2 | gateway rate-limit perf (`detectOperation` + Redis round-trips) under adversarial load | bot/swarm bounding | limit accuracy under burst | Redis INCR hot-key contention | GOVSEC.4 | latency p99 + Redis ops under burst | governed routes hold p99 target under adversarial burst |
| GAP-O3 | AI-agent coordination under high concurrency (BEAM DMWWorker/Horde dispatch) | confused-deputy safety at fan-out | per-DMW ordering correctness | hive-scale per-DMW parallelism | GOVSEC.6 | concurrent-agent sim; per-DMW mailbox depth | no cross-agent leakage or ordering violation at target concurrency |
| GAP-O4 | tenant isolation at scale (single-wallet spine query cost) | no cross-wallet leak under load | wallet-lock holds under concurrency | many wallets, large capsule sets | GOVSEC.7 | multi-tenant load sim | isolation proven + latency target under N tenants |
| GAP-O5 | government/enterprise/consumer security-profile separation | profile-appropriate controls (AAL/clearance) | correct profile selection | per-deployment profiles | GOVSEC.7 | profile matrix + conformance tests | three profiles defined with conformance criteria |
| GAP-O6 | Redis nonce/session validation perf in `validateSession` hot path | session revocation latency | validation correctness | every authed request hits nonce store | GOVSEC.3 | validateSession latency under load | hot-path latency target met |
| GAP-O7 | working-set route latency under adversarial request volume | LLM10 unbounded consumption | consumer-view correctness | concurrent working-set builds | GOVSEC.4 | route p99 under volume | route bounded + backpressured under adversarial volume |
| GAP-O8 | CI runtime + security-scan cost | scan coverage vs cost | — | CI parallelism | GOVSEC.8 | CI wall-clock + scan minutes | scans added within an acceptable CI-time budget |
| GAP-O9 | fail-closed behavior under partial outages (Redis/DB/LLM down) | no fail-open auth/audit | correct degraded responses | partial-outage scenarios | GOVSEC.10 | chaos/fault-injection sim | fail-closed proven for auth+audit under each outage |

---

## 6. Phase Ownership Matrix

| Phase | Owns gaps | Standards anchor | Tier |
|---|---|---|---|
| GOVSEC.2 | GAP-G1, GAP-G2, GAP-H1, GAP-O1 | AU, FedRAMP OSCAL, SOC2 CC7 | code |
| GOVSEC.3 | GAP-A1..A5, GAP-O6 | IA, 800-63-4 | code+schema |
| GOVSEC.4 | GAP-B1..B4, GAP-O2, GAP-O7 | SI, API4, LLM10 | code |
| GOVSEC.5 | GAP-C1, GAP-K1, GAP-K2 | AC, insider, SOC2 CC6 | code+policy |
| GOVSEC.6 | GAP-D1..D3, GAP-E1..E3, GAP-O3 | AI RMF, LLM01/05/06/07 | code |
| GOVSEC.7 | GAP-F1..F3, GAP-H2, GAP-O4, GAP-O5 | SC, tenant isolation | code+test |
| GOVSEC.8 | GAP-I1..I4, GAP-O8 | SR, SLSA | CI/infra |
| GOVSEC.9 | GAP-J1..J3 | SC, PQC | code+policy |
| GOVSEC.10 | GAP-L1..L3, GAP-O9 | IR, SOC2 CC7 | code+infra+doc |

---

## 7. Test Strategy Matrix

| Phase | Unit | Integration | Adversarial sim | Notes |
|---|---|---|---|---|
| GOVSEC.2 | ✔ | ✔ | — | audit emission + chain integrity; OSCAL export shape |
| GOVSEC.3 | ✔ | ✔ | ✔ | replay/idle/rebind; AAL conformance |
| GOVSEC.4 | ✔ | ✔ | ✔ | burst/swarm; backpressure correctness |
| GOVSEC.5 | ✔ | ✔ | — | self-approval rejection; break-glass audit completeness |
| GOVSEC.6 | ✔ | ✔ | ✔ | AI-grantor rejection; deputy chains; injection corpus |
| GOVSEC.7 | ✔ | ✔ | ✔ | synthetic-DMW failure paths; cross-org denial |
| GOVSEC.8 | — | — | — | CI job assertions (scan/SBOM/provenance present) |
| GOVSEC.9 | ✔ | — | — | boot-validation FIPS/PQC; algo-routing |
| GOVSEC.10 | ✔ | ✔ | ✔ | alert trigger; fail-closed under fault injection |

Per RULE η-3 (Q-GOVSEC-η), all code phases require unit + integration +
adversarial simulation.

---

## 8. Closure Criteria Matrix

| Phase | CLOSED when |
|---|---|
| GOVSEC.1 | ADR-0049 + this matrix + gap register + optimization register exist; threat model A–L complete; every minimum gap owned; 7 blind spots resolved; tracker+state updated; verifier PASS; regression baselines unchanged |
| GOVSEC.2 | SESSION_EXPIRED/REVOKED emitted at source with chain integrity; OSCAL export exists; tests pass; ADR-0002 amended |
| GOVSEC.3 | idle timeout + device binding + refresh rotation land with AAL targets; replay/idle/rebind tests pass |
| GOVSEC.4 | unmapped routes governed; anomaly→backpressure wired; adversarial-load tests prove backpressure without correctness loss |
| GOVSEC.5 | self-approval resolved; break-glass with time-boxed audit; privileged routes throttled; tests pass |
| GOVSEC.6 | AI-grantor rejection + SESSION_ONLY-for-AI enforced; deputy chains blocked; output/prompt controls; adversarial tests pass |
| GOVSEC.7 | dept/hive filtering confirmed/added; cross-org isolation enforced; cross-wallet denial regression green |
| GOVSEC.8 | dependency + secret scanning + CodeQL/SAST + SBOM + signed provenance gate CI at SLSA L2→L3 |
| GOVSEC.9 | key-rotation/KMS design; algo refs routed through CRYPTO_CONFIG; FIPS/PQC check + asymmetric-import guard |
| GOVSEC.10 | alerting + SIEM/OSCAL export + post-incident runbook + health telemetry; closure cascade lands |

---

*Companion to ADR-0049. Governing rules: RULE 0, RULE 4, RULE 10, RULE 11,
RULE 12, RULE 13, RULE 18, RULE 20, RULE 21. All standards retrieved 2026-05-20.*
