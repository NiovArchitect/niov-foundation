# Section 3 — Hives / Team Intelligence

> Detailed canonical record for production Section 3. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Team / hive intelligence — scoped, governed coordination across
employees of one organization. Per ADR-0052 doctrine: Twins
operate inside RBAC / ABAC parity, never above the humans they
extend; Twin-to-Twin coordination exchanges only minimum
relevant information; no cross-tenant leakage; no hidden
autonomy. Per ADR-0059 v1 design boundary (2026-05-30):
same-org-scoped read-only aggregate projection at v1; cross-org
hives + Twin-to-Twin proactive runtime are explicit non-goals
deferred to forward-substrate.

## Current status — PRODUCTION-GRADE COMPLETE for v1 same-org Foundation backend scope

**Final closeout 2026-05-30.** Section 3 Foundation backend
substrate for v1 same-org Hives / Team Intelligence is
production-grade complete after the 5-wave arc closure
(Waves 1+2+3+4+5 LIVE; closeout audit verified no remaining
v1 backend blockers).

**Important scope wording**: this does NOT mean all future
Hives / Team Intelligence product work is complete. It means
the **Foundation backend substrate for v1 same-org Hives** is
production-grade complete. Future Hives / Team Intelligence
product capabilities continue as forward-substrate behind
separate Founder authorization at their respective slices.

### Closeout summary

- **8 live routes** — 4 public product surface
  (`hive.routes.ts`) + 4 admin governance surface
  (`hive-admin.routes.ts`).
- **10 HiveService methods** — 6 public (`createHive`,
  `findDefaultEnterpriseHive`, `inviteToHive`,
  `removeMember`, `getHiveIntelligence`,
  `buildHiveAggregate`) + 4 admin (`listHivesForOrg`,
  `getHiveAdminDetail`, `dissolveHive`,
  `forceRemoveMember`).
- **Wave 4 governance evaluator** — pure-function
  `governance-terms-evaluator.ts` with 9 of 10 v1 terms
  wired (`require_admin_approval_for_invites` deferred
  pending future admin invite path).
- **Wave 5 Hive Events producer spine** — `hive-events.ts`
  with `HiveEventBus` publishing 5 closed-vocab events on
  same-org-scoped topics; SAFE payload projection
  enforced by type construction; substrate wired but
  dormant at `server.ts` pending first live consumer
  slice.
- **82 Section-3-specific test cases** (14 unit + 15
  Wave 2 + 20 Wave 3 + 20 Wave 4 + 13 Wave 5) all green;
  cross-section regressions (dandelion + feedback Loop 4)
  green.
- **Zero schema migrations** across all 5 waves.
- **Zero new audit literals** across all 5 waves; 5
  pre-existing HIVE_* literals + ADMIN_ACTION
  discriminator pattern cover the full surface.
- **RULE 0 same-org sovereignty** enforced at 6 distinct
  enforcement points (createHive org_entity_id /
  inviteToHive same-org membership / hive_type allowlist /
  AI_AGENT exclusion / admin route `resolveOrgOrFail` /
  Wave 5 topic-schema construction).
- **No-leak protections** enforced at 6 distinct surfaces
  (Wave 2 message scrub / Wave 3 SAFE view projections /
  Wave 4 governance error messages / Wave 4 zero-state
  audit / Wave 5 typed envelope / Wave 5 cross-org topic
  isolation); each verified with wire-level
  substring/secret-marker integration tests.
- **TypeScript baseline** preserved at exactly 4
  canonical residuals.

### Closeout milestone PRs

| PR | Wave | Commit |
|---|---|---|
| #85 | Wave 1 ADR-0059 design + substrate-honest correction | `11ae5e5` |
| #88 / #89 | Wave 2 service-tier safety enforcement + docs | `2b9ab7f` / `084e637` |
| #90 / #91 / #92 | Wave 3 admin routes design + impl + docs | `0886211` / `9a348be` / `d98dc9f` |
| #93 / #94 / #95 | Wave 4 governance_terms evaluator design + impl + docs | `ebc56c5` / `065e4f1` / `548539c` |
| #96 / #97 / #98 | Wave 5 Hive Events producer design + impl + docs | `2a241f1` / `056c7c7` / `5c2308f` |

### Forward-substrate (NOT in v1 production scope)

