# ADR-0073: Agent Playground Outcome-Comparison Contract — Section 5 Wave 6 (Design-Only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-SECTION-5-WAVE-6-OUTCOME-COMPARISON-CONTRACT-ADR-AUTH]`
2026-05-31.

This ADR is **design-only**. NO code, NO schema migration, NO
new routes, NO new audit literal, NO service-method signature
change, NO LLM autonomy, NO model calls, NO Python services,
NO BEAM orchestration, NO outcome-comparison engine
implementation, NO scoring engine, NO best-path recommender,
NO governed transition to the Action runtime, NO Action
creation, NO connector invocation, NO external provider calls,
NO Control Tower frontend, NO multi-agent simulation runtime,
NO candidate persistence, NO CLAUDE.md bulk catalog edit, NO
current active slice derailment in this commit.

Sits ABOVE ADR-0072 (Section 5 Wave 5 candidate-generation
contract) and BELOW ADR-0065 (long-term product vision) at the
**contract register**: ADR-0065 §7 forward map enumerates
Wave 6 as "outcome comparison + scoring rubric. Closed-
vocabulary; NO employee scoring; NO probabilistic-claim
fabrication. Contract: N candidates → comparison matrix."
ADR-0072 §15 explicitly forbids Wave 5 from accidentally
implementing Wave 6. This ADR locks the contract that any
future Wave 6 implementation slice MUST satisfy.

## Context

### Why Wave 6 needs its own design ADR

ADR-0065 §7 forward-queues Wave 6 in two sentences:
*"outcome comparison + scoring rubric. Closed-vocabulary; NO
employee scoring; NO probabilistic-claim fabrication.
Contract: N candidates → comparison matrix."* That framing is
correct at the product-vision register but does not lock the
comparison-matrix shape, the closed vocabularies (outcome
dimensions, dimension ratings, risk findings, dependency
findings, required reviews), the comparison-mode set, the
scoring posture, the allowed/forbidden language, the persistence
boundary, or the audit / no-leak surfaces.

ADR-0072 §15 explicitly forbids Wave 5 from carrying a
numerical score or a recommended-best flag — Wave 5 candidates
carry `confidence_label` (an honest closed-vocab signal) and
`governance_findings` / `required_approvals` but never a
ranking. Wave 6 is the natural projection layer on top:
N candidates → a closed-vocabulary comparison matrix that
surfaces tradeoffs WITHOUT picking a winner (winner selection
is Wave 7 best-path recommender per ADR-0065 §7).

ADR-0073 sits at the contract tier between ADR-0072 (Wave 5
candidate-generation contract) and ADR-0065 (long-term product
vision). It locks **what a comparison matrix IS** so the future
Wave 6 implementation slice (deterministic-TS first; Python-
backed later; BEAM-orchestrated later) can be authorized
against a stable contract instead of re-litigating per slice.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `aca9a71`:

- **Section 5 today**: Wave 1 ADR-0060 + Wave 2 inspector LIVE
  (PR #100) + Wave 3 ADR-0065 product-vision + Wave 4 LIVE
  (PR #111) + Wave 5 contract ADR-0072 LANDED + **Wave 5
  Option A deterministic / template-first TypeScript LIVE**
  (PR #136 `e708fa7`; NEW `PlaygroundCandidateService` + NEW
  route `POST /api/v1/playground/scenarios/:id/candidates` +
  33 integration tests).
- **Wave 5 candidate output shape**: `GenerateCandidatesSuccess =
  { ok, scenario_id, candidates[], generated_at,
  audit_event_id }`. Each `PlaygroundCandidateView` (per
  ADR-0072 §1) carries 17 SAFE fields: `candidate_key` +
  `scenario_id` + `candidate_title` + `candidate_summary` +
  `candidate_type` + `assumptions[]` + `required_inputs[]` +
  `expected_benefits[]` + `known_risks[]` + `dependencies[]` +
  `governance_findings[]` + `required_approvals[]` +
  `blocked_by_policy` + `action_runtime_transition_hint` +
  `evidence_refs[]` + `confidence_label` + `honest_note`. All
  fields are closed-vocabulary or template-driven; raw
  scenario JSON is NEVER projected into candidates by
  construction.
- **PlaygroundScenarioService.getScenario** is the canonical
  owner-first + same-org enumeration-safe SCENARIO_NOT_FOUND
  gate; Wave 6 implementation delegates to it via
  `PlaygroundCandidateService` (transitively), so cross-owner
  / cross-org / unknown id all fold to 404 without
  re-implementation.
- **ADR-0072 §13 audit posture**: `ADMIN_ACTION +
  details.action = "PLAYGROUND_CANDIDATES_GENERATED"` for
  Wave 5; safe metadata only. Wave 6 follows the same
  discriminator pattern with `details.action =
  "PLAYGROUND_OUTCOMES_COMPARED"` per Founder paste; ZERO new
  audit literal at the ADR.
- **ADR-0069 substrate-coherence law LIVE**: TypeScript owns
  API contracts + synchronous workflows; Python owns
  intelligence-heavy computation under Foundation governance
  (boundary ADR per §2.4 required before first slice); BEAM
  owns living coordination + multi-agent orchestration
  (Wave 9 fit per §3 domain 6).
- **ADR-0070 §9 legal-advice boundary LIVE**: allowed copy
  ("compliance review recommended" / "policy review required"
  / "not a legal determination" / etc.) vs forbidden copy
  ("legally sufficient" / "guaranteed compliant" / "regulator
  approved" / etc.) applies to every Wave 6 output field
  verbatim.

The substrate to support deterministic Wave 6 outcome
comparison exists today at the foundational tier. The missing
piece is the contract — which is what this ADR locks.

### Patent + doctrine alignment

- **US 12,517,919 (COSMP)** — outcome comparison consumes
  Wave 5 candidate output that is itself scope-bounded by
  caller's COSMP permission (RULE 0 + ADR-0072 §16
  same-org). No privileged cross-entity reads at the
  comparison tier.
- **US 12,164,537 (DMW)** — enterprise-wallet boundaries
  inherited verbatim from Wave 5 (no cross-org candidate
  inputs reach Wave 6).
- **US 12,399,904 (Foundation primitives)** — outcome
  comparison produces an unexecuted matrix; every transition
  from a candidate in the matrix to real work MUST route
  through Section 2 Action runtime via ADR-0072 §1
  `action_runtime_transition_hint` + ADR-0065 §7 Wave 8 +
  Section 2 (ADR-0057). Wave 6 NEVER selects a winner —
  selection is Wave 7's job, and execution is Section 2's.
- **ADR-0052 Otzar DGI doctrine** — Agent Playground is the
  DGI substrate; outcome comparison is the layer that helps
  humans understand tradeoffs before recommendation
  (Wave 7) and execution (Wave 8). NEVER autonomous
  decision-making at Wave 6.
- **ADR-0069 BEAM substrate-coherence law** — Wave 6 v1
  belongs at TypeScript §2.1 register (synchronous
  request/response; deterministic rubric). Wave 9 multi-
  agent comparison orchestration is the BEAM-fit forward
  slice per §3 domain 6.
- **ADR-0070 regulator-ready doctrine** — Wave 6 honors §9
  legal-advice boundary verbatim; allowed compliance/legal
  copy is closed-vocabulary; forbidden copy is enforced by
  closed-vocab templates.

## Decision

Foundation canonicalizes the **outcome-comparison contract**
for Agent Playground Wave 6. A comparison matrix is a
bounded, closed-vocabulary projection over N Wave 5 candidates
that surfaces tradeoffs, risks, dependencies, governance
findings, and required reviews per candidate WITHOUT selecting
a winner, fabricating probabilistic claims, producing employee
scoring, producing legal conclusions, or producing autonomous
decisions. Wave 6 comparison NEVER executes, NEVER creates
Actions, NEVER ranks candidates numerically, and NEVER
recommends a "best" path — those are Wave 7 / Wave 8 forward-
substrate.

### 1. What a comparison matrix IS (contract)

A comparison response is a structured projection with the
following canonical top-level shape. Future Wave 6
implementation MUST return this exact shape (modulo additive
optional fields under a future Founder-authorized amendment).

```text
ComparisonResponse:
  ok: true
  scenario_id: string
  compared_at: string (ISO 8601)
  comparison_mode: ComparisonMode (closed-vocab; see §6)
  candidate_count: number
  comparison_matrix: ComparisonMatrixItem[]
  tradeoff_summary: TradeoffSummary
  blocked_candidates_count: number
  review_required_count: number
  honest_note: string
```

Each `ComparisonMatrixItem` carries 13 canonical fields:

- `candidate_key` — the deterministic SHA-256 16-char key
  from the Wave 5 candidate this matrix item compares (per
  ADR-0072 §1). Stable across regeneration so the matrix is
  reproducible.
- `candidate_type` — closed-vocab from ADR-0072 §2 (9
  values); echoed from the Wave 5 candidate verbatim.
- `candidate_title` — closed-template text from the Wave 5
  candidate; ≤120 chars; NEVER raw scenario text.
- `comparison_summary` — closed-style short paragraph (≤600
  chars) summarizing how this candidate stacks up against
  the other candidates in the matrix at the closed-
  vocabulary rubric tier. NEVER raw capsule content; NEVER
  prompt fragments; NEVER chain-of-thought; safe paraphrase
  only.
- `outcome_dimensions[]` — closed-vocab outcome-dimension
  evaluations per §2; bounded count: max 12.
- `risk_findings[]` — closed-vocab risk findings per §3;
  bounded count: max 12.
- `dependency_findings[]` — closed-vocab dependency
  findings per §4; bounded count: max 12.
- `governance_findings[]` — echoed verbatim from the Wave 5
  candidate's `governance_findings` (ADR-0072 §3 closed
  vocab; 11 values).
- `required_reviews[]` — closed-vocab review categories
  per §5; bounded count: max 9.
- `blocked_by_policy` — echoed verbatim from the Wave 5
  candidate.
- `action_runtime_transition_hint` — echoed verbatim from
  the Wave 5 candidate (ADR-0072 §5 closed vocab; 7 values).
- `confidence_label` — echoed verbatim from the Wave 5
  candidate (ADR-0072 §7 closed vocab; 4 values).
- `comparison_notes[]` — closed-vocab note labels per §6.2
  expanding on the matrix item's relative posture (e.g.,
  `MORE_REVIEW_NEEDED_THAN_AVERAGE`,
  `LOWER_OPERATIONAL_COMPLEXITY`,
  `HIGHER_CONNECTOR_READINESS`,
  `INSUFFICIENT_DATA_RELATIVE_TO_PEERS`); bounded count:
  max 8.
- `honest_note` — explicit string echoing the Wave 5
  candidate `honest_note` PLUS the Wave 6 comparison-
  specific clause (advisory; not a decision; not executed;
  not legal advice; does not select a winner; requires
  human/governance review before action). Implementation
  MAY use a small canonical set of closed-vocab strings.

