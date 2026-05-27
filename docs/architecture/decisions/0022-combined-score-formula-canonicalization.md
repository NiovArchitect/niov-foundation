# ADR-0022: combined_score Formula Canonicalization

**Status:** Accepted
**Date:** 2026-05-10
**Trigger:** D-WEIGHT-2 surfaced during Step 2A investigation (74b2765 commit body); forward citations from glossary `combined_score` entry (74b2765) and ADR-0021 Forward implications both reference ADR-0022 as queued canonicalization. Closes both forward citations and elevates the combined_score weighting formula from RAA-tier (RAA 12.7 §3.3) to ADR-tier canonical architectural decision record.

## Context

Foundation's COE retrieval mechanism uses a single scoring formula to rank Memory Capsules during context-assembly convergence. The formula is implemented at `apps/api/src/services/coe/keywords.ts` L87-93 as `combinedScore(tagOverlap, baseRelevance, recency)` returning `tagOverlap * 0.45 + baseRelevance * 0.35 + recency * 0.2`.

Three input signals feed the formula:

- **tagOverlap** — semantic match between request keywords and capsule tags; computed by `tagOverlapScore` at L52-66, normalized by `capsuleTags.length` (yielding stable scores regardless of request keyword count)
- **baseRelevance** — the Capsule's `relevance_score` field (range [0.0, 1.0]; default 1.0), maintained by Loop 1 bilateral feedback per RAA 12.7 Zone B1
- **recency** — computed by `recencyScore` at L74-80; returns 1.0 if `last_accessed_at` is within 7 days; linear decay between day 7 and day 90; 0.0 after day 90

The formula is locked at substrate level by tests:

- `tests/unit/coe.test.ts:132-136` asserts each coefficient pillar exactly: `combinedScore(1,0,0) === 0.45`, `combinedScore(0,1,0) === 0.35`, `combinedScore(0,0,1) === 0.20`, `combinedScore(1,1,1) === 1.00`
- `tests/unit/coe.test.ts:121-129` asserts recency monotonicity (7-day plateau, linear decay, 90-day floor)

Any change to coefficients or recency thresholds breaks the test suite — this constitutes implicit ADR-tier-equivalent enforcement (D-W2-COEFFICIENT-LOCK). ADR-0022 makes the implicit lock explicit canonical record.

RAA 12.7 §3.3 canonicalizes the formula at RAA-tier with the framing "weights are the architecture, not arbitrary numbers." The reconciliation document (`docs/reconciliation/2026-05-08-build-reconciliation.md` Section 4) references combined_score as one of three Section 4 architectural decisions implemented at substrate level. No ADR-tier canonicalization existed prior to ADR-0022; the forward citations from 74b2765 (glossary `combined_score` entry) and ba3ef11 (ADR-0021 Forward implications) expected this canonicalization.

## Decision

Codify the combined_score formula, its coefficients, and the recency thresholds as canonical architectural decision record.

### The formula

`combined_score(tagOverlap, baseRelevance, recency) = tagOverlap * 0.45 + baseRelevance * 0.35 + recency * 0.20`

Inputs are each normalized to [0.0, 1.0]. Output is in [0.0, 1.0] without further normalization (coefficients sum to exactly 1.00).

### The recency function

`recencyScore(last_accessed_at, now)` returns:
- `1.0` if `(now - last_accessed_at) < 7 days`
- Linear decay from `1.0` at day 7 to `0.0` at day 90: `1.0 - (days - 7) / (90 - 7)`
- `0.0` if `(now - last_accessed_at) >= 90 days`

### Per-coefficient semantic claims

Each coefficient encodes a specific architectural claim about what the substrate weighs in retrieval:

- **0.45 tagOverlap (highest weight)** — semantic match is the primary retrieval signal. Without semantic match between request and capsule, recency and accumulated usefulness don't matter. tagOverlap functions as the substrate's primary retrieval discrimination.

- **0.35 baseRelevance (middle weight)** — accumulated usefulness signal maintained by Loop 1 bilateral feedback (Zone B1). Capsules that have proven useful via prior retrieval-and-use carry signal about their actual retrieval value. Weighted high enough to influence ranking, but lower than tagOverlap because past-utility cannot override current-relevance.

- **0.20 recency (lowest weight)** — freshness is signal, not gating. Old high-relevance capsules should still surface; new low-relevance capsules should not be elevated by mere recency. The 0.20 weight allows recency to break ties between similar-scoring capsules but not dominate the ranking.

### Coefficient sum constraint

The three coefficients sum to exactly 1.00 (`0.45 + 0.35 + 0.20`). This is not coincidence — the constraint enforces:

- Output is mathematically in [0.0, 1.0] for inputs in [0.0, 1.0]
- No downstream normalization required
- Substrate retrieval scores remain comparable across all retrieval contexts
- Future amendments altering coefficient weights must preserve the sum constraint

### Recency thresholds rationale

The 7-day plateau and 90-day decay-to-zero envelope encode substrate-specific temporal claims:

- **7-day plateau** — Capsules accessed within a recent week are treated as "current" without recency penalty. Reflects the substrate's expectation that work-context-relevant intelligence is reinforced via regular access during the work cycle.
- **90-day floor** — Capsules unaccessed for 90 days carry zero recency signal. Reflects the substrate's expectation that a quarter-year without access indicates the intelligence has lost contextual relevance even if semantically matched.
- **Linear decay 7→90** — Smooth transition between recent and stale regimes. No abrupt cliff; capsules degrade gracefully across a 12-week window.

## Rationale

### Why this asymmetric distribution vs uniform 0.33/0.33/0.33

Uniform weighting treats all three signals as equally informative. Substrate truth is they are not. Semantic match between query and capsule (tagOverlap) is more discriminating than temporal freshness (recency) because semantic match directly addresses "is this capsule about what's being asked"; temporal freshness only addresses "how recent is this." Accumulated usefulness (baseRelevance) sits in between because past-utility is informative about future-utility but cannot override current-relevance.

The 0.45 / 0.35 / 0.20 distribution encodes this substrate-honest signal hierarchy. Uniform weighting would erase the hierarchy and treat all three signals as substitutable, which contradicts the architectural claim that they encode different kinds of information.

### Why these specific magnitudes

- **0.45** for tagOverlap is high enough that pure semantic match dominates capsules with mediocre accumulated usefulness, but low enough that a capsule with strong baseRelevance + recency can still surface despite imperfect tagOverlap.
- **0.35** for baseRelevance is high enough that Loop 1 bilateral feedback meaningfully influences ranking (capsules that proved useful get prioritized), but low enough that accumulated usefulness alone cannot override semantic mismatch.
- **0.20** for recency is high enough that freshness breaks ties and slightly favors recently-active intelligence, but low enough that old-and-relevant beats new-and-irrelevant.

### Why additive rather than multiplicative

Additive composition (`a + b + c`) treats the three signals as complementary contributions to a single retrieval score. Multiplicative composition (`a * b * c`) would treat them as joint conditions: any near-zero signal would zero out the score regardless of the other two.

The substrate decision is additive: a capsule with strong tagOverlap and strong baseRelevance should surface even if recency is zero (old but useful), and a fresh capsule with no semantic match should not surface despite recency being maximal. Multiplicative composition would weaken these correct retrievals.

### Why elevate from RAA-tier to ADR-tier

RAA 12.7 §3.3 documents the formula in substrate-architecture context. RAA tier is appropriate for surface design and topology decisions. ADR tier is appropriate for discrete architectural decisions with explicit amendment paths and cross-document canonical citations.

