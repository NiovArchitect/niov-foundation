# ADR-0068: Otzar Wave 3 — Scoped Twin Proactivity (design-only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-OTZAR-WAVE-3-TWIN-PROACTIVITY-ADR-AUTH]`
(2026-05-31).

This ADR is **design-only**. It locks the substrate contract
for Otzar Wave 3 (scoped Twin proactivity) per Founder
operating direction: "Authorize Otzar Wave 3 — Twin
proactivity ADR/design only. Do not implement proactive
behavior until Founder explicitly authorizes the
implementation slice."

Implementation is **forward-substrate** behind a separate
Founder authorization at the implementation slice.

**No code, no schema migration, no new routes, no new audit
literal, no service-method signature change** in this commit.

## Context

### Why a new ADR (not an amendment to ADR-0066 or ADR-0067)

ADR-0066 (Wave 5) + ADR-0067 (Wave 6B) close the
**review-gated proposed-pattern lifecycle** + the
**accepted-pattern priming hook into assembleContext**.
Together they implement the symbiotic alignment loop at both
the visibility (Wave 6A `accepted_patterns[]`) and influence
(Wave 6B `alignment_patterns?` sidecar + labeled L_ALIGNMENT
prompt section) registers.

What ADR-0066 + ADR-0067 do **not** address: whether the
Twin should *surface* alignment guidance, drift observations,
review reminders, or next-best suggestions to the owner
**without the owner asking** — and if so, where, how, and
under what governance.

That is a distinct product-sensitive boundary:

- ADR-0066 / ADR-0067 are about the *content* of alignment
  guidance once the owner reviews and accepts it.
- ADR-0068 is about *whether the Twin proactively prompts
  the owner* at all, and how that surface is scoped, visible,
  dismissible, and non-intrusive.

The Founder operating direction is explicit: this is
product-sensitive enough to warrant a separate ADR/design
phase before any implementation slice lands.

### Substrate-honest Phase 0 findings

Verified on-main state at HEAD `6ea2bee` (Section 1 Wave 6B
closeout):

#### Proactive substrate already present (LIVE)

- **`OtzarProposedPattern` lifecycle** (Wave 5; PR #114
  `7661ba9`). The recurrence sweep at
  `OtzarProposedPatternService.sweep`
  (`apps/api/src/services/otzar/proposed-pattern.service.ts:484`)
  is **already proactive in nature** — it derives proposals
  from the owner's own drift signals without the owner asking.
  PROPOSED rows wait for owner review at
  `GET /api/v1/otzar/my-twin/proposed-patterns`. This is the
  canonical "Twin proposes, owner reviews, owner accepts"
  loop.
- **`getMyTwin.accepted_patterns[]`** (Wave 6A; PR #121
  `6b84a99`). Owner-visible alignment memory at
  `apps/api/src/services/otzar/otzar.service.ts:306`.
  Closed-vocab `AcceptedPatternAdvisoryView` (7-field SAFE
  projection at `proposed-pattern.service.ts:270-278`).
  Self-scoped by `session.entity_id`; no audit emission;
  no schema migration; no LLM-generated text.