`TradeoffSummary` carries 4 closed-vocab fields (no numeric
scores; no winner selection):

- `candidates_favoring_governance: string[]` — list of
  `candidate_key` values whose `governance_findings` lean
  toward `POLICY_ALLOWED` and away from `DO_NOT_EXECUTE` /
  `POLICY_REVIEW_REQUIRED`.
- `candidates_favoring_resilience: string[]` — list of
  `candidate_key` values whose Wave 5 `candidate_type` is
  `OPERATIONAL_RESILIENCE` or whose `risk_findings[]` set
  contains `OPERATIONAL_RESILIENCE_RISK` at a `FAVORABLE`
  outcome-dimension rating.
- `candidates_with_blocking_signals: string[]` — list of
  `candidate_key` values where `blocked_by_policy === true`
  OR `action_runtime_transition_hint === "BLOCKED"`.
- `candidates_requiring_human_decision: string[]` — list of
  `candidate_key` values where `action_runtime_transition_
  hint === "REQUIRES_HUMAN_DECISION"` OR any
  `required_reviews[]` entry is `HUMAN_OWNER_REVIEW` /
  `POLICY_OWNER_REVIEW` / `LEGAL_REVIEW` / `COMPLIANCE_REVIEW`.

`TradeoffSummary` is NEVER a ranking. The lists are sets of
candidate_keys (not ordered by score); they help humans
discriminate between candidates without implying a winner.

### 2. `outcome_dimensions` — closed vocabulary (v1)

Each `outcome_dimensions[]` item is `{ dimension:
OutcomeDimension, rating: DimensionRating }`. The vocabularies
are locked at this ADR; adding a new value requires a future
Founder-authorized ADR amendment.

**Outcome dimensions (12 values):**

- `GOVERNANCE_ALIGNMENT`
- `EXECUTION_COMPLEXITY`
- `OPERATIONAL_RISK`
- `COMPLIANCE_REVIEW_NEED`
- `HUMAN_REVIEW_NEED`
- `DATA_SCOPE_READINESS`
- `CONNECTOR_READINESS`
- `CUSTOMER_OR_STAKEHOLDER_IMPACT`
- `COST_SENSITIVITY`
- `SPEED_TO_EXECUTION`
- `RESILIENCE_IMPACT`
- `REVERSIBILITY`

**Dimension rating (5 values):**

- `FAVORABLE`
- `MIXED`
- `UNFAVORABLE`
- `INSUFFICIENT_DATA`
- `NOT_APPLICABLE`

Ratings are honest closed-vocabulary signals. NO numeric
scoring. NO probability. NO "weight." If the deterministic
rubric cannot evaluate a dimension from the candidate's closed-
vocab fields, the rating MUST be `INSUFFICIENT_DATA` (NEVER a
fabricated rating).

### 3. `risk_findings` — closed vocabulary (v1)

- `POLICY_RISK`
- `COMPLIANCE_REVIEW_RISK`
- `LEGAL_REVIEW_RISK`
- `DATA_SCOPE_RISK`
- `CONNECTOR_READINESS_RISK`
- `EXECUTION_COMPLEXITY_RISK`
- `OPERATIONAL_RESILIENCE_RISK`
- `STAKEHOLDER_IMPACT_RISK`
- `INSUFFICIENT_INFORMATION_RISK`
- `HUMAN_DECISION_REQUIRED_RISK`

Adding a new value requires a future ADR amendment.

### 4. `dependency_findings` — closed vocabulary (v1)

- `REQUIRES_POLICY_REVIEW`
- `REQUIRES_APPROVAL_CHAIN`
- `REQUIRES_DUAL_CONTROL`
- `REQUIRES_CONNECTOR_CAPABILITY`
- `REQUIRES_DATA_SCOPE_EXPANSION`
- `REQUIRES_HUMAN_DECISION`
- `REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW`
- `REQUIRES_ACTION_RUNTIME`
- `REQUIRES_ADDITIONAL_CONTEXT`
- `NO_BLOCKING_DEPENDENCY_IDENTIFIED`

Adding a new value requires a future ADR amendment.

### 5. `required_reviews` — closed vocabulary (v1)

- `HUMAN_OWNER_REVIEW`
- `POLICY_OWNER_REVIEW`
- `COMPLIANCE_REVIEW`
- `LEGAL_REVIEW`
- `SECURITY_REVIEW`
- `DATA_GOVERNANCE_REVIEW`
- `CONNECTOR_ADMIN_REVIEW`
- `ACTION_APPROVER_REVIEW`
- `NO_ADDITIONAL_REVIEW_IDENTIFIED`

Adding a new value requires a future ADR amendment.

### 6. Comparison modes

#### 6.1. `comparison_mode` — closed vocabulary (v1)

- `DETERMINISTIC_RUBRIC` — the only mode supported at v1.
  Deterministic mapping from Wave 5 candidate closed-vocab
  fields → outcome dimension ratings, risk findings,
  dependency findings, and required reviews via a closed
  template library.
- `CANDIDATE_FIELD_PROJECTION` — opt-in alternate mode that
  projects candidate fields verbatim into the matrix
  without any deterministic rubric inference. Useful for
  testing / fixture-only flows. Available at v1
  implementation but the default is `DETERMINISTIC_RUBRIC`.

Adding a new mode requires a future Founder-authorized ADR
amendment.

