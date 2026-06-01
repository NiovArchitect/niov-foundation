# NIOV Foundation — Out-of-the-Box (OOTB) Static Seed Catalog

> **ADR-0080 Wave 2 — static seed catalog.** This directory holds versioned
> JSON catalog data that makes the ADR-0080 ontology concrete enough for
> Wave 3 (Control Tower / Dandelion preview) and beyond to consume without
> guessing.

**Founder doctrine — preserved verbatim:**

> **Dandelion suggests the starter shape; Foundation governance authorizes what may actually run.**

> *Templates describe useful defaults. Governed envelopes define how those defaults may be used.*

> *File format is an implementation detail. Scoped authorization, provenance, permissions, auditability, and context boundaries are the real substrate.*

> *For AI agents, the unit of value is not a JSON object. It is a governed context/transaction envelope that carries identity, scope, purpose, permissions, provenance, policy, and audit obligations.*

> *Dandelion does not activate raw templates. Dandelion assembles governed starter envelopes for Foundation governance to authorize.*

---

## What this directory is

A **static, version-controlled** catalog of:

| File | Kind | Items |
|------|------|-------|
| `catalog.schema.json` | JSON Schema | universal envelope + closed-vocab enums |
| `roles.json` | RoleTemplate | 15 (EA deepest worked example) |
| `departments.json` | DepartmentTemplate | 10 |
| `company-variants.json` | CompanyTemplate | 10 industry + 5 size variants |
| `tools.json` | ToolProfile | ~95 enterprise tools across 14 categories |
| `workflows.json` | WorkflowTemplate | 30 high-value workflows |
| `connector-presets.json` | ConnectorPreset | 14 read-first presets |
| `dandelion-flow-templates.json` | DandelionFlowTemplate | 1 canonical three-tier activation flow |

The validator (`scripts/validate-ootb-catalog.mjs`) enforces parse + uniqueness + cross-references + envelope-metadata completeness + forbidden-phrase scan + canonical-line presence.

---

## What this directory is NOT

- **NOT runtime data.** These files are never read by `apps/api/` at runtime in Wave 2. No schema migration, no Prisma seed, no service consumes them.
- **NOT permissions.** A catalog entry is template metadata. Permissions live in Foundation's existing `Permission` / `TARCapabilities` / `ActionPolicy` substrate, gated by Foundation governance.
- **NOT a Section 4 connector adapter.** `ConnectorPreset` entries describe what a future adapter would do; they do not connect anything.
- **NOT a Dandelion implementation.** Today's `apps/api/src/services/governance/dandelion.service.ts` (org-admin Phase 0/2/3/4 invite/seating) is untouched. The Founder-Dandelion activation layer is forward-substrate (Waves 3–8 of the ADR-0080 implementation ladder).
- **NOT runtime instructions for an agent.** A Twin must never treat catalog entries as authoritative permission. Always defer to Foundation governance.

---

## Format choice: JSON

JSON is the catalog interchange format. Rationale:

1. Deterministic parse + diff for substrate review.
2. Schema-validatable without dependencies (pure Node ESM validator).
3. Existing repo convention (no YAML in `docs/`; `package.json` and config files are JSON).
4. Future-friendly: every catalog object includes governed envelope metadata so future runtime activation does not require redesign.

**JSON is fine for machines. YAML/Markdown is often better for model cognition. Protobuf/Arrow are better for scale.** But for AI agents, the real leap is not a new file format — it is a governed transaction/context envelope. The catalog's `description`, `human_readable_summary`, and `model_usage_notes` fields hold Markdown-style strings where model-readable explanation matters.

---

## Governed context envelope doctrine

Per Founder authorization `[FOUNDER-ADR-0080-WAVE-2-ADDENDUM-GOVERNED-CONTEXT-TRANSACTION-ENVELOPE]`, every catalog file carries a top-level `envelope_defaults` block. The block stamps each item in the file with envelope metadata:

```json
"envelope_defaults": {
  "object_type": "<kind>",
  "human_readable_summary": "<model-readable summary>",
  "model_usage_notes": "<usage constraints for agents>",
  "scope_defaults": ["TENANT_SCOPED", "..."],
  "permission_defaults": ["READ_FIRST", "..."],
  "provenance": { "authored_by": "...", "source": "...", "version_tag": "...", "captured_at": "...", "authority": "..." },
  "audit_expectations": ["..."],
  "policy_purpose": "CATALOG_REFERENCE_ONLY",
  "allowed_consumers": ["DANDELION_SUGGESTION_ENGINE", "..."],
  "forbidden_consumers": ["AGENT_TWIN_CROSS_TENANT", "..."],
  "sensitivity_level": "MEDIUM",
  "adaptation_rules": "...",
  "override_rules": "..."
}
```

