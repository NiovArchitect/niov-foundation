# Build Reconciliation — 2026-05-08

**Status:** Point-in-time reconciliation between the Foundation MVP
Build Guide set, strategic positioning documents, the Otzar PRD, and
`origin/main` reality as of 2026-05-08. Resolves document drift
surfaced during Phase 1 inventory reading. Establishes authoritative
document hierarchy.

**Companion document:** `docs/CURRENT_BUILD_STATE.md` is the
forward-living persistent canonical reference; this file is the
point-in-time evidence of how that canonical state was reconciled.

---

## Section 0 — PROTECTED-PRIORITY queued work

These two gates carry full scope clarity from the 2026-05-07 session
and are explicitly preserved at the top of the forward queue. Phase 2
sequencing MUST treat these as protected scope items regardless of
how broader Build Guide reconciliation resolves.

### Track A Gate 8c — `testing.md` + `onboarding.md` (~2 hours)

**Scope:**

- Create `docs/contributing/testing.md` with **ADR-0011** + **ADR-0015**
  back-citations (per ADR-0011 + ADR-0015 queued promises).
- Create `docs/contributing/onboarding.md` with **ADR-0017**
  back-citation (per ADR-0017 line 710-713 as corrected in commit
  `7269a7a` Gate 8b-amendment).
- Optional: ADR-0017 reference in `testing.md` (per Gate 8c queued
  scope as documented in commit `7269a7a`).
- Optional: ADR-0016 reference in `testing.md` (per ADR-0016
  L500-602 forward-promise corrected in commit `e829644` Gate 8e).

**Substrate-discipline alignment:** closes ADR-0011 / ADR-0015 /
ADR-0016 / ADR-0017 forward promises (bidirectional citation
discipline per RULE 14).

**Status:** QUEUED.

### Track A Gate 8d — Discipline-pattern documentation + algorithm-literal cleanup (~1.5 hours)

**Scope (substrate-discipline-driven per ADR-0019):**

- Hardcoded algorithm literal cleanup at:
  - `createCipheriv("aes-256-gcm")` call sites
  - `createHash("sha256")` call sites
  - `"sha256:"` prefix sites in `observation.service.ts` and
    elsewhere
- Replace with `CRYPTO_CONFIG` constant references.
- Restores crypto-agility from 2/5 toward 3-4/5 per ADR-0019 audit
  findings.
- Node.js 20 deprecation warnings (CI workflow `actions/checkout@v4`
  etc. running on Node.js 20).
- `npm audit` warnings (surface and document).
- Discipline-pattern documentation: how the substrate-discipline
  canonical reference quartet operates in practice; cross-references
  between ADR-0016 (what-to-pin) + ADR-0017 (how-to-investigate) +
  ADR-0018 (where-to-deploy) + ADR-0019 (cryptographic-suite).

**Substrate-discipline alignment:** closes ADR-0019 Outstanding Work
for hardcoded algorithm literal cleanup; addresses Track A Gate 7
carryforward items (Node.js 20 deprecation; npm audit).

**Status:** QUEUED.

> **NOTE:** These two gates are PROTECTED. Their scope detail is
> preserved here verbatim. Phase 2 may sequence them within or
> alongside Build Guide work, but their scope content does NOT get
> re-derived or simplified.

---

## Section 1 — Authoritative document hierarchy

| Document | Authority | Notes |
|---|---|---|
| ADRs 0001-0019 | **CANONICAL** for architectural decisions | Substrate-discipline canonical reference quartet: 0016 (what-to-pin), 0017 (how-to-investigate), 0018 (where-to-deploy), 0019 (cryptographic-suite) |
| `origin/main` code | **CANONICAL** for substrate state | Verified via `git log` + `grep` |
| `CLAUDE.md` | **CANONICAL** operator-facing reference | Current through commit `7269a7a` (Gate 8b-amendment) |
| Patched S9-S17 Build Guide | **AUTHORITATIVE** for §9-§17 scope | April 2026 snapshot; status table superseded by `origin/main` reality (see Section 2) |
| Section 12 standalone Build Guide | **AUTHORITATIVE** for Section 12 sub-section management | Tracks 12A through 12F sub-sections |
| Original 12-section Foundation MVP Build Guide | **HISTORICAL ARTIFACT** | Superseded by Patched edition for §9-§12 scope (operator clarification 2) |
| Manifesto, team memo, Homepage Copy | **AUTHORITATIVE** for strategic positioning | Predate substrate-discipline quartet (2026-05-07); architecturally consistent |
| Otzar PRD | **PARTIALLY SUPERSEDED** | See Section 6 for specific superseded items |
| PRD §6 (integration roadmap), §15 (GTM) | **ACTIVE SCOPE**, forward-looking | Not contradicted by substrate |
| Otzar High Level Architecture, Sadeil Questions, Onboarding Prompts Dandelion | **REFERENCE** | Pre-quartet; consistent with current substrate |