#### 6.2. `comparison_notes` — closed vocabulary (v1)

Per-matrix-item note labels expanding on relative posture:

- `MORE_REVIEW_NEEDED_THAN_AVERAGE`
- `LESS_REVIEW_NEEDED_THAN_AVERAGE`
- `LOWER_OPERATIONAL_COMPLEXITY`
- `HIGHER_OPERATIONAL_COMPLEXITY`
- `HIGHER_CONNECTOR_READINESS`
- `LOWER_CONNECTOR_READINESS`
- `MORE_REVERSIBLE_THAN_AVERAGE`
- `LESS_REVERSIBLE_THAN_AVERAGE`
- `INSUFFICIENT_DATA_RELATIVE_TO_PEERS`
- `BLOCKED_BY_POLICY_OR_GOVERNANCE`
- `HUMAN_DECISION_REQUIRED`
- `NO_NOTABLE_RELATIVE_POSTURE`

Notes are honest closed-vocab signals; NEVER an implicit
ranking. NEVER use comparative language outside this closed
set.

### 7. Scoring posture (v1)

Wave 6 v1 implementation MUST use closed-vocabulary ratings
ONLY. Numeric scores, winner selection, "best candidate"
flags, probability of success, ROI prediction, legal
sufficiency scores, compliance certainty scores, hidden risk
scores, employee performance scores, team performance scores,
psychological/personality scoring, and automatic
recommendation are **forbidden** at this Wave.

Allowed comparison language (closed copy set):

- "more review needed"
- "lower operational complexity"
- "higher connector readiness"
- "insufficient data"
- "human review required"
- "policy review required"
- "not a legal determination"
- "comparison only"
- "not executed"

Forbidden comparison language (inherited from ADR-0070 §9 +
extended for Wave 6):

- "best"
- "best path"
- "winner"
- "guaranteed"
- "legally sufficient"
- "compliant"
- "regulator approved"
- "no fine risk"
- "AI approved"
- "execute this"
- "execute automatically"
- "employee risk"
- "manager should intervene"
- "probability of success"
- "ROI"
- "score"

A future Wave 7 ADR may introduce a recommended-best flag at
its own contract register; ADR-0073 explicitly does NOT.

### 8. Input sources (canonical at this ADR)

Future Wave 6 implementation MAY consume any subset of these
scoped, safe inputs. Every input is scope-bounded by existing
Foundation primitives (RULE 0 caller-scope; ADR-0059 same-org;
ADR-0072 §4 candidate-input set; ADR-0072 §6 candidate-input
forbidden list).

1. **Wave 5 candidate output fields** — ALL 17 fields of each
   `PlaygroundCandidateView` returned by
   `PlaygroundCandidateService.generateCandidates` for the
   same scenario in the same authorized caller's context.
2. **PlaygroundScenario safe metadata** — `scenario_id` +
   `status` (closed-vocab DRAFT/READY/ARCHIVED) +
   `scenario_type` (closed-vocab MANUAL/FIXTURE/
   FUTURE_GENERATED). NEVER raw `input_refs` / `constraints`
   / `expected_outputs` / `governance_findings` JSON;
   NEVER raw `title` / `description` / `goal_summary` text
   beyond what's already mirrored in the candidate output.
3. **Wave 5 closed-vocab candidate fields specifically** —
   `candidate_type` + `governance_findings[]` +
   `required_approvals[]` + `blocked_by_policy` +
   `action_runtime_transition_hint` + `confidence_label` +
   `known_risks[]` + `dependencies[]`.
4. **Wave 5 safe bounded text fields** — `candidate_title` +
   `candidate_summary` + `assumptions[]` +
   `expected_benefits[]` + `honest_note`. These are
   template-driven closed-style text per ADR-0072 §1 and are
   already SAFE projections by construction.

### 9. Forbidden inputs (universal at every Wave 6 surface)

The future Wave 6 implementation MUST NOT consume any of the
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
- raw scenario JSON internals if unsafe (input_refs /
  constraints / expected_outputs / governance_findings JSON
  payloads beyond the safe candidate-projected closed-vocab
  fields)

### 10. "Wave 6 calls Wave 5 internally" canonical decision

Wave 6 implementation MUST internally invoke the Wave 5
`PlaygroundCandidateService.generateCandidates` for the same
scenario id and the caller's session token. It MUST NOT accept
arbitrary caller-supplied candidate payloads.

Rationale:

- Trusting caller-supplied candidate payloads would create a
  raw-text injection surface (caller could submit fabricated
  candidate text bypassing the closed-vocab template
  library).
- Re-deriving candidates deterministically from the scenario
  guarantees the comparison reflects the same
  deterministic candidate output the caller would receive
  from the Wave 5 route.
- ADR-0072 §1 deterministic `candidate_key` is stable across
  regeneration so the matrix is reproducible even though
  candidates are not persisted.

If a future Wave 6 implementation slice needs `candidate_keys`
in the request (e.g., to select a subset of candidates to
compare), those keys MUST correspond to deterministic Wave 5
candidates for the same scenario; the implementation
validates each key against the internally-generated candidate
set and rejects unknown keys with `INVALID_REQUEST`. No
freeform candidate text is ever accepted from callers.

### 11. Bounded counts (canonical at this ADR)

- `candidates_per_comparison_max` — recommended 8 (mirrors
  ADR-0072 §18 `candidates_per_call_max`).
- `outcome_dimensions_per_item_max` — 12 (the full §2
  vocabulary).
