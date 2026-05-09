# NIOV Foundation — Current Build State

**Status:** Persistent canonical reference. Updated as build
progresses. Future Claude Code sessions should view this document
at session start to load current build state regardless of
conversation context loss.

**Last updated:** 2026-05-08 (initial landing alongside
`docs/reconciliation/2026-05-08-build-reconciliation.md`)

---

## Section 1 — One-paragraph summary

NIOV Foundation is the **AI Memory Governance Substrate** — the
patented infrastructure layer between language models and enterprise
institutional memory. The **Contextual Orchestration and Scoped
Memory Protocol (COSMP)** governs seven primitive operations on AI
memory; the **Decentralized Memory Wallet (DMW)** holds that memory
as cryptographically-governed capsules owned by the enterprise.
Foundation is **deployment-target agnostic** (managed cloud,
sovereign cloud, on-premise, air-gapped) per ADR-0018, **post-quantum-
ready by primitive selection** per ADR-0019, and runs underneath
**Otzar** (the first canonical application) and any future
enterprise or government applications. Three issued US patents
protect the architecture: **12,164,537** (Dec 2024), **12,399,904**
(Aug 2025), **12,517,919** (Jan 2026).

---

## Section 2 — Authoritative document hierarchy

| Document | Authority |
|---|---|
| ADRs 0001-0019 (`docs/architecture/decisions/`) | **CANONICAL** for architectural decisions |
| `origin/main` code | **CANONICAL** for substrate state |
| `CLAUDE.md` (repo root) | **CANONICAL** operator-facing reference |
| `docs/CURRENT_BUILD_STATE.md` (this document) | **CANONICAL** persistent build state |
| Patched S9-S17 Build Guide | **AUTHORITATIVE** for §9-§17 scope |
| Section 12 standalone Build Guide | **AUTHORITATIVE** for Section 12 sub-section management |
| `docs/reconciliation/2026-05-08-build-reconciliation.md` | **POINT-IN-TIME EVIDENCE** of authoritative hierarchy establishment |
| Original 12-section Foundation MVP Build Guide | **HISTORICAL ARTIFACT**; superseded |
| Strategic positioning docs (Manifesto, team memo, Homepage Copy) | **AUTHORITATIVE** for positioning |
| Otzar PRD | **PARTIALLY SUPERSEDED**; see reconciliation §6 |

---

## Section 3 — Build state by section

| § | Title | Status |
|---|---|---|
| 1 | Data Foundations | ✓ COMPLETE |
| 2 | Authentication | ✓ COMPLETE |
| 3 | COSMP Protocol | ✓ COMPLETE |
| 4 | COE | ✓ COMPLETE |
| 5 | Hive Intelligence | ✓ COMPLETE |
| 6 | Monetization Engine | ✓ COMPLETE |
| 7 | Compliance Router | ✓ COMPLETE |
| 8 | API Gateway | ✓ COMPLETE |
| 9 | Foundation Governance + Dandelion + Domain Seeding | ✓ CLOSED at `4027208` |
| 10 | Seven Feedback Loops | ✓ CLOSED at `298c0ad` |
| 11 | Otzar Conversation + Context Priming + Observation | ✓ CLOSED at `6b43bbd` |
| 12 | Control Tower Connection | **IN FLIGHT** (see Section 4) |
| 13 | Final Testing + Investor Demo | NOT STARTED |
| 14 | Autonomous Execution + Proactive Behaviors | NOT STARTED |
| 15 | Enterprise Hardening + Compliance | NOT STARTED |
| 16 | Otzar Product Completeness | NOT STARTED |
| 17 | Intelligence Engine — Full 6-Layer Stack | NOT STARTED |

---

## Section 4 — Section 12 sub-section status

Per Section 12 standalone Build Guide.

