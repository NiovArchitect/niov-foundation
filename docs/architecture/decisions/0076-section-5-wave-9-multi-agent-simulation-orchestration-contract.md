# ADR-0076: Agent Playground Multi-Agent Simulation Orchestration Contract — Section 5 Wave 9 (Design-Only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-SECTION-5-WAVE-9-MULTI-AGENT-SIMULATION-ORCHESTRATION-CONTRACT-ADR-AUTH]`
2026-05-31 (under the Founder Section 5 autonomy directive
2026-05-31 + Founder behavioral directive 2026-05-31).

**Amendment 1** landed 2026-05-31 at
`[FOUNDER-SECTION-5-WAVE-9-VOCABULARY-AMENDMENT-AUTH]`:
§4 + §5 amended in-place to canonicalize a richer vNext
branch + agent-role vocabulary while preserving the LIVE
v1 runtime vocabulary verbatim. Amendment 1 is **docs-only**
— NO runtime code change, NO conflict with Wave 9 Option A
implementation at PR #147 `340d37f`, NO conflict with Wave 10
Control Tower implementation at `otzar-control-tower` PR #6
`cf3483f`. Both v1 runtime + Wave 10 CT cockpit remain LIVE
and valid on the v1 vocabulary. The vNext vocabulary becomes
forward-substrate; a future Founder-authorized implementation
amendment migrates service constants, tests, and Control
Tower labels.

This ADR is **design-only**. NO code, NO schema migration,
NO new routes, NO new audit literal, NO LLM autonomy, NO
model calls, NO Python services, NO BEAM orchestration
implementation, NO Phoenix.PubSub, NO Broadway, NO multi-
agent runtime, NO Action execution, NO connector invocation,
NO external provider calls, NO Control Tower frontend, NO
personal-life automation, NO trust-level delegation logic,
NO CLAUDE.md bulk catalog edit, NO current active slice
derailment in this commit.

Sits ABOVE ADR-0075 (Wave 8 governed-transition contract)
and BELOW ADR-0065 (long-term product vision) at the
**contract register**. Wave 9 is the simulation-orchestration
layer above the Wave 5-8 deterministic pipeline; ADR-0076
locks the contract so a future Wave 9 implementation slice
(deterministic TypeScript first if substrate allows; BEAM-
orchestrated later if ADR-0069 §6 8-question check proves
BEAM is required) can be authorized against a stable
contract.

## Context

### Why Wave 9 needs its own design ADR

ADR-0065 §7 forward-queues Wave 9 in two sentences:
*"multi-agent simulation orchestration. Multiple scoped AI
teammates concurrently exploring candidate-space; requires
multi-agent coordination substrate (probably consumes ADR-0028
BEAM coordination layer); NEVER autonomous execution; humans
approve before any candidate transitions to Wave 8."* That
framing is correct at the product-vision register but does
not lock:
- the simulation request body shape,
- the simulation_response top-level shape,
- the closed-vocab orchestration_mode set,
- the agent_role + branch_definition closed vocabularies,
- the convergence-summary contract,
- the no-leak boundary at the multi-agent surface,
- the relationship to Wave 5/6/7 pipeline (does Wave 9
  internally invoke Wave 7, or run parallel?),
- the audit posture,
- the persistence boundary,
- the BEAM vs TypeScript implementation register.

ADR-0076 locks the contract. The §15 three-method comparison
+ §19 ADR-0069 §6 8-question architecture check together
determine whether v1 implementation is deterministic
TypeScript (Option A; sequential branch enumeration) or
BEAM-orchestrated (Option C; concurrent supervised agent
processes).

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `8a69863`:

