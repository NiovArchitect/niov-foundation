# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `470c43ca34807b88e7dba2f16ef41dbcd6c5cb0a`
- **Latest merged PR:** [#54](https://github.com/NiovArchitect/niov-foundation/pull/54) — ADR-0057 ActionAttempt list route.
- **Active branch / PR:** `refresh-docs-wave10-attempt-list-route` (Wave 10 wave-close docs refresh).
- **Active production section:** Section 2 — Autonomous Execution Core.
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** **2 of 3** (RECORD_CAPSULE + PROPOSE_PERMISSION_GRANT live; SEND_INTERNAL_NOTIFICATION remains stub — no backing notification substrate).
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Read surface:** create, cancel, GET viewer, GET list, GET attempt detail — full Action Inbox + Detail + Attempt drilldown.
- **Operator-tunable runtime knobs:** `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` LIVE per PR #47; the `PUT /api/v1/org/action-policies` admin write-path accepts both fields per PR #49 (dual-control gated; null clears; positive int sets; 0/negative/float/string rejected 422; audit captures `_set` boolean flags, never the numeric values). Resolved per-attempt timeout persists onto `ActionAttempt.timeout_ms` for forensic visibility, projected on `GET /api/v1/org/action-policies` (list) + `GET /api/v1/actions/:id/attempts/:attempt_id` (attempt detail, per PR #51) — forensic-visibility loop CLOSED end-to-end.
- **TypeScript baseline:** exactly 4 canonical residual errors.
- **Repo visibility:** PUBLIC. Branch protection: 4 required canonical CI checks + force-push blocked + admin-enforced + secret scanning + push protection + dependabot updates enabled. Required-review count: 0 (solo-developer pragmatic; see PR #41 merge notes).

## Exact next action

After this docs refresh merges:

→ Start **Wave 11** — pick between:

  1. **Founder direction on §6 product-clarity question** (in-app vs email vs push vs Slack vs SMS) per the Wave 9 research arc at [`research/2026-05-29-send-internal-notification-substrate-research.md`](research/2026-05-29-send-internal-notification-substrate-research.md). UNBLOCKS the SEND_INTERNAL_NOTIFICATION sub-phase 1 implementation wave. RULE 20-gated.
  2. **Section 1 Wave 3 drift detection ADR** — Founder-authorized doctrine slice. RULE 20-gated.
  3. **GOVSEC.5 follow-on `requireAdminCapability` throttle** — RULE 20-gated.
  4. **Explicit `GET /api/v1/org/actions` route** — substrate-coherent alias; `?org_scope=true` on the unified list already covers the same need; lowest leverage; autonomous-safe.
  5. **Per-action `ActionPolicy` lookup cache** — ETS-style read-optimized cache forward-substrate per ADR-0036 / ADR-0039 precedent; "measure first" per ADR-0016. Premature optimization without measured contention. Autonomous-safe but lowest priority.

  Recommendation per protocol: **autonomous protocol may stand by for Founder direction on items 1-3 (all RULE 20-gated)**. Among autonomous-safe slices remaining, the `GET /api/v1/org/actions` route alias is the next-highest-leverage; even so, the marginal product value is small because `?org_scope=true` on the unified list already covers the same need. The Section 2 substrate is now mature — most autonomous-safe extensions remaining are marginal polish, not substrate gaps. Strongly recommend pause for Founder review of accumulated work waves 6-10.

**Wave 6 / 7 / 8 / 9 / 10 summary (Section 2 substrate complete except for SEND_INTERNAL_NOTIFICATION real handler):**

- **Wave 6 (PR #47):** LOCK-GAP-1 + LOCK-GAP-2 schema promotion to `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` + `ActionAttempt.timeout_ms`. NEW resolver helpers; executor adds per-action policy point-lookup. Tier-4 build-log at [`build-log/2026-05-29-pr-47-actionpolicy-retry-budget-timeout-schema.md`](build-log/2026-05-29-pr-47-actionpolicy-retry-budget-timeout-schema.md).
- **Wave 7 (PR #49):** Admin write-path closure. `PUT /api/v1/org/action-policies` allowlist + typed validator; GET list response projects both override columns; audit boolean `_set` flags (NEVER numeric values). Closed RULE 13 drift surfaced post-PR-48.
- **Wave 8 (PR #51):** Attempt-detail viewer projection. `SafeActionAttemptView.timeout_ms` surfaces the resolved value on `GET /api/v1/actions/:id/attempts/:attempt_id`. 2 NEW integration tests. Closed the last forensic-visibility surface.
- **Wave 9 (PR #53):** SEND_INTERNAL_NOTIFICATION RULE 21 research arc landed at [`research/2026-05-29-send-internal-notification-substrate-research.md`](research/2026-05-29-send-internal-notification-substrate-research.md); product-clarity question queued for Founder.
- **Wave 10 (PR #54):** ActionAttempt list route `GET /api/v1/actions/:id/attempts`. Closes the "callers must query DB directly for attempt history" gap. Same authorization spine as PR #39 + PR #51; pagination + outcome filter + soft-delete invisibility; 16 NEW integration tests; no schema; no architectural primitive.

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

**LIVE (Section 2):**
- `POST /api/v1/actions` (create + policy eval + dual-control pairing).
- `POST /api/v1/actions/:id/cancel` (non-RUNNING for any source caller; **RUNNING via valid GOVSEC.5 break-glass grant for action_type=`ACTION_RUNNING_CANCEL`**).
- `GET /api/v1/actions/:id` (safe detail view + aggregates).
- `GET /api/v1/actions` (self-scope default; `?org_scope=true` admin).
- **`GET /api/v1/actions/:id/attempts/:attempt_id`** (attempt drilldown + latest result; same ownership / admin scoping).
- `GET /api/v1/org/action-policies` + `PUT /api/v1/org/action-policies` (dual-control gated).
- Executor + scheduler + expiry sweep runtime (`tickActionExecutor` + `tickActionScheduler` + `tickActionExpirySweep`).
- All 10 `ACTION_*` audit emitters.
- **RECORD_CAPSULE real handler** — RECORD_CAPSULE actions execute through `WriteService.createCapsuleForActionRunner` producing real `MemoryCapsule` rows + back-referenced `CAPSULE_MUTATION_ADD` audit + SAFE `ActionResult.result_metadata` (capsule_id + capsule_type only).
- Per-`ActionType` create-time payload validator dispatcher.
- **RUNNING-cancel break-glass plumbing** — cancel.service validates ACTIVE break-glass grant + marks USED + emits ACTION_CANCELLED with grant_id back-reference + fires process-local AbortController so in-flight attempts short-circuit.
- **PROPOSE_PERMISSION_GRANT real handler** — calls existing `createPermission` (which enforces RULE 0 sovereignty in code) + emits canonical `PERMISSION_CREATED` AuditEvent with action_id back-reference. SAFE result_metadata (permission_id + bridge_id + capsule_id + grantee_entity_id + access_scope + duration_type only).

**NEW LIVE (Wave 10 / PR #54):**
- `GET /api/v1/actions/:id/attempts` — paginated SafeActionAttemptView list for one parent Action. Same authorization spine as PR #39 + PR #51 (source self-scope OR `can_admin_org`-over-same-org; RULE 0 enumeration-prevention 404). Pagination + optional outcome filter + soft-delete invisibility + chronological sort (`attempt_number` ASC) + per-row timeout_ms surfacing (Wave 8 carry-through).

**LIVE (Wave 8 / PR #51):**
- `SafeActionAttemptView.timeout_ms: number | null` projects the per-attempt timeout-in-force on `GET /api/v1/actions/:id/attempts/:attempt_id`. Null only for attempts that landed before PR #47. Forensic-visibility loop CLOSED end-to-end.

**LIVE (Wave 7 / PR #49):**
- `PUT /api/v1/org/action-policies` admin write-path accepts `retry_budget` + `attempt_timeout_ms_override` (typed validation; positive Int OR explicit null; 0 / negative / float / string rejected 422).
- `GET /api/v1/org/action-policies` response projects both columns for round-trip visibility.
- `ACTION_POLICY_UPDATE` audit details gain `retry_budget_set` + `attempt_timeout_ms_override_set` boolean indicators; numeric tuning values NEVER appear in audit details (queryable via GET list by same admin tier).

**LIVE (Wave 6 / PR #47):**
- `ActionPolicy.retry_budget` + `ActionPolicy.attempt_timeout_ms_override` per-(org, action_type, risk_tier) operator-tunable overrides. Null override = service-tier constant fallback; non-positive override = constant fallback (operator-misconfiguration guard). Executor option still wins absolutely.
- `ActionAttempt.timeout_ms` records the resolved per-attempt timeout-in-force on every attempt row (forensic).
- `resolveRetryBudget` + `resolveAttemptTimeoutMs` pure resolver helpers in `apps/api/src/services/action/lifecycle.service.ts`.

**NOT LIVE:**
- SEND_INTERNAL_NOTIFICATION real handler — Wave 9 research arc landed; Founder direction on §6 product-clarity question needed before implementation wave.
- Explicit `GET /api/v1/org/actions` route (served via `?org_scope=true` on unified list).
- Active AbortSignal consumption by handlers (plumbed but RECORD_CAPSULE + stubs don't listen yet; future real handlers wrapping long-running connector work will consume).
- Per-action `ActionPolicy` lookup cache (one indexed point-lookup per claimed Action; cache is forward-substrate if hot-path contention surfaces; "measure first" per ADR-0016).
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
