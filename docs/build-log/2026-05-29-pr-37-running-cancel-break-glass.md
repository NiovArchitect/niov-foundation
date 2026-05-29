# 2026-05-29 — PR #37 — running-cancel-break-glass

Tier-4 build-log entry per `docs/build-log/README.md`. Qualifies as
tier-4 because it (a) introduces a new substrate-architectural
primitive (process-local `AbortController` registry) consumed
across the executor / cancel-service / handler boundary, (b)
crosses the Action ↔ Break-glass governance boundary for the
first time, and (c) lands a complex runtime behavior
(single-use grant + transactional grant-consumption-before-state-
transition + post-tx abort-signal firing).

## Why this PR

[ADR-0057-RUNNING-CANCEL-BREAK-GLASS-EXECUTE-VERIFY-AUTH]. Closes
the priority-1 forward-substrate item from PR #36's wave-close
docs refresh. The state-machine already permitted the
`RUNNING → CANCELLED` edge; the cancel service returned 403
`RUNNING_CANCEL_PRIVILEGED` for RUNNING rows. PR #37 wires the
privileged path: the source caller may cancel a RUNNING action
only when they hold a valid ACTIVE GOVSEC.5 break-glass grant
(ADR-0050; landed) for `action_type = "ACTION_RUNNING_CANCEL"`
within its `valid_from..valid_until` window. The grant is
single-use; on consumption the cancel service marks it USED
(emits `BREAK_GLASS_USED`) and transitions the Action to
CANCELLED (emits `ACTION_CANCELLED` with `grant_id`
back-reference). The executor's per-attempt `AbortController`
is fired so in-flight handler work short-circuits.

Founder authorization: 8-hour autonomous protocol; Wave 2 in
preference order #1; one coherent capability block per
anti-fragmentation directive.

## What landed

**Branch:** `adr-0057-running-cancel-break-glass` (squash-merged + deleted).
**Squash commit:** `4e3805df6de59452c8cecb221f1fb305a4e934f0`.
**Diff:** 7 files, 922 insertions / 31 deletions.

### NEW files

- `apps/api/src/services/action/abort-registry.ts` —
  process-local `Map<string, AbortController>` registry.
  Exports `registerActionAbort(action_id)` / `releaseActionAbort(action_id)` /
  `abortAction(action_id, reason?)` + the test-only
  `_testRegistrySize()` helper. Process-local by design at the
  ADR-0057 §11 in-process executor phase; the comment block at
  the top of the module flags that the future Elixir/BEAM port
  (ADR-0028 §Forward Queue / ADR-0030) must replace this with a
  distributed signal mechanism (Postgres LISTEN/NOTIFY or
  Phoenix.PubSub).
- `tests/unit/action-abort-registry.test.ts` — 8 unit tests
  covering the lifecycle (register → abort → release), idempotent
  release on unknown id, post-release abort no-op, default and
  custom reason propagation through `AbortSignal.reason`.
- `tests/integration/action-cancel-break-glass.test.ts` — 6
  integration tests:
  1. 403 `RUNNING_CANCEL_PRIVILEGED` when caller has no grant
     (Wave 1 regression preserved).
  2. 403 when grant is for a different action_type.
  3. 403 when grant belongs to a different source entity.
  4. 403 when grant is EXPIRED (outside `valid_from..valid_until`).
  5. Happy path: 200 + Action transitioned RUNNING → CANCELLED +
     grant marked USED + `BREAK_GLASS_USED` audit row +
     `ACTION_CANCELLED` audit with `previous_status: RUNNING`,
     `next_status: CANCELLED`, `decision_reason:
     running_cancel_via_break_glass`, `grant_id` back-reference
     + no-leak proof against payload-derived tokens.
  6. Single-use enforcement: USED grant cannot authorize a
     second RUNNING-cancel.

### MOD files

- `apps/api/src/services/action/executor.ts` — wraps each
  handler dispatch with `registerActionAbort(action.action_id)` +
  `.finally(() => releaseActionAbort(action.action_id))` so the
  in-flight attempt's `AbortController` is always released even
  on error/timeout. The `AbortSignal` is passed through
  `HandlerActionInput.abort_signal` so any handler that wraps
  long-running work can listen for `aborted`.
