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

## Current status (PARTIAL — Waves 1+2+3+4 LIVE)

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
4. **Wave 5 — Phoenix.PubSub fanout** for hive aggregate
   updates (consumes ADR-0039 Entry #28). **Producer half
   design LOCKED at ADR-0064** (2026-05-30); Foundation
   TypeScript `HiveEventBus` ships SAFE-projected envelopes
   on closed-vocabulary topics; consumer half + cross-language
   BEAM bridge + Broadway guaranteed delivery remain
   forward-substrate at Wave 6+.
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