- `risk_findings_per_item_max` — 12.
- `dependency_findings_per_item_max` — 12.
- `required_reviews_per_item_max` — 9.
- `comparison_notes_per_item_max` — 8.
- `comparison_summary_max_chars` — 600.
- `candidate_title_max_chars` — 120.

Exact values MAY be adjusted at the implementation slice; the
cap discipline is canonical at this ADR.

### 12. Implementation-method comparison (canonical at this ADR)

Three implementation options are enumerated so the future
Wave 6 implementation slice has a single canonical reference
for design tradeoffs:

#### 12.1. Option A — Deterministic TypeScript rubric-first

- **Where**: `apps/api/src/services/playground/` —
  additive `PlaygroundOutcomeComparisonService` alongside
  the existing Wave 5 `PlaygroundCandidateService`.
- **Mechanism**: closed-vocab rubric mapping Wave 5
  candidate fields → outcome dimension ratings + risk
  findings + dependency findings + required reviews. The
  rubric is deterministic: same candidate set → same matrix.
- **Explainability**: total — every output token is
  traceable to a closed-vocab source field.
- **Safety**: highest — no LLM autonomy, no hidden
  reasoning, no fabricated probabilistic claims.
- **ADR-0069 register**: TypeScript §2.1 (synchronous
  request/response).
- **No new dependency**: pure stdlib + existing Foundation
  primitives.
- **Recommended posture for first Wave 6 implementation
  slice.**

#### 12.2. Option B — Python AI service under Foundation governance

- **Where**: NEW Python service at a future boundary ADR per
  ADR-0069 §2.4.
- **Mechanism**: Python service consumes Foundation-scoped
  safe inputs + returns SAFE comparison projections under
  policy/auth gate + audit emission.
- **Prerequisite**: future Founder-authorized boundary ADR
  per ADR-0069 §2.4 (same prerequisite as ADR-0072 §8.2
  Wave 5 Python option).
- **Explainability**: moderate — Python service MUST emit
  closed-vocab evidence references; raw chain-of-thought
  MUST NEVER traverse the boundary.
- **Safety**: contingent on the boundary ADR.
- **Coverage**: broader than Option A; can synthesize
  comparisons from input combinations the operators did not
  pre-encode (e.g., domain-specific tradeoff inference).
- **NOT authorized at this ADR.**

#### 12.3. Option C — BEAM-orchestrated long-running comparison

- **Where**: NEW BEAM service per ADR-0069 §3 domain 6 +
  ADR-0028 BEAM coordination layer.
- **Mechanism**: multi-agent orchestration of multiple
  scoped comparison agents concurrently evaluating branch
  scenarios; supervised processes; backpressure; fault
  isolation.
- **Prerequisite**: future Wave 9 multi-agent orchestration
  authorization per ADR-0065 §7 + ADR-0069 §6 architecture
  check.
- **NOT authorized at this ADR.** Folds into Wave 9 if
  comparison becomes long-running, concurrent, multi-agent,
  branch-heavy, or simulation-orchestration-heavy.

#### 12.4. Recommended posture for v1 implementation

Deterministic / template-first TypeScript (Option A).
Python (Option B) and BEAM (Option C) are forward-substrate
behind their per-slice Founder authorizations + gating ADRs.
The deterministic baseline establishes the contract that any
later Option B / Option C implementation MUST satisfy.

### 13. Persistence posture

This ADR does NOT decide whether Wave 6 implementation MUST
persist comparison output. The contract at §1 is the output
shape; persistence is a separate architectural concern.

Recommended posture for the future Wave 6 implementation
slice:

- **Computed-on-read first** — the first Wave 6
  implementation SHOULD generate comparisons on-demand from
  re-derived Wave 5 candidates without persisting. Mirrors
  Wave 5 Option A posture.
- **Persistence later** — if persistence proves necessary
  (e.g., Wave 7 best-path recommender requires stable
  comparison snapshots across sessions; or Control Tower
  frontend needs persistent comparison history), a separate
  Founder-authorized ADR amendment + new schema slice MUST
  land.

NO schema change at this ADR. NO `PlaygroundOutcomeComparison`
Prisma model. NO persistence helper.

### 14. Audit posture

This ADR adds NO new audit literal. Future Wave 6
implementation slices MUST reuse the canonical
`ADMIN_ACTION + details.action` discriminator pattern
(Wave 4 + Wave 5 Option A + Section 4 + Section 6 + Section 7
+ ADR-0062 precedent).

Future Wave 6 implementation slice expectations:

- **Computed-on-read comparison** — emits read-audit with
  `ADMIN_ACTION + details.action = "PLAYGROUND_OUTCOMES_COMPARED"`
  with safe metadata only:
  - `scenario_id`
  - `candidate_count`
  - `comparison_mode` (closed-vocab)
  - `blocked_candidates_count`
  - `review_required_count`
  - `generated_from_candidate_keys_hash` (SHA-256 16-char
    hash over the sorted set of input `candidate_key`
    values; optional; helps audit reproducibility without
    leaking individual candidate identities)
- **NEVER** raw comparison text in audit details.
- **NEVER** raw candidate text in audit details.
- **NEVER** raw scenario JSON in audit details.
- **NEVER** legal / compliance conclusions in audit details.
- **NEVER** scores in audit details.

A new audit literal would only be required if the existing
`ADMIN_ACTION + details.action` discriminator proves
insufficient. This ADR explicitly projects that the
discriminator pattern is sufficient (Wave 5 precedent).

