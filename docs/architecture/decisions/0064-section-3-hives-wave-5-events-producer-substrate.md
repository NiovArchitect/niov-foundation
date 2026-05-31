# ADR-0064: Section 3 Hives Wave 5 — Hive Events Producer Substrate

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SECTION-3-WAVE-5-ADR-AND-PRODUCER-IMPLEMENTATION-AUTH]`
(2026-05-30). Authorization covers both the ADR draft +
landing AND the contingent producer-only implementation if
the ADR identifies a substrate-safe path with no further
Founder product decision required.

## Context

ADR-0059 §Forward queue Wave 5 reserves "Phoenix.PubSub
fanout for hive aggregate updates (consumes ADR-0039
entry #28)" for separate Founder authorization. ADR-0039
§Forward queue entry #28 documents Phoenix.PubSub hive
fanout as forward-substrate at sub-arc 1 sub-phase c/d
+ sub-arc 2.

Phase 0 reconnaissance (2026-05-30) verified the
substrate-state ground truth:

- **Phoenix.PubSub is LIVE in dbgi_supervisor** (Elixir
  side) at `apps/dbgi_supervisor/mix.exs:76`
  (`{:phoenix_pubsub, "~> 2.2"}`) + initialized as a
  supervised child at `DbgiSupervisor.Application:120-126`
  (`{Phoenix.PubSub, name: DbgiSupervisor.PubSub}`).
  Currently consumed ONLY by `DbgiSupervisor.PresenceTracker`
  for CRDT join/leave events — NOT hive aggregate updates.
- **HiveService is TypeScript-side** at
  `apps/api/src/services/hive/hive.service.ts:223`. The
  producer events Wave 5 wants to publish fire from
  HiveService methods.
- **Cross-language substrate gap**: getting events from
  TypeScript-side HiveService to BEAM-side Phoenix.PubSub
  requires a wire-format crossing (gRPC + new Protobuf
  message + new Elixir handler — would fire RULE 21
  substrate-architectural paste discipline).

The Founder Wave 5 authorization resolves this gap by
locking **producer-only at v1** with **no live consumers**.
The Phoenix.PubSub naming in the wave title refers to the
*eventual consumer-side substrate* (forward-substrate when
a cross-language bridge is authorized at a future slice);
the *Wave 5 implementation* is a Foundation TypeScript
internal event spine that publishes SAFE-projected
envelopes to in-process subscribers, with no cross-language
wire format and no claim of multi-node delivery.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `548539c`:

- **No existing Node EventEmitter-based pub/sub abstraction**
  in `apps/api/src/services/` (Phase 0 grep returned zero
  hits for `EventEmitter` / `node:events` in production
  code paths). The Foundation backend uses request-scoped
  Fastify handlers + audit-event persistence for cross-
  service signaling; no in-process event bus exists today.
- **HiveService constructor** at line 223-228 takes 3 args
  (`authService`, `encryption`, `contentStore`). Adding an
  optional 4th `eventBus` arg preserves backward compatibility
  with all existing test fixtures (Wave 2 / Wave 3 / Wave 4
  tests all instantiate `new HiveService(auth, enc, store)`).
- **HiveAdminService methods** (Wave 3 admin route handlers
  `dissolveHive` + `forceRemoveMember`) live on the same
  `HiveService` class — they share the constructor.
- **`buildHiveAggregate`** at `hive.service.ts:946` runs as
  a service method called by background job code (signal
  mechanism unspecified at v1). It already emits
  `HIVE_AGGREGATE_BUILT` audit; Wave 5 adds an event
  publish AFTER the successful aggregate persist.
- **`getHiveIntelligence` zero-state paths** (Wave 2
  `EMPTY_CAPSULE_TYPES_ACCESSIBLE` + Wave 4
  `BELOW_AGGREGATE_MIN_MEMBER_COUNT`) fire on every read.
  Publishing `HIVE_GOVERNANCE_ZERO_STATE` on every such
  read would be noisy; Founder direction explicitly
  scoped this event as "only if safe and not noisy" — see
  Sub-decision 5 disposition (DEFERRED at v1).

### RULE 21 disposition

- **Wave 5 v1 implementation does NOT fire RULE 21.** The
  producer abstraction is a thin Foundation TypeScript
  wrapper around Node's built-in `node:events.EventEmitter`
  (standard library; no new external dependency). No
  cross-language paste. No new wire format. No new gRPC
  method. No new Protobuf message.
- **Forward-substrate BEAM bridge WILL fire RULE 21** at
  its authorization slice (Protobuf extension + gRPC
  method + Elixir handler + cross-language testing). That
  slice is not in Wave 5 scope.

## Decision

Wave 5 ships a **producer-only Foundation TypeScript Hive
event spine** at `apps/api/src/services/hive/hive-events.ts`
that publishes SAFE-projected envelopes after every Hive
state transition. Zero live consumers at v1; future
consumer paths (Otzar Twin subscription, Control Tower
WebSocket bridge, Section 4 connector fan-out bridge,
BEAM-side Phoenix.PubSub cross-language bridge) all land
under separate Founder authorization.

### Sub-decision 1 — Event vocabulary (closed; 5 v1 events)

Five canonical event names at v1 (matching Founder Wave 5
direction):

| Event name | Producer site | When emitted |
|---|---|---|
| `HIVE_CREATED` | `HiveService.createHive` | After `prisma.$transaction` persists hive + creator membership; after `HIVE_CREATED` audit emission |
| `HIVE_MEMBER_ADDED` | `HiveService.inviteToHive` | After `prisma.$transaction` upserts membership + decrements `member_count`; after `HIVE_MEMBER_ADDED` audit emission |
| `HIVE_MEMBER_REMOVED` | `HiveService.removeMember` (creator-self-remove) + `HiveService.forceRemoveMember` (Wave 3 admin force-remove) | After `prisma.$transaction` flips status to REMOVED + decrements `member_count`; after `HIVE_MEMBER_REMOVED` audit emission |
| `HIVE_DISSOLVED` | `HiveService.dissolveHive` (Wave 3) | After `prisma.hive.update` flips status to DISSOLVED; after `ADMIN_ACTION + HIVE_DISSOLVED` audit emission. NOT emitted on the idempotent already-DISSOLVED path (no state transition occurred). |
| `HIVE_AGGREGATE_BUILT` | `HiveService.buildHiveAggregate` | After encrypted aggregate persists + `hive.aggregate_capsule_id` set; after `HIVE_AGGREGATE_BUILT` audit emission |

**`HIVE_GOVERNANCE_ZERO_STATE` is DEFERRED at v1** per
Founder direction "only if safe and not noisy." The two
zero-state paths (`EMPTY_CAPSULE_TYPES_ACCESSIBLE` Wave 2
+ `BELOW_AGGREGATE_MIN_MEMBER_COUNT` Wave 4) fire on every
read — emitting per-read events would create high-volume
noise without a clear consumer use case. The event is
NAMED in the vocabulary documentation here but NOT wired
in Wave 5 v1; future Founder authorization may enable it
once a specific consumer requires real-time zero-state
visibility.

The event vocabulary is **closed** at v1. Additions
require explicit Founder authorization (this is a Layer-1
contract surface; consumers will depend on it being
stable).

### Sub-decision 2 — Topic schema (same-org scoped; closed pattern)

Each event publishes to TWO topics in parallel
(fan-in/fan-out at the consumer side):

- **Org-scoped**: `foundation:hives:org:{org_entity_id}`
- **Hive-scoped**: `foundation:hives:hive:{hive_id}`

The two-topic publish lets a future consumer subscribe at
either granularity (org-level "any hive changed in my
org" vs hive-level "this specific hive changed") without
the producer needing to know consumer intent.

**Cross-org topics are explicitly forbidden** per ADR-0059
§1 RULE 0 same-org sovereignty. A `foundation:hives:org:{X}`
topic NEVER receives events from a hive in org Y. The
publisher implementation hard-codes the per-event
`org_entity_id` extraction from the Hive row (never from
caller context); the topic name is derived from the row's
own `org_entity_id`.

Topic schema is **closed** at v1. New topic patterns
require explicit Founder authorization.

### Sub-decision 3 — SAFE payload projection

Every published envelope has the shape (typed in
`HiveEventEnvelope`):

```ts
interface HiveEventEnvelope {
  event_name: HiveEventName;            // closed vocab
  org_entity_id: string;                // same-org scope
  hive_id: string;                      // affected hive
  actor_entity_id?: string;             // safe; who triggered
  target_entity_id?: string;            // safe; e.g., invited/removed member
  member_count?: number;                // post-state-transition count
  hive_status?: "ACTIVE" | "DISSOLVED"; // current state
  aggregate_present?: boolean;          // safe; for BUILT events
  reason_code?: string;                 // closed-vocab discriminator
  source_action?: string;               // closed-vocab call-site discriminator
  timestamp: string;                    // ISO; producer wall-clock
}
```

**Forbidden fields** (enforced by construction — the type
shape does not include them; the projection helper at
`hive-events.ts` builds envelopes from explicit args only,
never spreads Hive rows):

- raw capsule content / raw aggregate content / payload
  summaries / private corrections / transcripts / prompts
- wallet internals / permission internals / embeddings /
  storage locations / content hashes / secret refs /
  bridge IDs
- **full `governance_terms` object** (Wave 4 evaluator
  protected this at error/audit emissions; Wave 5 extends
  the same discipline to event publishes)
- external source data / cross-org data
- session tokens / IP addresses (security; even though
  events stay in-process at v1, the design must remain
  bridge-safe for future external delivery)

The projection helper is the only path to construct an
envelope; SDK callers cannot inject arbitrary fields.

### Sub-decision 4 — Producer abstraction (`HiveEventBus`)

NEW class at `apps/api/src/services/hive/hive-events.ts`:

```ts
export class HiveEventBus {
  private readonly emitter: EventEmitter; // Node built-in

