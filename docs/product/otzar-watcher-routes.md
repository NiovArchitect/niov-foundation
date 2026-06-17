# Otzar Watcher Routes (Phase 1285-P)

Governed background **watchers** observe the durable work graph over time so
Otzar can notice what humans miss — stale waiting-on, overdue work, unresolved
blockers, work with no next action — and surface it in Blind Spots / chat
without the user having to ask.

A watcher is **not** a UI feature. It is a governed observer:

- reads **scoped** durable state,
- evaluates **deterministic** conditions,
- emits findings **with proof**,
- never mutates work directly (any mutation routes through Foundation policy),
- never sends externally,
- never bypasses RBAC/ABAC,
- never leaks cross-tenant data.

**Foundation is the policy authority. BEAM is advisory/orchestration only.**

## What exists today (LIVE)

| Capability | Location | State |
| --- | --- | --- |
| Deterministic watcher detector | `apps/api/src/services/work-os/watcher.service.ts` `scanWatcherFindings` | LIVE — single detector, two projections |
| Rich watcher feed | `GET /api/v1/work-os/watchers/feed` → `getWatcherFeed` | LIVE (Phase 1285-P) |
| Simpler typed feed (projection) | `GET /api/v1/work-os/blind-spots/feed` → `getBlindSpotFeed` | LIVE (Phase 1285-N) — now projects the shared detector |
| Holistic attention feed | `GET /api/v1/work-os/blind-spots` → `getBlindSpots` | LIVE — status-based + failed-attempt digests |
| Canonical entity resolver | `apps/api/src/services/identity/resolve-entities.ts` | LIVE |
| BEAM dispatch client (HTTP) | `apps/api/src/services/coordination/beam-fabric-client.ts` `dispatchWorkOsEvent` | LIVE — best-effort, never blocking |
| BEAM health probe | `GET /api/v1/otzar/beam/status` | LIVE — probes `${BEAM_RUNTIME_URL}/health` |
| Internal watcher state on ledger | `recordCoordinationOnLedger` → `details.watchers[]` | LIVE — created on BEAM dispatch; `escalation_level: "NONE"` |

## The watcher contract

`WatcherFinding` (see `watcher.service.ts`): `finding_id` (deterministic
`${watcher_type}:${ledger_entry_id}` so duplicates do not spam), `watcher_type`,
`severity`, `title`, `summary`, `org_id`, canonical `owner` / `requester` /
`target` / `related_person`, `source` (system + ledger/message/thread/
relationship keys), `detection` (rule_id + detected_at + age_hours + due_at +
threshold_hours + reason), `recommendation` (next_action + action_kind).

Identity rule: a person is always rendered by **display name**; the `entity_id`
rides only as secondary proof; unresolved entities carry `display_name =
"Unknown entity"` + `unresolved = true`, never a raw UUID as the primary label.

## Detection rules

| Rule | `rule_id` | Condition | Severity | State |
| --- | --- | --- | --- | --- |
| OVERDUE_WORK | `OVERDUE_WORK_V1` | active item, `due_at < now` | HIGH if >7d else MEDIUM | **LIVE** |
| STALE_WAITING_ON | `STALE_WAITING_ON_48H_V1` | requester ≠ owner, no update > 48h | HIGH if >7d else MEDIUM | **LIVE** |
| UNRESOLVED_BLOCKER | `UNRESOLVED_BLOCKER_V1` | active `BLOCKER` ledger entry | HIGH | **LIVE** |
| NO_NEXT_ACTION | `NO_NEXT_ACTION_V1` | no owner (HIGH) or no `next_action` (LOW) | HIGH / LOW | **LIVE** |
| UNANSWERED_ASK | — | thread TASK_REQUEST/QUESTION signal, untracked, unanswered past threshold | — | **DEFERRED** |
| STALE_COMMITMENT | — | active COMMITMENT-type record stale past threshold | — | **DEFERRED** |

Only one finding is emitted per ledger entry — the highest-priority risk
(`OVERDUE_WORK > UNRESOLVED_BLOCKER > STALE_WAITING_ON > NO_NEXT_ACTION`) — so a
single piece of work is never double-counted across groups.

### Why UNANSWERED_ASK and STALE_COMMITMENT are deferred (not faked)

- **UNANSWERED_ASK** needs a reliable thread-signal → Work Ledger linkage with
  an answered/tracked flag. Thread signals exist (`ThreadMessageSignal`,
  `trackThreadSignalAsWork`) but there is no durable "ask was answered" state to
  test against yet. Faking it would invent risk. Schema support needed.
- **STALE_COMMITMENT** needs a first-class COMMITMENT ledger/signal type with a
  movement timestamp. The signal vocab has `COMMITMENT` but the ledger does not
  persist a distinct commitment-movement state. Documented as future.

The feed contract already includes both `watcher_type` literals, so adding them
later changes no wire shape.

## BEAM bridge — Phase 1285-P2 (NOT built; not faked)

BEAM today exposes an HTTP **dispatch** endpoint (`POST /events/work-os`) and a
**health** probe (`/health`), but **no stable watcher-evaluation actor route**.
Therefore Phase 1285-P implements the Foundation deterministic watcher service
and route now; the BEAM bridge is the next slice.

Planned bridge (P2):

```
POST {BEAM_RUNTIME_URL}/beam/watchers/evaluate
  body: { org_id, caller_entity_id, scope: "self"|"team"|"org", event_type?, since? }
  → { findings: WatcherFindingCandidate[] }
```

Even once BEAM evaluates candidates, Foundation remains the policy authority and
MUST: enforce RBAC/ABAC, re-resolve canonical entities, drop unauthorized
findings, attach safe proof, and never expose BEAM process ids / mailbox state /
raw actor internals. `getWatcherFeed` is structured as exactly the contract BEAM
will feed, so the bridge is additive: BEAM produces candidates, Foundation
validates and re-scopes them through the same shape.

`getWatcherFeed` is **BEAM-independent** today — it never calls the BEAM client,
so a BEAM outage cannot break Blind Spots (deterministic Foundation fallback).