| Sub-§ | Title | Status |
|---|---|---|
| 12A | Scaffolding · Auth · 16-screen layout | ✓ CLOSED — otzar-control-tower @ `b08881b` (4 tests) |
| 12B.0 | Foundation: audit_event_id surfacing | ✓ CLOSED — niov-foundation @ `6151812` (439 + 1 skipped) |
| 12B.1 | Frontend foundation lock-in | ✓ CLOSED — otzar-control-tower @ `9140220` (6 tests) |
| 12B.2 | Home extension + Users + Invite Wizard | ✓ CLOSED — otzar-control-tower @ `16bd02d` (8 tests) |
| 12B.3 | AI Teammates screen | ✓ CLOSED — otzar-control-tower @ `b4f17e2` (10 tests) |
| 12B.4 | Access Control matrix · 12B close | ✓ CLOSED — otzar-control-tower @ `0a28f90` (12 tests) |
| 12C | Playground · Intelligence dashboard | **→ BUILD NEXT** (target 14 tests + Foundation extensions) |
| 12D | Data & Knowledge · Security & Audit · Analytics · Conversations · Workflows | → BUILD (target 17 tests + Foundation extensions) |
| 12E | Policies · System Health · Settings | → BUILD (target 19 tests + Foundation extensions) |
| 12F | Onboarding wizard · Documentation · a11y · Playwright · Section 12 close | → BUILD (target ~22 tests) |

**otzar-control-tower HEAD:** `0a28f90` (closes 12B).
**niov-foundation HEAD:** `47d8596` (Track A Gate 8f).

---

## Section 5 — Track A gate inventory

**Closed gates:**

| Gate | SHA |
|---|---|
| Track A Lock (ADRs 0011/0012/0013) | `d728cd4` |
| Gate 3a (Containerized Postgres) | `081d35e` |
| Gate 3 ADR (ADR-0014 supersedes ADR-0012) | `2a14dec` |
| Gate 3b (FixtureBasedLLMProvider + 10 fixtures) | `16b4482` |
| Gate 4 (Tier configs + npm scripts) | `925761d` |
| Gate 5a (Foundational substrate) | `c5c8b00` |
| Gate 5b (Consumer adoption + 3-tier verification) | `9260c53` |
| G5b-I Resolution | `fbc7942` |
| Gate 6 (Reproducibility verification; ADR-0011 amendment) | `cae8cf4` |
| Gate 7-pre | `e8a559e` |
| Gate 7 (CI workflow architecture; ADR-0015) | `78cf1b5` |
| Gate 7-post (Drift G7-E fix) | `9f8e909` |
| Gate 7-post-2 (Drift G7-PRE-C fix) | `2fbc057` |
| ADR-0016 (Pin-and-Optimize Framework) | `782154c` |
| ADR-0017 (Production Discipline) | `444cf56` |
| Gate 8a (ADR cross-citation back-references) | `3febf83` |
| Gate 8b (CLAUDE.md update) | `3a571fb` |
| ADR-0018 (Deployment-Target Agnosticism Posture) | `657a794` |
| ADR-0019 (Cryptographic-Suite Posture) | `7216784` |
| DOCS-ALIGN (FIPS_DEPLOYMENT_POSTURE.md) | `38d941f` |
| Gate 8b-amendment | `7269a7a` |
| Gate 8e (ADR-0016 amendment) | `e829644` |
| BUILD-RECONCILIATION + CANONICAL-REFERENCE | `95ad861` |
| Gate 8c (testing.md + onboarding.md) | `bea1b33` |
| Gate 8d (algorithm-literal cleanup) | `2fc025a` |
| RAA 12.7 (Dynamic Flow Architecture) | `0fd8da7` |
| Gate 9 (architectural framing integration) | `c399980` |
| Gate 8f (fast-uri 3.1.0→3.1.2 npm overrides) | `47d8596` |

**Queued:** see Section 6 (PROTECTED-PRIORITY).

---

## Section 6 — PROTECTED-PRIORITY queued work

PROTECTED-PRIORITY queue tracks the two-gate window at the top of
the forward queue: the gate currently in flight (closed at end-of-
commit) and the gate immediately following it. Earlier closures
are tracked in §5 closed-gates table; deeper queue work is tracked
in §12 Recommended Architectural Additions and the Track A gate
plan.

