# PR #94 — Section 3 Wave 4 v1 — governance_terms policy evaluator

**Date:** 2026-05-30
**Merge commit:** `065e4f1`
**Branch:** `section-3-wave-4-governance-terms-evaluator`
**ADR:** [ADR-0063](../architecture/decisions/0063-section-3-hives-wave-4-governance-terms-evaluator.md)
**Companion design PR:** [#93](https://github.com/NiovArchitect/niov-foundation/pull/93)
**Section file:** [`03-hives-team-intelligence.md`](../current-build-state/03-hives-team-intelligence.md)
**Authorization:** Founder Wave 4 implementation authorization
(2026-05-30) selecting 9 of the ADR-0063 10 v1 evaluable
terms; `require_admin_approval_for_invites` DEFERRED until
an admin invite path exists.

## Why this entry exists

PR #94 lands ADR-0063's Layer 1 implementation: a
pure-function evaluator over the existing
`Hive.governance_terms Json` field at 3 HiveService call
sites + 6 new violation codes + 20 integration tests
covering all wired terms + MALFORMED path + no-leak
invariants + Wave 2/3 regression preservation. Tier-4
build-log entry per `CURRENT_BUILD_STATE.md` rule:
"security/governance landing + complex runtime behavior
+ cross-section RULE 0 enforcement."

## Term-by-term wiring matrix

| ADR-0063 v1 term | Call site | Failure code | Notes |
|---|---|---|---|
| `allowed_hive_types` | `createHive` | `GOVERNANCE_HIVE_TYPE_FORBIDDEN` | Wave 2 `HIVE_TYPE_V1_ALLOWLIST` runs FIRST |
| `allowed_member_entity_types` | `inviteToHive` | `GOVERNANCE_INVITEE_TYPE_FORBIDDEN` | Wave 2 AI_AGENT exclusion runs FIRST |
| `allow_ai_agent_membership` | `inviteToHive` (advisory) | `GOVERNANCE_INVITEE_TYPE_FORBIDDEN` (defense-in-depth) | Wave 2 always wins at v1; this is a future-proof rule |
| `max_member_count` | `inviteToHive` | `GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED` | Compares `current_member_count + 1` vs limit |
| `allowed_capsule_types_accessible` | `createHive` (creator) + `inviteToHive` (invitee) | `GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN` | Subset check |
| `allowed_capsule_types_contributed` | same | `GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN` | Subset check |
| `dissolve_requires_admin` | (no-op at v1) | — | Wave 3 `DELETE /api/v1/org/hives/:id` already admin-gated |
| `aggregate_min_member_count` | `getHiveIntelligence` | (zero-state, NOT failure) | Reuses existing HIVE_INTELLIGENCE_READ + `details.zero_state_reason: "BELOW_AGGREGATE_MIN_MEMBER_COUNT"` |
| `policy_source_ref` | (metadata-only at v1) | — | Persisted to JSON; never fetched externally |
| `require_admin_approval_for_invites` | **DEFERRED** | (no code added) | Would hard-freeze inviteToHive; awaits future admin invite path |

## Pure-function evaluator (`apps/api/src/services/hive/governance-terms-evaluator.ts`)

Five public exports + two private helpers:

- **`V1_GOVERNANCE_TERM_KEYS`** (`as const`) — closed
  vocabulary of 9 recognized v1 keys.
- **`ParsedGovernanceTerms`** — type-safe parsed shape;
  every field optional.
- **`GovernanceViolationCode`** — discriminated union of
  6 failure codes. The 7th ADR-0063 code
  (`INVITE_REQUIRES_ADMIN_APPROVAL`) is NOT added because
  the term that would produce it is deferred.
- **`GovernanceEvalResult`** + **`GovernanceAggregateGateResult`**
  — return shapes (discriminated on `ok`).
- **`parseGovernanceTerms(raw)`** — lenient per-key parser.
  Returns `"MALFORMED"` ONLY when top-level value is not
  a JSON object. Per-key type mismatch or unknown keys
  silently ignored per ADR-0063 Sub-decision 2 ("unrecognized
  keys IGNORED at v1").
- **`evaluateGovernanceForCreate(rawTerms, args)`** — wired
  at `createHive`.
- **`evaluateGovernanceForInvite(rawTerms, args)`** — wired
  at `inviteToHive`.
- **`evaluateGovernanceForAggregateRead(rawTerms, args)`** —
  wired at `getHiveIntelligence`. Returns a discriminated
  union with `below_threshold` flag for zero-state collapse.

**No database reads.** **No external source fetching.** **No
Layer 2/3 substrate.** **No daemon.** **No scheduled jobs.**

## HiveService wiring

The evaluator runs AT EACH CALL SITE inside the existing
synchronous request handler flow, AFTER all Wave 2/3
checks and BEFORE the persistence transaction.

Order at `createHive`:

1. INVALID_REQUEST shape check (existing).
2. Session validation with `"create_hives"` op (Wave 2).
3. `HIVE_TYPE_V1_ALLOWLIST` enforcement (Wave 2).
4. org_entity_id resolution (Wave 2 3-way).
5. Default-enterprise dup check (Wave 2).
6. **Wave 4 governance evaluator** — `evaluateGovernanceForCreate`.
7. `prisma.$transaction` persistence (existing).
8. `HIVE_CREATED` audit emission (existing).

Order at `inviteToHive`:

1. Session validation (existing).
2. Hive lookup + dissolved check + creator check (existing).
3. Invitee lookup + AI_AGENT exclusion (Wave 2).
4. Same-org membership check (Wave 2).
5. Already-member check (existing).
6. **Wave 4 governance evaluator** — `evaluateGovernanceForInvite`
   (replaces the prior `Governance-terms validation hook --
   permissive for MVP` placeholder comment block).
7. `prisma.$transaction` membership upsert + member_count
   decrement (existing).
8. `HIVE_MEMBER_ADDED` audit emission (existing).

Order at `getHiveIntelligence`:

1. Session validation (existing).
2. Hive lookup + dissolved check (existing).
3. Active membership check (existing).
4. Empty-capsule_types_accessible zero-state (Wave 2).
5. **Wave 4 governance evaluator** — `evaluateGovernanceForAggregateRead`
   (returns `below_threshold: true` for zero-state OR
   `MALFORMED` failure for hard reject).
6. aggregate_capsule_id null check (existing).
7. Aggregate decryption + audit (existing).

## No-leak invariants

Two dedicated integration tests verify no-leak with secret
markers:

- The full governance_terms object NEVER appears in error
  messages. Test plants `internal_policy_note: SECRET_MARKER`
  in `governance_terms`, triggers
  `GOVERNANCE_INVITEE_TYPE_FORBIDDEN`, asserts the failure
  message does NOT contain `SECRET_MARKER`.
- The full governance_terms object NEVER appears in audit
  details. Test plants `internal_policy_note: SECRET_MARKER`,
  triggers a `BELOW_AGGREGATE_MIN_MEMBER_COUNT` zero-state
  read, asserts the serialized
  `HIVE_INTELLIGENCE_READ.details` JSON does NOT contain
  `SECRET_MARKER`.

Error messages include only the canonical TERM NAME (e.g.,
"invite blocked by hive policy term
`allowed_member_entity_types`"). Term names are operational
vocabulary per ADR-0063 Sub-decision 5; not sensitive.

## Route status mapping

`apps/api/src/routes/hive.routes.ts` `statusForCode`:

- 5 hard governance denials → **403**
  (`GOVERNANCE_HIVE_TYPE_FORBIDDEN`,
  `GOVERNANCE_INVITEE_TYPE_FORBIDDEN`,
  `GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED`,
  `GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN`,
  `GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN`) —
  fail-closed alongside Wave 2's `OPERATION_NOT_PERMITTED`
  / `CROSS_ORG_INVITE_DENIED` / `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE`.
- `GOVERNANCE_TERMS_MALFORMED` → **422** — matches existing
  config-shape pattern (`INVALID_HIVE_TYPE_FOR_V1` +
  `ORG_ENTITY_ID_REQUIRED`); operator-state corruption
  rather than RULE 0 / authorization violation.

## Audit emission

**Zero new audit literals.** Per ADR-0063 Sub-decision 6:

- Denial paths emit NO audit row (consistent with Wave 2
  TAR-gate denies + Wave 3 enumeration-safe 404s).
- `getHiveIntelligence` zero-state under
  `aggregate_min_member_count` reuses the existing
  `HIVE_INTELLIGENCE_READ` literal with new
  `details.zero_state_reason: "BELOW_AGGREGATE_MIN_MEMBER_COUNT"`
  marker (mirrors Wave 2's `"EMPTY_CAPSULE_TYPES_ACCESSIBLE"`).
- Existing literals + their `details` shapes unchanged.

## Test surface (20 cases)

`tests/integration/hive-wave-4-governance-terms-evaluator.test.ts`:

| Group | Cases | Coverage |
|---|---|---|
| allowed_hive_types | 3 | blocks disallowed; accepts allowlisted; Wave 2 allowlist runs FIRST |
| allowed_member_entity_types | 2 | blocks disallowed; accepts allowlisted |
| allow_ai_agent_membership (advisory) | 1 | true does NOT override Wave 2 AI_AGENT exclusion |
| max_member_count | 1 | accepts up to cap; blocks past cap |
| allowed_capsule_types_accessible | 2 | blocks invite; blocks createHive creator settings |
| allowed_capsule_types_contributed | 1 | blocks invite |
| aggregate_min_member_count | 2 | zero-state below threshold with correct audit reason; reads normally above |
| policy_source_ref metadata-only | 1 | persists to JSON; no external fetch |
| GOVERNANCE_TERMS_MALFORMED | 2 | rejects non-object at create; rejects malformed stored at invite |
| No-leak invariants | 2 | error message + audit details verified secret-marker-clean |
| Wave 2/3 regression | 3 | dissolve_requires_admin no-op; Wave 2 same-org runs FIRST; empty governance_terms is no-op |

## Gates at merge

- TypeScript baseline: 4 canonical residuals preserved.
- Unit tier: 371 tests + 42 anchor regression all green.
- Integration tier: 111 baseline + 20 NEW Wave 4 + 15 Wave 2 + 20 Wave 3 + connector + admin regressions all green.
- Elixir tier: compile + test green.
- No-console anchor + no-leak guard: green.

## What is NOT in this PR

- `require_admin_approval_for_invites` term (DEFERRED per
  Founder Wave 4 implementation authorization until admin
  invite path exists).
- `INVITE_REQUIRES_ADMIN_APPROVAL` violation code (would
  pair with the deferred term).
- Layer 2 substrate (enterprise governance policy registry
  + `OrgGovernancePolicy` model).
- Layer 3 substrate (external governance source feeds +
  `GovernanceSource` + `GovernanceSourceVersion` +
  `GovernanceReviewItem` models + Governance Source
  Connector + SCHEDULER integration + Section 11 review-task
  notifications).
- New audit literals (Layer 2/3 future audit will use
  ADMIN_ACTION + details.action discriminators).
- Schema migration (existing `Hive.governance_terms Json`
  field sufficient).
- governance_terms surfacing in `HiveAdminDetailView`
  (Wave 3 SAFE projection exclusion preserved at v1).
- Frontend / Control Tower work.
- Phoenix.PubSub / Broadway / hive-weighting / Twin-to-Twin
  runtime (Section 3 Waves 5+).
