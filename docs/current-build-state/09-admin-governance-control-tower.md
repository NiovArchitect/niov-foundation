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

## CT consumer LIVE 2026-06-01 (Section 9 Approvals + Policies)

**Two Control Tower consumer slices LANDED 2026-06-01**
retiring 2 of 3 Section 9 CT Placeholders by wiring the
Foundation governance substrate that has been LIVE since
ADR-0026 dual-control + ADR-0050 break-glass + ADR-0061
ComplianceService.

CT Approvals page (PR
[#16](https://github.com/NiovArchitect/otzar-control-tower/pull/16)
`e3d2621`): retires the long-standing `/approvals` (org-admin
Control Tower) Placeholder. Consumes the existing
`/api/v1/escalations/*` substrate verbatim:
- `GET /api/v1/escalations/pending` — caller's own pending
  dual-control queue
- `GET /api/v1/escalations/:id` — single-detail with safe
  metadata
- `POST /api/v1/escalations/:id/approve` — two-step confirm
  + Foundation enforces two-person rule (403
  ESCALATION_FORBIDDEN when caller === source)
- `POST /api/v1/escalations/:id/reject` — same gate

UI surface: two-column layout (list card + detail panel);
closed-vocab escalation_type + severity + status badges;
two-step confirm dialog (Cancel never dispatches; Confirm
fires via useMutation + invalidates pending list); two-person
rule UI mirror — when caller_entity_id === source_entity_id,
"You sourced this request" block renders + Approve/Deny
buttons disabled. Foundation's two-person rule is the
security boundary; CT mirror is UX only. `resolution_metadata`
opaque Json field NEVER rendered raw (no-leak guard asserts).

CT Policies page (PR
[#17](https://github.com/NiovArchitect/otzar-control-tower/pull/17)
`f4c24dd`): retires the long-standing `/policies` Placeholder.
Read-only at this slice; consumes ComplianceService:
- `GET /api/v1/compliance/frameworks` — canonical catalog
  (HIPAA / FERPA / FedRAMP / etc.)
- `GET /api/v1/compliance/state` — caller-org live 24h
  posture per framework (org-level per DRIFT 15; NOT
  aggregated per member)

UI surface: single Compliance Frameworks card with per-row
name + status badges (Inactive flag if applicable + Compliant
24h-window verdict / Failures in 24h window verdict) +
jurisdiction + sector badges + live posture detail (last
passed / last check / 24h failure count) + evaluated-at
timestamp footer; honest empty + safe error + Retry; amber
notice when only posture fails (frameworks catalog remains
visible). `rules` JSON blob NEVER mirrored at the type
register — by construction cannot be destructured or
rendered. ComplianceService.check() mutation surface is NOT
exposed at CT (read-only at this slice; mutation requires
separate Founder authorization).

Test surface: 14 NEW Approvals tests + 10 NEW Policies
tests at otzar-control-tower (CT total 165 → 189; all prior
Section 5 + Section 7 + Wave 10 regression preserved).

Section 9 status after this bundled closeout: 2 of 3 CT
consumer Placeholders retired (Approvals ✓ + Policies ✓).
CT Workflows page remains Placeholder pending Founder
decision on Workflows ADR (no Foundation workflow-substrate
exists yet; this is a product-decision boundary, not a
substrate gap).

NO Foundation backend change across either CT slice. NO new
audit literal. NO schema. NO new route. NO regulator scope.
NO Layer 4 drilldown. NO LLM. NO BEAM. NO bulk approve/deny.
NO org-wide approval list (no Foundation route). NO
compliance.check() mutation. NO full-report download. NO
policy editing UI.

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
