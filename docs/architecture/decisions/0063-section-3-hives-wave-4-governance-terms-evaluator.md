# ADR-0063: Section 3 Hives Wave 4 — governance_terms Policy Evaluator + Three-Layer Governance-Source Boundary

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SECTION-3-WAVE-4-ADR-AUTH]` (2026-05-30).
**ADR-only authorization** — the design ADR lands at this
commit; implementation requires separate Founder
authorization on the exact v1 evaluable term set per
Sub-decision 13.

## Context

ADR-0059 §Forward queue Wave 4 reserves "governance_terms
canonical schema + policy evaluator" for separate Founder
authorization, with the explicit gate "canonical schema
requires Founder product decision on which terms are
evaluable." Wave 1 (ADR-0059) + Wave 2 (PR #88) + Wave 3
(PR #91) established the Hive substrate, service-tier
safety enforcement, and admin governance surface
respectively. Wave 4 is the policy-evaluation slice on
top of that hardened substrate.

The Founder direction for Wave 4 explicitly broadens the
design horizon beyond static manually-entered JSON:
governance must be versioned, source-attributed,
jurisdiction-aware, effective-date-aware, human/admin-
approved, and auditable; external legal/regulatory
ingestion is forward-substrate; default review frequency
for external sources MUST be low (monthly/quarterly) NOT
daily polling; no silent automatic enforcement changes.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `d98dc9f`:

- **`Hive.governance_terms Json @default("{}")`** exists at
  `schema.prisma:613` — currently stored opaquely; no
  evaluator reads it; ADR-0059 §Substrate-state catches
  explicitly documents the gap ("operators who think
  governance terms enforce policy are mistaken at v1; the
  field is forward-substrate").
- **`LawfulBasis` model** at `schema.prisma:1331-1350`
  (ADR-0036) is the canonical precedent for source-
  attributed + jurisdiction-aware + valid_from/valid_until
  windowed + chain-hashed governance substrate. The schema
  shape (`basis_reference`, `jurisdiction_invoked`,
  `valid_from`, `valid_until`, `chain_hash`) is the
  template Wave 4+ governance-source feeds will mirror.
- **`ComplianceFramework` model** at `schema.prisma:659-672`
  already exists as a primitive policy registry with
  `framework_name` (unique), `jurisdiction String[]`,
  `applicable_entity_sectors`, `applicable_capsule_types`,
  `rules Json`, `required_audit_events String[]`,
  `is_active`. Wave 4+ enterprise-policy-registry layer
  inherits this substrate.
- **Section 4 connector substrate** (`connector-binding.ts`
  + `OutboundWebhookProvider`) is the canonical pattern
  for future "Governance Source Connector" type — a new
  ConnectorType value alongside `OUTBOUND_WEBHOOK` per
  ADR-0021 CapsuleType extension protocol model adapted
  for ConnectorType.
- **Section 11 NotificationService** (`apps/api/src/services/notification/`)
  is the canonical pattern for future admin "governance
  review task" delivery — internal-only by Founder
  direction (per Section 2 Wave 11 closeout), which
  matches the Wave 4+ requirement that source-delta
  detection creates *review items* not *automatic
  enforcement*.
- **HiveService Wave 2/3 hooks** at
  `apps/api/src/services/hive/hive.service.ts`:
  `createHive` line 206 + `inviteToHive` line 394 +
  `getHiveIntelligence` line 685 + `dissolveHive`
  (Wave 3 admin) + `forceRemoveMember` (Wave 3 admin)
  are the v1 evaluator call sites.

### RULE 21 research arc

Wave 4 is **substrate-derivable design** — it adds zero
new external dependencies at v1, no wire-format
conventions, and the future-substrate layers (enterprise
registry + external source feeds) all have on-main
precedent (LawfulBasis + ComplianceFramework + Section 4
connectors + Section 11 notifications). RULE 21 does not
fire at v1.

Forward-substrate Wave 4+ implementations that add new
external governance-source ingestion (e.g., government
gazette APIs, regulatory authority RSS feeds, standards-
body publication URLs) WILL fire RULE 21 at their
authorization slice — each new external dependency or
wire-format convention requires a research arc at that
slice's pre-flight.

## Decision

Wave 4 ships an **ADR-only design** of the
governance_terms policy evaluator boundary at three
layers, with v1 implementation restricted to **Layer 1
(Local Hive governance_terms)** using the existing
on-main schema. Layers 2 + 3 are canonical-named at this
ADR but their substrate lands under separate Founder
authorization at their respective slices.

### Sub-decision 1 — Three-layer architecture

The governance substrate operates at three discrete
layers, each with distinct authorization boundary,
update lifecycle, and v1 implementation disposition:

**Layer 1 — Local Hive `governance_terms`** (v1
substrate-implementable scope):
- The current `Hive.governance_terms Json @default("{}")`
  field at `schema.prisma:613`.
- Per-Hive object; manually configured + admin-approved
  at hive create-time or via Wave 3 admin route surface
  (when an update path is authorized; see §Forward queue).
- Same-org only (caller's `org_entity_id` must match
  `Hive.org_entity_id`; ADR-0059 §1 lock).
- Evaluator reads the JSON at the call sites enumerated
  in Sub-decision 4.
- No schema migration at v1; the existing JSON field is
  sufficient for the 10 evaluable terms enumerated in
  Sub-decision 2.

**Layer 2 — Enterprise governance policy registry**
(forward-substrate; not in v1):
- A future org-level policy registry analogous to
  `ComplianceFramework` (`schema.prisma:659-672`).
- Allows reusable named policy templates across hives
  within an org (e.g., "default_engineering_hive_policy"
  → applied as the seed `governance_terms` on every new
  ENTERPRISE hive in the engineering department).
- Versioned (each registry entry has version + supersedes
  pointer + valid_from/valid_until); admin-approved;
  same-org scoped.
- Implementation requires a new schema model
  (e.g., `OrgGovernancePolicy`) + new admin routes +
  Founder authorization at its slice.

**Layer 3 — External governance source feeds**
(forward-substrate; not in v1):
- Future substrate for laws, regulations, agency rules,
  government sources, standards-body publications, and
  enterprise policy imports.
- Source-attributed (URL or source_id + source_authority
  + checksum/content_hash), jurisdiction-aware (mirrors
  `LawfulBasis.jurisdiction_invoked`), effective-date-
  aware (`valid_from` / `valid_until`; LawfulBasis
  precedent), versioned (version_id + supersedes pointer),
  and approval-gated (every change creates a *review item*
  not an *automatic enforcement update*).
- **Default review frequency: monthly or quarterly.** NOT
  daily polling. Per Founder explicit direction: "Foundation
  should detect governance source deltas, not constantly
  scrape the legal internet."
- **Weekly or faster** checks reserved for high-risk
  regulated customers OR specific watchlist sources
  (per-source configurable); never default.
- **Manual refresh** available for admin/legal users at
  the Layer-3 implementation slice.
- **No silent automatic enforcement changes** — a detected
  source delta enters Foundation as a *governance review
  item* requiring authorized admin/legal approval BEFORE
  any Layer 2 policy update or Layer 1 hive enforcement
  change fires.
- Implementation requires (a) a new ConnectorType value
  for governance sources alongside `OUTBOUND_WEBHOOK`
  (Section 4 substrate), (b) a scheduler integrated with
  ADR-0050 break-glass + future `SCHEDULER` principal,
  (c) source-version + delta-detection substrate, (d)
  review-task delivery via Section 11 internal-only
  NotificationService, (e) full audit trail using existing
  literals where possible. Founder authorization required
  at the slice; RULE 21 research arc required (external
  legal/regulatory APIs are external dependencies +
  wire-format conventions).

### Sub-decision 2 — v1 Layer 1 evaluable terms (10 canonical)

The Layer 1 evaluator at v1 recognizes exactly these 10
governance_terms keys; unrecognized keys are IGNORED at
v1 (do not throw, do not flag; Layer 2+ may surface
unknown-key warnings later):

| Key | Type | Semantics |
|---|---|---|
| `allowed_hive_types` | `string[]` (HiveType values) | Hive create may only use these types; subset of `HIVE_TYPE_V1_ALLOWLIST` (ENTERPRISE + PERSONAL_NETWORK at v1). Useful for orgs that want to forbid PERSONAL_NETWORK within their substrate. |
| `allowed_member_entity_types` | `string[]` (EntityType values) | invitee.entity_type must be in this set OR the set is absent/empty (meaning "any allowed by Wave 2 + RULE 0"). AI_AGENT is rejected by Wave 2 regardless; if `allowed_member_entity_types` includes AI_AGENT the explicit reject still fires (see Sub-decision 3). |
| `allow_ai_agent_membership` | `boolean` | If `true` AND the public invite surface were to permit AI_AGENT (it does not at v1 per Wave 2), AI_AGENT could be invited. **At v1 this term is ADVISORY ONLY** — Wave 2 `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE` exclusion at `inviteToHive` is the runtime enforcement; this term documents future intent without overriding Wave 2. |
| `max_member_count` | `number` (positive integer) | invite fails if `Hive.member_count >= max_member_count`. Useful for tiered offerings or operational caps. |
| `allowed_capsule_types_accessible` | `string[]` (CapsuleType values) | Invitee membership's `capsule_types_accessible` must be a subset of this allowlist; if `capsule_types_accessible` would not be a subset, invite fails. Operator may use this to restrict consumer scope across all hive memberships. |
| `allowed_capsule_types_contributed` | `string[]` (CapsuleType values) | Same pattern for `capsule_types_contributed`. Operator may use this to restrict contributor scope. |
| `require_admin_approval_for_invites` | `boolean` | If `true`, public `inviteToHive` fails with `INVITE_REQUIRES_ADMIN_APPROVAL`; only an admin-mediated path (Wave 4+ admin invite route or escalation flow) can complete. **Note**: the admin-mediated invite path is forward-substrate; this term is canonical-named at v1 but with no admin path it functions as a hard freeze. Recommend deferring this term's evaluator hook to the implementation slice unless the admin invite path lands first. |
| `dissolve_requires_admin` | `boolean` | If `true`, `dissolveHive` requires an admin caller (`can_admin_org` capability). Useful where ad-hoc hive creators should not unilaterally dissolve hives once operational. **Note**: Wave 3 admin route `DELETE /api/v1/org/hives/:id` is already admin-gated; this term would extend the gate to non-admin caller paths if any future non-admin dissolve surface is added. |
| `aggregate_min_member_count` | `number` (positive integer) | `getHiveIntelligence` returns zero-state when `member_count < aggregate_min_member_count`. Useful for organizations enforcing minimum aggregate populations (e.g., k=5 HIPAA Safe Harbor precedent from ADR-0061 §1.c). Default behavior absent this term is unchanged (existing `HIVE_AGGREGATE_TAG_FLOOR = 3` for the in-aggregate tag count is distinct and stays). |
| `policy_source_ref` | `string` (URI / opaque ID) | OPTIONAL metadata-only at v1; NOT enforced. Records which Layer 2 policy registry entry or Layer 3 source seeded the current `governance_terms` object. The string is treated as opaque at v1; Layer 2+ resolves it. Persisted in JSON; surfaced in admin detail response (Wave 3 `HiveAdminDetailView` does not include it today; expansion to surface would be a Wave 3 amendment + must remain SAFE no-leak). |

### Sub-decision 3 — Explicit non-goals (NOT evaluable at v1)

The following are EXPLICITLY OUT OF SCOPE at Wave 4 v1
per Founder direction. Each requires separate Founder
authorization at a future slice; none are silently
deferred:

- Natural-language legal interpretation (no NLP /
  semantic parsing of legal text).
- AI-generated legal/policy interpretation (no LLM-
  derived enforcement; Foundation's RULE 0 stance is
  that AI cannot author legal authority).
- **Automatic enforcement from government law changes**
  (Layer 3 substrate may detect deltas but enforcement
  changes ONLY after explicit admin/legal approval).
- **Daily legal/regulatory polling as default**
  (Founder explicit: monthly or quarterly default;
  weekly opt-in for high-risk + watchlist; manual refresh
  available).
- Cross-org policy rules (RULE 0 + ADR-0059 §1 lock;
  no cross-org governance reach).
- Psychological/behavioral scoring (ADR-0052 doctrine;
  no surveillance framing).
- Employee compliance scoring (Founder direction explicit
  across Section 1 Wave 3 + Section 6 Wave 1 + this ADR;
  governance is policy-on-rows, not policy-on-people).
- Hidden manager surveillance (same).
- governance_terms enforcement using raw memory/capsule
  content (governance enforces on hive/membership
  metadata only; content stays inside the wallet).
- Dynamic policy generated by LLMs (same as AI-generated
  legal interpretation; explicit reject).
- External legal/compliance framework automation
  (Layer 3 substrate; forward-substrate behind separate
  Founder authorization).
- Regulatory source connectors (Layer 3 substrate;
  forward-substrate).
- Jurisdiction resolver (Layer 3 substrate;
  forward-substrate; LawfulBasis precedent at
  `jurisdiction_invoked` is the model).
- Policy update daemon (Layer 3 substrate;
  forward-substrate).
- LLM-mediated review of `policy_source_ref` (out of
  scope at every layer; review is a human-in-loop
  function).

### Sub-decision 4 — v1 evaluator call sites (Layer 1)

The Wave 4 implementation slice (separate Founder
authorization) wires the Layer 1 evaluator into exactly
these existing HiveService call sites:

- **`createHive`** — evaluates `allowed_hive_types`
  against `type` parameter. If the hive's `governance_terms`
  is being seeded at create-time (the call-site option)
  the evaluator validates the seed is internally
  consistent (e.g., `aggregate_min_member_count` is
  positive integer) before persistence.
- **`inviteToHive`** — evaluates
  `allowed_member_entity_types`, `max_member_count`,
  `allowed_capsule_types_accessible`,
  `allowed_capsule_types_contributed`, and
  `require_admin_approval_for_invites` (the last is a
  hard freeze at v1 because no admin invite path exists
  yet; see Sub-decision 2 note). The Wave 2 AI_AGENT
  exclusion runs FIRST; `allow_ai_agent_membership: true`
  does not override Wave 2 at v1.
- **`getHiveIntelligence`** — evaluates
  `aggregate_min_member_count`. If the hive's
  `member_count` is below this threshold AND the term is
  present, return zero-state response (same shape as the
  Wave 2 empty-capsule_types_accessible zero-state).
  Reuses the Wave 2 `HIVE_INTELLIGENCE_READ` audit row
  with `details.zero_state_reason: "BELOW_AGGREGATE_MIN_MEMBER_COUNT"`.

The Wave 3 admin route handlers (`listHivesForOrg`,
`getHiveAdminDetail`, `dissolveHive`, `forceRemoveMember`)
DO NOT call the evaluator at v1, **except**
`dissolveHive` if `dissolve_requires_admin: true` is set —
but Wave 3's existing route is already admin-gated, so
this evaluation is a no-op at v1 (admin gate at route
tier already covers it). Document the no-op explicitly in
the Wave 4 implementation per Sub-decision 5.

No background daemon at v1. No scheduled evaluator. The
evaluator runs synchronously at request handler time as
a pure function over the loaded hive row + invitee
context.

### Sub-decision 5 — Violation behavior (fail-closed)

When the evaluator detects a violation:

- **Fail closed**: the caller receives a structured
  failure (no fallback to "partial success" or "warning
  but allow").
- **Structured failure code** under a new
  `GOVERNANCE_TERMS_VIOLATION` family. Specific codes at
  v1:
  - `GOVERNANCE_HIVE_TYPE_FORBIDDEN` (Sub-decision 2:
    `allowed_hive_types` rejects type).
  - `GOVERNANCE_INVITEE_TYPE_FORBIDDEN` (Sub-decision 2:
    `allowed_member_entity_types` rejects invitee type).
  - `GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED` (Sub-decision 2:
    `max_member_count` hit).
  - `GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN`
    (Sub-decision 2: `allowed_capsule_types_accessible`
    superset failed).
  - `GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN`
    (same for contributed).
  - `INVITE_REQUIRES_ADMIN_APPROVAL` (Sub-decision 2:
    `require_admin_approval_for_invites: true` freeze).
  - `GOVERNANCE_TERMS_MALFORMED` (Sub-decision 2:
    seed-time validation; e.g., non-integer
    `max_member_count`).
- **Safe message** — no raw policy internals leaked
  (don't include the full `governance_terms` object; do
  include the specific key that failed, e.g., "invite
  blocked by hive policy term `allowed_member_entity_types`";
  the term *names* are not sensitive because they are
  canonical per Sub-decision 2). Cross-org facts NEVER
  leaked (the failure message NEVER references entities
  outside the caller's org).
- **`HTTP 403`** for all violation codes mapping at the
  route tier (`statusForCode` extension in `hive.routes.ts`
  + `hive-admin.routes.ts`). Wave 4 implementation slice
  extends both `HiveFailure` and `HiveAdminFailure` unions
  with the new codes; the existing 403 mapping pattern
  for `OPERATION_NOT_PERMITTED` / `CROSS_ORG_INVITE_DENIED`
  / `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE` applies verbatim.
- **No audit row for routine evaluator denies** at v1.
  The evaluator denies at the same tier as Wave 2 TAR-gate
  denies (which also emit no audit row for the deny path
  per existing `validateSession` behavior). Audit emission
  for governance denies is a forward-substrate addition
  if a regulatory regime mandates it (CAR Sub-box 7 or
  equivalent); not in v1.
- **`getHiveIntelligence` zero-state** is NOT a violation —
  it's a soft scope-narrowing response (mirrors Wave 2
  empty-capsule_types_accessible behavior). Emits the
  same `HIVE_INTELLIGENCE_READ` audit row with the new
  `zero_state_reason: "BELOW_AGGREGATE_MIN_MEMBER_COUNT"`
  marker. Reuses existing audit literal.

### Sub-decision 6 — Audit posture

**Zero new audit literals at Wave 4 v1.** The Wave 4
evaluator landing inherits the Wave 2/3 audit discipline:

- Denial paths emit no audit (consistent with Wave 2
  TAR-gate denies + Wave 3 enumeration-safe 404s).
- The `getHiveIntelligence` zero-state response reuses
  the existing `HIVE_INTELLIGENCE_READ` literal with a
  new `details.zero_state_reason` marker
  (`"BELOW_AGGREGATE_MIN_MEMBER_COUNT"`; mirrors Wave 2's
  `"EMPTY_CAPSULE_TYPES_ACCESSIBLE"`).
- Layer 2/3 future substrate will add ADMIN_ACTION +
  `details.action: "POLICY_VERSION_APPROVED"` /
  `"POLICY_SOURCE_DELTA_DETECTED"` / `"POLICY_REVIEW_REQUESTED"`
  via the existing `ADMIN_ACTION` literal +
  `details.action` discriminator pattern (Section 4 + 7
  + 11 + Wave 3 precedent; no new literal needed for any
  of those).

If a future Wave 4+ enforcement scenario surfaces where
the existing literals + discriminators genuinely cannot
express the audit shape (e.g., regulatory mandate for
distinct `POLICY_VIOLATION_DENIED` literal), the
authorization slice would propose the literal addition
explicitly. **At Wave 4 v1, the audit vocabulary is
unchanged.**

### Sub-decision 7 — Schema posture

**Zero schema migration at Wave 4 v1.** The existing
`Hive.governance_terms Json @default("{}")` field at
`schema.prisma:613` is the canonical Layer 1 storage. All
10 v1-evaluable terms (Sub-decision 2) are persisted as
keys in this JSON object.

Layers 2 + 3 will require new schema models at their
implementation slices:

- **Layer 2** (enterprise policy registry): probable new
  model `OrgGovernancePolicy { policy_id, org_entity_id,
  name (unique within org), version, supersedes,
  valid_from, valid_until, terms Json, source_ref,
  status, approved_by, approved_at, created_at,
  updated_at }`. Schema migration at the Layer 2 slice.
- **Layer 3** (external source feeds): probable new
  models `GovernanceSource { source_id, source_authority,
  source_url, jurisdiction, review_frequency, last_checked_at,
  is_active, created_at, updated_at }` + `GovernanceSourceVersion
  { version_id, source_id, version_label, content_hash,
  effective_date, retrieved_at, supersedes }` +
  `GovernanceReviewItem { item_id, source_version_id,
  status (PENDING / APPROVED / REJECTED), reviewer_entity_id,
  reviewed_at, decision_notes, created_at }`. Schema
  migration at the Layer 3 slice.

Each future-substrate schema migration runs through
`db:push:test` per ADR-0025 + Founder authorization at
its slice. None at Wave 4 v1.

### Sub-decision 8 — Layer 3 external-source review cadence (Founder lock)

Per Founder direction explicitly:

- **Default review frequency: monthly or quarterly.** NOT
  daily.
- **Weekly or faster** checks: opt-in only; reserved for
  high-risk regulated customers OR specific watchlist
  sources (per-source configurable via the future Layer 3
  `GovernanceSource.review_frequency` field).
- **Manual refresh**: available for admin/legal users via
  a future admin route at the Layer 3 implementation
  slice. Manual refresh emits an audit row
  (ADMIN_ACTION + details.action:
  "GOVERNANCE_SOURCE_MANUAL_REFRESH").
- **No silent automatic enforcement changes.** Source
  delta detection produces a `GovernanceReviewItem` (PENDING
  status) and an internal notification (Section 11
  NotificationService); enforcement changes ONLY after a
  human admin/legal reviewer transitions the review item
  to APPROVED + a new Layer 2 `OrgGovernancePolicy`
  version is published.

The default review frequency lock is canonical at this
ADR; the Layer 3 implementation slice MAY NOT default to
daily polling without an explicit Founder amendment to
this Sub-decision.

### Sub-decision 9 — Layer 3 source-update lifecycle (canonical 7-step)

The future Layer 3 implementation MUST follow this 7-step
lifecycle. Each step has a distinct substrate touchpoint;
documented here so future slices have a single reference:

1. **Scheduled periodic check** — a `SCHEDULER` principal
   (future addition; mirrors existing SCHEDULER pattern
   for `REGULATOR_ACCESS_EXPIRED` per ADR-0036
   Sub-decision 4) wakes per the source's
   `review_frequency` cadence (monthly default).
2. **Source version/delta detected** — fetch the source
   (via the future Governance Source Connector); compute
   `content_hash`; compare against the prior
   `GovernanceSourceVersion.content_hash`. No delta → no
   action (do not create a review item; do not notify).
3. **Governance review item created** — persist a new
   `GovernanceReviewItem` (PENDING) referencing the
   detected `GovernanceSourceVersion`.
4. **Admin/legal review required** — Section 11
   NotificationService delivers an internal notification
   to admins with `can_admin_org` capability in the
   relevant org. NO external delivery at v1 (internal-only
   per Section 2 Wave 11 Founder direction).
5. **Approved policy version created** — admin/legal
   user reviews the source version + drafts a new
   `OrgGovernancePolicy` (Layer 2) version with the
   updated terms; the new policy carries a
   `policy_source_ref` pointing at the approved
   `GovernanceSourceVersion`.
6. **Enforcement changes only after approval** — the new
   `OrgGovernancePolicy` becomes the seed for new hives
   and (per future Layer 2 design) may be propagated to
   existing hives via an explicit admin migration action.
   Existing hives are NEVER silently mutated.
7. **Full audit trail retained** — every step emits
   ADMIN_ACTION + details.action discriminator:
   `GOVERNANCE_SOURCE_CHECKED` (step 1; only if delta
   detected; no audit on no-delta), `GOVERNANCE_SOURCE_DELTA_DETECTED`
   (step 2), `GOVERNANCE_REVIEW_ITEM_CREATED` (step 3),
   `GOVERNANCE_REVIEW_NOTIFIED` (step 4),
   `POLICY_VERSION_APPROVED` (step 5),
   `POLICY_VERSION_APPLIED` (step 6 — per hive that
   adopts).

### Sub-decision 10 — Cross-section integration boundaries

Wave 4 evaluator + future Layers 2 + 3 must coexist with
existing substrate without disrupting it. Specifically:

- **ADR-0036 LawfulBasis** (REGULATOR access pattern):
  governance_terms enforcement is DISTINCT from
  LawfulBasis-gated regulator access. A regulator with a
  valid LawfulBasis can read across hives per ADR-0036;
  governance_terms enforce *within-hive* operational
  policy. The two systems do not need to coordinate at
  v1; if they ever do (e.g., a regulator wants to enforce
  a policy across all hives in a jurisdiction), the
  integration is a forward-substrate amendment.
- **ADR-0049 GOVSEC umbrella** (government-grade
  hardening): governance_terms enforcement is operational
  policy, not security control. The GOVSEC umbrella may
  amend this ADR if a GOVSEC phase requires
  governance_terms to express a specific security
  control (e.g., "all hives in this org MUST set
  `aggregate_min_member_count >= 5`"). At Wave 4 v1 the
  two are independent.
- **ADR-0050 GOVSEC.5 break-glass** (emergency grants):
  break-glass invocation does NOT override
  governance_terms violations at Wave 4 v1. If a future
  scenario surfaces where break-glass should bypass
  governance enforcement (analogous to bypassing
  dual-control), that's a forward-substrate amendment
  with explicit Founder authorization.
- **ADR-0061 Section 6 SAFE projection pattern**:
  governance_terms admin detail surface must follow the
  Section 6 SAFE projection pattern (closed-vocab keys,
  count-not-value for sensitive metadata if any term
  surfaces sensitive content). The 10 v1 terms in
  Sub-decision 2 are operational not sensitive; the
  enforcement boundary at the SAFE projection tier is
  preserved by construction.
- **ADR-0062 Wave 3 admin route surface**:
  governance_terms surface at admin detail
  (`HiveAdminDetailView`) is currently EXCLUDED (Wave 3
  Sub-decision 2 forbids `governance_terms` in the
  projection). The Wave 4 implementation MAY amend Wave 3
  to surface governance_terms (as a closed-vocab key/value
  map keyed on the 10 v1 terms) IF the Founder authorizes
  it at the Wave 4 implementation slice; the current
  Wave 3 exclusion remains the default.

### Sub-decision 11 — Patent-implementation evidence (ADR-0020 Register 2)

Per RULE 19 + ADR-0020 two-register IP discipline,
governance_terms enforcement contributes patent-evidence-
bearing material at three patents:

- **US 12,517,919 (COSMP)** — `governance_terms` operating
  as a policy contract over capsule-type access
  (`allowed_capsule_types_accessible`,
  `allowed_capsule_types_contributed`) is direct
  patent-implementation evidence for the capsule layer
  permission claims. The same registration that ADR-0059
  established for `HiveMembership.capsule_types_*` carries
  forward to the org-level governance enforcement.
- **US 12,164,537 (DMW)** — governance_terms operating
  at the wallet boundary (`Hive.org_entity_id` enforcement
  + `allowed_member_entity_types` restricting which
  entities can join an org's wallet-scoped hive) is
  evidence for the enterprise-wallet-portability claim.
- **US 12,399,904 (Foundation primitives)** —
  governance_terms operating at the soft-archive +
  policy-driven dissolve boundary
  (`dissolve_requires_admin`) is evidence for the
  governed-substrate primitive claim.

Layer 3 governance-source substrate, when implemented,
adds source-attributed + jurisdiction-aware +
admin-approved policy update evidence at all three
patents (mirrors LawfulBasis precedent).

### Sub-decision 12 — RULE 0 + RULE 13 disclosure

Wave 4 + future Layers 2 + 3 preserve RULE 0 + no-leak
discipline by construction:

- **No raw capsule content** is read or evaluated by any
  layer at any time. Governance enforces on hive +
  membership metadata only.
- **No private corrections / transcripts / prompts /
  wallet internals / permission internals / embeddings /
  storage locations / content hashes / secret refs /
  bridge IDs** are surfaced at any audit emission,
  notification, or admin response.
- **Cross-org isolation** preserved at every layer.
  Layer 1 evaluator runs per-hive within caller's org;
  Layer 2 registry is org-scoped; Layer 3 source feeds
  produce review items scoped to the org's
  `GovernanceSource` subscriptions (no cross-org source
  sharing at v1).
- **AI cannot author legal authority** — Sub-decision 3
  explicit non-goal. Layer 3 review items are reviewed
  by HUMAN admins/legal; no LLM-mediated approval.
- **No surveillance framing** — governance is
  policy-on-rows, not policy-on-people (Sub-decision 3
  explicit). ADR-0052 doctrine boundary preserved.

### Sub-decision 13 — Wave 4 v1 implementation slice recommendation

After this ADR lands, the recommended Wave 4 v1
implementation slice for separate Founder authorization
is:

**Slice scope** (BACKEND ONLY; same RULE 0 + no-leak
discipline as Waves 2 + 3):

1. NEW pure-function evaluator at
   `apps/api/src/services/hive/governance-terms-evaluator.ts`
   exporting `evaluateGovernanceTerms(hive,
   context)` returning either `{ ok: true }` or
   `{ ok: false; code: GovernanceViolationCode; message;
   term: string }`. Pure function over the loaded Hive +
   context (e.g., `{ kind: "INVITE"; invitee_entity_type;
   target_capsule_types_accessible;
   target_capsule_types_contributed }`).
2. NEW `GovernanceViolationCode` union (the 7 codes from
   Sub-decision 5).
3. Wire the evaluator into the 3 HiveService call sites
   per Sub-decision 4 (`createHive`, `inviteToHive`,
   `getHiveIntelligence`). `dissolveHive` integration
   deferred (no-op at v1 per Sub-decision 4 note).
4. Extend `HiveFailure` union (existing 19 codes per
   Wave 2/3) with the 7 new governance codes; extend
   `statusForCode` mapping to return 403 for all.
5. Extend `HiveAdminFailure` union (existing 4 codes per
   Wave 3) if any admin path triggers governance
   evaluation (`dissolve_requires_admin` no-op at v1; no
   actual extension needed at v1).
6. NEW integration tests covering:
   - createHive with `allowed_hive_types: ["ENTERPRISE"]`
     accepts ENTERPRISE; rejects PERSONAL_NETWORK with
     GOVERNANCE_HIVE_TYPE_FORBIDDEN.
   - inviteToHive with `allowed_member_entity_types:
     ["PERSON"]` rejects PERSON with no membership ban
     but accepts; reject path: type other than PERSON →
     GOVERNANCE_INVITEE_TYPE_FORBIDDEN.
   - inviteToHive with `max_member_count: 2` accepts
     2nd member; rejects 3rd with
     GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED.
   - inviteToHive with `allowed_capsule_types_accessible:
     ["PREFERENCE"]` accepts membership with that subset;
     rejects superset.
   - getHiveIntelligence with `aggregate_min_member_count:
     5` returns zero-state when member_count < 5; reads
     normally when >= 5.
   - Wave 2 AI_AGENT exclusion runs BEFORE governance
     evaluator (`allow_ai_agent_membership: true` does
     NOT override Wave 2; existing behavior preserved).
   - No new audit literals; no schema migration;
     TypeScript baseline 4 canonical residuals preserved.
7. Implementation does NOT touch governance_terms
   surfacing in `HiveAdminDetailView` (Wave 3 exclusion
   preserved at default). If Founder authorizes that
   amendment in the Wave 4 slice, add it under explicit
   instruction.

**STOP CONDITIONS for the implementation slice**:

- Any v1 evaluable term that the Founder removes from
  the 10-term list in the implementation authorization.
- Schema migration discovered necessary at implementation
  time (would indicate a Sub-decision 2 design gap;
  surface inline + stop).
- New audit literal discovered necessary at implementation
  time (same).
- The `require_admin_approval_for_invites` term landing
  before any admin invite path exists creates a hard
  freeze on `inviteToHive`; recommend the Founder either
  authorize the admin invite path FIRST or omit this term
  from the v1 evaluator set.
- Any Layer 2 or Layer 3 substrate creep (those are
  separate authorization slices, not Wave 4 v1).

## Consequences

### Positive

- Closes ADR-0059 §Forward queue Wave 4 design reservation
  with zero schema migration + zero new audit literals at
  v1.
- Distinguishes 3 governance layers (Local Hive / Enterprise
  registry / External source feeds) at the substrate-
  architectural register so future slices have a single
  canonical-named reference.
- Locks Founder direction on external-source review cadence
  (monthly/quarterly default; weekly opt-in; manual refresh;
  no silent enforcement) at the ADR register before any
  Layer 3 substrate lands.
- Locks the 10 v1 Layer 1 evaluable terms at substrate-
  architectural register; future Wave 4 implementation
  slice has a closed term set to verify against.
- Reuses existing on-main precedent (LawfulBasis +
  ComplianceFramework + Section 4 connectors + Section 11
  notifications) for the future Layer 2 + 3 substrate;
  no greenfield architectural design required at future
  slices.
- Patent-implementation evidence at three patents
  (US 12,517,919 + US 12,164,537 + US 12,399,904)
  documented per Sub-decision 11.

### Negative / risk

- `require_admin_approval_for_invites` term lands at the
  ADR but with no admin invite path exists, the evaluator
  hook becomes a hard freeze. Sub-decision 2 note +
  Sub-decision 13 stop condition flag this; the Wave 4
  implementation slice should either defer this term or
  land the admin invite path first.
- `allow_ai_agent_membership: true` is canonical-named but
  cannot override Wave 2's `AI_AGENT_NOT_ELIGIBLE_FOR_HIVE`
  exclusion at v1. This is an honest design trade-off
  (Wave 2 exclusion is the runtime law; Wave 4 term is
  ADVISORY-ONLY at v1). Documented at Sub-decision 2.
- Layer 2 + Layer 3 substrate is canonical-named but not
  schema-migrated. Future slices will introduce 3+ new
  models. Schema impact at those slices is non-trivial.
- Layer 3 external-source ingestion will fire RULE 21 at
  its implementation slice (external dependencies +
  wire-format conventions). The research arc must
  precede authorization at that slice.

### Forward queue (Wave 4 and beyond)

Each item is forward-substrate (separate Founder
authorization required at its slice):

- **Wave 4 v1 implementation** — exact slice per
  Sub-decision 13; Founder authorization on the exact
  evaluable term set required before code lands.
- **Wave 4+ governance_terms surfacing in
  `HiveAdminDetailView`** — Wave 3 SAFE projection
  amendment; Founder authorization required.
- **Wave 4+ admin invite path** — required if
  `require_admin_approval_for_invites: true` is to be a
  functional policy term rather than a hard freeze.
- **Layer 2 enterprise governance policy registry** —
  `OrgGovernancePolicy` model + admin routes + version
  promotion workflow; mirrors `ComplianceFramework`
  substrate; Founder authorization required.
- **Layer 3 external governance source feeds** —
  `GovernanceSource` + `GovernanceSourceVersion` +
  `GovernanceReviewItem` models + Governance Source
  Connector (new ConnectorType) + SCHEDULER integration
  + Section 11 NotificationService integration + 7-step
  lifecycle (Sub-decision 9); RULE 21 research arc
  required at the slice; Founder authorization required.
- **Layer 3 jurisdiction resolver** — operationalizes
  `GovernanceSource.jurisdiction` + `LawfulBasis.jurisdiction_invoked`
  + `Entity.jurisdiction` + `MemoryCapsule.jurisdiction`
  + `OrgSettings.jurisdiction` (existing ADR-0037
  substrate) at the policy-evaluation tier; Founder
  authorization required.
- **GOVSEC umbrella amendment** if a GOVSEC phase
  requires governance_terms to express a specific
  security control.
- **Audit literal expansion** if a Layer 3 audit shape
  cannot be expressed via the existing ADMIN_ACTION +
  details.action discriminator pattern.

## Bidirectional citations

- Cited from ADR-0059 §Forward queue Wave 4 — this ADR
  closes that reservation by canonicalizing Wave 4
  design.
- Cites ADR-0001 (three-wallet architecture; RULE 0
  source for same-org enforcement at Layer 1 + 2).
- Cites ADR-0021 (CapsuleType extension protocol — model
  adapted at the future Layer 3 ConnectorType extension).
- Cites ADR-0025 (Schema-Push-Target Discipline; all
  future Layer 2 + 3 migrations run through
  `db:push:test`).
- Cites ADR-0036 (LawfulBasis canonical precedent for
  source-attributed + jurisdiction-aware + valid-window
  + chain-hashed governance substrate at Layer 3).
- Cites ADR-0037 (jurisdiction tagging substrate at
  Entity / MemoryCapsule / AuditEvent / OrgSettings;
  Layer 3 jurisdiction resolver consumes this).
- Cites ADR-0046 (AI_AGENT entity-type-discriminated
  routing; basis for Sub-decision 2 `allow_ai_agent_membership`
  advisory-only disposition).
- Cites ADR-0049 (GOVSEC umbrella; Sub-decision 10
  cross-section integration boundary).
- Cites ADR-0050 (GOVSEC.5 break-glass; Sub-decision 10
  cross-section integration boundary).
- Cites ADR-0052 (Otzar DGI doctrine; no-surveillance
  framing inherited at Sub-decision 3 + 12).
- Cites ADR-0057 (autonomous execution core; future
  SCHEDULER principal pattern for Layer 3 review-cadence
  scheduler).
- Cites ADR-0059 (parent — closes Wave 4 forward-queue
  reservation).
- Cites ADR-0061 (Section 6 SAFE projection pattern;
  Sub-decision 10 cross-section integration boundary).
- Cites ADR-0062 (Wave 3 admin route surface;
  Sub-decision 10 + Sub-decision 13 boundary preservation).
- Bidirectional back-citation lands in ADR-0059
  §Forward queue Wave 4 entry per RULE 14 + ADR-0020 §3
  + RULE 20.

## Founder authorization

Per RULE 20: this ADR + its companion back-citation in
ADR-0059 + architecture/README.md catalog entry land
under explicit Founder authorization at
`[FOUNDER-SECTION-3-WAVE-4-ADR-AUTH]` 2026-05-30. The
authorization is **ADR-only**; the Wave 4 v1
implementation slice (Sub-decision 13) requires separate
Founder authorization on the exact evaluable term set
before code lands.
