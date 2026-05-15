# BEAM Coordination Canonical Record

**Status:** Accepted
**Date:** 2026-05-15
**Trigger:** Sub-phase 12 `[BEAM-CANONICAL-RECORD]` of the Block B Phase 2 mini-arc per ADR-0030 §DBGI sub-phase 12. The implementation-facing companion to ADR-0028 (commitment-to-ship) and ADR-0030 (Phase 2 implementation). Future Claude Code / contributor sessions read this for the complete BEAM coordination posture across the Foundation per RULE 17.
**Scope:** The implementation-facing canonical record of the Elixir/BEAM substrate that ships at HEAD `d72682c` across `apps/cosmp_router/` (COSMP coordination layer) and `apps/dbgi_supervisor/` (DBGI process-group + multi-region cluster substrate). Documents the per-component dispatch flow, the audit-chain cryptographic substrate, the 6 BEAM-compatibility patterns instantiated at production Elixir, the multi-node integration substrate, the no-identity-label observability discipline, and the substrate-honest engineering process that landed the 17/19 sub-phases at canonical register. Does NOT duplicate ADR-0028's commitment-to-ship rationale or ADR-0030's per-sub-phase decision substrate; it cross-references both as source-of-substance and adds the operational layer.
**Cross-references:**
- ADR-0028 (commitment-to-ship Elixir/BEAM coordination layer; 6 BEAM-compatibility patterns named at §3 from `dual-control-operations-canonical-record.md` §5)
- ADR-0030 (Phase 2 implementation; 19-sub-phase mini-arc; per-sub-phase decision substrate)
- ADR-0031 (BEAM Routing Substrate Architecture; sub-phase 4a decision substrate)
- ADR-0032 (BEAM gRPC Interop Architecture; sub-phase 5a decision substrate)
- ADR-0033 (BEAM Persistence + Idempotency + Audit-Chain Cryptographic Substrate; sub-phase 5b-ii decision substrate)
- ADR-0034 (BEAM COSMP Testability Refactor Pattern; sub-phase 6a decision substrate)
- ADR-0035 §9 (Substrate-Build Discipline Canonical; observations 30th-34th relate to sub-phases 10 and 11)
- ADR-0026 §5 (the 6 BEAM-compatibility patterns named in TypeScript dual-control middleware)
- ADR-0001 (three-wallet architecture; Enterprise + Personal + Device DMWs)
- ADR-0002 (append-only audit chain; BEFORE DELETE trigger)
- ADR-0019 (cryptographic-suite posture; SHA-256 + post-quantum-ready primitive selection)
- `docs/architecture/dual-control-operations-canonical-record.md` (the canonical-record analog this document follows in §-structure shape)
- CLAUDE.md RULE 4 (audit trail is sacred), RULE 10 (nothing is ever deleted), RULE 11 (wider-knowledge-check for Elixir/BEAM substrate), RULE 14 (bidirectional citation discipline), RULE 17 (architectural framing is load-on-open), RULE 19 (two-register IP discipline), RULE 20 (rule-modification authority)

---

## 1. Purpose

This document is the implementation-facing canonical record of the Elixir/BEAM coordination substrate at HEAD `d72682c`. ADR-0028 is the *commitment-to-ship* (the architectural why); ADR-0030 is the *Phase 2 implementation* decision substrate (the per-sub-phase what); this record consumes both and adds the operational layer a session building on or operating the Elixir substrate needs: per-component dispatch flow, the audit-chain cryptographic substrate at Elixir register, the 6 BEAM-compatibility patterns instantiated as production Elixir code (with file:line evidence), the multi-node integration substrate, the no-identity-label observability discipline, and the substrate-honest engineering process that produced the 17/19 sub-phases.

When a future session asks "what is the complete BEAM coordination posture across the Foundation, what is implementation-proven at HEAD `d72682c`, and what is forward-looking?" — this document is the answer. For the architectural *why* it points back to ADR-0028; for the per-sub-phase decision substrate it points back to ADR-0030.

**Claims discipline.** Every substantive claim in this record is one of three types and is marked locally:
- **Implementation-proven** (verifiable from code/tests at HEAD `d72682c`): the default; no marker required.
- **ADR-canonical but not yet implementation-proven**: marked `(ADR-canonical; not yet implemented)`.
- **Forward-looking / forward-queued** (founder/operator architectural direction; not yet in repo substrate): marked `(FORWARD-LOOKING)` at each occurrence.

This discipline is non-negotiable. The canonical record is patent-implementation evidence per ADR-0020 Register 2 (concrete form); promoting forward-looking framing into implementation-proven claims would erode the evidence trail.

## 2. The cosmp_router GenServer dispatch flow

`CosmpRouter.Router` (`apps/cosmp_router/lib/cosmp_router/router.ex`, 559 lines) is the COSMP coordination GenServer. The 7 patent-canonical COSMP operations per US 12,517,919 dispatch via `GenServer.call/3` synchronous handle_call clauses:

- `AUTHENTICATE` — `apps/cosmp_router/lib/cosmp_router/router.ex:113` — DMW/principal identity verification; standalone-mode audit emission.
- `NEGOTIATE` — `apps/cosmp_router/lib/cosmp_router/router.ex:143` — cross-DMW capability and scope agreement; standalone-mode audit emission.
- `READ` — `apps/cosmp_router/lib/cosmp_router/router.ex:170` — metadata-first capsule retrieval via the `Storage` facade (ETS-first; Postgres fallthrough on miss); standalone-mode audit emission.
- `WRITE` — `apps/cosmp_router/lib/cosmp_router/router.ex:204` — append-only capsule write via composed-mode (Ecto.Multi: `Storage.Postgres.put` + `Audit.write_audit_event/3` atomically; idempotency check at entry, idempotency record post-success).
- `SHARE` — `apps/cosmp_router/lib/cosmp_router/router.ex:237` — permissioned scope grant across DMWs; composed-mode read-existing + update-permissions + persist + audit.
- `REVOKE` — `apps/cosmp_router/lib/cosmp_router/router.ex:277` — capability revocation; composed-mode same shape as SHARE.
- `AUDIT` — `apps/cosmp_router/lib/cosmp_router/router.ex:323` — append-only audit log query via `Storage.Postgres.audit_chain_for_capsule/1`; standalone-mode audit emission.

`Storage` (`apps/cosmp_router/lib/cosmp_router/storage.ex`, 159 lines) is the facade. Reads are ETS-first with Postgres fallthrough on miss; writes go to Postgres authoritatively then warm ETS. The two-tier read path is the production performance shape; ETS preserves sub-millisecond reads where the hot set fits in memory; Postgres carries durable state and the source-of-truth for the audit chain.