The combined_score formula meets ADR-tier criteria:
- Discrete decision (specific coefficients; specific thresholds)
- Explicit amendment path needed (changes break tests; require coordinated update)
- Cross-document citations (glossary entries from 74b2765; ADR-0021 Forward implications; future RAA 12.8 amendments)
- Patent-implementation-evidence value (formula is part of substrate retrieval mechanics; canonical decision record contributes to cryptographically-timestamped commit history per memory entry #12)

### Test anchor as canonical lock

The substrate-level tests at `coe.test.ts:132-136` (coefficient lock) and `coe.test.ts:121-129` (recency monotonicity) operationalize ADR-0022's canonical lock. Any code change that altered the formula or thresholds without coordinated test update would fail CI. The tests are the canonical enforcement mechanism; ADR-0022 is the canonical justification.

## Consequences

**Easier:**
- Forward citations from 74b2765 glossary entry and ADR-0021 Forward implications close cleanly
- Future contributors have canonical justification for the specific coefficients (no more "where do these numbers come from")
- RAA 12.8 (Weighting Architecture, queued) can extend the formula via ADR-0022 amendment with clear precedent
- Patent-implementation-evidence chain advanced: formula coefficients are now ADR-tier canonical record on origin/main

**Harder:**
- Amendments to formula or thresholds require ADR amendment + coordinated test update
- RAA 12.8 must extend (not replace) ADR-0022; replacement would supersede via new ADR
- Any future per-type baseline weight extensions (Step 2D candidate) must preserve or explicitly amend ADR-0022's coefficient sum constraint

## Alternatives Considered

**Uniform coefficients (0.33/0.33/0.33).** Rejected. Erases the architectural claim that the three signals carry different information. Substrate truth is they are not equally informative.

**Different magnitudes (e.g., 0.50/0.30/0.20 or 0.40/0.40/0.20).** Considered. The chosen 0.45/0.35/0.20 distribution reflects operational signal-hierarchy claims documented in Rationale. Alternative magnitudes preserving the hierarchy could be canonicalized via future amendment if operational evidence warrants; ADR-0022's coefficients reflect substrate decisions as of canonicalization date.

**Multiplicative composition.** Rejected. Would zero out scores when any single signal is near-zero, contradicting substrate-honest retrieval semantics where complementary signals should compose additively.

**Defer to RAA 12.8.** Rejected. Substrate operates on these specific coefficients now. Deferring canonical justification leaves the coefficients as folk knowledge subject to drift. ADR-0022 codifies current substrate decisions; RAA 12.8 may extend via amendment when broader weighting architecture is designed.

**Include tagOverlap normalization decision in scope.** Rejected. tagOverlapScore normalizes by `capsuleTags.length` (not keyword count) — substrate decision documented in keywords.ts WHY comment but not at ADR-tier. Separate decision territory; no current forward-promise; ADR-0022 references but does not codify (D-W2-TAG-NORMALIZATION deferred).

**Codify only formula, not recency thresholds.** Rejected. Recency thresholds (7-day, 90-day) are coupled to combined_score — changing thresholds changes the recency component's contribution. Codifying formula without thresholds would leave a coupled architectural decision un-canonicalized. Thresholds included in scope.

## Forward implications

ADR-0022's discipline propagates to:

- **74b2765 glossary update (separate commit, deferred).** The `combined_score` glossary entry currently states "ADR-tier canonicalization queued for ADR-0022." This will be updated to "canonicalized at ADR-0022" in a future glossary refresh (Step 2F post-RAA-12.8 candidate).

- **RAA 12.8 (Weighting Architecture, queued).** When per-type baseline weights or push/pull flow mechanics or lateral flow primitives are designed, RAA 12.8 may extend the combined_score formula with additional weight components. Extensions require ADR-0022 amendment, not replacement. Replacement would require a superseding ADR.

- **Step 2D engineering work.** Any engineering work to introduce per-type baseline weights (currently a GAP per Step 2A investigation) must preserve combined_score's coefficient sum constraint or explicitly amend ADR-0022.

- **Zone B1 (Loop 1 bilateral feedback) — adjacent canonical territory.** combined_score's baseRelevance weight is meaningful only because Zone B1 feedback maintains the signal via `RELEVANCE_USED_BUMP` (+0.05) and `RELEVANCE_UNUSED_DECAY` (-0.02). ADR-0022 references Zone B1 as adjacent canonical decision territory. Future Zone B1 coefficient amendments may interact with ADR-0022's baseRelevance weight; coupled amendments require both ADRs to be considered together.

- **FOUNDATIONAL Capsule retrieval-privilege class.** FOUNDATIONAL Capsules bypass `RELEVANCE_FORGET_FLOOR` and bypass token budget allocation per ADR-0021's invariant statement. combined_score is computed for FOUNDATIONAL Capsules but doesn't gate inclusion (they are added first irrespective of score). ADR-0022 acknowledges this interaction without re-canonicalizing it (already documented in RAA 12.7 §3.3 + ADR-0021).

## Amendment — Informativeness-coefficient parameterization joins the frozen-anchors family (INT-6)

**Amendment date**: 2026-05-12
**Amendment trigger**: [D-2D-D10-6] `38205b3` landed `RELEVANCE_CORRECTION_BUMP = RELEVANCE_MAX` substrate (snap-to-MAX semantics per RAA 12.8 §5.5 INT-3 "maximum bump coefficient"). The substrate-tier landing is bounded; this amendment is the canonical-record-tier follow-up per [D-2D-D10-6] Observation 3 + the Sub-box 1 CLOSED narrative forward-queue item 2.

### Informativeness-coefficient family

The following per-Capsule relevance constants canonical at `apps/api/src/services/feedback/feedback.service.ts` (L91-104) + `apps/api/src/services/coe/coe.service.ts` (L44) join the frozen-anchors family per INT-6:

- `RELEVANCE_USED_BUMP = 0.05` — `feedback.service.ts:91` (used-signal canonical bump; Loop 1 bilateral feedback per RAA 12.7 Zone B1)
- `RELEVANCE_UNUSED_DECAY = 0.02` — `feedback.service.ts:92` (unused-signal canonical decay)
- `RELEVANCE_MIN = 0.0` — `feedback.service.ts:93` (lower bound)
- `RELEVANCE_MAX = 1.0` — `feedback.service.ts:94` (upper bound)
- `RELEVANCE_CORRECTION_BUMP = RELEVANCE_MAX` — `feedback.service.ts:104` (per [D-2D-D10-6]; snap-to-MAX semantics; a human correction is the "maximum bump coefficient" signal per RAA 12.8 §5.5 INT-3 — rarest and strongest, so it snaps to the ceiling rather than incrementally bumping like `RELEVANCE_USED_BUMP`)
- `RELEVANCE_FORGET_FLOOR = 0.2` — `coe.service.ts:44` (intentional-forgetting threshold; exported; FOUNDATIONAL Capsules bypass per ADR-0021)

### Frozen-anchors family canonical extension path

Per RAA 12.8 §6.6 + §7.4: the informativeness-coefficient family is a canonical extension of the frozen-anchors family alongside this ADR's `combined_score` formula-anchor test (`tests/unit/coe.test.ts:132-136` coefficient lock + `:121-129` recency monotonicity lock). Substrate-honest framing: the existing frozen-anchors cataloged at `docs/reference/architectural-anchors.md` include `Object.freeze`-wrapped configuration anchors (`CRYPTO_CONFIG`, `SYSTEM_PRINCIPALS` per ADR-0019); the value-assertion anchors (`combined_score` coefficients; this amendment's informativeness coefficients) operate via canonical-record assertion + test substrate. Both are substrate-tier tamper-resistance mechanisms; different substrate registers. Cataloging `combined_score` + `RELEVANCE_FORGET_FLOOR` into `architectural-anchors.md` is a substantively-bounded follow-up deferred to a future `[DOCS-CATALOG-REFRESH]` (substrate-state distinction between value-assertion and `Object.freeze` anchors; scope discipline).

