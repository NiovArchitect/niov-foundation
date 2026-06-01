# Connector Implementation-Readiness Catalog

> RULE 21 research-backed static catalog per ADR-0084. Prepares C2+ first-real-connector runtime decisions by capturing the substrate every connector adapter will need: OAuth + scopes + admin consent + read/write surface + webhooks + rate limits + MCP posture + governance + DMW scope + audit + secrets + isolation + scoring.

> Static catalog substrate. Connector activation runtime is C2+ and remains Founder-gated.

## Purpose

Per ADR-0084 §2, every connector requires a per-connector RULE 21 research arc before real adapter implementation. This catalog **is** that research arc for the first five connector candidates from the Wave 6 priority matrix.

Each connector file follows the same shape (`readiness.schema.json`) so the substrate is comparable across vendors. The matrix file ranks them on 13 dimensions with a transparent composite formula.

## Files

| File | Connector | Family |
|---|---|---|
| `readiness.schema.json` | n/a | JSON Schema |
| `slack.json` | Slack | Collaboration |
| `google-workspace.json` | Google Workspace (Gmail / Calendar / Drive / Docs / Sheets / Slides) | Workspace / Knowledge |
| `jira-linear.json` | Jira Cloud + Linear | Project / Engineering (2 items) |
| `microsoft-365.json` | Microsoft 365 (Outlook / Teams / SharePoint / OneDrive via Microsoft Graph) | Workspace / Knowledge + Collaboration |
| `github.json` | GitHub | Project / Engineering |
| `connector-readiness-matrix.json` | All | Cross-family ranking |
| `connector-readiness-matrix.md` | All | Human-readable ranking + recommended slice order |

## Universal item shape

Every connector item carries:

- `id` / `version` / `status` / `object_type` / `connector_name` / `connector_family`
- `source_adr_refs` (must include `ADR-0084`)
- `official_docs_refs` (vendor docs cited verbatim — the substrate-honest research evidence)
- `MCP_posture` — official MCP server availability + substrate-honest evaluation deferral
- `OAuth_model` / `app_installation_model` / `admin_consent_model`
- `read_capabilities` / `write_capabilities` / `webhook_or_event_capabilities` / `risky_write_actions`
- `default_mode: READ_FIRST` (enforced by validator)
- `required_approval_gates` / `dual_control_recommendations`
- `DMW_scope_implications` / `workflow_purpose_bindings`
- `billing_pack_mapping` (links to ADR-0083 Amendment 1 §9.4 connector pack family)
- `Dandelion_map_dependencies` (Tool / Workflow / Authority / Memory / Risk maps)
- `audit_expectations` / `secret_handling_requirements` / `no_leak_rules` / `tenant_isolation_requirements`
- `rate_limit_notes` / `testing_strategy` / `implementation_risks` / `first_slice_recommendation`
- `readiness_scoring` (13-dimension 0-10 numeric)
- `not_implemented_yet: true` (enforced by validator)

## Validation

```sh
node scripts/validate-connector-readiness.mjs
```

The validator enforces:

- JSON parses
- 9 required files exist
- Wrappers exist (`kind` + `catalog_version` + `envelope_defaults` + `items[]`)
- IDs unique
- Every item includes `source_adr_refs` with `ADR-0084`
- Every item has `not_implemented_yet: true`
- Every item has `default_mode: READ_FIRST`
- Every item includes `DMW_scope_implications` (≥ 1)
- Every item includes `no_leak_rules` (≥ 1)
- Every item includes `audit_expectations` (≥ 1)
- Every item includes `billing_pack_mapping`
- Every item includes `Dandelion_map_dependencies` (≥ 1)
- Required connectors present (Slack / Google Workspace / Jira / Linear / Microsoft 365 / GitHub + Matrix)
- Matrix file exists with composite rankings
- 10 forbidden phrases scanned with sentence-level negation + negation-item subtree skip:
  - `connector activated`
  - `permission granted`
  - `unrestricted write access`
  - `auto-approved`
  - `guaranteed compliant`
  - `regulator approved`
  - `no fine risk`
  - `employee score`
  - `manager surveillance`
  - `psychological profile`

## Composite ranking

| Rank | Connector | Composite | First slice |
|---|---|---|---|
| 1 | **Slack** | **8.65** | **C2** |
| 2 | Linear | 7.65 | C4-B |
| 3 | Jira Cloud | 7.55 | C4-A |
| 4 | Google Workspace | 7.50 | C3 |
| 5 | GitHub | 7.40 | C-GitHub |
| 6 | Microsoft 365 | 7.10 | C5 |

Full formula + per-dimension weights at `connector-readiness-matrix.md` + `connector-readiness-matrix.json`.

## Recommended slice order

1. **C2 Slack read-first** — first real connector runtime
2. **GOVSEC.6** — agent abuse / confused-deputy hardening (before or alongside C2)
3. **C3 Google Workspace read-first** — Gmail metadata + Calendar readonly + Drive metadata readonly
4. **C4 Project Tracker** — Jira (C4-A) + Linear (C4-B) coordinated
5. **C-GitHub** — GitHub App read-first
6. **C5 Microsoft 365** — read-first Outlook + Calendar + OneDrive metadata + SharePoint

## Graduation status

- Connectors: `PREVIEW_ONLY` → **`RECOMMENDATION_READY`** (this catalog)
- Next graduation: per-connector → `RUNTIME_READY` at C-slice runtime PR landing
- Final graduation: per-connector → `OPERATING` after first real customer-bound activation

## Status

ACCEPTED 2026-06-01 per `[FOUNDER-POST-B3-AUTONOMOUS-D2-AND-CONNECTOR-READINESS-CONTINUATION-AUTH]`.

This catalog is research substrate. Runtime is C2+ and remains Founder-gated.
