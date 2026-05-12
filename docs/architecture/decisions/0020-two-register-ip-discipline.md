# ADR-0020: Two-Register IP Discipline

Status: ACCEPTED
Date: 2026-05-10
Trigger: Pre-RAA-12.2 production-grade preparation during operator
authorship session 2026-05-10. The two-register principle —
private AI authorship lens vs. business-grade concrete form —
emerged during RAA 12.2 scoping dialog when operator introduced
a new architectural framing (Wuji as static-source-field) and
immediately drew the IP-discipline line distinguishing AI-internal
scaffolding from business-canonical voice. The principle had been
implicit in RAA 12.7 authorship (`0fd8da7`) — qi-and-blood as
operational comprehension scaffolding without explicit IP-exposure
rules — but was never canonicalized as a discipline. Canonicalization
must happen before RAA 12.2 drafting begins so the discipline
governs production-grade RAA authorship from inception forward.

## Context

Pre-existing state up to 2026-05-10:

- RAA 12.7 (Dynamic Flow Architecture, commit `0fd8da7`) was
  authored with the qi-and-blood embodied-substrate metaphor as
  pedagogical-keystone voice. The framing was operationally right
  for AI authorship comprehension but was never disciplined for
  IP-exposure boundaries. The metaphor appears verbatim in §1 of
  a published canonical RAA document on `origin/main`.
- Operator's private architectural reasoning consistently used
  metaphor-loaded framing (substrate-as-body; Wuji; qi-and-blood)
  as comprehension scaffolding for AI tools during authorship
  sessions. The metaphors served to give AI tools (Claude Code,
  Codex, Cursor, ChatGPT) the conceptual depth to process
  Foundation's topology — substrate-vs-flow, source-vs-form,
  undifferentiated-vs-differentiated, parallel-convergence
  behavior — soundly.
- Business surfaces (`README.md`, `glossary.md`, ADR-0001 through
  ADR-0019, `onboarding.md`, `CURRENT_BUILD_STATE.md`) have
  always operated in concrete-form voice without explicit
  discipline articulation. The voice was correct intuitively
  but the principle was uncodified.

The implicit two-register operation became explicit when operator
introduced new metaphor framing for RAA 12.2 and drew the
IP-discipline line: Foundation cannot be a metaphor in business
surfaces; it must have concrete form for business purposes
without exposing the methodology used to reason about it.

Production-grade RAA 12.2 — and every canonical RAA after it —
requires this principle codified before drafting begins. Without
the discipline canonicalized, downstream RAA authorship would
carry forward the RAA 12.7 metaphor-as-keystone pattern by
default, exposing operator's private architectural reasoning in
documents intended for business, government procurement, patent
licensing, and integration partner audiences.

## Decision

Foundation operates in two registers, and this ADR codifies the
boundary, the scope of each, and the surfaces where each applies.

### Register 1 — AI authorship lens (private scaffolding)

- **Content (a) — Architectural metaphors and philosophical framing.**
  Examples: qi-and-blood metaphor (RAA 12.7 §1); embodied-substrate-
  for-AI-cognition framing; Wuji as static-source-field framing
  for RAA 12.2; future metaphor-bearing architectural framings as
  they emerge.
- **Content (b) — Identity-level naming and operational context.**
  Named individuals (adversarial actors, current and former team
  members in operational context, third-party legal counterparts,
  vendor relationships under NDA, financial counterparts, investor
  relationships, hiring-pipeline candidates, advisor relationships),
  project internal codenames not yet publicly disclosed, future-
  product naming pre-announcement, partnership relationships
  pre-announcement, and discontinued-engagement names (former
  clients, former product lines, former partner relationships).
  Never enters canonical documentation, commits, ADRs, RAAs,
  business surfaces, or any repo-visible surface.
- **Function:** Provides AI tools the conceptual handles to reason
  about Foundation's topology with appropriate depth — substrate-
  vs-flow distinctions, source-vs-form distinctions, undifferentiated-
  vs-differentiated distinctions, parallel-convergence behavior,
  resonance-across-flows behavior. The metaphors are operationally
  valuable as comprehension scaffolding; stripping them would
  degrade AI authorship quality.
- **Scope:** AI-internal context only. Informs the structural logic
  of canonical documents but is not the document voice.
- **Surfaces where Register 1 IS authoritative:** AI tool loading
  context (RULE 17 architectural framing load-on-open delivers
  Register 1 framing to session opening); operator's private
  architectural reasoning notes; future architectural-philosophy
  companion documents if any are created (must be located in a
  dedicated internal-only path, not in `docs/architecture/`).
