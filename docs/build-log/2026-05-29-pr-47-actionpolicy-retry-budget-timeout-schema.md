# 2026-05-29 — PR #47 — actionpolicy-retry-budget-timeout-schema

Tier-4 build-log entry per `docs/build-log/README.md`. Qualifies as
tier-4 because it (a) lands a schema change to a Foundation-owned
production model (cross-language ownership boundary), (b) closes
two long-standing Founder gap-locks (LOCK-GAP-1 + LOCK-GAP-2),
and (c) introduces forensic-grade per-attempt timeout persistence
that future Control Tower / Audit Viewer surfaces will consume.

## Why this PR

`[ADR-0057-ACTIONPOLICY-RETRY-BUDGET-AND-TIMEOUT-SCHEMA-QLOCK]`.
Closes the priority-1 forward-substrate item from PR #45's
wave-close docs refresh. Until this PR, the executor's retry
budget and per-attempt timeout were process-tier constants
embedded in `apps/api/src/services/action/lifecycle.service.ts`:

- `RETRY_BUDGET: Readonly<Record<ActionType, number>>` —
  RECORD_CAPSULE: 3, SEND_INTERNAL_NOTIFICATION: 3,
  PROPOSE_PERMISSION_GRANT: 1.
- `ATTEMPT_TIMEOUT_MS_DEFAULT = 30_000`.

Operators could not adjust them per (org, action_type,
risk_tier) without a code redeploy. Wave 6 promotes both to
`ActionPolicy` columns so the existing `PUT /api/v1/org/action-policies`
dual-control admin path can set per-tuple overrides, and adds
`ActionAttempt.timeout_ms` so the timeout in force when each
attempt started is part of the forensic chain.

Founder authorization: 8-hour autonomous protocol; Wave 6 in the
preference order #1 documented in PR #45's NEXT_ACTION refresh;
one coherent capability block per anti-fragmentation directive.

## What landed

**Branch:** `adr-0057-actionpolicy-retry-budget-timeout-schema` (squash-merged + deleted).
**Squash commit:** `ae012896ee80748f8d06417369fe7635d6bea5d9`.
**Diff:** 6 files, 645 insertions / 8 deletions.

### NEW files

- `tests/unit/action-policy-resolvers.test.ts` — 14 unit tests
  for the two resolver helpers. Cases:
  1. `resolveRetryBudget` — null actionPolicy → constant fallback.
  2. `resolveRetryBudget` — undefined actionPolicy → constant fallback.
  3. `resolveRetryBudget` — `retry_budget: null` → constant fallback.
  4. `resolveRetryBudget` — `retry_budget: 1` → 1 (override wins).
  5. `resolveRetryBudget` — override > constant → override wins.
  6. `resolveRetryBudget` — `retry_budget: 0` → constant fallback
     (non-positive guard).
  7. `resolveRetryBudget` — `retry_budget: -3` → constant fallback
     (non-positive guard).
  8. `resolveAttemptTimeoutMs` — null actionPolicy → 30 000 default.
  9. `resolveAttemptTimeoutMs` — undefined actionPolicy → 30 000.
  10. `resolveAttemptTimeoutMs` — `attempt_timeout_ms_override: null`
      → 30 000.
  11. `resolveAttemptTimeoutMs` — override 5 000 (shorter) → 5 000.
  12. `resolveAttemptTimeoutMs` — override 60 000 (longer) → 60 000.
  13. `resolveAttemptTimeoutMs` — override 0 → 30 000 (guard).
  14. `resolveAttemptTimeoutMs` — override -100 → 30 000 (guard).
- `tests/integration/action-policy-overrides.test.ts` — 5
  end-to-end cases against the real Postgres test DB. Each test
  seeds an `ActionPolicy` row with explicit override values then
  drives `tickActionScheduler` → `tickActionExecutor` and asserts
  the resulting `Action.status` / `ActionAttempt` rows:
  1. Policy `retry_budget=1` + `TEST_MARKER_FORCE_FAILURE` →
     exactly 1 ActionAttempt row before terminalization (proves
     the override wins over SEND_INTERNAL_NOTIFICATION's default
     of 3). Regression guard against the constant-only path.
  2. Policy `retry_budget=null` + FAILURE marker → 3 attempts
     (fallback to default).
  3. Policy `attempt_timeout_ms_override=7_777` + executor option
     omitted → `ActionAttempt.timeout_ms` row column reads 7 777.
  4. Policy `attempt_timeout_ms_override=null` + executor option
     omitted → `ActionAttempt.timeout_ms` reads 30 000 (default).
  5. Policy `attempt_timeout_ms_override=7_777` + executor
     `attemptTimeoutMs: 2_222` → row reads 2 222 (executor option
     wins; preserves the existing test-ergonomics precedence).

### MOD files

