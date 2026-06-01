# ADR-0082 — Dandelion Activation Architecture (Design-Only)

**Status:** Accepted 2026-06-01 · **Amendment 1** Accepted 2026-06-01 (Dandelion-as-organizational-cartographer doctrine + 9 Map Types + allowed/forbidden UI language + Admin Twin cartographer-aware synthesis — see §9)
**Nature:** Design-only. No code. No schema. No migration. No routes. No services. No runtime activation. No Control Tower Dandelion engine. No connector activation. No permission grants from Dandelion outputs. No LLM / Python / BEAM. No new audit literal. **No mutation to existing `apps/api/src/services/governance/dandelion.service.ts`** — that service continues to own org-admin Phase 0/2/3/4 invite/seating substrate exactly as today.
**Founder authorization:** `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 3 (Dandelion activation architecture) + `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]` (the canonical Dandelion-as-org-seeding-intelligence framing) + `[FOUNDER-DANDELION-AS-ORGANIZATIONAL-CARTOGRAPHER-DOCTRINE]` (Amendment 1 cartographer doctrine).
**Parent doctrine:** ADR-0080 (OOTB ontology + Amendment 5 Dandelion-as-org-seeding-intelligence framing) · ADR-0081 (Section 9 Workflows Doctrine — Stage 2 Recommendation-only fires from Dandelion) · ADR-0048 (governed personalization-orchestration) · ADR-0027 (governance + RULE 20) · ADR-0026 (dual-control) · ADR-0070 (regulator-ready Foundation).

---

## 1. Context

ADR-0080 Wave 1 first introduced the broader Founder-Dandelion vision and distinguished it from today's narrower org-admin substrate at `apps/api/src/services/governance/dandelion.service.ts` (Phase 0 atomic createOrg + Phase 2 invite analyze + Phase 3 invite-accept propagation + Phase 4 status). Wave 3 landed the read-only preview of the catalog at CT `/onboarding`. The Founder-Dandelion **activation** path (the broader org-seeding intelligence layer) was forward-substrate.

Under `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]`, the framing is now locked:

> *"Dandelion is not just onboarding; Dandelion is organizational seeding intelligence."*
>
> *"Admins govern the setup. Dandelion guides and accelerates the setup. Foundation authorizes activation. DMWs scope memory."*
>
> *"Dandelion maps the enterprise so Otzar can become useful without forcing the customer to hand-configure everything from zero."*
>
> *"Dandelion produces proposed maps. Foundation turns approved maps into governed capability."*

This ADR locks the **activation architecture**: 6-stage maturity model (Stages A-F), 6-layer org seeding model, confidence labels, governed envelope output discipline, Admin Dandelion path first-class, distinct-and-additive relationship with the existing `dandelion.service.ts`, and the canonical never-actions.

This is the third bounded ADR landing under the Domain General Otzar expansion (Wave 2.1 → ADR-0081 Workflows Doctrine → ADR-0082 Dandelion Activation Architecture).

---

## 2. Decision

Foundation adopts the following Dandelion Activation Architecture.

### 2.1 Six maturity stages

| Stage | Name | Description | Status |
|-------|------|-------------|--------|
| **A** | **Preview** | Read-only browse of the Wave 2 OOTB catalog + Wave 2.1 role-depth + Wave 6 connector-priority matrix at CT `/onboarding`. Substrate-honest depth status (Role Depth Roadmap) visible. **No questions asked. No state stored.** | **LIVE** (Wave 3 + Wave 6 + Wave 2.1) |
| **B** | **Assessment** | Dandelion asks company-level + department-level + user-level questions per the canonical `DandelionFlowTemplate`. Answers stored only if schema / ADR approved. **No recommendations produced; no activation.** | Forward-substrate; this ADR locks the design |
| **C** | **Recommendation** | Dandelion produces **proposed maps** (CompanyDomainModel + DepartmentTemplate + RoleTemplate + ToolProfile + WorkflowTemplate + PermissionBundle + ConnectorPreset + AhaMomentPack + SafeFallbackMode + DigitalTwinStarterProfile + DMW scope recommendation). Suggest-only. Confidence labels attached. **No permissions granted; no connectors activated; no profiles attached.** | Forward-substrate; requires Stage B + separate Founder authorization |
| **D** | **Governance Review** | Admin / user reviews recommendations. Org admin approves / adjusts / rejects per recommendation. Foundation governance evaluates each capability. **No bulk-apply; no auto-activation.** | Forward-substrate; requires Stage C + Section 9 Approvals composition |
| **E** | **Starter Envelope Assembly** | Approved recommendations assemble into a **GovernedStarterEnvelope** per entity (per ADR-0080 Amendment 1 envelope shape): scope_defaults + permission_defaults + provenance + audit_expectations + policy_purpose + allowed_consumers + forbidden_consumers + sensitivity_level + adaptation_rules + override_rules. **The envelope is a governance artifact, not active authority.** | Forward-substrate; requires Stage D + ADR-0080 Amendment 1 substrate |
| **F** | **Activation** | Foundation governance authorizes activation of read / draft / recommend capabilities for the entity's Digital Twin. **Connector writes remain disabled unless separately approved per ADR-0081 Stage 4 governed execution.** | Forward-substrate; requires Stage E + per-capability dual-control where applicable + Section 4 connector substrate ready |

**Default progression**: A (LIVE) → B → C → D → E → F. Each stage requires its own Founder authorization at slice. **Do not jump directly to Stage F.** **Do not implement Stages B-F automatically.**

### 2.2 Six-layer org seeding model

Per `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]`, Dandelion seeds the org in layers. Each layer feeds Stage C recommendations.

| Layer | Name | Inputs | Outputs |
|-------|------|--------|---------|
| **L1** | **Company seed** | Industry · size · compliance · business model · regions · operating cadence · executive team · board cadence · department list · customer type · internal policies · approval philosophy · deployment goals · rollout constraints | CompanyDomainModel draft · CompanyTemplate recommendation · company-level governance gaps · launch-readiness risks · recommended rollout sequence |
| **L2** | **Department seed** | Department names · department heads · common roles · daily tools · recurring workflows · KPIs · approvals · cross-functional dependencies · sensitive data · risks · readiness · first use cases | DepartmentTemplate recommendations · department workflow map · tool map · readiness ranking · DMW scope recommendations |
| **L3** | **Role seed** | Title · actual role · seniority · manager · direct reports · dotted-line relationships · supported executives · collaborators · daily tools · repeated workflows · approval authority · delegated authority · never-touch areas · first-week aha moments | RoleTemplate recommendation · PermissionBundle recommendation · WorkflowTemplate recommendation · AhaMomentPack recommendation · SafeFallbackMode recommendation · DigitalTwinStarterProfile draft |
| **L4** | **Tool / connector seed** | Tools owned · team ownership · administration ownership · data sensitivity · read/write risk · OAuth/security requirements · rollout sequence · safe default mode | ConnectorPreset recommendations · read-first connector plan · write-risk list · connector approval requirements |
| **L5** | **Workflow seed** | Recurring processes · triggers · owners · participants · tools · required approvals · data inputs · safe outputs · escalation paths · audit requirements · automation maturity | WorkflowTemplate recommendations · workflow readiness map · approval-chain gaps · proposed workflow activation plan (feeds ADR-0081 Stage 2 Recommendation-only) |
| **L6** | **Memory / DMW seed** | What memory should be self-scoped · team/hive · project · client/customer · legal/compliance · temporary/delegated · what must never become enterprise intelligence · what can be retained only as safe metadata | DMW scope recommendations · memory policy gaps · starter memory-envelope recommendations |

Layer ordering is canonical: Dandelion seeds Company before Department, Department before Role, Role before Tool/Connector, Tool/Connector before Workflow, Workflow before Memory/DMW. Each layer composes against the layer(s) before it.

### 2.3 Confidence labels (closed-vocab)

Every Stage C recommendation carries one of six confidence labels:

| Label | Meaning |
|-------|---------|
| `HIGH_CONFIDENCE` | Multiple independent inputs converge; Dandelion is confident the recommendation matches the company's actual shape. |
| `MEDIUM_CONFIDENCE` | Some inputs converge; recommendation is plausible but should be reviewed. |
| `LOW_CONFIDENCE` | Limited inputs; recommendation is speculative and exists primarily to elicit confirmation. |
| `REQUIRES_ADMIN_REVIEW` | The recommendation touches sensitive scope (compensation / board / legal / cross-tenant / write-risk connectors). Admin must review explicitly. |
| `REQUIRES_USER_CONFIRMATION` | The recommendation depends on the user confirming an aspect of their role / context Dandelion cannot derive safely. |
| `BLOCKED_BY_POLICY` | The recommendation conflicts with a company policy and cannot proceed without policy update + appropriate approval. |

Confidence labels are **mandatory** on every Stage C output. The Admin Twin (per ADR-0080 Amendment 5) uses them to produce the "Role Fit Review" + "Connector Value/Risk Brief" + "Approval Chain Gap Finder" + "Memory Scope Safety Brief" + "Policy Gap Finder" first-week aha moments.

### 2.4 Governed envelope output discipline

Stage E assembles a `GovernedStarterEnvelope` per entity. The envelope is the *substrate* that Foundation governance authorizes — not the recommendations themselves. Per ADR-0080 Amendment 1, the envelope carries:

| Field | Source |
|-------|--------|
| `envelope_id` | Generated at assembly |
| `envelope_version` | `dandelion-stage-e-v1.0.0` |
| `object_type` | `DigitalTwinStarterProfile` (or `AdminOperatingModel` for the Admin path) |
| `tenant_or_org_scope` | Bound at Stage A; preserved absolute |
| `entity_scope` | The entity the envelope belongs to |
| `role_scope` | Selected RoleTemplate(s) at L3 |
| `department_scope` | Selected DepartmentTemplate at L2 |
| `purpose` | The Founder-doctrine "Otzar is Domain General Intelligence inside governed enterprise boundaries" applied to this entity |
| `policy_purpose` | From the company's policy configuration |
| `lawful_basis_required` | If REGULATOR scope per ADR-0036 |
| `permission_bundle_refs` | Approved at Stage D |
| `delegated_authority_refs` | Approved at Stage D |
| `connector_preset_refs` | Approved at Stage D (read-first by default) |
| `workflow_refs` | Approved at Stage D (Stage 2 Recommendation-only first) |
| `source_template_refs` | Wave 2 `roles.json` IDs + Wave 2.1 role-depth Markdown file paths |
| `provenance` | Dandelion stage lineage (A→B→C→D→E inputs + admin approval timestamps) |
| `approved_by` | Admin entity_id at Stage D |
| `last_reviewed_at` | Stage D approval timestamp |
| `expiration_or_review_window` | Per company policy |
| `sensitivity_level` | Per RoleTemplate.sensitivity_level (LOW / MEDIUM / HIGH / CRITICAL) |
| `retention_class` | Per company policy |
| `audit_requirements` | Existing `ADMIN_ACTION` + `details.action` + `ACTION_*` lineage; **no new audit literal** |
| `no_leak_rules` | Per RoleTemplate.forbidden_inferences + ADR-0078/0079 forbidden categories |
| `allowed_consumers` | Per RoleTemplate.envelope_defaults.allowed_consumers |
| `forbidden_consumers` | Per RoleTemplate.envelope_defaults.forbidden_consumers + universal forbidden (cross-tenant / manager-surveillance / employee-scoring / psychological-profile) |
| `runtime_activation_state` | `NOT_ACTIVATED` until Stage F |
| `human_override_state` | Always `OVERRIDABLE_BY_USER_OR_ADMIN` |
| `governance_status` | `APPROVED_FOR_STAGE_F` once Stage D approves |
| `payload_ref` | Reference to the catalog substrate composing the envelope |

The envelope is canonical at Stage E. Stage F activates the envelope's capabilities under separate Founder authorization.

### 2.5 Admin Dandelion path first-class

Per ADR-0080 Amendment 5 + Founder addendum 2 + addendum 3, the **Otzar Administrator** is a first-class Dandelion participant.

Canonical:

> *"Dandelion should onboard the Otzar Admin before it onboards the company."*

The Admin Dandelion path:

1. **A (preview)**: Admin browses the Wave 2 catalog + Wave 2.1 role-depth (LIVE).
2. **B (assessment)**: Admin answers company-level questions first (industry / size / compliance / identity provider / departments / approval philosophy / etc.). Dandelion produces the **CompanyDomainModel draft** from these answers.
3. **C (recommendation)**: Dandelion recommends the company's first rollout group, the first connectors to enable read-first, the first departments to onboard, the first workflows to surface at Stage 2 Recommendation-only.
4. **D (governance review)**: Admin reviews + adjusts the recommendations. Company-level policies + approval chains configured.
5. **E (starter envelope assembly)**: Admin Operating Model envelope assembled — the Admin's own DGI co-pilot envelope.
6. **F (activation)**: Admin Twin's 16 synthesis workflows (per `docs/ootb-catalog/role-depth/otzar-administrator.md` §16) become available at Stage 2 Recommendation-only — **before** any user-facing workflow.

The Admin Twin's first DGI experience (per Founder addendum 3) requires the Admin path to complete A→F so that the Admin Twin has a CompanyDomainModel to synthesize against. Without the Admin path completing, broad employee Dandelion is premature.

### 2.6 Relationship with existing `dandelion.service.ts`

The existing Foundation `apps/api/src/services/governance/dandelion.service.ts` is the **org-admin invite / seating substrate** (Phase 0 atomic createOrg + Phase 2 invite analyze + Phase 3 invite-accept propagation + Phase 4 status). It is LIVE and continues to own this substrate exactly as today. ADR-0082 does **not**:

- Rename `dandelion.service.ts`.
- Retire `dandelion.service.ts`.
- Replace `dandelion.service.ts`.
- Mutate `dandelion.service.ts` semantics.
- Reroute existing org.routes.ts traffic.

The Dandelion Activation Architecture (Stages B-F) is **additive forward-substrate**. When implementation lands, it will live in a separate service / route / namespace (likely `apps/api/src/services/dandelion-activation/*` and `/api/v1/dandelion/*` routes) and compose against existing Foundation governance + audit + entity / wallet substrate. The boundary is preserved by construction.

Per RULE 13 (surface drifts inline): the naming overlap between today's `dandelion.service.ts` and the future Dandelion-activation substrate is acknowledged here as canonical. Both surfaces are "Dandelion." Today's substrate is the **seating layer**; the future substrate is the **activation intelligence layer**. They coexist; they do not collide.

### 2.7 Canonical "never" actions across all stages

Dandelion at any stage **never**:

- **Grants permissions automatically.** Stage F authorizes capabilities; only Foundation governance grants permission rows.
- **Activates connectors automatically.** Connector writes require ADR-0081 Stage 4 governed execution + per-connector Founder authorization + RULE 21 research arc.
- **Creates `Action` rows automatically.** ADR-0057 Action runtime owns Action creation; Stage F authorizes the Twin to *propose* Actions per ADR-0081 Stage 3.
- **Activates workflows without governance review.** ADR-0081 Stage 2 Recommendation-only is the maximum without Stage D + Stage E.
- **Exposes private memory.** DMW scopes are governance metadata; raw memory content stays in the entity's wallet.
- **Collapses company data boundaries.** Same-org boundary absolute at every stage.
- **Infers sensitive / protected attributes.** Per ADR-0058 + ADR-0079 forbidden categories.
- **Creates psychological profiles.** Forbidden absolute.
- **Produces employee scores.** Forbidden absolute.
- **Builds manager surveillance dashboards.** Forbidden absolute per ADR-0058.
- **Claims regulator approval / guaranteed compliance / no fine risk.** Forbidden per ADR-0070 neutral compliance vocabulary.
- **Discloses to regulators without LawfulBasis.** Forbidden per ADR-0036.

### 2.8 Dandelion → Workflows coupling

Per ADR-0081 §2.8:

- Dandelion's Layer 5 (Workflow seed) produces proposed WorkflowTemplate maps.
- The Admin Twin's "First 7-Day Launch Plan" composes against Dandelion's L5 output + the Wave 6 connector-priority matrix to recommend which workflows to surface at Stage 2 first.
- Stage F activation of a Twin's envelope enables that Twin's workflows at ADR-0081 Stage 2 Recommendation-only by default. Stage 3+ workflow execution requires separate ADR-0081 authorization per workflow risk_level.

### 2.9 Dandelion → DMW coupling

Per `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]` Layer 6:

- Dandelion's L6 (Memory / DMW seed) produces proposed DMW scope recommendations per entity.
- The Admin Twin's "Memory Scope Safety Brief" reviews proposed scopes before Stage D approval.
- Stage E envelope carries the approved DMW scope set.
- Stage F activation respects the envelope's DMW scope; the Twin operates within scoped memory only.
- Forbidden categories absolute at every stage (private personal / family / health / protected-attribute / union / labor-organizing where applicable per ADR-0079 §7).

DMW provisioning is auto-on-entity-creation per Founder direction; the user does not configure crypto / wallet mechanics. Education line preserved verbatim from ADR-0080 Amendment 5: *"Your Memory Wallet is how Otzar remembers safely."*

### 2.10 Dandelion → Section 4 connector coupling

Per ADR-0080 Wave 6 (priority matrix LIVE):

- Dandelion's L4 (Tool / connector seed) consumes the Wave 6 matrix + company tool inventory + connector risk to produce ConnectorPreset recommendations.
- Stage C surfaces the matrix-derived top connectors per role at the company's CompanyDomainModel context (Slack 16 / Google Workspace 13.33 / Project Tracker 12.75 / etc.).
- Stage D admin review configures which connector presets activate at Stage F (read-first only by default).
- Stage 4 (governed execution) of any workflow that uses a connector requires the connector preset to be activated AND the workflow's connector_actions to be approved per Section 4 substrate (forward-substrate; Section 4 first-connector implementation is Founder-gated).

---

## 3. Non-goals

This ADR does **not**:

- Implement any Dandelion runtime (no service, no schema, no routes).
- Mutate `apps/api/src/services/governance/dandelion.service.ts`.
- Build the Control Tower Dandelion engine surface (the read-only `/onboarding` preview at Stage A is already LIVE).
- Grant any permissions from Dandelion outputs.
- Activate any connector from Dandelion outputs.
- Create any Digital Twin profiles in the database.
- Add Foundation API routes.
- Add new audit literals.
- Modify Section 4 connector substrate.
- Modify ADR-0026 dual-control middleware.
- Modify ADR-0057 Action runtime.
- Add LLM / Python / BEAM.
- Choose the first real Section 4 connector.

---

## 4. Implementation ladder

| Slice | Scope | Gating |
|-------|-------|--------|
| **D1** (this ADR) | Activation architecture + 6 stages + 6 layers + confidence labels + envelope shape + Admin-first path + never-actions | This Founder authorization |
| **D2** | Stage B substrate — `DandelionAssessment` Prisma model + assessment service + admin-only routes + CT surface; **store answers only** | Separate Founder authorization at slice |
| **D3** | Stage C substrate — recommendation engine consuming D2 assessments + Wave 2 catalog + Wave 6 matrix + Wave 2.1 role-depth Markdown; confidence labels mandatory; **suggest-only output** | Separate Founder authorization + RULE 21 research arc on recommendation logic |
| **D4** | Stage D substrate — governance review surface; Section 9 Approvals composition; **per-recommendation approve / adjust / reject** | Separate Founder authorization + Section 9 Approvals composition |
| **D5** | Stage E substrate — `GovernedStarterEnvelope` Prisma model + envelope assembly service + envelope versioning + provenance lineage; **envelope is governance artifact only** | Separate Founder authorization + ADR-0080 Amendment 1 substrate runtime |
| **D6** | Stage F substrate — activation engine; per-capability activation per envelope; **connector writes still gated by ADR-0081 Stage 4** | Separate Founder authorization + ADR-0081 Stage 3 minimum + per-connector RULE 21 |
| **D7** | Admin Dandelion path implementation — Admin-first Stage A→F; Admin Twin's 16 synthesis workflows enabled at ADR-0081 Stage 2 Recommendation-only | Separate Founder authorization at slice (after D5 minimum) |
| **D8** | Broad employee Dandelion rollout — per ADR-0081 Stage 2 Recommendation-only at default; Stage 3+ per workflow risk_level under separate authorization | Separate Founder authorization (after D7) |

Each slice is bounded + separately authorized. **Do not implement D2+ automatically.**

---

## 5. Governance posture (universal across stages)

- Read-first connectors absolute until per-write approval chains are configured.
- Dual-control where high-risk per ADR-0026.
- Break-glass time-boxed only per ADR-0050 (never standing).
- Audit every step via existing `ADMIN_ACTION` + `details.action` + `ACTION_*` lineage (NO new audit literal).
- Memory governed by DMW per ADR-0080 envelope discipline.
- ADR-0058 no-manager-surveillance absolute.
- ADR-0070 regulator-ready posture absolute (neutral compliance vocabulary).
- ADR-0036 LawfulBasis required for any regulator-facing recommendation.
- Same-org boundary preserved at every stage.
- Cross-tenant signal leakage forbidden absolute.

---

## 6. CT `/onboarding` page disposition

The CT `/onboarding` page is currently the LIVE Stage A preview surface (Wave 3 LIVE + Wave 6 LIVE).

Forward cadence (Founder-authorized per slice):

- **Stage B ready (D2)**: CT `/onboarding` adds an Admin assessment surface (company-level + department-level + user-level questions per the canonical `DandelionFlowTemplate`). Answers stored; no recommendations rendered.
- **Stage C ready (D3)**: CT `/onboarding` adds a "Recommendations" panel showing proposed maps with confidence labels per layer.
- **Stage D ready (D4)**: CT `/onboarding` adds an "Admin Review" panel composing against Section 9 Approvals.
- **Stage E ready (D5)**: CT `/onboarding` adds a "Starter Envelope Preview" panel showing the assembled `GovernedStarterEnvelope` (read-only).
- **Stage F ready (D6)**: CT `/onboarding` adds an "Activation" panel showing envelope activation state.

The CT `/onboarding` page is **never** an autonomous activation surface — it is the admin's governance + visibility console. The Admin always approves; Foundation always authorizes.

The naming continues to be `/onboarding` for backward compatibility with the Wave 3 preview surface; the doctrine is "Dandelion activation" per Founder addendum 4.

---

## 7. Citations

- **RULE 0** (humans always sovereign)
- **RULE 1** (build forward only — additive to existing `dandelion.service.ts`)
- **RULE 4** (audit before response — every Dandelion stage audited)
- **RULE 9** (modular connections — Dandelion activation is a separate substrate from today's seating substrate)
- **RULE 10** (nothing is ever deleted — Dandelion outputs preserved via append-only history)
- **RULE 13** (surface drifts inline — naming overlap with existing `dandelion.service.ts` acknowledged + canonical)
- **RULE 20** (rule-modification authority)
- **RULE 21** (pre-authorization research arc — D3 recommendation logic requires RULE 21 research)
- **ADR-0001** (three-wallet architecture — Dandelion respects wallet boundaries)
- **ADR-0002** (append-only audit chain)
- **ADR-0024** (pre-commit hook posture — `secret_ref` preserved at any Dandelion-recommended connector binding)
- **ADR-0026** (dual-control middleware — high-risk Dandelion-recommended capabilities reuse `requireDualControl`)
- **ADR-0027** (governance + RULE 20)
- **ADR-0036** (REGULATOR principal + LawfulBasis — regulator-facing recommendations gated)
- **ADR-0048** (governed personalization-orchestration — Stage F adaptation composes against this)
- **ADR-0050** (break-glass time-boxed audit)
- **ADR-0052** (Otzar DGI — Dandelion is the substrate that makes Otzar's Domain General Intelligence company-specific)
- **ADR-0057** (autonomous execution core — Stage F-activated workflows produce Action rows here)
- **ADR-0058** (drift detection — no manager surveillance absolute)
- **ADR-0070** (regulator-ready Foundation doctrine — neutral compliance vocabulary)
- **ADR-0071** (cross-scope verify-chain)
- **ADR-0078** + **ADR-0079** (conversation context substrate / transcript policy — Dandelion never ingests private personal life content)
- **ADR-0080** + **Amendment 1** + **Amendment 5** (OOTB ontology + governed envelope shape + Domain General Otzar product framing + Otzar Administrator first-class + Admin Twin as first DGI champion + Dandelion-as-org-seeding-intelligence framing)
- **ADR-0081** (Section 9 Workflows Doctrine — Stage 2 Recommendation-only fires from Dandelion Stage F activation)
- Patent **US 12,517,919** (COSMP) · **US 12,164,537** + **US 12,399,904** (DMW + Foundation primitives)

---

## 8. Founder authorization

This ADR is authorized under `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` step 3 (Dandelion activation architecture) + `[FOUNDER-DANDELION-AS-ORG-SEEDING-ACTIVATION-INTELLIGENCE-ADDENDUM]` (the canonical Dandelion-as-org-seeding-intelligence framing).

Subsequent slices (D2-D8) require their own Founder authorization at slice. **Do not implement D2+ automatically.**

After this ADR lands, the recommended next autonomous slice is **ADR-0083 Section 8 Billing / Entitlements ADR** (design-only; $250 base + seat add-ons + capability packs + usage add-ons + enterprise tier per Founder Domain General activation expansion).

---

## 9. Amendment 1 — Dandelion-as-Organizational-Cartographer Doctrine (2026-06-01)

**Authority:** `[FOUNDER-DANDELION-AS-ORGANIZATIONAL-CARTOGRAPHER-DOCTRINE]`.

### 9.1 Canonical doctrine (8 lines preserved verbatim)

The Founder loves the framing of Dandelion as a cartographer. The following 8 lines are canonical product doctrine and must be preserved verbatim across this ADR, future Control Tower copy, role-depth Markdown files, future Dandelion runtime documentation, and any external product description that references Dandelion:

1. *"Dandelion is the organizational cartographer for the company's governed intelligence layer."*
2. *"Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Digital Twins operate within the approved terrain."*
3. *"Dandelion does not merely onboard users; Dandelion charts the company's roles, tools, workflows, permissions, memory scopes, and activation paths."*
4. *"Before Otzar can become useful, it needs a map. Dandelion creates the proposed map. Admins validate it. Foundation turns approved map regions into governed capability."*
5. *"The Admin is not manually drawing everything from zero. Dandelion drafts the map. The Admin validates, corrects, approves, or blocks the map."*
6. *"Foundation authorizes capability only inside approved map boundaries."*
7. *"The DMW scopes memory inside the map."*
8. *"Digital Twins operate inside approved terrain."*

The cartographer doctrine is **additive** to and **compatible with** the prior Dandelion framings from §1 + §2 (organizational seeding intelligence + 6-layer org seeding model + 6-stage maturity). Cartography = the unifying metaphor; seeding-and-layers + stages-A-F = the structural mechanics. All prior content remains canonical.

### 9.2 Nine Map Types (canonical)

Dandelion produces proposed maps across **9 canonical map types**. Each map type composes against the 6-layer org-seeding model + the 6-stage maturity model.

| # | Map | Substance |
|---|-----|-----------|
| 1 | **Company Map** | Company profile · business model · industry · company size · regions · compliance posture · operating cadence · executive team · board / governance structure · departments · customer type · rollout constraints |
| 2 | **Org / Relationship Map** | Managers · direct reports · dotted-line relationships · executive support relationships · board / investor relationships · department peers · cross-functional partners · temporary delegates · external collaborators |
| 3 | **Role Map** | Role templates (per ADR-0080 + Wave 2 + Wave 2.1) · role depth · seniority · responsibilities · decisions · meetings · documents · KPIs · common collaborators · first-week aha moments |
| 4 | **Tool Map** | Tools used · teams using each tool · tool owners / admins · data contained · read / write risks · OAuth / security needs · connector priority (per Wave 6 matrix) · safe default mode |
| 5 | **Workflow Map** | Recurring processes (per ADR-0081 Stages 1-5) · triggers · owners · participants · tools · approvals · inputs / outputs · escalation paths · audit requirements · automation maturity |
| 6 | **Authority Map** | Approval chains · delegated authority · proxy actions · dual-control requirements (per ADR-0026) · spend thresholds · connector write gates · workflow approval gates · never-default permissions |
| 7 | **Memory / DMW Map** | Self-scoped memory · team / hive-scoped memory · project-scoped memory · client / customer-scoped memory · legal / compliance-scoped memory · board-scoped memory · temporary / delegated memory · memory that must never become enterprise intelligence · safe metadata retention |
| 8 | **Risk Map** | Blocked areas · uncertain areas · high-risk tools · high-risk workflows · missing approvals · missing policies · overbroad memory scopes · connector risks · compliance-sensitive areas |
| 9 | **Aha Moment Map** | First-week value by role · first department to activate · first workflows to recommend · first connectors to enable read-first (per Wave 6 matrix top 3) · first Admin Twin wins · first executive wins · first IC / general employee wins |

**Map-to-layer correspondence**:

| Map | Primary org-seeding layer (per §2.2) |
|-----|--------------------------------------|
| Company Map | L1 Company seed |
| Org / Relationship Map | L1 Company seed + L2 Department seed + L3 Role seed |
| Role Map | L3 Role seed |
| Tool Map | L4 Tool / connector seed |
| Workflow Map | L5 Workflow seed |
| Authority Map | L3 Role seed + L5 Workflow seed (compose across both) |
| Memory / DMW Map | L6 Memory / DMW seed |
| Risk Map | cross-cuts all 6 layers |
| Aha Moment Map | derived from L3 + L4 + L5 outputs against L1 + L2 context |

### 9.3 Admin Twin cartographer-aware synthesis

The Admin Twin (per ADR-0080 Amendment 5 — first Domain General Intelligence champion) operates as the **cartography reviewer + activation strategist** for the proposed maps. The Admin Twin's 12 first-week aha moments (catalogued in `docs/ootb-catalog/role-depth/otzar-administrator.md` §22) are restated here as cartography-aware capabilities:

The Admin Twin helps the Otzar Administrator answer:

- **What parts of the map are complete?**
- **What parts are missing?** (unmapped areas needing more Dandelion question coverage or admin input)
- **What parts are risky?** (Risk Map regions; high-risk tools / workflows / memory scopes)
- **What requires admin review?** (REQUIRES_ADMIN_REVIEW confidence label per §2.3)
- **What should be activated first?** (Aha Moment Map's first-week value routes)
- **What should stay blocked?** (BLOCKED_BY_POLICY confidence label per §2.3 + Risk Map blocked areas)
- **What memory scopes are too broad?** (Memory / DMW Map overbroad-scope review)
- **What connector regions are safe read-first?** (Tool Map read-first regions × Wave 6 matrix priority)
- **What workflow regions are ready for recommendation-only?** (Workflow Map × ADR-0081 Stage 2 readiness)
- **What capabilities are not ready for activation?** (uncertain regions; missing approvals; missing policies)

These map questions extend the §2.5 Admin Dandelion path (A → F): the Admin acts as the **map validator** + **activation route selector** for the proposed cartography Dandelion delivers.

### 9.4 Allowed UI / product language (cartography vocabulary)

Cartography vocabulary may be used safely and powerfully across Control Tower copy, Dandelion preview surfaces, role-depth documentation, future Dandelion runtime UI, and external product descriptions:

- organizational map · company map
- role map · tool map · workflow map · authority map · memory map · risk map · aha moment map
- activation path · activation route · approved terrain · unmapped area
- needs review · blocked region · safe route · first-value route · rollout route · governed path

### 9.5 Forbidden UI / product language (surveillance framing absolute)

Cartography vocabulary must **never** drift into surveillance framing. The following language is absolute forbidden across every Otzar surface (UI copy, role-depth documentation, internal docs, external product descriptions):

- "monitoring map"
- "employee map" (when used in a surveillance sense)
- "performance map"
- "behavior map"
- "psychological map"
- "manager visibility map"

This forbidden list is enforced at the same tier as ADR-0058 no-manager-surveillance posture + ADR-0079 forbidden personal-categories list. Any future ADR proposing to weaken this list requires Founder authorization per RULE 20.

### 9.6 Maps are proposals, not authority

The cartographer framing reinforces the §2.7 canonical never-actions:

- Maps are **proposed**. Foundation governance authorizes activation per stage.
- Maps are **revisable**. Admins may correct / reject / amend any proposed map region.
- Maps are **bounded**. Dandelion cannot infer outside the 6-layer org seeding model's question scope.
- Maps are **scoped**. Same-org boundary absolute; no cross-tenant cartography.
- Maps are **temporal**. Maps decay over time as company state evolves; periodic re-seeding refreshes the cartography.

Canonical re-statement:
> *"Dandelion produces proposed maps. Foundation turns approved maps into governed capability."*

### 9.7 Workflows + connectors activate only inside approved map regions

Per Founder direction, the cartography doctrine binds workflow + connector activation to map-region approval:

- **Workflows** (per ADR-0081) activate only inside **approved Workflow Map regions** + **approved Authority Map regions** (approval chain present + approved). Uncertain regions require admin review; blocked regions cannot activate.
- **Connectors** (per Section 4 forward-substrate + Wave 6 priority matrix) activate only inside **approved Tool Map regions** + **approved Authority Map regions** (admin policy approval present). Uncertain tools require admin review; blocked tools cannot activate.
- **Memory** (per ADR-0079 + Wave 2.1 DMW notes) operates only inside **approved Memory / DMW Map regions**. Forbidden categories (private personal / family / protected attributes / union / labor organizing where applicable) are absolute outside the map.

This map-region-gated activation discipline is **stronger** than entitlement (per ADR-0083) and **stronger** than billing (per ADR-0083 Amendment 1) — a customer may be entitled to a Connector Pack (billing ✓), the connector preset may exist in the catalog (entitlement ✓), but if the Tool Map's region for that connector is unmapped / uncertain / blocked, **Foundation governance does not authorize activation**.

### 9.8 Future Control Tower cartography surface

Per Founder direction:

- The `/onboarding` route currently hosts the Stage A Dandelion Preview (LIVE per Wave 3 + Wave 6). The route name remains backward-compatible.
- The product surface should mature toward a **Dandelion / Company Map / Activation Map experience** as Stages B–F substrate lands.
- The **Admin Launch Center / Governance Launch Center** (forward-substrate; appears in `docs/ootb-catalog/role-depth/otzar-administrator.md` §16) should show:
  - **Map completeness** (per map type × layer × stage).
  - **Risk regions** (Risk Map highlighting).
  - **Missing policies** (Authority Map gaps).
  - **Missing approvals** (Authority Map approval chain gaps).
  - **Activation routes** (Aha Moment Map ranked safe-first-value paths).
- The CT Dandelion / Cartography surface is **never** an autonomous activation console — it is the admin's governance + visibility console (per §6 disposition).

### 9.9 Cartographer doctrine + 6-stage maturity correspondence

The cartography doctrine maps cleanly onto the §2.1 6-stage maturity model:

| Stage | Cartographic action |
|-------|---------------------|
| A Preview | Browse the canonical 9 Map Types as catalog reference |
| B Assessment | Dandelion **draws proposed maps** from company / department / user answers |
| C Recommendation | Proposed maps include confidence labels per region |
| D Governance Review | Admin **validates / corrects / rejects / amends** each proposed map region |
| E Starter Envelope Assembly | Approved map regions assemble into the `GovernedStarterEnvelope` |
| F Activation | Foundation authorizes capability **only inside approved map boundaries** |

### 9.10 Amendment 1 does NOT change

The following remain locked from base ADR-0082:

- §2.1 the 6 maturity stages (cartography doctrine maps onto stages per §9.9; stages themselves preserved).
- §2.2 the 6-layer org seeding model (maps consume layers per §9.2 correspondence).
- §2.3 confidence labels (closed-vocab preserved; applied per map region).
- §2.4 governed envelope output discipline.
- §2.6 distinction from existing `dandelion.service.ts`.
- §2.7 canonical never-actions (reinforced by §9.6).
- §2.8 – §2.10 Workflows / DMW / Section 4 connector couplings (reinforced by §9.7).
- §3 non-goals (cartography doctrine adds no runtime / schema / route / service).
- §4 8-slice implementation ladder D1–D8.
- §5 governance posture.
- §6 CT `/onboarding` page disposition (extended in §9.8).
- §7 citations.
- §8 Founder authorization (extended; not replaced).

### 9.11 Wave 2.1 role-depth touch-ups (companion edits)

Companion edits in this PR add a "Dandelion Map Implications" subsection to 7 key Wave 2.1 role-depth Markdown files where the cartography doctrine is most operationally load-bearing:

- `docs/ootb-catalog/role-depth/otzar-administrator.md`
- `docs/ootb-catalog/role-depth/ceo-founder.md`
- `docs/ootb-catalog/role-depth/cto.md`
- `docs/ootb-catalog/role-depth/product-owner-product-manager.md`
- `docs/ootb-catalog/role-depth/chro.md`
- `docs/ootb-catalog/role-depth/general-counsel.md`
- `docs/ootb-catalog/role-depth/general-employee-individual-contributor.md`

Each touch-up names the role's specific cartography responsibilities (validator / consumer / mapped subject / authority approver / risk reviewer / map-region owner / etc.) as appropriate. Other Wave 2.1 role-depth files remain unchanged at this PR; future PRs may extend the touch-ups across additional roles if the doctrine surfaces specific implications.

### 9.12 Forward substrate (queued)

After Amendment 1 lands, the cartography doctrine is canonical across:

- Future Dandelion Activation slices D2–D8 (per §4).
- Future Control Tower Dandelion / Cartography surface evolution (per §9.8).
- Future Workflows runtime (per §9.7 + ADR-0081).
- Future Section 4 connector implementation (per §9.7 + Wave 6 matrix).
- Future DMW runtime (per §9.7 + ADR-0079).

Per the Founder resume directive, the recommended **next autonomous slice** after Amendment 1 lands is **ADR-0084 Section 4 MCP / Connector Strategy** (design-only; broader plan covering Slack + Google Workspace + Project Tracker + Gmail / Outlook + GitHub + Salesforce / HubSpot + Travel / Expense per Wave 6 matrix; per-connector RULE 21 research arc gating).

### D3 — Stage C Recommendation Substrate LANDED 2026-06-01

Per `[FOUNDATION-D3-DANDELION-RECOMMENDATION]`. NEW `docs/dandelion-recommendation/` directory (11 files): README + JSON Schema + 9 MapRecommendation files (Company / Org-Relationship / Role / Tool / Workflow / Authority / Memory-DMW / Risk / Aha Moment). NEW `scripts/validate-dandelion-recommendation.mjs` validator (pure Node ESM; mirrors `validate-dandelion-assessment.mjs` sentence-level negation + subtree skip; adds D2 cross-reference check). Validator green: 11/11 files, 9 items, 9/9 map types, **9 D2 assessment IDs cross-referenced** (every recommendation's `consumes_assessment_id` resolves to a real assessment at `docs/dandelion-assessment/`).

Every recommendation carries: `consumes_assessment_id` (cross-ref to D2) + `ranked_regions` (3-5 regions per map with `region_id` + `region_label` + `rank` + `confidence_label` + `rationale_summary`) + `rationale` + `cross_map_dependencies` + `approval_gate_required` + `confidence_label` (6-enum mirrors D2) + `DMW_scope_implications` + `governance_review_points` + `recommendation_state: PROPOSED_NOT_APPROVED` (enforced).

**Notable cross-D3-to-runtime composition:** Tool Map Recommendation ranks Slack **HIGH_CONFIDENCE** because the C2 Slack read-first runtime is LIVE (PR #185). Aha Moment Map Recommendation elevates Slack catch-up summaries to **HIGH_CONFIDENCE** for the same reason. All other connector aha moments remain at `RECOMMENDATION_READY` confidence until their respective C-slice runtimes land. Risk Map Recommendation ranks Map-blocking risks first because they gate downstream activation regardless of plan tier.

NO runtime activation, NO admin approval, NO Twin activation, NO permission grants, NO connector authorizations, NO workflow starts, NO mutation to `apps/api/src/services/governance/dandelion.service.ts`, NO runtime DMW behavior, NO new audit literal.

**Dandelion graduation:** Stage A Preview LIVE + Stage B Assessment `ASSESSMENT_READY` (D2) → **Stage C Recommendation `RECOMMENDATION_READY`** (this D3 PR). D4 Governance Review + D5 Starter Envelope Assembly + D6 Activation forward-substrate.

### D2 — Stage B Assessment Substrate LANDED 2026-06-01

Per `[FOUNDER-POST-B3-AUTONOMOUS-D2-AND-CONNECTOR-READINESS-CONTINUATION-AUTH]`. NEW `docs/dandelion-assessment/` directory (11 files): README + JSON Schema + 9 MapAssessment files (Company / Org-Relationship / Role / Tool / Workflow / Authority / Memory-DMW / Risk / Aha Moment) + NEW `scripts/validate-dandelion-assessment.mjs` validator (pure Node ESM; mirrors `validate-entitlement-catalog.mjs` with sentence-level negation + negation-item subtree skip). Every assessment item carries `activation_state: NOT_ACTIVATED` + required questions + optional questions + admin questions + user questions + evidence sources + confidence labels (6-enum) + output candidates + governance review points + safe defaults + forbidden defaults + DMW scope implications + audit expectations. Canonical doctrine preserved verbatim ("Dandelion maps the territory. Admins approve the map. Foundation governs what can happen inside the map. DMWs scope what can be remembered. Digital Twins operate within the approved terrain."). Composes against existing OOTB catalog + Wave 2.1 role-depth + Wave 6 connector-priority matrix as evidence sources. Validator green: 11/11 files, 9 items, 9/9 map types, 0 errors. NO runtime activation, NO user activation, NO Twin activation, NO permission grants, NO connector authorizations, NO workflow starts, NO Action rows, NO mutation to `apps/api/src/services/governance/dandelion.service.ts`, NO runtime DMW behavior, NO new audit literal, NO BEAM / Python / Elixir. D2 closes Stage A → Stage B transition at the **assessment substrate register**; D3 Recommendation → D6 Activation forward-substrate Founder-decision-gated. NEW `docs/current-build-state/dandelion-activation.md` build-state.
