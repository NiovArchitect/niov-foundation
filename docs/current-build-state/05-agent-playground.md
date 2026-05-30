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
   PR #100 2026-05-30.
2. ~~**Wave 3 — long-term product-vision ADR**~~ — LANDED
   2026-05-30 at ADR-0065 (new ADR sitting ABOVE
   ADR-0060 at product-vision tier).
3. **Wave 4 — persistent named scenarios model + safe
   CRUD** (if schema-approved). Add `PlaygroundScenario`
   Prisma model + CRUD routes; RULE 13 + ADR-0025
   schema-push-target discipline; SAFE projection at
   every read; same-org / self-scope at every gate.
4. **Wave 5 — scenario candidate generation contract**.
   Likely fixture / deterministic first; NO LLM autonomy
   unless separately Founder-authorized.
5. **Wave 6 — outcome comparison + scoring rubric**.
   Closed-vocabulary; NO employee scoring.
6. **Wave 7 — best-path recommender** with evidence and
   governance findings.
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
