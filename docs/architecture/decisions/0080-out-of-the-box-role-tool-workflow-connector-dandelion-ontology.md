# ADR-0080 — Out-of-the-Box Role, Tool, Workflow, Connector, and Dandelion Onboarding Ontology for Digital Twins

**Status:** Accepted 2026-06-01 · **Amendment 1** Accepted 2026-06-01 (governed context envelope addendum — Wave 2 lands the catalog with envelope metadata; see §17) · **Amendment 2** Accepted 2026-06-01 (Wave 3 CT/Dandelion read-only preview LIVE + deep-role-examples addendum — see §18) · **Amendment 3** Accepted 2026-06-01 (Wave 6 connector-priority matrix output LIVE; suggest-only — see §19) · **Amendment 4** Accepted 2026-06-01 (CT Wave 6 surface LIVE — see §20) · **Amendment 5** Accepted 2026-06-01 (Wave 2.1 role-depth Markdown layer LIVE + Domain General Otzar expansion + Otzar Administrator as first-class role + Admin Twin as first DGI champion + Dandelion-as-org-seeding-intelligence framing — see §21)
**Nature:** Design-only at Wave 1; Wave 2 static seed catalog accompanies (no code, no schema, no routes, no runtime behavior). No Control Tower UI. No connector implementation. No LLM/Python/BEAM. No new audit literal. No mutation of existing `dandelion.service.ts`.
**Founder authorization:** `[FOUNDER-ADR-0080-OOTB-DANDELION-ONTOLOGY-DESIGN-ONLY-AUTH]` (Wave 1) · `[FOUNDER-ADR-0080-WAVE-2-STATIC-SEED-CATALOG-AUTH]` (Wave 2) · `[FOUNDER-ADR-0080-WAVE-2-ADDENDUM-GOVERNED-CONTEXT-TRANSACTION-ENVELOPE]` (Wave 2 envelope amendment) · `[FOUNDER-ADR-0080-WAVE-3-CT-DANDELION-READ-ONLY-PREVIEW-AUTH]` (Wave 3) · `[FOUNDER-ADR-0080-WAVE-3-ADDENDUM-DEEP-ROLE-EXAMPLES-AND-COLLABORATION-MAPS]` (Wave 3 depth/collaboration addendum) · `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]` (autonomous continuation)
**Parent doctrine:** ADR-0048 (governed personalization-orchestration), ADR-0052 (Otzar DGI), ADR-0027 (governance), ADR-0070 (regulator-ready Foundation), ADR-0069 (BEAM substrate-coherence law).

---

## 1. Context

