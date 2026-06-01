# ADR-0058: Otzar Drift Detection — Coaching/Alignment Trust Loop

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SLEEP-DIRECTIVE-SECTION-1-WAVE-3-OTZAR-DRIFT-DETECTION-AUTH]`
(per Founder Sleep Directive 2026-05-30: "Proceed with Section 1
Wave 3 — Otzar drift detection" + "Wave 3A — ADR/design doc for
Otzar drift detection boundary").

This is the **Wave 3A contract ADR**. It is design-only: it locks
the endpoint contract, the safe projection shape, the explicit
coaching-vs-surveillance boundary, and the narrow Wave-3-vs-future
boundary. It adds **no code, no endpoints, no schema migration**
in this phase — implementation lands under Wave 3B EXECUTE-VERIFY
authorization. Governed by, and extends, ADR-0052 (Domain General
Intelligence doctrine) + ADR-0053 (employee twin role-scope; Wave 3
boundary lock) + ADR-0055 (correction-conversation linkage; the
substrate Wave 3 derives from).

## Context

Otzar Wave 2A (ADR-0053) gave each employee a safe, self-scoped My
Twin role-scope profile and **locked drift detection as a Wave 3
capability**. ADR-0053 §5 prose:

> "Full drift detection (recurring `CORRECTION` →
> `IntelligencePattern` write-side, stale-context warnings,
> drift-signal contract, proactive suggestions) is a Wave 3
> capability."

Wave 2C (ADR-0055) added per-conversation `corrections_count` +
`last_correction_at` + `has_corrections` + a `summary_capsule_id`
linkage at `OtzarConversation` so corrections + conversations are
now relationally joined. Wave 2C reserves Wave 3 for the drift
signal contract itself.

Substrate facts verified on `main` @ `691b44d`:

- `MemoryCapsule.conversation_id String? @db.Uuid` exists (Wave 2C
  PR `c56bd57`). CORRECTION capsules submitted via `POST
  /api/v1/otzar/correction` with `conversation_id` carry it; older
  CORRECTION capsules carry `null`.
- `@@index([wallet_id, capsule_type, conversation_id])` exists
  (`packages/database/prisma/schema.prisma`); a per-conversation
  CORRECTION query is one indexed lookup.
- `ObservationService.processCorrection` writes CORRECTION capsules
  with `topic_tags: ["correction", "correction-of-${targetId}"]`,
  `payload_summary = "${incorrect_description} → ${correct_behavior}"`,
  `entity_id = callerEntityId`, `wallet_id = caller's wallet`. Per
  Wave 2C this row may additionally carry `conversation_id`.
- `getConversationCorrections` (Wave 2C; ADR-0055) returns
  `{ ok, conversation_id, corrections_count, has_corrections,
  last_correction_at, drift_prevention_note, continuity_note }` —
  self-scoped to caller's `OtzarConversation.entity_id`; safe
  counts only; no transcripts, prompts, payload bodies, or scoring.
- ADR-0053 §6 + ADR-0052 doctrine §"Otzar does not watch employees
  to judge them" are the explicit anti-surveillance posture.
- `feedback.service.ts::propagateCorrection` already snaps both the
  correction capsule + the targeted capsule to `RELEVANCE_MAX = 1.0`
  via `RELEVANCE_CORRECTION_BUMP` — this means the Twin's *future*
  context retrieval already weighs the correction; drift detection
  is about **surfacing** that the user/Twin is making/needing
  repeated corrections within a conversation so the Twin (and the
  user) can coach themselves toward alignment.
- `MemoryCapsule` carries `embedding_content_hash` +
  `embedding_generated_at` + `relevance_score` + `last_accessed_at`
  + `access_count` per ADR-0044/0045. These are forward-substrate
  for "stale_context_signal" but the v1 contract here does NOT
  cross into capsule-staleness drift — it stays at correction-
  velocity + recurring-theme signals, both derivable purely from
  CORRECTION capsule metadata in the caller's own wallet.

