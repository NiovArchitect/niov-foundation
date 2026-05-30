# Section 9 — Admin / Governance Control Tower

> Detailed canonical record for production Section 9. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

The operator + admin + executive surface for the governed
autonomous enterprise. Otzar Control Tower per ADR-0052 doctrine:
governance / executive clarity layer with AI-generated
what-happened / why / needs-approval / risk / recommended-action
summaries from permissioned operational signals — NOT a classic
admin dashboard, NOT raw-data access. Surfaces escalation queue,
Action Inbox + Detail drawer, ActionPolicy editor, audit viewer
windowing, break-glass grant management, regulator access
window, billing snapshot.

## Current status

**Backend substrate substantively complete for the surfaces a
Control Tower v1 frontend would consume.** Foundation exposes
the read/write contracts; the `otzar-control-tower` sibling repo
holds the frontend; the Control Tower frontend is forward-substrate
from this Foundation repo's perspective. AI-generated executive
summary projections per ADR-0052 doctrine remain forward-substrate
behind a Founder product decision (which summaries; how scoped).

## What is live (backend contracts CT will consume)

### Otzar surface (Sections 1 + 2)

- Otzar `conductSession` transparency surface per ADR-0051
  (context_used / tokens_consumed / response /
  conversation_id baseline + optional `transparency` +
  `context_provenance` fields).
- **Otzar Wave 2A self-scoped twin role-scope profile route**
  per ADR-0053 — `GET /api/v1/otzar/my-twin` LIVE on main
  per commit `3bb773d` (2026-05-27).
- **Otzar Wave 2B conversation look-back detail endpoint**
  per ADR-0054 — `GET /api/v1/otzar/conversations/:id` LIVE
  on main per commit `1ffa01d` (2026-05-27).
- **Otzar Wave 2C correction-conversation linkage** per
  ADR-0055 — `GET /api/v1/otzar/conversations/:id/corrections`
  LIVE on main per commit `c56bd57` (2026-05-28).

### Action runtime (Section 2)

- Org ActionPolicy admin: `GET /api/v1/org/action-policies` +
  `PUT /api/v1/org/action-policies` (dual-control gated;
  `ACTION_POLICY_UPDATE` emitter).
- Action Inbox backbone: `GET /api/v1/actions` (self-scope
  default; `?org_scope=true` admin).
- Action Detail backbone: `GET /api/v1/actions/:id` (safe view
  + `attempt_count` + `last_result_summary`).
- Action create: `POST /api/v1/actions`.
- Action cancel (non-RUNNING): `POST
  /api/v1/actions/:id/cancel`.
- Internal notification inbox: 3 routes per Section 2 Wave 12.

### Audit viewer (Section 7 — production-grade complete)

- Unified self / org-admin / niov-admin audit-events viewer:
  `GET /api/v1/audit/events[?scope=self|org|platform]`,
  `GET /api/v1/audit/events/:id[?scope=self|org|platform]`.
- Bounded NDJSON + CSV export: `GET
  /api/v1/audit/events/export[?scope=...&format=ndjson|csv&max_rows=...]`
  with hard cap `EXPORT_AUDIT_EVENTS_MAX_ROWS=10000` +
  optional smaller operator-controlled `max_rows`; CSV format
  added at Hardening Wave A per RFC 4180.
- Regulator-tier audit access:
  `GET /api/v1/audit/events/regulator-view?lawful_basis_id=...`
  via ADR-0036 LawfulBasis 9-condition enforcement.
- Self-only chain verification: `GET
  /api/v1/audit/verify-chain`.

### Connectors / external adapters (Section 4 — production-grade complete)

- `ConnectorBinding` admin: 5 routes on
  `/api/v1/org/connectors[/:id]` all `can_admin_org`-gated
  + scoped to caller's org. Register / list / single-view /
  patch (config + enable / disable) / soft-delete. 5
  `ADMIN_ACTION` `details.action` discriminators
  (CONNECTOR_REGISTERED / CONFIG_UPDATED / DISABLED /
  REENABLED / SOFT_DELETED).
- `INVOKE_CONNECTOR` ActionType (rides full Action runtime
  lifecycle; LOW risk_tier).
- `OutboundWebhookProvider` real adapter (HTTPS POST + HMAC-SHA-256
  signing).
- `NotificationService` external fan-out hook (opt-in per
  binding via `config.notification_classes`; commit-then-hook
  order; metadata-only ping).
- Inbound HMAC verification helper (Hardening Wave B) for
  any future inbound-webhook route.

### Governance / regulator / break-glass (Sections 7 + 10)

- Break-glass grant substrate per ADR-0050 + GOVSEC.5 BG.1 / BG.2.
- Regulator access window per ADR-0036 + CAR Sub-box 3.
- Escalation routes (`/api/v1/escalations/*`) for dual-control
  approvals.

## What is not live

- Control Tower frontend UX (lives in
  [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower)
  sibling repo; Vite + React).
- Action runtime UX surfaces (Inbox, Detail drawer,
  ActionPolicy editor).
- Audit viewer UX.
- Break-glass management UX.
- Regulator access UX.
- Connector admin UX (for the Section 4 `/api/v1/org/connectors`
  surface).
- AI-generated executive summaries surface per ADR-0052
  doctrine (what-happened / why / needs-approval / risk /
  recommended-action projections) — needs Founder product
  decision on which summaries to ship + how to scope.

## RULE 13 disclosures specific to Section 9

- Control Tower MUST NOT bypass the safe-view / no-leak
  contracts the Foundation routes enforce. Every CT surface
  consumes the SAFE projection the Foundation produces.
- CT executives MUST NOT see raw unpermitted employee data per
  ADR-0052 doctrine. CT summaries are AI-generated projections,
  not raw access.
- "Otzar does not watch employees to judge them" per ADR-0052;
  CT surveillance framing is forbidden by doctrine.

## Next slices

- **Foundation-side: AI-generated executive summary projections**
  per ADR-0052 doctrine. Each summary class
  (what-happened / why / needs-approval / risk /
  recommended-action) needs a Founder product decision on
  scope + data sources before implementation. RULE 20-gated.
- **Frontend-side (in sibling repo):** consumers for the now-live
  Section 4 connector admin surface; Section 7 CSV export
  download trigger; Otzar Wave 2A/B/C UI integration.

## Substrate-honest correction (2026-05-30)

Prior versions of this file claimed Otzar Wave 2A/B/C were
"design accepted; code forward-substrate." That was canonical
truth drift — the code had landed on main at commits
`3bb773d` / `1ffa01d` / `c56bd57` between 2026-05-27 and
2026-05-28 with full test coverage. Section 1 line 113–116
already carried this correction; Section 9 hadn't yet been
refreshed. This Hardening Wave C refresh restores
substrate-honesty per RULE 13 + adds the Section 4 + Section 7
backend contracts that Control Tower will consume in
subsequent frontend slices.

## Risks / forward-substrate

- CT UX surfaces must land sequentially, not in a big-bang —
  each surface consumes a Foundation contract that must be
  fully tested + locked first.
- Cross-repo discipline per `docs/contributing/codex-vs-claude-code.md`:
  Foundation extensions land FIRST as `[SECTION-XX-FOUNDATION]`
  commits with own tests; the frontend consumes the contract
  in a SECOND commit in the sibling repo.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
