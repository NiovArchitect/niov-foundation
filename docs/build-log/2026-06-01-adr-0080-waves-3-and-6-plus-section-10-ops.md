# ADR-0080 Waves 3 + 6 + Section 10 Ops Hardening — Multi-Slice Autonomous Arc

**Date:** 2026-06-01
**Scope:** Autonomous-build arc covering 7 PRs across both Foundation and Control Tower repos in a single session under `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]`. Captures the Wave 3 CT Dandelion read-only preview + Section 10 operational hardening pass + Wave 6 connector-priority matrix derivation + CT Wave 6 surface + the closeout cascade.
**Authorization lineage:**
- `[FOUNDER-ADR-0080-WAVE-3-CT-DANDELION-READ-ONLY-PREVIEW-AUTH]`
- `[FOUNDER-ADR-0080-WAVE-3-ADDENDUM-DEEP-ROLE-EXAMPLES-AND-COLLABORATION-MAPS]`
- `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]`

**Section file:** [`10-deployment-security-go-live-operations.md`](../current-build-state/10-deployment-security-go-live-operations.md)

## Why this entry exists

This arc crossed multiple production sections (Section 10 ops + ADR-0080 Waves 3 + 6) and both repos (Foundation + Control Tower) in a single session. It introduces a new substrate (the CT-side OOTB catalog mirror at `src/lib/ootb-catalog/` + the Foundation connector-priority derivation script), closes 4 documented launch-readiness gaps (rollback / admin bootstrap / smoke / monitoring), and lands the matrix-output substrate that the Section 4 first-real-connector decision depends on. Tier-4 build-log entry warranted per `build-log/README.md`: "cross-section integration spanning more than one production section" + "substrate-architectural paste triggering the RULE 21 pre-authorization research arc" (Wave 3 Phase 0 + Wave 6 derivation).

## Arc lineage

