# PR #88 — Section 3 Wave 2 — Hives service-tier safety enforcement

**Date:** 2026-05-30
**Merge commit:** `2b9ab7f`
**Branch:** `section-3-wave-2-hives-safety-enforcement`
**ADR:** [ADR-0059 §7](../architecture/decisions/0059-section-3-hives-v1-design-boundary.md)
**Section file:** [`03-hives-team-intelligence.md`](../current-build-state/03-hives-team-intelligence.md)
**Authorization:** Founder Sleep Directive Wave 2
authorization (all 5 ADR-0059 §7 Founder Authorization
checkpoints approved in one paste).

## Why this entry exists

Wave 2 lands a coherent BREAKING-tightening cluster on the
Section 3 Hive substrate that closes 5 distinct RULE 0
safety surface drifts surfaced by Wave 1's substrate-honest
correction. It introduces 4 new failure codes, switches the
TAR capability validateSession op on `POST /api/v1/hive`,
and reshapes the contract of `createHive` /
`inviteToHive` / `getHiveIntelligence` simultaneously.
Tier-4 build-log entry per `CURRENT_BUILD_STATE.md` rule:
"security/governance landing + cross-section RULE 0
enforcement + complex runtime behavior."

## Enforcement matrix

| Checkpoint | Surface | New failure code → HTTP | Pre-Wave-2 behavior |
|---|---|---|---|
| TAR `can_create_hives` gate | `createHive` (POST /api/v1/hive) | (existing `OPERATION_NOT_PERMITTED`) → 403 | `validateSession(token, "share")` — un-gated |
| v1 hive_type allowlist | `createHive` | `INVALID_HIVE_TYPE_FOR_V1` → 422 | All 5 HiveType values accepted |
| Non-null `org_entity_id` at create | `createHive` | `ORG_ENTITY_ID_REQUIRED` → 422 | Nullable; un-derived |
| Same-org membership on invite | `inviteToHive` | `CROSS_ORG_INVITE_DENIED` → 403 | No cross-org check |
| AI_AGENT exclusion on invite | `inviteToHive` | `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE` → 403 | AI_AGENT could be invited via public surface |
| `capsule_types_accessible` read-time | `getHiveIntelligence` | (zero-state response; not a failure) | Empty access list returned unfiltered aggregate |

## Key implementation notes

### Frozen-anchor allowlist

```ts
export const HIVE_TYPE_V1_ALLOWLIST: ReadonlySet<HiveType> =
  Object.freeze(new Set<HiveType>(["ENTERPRISE", "PERSONAL_NETWORK"]));
```

Per Wave 1 ADR-0059 v1 scope. Mirrors the
`CRYPTO_CONFIG` / `SYSTEM_PRINCIPALS` frozen-anchor
discipline. CROSS_ORG / DEVICE / GOVERNMENT enum values
reserved in `schema.prisma` for forward-substrate Waves 8+.

### org_entity_id 3-way resolution

```ts
// hive.service.ts createHive resolution:
//  explicit null  → ORG_ENTITY_ID_REQUIRED (caller asked orgless/cross-org)
//  undefined      → derive via getOrgEntityId(callerEntityId)
//                   orgless caller → ORG_ENTITY_ID_REQUIRED
//  string         → trust (preserves dandelion.service.ts default-enterprise flow)
```

