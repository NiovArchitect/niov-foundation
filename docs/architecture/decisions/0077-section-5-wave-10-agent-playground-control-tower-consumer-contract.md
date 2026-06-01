# ADR-0077: Agent Playground Control Tower Consumer Contract — Section 5 Wave 10 (Design-Only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-SECTION-5-WAVE-10-AGENT-PLAYGROUND-CONTROL-TOWER-CONSUMER-CONTRACT-ADR-AUTH]`
2026-05-31 (under the Founder Section 5 autonomy directive
2026-05-31 + Founder behavioral clarification 2026-05-31 +
Founder enterprise-decision-output clarification 2026-05-31).

This ADR is **design-only**. NO code, NO new Foundation routes,
NO schema migration, NO new audit literal, NO LLM autonomy,
NO model calls, NO Python services, NO BEAM, NO multi-agent
runtime implementation, NO Action execution, NO connector
invocation, NO external provider calls, NO Control Tower
frontend code in this slice, NO personal-life automation,
NO trust-level delegation logic, NO repo-switch beyond
read-only inspection of `otzar-control-tower`, NO uncontrolled
agent debate. NO CLAUDE.md bulk catalog rewrite. NO current
active slice derailment.

Sits ABOVE ADR-0076 (Wave 9 multi-agent simulation orchestration
contract) and BELOW ADR-0065 (long-term product vision) at
the **consumer-experience contract register**. Wave 10 is the
Control Tower frontend consumer experience contract that
makes the Foundation Agent Playground intelligence pipeline
(Wave 4 scenarios → Wave 5 candidates → Wave 6 comparison →
Wave 7 best-path recommendation → Wave 8 governed transition
→ Wave 9 multi-agent simulation) **usable, reviewable, and
trusted** by enterprise operators. ADR-0077 locks the contract
so a future Wave 10 implementation slice (frontend code in
`otzar-control-tower`) can be authorized against a stable
consumer-experience contract.

## Context

### Why Wave 10 needs its own design ADR

ADR-0065 §7 forward-queues Wave 10 as *"Control Tower
frontend consumer (frontend; lives in
`otzar-control-tower` repo; Foundation owns the contract)."*
That framing is correct at the product-vision register but
does not lock:

- the 6-panel pipeline structure,
- the closed-vocab UI copy + forbidden-copy lists,
- the route-neutral consumer-experience contract,
- the "not executed yet" state discipline,
- the explicit confirmation flow for Wave 8 governed
  transition initiation through the UI,
- the conversation-context-signals "reserved-but-not-yet-
  available" honesty posture,
- the hierarchy "show-only-what-Foundation-actually-exposes"
  honesty posture,
- the enterprise success test (16 questions),
- the API client contract intent that mirrors Foundation's
  existing `api.ts` `ApiResult<T>` pattern,
- the relationship between Wave 10 and the EXISTING `/playground`
  route Placeholder in `otzar-control-tower` (preserved
  unchanged at this slice; Wave 10 implementation slice
  decides whether to extend or relocate).

ADR-0077 locks the contract.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `f02296c`:

- **Section 5 Waves 1+2+3+4+5+6+7+8+9 LIVE in Foundation**.
  Wave 9 Option A LIVE (PR #147 `340d37f`): NEW
  `PlaygroundSimulationService` + NEW route + 47 integration
  tests. Wave 9 closeout (PR #148 `f02296c`) refreshed Section
  5 build state to reflect 256 Section 5 integration tests
  passing.
- **6 Foundation Agent Playground routes LIVE** consumable by
  Wave 10:
  - `POST/GET /api/v1/playground/scenarios` (list/create)
  - `GET/PUT/DELETE /api/v1/playground/scenarios/:id`
  - `POST /api/v1/playground/scenarios/:id/candidates`
  - `POST /api/v1/playground/scenarios/:id/outcome-comparisons`
  - `POST /api/v1/playground/scenarios/:id/best-path-recommendations`
  - `POST /api/v1/playground/scenarios/:id/governed-transitions`
  - `POST /api/v1/playground/scenarios/:id/simulations`
- **6 exported success interfaces** at the Foundation tier:
  `CreateScenarioSuccess` / `GenerateCandidatesSuccess` /
  `CompareOutcomesSuccess` / `RecommendBestPathSuccess` /
  `ProposeGovernedTransitionSuccess` / `SimulationSuccess`
  (canonical at `apps/api/src/services/playground/*.service.ts`).
- **otzar-control-tower repo state** verified read-only at
  HEAD `d0c9bcb` ("Add correction signals UI") — branch
  `main` clean. Existing `/playground` route is a
  `<Placeholder>` (`src/pages/Playground.tsx`; 20 lines)
  framed for "Section 12C" patent-claim NEGOTIATE demo;
  Wave 10 implementation slice MUST coordinate with this
  pre-existing route reservation (see §11 below).
- **otzar-control-tower frontend patterns canonical**:
  React + Vite + TypeScript + Tailwind + TanStack Query;
  single HTTP client at `src/lib/api.ts` (`ApiResult<T>`
  discriminated union; bearer attached automatically;
  401 → `onUnauthorized` callback; GET retries once;
  method namespaces `api.auth.*` / `api.platform.*` /
  `api.org.*`); types mirror at `src/lib/types/foundation.ts`;
  Vitest + Playwright test substrate.

### Patent + doctrine alignment

- **US 12,517,919 (COSMP)** — Wave 10 consumes Foundation
  COSMP-gated APIs; permissions inherited verbatim via Wave
  4 owner-first SCENARIO_NOT_FOUND gate cascaded through
  Wave 5/6/7/8/9.
- **US 12,164,537 (DMW)** — enterprise-wallet boundaries
  preserved at every consumer surface.
- **US 12,399,904 (Foundation primitives)** — Wave 10 NEVER
  proposes an Action without explicit user confirmation
  routed through Wave 8 + Section 2; NEVER executes; NEVER
  fabricates governance / hierarchy / conversation context.
- **ADR-0052 Otzar DGI Doctrine** — Wave 10 is the
  *Control Tower / governance / executive-clarity layer*
  surface, NOT a classic admin dashboard, NOT a chatbot
  page, NOT a developer API demo. Wave 10 implements the
  doctrine sentence *"Control Tower makes that intelligence
  usable, reviewable, and trusted by operators."*
- **ADR-0070 Regulator-Ready Foundation Doctrine** — Wave 10
  surfaces audit-event_ids per panel; never fabricates
  certification language; mandatory neutral compliance
  vocabulary preserved.

## Decision

Foundation canonicalizes the **Control Tower consumer
experience contract** for Agent Playground Wave 10. Wave 10
is the enterprise-facing UI that exposes the completed
Foundation Agent Playground intelligence pipeline as a
guided **enterprise decision cockpit** — scenario context →
candidate paths → outcome comparison → best-path
recommendation → governed transition → multi-agent
simulation / enterprise decision posture — WITHOUT executing,
fabricating hierarchy/conversation context, exposing raw
chain-of-thought, bypassing Wave 8 / Section 2, or producing
hidden scoring.

### Canonical product sentence

**Agent Playground is where the enterprise thinks before it
acts. Foundation makes that thinking governed, scoped,
auditable, and safe. Control Tower makes that intelligence
usable, reviewable, and trusted by operators.**

### 1. Six primary panels (canonical at this ADR)

Adding new panels requires a future Founder-authorized
ADR-0077 amendment.

1. **Scenario Context** — list / create / open / edit safe
   fields / archive / show status + owner-scope + privacy
   note. Consumes Wave 4 routes.
2. **Candidate Paths** — generated paths with closed-vocab
   labels. Consumes Wave 5 route.
3. **Outcome Comparison** — comparison matrix + tradeoff
   summary. Consumes Wave 6 route. **Must not present as a
   winner selection.**
4. **Best-Path Recommendation** — single recommended path +
   alternatives_considered + reasons + readiness. Consumes
   Wave 7 route. **Must say "Recommended path for review,"
   not "AI decision."**
5. **Governed Transition** — explicit-confirmation flow that
   creates a Section 2 Action in PROPOSED status. Consumes
   Wave 8 route. **Must visibly state "not executed yet"
   until Section 2 separately reports execution; MUST never
   imply execution if only an Action was proposed; MUST
   never bypass Section 2.**
6. **Multi-Agent Simulation / Enterprise Decision Posture** —
   branch projections + convergence + disagreement +
   unresolved questions + recommended next review +
   enterprise_decision_posture (primary recommended branch +
   alternatives + evidence posture + blockers + safe next
   step). Consumes Wave 9 route. **Must feel like governed
   role-perspective simulation before action, NEVER
   autonomous agent debate.**

The UI MUST lead users through the full intelligence
pipeline without hiding governance boundaries. Wave 10 MUST
NOT collapse everything into one magic "Run AI" button.

### 2. Primary user flow (canonical at this ADR)

1. User creates or opens a `PlaygroundScenario`.
2. User generates candidate paths.
3. User compares outcomes.
4. User reviews best-path recommendation.
5. User reviews multi-agent simulation / enterprise decision
   posture.
6. User MAY initiate governed transition only through Wave 8,
   with explicit confirmation.
7. User sees clear "not executed yet" state unless Section 2
   later executes through its own governed runtime.

### 3. Route intent (route-neutral; not hardcoded)

Recommended route intent in Control Tower:

- `/agent-playground` (recommended new route — semantically
  distinct from the pre-existing `/playground` NEGOTIATE
  Placeholder)
- OR `/playground` (extend the existing route IF the
  pre-existing NEGOTIATE Placeholder is intentionally
  superseded by Wave 10 per a separate Founder UX scope
  decision; this ADR does NOT make that call)
- OR `/control-tower/agent-playground` (if Control Tower
  adopts a sub-namespace convention later)

ADR-0077 does NOT hardcode the route. The implementation
slice MUST follow `otzar-control-tower` repo route
conventions in effect at implementation time. The implementation
slice MUST make an explicit route-vs-Placeholder decision
inline and surface the decision in the implementation PR.

### 4. Closed-vocab canonical UI copy (canonical at this ADR)

ALLOWED:

- "Role-perspective simulation"
- "Primary path for review"
- "Viable alternatives"
- "Evidence posture"
- "Blockers before action"
- "Safe next step"
- "Not executed"
- "Requires review"
- "Governed transition required"
- "Action proposed (not executed)"
- "Approval required"
- "Compliance review required"
- "Legal review required"
- "Policy review required"
- "Human review required"
- "Insufficient data — review recommended"
- "Recommended path for review"

FORBIDDEN at every Wave 10 surface (UI copy + alt text +
ARIA labels + tooltip + state chip + button text):

- "AI agents decided"
- "Final decision"
- "Guaranteed compliant"
- "Regulator approved"
- "No fine risk"
- "Automatically execute"
- "Winner"
- "Score"
- "Ranked #1"
- "Employee risk"
- "Manager surveillance"
- "Full transcript"
- "Raw memory"
- "Chain-of-thought"
- "The AI thought…"
- "AI's reasoning was…"
- "Highest probability"
- "AI's preferred candidate"
- "The system decided"
- "Auto-approved"

A Wave 10 implementation slice MUST include a forbidden-copy
guard test that asserts none of the FORBIDDEN strings appears
in the rendered Wave 10 page tree.

### 5. State chips (closed vocab; v1)

The UI surfaces pipeline state via closed-vocab chips. Adding
new chip labels requires a future Founder-authorized
ADR-0077 amendment.

- `SCENARIO_READY`
- `CANDIDATES_GENERATED`
- `COMPARISON_READY`
- `RECOMMENDATION_READY`
- `SIMULATION_READY`
- `HUMAN_REVIEW_REQUIRED`
- `APPROVAL_REQUIRED`
- `POLICY_REVIEW_REQUIRED`
- `COMPLIANCE_REVIEW_REQUIRED`
- `LEGAL_REVIEW_REQUIRED`
- `BLOCKED`
- `ACTION_PROPOSED`
- `NOT_EXECUTED`

The chip values are UI labels — NOT Foundation API closed-
vocab enums. They MAY be derived from Foundation closed-vocab
fields (`action_transition_readiness` /
`recommended_next_review.next_review_label` /
`blockers_before_action` / `transition_outcome` /
`enterprise_decision_posture.safe_next_step`) but the chip
itself is a UI projection.

### 6. Per-panel display contract (canonical at this ADR)

Each panel MUST show the listed Foundation fields and MUST
NOT show the listed forbidden surfaces. Foundation API
response shapes are the source of truth: every field name
below maps to a real key in the corresponding Foundation
success interface at `apps/api/src/services/playground/*.service.ts`.

#### 6.1 Scenario Context (Wave 4)

MUST show: `title` + `description` (when present) +
`goal_summary` (when present) + `status` + `owner_entity_id`
visibility hint (e.g., "Your scenario") + `org_entity_id`
visibility hint (e.g., "Same-org") + `created_at` +
`archived_at` (when present).

MUST NOT show: raw `input_refs` JSON internals beyond
closed-vocab keys; cross-owner scenarios (404 enumeration-
safe per Wave 4 Foundation gate).

#### 6.2 Candidate Paths (Wave 5; consumes `GenerateCandidatesSuccess`)

MUST show, per candidate (closed-vocab labels only):
`candidate_title` + `candidate_type` + `candidate_summary` +
`assumptions[]` + `expected_benefits[]` + `known_risks[]` +
`governance_findings[]` + `required_approvals[]` +
`blocked_by_policy` + `action_runtime_transition_hint` +
`confidence_label` + per-candidate `honest_note` +
`candidate_key` (16-char deterministic; display as a
short ID badge, NOT a sortable score).

MUST NOT show: raw memory / raw capsule / raw transcript /
agent prompts / chain-of-thought / embeddings / storage
locations / content hashes / bridge IDs / secret refs /
hidden scores / numeric ranks / `candidate_pool` raw lists.

#### 6.3 Outcome Comparison (Wave 6; consumes `CompareOutcomesSuccess`)

MUST show: `comparison_matrix` rows (per candidate:
`candidate_title` + `candidate_type` + `comparison_summary`
+ closed-vocab dimension ratings via `outcome_dimensions[]`
+ `risk_findings[]` + `dependency_findings[]` +
`required_reviews[]` + `blocked_by_policy` +
`confidence_label` + per-item `honest_note`) +
`tradeoff_summary` (4 closed-vocab `candidate_key` sets) +
`review_required_count` + `blocked_candidates_count` +
top-level `honest_note`.

MUST visually reinforce: comparison is NOT a winner
selection; no numeric score; no "AI decided"; tradeoff is
a tradeoff matrix view, not a leaderboard.

MUST NOT show: numeric scores / weights / probability bars /
ranked-1 badges.

#### 6.4 Best-Path Recommendation (Wave 7; consumes `RecommendBestPathSuccess`)

MUST show: `recommended_candidate_title` +
`recommended_candidate_type` + `recommendation_summary` +
`recommendation_reasons[]` (closed-vocab) +
`alternatives_considered[]` (per alternative: title +
candidate_type + `reason_not_recommended` (closed-vocab) +
blocking_findings + review_findings + confidence_label) +
`not_recommended_reasons[]` + `action_transition_readiness` +
`required_reviews[]` + `risk_findings[]` +
`dependency_findings[]` + `blocked_by_policy` +
`human_decision_required` + top-level `honest_note`.

Experience requirement: this panel SHOULD feel decisive but
not over-autonomous. Say **"Recommended path for review,"**
NEVER **"AI decision."**

MUST NOT show: hidden scoring / ranked-1 framing / win-loss
copy / "the system chose" language.

#### 6.5 Governed Transition (Wave 8; consumes `ProposeGovernedTransitionSuccess`)

MUST show: `transition_outcome` (`ACTION_PROPOSED` /
`NO_ACTION_PROPOSED`) + `action_id` (when present) +
`action_status` (Section 2 status verbatim — PROPOSED /
APPROVED / REJECTED / etc.) + `action_type` (Wave 8 v1
allowed: `SEND_INTERNAL_NOTIFICATION` only) + `action_decision`
(when present) + `escalation_id` (when present) +
`reason_not_proposed` (when present; closed-vocab) +
`required_approvals[]` + `required_reviews[]` +
`human_decision_required` + top-level `honest_note` +
`playground_audit_event_id` (display as a short audit
reference badge).

Initiation flow MUST require:

- explicit user confirmation gesture (button + secondary
  confirmation modal OR an inline checkbox + button — the
  implementation slice picks the pattern, but the gesture
  MUST be explicit and reversible up to submit)
- the request body MUST set `caller_confirmation: true`
- the request body MUST include a fresh `idempotency_key`
  (the implementation slice picks the generation strategy
  — recommend a UUID v4 per submit attempt; never reuse)
- NO hidden auto-submit; NO automatic execution; NO
  multi-step wizard that submits silently on a tab change

MUST visibly state: **"Action proposed (not executed)"**
when `transition_outcome === "ACTION_PROPOSED"` and
`action_status !== "EXECUTED"` (or whatever Section 2's
executed state surfaces as — implementation slice verifies
verbatim at slice time). MUST NEVER imply execution if only
an Action was proposed.

MUST NOT show: raw `payload_redacted` internals beyond the
closed-vocab keys + non-sensitive metadata; NEVER expose
`secret_ref` values, NEVER raw connector payloads, NEVER
internal Section 2 dual-control machinery details that
Section 2 itself does not expose at its public surface.

#### 6.6 Multi-Agent Simulation / Enterprise Decision Posture (Wave 9; consumes `SimulationSuccess`)

MUST show: `orchestration_mode` + `branch_count` + per-branch
projections (`branch_id` + `branch_definition` + `agent_role`
+ `assumed_constraints[]` + `expected_outcomes[]` +
`governance_conflicts[]` + `branch_summary` (closed-style;
treat as a short paragraph) + `branch_recommended_candidate_type`
+ `confidence_label`) + `convergence_summary`
(`candidate_keys_agreed_upon[]` +
`governance_findings_all_branches_share[]` +
`required_reviews_all_branches_share[]`) +
`disagreement_summary` (`candidate_types_diverged[]` +
`recommendation_modes_diverged[]` + `unresolved_branches[]`)
+ `unresolved_questions[]` + `recommended_next_review`
(`next_review_label` + `rationale_summary` +
`applies_to_branch_ids[]`) + `enterprise_decision_posture`
(`primary_recommended_branch_id` +
`primary_recommendation_reasons[]` +
`viable_alternative_branch_ids[]` (up to 3) +
`evidence_posture[]` + `blockers_before_action[]` +
`safe_next_step`) + `human_decision_required` + top-level
`honest_note` + `simulation_audit_event_id`.

Experience requirement: this panel MUST NOT feel like "AI
agents debated and decided." It MUST feel like governed
role-perspective simulation before action. Agent role
projections are LENSES, NOT independent authorities.

MUST NOT show: raw chain-of-thought; raw model outputs;
raw agent prompts; numeric scores; "winner" framing;
employee scoring; manager surveillance framing.

### 7. Enterprise success test (canonical at this ADR)

Wave 10 is successful when an enterprise operator can answer
all 16 questions below by reading the Wave 10 UI without
opening developer tools, without contacting support, and
without inferring beyond what the UI shows:

1. What are we considering? (Scenario panel)
2. What paths exist? (Candidates panel)
3. What does each path risk? (Candidates + Comparison panels)
4. What do different governed roles see? (Simulation panel)
5. Where do perspectives agree? (Simulation convergence)
6. Where do they disagree? (Simulation disagreement)
7. What is the primary path for review? (Recommendation OR
   Simulation `primary_recommended_branch_id`)
8. Why that path? (Recommendation reasons +
   `primary_recommendation_reasons`)
9. What alternatives exist? (Recommendation
   `alternatives_considered` + Simulation
   `viable_alternative_branch_ids`)
10. What approvals/reviews are required? (Recommendation
    `required_reviews` + Recommendation
    `action_transition_readiness`)
11. What evidence supports this? (Simulation
    `evidence_posture`)
12. What context is missing? (Simulation
    `unresolved_questions` +
    `conversation_context_signals` placeholder when not
    available)
13. What blocks action? (Simulation `blockers_before_action`
    + Recommendation `blocked_by_policy` + Recommendation
    `risk_findings`)
14. What is the safe next step? (Simulation
    `enterprise_decision_posture.safe_next_step`)
15. Has anything actually been executed? (Governed Transition
    `transition_outcome` + `action_status` — explicit "not
    executed" framing)
16. What must happen before execution? (Governed Transition
    `required_approvals` + `human_decision_required` +
    Section 2 approval lifecycle per ADR-0057)

A Wave 10 implementation slice SHOULD include manual UX
walkthrough or component-test coverage that explicitly maps
each of the 16 questions to a rendered UI surface and asserts
the surface is present (or honestly states "not available in
this version" when the Foundation API does not yet expose
the underlying signal — see §8 honesty postures below).

### 8. Honesty postures (canonical at this ADR)

Wave 10 MUST honor four honesty postures. Each protects
against subtle drift where the UI invents signals Foundation
does not actually expose.

#### 8.1 Hierarchy honesty

If Foundation APIs do not yet expose a full hierarchy
(decision owner + required approver + accountable owner +
stakeholders to consult + stakeholders to inform +
compliance/legal/security/data review needs + action approver
review + policy owner review), Wave 10 MUST:

- show placeholder labels like "Decision owner: scenario
  owner" (derived from `owner_entity_id` Foundation already
  exposes)
- show "Approval chain: pending — driven by Section 2 policy
  evaluator at transition time" (derived from
  `action_transition_readiness === "REQUIRES_APPROVAL_CHAIN"`)
- show "Required reviews:" rendered from the closed-vocab
  `required_reviews[]` list verbatim
- NEVER invent named individuals as approvers / reviewers /
  consultants
- NEVER fabricate a hierarchy tree the Foundation API does
  not back

#### 8.2 Conversation-context honesty

**Amendment 1 (2026-06-01) — Stage 2 LIVE in lockstep:**
Foundation now exposes `conversation_context_signals[]` on
Wave 7 `RecommendBestPathSuccess` top-level + Wave 9
`EnterpriseDecisionPosture` per ADR-0078 §8 / §9 (Foundation PR
[#157](https://github.com/NiovArchitect/niov-foundation/pull/157)
`45c0de6` 2026-06-01) under
`[ADR-0078-STAGE-2-APPROVED-SOURCE-PROJECTION]`. CT consumes
both surfaces verbatim in
[otzar-control-tower PR #9](https://github.com/NiovArchitect/otzar-control-tower/pull/9)
`ad344a2` 2026-06-01 under
`[CT-ADR-0078-STAGE-2-CONVERSATION-CONTEXT-SIGNALS]`. The §8.2
"not available in this version" placeholder is RETIRED at the
CT register; CT renders the safe Layer 3 signal panel
(closed-vocab badges + safe_summary + honest_note) when
Foundation emits signals, with honest empty-state copy when the
sidecar is `[]`. Stage 1 (Layer 1 schema + Layer 3 helper +
Layer 4 read service) and Stage 3 (governed listener) remain
forward-substrate per ADR-0078 §17 — each requires separate
Founder authorization at slice. Layer 4 permissioned evidence
drilldown is NOT exposed at CT yet (no `related_transcript_ref`
emitted at Stage 2 per ADR-0078 §7 line 1088 + no Layer 1
ingest).

Pre-amendment text (preserved for chronology): Foundation did
not yet expose `conversation_context_signals[]` (reserved at
the Wave 9 ADR-0076 + ADR-0048 register for a future governed
listener slice); Wave 10 surfaced "Conversation context signals
not available in this version" or reserved UI space.

Wave 10 MUST NOT (preserved across the amendment):

- expose raw messages / raw transcripts / private notes /
  unscoped conversation content
- fabricate `PRIOR_COMMITMENT_IDENTIFIED` /
  `STAKEHOLDER_CONCERN_IDENTIFIED` etc. labels from inferred
  context (Stage 2 signals are PROJECTED from already-LIVE
  approved Foundation sources; CT MUST render them verbatim,
  never synthesize new ones)
- imply the Foundation has access to conversation history it
  does not actually have
- expose Layer 4 permissioned drilldown surfaces (transcript
  excerpts / speaker attribution / raw quotes) — those remain
  forward-substrate behind ADR-0078 Stage 1 + Stage 3
  authorization

#### 8.3 Evidence-posture honesty

`evidence_posture` is computed by Wave 9 from Wave 7 outputs
only at v1 (no external data sources). Wave 10 MUST render
the closed-vocab labels verbatim (e.g.,
`POLICY_SUPPORTS_PATH`, `AUDIT_HISTORY_SUPPORTS_PATH`,
`AUTHORITY_CHAIN_UNCLEAR`) but MUST NOT extrapolate them
into claims like "compliance verified" or "regulator approved."

Future evidence-posture sources (analytics aggregates,
prior Action history, real connector readiness, audit history
verification) require future Founder-authorized ADRs before
they can surface as new `evidence_posture` labels — Wave 10
MUST treat the closed-vocab list as a versioned contract.

#### 8.4 Execution-boundary honesty

Wave 10 MUST visually distinguish three lifecycle states:

- **Simulation / recommendation state** (no Action exists)
- **Action proposed state** (Wave 8 created a Section 2
  Action in PROPOSED status; Wave 10 displays `action_id` +
  `action_status`; the UI MUST visibly read "not executed
  yet")
- **Action executed state** (Section 2 has separately
  transitioned the Action to EXECUTED — Wave 10 reads this
  via the future Section 2 read surface; Wave 10
  implementation slice verifies the Section 2 status verbatim
  at slice time)

Wave 10 MUST NEVER show "Action executed" framing based on a
PROPOSED status alone. Wave 10 MUST NEVER call Section 2's
execute endpoints from within the Wave 10 surface — execution
is Section 2's responsibility per ADR-0057.

### 9. API client contract intent (canonical at this ADR)

Wave 10 implementation MUST extend Control Tower's existing
single-HTTP-client pattern at `src/lib/api.ts`. Concretely:

- Add a `api.playground.*` method namespace alongside
  existing `api.auth.*` / `api.platform.*` / `api.org.*`.
- Each method MUST return `Promise<ApiResult<T>>` per the
  existing discriminated-union pattern.
- Bearer token MUST attach automatically via the existing
  `getToken()` callback.
- 401 responses MUST trigger the existing `onUnauthorized`
  callback (NEVER swallowed silently inside Wave 10 code).
- GET requests MAY retry once on network failure (consistent
  with existing behavior); POST requests MUST NOT retry
  automatically (each retry would risk duplicate side
  effects — Wave 8 idempotency_key already handles that;
  Wave 5/6/7/9 are computed-on-read so retry is safe but
  the UI MUST present the user with explicit retry, not
  silent retry).
- Foundation error codes MUST surface verbatim to UI
  callbacks; the UI MAY translate them to enumeration-safe
  user-facing copy but MUST NOT invent new codes.
- Enumeration-safe failures (404 SCENARIO_NOT_FOUND for
  cross-owner / unknown id) MUST render as generic "Scenario
  not found" — NEVER reveal scope ambiguity.

Method names are route-neutral at this ADR; the implementation
slice picks names that fit Control Tower's existing
conventions. Recommended method names:

- `api.playground.listScenarios(params)`
- `api.playground.createScenario(body)`
- `api.playground.getScenario(id)`
- `api.playground.updateScenario(id, body)`
- `api.playground.archiveScenario(id)`
- `api.playground.generateCandidates(id, body)`
- `api.playground.compareOutcomes(id, body)`
- `api.playground.recommendBestPath(id, body)`
- `api.playground.proposeGovernedTransition(id, body)`
- `api.playground.simulate(id, body)`

Type mirrors MUST be added to `src/lib/types/foundation.ts`
(or co-located per CT convention) — mirror the Foundation
public success interfaces verbatim (`GenerateCandidatesSuccess`
/ `CompareOutcomesSuccess` / `RecommendBestPathSuccess` /
`ProposeGovernedTransitionSuccess` / `SimulationSuccess`).
Do not re-shape; if Control Tower convention demands
narrower types, derive them from the Foundation success
interfaces (e.g., `Pick<SimulationSuccess, ...>`) rather
than redeclaring divergent shapes.

### 10. Primary CTA rules (canonical at this ADR)

- "Generate candidates" — allowed after a scenario exists.
- "Compare outcomes" — allowed after candidates can be
  generated (Wave 5 is computed-on-read; comparison can
  invoke Wave 6 directly without requiring a prior
  candidate-generation API call from the user, since Wave 6
  internally invokes Wave 5).
- "Recommend best path" — allowed after comparison can be
  generated (Wave 7 internally invokes Wave 6).
- "Run role-perspective simulation" — allowed once a scenario
  exists (Wave 9 internally invokes Wave 7 per branch).
- "Propose governed action" — allowed only through Wave 8,
  and only with explicit user confirmation + a fresh
  `idempotency_key`.
- **NO "Execute" button in Wave 10.** Execution is Section 2's
  responsibility. The Wave 10 UI MAY link out to a future
  Section 2 read surface (e.g., a `/actions/:action_id`
  Control Tower page) for the operator to inspect the
  Section 2 lifecycle; the linking pattern is the
  implementation slice's call.

### 11. Pre-existing `/playground` route handling

`otzar-control-tower` HEAD `d0c9bcb` carries a 20-line
`src/pages/Playground.tsx` Placeholder that frames a
"Section 12C" patent-claim NEGOTIATE demo. This pre-existing
reservation predates the Section 5 Agent Playground product
line and is NOT semantically the same surface as Wave 10's
Agent Playground decision cockpit.

The Wave 10 implementation slice MUST make an explicit
choice at slice time:

- **Option A**: introduce a NEW route (`/agent-playground`)
  for Wave 10 and preserve the existing `/playground`
  Placeholder untouched for the NEGOTIATE demo.
- **Option B**: replace the existing `/playground`
  Placeholder with Wave 10 content IF a separate Founder
  UX scope decision authorizes the NEGOTIATE demo's
  retirement OR re-homing.
- **Option C**: nest Wave 10 under a sub-route
  (`/playground/agent-playground` OR
  `/control-tower/agent-playground`).

ADR-0077 does NOT make this call. The implementation slice
MUST cite the Option and the rationale in its PR.

### 12. Sequencing for the future Wave 10 implementation slice

ADR-0077 defines but DOES NOT implement:

1. Read-only inspection of `otzar-control-tower` (done at
   this ADR's Phase 0; the implementation slice repeats it
   at slice time to absorb any drift).
2. API client extension (add `api.playground.*` namespace
   per §9).
3. Type mirror in `src/lib/types/foundation.ts`.
4. Page shell + route registration per §11 Option choice.
5. Scenario workspace (panel 6.1).
6. Candidates / Comparison / Recommendation / Simulation
   panels (6.2–6.4 + 6.6).
7. Governed Transition confirmation flow (6.5) — added LAST
   to ensure the confirmation gesture is fully wired before
   any UI surface can submit it.
8. Forbidden-copy guard test + state-chip closed-vocab test
   + 16-question success-test coverage.
9. Vitest unit / Playwright integration / build-test-lint
   green.
10. Docs closeout PR (Foundation-side `current-build-state/05-agent-playground.md`
    update; CT-side closeout per CT repo conventions).

Each sub-slice (1) through (10) MAY require its own Founder
authorization depending on scope; the implementation slice
opens with a separate Founder authorization paste.

### 13. Forbidden inputs / no-leak (universal)

The future Wave 10 implementation MUST NOT consume or expose:

- raw chain-of-thought / agent prompts / model outputs
- raw capsule / memory / transcript content
- embeddings / vectors / storage locations / content hashes
- bridge IDs / secret_ref values / connector payloads
- private employee behavior signals / employee scores /
  manager surveillance / psychological profiling
- cross-org data
- privileged legal material
- raw audit details beyond Wave 4-9 SAFE projections
- regulator-backdoor data
- numeric `score` / `rank` / `winner` / `probability` /
  `roi` field names
- raw scenario JSON internals beyond closed-vocab keys

The Wave 10 implementation slice MUST include a no-leak
guard test enforcing every forbidden substring against an
adversarial fixture set rendered through the Wave 10 page
tree.

### 14. Audit posture

Wave 10 emits NO audit events of its own. Each Foundation
API invocation already emits its own audit row per the
respective wave's ADR (`PLAYGROUND_CANDIDATES_GENERATED` /
`PLAYGROUND_OUTCOMES_COMPARED` / `PLAYGROUND_BEST_PATH_RECOMMENDED`
/ `PLAYGROUND_GOVERNED_TRANSITION_PROPOSED` /
`PLAYGROUND_GOVERNED_TRANSITION_DECLINED` /
`PLAYGROUND_SIMULATION_EXECUTED` / Section 2's existing
Action emit chain). Wave 10 displays the `audit_event_id` /
`playground_audit_event_id` / `simulation_audit_event_id`
returned by each call as a short reference badge.

ZERO new audit literal across Wave 10 design + future
implementation.

### 15. Persistence posture

NO Wave 10 persistence at the Foundation tier. The future
Wave 10 frontend MAY cache responses client-side via TanStack
Query (per the existing CT pattern at `src/lib/query.ts`)
but NEVER persists to Foundation through a new schema
column / model / migration.

A future Founder-authorized ADR amendment MAY introduce a
"saved scenario draft" or "saved comparison snapshot"
persistence surface — Wave 10 v1 does NOT include it.

### 16. Wave-map alignment (preserves ADR-0065 §7)

Wave 10 contract closes ADR-0065 §7 Wave 10 forward-queue
line at the **consumer-experience contract register**.
Wave 10 implementation slice (frontend code in
`otzar-control-tower`) requires separate Founder authorization.

Wave 10 explicitly EXCLUDES:

- new Foundation routes
- new Foundation schema
- new Foundation audit literals
- Action execution (Section 2 retains all execution authority)
- new Wave 4-9 API contracts (consumes the existing 6
  routes verbatim)
- agent-to-agent message-passing UI (per ADR-0076 §5 + §9)
- LLM-generated agent personas
- caller-supplied agent prompts
- numeric scoring / probability claims / winner declaration
- multi-agent runtime that survives between requests
- conversation-context substrate (forward-substrate)
- hierarchy substrate beyond what Foundation actually exposes

### 17. Explicit non-goals at this commit

NO code in this commit. NO frontend implementation. NO
schema migration. NO new Foundation routes. NO new audit
literal. NO LLM autonomy. NO Python. NO BEAM. NO multi-agent
runtime implementation. NO Action execution. NO new
ActionType. NO Wave 8 bypass. NO connector invocation. NO
external provider calls. NO new Prisma model. NO personal-
life automation. NO trust-level delegation. NO CLAUDE.md
bulk catalog edit beyond an additive ADR-0077 entry. NO
bulk older-ADR rewrite. NO current active slice derailment.
NO repo-switch beyond read-only inspection already done at
Phase 0.

## Consequences

### Easier after this ADR

- Future Wave 10 implementation slices have a single
  canonical consumer-experience contract reference (panel
  set + closed-vocab UI labels + forbidden-copy list +
  state chips + enterprise success test + API client
  contract intent).
- §11 explicit `/playground` route Option set forces the
  implementation slice to make a deliberate route decision
  instead of silently overwriting the pre-existing
  NEGOTIATE Placeholder.
- §8 four honesty postures (hierarchy + conversation-context
  + evidence-posture + execution-boundary) protect the
  implementation slice from drift where the UI invents
  signals Foundation does not actually expose.
- §9 API client contract intent reuses the existing
  Control Tower `ApiResult<T>` pattern instead of inventing
  a parallel HTTP surface.

### Harder after this ADR

- §1 6-panel structure caps the v1 UI scope; future
  expansion (e.g., a "saved comparison snapshot" panel)
  requires §1 amendment.
- §4 forbidden UI copy list cannot be relaxed at the
  implementation slice. Intentional safety boundary.
- §11 Option choice (NEW route vs replace Placeholder vs
  nest) requires a Founder decision at the implementation
  slice (NOT this ADR), which may delay implementation
  if the Founder defers.

## Forward queue

- Wave 10 implementation slice (frontend code in
  `otzar-control-tower`) — separate Founder authorization
  at slice; opens with a Founder authorization tag like
  `[FOUNDER-SECTION-5-WAVE-10-CONTROL-TOWER-IMPLEMENTATION-AUTH]`.
- ADR-0076 §4 + §5 vocabulary amendment (Founder's
  recommended expanded vocab: 10 agent_roles + 6
  branch_types including OWNER_OPERATOR / POLICY_REVIEWER /
  ACTION_APPROVER / RECOMMENDED_PATH / DO_NOT_PROCEED_PATH)
  — requires explicit Founder authorization tag per RULE 20.
- `conversation_context_signals[]` substrate — requires a
  governed conversation-listener slice (separate ADR; ADR-0052
  build-order step 4 "transcript ownership/retention/scope
  policy before raw transcripts" applies).
- Wave 9 Option C BEAM-orchestrated — requires ADR-0028
  amendment + ADR-0069 §6 re-verification.
- Section 2 read-surface integration for Wave 10
  "Action executed" lifecycle state — depends on whether
  Section 2 ships a public `/actions/:action_id` Control
  Tower read endpoint; the Wave 10 implementation slice
  surveys this at slice time.

## Bidirectional citations

- Cites RULE 0, RULE 4, RULE 9, RULE 10, RULE 12, RULE 13,
  RULE 18, RULE 19, RULE 20, RULE 21.
- Cites ADR-0001 (foundational; entity-scope inherited via
  Wave 4 scenario gate).
- Cites ADR-0002 (append-only audit chain; each panel
  surfaces audit_event_id but Wave 10 emits no new audit
  events).
- Cites ADR-0026 (dual-control middleware pattern; Wave 8
  governed-transition initiation honors Section 2's
  dual-control machinery).
- Cites ADR-0048 (governed personalization-orchestration
  substrate; Wave 10 is the Control Tower surface this
  substrate flows through).
- Cites ADR-0052 (Otzar DGI doctrine; Wave 10 implements
  the "Control Tower makes that intelligence usable,
  reviewable, and trusted by operators" sentence).
- Cites ADR-0057 (Section 2 Action runtime; Wave 10 never
  bypasses).
- Cites ADR-0060 (Wave 1 Agent Playground inspector
  foundation).
- Cites ADR-0065 (closes §7 Wave 10 forward-queue line at
  consumer-experience contract register; bidirectional
  back-citation per RULE 14 + RULE 20).
- Cites ADR-0070 (regulator-ready doctrine; neutral
  compliance vocabulary preserved at every Wave 10 surface).
- Cites ADR-0072 (Wave 5 candidates contract; Wave 10
  panel 6.2 consumes).
- Cites ADR-0073 (Wave 6 outcome comparison contract;
  Wave 10 panel 6.3 consumes).
- Cites ADR-0074 (Wave 7 best-path recommendation contract;
  Wave 10 panel 6.4 consumes).
- Cites ADR-0075 (Wave 8 governed-transition contract;
  Wave 10 panel 6.5 consumes; Wave 10 NEVER bypasses).
- Cites ADR-0076 (Wave 9 multi-agent simulation
  orchestration contract; Wave 10 panel 6.6 consumes;
  bidirectional back-citation per RULE 14 + RULE 20).
- **Cited by ADR-0078** (Conversation Substrate — Source-
  of-Truth Transcripts + `conversation_context_signals[]`
  Safe-Projection Layer for Agent Playground; design-only;
  Accepted 2026-05-31) — ADR-0078 §5 defines the future
  Wave 10 cockpit attachment point: when ADR-0078 Stage 4
  implementation lands, the cockpit replaces this ADR's
  §8.2 *"Conversation context signals not available in
  this version"* placeholder with real Layer 3 signals +
  ADR-0078 §5.1 permissioned evidence-drilldown
  affordance. ADR-0077 §8 four honesty postures (hierarchy
  / conversation-context / evidence-posture / execution-
  boundary) preserved verbatim. ADR-0077 §4 forbidden-UI
  + §13 no-leak + §10 no-Execute-button guards preserved.
  ADR-0078 §5.2 forbidden default-projection field catalog
  extends ADR-0077 §13 no-leak doctrine at the
  conversation-substrate register. Bidirectional back-
  citation per RULE 14 + RULE 20 (Founder authorization
  for this back-citation amendment landed at
  `[FOUNDER-CONVERSATION-CONTEXT-SIGNALS-SUBSTRATE-ADR-AUTH]`
  2026-05-31).

## Founder authorization

Per RULE 20: this ADR + bidirectional back-citations + the
`architecture/README.md` catalog entry + Section 5
build-state doc update + NEXT_ACTION.md baton update land
under explicit Founder authorization at
`[FOUNDER-SECTION-5-WAVE-10-AGENT-PLAYGROUND-CONTROL-TOWER-CONSUMER-CONTRACT-ADR-AUTH]`
2026-05-31 (under Founder Section 5 autonomy directive +
Founder behavioral clarification 2026-05-31 + Founder
enterprise-decision-output clarification 2026-05-31).
ADR-only — Wave 10 implementation slice (frontend code in
`otzar-control-tower`) requires separate Founder
authorization at slice.
