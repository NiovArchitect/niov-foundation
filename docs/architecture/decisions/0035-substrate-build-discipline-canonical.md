# ADR-0035: Substrate-Build Discipline Canonical

**Status**: Accepted
**Date**: 2026-05-14
**Trigger**: Sub-phase 6c `[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]`.
Founder-tier strategic concern raised at sub-phase 6a closure:
"ensure that the necessary researched information of best practices
for Elixir and BEAM are being saved or added somewhere so other
team members who join my team don't have this same problem and
their AI will look into top methods, strategies, and best practices
for Elixir and BEAM." Sub-phase 5b-ii through 6a accumulated 8
substrate-build discipline observations across the Block B mini-arc;
sub-phase 6c pre-flight surfaced a 9th
(**D-CASCADE-SCOPE-PRECISION**). This ADR canonicalizes the 9
observations at ADR register; binds the most important one
(D-WIDER-KNOWLEDGE-CHECK) at RULE register (RULE 11); provides
curated reference doc + onboarding cascade so future contributors
and their AI tools operate under canonical patterns from session-
start. Founder authorization per RULE 20 explicit at this ADR's
creation.

## Context

The Block B Phase 2 mini-arc (sub-phases 1 through 6a, commits
`8cffaca` → `9361d9f`) accumulated substantive substrate-build
discipline observations as Elixir/BEAM substrate landed for the
first time at NIOV. These observations are **substrate-build
canonical** — they describe how substrate gets built reliably at
NIOV, not what the substrate is. They sit at a register adjacent
to but distinct from ADR-0027 (Contributor Governance), ADR-0029
(Substrate-Build Optimizations), and ADR-0034 (BEAM COSMP
Testability Refactor Pattern):

- **ADR-0027** = authorization-tier protection (RULE 20 — only
  the Founder modifies RULES/ADRs)
- **ADR-0029** = substrate-build optimizations (cascade-grep,
  commit-class templates, strategy-tier prose discipline)
- **ADR-0034** = substrate-architectural pattern (canonical
  Elixir testability via name-configurability)
- **ADR-0035** (this ADR) = substrate-build discipline canonical
  (the 9 observations across the Block B mini-arc, codified for
  team-scaling)

The team-scaling concern motivates the canonicalization: as
contributors join and as AI tools (Claude Code, Codex, Cursor,
ChatGPT) operate against NIOV's substrate, the substrate-build
discipline must propagate from session-start. Lessons from
sub-phases 5b-ii through 6a are valuable only if they bind into
the operating substrate (RULES + ADRs + onboarding) rather than
remaining tacit in commit bodies.

### The 9 canonical observations across sub-phases 5b-ii → 6c

1. **D-CI-FRESH-1** — CI services are fresh-per-job (Postgres
   service container starts empty every CI invocation; the
   schema-push pattern + audit-trigger install MUST mirror the
   canonical workflow VERBATIM)
2. **D-CI-FRESH-2** — per-job container instances are independent
   (no state shared across jobs; the Elixir tier needs the same
   Prisma schema-push pattern the TS unit tier has)
3. **D-CI-FRESH-3** — mirror canonical workflow blocks VERBATIM,
   not selectively (selective mirroring missed the DIRECT_URL env
   that schema.prisma:15 requires per ADR-0018)
4. **D-IDEMPOTENCY-3** — substrate-landing commit includes its CI
   register MOD (substrate that requires CI dependencies lands the
   CI MOD in the same commit; D-CI-FRESH cluster operationalizes)
5. **D-5BIII-COMMITB-1/2/3-REFINED** — Sandbox +
   supervised-GenServer fragility at cross-process AND cross-test-
   cycle boundaries (the symptom that suggested architectural
   coupling; resolved at ADR-0034 register, not Sandbox API
   register)
6. **D-SUBSTRATE-LANDING-PREEMPT** — substantive substrate-landing
   commits naturally absorb forward-reference markers as part of
   the substantive prose; isolated forward-ref-rotation commits
   afterward should re-grep substrate-state ground truth
   pre-execution
7. **D-AUDIT-OUTCOME-ENUM** — integration-test-tier catches
   substrate-coherence bugs that unit-tier excluded missed
   (canonical example: `outcome: "FAILURE"` in `Router.emit_audit_failure/3`
   violated AuditOutcome enum; uncaught at unit-tier because
   integration tests excluded; surfaced at sub-phase 6 pre-flight)
8. **D-ABORT-CONDITION-PRECISION** — abort conditions need
   substrate-state ground truth precision distinguishing "target
   substrate-coherence resolution" from "test passes in full-suite
   run" (literal-letter test-pass conditions can conflate scopes;
   operator-tier interpretation choice is canonical, not
   automatic)
9. **D-WIDER-KNOWLEDGE-CHECK** — substrate-build discipline at
   Elixir/BEAM register includes broader Elixir/BEAM community
   pattern research before authorizing fixes when substrate-state
   observations suggest architectural-register coupling (the
   canonical observation that this ADR canonicalizes at RULE 11
   register)
