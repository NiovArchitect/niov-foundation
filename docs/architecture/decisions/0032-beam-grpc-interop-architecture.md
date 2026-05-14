# ADR-0032: BEAM gRPC Interop Architecture

**Status**: Active
**Date**: 2026-05-13
**Trigger**: Sub-phase 5a of Block B (Phase 2 Elixir/BEAM Implementation
mini-arc per ADR-0030). Decision substrate before code substrate per
Q-P split — matches the sub-phase 4a precedent (ADR-0031 landed at
sub-phase 4a; sub-phase 4b instantiated against ratified decisions).
The cross-language transport boundary between Fastify+TypeScript API
and Elixir+BEAM routing layer is the first non-trivial architectural
crossing in Foundation Phase 2; its design warrants canonical
documentation at the moment it's made.

## Context

The COSMP coordination layer (ADR-0030 Phase 2; ADR-0031 routing
substrate) requires a **cross-language transport boundary** between the
Fastify+TypeScript API (`apps/api/`) and the Elixir+BEAM routing layer
(`apps/cosmp_router/`). The 7 patent-canonical COSMP operations per
US 12,517,919 cross this boundary at every cross-DMW collaboration,
every read/write capsule operation, every audit query, every
permissioned share/revoke.

Production live-grade Foundation substrate at billions-of-capsules-per-DMW
scale demands:

- **Strong typing across the boundary** — no implicit JSON shape drift
- **Binary efficiency** — payloads at scale benefit from binary encoding
- **Schema versioning** — patent-canonical Capsule structure evolves
  over time; clients across versions must coexist
- **Auth at the right boundary** — operator-tier authorization
  (RULE 20; ADR-0027) before gRPC dispatch
- **Observable surface** — every op visible at boundary for
  patent-implementation evidence (ADR-0020 Register 2)

Sub-phase 4b `[BEAM-COSMP-GENSERVER-CODE]` (`5712a2b`) landed the
Router GenServer with 7 `handle_call` stubs returning
`{:ok, :not_implemented}`. Sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]`
fills all 7 bodies with real routing logic AND establishes the gRPC
boundary per Q-N (no `:not_implemented` stubs cross gRPC boundary).
This ADR documents the boundary decisions before code lands.

## Decision

### gRPC library choice (Q-M)

**Elixir side**: `:grpc` (Elixir gRPC server library) + `:protobuf`
(Elixir Protobuf encoding). Canonical Hex packages; active
maintenance; production-grade; integrates with `:cowboy` for HTTP/2
transport.

**TypeScript side**: `@grpc/grpc-js` (pure-JS gRPC client) +
`@grpc/proto-loader` (`.proto` parsing). Canonical npm packages; no
native dependencies; aligns with Fastify Node.js runtime.

Version pins land at sub-phase 5b in `mix.exs` (Elixir) +
`package.json` (TypeScript) per substrate-honest discipline (deps
land with their consumers; ADR-0016 Pin-and-Optimize Framework
canonical).

### Call semantics: synchronous unary

Each COSMP op is a **synchronous gRPC unary call**:

- Caller (TypeScript) issues unary request; awaits unary response
- No streaming at sub-phase 5b (unary is canonical for routing decisions)
- Streaming reserved for future substrate (large capsule transfers;
  multi-capsule batch ops; sub-phase 11+ observability territory)

Why sync: COSMP routing decisions (READ result; WRITE confirmation;
AUTHENTICATE outcome) carry semantic dependency for the caller. Async
would force caller-side response tracking — wrong abstraction at
routing layer. Async semantics belong at the network egress boundary
(operator side, not BEAM side).

### Protobuf canonical structure

Each COSMP op gets a `.proto` message pair (Request + Response):

```protobuf
// apps/cosmp_router/priv/protos/cosmp.proto (canonical schema)
syntax = "proto3";
package cosmp;

message Capsule {
  bytes payload = 1;
  map<string, string> metadata = 2;
  repeated Rule rules = 3;
  repeated Relation relations = 4;
  TimeAttributes time = 5;
  Permissions permissions = 6;
  repeated AuditEntry audit = 7;
}

