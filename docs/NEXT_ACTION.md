# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `fe8c09566ed8f207d57cee3045ceaa479b93e93e`
- **Latest merged PR:** [#39](https://github.com/NiovArchitect/niov-foundation/pull/39) — ADR-0057 ActionAttempt detail route.
- **Active branch / PR:** `refresh-docs-wave3-attempt-detail-route` (this wave-close docs refresh).
- **Active production section:** Section 2 — Autonomous Execution Core.
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** 1 of 3 (RECORD_CAPSULE live; SEND_INTERNAL_NOTIFICATION + PROPOSE_PERMISSION_GRANT stub).
- **Cancel surface:** non-RUNNING (any caller) + RUNNING (caller with valid GOVSEC.5 break-glass grant; ADR-0050).
- **Read surface:** create, cancel, GET viewer, GET list, **GET attempt detail** — full Action Inbox + Detail + Attempt drilldown.
- **TypeScript baseline:** exactly 4 canonical residual errors.

## Exact next action

After this docs refresh merges:

→ Start **Wave 4** — pick between (preference order; pick the safest highest-leverage Section 2 slice given current substrate):

  1. **PROPOSE_PERMISSION_GRANT real handler** (second real per-`ActionType` handler). Substrate exists (`createPermission` DB query at `packages/database/src/queries/permission.ts`). MEDIUM-risk default REQUIRE_DUAL_CONTROL; touches multiple entities' DMW boundaries with RULE 0 sovereignty implications. Wraps in RULE 21 research arc inline (per the established ActionHandlerRegistry pattern from Wave 1 — the substrate-architectural boundary was already established by RECORD_CAPSULE; this is "second handler" not "first crossing"). Substrate-coherent extension of the registry pattern; no schema; no migration.
  2. **`[ADR-0057-ACTIONPOLICY-RETRY-BUDGET-AND-TIMEOUT-SCHEMA-QLOCK]`** — promote LOCK-GAP-1 + LOCK-GAP-2 from service-tier constants to schema fields. Requires `db:push:test` migration per ADR-0025 (authorized dev/test pattern); cross-language Ecto parity per ADR-0033. Substrate-architectural; tier-4 build-log expected. Deferred to lower priority because it requires schema work; per protocol, prefer no-migration path while operating autonomously.

  Recommendation per protocol: **Wave 4 = PROPOSE_PERMISSION_GRANT real handler** (preference #1; substrate exists; substrate-coherent extension of the established ActionHandlerRegistry pattern from Wave 1; no schema; higher product leverage than read-side aliases).

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

**NOT LIVE:**
- SEND_INTERNAL_NOTIFICATION real handler (no backing substrate exists; future wave).
- PROPOSE_PERMISSION_GRANT real handler (MEDIUM-risk; separate future wave).
- `ActionPolicy.retry_budget` + `ActionAttempt.timeout_ms` schema fields (service-tier constants only).
- Explicit `GET /api/v1/org/actions` route (served via `?org_scope=true` on unified list).
- ActionAttempt list-of-attempts route (callers query DB if needed; future slice if Control Tower needs).
- Active AbortSignal consumption by handlers (plumbed but RECORD_CAPSULE + stubs don't listen yet; future real handlers wrapping long-running connector work will consume).
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