10. **D-CASCADE-SCOPE-PRECISION** (NEW at sub-phase 6c) —
    pre-flight grep surfaces actual cumulative-lineage cascade
    scope; operator-tier estimates are starting points, not
    ground truth (substrate-state grep wins over estimate; this
    observation surfaced when 6c pre-flight Step 7 found ~20 sites
    where operator's framing estimated "~12-18 sites")

The 9 observations operate at three sub-registers:

- **CI-environment-coherence** (D-CI-FRESH-1/2/3 +
  D-IDEMPOTENCY-3)
- **Test-granularity coherence** (D-5BIII-COMMITB-1/2/3-REFINED +
  D-AUDIT-OUTCOME-ENUM)
- **Pre-flight discipline coherence** (D-SUBSTRATE-LANDING-
  PREEMPT + D-ABORT-CONDITION-PRECISION + D-WIDER-KNOWLEDGE-CHECK
  + D-CASCADE-SCOPE-PRECISION)

### Sub-phase 6b cluster expansion (10th → 17th observations)

Sub-phase 6b `[BEAM-COSMP-INTEGRATION-TESTS]` execution surfaced
**8 additional substrate-build observations** across the
integration-test-tier substrate-state register (lineage: sub-phase
6c pre-flight + sub-phase 6b Phase 0/1/2/3/5 execution arcs).

10. **D-SUBPHASE-COUNT-PRECISION** (sub-phase 6c pre-flight; commit
    `6db538e` lineage) — sub-phase counts derive from the canonical
    sub-phase identifier list (`1, 2, 3, 4a, 4b, 5a, 5b-i, 5b-ii,
    5b-iii, 6a, 6b, 6c, 7, 8, 9, 10, 11, 12, 13` = 19), NOT from
    commit count. Multi-commit sub-phases count as ONE sub-phase
    (5b-iii's 3-commit arc = 1 sub-phase). Non-sub-phase commits
    (hotfix `def66b9`, cascade-only `b9b41f7`, CI fixes `edc330f` +
    `c527bdb`) DO NOT expand the sub-phase count. Surfaced when
    framing the closed-sub-phase tally drifted across three
    successive commits (post-hotfix, post-6a, post-6c).
11. **D-WIDER-KNOWLEDGE-CHECK-ENGAGEMENT-PRECISION** (sub-phase 6b
    Phase 0 surface; commit at this register) — RULE 11
    broader-community pattern research applies at EVERY
    architectural-coupling observation, not just the first one of a
    session. Surfaced when discipline correction was applied at
    Phase 0 of Q-PHASE-2-FK-PATTERN (substrate-internal grep
    → broader-community research) and re-applied at Q-PHASE-2-UTC-
    DATETIME-RESOLUTION + Q-PHASE-3-GRPC-TEST-PATTERN +
    Q-PHASE-5-ADR-AMENDMENT-PATTERN.
12. **D-PHASE-2-CROSS-LANG-PRECISION-DRIFT** (sub-phase 6b Phase 2;
    commit at this register) — `MemoryCapsule` Ecto schema register
    drifted from Prisma DDL `TIMESTAMP(3)` millisecond canonical +
    ADR-0033 §D-5BII-EXEC-2 millisecond canonical. Three-register-
    coherent resolution at sub-phase 6b Option F LOCKED: Elixir
    `:utc_datetime_usec` + production microsecond `DateTime.utc_now()`
    + Postgres TIMESTAMP(3) silent truncation on column write.
    Cross-citation: ADR-0033 §4a-amendment.
13. **D-SUBSTRATE-STATE-VS-STRATEGIC-FRAMING** (sub-phase 6b Phase 2
    Option F resolution; commit at this register) — strategic-tier
    framing isn't always canonical at substrate-state ground truth
    register. Surfaced when Phase 2 execution caught the canonical
    NIOV pattern (microsecond at Elixir + `canonical_record`
    millisecond truncation at hash-time only) that strategic-tier
    Option F framing initially missed (`[:millisecond]` autogenerate
    truncation was the initial proposal; substrate-state ground
    truth at `audit.ex:297-301` revealed the correct pattern).
    Substrate-state register wins; strategic-tier framing iterates
    toward substrate-state canonical.
14. **D-RULE-11-REPEATED-ENGAGEMENT** (sub-phase 6b Phases 0/2/3/5;
    commit at this register) — four successive RULE 11 surfaces in
    one session converging on canonical-coherence at NIOV's existing
    substrate-architectural register: Q-PHASE-2-FK-PATTERN (Proto +
    Translator + Capsule canonical per Google Protobuf "Use
    Different Messages For RPC APIs and Storage") +
    Q-PHASE-2-UTC-DATETIME-RESOLUTION (`:utc_datetime_usec` + full
    microsecond canonical per Ecto + Prisma TIMESTAMP(3)
    cross-language register) + Q-PHASE-3-GRPC-TEST-PATTERN
    (`Server.handler(req, nil)` direct call canonical per
    elixir-grpc test suite) + Q-PHASE-5-ADR-AMENDMENT-PATTERN
    (in-place §9 expansion canonical at observation-cluster
    register; see also D-OBSERVATION-VS-DECISION-DISCRIMINATION
    below). The discipline operates canonically when applied
    consistently.
15. **D-PHASE-3-ETS-NOT-TRANSACTIONAL** (sub-phase 6b Phase 3
    pre-substantive surface; commit at this register) — ETS state
    at the singleton `CosmpRouter.Storage.ETS` is NOT transactional
    across tests. `Sandbox.checkout` wraps Postgres in transactions
    rolled back at test end, but ETS state persists. Canonical
    mitigation: UUID-per-test `Ecto.UUID.generate()` capsule_ids
    avoid cross-test ETS state pollution at the capsule_id register.
    Alternative: explicit `Storage.ETS.clear/1` in setup. NIOV
    canonical: UUID-per-test (carried from router_test.exs canonical
    at sub-phase 6b Phase 2).
16. **D-SANDBOX-ALLOW-VS-START-OWNER-DISCRIMINATION** (sub-phase 6b
    Phase 3 Step 3-e execution; commit at this register) —
    `Sandbox.allow` canonical Ecto pattern holds for **single-test
    cross-process access** (one test, app-supervised GenServer
    accesses Repo); for **sequential multi-test runs within same
    test module** against a singleton supervised GenServer,
    `start_owner!/stop_owner` canonical Ecto v3 pattern required
    (dedicated owner process surviving test process lifecycle).
    ADR-0034 Sub-decision 3 framing conflated the two scenarios;
    sub-phase 6b Phase 3 Step 3-e execution surfaced the
    discrimination. **ADR-0034 amendment LANDED** at the
    `[ADR-0034-SUB-DECISION-3-AMENDMENT]` commit post-sub-phase-6b
    CI green: see ADR-0034 §Sub-decision 3-amendment.
17. **D-OBSERVATION-VS-DECISION-DISCRIMINATION** (sub-phase 6b
    Phase 5 Phase 0 RULE 11 surface; commit at this register) —
    broader-community ADR canonical guidance for **decisions**
    favors multiple smaller ADRs (Henderson); canonical for
    **observations** at scale uses per-incident with cross-references
    (Google SRE postmortem culture). NIOV's ADR-0035 is an
    observation-cluster (lessons-learned library register); in-place
    §9 expansion is canonical at the observation register. Forward-
    substrate observation: as cluster grows beyond ~20 observations,
    may warrant separate observation-corpus doc OR thematic sub-
    ADRs. Substrate-build maturation observation.

### Post-sub-phase-7-8 cluster expansion (18th → 23rd observations)

ADR-0034 §Sub-decision 3-amendment commit (`a54067e`) + sub-phase 7
`[BEAM-DBGI-APP-SKELETON]` (`e80ff14`) + sub-phase 8
`[BEAM-DBGI-PROCESS-GROUPS]` (`d9a6766`) + this commit's pre-flight
surface together surfaced **6 additional substrate-build observations**
across the ADR-amendment-coherence, DBGI-substrate, and substrate-
honesty registers. Option β LOCKED at this commit: substrate-honest
preservation of the L94/L118 numbering drift (documented as
D-CLUSTER-NUMBERING-DRIFT 23rd observation rather than silent
renumbering).

18. **D-AMENDMENT-FORWARD-QUEUE-CLOSURE-CASCADE** (commit `a54067e`
    + recursively at this commit) — substantive ADR amendment commits
    naturally absorb forward-queue marker closure cascades from prior
    commits per D-SUBSTRATE-LANDING-PREEMPT canonical recursively
    applied. Substantively load-bearing only at the ADR amendment
    text + forward-queue marker site itself; mirror cascade at
    catalog entries is cosmetic-prose substrate-coherence.
    D-CASCADE-SCOPE-PRECISION + D-SUBSTRATE-LANDING-PREEMPT operate
    canonically at the amendment-commit register. Surfaced at
    `a54067e` when ADR-0034 §Sub-decision 3-amendment landed +
    ADR-0035 §9 16th observation forward-queue marker closed
    (forward-queued → LANDED) + catalog entries updated at
    cosmetic-prose register; recursively applies at this commit
    register (6 NEW observations + ADR-0030 §DBGI amendment +
    catalog cascade naturally absorbed at this amendment commit
    register).

19. **D-PRE-COMMITTED-ADR-CANONICAL-VERIFICATION** (sub-phase 7
    commit `e80ff14` Phase 0 + sub-phase 8 commit `d9a6766`
    Phase 0) — when prior ADRs substantively canonicalize patterns
    at NIOV substrate-architectural register (e.g., ADR-0028 §3 +
    ADR-0030 §DBGI for DBGI substrate), RULE 11 broader-community
    research at dependent sub-phases substantively serves as
    **canonical-coherence verification register** rather than
    substrate-architectural decision-making register. Substantively
    refines D-WIDER-KNOWLEDGE-CHECK-ENGAGEMENT-PRECISION (14th)
    canonical at substrate-build register. Verified at sub-phase 7
    Phase 0 (6 RQs canonical at NIOV register) + sub-phase 8 Phase 0
    (4 RQs canonical at NIOV register) — substantively converging
    on canonical-coherence at NIOV substrate-architectural register
    at every successive RULE 11 surface.

20. **D-GIT-STATUS-SHORT-UNTRACKED-DIR-COLLAPSE** (sub-phase 7
    commit `e80ff14` staging gate surface) — `git status --short`
    (`-s`) substantively collapses untracked directories to single-
    line entries (e.g., `?? apps/dbgi_supervisor/` rather than
    enumerating individual files). Substrate-state ground truth for
    new-file enumeration substantively requires `git status`
    (verbose) OR `find <dir> -type f` traversal at canonical
    register. Substantively load-bearing at staging-gate-surface
    register at canonical decision register — surfaced when strategic-
    tier framing miscount surfaced at substrate-state ground truth
    verification register at sub-phase 7 three-approval staging gate.

21. **D-PHASE-8-PG-VS-GPROC-DISCRIMINATION** (sub-phase 8 commit
    `d9a6766`) — modern OTP 23+ register substantively favors `:pg`
    alone at distributed process-group register; `:gproc` canonical
    at backward-compatibility / richer pattern-based discovery
    register. `:pg` is OTP-native since OTP 23 (built by WhatsApp
    Inc.; replaces deprecated `:pg2`); CRDT-based design (avoids
    availability problems of `:gproc`/`:syn`); cluster-aware by
    default ("strong eventual consistency" across nodes; partition-
    tolerant); multi-process group membership (NOT unique-name
    registration). `:gproc` "API difficult and barely documented"
    per community register — canonical at backward-compatibility
    register. **ADR-0030 §DBGI amendment LANDED at this commit**
    (canonical-pattern register clarification, NOT architectural-
    register supersession; substantively analogous to ADR-0034
    §Sub-decision 3-amendment register): `:pg` alone canonical at
    sub-phase 8 substantive register; `:gproc` deferred to forward-
    queue at sub-phase 11+ if substantively load-bearing surfaces
    at substrate-architectural register.

22. **D-STRATEGIC-TIER-TEMPORAL-ESTIMATE-OVER-PROJECTION** (recursive
    at today's session register) — strategic-tier framing at temporal
    estimation register substantively over-projects at substantive
    register, substantively because strategic-tier framing
    substantively load-bearing-counts substantive substrate-build
    operations at substantive register. Actual execution time at
    substrate-state ground truth register substantively faster at
    canonical-coherence register. Surfaced at sub-phase 8 actual
    execution at ~20 min substantive vs strategic-tier framing
    ~55-90 min estimate (substantively 60-75% over-projection at
    substantive register). Substantively related but distinct from
    D-CASCADE-SCOPE-PRECISION (cascade-site-count register) and
    D-SUBSTRATE-STATE-VS-STRATEGIC-FRAMING (decision-framing
    register).

23. **D-CLUSTER-NUMBERING-DRIFT** (this commit pre-flight surface
    register) — ADR-0035 §9 substrate-state ground truth has
    duplicate "10." numbering at L94 (D-CASCADE-SCOPE-PRECISION,
    added at sub-phase 6c as 10th observation of the original
    9-cluster) and L118 (D-SUBPHASE-COUNT-PRECISION, intended as
    10th observation of the post-6b cluster expansion). Substrate-
    state ground truth preserved at substantive register per Option β
    substrate-honest discipline LOCKED at this commit (NOT
    renumbered at substantive register; numbering drift documented
    as substrate-build observation canonical at substantive register
    at audit-trail-friendly register). Substantively load-bearing
    observation worth canonicalizing: substrate-state ground truth
    at canonical register substantively load-bearing at every
    observation point regardless of strategic-tier framing register;
    pre-flight surface canonical at substantive register
    substantively load-bearing at staging-gate-surface register at
    canonical decision register. Substantively analogous to
    D-GIT-STATUS-SHORT-UNTRACKED-DIR-COLLAPSE (20th) at substrate-
    state ground truth verification register — substrate-state
    ground truth surfaces drift that strategic-tier framing
    substantively missed.

32. **D-PHASE-10-DISCONNECT-TEST-CASCADE** (sub-phase 10
    `[BEAM-DBGI-INTEGRATION-TESTS]` substrate-build register) —
    `Node.disconnect/1` test in multi-node integration substrate
    substantively cascades at canonical register: (a) ExUnit
    randomizes test order WITHIN a module by default per seed-based
    canonical at substantive register; (b) when the disconnect test
    runs first in a randomized order, subsequent tests in the same
    module substantively fail with empty `Node.list/0` at canonical
    register; (c) `:peer.peer_down` default `:stop` substantively
    interprets `Node.disconnect/1` as peer-down at canonical-pattern
    register; the controlling process (setup_all callback)
    substantively terminates at canonical register; the linked peer
    node terminates per `:peer.start_link` canonical at substantive
    register; subsequent tests' setup_all on_exit substantively
    fails with "no process" at substrate-state ground truth register
    (Cluster.Supervisor + supervised children all terminate when the
    peer dies at canonical register).

    **Substrate-coherent fix REFRAMED post-RULE-11-research-gate at
    canonical decision register** per operator-tier rewind decision
    canonical at substantive register: ISOLATE partition test
    substrate in 5th integration test file (`partition_recovery_test.
    exs`) at canonical register per RQ4 per-file isolation canonical
    at substrate-coherent register (separate test file with own
    setup_all peer canonical at substantive register substantively
    prevents cascade canonical at substantive register) + APPLY
    RQ1 verbatim OTP `:peer.start_link` with `connection: 0`
    (alternative TCP control channel; auto-port) + `peer_down:
    :continue` canonical at partition-survival register substantively
    (peer + controlling process substantively survive `Node.disconnect/
    1` at canonical register; alternative TCP channel substantively
    independent of Distributed Erlang at canonical register) + FULL
    6-test disconnect → consistency during partition → reconnect →
    `:pg` membership re-replication → Phoenix.Tracker CRDT re-merge
    → Phoenix.PubSub broadcast resumption cycle canonical at
    substantive register per Q-B Option β LOCKED canonical at
    substantive register. See D-PHASE-10-PARTITION-SURVIVAL-CANONICAL
    33rd substantively below for RQ1 verbatim OTP canonical fix +
    RQ4 per-file isolation pattern at canonical-coherence
    verification register substantively at substantive register.

    Substantively analogous to D-AUDIT-OUTCOME-ENUM (8th) at
    integration-test-tier catches-substrate-coherence-bug register —
    integration-tier substantive surfaces substrate-coherence
    observations unit-tier substantively missed at canonical register.
    Sub-phase 10 substantive landing: 19 integration tests at
    canonical register (4 cluster_test.exs + 3 process_group_cluster_
    test.exs + 3 presence_replication_test.exs + 3 pubsub_broadcast_
    test.exs + 6 partition_recovery_test.exs); registry_test.exs
    substantively has no cross-node parallel — Registry process-local
    at canonical OTP register substantively at substantive register.

    *(Cited at `docs/architecture/beam-coordination-canonical-record.md`
    §8 + §10 per RULE 14 bidirectional citation; back-cite landed at
    sub-phase 13 closure.)*

33. **D-PHASE-10-PARTITION-SURVIVAL-CANONICAL** (sub-phase 10 RULE
    11 broader-community research gate canonical at substantive
    register) — `:peer.start_link` with `connection: 0` + `peer_down:
    :continue` substantively canonical at partition-survival test
    register per RQ1 verbatim OTP canonical at substantive register
    (https://www.erlang.org/doc/man/peer.html). Substrate-architectural
    canonical fix at substantive register: (a) `connection: 0`
    substantively uses alternative TCP control channel (auto-port)
    instead of default Distributed Erlang control channel canonical
    (alternative TCP channel substantively independent of Distributed
    Erlang at canonical register; `Node.disconnect/1` substantively
    severs Distributed Erlang only at canonical register; alternative
    TCP channel substantively unaffected at canonical register);
    (b) `peer_down: :continue` substantively keeps controlling process
    alive on connection loss canonical at substantive register
    (default `:stop` substantively cascades per D-PHASE-10-DISCONNECT-
    TEST-CASCADE 32nd canonical above); (c) `Node.connect/1`
    substantively re-establishes Distributed Erlang post-partition at
    canonical register; `:rpc.call` substantively works post-reconnect
    at canonical register.

    Per-file isolation canonical at substrate-coherent register per
    RQ4 broader-community research canonical at substantive register
    (Elixir Forum libcluster threads + Toran Billups multi-node ExUnit
    pattern canonical at community register; no single documented
    canonical pattern at community register at substantive register
    but consensus pattern canonical at substantive register): 5th
    integration test file (`partition_recovery_test.exs`) with own
    setup_all peer substantively prevents cascade to other integration
    test files at canonical register at substantive register.

    Settle timing canonical at substantive register per RQ2 + RQ3
    source-knowledge canonical at substantive register (hexdocs at
    https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html + OTP at
    https://www.erlang.org/doc/man/pg.html documentation insufficient
    at substantive register; source-knowledge canonical applied):
    `@recovery_wait_ms 5000` = 3× Phoenix.Tracker `:broadcast_period`
    canonical for CRDT re-merge convergence at substantive register
    (RQ2 ORSWOT-based CRDT auto-merge via heartbeat exchange
    canonical at substantive register); `@pg_settle_ms 500` canonical
    for `:pg` membership re-replication post-`Node.connect` at
    substantive register (RQ3 source-knowledge canonical: convergence
    typically <500ms small clusters at substantive register);
    `:peer` `wait_boot 30_000` canonical for full app-tree boot at
    substantive register (default 15_000 substantively insufficient
    per D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th canonical).

    Substantive substrate at canonical register: NEW
    `apps/dbgi_supervisor/test/support/cluster_helpers.ex`
    `start_partition_survival_peer!/1` canonical at substantive
    register (uses `:peer.start_link(%{name: ..., connection: 0,
    peer_down: :continue, wait_boot: 30_000, ...})` per RQ1 verbatim
    OTP canonical) + `recovery_wait_ms/0` canonical at substantive
    register; substantively additive to existing `start_peer!/1`
    canonical at substantive register (PRESERVED at substantive
    register; suitable for non-partition multi-node tests at
    canonical register). NEW `apps/dbgi_supervisor/test/integration/
    partition_recovery_test.exs` 6-test substantive scope canonical
    per Q-B Option β LOCKED canonical at substantive register
    (a) baseline cluster connectivity verified + (b) partition
    simulated; peer survives via partition-survival canonical;
    each side sees own state only canonical at substantive register
    + (c) reconnect via `Node.connect` substantively at canonical
    register + (d) `:pg` membership re-replicates post-reconnect
    canonical at substantive register + (e) Phoenix.Tracker
    presence CRDT-re-merges post-reconnect canonical at substantive
    register + (f) Phoenix.PubSub broadcast resumes post-reconnect
    canonical at substantive register).

    Substrate-architectural pairing at canonical register: 32nd
    documents the cascade observed at substrate-state ground truth
    register; 33rd documents the RQ1 verbatim OTP canonical fix +
    RQ4 per-file isolation pattern at substantive register; both at
    numbered ADR-0035 §9 register, both at same commit, audit trail
    reads as cascade-observed + canonical-fix-landed together at
    canonical register substantively at substantive register;
    government / enterprise / FedRAMP audit register reads canonical
    at substantive register per operator-tier Q-C Option β LOCKED
    canonical at substantive register.

    **Numbering discontinuity preserved at canonical register per
    Option β substrate-honest discipline**: 24th-31st substantively
    forward-queued substrate-build observation candidates documented
    at canonical register at commit body / module moduledoc / ADR
    amendment body surfaces at substantive register; substantively
    NOT promoted to ADR-0035 §9 numbered cluster at this commit per
    prior operator-tier locked decision register substantively
    (D-PHASE-10-PEER-CLOSURE-LOADING substantively documented at
    cluster_helpers.ex moduledoc canonical at substantive register;
    D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th + D-PHASE-10-
    PEER-VS-LOCAL-CLUSTER-DISCRIMINATION 31st substantively
    documented at ADR-0030 §DBGI sub-phase 10 amendment body
    canonical at substantive register; D-OBSERVATION-CLUSTER-
    SUBSTRATE-ARCHITECTURAL-BOUNDARY 24th + D-FOUR-REGISTER-
    SUBSTRATE-DISCIPLINE 25th + D-TASK-TRACKER-VS-SUBSTRATE-STATE-
    DRIFT 26th + D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-
    CANDIDATE 27th + D-PHASE-9-PG2-VS-PG-COEXISTENCE 28th +
    D-PHOENIX-TRACKER-PHX-REF-META-INJECTION 29th substantively
    documented at prior commit body surfaces canonical at
    substantive register). Numbering drift 23 → 32 → 33 substantively
    analogous to D-CLUSTER-NUMBERING-DRIFT (23rd) at substrate-state
    ground truth preservation register — substrate-state ground
    truth at canonical register substantively load-bearing at audit-
    trail-friendly register substantively at substantive register.

    *(Cited at `docs/architecture/beam-coordination-canonical-record.md`
    §8 + §10 per RULE 14 bidirectional citation; back-cite landed at
    sub-phase 13 closure.)*

34. **D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE** (sub-phase 11
    `[BEAM-OBSERVABILITY]` substrate-build register substantively at
    substantive register) — Foundation observability discipline
    canonical at substantive register substantively substantively
    forbids ALL identity-bearing labels + ALL high-cardinality labels
    at telemetry events + metrics tags + structured Logger metadata
    canonical at substantive register substantively. Observability
    substrate at NIOV Foundation substantively serves compliance +
    governance + sovereignty + privacy boundary discipline canonical
    at substantive register substantively at substantive register
    (NOT generic telemetry canonical at substantive register
    substantively); observability output substantively must report
    system behavior + timing + counts + lifecycle events +
    success/failure classes + queue/process/supervision state +
    depersonalized operational signals canonical at substantive
    register substantively at substantive register; substantively
    must NOT emit memory capsule contents + raw task context +
    user identity + business identity + government identity +
    customer names + proprietary documents + entity identifiers +
    PII + Business Identifiable Information + reconstructable
    lineage back to a DMW or task canonical at substantive register
    substantively.

    **ALLOWED tags canonical at substantive register substantively**
    per Q4 LOCKED Option β operator-tier authorization at canonical
    decision register substantively at substantive register: `op_name`
    (COSMP enum AUTHENTICATE/NEGOTIATE/READ/WRITE/SHARE/REVOKE/AUDIT
    public per patent US 12,517,919) + `status_class` (ok/error) +
    `exception_class` (low-cardinality exception category) +
    `storage_op` (put/get/delete) + `tracker_event` (join/leave) +
    `event_type` (join/leave or node_join/node_leave) + `outcome`
    (success/failure) + `process_group_name` (fixed substrate value
    only — DbgiSupervisor.PG canonical at substantive register
    substantively; NOT user/org/entity-defined) + `node_role` /
    `node_class` / `cluster_role` (normalized low-cardinality
    infrastructure category canonical at substantive register
    substantively) + `app` + `component` + `environment` (only if
    non-customer-identifying canonical at substantive register
    substantively).

    **FORBIDDEN tags canonical at substantive register substantively**:
    `entity_id` + `capsule_id` + `dmw_id` + `wallet_id` + `tenant_id`
    + `task_id` + `topic_tag` + `actor_principal_email` +
    `customer_name` + `org_name` + `government_agency_name` +
    `business_name` + raw `node` names (raw BEAM node names may be
    customer/org/deployment-encoding canonical at substantive register
    substantively at substantive register; use normalized `node_role`
    / `node_class` / `cluster_role` canonical at substantive register
    substantively at substantive register) + `hostname` + `ip_address`
    + `request_id` (if externally-traceable to customer/task/user) +
    Phoenix.Tracker keys + Phoenix.Tracker meta maps + `:pg` member
    identifiers + capsule payloads + raw task context + document
    names + file paths containing customer/org identifiers +
    proprietary context + any free text from memory capsules + any
    reconstructable lineage back to a DMW, task, customer, entity, or
    memory capsule canonical at substantive register substantively at
    substantive register.

    **Substantive substrate at canonical register substantively** at
    sub-phase 11 substantive landing: NEW `apps/cosmp_router/lib/
    cosmp_router/telemetry.ex` + NEW `apps/dbgi_supervisor/lib/
    dbgi_supervisor/telemetry.ex` Telemetry.Metrics + :telemetry_poller
    supervisor canonical at substantive register substantively (NO
    identity-bearing tags at canonical register substantively at
    substantive register at metric definitions canonical at
    substantive register substantively); instrumented call sites at
    `apps/cosmp_router/lib/cosmp_router/router.ex` (7 COSMP ops
    AUTHENTICATE/NEGOTIATE/READ/WRITE/SHARE/REVOKE/AUDIT via
    `:telemetry.span/3` canonical with op_name + status_class metadata
    canonical at substantive register substantively — NO capsule_id +
    NO principal_id + NO grantee + NO entity_id in event metadata
    canonical at substantive register substantively at substantive
    register), `apps/dbgi_supervisor/lib/dbgi_supervisor/process_group.
    ex` (join/leave with event_type + outcome metadata canonical at
    substantive register substantively — NO group keys at canonical
    register substantively at substantive register), `apps/
    dbgi_supervisor/lib/dbgi_supervisor/presence_tracker.ex`
    (handle_diff with count + diff_size measurement canonical at
    substantive register substantively — NO topic + NO Tracker keys
    + NO Tracker meta at canonical register substantively at
    substantive register); `config/config.exs` Logger config canonical
    at substantive register substantively (`:logger_json` Basic
    formatter at `:default_handler` register canonical at substantive
    register substantively per Elixir 1.19+ new-logger discipline
    canonical at substantive register substantively; allow-listed
    metadata canonical at substantive register substantively).

    **Test enforcement canonical at substantive register
    substantively** at unit-tier register substantively at substantive
    register: NEW `apps/cosmp_router/test/cosmp_router/telemetry_test.
    exs` + NEW `apps/dbgi_supervisor/test/dbgi_supervisor/telemetry_
    test.exs` substantively at substantive register substantively
    enforce: (1) Telemetry.Metrics definitions canonical at substantive
    register substantively + (2) FORBIDDEN identity-bearing tags NOT
    present at metric definitions canonical at substantive register
    substantively + (3) ALLOWED tags only at metric definitions
    canonical at substantive register substantively + (4) telemetry
    event metadata constrained to allow-list canonical at substantive
    register substantively (NO identity-bearing keys at event
    metadata register canonical at substantive register substantively
    at substantive register).

    **Substrate-architectural register canonical at substantive
    register substantively**: observability discipline at NIOV
    Foundation substantively NOT generic telemetry canonical at
    substantive register substantively at substantive register;
    substantively a compliance + governance + sovereignty + privacy
    boundary canonical at substantive register substantively at
    substantive register; FedRAMP / IL4-6 / CMMC / SOC 2 audit-grade
    canonical at substantive register substantively at substantive
    register; government / enterprise / patent-implementation evidence
    register at substantive register canonical at substantive register
    substantively. Substantively analogous to ADR-0002 (append-only
    audit chain) canonical at compliance-substrate register
    substantively at substantive register + ADR-0019 (cryptographic-
    suite posture) canonical at substrate-cryptographic-resilience
    register substantively at substantive register — observability
    canonical at substantive register substantively substantively
    extends compliance substrate canonical at substantive register
    substantively at substantive register at telemetry/metrics/logging
    register canonical at substantive register substantively at
    substantive register.

    Numbering drift 23 → 32 → 33 → 34 substantively continues per
    Option β substrate-honest discipline canonical at substantive
    register substantively at substantive register (24th-31st
    forward-queued canonical at substantive register substantively at
    substantive register at commit body / module moduledoc / ADR
    amendment body surfaces canonical at substantive register
    substantively at substantive register).
    **D-PHASE-10-PEER-CLOSURE-LOADING + D-PHASE-10-MULTI-NODE-TEST-
    RUNTIME-BUDGET 30th + D-PHASE-10-PEER-VS-LOCAL-CLUSTER-
    DISCRIMINATION 31st + D-PHASE-10-CI-PRESENCE-TRACKER-TIMING-
    CASCADE + D-PHASE-11-PROMETHEUS-BRIDGE-STALENESS** canonical at
    substantive register substantively at substantive register
    substantively remain forward-queued canonical at substantive
    register substantively (NOT promoted to ADR-0035 §9 numbered
    cluster at this commit register substantively at substantive
    register per Q-D Option α LOCKED operator-tier authorization at
    canonical decision register substantively at substantive register
    + prior Option β substrate-honest discipline canonical at
    substantive register substantively at substantive register
    decisions).

    *(Cited at `docs/architecture/beam-coordination-canonical-record.md`
    §7 + §9 per RULE 14 bidirectional citation; the no-identity-label
    discipline is the canonical observability/privacy/governance boundary
    at the BEAM coordination substrate. Back-cite landed at sub-phase 13
    closure.)*

35. **D-CAR-SUB-BOX-NUMBERING-DRIFT** (Sub-box 3 pre-flight surface
    register at ADR-0036 sub-phase 1 commit) — `docs/COMPLIANCE_
    ARCHITECTURE_REVIEW.md` §Recommended Sequencing canonicalizes the
    Section 12.5 sub-box enumeration: Sub-box 1 (EscalationRequest +
    dual-control middleware per CAR 1.5) + Sub-box 2 (Jurisdiction
    Tagging per CAR 1.6 + 2.4) + Sub-box 3 (REGULATOR + Lawful-Basis
    per CAR 2.1 + 2.2) + Sub-boxes 4-9. The progress tracker
    (`docs/reference/section-12-progress.md`) substantively uses
    different sub-box numbering at the L33-L35 row register:
    "Sub-box 2 Phase 1" = ADR-0026 dual-control middleware
    enhancement (NOT CAR Sub-box 2); "Sub-box 2 Phase 2" = ADR-0028
    Block B BEAM mini-arc (NOT CAR Sub-box 2). CAR Sub-box 2
    (Jurisdiction Tagging at Entity / MemoryCapsule / AuditEvent /
    OrgSettings + `assertJurisdictionalScope()` runtime check) is
    NOT yet landed at canonical register substantively at HEAD
    `a52d6d8`; the progress tracker's "Sub-box 2" rows substantively
    cover different work scopes.

    **Substrate-build implication at canonical register
    substantively**: future operators reading the progress tracker
    rows "Sub-box 2 Phase 1 CLOSED" + "Sub-box 2 Phase 2 CLOSED"
    could substantively conclude that CAR Sub-box 2 is closed —
    incorrect at canonical register substantively. Sub-box 3
    pre-flight at canonical decision register surfaced this drift
    at substrate-state ground truth register canonical at
    substantive register. ADR-0036 Sub-decision 13 Substrate-Honest
    Distinctions explicitly canonicalizes the drift at substantive
    register; section-12-progress.md gains a "CAR Sub-box 2 —
    Jurisdiction Tagging — QUEUED" row at this commit per Q6 LOCKED
    operator-tier authorization canonical at substantive register.
    Substantively analogous to D-CLUSTER-NUMBERING-DRIFT (23rd) at
    substrate-state ground truth preservation register canonical at
    substantive register — substrate-state ground truth at canonical
    register substantively load-bearing at audit-trail-friendly
    register substantively at substantive register; pre-flight
    surface canonical at substantive register substantively
    load-bearing at staging-gate-surface register at canonical
    decision register substantively at substantive register.

    **Substrate-coherent resolution at canonical register
    substantively** per operator-tier authorization at canonical
    decision register substantively per Q5 + Q6 LOCKED canonical at
    substantive register: PRESERVE both numbering canonicals at
    substrate-state ground truth register substantively (Option β
    substrate-honest discipline canonical at substantive register
    substantively analogous to D-CLUSTER-NUMBERING-DRIFT 23rd
    resolution canonical); ADD section-12-progress.md row
    explicitly canonicalizing "CAR Sub-box 2 — QUEUED" status at
    substantive register canonical at substantive register;
    PROMOTE D-CAR-SUB-BOX-NUMBERING-DRIFT 35th canonical at
    ADR-0035 §9 numbered cluster at substantive register at this
    commit. Substantively NOT renumber progress tracker rows at
    substantive register canonical at substantive register per
    substrate-honest historical preservation discipline canonical
    at substantive register substantively.

    *(Cited at `docs/architecture/decisions/0036-regulator-
    principal-lawful-basis-attestation-pattern.md` §Context and
    §11 Implementation Detail + `docs/reference/section-12-
    progress.md` CAR Sub-box 2 + CAR Sub-box 3 rows per RULE 14
    bidirectional citation. Back-cite landed at ADR-0036 sub-phase
    1 commit substantively at substantive register.)*

### Cluster sub-register expansion (post-this-commit)

Post-this-commit, the 23 canonical observations operate at six
sub-registers (5 NEW observations + 1 D-CLUSTER-NUMBERING-DRIFT
substantively distribute across sub-registers at substantive
register; ADR-amendment-coherence NEW sub-register at
substantive register):

- **CI-environment-coherence** (D-CI-FRESH-1/2/3 +
  D-IDEMPOTENCY-3)
- **Test-granularity coherence** (D-5BIII-COMMITB-1/2/3-REFINED +
  D-AUDIT-OUTCOME-ENUM + D-PHASE-3-ETS-NOT-TRANSACTIONAL +
  D-SANDBOX-ALLOW-VS-START-OWNER-DISCRIMINATION)
- **Pre-flight discipline coherence** (D-SUBSTRATE-LANDING-PREEMPT
  + D-ABORT-CONDITION-PRECISION + D-WIDER-KNOWLEDGE-CHECK +
  D-CASCADE-SCOPE-PRECISION + D-WIDER-KNOWLEDGE-CHECK-ENGAGEMENT-
  PRECISION + D-RULE-11-REPEATED-ENGAGEMENT +
  D-PRE-COMMITTED-ADR-CANONICAL-VERIFICATION +
  D-GIT-STATUS-SHORT-UNTRACKED-DIR-COLLAPSE +
  D-STRATEGIC-TIER-TEMPORAL-ESTIMATE-OVER-PROJECTION +
  D-CLUSTER-NUMBERING-DRIFT)
- **Cross-language coherence** (D-PHASE-2-CROSS-LANG-PRECISION-
  DRIFT)
- **Substrate-state-discipline coherence** (D-SUBPHASE-COUNT-
  PRECISION + D-SUBSTRATE-STATE-VS-STRATEGIC-FRAMING +
  D-OBSERVATION-VS-DECISION-DISCRIMINATION +
  D-PHASE-8-PG-VS-GPROC-DISCRIMINATION)
- **ADR-amendment-coherence** NEW (D-AMENDMENT-FORWARD-QUEUE-
  CLOSURE-CASCADE)

### D-OBSERVATION-CLUSTER-SUBSTRATE-ARCHITECTURAL-BOUNDARY (24th forward-substrate observation candidate)

Cluster at 23 observations substantively past the ~20-observation
boundary canonical at D-OBSERVATION-VS-DECISION-DISCRIMINATION
(17th) forward-substrate guidance ("as cluster grows beyond ~20
observations, may warrant separate observation-corpus doc OR
thematic sub-ADRs"). Forward-substrate observation candidate
recursively at this commit register: substrate-architectural
decision at canonical decision register about cluster split (per
sub-register thematic split candidate: separate ADR per sub-
register) OR substrate-corpus doc canonical at substrate-state
ground truth register. Recursively forward-queued per
D-AMENDMENT-FORWARD-QUEUE-CLOSURE-CASCADE (18th) canonical at
substantive register; substrate-architectural decision deferred to
operator-tier at canonical decision register when 25th+
observation surfaces at substantive register.

### Sub-arc 1 sub-phase b cluster expansion (25th observation)

D-PRE-AUTHORIZATION-RESEARCH-ARC promoted from forward-queued
substrate-build observation at commit-body-only register
substantively to canonical RULE 21 at CLAUDE.md register
substantively per `[OPS-RULE-21-PRE-AUTHORIZATION-RESEARCH-ARC-
CANONICAL]` commit at sub-arc 1 sub-phase b register substantively
per RULE 20 Founder authorization 2026-05-16.

**5 canonical recurrence sites at canonical-evidence register
substantively:**

1. B.3 revert register substantively (canonical Horde 0.10 docs
   guide research arc canonical at canonical-knowledge register
   substantively prior to B.3 redraft authorization; external
   library version semantics outside RULE 11 narrow Elixir/BEAM
   scope)

2. B.6.1 register substantively (canonical Protocol Buffers
   Language Guide proto3 backward-compat research arc canonical
   at canonical-knowledge register substantively prior to wire-
   format authorization; wire-format conventions outside RULE 11
   scope)

3. B.6.2 register substantively (TypeScript optional field
   semantics + strict-mode interaction research arc canonical at
   canonical-knowledge register substantively prior to TS interface
   authorization; cross-language strict-mode outside RULE 11 scope)

4. B.6.3 pre-flight register substantively (canonical Elixir
   umbrella circular-dependency research arc canonical at
   canonical-knowledge register substantively prior to substrate-
   architectural option lock; pre-flight RULE 13 surface canonical
   at canonical-honest register substantively caught circular dep
   that would have crashed compile-time discipline at canonical-
   execution register substantively; cross-app umbrella dependency
   analysis outside RULE 11 iteration-loop scope)

5. Cross-cutting register substantively (operator-tier
   authorization of RULE 21 pre-authorization research arc pattern
   as canonical discipline at substrate-architectural authorization
   register substantively)

**Distinction from existing RULE 11 at canonical-rule register
substantively:**

- RULE 11 trigger: non-deterministic test failures; supervised
  GenServer behavior across test boundaries; ETS/Sandbox/DBConnection
  ownership; cross-test-cycle state contamination; local iteration-
  loop stall canonical at Elixir/BEAM substrate register
  substantively

- RULE 21 trigger: external library version semantics; wire-format
  conventions; cross-app umbrella dependencies; cross-language
  strict-mode interactions; substrate-state ground truth
  verification at PRE-AUTHORIZATION register substantively

- Remediation paths distinct: RULE 11 fires AFTER iteration-loop
  stall (move from local debugging to wider Elixir/BEAM community
  research); RULE 21 fires BEFORE authorization paste drafted
  (research arc embedded in paste body at canonical-prose register
  substantively before code writes begin)

**Recursive evidence at canonical-honest register substantively:**
D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-BEFORE-PREMISE-
LOCK observation surfaced at this commit's own pre-flight register
substantively: paste-authoring register at Claude register
substantively failed to grep CLAUDE.md canonical RULE 11 state +
ADR-0035 actual section structure BEFORE drafting prior paste
premise. Pre-flight RULE 13 surface canonical at canonical-honest
register caught both variances. The very rule being landed
evidences its own value at canonical-knowledge register
substantively. Pattern preservation at canonical-coherence
register substantively for forward-substrate paste-authoring
register at sub-arc 1 sub-phase c + sub-phase d + sub-arc 2 +
sub-arc 3 register substantively.

**Bidirectional citation per ADR-0020:** CLAUDE.md RULE 21
canonical at operator-facing register substantively; ADR-0035
Sub-arc 1 sub-phase b cluster expansion 25th observation
canonical at substrate-architectural register substantively.

### Sub-arc 1 sub-phase c cluster expansion (26th observation)

D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT promoted from
forward-queued substrate-build observation at commit-body-only
register substantively (carried across B.3 redraft + B.5 + C.1
register substantively) to ADR-0035 cluster expansion canonical at
substrate-architectural register substantively per Option β
substrate-honest discipline at recurrence-3 register substantively
per `[BEAM-DBGI-PROMOTE-ON-ACTIVITY-CLOSURE]` commit at sub-arc 1
sub-phase c register substantively per RULE 20 Founder authorization
2026-05-17.

**Pattern canonical at canonical-prose register substantively:**

NEW Application supervision tree child registration canonical at
canonical-execution register substantively requires test fixture
children-count assertion amendment canonical at canonical-coherence
register substantively. Otherwise, NEW supervised child canonical at
canonical-execution register substantively breaks existing test
fixture canonical at substrate-state register substantively (canonical
test exemplar: cosmp_router_test.exs supervision tree children-count
assertion + child-module name assertions register substantively).

**3 canonical recurrence sites at canonical-evidence register
substantively:**

1. B.3 redraft register substantively (Horde Registry + Horde
   DynamicSupervisor substrate landing at supervision tree register
   substantively per ADR-0039 Sub-decision 1; canonical pattern
   emerged at supervision tree expansion register substantively;
   recurrence-1 register substantively)

2. B.5 register substantively (CosmpRouter.WalletCache supervision
   tree landing per ADR-0039 Sub-decision 5; ETS read-optimized cache
   substrate canonical at canonical-coherence register substantively;
   recurrence-2 register substantively)

3. C.1 register substantively (CosmpRouter.ActivityCounter supervision
   tree landing per ADR-0039 Amendment 1 substrate register
   substantively; ETS atomic-counter substrate canonical at canonical-
   coherence register substantively; recurrence-3 register
   substantively at substrate-build promotion threshold register
   substantively per Option β discipline canonical)

**Substrate-honest disposition canonical at canonical-coherence
register substantively:**

Pre-paste-draft register substantively at paste-authoring register
substantively MUST include cosmp_router_test.exs children-count
assertion grep canonical at canonical-coherence register substantively
at Step 1 pre-flight register substantively whenever supervision tree
expansion register substantively is involved. Pattern preservation
forward-substrate canonical at canonical-coherence register
substantively for sub-phase d + sub-arc 2 + sub-arc 3 register
substantively.

**Distinction from RULE 21 D-PRE-AUTHORIZATION-RESEARCH-ARC canonical
at canonical-rule register substantively:**

RULE 21 fires at PRE-AUTHORIZATION register substantively for
substrate-architectural pastes; D-SUPERVISION-TREE-EXPANSION-TEST-
COHERENCE-DRIFT fires at IMPLEMENTATION register substantively when
supervision tree child added at canonical-execution register
substantively. Both disciplines canonical at canonical-coherence
register substantively; RULE 21 applies broader (cross-cutting
substrate-architectural pastes) + D-SUPERVISION-TREE-EXPANSION
applies narrower (supervision tree expansion specifically).

**Bidirectional citation per ADR-0020:** ADR-0039 Amendment 1 §C.1
register substantively + sub-phase c row register substantively at
section-12-progress.md canonical at canonical-coherence register
substantively; ADR-0035 sub-arc 1 sub-phase c cluster expansion 26th
observation canonical at substrate-architectural register
substantively.

### Sub-arc 1 sub-phase c cluster expansion (27th observation)

D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-BEFORE-PREMISE-LOCK
promoted from forward-queued substrate-build observation at commit-
body-only register substantively (carried across RULE 21 promotion
paste + C.2 + C.3 + C.4 + C.5 register substantively at recurrence-6
register substantively) to ADR-0035 cluster expansion canonical at
substrate-architectural register substantively per Option β substrate-
honest discipline per `[BEAM-DBGI-PROMOTE-ON-ACTIVITY-CLOSURE]` commit
at sub-arc 1 sub-phase c register substantively per RULE 20 Founder
authorization 2026-05-17.

**Pattern canonical at canonical-prose register substantively:**

Authorization paste authored at operator-tier register substantively
premises (function existence + structural levels + prose patterns +
canonical paths + ADR section names) without explicit substrate-state
grep verification at paste-authoring register substantively. Pre-flight
Step 1 register substantively catches the drift canonical at canonical-
honest register substantively per RULE 21 D-PRE-AUTHORIZATION-RESEARCH-
ARC discipline canonical at canonical-rule register substantively, but
the recurrence pattern register substantively indicates pre-paste-draft
discipline canonical at canonical-coherence register substantively
needs extension beyond RULE 21 canonical at canonical-rule register
substantively.

**6 canonical recurrence sites at canonical-evidence register
substantively:**

1. RULE 11 vacant assumption (RULE 21 promotion paste register
   substantively; recurrence-1 register substantively per `67f6112`
   commit register substantively)

2. ADR-0035 §9 numbered cluster structure assumption (RULE 21
   promotion paste register substantively; recurrence-2 register
   substantively per `67f6112` commit register substantively;
   substrate-state ground truth was chronological cluster-expansion
   sub-headings)

3. DbgiSupervisor.stop_dmw_worker_horde existence assumption (C.2
   paste register substantively; recurrence-3 register substantively
   per `1dd1d64` commit register substantively; substrate-state
   ground truth was single-node `stop_dmw_worker/1` only)

4. Carried context register substantively (recurrence-4 register
   substantively at cross-cutting paste-authoring register
   substantively)

5. D-DEVICE-SKIPS-PROMOTE-CHECK Test 6 framing assumption (C.3 paste
   register substantively; recurrence-5 register substantively per
   `18300c3` commit register substantively; substrate-state ground
   truth was DEVICE bypasses dispatch_with_promote_check entirely at
   {:ok, _other_tier} branch register substantively)

6. ADR-0039 H3-vs-H2 amendment subsection structural assumption (C.4
   paste register substantively; recurrence-6 register substantively
   per `b7fa258` commit register substantively; substrate-state ground
   truth was ADR-0011 §Amendment canonical at H2 register substantively
   NOT H3 register substantively + Post-Closure Implementation Lineage
   canonical at H2 register substantively NOT H3 register substantively)

**Recursive evidence at canonical-honest register substantively:**
C.5 closure cascade paste itself premised `docs/section-12-progress.md`
path register substantively (substrate-state ground truth was
`docs/reference/section-12-progress.md`) + `CURRENT_BUILD_STATE.md`
root path register substantively (substrate-state ground truth was
`docs/CURRENT_BUILD_STATE.md`). Pre-flight RULE 13 surface canonical
at canonical-honest register substantively caught both variances at
canonical-execution register substantively per `bdpqf7s8t` pre-flight
register substantively. The very promotion paste evidences its own
recurrence at canonical-knowledge register substantively at canonical-
coherence register substantively.

**Substrate-honest disposition canonical at canonical-coherence
register substantively:**

Pre-paste-draft register substantively at paste-authoring register
substantively MUST defer ALL canonical function references + ALL
structural section names + ALL prose pattern assumptions + ALL
canonical paths + ALL ADR section names + ALL line numbers to Step 1
pre-flight verification register substantively canonical at canonical-
honest register substantively. Paste body register substantively uses
placeholder names at NEED-VERIFICATION register substantively that
Claude Code MUST verify at canonical-honest register substantively at
Step 1 register substantively BEFORE writes fire at canonical-
execution register substantively. Pattern preservation canonical at
canonical-coherence register substantively for forward-substrate
paste-authoring register at sub-phase d + sub-arc 2 + sub-arc 3
register substantively. RULE 21 D-PRE-AUTHORIZATION-RESEARCH-ARC
canonical discipline canonical at canonical-rule register
substantively at canonical-coherence register substantively now
operates at canonical-execution register substantively but the
recurrence frequency canonical at canonical-honest register
substantively indicates STRUCTURAL rather than ATTENTION-DRIVEN
causation register substantively — paste-authoring register
substantively at Claude register substantively does NOT have substrate-
state ground truth context at paste-drafting register substantively
without explicit grep verification at paste-authoring register
substantively.

**Distinction from RULE 21 D-PRE-AUTHORIZATION-RESEARCH-ARC canonical
at canonical-rule register substantively:**

RULE 21 fires at PRE-AUTHORIZATION register substantively for
substrate-architectural pastes triggered by external library version
semantics + wire-format conventions + cross-app umbrella dependencies +
cross-language strict-mode interactions + substrate-state ground truth
verification. D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-BEFORE-
PREMISE-LOCK fires at IMPLEMENTATION register substantively at the
authorization-paste-drafting register substantively itself — Claude
register substantively at paste-authoring register substantively
drafts paste premises without grep verification of substrate-state
ground truth canonical at canonical-honest register substantively. Both
disciplines canonical at canonical-coherence register substantively;
RULE 21 is the PRE-AUTHORIZATION canonical rule + D-PASTE-AUTHORING-
FAILED-TO-GREP is the PASTE-DRAFTING canonical observation that RULE 21
operationalization-incomplete at paste-authoring register substantively.

**Bidirectional citation per ADR-0020:** RULE 21 canonical at
operator-facing register substantively per `67f6112` commit
substantively + ADR-0039 Amendment 1 §C.4 paste register substantively
+ sub-phase c row register substantively at section-12-progress.md
canonical at canonical-coherence register substantively; ADR-0035 sub-
arc 1 sub-phase c cluster expansion 27th observation canonical at
substrate-architectural register substantively.

### Sub-arc 1 sub-phase d cluster expansion (28th observation)

D-PASTE-AUTHORIZATION-FAILED-TO-GREP-DISPATCH-HELPER-ARG-ORDER
promoted from forward-queued substrate-build observation at commit-
body-only register substantively (surfaced at D.3 register
substantively per `28a5abc` commit body substantively) to ADR-0035
cluster expansion canonical at substrate-architectural register
substantively per Option β substrate-honest discipline at
recurrence-7 register substantively per
`[BEAM-DBGI-DEVICE-COLDSHARD-CLOSURE]` commit at sub-arc 1 sub-phase
d register substantively per RULE 20 Founder authorization 2026-05-17.

**Pattern canonical at canonical-prose register substantively:**

Authorization paste includes example code with helper function call
canonical at canonical-prose register substantively whose argument
order substantively differs from the substrate-state ground truth
canonical at substrate-state register substantively (existing helpers
in the same module use a different argument-order convention canonical
at canonical-execution register substantively); paste-authoring at
operator-tier register substantively does not grep existing helpers
in the target module before drafting the example canonical at
canonical-prose register substantively. Pre-flight Step 1 register
substantively catches the drift canonical at canonical-honest register
substantively per RULE 13 inline-surface discipline canonical at
canonical-rule register substantively + Founder explicit "adjusted to
actual code style found in Step 1" guidance canonical at canonical-
decision register substantively pre-authorizes the substrate-coherent
correction at canonical-execution register substantively.

**Recurrence-7 site canonical at canonical-evidence register
substantively (sub-arc 1 sub-phase d D.3 register substantively):**

D.3 authorization paste Step 3 example code at canonical-prose
register substantively used `dispatch_device_shard(entity_id, operation, request)`
argument order canonical at canonical-prose register substantively;
substrate-state ground truth canonical at substrate-state register
substantively at `apps/cosmp_router/lib/cosmp_router/grpc/server.ex`
register substantively showed existing `dispatch_enterprise/3` +
`dispatch_with_promote_check/4` helpers use
`(op_name, entity_id, request)` argument order canonical at canonical-
execution register substantively (op_name FIRST). Adjusted
`dispatch_device_shard/3` signature canonical at canonical-coherence
register substantively per Founder explicit guidance "Expected branch
shape, adjusted to actual code style found in Step 1" register
substantively. Additional substrate-state correction at canonical-
honest register substantively: D.3 paste Step 3 example referenced
`WalletLookup.wallet_type_for_entity(entity_id)`; substrate-state
ground truth at grpc/server.ex:187 canonical at substrate-state
register substantively showed actual call is
`CosmpRouter.WalletCache.wallet_type_for(entity_id)` register
substantively; preserved existing call at canonical-coherence
register substantively.

**Distinction from 27th observation D-PASTE-AUTHORING-FAILED-TO-GREP-
CANONICAL-STATE-BEFORE-PREMISE-LOCK canonical at substrate-
architectural register substantively:**

27th observation register substantively canonical at structural
state register substantively (canonical paths + ADR section names +
H2-vs-H3 heading levels + RULE numbering); 28th observation register
substantively canonical at function-signature register substantively
(helper argument order + sibling-function call-target name).
Recurrence-7 of 28th observation register substantively is the
specialized recurrence of the broader paste-authoring failed-to-grep
pattern at function-signature granularity register substantively;
27th observation register substantively is the broader pattern
canonical at structural-state granularity register substantively.

Both observations canonical at canonical-coherence register
substantively; remediation discipline canonical at canonical-rule
register substantively per RULE 21 D-PRE-AUTHORIZATION-RESEARCH-ARC
canonical at canonical-rule register substantively per `67f6112`
commit register substantively + RULE 13 inline-surface canonical
canonical at canonical-rule register substantively.

**Substrate-honest disposition canonical at canonical-coherence
register substantively:**

Pre-paste-draft register substantively at paste-authoring register
substantively MUST grep sibling helper functions in the target module
canonical at canonical-coherence register substantively at Step 1
pre-flight register substantively whenever dispatch helper code
canonical at canonical-prose register substantively is drafted in
authorization paste register substantively. Pattern preservation
canonical at canonical-coherence register substantively for forward-
substrate paste-authoring register at sub-arc 2 + sub-arc 3 register
substantively (particularly dispatch helper + router helper +
operations helper drafting registers).

**Bidirectional citation per ADR-0020:** D.3 `28a5abc` commit body
canonical at canonical-coherence register substantively at register
substantively + `apps/cosmp_router/lib/cosmp_router/grpc/server.ex`
register substantively at canonical-execution register substantively
+ sub-phase d row register substantively at section-12-progress.md
canonical at canonical-coherence register substantively; ADR-0035
sub-arc 1 sub-phase d cluster expansion 28th observation canonical at
substrate-architectural register substantively.

## Decision

NIOV Labs canonicalizes the 9 substrate-build discipline
observations at ADR register (this ADR); binds the most
important one (D-WIDER-KNOWLEDGE-CHECK) at RULE register
(RULE 11 NEW); provides curated reference doc
(`docs/contributing/elixir-beam-best-practices.md` NEW); and
integrates at `docs/contributing/onboarding-for-engineers.md` §1
+ §2 + §6 cascade. The combined substrate ensures contributors
and their AI tools operate under canonical patterns from
session-start.

Five sub-decisions:

### Sub-decision 1: RULE 11 fills the vacant rule slot

RULE 11 (Wider Knowledge Check for Elixir/BEAM Substrate) lands
the D-WIDER-KNOWLEDGE-CHECK discipline at the operating-manual
register. The trigger conditions, required reading pointer, and
pre-flight integration are canonical at the RULE register so
sessions internalize the discipline at session-start (RULE 17
load-on-open).

### Sub-decision 2: ADR-0035 catalogs the canonical observations (9 at landing; 17 post-sub-phase-6b; 23 post-this-commit)

The observations are documented in §Context above with their
sub-phase + commit lineage. Future substrate-build observations
will be appended to this ADR (or land in a successor ADR if the
cluster grows beyond what one ADR can hold coherently — see
D-OBSERVATION-VS-DECISION-DISCRIMINATION 17th observation
forward-substrate guidance + D-OBSERVATION-CLUSTER-SUBSTRATE-
ARCHITECTURAL-BOUNDARY 24th candidate forward-substrate
observation at §Context cluster sub-register expansion).

**Sub-phase 6b amendment**: cluster expanded from 9 → 17 canonical
observations per §Context "Sub-phase 6b cluster expansion" above.
The in-place §Context expansion is substrate-coherent at the
observation-cluster register per D-OBSERVATION-VS-DECISION-
DISCRIMINATION canonical (broader-community ADR canonical for
decisions favors multiple smaller ADRs; canonical for observations
favors per-incident with cross-references or in-place lessons-
learned library). NIOV's RULE 14 bidirectional citation discipline
exceeds broader-community canonical, providing substrate-coherence
across the observation-cluster.

**Post-this-commit amendment (Option β LOCKED)**: cluster expanded
from 17 → 23 canonical observations per §Context "Post-sub-phase-7-8
cluster expansion" above. 6 NEW observations added (18-23) at
substrate-coherent register; D-CLUSTER-NUMBERING-DRIFT (23rd)
documents the pre-existing L94/L118 duplicate "10." numbering at
substrate-honest discipline canonical register (substrate-state
ground truth preserved; NOT renumbered). D-OBSERVATION-CLUSTER-
SUBSTRATE-ARCHITECTURAL-BOUNDARY (24th candidate) recursively
forward-queued per D-AMENDMENT-FORWARD-QUEUE-CLOSURE-CASCADE (18th)
canonical at substantive register — cluster substantively at 23
past ~20-observation boundary; substrate-architectural decision
(cluster split OR thematic sub-ADRs) deferred to operator-tier at
canonical decision register when 25th+ observation surfaces.

### Sub-decision 2-amendment: ADR-0034 amendment LANDED (post-sub-phase-6b)

**D-SANDBOX-ALLOW-VS-START-OWNER-DISCRIMINATION** (16th canonical
observation) surfaced at sub-phase 6b Phase 3 Step 3-e execution
that ADR-0034 Sub-decision 3 framing ("Sandbox.allow canonical Ecto
pattern for app-supervised GenServer case") conflated single-test
vs sequential-multi-test scenarios. The canonical discrimination:

- `Sandbox.allow(Repo, self(), pid)` is canonical for **single-test
  cross-process access** (one test boundary; one Sandbox owner)
- `start_owner!(Repo, shared: true)` + `stop_owner(pid)` is canonical
  for **sequential multi-test access to app-supervised GenServer**
  (dedicated owner process surviving test process lifecycle)

**ADR-0034 amendment LANDED**: ADR-0034 §Sub-decision 3-amendment
documents the discrimination at the canonical-pattern register at
the `[ADR-0034-SUB-DECISION-3-AMENDMENT]` commit post-sub-phase-6b
CI green per RULE 20 (ADR modifications are Founder-authorized) +
per D-SUBSTRATE-LANDING-PREEMPT principle (substantive substrate-
landing commits absorb forward-reference markers naturally; the
amendment is substrate-coherent at its own register and warrants a
dedicated commit). Sub-phase 6b commit landed the substrate-state
resolution (`start_owner!/stop_owner` setup in grpc/server_test.exs);
the `[ADR-0034-SUB-DECISION-3-AMENDMENT]` commit landed the ADR-text
amendment + this forward-queue closure cascade.

### Sub-decision 3: `elixir-beam-best-practices.md` curated reference

`docs/contributing/elixir-beam-best-practices.md` (NEW)
substantively covers the discipline + 6 canonical Elixir/BEAM
sources + pattern catalog + when-to-use checklist. The doc is
the **operating substrate** for the RULE 11 discipline (RULE 11
points at it; ADR-0035 cites it bidirectionally; the onboarding
doc lists it in required reading).

### Sub-decision 4: Onboarding cascade integrates the discipline

`docs/contributing/onboarding-for-engineers.md` §1 (pre-flight
discipline integration), §2 (RULES + ADRs count update), and §6
(recommended reading addition) all amend to surface RULE 11 +
ADR-0035 + `elixir-beam-best-practices.md` at contributor-entry
register. New contributors and their AI tools read the substrate
from session-start.

### Sub-decision 5: This ADR's substrate-build register binds the discipline

ADR-0035 sits at substrate-build register alongside ADR-0027 +
ADR-0029. The pattern: substrate-build ADRs canonicalize
discipline that compounds across multiple sub-phases. ADR-0034
documents the canonical pattern at architectural register;
ADR-0035 documents the discipline at substrate-build register;
RULE 11 binds the discipline at operating-manual register.
Three registers, one discipline.

## Consequences

### Easier

- Substrate-build discipline substrate-binds at RULE 11
  register; new contributors' AI tools read it at session-start
  per RULE 17 load-on-open
- ADR-0035 is load-bearing for all future substrate-build
  observations — the 9 canonical observations have a canonical
  home with sub-phase + commit lineage
- `elixir-beam-best-practices.md` curated reference accelerates
  contributor onboarding to Elixir/BEAM substrate work
- Sub-phases 7-13 (DBGI substrate) operate under canonical
  discipline from session-start — Elixir/BEAM substrate work at
  the DBGI register inherits the testability pattern (ADR-0034)
  + the substrate-build discipline (ADR-0035 + RULE 11)
- Cumulative-lineage cascade at 6c (17 → 19 sub-phases per
  Q-NEW-SPLIT-2 + Q-NEW-SPLIT-3 combined) demonstrates
  D-CASCADE-SCOPE-PRECISION canonical operational
- Substrate-build cluster grows in a substrate-coherent register
  — appended observations land in this ADR's §Context (with
  sub-phase + commit lineage)

### Harder

- Substrate-build discipline canonicalization adds a substrate-
  binding maintenance surface: future substrate-build
  observations must be appended to ADR-0035 §Context with
  sub-phase + commit lineage
- The 9-observation catalog is a starting point, not a closed
  set — successor ADRs may emerge if the cluster grows beyond
  what one ADR can hold coherently (substrate-coherent register
  question)
- RULE 11 substrate-binds Elixir/BEAM canonical-research
  discipline at the operating-manual register — sessions
  touching Elixir/BEAM substrate MUST research broader community
  patterns at pre-flight (modest token cost; meaningful substrate
  quality improvement)

## Alternatives Considered

### Document inline in ADR-0034 amendment

Append a §Substrate-Build Discipline section to ADR-0034
documenting the 9 observations. Rejected for missing the
substrate-build discipline canonical register — D-WIDER-
KNOWLEDGE-CHECK + D-CASCADE-SCOPE-PRECISION + the other 7
observations describe how substrate gets built reliably, which
is a register distinct from ADR-0034's substrate-architectural
register (canonical Elixir testability pattern).

### Single substrate-build observations ADR per cluster

Create separate ADRs per observation (one for D-WIDER-KNOWLEDGE-
CHECK, one for D-AUDIT-OUTCOME-ENUM, etc.). Rejected for
fragmenting the substrate-build discipline canonical register
across many small ADRs; one consolidated ADR is more navigable
+ allows the cluster to grow coherently.

### Document only in commit bodies + canonical-record doc

Leave the 9 observations distributed across commit bodies and
the canonical-record analog doc (forward-queued to sub-phase 12).
Rejected for not binding at the substrate register a new
contributor or AI tool would read at session-start — RULE 17
load-on-open principle requires canonical patterns at the
RULE / ADR / onboarding-doc register, not buried in commit
histories.

## Forward Path

| Sub-phase | Subject | This ADR's instantiation |
|-----------|---------|---------------------------|
| 6c (this commit) | `[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]` | RULE 11 + ADR-0035 substantive landing + `elixir-beam-best-practices.md` NEW + onboarding-for-engineers.md §1 + §2 + §6 cascade + 17 → 19 cumulative-lineage rotation (~20 sites) |
| 6b | `[BEAM-COSMP-INTEGRATION-TESTS]` | 19 deferred tests consume canonical discipline register; CI workflow MOD `mix test --include integration`; D-PHASE-1-UUID-CAST resolution at Storage.Postgres.get/1 guard |
| 7-10 | DBGI sub-phases | DBGI supervisor + DBGI integration tests port testability discipline pattern (ADR-0034 architectural) + substrate-build discipline (this ADR canonical) |
| 11 | `[BEAM-OBSERVABILITY]` | `:telemetry_metrics` events emitted at the substrate-build discipline register |
| 12 | `[BEAM-CANONICAL-RECORD]` | Canonical-record analog doc cites ADR-0035 + RULE 11 + `elixir-beam-best-practices.md` load-bearing for the Block B substrate-build lineage |
| 13 | `[BEAM-ARC-CLOSURE]` | Arc-closure cascade; ADR-0035 cluster appended with closure observations as they surface; section-12-progress.md update |

## References

- ADR-0027 — Contributor Governance + AI-Alignment +
  Rule-Modification Authority (substrate-build register
  precedent; authorization-tier protection)
- ADR-0029 — Substrate-Build Optimizations (substrate-build
  register precedent; cascade-grep + commit-class templates +
  strategy-tier prose)
- ADR-0034 — BEAM COSMP Testability Refactor Pattern
  (canonical Elixir testability pattern; D-WIDER-KNOWLEDGE-CHECK
  origin documented at ADR register; load-bearing for RULE 11
  required-reading content)
- ADR-0031 — BEAM Routing Substrate Architecture
- ADR-0033 — BEAM Persistence + Idempotency + Audit-Chain
  Cryptographic Substrate Architecture
- ADR-0030 — Phase 2 Elixir/BEAM Implementation (Block B
  mini-arc; 17 → 18 at 6a per Q-NEW-SPLIT-2; 18 → 19 at 6c per
  Q-NEW-SPLIT-3)
- RULE 11 (CLAUDE.md operating manual) — Wider Knowledge Check
  for Elixir/BEAM Substrate (this ADR's operating-manual
  substrate-binding companion)
- RULE 13 — substrate-honest pre-flight discipline (the
  upstream observation register that surfaces substrate-build
  observations for canonicalization)
- RULE 20 — Rule-Modification Authority (Founder authorization
  for RULES + ADRs; explicit at this ADR's creation)
- `docs/contributing/elixir-beam-best-practices.md` — curated
  reference doc (the operating substrate for RULE 11)
- `docs/contributing/onboarding-for-engineers.md` — substrate
  orientation for new contributors

## Bidirectional Citations

### Cites

- ADR-0027 (substrate-build register precedent)
- ADR-0029 (substrate-build register precedent)
- ADR-0034 (D-WIDER-KNOWLEDGE-CHECK origin + canonical Elixir
  testability pattern at architectural register)
- ADR-0030 (Block B mini-arc context for the 9 observations)
- RULE 11 (operating-manual substrate-binding)
- RULE 13 (substrate-honest pre-flight discipline)
- RULE 20 (Founder authorization)

### Cited from

- RULE 11 (CLAUDE.md) — substantive landing references this ADR
- `docs/contributing/elixir-beam-best-practices.md` §5 + §6
  (bidirectional citations)
- `docs/contributing/onboarding-for-engineers.md` §1 + §2 + §6
  (cascade integration at sub-phase 6c)
- `docs/architecture/README.md` ADR catalog (Phase 6 of this
  commit)
- `CLAUDE.md` ADR catalog (Phase 5 of this commit; operating-
  manual register)
- Future Elixir/BEAM ADRs (sub-phases 7-13 DBGI substrate; the
  substrate-build discipline carries forward)