- `packages/database/prisma/schema.prisma` — three nullable
  additive columns:
  ```prisma
  model ActionAttempt {
    // ...
    timeout_ms     Int?   // ADR-0057 Wave 6
    deleted_at     DateTime?
    // ...
  }
  model ActionPolicy {
    // ...
    retry_budget                Int?   // ADR-0057 Wave 6
    attempt_timeout_ms_override Int?   // ADR-0057 Wave 6
    updated_by                  String @db.Uuid
    // ...
  }
  ```
  All three nullable; existing rows continue functioning under
  the service-tier defaults. No backfill needed; no production
  migration. Applied locally via `npm run db:push:test` per
  ADR-0025; CI applies via its existing dev/test pipeline.
- `apps/api/src/services/action/lifecycle.service.ts` — two new
  pure resolver helpers + `createActionAttempt` widening:
  - `resolveRetryBudget(actionPolicy, action_type)` — returns
    `actionPolicy.retry_budget` when set + positive; else
    `RETRY_BUDGET[action_type]`. Non-positive guard
    (`retry_budget <= 0`) falls back so misconfigured rows
    cannot zero out execution.
  - `resolveAttemptTimeoutMs(actionPolicy)` — returns
    `actionPolicy.attempt_timeout_ms_override` when set +
    positive; else `ATTEMPT_TIMEOUT_MS_DEFAULT` (30 000).
  - `createActionAttempt` extended with optional `timeout_ms`
    parameter; passed through into the row.
- `apps/api/src/services/action/executor.ts` — per-action policy
  resolution at retry-loop entry:
  - `prisma.actionPolicy.findUnique` against the composite unique
    key `(org_entity_id, action_type, risk_tier)` selecting only
    the two override columns. One indexed point-lookup per
    claimed Action.
  - `resolveRetryBudget(matchedPolicy, action.action_type)` →
    drives the `for (i < retryBudget)` upper bound.
  - `resolveAttemptTimeoutMs(matchedPolicy)` → defines
    `resolvedAttemptTimeoutMs`. The existing
    `options.attemptTimeoutMs ?? resolvedAttemptTimeoutMs`
    precedence preserves test ergonomics — callers that pass an
    explicit option still win.
  - `createActionAttempt(tx, { …, timeout_ms: resolvedAttemptTimeoutMs })`
    persists the resolved value on the row.
  - `withTimeout(handler, resolvedAttemptTimeoutMs)` race uses the
    same resolved value.
  - `ATTEMPT_TIMEOUT_MS_DEFAULT` + `RETRY_BUDGET` no longer
    imported directly (consumed transitively through the
    resolvers). Comment lineage at the top of the file preserved.
- `tests/unit/action-policy-evaluator.test.ts` — `policy()` test
  factory updated with `retry_budget: null` +
  `attempt_timeout_ms_override: null` to satisfy the regenerated
  `ActionPolicy` Prisma type.

## Architectural disclosures

### Cross-language ownership

`ActionPolicy` + `ActionAttempt` are TypeScript/Prisma-owned per
ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (Foundation API + COE +
Otzar live in TypeScript; Elixir/BEAM substrate is the future
distributed coordination layer). No `cosmp_router` or
`dbgi_supervisor` Ecto schema consumes these columns yet — the
BEAM substrate's `MemoryCapsule` mirror is per ADR-0033 §Decision
canonical (capsule layer only). The schema fields land on the TS
register only. If a future Elixir/BEAM Action consumer surfaces
(forward-substrate per ADR-0028 §Forward Queue / ADR-0030), an
Ecto mirror would land at that time per the established two-tier
naming pattern.

### Local-tier migration discipline

The schema field landed via:

```
npm run db:push:test
```

per **ADR-0025** authorized dev/test pattern (never bare
`prisma db push`). The pre-commit `.husky/pre-commit` db-push
guard ran and passed. Cross-language ownership produced one
expected friction at local-tier reconciliation: the bare
`prisma db push --accept-data-loss` path would have offered to
drop the Ecto-owned `schema_migrations` + `idempotency_keys`
tables. The canonical `scripts/local-test-db-refresh.sh` per
ADR-0047 PR.3 / ADR-0035 §38 was used to perform the 8-step
refresh that preserves Ecto ownership of those tables. No
production migration is implied by this PR — production schema
changes require a separate explicit Founder QLOCK.

### Per-action policy lookup cost

The executor adds one indexed point-query
(`prisma.actionPolicy.findUnique` against the composite unique
key `(org_entity_id, action_type, risk_tier)`) per claimed
Action. This is the canonical per-request indexed point-lookup
pattern from ADR-0036 (REGULATOR per-request grant lookup) +
ADR-0039 §Sub-decision 4 (CosmpRouter.WalletLookup). At the
current per-tick batch size the additional lookup is
unmeasurable. Cache (ETS-style read-optimized table) is
forward-substrate to a future scale-up wave if hot-path
contention surfaces in production telemetry; the precedent is
ADR-0039 §Sub-decision 5 (CosmpRouter.WalletCache ETS substrate).

