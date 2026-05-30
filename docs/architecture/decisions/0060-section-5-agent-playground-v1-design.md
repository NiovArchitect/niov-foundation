# ADR-0060: Section 5 Agent Playground v1 Design Boundary

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SLEEP-DIRECTIVE-SECTION-5-AGENT-PLAYGROUND-V1-ADR-AUTH]`
(per Founder Sleep Directive 2026-05-30 next-section preference
#3: "Section 5 Agent Playground — research/design only unless
substrate-safe").

This is the **Section 5 Wave 1 contract ADR**. It is
design-only: locks the v1 scope for the operator-facing
playground surface; explicitly defers all UI surfaces to
Control Tower frontend (`otzar-control-tower`); locks the
substrate-safe Foundation contracts a future playground UI
will consume. **No code, no new routes, no schema migration,
no new audit literal** in this phase.

## Context

ADR-0052 doctrine includes operator clarity tooling:
*"Otzar can proactively prepare, coordinate, and recommend
inside scope; it executes sensitive actions only under
permission, policy, or approval."* The playground is the
operator-side companion: operators inspect what Otzar WOULD
do before authorizing real execution.

Substrate-honest Phase 0 verification (2026-05-30):

- **Section 4 connector substrate** is LIVE through Wave 7;
  `OutboundWebhookProvider` is a real reference handler
  (Wave 4 PR #73). Section 5's prerequisite "Section 4 lands
  at least one reference handler" is satisfied.
- **`evaluateActionPolicy` is a pure function** at
  `apps/api/src/services/action/policy-evaluator.ts:279`. It
  takes an `EvaluateActionPolicyInput` (action_type +
  risk_tier + policy_envelope) and returns
  `ActionDecisionResult` (a discriminated union with
  decision + reason). No DB writes, no audit emission, no
  side effects. This is the ideal seam for a dry-run policy-
  scenario tester.
- **`FixtureBasedConnectorProvider`** (Section 4 Wave 1) is
  a deterministic provider with 8 forced-failure fixture
  keys. A dry-run connector invocation against the Fixture
  provider is by-construction safe (no real HTTP).
- **`COE.assembleContext`** at
  `apps/api/src/services/coe/coe.service.ts` is the governed
  working-set constructor (ADR-0048). A dry-run inspector
  would call it with a synthetic query + return
  context_items + transparency without persisting.
- **No existing `/api/v1/playground/*` route surface** —
  greenfield.
- **Section 5 doc** (`docs/current-build-state/05-agent-playground.md`)
  explicitly says: "Avoid building the playground UI on the
  Foundation surface; it belongs in the Control Tower
  frontend (Section 9)." Foundation owns the safe backend
  inspector contracts; the frontend lives in
  `otzar-control-tower`.

## Decision

Foundation will canonicalize Section 5 Agent Playground v1
as a **read-only, sandbox-only, self-scoped operator
inspector surface**. v1 locks three substrate-safe inspector
contracts the Control Tower frontend will consume. v1 ships
NO code (per Founder Sleep Directive "research/design only
unless substrate-safe" + the conservative interpretation that
new route registration is itself a substrate change warranting
its own implementation slice).

### 1. v1 scope lock

**v1 Agent Playground is**: a set of Foundation-side
inspector endpoints that let an authenticated operator
preview Otzar's governed decision-making against synthetic
inputs **without any persistence, audit emission, or side
effect**. The three inspector contracts:

- **Policy-evaluator scenario tester**: caller submits a
  synthetic `EvaluateActionPolicyInput`; Foundation returns
  the `ActionDecisionResult` (decision + reason). Pure
  function dispatch; zero side effects.
- **Connector dry-run invoker**: caller submits a synthetic
  `ConnectorInvocation` payload; Foundation routes through
  the `FixtureBasedConnectorProvider` ONLY (never a real
  provider) and returns the `ConnectorResult`. Zero side
  effects (the Fixture provider is in-memory).
- **Working-set inspector**: caller submits a synthetic
  query + role-template + recent-correction-signal context;
  Foundation calls `COE.assembleContext` and returns the
  governed working-set projection (items_loaded + skipped +
  transparency fields per ADR-0051). NEVER persists a
  conversation; NEVER fires audit; reads ONLY the caller's
  own permissioned capsules per RULE 0.

### 2. v1 explicit non-goals

Each is forward-substrate behind separate Founder
authorization:

- **Playground UI surfaces** — frontend; lives in
  `otzar-control-tower`. Foundation does NOT own the React
  components.
- **Persistent dry-run history** — no Prisma model; no
  audit row. Every dry-run is ephemeral. (Future
  forward-substrate could persist named scenarios as a
  separate slice with its own ADR.)
- **Real connector invocation in dry-run** — Section 4
  Waves 4/7 production providers (OutboundWebhookProvider)
  MUST NOT be reachable from the playground. v1 hard-wires
  `FixtureBasedConnectorProvider` only.
- **Real Action creation in dry-run** — the playground
  policy tester is the EvaluateActionPolicy pure-function
  layer; it does NOT call `createActionForCaller`. No
  database write occurs.
- **Cross-entity scope** — caller's own RULE 0 scope only;
  the playground never inspects another entity's working
  set, corrections, twin config, or permissions.
- **Production policy override** — the playground returns
  WHAT the evaluator WOULD say; it does NOT change what the
  evaluator says for real Actions. No production policy
  mutation.
- **Side-effect-bearing TwinConfig edits** — the playground
  surface is read-only; TwinConfig admin lives on its
  existing routes (`getMyTwin` + future TwinConfig admin
  routes).
- **AI-generated suggestions for what to test** — the
  playground exposes substrate; it does NOT recommend tests
  via LLM. Operators construct their own scenarios.
- **Auditing of playground reads** — by intentional
  design, playground reads do NOT emit audit rows (zero side
  effects). This is justified by: (a) all 3 v1 inspectors
  use pure-function / fixture / read-only substrate that
  doesn't touch privileged data beyond the caller's own
  RULE 0 scope; (b) audit emission would couple the
  inspector tier to the audit chain unnecessarily; (c)
  operators inspecting their own scope is not a
  privileged action. Future: if any v1 surface evolves to
  reach beyond pure-fixture data, audit emission becomes
  required at THAT slice's authorization. RULE 4 is
  satisfied at v1 because no privileged read occurs.

### 3. Behavior the service tier MUST enforce at v1 (when implemented)

These are substrate-derivable from existing ADRs (RULE 0 +
ADR-0048 + ADR-0057 §10) and lock the Wave 2 implementation
contract:

- Caller authentication via bearer + `read` scope (mirrors
  Wave 2C `/otzar/conversations/:id/corrections` pattern).
- Self-scope enforcement: each inspector resolves the
  caller's entity_id from the session; all queries scope
  to that entity_id's wallet / capsules / conversations.
- Connector dry-run hard-wires `FixtureBasedConnectorProvider`;
  the production `getConnectorProviderAsync` MUST NOT be
  called from the playground service.
- Policy tester invokes `evaluateActionPolicy` directly with
  the synthetic input; never reaches into the
  `createActionForCaller` path.
- Working-set inspector calls `COE.assembleContext` with a
  flag (or via a dedicated test-mode entry point) that
  ensures no `OtzarConversation` row is created.
- All responses use SAFE projection patterns per ADR-0051
  transparency + ADR-0058 §7 drift-signal precedent:
  closed-vocabulary labels + counts + reason codes; never
  raw capsule payload / prompts / chain-of-thought.

### 4. NO schema migration at v1

The playground is read-only / fixture-only / pure-function.
No Prisma model added; no column added; no enum added.

### 5. NO new audit literal at v1

Per §2's intentional non-goal of audit emission for
playground reads. If a future slice evolves the playground
to reach beyond pure-fixture/own-scope data, that slice
adds the audit emission per the canonical `ADMIN_ACTION +
details.action` discriminator pattern.

### 6. Wave 1 deliverable (this ADR)

This commit lands:

- NEW `docs/architecture/decisions/0060-section-5-agent-playground-v1-design.md`
  (this file).
- ADR catalog entry in `docs/architecture/README.md`.
- Substrate-honest update in
  `docs/current-build-state/05-agent-playground.md`
  reflecting Section 4 prerequisite satisfied + Wave 1
  ADR LANDED.
- Master + baton refresh.

**NO code changes. NO schema migration. NO new routes. NO
new audit literal. Wave 1 is pure design per Founder Sleep
Directive Section 5 scope.**

### 7. Founder Authorization checkpoints required before Wave 2 implementation

Each is substrate-derivable per §3 above but the Wave 2
implementation slice needs Founder confirmation:

1. **Inspector surface confirmation** — v1 ships the 3
   inspectors (policy tester + connector dry-run + working-
   set inspector). Founder confirms or adjusts the set.
2. **Audit posture confirmation** — v1 deliberately omits
   audit emission per §2. Founder confirms this aligns
   with operator-observability requirements.
3. **Route prefix confirmation** — `/api/v1/playground/*`
   vs `/api/v1/preview/*` vs `/api/v1/sandbox/*`. Naming
   is a small product decision worth a Founder lock.
4. **Fixture-provider hard-wire confirmation** — the
   connector dry-run MUST NOT reach real providers.
   Founder confirms this constraint.

## Consequences

### Easier after Wave 1

- Section 5 has an authoritative scope canonical for the
  first time. Future implementation slices reference this
  ADR.
- The intentional "no audit emission" decision is
  documented + justified, so future code review can hold
  the line.
- Section 4 substrate's reference handler (OutboundWebhookProvider)
  + FixtureBasedConnectorProvider both naturally compose
  into the v1 inspector contracts.

### Harder after Wave 1

- Operators who expect richer playground features
  (real-provider dry-run, persistent scenario history,
  AI-suggested test scenarios) get explicit "forward-
  substrate" disclosure rather than partial implementations.
- Wave 2 implementation will need to hard-wire
  `FixtureBasedConnectorProvider` in a new
  `PlaygroundConnectorService` — a small architectural
  decision that prevents accidental real-provider reach.

### Substrate-state catches resolved

- The Section 5 doc's "forward-substrate beyond Section 4"
  premise is now resolved: Section 4 IS substrate-complete,
  so Section 5 ADR can land.
- The Section 5 doc's "avoid building the playground UI on
  the Foundation surface" guidance is now canonical at the
  ADR register.

## Forward queue

- Wave 2 implementation: NEW
  `apps/api/src/services/playground/playground.service.ts`
  with 3 inspector methods. NEW `apps/api/src/routes/playground.routes.ts`
  with 3 routes (`POST /api/v1/playground/policy-evaluator`
  + `POST /api/v1/playground/connector-dry-run` + `POST
  /api/v1/playground/working-set`). 9+ unit/integration
  tests covering: bearer required; self-scope only;
  fixture-only connector wiring; pure-function policy
  tester behavior; working-set inspector returns transparency
  without persistence; no audit emission verification.
- Wave 3: optional Control Tower frontend consumes Wave 2
  routes (frontend; out of Foundation scope).
- Wave 4+: persistent named scenarios (separate ADR +
  schema); AI-suggested test scenarios (Founder product
  decision); real-provider dry-run (Founder product
  decision; major safety review).

## Bidirectional citations

- Cites ADR-0048 (COE personalization-orchestration substrate;
  v1 working-set inspector consumes).
- Cites ADR-0051 (chat transparency SAFE projection; v1
  pattern source).
- Cites ADR-0052 §"proactivity vs autonomy" doctrine.
- Cites ADR-0057 §10 (Action runtime + policy evaluator
  pure-function seam).
- Cites ADR-0058 §7 (drift-signal SAFE projection pattern
  mirror).
- Cites RULE 0, RULE 4, RULE 13, RULE 14, RULE 20.
- Founder authorization explicit at
  `[FOUNDER-SLEEP-DIRECTIVE-SECTION-5-AGENT-PLAYGROUND-V1-ADR-AUTH]`
  per Founder Sleep Directive 2026-05-30.