- **Section 5 Waves 1+2+3+4+5+6+7+8 LIVE**. Wave 8 Option A
  LIVE (PR #145; `8a69863`): NEW
  `PlaygroundGovernedTransitionService` + NEW route + 43
  integration tests. Wave 8 is the FIRST Section 5 wave that
  creates Section 2 Action rows via `createActionForCaller`
  in PROPOSED status (Section 2 retains all execution
  authority).
- **209 Section 5 integration tests passing** (Wave 8 43 +
  Wave 7 39 + Wave 6 39 + Wave 5 33 + Wave 4 38 + Wave 2 17).
- **ADR-0028** (BEAM coordination layer commitment-to-ship)
  LIVE; ADR-0069 (BEAM substrate-coherence law) LIVE;
  ADR-0028 §3 Forward queue includes "Agent Playground multi-
  agent simulation orchestration" as one of the named BEAM-
  fit candidates per ADR-0065 §7 Wave 9.
- **ADR-0069 §3 domain 6** explicitly names "Agent Playground
  multi-agent simulation orchestration" as a BEAM strong-fit
  domain.
- **NO Python service substrate yet** — ADR-0069 §2.4
  requires a dedicated boundary ADR before the first Python
  service slice.

### Patent + doctrine alignment

- **US 12,517,919 (COSMP)** — multi-agent simulation
  consumes Wave 7 recommendation output (or re-runs Waves
  5/6/7 with varied input axes) scope-bounded by caller's
  COSMP permission.
- **US 12,164,537 (DMW)** — enterprise-wallet boundaries
  inherited verbatim.
- **US 12,399,904 (Foundation primitives)** — simulation
  outputs are advisory; any transition from simulation
  candidate to real work MUST route through Wave 8 + Section
  2. Wave 9 NEVER bypasses Wave 8 or Section 2.
- **ADR-0069 §3 domain 6** — Agent Playground multi-agent
  simulation orchestration is a BEAM strong-fit candidate.
  ADR-0076 §19 §6 8-question check determines v1
  implementation register.

## Decision

Foundation canonicalizes the **multi-agent simulation
orchestration contract** for Agent Playground Wave 9. A
simulation produces structured exploration of multiple
branches / agent roles / constraint variations over the
Wave 5-7 pipeline output, surfaces convergence + divergence
findings, and recommends a NEXT REVIEW item (or a Wave 7
recommendation rerun with different inputs) — WITHOUT
executing, creating Actions, invoking connectors,
exchanging raw chain-of-thought between agents, producing
hidden scoring, or bypassing Wave 8 governed transition.

### 1. Top-level `SimulationResponse` shape

```text
SimulationResponse:
  ok: true
  scenario_id: string
  simulated_at: string (ISO 8601)
  orchestration_mode: OrchestrationMode (closed-vocab; §3)
  branch_count: number (bounded per §11)
  branches: SimulationBranch[]
  convergence_summary: ConvergenceSummary
  disagreement_summary: DisagreementSummary
  unresolved_questions: UnresolvedQuestion[] (closed-vocab labels; §6)
  recommended_next_review: RecommendedNextReview (closed-vocab; §7)
  human_decision_required: boolean
  honest_note: string
  simulation_audit_event_id: string
```

Each `SimulationBranch` (≤ §11 cap):

```text
SimulationBranch:
  branch_id: string (deterministic SHA-256 16-char per §10)
  branch_definition: BranchDefinition (closed-vocab; §4)
  agent_role: AgentRole (closed-vocab; §5)
  assumed_constraints: string[] (closed-vocab labels; §6)
  expected_outcomes: string[] (closed-vocab labels; §6)
  governance_conflicts: string[] (closed-vocab labels; §6)
  branch_summary: string (≤600 chars; closed-style)
  branch_recommended_candidate_key: string (echoed from Wave 7
                                               sub-invocation)
  branch_recommended_candidate_type: PlaygroundCandidateType (echoed)
  confidence_label: PlaygroundConfidenceLabel (echoed)
```

`ConvergenceSummary`:

```text
candidate_keys_agreed_upon: string[]  // closed-vocab sets
governance_findings_all_branches_share: PlaygroundGovernanceFinding[]
required_reviews_all_branches_share: PlaygroundRequiredReview[]
```

`DisagreementSummary`:

```text
candidate_types_diverged: PlaygroundCandidateType[]
recommendation_modes_diverged: PlaygroundRecommendationMode[]
unresolved_branches: string[]  // branch_ids
```

`RecommendedNextReview` (closed-vocab; §7):

```text
{
  next_review_label: NextReviewLabel (closed-vocab from §7)
  rationale_summary: string (≤300 chars; closed-style)
  applies_to_branch_ids: string[]
}
```

NEVER populated:
- raw chain-of-thought between agents
- raw prompts / model outputs / hidden reasoning
- numeric scores / probabilities / weights
- raw scenario JSON / capsule content / transcripts
- agent-internal state beyond closed-vocab labels
- private memory / unscoped data

### 2. Request body shape (canonical at this ADR)

```text
POST /api/v1/playground/scenarios/:id/simulations

Body:
  caller_confirmation: true (REQUIRED; literal boolean true)
  orchestration_mode?: OrchestrationMode (closed-vocab; §3;
                                            default DETERMINISTIC_BRANCH_ENUMERATION)
  branch_definitions?: BranchDefinition[] (closed-vocab; §4;
                                              if omitted, default
                                              set per §4)
  agent_roles?: AgentRole[] (closed-vocab; §5; if omitted,
                                default set per §5)
  candidate_types?: PlaygroundCandidateType[] (optional; passes
                                                 through to Wave 7
                                                 sub-invocations)
  max_branches?: number (optional; capped per §11)
  comparison_mode?: PlaygroundComparisonMode (passes through)
  recommendation_mode?: PlaygroundRecommendationMode (passes
                                                       through)
```

Forbidden body fields (NEVER accepted at v1):

- caller-supplied agent prompts / instructions / chain-of-
  thought / model outputs.
- caller-supplied branch payloads.
- caller-supplied scoring weights.
- `execute` / `auto_approve` / `bypass_wave_8` / `create_action`
  flags.
- `action_id` (Wave 9 NEVER creates Actions; that's Wave 8).

### 3. `orchestration_mode` — closed vocabulary (v1)

Three values. Adding new modes requires future Founder-
authorized ADR amendment.

- `DETERMINISTIC_BRANCH_ENUMERATION` — DEFAULT at v1. Each
  branch_definition × agent_role combination produces ONE
  Wave 7 sub-invocation; the simulation is the parallel
  union of all sub-invocations. Deterministic; reproducible;
  no LLM autonomy; no agent-to-agent message-passing; no
  hidden reasoning.
- `DETERMINISTIC_CONSTRAINT_VARIATION` — opt-in. Each branch
  varies the `comparison_mode` / `recommendation_mode` /
  `candidate_types` inputs across the Wave 7 sub-invocations
  to surface how the recommendation changes under different
  modes. Deterministic; reproducible.
- `DETERMINISTIC_GOVERNANCE_SCOPE_VARIATION` — opt-in. Each
  branch varies the simulated governance posture (e.g.,
  branches with vs without explicit `LEGAL_REVIEW_RECOMMENDED`
  governance findings) to surface how the recommendation
  changes. Deterministic; reproducible. NO injection of raw
  scenario data; only closed-vocab signal variations.

### 4. `branch_definition` — closed vocabulary

§4 was amended in-place 2026-05-31 (Amendment 1) to
canonicalize a richer vNext vocabulary alongside the LIVE v1
runtime vocabulary. Both sets are closed-vocab and additive
within §4; future implementation amendment may migrate the
runtime constants from v1 → vNext under a separate
Founder-authorized slice.

#### 4.1 v1 runtime vocabulary (LIVE)

Five values. LIVE at
`apps/api/src/services/playground/playground-simulation.service.ts`
`PLAYGROUND_BRANCH_DEFINITION_VALUES` per Wave 9 Option A
implementation PR #147 `340d37f`. Wave 10 Control Tower
cockpit at `otzar-control-tower` PR #6 `cf3483f` consumes
this set verbatim. v1 default = 4 (excludes `BASELINE` so the
§11 24-branch ceiling holds when paired with the v1 §5
6-role default).

- `BASELINE` — runs Wave 7 with default
  recommendation_mode + comparison_mode + candidate_types.
- `POLICY_FIRST_BRANCH` — runs Wave 7 with
  recommendation_mode = `DETERMINISTIC_POLICY_FIRST` (=
  default; explicit so the branch is reproducible).
- `GOVERNANCE_FIRST_BRANCH` — runs Wave 7 with
  recommendation_mode = `DETERMINISTIC_GOVERNANCE_FIRST`.
- `RESILIENCE_FIRST_BRANCH` — runs Wave 7 with
  recommendation_mode = `DETERMINISTIC_RESILIENCE_FIRST`.
- `HUMAN_REVIEW_FIRST_BRANCH` — runs Wave 7 with
  recommendation_mode = `DETERMINISTIC_HUMAN_REVIEW_FIRST`.

#### 4.2 canonical vNext vocabulary (forward-substrate)

Six values. **Not yet LIVE in any code surface.** Becomes
canonical at the future Founder-authorized implementation
amendment that migrates the v1 runtime constants. vNext
branches map to deterministic Wave 7 sub-invocations using
the same `recommendation_mode` + `comparison_mode` +
`candidate_types` axes as v1; the migration ADR specifies the
exact mapping. vNext default = 4 of 6 (chosen at the
implementation slice to preserve the §11 24-branch ceiling
when paired with the vNext §5.2 10-role set; the
implementation slice picks the 4-of-6 + 6-of-10 = 24
default).

- `RECOMMENDED_PATH` — the primary recommended branch posture
  (analogous to v1 `BASELINE` + `POLICY_FIRST_BRANCH`
  collapsed; the future migration ADR specifies the precise
  Wave 7 input mapping).
- `LOW_RISK_PATH` — the low-risk incremental posture; favors
  reversibility + smallest blast radius.
- `COMPLIANCE_FIRST_PATH` — the compliance + governance
  posture; surfaces compliance / legal review needs first.
- `RESILIENCE_FIRST_PATH` — the operational-resilience +
  reversibility posture.
- `HUMAN_REVIEW_PATH` — the human-decision-first posture;
  surfaces what a human reviewer needs to decide.
- `DO_NOT_PROCEED_PATH` — the safety-first posture; surfaces
  the case for not proceeding at all.

#### 4.3 branch behavior clarification (universal across v1 + vNext)

Branches are **bounded scenario postures**, NOT autonomous
plans. Every branch in either vocabulary set obeys these
canonical boundaries by construction:

- Branches are bounded scenario postures (closed-vocab
  filter + projection over Wave 7 output; nothing else).
- Branches are NOT autonomous plans.
- Branches are NOT execution paths.
- Branches do NOT create Actions (Wave 8 owns transitions;
  Wave 9 NEVER bypasses Wave 8).
- Branches do NOT invoke connectors.
- Branches do NOT bypass Wave 8.
- Branches do NOT bypass Section 2 Action runtime
  per ADR-0057.
- Branches exist to compare governed possibilities before
  action.

These boundaries are preserved verbatim across §4.1 (v1) and
§4.2 (vNext); the vocabulary names change but the substrate
constraints do NOT.

### 5. `agent_role` — closed vocabulary

§5 was amended in-place 2026-05-31 (Amendment 1) to
canonicalize a richer vNext vocabulary alongside the LIVE v1
runtime vocabulary. Both sets are closed-vocab; future
implementation amendment may migrate the runtime constants
from v1 → vNext under a separate Founder-authorized slice.
Both sets honor §5.3 role behavior clarification verbatim.

#### 5.1 v1 runtime vocabulary (LIVE)

Six values per the Founder behavioral directive's
"governance-bound but still useful" framing. LIVE at
`apps/api/src/services/playground/playground-simulation.service.ts`
`PLAYGROUND_AGENT_ROLE_VALUES` per Wave 9 Option A
implementation PR #147 `340d37f`. Wave 10 Control Tower
cockpit at `otzar-control-tower` PR #6 `cf3483f` consumes
this set verbatim. v1 default = all 6 (4 v1 branches × 6 v1
roles = §11 24-branch ceiling).

- `OPERATIONS_AGENT` — surfaces the recommendation through
  the operational-feasibility lens (execution complexity,
  resilience).
- `COMPLIANCE_AGENT` — surfaces the recommendation through
  the compliance / legal review lens.
- `RISK_AGENT` — surfaces the recommendation through the
  operational-risk lens.
- `CUSTOMER_AGENT` — surfaces the recommendation through
  the customer-impact lens.
- `RESILIENCE_AGENT` — surfaces the recommendation through
  the operational-resilience / reversibility lens.
- `HUMAN_REVIEW_AGENT` — surfaces the recommendation through
  the human-review-burden lens.

#### 5.2 canonical vNext vocabulary (forward-substrate)

Ten values. **Not yet LIVE in any code surface.** Becomes
canonical at the future Founder-authorized implementation
amendment that migrates the v1 runtime constants. vNext
roles each map to a closed-vocab projection lens over Wave 7
output; the migration ADR specifies the exact closed-vocab
label set each role surfaces. vNext default at the
implementation slice is **6 of 10** (paired with 4-of-6 §4.2
branches → §11 24-branch ceiling preserved). The 10 vNext
roles better mirror how organizations actually reason through
decisions — ownership / policy / compliance / security / data
governance / connector readiness / approval authority /
stakeholder impact / operations / resilience.

- `OWNER_OPERATOR` — surfaces the recommendation through the
  decision-owner / accountable-party lens.
- `POLICY_REVIEWER` — surfaces the policy-review lens
  (ActionPolicy + governance_terms posture per ADR-0063).
- `COMPLIANCE_REVIEWER` — surfaces the compliance-review
  lens (HIPAA / FERPA / SOC 2 / FedRAMP frameworks per
  ADR-0061 + ADR-0070).
- `SECURITY_REVIEWER` — surfaces the security-review lens
  (operational risk + threat model posture).
- `DATA_GOVERNANCE_REVIEWER` — surfaces the data-governance
  lens (data scope readiness + jurisdiction + retention per
  ADR-0037).
- `CONNECTOR_ADMIN` — surfaces the connector-readiness lens
  (required connector capabilities per ADR-0064).
- `ACTION_APPROVER` — surfaces the approval-chain lens
  (dual-control + escalation per ADR-0026 + ADR-0057).
- `CUSTOMER_OR_STAKEHOLDER_ADVOCATE` — surfaces the
  customer-impact / external-stakeholder lens.
- `OPERATIONS_LEAD` — surfaces the operational-feasibility +
  execution-complexity lens (analogous to v1
  `OPERATIONS_AGENT` but framed as a governed role).
- `RESILIENCE_REVIEWER` — surfaces the resilience +
  reversibility lens (analogous to v1 `RESILIENCE_AGENT`).

#### 5.3 role behavior clarification (universal across v1 + vNext)

NEVER use LLM-generated agent personas. Each agent_role in
either vocabulary set is a closed-vocab lens that filters /
projects the Wave 7 output per §1 `SimulationBranch.branch_summary`.
The agent_role NEVER exchanges raw text or chain-of-thought
with another agent_role — branches are independent
sub-invocations projected through closed-vocab post-processing.

Each simulated role must answer these 8 questions safely
through closed-vocab projection (NEVER through free-text or
LLM reasoning):

1. **What does this role care about?** (surfaced via the
   role's closed-vocab `assumed_constraints[]` subset)
2. **What risk does this role see?** (surfaced via the
   role's `governance_conflicts[]` projection)
3. **What constraint does this role introduce?** (surfaced
   via the role's `assumed_constraints[]` additions over
   the universal RULE 0 / ADR-0026 / ADR-0046 baseline)
4. **What approval or review would this role require?**
   (surfaced via `required_reviews[]` echoed from Wave 7)
5. **What would this role block?** (surfaced via
   `governance_conflicts[]` non-`NO_NOTABLE_CONFLICT`
   labels + `blocked_by_policy`)
6. **What would this role support?** (surfaced via
   `expected_outcomes[]` non-blocked subset)
7. **What context is missing?** (surfaced via `confidence_label
   === INSUFFICIENT_DATA` + `unresolved_questions[]`)
8. **What safe next step does this role recommend?**
   (surfaced via the simulation-wide `recommended_next_review`
   + `enterprise_decision_posture.safe_next_step`)

NO simulated role in either vocabulary set may:

- approve an action
- execute an action
- invoke a connector
- change data
- create memory capsules
- create Action rows
- override policy
- speak on behalf of a real human
- claim legal or compliance certainty
- expose private reasoning
- reveal chain-of-thought
- act as a manager surveillance surface
- produce employee risk scoring
- produce psychological or personality scoring

These constraints are preserved verbatim across §5.1 (v1)
and §5.2 (vNext); the vocabulary names change but the
substrate boundaries do NOT.

### 6. Closed-vocab label sets (v1)

#### 6.1 `assumed_constraints` (closed vocab; 10 values)

- `OWNER_COSMP_SCOPE_ONLY`
- `SAME_ORG_ONLY`
- `NO_EXTERNAL_PROVIDERS`
- `NO_CONNECTOR_INVOCATION`
- `NO_RAW_MEMORY_ACCESS`
- `NO_AUTONOMOUS_EXECUTION`
- `WAVE_8_TRANSITION_REQUIRED_BEFORE_ACTION`
- `HUMAN_REVIEW_BEFORE_FINAL_DECISION`
- `LEGAL_COMPLIANCE_REVIEW_WHERE_APPLICABLE`
- `BLOCKED_CANDIDATES_NEVER_TRANSITIONABLE`

#### 6.2 `expected_outcomes` (closed vocab; 8 values)

- `WAVE_7_RECOMMENDATION_PRODUCED`
- `WAVE_7_RECOMMENDATION_BLOCKED`
- `WAVE_7_RECOMMENDATION_REQUIRES_HUMAN_DECISION`
- `WAVE_8_TRANSITION_POSSIBLE_AFTER_REVIEW`
- `WAVE_8_TRANSITION_DECLINED_BY_POLICY`
- `INSUFFICIENT_DATA_REQUIRES_REVIEW`
- `COMPLIANCE_REVIEW_RECOMMENDED`
- `OPERATIONAL_RESILIENCE_FAVORABLE`

#### 6.3 `governance_conflicts` (closed vocab; 10 values)

- `BRANCH_RECOMMENDS_DIFFERENT_CANDIDATE_TYPE`
- `BRANCH_BLOCKED_BY_POLICY`
- `BRANCH_REQUIRES_DUAL_CONTROL`
- `BRANCH_REQUIRES_LEGAL_REVIEW`
- `BRANCH_REQUIRES_COMPLIANCE_REVIEW`
- `BRANCH_INSUFFICIENT_DATA`
- `BRANCH_HUMAN_DECISION_REQUIRED`
- `BRANCH_ACTION_RUNTIME_REQUIRED`
- `BRANCH_NO_TRANSITION_POSSIBLE`
- `NO_NOTABLE_CONFLICT`

#### 6.4 `unresolved_questions` (closed vocab; 8 values)

- `WHICH_CANDIDATE_TYPE_TO_RECOMMEND`
- `WHETHER_TO_PROCEED_GIVEN_INSUFFICIENT_DATA`
- `WHETHER_GOVERNANCE_REVIEW_IS_SUFFICIENT`
- `WHETHER_LEGAL_REVIEW_IS_REQUIRED`
- `WHETHER_DUAL_CONTROL_IS_REQUIRED`
- `WHETHER_TO_BLOCK_OR_PROCEED`
- `WHETHER_HUMAN_REVIEWER_IS_AVAILABLE`
- `NO_UNRESOLVED_QUESTIONS_IDENTIFIED`

### 7. `next_review_label` — closed vocabulary (v1)

Eight values. Adding new values requires future ADR amendment.

- `HUMAN_GOVERNANCE_REVIEW`
- `POLICY_OWNER_REVIEW`
- `COMPLIANCE_REVIEW`
- `LEGAL_REVIEW`
- `OPERATIONAL_RESILIENCE_REVIEW`
- `DATA_GOVERNANCE_REVIEW`
- `RERUN_WITH_DIFFERENT_RECOMMENDATION_MODE`
- `NO_FURTHER_REVIEW_IDENTIFIED`

### 8. Forbidden inputs / no-leak (universal)

The future Wave 9 implementation MUST NOT consume or expose:

- raw chain-of-thought between agents
- raw model outputs / prompts / completions
- raw capsule / memory / transcript content
- embeddings / vectors / storage locations / content hashes
- bridge IDs / secret_ref values / connector payloads
- private employee behavior signals / employee scores /
  manager surveillance / psychological profiling
- cross-org data
- privileged legal material
- raw audit details beyond Wave 5-7-8 SAFE projections
- regulator-backdoor data
- caller-supplied agent prompts or instructions
- caller-supplied branch payloads
- numeric `score` / `rank` / `winner` / `probability` /
  `roi` field names

The future Wave 9 implementation slice MUST include a
no-leak guard test enforcing every forbidden field substring
against an adversarial fixture set.

### 9. "Wave 9 calls Wave 7 internally" canonical decision

Wave 9 implementation MUST internally invoke
`PlaygroundBestPathRecommendationService.recommendBestPath`
per branch — once per (branch_definition, agent_role)
combination at v1. It MUST NOT accept caller-supplied agent
prompts, recommendation payloads, comparison payloads, or
candidate payloads.

Each Wave 7 sub-invocation receives the appropriate
`recommendation_mode` derived from the `branch_definition` per
§4. The sub-invocation results are projected through the
`agent_role` closed-vocab lens to produce one
`SimulationBranch`.

### 10. Deterministic `branch_id`

Each `SimulationBranch.branch_id` is a deterministic SHA-256
16-char hex over `(scenario_id, orchestration_mode,
branch_definition, agent_role)` — stable across reruns;
mirrors ADR-0072 §1 `candidate_key` precedent.

### 11. Bounded counts (canonical at this ADR)

- `max_branches` — capped at 24 (4 default branch_definitions
  × 6 default agent_roles = 24 sub-invocations at v1).
- `branches_per_response_max` — 24.
- `assumed_constraints_per_branch_max` — 10.
- `expected_outcomes_per_branch_max` — 8.
- `governance_conflicts_per_branch_max` — 10.
- `unresolved_questions_per_response_max` — 8.
- `branch_summary_max_chars` — 600.
- `rationale_summary_max_chars` — 300.

Bounded count discipline is canonical; exact values may
adjust at the implementation slice.

### 12. ADR-0069 §6 8-question architecture check (Wave 9 v1 register decision)

1. **Concurrency / long-running**: At v1 with 24 deterministic
   sub-invocations against the in-process Wave 7 service,
   sequential execution completes in ~24 × Wave-7-latency,
   which is bounded. **NOT inherently long-running.**
2. **Supervision / fault isolation**: Each sub-invocation
   is independent — one Wave 7 failure does NOT prevent
   other branches from completing. Failure isolation is
   per-branch, achievable via `Promise.allSettled` in
   TypeScript. **NOT BEAM-required at v1.**
3. **Backpressure / streaming**: Wave 9 v1 returns ONE
   response containing all branches; no streaming surface
   needed. **NOT BEAM-required.**
4. **Multi-agent coordination**: Branches are INDEPENDENT;
   no agent-to-agent message-passing per §5 + §9. **NOT
   BEAM-required at v1.**
5. **Event-driven flow**: NO at v1.
6. **High-throughput**: NO at v1 (bounded to 24 branches per
   call).
7. **Cross-system coordination**: NO.
8. **Intelligence-heavy computation**: NO at v1
   (deterministic projections through closed-vocab lenses).

**Conclusion**: Wave 9 v1 belongs at the TypeScript §2.1
register. BEAM (Option C) is forward-substrate per ADR-0069
§3 domain 6 + ADR-0028 — applicable WHEN multi-agent
simulation needs LIVE concurrent message-passing agents
exchanging closed-vocab signals across long-running supervised
processes, or when the simulation needs to scale beyond 24
sequential branches per call. Neither condition holds at v1.

### 13. Persistence posture

NO persistence at v1. Wave 9 is computed-on-read (mirrors
Wave 5/6/7 posture). NO `PlaygroundSimulation` Prisma model.
NO schema migration. Queryable history via the audit chain
(`ADMIN_ACTION + details.action =
"PLAYGROUND_SIMULATION_EXECUTED"`).

A future Founder-authorized ADR amendment MAY introduce a
persistent simulation surface if Wave 10 (Control Tower)
needs replayable simulation history.

### 14. Audit posture

Wave 9 emits ONE audit row per invocation:
`ADMIN_ACTION + details.action = "PLAYGROUND_SIMULATION_EXECUTED"`
with safe metadata:

- `scenario_id`
- `orchestration_mode`
- `branch_count`
- `branch_definitions_used` (closed-vocab subset of §4)
- `agent_roles_used` (closed-vocab subset of §5)
- `convergence_summary_size` (number of agreed candidate_keys)
- `disagreement_summary_size` (number of diverged candidate_types)
- `unresolved_questions_count`
- `caller_confirmation_received` (always true)

NEVER raw branch text / chain-of-thought / scenario JSON /
agent prompts / model outputs / scores.

ZERO new audit literal. Each Wave 7 sub-invocation also
emits its own `PLAYGROUND_BEST_PATH_RECOMMENDED` audit row
per ADR-0074 §14 — Wave 9 does NOT suppress those.

### 15. Implementation-method comparison (canonical at this ADR)

#### 15.1. Option A — Deterministic TypeScript sequential

- **Where**: `apps/api/src/services/playground/playground-simulation.service.ts`.
- **Mechanism**: sequential `Promise.allSettled` over
  branch_definitions × agent_roles → `Promise<Wave7Result[]>`
  → closed-vocab projection.
- **ADR-0069 register**: TypeScript §2.1.
- **Recommended posture for v1** per §12 8-question check.

#### 15.2. Option B — Python-backed

- **Where**: NEW Python service per ADR-0069 §2.4.
- **NOT authorized at this ADR.**

#### 15.3. Option C — BEAM-orchestrated

- **Where**: NEW BEAM service per ADR-0069 §3 domain 6 +
  ADR-0028 BEAM coordination layer.
- **Applicable WHEN**: Wave 9 needs LIVE concurrent multi-
  agent processes with supervised fault isolation,
  backpressured event flow, or long-running coordination
  beyond the bounded 24-branch v1 ceiling.
- **NOT authorized at this ADR.** Future Founder-authorized
  ADR-0028 amendment + ADR-0069 §6 8-question check
  re-verification required.

### 16. Wave-map alignment (preserves ADR-0065 §7 + prior ADRs)

Wave 9 contract MUST NOT accidentally implement Wave 10:

- **Wave 10** (Control Tower frontend consumer): lives in
  the `otzar-control-tower` repo; Foundation owns the
  contract.

Wave 9 explicitly EXCLUDES:

- Action execution (Section 2 retains all execution authority).
- new Action creation (Wave 8 owns transition; Wave 9 NEVER
  bypasses Wave 8).
- agent-to-agent message-passing with raw text.
- LLM-generated agent personas or reasoning.
- caller-supplied agent prompts.
- numeric scoring / probability claims / winner declaration.
- multi-agent runtime that survives between requests (Wave
  9 is per-request; no persistent agent state).

### 17. Future generalization (long-term trust-governed mapping context)

Strategic context only per the Founder behavioral directive.
NOT authorizing personal-life automation / consumer Otzar
execution / trust-level delegation logic / autonomous
execution.

The §1 SimulationResponse architecture preserves the
multi-perspective exploration pattern that future personal-
life mapping (Otzar-for-life) may eventually consume — the
canonical exploration → governance → action transition is
identical at the architectural register.

### 17A. Amendment 1 migration posture (added 2026-05-31)

Amendment 1 introduced §4.2 + §5.2 vNext vocabularies
alongside the LIVE §4.1 + §5.1 v1 vocabularies. The
migration posture is **explicit and forward-only** — runtime
behavior does NOT change at this amendment.

Canonical disposition at Amendment 1:

- **Wave 9 Option A runtime (PR #147 `340d37f`) stays on the
  v1 vocabulary.** `PLAYGROUND_BRANCH_DEFINITION_VALUES` +
  `PLAYGROUND_AGENT_ROLE_VALUES` + the v1 defaults
  (4 branches × 6 roles = 24) at
  `apps/api/src/services/playground/playground-simulation.service.ts`
  are NOT modified by Amendment 1.
- **Wave 10 Control Tower implementation (PR #6 `cf3483f`)
  stays on the v1 vocabulary.** The `api.playground.*`
  namespace at `otzar-control-tower/src/lib/api.ts` + the
  Wave 4-9 Foundation type mirrors at
  `src/lib/types/foundation.ts` + the cockpit page at
  `src/pages/AgentPlayground.tsx` all consume the v1
  closed-vocab labels verbatim. Amendment 1 does NOT change
  any CT surface.
- **The vNext vocabulary is canonical at the contract
  register but NOT at the execution register.** Foundation
  Wave 9 API responses continue to emit v1 closed-vocab
  labels (`POLICY_FIRST_BRANCH` / `OPERATIONS_AGENT` etc.)
  until a future Founder-authorized implementation amendment
  migrates the service constants.
- **The 24-branch §11 ceiling is preserved across both
  vocabularies.** v1 default = 4 × 6 = 24. vNext default at
  the future implementation slice = 4-of-6 branches × 6-of-10
  roles = 24. The exact 4-of-6 + 6-of-10 default selections
  are picked at the implementation slice.
- **NO existing implementation is marked stale or broken.**
  v1 runtime + Wave 10 CT cockpit remain canonical and LIVE
  for the v1 enterprise cockpit scope. Amendment 1 is a
  forward-substrate canonicalization — it makes the richer
  vocabulary available to future slices without invalidating
  current shipped substrate.

The future implementation amendment that migrates v1 → vNext
MUST:

1. Land under a separate Founder authorization tag like
   `[FOUNDER-SECTION-5-WAVE-9-VNEXT-IMPLEMENTATION-AUTH]`.
2. Either replace the v1 constants in-place (clean break) OR
   support both vocabularies simultaneously during a
   transition window — the implementation slice picks.
3. Migrate the Wave 10 CT type mirror + cockpit panel labels
   + MSW handlers + unit tests in lockstep with the
   Foundation service migration.
4. Preserve the §11 24-branch ceiling.
5. Preserve §1 + §6 + §8 + §16 (response shape + closed-vocab
   label sets + no-leak boundary + wave-map alignment)
   verbatim.
6. Preserve §4.3 + §5.3 universal behavior clarifications
   verbatim (branches are bounded scenario postures; roles
   are simulation lenses; never autonomous; never bypass
   Wave 8).
7. Pass the existing Foundation Wave 9 integration test
   surface + Wave 10 CT forbidden-UI-copy / no-leak /
   no-Execute-button guards.

### 17B. Control Tower relation at Amendment 1

The Wave 10 Control Tower cockpit at `/agent-playground`
(LIVE per ADR-0077 §11 Option A + `otzar-control-tower` PR
#6 `cf3483f`) is the canonical consumer surface for Wave 9
simulation output. At Amendment 1:

- The CT cockpit continues to render v1 closed-vocab labels
  (`POLICY_FIRST_BRANCH` / `OPERATIONS_AGENT` etc.) as
  badges in the Simulation panel (6.6) per ADR-0077 §6.6.
- No CT code change is authorized by Amendment 1.
- A future CT implementation amendment will surface the
  richer vNext labels when the Foundation service migrates;
  that amendment lands under its own Founder authorization
  in the `otzar-control-tower` repo.
- The CT cockpit's 4 honesty postures per ADR-0077 §8
  (hierarchy / conversation-context / evidence-posture /
  execution-boundary) are preserved across both vocabularies
  unchanged.

### 17C. DGI / product rationale for vNext vocabulary

The richer §4.2 + §5.2 vocabulary mirrors how enterprises
actually reason through governed decisions. Where v1 uses
abstract-sounding roles (`OPERATIONS_AGENT` /
`COMPLIANCE_AGENT` / `RISK_AGENT` / `CUSTOMER_AGENT` /
`RESILIENCE_AGENT` / `HUMAN_REVIEW_AGENT`), vNext maps to
recognizable governed enterprise roles:

- ownership (`OWNER_OPERATOR`)
- policy (`POLICY_REVIEWER`)
- compliance (`COMPLIANCE_REVIEWER`)
- security (`SECURITY_REVIEWER`)
- data governance (`DATA_GOVERNANCE_REVIEWER`)
- connector readiness (`CONNECTOR_ADMIN`)
- approval authority (`ACTION_APPROVER`)
- stakeholder impact (`CUSTOMER_OR_STAKEHOLDER_ADVOCATE`)
- operations (`OPERATIONS_LEAD`)
- resilience (`RESILIENCE_REVIEWER`)

Where v1 branch definitions mirror Wave 7 recommendation
modes verbatim (`POLICY_FIRST_BRANCH` /
`GOVERNANCE_FIRST_BRANCH` etc.), vNext branch definitions
read as enterprise-recognizable decision postures
(`RECOMMENDED_PATH` / `LOW_RISK_PATH` / `COMPLIANCE_FIRST_PATH`
/ `RESILIENCE_FIRST_PATH` / `HUMAN_REVIEW_PATH` /
`DO_NOT_PROCEED_PATH`).

The best simulation output posture remains canonical across
both vocabularies per ADR-0077 §6.6 + §8 + §10:

- ONE primary recommended path for review (per
  `enterprise_decision_posture.primary_recommended_branch_id`)
- viable alternatives where useful (per
  `viable_alternative_branch_ids[]`; capped at 3)
- evidence posture (per `evidence_posture[]` closed-vocab)
- blockers before action (per `blockers_before_action[]`
  closed-vocab)
- safe next step (per `safe_next_step` closed-vocab; 7
  values)
- explicit "not executed" boundary (per ADR-0077 §8.4
  execution-boundary honesty + three-state lifecycle)

vNext NEVER introduces numeric scoring, ranking, "AI
decided," or final-decision language — those framings are
permanently forbidden across both vocabularies per ADR-0077
§4 forbidden UI copy + this ADR §8 universal no-leak + the
§4.3 + §5.3 universal behavior clarifications.

### 18. Explicit non-goals at this commit

NO code in this commit. NO schema migration. NO new routes.
NO new audit literal. NO LLM autonomy. NO Python. NO BEAM
runtime implementation. NO multi-agent runtime. NO
Phoenix.PubSub / Broadway / supervised-process orchestration.
NO Action execution. NO new ActionType. NO Wave 8 bypass.
NO connector invocation. NO external provider calls. NO
Control Tower frontend. NO new Prisma model. NO personal-
life automation. NO trust-level delegation. NO CLAUDE.md
bulk catalog edit. NO bulk older-ADR rewrite. NO current
active slice derailment.

**Amendment 1 explicit non-goals (added 2026-05-31):** NO
runtime code change. NO modification of Wave 9 service
constants. NO modification of Wave 9 integration tests. NO
modification of Wave 10 Control Tower implementation. NO
new Foundation routes. NO new schema. NO new audit literal.
NO LLM / Python / BEAM authorization. NO conversation
listener authorization. NO hierarchy substrate
authorization. NO organizational graph authorization. NO
new Foundation API authorization. NO change to current Wave
9 runtime behavior. NO marking of v1 vocabulary as stale or
broken. Amendment 1 is docs-only canonicalization of vNext
vocabulary as forward-substrate; v1 runtime + Wave 10 CT
cockpit remain canonical and LIVE for the v1 enterprise
cockpit scope.

## Consequences

### Easier after this ADR

- Future Wave 9 implementation slices have a single
  canonical contract reference.
- §12 ADR-0069 §6 check explicitly LOCKS v1 at TypeScript
  §2.1 (deterministic sequential branch enumeration) —
  BEAM is forward-substrate, not v1 implementation
  requirement.
- §15 three-method comparison forward-queues Python (Option
  B) and BEAM (Option C) at explicit ADR-0069 §2.4 / §2.3
  registers with their gating ADRs named.
- §9 + §5 "no agent-to-agent message-passing" decision
  prevents Wave 9 from drifting into uncontrolled LLM-
  agent debate.
- §11 bounded counts (24-branch ceiling) keep Wave 9 v1
  within TypeScript synchronous-response latency budget.

### Harder after this ADR

- §11 24-branch ceiling caps simulation scope at v1; future
  expansion requires either §11 amendment OR Option C BEAM
  authorization.
- §4 + §5 closed vocabularies cannot accept caller-supplied
  branch_definitions or agent_roles. Intentional safety
  boundary.
- §9 "Wave 9 calls Wave 7 internally" means callers cannot
  inject simulation inputs that bypass the Wave 5-7
  pipeline.

## Forward queue

- Wave 9 implementation slice Option A (deterministic
  TypeScript sequential branch enumeration) — separate
  Founder authorization at slice.
- Wave 9 persistence slice — only if Wave 10 requires
  replayable simulation history.
- Wave 9 Option C BEAM-orchestrated — requires ADR-0069 §6
  re-verification + ADR-0028 amendment + separate Founder
  authorization at slice.
- Wave 10 (Control Tower frontend consumer) — separate
  Founder slice; lives in `otzar-control-tower` repo.

## Bidirectional citations

- Cites RULE 0, RULE 4, RULE 10, RULE 12, RULE 13, RULE 19,
  RULE 20, RULE 21.
- Cites ADR-0001 + ADR-0002 + ADR-0020 + ADR-0026 +
  ADR-0028 (BEAM coordination — Option C target).
- Cites ADR-0052 + ADR-0057.
- Cites ADR-0065 (closes §7 Wave 9 forward-queue line at
  contract register; bidirectional back-citation per RULE
  14 + RULE 20).
- Cites ADR-0069 (BEAM substrate-coherence law; §12
  8-question check applied; bidirectional back-citation
  per RULE 14 + RULE 20).
- Cites ADR-0070 (legal-advice boundary).
- Cites ADR-0072 + ADR-0073 + ADR-0074 (Wave 5/6/7
  contracts; Wave 9 consumes Wave 7 transitively).
- Cites ADR-0075 (Wave 8 governed-transition contract;
  Wave 9 NEVER bypasses Wave 8 for any candidate-to-Action
  transition).
- Cited by ADR-0077 (Wave 10 Control Tower Consumer
  Contract; Wave 10 panel 6.6 consumes the §1
  `SimulationResponse` shape verbatim; Wave 10 §13 no-leak
  doctrine inherits ADR-0076 §8 verbatim; Wave 10 §8.3
  evidence-posture honesty posture preserves the §6
  closed-vocab discipline). Bidirectional back-citation
  per RULE 14 + RULE 20 (Founder authorization for this
  back-citation amendment landed at
  `[FOUNDER-SECTION-5-WAVE-10-AGENT-PLAYGROUND-CONTROL-TOWER-CONSUMER-CONTRACT-ADR-AUTH]`
  2026-05-31).

## Founder authorization

Per RULE 20: this ADR + bidirectional back-citations + the
architecture/README.md catalog entry + Section 5 build-state
doc update + NEXT_ACTION.md baton update land under explicit
Founder authorization at
`[FOUNDER-SECTION-5-WAVE-9-MULTI-AGENT-SIMULATION-ORCHESTRATION-CONTRACT-ADR-AUTH]`
2026-05-31 (under Founder Section 5 autonomy directive +
Founder behavioral directive). ADR-only — Wave 9
implementation slice (Option A) requires separate Founder
authorization at slice.

**Amendment 1 authorization** (added 2026-05-31): §4 + §5 +
§17A + §17B + §17C + §18 amendment + the corresponding
architecture/README.md catalog refresh +
docs/current-build-state/05-agent-playground.md forward-
substrate row refresh + docs/NEXT_ACTION.md Tier 1 refresh
all land under explicit Founder authorization at
`[FOUNDER-SECTION-5-WAVE-9-VOCABULARY-AMENDMENT-AUTH]`
2026-05-31. Amendment 1 is docs-only — Wave 9 vNext
implementation slice (migration of v1 → vNext runtime
constants + Wave 10 CT label migration) requires separate
Founder authorization at slice
(`[FOUNDER-SECTION-5-WAVE-9-VNEXT-IMPLEMENTATION-AUTH]`).
v1 runtime + Wave 10 CT cockpit remain canonical and LIVE
for the v1 enterprise cockpit scope at Amendment 1 landing
register.
