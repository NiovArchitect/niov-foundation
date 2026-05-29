# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `10155b94ba10a49e525981ccf0b103ffdcac256e`
- **Latest merged PR:** [#60](https://github.com/NiovArchitect/niov-foundation/pull/60) — Section 7 Wave 1 unified self-scope audit-events viewer.
- **Active branch / PR:** `refresh-docs-section-7-wave-1` (Section 7 Wave 1 wave-close docs refresh).
- **Active production section:** **Section 7 — Full Audit Viewer** (Section 2 closed for current internal Foundation autonomous-execution-substrate scope; external integrations remain required future production work, especially Section 4 MCP / Connectors).
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION). Wave 11 closed the "2 of 3" gap with Founder-direction-locked internal-only delivery; external providers remain forward-substrate as optional adapters.
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Read surface:** create, cancel, GET viewer, GET list, GET attempt detail — full Action Inbox + Detail + Attempt drilldown.
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` LIVE per PR #47; the `PUT /api/v1/org/action-policies` admin write-path accepts both fields per PR #49 (dual-control gated; null clears; positive int sets; 0/negative/float/string rejected 422; audit captures `_set` boolean flags, never the numeric values). Resolved per-attempt timeout persists onto `ActionAttempt.timeout_ms` for forensic visibility, projected on `GET /api/v1/org/action-policies` (list) + `GET /api/v1/actions/:id/attempts/:attempt_id` (attempt detail, per PR #51) — forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic; see PR #41 merge notes).

## Exact next action

**Founder-clarified framing (re-asserted across all docs):** "Section 2 production-grade complete for internal Foundation autonomous-execution-substrate scope" means the **internal autonomous execution substrate** is complete, **not** that Otzar is an internal-only product. External tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** and are tracked under **Section 4 — MCP / Connectors** as governed adapters. Section 2's internal-only scope is the safe foundation that those future external adapters must consume; it is not a substitute for them.

## Section 7 Wave 1 LANDED (PR #60)

`GET /api/v1/audit/events` + `GET /:id` + `GET /verify-chain` LIVE — unified self-scope audit-events viewer + hash-chain verification surface. Self-scope only at sub-phase 1; org-admin + niov-admin scopes intentional future-substrate (next waves).

## Section 7 next slices (priority order)

  1. **Section 7 Wave 2 — org-admin scope on `/api/v1/audit/events`** (mirrors `/api/v1/org/audit` pattern but on the unified surface; cross-org leak guard tested per the `admin-routes.test.ts:454` precedent).
  2. **Section 7 Wave 3 — niov-admin scope on `/api/v1/audit/events`** (mirrors `/platform/audit` + `/console/audit` patterns).
  3. **Section 7 Wave 4 — export surface** (CSV / NDJSON streaming for regulator-tier review; rate-limited).
  4. **Section 7 Wave 5 — regulator-tier audit access** via `REGULATOR` principal + `LawfulBasis` attestation per ADR-0036.
  5. **Section 7 Wave 6 — Control Tower audit-viewer UX** (frontend; lives in `otzar-control-tower`; out of Foundation scope).

## Other sections waiting on Founder direction

- **Section 1 Wave 3 drift detection ADR** — RULE 20-gated.
- **GOVSEC.5 follow-on `requireAdminCapability` throttle** — RULE 20-gated (ADR-0050 amendment).
- **Section 4 — MCP / Connectors** — the canonical home for external tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.). Required production work; each adapter wave needs its own QLOCK + RULE 21 research arc.

→ Continuing Section 7 Wave 2 (org-admin scope) on the next autonomous block, unless Founder redirects.

**Section 7 Wave 1 summary (PR #60):** unified self-scope audit-events viewer. NEW `audit-view.service.ts` + `audit.routes.ts` with 3 routes (`GET /events` paginated + filterable; `GET /events/:id` single-event drilldown with prev/next chain refs; `GET /verify-chain` exposes the LIVE `verifyAuditChain` primitive at HTTP). Self-scope only at sub-phase 1; RULE 0 isolation tested. Read-audit emission via existing `ADMIN_ACTION` + `details.action="AUDIT_VIEW_*"` per the `CONSOLE_READ` precedent (no new audit literal). SAFE projection re-asserts no-leak at read tier. 19 NEW integration tests; existing `/platform/audit` + `/org/audit` + `/console/audit` routes remain LIVE for admin tiers — Wave 1 ADDS the per-caller surface they don't cover.

**Wave 6 / 7 / 8 / 9 / 10 / 11 / 12 summary (Section 2 production-grade COMPLETE for internal Foundation autonomous-execution-substrate scope):**

- **Wave 12 (PR #58):** Notification inbox routes. NEW `notification-read.service.ts` + 3 routes (`GET /api/v1/notifications` paginated self-scope list with `unread_only` + `notification_class` filters + SAFE projection excluding `body_redacted`; `PUT /:id/read` idempotent; `PUT /:id/dismiss` RULE 10 soft-delete). 21 NEW integration tests; enumeration-safe 404 throughout.

- **Wave 6 (PR #47):** LOCK-GAP-1 + LOCK-GAP-2 schema promotion to `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` + `ActionAttempt.timeout_ms`. NEW resolver helpers; executor adds per-action policy point-lookup. Tier-4 build-log at [`build-log/2026-05-29-pr-47-actionpolicy-retry-budget-timeout-schema.md`](build-log/2026-05-29-pr-47-actionpolicy-retry-budget-timeout-schema.md).
- **Wave 7 (PR #49):** Admin write-path closure. `PUT /api/v1/org/action-policies` allowlist + typed validator; GET list response projects both override columns; audit boolean `_set` flags (NEVER numeric values). Closed RULE 13 drift surfaced post-PR-48.
- **Wave 8 (PR #51):** Attempt-detail viewer projection. `SafeActionAttemptView.timeout_ms` surfaces the resolved value on `GET /api/v1/actions/:id/attempts/:attempt_id`. 2 NEW integration tests. Closed the last forensic-visibility surface.
- **Wave 9 (PR #53):** SEND_INTERNAL_NOTIFICATION RULE 21 research arc landed at [`research/2026-05-29-send-internal-notification-substrate-research.md`](research/2026-05-29-send-internal-notification-substrate-research.md); product-clarity question queued + then RESOLVED by Founder direction.
- **Wave 10 (PR #54):** ActionAttempt list route `GET /api/v1/actions/:id/attempts`. Closes the "callers must query DB directly for attempt history" gap.
- **Wave 11 (PR #56):** SEND_INTERNAL_NOTIFICATION internal-only real handler. NEW `Notification` Prisma model + NEW `notification.service.ts` (cross-org default DENY per RULE 0 + TAR-ACTIVE check + SAFE projection) + NEW `validateSendInternalNotificationPayload` + NEW handler factory + executor org_entity_id pass-through + server DI. 15 NEW unit + 7 NEW integration tests + 9 pre-existing test files updated for the now-real validator. Tier-4 build-log at [`build-log/2026-05-29-pr-56-send-internal-notification-handler.md`](build-log/2026-05-29-pr-56-send-internal-notification-handler.md).

## Current stop conditions

- CI fails.
- mergeStateStatus is not CLEAN / MERGEABLE.
- Working tree is dirty in unexpected ways.
- TypeScript baseline changes away from exactly 4 canonical residuals.
- no-leak guard fails.
- no-console anchor fails.
- A command requires secrets or production DB.
- A production migration is required.
- Generated client / schema drift appears unexpectedly.
- Implementation requires touching Control Tower / frontend / connectors / MCP / browser automation / native-app automation / voice / Sesame / desktop edge UX / wearable lens UX before the current QLOCK permits it.
- Online research reveals a material contradiction with approved ADRs / CURRENT_BUILD_STATE.md / implementation-proven repo state.
- The recommended path would require destructive data behavior.
- The recommended path would create obvious enterprise security / privacy risk.
- You cannot verify substrate even after targeted research.
- Founder explicitly asks you to pause.

**Not stop conditions:** normal section boundary; completed PR; completed docs refresh; discovered gap when research provides a clear safe recommendation.

## Key live / not-live truth

**LIVE (Section 7 Wave 1 — unified self-scope audit viewer; see [`current-build-state/07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md)):**
- `GET /api/v1/audit/events` — paginated self-scope audit-event list; `event_type` + `target_entity_id` + `target_capsule_id` + `outcome` + `start_time` + `end_time` filters; ORDER BY timestamp DESC; cap 100; SAFE projection.
- `GET /api/v1/audit/events/:id` — single-event drilldown with `previous_event` + `next_event` chain refs (audit_id + event_hash + timestamp only); enumeration-safe 404.
- `GET /api/v1/audit/verify-chain` — verifies caller's own audit chain via the LIVE `verifyAuditChain` primitive; returns `{ valid, total_events, broken_at }`.
- Read-audit emission: every GET fires `ADMIN_ACTION` + `details.action="AUDIT_VIEW_*"` on the caller's chain.

