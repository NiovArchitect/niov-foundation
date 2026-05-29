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

## Current status (PRODUCTION-GRADE COMPLETE for current internal-only production scope)

Substrate landed across 18 implementation PRs (#18, #20, #22,
#24, #26, #28, #30, #32, #35, #37, #39, #41, #47, #49, #51, #54, #56, #58) + 1 research-arc PR (#53) + 13 docs-refresh
PRs (#19, #21, #23, #25, #27, #29, #31, #36, #38, #40, #45, #48, #50, #52, #55, #57). Section 2 closeout recommended after PR #58 per the Wave 12 wave-close NEXT_ACTION recommendation. The
Action runtime is fully live end-to-end: create → policy
decision → optional dual-control pairing → scheduler admission
→ executor claim → in-tick retry → terminalization → expiry
sweep → caller-initiated cancellation (non-RUNNING unconditional
+ **RUNNING via GOVSEC.5 break-glass grant**), with **complete
read-side surface**: GET Action viewer (PR #30), GET Action
list (PR #32), and GET ActionAttempt detail drilldown
(PR #39). **Two of three `ActionType` handlers are real:**
RECORD_CAPSULE actions execute through
`WriteService.createCapsuleForActionRunner` (PR #35);
PROPOSE_PERMISSION_GRANT actions (PR #41) call existing
`createPermission` and produce real `Permission` rows with
RULE 0 sovereignty enforced in code + canonical
`PERMISSION_CREATED` AuditEvent back-referenced to the
originating action_id. The executor wires an
**AbortController per attempt** so RUNNING-cancel via
break-glass can short-circuit in-flight work promptly. **As of
PR #47 the retry budget and per-attempt timeout are
operator-tunable per (org, action_type, risk_tier) via the
`ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override`
schema fields; the resolved timeout is persisted onto
`ActionAttempt.timeout_ms` for forensic visibility.** **As of
PR #49 those two override fields are reachable from the existing
`PUT /api/v1/org/action-policies` admin write-path** — typed
validator (positive integer or explicit null; non-positive
integer + float + string rejected 422), conditional upsert
spread (undefined preserves existing column value), GET list +
PUT response projections, and `ACTION_POLICY_UPDATE` audit
details carry boolean `_set` flags only (the numeric override
values NEVER appear in audit details; queryable via GET list by
the same admin tier). **As of PR #51 the resolved `timeout_ms`
also surfaces on the per-attempt detail viewer**
(`GET /api/v1/actions/:id/attempts/:attempt_id` →
`SafeActionAttemptView.timeout_ms: number | null`); the
forensic-visibility loop is CLOSED end-to-end (policy →
operator write → audit → list projection → row-level execution
→ per-attempt viewer).

**Live `ACTION_*` audit emitters: 10 of 10.** The canonical
ADR-0057 §10 vocabulary is fully wired.

**Real per-`ActionType` handlers: 3 of 3 LIVE — handler tier
COMPLETE.** RECORD_CAPSULE (PR #35) + PROPOSE_PERMISSION_GRANT
(PR #41) + SEND_INTERNAL_NOTIFICATION-internal-only (PR #56,
Wave 11). The Wave 11 handler is Founder-direction-locked at
internal-only Otzar-native delivery; external providers
(email / SMS / Slack / push) are forward-substrate as
optional adapters per the EmbeddingProvider precedent at
ADR-0043 G3.4 and each future adapter wave requires its own
QLOCK + RULE 21 research arc.

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
| `GET` | `/api/v1/actions/:id/attempts` | bearer + `read` | `apps/api/src/services/action/attempt-list.service.ts` (`listActionAttemptsForCaller`) — paginated SafeActionAttemptView list for one parent Action; `attempt_number` ASC; outcome filter; soft-delete invisibility |
| `GET` | `/api/v1/org/action-policies` | bearer + `can_admin_org` | `apps/api/src/routes/org.routes.ts` (response projects `retry_budget` + `attempt_timeout_ms_override` per PR #49) |
| `PUT` | `/api/v1/org/action-policies` | bearer + dual-control gated | `apps/api/src/routes/org.routes.ts` (allowlist + typed validator extended for `retry_budget` + `attempt_timeout_ms_override` per PR #49 — positive Int or explicit null; `0` / negative / float / string rejected 422 `INVALID_FIELD`) |
| `GET` | `/api/v1/notifications` | bearer + `read` | `apps/api/src/routes/notification.routes.ts` → `apps/api/src/services/notification/notification-read.service.ts` (`listNotificationsForCaller`) — Wave 12; self-scope only; SAFE projection excludes `body_redacted`; pagination + `unread_only` + `notification_class` filters; soft-deleted rows excluded |
| `PUT` | `/api/v1/notifications/:id/read` | bearer + `write` | `apps/api/src/routes/notification.routes.ts` → `markNotificationReadForCaller` — Wave 12; idempotent (no `read_at` re-fire); enumeration-safe 404 on cross-recipient / unknown / dismissed |
| `PUT` | `/api/v1/notifications/:id/dismiss` | bearer + `write` | `apps/api/src/routes/notification.routes.ts` → `dismissNotificationForCaller` — Wave 12; RULE 10 soft-delete (sets `deleted_at`); idempotent enumeration-safe 404 on re-dismiss / cross-recipient |

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
  **As of PR #56 SEND_INTERNAL_NOTIFICATION is a REAL handler**
  that re-runs `validateSendInternalNotificationPayload` then
  calls `NotificationService.createInternalNotification` (NEW
  `apps/api/src/services/notification/notification.service.ts`).
  Enforces RULE 0 cross-org default DENY via `EntityMembership`
  lookup (recipient must be a member of the source's org) +
  recipient `TAR.status === ACTIVE` check. Emits canonical
  `ACTION_SUCCEEDED` audit on success (no new audit literals
  at Wave 11; future per-Notification literals remain
  RULE-20-gated forward-substrate). SAFE
  `result_metadata = { handler: "send_internal_notification",
  action_type, notification_id, recipient_entity_id,
  notification_class, status: "dispatched_internal" }` — NEVER
  body content (kept off the long-lived ActionResult per the
  Founder direction). Service-tier codes mapped to stable
  error_class strings: NOTIFICATION_RECIPIENT_NOT_FOUND /
  NOTIFICATION_RECIPIENT_NOT_ACTIVE /
  NOTIFICATION_CROSS_ORG_DENIED /
  NOTIFICATION_PAYLOAD_INVALID. **Internal-only delivery**
  per Founder direction at
  `docs/research/2026-05-29-send-internal-notification-substrate-research.md`;
  external providers (email / SMS / Slack / push) are
  forward-substrate as optional adapters.
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
  transition + audit helpers, `RETRY_BUDGET` constants
  (LOCK-GAP-1 fallback path), `ATTEMPT_TIMEOUT_MS_DEFAULT = 30_000`
  (LOCK-GAP-2 fallback path), `LIFECYCLE_FIELD_MAX_CHARS = 200`
  clamp, `transitionActionStatus`, `emitLifecycleAudit`,
  `createActionAttempt` (accepts optional `timeout_ms` persisted
  onto the row per PR #47), `terminalizeActionAttempt`,
  `createActionResult`. **PR #47 adds** `resolveRetryBudget(policy,
  action_type)` (returns `policy.retry_budget` when set + positive,
  else the constant) + `resolveAttemptTimeoutMs(policy)` (returns
  `policy.attempt_timeout_ms_override` when set + positive, else
  the 30 000 default). Non-positive override values fall back to
  the constants (operator-misconfiguration guard).
- **`apps/api/src/services/action/executor.ts`** —
  `tickActionExecutor` claims SCHEDULED via `SELECT FOR UPDATE
  SKIP LOCKED`, transitions to RUNNING inside the claim tx
  (early-transition pattern), loops attempts in-tick under
  `withTimeout(handler, resolvedAttemptTimeoutMs)`, parent stays
  in RUNNING per ADR-0057 §11, terminalizes to SUCCEEDED /
  FAILED / TIMED_OUT. **PR #47 adds a per-action `ActionPolicy`
  point-lookup** at retry-loop entry against the composite
  unique key `(org_entity_id, action_type, risk_tier)` selecting
  only the two override columns; the resolved retry budget +
  per-attempt timeout drive the loop and persist onto
  `ActionAttempt.timeout_ms`. `options.attemptTimeoutMs` still
  wins absolutely (test ergonomics preserved). One indexed
  point-lookup per claimed Action; cache is forward-substrate
  per ADR-0036 / ADR-0039 precedent if hot-path contention
  surfaces.
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
  (NEW in PR #39; extended in PR #51 + PR #54) —
  `getActionAttemptForCaller(callerEntityId, actionId, attemptId)`.
  Same authorization spine as `get.service.ts` (source
  self-scope OR can_admin_org-over-same-org; TAR-authoritative;
  RULE 0 enumeration-prevention 404 for non-source non-admin).
  Loads parent Action -> ownership check -> loads ActionAttempt
  (404 ATTEMPT_NOT_FOUND on missing / soft-delete / action_id
  mismatch) -> loads latest ActionResult (may be null when
  outcome != SUCCEEDED) -> projects to SafeActionAttemptView.
  **PR #51 adds `timeout_ms: number | null`** to the projected
  view (the Wave 6 forensic field; null only for attempts that
  landed before PR #47). **PR #54 exports
  `projectActionAttemptView`** so the new attempt-list service
  consumes the same projection. Forbidden-fields contract per
  ADR-0057 §10 enforced by construction.
- **`apps/api/src/services/action/attempt-list.service.ts`**
  (NEW in PR #54) — `listActionAttemptsForCaller(callerEntityId,
  actionId, filters)` + `validateListAttemptsQuery(query)`.
  Same authorization spine as `attempt.service.ts`. Pagination
  (page + page_size; clamped to `[1, MAX_ATTEMPTS_PAGE_SIZE=100]`;
  defaults 1 / 50) + optional `outcome` filter (single value OR
  array) composing AS AND with the action_id scope predicate;
  soft-delete invisibility; sort by `attempt_number` ASC. ONE
  bulk `actionResult.findMany` per page (not per-row); map-by-
  attempt-id with desc-orderBy + set-on-first-encounter for
  latest-only semantics. Reuses `projectActionAttemptView` so
  no-leak projection is identical across detail + list surfaces.

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
- `ActionAttempt` model (PR #18; **extended PR #47**) — monotonic
  `attempt_number` + worker_id + `outcome`
  (`ActionAttemptOutcome`) + nullable `timeout_ms Int?` (PR #47
  — forensic per-attempt timeout-in-force).
- `ActionResult` model (PR #18) — `result_summary` +
  `result_metadata` JSON.
- `ActionPolicy` model (PR #18; **extended PR #47**) — per-(org,
  action_type, risk_tier) tuple + nullable `retry_budget Int?` +
  nullable `attempt_timeout_ms_override Int?` (PR #47 —
  operator-tunable override fields).
- `ActionStatus` enum (10 values), `ActionType` enum (3 values),
  `ActionRiskTier` enum (4 values), `ActionDecision` enum (4
  values), `ActionAttemptOutcome` enum (4 values).
- **`Notification` model** (NEW in PR #56; Wave 11) — internal-only
  governed Otzar-native notification record. 8 columns:
  `notification_id` (PK) + `org_entity_id` +
  `recipient_entity_id` + `source_entity_id` + `action_id`
  (nullable back-link) + `notification_class` (free-form
  string; future enum-promotion per ADR-0021 extension protocol)
  + `body_summary` (1..200 chars) + `body_redacted` (Json nullable,
  ≤4096 byte JSON-stringified) + `created_at` + `read_at`
  (nullable; UNREAD = NULL, READ = timestamped) + `deleted_at`
  (nullable; RULE 10 soft-delete = DISMISSED). 3 indexes:
  (recipient + deleted_at + created_at) for inbox, (org +
  deleted_at) for admin views, (action_id) for back-link
  traversal.

## What is NOT live

- **External notification delivery** (email / SMS / Slack /
  push) — Founder-direction-locked at internal-only for
  sub-phase 1 per the Wave 9 research arc Founder-direction
  block; external providers are forward-substrate as optional
  adapters per the EmbeddingProvider precedent at ADR-0043 G3.4;
  each future adapter wave needs its own QLOCK + RULE 21
  research arc.
- **Receiver-owned opt-out** (`NotificationPreference` model) —
  forward-substrate per the Wave 11 Founder direction's
  "sub-phase 1 minimal" framing. Future per-receiver opt-out
  wave needs its own QLOCK.
- **Admin / cross-recipient notification list path** — Wave 12
  is self-scope only at sub-phase 1 per Founder direction. An
  admin path that surfaces other entities' inbox rows needs its
  own QLOCK + an integration review with the future opt-out
  model (admin readability must not bypass receiver opt-out).
- **Notification detail-view route** — would surface
  `body_redacted` to the recipient. Wave 12 deliberately omits
  this; needs its own no-leak review + a separate Wave (the
  `Notification.body_redacted` column exists per Wave 11, but
  no read-side route projects it).
- **Per-Notification audit literals**
  (`NOTIFICATION_DISPATCHED` / `_DELIVERY_FAILED` /
  `_OPT_OUT_RESPECTED`) — forward-substrate per Wave 9 research
  arc §4 item 5; RULE-20-gated. Wave 11 rides the canonical
  10-literal `ACTION_*` vocabulary with `notification_id` joined
  via `result_metadata` for forensic queries.
- **Active AbortSignal consumption by handlers** — the executor
  wires an `AbortController` per attempt and passes the signal
  through `HandlerActionInput.abort_signal` (PR #37), but the
  current handler set (stubs + RECORD_CAPSULE) is
  short-by-construction and doesn't actively listen. Future real
  handlers that wrap long-running connector work
  (PROPOSE_PERMISSION_GRANT, future MCP/connector handlers) will
  consume the signal to short-circuit promptly on
  RUNNING-cancel-via-break-glass.
- **Explicit `GET /api/v1/org/actions` route** — currently served
  via `?org_scope=true` on the unified list route. Dedicated
  alias is a separate slice.
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
| [#47](https://github.com/NiovArchitect/niov-foundation/pull/47) | `ae01289` | **ActionPolicy retry_budget + ActionAttempt timeout_ms schema fields** — Wave 6 LOCK-GAP-1 + LOCK-GAP-2 promotion from service-tier constants to schema. NEW resolver helpers `resolveRetryBudget` + `resolveAttemptTimeoutMs`; executor adds per-action `ActionPolicy` point-lookup at retry-loop entry; resolved timeout persists onto `ActionAttempt.timeout_ms` for forensic visibility. Non-positive override values fall back to constants (operator-misconfiguration guard). 14 NEW unit + 5 NEW integration tests. Substrate-architectural; tier-4 build-log [`../build-log/2026-05-29-pr-47-actionpolicy-retry-budget-timeout-schema.md`](../build-log/2026-05-29-pr-47-actionpolicy-retry-budget-timeout-schema.md). |
| [#49](https://github.com/NiovArchitect/niov-foundation/pull/49) | `28b2cd8` | **ActionPolicy override admin write-path** — Wave 7 closes RULE 13 drift surfaced post-PR-48: PR #47 added the schema fields but the `PUT /api/v1/org/action-policies` allowlist still rejected the two override fields with 422 UNKNOWN_FIELD. NEW `isOptionalPositiveIntOrNull` helper (positive Int or explicit null; 0 / negative / float / string rejected 422); conditional upsert spread (undefined → preserves existing column value); GET list + PUT response projections gain both columns; audit details gain `retry_budget_set` + `attempt_timeout_ms_override_set` boolean indicators (numeric values NEVER recorded). 10 NEW integration tests + no-leak `KNOWN_LEGITIMATE_HITS` line bumped from 1089 → 1175 (same substrate justification per the entry's own precedent format). Substrate-coherent extension of PR #47; no tier-4 build-log (no new architectural primitive). |
| [#51](https://github.com/NiovArchitect/niov-foundation/pull/51) | `8fa0658` | **ActionAttempt.timeout_ms surfaced on attempt-detail viewer** — Wave 8 closes the Section 2 forensic-visibility loop end-to-end. `SafeActionAttemptView` gains `timeout_ms: number | null`; `projectActionAttemptView` passes the row column through unchanged. 2 NEW integration tests (executor-option-wins case + policy-override-wins-when-option-omitted case) proving the row + projected view agree under both precedence tiers. Same authorization spine as PR #39; null-safe for pre-PR-47 attempts. Substrate-coherent extension of PR #47 + PR #49; no tier-4 build-log (no new architectural primitive). |
| [#54](https://github.com/NiovArchitect/niov-foundation/pull/54) | `470c43c` | **ActionAttempt list route** — Wave 10. NEW `GET /api/v1/actions/:id/attempts` paginated SafeActionAttemptView list. NEW `apps/api/src/services/action/attempt-list.service.ts` (`listActionAttemptsForCaller` + `validateListAttemptsQuery` + `MAX_ATTEMPTS_PAGE_SIZE` + `DEFAULT_ATTEMPTS_PAGE_SIZE`). Pagination clamped to `[1, 100]`; optional `outcome` filter (single value OR array); sort by `attempt_number` ASC; soft-delete invisibility. ONE bulk `actionResult.findMany` per page (not per-row). Reuses `projectActionAttemptView` (now exported from `attempt.service.ts`) so the no-leak projection contract is identical across detail + list. Same authorization spine as PR #39 + PR #51. 16 NEW integration tests. Substrate-coherent extension; no tier-4 build-log (no new architectural primitive). |
| [#56](https://github.com/NiovArchitect/niov-foundation/pull/56) | `e2ebfe8` | **SEND_INTERNAL_NOTIFICATION internal-only real handler** — Wave 11 closes the "2 of 3 real handlers" gap per the Founder-direction-locked product framing at `docs/research/2026-05-29-send-internal-notification-substrate-research.md`. NEW `Notification` Prisma model (8 columns + 3 indexes) + NEW `apps/api/src/services/notification/notification.service.ts` (`makeNotificationService` + `createInternalNotification` with RULE 0 cross-org default DENY via `EntityMembership` lookup + recipient TAR-ACTIVE check + SAFE projection) + NEW `validateSendInternalNotificationPayload` (recipient_entity_id UUID + notification_class 1..64 + body_summary 1..200 + optional body_redacted ≤4096-byte Json) + NEW `makeSendInternalNotificationHandler` factory replacing the stub + executor org_entity_id pass-through + server DI. Internal-only delivery; NO external providers; receiver-owned opt-out + per-Notification audit literals + inbox routes all forward-substrate. 15 NEW unit + 7 NEW integration tests + 9 pre-existing test files updated for the now-real validator. Substrate-architectural; tier-4 build-log [`../build-log/2026-05-29-pr-56-send-internal-notification-handler.md`](../build-log/2026-05-29-pr-56-send-internal-notification-handler.md). |
| [#58](https://github.com/NiovArchitect/niov-foundation/pull/58) | `2acd5c7` | **Notification inbox routes (internal-only read surface)** — Wave 12 Section 2 closeout. NEW `apps/api/src/services/notification/notification-read.service.ts` (`listNotificationsForCaller` + `markNotificationReadForCaller` + `dismissNotificationForCaller` + `validateListNotificationsQuery` + `SafeNotificationView`). NEW `apps/api/src/routes/notification.routes.ts` with 3 routes: `GET /api/v1/notifications` (paginated self-scope; `unread_only` + `notification_class` filters; SAFE projection deliberately omits `body_redacted` + `source_entity_id` + `org_entity_id` + `recipient_entity_id` + `deleted_at`) + `PUT /:id/read` (idempotent; no `read_at` re-fire) + `PUT /:id/dismiss` (RULE 10 soft-delete; idempotent enumeration-safe 404 on re-dismiss). Self-scope only at sub-phase 1; cross-recipient / unknown / dismissed all collapse to enumeration-safe 404 `NOTIFICATION_NOT_FOUND`. 21 NEW integration tests; no schema; no new audit literals; no external side effects. Substrate-coherent extension of PR #56; no tier-4 build-log (no new architectural primitive). |

## Founder gap-locks active in this substrate

- **LOCK-GAP-1 (retry budget)** — **CLOSED at PR #47**. Schema
  promotion landed: `ActionPolicy.retry_budget Int?` overrides
  the service-tier constants (`RECORD_CAPSULE: 3`,
  `SEND_INTERNAL_NOTIFICATION: 3`,
  `PROPOSE_PERMISSION_GRANT: 1`). Null override = constant
  fallback; non-positive override = constant fallback
  (misconfiguration guard).
- **LOCK-GAP-2 (per-attempt timeout)** — **CLOSED at PR #47**.
  Schema promotion landed:
  `ActionPolicy.attempt_timeout_ms_override Int?` overrides the
  service-tier `ATTEMPT_TIMEOUT_MS_DEFAULT = 30_000` constant;
  resolved value persists onto `ActionAttempt.timeout_ms Int?`
  for forensic visibility. Executor option
  (`options.attemptTimeoutMs`) still wins absolutely (test
  ergonomics preserved).
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

> **Section 2 production-grade closeout recommended after PR #58.**
> All items below are intentional future-substrate; none are
> required for current internal-only production readiness. Do
> NOT auto-implement; each item below requires its own Founder
> QLOCK + (where applicable) RULE 21 research arc.

1. **External notification delivery adapters** (email / SMS /
   Slack / push) — forward-substrate as optional adapters per
   the Wave 11 Founder direction. Each future adapter wave
   needs its own QLOCK + RULE 21 research arc. Pluggable
   `NotificationProvider` abstraction would mirror the
   EmbeddingProvider precedent at ADR-0043 G3.4.
2. **Receiver-owned opt-out** (`NotificationPreference` model)
   — RULE 20-gated; integrates with the admin / cross-
   recipient notification list path's design.
3. **Per-Notification audit literals**
   (`NOTIFICATION_DISPATCHED` / `_DELIVERY_FAILED` /
   `_OPT_OUT_RESPECTED`) — RULE 20-gated per Wave 9 research
   arc §4 item 5.
4. **Admin / cross-recipient notification list path** — QLOCK +
   no-leak / opt-out integration review.
5. **Notification detail-view route** (surfaces `body_redacted`)
   — separate no-leak review + QLOCK.
6. **`[ADR-0057-ORG-ACTIONS-ROUTE-EXECUTE-VERIFY-AUTH]`** —
   explicit `GET /api/v1/org/actions` route. Marginal value;
   `?org_scope=true` on the unified list already covers the
   same need. Add only if a Control Tower or Otzar consumer
   explicitly requests the dedicated path.
7. **Active AbortSignal consumption** in future real handlers
   wrapping long-running connector work — the plumbing landed
   in PR #37; consumption is per-handler discipline.
8. **Per-action `ActionPolicy` lookup cache** — ETS-style
   read-optimized cache forward-substrate per ADR-0036 /
   ADR-0039 precedent if hot-path contention surfaces in
   production telemetry. "Measure first" per ADR-0016.

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
