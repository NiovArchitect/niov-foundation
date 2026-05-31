# ADR-0067: Section 1 Wave 6B — Accepted-Pattern Priming Hook into assembleContext (design-only)

## Status

Accepted 2026-05-30

Decider: Founder. Authorized at
`[FOUNDER-SECTION-1-WAVE-6B-ACCEPTED-PATTERN-PRIMING-HOOK-ADR-AUTH]`
(2026-05-30).

This ADR is **design-only**. It locks the substrate contract
for Section 1 Wave 6B (accepted-pattern priming hook into
`COE.assembleContext`) per Founder operating direction:
"Wave 6B — priming hook into assembleContext. ADR/design only
first. This will later allow accepted patterns to influence
working-set/context assembly. It must not be implemented
until ADR/design confirms no-leak, RULE 0, and behavior-scope
safety."

Implementation is **forward-substrate** behind a separate
Founder authorization at the implementation slice.

**No code, no schema migration, no new routes, no new audit
literal, no service-method signature change** in this commit.

## Context

### Why a new ADR (not an amendment to ADR-0066)

ADR-0066 (Section 1 Wave 5) canonicalized the
`OtzarProposedPattern` model + the review-gated lifecycle +
the §9 explicit non-goal "Active pattern consumption (Wave
6+) — how an ACCEPTED pattern informs the AI teammate's
behavior. Wave 5 ships the proposal + review substrate;
behavior-change consumers are Wave 6+."

