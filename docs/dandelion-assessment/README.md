# D2 — Dandelion Assessment Substrate (Stage B)

> Static assessment substrate that progresses Dandelion from Stage
> A (Preview) to Stage B (Assessment) per ADR-0082 + Amendment 1
> cartographer doctrine.

> **Static only.** No runtime activation. No user activation. No
> Twin activation. No permission grants. No connector
> authorizations. No workflow starts. No Action rows. No
> `dandelion.service.ts` mutation. No runtime DMW behavior.

## Canonical doctrine (preserved verbatim)

**"Dandelion maps the territory. Admins approve the map.
Foundation governs what can happen inside the map. DMWs scope
what can be remembered. Digital Twins operate within the
approved terrain."**

Plus the supporting forbidden-language and Map-region-gated
activation discipline canonical at ADR-0082 Amendment 1.

## Purpose

D2 turns ADR-0082 + Amendment 1 doctrine into the **intake
substrate** that lets Dandelion collect and represent proposed
inputs for the 9 canonical Map types **before any activation
fires**. Every assessment item is `activation_state:
NOT_ACTIVATED`. The substrate prepares Dandelion to:

1. Ask the right questions per Map type.
2. Ground every proposal against existing ADR / Wave 2.1 /
   Wave 6 evidence.
3. Surface every proposal to admin review.
4. Respect Foundation governance + RULE 0 sovereignty + RULE 20
   forbidden inferences absolutely.

D2 is the substrate. D3 (Recommendation) and D4-D6 (Governance
Review / Starter Envelope / Activation) are forward-substrate.

## The 9 Map types

| File | Map | Sensitivity |
|---|---|---|
| `company-map-assessment.json` | Company Map | HIGH |
| `org-relationship-map-assessment.json` | Org / Relationship Map | HIGH |
| `role-map-assessment.json` | Role Map | HIGH |
| `tool-map-assessment.json` | Tool Map | HIGH |
| `workflow-map-assessment.json` | Workflow Map | HIGH |
| `authority-map-assessment.json` | Authority Map | CRITICAL |
| `memory-dmw-map-assessment.json` | Memory / DMW Map | CRITICAL |
| `risk-map-assessment.json` | Risk Map | CRITICAL |
| `aha-moment-map-assessment.json` | Aha Moment Map | MEDIUM |

Each file contains one `MapAssessment` item with required +
optional + admin + user questions, evidence sources, confidence
labels, output candidates, governance review points, DMW scope
implications, and `activation_state: NOT_ACTIVATED`.

## Schema

`assessment.schema.json` validates the wrapper shape (`kind` +
`catalog_version` + `envelope_defaults` + `items[]`) and the
universal envelope on every item.

Universal required fields on every item:

- `id` / `version` / `status` / `object_type` / `map_type`
- `name` / `description` / `human_readable_summary` / `model_usage_notes`
- `source_adr_refs` (must include `ADR-0082`)
- `required_questions` / `optional_questions` / `admin_questions` / `user_questions`
- `evidence_sources` / `confidence_labels` / `output_candidates`
- `governance_review_points` (minItems 1)
- `safe_defaults` / `forbidden_defaults`
- `allowed_consumers` / `forbidden_consumers`
- `DMW_scope_implications` (minItems 1)
- `audit_expectations`
- `activation_state` (must be `NOT_ACTIVATED`)

Allowed `confidence_labels`:

- `HIGH_CONFIDENCE`
- `MEDIUM_CONFIDENCE`
- `LOW_CONFIDENCE`
- `REQUIRES_ADMIN_REVIEW`
- `REQUIRES_USER_CONFIRMATION`
- `BLOCKED_BY_POLICY`

## Validation

```sh
node scripts/validate-dandelion-assessment.mjs
```

The validator enforces:

- JSON parses
- 11 required files exist
- Wrappers exist (`kind` + `catalog_version` + `envelope_defaults` + `items[]`)
- IDs unique
- Every item includes `source_adr_refs` with `ADR-0082`
- Every item has `activation_state: NOT_ACTIVATED`
- Every item includes `confidence_labels` (≥ 1)
- Every item includes `DMW_scope_implications` (≥ 1)
- Every item includes `governance_review_points` (≥ 1)
- All 9 `map_type` values covered exactly once
- 11 forbidden phrases scanned with sentence-level negation +
  negation-item subtree skip (mirrors
  `validate-entitlement-catalog.mjs` pattern):
  - `employee score`
  - `manager surveillance`
  - `psychological profile`
  - `guaranteed compliant`
  - `regulator approved`
  - `no fine risk`
  - `unrestricted write access`
  - `auto-approved`
  - `connector activated`
  - `permission granted`
  - `autonomous execution enabled`
- Canonical phrase present in README:
  *"Dandelion maps the territory. Admins approve the map.
  Foundation governs what can happen inside the map. DMWs
  scope what can be remembered. Digital Twins operate within
  the approved terrain."*

## How D3 / D4 / D5 / D6 consume this

- **D3 Recommendation** — proposes Map regions ranked by
  confidence + admin priority. Reads D2 `output_candidates`
  and reports against `governance_review_points`.
- **D4 Governance Review** — admin walks proposals + approves /
  rejects per region. Reads D2 + D3 substrate.
- **D5 Starter Envelope Assembly** — bundles approved Map regions
  into the Starter Envelope (governed context envelope per
  ADR-0080 Amendment 1).
- **D6 Activation** — flips `activation_state: NOT_ACTIVATED` →
  `ACTIVATED` per approved region + applies the envelope as
  runtime template metadata. Foundation governance still
  authorizes per-call execution.

## Status

ACCEPTED 2026-06-01 per `[FOUNDER-POST-B3-AUTONOMOUS-D2-AND-CONNECTOR-READINESS-CONTINUATION-AUTH]`. Static substrate only. No runtime activation.