### 15. Future route shape (canonical at this ADR)

The future Wave 6 implementation slice SHOULD register:

`POST /api/v1/playground/scenarios/:id/outcome-comparisons`

Request body (all optional):

- `candidate_types?: CandidateType[]` — optional Wave 5
  candidate_type filter; passed through to the internal
  `PlaygroundCandidateService.generateCandidates` call.
- `candidate_keys?: string[]` — optional Wave 5
  candidate_key filter; if provided, MUST correspond to the
  internally-generated candidate set; unknown keys reject
  with `INVALID_REQUEST`.
- `max_candidates?: number` — optional cap; bounded by
  `candidates_per_comparison_max` (8) and ADR-0072 §18
  `candidates_per_call_max` (8).
- `comparison_mode?: ComparisonMode` — default
  `DETERMINISTIC_RUBRIC`.

Response:

- 200: `ComparisonResponse` per §1.
- 404: `SCENARIO_NOT_FOUND` (enumeration-safe; inherited
  via `PlaygroundCandidateService` → `PlaygroundScenarioService.
  getScenario` delegation).
- 422: `INVALID_REQUEST` + `invalid_fields[]` for body-shape
  violations (invalid candidate_type / invalid candidate_key
  / invalid max_candidates / invalid comparison_mode).
- 401/403/500 inherited from the underlying service surface.

Bearer + "read" permission (mirrors Wave 5 Option A and Wave 4
CRUD pattern).

### 16. Human-in-the-loop doctrine (universal)

Every comparison response MUST include `honest_note` at the
top level stating:

- comparison is advisory
- comparison does NOT select a winner
- comparison has NOT been executed
- comparison is NOT legal advice
- comparison requires human / governance review before
  action

Every `ComparisonMatrixItem` MUST also carry `honest_note`
(echoed from the Wave 5 candidate + the Wave 6 comparison-
specific clause).

Wave 6 comparison NEVER silently executes. Wave 6 NEVER
creates Actions. Wave 6 NEVER selects a winner — selection is
Wave 7 best-path recommender per ADR-0065 §7. Any transition
from a selected candidate (Wave 7) to real work (Wave 8) MUST
route through Section 2 Action runtime per ADR-0057.

### 17. No-leak doctrine (universal)

Every comparison response MUST NOT expose:

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
- employee identity unless explicitly in-scope per the
  caller's COSMP permission AND safely projected
- cross-org data
- privileged legal material
- regulator-backdoor data

The future Wave 6 implementation slice MUST include a
no-leak guard test enforcing every forbidden field substring
against an adversarial fixture set (mirrors Wave 5 Option A
precedent at `tests/integration/playground-candidates.test.ts`).

### 18. RULE 0 + same-org boundary (universal)

Every Wave 6 surface MUST enforce:

- **Caller scope only** — comparison reads only candidates
  produced from a scenario the caller owns; no privileged
  cross-entity comparison at the v1 register.
- **Same-org boundary** — cross-org candidate inputs are
  forbidden per ADR-0059 + ADR-0037 + ADR-0061; enforcement
  is inherited via `PlaygroundCandidateService` →
  `PlaygroundScenarioService.getScenario` delegation.
- **Owner-first scenario scope** — Wave 6 implementation
  MUST verify the caller owns the parent
  `PlaygroundScenario` (per Wave 4 + Wave 5 owner-first
  precedent) before generating the comparison matrix. No
  cross-owner comparison at the v1 register.

### 19. Substrate-coherence law alignment (ADR-0069)

Per ADR-0069 §6 mandatory 8-question architecture check, the
v1 Wave 6 implementation slice belongs at the TypeScript
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
   (deterministic rubric). Option B Python belongs at §2.4
   register under a future boundary ADR.

V1 register: TypeScript synchronous workflow under
Foundation governance.

### 20. Wave-map alignment (preserves ADR-0065 §7 + ADR-0072 §15)

Wave 6 contract MUST NOT accidentally implement Wave 7 / 8 /
9 / 10:

- **Wave 7** (best-path recommender): Wave 6 produces a
  comparison matrix; Wave 7 selects one of the candidates
  as "recommended best path" with evidence + reasoning.
  Wave 6 carries `TradeoffSummary` (closed-vocab tradeoff
  sets, not a ranking) but NEVER a recommended-best flag.
- **Wave 8** (governed transition to Action plan): Wave 6
  matrix carries `action_runtime_transition_hint` per
  candidate but NEVER an unexecuted Action payload. Wave 8
  translates a selected candidate + caller confirmation
  into an Action plan submitted to Section 2.
- **Wave 9** (multi-agent orchestration): Wave 6 v1 is
  single-pass deterministic; Wave 9 is multi-agent
  orchestration per ADR-0069 §3 domain 6 + ADR-0028.
- **Wave 10** (Control Tower frontend consumer): lives in
  the `otzar-control-tower` repo; Foundation owns the
  contract.

### 21. Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline, Wave 6
outcome-comparison contract contributes patent-evidence-
bearing material at three patents:

- **US 12,517,919 (COSMP)** — outcome comparison consumes
  Wave 5 candidate output that is itself scope-bounded by
  caller's COSMP permission. The governed-substrate
  boundary distinguishes NIOV's Agent Playground from any
  unauthorized parallel build at the "uncontrolled
  enterprise AI comparison" claim register.
  Cryptographically-timestamped ADR-0060 + PR #100 +
  ADR-0065 + PR #111 + ADR-0072 + PR #134 + PR #136 +
  ADR-0073 lineage on `main`.
