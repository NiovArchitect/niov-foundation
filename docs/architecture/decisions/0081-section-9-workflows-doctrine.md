# ADR-0081 — Section 9 Workflows Doctrine (Design-Only)

**Status:** Accepted 2026-06-01
**Nature:** Design-only. No code. No schema. No migration. No routes. No services. No runtime activation. No Control Tower workflow runtime. No connector activation. No LLM / Python / BEAM. No new audit literal. No mutation to existing `dandelion.service.ts`.
**Founder authorization:** `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` (workflow doctrine = step 2 of Founder's autonomous-build implementation order under the Domain General Otzar expansion).
**Parent doctrine:** ADR-0080 (OOTB ontology) · ADR-0048 (governed personalization-orchestration) · ADR-0052 (Otzar DGI) · ADR-0057 (autonomous execution core) · ADR-0058 (drift detection — no manager surveillance) · ADR-0026 (dual-control) · ADR-0027 (governance + RULE 20) · ADR-0070 (regulator-ready Foundation).

---

## 1. Context

Section 9 (Admin / Governance Control Tower) has Approvals + Policies LIVE (PR #163 + #16 + #17). The Workflows page remains Placeholder. Section 10 production-readiness audit (PR #164) flagged Workflows as DECISION-BLOCKED: the bare `Workflow` Prisma model stub exists at `packages/database/prisma/schema.prisma:1792-1806` but has no service, no routes, no ADR defining what a "workflow" means as substrate.

Under `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]`, the Founder fixed the ambiguity:

> *"A workflow in Otzar is a governed, role-aware process that turns context into coordinated action through people, Digital Twins, tools, approvals, audit, and memory — without bypassing human authority."*

This ADR locks the workflow doctrine + the 5-stage maturity model + the Admin workflow first-class status + the DMW / Memory Wallet relationship + the connector-implementation gating. Subsequent implementation slices land in their own bounded waves.

Workflows are the next launch-critical product surface after Wave 2.1 role-depth expansion because:

1. The 21 role-depth files (Wave 2.1) catalog 100+ workflows across roles + the Admin Twin's 16 synthesis workflows.
2. The Wave 6 connector-priority matrix gives Slack first; once Section 4 first-connector implements (Founder-gated), workflows become the substrate that *uses* connectors safely.
3. The Admin Twin (the first DGI experience per ADR-0080 Amendment 5) requires workflow doctrine to synthesize "what workflows are ready / what approvals are missing / what should activate when."

---

## 2. Decision

Foundation adopts the following workflow doctrine.

### 2.1 Workflow definition (canonical)

> *"A workflow in Otzar is a governed, role-aware process that turns context into coordinated action through people, Digital Twins, tools, approvals, audit, and memory — without bypassing human authority."*

Workflows are **not**:
- Generic automations.
- Autonomous agents.
- RPA scripts.
- Permission grants.
- Bypass paths around governance.

Workflows **are**:
- Role-aware (composed against ADR-0080 RoleTemplate + WorkflowTemplate).
- Context-driven (consume ADR-0048 governed personalization context).
- People-in-the-loop (humans approve material decisions).
- Connector-coordinated (read-first; write-gated per ADR-0080 ConnectorPreset).
- Audited (every step emits `ADMIN_ACTION` + `details.action` per ADR-0071).
- Memory-scoped (DMW per RoleTemplate scope notes; never blanket access).

### 2.2 Five workflow maturity stages

| Stage | Name | Description | Authorization |
|-------|------|-------------|----------------|
| 1 | **Template-only** | Workflow exists in the catalog (Wave 2 `workflows.json` + Wave 2.1 role-depth Markdown). Used for education, preview, Dandelion recommendation, and Admin Twin synthesis. **Cannot execute.** | Standing (Wave 2 / Wave 2.1) |
| 2 | **Recommendation-only** | Otzar suggests the workflow to the user / admin. Dandelion + Admin Twin surface "this workflow would be useful here." User / admin reviews. **Cannot execute.** | Wave 4 Dandelion recommendation engine; suggest-only |
| 3 | **Proposed Action** | The workflow can create proposed `Action` rows per ADR-0057. Actions route through `ActionPolicy` + `EscalationRequest` per ADR-0026 dual-control where required. **Cannot invoke connectors.** | Separate Founder authorization per slice; ADR-0057 + ADR-0026 compose with this stage |
| 4 | **Governed Execution** | Approved workflow Actions may execute through read-first / write-gated connectors per ADR-0080 ConnectorPreset envelope. All actions audited via `ACTION_*` + `INVOKE_CONNECTOR` audit lineage. **No direct DB writes; no auto-approval.** | Founder authorization + RULE 21 research arc per connector + per workflow risk_level |
| 5 | **Continuous Optimization** | Workflows improve from corrections + outcomes + governed signals per ADR-0048. **No private profiling. No employee scoring. No surveillance.** | Founder authorization + ADR-0048 personalization runtime substrate |

**Default path:** Stage 1 → Stage 2 → Stage 3. Stage 4 requires connector governance ready. Stage 5 requires telemetry + governance explicit per ADR-0048.

### 2.3 Admin workflows are first-class

Per ADR-0080 Amendment 5 + Founder addendums 2 + 3, the **Otzar Administrator** is a first-class role and the Admin Twin is the **first Domain General Intelligence experience**.

Admin workflows therefore:

- Land in Stage 1 (Template-only) at this ADR via the Wave 2.1 role-depth Markdown layer (16 Admin Twin synthesis workflows catalogued at `docs/ootb-catalog/role-depth/otzar-administrator.md` §16).
- Are eligible for Stage 2 (Recommendation-only) in Wave 4 Dandelion Activation, **before** broad employee rollout. Canonical: *"Dandelion should onboard the Otzar Admin before it onboards the company."*
- May reach Stage 3 (Proposed Action) for low-risk Admin actions (drafting champion-enablement copy, drafting policy gap reports, drafting audit health briefs) before any user-facing workflow reaches the same stage.
- Maintain the governance boundary at every stage: Admin Twin never browses private user memory raw; never bypasses approvals; never produces employee scoring / surveillance / psychological profiling.

### 2.4 DMW / Memory Wallet relationship

Every workflow consumes memory through the DMW. Workflow doctrine on memory:

- **Self-scoped first** — the workflow operates on the caller's own work context unless explicitly broadened.
- **Per-RoleTemplate scope** — each workflow inherits its DMW scope from the RoleTemplate that owns it (per Wave 2.1 role-depth files §25).
- **Forbidden categories absolute** — no workflow may consume private personal / family / protected-attribute / psychological-inference content (per ADR-0058 + ADR-0079 forbidden categories).
- **Project / team / client / legal / compliance / board scopes** — explicitly scoped at workflow definition time; the Admin reviews scope safety per the Admin Twin "Memory Scope Safety Brief."
- **Forgetting + disconnect** — workflows must preserve safe metadata only after disconnect; raw content suppressed.
- **Cross-tenant absolute forbidden** — same-org boundary preserved at every workflow tier.

Canonical line: *"Workflows coordinate action; they do not bypass humans."*

### 2.5 Workflow object shape (forward-substrate; not implemented at this ADR)

When Stage 3+ implementation lands, a `WorkflowDefinition` runtime object will include:

| Field | Purpose |
|-------|---------|
| `workflow_definition_id` | stable identifier |
| `template_id` | references Wave 2 `workflows.json[<workflow.*.v1>]` |
| `org_entity_id` | tenant boundary |
| `triggering_role_ids` | RoleTemplate references |
| `participating_role_ids` | RoleTemplate references |
| `required_tool_profile_ids` | ToolProfile references |
| `required_connector_preset_ids` | ConnectorPreset references |
| `action_types_proposed` | which ActionType rows may be proposed |
| `approval_chain_id` | references the company's configured approval chain |
| `dmw_scope_envelope` | governed envelope per ADR-0080 Amendment 1 |
| `risk_level` | LOW / MEDIUM / HIGH / CRITICAL (per ADR-0080 §5.5) |
| `automation_level` | NONE / SUGGEST_ONLY / HUMAN_CONFIRMED / GOVERNED_AUTO (per ADR-0080 §5.5) |
| `audit_event_pattern` | `ADMIN_ACTION` + canonical `details.action` literals |
| `policy_gates` | which Policy rules apply per ADR-0008 / Section 9 Policies |
| `safe_fallback` | what the workflow does without connectors (per ADR-0080 §5.11) |
| `forbidden_consumers` | catalog of forbidden envelope consumers |

`WorkflowDefinition` runtime is NOT implemented at this ADR. The bare `Workflow` Prisma stub at `schema.prisma:1792-1806` will be superseded by the runtime model in a future implementation wave under separate Founder authorization.

### 2.6 Workflow → Action runtime coupling

Per ADR-0057, all material execution flows through the `Action` runtime. Workflows compose:

- A Stage 3 workflow produces one or more `Action` rows of declared `ActionType` (RECORD_CAPSULE / PROPOSE_PERMISSION_GRANT / SEND_INTERNAL_NOTIFICATION / INVOKE_CONNECTOR / etc.).
- Each `Action` consumes existing `ActionPolicy` + `EscalationRequest` + dual-control per ADR-0026.
- Each action emits the canonical `ACTION_*` audit lineage (10/10 emitters live).
- A Stage 4 workflow's connector invocation rides `INVOKE_CONNECTOR` per Section 4 substrate.
- The workflow definition does NOT add new audit literals — it reuses existing patterns + `details.action` discriminators (e.g., `WORKFLOW_PROPOSED` / `WORKFLOW_APPROVED` / `WORKFLOW_EXECUTED` are forward-substrate `details.action` strings, not new event_type literals).

### 2.7 Workflow → Approval coupling

Per ADR-0026 dual-control + Section 9 Approvals LIVE:

- Stage 3 workflows declare an `approval_chain_id` at definition time.
- The Admin Twin's "Approval Chain Gap Finder" surfaces missing chains at Stage 2.
- Stage 4 execution is blocked if `approval_chain_id` is null OR the approval chain is incomplete.
- Dual-control workflow actions reuse the `requireDualControl` middleware + `PRIVILEGED_ENDPOINTS` runtime registry per ADR-0026.

### 2.8 Workflow → Dandelion coupling

Per ADR-0080 Amendment 5 §21.5 (Dandelion as org seeding intelligence):

- Dandelion's **Layer 5 (Workflow seed)** produces proposed WorkflowTemplate maps.
- Dandelion surfaces workflow readiness + approval chain gaps + tool readiness + risk_level per Wave 2 metadata.
- Dandelion's output is a proposed map; Foundation authorizes activation.
- The Admin Twin's "First 7-Day Launch Plan" composes against Dandelion's Layer 5 output + the Wave 6 connector-priority matrix to recommend which workflows to surface at Stage 2 first.

---

## 3. Non-goals

This ADR does **not**:

- Implement any workflow runtime (no schema, no service, no routes).
- Replace the existing bare `Workflow` Prisma stub.
- Add Foundation API routes for workflow CRUD.
- Build the Control Tower `/workflows` consumer surface.
- Activate any connector through a workflow.
- Grant any permissions via a workflow.
- Create any Action rows via a workflow.
- Add new audit literals (existing `ADMIN_ACTION` + `details.action` + `ACTION_*` lineage preserved).
- Modify Section 4 connector substrate.
- Modify ADR-0026 dual-control middleware.
- Modify ADR-0057 Action runtime.
- Mutate `dandelion.service.ts`.
- Add LLM / Python / BEAM coordination.

---

## 4. Implementation ladder

| Wave | Scope | Gating |
|------|-------|--------|
| W1 (this ADR) | Doctrine + 5 maturity stages + Admin first-class + DMW relationship + non-goals | This Founder authorization |
| W2 | Stage 1 substrate refresh — Wave 2 `workflows.json` extended with `risk_level` / `automation_level` / `approval_chain_template_id` fields if needed; Wave 2.1 Admin workflows catalogued (LIVE) | Wave 2 / Wave 2.1 standing authorization |
| W3 | Stage 2 substrate — Dandelion recommendation engine surfaces workflow recommendations (suggest-only); Admin Twin "Approval Chain Gap Finder" + "First 7-Day Launch Plan" | Separate Founder authorization at Dandelion Activation ADR slice |
| W4 | Stage 3 substrate — `WorkflowDefinition` Prisma model + service + routes; first low-risk Admin workflow (e.g., draft champion-enablement copy) proposed-action LIVE | Separate Founder authorization + RULE 21 research arc per Admin workflow |
| W5 | Stage 4 substrate — first connector-coupled workflow execution (e.g., Slack read-first + draft message + approve) | Founder authorization + Section 4 first-connector implementation LIVE + connector governance ready |
| W6 | Stage 5 substrate — continuous-optimization signals per ADR-0048; no surveillance / no scoring / no private profiling | Founder authorization + ADR-0048 personalization runtime substrate |

Each wave is a separately-authorized bounded slice. **Do not implement W3+ automatically.**

---

## 5. Governance posture (universal)

- **No autonomous execution.** Every Stage 4 workflow action passes through human approval per `ActionPolicy` / dual-control.
- **No surveillance framing.** Admin workflows produce governance briefs, never employee surveillance.
- **No employee scoring.** Workflow outcomes inform aggregate operational signals; individual performance is the People role's domain at cycle cadence, not workflow domain.
- **No private personal life ingest.** Forbidden categories absolute per ADR-0058 + ADR-0079.
- **No cross-tenant signal leakage.** Same-org boundary preserved.
- **No legal / compliance certainty claims.** Per ADR-0070 neutral compliance vocabulary.
- **Read-first connectors absolute** until per-write approval chains are configured.
- **Dual-control where high-risk** per ADR-0026.
- **Break-glass time-boxed only** per ADR-0050 (never standing).
- **Audit every step** per RULE 4 + ADR-0071 cross-scope verify-chain.
- **Memory governed by DMW** per ADR-0080 envelope discipline.

---

## 6. CT `/workflows` page disposition

The CT `/workflows` Placeholder remains Placeholder at this ADR. Activation cadence:

- **Stage 2 ready (W3)**: CT `/workflows` becomes a read-only WorkflowTemplate browser (analogous to the Wave 3 `/onboarding` Dandelion Preview pattern). Suggest-only. No execution surface.
- **Stage 3 ready (W4)**: CT `/workflows` adds "Proposed Workflows" panel showing draft `Action` rows pending approval per `Section 9 Approvals` surface.
- **Stage 4 ready (W5)**: CT `/workflows` adds "Active Workflow Runs" view (audit-derived; no live mutation surface).

The CT page is never an execution console — it is a governance + visibility surface.

---

## 7. Citations

- **RULE 0** (humans always sovereign)
- **RULE 1** (build forward only — this ADR adds doctrine; does not modify existing substrate)
- **RULE 4** (audit before response — every workflow step audited)
- **RULE 10** (nothing is ever deleted — workflow execution history append-only)
- **RULE 13** (surface drifts inline — substrate-honest about Stage gating)
- **RULE 20** (rule-modification authority — this is an ADR per RULE 20)
- **RULE 21** (pre-authorization research arc — each Stage 4 connector coupling requires RULE 21)
- **ADR-0001** (three-wallet architecture — workflows respect wallet boundaries)
- **ADR-0002** (append-only audit chain — workflow audit history append-only)
- **ADR-0008** (EntityComplianceProfile is org-level — workflows policy-gated at org tier)
- **ADR-0024** (pre-commit hook posture — `secret_ref` preserved at any workflow connector binding)
- **ADR-0026** (dual-control middleware — high-risk workflow actions reuse `requireDualControl`)
- **ADR-0027** (governance + RULE 20 — this ADR is governance-tier substrate)
- **ADR-0036** (REGULATOR principal + LawfulBasis — regulator-facing workflows gated by ADR-0036)
- **ADR-0048** (governed personalization-orchestration — Stage 5 continuous-optimization composes against this)
- **ADR-0050** (break-glass time-boxed audit — never standing workflow authority)
- **ADR-0052** (Otzar DGI — workflows are the substrate Otzar's Domain General Intelligence coordinates)
- **ADR-0057** (autonomous execution core — Stage 3+ workflows produce Action rows here)
- **ADR-0058** (drift detection — no manager surveillance preserved at workflow tier)
- **ADR-0070** (regulator-ready Foundation doctrine — neutral compliance vocabulary)
- **ADR-0071** (cross-scope verify-chain — workflow audit visible at every scope)
- **ADR-0078** + **ADR-0079** (conversation context substrate / transcript policy — workflows consuming meeting context defer here)
- **ADR-0080** + Amendment 5 (OOTB ontology — RoleTemplate / WorkflowTemplate / ConnectorPreset / DandelionFlowTemplate / Otzar Administrator)
- Patent **US 12,517,919** (COSMP) · **US 12,164,537** + **US 12,399,904** (DMW + Foundation primitives) — workflows compose against the governed Memory Capsule structure without modification.

---

## 8. Founder authorization

This ADR is authorized under `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 2 of the Founder's autonomous-build implementation order: *"Workflow doctrine / Section 9 Workflows ADR."*

Subsequent waves (W3 onward) require their own Founder authorization at slice.

After this ADR lands, the recommended next autonomous slice is **ADR-0082 Dandelion Activation Architecture** (Stages B–F design-only; canonical 6-layer org seeding model formalized; no runtime activation).