The honest consequence: Wave 3 lands as a **safe, self-scoped,
derived, read-only sub-resource** on the conversation look-back
surface. It does not cross into surveillance, scoring,
psychological inference, manager visibility, autonomous learning
claims, raw content exposure, or any new external substrate. The
Twin and the user share a coaching signal; nobody else sees it
unless the user shares it.

## Decision

Foundation will add a **safe, self-scoped, additive drift-signal
sub-resource on the conversation look-back surface**, surfacing
honestly-derivable coaching signals computed from the caller's
own CORRECTION capsule metadata. The locks:

### 1. Scope of Wave 3

Wave 3 surfaces per-conversation drift coaching signals. Wave 3
does **not** implement:

- Employee compliance / loyalty / quality scoring.
- Psychological state inference.
- Cross-employee comparison or ranking.
- Manager-facing dashboards or visibility surfaces.
- Cross-org or cross-tenant drift aggregation.
- Autonomous re-training, re-weighting, or model fine-tuning.
- `IntelligencePattern` org-wide auto-write from corrections
  (forward-substrate; separate Founder authorization required).
- Stale-context drift (uses ADR-0044/0045 substrate; forward-
  substrate to a Wave 3+ slice if needed).
- Role-scope conflict drift (would consume Section 2 ActionAttempt
  `error_class = POLICY_DRIFT`; forward-substrate; separate slice).
- Real-time alerts, notifications, or push-side delivery of drift
  signals (the existing connector + notification substrate could
  fan-out a drift digest later under a separate slice).
- Control Tower drift UX (frontend; out of Foundation scope).
- Punitive policy enforcement — drift signals NEVER constrain a
  Twin's permissions, never lower clearance, never auto-revoke.
- Raw message replay, transcript exposure, hidden prompt access,
  chain-of-thought leakage, or any content surface beyond the
  Wave 2C SAFE projection.

### 2. Coaching/alignment vs surveillance boundary

The Founder boundary is canonical: **drift detection is a
coaching/alignment trust loop, not surveillance**. Concretely:

- **Audience**: the caller themselves (the entity who owns the
  Twin + the conversation). Self-scoped only. Never a manager,
  executive, peer, or org admin in v1.
- **Framing**: signals are coaching prompts that say "this
  conversation has been generating elevated correction activity;
  consider revisiting your Twin's role template or providing a
  clarifying correction." NEVER framed as "your Twin failed N
  times" or "you corrected your Twin N times in M minutes."
- **Output**: closed-vocabulary signal labels + safe counts +
  ISO timestamps + honest notes explaining what is NOT measured.
  Never freeform AI-generated commentary about employee behavior.
- **Persistence**: NOT a graded historical record. The signals
  are derived on every read from the existing CORRECTION capsule
  store; they are NOT persisted as a separate "drift profile"
  row. No "your drift score over time" surface; no compounding
  evaluation artifact.
- **Audit**: every drift-signal read emits its own watching-the-
  watchers ADMIN_ACTION audit row with `details.action =
  DRIFT_SIGNAL_READ`. The reader is auditable to themselves; the
  audit row carries no signal content, only the fact of the read
  + a count of signals surfaced.

### 3. NO schema migration

Wave 3 reuses existing substrate verbatim:

- `MemoryCapsule.conversation_id` (Wave 2C; nullable additive).
- `MemoryCapsule.capsule_type = CORRECTION`.
- `MemoryCapsule.wallet_id` for self-scope.
- `MemoryCapsule.created_at` for velocity windowing.
- `MemoryCapsule.topic_tags` for recurring-theme detection.
- `OtzarConversation.entity_id` for self-scope ownership check
  (mirrors Wave 2C `getConversationCorrections` exactly).
- `@@index([wallet_id, capsule_type, conversation_id])` for the
  hot query path.

