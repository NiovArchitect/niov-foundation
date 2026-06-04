# Collaboration Supervisor

Real BEAM-side counterpart to the Foundation TS wrapper at
`apps/api/src/services/coordination/beam-collaboration-supervisor.service.ts`
(Foundation #289).

Exposes an HTTP boundary so the TS wrapper can observe per-collaboration
supervised state when BEAM is enabled. **Not** a policy authority,
**not** an audit writer, **not** a connector executor.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness probe |
| GET | `/supervised-status/:id` | current supervised view |
| POST | `/supervised-status/:id` | TS pushes an observation |

The `POST` body shape:

```json
{ "state": "REQUESTED", "has_blocked_reason": false }
```

Allowed `state` literals match Prisma's `TwinCollaborationState`:
`REQUESTED`, `ACCEPTED`, `NEEDS_APPROVAL`, `BLOCKED`, `IN_PROGRESS`,
`COMPLETED`, `REJECTED`, `EXPIRED`, `CANCELED`.

The response shape the TS wrapper's `validateBeamResponse` accepts:

```json
{
  "state": "ACCEPTED",
  "next_tick": "AWAIT_TARGET_RESPONSE",
  "has_blocked_reason": false,
  "observed_at": "2026-06-04T00:00:00Z"
}
```

`next_tick` is derived purely from `state + has_blocked_reason` via
`CollaborationSupervisor.NextTick.derive/2`.

## Boot

```sh
# from repo root
mix deps.get
COLLAB_SUPERVISOR_PORT=4001 mix run --no-halt \
  --eval "Application.ensure_all_started(:collaboration_supervisor)"

# Point Foundation at it:
BEAM_RUNTIME_ENABLED=true \
BEAM_RUNTIME_URL=http://localhost:4001 \
  npm run dev
```

## Tests

```sh
cd apps/collaboration_supervisor && mix test
```

Tests cover:

- pure mapping (`NextTick.derive/2` exhaustive)
- state → string round-trip
- idempotent `start_for/2`
- `observe` persists state across calls
- parallel collaborations don't interfere
- HTTP `/health`, 200/404/422 paths

## Safety posture

Per ADR-0026 §5 (BEAM-compatibility patterns), ADR-0028 §Forward Queue
(per-supervised Elixir process), ADR-0034 (testability discipline):

- BEAM observes; TS decides.
- No raw memory / transcripts / chain-of-thought enter this service.
- No audit writes here (RULE 4 stays in Foundation).
- Crashes are recoverable — `DynamicSupervisor` restarts; the next
  TS-side observation re-establishes state.
- Per-collaboration GenServer name registration uses the
  `CollaborationSupervisor.Registry` Registry-based `{:via, ...}` form
  per ADR-0034 Sub-decision 4.
