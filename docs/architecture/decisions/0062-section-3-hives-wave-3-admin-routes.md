# ADR-0062: Section 3 Hives Wave 3 — Admin Routes Design

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SECTION-3-WAVE-3-ADR-AND-IMPLEMENTATION-AUTH]`
(2026-05-30). The authorization explicitly approved:
(a) drafting + landing this Wave 3 design ADR, and
(b) continuing automatically into Wave 3 implementation if
the ADR identifies a substrate-safe path with no further
Founder product decision required.

## Context

ADR-0059 §Forward queue Wave 3 reserves the hive admin
route surface for separate Founder authorization, citing
the Section 4 connector admin route pattern as the design
template. Wave 1 (ADR-0059) locked the v1 scope boundary
and surfaced the substrate-state ground truth. Wave 2
(PR #88, commit `2b9ab7f`) closed the 5 RULE 0 / TAR-gate
safety gaps at the public service tier
(`HiveService.createHive` / `inviteToHive` /
`getHiveIntelligence`). Wave 3 is the org-admin governance
surface on top of that hardened substrate.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `084e637`:

- **`Hive` model** (`packages/database/prisma/schema.prisma:608-628`)
  has `status HiveStatus @default(ACTIVE)` (enum: ACTIVE |
  DISSOLVED at line 538-541), `org_entity_id String? @db.Uuid`
  (Wave 2 makes it effectively non-null at create-time via
  service-tier enforcement), `member_count Int`, `created_by
  String @db.Uuid`, `created_at` + `updated_at`. No
  `archived_by` column; no `archived_at` column. Soft-archive
  uses the existing `HiveStatus.DISSOLVED` value per RULE 10
  (no hard delete).
- **`HiveMembership` model** (`schema.prisma:635-653`) has
  `status MembershipStatus @default(ACTIVE)` (enum: ACTIVE |
  REMOVED at line 543-546), `capsule_types_contributed
  String[]`, `capsule_types_accessible String[]`,
  `access_scope` + `contribution_scope` (AccessScope:
  METADATA_ONLY | SUMMARY | FULL at line 483-487),
  `joined_at`, `expires_at`, `entity_id`. No `removed_at`
  column; `MembershipStatus = REMOVED` is the soft-remove
  signal per RULE 10. **The schema has no built-in
  `created_at` / `updated_at` on `HiveMembership`** — joined_at
  is the de-facto creation timestamp.
- **`HiveService`** (`apps/api/src/services/hive/hive.service.ts`)
  has 5 methods (createHive, inviteToHive, removeMember,
  getHiveIntelligence, buildHiveAggregate). `removeMember`
  (line 597-680) is creator-gated (`NOT_HIVE_CREATOR` failure
  when `hive.created_by !== session.entity_id`) and emits
  `HIVE_MEMBER_REMOVED` audit. No `dissolveHive` /
  `listHivesForOrg` / `getHiveAdminDetail` methods exist —
  these are the Wave 3 service-tier surface.
- **Section 4 connector admin pattern**
  (`apps/api/src/routes/connector.routes.ts:1-252`) is the
  canonical model: `preHandler: requireAdminCapability(authService,
  "can_admin_org")` on every route +
  `resolveOrgOrFail(callerId, reply)` helper that maps
  `getOrgEntityId` errors to 404 `NO_ORG_FOR_CALLER` +
  centralized `statusFor(failure)` helper + service-tier
  returns `{ ok: true; view; audit_event_id } |
  ConnectorBindingFailure` discriminated unions.
- **`requireAdminCapability` middleware**
  (`apps/api/src/middleware/admin.middleware.ts:34-82`) does
  the 4-step check (bearer shape → `validateSession(token,
  "read")` → `getTARByEntityId` → `tar[capability] !== true`
  → 403 `ADMIN_CAPABILITY_REQUIRED`). Populates
  `request.auth = { entity_id, session_id, clearance_ceiling,
  allowed_operations }`. **The session-tier op is `"read"`,
  not `"admin_org"`** — the TAR flag does the heavy lift.
- **Audit literal landscape** (`packages/database/src/queries/audit.ts`):
  5 HIVE_* literals + `ADMIN_ACTION` literal both LIVE. The
  Section 4 / Section 7 / Section 11 precedent uses
  `event_type: "ADMIN_ACTION"` + `details.action: "..."`
  discriminator for new admin mutation classes (no per-mutation
  literal added). HIVE_MEMBER_REMOVED is already the
  semantically-correct literal for any member-status flip
  ACTIVE → REMOVED, regardless of caller role.

### RULE 21 research arc

Wave 3 is **substrate-derivable cookbook** — it adds zero
new external dependencies, zero new wire-format conventions,
zero cross-application boundaries, zero cross-language
boundaries, and reuses the Section 4 / Section 7 / Section 11
admin route pattern verbatim. RULE 21 does not fire (no
substrate-architectural paste at external-library or wire-
format register).

## Decision

Wave 3 ships **four backend admin routes** following the
Section 4 connector admin pattern verbatim, with Founder-
locked answers to the 5 design questions surfaced at
Phase 0 reconnaissance.

### Sub-decision 1 — Route surface (4 routes)

1. **`GET /api/v1/org/hives`** — list hives for caller's org.
   - `preHandler: requireAdminCapability(authService, "can_admin_org")`.
   - `resolveOrgOrFail(callerId, reply)` → 404 `NO_ORG_FOR_CALLER`
     on orgless caller.
   - Optional querystring `status=ACTIVE|DISSOLVED` filter
     (422 `INVALID_FIELD` on unknown value).
   - Response: `{ ok: true; hives: HiveListItemView[] }`.
   - **No pagination at v1** — admin list reads are bounded
     by org membership and `hives` table size per-org is
     expected to be O(10s-100s); the Section 4 connector
     pattern does not paginate either. Forward-substrate if
     a real org operationally crosses O(1000+).

2. **`GET /api/v1/org/hives/:id`** — single hive detail +
   member roster.
   - `preHandler: requireAdminCapability(authService, "can_admin_org")`.
   - `resolveOrgOrFail` → 404 on orgless.
   - Enumeration-safe 404 `HIVE_NOT_FOUND` for unknown id OR
     cross-org id (single status code; no info leak about
     which case it is — mirrors connector pattern verbatim).
   - Response: `{ ok: true; hive: HiveAdminDetailView; members:
     HiveMembershipAdminView[] }`.

3. **`DELETE /api/v1/org/hives/:id`** — archive/dissolve.
   - `preHandler: requireAdminCapability(authService, "can_admin_org")`.
   - `resolveOrgOrFail` → 404 on orgless.
   - Enumeration-safe 404 `HIVE_NOT_FOUND` for unknown or
     cross-org id.
   - Soft-archive via `Hive.status = DISSOLVED` (per RULE 10).
   - **Idempotent**: if `hive.status === "DISSOLVED"` already,
     return `{ ok: true; status: "DISSOLVED"; already_dissolved:
     true; audit_event_id: null }` with NO new audit emission
     (avoids audit noise on repeat calls).
   - Active → DISSOLVED transition emits ADMIN_ACTION audit
     (see Sub-decision 5).

4. **`DELETE /api/v1/org/hives/:id/member/:entityId`** —
   admin force-remove member.
   - `preHandler: requireAdminCapability(authService, "can_admin_org")`.
   - `resolveOrgOrFail` → 404 on orgless.
   - Enumeration-safe 404 `HIVE_NOT_FOUND` for unknown or
     cross-org hive id.
   - Enumeration-safe 404 `MEMBERSHIP_NOT_FOUND` for
     unknown member or already-REMOVED member (silent
     idempotency at the membership status flip).
   - Soft-remove via `HiveMembership.status = REMOVED` + Hive
     `member_count` decrement (mirrors creator-removeMember
     transaction shape).
   - Distinct from creator-self-remove (`removeMember` on
     `HiveService` is creator-only — Wave 2 preserved that).
     Wave 3 admin force-remove is org-admin gated and works
     across the org's hives regardless of who created them.
   - AI_AGENT force-remove permitted at admin tier per
     Founder direction — see Sub-decision 4.

### Sub-decision 2 — Safe view projections

**`HiveListItemView`** (list response):
- `hive_id`, `hive_name`, `hive_type`, `status`,
  `is_default_enterprise`, `member_count`, `created_by`,
  `created_at`, `updated_at`.
- **Excluded**: `governance_terms` (forward-substrate Wave 4
  policy), `aggregate_capsule_id` (internal pointer; not
  leak-safe at admin list tier).

**`HiveAdminDetailView`** (detail response):
- All `HiveListItemView` fields PLUS `org_entity_id`
  (admin tier; same-org confirmed by the route gate).
- **Excluded**: `governance_terms` (Wave 4); `aggregate_capsule_id`
  (internal).

**`HiveMembershipAdminView`** (roster entries):
- `membership_id`, `entity_id`, `entity_type`, `display_name`
  (when populated on Entity profile; null otherwise),
  `status`, `access_scope`, `contribution_scope`, `joined_at`,
  `expires_at`, `capsule_types_accessible_count`,
  `capsule_types_contributed_count`.
- **Excluded** (forbidden per Founder direction): raw capsule
  content, payload summaries, private corrections, wallet
  internals, permission internals, bridge IDs, secret refs,
  embeddings, storage locations, content hashes, raw
  `capsule_types_accessible` array values (only the COUNT,
  not the type strings — type strings can be member-private
  signal at strict no-leak interpretation), raw
  `capsule_types_contributed` values (count only).

**Rationale for count-not-value on capsule_types_***: at v1
the admin needs to know whether a member contributes /
consumes anything (governance signal) without exposing
*what* (member-private signal). The capsule_type strings
are COSMP-domain values; admin oversight is a governance
function distinct from member intelligence access. If a
real product need surfaces for admin to see actual type
strings, it ships as a forward-substrate amendment.

### Sub-decision 3 — Idempotency semantics

- `DELETE /api/v1/org/hives/:id` is idempotent: repeat call
  on already-DISSOLVED hive returns `{ ok: true; status:
  "DISSOLVED"; already_dissolved: true; audit_event_id: null }`
  with NO new audit row.
- `DELETE /api/v1/org/hives/:id/member/:entityId` is
  idempotent: repeat call on already-REMOVED membership
  returns 404 `MEMBERSHIP_NOT_FOUND` (mirrors the existing
  `removeMember` semantic; "no active membership for that
  entity"). This is honest enumeration-safe behavior —
  unknown-id and already-removed look identical from outside.
- Idempotent paths emit NO new audit (avoids audit noise +
  preserves the principle that audit chain reflects state
  transitions, not no-op requests).

### Sub-decision 4 — AI_AGENT force-remove

Per Founder direction: org admin may force-remove AI_AGENT
members from hives where they appear (typically through
the `createTwin` standard-branch carve-out documented at
ADR-0059 §3.c). This is a cleanup / admin safety operation,
not an invitation path. Wave 2's `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE`
exclusion on `inviteToHive` stands unchanged.

The admin force-remove path treats all entity types
identically at the membership-status-flip operation; the
distinction is enforced upstream at the *invite* surface,
not the *remove* surface. This is the canonical pattern:
admins can always clean up state regardless of how it
arrived. `createTwin` is intentionally NOT modified in
Wave 3 (preserves ADR-0059 §3.c forward-substrate carve-out
disposition).

### Sub-decision 5 — Audit literal disposition

Wave 3 adds **zero new audit literals**. Per Founder
direction + Section 4 / Section 7 precedent:

- **`DELETE /api/v1/org/hives/:id`** (active → DISSOLVED
  transition) emits `event_type: "ADMIN_ACTION"` +
  `details.action: "HIVE_DISSOLVED"` + `details.hive_id` +
  `details.org_entity_id` + `details.member_count_at_dissolve`.
  No new literal; ADMIN_ACTION already exists.
- **`DELETE /api/v1/org/hives/:id/member/:entityId`**
  (admin force-remove) emits **the existing
  `HIVE_MEMBER_REMOVED` literal** (semantically correct —
  the member status flipped ACTIVE → REMOVED regardless of
  who triggered it). `details.action: "HIVE_MEMBER_FORCE_REMOVED"`
  discriminator distinguishes admin-force from creator-
  triggered removes (creator path emits same literal without
  this discriminator). `details.actor_role: "ORG_ADMIN"` +
  `details.hive_id` + `details.membership_id` +
  `details.target_entity_id`. Admin audit MUST NOT include
  raw roster fields or capsule_types_* values.
- **List + detail reads** emit NO audit row at v1
  (mirrors Section 4 connector list/get pattern). Avoids
  per-page noisy audit; admin oversight is established by
  TAR gate + same-org enforcement, not per-read audit
  trail. Forward-substrate if a regulatory regime mandates
  read audit (CAR Sub-box 7 or equivalent).

### Sub-decision 6 — Failure code surface (`HiveAdminFailure`)

New discriminated union at the admin service tier:

- `NO_ORG_FOR_CALLER` → 404 (route-tier; before service call).
- `HIVE_NOT_FOUND` → 404 (enumeration-safe; covers unknown
  + cross-org).
- `MEMBERSHIP_NOT_FOUND` → 404 (enumeration-safe; covers
  unknown + already-removed).
- `INVALID_FIELD` → 422 (e.g., unknown `status` querystring
  value).
- `INTERNAL_ERROR` → 500.

The existing `requireAdminCapability` middleware handles
401 (missing/invalid bearer) + 403 (TAR
`ADMIN_CAPABILITY_REQUIRED`) before the service tier ever
sees the request.

### Sub-decision 7 — File placement

- Routes: NEW `apps/api/src/routes/hive-admin.routes.ts`
  (separate file from `hive.routes.ts` to mirror the
  org/connector split where admin governance routes live
  apart from public product routes).
- Service: extend existing `apps/api/src/services/hive/hive.service.ts`
  with 4 new admin methods on `HiveService` —
  `listHivesForOrg(orgEntityId, filter)`,
  `getHiveAdminDetail(orgEntityId, hiveId)`,
  `dissolveHive(orgEntityId, hiveId, actorEntityId)`,
  `forceRemoveMember(orgEntityId, hiveId, memberEntityId,
  actorEntityId)`. Keeps the Wave 2 frozen-anchor
  (`HIVE_TYPE_V1_ALLOWLIST`) + 4 existing public methods
  + 4 new admin methods all in one service file (consistent
  with existing single-service-file convention for Hive).
- View projections: inline at the service file (mirrors
  connector-binding.service.ts's `projectConnectorBinding`
  pattern).
- Wiring: register the new admin routes in `server.ts`
  next to the existing `registerConnectorRoutes` call.

### Sub-decision 8 — Test surface

NEW `tests/integration/hive-wave-3-admin-routes.test.ts`
covering at minimum:

- Non-admin (no `can_admin_org`) cannot list / detail /
  dissolve / force-remove (403 `ADMIN_CAPABILITY_REQUIRED`
  on every route).
- Org admin lists only same-org hives; cross-org hives
  absent from list result.
- Org admin gets safe hive detail; cross-org id → 404
  enumeration-safe `HIVE_NOT_FOUND`.
- Member roster excludes all forbidden fields (raw
  capsule_types values; permission internals; wallet
  internals; payload summaries; bridge IDs; secret refs).
- Dissolve active hive succeeds and flips `status` to
  DISSOLVED + emits ADMIN_ACTION + HIVE_DISSOLVED audit.
- Dissolve already-DISSOLVED hive is idempotent (no new
  audit, response carries `already_dissolved: true`).
- Force-remove same-org member succeeds + flips
  `MembershipStatus` to REMOVED + emits HIVE_MEMBER_REMOVED
  audit with `details.action: "HIVE_MEMBER_FORCE_REMOVED"` +
  `details.actor_role: "ORG_ADMIN"`.
- Force-remove cross-org member / cross-org hive fails
  safely (404 enumeration-safe).
- Force-remove already-REMOVED member returns 404
  `MEMBERSHIP_NOT_FOUND` (no new audit).
- AI_AGENT force-remove works when such a member exists
  (e.g., via `createTwin` standard-branch auto-join).
- Wire-level no-leak guard: response JSON does NOT contain
  `governance_terms`, `aggregate_capsule_id`, raw
  capsule_type strings, `payload`, `payload_content`,
  `payload_summary`, `secret_ref`, `bridge_id`, or any
  other forbidden field even when those fields exist on
  the underlying rows.

## Consequences

### Positive

- Closes the Section 3 admin governance gap with zero new
  schema migration, zero new audit literals, zero new
  external dependencies.
- Reuses the Section 4 / Section 7 / Section 11 admin route
  pattern verbatim — minimal substrate-architectural
  surface area.
- Soft-archive + soft-remove preserve audit chain integrity
  + RULE 10 + Wave 2 frozen-anchor enforcement.
- Enumeration-safe 404s prevent cross-org information leak.
- Safe roster projection prevents accidental leakage of
  member-private signal (capsule_type strings reduced to
  counts).
- Idempotent dissolve + force-remove make Control Tower /
  CLI tooling integration safer (retry-safe).

### Negative / risk

- Wave 3 force-remove path reaches AI_AGENT memberships
  that landed via `createTwin` standard-branch (ADR-0059
  §3.c carve-out). This is the *cleanup* surface for the
  carve-out — admin can now remove what createTwin
  auto-joined. But it does NOT close the carve-out itself;
  the createTwin invariant is still unmodified per Founder
  direction.
- Roster `capsule_types_*_count` (not values) means an org
  admin cannot see *which* capsule types a member contributes
  or consumes from the admin surface. If product requires
  that visibility later, a forward-substrate amendment with
  separate Founder authorization is required.
- DELETE idempotency on already-DISSOLVED hive means
  callers cannot distinguish "I dissolved this" from "it
  was already dissolved" — both return success. This is
  intentional (idempotent semantics) but worth noting.

### Forward queue (Wave 3 only)

Items remaining after Wave 3 lands:

- **Member capsule_type string visibility at admin tier**
  (if product requires it; not in scope at v1).
- **Read-audit emission** for list/detail (if regulatory
  regime mandates it; not at v1).
- **Pagination on list** (if real orgs exceed O(1000+)
  hives; measure-first per ADR-0016).
- **`createTwin` standard-branch carve-out resolution**
  (ADR-0059 §3.c; future Section 5 / Section 11 slice).
- Waves 4-8+ remain forward-substrate per ADR-0059.

## Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline, Wave 3
contributes to the patent-implementation evidence trail by
operationalizing the governance surface for the Hive
substrate's portability-protection claim (per ADR-0059
patent-evidence section on `is_default_enterprise`). The
dissolve route lets an org admin formally retire a hive
when no longer needed; the force-remove route lets an org
admin reclaim membership state. Both operations preserve
the underlying audit chain + the aggregate_capsule_id
binding per US 12,517,919 capsule layer claim (soft-archive,
not hard delete).

## Bidirectional citations

- Cited from ADR-0059 §Forward queue Wave 3 — this ADR
  closes that reservation by canonicalizing Wave 3 design.
- Cites ADR-0001 (three-wallet architecture; RULE 0 source
  for same-org enforcement).
- Cites ADR-0046 (AI_AGENT entity-type-discriminated
  routing; basis for the Sub-decision 4 AI_AGENT
  force-remove rationale).
- Cites ADR-0026 (dual-control middleware pattern; admin
  capability gate canonical at `requireAdminCapability`).
- Cites Section 4 connector admin route pattern
  (`apps/api/src/routes/connector.routes.ts`) as the
  canonical model Wave 3 reuses verbatim.
- Bidirectional back-citation lands in ADR-0059 §Forward
  queue Wave 3 entry per RULE 14 + ADR-0020 §3 + RULE 20.

## Founder authorization

Per RULE 20: this ADR + its companion CLAUDE.md catalog
entry + the bidirectional back-citation amendment in
ADR-0059 are landed under explicit Founder authorization
at `[FOUNDER-SECTION-3-WAVE-3-ADR-AND-IMPLEMENTATION-AUTH]`
(2026-05-30). The authorization covered both the ADR
draft + landing and the contingent Wave 3 implementation
if the ADR identifies a substrate-safe path.
