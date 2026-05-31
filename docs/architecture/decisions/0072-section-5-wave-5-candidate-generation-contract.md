# ADR-0072: Agent Playground Candidate-Generation Contract — Section 5 Wave 5 (Design-Only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-SECTION-5-WAVE-5-CANDIDATE-GENERATION-CONTRACT-ADR-AUTH]`
2026-05-31.

This ADR is **design-only**. NO code, NO schema migration, NO
new routes, NO new audit literal, NO service-method signature
change, NO LLM autonomy, NO model calls, NO Python services,
NO BEAM orchestration, NO Action creation, NO connector
invocation, NO external provider calls, NO Control Tower
frontend, NO ranking/scoring engine, NO best-path recommender,
NO outcome-comparison engine, NO multi-agent simulation
runtime, NO CLAUDE.md bulk catalog edit, NO current active
slice derailment in this commit.

Sits ABOVE ADR-0060 (Wave 1 v1 inspector design) and BELOW
ADR-0065 (long-term product vision) at the **contract
register**: ADR-0065 §7 forward map enumerates Wave 5 as
"scenario candidate generation contract"; this ADR locks the
contract that any future Wave 5 implementation slice MUST
satisfy.

## Context

### Why Wave 5 needs its own design ADR

ADR-0065 §7 forward-queues Wave 5 in three sentences:
*"scenario candidate generation contract. Likely fixture /
deterministic first ... NO LLM autonomy unless separately
Founder-authorized. Contract: scenario input → N scenario
candidates."* That framing is correct at the product-vision
register but does not lock the candidate shape, the closed
vocabularies, the allowed input set, the forbidden inputs, or
the safety / no-leak rails the future implementation slice
will need.

ADR-0060 §1 v1 scope is intentionally narrow at the inspector
register (policy evaluator + connector dry-run + working-set
inspector) and explicitly defers candidate-generation per its
§2 non-goals. Stretching ADR-0060 to cover Wave 5 would
violate its "v1 design boundary" title.

ADR-0072 sits at the contract tier between ADR-0065
(product-vision) and ADR-0060 (Wave 2 inspector). It locks
**what a scenario candidate IS** so the future implementation
slice (deterministic-TS first; Python-backed later; BEAM-
orchestrated later) can be authorized against a stable
contract instead of re-litigating the contract per slice.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `6ab71e9`:

- **Section 5 today**: Wave 1 ADR-0060 (design) + Wave 2
  inspector LIVE (PR #100; `fd35c62`; 3 sandbox routes) +
  Wave 3 ADR-0065 (product-vision) + Wave 4 LIVE (PR #111;
  `a2988ee`; `PlaygroundScenario` Prisma model + 5 owner-
  first CRUD routes + 38 integration tests; ADMIN_ACTION +
  `details.action` discriminator; zero new audit literal;
  soft-archive per RULE 10).
- **`PlaygroundScenario` fields**: `scenario_id`,
  `owner_entity_id`, `org_entity_id` (nullable), `title`,
  `description`, `goal_summary`, `status`, `scenario_type`,
  `input_refs` (Json), `constraints` (Json),
  `expected_outputs` (Json), `governance_findings` (Json),
  `created_at`, `updated_at`, `archived_at` (soft-archive).
  Indexes: `org+owner+status`; `owner+archived_at+created_at`.
- **Section 2 Action runtime LIVE** (autonomous-execution
  substrate; ADR-0057): the governed-execution surface that
  any Wave 8 transition MUST route through.
- **Section 4 connector substrate LIVE** (governed adapters;
  ADR-0026 + ADR-0049): connector capabilities are declared
  via `ConnectorBinding`; secret material lives behind
  `secret_ref` env-var-NAME pattern; production providers are
  never reachable from Playground code by construction
  (`FixtureBasedConnectorProvider` is the only path).
- **Section 6 analytics aggregates LIVE** (ADR-0061): 6 live
  aggregates with k=5 floor + closed-vocab labels + metadata
  only.
- **Section 3 Hives LIVE** (ADR-0059): same-org Hive substrate
  for team context inputs.
- **Section 7 Full Audit Viewer PRODUCTION-GRADE COMPLETE**
  across 4 read shapes × 4 scopes (ADR-0071 implementation
  landed PR #132; `ffc0548`). Provides safe audit-derived
  operational signals.
- **ADR-0069 LIVE** (Elixir/BEAM Substrate-Coherence Law):
  TypeScript owns API contracts and synchronous workflows;
  Elixir/BEAM owns living coordination, long-running
  processes, multi-agent orchestration; Python owns
  intelligence-heavy computation under Foundation
  governance.
- **No in-tree Python service substrate yet**: ADR-0069 §2.4
  requires a dedicated boundary ADR before the first Python
  service slice — service-boundary contract (Foundation-
  scoped input envelope + SAFE projection of outputs +
  policy/auth gate + audit emission posture + no-leak surface
  + governance hook).
- **ADR-0070 LIVE** (Regulator-Ready Foundation Doctrine):
  legal-advice boundary; neutral compliance vocabulary;
  examination-ready evidence flows. Candidate generation
  MUST honor §9 legal-advice boundary verbatim.

The substrate required to support deterministic Wave 5
candidate generation exists today at the foundational tier.
The missing piece is the contract — which is what this ADR
locks.

### Patent + doctrine alignment

- **US 12,517,919 (COSMP)**: candidate generation MUST consume
  scoped inputs at every tier — caller's COSMP permission
  boundary applies to every input source; no privileged
  cross-entity reads at the candidate-generation tier.
- **US 12,164,537 (DMW)**: enterprise-wallet boundaries —
  candidate generation MAY consume same-org enterprise-
  wallet-derived signals; MUST NOT reach cross-org.
- **US 12,399,904 (Foundation primitives)**: candidate
  generation produces unexecuted candidates; every transition
  from candidate to real work MUST route through Section 2
  Action runtime (ADR-0057 + ADR-0065 §4 + §7 Wave 8).
- **ADR-0052 Otzar DGI doctrine**: the Agent Playground IS
  the DGI substrate inside the enterprise domain; candidate
  generation is the first scenario-tier surface above the
  inspector foundation.
- **ADR-0069 BEAM substrate-coherence law**: candidate
  generation at v1 is a synchronous request/response shape —
  belongs in TypeScript at the §2.1 register. Wave 9
  multi-agent orchestration is the BEAM-fit slice per
  ADR-0069 §3 domain 6.
- **ADR-0070 regulator-ready doctrine**: candidate generation
  MUST honor §9 legal-advice boundary; allowed copy
  ("compliance review recommended", "policy review required",
  "not a legal determination") vs forbidden copy ("legally
  sufficient", "guaranteed compliant", "regulator-approved").

## Decision

Foundation canonicalizes the **scenario candidate-generation
contract** for Agent Playground Wave 5. A scenario candidate
is a proposed possible path the organization MAY consider for
a given `PlaygroundScenario`. Generation is bounded,
explainable, and human-in-the-loop; it never executes, never
creates Actions autonomously, never produces legal advice,
never claims certainty, and never leaks raw private content.

### 1. What a scenario candidate IS (contract)

A scenario candidate is a structured projection with the
following canonical fields. Future Wave 5 implementation MUST
return this exact shape (modulo additive optional fields under
a future Founder-authorized amendment); MUST NOT add new
required top-level categories without amendment here.

- `candidate_id` — opaque identifier (UUID at implementation;
  deterministic stable hash acceptable when fixture-mode is
  used so repeated generation against identical inputs is
  reproducible).
- `candidate_key` — deterministic SHA-256 16-char hash over
  `(scenario_id, candidate_type, ordered input signal
  references)`. Stable across regeneration. Mirrors ADR-0068
  `proactive_cards[].card_key` precedent.
- `scenario_id` — FK reference to the parent
  `PlaygroundScenario.scenario_id`.
- `candidate_title` — short closed-style label (≤120 chars).
  NEVER raw capsule content; NEVER prompt fragments; NEVER
  chain-of-thought; safe paraphrase only.
- `candidate_summary` — short closed-style paragraph (≤600
  chars). Same constraints as `candidate_title`. MUST cite
  closed-vocab source signals (per §4) inline as evidence
  refs; MUST NOT embed raw input content.
- `candidate_type` — closed-vocabulary label from the
  canonical set at §2.
- `assumptions[]` — closed-style short statements explicit
  about what the candidate assumes is true (≤200 chars
  each). Bounded count: max 8. NEVER raw capsule content.
- `required_inputs[]` — closed-vocab references to the input
  signal categories (per §4 §6) the candidate would need
  before execution; NEVER raw values.
- `expected_benefits[]` — closed-style short statements
  (≤200 chars each); bounded count: max 8. NEVER fabricated
  probabilistic claims; NEVER "guaranteed".
- `known_risks[]` — closed-style short statements (≤200 chars
  each); bounded count: max 12. NEVER raw incident detail;
  NEVER privileged material.
- `dependencies[]` — closed-vocab dependency category labels;
  bounded count: max 12. NEVER raw cross-entity references.
- `governance_findings[]` — closed-vocabulary set from §3.
- `required_approvals[]` — explicit closed-vocab approval
  categories (DUAL_CONTROL_REQUIRED / APPROVAL_REQUIRED /
  HUMAN_DECISION_REQUIRED / POLICY_REVIEW_REQUIRED /
  LEGAL_REVIEW_RECOMMENDED / COMPLIANCE_REVIEW_RECOMMENDED).
- `blocked_by_policy` — boolean (true only when at least one
  `governance_findings[]` value is `DO_NOT_EXECUTE` or
  `POLICY_REVIEW_REQUIRED`).
- `action_runtime_transition_hint` — closed-vocabulary label
  from §5 indicating how (or whether) the candidate could
  later transition to a Section 2 Action plan.
- `evidence_refs[]` — closed-style safe reference identifiers
  (NEVER raw IDs that leak cross-entity scope; NEVER raw
  capsule content; NEVER raw audit details; NEVER raw
  storage locations / content hashes / bridge IDs / secret
  refs / embeddings / vectors). Each reference cites the
  source-signal category (per §4) and a SAFE projected
  metadata token (e.g., "POLICY_EVALUATOR:OK" or
  "ANALYTICS:CORRECTION_VELOCITY:HIGH"); NEVER raw row
  contents.
- `confidence_label` — closed-vocabulary label from §7.
- `honest_note` — explicit string that MUST state the
  candidate is advisory, not executed, not legal advice,
  and requires human/governance review before action where
  applicable. Implementation MAY choose a closed-vocab
  string from a small canonical set (e.g., "Candidate is
  advisory. Not executed. Not legal advice. Requires human
  review before action."). NEVER omit.

### 2. `candidate_type` — closed vocabulary (v1)

The future Wave 5 implementation MUST emit `candidate_type`
from this set verbatim. Adding a new value requires a future
Founder-authorized ADR amendment here.

- `STATUS_QUO`
- `LOW_RISK_INCREMENTAL`
- `SPEED_OPTIMIZED`
- `COST_OPTIMIZED`
- `COMPLIANCE_FIRST`
- `CUSTOMER_IMPACT_FIRST`
- `OPERATIONAL_RESILIENCE`
- `HUMAN_REVIEW_REQUIRED`
- `DO_NOT_PROCEED`

### 3. `governance_findings` — closed vocabulary (v1)

Adding a new value requires a future ADR amendment here.

- `POLICY_ALLOWED`
- `POLICY_REVIEW_REQUIRED`
- `APPROVAL_REQUIRED`
- `DUAL_CONTROL_REQUIRED`
- `CONNECTOR_UNAVAILABLE`
- `DATA_SCOPE_INSUFFICIENT`
- `COMPLIANCE_REVIEW_RECOMMENDED`
- `LEGAL_REVIEW_RECOMMENDED`
- `HUMAN_DECISION_REQUIRED`
- `ACTION_RUNTIME_REQUIRED`
- `DO_NOT_EXECUTE`

### 4. Allowed input sources (canonical at this ADR)

Future Wave 5 implementation MAY consume any subset of these
scoped, safe inputs. Every input is scope-bounded by existing
Foundation primitives (RULE 0 caller-scope; ADR-0059 same-
org; ADR-0036 LawfulBasis for regulator access; ADR-0061
k=5 floor for analytics). The implementation MUST NOT invent
new input categories beyond this list without separate
Founder authorization + ADR amendment here.

1. **`PlaygroundScenario` fields** — `title`, `description`,
   `goal_summary`, `scenario_type`, `input_refs` (Json),
   `constraints` (Json), `expected_outputs` (Json) of the
   caller-owned scenario only.
2. **Wave 2 policy evaluator output** — output of
   `POST /api/v1/playground/policy-evaluator` (per ADR-0060
   §3); safe envelope (verdict + reason markers).
3. **Wave 2 connector dry-run output** — output of
   `POST /api/v1/playground/connector-dry-run` (per ADR-0060
   §3); `FixtureBasedConnectorProvider` only; never real
   provider calls.
4. **Wave 2 working-set output** — output of
   `POST /api/v1/playground/working-set` (per ADR-0060 §3);
   SAFE projection per ADR-0060 §3 (capsule_id +
   capsule_type + topic_tags only — NEVER raw `content`).
5. **Section 2 `ActionPolicy` / Action runtime metadata** —
   ActionPolicy autonomy ceilings + risk-tier gates +
   approval requirements + retry budget + attempt-timeout
   override (ADR-0057). NEVER raw Action payloads.
6. **Section 3 Hives safe aggregate / team context** — same-
   org Hive substrate (ADR-0059); membership counts and
   role labels at the safe register; NEVER raw private
   member content; NEVER cross-org.
7. **Section 4 connector capability metadata** — declared
   connector_type + binding metadata (`ConnectorBinding`
   row metadata); NEVER `secret_ref` values; NEVER live
   payloads; NEVER credentials.
8. **Section 6 analytics aggregates** — k=5 floor + closed-
   vocab + metadata-only outputs of the 6 live aggregates
   (ADR-0061); same-org only; NEVER raw underlying rows.
9. **Section 7 audit metadata** — closed-vocab audit-event
   counts and recency aggregates derivable from the
   `AUDIT_VIEW_*` reads at the SAFE projection register
   (ADR-0071); scoped to caller's permitted scope; NEVER
   raw audit row content; NEVER cross-org signals;
   regulator-scope audit signals only via ADR-0036
   LawfulBasis-bound flows.
10. **Accepted Otzar alignment patterns** — owner/team
    scoped per ADR-0066 + ADR-0067 if and only if a future
    explicit Founder amendment authorizes the integration;
    NOT authorized at this ADR.
11. **Compliance posture metadata** — Section 6 Wave 7
    compliance-posture aggregate output (ADR-0061 §8); as
    a non-legal-advice signal only; legal-advice boundary
    per ADR-0070 §9 inherited.
12. **Regulator-ready doctrine signals** — review flags
    only; NEVER legal conclusions; NEVER regulator-approved
    claims; inherits ADR-0070 §9 verbatim.

### 5. `action_runtime_transition_hint` — closed vocabulary (v1)

- `NO_ACTION` — candidate does not propose any Section 2
  Action.
- `MAY_PROPOSE_ACTION_LATER` — candidate is informational at
  Wave 5; later waves (Wave 8) may translate to an Action
  plan after governed approval.
- `REQUIRES_APPROVAL_CHAIN` — candidate would require admin
  approvals before any Action transition.
- `REQUIRES_POLICY_REVIEW` — candidate would require an
  ActionPolicy / governance_terms review first.
- `REQUIRES_CONNECTOR_CAPABILITY` — candidate would require a
  connector binding not currently available.
- `REQUIRES_HUMAN_DECISION` — candidate requires a human in
  the loop before any future transition.
- `BLOCKED` — candidate is blocked by current policy or scope
  and MUST NOT be transitioned without resolution.

### 6. Forbidden inputs (universal at every Wave 5 surface)

The future Wave 5 implementation MUST NOT consume any of the
following:

- raw memory / capsule contents (unless and until a future
  ADR explicitly authorizes a safe projection)
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
- raw audit details (events outside the caller's permitted
  scope, or raw payload of in-scope events)
- regulator-backdoor data of any kind

### 7. `confidence_label` — closed vocabulary (v1)

- `LOW`
- `MEDIUM`
- `HIGH`
- `INSUFFICIENT_DATA`

The future Wave 5 implementation MUST NOT fabricate
probabilistic numbers. `confidence_label` is a closed-vocab
honest signal, not a probability claim.

### 8. Implementation-method comparison (canonical at this ADR)

Three implementation options are enumerated so the future
Wave 5 implementation slice has a single canonical reference
for the design tradeoffs:

#### 8.1. Option A — Deterministic / template-first (TypeScript)

- **Where**: `apps/api/src/services/playground/` —
  additive to the existing `PlaygroundService` family.
- **Mechanism**: closed-vocab template library +
  deterministic projection from the §4 input set + closed-
  vocab governance findings + closed-vocab dependency map +
  deterministic `candidate_key` SHA-256 hash for
  reproducibility.
- **Explainability**: total — every output token is
  traceable to a closed-vocab source signal.
- **Safety**: highest — by construction no LLM autonomy, no
  hidden reasoning, no fabricated probabilities, no novel
  content.
- **Coverage**: bounded to the template library; cannot
  exceed what the operators encode.
- **ADR-0069 register**: TypeScript §2.1 (API contracts +
  synchronous workflows).
- **No new dependency**: pure stdlib + existing Foundation
  primitives.
- **Recommended posture for first Wave 5 implementation
  slice.**

#### 8.2. Option B — Python AI service under Foundation governance

- **Where**: NEW Python service at a future boundary ADR per
  ADR-0069 §2.4.
- **Mechanism**: Python service consumes a Foundation-
  scoped safe input envelope; returns SAFE candidate
  projections under policy/auth gate + audit emission.
- **Prerequisite**: future Founder-authorized boundary ADR
  must lock: (a) Foundation-scoped input envelope shape,
  (b) SAFE projection of outputs (every field auditable
  against this ADR's §1 contract), (c) policy/auth gate
  posture, (d) audit emission posture, (e) no-leak surface,
  (f) governance hook preventing Python from becoming
  ungoverned second intelligence layer per ADR-0069 §2.4.
- **Explainability**: moderate — Python service MUST emit
  closed-vocab evidence references; raw chain-of-thought
  MUST NEVER traverse the boundary.
- **Safety**: contingent on the boundary ADR; Python service
  MUST be governed; raw LLM output MUST be projected to
  closed vocab before reaching Foundation API surface.
- **Coverage**: broader than Option A; can synthesize
  candidates from input combinations the operators did not
  pre-encode.
- **ADR-0069 register**: Python §2.4 (intelligence-heavy
  computation under Foundation governance).
- **NOT authorized at this ADR**. Future authorization
  requires both: (1) explicit Founder authorization at the
  Wave 5 Python slice, and (2) the dedicated Python service
  boundary ADR per ADR-0069 §2.4.

#### 8.3. Option C — BEAM-orchestrated multi-agent candidate generation

- **Where**: NEW BEAM service per ADR-0069 §3 domain 6
  (multi-agent simulation orchestration) and ADR-0028 BEAM
  coordination layer.
- **Mechanism**: multi-agent orchestration of multiple scoped
  candidate-generation agents concurrently exploring
  candidate-space; supervised processes; backpressured event
  flow; fault isolation per BEAM substrate.
- **Prerequisite**: future Founder-authorized Wave 9 slice
  (per ADR-0065 §7 Wave 9) + ADR-0069 §6 mandatory 8-
  question architecture check.
- **Safety**: contingent on the Wave 9 slice; per-agent
  governance + per-agent COSMP scope + per-agent no-leak.
- **Coverage**: highest — concurrent branch exploration.
- **ADR-0069 register**: Elixir/BEAM §2.3 (living
  coordination + multi-agent orchestration + long-running
  processes).
- **NOT authorized at this ADR**. ADR-0065 §7 Wave 9
  authorization required.

#### 8.4. Recommended posture for v1 implementation

Deterministic / template-first (Option A). Python (Option B)
and BEAM (Option C) are forward-substrate behind the per-
slice Founder authorizations + their gating ADRs. The
deterministic baseline establishes the contract that any
later Option B / Option C implementation MUST satisfy.

### 9. Safety / no-leak doctrine (universal)

Every future Wave 5 implementation surface MUST enforce:

- **No execution** of real-world work.
- **No Action creation** at Wave 5.
- **No connector invocation** at Wave 5.
- **No external side effects** at Wave 5.
- **No hidden ranking** at Wave 5 (ranking is Wave 6+;
  candidate generation is generation, not ranking).
- **No employee scoring** at any surface.
- **No manager spy surface** at any surface.
- **No legal advice** in candidate copy or metadata.
- **No compliance certification** claims.
- **No regulator-approval** claims.
- **No "AI decided" language** in candidate copy.
- **No fabricated certainty** or probabilistic claims
  without an honest closed-vocab `confidence_label`.
- **No raw chain-of-thought** in any output.
- **No raw sensitive data** in any output.
- **No silent autonomous execution** of any kind.

Inherits ADR-0065 §5 universal no-leak doctrine + ADR-0052
non-surveillance doctrine + ADR-0058 §7 SAFE projection
pattern + ADR-0070 §8 regulator-ready security/privilege
boundaries + ADR-0070 §9 legal-advice boundary verbatim.

### 10. Legal-advice / compliance-language posture

Aligned with ADR-0070 §9 verbatim. Allowed copy in candidate
fields (`candidate_title`, `candidate_summary`,
`assumptions[]`, `expected_benefits[]`, `known_risks[]`,
`honest_note`):

- "compliance review recommended"
- "legal review recommended"
- "policy review required"
- "may require approval"
- "not a legal determination"
- "candidate only"
- "requires human decision before execution"
- "advisory only"

Forbidden copy in any candidate field:

- "legally sufficient"
- "guaranteed compliant"
- "regulator approved"
- "no fine risk"
- "automatic legal advice"
- "AI approved"
- "execute automatically"
- "this satisfies [obligation]"

### 11. Human-in-the-loop doctrine (universal)

Every candidate MUST include `honest_note` stating:

- the candidate is advisory
- the candidate has not been executed
- the candidate is not legal advice
- the candidate requires human / governance review before
  action where applicable

Wave 5 candidate generation NEVER silently executes. Wave 5
candidate generation NEVER creates Actions. Any future
transition from candidate to real work MUST route through
Section 2 Action runtime per ADR-0057 + ADR-0065 §4 + §7
Wave 8.

### 12. Persistence posture

This ADR does NOT decide whether Wave 5 implementation MUST
persist candidates. The contract at §1 is the output shape;
persistence is a separate architectural concern.

Recommended posture for the future Wave 5 implementation
slice:

- **Computed-on-read first** — the first Wave 5
  implementation SHOULD generate candidates on-demand from
  the scenario inputs without persisting them. This avoids
  introducing lifecycle, versioning, comparison, audit, and
  approval state at the same slice that introduces
  generation.
- **Persistence later** — if persistence proves necessary
  (e.g., to support Wave 6 outcome comparison or Wave 7
  best-path recommendation against a stable candidate set),
  a separate Founder-authorized ADR amendment + new schema
  slice MUST land. Persistence introduces a new audit
  surface (creation + update + soft-archive) that this ADR
  explicitly forward-queues.

NO schema change at this ADR. NO `PlaygroundCandidate`
Prisma model. NO persistence helper. Wave 4 persistence
remains the canonical persistence layer for the parent
`PlaygroundScenario` itself; candidate persistence is a
separate slice.

### 13. Audit posture

This ADR adds NO new audit literal. Future Wave 5
implementation slices MUST reuse the canonical
`ADMIN_ACTION + details.action` discriminator pattern
(Wave 4 + Section 4 + Section 6 + Section 7 + ADR-0062
precedent).

Future Wave 5 implementation slice expectations:

- **Computed-on-read generation** — emits read-audit with
  `ADMIN_ACTION + details.action = "PLAYGROUND_CANDIDATES_GENERATED"`
  (or similar closed-vocab discriminator chosen at the
  implementation slice). Safe metadata only: `scenario_id`
  + `candidate_count` + `generation_mode` (closed-vocab:
  `DETERMINISTIC` / `PYTHON_BACKED` / `BEAM_ORCHESTRATED`)
  + `source_summary` (closed-vocab list of consumed input
  categories per §4) + `policy_review_required` boolean +
  `blocked_count` integer. NEVER raw candidate text in
  `details`. NEVER raw input content.
- **Persisted candidate writes** (if and only if §12
  persistence is authorized later) — emit
  `ADMIN_ACTION + details.action = "PLAYGROUND_CANDIDATE_CREATED"`
  / `"PLAYGROUND_CANDIDATE_UPDATED"` /
  `"PLAYGROUND_CANDIDATE_ARCHIVED"`. Same safe-metadata
  posture; NEVER raw candidate text.

A new audit literal would only be required if the existing
`ADMIN_ACTION + details.action` discriminator proves
insufficient to discriminate candidate-generation reads /
writes at the regulator-tier surface. This ADR explicitly
projects that the discriminator pattern is sufficient (Wave
4 + Section 6 + Section 7 precedent).

### 14. Candidate output no-leak requirements

Every candidate response MUST NOT expose:

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
- hidden scoring
- employee identity unless explicitly in-scope per the
  caller's COSMP permission AND safely projected
- cross-org data
- privileged legal material
- regulator-backdoor data

The future Wave 5 implementation slice MUST include a
no-leak guard test enforcing every forbidden field
substring against an adversarial fixture set (per Section 7
+ Section 6 no-leak test precedent).

### 15. Wave-map alignment (preserves ADR-0065 §7)

Wave 5 contract MUST NOT accidentally implement Wave 6 / 7 /
8 / 9 / 10:

- **Wave 6** (outcome comparison + scoring rubric):
  candidate generation produces candidates; comparison +
  scoring is a separate slice consuming the candidate set.
  Wave 5 candidates carry `confidence_label` (an honest
  closed-vocab signal) but NOT a numerical score.
- **Wave 7** (best-path recommender): Wave 5 generates;
  Wave 7 recommends one of the N candidates as "best path"
  with evidence + reasoning. Wave 5 candidates carry
  `governance_findings[]` + `required_approvals[]` but NOT
  a recommended-best flag.
- **Wave 8** (governed transition to Action plan): Wave 5
  candidates carry `action_runtime_transition_hint` (a
  closed-vocab hint) but NEVER an unexecuted Action
  payload. Wave 8 translates a selected candidate + caller
  confirmation into an Action plan submitted to Section 2.
- **Wave 9** (multi-agent simulation orchestration): Wave 5
  v1 is single-pass deterministic; Wave 9 is multi-agent
  orchestration per ADR-0069 §3 domain 6 + ADR-0028 BEAM
  coordination layer.
- **Wave 10** (Control Tower frontend consumer): lives in
  the `otzar-control-tower` repo; Foundation owns the
  contract.

### 16. RULE 0 + same-org boundary (universal)

Every Wave 5 surface MUST enforce:

- **Caller scope only** — candidate generation reads only
  inputs the caller has COSMP permission for; no privileged
  cross-entity reads at the candidate-generation tier.
- **Same-org boundary** — cross-org candidate inputs are
  forbidden per ADR-0059 §1 + ADR-0037 + ADR-0061.
- **Owner-first scenario scope** — Wave 5 implementation
  MUST verify the caller owns the parent
  `PlaygroundScenario` (per Wave 4 owner-first CRUD
  precedent) before generating candidates against it. No
  cross-owner candidate generation at the v1 register.

### 17. Substrate-coherence law alignment (ADR-0069)

Per ADR-0069 §6 mandatory 8-question architecture check, the
v1 Wave 5 implementation slice belongs at the TypeScript
§2.1 register:

1. **Concurrency / long-running**: NO. Synchronous
   request/response shape.
2. **Supervision / fault isolation**: NO. Pure projection
   from existing primitives.
3. **Backpressure / streaming**: NO.
4. **Multi-agent coordination**: NO at v1; Wave 9 future-
   substrate.
5. **Event-driven flow**: NO at v1.
6. **High-throughput**: NO at v1; bounded by scenario count
   per caller.
7. **Cross-system coordination**: NO.
8. **Intelligence-heavy computation**: NO at v1
   (deterministic). Option B Python belongs at §2.4 register
   under a future boundary ADR.

V1 register: TypeScript synchronous workflow under Foundation
governance.

### 18. Bounded counts (canonical at this ADR)

The future Wave 5 implementation MUST cap candidate counts
per generation call:

- **`candidates_per_call_max`** — recommended hard cap of 8
  candidates per single generation call. Bounded to prevent
  unbounded enumeration at the API surface.
- **`assumptions_per_candidate_max`** — 8.
- **`required_inputs_per_candidate_max`** — 12.
- **`expected_benefits_per_candidate_max`** — 8.
- **`known_risks_per_candidate_max`** — 12.
- **`dependencies_per_candidate_max`** — 12.
- **`governance_findings_per_candidate_max`** — 11 (the full
  §3 vocabulary).
- **`required_approvals_per_candidate_max`** — 6 (the full
  §1 approval vocabulary).
- **`evidence_refs_per_candidate_max`** — 16.

Exact values MAY be adjusted at the implementation slice;
the cap discipline is canonical at this ADR.

### 19. Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline,
Wave 5 candidate generation contract contributes patent-
evidence-bearing material at three patents:

- **US 12,517,919 (COSMP)** — candidate generation consumes
  scoped capsule access at every input tier (§4 + §16); the
  governed-substrate boundary distinguishes NIOV's Agent
  Playground candidate-generation from any unauthorized
  parallel build at the "uncontrolled enterprise AI
  candidate proposal" claim register. Cryptographically-
  timestamped ADR-0060 + PR #100 + ADR-0065 + PR #111 +
  ADR-0072 lineage on `main`.
- **US 12,164,537 (DMW)** — candidate generation consumes
  enterprise-wallet-derived signals same-org-scoped per
  ADR-0059; enterprise-wallet portability claim is evident
  at the wallet-scoped input tier.
- **US 12,399,904 (Foundation primitives)** — candidate →
  Action runtime governed transition per §1
  `action_runtime_transition_hint` + §11 +
  ADR-0065 §7 Wave 8 is direct evidence for the governed-
  substrate primitive claim — every Playground candidate
  routes through the existing Section 2 governed execution
  surface before any real work happens.

### 20. Explicit non-goals at this commit

NO code in this commit. NO schema migration. NO new routes.
NO new audit literal. NO service-method signature change.
NO LLM generation. NO model calls. NO Python services. NO
BEAM orchestration. NO Action creation. NO connector
invocation. NO external provider calls. NO Control Tower
frontend. NO ranking / scoring engine. NO best-path
recommender. NO outcome-comparison engine. NO multi-agent
simulation runtime. NO CLAUDE.md bulk catalog edit. NO bulk
rewrite of older ADRs. NO current active slice derailment.

## Consequences

### Easier after this ADR

- Future Wave 5 implementation slices have a single canonical
  contract reference. The §1 candidate shape + §2 / §3 / §5
  / §7 closed vocabularies + §4 / §6 allowed/forbidden input
  set + §9 safety / §10 legal-advice + §11 human-in-the-loop
  doctrines are stable design contracts; the implementation
  slice does not re-litigate the contract per slice.
- The §8 three-method comparison forward-queues Option B
  (Python) and Option C (BEAM) at explicit ADR-0069 §2.4 /
  §2.3 registers with their gating ADRs named. Future scope
  creep proposals are caught early.
- The §9 + §14 no-leak doctrine + §13 audit posture +
  §16 RULE 0 universal are documented at the canonical-
  contract register; future scope creep is testable against
  these guardrails at the slice authorization tier.
- ADR-0060 stays correctly bounded at v1 inspector scope;
  ADR-0065 stays correctly bounded at product-vision tier;
  ADR-0072 sits at the contract tier between them.

### Harder after this ADR

- The §1 candidate shape is canonical. Future Wave 5
  implementation slices that need a new required top-level
  field require explicit Founder authorization + ADR
  amendment here. Additive optional fields are permitted
  at the implementation slice if and only if they preserve
  the §14 no-leak surface.
- The §2 / §3 / §5 / §7 closed vocabularies are canonical.
  Adding new values requires a future ADR amendment here.
- The §4 + §6 input set is canonical. Future implementation
  slices that need a new input category require explicit
  Founder authorization + ADR amendment.
- The §18 bounded counts are canonical at the discipline
  register; exact values may move at the implementation
  slice but the cap discipline is locked.

### Substrate-state catches resolved

- ADR-0065 §7 Wave 5 forward-queue line referenced "fixture
  / deterministic first" without locking the contract; the
  contract is now canonical at ADR-0072 §1.
- ADR-0065 §3 enumerated 10 output categories at the
  product-vision register; ADR-0072 §1 promotes the
  candidate-shape projection to the contract register with
  bounded counts (§18) and closed vocabularies (§2 / §3 /
  §5 / §7).
- ADR-0069 §2.4 deferred Python service substrate to a
  dedicated boundary ADR; ADR-0072 §8.2 names that
  prerequisite explicitly so any future Python-backed Wave 5
  slice authorization can be tested against the boundary-
  ADR requirement.

## Forward queue

Each forward-substrate slice requires separate Founder
authorization at its slice prompt:

- **Wave 5 implementation slice (Option A; deterministic /
  template-first TypeScript)** — `PlaygroundCandidateService`
  + `POST /api/v1/playground/scenarios/:id/candidates`
  (computed-on-read) + read-audit `ADMIN_ACTION +
  details.action = "PLAYGROUND_CANDIDATES_GENERATED"` + ≥25
  integration tests + no-leak guard + closed-vocab
  template library + deterministic `candidate_key` SHA-256
  hash + Section 5 doc cascade + tier-1 / tier-2 / tier-3
  doc refresh.
- **Wave 5 persistence slice (if and only if §12 proves
  necessary)** — `PlaygroundCandidate` Prisma model + safe
  CRUD + audit emission on persistence boundary + ADR-0072
  amendment locking persistence shape.
- **Wave 5 Python-backed implementation slice (Option B)** —
  requires: (a) dedicated Python service boundary ADR per
  ADR-0069 §2.4; (b) explicit Founder authorization at the
  Python slice; (c) ADR-0072 §8.2 prerequisites verified.
- **Wave 5 BEAM-orchestrated implementation slice
  (Option C)** — folds into ADR-0065 §7 Wave 9 (multi-agent
  simulation orchestration); requires ADR-0069 §6 mandatory
  8-question architecture check.
- **Wave 6** (outcome comparison + scoring rubric) — separate
  Founder slice per ADR-0065 §7.
- **Wave 7** (best-path recommender) — separate Founder
  slice per ADR-0065 §7.
- **Wave 8** (governed transition to Action runtime) —
  separate Founder slice per ADR-0065 §7.
- **Wave 9** (multi-agent simulation orchestration) —
  separate Founder slice per ADR-0065 §7 + ADR-0069 §3
  domain 6.
- **Wave 10** (Control Tower frontend consumer) — separate
  Founder slice per ADR-0065 §7; lives in
  `otzar-control-tower` repo.

## Bidirectional citations

- Cites RULE 0, RULE 4, RULE 10, RULE 12, RULE 13, RULE 19,
  RULE 20, RULE 21.
- Cites ADR-0001 (three-wallet architecture; RULE 0 source).
- Cites ADR-0002 (append-only audit chain; audit emission
  discipline).
- Cites ADR-0020 (two-register IP discipline; §19 patent-
  implementation evidence).
- Cites ADR-0026 (dual-control middleware; future approval-
  chain interaction).
- Cites ADR-0028 (BEAM coordination layer; §8.3 Option C
  prerequisite).
- Cites ADR-0036 (LawfulBasis; regulator-scope audit signals
  via §4 item 9).
- Cites ADR-0037 (jurisdiction tagging; §16 same-org
  boundary).
- Cites ADR-0048 (COE personalization-orchestration
  substrate; future scenario-tier integration; not authorized
  at this ADR).
- Cites ADR-0049 (GOVSEC umbrella; security controls at
  every Wave 5 tier).
- Cites ADR-0050 (break-glass; future Wave 8 transitions
  may need break-glass paths).
- Cites ADR-0052 (Otzar DGI doctrine; the parent product
  doctrine).
- Cites ADR-0057 (Action runtime + policy evaluator;
  §1 `action_runtime_transition_hint` + §11 human-in-the-
  loop transition to Wave 8 → Section 2).
- Cites ADR-0058 §7 (SAFE projection pattern; §14 no-leak
  posture inherited).
- Cites ADR-0059 (Section 3 Hives v1; §4 item 6 input
  source).
- Cites ADR-0060 (Section 5 Wave 1 inspector foundation;
  §4 items 2 / 3 / 4 input sources; this ADR sits ABOVE
  ADR-0060 at the contract register; ADR-0060 remains
  canonical Wave 2 implementation contract).
- Cites ADR-0061 (Section 6 analytics SAFE projection;
  §4 item 8 + §4 item 11 input sources).
- Cites ADR-0063 (governance_terms evaluator; §3
  governance_findings vocabulary precedent).
- Cites ADR-0065 (long-term product vision; this ADR closes
  ADR-0065 §7 Wave 5 forward-queue line at the contract
  register; ADR-0065 §1 / §3 / §4 / §5 / §7 / §12 inherited
  verbatim; bidirectional back-citation lands in ADR-0065
  §Forward queue Wave 5 entry per RULE 14 + RULE 20).
- Cites ADR-0066 / ADR-0067 (accepted alignment patterns; §4
  item 10 future-substrate; NOT authorized at this ADR).
- Cites ADR-0068 (proactivity precedent; `candidate_key`
  deterministic-hash pattern mirrors ADR-0068
  `card_key`).
- Cites ADR-0069 (BEAM substrate-coherence law; §8 three-
  method comparison + §17 8-question architecture check;
  bidirectional back-citation lands in ADR-0069 §Forward
  queue per RULE 14 + RULE 20).
- Cites ADR-0070 (regulator-ready doctrine; §9 legal-advice
  boundary verbatim + §10 + §16 inherited; bidirectional
  back-citation lands in ADR-0070 §Forward queue per RULE
  14 + RULE 20).
- Cites ADR-0071 (Section 7 cross-scope verify-chain;
  §4 item 9 audit-metadata input source).
- Cited from ADR-0060 §Forward queue (Wave 5 candidate
  generation; bidirectional back-citation discipline).
- Cited from ADR-0065 §Forward queue Wave 5 entry
  (bidirectional back-citation discipline; ADR-0072 closes
  the Wave 5 forward-queue line at the contract register).
- Cited from ADR-0069 §Forward queue (Wave 5 v1 TypeScript
  register confirmation; Option B Python / Option C BEAM
  forward-substrate references).
- Cited from ADR-0070 §Forward queue (Wave 5 legal-advice
  boundary inheritance; §9 vocabulary preserved verbatim
  at ADR-0072 §10).

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citations in
ADR-0065 / ADR-0069 / ADR-0070 + the architecture/README.md
catalog entry + the Section 5 build-state doc update + the
NEXT_ACTION.md baton update land under explicit Founder
authorization at
`[FOUNDER-SECTION-5-WAVE-5-CANDIDATE-GENERATION-CONTRACT-ADR-AUTH]`
2026-05-31. The authorization is **ADR-only** — the future
Wave 5 implementation slice (Option A deterministic
TypeScript) requires separate Founder authorization at its
slice. Option B (Python) requires a dedicated Python service
boundary ADR per ADR-0069 §2.4 + separate Founder
authorization. Option C (BEAM) requires ADR-0065 §7 Wave 9
authorization + ADR-0069 §6 architecture check.