**Composed-mode** (`write_or_replay` helper at `apps/cosmp_router/lib/cosmp_router/router.ex:354-410`) wraps the WRITE/SHARE/REVOKE shared path: `Idempotency.check/2` → `Ecto.Multi(Storage.Postgres.put + Audit.write_audit_event/3)` → `Idempotency.record/3`. The Multi transaction guarantees that either the storage write and the audit event both commit, or both roll back — RULE 4 ("if the audit write fails, the entire action fails") at the database register.

**Telemetry instrumentation** wraps each handle_call clause via `instrument_op/2` (`apps/cosmp_router/lib/cosmp_router/router.ex:514-543`). The wrapper uses `:telemetry.span/3` to emit `[:cosmp_router, :op, :start | :stop | :exception]` events with `op_name` and `status_class` metadata. Per the no-identity-label discipline (§7), the metadata substantively excludes `capsule_id`, `principal_id`, `grantee`, and `entity_id`.

External canonical references for OTP GenServer dispatch: <https://hexdocs.pm/elixir/GenServer.html>.

## 3. The dbgi_supervisor process-group + cluster substrate

`DbgiSupervisor.Application` (`apps/dbgi_supervisor/lib/dbgi_supervisor/application.ex`, 158 lines) supervises 6 children with `:one_for_one` strategy at `apps/dbgi_supervisor/lib/dbgi_supervisor/application.ex:155`:

1. `DbgiSupervisor.PG` — `:pg.start_link(DbgiSupervisor.PG)` at `application.ex:74-77`. Modern OTP-native distributed process-group registry per ADR-0035 §9 D-PHASE-8-PG-VS-GPROC-DISCRIMINATION (21st canonical observation). `:pg` is OTP-native since OTP 23 (replaces deprecated `:pg2`); CRDT-based; cluster-aware by default with strong eventual consistency. `:gproc` is forward-queued at sub-phase 11+ for backward-compatibility / richer pattern-based discovery if substantively load-bearing surfaces *(ADR-canonical; not yet implemented)*.
2. `Registry` — `{Registry, keys: :unique, name: DbgiSupervisor.Registry}` at `application.ex:81`. Per-DMW process lookup canonical at ADR-0028 §3 register; `:unique` keys for one-DMW-one-process addressing.
3. `DynamicSupervisor` — `{DynamicSupervisor, strategy: :one_for_one, name: DbgiSupervisor.DynamicSupervisor}` at `application.ex:103`. Dynamic per-DMW process lifecycle; `:one_for_one` so a single per-DMW process crash does not cascade.
4. `Cluster.Supervisor` (libcluster) at `application.ex:114-118`. Topology configurable via `Application.get_env(:libcluster, :topologies)` per ADR-0018 deployment-agnostic posture; empty default at `config/config.exs`; `Cluster.Strategy.Epmd` canonical at local-dev/test register; `Gossip` / `Kubernetes` / `DNS` at production deployment-target register *(ADR-canonical; production topologies not yet wired in repo substrate)*.
5. `Phoenix.PubSub` (named `DbgiSupervisor.PubSub`) at `application.ex:126`. Cross-node messaging via the PG2 adapter. PG2 substrate at pub/sub topic routing register coexists with the modern `:pg` substrate at distributed process-group register per ADR-0035 §9 D-PHASE-9-PG2-VS-PG-COEXISTENCE (28th canonical observation) — two distinct registers, two distinct namespaces, no conflict.
6. `DbgiSupervisor.PresenceTracker` (Phoenix.Tracker behaviour module at `apps/dbgi_supervisor/lib/dbgi_supervisor/presence_tracker.ex`, 139 lines) at `application.ex:135-139`. CRDT-backed presence per ADR-0028 §3 ("CRDT-backed state where the workload permits") and ADR-0035 §9 D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE (27th canonical observation). Heartbeat protocol with `:broadcast_period` 1500ms default (per `Phoenix.Tracker` docs); `handle_diff/2` callback fires on diff replication.

`DbgiSupervisor.ProcessGroup` (`apps/dbgi_supervisor/lib/dbgi_supervisor/process_group.ex`, 142 lines) is a thin abstraction over `:pg` with `join/2` (`process_group.ex:59-79`), `leave/2` (`process_group.ex:88-110`), `get_members/1`, `get_local_members/1`, `which_groups/0`, and `monitor/1`. `join/2` and `leave/2` are telemetry-instrumented per §7 below.

External canonical references: <https://www.erlang.org/doc/man/pg.html> for `:pg`; <https://hexdocs.pm/elixir/Registry.html> for Registry; <https://hexdocs.pm/elixir/DynamicSupervisor.html> for DynamicSupervisor; <https://hexdocs.pm/libcluster/Cluster.Supervisor.html> for libcluster; <https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html> for Phoenix.PubSub; <https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html> for Phoenix.Tracker; <https://www.erlang.org/doc/system/sup_princ.html> for OTP supervision design principles.

## 4. The audit-chain cryptographic substrate (RULE 4)

`CosmpRouter.Audit` (`apps/cosmp_router/lib/cosmp_router/audit.ex`, 456 lines) implements RULE 4 ("audit trail is sacred; if the audit write fails, the entire action fails") at the Elixir register. The substrate is byte-equivalent to the TypeScript audit chain at the API register per ADR-0033 §Decision 4 (10 fixture pairs verified in CI at every run).

**Cryptographic primitives** (`apps/cosmp_router/lib/cosmp_router/audit.ex:116-202`):
- `sha256_hex/1` (`audit.ex:116`) — `:crypto.hash(:sha256, input) |> Base.encode16(case: :lower)`.
- `canonical_record/1` (`audit.ex:143-178`) — 12-field pipe-joined canonical record string; the deterministic input shape that the SHA-256 chain hashes.
- `canonical_json/1` (`audit.ex:180-202`) — recursive sorted-key JSON-like serialization for the `details` field; deterministic across TS↔Elixir per `apps/cosmp_router/test/cosmp_router/audit/canonical_record_test.exs`.

**Dual-mode write API** (`apps/cosmp_router/lib/cosmp_router/audit.ex:247`):
- `write_audit_event/1` — standalone mode (own transaction); used by AUTHENTICATE / NEGOTIATE / READ / AUDIT and by failure-path emissions.
- `write_audit_event/3` — composed mode (caller-supplied `Ecto.Multi`); used by WRITE / SHARE / REVOKE via the `write_or_replay` helper at `router.ex:354-410`. The composed transaction guarantees atomicity: business mutation + audit event commit together or roll back together.

