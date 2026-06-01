# W3 — Workflow Recommendation Substrate

> Static recommendation substrate that operationalizes ADR-0081 Stage 1 (Template-only) + Stage 2 (Recommendation-only) workflows per plan archetype. Each plan-archetype catalog enumerates a closed-vocab set of workflow recommendations cross-referenced into the existing Wave 2 OOTB workflows catalog (`docs/ootb-catalog/workflows.json`).

> **Static substrate + validator only.** Every `workflow_state` is `RECOMMENDATION_ONLY`. No actual workflow execution. Per ADR-0081 §2.2: Stage 1 + Stage 2 cannot execute. Stage 3 (Proposed Action) promotion requires separate Founder authorization per slice + ADR-0057 + ADR-0026 dual-control where required.

## Canonical doctrine (ADR-0081 §2.1, preserved verbatim)

*"A workflow in Otzar is a governed, role-aware process that turns context into coordinated action through people, Digital Twins, tools, approvals, audit, and memory — without bypassing human authority."*

## Purpose

W3 turns the doctrine + Wave 2.1 role-depth files + D3 Workflow Map recommendation into per-plan-archetype catalogs that:

1. Cite the existing OOTB workflow template each recommendation consumes (`consumes_workflow_template_id`)
2. Pin the ADR-0081 stage at 1 or 2 (`adr_0081_stage`)
3. Document `recommendation_purpose` + `role_audience` + `tool_dependencies` + `safe_fallback`
4. Carry `dual_control_required_at_stage_3` (advisory metadata for the future Stage 3 promotion slice)
5. Document `DMW_scope_implications` + `governance_review_points` + `audit_expectations`
6. Stay `workflow_state: RECOMMENDATION_ONLY` — D5 envelope consumption + future Stage 3 promotion are mandatory before any execution

## Files

| File | Plan archetype | Items |
|---|---|---|
| `recommendation.schema.json` | n/a | JSON Schema |
| `starter-pilot-workflows.json` | Starter / Pilot | 3 (Stage 1 only) |
| `team-workflows.json` | Team | 6 (Stage 2 mix; Slack-bound recommendations LANDABLE per C2) |
| `business-workflows.json` | Business | 12 (Stage 2 mix; multi-connector queued) |
| `enterprise-workflows.json` | Enterprise | 16 (Stage 2 mix; board / GC / GRC / CFO / cross-functional) |

## ADR-0081 stage mapping

- **Stage 1 (Template-only)**: catalog presence + Dandelion recommendation + Admin Twin synthesis. **Cannot execute.** Starter / Pilot uses Stage 1 only.
- **Stage 2 (Recommendation-only)**: Otzar suggests the workflow; user / admin reviews. **Cannot execute.** Team + Business + Enterprise use Stage 2 mix.
- **Stage 3 (Proposed Action)** and above: forward-substrate per ADR-0081 §2.2. Requires separate Founder authorization per slice.

## Validation

```sh
node scripts/validate-workflow-recommendation.mjs
```

Enforces:

- JSON parses + 6 required files exist (README + schema + 4 plan-archetype catalogs)
- Wrappers exist (`kind` + `catalog_version` + `envelope_defaults` + `plan_archetype_id` + `items[]`)
- IDs unique per file
- Every item includes `source_adr_refs` with `ADR-0081`
- Every item has `workflow_state: RECOMMENDATION_ONLY`
- Every item has `adr_0081_stage` ∈ {1, 2}
- Every item's `consumes_workflow_template_id` resolves to a real workflow at `docs/ootb-catalog/workflows.json`
- All 4 plan archetypes covered exactly once (one file per archetype)
- 11 forbidden phrases scanned with sentence-level negation + subtree skip
- Canonical phrase present in README (whitespace-normalized)

## Notable cross-W3-to-runtime composition

- **Team + Business + Enterprise** catalogs include workflows whose `tool_dependencies` reference the **Slack connector** — those workflows are LANDABLE in the recommendation tier today per C2 OPERATING substrate (PR #185 + #21). Promotion to Stage 3 (Proposed Action) requires the workflow Stage 3 promotion slice.
- **Sprint Risk Summary** + **Roadmap Decision Brief** + **Account Brief** + **Pipeline Risk Summary** + **Customer Health Brief** + **Support Escalation Summary** each surface team / customer-scoped recommendations from Wave 2.1 §22 aha moments. None of these can execute at W3; Stage 3 promotion is governance-gated.
- **Travel Booking + Expense Shell** (the deepest Wave 2.1 EA worked example) is explicit at Team tier with `dual_control_required_at_stage_3: true` — Stage 3 promotion requires dual-control per ADR-0026 because executive spend is money-moving.
- **Audit Evidence Gap Review** + **Policy Exception Review** + **Security Exception Review** at Enterprise tier require neutral compliance vocabulary per ADR-0070 — no guaranteed-compliance or regulator-approval claims.

## Canonical phrase (preserved verbatim from ADR-0081 §2.1)

**A workflow in Otzar is a governed, role-aware process that turns context into coordinated action through people, Digital Twins, tools, approvals, audit, and memory — without bypassing human authority.**

## How D5 + future W4/W5/W6 consume this

- **D5 Starter Envelope Assembly** — references workflow regions per plan archetype; the W3 catalogs back the workflow regions at D5
- **W4 Proposed Action substrate** — Stage 3 promotion catalog; consumes W3 entries where `dual_control_required_at_stage_3: true`
- **W5 Governed Execution** — Stage 4 substrate consuming W4
- **W6 Continuous Optimization** — Stage 5 substrate consuming W5

## Status

ACCEPTED 2026-06-01 per `[FOUNDATION-W3-WORKFLOW-RECOMMENDATION]`. Static substrate only. No workflow execution. No Twin activation. Future Stage 3+ promotion requires separate Founder authorization per ADR-0081 §2.2.