- **`AssembleContextSuccess.alignment_patterns?`** (Wave 6B;
  PR #124 `625ddbf`). Sidecar field on
  `apps/api/src/services/coe/coe.service.ts` consumed by
  `conductSession`'s 8-layer prompt builder as a labeled
  `L_ALIGNMENT` section. The Twin sees what the owner sees;
  the owner controls via `include_alignment_patterns: false`.
- **3 drift-signal routes** (Wave 3B / Wave 4A / Wave 4C):
  per-conversation `/conversations/:id/drift-signals` +
  wallet-level stale-context + cross-conversation rollup.
  All self-scoped + closed-vocab + zero raw-text leak +
  `ADMIN_ACTION:DRIFT_SIGNAL_READ` audit + zero new audit
  literal.
- **`Notification` model + `NotificationService`** (ADR-0057
  Wave 11; PR #56 + Wave 12 inbox PR #58). Same-org-scoped
  internal-only notifications at
  `apps/api/src/services/notification/notification.service.ts`
  with cross-org RULE 0 DENY (membership check at
  notification.service.ts:141-151). 3 inbox routes
  (`GET /api/v1/notifications` + `PUT /:id/read` +
  `PUT /:id/dismiss`) at
  `apps/api/src/routes/notification.routes.ts`. Required
  fields include `source_entity_id` + `notification_class
  String` (free-form). Read state derived from
  `read_at` + `deleted_at` (RULE 10 soft-dismiss).
- **`getMyTwin` no-audit posture** is the established
  precedent for self-scoped read enrichments (ADR-0053 Wave
  2A; preserved through Wave 6A).
- **No Twin-initiated proactive surface exists at v1.** No
  "proactive cards" projection on `MyTwinView`, no service
  named `proactivity.service.ts`, no closed-vocab proactive
  event types, no cadence-throttle machinery, no Twin-as-
  source NotificationService caller.

#### Surface evaluation for v1 proactivity

| Surface | Owner-visible | Pull/Push | Persistence | New audit? | New schema? | Verdict |
|---|---|---|---|---|---|---|
| `getMyTwin.proactive_cards?[]` enrichment | yes (caller-only) | pull | none (computed-on-read) | no (inherits Wave 2A no-audit) | no | **safest at v1** |
| Internal `Notification` rows from "the Twin" | yes (caller-only) | push (server creates) | persisted row | possibly (new class string OK; persistence behavior change worth re-reviewing) | no (existing model) | heavier; requires resolving `source_entity_id` for a non-human author; reserves a future v2 path |
| `conductSession` preamble inline | yes (in-chat) | semi-push (every call) | none | no | no | noisy; couples proactivity to chat cadence; out of v1 |
| New `/proactive-cards` route | yes (caller-only) | pull | none | new route only (no literal) | no | reasonable v1.1; deferred so v1 has zero new routes |
| External (email/SMS/Slack/push) | yes | push | yes | new audit + new dependencies | yes | **forbidden at v1**; Section 4 connectors only under future authorization |

#### Internal-notification reuse — substrate-honest assessment

The existing `NotificationService.createInternalNotification`
requires `source_entity_id` (the human/entity issuing the
notification). For Twin-initiated proactivity:

- The Twin is an `AI_AGENT` entity in the owner's
  `EntityMembership` graph (parent=owner, child=Twin per
  ADR-0046 dual-context routing). Using the Twin's
  `entity_id` as the `source_entity_id` is **structurally
  valid** but introduces a new semantic ("the Twin is
  initiating an enterprise-grade notification") that does not
  exist anywhere in the codebase today.
- The cross-org membership check at
  `notification.service.ts:141-151` requires the recipient be
  an `EntityMembership.is_active === true` child of the
  source's `org_entity_id`. For a self-coaching notification
  the recipient and the source's "owner" are the same human,
  but the membership graph orientation is parent=owner →
  child=Twin, not the other way around. Resolving the
  Notification.org_entity_id for a Twin-initiated coaching
  notification requires a per-call decision that isn't
  currently in the service contract.
- Notification rows persist; they survive across requests +
  could be referenced by future admin / Control Tower
  surfaces. v1 proactivity is **explicitly not for managers
  or admins**; persisting Twin-coaching cards as Notification
  rows reserves a future surface that may collide with the
  RULE 0 + ADR-0052 / ADR-0053 / ADR-0058 anti-surveillance
  doctrine.

Conclusion: **v1 does NOT route through `NotificationService`.**
v1 proactivity is a derived read-only enrichment of the
`getMyTwin` response. The NotificationService remains
available as a future Wave 3+ option if the Founder
explicitly authorizes a Twin-as-source semantic — but that
authorization is its own slice + ADR amendment, not Wave 3
v1.

### Symbiotic / canonical product framing

Per ADR-0052 §5 (watching-is-not-surveillance) +
ADR-0053 §6 (drift prevention is first-class but bounded) +
the Founder operating direction:

- The Twin is **not** watching the user.
- The Twin is **staying with** the user.
- The Twin is **not** judging.
- The Twin is **helping preserve alignment**.
- The Twin **does not act behind the user's back**.
- The Twin offers timely guidance; the user remains
  sovereign.
- The Twin **does not perform governed work** through this
  surface. Proactivity is suggesting, reminding, surfacing,
  asking for confirmation. Execution remains under Section 2
  Action runtime + policy + approvals + scoped permissions +
  audit.

## Decision

Foundation will canonicalize Otzar Wave 3 as a
**read-side computed-on-read sidecar enrichment of
`getMyTwin`** that surfaces a small bounded set of
closed-vocab proactive cards derived **purely from existing
self-scoped substrate** (the owner's own ACCEPTED patterns,
PROPOSED patterns awaiting review, drift signals, stale-
context signals). No persistence, no scheduling, no LLM-
generated card text, no new schema, no new audit literal,
no external delivery.

### 1. Design option lock — `getMyTwin` sidecar, NOT Notification rows

Five surface options were evaluated (see Phase 0 table):

- **(a) `Notification` row creation via NotificationService**:
  rejected at v1. Requires resolving the Twin-as-source
  semantic + reserves a future admin surface + makes
  proactivity a persistent push rather than a pull. Heavier
  than warranted at v1.
- **(b) `conductSession` inline preamble**: rejected at v1.
  Couples proactivity to chat cadence; the same alignment
  reminder would repeat on every conversation; the L_ALIGNMENT
  prompt section (Wave 6B) is already the in-chat surface for
  accepted alignment memory.
- **(c) NEW `/api/v1/otzar/my-twin/proactive-cards` route**:
  deferred. Plausible v1.1 surface, but v1 keeps zero new
  routes to inherit getMyTwin's no-audit + self-scope posture
  by construction.
- **(d) External delivery via Section 4 connectors**:
  forbidden at v1. Each adapter has its own QLOCK + RULE 21
  research arc + OAuth credential decision. External delivery
  of proactivity is an entirely separate product surface and
  must not be conflated with v1.
- **(e) `getMyTwin.proactive_cards?[]` sidecar field**:
  ✅ ACCEPTED. Owner-visible (pull-based); no persistence;
  inherits Wave 2A no-audit posture by construction; mirrors
  Wave 6A `accepted_patterns?[]` sidecar pattern verbatim;
  backward-compat by omission (clients that don't read the
  new field don't break); clean test surface.

### 2. NEW `MyTwinView.proactive_cards?` field

The `MyTwinView` type at
`apps/api/src/services/otzar/otzar.service.ts:279` is extended
with one new optional field:

```ts
export interface MyTwinView {
  // ... existing Wave 2A + Wave 6A fields preserved verbatim
  accepted_patterns?: readonly AcceptedPatternAdvisoryView[];
  // Wave 3 (ADR-0068) — sidecar SAFE projection of bounded
  // closed-vocab proactive cards derived from the caller's
  // OWN existing self-scoped substrate (accepted/proposed
  // patterns + drift signals). Absent when no cards apply OR
  // when the caller explicitly disables via
  // include_proactive_cards=false. No new schema; no
  // persistence; no Action creation; no connector invocation;
  // no external delivery; no manager visibility.
  proactive_cards?: readonly ProactiveCardView[];
}
```

### 3. NEW `ProactiveCardView` SAFE projection

```ts
export type ProactiveCardType =
  | "ACCEPTED_PATTERN_REMINDER"
  | "PROPOSED_PATTERN_REVIEW_AVAILABLE"
  | "STALE_CONTEXT_REFRESH_SUGGESTED"
  | "DRIFT_REVIEW_SUGGESTED"
  | "ALIGNMENT_CHECK_IN";

export type ProactiveCardActionHint =
  | "REVIEW_PATTERN"
  | "REFRESH_CONTEXT"
  | "CONTINUE_CONVERSATION"
  | "DISMISS"
  | "NO_ACTION";

export type ProactiveCardPriorityLabel = "LOW" | "NORMAL" | "HIGH";

export type ProactiveCardSourceSignalType =
  | "ACCEPTED_PATTERN"
  | "PROPOSED_PATTERN"
  | "WALLET_STALE_CONTEXT"
  | "CROSS_CONVERSATION_ROLLUP"
  | "ALIGNMENT_PERIODIC";

export interface ProactiveCardView {
  // Deterministic key derived from card_type + source signal
  // identifiers + generated_at-day. Stable across reads for
  // the same underlying substrate state so a client can
  // de-dupe + memo a dismiss state locally.
  card_key: string;
  card_type: ProactiveCardType;
  title: string; // closed-vocab template (locked at service tier)
  body: string; // closed-vocab template (locked at service tier)
  source_signal_type: ProactiveCardSourceSignalType;
  // Optional closed-vocab pattern label when source signal is
  // a proposed / accepted pattern. NEVER raw text; NEVER tag
  // values; NEVER conversation IDs.
  pattern_label?:
    | "RECURRING_CORRECTION_RECOMMENDATION_REVIEW"
    | "STALE_CONTEXT_REFRESH_RECOMMENDED"
    | "CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED";
  generated_at: string; // ISO; the read timestamp
  priority_label: ProactiveCardPriorityLabel;
  action_hint: ProactiveCardActionHint;
  honest_note: string; // closed-vocab template (locked at service tier)
}
```

### 4. Closed-vocab card_type set (v1)

Five closed-vocab card_types at v1; additive growth behind
separate Founder authorization at each future slice.

| card_type | source_signal_type | source substrate | priority_label | action_hint | derivation rule |
|---|---|---|---|---|---|
| `ACCEPTED_PATTERN_REMINDER` | `ACCEPTED_PATTERN` | `listAcceptedPatternsForOwner` (Wave 6A reader) | LOW | `CONTINUE_CONVERSATION` | Owner has ≥1 accepted alignment pattern. Symbiotic reminder that the Twin is staying with the owner's accepted alignment guidance. Surfaces at most ONE card across all accepted patterns per read (the most recently accepted) — not one per pattern. |
| `PROPOSED_PATTERN_REVIEW_AVAILABLE` | `PROPOSED_PATTERN` | `listProposedPatternsForOwner` (Wave 5 reader) | NORMAL | `REVIEW_PATTERN` | Owner has ≥1 PROPOSED row awaiting review. Surfaces at most ONE card per read (the oldest unreviewed PROPOSED). |
| `STALE_CONTEXT_REFRESH_SUGGESTED` | `WALLET_STALE_CONTEXT` | Wave 4A wallet-level stale signal | LOW | `REFRESH_CONTEXT` | Owner's wallet-level signal is `STALE_CONTEXT_RISK`. Surfaces at most ONE card per read. |
| `DRIFT_REVIEW_SUGGESTED` | `CROSS_CONVERSATION_ROLLUP` | Wave 4C rollup signal | NORMAL | `REVIEW_PATTERN` | Owner's cross-conversation rollup is `AT_RISK`. Surfaces at most ONE card per read. |
| `ALIGNMENT_CHECK_IN` | `ALIGNMENT_PERIODIC` | Time since the most recent ACCEPTED pattern review (NOT a calendar schedule; pure derivation from `OtzarProposedPattern.reviewed_at`) | LOW | `NO_ACTION` | Symbiotic check-in surfaces ONLY when (a) owner has ≥1 ACCEPTED pattern AND (b) most recent `reviewed_at` is older than `ALIGNMENT_CHECK_IN_DAYS = 14` AND (c) no PROPOSED rows currently waiting. At most ONE card per read. |

**Cap**: at most `PROACTIVE_CARDS_MY_TWIN_MAX = 4` cards
surfaced per `getMyTwin` read (one per type minus
`ALIGNMENT_CHECK_IN` if other types fire; v1 starts at a
bounded surface to avoid noise).

### 5. Card title / body / honest_note templates (closed-vocab; locked at service tier)

Mirrors Wave 5 `SAFE_SUMMARY_TEMPLATES` + Wave 6A
`SYMBIOTIC_ADVISORY_NOTES` discipline. Locked at the
service tier; never LLM-generated; never raw correction text;
never references managers / scoring / surveillance /
compliance / discipline / risk-profile / employee-weakness
language.

Canonical v1 copy (the Wave 3 implementation slice MUST use
these strings verbatim):

```ts
const PROACTIVE_CARD_TEMPLATES: Readonly<
  Record<
    ProactiveCardType,
    { title: string; body: string; honest_note: string }
  >
> = {
  ACCEPTED_PATTERN_REMINDER: {
    title: "Your Twin remembers the alignment patterns you accepted.",
    body: "Your Twin is keeping recently accepted alignment guidance in mind when it helps you. You remain sovereign — you can archive any pattern at any time.",
    honest_note: "This is not an evaluation. It is not visible to managers. It is not shared across the org.",
  },
  PROPOSED_PATTERN_REVIEW_AVAILABLE: {
    title: "Your Twin has alignment patterns waiting for your review.",
    body: "Your Twin has noticed a recurring signal in your own work and proposed an alignment pattern. Review it when convenient — accepting or rejecting it is entirely your call.",
    honest_note: "Proposed patterns are derived only from your own corrections and drift signals. They are never visible to managers and never auto-applied.",
  },
  STALE_CONTEXT_REFRESH_SUGGESTED: {
    title: "Some of your saved memory may be out of sync.",
    body: "Some of your memory has fallen out of sync with its source content. A refresh may help your Twin work from current information.",
    honest_note: "This is not a memory rewrite. Nothing is deleted, edited, or republished without your action.",
  },
  DRIFT_REVIEW_SUGGESTED: {
    title: "A recurring alignment pattern may be worth a review.",
    body: "Multiple recent conversations show overlapping drift signals. A short review may help your Twin stay aligned with how you actually want to work.",
    honest_note: "This is coaching for your own benefit. It is not an employee score, not visible to managers, and not shared across the org.",
  },
  ALIGNMENT_CHECK_IN: {
    title: "Your Twin is staying with your alignment guidance.",
    body: "You have accepted alignment patterns that your Twin continues to remember. No action is needed — this is just a quiet check-in.",
    honest_note: "Your Twin is not judging you. It is staying with you.",
  },
};
```

### 6. NEW `assembleProactiveCards` pure-function helper

The Wave 3 implementation slice will land a NEW pure-function
helper at NEW
`apps/api/src/services/otzar/proactivity.service.ts`:

```ts
export interface AssembleProactiveCardsInput {
  ownerEntityId: string;
  acceptedPatternService?: OtzarProposedPatternService;
  driftSignalService?: DriftSignalService;
  staleContextSignalService?: StaleContextSignalService;
  rollupSignalService?: CrossConversationRollupService;
  generatedAt?: Date;
}

export async function assembleProactiveCards(
  input: AssembleProactiveCardsInput,
): Promise<readonly ProactiveCardView[]>;
```

The helper:

- Is pure (no I/O beyond the injected reader services).
- Reads ONLY the caller's own substrate via the injected
  service references (RULE 0 owner-scope enforced by
  construction).
- Never persists anything.
- Never invokes external providers.
- Never creates Actions.
- Never invokes connectors.
- Catches per-source read failures silently per source — a
  transient failure on one signal does not break the
  remaining cards (mirrors Wave 6B sidecar swallow pattern).
- Returns deterministic cards for the same substrate state +
  same `generatedAt` day (the `card_key` is stable across
  same-day reads).

### 7. `OtzarService.getMyTwin` integration

The `getMyTwin` method is extended with one new optional arg
on the existing `GetMyTwinInput` (or an adjacent options
parameter — final shape locked at the implementation slice
QLOCK):

```ts
export interface GetMyTwinInput {
  token: string;
  // Wave 3 (ADR-0068) — explicit owner control. When false,
  // proactive_cards is omitted from the response. Default
  // true.
  include_proactive_cards?: boolean;
}
```

The integration point sits AFTER the Wave 6A
`accepted_patterns` read in `getMyTwin` so failure of either
read never affects the other. Empty `[]` is normalized to
`undefined` (sidecar omitted) to mirror Wave 6A's "absent
when none" convention.

### 8. Backward compatibility

- `MyTwinView.proactive_cards?` is **optional**. Existing
  clients that do not read it continue to work.
- `GetMyTwinInput.include_proactive_cards?` is **optional**
  with default `true`. Existing callers continue to work.
- `OtzarService` constructor changes (if a 5th proactivity
  arg is wired) follow the Wave 6A precedent: optional, with
  fallback that omits the sidecar when not wired.
- Wave 2A no-audit posture preserved. Wave 6A SAFE projection
  patterns preserved. Wave 6B `assembleContext` surface
  untouched.

### 9. RULE 0 owner-scope enforcement

- All readers are scoped to `session.entity_id` (the same
  owner whose `getMyTwin` is being served).
- No cross-owner read path exists in any of the reader
  services (verified for Wave 5 / Wave 6A by-construction;
  Wave 3 inherits).
- No manager-tier surface. No admin-tier surface. No
  org-aggregate surface. No cross-tenant data.
- `ALIGNMENT_CHECK_IN` cadence derived purely from
  per-owner `reviewed_at` data the caller already owns; no
  shared clock; no per-org schedule; no Twin-state.

### 10. Owner control mechanisms

- **Dismiss at v1** = client-side. The `card_key` is
  deterministic, so a client (Control Tower frontend) can
  store dismissed `card_key`s locally and suppress them until
  the underlying signal changes (when the signal changes the
  derived card_key changes, surfacing the card again — by
  design).
- **Persistent dismiss** = forward-substrate. A persisted
  `ProactiveCardDismissal` row (or similar) would require a
  new Prisma model + a new write route + a new audit
  literal. Deferred to a Wave 3+ implementation slice gated
  on Founder authorization.
- **Opt-out per call** = `include_proactive_cards: false`
  query / body param at the `getMyTwin` route. Mirrors
  Wave 6B `include_alignment_patterns: false` precedent.
- **Cadence / frequency limit**: enforced by-construction
  through (a) deterministic derivation (same substrate state
  → same cards, so no "nagging" growth) + (b) the cap of
  `PROACTIVE_CARDS_MY_TWIN_MAX = 4` cards per read + (c) the
  `ALIGNMENT_CHECK_IN_DAYS = 14` threshold for the periodic
  check-in.
- **Hidden proactivity**: forbidden by-construction.
  Proactivity surfaces only via the explicit `getMyTwin`
  response field; the owner sees what their Twin sees.
- **Manager visibility**: forbidden at every register. The
  Wave 3 implementation slice MUST include a test that
  verifies the proactivity service has no admin / manager /
  cross-owner read path.

### 11. Audit posture — NO new audit literal

`getMyTwin` is a no-audit self-read by ADR-0053 Wave 2A
design (preserved through Wave 6A + Wave 6B). Wave 3
inherits this posture:

- The proactive-card derivation is pure-function +
  caller-scoped + no persistence + no mutation.
- No new audit literal is required.
- No new `ADMIN_ACTION + details.action` discriminator is
  required.
- The Wave 3 implementation slice will include a test
  asserting `getMyTwin` calls (with or without
  proactive_cards) emit ZERO new audit rows of any kind.

### 12. v1 explicit non-goals (forward-substrate)

Each is forward-substrate behind a separate Founder
authorization at the respective slice:

- **Autonomous execution** — proactivity cannot create
  Actions, invoke handlers, fire connectors, or mutate any
  substrate. The Twin may *suggest*; execution requires
  Section 2 Action runtime + policy + approvals + scoped
  permissions + audit (per ADR-0052 §9 + ADR-0057).
- **Hidden behavior change** — no proactive substrate may
  silently modify `assembleContext`, `combined_score`,
  capsule selection, conversation continuation, or any
  Twin-visible state. The `getMyTwin.proactive_cards?`
  surface is the ONLY surface at v1.
- **Hidden memory mutation** — no proactive substrate may
  modify MemoryCapsule, OtzarProposedPattern,
  IntelligencePattern, OtzarConversation, ActionAttempt, or
  any audit row.
- **Notification model creation** — v1 does NOT route
  through `NotificationService`. The Twin-as-source
  semantic + persisted-card behavior is forward-substrate
  behind a separate ADR amendment + Founder authorization.
- **`conductSession` preamble** — out of v1. The L_ALIGNMENT
  prompt section (Wave 6B) is already the in-chat alignment
  surface; a separate proactivity preamble would be noise.
- **NEW `/proactive-cards` route** — out of v1. Pull
  proactivity lives on `getMyTwin` for v1.
- **External delivery** (email / SMS / Slack / push) —
  forbidden at v1. Section 4 connectors remain governed
  adapters; each adapter has its own QLOCK + RULE 21
  research arc.
- **Control Tower frontend implementation** — out of
  Foundation scope.
- **Voice / ambient / lens / desktop implementations** —
  out of v1.
- **LLM-generated proactive text** — forbidden at v1. All
  card title / body / honest_note text is closed-vocab
  template locked at the service tier.
- **Employee scoring / drift score / compliance score /
  manager visibility / surveillance framing / psychological
  profiling / discipline language / risk-profile language**
  — forbidden at every register.
- **Cross-owner / cross-org data** — forbidden at every
  register.
- **Raw transcripts / raw prompts / raw correction content /
  raw memory or capsule content / chain-of-thought /
  embeddings / vectors / storage locations / content hashes /
  bridge IDs / secret refs / permission internals** —
  forbidden at every register.
- **Per-owner cadence persistence** — out of v1. v1 cadence
  is purely derived (`ALIGNMENT_CHECK_IN_DAYS = 14`); no
  per-owner timer rows; no scheduler.
- **Background scheduler** — out of v1. v1 is pull-only.
  A future scheduler would require Founder authorization at
  its own slice.

### 13. Relation to existing substrate (boundary preservation)

- **ADR-0066 (Wave 5)** review-gated proposed-pattern
  lifecycle UNTOUCHED. PROPOSED → ACCEPTED transitions still
  go through the existing PATCH route.
- **ADR-0067 (Wave 6B)** sidecar field + L_ALIGNMENT prompt
  section UNTOUCHED. assembleContext + conductSession behave
  identically with or without Wave 3.
- **ADR-0058 (drift detection)** signal contracts UNTOUCHED.
  Wave 3 consumes the signals via the existing reader
  services; no signal shape changes.
- **ADR-0057 (Action runtime)** UNTOUCHED. Wave 3 cannot
  create Actions; cannot invoke handlers; cannot fire
  connectors. Any future transition from a proactive card
  to a real action MUST go through the Action runtime.
- **`NotificationService`** UNTOUCHED. v1 proactivity does
  not call it.
- **ADR-0022 (combined_score)** frozen-anchor UNTOUCHED.
- **`assembleContext` 7-step + 6.5 sidecar (Wave 6B)**
  UNTOUCHED.

### 14. Symbiotic doctrine universal

- The user remains sovereign. Proactivity is a quiet hand on
  the owner's shoulder, never a tap on the manager's.
- The Twin is staying with the user, not watching the user.
- Cards may be ignored, dismissed, or opted out of with no
  consequence.
- No card ever appears that the owner did not generate the
  substrate for through their own work, corrections, or
  acceptances.
- The Twin does not act behind the user's back.
- The Twin does not perform governed work through this
  surface.

## Implementation slice estimate

A future Wave 3 implementation slice (after this ADR +
separate Founder authorization) will land:

- **NEW** `apps/api/src/services/otzar/proactivity.service.ts`:
  - `ProactiveCardType` / `ProactiveCardActionHint` /
    `ProactiveCardPriorityLabel` /
    `ProactiveCardSourceSignalType` closed-vocab type
    exports.
  - `ProactiveCardView` interface.
  - `PROACTIVE_CARD_TEMPLATES` lookup (per §5).
  - `PROACTIVE_CARDS_MY_TWIN_MAX = 4` + `ALIGNMENT_CHECK_IN_DAYS = 14`
    constants.
  - `assembleProactiveCards(input)` pure-function helper
    (per §6).
- **`apps/api/src/services/otzar/otzar.service.ts`**:
  - Extend `MyTwinView.proactive_cards?` (per §2).
  - Extend `GetMyTwinInput.include_proactive_cards?` (per
    §7).
  - Optional constructor arg for proactivity dependencies
    (or compose at call site through the existing
    `proposedPatternService`); final shape locked at the
    implementation slice QLOCK.
  - Read proactive cards AFTER `accepted_patterns` read in
    `getMyTwin`; swallow read failures silently.
- **`apps/api/src/routes/otzar.routes.ts`** (or wherever
  `getMyTwin` is mounted): map an optional
  `include_proactive_cards` query/body param to the service
  input.
- **`apps/api/src/server.ts`**: wire reader-service
  dependencies (mirroring Wave 6A / Wave 6B server.ts
  patterns).
- **NEW `tests/integration/my-twin-proactive-cards.test.ts`**:
  ≥ 12 integration tests covering:
  - Owner with zero substrate → `proactive_cards` absent.
  - Owner with one ACCEPTED pattern → `ACCEPTED_PATTERN_REMINDER`
    card present with closed-vocab fields + locked copy.
  - Owner with PROPOSED waiting → `PROPOSED_PATTERN_REVIEW_AVAILABLE`
    card present.
  - Owner with `STALE_CONTEXT_RISK` signal → `STALE_CONTEXT_REFRESH_SUGGESTED`
    present.
  - Owner with `AT_RISK` rollup → `DRIFT_REVIEW_SUGGESTED`
    present.
  - Owner with old `reviewed_at` AND no PROPOSED → `ALIGNMENT_CHECK_IN`
    present.
  - Cross-owner caller does NOT see another owner's cards.
  - `include_proactive_cards: false` omits the sidecar.
  - Deterministic `card_key` across same-day reads with
    same substrate state.
  - SAFE projection no-leak scan (no raw correction text /
    no conversation IDs / no payload summaries / no
    embeddings / no permission internals / no manager
    fields / no score fields / no drift score).
  - ZERO new audit row emitted by `getMyTwin` calls (with
    or without cards).
  - `OtzarProposedPattern` lifecycle UNTOUCHED.
  - `assembleContext` Wave 6B sidecar UNTOUCHED.
  - No Action / Notification / ConnectorBinding /
    ActionAttempt creation by Wave 3.
  - Cap honored: at most `PROACTIVE_CARDS_MY_TWIN_MAX = 4`
    cards in any response.

The implementation slice MUST preserve the existing Wave 5 /
6A / 6B tests verbatim — Wave 3 is purely additive.

## Consequences

### Easier after this ADR

- Wave 3 implementation slice has a single canonical
  reference (this ADR §1–§14).
- The boundary between proactivity (Wave 3) + alignment
  consumption (Wave 6B) + alignment visibility (Wave 6A) +
  pattern review (Wave 5) + drift signals (Wave 3B/4A/4C) is
  explicit at the design register.
- Future cards (Wave 3+) extend the closed-vocab card_type
  set additively behind their own narrow slice
  authorization.
- The "proactive-as-pull-on-getMyTwin" pattern becomes a
  canonical Foundation precedent for any future proactive
  surface that wants to inherit the no-audit + self-scope +
  no-persistence + closed-vocab + symbiotic-framing posture.

### Harder after this ADR

- Wave 3 implementation slice CANNOT silently mutate any
  substrate; the sidecar field is read-only.
- Wave 3 implementation slice CANNOT create persisted
  notifications, Actions, or any other server-side artifact.
- The closed-vocab `ProactiveCardType` set becomes a stable
  contract; adding a new card_type requires a separate
  slice + Founder authorization (additive growth pattern
  mirrors Wave 5 `pattern_label` discipline).
- All card title / body / honest_note copy becomes a
  closed-vocab service-tier template; future text changes
  require explicit Founder authorization to preserve the
  symbiotic framing.
- Wave 3 cannot collide with a future Twin-as-source
  Notification surface without explicit ADR amendment;
  the boundary is locked at §10 + §12.

### Substrate-state catches resolved

- ADR-0052 §9 "proactivity vs. autonomy" doctrine is closed
  at the Wave 3 v1 design register.
- ADR-0058 §"Forward queue" "proactive suggestions" item
  closes at the design register; the implementation slice
  closes it at the canonical-execution register.
- ADR-0053 §"forward queue" "proactive suggestions" item
  closes at the design register.
- The Founder operating direction "Otzar should move from
  purely reactive AI teammate behavior toward scoped,
  owner-controlled, transparent proactivity" gets a
  canonical landing point.

## Forward queue

- **Wave 3 implementation slice** — NEW
  `proactivity.service.ts` + `proactive_cards?` field on
  `MyTwinView` + `include_proactive_cards?` opt-out +
  integration tests per §"Implementation slice estimate".
  Separate Founder authorization required.
- **Wave 3.1 dedicated `/proactive-cards` route** — if a
  client needs to pull cards without the full
  `getMyTwin` payload; deferred to v1.1 unless explicitly
  prioritized.
- **Persistent `ProactiveCardDismissal` model** — would
  require a new Prisma model + write route + audit literal;
  forward-substrate.
- **Twin-as-source `NotificationService` extension** — would
  require ADR amendment to resolve the Twin's
  `source_entity_id` semantic + cross-org membership
  orientation for self-coaching; forward-substrate.
- **`conductSession` proactivity preamble** — would require
  separate ADR; out of v1.
- **External delivery via Section 4 connectors** — each
  adapter own QLOCK + RULE 21 + OAuth credential decision;
  forward-substrate.
- **LLM-generated proactive text** — would require a
  separate Founder product decision; closed-vocab template
  posture preserved at v1.
- **Background scheduler / cadence persistence** — out of
  v1.
- **Control Tower proactivity UX** — out of Foundation
  scope; consumer lives in `otzar-control-tower`.

## Bidirectional citations

- Cites ADR-0001 (RULE 0 source).
- Cites ADR-0022 (combined_score frozen anchor; explicitly
  NOT amended at Wave 3).
- Cites ADR-0046 (AI_AGENT dual-context routing — Twin entity
  identity inheritance).
- Cites ADR-0048 (COE personalization-orchestration
  substrate; Wave 3 reads but does not modify).
- Cites ADR-0052 (Otzar DGI symbiotic doctrine — §9
  proactivity vs. autonomy, §5 watching-is-not-surveillance,
  §6 drift prevention is first-class but bounded).
- Cites ADR-0053 (Wave 2A no-audit precedent; "drift-
  prevention foundations only" boundary preserved).
- Cites ADR-0057 (Action runtime — Wave 3 cannot create
  Actions; suggestion ≠ execution).
- Cites ADR-0058 (drift-detection substrate; Wave 3 consumes
  Wave 3B / 4A / 4C signals).
- Cites ADR-0066 (Wave 5 review-gated lifecycle; Wave 3
  consumes `OtzarProposedPattern` reader).
- Cites ADR-0067 (Wave 6B priming hook; explicitly NOT
  amended at Wave 3 — `assembleContext` surface untouched).
- Cites RULE 0 (owner-first self-scope).
- Cites RULE 1 (build forward; existing surfaces preserved
  unchanged).
- Cites RULE 4 (audit before response — inherited as
  no-audit per Wave 2A precedent; Wave 3 does not mutate).
- Cites RULE 13 (substrate-honest enumeration of forbidden
  fields + surface evaluation table).
- Cites RULE 14 (bidirectional citation; back-citation
  snippets land in ADR-0052 / 0053 / 0058 / 0066 / 0067
  in the same commit).
- Cites RULE 20 (this ADR's creation explicitly Founder-
  authorized).

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citation
snippets in ADR-0052 / 0053 / 0058 / 0066 / 0067 + the
architecture/README catalog entry + the Section 1 doc Wave 3
forward-substrate update + the NEXT_ACTION.md update + the
CLAUDE.md catalog entry land under explicit Founder
authorization at
`[FOUNDER-OTZAR-WAVE-3-TWIN-PROACTIVITY-ADR-AUTH]`
2026-05-31.

The authorization is **ADR-only** — Wave 3 implementation
slice (the §6 `assembleProactiveCards` helper + the §7
`getMyTwin` integration + the §"Implementation slice
estimate" integration tests + the server.ts wiring +
the route opt-out parameter) requires a **separate Founder
authorization** at the implementation slice per Founder
Wave 3 operating direction ("Do not implement proactive
behavior until Founder explicitly authorizes the
implementation slice").
