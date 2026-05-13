# cosmp_router — COSMP Coordination Layer

Elixir/BEAM OTP application implementing the COSMP routing surface for
the NIOV Foundation per ADR-0030 (Phase 2 Elixir/BEAM Implementation).
Patent-canonical orchestration for the 7 COSMP operations defined in
US 12,517,919.

## Patent-canonical role

The router is the BEAM-side coordinator for the seven operations:

| Op | Purpose |
|----|---------|
| AUTHENTICATE | DMW/principal identity verification |
| NEGOTIATE | Cross-DMW capability + scope agreement |
| READ | Metadata-first capsule retrieval |
| WRITE | Append-only capsule write with audit-chain |
| SHARE | Permissioned scope grant across DMWs |
| REVOKE | Capability revocation + downstream cascade |
| AUDIT | Append-only audit log query (pre-success guaranteed) |

Inbound operations arrive over the Fastify↔Elixir gRPC bridge
(sub-phase 5); the routing GenServer (sub-phase 4) dispatches each
operation against the metadata-first retrieval surface and the
Capsule structure (7 layers per patent: Payload, Metadata, Rules,
Relations, Time, Permissions, Audit).

## Scale register — production live-grade

The Foundation is built for billions of memory capsules per DMW
across Personal / Enterprise zero-payload / Device DMW types, with
permissioned cross-DMW collaboration multiplying the routing surface.
Substrate decisions at every sub-phase optimize for this scale:

- **Supervision: `:one_for_one`** — per-worker failure isolation; a
  single stuck COSMP operation MUST NOT cascade to drop other
  in-flight operations across the DMW.
- **Process-per-request discipline** (sub-phase 4) — each COSMP op
  gets an isolated BEAM process; failures stay contained.
- **Distributed clustering** (sub-phases 8-9) — `:pg` + `:gproc` +
  `libcluster` for multi-region coordination as DMWs scale
  horizontally.
- **Telemetry** (sub-phase 11) — observability surface for per-op
  latency, queue depth, supervision tree health.

## Sub-phase 3 status — skeleton only

What this commit lands:

- `mix.exs` — child app project config (umbrella-aware)
- `lib/cosmp_router.ex` — top-level module + docs
- `lib/cosmp_router/application.ex` — OTP Application callback +
  named supervisor + empty children list
- `test/test_helper.exs` + `test/cosmp_router_test.exs` — smoke test
  pattern that sub-phases 4-10 inherit
- `.formatter.exs` — app-level formatter (empty import_deps)

Production-grade workers land starting sub-phase 4
`[BEAM-COSMP-GENSERVER]`.

## Forward path (sub-phases 4-6)

| Sub-phase | Subject | Adds |
|-----------|---------|------|
| 4 | `[BEAM-COSMP-GENSERVER]` | Routing GenServer + 6 BEAM patterns from ADR-0026 §5 |
| 5 | `[BEAM-COSMP-INTEROP-CODE]` | Fastify ↔ Elixir gRPC bridge worker |
| 6 | `[BEAM-COSMP-INTEGRATION-TESTS]` | End-to-end COSMP op flow tests |

## References

- [ADR-0030](../../docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md) — Phase 2 Elixir/BEAM Implementation
- [ADR-0028](../../docs/architecture/decisions/0028-beam-coordination-layer.md) — Commitment to ship BEAM coordination layer
- [ADR-0026](../../docs/architecture/decisions/0026-dual-control-middleware-pattern.md) §5 — 6 BEAM-compatibility patterns
- US 12,517,919 (COSMP Protocol patent — Sadeil Lewis sole holder)
