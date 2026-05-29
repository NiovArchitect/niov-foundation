# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `e914480e57a2a8d33ddae8d655965c7cdf055862`
- **Latest merged PR:** [#64](https://github.com/NiovArchitect/niov-foundation/pull/64) — Section 7 Wave 3 niov-admin/platform scope on unified audit viewer.
- **Active branch / PR:** `refresh-docs-section-7-wave-3` (Section 7 Wave 3 wave-close docs refresh; continuing to Wave 4 export surface).
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

## Section 7 Waves 1+2+3 LANDED (PRs #60 + #62 + #64)

- **Wave 1:** unified self-scope viewer + chain-verification.
- **Wave 2:** `?scope=org` (TAR `can_admin_org` gate; OR-fence; cross-org leak guard; enumeration-safe 404).
- **Wave 3:** `?scope=platform` (TAR `can_admin_niov` gate; unfenced cross-org visibility; mirrors `/platform/audit` + `/console/audit` precedent at the unified entry point).
- `verify-chain` remains self-only across all 3 waves (cross-chain verification = leakage / perf risk per Founder direction; forward-substrate).
- Read-audit emission via `ADMIN_ACTION` + `details.action` ∈ `{ AUDIT_VIEW_LIST, AUDIT_VIEW_EVENT, AUDIT_VIEW_VERIFY_CHAIN, AUDIT_VIEW_ORG_LIST, AUDIT_VIEW_ORG_EVENT, AUDIT_VIEW_PLATFORM_LIST, AUDIT_VIEW_PLATFORM_EVENT }` — all on the existing `ADMIN_ACTION` literal (no new audit literal).

## Section 7 next slices (priority order)

  1. **Section 7 Wave 4 — export surface** (NDJSON first for safe streaming; rate-limited; chunked; reuses unified scope=self|org|platform gate; SAFE projection; existing rate-limit middleware precedent).
  2. **Section 7 Wave 5 — regulator-tier audit access** via `REGULATOR` principal + `LawfulBasis` attestation per ADR-0036.
  3. **Section 7 Wave 6 — Section 7 closeout** docs + production-grade-complete recommendation.
  4. **Section 7 forward-substrate — Control Tower audit-viewer UX** (frontend; lives in `otzar-control-tower`; out of Foundation scope).
  5. **Section 7 forward-substrate — org-admin / platform verify-chain** (separate QLOCK; cross-chain verification needs leakage + perf review).

## Other sections waiting on Founder direction

- **Section 1 Wave 3 drift detection ADR** — RULE 20-gated.
- **GOVSEC.5 follow-on `requireAdminCapability` throttle** — RULE 20-gated (ADR-0050 amendment).
- **Section 4 — MCP / Connectors** — the canonical home for external tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.). Required production work; each adapter wave needs its own QLOCK + RULE 21 research arc.

→ Continuing Section 7 Wave 2 (org-admin scope) on the next autonomous block, unless Founder redirects.

**Section 7 Wave 3 summary (PR #64):** niov-admin/platform scope on unified viewer. `AuditViewScope` enum extended to `self|org|platform`; NEW `callerHasNiovAdminCapability` TAR helper; `listAuditEventsForCaller` + `getAuditEventForCaller` branch on platform scope with empty fence (every audit_events row visible); filters still AND-narrow; enumeration-safe 404 preserved. `verify-chain` UNCHANGED (still self-only). 10 NEW integration tests + Wave 1+2 regression preserved + 96/96 combined Section 7 + admin-routes + console-routes regression.

**Section 7 Wave 2 summary (PR #62):** org-admin scope on the unified viewer. NEW `AuditViewScope` type + `callerHasAdminCapability` + `resolveOrgScopeVector` helpers; `validateListAuditEventsQuery` accepts `scope` enum; `listAuditEventsForCaller` + `getAuditEventForCaller` branch on scope; `scope=org` pre-flights `can_admin_org` + org resolution BEFORE any audit-row lookup (non-admin probes for org-scope `audit_ids` impossible by construction); OR-fence + AND-narrow composition; enumeration-safe 404 on cross-org detail. `verify-chain` UNCHANGED (self-only). 14 NEW integration tests + Wave 1 19/19 regression preserved + audit unit 23/23 preserved + admin-routes / console-routes / audit-event-id-surfacing / notification-inbox 116/116 combined regression preserved.

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

**LIVE (Section 7 Waves 1+2+3 — unified self / org / platform audit viewer; see [`current-build-state/07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md)):**
- `GET /api/v1/audit/events[?scope=self|org|platform]` — paginated audit-event list. Default self-scope; `scope=org` requires `can_admin_org` (403 `ORG_SCOPE_FORBIDDEN` / 404 `NOT_IN_ANY_ORG`); `scope=platform` requires `can_admin_niov` (403 `PLATFORM_SCOPE_FORBIDDEN`); all TAR-authoritative. Filters AND-narrow under all 3 scopes; cap 100; SAFE projection.
- `GET /api/v1/audit/events/:id[?scope=self|org|platform]` — single-event drilldown. Same scope gate on all 3 paths. `previous_event` + `next_event` chain refs scoped to the same fence (org-scope refs walk org timeline; platform-scope refs walk full timeline). Enumeration-safe 404 collapses cross-scope + unknown id.
- `GET /api/v1/audit/verify-chain` — verifies caller's OWN audit chain. **Self-only across all 3 waves** per Founder direction (cross-chain verification = leakage / perf risk; forward-substrate).
- Read-audit emission: `ADMIN_ACTION` + `details.action` ∈ `{ AUDIT_VIEW_LIST, AUDIT_VIEW_EVENT, AUDIT_VIEW_VERIFY_CHAIN, AUDIT_VIEW_ORG_LIST, AUDIT_VIEW_ORG_EVENT, AUDIT_VIEW_PLATFORM_LIST, AUDIT_VIEW_PLATFORM_EVENT }` (no new audit literal).

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