---

## Section 2 — Build Guide section map (origin/main authoritative)

`origin/main` reality leads. Patched Build Guide April 2026 snapshot
documented as historical reference at end of section.

| § | Title | Status | Closing SHA | Tests at close |
|---|---|---|---|---|
| 1 | Data Foundations | ✓ COMPLETE | `724f4c3` (Mark) | 160 cumulative |
| 2 | Authentication | ✓ COMPLETE | `76a4e4b` (Mark) | 189 cumulative |
| 3 | COSMP Protocol | ✓ COMPLETE | `d179669` (Mark) / `b9faa2d` (4 sub-sections) | 242 cumulative |
| 4 | COE | ✓ COMPLETE | `15281d5` (Mark) | 258 cumulative |
| 5 | Hive Intelligence | ✓ COMPLETE | `0cc1594` (Mark) | 272 cumulative |
| 6 | Monetization Engine | ✓ COMPLETE | `680b9c1` (Mark) | 287 cumulative |
| 7 | Compliance Router | ✓ COMPLETE | `616067d` (Mark) | 299 cumulative |
| 8 | API Gateway | ✓ COMPLETE | `5855d62` (Mark) | 311 cumulative |
| 9 | Foundation Governance + Dandelion + Domain Seeding | ✓ CLOSED | `4027208` | 367 + 1 skipped |
| 10 | Seven Feedback Loops | ✓ CLOSED | `298c0ad` | 383 + 1 skipped |
| 11 | Otzar Conversation + Context Priming + Observation | ✓ CLOSED | `6b43bbd` | 433 + 1 skipped (32 files) |
| 12 | Control Tower Connection | **IN FLIGHT** | varies | varies — see Section 4 |
| 13 | Final Testing + Investor Demo | NOT STARTED | — | — |
| 14 | Autonomous Execution + Proactive Behaviors | NOT STARTED | — | — |
| 15 | Enterprise Hardening + Compliance | NOT STARTED | — | — |
| 16 | Otzar Product Completeness | NOT STARTED | — | — |
| 17 | Intelligence Engine — Full 6-Layer Stack | NOT STARTED | — | — |

### Patched Build Guide April 2026 snapshot (historical reference)

The Patched S9-S17 Build Guide's status table dated April 2026
marked §1-8 ✓ COMPLETE (311 cumulative tests at S8 close) and §9-§17
→ BUILD / BUILD NEXT. This was accurate at the time the patches
were drafted. `origin/main` has advanced substantially since: §9, §10,
§11 closed; §12 in flight. The historical snapshot is preserved here
for context; current authoritative status is the table above.

---

## Section 3 — Sections 1-11 substrate mapping

Per-section: Build Guide deliverable → actual files on `origin/main` →
notable architectural decisions.

### Section 1 — Data Foundations

- **Build Guide deliverable:** 6 sub-sections (1A Entity, 1B Wallet,
  1C MemoryCapsule, 1D Permission Registry, 1E Audit Trail, 1F TAR);
  Prisma schema; queries.
- **`origin/main` files:** `packages/database/prisma/schema.prisma`;
  `packages/database/src/queries/{audit,capsule,entity,permission,session,tar,wallet}.ts`
  (7 query files; `session.ts` added beyond the original 1A-1F set).
- **Architectural decisions implemented:** Entity creation
  auto-creates Wallet AND TAR in one transaction (per ADR-0001 three-
  wallet architecture); audit table append-only with BEFORE DELETE
  trigger (per ADR-0002); TAR hash invalidation on session change.

### Section 2 — Authentication

- **Build Guide deliverable:** 7-step login, logout, validateSession;
  bcrypt; JWT signed sessions; Redis nonce.
