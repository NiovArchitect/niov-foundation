# ADR-0030: Phase 2 Elixir/BEAM Implementation: Mix Umbrella + COSMP Router + DBGI Supervisor + Three-Language Stack Canonicalization

**Status**: Active
**Date**: 2026-05-13
**Trigger**: ADR-0028 (`[SEC-BEAM-FORWARD-SUBSTRATE]` `88eb4d6`) committed NIOV
to ship the Elixir/BEAM COSMP coordination layer as Sub-box 2 Phase 2. The
5-commit SUBSTRATE-BUILD-OPTIMIZATIONS arc (`ba78216` → `5729673`) closed; Block
A (`3b76c3d`) resolved the cascade-grep markdown-line-wrap limitation
(catch #1). Substrate-build tools are operational; engineering substrate is
canonical at 29 ADRs / 20 RULES / 139 commits / 56-consecutive-commit
substrate-honest pre-flight pattern. This ADR documents the Phase 2
implementation — the 14-sub-phase Block B arc that ships Elixir/BEAM substrate
as production Foundation services + canonicalizes the three-language stack
(TypeScript + Elixir + Postgres; Python ML when it lands).

## Context

ADR-0028 named the **6 BEAM-compatibility patterns** in `ADR-0026 §5` (per the
canonical record `dual-control-operations-canonical-record.md` §5): (1)
message-passing semantics; (2) supervisor-friendly typed failure modes; (3)
state reconstructible from durable storage; (4) event-sourced audit semantics;
(5) idempotent verification keys; (6) pure transformation over imperative
control. The dual-control middleware substrate adopted those patterns *as
TypeScript code mimicking BEAM idioms*. Phase 2 ports the patterns from
TypeScript-pattern-mimicking-BEAM to **production BEAM substrate** — the
patterns become observable Elixir/OTP code, not pattern-shaped TypeScript.

Two architectural components in Version 2 scope (per Day 9 planning):

- **COSMP coordination layer** — message routing for the Contextual
  Orchestration and Scoped Memory Protocol (patent US 12,517,919). BEAM
  GenServer-based; idempotent message keys; Postgres-hydrated state; gRPC
  bridge to the Fastify+TypeScript API.
- **DBGI supervisor** — supervised process groups for distributed coordination.
  BEAM `:pg` + `:gproc` for distributed registry semantics; `libcluster` for
  multi-region topology; Phoenix.PubSub for cross-node coordination.

OtzarComm (the full router envisioned in ADR-0028) is **deferred to Version 3**
— the migration triggers from ADR-0028 (>1M capsules / >10M-100M daily
OtzarComm / multi-region) frame when Version 3 becomes load-bearing. Version 2
ships the substrate foundation (COSMP + DBGI) that Version 3 builds on.

**Three-language stack canonicalization**: Fastify + TypeScript (API,
request-lifecycle, schema, audit-chain) + Elixir (coordination, message
routing, distributed supervision) + Python ML (future; sentiment/intent
scoring, DMW relevance ranking) + Postgres (shared storage; schema authority
preserved at TypeScript Prisma per ADR-0025). The Elixir tier is *additive*,
not replacing the TypeScript API; the two coexist via gRPC.

**Patent-implementation evidence framing** (per ADR-0020 two-register IP
discipline). ADR-0030 is the **second ADR** in the second-language
patent-implementation evidence trail: ADR-0028 = commitment-to-ship;
ADR-0030 = implementation. New patent counsel's prosecution-history review
benefits from substrate-architectural breadth — BEAM substrate as Foundation
service is the Register-2 implementation of the 6 BEAM-compatibility patterns
ADR-0026 documents at substrate-state register.

**Migration triggers from ADR-0028 hold**: deployment at >1M capsules,
>10M-100M daily OtzarComm, or multi-region rollout triggers Version 3 work
(full OtzarComm router + load-bearing dependency on Elixir-tier substrate).
Until then, Version 2 ships the BEAM foundation that production-readiness
work matures against — the substrate exists, observability matures, the gRPC
bridge is exercised, but the migration triggers gate the load-bearing shift.

## Decision

NIOV Labs implements Phase 2 Elixir/BEAM coordination layer as the Block B
14-sub-phase mini-arc of Day 9 (expanded from 13 at sub-phase 4a per
Q-G split — see ADR-0031). The decomposition:

**COSMP Coordination Layer (6 sub-phases):**

1. **`[BEAM-PHASE-2-ADR]`** — THIS COMMIT. ADR-0030 decision document; 29→30
   ADRs cascade; catch #1 + #2 fixes in ADR-0028 + ADR-0029 Forward Queues.
2. **`[BEAM-MIX-WORKSPACE]`** — mix umbrella workspace at the repo root.
   `mix.exs` umbrella config (`apps_path: "apps"`); `.tool-versions` pins
   Elixir + Erlang + OTP versions (asdf-compatible). Two-app umbrella initial
   skeleton.
3. **`[BEAM-COSMP-APP-SKELETON]`** — `apps/cosmp_router/` OTP application.
   Supervisor tree at `lib/cosmp_router/application.ex`; child specs for the
   GenServers sub-phase 4 introduces; mix.exs deps; ExUnit test framework
   scaffolding.
4a. **`[BEAM-COSMP-GENSERVER-ADR]`** — Decision substrate. ADR-0031 (BEAM
    Routing Substrate Architecture) lands; documents GenServer state shape,
    7-op `handle_call` dispatch pattern, `Capsule` placeholder (7 layers
    per US 12,517,919), supervision tree integration, idempotency deferral
    to sub-phase 5/6 (Q-D), and load-bearing subset of ADR-0026 §5 BEAM
    patterns (**patterns 1, 2, 6** at sub-phase 4b; patterns **3, 4, 5**
    forward-queued to sub-phases 5/6 with their consumers).
4b. **`[BEAM-COSMP-GENSERVER-CODE]`** — Code substrate. `CosmpRouter.Router`
    GenServer at `lib/cosmp_router/router.ex` + `CosmpRouter.Capsule`
    placeholder struct + `CosmpRouter.Application` MOD (children list adds
    Router as first worker). Instantiates ADR-0026 §5 **load-bearing subset
    (patterns 1, 2, 6)** in Elixir/OTP idiomatic form per ADR-0031 §Decision.
    All 7 ops as `handle_call` stubs returning `{:ok, :not_implemented}` per
    Q-C; bodies fill at sub-phase 5+ with consumers. ExUnit tests covering
    subset behavior; smoke test pattern from sub-phase 3 updates
    (`which_children/1` expects 1 child).
5. **`[BEAM-COSMP-INTEROP]`** — Fastify ↔ Elixir gRPC bridge. TypeScript-side
   client at `apps/api/src/services/cosmp-client.ts`; Elixir-side server at
   `apps/cosmp_router/lib/cosmp_router/grpc.ex`; `.proto` definitions at
   `proto/cosmp.proto`; protobuf-based contract; mTLS placeholder for
   production hardening.
6. **`[BEAM-COSMP-INTEGRATION-TESTS]`** — end-to-end tests across the bridge
   (TypeScript test exercises Elixir router via gRPC; verifies routing
   correctness + the 6 patterns observable at the substrate boundary).

**DBGI Supervisor Layer (4 sub-phases):**

7. **`[BEAM-DBGI-APP-SKELETON]`** — `apps/dbgi_supervisor/` OTP application
   skeleton (supervisor tree, application module, mix.exs).
8. **`[BEAM-DBGI-PROCESS-GROUPS]`** — distributed process-group registry via
   `:pg` (OTP-native) + `:gproc` (richer registry semantics). The
   "supervised-process-groups" substrate ADR-0028 names.
9. **`[BEAM-DBGI-LIBCLUSTER]`** — multi-region clustering topology via
   `libcluster`; Phoenix.PubSub for cross-node coordination; cluster-formation
   strategy configurable per deployment-target (gossip / DNS / Kubernetes).
10. **`[BEAM-DBGI-INTEGRATION-TESTS]`** — end-to-end tests covering process
    group join/leave + clustering formation + failover semantics across nodes.

**Operational Substrate (3 sub-phases):**

11. **`[BEAM-OBSERVABILITY]`** — `telemetry_metrics` + `telemetry_poller` for
    both apps; structured logging via Logger backends; metrics exposed via a
    `prometheus_metrics` scrape endpoint. Operational hardening — the BEAM
    apps observable like the TypeScript API is.
12. **`[BEAM-CANONICAL-RECORD]`** — NEW
    `docs/architecture/beam-coordination-canonical-record.md` (analogous to
    `dual-control-operations-canonical-record.md`). Documents operational
    discipline + the 6 BEAM patterns instantiated in Elixir + the §-structure
    operational companion to ADR-0030.
13. **`[BEAM-ARC-CLOSURE]`** — onboarding cascade (`onboarding.md` +
    `onboarding-for-engineers.md` gain Elixir/BEAM section);
    `section-12-progress.md` row 35 (SUBSTRATE-BUILD-OPTIMIZATIONS-style row
    for the Block B arc); ADR-0028 Forward Queue `forward → landed`
    conversions; ADR-0030 arc-closure cascade. `"this commit"` placeholders
    for sub-phase 13's own hash per sub-phase J Decision 3 precedent (keeps
    arc at exactly 13 commits).

