# PR #91 — Section 3 Wave 3 — Hive admin routes implementation

**Date:** 2026-05-30
**Merge commit:** `9a348be`
**Branch:** `section-3-wave-3-hive-admin-routes-implementation`
**ADR:** [ADR-0062](../architecture/decisions/0062-section-3-hives-wave-3-admin-routes.md)
**Companion design PR:** [#90](https://github.com/NiovArchitect/niov-foundation/pull/90)
**Section file:** [`03-hives-team-intelligence.md`](../current-build-state/03-hives-team-intelligence.md)
**Authorization:** Founder Wave 3 authorization at
`[FOUNDER-SECTION-3-WAVE-3-ADR-AND-IMPLEMENTATION-AUTH]`
(2026-05-30). Authorization covered both the ADR draft +
landing AND the contingent implementation if the ADR
identified a substrate-safe path with no further Founder
product decision required.

## Why this entry exists

PR #91 lands the implementation of ADR-0062 — 4 admin
route surfaces + 4 service methods + 3 SAFE view projections
+ 20 integration tests + a BREAKING in-place replacement of
a pre-existing leaky route. Tier-4 build-log entry per
`CURRENT_BUILD_STATE.md` rule: "security/governance landing
+ cross-section RULE 0 enforcement + complex runtime
behavior + RULE 13 substrate-honest finding affecting prior
on-main route."

## Route surface matrix

| Route | Service method | Audit emission | Idempotency |
|---|---|---|---|
| `GET /api/v1/org/hives` | `listHivesForOrg(orgId, {status?})` | none (Section 4 precedent) | n/a (read-only) |
| `GET /api/v1/org/hives/:id` | `getHiveAdminDetail(orgId, hiveId)` | none | n/a (read-only) |
| `DELETE /api/v1/org/hives/:id` | `dissolveHive(orgId, hiveId, actorId)` | ADMIN_ACTION + details.action: "HIVE_DISSOLVED" | idempotent (no new audit on already-DISSOLVED) |
| `DELETE /api/v1/org/hives/:id/member/:entityId` | `forceRemoveMember(orgId, hiveId, memberId, actorId)` | HIVE_MEMBER_REMOVED + details.action: "HIVE_MEMBER_FORCE_REMOVED" + details.actor_role: "ORG_ADMIN" | enumeration-safe 404 on already-REMOVED |

All 4 routes use `preHandler: requireAdminCapability(authService,
"can_admin_org")` + local `resolveOrgOrFail(callerId, reply)`
helper (mirrors `connector.routes.ts:36-54` verbatim).

## RULE 13 substrate-honest finding (the BREAKING bit)

ADR-0062 Phase 0 reconnaissance MISSED that
`GET /api/v1/org/hives` was already registered at
`apps/api/src/routes/org.routes.ts:1270-1296`. The prior
implementation:

- **Was UNTESTED** at the integration tier (zero references
  outside the new Wave 3 test file).
- **Returned raw `prisma.hive.findMany` rows** — the entire
  Hive row including `governance_terms` and
  `aggregate_capsule_id`, both fields ADR-0062 Sub-decision 2
  explicitly forbids in the SAFE projection.
- **Used pagination (`skip`/`take`)** instead of the
  Section 4 connector flat-list pattern that ADR-0062
  explicitly adopted per Sub-decision 1 route #1.

The route was therefore a **substrate-honest correction
target** consistent with Wave 2's BREAKING-tightening
precedent (TAR-gate + same-org membership + AI_AGENT
exclusion + capsule_types_accessible enforcement all
BROKE prior un-gated behavior with explicit Founder
authorization).

Wave 3 resolved the conflict in-place:
1. Removed the leaky implementation at `org.routes.ts:1270-1296`.
2. Left a `// GET /api/v1/org/hives — superseded by hive-admin.routes.ts`
   comment block at the same location pointing to the new
   canonical implementation.
3. Registered the SAFE-projection implementation in
   `hive-admin.routes.ts` at the SAME URL.

**BREAKING wire-shape change for any caller** of the prior
route:
- Response shape: `{ ok, items: Hive[], total, skip, take }`
  → `{ ok, hives: HiveListItemView[] }`.
- Response row shape: raw Hive (with `governance_terms` +
  `aggregate_capsule_id`) → `HiveListItemView` (no
  `governance_terms`, no `aggregate_capsule_id`).
- Querystring: `?skip=&take=` (paged) → `?status=` (filter
  only; no pagination at v1 per ADR-0062 Sub-decision 1
  measure-first per ADR-0016).

The prior route was untested; no consumer was identified
on either Foundation or otzar-control-tower. Replacement
landed under explicit Founder Wave 3 authorization +
ADR-0062 design lock.

## SAFE view projections (ADR-0062 Sub-decision 2)

Three new interfaces + three pure projection helpers in
`hive.service.ts`:

```ts
HiveListItemView   ← projectHiveListItem(hive)
HiveAdminDetailView extends HiveListItemView  ← projectHiveAdminDetail(hive)
HiveMembershipAdminView ← projectHiveMembershipAdmin(m, entity)
```

**Forbidden fields explicitly excluded** (asserted at
wire-level in tests via `expect(r.raw).not.toContain(...)`):

- `governance_terms` (Wave 4 forward-substrate; opaque JSON
  not policy-evaluated).
- `aggregate_capsule_id` (internal pointer; leak target).
- `capsule_types_accessible` + `capsule_types_contributed`
  raw arrays (replaced with `..._count` numbers; member-
  private signal at v1).
- `storage_location`, `content_hash`, `secret_ref`,
  `bridge_id`, `payload_content`, `payload_summary`
  (cross-system substrate; never relevant at hive admin
  tier; tests explicitly verify absence).

## Audit emission (zero new literals per ADR-0062 Sub-decision 5)

- **DELETE hive (active → DISSOLVED)** emits
  `event_type: "ADMIN_ACTION"` + safe details
  (`action: "HIVE_DISSOLVED"`, `hive_id`, `org_entity_id`,
  `member_count_at_dissolve`). Mirrors Section 4 connector
  ADMIN_ACTION + details.action discriminator pattern.
- **DELETE hive (already DISSOLVED)** emits **NO audit
  row**. Idempotent paths don't emit because the audit
  chain reflects state transitions, not no-op requests.
  Response carries `already_dissolved: true` +
  `audit_event_id: null` so callers can distinguish "I
  caused this" from "was already so".
- **DELETE member (admin force-remove)** emits the
  existing `event_type: "HIVE_MEMBER_REMOVED"` literal
  (semantically correct — membership status flipped ACTIVE
  → REMOVED regardless of who triggered) PLUS
  `details.action: "HIVE_MEMBER_FORCE_REMOVED"` +
  `details.actor_role: "ORG_ADMIN"` discriminators.
  Distinguishes from creator-self-remove (which emits
  same literal without these discriminators).
- **DELETE member (already REMOVED)** returns 404
  `MEMBERSHIP_NOT_FOUND` and emits NO new audit row
  (mirrors existing `removeMember` semantic; enumeration-
  safe with unknown-member case).
- **GET list / GET detail** emit NO audit row per Section
  4 connector list/get precedent. Admin oversight is
  established by TAR gate + same-org enforcement, not
  per-read audit trail. Forward-substrate if a regulatory
  regime mandates read audit (CAR Sub-box 7 or equivalent).

## AI_AGENT force-remove (ADR-0062 Sub-decision 4)

Per Founder direction: org admin may force-remove AI_AGENT
members from hives where they appear. This is a **cleanup
surface** for the `createTwin` standard-branch auto-join
documented at ADR-0059 §3.c — admin can now remove what
`createTwin` auto-joined.

Wave 3 does NOT close the createTwin carve-out itself.
The carve-out persists; the invite-surface AI_AGENT
exclusion (Wave 2) stands unchanged; Wave 3 just provides
the admin cleanup channel. Future Section 5 / Section 11
slice under separate Founder authorization can close the
carve-out properly when twin-architecture cascade cost is
acceptable.

The integration test exercises this path explicitly:

```ts
it("AI_AGENT force-remove permitted at admin tier (ADR-0062 Sub-decision 4)", async () => {
  const aiAgent = await makeMember({ orgId, entity_type: "AI_AGENT" });
  ...
  const r = await del(admin, `/api/v1/org/hives/${hiveId}/member/${aiAgent.entityId}`);
  expect(r.statusCode).toBe(200);
  expect(ms?.status).toBe("REMOVED");
});
```

## Test surface (20 cases)

`tests/integration/hive-wave-3-admin-routes.test.ts`:

| Group | Cases | Coverage |
|---|---|---|
| Admin gate enforcement | 4 | 403 ADMIN_CAPABILITY_REQUIRED on all 4 routes without can_admin_org; 401 without bearer; 404 NO_ORG_FOR_CALLER for orgless admin |
| GET list | 4 | Same-org scoping; ?status=DISSOLVED filter; 422 on unknown status; wire no-leak (governance_terms / secret_policy / aggregate_capsule_id absent) |
| GET detail | 3 | Hive + safe roster (capsule_types_*_count not raw arrays); cross-org 404 enumeration-safe; wire no-leak (8 forbidden-field substrings asserted absent) |
| DELETE dissolve | 3 | Active → DISSOLVED transition + ADMIN_ACTION + HIVE_DISSOLVED audit; idempotent already-DISSOLVED (no new audit, already_dissolved: true); cross-org 404 (target hive preserved ACTIVE) |
| DELETE force-remove | 4 | Admin flip + HIVE_MEMBER_REMOVED + HIVE_MEMBER_FORCE_REMOVED + ORG_ADMIN discriminators; enumeration-safe 404 for already-REMOVED; cross-org 404 (target preserved); AI_AGENT force-remove permitted |
| Read-no-audit | 2 | GET list emits no audit row; GET detail emits no audit row |

## Gates at merge

- TypeScript baseline: 4 canonical residuals preserved.
- Unit tier: 371 tests + 42 anchor regression all green.
- Integration tier: 111 baseline + 20 NEW Wave 3 + 15
  Wave 2 + connector + admin regressions all green.
- Elixir tier: compile + test green.
- No-console anchor + no-leak guard: green.

## What is NOT in this PR

- The `createTwin` carve-out (forward-substrate per
  ADR-0059 §3.c; future Section 5 / Section 11 slice).
- No new audit literal.
- No schema migration.
- No frontend / Control Tower work.
- No pagination at v1 (measure-first per ADR-0016).
- No admin read audit (forward-substrate if regulatory
  regime mandates).
- No member capsule_types value visibility (counts only;
  forward-substrate amendment if product requires).
- No Wave 4 governance_terms evaluator (Founder product
  decision required first).
- No Wave 5+ Phoenix.PubSub / Broadway / hive-weighting /
  Twin-to-Twin runtime.