- **`origin/main` files:** `apps/api/src/services/auth.service.ts`;
  `apps/api/src/middleware/auth.middleware.ts`;
  `packages/auth/src/password.ts`;
  `apps/api/src/routes/auth.routes.ts`.
- **Architectural decisions implemented:** Service-owned auth gate
  pattern (per ADR-0004); `OPERATION_TO_CAPABILITY` map for narrowing
  session permissions to TAR ceiling.

### Section 3 — COSMP Protocol Engine

- **Build Guide deliverable:** 4 sub-sections (3A NEGOTIATE, 3B READ
  2-step, 3C WRITE owner+attributed, 3D SHARE/REVOKE).
- **`origin/main` files:**
  `apps/api/src/services/cosmp/{negotiate,read,share,write}.service.ts`;
  `apps/api/src/routes/cosmp.routes.ts`.
- **Architectural decisions implemented:** COSMP 7-operation
  enumeration locked per ADR-0009 (AUTHENTICATE, NEGOTIATE, READ,
  WRITE, SHARE, REVOKE, AUDIT — patent-canonical per US 12,517,919);
  metadata-fingerprint binding between READ Step 1 and Step 2;
  bridge-aware revoke (revokes all permissions sharing a `bridge_id`
  atomically).

### Section 4 — Contextual Orchestration Engine (COE)

- **Build Guide deliverable:** `assembleContext`, `explicitRecall`,
  `recordOutcome`; relevance-weighted capsule selection within token
  budget.
- **`origin/main` files:** `apps/api/src/services/coe/coe.service.ts`;
  `apps/api/src/services/coe/keywords.ts`; `apps/api/src/routes/coe.routes.ts`.
- **Architectural decisions implemented:** FOUNDATIONAL capsules
  always included regardless of relevance; combined_score weighted
  (tag_overlap × 0.45) + (base_relevance × 0.35) + (recency × 0.20);
  parallel NEGOTIATE on selected capsules.

### Section 5 — Hive Intelligence

- **Build Guide deliverable:** Hive + HiveMembership tables;
  `createHive`, `inviteToHive`, `removeMember`, `getHiveIntelligence`,
  `buildHiveAggregate`.
- **`origin/main` files:** `apps/api/src/services/hive/hive.service.ts`;
  `apps/api/src/routes/hive.routes.ts`.
- **Architectural decisions implemented:** Aggregate never contains
  individual entity IDs (privacy invariant); P1 Patch hook for
  default ENTERPRISE Hive arrives in Section 9.

### Section 6 — Monetization Engine

- **Build Guide deliverable:** MonetizationEvent + WalletBalance
  tables; `triggerMonetizationEvent` async after response;
  `processFailedEvents` cron; 70/30 split.
- **`origin/main` files:**
  `apps/api/src/services/monetization/monetization.service.ts`;
  `apps/api/src/routes/wallet.routes.ts`.
- **Architectural decisions implemented:** FOUNDATIONAL capsules
  never monetized; trigger fires AFTER response (never delays
  user-perceived latency).

### Section 7 — Compliance Router

- **Build Guide deliverable:** ComplianceFramework +
  EntityComplianceProfile tables; 7 framework seeds (HIPAA, GDPR,
  CCPA, FedRAMP_Moderate, FERPA, SOC2, CMMC); `runComplianceChecks`
  injected into COSMP pipeline.
- **`origin/main` files:**
  `apps/api/src/services/compliance/compliance.service.ts`;
  `apps/api/src/routes/compliance.routes.ts`.
- **Architectural decisions implemented:** EntityComplianceProfile
  is org-level, not aggregated (per ADR-0008); manual bearer auth
  for `/compliance/*` endpoints (per ADR-0007); P2 Patch landed in
  Section 11A — HIPAA predicate extended to include
  `CONVERSATION_LEARNING`.

### Section 8 — External API Gateway

- **Build Guide deliverable:** Rate limiting via Upstash Redis;
  developer API keys; auto-generated Swagger docs.
- **`origin/main` files:**
  `apps/api/src/middleware/{auth,gateway,admin}.middleware.ts`;
  `apps/api/src/routes/developer.routes.ts`;
  `apps/api/src/routes/health.routes.ts`.
- **Architectural decisions implemented:** Cross-org leak prevention
  via filter narrowing (per ADR-0006 — DRIFT 9); admin middleware
  separation from regular auth.