The 3-way logic preserves the `dandelion.service.ts` Phase 0
default-enterprise flow (where `org_entity_id` is the new
org's own id at create-time) while letting general callers
rely on `EntityMembership` derivation. Explicit null is
treated as the caller affirmatively asking for orgless/
cross-org behavior — rejected under v1 scope.

### No-info-leak cross-org message scrub

The `CROSS_ORG_INVITE_DENIED` failure message NEVER
contains the invitee's `org_entity_id` or any other
cross-org identifier. Mirrors the Wave 11
`notification.service.ts:99-109` pattern. The integration
test explicitly asserts
`expect(r.message).not.toContain(stranger.orgId)`.

### Zero-state response semantics

`getHiveIntelligence` returns `intelligence: null` when the
caller's `HiveMembership.capsule_types_accessible` is empty,
plus a `HIVE_INTELLIGENCE_READ` audit row with
`details.zero_state_reason = "EMPTY_CAPSULE_TYPES_ACCESSIBLE"`.
The contract change is binary (empty → zero-state;
non-empty → full aggregate); per-tag filtering is forward-
substrate. The audit-emission preservation means no new
audit literal is required.

## ADR-0059 §3.c forward-substrate carve-out (RULE 13)

The public `HiveService.inviteToHive` AI_AGENT exclusion is
explicit and enforced. The internal `createTwin` standard-
branch at `apps/api/src/services/governance/twin.service.ts:296-326`
auto-joins AI_AGENT twins into default-enterprise Hives via
direct `tx.hiveMembership.create` — it BYPASSES
`HiveService` entirely.

Wave 2 intentionally does NOT modify that path because:
- Closing it would cascade-break the twin-architecture and
  the org collective intelligence design (hundreds of
  downstream tests).
- The Wave 2 boundary was explicitly named at the
  `inviteToHive` public surface in the Founder
  authorization.
- The carve-out is documented inline in the
  `inviteToHive` implementation comments + ADR-0059 §3.c
  + this build-log entry.

Future Section 5 / Section 11 slice under separate Founder
authorization is the correct resolution path.

## Test fixture cascade (BREAKING tightening fallout)

Wave 2 is BREAKING for any test fixture that calls
`HiveService.createHive` without first granting TAR
`can_create_hives` + binding the caller entity to an org.
The fixture cascade landed in the same commit:

- `tests/unit/hive.test.ts` — `loginAs` helper extended to
  mint a fresh per-test COMPANY org, bind PERSON via
  `EntityMembership`, grant TAR `can_create_hives` + refresh
  `tar_hash` via `computeTARHash`. New `opts.orgId`
  parameter so invitee/member entities can share the
  founder's org for the same-org membership check.
- `tests/unit/feedback.test.ts` — Loop 4 hive create
  regression: identical `loginAs` setup.
- One privacy-aggregate test extended to pass non-empty
  `capsule_types_accessible: ["PREFERENCE"]` so the
  founder's `getHiveIntelligence` read still returns the
  aggregate (vs new zero-state for empty access lists).

## Test surface

NEW `tests/integration/hive-wave-2-safety-enforcement.test.ts`
— 15 cases across 4 groups:

1. **createHive TAR + hive_type + org enforcement** (8):
   no `can_create_hives` → 403; ENTERPRISE success;
   PERSONAL_NETWORK success; CROSS_ORGANIZATION rejected;
   DEVICE_NETWORK rejected; GOVERNMENT rejected; explicit
   null org rejected; orgless caller rejected.
2. **inviteToHive same-org + AI_AGENT** (3): same-org
   PERSON invite succeeds; cross-org PERSON rejected with
   no-leak message scrub; AI_AGENT rejected (even same-org).
3. **getHiveIntelligence capsule_types_accessible** (2):
   empty access list → zero-state with audit reason
   marker; non-empty access list returns aggregate when
   built.
4. **Audit literal preservation + no-leak** (2):
   HIVE_CREATED still emitted with `org_entity_id`;
   zero-state intelligence serializes no raw capsule
   content fields.

## Gates at merge

- TypeScript baseline: 4 canonical residuals preserved.
- Unit tier: 371 tests passing.
- Integration tier: 111 tests + 1 skipped passing
  (15 Wave 2 cases included).
- Elixir tier: compile + test green.
- No-console anchor + no-leak guard: green.

## What is NOT in this PR

- The `createTwin` carve-out (forward-substrate per
  ADR-0059 §3.c; future Section 5 / Section 11 slice).
- No new audit literal.
- No schema migration.
- No frontend / Control Tower work.
- No Phoenix.PubSub / Broadway / hive-weighting / Twin-to-
  Twin runtime (Waves 5+).
- No `governance_terms` policy evaluation (Wave 4).
- No hive admin routes (Wave 3).
