# Section 5 — Agent Playground

> Detailed canonical record for production Section 5. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

**Agent Playground is the enterprise simulation and
decision-testing environment where Otzar's AI teammates can
explore possible strategies, compare outcomes, and recommend
the best governed path before real execution.**

Long-term product vision: a Domain General Intelligence
surface where the organization's AI agents / AI teammates
run different enterprise scenarios before real
implementation. Helps the organization test possible
decisions, compare outcomes, understand what works and what
does not, and recommend the best governed path forward with
evidence and reasoning. Multi-agent scenario exploration;
enterprise decision simulation; comparison of alternative
plans; estimation of likely outcomes, risks, tradeoffs,
dependencies, blockers, cost, timing, policy constraints,
and execution impact; identification of what works / what
does not before real-world implementation; production of
best-path recommendations with reasons and evidence; routing
of selected recommendations into the governed Action runtime
ONLY after approvals/policy checks. Humans in the loop;
auditability + no-leak boundaries + scoped permissions +
enterprise governance preserved at every tier. Analogous to
how DeepMind-style systems can explore many strategies in a
simulated environment before selecting stronger moves —
adapted for the governed enterprise domain.

**Important framing**: Wave 2 below is the safe **first
backend substrate / inspector foundation** for that
long-term vision — NOT the full Agent Playground product.
Wave 2 ships 3 read-only sandbox-only inspectors that
preview Otzar's governed decision-making against synthetic
inputs without persistence/audit/side-effect. Future
Agent Playground waves (multi-agent simulation engine,
scenario memory, outcome comparison, best-path recommender,
governed transition from simulation to action) are
forward-substrate behind separate Founder authorization at
each slice. Wave 2 is built to be **compatible with** the
long-term vision (the inspector primitives — policy
evaluator + connector dry-run + working-set assembly — are
exactly the building blocks future scenario-simulation
substrate will compose), NOT a replacement for it.

## Current status (LIVE end-to-end for the v1 enterprise cockpit scope — Waves 1+2+3+4+5+6+7+8+9 LIVE in Foundation; Wave 10 consumer-experience contract ADR-0077 design-only LANDED + Wave 10 implementation LIVE in otzar-control-tower at /agent-playground)

**Wave 1 ADR LANDED at ADR-0060** (2026-05-30). v1 inspector
scope locked: read-only sandbox-only self-scoped operator
inspector surface.