### Section 9 — Foundation Governance + Dandelion + Domain Seeding

- **Build Guide deliverable:** 11 governance tables + 4 domain
  intelligence tables (`DomainVocabulary`, `ExternalEntity`,
  `IntelligencePattern`, `CompoundingMetrics`); `createTwin` with
  admin/standard branches (P1 Patch); 4-phase Dandelion.
- **`origin/main` files:**
  `apps/api/src/services/governance/{dandelion,org,seeds,system-permission,twin}.service.ts`;
  `apps/api/src/routes/{org,platform,auth-admin}.routes.ts`.
- **Sub-section commits:** `09e984e` (9A schema) → `230b05f` (9B
  schema) → `7858f14` (9C governance helpers) → `b960473` (9D
  createTwin + Dandelion) → `cabaceb` (9E read-side endpoints) →
  `d0c2fbc` (touchpoints alignment) → `4027208` (Section 9 close).
- **Architectural decisions implemented:** P1 Patch wallet access
  architecture (admin twin standing wallet permission via
  `createSystemPermission()`; standard twin via default ENTERPRISE
  Hive aggregate); industry vocabulary seeding in Phase 0.

### Section 10 — Seven Feedback Loops

- **Build Guide deliverable:** 7 loops with cron schedules;
  `FeedbackLoopHealth` tracking; `FeedbackConfig`;
  `PermissionSuggestion`; `MonetizationSuggestion`.
- **`origin/main` files:**
  `apps/api/src/services/feedback/{feedback.service,scheduler}.ts`.
- **Sub-section commits:** `5ff5e35` (Section 10) → `298c0ad`
  (Section 10 close).
- **Architectural decisions implemented:** Loop 6 outputs no accessor
  identity (privacy invariant); Loop 4 includes default ENTERPRISE
  Hive aggregate (P1 connection from §9); rate-limit setMultiplier
  added to RateLimitStore interface.

### Section 11 — Otzar Conversation + Context Priming + Observation

- **Build Guide deliverable:** `OtzarConversation` table; 8-layer
  system prompt + STEP 0 priming; CONVERSATION_LEARNING capsule
  type; observation pipeline with deduplication, domain vocab
  injection, external entity detection, portability routing.
- **`origin/main` files:**
  `apps/api/src/services/otzar/{otzar.service,observation.service,priming,truncation,cache}.ts`;
  `apps/api/src/routes/{otzar,otzar-observation}.routes.ts`.
- **Sub-section commits:** `12c6d97` (11A capsule types + P2 HIPAA
  patch + LLM provider + agent templates) → `481ed31` (11B
  conductSession + 8-layer prompt + P3 token-budget truncation) →
  `cc13ddf` (11C observation pipeline + extraction + portability
  routing + P2 HTTP verification) → `0cad4b0` (11D audit gap closure
  TP9 + design notes TP10/TP11) → `6b43bbd` (Section 11 close).
- **Architectural decisions implemented:** P2 Patch (HIPAA predicate
  recognizes CONVERSATION_LEARNING); P3 Patch (token-budget
  truncation order — never trim L1/L2/L3/L6); deduplication via
  content_hash on capsule write.

---

## Section 4 — Section 12 sub-section status

Per Section 12 standalone Build Guide.

| Sub-§ | Title | Status | Repo / SHA | Tests |
|---|---|---|---|---|
| 12A | Scaffolding · Auth · 16-screen layout | ✓ CLOSED | otzar-control-tower @ `b08881b` | 4 |
| 12B.0 | Foundation: audit_event_id surfacing | ✓ CLOSED | niov-foundation @ `6151812` | 439 + 1 skipped |
| 12B.1 | Frontend foundation lock-in | ✓ CLOSED | otzar-control-tower @ `9140220` | 6 |
| 12B.2 | Home extension + Users + Invite Wizard | ✓ CLOSED | otzar-control-tower @ `16bd02d` | 8 |
| 12B.3 | AI Teammates screen | ✓ CLOSED | otzar-control-tower @ `b4f17e2` | 10 |
| 12B.4 | Access Control matrix · 12B close | ✓ CLOSED | otzar-control-tower @ `0a28f90` | 12 |
| 12C | Playground · Intelligence dashboard | → BUILD NEXT | — | target 14 + Foundation extensions |
| 12D | Data & Knowledge · Security & Audit · Analytics · Conversations · Workflows | → BUILD | — | target 17 + Foundation extensions |
| 12E | Policies · System Health · Settings | → BUILD | — | target 19 + Foundation extensions |
| 12F | Onboarding wizard · Documentation · a11y · Playwright · Section 12 close | → BUILD | — | target ~22 |

