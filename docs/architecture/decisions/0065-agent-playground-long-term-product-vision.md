# ADR-0065: Agent Playground Long-Term Product Vision — DGI Enterprise Scenario Playground

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SECTION-5-WAVE-3-AGENT-PLAYGROUND-PRODUCT-VISION-ADR-AUTH]`
(2026-05-30).

This ADR canonicalizes the long-term Agent Playground
product vision at the substrate-architectural register.
**It does NOT modify ADR-0060** — ADR-0060 remains the
canonical Wave 2 implementation contract for the first
backend substrate / inspector foundation. ADR-0065 sits
ABOVE ADR-0060 at the product-vision tier, so future
Section 5 implementation waves (Wave 4+) have a single
canonical product-vision reference to ground design
decisions, while Wave 2's intentionally narrow inspector
scope is preserved verbatim at ADR-0060.

This is **design-only**. NO code, NO schema migration, NO
new routes, NO new audit literal in this phase. The wave
map at §7 below forward-queues each future implementation
slice for separate Founder authorization.

## Context

### Why a new ADR (not an amendment to ADR-0060)

ADR-0060 §1 v1 scope lock is intentionally narrow: "a
read-only, sandbox-only, self-scoped operator inspector
surface" with three discrete inspector contracts (policy
evaluator + connector dry-run + working-set inspector).
That scope is correct for Wave 2 — and Wave 2 shipped
exactly that surface at PR #100 (commit `fd35c62`).

The long-term Agent Playground vision is **substantially
broader** than ADR-0060 v1: enterprise simulation +
multi-agent scenario exploration + outcome comparison +
best-path recommender + governed transition from simulation
to Action runtime. Amending ADR-0060 to absorb the broader
vision would stretch ADR-0060 beyond its `v1 design boundary`
title and obscure the substrate-honest framing that Wave 2
is the inspector foundation, not the full product.

The repo convention favors **new ADRs for substantive scope
extensions** over amendments when the extension introduces
a distinct architectural register. Precedents:

- ADR-0046 (AI_AGENT EntityType-Discriminated Capsule
  Routing; Gap 6) is a new ADR under the ADR-0041 Capsule
  Layer Substrate Umbrella rather than an amendment to
  ADR-0041.
- ADR-0062 / ADR-0063 / ADR-0064 are new ADRs for Section 3
  Waves 3/4/5 under the ADR-0059 v1 Design Boundary
  umbrella rather than amendments to ADR-0059.
- ADR-0052 (Otzar DGI doctrine) was itself a product-vision
  ADR landed separately from any prior Otzar implementation
  ADR.

ADR-0060 stays the canonical Wave 2 implementation
contract. ADR-0065 sits above as the canonical long-term
product-vision contract. The two cite each other.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `9c34151`:

- **ADR-0060 LANDED** (Wave 1; design-only; locked v1
  inspector tier).
- **Wave 2 implementation LIVE** (PR #100; commit
  `fd35c62`): 3 sandbox-only inspector routes
  (`/api/v1/playground/policy-evaluator` +
  `/api/v1/playground/connector-dry-run` +
  `/api/v1/playground/working-set`); `PlaygroundService`
  class wired at `apps/api/src/server.ts`; 17 integration
  tests; zero schema migration; zero new audit literals.
- **Section 2 Action runtime LIVE** (PRODUCTION-GRADE
  COMPLETE for internal Foundation autonomous-execution-
  substrate scope): governed-execution surface that Wave 8+
  scenario transitions MUST route through.
- **Section 4 connector substrate LIVE** (PRODUCTION-GRADE
  COMPLETE for Foundation backend scope): `FixtureBasedConnectorProvider`
  + `OutboundWebhookProvider`; Wave 5+ scenarios may
  reference connector capabilities at the simulation
  tier without invoking real providers.
- **Section 3 Hives LIVE** (PRODUCTION-GRADE COMPLETE for
  v1 same-org Foundation backend scope): hive/team
  context substrate the future scenario engine may
  consume at scoped + authorized inputs.
- **Section 9 Admin / Governance backend contracts
  substantively complete** (per Hardening Wave C): admin
  governance surface that scenario-tier admin actions
  will reuse.

The substrate to support the long-term Agent Playground
vision exists at the foundational tier across Sections
1-4 and 7. The missing pieces are the scenario-tier
substrate above the inspector foundation — which is what
this ADR's wave map forward-queues.

### Patent + doctrine alignment

- **ADR-0052** (Otzar DGI doctrine): *"Otzar is the
  governed enterprise intelligence layer on top of
  Foundation — the operating layer for the Autonomous
  Enterprise — a bounded Domain General Intelligence
  system inside governed enterprise domains."* The Agent
  Playground is the DGI substrate where the enterprise's
  AI teammates test scenarios before real execution.
- **US 12,517,919 (COSMP)**: scoped capsule access at
  every tier — scenario inputs MUST respect COSMP
  permission boundaries (caller's scope; no privileged
  cross-entity reads at the scenario tier).
- **US 12,164,537 (DMW)**: enterprise-wallet boundaries —
  scenario engine MAY consume same-org enterprise-wallet
  derived signals; MUST NOT reach cross-org.
- **US 12,399,904 (Foundation primitives)**: governed-
  substrate primitives — scenario transition to execution
  MUST go through the existing Section 2 Action runtime,
  policy evaluation, approvals, scoped permissions, and
  audit.

## Decision

Foundation canonicalizes Agent Playground as the
**enterprise simulation and decision-testing environment
where Otzar's AI teammates can explore possible strategies,
compare outcomes, and recommend the best governed path
before real execution**. Wave 2's inspector tier is the
first substrate; future waves (per §7 wave map) extend
upward to the full DGI enterprise scenario playground.

### 1. Long-term purpose

The Agent Playground product surface is canonical at the
following register:

> *"Agent Playground is the enterprise simulation and
> decision-testing environment where Otzar's AI teammates
> can explore possible strategies, compare outcomes, and
> recommend the best governed path before real execution."*

It is **not** a toy sandbox. It is the enterprise scenario
playground for Domain General Intelligence inside the
organization. It allows organizational AI agents / AI
teammates to:

- Run different scenarios before real implementation.
- Understand what works and what does not.
- Recommend the best governed path forward with evidence
  and reasoning.

Analogy: similar to how DeepMind-style systems can explore
many strategies in a simulated environment before selecting
stronger moves, Otzar's Agent Playground should eventually
let organizational agents explore operational strategies
before executing them in the real enterprise — adapted
for the governed enterprise domain with humans in the
loop at every material decision.

### 2. Inputs the future scenario engine MAY consider (only when scoped and authorized)

The scenario engine is a future substrate. The canonical
input set is enumerated here so future implementation
waves have a single reference for what's IN-SCOPE for the
engine to consume:

- **Org goals** — explicit organizational objectives the
  caller has scoped access to (forward-substrate models;
  potentially derived from `OrgSettings` or new `OrgGoal`
  model at Wave 4+).
- **Role-scoped context** — caller's role-template +
  job-title safe view (existing `EntityProfile.safe_view`
  shape per ADR-0057 §10).
- **Approved working sets** — output of the existing
  Wave 2 working-set inspector or future scoped
  working-set surfaces (NEVER raw capsule content).
- **Policy constraints** — ActionPolicy rows scoped to
  the caller's org (existing Section 2 substrate).
- **`governance_terms`** — Hive-level policy terms (Wave 4
  evaluator output; canonical per ADR-0063).
- **`ActionPolicy` constraints** — autonomy ceilings +
  risk-tier gates + approval requirements (existing
  Section 2 substrate per ADR-0057).
- **Connector capabilities** — declared connector types +
  binding metadata (NEVER secret values or live
  invocations).
- **Hive / team context** — same-org Hive substrate per
  ADR-0059 (NEVER cross-org).
- **Audit-derived operational signals** — closed-vocab
  audit-event counts + recency aggregates per ADR-0061
  SAFE projection pattern (NEVER raw audit row content
  or cross-org signals).
- **Enterprise analytics aggregates** — Wave 2+ analytics
  outputs per ADR-0061 (closed-vocab; k-min-population;
  same-org).
- **Prior corrections / drift signals** — only the
  self-scoped corrections inventory per ADR-0058 (NEVER
  manager visibility; NEVER psychological scoring).
- **Approved user / org memory capsules** — only capsules
  the caller already has COSMP read permission for
  (NEVER privileged cross-entity reads).
- **Dependencies, blockers, cost, timing, risk, expected
  impact** — derived signals the engine MAY estimate from
  the inputs above (NEVER fabricated; always cite the
  source signal).

The scenario engine MAY consume any subset of these
inputs at the future-wave authorization tier. Every input
is scope-bounded by existing Foundation primitives (RULE
0 same-entity / ADR-0059 same-org / ADR-0036 LawfulBasis
for regulator access). The engine MUST NOT invent new
input categories beyond this list without separate
Founder authorization.

### 3. Outputs the future scenario engine MAY produce

The canonical output set:

- **Scenario candidates** — N alternative plans the engine
  generated for the caller's request.
- **Recommended best path** — one of the N candidates
  flagged as the engine's recommendation, with explicit
  reasoning.
- **Reasons and evidence** — closed-vocab labels +
  citations to the input signals that drove the
  recommendation (NEVER raw chain-of-thought).
- **Tradeoffs** — closed-vocab labels enumerating what
  each candidate optimizes for vs sacrifices.
- **Risk flags** — closed-vocab risk categories per
  candidate (policy-violation-risk, dependency-risk,
  timing-risk, etc.).
- **Policy / governance findings** — explicit citations
  to ActionPolicy + governance_terms + ADR-0036
  LawfulBasis that constrain each candidate.
- **Dependency map** — closed-vocab dependency
  relationships between candidate steps (NEVER raw
  cross-entity references).
- **Expected outcomes** — closed-vocab outcome categories
  per candidate (NEVER probabilistic claims without
  evidence; NEVER fabricated numbers).
- **Required approvals** — explicit list of dual-control
  + break-glass + admin approvals each candidate would
  require at execution time.
- **Proposed Action plan** — an unexecuted draft Action
  payload per candidate, ready to be submitted to the
  Section 2 Action runtime ONLY after governed approval
  per §4 below.

The scenario engine MUST NOT produce: organizational
scoring of people; employee productivity rankings;
psychological inferences; fabricated outcome probabilities;
raw capsule content; raw chain-of-thought; raw prompts;
cross-org data; secrets.

### 4. Human-in-the-loop doctrine

- The Playground **never silently executes** real-world
  work.
- The Playground **may propose** plans (per §3 outputs).
- The transition from simulation to execution **MUST go
  through Section 2 Action runtime** + policy evaluation
  + approvals + scoped permissions + audit. No bypass
  path exists or will exist.
- Humans / admins remain in the loop for material
  decisions. The engine's "recommended best path" is a
  recommendation; the human approves or rejects.
- For autonomous-execution-tier actions (those the
  caller already has authority to execute without admin
  approval per existing Section 2 Action runtime), the
  Playground recommendation MAY shortcut directly to
  Action runtime submission AFTER explicit caller
  confirmation — NEVER automatically from the engine.

### 5. Safety / no-leak doctrine

Every Agent Playground tier (Wave 2 inspector foundation +
future scenario waves) enforces:

- **No employee surveillance.**
- **No organizational scoring of people.**
- **No hidden manager spy surface.**
- **No psychological scoring.**
- **No raw transcript exposure.**
- **No chain-of-thought exposure.**
- **No raw prompts.**
- **No raw memory / capsule content** unless explicitly
  scoped per COSMP + safely projected.
- **No embeddings / vectors / storage locations / content
  hashes / bridge IDs / secret refs.**
- **No cross-org data.**
- **No production provider calls from simulation.**
- **No live external side effects.**
- **No unapproved Action creation.**
- **No autonomous execution from Playground.**

These constraints are universal across all Agent Playground
waves. Any future Wave 4+ implementation slice that needs
to relax any of these constraints requires explicit
Founder authorization at that slice and explicit ADR
amendment here.

### 6. Relation to Wave 2 (the first substrate)

ADR-0060 v1 Wave 2 implementation (PR #100) ships the
**first backend substrate / inspector foundation** for
Agent Playground. The three Wave 2 inspectors are
primitives future scenario simulation waves WILL compose:

- **Policy evaluator** (`POST /api/v1/playground/policy-evaluator`)
  → future scenario engine consumes this to evaluate
  per-candidate policy findings for §3 outputs.
- **Connector dry-run fixture path**
  (`POST /api/v1/playground/connector-dry-run`) → future
  scenario engine consumes this to simulate per-candidate
  connector behavior WITHOUT real provider calls.
- **Working-set inspector**
  (`POST /api/v1/playground/working-set`) → future scenario
  engine consumes this to assemble per-candidate context
  inputs.

Wave 2 is **not the full Agent Playground**. The Wave 2
service surface (`PlaygroundService` + 3 routes) is the
correct substrate at its tier; the full product surface
extends through Waves 4-9+ per §7 wave map.

This ADR explicitly preserves ADR-0060's intentionally
narrow v1 scope — Wave 2 is correctly bounded at its
ADR-0060 contract; ADR-0065 sits ABOVE it at the product-
vision tier.

### 7. Forward wave map (canonical)

Each wave is forward-substrate behind separate Founder
authorization at its slice. The map is canonical at this
ADR; Wave 4+ implementation MUST reference this map
verbatim:

- **Wave 3** (THIS ADR): product-vision ADR / ADR-0060
  broadening. Design-only; no code; this commit.
- **Wave 4**: persistent named scenarios model + safe
  CRUD (if schema-approved). Add `PlaygroundScenario`
  Prisma model (self-scoped; named scenario + scenario
  inputs + scenario-state snapshot at create-time) +
  CRUD routes (`POST /api/v1/playground/scenarios` +
  `GET /api/v1/playground/scenarios` +
  `GET /api/v1/playground/scenarios/:id` +
  `DELETE /api/v1/playground/scenarios/:id` soft-delete).
  RULE 13 + ADR-0025 schema-push-target discipline; SAFE
  projection at every read; same-org / self-scope at
  every gate.
- **Wave 5**: scenario candidate generation contract.
  Likely fixture / deterministic first (operator
  enumerates candidates manually OR engine generates
  from a closed-vocab template library); NO LLM
  autonomy unless separately Founder-authorized.
  Contract: scenario input → N scenario candidates
  (per §3 outputs).
- **Wave 6**: outcome comparison + scoring rubric.
  Closed-vocabulary tradeoff/risk/dependency rubric;
  NO employee scoring; NO probabilistic-claim
  fabrication. Contract: N candidates → comparison
  matrix.
- **Wave 7**: best-path recommender with evidence and
  governance findings. Contract: comparison matrix →
  recommended candidate + reasons + evidence + policy
  findings (per §3 outputs).
- **Wave 8**: governed transition from selected scenario
  to proposed Action plan. Contract: recommended
  candidate + caller confirmation → unexecuted Action
  payload submitted to Section 2 Action runtime per §4
  human-in-the-loop doctrine.
- **Wave 9**: multi-agent simulation orchestration.
  Multiple scoped AI teammates concurrently exploring
  candidate-space; requires multi-agent coordination
  substrate (probably consumes ADR-0028 BEAM coordination
  layer); NEVER autonomous execution; humans approve
  before any candidate transitions to Wave 8.
- **Wave 10**: Control Tower frontend consumer. Lives in
  `otzar-control-tower` repo; Foundation owns the safe
  backend contracts (Waves 4-9); frontend consumes them.
  **Wave 10 consumer-experience contract LANDED at ADR-0077
  2026-05-31** (design-only; closes this Wave 10 forward-
  queue line at the consumer-experience contract register;
  Wave 10 implementation slice — frontend code in
  `otzar-control-tower` — requires separate Founder
  authorization at slice). Wave 9 multi-agent simulation
  contract LANDED at ADR-0076 2026-05-31; Wave 9 Option A
  implementation LIVE at PR #147 `340d37f` 2026-05-31
  (NEW `PlaygroundSimulationService` + NEW route
  `POST /api/v1/playground/scenarios/:id/simulations` +
  47 integration tests). Wave 8 governed-transition contract
  LANDED at ADR-0075 2026-05-31; Wave 8 Option A
  implementation LIVE at PR #145 `8a69863` 2026-05-31
  (43 tests; first Section 5 wave that creates Section 2
  Action rows via `createActionForCaller` per ADR-0057 in
  PROPOSED status; Section 2 retains all execution
  authority). Wave 7 best-path-recommendation contract
  LANDED at ADR-0074 2026-05-31; Wave 7 Option A
  implementation LIVE at PR #142 `80a60f1` 2026-05-31
  (39 tests). Wave 6 outcome-comparison contract LANDED at
  ADR-0073 2026-05-31; Wave 6 Option A implementation LIVE
  at PR #139 `02410ee` 2026-05-31 (39 tests). Wave 5
  candidate-generation contract LANDED at ADR-0072
  2026-05-31; Wave 5 Option A implementation LIVE at PR #136
  `e708fa7` 2026-05-31 (33 tests). 256 Section 5 integration
  tests passing at HEAD `f02296c`.

The wave order is recommended but not strictly serial —
Waves 4 + 5 may interleave; Waves 6 + 7 may consolidate;
Wave 9 may land in parallel with Waves 5-8 if multi-agent
substrate is required earlier than the recommended
order. Each wave's authorization slice may re-order based
on Founder direction.

### 8. Implementation posture (this ADR)

- **ADR / design only** in this wave.
- **No schema migration.**
- **No implementation code.**
- **No route changes.**
- **No Action runtime changes.**
- **No connectors / OAuth / provider calls.**
- **No Control Tower frontend.**
- **No analytics implementation.**
- **No live multi-agent runtime yet.**
- **No new audit literal.**

### 9. Naming + scope clarity (canonical)

To prevent drift between substrate tiers, the Foundation
backend Section 5 doc + future implementation surfaces
MUST distinguish:

- **Agent Playground inspector foundation** — Wave 2 LIVE
  per ADR-0060 + PR #100. The 3 sandbox-only inspector
  routes.
- **Agent Playground scenario simulation substrate** —
  Waves 4-9 forward-substrate per §7 wave map. The DGI
  enterprise scenario playground.
- **Otzar Control Tower UI** — Wave 10 forward-substrate;
  lives in `otzar-control-tower` repo; out of Foundation
  scope.
- **Actual execution** — Section 2 Action runtime (NOT
  Playground). Playground proposes; Action runtime
  executes after governed approval.

Future Agent Playground implementation MUST use these
canonical terms verbatim in routes, services, docs, audit
discriminators, and product surfaces. Mixing the tiers
(e.g., "the Playground executes an Action") is a
substrate-honest drift requiring inline RULE 13
correction.

### 10. Audit posture

This ADR adds no new audit literals. Future Wave 4+
implementation slices that need audit emission (e.g.,
scenario create / scenario read / scenario recommendation
delivered) will use the canonical `ADMIN_ACTION +
details.action` discriminator pattern (Section 4 + 7 +
11 + ADR-0062 precedent) at their authorization slice.
No new audit literal anticipated for Waves 4-10.

ADR-0060 §2 intentional non-goal of audit emission on
playground reads stays in force for Wave 2 read paths
(policy evaluator + connector dry-run + working-set
inspector). Wave 4+ persistent named scenarios will emit
audit on the persistence boundary (the persistence is
the side-effect; the audit emission is correct at that
boundary).

### 11. Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline, the
Agent Playground long-term product vision contributes
patent-evidence-bearing material at three patents:

- **US 12,517,919 (COSMP)**: scenario engine consumes
  scoped capsule access at every input tier — the
  governed-substrate boundary distinguishes NIOV's
  Agent Playground from any unauthorized parallel build
  at the "uncontrolled enterprise AI simulation" claim
  register. Cryptographically-timestamped ADR-0060 + PR
  #100 + ADR-0065 lineage on `main`.
- **US 12,164,537 (DMW)**: scenario engine consumes
  enterprise-wallet-derived signals same-org-scoped per
  ADR-0059; enterprise-wallet portability claim is
  evident at the wallet-scoped input tier.
- **US 12,399,904 (Foundation primitives)**: scenario →
  Action runtime governed transition per §4 + §7 Wave 8
  is direct evidence for the governed-substrate
  primitive claim — every Playground recommendation
  routes through the existing Section 2 governed
  execution surface.

### 12. RULE 0 + no-leak discipline universal

RULE 0 + no-leak discipline applies at every Agent
Playground tier:

- **Caller scope only**: scenario engine reads only
  inputs the caller has COSMP permission for; no
  privileged cross-entity reads at the scenario tier.
- **Same-org boundary**: cross-org scenario inputs are
  forbidden per ADR-0059 §1 (Hives), ADR-0037
  (jurisdiction), ADR-0061 (analytics).
- **AI cannot author legal authority** (per ADR-0063
  Sub-decision 3 non-goal extended to Agent Playground):
  scenario engine's "recommended best path" is an
  engineering recommendation, NOT legal advice; humans
  approve material decisions.
- **No surveillance framing**: scenarios about
  organizational decisions are policy-on-rows, NOT
  policy-on-people (ADR-0052 doctrine extended; ADR-0058
  drift-detection no-surveillance discipline
  inherited).

## Consequences

### Easier after this ADR

- Future Wave 4+ implementation slices have a single
  canonical product-vision reference — the wave map at
  §7 is the authoritative forward queue.
- The §4 human-in-the-loop doctrine + §5 safety / no-leak
  doctrine + §12 RULE 0 universal are documented +
  defensible at future Founder authorization slices;
  future scope creep proposals can be tested against
  these canonical guardrails.
- ADR-0060 stays correctly bounded at its v1 inspector
  scope; future implementation does not need to stretch
  ADR-0060 beyond its `v1 design boundary` title.
- Operators / contributors reading Section 5 docs see the
  long-term product vision verbatim instead of trying to
  reconstruct it from PR descriptions + Founder
  directives.

### Harder after this ADR

- The §7 wave map is opinionated. Future Founder
  re-prioritization may need to amend this ADR
  inline (per repo amendment convention for ADRs).
- The §2 input set + §3 output set are canonical at this
  ADR. Future implementation slices that need a new
  input or output category require explicit Founder
  authorization + ADR amendment here.
- The §5 safety / no-leak doctrine forbids many
  capabilities operators might intuitively expect
  (organizational scoring, AI-suggested probabilistic
  outcomes, autonomous execution). The forbidden list
  is explicit so future scope creep proposals are
  caught early.

### Substrate-state catches resolved

- The Section 5 doc previously canonicalized only the v1
  inspector tier per ADR-0060 (Wave 2 docs cascade
  added long-term vision framing inline; this ADR
  promotes that framing to the architectural register).
- The Founder clarification mid-Wave-2-cascade
  ("Wave 2 is the safe first backend substrate /
  inspector foundation; NOT the full Agent Playground")
  is now canonical at the ADR tier instead of only the
  tier-3 + tier-4 docs.

## Forward queue

Each forward-substrate slice requires separate Founder
authorization at its slice prompt:

- Wave 4: persistent named scenarios model + CRUD.
- Wave 5: scenario candidate generation contract — design-
  only contract LANDED 2026-05-31 at ADR-0072 (Section 5
  Wave 5 Candidate-Generation Contract; design-only;
  bidirectional back-citation; deterministic / template-
  first TypeScript v1; Python (ADR-0069 §2.4 boundary ADR
  required) and BEAM (Wave 9 / ADR-0069 §3 domain 6)
  forward-substrate). Wave 5 Option A deterministic /
  template-first TypeScript implementation LANDED
  2026-05-31 (PR #136; `e708fa7`).
- Wave 6: outcome comparison + scoring rubric — design-only
  contract LANDED 2026-05-31 at ADR-0073 (Section 5 Wave 6
  Outcome-Comparison Contract; design-only; bidirectional
  back-citation; deterministic TypeScript v1 rubric-first;
  Python (ADR-0069 §2.4 boundary ADR required) and BEAM
  (Wave 9 / ADR-0069 §3 domain 6) forward-substrate; NO
  numeric scoring, NO winner selection at this Wave). Wave
  6 Option A deterministic / template-first TypeScript
  implementation LANDED 2026-05-31 (PR #139; `02410ee`).
- Wave 7: best-path recommender with evidence + findings —
  design-only contract LANDED 2026-05-31 at ADR-0074
  (Section 5 Wave 7 Best-Path Recommendation Contract;
  design-only; bidirectional back-citation; deterministic
  TypeScript v1 priority-ladder; Python (ADR-0069 §2.4
  boundary ADR required) and BEAM (Wave 9 / ADR-0069 §3
  domain 6) forward-substrate; NO numeric scoring, NO
  winner-declaration framing, NO autonomous decision
  authority, NO Action creation, NO execution at this
  Wave; recommendation is ADVISORY ONLY and requires
  human/governance review before any real-world action).
  Wave 7 implementation slice is separate Founder
  authorization at its slice.
- Wave 8: governed transition to Action runtime —
  design-only contract LANDED 2026-05-31 at ADR-0075
  (Section 5 Wave 8 Governed-Transition Contract;
  design-only; bidirectional back-citation; deterministic
  TypeScript v1; Wave 8 creates Section 2 Action rows via
  existing `createActionForCaller` in PROPOSED status;
  Section 2 retains all execution authority per ADR-0057;
  v1 ActionType mapping conservative — ONLY
  SEND_INTERNAL_NOTIFICATION; mandatory
  `caller_confirmation: true` request body; mandatory
  `idempotency_key`; NEVER caller-supplied
  recommendation/comparison/candidate payloads). Wave 8
  implementation slice is separate Founder authorization
  at its slice.
- Wave 9: multi-agent simulation orchestration —
  design-only contract LANDED 2026-05-31 at ADR-0076
  (Section 5 Wave 9 Multi-Agent Simulation Orchestration
  Contract; design-only; bidirectional back-citation;
  ADR-0069 §6 8-question check LOCKED v1 at TypeScript
  §2.1 sequential branch enumeration; bounded 24-branch
  ceiling; 3 closed-vocab orchestration_modes + 5
  branch_definitions + 6 agent_roles; NO agent-to-agent
  message-passing; NO LLM-generated agent personas; NO
  raw chain-of-thought between branches; BEAM Option C
  forward-substrate per ADR-0028 — applies WHEN simulation
  needs LIVE concurrent message-passing agents OR scales
  beyond 24 sequential branches per call).
- Wave 10: Control Tower frontend consumer.

The §1 long-term purpose statement + §5 safety doctrine
+ §12 RULE 0 universal apply at every wave.

## Bidirectional citations

- Cites ADR-0001 (three-wallet architecture; RULE 0
  source).
- Cites ADR-0025 (Schema-Push-Target Discipline; future
  Wave 4 schema-migration slice).
- Cites ADR-0028 (BEAM coordination layer; future Wave 9
  multi-agent orchestration substrate).
- Cited from ADR-0069 §3 domain 6 + §Forward queue
  (Elixir/BEAM Substrate-Coherence Law for Living
  Coordination; doctrine ADR landed 2026-05-31). ADR-0069
  canonicalizes Wave 9 multi-agent simulation orchestration
  as a BEAM strong-fit domain and requires the §6
  8-question architecture check before any Wave 9
  authorization slice. ADR-0069 does NOT authorize Wave 9
  implementation; that remains a separate Founder slice.
- Cites ADR-0036 (LawfulBasis; regulator-tier scenarios
  if ever in scope).
- Cites ADR-0037 (jurisdiction tagging; cross-jurisdiction
  scenarios forbidden at same-org boundary).
- Cites ADR-0048 (COE personalization-orchestration
  substrate; future scenario engine consumes COE for
  per-candidate context).
- Cites ADR-0049 (GOVSEC umbrella; security controls at
  every Agent Playground tier).
- Cites ADR-0050 (break-glass; future Wave 8 transitions
  may need break-glass paths for emergency-action
  scenarios).
- Cites ADR-0052 (Otzar DGI doctrine — the parent
  product doctrine; Agent Playground IS the DGI
  substrate inside the enterprise domain).
- Cites ADR-0057 §10 (Action runtime + policy evaluator
  pure-function seam; Wave 2 inspector foundation).
- Cites ADR-0058 §7 (drift-signal SAFE projection
  pattern; future scenario inputs that consume drift
  signals).
- Cites ADR-0059 (Section 3 Hives v1 — hive/team context
  inputs).
- Cites ADR-0060 (Section 5 Wave 1 inspector foundation;
  this ADR sits ABOVE it at product-vision tier; ADR-0060
  remains canonical Wave 2 implementation contract).
- Cites ADR-0061 (Section 6 analytics SAFE projection;
  future scenario inputs that consume analytics
  aggregates).
- Cites ADR-0063 (governance_terms evaluator; future
  scenario inputs consume governance_terms findings).
- Cites RULE 0, RULE 4, RULE 13, RULE 14, RULE 19,
  RULE 20.
- Cited from ADR-0072 §Bidirectional citations
  (Section 5 Wave 5 Candidate-Generation Contract;
  design-only; ADR-0072 closes ADR-0065 §7 Wave 5
  forward-queue line at the contract register; this ADR
  remains canonical at the long-term product-vision
  tier; bidirectional back-citation per RULE 14 + RULE
  20).
- Cited from ADR-0073 §Bidirectional citations
  (Section 5 Wave 6 Outcome-Comparison Contract;
  design-only; ADR-0073 closes ADR-0065 §7 Wave 6
  forward-queue line at the contract register; this ADR
  remains canonical at the long-term product-vision
  tier; bidirectional back-citation per RULE 14 + RULE
  20).
- Cited from ADR-0074 §Bidirectional citations
  (Section 5 Wave 7 Best-Path Recommendation Contract;
  design-only; ADR-0074 closes ADR-0065 §7 Wave 7
  forward-queue line at the contract register; this ADR
  remains canonical at the long-term product-vision
  tier; bidirectional back-citation per RULE 14 + RULE
  20).
- Cited from ADR-0075 §Bidirectional citations
  (Section 5 Wave 8 Governed-Transition Contract;
  design-only; ADR-0075 closes ADR-0065 §7 Wave 8
  forward-queue line at the contract register; this ADR
  remains canonical at the long-term product-vision
  tier; bidirectional back-citation per RULE 14 + RULE
  20).
- Cited from ADR-0076 §Bidirectional citations
  (Section 5 Wave 9 Multi-Agent Simulation Orchestration
  Contract; design-only; ADR-0076 closes ADR-0065 §7
  Wave 9 forward-queue line at the contract register;
  this ADR remains canonical at the long-term product-
  vision tier; bidirectional back-citation per RULE 14 +
  RULE 20).
- Cited from ADR-0077 §Bidirectional citations
  (Section 5 Wave 10 Agent Playground Control Tower
  Consumer Contract; design-only; ADR-0077 closes
  ADR-0065 §7 Wave 10 forward-queue line at the
  consumer-experience contract register; this ADR
  remains canonical at the long-term product-vision
  tier; bidirectional back-citation per RULE 14 +
  RULE 20).
- Bidirectional back-citation lands in ADR-0060
  §"Forward queue" entry per RULE 14 + ADR-0020 §3 +
  RULE 20.

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citation
in ADR-0060 §Forward queue + architecture/README.md
catalog entry + tier-3 / tier-2 / tier-1 doc updates
land under explicit Founder authorization at
`[FOUNDER-SECTION-5-WAVE-3-AGENT-PLAYGROUND-PRODUCT-VISION-ADR-AUTH]`
2026-05-30. The authorization is **ADR-only** — Wave 4+
implementation slices each require separate Founder
authorization at their slice.