### Track A Gate 8h — Canonical reference refresh (~1 hour)

**Status:** closed at end-of-commit.

**Scope:**

- `CLAUDE.md` §5 + §6 — "as of Track A Gate 8b-amendment" updated
  to "as of Track A Gate 8h"; §6 Track A list operational status
  refreshed (Gate 8b-amendment / 8c / 8d / 8e all marked CLOSED
  with SHAs). §6 historical framing (L348 + L398) preserved per
  Gate 9 D-2 option (c) precedent (contemporaneous accuracy).
- `docs/CURRENT_BUILD_STATE.md` — §4 niov-foundation HEAD updated
  `e829644` → `47d8596`; §5 closed-gates table appended with 6
  missing entries (BUILD-RECONCILIATION `95ad861`, Gate 8c
  `bea1b33`, Gate 8d `2fc025a`, RAA 12.7 `0fd8da7`, Gate 9
  `c399980`, Gate 8f `47d8596`); §6 rotated to Gate 8h
  closed-at-end-of-commit + Gate 8g queued; §8 test surface
  counts updated (Unit 370 → 371; Total 482 → 483; CI run
  25539791355 → 25611252522); §9 cross-repo niov-foundation HEAD
  `e829644` → `47d8596`.
- `.github/workflows/ci.yml` L63 — unit-tier job name label
  `(370 tests)` → `(371 tests)`. Cosmetic display only; vitest
  runs whatever passes.

**Lineage:** RAA 12.7 (`0fd8da7`) + Gate 9 (`c399980`) + Gate 8f
(`47d8596`) commit bodies all deferred canonical-reference
refresh to Gate 8h. D-G8H-1 substrate-honesty drift surfaced
during Gate 8h investigation: forward "Node.js 20→24" gate
predicted in Gate 8f / Gate 9 / RAA 12.7 commit bodies as
"Gate 8e" conflicted with closed Gate 8e (`e829644` ADR-0016
amendment, immutable record). D-1 resolution: forward
toolchain-modernization gate renamed to Gate 10. Gate 8x family
preserved as security-advisory cluster (8a/8b-amendment/8c/8d/
8e/8f/8g/8h); Gate 10 starts toolchain-modernization cluster.
Older commit-body forecasts referencing "Gate 8e Node.js 20→24"
become slightly inaccurate predictions but not substrate
violations per origin/main immutability discipline.

**Substrate-discipline alignment:** closes the canonical reference
staleness window opened by 2026-05-08/09/10 commit cycle. RULE
14 (bidirectional citation — §6 entries cite SHAs; SHAs cite §6
via commit-body cross-reference). RULE 13 (drift surfacing —
D-G8H-1 Gate 8e numbering, D-G8H-2 historical framing
preservation, D-G8H-3 last-verified CI run reference, D-G8H-E5
table format substrate-coherence, all surfaced inline before
silent fix).

### Track A Gate 8g — tar/bcrypt 5→6 breaking + remaining audit advisories (~2-3 hours; dedicated session)

**Status:** queued.

**Scope:**

- `tar` 5→6 transition (HIGH-severity advisories: hardlink path
  traversal, symlink poisoning, race condition on macOS APFS,
  drive-relative linkpath, etc. — 6 advisories total).
- `bcrypt` 5→6 transition (depends on `@mapbox/node-pre-gyp` →
  `tar` chain; bcrypt is critical password-hashing surface and
  the major-version migration affects auth code paths).
- Remaining `esbuild` advisory (moderate; dev-tree via
  `vitest`/`vite`/`vite-node`/`@vitest/mocker` chain — separate
  evaluation: dev-only surface vs production vulnerability).
- `npm audit fix --force` would auto-bump but introduces
  `vitest@4.1.5` breaking change; substrate-honesty
  investigation of impact required first.

