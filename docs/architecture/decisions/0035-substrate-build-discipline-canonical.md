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
    discrimination. ADR-0034 amendment forward-queued for separate
    amendment commit post-sub-phase-6b CI green.
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

### Cluster sub-register expansion (post-6b)

Post-sub-phase-6b, the 17 observations operate at five sub-registers:

- **CI-environment-coherence** (D-CI-FRESH-1/2/3 +
  D-IDEMPOTENCY-3)
- **Test-granularity coherence** (D-5BIII-COMMITB-1/2/3-REFINED +
  D-AUDIT-OUTCOME-ENUM + D-PHASE-3-ETS-NOT-TRANSACTIONAL +
  D-SANDBOX-ALLOW-VS-START-OWNER-DISCRIMINATION)
- **Pre-flight discipline coherence** (D-SUBSTRATE-LANDING-PREEMPT
  + D-ABORT-CONDITION-PRECISION + D-WIDER-KNOWLEDGE-CHECK +
  D-CASCADE-SCOPE-PRECISION + D-WIDER-KNOWLEDGE-CHECK-ENGAGEMENT-
  PRECISION + D-RULE-11-REPEATED-ENGAGEMENT)
- **Cross-language coherence** (D-PHASE-2-CROSS-LANG-PRECISION-
  DRIFT)
- **Substrate-state-discipline coherence** (D-SUBPHASE-COUNT-
  PRECISION + D-SUBSTRATE-STATE-VS-STRATEGIC-FRAMING +
  D-OBSERVATION-VS-DECISION-DISCRIMINATION)

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

### Sub-decision 2: ADR-0035 catalogs the canonical observations (9 at landing; 17 post-sub-phase-6b)

The observations are documented in §Context above with their
sub-phase + commit lineage. Future substrate-build observations
will be appended to this ADR (or land in a successor ADR if the
cluster grows beyond what one ADR can hold coherently — see
D-OBSERVATION-VS-DECISION-DISCRIMINATION 17th observation
forward-substrate guidance).

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

### Sub-decision 2-amendment: ADR-0034 amendment forward-queued (sub-phase 6b)

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

**ADR-0034 amendment scope (forward-queued)**: amend ADR-0034
Sub-decision 3 §Decision text to discriminate the two patterns at
the canonical-pattern register. Forward-queued to a separate
amendment commit post-sub-phase-6b CI green per RULE 20 (ADR
modifications are Founder-authorized) + per
D-SUBSTRATE-LANDING-PREEMPT principle (substantive substrate-
landing commits absorb forward-reference markers naturally; the
amendment is substrate-coherent at its own register and warrants a
dedicated commit). Sub-phase 6b commit lands the substrate-state
resolution (`start_owner!/stop_owner` setup in grpc/server_test.exs)
without modifying ADR-0034 text.

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
