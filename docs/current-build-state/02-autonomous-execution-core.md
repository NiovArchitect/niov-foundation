# Section 2 — Autonomous Execution Core

> Detailed canonical record for production Section 2. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

The governed Action runtime: humans / AI Twins propose actions, the
policy evaluator decides (AUTO_APPROVE / REQUIRE_DUAL_CONTROL /
REQUIRE_BREAK_GLASS / FORBIDDEN), approved actions queue through
admission → execution → terminal states, every transition emits a
SAFE-allowlisted audit row on the append-only chain. The
governance seam every future surface (voice, ambient, lens,
desktop edge, Control Tower, MCP connectors) must consume; never
bypass.

Canonical ADR: [`../../architecture/decisions/0057-autonomous-execution-core-substrate.md`](../../architecture/decisions/0057-autonomous-execution-core-substrate.md).

## Current status (PARTIAL — production-grade)

Substrate landed across 9 implementation PRs (#18, #20, #22, #24,
#26, #28, #30, #32, #35) + 6 docs-refresh PRs (#19, #21, #23, #25,
#27, #29, #31). The Action runtime is fully live end-to-end:
create → policy decision → optional dual-control pairing →
scheduler admission → executor claim → in-tick retry →
terminalization → expiry sweep → caller-initiated non-RUNNING
cancellation, with read-side detail + list surfaces for the Action
Inbox UX, and **RECORD_CAPSULE actions now execute through the real
`WriteService.createCapsuleForActionRunner` system-path** producing
real `MemoryCapsule` rows in the source entity's wallet.

**Live `ACTION_*` audit emitters: 10 of 10.** The canonical
ADR-0057 §10 vocabulary is fully wired.

**Real per-`ActionType` handlers: 1 of 3.** RECORD_CAPSULE is the
first and currently only real handler. SEND_INTERNAL_NOTIFICATION
+ PROPOSE_PERMISSION_GRANT remain stubs pending their own future
capability waves.

## What is live

### Live routes

| Method | Path | Auth | Service |
|---|---|---|---|
| `POST` | `/api/v1/actions` | bearer + `write` | `apps/api/src/services/action/action.service.ts` (`createActionForCaller`) |
| `POST` | `/api/v1/actions/:id/cancel` | bearer + `write` | `apps/api/src/services/action/cancel.service.ts` (`cancelActionForCaller`) |
| `GET` | `/api/v1/actions/:id` | bearer + `read` | `apps/api/src/services/action/get.service.ts` (`getActionForCaller`) |
| `GET` | `/api/v1/actions` | bearer + `read` | `apps/api/src/services/action/list.service.ts` (`listActionsForCaller`) |
| `GET` | `/api/v1/org/action-policies` | bearer + `can_admin_org` | `apps/api/src/routes/org.routes.ts` |
| `PUT` | `/api/v1/org/action-policies` | bearer + dual-control gated | `apps/api/src/routes/org.routes.ts` |

### Live services / substrate

- **`apps/api/src/services/action/action.service.ts`** — create-time
  pipeline (idempotency replay → org resolution → envelope build →
  hash → evaluator → branch → Action.create [+ EscalationRequest
  pairing | no-target-rejection] + audit emission + safe response).
- **`apps/api/src/services/action/policy-evaluator.ts`** — pure
  `evaluateActionPolicy` decision oracle (6 autonomy-ladder rungs;
  no DB, no audit, no routes).
- **`apps/api/src/services/action/views.ts`** — `projectActionView`
  safe projection mapper enforcing the ADR-0057 §10 forbidden-fields
  contract by construction.
- **`apps/api/src/services/action/state-machine.ts`** — pure
  transition guard (`assertActionTransition`, `canTransitionAction`,
  `isTerminalActionStatus`, `ActionInvalidTransitionError`).
- **`apps/api/src/services/action/handlers.ts`** —
  `ActionHandlerRegistry` with DI: **RECORD_CAPSULE is now a real
  handler** that unpacks `payload_redacted` through
  `validateRecordCapsulePayload` (single source of truth with the
  create-time validator) and calls
  `WriteService.createCapsuleForActionRunner`. Returns SAFE
  `result_metadata = { handler: "record_capsule", action_type,
  capsule_id, capsule_type }` — NEVER content, payload_summary,
  payload_redacted, content_hash, embedding. SEND_INTERNAL_NOTIFICATION
  + PROPOSE_PERMISSION_GRANT remain stubs returning `result_metadata = {
  handler: "stub", action_type, status: "completed_stub" }`. Future
  capability waves replace each stub with a real handler.
- **`apps/api/src/services/action/action-payload-validators.ts`**
  (NEW in PR #35) — per-`ActionType` create-time payload validator
  dispatcher. `validateRecordCapsulePayload` enforces the
  `CapsuleCreateInput` contract (required fields + bounded content
  size + optional-field shapes). Stub validators no-op for the two
  unland-ed handlers. Dispatcher called from
  `validateCreateActionBody` so 422 INVALID_FIELD fires at
  create-time on malformed RECORD_CAPSULE payload — no malformed
  Action enters the executor queue.
- **`apps/api/src/services/cosmp/write.service.ts`** — adds
  `createCapsuleForActionRunner` system-path variant in PR #35.
  Bypasses session-token validation (gate = Action passed policy
  evaluator + dual-control). Defensive TAR re-check at
  execute-time. Owner-write to actor's wallet with jurisdiction
  cascade + storage upload + embedding + transactional
  CAPSULE_MUTATION_ADD audit carrying `details.action_id`
  back-reference + `session_id: null`. Callable only from the
  action handler registry; no route exposes it. Mirrors the
  canonical `createSystemPermission` system-path precedent.
- **`apps/api/src/services/action/lifecycle.service.ts`** — shared
  transition + audit helpers, `RETRY_BUDGET` constants (LOCK-GAP-1),
  `ATTEMPT_TIMEOUT_MS_DEFAULT = 30_000` (LOCK-GAP-2),
  `LIFECYCLE_FIELD_MAX_CHARS = 200` clamp, `transitionActionStatus`,
  `emitLifecycleAudit`, `createActionAttempt`,
  `terminalizeActionAttempt`, `createActionResult`.
- **`apps/api/src/services/action/executor.ts`** —
  `tickActionExecutor` claims SCHEDULED via `SELECT FOR UPDATE
  SKIP LOCKED`, transitions to RUNNING inside the claim tx
  (early-transition pattern), loops attempts in-tick under
  `withTimeout(handler, attemptTimeoutMs)`, parent stays in
  RUNNING per ADR-0057 §11, terminalizes to SUCCEEDED / FAILED /
  TIMED_OUT.
- **`apps/api/src/services/action/scheduler.ts`** —
  `tickActionScheduler` (APPROVED → SCHEDULED) +
  `tickActionExpirySweep` (SCHEDULED + `expires_at ≤ now` →
  EXPIRED) + `startActionScheduler` / `stopActionScheduler`
  (NO-OP under `NODE_ENV=test`; production registers 30s admission
  + 30s executor + 60s expiry cron tasks via node-cron 4.2.1
  6-field syntax).
- **`apps/api/src/services/action/cancel.service.ts`** —
  caller-initiated non-RUNNING cancellation with ownership check
  + idempotent CANCELLED replay + 403 `RUNNING_CANCEL_PRIVILEGED`
  for RUNNING rows.
- **`apps/api/src/services/action/get.service.ts`** — safe Action
  detail view + `attempt_count` + `last_result_summary` aggregates
  + RULE 0 enumeration-prevention 404 for non-source non-admin
  callers.
- **`apps/api/src/services/action/list.service.ts`** — self-scope
  default + `?org_scope=true` admin path + pagination + enum
  filters + cross-source / cross-org leak prevention at the QUERY
  tier.

### Live audit literals (10 of 10)

- `ACTION_POLICY_UPDATE` (PR #22)
- `ACTION_PROPOSED` (PR #24)
- `ACTION_APPROVED` (PR #24)
- `ACTION_REJECTED` (PR #24)
- `ACTION_SCHEDULED` (PR #26)
- `ACTION_STARTED` (PR #26)
- `ACTION_SUCCEEDED` (PR #26)
- `ACTION_FAILED` (PR #26)
- `ACTION_EXPIRED` (PR #26)
- `ACTION_CANCELLED` (PR #28)

### Live schema

`packages/database/prisma/schema.prisma`:
- `Action` model (PR #18) — 16 columns + 9 indexes.
- `ActionAttempt` model (PR #18) — monotonic `attempt_number` +
  worker_id + `outcome` (`ActionAttemptOutcome`).
- `ActionResult` model (PR #18) — `result_summary` +
  `result_metadata` JSON.
- `ActionPolicy` model (PR #18) — per-(org, action_type,
  risk_tier) tuple.
- `ActionStatus` enum (10 values), `ActionType` enum (3 values),
  `ActionRiskTier` enum (4 values), `ActionDecision` enum (4
  values), `ActionAttemptOutcome` enum (4 values).

## What is NOT live

- **SEND_INTERNAL_NOTIFICATION real handler** — no backing
  notification substrate exists in `apps/api/src/services` (grep
  returned 0 hits for `sendNotification` / `notification.service`
  before the wave). Future wave will need to build the substrate
  from scratch first.
- **PROPOSE_PERMISSION_GRANT real handler** — `createPermission`
  DB query exists at `packages/database/src/queries/permission.ts`;
  the handler crosses multiple entities' DMW boundaries with
  RULE 0 sovereignty implications + MEDIUM-risk default
  REQUIRE_DUAL_CONTROL. Higher blast-radius than RECORD_CAPSULE;
  warrants its own RULE 21 research arc.
- **`RUNNING → CANCELLED` privileged cancellation** —
  `cancel.service.ts` returns 403 `RUNNING_CANCEL_PRIVILEGED`;
  the state-machine permits the edge but no caller drives it.
  Forward-substrate on GOVSEC.5 break-glass substrate (ADR-0050;
  landed) + `AbortController` plumbing.
- **`ActionPolicy.retry_budget` + `ActionAttempt.timeout_ms`
  schema fields** — currently service-tier constants
  (LOCK-GAP-1 + LOCK-GAP-2). Promotion to schema requires a
  Prisma migration QLOCK + cross-language Ecto parity check per
  ADR-0033.
- **Explicit `GET /api/v1/org/actions` route** — currently served
  via `?org_scope=true` on the unified list route. Dedicated
  alias is a separate slice.
- **ActionAttempt detail route** (`GET
  /api/v1/actions/:id/attempts/:attempt_id`) — separate slice.
- **Connectors / MCP** (per ADR-0057 §17 + ADR-0058).
- **Browser automation, native-app automation, voice / Sesame,
  desktop edge UI, wearable lens UX, Control Tower UX**.

## Landed PRs

| PR | Commit | Description |
|---|---|---|
| [#18](https://github.com/NiovArchitect/niov-foundation/pull/18) | `78e7642` | Action schema + 10 audit literals (substrate declaration only) |
| [#19](https://github.com/NiovArchitect/niov-foundation/pull/19) | `82a0d34` | Docs refresh for #18 (schema + audit literals landed) |
| [#20](https://github.com/NiovArchitect/niov-foundation/pull/20) | `489fc60` | Action policy evaluator — pure deterministic decision oracle |
| [#21](https://github.com/NiovArchitect/niov-foundation/pull/21) | `7d6f785` | Docs refresh for #20 (policy evaluator landed) |
| [#22](https://github.com/NiovArchitect/niov-foundation/pull/22) | `da5b328` | Org ActionPolicy admin substrate + `ACTION_POLICY_UPDATE` emitter (5th `PRIVILEGED_ENDPOINTS` entry — first Class B `can_admin_org` privileged route) |
| [#23](https://github.com/NiovArchitect/niov-foundation/pull/23) | `7f30f5b` | Docs refresh for #22 (ActionPolicy admin landed) |
| [#24](https://github.com/NiovArchitect/niov-foundation/pull/24) | `487fce1` | Action create route `POST /api/v1/actions` + `action.service.ts` + first 3 `ACTION_*` emitters (`_PROPOSED` / `_APPROVED` / `_REJECTED`) |
| [#25](https://github.com/NiovArchitect/niov-foundation/pull/25) | `7949841` | Docs refresh for #24 (create route landed) |
| [#26](https://github.com/NiovArchitect/niov-foundation/pull/26) | `fe46e22` | Executor / worker / scheduler lifecycle substrate (`state-machine` + `handlers` + `lifecycle.service` + `executor` + `scheduler` + 5 new `ACTION_*` emitters: `_SCHEDULED` / `_STARTED` / `_SUCCEEDED` / `_FAILED` / `_EXPIRED`) — 4→9 of 10 live |
| [#27](https://github.com/NiovArchitect/niov-foundation/pull/27) | `910b286` | Docs refresh for #26 (lifecycle landed) |
| [#28](https://github.com/NiovArchitect/niov-foundation/pull/28) | `8d9c1bc` | Non-RUNNING cancel route `POST /api/v1/actions/:id/cancel` + `ACTION_CANCELLED` emitter — 9→10 of 10 live; vocabulary fully wired |
| [#29](https://github.com/NiovArchitect/niov-foundation/pull/29) | `1254f6d` | Docs refresh for #28 (cancel route landed) |
| [#30](https://github.com/NiovArchitect/niov-foundation/pull/30) | `8af6f77` | GET viewer route `GET /api/v1/actions/:id` + `SafeActionDetailView` + `attempt_count` + `last_result_summary` aggregates |
| [#31](https://github.com/NiovArchitect/niov-foundation/pull/31) | `bcdacc7` | Docs refresh for #30 (GET viewer landed) |
| [#32](https://github.com/NiovArchitect/niov-foundation/pull/32) | `75933ad` | GET list route `GET /api/v1/actions` + self-scope default + `?org_scope=true` admin path + pagination + enum filters |
| [#35](https://github.com/NiovArchitect/niov-foundation/pull/35) | `4ef4ed4` | **RECORD_CAPSULE real handler capability** — per-`ActionType` payload validators + `WriteService.createCapsuleForActionRunner` system-path + `ActionHandlerRegistry` DI + `server.ts` registry installation; 1 of 3 real handlers LIVE. See [`../build-log/2026-05-29-pr-35-record-capsule-handler.md`](../build-log/2026-05-29-pr-35-record-capsule-handler.md). |

## Founder gap-locks active in this substrate

- **LOCK-GAP-1 (retry budget)** — service-tier constants:
  `RECORD_CAPSULE: 3`, `SEND_INTERNAL_NOTIFICATION: 3`,
  `PROPOSE_PERMISSION_GRANT: 1`. Forward-substrate to
  `ActionPolicy.retry_budget` schema field.
- **LOCK-GAP-2 (per-attempt timeout)** — service-tier constant
  `ATTEMPT_TIMEOUT_MS_DEFAULT = 30_000`. Forward-substrate to
  `ActionAttempt.timeout_ms` schema field.
- **LOCK-GAP-3 (handlers)** — STUB handlers only. Real
  per-`ActionType` handlers are a separate QLOCK.
- **LOCK-GAP-4 (cancel route scope)** — non-RUNNING only.
  RUNNING-cancellation deferred to a future privileged route
  on the GOVSEC.5 break-glass substrate (ADR-0050).
- **LOCK-GAP-5 (expiry sweep)** — included in PR #26. Emits
  `ACTION_EXPIRED` with `decision_reason =
  "expires_at_elapsed"`.

## RULE 13 disclosures specific to Section 2

- **Audit literal vocabulary is closed at 10.** Timeout
  terminalization emits `ACTION_FAILED` with `error_class =
  "EXECUTOR_TIMEOUT"` — not a new `ACTION_TIMED_OUT` literal —
  because the canonical 10-literal vocabulary does not include
  `ACTION_TIMED_OUT`. The `ActionStatus` enum DOES have
  `TIMED_OUT` as a terminal state and `ActionAttempt.outcome`
  records the per-attempt distinction.
- **Parent Action stays in RUNNING through all attempts** per
  ADR-0057 §11 strict reading. The executor loops in-tick
  across the retry budget rather than flipping the parent back
  to SCHEDULED. The canonical legal-edges map intentionally
  omits `RUNNING → SCHEDULED`.
- **Early-transition concurrency pattern**: the executor
  transitions SCHEDULED → RUNNING inside the SKIP LOCKED claim
  tx before releasing the lock. Two parallel `tickActionExecutor`
  calls never produce more than one `ActionAttempt` per Action.
- **Lifecycle audit chain attribution**: scheduler / executor /
  expiry-sweep emissions ride `SYSTEM_PRINCIPALS.SCHEDULER`;
  cancel emissions ride the caller's actor chain
  (`actor_entity_id = callerEntityId`).
- **RULE 0 enumeration-prevention on read paths**: non-source
  non-admin callers on `GET /api/v1/actions/:id` get `404
  ACTION_NOT_FOUND` (same envelope as unknown-id), not 403, so
  a non-admin stranger learns nothing about which `action_id`
  values exist.
- **TAR is authoritative** for `can_admin_org` checks across
  cancel / get / list services (not bearer-token claims) so a
  TAR demote takes effect on the next request.
- **Cross-source leak prevention at the QUERY tier** on the
  list route: the self-scope predicate `{ source_entity_id:
  callerEntityId, deleted_at: null }` ensures other users'
  rows never enter the projection.
- **Cross-org leak prevention at the QUERY tier** on the
  org-scope list path: the `getOrgEntityId(caller)` resolution
  scopes the query to the caller's resolved org so a cross-org
  admin in org B sees ZERO rows from org A.
- **`?org_scope=true` is gated TWICE**: TAR
  (`status === ACTIVE && can_admin_org === true`) + the
  caller's resolved org. Either failure → safe error envelope
  with no row data.
- **Soft-deleted Actions are invisible on read paths**
  (`deleted_at: null` composed AS-AND with every scope
  predicate).
- **Pagination cap at 100** mirrors the
  `MAX_AUDIT_EVENTS_PAGE_SIZE` precedent — a malicious caller
  cannot drain the whole table.
- **Stub handler `result_metadata` is exactly** `{ handler:
  "stub", action_type, status: "completed_stub" }`. No
  payload-derived field appears. **The transition to real
  handlers preserves this no-leak contract — RECORD_CAPSULE's
  real `result_metadata` is exactly `{ handler:
  "record_capsule", action_type, capsule_id, capsule_type }`;
  integration test asserts secret values from both outer
  Action.payload_summary AND inner payload_redacted.content are
  absent from result_metadata + all 3 audit rows.**
- **System-path gating (RECORD_CAPSULE, PR #35)**:
  `WriteService.createCapsuleForActionRunner` bypasses session
  validation; the gate is that the Action passed policy
  evaluator + dual-control before reaching the executor. Audit
  attribution carries `actor_entity_id = source_entity_id` +
  `details.action_id` back-reference for forensic traceability.
  Callable only from the action handler registry — no route
  exposes it. Defensive TAR re-check at execute-time
  (status === ACTIVE + can_write_capsules === true) catches
  any drift between create-time policy decision and
  execute-time mutation.
- **TAR_DEMOTED mapping**: NOT in the closed
  `WriteFailure.code` union. The method returns
  `OPERATION_NOT_PERMITTED` and the handler maps to
  `error_class = "TAR_DEMOTED"`. Audit denial_reason carries
  TAR_DEMOTED separately. Keeps the WriteFailure union closed
  by construction.
- **Synthetic internal PrivilegedEndpoint** used at the create-
  time service for dual-control target resolution. NOT added to
  the live `PRIVILEGED_ENDPOINTS` registry (which holds 5
  entries; Operation E `ORG_ACTION_POLICY_UPDATE` is the only
  Class B `can_admin_org` entry).
- **`risk_tier` is constant-derived per initial `ActionType`**:
  `RECORD_CAPSULE = LOW`, `SEND_INTERNAL_NOTIFICATION = LOW`,
  `PROPOSE_PERMISSION_GRANT = MEDIUM`. No request-supplied
  `risk_tier`.

## Next slices (priority order)

1. **`[ADR-0057-RUNNING-CANCEL-BREAK-GLASS-EXECUTE-VERIFY-AUTH]`**
   — privileged `RUNNING → CANCELLED` cancellation on the
   GOVSEC.5 break-glass substrate (ADR-0050; landed). The
   state-machine already permits the edge; this slice wires a
   separate privileged route that consumes a break-glass grant
   and adds `AbortController` plumbing for mid-attempt handler
   interruption. Substrate-architectural; tier-4 build-log
   entry expected.
2. **`[ADR-0057-ACTIONPOLICY-RETRY-BUDGET-AND-TIMEOUT-SCHEMA-QLOCK]`**
   — promote LOCK-GAP-1 + LOCK-GAP-2 from service-tier
   constants to `ActionPolicy.retry_budget` +
   `ActionAttempt.timeout_ms` schema fields; defaults preserved
   from the current constants. Requires a Prisma migration via
   `db:push:test` per ADR-0025 + cross-language Ecto schema
   parity check per ADR-0033.
3. **PROPOSE_PERMISSION_GRANT real handler** — second real
   per-`ActionType` handler. `createPermission` substrate
   exists at `packages/database/src/queries/permission.ts`;
   MEDIUM-risk default REQUIRE_DUAL_CONTROL; touches multiple
   entities' DMW boundaries with RULE 0 sovereignty
   implications. Own RULE 21 research arc required.
4. **`[ADR-0057-ATTEMPT-DETAIL-ROUTE-EXECUTE-VERIFY-AUTH]`** —
   `GET /api/v1/actions/:id/attempts/:attempt_id` for detail
   drilldown.
5. **`[ADR-0057-ORG-ACTIONS-ROUTE-EXECUTE-VERIFY-AUTH]`** —
   explicit `GET /api/v1/org/actions` route (lower priority;
   `?org_scope=true` on the unified list already covers the
   same need).
6. **SEND_INTERNAL_NOTIFICATION real handler** — requires
   building the notification substrate from scratch (no
   `notification.service.ts` exists in the repo as of PR #35).
   Defer until product clarity on internal-notification
   substrate (in-app vs email vs both).

## Risks / forward-substrate

- The runtime is a **governed-stub lifecycle** — real business
  effects (capsule writes, permission grants, notifications)
  are forward-substrate. Do not overclaim "AI Twins can fully
  execute actions" on real systems; they cannot until per-type
  handlers land.
- The cancel route handles non-RUNNING only. RUNNING-cancellation
  on the break-glass path is forward-substrate; the
  state-machine permits the edge but no caller drives it.
- The executor uses `Promise.race` `withTimeout` — the inner
  promise is fire-and-forget; mid-attempt cancellation requires
  `AbortController` plumbing that lands with the RUNNING-cancel
  slice.
- Voice / ambient / desktop-edge / wearable-lens UX is
  forward product architecture, not backend scope; future UX
  layers MUST consume the governed Action runtime, never
  bypass.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