NO new Prisma model, NO new column, NO new enum, NO migration.

### 4. NO new audit literal

Per Section 7 + Section 4 Wave 2/4/5 + Section 4 Wave 7 precedent
(no new audit literal across any of those waves; all rode
`ADMIN_ACTION` + `details.action` discriminator), Wave 3 emits:

- `event_type = ADMIN_ACTION`
- `details.action = DRIFT_SIGNAL_READ`
- `details.conversation_id`, `details.signal_count`,
  `details.signals_present` (array of closed-vocabulary label
  strings — see §5)

NO addition to `AUDIT_EVENT_TYPE_VALUES` in
`packages/database/src/queries/audit.ts`.

### 5. Closed-vocabulary signal labels (v1)

The drift-signal projection carries a `signals` array. Each entry
is a closed-vocabulary label. v1 supports two labels:

- `CORRECTION_VELOCITY_ELEVATED` — fires when the conversation
  has more than `CORRECTION_VELOCITY_THRESHOLD_DEFAULT = 3`
  CORRECTION capsules linked to it (counted from
  `wallet_id = caller's wallet + capsule_type = CORRECTION +
  conversation_id = :id + deleted_at IS NULL`). Threshold is a
  service-tier constant; future operator-configurable per-org
  override is forward-substrate (would land via an OrgSettings
  field — Wave 3+).
- `RECURRING_CORRECTION_THEME` — fires when the conversation's
  CORRECTION capsules share at least one `topic_tags` value
  beyond the generic `correction` / `correction-of-*` tags
  (i.e., two or more corrections in the conversation reference
  the same theme tag). The label surfaces "there's a recurring
  theme" without ever surfacing the theme content itself
  (privacy preservation; the theme tag could be operator-
  supplied and PII-bearing).

Closed vocabulary means: callers + Control Tower clients
deterministically branch on label strings, NOT on freeform
AI-generated text. Future signals add new labels via additive
extension behind their own narrow slice authorization.

### 6. NEW route — self-scoped per-conversation

Wave 3B adds exactly one route:

```
GET /api/v1/otzar/conversations/:id/drift-signals
```

- bearer + `read` scope (mirrors Wave 2C
  `/conversations/:id/corrections`).
- self-scope check: `OtzarConversation.entity_id ===
  authenticated caller's entity_id`. Cross-caller → 403
  `NOT_CONVERSATION_OWNER` (mirrors Wave 2C); unknown id → 404
  `CONVERSATION_NOT_FOUND` (mirrors Wave 2C).
- Bearer absent → 401.
- Reuses `OtzarFailure` codes; NO new error code.

### 7. SAFE projection

The response shape is closed:

```jsonc
{
  "ok": true,
  "conversation_id": "uuid",
  "drift_signals": [
    {
      "label": "CORRECTION_VELOCITY_ELEVATED",
      "honest_note": "Multiple corrections in this conversation. Consider revisiting the Twin's role template or clarifying intent."
    },
    {
      "label": "RECURRING_CORRECTION_THEME",
      "honest_note": "Two or more corrections share a theme tag. Consider a single clarifying correction at the theme level."
    }
  ],
  "signal_count": 2,
  "corrections_observed": 4,
  "coaching_note": "Drift signals are coaching prompts for the Twin and the user. They are not employee evaluation. They are not visible to a manager. They are derived live from your own corrections.",
  "boundary_note": "This is not a transcript. This is not an employee score. This is not a manager surface. Raw correction content is never returned."
}
```

**FORBIDDEN fields** (test-enforced via the no-leak guard pattern;
some are FORBIDDEN_TOKENS already and apply by transitive coverage):