Wave 6A (PR #121 `6b84a99`) implemented half of that Wave 6+
gap — the **visibility half**: `accepted_patterns[]` projects
on `getMyTwin` as symbiotic alignment guidance the OWNER
sees. It deliberately did NOT touch `assembleContext`.

Wave 6B implements the other half — the **influence half**:
accepted patterns inform the AI teammate's context assembly
as a soft alignment signal. The influence is bounded,
observable, and owner-controllable.

Per repo convention (ADR-0046 under ADR-0041 umbrella;
ADR-0065 above ADR-0060 product-vision), substantive
behavior-touching extensions warrant a new ADR rather than
an amendment. ADR-0067 sits adjacent to ADR-0066 at the Wave
6B register; ADR-0066 stays the canonical Wave 5 contract
and ADR-0067 closes the §9 active-pattern-consumption
non-goal at the design register.

### Substrate-honest Phase 0 findings

Verified on-main state at HEAD `c6c2501` (Section 1 Wave 6A
closeout):

- **`COE.assembleContext` lives at
  `apps/api/src/services/coe/coe.service.ts:172`**. Signature:
  `assembleContext(sessionToken, requestText, tokenBudget,
  context?: { ip_address?: string | null })`. Returns
  `AssembleContextSuccess | AssembleContextFailure`.
  `AssembleContextSuccess` fields: `ok | capsules_loaded |
  tokens_consumed | capsules_skipped_low_relevance |
  capsules_skipped_budget | capsules_denied_permission |
  context: ContextItem[]`. The 7-step flow (understand →
  load metadata → score → select within budget → negotiate
  in parallel → read content → return) is fixed substrate.
- **`getMyTwin` Wave 6A** at
  `apps/api/src/services/otzar/otzar.service.ts:909` already
  surfaces `accepted_patterns[]` per
  `AcceptedPatternAdvisoryView` SAFE projection (pattern_id +
  closed-vocab source_signal_type + closed-vocab
  pattern_label + safe_summary + closed-vocab
  confidence_label + accepted_at + symbiotic advisory_note).
- **`listAcceptedPatternsForOwner`** on
  `OtzarProposedPatternService` (Wave 6A implementation;
  proposed-pattern.service.ts) is the canonical reader: it
  filters `status="ACCEPTED" + archived_at IS NULL`, orders
  by `reviewed_at DESC`, projects the SAFE 7-field
  `AcceptedPatternAdvisoryView`. **Wave 6B reuses this exact
  reader** — no new query path, no new projection, no new
  field surface.
- **`conductSession` consumes `COE.assembleContext`** at
  `apps/api/src/services/otzar/otzar.service.ts` (8-layer
  prompt builder). The LLM-tier prompt construction is where
  the alignment-patterns sidecar will be visibly labeled
  ("Owner's accepted alignment patterns:") in the rendered
  prompt — never blended invisibly into capsule context.
- **`OtzarProposedPattern.owner_entity_id`** is the RULE 0
  scope key. `listAcceptedPatternsForOwner(ownerEntityId)`
  filters by `owner_entity_id = ownerEntityId`; the caller
  in `assembleContext` is `session.entity_id`; the
  alignment-pattern read is by-construction same-owner.
- **No existing audit emission** on `assembleContext`
  (verified; the COE service emits zero `writeAuditEvent`
  calls). Wave 6B inherits this no-audit posture.

### Symbiotic doctrine alignment

Per Founder Wave 6A symbiotic clarification (and per
ADR-0052 Otzar DGI doctrine): the user and Twin are in a
**symbiotic alignment loop**. The user teaches the Twin
through review-and-acceptance; the Twin should become more
attuned to the user over time without ever judging,
surveilling, or silently mutating memory.

Wave 6B extends this loop to assembleContext while
preserving every constraint:

- **Owner-first scope**: alignment patterns read by the
  caller's session are the caller's OWN accepted patterns;
  no cross-owner; no cross-org.
- **Visible influence**: the LLM sees a labeled "alignment
  patterns" section, not a silent score-boost — the owner
  can audit the prompt and see exactly how their accepted
  patterns shaped the Twin's response.
- **Bounded**: same v1 default 5 / cap 25 as Wave 6A; the
  alignment signal cannot drown out capsule context.
- **No silent memory mutation**: alignment patterns do NOT
  modify any MemoryCapsule, ActionAttempt, OtzarProposedPattern,
  IntelligencePattern, or audit row. The hook is purely a
  read-side enrichment of `assembleContext`'s response.
- **Owner control**: an explicit query parameter
  (`include_alignment_patterns?`) lets the owner disable the
  hook for a specific call.
- **No assembleContext capsule-tier mutation**: the existing
  7-step flow (understand → load → score → select →
  negotiate → read → return) is untouched. `context[]`
  remains the same set the existing selection logic
  produces. Alignment patterns ride a **separate sidecar
  field** so the capsule pipeline stays observable and
  testable in isolation.

## Decision

Foundation will canonicalize Section 1 Wave 6B as a
**read-side sidecar enrichment** of `COE.assembleContext`
that surfaces the caller's OWN ACCEPTED `OtzarProposedPattern`
rows as alignment guidance the LLM tier can consume as a
**visibly labeled prompt section**, never as an invisible
score-boost or a capsule-pipeline mutation.

### 1. Design option lock — sidecar field, NOT capsule-pipeline mutation

Four design options were considered:

- **(a) Pre-filter — inject pattern-derived keywords BEFORE
  keyword extraction**: rejected. Would mutate the keyword
  extraction substrate (`extractKeywords` at
  `services/coe/keywords.ts`) and the capsule scoring
  pipeline, blurring the line between owner-curated
  alignment and request-derived selection. Hard to test
  observably; risk of inadvertent capsule-tier drift.
- **(b) Score-boost — increase combined_score for capsules
  matching accepted-pattern signals**: rejected. Would
  modify the ADR-0022 canonical combined_score formula
  (which is a frozen anchor at the architectural register).
  ADR-0022 amendments require explicit Founder authorization
  + a separate ADR amendment. Out of scope at Wave 6B v1.
  More importantly, a silent score-boost is the OPPOSITE of
  the symbiotic doctrine — the influence would be
  invisible.
- **(c) Post-select prefix — prepend a synthetic "owner's
  alignment patterns" context item to the returned
  context[]**: rejected. Would corrupt `capsules_loaded` +
  `tokens_consumed` counters (the synthetic item is not a
  capsule). Existing tests assert these counters reflect
  real capsule data only. Would also conflate alignment-
  pattern bytes with capsule-budget bytes.
- **(d) Sidecar field — add NEW optional
  `alignment_patterns[]` to `AssembleContextSuccess`**:
  ✅ ACCEPTED. The existing 7-step capsule pipeline is
  untouched. Alignment patterns are a discrete, observable,
  SAFE-projected sidecar the LLM tier consumes as a labeled
  prompt section. Backward-compat by construction (existing
  consumers that don't read the new field don't break).
  Test surface is clean (capsule pipeline tests don't
  change; new tests cover the sidecar surface independently).

### 2. NEW `AssembleContextSuccess.alignment_patterns` field

The `AssembleContextSuccess` type at
`apps/api/src/services/coe/coe.service.ts:64` is extended
with one new optional field:

```
export interface AssembleContextSuccess {
  ok: true;
  capsules_loaded: number;
  tokens_consumed: number;
  capsules_skipped_low_relevance: number;
  capsules_skipped_budget: number;
  capsules_denied_permission: number;
  context: ContextItem[];
  // Wave 6B (ADR-0067) — sidecar SAFE projection of the
  // caller's OWN ACCEPTED OtzarProposedPattern rows. Absent
  // when no accepted patterns exist OR when the caller
  // explicitly disables via include_alignment_patterns=false.
  // Reuses Wave 6A AcceptedPatternAdvisoryView verbatim;
  // no new shape; no new projection.
  alignment_patterns?: readonly AcceptedPatternAdvisoryView[];
}
```

The shape reuses the existing Wave 6A
`AcceptedPatternAdvisoryView` verbatim. **No new TypeScript
type is introduced.** **No projection logic is duplicated** —
the same `listAcceptedPatternsForOwner` reader Wave 6A
already exposes is consumed here.

### 3. NEW `assembleContext` parameter — `include_alignment_patterns?`

The `assembleContext` method signature is extended with one
new optional field on the existing context-options
parameter (the `context?: { ip_address?: string | null }`
parameter that already exists for audit attribution):

```
async assembleContext(
  sessionToken: string,
  requestText: string,
  tokenBudget: number,
  context: {
    ip_address?: string | null;
    // Wave 6B (ADR-0067) — explicit owner control. When
    // false, the alignment_patterns sidecar is omitted from
    // the response. Default true (the symbiotic default; the
    // owner who took the time to accept patterns probably
    // wants their Twin to see them).
    include_alignment_patterns?: boolean;
  } = {},
): Promise<AssembleContextSuccess | AssembleContextFailure>;
```

The route tier (any future surface that exposes
`assembleContext` via HTTP) maps a body field or query
param to this option.

### 4. Optional `OtzarProposedPatternService` constructor dependency

The `COEService` constructor at coe.service.ts:157 is
extended with one optional new arg:

```
constructor(
  private readonly authService: AuthService,
  private readonly negotiateService: NegotiateService,
  private readonly readService: ReadService,
  private readonly encryption: ContentEncryption,
  private readonly feedbackHook?: COEFeedbackHook,
  // Wave 6B (ADR-0067) — optional advisory reader. When
  // wired (production at server.ts), assembleContext can
  // surface alignment_patterns. When absent (existing 5-arg
  // test fixtures), assembleContext behaves exactly as
  // before — alignment_patterns omitted; capsule pipeline
  // unchanged.
  private readonly proposedPatternService?: OtzarProposedPatternService,
) {}
```

Backward-compat is **explicit and tested**: existing
5-arg constructor calls in unit + integration test fixtures
continue to work; alignment_patterns is simply absent from
the response in that mode. Production wiring at
`apps/api/src/server.ts` passes the existing
`otzarProposedPatternService` instance (constructed BEFORE
`COEService` per the same reordering Wave 6A applied for
`OtzarService`).

### 5. Service-tier flow at the sidecar emission site

Inserted between the existing STEP 6 (read content) and
STEP 7 (return) of `assembleContext`:

```
// STEP 6.5 (Wave 6B; ADR-0067) — sidecar alignment patterns.
// Reads the caller's OWN ACCEPTED patterns via the same
// Wave 6A reader; bounded by Wave 6A v1 default 5 / cap 25;
// owner-controllable via include_alignment_patterns; never
// modifies context[] or any pipeline counter. Failures are
// swallowed silently so a transient read miss never breaks
// context assembly (assembly is the load-bearing surface;
// alignment patterns are an enrichment).
let alignmentPatterns:
  readonly AcceptedPatternAdvisoryView[] | undefined = undefined;
if (
  this.proposedPatternService !== undefined &&
  context.include_alignment_patterns !== false
) {
  try {
    alignmentPatterns =
      await this.proposedPatternService.listAcceptedPatternsForOwner(
        session.entity_id,
      );
    // Treat empty array as "no patterns to surface" → omit
    // the field for cleaner response shape (mirrors Wave 6A
    // backward-compat pattern: absent when none).
    if (alignmentPatterns.length === 0) {
      alignmentPatterns = undefined;
    }
  } catch {
    // Read miss must not break assembleContext.
    alignmentPatterns = undefined;
  }
}
```

The capsule pipeline's existing counters (`capsules_loaded`,
`tokens_consumed`, etc.) are **untouched** by Wave 6B.
Alignment patterns ride a separate field; the LLM-tier
prompt construction is the surface that gives them
visibility.