service CosmpRouter {
  rpc Authenticate(AuthenticateRequest) returns (AuthenticateResponse);
  rpc Negotiate(NegotiateRequest) returns (NegotiateResponse);
  rpc Read(ReadRequest) returns (ReadResponse);
  rpc Write(WriteRequest) returns (WriteResponse);
  rpc Share(ShareRequest) returns (ShareResponse);
  rpc Revoke(RevokeRequest) returns (RevokeResponse);
  rpc Audit(AuditRequest) returns (AuditResponse);
}
```

**7 patent-canonical COSMP ops** visible as **7 distinct gRPC RPCs**
at the `.proto` boundary; patent-implementation evidence register
strongest at this register.

Capsule struct fields preserve **patent-canonical 7-layer ordering**
per ADR-0031 Q-J. Field numbers 1-7 match patent layer ordering
(Payload / Metadata / Rules / Relations / Time / Permissions / Audit).

### Auth boundary: Fastify, not gRPC

Authentication and authorization live at the **Fastify API boundary**
(operator-facing edge), NOT at the gRPC layer (internal Foundation
transport).

Rationale:

- Fastify handles operator-tier authorization per RULE 20 / ADR-0027
  (only patent-holder Founder authorizes substrate changes;
  cross-tier auth at the external boundary)
- DMW-level auth (per-capsule permissions) lives within
  `CosmpRouter.Router` logic via the `Capsule.permissions` field
- gRPC boundary is internal Foundation substrate; authenticated
  transport (mutual TLS or pre-shared key at sub-phase 11+
  observability territory) but NOT auth-decision-point
- Single auth boundary reduces attack surface; auth logic
  concentrated at external edge

Sub-phase 5b: gRPC boundary trusts callers; sub-phase 11+ adds
mutual TLS for transport-layer security; sub-phase 12+ may add gRPC
interceptor-based audit logging.

### Error envelope structure

Every COSMP op response carries a **typed error envelope**:

```protobuf
message CosmpError {
  enum Kind {
    UNKNOWN = 0;
    NOT_IMPLEMENTED = 1;
    INVALID_CAPSULE = 2;
    PERMISSION_DENIED = 3;
    CAPSULE_NOT_FOUND = 4;
    IDEMPOTENCY_CONFLICT = 5;
    INTERNAL = 6;
  }
  Kind kind = 1;
  string message = 2;
  map<string, string> details = 3;
}