> **Substrate-honesty correction at write time:** the operator's
> draft listed 12B.2/12B.3/12B.4 as queued. Verification against
> otzar-control-tower @ HEAD (`0a28f90`) shows all three sub-sections
> have already CLOSED (commits `16bd02d`, `b4f17e2`, `0a28f90`
> dated May 4-5 2026). The next BUILD NEXT sub-section is **12C**.

### Section 12-adjacent work landed on niov-foundation `origin/main`

| SHA | Subject | Notes |
|---|---|---|
| `6151812` | [SECTION-12B-FOUNDATION] Audit-event-id surfaced in 5 write endpoint responses for audit-aware UI clickability | 439 tests + 1 skipped |
| `ca6e982` | [SECTION-12B-FOUNDATION] Skill assignment audit emission and audit_event_id surfacing | 440 tests + 1 skipped |
| `ee4dafb` | [SECTION-12B-FOUNDATION] AI Teammate detail read endpoint with cross-tenant fail-closed | 443 tests + 1 skipped |
| `9671776` | [SECTION-12.5] Compliance Architecture Review — Foundation @ `ee4dafb` | 24 dimensions, 6 patent claim families |
| `2aa1a88` | [SECTION-12C.0] Foundation endpoint extensions: remove-skill, entities audit, audit filter, bridge filter | 4 endpoints |
| `f3359fb` | [SECTION-12C.0] Foundation compliance hardening: crypto-config + retention posture + system actors + structured logging + compliance state endpoint | 5 items |
| `23e263d` | [SECTION-12C.0.5] Operating manual + documentation infrastructure | 29 files, ~4,340 lines |

---

## Section 5 — Test count timeline

Compiled from `git log` subjects. Timeline is monotonic-with-pauses:
test counts strictly accumulate forward; doc-only commits (Section 12.5,
Section 12C.0.5, Track A Gates 8a/8b/8b-amendment/8e) do not change
the count.

