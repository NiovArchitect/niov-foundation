# ADR-0084 — Section 4 MCP / Connector Strategy (Design-Only)

**Status:** Accepted 2026-06-01
**Nature:** Design-only. No code. No schema. No migration. No routes. No services. No connector adapter implementation. No OAuth flow. No secrets configuration. No Control Tower connector UI. No runtime activation. No LLM / Python / BEAM. No new audit literal.
**Founder authorization:** `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 5 (Section 4 Connector Strategy ADR / MCP connector plan) + `[FOUNDER-RESUME-AUTONOMOUS-BUILD-FROM-SAFE-HOLD-AUTH]` (autonomous-continuation authority for the 5-ADR design chain closure).
**Parent doctrine:** ADR-0080 (OOTB ontology) · ADR-0081 (Workflows Doctrine) · ADR-0082 (Dandelion Activation Architecture) + Amendment 1 (cartographer doctrine) · ADR-0083 (Section 8 Billing/Entitlements) + Amendment 1 (8 connector pack families) · ADR-0026 (dual-control) · ADR-0024 (pre-commit hook posture; `secret_ref` env-var-NAME pattern) · ADR-0070 (regulator-ready Foundation).

---

## 1. Context

Section 10 production-readiness audit (PR #164) flagged Section 4 first real connector as a **hard launch blocker** with a **DECISION POINT** posture. The Wave 6 connector-priority matrix (Foundation PR #169 `d2f9c44`) gave the Founder a substrate-grounded ranking — top 5: Slack 16.00 → Google Workspace 13.33 → Project Tracker 12.75 → Microsoft 365 11.05 → Microsoft Teams 11.00. ADR-0083 Amendment 1 §9.4 then subdivided the single Connector Pack from base ADR-0083 into **8 tool-family packs**. ADR-0082 Amendment 1 §9.7 declared that **workflows + connectors + memory activate only inside approved map regions** — map-region-gated activation is **stronger** than entitlement.

Section 4 substrate is partially live:

- `ConnectorBinding` Prisma model with `secret_ref` env-var-name discipline (per ADR-0024).
- `INVOKE_CONNECTOR` ActionType routing through the Action runtime per ADR-0057.
- `OutboundWebhookProvider` real adapter (HMAC-SHA-256; pure node stdlib).
- `NotificationService.connectorFanOut` opt-in hook.
- `verifyInboundHmac` reusable receive-side verifier.

What is **not** live:

- Any OAuth-based adapter (Slack / Google Workspace / Microsoft 365 / Jira / Salesforce / etc.).
- Per-connector secret rotation discipline.
- Per-tenant secret isolation runtime.
- Connector preset → ConnectorBinding promotion path.
- Connector adapter SDK selection per vendor.
- Per-connector RULE 21 research arcs.

This ADR locks the **connector strategy** — MCP posture · adapter categories · read-first-by-default · governance compose layer · per-connector RULE 21 gating · first-connector candidate arc · map-region activation gating · billing entitlement composition · forward-substrate implementation ladder. **The first real connector decision remains Founder-gated** at the implementation slice (C2 below); this ADR provides the substrate-grounded recommendation Founder can act on.

---

## 2. Decision

Foundation adopts the following Section 4 MCP / Connector Strategy.

### 2.1 Connector definition (canonical)

> *"A connector is a governed adapter that lets Otzar's Digital Twins read from or write to an external enterprise system under explicit billing entitlement, governance authorization, map-region approval, workflow purpose binding, DMW memory scope discipline, dual-control where required, and full audit lineage — never under autonomous authority."*

Connectors are **not**:

- Direct API integrations.
- Autonomous agents.
- RPA scripts.
- Permission grants by themselves.
- Bypass paths around governance.
- Always-on background sync.

Connectors **are**:

- Adapter substrate honoring the OOTB ontology's `ConnectorPreset` (per ADR-0080 §5.6 + Wave 6 priority matrix).
- Read-first by default; writes always approval-gated.
- Composable with the 6 governance layers (billing × entitlement × policy × dual-control × map-region × workflow purpose × DMW scope × audit).
- Auditable end-to-end via existing `ADMIN_ACTION` + `INVOKE_CONNECTOR` + `ACTION_*` lineage (no new audit literal).

### 2.2 MCP-compatible posture

The connector substrate **prefers** the **Model Context Protocol (MCP)** where vendor support exists. MCP — Anthropic's open protocol for tool / context exchange between AI applications and external systems — is appropriate substrate when:

- The vendor publishes an MCP server (or one exists via a reputable community implementation under a security-audited package).
- The vendor's MCP server exposes the read / write surfaces Otzar needs at the right granularity.
- The MCP server's auth model (OAuth / API token / bot token) composes against Otzar's `ConnectorBinding.secret_ref` env-var-name pattern (per ADR-0024).
- The MCP transport (stdio / WebSocket / HTTP+SSE) composes against Foundation's existing security headers + same-org boundary + audit lineage.

Where MCP is **not** available or **not** mature, Otzar uses **tool-specific adapters** following the same governance discipline. The strategic preference for MCP minimizes vendor-lock and minimizes per-connector implementation cost as the MCP ecosystem matures.

Per-connector decision: MCP vs. tool-specific is a **per-connector RULE 21 research arc** input (per §2.6 below) — not a blanket decision at this ADR.

### 2.3 Connector adapter categories

Per ADR-0083 Amendment 1 §9.4 + Wave 6 matrix, connectors group into **8 tool-family pack categories**. Each category has reference adapters from the Wave 2 OOTB catalog `tools.json`:

| Pack | Wave 6 priority | Reference adapters |
|------|----------------|---------------------|
| **Collaboration Pack** | TIER_1 (Slack 16.00) | Slack · Microsoft Teams · Gmail · Outlook · Google Calendar · Outlook Calendar |
| **Workspace / Knowledge Pack** | TIER_1 (Google Workspace 13.33) | Google Drive / Docs / Sheets / Slides · Microsoft 365 · SharePoint · OneDrive · Notion · Confluence |
| **Project / Engineering Pack** | TIER_1 (Project Tracker 12.75; GitHub 10.00) | Jira · Linear · Asana · Monday · GitHub · GitLab |
| **Revenue Pack** | TIER_1 (CRM 9.75) | Salesforce · HubSpot · Gong · Outreach · Salesloft |
| **Customer Pack** | TIER_2 (Support 6.63) | Zendesk · Intercom · Gainsight · ChurnZero · Freshdesk |
| **People Pack** | TIER_2 (HRIS 6.30, ATS 5.75) | Workday · BambooHR · Rippling · Greenhouse · Lever · Lattice · ADP · Gusto |
| **Finance / Expense / Travel Pack** | TIER_1 (Travel+Expense 8.75) | SAP Concur · Ramp · Brex · Expensify · Navan / TripActions · TravelPerk · NetSuite · QuickBooks · Bill.com · Coupa |
| **Legal / Compliance Pack** | TIER_2 (Legal 6.63; Compliance 6.31) | DocuSign · Ironclad · LinkSquares · Evisort · Vanta · Drata · OneTrust · Secureframe |

The OutboundWebhook adapter (LIVE) is **transversal** — it is not pack-bound and serves as a generic egress substrate for any vendor without a dedicated adapter.

### 2.4 Universal connector principles (non-negotiable)

Per Founder direction (`[FOUNDER-SECTION-8-BILLING-ENTITLEMENTS-ADR-AUTH]` connector principles section + ADR-0080 §11 + ADR-0083 Amendment 1 §9.4):

1. **Read-first by default.** Every new connector ships at read-only at activation.
2. **Write actions disabled by default.** Per-write enablement requires approval chain configuration per Section 9 Approvals.
3. **Risky writes require dual-control** (per ADR-0026).
4. **All connector activity audited** — existing `ADMIN_ACTION` + `INVOKE_CONNECTOR` + `ACTION_*` lineage; NO new audit literal.
5. **No connector payload leaks.** Per Wave 2 OOTB `ConnectorPreset.no_leak_rules` + ADR-0079 forbidden-fields catalog. Raw email body / raw document content / raw chat content / customer PII / secret payload never returned in default surfaces.
6. **No secrets exposed.** Admin sees `secret_ref` env-var-NAMEs only; payload absolute forbidden (per ADR-0024).
7. **No connector activation from billing alone** — billing entitles availability; governance authorizes activation (per ADR-0083 §2.2.1 + Amendment 1 §9.9).
8. **Same-org boundary absolute** — connector activity scoped to the org's tenant boundary; cross-tenant leakage absolute forbidden.
9. **Per-vendor OAuth scope minimization** — request only the minimum read / write scope Otzar needs.
10. **Per-connector kill switch** — admin can disable any connector binding at any time regardless of billing state.

### 2.5 The 6-layer governance compose stack

Every connector action passes through **6 governance layers** (in order). Each layer can deny independently.

| Layer | What it checks |
|-------|----------------|
| **1. Billing entitlement** | Connector Pack entitled per ADR-0083 Amendment 1 §9.4. If not, → `ENTITLEMENT_INSUFFICIENT`. |
| **2. Map-region approval** | Connector's Tool Map region approved by admin per ADR-0082 Amendment 1 §9.7. If not, → `MAP_REGION_NOT_APPROVED`. |
| **3. Policy** | Per ADR-0008 OrgSettings policy state for connector class. If denied, → policy denial reason. |
| **4. Workflow purpose** | If the action is workflow-driven (per ADR-0081 Stage 3+), the workflow's `connector_actions` must include this action and the workflow's approval chain must be satisfied. |
| **5. DMW scope** | If the action reads / writes memory-implicated data, the entity's DMW envelope must include the relevant scope (per ADR-0080 envelope + ADR-0079 forbidden categories). |
| **6. Per-call governance** | Per-action approval chain + dual-control where required (per ADR-0026); per ADR-0050 break-glass time-boxed only. |

The 6 layers compose in **AND** semantics: every layer must allow for the action to proceed. The first denial returns the deny envelope without consulting downstream layers (defense-in-depth + observability + cost discipline).

This is **stronger** than the §2.2 base posture and **stronger** than ADR-0083's entitlement-alone gate. Per ADR-0082 Amendment 1 §9.7: *"A customer may be entitled to a Connector Pack (billing ✓), the connector preset may exist in the catalog (entitlement ✓), but if the Tool Map's region for that connector is unmapped / uncertain / blocked, Foundation governance does not authorize activation."*

### 2.6 Per-connector RULE 21 research arc gating

Every new connector adapter implementation requires a **RULE 21 pre-authorization research arc** before code lands. The research arc covers:

| Research dimension | Why |
|--------------------|-----|
| **API stability + maturity** | Wave 2 OOTB `tool.api_maturity` (STABLE / PARTIAL / BETA). Beta APIs surface in Wave 6 score but require extra resilience design. |
| **Auth model** | OAuth2 user vs. admin-consent vs. bot token vs. API token vs. SAML / IAM role. Determines `secret_ref` env-var-NAME pattern + rotation cadence. |
| **MCP availability** | Vendor-published MCP server present? Mature? Security-audited? If yes, prefer MCP per §2.2. |
| **Read / write surface granularity** | Does the vendor expose the read / write surfaces Otzar needs at acceptable granularity? Risky-write surface enumeration. |
| **No-leak surface** | What fields the connector returns that must be redacted before any default surface (per ADR-0079 + Wave 2 `tool.no_leak_rules`). |
| **Rate limit / quota model** | Vendor API rate limits + Otzar's usage projection. Determines retry / backoff / circuit-breaker design. |
| **Data sensitivity** | Per Wave 2 `tool.data_sensitivity` (LOW / MEDIUM / HIGH / CRITICAL). Drives DMW scope + governance review depth. |
| **Compliance / regulatory posture** | HIPAA / SOX / GDPR / GLBA / FedRAMP / etc. surface — drives ADR-0036 LawfulBasis composition if applicable. |
| **Integration complexity** | Per Wave 2 `tool.integration_complexity` (SMALL through VERY_LARGE). Drives slice sizing. |
| **Webhook + replay model** | Inbound webhook support + signing model. Composes against `verifyInboundHmac` substrate. |
| **Vendor lock-in / portability** | Per ADR-0018 deployment-target agnosticism. Does this vendor compose against sovereign / on-prem / air-gapped deployments? |

The RULE 21 research arc lands as an inline section in the per-connector implementation ADR (ADR-008N for connector N). No connector adapter merges without the research arc.

### 2.7 First connector candidate arc

Per Wave 6 matrix top 3 + Founder direction (`[FOUNDER-RESUME-AUTONOMOUS-BUILD-FROM-SAFE-HOLD-AUTH]` recommends the Wave 6 top 3 sequence):

**Arc Step 1: Slack read-first** (Wave 6 priority 16.00; Collaboration Pack TIER_1).

- MCP availability: Slack publishes an MCP server (research arc verifies maturity at implementation time).
- Auth model: OAuth2 bot token (`SLACK_BOT_TOKEN` env-var-NAME pattern).
- Read surface: public channels · user-authorized DMs (delegated) · user profile.
- Risky writes (disabled at activation): `chat:write` post · `reminders:write` · admin operations.
- No-leak: raw DM content never in default surfaces.
- Audit: every action via `INVOKE_CONNECTOR` + `details.action` discriminator.
- Justification: highest Wave 6 score; ubiquitous enterprise adoption; mature API; bot-token auth simpler than OAuth-user; large surface for first-week aha moments (executive brief / standup summary / project digest).

**Arc Step 2: Google Workspace read-first** (Wave 6 priority 13.33; Workspace/Knowledge Pack TIER_1).

- Components: Google Calendar · Gmail · Google Drive (Docs / Sheets / Slides).
- Auth model: OAuth2 user consent + admin consent for domain-wide delegation where applicable.
- Read surface: calendar events (user-delegated) · email metadata (delegated) · drive files caller-scoped.
- Risky writes (disabled at activation): mail.send · calendar.event.modify · drive.permissions.update.
- No-leak: raw email body / raw document content never in default surfaces.
- Justification: 6-tool preset = high value across EA / executive / IC roles; pairs with Slack for full first-week aha moments (Tomorrow's Executive Brief / Meeting Follow-Up Draft / Drive document context).

**Arc Step 3: Project Tracker read-first** (Wave 6 priority 12.75; Project/Engineering Pack TIER_1).

- Components: Jira + Linear (single pack).
- Auth model: OAuth2 user consent.
- Read surface: issues caller can access · projects · boards · sprint state.
- Risky writes (disabled at activation): write:jira-work · transition · admin operations.
- No-leak: customer-confidential ticket content redacted in default surfaces.
- Justification: TIER_1 priority; PM + Engineering Manager + SWE aha moments (Sprint Risk Summary · Roadmap Decision Brief · PR/Issue Status Summary).

The first 3 connectors give the broadest first-week aha-moment surface for the largest role set (EA + CEO + COO + PM + EM + SWE) while keeping each adapter substantively bounded.

**The first real connector decision (Slack first vs. another order) remains Founder-decision-gated at C2 below.** This ADR provides the substrate-grounded recommendation matching Wave 6 + Founder direction + first-week aha-moment value.

### 2.8 Workflow purpose binding

Per ADR-0081 §2.6 (Workflow → Action runtime coupling) + ADR-0082 Amendment 1 §9.7:

- Stage 1 (Template-only) workflows reference connector presets in the catalog but cannot invoke.
- Stage 2 (Recommendation-only) workflows surface connector-using workflow recommendations to admins; no invocation.
- Stage 3 (Proposed Action) workflows propose `Action` rows of `ActionType = INVOKE_CONNECTOR` per ADR-0057. The Action enters the approval queue; no invocation until approved.
- Stage 4 (Governed Execution) approved Actions invoke the connector through the §2.5 6-layer governance stack. Connector preset must be activated for the org; workflow's `connector_actions` must include this action.
- Stage 5 (Continuous Optimization) per ADR-0048 — connector usage patterns inform aggregate signals; no autonomous expansion of scope.

The connector substrate does **not** bypass the workflow stages. A workflow at Stage 2 cannot invoke a connector even if the connector is activated — the workflow itself must reach Stage 4.

### 2.9 DMW memory scope discipline

Every connector action that touches memory-implicated data flows through the DMW envelope (per ADR-0080 §5.16 + Wave 2.1 role-depth §25 notes + ADR-0079 forbidden categories).

- Read actions write retrieved data into the caller's DMW under the role-appropriate scope.
- Write actions consume DMW context within the entity's envelope.
- Forbidden categories (private personal / family / health / protected attributes / union / labor organizing where applicable per ADR-0079 §7) absolute forbidden ingest regardless of connector.
- Per-role DMW notes (Wave 2.1 §25 of each role-depth file) bound which scopes are appropriate.

### 2.10 Per-tenant secret isolation

Per ADR-0024 + ADR-0019:

- Each `ConnectorBinding` row stores a `secret_ref` env-var-NAME (e.g., `SLACK_BOT_TOKEN_<org_entity_id>`), never the secret payload.
- The deployment-target's secret manager (AWS Secrets Manager / GCP Secret Manager / Azure Key Vault / Supabase Vault / etc. per ADR-0018) resolves the env-var-NAME to the actual payload at runtime.
- Secrets rotate per company policy + per vendor token TTL.
- Admin UI shows `secret_ref` env-var-NAMEs only; payload absolute forbidden in any surface.
- Cross-tenant secret leakage absolute forbidden — same-org boundary preserved at the secret resolution tier.

### 2.11 Inbound webhook substrate

The `verifyInboundHmac` reusable verifier (LIVE per Section 4 Hardening Wave B) is the foundation for inbound webhook consumption. Per-connector inbound webhook routes:

- Compose against `verifyInboundHmac` for signature verification.
- Are gated by the same 6-layer governance stack (§2.5) — billing entitlement for inbound channels + map-region approval + policy + DMW scope.
- Emit audit via existing patterns; no new audit literal.
- Are bounded by replay window + signing timestamp discipline.

No inbound webhook routes are activated by this ADR; per-connector inbound routes land in the per-connector implementation slice.

---

## 3. Non-goals

This ADR does **not**:

- Choose the first real connector implementation (Founder decision at C2).
- Implement any OAuth flow.
- Configure any vendor secret.
- Add any vendor SDK dependency.
- Add Foundation API routes for any new connector.
- Build any vendor-specific adapter.
- Build a Control Tower connector activation UI.
- Add new audit literals.
- Modify the existing `ConnectorBinding` Prisma model.
- Modify the `OutboundWebhookProvider` adapter.
- Modify `INVOKE_CONNECTOR` ActionType handling.
- Activate any connector in production.
- Add LLM / Python / BEAM coordination.

---

## 4. Implementation ladder

| Slice | Scope | Gating |
|-------|-------|--------|
| **C1** (this ADR) | Strategy + categories + universal principles + 6-layer governance stack + per-connector RULE 21 discipline + first-connector candidate arc + workflow/DMW/secret/inbound substrate | This Founder authorization |
| **C2** | **First real connector decision** (Slack first per §2.7 OR Founder-overridden) + per-connector RULE 21 research arc + per-connector ADR | Founder connector-selection decision + RULE 21 research arc |
| **C3** | First connector adapter implementation (read-first; OAuth setup; secret_ref env-var-NAME pattern; ConnectorBinding integration; INVOKE_CONNECTOR handler; integration tests) | C2 decision + separate Founder authorization at slice |
| **C4** | First connector CT surface (admin activation flow + read-only display; admin policy approval gate) | C3 LIVE + separate Founder authorization |
| **C5** | First connector workflow integration (one ADR-0081 Stage 2 workflow surfaces this connector at recommendation-only tier) | C4 LIVE + separate Founder authorization |
| **C6** | First connector write enablement (per-write approval chain configuration; per-write dual-control where required) | C5 LIVE + separate Founder authorization + per-write risk review |
| **C7** | Second connector adapter (Google Workspace read-first per §2.7) | C6 + separate Founder authorization + RULE 21 |
| **C8** | Third connector adapter (Project Tracker read-first per §2.7) | C7 + separate Founder authorization + RULE 21 |
| **C9+** | Subsequent connectors per company demand + Dandelion L4 Tool Map + Wave 6 priority refresh | Per-connector Founder authorization + RULE 21 |

Each slice is bounded + separately authorized. **Do not implement C2+ automatically.**

---

## 5. Governance posture (universal across all connector states)

1. **No autonomous connector activation.** Every connector activation requires Otzar Admin approval per ADR-0082 Amendment 1 Stage D Governance Review.
2. **No autonomous connector write.** Every write requires the §2.5 6-layer stack + per-action approval per ADR-0081 Stage 3+.
3. **No connector payload exposure.** Per ADR-0079 + Wave 2 `no_leak_rules`.
4. **No secret payload exposure.** Per ADR-0024.
5. **No cross-tenant connector activity.** Same-org boundary absolute.
6. **No connector-driven surveillance.** Per ADR-0058 — no employee-level data aggregation; no manager-side monitoring framing; no behavior maps (per ADR-0082 Amendment 1 §9.5 forbidden language).
7. **No connector-driven regulator disclosure** without ADR-0036 LawfulBasis.
8. **No connector-driven legal certainty claims** per ADR-0070.
9. **No connector-driven Twin profile creation** per ADR-0082 D5/F gating.
10. **Admin kill-switch at any time** regardless of billing state.

---

## 6. CT `/connectors` page disposition

The Control Tower currently has no `/connectors` page (only the Wave 3 `/onboarding` Dandelion Preview shows the connector preset catalog as the read-only "Connector Preset Preview" panel + the Wave 6 priority ranking panel).

Forward cadence (Founder-authorized per slice):

- **At C1 (this ADR)**: no CT changes.
- **At C4 (first connector CT surface LIVE)**: CT `/connectors` becomes admin activation + governance dashboard:
  - Per-connector preset state (ENTITLED / MAP_REGION_APPROVED / POLICY_APPROVED / OAUTH_CONFIGURED / READ_FIRST_ACTIVE / WRITE_APPROVED).
  - Per-connector kill-switch.
  - Per-connector audit summary.
  - Per-connector policy review queue.
  - Per-connector approval chain configuration link to Section 9 Approvals.
- **At C5+ (workflow integration LIVE)**: CT shows connector × workflow composition map.
- **At C6+ (write enablement LIVE)**: CT shows per-write approval state.

The CT page is a **governance + visibility** surface. It is never an autonomous activation console.

---

## 7. Citations

- **RULE 0** (humans always sovereign)
- **RULE 1** (build forward only — additive to existing connector substrate)
- **RULE 4** (audit before response — every connector action audited)
- **RULE 9** (modular connections — vendor adapters compose; no cross-service DB reads)
- **RULE 10** (nothing is ever deleted — connector state preserved via soft-delete + audit chain)
- **RULE 13** (surface drifts inline — naming continuity with existing Section 4 substrate preserved)
- **RULE 16** (no `console.*` in `apps/api/src` — connector adapters use structured logger)
- **RULE 20** (rule-modification authority — connector strategy posture (§5) is RULE 20-protected)
- **RULE 21** (pre-authorization research arc — every per-connector implementation requires research per §2.6)
- **ADR-0001** (three-wallet architecture)
- **ADR-0002** (append-only audit chain)
- **ADR-0008** (EntityComplianceProfile is org-level — connector policy gated at org tier)
- **ADR-0018** (deployment-target agnosticism posture — connector adapters compose against sovereign / on-prem / air-gapped)
- **ADR-0019** (cryptographic-suite posture — secret handling discipline at adapter tier)
- **ADR-0024** (pre-commit hook posture — `secret_ref` env-var-NAME pattern preserved at every connector binding)
- **ADR-0025** (Schema-Push-Target Discipline — any future schema change for connectors goes through deploy pipeline)
- **ADR-0026** (dual-control middleware — risky writes reuse `requireDualControl`)
- **ADR-0027** (governance + RULE 20)
- **ADR-0033** (cross-language data ownership — TypeScript-Prisma canonical store)
- **ADR-0036** (REGULATOR principal + LawfulBasis — regulator-facing connectors gated)
- **ADR-0048** (governed personalization-orchestration — Stage 5 continuous optimization consumes connector signals)
- **ADR-0050** (break-glass time-boxed audit — never standing connector authority)
- **ADR-0052** (Otzar DGI — connectors are the substrate Otzar's Domain General Intelligence acts through)
- **ADR-0057** (autonomous execution core — `INVOKE_CONNECTOR` ActionType reused; no new ActionType)
- **ADR-0058** (drift detection — no manager surveillance absolute)
- **ADR-0070** (regulator-ready Foundation doctrine — neutral compliance vocabulary)
- **ADR-0071** (cross-scope verify-chain — connector audit visible at every scope)
- **ADR-0076** (Wave 9 multi-agent simulation — connector preset references in simulations)
- **ADR-0078** + **ADR-0079** (conversation context substrate / transcript policy — connectors that touch meeting transcripts defer here)
- **ADR-0080** (OOTB ontology + Wave 2 `tools.json` + `connector-presets.json` + Wave 6 `connector-priority-matrix`)
- **ADR-0081** (Workflows Doctrine — connector-using workflows compose at Stage 3+)
- **ADR-0082** (Dandelion Activation Architecture + Amendment 1 cartographer doctrine — map-region-gated activation per §9.7)
- **ADR-0083** (Section 8 Billing/Entitlements + Amendment 1 — 8 connector pack families + connector entitlement stages 1-7)
- Patent **US 12,517,919** (COSMP) · **US 12,164,537** + **US 12,399,904** (DMW + Foundation primitives)

---

## 8. Founder authorization

This ADR is authorized under `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 5 (Section 4 Connector Strategy ADR) + `[FOUNDER-RESUME-AUTONOMOUS-BUILD-FROM-SAFE-HOLD-AUTH]` (autonomous-continuation authority).