- raw correction text / `payload_summary` / `payload_content`
- correction capsule IDs / target_capsule_id
- target capsule content / context
- conversation transcripts / messages / prompts / chain-of-thought
- topic tag values (the LABEL fires but the tags themselves stay
  in the caller's wallet)
- per-capsule timestamps (only aggregate counts + the conversation-
  level last_correction_at if surfaced)
- per-employee comparison or ranking fields
- numeric "drift score" / "compliance score" / "quality score"
- AI-generated freeform commentary about the employee
- any cross-tenant or cross-employee aggregation

`corrections_observed` is an integer (the count is already
exposed by Wave 2C via `corrections_count`; Wave 3 just renames
it locally to "observed" to clarify the signal-input role).

### 8. Frontend / Control Tower posture

Control Tower drift UX is out of Foundation scope (frontend lives
in `otzar-control-tower`). Foundation owns the safe backend
projection; the Control Tower frontend, if/when it consumes this
surface, MUST render only the closed-vocabulary labels + honest
notes — never invent freeform commentary about employee behavior.
This ADR documents that posture so the Control Tower frontend
slice (forward-substrate) has a clear contract.

### 9. Forward-substrate (RULE 20-clean; sequencing only)

Each item listed here is forward-substrate, NOT shipped in Wave 3:

- **Stale-context drift** — would query `MemoryCapsule.embedding_
  generated_at` + `embedding_content_hash != content_hash`
  signature for capsules consumed by the conversation. Requires
  joining conversation context-trace data; needs a separate slice.
- **Role-scope conflict drift** — would query Section 2
  `ActionAttempt` rows where `error_class = POLICY_DRIFT` or
  `outcome = FAILED` with the same Twin entity as actor. Needs
  cross-section join; needs a separate slice.
- **Org-wide aggregate drift** — would require an entirely
  different consent + RULE 0 sovereignty model (an aggregate
  signal that doesn't expose individual employee data). Needs a
  Founder product decision; explicit Wave 3 non-goal.
- **Drift digest push** — fan-out via the Section 4
  ConnectorBinding substrate (Wave 5 + Wave 7) to optionally
  push the caller's own drift signals to their preferred channel.
  Forward-substrate.
- **Operator-tunable thresholds** — `CORRECTION_VELOCITY_THRESHOLD`
  per-org override via OrgSettings field. Forward-substrate.
- **Cross-conversation rollup at Twin level** — `GET
  /api/v1/otzar/my-twin/drift-signals` for the caller's twin
  across all their conversations. Forward-substrate.
- **`IntelligencePattern` auto-write from corrections** — write
  side of recurring-correction-theme as an org-shared coaching
  artifact; requires consent + scope review per ADR-0053 §5
  forward queue. Separate slice + Founder authorization.

### 10. Tests required at Wave 3B

- self-scope enforcement: cross-caller `/conversations/:id/
  drift-signals` returns 403.
- unknown conversation id → 404.
- bearer absent → 401.
- empty conversation (zero CORRECTION capsules linked) → 200 with
  `signal_count = 0`, `signals = []`, honest notes preserved.
- single CORRECTION → 200 with `signal_count = 0`,
  `corrections_observed = 1` (below threshold; no labels fire).
- 4+ CORRECTIONS → 200 with `CORRECTION_VELOCITY_ELEVATED` label
  present.
- 2 CORRECTIONS sharing a non-generic topic_tag (`role-template`
  for example) → 200 with `RECURRING_CORRECTION_THEME` label
  present (even if velocity is below threshold).
- ADMIN_ACTION audit row emitted with `details.action =
  DRIFT_SIGNAL_READ` + `signal_count` + `signals_present` array.
- no-leak: response NEVER contains raw correction text, capsule
  IDs, topic tag values, payload_summary, conversation transcripts,
  numeric scores, or per-employee comparison fields.
- Wave 2C `getConversationCorrections` regression preserved (4
  routes Wave 2A/B/C unchanged behavior).

## Implementation detail

Wave 3B will land:

- NEW `apps/api/src/services/otzar/drift-signal.service.ts` with
  `analyzeConversationDrift(args: { token, conversation_id })`
  returning the SAFE projection above.
- NEW route in `apps/api/src/routes/otzar-conversations.routes.ts`
  (or equivalent conversation-routes module): `GET
  /api/v1/otzar/conversations/:id/drift-signals` registered
  alongside the existing Wave 2C `/corrections` route.
- Updates to `apps/api/src/services/otzar/index.ts` +
  `apps/api/src/index.ts` barrels.
- 9–12 integration tests at `tests/integration/otzar-drift-
  signals.test.ts` covering every §10 case.
- NO Prisma schema change.
- NO change to `packages/database/src/queries/audit.ts`.
- TypeScript baseline preserved at 4 canonical residuals.

Service-tier constants (locked in this ADR):

- `CORRECTION_VELOCITY_THRESHOLD_DEFAULT = 3` — strictly less
  than the count to fire `CORRECTION_VELOCITY_ELEVATED` (so 4+
  fires).
- `RECURRING_THEME_GENERIC_TAGS: ReadonlySet<string> =
  new Set(["correction"])` plus the runtime prefix `correction-of-`
  filter — these tags are auto-added by `processCorrection` and
  do not indicate a theme; only operator-supplied additional
  tags count toward recurring-theme detection.
- `DRIFT_COACHING_NOTE` and `DRIFT_BOUNDARY_NOTE` string
  constants (canonical copy locked at this ADR; matching the §7
  example response verbatim).

## Consequences

### Easier after Wave 3

- Employees + their Twin get a real, scoped, honest coaching
  signal — closing the Wave 2A drift-prevention foundation
  promise without crossing into surveillance.
- The Wave 2C correction-conversation linkage substrate gets a
  consuming surface that justifies its existence.
- The Foundation has a canonical "coaching signal vs surveillance"
  decision pattern that future slices (notification drift digest,
  cross-Twin signal aggregation, role-scope-conflict drift) can
  inherit by reference.
- The pattern proves the Foundation can ship trust loops without
  schema growth — pure derived signals from existing audit-
  chained substrate.

### Harder after Wave 3

- Any future "manager visibility" or "org-wide drift" surface
  must explicitly opt in via a separate Founder product decision
  per §1 (Wave 3 forbids them). This is by design.
- The closed-vocabulary signal labels become a stable contract;
  adding new labels requires a separate slice (adding a label
  changes what clients see; we want that to be a deliberate
  product decision).

### Substrate-state catches resolved

- ADR-0053 §5 forward queue entry "drift-signal contract" is
  closed at Wave 3A.
- ADR-0055 §Acceptance "Wave 3 drift detection ADR" reservation
  is closed at Wave 3A.
- The Wave 2A/B/C surface gets its third sibling read route
  (Wave 2A `/my-twin`, Wave 2B `/conversations/:id`, Wave 2C
  `/conversations/:id/corrections`, Wave 3
  `/conversations/:id/drift-signals`).

## Forward queue

- ~~`IntelligencePattern` auto-write from recurring correction
  themes~~ — **DESIGN LANDED at ADR-0066 (2026-05-30)** as
  Section 1 Wave 5 `OtzarProposedPattern` review-gated
  proposal lifecycle. ADR-0066 §3 specifies a NEW Prisma
  model `OtzarProposedPattern` (separate from this repo's
  existing org-scoped `IntelligencePattern` at
  `schema.prisma:1100-1114`, which is preserved unchanged
  per RULE 1). ADR-0066 §4 enumerates closed-vocab
  `source_signal_type` + `pattern_label` + `confidence_label`
  + `status` sets derived from the Wave 3B/4A/4C signals
  this ADR canonicalizes. ADR-0066 §5 specifies recurrence-
  detection criteria + deduplication. ADR-0066 §6 specifies
  the 4 self-scoped routes. ADR-0066 §7 specifies the
  ADMIN_ACTION + 5-discriminator audit posture (no new audit
  literal). Wave 5 **implementation slice** (the actual
  schema migration + service + routes + tests) requires a
  separate Founder authorization per RULE 20 + ADR-0066
  §11 ("ADR-only" authorization at this commit).
- Stale-context drift signal (forward-substrate per §9).
- Role-scope conflict drift (forward-substrate per §9).
- Cross-conversation Twin-level rollup (forward-substrate per §9).
- Operator-tunable thresholds (forward-substrate per §9).
- Drift digest connector fan-out (forward-substrate per §9).
- Control Tower drift UX consumer (out of Foundation scope;
  lives in `otzar-control-tower`).

## Substrate-honest disclosures

- `MemoryCapsule.conversation_id` is nullable; CORRECTION
  capsules submitted before the Wave 2C extension (`c56bd57`,
  2026-05-28) carry `null`. Wave 3 drift signal counts naturally
  exclude legacy null-conversation_id CORRECTION capsules from
  per-conversation queries — the older corrections simply don't
  appear in the per-conversation drift signal. This is correct
  behavior (they were submitted without a conversation context
  to attach to).
- The "RECURRING_CORRECTION_THEME" signal relies on operators
  submitting meaningful additional `topic_tags` via the
  correction surface. The current correction API does not accept
  operator-supplied tags beyond the auto-added `correction` +
  `correction-of-<id>`. Until an operator surface for richer tags
  lands, `RECURRING_CORRECTION_THEME` will essentially never fire
  in practice. Wave 3 ships the substrate ready; the consuming
  tag-input surface is forward-substrate. This is documented
  honestly in the API tests + the `honest_note` text.

## Bidirectional citations

- Cited from ADR-0052 (Domain General Intelligence doctrine §
  drift prevention).
- Cited from ADR-0053 §5 (Wave 3 boundary).
- Cited from ADR-0055 §Acceptance (Wave 3 drift detection
  reservation closed here).
- Cites ADR-0044 + ADR-0045 (stale-context substrate; forward-
  substrate consumer).
- Cites ADR-0057 §10 (audit allowlist + ADMIN_ACTION +
  details.action discriminator pattern).
- Cites RULE 0 (sovereignty; self-scope per caller).
- Cites RULE 4 (audit-before-response; DRIFT_SIGNAL_READ emission).
- Cites RULE 9 (DMW substrate; wallet_id scope).
- Cites RULE 13 (substrate-honest disclosures section above).
- Cites RULE 20 (this ADR's creation explicitly Founder-authorized
  via the Sleep Directive 2026-05-30).
- Cited from ADR-0068 (Otzar Wave 3 — Scoped Twin Proactivity,
  design-only) — Wave 3 consumes Wave 4A `WALLET_STALE_CONTEXT`
  + Wave 4C `CROSS_CONVERSATION_ROLLUP` signal outputs as
  source signals for two of the five v1 proactive card_types
  (`STALE_CONTEXT_REFRESH_SUGGESTED` +
  `DRIFT_REVIEW_SUGGESTED`). The "proactive suggestions" entry
  from ADR-0053 §5 + this ADR §"Forward queue" closes at the
  design register at ADR-0068; Wave 3 surfaces drift coaching
  via the same closed-vocab + no-leak + no-audit posture this
  ADR canonicalizes. Drift-signal contracts UNTOUCHED.

- **Cited by ADR-0078** (Conversation Substrate — Source-of-Truth Transcripts + `conversation_context_signals[]` Safe-Projection Layer for Agent Playground; design-only; Accepted 2026-05-31) — ADR-0078 inherits this ADR's safe-projection / closed-vocab / no-surveillance / self-scoped substrate discipline verbatim; ADR-0078 §3.3 `signal_source_type` includes a value reflecting this ADR's source role. Implementation gated on future ADR-0079 Transcript Substrate Policy. Bidirectional back-citation per RULE 14 + RULE 20.