### Forward-queue: formula extension to Step 2E engineering

Per RAA 12.8 §7.3 + §7.5: the actual `INFORMATIVENESS_WEIGHT` 4th-coefficient formula extension — `combined_score = tag*w_tag + base*w_relevance + recency*w_recency + informativeness*w_informativeness`, sum-=-1.0 invariant preserved, coefficient redistribution candidates surfaced for operator review at amendment-drafting time (conservative `w_informativeness = 0.10` → `0.405 / 0.315 / 0.180`; mid `0.20` → `0.36 / 0.28 / 0.16`; aggressive `0.30` → `0.315 / 0.245 / 0.14`; default conservative) — is explicitly Step 2E engineering substrate. Substantively-substantial scope: multi-sprint; NET-NEW per-CapsuleType × per-event-type × per-salience-band coefficient table; frozen-config module canonical at `apps/api/src/services/coe/informativeness-config.ts` OR `apps/api/src/services/feedback/informativeness-config.ts` (Step 2E planning decision per the ADR-0019 frozen-config pattern); Loop 1 differential-bump/decay refactor at `feedback.service.ts`; ADR-0003-discipline anchor tests for the new coefficients; the `combined_score` anchor test at `coe.test.ts:132-136` extended to validate the 4-coefficient sum invariant. The ADR-0022 amendment for the formula extension lands alongside the frozen-config module per coordinated commit discipline per RAA 12.8 §7.5.

This amendment canonicalizes the family join at the canonical-record register; the engineering substrate (Step 2E) sequences after RAA 12.8 full-document drafting per the §7.5 operator framing. The `combined_score` formula and recency thresholds canonicalized above (Decision section) are unchanged by this amendment — the amendment is additive (per RAA 12.8 §7.3 "amends rather than supersedes").

## References