| Slice | Date | PRs | Outcome |
|-------|------|-----|---------|
| Wave 3 CT preview | 2026-06-01 | CT [#18](https://github.com/NiovArchitect/otzar-control-tower/pull/18) `dfb3b84` | `/onboarding` Placeholder replaced with read-only Dandelion Preview; 11 panels including doctrine card + catalog counts (187 items) + 15-row role browser + Role Depth Roadmap + EA spotlight + EA Collaboration Map + tool browser + workflow browser + connector preset preview + Dandelion three-tier flow + DMW Education + governed envelope. NEW `src/lib/ootb-catalog/{types,data}.ts` (compact CT-side mirror of Foundation `docs/ootb-catalog/`). 29 NEW CT tests; 218/218 total pass. **Wave 3 substrate-honest depth status surfaced**: 1 DEEP (EA) + 14 STARTER + 13 NOT_YET_MODELED + 2 SUBSUMED per Founder Wave 3 addendum decision rule. |
| Foundation closeout for Wave 3 | 2026-06-01 | Foundation [#167](https://github.com/NiovArchitect/niov-foundation/pull/167) `c8bea41` | ADR-0080 Amendment 2 added: Wave 3 closeout + substrate-honest depth table + Wave 2.1 forward path + Wave 3 next-slice recommendations under autonomous-build authority. Section 10 build-state + NEXT_ACTION refreshed. |
| Section 10 ops hardening | 2026-06-01 | Foundation [#168](https://github.com/NiovArchitect/niov-foundation/pull/168) `c2b3803` | 4 NEW operational runbooks: `admin-bootstrap-runbook.md` (274 lines; first `can_admin_niov` SQL bootstrap + atomic transaction + recovery + audit), `rollback-runbook.md` (195 lines; decision tree + 6 rollback procedures + post-rollback verification), `smoke-test-checklist.md` (161 lines; 15-section manual smoke), `monitoring-and-healthcheck.md` (194 lines; `/health` contract + audit chain as observability + 11-row alerting policy + first 24/48/168h post-deploy). Closes 4 launch-readiness gaps surfaced by Section 10 audit (PR #164). Section 10 operational substrate status flipped from ⚠ FOUNDATIONS LAID to ✓ READY (docs tier). |
| Wave 6 matrix derivation | 2026-06-01 | Foundation [#169](https://github.com/NiovArchitect/niov-foundation/pull/169) `d2f9c44` | NEW `scripts/compute-connector-priority.mjs` (pure Node ESM; deterministic; no deps) derives a connector-priority score per ConnectorPreset from the Wave 2 static catalog. NEW `docs/ootb-catalog/connector-priority-matrix.{json,md}` (14 presets ranked; matrix-version `wave-6-v1.0.0`). Top 5: Slack 16.00 → Google Workspace 13.33 → Project Tracker 12.75 → Microsoft 365 11.05 → Microsoft Teams 11.00. Aligns with Section 10 audit's substrate-honest "Slack first" recommendation. Validator (`scripts/validate-ootb-catalog.mjs`) extended with matrix-structure checks. ADR-0080 Amendment 3 added. **Suggest-only**: Section 4 first-real-connector decision remains Founder-decision-gated. |
| CT Wave 6 surface | 2026-06-01 | CT [#19](https://github.com/NiovArchitect/otzar-control-tower/pull/19) `bf7f826` | NEW `ConnectorPriorityRankingPanel` in `src/pages/Onboarding.tsx` consumes Foundation matrix verbatim via CT-side mirror at `src/lib/ootb-catalog/data.ts`. Renders all 14 ranked rows with per-component score breakdown + 4 forward-substrate inputs declared transparently (`Dandelion_collected_demand` / `customer_demand` / `launch_necessity` / `demo_impact`) + matrix version + suggest-only notice + reading guidance. 5 NEW tests; 223/223 total CT tests pass. Typecheck + lint + build green. |
| Foundation closeout for CT Wave 6 | 2026-06-01 | Foundation [#170](https://github.com/NiovArchitect/niov-foundation/pull/170) `d5f6d2a` | ADR-0080 Amendment 4 added: CT Wave 6 surface LIVE; **Wave 6 end-to-end CLOSED** (Foundation matrix derivation + CT consumer surface both LIVE). Section 10 + NEXT_ACTION refreshed. |
| Build-log archive (this entry) | 2026-06-01 | Foundation [#TBD] | Tier-4 archive of the 6-slice autonomous arc. |

## Score formula (Wave 6)

Per ADR-0080 §10, derivable subset only. Customer-signal + Dandelion-collected-demand inputs remain forward-substrate.

```
total = 1.5 * tier_score                 (TIER_1=4, TIER_2=3, TIER_3=2, TIER_4=1)
      + 1.0 * api_maturity_score         (STABLE=2, PARTIAL=1, BETA=0)
      + 1.0 * adoption_signal_score      (VERY_HIGH=3, HIGH=2, MEDIUM=1, LOW=0)
      + 1.0 * auth_readiness_score       (API_TOKEN > OAUTH2_USER > OAUTH2_ADMIN_CONSENT)
      + 0.5 * role_count_max             (most-roles-using underlying tool)
      - 0.5 * sensitivity_penalty        (CRITICAL=2.0, HIGH=1.5, MEDIUM=0.5, LOW=0)
      - 0.5 * complexity_penalty         (VERY_LARGE=3, LARGE=2, MEDIUM=1, SMALL=0)
```

All components averaged across the preset's underlying tools except `role_count_max` (max). Deterministic: same catalog → same matrix.

## Final ranking (matrix-version `wave-6-v1.0.0`)

| Rank | Preset | Total | Notes |
|------|--------|-------|-------|
| 1 | Slack (Read-First) | **16.00** | TIER_1 + STABLE + VERY_HIGH + OAuth bot token + 8 roles |
| 2 | Google Workspace (Read-First) | 13.33 | 6 tools; OAuth admin consent penalty + CRITICAL Gmail sensitivity |
| 3 | Project Tracker (Read-First) | 12.75 | Jira + Linear; engineering/PM core |
| 4 | Microsoft 365 (Read-First) | 11.05 | MS-shop parallel to Google Workspace |
| 5 | Microsoft Teams (Read-First) | 11.00 | MS-shop parallel to Slack |
| 6 | GitHub (Read-First) | 10.00 | universal engineering |
| 7 | CRM (Read-First) | 9.75 | Salesforce + HubSpot |
| 8 | Travel + Expense (Read-First) | 8.75 | EA canonical preset (SAP Concur + Expensify + Ramp + Brex + Navan + TravelPerk) |
| 9 | Support Platform (Read-First) | 6.63 | Zendesk + Intercom + Freshdesk + Gainsight |
| 10 | Legal / Contracts (Read-First) | 6.63 | DocuSign + Ironclad + LinkSquares + Evisort |
| 11 | Compliance Platform (Read-First) | 6.31 | Vanta + Drata + OneTrust + Secureframe |
| 12 | HRIS (Read-First) | 6.30 | Workday + BambooHR + Rippling + Gusto + ADP |
| 13 | Finance ERP (Read-First) | 6.00 | NetSuite + QuickBooks + Xero |
| 14 | ATS (Read-First) | 5.75 | Greenhouse + Lever |

## Substrate-honest framing preserved across the arc

- "Dandelion suggests the starter shape; Foundation governance authorizes what may actually run."
- "Templates describe useful defaults. Governed envelopes define how those defaults may be used."
- "JSON is not the moat — the governed context envelope is."
- "Catalog entries are not permissions."
- "Connector presets are not live connectors."
- "Nothing is connected from this page."
- "The first real Section 4 connector requires Founder authorization + a RULE 21 research arc."
- "Your Memory Wallet is how Otzar remembers safely."
- "Dandelion shapes the starter profile; the DMW scopes memory; Foundation governance authorizes use."

Forbidden UI copy (15 phrases) verified absent across CT preview surfaces by the no-copy guard test.

## Out of scope (preserved across all 7 PRs)

- NO Foundation schema, migration, route, service, runtime activation.
- NO connector code, OAuth, secrets.
- NO permission grants from templates.
- NO Digital Twin profile creation.
- NO LLM / Python / BEAM.
- NO new audit literal.
- NO mutation to existing `apps/api/src/services/governance/dandelion.service.ts`.
- NO billing (Section 8) / Workflows runtime (Section 9).
- Prometheus / OTel implementation deferred to GOVSEC.2.

## Substrate-honest depth gap (Founder Wave 3 addendum)

Wave 3 preview transparently surfaces depth status of the 15-role catalog as 1 DEEP (Executive Assistant — full expansion: 9 likely_reports_to + 21 workflows + 28 tools + 7 PermissionBundles + full DelegatedAuthorityProfile + 5 aha moments + 3 fallback tiers + forbidden_inferences) + 14 STARTER (CEO, COO, CFO, CHRO, General Counsel, PM, Project Manager, AE, CSM, SWE, EM, IT Admin, Compliance Officer, Board Member — basic fields populated, empty permission_bundles arrays, 1 aha-moment each) + 13 NOT_YET_MODELED (CTO, CMO, Sales Manager, Public Relations, AI Engineer, ML Engineer, Researcher / Research Scientist, Data Scientist, UX Researcher, Support Lead, Operations Manager, General Employee / IC, Investor / Observer) + 2 SUBSUMED (Board Chair → Board Member; Founder → CEO).

**Wave 2.1 role-depth expansion** is the queued forward-substrate next slice. Re-running `scripts/compute-connector-priority.mjs` after Wave 2.1 will likely shift the ranking as more roles claim more tools (raising `role_count_max` per preset).

## Production substrate inventory delta

### Foundation NEW

- `scripts/compute-connector-priority.mjs` (277 lines; pure Node ESM)
- `docs/ootb-catalog/connector-priority-matrix.json` (machine-readable)
- `docs/ootb-catalog/connector-priority-matrix.md` (human-readable)
- `docs/operations/admin-bootstrap-runbook.md` (274 lines)
- `docs/operations/rollback-runbook.md` (195 lines)
- `docs/operations/smoke-test-checklist.md` (161 lines)
- `docs/operations/monitoring-and-healthcheck.md` (194 lines)

### Foundation MOD

- `scripts/validate-ootb-catalog.mjs` (matrix-structure validation added)
- `docs/architecture/decisions/0080-…ontology.md` (Amendments 2, 3, 4 added)
- `docs/current-build-state/10-…-go-live-operations.md` (Section 10 status table flipped)
- `docs/NEXT_ACTION.md` (refresh at each closeout; 150-line ceiling preserved)

### CT NEW

- `src/lib/ootb-catalog/types.ts` (CT-side type definitions)
- `src/lib/ootb-catalog/data.ts` (compact mirror of Foundation OOTB catalog + Wave 6 matrix)
- `tests/unit/onboarding.test.tsx` (34 tests covering 11 panels + 15-phrase forbidden-copy guard)

### CT MOD

- `src/pages/Onboarding.tsx` (Placeholder → 11 read-only panels including Wave 6 priority ranking)
- `src/lib/nav.ts` (nav entry description updated)

## CI + verification across the arc

| PR | CI checks |
|----|-----------|
| #167 Foundation closeout (Wave 3) | 4/4 SUCCESS (typecheck + unit 371 + integration 111+1 + Elixir) |
| #168 Section 10 ops hardening | 4/4 SUCCESS |
| #169 Foundation Wave 6 matrix | 4/4 SUCCESS |
| #170 Foundation closeout (CT Wave 6) | 4/4 SUCCESS |
| CT #18 Wave 3 Dandelion Preview | 1/1 verify SUCCESS |
| CT #19 Wave 6 priority surface | 1/1 verify SUCCESS |
| TypeScript baseline | exactly 4 canonical residual errors (unchanged) |
| RULE 16 no-console | green |
| no-leak guard | green |
| 187-item catalog validator | green + matrix structure checks |
| CT total tests | 218 → 223 across the arc |

## Forward substrate (queued)

**Autonomous-build-eligible bounded slices:**

1. **Wave 2.1 role-depth expansion** (bounded subset; one or two roles per PR) — start with CTO + CMO + Public Relations + AI Engineer + General Employee / IC priority per Founder Wave 3 addendum. Each PR deepens the matching `roles.json` entries + extends `default_tool_profile_ids` / `default_workflow_template_ids` / `default_connector_preset_ids` / `permission_bundles` / `aha_moment_pack` / `forbidden_inferences`. After enough role depth lands, re-run `scripts/compute-connector-priority.mjs` and republish the matrix. CT `role_depth_roadmap` data refreshes accordingly.
2. **Wave 4 onboarding recommendation engine** (suggest-only) — requires separate Founder authorization at slice.
3. **Wave 5 DigitalTwinStarterProfile attachment** — Founder-gated.
4. **Wave 8 continuous adaptation per ADR-0048** — Founder-gated.

**Founder-decision-gated (TRUE STOP CONDITIONS):**

- Section 4 first-real-connector — Slack is the matrix top-rank but the **decision** to implement is Founder's; requires RULE 21 research arc + bounded implementation wave.
- Section 8 Billing / Entitlements — Founder pricing-tiers + billing-provider + seat-vs-usage decision blocked.
- Section 9 Workflows scope — Founder ADR scope decision blocked.
- GOVSEC.2 Prometheus/OTel implementation — separate Founder authorization per RULE 20.

## Related

- ADR-0080 §17 (Amendment 1 — governed context envelope addendum)
- ADR-0080 §18 (Amendment 2 — Wave 3 CT preview + deep-role-examples)
- ADR-0080 §19 (Amendment 3 — Wave 6 matrix output)
- ADR-0080 §20 (Amendment 4 — CT Wave 6 surface LIVE; this arc's substrate-architectural register)
- ADR-0047 (Post-Gap-3 hardening; `deployment-runbook.md` ancestry)
- ADR-0049 / ADR-0050 (GOVSEC posture + break-glass — referenced from runbooks)
- ADR-0070 (regulator-ready Foundation doctrine; neutral compliance vocabulary preserved across all panels)
- Section 10 production-readiness audit at PR #164 (closes the 4 ops gaps at docs tier; OOTB-templates blocker now closed end-to-end at preview register)