**Lineage:** Gate 8f (`47d8596`) cleared 2 fast-uri advisories
non-breakingly; tar/bcrypt remaining HIGH-severity advisories
require breaking upgrades and dedicated fresh-sharpness session
per Gate 8f commit body and operator session-opening queue.

**Substrate-discipline alignment:** ADR-0016 Pin-and-Optimize
Framework (security-patch-cadence axis applies; whether to bump
bcrypt 5→6 also touches PQC migration trajectory per ADR-0019).
ADR-0017 Production Discipline (nine-step template applies to
breaking dependency upgrade — frame the drift, distinguish
observation/inference, verify empirically before fix design).
8x security-advisory cluster closes with Gate 8g.

---

## Section 7 — ADR inventory

All 19 ADRs at `docs/architecture/decisions/`. Substrate-discipline
canonical reference quartet **bolded**.

| ADR | Title |
|---|---|
| 0001 | Three-wallet architecture |
| 0002 | Append-only audit chain with BEFORE DELETE trigger |
| 0003 | Frozen-config tamper anchors |
| 0004 | Service-owned auth gate pattern |
| 0005 | No `console.*` in `apps/api/src` (DRIFT 2 Option C) |
| 0006 | Cross-org leak prevention via filter narrowing |
| 0007 | Manual bearer auth for `/compliance/*` endpoints |
| 0008 | `EntityComplianceProfile` is org-level, not aggregated |
| 0009 | COSMP 7-operation enumeration (locked per US 12,517,919) |
| 0010 | Foundation tests are legitimately slow (90-110 min) |
| 0011 | Three-tier test stratification |
| 0012 | Test-mode LLM provider hardening |
| 0013 | Containerized Postgres for unit and integration tiers |
| 0014 | FixtureBasedLLMProvider key-based dispatch (supersedes 0012 dispatch) |
| 0015 | CI Workflow Architecture |
| **0016** | **Pin-and-Optimize Framework** (substrate-pinning canonical reference) |
| **0017** | **Production Discipline** (substrate-investigation canonical reference) |
| **0018** | **Deployment-Target Agnosticism Posture** (substrate-portability canonical reference) |
| **0019** | **Cryptographic-Suite Posture** (substrate-cryptographic-resilience canonical reference) |

---

## Section 8 — Test surface current state

| Tier | Count | Last verified |
|---|---|---|
| Unit | 371 | CI run 25611252522 (2026-05-10) |
| Integration | 111 + 1 skipped | CI run 25611252522 (2026-05-10) |
| LLM-required nightly | (verify count when nightly runs) | (verify) |
| **Total** | **483** | CI run 25611252522 (2026-05-10) |

Test count timeline reference: see
`docs/reconciliation/2026-05-08-build-reconciliation.md` Section 5
(311 → 482 across Sections 9, 10, 11, 12B Foundation, and Track A
Gate substrate work).

---

## Section 9 — Cross-repo state

| Repo | Role | HEAD |
|---|---|---|
| niov-foundation | Substrate (Foundation) | `47d8596` (2026-05-10) |
| otzar-control-tower | Otzar Control Tower frontend | `0a28f90` (2026-05-05; closes 12B) |

**Cross-repo discipline** (per Section 12 standalone Build Guide):
"Foundation extensions land first as separate commits with their own
tests. Frontend lands second consuming the new contract."

Canonical Section 12B-Foundation extension commits on niov-foundation:
`6151812` (audit_event_id surfacing) → `ca6e982` (skill assignment
audit) → `ee4dafb` (AI Teammate detail read with cross-tenant
fail-closed).

---

## Section 10 — Authoritative architecture summary

**Foundation = the substrate** (memory governance + protocol +
execution control).

**COSMP = 7-operation protocol** (locked per ADR-0009 +
US 12,517,919):

1. AUTHENTICATE
2. NEGOTIATE
3. READ (2-step: metadata + content)
4. WRITE (owner + attributed)
5. SHARE
6. REVOKE
7. AUDIT

**DMW = Decentralized Memory Wallet** (3 wallet types per ADR-0001):