## Implementation Detail

### Mix umbrella workspace structure

```
apps/
  cosmp_router/       — COSMP coordination layer (sub-phases 3-6)
    lib/cosmp_router/
      application.ex  — OTP application + supervisor tree
      router.ex       — GenServer; 6 BEAM patterns instantiated
      grpc.ex         — Elixir-side gRPC server
      shared.ex       — typed structs + idempotency-key generation
    test/             — ExUnit
    mix.exs           — app config + deps
  dbgi_supervisor/    — DBGI supervisor layer (sub-phases 7-10)
    lib/dbgi_supervisor/
      application.ex  — OTP application + supervisor tree
      registry.ex     — :pg + :gproc distributed registry
      cluster.ex      — libcluster topology
    test/             — ExUnit
    mix.exs
  api/                — EXISTING Fastify+TypeScript API (unchanged)
    src/...
proto/
  cosmp.proto         — gRPC contract definitions (sub-phase 5)
mix.exs               — umbrella mix configuration (apps_path: "apps")
.tool-versions        — Elixir + Erlang + OTP version pinning
```

### Coexistence with existing TypeScript stack

- **`apps/api/`** — existing Fastify+TypeScript API; unchanged in Phase 2.
- **gRPC bridge** — TypeScript client (`apps/api/src/services/cosmp-client.ts`)
  + Elixir server (`apps/cosmp_router/lib/cosmp_router/grpc.ex`). Contract at
  `proto/cosmp.proto`. mTLS placeholder for production.
