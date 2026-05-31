# ADR-0066: Section 1 Wave 5 — Otzar Proposed-Pattern from Recurring Drift (review-gated; design-only)

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SECTION-1-WAVE-5-OTZAR-PROPOSED-PATTERN-ADR-AUTH]`
(2026-05-30).

This ADR is **design-only**. It locks the v1 substrate
contract for Section 1 Wave 5 (IntelligencePattern auto-write
from recurring drift themes per ADR-0058 §"Forward queue"
item 1). Implementation is **forward-substrate** behind a
separate Founder authorization at the implementation slice
because Wave 5 requires a new Prisma model + a new persisted
artifact lifecycle (per Founder Wave 5 direction: "If
implementation requires new schema, stop after ADR and report
exact model/fields needed").

**No code, no schema migration, no new routes, no new audit
literal** in this commit.

## Context

### Why a new ADR (not an amendment to ADR-0058)

ADR-0058 v1 scope is intentionally narrow: a **pure derived
read-only** drift-detection surface that emits closed-vocab
labels for self-scoped coaching. Wave 5 is substantially
broader:

- Wave 5 introduces a **persisted artifact** (a row that lives
  across requests), where ADR-0058 explicitly forbids "a
  persisted drift profile row" (ADR-0058 §1).
- Wave 5 introduces a **state machine** (PROPOSED → ACCEPTED |
  REJECTED | ARCHIVED), where ADR-0058 has no state.
- Wave 5 introduces a **review surface** (owner reviews,
  accepts, rejects, archives), where ADR-0058 has no review
  surface.
- Wave 5 introduces a **new Prisma model** (`OtzarProposedPattern`),
  separate from the existing org-scoped `IntelligencePattern`
  model.
- Wave 5 introduces a **recurrence-detection function** that
  reads multiple drift signal outputs and decides when to
  generate a proposal.

Per the repo convention (ADR-0065 above ADR-0060 for the
Agent Playground long-term product vision; ADR-0046 under
ADR-0041 for Gap 6), substantive scope extensions warrant a
**new ADR** rather than an amendment when the extension
introduces a distinct architectural register. ADR-0058 stays
the canonical Wave 3/4 drift-signal contract; ADR-0066 sits
adjacent at the Wave 5 register.

### Why a new Prisma model (not reuse of existing `IntelligencePattern`)

Substrate-honest Phase 0 verification (2026-05-30):

The existing `IntelligencePattern` model at
`packages/database/prisma/schema.prisma:1100-1114`:

```
model IntelligencePattern {
  pattern_id       String   @id @default(uuid()) @db.Uuid
  org_entity_id    String   @db.Uuid
  pattern_type     String // RECURRING_BLOCKER|COORDINATION_FAILURE|...
  description      String
  evidence         Json     @default("[]") // [{conversation_id, date, excerpt}]
  first_seen       DateTime @default(now())
  last_seen        DateTime @default(now())
  occurrence_count Int      @default(1)
  status           String   @default("ACTIVE") // ACTIVE|RESOLVED|MONITORED
  resolution       String?
  @@index([org_entity_id, pattern_type])
}
```

The existing model is:

- **Org-scoped** (`org_entity_id` required; no `owner_entity_id`
  column). Wave 5 needs **owner-scoped self-scope** per RULE 0
  + Founder Wave 5 direction "Self-scoped only at v1."
- **Actively in use** at
  `apps/api/src/services/otzar/priming.ts:216` (context
  priming) and `apps/api/src/routes/org.routes.ts:2369`
  (admin read; `can_admin_org`-gated, paginated). Repurposing
  the model would violate RULE 1 (build forward only; never
  delete or overwrite working code) + would break the
  consuming org-intelligence semantic.
- **Wrong field shape for Wave 5**:
  - `description String` is free-form text → Wave 5 forbids
    raw correction text in any field.
  - `evidence Json` includes `excerpt` (raw correction text
    sample) → Wave 5 forbids raw payloads.
  - `pattern_type` closed-vocab is org-business-level
    (`RECURRING_BLOCKER`/`COORDINATION_FAILURE`/etc.) →
    doesn't match the drift-derived labels Wave 5 consumes.
  - `status` closed-vocab is `ACTIVE`/`RESOLVED`/`MONITORED`
    → doesn't match the proposed-pattern lifecycle
    `PROPOSED`/`ACCEPTED`/`REJECTED`/`ARCHIVED`.
  - No `source_signal_type` / `pattern_label` / `safe_summary`
    / `confidence_label` / `proposed_at` / `reviewed_at` /
    `archived_at` columns.

The existing org-scoped `IntelligencePattern` and the
proposed Wave 5 `OtzarProposedPattern` represent **two
distinct concepts** that should not be conflated:

- `IntelligencePattern` (existing) — **org-wide patterns**
  observed across the entire organization's Otzar substrate
  (the Section 9 Domain Intelligence register).
- `OtzarProposedPattern` (proposed Wave 5) — **per-employee
  proposed improvement artifacts** derived from the
  employee's OWN closed-vocab drift signals, awaiting
  owner-tier review/acceptance.

Wave 5 keeps both concepts cleanly separated by naming the
new model `OtzarProposedPattern` (clearly part of the Otzar
self-coaching surface, distinct from the org-intelligence
surface).

### Substrate-honest Phase 0 findings

Verified on-main state at HEAD `dbbe9c7` (Section 5 Wave 4
closeout):

- **Section 1 drift-detection arc PRODUCTION-GRADE COMPLETE**
  per Wave 3A/3B/4A/4C landings: 3 live drift-signal routes
  (`GET /api/v1/otzar/conversations/:id/drift-signals` Wave 3B;
  stale-context wallet-level signal Wave 4A; cross-conversation
  rollup Wave 4C). All self-scoped + closed-vocab + locked
  coaching copy + zero raw text leak + ADMIN_ACTION +
  DRIFT_SIGNAL_READ audit + source_signal discriminator + zero
  new audit literals.
- **`ObservationService.processCorrection`** at
  `apps/api/src/services/otzar/observation.service.ts` is the
  upstream producer of CORRECTION capsules with auto-emitted
  `correction` + `correction-of-<id>` topic_tags. Operator-
  supplied additional tags are forward-substrate per ADR-0058
  §"Substrate-honest disclosures".
- **No review/approval pattern** exists for self-scoped owner-
  reviews-own-proposed-artifact. The closest precedents:
  - Wave 4 `PlaygroundScenario` (Section 5; owner-first
    self-scoped CRUD with status transitions; soft-archive
    per RULE 10) — strongest precedent for the Wave 5 route
    + service shape.
  - Hive admin force-remove (admin-tier; not applicable).
  - GOVSEC.5 break-glass grants (privileged; not applicable).
  - Escalations (admin-tier; not applicable).
- **Audit posture pattern** `ADMIN_ACTION + details.action`
  discriminator established across Sections 1/3/4/5/6/7 with
  zero new audit literal per section. Wave 5 inherits the
  pattern.

### Patent + doctrine alignment

- **ADR-0052** (Otzar DGI doctrine): *"Otzar can proactively
  prepare, coordinate, and recommend inside scope; it executes
  sensitive actions only under permission, policy, or
  approval."* Wave 5 is the proactive recommendation surface
  at the self-coaching tier — proposed patterns are
  recommendations, not autonomous behavior changes.
- **ADR-0053** §5 (Wave 3 boundary): self-scoped coaching
  trust loop; never manager visibility; never employee
  scoring. Wave 5 inherits this verbatim.
- **ADR-0058** §1 + §7 (drift detection forbidden fields):
  no surveillance framing, no numeric scoring, no raw
  conversation content. Wave 5 inherits this verbatim and
  adds: no raw proposal description text (only closed-vocab
  pattern_label + canonical safe_summary template).
- **US 12,517,919 (COSMP)**: scoped capsule access per RULE
  0 — Wave 5 reads only the caller's own drift signals
  (already RULE 0-scoped by ADR-0058 substrate) and writes
  to the caller's own proposed-pattern row.
- **US 12,164,537 (DMW)**: wallet-bound sovereignty — Wave 5
  proposed patterns are per-owner artifacts; no cross-org
  aggregation; no cross-wallet leak.
- **US 12,399,904 (Foundation primitives)**: governed
  primitives — Wave 5 review surface goes through
  authenticated bearer + "read" scope + RULE 4 audit.

## Decision

Foundation will canonicalize Section 1 Wave 5 as a
**review-gated proposed-pattern surface** that:

- Reads the caller's OWN closed-vocab drift signals (Wave 3B
  per-conversation + Wave 4A wallet-level + Wave 4C cross-
  conversation rollup) and detects recurrence above closed-
  vocab thresholds.
- Generates `OtzarProposedPattern` rows (status=PROPOSED)
  with closed-vocab `pattern_label` and canonical
  `safe_summary` template — NEVER raw correction text,
  NEVER raw transcript, NEVER raw capsule content.
- Exposes a self-scoped owner-tier review surface for the
  owner to ACCEPT, REJECT, or ARCHIVE proposed patterns.
- Audits every state transition via the existing
  `ADMIN_ACTION + details.action` discriminator pattern (no
  new audit literal).
- Never autonomously activates a pattern; ACCEPTED patterns
  become eligible for future Wave 6+ consumers (out of Wave
  5 scope).

### 1. Wave 5 product purpose + scope lock

**Purpose**: when Otzar repeatedly observes the same safe,
self-scoped drift theme for an employee, the system proposes
an improvement artifact the employee reviews and accepts (or
declines). Auto-write = **auto-propose**, not auto-commit.

**Scope lock — Wave 5 IS**:
- A pure derived recurrence-detection function that reads
  closed-vocab drift signals only.
- A persisted `OtzarProposedPattern` artifact representing a
  proposed improvement.
- A self-scoped owner-tier review surface (list + state
  transition).
- Audit emission on every persistence boundary (create +
  state transition).

**Scope lock — Wave 5 IS NOT**:
- Employee surveillance.
- Manager scoring.
- Psychological profiling.
- Hidden compliance scoring.
- Autonomous memory mutation.
- Cross-employee comparison.
- Cross-org aggregation.
- LLM-generated proposal text (closed-vocab template only).
- Raw correction / transcript / capsule content exposure.
- Numeric drift / quality / productivity score.
- Active pattern consumption (Wave 6+ scope).

### 2. Proposed-pattern lifecycle (8-step canonical)

```
[Wave 3B/4A/4C drift signal computation; existing]
        ↓