Each item is forward-substrate per ADR-0059 / ADR-0062 /
ADR-0063 / ADR-0064 forward queues; requires separate
Founder authorization at its slice:

- `require_admin_approval_for_invites` Wave 4 term —
  paired with future admin invite path.
- `HIVE_GOVERNANCE_ZERO_STATE` Wave 5 event — paired with
  future consumer use case.
- Default `HiveEventBus` instantiation at `server.ts` —
  paired with first live consumer slice.
- Wave 4 Layer 2 enterprise governance policy registry
  (`OrgGovernancePolicy` model).
- Wave 4 Layer 3 external governance source feeds
  (`GovernanceSource` + version + review-item models;
  monthly/quarterly default cadence; 7-step lifecycle).
- BEAM bridge / Phoenix.PubSub consumer half
  (cross-language; RULE 21 fires at slice).
- Broadway guaranteed delivery (Wave 6).
- Hive weighting algorithm (Wave 7).
- Twin-to-Twin proactive runtime (Wave 8+ per ADR-0052 §8).
- Otzar Twin subscription.
- Control Tower WebSocket bridge (frontend; lives in
  `otzar-control-tower`).
- Section 4 connector fan-out bridge.
- Cross-org Hives.
- AI-generated executive summaries (Founder product
  decision).
- `createTwin` standard-branch AI_AGENT carve-out
  resolution (ADR-0059 §3.c; twin-architecture cascade
  cost).

