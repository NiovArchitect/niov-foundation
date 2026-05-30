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

## Current status (PARTIAL — Wave 1 ADR LANDED; on-main substrate substrate-honest documented)

**Substrate-honest correction** (per Phase 0 verification
2026-05-30 / ADR-0059):

Prior versions of this file claimed *"Substrate not yet
started."* That was canonical-truth drift. The actual on-main
state is substantially complete at the data + service tier:

- **`Hive` model LIVE** at `packages/database/prisma/schema.prisma:608-628`
  (12 fields including `org_entity_id` + `is_default_enterprise`
  + `aggregate_capsule_id` + `governance_terms Json`).
- **`HiveMembership` model LIVE** at `schema.prisma:635-653`
  (10 fields including `capsule_types_contributed[]` +
  `capsule_types_accessible[]` + `access_scope` +
  `contribution_scope`).
- **`HiveType` (5-value), `HiveStatus`, `MembershipStatus`,
  `AccessScope` enums LIVE**.
- **`HiveService` LIVE** at `apps/api/src/services/hive/hive.service.ts`
  (5 methods: createHive / inviteToHive / removeMember /
  getHiveIntelligence / buildHiveAggregate).
- **`hive.routes.ts` LIVE** at `apps/api/src/routes/hive.routes.ts`
  (POST /api/v1/hive + member-invite + member-remove +
  intelligence-read).
- **5 HIVE_* audit literals LIVE** at
  `packages/database/src/queries/audit.ts:50-54`:
  `HIVE_CREATED` + `HIVE_MEMBER_ADDED` + `HIVE_MEMBER_REMOVED`
  + `HIVE_INTELLIGENCE_READ` + `HIVE_AGGREGATE_BUILT`.
- **TAR `can_create_hives Boolean @default(false)`** at
  `schema.prisma:238` — capability EXISTS but is NOT enforced
  by `hive.routes.ts` today (Wave 2 will close this gap
  subject to Founder Authorization checkpoint).

ADR-0059 (2026-05-30) is the v1 design boundary ADR for this
substrate. Wave 2 implementation (TAR gating + same-org
membership check + AI_AGENT auto-join discrimination +
capsule_types filtering at read + CROSS_ORG type rejection)
requires separate Founder authorization at its slice prompt
(see ADR-0059 §7 Founder Authorization Checkpoints).

## What is live

Per the substrate-honest correction above:

### Schema (`packages/database/prisma/schema.prisma`)

- `Hive` model: 12 fields + 3 indexes.
- `HiveMembership` model: 10 fields + 2 indexes +
  `@@unique([hive_id, entity_id])`.
- `HiveType` enum: PERSONAL_NETWORK, ENTERPRISE,
  CROSS_ORGANIZATION, DEVICE_NETWORK, GOVERNMENT (per
  ADR-0059 v1, CROSS_ORG + DEVICE + GOVERNMENT are reserved
  in the enum but rejected at service tier — Wave 2).
- `HiveStatus` enum: ACTIVE, DISSOLVED.
- `MembershipStatus` enum: ACTIVE, REMOVED.
- `AccessScope` enum: METADATA_ONLY, SUMMARY, FULL.
- `TokenAttributeRepository.can_create_hives` Boolean default
  false.

### Service tier (`apps/api/src/services/hive/hive.service.ts`)

- `createHive` — persists Hive row + creator membership.
- `inviteToHive` — adds HiveMembership row (currently no
  same-org check; Wave 2 closes).
- `removeMember` — soft-status MembershipStatus = REMOVED.
- `getHiveIntelligence` — aggregate read across members
  (currently no `capsule_types_accessible` filter at read;
  Wave 2 closes).
- `buildHiveAggregate` — emits HIVE_AGGREGATE_BUILT audit;
  computes aggregate.

### Routes (`apps/api/src/routes/hive.routes.ts`)

- POST /api/v1/hive (currently no TAR gate; Wave 2 closes
  subject to Founder Authorization checkpoint).
- Member invite + remove + intelligence-read routes.

### Audit literals (`packages/database/src/queries/audit.ts:50-54`)