- **Surfaces where Register 1 IS NOT exposed:** business
  documents; customer-facing materials; integration partner
  technical documentation; government procurement responses;
  patent licensee disclosures; canonical RAA documents (12.1-12.7+);
  ADRs (other than this ADR-0020, which by necessity describes
  the principle); `onboarding.md`; `README.md`; `glossary.md`;
  `CURRENT_BUILD_STATE.md`; code comments visible to non-AI
  readers; any public-facing technical documentation.

### Register 2 — Concrete form (business-grade canon)

- **Content:** Hardened, defensible, ASI-grade topology. Examples:
  Foundation as the AI Memory Governance Substrate; entities,
  wallets, capsules, COSMP operations, audit chains, compliance
  configurations, cryptographic primitives, deployment postures;
  three-wallet architecture per ADR-0001; cryptographic posture
  per ADR-0019; deployment-target agnosticism per ADR-0018.
- **Function:** Business-canonical, technically-defensible,
  IP-protected description of what Foundation is. Voice for every
  surface Foundation presents to non-internal audiences.
- **Scope:** All business surfaces; all canonical RAA documents
  going forward; all engineering documentation; government
  procurement; integration partner materials; patent licensee
  disclosures.
- **Surfaces where Register 2 IS authoritative:** all business
  surfaces; all canonical RAA documents (12.1-12.7+); all ADRs
  (decision records); `README.md`; `glossary.md`; `onboarding.md`;
  `CURRENT_BUILD_STATE.md`; all code comments visible to non-AI
  readers; all public-facing technical documentation.

### Authoring discipline

When drafting any document, verify which register applies before
selecting voice. The verification is an extension of RULE 18
(verify operation type against actual file state) into the
register-discrimination dimension. Cross-register bleed —
Register 1 framing appearing in a Register 2 surface — is a
substrate-honesty drift requiring inline surfacing per RULE 13
and correction before the document ships.

The discipline is operationalized via CLAUDE.md RULE 19, which
this ADR establishes the lineage for.

## Rationale

### 1. Operational value of metaphor for AI authorship

The qi-and-blood metaphor in RAA 12.7 demonstrably improved AI
tool ability to reason about Foundation's flow architecture with
appropriate conceptual depth. The metaphor served as comprehension
scaffolding that AI tools used to structure the document's
zone-discrimination logic, multi-source-flow reasoning, and
feedback-loop circulation framing. Stripping metaphors entirely
from AI authorship would degrade architectural reasoning quality.
The discipline preserves operational value while protecting
downstream business-surface integrity.

### 2. IP protection through register discipline

Operator's private architectural reasoning is patent-relevant
intellectual property. Exposure in business surfaces would (a)
expose architectural thinking unnecessarily to competitors and
adversarial actors; (b) weaken IP positioning by making the
substrate sound philosophical rather than hardened; (c) make the
substrate harder to defend in patent licensing and litigation
contexts, where concrete claims are required and metaphor-loaded
framing creates ambiguity. The two-register discipline preserves
operational value of metaphor while protecting the IP boundary.

### 3. ASI-grade defensibility framing

Production-grade documentation for ASI consumers and government
procurement audiences requires hardened concrete topology voice.
Metaphor voice undermines the defensibility frame even when the
underlying substrate is genuinely hardened. Register 2 voice
matches the substrate's actual production-grade character; the
voice and the substrate align.

### 4. Substrate-coherence between authorship process and substrate property

Foundation enforces register boundaries operationally — wallet
boundaries, audit boundaries, permission boundaries, cross-org
leak prevention, compliance-framework scoping. The authorship
process for Foundation's documentation should enforce register
boundaries similarly. Two-register IP discipline is substrate-
coherent with how Foundation itself operates: register boundaries
in documentation parallel boundary enforcement in the substrate.

### 5. Forward-compatibility with future RAA authorship

RAA 12.2, 12.6, 12.4, 12.5, 12.1, 12.3 are all forthcoming.
Establishing the principle now means each future RAA inherits
the discipline automatically rather than requiring per-document
IP review. The canonicalization timing is deliberate — pre-RAA-
12.2, before the next pedagogical-density document drafts, so
the discipline governs from inception.

## Consequences

### Easier

- RAA authorship inherits IP discipline automatically; no
  per-document IP review required.
- AI tools (via RULE 17 architectural framing load-on-open +
  RULE 19 two-register IP discipline) load Register 1 framing
  without exposing it in document output.