- **US 12,164,537 (DMW)** — enterprise-wallet-derived
  signals inherited verbatim from Wave 5; same-org-scoped
  per ADR-0059.
- **US 12,399,904 (Foundation primitives)** — comparison
  matrix carries `action_runtime_transition_hint` per
  candidate; transition from candidate to real work routes
  through Section 2 Action runtime per Wave 8 + ADR-0057.
  Every layer of the Wave 5 → Wave 6 → Wave 7 → Wave 8
  pipeline is governed-substrate-evident.

### 22. Explicit non-goals at this commit

NO code in this commit. NO schema migration. NO new routes.
NO new audit literal. NO service-method signature change.
NO LLM generation. NO model calls. NO Python services. NO
BEAM orchestration. NO outcome-comparison implementation.
NO scoring engine. NO best-path recommender. NO governed-
transition implementation. NO Action creation. NO connector
invocation. NO external provider calls. NO Control Tower
frontend. NO multi-agent simulation runtime. NO candidate
persistence. NO outcome-comparison persistence. NO numeric
ranking. NO winner selection. NO CLAUDE.md bulk catalog edit.
NO bulk rewrite of older ADRs. NO current active slice
derailment.

## Consequences

### Easier after this ADR

- Future Wave 6 implementation slices have a single canonical
  contract reference. The §1 comparison-matrix shape + §2 /
  §3 / §4 / §5 / §6 closed vocabularies + §7 scoring posture
  + §8 / §9 allowed/forbidden input set + §15 future route
  shape + §16 human-in-the-loop + §17 no-leak + §18 RULE 0
  universal are stable design contracts; the implementation
  slice does not re-litigate per slice.
- The §12 three-method comparison forward-queues Option B
  (Python) and Option C (BEAM) at explicit ADR-0069 §2.4 /
  §2.3 registers with their gating ADRs named.
- ADR-0072 stays correctly bounded at the Wave 5 candidate-
  generation contract; ADR-0065 stays correctly bounded at
  product-vision tier; ADR-0073 sits at the contract tier
  between them.
- The §10 "Wave 6 calls Wave 5 internally" canonical
  decision prevents caller-supplied raw candidate text from
  ever entering the comparison pipeline.

### Harder after this ADR

- The §1 comparison-matrix shape is canonical. Future Wave 6
  implementation slices that need a new required top-level
  field require explicit Founder authorization + ADR
  amendment.
- The §2 / §3 / §4 / §5 / §6 closed vocabularies are
  canonical. Adding new values requires a future ADR
  amendment.
- The §7 scoring posture forbids numeric scoring + winner
  selection at this Wave; Wave 7 will introduce the
  recommended-best flag at its own contract register.
- The §10 internal-call decision means callers cannot supply
  their own candidate payloads — this is intentional but
  may surprise implementers expecting a generic
  comparison-of-arbitrary-things endpoint.
- The §11 bounded counts are canonical at the discipline
  register; exact values may move at the implementation
  slice but the cap discipline is locked.

### Substrate-state catches resolved

- ADR-0065 §7 Wave 6 forward-queue line referenced "closed-
  vocabulary; NO employee scoring" without locking the
  contract; the contract is now canonical at ADR-0073 §1.
- ADR-0072 §15 explicitly forbids Wave 5 from accidentally
  implementing Wave 6; ADR-0073 §20 mirrors the discipline
  in reverse (Wave 6 MUST NOT accidentally implement Wave 7
  / 8 / 9 / 10).
- ADR-0072 §11 human-in-the-loop doctrine is extended at
  ADR-0073 §16 with the Wave 6-specific "does not select a
  winner" clause.

## Forward queue

Each forward-substrate slice requires separate Founder
authorization at its slice prompt:

- **Wave 6 implementation slice (Option A; deterministic /
  template-first TypeScript)** — `PlaygroundOutcomeComparisonService`
  + `POST /api/v1/playground/scenarios/:id/outcome-comparisons`
  (computed-on-read; internally invokes
  `PlaygroundCandidateService.generateCandidates`) + read-audit
  `ADMIN_ACTION + details.action = "PLAYGROUND_OUTCOMES_COMPARED"`
  + ≥25 integration tests + no-leak guard + closed-vocab
  rubric library + bounded counts + same-org SCENARIO_NOT_FOUND
  delegation.
- **Wave 6 persistence slice (if and only if §13 proves
  necessary)** — `PlaygroundOutcomeComparison` Prisma model +
  safe CRUD + audit emission on persistence boundary +
  ADR-0073 amendment locking persistence shape.
- **Wave 6 Option B Python-backed implementation slice** —
  requires: (a) dedicated Python service boundary ADR per
  ADR-0069 §2.4; (b) explicit Founder authorization at the
  Python slice; (c) ADR-0073 §12.2 prerequisites verified.
- **Wave 6 Option C BEAM-orchestrated implementation slice** —
  folds into ADR-0065 §7 Wave 9 (multi-agent simulation
  orchestration); requires ADR-0069 §6 mandatory 8-question
  architecture check.
- **Wave 7** (best-path recommender) — separate Founder slice
  per ADR-0065 §7. Consumes the Wave 6 `ComparisonResponse`
  as input and produces a recommended candidate + reasons +
  evidence + policy findings.
- **Wave 8** (governed transition to Section 2 Action runtime)
  — separate Founder slice per ADR-0065 §7.
