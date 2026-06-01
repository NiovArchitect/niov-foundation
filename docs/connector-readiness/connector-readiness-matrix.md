# Connector Implementation-Readiness Matrix

> Static catalog substrate per ADR-0084. RULE 21 research arc captured at 2026-06-01. Suggest-only — first real connector decision (C2) remains Founder-gated.

## Composite ranking

| Rank | Connector | Composite | First slice | Notes |
|---|---|---|---|---|
| 1 | **Slack** | **8.65** | C2 | First real connector candidate per ADR-0084 + Wave 6 matrix (16.00) |
| 2 | Linear | 7.65 | C4-B | Strong second-tier read-first candidate; MCP fit + lower OAuth complexity |
| 3 | Jira Cloud | 7.55 | C4-A | Project / Engineering pack anchor; coordinate with Linear |
| 4 | Google Workspace | 7.50 | C3 | High read value but high admin complexity; pair DWD review with activation |
| 5 | GitHub | 7.40 | C-GitHub | Strong auditability + MCP fit; production-effect write risk requires late-C-slice + dual-control |
| 6 | Microsoft 365 | 7.10 | C5 | Highest enterprise admin complexity + write risk; defer until after Google Workspace + Slack established |

## Scoring dimensions (per `readiness.schema.json#ReadinessScoring`)

13 numeric dimensions on a 0-10 scale per connector:

- `first_week_aha_value` — likelihood of delivering first-week aha across the largest role set
- `API_maturity` — vendor API stability + documentation + SDK ecosystem
- `OAuth_complexity` — onboarding friction (lower is better in composite; inverted)
- `read_value` — depth of read-side intelligence the connector unlocks
- `write_risk` — production-effect / irreversibility / data-egress risk (lower is better; inverted)
- `event_webhook_value` — event-driven freshness via webhooks
- `enterprise_admin_complexity` — admin consent / org-install onboarding friction (lower is better; inverted)
- `data_sensitivity` — PII / regulated-data exposure (lower is better; inverted)
- `MCP_fit` — Model Context Protocol vendor support + adapter feasibility
- `implementation_complexity` — engineering effort to ship governed read-first (lower is better; inverted)
- `auditability` — vendor surface for audit / event lineage / per-action attribution
- `DMW_scope_complexity` — number of distinct DMW scope categories the connector touches (lower is better; inverted)
- `workflow_binding_value` — depth of ADR-0081 workflow-purpose binding opportunities

## Composite formula

```
Composite = (first_week_aha_value      * 0.18)
          + (API_maturity              * 0.14)
          + (read_value                * 0.14)
          + (workflow_binding_value    * 0.13)
          + (event_webhook_value       * 0.09)
          + (auditability              * 0.09)
          + (MCP_fit                   * 0.06)
          + ((10 - OAuth_complexity)            * 0.05)
          + ((10 - write_risk)                  * 0.04)
          + ((10 - enterprise_admin_complexity) * 0.03)
          + ((10 - data_sensitivity)            * 0.02)
          + ((10 - implementation_complexity)   * 0.02)
          + ((10 - DMW_scope_complexity)        * 0.01)
```

Weights bias toward read-first first-week value + auditability while penalizing implementation friction. Weights sum to 1.00.

## Recommended slice order

1. **C2 Slack read-first** — start here. Highest first-week aha across most role sets; strong API maturity; reasonable OAuth complexity; established Wave 6 matrix anchor.
2. **GOVSEC.6 — Agent abuse / confused-deputy hardening** — recommended before or alongside C2 to reduce risk surface as the first real connector lands.
3. **C3 Google Workspace read-first** — pair domain-wide-delegation governance review with activation; Gmail metadata + Calendar readonly + Drive metadata readonly initially.
4. **C4 Project Tracker** — coordinate C4-A (Jira) + C4-B (Linear) under Project / Engineering pack. Evaluate Linear MCP server before direct GraphQL.
5. **C-GitHub** — GitHub App pattern with read-first installation; strong webhook + audit substrate. Production-effect writes deferred to late-C-slice.
6. **C5 Microsoft 365** — read-first Outlook + Calendar + OneDrive metadata + SharePoint. Teams admin-consent-heavy; defer to C5.5.

## Substrate-honest disclaimer

This matrix reflects RULE 21 research captured at 2026-06-01. Vendor APIs evolve (Slack classic-apps deprecation Nov 2026; Atlassian points-based rate limits enforcement March 2026; etc.). Re-validate per-connector readiness at each C-slice pre-flight. Suggest-only — Foundation governance, map-region approval, and per-call governance still authorize every activation. C2 first real connector remains Founder-gated.
