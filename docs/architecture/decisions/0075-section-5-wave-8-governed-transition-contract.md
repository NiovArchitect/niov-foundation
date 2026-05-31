# ADR-0075: Agent Playground Governed-Transition Contract — Section 5 Wave 8 (Design-Only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-SECTION-5-WAVE-8-GOVERNED-TRANSITION-CONTRACT-ADR-AUTH]`
2026-05-31 (under the Founder Section 5 autonomy directive
2026-05-31 + Founder behavioral directive 2026-05-31).

This ADR is **design-only**. NO code, NO schema migration,
NO new routes, NO new audit literal, NO service-method
signature change, NO LLM autonomy, NO model calls, NO
Python services, NO BEAM orchestration, NO Action execution
(Section 2 retains all execution authority), NO connector
invocation, NO external provider calls, NO Control Tower
frontend, NO multi-agent simulation runtime, NO personal-
life automation, NO trust-level delegation logic, NO
CLAUDE.md bulk catalog edit, NO current active slice
derailment in this commit.

Sits ABOVE ADR-0074 (Wave 7 best-path recommendation
contract) and BELOW ADR-0065 (long-term product vision) at
the **contract register**. Wave 8 is the **first Section 5
wave that creates Section 2 Action rows** — but it does so
through the existing `createActionForCaller` surface in
PROPOSED status, which Section 2's policy evaluator + dual-
control machinery already gates per ADR-0057. Wave 8 NEVER
executes; execution authority remains with the Section 2
scheduler / executor / approval chain.

## Context

### Why Wave 8 needs its own design ADR

ADR-0065 §7 forward-queues Wave 8 in two sentences:
*"governed transition from selected scenario to proposed
Action plan. Contract: recommended candidate + caller
confirmation → unexecuted Action payload submitted to the
Section 2 Action runtime per §4 human-in-the-loop
doctrine."* That framing is correct at the product-vision
register but does not lock the request shape, the
`recommended_candidate_type` → `ActionType` mapping, the
mandatory `caller_confirmation` posture, the closed-vocab
transition-outcome set, the payload-source rules, the no-
execution boundary, the audit posture, or the future route
shape.

ADR-0074 §16 + §20 forbid Wave 7 from creating Actions.
Wave 8 is the natural transition layer above: it takes a
Wave 7 recommendation + an explicit caller confirmation
and creates a Section 2 Action row in PROPOSED status,
where Section 2's existing policy evaluator decides what
happens next (AUTO_APPROVE / REQUIRE_DUAL_CONTROL /
FORBIDDEN per ADR-0057).

ADR-0075 sits at the contract tier between ADR-0074 (Wave
7 recommendation contract) and ADR-0065 (long-term product
vision). It locks **how a Wave 7 recommendation becomes a
Section 2 Action proposal** so the future Wave 8
implementation slice can be authorized against a stable
contract.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `90bf0e2`:

- **Section 5 today**: Waves 1+2+3+4+5+6+7 LIVE. Wave 4
  persistence (PR #111) + Wave 5 contract + Option A
  (PRs #134 / #136) + Wave 6 contract + Option A
  (PRs #138 / #139) + Wave 7 contract + Option A
  (PRs #141 / #142). 166 Section 5 integration tests
  passing.
- **Wave 7 Option A LIVE** (PR #142; commit `80a60f1`):
  NEW `PlaygroundBestPathRecommendationService` + NEW
  route `POST /api/v1/playground/scenarios/:id/best-path-recommendations`
  + 39 integration tests. Computed-on-read; internally
  invokes Wave 6 per ADR-0074 §10. Returns
  `RecommendBestPathSuccess` with 19 top-level fields
  (per ADR-0074 §1).
- **Section 2 Action runtime LIVE** (ADR-0057):
  `Action` Prisma model with ActionStatus enum (PROPOSED,
  APPROVED, SCHEDULED, RUNNING, SUCCEEDED, FAILED,
  CANCELLED, TIMED_OUT, REJECTED, EXPIRED). 4 ActionType
  values (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT +
  SEND_INTERNAL_NOTIFICATION + INVOKE_CONNECTOR). Existing
  `ACTION_*` audit-literal set (10 values; ACTION_PROPOSED
  + ACTION_APPROVED + ACTION_REJECTED + ACTION_SCHEDULED +
  ACTION_STARTED + ACTION_SUCCEEDED + ACTION_FAILED +
  ACTION_CANCELLED + ACTION_EXPIRED + ACTION_POLICY_UPDATE).
- **`createActionForCaller`** is the canonical Section 2
  entry point at `apps/api/src/services/action/action.service.ts:482`.
  Signature: `(callerEntityId: string, input: CreateActionInput)
  → Promise<CreateActionResult>`. Default status =
  PROPOSED; policy evaluator decides AUTO_APPROVE /
  REQUIRE_DUAL_CONTROL / REQUIRE_BREAK_GLASS / FORBIDDEN
  inline at create-time. NO immediate execution.
- **ActionPolicy LIVE** per ADR-0057: org-scoped + per-
  ActionType + per-risk_tier policy with closed-vocab
  `default_decision`. Wave 8 inherits the policy gate
  verbatim — Wave 8 does NOT bypass.
- **EscalationRequest LIVE** per ADR-0057 §5: paired
  atomically with PROPOSED Actions when policy returns
  REQUIRE_DUAL_CONTROL. Wave 8 inherits.
- **Notification model LIVE** (Section 2 Wave 12) with
  `action_id` back-link; `notification_class` is free-form
  label. Wave 8 may emit a Notification (forward-substrate
  at v1 implementation; not authorized at this ADR).

The substrate to support Wave 8 governed transition exists
today at the foundational tier. The missing piece is the
contract — which is what this ADR locks.

### Patent + doctrine alignment

- **US 12,517,919 (COSMP)** — governed transition consumes
  Wave 7 recommendation output that is itself scope-bounded
  by caller's COSMP permission. The governed-substrate
  boundary distinguishes NIOV's Agent Playground transition
  surface from any unauthorized parallel build at the
  "uncontrolled enterprise AI action transition" claim
  register.
- **US 12,164,537 (DMW)** — enterprise-wallet boundaries
  inherited verbatim from Wave 7 (no cross-org inputs reach
  Wave 8).
- **US 12,399,904 (Foundation primitives)** — Wave 8
  routes the recommendation → Action transition through
  the existing Section 2 governed-execution substrate per
  ADR-0057. Section 2 retains all execution authority. The
  Wave 5 → Wave 6 → Wave 7 → Wave 8 → Section 2 pipeline
  is the canonical governed-substrate evidence trail.
- **ADR-0052 Otzar DGI doctrine** — Wave 8 is the
  transition layer that translates the Playground "thinking
  before acting" surface into the Section 2 "acting under
  governance" surface. The transition is bounded by RULE 0
  + same-org + policy + approvals + audit + dual-control
  where required.
- **ADR-0057** — Wave 8 inherits ALL Section 2 controls
  verbatim. Wave 8 is a CONSUMER of `createActionForCaller`,
  not a replacement.
- **ADR-0069 BEAM substrate-coherence law** — Wave 8 v1
  belongs at TypeScript §2.1 register (synchronous
  request/response; deterministic mapping).
- **ADR-0070 §9 legal-advice boundary** — Wave 8 honors §9
  verbatim; transition copy NEVER claims legal sufficiency.

## Decision

Foundation canonicalizes the **governed-transition
contract** for Agent Playground Wave 8. A governed
transition takes a Wave 7 best-path recommendation + an
explicit caller confirmation and produces ONE of two safe
outcomes:

1. A Section 2 Action row created in PROPOSED status via
   the existing `createActionForCaller` surface — Section
   2 then governs approval / execution per ADR-0057.
2. A `NO_ACTION_PROPOSED` outcome with closed-vocab
   `reason_not_proposed`, when the recommendation cannot
   safely be translated to an Action at v1 (e.g.,
   `STATUS_QUO` / `DO_NOT_PROCEED` recommendations).

Wave 8 NEVER executes the Action. Wave 8 NEVER bypasses
the Section 2 policy evaluator. Wave 8 NEVER accepts
caller-supplied recommendation payloads. Wave 8 v1 ONLY
allows `SEND_INTERNAL_NOTIFICATION` as the target
ActionType (internal-only; safe-by-construction). Wave 8
ALWAYS requires `caller_confirmation: true` in the request
body — there is no implicit-confirmation path.

### 1. What a governed transition response IS (contract)

A transition response is a structured projection with the
following canonical top-level shape:

```text
GovernedTransitionResponse:
  ok: true
  scenario_id: string
  transitioned_at: string (ISO 8601)
  transition_outcome: TransitionOutcome (closed-vocab; see §3)
  recommended_candidate_key: string (echoed from Wave 7)
  recommended_candidate_type: PlaygroundCandidateType (echoed)
  recommendation_summary: string (≤600 chars; closed-style)

  // Only populated when transition_outcome = ACTION_PROPOSED:
  action_id?: string
  action_status?: ActionStatus (PROPOSED / APPROVED / REJECTED;
                                  Section 2 sets this verbatim
                                  per ADR-0057 §1)
  action_type?: ActionType (closed-vocab; see §4)
  action_risk_tier?: ActionRiskTier (LOW / MEDIUM / HIGH /
                                       CRITICAL)
  action_decision?: ActionDecision (AUTO_APPROVE /
                                       REQUIRE_DUAL_CONTROL /
                                       REQUIRE_BREAK_GLASS /
                                       FORBIDDEN)
  escalation_id?: string (when REQUIRE_DUAL_CONTROL)

  // Only populated when transition_outcome = NO_ACTION_PROPOSED:
  reason_not_proposed?: ReasonNotProposed (closed-vocab; see §5)

  required_approvals: RequiredApproval[] (closed-vocab; echoed
                                            from Wave 7)
  required_reviews: PlaygroundRequiredReview[] (echoed from
                                                 Wave 7)
  human_decision_required: boolean
  honest_note: string
  playground_audit_event_id: string
  action_audit_event_id?: string (when Section 2 emits its
                                    own ACTION_PROPOSED /
                                    ACTION_APPROVED /
                                    ACTION_REJECTED row)
```

NEVER populated:

- raw `payload_redacted` content beyond closed-vocab
  metadata.
- numeric scores / probabilities / win-probability.
- raw scenario `input_refs` / `constraints` /
  `expected_outputs` / raw `governance_findings` JSON.
- chain-of-thought / prompts / raw transcripts /
  embeddings / vectors / storage locations / content
  hashes / bridge IDs / secret refs.

### 2. Request body shape (canonical at this ADR)

```text
POST /api/v1/playground/scenarios/:id/governed-transitions

Body:
  caller_confirmation: true (REQUIRED; literal boolean true)
  intended_action_type?: ActionType (optional; if omitted,
                                        Wave 8 derives from the
                                        Wave 7 recommendation
                                        per §4 mapping)
  idempotency_key: string (REQUIRED per ADR-0057; UUID v4
                              recommended; caller-supplied;
                              Section 2 enforces uniqueness)
  candidate_types?: PlaygroundCandidateType[] (optional;
                                                  passes through
                                                  to internal
                                                  Wave 7 →
                                                  Wave 6 → Wave 5
                                                  call)
  max_candidates?: number (optional; capped per ADR-0073 §11)
  comparison_mode?: PlaygroundComparisonMode (optional;
                                                 passes through
                                                 to Wave 6)
  recommendation_mode?: PlaygroundRecommendationMode (optional;
                                                        passes
                                                        through
                                                        to Wave 7)
```

Forbidden body fields (NEVER accepted at v1):

- `candidate_keys[]` (deferred at Wave 6/7 per Founder
  QLOCK 2 inherited).
- caller-supplied recommendation payloads.
- caller-supplied comparison payloads.
- caller-supplied candidate payloads.
- caller-supplied `payload_summary` or `payload_redacted`
  for the Action.
- freeform instructions / custom scoring weights.
- `execute` / `auto_approve` / `bypass_policy` /
  `bypass_dual_control` flags.
- `action_id` (Wave 8 creates the Action; caller cannot
  reuse an existing Action_id).

`caller_confirmation` MUST be the literal boolean `true`;
any other value (false, missing, truthy non-boolean) → 422
`INVALID_REQUEST` with `invalid_fields: ["caller_confirmation"]`.

### 3. `transition_outcome` — closed vocabulary (v1)

Two values at v1. Adding a new value requires a future
Founder-authorized ADR amendment.

- `ACTION_PROPOSED` — Wave 8 created a Section 2 Action row
  in PROPOSED status (or APPROVED if Section 2 policy
  evaluator returned AUTO_APPROVE; or REJECTED if returned
  FORBIDDEN). Section 2 governs the approval chain from
  here.
- `NO_ACTION_PROPOSED` — Wave 8 did NOT create an Action
  row. The recommendation either cannot be translated
  safely to an Action at v1 (e.g., `STATUS_QUO` /
  `DO_NOT_PROCEED`) or the `intended_action_type` does not
  match the §4 mapping. `reason_not_proposed` carries the
  closed-vocab reason.

### 4. `recommended_candidate_type` → `ActionType` mapping (v1)

Wave 8 v1 maps as follows. The mapping is CONSERVATIVE
BY DESIGN — only `SEND_INTERNAL_NOTIFICATION` is allowed at
v1 (internal-only ActionType; no external side effects;
safe-by-construction). Future Founder-authorized ADR-0075
amendments may extend the mapping to additional ActionTypes
per recommended_candidate_type.

| recommended_candidate_type | v1 transitionable? | mapped ActionType | notes |
|----------------------------|--------------------|--------------------|-------|
| `STATUS_QUO`               | NO                 | —                  | `NO_ACTION_PROPOSED` with reason `STATUS_QUO_NOT_TRANSITIONABLE`. |
| `LOW_RISK_INCREMENTAL`     | YES                | `SEND_INTERNAL_NOTIFICATION` | Notify owner that the recommended incremental change requires review before action. |
| `SPEED_OPTIMIZED`          | YES                | `SEND_INTERNAL_NOTIFICATION` | Notify owner; `human_decision_required = true`; framing-loaded type carries explicit caveat. |
| `COST_OPTIMIZED`           | YES                | `SEND_INTERNAL_NOTIFICATION` | Notify owner; `human_decision_required = true`; framing-loaded type carries explicit caveat. |
| `COMPLIANCE_FIRST`         | YES                | `SEND_INTERNAL_NOTIFICATION` | Notify owner that compliance review is required. |
| `CUSTOMER_IMPACT_FIRST`    | YES                | `SEND_INTERNAL_NOTIFICATION` | Notify owner; `human_decision_required = true`. |
| `OPERATIONAL_RESILIENCE`   | YES                | `SEND_INTERNAL_NOTIFICATION` | Notify owner that resilience review / dual-control may be required. |
| `HUMAN_REVIEW_REQUIRED`    | YES                | `SEND_INTERNAL_NOTIFICATION` | Notify owner that a human decision is required before any further step. |
| `DO_NOT_PROCEED`           | NO                 | —                  | `NO_ACTION_PROPOSED` with reason `DO_NOT_PROCEED_BLOCKED`. |

When `intended_action_type` is provided by the caller, it
MUST match the mapping row above; mismatch → 422
`INVALID_REQUEST` with `invalid_fields: ["intended_action_type"]`.

When `intended_action_type` is omitted, Wave 8 derives the
ActionType from the mapping row above.

Mapping is closed-vocab. Adding a new ActionType to a row
requires a future Founder-authorized ADR amendment here
+ verification that the ActionType is internal-only or
otherwise safe-by-construction.

### 5. `reason_not_proposed` — closed vocabulary (v1)

When `transition_outcome === NO_ACTION_PROPOSED`, exactly
one closed-vocab `reason_not_proposed` is emitted.

- `STATUS_QUO_NOT_TRANSITIONABLE` — recommendation was
  STATUS_QUO; the safe action is to maintain current
  trajectory, not to create a new Action.
- `DO_NOT_PROCEED_BLOCKED` — recommendation was
  DO_NOT_PROCEED; safety gate fired; no transition path
  exists.
- `BLOCKED_BY_POLICY_OR_GOVERNANCE` — Wave 7
  `blocked_by_policy === true` for the recommended
  candidate; no transition path exists at v1.
- `BLOCKED_BY_ACTION_RUNTIME_TRANSITION_HINT` — Wave 7
  `action_runtime_transition_hint === "BLOCKED"`; no
  transition path exists at v1.

### 6. Payload construction (canonical at this ADR)

Wave 8 implementation constructs the Action's
`payload_summary` + `payload_redacted` from closed-vocab
Wave 7 fields only. NEVER from caller-supplied input;
NEVER from raw scenario JSON.

**`payload_summary`** — bounded closed-style string ≤400
chars derived from:
- `scenario_id`
- `recommended_candidate_type`
- `recommendation_mode`
- a closed-vocab summary phrase mirroring ADR-0074 §16
  honest_note conventions.

Example: `"Playground governed transition: COMPLIANCE_FIRST
recommendation for scenario <scenario_id>. Internal
notification proposed; not executed; requires governance
review per Wave 7 recommendation."`

**`payload_redacted`** — closed-vocab JSON object with
exactly these keys:

```text
{
  source: "agent_playground_wave_8",
  scenario_id: string,
  recommended_candidate_key: string,
  recommended_candidate_type: PlaygroundCandidateType,
  recommendation_mode: PlaygroundRecommendationMode,
  comparison_mode: PlaygroundComparisonMode,
  recommendation_reasons: PlaygroundRecommendationReason[],
  governance_findings: PlaygroundGovernanceFinding[],
  required_reviews: PlaygroundRequiredReview[],
  action_transition_readiness: PlaygroundActionTransitionReadiness,
  human_decision_required: boolean,
  playground_audit_event_id: string  // links to Wave 7's audit row
}
```

Forbidden in `payload_redacted` (universal):

- raw scenario text (title / description / goal_summary /
  input_refs / constraints / expected_outputs / raw
  governance_findings JSON).
- raw candidate text (candidate_title / candidate_summary /
  assumptions / known_risks / expected_benefits).
- raw recommendation text (recommendation_summary).
- numeric scores / probabilities / weights.
- chain-of-thought / prompts / raw transcripts /
  embeddings / vectors / storage locations / content
  hashes / bridge IDs / secret refs.

### 7. "Wave 8 calls Wave 7 internally" canonical decision

Wave 8 implementation MUST internally invoke
`PlaygroundBestPathRecommendationService.recommendBestPath`
for the same scenario id and the caller's session token. It
MUST NOT accept arbitrary caller-supplied recommendation,
comparison, or candidate payloads.

Rationale:

- Trusting caller-supplied recommendation payloads would
  create a payload-injection surface (caller could submit
  fabricated recommendation text bypassing the closed-vocab
  priority ladder).
- Re-deriving the recommendation deterministically from the
  scenario guarantees the Action's `payload_redacted`
  reflects the same Wave 5 → Wave 6 → Wave 7 → Wave 8
  pipeline output the caller would receive from invoking
  each Wave route independently.

If Wave 7 returns a failure (SESSION_INVALID, SCENARIO_NOT_FOUND,
INVALID_REQUEST, INTERNAL_ERROR), Wave 8 surfaces the
failure verbatim — NEVER creates an Action.

### 8. Section 2 Action runtime integration

Wave 8 calls `createActionForCaller(callerEntityId, {
  action_type: <mapped per §4>,
  target_entity_id: null,  // §4 mapping is SEND_INTERNAL_NOTIFICATION
                            // to the owner; target = self
  idempotency_key: <caller-supplied>,
  payload_summary: <Wave 8-constructed per §6>,
  payload_redacted: <Wave 8-constructed per §6>
})`.

The returned `CreateActionResult` is mapped to the Wave 8
response:

- `result.ok === true` → `transition_outcome =
  ACTION_PROPOSED`; populate `action_id` / `action_status` /
  `action_type` / `action_risk_tier` / `action_decision` /
  `escalation_id` from `result.view`.
- `result.ok === false` with `httpStatus = 409` (idempotency
  collision) → 409 `IDEMPOTENCY_KEY_COLLISION` (Wave 8
  surfaces the Section 2 failure verbatim).
- `result.ok === false` with policy FORBIDDEN → Section 2
  emits `ACTION_REJECTED`; Wave 8 surfaces
  `transition_outcome = ACTION_PROPOSED` with
  `action_status = REJECTED` so the caller sees the gating
  outcome (NOT a Wave 8 reason_not_proposed).
- `result.ok === false` with auth failure → Wave 8 surfaces
  401 / 403 verbatim.

Wave 8 NEVER modifies Section 2 behavior. Wave 8 NEVER
bypasses the policy evaluator. Wave 8 NEVER overrides the
dual-control gate. Wave 8 NEVER skips audit emission.

### 9. Audit posture

Wave 8 emits TWO audit rows for an `ACTION_PROPOSED`
outcome:

1. **Playground handoff row** (Wave 8's own emission):
   `event_type = ADMIN_ACTION` + `details.action =
   "PLAYGROUND_GOVERNED_TRANSITION_PROPOSED"`. Safe metadata
   only:
   - `scenario_id`
   - `recommended_candidate_key`
   - `recommended_candidate_type`
   - `recommendation_mode`
   - `action_id` (the newly-created Action row)
   - `action_type`
   - `action_decision` (closed-vocab)
   - `action_status` (closed-vocab)
   - `human_decision_required`
   - `caller_confirmation_received` (always true)

   NEVER raw recommendation/comparison/candidate text.
   NEVER raw scenario JSON. NEVER scores. NEVER legal-
   compliance conclusions.

2. **Section 2 Action audit row** (emitted by
   `createActionForCaller` per ADR-0057): `ACTION_PROPOSED`
   or `ACTION_APPROVED` or `ACTION_REJECTED`. Wave 8 does
   NOT control this audit row; it surfaces the resulting
   `audit_id` as `action_audit_event_id` in the response.

For `NO_ACTION_PROPOSED` outcomes, Wave 8 emits ONLY the
Playground handoff row with:
   - `details.action = "PLAYGROUND_GOVERNED_TRANSITION_DECLINED"`
   - `reason_not_proposed` (closed-vocab; per §5)
   - all other safe metadata fields as above (minus
     `action_id` / `action_type` / `action_decision` /
     `action_status` since no Action was created).

ZERO new audit literal. Both row types reuse existing
`ADMIN_ACTION` + `ACTION_PROPOSED` / `ACTION_APPROVED` /
`ACTION_REJECTED` literals.

### 10. No-leak doctrine (universal)

Every transition response MUST NOT expose:

- raw capsule content
- raw transcript
- raw prompt
- chain-of-thought
- raw audit details
- connector secrets / credentials
- storage locations
- content hashes
- embeddings / vectors
- bridge IDs
- permission internals
- hidden scoring (numeric scores or weights of any kind)
- numeric `score` / `rank` / `winner` / `probability` /
  `roi` field names
- employee identity beyond what's already safely surfaced
  in Wave 7
- cross-org data
- privileged legal material
- regulator-backdoor data

The future Wave 8 implementation slice MUST include a
no-leak guard test enforcing every forbidden field substring
against an adversarial fixture set.

### 11. RULE 0 + same-org boundary (universal)

Every Wave 8 surface MUST enforce:

- **Caller scope only** — transition reads only
  recommendation output produced from a scenario the
  caller owns.
- **Same-org boundary** — cross-org inputs forbidden;
  inherited via Wave 7 → Wave 6 → Wave 5 → Wave 4
  delegation.
- **Owner-first scenario scope** — Wave 8 implementation
  verifies the caller owns the parent `PlaygroundScenario`
  before any transition action.
- **Action ownership** — the created Action's
  `source_entity_id` = `callerEntityId`; `target_entity_id`
  per §8 (null for SEND_INTERNAL_NOTIFICATION since target
  is the owner themselves).

### 12. Caller confirmation discipline

`caller_confirmation: true` is REQUIRED at every Wave 8
invocation. There is no implicit-confirmation path. Missing
or non-true `caller_confirmation` → 422 `INVALID_REQUEST`
with `invalid_fields: ["caller_confirmation"]`.

This discipline mirrors the Founder behavioral directive's
emphasis on advisory recommendation + explicit human
confirmation before transition. Wave 8 NEVER silently
escalates from Wave 7 recommendation to Action creation.

### 13. Idempotency discipline

`idempotency_key` is REQUIRED at every Wave 8 invocation,
mirroring Section 2's existing idempotency contract per
ADR-0057. Wave 8 passes the key through verbatim to
`createActionForCaller`; idempotency collisions surface as
Section 2's existing 409 `IDEMPOTENCY_KEY_COLLISION`.

Wave 8 does NOT derive idempotency keys internally. The
caller is responsible for providing a stable UUID per
intended transition.

### 14. Bounded counts (canonical at this ADR)

- `payload_summary_max_chars` — 400.
- `recommendation_summary_max_chars` — 600 (mirrors
  ADR-0074 §11).
- `required_approvals_per_response_max` — 6 (mirrors
  ADR-0072 §18).
- `required_reviews_per_response_max` — 9 (mirrors
  ADR-0073 §5).

Exact values MAY be adjusted at the implementation slice;
the cap discipline is canonical at this ADR.

### 15. Implementation-method comparison (canonical at this ADR)

#### 15.1. Option A — Deterministic TypeScript first

- **Where**: `apps/api/src/services/playground/` —
  additive `PlaygroundGovernedTransitionService` alongside
  the existing Wave 5/6/7 services.
- **Mechanism**: closed-vocab `recommended_candidate_type`
  → `ActionType` mapping per §4 + deterministic
  `payload_redacted` construction per §6 + delegated
  `createActionForCaller` call per §8.
- **Explainability**: total — every output token is
  traceable to a closed-vocab signal.
- **Safety**: highest — no LLM autonomy, no hidden
  reasoning, no fabricated probabilistic claims, no winner-
  declaration framing.
- **ADR-0069 register**: TypeScript §2.1 (synchronous
  request/response).
- **Recommended posture for first Wave 8 implementation
  slice.**

#### 15.2. Option B — Python AI service

- **Where**: NEW Python service at a future boundary ADR
  per ADR-0069 §2.4.
- **NOT authorized at this ADR.**

#### 15.3. Option C — BEAM-orchestrated

- **Where**: NEW BEAM service per ADR-0069 §3 domain 6 +
  ADR-0028 BEAM coordination layer.
- **NOT authorized at this ADR.** Folds into Wave 9.

#### 15.4. Recommended posture for v1 implementation

Deterministic / template-first TypeScript (Option A).

### 16. Persistence posture

Wave 8 PERSISTS Section 2 Action rows via
`createActionForCaller` — this is intentional per Section
2 substrate. Wave 8 does NOT introduce a new Prisma model.
Wave 8 does NOT persist its own Playground-tier transition-
record table at v1 (the `ADMIN_ACTION` +
`details.action = "PLAYGROUND_GOVERNED_TRANSITION_PROPOSED"`
audit row provides the canonical history record).

A future Founder-authorized ADR amendment MAY introduce a
`PlaygroundGovernedTransition` Prisma model if a queryable
Playground-tier transition history surface is required.
ADR-0075 does NOT authorize that.

### 17. Future route shape (canonical at this ADR)

The future Wave 8 implementation slice SHOULD register:

`POST /api/v1/playground/scenarios/:id/governed-transitions`

Bearer + "write" permission (mirrors Section 2's `POST
/api/v1/actions` permission; Wave 8 creates Action rows so
requires the higher-scope write permission, NOT "read").

Failure-code mapping uses the canonical Section 5 surface:

- 200: `GovernedTransitionResponse` per §1.
- 401 / 403: auth failures (inherited from Wave 7 →
  Section 2).
- 404: `SCENARIO_NOT_FOUND` (enumeration-safe; inherited
  via Wave 7 → Wave 6 → Wave 5 → Wave 4 delegation).
- 409: `IDEMPOTENCY_KEY_COLLISION` (surfaced verbatim
  from Section 2).
- 422: `INVALID_REQUEST` + `invalid_fields[]`
  (`caller_confirmation` / `intended_action_type` /
  `idempotency_key` / `candidate_types` / `max_candidates` /
  `comparison_mode` / `recommendation_mode`).
- 503: Section 2 transient failure (surfaced verbatim).
- 500: catch-all.

### 18. Human-in-the-loop doctrine (universal)

Every transition response MUST include top-level
`honest_note` stating:

- the Action (if proposed) is in PROPOSED / APPROVED /
  REJECTED status only — NEVER RUNNING / SUCCEEDED /
  FAILED at the Wave 8 response moment.
- the Action has NOT been executed by Wave 8.
- the Section 2 Action runtime governs all subsequent
  approvals + execution per ADR-0057.
- the transition is NOT legal advice.
- the recommendation that drove the transition was
  advisory only.

`human_decision_required` is TRUE whenever:
- the underlying Wave 7 recommendation had
  `human_decision_required = true`, OR
- the resulting Action has `action_decision !=
  AUTO_APPROVE`, OR
- the resulting `action_status` is `REJECTED`, OR
- the transition outcome is `NO_ACTION_PROPOSED`.

Wave 8 NEVER claims final-decision authority. Wave 8 NEVER
silently escalates. Wave 8 NEVER auto-approves bypass of
the Section 2 policy evaluator.

### 19. Substrate-coherence law alignment (ADR-0069)

Per ADR-0069 §6 mandatory 8-question architecture check,
the v1 Wave 8 implementation slice belongs at the
TypeScript §2.1 register:

1. **Concurrency / long-running**: NO. Synchronous
   request/response shape.
2. **Supervision / fault isolation**: NO. Pure projection
   + delegation to Section 2.
3. **Backpressure / streaming**: NO.
4. **Multi-agent coordination**: NO at v1; Wave 9
   forward-substrate.
5. **Event-driven flow**: NO at v1 (Section 2's scheduler
   is event-driven for execution, but Wave 8 itself is
   synchronous).
6. **High-throughput**: NO at v1.
7. **Cross-system coordination**: NO (Section 2 owns
   any cross-system coordination during execution).
8. **Intelligence-heavy computation**: NO at v1
   (deterministic mapping). Option B Python belongs at
   §2.4 register under a future boundary ADR.

V1 register: TypeScript synchronous workflow under
Foundation governance.

### 20. Wave-map alignment (preserves ADR-0065 §7 + prior
ADRs)

Wave 8 contract MUST NOT accidentally implement Wave 9 /
10:

- **Wave 9** (multi-agent simulation orchestration):
  Wave 8 v1 is single-pass deterministic; Wave 9 is multi-
  agent orchestration per ADR-0069 §3 domain 6 + ADR-0028.
- **Wave 10** (Control Tower frontend consumer): lives in
  the `otzar-control-tower` repo; Foundation owns the
  contract.

Wave 8 explicitly EXCLUDES:

- direct Action execution (Section 2 scheduler / executor
  retains all execution authority).
- new ActionType creation beyond the §4 mapping.
- bypass of Section 2 policy evaluator.
- bypass of dual-control / break-glass / escalation chain.
- bypass of audit emission.
- bypass of `idempotency_key` uniqueness.
- bypass of `caller_confirmation` requirement.

### 21. Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline, Wave 8
governed-transition contract contributes patent-evidence-
bearing material:

- **US 12,517,919 (COSMP)** — transition consumes Wave 7
  recommendation output scope-bounded by caller's COSMP
  permission. Cryptographically-timestamped Wave 5 →
  Wave 6 → Wave 7 → Wave 8 → Section 2 pipeline lineage on
  `main`.
- **US 12,164,537 (DMW)** — enterprise-wallet boundaries
  inherited verbatim.
- **US 12,399,904 (Foundation primitives)** — Wave 8
  routes the recommendation → Action transition through
  the existing Section 2 governed-execution substrate per
  ADR-0057. Wave 8 is the **first Section 5 wave that
  crosses into Section 2** and the crossing is governed-
  substrate-evident at every layer (policy evaluator +
  dual-control + audit chain + escalation chain).

### 22. Future generalization (long-term trust-governed mapping context)

This section is **strategic context only** per ADR-0074
§22 + the Founder behavioral directive. It does NOT
authorize personal-life automation, consumer Otzar
execution, trust-level delegation logic, autonomous
execution, or any non-enterprise Wave 8 implementation.

Wave 8 establishes the canonical architectural pattern for
**recommendation → consent → governed action** transition.
Future personal-life mapping per ADR-0074 §22 inherits this
pattern verbatim — the system NEVER acts without explicit
caller confirmation; the system NEVER bypasses governed
execution; the system NEVER claims final-decision authority.

A future Founder-authorized ADR may eventually extend this
pattern to personal trust-governed mapping (e.g., low-trust
"suggest only" / medium-trust "recommend + prepare" /
high-trust "act within pre-approved scoped reversible
boundaries"). ADR-0075 does NOT authorize that.

### 23. Explicit non-goals at this commit

NO code in this commit. NO schema migration. NO new routes.
NO new audit literal. NO service-method signature change.
NO LLM generation. NO model calls. NO Python services. NO
BEAM orchestration. NO Action execution by Wave 8 (Section
2 retains all execution authority). NO Action ActionType
beyond §4 mapping. NO bypass of Section 2 policy
evaluator. NO bypass of dual-control. NO connector
invocation. NO external provider calls. NO Control Tower
frontend. NO multi-agent simulation runtime. NO new
Prisma model. NO `PlaygroundGovernedTransition` table. NO
direct creation of Notification rows (Wave 8 may rely on
Section 2's existing SEND_INTERNAL_NOTIFICATION ActionType
handler to deliver the notification through governed
execution; Wave 8 does NOT bypass Section 2's notification
pipeline). NO personal-life automation. NO trust-level
delegation logic. NO CLAUDE.md bulk catalog edit. NO bulk
rewrite of older ADRs. NO current active slice derailment.

## Consequences

### Easier after this ADR

- Future Wave 8 implementation slices have a single
  canonical contract reference. §1 / §3 / §4 / §5 / §6 /
  §17 close the contract surface.
- The §7 "Wave 8 calls Wave 7 internally" + §8 Section 2
  delegation pattern prevent caller-supplied payloads from
  ever bypassing the deterministic pipeline.
- The §12 mandatory `caller_confirmation` discipline
  prevents accidental escalation from Wave 7 to Action
  creation.
- The §4 conservative mapping (ONLY
  SEND_INTERNAL_NOTIFICATION at v1) gives the safest
  possible first step — no external side effects, no
  connector invocation, no data write beyond audit +
  Notification delivery (governed by Section 2).
- ADR-0074 stays correctly bounded; ADR-0065 stays
  correctly bounded at product-vision tier; ADR-0075 sits
  at the contract tier between them.

### Harder after this ADR

- The §4 mapping is canonical. Adding new ActionTypes to
  the mapping requires future Founder-authorized ADR
  amendment + verification that the new ActionType is
  safe-by-construction.
- The §12 `caller_confirmation` posture means callers
  cannot script-batch transitions without explicit per-
  call confirmation. Intentional.
- The §8 Section 2 delegation means Wave 8 cannot add
  Action-runtime features (retry budget, attempt timeout
  override, scheduler behavior) — those live at ADR-0057
  and any change requires a Section 2 ADR.
- The §16 "no new Prisma model" decision means
  Playground-tier transition history is queryable only via
  the audit chain (`ADMIN_ACTION + details.action =
  "PLAYGROUND_GOVERNED_TRANSITION_PROPOSED"`). A future
  amendment may introduce a queryable transition table if
  Wave 10 Control Tower needs it.

### Substrate-state catches resolved

- ADR-0065 §7 Wave 8 forward-queue line referenced
  "governed transition from selected scenario to proposed
  Action plan" without locking the contract; the contract
  is now canonical at ADR-0075.
- ADR-0074 §16 + §20 forbid Wave 7 from creating Actions;
  ADR-0075 §8 canonicalizes how Wave 8 DOES create Actions
  (through Section 2's existing `createActionForCaller`,
  not via a Wave 8-owned Action-creation path).
- ADR-0057's existing PROPOSED → APPROVED → REJECTED gate
  + policy evaluator + dual-control are leveraged verbatim;
  ADR-0075 does NOT introduce a parallel approval surface.

## Forward queue

Each forward-substrate slice requires separate Founder
authorization at its slice prompt:

- **Wave 8 implementation slice (Option A; deterministic /
  template-first TypeScript)** —
  `PlaygroundGovernedTransitionService` + `POST
  /api/v1/playground/scenarios/:id/governed-transitions`
  (computed-on-read recommendation + Section 2 Action
  creation) + read-audit `ADMIN_ACTION + details.action =
  "PLAYGROUND_GOVERNED_TRANSITION_PROPOSED" /
  "PLAYGROUND_GOVERNED_TRANSITION_DECLINED"` + ≥25
  integration tests + no-leak guard + closed-vocab mapping
  table per §4 + bounded counts + Section 2 delegation
  pattern.
- **Wave 8 persistence slice (if §16 proves necessary)** —
  `PlaygroundGovernedTransition` Prisma model + safe CRUD
  + audit emission on persistence boundary + ADR-0075
  amendment.
- **Wave 8 extended ActionType mapping** — adding
  RECORD_CAPSULE / PROPOSE_PERMISSION_GRANT /
  INVOKE_CONNECTOR to the §4 mapping requires future
  Founder-authorized ADR amendment.
- **Wave 8 Option B Python-backed implementation slice** —
  requires Python service-boundary ADR per ADR-0069 §2.4.
- **Wave 8 Option C BEAM-orchestrated** — folds into Wave 9.
- **Wave 9** (multi-agent simulation orchestration) —
  separate Founder slice per ADR-0065 §7 + ADR-0069 §3
  domain 6.
- **Wave 10** (Control Tower frontend consumer) — separate
  Founder slice per ADR-0065 §7; lives in
  `otzar-control-tower` repo.

## Bidirectional citations

- Cites RULE 0, RULE 4, RULE 10, RULE 12, RULE 13, RULE
  19, RULE 20, RULE 21.
- Cites ADR-0001 (three-wallet architecture; RULE 0
  source).
- Cites ADR-0002 (append-only audit chain; audit emission
  discipline).
- Cites ADR-0020 (two-register IP discipline; §21
  patent-implementation evidence).
- Cites ADR-0026 (dual-control middleware; §8 inherits
  the existing dual-control + escalation pattern via
  Section 2 delegation).
- Cites ADR-0028 (BEAM coordination layer; §15.3 Option C
  prerequisite).
- Cites ADR-0050 (break-glass; future REQUIRE_BREAK_GLASS
  decisions in Section 2 policy evaluator).
- Cites ADR-0052 (Otzar DGI doctrine; parent product
  doctrine).
- Cites ADR-0057 (Action runtime — load-bearing; ADR-0075
  is a CONSUMER of ADR-0057's `createActionForCaller`;
  bidirectional back-citation lands in ADR-0057 §Forward
  queue per RULE 14 + RULE 20).
- Cites ADR-0059 (Section 3 Hives v1; §11 same-org
  boundary).
- Cites ADR-0065 (long-term product vision; this ADR
  closes ADR-0065 §7 Wave 8 forward-queue line at the
  contract register; bidirectional back-citation lands in
  ADR-0065 §Forward queue Wave 8 entry per RULE 14 + RULE
  20).
- Cites ADR-0069 (BEAM substrate-coherence law; §15
  three-method comparison + §19 8-question architecture
  check; bidirectional back-citation lands in ADR-0069
  §Forward queue per RULE 14 + RULE 20).
- Cites ADR-0070 (regulator-ready doctrine; §10 no-leak
  doctrine + §18 honest_note inherit §9 legal-advice
  boundary verbatim).
- Cites ADR-0072 (Wave 5 candidate-generation contract;
  consumed transitively via Wave 6 + Wave 7).
- Cites ADR-0073 (Wave 6 outcome-comparison contract;
  consumed transitively via Wave 7).
- Cites ADR-0074 (Wave 7 best-path recommendation
  contract; this ADR sits ABOVE ADR-0074 at the contract
  register; Wave 8 consumes the Wave 7
  `RecommendBestPathSuccess` verbatim via §7 + §8;
  bidirectional back-citation lands in ADR-0074 §Forward
  queue per RULE 14 + RULE 20).
- Cited from ADR-0060 §Forward queue (Wave 8 governed
  transition; bidirectional back-citation discipline).
- Cited from ADR-0065 §Forward queue Wave 8 entry
  (ADR-0075 closes the line at the contract register).
- Cited from ADR-0069 §Forward queue (Wave 8 v1
  TypeScript register confirmation).
- Cited from ADR-0070 §Forward queue (Wave 8 legal-advice
  boundary inheritance).
- Cited from ADR-0074 §Forward queue (Wave 8 as the next
  scenario-tier projection above Wave 7 recommendation).

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citations
in ADR-0057 / ADR-0065 / ADR-0069 / ADR-0070 / ADR-0074 +
the architecture/README.md catalog entry + the Section 5
build-state doc update + the NEXT_ACTION.md baton update
land under explicit Founder authorization at
`[FOUNDER-SECTION-5-WAVE-8-GOVERNED-TRANSITION-CONTRACT-ADR-AUTH]`
2026-05-31 (under the Founder Section 5 autonomy directive
2026-05-31 + Founder behavioral directive 2026-05-31). The
authorization is **ADR-only** — the future Wave 8
implementation slice (Option A deterministic TypeScript)
requires separate Founder authorization at its slice.
Option B (Python) requires a dedicated Python service-
boundary ADR per ADR-0069 §2.4. Option C (BEAM) requires
ADR-0065 §7 Wave 9 authorization + ADR-0069 §6
architecture check.

§22 future generalization is **strategic context only**.
It does NOT authorize personal-life automation, consumer
Otzar execution, trust-level delegation logic, autonomous
execution, or any non-enterprise Wave 8 implementation.
