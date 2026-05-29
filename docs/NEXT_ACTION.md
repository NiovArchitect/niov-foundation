# NEXT ACTION — Operational Baton

> Tier 1 of the Foundation 5-tier docs hierarchy. Read first in
> every new session. ≤ 150 lines by design.
> Tier 2 master index: [`CURRENT_BUILD_STATE.md`](CURRENT_BUILD_STATE.md).
> Tier 3 section detail: [`current-build-state/`](current-build-state/).
> Tier 4 build-log: [`build-log/`](build-log/).
> Tier 5 ADRs: [`architecture/decisions/`](architecture/decisions/).

## Where we are

- **Main HEAD:** `4ef4ed43ffa65a8bbfc094874ffd58f13fcdaf07`
- **Latest merged PR:** [#35](https://github.com/NiovArchitect/niov-foundation/pull/35) — ADR-0057 RECORD_CAPSULE real handler capability.
- **Active branch / PR:** `refresh-docs-wave1-record-capsule-handler` (this wave-close docs refresh).
- **Active production section:** Section 2 — Autonomous Execution Core.
- **Live `ACTION_*` emitters:** 10 of 10.
- **Real per-`ActionType` handlers:** 1 of 3 (RECORD_CAPSULE live; SEND_INTERNAL_NOTIFICATION + PROPOSE_PERMISSION_GRANT stub).
- **TypeScript baseline:** exactly 4 canonical residual errors.

## Exact next action

After this docs refresh merges:

→ Start **Wave 2** — choose between (preference order; pick the safest highest-leverage Section 2 slice given current substrate):

  1. **`[ADR-0057-RUNNING-CANCEL-BREAK-GLASS-EXECUTE-VERIFY-AUTH]`** — privileged `RUNNING → CANCELLED` on the GOVSEC.5 break-glass substrate (ADR-0050; landed) + `AbortController` plumbing for mid-attempt handler interruption. Substrate-architectural; tier-4 build-log entry expected. Crosses Action ↔ Break-glass boundary.
  2. **`[ADR-0057-ACTIONPOLICY-RETRY-BUDGET-AND-TIMEOUT-SCHEMA-QLOCK]`** — promote LOCK-GAP-1 + LOCK-GAP-2 (`RETRY_BUDGET`, `ATTEMPT_TIMEOUT_MS_DEFAULT`) from service-tier constants to schema fields. **Requires Prisma migration + cross-language Ecto parity check per ADR-0033.** Per protocol: stop unless repo discipline clearly authorizes the test-DB-only migration pattern (ADR-0025 `db:push:test` is the canonical path; this is a legitimate dev/test migration, not production).
  3. **PROPOSE_PERMISSION_GRANT real handler** — MEDIUM-risk; dual-control by default; touches multiple entities' DMW boundaries; RULE 0 sovereignty implications. Higher blast-radius than RECORD_CAPSULE; substrate exists (`createPermission` DB query) but warrants its own RULE 21 research arc.

  Recommendation per protocol: **Wave 2 = RUNNING-cancel break-glass** (preference order #1; clear substrate; ADR-0050 already landed; AbortController plumbing is a known pattern). Document the decision note inline before starting.

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
- `POST /api/v1/actions/:id/cancel` (non-RUNNING only).
- `GET /api/v1/actions/:id` (safe detail view + aggregates).
- `GET /api/v1/actions` (self-scope default; `?org_scope=true` admin).
- `GET /api/v1/org/action-policies` + `PUT /api/v1/org/action-policies` (dual-control gated).
- Executor + scheduler + expiry sweep runtime (`tickActionExecutor` + `tickActionScheduler` + `tickActionExpirySweep`).
- All 10 `ACTION_*` audit emitters.
- **RECORD_CAPSULE real handler** — RECORD_CAPSULE actions now execute through `WriteService.createCapsuleForActionRunner` and produce real `MemoryCapsule` rows in the source entity's wallet with back-referenced `CAPSULE_MUTATION_ADD` audit + SAFE `ActionResult.result_metadata` (capsule_id + capsule_type only).
- Per-`ActionType` create-time payload validator dispatcher — RECORD_CAPSULE payloads validated for `CapsuleCreateInput` shape at create-time (422 INVALID_FIELD on malformed body).

**NOT LIVE:**
- SEND_INTERNAL_NOTIFICATION real handler (no backing substrate exists; future wave).
- PROPOSE_PERMISSION_GRANT real handler (MEDIUM-risk; separate future wave).
- `RUNNING → CANCELLED` privileged cancellation.
- `ActionPolicy.retry_budget` + `ActionAttempt.timeout_ms` schema fields (service-tier constants only).
- Explicit `GET /api/v1/org/actions` route (served via `?org_scope=true` on unified list).
- ActionAttempt detail route.
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