- Personal (institutional memory; portable with employee)
- Enterprise (zero-payload aggregation; org wallet)
- Device (per-device memory)

**Capsule structure (7 layers):** Payload, Metadata, Rules,
Relations, Time, Permissions, Audit.

**Substrate properties:**

- Deployment-target agnostic per ADR-0018.
- Post-quantum-ready by primitive selection per ADR-0019.
- Append-only audit chain per ADR-0002 (BEFORE DELETE trigger).
- Service-owned auth gate per ADR-0004.
- Cross-org leak prevention enforced runtime per ADR-0006.
- FIPS-deployment posture documented in
  `docs/FIPS_DEPLOYMENT_POSTURE.md`.

**Substrate-adjacent products:**

- **Otzar** = first canonical application built on Foundation.
- **Otzar Control Tower** = admin / governance UI for Otzar
  (16 screens; sub-sections 12A through 12F).
- Future applications: enterprise + government tier.

**Patent stack** (all personally held; NIOV Labs licenses):

- US 12,164,537 (Dec 2024) — ABT database / file management.
- US 12,399,904 (Aug 2025) — alert manager + TARs continuation.
- US 12,517,919 (Jan 2026) — COSMP / DMW continuation.

---

## Section 11 — Compliance + government-grade scope

### Implemented

- 7 framework seeds (per Build Guide §7): HIPAA, GDPR, CCPA,
  FedRAMP_Moderate, FERPA, SOC2, CMMC.
- `runComplianceChecks` injected into COSMP pipeline.
- Append-only audit chain with cryptographic enforcement per
  ADR-0002.
- TAR hash invalidation on session change per Section 1F /
  ADR-0001 family.
- Post-quantum-ready cryptographic posture per ADR-0019.
- Deployment-target agnosticism per ADR-0018 (sovereign cloud,
  on-prem, air-gapped, managed cloud).
- Section 12.5 Compliance Architecture Review (commit `9671776`)
  covered 24 dimensions and 6 patent claim families. Output:
  `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md`.
- Structured logging schema documented in
  `docs/STRUCTURED_LOGGING_SCHEMA.md`.
- Audit retention posture documented in
  `docs/AUDIT_RETENTION_POSTURE.md`.
- FIPS deployment posture documented in
  `docs/FIPS_DEPLOYMENT_POSTURE.md`.

### Queued (Phase 2)

- **Section 15:** Enterprise Hardening + Compliance (per Patched
  Build Guide).
- **CNSA 2.0 attestation** (per ADR-0019 PQC-readiness framing;
  follow-on after Phase 2).
- **NIST SP 800-53 control mapping** (subset already implicit per
  Section 12.5 review; explicit mapping queued).
- **FedRAMP High vs Moderate distinction** — Build Guide §7 seeds
  Moderate; High requires additional posture.
- **Continuous compliance reporting endpoints** — verify which
  dimensions remain open per Section 12.5 review.

---

## Section 12 — Recommended Architectural Additions

Six forward-tracked architectural additions surfaced during the
2026-05-08 session. Each is captured here for dedicated future-session
investigation + design + ADR. **None are designed today;** this section
captures scoped concerns + research-grounded framings.

### 12.1 Multi-tenant federation architecture

**Concern:** Enterprise customers like Nike (with Nike USA, Nike
Japan, Nike Dubai as separate legal entities) need separate
sovereign data per tenant + admins + employees, with optional
consent-gated parent-org roll-up intelligence.

**Current state:**

- Foundation has organization-scoped entities, RBAC infrastructure,
  audit-chain enforcement, cross-org leak prevention (ADR-0006).
- Single-org multi-entity is built.
- Cross-org isolation is built.
- Cross-tenant federation (consent-gated parent-org intelligence) is
  NOT yet built.

**Research findings (2026-05-08):**

- Salesforce uses single shared multitenant database + multitenant
  kernel + OrgID partitioning at every query layer.
- Salesforce Hyperforce overlay provides per-region data residency
  (US / EU / UK / Germany / India / Japan / UAE / etc.).