**BEFORE DELETE trigger ownership** is at the TypeScript register per ADR-0033 §Decision 6 (Prisma owns shared-table DDL per ADR-0025; the Elixir audit substrate writes through Ecto and trusts the trigger that Prisma migrations install). The `audit_events_immutable` BEFORE DELETE trigger fails any DELETE attempt at the database tier; RULE 10 ("nothing is ever deleted") is enforced cryptographically and structurally.

**SYSTEM_PRINCIPALS** (`apps/cosmp_router/lib/cosmp_router/audit.ex:330-360`) include `:cosmp_router` as the 5th principal per ADR-0033 D-5BII-EXEC-3; the Elixir-side audit emissions identify their actor as the COSMP_ROUTER system principal, distinct from `:system`, `:scheduler`, `:audit_pipeline`, and `:bootstrap`.

External canonical references: <https://www.erlang.org/doc/man/crypto.html#hash-2> for `:crypto.hash/2`; ADR-0019 for the cryptographic-suite posture (SHA-256 + post-quantum-ready primitive selection).

## 5. The 6 BEAM-compatibility patterns instantiated in production Elixir

ADR-0028 §3 names 6 BEAM-compatibility patterns originally documented at `dual-control-operations-canonical-record.md` §5 as the substrate that makes a TypeScript→Elixir port mechanical. At HEAD `d72682c` all 6 patterns exist as production Elixir code (Register 2 per ADR-0020), not as TypeScript-pattern-shape. Each pattern with file:line evidence:

**1. Message-passing semantics over shared state.** Each COSMP operation is an independent message with explicit input/output payloads. `CosmpRouter.Router` dispatches via `GenServer.call/3` synchronous handle_call: 7 clauses at `router.ex:113`, `:143`, `:170`, `:204`, `:237`, `:277`, `:323`. Each clause receives a typed Proto request and returns `{:reply, result, state}`. No shared mutable state between concurrent clients (the GenServer serializes); state lives in the GenServer process and is opaque to callers. Reference: <https://hexdocs.pm/elixir/GenServer.html>.

**2. Supervisor-friendly typed failure modes.** `CosmpRouter.Application` (`apps/cosmp_router/lib/cosmp_router/application.ex:104`) and `DbgiSupervisor.Application` (`apps/dbgi_supervisor/lib/dbgi_supervisor/application.ex:155`) both establish supervision trees with `:one_for_one` strategy. A single child crash restarts only that child; siblings continue. Failure modes are typed at the COSMP layer via the Proto error envelope (`apps/cosmp_router/lib/cosmp_router/proto/cosmp.pb.ex` `CosmpError` with `oneof` discrimination per ADR-0032). Reference: <https://www.erlang.org/doc/system/sup_princ.html>; <https://hexdocs.pm/elixir/Supervisor.html>.

**3. State reconstructible from durable storage.** `CosmpRouter.Storage` (`apps/cosmp_router/lib/cosmp_router/storage.ex`) is a two-tier facade: ETS (`apps/cosmp_router/lib/cosmp_router/storage/ets.ex`, 160 lines) is hot-tier cache; Postgres (`apps/cosmp_router/lib/cosmp_router/storage/postgres.ex`, 161 lines) is source-of-truth. Reads are ETS-first with Postgres fallthrough on miss (`storage.ex` `get/2` flow). Writes go to Postgres authoritatively. After a crashed-and-restarted Router GenServer, ETS is empty (process-bound) and reads fall through to Postgres — state is reconstructible from durable storage at any moment.

**4. Event-sourced audit semantics.** `CosmpRouter.Audit.write_audit_event/1` (`audit.ex:247`) and `write_audit_event/3` (composed-mode, same module) write immutable events with SHA-256 chain links per the `canonical_record/1` and `sha256_hex/1` primitives at `audit.ex:116-178`. The chain is append-only (RULE 10) and structurally enforced by the `audit_events_immutable` BEFORE DELETE trigger per ADR-0002. The Elixir register byte-equivalent verifies via 10 fixture pairs in CI per `apps/cosmp_router/test/cosmp_router/audit/canonical_record_test.exs`.

**5. Idempotent verification keys.** `CosmpRouter.Idempotency` (`apps/cosmp_router/lib/cosmp_router/idempotency.ex`, 135 lines) exposes `check/2` (`idempotency.ex:67`) and `record/3` (`idempotency.ex:94`). The `write_or_replay` helper at `router.ex:354-410` computes an idempotency key per (op, capsule_id, version-or-grantee), consults `Idempotency.check/2` at entry, and records via `Idempotency.record/3` post-success. Replays of the same key return the cached result without re-executing the business mutation or emitting a duplicate audit event. The `idempotency_keys` table is owned by Ecto per ADR-0033 D-5BII-EXEC-5 (the first Elixir-internal table that does not require a Prisma migration counterpart).

**6. Pure transformation over imperative control.** `CosmpRouter.Capsule.Translator` (`apps/cosmp_router/lib/cosmp_router/capsule/translator.ex`, 225 lines) is a pure projection between the `Capsule` runtime struct (7 patent layers per US 12,517,919) and the persistence/Proto representations: `pack/1` at `translator.ex:48` (Capsule → MemoryCapsule Ecto schema) and `unpack/1` at `translator.ex:117` (MemoryCapsule → Capsule). `CosmpRouter.Capsule.Validator` (`apps/cosmp_router/lib/cosmp_router/capsule/validator.ex`, 170 lines) `validate/1` at `validator.ex:46` is also a pure function `Capsule → {:ok, validated} | {:error, %CosmpError{}}`. Side effects (DB reads, audit writes, telemetry emission) are at the edges (`Router.handle_call` clauses, the `write_or_replay` helper); transformation is at the center, pure.

These 6 patterns are not aspirational. They exist as observable Elixir code at HEAD `d72682c`; each citation above is a verifiable file:line reference. ADR-0028's commitment-to-ship promise — "the 6 BEAM-compatibility patterns ... become observable Elixir/OTP code, not pattern-shaped TypeScript" — is satisfied at this commit.

## 6. The Block B Phase 2 mini-arc (19 sub-phases; 17/19 closed at HEAD `d72682c`)

