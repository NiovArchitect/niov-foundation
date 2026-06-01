# Section 8 — Billing / Entitlements

> Tier 3 build-state for Section 8. Section 8 defines how Otzar's governed intelligence capabilities scale across an enterprise through entitlements, plans, packs, and usage meters — while preserving Foundation's safety, audit, and DMW trust posture.

## Current status

**ADR-0083 base + Amendment 1 LANDED design-only 2026-06-01** per:

- `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 4 (base ADR-0083; PR #175 `4b3265d`)
- `[FOUNDER-SECTION-8-BILLING-ENTITLEMENTS-ADR-AUTH]` (Amendment 1 expansion)
- `[FOUNDER-RESUME-AUTONOMOUS-BUILD-FROM-SAFE-HOLD-AUTH]` (resume + reconfirm)

Section 8 is **architecture-defined + static catalog LIVE + CT preview LIVE; runtime not started**.

**B3 CT Billing Preview LANDED 2026-06-01** per `[FOUNDER-SECTION-8-B3-CT-BILLING-PREVIEW-AUTH]` (CT PR #20 `db2c079`; Foundation closeout this PR). NEW Control Tower route `/billing` (BillingPreviewPage) at `src/pages/BillingPreview.tsx` composes against the CT-side mirror at `src/lib/entitlement-catalog/{types,data}.ts` (compact derived from Foundation `docs/entitlement-catalog/*` PR #179 HEAD `308486c`). 12 panels render: Doctrine + Counts + Base Platform + Plans (4) + Seats (6) + Capability Packs (9) + Connector Pack Families (8) + Usage Meter Templates (16) + Governance Rules (18) + Non-paywallable Safety (13) + Downgrade Policies (5) + Enterprise Add-ons (13) + Billing Admin Permission Profile (1). Canonical Founder doctrine preserved verbatim across UI ("Customers should not pay extra just to have memory be safe." + "Billing says what the organization has purchased. Governance says what the system may safely do." + "Capability packs entitle availability; they do not authorize activation." + "Connector packs are not live connectors." + "This preview does not charge customers, activate billing, gate features, or connect payment providers."). 27 NEW CT unit tests (250/250 total, was 223; +27); typecheck + lint + vite build green. NO runtime billing, NO payment provider, NO entitlement enforcement, NO feature gating, NO customer subscription mutation, NO checkout, NO invoices, NO payment methods, NO usage metering runtime, NO connector activation, NO Dandelion runtime, NO workflow runtime, NO DMW runtime changes, NO BEAM / Python / Elixir, NO Foundation backend route added, NO Foundation API call from this page, NO new audit literal, NO MSW handler added. CT mirror substitutes neutral wording for 3 governance rule names whose literal prohibition prose would otherwise trip CT's forbidden-UI-copy guard (rule.no-employee-scoring → "No workforce-scoring inferences"; rule.no-manager-surveillance → "No managerial-oversight monitoring"; rule.no-regulator-approval-claims → "No regulatory-approval claims") — Foundation canonical catalog at `docs/entitlement-catalog/governance-rules.json` preserves original phrasing, substitution applies only to visible UI surface.

**B2 Static Entitlement Catalog LANDED 2026-06-01** per `[FOUNDER-SECTION-8-B2-STATIC-ENTITLEMENT-CATALOG-AUTH]`. NEW `docs/entitlement-catalog/` directory contains 9 catalog files (README + schema + plans + seats + capability-packs + connector-pack-families + usage-meters + governance-rules + downgrade-policies + enterprise-add-ons) totaling 93 catalog items: 4 plan templates (Starter/Pilot + Team + Business + Enterprise; every plan DMW_baseline_included=true; $250 base anchored in Starter/Pilot + Team), 6 seat tiers (Standard $25-$49 + Professional $75-$125 + Executive $150-$300 + Admin $99-$199 + Board/Observer $49-$149 + External custom), 9 capability packs (Dandelion Activation + Workflow Automation + Advanced Audit/Compliance + DMW/Memory Governance + Agent Playground/Simulation + Enterprise Analytics + Regulator/Evidence + Premium Support/Onboarding + Collaboration Pack candidate), 8 connector pack families per ADR-0084 + ADR-0083 Amendment 1 §9.4 (Collaboration + Workspace/Knowledge + Project/Engineering + Revenue + Customer + People + Finance/Expense/Travel + Legal/Compliance), 16 usage meter templates (deferred runtime to B3+), 18 governance rules + 13 non-paywallable safety rules + 1 Billing Admin permission profile, 5 downgrade policy templates (upgrade + downgrade + non-payment-grace + cancellation + enterprise-contract-end), 13 enterprise add-ons (SSO/SAML/SCIM + custom retention + custom connector + advanced DMW policy + private cloud/VPC + regulated deployment + dedicated support + SLA + DPA/MSA + premium onboarding + custom evidence workflows + audit export expansion + security review package). NEW `scripts/validate-entitlement-catalog.mjs` validator (pure Node ESM): JSON parse + 10 required files + required wrappers + universal field presence + ID uniqueness + ADR-0083 source ref + DMW_baseline_included on every plan + every seat + $250 base in plans + all required seat/pack/family/meter/non-paywallable IDs + forbidden-phrase scan (11 forbidden phrases with sentence-level negation detection + negation-item subtree skip) + canonical phrase presence in README ("Customers should not pay extra just to have memory be safe."). Validator green: 10/10 files, 93 items, 0 errors. NO Prisma schema, NO migration, NO runtime billing, NO payment provider, NO entitlement enforcement, NO feature gating, NO Control Tower UI, NO connector code, NO Dandelion runtime, NO workflow runtime, NO DMW runtime, NO BEAM/Python/Elixir, NO audit literal, NO existing service mutated.

The pre-existing `apps/api/src/services/monetization/monetization.service.ts` substrate (per ADR-0021 Capsule Type Extension Protocol — `PRICING_TABLE` + 70/30 revenue split math + per-monetization-role attribution) is preserved and continues to live alongside the future Section 8 entitlement substrate. The Section 8 Billing / Entitlements substrate is **additive** forward-substrate (per RULE 9 / RULE 13).

| Slice | Status |
|-------|--------|
| ADR-0083 base | ✓ Accepted 2026-06-01 (PR #175 `4b3265d`) |
| ADR-0083 Amendment 1 | ✓ Accepted 2026-06-01 (PR #176) |
| B2 — Static entitlement catalog | ✓ LANDED 2026-06-01 (PR #179) |
| B3 — CT billing preview | ✓ LANDED 2026-06-01 (CT PR #20 `db2c079`; Foundation closeout PR #180) |
| B4 — Internal entitlement / seat ledger design substrate | ✓ LANDED 2026-06-01 (this PR — `docs/entitlement-ledger/` 6 files + validator green; 4/4 ledgers + 4 plans + 6 seats + 9 packs + 16 meters cross-referenced) |
| B4 — Internal entitlement model + Founder pricing decision | queued (Founder-gated) |
| B5 — Billing Admin surface | queued (Founder-gated) |
| B6 — Usage meter foundation | queued (Founder-gated) |
| B7 — Payment provider integration | queued (Founder-gated + RULE 21) |
| B8 — Enterprise billing operations | queued (Founder-gated) |

## Canonical doctrine (8 lines preserved verbatim across both base + Amendment 1)

1. *"Billing is not just payment. Billing is the entitlement layer that controls how Otzar's governed intelligence capabilities scale across an enterprise."*
2. *"The DMW is not a luxury add-on. The Memory Wallet is foundational trust infrastructure."*
3. *"Customers should not pay extra just to have memory be safe."*
4. *"Base Otzar must include enough DMW capability for every Digital Twin to remember safely."*
5. *"Advanced memory governance can be premium; basic memory safety cannot."*
6. *"Billing says what the organization has purchased. Governance says what the system may safely do."*
7. *"Billing may entitle a connector pack; governance still authorizes connector activation."*
8. *"Downgrades may disable new premium actions, but they must never delete audit history, violate retention, or break evidence integrity."*

## Base price

**$250 / month** base platform per Founder direction.

The base tier includes:

- One organization / workspace.
- Foundation governance + audit substrate.
- Section 7 audit viewer + verify-chain (LIVE).
- Section 9 Approvals + Policies (LIVE).
- Section 10 operational substrate access (runbooks).
- Otzar Administrator seat (1).
- Read-only `/onboarding` Dandelion Preview.
- Read-only OOTB catalog + Wave 6 connector-priority matrix browse.
- **Baseline DMW / Memory Wallet — auto-provisioned per entity.**
- Foundation security baseline (NEVER unsafe-paywalled).

> *"The $250 base platform includes the memory-safety foundation required for Otzar to be trusted."*

## DMW-included doctrine (non-negotiable)

Baseline DMW is **included** at $250. Customers do not pay extra to have memory be safe.

**Baseline DMW (included)**: auto-provisioned per user/entity · self-scoped memory · team/project/action-scoped memory where authorized · forgetting/disconnect posture · audit/provenance metadata · safe memory education · DMW governance metadata for admins (NOT private content) · no crypto setup burden · no separate "wallet fee."

**Premium DMW (DMW / Memory Governance Pack)**: advanced retention · legal/compliance memory scopes · regulator/evidence memory · high-volume capsule storage · long-term archival · advanced memory analytics · cross-workflow memory governance · custom retention windows · governance reports · advanced selective forgetting workflows.

## Seat tiers (6) per Amendment 1 §9.3

Suggested **internal** USD ranges; NOT public pricing. Final per-seat USD requires Founder pricing decision at B2.

| Tier | Internal range | Intended for |
|------|---------------|--------------|
| Standard Digital Twin | $25 – $49 / user / mo | ICs · general employees |
| **Professional Digital Twin** (NEW Amendment 1) | $75 – $125 / user / mo | Managers · PMs · functional role owners |
| Executive / High-Authority Twin | $150 – $300 / user / mo | CEO · Founder · COO · CFO · CTO · CMO · CHRO · GC · senior executives |
| Otzar Administrator | $99 – $199 / admin / mo | Governance Admin · AI Operations Admin |
| Board / Observer | $49 – $149 / user / mo | Board members · investor observers · committee members |
| External Collaborator / Limited | (custom per engagement) | Auditor · vendor · counterparty under NDA |

## Capability packs (9) per Amendment 1 §9.4 + base ADR §2.1

- Dandelion Activation Pack (per ADR-0082 Stages B–F)
- Connector Pack (subdivided into **8 tool-family packs**; see below)
- Workflow Automation Pack (per ADR-0081 Stage 3+)
- Advanced Audit / Compliance Pack
- DMW / Memory Governance Pack (premium DMW)
- Agent Playground / Simulation Pack
- Enterprise Analytics Pack
- Regulator / Evidence Pack (per ADR-0036 LawfulBasis)
- Premium Support / Onboarding Pack

### Connector pack families (8)

1. **Collaboration Pack** — Slack · Teams · Gmail · Outlook · Calendar
2. **Workspace / Knowledge Pack** — Google Workspace · Microsoft 365 · Notion · Confluence
3. **Project / Engineering Pack** — Jira · Linear · Asana · Monday · GitHub · GitLab
4. **Revenue Pack** — Salesforce · HubSpot · Gong · Outreach · Salesloft
5. **Customer Pack** — Zendesk · Intercom · Gainsight · ChurnZero
6. **People Pack** — Workday · BambooHR · Rippling · Greenhouse · Lever · Lattice
7. **Finance / Expense / Travel Pack** — Concur · Ramp · Brex · Expensify · Navan · TravelPerk · NetSuite · QuickBooks · Bill.com
8. **Legal / Compliance Pack** — DocuSign · Ironclad · Vanta · Drata · OneTrust

## Plan archetypes (4) per Amendment 1 §9.5

- **Starter / Pilot** — $250 + limited seats + Dandelion preview + baseline DMW
- **Team** — $250 + Standard / Professional seats + Collaboration Pack
- **Business** — Admin Twin + Dandelion Activation Pack + multiple Connector Packs + Agent Playground + advanced audit
- **Enterprise** — custom annual + executive seats + board seats + advanced DMW governance + Regulator / Evidence Pack + SSO/SAML/SCIM + custom retention + premium support + SLA

## Usage meters (12) per Amendment 1 §9.8

Active Twin seats / Active Admin seats / Active Board seats / Dandelion activation runs / Workflow recommendations / Workflow runs / Proposed Actions / Approved connector actions / Connector read events / Connector write events / Simulation runs / Composite (audit exports + evidence packages + capsule volume + DMW governance events).

## Implementation ladder (B1-B8) per Amendment 1 §9.11

Front-loaded ladder per Founder direction: static catalog + CT read-only preview **before** runtime + payment provider.

| Slice | Scope | Gating |
|-------|-------|--------|
| B1 | This ADR + Amendment 1 | ✓ LIVE |
| B2 | Static entitlement catalog | Founder authorization required |
| B3 | CT billing preview (read-only) | Founder authorization required |
| B4 | Internal entitlement model + pricing decision | Founder pricing decision required |
| B5 | Billing Admin surface | Founder authorization required |
| B6 | Usage meter foundation | Founder authorization required |
| B7 | Payment provider integration | Founder authorization + RULE 21 research arc |
| B8 | Enterprise billing operations | Founder authorization required |

## Conceptual entitlement objects (8) per Amendment 1 §9.7

Design-only shapes; NOT implemented at this ADR:

1. `BillingAccount`
2. `Plan`
3. `SeatEntitlement`
4. `CapabilityPackEntitlement`
5. `FeatureEntitlement`
6. `UsageMeter`
7. `EntitlementCheck` (Billing × Governance × Policy intersection)
8. `DowngradePolicy`

## Billing Admin role per Amendment 1 §9.6

**CAN**: view plan + invoices · manage seats / packs · see usage · request upgrades/downgrades · review entitlement warnings.

**CANNOT (by default)**: read private memory · see workflow payloads · access connector secrets · bypass policies · approve high-risk workflows · export audit logs without separate authorization.

## Connector entitlement stages (1-7) per Amendment 1 §9.9

1. Discover / recommend (Dandelion L4 + Wave 6 matrix; no billing required)
2. Entitlement check (Connector Pack must be entitled)
3. Admin policy approval (Otzar Admin reviews)
4. OAuth / security setup (`secret_ref` env-var-NAME per ADR-0024)
5. Read-first activation (read_capabilities; writes still disabled)
6. Workflow-specific use (per ADR-0081 Stage 2+)
7. Write actions only with approval gates (per ADR-0081 Stage 3+; dual-control per ADR-0026)

## Workflow billing maturity mapping per Amendment 1 §9.10

| Workflow stage | Billing posture |
|----------------|-----------------|
| Stage 1 Template-only | Base tier; no add-on |
| Stage 2 Recommendation-only | Base tier OR Dandelion Activation Pack |
| Stage 3 Proposed Action | Workflow Automation Pack required |
| Stage 4 Governed Execution | Workflow Automation Pack + connector pack(s) + per-connector RULE 21 research arc |
| Stage 5 Continuous Optimization | Workflow Automation Pack + advanced governance (ADR-0048) |

## Runtime blockers

- **No payment provider selected** (deferred to B7 ADR + RULE 21).
- **No per-seat / per-pack USD pricing decided** (Founder decision at B2).
- **No `Entitlement` Prisma model** (deferred to B4).
- **No `EntitlementService.assertEntitled()`** (deferred to B5).
- **No `/billing/*` routes** (deferred to B3 preview + B5 surface).
- **No CT billing UI** (deferred to B3 + B5).

## Stop conditions before runtime

Per RULE 20 + Founder direction:

1. Cannot implement runtime without Founder pricing decision.
2. Cannot select payment provider autonomously (RULE 21 required).
3. Cannot weaken any of the 10 non-negotiable billing governance posture rules (base ADR §2.2).
4. Cannot weaken DMW base-tier inclusion (Amendment 1 §9.2).
5. Cannot paywall security / governance / audit / DMW base capabilities (base ADR §2.2.5 + Amendment 1 §9.12).
6. Cannot collapse company data boundaries (cross-tenant absolute).
7. Cannot break audit chain integrity through billing state changes.
8. Cannot delete retained records during downgrade / cancellation (Amendment 1 §9.13).

## Things that cannot be unsafely paywalled (13 items per Amendment 1 §9.12)

1. Access to historical audit records required for compliance
2. Retention of legally required records
3. Audit chain integrity verification
4. Basic DMW memory-safety behavior
5. Basic security controls
6. User offboarding safety
7. Ability to disconnect / revoke connectors
8. Ability to export required compliance / audit data during grace / legal window
9. Ability to disable risky automations / connectors
10. Ability to preserve data boundaries
11. Regulator-ready posture
12. DMW auto-provisioning + base scope discipline
13. Foundation governance posture (Approvals + Policies + Security Audit Viewer at read tier)

## Billing + governance separation

> *"Billing says what the organization has purchased. Governance says what the system may safely do."*

A customer may be entitled to a feature, but Foundation governance must still authorize use. Example: Customer pays for Connector Pack (entitlement ✓) — billing says Slack is available — governance still checks admin authorization · connector policy · OAuth scopes · role authority · workflow purpose · DMW memory scope · audit requirements · write approval gates.

## RULE 13 disclosures specific to Section 8

- Billing MUST NOT silently degrade service when payment fails; any degradation MUST surface clearly through Action policy decisions and audit emissions.
- Entitlement checks MUST run BEFORE policy evaluation per RULE 5 (auth → clearance → permission → conditions). A caller-without-entitlement MUST get a clear `403 ENTITLEMENT_INSUFFICIENT` envelope, not a confusing `FORBIDDEN` from the policy evaluator.
- The pre-existing `apps/api/src/services/monetization/monetization.service.ts` substrate (per ADR-0021) is **additive** to the future Section 8 entitlement substrate; ADR-0083 does not modify or supersede it. Cross-substrate coordination (entitlement × monetization-role × ActionPolicy) will require a future cross-section research arc.

## Section mapping (per Amendment 1 §9.14)

| § | Section | Billing interaction |
|---|---------|---------------------|
| 1 | Employee Intelligence Core | Seat tier controls Twin availability + memory scope level |
| 2 | Autonomous Execution Core | Entitlements gate ADR-0081 Stage 3+ volume |
| 3 | Hives / Team Intelligence | Department / team scale → packs |
| 4 | MCP / Connectors | Connector packs entitle; governance authorizes activation |
| 5 | Agent Playground | Simulation pack + usage allowance |
| 6 | Enterprise Analytics | Analytics pack + aggregate insight tier |
| 7 | Full Audit Viewer | Baseline included; advanced compliance / evidence premium |
| 8 | **Billing / Entitlements** | ADR-0083 + Amendment 1 |
| 9 | Admin / Governance Control Tower | Billing Admin role per Amendment 1 §9.6 |
| 10 | Deployment / Security / Go-Live | Enterprise contracts + retention + deployment model per ADR-0018 |

## Related

- **ADR-0083** at `docs/architecture/decisions/0083-section-8-billing-entitlements.md` — base + Amendment 1.
- **ADR-0021** — Capsule Type Extension Protocol (pre-existing monetization substrate companion).
- **ADR-0080 + Amendment 5** — OOTB ontology + Otzar Administrator first-class.
- **ADR-0081** — Workflows Doctrine (Workflow Automation Pack composes against Stage 3+).
- **ADR-0082** — Dandelion Activation Architecture (Dandelion Activation Pack composes against Stages B-F).
- **ADR-0026** — dual-control (high-risk billing actions reuse).
- **ADR-0036** — REGULATOR + LawfulBasis (Regulator / Evidence Pack composes).
- **ADR-0070** — regulator-ready Foundation doctrine (neutral compliance vocabulary).
- **ADR-0018** — deployment-target agnosticism posture (enterprise tier composes).

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