[NEW: recurrence-detection function reads closed-vocab labels
 across caller's own conversations; threshold-gated]
        ↓
[If threshold met → create OtzarProposedPattern row]
   status=PROPOSED
   owner_entity_id=caller
   source_signal_type=<drift label discriminator>
   pattern_label=<closed-vocab>
   safe_summary=<canonical template; no raw text>
   confidence_label=<LOW|MEDIUM|HIGH; not numeric>
   audit: ADMIN_ACTION + details.action="OTZAR_PATTERN_PROPOSED"
        ↓
[Owner reviews via GET /api/v1/otzar/my-twin/proposed-patterns]
   bearer + "read" scope
   self-scoped (where owner_entity_id = session.entity_id)
   SAFE projection only
   audit: ADMIN_ACTION + details.action="OTZAR_PATTERN_READ"
        ↓
[Owner state-transitions via PATCH .../:id]
   PROPOSED → ACCEPTED  (action="OTZAR_PATTERN_ACCEPTED")
   PROPOSED → REJECTED  (action="OTZAR_PATTERN_REJECTED")
   PROPOSED → ARCHIVED  (action="OTZAR_PATTERN_ARCHIVED")
   ACCEPTED → ARCHIVED  (action="OTZAR_PATTERN_ARCHIVED")
   REJECTED → ARCHIVED  (action="OTZAR_PATTERN_ARCHIVED")
   sets reviewed_at = now (on ACCEPTED|REJECTED)
   sets archived_at = now (on ARCHIVED)
        ↓
[ACCEPTED patterns persist for future Wave 6+ consumer]
   Wave 5 does NOT activate the pattern in any AI teammate
   behavior. How an ACCEPTED pattern informs the Twin is a
   future slice (Wave 6+) requiring separate Founder
   authorization.
        ↓
[Idempotent + RULE 10 — ARCHIVED is terminal; no hard delete]
```

### 3. New Prisma model — `OtzarProposedPattern` (FORWARD-SUBSTRATE)

The new model is **NOT landed by this ADR**. It is the
schema target Founder will authorize in the Wave 5
implementation slice. The exact field shape:

```
model OtzarProposedPattern {
  pattern_id          String    @id @default(uuid()) @db.Uuid
  owner_entity_id     String    @db.Uuid
  source_signal_type  String    // closed-vocab; §4 discriminator set
  pattern_label       String    // closed-vocab; §4 label set
  safe_summary        String    // canonical template only; never raw text
  confidence_label    String    @default("MEDIUM") // closed-vocab LOW|MEDIUM|HIGH
  status              String    @default("PROPOSED") // closed-vocab §2 lifecycle
  occurrence_count    Int       @default(1) // how many drift signals fed this proposal
  first_signal_at     DateTime  // earliest drift signal contributing to this proposal
  last_signal_at      DateTime  // latest drift signal contributing to this proposal
  proposed_at         DateTime  @default(now())
  reviewed_at         DateTime?
  archived_at         DateTime?
  created_at          DateTime  @default(now())
  updated_at          DateTime  @updatedAt

  @@index([owner_entity_id, status, proposed_at])
  @@index([owner_entity_id, archived_at])
  @@map("otzar_proposed_patterns")
}
```

**Notable design decisions**:

- All four closed-vocab String columns (`source_signal_type`,
  `pattern_label`, `confidence_label`, `status`) use String
  not Prisma enum per the Hive / MemoryCapsule / Section 5
  Wave 4 PlaygroundScenario precedent (service-tier
  validation; closed-vocab evolution without schema
  migration).
- `confidence_label` is **String not Float** per Founder
  direction "confidence_label, not numeric employee score" —
  hard guard against drift toward numeric scoring.
- `safe_summary` is a **service-tier-templated String** —
  the value is selected from a closed canonical template set
  keyed on `(source_signal_type, pattern_label)`, never
  constructed from raw correction text.
- `occurrence_count` + `first_signal_at` + `last_signal_at`
  are aggregated counts only — never include conversation
  IDs or per-conversation references.
- **NO `description` column** (deliberate; the existing org
  `IntelligencePattern.description` is free-form text and
  Wave 5 forbids that surface).
- **NO `evidence Json` column** (deliberate; the existing
  org `IntelligencePattern.evidence` includes `excerpt` and
  Wave 5 forbids raw text).
- **NO `org_entity_id` column** (deliberate; Wave 5 is
  self-scoped at v1 per Founder direction; future cross-org
  surfaces are forward-substrate behind a separate Founder
  authorization).
- `@@map("otzar_proposed_patterns")` — table name clearly
  distinguished from `intelligence_patterns` to prevent
  conflation.

### 4. Closed-vocab discriminators + labels (v1)

**`source_signal_type`** (3 values; one per drift signal source):

- `PER_CONVERSATION_DRIFT` — derived from Wave 3B per-conversation
  signals (`CORRECTION_VELOCITY_ELEVATED`, `RECURRING_CORRECTION_THEME`)
- `WALLET_STALE_CONTEXT` — derived from Wave 4A wallet-level
  stale-context signal (`STALE_CONTEXT_RISK`)
- `CROSS_CONVERSATION_ROLLUP` — derived from Wave 4C cross-
  conversation rollup signal (`AT_RISK`)

**`pattern_label`** (closed-vocab; v1 set; additive growth
behind separate Founder authorization):

- `RECURRING_CORRECTION_RECOMMENDATION_REVIEW` (paired with
  `PER_CONVERSATION_DRIFT` source)
- `STALE_CONTEXT_REFRESH_RECOMMENDED` (paired with
  `WALLET_STALE_CONTEXT` source)
- `CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED` (paired with
  `CROSS_CONVERSATION_ROLLUP` source)

**`confidence_label`** (closed-vocab; 3 values):

- `LOW` — minimum threshold met but few distinct conversations
- `MEDIUM` — recurrence across multiple conversations
- `HIGH` — strong recurrence across many conversations within
  window

**`status`** (closed-vocab; §2 lifecycle): `PROPOSED` (initial)
| `ACCEPTED` | `REJECTED` | `ARCHIVED`.

### 5. Recurrence-detection criteria (v1)

The recurrence-detection function reads the caller's own
drift signal outputs and decides whether to emit a proposal:

- **Per-conversation drift recurrence** (source=PER_CONVERSATION_DRIFT):
  if `CORRECTION_VELOCITY_ELEVATED` OR `RECURRING_CORRECTION_THEME`
  fires in ≥ 3 distinct conversations within a 14-day window,
  emit `RECURRING_CORRECTION_RECOMMENDATION_REVIEW` proposal
  with `confidence_label = MEDIUM` (or `HIGH` if ≥ 6).
- **Wallet stale-context recurrence** (source=WALLET_STALE_CONTEXT):
  if `STALE_CONTEXT_RISK` is the wallet-level label for ≥ 7
  consecutive days, emit `STALE_CONTEXT_REFRESH_RECOMMENDED`
  proposal with `confidence_label = MEDIUM` (or `HIGH` if ≥ 14
  days).
- **Cross-conversation rollup recurrence** (source=CROSS_CONVERSATION_ROLLUP):
  if `AT_RISK` is the rollup label for ≥ 7 consecutive days,
  emit `CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED` proposal
  with `confidence_label = MEDIUM` (or `HIGH` if ≥ 14 days).

**Deduplication**: the recurrence-detection function MUST NOT
create a duplicate `PROPOSED` row for the same
`(owner_entity_id, source_signal_type, pattern_label)` while
an existing `PROPOSED` or `ACCEPTED` row is non-archived. If
the caller has already received a proposal for this pattern,
no second `PROPOSED` row appears until the existing one
transitions to `REJECTED` or `ARCHIVED`. The dedup window
preserves the caller's review fatigue boundary.

**Trigger model (v1 implementation slice forward-substrate)**:
on-demand at recurrence-detection-route invocation OR
post-correction-write hook. The exact trigger model is
**deferred to the implementation slice's Founder
authorization** per Founder direction; the v1 default
recommendation is **on-demand sweep invoked via the same
review surface** (avoiding scheduler/background-task substrate
that would require additional infrastructure decisions).

### 6. Routes (review surface; FORWARD-SUBSTRATE)

The routes are **NOT landed by this ADR**. The exact
route surface the Wave 5 implementation slice will register:

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/otzar/my-twin/proposed-patterns/sweep` | POST | Run recurrence-detection sweep + create any new PROPOSED rows; idempotent re-entry preserved by dedup §5 |
| `/api/v1/otzar/my-twin/proposed-patterns` | GET | List caller's proposed patterns; optional `?status` filter; default excludes ARCHIVED |
| `/api/v1/otzar/my-twin/proposed-patterns/:id` | GET | Owner-only detail |
| `/api/v1/otzar/my-twin/proposed-patterns/:id` | PATCH | Owner state-transition (PROPOSED → ACCEPTED|REJECTED|ARCHIVED; ACCEPTED → ARCHIVED; REJECTED → ARCHIVED) |

**Auth posture**: bearer + `"read"` scope per the Wave 3B
drift-signal + Wave 4 PlaygroundScenario precedent. Never
admin gate. Never manager surface.

**Cross-owner / unknown id**: fold to `PROPOSED_PATTERN_NOT_FOUND`
(404 enumeration-safe), mirroring `SCENARIO_NOT_FOUND` and
`CONVERSATION_NOT_FOUND` patterns.

**Forbidden state transitions**: any transition other than
those enumerated above returns `INVALID_STATE_TRANSITION` (422)
with `invalid_fields: ["status"]`. ARCHIVED is terminal
(idempotent on already-archived; no transition out).

**Forbidden body fields on PATCH**: any field other than
`status` returns `INVALID_REQUEST` (422). Specifically
forbidden: `owner_entity_id`, `pattern_id`,
`source_signal_type`, `pattern_label`, `safe_summary`,
`confidence_label`, `occurrence_count`, `first_signal_at`,
`last_signal_at`, `proposed_at`, `reviewed_at`,
`archived_at`, `created_at`, `updated_at`. All server-owned.

### 7. Audit posture — ADMIN_ACTION discriminator (no new audit literal)

Per Founder Wave 5 direction "Do not add a new audit literal
unless impossible" + the established Sections 1/3/4/5/6/7
precedent:

| Event | event_type | details.action |
|---|---|---|
| Recurrence sweep creates a PROPOSED row | `ADMIN_ACTION` | `OTZAR_PATTERN_PROPOSED` |
| Owner reads list or detail | `ADMIN_ACTION` | `OTZAR_PATTERN_READ` |
| Owner accepts a proposal | `ADMIN_ACTION` | `OTZAR_PATTERN_ACCEPTED` |
| Owner rejects a proposal | `ADMIN_ACTION` | `OTZAR_PATTERN_REJECTED` |
| Owner archives a proposal | `ADMIN_ACTION` | `OTZAR_PATTERN_ARCHIVED` |

**Safe audit details** (every event):

```
{
  action: "<one of the 5 discriminators>",
  pattern_id: string,
  owner_entity_id: string,
  source_signal_type: string,
  pattern_label: string,
  status: string,
  confidence_label: string
}
```

**Forbidden in audit row** (under all circumstances):

- `safe_summary` (even though it's a closed-vocab template, the
  audit row stays minimal)
- Any raw correction text
- Any raw transcript text
- Any raw capsule content
- Any conversation IDs
- Any topic tag values
- Any embeddings, vectors, storage locations, content hashes,
  bridge IDs, secret refs
- Any cross-owner / cross-org data
- Any chain-of-thought, prompts, or LLM-generated text
- Any numeric drift score, quality score, productivity score,
  employee score

ADR-0058 §2 audit posture (DRIFT_SIGNAL_READ on the underlying
drift-signal reads) is **preserved unchanged**. Wave 5 emits
on the **proposal-tier persistence boundary**; the underlying
drift-signal reads continue to emit DRIFT_SIGNAL_READ as
already established.

### 8. SAFE projection — forbidden response fields

The Wave 5 `OtzarProposedPattern` response projection
includes the 14 columns enumerated in §3 (verbatim, with ISO
timestamp normalization), and **forbids the following from
ever appearing in any Wave 5 response**:

- Raw correction text
- Raw transcript text
- Raw capsule content (`payload_content`, `payload_summary`)
- Raw prompts, chain-of-thought, LLM-generated text
- Embeddings, vectors
- Storage locations, content hashes
- Bridge IDs, secret refs
- Permission internals (RBAC/ABAC bits, clearance values,
  TAR capability flags)
- Conversation IDs (the recurrence-detection function reads
  them but does NOT persist them to the proposal row;
  responses cannot leak what was never persisted)
- Cross-owner or cross-org data
- Numeric drift / quality / productivity / employee scores
- Free-form AI-generated commentary about the employee

The Wave 5 implementation slice MUST include integration
tests asserting absence of every forbidden marker from
create / list / detail / PATCH responses (mirroring the
38-test Wave 4 PlaygroundScenario no-leak precedent).

### 9. v1 explicit non-goals (forward-substrate)

Each is forward-substrate behind separate Founder
authorization at the respective slice:

- ~~**Active pattern consumption**~~ — how an ACCEPTED
  pattern informs the AI teammate's behavior. Wave 5
  shipped the proposal + review substrate; behavior-change
  consumers were Wave 6+. **Visibility half (Wave 6A)
  LANDED 2026-05-30 (PR #121 `6b84a99`)** as the symbiotic
  `accepted_patterns[]` projection on `getMyTwin`.
  **Influence half (Wave 6B) DESIGN LANDED 2026-05-30 at
  ADR-0067** as the sidecar-field priming hook into
  `COE.assembleContext`. Wave 6B implementation slice is
  forward-substrate behind separate Founder authorization
  per ADR-0067 §14 + §"Founder authorization" register.
- **Manager / org-admin review surface** — explicitly
  forbidden at v1 per RULE 0 + Founder direction. Any
  cross-employee surfacing is a separate slice with
  separate Founder authorization (and would require its
  own surveillance-doctrine review).
- **LLM-generated proposal text** — explicitly forbidden at
  v1. `safe_summary` is a closed-vocab template selection,
  not LLM-generated. Future LLM integration is a separate
  slice + Founder authorization.
- **Operator-tunable recurrence thresholds** — v1 uses
  service-tier constants per §5; per-org override via
  OrgSettings is forward-substrate per ADR-0058 §"Forward
  queue" item 4 precedent.
- **Connector fan-out of proposed patterns** — caller could
  opt in to fan-out their own accepted patterns via the
  Section 4 ConnectorBinding substrate. Forward-substrate;
  separate slice.
- **Control Tower UX consumer** — frontend; out of
  Foundation scope; lives in `otzar-control-tower`.
- **Background scheduler / sweep automation** — the v1
  trigger is on-demand sweep invocation via the review
  surface (caller hits sweep, then lists). Background
  scheduler is forward-substrate; would require additional
  substrate decisions (cron / queue / fire-and-forget mode)
  beyond Wave 5 scope.
- **Cross-conversation deep-link evidence** — proposals are
  derived from drift signal counts only; conversation IDs
  are NOT persisted to the proposal row (per §8 forbidden
  fields). Deep-link evidence is forward-substrate behind
  a separate Founder authorization that would explicitly
  address the surveillance / no-leak boundary.

### 10. RULE 0 + no-leak universal

RULE 0 + no-leak discipline applies at every Wave 5 tier:

- **Caller scope only**: every read/write filters
  `owner_entity_id = session.entity_id`; cross-owner reads
  return `PROPOSED_PATTERN_NOT_FOUND` (404 enumeration-safe).
- **No manager visibility**: there is no `can_admin_org`
  route family for proposed patterns at v1.
- **No psychological inference**: `pattern_label` +
  `safe_summary` are closed-vocab templates; never AI
  interpretation of the employee's behavior.
- **No surveillance framing**: proposed patterns are policy-
  on-rows (a recurrence count met a threshold), not policy-
  on-people. Mirrors ADR-0058 §"Substrate-honest disclosures"
  + ADR-0052 doctrine.
- **No autonomous behavior change**: ACCEPTED patterns
  persist for future Wave 6+ consumers but do NOT
  autonomously rewrite the AI teammate's behavior. The Twin
  scope-parity boundary per ADR-0052 + ADR-0053 §5 is
  preserved.

### 11. Founder decisions — resolved + outstanding

**Resolved by this ADR** (locked here; no further Founder
decision needed for the Wave 5 implementation slice):

- ✅ NEW Prisma model `OtzarProposedPattern` (separate from
  existing org-scoped `IntelligencePattern`)
- ✅ 14 fields enumerated in §3
- ✅ Closed-vocab `source_signal_type` set (3 values; §4)
- ✅ Closed-vocab `pattern_label` set (3 values; §4)
- ✅ Closed-vocab `confidence_label` set (3 values; §4)
- ✅ Closed-vocab `status` lifecycle (4 values; §2)
- ✅ Recurrence-detection criteria (§5)
- ✅ Deduplication policy (§5)
- ✅ Route surface (4 routes; §6)
- ✅ Audit posture (5 discriminators; no new audit literal; §7)
- ✅ SAFE projection forbidden fields (§8)
- ✅ Trigger model: on-demand sweep via review surface;
  background scheduler explicitly forward-substrate (§5 + §9)

**Outstanding for the Wave 5 implementation slice's Founder
authorization** (not a blocker for ADR landing; surfaces
explicitly so the implementation slice doesn't require
additional Founder decisions during execution):

- Wave 5 implementation slice can proceed without further
  Founder product decisions. The ADR resolves all design
  questions. The implementation slice must still receive a
  Founder authorization tag per RULE 20.

## Consequences

### Easier after this ADR

- Section 1 Wave 5 implementation slice has a single
  canonical reference (this ADR §3 + §4 + §5 + §6 + §7).
- Existing org-scoped `IntelligencePattern` stays unchanged;
  no risk of breaking the `priming.ts` + `org.routes.ts`
  consumers (RULE 1 build-forward preserved).
- The closed-vocab discriminator + pattern_label sets are
  documented; future additive growth happens behind explicit
  Founder authorization at each slice (no silent vocabulary
  drift).
- The "auto-propose, not auto-commit" boundary is canonical
  at the ADR register, defensible against future scope-creep
  proposals.
- The deduplication policy (§5) prevents review-fatigue from
  duplicate `PROPOSED` rows.

### Harder after this ADR

- Wave 5 implementation slice CANNOT silently extend `safe_summary`
  beyond closed-vocab templates — any LLM-generated text
  addition requires an explicit ADR amendment.
- Wave 5 implementation slice CANNOT add an org-admin browsing
  surface — would require an explicit ADR amendment.
- The recurrence-detection trigger model is fixed at on-demand
  sweep; background scheduler requires explicit ADR amendment.
- The proposed-pattern row CANNOT carry conversation IDs or
  raw evidence; any forensic-detail extension requires
  explicit ADR amendment + an explicit surveillance-boundary
  re-review.

### Substrate-state catches resolved

- ADR-0058 §"Forward queue" item 1 ("IntelligencePattern
  auto-write from recurring correction themes") was a single
  forward-queue line with no design substrate. ADR-0066 lifts
  the design to the canonical-record register.
- Phase 0 verification surfaced that the existing
  `IntelligencePattern` model name + schema do not match the
  Wave 5 contract — the new `OtzarProposedPattern` model
  prevents conflation.
- The Founder direction "auto-write should mean auto-propose,
  not auto-commit" is now canonical at the ADR register
  instead of only in the Founder Wave 5 authorization prompt.

## Forward queue

- **Wave 5 implementation slice** — NEW `OtzarProposedPattern`
  Prisma model + `OtzarProposedPatternService` + 4 routes
  per §6 + integration tests + recurrence-detection function
  reading caller's own drift signals. Schema migration via
  `npm run db:push:test` per ADR-0025. Separate Founder
  authorization required at the implementation slice.
- **Wave 6** — ACCEPTED-pattern consumption. How an ACCEPTED
  `OtzarProposedPattern` informs the AI teammate's behavior.
  Likely paths: priming hook into `assembleContext` per
  ADR-0048; explicit advisory surface in the Twin's
  `getMyTwin` response. Separate slice + Founder
  authorization required.
- **Operator-tunable thresholds** — per-org override of the
  recurrence-detection criteria from §5. Forward-substrate
  per ADR-0058 §"Forward queue" item 4 precedent.
- **Background scheduler / sweep automation** — separate
  slice + substrate decisions (cron / queue / fire-and-forget).
- **Control Tower UX consumer** — frontend; lives in
  `otzar-control-tower`; out of Foundation scope.
- **Connector fan-out of accepted patterns** — opt-in via
  Section 4 ConnectorBinding; never manager push; separate
  slice.

## Bidirectional citations

- Cites ADR-0001 (three-wallet architecture; RULE 0 source).
- Cites ADR-0025 (Schema-Push-Target Discipline; future
  implementation slice schema migration).
- Cites ADR-0052 (Otzar DGI doctrine — proactivity vs
  autonomy boundary; surveillance prohibition).
- Cites ADR-0053 §5 (Wave 3 boundary; self-scoped trust
  loop).
- Cites ADR-0055 (correction signals + drift-prevention
  continuity; the upstream substrate Wave 5 consumes).
- Cites ADR-0058 (Otzar drift detection coaching/alignment;
  §"Forward queue" item 1 — Wave 5 closes this forward-queue
  entry at the design register).
- Cites ADR-0044 + ADR-0045 (decay + staleness substrate;
  Wave 4A drift signal source).
- Cites ADR-0057 §10 (audit allowlist + ADMIN_ACTION +
  details.action discriminator pattern).
- Cites ADR-0065 §7 Wave 4 (PlaygroundScenario owner-first
  CRUD precedent for the Wave 5 review surface).
- Cites RULE 0 (sovereignty; self-scope per caller).
- Cites RULE 1 (build forward; the existing
  `IntelligencePattern` is preserved unchanged).
- Cites RULE 4 (audit-before-response; 5 discriminators).
- Cites RULE 9 (DMW substrate; wallet/owner scope).
- Cites RULE 10 (soft-delete only; ARCHIVED terminal status).
- Cites RULE 13 (substrate-honest disclosures; Phase 0
  findings).
- Cites RULE 20 (this ADR's creation explicitly Founder-
  authorized 2026-05-30).
- Bidirectional back-citation lands in ADR-0058 §"Forward
  queue" item 1 in the same commit per RULE 14.

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citation in
ADR-0058 §"Forward queue" + architecture/README.md catalog
entry + tier-3 / tier-2 / tier-1 doc updates land under
explicit Founder authorization at
`[FOUNDER-SECTION-1-WAVE-5-OTZAR-PROPOSED-PATTERN-ADR-AUTH]`
2026-05-30.

The authorization is **ADR-only** — Wave 5 implementation
slice (new Prisma model + new service + new routes + new
integration tests) requires a **separate Founder
authorization** at the implementation slice per Founder Wave
5 direction: "If implementation requires new schema, stop
after ADR and report exact model/fields needed." The exact
model/fields are reported in §3 of this ADR; Founder will
authorize the implementation phase separately.