- Salesforce treats Nike-USA / Nike-Japan / Nike-Dubai as separate
  ORGS within their respective regional Hyperforce instances.
- Industry assessment: "Hyperforce provides data residency at the
  country level, but does not natively support country-specific data
  isolation within a single org. Multinational enterprises must
  carefully consider their approach to data residency and
  cross-border data flows."
- Three-tier multi-tenant model categories: shared database / shared
  schema; shared database / separate schemas; separate databases per
  tenant.

**Recommended architecture for Foundation:**

- Per-region Foundation deployments for sovereign data residency
  (matches Hyperforce regional pattern).
- Within each regional deployment: multi-tenant kernel with strong
  tenant isolation (each subsidiary = own tenant, OrgID partitioning,
  RBAC + ABAC enforcement).
- Optional federation layer for parent-organization roll-up
  intelligence with explicit per-tenant consent gates and audit
  trails.

This is stronger than Salesforce's current native offering.
**Differentiator opportunity.**

**Recommended addition:** NEW ADR + scope work. Likely substantial
implementation cycle.

### 12.2 Capsule + COSMP + DMW interconnection map

**Concern:** Bilateral relationships between capsules, COSMP
operations, and DMW wallets are documented across multiple Build
Guide sections (1, 3, 5) but not surfaced as a single coherent
picture. The governance topology (how capsules flow through COSMP
operations within DMW boundaries) needs unified documentation.

**Current state:**

- Substrate is built (Sections 1, 3, 5 closed).
- `docs/reference/architectural-anchors.md` referenced in CLAUDE.md
  but flagged as having "mild secondary drift" deferred to Sub-box 7
  work.
- No single canonical interconnection map exists.

**Recommended addition:** Documentation work only. Single canonical
document showing full lifecycle:

- Capsule creation → 7-layer assembly → wallet assignment.
- COSMP 7 operations operating on capsules.
- DMW 3 wallet types holding capsules.
- Bilateral relationships: capsule ↔ wallet ↔ entity ↔ governance.
- Cross-references to ADRs and Build Guide sections.

**Effort:** ~2-4 hours documentation. No new substrate work
required.

### 12.3 Digital twin behavior specification

**Concern:** Specific agent behaviors not yet fully specified:

- Listeners + click-watching + workflow learning.
- Permission temporality model (short-term, long-term, indefinite).
- Cross-departmental collaboration rules (when does Twin A from
  Marketing get to ask Twin B from Engineering for context, governed
  by what?).
- After-hours autonomous operation with deferred permission
  requests.
- Federated learning across twins within an org.
- Twin portability when employee changes companies.

**Current state:**

- Section 11 (Otzar Conversation + Context Priming + Observation) —
  CLOSED (observation pipeline built).
- Section 14 (Autonomous Execution + Proactive Behaviors) —
  NOT STARTED.
- Section 16 (Otzar Product Completeness — federated learning, twin
  portability) — NOT STARTED.
- Section 17 (Intelligence Engine 6-Layer Stack) — NOT STARTED.

Behaviors above are partially in Section 14 / 16 / 17 scope but at
insufficient granularity. Specific gaps:

- Permission temporality model (short / long / indefinite) needs
  explicit ADR.
- Cross-departmental collaboration rules need explicit specification
  (RBAC + ABAC interaction with twin-to-twin requests).
- After-hours autonomous operation with deferred permission requests
  needs specification.

**Recommended addition:** NEW ADR for permission temporality + scope
expansion in Sections 14 / 16. Some new substrate work required
(permission temporality model, twin-to-twin collaboration gateway,
deferred permission queue).

### 12.4 LLM provider partnership architecture

**Concern:** Foundation should be positioned as valuable
intermediary for LLM providers (OpenAI, Anthropic, Google, etc.),
not as competitor. Need explicit architecture for:

- Model-agnostic routing (multi-LLM support per enterprise customer
  choice).
- No-train contractual commitments and technical enforcement.
- PII-stripping pipeline (Foundation produces clean data for LLM
  consumption).