The Block B Phase 2 mini-arc per ADR-0030 §Decision substrate. Sub-phase identifier list `{1, 2, 3, 4a, 4b, 5a, 5b-i, 5b-ii, 5b-iii, 6a, 6b, 6c, 7, 8, 9, 10, 11, 12, 13}` per D-SUBPHASE-COUNT-PRECISION canonical (ADR-0035 §9 10th observation). Closed at HEAD `d72682c`: 17 sub-phases. Remaining: `{12, 13}`.

Per-sub-phase commit lineage (selected; full lineage at `git log 5712a2b..d72682c`):

| Sub-phase | Commit | Substrate landed |
|---|---|---|
| 1 | `[BEAM-PHASE-2-ADR]` | ADR-0030 — the Phase 2 decision document |
| 2 | `[BEAM-MIX-WORKSPACE]` `8cffaca` | Mix umbrella + `.tool-versions` (Elixir 1.19.5 / OTP 28) |
| 3 | `[BEAM-COSMP-APP-SKELETON]` `290f327` | `apps/cosmp_router/` OTP app skeleton + CI Elixir job |
| 4a | `[BEAM-COSMP-GENSERVER-ADR]` `57574ba` | ADR-0031 — GenServer state shape + 7-op dispatch decision substrate |
| 4b | `[BEAM-COSMP-GENSERVER-CODE]` `5712a2b` | Router (7 COSMP ops) + State + Capsule placeholder |
| 5a | `[BEAM-COSMP-INTEROP-ADR]` `27fa788` | ADR-0032 — gRPC interop decision substrate |
| 5b-i | `[BEAM-COSMP-INTEROP-GRPC]` `bb5f3a3` | 7-op gRPC interop (Elixir server + TS client) |
| 5b-ii | `[BEAM-COSMP-INTEROP-PERSISTENCE]` `3df3805` | ADR-0033 + Repo + 7-layer Translator + audit-chain crypto |
| 5b-iii | `[BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY]` + `[BEAM-COSMP-INTEROP-INTEGRATION-ROUTER]` | idempotency_keys table + Router composed-mode |
| 6a | `[BEAM-COSMP-TESTABILITY-REFACTOR]` `9361d9f` | ADR-0034 — name-configurability for testability + RULE 11 D-WIDER-KNOWLEDGE-CHECK origin |
| 6b | `[BEAM-COSMP-INTEGRATION-TESTS]` `7ef95a2` | Router + gRPC integration tests (UUID-cast guard + utc_datetime_usec + start_owner!) |
| 6c | `[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]` `6db538e` | RULE 11 + ADR-0035 + `elixir-beam-best-practices.md` |
| 7 | `[BEAM-DBGI-APP-SKELETON]` `e80ff14` | `apps/dbgi_supervisor/` OTP app skeleton |
| 8 | `[BEAM-DBGI-PROCESS-GROUPS]` `d9a6766` | `:pg` modern OTP-native + Registry + DynamicSupervisor |
| 9 | `[BEAM-DBGI-LIBCLUSTER]` `fbf2634` | libcluster + Phoenix.PubSub + Phoenix.Tracker |
| 10 | `[BEAM-DBGI-INTEGRATION-TESTS]` `8f239e9` (+ `6562571`, `43e7289` correction lineage) | `:peer` multi-node + `:pg`/Tracker/PubSub cross-node + partition recovery (19 integration tests) |
| 11 | `[BEAM-OBSERVABILITY]` `d72682c` | telemetry + metrics + Prometheus bridge + structured Logger + no-identity-label discipline |
| 12 | this commit | this canonical record |
| 13 | (forward) | `[BEAM-ARC-CLOSURE]` (ADR-0030 sub-phase 13 spec; not yet landed) |

Substrate-build observation candidates surfaced at the arc and canonical at ADR-0035 §9: 18th D-AMENDMENT-FORWARD-QUEUE-CLOSURE-CASCADE; 19th D-PRE-COMMITTED-ADR-CANONICAL-VERIFICATION; 20th D-GIT-STATUS-SHORT-UNTRACKED-DIR-COLLAPSE; 21st D-PHASE-8-PG-VS-GPROC-DISCRIMINATION; 22nd D-STRATEGIC-TIER-TEMPORAL-ESTIMATE-OVER-PROJECTION; 23rd D-CLUSTER-NUMBERING-DRIFT; 32nd D-PHASE-10-DISCONNECT-TEST-CASCADE; 33rd D-PHASE-10-PARTITION-SURVIVAL-CANONICAL; 34th D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE. Forward-queued (documented at commit body / module moduledoc / ADR amendment body surfaces; not promoted to ADR-0035 §9 numbered cluster per Option β substrate-honest discipline): 24th D-OBSERVATION-CLUSTER-SUBSTRATE-ARCHITECTURAL-BOUNDARY; 25th D-FOUR-REGISTER-SUBSTRATE-DISCIPLINE; 26th D-TASK-TRACKER-VS-SUBSTRATE-STATE-DRIFT; 27th D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE; 28th D-PHASE-9-PG2-VS-PG-COEXISTENCE; 29th D-PHOENIX-TRACKER-PHX-REF-META-INJECTION; 30th D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET; 31st D-PHASE-10-PEER-VS-LOCAL-CLUSTER-DISCRIMINATION; D-PHASE-10-PEER-CLOSURE-LOADING; D-PHASE-10-CI-PRESENCE-TRACKER-TIMING-CASCADE; D-PHASE-11-PROMETHEUS-BRIDGE-STALENESS.

## 7. Observability substrate (sub-phase 11) and the no-identity-label discipline

Sub-phase 11 `[BEAM-OBSERVABILITY]` at `d72682c` lands `:telemetry_metrics ~> 1.1` + `:telemetry_poller ~> 1.3` + `:telemetry_metrics_prometheus ~> 1.1` + `:logger_json ~> 7.0`. Two Telemetry supervisors (`CosmpRouter.Telemetry` at `apps/cosmp_router/lib/cosmp_router/telemetry.ex`, 214 lines; `DbgiSupervisor.Telemetry` at `apps/dbgi_supervisor/lib/dbgi_supervisor/telemetry.ex`, 213 lines) aggregate Telemetry.Metrics definitions, run `:telemetry_poller` for VM stats, and expose a localhost-bound Prometheus scrape endpoint (cosmp_router on port 9568; dbgi_supervisor on port 9569; both configurable via `Application.get_env` per ADR-0018 deployment-agnostic posture).

