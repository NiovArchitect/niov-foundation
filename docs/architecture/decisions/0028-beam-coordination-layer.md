# ADR-0028: Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule Supervision + OtzarComm + DBGI Integration

**Status**: Active
**Date**: 2026-05-12
**Trigger**: Sub-box 2 Phase 1 closed at sub-phase J with the dual-control
substrate canonical on `origin/main`: the `requireDualControl` middleware, the
privileged-endpoint registry, the per-route binding discipline, the 6
BEAM-compatibility patterns the middleware adopts (per ADR-0026 + the
canonical-record §5), and the contributor-governance authority (per ADR-0027 +
RULE 20). The 6 BEAM patterns were chosen at sub-phase E so a future Elixir/BEAM
port is mechanical — a port, not a rewrite. This ADR is the commitment-to-ship:
NIOV Labs commits to ship the Elixir/BEAM COSMP coordination layer as Sub-box 2
Phase 2 — a 6-8-commit / ~3-4-week mini-arc landing the COSMP coordination
substrate as a production Elixir service alongside the Fastify+TypeScript API.

## Context

The COSMP coordination layer — capsule activation/supervision, OtzarComm message
routing, DBGI (Distributed-Bilateral-Governed-Intelligence) process-group
coordination — has a workload shape that BEAM/Elixir's actor model fits
naturally: lightweight processes (one per capsule), OTP supervisor trees
(fault-isolated restart strategies), and transparent multi-region clustering.
The Node.js + Fastify substrate carries the HTTP-facing API well; it does not
match BEAM's per-entity-process concurrency and supervisor-tree fault tolerance
at the projected coordination-layer scale (>1M DMW capsules, >10M-100M daily
OtzarComm messages, multi-region deployment).

The BEAM-in-production case is concrete, not aspirational. BEAM runs at scale in
production today (messaging, real-time, queue systems are the canonical BEAM
workloads). Shipping a working production Elixir service that carries the COSMP
coordination substrate is investor-credible BEAM-in-production proof — genuine
architectural sophistication demonstrated, not promised.

It is also patent-implementation evidence in a second language. ADR-0020's
two-register IP discipline makes Register 2 (concrete form — the implementation
record) load-bearing. Shipping the same COSMP coordination substrate in a second
language (TypeScript + Elixir) demonstrates the patent-protected COSMP
architecture's language-independence — substrate-coherent patent-implementation
evidence at a two-language register. The 6 BEAM-compatibility patterns adopted by
the sub-phase-E dual-control middleware (message-passing semantics; supervisor-
friendly failure modes — the `DualControlFailure` `TransientFailure |
PermanentFailure` typed union; state reconstructible from durable storage;
event-sourced audit semantics; idempotent verification keys; pure transformation)
are the substrate that makes the port mechanical: each maps to a BEAM-native form
(GenServer call/cast; OTP supervisor `{:error, :transient}` / `{:error,
:permanent}`; Postgres-hydrated process state; OTP event-sourced supervision;
idempotent message keys; pure Elixir functions at the edges).

## Decision

NIOV Labs commits to ship the Elixir/BEAM COSMP coordination layer as Sub-box 2
Phase 2 — a 6-8-commit / ~3-4-week mini-arc. The Phase 2 deliverables:

- `apps/cosmp-router/` — an Elixir/`mix` workspace with an OTP application: a
  root supervisor tree, GenServer-based COSMP coordination, and release builds.
- COSMP message routing as the Elixir service's primary substrate (the
  coordination layer; the API tier stays in Fastify+TypeScript).
- Fastify ↔ Elixir interop — gRPC (or an equivalent; the final transport choice
  is forward-queued to the Phase 2 pre-flight); failure-mode propagation across
  the runtime boundary modelled with the same `TransientFailure | PermanentFailure`
  discipline the dual-control middleware established.
- Integration-tier tests per ADR-0011 covering the dual-runtime substrate.
- Observability substrate — BEAM telemetry; OpenTelemetry interop with the
  TypeScript tier.
- ADR-0029 documenting the canonical Phase 2 architectural decisions as Phase 2
  lands (the Phase 2 analog of this commitment-to-ship ADR).

**The three-language stack canonicalization** (the substrate this commitment
establishes):

- **TypeScript (Fastify)** — the API substrate: every HTTP-facing route; auth;
  routing; the dual-control middleware (per ADR-0026).
- **Elixir (BEAM)** — the COSMP coordination substrate: capsule supervision;
  OtzarComm; DBGI process-group coordination.