- **Shared Postgres** — Elixir reads/writes through Ecto repos; TypeScript
  through Prisma. **Schema authority canonical at TypeScript Prisma per
  ADR-0025** — no Elixir migrations yet; Ecto repos read-only initially. If
  Elixir/Ecto becomes meaningful schema-writer in future arcs, ADR-0025
  amendment required (not in scope for Phase 2).
- **CI** — GitHub Actions adds Elixir job (compile, dialyzer, credo, test);
  reuses existing Postgres tier per ADR-0011. ADR-0015 deployment-target
  pinning extends to include Elixir/OTP version pin.

### 6 BEAM-compatibility patterns → Elixir/OTP idiomatic forms

| ADR-0026 §5 pattern | Elixir/OTP idiom (Phase 2) |
| --- | --- |
| 1. Message-passing semantics | `GenServer.call/2`, `GenServer.cast/2`, `send/2` |
| 2. Supervisor-friendly typed failure modes | `{:error, :transient}` / `{:error, :permanent}` return types; supervisor `:restart` strategy `:transient` |
| 3. State reconstructible from durable storage | Ecto-backed state hydration in `GenServer.init/1`; Postgres as source-of-truth |
| 4. Event-sourced audit semantics | Audit events written to existing `audit_events` Postgres table (TypeScript-shared substrate); `:pg` + Postgres for event-sourcing |
| 5. Idempotent verification keys | `idempotency_key` opaque tokens; Postgres unique index; Ecto changeset validation |
| 6. Pure transformation over imperative control | Pure Elixir functions for routing decisions; side effects isolated to GenServer callbacks |

The table is the substrate-state-register-to-Register-2 mapping per ADR-0020:
ADR-0026 §5 documents the patterns at substrate-state-register (TypeScript
code mimicking BEAM); ADR-0030 implements them at Register-2 (production
Elixir/BEAM). The new patent counsel's prosecution-history review can cite
the table directly for the substrate-architectural breadth claim.

## Consequences

**Easier:**

- **Investor-credible BEAM-in-production proof.** The marketing-vs-substrate
  gap closes. Foundation runs Elixir in production; the BEAM choice is
  defensible from observable code, not architectural promises.
- **Patent-implementation evidence in second language.** The 6 BEAM patterns
  exist at Register-2 (production substrate), not just substrate-state-register
  (TypeScript pattern-shape). New patent counsel's prosecution-history review
  benefits from architectural breadth across runtimes.
