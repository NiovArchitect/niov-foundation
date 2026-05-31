# Section 6 — Enterprise Analytics

> Detailed canonical record for production Section 6. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Governed analytics surface — aggregate insights derived from
permissioned operational signals + audit chain. Per ADR-0052
doctrine: reports are summary projections, NEVER raw unpermitted
data; admins get same-org summary signals without crossing the
per-entity RULE 0 boundary. SAFE projection (closed-vocab
labels + integer counts + derived rates) with k=5
HIPAA-Safe-Harbor minimum-population floor enforced at every
aggregate.

## Current status — PRODUCTION-GRADE COMPLETE for Foundation backend scope (v1) + Wave 6 extension LIVE

**Final closeout 2026-05-30 (v1) + Wave 6 LIVE 2026-05-30.**
Section 6 Enterprise Analytics backend substrate is
production-grade complete after the 4-aggregate v1 arc closure
(Waves 2+3+4+5) PLUS a 5th aggregate landed in the same
session under ADR-0061 §8 forward queue ("Wave 3+ additional
aggregates as operator demand surfaces"): **Wave 6 per-
ActionType action-runtime health** (PR #117 / `2c4336a`).

**Important scope wording**: this closes the **Foundation
backend analytics substrate** for v1 same-org admin reads. It
does NOT mean all future analytics product work is complete.
Future capabilities (Control Tower frontend, persistent
caches, real-time streams, additional aggregates, cross-org
benchmarking, differential privacy, AI-generated executive
summaries) continue as forward-substrate per ADR-0061 §2 +
§Forward queue.

### Closeout summary

- **5 live aggregates** (v1 4 + Wave 6 extension) + **5 admin
  routes** + **1 `AnalyticsService`** + **71 integration tests**
  across 5 test files (v1 55 + Wave 6 16).
- **Universal invariants**: bearer + `can_admin_org` via
  `requireAdminCapability`; same-org via `getOrgEntityId` +
  local `resolveOrgOrFail` (404 `NO_ORG_FOR_CALLER`); k=5
  HIPAA Safe Harbor floor (frozen anchor
  `ANALYTICS_MIN_POPULATION = 5`); `ADMIN_ACTION +
  details.action = "ANALYTICS_READ"` audit (no new audit
  literal); SAFE projection enforced by type construction +
  wire-level secret-marker tests.
- **Zero schema migration. Zero new audit literals. Zero new
  external dependencies.** TypeScript baseline preserved at
  exactly 4 canonical residuals throughout.

## What is live

### 5 live aggregates (v1 4 + Wave 6 extension)

| # | Aggregate | Route | Signal labels |
|---|---|---|---|
| 1 | `CORRECTION_VELOCITY_7D` | `POST /api/v1/analytics/correction-velocity` | `ELEVATED` / `TYPICAL` / `QUIET` / `INSUFFICIENT_POPULATION` |
| 2 | `ACTION_RUNTIME_SUCCESS_RATE` (org-wide) | `POST /api/v1/analytics/action-runtime-success-rate` | `HEALTHY` / `DEGRADED` / `UNHEALTHY` / `INSUFFICIENT_VOLUME` / `INSUFFICIENT_POPULATION` |
| 3 | `CONNECTOR_ACTIVITY` | `POST /api/v1/analytics/connector-activity` | `ACTIVE` / `CONFIGURED_INACTIVE` / `NOT_CONFIGURED` / `INSUFFICIENT_POPULATION` |
| 4 | `HIVE_PARTICIPATION` | `POST /api/v1/analytics/hive-participation` | `BROAD_PARTICIPATION` / `MODERATE_PARTICIPATION` / `NARROW_PARTICIPATION` / `NO_HIVES` / `INSUFFICIENT_POPULATION` |
| 5 | `ACTION_RUNTIME_BY_ACTION_TYPE` (Wave 6; per-ActionType breakdown) | `POST /api/v1/analytics/action-runtime-by-action-type` | envelope: `OK_BY_ROW` / `INSUFFICIENT_POPULATION`; per-row: `HEALTHY` / `DEGRADED` / `UNHEALTHY` / `INSUFFICIENT_VOLUME` |

Each route accepts optional `{ window_days?: number = 7 }`
body clamped to `[1, 30]` (except hive-participation which is
a current-state snapshot with no window).

### Service substrate

`apps/api/src/services/analytics/analytics.service.ts`:

- `AnalyticsService` class with 4 methods (one per aggregate).
- Frozen anchors: `ANALYTICS_MIN_POPULATION = 5`,
  `ANALYTICS_WINDOW_DAYS_DEFAULT = 7`,
  `ANALYTICS_WINDOW_DAYS_MIN = 1`,
  `ANALYTICS_WINDOW_DAYS_MAX = 30`,
  `ACTION_RUNTIME_MIN_VOLUME = 10`.
- Closed-vocab signal-label arrays per aggregate
  (`CORRECTION_VELOCITY_LABELS`,
  `ACTION_RUNTIME_SUCCESS_LABELS`,
  `CONNECTOR_ACTIVITY_LABELS`, `HIVE_PARTICIPATION_LABELS`).
- SAFE projection envelopes (4 typed interfaces; forbidden
  fields enforced by type construction).
- Centralized `emitAnalyticsReadAudit` helper writes
  `ADMIN_ACTION + details.action = "ANALYTICS_READ"` with
  safe details (aggregate name + org_entity_id + redacted
  flag + result_count + filter_keys); NEVER raw aggregated
  values.
- Honest-note copy on every aggregate explicitly disclaims
  "employee score" / "performance index" / "manager
  dashboard" / "worker performance index" framing.

### Routes substrate

`apps/api/src/routes/analytics.routes.ts`:

- `registerAnalyticsRoutes(app, authService, analytics)`.
- All 4 routes `preHandler: requireAdminCapability(authService,
  "can_admin_org")`.
- Local `resolveOrgOrFail` helper (canonical pattern mirrored
  from `connector.routes.ts` + `hive-admin.routes.ts`).
- `statusFor` mapping: `INVALID_REQUEST → 422`;
  `INTERNAL_ERROR → 500`. Auth failures handled by middleware
  (401 / 403).

### Server wiring + barrel exports

`apps/api/src/server.ts` instantiates `new AnalyticsService()`
(no constructor deps) and registers `registerAnalyticsRoutes`
adjacent to existing admin route registrations.
`apps/api/src/index.ts` exports `AnalyticsService` + 5
constants + 4 closed-vocab label arrays + 9 type re-exports.

### Wave 6 — per-ActionType action-runtime health (PR #117; `2c4336a`)

Extends the Wave 3 org-wide success-rate aggregate with a
per-ActionType breakdown. Same auth (`can_admin_org`) + same-org
(`resolveOrgOrFail`) + k=5 envelope-tier gate +
`ACTION_RUNTIME_MIN_VOLUME=10` per-row gate + ADMIN_ACTION:
ANALYTICS_READ audit (no new literal) contract as Wave 3.

- Route: `POST /api/v1/analytics/action-runtime-by-action-type`
  with body `{ window_days?: number }` (clamped 1..30; default 7).
- Service: `getActionRuntimeByActionTypeForOrg` reads org Actions
  (SELECT only `action_id` + `action_type` — never payload) +
  attempts in window (SELECT only `outcome` + `action_id`) +
  groups by ActionType in-process + per-row redaction at
  `attempt_count < 10` (INSUFFICIENT_VOLUME label + nulled
  counts + rate) + per-row label by Wave 3 thresholds + rows
  ordered by action_type ASC for deterministic projection.
- Response envelope: `signal_label` = `OK_BY_ROW` |
  `INSUFFICIENT_POPULATION`; `rows[]` per-ActionType breakdown
  (empty array when envelope-tier gate redacts).
- 16 integration tests at
  `tests/integration/analytics-wave-6-action-runtime-by-action-type.test.ts`:
  auth (2); k=5 envelope gate (1); per-row aggregation incl.
  HEALTHY / DEGRADED / UNHEALTHY / per-row INSUFFICIENT_VOLUME
  / zero-state / deterministic ordering (5); same-org isolation
  (1); window_days validation (3); 15-marker no-leak scan (1);
  audit emission (3) verifying ANALYTICS_READ + aggregate
  discriminator + safe details only (no per-row counts in
  audit) + redacted audit on k=5 failure + no new audit
  literal.

**This is aggregate runtime health by ActionType — NOT
employee scoring, NOT manager surveillance, NOT individual
actor performance, NOT a worker dashboard.** Per-row signal
labels are operational only (per `honest_note` copy).

## What is NOT live (forward-substrate per ADR-0061 §2 + §Forward queue)

Each forward-substrate behind separate Founder authorization:

- **Operator-tunable population threshold** (per-org override
  of k=5; lowering k requires ADR-0061 §1.c amendment).
- **Cross-org analytics** (NIOV-tier benchmarking + industry
  consortium intelligence + multi-tenant comparison surfaces;
  CAR Sub-box 8 forward-substrate).
- **Differential-privacy guarantees** (beyond k-anonymity).
- **AI-generated executive summary projections** per ADR-0052
  doctrine (Founder product decision).
- **Analytics Control Tower UX** (frontend; lives in
  `otzar-control-tower`).
- **Persistent analytics projections** (cached aggregate rows
  / dashboard data tables; "measure first" per ADR-0016).
- **Real-time / streaming analytics** (forward-substrate via
  Phoenix.PubSub per ADR-0039 entry #28).
- **Compliance-framework-specific aggregates** (HIPAA / GDPR
  / SOC 2 specific projections; per future compliance ADR).
- **Additional aggregates** beyond the 4 LIVE — each is its
  own Wave + 5-checkpoint Founder authorization per ADR-0061
  §8.

## RULE 13 disclosures specific to Section 6

- The 4 live aggregates are derived-only from existing
  operational signals (MemoryCapsule + Wallet +
  EntityMembership + Action + ActionAttempt + ConnectorBinding
  + Hive + HiveMembership). No new operational signal added.
- The hive-participation aggregate consumes Section 3 Hives
  substrate (production-grade complete for v1 same-org
  Foundation backend scope per PR #99).
- The action-runtime-success-rate aggregate consumes Section
  2 Action runtime substrate (production-grade complete for
  internal Foundation autonomous-execution-substrate scope).
- The connector-activity aggregate consumes Section 4
  connector substrate (production-grade complete for
  Foundation backend scope).
- The correction-velocity aggregate consumes the existing
  CORRECTION CapsuleType written by `otzar.service.ts` +
  `observation.service.ts`.
- All 4 aggregates respect the same-org sovereignty boundary;
  cross-org reads are forbidden by construction at every
  query.

## Landed work

| Commit | PR | Description |
|---|---|---|
| `2c0230d` | #87 | Section 6 Wave 1 — ADR-0061 SAFE projection pattern (design-only) |
| `2d95597` | #103 | Section 6 Wave 2 — CORRECTION velocity 7d aggregate |
| `c8362cd` | #104 | Section 6 Wave 3 — action-runtime success rate aggregate |
| `f629e23` | #105 | Section 6 Wave 4 — connector-activity aggregate |
| `a3d484c` | #106 | Section 6 Wave 5 — hive-participation aggregate |
| `2aa203a` | #107 | Section 6 final v1 closeout docs |
| `2c4336a` | #117 | Section 6 Wave 6 — per-ActionType action-runtime health aggregate (16 tests) |
| (this commit) | TBD | Section 6 Wave 6 closeout docs |

## Foundation-context coherence (per Founder strategic guardrails)

Section 6 design preserved Foundation strategic context:

- **Generic Entity model preserved**: all 4 aggregates
  consume `EntityMembership` / `Action.org_entity_id` /
  `Hive.org_entity_id` / `ConnectorBinding.org_entity_id` /
  `Wallet.entity_id` — none assume PERSON-only entity
  semantics; AI_AGENT / DEVICE / APPLICATION / COMPANY
  entities aggregate identically.
- **No blockchain / payment / GATS surface**: no payment
  rail dependency; no settlement; no chain anchor; no
  spending capability.
- **Same-org sovereignty preserved**: cross-org reads
  forbidden by construction at every aggregate.
- **No surveillance framing**: honest-note copy at every
  aggregate explicitly disclaims employee scoring / manager
  dashboard / performance index / worker performance index.
- **k=5 floor**: aligned with future privacy-stronger
  guarantees (differential privacy forward-substrate)
  without blocking them.

## Next slices (forward-substrate)

Each forward-substrate slice requires separate Founder
authorization at its slice prompt:

1. **Additional aggregates** — each new aggregate is its own
   Wave + 5-checkpoint Founder authorization per ADR-0061 §8.
2. **Persistent analytics projections** — cached aggregate
   rows for dashboards (measure-first per ADR-0016).
3. **Operator-tunable per-org population threshold** —
   requires ADR-0061 §1.c amendment.
4. **Cross-org analytics** — requires CAR Sub-box 8
   substrate + Founder product decision per ADR-0052.
5. **Differential-privacy guarantees** — beyond k-anonymity.
6. **AI-generated executive summary projections** — Founder
   product decision per ADR-0052 doctrine.
7. **Analytics Control Tower UX** — frontend; lives in
   `otzar-control-tower` repo.

## Risks / forward-substrate

- The 4 live aggregates assume k=5 default is the right
  floor for the v1 customer surface. Per-org override
  requires ADR-0061 §1.c amendment + Founder authorization.
- Real-time / streaming analytics is forward-substrate per
  ADR-0061 §2. Live-query only at v1 is fine for current
  call volumes; "measure first" caching per ADR-0016.
- Foundation strategic guardrails preserved at v1; future
  aggregates that touch payment / GATS / chain-anchored
  signals require explicit Foundation-strategic-context
  review at the slice prompt.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