### 6. LLM-tier consumption — labeled prompt section (NOT silent injection)

The `OtzarService.conductSession` 8-layer prompt builder
(at otzar.service.ts) is the canonical consumer. When
`assembleContext` returns `alignment_patterns`, the prompt
construction prepends a labeled section visible to the
owner if they audit the prompt:

```
[OWNER'S ACCEPTED ALIGNMENT PATTERNS — visible advisory
context the owner has reviewed and accepted as alignment
guidance. These are owner-controlled hints, not memory
rewrites; the owner can archive any pattern at any time.]

- <safe_summary line 1>
- <safe_summary line 2>
...
```

The label text is **closed-vocab template** locked at the
service tier (mirrors Wave 6A `SYMBIOTIC_ADVISORY_NOTES`
template discipline; never LLM-generated; never raw
correction text). The label clearly communicates:

- This is alignment guidance (not direction, not policy).
- The owner reviewed and accepted these patterns.
- They are advisory, not behavior-mutation.
- The owner controls them.

Wave 6B implementation slice will include explicit tests
that the prompt section appears verbatim when alignment
patterns are present + absent when they're not.

### 7. SAFE projection inheritance — no new forbidden-field surface

Wave 6B reuses `AcceptedPatternAdvisoryView` verbatim. The
forbidden-field surface is therefore IDENTICAL to Wave 6A
(7 allowed fields; everything else forbidden by type
construction):