Section 10 production-readiness audit (PR #164) found Otzar substrate-strong but **role-naive out of the box**. The audit catalogs the gap concretely (`docs/current-build-state/10-deployment-security-go-live-operations.md` §"Out-of-the-box role/tool/workflow template readiness"): no `RoleTemplate` / `ToolProfile` / `WorkflowTemplate` / `ConnectorPreset` / `DelegatedAuthorityProfile` / `PermissionBundle` / `OnboardingQuestionSet` / `AhaMomentPack` / `SafeFallbackMode` / `OrgChartRelationshipTemplate` / `IndustryVariant` / `CompanySizeVariant` substrate exists today. The only role substrate is a free-text `role_template: String?` field on `TwinConfig` (`packages/database/prisma/schema.prisma:881`) plus the `AgentTemplate` table (`schema.prisma:1251`) fed by a 13-markdown-file seed at `apps/api/templates/roles/*.md` — agent system-prompt content, not the rich operating ontology the customer experience requires.

The existing Foundation `dandelion.service.ts` (`apps/api/src/services/governance/dandelion.service.ts`) is real but narrow: it implements Phase 0 atomic org creation + Phase 2 invite analyze + Phase 3 invite-accept propagation + Phase 4 status read. It is **org-admin invite/seating substrate**. It is **not** the company / department / user role-discovery / Twin-starter-profile / connector-priority / aha-moment activation layer the Founder vision names "Dandelion."

This ADR defines the **ontology** Otzar's day-one operating model will compose against, BEFORE any schema migration, seed file, route, Control Tower page, or connector adapter is built. It also distinguishes today's partial-Dandelion substrate from the broader Founder-Dandelion target, and it locks the governance posture under which Dandelion may suggest but never authorize.

### Canonical product doctrine (preserved verbatim)

- "Otzar should not require the customer to teach it what common enterprise roles do."
- "Every Digital Twin should begin with a role-shaped operating model, then adapt through governed company context."
- "Role templates are starter priors, not surveillance profiles."
- "Tool familiarity is adoption leverage."
- "Connector strategy should follow role-tool frequency, Dandelion-collected demand, and governance safety — not founder intuition alone."
- "Dandelion recommends the starter shape of the Digital Twin; Foundation governance authorizes what the Twin may actually do."
- "Dandelion suggests. Foundation governance authorizes."
- "Otzar must feel useful before every connector is connected."

---

## 2. Decision

Foundation adopts an **out-of-the-box ontology** for Digital Twin activation, composed of sixteen design objects:

1. **RoleTemplate** — role-shaped operating model (responsibilities, common decisions, tools, workflows, default permissions, forbidden inferences, onboarding questions, aha moments, safe fallback, adaptation rules).
2. **DepartmentTemplate** — department-shaped operating model (role mix, shared tools, shared workflows, approval patterns, reporting lines, cadence, compliance risks).
3. **CompanyTemplate** — company-shaped operating model (industry, size, default departments, default tool stack, default approval model, default delegation model, default connector priority, default rollout plan).
4. **ToolProfile** — per-tool operating profile (category, common roles, common actions, common surfaces, connector priority, auth model, data sensitivity, safe-default permissions, risky permissions, webhook events, API maturity).
5. **WorkflowTemplate** — common workflow pattern (triggering roles, participating roles, required tools, approvals, audit events, risk level, automation level, human-review requirement, default SLA, escalation path, connector actions, safe fallback).
6. **ConnectorPreset** — preconfigured connector recipe (read/write capabilities, approval-required-for-write, default-disabled actions, secret requirements, OAuth scopes, audit requirements, no-leak rules, test-mode behavior, production-enablement checklist).
7. **DelegatedAuthorityProfile** — role-level delegation surface (proxy actions, read/write permissions, default-read-only tools, default-write-disabled tools, approval-required actions, dual-control actions, spend limit defaults, scheduling / communication / document / financial / HR / legal / customer-data / board-material authority, emergency override allowed/forbidden, audit-required actions).
8. **PermissionBundle** — starter permission set keyed by role (read / draft / write / approval-required / dual-control / forbidden permissions; default state; activation requirements; audit requirements).
9. **OnboardingQuestionSet** — minimum questions to bootstrap a role's operating model (required / optional / sensitive / admin / user / company / department questions; answer-to-template / answer-to-permission / answer-to-connector / answer-to-workflow mappings).
10. **AhaMomentPack** — 3–5 default automations per role with name, trigger, tools needed, data needed, output, approval requirement, safe fallback, demo value, launch value.
11. **SafeFallbackMode** — what the Twin can do without connectors / read-only-with-connector / write-enabled / approval-required / forbidden; fallback prompts and outputs.
12. **OrgChartRelationshipTemplate** — relationship-type semantics (manager / direct_report / dotted_line / executive_support / board_member / investor_observer / temporary_delegate / vacation_delegate / department_peer / cross_functional_partner) with default access / delegation / approval / audit / temporary-delegation rules.
13. **IndustryVariant** — industry-specific overrides on role / tool / workflow / compliance / data-sensitivity / default-permission / connector-priority defaults.
14. **CompanySizeVariant** — size-band overrides on role mix / tool stack / approval model / governance / onboarding depth / rollout pattern.
15. **DandelionFlowTemplate** — three-tier flow specification (company-level + department-level + user-level question sets, decision tree, output mappings, connector-recommendation logic, aha-moment-selection logic, permission-recommendation logic, safe-fallback logic, governance review points).
16. **DigitalTwinStarterProfile** — activation output bundling inferred-or-selected RoleTemplate(s), DepartmentTemplate, CompanyTemplate, enabled ToolProfiles, enabled WorkflowTemplates, available + connected ConnectorPresets, default permissions, disabled-until-approved capabilities, DelegatedAuthorityProfile, PermissionBundles, remaining onboarding questions, AhaMomentPack, SafeFallbackMode, adaptation history, override history.

These are **design objects** for now, not runtime models. The ontology lives in this ADR. Implementation lands later, under separate Founder authorization, per the implementation ladder in §13.

---

## 3. Non-goals

This ADR **does not**:

- write code (no service, no helper, no script);
- introduce or modify Prisma schema (no new models, no new fields, no migration);
- add seed data or extend the 13 existing `apps/api/templates/roles/*.md` AgentTemplate seeds;
- introduce runtime behavior (no new audit literal, no audit emission change, no mutation to `dandelion.service.ts`, no mutation to `otzar.service.ts`'s `role_template` lookup at `:556`);
- add Control Tower pages, routes, components, or types (no `/role-templates`, `/tool-profiles`, `/workflow-templates`, `/connector-presets`, `/dandelion`, `/onboarding` consumer);
- add or modify connector code (no Slack, no Gmail, no Concur, no OAuth substrate);
- add billing/entitlement code or schema (Section 8 remains stub-only);
- add a workflow runtime or `WorkflowService` (the bare `Workflow` model at `schema.prisma:1792` is untouched);
- add LLM calls / Python compute / BEAM coordination / new gRPC contracts;
- implement a Dandelion route/page/service;
- choose the first real Section 4 connector;
- begin Section 8 Billing or draft Section 9 Workflows ADR;
- claim employee scoring / manager surveillance / sensitive-or-protected-attribute inference / automatic permission grants / unapproved write actions / finalized connector priority.

This ADR is **architecture and product ontology only**.

---

## 4. Existing Dandelion distinction

Today's existing `dandelion.service.ts` is **partial Dandelion**:

- org-admin invite / organization propagation flow;
- useful for seating users;
- not yet role / tool / workflow discovery;
- not yet Twin starter-profile generation;
- not yet connector-priority calculation;
- not yet aha-moment activation.

Founder's Dandelion **target** is:

- guided onboarding;
- role discovery;
- tool discovery;
- workflow discovery;
- permission discovery;
- connector recommendation;
- Digital Twin starter-profile generation;
- safe delegated-authority setup;
- company-specific customization;
- first-value / aha-moment activation flow.

The two are **not the same surface**. The existing `dandelion.service.ts` continues to own the org-admin invite/seating flow; Founder-Dandelion will be additive substrate composed against the ontology in §5. Existing `dandelion.service.ts` is **not** renamed, retired, replaced, or mutated by this ADR.

---

## 5. Core object model

Each object is **a design schema** — a field catalog future implementation will compose against. Field types are intentionally informal here (no Prisma types, no API contracts).

### 5.1 RoleTemplate

| Field | Purpose |
|-------|---------|
| `role_template_id` | stable identifier |
| `role_name` | canonical role name (e.g., "Executive Assistant") |
| `role_family` | role-family bucket (Executive Support / Finance / Sales / Engineering / etc.) |
| `department` | DepartmentTemplate this role most often sits in |
| `seniority_level` | IC / Manager / Senior Manager / Director / VP / C-Suite / Board |
| `common_titles` | alternative titles that map to this template |
| `primary_responsibilities` | what the role does day to day |
| `common_decisions` | decisions the role typically owns |
| `common_meetings` | recurring meeting types |
| `common_documents` | documents the role typically reads / drafts / owns |
| `common_metrics` | KPIs / metrics the role tracks |
| `common_collaborators` | other RoleTemplates this role works with |
| `common_risks` | risk surface the role touches |
| `likely_reports_to` | likely upward reporting line (RoleTemplate references) |
| `possible_reports_to` | alternative upward reporting lines |
| `likely_direct_reports` | likely downward reporting line |
| `possible_direct_reports` | alternative downward reporting lines |
| `likely_cross_functional_partners` | dotted-line partners |
| `common_confidential_relationships` | relationships requiring confidentiality |
| `common_delegate_relationships` | relationships where this role delegates / is delegated to |
| `common_proxy_authority` | proxy-authority patterns (act-on-behalf-of) |
| `default_permissions` | PermissionBundle reference (default state at activation) |
| `approval_authority_profile` | DelegatedAuthorityProfile reference |
| `sensitive_data_categories` | data categories the role legitimately touches |
| `default_memory_scopes` | which Memory Capsule scopes the Twin reads by default |
| `default_agent_capabilities` | agent capability flags enabled by default |
| `default_workflow_templates` | WorkflowTemplate references enabled by default |
| `default_tool_profiles` | ToolProfile references enabled by default |
| `default_connector_presets` | ConnectorPreset references available (not auto-connected) |
| `forbidden_inferences` | inferences the role MUST NOT make (sensitive / protected / out-of-scope) |
| `onboarding_questions` | OnboardingQuestionSet reference |
| `aha_moment_pack` | AhaMomentPack reference |
| `safe_fallback_mode` | SafeFallbackMode reference |
| `adaptation_rules` | rules governing how this template adapts to per-org context (governed) |

### 5.2 DepartmentTemplate

| Field | Purpose |
|-------|---------|
| `department_template_id` | stable identifier |
| `department_name` | canonical name (e.g., "Finance") |
| `common_roles` | RoleTemplate references in this department |
| `shared_tools` | ToolProfile references the department uses collectively |
| `shared_workflows` | WorkflowTemplate references the department runs |
| `approval_patterns` | common approval / sign-off chains |
| `reporting_lines` | typical hierarchy shape |
| `operating_cadence` | daily / weekly / monthly / quarterly rhythm |
| `compliance_risks` | regulatory + policy risk surface for the department |
| `cross_functional_dependencies` | other DepartmentTemplate references the department depends on |
| `default_hive_patterns` | Hive (Section 3) patterns this department defaults to |
| `default_metrics` | department-level KPIs |
| `default_documents` | canonical document types |
| `default_meetings` | canonical meeting cadence |

### 5.3 CompanyTemplate

| Field | Purpose |
|-------|---------|
| `company_template_id` | stable identifier |
| `industry` | IndustryVariant reference |
| `company_size_variant` | CompanySizeVariant reference |
| `compliance_profile` | regulatory baseline (HIPAA / SOX / FedRAMP / GDPR / none-yet / etc.) |
| `default_departments` | DepartmentTemplate references this company shape includes |
| `default_role_mix` | typical RoleTemplate distribution |
| `default_tool_stack` | typical ToolProfile selection |
| `default_approval_model` | high-level approval / signoff model |
| `default_delegation_model` | high-level delegation model |
| `default_connector_priority` | initial ConnectorPreset ordering |
| `default_rollout_plan` | suggested phasing for adoption |
| `sensitive_systems` | systems gated read-only-first at launch |
| `launch_aha_moments` | AhaMomentPack references reasonable for first-value demos |

### 5.4 ToolProfile

| Field | Purpose |
|-------|---------|
| `tool_profile_id` | stable identifier |
| `tool_name` | canonical tool name |
| `category` | identity / communication / calendar / documents / project / CRM / HR / finance / support / dev / design / legal / security / BI |
| `common_roles_using_it` | RoleTemplate references that typically use this tool |
| `common_actions` | typical action verbs (read / draft / send / schedule / approve / archive / etc.) |
| `common_read_surfaces` | typical read surfaces (objects, fields, scopes) |
| `common_write_surfaces` | typical write surfaces |
| `common_objects` | canonical object types (Slack message, Drive doc, Salesforce opportunity, etc.) |
| `connector_priority` | ordinal hint (0-100) for connector prioritization |
| `auth_model` | API key / Bot token / OAuth2 / OAuth2 + admin consent / SAML / SCIM / etc. |
| `data_sensitivity` | low / medium / high / critical |
| `safe_default_permissions` | the read/write set safe to enable by default |
| `risky_permissions` | the set that must be approval-gated |
| `webhook_events` | events worth subscribing to |
| `api_maturity` | stable / partial / beta / unstable |
| `integration_complexity` | small / medium / large / XL |
| `enterprise_adoption_signal` | low / medium / high / very high |
| `role_specific_usage_notes` | per-role usage caveats (e.g., EA needs delegated send) |

### 5.5 WorkflowTemplate

| Field | Purpose |
|-------|---------|
| `workflow_template_id` | stable identifier |
| `workflow_name` | canonical workflow name |
| `triggering_roles` | RoleTemplate references that typically trigger it |
| `participating_roles` | other RoleTemplate references involved |
| `required_tools` | ToolProfile references required |
| `typical_inputs` | input shape |
| `typical_outputs` | output shape |
| `approvals_required` | approval gates |
| `audit_events` | audit literal names (existing or proposed) expected |
| `risk_level` | low / medium / high / critical |
| `automation_level` | none / suggest-only / human-confirmed / governed-auto |
| `human_review_required` | yes / no / conditional |
| `default_sla` | expected SLA |
| `escalation_path` | escalation chain |
| `connector_actions` | ConnectorPreset actions invoked |
| `safe_fallback` | SafeFallbackMode reference for the workflow |

### 5.6 ConnectorPreset

| Field | Purpose |
|-------|---------|
| `connector_preset_id` | stable identifier |
| `connector_name` | canonical adapter name |
| `tool_category` | matches ToolProfile.category |
| `role_templates_enabled_by_default` | RoleTemplate references where this preset is appropriate by default |
| `read_capabilities` | read surfaces supported |
| `write_capabilities` | write surfaces supported |
| `approval_required_for_write` | which writes are approval-gated |
| `default_disabled_actions` | actions disabled until governance approves |
| `secret_requirements` | env-var-name pattern (per ADR-0024 `secret_ref`) |
| `oauth_scopes` | minimum OAuth scope set |
| `audit_requirements` | required audit emissions |
| `no_leak_rules` | forbidden fields / payload shapes per ADR-0078 §11 |
| `test_mode_behavior` | how the preset behaves in non-production |
| `production_enablement_checklist` | gates that must pass before flipping to production |

### 5.7 DelegatedAuthorityProfile

| Field | Purpose |
|-------|---------|
| `delegated_authority_profile_id` | stable identifier |
| `common_proxy_actions` | act-on-behalf-of actions typical for the role |
| `common_read_permissions` | read scopes the role typically inherits |
| `common_write_permissions` | write scopes the role typically inherits |
| `default_read_only_tools` | tools enabled read-only by default |
| `default_write_disabled_tools` | tools where write stays off by default |
| `approval_required_actions` | actions that require approval before firing |
| `dual_control_required_actions` | actions that require dual-control per ADR-0026 |
| `spend_limit_default` | default monetary cap on spend authority |
| `scheduling_authority` | calendar / meeting authority scope |
| `communication_authority` | email / chat / send authority scope |
| `document_access_authority` | document read / draft / share / sign scope |
| `financial_access_authority` | financial-system access scope |
| `hr_access_authority` | HRIS / ATS access scope |
| `legal_access_authority` | legal-system access scope |
| `customer_data_access_authority` | CRM / customer-data access scope |
| `board_material_access_authority` | board-portal / board-material access scope |
| `emergency_override_allowed` | actions where break-glass per ADR-0050 may apply |
| `emergency_override_forbidden` | actions where break-glass is forbidden |
| `audit_required_actions` | actions that must emit audit even on read |

### 5.8 PermissionBundle

| Field | Purpose |
|-------|---------|
| `permission_bundle_id` | stable identifier |
| `role_template_id` | RoleTemplate reference |
| `bundle_name` | bundle name |
| `read_permissions` | read permission set |
| `draft_permissions` | draft / propose-only permission set |
| `write_permissions` | write permission set |
| `approval_required_permissions` | permissions that require approval before exercise |
| `dual_control_permissions` | permissions requiring dual-control |
| `forbidden_permissions` | permissions never granted to this role by default |
| `default_state` | ENABLED / DISABLED_UNTIL_APPROVED / DRAFT_ONLY |
| `activation_requirements` | what must be true to activate |
| `audit_requirements` | audit-emission expectations |

### 5.9 OnboardingQuestionSet

| Field | Purpose |
|-------|---------|
| `question_set_id` | stable identifier |
| `applies_to_role_template` | RoleTemplate reference (or null for company/department-level) |
| `applies_to_department` | DepartmentTemplate reference |
| `applies_to_company_variant` | CompanyTemplate reference |
| `required_questions` | must be answered to activate |
| `optional_questions` | improve fit when answered |
| `sensitive_questions` | answered only by authorized roles |
| `admin_questions` | answered by org admin only |
| `user_questions` | answered by the end user |
| `company_questions` | answered at company-level Dandelion |
| `department_questions` | answered at department-level Dandelion |
| `answer_to_template_mapping` | how answers select RoleTemplate / DepartmentTemplate / CompanyTemplate |
| `answer_to_permission_mapping` | how answers map to PermissionBundle defaults |
| `answer_to_connector_mapping` | how answers shape ConnectorPreset recommendations |
| `answer_to_workflow_mapping` | how answers select WorkflowTemplate recommendations |

### 5.10 AhaMomentPack

| Field | Purpose |
|-------|---------|
| `aha_moment_pack_id` | stable identifier |
| `role_template_id` | RoleTemplate reference |
| `aha_moments` | list of AhaMoment objects (see below) |
| `demo_value` | how compelling the pack is in demos |
| `launch_value` | how compelling the pack is on launch day |
| `required_tools` | ToolProfile references the pack benefits from |
| `fallback_without_tools` | what value remains without any connector |
| `approval_requirements` | approvals expected for the pack |
| `risk_level` | low / medium / high |

Each **AhaMoment** has:
- `name`
- `role`
- `trigger`
- `tools_needed`
- `data_needed`
- `output`
- `approval_requirement`
- `safe_fallback`
- `demo_value`
- `launch_value`

### 5.11 SafeFallbackMode

| Field | Purpose |
|-------|---------|
| `safe_fallback_mode_id` | stable identifier |
| `role_template_id` | RoleTemplate reference |
| `no_connector_capabilities` | what the Twin can do with zero connectors |
| `read_only_capabilities` | what improves when read-only connectors land |
| `write_enabled_capabilities` | what improves when write is governance-approved |
| `approval_required_capabilities` | governance-gated capabilities |
| `forbidden_capabilities` | capabilities never enabled by default |
| `fallback_prompts` | prompt patterns the Twin uses when a tool is missing |
| `fallback_outputs` | output shapes for the fallback path |

### 5.12 OrgChartRelationshipTemplate

| Field | Purpose |
|-------|---------|
| `relationship_template_id` | stable identifier |
| `relationship_type` | manager / direct_report / dotted_line / executive_support / board_member / investor_observer / temporary_delegate / vacation_delegate / department_peer / cross_functional_partner |
| `examples` | concrete examples in canonical companies |
| `default_access_implications` | what data the relationship implies access to |
| `default_delegation_implications` | what delegation the relationship implies |
| `approval_implications` | what approvals the relationship grants / requires |
| `audit_implications` | what audit the relationship requires |
| `temporary_delegation_rules` | how vacation / OOO / temporary delegation works |

Required relationship types covered:
- manager
- direct_report
- dotted_line
- executive_support
- board_member
- investor_observer
- temporary_delegate
- vacation_delegate
- department_peer
- cross_functional_partner

### 5.13 IndustryVariant

| Field | Purpose |
|-------|---------|
| `industry_variant_id` | stable identifier |
| `industry` | tech / finance / healthcare / legal / education / government / manufacturing / media / SaaS / regulated-finance / regulated-health / etc. |
| `role_template_overrides` | per-role overrides |
| `tool_profile_overrides` | per-tool overrides |
| `workflow_overrides` | per-workflow overrides |
| `compliance_overrides` | compliance baseline (HIPAA / SOX / GLBA / FedRAMP / GDPR / regional) |
| `data_sensitivity_overrides` | tighter data-sensitivity defaults |
| `default_permission_overrides` | tighter PermissionBundle defaults |
| `connector_priority_overrides` | industry-shaped ordering |

### 5.14 CompanySizeVariant

| Field | Purpose |
|-------|---------|
| `company_size_variant_id` | stable identifier |
| `size_band` | startup (1-50) / SMB (51-250) / mid-market (251-1500) / enterprise (1501-10k) / large enterprise (10k+) |
| `role_mix_overrides` | typical role distribution at this size |
| `tool_stack_overrides` | typical tool stack at this size |
| `approval_model_overrides` | typical approval depth at this size |
| `governance_overrides` | governance posture at this size |
| `onboarding_depth` | how deep Dandelion should go at this size |
| `rollout_pattern` | typical rollout pattern (pilot / department-first / company-wide) |

### 5.15 DandelionFlowTemplate

| Field | Purpose |
|-------|---------|
| `dandelion_flow_template_id` | stable identifier |
| `flow_name` | canonical flow name |
| `company_level_questions` | company-tier OnboardingQuestionSet reference |
| `department_level_questions` | department-tier OnboardingQuestionSet reference |
| `user_level_questions` | user-tier OnboardingQuestionSet reference |
| `decision_tree` | decision logic mapping answers to outputs |
| `output_mappings` | how outputs flow into RoleTemplate / DepartmentTemplate / CompanyTemplate / PermissionBundle selection |
| `connector_recommendation_logic` | logic that produces a ConnectorPreset priority list |
| `aha_moment_selection_logic` | logic that selects AhaMomentPack |
| `permission_recommendation_logic` | logic that suggests PermissionBundle defaults |
| `safe_fallback_logic` | logic that selects SafeFallbackMode |
| `governance_review_points` | where org admin / compliance / Founder approval is required |

### 5.16 DigitalTwinStarterProfile

| Field | Purpose |
|-------|---------|
| `digital_twin_starter_profile_id` | stable identifier |
| `entity_id` | the AI_AGENT entity this profile activates |
| `inferred_or_selected_role_template_ids` | RoleTemplate references selected |
| `role_confidence` | confidence score from Dandelion |
| `department_template_id` | DepartmentTemplate reference |
| `company_template_id` | CompanyTemplate reference |
| `tool_profiles_enabled` | enabled ToolProfile references |
| `workflow_templates_enabled` | enabled WorkflowTemplate references |
| `connector_presets_available` | ConnectorPreset references available to activate |
| `connector_presets_connected` | ConnectorPreset references actually connected |
| `default_permissions` | default permission set |
| `disabled_until_approved_capabilities` | capabilities disabled until governance approves |
| `delegated_authority_profile_id` | DelegatedAuthorityProfile reference |
| `permission_bundles` | PermissionBundle references in effect |
| `onboarding_questions_remaining` | unanswered OnboardingQuestionSet questions |
| `aha_moment_pack_id` | AhaMomentPack reference |
| `safe_fallback_mode_id` | SafeFallbackMode reference |
| `adaptation_history` | governed adaptation log |
| `override_history` | user / admin override log |

---

## 6. Role taxonomy

The seed catalog Wave 2 will instantiate role families progressively. This taxonomy is the **bounded reference set** for ADR-0080 (not an encyclopedia).

### Board / Governance

- Board Chair
- Board Member
- Investor / Observer
- Audit Committee Member
- Compensation Committee Member

### Executive

- CEO
- COO
- CFO
- CTO
- CIO
- CISO
- CHRO / Chief People Officer
- CMO
- CRO
- Chief Legal Officer / General Counsel
- Chief Product Officer
- Chief Customer Officer
- Chief of Staff
- Head of AI / Data / Digital Transformation

### Executive Support

- Executive Assistant
- Administrative Assistant
- Office Manager
- Travel Coordinator
- Board Relations Coordinator

### People / HR

- HRBP
- Recruiter
- Talent Acquisition Lead
- People Operations Manager
- Benefits Manager
- Payroll Manager
- Learning & Development Manager
- Employee Relations Manager

### Finance / Accounting

- CFO
- Controller
- FP&A Manager
- Accountant
- Accounts Payable
- Accounts Receivable
- Procurement Manager
- Revenue Operations / Deal Desk
- Expense Manager

### Sales / Revenue

- VP Sales
- Account Executive
- SDR / BDR
- Sales Manager
- Revenue Operations
- Sales Operations
- Account Manager

### Marketing

- CMO
- Growth Marketing Manager
- Demand Generation Manager
- Product Marketing Manager
- Content Marketer
- Brand Manager
- Marketing Operations

### Customer

- Customer Success Manager
- Support Agent
- Support Manager
- Implementation Manager
- Solutions Engineer
- Professional Services Consultant

### Product / Program

- Product Owner
- Product Manager
- Senior Product Manager
- Product Operations
- Project Manager
- Program Manager
- Scrum Master
- Business Analyst

### Engineering / IT / Security

- CTO
- Engineering Manager
- Software Engineer
- DevOps / Platform Engineer
- QA Engineer
- Data Engineer
- ML Engineer
- IT Admin
- Security Analyst
- GRC Manager
- SOC Analyst

### Design / Research

- Product Designer
- UX Researcher
- Design Lead
- Content Designer

### Legal / Compliance

- General Counsel
- Legal Operations
- Contract Manager
- Compliance Officer
- Privacy Officer
- Risk Manager

### Operations

- Operations Manager
- Business Operations
- Facilities Manager
- Vendor Manager
- Supply Chain Manager

---

## 7. Tool taxonomy

Common enterprise tool categories. The seed catalog will not require every tool here on day one; this is the **discovery surface** for ToolProfile.

### Identity / SSO

- Okta
- Microsoft Entra ID
- Google Workspace Identity

### Communication

- Slack
- Microsoft Teams
- Gmail
- Outlook

### Calendar / Meetings

- Google Calendar
- Outlook Calendar
- Zoom
- Google Meet
- Microsoft Teams Meetings

### Documents / Knowledge

- Google Drive / Docs / Sheets / Slides
- Microsoft 365 / OneDrive / SharePoint
- Notion
- Confluence
- Box
- Dropbox

### Project / Work Management

- Jira
- Linear
- Asana
- Monday
- ClickUp
- Trello
- Wrike
- Airtable
- Smartsheet

### CRM / Revenue

- Salesforce
- HubSpot
- Pipedrive
- Outreach
- Salesloft
- Gong
- Clari

### HR / People

- Workday
- BambooHR
- Rippling
- Gusto
- ADP
- Greenhouse
- Lever
- Lattice
- Culture Amp

### Finance / Procurement / Travel / Expense

- NetSuite
- QuickBooks
- Xero
- Ramp
- Brex
- Expensify
- Bill.com
- Coupa
- Airbase
- SAP Concur
- Navan / TripActions
- TravelPerk

### Support / Customer

- Zendesk
- Intercom
- Freshdesk
- ServiceNow
- Gainsight
- ChurnZero

### Engineering / DevOps

- GitHub
- GitLab
- Bitbucket
- Jira
- Linear
- Sentry
- Datadog
- PagerDuty
- AWS
- Azure
- GCP

### Design

- Figma
- FigJam
- Miro
- Canva
- Adobe Creative Cloud

### Legal / Contracts

- DocuSign
- Ironclad
- LinkSquares
- Evisort
- ContractPodAi

### Security / Compliance

- Vanta
- Drata
- OneTrust
- Secureframe
- Wiz
- CrowdStrike
- Snyk
- 1Password
- Bitwarden

### BI / Analytics

- Tableau
- Power BI
- Looker
- Mode
- Metabase
- Snowflake
- BigQuery
- Databricks

---

## 8. Executive Assistant worked example

The Executive Assistant is the **deepest worked example** for the seed catalog Wave 2 reference implementation. Other role templates may be summarized in §6; this section is detailed.

### 8.1 Reporting + delegation

**`likely_reports_to`:**
- CEO
- Founder
- COO
- CFO
- CTO
- CHRO
- General Counsel
- Board Chair
- Executive team member

**`possible_reports_to`:**
- Chief of Staff
- Office of CEO
- Department head
- Board office

**`likely_direct_reports`:**
- none
- Administrative Assistant
- Office Coordinator
- Travel Coordinator
- Receptionist
- Event Coordinator

### 8.2 Common workflows

- calendar management
- meeting scheduling / rescheduling
- travel booking
- hotel booking
- ground transport
- itinerary management
- receipt capture
- expense report preparation
- executive daily brief
- board meeting coordination
- agenda prep
- follow-up drafting
- executive commitment tracking
- visitor / vendor coordination
- focus-time protection

### 8.3 Common tools

- Google Calendar
- Outlook Calendar
- Gmail / Outlook
- Slack / Teams
- Zoom / Google Meet / Teams
- Google Drive / Microsoft 365
- DocuSign
- SAP Concur
- Expensify
- Ramp
- Brex
- Navan / TripActions
- TravelPerk
- Calendly
- Notion
- Asana / Monday / Airtable
- 1Password
- CRM light access where scoped
- Board portal tools where applicable

### 8.4 Delegated authority

The EA's `DelegatedAuthorityProfile` makes the following defaults explicit:

- schedule on behalf of executive
- draft email on behalf of executive
- prepare travel itinerary
- prepare expense report shell
- upload receipts
- coordinate vendors / visitors
- prepare meeting materials
- **never** send executive email unless delegated
- **never** approve sensitive spend unless delegated
- **never** access board / legal / HR / compensation / M&A docs unless scoped

### 8.5 AhaMomentPack

1. **Tomorrow's Executive Brief** — calendar + open commitments + travel + priority email digest.
2. **Travel Booking + Expense Shell** — itinerary + booking actions (governed) + pre-built expense report.
3. **Executive Commitment Follow-Up Draft** — surfaces commitments made; drafts follow-ups for executive approval.
4. **Board Meeting Prep Packet** — agenda + materials + speaker notes + risk callouts.
5. **Focus Time Protection** — auto-shields blocks; suggests reschedules; coordinates intrusions.

### 8.6 SafeFallbackMode

- without Concur → draft travel checklist + itinerary shell + missing-receipt list;
- with Concur read-only → check policy + prepare draft expense shell;
- with delegated Concur write → prepare / submit only within policy and approval limits;
- **never** bypass spend approval.

---

## 9. Dandelion onboarding flow

Founder-Dandelion has three tiers. Today's `dandelion.service.ts` is org-admin substrate; this section defines the **broader activation flow** the ontology supports.

### 9.1 Company-level Dandelion

**Questions:**
- industry
- size
- compliance requirements
- identity provider
- communication tools
- email / calendar suite
- document system
- project / work management system
- CRM
- HRIS / ATS
- finance / expense / travel system
- code repo
- support platform
- security / compliance platform
- approval hierarchy
- delegation-of-authority matrix
- sensitive systems
- read-only-first tools
- tools not approved for Otzar yet

**Outputs:**
- CompanyTemplate
- DepartmentTemplate suggestions
- Connector priority map
- Governance defaults
- Compliance defaults
- Approval defaults
- Safe rollout plan

### 9.2 Department-level Dandelion

**Questions:**
- department
- roles
- daily tools
- recurring workflows
- approvals
- blockers
- KPIs
- canonical docs
- sensitive data
- cross-functional dependencies

**Outputs:**
- DepartmentTemplate
- workflow catalog
- connector recommendations
- risk map
- memory scopes
- department aha moments

### 9.3 User-level Dandelion

**Questions:**
- title
- department
- manager
- direct reports
- dotted-line relationships
- executives supported
- collaborators
- daily tools
- desired first workflows
- read / write boundaries
- approval boundaries
- never-touch areas
- first "wow" task

**Outputs:**
- DigitalTwinStarterProfile
- RoleTemplate selection
- PermissionBundle
- ToolProfiles
- WorkflowTemplates
- AhaMomentPack
- SafeFallbackMode
- remaining onboarding questions

---

## 10. Connector prioritization model

The Founder doctrine states that connector strategy must follow ontology-grounded demand, not founder intuition. ADR-0080 defines the **inputs to the model**, not the first-connector decision itself.

### 10.1 Prioritization inputs

`connector_priority_score` is computed from:

| Input | Direction |
|-------|-----------|
| role frequency across the enterprise | + |
| Dandelion-collected demand | + |
| number of role templates using the tool | + |
| collaboration centrality | + |
| read-value | + |
| write-value | + |
| API maturity | + |
| OAuth readiness | + |
| security risk | – |
| implementation complexity | – |
| customer demand | + |
| demo impact | + |
| launch necessity | + |
| cross-department reach | + |
| approval-gated write feasibility | + |

**The first real Section 4 connector should be selected from this matrix, not intuition.**

### 10.2 Candidate evaluation surface

| Tool | Why it appears | Auth complexity | Notes |
|------|---------------|------------------|-------|
| Slack | very high role frequency; token auth | LOW | top candidate when speed-to-value dominates |
| Gmail | very high role frequency | HIGH (OAuth2 + refresh) | unlocks email triage AhaMoments |
| Google Calendar | universal | HIGH (OAuth2) | core EA / executive workflow |
| Google Drive | universal | HIGH | unlocks document workflows |
| Microsoft Teams | very high in MS-shop enterprises | HIGH | parallel to Slack |
| Outlook | very high in MS-shop enterprises | HIGH | parallel to Gmail |
| Microsoft 365 | universal in MS-shop | HIGH | parallel to Google Drive |
| Jira | very high in engineering / PM | HIGH | unlocks engineering workflows |
| Linear | medium adoption | LOW | smaller market; faster to ship |
| Salesforce | very high in sales-led | VERY HIGH | XL slice |
| HubSpot | high in SMB sales-led | MEDIUM | smaller than Salesforce |
| GitHub | universal in engineering | MEDIUM | code-context workflows |
| Workday / BambooHR | high in HR | HIGH | HR workflows |
| SAP Concur | high in EA / finance | HIGH | unlocks EA expense AhaMoments |
| Ramp / Brex / Expensify | high in EA / finance | MEDIUM-HIGH | unlocks expense / spend workflows |
| Zendesk / Intercom | high in Customer / Support | MEDIUM | unlocks support workflows |
| Vanta / Drata | high in Compliance | MEDIUM | unlocks compliance workflows |

The first-real-connector decision is **explicitly deferred** to a later slice once Dandelion can produce a Founder-reviewable matrix.

---

## 11. Governance and safety

The ontology is bound by Foundation governance at every step. The following invariants are non-negotiable:

- templates are **defaults**, not identity claims;
- Dandelion suggestions are **not** permissions;
- Foundation governance **authorizes** every permission grant (RULE 0; ADR-0027);
- **no** sensitive-or-protected-attribute inference (race / ethnicity / religion / sexual orientation / health / disability / union / immigration / etc.);
- **no** employee scoring;
- **no** manager surveillance (per ADR-0052 doctrine and ADR-0058 drift posture);
- **no** unapproved write actions (ADR-0026 dual-control where required);
- read-only-first for sensitive systems;
- delegated authority must be **explicit** (per `DelegatedAuthorityProfile`);
- dual-control where needed (ADR-0026 + ADR-0050 break-glass for time-boxed emergency);
- all connector actions audited (RULE 4 + existing `ADMIN_ACTION` + `INVOKE_CONNECTOR` lineage; **no new audit literal** introduced by this ADR);
- user and admin correction allowed at any time;
- companies can disable templates;
- templates adapt through **governed signals** (ADR-0048 personalization), not private personal profiling;
- regulator-ready posture preserved (ADR-0070): neutral compliance vocabulary; no "best practice learned" / "AI fixed itself" / "regulator approved" / "compliance certified" claims arising from template defaults.

---

## 12. Mapping to the 10 sections

| § | Section | How ADR-0080 maps |
|---|---------|-------------------|
| 1 | Employee Intelligence | starter Twin context; RoleTemplate + DepartmentTemplate seed `coe.service.assembleContext` priors per ADR-0048 |
| 2 | Autonomous Execution | WorkflowTemplate maps to governed Actions per ADR-0057; risk_level + approval_required propagate to `ActionPolicy` |
| 3 | Hives | DepartmentTemplate.default_hive_patterns shapes Hive (Section 3 / ADR-0059) defaults |
| 4 | Connectors | ToolProfile + ConnectorPreset drive connector prioritization per §10; first real adapter selected after Dandelion runs |
| 5 | Agent Playground | RoleTemplate + WorkflowTemplate seed scenario templates per ADR-0060; AhaMomentPack feeds Wave 9 simulations per ADR-0076 |
| 6 | Analytics | RoleTemplate / DepartmentTemplate / CompanyTemplate KPIs inform aggregates per ADR-0061 |
| 7 | Audit | RoleTemplate actions produce expected `ADMIN_ACTION` discriminators visible in `/api/v1/audit/events` per ADR-0071 |
| 8 | Billing | RoleTemplate + ToolProfile inform packaging + seats (Founder decision pending) |
| 9 | Control Tower | admins manage templates / policies / onboarding; surfaces composed in Wave 3 |
| 10 | Go-Live | Dandelion reduces deployment friction; CompanyTemplate.default_rollout_plan feeds launch checklist |

---

## 13. Implementation ladder

ADR-0080 is **Wave 1**. The ladder below is a roadmap, not a commitment.

| Wave | Scope | Gating |
|------|-------|--------|
| 1 | ADR-0080 design-only (this commit) | this Founder authorization |
| 2 | static seed catalog — top 10–15 RoleTemplate + DepartmentTemplate + CompanyTemplate + ToolProfile + WorkflowTemplate + ConnectorPreset + DelegatedAuthorityProfile + PermissionBundle + OnboardingQuestionSet + AhaMomentPack + SafeFallbackMode + DandelionFlowTemplate; **EA worked example deepest**; markdown + JSON-data form; no Prisma schema | separate Founder authorization |
| 3 | Control Tower / Dandelion preview — company + department + user setup; **read-only preview**, no permission grants | separate Founder authorization |
| 4 | onboarding recommendation engine — wires Dandelion answers to RoleTemplate / PermissionBundle / ConnectorPreset suggestions; **suggest-only** | separate Founder authorization |
| 5 | DigitalTwinStarterProfile attachment to AI_AGENT entity at activation time | separate Founder authorization |
| 6 | connector-priority output — Dandelion produces ranked matrix per §10 | separate Founder authorization |
| 7 | governed connector presets — first real Section 4 adapter chosen from §6 matrix | separate Founder authorization (and RULE 21 research arc) |
| 8 | continuous adaptation — ADR-0048-style governed adaptation rules execute against per-org signals | separate Founder authorization |

Each subsequent wave requires its own Founder authorization at slice; ADR-0080 does **not** pre-authorize Waves 2–8.

---

## 14. Consequences

### Positive

- Otzar no longer starts blank;
- connector strategy becomes grounded in role / tool demand;
- Dandelion gains a coherent activation layer (broader than today's invite/seating substrate);
- faster customer aha moment;
- safer default permissions (read-only-first, delegated authority explicit);
- better enterprise onboarding;
- better demos (Wave 2 EA worked example demonstrates day-one value);
- better launch readiness (closes one of the three Section 10 hard launch blockers at the architecture register);
- RULE 0 sovereignty preserved (templates are defaults, not authorization);
- regulator-ready posture preserved (ADR-0070 neutral compliance vocabulary maintained).

### Tradeoffs

- large ontology surface;
- seed-catalog quality is critical (Wave 2 must be Founder-reviewed; bad defaults are worse than no defaults);
- risk of over-templating if templates are not overrideable (Section 5.1 `adaptation_rules` + Section 5.16 `override_history` mitigate but cannot eliminate);
- requires governance discipline at every implementation wave (RULE 20 Founder authorization per wave);
- requires industry / company-size variants over time (Section 5.13–5.14 are open-ended; Wave 2 seed must pick a bounded starter set);
- existing `dandelion.service.ts` continues to own org-admin invite/seating; future Founder-Dandelion substrate is additive — divergence risk if the two evolve without cross-cutting design;
- this ADR is large; the §6 + §7 + §8 detail must be re-read at every implementation wave (no shortcut).

---

## 15. Citations and bidirectional discipline

This ADR cites:

- **RULE 0** — humans always sovereign (preserved through `default_permissions` defaults + `forbidden_inferences` + governance gating)
- **RULE 1** — build forward only (this ADR adds substrate; does not modify existing `dandelion.service.ts`)
- **RULE 4** — audit trail is sacred (no new audit literal; existing `ADMIN_ACTION` + `INVOKE_CONNECTOR` lineage preserved)
- **RULE 9** — modular connections (the ontology is a contract layer; no cross-service DB reads)
- **RULE 10** — nothing is ever deleted (template overrides leave history)
- **RULE 13** — surface drifts inline (this ADR explicitly distinguishes today's partial `dandelion.service.ts` from Founder-Dandelion target)
- **RULE 14** — bidirectional citation discipline (this ADR is referenced from `docs/architecture/README.md` catalog and `docs/current-build-state/10-deployment-security-go-live-operations.md`)
- **RULE 20** — rule-modification authority (Founder authorization at this commit; subsequent waves require their own Founder authorization)
- **RULE 21** — pre-authorization research arc for substrate-architectural pastes (this ADR is design-only; no external library version semantics introduced; Wave 7 first-connector implementation will require RULE 21 research arc separately)
- **ADR-0001** — three-wallet architecture (PERSONAL / ENTERPRISE / DEVICE — Dandelion outputs respect wallet boundaries)
- **ADR-0024** — pre-commit hook posture (`secret_ref` env-var-name pattern preserved at `ConnectorPreset.secret_requirements`)
- **ADR-0026** — dual-control middleware pattern (DelegatedAuthorityProfile.dual_control_required_actions binds to this substrate)
- **ADR-0027** — contributor governance + RULE 20 (this ADR's authorization tier)
- **ADR-0033** — cross-language data ownership (TypeScript Prisma remains canonical store when Waves 2+ materialize the ontology)
- **ADR-0034** — BEAM testability discipline (the ontology is consumer-of by BEAM substrate if Wave 7+ ever needs distributed coordination; not invoked here)
- **ADR-0036** — REGULATOR principal + LawfulBasis (DelegatedAuthorityProfile preserves regulator-tier discipline at `audit_required_actions`)
- **ADR-0046** — AI_AGENT EntityType-discriminated capsule routing (Twin starter profile composes against existing dual-context routing; AI_AGENT remains an EntityType not a WalletType)
- **ADR-0048** — governed personalization-orchestration substrate (RoleTemplate priors feed `buildPersonalizedWorkingSet` forward-substrate)
- **ADR-0050** — break-glass time-boxed audit (DelegatedAuthorityProfile.emergency_override_allowed binds to this substrate)
- **ADR-0052** — Otzar Domain General Intelligence (this ADR is the OOTB starter for the DGI Twin; "Otzar must feel useful before every connector is connected" preserved)
- **ADR-0057** — autonomous execution core (WorkflowTemplate.connector_actions composes against ActionType + ActionPolicy)
- **ADR-0058** — drift-detection coaching alignment (no manager surveillance; RoleTemplate.forbidden_inferences gates inference)
- **ADR-0059** — Hives v1 design (DepartmentTemplate.default_hive_patterns)
- **ADR-0060** — Agent Playground v1 design (RoleTemplate + WorkflowTemplate seed scenarios)
- **ADR-0061** — Enterprise Analytics v1 (RoleTemplate KPIs)
- **ADR-0069** — Elixir/BEAM substrate-coherence law (not invoked at Wave 1; relevant only if a later wave needs distributed activation coordination)
- **ADR-0070** — regulator-ready Foundation doctrine (neutral compliance vocabulary preserved at §11)
- **ADR-0071** — Section 7 cross-scope verify-chain (RoleTemplate audit-required actions appear in audit chain through existing `ADMIN_ACTION` discriminator)
- **ADR-0076** — Section 5 Wave 9 multi-agent simulation orchestration (AhaMomentPack feeds simulation scenarios)
- **ADR-0078** — conversation context signals substrate (RoleTemplate.default_memory_scopes binds to context signals; no transcript surface introduced here)
- **ADR-0079** — transcript substrate policy (forbidden-fields catalog preserved at `ConnectorPreset.no_leak_rules`)
- **Patent US 12,517,919** (COSMP) — Twin starter profiles compose against the 7-layer Memory Capsule structure without modification.
- **Patent US 12,164,537 + US 12,399,904** (DMW / Foundation primitives) — every PermissionBundle / DelegatedAuthorityProfile resolves against an entity's DMW; the protocol governs.

Back-citation discipline (RULE 14): the architecture README catalog entry for ADR-0080 and the Section 10 build-state document both reference this ADR; this ADR's body references them in §1 and §15.

---

## 16. Founder authorization

This ADR is authorized at the Founder tier under
`[FOUNDER-ADR-0080-OOTB-DANDELION-ONTOLOGY-DESIGN-ONLY-AUTH]` on 2026-06-01.

Subsequent waves (§13) require their own Founder authorization.

After this ADR lands, the recommended next slice is **Wave 2 — static seed catalog** with Executive Assistant as the deepest first worked example. **Do not implement Wave 2 automatically.** Stop and report; await Founder authorization.

---

## 17. Amendment 1 — Wave 2 closeout + governed context envelope doctrine (2026-06-01)

**Authority:** `[FOUNDER-ADR-0080-WAVE-2-STATIC-SEED-CATALOG-AUTH]` + `[FOUNDER-ADR-0080-WAVE-2-ADDENDUM-GOVERNED-CONTEXT-TRANSACTION-ENVELOPE]` (Founder authorization per RULE 20).

### 17.1 Wave 2 closeout

Wave 2 (static seed catalog) landed at `docs/ootb-catalog/`:

- `catalog.schema.json` — JSON Schema with universal envelope + closed-vocab enums.
- `roles.json` — 15 RoleTemplate entries; **Executive Assistant deepest worked example** per §8.
- `departments.json` — 10 DepartmentTemplate entries.
- `company-variants.json` — 10 IndustryVariant + 5 CompanySizeVariant entries.
- `tools.json` — ~95 ToolProfile entries across 14 categories per §7.
- `workflows.json` — 30 WorkflowTemplate entries per Founder workflow list.
- `connector-presets.json` — 14 ConnectorPreset entries (all read-first).
- `dandelion-flow-templates.json` — 1 canonical three-tier `dandelionFlow.company-department-user-activation.v1`.
- `scripts/validate-ootb-catalog.mjs` — pure Node ESM validator (parse, uniqueness, cross-references, envelope completeness, forbidden-phrase scan, EA SAP Concur + Travel Booking + Expense Shell presence, canonical line).
- `docs/ootb-catalog/README.md` — usage + envelope doctrine + Wave 3 consumption notes.

**Out-of-scope** (preserved): no Prisma schema, no runtime behavior, no routes, no Control Tower UI, no connector code, no LLM, no Python, no BEAM, no new audit literal, no mutation to existing `apps/api/src/services/governance/dandelion.service.ts`, no `package.json` script entry (validator runs manually per Founder authorization on CI-churn risk).

### 17.2 Governed context envelope doctrine (Founder addendum)

The catalog format (JSON) is **not** the moat. The **governed context envelope** is.

> *Templates describe useful defaults. Governed envelopes define how those defaults may be used.*
>
> *File format is an implementation detail. Scoped authorization, provenance, permissions, auditability, and context boundaries are the real substrate.*
>
> *For AI agents, the unit of value is not a JSON object. It is a governed context/transaction envelope that carries identity, scope, purpose, permissions, provenance, policy, and audit obligations.*
>
> *Dandelion does not activate raw templates. Dandelion assembles governed starter envelopes for Foundation governance to authorize.*

Every Wave 2 catalog file carries an `envelope_defaults` block stamping each item with 13 envelope fields: `object_type`, `human_readable_summary`, `model_usage_notes`, `scope_defaults`, `permission_defaults`, `provenance`, `audit_expectations`, `policy_purpose`, `allowed_consumers`, `forbidden_consumers`, `sensitivity_level`, `adaptation_rules`, `override_rules`. The schema (`catalog.schema.json`) enforces presence; the validator enforces non-empty values. Per-item overrides take precedence when present (per Founder addendum allowance for file-level compactness).

### 17.3 Future GovernedContextEnvelope shape (forward-substrate)

Future Wave 5+ DigitalTwinStarterProfile attachment will materialize a runtime envelope per Twin. The conceptual future shape (NOT implemented in Wave 2; documented for forward-substrate continuity):

```
GovernedContextEnvelope:
  envelope_id, envelope_version, object_type, object_id, object_version,
  tenant_or_org_scope, entity_scope, department_scope, role_scope,
  purpose, policy_purpose, lawful_basis_required,
  permission_bundle_refs, delegated_authority_refs, connector_preset_refs,
  workflow_refs, source_template_refs,
  provenance, created_by, approved_by, last_reviewed_at,
  expiration_or_review_window, sensitivity_level, retention_class,
  audit_requirements, no_leak_rules,
  allowed_consumers, forbidden_consumers,
  runtime_activation_state, human_override_state, governance_status,
  payload_ref
```

The payload may be JSON, YAML, Markdown, Protobuf, Arrow, a database row, or another representation. The envelope is what governs agent use. A connector preset is never just "the Slack connector" — it is "Slack read-first preset for a scoped role/workflow, under a permission bundle, with safe read surfaces, disabled write actions, audit expectations, and explicit activation requirements."

### 17.4 Connector implication

`ConnectorPreset` entries in Wave 2 already encode envelope-aware metadata. The Wave 7 first-real-connector implementation (separate Founder authorization + RULE 21 research arc) will consume the preset's `envelope_defaults` + per-item `secret_requirements` + `production_enablement_checklist` to materialize the runtime envelope.

### 17.5 Dandelion implication

Wave 4 Dandelion recommendation engine (separate Founder authorization) will produce a `DigitalTwinStarterProfile` whose **assembly** is the governed envelope — not raw template selection. Every governance review point in `dandelionFlow.company-department-user-activation.v1.governance_review_points` is an envelope checkpoint.

### 17.6 Wave 3 recommendation (subject to Founder authorization)

**Recommended next slice:** Wave 3 — Control Tower / Dandelion **read-only preview**.

Wave 3 lands a CT visualization of the Wave 2 catalog (browse roles, departments, tools, workflows, presets; step through the three-tier Dandelion flow). **No permission grants. No connector enablement. Only display.** Wave 3 closes the third Section 10 hard launch blocker at the *visualization* register.

Alternatives Founder may authorize instead:
- **Wave 6** — Dandelion-driven connector-priority matrix output (still suggest-only).
- **Section 10 operational hardening pass** (rollback runbook + admin bootstrap runbook + smoke tests; can land in parallel).
- **Section 8 Billing ADR draft** (Founder pricing/billing-provider decision required first).

**Do not implement Wave 3 automatically.** Stop and report.

---

## 18. Amendment 2 — Wave 3 CT/Dandelion read-only preview LIVE + depth/collaboration addendum (2026-06-01)

**Authority:** `[FOUNDER-ADR-0080-WAVE-3-CT-DANDELION-READ-ONLY-PREVIEW-AUTH]` + `[FOUNDER-ADR-0080-WAVE-3-ADDENDUM-DEEP-ROLE-EXAMPLES-AND-COLLABORATION-MAPS]` + `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]`.

### 18.1 Wave 3 closeout

Wave 3 (Control Tower `/onboarding` read-only Dandelion Preview) landed in `otzar-control-tower` via PR #18. Option A — CT-side static catalog mirror — chosen per Wave 3 Phase 0. No Foundation route, no schema migration, no runtime activation.

CT surfaces now live at `/onboarding`:
- Founder doctrine card (4 canonical lines preserved verbatim).
- Catalog summary counts (15/10/15/95/30/14/1 = 187 items).
- 15-row role browser (Executive Assistant flagged as deepest worked example).
- **Role Depth Roadmap** (per Founder addendum): 1 DEEP + 14 STARTER + 13 NOT_YET_MODELED + 2 SUBSUMED — substrate-honest depth status.
- Executive Assistant spotlight: 9 likely_reports_to + 15 workflows + 18 tools (SAP Concur family) + 7 permission bundles + 5 aha moments (incl. Travel Booking + Expense Shell) + 3 safe-fallback tiers + forbidden inferences.
- **EA Collaboration Map** (per Founder addendum): 7 directions (upward / peer / cross-functional / downward / external / approval-path / escalation-path).
- Tool / workflow / connector preset / Dandelion three-tier flow browsers.
- **DMW Education panel** (per Founder addendum): canonical user-facing line *"Your Memory Wallet is how Otzar remembers safely."* + canonical architecture line *"Dandelion shapes the starter profile; the DMW scopes memory; Foundation governance authorizes use."* + 10 DMW education bullets.
- Governed envelope panel (13 envelope metadata fields).

29 NEW CT tests covering all panels + 15-phrase forbidden-UI-copy guard. 218 / 218 total CT tests pass. Typecheck + lint + build clean.

### 18.2 Substrate-honest depth assessment

Per Founder addendum decision rule, current Wave 2 catalog has enough depth for an *honest* Wave 3 preview (the preview transparently names depth gaps rather than pretending depth that does not exist), but Wave 2.1 role-depth expansion is the recommended next slice before Wave 4.

| Status | Count | Roles |
|--------|-------|-------|
| DEEP | 1 | Executive Assistant |
| STARTER | 14 | CEO, COO, CFO, CHRO, General Counsel, Product Manager, Project Manager, Account Executive, Customer Success Manager, Software Engineer, Engineering Manager, IT Admin, Compliance Officer, Board Member |
| NOT_YET_MODELED | 13 | CTO, CMO, Sales Manager, Public Relations / Communications, AI Engineer, ML Engineer, Researcher / Research Scientist, Data Scientist, UX Researcher, Support Lead, Operations Manager, General Employee / IC, Investor / Observer |
| SUBSUMED | 2 | Board Chair → Board Member; Founder → CEO |

### 18.3 Wave 2.1 forward path (autonomous continuation)

Wave 2.1 role-depth expansion is queued per Founder autonomous-build authority. Bounded static-catalog work; no schema, no runtime. Priority roles to deepen (subset per Founder addendum):
- CTO (architecture authority + AI/ML oversight + security/infrastructure risk surface);
- CMO (campaign + launch comms + brand risk + pipeline influence);
- AI Engineer + ML Engineer (model risk + dataset lineage + safety/privacy review prep; no deployment without approval);
- Public Relations / Communications (press brief + crisis response + media triage; legal-gated);
- General Employee / IC (self-scoped; my-workday brief + commitments + meeting follow-up draft; no manager-monitoring framing);
- Sales Manager (distinct from AE; pipeline coaching + forecast + discount approval gating);
- Support Lead (distinct from CSM);
- Operations Manager;
- Researcher / Research Scientist;
- Data Scientist;
- UX Researcher.

### 18.4 Wave 3 next-slice recommendations (autonomous selection)

Under `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]`, the autonomous build continues:

1. **Wave 2.1** static role-depth expansion (Foundation catalog) — bounded; no schema; no runtime.
2. **Wave 6** Dandelion-driven connector-priority matrix output (Foundation static + CT surface) — suggest-only; no connector code.
3. **Section 10 operational hardening** (Foundation docs) — rollback runbook + admin bootstrap runbook + smoke-test checklist.

Section 4 first-real-connector + Section 8 Billing + Section 9 Workflows remain Founder-decision-gated (TRUE STOP CONDITIONS per autonomous-build directive).

---

## 19. Amendment 3 — Wave 6 connector-priority matrix output (2026-06-01)

**Authority:** `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]`.

### 19.1 Wave 6 closeout

Wave 6 lands a **suggest-only** connector-priority matrix computed deterministically from the Wave 2 static catalog. No connector code, no OAuth, no secrets, no schema. The matrix is one input to the Founder-gated Section 4 first-real-connector decision.

NEW: `scripts/compute-connector-priority.mjs` — pure Node ESM script that loads `docs/ootb-catalog/{tools,connector-presets,roles}.json` and emits both machine-readable JSON and human-readable Markdown.

NEW: `docs/ootb-catalog/connector-priority-matrix.json` — machine-readable ranked output (14 presets; deterministic; same catalog → same matrix).

NEW: `docs/ootb-catalog/connector-priority-matrix.md` — human-readable analysis with weights table, forward-substrate input list, and the ranked matrix.

MOD: `scripts/validate-ootb-catalog.mjs` — extended to verify matrix structure (rows non-empty; `derivation_kind == PURE_FROM_STATIC_CATALOG`; every `preset_id` resolves; `notice` declares SUGGEST-ONLY posture).

### 19.2 Score formula

Per ADR-0080 §10 — derivable subset only. Customer-signal + Dandelion-collected-demand inputs remain forward-substrate.

```
total_score =
    1.5 * tier_score                  (TIER_1=4, TIER_2=3, TIER_3=2, TIER_4=1)
  + 1.0 * api_maturity_score          (STABLE=2, PARTIAL=1, BETA=0)
  + 1.0 * adoption_signal_score       (VERY_HIGH=3, HIGH=2, MEDIUM=1, LOW=0)
  + 1.0 * auth_readiness_score        (API_TOKEN > OAUTH2_USER > OAUTH2_ADMIN_CONSENT)
  + 0.5 * role_count_max              (most-roles-using underlying tool)
  - 0.5 * sensitivity_penalty         (CRITICAL=2, HIGH=1.5, MEDIUM=0.5, LOW=0)
  - 0.5 * complexity_penalty          (VERY_LARGE=3, LARGE=2, MEDIUM=1, SMALL=0)
```

All components are averaged across the preset's underlying tool list except `role_count_max` (which takes the maximum across tools).

### 19.3 Top 5 derived ranking (matrix-version `wave-6-v1.0.0`)

| Rank | Preset | Total | Notes |
|------|--------|-------|-------|
| 1 | Slack (Read-First) | 16.00 | TIER_1 + STABLE API + VERY_HIGH adoption + OAuth bot token + 8 roles use Slack |
| 2 | Google Workspace (Read-First) | 13.33 | 6-tool preset (Gmail / Calendar / Drive / Docs / Sheets / Slides); penalized for OAuth-admin-consent + CRITICAL Gmail sensitivity |
| 3 | Project Tracker (Read-First) | 12.75 | Jira + Linear; engineering/PM core |
| 4 | Microsoft 365 (Read-First) | 11.05 | parallel to Google Workspace in MS-shop |
| 5 | Microsoft Teams (Read-First) | 11.00 | parallel to Slack in MS-shop |

The matrix's top result aligns with the Section 10 audit's substrate-honest "Slack first" recommendation (PR #164 §First-adapter analysis): token auth, mature API, very high enterprise adoption.

### 19.4 Forward-substrate inputs

The matrix transparently declares which ADR-0080 §10 inputs are NOT yet derivable:

- `Dandelion_collected_demand` — no Dandelion runtime yet (Wave 4 forward).
- `customer_demand` — no customers yet.
- `launch_necessity` — Founder decision.
- `demo_impact` — Founder/sales decision.

When these become available (Wave 4 runtime + first customer signals + Founder launch decision), re-run `scripts/compute-connector-priority.mjs` to refresh; the script is deterministic from the catalog and adopts new weights when added.

### 19.5 Wave 6 does NOT do

- Choose the first real connector. Founder decision.
- Authorize an adapter implementation. Requires RULE 21 research arc + Founder authorization at slice.
- Activate any OAuth flow / secret / network call.
- Mutate the catalog. The matrix is a derived output, not a catalog item.
- Add Foundation runtime routes.

### 19.6 Next slice recommendations (autonomous continuation)

1. **CT Wave 6 surface** — render the matrix in the Dandelion Preview's connector preset section as a "Suggested first-connector ranking" panel; transparently show the score formula and forward-substrate inputs.
2. **Wave 2.1 role-depth expansion** — re-run the matrix after deeper role catalog lands; the ranking will likely shift as more roles claim more tools.
3. **Section 4 first-connector implementation arc** — Founder-gated; matrix is the primary substrate input.

---

## 20. Amendment 4 — CT Wave 6 surface LIVE (2026-06-01)

**Authority:** `[FOUNDER-AUTONOMOUS-OTZAR-COMPLETE-BUILD-WHILE-FOUNDER-RESTS-AUTH]`.

### 20.1 CT Wave 6 closeout

CT PR #19 (merged at CT `bf7f826`) extends `/onboarding` Dandelion Preview with a **Suggested first-connector ranking** panel that consumes the Wave 6 matrix landed in Foundation PR #169.

CT surfaces:
- 14 ConnectorPreset rows ranked by `total_score` (Slack 16 first, ATS 5.75 last).
- Per-row score breakdown: rank badge + preset name + underlying tools count + most-roles-using + per-component scores (tier / api / adoption / auth / sensitivity-penalty / complexity-penalty) + total score badge (TIER 1–3 highlighted via secondary badge variant).
- 4 forward-substrate inputs declared transparently (Dandelion_collected_demand / customer_demand / launch_necessity / demo_impact).
- Matrix version + generated-at metadata.
- Suggest-only notice + reading guidance footer.

CT-side mirror is a verbatim copy of Foundation `connector-priority-matrix.json` at `src/lib/ootb-catalog/data.ts` — no derivation logic on the CT side, no invented content. 5 NEW CT tests (panel rendering + 14-row presence + Slack #1 ranking + forward-substrate inputs surfaced + matrix version displayed). 223 / 223 total CT tests pass. Typecheck + lint + build green.

### 20.2 Substrate-honest framing preserved

- "Suggest-only." 
- "The first real connector requires Founder authorization plus a research arc."
- "Nothing is connected from this page."
- "A high score does not mean a connector should be activated."

### 20.3 Forward substrate

Wave 6 closes end-to-end: matrix derivation (Foundation PR #169 `d2f9c44`) + matrix consumer surface (CT PR #19 `bf7f826`). The Section 4 first-real-connector decision now has the substrate input it needs; the matrix is one input, Dandelion-collected demand + customer launch profile + demo impact are the other forward inputs and are gated.

Next autonomous slice: build-log entry capturing the Wave 3 + Section 10 ops + Wave 6 arc as a single archival record, OR begin the bounded subset of Wave 2.1 role-depth expansion (one or two roles at a time per PR).

---

## 21. Amendment 5 — Wave 2.1 role-depth Markdown layer + Domain General Otzar expansion (2026-06-01)

**Authority:** `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` + `[FOUNDER-ADDENDUM-OTZAR-ADMINISTRATOR-AS-FIRST-CLASS-ROLE]` + `[FOUNDER-ADDENDUM-OTZAR-ADMIN-TWIN-AS-FIRST-CHAMPION-DGI-EXPERIENCE]` + `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]`.

### 21.1 Wave 2.1 closeout — role-depth Markdown layer LANDED

NEW: `docs/ootb-catalog/role-depth/` with:
- `README.md` (canonical 29-section role-depth structure + Markdown-for-cognition rationale + governance posture)
- 21 role-depth Markdown files (6 DEEP + 15 SUBSTANTIVE)
- `role-depth-index.json` (machine-readable cross-reference; cites Wave 2 `role.*.v1` IDs the file maps to + NEW NOT_YET_MODELED roles now covered)

**DEEP files (6)** — full canonical depth per Founder direction:

1. `otzar-administrator.md` — first-class role per Founder addendum 2; Admin Twin = first DGI champion per addendum 3. 12 Admin Twin first-week aha moments + Admin + Dandelion co-seeding model + Admin Twin synthesis workflows (Company Intelligence Readiness Brief / Rollout Risk Map / Dandelion Completion Brief / Role Fit Review / Connector Value-Risk Brief / Approval Chain Gap Finder / Memory Scope Safety Brief / Policy Gap Finder / Audit Health Brief / First 7-Day Launch Plan / Department Readiness Ranking / Champion Enablement Pack).
2. `executive-assistant.md` — Wave 2's deepest example, ported into role-depth Markdown format.
3. `ceo-founder.md`
4. `cto.md`
5. `product-owner-product-manager.md`
6. `software-engineer.md`

**SUBSTANTIVE files (15)** — canonical depth, bounded:

`board-member.md` · `cmo.md` · `coo.md` · `cfo.md` · `chro.md` · `general-counsel.md` · `project-program-manager.md` · `ai-engineer-ml-engineer.md` · `researcher-data-scientist-ux-researcher.md` · `public-relations-communications.md` · `sales-manager-account-executive.md` · `customer-success-support-lead.md` · `it-security-grc.md` · `operations-manager.md` · `general-employee-individual-contributor.md`

**Substrate-honest depth status delta (Wave 3 → Wave 2.1):**
- Wave 3 status: 1 DEEP + 14 STARTER + 13 NOT_YET_MODELED + 2 SUBSUMED.
- After Wave 2.1: 6 DEEP role-depth Markdown files + 15 SUBSTANTIVE role-depth Markdown files. 13 NOT_YET_MODELED roles from Wave 3 are now covered: CTO + CMO + Sales Manager + Public Relations + AI Engineer + ML Engineer + Researcher / Research Scientist + Data Scientist + UX Researcher + Support Lead + Operations Manager + General Employee / IC + Otzar Administrator (NEW).
- `roles.json` itself is NOT modified by Wave 2.1 — the Markdown layer extends the role substrate without mutating the JSON catalog or its envelope metadata. Wave 4+ Dandelion engine will compose against both layers.

### 21.2 Domain General Otzar product framing

Canonical product framing locked at this Amendment:

- **"Otzar is Domain General Intelligence inside governed enterprise boundaries."**
- **"Each company's intelligence remains inside its own governed silo."**
- **"Otzar gives each enterprise a governed intelligence layer that understands its domain, tools, roles, workflows, memory, approvals, and policies — while keeping humans and governance in control."**

**Vocabulary discipline** (per Founder direction):

INTERNAL acceptable:
- Domain General Intelligence
- domain-contained intelligence
- governed enterprise intelligence
- company-contained intelligence
- silo-contained intelligence
- enterprise-specific intelligence layer

PUBLIC FORBIDDEN:
- universal AGI
- autonomous AGI
- "replaces employees" / "no human needed" / "fully self-governing company" / "AI runs the company"
- "guaranteed compliant" / "regulator approved" / "no fine risk" (already forbidden per ADR-0070 neutral compliance vocabulary)

### 21.3 Otzar Administrator as first-class role (addendum 2)

Per `[FOUNDER-ADDENDUM-OTZAR-ADMINISTRATOR-AS-FIRST-CLASS-ROLE]`:

- The Otzar Administrator is the **first internal champion** and the **first Domain General Intelligence experience**.
- The Admin Twin is a **governance co-pilot** — never a settings helper, checklist bot, generic admin assistant, or SaaS configuration wizard.
- New roles canonical: Otzar Administrator / Governance Admin / AI Operations Admin / Enterprise AI Admin / Automation Admin / Business Systems Admin (+ IT Admin / Security Admin / Compliance Admin / RevOps / BizOps Admin / Chief of Staff / Operations lead when acting in this capacity).
- Admin Twin first-week aha moments locked at §22 of `otzar-administrator.md` (12 aha moments).
- Admin Twin governance boundaries absolute: never browses private user memory raw; never bypasses approval chains; never suppresses audit; never produces employee scoring / surveillance / psychological profiling / cross-tenant access; never makes compliance certainty claims.
- DMW education line canonical: *"Admins govern how memory is scoped; they do not get blanket access to private memory."*
- Admin Dandelion path is first-class: *"Dandelion should onboard the Otzar Admin before it onboards the company."*

### 21.4 Admin Twin as first DGI champion (addendum 3)

Per `[FOUNDER-ADDENDUM-OTZAR-ADMIN-TWIN-AS-FIRST-CHAMPION-DGI-EXPERIENCE]`:

- The Admin Twin is the **first proof that Otzar understands the company as a domain**.
- It synthesizes across company / departments / roles / org chart / Dandelion progress / role-template fit / workflow readiness / connector readiness + risk / approval chains / delegated authority / policies / audit posture / memory scopes / DMW posture / compliance posture / deployment readiness / billing / first-week rollout plan / trust + adoption risks.
- Admin Twin output is **scoped + auditable + explainable + non-surveillance + non-scoring + governance-focused + action-oriented**.
- 16 Admin Twin synthesis workflows canonical at §16 of `otzar-administrator.md`.
- "The Admin Twin should make governance feel intelligent, not administrative." — preserved verbatim.

### 21.5 Dandelion-as-org-seeding-intelligence framing (addendum 4)

Per `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]`:

Canonical framing updated:

- **"Dandelion is not just onboarding; Dandelion is organizational seeding intelligence."**
- **"Admins govern the setup. Dandelion guides and accelerates the setup. Foundation authorizes activation. DMWs scope memory."**
- **"Dandelion maps the enterprise so Otzar can become useful without forcing the customer to hand-configure everything from zero."**
- **"Dandelion produces proposed maps. Foundation turns approved maps into governed capability."**

Dandelion 6-layer org seeding model:
1. **Company seed** — CompanyDomainModel draft (industry / size / compliance / departments / governance).
2. **Department seed** — DepartmentTemplate recommendations + workflows + tools + readiness ranking.
3. **Role seed** — RoleTemplate / PermissionBundle / WorkflowTemplate / AhaMomentPack / SafeFallbackMode / DigitalTwinStarterProfile draft.
4. **Tool / connector seed** — ConnectorPreset recommendations + read-first plan + write-risk list.
5. **Workflow seed** — WorkflowTemplate recommendations + readiness map + approval-chain gaps.
6. **Memory / DMW seed** — DMW scope recommendations + memory policy gaps + starter memory envelope.

Dandelion outputs are **proposed maps**, never live authority. Foundation governance authorizes activation. Confidence labels: HIGH_CONFIDENCE / MEDIUM_CONFIDENCE / LOW_CONFIDENCE / REQUIRES_ADMIN_REVIEW / REQUIRES_USER_CONFIRMATION / BLOCKED_BY_POLICY.

### 21.6 Forward substrate (queued)

Per Founder implementation order:

1. **Section 9 Workflows ADR** — workflow doctrine (governed business process, 5 maturity stages: Template-only → Recommendation-only → Proposed Action → Governed Execution → Continuous Optimization).
2. **Dandelion Activation ADR** — Stage A preview LIVE; Stage B Assessment → Stage C Recommendation → Stage D Governance Review → Stage E Starter Envelope Assembly → Stage F Activation. Each stage Founder-authorization-gated.
3. **Section 8 Billing / Entitlements ADR** — $250 base + seat add-ons + capability packs + usage add-ons + enterprise tier (per Founder Domain General activation expansion).
4. **Section 4 MCP / Connector Strategy ADR** — broader plan covering Slack + Google Workspace + Project Tracker (Wave 6 matrix top 3) + Gmail / Outlook + GitHub + Salesforce / HubSpot + Travel / Expense (Concur / Ramp / Brex / Expensify). First connector candidate arc: Slack read-first → Google Workspace read-first → Project Tracker read-first.
5. **CompanyDomainModel concept** — eventually formalized as a runtime model after Dandelion Activation lands.

### 21.7 Wave 2.1 does NOT do

- Modify `roles.json` (the Markdown layer extends, does not mutate).
- Add Prisma schema, route, service, runtime activation.
- Grant permissions from templates.
- Create DigitalTwinStarterProfiles at runtime.
- Activate Dandelion runtime.
- Add billing / Workflows runtime.
- Add LLM / Python / BEAM.
- Add new audit literal.
- Mutate `dandelion.service.ts`.

## 22. Amendment 6 — D6 Dandelion Activation substrate LANDED 2026-06-01

Per `[FOUNDATION-D6-DANDELION-ACTIVATION]` autonomous continuation. Classification A (Static / Catalog / Docs). Stage F design substrate LANDED — the final stage of the Dandelion 6-stage maturity model per §21.6 forward substrate item #2.

NEW `docs/dandelion-activation/` (6 files):

- `README.md` — doctrine + activation step ordering doctrine + per-archetype step counts + audit literal forward-queue + validator usage
- `activation.schema.json` — JSON Schema with `kind: ActivationPlan`, required fields including `consumes_starter_envelope_id` (cross-ref to D5), `activation_state: DESIGN_NOT_EXECUTED` const, activation_steps with `step_order` + `audit_literal` + `preconditions` + `postconditions` + `failure_mode` + `rollback_path`, human_authorization_points enum, rollback_strategy.soft_delete_only const true
- `starter-pilot-activation.json` — 6 steps (precheck + baseline DMW + template roles + Stage 1 templates + safe-fallback aha + state-flip; no connectors)
- `team-activation.json` — 8 steps (+ team DMW scope + Slack connector + Stage 2 templates)
- `business-activation.json` — 11 steps (+ project/customer DMW + delegated authority + Google connector + advanced audit)
- `enterprise-activation.json` — 14 steps (+ break-glass registry + LawfulBasis attestation + DUAL-CONTROL templates + DUAL-CONTROL regulator-grade audit + board observer)

NEW `scripts/validate-dandelion-activation.mjs` — pure Node ESM validator (mirrors `validate-dandelion-starter-envelope.mjs` sentence-level negation + subtree skip; adds D5 cross-reference check + step ordering integrity check + last-step STARTER_ENVELOPE_ACTIVATED check). Validator green: 6/6 files, 4 activation plans, 39 activation steps (6+8+11+14), 4/4 plan archetypes, 4 D5 envelope IDs cross-referenced.

**Activation step doctrine**: every plan starts with read-only precheck and ends with `step.envelope.mark-activated` state-flip; in between, steps progress in dependency order (DMW grants → role assignments → authority profiles → governance surfaces → connector bindings → workflow templates → advanced audit → board observer → aha moments → state-flip). Every step emits exactly one audit literal BEFORE the underlying mutation per RULE 4; every step's rollback_path is reversible via soft-delete per RULE 10.

**Audit literal forward-queue**: 20+ ADMIN_ACTION:* literals proposed at the design tier (per ADR-0042 §Q-γ.1 clean-transition discipline). Their substantive landing in the audit literals enum is forward-substrate at the implementation slice; the D6 design substrate does NOT add any new audit literal yet.

**Dual-control enforcement**: enterprise activation steps 10 (Stage 2 enterprise templates including financial-effect templates) + 11 (regulator-grade audit with custom retention) require TWO_ORG_ADMINS_DUAL_CONTROL authorization per ADR-0026. Audit details record both approver audit_event_id references; GAP-C1 self-approval guard preserved.

**Reversibility-by-construction**: every step's rollback_path is canonicalized; activation_lineage row preserves forward + backward history; partial activation state is impossible to leave behind; a re-attempt is a fresh plan instance per RULE 10 + ADR-0002.

**NO runtime activation**, NO actual binding registration, NO permission grant, NO DMW scope open, NO workflow template registration, NO new audit literal at the D6 design tier, NO mutation to Foundation services, NO connector authorization beyond C2 (Slack OPERATING) + C3 (Google Workspace RUNTIME_READY).

**Dandelion graduation:** Stage A (Preview LIVE) + Stage B (ASSESSMENT_READY) + Stage C (RECOMMENDATION_READY) + Stage D (GOVERNANCE_REVIEW_READY) + Stage E (ENVELOPE_READY) + **Stage F ACTIVATION_DESIGN_READY**. Stage F runtime execution forward-substrate at the implementation slice.

## 23. Amendment 7 — D6 implementation slice (starter-pilot activation runtime) LANDED 2026-06-01

Per `[FOUNDATION-D6-IMPL-STARTER-PILOT-ACTIVATION-RUNTIME]` autonomous continuation. Classification E (Runtime; smallest blast radius — no connector binding, no per-tenant secret_ref handling). Stage F runtime execution LIVE for the starter-pilot archetype only.

NEW `apps/api/src/services/governance/dandelion-activation.service.ts`:

- `executeStarterPilotActivationForCaller(callerEntityId)` — service-owned auth gate per ADR-0004
- Loads the catalog from disk (`docs/dandelion-activation/starter-pilot-activation.json`) at runtime
- Walks the 6 catalog steps in order; emits one ADMIN_ACTION audit event per step
- Each audit row carries `details.action` set to the catalog's audit_literal sub-string (e.g. `ENVELOPE_ACTIVATION_PRECHECK`, `DMW_BASELINE_GRANTED`, `ROLE_TEMPLATE_ASSIGNED`, `WORKFLOW_TEMPLATE_REGISTERED`, `AHA_MOMENT_REGISTERED`, `STARTER_ENVELOPE_ACTIVATED`) — plus `archetype` + `plan_id` + `step_order` + `step_id` + `consumes_map_type` + `human_authorization_required`
- Returns the discriminated `ActivationResult` shape (`ok: true` with the per-step audit_event_id list + the final `activation_audit_event_id`, or `ok: false` with a closed-vocab `ActivationFailureCode`)
- Closed-vocab failure codes: `NOT_ADMIN` / `CALLER_ENTITY_NOT_FOUND` / `CALLER_NOT_IN_ORG` / `ARCHETYPE_UNKNOWN` / `CATALOG_NOT_FOUND` / `CATALOG_MALFORMED` / `AUDIT_WRITE_FAILED`

NEW route `POST /api/v1/org/dandelion/activate` (org.routes.ts):

- `requireAdminCapability(authService, "can_admin_org")` preHandler
- Maps closed-vocab failure codes → HTTP status: `ARCHETYPE_UNKNOWN` → 422 · `NOT_ADMIN` / `CALLER_ENTITY_NOT_FOUND` / `CALLER_NOT_IN_ORG` → 403 · everything else → 500
- 200 on success with the full `ActivationResult` body

NEW `tests/integration/dandelion-activation.test.ts` (10 tests):

- Service-tier (7 tests): walks all 6 steps · audit row details.action matches catalog audit_literal sub-string · audit chain integrity preserved (`verifyAuditChain.brokenAt === null`) · event_type stays ADMIN_ACTION across all 6 steps · NOT_ADMIN / CALLER_NOT_IN_ORG rejection · catalog step_id sequence matches
- HTTP-tier (3 tests): 200 + ok:true + 6 step results for admin caller · 401/403 unauthenticated · 403 for non-admin caller

MOD `tests/unit/no-leak-guard.test.ts`:

- `KNOWN_LEGITIMATE_HITS[apps/api/src/routes/org.routes.ts]` line number bumped 1176 → 1177 (the D6 import addition shifted the canonical `payload_summary` Prisma-select line by 1; reason field extended with the canonical lineage)

MOD `apps/api/src/index.ts`:

- NEW barrel exports for `executeStarterPilotActivationForCaller` + `ActivationResult` / `ActivationFailureCode` / `ActivationSuccess` / `ActivationFailure` / `ActivationStepResult` types

**Honest scope** — what this slice DOES NOT do (forward-substrate per the Founder bias toward operating state + smallest-blast-radius discipline):

- NO real DMW grants / role assignments / workflow template registrations / aha moment registrations (those underlying tables are forward-substrate at later slices)
- NO persistent "envelope state" row (no new Prisma table at this slice; "ACTIVATED" is provable by walking the audit chain)
- NO new audit literal in `AUDIT_EVENT_TYPE_VALUES` (RULE 4 is satisfied by the existing `event_type: "ADMIN_ACTION"` + `details.action` discriminator pattern per the audit-view.service.ts precedent at lines 561 + 1454)
- NO team / business / enterprise archetypes (those carry connector binding + delegated authority + dual-control which require additional implementation slices)
- NO rollback execution path (the catalog's rollback_path strings remain forward-substrate guidance; the audit chain is naturally append-only so the activation row itself is reversible only by issuing inverse audit events — a future slice)

**Test/build state:** unit suite 1225/1225 preserved (no-leak guard line-number rebased to 1177) · integration suite 211 → 221 (+10 NEW D6 tests) · typecheck baseline preserved at 4 canonical errors.

**Stage F graduation:** `ACTIVATION_DESIGN_READY` → **`OPERATING (starter-pilot)`**. Stage F for team / business / enterprise archetypes remains forward-substrate.

**CT team-archetype admin walk LANDED 2026-06-01** via CT PR #24 `[CT-D6-TEAM-ACTIVATION-ADMIN-WALK]` (commit `98e41ed`). Admins can now run the team-archetype activation end-to-end from the product UI. CT changes: MOD `src/lib/dandelion-activation/types.ts` (`CtActivationFailureCode` union +`INVALID_SLACK_BINDING_INPUT` +`CONNECTOR_BINDING_FAILED`; NEW `CtTeamActivationInput` interface) + MOD `src/lib/dandelion-activation/labels.ts` (NEW `DMW_TEAM_SCOPE_GRANTED` step 3 label + NEW `CONNECTOR_BINDING_REGISTERED` step 5 label — both explicit about env-var NAME storage / resolved value never crossing the API boundary) + MOD `src/lib/api.ts` (NEW `dandelionActivation.activateTeam(input)` method consuming POST /api/v1/org/dandelion/activate/team) + MOD `src/pages/Onboarding.tsx` (NEW `TeamActivationCard` mounted between `DandelionActivationCard` and `CatalogCountsCard`; 3 form fields slack_display_name + slack_secret_ref + slack_workspace_id? with submit-disabled-until-required-filled; shared `ActivationStepCard` extended so step 5 slack-binding-register gets a 2-pixel primary border + 'Slack binding' badge) + 31 NEW tests. Privacy invariant preserved across 3 layers: secret_ref placeholder is env-var NAME pattern (no concrete `xoxb-*`); success panel does NOT contain `/xoxb-[A-Za-z0-9]{4,}-[A-Za-z0-9]{4,}/` regex even when an admin pastes a concrete token into the form by mistake (the Foundation audit lineage returns env-var NAME only); no raw `ADMIN_ACTION:` prefix leakage; 14-phrase forbidden UI copy guard exercised across success path. CT test suite 310 → 341 (+31 NEW). D6 **starter-pilot + team OPERATING** at Foundation backend tier + admin-visible at CT tier for both archetypes. The "team plan plays Slack" first-week aha moment is now achievable end-to-end across the product UI; final graduation to per-org production deployment remains forward-substrate (requires `SLACK_USE_REAL=1` against a live workspace at the deployment register, separately Founder-authorized).

**CT business-archetype admin walk LANDED 2026-06-01** via CT PR #25 `[CT-D6-BUSINESS-ACTIVATION-ADMIN-WALK]` (commit `612d825`). Admins can now run the business-archetype activation end-to-end from the product UI — register both Slack + Google Workspace read-first bindings in one activation flow. CT changes: MOD `src/lib/dandelion-activation/types.ts` (`CtActivationFailureCode` union +`INVALID_GOOGLE_BINDING_INPUT`; NEW `CtBusinessActivationInput` interface with 6 fields covering both Slack + Google plus optional workspace identifiers) + MOD `src/lib/dandelion-activation/labels.ts` (3 NEW labels: `DMW_PROJECT_CUSTOMER_SCOPE_GRANTED` step 3 + `DELEGATED_AUTHORITY_REGISTERED` step 5 with RULE 0 ceiling enforcement explicit + `ADVANCED_AUDIT_TIER_ENABLED` step 9 — baseline audit chain stays on; advanced tier extends never weakens) + MOD `src/lib/api.ts` (NEW `dandelionActivation.activateBusiness(input)` method consuming POST /api/v1/org/dandelion/activate/business) + MOD `src/pages/Onboarding.tsx` (NEW `BusinessActivationCard` mounted between `TeamActivationCard` and `CatalogCountsCard` with 6 form fields in 2 sections separated by `<Separator />`; shared `ActivationStepCard` extended so BOTH step 6 slack-binding-register AND step 7 google-workspace-binding-register get a 2-pixel primary border + connector-specific 'Slack binding' / 'Google binding' badges; failureMessage switch extended for `INVALID_GOOGLE_BINDING_INPUT` + generalized `CONNECTOR_BINDING_FAILED`; mutation onSuccess error handler enhanced to synthesize a `CtActivationFailure` shape from `ApiResult.code` on 4xx/5xx responses so the customer-admin vocabulary discipline stays consistent across both 200+ok:false AND 4xx response paths) + 36 NEW tests. Privacy invariant exercised across 4 layers: both Slack + Google secret_ref placeholders are env-var NAME patterns (no concrete `xoxb-*` / `ya29.*`); success panel does NOT contain `/xoxb-[A-Za-z0-9]{4,}-[A-Za-z0-9]{4,}/` / `/ya29\.[A-Za-z0-9_-]{8,}/` / `/-----BEGIN PRIVATE KEY-----/` / `/"private_key":/` / `/Bearer /i` regex even when an admin pastes concrete tokens into both secret_ref fields by mistake (the Foundation audit lineage returns env-var NAME only); no raw `ADMIN_ACTION:` prefix leakage; 14-phrase forbidden UI copy guard exercised across success path. CT test suite 341 → 377 (+36 NEW). D6 **starter-pilot + team + business OPERATING** at Foundation backend tier + admin-visible at CT tier for all three archetypes. The "business plan plays Slack + Google" multi-connector aha moment is now achievable end-to-end across the product UI; final per-org production deployment with `SLACK_USE_REAL=1` + `GOOGLE_USE_REAL=1` remains forward-substrate (separately Founder-authorized at deployment register). Enterprise archetype remains forward-substrate.

**CT enterprise-archetype admin walk LANDED 2026-06-01** via CT PR #26 `[CT-D6-ENTERPRISE-ACTIVATION-ADMIN-WALK]` (commit `42e6b0c`). **The D6 4-archetype CT visibility series is COMPLETE matching the backend completion** — all 4 Dandelion plan archetypes from ADR-0080 Amendment 1 Stage F are now admin-visible at CT tier. CT changes: MOD `src/lib/dandelion-activation/types.ts` (NEW `CtEnterpriseActivationInput` interface; 6 fields identical to `CtBusinessActivationInput`) + MOD `src/lib/dandelion-activation/labels.ts` (6 NEW labels: `DMW_ENTERPRISE_SCOPE_GRANTED` step 3 + `BREAK_GLASS_REGISTRY_ENABLED` step 6 with audit-only / forward-substrate disclosure + `LAWFUL_BASIS_ATTESTATION_ENABLED` step 7 with audit-only disclosure + `BOARD_OBSERVER_SCOPE_REGISTERED` step 12 with aggregate-only / no-per-employee-detail disclosure + `WORKFLOW_TEMPLATE_REGISTERED_DUAL_CONTROL` step 10 + `REGULATOR_GRADE_AUDIT_ENABLED_DUAL_CONTROL` step 11 — both DUAL-CONTROL labels truthfully record catalog design-intent per ADR-0026 forward-substrate) + MOD `src/lib/api.ts` (NEW `dandelionActivation.activateEnterprise(input)` method consuming POST /api/v1/org/dandelion/activate/enterprise) + MOD `src/pages/Onboarding.tsx` (shared `ActivationStepCard` extended to detect `*_DUAL_CONTROL` audit_literal endings and render a NEW "DUAL-CONTROL" badge truthfully recording catalog design-intent; NEW `EnterpriseActivationCard` mounted between `BusinessActivationCard` and `CatalogCountsCard` with 6 form fields in 2 sections separated by `<Separator />`) + 34 NEW tests. Privacy invariant preserved across the same 4 layers as business: both Slack + Google secret_ref placeholders are env-var NAME patterns; success panel does NOT contain `xoxb-*` / `ya29.*` / `-----BEGIN PRIVATE KEY-----` / `"private_key":` / `Bearer ` regex even when an admin pastes concrete tokens into both secret_ref fields by mistake; no raw `ADMIN_ACTION:` prefix leakage; 14-phrase forbidden UI copy guard exercised. CT test suite 377 → 411 (+34 NEW). D6 **starter-pilot + team + business + enterprise OPERATING** at Foundation backend tier + admin-visible at CT tier for ALL FOUR archetypes. The D6 4-archetype CT visibility series matches the backend completion. Final per-org production deployment with `SLACK_USE_REAL=1` + `GOOGLE_USE_REAL=1` remains forward-substrate. DUAL-CONTROL middleware wiring (actual `requireDualControl` preHandler on `/activate/enterprise` route per ADR-0026) remains forward-substrate; the CT DUAL-CONTROL badge truthfully discloses this — it records design-intent at the catalog tier without claiming approval-flow enforcement at runtime.

**DC-WIRING-DRIFT closed 2026-06-01** per `[FOUNDATION-CLOSE-DC-WIRING-DRIFT-ACTION-POLICIES]` per `[FOUNDER-AUTONOMOUS-CONTINUATION-AUTH]` per Section 10 hardening pass PR #205. Closes the substrate-honesty drift surfaced in the Section 10 production-readiness audit: the `ORG_ACTION_POLICY_UPDATE` PRIVILEGED_ENDPOINTS registry entry + the integration-test `grantPolicyUpdateApproval` pre-grant + the route comment all claimed dual-control enforcement at `PUT /api/v1/org/action-policies`, but the actual route preHandler had only `requireAdminCapability(can_admin_org)` — the dormant approval rows in `EscalationRequest` were never read at request-time. This slice wires `requireDualControl(actionPolicyEndpoint)` into the preHandler tuple following the exact 3-touchpoint pattern from the D6 DUAL-CONTROL wiring below: (1) MOD `apps/api/src/routes/org.routes.ts` — NEW `actionPolicyEndpoint` registry lookup adjacent to `enterpriseActivationEndpoint`, with throw-guard fail-fast at server boot if the registry drifts; (2) MOD same file — PUT preHandler converted from single `requireAdminCapability` to ordered `[requireAdminCapability(can_admin_org), requireDualControl(actionPolicyEndpoint)]` tuple — preHandler order matters (admin capability gate populates `request.auth.entity_id` per the BINDING CONTRACT before dual-control reads it). MOD `tests/unit/no-leak-guard.test.ts` (line rebased 1200 → 1230 for the +30-line route preamble + multi-line preHandler block expansion). No new audit literal; no new PRIVILEGED_ENDPOINTS entry (the Operation E entry was already added at PR #49 ADR-0057 §7 — only the route binding was missing). Integration test surface preserved at 21/21 — pre-grant approval via `grantPolicyUpdateApproval` is now actually exercised at request-processing register (previously dormant); the test suite was authoritative all along but the runtime path was bypassing it. Unit suite 19/19 (no-leak-guard 2/2 + privileged-endpoints 17/17). Typecheck baseline preserved at 4 canonical errors. **Action-policy update route graduation:** `OPERATING (single-actor caller path despite registry claim)` → **`OPERATING (DUAL-CONTROL-enforced caller path per ADR-0026)`**. Section 10 audit gap closed: the registry, the integration tests, and the runtime binding are now coherent.

**D6 DUAL-CONTROL middleware wiring LANDED 2026-06-01** per `[FOUNDATION-D6-IMPL-DUAL-CONTROL-WIRING]` per `[FOUNDER-AUTONOMOUS-CONTINUATION-AUTH]`. Stage F enterprise activation route is now **DUAL-CONTROL-enforced at runtime** per ADR-0026. Converts the truthfully-recorded DUAL-CONTROL design-intent from the enterprise activation catalog (steps 10 + 11 emit `WORKFLOW_TEMPLATE_REGISTERED_DUAL_CONTROL` + `REGULATOR_GRADE_AUDIT_ENABLED_DUAL_CONTROL` audit literals) into actual approval-flow enforcement at the request-processing register. MOD `apps/api/src/security/privileged-endpoints.ts` — `EscalationActionDescriptor` union extended with NEW `ORG_DANDELION_ENTERPRISE_ACTIVATION` literal; NEW registry entry binds `POST /api/v1/org/dandelion/activate/enterprise` at `can_admin_org` tier (Class B). MOD `apps/api/src/routes/org.routes.ts` — NEW imports for `requireDualControl` + `PRIVILEGED_ENDPOINTS`; NEW registry lookup `enterpriseActivationEndpoint` at the top of `registerOrgRoutes` with throw-guard fail-fast at server boot if the registry drifts; route preHandler converted from single `requireAdminCapability` to ordered `[requireAdminCapability(can_admin_org), requireDualControl(enterpriseActivationEndpoint)]` — preHandler order matters (admin capability gate populates `request.auth.entity_id` per the BINDING CONTRACT before dual-control reads it). MOD `tests/unit/privileged-endpoints.test.ts` — registry size 5 → 6; Class B size 1 → 2; NEW `isPrivilegedEndpoint` test for `POST /api/v1/org/dandelion/activate/enterprise`; NEW negative test confirming starter-pilot / team / business routes are NOT privileged (those archetypes intentionally remain single-actor; only the enterprise catalog carries DUAL-CONTROL design-intent). MOD `tests/integration/dandelion-activation.test.ts` — existing 2-test HTTP-tier surface replaced with 4-test dual-control HTTP-tier surface: (1) **503 fail-closed** for single-admin org per ADR-0026 Amendment 1 §6 + GAP-C1 self-approval guard; (2) **403 + PENDING EscalationRequest creation** for caller with no APPROVED grant + second admin available; (3) **200 + 14 steps** for caller with APPROVED grant; (4) **non-enterprise routes remain single-actor** — POST /activate (starter-pilot) bypasses dual-control. MOD test cleanup hooks: `cleanupTestEscalations` runs before `cleanupTestData` (EscalationRequest entity relations have no `onDelete: Cascade`). MOD `tests/unit/no-leak-guard.test.ts` (line rebased 1182 → 1200 due to the +18-line route preamble). Unit suite preserved + extended (privileged-endpoints +2 tests; total 17/17 still + 2 new = 19); integration suite 252 → 254 (+4 NEW dual-control − 2 prior; net +2). Typecheck baseline preserved at 4 canonical errors. **Stage F enterprise route graduation:** OPERATING (single-actor caller path) → **OPERATING (DUAL-CONTROL-enforced caller path per ADR-0026)**. The CT DUAL-CONTROL badge introduced at CT PR #26 now corresponds to actual runtime enforcement at the Foundation backend tier, not just truthful catalog disclosure. The starter-pilot / team / business activation routes intentionally remain single-actor (their catalogs carry no `*_DUAL_CONTROL` literals; they are NOT in `PRIVILEGED_ENDPOINTS`).

**Enterprise-archetype runtime LANDED 2026-06-01** per `[FOUNDATION-D6-IMPL-ENTERPRISE-ACTIVATION-RUNTIME]` autonomous continuation. Stage F runtime execution LIVE for the **enterprise** archetype — the fourth and final archetype after starter-pilot, team, and business. The 14-step enterprise activation plan composes against C2 OPERATING SLACK_READ + C3 RUNTIME_READY GOOGLE_WORKSPACE_READ (steps 8 + 9). NEW `executeEnterpriseActivationForCaller(callerEntityId, input)` with `EnterpriseActivationInput` (identical 6-field shape to BusinessActivationInput; both env-var NAMEs only; resolved VALUEs never cross the API boundary). NEW route `POST /api/v1/org/dandelion/activate/enterprise` — `requireAdminCapability(can_admin_org)` preHandler; closed-vocab failure codes reuse the existing 9-code union. Steps 5 (delegated-profile-register) + 6 (break-glass.grant-registry-enable) + 7 (lawful-basis.attestation-surface-enable) + 12 (board.observer-scope-register) all emit **audit-only** at this slice (the underlying BreakGlassGrant registry / LawfulBasisAttestation / BoardObserverScope tables are forward-substrate). **DUAL-CONTROL audit literals**: steps 10 + 11 emit `ADMIN_ACTION:WORKFLOW_TEMPLATE_REGISTERED_DUAL_CONTROL` + `ADMIN_ACTION:REGULATOR_GRADE_AUDIT_ENABLED_DUAL_CONTROL` literals truthfully — the actual DUAL-CONTROL approval flow per ADR-0026 is forward-substrate (a future slice will wire `requireDualControl` in front of this route); until then the literals truthfully record the catalog's design-intent; the audit chain remains hash-verifiable. **Partial-failure semantics**: identical to business (Slack binding stays LIVE if Google fails). 10 NEW integration tests (6 service-tier walking 14 steps + asserting both real binding rows created with use_real:false + audit chain integrity across 14-step walk + DUAL-CONTROL audit literal emission at steps 10 + 11 + audit-only verification at steps 6 + 7 + 12; 2 service-tier input validation; 2 HTTP-tier). MOD `tests/unit/no-leak-guard.test.ts` (line number rebased 1181 → 1182). MOD `apps/api/src/index.ts` (NEW barrel exports for executeEnterpriseActivationForCaller + EnterpriseActivationInput). Unit suite preserved; integration suite 242 → 252 (+10 NEW). Typecheck baseline preserved at 4 canonical errors. **Stage F graduation:** `OPERATING (starter-pilot + team + business)` → **`OPERATING (starter-pilot + team + business + enterprise)`** — the D6 4-archetype series at runtime is COMPLETE; all 4 Dandelion plan archetypes from ADR-0080 Amendment 1 Stage F are now LIVE at the Foundation backend tier. Per-org production deployment with `SLACK_USE_REAL=1` + `GOOGLE_USE_REAL=1` remains forward-substrate. DUAL-CONTROL middleware wiring remains forward-substrate (the route accepts admin caller without dual-control at this slice; future slice adds `requireDualControl(EnterpriseActivationDescriptor)` preHandler).

**Business-archetype runtime LANDED 2026-06-01** per `[FOUNDATION-D6-IMPL-BUSINESS-ACTIVATION-RUNTIME]` autonomous continuation. Stage F runtime execution LIVE for the **business** archetype — the third archetype after starter-pilot and team. The 11-step business activation plan composes against the C2 OPERATING SLACK_READ + C3 RUNTIME_READY GOOGLE_WORKSPACE_READ connector substrates; step 6 creates a real SLACK_READ ConnectorBinding row and step 7 creates a real GOOGLE_WORKSPACE_READ ConnectorBinding row via `registerConnectorBindingForOrg` (both with `use_real: false` at activation tier; Founder authorizes real-mode flips separately at the deployment register). NEW `executeBusinessActivationForCaller(callerEntityId, input)` with `BusinessActivationInput { slack_display_name, slack_secret_ref, slack_workspace_id?, google_display_name, google_secret_ref, google_workspace_domain? }` — both env-var NAMEs only; resolved VALUEs never cross the API boundary. NEW route `POST /api/v1/org/dandelion/activate/business` — `requireAdminCapability(can_admin_org)` preHandler; closed-vocab failure codes extended with `INVALID_GOOGLE_BINDING_INPUT` (missing google_display_name or google_secret_ref). Step 5 (delegated-profile-register) + step 9 (advanced-audit-tier-enable) emit audit-only at this slice (the underlying DelegatedAuthorityProfile + OrgSettings.advanced_audit_tier tables are forward-substrate at later slices); the audit chain records the intent at the authoritative tier. **Partial-failure semantics**: if step 6 (Slack) succeeds but step 7 (Google) fails, the Slack binding row remains LIVE — the failure response names which connector failed; operator can soft-delete the orphaned binding via the existing admin /api/v1/org/connectors/:id route. The step 7 Google audit row carries `connector_type: GOOGLE_WORKSPACE_READ` + `binding_display_name` + `binding_secret_ref_name` (env-var NAME only); test asserts no `ya29.*` token / no service-account private-key JSON / no Bearer header pattern in any serialized row. 11 NEW integration tests (6 service-tier walking 11 steps + asserting both real binding rows created with use_real:false + audit chain integrity + delegated authority + advanced audit audit-only verification + step 7 Google audit privacy invariant; 3 service-tier input validation; 2 HTTP-tier). MOD `tests/unit/no-leak-guard.test.ts` (line number rebased 1180 → 1181). MOD `apps/api/src/index.ts` (NEW barrel exports for executeBusinessActivationForCaller + BusinessActivationInput). Unit suite preserved; integration suite 231 → 242 (+11 NEW). Typecheck baseline preserved at 4 canonical errors. **Stage F graduation:** `OPERATING (starter-pilot + team)` → **`OPERATING (starter-pilot + team + business)`**. Enterprise archetype remains forward-substrate (it carries break-glass registry + LawfulBasis attestation + DUAL-CONTROL on financial-effect steps + board observer scope; requires a separate implementation slice).

**Team-archetype runtime LANDED 2026-06-01** per `[FOUNDATION-D6-IMPL-TEAM-ACTIVATION-RUNTIME]` autonomous continuation. Stage F runtime execution LIVE for the **team** archetype — the second archetype after starter-pilot. The 8-step team activation plan composes against the C2 OPERATING SLACK_READ connector substrate (Foundation PR #185); step 5 (`step.connector.slack-binding-register`) creates a real SLACK_READ ConnectorBinding row via `registerConnectorBindingForOrg` (the existing C2 service entry point). NEW `executeTeamActivationForCaller(callerEntityId, input)` with `TeamActivationInput { slack_display_name, slack_secret_ref, slack_workspace_id? }` — the admin paste-in field is the env-var NAME on the deployment host (e.g. `SLACK_BOT_TOKEN_PROD`); the resolved env-var VALUE never crosses the API boundary. NEW route `POST /api/v1/org/dandelion/activate/team` — `requireAdminCapability(can_admin_org)` preHandler; closed-vocab failure codes extended with `INVALID_SLACK_BINDING_INPUT` (missing display_name or secret_ref) + `CONNECTOR_BINDING_FAILED` (the downstream connector-binding service rejected the binding shape). Connector binding registered with `use_real: false` at activation tier (Founder authorizes the real-mode flip separately at the deployment register). The step 5 audit row carries `binding_display_name` + `binding_secret_ref_name` (env-var NAME only) — the resolved VALUE is structurally absent from the audit chain. 10 NEW integration tests (5 service-tier walking 8 steps + asserting real binding row creation with use_real:false + audit chain integrity + step 5 audit privacy invariant; 2 service-tier input validation; 3 HTTP-tier including 422 for missing slack_display_name + 403 for non-admin caller). MOD `tests/unit/no-leak-guard.test.ts` (line number rebased 1177 → 1180; canonical lineage extended for the team import expansion). MOD `apps/api/src/index.ts` (NEW barrel exports for executeTeamActivationForCaller + TeamActivationInput). Unit suite preserved; integration suite 221 → 231 (+10 NEW). Typecheck baseline preserved at 4 canonical errors. **Stage F graduation:** `OPERATING (starter-pilot)` → **`OPERATING (starter-pilot + team)`**. The "team plan plays Slack" first-week aha moment is now achievable end-to-end at the runtime tier. Business + enterprise archetypes remain forward-substrate (they carry delegated authority + multi-connector + dual-control + LawfulBasis steps requiring additional implementation slices).

**CT companion path LANDED 2026-06-01** via CT PR #23 `[CT-D6-DANDELION-ACTIVATION-ADMIN-WALK]` (commit `5b1acc9`). Admins can now run the starter-pilot activation end-to-end from the product UI. CT changes: NEW `src/lib/dandelion-activation/types.ts` (`CtActivationResult` discriminated union mirror) + NEW `src/lib/dandelion-activation/labels.ts` (customer-admin vocabulary translation of the 6 catalog audit_literal strings — `DMW_BASELINE_GRANTED` → "Opened the memory baseline" etc. — with safe fallback for unknown literals) + MOD `src/lib/api.ts` (NEW `dandelionActivation.activateStarterPilot()` namespace) + MOD `src/pages/Onboarding.tsx` (NEW `DandelionActivationCard` mounted between DoctrineCard and CatalogCountsCard; click "Activate starter-pilot envelope" button → POST `/api/v1/org/dandelion/activate` → renders the 6-step audit lineage as a timeline with customer-admin labels + archetype + plan_id badges + truncated final activation_audit_event_id) + 26 NEW tests + MOD `tests/unit/onboarding.test.tsx` (renderPage wraps in QueryClientProvider for the new useMutation surface). Closed-vocab failure-code → customer-admin message mapping (`NOT_ADMIN` / `CALLER_ENTITY_NOT_FOUND` / `CALLER_NOT_IN_ORG` / `ARCHETYPE_UNKNOWN` / `CATALOG_NOT_FOUND` / `CATALOG_MALFORMED` / `AUDIT_WRITE_FAILED`). Privacy invariant preserved: no raw `ADMIN_ACTION:` prefix leaks into the rendered output (test-enforced); 15-phrase forbidden UI copy guard exercised across success path. CT test suite 284 → 310 (+26 NEW). D6 starter-pilot is now **OPERATING at Foundation backend tier + admin-visible at CT tier**; final graduation to per-org production deployment is forward-substrate.