  publishHiveEvent(envelope: HiveEventEnvelope): void {
    // Fire-and-forget: catch all errors silently to never
    // block state transitions. Producer-side failures must
    // not propagate into the HiveService transaction flow.
  }

  subscribe(
    topic: string,
    handler: (envelope: HiveEventEnvelope) => void,
  ): () => void {
    // Returns an unsubscribe closure for test cleanup +
    // future consumer lifecycle management.
  }
}
```

- **Fire-and-forget**: any handler throw is caught + swallowed
  silently (no logging at v1 to keep noise low; future
  observability slice may add a structured-logger emission
  if needed).
- **In-process only**: no network, no IPC, no file IO. Node
  `EventEmitter` is the entire transport at v1.
- **Synchronous emit**: matches Node `EventEmitter.emit`
  semantics. Handlers run synchronously inline; consumers
  responsible for async work via their own queues. (This
  matches `Phoenix.PubSub.broadcast/3` direct-mode semantics
  + simplifies test determinism.)

### Sub-decision 5 — HiveService wiring

Constructor extended with an optional 4th argument:

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

**Optional with backward-compatible default**: all existing
Wave 2/3/4 tests instantiate `new HiveService(auth, enc,
store)` without an event bus; those tests must continue
passing unchanged. When `eventBus === undefined`, every
publish call is a no-op.

Publish calls fire AFTER each successful state-transition
audit emission:

- `createHive` line ~365 (after `HIVE_CREATED` audit; before
  returning success).
- `inviteToHive` line ~600 (after `HIVE_MEMBER_ADDED` audit;
  before returning success).
- `removeMember` line ~720 (after `HIVE_MEMBER_REMOVED`
  audit; before returning success).
- `dissolveHive` line ~960 — Wave 3 admin route handler;
  after `ADMIN_ACTION + HIVE_DISSOLVED` audit; only on
  active → DISSOLVED transition (NOT on idempotent
  already-DISSOLVED path).
- `forceRemoveMember` line ~1040 — Wave 3 admin route
  handler; after `HIVE_MEMBER_REMOVED` audit with
  `details.action: "HIVE_MEMBER_FORCE_REMOVED"` +
  `actor_role: "ORG_ADMIN"`; emits the same
  `HIVE_MEMBER_REMOVED` Wave 5 event (not a new event —
  the state change is the same).
- `buildHiveAggregate` line ~1085 (after
  `HIVE_AGGREGATE_BUILT` audit; before returning success).

Failed state transitions (`HiveFailure` returns) do NOT
emit events. The events report durable state changes only.

### Sub-decision 6 — Delivery semantics (fire-and-forget)

- **No persistence**: events are not stored to a database
  table. The audit chain remains the source of durable
  record per ADR-0002 (Sub-decision 7 reinforces this).
- **No retry queue**: handler failures swallowed silently
  at v1 (Sub-decision 4).
- **No outbox pattern**: no DB outbox table; no transactional
  event publish guarantee. A state transition that commits
  successfully MAY have its event lost if the event bus
  itself crashes; this is acceptable at v1 because no
  consumer depends on Wave 5 delivery yet.
- **No external side effects**: no HTTP calls, no Section 4
  connector invocations, no notifications. The event bus
  is purely in-process at v1.
- **Broadway / guaranteed delivery** remains forward-substrate
  for Wave 6 per ADR-0039 entry #28 + ADR-0059 §Forward
  queue.

### Sub-decision 7 — Audit posture

**Zero new audit literals at Wave 5.** Per Founder direction
+ ADR-0002 source-of-truth discipline:

- The PubSub publish itself emits NO audit row. The
  existing state-change audit (HIVE_CREATED,
  HIVE_MEMBER_ADDED, HIVE_MEMBER_REMOVED, HIVE_DISSOLVED
  via ADMIN_ACTION, HIVE_AGGREGATE_BUILT) is the source of
  durable record.
- PubSub is a **transient notification spine**, not the
  audit source of truth. A bridge or consumer that needs
  durable receipt MUST persist its own receipt log (Wave 6+
  forward-substrate).
- No new audit literal is required at Wave 5; the existing
  6 literals from Wave 2/3 cover the state-change surface.

### Sub-decision 8 — Schema posture

**Zero schema migration at Wave 5.** No new models. No
event persistence table. No outbox table. The existing
Hive + HiveMembership schema is unchanged.

Future Wave 6+ outbox / event-replay substrate would
require new schema models at their slice; not at Wave 5.

### Sub-decision 9 — Topology posture (single-node-safe; multi-node honest disclosure)

- **Single-node-safe** at v1: in-process Node EventEmitter
  + handler subscription. Within one Node process,
  subscribers always receive events from publishers in
  the same process.
- **Multi-node not claimed** at v1: Foundation's deployment
  posture is single-node at the v1 substrate level (per
  CLAUDE.md substrate-honest stance). The TypeScript
  HiveEventBus does NOT distribute events across multiple
  Node processes; a multi-node Foundation deployment
  would see events emitted only in the publishing process.
- **Phoenix.PubSub multi-node substrate** (libcluster +
  `Phoenix.PubSub.PG2` at `dbgi_supervisor`) is documented
  as substrate-present BUT not production-verified for
  Hive fanout per Phase 0 finding. The future BEAM bridge
  slice will inherit the existing dbgi_supervisor PubSub
  topology when authorized — Wave 5 does not change that
  posture.
- **No claim** of cross-process / cross-node delivery
  guarantees at any Wave 5 documentation surface.

### Sub-decision 10 — Cross-section integration boundaries

Wave 5 must coexist with existing substrate without
disrupting it:

- **ADR-0002 (Audit chain)**: PubSub events are NOT a
  substitute for the audit chain; they are a transient
  notification spine atop it. The audit row is the
  durable record; the PubSub publish is the wake-up
  signal. Audit chain integrity (RULE 4) is unchanged.
- **ADR-0028 (BEAM coordination layer)**: future BEAM
  bridge consumes the same closed event vocabulary +
  topic schema canonicalized at Sub-decisions 1 + 2;
  the cross-language wire format is forward-substrate
  at the bridge slice.
- **ADR-0039 (Hive-scale per-DMW dispatch)**: closes
  entry #28 partially (the producer half). The Broadway
  pipeline consumer half remains forward-substrate at
  Wave 6+.
- **ADR-0052 (Otzar DGI doctrine)**: no Twin subscriber
  at Wave 5 (Twin-to-Twin runtime stays at Wave 8+ per
  ADR-0059 v1).
- **ADR-0059 (Section 3 Hives v1)**: Wave 5 closes the
  Wave 5 §Forward queue reservation. RULE 0 same-org
  sovereignty preserved by topic-schema construction
  (Sub-decision 2).
- **ADR-0063 (Wave 4 governance_terms evaluator)**:
  governance violations do NOT publish events (failed
  state transitions emit nothing per Sub-decision 5). The
  `HIVE_GOVERNANCE_ZERO_STATE` event is reserved in
  vocabulary but DEFERRED at v1 wiring per Sub-decision 1.
- **Section 4 connector fan-out**: NOT a substitute for
  Wave 5 (different use case — external delivery vs
  internal notification). The future BEAM bridge or
  external delivery slice MAY route Wave 5 events through
  Section 4 connectors under separate Founder authorization.

### Sub-decision 11 — Patent-implementation evidence (ADR-0020 Register 2)

The Hive Events Producer Substrate contributes
patent-evidence-bearing material:

- **US 12,517,919 (COSMP)**: the closed-vocabulary
  state-change event stream at the Hive layer (which is
  itself patent-evidence-bearing per ADR-0059) is
  cryptographically-timestamped substrate distinguishing
  NIOV from any unauthorized parallel build at the
  "blockchain-only" claim register (per operator memory
  adversarial-actors disposition).
- **US 12,164,537 (DMW)**: same-org-scoped event topic
  schema operationalizes the enterprise-wallet boundary
  claim at the notification-spine register.
- **US 12,399,904 (Foundation primitives)**: the
  producer-only fire-and-forget abstraction is a
  governed-substrate primitive at the transient-signal
  register (distinct from durable audit chain).

### Sub-decision 12 — RULE 0 + no-leak discipline

- **No raw capsule content** in any envelope (Sub-decision 3
  forbidden list).
- **No private corrections / transcripts / prompts / wallet
  internals / permission internals / embeddings / storage
  locations / content hashes / secret refs / bridge IDs**
  in any envelope.
- **Full governance_terms object** never in envelope
  (Wave 4 evaluator no-leak discipline extended).
- **Cross-org isolation** preserved by topic-schema
  construction — org-scoped topic name derived from the
  Hive row's own `org_entity_id`, never from caller
  context. No subscriber can receive events from a
  different org's hive.
- **No external delivery** at v1 (forward-substrate at
  bridge slice; that slice will add its own no-leak
  review).

### Sub-decision 13 — Implementation slice recommendation

After this ADR lands, the recommended Wave 5 producer
implementation is **substrate-safe** and can proceed
autonomously per Founder authorization:

1. NEW `apps/api/src/services/hive/hive-events.ts`
   exporting `HiveEventName` union (5 v1 names) +
   `HiveEventEnvelope` interface + `orgTopic(orgId)` +
   `hiveTopic(hiveId)` helpers + `HiveEventBus` class
   wrapping `node:events.EventEmitter`.
2. Extend `HiveService` constructor with optional 4th
   `eventBus?: HiveEventBus` argument (backward-compat
   for all existing tests).
3. Wire 5 publish calls into the existing HiveService
   methods per Sub-decision 5 (createHive,
   inviteToHive, removeMember, dissolveHive,
   forceRemoveMember, buildHiveAggregate).
4. NEW integration test
   `tests/integration/hive-wave-5-events-producer.test.ts`
   covering:
   - Publishing occurs after createHive on both topics.
   - Publishing occurs after inviteToHive on both topics.
   - Publishing occurs after removeMember + forceRemoveMember.
   - Publishing occurs after dissolveHive (NOT on
     idempotent already-DISSOLVED path).
   - Publishing occurs after buildHiveAggregate.
   - Envelope SAFE projection (no governance_terms;
     no capsule content; no wallet internals).
   - Cross-org isolation (org A subscriber never sees
     org B events).
   - Fire-and-forget failure handling (handler throw
     does not propagate into HiveService transaction).
   - No new audit literal emitted.
   - Wave 2/3/4 regressions remain green.
   - TypeScript baseline 4 canonical residuals preserved.
5. Foundation server entrypoint (`apps/api/src/server.ts`)
   may instantiate a default `HiveEventBus` and pass to
   `HiveService`; OR leave undefined at v1 (no live
   consumer means no observable behavior change without
   instantiation). The decision lives at the
   implementation slice; default disposition is to
   instantiate (so the substrate is wired end-to-end and
   future consumer slices have an integration point ready).

**STOP CONDITIONS for the implementation slice**:

- Any consumer-identity question that the Founder
  introduces at implementation time (would convert
  producer-only to producer+consumer).
- Cross-language BEAM bridge work creep (forward-substrate;
  Wave 6+).
- Multi-node topology guarantees creep.
- Schema migration discovered necessary (Sub-decision 8
  design gap; surface inline + stop).
- New audit literal discovered necessary (Sub-decision 7
  design gap).
- HIVE_GOVERNANCE_ZERO_STATE event becoming necessary
  (Sub-decision 1 deferred disposition).

## Consequences

### Positive

- Closes ADR-0059 §Forward queue Wave 5 producer half
  with zero schema migration + zero new audit literals +
  zero external dependencies.
- Establishes a clean, closed-vocabulary internal event
  spine that future consumer slices can subscribe to
  without changing HiveService again.
- Producer-only at v1 means low risk: no live consumers
  to break; no external delivery semantics to verify;
  no observable behavior change without explicit
  subscription.
- SAFE payload projection enforced by type construction
  (cannot accidentally spread raw rows).
- RULE 0 same-org isolation preserved by topic-schema
  construction (org-scoped topics derived from Hive row,
  not caller context).
- Backward-compatible HiveService constructor (optional
  4th arg) keeps all Wave 2/3/4 tests passing unchanged.

### Negative / risk

- The "Phoenix.PubSub" naming in the wave title is
  substrate-honest aspirational: the v1 implementation
  uses Node EventEmitter, NOT Phoenix.PubSub. The ADR
  documents the relationship explicitly (Phoenix.PubSub
  is the *eventual cross-language consumer-side
  substrate* at dbgi_supervisor; Wave 5 is the
  *producer-side TS abstraction*). Operators reading the
  wave title without the ADR may misunderstand.
- No consumers at v1 means the event spine is dormant
  infrastructure. Until a consumer slice lands, the
  PubSub publish calls are no-ops (when `eventBus` is
  undefined) or emit-to-nothing (when instantiated but
  unsubscribed). This is intentional but worth flagging.
- Multi-node Foundation deployments will NOT see
  cross-process event delivery at v1. Document explicitly;
  do not claim production multi-node guarantees.

### Forward queue (Wave 5 and beyond)

Each item is forward-substrate (separate Founder
authorization required at its slice):

- **Wave 6 — Broadway pipeline / guaranteed delivery**
  per ADR-0039 entry #28. Adds outbox table, retry,
  durable receipt semantics.
- **BEAM-side Phoenix.PubSub bridge** — cross-language
  consumer slice; RULE 21 research arc required (Protobuf
  extension + gRPC method + Elixir handler).
- **Otzar Twin subscription** — Wave 8+ per ADR-0052 §8 +
  ADR-0059; consumer-side product slice.
- **Control Tower WebSocket bridge** — frontend
  out-of-Foundation-scope; consumer-side product slice.
- **Section 4 connector fan-out bridge** — routes Wave 5
  events to external connector providers; opt-in per
  binding (Section 4 Wave 7 precedent for direct vs
  action-routed mode).
- **HIVE_GOVERNANCE_ZERO_STATE event enabling** —
  Sub-decision 1 deferred disposition; requires specific
  consumer use case before noise-vs-signal trade-off
  resolved.
- **Event persistence + outbox** — Wave 6 schema work.

## Bidirectional citations

- Cited from ADR-0059 §Forward queue Wave 5 — this ADR
  closes the producer half of that reservation.
- Cited from ADR-0069 §3 domain 3 + §Forward queue
  (Elixir/BEAM Substrate-Coherence Law for Living
  Coordination; doctrine ADR landed 2026-05-31). ADR-0069
  canonicalizes the four-language division of labor + the
  required §6 8-question architecture check. The
  Phoenix.PubSub consumer half + Broadway reliable delivery
  forward-substrate items enumerated at §Forward queue
  inherit ADR-0069 §3 + §5 + §6 as their substrate-placement
  defense. ADR-0069 does NOT authorize the consumer-half
  implementation; that authorization lives at its own
  future slice + RULE 21 research arc per §Sub-decision 13.
- Cited from ADR-0039 §Forward queue entry #28 — this
  ADR closes the producer half (Phoenix.PubSub at
  BEAM-side stays present in dbgi_supervisor; the
  cross-language bridge is forward-substrate at a
  future slice).
- Cites ADR-0001 (three-wallet architecture; RULE 0
  source for same-org topic-schema construction).
- Cites ADR-0002 (append-only audit chain; events are NOT
  a substitute — audit row is durable record, PubSub is
  transient signal).
- Cites ADR-0028 (BEAM coordination layer; future BEAM
  bridge inherits Wave 5 event vocabulary + topic schema).
- Cites ADR-0030 (Phase 2 BEAM implementation; canonical
  Phoenix.PubSub on-main location at dbgi_supervisor).
- Cites ADR-0039 (parent — closes entry #28 producer half;
  consumer + Broadway forward-substrate at Wave 6+).
- Cites ADR-0052 (Otzar DGI doctrine; Twin-to-Twin runtime
  is Wave 8+ consumer-side concern).
- Cites ADR-0059 (Section 3 Hives v1 — parent; closes
  Wave 5 §Forward queue reservation).
- Cites ADR-0062 (Wave 3 admin route surface — `dissolveHive`
  + `forceRemoveMember` are 2 of the 6 producer call
  sites).
- Cites ADR-0063 (Wave 4 governance_terms evaluator;
  governance violations do NOT publish events;
  HIVE_GOVERNANCE_ZERO_STATE event deferred at v1
  wiring).
- Bidirectional back-citation lands in ADR-0059 §Forward
  queue Wave 5 + ADR-0039 §Forward queue entry #28 per
  RULE 14 + ADR-0020 §3 + RULE 20.

## Founder authorization

Per RULE 20: this ADR + amended ADR-0059 + ADR-0039
back-citations + architecture/README.md catalog entry
land under explicit Founder authorization at
`[FOUNDER-SECTION-3-WAVE-5-ADR-AND-PRODUCER-IMPLEMENTATION-AUTH]`
2026-05-30. The authorization covers both the ADR draft +
landing AND the contingent producer-only implementation
if the ADR identifies a substrate-safe path with no
further Founder product decision required.