**Allowed in the sidecar**: pattern_id + source_signal_type
(closed-vocab) + pattern_label (closed-vocab) + safe_summary
(closed-vocab template) + confidence_label (LOW|MEDIUM|HIGH)
+ accepted_at (ISO) + advisory_note (closed-vocab symbiotic
template).

**FORBIDDEN by AcceptedPatternAdvisoryView construction**:
owner_entity_id + occurrence_count + first_signal_at +
last_signal_at + proposed_at + status + archived_at +
created_at + updated_at + ANY raw correction text + ANY
conversation IDs + ANY embedding vector + ANY capsule
content + ANY cross-owner data.

The Wave 6B implementation slice will include the same
15-marker no-leak scan Wave 6A established
(`tests/integration/my-twin-accepted-patterns.test.ts`
markers), plus a dedicated assembleContext sidecar scan.

### 8. RULE 0 owner-scope enforcement

The alignment-pattern read uses
`listAcceptedPatternsForOwner(session.entity_id)`. The
session has already been validated at STEP 0 of
`assembleContext` (`authService.validateSession`). The
caller's wallet is already resolved at STEP 2 by
`session.entity_id`. The Wave 6B sidecar read uses the
SAME `session.entity_id`. There is no path by which Wave 6B
can read another entity's accepted patterns from inside
`assembleContext`.

Verified by construction; the Wave 6B implementation slice
will include a cross-owner test that mirrors Wave 6A's
isolation test.

### 9. Bounded influence

The sidecar inherits Wave 6A's bounded limits:

- `ACCEPTED_PATTERNS_MY_TWIN_DEFAULT = 5` (default).
- `ACCEPTED_PATTERNS_MY_TWIN_MAX = 25` (cap).

