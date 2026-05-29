# 2026-05-29 — PR #35 — record-capsule-handler

Tier-4 build-log entry per `docs/build-log/README.md`. This PR
qualifies as a tier-4 build-log entry because it (a) introduces a
new privileged system-path on WriteService, (b) refactors the
action handler module from pure to dependency-injected at a
substrate-architectural register, and (c) crosses the
Action ↔ COSMP boundary for the first time.

## Why this PR

[ADR-0057-RECORD-CAPSULE-HANDLER-EXECUTE-VERIFY-AUTH]. Closes the
priority-1 forward-substrate item from PR #34's docs split:
first real per-`ActionType` handler. RECORD_CAPSULE is the
lowest-blast-radius surface because it owner-writes to the
source entity's own wallet only — never touches another entity's
DMW — and reuses the mature `WriteService.createCapsule`
pipeline (encryption, embedding, storage, jurisdiction cascade,
audit) through a narrow system-path variant.

Founder authorization: 8-hour autonomous protocol with explicit
anti-fragmentation directive ("treat validation + handler +
WriteService + handler registry wiring + executor injection +
tests + audit/no-leak proof + PR merge + docs truth as one
coherent capability wave, not separate loops").

## What landed

**Branch:** `adr-0057-record-capsule-handler` (squash-merged + deleted).
**Squash commit:** `4ef4ed43ffa65a8bbfc094874ffd58f13fcdaf07`.
**Diff:** 15 files, 1,770 insertions / 154 deletions.

### NEW files

- `apps/api/src/services/action/action-payload-validators.ts` —
  per-`ActionType` create-time payload validator registry.
  `validateRecordCapsulePayload` enforces the `CapsuleCreateInput`
  contract: required `capsule_type` (enum-validated against the
  Prisma `CapsuleType` enum mirror) + `topic_tags` non-empty
  string array + `payload_summary` non-empty + `content`
  non-empty + content size cap at
  `RECORD_CAPSULE_MAX_CONTENT_BYTES = 256 KiB`. Optional fields
  (`decay_type`, `decay_rate`, `storage_tier`,
  `clearance_required`, `connected_capsule_ids`,
  `connected_entity_ids`, `monetization_enabled`,
  `monetization_category`, `expires_at`, `ai_access_blocked`,
  `requires_validation`, `write_reason`) validated only when
  present. `validateStubPayload` no-op for ActionTypes whose
  real handler has not yet landed. `validatePayloadForActionType`
  dispatcher.
- `tests/unit/action-payload-validators.test.ts` — 33 unit tests.
- `tests/integration/action-record-capsule-handler.test.ts` — 5
  integration tests (create-time 422 paths + happy-path
  end-to-end + TAR-demoted + wallet-missing).

### MOD files

- `apps/api/src/services/action/action.service.ts` —
  `validateCreateActionBody` dispatches into the per-type
  validator after the route-shape check. 422 INVALID_FIELD on
  malformed payload at create-time so no malformed Action enters
  the executor queue.
- `apps/api/src/services/cosmp/write.service.ts` — NEW
  `createCapsuleForActionRunner({ actor_entity_id, action_id,
  input, context? })` system-path. Defensive `validateCreateInput`
  re-run + defensive TAR re-check (status === ACTIVE +
  can_write_capsules === true; failure returns
  OPERATION_NOT_PERMITTED which the handler maps to
  `error_class = "TAR_DEMOTED"`). Owner-write to actor's wallet;
  jurisdiction cascade from actor Entity (immutable per
  ADR-0037 Sub-decision 5); storage upload outside transaction
  (preserves D-STORAGE-DB-ATOMICITY-BOUNDARY discipline);
  embedding generation graceful-degrade; transactional
  `capsule.create` + raw SQL embedding update +
  CAPSULE_MUTATION_ADD audit emission with
  `details.action_id` back-reference + `session_id: null`.
- `apps/api/src/services/action/handlers.ts` — pure module →
  `ActionHandlerRegistry` with DI. `makeActionHandlerRegistry({
  writeService? })` returns a registry whose RECORD_CAPSULE
  handler is real when WriteService is provided; otherwise
  stub. `setDefaultActionHandlerRegistry` replaces the
  module-level default; `executeActionHandler(action)` surface
  preserved for the executor's call site.
- `apps/api/src/services/action/executor.ts` — passes
  `action.source_entity_id` through to the handler (the
  RECORD_CAPSULE handler needs it for system-path attribution).
  `HandlerActionInput` widened from `Pick<Action, "action_id" |
  "action_type" | "payload_redacted">` to also include
  `source_entity_id`.
- `apps/api/src/server.ts` — wires
  `setDefaultActionHandlerRegistry(makeActionHandlerRegistry({
  writeService }))` immediately before `startActionScheduler` so
  the executor's first tick runs against the real registry.
- `apps/api/src/index.ts` — barrel re-exports for the validator
  + registry constructor + type aliases.
- 5 existing Section 2 integration test files + 1 unit test —
  fixture migration from RECORD_CAPSULE placeholder payload
  (`{ kind: "capsule", title: "test" }`) to
  SEND_INTERNAL_NOTIFICATION (stub validator default; same
  retry budget so the retry-exhaustion lifecycle test
  preserves intent). Canonical RECORD_CAPSULE real-handler
  tests live in the new integration file. Stub assertions
  updated `stub_record_capsule_ok` →
  `stub_send_internal_notification_ok`.

## Architectural disclosures

### Why a system-path on WriteService (not on the handler module)

The action handler runs asynchronously from any session. The
caller's bearer token is not stored. Two alternatives existed:

1. **Mint a synthetic session** for the source entity inside
   the handler — security hazard; creates a credential-issuance
   surface with no auth event.
2. **Persist the original session token** — credential-storage
   anti-pattern; tokens are intentionally short-lived.

The chosen path adds a narrow privileged method on WriteService
that accepts `actor_entity_id` directly. The gating discipline:

- The method is **not callable from any route**. Only the action
  handler registry invokes it.
- The gate is that the Action **already passed policy evaluator
  + dual-control** before reaching the executor. The TAR was
  consulted at create-time policy decision; the handler
  defensively re-checks at execute-time so a TAR demote between
  the two takes effect.
- Audit attribution carries `actor_entity_id = source_entity_id`
  + `details.action_id` back-reference + `session_id: null`. Any
  misuse is forensically visible.

This mirrors the canonical precedent at
`apps/api/src/services/governance/system-permission.ts`
(`createSystemPermission`), used by Dandelion + createTwin to
install standing permissions without going through session-bound
`createPermission`. RULE 13: this pattern is the established
"server-side action on entity's behalf without a live session"
precedent in the repo.

### Why a registry pattern for handlers

Pre-wave, `handlers.ts` was a pure module exporting
`executeActionHandler(action)`. The real RECORD_CAPSULE handler
needs WriteService — and future real handlers will need other
services (notification gateway, permission service, etc).
Dependency injection at the handler module is the canonical
TypeScript pattern; the alternative (importing WriteService
directly inside `handlers.ts`) would create a circular import
risk and prevent test substitution.

The chosen path:

- `ActionHandlerRegistry` is the dispatch contract.
- `makeActionHandlerRegistry({ writeService? })` constructs a
  registry with the supplied dependencies; the writeService
  argument is optional so test paths that import
  `executeActionHandler` before `buildApp` runs still get a
  stub-only registry.
- `setDefaultActionHandlerRegistry(registry)` replaces the
  module-level default. `server.ts` calls this once at boot
  with the real WriteService injected.
- `executeActionHandler(action)` surface is preserved; it
  dispatches through the module-level default registry. The
  executor's call site changes only to pass through
  `source_entity_id`.

### TAR_DEMOTED mapping discipline

`WriteFailure.code` is a closed union (12 variants). Adding
`TAR_DEMOTED` to the union would force every WriteService
caller (createCapsule, updateCapsule, shareCapsule) to handle
a code that's only reachable from the system-path branch. RULE
13 path: the system-path returns `OPERATION_NOT_PERMITTED` (the
semantically-closest existing code) and the handler maps to
`error_class = "TAR_DEMOTED"`. Audit denial_reason at the
WriteService tier still records the specific reason
("TAR_DEMOTED") via the `auditDenial` helper. Keeps the union
closed by construction without losing forensic specificity.

### result_metadata payload-free contract

The handler returns `{ handler: "record_capsule", action_type,
capsule_id, capsule_type }` — never `content`,
`payload_summary`, `payload_redacted`, `storage_location`,
`content_hash`, embedding vectors. The integration test seeds
distinct secret values in both the outer `Action.payload_summary`
and the inner `payload_redacted.content` then asserts both are
absent from:

1. The persisted `ActionResult.result_metadata`.
2. The `CAPSULE_MUTATION_ADD` audit row details.
3. The `ACTION_SUCCEEDED` audit row details.

The capsule's own `payload_summary` field is sourced from
`payload_redacted.payload_summary` (the inner CapsuleCreateInput
field). This is not a leak — the inner field is what the caller
*intended* to land on the capsule; the outer Action.payload_summary
is the action-tier audit-input. RULE 13: both surfaces are
legitimately distinct.

### Test fixture cascade

Pre-wave, 5 existing Section 2 integration test files used
RECORD_CAPSULE as the default fixture action_type with a
placeholder `{ kind: "capsule", title: "test" }` payload. The
new per-type validator (correctly) rejects that shape as
INVALID_FIELD because it lacks `capsule_type`, `topic_tags`,
and `content`. RULE 13 path chosen: migrate the existing tests
to use `SEND_INTERNAL_NOTIFICATION` (stub validator path; same
RETRY_BUDGET = 3 so the retry-exhaustion lifecycle test
preserves intent) and put the canonical RECORD_CAPSULE
real-handler tests in the new
`tests/integration/action-record-capsule-handler.test.ts`. This
keeps the pre-wave tests focused on lifecycle / cancel / get /
list semantics (handler-agnostic) and the new tests focused on
real-handler semantics.

## Risks accepted

- **New privileged system-path** on WriteService. Mitigated by
  the gating discipline above (registry-only callable; audit
  back-reference; defensive TAR re-check).
- **Handler registry refactor** changes the action handler
  module's exported surface. Mitigated by preserving
  `executeActionHandler(action)` as the executor's call site
  (only the input shape widened by one field).
- **Fixture migration touched 6 test files.** Mitigated by
  running the full 71-test Section 2 integration suite +
  221-test unit suite green before commit.

## What this PR did NOT do

- Did NOT implement SEND_INTERNAL_NOTIFICATION real handler.
- Did NOT implement PROPOSE_PERMISSION_GRANT real handler.
- Did NOT implement RUNNING → CANCELLED privileged cancellation.
- Did NOT promote LOCK-GAP-1 / LOCK-GAP-2 to schema fields.
- Did NOT touch Control Tower / connectors / MCP / voice / lens UX.
- Did NOT modify schema, migrations, package.json, or
  generated client.
- Did NOT run `prisma generate` or `db:push:test`.
- Did NOT add a new route or PrivilegedEndpoint.

## Verification

- **CI run:** `26646909230` — 4/4 green.
  - Typecheck (strict 4-error baseline): pass (38s)
  - Unit tier (371 tests): pass (1m 29s)
  - Integration tier (111 tests + 1 skipped): pass (2m 3s)
  - Elixir tier (compile + test): pass (2m 3s)
- **TypeScript baseline:** preserved at exactly 4 canonical residuals.
- **Local pre-push gates:** db-push guard ✓; typecheck baseline 4 ✓;
  RULE 16 no-console ✓; no-leak guard ✓.
- **Unit tests:** 221 pass (33 NEW for validators + 188 existing).
- **Section 2 integration tests:** 71 pass across 8 files (5 NEW
  record-capsule + 6 lifecycle + 10 cancel + 10 list + 9 get +
  12 create + 11 org-policies + 8 dual-control).
- **mergeStateStatus:** CLEAN; merged via squash; branch deleted.
- **Main HEAD after merge:** `4ef4ed43ffa65a8bbfc094874ffd58f13fcdaf07`.

## Lineage

- Cites: ADR-0057 §3 + §10 + §11; ADR-0021 (deliberate-blocker
  per-type validator pattern); ADR-0026 (BEAM-compat pattern 3
  "state reconstructible from durable storage"); ADR-0037
  Sub-decision 5 (jurisdiction cascade); RULE 0; RULE 4
  (audit-before-response); RULE 13 (substrate-honest disclosures).
- Cited by (forward): future PROPOSE_PERMISSION_GRANT handler
  wave; future RUNNING-cancel break-glass wave (the
  AbortController plumbing will use the same handler-registry
  pattern); future per-type real-handler waves; future
  Control Tower Action Detail surface (consumes
  `result_metadata.capsule_id` for capsule-detail drilldown).
- Section file: [`../current-build-state/02-autonomous-execution-core.md`](../current-build-state/02-autonomous-execution-core.md).
