# PR #100 — Section 5 Wave 2 — Agent Playground v1 implementation (first-substrate)

**Date:** 2026-05-30
**Merge commit:** `fd35c62`
**Branch:** `section-5-wave-2-agent-playground`
**ADR:** [ADR-0060](../architecture/decisions/0060-section-5-agent-playground-v1-design.md)
**Section file:** [`05-agent-playground.md`](../current-build-state/05-agent-playground.md)
**Authorization:** Founder Wave 2 authorization 2026-05-30.

## Important framing (READ FIRST)

Wave 2 is the safe **first backend substrate / inspector
foundation** for the long-term Agent Playground product
vision — **NOT the full Agent Playground product**.

The long-term Agent Playground vision:

> *"Agent Playground is the enterprise simulation and
> decision-testing environment where Otzar's AI teammates
> can explore possible strategies, compare outcomes, and
> recommend the best governed path before real execution."*

A Domain General Intelligence surface where the
organization's AI agents / AI teammates run different
enterprise scenarios before real implementation. Multi-
agent scenario exploration; enterprise decision simulation;
comparison of alternative plans; estimation of outcomes /
risks / tradeoffs / dependencies / blockers / cost / timing
/ policy constraints / execution impact; best-path
recommender with reasons + evidence; governed transition
from simulation to Action runtime (only after
approvals/policy checks; humans always in the loop).
Analogous to how DeepMind-style systems can explore many
strategies in a simulated environment before selecting
stronger moves — adapted for the governed enterprise
domain.

Wave 2 ships the inspector primitives (policy evaluator +
connector dry-run + working-set assembly) that future
scenario-simulation substrate will compose. It is built to
be **compatible with** the long-term vision, not a
replacement for it.

ADR-0060's v1 scope is intentionally narrow at the
inspector tier and does NOT canonicalize the long-term
product vision. A future ADR amendment or new
product-vision ADR is recommended before Wave 3+
implementation so the long-term vision is on the
architectural record.

## Why this entry exists

PR #100 lands the first substantive Agent Playground
substrate after ADR-0060's design-only Wave 1. Tier-4
build-log entry per `CURRENT_BUILD_STATE.md` rule:
"complex runtime behavior + first-of-its-kind backend
substrate cluster + cross-section integration boundary
discipline (policy evaluator + connector provider + COE
context assembly)."

## What landed

### 3 v1 inspector routes (`apps/api/src/routes/playground.routes.ts`)

| Route | Inspector | Delegate |
|---|---|---|
| `POST /api/v1/playground/policy-evaluator` | Policy-evaluator scenario tester | Pure `evaluateActionPolicy` from action/policy-evaluator.ts |
| `POST /api/v1/playground/connector-dry-run` | Connector dry-run | `FixtureBasedConnectorProvider` ONLY (production providers unreachable by construction) |
| `POST /api/v1/playground/working-set` | Working-set inspector | `COEService.assembleContext` with SAFE projection stripping raw `content` |

All 3 routes: bearer + `"read"` scope via
`authService.validateSession` per ADR-0060 §3. Local
`bearerFrom` helper + `statusFor` mapping (SESSION_* →
401; OPERATION_NOT_PERMITTED → 403; INVALID_REQUEST →
422; INTERNAL_ERROR → 500).

### PlaygroundService (`apps/api/src/services/playground/playground.service.ts`)

Constructor takes AuthService + COEService + optional
overrides bag (connectorProvider for test injection;
evaluator for test injection). Default constructor
instantiates its own FixtureBasedConnectorProvider —
the production `getConnectorProvider` factory is **NEVER
reachable** from playground code by construction.

9 exported types: `PlaygroundFailureCode` +
`PlaygroundFailure` + `PolicyEvaluatorInput` +
`PolicyEvaluatorSuccess` + `ConnectorDryRunInput` +
`ConnectorDryRunSuccess` + `WorkingSetInspectorInput` +
`WorkingSetInspectorSuccess` + `WorkingSetCapsuleSummary`.

3 inspector methods:

- `runPolicyEvaluator(sessionToken, body)`: validates
  session, binds callerEntityId + org_entity_id from
  session (caller's own identity per RULE 0 self-scope),
  delegates to pure `evaluateActionPolicy`. NO DB writes.
- `runConnectorDryRun(sessionToken, body)`: validates
  session, hard-codes binding_id to a per-call
  `playground-{uuid}` value, FORCES `secret_ref` to null
  (no real env-var name can leak), delegates to
  FixtureBasedConnectorProvider. Response includes
  explicit `provider: "FixtureBasedConnectorProvider"`
  attribution so callers can prove via response shape
  that the call went through fixtures not a real
  provider.
- `runWorkingSetInspector(sessionToken, body)`: validates
  body shape, delegates to COEService.assembleContext
  (read-only path), projects `ContextItem[]` to SAFE
  shape stripping raw `content` field (capsule_id +
  capsule_type + topic_tags only).

### Server wiring (`apps/api/src/server.ts`)

Import PlaygroundService + registerPlaygroundRoutes.
Instantiate `new PlaygroundService(authService, coeService)`
after coeService construction (NO connectorProvider
override — service constructs its own
FixtureBasedConnectorProvider internally). Register
routes adjacent to existing `registerHiveAdminRoutes`
call.

### Barrel exports (`apps/api/src/index.ts`)

PlaygroundService class + 9 type re-exports for the test
surface + future Control Tower frontend consumer.

## Sandbox-only guarantees (verified by 17 integration tests)

| Guarantee | Verification |
|---|---|
| Zero Action / ActionAttempt row creation | `prisma.action.count()` + `prisma.actionAttempt.count()` snapshot equality across policy-evaluator call |
| Zero ConnectorBinding / Notification row creation | `prisma.connectorBinding.count()` + `prisma.notification.count()` snapshot equality across connector dry-run call |
| Zero OtzarConversation / MemoryCapsule row creation | `prisma.otzarConversation.count()` + `prisma.memoryCapsule.count()` snapshot equality across working-set call |
| FixtureBasedConnectorProvider hard-wire | Forced AUTH + TIMEOUT failure tests prove fixture provider is reachable; production `getConnectorProvider` factory is NEVER called from playground code |
| No `secret_ref` leak | Service FORCES `secret_ref: null`; test plants `FAKE_PROD_SECRET` in request body and asserts it never appears in response |
| Working-set SAFE projection | Raw `content` field NEVER serialized; 8 forbidden field substrings asserted absent at wire level (governance_terms, storage_location, content_hash, secret_ref, bridge_id, payload_content, payload_summary) |
| No new playground-specific audit literal | Zero rows with event_type containing "PLAYGROUND" or "INSPECTOR" |
| Zero audit emission from policy-evaluator + connector-dry-run | Snapshot equality before/after both calls |

## Test surface (17 cases)

`tests/integration/playground-wave-2.test.ts`:

| Group | Cases |
|---|---|
| Auth enforcement | 3 (401 without bearer on all 3 routes) |
| Policy-evaluator inspector | 3 (ENVELOPE_INVALID; valid envelope; zero Action/Attempt row) |
| Connector dry-run inspector | 5 (baseline success + attribution; forced AUTH; forced TIMEOUT; zero ConnectorBinding/Notification row; no secret_ref leak) |
| Working-set inspector | 4 (SAFE projection wire-level no-leak; zero conv/capsule row; 422 on missing request_text; 422 on non-positive token_budget) |
| Audit posture | 2 (no playground-specific literal; zero audit rows from policy-evaluator + connector-dry-run) |

## Gates at merge

- TypeScript baseline: 4 canonical residuals preserved.
- Unit tier: 371 tests + anchor regression green.
- Integration tier: 111 baseline + 17 NEW Wave 2 + existing
  Section 3 regressions green.
- Elixir tier: compile + test green.
- No-console anchor + no-leak guard: green.

## What is NOT in this PR (forward-substrate per long-term vision)

### Inspector-tier (ADR-0060 v1 explicit non-goals)

- Agent playground UI surfaces (frontend; lives in
  `otzar-control-tower`).
- Persistent dry-run history.
- Real connector invocation.
- Real Action creation.
- Cross-entity scope.
- AI-generated test scenarios.
- Audit emission on playground reads.

### Long-term Agent Playground product vision (forward-substrate)

- Multi-agent scenario exploration engine.
- Enterprise decision simulation surface.
- Outcome comparison + estimation (outcomes / risks /
  tradeoffs / dependencies / blockers / cost / timing /
  policy constraints / execution impact).
- Best-path recommender with reasons + evidence.
- Governed transition from simulation to Action runtime
  (only after approvals/policy checks; never autonomous
  execution from playground).
- Persistent scenario memory.
- Domain General Intelligence orchestration inside the
  enterprise domain.
- Real autonomous execution from playground (explicitly
  forbidden at every wave — humans always in the loop).
- Organizational scoring / employee surveillance
  (explicitly forbidden per ADR-0052 doctrine).
- Live external tool calls / production provider calls
  (sandbox-only at every wave; real execution goes through
  Section 2 Action runtime with full governance).

## Recommended next step

**ADR-0060 broadening or new product-vision ADR** before
Wave 3+ implementation so the long-term Agent Playground
vision (enterprise simulation + multi-agent scenario
exploration + outcome comparison + best-path recommender +
governed transition from simulation to Action runtime) is
on the architectural record. Wave 2's inspector primitives
compose into that future substrate; Wave 3+ implementation
needs the broader canonical reference.