Wave 6B does NOT expose a `limit` option on
`assembleContext` (the v1 default of 5 is right-sized for
the symbiotic loop; raising it would add noise to the LLM
prompt without proportional value).

The aggregate response-size impact is bounded:
5 × (~200 char advisory_note + ~500 char safe_summary +
small metadata) ≈ 4-5 KB additional response weight per
assembleContext call. Negligible relative to the capsule
context payload.

### 10. Owner control — explicit opt-out

Per Founder operating direction, Wave 6B includes an
explicit owner-control mechanism: `include_alignment_patterns:
false` on the assembleContext options parameter. When set,
the sidecar is omitted from the response. The owner (or any
caller acting on the owner's behalf) can disable alignment-
pattern influence for a specific call without ARCHIVING the
patterns themselves.

The default is `true` (the symbiotic default — owners who
took the time to accept patterns probably want their Twin
to see them).

### 11. Audit posture — no new audit literal

Per substrate-honest Phase 0: `assembleContext` emits NO
`writeAuditEvent` rows. Wave 6B inherits this posture:

- The Wave 6B sidecar read is a pure derived read (same
  ACCEPTED rows the Wave 6A `getMyTwin` surface already
  exposes; same `listAcceptedPatternsForOwner` reader; no
  new query path).
- The `ADMIN_ACTION + ANALYTICS_READ + 5-discriminator`
  audit on the OtzarProposedPattern routes (per Wave 5
  ADR-0066 §7) covers the pattern lifecycle (PROPOSED →
  ACCEPTED → ARCHIVED). Wave 6B does NOT mutate any
  pattern row, so it inherits no new audit obligation.
- The Wave 6B implementation slice will include a test
  asserting `assembleContext` calls emit ZERO new audit
  rows of any kind.

### 12. v1 explicit non-goals (forward-substrate)

Each is forward-substrate behind a separate Founder
authorization at the respective slice:

- **Score-boost based on accepted patterns** — would
  require an ADR-0022 amendment (combined_score formula is
  a frozen anchor). Explicitly out of Wave 6B v1.
- **Pre-filter keyword injection** — would require
  modifying `extractKeywords`. Explicitly out of Wave 6B v1.
- **Capsule pipeline mutation** — explicitly out of Wave 6B
  v1; the 7-step flow stays untouched.
- **`alignment_patterns` exposure on any non-owner read**
  — explicitly out of Wave 6B v1; no admin surface; no
  manager surface; no cross-entity read path.
- **LLM autonomy over alignment patterns** — the LLM
  consumes the labeled prompt section but does NOT decide
  which patterns to apply; the owner already accepted them
  via Wave 5 review-gate, and the LLM cannot ARCHIVE or
  REJECT a pattern from inside conductSession.
- **Auto-acceptance of proposed patterns based on
  assembleContext inputs** — explicitly out of Wave 6B v1;
  acceptance always goes through the Wave 5 PATCH route
  (`PATCH /api/v1/otzar/my-twin/proposed-patterns/:id`
  with `status="ACCEPTED"`), never silently from inside
  `assembleContext`.
- **Per-conversation override** beyond
  `include_alignment_patterns: false` — explicitly out of
  Wave 6B v1; finer-grained owner control (e.g., "use only
  patterns from source_signal_type X") is forward-substrate.
- **Bidirectional alignment** (Twin proposes patterns back
  to the owner from within conductSession) — explicitly
  out of Wave 6B v1; the existing recurrence-detection
  sweep on `POST /api/v1/otzar/my-twin/proposed-patterns/sweep`
  is the canonical proposal substrate.
- **Persistent alignment-pattern usage analytics** — no
  per-call alignment-pattern usage counter is persisted at
  v1. Forward-substrate.

### 13. RULE 0 + symbiotic doctrine universal

Per Founder Wave 6A symbiotic clarification (extended to
Wave 6B):

- The user and Twin are in a **symbiotic alignment loop**.
- The user teaches the Twin through review-and-acceptance.
- The Twin reflects accepted patterns back as visible
  alignment memory (Wave 6A) AND consumes them as a
  visible advisory prompt section (Wave 6B).
- The user remains sovereign over which patterns are
  accepted, archived, or ignored.
- The Twin becomes more attuned to the user over time, not
  judging the user.
- Accepted patterns create trust, intimacy, and alignment
  between the user and their AI teammate.

**Forbidden across Wave 6B at every register**: employee
scoring; surveillance framing; manager visibility;
psychological profiling; compliance scoring; discipline
language; hidden behavior mutation; silent memory rewrite;
autonomous AI override of owner acceptance; cross-owner
read; cross-org leak; raw correction text in the prompt;
raw conversation IDs.

### 14. Implementation slice estimate

A future Wave 6B implementation slice (after this ADR +
separate Founder authorization) will land:

- **`apps/api/src/services/coe/coe.service.ts`**:
  - Add optional `proposedPatternService?` constructor arg
    (6th).
  - Add optional `include_alignment_patterns?: boolean` to
    the context-options parameter.
  - Add `AcceptedPatternAdvisoryView` import.
  - Extend `AssembleContextSuccess.alignment_patterns?:
    readonly AcceptedPatternAdvisoryView[]`.
  - Insert STEP 6.5 sidecar read block per §5.
- **`apps/api/src/services/otzar/otzar.service.ts`**: extend
  the 8-layer prompt builder in `conductSession` to render
  the labeled alignment-pattern section per §6 when
  `assembleContext` returns `alignment_patterns`.
- **`apps/api/src/server.ts`**: pass
  `otzarProposedPatternService` as the new 6th arg to
  `new COEService(...)` (constructor ordering already
  resolved by Wave 6A reorder).
- **NEW `tests/integration/coe-alignment-patterns-sidecar.test.ts`**:
  ≥ 12 integration tests covering:
  - alignment_patterns absent when caller has no ACCEPTED
    patterns (backward-compat).
  - alignment_patterns present (with full SAFE projection)
    when ACCEPTED rows exist.
  - PROPOSED / REJECTED / ARCHIVED rows excluded.
  - Cross-owner caller does NOT see the owner's patterns.
  - `include_alignment_patterns: false` omits the sidecar.
  - 15-marker no-leak scan on alignment_patterns response
    (mirroring Wave 6A markers).
  - `context[]` pipeline counters unchanged by the Wave 6B
    sidecar (capsules_loaded / tokens_consumed /
    capsules_skipped_* identical with and without the
    sidecar).
  - ZERO new audit row emitted by assembleContext calls.
  - ZERO OtzarProposedPattern mutation.
  - ZERO MemoryCapsule / Action / OtzarConversation
    creation / mutation.
  - LLM prompt section appears when alignment_patterns
    present + absent when not (consumer-tier observable
    test via conductSession mock).
  - Bounded limit of 5 patterns honored at the sidecar.

The implementation slice MUST preserve the existing
`assembleContext` tests + the 91 Wave 5/6A regression
tests verbatim — Wave 6B is purely additive.

## Consequences

### Easier after this ADR

- Wave 6B implementation slice has a single canonical
  reference (this ADR §1-§13).
- The capsule pipeline stays observable + testable in
  isolation (the sidecar field gives alignment patterns
  their own clean surface).
- The LLM tier's prompt construction stays observable + the
  alignment-pattern section is visibly labeled (the symbiotic
  doctrine's visibility requirement is satisfied at the
  surface, not in inscrutable score math).
- ADR-0066 §9 "Active pattern consumption (Wave 6+)" non-goal
  closes at the design register; the implementation slice
  closes it at the canonical-execution register.

### Harder after this ADR

- Wave 6B implementation slice CANNOT silently modify the
  combined_score formula (frozen anchor ADR-0022); a future
  amendment to ADR-0022 would require explicit Founder
  authorization at that slice.
- Wave 6B implementation slice CANNOT silently mutate the
  `context[]` set or its counters; the sidecar field is the
  ONLY surface for alignment-pattern influence.
- Wave 6B implementation slice CANNOT add an admin /
  manager / cross-owner surface; alignment_patterns is
  owner-only by RULE 0 + the inherited Wave 6A reader's
  scope.
- The LLM-tier prompt template for alignment patterns
  becomes a closed-vocab surface (locked at the service
  tier per §6) — future text changes require explicit
  Founder authorization to preserve the symbiotic framing.

### Substrate-state catches resolved

- ADR-0066 §9 "Active pattern consumption (Wave 6+)" was a
  forward-substrate non-goal with no design substrate.
  ADR-0067 lifts the design to the canonical-record register.
- Wave 6A landed the visibility half; this ADR canonicalizes
  the influence half + makes the boundary between Wave 6A
  (visible to the owner) and Wave 6B (consumed by the AI as
  a visible prompt section) explicit at the design register.
- The "score-boost vs sidecar" design question is locked at
  §1 — sidecar wins per ADR-0022 frozen anchor + symbiotic
  visibility doctrine.

## Forward queue

- **Wave 6B implementation slice** — NEW STEP 6.5 sidecar
  read in `assembleContext` + labeled prompt section in
  `conductSession` + integration tests per §14. Separate
  Founder authorization required at the implementation slice.
- **Per-conversation alignment override** — finer-grained
  owner control beyond `include_alignment_patterns: false`.
- **Score-boost extension** — would require ADR-0022
  amendment.
- **Pre-filter keyword injection** — would require keyword-
  extraction substrate change.
- **Alignment-pattern usage analytics** — persistent counter
  per pattern application; needs new schema.
- **Bidirectional alignment proposal from inside
  conductSession** — would require LLM-tier proposal flow
  + RULE 0 review-gate per Wave 5 lifecycle.

## Bidirectional citations

- Cites ADR-0001 (RULE 0 source).
- Cites ADR-0022 (combined_score frozen anchor; explicitly
  NOT amended at Wave 6B).
- Cites ADR-0048 (COE personalization-orchestration substrate
  that `assembleContext` belongs to).
- Cites ADR-0052 (Otzar DGI doctrine — symbiotic alignment
  loop alignment).
- Cites ADR-0053 Wave 2A (getMyTwin no-audit precedent
  inherited).
- Cites ADR-0058 (drift-detection substrate that produces the
  Wave 5 proposed patterns).
- Cites ADR-0066 (Wave 5 parent — closes §9 active-pattern-
  consumption non-goal at the design register).
- Cites RULE 0 (owner-first self-scope).
- Cites RULE 1 (build forward; existing capsule pipeline
  preserved unchanged).
- Cites RULE 4 (audit before response — inherited as no-audit
  per Wave 2A precedent; Wave 6B does not mutate).
- Cites RULE 13 (substrate-honest enumeration of forbidden
  fields).
- Cites RULE 14 (bidirectional citation; back-citation lands
  in ADR-0066 §9 + Wave 6A `01-employee-intelligence-core.md`
  in the same commit).
- Cites RULE 20 (this ADR's creation explicitly Founder-
  authorized).

Bidirectional citations (cited from):

- ADR-0068 (Otzar Wave 3 — Scoped Twin Proactivity, design-
  only) — cites ADR-0067 to lock the boundary that Wave 3
  proactivity surfaces via a NEW `MyTwinView.proactive_cards?`
  sidecar **and explicitly does NOT touch `assembleContext`
  or the Wave 6B `alignment_patterns?` sidecar**.
  `conductSession`'s 8-layer prompt builder + the L_ALIGNMENT
  prompt section land here at Wave 6B unchanged; Wave 3 is
  the pull-based proactive-card surface, distinct from
  Wave 6B's in-chat alignment consumption.

## Founder authorization

Per RULE 20: this ADR + the bidirectional back-citation in
ADR-0066 §9 + the Section 1 doc Wave 6B forward-substrate
update land under explicit Founder authorization at
`[FOUNDER-SECTION-1-WAVE-6B-ACCEPTED-PATTERN-PRIMING-HOOK-ADR-AUTH]`
2026-05-30.

The authorization is **ADR-only** — Wave 6B implementation
slice (the §5 STEP 6.5 sidecar code + the §6 labeled prompt
section + the §14 integration tests + the server.ts wiring)
requires a **separate Founder authorization** at the
implementation slice per Founder Wave 6B operating direction
("It must not be implemented until ADR/design confirms
no-leak, RULE 0, and behavior-scope safety. Stop after
ADR/design report unless explicitly authorized to
implement.").
