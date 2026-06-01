# D3 — Dandelion Recommendation Substrate (Stage C)

> Static recommendation substrate that progresses Dandelion from Stage B (Assessment) to Stage C (Recommendation) per ADR-0082 + Amendment 1 cartographer doctrine. Consumes D2 MapAssessment output candidates and proposes ranked Map regions for D4 Governance Review.

> **Static substrate + validator only.** Every recommendation carries `recommendation_state: PROPOSED_NOT_APPROVED`. No runtime activation. No admin approval. No Twin activation. No permission grants. No connector authorizations. No workflow starts. No mutation to `dandelion.service.ts`. No runtime DMW behavior. No new audit literal.

## Canonical doctrine (preserved verbatim)

**"Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Digital Twins operate within the approved terrain."**

## Purpose

D3 turns the assessment intake into ranked, justified proposals that surface to D4 Governance Review. Each recommendation:

1. Cites the D2 assessment it consumes (`consumes_assessment_id`)
2. Ranks proposed Map regions with explicit confidence labels + rationale
3. Lists cross-map dependencies (what must be approved upstream)
4. Names the approval gate(s) required before activation
5. Carries DMW scope implications + governance review points
6. Stays `PROPOSED_NOT_APPROVED` — admin approval at D4 is mandatory

## The 9 Map types

Each consumes the matching D2 MapAssessment ID:

| File | Map | Consumes |
|---|---|---|
| `company-map-recommendation.json` | Company Map | `assessment.company-map.v1` |
| `org-relationship-map-recommendation.json` | Org / Relationship Map | `assessment.org-relationship-map.v1` |
| `role-map-recommendation.json` | Role Map | `assessment.role-map.v1` |
| `tool-map-recommendation.json` | Tool Map | `assessment.tool-map.v1` |
| `workflow-map-recommendation.json` | Workflow Map | `assessment.workflow-map.v1` |
| `authority-map-recommendation.json` | Authority Map | `assessment.authority-map.v1` |
| `memory-dmw-map-recommendation.json` | Memory / DMW Map | `assessment.memory-dmw-map.v1` |
| `risk-map-recommendation.json` | Risk Map | `assessment.risk-map.v1` |
| `aha-moment-map-recommendation.json` | Aha Moment Map | `assessment.aha-moment-map.v1` |

## Confidence labels (6-enum, mirrors D2)

`HIGH_CONFIDENCE` · `MEDIUM_CONFIDENCE` · `LOW_CONFIDENCE` · `REQUIRES_ADMIN_REVIEW` · `REQUIRES_USER_CONFIRMATION` · `BLOCKED_BY_POLICY`

## Validation

```sh
node scripts/validate-dandelion-recommendation.mjs
```

Enforces:

- JSON parses
- 11 required files exist (README + schema + 9 MapRecommendation files)
- Wrappers exist (`kind` + `catalog_version` + `envelope_defaults` + `items[]`)
- IDs unique
- Every item includes `source_adr_refs` with `ADR-0082`
- Every item has `recommendation_state: PROPOSED_NOT_APPROVED`
- Every item's `consumes_assessment_id` matches a real D2 assessment ID at `docs/dandelion-assessment/`
- Every `ranked_regions[].confidence_label` is in the 6-enum
- Every item includes `DMW_scope_implications` + `governance_review_points` + `audit_expectations` + `cross_map_dependencies`
- All 9 `map_type` values covered exactly once
- 11 forbidden phrases scanned with sentence-level negation + subtree skip
- Canonical phrase present in README (whitespace-normalized)

## Graduation tracker

- D2 Stage B Assessment substrate: **`ASSESSMENT_READY`** (LIVE PR #181)
- D3 Stage C Recommendation substrate: **`RECOMMENDATION_READY`** (this PR)
- D4 Governance Review: forward-substrate
- D5 Starter Envelope Assembly: forward-substrate
- D6 Activation: forward-substrate

## Notable cross-D3-to-runtime composition

- **Tool Map Recommendation** ranks Slack first because **C2 Slack read-first runtime is LIVE** (PR #185) — Slack-based aha moments now have RUNTIME_READY substrate.
- **Aha Moment Map Recommendation** elevates Slack catch-up summaries to HIGH_CONFIDENCE for the same reason.
- All other connectors stay at `RECOMMENDATION_READY` until their respective C-slice runtimes land.

## How D4 / D5 / D6 consume this

- **D4 Governance Review** — admin walks each ranked region + approves / rejects per region. Reads D3 ranked output + governance_review_points.
- **D5 Starter Envelope Assembly** — bundles approved Map regions into the Starter Envelope (governed context envelope per ADR-0080 Amendment 1).
- **D6 Activation** — flips approved regions from `PROPOSED_NOT_APPROVED` to `APPROVED` + applies the envelope as runtime template metadata. Foundation governance still authorizes per-call execution.

## Status

ACCEPTED 2026-06-01 per `[FOUNDATION-D3-DANDELION-RECOMMENDATION]`. Static substrate only. No runtime activation.