**Telemetry events** (component-namespaced per Q3 LOCKED at sub-phase 11):
- `[:cosmp_router, :op, :start | :stop | :exception]` — emitted via `:telemetry.span/3` from `instrument_op/2` at `router.ex:514-543`.
- `[:cosmp_router, :storage, :put | :get | :delete]` *(ADR-canonical; emission sites not yet wired in `storage.ex`)*.
- `[:cosmp_router, :audit, :write]` *(ADR-canonical; emission sites not yet wired in `audit.ex`)*.
- `[:cosmp_router, :idempotency, :hit | :miss | :record]` *(ADR-canonical; emission sites not yet wired in `idempotency.ex`)*.
- `[:dbgi_supervisor, :process_group, :stop]` — emitted from `process_group.ex` `join/2` and `leave/2`.
- `[:dbgi_supervisor, :tracker, :diff]` — emitted from `presence_tracker.ex` `handle_diff/2` (count + diff_size only; no topic, no keys, no meta).
- `[:dbgi_supervisor, :cluster, :event | :size]` — `:size` emitted via `Telemetry.emit_cluster_size/0` periodic poll.

**Metric type selection.** `counter` for counts; `distribution` with histogram buckets `[1, 5, 10, 50, 100, 500, 1000, 5000]` ms for durations; `last_value` for gauges via `:telemetry_poller`. `summary` is dropped by `TelemetryMetricsPrometheus` at the Prometheus exposition register; `distribution` is canonical at the Prometheus histogram register.

**The no-identity-label discipline (D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE; ADR-0035 §9 34th canonical).** Foundation observability is a compliance + governance + sovereignty + privacy boundary, not generic telemetry. The discipline forbids identity-bearing and high-cardinality labels at telemetry events, metrics tags, and structured Logger metadata.

*ALLOWED tags:* `op_name` (COSMP enum, public per US 12,517,919) + `status_class` (ok/error) + `exception_class` + `storage_op` (put/get/delete) + `tracker_event` (join/leave) + `event_type` + `outcome` (success/failure) + `process_group_name` (only fixed substrate values like `DbgiSupervisor.PG`) + normalized `node_role` / `node_class` / `cluster_role` + `app` + `component` + `environment` (only if non-customer-identifying).

*FORBIDDEN tags:* `entity_id` + `capsule_id` + `dmw_id` + `wallet_id` + `tenant_id` + `task_id` + `topic_tag` + `actor_principal_email` + customer/org/government/business names + raw BEAM `node` names + hostnames + IP addresses + externally-traceable request IDs + Phoenix.Tracker keys + Phoenix.Tracker meta maps + `:pg` member identifiers + capsule payloads + raw task context + customer/org-bearing document names or file paths + proprietary context + free-text capsule content + ANY reconstructable lineage back to a DMW, task, customer, entity, or memory capsule.

Test enforcement: `apps/cosmp_router/test/cosmp_router/telemetry_test.exs` (8 tests) and `apps/dbgi_supervisor/test/dbgi_supervisor/telemetry_test.exs` (11 tests) substantively assert that no metric tag includes any forbidden identity-bearing label and that all tags are in the canonical allow-list. The discipline is enforced as substrate, not policy.

**Structured Logger** uses `:logger_json` Basic formatter at `:default_handler` per Elixir 1.19+ new-logger discipline (per-handler formatter args; `config/config.exs`). Allow-listed metadata: `app`, `component`, `op_name`, `status_class`, `storage_op`, `tracker_event`, `event_type`, `outcome`, `duration_ms`, `node_role`. SIEM-friendly JSON output analogous to the TypeScript pino canonical at `STRUCTURED_LOGGING_SCHEMA.md`.

External canonical references: <https://hexdocs.pm/telemetry_metrics/Telemetry.Metrics.html>; <https://hexdocs.pm/telemetry_poller/Telemetry.Poller.html>; <https://hexdocs.pm/telemetry_metrics_prometheus/TelemetryMetricsPrometheus.html>; <https://prometheus.io/docs/practices/naming/> and <https://prometheus.io/docs/practices/instrumentation/#do-not-overuse-labels> for cardinality discipline.

## 8. Multi-node integration substrate (sub-phase 10)

Sub-phase 10 `[BEAM-DBGI-INTEGRATION-TESTS]` at `8f239e9` lands the multi-node integration substrate. 19 integration tests across 5 files at `apps/dbgi_supervisor/test/integration/`:
- `cluster_test.exs` (4 tests) — bidirectional connectivity + Cluster.Supervisor aliveness.
- `process_group_cluster_test.exs` (3 tests) — `:pg` join/leave bidirectional + leave propagation.
- `presence_replication_test.exs` (3 tests) — Phoenix.Tracker CRDT replication bidirectional + untrack propagation.
- `pubsub_broadcast_test.exs` (3 tests) — `Phoenix.PubSub.broadcast/3` cross-node bidirectional + `local_broadcast/3` node-locality.
- `partition_recovery_test.exs` (6 tests) — full disconnect → consistency → reconnect → `:pg` re-replication → Phoenix.Tracker CRDT re-merge → Phoenix.PubSub broadcast resumption cycle.

**The `:peer` partition-survival canonical (D-PHASE-10-PARTITION-SURVIVAL-CANONICAL; ADR-0035 §9 33rd).** `apps/dbgi_supervisor/test/support/cluster_helpers.ex` provides two peer-start helpers:
- `start_peer!/1` — default `:peer.start_link` with Distributed Erlang as the control channel; `peer_down: :stop` default; suitable for non-partition multi-node tests.
- `start_partition_survival_peer!/1` — `:peer.start_link(%{name: ..., connection: 0, peer_down: :continue, ...})`. `connection: 0` uses an alternative TCP control channel (auto-port) independent of Distributed Erlang; `peer_down: :continue` keeps the controlling process alive on connection loss. The peer survives `Node.disconnect/1` because the alternative TCP channel is unaffected by Distributed Erlang severance.

Settle timing per source-knowledge canonical applied during sub-phase 10 RULE 11 research gate: `@recovery_wait_ms 5000` (3× Phoenix.Tracker `:broadcast_period`) for CRDT re-merge convergence; `@pg_settle_ms 500` for `:pg` membership re-replication post-`Node.connect`; `:peer` `wait_boot 30_000` for full app-tree boot.

**Per-file isolation canonical (RQ4).** Each integration test file uses its own `setup_all` peer (named `:dbgi_peer_cluster`, `:dbgi_peer_pg`, `:dbgi_peer_presence`, `:dbgi_peer_pubsub`, `:dbgi_peer_partition`). Per-file isolation prevents cascade across files; ExUnit's `async: false` on each module serializes runs across the suite, so port conflicts are avoided.

