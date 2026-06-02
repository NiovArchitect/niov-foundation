# ADR-0091 — BEAM Living Coordination Runtime Expansion Doctrine (Design-Only)

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

LEI sequence Step 7 per Founder direction:

> "BEAM should become the living coordination fabric where appropriate."
> "Use BEAM for: supervised actor lifecycles / long-running sessions / workflow coordination / event supervision / backpressure / PubSub / Broadway-style ingestion / fault isolation / retry supervision / concurrent agent coordination."
> "Do not use BEAM for: simple CRUD / basic CT pages / static catalogs / simple request/response handlers."
> "Do not force BEAM if TypeScript is safer for the current slice."
> "Start with one bounded supervised process, not a massive rewrite."

ADR-0069 §2.3 (Elixir/BEAM Substrate-Coherence Law, Accepted 2026-05-31) already canonicalized BEAM's role:

> *"Elixir should run the living processes."*

ADRs 0028 (BEAM Coordination Layer) + 0030 (Phase 2 BEAM Implementation) + 0031 (BEAM Routing Substrate Architecture) + 0032 (BEAM gRPC Interop Architecture) + 0033 (BEAM Persistence + Idempotency + Audit-Chain) + 0034 (BEAM COSMP Testability Refactor) + 0035 (Substrate-Build Discipline Canonical) + 0038 (DMW Worker per-DMW Supervised Process) + 0039 (Hive-Scale Per-DMW Dispatch ENTERPRISE) + 0040 (DEVICE Cold-Shard Substrate) collectively canonicalize the existing LIVE BEAM substrate.

**ADR-0091 is design-only — no code, no new BEAM app, no new Elixir module, no new gRPC method, no new audit literal.** It does three things:

1. Acknowledges the mature LIVE BEAM substrate per substrate-honest pre-flight
2. Locks the "do not force BEAM" discipline per Founder direction
3. Enumerates the next bounded supervised-process candidate slices (the "one bounded supervised process" Founder direction names) for future Founder per-slice authorization

Each implementation slice BE1-BE10 named in §10 below requires separate per-slice Founder authorization with its own sub-phase decomposition per the established BEAM mini-arc discipline (ADRs 0030 + 0034 + 0035 pattern).

### Substrate-honest pre-flight (RULE 13)

Repository state 2026-06-02:

**LIVE BEAM substrate:**

- **Umbrella structure:** two OTP apps (`cosmp_router` + `dbgi_supervisor`) in the mix umbrella; `apps/api/` Fastify+TypeScript is invisible to mix per Q-COEXISTENCE Option X discipline.
- **`cosmp_router` Application supervision tree:** `:one_for_one` strategy with `[CosmpRouter.Repo, CosmpRouter.Storage.ETS, CosmpRouter.WalletCache, CosmpRouter.ActivityCounter, CosmpRouter.Router, CosmpRouter.Telemetry (conditional), GRPC.Server.Supervisor (conditional)]`.
- **`dbgi_supervisor` Application supervision tree:** `:one_for_one` with `[:pg (DbgiSupervisor.PG), Registry (:unique keys), DynamicSupervisor (:one_for_one), Cluster.Supervisor (libcluster), Phoenix.PubSub, DbgiSupervisor.PresenceTracker, Horde.Registry (members: :auto), Horde.DynamicSupervisor (UniformDistribution), DbgiSupervisor.Telemetry (conditional)]`.
- **LIVE supervised processes:** `CosmpRouter.Router` (single-node COSMP routing per 7 patent ops) + `CosmpRouter.Storage.ETS` + `CosmpRouter.WalletCache` (ETS read cache per ADR-0039 §Sub-decision 5) + `CosmpRouter.ActivityCounter` (ETS atomic-counter promotion gate per ADR-0039 sub-phase c) + `DbgiSupervisor.DMWWorker` (per-DMW GenServer; lazy-spawn on first COSMP op; ENTERPRISE through Horde; PERSONAL through promote-on-activity per ADR-0038 + ADR-0039 §Amendment 1).
- **LIVE Horde substrate:** `DbgiSupervisor.HordeRegistry` (CRDT-distributed Registry; members: :auto) + `DbgiSupervisor.HordeDynamicSupervisor` (UniformDistribution); ENTERPRISE-only per sub-phase b.
- **LIVE Phoenix.Tracker:** `DbgiSupervisor.PresenceTracker` (CRDT-backed presence at `"dmw:#{entity_id}"` topic per ADR-0038 §Sub-decision 2).

