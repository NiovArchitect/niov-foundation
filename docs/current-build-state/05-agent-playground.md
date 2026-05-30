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

## Current status (PARTIAL — Waves 1+2 LIVE; first-substrate only)

**Wave 1 ADR LANDED at ADR-0060** (2026-05-30; Founder Sleep
Directive next-section preference #3). The Section 4
prerequisite ("at least one reference handler") is satisfied
by Wave 4 `OutboundWebhookProvider` (PR #73). ADR-0060 locks
the v1 scope as a read-only sandbox-only self-scoped operator
inspector surface.

**Wave 2 implementation LANDED 2026-05-30 (PR #100)** —
3 inspector contracts live behind 3 POST routes; all
sandbox-only; all self-scoped; all read-only.

**RULE 13 substrate-honest disclosure**: Wave 2 is the
**first backend substrate / inspector foundation** for the
long-term Agent Playground product vision (see Purpose). It
is NOT the full Agent Playground product. The 3 v1 inspectors
(policy-evaluator tester + connector dry-run + working-set
inspector) provide the substrate-level primitives that
future scenario-simulation waves will compose; the full
multi-agent enterprise simulation / outcome-comparison /
best-path recommender remains forward-substrate behind
separate Founder authorization at each slice. ADR-0060's
v1 scope is intentionally narrow at the inspector tier;
future ADR amendment or new ADR may broaden the canonical
product framing.

## What is live

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

## Next slices (per ADR-0060 §Forward queue)

1. ~~**Wave 2 — service-tier implementation**~~ — LANDED
   PR #100 2026-05-30. 3 inspector routes + PlaygroundService
   + 17 integration tests + barrel exports + server.ts
   wiring. Zero schema migration; zero new audit literals.
2. **Wave 3 — optional Control Tower frontend consumer**
   (frontend; out of Foundation scope; lives in
   `otzar-control-tower`).
3. **Wave 4+** — broaden ADR-0060 (or land a new product-vision
   ADR) covering the long-term Agent Playground enterprise-
   simulation product surface; then persistent named scenarios
   (separate ADR + schema); multi-agent scenario simulation
   engine; outcome comparison + best-path recommender; governed
   transition from simulation to Action runtime; real-provider
   dry-run (Founder product decision; major safety review).
   Each future wave is its own Founder authorization slice.

## Recommended ADR amendment / new ADR

ADR-0060's v1 scope is intentionally narrow at the inspector
tier and does NOT canonicalize the long-term Agent Playground
product vision (multi-agent scenario exploration, enterprise
decision simulation, outcome comparison, best-path
recommender, governed transition from simulation to Action
runtime). A future ADR amendment OR new product-vision ADR
should land before Wave 3+ implementation so the long-term
vision is on the architectural record and future waves have
a single canonical reference. Author-time recommendation;
requires Founder authorization at the next-section slice.

## Risks / forward-substrate

- Playground "dry-run" must never leak forbidden fields when
  inspecting decisions or working sets.
- Avoid building the playground UI on the Foundation surface;
  it belongs in the Control Tower frontend (Section 9).

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
