# D4 — Dandelion Governance Review Substrate (Stage D)

> Static governance review substrate that progresses Dandelion from Stage C (Recommendation) to Stage D (Governance Review) per ADR-0082 + Amendment 1 cartographer doctrine. Consumes D3 MapRecommendation rankings and surfaces them for admin governance review with explicit approval_chain + dual_control + escalation_path per ranked region.

> **Static substrate + validator only.** Every `review_state` is `PROPOSED_NOT_REVIEWED`. No actual admin review at this slice — D4 prepares the canonical shape the future D5 Starter Envelope Assembly + D6 Activation will consume after a real admin walks each region.

## Canonical doctrine (preserved verbatim)

**"Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Digital Twins operate within the approved terrain."**

## Purpose

D4 turns the ranked recommendations from D3 into reviewable per-region surfaces with explicit governance metadata:

- `admin_approval_required` boolean per region
- `dual_control_required` boolean per region
- `approval_chain_role` (e.g. "Otzar Administrator" / "Otzar Administrator + Security Lead" / "User Self-Confirmation")
- `review_outcome_options` (closed-vocab subset of the 5-enum: `APPROVE` / `APPROVE_WITH_CONDITIONS` / `DEFER_FOR_MORE_INFO` / `REJECT` / `ESCALATE_TO_FOUNDER`)
- Map-level `approval_chain` + `escalation_path` + DMW_scope_implications + governance_review_points

## The 9 Map types

Each consumes the matching D3 MapRecommendation ID:

| File | Map | Consumes |
|---|---|---|
| `company-map-governance-review.json` | Company Map | `recommendation.company-map.v1` |
| `org-relationship-map-governance-review.json` | Org / Relationship Map | `recommendation.org-relationship-map.v1` |
| `role-map-governance-review.json` | Role Map | `recommendation.role-map.v1` |
| `tool-map-governance-review.json` | Tool Map | `recommendation.tool-map.v1` |
| `workflow-map-governance-review.json` | Workflow Map | `recommendation.workflow-map.v1` |
| `authority-map-governance-review.json` | Authority Map | `recommendation.authority-map.v1` |
| `memory-dmw-map-governance-review.json` | Memory / DMW Map | `recommendation.memory-dmw-map.v1` |
| `risk-map-governance-review.json` | Risk Map | `recommendation.risk-map.v1` |
| `aha-moment-map-governance-review.json` | Aha Moment Map | `recommendation.aha-moment-map.v1` |

## Review outcome options (closed-vocab enum)

- `APPROVE` — admin approves the region as proposed
- `APPROVE_WITH_CONDITIONS` — admin approves with explicit conditions documented at activation
- `DEFER_FOR_MORE_INFO` — admin requests more information before deciding
- `REJECT` — admin rejects the region; downstream maps respect the rejection absolutely
- `ESCALATE_TO_FOUNDER` — admin escalates to Founder authority (used for sensitive-system modifications + RULE-20 forbidden inference modifications + break-glass authority)

## Validation

```sh
node scripts/validate-dandelion-governance-review.mjs
```

Enforces:

- JSON parses + 11 required files exist
- Wrappers exist (`kind` + `catalog_version` + `envelope_defaults` + `items[]`)
- IDs unique
- Every item includes `source_adr_refs` with `ADR-0082`
- Every item has `review_state: PROPOSED_NOT_REVIEWED`
- Every item's `consumes_recommendation_id` resolves to a real D3 recommendation at `docs/dandelion-recommendation/`
- Every `region_reviews[].review_outcome_options[]` is in the 5-enum
- Every item includes `DMW_scope_implications` + `governance_review_points` + `audit_expectations` + `approval_chain` + `escalation_path` (≥ 1 each)
- All 9 `map_type` values covered exactly once
- 11 forbidden phrases scanned with sentence-level negation + subtree skip
- Canonical phrase present in README (whitespace-normalized)

## Notable cross-D4-to-runtime composition

- **Tool Map Governance Review** elevates `tool.slack-read-first` to a fully landable region because the C2 Slack read-first runtime is LIVE at Foundation (PR #185) + the Connectors admin UI is LIVE in Control Tower (PR #21). Admin approval of this region maps directly to a real binding creation today.
- **Aha Moment Map Governance Review** ranks Slack catch-up summary as the first OPERATING-substrate aha moment since C2 substrate is LIVE.
- **Authority Map Governance Review** + **Risk Map Governance Review** require dual-control for `must-never-assume` + `map-blocking` regions; modifications escalate to Founder.
- **Memory / DMW Map Governance Review** ranks `memory.baseline-safety` as `APPROVE` automatic (baseline; never paywalled) and `memory.self-scoped` as user-confirmation-only — a memory-sovereignty-respecting flow.

## Dandelion graduation tracker

- Stage A Preview LIVE (ADR-0082 base)
- Stage B Assessment substrate `ASSESSMENT_READY` (D2 PR #181)
- Stage C Recommendation substrate `RECOMMENDATION_READY` (D3 PR #186)
- **Stage D Governance Review substrate `GOVERNANCE_REVIEW_READY` (this D4 PR)**
- Stage E Starter Envelope Assembly: forward-substrate
- Stage F Activation: forward-substrate

## How D5 / D6 consume this

- **D5 Starter Envelope Assembly** — reads admin decisions across the 9 Map governance reviews + bundles approved regions into the Starter Envelope (governed context envelope per ADR-0080 Amendment 1)
- **D6 Activation** — flips approved regions from `PROPOSED_NOT_REVIEWED` through `APPROVED` → `ACTIVATED` and applies the envelope as runtime template metadata; Foundation governance still authorizes per-call execution

## Status

ACCEPTED 2026-06-01 per `[FOUNDATION-D4-DANDELION-GOVERNANCE-REVIEW]`. Static substrate only. No runtime activation. No admin review actually performed; substrate prepares the shape that a future D6 + admin review consume.