- **Wave 9** (multi-agent simulation orchestration) — separate
  Founder slice per ADR-0065 §7 + ADR-0069 §3 domain 6.
- **Wave 10** (Control Tower frontend consumer) — separate
  Founder slice per ADR-0065 §7; lives in
  `otzar-control-tower` repo.

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
  via Wave 5 candidate-input set).
- Cites ADR-0037 (jurisdiction tagging; §18 same-org
  boundary).
- Cites ADR-0048 (COE personalization-orchestration substrate;
  future Wave 6 scenario-tier integration NOT authorized at
  this ADR).
- Cites ADR-0049 (GOVSEC umbrella; security controls at every
  Wave 6 tier).
- Cites ADR-0050 (break-glass; future Wave 8 transitions may
  need break-glass paths; out of Wave 6 scope).
- Cites ADR-0052 (Otzar DGI doctrine; parent product
  doctrine; Agent Playground is the DGI substrate).
- Cites ADR-0057 (Action runtime; §15 / §16 / §20 transition
  to Section 2 routed through `action_runtime_transition_
  hint` + Wave 8).
- Cites ADR-0058 §7 (SAFE projection pattern; §17 no-leak
  posture inherited).
- Cites ADR-0059 (Section 3 Hives v1; §18 same-org boundary).
- Cites ADR-0060 (Section 5 Wave 1 inspector foundation;
  this ADR sits ABOVE ADR-0060 at the contract register).
- Cites ADR-0061 (Section 6 analytics SAFE projection
  precedent for closed-vocab + metadata-only audit).
- Cites ADR-0063 (governance_terms evaluator; §3 risk and
  §4 dependency vocabularies inherit the closed-vocab
  precedent).
- Cites ADR-0065 (long-term product vision; this ADR closes
  ADR-0065 §7 Wave 6 forward-queue line at the contract
  register; bidirectional back-citation lands in ADR-0065
  §Forward queue Wave 6 entry per RULE 14 + RULE 20).
- Cites ADR-0068 (proactivity precedent; `candidate_key`
  deterministic-hash pattern reused at Wave 5 + carried
  through to Wave 6).
- Cites ADR-0069 (BEAM substrate-coherence law; §12 three-
  method comparison + §19 8-question architecture check;
  bidirectional back-citation lands in ADR-0069 §Forward
  queue per RULE 14 + RULE 20).
- Cites ADR-0070 (regulator-ready doctrine; §7 scoring
  posture + §17 no-leak inherit §9 legal-advice boundary
  verbatim; bidirectional back-citation lands in ADR-0070
  §Forward queue per RULE 14 + RULE 20).
- Cites ADR-0071 (Section 7 cross-scope verify-chain;
  audit-metadata input source NOT authorized at this Wave —
  reserved for future amendments).
- Cites ADR-0072 (Wave 5 candidate-generation contract; this
  ADR sits ABOVE ADR-0072 at the contract register; Wave 6
  consumes the Wave 5 candidate output verbatim;
  bidirectional back-citation lands in ADR-0072 §Forward
  queue per RULE 14 + RULE 20).
- Cited from ADR-0060 §Forward queue (Wave 6 outcome
  comparison; bidirectional back-citation discipline).
- Cited from ADR-0065 §Forward queue Wave 6 entry
  (bidirectional back-citation discipline; ADR-0073 closes
  the Wave 6 forward-queue line at the contract register).
- Cited from ADR-0069 §Forward queue (Wave 6 v1 TypeScript
  register confirmation; Option B Python / Option C BEAM
  forward-substrate references).
- Cited from ADR-0070 §Forward queue (Wave 6 legal-advice
  boundary inheritance; §9 vocabulary preserved verbatim at
  ADR-0073 §7).
- Cited from ADR-0072 §Forward queue (Wave 6 as the next
  scenario-tier projection above Wave 5 candidate
  generation).
- Cited from ADR-0074 §Bidirectional citations (Section 5
  Wave 7 Best-Path Recommendation Contract; design-only
  ADR landed 2026-05-31; ADR-0074 sits ABOVE ADR-0073 at
  the contract register and consumes ALL Wave 6
  `ComparisonResponse` fields verbatim as the
  recommendation input set; ADR-0074 §10 canonicalizes the
  "Wave 7 calls Wave 6 internally" decision so the
  recommendation pipeline never accepts caller-supplied
  raw comparison or candidate text; ADR-0074 §20 mirrors
  ADR-0073 §20 wave-map discipline in reverse — Wave 7
  MUST NOT accidentally implement Wave 8 / 9 / 10;
  ADR-0074 does NOT modify ADR-0073 — Wave 6 stays
  canonical at the outcome-comparison contract tier;
  bidirectional back-citation per RULE 14 + RULE 20).

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citations in
ADR-0065 / ADR-0069 / ADR-0070 / ADR-0072 + the
architecture/README.md catalog entry + the Section 5
build-state doc update + the NEXT_ACTION.md baton update land
under explicit Founder authorization at
`[FOUNDER-SECTION-5-WAVE-6-OUTCOME-COMPARISON-CONTRACT-ADR-AUTH]`
2026-05-31. The authorization is **ADR-only** — the future
Wave 6 implementation slice (Option A deterministic
TypeScript) requires separate Founder authorization at its
slice. Option B (Python) requires a dedicated Python service
boundary ADR per ADR-0069 §2.4 + separate Founder
authorization. Option C (BEAM) requires ADR-0065 §7 Wave 9
authorization + ADR-0069 §6 architecture check.
