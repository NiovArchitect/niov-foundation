# ADR-0074: Agent Playground Best-Path Recommendation Contract — Section 5 Wave 7 (Design-Only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-SECTION-5-WAVE-7-BEST-PATH-RECOMMENDER-CONTRACT-ADR-AUTH]`
2026-05-31.

This ADR is **design-only**. NO code, NO schema migration, NO
new routes, NO new audit literal, NO service-method signature
change, NO LLM autonomy, NO model calls, NO Python services,
NO BEAM orchestration, NO best-path recommender engine
implementation, NO scoring engine, NO numeric ranking, NO
governed transition to Action runtime, NO Action creation,
NO connector invocation, NO external provider calls, NO
Control Tower frontend, NO multi-agent simulation runtime,
NO recommendation persistence, NO outcome-comparison
persistence, NO Wave 8 / Wave 9 / Wave 10 work, NO personal-
life automation, NO trust-level delegation logic, NO consumer
Otzar product execution, NO CLAUDE.md bulk catalog edit, NO
current active slice derailment in this commit.

Sits ABOVE ADR-0073 (Section 5 Wave 6 outcome-comparison
contract) and BELOW ADR-0065 (long-term product vision) at
the **contract register**: ADR-0065 §7 forward map enumerates
Wave 7 as "best-path recommender with evidence and governance
findings. Contract: comparison matrix → recommended candidate
+ reasons + evidence + policy findings." ADR-0073 §20
explicitly forbids Wave 6 from accidentally implementing Wave
7. This ADR locks the contract any future Wave 7
implementation slice MUST satisfy.

## Context

### Why Wave 7 needs its own design ADR

ADR-0065 §7 forward-queues Wave 7 in two sentences:
*"best-path recommender with evidence and governance findings.
Contract: comparison matrix → recommended candidate + reasons
+ evidence + policy findings."* That framing is correct at
the product-vision register but does not lock the
recommendation-response shape, the closed vocabularies
(recommendation_mode, recommendation_reason,
action_transition_readiness, reason_not_recommended), the
deterministic selection rule, the scoring posture, the
allowed/forbidden language, the persistence boundary, the
audit / no-leak surfaces, or the explicit non-execution
posture.

ADR-0073 §20 forbids Wave 6 from selecting a winner — Wave 6
produces a comparison matrix and carries `TradeoffSummary`
(4 closed-vocab `candidate_key` sets, never a ranking).
Wave 7 is the natural projection layer on top: N comparison-
matrix items → one recommended candidate + reasons +
evidence + governance findings + required reviews + transition
readiness, WITHOUT executing, creating Actions, invoking
connectors, using numeric scores, claiming legal/compliance
certainty, or bypassing human/governance review.

ADR-0074 sits at the contract tier between ADR-0073 (Wave 6
outcome-comparison contract) and ADR-0065 (long-term product
vision). It locks **what a best-path recommendation IS** so
the future Wave 7 implementation slice (deterministic-TS
first; Python-backed later; BEAM-orchestrated later) can be
authorized against a stable contract instead of re-litigating
per slice.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `c0dc6e2`:

- **Section 5 today**: Waves 1+2+3+4+5+6 LIVE. Wave 2 inspector
  foundation (PR #100); Wave 4 persistence (PR #111); Wave 5
  contract ADR-0072 + Option A implementation (PRs #134 +
  #136); Wave 6 contract ADR-0073 + Option A implementation
  + closeout docs (PRs #138 + #139 + #140). Total **127
  Section 5 integration tests passing**.
- **Wave 6 Option A LIVE** (PR #139; commit `02410ee`): NEW
  `PlaygroundOutcomeComparisonService` + NEW route
  `POST /api/v1/playground/scenarios/:id/outcome-comparisons`
  + 39 integration tests. Computed-on-read; internally
  invokes Wave 5 candidate service per ADR-0073 §10
  (NEVER accepts caller-supplied candidate payloads); v1
  body accepts `candidate_types?[]` + `max_candidates?` +
  `comparison_mode?` only (NO `candidate_keys[]` per Wave 6
  Founder QLOCK 2). DETERMINISTIC_RUBRIC + CANDIDATE_FIELD_PROJECTION
  modes. `ADMIN_ACTION + details.action =
  "PLAYGROUND_OUTCOMES_COMPARED"` audit with safe metadata
  only.
- **Wave 6 output shape**: `CompareOutcomesSuccess = { ok,
  scenario_id, compared_at, comparison_mode, candidate_count,
  comparison_matrix[], tradeoff_summary,
  blocked_candidates_count, review_required_count,
  honest_note, audit_event_id }`. Each `ComparisonMatrixItem`
  (per ADR-0073 §1): 13 SAFE fields. `TradeoffSummary` (per
  ADR-0073 §1): 4 closed-vocab `candidate_key` sets — NEVER
  a ranking.
- **PlaygroundOutcomeComparisonService.compareOutcomes** is
  the canonical Wave 6 surface; it transitively enforces the
  owner-first + same-org SCENARIO_NOT_FOUND gate via Wave 5 →
  Wave 4 `PlaygroundScenarioService.getScenario` delegation.
- **ADR-0073 §13 audit posture**: ADMIN_ACTION +
  details.action discriminator pattern; Wave 7 follows the
  same pattern with `details.action =
  "PLAYGROUND_BEST_PATH_RECOMMENDED"`; ZERO new audit literal
  at the ADR.
- **ADR-0069 substrate-coherence law LIVE**: TypeScript owns
  API contracts + synchronous workflows; Python owns
  intelligence-heavy computation under Foundation governance
  (boundary ADR per §2.4 required before first slice); BEAM
  owns living coordination + multi-agent orchestration
  (Wave 9 fit per §3 domain 6).
- **ADR-0070 §9 legal-advice boundary LIVE**: allowed copy +
  forbidden copy apply to every Wave 7 output field
  verbatim.

The substrate to support deterministic Wave 7 best-path
recommendation exists today at the foundational tier. The
missing piece is the contract — which is what this ADR
locks.

### Patent + doctrine alignment

- **US 12,517,919 (COSMP)** — best-path recommendation
  consumes Wave 6 comparison output that is itself
  scope-bounded by caller's COSMP permission (RULE 0 +
  ADR-0059 same-org inherited via Wave 5 → Wave 4
  delegation). No privileged cross-entity reads at the
  recommendation tier.
- **US 12,164,537 (DMW)** — enterprise-wallet boundaries
  inherited verbatim from Wave 6 (no cross-org inputs reach
  Wave 7).
- **US 12,399,904 (Foundation primitives)** — best-path
  recommendation carries `action_transition_readiness` per
  recommendation but NEVER an unexecuted Action payload;
  every transition from recommended candidate to real work
  MUST route through Section 2 Action runtime via Wave 8 +
  ADR-0057. Wave 7 NEVER creates Actions, NEVER invokes
  connectors, NEVER bypasses governed-execution review.
- **ADR-0052 Otzar DGI doctrine** — Agent Playground is the
  DGI substrate; best-path recommendation is the layer that
  helps humans understand which candidate the deterministic
  rubric flags for review, NOT the layer that decides on the
  organization's behalf.
- **ADR-0069 BEAM substrate-coherence law** — Wave 7 v1
  belongs at TypeScript §2.1 register (synchronous
  request/response; deterministic priority ladder). Wave 9
  multi-agent recommendation orchestration is the BEAM-fit
  forward slice per §3 domain 6.
- **ADR-0070 regulator-ready doctrine** — Wave 7 honors §9
  legal-advice boundary verbatim; allowed compliance/legal
  copy is closed-vocab; forbidden copy is enforced by
  closed-vocab templates.

## Decision

Foundation canonicalizes the **best-path recommendation
contract** for Agent Playground Wave 7. A best-path
recommendation is a deterministic closed-vocabulary
projection over N Wave 6 comparison-matrix items into ONE
advisory recommended candidate + reasons + evidence +
governance findings + required reviews + transition readiness
posture, WITHOUT selecting a winner that bypasses human
review, fabricating probabilistic claims, producing employee
scoring, producing legal conclusions, or producing autonomous
decisions. Wave 7 recommendation NEVER executes, NEVER
creates Actions, NEVER ranks candidates numerically, NEVER
exposes scores, and NEVER bypasses the Section 2 Action
runtime governed-execution surface (Wave 8 forward-substrate).

### 1. What a best-path recommendation IS (contract)

A recommendation response is a structured projection with the
following canonical top-level shape. Future Wave 7
implementation MUST return this exact shape (modulo additive
optional fields under a future Founder-authorized amendment).

```text
BestPathRecommendationResponse:
  ok: true
  scenario_id: string
  recommended_at: string (ISO 8601)
  recommendation_mode: RecommendationMode (closed-vocab; see §6)
  recommended_candidate_key: string
  recommended_candidate_type: PlaygroundCandidateType (closed-vocab)
  recommended_candidate_title: string (≤120 chars; echoed)
  recommendation_summary: string (≤600 chars; closed-style)
  recommendation_reasons: RecommendationReason[] (closed-vocab; see §3)
  evidence_refs: string[] (SAFE projected metadata tokens)
  governance_findings: PlaygroundGovernanceFinding[] (echoed from Wave 6)
  required_reviews: PlaygroundRequiredReview[] (echoed from Wave 6)
  risk_findings: PlaygroundRiskFinding[] (echoed from Wave 6)
  dependency_findings: PlaygroundDependencyFinding[] (echoed from Wave 6)
  blocked_by_policy: boolean (echoed from Wave 6)
  action_runtime_transition_hint: PlaygroundTransitionHint (echoed)
  action_transition_readiness: ActionTransitionReadiness (closed-vocab; see §4)
  alternatives_considered: AlternativeConsidered[]
  not_recommended_reasons: ReasonNotRecommended[] (closed-vocab; see §5)
  confidence_label: PlaygroundConfidenceLabel (closed-vocab; LOW/MEDIUM/HIGH/INSUFFICIENT_DATA)
  human_decision_required: boolean
  honest_note: string
  audit_event_id: string
```

Each `AlternativeConsidered` carries 6 canonical fields:

- `candidate_key` — the deterministic SHA-256 16-char key
  from the Wave 5 candidate (echoed verbatim from Wave 6).
- `candidate_type` — closed-vocab from ADR-0072 §2.
- `candidate_title` — closed-template text from the Wave 5
  candidate; ≤120 chars; echoed verbatim.
- `reason_not_recommended` — closed-vocab from §5.
- `blocking_findings` — closed-vocab subset of the
  alternative's `risk_findings` + `dependency_findings` that
  factored into non-selection (max 8 items).
- `review_findings` — closed-vocab subset of the alternative's
  `required_reviews` (max 6 items).
- `confidence_label` — echoed verbatim from Wave 6.

### 2. The deterministic selection rule (v1 priority ladder)

Wave 7 v1 implementation MUST use the following deterministic
closed-vocabulary priority ladder. This is NOT a numeric
score, NOT a weighted ranking, NOT a hidden algorithm — it is
a sequence of closed-vocab gates evaluated in order. The
first gate that produces a unique winner returns it; if every
gate ties, the deterministic tie-breaker at §2.10 fires.

1. **Safety-blocking gate** — if every comparison-matrix item
   carries `blocked_by_policy === true` OR
   `action_runtime_transition_hint === "BLOCKED"`, the
   recommendation is the candidate of type
   `HUMAN_REVIEW_REQUIRED` if present; otherwise the
   candidate of type `DO_NOT_PROCEED` if present; otherwise
   the first matrix item by `candidate_key` lexical order
   with `recommendation_reason = DO_NOT_PROCEED_SELECTED_FOR_SAFETY`
   and `action_transition_readiness = BLOCKED`.
2. **Unblocked filter** — prefer candidates with
   `blocked_by_policy === false` AND
   `action_runtime_transition_hint !== "BLOCKED"`.
3. **Strongest governance alignment** — prefer candidates
   where the rubric `outcome_dimensions` entry for
   `GOVERNANCE_ALIGNMENT` rates `FAVORABLE`; fall back to
   `MIXED` only if no FAVORABLE candidate exists; otherwise
   skip to next gate.
4. **Lowest review burden** — prefer candidates with the
   fewest substantive entries in `required_reviews` (entries
   excluding `NO_ADDITIONAL_REVIEW_IDENTIFIED`).
5. **Lowest legal/compliance review need** — prefer
   candidates whose `required_reviews` do not include
   `LEGAL_REVIEW` and do not include `COMPLIANCE_REVIEW`.
6. **Lowest execution complexity** — prefer candidates where
   the rubric `outcome_dimensions` entry for
   `EXECUTION_COMPLEXITY` rates `FAVORABLE`.
7. **Strongest resilience / reversibility posture** —
   prefer candidates where the rubric `outcome_dimensions`
   entries for `RESILIENCE_IMPACT` and `REVERSIBILITY` rate
   `FAVORABLE`.
8. **Safety-bias incremental over speed** — when at least
   one candidate has `candidate_type = LOW_RISK_INCREMENTAL`
   and at least one has `candidate_type = SPEED_OPTIMIZED`,
   AND the governance / risk / review-burden signals are
   mixed (no clear unique winner from gates 3–7), prefer
   `LOW_RISK_INCREMENTAL`.
9. **Compliance-bias** — when at least one candidate has
   `candidate_type = COMPLIANCE_FIRST` and any candidate's
   `governance_findings` contains `LEGAL_REVIEW_RECOMMENDED`
   or `COMPLIANCE_REVIEW_RECOMMENDED`, prefer
   `COMPLIANCE_FIRST`.
10. **Insufficient-data bias** — when the dominant signal
    across the matrix is `confidence_label =
    INSUFFICIENT_DATA` for the majority of items, prefer
    `candidate_type = HUMAN_REVIEW_REQUIRED` if present;
    otherwise recommend with
    `recommendation_reason = INSUFFICIENT_DATA_RECOMMENDS_HUMAN_REVIEW`
    + `human_decision_required = true`.
11. **Deterministic tie-breaker** — if every preceding gate
    ties, sort the remaining candidates by `candidate_key`
    lexical order ASCENDING and return the first. This is a
    deterministic fallback for reproducibility — it is NOT a
    score, NOT a quality signal, and MUST be documented as
    such in any human-facing surface.

The priority-ladder gate that produced the winner determines
the populated `recommendation_reasons[]` set (per §3).
Multiple gates may contribute reasons (e.g., a candidate
chosen at gate 3 may also carry the "low review burden"
reason because it ALSO satisfies gate 4).

### 3. `recommendation_reasons` — closed vocabulary (v1)

Each `recommendation_reasons[]` entry is one of these 11
closed-vocab labels. Adding a new value requires a future
Founder-authorized ADR amendment here.

- `FEWEST_BLOCKING_FINDINGS`
- `STRONGEST_GOVERNANCE_ALIGNMENT`
- `LOWEST_REVIEW_BURDEN`
- `STRONGEST_RESILIENCE_POSTURE`
- `LOWEST_EXECUTION_COMPLEXITY`
- `HIGHEST_DATA_SCOPE_READINESS`
- `HIGHEST_CONNECTOR_READINESS`
- `CLEAREST_HUMAN_REVIEW_PATH`
- `SAFEST_INCREMENTAL_PATH`
- `DO_NOT_PROCEED_SELECTED_FOR_SAFETY`
- `INSUFFICIENT_DATA_RECOMMENDS_HUMAN_REVIEW`

### 4. `action_transition_readiness` — closed vocabulary (v1)

Each recommendation carries exactly one
`action_transition_readiness` value per ADR-0072 §1 +
ADR-0073 §1 transition-hint precedent extended for Wave 7.

- `NOT_READY`
- `MAY_PROPOSE_ACTION_LATER`
- `REQUIRES_HUMAN_DECISION`
- `REQUIRES_POLICY_REVIEW`
- `REQUIRES_APPROVAL_CHAIN`
- `REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW`
- `REQUIRES_CONNECTOR_CAPABILITY`
- `BLOCKED`

NOT a synonym for the recommendation itself being executed.
The transition from a Wave 7 recommendation to real work
MUST route through Section 2 Action runtime via Wave 8 +
ADR-0057 + appropriate approvals / policy review / dual
control where required.

### 5. `reason_not_recommended` — closed vocabulary (v1)

Each `AlternativeConsidered.reason_not_recommended` is one of
these 10 closed-vocab labels.

- `MORE_BLOCKING_FINDINGS`
- `MORE_REQUIRED_REVIEWS`
- `LOWER_GOVERNANCE_ALIGNMENT`
- `HIGHER_OPERATIONAL_RISK`
- `LOWER_DATA_SCOPE_READINESS`
- `LOWER_CONNECTOR_READINESS`
- `LESS_RESILIENT`
- `LESS_REVERSIBLE`
- `INSUFFICIENT_DATA`
- `NOT_SELECTED_THIS_ROUND`

### 6. `recommendation_mode` — closed vocabulary (v1)

Four closed-vocab modes that vary the priority-ladder
ordering at gates 3-9 while preserving gates 1, 2, 10, and
11 verbatim across all modes. Adding a new mode requires a
future Founder-authorized ADR amendment.

- `DETERMINISTIC_POLICY_FIRST` — DEFAULT at v1. Priority
  ladder as enumerated at §2.
- `DETERMINISTIC_GOVERNANCE_FIRST` — gate 3 (STRONGEST_GOVERNANCE_ALIGNMENT)
  fires before gate 4 (LOWEST_REVIEW_BURDEN); explicit when
  the operator wants to prioritize governance posture above
  review burden.
- `DETERMINISTIC_RESILIENCE_FIRST` — gate 7
  (RESILIENCE / REVERSIBILITY) fires before gate 6
  (EXECUTION_COMPLEXITY); explicit when the operator wants
  to prioritize operational resilience.
- `DETERMINISTIC_HUMAN_REVIEW_FIRST` — if any candidate has
  `candidate_type = HUMAN_REVIEW_REQUIRED`, that candidate
  is recommended verbatim; gates 3-9 only apply if no
  `HUMAN_REVIEW_REQUIRED` candidate is present.

All four modes are deterministic. NO numeric weights. NO
hidden ordering. NO LLM. NO Python. NO BEAM.

### 7. Scoring posture (v1)

Wave 7 v1 implementation MUST use closed-vocabulary signals
ONLY. The following are **forbidden** at this Wave:

- numeric ranking
- numeric scores of any kind
- probability of success
- ROI prediction
- legal sufficiency score
- employee performance score
- team performance score
- manager visibility score
- compliance certainty score
- hidden risk score
- psychological / personality scoring
- autonomous decision finality
- "AI decided" framing
- "execute automatically" framing

Allowed recommendation language (closed copy set):

- "recommended for human review"
- "best path for review"
- "recommended because"
- "requires review before action"
- "not executed"
- "not a legal determination"
- "may be proposed as an Action later"
- "requires governance approval before action"
- "human decision required"

Forbidden recommendation language (inherited from ADR-0070
§9 + ADR-0073 §7 extended for Wave 7):

- "guaranteed"
- "legally sufficient"
- "compliant"
- "regulator approved"
- "no fine risk"
- "AI approved"
- "execute this"
- "execute automatically"
- "final decision"
- "the system decided"
- "employee risk"
- "manager should intervene"
- "probability of success"
- "ROI"
- "score"
- "ranked #1"

The recommendation IS one selected candidate, but it is
explicitly labeled as advisory + requires human review.
Selection is NOT a winner declaration; it is a deterministic
projection that surfaces "this is the candidate the rubric
flagged for review first" without claiming objective
certainty.

### 8. Input sources (canonical at this ADR)

Future Wave 7 implementation MAY consume any subset of these
scoped, safe inputs. Every input is scope-bounded by
existing Foundation primitives (RULE 0 caller-scope; ADR-0059
same-org; ADR-0072 §4; ADR-0073 §8 — all inherited via Wave 6
→ Wave 5 → Wave 4 delegation).

1. **Wave 6 `ComparisonResponse` top-level fields** — all 11
   fields per ADR-0073 §1 (`scenario_id`, `compared_at`,
   `comparison_mode`, `candidate_count`, `comparison_matrix`,
   `tradeoff_summary`, `blocked_candidates_count`,
   `review_required_count`, `honest_note`, `audit_event_id`,
   `ok`).
2. **Wave 6 `ComparisonMatrixItem` fields** — all 13
   per-item fields per ADR-0073 §1.
3. **Wave 6 `TradeoffSummary`** — 4 closed-vocab
   `candidate_key` sets (NEVER a ranking).
4. **PlaygroundScenario safe metadata** — `scenario_id` +
   `status` (closed-vocab DRAFT/READY/ARCHIVED) +
   `scenario_type` (closed-vocab MANUAL/FIXTURE/
   FUTURE_GENERATED). NEVER raw `input_refs` / `constraints`
   / `expected_outputs` / `governance_findings` JSON;
   NEVER raw `title` / `description` / `goal_summary` text
   beyond what already lives in the SAFE candidate
   projection.
5. **Wave 5 closed-vocab candidate fields echoed through
   Wave 6** — `candidate_type` + `governance_findings[]` +
   `required_reviews[]` + `risk_findings[]` +
   `dependency_findings[]` + `blocked_by_policy` +
   `action_runtime_transition_hint` + `confidence_label` +
   `comparison_notes[]` (all SAFE).
6. **Wave 5/6 safe bounded text fields** — `candidate_title`
   + `candidate_summary` + `comparison_summary` +
   `honest_note`. These are template-driven closed-style
   text per ADR-0072 §1 + ADR-0073 §1 and are already SAFE
   projections by construction.

### 9. Forbidden inputs (universal at every Wave 7 surface)

The future Wave 7 implementation MUST NOT consume any of the
following:

- raw memory / capsule contents
- raw transcripts
- raw prompts
- chain-of-thought
- embeddings / vectors
- storage locations
- content hashes (`content_hash`, `embedding_content_hash`)
- bridge IDs
- `secret_ref` values or any secret material
- connector payloads
- connector credentials
- private employee behavior signals
- employee scores
- manager surveillance data
- psychological profiling
- cross-org data of any kind
- unrelated client / customer data outside the caller's
  scope
- privileged legal material
- raw audit details
- regulator-backdoor data
- raw scenario JSON internals
- caller-supplied recommendation rationale
- caller-supplied comparison payload
- caller-supplied candidate payload
- caller-supplied freeform instructions
- caller-supplied custom scoring weights

### 10. "Wave 7 calls Wave 6 internally" canonical decision

Wave 7 implementation MUST internally invoke the Wave 6
`PlaygroundOutcomeComparisonService.compareOutcomes` for the
same scenario id and the caller's session token. It MUST NOT
accept arbitrary caller-supplied comparison payloads or
candidate payloads.

Rationale:

- Trusting caller-supplied comparison payloads would create
  a raw-text injection surface (caller could submit
  fabricated comparison output bypassing the closed-vocab
  rubric library).
- Re-deriving the comparison deterministically from the
  scenario guarantees the recommendation reflects the same
  deterministic Wave 5 → Wave 6 → Wave 7 pipeline output the
  caller would receive from invoking each Wave route
  independently.
- ADR-0072 §1 + ADR-0073 §1 deterministic `candidate_key`
  is stable across regeneration so the recommendation is
  reproducible even though candidates and comparisons are
  not persisted.

If Wave 6 later adds `candidate_keys[]` filter support
(currently deferred per Wave 6 Founder QLOCK 2), Wave 7
MUST NOT introduce `candidate_keys[]` independently. v1
Wave 7 accepts only: `candidate_types?[]`, `max_candidates?`,
`comparison_mode?`, `recommendation_mode?`.

### 11. Bounded counts (canonical at this ADR)

- `candidates_considered_max` — recommended 8 (matches
  ADR-0073 §11 `candidates_per_comparison_max`).
- `recommendation_reasons_per_response_max` — 6.
- `evidence_refs_per_response_max` — 16.
- `governance_findings_per_response_max` — 11 (full ADR-0072
  §3 vocab).
- `required_reviews_per_response_max` — 9 (full ADR-0073 §5
  vocab).
- `risk_findings_per_response_max` — 12.
- `dependency_findings_per_response_max` — 12.
- `alternatives_considered_per_response_max` — 7 (cap-minus-1
  since one item is the recommended candidate).
- `not_recommended_reasons_per_response_max` — 6.
- `recommendation_summary_max_chars` — 600.
- `recommended_candidate_title_max_chars` — 120.

Exact values MAY be adjusted at the implementation slice;
the cap discipline is canonical at this ADR.

### 12. Implementation-method comparison (canonical at this ADR)

Three implementation options are enumerated so the future
Wave 7 implementation slice has a single canonical reference
for design tradeoffs:

#### 12.1. Option A — Deterministic TypeScript recommender-first

- **Where**: `apps/api/src/services/playground/` —
  additive `PlaygroundBestPathRecommendationService`
  alongside the existing Wave 5
  `PlaygroundCandidateService` and Wave 6
  `PlaygroundOutcomeComparisonService`.
- **Mechanism**: closed-vocab priority ladder mapping Wave 6
  comparison-matrix items → one recommended candidate +
  reasons. Deterministic: same comparison set → same
  recommendation.
- **Explainability**: total — every selected reason is
  traceable to a closed-vocab gate or signal.
- **Safety**: highest — no LLM autonomy, no hidden
  reasoning, no fabricated probabilistic claims, no winner-
  declaration framing beyond the explicit advisory posture.
- **ADR-0069 register**: TypeScript §2.1 (synchronous
  request/response).
- **No new dependency**: pure stdlib + existing Foundation
  primitives.
- **Recommended posture for first Wave 7 implementation
  slice.**

#### 12.2. Option B — Python AI service under Foundation governance

- **Where**: NEW Python service at a future boundary ADR per
  ADR-0069 §2.4.
- **Mechanism**: Python service consumes Foundation-scoped
  safe inputs + returns SAFE recommendation projections
  under policy/auth gate + audit emission.
- **Prerequisite**: future Founder-authorized boundary ADR
  per ADR-0069 §2.4 (same prerequisite as ADR-0072 §8.2 +
  ADR-0073 §12.2).
- **Coverage**: broader than Option A; can synthesize
  recommendations from input combinations the operators did
  not pre-encode (e.g., domain-specific tradeoff inference).
- **NOT authorized at this ADR.**

#### 12.3. Option C — BEAM-orchestrated multi-recommender

- **Where**: NEW BEAM service per ADR-0069 §3 domain 6 +
  ADR-0028 BEAM coordination layer.
- **Mechanism**: multi-agent orchestration of multiple
  scoped recommenders concurrently evaluating different
  modes; supervised processes; backpressure; fault
  isolation.
- **Prerequisite**: future Wave 9 multi-agent orchestration
  authorization per ADR-0065 §7 + ADR-0069 §6 architecture
  check.
- **NOT authorized at this ADR.** Folds into Wave 9.

#### 12.4. Recommended posture for v1 implementation

Deterministic / template-first TypeScript (Option A).
Python (Option B) and BEAM (Option C) are forward-substrate
behind their per-slice Founder authorizations + gating ADRs.
The deterministic baseline establishes the contract that any
later Option B / Option C implementation MUST satisfy.

### 13. Persistence posture

This ADR does NOT decide whether Wave 7 implementation MUST
persist recommendation output. The contract at §1 is the
output shape; persistence is a separate architectural
concern.

Recommended posture for the future Wave 7 implementation
slice:

- **Computed-on-read first** — the first Wave 7
  implementation SHOULD generate recommendations on-demand
  from re-derived Wave 6 comparisons without persisting.
  Mirrors Wave 5 + Wave 6 Option A posture.
- **Persistence later** — if persistence proves necessary
  (e.g., Wave 8 governed transition requires stable
  recommendation snapshots across sessions; or Control
  Tower frontend needs persistent recommendation history),
  a separate Founder-authorized ADR amendment + new schema
  slice MUST land.

NO schema change at this ADR. NO `PlaygroundBestPathRecommendation`
Prisma model. NO persistence helper.

### 14. Audit posture

This ADR adds NO new audit literal. Future Wave 7
implementation slices MUST reuse the canonical
`ADMIN_ACTION + details.action` discriminator pattern
(Wave 4 + Wave 5 + Wave 6 + Section 4 + Section 6 + Section
7 + ADR-0062 precedent).

Future Wave 7 implementation slice expectations:

- **Computed-on-read recommendation** — emits read-audit
  with `ADMIN_ACTION + details.action =
  "PLAYGROUND_BEST_PATH_RECOMMENDED"` with safe metadata
  only:
  - `scenario_id`
  - `recommendation_mode` (closed-vocab)
  - `candidate_count`
  - `recommended_candidate_key`
  - `recommended_candidate_type` (closed-vocab)
  - `blocked_by_policy` (boolean)
  - `human_decision_required` (boolean)
  - `action_transition_readiness` (closed-vocab)
- **NEVER** raw recommendation text in audit details.
- **NEVER** raw comparison text in audit details.
- **NEVER** raw candidate text in audit details.
- **NEVER** raw scenario JSON in audit details.
- **NEVER** legal / compliance conclusions in audit details.
- **NEVER** scores in audit details.

A new audit literal would only be required if the existing
`ADMIN_ACTION + details.action` discriminator proves
insufficient. This ADR explicitly projects that the
discriminator pattern is sufficient (Wave 5 + Wave 6
precedent).

### 15. Future route shape (canonical at this ADR)

The future Wave 7 implementation slice SHOULD register:

`POST /api/v1/playground/scenarios/:id/best-path-recommendations`

Request body (all optional):

- `candidate_types?: PlaygroundCandidateType[]` — passed
  through to the internal Wave 6 → Wave 5 call.
- `max_candidates?: number` — bounded by ADR-0072 §18 +
  ADR-0073 §11 cap (8).
- `comparison_mode?: PlaygroundComparisonMode` — default
  `DETERMINISTIC_RUBRIC` (passed through to Wave 6).
- `recommendation_mode?: RecommendationMode` — default
  `DETERMINISTIC_POLICY_FIRST` (per §6).

Forbidden request fields (NEVER accepted at v1):

- `candidate_keys[]` (deferred at Wave 6; Wave 7 MUST NOT
  introduce independently).
- caller-supplied candidate payloads.
- caller-supplied comparison payloads.
- caller-supplied recommendation rationale.
- freeform instructions.
- custom scoring weights.
- `execute` flag.
- `create_action` flag.
- `score` / `rank` / `winner` / any synonym field.

Response:

- 200: `BestPathRecommendationResponse` per §1.
- 404: `SCENARIO_NOT_FOUND` (enumeration-safe; inherited
  via Wave 6 → Wave 5 → Wave 4 delegation).
- 422: `INVALID_REQUEST` + `invalid_fields[]` for body-shape
  violations (invalid candidate_type / invalid max_candidates
  / invalid comparison_mode / invalid recommendation_mode).
- 401 / 403 / 500 inherited from the underlying service
  surface.

Bearer + "read" permission (mirrors Wave 5 / Wave 6 Option A
+ Wave 4 CRUD pattern).

### 16. Human-in-the-loop doctrine (universal)

Every recommendation response MUST include top-level
`honest_note` stating:

- recommendation is advisory
- recommendation is NOT a final decision
- recommendation has NOT been executed
- recommendation is NOT legal advice
- recommendation requires human / governance review before
  any real-world action
- transition to real work MUST go through Section 2 Action
  runtime via Wave 8 + ADR-0057

Every recommendation MUST set `human_decision_required` to
`true` UNLESS all of the following hold simultaneously:
(a) the recommendation is NOT
`HUMAN_REVIEW_REQUIRED`/`DO_NOT_PROCEED`,
(b) `blocked_by_policy === false`,
(c) `action_runtime_transition_hint !== "BLOCKED"`,
(d) `action_runtime_transition_hint !== "REQUIRES_HUMAN_DECISION"`,
(e) `confidence_label !== "INSUFFICIENT_DATA"`,
(f) `action_transition_readiness` is not in
`{NOT_READY, REQUIRES_HUMAN_DECISION, BLOCKED}`.

In practice the v1 priority ladder will surface
`human_decision_required = true` for most scenarios, which
is the correct conservative posture for a recommendation
surface that is not itself authorized to execute.

Wave 7 recommendation NEVER silently executes. Wave 7
NEVER creates Actions. Wave 7 NEVER bypasses governed
approval. Wave 7 NEVER claims final-decision authority.
Any transition from a Wave 7 recommendation to real work
MUST route through Section 2 Action runtime via Wave 8 +
ADR-0057.

### 17. No-leak doctrine (universal)

Every recommendation response MUST NOT expose:

- raw capsule content
- raw transcript
- raw prompt
- chain-of-thought
- raw audit details
- connector secrets
- connector payloads
- storage locations
- content hashes
- embeddings
- vectors
- bridge IDs
- permission internals (raw `Permission` row contents)
- hidden scoring (numeric scores or weights of any kind)
- numeric `score` / `rank` / `winner` / `probability` /
  `roi` field names
- employee identity unless explicitly in-scope per the
  caller's COSMP permission AND safely projected
- cross-org data
- privileged legal material
- regulator-backdoor data

The future Wave 7 implementation slice MUST include a
no-leak guard test enforcing every forbidden field substring
against an adversarial fixture set (mirrors Wave 5 + Wave 6
Option A precedent at
`tests/integration/playground-candidates.test.ts` +
`tests/integration/playground-outcome-comparisons.test.ts`).

### 18. RULE 0 + same-org boundary (universal)

Every Wave 7 surface MUST enforce:

- **Caller scope only** — recommendation reads only
  comparison output produced from a scenario the caller
  owns; no privileged cross-entity recommendation at the v1
  register.
- **Same-org boundary** — cross-org comparison inputs are
  forbidden per ADR-0059 + ADR-0037 + ADR-0061; enforcement
  is inherited via Wave 6 → Wave 5 → Wave 4 delegation.
- **Owner-first scenario scope** — Wave 7 implementation
  MUST verify the caller owns the parent
  `PlaygroundScenario` (per Wave 4 + Wave 5 + Wave 6
  owner-first precedent) before generating the
  recommendation. No cross-owner recommendation at the v1
  register.

### 19. Substrate-coherence law alignment (ADR-0069)

Per ADR-0069 §6 mandatory 8-question architecture check, the
v1 Wave 7 implementation slice belongs at the TypeScript
§2.1 register:

1. **Concurrency / long-running**: NO. Synchronous
   request/response shape.
2. **Supervision / fault isolation**: NO. Pure projection
   from existing primitives.
3. **Backpressure / streaming**: NO.
4. **Multi-agent coordination**: NO at v1; Wave 9
   forward-substrate.
5. **Event-driven flow**: NO at v1.
6. **High-throughput**: NO at v1; bounded by scenario count
   per caller + candidate-count cap.
7. **Cross-system coordination**: NO.
8. **Intelligence-heavy computation**: NO at v1
   (deterministic priority ladder). Option B Python belongs
   at §2.4 register under a future boundary ADR.

V1 register: TypeScript synchronous workflow under
Foundation governance.

### 20. Wave-map alignment (preserves ADR-0065 §7 + ADR-0072 §15 + ADR-0073 §20)

Wave 7 contract MUST NOT accidentally implement Wave 8 / 9 /
10:

- **Wave 8** (governed transition to Action plan): Wave 7
  recommendation carries `action_transition_readiness` per
  §4 but NEVER an unexecuted Action payload. Wave 8
  translates a selected recommendation + caller confirmation
  into an Action plan submitted to Section 2 Action
  runtime; Wave 7 NEVER creates that Action plan or invokes
  Section 2.
- **Wave 9** (multi-agent orchestration): Wave 7 v1 is
  single-pass deterministic; Wave 9 is multi-agent
  orchestration per ADR-0069 §3 domain 6 + ADR-0028 +
  ADR-0065 §7.
- **Wave 10** (Control Tower frontend consumer): lives in
  the `otzar-control-tower` repo; Foundation owns the
  contract.

### 21. Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline, Wave 7
best-path recommender contract contributes patent-evidence-
bearing material at three patents:

- **US 12,517,919 (COSMP)** — best-path recommendation
  consumes Wave 6 comparison output that is itself
  scope-bounded by caller's COSMP permission. The governed-
  substrate boundary distinguishes NIOV's Agent Playground
  from any unauthorized parallel build at the "uncontrolled
  enterprise AI recommendation" claim register.
  Cryptographically-timestamped Wave 5 → Wave 6 → Wave 7 →
  Wave 8 pipeline lineage on `main`.
- **US 12,164,537 (DMW)** — enterprise-wallet-derived
  signals inherited verbatim from Wave 6; same-org-scoped
  per ADR-0059.
- **US 12,399,904 (Foundation primitives)** —
  recommendation carries `action_transition_readiness` per
  §4; transition from recommended candidate to real work
  routes through Section 2 Action runtime via Wave 8 +
  ADR-0057. Every layer of the Wave 5 → Wave 6 → Wave 7 →
  Wave 8 pipeline is governed-substrate-evident.

### 22. Future generalization (long-term trust-governed mapping context)

This section is **strategic context only**. It does NOT
authorize personal-life automation, consumer Otzar
execution, trust-level delegation logic, autonomous
execution, or any non-enterprise Wave 7 implementation. Per
the Founder addendum (2026-05-31), it preserves the
architecture so future trust-governed life decision support
can compose against the same governed substrate WITHOUT
losing human sovereignty.

Agent Playground is currently the enterprise scenario
substrate per ADR-0052 Otzar DGI doctrine. The deeper
architectural pattern surfaced by Wave 5 → Wave 6 → Wave 7
generalizes:

```text
enterprise pattern (LIVE):
  scenario → candidates → comparison → recommendation →
  human/governance review → governed Action transition

future personal-life pattern (NOT authorized; design-only
strategic context):
  life situation → possible paths → emotional/practical
  comparison → trusted recommendation → consent/trust level
  → personal action
```

Architecture preserved by Wave 7 design that makes future
trust-governed life decision support possible WITHOUT
breaking sovereignty:

- Clear recommendation boundaries (§1 contract; §16
  human-in-the-loop).
- Explicit `human_decision_required` state (§16) at every
  recommendation.
- NO hidden scoring (§7); NO autonomous-decision-finality
  framing (§7); NO unbounded autonomy.
- Recommendation separate from execution (§10 + §16 + §20).
- Transition to action governed separately via Wave 8 +
  Section 2 Action runtime + ADR-0057.
- Audit / evidence / explanation preserved by closed-vocab
  `evidence_refs` + `recommendation_reasons` + audit
  metadata (§14).
- User / entity sovereignty preserved via RULE 0 + same-org
  boundary (§18).

A future Founder-authorized ADR may eventually extend this
pattern to personal trust-governed mapping; that ADR is NOT
this one. ADR-0074 v1 implementation is enterprise-only.

### 23. Explicit non-goals at this commit

NO code in this commit. NO schema migration. NO new routes.
NO new audit literal. NO service-method signature change.
NO LLM generation. NO model calls. NO Python services. NO
BEAM orchestration. NO best-path recommender engine
implementation. NO scoring engine. NO numeric ranking. NO
governed-transition implementation (Wave 8 forward-
substrate). NO Action creation. NO connector invocation. NO
external provider calls. NO Control Tower frontend. NO
multi-agent simulation runtime. NO candidate persistence. NO
comparison persistence. NO recommendation persistence. NO
personal-life automation. NO trust-level delegation logic.
NO consumer Otzar execution. NO CLAUDE.md bulk catalog
edit. NO bulk rewrite of older ADRs. NO current active
slice derailment.

## Consequences

### Easier after this ADR

- Future Wave 7 implementation slices have a single
  canonical contract reference. The §1 recommendation-
  response shape + §2 deterministic priority ladder + §3 /
  §4 / §5 / §6 closed vocabularies + §7 scoring posture +
  §8 / §9 allowed/forbidden input set + §15 future route
  shape + §16 human-in-the-loop + §17 no-leak + §18 RULE 0
  universal are stable design contracts; the implementation
  slice does not re-litigate per slice.
- The §12 three-method comparison forward-queues Option B
  (Python) and Option C (BEAM) at explicit ADR-0069 §2.4 /
  §2.3 registers with their gating ADRs named.
- ADR-0073 stays correctly bounded at the Wave 6 outcome-
  comparison contract; ADR-0065 stays correctly bounded at
  product-vision tier; ADR-0074 sits at the contract tier
  between them.
- The §10 "Wave 7 calls Wave 6 internally" canonical
  decision prevents caller-supplied raw payloads from ever
  entering the recommendation pipeline.
- §22 preserves the architecture for future trust-governed
  life decision support without authorizing personal-life
  automation at this ADR — separates strategic context from
  active scope cleanly.

### Harder after this ADR

- The §1 recommendation-response shape is canonical. Future
  Wave 7 implementation slices that need a new required
  top-level field require explicit Founder authorization +
  ADR amendment.
- The §2 priority ladder is canonical. Reordering gates
  requires a future ADR amendment or new
  `recommendation_mode` value (also requires an amendment).
- The §3 / §4 / §5 / §6 closed vocabularies are canonical.
  Adding new values requires a future ADR amendment.
- The §7 scoring posture forbids numeric scoring + winner-
  declaration framing at this Wave; the recommendation is
  explicitly framed as advisory + requires human review.
- The §10 internal-call decision means callers cannot
  supply their own comparison or candidate payloads — this
  is intentional but may surprise implementers expecting a
  generic recommend-arbitrary-things endpoint.
- The §11 bounded counts are canonical at the discipline
  register; exact values may move at the implementation
  slice but the cap discipline is locked.
- §22 explicitly disclaims personal-life automation
  authorization — implementers proposing consumer or
  trust-delegation work MUST surface a separate Founder
  authorization per RULE 20.

### Substrate-state catches resolved

- ADR-0065 §7 Wave 7 forward-queue line referenced "best-
  path recommender with evidence and governance findings"
  without locking the contract; the contract is now
  canonical at ADR-0074 §1.
- ADR-0073 §20 explicitly forbids Wave 6 from selecting a
  winner; ADR-0074 §20 mirrors the discipline in reverse
  (Wave 7 MUST NOT accidentally implement Wave 8 / 9 / 10).
- ADR-0073 §11 + §16 human-in-the-loop doctrine is extended
  at ADR-0074 §16 with the Wave 7-specific
  `human_decision_required` boolean + explicit
  not-a-final-decision clause.

## Forward queue

Each forward-substrate slice requires separate Founder
authorization at its slice prompt:

- **Wave 7 implementation slice (Option A; deterministic /
  template-first TypeScript)** —
  `PlaygroundBestPathRecommendationService` + `POST
  /api/v1/playground/scenarios/:id/best-path-recommendations`
  (computed-on-read; internally invokes
  `PlaygroundOutcomeComparisonService.compareOutcomes`) +
  read-audit `ADMIN_ACTION + details.action =
  "PLAYGROUND_BEST_PATH_RECOMMENDED"` + ≥25 integration
  tests + no-leak guard + closed-vocab priority ladder +
  4-value `recommendation_mode` set + bounded counts +
  same-org SCENARIO_NOT_FOUND delegation.
- **Wave 7 persistence slice (if §13 proves necessary)** —
  `PlaygroundBestPathRecommendation` Prisma model + safe
  CRUD + audit emission on persistence boundary + ADR-0074
  amendment locking persistence shape.
- **Wave 7 Option B Python-backed implementation slice** —
  requires: (a) dedicated Python service boundary ADR per
  ADR-0069 §2.4; (b) explicit Founder authorization at the
  Python slice; (c) ADR-0074 §12.2 prerequisites verified.
- **Wave 7 Option C BEAM-orchestrated implementation
  slice** — folds into ADR-0065 §7 Wave 9 (multi-agent
  simulation orchestration); requires ADR-0069 §6 mandatory
  8-question architecture check.
- **Wave 8** (governed transition to Section 2 Action
  runtime) — separate Founder slice per ADR-0065 §7.
- **Wave 9** (multi-agent simulation orchestration) —
  separate Founder slice per ADR-0065 §7 + ADR-0069 §3
  domain 6.
- **Wave 10** (Control Tower frontend consumer) — separate
  Founder slice per ADR-0065 §7; lives in
  `otzar-control-tower` repo.
- **Future trust-governed life decision support (§22
  strategic context only)** — separate Founder ADR + new
  authorization tier required; ADR-0074 does NOT authorize
  any personal-life automation.

## Bidirectional citations

- Cites RULE 0, RULE 4, RULE 10, RULE 12, RULE 13, RULE 19,
  RULE 20, RULE 21.
- Cites ADR-0001 (three-wallet architecture; RULE 0 source).
- Cites ADR-0002 (append-only audit chain; audit emission
  discipline).
- Cites ADR-0020 (two-register IP discipline; §21 patent-
  implementation evidence).
- Cites ADR-0026 (dual-control middleware; future approval-
  chain interaction via Wave 8).
- Cites ADR-0028 (BEAM coordination layer; §12.3 Option C
  prerequisite).
- Cites ADR-0036 (LawfulBasis; regulator-scope inheritance
  via Wave 5/6 candidate-input set).
- Cites ADR-0037 (jurisdiction tagging; §18 same-org
  boundary).
- Cites ADR-0048 (COE personalization-orchestration
  substrate; future scenario-tier integration NOT
  authorized at this ADR).
- Cites ADR-0049 (GOVSEC umbrella; security controls at
  every Wave 7 tier).
- Cites ADR-0050 (break-glass; future Wave 8 transitions
  may need break-glass paths; out of Wave 7 scope).
- Cites ADR-0052 (Otzar DGI doctrine; parent product
  doctrine).
- Cites ADR-0057 (Action runtime; §15 + §16 + §20 +
  transition through Section 2 via Wave 8).
- Cites ADR-0058 §7 (SAFE projection pattern; §17 no-leak
  posture inherited).
- Cites ADR-0059 (Section 3 Hives v1; §18 same-org
  boundary).
- Cites ADR-0060 (Section 5 Wave 1 inspector foundation;
  this ADR sits ABOVE ADR-0060 at the contract register).
- Cites ADR-0061 (Section 6 analytics SAFE projection
  precedent for closed-vocab + metadata-only audit).
- Cites ADR-0063 (governance_terms evaluator; closed-vocab
  vocabulary precedent).
- Cites ADR-0065 (long-term product vision; this ADR closes
  ADR-0065 §7 Wave 7 forward-queue line at the contract
  register; bidirectional back-citation lands in ADR-0065
  §Forward queue Wave 7 entry per RULE 14 + RULE 20).
- Cites ADR-0068 (proactivity precedent; `candidate_key`
  deterministic-hash pattern reused at Wave 5 + carried
  through to Wave 6 + 7).
- Cites ADR-0069 (BEAM substrate-coherence law; §12 three-
  method comparison + §19 8-question architecture check;
  bidirectional back-citation lands in ADR-0069 §Forward
  queue per RULE 14 + RULE 20).
- Cites ADR-0070 (regulator-ready doctrine; §7 scoring
  posture + §17 no-leak inherit §9 legal-advice boundary
  verbatim + extended for Wave 7; bidirectional back-
  citation lands in ADR-0070 §Forward queue per RULE 14 +
  RULE 20).
- Cites ADR-0071 (Section 7 cross-scope verify-chain; not
  consumed at this Wave; preserved for future regulator-
  tier audit-metadata inheritance).
- Cites ADR-0072 (Wave 5 candidate-generation contract;
  consumed transitively via Wave 6; bidirectional back-
  citation lands in ADR-0072 §Forward queue per RULE 14 +
  RULE 20).
- Cites ADR-0073 (Wave 6 outcome-comparison contract; this
  ADR sits ABOVE ADR-0073 at the contract register; Wave 7
  consumes the Wave 6 `ComparisonResponse` verbatim;
  bidirectional back-citation lands in ADR-0073 §Forward
  queue per RULE 14 + RULE 20).
- Cited from ADR-0060 §Forward queue (Wave 7 best-path
  recommender; bidirectional back-citation discipline).
- Cited from ADR-0065 §Forward queue Wave 7 entry
  (bidirectional back-citation discipline; ADR-0074 closes
  the Wave 7 forward-queue line at the contract register).
- Cited from ADR-0069 §Forward queue (Wave 7 v1 TypeScript
  register confirmation; Option B Python / Option C BEAM
  forward-substrate references).
- Cited from ADR-0070 §Forward queue (Wave 7 legal-advice
  boundary inheritance + extension; §9 vocabulary preserved
  verbatim at ADR-0074 §7).
- Cited from ADR-0072 §Forward queue (Wave 7 as the next
  scenario-tier projection above Wave 6 outcome
  comparison).
- Cited from ADR-0073 §Forward queue (Wave 7 as the next
  scenario-tier projection above Wave 6 comparison; ADR-0074
  closes ADR-0073's "best-path recommendation is Wave 7"
  deferral at the contract register).

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citations in
ADR-0065 / ADR-0069 / ADR-0070 / ADR-0072 / ADR-0073 + the
architecture/README.md catalog entry + the Section 5
build-state doc update + the NEXT_ACTION.md baton update
land under explicit Founder authorization at
`[FOUNDER-SECTION-5-WAVE-7-BEST-PATH-RECOMMENDER-CONTRACT-ADR-AUTH]`
2026-05-31. The authorization is **ADR-only** — the future
Wave 7 implementation slice (Option A deterministic
TypeScript) requires separate Founder authorization at its
slice. Option B (Python) requires a dedicated Python service
boundary ADR per ADR-0069 §2.4 + separate Founder
authorization. Option C (BEAM) requires ADR-0065 §7 Wave 9
authorization + ADR-0069 §6 architecture check.

§22 future generalization is **strategic context only** per
the Founder addendum (2026-05-31). It does NOT authorize
personal-life automation, consumer Otzar execution, trust-
level delegation logic, autonomous execution, or any
non-enterprise Wave 7 implementation. A future Founder-
authorized ADR is required before any of those slices may
land.