- `apps/api/src/services/action/handlers.ts` —
  `HandlerActionInput` widened with optional `abort_signal:
  AbortSignal`. Current handlers (stubs + RECORD_CAPSULE) don't
  actively listen — they're short-by-construction. The plumbing
  lands now so future real handlers (PROPOSE_PERMISSION_GRANT,
  future connectors) don't require a re-architecture to support
  cancellation.
- `apps/api/src/services/action/cancel.service.ts` — RUNNING
  branch refactored. New flow:
  1. `validateBreakGlassGrant(callerEntityId,
     "ACTION_RUNNING_CANCEL")` — returns the ACTIVE matching
     grant or null. Null → 403 `RUNNING_CANCEL_PRIVILEGED`.
  2. `markBreakGlassUsed(grant.grant_id)` — emits
     `BREAK_GLASS_USED` in the same tx + sets status=USED.
     Throws `BREAK_GLASS_INVALID_TRANSITION` if grant has been
     consumed in a concurrent flow; cancel service translates to
     409 envelope.
  3. `cancelRunningWithGrant(...)` helper — opens its own
     `prisma.$transaction`: re-reads Action row;
     re-asserts state==RUNNING (409 ACTION_ALREADY_TERMINAL on
     race); `assertActionTransition`; updates status=CANCELLED;
     emits `ACTION_CANCELLED` with `grant_id` back-reference +
     `decision_reason: running_cancel_via_break_glass`.
  4. Outside the transaction (on success), calls
     `abortAction(actionId, "ACTION_CANCELLED_VIA_BREAK_GLASS")`
     so the in-flight executor attempt's `AbortSignal` fires.
  - `CancelAuditDetails` interface gained optional `grant_id`.
    `emitCancelAudit` includes it in details when present;
    absent on non-RUNNING cancellations.
  - Exports new constant
    `BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL = "ACTION_RUNNING_CANCEL"`.
- `apps/api/src/index.ts` — barrel re-exports.

## Architectural disclosures

### Grant consumption BEFORE state transition

The cancel service marks the break-glass grant USED **before**
the Action state-machine transition. Rationale: a break-glass
invocation is a high-privilege event; the audit must record the
grant consumption regardless of whether the action transition
actually succeeds (e.g. the action was concurrently terminalized
by the executor between our load and our update). If the
post-grant Action transition fails with `409
ACTION_ALREADY_TERMINAL`, the grant is still consumed — the
single-use semantics deliberately do not give the caller a
second attempt, because that would let them probe for an
exploitable race window.

### Abort-registry process-locality

The registry is a module-level `Map`. The ADR-0057 §11 executor
pattern is a single in-process worker (DB-backed in-process
executor; no external broker). Two consequences:

1. The registry shares memory with both the executor's cron loop
   AND the HTTP request handler that calls cancel.service. No
   IPC needed.
2. If the future Elixir/BEAM port lands distributed workers
   (ADR-0028 §Forward Queue / ADR-0030), this primitive must be
   replaced with a distributed signal mechanism (Postgres
   LISTEN/NOTIFY or Phoenix.PubSub). The module's header comment
   flags this explicitly so future engineers see the boundary.

### AbortSignal plumbed but not actively consumed

Current handlers don't listen for the abort signal:

- The 2 stub handlers (SEND_INTERNAL_NOTIFICATION +
  PROPOSE_PERMISSION_GRANT) return immediately; nothing to
  abort.
- The RECORD_CAPSULE real handler is short-by-construction —
  the inner WriteService work is bounded by storage upload +
  embedding generation + one Postgres transaction. The
  `Promise.race` `withTimeout` in the executor would terminate
  the attempt at the 30s LOCK-GAP-2 ceiling anyway.

The plumbing lands now (rather than in a future per-handler
wave) so future real handlers wrapping long-running connector
work (PROPOSE_PERMISSION_GRANT, future MCP/connector calls)
can adopt cancellation without an executor refactor. RULE 13:
this is explicitly called out as "not live" in the
NOT-LIVE list — clients should not over-claim "running actions
abort immediately on cancel" until a real handler consumes the
signal.

### Single-use enforcement

