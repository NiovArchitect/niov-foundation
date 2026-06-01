# Dandelion Activation — Build State

> Tier 3 build-state for the Dandelion organizational cartographer.
> Per ADR-0082 + Amendment 1 cartographer doctrine: Dandelion maps
> the territory; admins approve the map; Foundation governs what
> can happen inside the map; DMWs scope what can be remembered;
> Digital Twins operate within the approved terrain.

## Current status

| Stage | Status |
|---|---|
| A — Preview | ✓ LIVE (ADR-0082 base; CT `/onboarding`; OOTB catalog PR #166 + Wave 6 matrix PR #169) |
| B — Assessment substrate | ✓ LIVE (D2 PR #181 — `docs/dandelion-assessment/` 11 files, 9 map assessments + schema + README + validator) |
| C — Recommendation substrate | ✓ LIVE (D3 PR #186 — `docs/dandelion-recommendation/` 11 files, 9 map recommendations + schema + README + validator; 9 D2 IDs cross-referenced) |
| D — Governance Review substrate | ✓ LIVE (D4 PR #189 — `docs/dandelion-governance-review/` 11 files, 9 map governance reviews + schema + README + validator; 9 D3 IDs cross-referenced) |
| E — Starter Envelope Assembly substrate | ✓ LIVE (D5 this PR — `docs/dandelion-starter-envelope/` 6 files, 4 plan-archetype envelopes + schema + README + validator; 9 D4 IDs cross-referenced per envelope) |
| F — Activation | queued (D6 — Founder-gated; per ADR-0082 Amendment 1 §9.7 map-region-gated) |

## D2 — what landed

`docs/dandelion-assessment/` (11 files):

- `README.md` — purpose + canonical doctrine + 9 Map types + schema reference + D3-D6 consumer roadmap
- `assessment.schema.json` — JSON Schema (kind=MapAssessment + universal envelope + 9 map_type enum + 6 confidence_labels enum + activation_state const NOT_ACTIVATED)
- `company-map-assessment.json` — CompanyMap (legal name / industry / size / regions / executive team / board structure / departments / customer type / etc.)
- `org-relationship-map-assessment.json` — OrgRelationshipMap (role-shaped relationships / approval chains / escalation paths)
- `role-map-assessment.json` — RoleMap (title / actual role / role family / seniority / department / Wave 2.1 role-depth match)
- `tool-map-assessment.json` — ToolMap (company / department / user tools / OAuth ownership / connector-pack candidate)
- `workflow-map-assessment.json` — WorkflowMap (recurring workflows / triggers / approval gates / ADR-0081 5-stage maturity)
- `authority-map-assessment.json` — AuthorityMap (delegated authority / dual-control / break-glass / 'must never be assumed')
- `memory-dmw-map-assessment.json` — MemoryDmwMap (self / team / project / client / board / legal scope per RULE 0)
- `risk-map-assessment.json` — RiskMap (missing policies / missing approvals / overbroad scopes / high-risk tools+workflows / compliance surfaces)
- `aha-moment-map-assessment.json` — AhaMomentMap (first-week value per role / department / connector / workflow)

`scripts/validate-dandelion-assessment.mjs` (pure Node ESM):

- JSON parse + 11 required files + required wrappers + universal field presence + ID uniqueness
- ADR-0082 source ref required on every item
- `activation_state` must equal `NOT_ACTIVATED` on every item
- `confidence_labels` enum enforced (HIGH_CONFIDENCE / MEDIUM_CONFIDENCE / LOW_CONFIDENCE / REQUIRES_ADMIN_REVIEW / REQUIRES_USER_CONFIRMATION / BLOCKED_BY_POLICY)
- All 9 `map_type` values covered exactly once
- 11 forbidden phrases scanned with sentence-level negation + subtree skip (mirrors `validate-entitlement-catalog.mjs` pattern)
- Canonical phrase ("Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Digital Twins operate within the approved terrain.") present in README (whitespace-normalized)

Validator green: 11/11 files, 9 items, 9/9 map types, 0 errors.

## What did NOT land

- NO runtime activation
- NO user activation
- NO Twin activation
- NO permission grants
- NO connector authorizations
- NO workflow starts
- NO Action rows
- NO mutation to `apps/api/src/services/governance/dandelion.service.ts`
- NO runtime DMW behavior
- NO new audit literal
- NO BEAM / Python / Elixir
- NO LLM / voice / native automation

## How downstream (D3-D6) consumes this

- **D3 Recommendation** — proposes Map regions ranked by confidence + admin priority. Reads `output_candidates` from each assessment.
- **D4 Governance Review** — admin walks proposals + approves / rejects per region. Reads D2 + D3 substrate.
- **D5 Starter Envelope Assembly** — bundles approved Map regions into the Starter Envelope (governed context envelope per ADR-0080 Amendment 1).
- **D6 Activation** — flips `activation_state: NOT_ACTIVATED` → `ACTIVATED` per approved region + applies the envelope as runtime template metadata. Foundation governance still authorizes per-call execution.

## Next recommended slice

Per autonomous continuation per `[FOUNDER-POST-B3-AUTONOMOUS-D2-AND-CONNECTOR-READINESS-CONTINUATION-AUTH]`: **Static Connector Implementation-Readiness Catalog** (Slack / Google Workspace / Jira-Linear minimum) — RULE 21 research-backed substrate that prepares C2 first-real-connector decision. **STOP before C2 real connector runtime.**
