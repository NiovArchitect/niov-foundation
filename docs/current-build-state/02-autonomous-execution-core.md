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

Substrate landed across 12 implementation PRs (#18, #20, #22,
#24, #26, #28, #30, #32, #35, #37, #39, #41) + 8 docs-refresh
PRs (#19, #21, #23, #25, #27, #29, #31, #36, #38, #40). The
Action runtime is fully live end-to-end: create → policy
decision → optional dual-control pairing → scheduler admission
→ executor claim → in-tick retry → terminalization → expiry
sweep → caller-initiated cancellation (non-RUNNING unconditional
+ **RUNNING via GOVSEC.5 break-glass grant**), with **complete
read-side surface**: GET Action viewer (PR #30), GET Action
list (PR #32), and GET ActionAttempt detail drilldown
(PR #39). **Two of three `ActionType` handlers are real:**
RECORD_CAPSULE actions execute through
`WriteService.createCapsuleForActionRunner` (PR #35); **as of
PR #41 PROPOSE_PERMISSION_GRANT actions call existing
`createPermission` and produce real `Permission` rows with
RULE 0 sovereignty enforced in code + canonical
`PERMISSION_CREATED` AuditEvent back-referenced to the
originating action_id**. The executor wires an
**AbortController per attempt** so RUNNING-cancel via
break-glass can short-circuit in-flight work promptly.

**Live `ACTION_*` audit emitters: 10 of 10.** The canonical
ADR-0057 §10 vocabulary is fully wired.

**Real per-`ActionType` handlers: 2 of 3.** RECORD_CAPSULE
(PR #35) + PROPOSE_PERMISSION_GRANT (PR #41) live.
SEND_INTERNAL_NOTIFICATION remains stub — no backing
notification substrate exists in repo; future wave will need
to build the substrate first (in-app vs email vs both is a
product clarity decision).

**Cancel surface: complete for source callers.** Non-RUNNING
cancellation is unconditional for the source entity; RUNNING
cancellation requires an ACTIVE GOVSEC.5 break-glass grant per
ADR-0050 with `action_type = "ACTION_RUNNING_CANCEL"`. On
successful RUNNING-cancel, the grant is marked USED (single-use
enforcement; `BREAK_GLASS_USED` audit), the `ACTION_CANCELLED`
audit carries a `grant_id` back-reference for forensic
traceability, and the executor's abort-registry signal fires so
any in-flight attempt short-circuits.

## What is live

### Live routes

| Method | Path | Auth | Service |
|---|---|---|---|
| `POST` | `/api/v1/actions` | bearer + `write` | `apps/api/src/services/action/action.service.ts` (`createActionForCaller`) |
| `POST` | `/api/v1/actions/:id/cancel` | bearer + `write` | `apps/api/src/services/action/cancel.service.ts` (`cancelActionForCaller` — non-RUNNING unconditional; RUNNING via GOVSEC.5 break-glass grant) |
| `GET` | `/api/v1/actions/:id` | bearer + `read` | `apps/api/src/services/action/get.service.ts` (`getActionForCaller`) |
| `GET` | `/api/v1/actions` | bearer + `read` | `apps/api/src/services/action/list.service.ts` (`listActionsForCaller`) |
| `GET` | `/api/v1/actions/:id/attempts/:attempt_id` | bearer + `read` | `apps/api/src/services/action/attempt.service.ts` (`getActionAttemptForCaller`) |
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
  payload_redacted, content_hash, embedding. **As of PR #41
  PROPOSE_PERMISSION_GRANT is a REAL handler** that re-runs
  `validateProposePermissionGrantPayload` (single source of
  truth) then calls package-level `createPermission` (which
  enforces RULE 0 sovereignty in code: grantor owns capsule;
  LONG_TERM/PERMANENT require PERSON; AI_AGENT cannot grant to
  AI_AGENT) + emits canonical `PERMISSION_CREATED` AuditEvent
  with action_id back-reference. SAFE `result_metadata = {
  handler: "propose_permission_grant", action_type,
  permission_id, bridge_id, capsule_id, grantee_entity_id,
  access_scope, duration_type }` — NEVER conditions content,
  grantor/grantee personal details, or capsule content.
  Sovereignty / not-found / generic errors mapped to stable
  error_class strings (PERMISSION_SOVEREIGNTY_VIOLATION,
  PERMISSION_CAPSULE_NOT_FOUND, PERMISSION_GRANTOR_NOT_FOUND,
  PERMISSION_GRANTEE_NOT_FOUND, PERMISSION_CREATE_FAILED).
  SEND_INTERNAL_NOTIFICATION remains stub returning
  `result_metadata = { handler: "stub", action_type, status:
  "completed_stub" }` pending future capability wave that
  designs the notification substrate.
- **`apps/api/src/services/action/action-payload-validators.ts`**
  (NEW in PR #35; extended in PR #41) — per-`ActionType`
  create-time payload validator dispatcher.
  `validateRecordCapsulePayload` enforces the
  `CapsuleCreateInput` contract.
  `validateProposePermissionGrantPayload` (NEW in PR #41)
  enforces required capsule_id (UUID) + grantee_entity_id (UUID)
  + access_scope (AccessScope enum); optional duration_type
  (DurationType enum), can_share_forward (bool), conditions
  (object). Stub validator no-ops for SEND_INTERNAL_NOTIFICATION.
  Dispatcher called from `validateCreateActionBody` so 422
  INVALID_FIELD fires at create-time on malformed payload —
  no malformed Action enters the executor queue.
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
  caller-initiated cancellation: non-RUNNING unconditional for the
  source entity (ownership check + idempotent CANCELLED replay) +
  **RUNNING via GOVSEC.5 break-glass grant** (validates ACTIVE
  grant for action_type=`ACTION_RUNNING_CANCEL`; marks USED in
  same tx as `BREAK_GLASS_USED` audit; transitions
  RUNNING → CANCELLED; emits `ACTION_CANCELLED` with `grant_id`
  back-reference; fires `abortAction(action_id)` outside the tx
  so in-flight handler short-circuits). Single-use grant
  enforcement; concurrent-race 409 envelopes
  (`BREAK_GLASS_INVALID_TRANSITION` / `ACTION_ALREADY_TERMINAL`).
- **`apps/api/src/services/action/abort-registry.ts`** (NEW in
  PR #37) — process-local Map<action_id, AbortController>.
  `registerActionAbort` / `releaseActionAbort` / `abortAction`.
  Process-local at this phase per ADR-0057 §11 in-process
  executor; future Elixir/BEAM port (ADR-0028 §Forward Queue)
  replaces with distributed signal mechanism.
- **`apps/api/src/services/action/get.service.ts`** — safe Action
  detail view + `attempt_count` + `last_result_summary` aggregates
  + RULE 0 enumeration-prevention 404 for non-source non-admin
  callers.
- **`apps/api/src/services/action/list.service.ts`** — self-scope
  default + `?org_scope=true` admin path + pagination + enum
  filters + cross-source / cross-org leak prevention at the QUERY
  tier.
- **`apps/api/src/services/action/attempt.service.ts`**
  (NEW in PR #39) — `getActionAttemptForCaller(callerEntityId,
  actionId, attemptId)`. Same authorization spine as
  `get.service.ts` (source self-scope OR
  can_admin_org-over-same-org; TAR-authoritative; RULE 0
  enumeration-prevention 404 for non-source non-admin). Loads
  parent Action -> ownership check -> loads ActionAttempt
  (404 ATTEMPT_NOT_FOUND on missing / soft-delete / action_id
  mismatch) -> loads latest ActionResult (may be null when
  outcome != SUCCEEDED) -> projects to SafeActionAttemptView.
  Forbidden-fields contract per ADR-0057 §10 enforced by
  construction.

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
  returned 0 hits for `sendNotification` / `notification.service`).
  Future wave will need to build the substrate from scratch
  (in-app vs email vs both is a product clarity decision).
- **Active AbortSignal consumption by handlers** — the executor
  wires an `AbortController` per attempt and passes the signal
  through `HandlerActionInput.abort_signal` (PR #37), but the
  current handler set (stubs + RECORD_CAPSULE) is
  short-by-construction and doesn't actively listen. Future real
  handlers that wrap long-running connector work
  (PROPOSE_PERMISSION_GRANT, future MCP/connector handlers) will
  consume the signal to short-circuit promptly on
  RUNNING-cancel-via-break-glass.
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
| [#37](https://github.com/NiovArchitect/niov-foundation/pull/37) | `4e3805d` | **RUNNING-cancel break-glass capability** — `abort-registry.ts` process-local `AbortController` map + `executor` register/release per attempt + `HandlerActionInput.abort_signal` widening + cancel.service RUNNING branch validates ACTIVE GOVSEC.5 break-glass grant + marks USED + emits `ACTION_CANCELLED` with `grant_id` back-reference + fires `abortAction` outside tx. Single-use grant enforcement; concurrent-race 409 envelopes. See [`../build-log/2026-05-29-pr-37-running-cancel-break-glass.md`](../build-log/2026-05-29-pr-37-running-cancel-break-glass.md). |
| [#39](https://github.com/NiovArchitect/niov-foundation/pull/39) | `fe8c095` | **ActionAttempt detail route** — `GET /api/v1/actions/:id/attempts/:attempt_id` substrate-coherent read drilldown. SAFE projection of `ActionAttempt` + optional latest `ActionResult`. Same authorization spine as GET viewer (source self-scope OR `can_admin_org`-over-same-org; RULE 0 enumeration-prevention 404). 9 integration tests; no architectural boundary; no tier-4 build-log needed per the wave-based discipline. |
| [#41](https://github.com/NiovArchitect/niov-foundation/pull/41) | `67df915` | **PROPOSE_PERMISSION_GRANT real handler capability** — second real per-`ActionType` handler. NEW `validateProposePermissionGrantPayload` + real handler calling existing `createPermission` (RULE 0 sovereignty enforced in code) + canonical `PERMISSION_CREATED` AuditEvent with action_id back-reference. Error-class mapping for sovereignty / not-found / generic failures. SAFE result_metadata payload-free contract. 11 unit + 7 integration tests. Substrate-coherent extension of Wave 1's ActionHandlerRegistry pattern; no tier-4 build-log (pattern boundary already established by PR #35). |

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

1. **`[ADR-0057-ACTIONPOLICY-RETRY-BUDGET-AND-TIMEOUT-SCHEMA-QLOCK]`**
   — promote LOCK-GAP-1 + LOCK-GAP-2 from service-tier
   constants to `ActionPolicy.retry_budget` +
   `ActionAttempt.timeout_ms` schema fields; defaults preserved
   from the current constants. Requires a Prisma migration via
   `db:push:test` per ADR-0025 + cross-language Ecto schema
   parity check per ADR-0033.
2. **`[ADR-0057-ORG-ACTIONS-ROUTE-EXECUTE-VERIFY-AUTH]`** —
   explicit `GET /api/v1/org/actions` route (lower priority;
   `?org_scope=true` on the unified list already covers the
   same need).
3. **SEND_INTERNAL_NOTIFICATION real handler** — requires
   building the notification substrate from scratch (no
   `notification.service.ts` exists in the repo as of PR #35).
   Defer until product clarity on internal-notification
   substrate (in-app vs email vs both).
4. **Active AbortSignal consumption** in future real handlers
   wrapping long-running connector work — the plumbing landed
   in PR #37; consumption is per-handler discipline.
5. **ActionAttempt list-of-attempts route** — callers can
   query the DB directly via `Action.action_id`; a route
   alias would unlock Control Tower attempt-list UX. No
   architectural boundary; lowest priority among Section 2
   reads.

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