**LIVE (Section 2 — full surface; see [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md) for detail):**
- 9 HTTP routes: `POST /api/v1/actions` + cancel (non-RUNNING + RUNNING-via-break-glass) + GET viewer + GET list + GET attempt-detail + GET attempt-list + GET/PUT `/api/v1/org/action-policies` (dual-control gated; PR #49 accepts the override fields).
- 3 notification inbox routes (Wave 12 / PR #58): `GET /api/v1/notifications` + `PUT /:id/read` + `PUT /:id/dismiss` — self-scope only; SAFE projection (no `body_redacted`); enumeration-safe 404.
- 3 of 3 real per-`ActionType` handlers LIVE: RECORD_CAPSULE (PR #35) + PROPOSE_PERMISSION_GRANT (PR #41) + SEND_INTERNAL_NOTIFICATION-internal-only (PR #56 — `Notification` model + `NotificationService` + RULE 0 cross-org DENY).
- 10 of 10 `ACTION_*` audit emitters LIVE.
- Executor + scheduler + expiry sweep runtime + per-attempt AbortController plumbing.
- Operator-tunable `ActionPolicy.retry_budget` + `attempt_timeout_ms_override` (Wave 6/7 PR #47/49); resolved `timeout_ms` persists onto `ActionAttempt` + projects onto attempt-detail (Wave 8 PR #51); forensic-visibility loop CLOSED end-to-end.

**NOT LIVE (intentional future-substrate; do NOT auto-implement):**
- External notification delivery (email / SMS / Slack / push) — Founder-direction-locked at internal-only; each adapter = own QLOCK + RULE 21 research arc.
- Receiver-owned opt-out (`NotificationPreference` model) — RULE 20-gated.
- Per-Notification audit literals (`NOTIFICATION_DISPATCHED` / `_DELIVERY_FAILED` / `_OPT_OUT_RESPECTED`) — RULE 20-gated.
- Admin / cross-recipient notification list path — needs QLOCK + opt-out integration review.
- Notification detail-view route (would surface `body_redacted`) — needs separate no-leak review.
- Explicit `GET /api/v1/org/actions` route (served via `?org_scope=true` on unified list; marginal value).
- Active AbortSignal consumption by handlers (plumbed but unused).
- Per-action `ActionPolicy` lookup cache ("measure first" per ADR-0016).
- Connectors / MCP / Control Tower UX / voice / ambient / lens UX.

## Which section file to read next

For the next slice (per-`ActionType` handler research arc):

→ [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md)

This file holds the full ADR-0057 PR #18 → #32 lineage, the
Founder gap-locks, the RULE 13 disclosures, and the prioritized
next-slices list.

For broader product / governance context:
- [`current-build-state/README.md`](current-build-state/README.md) — section-detail directory + refresh discipline.
- [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md) — master 10-section status table + global do-not-claim list + product directives.

For the cited ADR substrate:
- [`architecture/decisions/0057-autonomous-execution-core-substrate.md`](architecture/decisions/0057-autonomous-execution-core-substrate.md) — the canonical ADR.

## Discipline reminders

- **Wave-based delivery (per `[FOUNDATION-VELOCITY-CORRECTION]`):** group related slices in the same production section into one wave. Implementation PRs may still be separate for safety; docs refresh happens **once per completed wave**, not after every small PR. A wave shares substrate, requires no schema migration, does not cross into unrelated sections, requires no new product/architecture decisions, and can be verified safely as a sequence.
- **Pattern lock (PR cycle):** branch → implement narrow slice → targeted tests + no-leak + no-console + typecheck baseline → commit → push → open PR → wait for CI → merge if green + CLEAN → verify local main equals origin/main → next slice in the same wave (no docs refresh between) → at wave close: one concise docs refresh updating **`NEXT_ACTION.md` + relevant section file** + lean master index touchups.
- **RULE 21 research arc** required for substrate-architectural pastes (external libraries, new substrate patterns, cross-application boundaries, cross-language boundaries, wire-format changes).
- **No `console.*` in `apps/api/src`** (RULE 16; anchor test enforces).
- **Soft-delete only** (RULE 10; `deleted_at` timestamps, never DELETE).
- **Audit chain integrity** (RULE 4; `writeAuditEvent` before response; failure rolls back action).

## Update rule (mandatory)

After every wave-close (not per individual PR for routine work):
1. Update this file's "Where we are" + "Exact next action" + "Recent merges" implications.
2. Keep this file ≤ 150 lines.
3. Update the relevant `current-build-state/XX-section.md` with detailed notes (don't starve of necessary detail).
4. Update `CURRENT_BUILD_STATE.md` only for: HEAD / latest-PR / status-row / queue-order / global-truth changes.
5. For a **major** architectural landing (new substrate cluster, security/governance landing, schema change, cross-section integration, complex runtime behavior, RULE 21 paste), also write a tier-4 `build-log/YYYY-MM-DD-pr-XX-slug.md` entry. Routine routes do NOT need build-log entries.
