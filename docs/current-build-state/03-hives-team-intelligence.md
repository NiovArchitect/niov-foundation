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

## Current status (PARTIAL — Waves 1+2 LIVE)

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
  by Wave 2 per ADR-0059 §3.c forward-substrate disposition
  (would cascade into twin-architecture refactor). Future
  Section 5 / Section 11 slice under separate Founder
  authorization.
- **Hive admin routes** (org list / archive / dissolve / member
  roster) — Wave 3; require `can_admin_org` gate.
- **`governance_terms` policy evaluation** — Wave 4; requires
  canonical governance_terms schema + Founder product decision.
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

## Next slices (per ADR-0059 §7 Forward Queue)

Each requires separate Founder authorization at its slice
prompt; not autonomously executable:

1. ~~**Wave 2 — service-tier safety enforcement**~~ — LANDED
   PR #88 2026-05-30.
2. **Wave 3 — hive admin routes**: org list / archive /
   dissolve / member roster admin surfaces; requires
   `can_admin_org` gating + Section 4 connector admin route
   pattern verbatim.
3. **Wave 4 — `governance_terms` canonical schema + policy
   evaluator**: requires Founder product decision on which
   governance terms are evaluable + how policy violations are
   surfaced.
4. **Wave 5 — Phoenix.PubSub fanout** for hive aggregate
   updates (consumes ADR-0039 Entry #28).
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