**TS ↔ BEAM gRPC boundary LIVE end-to-end:**

- gRPC interface at `apps/cosmp_router/priv/protos/cosmp.proto` defines `CosmpRouter` service with 7 unary RPCs (Authenticate, Negotiate, Read, Write, Share, Revoke, Audit; patent-canonical per US 12,517,919).
- Request/response includes patent-canonical 7-layer Capsule + `oneof` error envelope per ADR-0026 §5 Pattern 2.
- TypeScript client (`apps/api/src/services/cosmp-client.ts`): lazy-init singleton dispatching through `@grpc/grpc-js` to Elixir server at `localhost:50051`.
- 7 ops route through `CosmpRouter.GRPC.Server` → tier-routed dispatch shim → `CosmpRouter.Router` (single-node fallback) OR `DbgiSupervisor.DMWWorker` (per-DMW Horde for ENTERPRISE; promote-on-activity for PERSONAL) OR device shard dispatch (DEVICE; no per-DMW spawn) per ADR-0038/0039/0040.
- Client is additive per Q-V (parallel-path; not replacing in-process TS services); migration deferred to a future sub-phase.

**Forward-substrate across ADRs 0028 / 0030 / 0038 / 0039:**

- per-capsule supervised Elixir process (LANDED at per-DMW granularity; per-capsule register forward-substrate)
- OtzarComm multi-region message routing
- Python ML substrate (closed by ADR-0090 doctrine; PY1-PY10 ladder)
- Multi-region production topology
- `:gproc` backward-compatibility
- Partition-tolerance expansion
- Phoenix.PubSub hive fanout (ADR-0039 §Entry #28 forward-substrate to sub-phase c + d + sub-arc 2)
- Broadway pipeline at high-throughput register
- Hive algorithm at weighting architecture (ADR-0039 §Entry #28)
- Twin-to-Twin proactive coordination (ADR-0052 §8; ADR-0059 forward queue)

## Decision

### 1. The doctrine — BEAM is the living coordination fabric; TypeScript is the contract surface

Foundation's four-language division of labor per ADR-0069 stays canonical:

- **TypeScript** runs the product/API contract surface (`apps/api/`).
- **Elixir/BEAM** runs the living processes (cosmp_router + dbgi_supervisor; LIVE).
- **Python** performs intelligence-heavy computation (ADR-0090 readiness LIVE; PY1-PY10 forward-substrate).
- **Postgres** owns durable state (Prisma owns shared-table DDL per ADR-0025; Ecto owns Elixir-internal DDL per ADR-0033 §Q-5BII-EXEC-5).

BEAM expansion follows three doctrine rules per Founder direction:

- **Use BEAM where it's the right tool** — supervised actor lifecycles, long-running sessions, workflow coordination, event supervision, backpressure, PubSub, Broadway-style ingestion, fault isolation, retry supervision, concurrent agent coordination.
- **Do NOT use BEAM for** simple CRUD, basic CT pages, static catalogs, simple request/response handlers, governance enforcement (governance is Foundation TypeScript core per RULE 9 + ADR-0069 §9).
- **Do NOT force BEAM if TypeScript is safer for the current slice.**

### 2. The 7 pre-implementation requirements (Founder direction; every future BE1-BE10 slice MUST satisfy)

Per Founder direction every BEAM expansion slice MUST address:

1. **Audit existing Elixir app structure** — substrate-honest pre-flight per RULE 13 against the current LIVE state above.
2. **Verify supervision trees** — every new supervised process declares its parent supervisor + restart strategy + child_spec.
3. **Verify CI expectations** — the Elixir tier (compile + test) at `.github/workflows/ci.yml` must continue to pass; the slice MUST add test coverage to maintain the green baseline.
4. **Verify TS ↔ BEAM boundary** — if the slice extends the gRPC surface, the `cosmp.proto` schema MUST extend backward-compatibly per ADR-0032 Protobuf evolution discipline + ADR-0042 §Q-γ.1 clean-transition.
5. **Identify durable state owner** — every persistent state mutation MUST flow through Postgres (Prisma for shared tables; Ecto for Elixir-internal tables per ADR-0033 §Q-5BII-EXEC-5).
6. **Identify event contracts** — every cross-process event MUST be typed (Phoenix.PubSub topic with closed-vocab payload OR Phoenix.Tracker presence message).
7. **Start with one bounded supervised process, not a massive rewrite** — every BE1-BE10 slice is bounded to ONE new supervised process (or one extension of an existing one), not a topology rebuild.

### 3. RULE 0 sovereignty + tenant isolation inherited

Every BEAM expansion inherits same-org boundary per ADR-0049 GOVSEC.7. The existing tier-routed dispatch enforces this via wallet_type lookup before any per-DMW spawn (ENTERPRISE/PERSONAL/DEVICE). New supervised processes MUST integrate at the same enforcement boundary OR explicitly justify a different boundary in the slice ADR.

### 4. The candidate slice space — 3 Founder-named candidates + 7 forward-substrate

Per Founder direction the first BEAM expansion candidates are:

**Candidate A: Hive session supervisor**

- Scope: per-(entity_id, hive_id) GenServer tracking active hive-participation session state (last activity timestamp, expiry, scoped permission cache).
- Composes against: Section 3 LIVE Hive substrate (ADR-0059) + Horde Registry (ADR-0039) + Phoenix.Tracker for hive-presence broadcast.
- Substrate present: tier-routed dispatch + Horde Registry + Phoenix.Tracker LIVE; missing: hive-session lifecycle GenServer + per-hive event topic.
- Value: enables future Hive Intelligence Runtime forward-queue signals (RECURRING_BLOCKER_TOPICS_30D + STALLED_PROPOSALS_7D per ADR-0087 §9) to derive over per-session activity windows.

**Candidate B: Workflow promotion coordinator**

- Scope: per-(catalog_id, idempotency_key) GenServer or stateless module orchestrating W5 promotion sagas (multiple W4 catalog entries → multiple Section 2 Actions as a saga).
- Composes against: W5 LIVE (ADR-0086) + W4 catalog (ADR-0081 §2.2 Stage 3) + Section 2 Action runtime (ADR-0057).
- Substrate present: W5 single-action promotion LIVE; missing: multi-action saga orchestration.
- Value: enables future Hive Intelligence Runtime signal-driven proposed-action bundles (e.g., the cross-functional-blocker-escalation W4 entry promoted alongside its follow-up actions atomically).

**Candidate C: Connector invocation event supervisor**

- Scope: per-(entity_id, binding_id) GenServer queuing outbound connector READ invocations + enforcing per-binding rate limits + retry coordination under supervised fault isolation.
- Composes against: Section 4 OPERATING matrix (6 vendors LIVE) + Section 2 INVOKE_CONNECTOR runtime + INVOKE_CONNECTOR CT surface (CT PR #32 LIVE).
- Substrate present: per-call Section 2 ActionAttempt LIVE; missing: per-(entity, binding) coordination for burst throttling + retry orchestration + Broadway-style ingestion.
- Value: addresses vendor rate-limit edges (Slack tier limits; Google Workspace per-user quotas; Microsoft 365 throttling) that today's per-call Section 2 ActionAttempt handles in isolation.

**7 forward-substrate candidates already named across ADRs 0028 / 0030 / 0038 / 0039 / 0052 / 0059 (NOT Founder-named at this slice; informational):**

- Phoenix.PubSub hive fanout for live signal updates
- Broadway pipeline at high-throughput register
- Hive algorithm at weighting architecture (ADR-0039 §Entry #28)
- OtzarComm multi-region message routing at scale
- Twin-to-Twin proactive coordination runtime (ADR-0052 §8; per-DMW dispatch substrate)
- Per-capsule supervised Elixir process (finer-grained register)
- Partition-tolerance + multi-region production topology

### 5. NOT a slice picker; ADR-0091 names candidates; Founder picks at per-slice authorization

This ADR DOES NOT pick which of the 3 Founder-named candidates lands first. The smallest viable first slice depends on which LEI sequence consumer benefits most:

- If the next LEI sequence consumer is **Hive Intelligence Runtime V2 signals** (e.g., STALLED_PROPOSALS_7D + RECURRING_BLOCKER_TOPICS_30D per ADR-0087 §9 forward queue) → Candidate A (Hive session supervisor) lands first.
- If the next LEI sequence consumer is **W5 saga orchestration** (multi-W4 proposed-action bundles) → Candidate B (Workflow promotion coordinator) lands first.
- If the next LEI sequence consumer is **Section 4 connector quota / throttling discipline** (vendor rate-limit absorption) → Candidate C (Connector invocation event supervisor) lands first.

Per Founder direction: *"Start with one bounded supervised process, not a massive rewrite."* The picker is the Founder per-slice authorization that names which consumer is the next LEI sequence step.

### 6. Substrate-honest framing — BEAM is the LIVING fabric, not the only fabric

ADR-0091 acknowledges that significant Foundation runtime stays in TypeScript by design:

- **Section 2 Action runtime** (ADR-0057) is TypeScript. The executor + scheduler + retry logic that lives there is intentionally NOT ported to BEAM — TypeScript's expressiveness + the Prisma ORM + the existing audit chain integration are the right tool for that surface. BEAM supervises the COSMP coordination layer; Section 2 supervises the action runtime.
- **Section 4 connector adapters** are TypeScript. Vendor SDK integration + OAuth + HTTP fanout live where the npm ecosystem is strongest.
- **Section 5 Agent Playground** is TypeScript. The deterministic simulation + scoring + projection live where the Prisma schema + governance pipeline already operate.
- **All ADMIN_ACTION audit emission** stays TypeScript-anchored. The audit chain `writeAuditEvent` is the canonical Foundation surface; BEAM emits via the `CosmpRouter.Audit` byte-equivalent module that interoperates with the TypeScript chain per ADR-0033.

BEAM expansion at BE1-BE10 ADDS coordination + supervision substrate; it does NOT migrate the above to BEAM. Migration is forward-substrate to a future Founder-authorized ADR with its own RULE 21 research arc + sub-phase decomposition discipline.

### 7. Sub-phase decomposition pattern (every BE1-BE10 slice MUST follow)

The established BEAM mini-arc discipline canonical at ADR-0030 §sub-phase + ADR-0034 §Sub-decision 5 + ADR-0035 §9 substrate-build cluster applies to every future BE1-BE10 slice:

1. **Decision-substrate sub-phase** (ADR + Q-locks for sub-decisions + RULE 21 research arc if substrate-architectural)
2. **Module skeleton sub-phase** (GenServer + supervisor wiring + telemetry hook + test scaffold)
3. **Behavior implementation sub-phase** (handle_call / handle_cast / handle_info + state-shape unit tests)
4. **Integration sub-phase** (tier-routed dispatch wiring or gRPC extension or Phoenix.PubSub topic + integration tests)
5. **Test substrate sub-phase** (per ADR-0034 BEAM testability discipline + RULE 11 wider-knowledge-check for Sandbox / supervised GenServer / Horde Registry behavior)
6. **Closure cascade sub-phase** (docs-only ADR Status flip + NEXT_ACTION + CURRENT_BUILD_STATE + section-detail file)

Per ADR-0029 substrate-build optimization the slice MAY combine sub-phases 2-4 if the slice scope is small enough.

### 8. No new audit literal at this ADR

Design-only. No `AUDIT_EVENT_TYPE_VALUES` extension. Future BE1-BE10 slices MAY require new audit literals — each addition follows ADR-0042 §Q-γ.1 clean-transition discipline at the slice tier, never preemptively here.

### 9. No new module / mix dep / OTP app at this ADR

Design-only. No new `apps/<name>/` umbrella app. No new `mix.exs` dep. No new Elixir module file. No new `proto/cosmp.proto` field. Each BE1-BE10 slice adds its own substrate.

### 10. Implementation ladder — 10 forward-substrate slices

V1 is doctrine-only at this ADR. Each implementation slice BE1-BE10 requires separate Founder authorization.

- **BE1 — First bounded supervised-process landing** (substantive runtime; Founder-gated; Founder picks Candidate A / B / C from §4 at per-slice authorization). Single GenServer + supervisor wiring + integration tests + audit hook.
- **BE2 — First Phoenix.PubSub topic for live signal fanout** (substantive runtime). Composes against existing `DbgiSupervisor.PresenceTracker` LIVE pattern.
- **BE3 — First Broadway pipeline for high-throughput ingestion** (substantive runtime). Composes against an ECIL Tier 2+ ingestion need (ADR-0088 §E4 forward-substrate) OR a Hive Intelligence Runtime signal aggregation that exceeds Section 6's per-request synchronous bound.
- **BE4 — Twin-to-Twin proactive coordination runtime (V1)** (substantive runtime; bounded scope; Founder-gated per ADR-0052 §8). Composes against per-DMW Horde substrate LIVE.
- **BE5 — Per-capsule supervised Elixir process (V1 narrow scope)** (substantive runtime). Composes against ADR-0028 §Forward Queue item per-capsule register.
- **BE6 — OtzarComm multi-region message routing substrate** (substantive runtime; cross-region). Composes against ADR-0028 §Forward Queue OtzarComm item + libcluster LIVE.
- **BE7 — Hive algorithm at weighting architecture register** (substantive runtime). Composes against ADR-0039 §Entry #28 forward-substrate + Hive Intelligence Runtime V2 signals.
- **BE8 — Section 4 connector invocation event supervisor V2** (Candidate C maturation if BE1 picked A or B). Composes against ≥C6 per-connector write capability arc when authorized.
- **BE9 — Multi-region partition-tolerance hardening** (substantive runtime; cross-region; operational). Composes against ADR-0040 DEVICE cold-shard partition discipline + Horde CRDT partition behavior.
- **BE10 — BEAM coordination layer production GA across multiple tenants** (operational; Founder-gated rollout cadence).

### 11. NO Python / Sesame / connector-write / blockchain bypass

Per cross-LEI sequence discipline: BEAM expansion does NOT bypass Python boundary (ADR-0090), Sesame CSM-1B boundary (ADR-0089), Section 4 connector writes (ADR-0084 ≥C6), Section 2 Action runtime authority (ADR-0057), W5 promotion gate (ADR-0086), ECIL surveillance bans (ADR-0088 §4), or blockchain/USDC/Coinbase/Circle/Base/x402 (Founder-gated per autonomous-mode directive).

## Consequences

**Positive.**

- The BEAM Living Coordination Runtime Expansion Doctrine is named, bounded, and locked. The Founder-direction discipline ("do not force BEAM if TypeScript is safer") is canonical at the doctrine tier.
- The 7 pre-implementation requirements (Founder direction) become a checklist every BE1-BE10 slice MUST satisfy. This prevents drift back into "BEAM for everything" framing.
- The 3 Founder-named candidate slices (Candidate A / B / C) are scoped at the doctrine tier. The Founder picker at per-slice authorization names which one lands first based on the next LEI sequence consumer.
- The 7 forward-substrate candidates already named across ADRs 0028 / 0030 / 0038 / 0039 / 0052 / 0059 are explicitly INFORMATIONAL at this slice — the doctrine doesn't pre-authorize them.
- The §6 substrate-honest framing (BEAM is the living fabric, NOT the only fabric) prevents future ADR drift into wholesale TypeScript-to-BEAM migration framing. Section 2 / Section 4 / Section 5 / ADMIN_ACTION emission stay TypeScript-anchored by design.
- The §7 sub-phase decomposition pattern locks the established BEAM mini-arc discipline (ADRs 0030 + 0034 + 0035) as the authority for every BE1-BE10 slice. New BEAM slices inherit the testability + substrate-build + closure-cascade pattern.

**Negative.**

- The 10-slice ladder is long. Each slice requires per-slice Founder authorization. BEAM expansion enters production gradually rather than as a single landing.
- Candidate A / B / C are scope-overlapping at the value tier (each addresses a different LEI sequence consumer). The Founder picker may need to weigh which consumer is the next priority.
- Multi-region production topology (BE6 + BE9) is substantial operational work. Foundation's current deployment-target-agnostic posture per ADR-0018 means the multi-region substrate must accommodate Supabase + AWS + on-premise + air-gapped without losing single-tenant simplicity.

**Forward-substrate (NOT authorized by this ADR).**

- All 10 implementation slices BE1-BE10 above.
- Twin-to-Twin proactive coordination runtime production deployment (ADR-0052 §8 forward-substrate; bounded scope at BE4).
- Per-capsule supervised process at fine granularity (ADR-0028 §Forward Queue).
- OtzarComm multi-region production GA.
- BEAM-Python coordination (composes against ADR-0028 + ADR-0090 §2.4 §10 boundaries).
- Wholesale Section 2 / Section 4 / Section 5 TypeScript-to-BEAM migration (NOT in this ADR; would require separate Founder ADR + RULE 21 research arc).

## Alternatives

**Alternative A: Pick Candidate A (Hive session supervisor) at this ADR.** Rejected — the Founder picker for the next BEAM slice is the per-slice authorization that depends on the next LEI sequence consumer. ADR-0091 names candidates; doesn't pick. Picking here would prematurely lock the consumer.

**Alternative B: Skip the doctrine ADR; land Candidate A directly.** Rejected — the established BEAM mini-arc discipline per ADRs 0030 + 0034 + 0035 + ADR-0029 substrate-build optimization requires a decision-substrate sub-phase before the module skeleton sub-phase. ADR-0091 IS that decision-substrate at the doctrine tier; subsequent slice ADRs are at the per-slice tier.

**Alternative C: Bundle Candidates A + B + C into V1.** Rejected per Founder direction: *"Start with one bounded supervised process, not a massive rewrite."* The 3 candidates target different LEI sequence consumers; bundling would violate the bounded-process discipline.

**Alternative D: Define a new umbrella OTP app (e.g., `apps/hive_intelligence_supervisor/`) at this ADR.** Rejected — design-only ADR. Future BE-slice may add a new umbrella app if the supervised-process scope justifies it; that decision lands at the slice ADR per the established `cosmp_router` + `dbgi_supervisor` precedent (ADRs 0030 + 0038).

**Alternative E: Define a TypeScript-side equivalent (e.g., Bullmq workers, Kafka consumers) as competing implementation.** Rejected — the substrate-honest pre-flight surfaces existing Foundation BEAM substrate (Horde + Phoenix.Tracker + supervision trees) that any TypeScript-side coordination would duplicate. BEAM is the right tool for the §1 + §4 candidate scopes per ADR-0069 §2.3.

## Cross-references

ADR-0017 (Production Discipline; operational-signal-gated future slice cadence) ·
ADR-0018 (Deployment-Target Agnosticism; BE6 + BE9 multi-region inherits) ·
ADR-0020 (two-register IP discipline; patent-implementation evidence) ·
ADR-0025 (schema-push-target discipline; Ecto migrations for Elixir-internal tables) ·
ADR-0026 §5 (BEAM-compatibility patterns; every BE-slice GenServer inherits) ·
ADR-0028 (BEAM Coordination Layer; forward queue parent — ADR-0091 enumerates remaining items) ·
ADR-0029 (substrate-build optimization; sub-phase decomposition discipline) ·
ADR-0030 (Phase 2 BEAM Implementation; sub-phase decomposition template) ·
ADR-0031 (BEAM Routing Substrate; CosmpRouter.Router precedent) ·
ADR-0032 (BEAM gRPC Interop; Protobuf evolution discipline) ·
ADR-0033 (BEAM Persistence + Idempotency + Audit-Chain; Ecto durable-state owner discipline) ·
ADR-0034 (BEAM COSMP Testability; D-WIDER-KNOWLEDGE-CHECK discipline at every BE-slice) ·
ADR-0035 (Substrate-Build Discipline Canonical; cluster expansion at every BE-slice closure) ·
ADR-0038 (DMW Worker per-DMW; tier-routed dispatch precedent) ·
ADR-0039 (Hive-Scale Per-DMW Dispatch ENTERPRISE; Horde precedent + §Entry #28 forward-substrate) ·
ADR-0040 (DEVICE Cold-Shard; partition-tolerance precedent for BE9) ·
ADR-0042 §Q-γ.1 (clean-transition; future BE-slice audit literal additions if any) ·
ADR-0049 (GOVSEC.7 tenant isolation) ·
ADR-0052 §8 (Otzar DGI doctrine; BE4 Twin-to-Twin coordination composes against) ·
ADR-0057 (Section 2 Action runtime; preserved as TypeScript surface; BEAM does NOT migrate) ·
ADR-0059 (Section 3 Hives v1; Candidate A composes against) ·
ADR-0061 (Section 6 Enterprise Analytics; Candidate B / C analytics-tier hooks at forward-substrate) ·
ADR-0069 §2.3 + §2.4 (Elixir/BEAM Substrate-Coherence Law; the doctrine parent) ·
ADR-0077 §8.4 (Foundation-first cadence; CT consumer surface at forward-substrate) ·
ADR-0084 (Section 4 connector strategy; Candidate C composes against) ·
ADR-0086 (W5 Action Promotion Runtime; Candidate B composes against) ·
ADR-0087 (Hive Intelligence Runtime V1; Candidate A composes against + §9 forward queue triggers BE2-BE3) ·
ADR-0088 (Enterprise Communication Intelligence Layer Doctrine; ECIL Tier 2+ forward-substrate triggers BE3 Broadway slice) ·
ADR-0089 (Sesame CSM-1B Readiness; sibling readiness-doctrine ADR; isolation-boundary precedent) ·
ADR-0090 (Python Intelligence Runtime Readiness; sibling readiness-doctrine ADR; cross-runtime composition) ·
RULE 11 (Elixir/BEAM canonical patterns; every BE-slice inherits D-WIDER-KNOWLEDGE-CHECK).

## RULE references

RULE 0 (humans always sovereign; tenant isolation inherited at every BE-slice) + RULE 4 (audit chain integrity; BEAM audit byte-equivalent at ADR-0033) + RULE 9 (modular service-tier connections; BEAM/TypeScript boundary stays gRPC) + RULE 10 (soft-delete; preserved) + RULE 11 (Elixir/BEAM canonical patterns; D-WIDER-KNOWLEDGE-CHECK at every BE-slice substrate decision) + RULE 13 (substrate-honest pre-flight; embedded above as the existing LIVE substrate enumeration) + RULE 14 (bidirectional citation; this ADR cites and is cited by ADRs 0028-0040 + ADR-0069 catalog entries) + RULE 16 (no console.* in apps/api/src; preserved — no TypeScript code in this slice) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc; this ADR's research arc IS the substrate-honest pre-flight per §Context — BEAM's existing canonical sources are already embedded in ADRs 0028-0040 + ADR-0034 D-WIDER-KNOWLEDGE-CHECK lineage).