Per-item overrides take precedence when present. The Founder addendum explicitly permits file-level placement for compactness.

**Universal per-item requirements** (validator-enforced):
- `id` (kebab-dotted-v<n> form), `version`, `status` (ACCEPTED / PROPOSED / DEPRECATED)
- `name`, `description`
- `governance_notes`
- `safe_defaults`, `forbidden_defaults`
- `source_adr_refs` (must include `ADR-0080`)

**Closed-vocab strings** (in `catalog.schema.json`):
`StatusEnum`, `RiskLevelEnum`, `AutomationLevelEnum`, `ApprovalRequirementEnum`, `DefaultPermissionStateEnum`, `ConnectorPriorityTierEnum`, `SensitivityLevelEnum`, `CompanySizeVariantEnum`, `IndustryVariantEnum`, `RelationshipTypeEnum`.

---

## Future governed context envelope

The Wave 2 catalog is the seed. At runtime (Waves 4–8) Dandelion will assemble a richer **GovernedContextEnvelope** per Digital Twin. The conceptual future shape:

```
GovernedContextEnvelope:
  envelope_id
  envelope_version
  object_type
  object_id
  object_version
  tenant_or_org_scope
  entity_scope
  department_scope
  role_scope
  purpose
  policy_purpose
  lawful_basis_required
  permission_bundle_refs
  delegated_authority_refs
  connector_preset_refs
  workflow_refs
  source_template_refs
  provenance
  created_by
  approved_by
  last_reviewed_at
  expiration_or_review_window
  sensitivity_level
  retention_class
  audit_requirements
  no_leak_rules
  allowed_consumers
  forbidden_consumers
  runtime_activation_state
  human_override_state
  governance_status
  payload_ref
```

The **payload** may be JSON, YAML, Markdown, Protobuf, Arrow, a database row, or another representation. The envelope is what governs agent use.

**A connector preset is never just "the Slack connector."** It is "Slack read-first connector preset for a scoped role/workflow, under a permission bundle, with safe read surfaces, disabled write actions, audit expectations, and explicit activation requirements." For example, EA + Slack at runtime means: read executive-related scheduling channels when scoped; draft coordination messages; do not send on behalf of the executive unless delegated; do not read private/personal channels; do not infer private family/personal matters; audit message-draft actions; write actions disabled until delegated authority exists.

---

## How the catalog maps to ADR-0080

- **§5** (Core object model) → 16 design objects; this catalog instantiates the first round of 8.
- **§6** (Role taxonomy) → `roles.json` covers the bounded reference set; EA is deepest.
- **§7** (Tool taxonomy) → `tools.json` covers the discovery surface.
- **§8** (EA worked example) → `roles.json[role.executive-assistant.v1]` is the deepest expansion.
- **§9** (Three-tier Dandelion flow) → `dandelion-flow-templates.json[dandelionFlow.company-department-user-activation.v1]`.
- **§10** (Connector prioritization model) → `connector-presets.json` + `DandelionFlowTemplate.connector_recommendation_logic` + per-tool `connector_priority_tier`.
- **§11** (Governance and safety) → `envelope_defaults` + `governance_notes` + `forbidden_defaults` + `forbidden_inferences` on every item.
- **§13** (Implementation ladder) → this is Wave 2; Waves 3–8 require separate Founder authorization.

---

## How Wave 3 (Control Tower / Dandelion preview) will consume this

Wave 3 lands a **read-only** CT preview that visualizes:
- `roles.json` (browse + filter by department / family / seniority);
- `departments.json` (department-shaped operating model);
- `tools.json` (tool catalog filtered by company-stack answers);
- `workflows.json` (per-role workflow recommendations);
- `connector-presets.json` (per-role read-first recommendation list);
- `dandelion-flow-templates.json` (the three-tier flow as a stepped UI).

CT consumes these via static fetch (read at build time or via a future `GET /api/v1/ootb-catalog/*` read-only route). **No permission grants. No connector enablement. Only display.**

Wave 4 wires Dandelion answers → template selection (suggest-only). Wave 5 attaches a `DigitalTwinStarterProfile` to an AI_AGENT entity (still suggest-only at the permission tier). Wave 6 outputs the connector-priority matrix. Wave 7 selects + implements the first real Section 4 connector (with RULE 21 research arc). Wave 8 turns on governed adaptation per ADR-0048.

Each wave requires its own Founder authorization at slice.

---

## Governance posture (universal)