- Allowlist enforcement at gateway (admin-controlled provider
  allowlists).

**Current state:**

- Foundation is LLM-provider-agnostic by design (substrate doesn't
  pick the LLM).
- LLM provider integration patterns not yet architected as explicit
  substrate component.
- PII-stripping happens implicitly via capsule governance but not
  surfaced as discrete pipeline.

**Research findings (2026-05-08):**

- Enterprise LLM gateways (Bifrost, Kong AI Gateway, Cloudflare AI
  Gateway, LiteLLM, OpenRouter) all emerging in 2026.
- 2026 enterprise procurement standards: GPAI deployer transparency,
  use-case risk classification, no-train commitments, incident
  notification, model-change notice.
- Anthropic (40% enterprise LLM API spend), OpenAI (27%), others —
  diversifying enterprise LLM stack.
- Industry framing: "Enterprises will no longer ask which LLM to
  use. They'll ask how to build memory that is private, precise, and
  persistent."

**Recommended Foundation positioning:**

- Foundation makes LLM providers deployable in regulated enterprise /
  government environments where they otherwise couldn't go.
- Symbiotic, not adversarial: "We govern; you reason. We bring the
  customers; you bring the capability."
- Foundation = the substrate that makes harnesses, agents,
  applications governable.

**Recommended addition:** NEW ADR for LLM provider integration
architecture + scope work for explicit PII-stripping pipeline +
allowlist gateway component.

### 12.5 Scale architecture (billion-entity / trillion-capsule)

**Concern:** Foundation's correctness-first substrate needs forward
architecture for billion-entity / trillion-capsule / millions-of-
applications scale.

**Current state:**

- Substrate is correct, not yet scaled.
- ADR-0018 codifies deployment-target agnosticism (where) but not
  scale architecture (how big).
- Single-deployment scale ceiling not specified.

**Required architecture:**

- Capsule storage tiering (hot / warm / cold tiers).
- Audit chain partitioning (sharded by tenant or time).
- Capsule index sharding (likely tenant-scoped with cross-shard
  query coordinator).
- Cache invalidation strategy at scale (TAR hash invalidation across
  distributed cache).
- COSMP operation queue (write / audit operations queueable at
  scale).

**Recommended addition:** Scale architecture document (architectural
specification, not yet implementation). Future implementation work
after specification lands.

**Not a YC-readiness blocker.** Path to scale is demonstrable;
implementation is forward work.

### 12.6 Category positioning (AI Memory Governance Substrate)

**Concern:** Foundation is not a harness. It's the substrate that
harnesses run on. Needs explicit category positioning to differentiate
from agent harnesses (Claude Code, OpenClaw-style tools) and from
LLM providers' own moves into agent orchestration.

**Research findings (2026-05-08):**

- "Agent harness" definition: software infrastructure wrapping
  around an LLM, handling tool calls, memory management within
  session, multi-step orchestration.
- Harnesses are per-application infrastructure.
- Foundation is per-enterprise infrastructure (different layer).
- LLM providers all moving up the stack toward agent orchestration
  (OpenAI acquihire of OpenClaw creator signals this).

**Foundation's category claim:**

- "AI Memory Governance Substrate" (technical audience).
- "Supra Infrastructure for Autonomous Enterprises" (strategic
  audience; per Manifesto).
- First canonical implementation of patented protocol (COSMP) and
  storage architecture (DMW) for AI memory governance.
- Salesforce, Microsoft, Google, LLM providers do NOT have substrate
  at this layer — they have application-layer features approximating
  parts of it.

**Differentiators:**

- Patent-protected protocol (COSMP — 3 issued patents).
- Cryptographic memory ownership (enterprise owns wallet; LLM rents
  access).
- Append-only audit chain.
- Post-quantum-ready primitive selection.
- Deployment-target agnosticism.
- Multi-tenant kernel (with federation as Recommended Addition
  12.1).

