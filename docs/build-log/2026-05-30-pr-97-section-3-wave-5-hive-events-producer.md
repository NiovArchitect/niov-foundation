# PR #97 — Section 3 Wave 5 v1 — Hive Events producer substrate

**Date:** 2026-05-30
**Merge commit:** `056c7c7`
**Branch:** `section-3-wave-5-hive-events-producer-implementation`
**ADR:** [ADR-0064](../architecture/decisions/0064-section-3-hives-wave-5-events-producer-substrate.md)
**Companion design PR:** [#96](https://github.com/NiovArchitect/niov-foundation/pull/96)
**Section file:** [`03-hives-team-intelligence.md`](../current-build-state/03-hives-team-intelligence.md)
**Authorization:** Founder Wave 5 authorization (2026-05-30)
covering both the ADR + the contingent producer-only
implementation if substrate-safe.

## Why this entry exists

PR #97 lands ADR-0064's producer-only Layer 1 substrate: a
pure-substrate Foundation TypeScript module wrapping Node's
built-in `node:events.EventEmitter` + a 4th optional
HiveService constructor arg + 5 publish call sites + 13
integration tests. Closes the producer half of both
ADR-0059 §Forward queue Wave 5 + ADR-0039 §Forward queue
entry #28. Tier-4 build-log entry per
`CURRENT_BUILD_STATE.md` rule: "complex runtime behavior +
cross-section RULE 0 enforcement + substrate-honest
framing requiring full documentation."

## Substrate-honest framing recap

The wave title says "Phoenix.PubSub" but the v1
implementation is NOT Phoenix.PubSub. Phase 0 reconnaissance
verified that Phoenix.PubSub is LIVE in `dbgi_supervisor`
(Elixir) at `apps/dbgi_supervisor/mix.exs:76`, initialized
at `DbgiSupervisor.Application:120-126`, currently
consumed only by PresenceTracker for CRDT join/leave
events. HiveService is in TypeScript at
`apps/api/src/services/hive/hive.service.ts`. Getting
events from TS to BEAM-side Phoenix.PubSub crosses
languages — that's a cross-language substrate-architectural
paste that fires RULE 21.

**ADR-0064 resolved the gap by separating concerns**:
- **Wave 5 v1**: Foundation TypeScript internal event spine
  using Node's built-in `EventEmitter`. In-process only.
  No cross-language wire. **RULE 21 does NOT fire**.
- **Forward-substrate** (future slice): cross-language
  bridge from this TS event spine to BEAM-side
  Phoenix.PubSub. Protobuf extension + gRPC method + Elixir
  handler. **RULE 21 WILL fire at that slice**.

The TS-side abstraction is naming-neutral (`HiveEventBus`
not `PhoenixPubSubAdapter`) so the bridge can be added
later without renaming consumers.

## Producer matrix

| Event | Call site | source_action | When emitted |
|---|---|---|---|
| `HIVE_CREATED` | `createHive` | `"createHive"` | After `HIVE_CREATED` audit emission |
| `HIVE_MEMBER_ADDED` | `inviteToHive` | `"inviteToHive"` | After `HIVE_MEMBER_ADDED` audit emission |
| `HIVE_MEMBER_REMOVED` | `removeMember` | `"removeMember"` | After `HIVE_MEMBER_REMOVED` audit emission (creator-self-remove path) |
| `HIVE_MEMBER_REMOVED` | Wave 3 `forceRemoveMember` | `"forceRemoveMember"` | After `HIVE_MEMBER_REMOVED` audit emission (admin force-remove path) |
| `HIVE_DISSOLVED` | Wave 3 `dissolveHive` | `"dissolveHive"` | After `ADMIN_ACTION + HIVE_DISSOLVED` audit; **NOT on idempotent already-DISSOLVED path** |
| `HIVE_AGGREGATE_BUILT` | `buildHiveAggregate` | `"buildHiveAggregate"` | After `HIVE_AGGREGATE_BUILT` audit emission |

`HIVE_GOVERNANCE_ZERO_STATE` named at ADR-0064 vocabulary
but **DEFERRED** at v1 wiring per Founder "only if safe
and not noisy" — zero-state paths fire on every
`getHiveIntelligence` read; emitting per-read events would
be high volume without a clear consumer use case.

## Pure-substrate module (`apps/api/src/services/hive/hive-events.ts`)

Five public exports + one class + private state:

- **`HIVE_EVENT_NAMES`** (`as const`) — closed vocabulary
  of 5 v1 event names.
- **`HiveEventName`** — literal-union type derived from the
  `as const` array.
- **`HiveEventEnvelope`** — typed shape; **forbidden
  fields enforced by type construction** (the interface
  does not include `governance_terms`, `aggregate_capsule_id`,
  raw capsule content, wallet/permission internals,
  embeddings, storage locations, content hashes, secret
  refs, bridge IDs, session tokens, IP addresses, etc.).
- **`orgTopic(orgEntityId)`** — canonical org-scoped topic
  name builder.
- **`hiveTopic(hiveId)`** — canonical hive-scoped topic
  name builder.
- **`HiveEventBus`** class wrapping `node:events.EventEmitter`:
  - `publishHiveEvent(envelope)` — fire-and-forget on
    both topics in parallel; **separate try/catch per
    topic** so a hive-scoped subscriber throw cannot
    prevent the org-scoped publish (and vice versa).
  - `subscribe(topic, handler)` — returns unsubscribe
    closure for deterministic test teardown + future
    consumer lifecycle management.
  - `setMaxListeners(0)` to suppress Node warnings during
    test churn (internal-only; not a security knob).

**No database reads.** **No external IO.** **No network.**
**No file IO.** Pure in-process event distribution within
one Node process.

## HiveService wiring

Constructor signature change:

```ts
export class HiveService {
  constructor(
    private readonly authService: AuthService,
    private readonly encryption: ContentEncryption,
    private readonly contentStore: ContentStore,
    private readonly eventBus?: HiveEventBus,
  ) {}
}
```

**4th arg is optional** to preserve backward-compat with
every Wave 2/3/4 test fixture (all of which instantiate
`new HiveService(auth, enc, store)` without an event bus).
When `eventBus === undefined`, every publish is a no-op
(centralized in the private `emitHiveEvent` helper:
`this.eventBus?.publishHiveEvent(envelope)`).

Publish-call ordering at each site: **AFTER** the
state-changing prisma transaction commits, **AFTER** the
existing audit row is written, **BEFORE** returning the
success response. This sequencing means:

- A failed state transition emits no event (publishes are
  unreachable below early returns).
- A failed audit emission throws before reaching the
  publish (existing behavior; matches ADR-0002 audit-chain
  integrity discipline).
- A subscriber throw cannot retroactively undo the state
  change (fire-and-forget; handler failure swallowed at
  the bus tier).

## Barrel exports

`apps/api/src/index.ts` extended with:

```ts
export {
  HiveEventBus, HIVE_EVENT_NAMES,
  hiveTopic, orgTopic,
} from "./services/hive/hive-events.js";
export type {
  HiveEventName, HiveEventEnvelope,
} from "./services/hive/hive-events.js";
```

Enables `import { HiveEventBus } from "@niov/api"` at the
test surface + future consumer-slice surface.

## SAFE payload projection no-leak verification

Test plants `internal_policy_note: "WAVE_5_GOVERNANCE_LEAK_MARKER"`
inside `governance_terms`, executes the full producer path
(createHive + inviteToHive + buildHiveAggregate), serializes
every received envelope to JSON, and asserts:

- The secret marker substring is absent.
- `governance_terms` substring is absent.
- `aggregate_capsule_id` substring is absent.
- `storage_location` substring is absent.
- `content_hash` substring is absent.
- `secret_ref` substring is absent.
- `bridge_id` substring is absent.
- `payload_summary` substring is absent.
- `payload_content` substring is absent.

This wire-level no-leak guarantee complements the
type-construction guarantee (the interface forbids these
fields at compile time; the test verifies at runtime).

## Cross-org topic isolation

Test creates two orgs (A and B), subscribes a recorder to
`orgTopic(orgA.entity_id)`, then executes a full
createHive + inviteToHive flow in org B. Org A's recorder
must see ZERO events. This proves the topic-schema
construction enforces RULE 0 same-org sovereignty by
construction — the `org_entity_id` field in every envelope
is derived from the Hive row (`hive.org_entity_id!`), never
from caller context. A subscriber on org A's topic cannot
receive events from org B's hive because the publish path
emits to `orgTopic(hive.org_entity_id)` which is org B's
topic name.

## Test surface (13 cases)

`tests/integration/hive-wave-5-events-producer.test.ts`:

| Group | Cases | Coverage |
|---|---|---|
| HIVE_CREATED publish | 2 | org-scoped topic with full envelope; hive-scoped topic verified via post-create subscription + invite |
| HIVE_MEMBER_ADDED publish | 1 | correct member_count + target_entity_id + source_action |
| HIVE_MEMBER_REMOVED publish | 2 | creator-self-remove path; Wave 3 admin force-remove path; source_action discriminates |
| HIVE_DISSOLVED publish | 2 | emits on active → DISSOLVED transition; does NOT emit on idempotent already-DISSOLVED path |
| HIVE_AGGREGATE_BUILT publish | 1 | aggregate_present: true + source_action |
| SAFE projection no-leak | 1 | full path with secret marker; 9 forbidden-field substring assertions |
| Cross-org topic isolation | 1 | org A subscriber sees ZERO org B events |
| Fire-and-forget failure | 1 | subscriber throw does not propagate into HiveService |
| Backward-compat | 1 | HiveService without eventBus works (no observable change) |
| Audit literal preservation | 1 | full producer path emits only existing literals (5 HIVE_* + ADMIN_ACTION + auth literals); ZERO new literal |

## Gates at merge

- TypeScript baseline: 4 canonical residuals preserved.
- Unit tier: 371 tests + 42 anchor regression all green.
- Integration tier: 111 baseline + 13 NEW Wave 5 + 20 Wave 4
  + 20 Wave 3 + 15 Wave 2 regressions all green.
- Elixir tier: compile + test green.
- No-console anchor + no-leak guard: green.

## What is NOT in this PR

- Live consumers (forward-substrate per ADR-0064 §Forward
  queue).
- Default `HiveEventBus` instantiation at `server.ts` (kept
  undefined at production boot; substrate dormant pending a
  future consumer slice that authorizes default
  instantiation).
- Cross-language BEAM bridge to `dbgi_supervisor` Phoenix.PubSub
  (forward-substrate; RULE 21 will fire at that slice).
- Broadway / guaranteed delivery / outbox pattern
  (forward-substrate at Wave 6+).
- HIVE_GOVERNANCE_ZERO_STATE event wiring (deferred per
  Founder direction).
- Schema migration (existing substrate sufficient).
- New audit literals (PubSub is transient notification spine).
- Multi-node delivery guarantees (single-node-safe at v1).
- Otzar Twin subscription / Control Tower WebSocket bridge
  / Section 4 connector fan-out bridge (all forward-substrate
  consumer slices).
