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

## Current status (PARTIAL — Waves 1+2+3+4+5+6 LIVE; first scenario-tier candidate-generation + outcome-comparison surfaces landed)

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
6. **Wave 7 — best-path recommender with evidence and
   governance findings** — design-only ADR LANDED
   2026-05-31 at ADR-0074. Closed-vocabulary
   recommendation contract consuming Wave 6
   ComparisonResponse; computed-on-read; deterministic
   priority-ladder selection rule with 10 gates + 11th
   deterministic tie-breaker (NEVER a numeric score; NEVER
   a winner declaration; recommendation is ADVISORY ONLY).
   23 sub-decisions locking `BestPathRecommendationResponse`
   shape + `AlternativeConsidered` 6-field shape + 4 closed
   vocabularies (recommendation_reasons 11 + action_transition_readiness
   8 + reason_not_recommended 10 + recommendation_mode 4) +
   canonical "Wave 7 calls Wave 6 internally" decision +
   bounded counts + ADR-0070 §9 legal-advice posture
   inherited verbatim + extended (forbidden: "final
   decision" / "the system decided" / "ranked #1" / "AI
   approved") + mandatory `human_decision_required`
   boolean per §16 + three-method comparison (Option A
   deterministic TypeScript = v1; Option B Python requires
   ADR-0069 §2.4 boundary ADR; Option C BEAM folds into
   Wave 9) + future-generalization strategic context per
   §22 (NOT authorizing personal-life automation /
   consumer Otzar execution / trust-level delegation).
   NO code / NO schema / NO new audit literal at ADR-0074.
   Wave 7 implementation slice (Option A deterministic /
   template-first TypeScript) is forward-substrate behind
   separate Founder authorization.
7. **Wave 8 — governed transition** from selected
   scenario to proposed Action plan (through Section 2
   Action runtime per §4 human-in-the-loop doctrine).
8. **Wave 9 — multi-agent simulation orchestration**
   (consuming ADR-0028 BEAM coordination layer).
9. **Wave 10 — Control Tower frontend consumer**
   (frontend; lives in `otzar-control-tower` repo).

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

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
