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

**Backend substrate partial.** The Foundation backend exposes the
read/write contracts the Control Tower frontend will consume.
The `otzar-control-tower` sibling repo holds the frontend; the
Control Tower frontend is forward-substrate from this Foundation
repo's perspective.

## What is live (backend contracts CT will consume)

- Otzar `conductSession` transparency surface per ADR-0051
  (context_used / tokens_consumed / response /
  conversation_id baseline + optional `transparency` +
  `context_provenance` fields).
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
- Break-glass grant substrate per ADR-0050 + GOVSEC.5 BG.1 / BG.2.
- Regulator access window per ADR-0036 + CAR Sub-box 3.
- Escalation routes (`/api/v1/escalations/*`) for dual-control
  approvals.

## What is not live

- Otzar Wave 2A self-scoped twin role-scope profile route
  (ADR-0053; design accepted, code forward-substrate).
- Otzar Wave 2B conversation look-back detail endpoint
  (ADR-0054).
- Otzar Wave 2C correction-conversation linkage (ADR-0055).
- Control Tower frontend UX (lives in
  [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower)
  sibling repo; Vite + React).
- Action runtime UX surfaces (Inbox, Detail drawer,
  ActionPolicy editor).
- Audit viewer UX.
- Break-glass management UX.
- Regulator access UX.

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

- Foundation-side: Wave 2A/B/C route implementations (priority
  per Section 1).
- Frontend-side (in sibling repo): Action Inbox consumer of the
  GET list route landed in PR #32; Action Detail drawer
  consumer of GET viewer landed in PR #30.

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