External canonical references: <https://www.erlang.org/doc/man/peer.html> for `:peer`; <https://hexdocs.pm/elixir/Node.html> for Node.

## 9. Privacy, sovereignty, and governance posture

This canonical record is patent-implementation evidence per ADR-0020 Register 2. The privacy/sovereignty/governance framing here distinguishes substrate that is implementation-proven at HEAD `d72682c` from substrate that is forward-looking architectural direction.

**Implementation-proven at HEAD `d72682c`:**
- DMW memory capsule contents are not logged, exported, labeled, or exposed through observability. The no-identity-label discipline (§7) is enforced as substrate via the test allow-list / forbidden-list at `telemetry_test.exs` in both apps.
- The append-only audit chain (§4) is enforced at the database tier via the `audit_events_immutable` BEFORE DELETE trigger per ADR-0002.
- Cryptographic governance is enforced in code via SHA-256 chain links and the COSMP permission model (ADR-0019 cryptographic-suite posture; primitives are post-quantum-ready by selection).
- Three-wallet architecture per ADR-0001: Enterprise + Personal + Device DMWs.
- 7 COSMP operations per US 12,517,919: AUTHENTICATE / NEGOTIATE / READ / WRITE / SHARE / REVOKE / AUDIT (ADR-0009 enumeration; implemented at `router.ex` per §2).
- DECENTRALIZED in DMW means SOVEREIGNTY (CLAUDE.md §1; substrate is deployment-target agnostic per ADR-0018 — managed cloud, sovereign cloud, on-premise, or air-gapped).
- COSMP governs scoped memory access, permissions, revocation, audit, and policy. The 7 ops at `router.ex` cover the access-grant + revocation + audit-query surface; permission-model details are at the API tier (`apps/api/src/services/cosmp/`).

**EntityType substrate at HEAD `d72682c`:** `packages/database/prisma/schema.prisma` enumerates 6 EntityTypes — `PERSON`, `COMPANY`, `AI_AGENT`, `DEVICE`, `APPLICATION`, `GOVERNMENT`. These are the entity classes with implementation-proven canonical at the schema register.

**Forward-looking (founder/operator architectural direction; not yet implementation-proven):**
- **Federation Cloud monetization of depersonalized DMW cohort intelligence (FORWARD-LOOKING).** The repo substrate at HEAD `d72682c` does not contain a Federation Cloud subsystem, a depersonalization pipeline, or a cohort-monetization data path. The intent is that monetization is based on depersonalized cohort data, not identifiable data, not task-scoped memory, not memory capsule payloads, not PII, and not Business Identifiable Information. Marked FORWARD-LOOKING here to keep the canonical record substrate-honest.
- **Depersonalized improvement signals for foundation/system improvement and customer experience (FORWARD-LOOKING).** Distinct from the Federation Cloud monetization scope above. The intent is that depersonalized signals improve the foundation and customer experience without exposing identifiable data. The pipeline that depersonalizes is not yet implementation-proven in the repo.
- **Disconnect / scope closure supporting forgetting of task-scoped memory where required (partial; ADR-canonical via RULE 10 + Sub-box 5 Family 4 pseudonymization forward-queue).** RULE 10 (CLAUDE.md §3) establishes the soft-delete invariant; the clarifying note acknowledges Sub-box 5 Family 4 will introduce pseudonymization for right-to-erasure compliance (GDPR Article 17). The pseudonymization substrate is not yet implementation-proven at HEAD `d72682c`.
- **Robotics and machinery as DMW entities (FORWARD-LOOKING).** The current EntityType enum does not enumerate `ROBOT` or `MACHINERY`. The closest current substrate is `DEVICE`. Extension of the EntityType enum to cover robotics and machinery would be a future schema migration with downstream compliance and permission-model implications; not yet in repo substrate.
- **Per-capsule supervised Elixir process (ADR-canonical; not yet implemented).** ADR-0028 §3 names "each activated capsule runs as a supervised Elixir process". At HEAD `d72682c` the storage substrate is the ETS+Postgres facade per §2; per-capsule GenServer processes with restart-intensity limits and Postgres-hydrated state are not yet wired.
- **OtzarComm message routing at scale (ADR-canonical; not yet implemented).** ADR-0028 §3 names "GenServer-based message routers; back-pressure via `GenStage`". OtzarComm substrate is not yet in `apps/cosmp_router/` or `apps/dbgi_supervisor/`.
- **Python ML substrate (ADR-canonical; not in repo).** ADR-0028 §3 names Python as the ML / intelligence substrate at the three-language stack canonicalization. No Python code exists in the repo at HEAD `d72682c`.
- **Migration triggers (ADR-canonical; not yet load-bearing).** ADR-0028 §3 names migration triggers (>1M DMW capsules / >10M-100M daily OtzarComm / multi-region deployment). At HEAD `d72682c` the BEAM substrate ships as a coordination layer ahead of those triggers; production load that exercises the triggers is not yet in scope.

**On scale and BEAM.** BEAM/Elixir provides the concurrency model (lightweight processes), the supervision model (OTP supervisors + restart strategies), the distribution substrate (Distributed Erlang + libcluster), the telemetry substrate (`:telemetry`), and the fault-tolerance substrate (let-it-crash + supervisor-restart) that the COSMP coordination layer requires. BEAM does not by itself solve billion-entity scale. Billion-entity scale requires domain sharding (DMW boundaries are the sharding unit), locality of execution (per-region deployments), scoped coordination (`:pg` namespaced scopes; `Registry` `:unique` keys), backpressure (the GenStage forward-queue per ADR-0028 §3 *(ADR-canonical; not yet implemented)*), horizontal distribution (libcluster topology configurable per deployment-target), and protocol-level governance (COSMP scope/permission/revocation semantics enforced cryptographically). The BEAM substrate makes those mechanisms tractable; the architecture and the protocol carry the scale.

## 10. Substrate-honest engineering discipline (the process record)

The 17/19 sub-phases between `5712a2b` and `d72682c` produced a method record worth canonicalizing. The discipline is observable at git, ADR, and substrate-build registers.

**Append-only history.** No force-push after public push. The Sub-phase 10 fix lineage at `8f239e9` → `6562571` → `43e7289` is three commits, each appending a corrected understanding rather than rewriting the history of the prior:
1. `8f239e9` `[BEAM-DBGI-INTEGRATION-TESTS]` — sub-phase 10 substrate landing (CI red on Elixir tier; one fragile mailbox-timing assertion).
2. `6562571` `[BEAM-DBGI-CI-TIMING]` — first conservative timing-budget correction (3000ms = 2× `:broadcast_period`); CI red again (timing hypothesis falsified).
3. `43e7289` `[BEAM-DBGI-CI-TIMING]` — fragile `handle_diff` mailbox assertion removed; pre-removal coverage-map gate confirmed no unique required substrate behavior was lost; CI green.

