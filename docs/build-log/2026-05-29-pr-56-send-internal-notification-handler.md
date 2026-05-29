# 2026-05-29 — PR #56 — send-internal-notification-internal-only-handler

Tier-4 build-log entry per `docs/build-log/README.md`. Qualifies
as tier-4 because it (a) lands a NEW Foundation-owned Prisma model
(`Notification`) authorized explicitly by Founder direction, (b)
introduces a NEW service substrate (`notification.service.ts`)
consumed cross-application by the ADR-0057 Action runtime, and
(c) closes the long-standing "2 of 3 real handlers" gap that has
appeared on every Section 2 status surface since PR #41 — Wave 11
delivers the third + final real per-`ActionType` handler so
Section 2's handler tier is now complete.

## Why this PR

`[ADR-0057-SEND-INTERNAL-NOTIFICATION-INTERNAL-ONLY-HANDLER]`.
Closes the priority item from the Wave 9 research arc at
`docs/research/2026-05-29-send-internal-notification-substrate-research.md`.
The Founder direction (received during the autonomous protocol;
recorded at the top of the arc) RESOLVES the §6 product-clarity
question to option (1):

> SEND_INTERNAL_NOTIFICATION must be **INTERNAL-ONLY** for the
> first implementation. Creates a governed internal Otzar
> notification only — in-app / Otzar-native notification record.
> **NO** email, SMS, Slack, push, or external app delivery. **NO**
> external side effects. External providers are forward-substrate
> as optional adapters per the EmbeddingProvider precedent
> (ADR-0043 G3.4).

Founder authorization captured at the arc's "⭐ FOUNDER
DIRECTION" block: NEW `Notification` Prisma model schema
creation explicitly authorized; NEW audit literals
(`NOTIFICATION_DISPATCHED` / `_DELIVERY_FAILED` /
`_OPT_OUT_RESPECTED`) remain forward-substrate (RULE 20-gated
for a future wave).

## What landed

**Branch:** `adr-0057-send-internal-notification-internal-only-handler` (squash-merged + deleted).
**Squash commit:** `e2ebfe84df1bfe3f08c307d68290f4347a9ddde2`.
**Diff:** 19 files (3 NEW + 16 MOD); 1431 insertions / 59 deletions.

### NEW files