- 74b2765 ([GLOSSARY-G-3] glossary canonicalization; combined_score / recencyScore / relevance_score / RELEVANCE_FORGET_FLOOR / RELEVANCE_UNUSED_DECAY / RELEVANCE_USED_BUMP entries; forward citation closes here)
- ba3ef11 (ADR-0021 Capsule Type Extension Protocol; ADR-0022 forward citation closes here)
- ADR-0009 (parallel canonicalization pattern: COSMP 7-operation enum lock)
- ADR-0014 (parallel canonicalization pattern: hash-based dispatch decision)
- ADR-0015 Decision B (12-error TypeScript baseline; preserved through this commit)
- ADR-0020 (Two-Register IP Discipline; Register 2 voice applied throughout this ADR)
- ADR-0021 (Capsule Type Extension Protocol; FOUNDATIONAL bypass interaction referenced)
- RAA 12.7 §3.3 (RAA-tier canonicalization predates ADR-0022; ADR-0022 elevates to ADR-tier)
- RAA 12.7 Zone B1 (Loop 1 bilateral feedback; relevance_score signal maintenance)
- RAA 12.8 Weighting Architecture — §6.6 (frozen-anchors family canonical inventory; INT-6 informativeness function joins the family), §7.3 (ADR-0022 amendment path detail; `INFORMATIVENESS_WEIGHT` 4th-coefficient formula extension specification + coefficient redistribution candidates), §7.4 (frozen-anchors family extension discipline; ADR-0019 frozen-config pattern + ADR-0003 anchor test discipline applied jointly), §7.5 (Step 2E engineering surface; coordinated commit discipline — amendment lands alongside the frozen-config module). The amendment landed at [SEC-INT6-ADR0022] documents the family join at canonical-record register; the formula extension itself is Step 2E engineering substrate.
- `apps/api/src/services/coe/keywords.ts` (canonical implementation: `combinedScore`, `recencyScore`, `tagOverlapScore`)
- `apps/api/src/services/coe/coe.service.ts` (`RELEVANCE_FORGET_FLOOR`, `TOKENS_PER_CAPSULE_ESTIMATE`, FOUNDATIONAL bypass)
- `apps/api/src/services/feedback/feedback.service.ts` (`RELEVANCE_USED_BUMP`, `RELEVANCE_UNUSED_DECAY`; Zone B1 implementation)
- `tests/unit/coe.test.ts:132-136` (coefficient lock; canonical enforcement mechanism)
- `tests/unit/coe.test.ts:121-129` (recency monotonicity lock)
- `docs/reconciliation/2026-05-08-build-reconciliation.md` Section 4 (combined_score documented as substrate architectural decision)
- US 12,517,919 (COSMP/DMW patent; combined_score is implementation-level architectural decision; patent claim coverage at substrate-architecture level rather than formula-coefficient level)

Bidirectional citations (cited from):

- RAA 12.8 (`docs/architecture/raa-12-8-substrate-dynamics.md`) — §6.6 frozen-anchors family canonical inventory (INT-6); §7.3 ADR-0022 amendment path detail; §7.4 frozen-anchors family extension discipline; §7.5 Step 2E engineering surface. RAA 12.8 cites this ADR as the `combined_score` formula-anchor precedent and as the amendment target for the informativeness-coefficient formula extension.
- `docs/CURRENT_BUILD_STATE.md` ADR catalog — describes this ADR's substrate as "frozen-anchors family per INT-6; informativeness coefficient extension path per RAA 12.8 §7.4."
- `docs/reference/section-12-progress.md` Sub-box 1 CLOSED narrative forward-queue item 2 — marked COMPLETE at [SEC-INT6-ADR0022] reflecting the canonical-record-tier follow-up landed by this amendment.
- [D-2D-D10-6] `38205b3` — landed `RELEVANCE_CORRECTION_BUMP = RELEVANCE_MAX` substrate-tier canonical; Observation 3 explicitly framed this amendment as the canonical-record-tier follow-up.
- `docs/reference/architectural-anchors.md` — anchor 7 (`combined_score` coefficient invariants; VALUE-PIN mechanism per `tests/unit/coe.test.ts:132-136` coefficient lock + `:121-129` recency monotonicity lock) + anchor 8 (`RELEVANCE_FORGET_FLOOR` behavioral lock; BEHAVIORAL-LOCK mechanism per `coe.test.ts:170` exclusion behavior + `:141-145` FOUNDATIONAL bypass + `:316` relational lower-bound) cataloged at [DOCS-CATALOG-REFRESH-ANCHORS] (commit 2 of 2 of the [DOCS-CATALOG-REFRESH] mini-arc) per the INT-6 frozen-anchors-family canonical extension — closes the Amendment §"Frozen-anchors family canonical extension path" forward-promise ("Cataloging `combined_score` + `RELEVANCE_FORGET_FLOOR` into `architectural-anchors.md` is a substantively-bounded follow-up deferred to a future `[DOCS-CATALOG-REFRESH]`"). The catalog's "Anchor Mechanisms" section names ADR-0019's `Object.freeze` anchors (5+6), this ADR's value-pin anchor (7), and this ADR's behavioral-lock anchor (8) as three distinct substrate-tier tamper-resistance patterns.
- ADR-0051 (Otzar Chat Transparency and COE-Governed Retrieval Surfacing) — cites this ADR for the frozen `combined_score` scoring formula; ADR-0051 **does not amend scoring or retrieval scoring** (no `similarity.service` wiring; COE scoring untouched), preserving this ADR's coefficient lock.