| SHA | Subject | Test count |
|---|---|---|
| `5855d62` | Mark Section 8 (External API Gateway) COMPLETE | 311 cumulative (Build Guide claim) |
| `09e984e` | [SECTION-9A] Schema Part A: 11 governance tables | 311 baseline preserved |
| `230b05f` | [SECTION-9B] Schema Part B: 4 domain-intelligence tables | 311 baseline preserved |
| `7858f14` | [SECTION-9C] CORS, governance helpers, system permissions, IP whitelist, dynamic session timeouts | 328 |
| `b960473` | [SECTION-9D] createTwin (P1 two-branch) + Dandelion 4-phase + admin/platform routes + atomic Phase 0 | 349 |
| `cabaceb` | [SECTION-9E] Read-side endpoint surface complete — /org/* + /platform/* + /auth/refresh | 367 + 1 skipped |
| `4027208` | [SECTION-9-CLOSE] Section 9 complete | 367 + 1 skipped |
| `5ff5e35` | [SECTION-10] Seven Self-Improvement Feedback Loops complete | 383 + 1 skipped |
| `298c0ad` | [SECTION-10-CLOSE] Section 10 complete | 383 + 1 skipped |
| `12c6d97` | [SECTION-11A] Otzar setup foundation: capsule types + P2 HIPAA patch + LLM provider + agent templates | 396 + 1 skipped |
| `481ed31` | [SECTION-11B] Otzar conductSession + 8-layer prompt + P3 token-budget truncation | 414 + 1 skipped |
| `cc13ddf` | [SECTION-11C] Otzar observation pipeline + extraction + portability routing + P2 HTTP verification | 431 + 1 skipped |
| `0cad4b0` | [SECTION-11D] Audit gap closure (TP9) + Section 11 design notes (TP10/TP11) | 433 + 1 skipped |
| `6b43bbd` | [SECTION-11-CLOSE] Section 11 closed: Otzar conversation + observation + audit + design notes (32 files) | 433 + 1 skipped |
| `6151812` | [SECTION-12B-FOUNDATION] Audit-event-id surfaced in 5 write endpoint responses | 439 + 1 skipped |
| `ca6e982` | [SECTION-12B-FOUNDATION] Skill assignment audit emission and audit_event_id surfacing | 440 + 1 skipped |
| `ee4dafb` | [SECTION-12B-FOUNDATION] AI Teammate detail read endpoint with cross-tenant fail-closed | 443 + 1 skipped |
| `9260c53` | [TRACK-A-GATE-5b] Consumer adoption — 6 fixtures + rate-limit cleanup + real-LLM tier | 483 / 484 across 3 tiers |
| `e829644` | [TRACK-A-GATE-8e] ADR-0016 amendment — ADR-0018/0019 worked examples + bidirectional closure | 482 (370 unit + 111 integration + 1 skipped) per CI run 25539791355 |

**Net delta** 311 → 482 = +171 tests during Section 9, 10, 11, 12B
Foundation, and Track A Gate substrate work. All deltas are
timeline-coherent, not contradictory.

---

## Section 6 — PRD reconciliation (superseded items)

Per operator clarification (4): PRD predates substrate-discipline
quartet (2026-05-07) by 6+ days. Items contradicting ADRs are
SUPERSEDED; forward-looking items remain ACTIVE SCOPE.

| PRD Section | Claim | Status | Resolution |
|---|---|---|---|
| §9 (V1) | Blockchain anchoring for COSM audit trail | **SUPERSEDED** | Per ADR-0019: "DECENTRALIZED in DMW means SOVEREIGNTY, not infrastructure"; per CLAUDE.md: "no blockchain, no distributed ledger, no smart contracts, no token" |
| §F (Tech Stack) | Next.js + Python + Go + GraphQL + Kafka + Kubernetes | **SUPERSEDED** | Per ADR-0018 deployment-target agnosticism + actual implementation: Foundation = Node.js + TypeScript + Fastify + Prisma + Vitest; otzar-control-tower = Vite + React + Tailwind + shadcn |
| §8 (MVP Infrastructure) | Kubernetes microservices + Kafka MVP | **SUPERSEDED** | Per ADR-0018; current operator deployment Supabase-hosted; future deployments at customer choice (managed cloud, sovereign cloud, on-prem, air-gapped) |
| §5 | "COSM Protocol" naming | **NOTE** | Internal protocol acronym is COSMP (Contextual Orchestration and Scoped Memory Protocol per patent US 12,517,919); "COSM" remains in customer-facing positioning copy (Manifesto, Homepage Copy) |
| §6 (integration roadmap) | Forward integration scope (Zoom, Fathom, Slack, Teams, Google Workspace as MVP; Webex, Workplace as V1) | **ACTIVE** | Forward-looking; remains in scope; aligned with Section 11 observation pipeline (webhooks per Section 15) |
| §15 (GTM Phase 1 Q1-Q3 2026) | Forward GTM scope: 3-5 design partners, $0 cost pilots, 120 days | **ACTIVE** | Forward-looking; remains in scope |
| §F | "OpenAI" + "Anthropic" LLM providers | **ACTIVE** | Section 11A landed both providers via `getLLMProvider()` factory + `PREFERRED_LLM` env var |

PRD revision recommended in Phase 2 to mark superseded sections
explicitly within the document itself (not in this commit's scope).

---

## Section 7 — ADR inventory

All 19 ADRs at `docs/architecture/decisions/`. Substrate-discipline
canonical reference quartet called out.

| ADR | Title | Notes |
|---|---|---|
| 0001 | Three-wallet architecture | Foundational |
| 0002 | Append-only audit chain with BEFORE DELETE trigger | Foundational; Rule 10 substrate enforcement |
| 0003 | Frozen-config tamper anchors | Section 12C.0 |
| 0004 | Service-owned auth gate pattern | Section 12C.0; canonical example at `compliance.service.ts:528` |
| 0005 | No `console.*` in `apps/api/src` (DRIFT 2 Option C) | Section 12C.0; locked by `tests/unit/no-console-in-api-src.test.ts` |
| 0006 | Cross-org leak prevention via filter narrowing | Section 12C.0; DRIFT 9 |
| 0007 | Manual bearer auth for `/compliance/*` endpoints | Section 12C.0; will be superseded by Sub-box 7 |
| 0008 | `EntityComplianceProfile` is org-level, not aggregated | Section 12C.0; DRIFT 15 |
| 0009 | COSMP 7-operation enumeration (locked) | Patent-canonical per US 12,517,919 |
| 0010 | Foundation tests are legitimately slow (90-110 min) | Section 12C.0 emergent lesson |
| 0011 | Three-tier test stratification | Track A Gate 1; Gate 6 reproducibility-verification amendment in-place at `cae8cf4` |
| 0012 | Test-mode LLM provider hardening | Track A Gate 1; hash-dispatch decision superseded in part by ADR-0014 |
| 0013 | Containerized Postgres for unit and integration tiers | Track A Gate 1; `postgres:16.4-alpine` pin |
| 0014 | FixtureBasedLLMProvider key-based dispatch | Track A Gate 3 ADR amendment; supersedes ADR-0012 hash-by-content dispatch |
| 0015 | CI Workflow Architecture | Track A Gate 7; 8 locked decisions A-H including postgres + Node pins |
| 0016 | **Pin-and-Optimize Framework** | Substrate-discipline canonical reference quartet (what-to-pin); five-question template |
| 0017 | **Production Discipline** | Substrate-discipline canonical reference quartet (how-to-investigate); nine-step template |
| 0018 | **Deployment-Target Agnosticism Posture** | Substrate-discipline canonical reference quartet (where-to-deploy); five-step decision template |
| 0019 | **Cryptographic-Suite Posture** | Substrate-discipline canonical reference quartet (cryptographic-suite resilience); six-step decision template |

---

## Section 8 — Track A gate inventory

Closed gates with SHAs per `git log`. Queued items reference Section 0
above for PROTECTED-PRIORITY scope.

| Gate | SHA | Subject |
|---|---|---|
| Track A Lock | `d728cd4` | Three architectural ADRs for test infrastructure (0011/0012/0013, 540 lines) |
| Gate 3a | `081d35e` | Containerized Postgres test infrastructure (6 files, 184 lines) |
| Gate 3 ADR | `2a14dec` | ADR-0014 supersedes ADR-0012 hash dispatch (1 new ADR + 1 amendment, 184 lines) |
| Gate 3b | `16b4482` | FixtureBasedLLMProvider implementation + 10 recorded fixtures (12 files, ~611 lines + 40K fixtures) |
| Gate 4 | `925761d` | Tier-specific vitest configs + npm scripts (~37× speedup over ADR-0010 baseline) |
| Gate 5a | `c5c8b00` | Foundational substrate — monetization re-classification + rate-limit cleanup architecture |
| Gate 5b | `9260c53` | Consumer adoption — 6 fixtures + rate-limit cleanup + real-LLM tier (483/484 across 3 tiers) |
| G5b-I Resolution | `fbc7942` | Reframe — fix recording script prompt + close test coverage gaps |
| Gate 6 | `cae8cf4` | Reproducibility verification — 3-cycle determinism evidence (ADR-0011 amendment) |
| Gate 7-pre | `e8a559e` | Sync package-lock.json with package.json (typedoc + 17 transitive deps) |
| Gate 7 | `78cf1b5` | CI workflow architecture — 4 files (.nvmrc + 2 workflows + ADR-0015) with 8 locked decisions |
| Gate 7-post | `9f8e909` | Add DATABASE_URL + DIRECT_URL env to Postgres-using CI jobs (Drift G7-E) |
| Gate 7-post-2 | `2fbc057` | Test-local SkillPackage seed in 3 findFirst callers (Drift G7-PRE-C resolution) |
| ADR-0016 | `782154c` | Pin-and-Optimize Framework — substrate resource pinning canonical reference |
| ADR-0017 | `444cf56` | Production Discipline — substrate investigation canonical reference |
| Gate 8a | `3febf83` | ADR cross-citation back-references — close canonical-reference network for ADR-0016 + ADR-0017 |
| Gate 8b | `3a571fb` | CLAUDE.md update — ADR list + Track A status + canonical-discipline references |
| ADR-0018 | `657a794` | Deployment-Target Agnosticism Posture — substrate-portability canonical reference |
| ADR-0019 | `7216784` | Cryptographic-Suite Posture — substrate-cryptographic-resilience canonical reference |
| DOCS-ALIGN | `38d941f` | FIPS_DEPLOYMENT_POSTURE.md — RS256/ES256 framing aligned to ADR-0019 |
| Gate 8b-amendment | `7269a7a` | CLAUDE.md alignment for ADR-0018/0019 + audit-bucket closure |
| Gate 8e | `e829644` | ADR-0016 amendment — ADR-0018/0019 worked examples + bidirectional closure |

**Queued (PROTECTED-PRIORITY — see Section 0):**
- Gate 8c: testing.md + onboarding.md (~2h)
- Gate 8d: discipline-pattern documentation + algorithm-literal cleanup (~1.5h)

---

## Section 9 — Strategic positioning consistency check

| Document | Architecture description | Drift vs substrate | Notes |
|---|---|---|---|
| Manifesto (`The Otzar Supra Infrastructure Manifesto.txt`) | Supra Infrastructure: memory + governance + execution | Consistent | Three patented primitives named (Memory Wallet / COSM Protocol / Otzar Systems & Methods); Masayoshi-tier framing |
| team memo (`team_memo.txt`) | Long-horizon infrastructure; Domain General Intelligence | Consistent | "Layer of intelligence needed to grow up"; explicit positioning as not-an-AI-company |
| Homepage Copy (`NIOV Homepage Copy.txt`) | Apple-block layout; Otzar + COSM Protocol + Memory Wallet as three core systems | Consistent | "COSM" customer-facing acronym (vs internal "COSMP" — vocabulary register difference, not contradiction) |

All three strategic documents predate the substrate-discipline
canonical reference quartet (2026-05-07) but remain architecturally
consistent. **No revision required.**

---

## Section 10 — Forward path (Phase 2 sequence)

1. **PROTECTED-PRIORITY:** Gate 8c (~2h) — `testing.md` +
   `onboarding.md` (closes ADR-0011/0015/0016/0017 forward
   promises).
2. **PROTECTED-PRIORITY:** Gate 8d (~1.5h) — algorithm-literal
   cleanup + Node 20 deprecation + npm audit + discipline-pattern
   documentation (closes ADR-0019 Outstanding Work).
3. **Section 12C** (BUILD NEXT) — Playground + Intelligence
   dashboard + Foundation extensions for `/org/intelligence/*`
   endpoints (per Section 12 standalone Build Guide).
4. **Section 12D** — Data & Knowledge + Security & Audit + Analytics
   + Conversations + Workflows screens + Foundation extensions for
   `/org/audit/:audit_id` etc.
5. **Section 12E** — Policies + System Health + Settings + Pending
   Approvals + Foundation extensions for `/otzar/escalations/*`.
6. **Section 12F** — Onboarding wizard + Documentation +
   accessibility audit + Playwright smoke + Section 12 close.
7. **Patched Build Guide §13** — Final Testing + Investor Demo
   (queued behind §12 close).
8. **Patched Build Guide §14, §15, §16, §17** — Autonomous Execution
   + Enterprise Hardening + Otzar Product Completeness + Intelligence
   Engine 6-Layer Stack.
9. **PRD revision** (queued; mark superseded sections per Section 6).
10. **Recommended Architectural Additions** (per
    `docs/CURRENT_BUILD_STATE.md` Section 12) — sequenced as
    separate dedicated sessions: 12.1 multi-tenant federation, 12.2
    Capsule + COSMP + DMW interconnection map, 12.3 digital twin
    behavior specification, 12.4 LLM provider partnership
    architecture, 12.5 scale architecture, 12.6 category positioning.

---

## Section 11 — Reconciliation closure

This document is the point-in-time reconciliation evidence for
2026-05-08. Future build state lives in `docs/CURRENT_BUILD_STATE.md`
(persistent canonical reference). Future Claude Code sessions should
load the canonical reference at session start; this reconciliation
document is referenced when historical evidence of how the
authoritative hierarchy was established is needed.

**Authoritative hierarchy reaffirmed (operator clarifications):**

1. ADRs + `origin/main` are authoritative for architectural
   decisions.
2. Patched S9-S17 Build Guide is authoritative for §9-§17 scope;
   supersedes original 12-section edition.
3. Section 12 standalone Build Guide is authoritative for Section 12
   sub-section management.
4. CLAUDE.md is canonical operator-facing reference.
5. PRD items contradicting ADRs are superseded; forward-looking
   items remain active scope.

Reconciliation complete.