- **Python** — the ML / intelligence substrate (future; not in Phase 2 scope —
  named here only to fix the three-language topology).
- **Postgres** — the storage substrate: all three languages read/write
  canonically; no language has exclusive data ownership.

The 6 BEAM-compatibility patterns from ADR-0026 + the canonical-record §5 are the
substrate this ADR commits to ship. Phase 2's Elixir implementation ports each
pattern to BEAM-native form; the substrate is built BEAM-compatible today so the
Phase 2 work is a port, not a rewrite — BEAM is an optimization the substrate was
designed to permit, not a requirement (the Foundation can ship its full Phase 1-9
substrate without BEAM; this ADR commits to ship it *with* BEAM at the
coordination tier).

## Implementation Detail

- **Capsule supervision trees.** Each activated capsule runs as a supervised
  Elixir process; supervisor strategy `:one_for_one` with restart-intensity
  limits; capsule state durable in Postgres (a crashed-and-restarted capsule
  process hydrates from storage — BEAM pattern 3, "state reconstructible from
  durable storage").
- **OtzarComm messaging at scale.** GenServer-based message routers; a pluggable
  transport (gRPC for cross-runtime; potentially BEAM distribution intra-cluster);
  back-pressure via `GenStage`. Each message carries an idempotency key (BEAM
  pattern 5).
- **DBGI as supervised process groups.** Each DBGI runs as a supervised process
  group; coordination via `Registry` + `DynamicSupervisor`.
- **Multi-region BEAM clustering.** `libcluster` for node discovery;
  `Phoenix.PubSub` (or equivalent) for cross-region message routing;
  partition-tolerant via CRDT-backed state where the workload permits.
- **Migration triggers** (the substrate-state observations that trigger the Phase
  2 mini-arc launch — any one suffices):
  - DMW capsule count > 1M.
  - OtzarComm projected > 10M-100M daily messages.
  - A multi-region deployment requirement.
- **Hybrid coexistence.** Fastify+TypeScript handles HTTP; Elixir handles COSMP
  coordination internally; gRPC interop at the boundary; Postgres is the shared
  storage substrate; no exclusive ownership. Two production services to deploy,
  monitor, and debug — the operational cost the Phase 2 mini-arc accepts in
  exchange for the coordination-tier fault-tolerance and distribution properties.

## Consequences

**Easier:**
- Investor-credible BEAM-in-production proof — a working production Elixir service,
  not a promise.
- Patent-implementation evidence in a second language — the COSMP coordination
  substrate's language-independence demonstrated; substrate-coherent at a
  two-language register (ADR-0020).
- Hiring optionality — the BEAM/Elixir community is a deep talent pool for
  distributed systems; a production Elixir service makes Elixir hires immediately
  productive on real substrate.
- The 6 BEAM patterns from sub-phase E make the port mechanical (port, not
  rewrite) — the substrate was designed for this.
- BEAM-native operational properties at the coordination tier — fault tolerance
  (supervisor trees), distribution (transparent clustering), concurrency
  (per-entity processes).

**Harder:**
- 6-8 commits / ~3-4 weeks of focused engineering — the Phase 2 mini-arc is real
  work.
- Dual-runtime operational complexity — two production services to deploy, monitor,
  and debug; release-build + cluster-networking substrate for the Elixir tier.
- A contributor learning curve — Elixir + OTP + the BEAM mental model; the
  `onboarding-for-engineers.md` doc will gain a Phase-2 / BEAM section.
- Interop substrate — gRPC schemas; failure-mode propagation across the runtime
  boundary; consistency expectations between the two tiers.

## Forward Queue

- **Sub-box 2 Phase 2 mini-arc (6-8 commits / ~3-4 weeks)** — indicative shape:
  Phase-2 sub-phase 1 (the Elixir `mix` workspace + OTP application + root
  supervisor tree); sub-phase 2 (the COSMP message-routing GenServer + integration
  tests); sub-phase 3 (the Fastify ↔ Elixir gRPC interop); sub-phases 4-6 (capsule
  supervision + OtzarComm + DBGI substrate); sub-phases 7-8 (observability +
  production readiness). The exact sub-phase decomposition is fixed at the Phase 2
  pre-flight.
- **ADR-0030** — Phase 2 Elixir/BEAM Implementation: Mix Umbrella + COSMP Router +
  DBGI Supervisor + Three-Language Stack Canonicalization (LANDED at Block B
  sub-phase 1 `[BEAM-PHASE-2-ADR]`; documents Phase 2 implementation; the
  17-sub-phase decomposition (expanded 13 → 14 at sub-phase 4a per Q-G split — see ADR-0031; 14 → 15 at sub-phase 5a per Q-P split — see ADR-0032; 15 → 16 at sub-phase 5b-i per Q-R split — see ADR-0033; 16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT split — see ADR-0033 §Forward path); cites this ADR load-bearing for the 6 BEAM patterns
  + forward-queue source). ADR-0029 was SUBSTRATE-BUILD-OPTIMIZATIONS (a different
  scope — the substrate-build meta-tooling arc that ran between this ADR's
  commitment-to-ship and ADR-0030's landing); this catch is documented in
  ADR-0030's Substrate-State Catches Resolved § (catch #1).
- **A future BEAM-coordination-layer canonical-record-analog doc** — mirroring
  `docs/architecture/dual-control-operations-canonical-record.md` but for the BEAM
  coordination substrate (the operational companion to the Phase 2 ADR set).
- **`onboarding-for-engineers.md` gains a Phase-2 / BEAM section** when Phase 2
  contributors onboard — Elixir + OTP + the dual-runtime substrate; Phase 2
  contributors operate under RULE 20 + the contributor-governance discipline
  (ADR-0027).
- **The J-hash of this commit** lives in the commit body — the "this commit"
  placeholders in the canonical-record §6 J-entry, the `section-12-progress.md`
  Sub-box 2 row, and the CLAUDE.md §5 ADR-0026 jump-table line's arc-hash chain
  refer to this commit by substrate position, not by hash literal; this keeps the
  10-commit Sub-box 2 Phase 1 arc at exactly 10 commits (no 11th cascade-close
  commit; a future patent-counsel review resolves the hash via `git show` on the
  `[SEC-BEAM-FORWARD-SUBSTRATE]` commit).
- **Substrate-build optimizations** (forward-queued for ADR-0029, pre-Phase-2):
  the 26-catch arc surfaced three optimization patterns worth formalizing before
  the Phase 2 mini-arc begins. (1) **Automated cascade-target inventory** —
  pre-flight scripts that grep for `N ADRs` / `RULE N` / `ADR-N` / `this commit`
  / `forward: ADR-N` / `sub-phase X forward` patterns across `docs/`, `CLAUDE.md`,
  `AGENTS.md`, surfacing the full cascade landscape before authorization
  (addresses the scope-undercount catches — #14, #15, #16, #20, #22, #24, #25 —
  where the planned cascade missed a target). (2) **Commit-class templates** —
  standard scaffolds for "NEW ADR" / "NEW RULE" / "post-commit-hash cascade"
  capturing the standard cascade scopes by template rather than by recall
  (addresses the cascade-scope-misjudgment pattern). (3) **Strategy-tier prose
  discipline** — plain language at the authorization tier preserves substrate
  clarity at lower token cost (addresses the recursive-prose patterns that added
  bloat across the arc with zero substrate value; the substrate-honest pre-flight
  discipline stays full-fidelity at the engineering tier). ADR-0029 will formalize
  each as a decision with concrete implementation scope; the goal is materially
  fewer catch-resolution tokens across future arcs while preserving the
  substrate-honest pre-flight discipline.

## Substrate-State Catches Resolved

The sub-phase-J pre-flight surfaced three catches (RULE 13 / RULE 18), bringing
the 10-commit Sub-box 2 Phase 1 arc to 26 substrate-state catches:
- **#23** — ADR-0028 title tension: the canonical-record §6 J-entry + the subject
  bracket `[SEC-BEAM-FORWARD-SUBSTRATE]` + the canonical-record §7/§8 prose all
  frame ADR-0028 as "Forward-Substrate: …"; a memory note said it was "reframed to
  commitment-to-ship". Resolution: the **title** matches the canonical substrate
  ("Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule Supervision +
  OtzarComm + DBGI Integration"); the **body** fully carries the commitment-to-ship
  framing as substantive content (this ADR's Decision section is explicit — "NIOV
  Labs commits to ship the Elixir/BEAM COSMP coordination layer as Sub-box 2 Phase
  2 — a 6-8-commit / ~3-4-week mini-arc"). Substrate coherence (title ↔ bracket ↔
  canonical §6 ↔ prose) over title aesthetics.
- **#24** — the canonical-record cascade is bigger than "§6 J-entry": it is the §6
  I-entry I_HASH cascade (`62d472c`) + the §6 J-entry (✅ + title + "this commit"
  placeholder) + line 19 (the doc-header forward-cite → landed citation) + the §8
  "(cited from)" sub-block (forward-cite → landed citation). Mirrors the sub-phase-H
  catch #16 (the §4 + §6 + §8 + line-19 cascade-scope catch).
- **#25** — the CLAUDE.md §5 ADR-0026 jump-table line's arc-hash chain — the catch
  #22 pattern recurring at sub-phase J: the chain `…→\`135fee0\`; sub-phase J
  forward` gets J's `\`62d472c\``-then-`this commit; arc closed` closure marker.

Arc-closure observation: 26 substrate-state catches across the 10-commit arc (E:
11, F: 1, G: 1, H: 4, I: 4, J: 3). Every catch surfaced at pre-flight or pre-edit;
zero broken commits landed on `origin/main`. The substrate-honest pre-flight
discipline (RULE 12 + RULE 13 + RULE 18) is the substrate-state-observation
register the patent-holder substrate depends on; ADR-0027 + RULE 20 canonicalize
the authorization-tier protection of that discipline. Sub-box 2 Phase 1 closes
here.

Bidirectional citations (cited from):

- ADR-0026 (Dual-Control Middleware Pattern + Privileged Endpoint Registry +
  Per-Route Binding Discipline) — load-bearing: the 6 BEAM-compatibility patterns
  this ADR commits to ship are the patterns ADR-0026's middleware substrate adopts
  (per ADR-0026 §Decision + the canonical-record §5). ADR-0026's "(cited from)"
  block back-cites this ADR; this ADR's Phase 2 mini-arc ports those patterns to
  production Elixir/BEAM.
- ADR-0027 (Contributor Governance + AI-Alignment + Rule-Modification Authority) —
  referenced in this ADR's prose context for the Phase 2 contributor governance
  (Phase 2 contributors operate under RULE 20 + the contributor-governance
  discipline; the `onboarding-for-engineers.md` doc gains a Phase-2 / BEAM section).
  Not a load-bearing dependency → no formal "(cited from)" back-cite, consistent
  with the citation-restraint precedent (cf. ADR-0026 referencing ADR-0011/0020 in
  prose without back-cites).
- `docs/architecture/dual-control-operations-canonical-record.md` — referenced for
  §5 (the 6 BEAM-compatibility patterns this ADR commits to ship) + §6 (the
  10-commit arc this ADR closes) + §7 (the Phase 2 forward path). The canonical
  record's line 19 + §8 "(cited from)" sub-block cite this ADR as the sub-phase-J
  commitment-to-ship.
- ADR-0029 (Substrate-Build Optimizations: Cascade-Inventory Scripts +
  Commit-Class Templates + Strategy-Tier Prose Discipline; landed at sub-phase 1
  of the SUBSTRATE-BUILD-OPTIMIZATIONS arc `[SUBSTRATE-BUILD-ADR]`) — load-bearing:
  ADR-0029 formalizes the three optimizations this ADR forward-queued in its
  "Substrate-build optimizations" Forward-Queue bullet; sub-phases 2-5 of that arc
  implement them (the `scripts/preflight/` cascade-grep scripts; the
  `docs/contributing/templates/` commit-class scaffolds; the strategy-tier prose
  discipline; the onboarding cascade).
- ADR-0030 (Phase 2 Elixir/BEAM Implementation: Mix Umbrella + COSMP Router +
  DBGI Supervisor + Three-Language Stack Canonicalization; landed at Block B
  sub-phase 1 `[BEAM-PHASE-2-ADR]`) — **load-bearing**: ADR-0030 is the Phase 2
  implementation ADR fulfilling this ADR's commitment-to-ship. The 17-sub-phase
  Block B mini-arc (expanded 13 → 14 at sub-phase 4a per Q-G split — see ADR-0031;
  14 → 15 at sub-phase 5a per Q-P split — see ADR-0032; 15 → 16 at sub-phase 5b-i
  per Q-R split — see ADR-0033; 16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT
  split — see ADR-0033 §Forward path)
  ports the 6 BEAM-compatibility patterns (this ADR's load-bearing
  citation of ADR-0026 §5) from TypeScript-pattern-mimicking-BEAM to production
  Elixir/BEAM substrate (mix umbrella + COSMP router GenServer + DBGI supervisor
  + gRPC interop + observability + canonical-record-analog doc). The "Forward
  Queue → ADR-0029" pre-existing entry was reframed at sub-phase 1 to point at
  ADR-0030 (catch #1; see ADR-0030 Substrate-State Catches Resolved §).
