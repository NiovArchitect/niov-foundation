# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `6258f17f31a018e0dbcfa996c50de16e083f1b37`
- **Latest merged PR:** [#74](https://github.com/NiovArchitect/niov-foundation/pull/74) — Section 4 Wave 5 NotificationService external fan-out bridge.
- **Active branch / PR:** `section-4-wave-6-closeout` (Section 4 Wave 6 closeout — docs refresh + production-grade-complete recommendation).
- **Active production section:** Section 4 closeout (Section 4 Foundation backend production-grade complete for `OUTBOUND_WEBHOOK` + HMAC-SHA-256 + fan-out bridge; recommended next production section is **Section 1 Wave 3 — Otzar drift detection ADR**, RULE 20-gated).
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** **3 of 3 LIVE** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT + SEND_INTERNAL_NOTIFICATION). Wave 11 closed the "2 of 3" gap with Founder-direction-locked internal-only delivery; external providers remain forward-substrate as optional adapters.
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Read surface:** create, cancel, GET viewer, GET list, GET attempt detail — full Action Inbox + Detail + Attempt drilldown.
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` LIVE per PR #47; the `PUT /api/v1/org/action-policies` admin write-path accepts both fields per PR #49 (dual-control gated; null clears; positive int sets; 0/negative/float/string rejected 422; audit captures `_set` boolean flags, never the numeric values). Resolved per-attempt timeout persists onto `ActionAttempt.timeout_ms` for forensic visibility, projected on `GET /api/v1/org/action-policies` (list) + `GET /api/v1/actions/:id/attempts/:attempt_id` (attempt detail, per PR #51) — forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic; see PR #41 merge notes).

## Exact next action

**Founder-clarified framing (re-asserted across all docs):** "Section 2 production-grade complete for internal Foundation autonomous-execution-substrate scope" means the **internal autonomous execution substrate** is complete, **not** that Otzar is an internal-only product. External tool integrations (Slack / email / SMS / push / Google Workspace / Microsoft / Linear / Jira / Salesforce / etc.) remain **required future production capabilities** and are tracked under **Section 4 — MCP / Connectors** as governed adapters. Section 2's internal-only scope is the safe foundation that those future external adapters must consume; it is not a substitute for them.

## Section 4 PRODUCTION-GRADE COMPLETE for Foundation backend scope (Waves 1+2+3+4+5 LANDED at PRs #70 + #71 + #72 + #73 + #74)

- **Wave 1:** ConnectorProvider abstraction + CONNECTOR_REGISTRY frozen-anchor + FixtureBasedConnectorProvider (mirrors EmbeddingProvider / LLMProvider canonical shape).
- **Wave 2:** ConnectorBinding Prisma model (`secret_ref` env-var NAME only; never raw secret at rest) + 5 admin routes on `/api/v1/org/connectors[/:id]` (`can_admin_org`-gated; cross-org probes → enumeration-safe 404).
- **Wave 3:** `INVOKE_CONNECTOR` ActionType + handler (LOW risk_tier; 8 provider error_class → handler `CONNECTOR_<class>` mapping). Rides existing 10 `ACTION_*` audit literals.
- **Wave 4:** `OutboundWebhookProvider` — first real connector. HTTPS POST + HMAC-SHA-256 signing over `${timestamp}.${rawBody}` (defeats replay). Pure `node:https` + `node:crypto`; zero SDK dependency. Bounded 10_000ms timeout; HTTP status → error_class mapping; SAFE delivery_metadata.
- **Wave 5:** `NotificationService` external fan-out bridge. Opt-in per binding via `config.notification_classes` (wildcard `*` supported); commit-then-hook order; production hook swallows downstream errors. Metadata-only ping (notification_id + notification_class) — body content never traverses the seam.
- 5 admin `details.action` discriminators (Wave 2) + 2 fan-out discriminators (Wave 5) on existing `ADMIN_ACTION` literal — **zero new audit literals across any wave**.

## Recommended next production section: Section 1 Wave 3 — Otzar drift detection ADR (RULE 20-gated)

Of the remaining sections, drift detection delivers the next-highest customer-visible value per dev-hour because (a) it leverages the Otzar Wave 2A/B/C correction substrate already live on main, (b) it's the natural pairing with Section 4 — once external adapters are firing, drift detection becomes the operator-trust loop, and (c) no new schema or external integration needed (pure Foundation + Otzar work).

Alternative next slices (each RULE 20-gated):

  1. **Section 4 Slack OAuth follow-on** — first SDK-bound connector. Highest demand-side enterprise value; largest substrate surface (OAuth token storage requires schema + key-management).
  2. **GOVSEC.5 follow-on `requireAdminCapability` throttle** — hardens dual-control; security-relevant.
  3. **Section 9 backend contracts** — keeps Control Tower consumption parity caught up with new Section 4 surface.

## Section 4 forward-substrate (optional)

  - **SDK-bound connectors** (Slack OAuth / Gmail / Microsoft Graph / Salesforce / Linear / Jira / SMS / Push) — each its own QLOCK + RULE 21 research arc.
  - **Encrypted-at-rest secret column** for per-tenant credentials (current `secret_ref` env-var pattern unblocks generic webhook use).
  - **Action-runtime-integrated fan-out variant** — current Wave 5 is fire-and-forget; an Action-routed variant gives retry + cancellation at the cost of coupling.
  - **HMAC signature verification helper** for receiving inbound webhooks (Foundation currently SENDS signed webhooks).
  - **Control Tower connector admin UX** (frontend; out of Foundation scope).

→ Awaiting Founder QLOCK on the next production section. Per the active autonomous-execution authorization, Section 4 work is complete; new sections need explicit RULE 20 authorization.

**Section 4 Wave 5 summary (PR #74):** NotificationService external fan-out bridge. NEW `bindingMatchesNotificationClass` matcher + `dispatchNotificationFanOut` parallel per-binding invoke + `makeConnectorFanOutHook` builder swallows downstream errors. NotificationService accepts optional `connectorFanOut` hook; Wave 11 internal-only baseline preserved verbatim when hook absent. 2 `details.action` discriminators on existing `ADMIN_ACTION` literal. 13 NEW integration tests + Section 2 `SEND_INTERNAL_NOTIFICATION` regression 7/7 preserved.

**Earlier waves + Section 7 + Section 2 detail:** [`current-build-state/04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md) + [`current-build-state/07-full-audit-viewer.md`](current-build-state/07-full-audit-viewer.md) + [`current-build-state/02-autonomous-execution-core.md`](current-build-state/02-autonomous-execution-core.md).

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

**LIVE (Section 4 Waves 1+2+3+4+5 — connector substrate; see [`current-build-state/04-mcp-connectors.md`](current-build-state/04-mcp-connectors.md)):**
- `ConnectorBinding` Prisma model with `secret_ref` env-var-NAME pattern (never raw secret at rest); 5 admin routes on `/api/v1/org/connectors[/:id]` all `can_admin_org`-gated.
- `INVOKE_CONNECTOR` ActionType rides full Action runtime lifecycle (LOW risk_tier; 8 provider error_class → handler `CONNECTOR_<class>`).
- `OutboundWebhookProvider` real adapter (HTTPS POST + HMAC-SHA-256 signing; pure node stdlib).
- `NotificationService.connectorFanOut` opt-in hook fires per matching binding (commit-then-hook order; metadata-only ping).
- Zero new audit literals across all 5 waves — `ADMIN_ACTION` + `details.action` discriminator pattern preserved.

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