- **Hiring optionality.** Elixir + Erlang/BEAM engineers become viable hires.
  BEAM ecosystem has different talent pool than TypeScript; Phase 2 substrate
  is the cost-to-hire-for-BEAM gate.
- **BEAM-native fault tolerance + distribution + concurrency** for the
  workloads that fit (per-capsule processes, OTP supervisor trees, multi-region
  clustering via libcluster). Capsule-supervision substrate ADR-0028 names
  becomes architectural-possibility-now-observable.
- **Three-language stack canonicalization.** Clearer architectural separation:
  request-lifecycle (TS), coordination (Elixir), ML (Python, future), storage
  (Postgres). Each runtime owns the substrate it's best at.
- **The 6 BEAM-compatibility patterns become observable substrate** —
  Elixir code IS the pattern, not pattern-mimicking TypeScript. Substrate
  honesty principle: the patterns are real once they exist at Register-2.

**Harder:**

- **14-sub-phase mini-arc.** ~10-13 hours engineering at current velocity (the
  Block B arc). The substrate-build tools (cascade-grep multiline + templates)
  reduce token-cost-per-catch substantially but engineering time is real.
- **Dual-runtime operational complexity.** Elixir + TypeScript both deployed
  in production. Two runtimes to monitor, deploy, version-pin, observability-
  instrument. The sub-phase-11 observability work addresses this but the
  ongoing operational cost is real.
- **Elixir+OTP learning curve** for engineers without BEAM background. The
  `onboarding-for-engineers.md` Elixir/BEAM section (sub-phase 13) is the
  onboarding-cost gate.
- **gRPC interop substrate.** Protobuf definitions, mTLS, error semantics
  across runtimes. The contract-driven design (sub-phase 5 `.proto` first) is
  the safety net but the substrate is non-trivial.
- **CI adds Elixir job.** Compile + dialyzer + credo + test; ~+2-3 minutes
  CI time. ADR-0015 deployment-target pinning extends; Elixir/OTP versions
  pinned per Pin-and-Optimize framework (ADR-0016).
- **ADR-0025 schema-push-target discipline preserved but now multi-runtime
  aware.** Ecto repos read-only against TypeScript-managed schema initially;
  if Elixir becomes schema-writer, ADR-0025 amendment required.

## Forward Queue

- **Sub-phases 2-13 forward-queued (Block B mini-arc).** Actual Elixir
  implementation across COSMP + DBGI + observability + canonical record + arc
  closure. Each sub-phase has its own pre-flight + cascade per the
  substrate-build discipline.
- **Phase 3 candidates (Version 3 scope).** OtzarComm full router; ML pipelines
  (sentiment/intent scoring, DMW relevance ranking). Future ADRs document each
  as it lands; migration triggers (>1M capsules / >10M-100M daily OtzarComm /
  multi-region) gate when Version 3 becomes load-bearing.
- **Schema authority migration** — if Elixir/Ecto becomes meaningful
  schema-writer in future arcs, ADR-0025 amendment needed. Not in scope for
  Phase 2.
- **BEAM-coordination-canonical-record analog doc** — sub-phase 12 lands the
  operational companion to ADR-0030 (mirrors
  `dual-control-operations-canonical-record.md` structure).
- **Onboarding cascade** — `onboarding.md` + `onboarding-for-engineers.md`
  gain Elixir/BEAM sections at sub-phase 13.
- **Substrate-build optimizations specific to Phase 2** — if dual-runtime
  cascade patterns or Elixir-tier pre-flight discipline emerges as a
  recurring pattern, ADR-0031+ formalizes them.

## Substrate-State Catches Resolved

Sub-phase 1 of Block B surfaced **2 substrate-state catches at pre-flight**,
both pre-existing forward-cite drifts. Both share root cause = substrate
evolution invalidated forward-cites when the SUBSTRATE-BUILD-OPTIMIZATIONS arc
interposed between original cite and actual ADR-0030 landing.

**Catch #1: ADR-0028 line 151-152 stale ADR-0029 forward-reference.**
ADR-0028 Forward Queue framed `"ADR-0029 — documenting the Phase 2 canonical
architectural decisions as they land (the Phase 2 analog of this ADR)."` —
but ADR-0029 actually became `SUBSTRATE-BUILD-OPTIMIZATIONS` (the
substrate-build meta-tooling arc that ran between this commitment and
ADR-0030's landing). The Phase 2 implementation ADR is now ADR-0030 (this
commit). Resolved in this commit via Q-A:A — ADR-0028 already in scope for
the load-bearing back-cite addition.