**Recommended addition:** Strategic positioning document + explicit
category-claim language in CLAUDE.md and canonical reference.
Possibly external positioning materials (whitepaper, technical
brief, investor deck supporting documents).

### 12.7 Dynamic Flow Architecture (CLOSED)

**Status:** CLOSED — landed at commit `0fd8da7` on origin/main
2026-05-09.

**Document:** `docs/architecture/dynamic-flow-architecture.md`
(1,451 lines, 15 sections, 2 Mermaid diagrams).

**Establishes:** Foundation as embodied substrate for AI cognition
— substrate-as-body framing, not substrate-as-brain. Codifies
bilateral-vs-unilateral zone discrimination (4 unilateral / 5
bilateral; default rule: bilateral). Classifies 10 dynamic-flow
capabilities as 5 SUBSTRATE / 2 PARTIAL / 3 NET-NEW. Encodes
qi-and-blood metaphor as architectural anchor; positions Foundation
for the ASI consumer trajectory. Adapts 8 public-domain research
patterns (CRDTs, Attention, Federated Learning, Logical clocks,
Spatial indexing, Active learning, Multi-armed bandits, Multi-source
query parallelism) within Foundation's patent-protected COSMP/DMW
envelope.

**Forward dependency:** RAA 12.2 (static interconnection map; queued)
builds over this dynamic flow foundation, not the other way around.

---

## Section 13 — Source-of-truth pointers

| Type | Location |
|---|---|
| Architectural decisions | `docs/architecture/decisions/0001-*.md` through `0019-*.md` |
| Operator-facing canonical reference | `CLAUDE.md` (repo root) |
| Persistent build state (this document) | `docs/CURRENT_BUILD_STATE.md` (repo root level under docs/) |
| Compliance posture | `docs/FIPS_DEPLOYMENT_POSTURE.md` |
| Compliance Architecture Review | `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` (landed at `9671776`) |
| Audit retention posture | `docs/AUDIT_RETENTION_POSTURE.md` |
| Structured logging schema | `docs/STRUCTURED_LOGGING_SCHEMA.md` |
| Glossary | `docs/reference/glossary.md` |
| Architectural anchors | `docs/reference/architectural-anchors.md` (note: flagged for Sub-box 7 update) |
| Section 12 progress tracker | `docs/reference/section-12-progress.md` |
| Patched Build Guide PDF | `docs/NIOV_Master_Build_Guide_S9_S17_Patched.pdf` (gitignored, working reference) |
| Section 12 Build Guide (text) | `~/Desktop/NIOV Labs/github/builddocs/NIOV_Section_12_Build_Guide.txt` (working reference, not in repo) |
| Original 12-section Foundation MVP Build Guide | `~/Desktop/NIOV Labs/Otzar Dev/NIOV_Foundation_MVP_Build_Guide.txt` (historical artifact, not in repo) |
| Strategic positioning docs | `~/Desktop/NIOV Labs/Otzar Dev/` (pre-quartet, architecturally consistent, not in repo) |
| Reconciliation evidence | `docs/reconciliation/2026-05-08-build-reconciliation.md` |

---

## Section 14 — Update protocol

This document is the persistent canonical reference. **Update
conditions:**

- After any Section close → update Section 3 status.
- After any Track A gate close → update Section 5.
- After any new ADR landed → update Section 7.
- After any Recommended Architectural Addition gets designed and
  lands as ADR or scope → move from Section 12 to Section 7 +
  Section 5.
- After any major scope change → update Section 1 one-paragraph
  summary if needed.
- After any sub-section close on otzar-control-tower → update
  Section 4.
- After any test count change → update Section 8.

Updates are commit-tracked changes to this document. Future Claude
Code sessions should view this document at session start before any
work begins.

**Companion documents that may also need updates:**

- `CLAUDE.md` — when RULES change or when a new ADR is added (RULE
  14 bidirectional citation discipline).
- `docs/reference/section-12-progress.md` — when Section 12
  sub-sections advance.
- ADR back-citations — RULE 14 requires bidirectional citation
  closure within the same commit.