Every catalog object preserves:

1. **Templates are defaults, not identity claims.**
2. **Dandelion suggestions are not permissions.**
3. **Foundation governance authorizes.**
4. **No sensitive/protected-attribute inference.**
5. **No employee scoring.**
6. **No manager surveillance** (per ADR-0058).
7. **No unapproved write actions** (per ADR-0026 dual-control).
8. **Read-only first for sensitive systems.**
9. **Delegated authority must be explicit** (per `DelegatedAuthorityProfile`).
10. **Dual-control where needed** (per ADR-0026 + ADR-0050 break-glass for time-boxed emergency).
11. **All connector actions audited** (per RULE 4 + existing `ADMIN_ACTION` + `INVOKE_CONNECTOR` lineage; **no new audit literal in Wave 2**).
12. **User and admin correction allowed at any time.**
13. **Companies can disable templates.**
14. **Templates adapt through governed signals** (per ADR-0048), not private personal profiling.
15. **Regulator-ready posture preserved** (per ADR-0070): neutral compliance vocabulary; no "best practice learned" / "AI fixed itself" / "regulator approved" / "compliance certified" claims.

The validator scans every file for forbidden phrases (`employee score`, `manager surveillance`, `psychological profile`, `guaranteed compliant`, `regulator approved`, `no fine risk`, `auto-approved`, `full inbox access by default`, `unrestricted write access`). Any match fails the build.

---

## Validation

Run:

```sh
node scripts/validate-ootb-catalog.mjs
```

The validator (pure Node ESM; no dependencies; not added to `package.json` scripts per Founder authorization on CI-churn risk):

1. Verifies all required files exist.
2. Parses each JSON.
3. Validates envelope structure (`kind` + `catalog_version` + `envelope_defaults` + `items`).
4. Validates `envelope_defaults` carries all 13 governed-envelope fields.
5. Validates every item has the universal required fields.
6. Validates every `id` matches the canonical pattern and is globally unique.
7. Validates every `source_adr_refs` includes `ADR-0080`.
8. Validates cross-references (`RoleTemplate.default_tool_profile_ids` → existing `tool.*`, etc.).
9. Validates `WorkflowTemplate.triggering_roles` / `participating_roles` resolve.
10. Validates `ConnectorPreset.tool_profile_ids` / `role_templates_enabled_by_default` resolve.
11. Validates `DepartmentTemplate.common_roles` / `shared_tools` / `shared_workflows` resolve.
12. Validates the Executive Assistant template includes `tool.sap-concur.v1`, `workflow.travel-booking-expense-shell.v1`, and the **Travel Booking + Expense Shell** AhaMoment (Founder doctrine).
13. Validates the canonical `DandelionFlowTemplate` is present.
14. Scans every file for forbidden phrases.
15. Verifies this README contains the canonical line **"Dandelion suggests the starter shape; Foundation governance authorizes what may actually run."**

Exit 0 on success, exit 1 on any error.

---

## Maintenance discipline

- IDs are **stable**. Never reuse an ID for a different object.
- Bump `version` (and the `.v<n>` suffix in `id`) when an item's semantics change incompatibly. Add a new entry with the higher `.v<n>` and set the old one's `status` to `DEPRECATED`.
- `catalog_version` is semver at the file level.
- Cross-references must always resolve to an `ACCEPTED` or `PROPOSED` item; references to `DEPRECATED` items fail validation (future enhancement).
- Adding a new object kind requires updating `catalog.schema.json` `kind` enum and (if applicable) `EnvelopeDefaults`.
- `RULE 20`: only the Founder authorizes amendments to ADR-0080 or to the catalog's governance posture.

---

## Related

- **ADR-0080** at `docs/architecture/decisions/0080-out-of-the-box-role-tool-workflow-connector-dandelion-ontology.md` (parent ontology).
- **ADR-0048** (governed personalization-orchestration substrate) — runtime engine future Wave 8 builds on.
- **ADR-0058** (drift detection, no manager surveillance).
- **ADR-0070** (regulator-ready Foundation doctrine; neutral compliance vocabulary).
- **ADR-0027** (governance + RULE 20 contributor governance).
- **ADR-0026** (dual-control middleware).
- **ADR-0050** (break-glass time-boxed audit).
- **ADR-0057** (autonomous execution core; Action runtime workflows compose against).
- **ADR-0071** (cross-scope audit verify-chain).
- **ADR-0079** (transcript substrate policy; workflows referencing meeting context defer here).
- **Section 10 production-readiness audit** at `docs/current-build-state/10-deployment-security-go-live-operations.md`.