The lineage is the audit trail of falsification + correction at the substrate-build register. CI is substrate truth. A test that passes locally but fails on CI is not a CI problem; the test is fragile at a register the local environment does not exercise.

**ADR amendment pattern (canonical-pattern register clarification, not architectural-register supersession).** Sub-phases 8/9/10/11 each amended ADR-0030 §DBGI in the same commit that landed the sub-phase substrate. Each amendment names what landed (component names + file:line) without superseding the architectural decision substrate. The pattern is canonical at substantive register; ADR-0034 §Sub-decision 3-amendment is the prior canonical example.

**RULE 11 (wider-knowledge-check for Elixir/BEAM substrate).** Sub-phase 6c filled the previously-vacant RULE 11 with the D-WIDER-KNOWLEDGE-CHECK discipline: when working with Elixir/BEAM substrate and substrate-state observations suggest architectural-register coupling, research broader Elixir/BEAM community canonical patterns BEFORE authorizing fixes at the local substrate. The pre-flights for sub-phases 9 (Phoenix.Tracker), 10 (`:peer` partition-survival), and 11 (telemetry + `:logger_json` compatibility gate) all engaged RULE 11 with 4-RQ research gates documented at canonical-coherence verification register.

**Sub-phase 10 CI falsification lineage (the canonical instance).** Sub-phase 10 first attempted a strict assertion of "during partition" `Node.list/0` emptiness (D-PHASE-10-DISCONNECT-TEST-CASCADE; 32nd). OTP's modern kernel auto-maintains active Distributed Erlang connections; the assertion was racy and CI-fragile. The substrate-coherent fix per RULE 11 RQ1 was the partition-survival peer pattern (D-PHASE-10-PARTITION-SURVIVAL-CANONICAL; 33rd) — `:peer` `connection: 0` + `peer_down: :continue` plus per-file isolation. The 19 integration tests now exercise the full disconnect → consistency → reconnect → re-merge cycle without strict during-partition state assertions. The lesson: tests must verify the right behavior at the right tier; mailbox-timing assertions for a stub callback at the unit tier are not load-bearing if state-based verification covers the same substrate at a more stable abstraction.

**No-identity-label discipline as test substrate.** Sub-phase 11 lands the privacy + cardinality discipline as code, not policy. The forbidden-list at `telemetry_test.exs` in both apps would fail at CI if a future commit added an identity-bearing label to a metric tag. The discipline is enforced as substrate; the test is the gate.

**Substrate-honest decision discipline (Option β).** At ADR-0035 §9, observation candidates 24th–31st surfaced during sub-phases 7-10 but were not promoted to the numbered cluster (documented at commit body / module moduledoc / ADR amendment body surfaces). Promotion requires explicit operator-tier authorization per the substrate-architectural pairing rationale (e.g., 33rd promoted alongside 32nd because they document the cascade and the canonical fix together). The numbering discontinuity 23 → 32 → 33 → 34 is preserved at the substrate-state ground truth register per Option β substrate-honest discipline; renumbering would erase the audit trail of which observations crossed the promotion bar.

## 11. Forward paths

The Block B Phase 2 mini-arc closes at sub-phase 13 `[BEAM-ARC-CLOSURE]` per ADR-0030 §DBGI sub-phase 13 spec (onboarding cascade + `section-12-progress.md` row + ADR-0028 forward-queue conversions + ADR-0030 arc-closure cascade). The remaining substrate paths that are canonical at ADR or operator-tier register but not yet implementation-proven:

- **Per-capsule supervised Elixir process** (ADR-canonical; ADR-0028 §3). Each activated capsule as a supervised GenServer with restart-intensity limits and Postgres-hydrated state. Implementation triggers when the migration triggers (ADR-0028 §3) approach.
- **OtzarComm messaging at scale** (ADR-canonical; ADR-0028 §3). GenServer-based message routers + GenStage backpressure + idempotency keys. Triggered by the >10M-100M daily OtzarComm projection.
- **Multi-region production topology** (ADR-canonical; ADR-0028 §3). libcluster with `Cluster.Strategy.Gossip` / `Kubernetes` / `DNS` per the deployment-target. The `Application.get_env(:libcluster, :topologies)` override path is wired (per ADR-0018); production topology config not yet in repo.
- **Python ML substrate** (ADR-canonical; ADR-0028 §3). The third language at the three-language stack canonicalization; no Python code in repo at HEAD `d72682c`.
- **`:gproc` backward-compatibility / pattern-based discovery** (forward-queued at sub-phase 11+ per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st). Adopted only if substantively load-bearing surfaces.
- **Partition tolerance + failover semantics expansion** (forward-queued at future sub-phase TBD per D-PHASE-10-DISCONNECT-TEST-CASCADE 32nd reframing). The 6-test partition recovery cycle at sub-phase 10 is the foundation; future expansion (multi-partition scenarios; cross-region partition; long-duration partition crossing the `:down_period` 30s threshold) is forward-queued.
- **Federation Cloud + cohort + depersonalization substrate** (FORWARD-LOOKING; not yet in repo). When substrate exists, a future ADR canonicalizes it; this canonical record would be amended.
- **EntityType extension for robotics + machinery** (FORWARD-LOOKING; not yet in repo). Schema migration with downstream compliance and permission-model implications.

## 12. References

