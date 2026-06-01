# D5 — Dandelion Starter Envelope Assembly Substrate (Stage E)

> Static assembly substrate that progresses Dandelion from Stage D (Governance Review) to Stage E (Starter Envelope Assembly) per ADR-0082 + Amendment 1 cartographer doctrine. Consumes D4 MapGovernanceReview surfaces and bundles approved Map regions across the 9 Map types into a single governed-context-envelope per ADR-0080 Amendment 1, tuned per ADR-0083 plan archetype.

> **Static substrate + validator only.** Every `envelope_state` is `DRAFT_NOT_ACTIVATED`. No actual envelope activation — D5 prepares the canonical shape the future D6 Activation slice consumes after a real admin walks each D4 review.

## Canonical doctrine (preserved verbatim)

**"Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Digital Twins operate within the approved terrain."**

## Purpose

D5 turns the D4 governance review surface into per-plan-archetype starter envelopes. Each envelope:

1. References all 9 D4 governance reviews it consumes (`consumes_governance_review_ids` — array of length exactly 9, one per Map type)
2. Bundles approved regions in `approved_regions_bundle` with `expected_review_outcome` per region (`APPROVE` or `APPROVE_WITH_CONDITIONS`)
3. Summarizes per-Map-type scope at `scope_summary_by_map_type` (region count + human summary + highest sensitivity)
4. Documents `cross_map_dependency_resolution` (which Map approvals gate which downstream activations)
5. Carries a `DMW_scope_ceiling` derived from approved Memory/DMW Map regions (`baseline_categories` + `approved_extension_categories` + `forbidden_categories` + `derivation_note`)
6. Carries `permission_defaults` + `scope_defaults` + `audit_expectations` + `governance_review_points` per plan archetype
7. Stays `DRAFT_NOT_ACTIVATED` — D6 admin activation is mandatory

## Files

| File | Plan archetype |
|---|---|
| `starter-envelope.schema.json` | JSON Schema |
| `starter-pilot-envelope.json` | Starter / Pilot (15 approved regions; no connector activation; baseline + self-scoped DMW) |
| `team-envelope.json` | Team (24 approved regions; Slack-read-first LANDABLE per C2 OPERATING; Stage 2 workflows; team-scoped DMW) |
| `business-envelope.json` | Business (35 approved regions; Stages 1-3 workflows; multi-connector queued; customer-scoped DMW) |
| `enterprise-envelope.json` | Enterprise (38 approved regions; Stages 1-5 workflows queued; all connector packs queued; regulator-evidence pack; SSO/SAML/SCIM) |

## Cross-D4 cross-references

Every starter envelope cross-references all 9 D4 MapGovernanceReview IDs:

- `review.company-map.v1`
- `review.org-relationship-map.v1`
- `review.role-map.v1`
- `review.tool-map.v1`
- `review.workflow-map.v1`
- `review.authority-map.v1`
- `review.memory-dmw-map.v1`
- `review.risk-map.v1`
- `review.aha-moment-map.v1`

The validator enforces every cross-reference resolves to a real D4 governance review at `docs/dandelion-governance-review/`.

## Validation

```sh
node scripts/validate-dandelion-starter-envelope.mjs
```

Enforces:

- JSON parses + 6 required files exist (README + schema + 4 plan-archetype envelopes)
- Wrappers exist (`kind` + `catalog_version` + `envelope_defaults` + `starter_envelope`)
- IDs unique
- Every envelope includes `source_adr_refs` with `ADR-0082` (+ `ADR-0083` for B-tier composition)
- Every envelope has `envelope_state: DRAFT_NOT_ACTIVATED`
- Every envelope's `consumes_governance_review_ids` has exactly 9 entries; each resolves to a real D4 review
- Every envelope's `scope_summary_by_map_type` covers all 9 Map types
- Every envelope's `DMW_scope_ceiling` has non-empty `baseline_categories` + non-empty `forbidden_categories` + a derivation note
- All 4 plan archetypes covered exactly once
- 11 forbidden phrases scanned with sentence-level negation + subtree skip
- Canonical phrase present in README (whitespace-normalized)

## Notable cross-D5-to-runtime composition

- **Team envelope** ranks `tool.slack-read-first` as `APPROVE_WITH_CONDITIONS` + `aha.slack-catchup` as `APPROVE_WITH_CONDITIONS` because the C2 Slack runtime is LIVE (Foundation PR #185 + CT PR #21). Admin approval at D6 maps directly to a real ConnectorBinding creation today.
- **Business + Enterprise envelopes** queue Google Workspace + Project Tracker connectors at `APPROVE_WITH_CONDITIONS` pending their respective C3 / C4 runtimes.
- **Enterprise envelope** includes break-glass authority per ADR-0050 + LawfulBasis-gated regulator-view per ADR-0036 + advanced audit pack per ADR-0071.
- **DMW scope ceiling** is derived per archetype: Starter / Pilot has zero approved extensions; Team adds team-scope + Slack provenance metadata; Business adds project / customer / advanced audit; Enterprise adds regulator-evidence + custom retention + board observer.

## Dandelion graduation tracker

- Stage A Preview LIVE (ADR-0082 base)
- Stage B Assessment substrate `ASSESSMENT_READY` (D2 PR #181)
- Stage C Recommendation substrate `RECOMMENDATION_READY` (D3 PR #186)
- Stage D Governance Review substrate `GOVERNANCE_REVIEW_READY` (D4 PR #189)
- **Stage E Starter Envelope Assembly substrate `ENVELOPE_READY` (this D5 PR)**
- Stage F Activation: forward-substrate

## How D6 consumes this

- **D6 Activation** — admin walks the relevant plan-archetype envelope after walking the 9 D4 reviews + an approved B2/B4 plan; D6 flips approved regions from `DRAFT_NOT_ACTIVATED` through `APPROVED` → `ACTIVATED` and applies the envelope as runtime template metadata; Foundation governance still authorizes per-call execution.

## Status

ACCEPTED 2026-06-01 per `[FOUNDATION-D5-DANDELION-STARTER-ENVELOPE]`. Static substrate only. No envelope activation. No admin walk performed; substrate prepares the canonical shape that a future D6 + admin walk + plan-archetype matching consume.