**Catch #2: ADR-0029 line 205-206 stale "Potential ADR-0030"
forward-reference.** ADR-0029 Forward Queue framed `"Potential ADR-0030 — if
Sub-box 2 Phase 2 (the Elixir/BEAM mini-arc) surfaces new substrate-build
patterns, a follow-up ADR formalizes them."` — but ADR-0030 is the Phase 2
implementation ADR itself, not a substrate-build patterns follow-up. Re-framed
to `"ADR-0030 — LANDED at Block B sub-phase 1; documents Phase 2
implementation. If new substrate-build patterns emerge from Phase 2 work,
they'd land in ADR-0031+."` Resolved in this commit via Q-B:A.

**Structural pattern observation.** Both catches share root cause = substrate
evolution invalidated pre-existing forward-cites when the substrate-build arc
interposed between original cite and actual landing. Forward-cite hygiene
principle: forward-cites need revision at the *actual landing moment*, not
just at the landing commit's typical cascade. The cascade-grep `hash`
subcommand's `forward: ADR-<N>` pattern is designed to catch exactly this;
the Block A multiline-aware fix (`3b76c3d`) made it more reliable.

**Block A + substrate-build arc deliverables paid off at FIRST LOAD-BEARING
USE.** `cascade-grep.sh adr 30` mechanically surfaced the cascade landscape at
sub-phase 1 pre-flight; `NEW-ADR.template.md` checklist enumerated the
standard cascade; `cascade-grep.sh hash` surfaced both catches before any
edits chained. The Block A multiline-aware fix specifically enabled
cascade-grep to surface the catches reliably (the pre-Block-A regex would
have missed the line-wrapped portions of the stale forward-references). **The
substrate-build tools earned their place explicitly on day one of operational
use** — the worked example the SUBSTRATE-BUILD-OPTIMIZATIONS arc's
discipline-converges thesis predicted.

57-consecutive-commit substrate-honest pre-flight verification pattern
operational (58 after this commit lands).

## Bidirectional citations (cited from):

- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule
  Supervision + OtzarComm + DBGI Integration; landed at sub-phase J
  `[SEC-BEAM-FORWARD-SUBSTRATE]` `88eb4d6`) — **load-bearing**: ADR-0028
  forward-queued the Phase 2 ship-commitment; this ADR is the implementation
  ADR fulfilling that commitment. ADR-0028's Forward Queue line 151-152
  (originally referenced "ADR-0029") and the `(cited from)` block both
  back-cite this ADR. The Phase 2 mini-arc (14 sub-phases) ports the 6
  BEAM-compatibility patterns to production Elixir/BEAM.
- ADR-0026 (Dual-Control Middleware Pattern + Privileged Endpoint Registry +
  Per-Route Binding Discipline; landed at sub-phase H `[SEC-DUAL-CONTROL-ADR]`
  `135fee0`) — **load-bearing**: ADR-0026 §5 documents the 6
  BEAM-compatibility patterns at substrate-state register (TypeScript code
  mimicking BEAM); this ADR ports those patterns to Register-2 (production
  Elixir/BEAM). ADR-0026's `(cited from)` block back-cites this ADR — the
  patterns become production substrate in Phase 2.
- ADR-0031 (BEAM Routing Substrate Architecture; landed at sub-phase 4a
  `[BEAM-COSMP-GENSERVER-ADR]`) — **load-bearing**: ADR-0031 is the
  decision substrate for sub-phase 4b's routing GenServer; cites this
  ADR §Decision sub-phase 4a/4b for the substantive scope. Sub-phase 4b
  `[BEAM-COSMP-GENSERVER-CODE]` instantiates ADR-0031's decisions
  (GenServer state shape + 7-op `handle_call` dispatch + `Capsule`
  placeholder + supervision tree integration + load-bearing subset of
  ADR-0026 §5 patterns 1, 2, 6). ADR-0031's `(cited from)` block
  back-cites this ADR.
- ADR-0020 (Two-Register IP Discipline) — referenced in this ADR's Context
  for the patent-implementation-evidence framing (Phase 2 = Register-2
  implementation of the substrate-state-register patterns); prose-mention,
  not a load-bearing dependency → no formal `(cited from)` back-cite per the
  citation-restraint precedent.
- ADR-0025 (Schema-Push-Target Discipline) — referenced in this ADR's
  Implementation Detail for the schema-authority preservation framing
  (TypeScript Prisma remains schema authority in Phase 2; Ecto repos
  read-only initially); prose-mention → no back-cite.
