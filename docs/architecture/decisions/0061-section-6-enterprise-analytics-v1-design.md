# ADR-0061: Section 6 Enterprise Analytics v1 SAFE Projection Pattern

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SLEEP-DIRECTIVE-SECTION-6-ANALYTICS-V1-ADR-AUTH]`
(per Founder Sleep Directive 2026-05-30 next-section
preference #4: "Section 6 Enterprise Analytics —
research/design only unless substrate-safe").

This is the **Section 6 Wave 1 contract ADR**. It is
design-only: locks the analytics SAFE projection pattern at
the substrate-architectural register; deliberately does NOT
pick specific aggregates (each future aggregate is a Wave 2+
slice with its own Founder authorization); locks the
minimum-population threshold default at k≥5 citing HIPAA
Safe Harbor regulatory precedent; defers cross-org analytics
to forward-substrate behind CAR Sub-box 8. **No code, no
new routes, no schema migration, no new audit literal** in
this phase.

## Context

### Substrate-honest Phase 0 finding (2026-05-30)

Phase 0 verification surfaced that Section 6 substrate is in
the same state as Section 5 before ADR-0060: greenfield at
the analytics-surface tier, but with mature operational
signal substrate ready to be consumed:

- **Feedback Loops 1–7 LIVE** at
  `apps/api/src/services/feedback/feedback.service.ts`
  (lines 56–67 + 275–729). Per-entity / per-hive scores
  already produced:
  - Loop 1: `MemoryCapsule.relevance_score` persisted.
  - Loop 2: `FeedbackConfig.relevance_floor` persisted.
  - Loop 3: `PermissionSuggestion` rows when bridge_count ≥3.
  - Loop 4: Hive aggregate refresh via `buildHiveAggregate`.
  - Loop 5: `ANOMALY_DETECTED` audit at ratio ≥10x baseline.
  - Loop 6: `MonetizationSuggestion` rows with `demand_level`.
  - Loop 7: Stale-loop audit emission.
- **`buildHiveAggregate` LIVE** at
  `apps/api/src/services/hive/hive.service.ts:651-812`
  producing same-org aggregate-tag projection (per ADR-0059
  v1 lock).
- **`queryAuditEvents` LIVE** at
  `packages/database/src/queries/audit.ts:701-742` with
  per-entity / per-event-type / per-time-window filters —
  ready as an analytics input primitive (org-scoping via
  `getOrgEntityId` lookup).
- **`EntityMembership.is_active` + `parent_id`** at
  `schema.prisma:799-817` is the canonical org-population
  resolver.
- **`EntityComplianceProfile` LIVE** at `schema.prisma:678-688`
  (frameworks + sector + jurisdiction); no aggregate
  computed today.

What does NOT exist yet:
- Any `/api/v1/analytics/*` route.
- Any analytics service tier.
- Any persisted analytics-projection model.
- Any minimum-population threshold convention in the
  codebase (zero hits for `k_anonymity`, `min_population`,
  `population_threshold`, `min_aggregate`).
- Any cross-org analytics primitive (per ADR-0037 +
  ADR-0049: jurisdiction tagging is metadata isolation, NOT
  cross-org aggregation; CAR Sub-box 8 explicitly reserves
  cross-org analytics).

### RULE 21 research arc

External regulatory + design literature consulted at Phase 0:

- **HIPAA Safe Harbor de-identification standard**
  (45 CFR §164.514(b)(1)): establishes k≥5 minimum group
  size as the conventional regulatory floor for protecting
  against re-identification in aggregate health data
  releases. This is **external regulatory precedent** —
  citing it in ADR-0061 as the v1 default is substrate-
  honest reuse of an established external standard, NOT an
  NIOV invention.
- **k-anonymity literature** (Samarati & Sweeney 1998 +
  follow-on): k=5 is widely cited as a baseline for
  organizational analytics; tighter k values (10, 20) are
  used for high-sensitivity data; looser values (k=3) are
  used for low-sensitivity / large-population contexts. v1
  picks the conventional middle: k=5.
- **Differential privacy** (Dwork 2006+): provides a more
  rigorous privacy guarantee than k-anonymity but requires
  noise injection that distorts small-N aggregates badly;
  forward-substrate for Foundation if specific compliance
  frameworks (NIST AI RMF, EU AI Act) demand it.
- **ADR-0058 §7 (drift signals)** + **ADR-0059 §3.e (hive
  aggregates)** + **ADR-0060 §1 (playground inspectors)**:
  the in-repo precedent quartet for SAFE projection
  patterns. ADR-0061 ports the pattern to analytics.

### Why Section 6 is unblocked at v1

Section 3 (Hives) Wave 1 ADR-0059 landed 2026-05-30 (PR #85),
canonicalizing the same-org aggregate-projection contract.
The substrate doc previously said "Section 6 follows hive
intelligence (Section 3)" as the sequencing gate. Section 3
v1 design is now LIVE → Section 6 v1 design is unblocked.

## Decision

Foundation will canonicalize Section 6 Enterprise Analytics v1
as a **SAFE projection pattern definition** at the
substrate-architectural register. ADR-0061 locks the pattern;
each future aggregate ships as its own Wave 2+ slice under
separate Founder authorization. v1 ships NO specific
aggregates (deferred to Wave 2 per "implementation only when
substrate-safe without new Founder product decisions" — the
choice of WHICH aggregate to surface IS a Founder product
decision per ADR-0052 doctrine).

### 1. v1 scope lock — the analytics SAFE projection pattern

Every Foundation analytics aggregate (current + future) MUST
satisfy ALL of these constraints:

#### 1.a — Closed-vocabulary outputs only

Aggregate responses carry counts (integers) + labels
(closed string-literal union) + ISO timestamps + canonical
honest_note copy. **NEVER raw entity content, NEVER per-entity
attribution, NEVER freeform AI-generated commentary,
NEVER numeric scores beyond integer counts.** Mirrors
ADR-0058 §7 drift-signal projection + ADR-0059 §3.e Hive
projection patterns verbatim.

#### 1.b — Same-org scope mandatory at v1

Every analytics aggregate MUST resolve a single `org_entity_id`
from the caller's session (via `getOrgEntityId`) + scope
ALL underlying queries to members of that org via
`EntityMembership.is_active = true` + `parent_id = :orgEntityId`.
Cross-org reads are forbidden at v1 per CAR Sub-box 8
forward-substrate boundary + RULE 0 three-wallet sovereignty.

#### 1.c — Minimum-population threshold REQUIRED

Every aggregate MUST enforce `member_count >= k` (default
**k=5** per HIPAA Safe Harbor 45 CFR §164.514(b)(1)
regulatory precedent) before returning numeric values.
When `member_count < k`, the aggregate returns the SAFE
"redacted" projection (population-too-small marker; no
numeric values surface). This is a hard-coded constraint at
the service-tier projection layer; future operator-tunable
per-org override via an OrgSettings field is forward-
substrate (and would require a separate Founder authorization
to override the regulatory default downward).

#### 1.d — Cross-org aggregation explicit non-goal at v1

Cross-org analytics (NIOV-tier benchmarking; industry
consortium intelligence; multi-tenant comparison surfaces)
require:
- CAR Sub-box 8 cross-tenant compliance controls
  (forward-substrate; not designed at this register).
- Per-org consent + opt-in semantics (Founder product
  decision per ADR-0052 doctrine).
- Differential-privacy or stronger guarantees beyond
  k-anonymity (forward-substrate research arc).

ADR-0061 forbids cross-org analytics surfaces at v1.
Forward-substrate per CAR Sub-box 8 + a separate Founder
authorization at its slice.

#### 1.e — Derived-only from existing operational signals

v1 analytics MUST be derived from **existing**
permissioned operational signals — Feedback Loops 1–7,
`queryAuditEvents`, `MemoryCapsule` metadata,
`EntityMembership`, `EntityComplianceProfile`, hive
aggregates. No NEW operational signal is added at v1; no
new schema model; no new audit literal; no new ML pipeline.
This constraint keeps the analytics-tier substrate-safe
relative to the existing audit chain.

#### 1.f — Audit emission via existing literal pattern

Every analytics read emits an `ADMIN_ACTION` audit row with
`details.action = "ANALYTICS_READ"` + the aggregate name
(closed-vocab string) + the resolved `org_entity_id` +
boolean `redacted` flag (true when population threshold
not met). NO new audit literal — rides the existing
`ADMIN_ACTION + details.action` discriminator pattern per
Section 7 + Section 4 Wave 2/4/5/7 + Section 1 Wave 3B
precedent.

#### 1.g — TAR capability gate at admin tier

Analytics routes are admin-tier surfaces and MUST be gated
by `requireAdminCapability(authService, "can_admin_org")`
mirroring the Section 4 connector admin routes pattern at
`apps/api/src/routes/connector.routes.ts`. Members without
`can_admin_org` receive 403 `OPERATION_NOT_PERMITTED`.
No new TAR capability needed; existing `can_admin_org`
suffices for v1.

### 2. v1 explicit non-goals

Each is forward-substrate behind separate Founder
authorization at its specific slice:

- **Specific analytics aggregates** — v1 names ZERO
  concrete aggregates. Each aggregate (correction velocity
  / action-runtime health / connector activity / hive
  participation / compliance posture / monetization demand
  / etc.) is a Wave 2+ slice that selects ONE aggregate to
  ship, picks the threshold-override posture (if any), and
  requires Founder confirmation that the aggregate is the
  right v1 surface.
- **Operator-tunable population threshold** — v1 hard-codes
  k=5. Per-org override via OrgSettings field is forward-
  substrate (lowering the threshold below k=5 is a privacy-
  weakening change requiring separate Founder authorization).
- **Cross-org analytics** — explicit non-goal per §1.d.
- **Differential-privacy guarantees** — k-anonymity at v1;
  stronger guarantees forward-substrate.
- **AI-generated executive summary projections per ADR-0052
  doctrine** — Founder product decision territory (same
  constraint as Section 9 backend contracts); forward-
  substrate.
- **Analytics Control Tower UX** — frontend; lives in
  `otzar-control-tower`.
- **Persistent analytics projections** (cached aggregate
  rows / dashboards-data tables) — v1 is live-query only;
  caching is forward-substrate "measure first" per ADR-0016.
- **Real-time / streaming analytics** — v1 is request-
  response only; streaming forward-substrate via Phoenix.PubSub
  (ADR-0039 entry #28).
- **Compliance-framework-specific aggregates** (HIPAA /
  GDPR / SOC 2 specific projections) — forward-substrate
  per a future compliance ADR.

### 3. Behavior the service tier MUST enforce when Wave 2 implements its first aggregate

These are substrate-derivable from §1 above + existing ADR
precedent and lock the Wave 2+ implementation contract for
ANY analytics aggregate:

- Bearer + `read` scope + `requireAdminCapability("can_admin_org")`.
- Caller's org resolved via `getOrgEntityId(callerId)`;
  missing org → 404 `NO_ORG_FOR_CALLER`.
- Population resolved via `EntityMembership` count with
  `parent_id = orgId + is_active = true`.
- `member_count >= 5` check BEFORE any aggregate computation
  exposing numeric values; below threshold → SAFE redacted
  response.
- Underlying queries scoped to the org's member wallet set
  ONLY; no cross-org joins.
- Response shape closed (one TypeScript interface per
  aggregate; no Prisma row leak; no raw payload).
- `ADMIN_ACTION + details.action = "ANALYTICS_READ"` audit
  emission carries: aggregate name + org_entity_id +
  redacted boolean + result_count + filter_keys array.
  Audit details NEVER carry raw values being aggregated.

### 4. NO schema migration at v1

The v1 substrate is pure derived read-only. No Prisma model,
no column, no enum, no index added at this phase. Wave 2+
implementations consuming existing tables (MemoryCapsule,
EntityMembership, AuditEvent, MonetizationSuggestion, etc.)
require zero schema work.

### 5. NO new audit literal at v1

Per §1.f — existing `ADMIN_ACTION + details.action =
"ANALYTICS_READ"` pattern suffices.

### 6. NO new RULE or RULE 14 back-citation cascade

ADR-0061 cites RULE 0 + RULE 4 + RULE 13 + RULE 14 +
RULE 20 + ADR-0037 + ADR-0049 + ADR-0052 + ADR-0058 + ADR-0059
+ ADR-0060 (precedent quartet) by reference. RULE 14
back-citations land in same commit at ADR-0058 +
ADR-0059 + ADR-0060 (forward-substrate analytics consumer
of those patterns) when each next analytics aggregate ships.

### 7. Wave 1 deliverable (this ADR)

This commit lands:

- NEW `docs/architecture/decisions/0061-section-6-enterprise-analytics-v1-design.md`
  (this file).
- ADR catalog entry in `docs/architecture/README.md`.
- Substrate-honest update in
  `docs/current-build-state/06-enterprise-analytics.md`
  reflecting Wave 1 ADR LANDED + Section 3 prerequisite
  satisfied + Wave 2 implementation gating.
- Master + baton refresh.

**NO code. NO schema migration. NO new routes. NO new audit
literal. NO new RULE landings. Wave 1 is pure design per
Founder Sleep Directive Section 6 scope.**

### 8. Wave 2 implementation gating — Founder Authorization checkpoints

Each Wave 2+ analytics aggregate slice requires the Founder
to confirm at the slice's authorization prompt:

1. **Aggregate selection** — WHICH operational signal to
   aggregate first (the substrate-derivable candidates
   include: org-wide correction velocity over N days;
   action-runtime success/failure rates; connector
   binding activity counts; org member count over time;
   hive participation rates; etc.). v1 picks ZERO; Wave 2
   picks ONE.
2. **Threshold posture** — Confirm k=5 default holds for
   the chosen aggregate, OR raise it (k=10 / k=20) for
   sensitivity-tier aggregates.
3. **Audit detail content** — Confirm `details.action =
   "ANALYTICS_READ"` is the right discriminator (vs e.g.
   `"ANALYTICS_QUERY"`), and confirm the set of
   fields surfaced in audit details (aggregate name +
   redacted + result_count is the proposed minimum).
4. **Cache posture** — Confirm v1 ships live-query only
   (no caching) per "measure first" — OR authorize
   caching at the slice if a specific performance need
   is established.
5. **Route prefix** — `/api/v1/analytics/*` vs
   `/api/v1/org/analytics/*` vs other; mirrors the
   ADR-0060 §7 checkpoint #3 pattern.

Each checkpoint is a small product decision suitable for
inline Founder confirmation at the slice prompt. None of
them are blocked on a multi-session product workshop.

## Consequences

### Easier after Wave 1

- Section 6 substrate has an authoritative scope canonical
  for the first time; future implementation slices
  reference this ADR rather than guessing.
- The minimum-population threshold k≥5 + HIPAA Safe Harbor
  precedent citation provides a defensible baseline for
  every future aggregate; the choice was made once and held
  thereafter (raising to k=10/20 per aggregate sensitivity
  is the only future variation).
- The "derived-only from existing operational signals"
  constraint at §1.e prevents v1 from accidentally pulling
  Section 6 into building new ML pipelines or new schema
  models. Section 6 is consume-side only at v1.
- The SAFE projection pattern is now consistent across
  Section 1 drift signals (ADR-0058) + Section 3 hive
  aggregate (ADR-0059) + Section 5 playground (ADR-0060) +
  Section 6 analytics (ADR-0061) — a four-fold precedent
  for any future surface.

### Harder after Wave 1

- Operators who expect a specific analytics dashboard at
  v1 get explicit "forward-substrate" disclosure — Wave 2
  selects the first aggregate; Wave 3 ships the next; etc.
  Each is a separate Founder authorization.
- Raising the population threshold above k=5 per aggregate
  sensitivity becomes a Wave-by-Wave decision (vs a single
  global toggle); this is by design (privacy posture is
  contextual).
- Adding cross-org analytics (NIOV-tier benchmarking) is
  explicit forward-substrate per §1.d + §2 + CAR Sub-box 8
  — no inadvertent slide into cross-tenant fusion.

### Substrate-state catches resolved

- The Section 6 doc's "follows hive intelligence (Section
  3)" sequencing premise is now resolved: Section 3 Wave 1
  ADR-0059 LANDED → Section 6 Wave 1 ADR-0061 unblocked.
- The Section 6 doc's `minimum-population thresholds`
  abstract requirement now has a concrete v1 default (k=5,
  HIPAA-cited) at the ADR register.
- The Section 6 doc's `Aggregates MUST be projected through
  the same safe-view / no-leak discipline as the rest of
  the substrate` claim is now operationalized via the
  ADR-0058/0059/0060/0061 four-precedent SAFE projection
  pattern.

## Forward queue

Wave 2+ analytics aggregate slices (each its own Founder
authorization):

- **Wave 2** — first concrete v1 aggregate. Strongest
  candidate per Phase 0 substrate analysis: **org-wide
  CORRECTION activity over 7d** (derives from existing
  CORRECTION capsules + EntityMembership; mirrors Section 1
  drift-signal pattern at org tier). Other Wave-2-eligible
  candidates: action-runtime success rate per org over 7d
  (consumes Section 2 `ActionAttempt` outcomes);
  connector-binding activity per org (consumes Section 4
  ADMIN_ACTION audit rows); hive participation rate per
  org (consumes Section 3 HiveMembership + buildHiveAggregate).
- **Wave 3+** — additional aggregates as operator demand
  surfaces.
- **Wave N** — operator-tunable population threshold per
  org (OrgSettings field; only relevant if k=5 default is
  too restrictive or too permissive for a specific
  customer; would land via a separate ADR amendment to
  ADR-0061 §1.c).
- **Wave M** — cross-org analytics per CAR Sub-box 8 +
  separate Founder product decision.
- **Wave N+M** — differential-privacy guarantees if a
  specific compliance framework requires it.
- **Control Tower analytics UX** — frontend; out of
  Foundation scope.

## Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline, the
following Section 6 analytics primitives bear patent
relevance:

- **Same-org scope mandatory** (§1.b) — directly implements
  US 12,517,919 + US 12,164,537 + US 12,399,904 patent
  claims on RULE 0 sovereignty and three-wallet isolation.
  Cross-org aggregation would weaken patent-evidence at
  this register; v1 forbids it.
- **Minimum-population threshold k≥5** (§1.c) — implements
  HIPAA Safe Harbor 45 CFR §164.514(b)(1) external
  regulatory precedent; not patent-evidence-bearing in
  itself but reinforces the sovereignty patent claim by
  preventing re-identification attacks on aggregate
  projections.
- **Derived-only from existing signals** (§1.e) — prevents
  Section 6 from introducing new analytics primitives
  that could weaken patent-evidence for the existing
  substrate; analytics consumes, never invents.

## Bidirectional citations

- Cites ADR-0037 (jurisdiction tagging; metadata isolation
  vs aggregation).
- Cites ADR-0049 (GOVSEC umbrella; CAR Sub-box 8 cross-org
  forward-substrate reference).
- Cites ADR-0052 (Domain General Intelligence doctrine;
  Founder product decision frame for specific aggregates).
- Cites ADR-0058 (Section 1 Wave 3 drift signal SAFE
  projection precedent).
- Cites ADR-0059 (Section 3 Hives v1 same-org aggregate
  precedent + sequencing prerequisite satisfied).
- Cites ADR-0060 (Section 5 Agent Playground v1 read-only
  precedent).
- Cites RULE 0, RULE 4, RULE 13, RULE 14, RULE 19, RULE 20.
- External regulatory citation: HIPAA Safe Harbor
  45 CFR §164.514(b)(1) (k≥5 de-identification standard).
- External literature citation: Samarati & Sweeney 1998
  k-anonymity foundational paper.
- Cited from ADR-0070 §6.6 (Regulator-Ready Foundation
  Doctrine — Examination-Ready Evidence Flows; doctrine-
  ADR landed 2026-05-31). ADR-0070 cites this ADR's SAFE
  projection pattern + k≥5 HIPAA Safe Harbor floor + no-
  legal-advice posture as the canonical compliance-
  analytics lens. Future regulator-ready analytics
  extensions (examination-readiness indicators, evidence
  completeness, stale disclosures, unresolved exceptions)
  MUST land as Wave 2+ slices under ADR-0061's 5 Founder
  authorization checkpoints + ADR-0070's regulator-ready
  doctrine. ADR-0070 does NOT modify or supersede ADR-0061.
- Founder authorization explicit at
  `[FOUNDER-SLEEP-DIRECTIVE-SECTION-6-ANALYTICS-V1-ADR-AUTH]`
  per Founder Sleep Directive 2026-05-30.