Subsequent slices (C2-C9+) require their own Founder authorization at slice. **Do not implement C2+ automatically.** The first real connector selection (Slack first per §2.7 recommendation OR Founder-overridden) requires explicit Founder decision + per-connector RULE 21 research arc.

After this ADR lands, the 5-ADR Domain General Otzar design chain is **complete**:

- Wave 2.1 role-depth Markdown layer (LIVE PR #172)
- ADR-0081 Workflows Doctrine (LIVE PR #173)
- ADR-0082 Dandelion Activation Architecture (LIVE PR #174) + Amendment 1 cartographer doctrine (LIVE PR #177)
- ADR-0083 Section 8 Billing / Entitlements (LIVE PR #175) + Amendment 1 billing expansion (LIVE PR #176)
- **ADR-0084 Section 4 MCP / Connector Strategy** (THIS ADR)

The implementation roadmap (D2-D8 Dandelion · B2-B8 Billing · C2-C9+ Connectors · ADR-0081 W3-W6 Workflows) is now fully bounded and each subsequent slice is separately Founder-authorized. The next bounded autonomous slice depends on Founder direction; recommended candidates (none autonomously eligible without Founder selection):

1. **C2 — Founder selects first real connector** (recommended: Slack per Wave 6 + §2.7).
2. **B2 — Static entitlement catalog** (bounded; eligible for autonomous build if Founder confirms).
3. **D2 — Dandelion Assessment substrate** (`DandelionAssessment` Prisma model + admin-only routes; Founder authorization at slice).
4. **Wave 2.1 expansion to additional roles** (substrate-deepening; lower priority per autonomous-build directive).

### CT Section 4 Connectors Admin Surface LANDED 2026-06-01

Per `[CT-SECTION-4-CONNECTORS-ADMIN-SURFACE]` (CT PR #21 `714879b`; Foundation closeout this PR). Operator-visible Control Tower `/connectors` page consumes the 5 LIVE Foundation admin routes at `/api/v1/org/connectors[/:id]` (POST register + GET list + GET single + PATCH update/enable-disable + DELETE soft-delete; all `can_admin_org`-gated via `requireAdminCapability` preHandler).

NEW Control Tower artifacts:
- `src/lib/connectors/types.ts` — CT-side mirror of Foundation's `ConnectorBindingView` + `RegisterConnectorBindingInput` + `ConnectorBindingFailure` shapes
- `src/lib/connectors/data.ts` — CT-side mirror of Foundation's `CONNECTOR_REGISTRY` (SLACK_READ + OUTBOUND_WEBHOOK + FIXTURE_ECHO; FIXTURE_ECHO hidden from selection UI)
- `src/pages/ConnectorsAdmin.tsx` — operator page (Posture/doctrine + Available types + Register form + Existing bindings list with per-card Enable/Disable + Soft-delete)
- `src/lib/api.ts` `api.connectors` namespace (list/get/register/update/delete)
- `src/lib/nav.ts` Connectors NAV entry
- `src/App.tsx` `/connectors` route
- 29 NEW CT unit tests (250 → 279 total)

**Privacy invariant preserved at the CT register:** `secret_ref` displayed as env-var NAME only (e.g. `SLACK_BOT_TOKEN_PROD`); resolved env-var VALUE never crosses the API boundary (structurally impossible per Foundation's `ConnectorBindingView` allowlist projection); page renders explicit "resolved value never displayed" disclaimer; tests assert no concrete bot-token pattern `/xoxb-[A-Za-z0-9]{4,}-[A-Za-z0-9]{4,}/` ever appears.

**Section 4 graduation:** Slack `RUNTIME_READY` (backend) → **`OPERATING`** (admin self-serve). Admins can now register a Slack workspace binding from the Control Tower; the binding flows through the same governance pipeline (org-scoped ConnectorBinding + INVOKE_CONNECTOR ActionType + ACTION_* audit chain + GOVSEC.6 structural cross-tenant denial) as every other connector. First real customer-bound activation is now unblocked.

NO new Foundation route. NO new audit literal. NO schema migration. NO mutation to existing Foundation services. NO connector invocation surface in this slice (the admin page registers bindings; INVOKE_CONNECTOR still routes through Section 2 Action runtime). NO write-capability toggle (writes deferred to ≥C6).

### C2 — Slack Read-First Connector Runtime LANDED 2026-06-01

Per `[FOUNDER-RUNTIME-ACTIVATION-CLARIFICATION-NO-MORE-PERMANENT-STATIC-ONLY-DEFAULT]` + `[FOUNDER-PREVIEW-TO-OPERATING-STATE-GRADUATION-AUTH]`. First real vendor connector lands at Foundation backend register. Classification E (Connector Runtime).

NEW `apps/api/src/services/connector/slack-read.provider.ts` — `SlackReadProvider` class implementing the canonical `ConnectorProvider` interface. Three read operations: `channels.list` (via `conversations.list`) + `users.list` + `conversations.history`. Bot-token-based (xoxb-*) per Slack OAuth v2 modern app pattern; bot token resolved via `binding.secret_ref` env-var-NAME pattern per ADR-0019 + ADR-0024. Fixture-first: default invocation runs deterministic fixture mode (no outbound HTTP); real Slack Web API reached only when `process.env.SLACK_USE_REAL === "1"` + `binding.config.use_real === true` + `binding.secret_ref` resolves to a non-empty env-var value. Defensive triple gate prevents accidental real-API activation in CI / dev.

MOD `apps/api/src/services/connector/connector.service.ts` — `ConnectorType` union extended `"OUTBOUND_WEBHOOK" | "FIXTURE_ECHO"` → `"OUTBOUND_WEBHOOK" | "FIXTURE_ECHO" | "SLACK_READ"`; `CONNECTOR_REGISTRY.SLACK_READ` frozen entry (display_name: "Slack (read-first)" / transport: "https-get-bearer-token" / default_config_keys: `["use_real", "workspace_id"]` / `secret_ref_required: true`); `getConnectorTypeDefinition` recognizes `SLACK_READ`; `getConnectorProviderAsync("SLACK_READ")` dynamic-imports + constructs `SlackReadProvider` (mirrors the OUTBOUND_WEBHOOK pattern to avoid static-import cycles).

The existing `INVOKE_CONNECTOR` ActionType handler at `apps/api/src/services/action/handlers.ts:574` (`makeInvokeConnectorHandler`) dispatches unchanged — `SLACK_READ` is just another connector type passing through the same governance pipeline:

1. Payload validated at create-time + execute-time
2. `ConnectorBinding` resolved with `org_entity_id` filter (cross-tenant denial enforced structurally — cross-org `binding_id` returns `CONNECTOR_BINDING_NOT_FOUND`)
3. Binding enabled-state check (`CONNECTOR_BINDING_DISABLED` on miss)
4. Type-registry check (`CONNECTOR_TYPE_UNKNOWN` on miss)
5. Provider invocation
6. Result → ACTION_SUCCEEDED / ACTION_FAILED via existing audit chain

NO new audit literal. NO schema migration. NO new route. NO mutation to the existing INVOKE_CONNECTOR handler.

NEW `tests/unit/c2-slack-read-provider.test.ts` — 22 tests across: SLACK_READ registry extension + provider factory + fixture-mode success per operation + payload validation (unknown operation / missing channel / empty payload) + 8 forced-failure fixture keys mapping to each `error_class` + environment-gate behavior (SLACK_USE_REAL unset / config.use_real false) + privacy invariant (delivery_metadata never carries xoxb- / Bearer / message content / user PII / error message scrubs bot token).

MOD `tests/unit/connector-provider.test.ts` — frozen-anchor contract test updated to reflect the registry extension (2 → 3 connector types). Identical assertion shape; no behavioral test removed.

**Privacy invariant** (mirrors existing OutboundWebhookProvider pattern):

- `delivery_metadata` may carry counts (channels_count / members_count / messages_count) + status code + mode label; NEVER raw message content, channel content, user PII, or the bot token
- On error, `message` is a short scrubbed summary; never includes the resolved bot token, raw response body, or third-party stack traces
- Network errors collapse to NETWORK; HTTP 429 → RATE_LIMIT; Slack `ok=false` with `invalid_auth` / `not_authed` → AUTH; other Slack errors → PROVIDER_ERROR with the Slack error code surfaced (Slack error codes are not secret material)

**Test/build state:** unit suite 1161 → 1183 (+22) · typecheck baseline preserved at 4 canonical errors · existing connector-provider frozen-anchor contract preserved with the C2 extension.

**Out of scope at C2** (forward-substrate per ADR-0084 9-slice ladder):

- Writes (chat.postMessage / files.upload / etc.) — ≥C6
- OAuth installation flow — ≥C5
- Events API webhook ingestion — ≥C7 (composes against existing `verifyInboundHmac` substrate)
- Private-message / search.messages reads (require xoxp- user-token scopes) — later C-slice
- Control Tower binding-creation UI consumer — separate CT slice; current `/api/v1/org/connectors[/:id]` admin routes (Section 4 Wave 2 LIVE) already accept `type: "SLACK_READ"` since the column is plain `String` (no schema migration needed)

**Section 4 graduation:** Slack `RECOMMENDATION_READY` → **`RUNTIME_READY`** (backend provider + tests + registry extension landed). Final graduation to `OPERATING` happens when the first real customer-bound activation lands a working binding row + uses the SLACK_USE_REAL=1 production path against a live workspace.

**GOVSEC.6 graduation:** the `assertSameOrgConnectorTarget` + `assertAiAgentMayInvokeConnector` helpers from `apps/api/src/services/govsec/agent-abuse-guard.ts` (landed PR #183) are now structurally exercised by this slice's INVOKE_CONNECTOR path: cross-tenant denial enforced via `getConnectorBindingForOrg` org-scoped lookup; AI_AGENT write-intent denial forward-substrate to the C6 write slice. GOVSEC.6 graduates `SUBSTRATE_READY` → **`OPERATING (read-first)`** — the helpers + structural enforcement are LIVE for the first real adapter. Full `CLOSED` lands when GOVSEC.6 covers the C6 write path with an adversarial integration test.

### Connector Implementation-Readiness Catalog LANDED 2026-06-01

Per `[FOUNDER-POST-B3-AUTONOMOUS-D2-AND-CONNECTOR-READINESS-CONTINUATION-AUTH]`. NEW `docs/connector-readiness/` directory (9 files: README + JSON Schema + 5 connector files for Slack / Google Workspace / Jira+Linear / Microsoft 365 / GitHub + matrix JSON + matrix Markdown) + NEW `scripts/validate-connector-readiness.mjs` validator. RULE 21 research arc captured at 2026-06-01 against official vendor docs (docs.slack.dev / developers.google.com / developer.atlassian.com / developers.linear.app / learn.microsoft.com / docs.github.com). Validator green: 9/9 files, 7 items (5 connectors + Linear sub-item + matrix), 7/7 required IDs, 0 errors.

Every connector item carries: official docs cited verbatim + MCP posture + OAuth model + app installation model + admin consent model + read capabilities + write capabilities (disabled by default) + webhook / event capabilities + risky write actions + `default_mode: READ_FIRST` (enforced) + required approval gates + dual-control recommendations + DMW scope implications + workflow purpose bindings per ADR-0081 + billing pack mapping per ADR-0083 Amendment 1 §9.4 + Dandelion map dependencies (Tool / Workflow / Authority / Memory / Risk) + audit expectations (existing literals; no new audit literal) + secret handling per ADR-0024 + ADR-0019 + no-leak rules + tenant isolation + rate limit notes + testing strategy + implementation risks + first slice recommendation + 13-dimension `readiness_scoring` + `not_implemented_yet: true` (enforced).

Matrix ranking (composite weighted across 13 dimensions; formula documented at `connector-readiness-matrix.md`): **Slack 8.65 (C2) · Linear 7.65 (C4-B) · Jira Cloud 7.55 (C4-A) · Google Workspace 7.50 (C3) · GitHub 7.40 (C-GitHub) · Microsoft 365 7.10 (C5)**.

Substrate-honest disclaimer canonical: research captured 2026-06-01; vendor APIs evolve (Slack classic-apps deprecation Nov 2026; Atlassian points-based rate limits enforcement March 2026; etc.). Per-connector readiness re-validation required at each C-slice pre-flight. Suggest-only — C2 first real connector activation remains Founder-gated.

The readiness catalog graduates Section 4 from `PREVIEW_ONLY` (strategy ADR + Wave 6 matrix) to **`RECOMMENDATION_READY`**. Per-connector next step: `RUNTIME_READY` at C-slice PR landing; `OPERATING` after first real customer-bound activation. Recommended next slices: GOVSEC.6 (agent abuse / confused-deputy hardening) before/alongside C2 → C2 Slack read-first runtime → D3 Dandelion Recommendation substrate. NEW `docs/current-build-state/04-mcp-connectors.md` extended with the readiness catalog summary at the top.

### C3 — Google Workspace Read-First Connector Runtime LANDED 2026-06-01

Per `[FOUNDER-PREVIEW-TO-OPERATING-STATE-GRADUATION-AUTH]` autonomous continuation. Section 4 C3 — **second** real vendor connector. Pattern-mirrors C2 SLACK_READ verbatim (ADR-0014 key-based dispatch + fixture-first defensive triple gate + closed-vocab failure codes + privacy invariant + RULE 21 research arc captured at C3 pre-flight against developers.google.com).

NEW `apps/api/src/services/connector/google-workspace-read.provider.ts` — `GoogleWorkspaceReadProvider implements ConnectorProvider`. Three read operations: `calendar.events.list` (primary calendar metadata; `fields=items(id,status,updated,recurringEventId)` filter excludes attendee email PII + descriptions) · `drive.files.list` (file metadata only; `fields=files(id,mimeType,modifiedTime)` filter excludes file names + content) · `gmail.messages.list` (message IDs + threadIds only; no `format=full` / `format=metadata` body fetch at C3).

MOD `apps/api/src/services/connector/connector.service.ts` — `ConnectorType` union extended to 4 types; `CONNECTOR_REGISTRY.GOOGLE_WORKSPACE_READ` frozen entry added (`transport: "https-get-bearer-token"` + `default_config_keys: ["use_real", "workspace_domain"]` + `secret_ref_required: true`); `getConnectorTypeDefinition("GOOGLE_WORKSPACE_READ")` resolves; `getConnectorProviderAsync("GOOGLE_WORKSPACE_READ")` dynamic-imports the provider (same circular-import-dodge pattern as SLACK_READ + OUTBOUND_WEBHOOK).

**Fixture-first defensive triple gate** (identical pattern to C2): real Google APIs are reached only when **all three** hold: (1) `process.env.GOOGLE_USE_REAL === "1"`, (2) `binding.config.use_real === true`, (3) `binding.secret_ref` resolves to a non-empty env-var VALUE. CI + unit + integration tests leave `GOOGLE_USE_REAL` unset, so every invocation deterministically runs in fixture mode.

**Closed-vocab failure codes** (same 8-code mapping as C2): VALIDATION (unknown operation / write-style op) · AUTH (HTTP 401 / fixture force) · RATE_LIMIT (HTTP 429 / fixture force) · PROVIDER_ERROR (other non-2xx) · NETWORK (Node fetch error; message capped 120 chars) · TIMEOUT (fixture force) · NOT_CONFIGURED (missing secret_ref / unset env var) · DISABLED (fixture force).

**Privacy invariant** (mirrors C2 + OutboundWebhookProvider pattern):

- `delivery_metadata` may carry counts (events_count / recurring_events_count / files_count / folders_count / messages_count / result_size_estimate) + mode label + binding_id; NEVER raw event content, attendee email PII, file names, message bodies, subject lines, or the access token
- On error, `message` is a short scrubbed summary; never includes the resolved access token, raw response body, or third-party stack traces
- Network errors collapse to NETWORK; HTTP 401 → AUTH; HTTP 429 → RATE_LIMIT; other non-2xx → PROVIDER_ERROR with status code surfaced (status codes are not secret material)
- Real-mode `fields` URL parameters filter Google response bodies BEFORE the provider parses them — defense-in-depth so an accidental `JSON.stringify(body)` cannot exfiltrate names/content from Drive or Gmail

**Test/build state:** unit suite 1200 → 1225 (+25 NEW C3 tests) · typecheck baseline preserved at 4 canonical errors · existing connector-provider frozen-anchor contract MOD from 3 types to 4 types (`["FIXTURE_ECHO", "GOOGLE_WORKSPACE_READ", "OUTBOUND_WEBHOOK", "SLACK_READ"]`).

**Out of scope at C3** (forward-substrate per ADR-0084 9-slice ladder):

- Writes (events.insert / files.create / messages.send / etc.) — ≥C6
- OAuth refresh-token rotation — later C-slice (static admin-supplied access token via secret_ref at C3; composes against ADR-0019 cryptographic posture + GOVSEC.5 break-glass)
- Drive content download (`files.get?alt=media`) — ≥C5
- Gmail body read (`messages.get?format=full|metadata`) — ≥C5
- Pub/Sub push notifications (Gmail watch / Calendar channels / Drive changes feed) — ≥C7 (composes against existing `verifyInboundHmac` substrate)
- Admin Directory writes / domain-wide-delegation auto-onboarding — separate later C-slice with explicit super-admin gate
- Control Tower binding-creation UI consumer — separate CT slice; current `/api/v1/org/connectors[/:id]` admin routes (Section 4 Wave 2 LIVE) already accept `type: "GOOGLE_WORKSPACE_READ"` since the column is plain `String` (no schema migration needed)

**Section 4 graduation:** Google Workspace `RECOMMENDATION_READY` → **`RUNTIME_READY`** (backend provider + tests + registry extension landed). Final graduation to `OPERATING` happens when the first real customer-bound activation lands a working binding row + uses the `GOOGLE_USE_REAL=1` production path against a live workspace.

**CT companion path LANDED 2026-06-01** via CT PR #22 `[CT-SECTION-4-GOOGLE-WORKSPACE-ADMIN-PATH]` (commit `423c05f`). Admins can now self-serve GOOGLE_WORKSPACE_READ binding registration through the existing /connectors page. CT changes: `CtConnectorType` union 3 → 4; `CT_CONNECTOR_REGISTRY.GOOGLE_WORKSPACE_READ` entry added (workspace_domain config + ya29.* env-var-NAME warning); type-aware placeholders + read-first badge (C2 vs C3) + page header refresh; 5 NEW tests (admin path + binding render + privacy invariant). Privacy invariant: concrete-token regex blocked in CT tests across 4 patterns — `/ya29\.[A-Za-z0-9_-]{8,}/` (Google OAuth access tokens) + `/-----BEGIN PRIVATE KEY-----/` + `/"private_key":/` (Google service-account JSON) + `/bearer /i` (Authorization header). CT test suite 279 → 284. Google Workspace is now **admin-visible at CT tier + RUNTIME_READY at backend tier** — but `OPERATING` still requires a real customer-bound activation against a live workspace via `GOOGLE_USE_REAL=1`. The CT path does not change the graduation tier; it makes the runtime-ready surface reachable to operators today.

**GOVSEC.6 + GOVSEC.7 graduation:** the `assertSameOrgConnectorTarget` + `assertAiAgentMayInvokeConnector` helpers from `apps/api/src/services/govsec/agent-abuse-guard.ts` (PR #183) + `assertSameTenantConnectorBinding` from `apps/api/src/services/govsec/tenant-isolation-guard.ts` (PR #190) are now structurally exercised by this slice's INVOKE_CONNECTOR path against the GOOGLE_WORKSPACE_READ type as well: cross-tenant denial enforced via `getConnectorBindingForOrg` org-scoped lookup; AI_AGENT write-intent denial forward-substrate to the C6 write slice. GOVSEC.6 + GOVSEC.7 remain **`OPERATING (read-first)`** — the C3 slice does not change the graduation tier, but it doubles the structural coverage of the helpers across vendor adapters (Slack + Google).