### Override precedence preserved

The integration tests pin a three-tier precedence:

1. `options.attemptTimeoutMs` passed directly to
   `tickActionExecutor` wins absolutely (tests use this to keep
   wall-clock test runtime under 1 s).
2. `ActionPolicy.attempt_timeout_ms_override` when positive
   (the new tier).
3. `ATTEMPT_TIMEOUT_MS_DEFAULT` constant (the fallback).

The retry-budget side has a two-tier precedence (no
executor-option override exists, deliberately — retry-budget is
a substrate invariant per ADR-0057 §11):

1. `ActionPolicy.retry_budget` when positive (the new tier).
2. `RETRY_BUDGET[action_type]` constant (the fallback).

### Non-positive guard

Both resolvers reject `<= 0` overrides as misconfiguration and
fall back to the constant. This prevents an operator from
accidentally zeroing out the retry budget or per-attempt timeout
through a stale or partially-populated `ActionPolicy` row. The
guard is exercised explicitly in the unit tests (cases 6 + 7 +
13 + 14).

### Forensic visibility on the audit chain

`ActionAttempt.timeout_ms` is now part of every per-attempt row.
Future Control Tower attempt-detail UI (ADR-0057 §16) can show
"this attempt was started under a 7 777 ms timeout" without
re-querying the `ActionPolicy` row that may have been re-tuned
since the attempt landed. The forensic invariant: the attempt
row records the actual ceiling that governed the
`Promise.race` `withTimeout` decision.

## Risks accepted

- **No production migration** — this is a dev/test schema
  promotion; promoting to production requires a separate
  explicit Founder QLOCK plus an ops runbook update per
  ADR-0047 PR.4 (`docs/operations/deployment-runbook.md`).
- **Per-action policy lookup cost** — explicit performance
  characterization above; cache is forward-substrate if
  measurable.
- **No Elixir/BEAM mirror** — explicit cross-language ownership
  disclosure above; mirror is forward-substrate when a BEAM
  Action consumer surfaces.

## What this PR did NOT do

- Did NOT add a `PUT /api/v1/org/action-policies` body schema
  validator for the two new fields. The existing route's
  validator path accepts the new fields because the Prisma row
  shape is the authoritative contract; a typed validator update
  is forward-substrate if dedicated Control Tower UX needs the
  envelope shape made explicit.
- Did NOT add a new `ACTION_POLICY_UPDATE` audit emission for
  override changes — the existing `ACTION_POLICY_UPDATE`
  emitter from PR #22 already covers updates to the
  `ActionPolicy` row regardless of which columns changed.
- Did NOT cache the per-action lookup. ADR-0036 / ADR-0039 cache
  patterns documented as forward-substrate.
- Did NOT promote the schema to production. Dev/test only.

## Verification

- **CI run:** `26654860118` — 4/4 green.
  - Typecheck (strict 4-error baseline): pass (30s)
  - Unit tier (371 tests): pass (1m 20s)
  - Integration tier (111 tests + 1 skipped): pass (1m 35s)
  - Elixir tier (compile + test): pass (1m 39s)
- **TypeScript baseline:** preserved at exactly 4 canonical residuals.
- **Local pre-push gates:** db-push guard ✓; typecheck baseline 4 ✓;
  RULE 16 no-console ✓; no-leak guard ✓.
- **New unit tests:** 14/14 (resolver helpers).
- **New integration tests:** 5/5 (override end-to-end).
- **Section 2 integration regression (10 files; including the new
  one):** 86 pass + 5 NEW = 91 pass; no regression.
- **mergeStateStatus:** CLEAN; merged via squash; branch deleted.
- **Main HEAD after merge:** `ae012896ee80748f8d06417369fe7635d6bea5d9`.

## Lineage

- Cites: ADR-0057 §11 (idempotency / retries / timeout); ADR-0025
  (Schema-Push-Target Discipline; dev/test migration path);
  ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (cross-language data
  ownership); ADR-0036 + ADR-0039 (per-request indexed
  point-lookup pattern precedent); ADR-0047 PR.3 (canonical local
  test DB refresh script for cross-language ownership);
  ADR-0028 §Forward Queue + ADR-0030 (future Elixir/BEAM Action
  consumer); RULE 4 (audit-before-response, preserved);
  RULE 13 (substrate-honest disclosures in this entry);
  RULE 20 (Founder authorization for this Wave 6 paste).
- Cited by (forward): future Control Tower attempt-detail UX
  (consumes `ActionAttempt.timeout_ms`); future
  `PUT /api/v1/org/action-policies` typed-validator update if
  operator UX surfaces a need; future Elixir/BEAM Action
  consumer if it ever lands; future scale-up wave that adds an
  ETS-style cache for the per-action policy lookup if hot-path
  contention is measured.
- Section file: [`../current-build-state/02-autonomous-execution-core.md`](../current-build-state/02-autonomous-execution-core.md).