**Wave 2 implementation LANDED 2026-05-30 (PR #100)** —
3 inspector contracts live behind 3 POST routes; all
sandbox-only; all self-scoped; all read-only.

**Wave 3 ADR-0065 LANDED 2026-05-30** — long-term Agent
Playground product-vision ADR sitting ABOVE ADR-0060 at the
product-vision tier; canonical 10-wave forward map; 13-input
canonical set; 10-output canonical set; human-in-the-loop
doctrine; universal safety / no-leak doctrine.

**Wave 4 implementation LANDED 2026-05-30 (PR #111;
commit `a2988ee`)** — `PlaygroundScenario` Prisma model +
5 owner-first CRUD routes + `PlaygroundScenarioService` +
38 integration tests. The first **persistent** Agent
Playground substrate — SAFE persistence layer for the
future candidate-generation (Wave 5), outcome-comparison
(Wave 6), best-path-recommender (Wave 7), and
governed-transition (Wave 8) substrate. Wave 4 itself
implements NO execution / LLM / multi-agent / external
provider calls / Action creation / connector invocation /
MemoryCapsule creation / OtzarConversation creation / live
side effects. ADMIN_ACTION + details.action discriminator
audit on persistence boundaries (CREATED / UPDATED /
ARCHIVED); ZERO new audit literal. Schema migration via
`npm run db:push:test` per ADR-0025.

**Wave 5 contract ADR-0072 LANDED 2026-05-31 (PR #134;
commit `11b80cb`)** — design-only contract closing
ADR-0065 §7 Wave 5 forward-queue line at the contract
register; 20 sub-decisions locking candidate shape + 4
closed vocabularies + 12-input allowed source set +
forbidden inputs + bounded counts + universal safety /
no-leak doctrine + legal-advice posture inherited verbatim
from ADR-0070 §9 + human-in-the-loop doctrine + three-
method comparison (Option A deterministic / template-first
TypeScript = v1; Option B Python requires ADR-0069 §2.4
boundary ADR first; Option C BEAM folds into Wave 9).

**Wave 5 Option A implementation LANDED 2026-05-31
(PR #136; commit `e708fa7`)** — deterministic / template-
first TypeScript candidate-generation surface. NEW
`PlaygroundCandidateService` at
`apps/api/src/services/playground/playground-candidate.service.ts`
+ NEW route `POST /api/v1/playground/scenarios/:id/candidates`
+ 33 integration tests. Computed-on-read; NO persistence;
NO new Prisma model; NO schema migration; NO new audit
literal; NO LLM / model calls; NO Python; NO BEAM; NO
Action creation; NO connector invocation; NO external
provider call; NO Control Tower frontend; NO outcome
comparison / scoring / best-path recommendation /
governed transition / multi-agent runtime at this slice.
Owner-first + same-org SCENARIO_NOT_FOUND gate delegated
verbatim to `PlaygroundScenarioService.getScenario` so
the canonical Wave 4 enumeration-safe 404 path is reused.
`ADMIN_ACTION + details.action = "PLAYGROUND_CANDIDATES_GENERATED"`
audit with safe metadata only (NEVER raw candidate text;
NEVER raw scenario JSON). Closed-vocab template library
covers all 9 ADR-0072 §2 candidate types. Default set
emits 5 types (STATUS_QUO + LOW_RISK_INCREMENTAL +
COMPLIANCE_FIRST + OPERATIONAL_RESILIENCE +
HUMAN_REVIEW_REQUIRED) + DO_NOT_PROCEED when scenario is
ARCHIVED. The 3 framing-loaded types (SPEED_OPTIMIZED /
COST_OPTIMIZED / CUSTOMER_IMPACT_FIRST) are opt-in via
explicit `candidate_types` filter only. Every candidate
carries the mandatory ADR-0072 §11 `honest_note`.
Deterministic SHA-256 16-char `candidate_key` per
ADR-0068 precedent. Bounded count per ADR-0072 §18
(`CANDIDATES_PER_CALL_MAX = 8`). Python (Option B) and
BEAM (Option C) remain forward-substrate per ADR-0072
§Forward queue + ADR-0069.

**Wave 6 contract ADR-0073 LANDED 2026-05-31 (PR #138;
commit `1c85985`)** — design-only contract closing
ADR-0065 §7 Wave 6 forward-queue line at the contract
register; sits ABOVE ADR-0072 and BELOW ADR-0065 at the
contract tier; 22 sub-decisions locking
`ComparisonResponse` shape + `ComparisonMatrixItem` 13
fields + 5 closed vocabularies (outcome_dimensions 12 +
dimension_rating 5 + risk_findings 10 +
dependency_findings 10 + required_reviews 9) +
comparison_mode 2 + comparison_notes 12 + canonical "Wave
6 calls Wave 5 internally" decision + bounded counts +
ADR-0070 §9 legal-advice posture inherited verbatim +
human-in-the-loop doctrine + three-method comparison
(Option A deterministic TypeScript = v1; Option B Python
requires ADR-0069 §2.4 boundary ADR; Option C BEAM folds
into Wave 9).

**Wave 6 Option A implementation LANDED 2026-05-31
(PR #139; commit `02410ee`)** — deterministic / template-
first TypeScript outcome-comparison surface. NEW
`PlaygroundOutcomeComparisonService` at
`apps/api/src/services/playground/playground-outcome-comparison.service.ts`
+ NEW route
`POST /api/v1/playground/scenarios/:id/outcome-comparisons`
+ 39 integration tests. Computed-on-read; internally
invokes `PlaygroundCandidateService.generateCandidates`
per ADR-0073 §10 (NEVER accepts caller-supplied candidate
payloads); v1 body accepts `candidate_types?[]` +
`max_candidates?` + `comparison_mode?` only — NO
`candidate_keys[]` per Founder QLOCK 2. NO persistence;
NO new Prisma model; NO schema migration; NO new audit
literal; NO LLM / model calls; NO Python; NO BEAM; NO
Action creation; NO connector invocation; NO external
provider call; NO Control Tower frontend; NO numeric
scoring; NO winner selection; NO best-path recommendation;
NO governed transition; NO multi-agent runtime; NO
outcome-comparison persistence at this slice. Owner-first
+ same-org SCENARIO_NOT_FOUND gate inherits via Wave 5 →
Wave 4 delegation. `ADMIN_ACTION + details.action =
"PLAYGROUND_OUTCOMES_COMPARED"` audit with safe metadata
only (scenario_id + candidate_count + comparison_mode +
blocked_candidates_count + review_required_count +
generated_from_candidate_keys_hash SHA-256 16-char;
NEVER raw comparison text; NEVER raw candidate text;
NEVER raw scenario JSON). DETERMINISTIC_RUBRIC mode maps
Wave 5 candidate fields → outcome dimension ratings +
risk_findings + dependency_findings + required_reviews
via closed-vocab rubric library. CANDIDATE_FIELD_PROJECTION
mode echoes Wave 5 closed-vocab fields verbatim with all
dimensions rated INSUFFICIENT_DATA (no inference). Every
matrix item + top-level response carries mandatory
ADR-0073 §16 `honest_note` ("does not select a winner").
TradeoffSummary is 4 closed-vocab `candidate_key` sets —
NEVER a ranking. Bounded counts per ADR-0073 §11
(`candidates_per_comparison_max = 8`). Python (Option B)
and BEAM (Option C) remain forward-substrate per ADR-0073
§Forward queue + ADR-0069.

**Wave 7 contract ADR-0074 LANDED 2026-05-31 (PR #141;
commit `8922f66`)** — design-only contract closing ADR-0065
§7 Wave 7 forward-queue line at the contract register;
sits ABOVE ADR-0073 (Wave 6 outcome-comparison contract)
and BELOW ADR-0065 (long-term product vision) at the
contract tier; 23 sub-decisions locking
`BestPathRecommendationResponse` shape (19 top-level
fields) + per-`AlternativeConsidered` 6-field shape +
deterministic 10-gate priority ladder + 11th deterministic
tie-breaker + 4 closed vocabularies (recommendation_reasons
11 + action_transition_readiness 8 + reason_not_recommended
10 + recommendation_mode 4) + canonical "Wave 7 calls Wave
6 internally" decision + bounded counts + ADR-0070 §9
legal-advice posture inherited verbatim + extended for
Wave 7 + mandatory `human_decision_required` boolean per
§16 + three-method comparison (Option A deterministic
TypeScript = v1; Option B Python requires ADR-0069 §2.4
boundary ADR; Option C BEAM folds into Wave 9) + §22
future-generalization strategic context (preserves
architecture for future trust-governed life decision
support WITHOUT authorizing personal-life automation).

**Wave 7 Option A implementation LANDED 2026-05-31 (PR
#142; commit `80a60f1`)** — deterministic / template-first
TypeScript best-path recommendation surface. NEW
`PlaygroundBestPathRecommendationService` at
`apps/api/src/services/playground/playground-best-path-recommendation.service.ts`
+ NEW route
`POST /api/v1/playground/scenarios/:id/best-path-recommendations`
+ 39 integration tests. Computed-on-read; internally
invokes `PlaygroundOutcomeComparisonService.compareOutcomes`
per ADR-0074 §10 (NEVER accepts caller-supplied comparison
or candidate payloads); v1 body accepts `candidate_types?[]`
+ `max_candidates?` + `comparison_mode?` +
`recommendation_mode?` only — NO `candidate_keys[]` per
Founder QLOCK 2 (inherits Wave 6 deferral). NO persistence
per Founder QLOCK 1; NO new Prisma model; NO schema
migration; NO new audit literal; NO LLM / model calls; NO
Python; NO BEAM; NO Action creation (Wave 8 forward-
substrate); NO connector invocation; NO external provider
call; NO Control Tower frontend; NO numeric scoring; NO
winner-declaration framing; NO best-path recommender
execution; NO governed transition; NO multi-agent runtime;
NO recommendation persistence at this slice. Owner-first +
same-org SCENARIO_NOT_FOUND gate inherits via Wave 6 → Wave
5 → Wave 4 delegation. `ADMIN_ACTION + details.action =
"PLAYGROUND_BEST_PATH_RECOMMENDED"` audit with safe
metadata only (scenario_id + recommendation_mode +
candidate_count + recommended_candidate_key +
recommended_candidate_type + blocked_by_policy +
human_decision_required + action_transition_readiness;
NEVER raw recommendation text; NEVER raw comparison text;
NEVER raw candidate text; NEVER raw scenario JSON). 4
recommendation modes LIVE: DETERMINISTIC_POLICY_FIRST
(default), DETERMINISTIC_GOVERNANCE_FIRST,
DETERMINISTIC_RESILIENCE_FIRST,
DETERMINISTIC_HUMAN_REVIEW_FIRST (short-circuits to
HUMAN_REVIEW_REQUIRED if present). Priority ladder is 10
closed-vocab gates + 11th deterministic tie-breaker by
candidate_key lexical ASC. Top-level response + each
matrix item carry mandatory ADR-0074 §16 `honest_note` +
`human_decision_required` boolean. `alternatives_considered`
surfaces N-1 non-recommended candidates with closed-vocab
`reason_not_recommended` per pair. Bounded counts per
ADR-0074 §11 (`candidates_considered_max = 8`). Python
(Option B) and BEAM (Option C) remain forward-substrate
per ADR-0074 §Forward queue + ADR-0069.

**RULE 13 substrate-honest disclosure**: Waves 2+4 together
constitute the **first backend substrate / inspector
foundation + persistence layer** for the long-term Agent
Playground product vision (see Purpose). They do NOT
constitute the full Agent Playground product. The 3 Wave 2
inspectors (policy-evaluator tester + connector dry-run +
working-set inspector) provide the substrate-level
primitives; Wave 4 provides the persistence layer for
named scenarios that future scenario-simulation waves will
hydrate, compare, and recommend against. The full
multi-agent enterprise simulation / candidate generation /
outcome-comparison / best-path recommender / governed
transition remains forward-substrate behind separate
Founder authorization at each slice per ADR-0065 §7
Waves 5-10.

## What is live

### Wave 4 — persistent named scenarios (PR #111; `a2988ee`)

**Prisma model** (`packages/database/prisma/schema.prisma`):

```
model PlaygroundScenario {
  scenario_id          String    @id @default(uuid()) @db.Uuid
  owner_entity_id      String    @db.Uuid
  org_entity_id        String?   @db.Uuid
  title                String
  description          String?
  goal_summary         String?
  status               String    @default("DRAFT")
  scenario_type        String    @default("MANUAL")
  input_refs           Json      @default("{}")
  constraints          Json      @default("{}")
  expected_outputs     Json      @default("{}")
  governance_findings  Json      @default("{}")
  created_at           DateTime  @default(now())
  updated_at           DateTime  @updatedAt
  archived_at          DateTime?

  @@index([org_entity_id, owner_entity_id, status])
  @@index([owner_entity_id, archived_at, created_at])
  @@map("playground_scenarios")
}
```

`status` ∈ `DRAFT | READY | ARCHIVED` (closed-vocab via
service-tier validation). `scenario_type` ∈ `MANUAL | FIXTURE
| FUTURE_GENERATED` (closed-vocab; `FUTURE_GENERATED`
reserved for Wave 5 candidate generation). String columns
chosen over Prisma enum per ADR-0065 §7 Wave 4 + Hive /
MemoryCapsule String + service-validation precedent (no
schema migration required when the closed-vocab set evolves).

**5 Wave 4 routes** (`apps/api/src/routes/playground.routes.ts`):

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/playground/scenarios` | POST | Create named scenario (201) |
| `/api/v1/playground/scenarios?status&limit&include_archived` | GET | List caller's scenarios (default excludes ARCHIVED) |
| `/api/v1/playground/scenarios/:id` | GET | Owner-only detail |
| `/api/v1/playground/scenarios/:id` | PUT | Owner-only update (forbidden-field rejection) |
| `/api/v1/playground/scenarios/:id` | DELETE | Owner-only soft-archive (status=ARCHIVED + archived_at; idempotent) |

**PlaygroundScenarioService** (`apps/api/src/services/playground/playground-scenario.service.ts`):

- 5 owner-first methods (`createScenario`, `listScenarios`,
  `getScenario`, `updateScenario`, `archiveScenario`).
- Bearer + `"read"` scope via `authService.validateSession`
  (mirrors Wave 2 inspector pattern).
- `owner_entity_id = session.entity_id` (RULE 0 self-scope).
- `org_entity_id` resolved at create-time via
  `getOrgEntityId()` with `NOT_IN_ANY_ORG` tolerated as null.
- Cross-owner / cross-org / unknown id all fold to
  `SCENARIO_NOT_FOUND` (enumeration-safe 404).
- Forbidden-field rejection on PUT (`owner_entity_id` /
  `org_entity_id` / `scenario_id` / `created_at` /
  `updated_at` / `archived_at`) → 422 INVALID_REQUEST with
  `invalid_fields` array.
- Soft-archive only per RULE 10 — DELETE sets
  `status="ARCHIVED" + archived_at = now`; row never
  hard-deleted. Idempotent on already-archived (returns
  `already_archived=true`; emits no new audit row, mirroring
  the dissolveHive idempotent precedent).
- 4 Json columns (`input_refs` / `constraints` /
  `expected_outputs` / `governance_findings`) — object-only
  inputs validated at the service tier (arrays / strings /
  numbers / booleans / null rejected); default `{}`.
- ZERO Action / ActionAttempt / Notification /
  OtzarConversation / MemoryCapsule / ConnectorBinding row
  ever created.

**Audit posture** (ADR-0065 §10):

- `ADMIN_ACTION` + `details.action` discriminator —
  `PLAYGROUND_SCENARIO_CREATED` / `PLAYGROUND_SCENARIO_UPDATED`
  / `PLAYGROUND_SCENARIO_ARCHIVED`.
- **ZERO new audit literal.**
- Safe details only: `action` + `scenario_id` +
  `owner_entity_id` + `org_entity_id` + `status` +
  `scenario_type`. **NO** `title` / `description` /
  `goal_summary` text. **NO** raw `input_refs` /
  `constraints` / `expected_outputs` / `governance_findings`
  Json payloads.
- ADR-0060 §2 audit non-goal preserved for the 3 Wave 2
  inspector routes; Wave 4 emits on the persistence boundary
  as ADR-0065 §10 explicitly approves.

**Sandbox-only guarantees verified by 38 integration tests**
(`tests/integration/playground-scenarios.test.ts`):

- Auth enforcement on all 5 routes.
- Create happy path + 4 validation failures + closed-vocab
  acceptance + title trim.
- List owner-scoped + ARCHIVED filter + include_archived +
  invalid status query.
- Detail owner-only + cross-owner 404 + unknown 404.
- Update owner-only + forbidden-field rejection (6 fields) +
  status-vocab + Json metadata verbatim.
- Archive soft-delete + RULE 10 persistence proof +
  idempotency + cross-owner 404.
- No-leak (15 forbidden marker substrings absent from
  create / list / detail wire responses).
- ZERO Action / ActionAttempt / Notification /
  OtzarConversation / MemoryCapsule / ConnectorBinding rows
  created across the full CRUD cycle.
- Audit emission (3 discriminators present + safe details
  only + no title/description text + no new audit literal).

`registerPlaygroundRoutes` signature extended to accept the
second `PlaygroundScenarioService` instance; `server.ts`
wiring updated.

### Wave 2 — 3 sandbox-only inspector routes (PR #100; `fd35c62`)

**3 v1 inspector routes** (`apps/api/src/routes/playground.routes.ts`):

| Route | Inspector | Delegate |
|---|---|---|
| `POST /api/v1/playground/policy-evaluator` | Policy-evaluator scenario tester | Pure `evaluateActionPolicy` |
| `POST /api/v1/playground/connector-dry-run` | Connector dry-run | `FixtureBasedConnectorProvider` ONLY |
| `POST /api/v1/playground/working-set` | Working-set inspector | `COEService.assembleContext` with SAFE projection |

**PlaygroundService** (`apps/api/src/services/playground/playground.service.ts`):

- Constructor takes AuthService + COEService + optional
  overrides bag (connectorProvider for test injection;
  evaluator for test injection). Default constructor
  instantiates its own FixtureBasedConnectorProvider —
  the production `getConnectorProvider` factory is **NEVER
  reachable** from playground code by construction.
- 3 inspector methods (`runPolicyEvaluator`,
  `runConnectorDryRun`, `runWorkingSetInspector`).
- 9 exported types for the test surface + future Control
  Tower frontend consumer.

**Wired at boot**: `apps/api/src/server.ts` instantiates
`new PlaygroundService(authService, coeService)` adjacent
to existing service construction and registers
`registerPlaygroundRoutes(app, playgroundService)`
adjacent to existing hive admin route registration.

**Auth posture**: bearer + `"read"` scope via
`authService.validateSession` per ADR-0060 §3. 401 without
bearer; 401 on session failures; 403 on
`OPERATION_NOT_PERMITTED`; 422 on body-shape violations;
500 catch-all.

**SAFE projections enforced**:

- Connector dry-run response wraps `ConnectorResult` + explicit
  `provider: "FixtureBasedConnectorProvider"` attribution so
  callers can prove (via response shape itself) the call went
  through fixtures not a real provider. `secret_ref` FORCED to
  null in the invocation; planted secrets in request body never
  appear in response.
- Working-set response strips raw `content` from each
  `ContextItem` — surfaces `capsule_id` + `capsule_type` +
  `topic_tags` only; wire-level no-leak asserts cover
  `governance_terms`, `storage_location`, `content_hash`,
  `secret_ref`, `bridge_id`, `payload_content`, `payload_summary`.

**Sandbox-only guarantees verified by 17 integration tests**:

- Zero Action / ActionAttempt / Notification /
  OtzarConversation / MemoryCapsule / ConnectorBinding rows
  created across any of the 3 inspectors.
- Zero new audit literal (no row with event_type containing
  "PLAYGROUND" or "INSPECTOR"); policy-evaluator +
  connector-dry-run paths emit zero audit rows; working-set
  delegates to COE which inherits its existing ADR-0048
  audit emissions (pre-existing literals — fine per ADR-0060
  §2).
- Zero schema migration; zero new external dependencies;
  zero new audit literals; TypeScript baseline preserved at
  4 canonical residuals.

## What is not live

Per ADR-0060 v1 non-goals + long-term Agent Playground
product vision (each forward-substrate behind separate
Founder authorization):

**v1 inspector tier (ADR-0060 v1 explicit non-goals)**:

- Agent playground UI surfaces (frontend; lives in
  `otzar-control-tower`).
- Persistent dry-run history (no Prisma model; every
  dry-run is ephemeral at v1).
- Real connector invocation in dry-run (v1 hard-wires
  `FixtureBasedConnectorProvider` only; production
  `getConnectorProvider` factory unreachable from
  playground code by construction).
- Real Action creation in dry-run (v1 policy tester is
  pure `evaluateActionPolicy` dispatch).
- Cross-entity scope (caller's own RULE 0 scope only).
- AI-generated test scenarios (Founder product decision;
  not in v1).
- Audit emission on playground reads (intentional v1
  non-goal per ADR-0060 §2 — pure-function / fixture /
  read-only substrate justifies zero side effects).

**Long-term Agent Playground product vision (forward-
substrate; future waves under separate Founder
authorization)**:

- Multi-agent scenario exploration engine.
- Enterprise decision simulation surface (synthetic
  scenarios; alternative plan generation).
- Outcome comparison + estimation of likely outcomes,
  risks, tradeoffs, dependencies, blockers, cost, timing,
  policy constraints, and execution impact.
- Best-path recommender with reasons and evidence.
- Governed transition from simulation to Action runtime
  (only after approvals/policy checks; never autonomous
  execution from playground).
- Persistent scenario memory.
- Domain General Intelligence orchestration inside the
  enterprise domain.
- Real autonomous execution from playground (explicitly
  forbidden at every wave — humans always in the loop).
- Organizational scoring / employee surveillance (explicitly
  forbidden per ADR-0052 doctrine + Founder direction).
- Live external tool calls / production provider calls
  (sandbox-only at every wave; real execution goes through
  Section 2 Action runtime with full governance).
- Unapproved action creation.

## RULE 13 disclosures specific to Section 5

- Playground actions MUST be marked as dry-run at the substrate
  tier — they MUST NOT write capsules, grant permissions, or
  hit real connectors. Any audit emission MUST distinguish
  dry-run from real with a clear marker (e.g. `dry_run = true`
  in details).
- Playground operators see governed working-set construction
  but only for entities they are authorized to read.

## Next slices (per ADR-0065 §7 Wave map)

1. ~~**Wave 2 — service-tier implementation**~~ — LANDED
   PR #100 2026-05-30.
2. ~~**Wave 3 — long-term product-vision ADR**~~ — LANDED
   2026-05-30 at ADR-0065 (new ADR sitting ABOVE
   ADR-0060 at product-vision tier).
3. ~~**Wave 4 — persistent named scenarios model + safe
   CRUD**~~ — LANDED PR #111 2026-05-30 (`a2988ee`).
   `PlaygroundScenario` Prisma model + 5 owner-first CRUD
   routes + `PlaygroundScenarioService` + 38 integration
   tests; ADMIN_ACTION + details.action discriminator
   audit; no new audit literal; soft-archive per RULE 10.
4. ~~**Wave 5 — scenario candidate generation contract**~~ —
   design-only ADR LANDED 2026-05-31 at ADR-0072; Option A
   deterministic / template-first TypeScript implementation
   LANDED 2026-05-31 (PR #136; `e708fa7`). NEW
   `PlaygroundCandidateService` + NEW route
   `POST /api/v1/playground/scenarios/:id/candidates` +
   33 integration tests. Computed-on-read; NO persistence;
   NO schema migration; NO new audit literal; NO LLM /
   Python / BEAM / Action creation / connector invocation;
   ADMIN_ACTION + details.action="PLAYGROUND_CANDIDATES_GENERATED"
   audit with safe metadata only. Option B (Python) and
   Option C (BEAM) remain forward-substrate behind
   separate Founder authorization per ADR-0072 §Forward
   queue.
5. **Wave 6 — outcome comparison + scoring rubric** —
   design-only ADR LANDED 2026-05-31 at ADR-0073. Closed-
   vocabulary comparison-matrix contract; computed-on-read;
   NO employee scoring; NO numeric ranking; NO winner
   selection (winner selection is Wave 7). 22 sub-decisions
   locking `ComparisonResponse` shape + `ComparisonMatrixItem`
   13 fields + 5 closed vocabularies (outcome_dimensions 12
   values + dimension_rating 5 values + risk_findings 10
   values + dependency_findings 10 values + required_reviews
   9 values) + comparison_mode (DETERMINISTIC_RUBRIC default
   at v1 + CANDIDATE_FIELD_PROJECTION opt-in) +
   comparison_notes 12 values + canonical "Wave 6 calls
   Wave 5 internally" decision + bounded counts + ADR-0070
   §9 legal-advice posture inherited verbatim + human-in-
   the-loop doctrine + three-method comparison (Option A
   deterministic TypeScript = v1; Option B Python requires
   ADR-0069 §2.4 boundary ADR; Option C BEAM folds into
   Wave 9). Wave 6 Option A deterministic / template-first
   TypeScript implementation LANDED 2026-05-31 (PR #139;
   `02410ee`): NEW `PlaygroundOutcomeComparisonService` +
   NEW route
   `POST /api/v1/playground/scenarios/:id/outcome-comparisons`
   + 39 integration tests. Computed-on-read; internally
   invokes Wave 5 candidate service; NO caller-supplied
   candidate payloads; NO candidate_keys[] in v1 per
   Founder QLOCK 2; NO persistence; NO schema migration;
   NO new audit literal; NO LLM / Python / BEAM / numeric
   scoring / winner selection / best-path recommendation /
   Action creation / connector invocation;
   `ADMIN_ACTION + details.action="PLAYGROUND_OUTCOMES_COMPARED"`
   audit with safe metadata only. Option B (Python) and
   Option C (BEAM) remain forward-substrate behind
   separate Founder authorization per ADR-0073 §Forward
   queue.
6. ~~**Wave 7 — best-path recommender with evidence and
   governance findings**~~ — design-only ADR LANDED
   2026-05-31 at ADR-0074; Option A deterministic /
   template-first TypeScript implementation LANDED
   2026-05-31 (PR #142; `80a60f1`). NEW
   `PlaygroundBestPathRecommendationService` + NEW route
   `POST /api/v1/playground/scenarios/:id/best-path-recommendations`
   + 39 integration tests. Computed-on-read; internally
   invokes Wave 6 outcome-comparison service; NO
   caller-supplied payloads; NO candidate_keys[] in v1 per
   Founder QLOCK 2; NO persistence per Founder QLOCK 1;
   NO schema migration; NO new audit literal; NO LLM /
   Python / BEAM / numeric scoring / winner-declaration /
   Action creation / connector invocation;
   `ADMIN_ACTION + details.action="PLAYGROUND_BEST_PATH_RECOMMENDED"`
   audit with safe metadata only. 4 recommendation modes
   live + 10-gate priority ladder + 11th deterministic
   tie-breaker. Option B (Python) and Option C (BEAM)
   remain forward-substrate.
7. ~~**Wave 8 — governed transition** from selected
   scenario to proposed Action plan~~ — design-only ADR
   LANDED 2026-05-31 at ADR-0075; Option A deterministic /
   template-first TypeScript implementation LANDED
   2026-05-31 (PR #145; `8a69863`). NEW
   `PlaygroundGovernedTransitionService` + NEW route
   `POST /api/v1/playground/scenarios/:id/governed-transitions`
   + 43 integration tests. Wave 8 is the FIRST Section 5
   wave that creates Section 2 Action rows via existing
   `createActionForCaller` in PROPOSED status per
   ADR-0057; Wave 8 NEVER executes; Section 2 retains all
   execution authority. CONSERVATIVE v1: ONLY
   SEND_INTERNAL_NOTIFICATION ActionType allowed. Mandatory
   `caller_confirmation: true` + `idempotency_key`. NO
   persistence per Founder QLOCK 1; NO new audit literal;
   NO LLM / Python / BEAM; NO direct execution; NO
   connector invocation. ADR-0075 design-only context
   below was: Closed-vocabulary
   transition contract; Wave 8 creates Section 2 Action
   rows via existing `createActionForCaller` in PROPOSED
   status; Section 2 retains all execution authority per
   ADR-0057. 23 sub-decisions locking
   `GovernedTransitionResponse` shape + 2-value
   `transition_outcome` (ACTION_PROPOSED + NO_ACTION_PROPOSED)
   + canonical `recommended_candidate_type` → `ActionType`
   mapping (CONSERVATIVE v1: ONLY SEND_INTERNAL_NOTIFICATION
   allowed; STATUS_QUO + DO_NOT_PROCEED non-transitionable)
   + 4-value `reason_not_proposed` closed vocabulary +
   mandatory `caller_confirmation: true` body field +
   mandatory `idempotency_key` + canonical "Wave 8 calls
   Wave 7 internally" decision + Section 2 delegation
   pattern + dual audit emission (ADMIN_ACTION Playground
   handoff + Section 2's existing ACTION_PROPOSED/APPROVED/
   REJECTED row) + ADR-0070 §9 legal-advice posture
   inherited verbatim + three-method comparison + §22
   future-generalization strategic context. NO code / NO
   schema / NO new audit literal at ADR-0075. Wave 8
   implementation slice (Option A deterministic
   TypeScript) is forward-substrate behind separate
   Founder authorization.
8. **Wave 9 — multi-agent simulation orchestration**
   design-only ADR LANDED 2026-05-31 at ADR-0076 (PR #146;
   commit `b077a0e`). Wave 9 Option A implementation
   LANDED 2026-05-31 at PR #147 (commit `340d37f`) —
   deterministic TypeScript multi-agent simulation
   orchestration. NEW `PlaygroundSimulationService` at
   `apps/api/src/services/playground/playground-simulation.service.ts`
   + NEW route `POST /api/v1/playground/scenarios/:id/simulations`
   + 47 integration tests. Sequential `Promise.allSettled`
   fan-out over (branch_definition × agent_role)
   combinations capped at 24 per ADR-0076 §11 (4 default
   branch_definitions × 6 default agent_roles = 24); each
   combination invokes Wave 7 `recommendBestPath` once;
   each Wave 7 result projected through a closed-vocab
   agent_role lens per ADR-0076 §5 + §6 (assumed_constraints
   10 + expected_outcomes 8 + governance_conflicts 10 +
   unresolved_questions 8). NO agent-to-agent message-
   passing; NO LLM-generated agent personas; NO raw
   chain-of-thought between branches; NO numeric scoring /
   ranking / probability / winner field names; agent roles
   = simulation lenses, NOT independent authorities.
   Convergence (intersection of recommended candidate_keys
   + governance_findings + required_reviews) + disagreement
   (distinct candidate_types + distinct recommendation_modes
   + unresolved_branches) + recommended_next_review
   (closed-vocab priority ladder; 8 next_review_label
   values) computed deterministically. Founder enterprise-
   decision-output clarification 2026-05-31 applied as
   additive `enterprise_decision_posture` extension:
   `primary_recommended_branch_id` +
   `primary_recommendation_reasons[]` (inherits Wave 7 vocab)
   + `viable_alternative_branch_ids[]` (capped at 3) +
   `evidence_posture[]` (closed vocab 12 values incl.
   POLICY_SUPPORTS_PATH / COMPLIANCE_REVIEW_REQUIRED /
   LEGAL_REVIEW_REQUIRED / INSUFFICIENT_CONTEXT /
   CONFLICTING_SIGNALS / AUTHORITY_CHAIN_UNCLEAR /
   AUDIT_HISTORY_SUPPORTS_PATH) +
   `blockers_before_action[]` (closed vocab 10 values
   incl. POLICY_BLOCKS_ACTION / MISSING_COMPLIANCE_REVIEW /
   MISSING_LEGAL_REVIEW / MISSING_DUAL_CONTROL_APPROVAL /
   MISSING_HUMAN_DECISION / INSUFFICIENT_DATA /
   CONNECTOR_UNAVAILABLE / AUTHORITY_CHAIN_UNCLEAR /
   NO_TRANSITION_POSSIBLE / NO_KNOWN_BLOCKER) +
   `safe_next_step` (closed vocab 7 values: LEGAL >
   COMPLIANCE > APPROVAL_CHAIN > MISSING_CONTEXT >
   DO_NOT_PROCEED > HUMAN_REVIEW > PROPOSE_GOVERNED_ACTION
   priority ladder). Computed-on-read; NO persistence;
   NO new Prisma model; NO schema migration; NO new audit
   literal — `ADMIN_ACTION + details.action =
   "PLAYGROUND_SIMULATION_EXECUTED"` audit with safe
   metadata only per ADR-0076 §14 (scenario_id +
   orchestration_mode + branch_count +
   branch_definitions_used + agent_roles_used +
   convergence_summary_size + disagreement_summary_size +
   unresolved_questions_count + caller_confirmation_received;
   NEVER raw branch text / chain-of-thought / scenario
   JSON / agent prompts / model outputs / scores). Each
   Wave 7 sub-invocation also emits its own
   PLAYGROUND_BEST_PATH_RECOMMENDED audit row per ADR-0074
   §14 — Wave 9 does NOT suppress those. Mandatory
   `caller_confirmation: true` per ADR-0076 §2; NO
   `idempotency_key` (Wave 9 creates no Action rows).
   Wave 9 NEVER creates Actions / executes / bypasses
   Wave 8 / invokes connectors / calls external providers
   / runs LLM / runs Python / runs BEAM. Owner-first +
   same-org SCENARIO_NOT_FOUND gate inherited via Wave 7
   → Wave 6 → Wave 5 → Wave 4 delegation. Partial Wave 7
   sub-invocation failures projected as INSUFFICIENT_DATA
   closed-vocab branches (NEVER raw error messages) per
   ADR-0076 §12 fault-isolation guarantee. Founder
   behavioral clarification 2026-05-31 confirmed Wave 9
   semantics as governed role-perspective simulation
   before action — *canonical sentence: "Wave 9 is not
   autonomous agent debate. Wave 9 is governed role-
   perspective simulation before action."* **ADR-0076
   Amendment 1 LANDED 2026-05-31** at
   `[FOUNDER-SECTION-5-WAVE-9-VOCABULARY-AMENDMENT-AUTH]` —
   docs-only canonicalization of the richer vNext branch +
   role vocabulary alongside the LIVE v1 runtime vocabulary
   (§4 amended to §4.1 v1 + §4.2 vNext 6 branch postures
   incl. RECOMMENDED_PATH / LOW_RISK_PATH /
   COMPLIANCE_FIRST_PATH / RESILIENCE_FIRST_PATH /
   HUMAN_REVIEW_PATH / DO_NOT_PROCEED_PATH; §5 amended to
   §5.1 v1 + §5.2 vNext 10 enterprise-recognizable roles
   incl. OWNER_OPERATOR / POLICY_REVIEWER /
   COMPLIANCE_REVIEWER / SECURITY_REVIEWER /
   DATA_GOVERNANCE_REVIEWER / CONNECTOR_ADMIN /
   ACTION_APPROVER / CUSTOMER_OR_STAKEHOLDER_ADVOCATE /
   OPERATIONS_LEAD / RESILIENCE_REVIEWER; NEW §17A
   migration posture; NEW §17B Control Tower relation; NEW
   §17C DGI/product rationale). **vNext runtime LIVE
   2026-05-31** — clean v1 → vNext replacement landed in
   lockstep across Foundation + Control Tower per
   `[FOUNDER-SECTION-5-WAVE-9-VNEXT-IMPLEMENTATION-AUTH]`
   2026-05-31. Foundation Wave 9 service migration LIVE at
   PR #152 `7593e6f` (51 Wave 9 integration tests
   passing — 47 existing migrated + 4 NEW vNext-specific:
   default-set membership / opt-in branch + role acceptance
   / v1 rejection / full 6×10=60 cross-product rejected per
   §11 cap). Wave 10 CT lockstep migration LIVE at
   `otzar-control-tower` PR #7 `ff6e54b` (110/110 CT tests
   passing across 22 test files — Wave 10 type mirror + MSW
   simulation fixture + 4 NEW vNext-vocab assertions; the
   `/agent-playground` cockpit page requires NO code
   changes because it renders Foundation closed-vocab labels
   verbatim as `<Badge>` children). Default set 4 vNext
   branches (RECOMMENDED_PATH / LOW_RISK_PATH /
   COMPLIANCE_FIRST_PATH / HUMAN_REVIEW_PATH) × 6 vNext
   roles (OWNER_OPERATOR / POLICY_REVIEWER /
   COMPLIANCE_REVIEWER / ACTION_APPROVER / OPERATIONS_LEAD
   / RESILIENCE_REVIEWER) = 24 (§11 ceiling preserved).
   Opt-in via explicit body param: 2 branches
   (RESILIENCE_FIRST_PATH / DO_NOT_PROCEED_PATH) + 4 roles
   (SECURITY_REVIEWER / DATA_GOVERNANCE_REVIEWER /
   CONNECTOR_ADMIN / CUSTOMER_OR_STAKEHOLDER_ADVOCATE).
   DO_NOT_PROCEED_PATH maps to DETERMINISTIC_HUMAN_REVIEW_FIRST
   with closed-vocab projection surfacing
   BRANCH_NO_TRANSITION_POSSIBLE + WAVE_8_TRANSITION_DECLINED_BY_POLICY
   (safety-first review posture; NEVER creates an Action,
   NEVER invokes Wave 8). v1 vocabulary fully retired by
   clean replacement per ADR-0076 §17A; Foundation Wave 9
   API responses now emit vNext closed-vocab labels only.
   **Wave 10 Section 2 Action read-surface integration LIVE
   2026-05-31** per ADR-0077 §8.4 three-state-lifecycle
   honesty (simulation / proposed / executed) at
   `[FOUNDER-SECTION-2-ACTION-READ-SURFACE-FOR-WAVE-10-CT-AUTH]`
   2026-05-31. CT cockpit at `otzar-control-tower` PR #8
   `ade4981` consumes Foundation's existing
   `GET /api/v1/actions/:id` endpoint (LIVE per ADR-0057
   §9 + §10 + `getActionForCaller`; SafeActionDetailView
   per §10 forbidden-fields allowlist) verbatim with ZERO
   Foundation backend changes. NEW `ActionLifecyclePanel`
   embedded inside the Governed Transition panel after
   Wave 8 returns an `action_id`; lazy TanStack Query
   (`enabled: false`) triggered exclusively by user clicks
   on the "Refresh action status" button (NO aggressive
   polling); closed-vocab `actionLifecycleSummary()` maps
   each Section 2 status → honest lifecycle copy
   (PROPOSED → "Action proposed (not executed)"; APPROVED
   → "Action approved by Section 2; scheduled for
   execution by the Section 2 Action Runtime"; SCHEDULED
   / RUNNING → current lifecycle; SUCCEEDED → "Action
   completed by Section 2"; FAILED → "Action failed in
   Section 2"; CANCELLED → "Action cancelled in Section
   2"; REJECTED → "Action rejected by Section 2
   (governance review denied)"; TIMED_OUT → "Action
   timed out in Section 2"; EXPIRED → "Action expired in
   Section 2 (approval window elapsed)"). NEW
   `api.actions.getAction(actionId)` namespace extends
   existing `src/lib/api.ts` `ApiResult<T>` pattern. NEW
   type mirrors at `src/lib/types/foundation.ts`:
   `ActionStatus` 10-value closed-vocab union mirroring
   Foundation Prisma `ActionStatus` + `SafeActionView` +
   `SafeActionDetailView` extending with `attempt_count`
   + `last_result_summary` per ADR-0057 §9. Lifecycle
   panel footer states: *"This Action detail is a
   read-only lifecycle view. It does not approve, execute,
   retry, or cancel the Action. Execution authority
   remains with the Section 2 Action Runtime per ADR-
   0057."* 16 NEW Section 2 lifecycle integration unit
   tests passing (110 prior CT tests preserved verbatim;
   126/126 total across 22 test files; zero regression);
   typecheck + lint + build green. Wave 10 cockpit now
   distinguishes all three lifecycle states honestly:
   (1) simulation only — no Action proposed; (2) action
   proposed (Wave 8 PROPOSED unverified) — UI surfaces
   "Action proposed (not executed). Click 'Refresh action
   status' to read Section 2's current view."; (3)
   action lifecycle verified — UI surfaces the closed-
   vocab Section 2 status copy. NO Execute button. NO
   Approve button. NO Cancel button. NO Retry button. NO
   Section 2 mutation surface in Wave 10. NO Section 2
   bypass. NO new Foundation API. NO schema. NO new
   audit literal. NO raw payload / secrets / policy
   internals / raw audit / memory / transcript / prompt /
   chain-of-thought exposure. `conversation_context_signals[]`
   reserved for the governed listener substrate slice.
   Option C BEAM-orchestrated forward-substrate per
   ADR-0028 + ADR-0069 §6 re-verification (applies WHEN
   simulation needs LIVE concurrent message-passing agents
   OR scales beyond 24 sequential branches per call;
   neither holds at v1).
9. **Wave 10 — Control Tower frontend consumer** —
   consumer-experience contract ADR-0077 LANDED 2026-05-31
   (design-only; closes ADR-0065 §7 Wave 10 forward-queue
   line at the consumer-experience contract register).
   **Wave 10 implementation slice LANDED 2026-05-31 in
   `otzar-control-tower` (PR #6; commit `cf3483f`)** —
   enterprise decision cockpit at NEW route
   `/agent-playground` (existing `/playground` Placeholder
   preserved unchanged per ADR-0077 §11 Option A per Founder
   UX decision 2026-05-31). 6 primary panels (Scenario
   Context + Candidate Paths + Outcome Comparison + Best-Path
   Recommendation + Multi-Agent Simulation + Enterprise
   Decision Posture + Governed Transition) consuming the 6
   Foundation Agent Playground routes verbatim via NEW
   `api.playground.*` namespace (10 methods: listScenarios +
   createScenario + getScenario + updateScenario +
   archiveScenario + generateCandidates + compareOutcomes +
   recommendBestPath + proposeGovernedTransition +
   runSimulation). Wave 4-9 Foundation type mirrors landed at
   `src/lib/types/foundation.ts`. ZERO new Foundation
   backend code / new Foundation routes / new schema / new
   audit literal / LLM / Python / BEAM / connector
   invocation / Action execution / personal-life automation
   / trust delegation / organizational graph (v1 forward-
   substrate) / raw memory / transcript / prompt /
   chain-of-thought / Execute button / Wave 8 bypass at this
   slice. 4 honesty postures enforced (hierarchy /
   conversation-context — Foundation does NOT yet expose
   `conversation_context_signals[]`; UI surfaces "not
   available in this version" / evidence-posture / execution-
   boundary 3-state lifecycle simulation/proposed/executed
   with "Action proposed (not executed)" framing when Wave 8
   returns PROPOSED). Wave 8 governed transition requires
   explicit acknowledgement checkbox + confirmation modal +
   `caller_confirmation: true` + fresh `crypto.randomUUID`
   `idempotency_key` per submit attempt (NEVER reused).
   Forbidden-UI-copy guard test enforces 20+ forbidden
   strings ("AI agents decided" / "Final decision" /
   "Guaranteed compliant" / "Winner" / "Score" / "Ranked #1"
   / "Chain-of-thought" / "Auto-approved" / etc.); no-leak
   guard enforces FORBIDDEN_RAW_TOKENS against rendered page
   tree; no-Execute-button guard walks every stage and
   asserts no `<button>` has "Execute" as its label. 22 NEW
   Wave 10 unit tests passing; 110/110 total tests across 22
   test files (88 prior tests preserved; zero regression);
   `npm run typecheck` + `npm run lint` + `npm run build`
   all green. React + Vite + TypeScript + Tailwind +
   TanStack Query + Vitest + Playwright stack preserved.
   `otzar-control-tower` main HEAD at this slice landing:
   `cf3483f` (PR #6 merged 2026-05-31). **Section 5 Agent
   Playground end-to-end enterprise cockpit is now LIVE for
   the completed scope across Foundation Waves 4-9 + Control
   Tower Wave 10.**
   Locks 6 primary panels (Scenario Context + Candidate
   Paths + Outcome Comparison + Best-Path Recommendation +
   Governed Transition + Multi-Agent Simulation / Enterprise
   Decision Posture) + route-neutral route intent (existing
   `/playground` Placeholder framed for "Section 12C"
   NEGOTIATE demo preserved unless explicit Founder UX scope
   decision authorizes retirement; implementation slice
   picks Option A new `/agent-playground` route OR Option B
   replace OR Option C nest) + closed-vocab canonical UI
   copy + 20+ forbidden UI strings ("AI agents decided" /
   "Final decision" / "Guaranteed compliant" / "Winner" /
   "Score" / "Chain-of-thought" / "Auto-approved" / etc.) +
   13 closed-vocab state chips + per-panel display contract
   (canonical Foundation fields each panel MUST show via the
   6 exported success interfaces verbatim + MUST NOT show)
   + enterprise success test (16 questions the operator
   must answer from the UI without dev tools) + 4 honesty
   postures (hierarchy honesty — NEVER fabricate named
   approvers; conversation-context honesty — Foundation
   does NOT yet expose `conversation_context_signals[]`; UI
   MAY reserve space but MUST state "not available in this
   version" or omit; evidence-posture honesty — render
   closed-vocab labels verbatim, NEVER extrapolate;
   execution-boundary honesty — 3-state lifecycle
   simulation/proposed/executed; NEVER show "Action
   executed" framing on PROPOSED status alone) + API client
   contract intent (extend existing `src/lib/api.ts`
   `ApiResult<T>` discriminated-union pattern; add
   `api.playground.*` namespace; bearer auto-attach; 401 →
   existing `onUnauthorized` callback; POST MUST NOT
   auto-retry; mirror Foundation success interfaces
   verbatim) + primary CTA rules (NO "Execute" button in
   Wave 10 — execution is Section 2's responsibility per
   ADR-0057; "Propose governed action" requires explicit
   confirmation gesture + fresh `idempotency_key`) +
   pre-existing `/playground` Placeholder route handling
   (3 explicit Option choices the implementation slice MUST
   cite in PR) + 10-step implementation sequencing +
   universal forbidden-inputs / no-leak doctrine + audit
   posture (Wave 10 emits NO new audit events; surfaces
   existing `audit_event_id` / `playground_audit_event_id`
   / `simulation_audit_event_id` as short reference badges;
   ZERO new audit literal) + persistence posture (NO Wave
   10 Foundation persistence; client-side TanStack Query
   caching only). Wave 10 implementation slice (frontend
   code in `otzar-control-tower`) requires separate Founder
   authorization at slice (`[FOUNDER-SECTION-5-WAVE-10-CONTROL-TOWER-IMPLEMENTATION-AUTH]`
   tag). `otzar-control-tower` read-only inspected at HEAD
   `d0c9bcb` "Add correction signals UI" during ADR-0077
   Phase 0 — main branch clean except `AGENTS.md` /
   `CONTEXT.md` untracked; existing `/playground` route is
   a 20-line `<Placeholder>`. CT frontend patterns canonical
   (React + Vite + TS + Tailwind + TanStack Query + single
   HTTP client at `src/lib/api.ts` with `ApiResult<T>`
   discriminated union + Vitest + Playwright).

## Long-term product vision (canonical at ADR-0065)

**ADR-0065 LANDED 2026-05-30** as a NEW ADR sitting ABOVE
ADR-0060 at the product-vision tier. Canonicalizes the
long-term Agent Playground product vision verbatim;
preserves ADR-0060 as the canonical Wave 2 implementation
contract for the first backend substrate / inspector
foundation.

ADR-0065 locks:

- **§1 long-term purpose** — DGI substrate for the
  enterprise domain (NOT a toy sandbox); enterprise
  simulation; multi-agent scenario exploration;
  organizational decision simulation; alternative plan
  comparison; outcome comparison; best-path
  recommendation; governed transition from simulation to
  Action runtime.
- **§2 13-input canonical set** the future scenario
  engine MAY consume (org goals + role-scoped context +
  approved working sets + policy/governance_terms
  constraints + connector capabilities + Hive/team
  context + audit-derived signals + analytics aggregates
  + corrections/drift signals + approved memory capsules
  + dependency/blocker/cost/timing/risk/impact
  estimations).
- **§3 10-output canonical set** (scenario candidates +
  recommended best path + reasons/evidence + tradeoffs +
  risk flags + policy/governance findings + dependency
  map + expected outcomes + required approvals +
  proposed Action plan). Forbidden: organizational
  scoring / employee rankings / psychological inferences
  / fabricated probabilities / raw capsule content /
  chain-of-thought / cross-org / secrets.
- **§4 human-in-the-loop doctrine** — Playground NEVER
  silently executes; MAY propose plans; transition MUST
  go through Section 2 Action runtime + policy +
  approvals + audit; no bypass.
- **§5 universal safety / no-leak doctrine** — applies
  at every Agent Playground tier; explicit forbidden
  list (employee surveillance / org scoring / hidden
  manager spy / psychological scoring / raw transcripts /
  chain-of-thought / raw prompts / raw memory unless
  scoped + projected / embeddings / vectors / storage
  locations / content hashes / bridge IDs / secret refs /
  cross-org / production provider calls / live external
  side effects / unapproved Action creation / autonomous
  execution).
- **§6 relation to Wave 2** — Wave 2 inspector
  foundation = 3 primitives future waves WILL compose
  (policy evaluator + connector dry-run + working-set);
  Wave 2 is NOT the full product.
- **§7 canonical 10-wave forward map** (this Wave 3 +
  Wave 4 persistent named scenarios + Wave 5 candidate
  generation contract + Wave 6 outcome comparison +
  Wave 7 best-path recommender + Wave 8 governed
  transition to Action + Wave 9 multi-agent
  orchestration + Wave 10 Control Tower frontend
  consumer).
- **§9 canonical naming + scope clarity** — Agent
  Playground inspector foundation (Wave 2 LIVE) vs
  Agent Playground scenario simulation substrate (Waves
  4-9) vs Otzar Control Tower UI (Wave 10) vs Actual
  execution (Section 2 Action runtime, NOT Playground).

Future Wave 4+ implementation slices reference ADR-0065
§7 wave map verbatim. Each wave requires separate Founder
authorization at its slice.

## Risks / forward-substrate

- Playground "dry-run" must never leak forbidden fields when
  inspecting decisions or working sets.
- Avoid building the playground UI on the Foundation surface;
  it belongs in the Control Tower frontend (Section 9).

### ADR-0078 conversation substrate (design-only LANDED 2026-05-31)

**ADR-0078 LANDED 2026-05-31** at
`[FOUNDER-CONVERSATION-CONTEXT-SIGNALS-SUBSTRATE-ADR-AUTH]`
— design-only four-layer conversation substrate canonical:
**Layer 1** Raw Transcript Source-of-Truth (governed exact
transcripts when authorized) + **Layer 2** Scoped Reasoning
(Agent Playground may consult exact transcripts internally
for accuracy under scope) + **Layer 3**
`conversation_context_signals[]` Safe Projection (closed-
vocab UI / reasoning-output substrate) + **Layer 4**
Permissioned Evidence Drilldown (authorized users may
traverse signal → transcript excerpt under policy).
Canonical doctrines: *"Exact transcripts are the
evidentiary source of truth;
`conversation_context_signals[]` are the governed
intelligence interface."* + *"Otzar Enterprise should
remember work, not surveil life."* + *"The transcript
layer preserves authorized business evidence; the
relevance layer prevents personal life from becoming
enterprise intelligence."* §3 closed-vocab catalogs (9
unions: signal_type 17 / confidence 4 / source 8 / scope 6
/ evidence_label 13 / retention_class 5 / redaction_status
4 / policy_purpose 7 + TranscriptRef Layer-4 attachment
shape). §4 Layer 1 allowed transcript-source-record
fields. §5 Wave 10 cockpit attachment (replaces ADR-0077
§8.2 placeholder when Stage 4 lands). §6 12 implementation
prerequisites + §6A 19 transcript-governance capabilities
+ §6B four canonical access tiers (internal enterprise /
compliance-legal review / regulator-facing evidence
package / external third-party) + §6C capture-eligibility
+ work-relevance filtering layer (5-class relevance
classifier biased toward privacy; 7-value capture-
eligibility vocab; 5-value agent-playground-use vocab;
11-value business-purpose-label vocab; 9-value scope-
binding-type vocab; personal/protected-category exclusion;
mixed-conversation handling; sensitive-personal blocked
from Agent Playground entirely). §7 five-stage
implementation ladder (Stage 0 this ADR LANDED; Stages
1-5 each require separate Founder authorization). §8/§9
future Wave 7 + Wave 9 additive-sidecar attachment points.
§11 safe_summary discipline (closed-style at default
surface; exact quotes ONLY via Layer 4 permissioned
drilldown). §12 ZERO new audit literal. §13 ADR-0070
regulator-ready posture inherited. **Load-bearing
prerequisite**: future ADR-0079 Transcript Substrate
Policy ADR MUST cover ADR-0078 §6 + §6A + §6B + §6C
before any implementation stage can fire (separate Founder
authorization at slice). The four-layer substrate
preserves both the patent-implementation evidence trail
(exact transcripts under governance) AND the no-
surveillance discipline (work-relevance filtering blocks
personal life from becoming enterprise intelligence).

### ADR-0079 transcript substrate policy (design-only LANDED 2026-05-31)

**ADR-0079 LANDED 2026-05-31** at
`[FOUNDER-ADR-0079-TRANSCRIPT-SUBSTRATE-POLICY-ADR-AUTH]`
— design-only Policy ADR that turns ADR-0078 §6 + §6A +
§6B + §6C into enforceable policy gates + service-tier
contracts. 33 sections covering capture eligibility (8
pre-Layer-1 gates) + work-relevance classification
(biased toward privacy; UNKNOWN_REQUIRES_REVIEW default)
+ personal/non-work exclusion (13 categories incl.
protected-class) + mixed conversation handling +
sensitive personal BLOCKED-from-Agent-Playground +
business-purpose binding + scope binding + 4 canonical
access tiers (Internal Enterprise / Compliance-Legal /
Regulator Evidence Package / External Third-Party —
NEVER collapsed) + notice/consent + retention (5-class
vocab; legal hold overrides deletion) + legal hold
(dual-control RECOMMENDED) + redaction + privileged
conversation handling + client/customer confidential
handling + transcript access audit (9 categories; ZERO
new audit literal — existing ADMIN_ACTION + details.action
discriminator pattern reused; raw transcript NEVER in
audit details) + quote/excerpt permission + export/
eDiscovery + regulator disclosure (ADR-0036 LawfulBasis
9-condition gate + ADR-0070 neutral-vocabulary) +
correction/amendment trail + linkage policy + **9
service-tier gates** (`canCaptureTranscript` /
`classifyConversationRelevance` / `canRetainTranscript` /
`canUseForAgentPlayground` / `canDrillDownTranscript` /
`canQuoteTranscript` / `canExportTranscript` /
`canDiscloseToRegulator` /
`canDeleteOrPseudonymizeTranscript`) + default no-leak
doctrine (ADR-0078 §11 + §5.2 + §6C catalog inherited
verbatim) + Agent Playground use policy + Control Tower
cockpit policy (ADR-0077 §8 four honesty postures + §4 /
§13 / §10 guards preserved verbatim) + implementation
ladder mapping + 18-item stop-conditions list. ADR-0079
itself is **docs-only — NO code / schema / new routes /
listeners / transcript capture / Control Tower
implementation / LLM / Python / BEAM / connector
invocation / Action mutation / new audit literal / raw
transcript exposure by default at this commit**. **With
ADR-0079 LANDED, ADR-0078 §7 Stage 1+ implementation is
policy-unblocked** but remains implementation-gated by
separate Founder authorization at slice. **Recommended
next slice: ADR-0078 Stage 2 approved-source projection**
(uses already-LIVE safe sources `CORRECTION_SIGNAL` per
ADR-0055 + ADR-0058 / `ACTION_HISTORY` per ADR-0057 /
`HIVE_CONTEXT` per ADR-0059 + ADR-0063 /
`MANUAL_USER_INPUT` per ADR-0065; brings
`conversation_context_signals[]` to Agent Playground
without raw transcript ingestion; signal shape carries
ADR-0078 §6C.12 additive fields verbatim). Stage 1 layer
1 schema + helper + read service MAY land before OR after
Stage 2 — Stage 2 is recommended first because it
delivers Wave 7 / Wave 9 / Wave 10 conversation-signal
value using already-LIVE Foundation substrate without
introducing Layer 1 ingest.

### ADR-0078 Stage 2 approved-source projection LIVE 2026-06-01

**ADR-0078 Stage 2 LIVE** at
`[ADR-0078-STAGE-2-APPROVED-SOURCE-PROJECTION]` 2026-06-01.
Foundation Wave 7 + Wave 9 responses now carry an additive,
backward-compatible
`conversation_context_signals: readonly ConversationContextSignal[]`
sidecar built from already-LIVE approved sources only.
**ZERO** raw transcript schema, **ZERO** transcript capture,
**ZERO** listener, **ZERO** Layer 1 ingest, **ZERO** Layer 4
drilldown surface, **ZERO** Control Tower code, **ZERO** new
audit literal, **ZERO** schema migration, **ZERO** new route,
**ZERO** Action creation / mutation, **ZERO** connector
invocation, **ZERO** LLM / Python / BEAM at this slice.

LIVE Stage 2 sources at this slice:
- `CORRECTION_SIGNAL` — caller-wallet self-scoped CORRECTION
  capsule count + last-seen freshness via Prisma (mirrors
  `projectConversationCorrections` discipline; ADR-0055 +
  ADR-0058 LIVE).
- `ACTION_HISTORY` — `listActionsForCaller` → `SafeActionView`
  per ADR-0057 §10 allowlist (status / requires_approval /
  risk_tier / action_type only; NEVER payload_summary /
  payload_redacted / policy_envelope / secret_ref / source-org-
  target entity_ids).
- `MANUAL_USER_INPUT` — structural PRESENCE/ABSENCE of
  scenario.goal_summary only (NEVER quotes text); empty
  goal_summary triggers a
  CONTEXT_INSUFFICIENT_FOR_RECOMMENDATION signal so the human
  is nudged to fill in scenario context before action.

Deferred / zero-output at Stage 2 (enum preserved):
- `HIVE_CONTEXT` — no scenario-tied safe Hive context-projection
  method ready for Stage 2 consumption; future Founder-authorized
  amendment may wire it in without breaking the response
  contract.

Signal shape: every emitted `ConversationContextSignal` carries
all §2 base fields (minus `related_transcript_ref` which is
OMITTED at Stage 2 per ADR-0078 §7 line 1088 — no Layer 1 yet)
PLUS the 8 §6C.12 additive fields (`conversation_relevance_class`
+ `capture_eligibility` + `agent_playground_use` +
`redaction_applied` + `business_purpose_label` +
`scope_binding_type` + `review_required` +
`personal_content_suppressed`). Bounded ≤ 8 per ADR-0078 §8
line 1129. Stable ordering by (source_type, signal_type). Dedupe
on (signal_type, signal_source_type, signal_scope).

Wave 9 attachment lives on `EnterpriseDecisionPosture` per
ADR-0078 §9 (scenario-wide single sidecar; NOT per-branch —
preserves ADR-0076 §11 bounded branch budgets). Wave 7
attachment lives at the top-level `RecommendBestPathSuccess`
per ADR-0078 §8.

ADR-0079 §27 Agent Playground use policy enforced **by
construction** at the projection service register:
`NON_WORK_PERSONAL` / `SENSITIVE_PERSONAL` /
`UNKNOWN_REQUIRES_REVIEW` / `UNKNOWN_BUSINESS_PURPOSE` /
`BLOCKED_FROM_AGENT_PLAYGROUND` / `REQUIRES_HUMAN_REVIEW` /
unset `scope_binding_type` can never appear in the sidecar.
Wire-level no-leak guard tests assert raw_text / message_body /
speaker_quote / private_note / raw_audio / raw_video /
raw_screen_capture / emotion_score / sentiment_score /
employee_score / manager_score / psychological_profile /
compliance_certification / legal_conclusion / regulator_approval
/ related_transcript_ref / transcript_id / transcript_hash /
transcript_text_encrypted never surface in Wave 7 or Wave 9
response bodies.

Audit posture: existing `ADMIN_ACTION + details.action =
"PLAYGROUND_BEST_PATH_RECOMMENDED"` (Wave 7) +
`"PLAYGROUND_SIMULATION_EXECUTED"` (Wave 9) extended with safe
metadata only — `conversation_context_signals_count` + de-duped
`conversation_context_signal_sources` list. NEVER raw signal
text / safe_summary / honest_note / safe_summary content / raw
correction payload / raw Action payload.

Stage 1 (Layer 1 schema + Layer 3 helper + Layer 4 read
service) remains forward-substrate (separate Founder
authorization at slice). Control Tower can continue to render
ADR-0077 §8.2 "Conversation context signals not available in
this version" placeholder; the next recommended slice is the CT
consumption slice that replaces that placeholder with safe
Layer 3 signals from this Stage 2 Foundation surface.

Test surface: 17 NEW unit tests (closed-vocab tuple stability +
§6C.12 additive field exhaustion + bounded-count discipline) +
6 NEW Wave 7 integration tests (sidecar presence + backward
compatibility + bounded ≤ 8 + signal shape + no-leak + ADR-0079
§27 blocked enum values absent + empty array for caller without
approved-source context) + 7 NEW Wave 9 integration tests (same
posture at `enterprise_decision_posture` attachment point).
Wave 7 baseline 40 → 46. Wave 9 baseline 51 → 58. Wave 8
governed-transition regression preserved at 43/43.

### ADR-0078 Stage 2 CT consumer LIVE 2026-06-01

**Control Tower consumer LANDED 2026-06-01** at
`[CT-ADR-0078-STAGE-2-CONVERSATION-CONTEXT-SIGNALS]`
(otzar-control-tower PR
[#9](https://github.com/NiovArchitect/otzar-control-tower/pull/9)
`ad344a2`). The Wave 10 cockpit at `/agent-playground` now
consumes the `conversation_context_signals[]` sidecars
Foundation Stage 2 emits and retires the ADR-0077 §8.2
"Conversation context signals not available in this version"
placeholder. NEW `ConversationContextSignalsPanel` renders
safe Layer 3 signals as closed-vocab badges (source / signal
type / confidence / scope / binding / purpose / evidence /
retention / relevance / use / capture + optional
redaction-applied / personal-content-suppressed chips) +
safe_summary paragraph + honest_note footer. Wired into Wave 7
RecommendationPanel (top-level sidecar after
`alternatives_considered`, before HonestNote) AND Wave 9
SimulationContent (in place of the retired §8.2 placeholder
Card). Empty-state copy is honest about the Stage 1 / Layer 4
boundary not yet shipped (no permissioned evidence drilldown
in this version).

CT type-mirror surface: NEW `ConversationContextSignal` +
11 closed-vocab union types at
`otzar-control-tower:src/lib/types/foundation.ts`. Additive
`conversation_context_signals` on `RecommendBestPathSuccess`
(Wave 7) + `PlaygroundEnterpriseDecisionPosture` (Wave 9
scenario-wide; NOT per-branch — preserves ADR-0076 §11
budgets).

CT test surface: 4 NEW Wave 10 tests + 1 UPDATED §8.2
placeholder test (129/129 total; was 126 → +3 net):
Wave 9 signals panel replaces placeholder + signal count +
§6C.12 additive fields surfaced; Wave 7 signals panel renders
on recommendation surface; honest empty-state copy when no
signals exist; no-leak guard locks 19 Stage-2-specific
forbidden tokens (raw_text / message_body / speaker_quote /
private_note / raw_audio / raw_video / raw_screen_capture /
emotion_score / sentiment_score / employee_score /
manager_score / psychological_profile /
compliance_certification / legal_conclusion /
regulator_approval / related_transcript_ref / transcript_id /
transcript_hash / transcript_text_encrypted) + 5 ADR-0079 §27
blocked enum values (NON_WORK_PERSONAL / SENSITIVE_PERSONAL /
UNKNOWN_REQUIRES_REVIEW / UNKNOWN_BUSINESS_PURPOSE /
BLOCKED_FROM_AGENT_PLAYGROUND) asserted absent.

CT substrate-honest correction at this slice per RULE 13:
CT's `FORBIDDEN_UI_COPY` guard previously used a bare
`"final decision"` substring; replaced with positive-claim
form (`"is a final decision"` / `"this final decision"` /
`"the final decision is"`) to avoid false-positives against
the canonical Foundation disclaimer "Not a final decision"
that ADR-0074 §16 + ADR-0078 §11 + ADR-0070 §9 authorize
verbatim — mirrors Foundation Wave 7's
`FORBIDDEN_RECOMMENDATION_LANGUAGE` discipline.

NO Foundation backend change at this CT slice. NO new
Foundation route. NO new schema. NO new audit literal. NO
transcript drilldown UI. NO Layer 4 affordance. NO raw
transcript. NO quote / excerpt. NO Execute / Approve /
Cancel / Retry button on the signals surface. NO connector
invocation. NO LLM in CT. NO Action mutation from CT.

ADR-0077 §8.2 amended in lockstep (Amendment 1) to mark the
placeholder retired at the CT register. ADR-0078
forward-substrate closeout extended with a CT-consumer
back-citation. Stage 1 (Layer 1 schema + Layer 3 helper +
Layer 4 read service) and Stage 3 (governed listener) remain
forward-substrate.

### ADR-0078 Stage 2 HIVE_CONTEXT projection LIVE 2026-06-01 (Hive C1)

**HIVE_CONTEXT source LIVE** at
`[HIVE-C1-HIVE-CONTEXT-PROJECTION]` 2026-06-01. Closes the
explicit zero-output gap the Stage 2 ADR left at
`projectHiveContextSignalForScenario`. The
`ConversationContextSignalProjectionService` now reads
caller-scoped same-org hive memberships via direct Prisma
(`prisma.hive.findMany({ where: { org_entity_id, status:
"ACTIVE", members: { some: { entity_id: caller, status:
"ACTIVE" } } } })`) and emits a single safe
`MISSING_STAKEHOLDER_INPUT` signal when the caller has ≥ 1
ACTIVE membership in an ACTIVE hive whose `org_entity_id`
matches `scenario.org_entity_id`.

Signal shape (closed-vocab + bounded): `signal_type =
MISSING_STAKEHOLDER_INPUT`, `signal_source_type =
HIVE_CONTEXT`, `signal_scope = SAME_ORG`, `evidence_label
= MISSING_CONTEXT`, `business_purpose_label =
HIVE_OR_TEAM_COORDINATION`, `scope_binding_type =
ORG_SCOPED`, `retention_class = AUDIT_SAFE_METADATA_ONLY`,
`conversation_relevance_class = WORK_RELEVANT`,
`capture_eligibility = CAPTURE_ALLOWED`,
`agent_playground_use = ALLOWED_FOR_SIGNALS`,
`requires_human_review = false`, `review_required = false`,
`redaction_applied = false`, `personal_content_suppressed
= false`. `signal_confidence_label` widens from `LOW`
(single membership) to `MEDIUM` (≥ 2 memberships).

Safety invariants enforced by construction at the
projection register: NEVER hive names, NEVER hive IDs,
NEVER member entity_ids, NEVER `governance_terms` text,
NEVER `aggregate_capsule_id`, NEVER raw hive aggregate
payload (those remain behind the existing
`getHiveIntelligence` membership gate at
`hive.service.ts:862-873`). Same-org boundary enforced via
`Hive.org_entity_id == scenario.org_entity_id` per
ADR-0059 §1 same-org mandate + RULE 0. Orgless scenarios
(`scenario.org_entity_id === null`) and callers with no
in-org memberships return zero `HIVE_CONTEXT` signals.
REMOVED memberships + DISSOLVED hives are filtered out at
the query register, mirroring the
`getHiveIntelligence` ACTIVE-only gate.

7 NEW Wave 7 integration tests cover: signal-presence with
active membership / safe-field-only assertion / orgless
scenario → zero signal / in-org caller without membership →
zero signal / REMOVED membership → zero signal / DISSOLVED
hive → zero signal / confidence widening to MEDIUM with
≥ 2 memberships. Wave 7 baseline 46 → 53. Wave 8 + Wave 9
regression preserved at 43/43 + 58/58 respectively. Typecheck
baseline preserved at exactly 4 canonical residuals.

NO Foundation route change. NO Foundation schema change. NO
new audit literal (existing `ADMIN_ACTION + details.action =
"PLAYGROUND_BEST_PATH_RECOMMENDED"` /
`"PLAYGROUND_SIMULATION_EXECUTED"` discriminator extended
with `HIVE_CONTEXT` in the
`conversation_context_signal_sources` set). NO `HiveService`
mutation (caller-scoped membership read is direct Prisma
mirror of the `ACTION_HISTORY` pattern; no new public
service method introduced). NO Control Tower change (CT
panel already renders the `signal_source_type` badge
verbatim — picks up `HIVE_CONTEXT` for free). NO Layer 4
drilldown surface (Stage 1 / Stage 3 forward-substrate).

Stage 2 source-completion status after this slice:
`CORRECTION_SIGNAL` LIVE / `ACTION_HISTORY` LIVE /
`HIVE_CONTEXT` LIVE / `MANUAL_USER_INPUT` LIVE. All 4 ADR-0078
§3.3 Stage 2 LIVE sources are now wired. The other 4 enum
values (`MEETING_SUMMARY` / `APPROVED_NOTE` /
`GOVERNED_LISTENER_OUTPUT` / `IMPORTED_APPROVED_RECORD`)
remain forward-substrate behind ADR-0078 Stage 1 + Stage 3
authorization at separate slices.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
