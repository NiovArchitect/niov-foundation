# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `9ec214e1ce895f877b60cc0b73b7d6069f234b37`
- **Latest merged PR:** [#68](https://github.com/NiovArchitect/niov-foundation/pull/68) — Section 7 Wave 5 regulator-tier audit access via ADR-0036.
- **Active branch / PR:** `section-7-wave-6-closeout` (Section 7 Wave 6 closeout — docs refresh + production-grade-complete recommendation).
- **Active production section:** Section 7 closeout (Section 7 production-grade complete for Foundation backend scope; next recommended section is **Section 4 — MCP / Connectors**, RULE 20-gated).
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION). Wave 11 closed the "2 of 3" gap with Founder-direction-locked internal-only delivery; external providers remain forward-substrate as optional adapters.
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Read surface:** create, cancel, GET viewer, GET list, GET attempt detail — full Action Inbox + Detail + Attempt drilldown.
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` LIVE per PR #47; the `PUT /api/v1/org/action-policies` admin write-path accepts both fields per PR #49 (dual-control gated; null clears; positive int sets; 0/negative/float/string rejected 422; audit captures `_set` boolean flags, never the numeric values). Resolved per-attempt timeout persists onto `ActionAttempt.timeout_ms` for forensic visibility, projected on `GET /api/v1/org/action-policies` (list) + `GET /api/v1/actions/:id/attempts/:attempt_id` (attempt detail, per PR #51) — forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic; see PR #41 merge notes).

## Exact next action

**Founder-clarified framing (re-asserted across all docs):** "Section 2 production-grade complete for internal Foundation autonomous-execution-substrate scope" means the **internal autonomous execution substrate** is complete, **not** that Otzar is an internal-only product. External tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** and are tracked under **Section 4 — MCP / Connectors** as governed adapters. Section 2's internal-only scope is the safe foundation that those future external adapters must consume; it is not a substitute for them.

## Section 7 PRODUCTION-GRADE COMPLETE for Foundation backend scope (Waves 1+2+3+4+5 LANDED at PRs #60 + #62 + #64 + #66 + #68)

- **Wave 1:** unified self-scope viewer + chain verification.
- **Wave 2:** `?scope=org` (TAR `can_admin_org`; OR-fence; cross-org leak guard).
- **Wave 3:** `?scope=platform` (TAR `can_admin_niov`; unfenced).
- **Wave 4:** `GET /api/v1/audit/events/export` NDJSON (self|org|platform gate; `EXPORT_AUDIT_EVENTS_MAX_ROWS=10000` cap; truncated header).
- **Wave 5:** `GET /api/v1/audit/events/regulator-view` via ADR-0036 LawfulBasis 9-condition enforcement; cross-basis isolation tested; 8 enforcement codes → 404 / 403 / 500.
- `verify-chain` remains self-only across all 5 waves (cross-chain = leakage / perf risk; forward-substrate).
- Read-audit emission via `ADMIN_ACTION` + `details.action` ∈ `{ AUDIT_VIEW_LIST, AUDIT_VIEW_EVENT, AUDIT_VIEW_VERIFY_CHAIN, AUDIT_VIEW_ORG_LIST, AUDIT_VIEW_ORG_EVENT, AUDIT_VIEW_PLATFORM_LIST, AUDIT_VIEW_PLATFORM_EVENT, AUDIT_VIEW_EXPORT, AUDIT_VIEW_REGULATOR }` — all on `ADMIN_ACTION` (no new audit literal across any of the 5 waves).

## Recommended next production section: Section 4 — MCP / Connectors (RULE 20-gated)

Section 4 is the canonical home for external tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce). It gates Section 2 external delivery + Section 9 Control Tower outbound; both substrate ends are now ready. Each adapter = its own Founder QLOCK + RULE 21 research arc; this recommendation is sequencing only.

Alternative next slices (each RULE 20-gated):

  1. **Section 1 Wave 3 — Otzar drift detection ADR** — tighter customer-visible value per dev-hour than Section 4.
  2. **GOVSEC.5 follow-on `requireAdminCapability` throttle** — hardens dual-control; security-relevant.
  3. **Section 9 backend contracts** — keeps Control Tower consumption parity caught up.

## Section 7 forward-substrate (optional)

  - **CSV export** (NDJSON Wave 4 precedent established; CSV optional if downstream consumer requires it).
  - **Control Tower audit-viewer UX** (frontend; lives in `otzar-control-tower`; out of Foundation scope).
  - **Org-admin / platform / regulator `verify-chain`** (cross-chain = perf + leakage; separate QLOCK).
  - **Proactive `REGULATOR_ACCESS_EXPIRED` emitter** via SCHEDULER sweep at `valid_until` crossing per ADR-0036 Sub-decision 4.

→ Awaiting Founder QLOCK on the next production section. Per the active autonomous-execution authorization, Section 7 work is complete; new sections need explicit RULE 20 authorization.

**Section 7 Wave 5 summary (PR #68):** regulator-tier audit access via ADR-0036. NEW `validateListRegulatorAuditEventsQuery` (required UUID `lawful_basis_id`); NEW `listRegulatorAuditEventsForCaller` calls LIVE `getActiveLawfulBasisForRegulator` 9-condition enforcement; maps 8 enforcement failure codes to HTTP (404 / 403 / 500); on success queries `audit_events WHERE lawful_basis_id = :basis_id` + SAFE projection + AND-narrow filters. NEW `GET /api/v1/audit/events/regulator-view`; emits `ADMIN_ACTION:AUDIT_VIEW_REGULATOR`. 12 NEW integration tests + 68/68 Section 7 5-file regression + 23/23 regulator-routes regression preserved. No schema; no new audit literals; no new RULE / ADR landings.

**Earlier waves + Section 2 detail:** [`current-build-state/07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md) + [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md).

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

**LIVE (Section 7 Waves 1+2+3+4+5 — unified self / org / platform / regulator audit viewer + NDJSON export; see [`current-build-state/07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md)):**
- `GET /api/v1/audit/events[?scope=self|org|platform]` — paginated audit-event list. Scope gates TAR-authoritative. Filters AND-narrow; cap 100; SAFE projection.
- `GET /api/v1/audit/events/:id[?scope=self|org|platform]` — single-event drilldown with prev/next chain refs scoped to the same fence; enumeration-safe 404.
- `GET /api/v1/audit/events/export[?scope=self|org|platform&format=ndjson&max_rows=...]` — bounded NDJSON export. Hard cap `EXPORT_AUDIT_EVENTS_MAX_ROWS=10000` + optional smaller `max_rows`; `application/x-ndjson` content-type; `x-audit-row-count` / `x-audit-truncated` / `x-audit-scope` response headers; one JSON line per row + `\n`.
- `GET /api/v1/audit/events/regulator-view?lawful_basis_id=...` — regulator-tier read via ADR-0036 LawfulBasis 9-condition enforcement; cross-basis isolation; 8 enforcement failure codes → 404 / 403 / 500.
- `GET /api/v1/audit/verify-chain` — caller's OWN audit chain. **Self-only across all 5 waves** per Founder direction.
- Read-audit emission: `ADMIN_ACTION` + `details.action` ∈ all 9 `AUDIT_VIEW_*` labels (no new audit literal across any wave).

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
