# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `2acd5c767a90a38dcfc243e6ad1194e5d7714878`
- **Latest merged PR:** [#58](https://github.com/NiovArchitect/niov-foundation/pull/58) — ADR-0057 notification inbox routes (Wave 12 internal-only read surface).
- **Active branch / PR:** `refresh-docs-wave12-notification-inbox` (Wave 12 wave-close docs refresh).
- **Active production section:** Section 2 — Autonomous Execution Core.
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION). Wave 11 closed the "2 of 3" gap with Founder-direction-locked internal-only delivery; external providers remain forward-substrate as optional adapters.
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Read surface:** create, cancel, GET viewer, GET list, GET attempt detail — full Action Inbox + Detail + Attempt drilldown.
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` LIVE per PR #47; the `PUT /api/v1/org/action-policies` admin write-path accepts both fields per PR #49 (dual-control gated; null clears; positive int sets; 0/negative/float/string rejected 422; audit captures `_set` boolean flags, never the numeric values). Resolved per-attempt timeout persists onto `ActionAttempt.timeout_ms` for forensic visibility, projected on `GET /api/v1/org/action-policies` (list) + `GET /api/v1/actions/:id/attempts/:attempt_id` (attempt detail, per PR #51) — forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic; see PR #41 merge notes).

## Exact next action

After this docs refresh merges:

## Section 2 closeout recommendation

Section 2 (Autonomous Execution Core) is **production-grade COMPLETE for current internal-only production scope.** Recommend marking Section 2 closed and shifting to Section 7 (Full Audit Viewer) — or whichever section the Founder picks — as the next production-section focus. Do NOT continue Section 2 polish slices autonomously.

**What is production-grade complete now:**
- 6 Action HTTP routes (create / cancel / GET viewer / GET list / GET attempt-detail / GET attempt-list) LIVE.
- 3 of 3 real per-`ActionType` handlers LIVE (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION-internal-only).
- 10 of 10 `ACTION_*` audit emitters LIVE.
- 2 admin `/org/action-policies` routes (GET list + PUT dual-control-gated) LIVE with operator-tunable `retry_budget` + `attempt_timeout_ms_override`.
- Executor / scheduler / expiry sweep runtime + AbortController plumbing + LOCK-GAP-1/2 schema fields + forensic `timeout_ms` visibility loop CLOSED end-to-end.
- 3 internal-only notification routes (GET inbox + PUT read + PUT dismiss) LIVE per Wave 12 with RULE 0 self-scope + enumeration-safe 404 + SAFE projection (no body_redacted leak).
- Cancel-via-GOVSEC.5 break-glass LIVE.

**What is intentionally future-substrate (do NOT auto-implement):**
- External notification delivery (email / SMS / Slack / push) — each adapter requires its own Founder QLOCK + RULE 21 research arc.
- `NotificationPreference` opt-out model — RULE 20-gated.
- Per-Notification audit literals (`NOTIFICATION_DISPATCHED` / `_DELIVERY_FAILED` / `_OPT_OUT_RESPECTED`) — RULE 20-gated.
- Admin / cross-recipient notification list path — needs QLOCK + opt-out integration review.
- Notification-detail-view route (would surface `body_redacted` to recipient) — needs separate no-leak review.
- GOVSEC.5 follow-on `requireAdminCapability` throttle — RULE 20-gated (ADR-0050 amendment).
- Per-action `ActionPolicy` lookup cache — premature optimization; "measure first" per ADR-0016.
- Active AbortSignal consumption by handlers — plumbed but no current handler wraps long-running connector work.
- Connectors / MCP / Control Tower UX / voice / ambient / lens UX.

**Wave 13 explicit `GET /api/v1/org/actions` alias — worth doing before closeout?** **No.** The `?org_scope=true` flag on the unified `GET /api/v1/actions` route already serves the same use case; an alias is pure URL convenience for callers that prefer the dedicated path. Marginal value; not a production-readiness blocker; can be added later as a follow-on slice if Control Tower or Otzar consumers explicitly request it.

**Section 2 closeout verdict: CLOSE.** Recommend pausing Section 2 + shifting to the next production section. Highest-leverage next section per the post-Wave-11 checkpoint = **Section 7 (Full Audit Viewer)**.

## Next-section candidates (after Section 2 closeout)

  1. **Section 7 — Full Audit Viewer** (highest leverage; the canonical compliance / forensic surface every regulated customer will need; primitives are LIVE; viewer route + UX is the gap).
  2. **Section 1 Wave 3 drift detection ADR** — Founder-authorized doctrine slice. RULE 20-gated.
  3. **GOVSEC.5 follow-on throttle** — RULE 20-gated.
  4. **Section 9 — Admin / Governance Control Tower backend contracts** — partially LIVE via org admin routes; modest "new substantive surface" leverage.

→ Standing by for Founder direction on next-section pick. Section 2 work pauses here.

**Wave 6 / 7 / 8 / 9 / 10 / 11 / 12 summary (Section 2 production-grade COMPLETE for current internal-only scope):**

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