**ADRs:**
- ADR-0001 (`docs/architecture/decisions/0001-three-wallet-architecture.md`) — the three-wallet architecture (Enterprise + Personal + Device DMWs).
- ADR-0002 (`docs/architecture/decisions/0002-append-only-audit-chain.md`) — the `audit_events_immutable` BEFORE DELETE trigger.
- ADR-0009 — COSMP 7-operation enumeration.
- ADR-0018 (`docs/architecture/decisions/0018-deployment-target-agnosticism-posture.md`) — deployment-target agnostic posture.
- ADR-0019 (`docs/architecture/decisions/0019-cryptographic-suite-posture.md`) — cryptographic-suite posture.
- ADR-0020 (`docs/architecture/decisions/0020-two-register-ip-discipline.md`) — two-register IP discipline (Register-1 / Register-2).
- ADR-0026 (`docs/architecture/decisions/0026-dual-control-middleware-pattern.md`) — the 6 BEAM-compatibility patterns named at §5 (TypeScript dual-control middleware).
- ADR-0028 (`docs/architecture/decisions/0028-beam-coordination-layer.md`) — commitment-to-ship; cited as source-of-substance for §1.
- ADR-0030 (`docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md`) — Phase 2 implementation; 19-sub-phase mini-arc; cited as source-of-substance for §2-§8.
- ADR-0031 (`docs/architecture/decisions/0031-beam-routing-substrate-architecture.md`) — sub-phase 4a decision substrate.
- ADR-0032 (`docs/architecture/decisions/0032-beam-grpc-interop-architecture.md`) — sub-phase 5a decision substrate.
- ADR-0033 (`docs/architecture/decisions/0033-beam-persistence-idempotency-audit-chain-cryptographic-substrate.md`) — sub-phase 5b-ii decision substrate.
- ADR-0034 (`docs/architecture/decisions/0034-beam-cosmp-testability-refactor-pattern.md`) — sub-phase 6a decision substrate; D-WIDER-KNOWLEDGE-CHECK origin.
- ADR-0035 §9 (`docs/architecture/decisions/0035-substrate-build-discipline-canonical.md`) — substrate-build discipline canonical observations 1-34.

**Code substrate (cited at file:line in sections above):**
- `apps/cosmp_router/lib/cosmp_router/router.ex` (559 lines) — 7 COSMP ops dispatch + composed-mode `write_or_replay` + `instrument_op` telemetry wrapper.
- `apps/cosmp_router/lib/cosmp_router/application.ex` (107 lines) — supervision tree.
- `apps/cosmp_router/lib/cosmp_router/storage.ex` (159 lines) + `storage/ets.ex` (160 lines) + `storage/postgres.ex` (161 lines) — two-tier storage facade.
- `apps/cosmp_router/lib/cosmp_router/audit.ex` (456 lines) — SHA-256 audit-chain + dual-mode write API + canonical primitives.
- `apps/cosmp_router/lib/cosmp_router/idempotency.ex` (135 lines) — `check/2` + `record/3` for the idempotent verification keys pattern.
- `apps/cosmp_router/lib/cosmp_router/capsule/translator.ex` (225 lines) + `capsule/validator.ex` (170 lines) — pure pack/unpack + validate.
- `apps/cosmp_router/lib/cosmp_router/telemetry.ex` (214 lines) — Telemetry.Metrics + Prometheus reporter for cosmp_router.
- `apps/dbgi_supervisor/lib/dbgi_supervisor/application.ex` (158 lines) — 6-child supervision tree.
- `apps/dbgi_supervisor/lib/dbgi_supervisor/process_group.ex` (142 lines) — `:pg` thin abstraction with telemetry instrumentation.
- `apps/dbgi_supervisor/lib/dbgi_supervisor/presence_tracker.ex` (139 lines) — Phoenix.Tracker behaviour with `handle_diff/2` instrumented.
- `apps/dbgi_supervisor/lib/dbgi_supervisor/telemetry.ex` (213 lines) — Telemetry.Metrics + Prometheus reporter for dbgi_supervisor.

**Test substrate:**
- `apps/cosmp_router/test/cosmp_router/audit/canonical_record_test.exs` — TS↔Elixir audit-chain byte-equivalence (10 fixture pairs).
- `apps/cosmp_router/test/cosmp_router/router_test.exs` — Router 7-op handle_call coverage.
- `apps/cosmp_router/test/cosmp_router/telemetry_test.exs` (8 tests) — metric registration + tag allow-list / forbidden-list enforcement + instrument_op span.
- `apps/dbgi_supervisor/test/dbgi_supervisor/telemetry_test.exs` (11 tests) — same shape for dbgi_supervisor.
- `apps/dbgi_supervisor/test/integration/` — 5 files covering bidirectional cluster connectivity, cross-node `:pg` membership, Phoenix.Tracker CRDT replication, Phoenix.PubSub broadcast, and partition recovery (19 tests total).

**Companion canonical record:**
- `docs/architecture/dual-control-operations-canonical-record.md` — the §-structure analog this record follows; §5 names the 6 BEAM-compatibility patterns originally adopted in TypeScript.

**External canonical sources** (cited where load-bearing in sections above):
- Erlang/OTP supervision design principles: <https://www.erlang.org/doc/system/sup_princ.html>; <https://hexdocs.pm/elixir/Supervisor.html>.
- Erlang `:pg` module: <https://www.erlang.org/doc/man/pg.html>.
- Erlang `:peer` module: <https://www.erlang.org/doc/man/peer.html>.
- Erlang `:crypto` module: <https://www.erlang.org/doc/man/crypto.html>.
- Elixir GenServer: <https://hexdocs.pm/elixir/GenServer.html>.
- Elixir Registry: <https://hexdocs.pm/elixir/Registry.html>.
- Elixir DynamicSupervisor: <https://hexdocs.pm/elixir/DynamicSupervisor.html>.
- Elixir Node: <https://hexdocs.pm/elixir/Node.html>.
- libcluster: <https://hexdocs.pm/libcluster/Cluster.Supervisor.html>.
- Phoenix.PubSub: <https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html>.
- Phoenix.Tracker: <https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html>.
- Telemetry.Metrics: <https://hexdocs.pm/telemetry_metrics/Telemetry.Metrics.html>.
- Telemetry.Poller: <https://hexdocs.pm/telemetry_poller/Telemetry.Poller.html>.
- TelemetryMetricsPrometheus: <https://hexdocs.pm/telemetry_metrics_prometheus/TelemetryMetricsPrometheus.html>.
- Prometheus naming + label cardinality best practices: <https://prometheus.io/docs/practices/naming/>; <https://prometheus.io/docs/practices/instrumentation/#do-not-overuse-labels>.

**Bidirectional citations (cited from):**
- ADR-0030 §DBGI sub-phase 12 — back-cites this canonical record at the sub-phase 12 amendment landing canonical at substantive register at the same commit.
- ADR-0028 — back-citation from ADR-0028 forward-queue closure register canonical at substantive register canonical (forward-queued to sub-phase 13 arc-closure cascade per ADR-0030 §DBGI sub-phase 13 spec).
- ADR-0035 §9 30th-34th — back-citations canonical at substantive register from the §9 numbered observations to this canonical record's §6, §7, §8, §10 (forward-queued to sub-phase 13 arc-closure cascade per ADR-0030 §DBGI sub-phase 13 spec; this commit substantively limits scope to ADR-0030 amendment per Q5 LOCKED).