`markBreakGlassUsed` rejects any non-ACTIVE grant. The
integration test pins this: create one grant, cancel two
distinct RUNNING actions; first succeeds (grant→USED), second
fails 403 because `validateBreakGlassGrant` now returns null
(USED grants don't match the ACTIVE filter). This is the
ADR-0050 contract — one grant authorizes one privileged
operation.

### Concurrent-race envelopes

Two concurrent-race scenarios are handled with clean 409
envelopes (not 500s):

1. Grant consumed in a parallel flow between our
   `validateBreakGlassGrant` and our `markBreakGlassUsed` →
   `markBreakGlassUsed` throws `BREAK_GLASS_INVALID_TRANSITION`
   → cancel service catches → 409
   `BREAK_GLASS_INVALID_TRANSITION` envelope with the latest
   safe Action view.
2. Action terminalized by the executor between our load and our
   update (e.g. executor's SUCCESS / FAILURE / TIMEOUT path
   landed concurrently) → re-read inside the transaction
   detects `status != "RUNNING"` → 409
   `ACTION_ALREADY_TERMINAL` with the latest safe Action view.

### audit chain on successful RUNNING-cancel

```
BREAK_GLASS_USED (grant_id + action_type)
    ↓ (committed in markBreakGlassUsed's tx)
ACTION_CANCELLED (action_id + previous_status: RUNNING +
                  next_status: CANCELLED +
                  decision_reason: running_cancel_via_break_glass +
                  grant_id back-reference)
    ↓ (committed in cancelRunningWithGrant's tx)
[outside tx] abortAction(action_id) fires the AbortSignal
```

Both audit rows are committed before the HTTP response returns
200 (RULE 4 audit-before-response). The `abortAction` call is
fire-and-forget — its return boolean is not consumed because
the action is already committed-CANCELLED; the abort is a
performance optimization for the in-flight attempt, not a
correctness requirement.

## Risks accepted

- **AbortSignal not actively consumed by current handlers** —
  documented in NOT-LIVE; future per-handler waves consume.
- **Process-local registry** — explicit in the module's header
  comment as a design boundary for the in-process executor
  phase.
- **Grant consumed even on Action-transition race** —
  intentional single-use semantics; documented above.

## What this PR did NOT do

- Did NOT implement active AbortSignal consumption in
  RECORD_CAPSULE or the stub handlers.
- Did NOT add a separate privileged route for RUNNING-cancel
  (rides existing `POST /api/v1/actions/:id/cancel`).
- Did NOT add a new audit literal (`BREAK_GLASS_USED` already
  existed per ADR-0050 BG.1; `ACTION_CANCELLED` already existed
  per PR #28).
- Did NOT change the BreakGlassGrant schema (the `action_type`
  field is a free-form String; "ACTION_RUNNING_CANCEL" is just a
  new literal value).
- Did NOT change the cancel route HTTP contract — the new
  behavior is server-side: with a valid grant the caller now
  gets 200 instead of 403.

## Verification

- **CI run:** `26648155347` — 4/4 green.
  - Typecheck (strict 4-error baseline): pass (39s)
  - Unit tier (371 tests): pass (1m 34s)
  - Integration tier (111 tests + 1 skipped): pass (1m 42s)
  - Elixir tier (compile + test): pass (1m 54s)
- **TypeScript baseline:** preserved at exactly 4 canonical residuals.
- **Local pre-push gates:** db-push guard ✓; typecheck baseline 4 ✓;
  RULE 16 no-console ✓; no-leak guard ✓.
- **Unit tests:** 229 pass (8 NEW abort-registry + 221 existing).
- **Section 2 integration tests:** 77 pass across 9 files (6 NEW
  cancel-break-glass + 71 existing).
- **Break-glass regression:** 15 break-glass integration tests
  still pass (BG.2 dual-control seam unchanged).
- **mergeStateStatus:** CLEAN; merged via squash; branch deleted.
- **Main HEAD after merge:** `4e3805df6de59452c8cecb221f1fb305a4e934f0`.

## Lineage

- Cites: ADR-0057 §6 (cancel semantics) + §11 (idempotency /
  retries / timeout / cancellation); ADR-0050 (GOVSEC.5 break-
  glass / time-boxed audit); ADR-0028 §Forward Queue + ADR-0030
  (distributed signal future-substrate); RULE 0; RULE 4
  (audit-before-response); RULE 13 (substrate-honest
  disclosures).
- Cited by (forward): future PROPOSE_PERMISSION_GRANT handler
  wave (will consume AbortSignal); future MCP/connector handler
  waves (will consume AbortSignal); future Control Tower cancel
  UX (consumes `grant_id` back-reference for forensic audit
  views).
- Section file: [`../current-build-state/02-autonomous-execution-core.md`](../current-build-state/02-autonomous-execution-core.md).