5 HIVE_* literals (see Current status above). No new literal
needed for any Wave 1–2 work per ADR-0059 §5.

### Forward-substrate per ADR-0039 Entry #28

Phoenix.PubSub hive fanout + Broadway pipeline + hive
algorithm weighting reserved for forward-substrate Waves 5/6/7
per ADR-0059 v1 non-goals.

## What is NOT live

Per ADR-0059 v1 non-goals — each is forward-substrate behind
separate Founder authorization:

- **TAR `can_create_hives` gate enforcement** on POST
  /api/v1/hive (Wave 2; Founder Authorization checkpoint #3).
- **Same-org membership check** on `inviteToHive` (Wave 2;
  Founder Authorization checkpoint #4; RULE 0 safety
  improvement).
- **AI_AGENT auto-join discrimination** on
  `is_default_enterprise` sweep (Wave 2; per ADR-0046 + RULE 0
  AI ceilings).
- **`capsule_types_accessible` read-time enforcement** (Wave 2;
  Founder Authorization checkpoint #5; surfaces zero-state
  responses where today operators get unfiltered aggregate).
- **CROSS_ORGANIZATION / DEVICE_NETWORK / GOVERNMENT hive_type
  rejection** at service tier (Wave 2; Founder Authorization
  checkpoint #1).
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
- **Control Tower hive admin UX** — frontend; lives in
  [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower).

## RULE 13 disclosures specific to Section 3

- Hive boundaries must enforce the same RULE 0 sovereignty
  rules as individual DMWs — no cross-hive leakage; no
  cross-tenant data fusion. v1 forbids CROSS_ORGANIZATION
  hive_type at service tier (Wave 2 enforcement) to make this
  explicit.
- Twin-to-Twin coordination is scoped per ADR-0052; raw memory
  capsules NEVER cross between Twins. Only minimum-relevant
  derived signals at the aggregate projection tier.
- The on-main `hive.routes.ts` POST /api/v1/hive is currently
  UN-GATED by TAR capability per substrate-honest Phase 0
  verification. ADR-0059 documents this as a gap; Wave 2
  closes it. Operators relying on the un-gated behavior should
  flag this before Wave 2 lands.
- The on-main `inviteToHive` does NOT verify same-org
  membership. ADR-0059 documents this as a RULE 0 safety gap;
  Wave 2 closes it.

## Landed work

| Commit | Date | Description |
|---|---|---|
| (pre-Section-12) | (legacy) | Hive + HiveMembership models + HiveService + hive.routes.ts + 5 HIVE_* audit literals landed in foundational substrate; not previously documented at this register |
| (this commit) | 2026-05-30 | ADR-0059 Section 3 Hives v1 Design Boundary + substrate-honest doc correction |

## Next slices (per ADR-0059 §7 Forward Queue)

Each requires separate Founder authorization at its slice
prompt; not autonomously executable:

1. **Wave 2 — service-tier safety enforcement**: TAR
   `can_create_hives` gate on POST /api/v1/hive; same-org
   membership check on `inviteToHive`; AI_AGENT auto-join
   discrimination; `capsule_types_accessible` read-time
   enforcement; CROSS_ORG / DEVICE / GOVERNMENT type rejection;
   `org_entity_id` required-at-create. (5 Founder Authorization
   checkpoints per ADR-0059 §7.)
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

## Risks / forward-substrate

- The "Substrate not yet started" prior claim was canonical-
  truth drift surfaced at Phase 0 verification 2026-05-30. The
  substrate-honest correction is in this file + ADR-0059
  §Context.
- The TAR `can_create_hives` gate gap + the same-org
  membership-check gap are real RULE 0 safety surface drifts
  on main today. ADR-0059 documents them; Wave 2 closes them
  subject to Founder Authorization checkpoints (because
  closing them is a BREAKING change for any caller relying on
  the un-gated behavior — which is itself a substrate-honest
  surveillance of operator practice).
- `governance_terms Json` is stored but never evaluated.
  Operators who think governance terms enforce policy at v1
  are mistaken; the field is forward-substrate.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
