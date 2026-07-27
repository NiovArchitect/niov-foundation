# OTZAR Action Executor Stuck RUNNING

**Date:** 2026-07-27  
**Status:** ROOT CAUSE IDENTIFIED + REPAIR IN FLIGHT

## Preserved evidence (do not delete)

| Object | ID prefix | Type | Observed state |
|--------|-----------|------|----------------|
| Action | `d8dfa6a0` | RECORD_CAPSULE | RUNNING since ~23:00Z |
| Action | `84b8030d` | SEND_INTERNAL_NOTIFICATION | RUNNING, **zero attempts** |
| Attempt | `7ba5d60a` | attempt #1 | started 23:00:00Z, `ended_at` null, `timeout_ms=30000`, worker `executor:30` |

## Root cause

1. Executor lives **in-process** on `otzar-api` (cron every 30s via `startActionScheduler`).
2. Claim path: `SCHEDULED → RUNNING` then create attempt, then `withTimeout(handler, 30s)`.
3. **`withTimeout` only runs while that Node process is alive.**
4. Deploy / process restart (`executor:30` PID) after claim left:
   - `d8dfa6a0` RUNNING with open attempt past timeout;
   - `84b8030d` RUNNING with **no attempt** (died between promote and attempt create).
5. Subsequent ticks **only claim `SCHEDULED`**, never reconciling stale `RUNNING`.
6. Therefore no terminal state forever — **terminal-state guarantee gap**.

Not a missing Render worker service: worker is the API process. Not a missing queue: Postgres claim.

## Repair

- `tickStaleRunningReconcile`: open attempts past `timeout_ms + 5s` → attempt `TIMED_OUT` (`STALE_WORKER_ORPHAN`); parent requeued `RUNNING→SCHEDULED` if budget remains, else `TIMED_OUT`.
- Promote orphans: `RUNNING` + zero attempts + age > 120s → `TIMED_OUT` (`STALE_PROMOTE_ORPHAN`).
- Cron every 30s alongside executor tick.
- State machine: allow `RUNNING → SCHEDULED` for recovery only.

## Honest disposition of stuck rows

Reconciler marks open attempt timed out with STALE_WORKER_ORPHAN — **not** SUCCEEDED.  
New verified execution is a **separate** action after deploy.