- Business surfaces remain hardened concrete voice without
  per-document exception management.
- Patent licensing, government procurement, and integration
  partner disclosures all operate from consistent Register 2
  canon.
- Future architectural-philosophy work can be captured in
  dedicated internal-only documents without polluting business
  surfaces.
- Cross-register bleed catches are bounded — RULE 13 inline
  drift surfacing + RULE 18 operation-type verification cover
  the catch surface.

### Harder

- AI tool sessions must verify register before drafting (RULE
  18 + RULE 19 discipline overhead per drafting session).
- Cross-register bleed catches require operator review and
  RULE 13 drift surfacing; first-iteration drafts may need
  revision passes.
- Future contributors (human or AI) must internalize the
  distinction; onboarding overhead increases by one rule.
- Initial canonicalization commit required (this ADR + RULE 19
  + `onboarding.md` updates) before downstream RAAs can ship
  under the discipline.

## Forward implications

- **RAA 12.2 (next):** drafted in Register 2 voice. Wuji
  static-source-field framing as Register 1 informs structural
  reasoning but does not appear in document body.
- **Future RAAs (12.6, 12.4, 12.5, 12.1, 12.3):** inherit the
  same discipline.
- **README.md doc-wide refresh (queued):** Section-12C.0-era
  framing across the README will be brought to current state in
  a dedicated canonical-refresh commit. Refresh includes
  rule-count update (16 → 19), Section 12-era references, and
  Register 2 voice verification across the full document.
- **Architectural philosophy companion documents:** if created,
  must be located in a dedicated internal-only path (e.g.,
  `docs/internal/` or similar gated location). Not in
  `docs/architecture/`, which is Register 2 territory.
- **Patent licensing and integration partner documentation:**
  uses Register 2 canon as source-of-truth. No per-engagement
  Register 1 exposure.
- **Cross-register bleed during AI tool sessions:** surfaced
  inline per RULE 13. Corrected before document ships. RAA
  12.7 §1 is grandfathered as the canonical Register-1 example
  and will not be retroactively rewritten — it predates this
  ADR and is preserved per the immutable-published-record
  discipline (Gate 9 D-2 option (c) precedent).

## References

- RAA 12.7 (`0fd8da7`) — `docs/architecture/dynamic-flow-architecture.md`
  §1; canonical Register-1 example; demonstrates Register 1's
  operational value for AI authorship; predates explicit register
  discipline; preserved per the immutable-published-record
  discipline.
- ADR-0001 (Three-Wallet Architecture) — canonical Register-2
  example; concrete topology voice; business-grade hardened.
- ADR-0019 (Cryptographic-Suite Posture) — canonical Register-2
  example; concrete primitive selection; procurement-grade
  defensibility framing.
- `docs/contributing/onboarding.md` §1 — Register-2 voice for
  engineering audience.
- `CLAUDE.md` RULE 17 (architectural framing load-on-open) —
  delivers Register 1 framing to AI tool sessions without
  exposing it in business surfaces.
- `CLAUDE.md` RULE 18 (verify operation type against actual file
  state) — extends to register-discrimination per this ADR.
- `CLAUDE.md` RULE 19 (two-register IP discipline) — the
  operational enforcement of this ADR's decision; cross-references
  this ADR for decision lineage.
- US 12,517,919 (COSMP/DMW patent) — substrate boundary
  enforcement is analogous to register boundary enforcement;
  the two-register discipline is substrate-coherent with how
  Foundation itself operates.

Bidirectional citations (cited from):

- `CLAUDE.md` RULE 19 (forward citation to ADR-0020 for decision
  lineage)
- `docs/contributing/onboarding.md` §3 Step 1 (RULE-count
  inventory updated to include RULE 19 in this commit)
- `docs/architecture/addendum-dmw-slm-equivalence.md` (ADDENDUM-DMW-SLM;
  landed in `[ADDENDUM-DMW-SLM]` `67fb083` on 2026-05-11): a
  canonical-record-register patent-implementation-evidence addendum
  operating purely at Register-2 architectural framing (zero
  protected-name leak; the SLM/LLM-equivalence consequence is
  business-grade concrete-form prose, no Register-1 metaphor bleed).
  The addendum's header Cross-references block and §10 References cite
  this ADR for the two-register discipline it preserves throughout.
  RULE 14 back-citation landed at `[D-2D-D10-8]` (deferred from the
  addendum commit per the Sub-box-1 closure-amendment grouping).
