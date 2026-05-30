# ADR-0059: Section 3 Hives / Team Intelligence v1 Design Boundary

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SLEEP-DIRECTIVE-SECTION-3-HIVES-V1-ADR-AUTH]` (per
Founder Sleep Directive 2026-05-30 next-section preference #1:
"Section 3 Hives / Team Intelligence — begin with RULE 21
research + ADR/design only").

This is the **Section 3 Wave 1 contract ADR**. It is design-only:
it locks the v1 scope boundary, surfaces substrate-honest
findings about existing Hive substrate already on main, locks
the safe behavior the existing service tier must enforce, and
explicitly defers schema migration / new routes / Twin-to-Twin
coordination runtime to subsequent waves. It adds **no code, no
new routes, no schema migration, no new audit literal** in this
phase — implementation slices land under separate
EXECUTE-VERIFY authorizations.

## Context

### Substrate-honest finding (RULE 13)

Per Founder Sleep Directive Phase 0 verification (2026-05-30),
Section 3 substrate is **far more complete than the prior
build-state doc claimed**. The prior `docs/current-build-state/03-hives-team-intelligence.md`
reported "Substrate not yet started"; the actual on-main state
is:

- **`Hive` model LIVE** at `packages/database/prisma/schema.prisma:608-628`
  with 12 fields: `hive_id` + `hive_name` + `created_by` +
  `hive_type` (5-value enum) + `governance_terms Json` +
  `aggregate_capsule_id String?` + `member_count Int` +
  `status` (ACTIVE | DISSOLVED) + `org_entity_id String?` +
  `is_default_enterprise Boolean` + `created_at` + `updated_at`.
- **`HiveMembership` model LIVE** at `schema.prisma:635-653`
  with 10 fields: `membership_id` + `hive_id` + `entity_id` +
  `capsule_types_contributed String[]` + `contribution_scope`
  (AccessScope) + `capsule_types_accessible String[]` +
  `access_scope` (AccessScope) + `joined_at` + `expires_at` +
  `status` (ACTIVE | REMOVED). `@@unique([hive_id, entity_id])`
  + indexes on `entity_id` + `status`.
- **`HiveType` enum LIVE** with 5 values: `PERSONAL_NETWORK`,
  `ENTERPRISE`, `CROSS_ORGANIZATION`, `DEVICE_NETWORK`,
  `GOVERNMENT`.
- **`HiveStatus` + `MembershipStatus` + `AccessScope` enums
  LIVE** at `schema.prisma:538-546` + `483-487`.
- **`HiveService` LIVE** at
  `apps/api/src/services/hive/hive.service.ts` with 5 methods
  (createHive, inviteToHive, removeMember, getHiveIntelligence,
  buildHiveAggregate).
- **`hive.routes.ts` LIVE** at `apps/api/src/routes/hive.routes.ts`
  with `POST /api/v1/hive` + member-invite + member-remove +
  intelligence-read routes.
- **5 HIVE_* audit literals LIVE** at
  `packages/database/src/queries/audit.ts:50-54`:
  `HIVE_CREATED`, `HIVE_MEMBER_ADDED`, `HIVE_MEMBER_REMOVED`,
  `HIVE_INTELLIGENCE_READ`, `HIVE_AGGREGATE_BUILT`.
- **TAR `can_create_hives Boolean @default(false)`** at
  `schema.prisma:238` — capability EXISTS but is NOT enforced
  by `hive.routes.ts` today (TAR-gate gap).

This ADR's Wave 1 deliverable is therefore NOT greenfield
design — it is **substrate-honest canonicalization** of the
existing schema's design intent + locking the v1 behavior the
service tier should enforce + identifying which behavior gaps
are safe to close autonomously vs which require separate
authorization.

### RULE 21 research arc

External + internal research conducted at Phase 0:

- **DGI doctrine canon** — ADR-0052 §8 ("scoped Twin-to-Twin
  coordination through policy-governed channels exchanging
  only minimum relevant info; no boundary-crossing, no
  cross-tenant leakage, no hidden autonomy").
- **Phoenix.PubSub hive fanout reservation** — ADR-0039
  §Forward Queue entry #28 reserves Phoenix.PubSub + Broadway
  + hive-algorithm-weighting substrate for forward sub-phases
  c+d + sub-arc 2. Current BEAM-side substrate for hives:
  NONE (purely doctrinal reservation).
- **RULE 0 three-wallet sovereignty** — each entity owns
  exactly one wallet; cross-org wallet fusion is forbidden by
  ADR-0001. Cross-organization Hives (HiveType
  `CROSS_ORGANIZATION`) would require a new wallet-isolation
  model OR they must operate at the membership-projection tier
  (each member contributes a SAFE projection from their own
  wallet; aggregation is counts/labels, never raw content).
- **AI_AGENT entity-type-discriminated routing** — ADR-0046
  established that AI_AGENT entities map to PERSONAL or
  ENTERPRISE wallets based on context. AI_AGENT auto-join
  behavior on `is_default_enterprise` hives is a v1 safety
  question.
- **Capsule type access discipline** — `HiveMembership.capsule_
  types_contributed` + `capsule_types_accessible` exist as
  String[] columns. Their enforcement at read-time is a v1
  safety question.
- **Per-entity audit chain canonical** — ADR-0002 + RULE 4 +
  the 5 existing HIVE_* audit literals already cover hive
  lifecycle. No new audit literal needed.

The honest consequence: Section 3 Hives v1 is a substrate-
honest canonicalization wave. It locks v1 semantics on the
existing substrate; it explicitly defers Phoenix.PubSub
coordination, governance_terms policy enforcement, admin
routes, and Twin-to-Twin runtime to forward waves.

## Decision

Foundation will canonicalize Section 3 Hives v1 as a
**same-org-scoped, governance-aware, RULE 0-respecting
intra-organization coordination substrate**. v1 surfaces what
already exists in the schema + locks the safe service-tier
behavior the substrate must enforce. Forward-substrate items
(cross-org hives, Twin-to-Twin runtime, governance_terms
enforcement, admin routes, Phoenix.PubSub fanout) require
separate Founder authorization.

### 1. v1 scope lock

**v1 Hive is**: an org-scoped (same-tenant), governance-aware,
RULE-0-respecting coordination surface where members of one
organization share aggregate intelligence signals derived from
their own permissioned capsules. Specifically:

- Every v1 Hive MUST have a non-null `org_entity_id`. Hives
  with `org_entity_id IS NULL` are forbidden at v1. (The column
  stays nullable in the schema for forward-substrate options
  but the service tier rejects null at create-time.)
- Every v1 Hive's `hive_type` MUST be `ENTERPRISE` or
  `PERSONAL_NETWORK`. The `CROSS_ORGANIZATION` +
  `DEVICE_NETWORK` + `GOVERNMENT` enum values are **explicitly
  not enforced at v1** — they remain in the enum for forward-
  substrate but the service tier rejects them at create-time.
- Every v1 Hive member MUST share the same `org_entity_id` as
  the Hive itself (verified at `inviteToHive` time via
  EntityMembership). Cross-org membership is forbidden at v1.
- `is_default_enterprise = true` triggers auto-join behavior
  (forward-substrate; no existing route auto-joins today;
  see §4 below).
- Aggregate intelligence is a counts/labels-only projection
  derived from members' permissioned capsules — NEVER raw
  capsule content, NEVER per-member attribution beyond
  membership existence, NEVER cross-org fusion.

### 2. v1 non-goals

The following are EXPLICITLY NOT shipped at v1 (each is its
own forward-substrate slice requiring separate Founder
authorization):

- **Cross-organization Hives** (HiveType CROSS_ORGANIZATION).
  Collides with RULE 0 three-wallet sovereignty + ADR-0001
  + the per-entity wallet model. Future cross-org coordination
  must operate at the projection tier (each member's wallet
  contributes a SAFE projection; aggregation never fuses
  wallets).
- **Twin-to-Twin proactive runtime** (ADR-0052 §8 full vision).
  Requires Phoenix.PubSub substrate (ADR-0039 Forward Queue
  entry #28) + autonomy policy. Not in v1.
- **`governance_terms` Json policy enforcement.** The field
  exists; v1 stores it opaquely; v1 service tier does NOT
  evaluate policy terms. Future enforcement requires a
  canonical schema for governance_terms + a policy evaluator.
- **Hive admin routes** (PUT /org/hives/:id, DELETE
  /org/hives/:id, archive, dissolve, member-roster admin
  surfaces). Wave 2+; require `can_admin_org` gating + the
  Section 4 connector admin route pattern verbatim.
- **Phoenix.PubSub fanout** for hive aggregate updates
  (ADR-0039 entry #28).
- **Broadway pipeline at high-throughput register** (ADR-0039
  entry #28).
- **Hive algorithm at weighting architecture register**
  (ADR-0039 entry #28).
- **AI-generated executive summaries of hive activity** — same
  Founder-product-decision constraint as Section 9 ADR-0052
  doctrine exec summaries.
- **Cross-hive aggregation** (multiple hives in one query) —
  forward-substrate.

### 3. Behavior the service tier MUST enforce at v1

These are substrate-derivable from existing ADRs (RULE 0 +
ADR-0001 + ADR-0046 + RULE 4) and do NOT require new Founder
product decisions:

#### 3.a) TAR capability gate on POST /api/v1/hive

Per `can_create_hives Boolean @default(false)` at
`schema.prisma:238`, this capability exists but is NOT enforced
by `hive.routes.ts` today. v1 service-tier behavior: callers
without `can_create_hives = true` receive 403
`OPERATION_NOT_PERMITTED` on `POST /api/v1/hive`. Mirrors the
canonical `requireAdminCapability` pattern from
`apps/api/src/middleware/admin.middleware.ts` used by
Section 4 connector admin routes.

#### 3.b) Same-org membership enforcement

Per RULE 0 three-wallet sovereignty: `inviteToHive` MUST
verify that the invitee shares the same `org_entity_id` as the
Hive. The verification uses `EntityMembership` lookup; if the
invitee has no membership in the Hive's org, the invite
returns 403 `CROSS_ORG_HIVE_DENIED` (mirrors the Wave 11
internal-notification cross-org pattern at
`notification.service.ts:99-109`).

#### 3.c) AI_AGENT auto-join discrimination

Per ADR-0046 AI_AGENT entity-type-discriminated routing +
RULE 0 lower-default-permission ceilings for AI: when an
`is_default_enterprise = true` Hive auto-join sweep eventually
lands (forward-substrate; not in this v1 wave), it MUST
discriminate on `EntityType`. AI_AGENT entities are
**explicitly excluded from auto-join** at v1. A future slice
can authorize AI_AGENT auto-join behind a separate Founder
decision per ADR-0046's AI permission-ceiling discipline.

#### 3.d) Capsule-type filtering enforced at read

`HiveMembership.capsule_types_contributed` +
`capsule_types_accessible` are operator-supplied String[] sets.
v1 service tier enforces these at read time:
`getHiveIntelligence` filters the aggregate projection to
include only capsules whose `capsule_type` appears in the
caller's `capsule_types_accessible` membership row. A member
whose `capsule_types_accessible` is empty receives an
empty-aggregate projection (zero-state response, not an error).

#### 3.e) RULE 0 sovereignty + no raw content leakage

`getHiveIntelligence` returns aggregate counts + label
projections (e.g., common-tag aggregate per ADR-0052 §"DGI
doctrine"). It NEVER returns: capsule_id lists, payload_summary,
payload_content, target_capsule_id, raw topic_tag values per
capsule, member-by-member content attribution, or any field
that would let a hive reader infer what a specific member
contributed beyond membership existence. The SAFE projection
pattern mirrors ADR-0058 §7 (drift signals): closed-vocabulary
labels + counts + honest notes only.

#### 3.f) Audit emission via existing 5 HIVE_* literals

No new audit literal at v1. The existing
`HIVE_CREATED` + `HIVE_MEMBER_ADDED` + `HIVE_MEMBER_REMOVED`
+ `HIVE_INTELLIGENCE_READ` + `HIVE_AGGREGATE_BUILT` literals
cover the v1 surface. Future audit emissions (HIVE_ARCHIVED,
HIVE_GOVERNANCE_UPDATED, HIVE_AGGREGATE_INVALIDATED, etc.)
land via the additive `AUDIT_EVENT_TYPE_VALUES` extension
pattern at their respective waves.

### 4. NO schema migration at v1

The existing Hive + HiveMembership schema is sufficient for
the v1 scope locked above. No new column, no new index, no new
enum. Forward-substrate considerations:

- A future `archived_at DateTime?` field could complement the
  `status` enum's DISSOLVED value for richer soft-delete; not
  needed at v1.
- A future `governance_terms_schema_version Int` field could
  pair with a canonical governance_terms schema; not needed
  until v1's "stored opaquely" disposition flips.
- A future `auto_join_excluded_entity_types EntityType[]`
  field could let operators tune auto-join filtering per Hive;
  v1 hard-codes AI_AGENT exclusion at the service tier.

### 5. NO new audit literal at v1

Per §3.f above — existing 5 HIVE_* literals suffice. Per
Section 7 + Section 4 + Section 1 Wave 3 precedent, no new
literal is needed; any future hive-class audit semantic can
ride either the additive AUDIT_EVENT_TYPE_VALUES extension OR
the `ADMIN_ACTION + details.action` discriminator pattern,
chosen at the slice that adds it.

### 6. NO new ADR companion at v1

This is the only ADR landing at Wave 1. Subsequent slices
(admin routes, governance_terms schema, Phoenix.PubSub fanout,
Twin-to-Twin coordination) each get their own ADR if scope
warrants per the ADR-0042/0043/0044/0045/0046 sub-arc pattern.

### 7. Implementation gating

The behavior locks in §3 are substrate-derivable from existing
ADRs + the Founder Sleep Directive boundary. They are
candidates for autonomous Wave 2 implementation if the Founder
on awake-time review confirms the v1 scope lock + non-goals
above.

**Explicit Founder authorization checkpoint** required before
Wave 2 implementation:

1. **Scope lock confirmation**: v1 = ENTERPRISE | PERSONAL_NETWORK
   only; CROSS_ORG / DEVICE_NETWORK / GOVERNMENT enum values
   forbidden at v1 service tier.
2. **Auto-join semantics**: AI_AGENT excluded by hard-code at
   the service tier; humans + DEVICE auto-join when
   `is_default_enterprise = true` (auto-join sweep itself is
   forward-substrate; this only locks the discrimination logic
   when the sweep lands).
3. **TAR gate addition**: `requireAdminCapability(authService,
   "can_create_hives")` on POST /api/v1/hive — would BREAK any
   existing caller that depends on the un-gated route. The
   Founder must confirm no live operator depends on the
   un-gated behavior before Wave 2 enforces this gate.
4. **Cross-org membership rejection**: `inviteToHive` returns
   403 CROSS_ORG_HIVE_DENIED for invitees outside the Hive's
   org. Same backward-compat consideration as #3 — any live
   caller relying on cross-org invites is breaking RULE 0 and
   should be denied, but the Founder should confirm no test
   fixture or operator workflow depends on cross-org behavior.
5. **Capsule-type filtering**: enforcing
   `capsule_types_accessible` at read-time may surface
   zero-state responses where today the operator gets a
   non-filtered aggregate. The Founder must confirm this
   tightening is the intended posture.

Each of these is a substrate-derivable safety improvement, but
each could break a live caller. The Founder authorization
checkpoint is explicit at the next slice's authorization
prompt, not autonomously executed.

### 8. Wave 1 deliverable (this ADR)

This commit lands:

- NEW `docs/architecture/decisions/0059-section-3-hives-team-intelligence-v1-design.md`
  (this file).
- RULE 14 back-citation into ADR-0039 §Forward Queue entry
  #28 noting that Wave 1 ADR for hive substrate canonical
  scope landed at ADR-0059.
- RULE 14 back-citation into ADR-0052 §8 (DGI doctrine
  Twin-to-Twin coordination) noting v1 scope deferred Twin-to-
  Twin runtime.
- ADR catalog entry in `docs/architecture/README.md`.
- Substrate-honest correction in
  `docs/current-build-state/03-hives-team-intelligence.md`
  reflecting the actual on-main substrate (vs the prior
  "Substrate not yet started" claim).
- Master + baton refresh.

**NO code changes. NO schema migration. NO new routes. NO new
audit literal. NO new RULE landings. Wave 1 is pure design +
substrate-honest doc correction per Founder Sleep Directive
"ADR/design only" scope.**

## Consequences

### Easier after Wave 1

- Section 3 substrate has an authoritative scope canonical
  for the first time. Future implementation slices reference
  this ADR rather than guessing.
- The existing on-main Hive schema + service + routes are
  now substrate-honest documented (the prior build-state
  drift is corrected at the same commit).
- The 5 explicit Founder authorization checkpoints in §7
  surface the safety tradeoffs of tightening the existing
  permissive substrate — the Founder can deliberately
  approve / defer each independently.

### Harder after Wave 1

- The on-main `hive.routes.ts` lacks TAR enforcement of
  `can_create_hives`. Wave 1 documents this as a gap; Wave 2
  closes it (subject to Founder Authorization checkpoint #3).
  Until Wave 2 lands, the substrate-honest disclosure is that
  any authenticated caller can create a Hive — which violates
  the schema's `can_create_hives @default(false)` design
  intent.
- The on-main `inviteToHive` does NOT (per Phase 0
  verification) verify same-org membership before adding a
  member. This is a RULE 0 cross-org safety gap. Wave 1
  documents it; Wave 2 closes it (subject to Founder
  Authorization checkpoint #4).
- `governance_terms Json` is stored but never evaluated.
  Operators who think governance terms enforce policy are
  mistaken at v1; the field is forward-substrate.

### Substrate-state catches resolved

- ADR-0039 §Forward Queue entry #28 (Phoenix.PubSub hive
  fanout) reservation now has a canonical v1 scope that
  defers PubSub substrate to forward sub-arcs explicitly.
- ADR-0052 §8 (Twin-to-Twin coordination doctrine) now has
  a v1 contract that defers Twin-to-Twin runtime explicitly.
- The `docs/current-build-state/03-hives-team-intelligence.md`
  "Substrate not yet started" canonical-truth drift is
  corrected at the same commit (RULE 13).

## Forward queue

Each item is forward-substrate (separate Founder authorization
required at its slice):

- Wave 2 implementation: add `can_create_hives` TAR gate on
  POST /api/v1/hive; add same-org membership check on
  `inviteToHive`; add AI_AGENT auto-join discrimination logic;
  enforce capsule_types_accessible at read-time; reject
  CROSS_ORG / DEVICE_NETWORK / GOVERNMENT HiveType values at
  service tier; add `org_entity_id` required-at-create check.
- Wave 3: hive admin routes (org list, archive, dissolve,
  member roster); requires can_admin_org gating + the
  Section 4 connector admin route pattern. **CLOSED**
  at ADR-0062 (2026-05-30) — 4 admin route surfaces +
  safe roster projection + idempotent dissolve/force-remove
  + AI_AGENT force-remove permitted + ADMIN_ACTION +
  HIVE_MEMBER_REMOVED reuse (zero new audit literals).
- Wave 4: governance_terms canonical schema + policy
  evaluator; canonical schema requires Founder product
  decision on which terms are evaluable.
- Wave 5: Phoenix.PubSub fanout for hive aggregate updates
  (consumes ADR-0039 entry #28).
- Wave 6: Broadway pipeline at high-throughput register
  (consumes ADR-0039 entry #28).
- Wave 7: hive algorithm at weighting architecture register
  (consumes ADR-0039 entry #28).
- Wave 8+: Twin-to-Twin proactive coordination runtime per
  ADR-0052 §8 full vision.

## Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline, the
following Hive substrate fields are patent-evidence-bearing
(US 12,517,919 + US 12,164,537 + US 12,399,904):

- `Hive.aggregate_capsule_id` — ties the hive's collective
  intelligence to a capsule per US 12,517,919 capsule layer
  claim. Wave 1 documents the binding; the field already
  exists in the schema.
- `Hive.is_default_enterprise` — portability protection per
  US 12,517,919 + US 12,164,537 + US 12,399,904 enterprise-
  ownership claims. The aggregate stays with the org, not
  with the creator-employee who departs.
- `HiveMembership.capsule_types_contributed` +
  `capsule_types_accessible` — scoped contribution +
  consumption per US 12,517,919 capsule-layer permission
  claims.

Fields explicitly NOT patent-evidence-bearing at v1
(governance surface or non-patent material):

- `Hive.hive_name`, `Hive.hive_type`, `Hive.member_count`,
  `Hive.status`, `Hive.created_at`, `Hive.updated_at`.
- `HiveMembership.access_scope`, `contribution_scope`,
  `joined_at`, `expires_at`, `status`.
- `Hive.governance_terms Json` (forward-substrate; not yet
  schema-defined).

## Bidirectional citations

- Cited from ADR-0039 §Forward Queue entry #28 (Phoenix.PubSub
  hive fanout — Wave 5+ forward-substrate).
- Cited from ADR-0052 §8 (Twin-to-Twin coordination doctrine
  — Wave 8+ forward-substrate).
- Cites ADR-0001 (three-wallet architecture; RULE 0 source).
- Cites ADR-0046 (AI_AGENT entity-type-discriminated routing;
  v1 §3.c).
- Cites ADR-0002 (audit chain; RULE 4 source).
- Cites ADR-0058 (drift signal SAFE projection pattern mirror
  at §3.e).
- Cites RULE 0, RULE 4, RULE 13, RULE 14, RULE 19, RULE 20.
- Founder authorization explicit at
  `[FOUNDER-SLEEP-DIRECTIVE-SECTION-3-HIVES-V1-ADR-AUTH]` per
  Founder Sleep Directive 2026-05-30.
