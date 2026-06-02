# W4 — Proposed Action Substrate

> Static proposed-action substrate that operationalizes ADR-0081 **Stage 3 (Proposed Action)** workflows per plan archetype. Each plan-archetype catalog enumerates a closed-vocab set of proposed actions cross-referenced into the existing W3 workflow recommendation catalogs (`docs/workflow-recommendation/`).

> **Static substrate + validator only.** Every `proposed_action_state` is `PROPOSED_NOT_AUTHORIZED`. Per ADR-0081 §2.2: Stage 3 proposed actions never run autonomously. Runtime promotion to Section 2 Action (per ADR-0057) requires separate Founder authorization per slice + ADR-0026 dual-control where required.

## Canonical doctrine (ADR-0081 §2.1, preserved verbatim)

*"A workflow in Otzar is a governed, role-aware process that turns context into coordinated action through people, Digital Twins, tools, approvals, audit, and memory — without bypassing human authority."*

## Purpose

W4 turns the W3 workflow recommendations (Stage 1 + Stage 2) into per-plan-archetype catalogs of **proposed actions** that:

1. Cite the existing W3 workflow recommendation each proposed action materializes from (`consumes_workflow_recommendation_id`)
2. Pin the ADR-0081 stage at 3 (`adr_0081_stage: 3`)
3. Document `actor_role` (which canonical actor proposes the action; mirrors ADR-0085 §5 voice-intent envelope `caller_entity_id` semantics)
4. Document `intended_external_system` (the target system the action would touch; closed-vocab against the 6 OPERATING connectors + INTERNAL_ONLY + OUTBOUND_WEBHOOK)
5. Pin `proposed_payload_shape` — operation name + `safe_field_set` + `forbidden_field_set`
6. Pin `governance_gates` — policy_decision_required + approval_chain_required + dual_control_required + audit_required (RULE 4 always true)
7. Document `state_machine` — initial state `PROPOSED_NOT_AUTHORIZED` + closed-vocab transitions (proposed → reviewed → approved/rejected → promoted_to_action/canceled)
8. Stay `proposed_action_state: PROPOSED_NOT_AUTHORIZED` — runtime promotion to Section 2 Action requires separate Founder authorization per slice

## Files

| File | Plan archetype | Items | Notes |
|---|---|---|---|
| `proposed-action.schema.json` | n/a | JSON Schema | — |
| (starter-pilot omitted) | — | — | All Starter / Pilot W3 workflows are at Stage 1 (Template-only); no Stage 3 promotion candidates exist at this tier per ADR-0081 §2.2 |
| `team-proposed-actions.json` | Team | 4 (Stage 2 → Stage 3 candidates) | Stage 3 proposed actions materializing from Team W3 recommendations; Slack + DMW + meeting follow-up surfaces |
| `business-proposed-actions.json` | Business | 6 (Stage 2 → Stage 3 candidates) | Stage 3 proposed actions materializing from Business W3 recommendations; multi-connector surfaces |
| `enterprise-proposed-actions.json` | Enterprise | 8 (Stage 2 → Stage 3 candidates) | Stage 3 proposed actions materializing from Enterprise W3 recommendations; board / GC / GRC / CFO / cross-functional surfaces |

## Why no starter-pilot catalog

Per ADR-0081 §2.2: Stage 3 (Proposed Action) requires Stage 2 (Recommendation-only) first. All three Starter / Pilot W3 workflows are at Stage 1 only (Onboarding Checklist + Tomorrow's Executive Brief + Offboarding Checklist) — they are templates the admin reviews, not recommendations surfaced to a Twin. Stage 3 proposed actions cannot materialize from Stage 1 workflows. Starter-pilot proposed actions land if and when those templates promote to Stage 2 at a higher plan tier per ADR-0081 §2.2.

## What W4 does NOT do

- Does **NOT** execute any action
- Does **NOT** call any connector (per the OPERATING 6/6 connector matrix)
- Does **NOT** promote any proposed action to Section 2 Action runtime
- Does **NOT** schedule, dispatch, or fan out anything
- Does **NOT** modify any DMW / capsule / wallet
- Does **NOT** introduce any new audit literal (uses existing `WORKFLOW_RECOMMENDATION_REFERENCED` + the future `PROPOSED_ACTION_RECEIVED` clean-transition per ADR-0042 §Q-γ.1 forward-substrate at runtime promotion)
- Does **NOT** modify any Foundation service
- Does **NOT** introduce any new Foundation route

## What W4 does

- Documents the Stage 3 surface that bridges Stage 2 recommendation into Section 2 Action runtime per the ADR-0081 §2.2 maturity ladder
- Pins the `proposed_payload_shape` safe / forbidden field discipline so promotion-to-Action slices land with privacy-honest payload boundaries from the start
- Pins the `governance_gates` so promotion-to-Action slices reuse the canonical policy / approval / dual-control / audit posture instead of re-deriving it per slice
- Pins the per-archetype `actor_role` × `intended_external_system` matrix so future runtime slices know which surface to wire first

## Voice-first interaction note

Per ADR-0085 §5 voice-first product doctrine: the `actor_role` enum includes `DIGITAL_TWIN` + `AI_TEAMMATE` so that voice-intent envelopes that materialize as proposed actions (per ADR-0085 §3 MEDIUM-tier risk model) compose against this same W4 substrate. The voice-intent envelope's `proposed_action` field per ADR-0085 §5 envelope shape is the canonical bridge between VF.2 voice-intent envelope construction (LIVE per Foundation PR #211) and W4 proposed-action substrate.

## Validator

The `scripts/validate-proposed-action.mjs` validator (pure Node ESM; mirrors `scripts/validate-workflow-recommendation.mjs`) verifies:

- Schema conformance for each per-archetype catalog
- Cross-references against the W3 workflow-recommendation catalog IDs (every `consumes_workflow_recommendation_id` resolves to an existing W3 item)
- Closed-vocab `actor_role` + `intended_external_system` + `state_machine` initial state + `audit_required` invariant
- Per-archetype counts match the README claims

## Reading

- [ADR-0081 Section 9 Workflows Doctrine](../architecture/decisions/0081-section-9-workflows-doctrine.md) — Stage maturity ladder canonical
- [ADR-0085 Voice-First Product Doctrine §5](../architecture/decisions/0085-voice-first-product-doctrine.md) — Voice-intent envelope `proposed_action` field
- [ADR-0057 Section 2 Autonomous Execution Core](../architecture/decisions/0057-section-2-autonomous-execution-core.md) — Section 2 Action runtime canonical
- [ADR-0026 Dual-Control Middleware](../architecture/decisions/0026-dual-control-middleware-pattern-privileged-endpoint-registry-and-per-route-binding-discipline.md) — Dual-control posture canonical
- [W3 Workflow Recommendation Substrate](../workflow-recommendation/README.md) — Stage 1+2 substrate W4 consumes