**Wave 1 (design)** — ADR-0059 LANDED 2026-05-30 (PR #85)
locking v1 scope as same-org-scoped read-only aggregate
projection. Substrate-honest correction in the same wave
surfaced that the on-main data + service tier was already
substantially complete (`Hive` + `HiveMembership` models;
`HiveService` 5 methods; `hive.routes.ts` 4 routes; 5
HIVE_* audit literals) but with 5 RULE 0 safety gaps that
Wave 2 was authorized to close.

**Wave 2 (service-tier safety enforcement)** — LANDED
2026-05-30 (PR #88). All 5 Founder Authorization checkpoints
landed as BREAKING-but-coherent tightening in one commit:

- **TAR `can_create_hives` gate** on `POST /api/v1/hive` —
  `validateSession` op switched from `"share"` to
  `"create_hives"`; absent capability → 403 `OPERATION_NOT_PERMITTED`.
  BREAKING for any un-gated caller.
- **v1 hive_type allowlist** —
  `HIVE_TYPE_V1_ALLOWLIST` frozen-anchor set holding ENTERPRISE
  + PERSONAL_NETWORK; CROSS_ORGANIZATION + DEVICE_NETWORK +
  GOVERNMENT rejected at service tier with 422
  `INVALID_HIVE_TYPE_FOR_V1`. Enum values reserved in schema
  for forward-substrate Waves 8+.
- **Non-null `org_entity_id` required at create** — explicit
  null → 422 `ORG_ENTITY_ID_REQUIRED`; undefined → derive via
  `getOrgEntityId(callerEntityId)` from `EntityMembership`;
  orgless caller → 422 `ORG_ENTITY_ID_REQUIRED`; string →
  trust (preserves `dandelion.service.ts` default-enterprise
  flow where the org's own id is its `org_entity_id`).
- **Same-org membership check on `inviteToHive`** —
  `EntityMembership` lookup with `parent_id = hive.org_entity_id`
  + `child_id = invitee` + `is_active = true`; cross-org →
  403 `CROSS_ORG_INVITE_DENIED` with message scrubbed of
  cross-org details (mirrors Wave 11
  `notification.service.ts:99-109` no-info-leak pattern).
  RULE 0 enforcement.
- **AI_AGENT exclusion on `inviteToHive`** — invitee
  `entity_type === "AI_AGENT"` → 403
  `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE` per ADR-0046
  entity-type-discriminated routing + RULE 0 AI ceilings.
- **`capsule_types_accessible` read-time enforcement on
  `getHiveIntelligence`** — empty access list → zero-state
  response (`intelligence: null`) + `HIVE_INTELLIGENCE_READ`
  audit row with `details.zero_state_reason =
  "EMPTY_CAPSULE_TYPES_ACCESSIBLE"`. Non-empty access list →
  existing aggregate-decryption path. BREAKING for default-
  empty memberships.

**Substrate-honest carve-out per ADR-0059 §3.c.** The
`createTwin` standard-branch at
`apps/api/src/services/governance/twin.service.ts:296-326`
auto-joins AI_AGENT twins into default-enterprise Hives via
internal `tx.hiveMembership.create` — it BYPASSES
`HiveService.inviteToHive`. Wave 2 enforces the AI_AGENT
exclusion at the public `HiveService.inviteToHive` surface
only (the explicitly-named Wave 2 boundary); the
`createTwin` internal direct-insert path is intentionally
NOT touched (would cascade into twin-architecture refactor
breaking hundreds of downstream tests + the org collective
intelligence design). Forward-substrate concern for a
future Section 5 / Section 11 slice under separate Founder
authorization.

**No new audit literals. No schema migration. No new RULE
landings.** The 5 existing `HIVE_*` audit literals cover the
Wave 2 surface as-is. `HiveFailure` union extended with
4 new failure codes; `statusForCode` route-tier mapping
extended.

**Wave 3 (admin governance routes)** — LANDED 2026-05-30
(ADR-0062 design + PR #91 implementation). 4 admin route
surfaces follow the Section 4 connector admin route pattern
verbatim:

- **`GET /api/v1/org/hives`** — list with optional
  `?status=ACTIVE|DISSOLVED` filter; same-org scoped via
  `getOrgEntityId`; no pagination at v1 (measure-first per
  ADR-0016); 422 `INVALID_FIELD` on unknown status. **The
  prior `org.routes.ts:1270-1296` leaky route was replaced
  in-place at the same URL** per ADR-0062 + RULE 13
  substrate-honest finding — the prior route returned raw
  `prisma.hive.findMany` rows including `governance_terms`
  + `aggregate_capsule_id` (both forbidden fields per
  ADR-0062 Sub-decision 2). BREAKING wire-shape change
  (pagination response shape → flat list; raw row → SAFE
  projection).
- **`GET /api/v1/org/hives/:id`** — detail + safe member
  roster; enumeration-safe 404 `HIVE_NOT_FOUND` for unknown
  or cross-org id.
- **`DELETE /api/v1/org/hives/:id`** — soft-archive flipping
  `HiveStatus.DISSOLVED` per RULE 10; idempotent on
  already-DISSOLVED (response carries `already_dissolved:
  true` + `audit_event_id: null`; no new audit row).
- **`DELETE /api/v1/org/hives/:id/member/:entityId`** —
  admin force-remove via `MembershipStatus.REMOVED` +
  member_count decrement; enumeration-safe 404
  `MEMBERSHIP_NOT_FOUND` covers unknown + already-REMOVED;
  AI_AGENT permitted at admin tier (cleanup surface for
  ADR-0059 §3.c carve-out; invite-surface AI_AGENT
  exclusion preserved).

All 4 routes `preHandler: requireAdminCapability(authService,
"can_admin_org")` + local `resolveOrgOrFail` helper
(mirrors `connector.routes.ts:36-54` verbatim) returning
404 `NO_ORG_FOR_CALLER` for orgless callers.

**SAFE view projections** (`HiveListItemView`,
`HiveAdminDetailView`, `HiveMembershipAdminView`) exclude
`governance_terms` (Wave 4 forward-substrate),
`aggregate_capsule_id` (internal pointer), raw
`capsule_types_accessible`/`capsule_types_contributed`
arrays (counts only; member-private signal preserved),
raw capsule content / payload summaries / wallet internals
/ permission internals / bridge IDs / secret refs /
embeddings / storage locations / content hashes.

**Audit emission** (zero new literals; ADR-0062 Sub-decision 5):
- DELETE hive emits `ADMIN_ACTION` + `details.action:
  "HIVE_DISSOLVED"` + safe metadata.
- DELETE member emits existing `HIVE_MEMBER_REMOVED` +
  `details.action: "HIVE_MEMBER_FORCE_REMOVED"` +
  `details.actor_role: "ORG_ADMIN"` discriminators.
- GET list + GET detail emit NO audit row (Section 4
  precedent).

Service substrate added (`hive.service.ts`): 4 admin
methods (`listHivesForOrg`, `getHiveAdminDetail`,
`dissolveHive`, `forceRemoveMember`) + `HiveAdminFailure`
discriminated union + 3 success shapes + 3 inline
projection helpers.

**Wave 4 (governance_terms policy evaluator)** — LANDED
2026-05-30 (ADR-0063 design at PR #93 + implementation
at PR #94). NEW pure-function evaluator at
`apps/api/src/services/hive/governance-terms-evaluator.ts`;
9 of 10 ADR-0063 v1 evaluable terms wired
(`require_admin_approval_for_invites` DEFERRED per Founder
direction — would hard-freeze `inviteToHive` because no
admin invite path exists yet).

**Wired v1 evaluable terms** at the 3 HiveService call
sites:

- `allowed_hive_types` at `createHive` — fail-closed with
  `GOVERNANCE_HIVE_TYPE_FORBIDDEN`; Wave 2
  `HIVE_TYPE_V1_ALLOWLIST` runs FIRST.
- `allowed_member_entity_types` at `inviteToHive` —
  fail-closed with `GOVERNANCE_INVITEE_TYPE_FORBIDDEN`;
  Wave 2 AI_AGENT exclusion runs FIRST.
- `allow_ai_agent_membership` (advisory at v1) — Wave 2
  AI_AGENT exclusion always wins; defense-in-depth
  rejection at evaluator if Wave 2 exclusion were ever
  lifted with `false` set.
- `max_member_count` at `inviteToHive` — fail-closed with
  `GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED`.
- `allowed_capsule_types_accessible` at `createHive` (creator
  settings) + `inviteToHive` (invitee settings) — fail-closed
  with `GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN`.
- `allowed_capsule_types_contributed` at the same two sites
  — fail-closed with `GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN`.
- `dissolve_requires_admin` — no-op at v1 (Wave 3
  `DELETE /api/v1/org/hives/:id` is already
  `can_admin_org`-gated; no non-admin dissolve route exists).
- `aggregate_min_member_count` at `getHiveIntelligence` —
  zero-state when active member_count is below threshold;
  reuses existing `HIVE_INTELLIGENCE_READ` audit literal
  with new `details.zero_state_reason:
  "BELOW_AGGREGATE_MIN_MEMBER_COUNT"` marker (mirrors
  Wave 2 `EMPTY_CAPSULE_TYPES_ACCESSIBLE` pattern).
- `policy_source_ref` — metadata-only at v1; persisted to
  `governance_terms` but NOT validated against any
  external source.

`MALFORMED governance_terms` (non-object top-level value)
fails closed with `GOVERNANCE_TERMS_MALFORMED` → 422
route mapping. Lenient per-key parsing: unrecognized keys
IGNORED at v1; per-key type-mismatch IGNORED. Cross-org
facts never leaked in error messages; full governance_terms
object never serialized to error responses or audit
details (verified with secret-marker integration tests).

**HiveFailure union extended** with 6 new violation codes
(the 7th `INVITE_REQUIRES_ADMIN_APPROVAL` is NOT added
because the term is deferred). `statusForCode` extended:
5 governance denials → 403; `GOVERNANCE_TERMS_MALFORMED`
→ 422.

**No new audit literals. No schema migration. No new
external dependencies.** Layers 2 + 3 (enterprise registry
+ external source feeds) intentionally NOT touched —
forward-substrate behind separate Founder authorization
per ADR-0063 §Forward queue.

**Wave 5 (Hive events producer substrate)** — LANDED
2026-05-30 (ADR-0064 design at PR #96 + producer
implementation at PR #97). NEW pure-substrate module at
`apps/api/src/services/hive/hive-events.ts` ships the
Foundation TypeScript internal event spine; **producer-only
at v1** with no live consumers; fire-and-forget Node
`node:events.EventEmitter` substrate; **single-node-safe**
(multi-node delivery NOT claimed); **RULE 21 does NOT
fire at v1** (Node built-in stdlib; no cross-language
paste).

**Substrate-honest framing**: the "Phoenix.PubSub" wave
title refers to the *eventual cross-language consumer-side
substrate* at `dbgi_supervisor` (Phase 0 verified LIVE at
`apps/dbgi_supervisor/mix.exs:76`); Wave 5 v1 ships the
producer-side TS abstraction; the BEAM bridge slice is
forward-substrate at Wave 6+.

**5 closed-vocabulary v1 events** at 6 producer call sites:

- `HIVE_CREATED` ← `createHive`.
- `HIVE_MEMBER_ADDED` ← `inviteToHive`.
- `HIVE_MEMBER_REMOVED` ← `removeMember` (source_action:
  "removeMember") + Wave 3 `forceRemoveMember` (source_action:
  "forceRemoveMember"). Same event vocabulary; different
  source_action discriminator.
- `HIVE_DISSOLVED` ← Wave 3 `dissolveHive` (NOT on
  idempotent already-DISSOLVED path; events report state
  transitions only).
- `HIVE_AGGREGATE_BUILT` ← `buildHiveAggregate`.

`HIVE_GOVERNANCE_ZERO_STATE` named in ADR-0064 vocabulary
but **DEFERRED at v1 wiring** per Founder "only if safe
and not noisy" direction (zero-state paths fire on every
read; no consumer use case yet justifies the volume).

**Same-org-scoped topic schema** (parallel two-topic
publish):

- `foundation:hives:org:{org_entity_id}`
- `foundation:hives:hive:{hive_id}`

`org_entity_id` derived from Hive row, never caller
context. Cross-org topics forbidden by construction per
ADR-0059 §1 RULE 0.

**SAFE payload projection** (`HiveEventEnvelope`
interface; forbidden fields enforced by type construction):
event_name + org_entity_id + hive_id + optional
actor_entity_id / target_entity_id / member_count /
hive_status / aggregate_present / reason_code /
source_action / timestamp. Forbidden: raw capsule content,
governance_terms object (Wave 4 evaluator no-leak
discipline extended), wallet/permission internals,
embeddings, storage locations, content hashes, secret
refs, bridge IDs, cross-org data, session tokens, IP
addresses.

**HiveService constructor extended** with optional 4th
`eventBus?: HiveEventBus` arg (backward-compat with all
Wave 2/3/4 test fixtures; when undefined every publish is
a no-op). NEW private `emitHiveEvent` helper centralizes
the undefined-guard so each call site is single-line.

**Production server posture**: `server.ts` is intentionally
NOT modified at this slice (HiveService.eventBus stays
undefined at production boot; substrate wired end-to-end
but dormant pending a future consumer slice that authorizes
default instantiation).

**No new audit literals. No schema migration. No new
external dependencies.** Layer 2 (enterprise registry from
Wave 4) + Layer 3 (external source feeds from Wave 4) +
cross-language BEAM bridge + Broadway guaranteed delivery
+ Otzar Twin subscription + Control Tower WebSocket bridge
+ Section 4 connector fan-out bridge all remain
forward-substrate per ADR-0064 §Forward queue.

## What is live

Per the substrate-honest correction (Wave 1) + Wave 2
enforcement:

### Schema (`packages/database/prisma/schema.prisma`)

- `Hive` model: 12 fields + 3 indexes.
- `HiveMembership` model: 10 fields + 2 indexes +
  `@@unique([hive_id, entity_id])`.
- `HiveType` enum: PERSONAL_NETWORK, ENTERPRISE,
  CROSS_ORGANIZATION, DEVICE_NETWORK, GOVERNMENT (per
  ADR-0059 v1 + Wave 2 enforcement: ENTERPRISE +
  PERSONAL_NETWORK allowed; CROSS_ORG + DEVICE + GOVERNMENT
  reserved in enum but rejected at service tier via
  `HIVE_TYPE_V1_ALLOWLIST`).
- `HiveStatus` enum: ACTIVE, DISSOLVED.
- `MembershipStatus` enum: ACTIVE, REMOVED.
- `AccessScope` enum: METADATA_ONLY, SUMMARY, FULL.
- `TokenAttributeRepository.can_create_hives` Boolean default
  false — Wave 2 enforces this at the route tier.

### Service tier (`apps/api/src/services/hive/hive.service.ts`)

- `HIVE_TYPE_V1_ALLOWLIST: ReadonlySet<HiveType>` frozen
  anchor — `Object.freeze(new Set(["ENTERPRISE", "PERSONAL_NETWORK"]))`.
- `createHive` — TAR `create_hives` gated; allowlist-checked;
  org_entity_id resolved/required; persists Hive row + creator
  membership with non-null `org_entity_id`.
- `inviteToHive` — same-org membership check via
  `EntityMembership` lookup; AI_AGENT exclusion; legacy
  `org_entity_id = null` hives reject invites under v1
  semantics with admin-tooling note.
- `removeMember` — soft-status `MembershipStatus = REMOVED`.
- `getHiveIntelligence` — capsule_types_accessible read-time
  enforcement; empty access list → zero-state; non-empty →
  existing aggregate-decryption path.
- `buildHiveAggregate` — emits `HIVE_AGGREGATE_BUILT` audit;
  computes aggregate.

`HiveFailure` union (post-Wave-2) includes 4 new codes:
`INVALID_HIVE_TYPE_FOR_V1`, `ORG_ENTITY_ID_REQUIRED`,
`CROSS_ORG_INVITE_DENIED`, `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE`.

### Routes (`apps/api/src/routes/hive.routes.ts`)

- POST /api/v1/hive — TAR-gated; route + service tier both
  enforce.
- Member invite + remove + intelligence-read routes.
- `statusForCode` route mapping (post-Wave-2):
  CROSS_ORG_INVITE_DENIED + AI_AGENT_NOT_ELIGIBLE_FOR_HIVE
  → 403; INVALID_HIVE_TYPE_FOR_V1 + ORG_ENTITY_ID_REQUIRED
  → 422; DEFAULT_HIVE_ALREADY_EXISTS → 409.

### Audit literals (`packages/database/src/queries/audit.ts:50-54`)

5 HIVE_* literals (`HIVE_CREATED`, `HIVE_MEMBER_ADDED`,
`HIVE_MEMBER_REMOVED`, `HIVE_INTELLIGENCE_READ`,
`HIVE_AGGREGATE_BUILT`). No new literal added across
Wave 1–2 per ADR-0059 §5.

### Forward-substrate per ADR-0039 Entry #28

Phoenix.PubSub hive fanout + Broadway pipeline + hive
algorithm weighting reserved for forward-substrate Waves 5/6/7
per ADR-0059 v1 non-goals.

## What is NOT live

Per ADR-0059 v1 non-goals — each is forward-substrate behind
separate Founder authorization:

- **`createTwin` standard-branch AI_AGENT auto-join into
  default-enterprise hives** — internal `tx.hiveMembership.create`
  direct insert at `twin.service.ts:296-326` bypasses
  `HiveService.inviteToHive` and is intentionally NOT modified
  by Wave 2 or Wave 3 per ADR-0059 §3.c forward-substrate
  disposition (would cascade into twin-architecture refactor).
  Wave 3 admin force-remove provides the *cleanup* surface
  for the carve-out (admin can now remove what createTwin
  auto-joined) but does NOT close the carve-out itself.
  Future Section 5 / Section 11 slice under separate Founder
  authorization.
- **Member `capsule_types_*` value visibility at admin tier**
  (counts-only at v1 per ADR-0062 Sub-decision 2; if product
  requires value strings later, separate Founder authorization).
- **Read-audit emission** for admin list/detail (if regulatory
  regime mandates it; not at v1 per Section 4 precedent).
- **Pagination on admin list** (if real orgs cross O(1000+)
  hives; measure-first per ADR-0016).
- **`require_admin_approval_for_invites` Layer 1 term** —
  DEFERRED per Founder Wave 4 implementation authorization;
  would hard-freeze `inviteToHive` because no admin invite
  path exists yet. Future Founder slice can authorize the
  term + admin invite path together.
- **Layer 2 enterprise governance policy registry** —
  forward-substrate per ADR-0063 §Sub-decision 1 + §Forward
  queue; future `OrgGovernancePolicy` model analogous to
  existing `ComplianceFramework` substrate; reusable named
  policy templates across org's hives; versioned +
  admin-approved.
- **Layer 3 external governance source feeds** —
  forward-substrate per ADR-0063 §Sub-decision 1 + §Forward
  queue; future `GovernanceSource` + `GovernanceSourceVersion`
  + `GovernanceReviewItem` models mirroring ADR-0036
  LawfulBasis source-attributed + jurisdiction-aware pattern;
  default monthly/quarterly review cadence (Founder explicit
  lock); 7-step source-update lifecycle (review item →
  admin/legal approval → policy version → enforcement);
  RULE 21 research arc required at the implementation slice.
- **Phoenix.PubSub fanout for hive aggregate updates** — Wave 5
  (consumes ADR-0039 Entry #28).
- **Broadway pipeline at high-throughput register** — Wave 6
  (consumes ADR-0039 Entry #28).
- **Hive algorithm at weighting architecture register** — Wave 7
  (consumes ADR-0039 Entry #28).
- **Twin-to-Twin proactive coordination runtime** — Wave 8+
  (full ADR-0052 §8 vision; requires Phoenix.PubSub runtime +
  autonomy policy + Founder authorization).
- **AI-generated executive summaries of hive activity** —
  Founder product decision (same constraint as Section 9
  ADR-0052 doctrine exec summaries).
- **Cross-hive aggregation** — forward-substrate.
- **Cross-organization hives** — explicit ADR-0059 v1
  non-goal; CROSS_ORGANIZATION HiveType reserved in enum but
  rejected at service tier.
- **Control Tower hive admin UX** — frontend; lives in
  [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower).

## RULE 13 disclosures specific to Section 3

- Hive boundaries enforce the same RULE 0 sovereignty rules
  as individual DMWs — no cross-hive leakage; no cross-tenant
  data fusion. v1 forbids CROSS_ORGANIZATION hive_type at
  service tier (Wave 2 LIVE).
- Twin-to-Twin coordination is scoped per ADR-0052; raw memory
  capsules NEVER cross between Twins. Only minimum-relevant
  derived signals at the aggregate projection tier.
- POST /api/v1/hive is now TAR-gated (Wave 2). The pre-Wave-2
  un-gated behavior is GONE; callers without
  `can_create_hives` get 403 `OPERATION_NOT_PERMITTED`.
- `inviteToHive` now verifies same-org membership (Wave 2).
  Cross-org callers get 403 `CROSS_ORG_INVITE_DENIED` with
  no-info-leak message scrubbing.
- `getHiveIntelligence` now honors `capsule_types_accessible`
  at read-time (Wave 2). Memberships with empty access lists
  receive a zero-state response (`intelligence: null`); audit
  emits `details.zero_state_reason = "EMPTY_CAPSULE_TYPES_ACCESSIBLE"`.
- `createTwin` standard-branch auto-joins AI_AGENT twins into
  default-enterprise hives via direct insert (bypasses
  `HiveService`). Wave 2 does NOT close this path; documented
  as ADR-0059 §3.c forward-substrate carve-out.
- `governance_terms Json` is stored but never evaluated.
  Operators who think governance terms enforce policy at v1
  are mistaken; the field is forward-substrate (Wave 4).

## Landed work

| Commit | Date | Description |
|---|---|---|
| (pre-Section-12) | (legacy) | Hive + HiveMembership models + HiveService + hive.routes.ts + 5 HIVE_* audit literals landed in foundational substrate; not previously documented at this register |
| `11ae5e5` (PR #85) | 2026-05-30 | Section 3 Wave 1 — ADR-0059 Hives v1 Design Boundary + substrate-honest doc correction |
| `2b9ab7f` (PR #88) | 2026-05-30 | Section 3 Wave 2 — service-tier safety enforcement (TAR gate + v1 allowlist + non-null org_entity_id + same-org membership + AI_AGENT exclusion + capsule_types_accessible read-time enforcement; 4 new failure codes; +15 integration tests) |
| `0886211` (PR #90) | 2026-05-30 | Section 3 Wave 3 — ADR-0062 admin routes design (4 admin route surfaces + safe roster projection + idempotent dissolve/force-remove + AI_AGENT force-remove permitted + ADMIN_ACTION + HIVE_MEMBER_REMOVED reuse) |
| `9a348be` (PR #91) | 2026-05-30 | Section 3 Wave 3 — admin routes implementation (4 routes + 4 admin service methods + 3 SAFE view projections + HiveAdminFailure union + +20 integration tests; RULE 13 BREAKING-tightening of prior leaky `GET /api/v1/org/hives` route at org.routes.ts that returned raw rows with forbidden fields) |
| `ebc56c5` (PR #93) | 2026-05-30 | Section 3 Wave 4 — ADR-0063 governance_terms policy evaluator + 3-layer governance-source boundary (ADR-only; design LOCKED; 10 v1 Layer 1 evaluable terms + monthly/quarterly default Layer 3 review cadence; zero schema + zero new audit literals at v1) |
| `065e4f1` (PR #94) | 2026-05-30 | Section 3 Wave 4 v1 — governance_terms policy evaluator implementation (NEW pure-function evaluator + 9 of 10 v1 evaluable terms wired; `require_admin_approval_for_invites` DEFERRED; 6 new HiveFailure violation codes; statusForCode extension; 20 NEW integration tests; zero new audit literals; zero schema migration) |
| `2a241f1` (PR #96) | 2026-05-30 | Section 3 Wave 5 — ADR-0064 Hive Events Producer Substrate design (producer-only at v1; substrate-honest framing — Phoenix.PubSub naming refers to eventual BEAM-side consumer; v1 ships TS-side Node EventEmitter spine; 5 closed-vocab events + same-org topic schema + SAFE payload projection + fire-and-forget + single-node-safe; zero schema/audit/external-dep impact) |
| `056c7c7` (PR #97) | 2026-05-30 | Section 3 Wave 5 v1 — Hive Events producer implementation (NEW hive-events.ts module + HiveEventBus class + 4th optional HiveService constructor arg + 5 publish call sites + barrel exports + 13 NEW integration tests; backward-compat preserved for all Wave 2/3/4 fixtures; server.ts intentionally not modified at this slice) |

## Next slices (per ADR-0059 §7 Forward Queue)

Each requires separate Founder authorization at its slice
prompt; not autonomously executable:

1. ~~**Wave 2 — service-tier safety enforcement**~~ — LANDED
   PR #88 2026-05-30.
2. ~~**Wave 3 — hive admin routes**~~ — LANDED ADR-0062
   (PR #90) + implementation (PR #91) 2026-05-30.
3. ~~**Wave 4 — `governance_terms` policy evaluator**~~ —
   design LANDED at ADR-0063 (PR #93) + implementation
   LANDED at PR #94. 9 of 10 v1 terms wired;
   `require_admin_approval_for_invites` deferred until
   admin invite path exists. Layer 2 + Layer 3
   forward-substrate per ADR-0063.
4. ~~**Wave 5 — Phoenix.PubSub fanout** for hive aggregate
   updates (consumes ADR-0039 Entry #28)~~ — **Producer
   half LANDED** at ADR-0064 (PR #96) + implementation
   (PR #97) 2026-05-30. Foundation TypeScript `HiveEventBus`
   ships SAFE-projected envelopes on closed-vocabulary
   topics; consumer half + cross-language BEAM bridge +
   Broadway guaranteed delivery + Otzar Twin subscription +
   Control Tower WebSocket bridge + Section 4 connector
   fan-out bridge remain forward-substrate at Wave 6+ per
   ADR-0064 §Forward queue.
5. **Wave 6 — Broadway pipeline** at high-throughput register
   (consumes ADR-0039 Entry #28).
6. **Wave 7 — hive algorithm at weighting architecture
   register** (consumes ADR-0039 Entry #28).
7. **Wave 8+ — Twin-to-Twin proactive coordination runtime**
   per ADR-0052 §8 full vision; requires Phoenix.PubSub
   runtime + autonomy policy + Founder authorization.
8. **`createTwin` standard-branch AI_AGENT carve-out
   resolution** per ADR-0059 §3.c — future Section 5 /
   Section 11 slice; requires separate Founder authorization
   given the twin-architecture cascade cost.

## Risks / forward-substrate

- Wave 2 is BREAKING for any pre-Wave-2 callers relying on
  un-gated POST /api/v1/hive, cross-org `inviteToHive`, or
  default-empty `capsule_types_accessible` reads. These
  behaviors were documented as RULE 0 safety gaps in ADR-0059
  and closed by Wave 2 with explicit Founder authorization.
- The `createTwin` standard-branch carve-out means AI_AGENT
  twins can still land in default-enterprise Hives through
  the internal auto-join path. The public invite surface is
  closed; the internal twin-creation flow is not. Documented
  as forward-substrate per ADR-0059 §3.c.
- `governance_terms Json` is stored but never evaluated.
  Operators who think governance terms enforce policy at v1
  are mistaken; the field is forward-substrate.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