message ReadResponse {
  oneof result {
    Capsule capsule = 1;
    CosmpError error = 2;
  }
}
```

`oneof` discipline forces caller-side exhaustive handling; aligns
with ADR-0026 §5 Pattern 2 (supervisor-friendly failure modes —
explicit return shape).

### Connection management

- Single gRPC server instance per Elixir node (named
  `CosmpRouter.GRPC.Server`; supervised by `CosmpRouter.Supervisor`)
- Listen on configurable port (default `50051`; production overrides
  via `config/runtime.exs` at sub-phase 11+)
- HTTP/2 multiplexing handles concurrent ops; no per-op connection
- Connection lifecycle: started on application boot; stopped on
  supervisor shutdown; `:one_for_one` strategy isolates connection
  failures from Router GenServer

### `.proto` versioning strategy

`.proto` files versioned via **package namespace evolution** (e.g.,
`cosmp.v1` → `cosmp.v2` for breaking changes). Backward-compatible
additions (new optional fields) preserve package version. Sub-phase
5b lands `cosmp.v1`; v2 evolution triggers ADR amendment per ADR
lifecycle discipline (`docs/architecture/README.md` §ADR Lifecycle).

Patent-implementation evidence register: each `.proto` version
preserves the canonical patent surface; version evolution
distinguishes substrate-state evolution from patent-canonical surface
(which is fixed per US 12,517,919).

## Rationale

### Why gRPC over REST?

- **Type safety**: `.proto` schema enforces field types + structure at
  compile time on both sides; REST's JSON-Schema-or-OpenAPI requires
  runtime validation discipline that's easy to drift
- **Binary efficiency**: Protobuf encoding ~3-10x smaller than JSON
  for typical Capsule structures; at billions-of-capsules-per-DMW
  scale, this is real bandwidth + CPU savings
- **HTTP/2 multiplexing**: single connection handles concurrent ops;
  REST's per-request connection overhead doesn't scale to NIOV
  register
- **Cross-language fidelity**: `.proto` generates Elixir + TypeScript
  bindings from single source; REST requires hand-maintained parallel
  schemas

### Why gRPC over message queue (RabbitMQ / Kafka)?

- **Sync semantics**: routing decisions are synchronous in COSMP
  register; message queue async overhead misaligned
- **Direct boundary**: TypeScript → Elixir is a direct
  request/response; intermediate queue adds latency + failure modes
  without architectural value at this boundary
- **Future async**: large capsule transfers + cross-DMW broadcasts
  (sub-phase 7+ DBGI territory) may use distributed messaging; that's
  `:pg` / `libcluster` register, not Fastify ↔ Router register

### Why Protobuf over JSON?

Already covered above (type safety + binary efficiency + cross-language
fidelity). One additional register: **patent-implementation evidence
at binary level**. The 7-layer Capsule structure encoded in Protobuf
binary preserves field numbers 1-7 matching patent layer ordering —
visible at byte-level inspection of any gRPC payload. JSON loses this
structural register.

### Why sync unary over streaming?

- Routing decisions are inherently bounded (request → decision →
  response); not natural fit for streaming
- Streaming complicates error handling, backpressure, connection
  lifecycle without architectural value at this boundary
- Future: large capsule transfers (sub-phase 7+ DBGI broadcast
  territory) may use streaming; that's a different boundary

### Why auth at Fastify, not gRPC?

- **Single auth boundary** reduces attack surface
- **Operator-tier authorization** (RULE 20 / ADR-0027) is
  external-facing; lives at external edge
- **Internal transport security** at sub-phase 11+ via mTLS;
  orthogonal to auth-decision-point
- **DMW-level permissions** live within Router logic
  (`Capsule.permissions` field per ADR-0031); not gRPC concern

## Consequences

### Sub-phase 5b code substrate constraints (Q-N: full 7-op bridge)

1. `apps/cosmp_router/mix.exs` adds `:grpc` + `:protobuf` deps
   (substrate-honest pin at sub-phase 5b; ADR-0016 Pin-and-Optimize
   Framework canonical)
2. `apps/cosmp_router/priv/protos/cosmp.proto` canonical schema lands
3. `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` gRPC server
   worker
4. `apps/cosmp_router/lib/cosmp_router/grpc/translator.ex` Protobuf ↔
   Elixir struct translation
5. `apps/cosmp_router/lib/cosmp_router/application.ex` children list
   adds gRPC server worker (2nd child after Router GenServer)
6. `apps/cosmp_router/lib/cosmp_router/router.ex` all **7 `handle_call`
   bodies fill** (in-memory at sub-phase 5b; Postgres consumer at
   sub-phase 6+ with persistence) — **no `:not_implemented` stubs
   cross gRPC boundary per Q-N**
7. `apps/api/package.json` adds `@grpc/grpc-js` + `@grpc/proto-loader`
   deps
8. `apps/api/src/services/cosmp-client.ts` gRPC client wrapping all 7
   ops
9. CI workflow cache-key update: `hashFiles('.tool-versions')` →
   `hashFiles('.tool-versions', '**/mix.lock')` (first `mix.lock`
   arrives at sub-phase 5b)
10. Tests at both sides (Elixir `mix test` + TypeScript jest) verify
    each of 7 ops crosses boundary correctly

### Sub-phase 6 `[BEAM-COSMP-INTEGRATION-TESTS]` scope (forward-substrate)

Sub-phase 6 becomes pure integration-testing register: 7-op
end-to-end flows through the full TypeScript → gRPC → Elixir Router →
response pipeline against already-filled substrate. No
"implementation+testing in same commit" substrate-honest red flag.

### Sub-phase 11+ observability + auth implications

- mTLS for gRPC transport security (sub-phase 11 observability
  territory)
- gRPC interceptors for per-op telemetry + audit (sub-phase 11)
- `.proto` v2 evolution if breaking changes accumulate (forward ADR
  amendment territory)

### Patent-implementation evidence register at gRPC boundary

Once sub-phase 5b lands:

- 7 patent-canonical ops visible as 7 distinct gRPC RPCs in `.proto`
- 7 ops visible as 7 distinct TypeScript client method signatures
- 7 ops visible as 7 distinct `handle_call` clauses with real routing
  logic
- Capsule 7-layer structure visible as Protobuf message with field
  numbers 1-7 matching patent ordering
- Cross-language mechanical verification: any sub-phase 5b commit
  demonstrates patent-canonical surface intact across boundary

### Idempotency strategy (deferred from ADR-0031 Q-D)

Idempotency cache decision (ETS-backed vs Postgres-backed) deferred
to sub-phase 6 `[BEAM-COSMP-INTEGRATION-TESTS]` when integration
tests surface concurrent op patterns. Substantive enough to warrant
separate ADR (**ADR-0033 territory** if non-obvious choices arise
per ADR-0026 §5 Pattern 5 instantiation).

## References

- ADR-0031 (BEAM Routing Substrate Architecture) — sub-phase 4a
  decision substrate; ADR-0032 instantiates the cross-language
  boundary ADR-0031 declared at §Forward path sub-phase 5
- ADR-0030 (Phase 2 Elixir/BEAM Implementation) §Decision sub-phase
  5a + 5b — implementation context
- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer) —
  commitment-to-ship gRPC boundary; this ADR documents the boundary
  substrate
- ADR-0026 (Dual-Control Middleware Pattern) §5 — Pattern 2
  (supervisor-friendly failure modes) informs error envelope `oneof`
  discipline
- ADR-0027 (Contributor Governance + AI-Alignment + Rule-Modification
  Authority) — RULE 20 operator-tier authorization at Fastify auth
  boundary
- ADR-0020 (Two-Register IP Discipline) — patent-implementation
  evidence at gRPC boundary
- ADR-0016 (Pin-and-Optimize Framework) — `.tool-versions` +
  `mix.lock` + `package.json` single source of truth
- US 12,517,919 (COSMP Protocol patent — 7-layer Capsule + 7 COSMP
  ops)

## Forward path

| Sub-phase | Subject | This ADR's instantiation |
|-----------|---------|---------------------------|
| 5a | `[BEAM-COSMP-INTEROP-ADR]` (this ADR) | gRPC interop decision substrate |
| 5b-i | `[BEAM-COSMP-INTEROP-GRPC]` | `:grpc` + `:protobuf` deps; `cosmp.proto`; gRPC server + translator; all 7 `handle_call` bodies fill; `@grpc/grpc-js` + `@grpc/proto-loader` TypeScript client; cache-key forward-evolution |
| 5b-ii | `[BEAM-COSMP-INTEROP-PERSISTENCE]` | Postgres durable substrate + Ecto Repo + Capsule storage schema (7-layer JSONB mapping) + audit-chain integration + idempotency layer + ADR-0033 forthcoming |
| 6 | `[BEAM-COSMP-INTEGRATION-TESTS]` | 7-op end-to-end integration tests against live Postgres + audit-chain integrity verification; idempotency cache decision RESOLVED at sub-phase 5b-iii Commit A `[BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY]` per ADR-0033 §Decision 6 (Postgres-backed `idempotency_keys` table + Pattern 4 + Pattern 5 compound) |
| 7 | `[BEAM-DBGI-APP-SKELETON]` | Sibling DBGI supervisor app skeleton |
| 8 | `[BEAM-DBGI-PROCESS-GROUPS]` | `:pg` + `:gproc` registry |
| 9 | `[BEAM-DBGI-LIBCLUSTER]` | Multi-region clustering |
| 10 | `[BEAM-DBGI-INTEGRATION-TESTS]` | End-to-end DBGI |
| 11 | `[BEAM-OBSERVABILITY]` | Telemetry + logging + mTLS + gRPC interceptors |
| 12 | `[BEAM-CANONICAL-RECORD]` | `beam-coordination-canonical-record.md` |
| 13 | `[BEAM-ARC-CLOSURE]` | Onboarding cascade + section-12 row 35 + ADR-0028 forward → landed + ADR-0030 arc-closure |

Block B count expansion: **17 sub-phases** (expanded 13 → 14 at
sub-phase 4a per Q-G split — see ADR-0031; 14 → 15 at sub-phase 5a
per Q-P split — see this ADR; 15 → 16 at sub-phase 5b-i per Q-R
split — see ADR-0033; 16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT
split — see ADR-0033 §Forward path).

Bidirectional citations (cited from):

- ADR-0031 (BEAM Routing Substrate Architecture) — §Forward path
  sub-phase 5 entry forward-cites this ADR as the cross-language
  boundary substrate. ADR-0031 §Bidirectional citations back-cites
  this ADR.
- ADR-0030 (Phase 2 Elixir/BEAM Implementation) — §Decision sub-phase
  5a + 5b forward-cites this ADR. ADR-0030 §Bidirectional citations
  back-cites this ADR.