- `apps/api/src/services/notification/notification.service.ts` —
  `makeNotificationService()` factory + `NotificationService`
  interface + `createInternalNotification` implementation.
  Cross-org default DENY via `EntityMembership(parent=org,
  child=recipient, is_active=true)` lookup (RULE 0) + recipient
  `TAR.status === ACTIVE` check + Prisma `notification.create`
  with the JSON-null sentinel handling for the optional
  `body_redacted`. Returns SAFE projection
  (`notification_id` + `recipient_entity_id` +
  `notification_class` + `created_at` only — NEVER body
  content). Service-tier codes: `CROSS_ORG_DENIED` /
  `RECIPIENT_NOT_FOUND` / `RECIPIENT_NOT_ACTIVE`. Membership
  check fires BEFORE existence check by design (defense-in-depth
  against information-leakage about which recipient IDs exist
  outside the source's org).
- `tests/unit/send-internal-notification-validator.test.ts` —
  15 unit tests covering the new validator: happy +
  missing-required + UUID-invalid + bounded-length rejections
  (`notification_class > 64` chars, `body_summary > 200` chars)
  + non-object body_redacted (string / array) + oversized
  body_redacted (`> 4096 bytes` JSON) + null body_redacted
  treated as undefined.
- `tests/integration/action-send-internal-notification-handler.test.ts` —
  7 end-to-end integration tests:
  1. Happy path: full Action → handler → `Notification` row
     created + `ACTION_SUCCEEDED` audit + SAFE
     `result_metadata` (notification_id + recipient_entity_id
     + notification_class + status only) + no body leak in
     audit details OR result_metadata for either
     `body_summary` OR `body_redacted.secret_key`.
  2. Cross-org DENY (RULE 0): recipient in different org →
     handler FAILURE with `NOTIFICATION_CROSS_ORG_DENIED` +
     no `Notification` row written.
  3. Unknown recipient (well-formed UUID for non-existent
     entity) → handler FAILURE with
     `NOTIFICATION_CROSS_ORG_DENIED` (membership lookup denies
     before existence reveal — defense-in-depth).
  4. Recipient TAR `SUSPENDED` → handler FAILURE with
     `NOTIFICATION_RECIPIENT_NOT_ACTIVE` + no `Notification`
     row.
  5. Create-time 422 `INVALID_FIELD` when
     `recipient_entity_id` is missing.
  6. Create-time 422 when `recipient_entity_id` is not a UUID.
  7. Create-time 422 when `body_summary` exceeds 200 chars.

### MOD files

- `packages/database/prisma/schema.prisma` — NEW
  `Notification` model (8 columns + 3 indexes; `@@map` to
  `notifications`). See §Architectural disclosures below for
  the read-state-from-columns design choice.
- `apps/api/src/services/action/action-payload-validators.ts`
  — NEW `validateSendInternalNotificationPayload` (required:
  `recipient_entity_id` UUID + `notification_class` 1..64 chars
  + `body_summary` 1..200 chars; optional: `body_redacted`
  plain object capped at 4096-byte JSON). Replaces
  `validateStubPayload` in the dispatcher `switch` for
  `SEND_INTERNAL_NOTIFICATION`. Stub kept available for future
  ActionType additions that land in stub mode first per
  ADR-0021.
- `apps/api/src/services/action/handlers.ts` — NEW
  `makeSendInternalNotificationHandler(notificationService)`
  replaces the stub in `buildHandlerMap`. `HandlerActionInput.Pick`
  extended with `org_entity_id` (for cross-org DENY).
  `ActionHandlerRegistryDeps` extended with
  `notificationService`. Service-tier codes mapped to stable
  `error_class` strings the audit row can carry:
  `NOTIFICATION_RECIPIENT_NOT_FOUND` /
  `NOTIFICATION_RECIPIENT_NOT_ACTIVE` /
  `NOTIFICATION_CROSS_ORG_DENIED` /
  `NOTIFICATION_PAYLOAD_INVALID`. SAFE
  `result_metadata = { handler, action_type, notification_id,
  recipient_entity_id, notification_class, status }` — NEVER
  body content.
- `apps/api/src/services/action/executor.ts` — passes
  `action.org_entity_id` through `HandlerActionInput`
  alongside the existing fields.
- `apps/api/src/server.ts` — `buildApp` constructs
  `makeNotificationService()` and injects alongside
  `writeService` into `makeActionHandlerRegistry`. All 3
  ActionType handlers are now real in prod.
- `apps/api/src/index.ts` — barrel re-exports for the new
  service + 4 types.
- `docs/research/2026-05-29-send-internal-notification-substrate-research.md`
  — amended at top with the "⭐ FOUNDER DIRECTION" block.
- `tests/unit/action-payload-validators.test.ts` — dispatcher
  test for `SEND_INTERNAL_NOTIFICATION` updated from
  "stub accepts any object" to "real validator rejects
  shape-only payload (Wave 11)" + NEW positive case mirroring
  the Wave 4 PROPOSE_PERMISSION_GRANT precedent.
- 9 pre-existing integration test files (`action-lifecycle`,
  `action-cancel`, `action-get`, `action-list`,
  `action-attempt-detail`, `action-attempt-list`,
  `action-policy-overrides`, `actions-create`,
  `action-send-internal-notification-handler` setup-removal)
  updated to supply real validator-compliant payloads.
  Self-notification default (`recipient_entity_id =
  caller.entityId`) keeps test fixture surface area small. 4
  stub-`result_summary` assertions updated to the new
  `internal_notification_dispatched:<id_prefix>` pattern.

## Architectural disclosures

### Read state from columns (no enum)

`Notification.read_at` is nullable timestamp; `deleted_at`
nullable timestamp. Derived state:

- **UNREAD**: `deleted_at IS NULL AND read_at IS NULL`
- **READ**: `deleted_at IS NULL AND read_at IS NOT NULL`
- **DISMISSED**: `deleted_at IS NOT NULL` (RULE 10 soft-delete)

No `NotificationStatus` enum landed at Wave 11. Rationale:
fewer schema commitments at sub-phase 1; the column-derivation
pattern matches existing audit/timestamp precedents; an enum
can be added later via the ADR-0021 extension protocol if a
future surface needs an explicit `status` column for query
ergonomics.

### Cross-org default DENY check order

The service intentionally runs the membership lookup
**before** the recipient-existence lookup. A caller submitting
an arbitrary UUID for `recipient_entity_id` cannot distinguish
"this UUID doesn't exist" from "this UUID exists but isn't in
your org" — both surface as `CROSS_ORG_DENIED`. This is
defense-in-depth against information-leakage about which
recipient IDs exist outside the source's org.

The existence + TAR-ACTIVE check still runs (preserves
`RECIPIENT_NOT_FOUND` / `RECIPIENT_NOT_ACTIVE` for
in-same-org callers who hit the path), but only after
membership has affirmatively confirmed the recipient is in
the same org.

### No new audit literals

The canonical 10-literal `ACTION_*` vocabulary covers the
lifecycle:

- `ACTION_PROPOSED` → `ACTION_APPROVED` → `ACTION_SCHEDULED`
  → `ACTION_STARTED` → (`ACTION_SUCCEEDED` | `ACTION_FAILED`)

The handler's `result_metadata` includes `notification_id` so
forensic queries can join from the audit row back to the
`Notification` row.

A future per-Notification audit literal (`NOTIFICATION_DISPATCHED`
/ `_DELIVERY_FAILED` / `_OPT_OUT_RESPECTED`) remains
forward-substrate per RULE 20 + the Wave 9 research arc §4
item 5; the Founder direction explicitly preserved this gate.

### body_redacted vs body_summary

`body_summary` is bounded (1..200 chars) and intended for
inbox-list views (caller's "DUAL_CONTROL_REQUEST: approval
needed for X"). `body_redacted` is optional JSON capped at
4096 bytes for richer payload that the future inbox
detail-view UX can render. The caller is responsible for
redacting sensitive content; the validator enforces bounds +
shape. Body content is persisted on the `Notification` row
and is NEVER copied into `ActionResult.result_metadata` or
audit details — the result_metadata projection is hand-curated
to a SAFE allowlist (see Wave 11 §SAFE result_metadata above).

### Receiver-owned opt-out is forward-substrate

No `NotificationPreference` model lands at Wave 11. The
Founder direction's "sub-phase 1 minimal" framing
deliberately defers per-receiver opt-out to a future wave
that will need its own QLOCK. Receivers cannot currently
mark themselves as no-notifications; the substrate sends to
whoever the caller specifies as long as RULE 0 cross-org
DENY + TAR-ACTIVE check pass.

### Cross-language ownership

The `Notification` model is TypeScript-owned per ADR-0033
§Decision 7 + Q-5BII-EXEC-5. No Ecto mirror lands at Wave 11.
If a future Elixir/BEAM consumer surfaces (forward-substrate
per ADR-0028 §Forward Queue / ADR-0030), an Ecto mirror would
land at that time per the established two-tier naming pattern.

### Pre-existing test fixture impact

Wave 11 promoted `SEND_INTERNAL_NOTIFICATION` from a stub
validator to a real validator. Every pre-existing test that
used `SEND_INTERNAL_NOTIFICATION` as a stub-validator-friendly
test fixture (the canonical convenience choice; the simplest
ActionType prior to Wave 11) now needs to supply a real
validator-compliant payload. Updated 9 test files
(`action-lifecycle`, `action-cancel`, `action-get`,
`action-list`, `action-attempt-detail`, `action-attempt-list`,
`action-policy-overrides`, `actions-create`,
`action-payload-validators` unit dispatcher); 4 stub
`result_summary` assertions updated. Self-notification
(recipient = source caller) is the default fixture pattern
chosen because it requires zero additional test setup +
preserves cross-org DENY semantics (self is trivially a
member of self's own org). Tests that need explicit recipient
scenarios (cross-org / unknown / SUSPENDED) construct those
explicitly in the new handler test file.

## Risks accepted

- **No receiver-owned opt-out at Wave 11** — documented above;
  future QLOCK-gated wave required.
- **No new audit literals at Wave 11** — documented above;
  RULE 20-gated.
- **Membership check fires before existence reveal** —
  intentional information-leakage defense; recipient
  enumeration is harder for an attacker than enumerating
  Action IDs.
- **body_summary + body_redacted persisted on the
  `Notification` row** — the row IS the inbox payload; the
  no-leak contract applies to `ActionResult.result_metadata`
  + audit details, NOT the notification row itself (which is
  the operator's intentional payload). Future inbox-list /
  detail-view routes (no route at Wave 11) will need their
  own SAFE projection contract.
- **No inbox routes at Wave 11** — the substrate exists +
  rows persist; a `GET /api/v1/notifications` inbox + `PUT
  /api/v1/notifications/:id/read` would be a separate wave
  (with their own SAFE-projection contracts + RULE 0 self-
  scope authorization spine + integration tests).

## What this PR did NOT do

- Did NOT add any external delivery (email / SMS / Slack /
  push). Internal-only.
- Did NOT add a `NotificationProvider` abstraction. The
  service is a single concrete implementation; the pluggable
  abstraction is forward-substrate when an external adapter
  needs it (per the EmbeddingProvider precedent).
- Did NOT add inbox routes (`GET /api/v1/notifications` /
  read-receipt PUT). Substrate is callable from the Action
  runtime; UX surface is forward-substrate.
- Did NOT add a `NotificationPreference` opt-out model.
- Did NOT add new audit literals.
- Did NOT promote the schema to production (dev/test only).
- Did NOT add a `NotificationClass` enum (free-form string at
  sub-phase 1 per ADR-0021 extension-protocol precedent).

## Verification

- **CI run:** `26660182118` — 4/4 green (after the
  intermediate failure on the pre-existing dispatcher unit
  test that asserted the old stub behavior; fixed in the
  follow-on commit on the same branch).
  - Typecheck (strict 4-error baseline): pass (35s)
  - Unit tier (371 tests): pass (1m 11s)
  - Integration tier (111 tests + 1 skipped): pass (1m 31s)
  - Elixir tier (compile + test): pass (1m 47s)
- **TypeScript baseline:** preserved at exactly 4 canonical
  residuals.
- **Local pre-push gates:** db-push guard ✓; typecheck
  baseline 4 ✓; RULE 16 no-console ✓; no-leak guard ✓.
- **Local Section 2 integration regression:** 126 / 126
  green (13 files including the new Wave 11 handler file).
- **mergeStateStatus:** CLEAN; merged via squash; branch
  deleted.
- **Main HEAD after merge:** `e2ebfe84df1bfe3f08c307d68290f4347a9ddde2`.

## Lineage

- Cites: RULE 0 (cross-org default DENY); RULE 4
  (audit-before-response — rides existing `ACTION_*`
  literals); RULE 10 (soft-delete = DISMISSED); RULE 13
  (substrate-honest disclosure that external delivery is NOT
  live); RULE 20 (Founder direction authorized the NEW
  Prisma model; new audit literals remain RULE-gated);
  ADR-0021 (extension protocol precedent for the
  free-form `notification_class` string + future enum
  promotion); ADR-0025 (canonical `db:push:test` dev/test
  migration pattern via `scripts/local-test-db-refresh.sh`);
  ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (cross-language
  ownership boundary; no Ecto mirror at Wave 11); ADR-0043
  G3.4 (EmbeddingProvider precedent for the future
  NotificationProvider pluggable abstraction); ADR-0046
  (membership-based cross-tenant DENY precedent);
  ADR-0047 PR.3 (canonical local-test-db-refresh script
  for cross-language ownership reconciliation); ADR-0048
  (governed orchestration substrate precedent); ADR-0050
  (GOVSEC.5 break-glass; the notification surface is a
  potentially high-blast-radius surface and the future
  mass-notify wave should consider dual-control / break-glass
  gating per ADR-0050); ADR-0052 (Otzar DGI doctrine — the
  notification substrate is governed coordination, NOT
  surveillance); ADR-0057 §1 + §11 (Action runtime that
  drives this handler); Wave 9 research arc
  (`docs/research/2026-05-29-send-internal-notification-substrate-research.md`).
- Cited by (forward): future inbox-routes wave (will consume
  the `Notification` model); future `NotificationPreference`
  opt-out wave (will land receiver-owned opt-out); future
  external-adapter waves (email / SMS / Slack / push) — each
  needs its own Founder QLOCK + RULE 21 research arc per the
  Wave 9 §3 catalog; future per-Notification audit literals
  wave (`NOTIFICATION_DISPATCHED` / `_DELIVERY_FAILED` /
  `_OPT_OUT_RESPECTED` per Wave 9 §4 item 5 — RULE-20-gated);
  future `NotificationClass` enum promotion wave (per
  ADR-0021 extension protocol if a future surface needs
  type-safety on the class label).
- Section file: [`../current-build-state/02-autonomous-execution-core.md`](../current-build-state/02-autonomous-execution-core.md).
