# ADR-0027: Contributor Governance + AI-Alignment + Rule-Modification Authority

**Status**: Active
**Date**: 2026-05-12
**Trigger**: The Sub-box 2 Phase 1 arc (sub-phases A→I) surfaced 21
substrate-state catches at pre-flight / pre-edit per RULE 12 / RULE 13 /
RULE 18 — every one caught before any edit chained. The substrate-honest
pre-flight discipline is operating effectively at the substantive-engineering
register; but the substrate it protects — the RULES in `CLAUDE.md` and the
ADRs in `docs/architecture/decisions/*.md`, which together constitute the
authorization-tier substrate of the codebase — has no *formal* authorization-
tier protection against modification by a contributor or an AI assistant
acting outside the patent-holder Founder's authorization. ADR-0027 formalizes
that protection (RULE 20 — Rule-Modification Authority), the AI-alignment
discipline that follows from it, and the contributor-onboarding surface
(`docs/contributing/onboarding-for-engineers.md`) that canonicalizes both.

## Context

The Foundation codebase has two tiers of substrate. The **operational tier**
is the code that runs (the COSMP services, the routes, the Prisma schema, the
tests) plus the docs that describe it. The **authorization tier** is the
substrate that governs how the operational tier may change: the RULES in
`CLAUDE.md` (the 20 operational rules a session internalizes) and the ADRs in
`docs/architecture/decisions/` (the architectural-decision record). The
authorization tier is the substrate's substrate — a change to RULE 16 (no
`console.*` in `apps/api/src`) or to ADR-0002 (the append-only audit chain
discipline) is categorically different from a change to a route handler: it
re-defines what "correct" means for everything downstream.

Modifications to the authorization tier require the same authorization tier as
its creation. A contributor's pull request that proposes adding a route, fixing
a bug, or extending a test is ordinary review territory. A pull request that
proposes modifying a RULE or an ADR is not — it is a proposal to change the
project's governing substrate, and it requires the patent-holder Founder's
explicit authorization, not a co-maintainer's rubber-stamp.

The same logic applies — more sharply — to AI assistants. Claude, Claude Code,
Codex, Cursor, and any other AI coding tool operating in this repo is a
powerful executor: it can read the whole substrate, draft new substrate, and
land edits at speed. That capability is exactly why it must not modify the
authorization tier: an AI assistant that "improved" a RULE or "cleaned up" an
ADR without explicit Founder authorization would be eroding the substrate-state
coherence the patent-holder substrate depends on — the contemporaneous,
disciplined, sequentially-numbered record that ADR-0020's two-register IP
discipline (Register 2 — concrete form) makes load-bearing. The substrate-
honest pre-flight discipline (RULE 12 / RULE 13 / RULE 18) is the *behavioral*
half of this: an AI assistant *surfaces* a substrate-state observation rather
than silently patching it. RULE 20 is the *authority* half: even when surfaced,
a RULE/ADR modification is not the AI assistant's (or the contributor's) to
make — it is the Founder's.

This matters because the substrate-state coherence is itself the asset. A
disciplined, append-only, sequentially-numbered RULES + ADRs record — every
change ADR-drafted, every drift surfaced, every commit on `origin/main`
contemporaneous evidence — is what makes the patent-implementation record
robust. An adversarial actor arguing parallel or prior implementation has a
much harder case against a substrate whose every governing change is recorded,
authorized, and dated than against one a co-maintainer or an AI tool could
quietly rewrite. RULE 20 protects that asset; the threat model is abstract —
"a modification to the authorization tier made outside Founder authorization" —
and the rule is framed against the threat, not against named actors (RULE 19 —
identity-level naming, including adversarial actors, never enters canonical
documentation).

The 21 substrate-state catches across sub-phases E/F/G/H/I are the worked
example of why this matters: every one was a place where the *plan* described
an edit against an idealized substrate (a non-existent field, a wrong path, a
stale audit-marker name, an under-counted cascade) and the *actual* substrate
said otherwise. The discipline caught all 21 before edits landed. ADR-0027
canonicalizes that the substrate's *governing* layer gets the same protection
the discipline already gives its operational layer.

## Decision

**RULE 20 (Rule-Modification Authority)** is added to `CLAUDE.md` §3, after
RULE 19, with this canonical text:

> Only the patent-holder Founder may modify, add, or remove RULES (`CLAUDE.md`)
> or ADRs (`docs/architecture/decisions/*.md`).
>
> Pull requests proposing such modifications must explicitly cite this RULE in
> the PR description and surface the proposed modification for explicit Founder
> authorization before merge.
>
> Contributors and AI assistants (including Claude, Claude Code, Codex, Cursor,
> and any other AI coding tools) MUST NOT modify `CLAUDE.md` RULES or
> `docs/architecture/decisions/*.md` content without explicit Founder
> authorization, even when authorized to modify other repository files.
>
> Rationale: this RULE protects the patent-implementation evidence trail per
> ADR-0020 two-register IP discipline against rogue-engineer or rogue-AI
> substrate modifications that could erode the substrate-state coherence the
> patent-holder substrate depends on. RULES + ADRs constitute the
> authorization-tier substrate of the codebase; modifications to that substrate
> require the same authorization tier as substrate creation.
>
> See ADR-0027 for the decision lineage.

**The AI-alignment discipline** (the corollary RULE 20 + the substrate-honest
RULES already establish): an AI assistant operating in this repo (a) MUST NOT
modify RULES or ADRs without explicit Founder authorization; (b) MUST surface a
RULE/ADR-modification proposal as a substrate-state observation per RULE 13
rather than executing it; (c) MUST cite RULE 20 when declining to make such a
modification; (d) MAY draft a *proposed* RULE/ADR amendment for the Founder's
review (drafting is not modifying — the Founder's authorization is the act that
lands it). This is the same shape the substrate-honest pre-flight discipline
already enforces: surface, don't silently patch — extended from operational-tier
drift to authorization-tier modification.

**The contributor-governance discipline**: a pull request proposing a RULE/ADR
modification (a) must explicitly cite RULE 20 in the PR description; (b) must
surface the proposed modification for explicit Founder authorization before
merge; (c) Founder-authorization of such a PR is a substrate-state action — the
Founder reads the proposal as a change to the governing substrate, not as a
routine merge.

**The onboarding surface**: `docs/contributing/onboarding-for-engineers.md`
(NEW) onboards new *human* engineers — distinct from `docs/contributing/onboarding.md`,
which onboards *AI-tool sessions* (Claude Code, Codex, Cursor, ChatGPT). The
human-engineer doc canonicalizes the substrate-honest pre-flight discipline,
RULE 20 in practice, the substrate-state observation discipline (with the
21-catch arc as the worked example), the ADR-0020 patent-implementation-evidence
framing, and the recommended reading order.

## Implementation Detail

- **RULE 20** lands in `CLAUDE.md` §3 at the end of the RULE list — after RULE
  19's "See ADR-0020 for the decision lineage…" paragraph, before
  `## 4. Architectural Vocabulary`. RULE 11 stays vacant; RULE 20 is the
  twentieth RULE (0-10 + 12-20).
- **The `CLAUDE.md` preamble + §3-intro RULE-count reconciliation** (catch #19):
  the preamble's stale *"the 5 RULES added in Section 12C.0.5 (12-16)"* framing
  is reconciled to *"RULES 12-20 added incrementally since Section 12C.0.5 —
  12-16 in the 12C.0.5 batch; 17 (RAA 12.7), 18 (Gate 9), 19 (ADR-0020), 20
  (ADR-0027) added subsequently"*; the §3-intro carries the same reconciliation.
  The §11 "Adding RULE 17 requires the ADR + bidirectional-citation amendment"
  example stays as-is (illustrative; bumping it would itself be substrate drift).
- **The 26→27 ADR cascade**: `docs/architecture/README.md` ADR catalog (26→27
  ADRs; the `[SEC-CONTRIBUTOR-GOVERNANCE]` marker; the `**ADR-0027**` line);
  `CLAUDE.md` §4 (`the 26 ADRs` → `27`), §5 jump-table (`The 26 ADRs as of …
  \`ceb418f\`` → `27 ADRs as of [SEC-CONTRIBUTOR-GOVERNANCE] \`135fee0\``; the
  `**ADR-0027**` line), §10 (`ADR-0001 through ADR-0026` → `ADR-0027`).
- **The 19→20 RULE cascade** in `docs/contributing/onboarding.md`: "19 RULES
  (0-10 + 12-19; RULE 11 vacant)" → "20 RULES (0-10 + 12-20; RULE 11 vacant)"
  (lines 29, 57, 357); the §3 Step-1 RULE-count-inventory step gains RULE 20.
- **The RULE 14 back-cite**: ADR-0027 cites ADR-0020 (load-bearing — RULE 20
  protects ADR-0020's register-2 evidence trail); `0020-two-register-ip-discipline.md`'s
  "Bidirectional citations (cited from)" block gains an ADR-0027 line. ADR-0026
  is referenced in ADR-0027's prose context (the most-recent ADR; the dual-control
  bundle the rule-modification authority protects) — *not* a load-bearing
  dependency → no ADR-0026 back-cite (the citation-restraint precedent from
  ADR-0026 sub-phase H — only load-bearing ADR↔ADR citations get back-cites;
  cf. ADR-0025 referencing ADR-0018/0011/0015 in prose without back-cites).
- **The H-hash + I-hash cascade** (the post-commit-hash discipline): this commit
  backfills sub-phase H's hash (`135fee0`) into the canonical-record §6 H-entry
  and the `section-12-progress.md` row (the "this commit" placeholders sub-phase
  H left); this commit's own hash (sub-phase I) is backfilled at sub-phase J.
- **The canonical-record §6 + `section-12-progress.md` updates**: §6 marks the
  I-entry ✅ (ADR-0027 + RULE 20 + the onboarding doc); `section-12-progress.md`
  row 33 → "sub-phases A-I landed; J remaining".

## Consequences

**Easier:**
- The authorization-tier substrate (RULES + ADRs) has explicit modification-
  authority protection; a contributor or AI assistant knows the boundary.
- AI assistants have explicit guidance (surface, don't modify; cite RULE 20 when
  declining; drafting ≠ modifying) — the same shape the substrate-honest
  pre-flight discipline already enforces, extended to the authorization tier.
- New human engineers have a dedicated onboarding doc (`onboarding-for-engineers.md`)
  that canonicalizes the substrate-honest discipline + RULE 20 + the
  patent-implementation-evidence framing.
- The patent-implementation evidence trail (per ADR-0020) is protected against
  rogue-modification erosion of the governing substrate.
- The substrate-honest discipline (RULE 12/13/18 + now RULE 20) is canonicalized
  as project culture, not just an emergent practice — the 21-catch arc is the
  worked example new contributors learn from.

**Harder:**
- Every RULE/ADR modification now requires an explicit Founder authorization
  cycle (this is BY DESIGN — the substrate-state coherence is the substantive
  asset; making governing-substrate changes friction-ful is the point).
- Contributors must learn the discipline (which RULE/ADR changes need Founder
  authorization vs. what's ordinary review) — the onboarding doc reduces but
  does not eliminate this cost.
- AI assistants must surface-rather-than-execute on a class of edits they are
  otherwise authorized to make — a deliberate constraint.

## Substrate-State Catches Resolved

The pre-flight for this sub-phase surfaced two catches (RULE 13 / RULE 18),
bringing the Sub-box 2 Phase 1 arc to 21 substrate-state catches:
- **#19** — the `CLAUDE.md` preamble (line 5: *"the 5 RULES added in Section
  12C.0.5 (12-16)"*) + the §3 intro carry stale RULE-count framing: it is
  actually RULES 12-19 (8 added since the 12C.0.5 batch), soon 12-20.
  Reconciled here as part of the RULE-20 amendment.
- **#20** — `docs/contributing/onboarding.md` already exists (the AI-tool-session
  onboarding doc) and references "19 RULES" in three places + a §3 Step-1
  RULE-count-inventory step — a cascade target the initial plan omitted; the
  planned `onboarding-for-engineers.md` is a *new separate* doc for human
  engineers, distinct from `onboarding.md`. Both cascade in this commit.
- **#21** (this ADR's own drafting) — the initial Context-section spec referenced
  named adversarial actors as briefing context; RULE 19 forbids identity-level
  naming (including adversarial actors) in canonical documentation, so the
  Context is written against the abstract threat model ("a modification to the
  authorization tier made outside Founder authorization") with no named actors.

Across sub-phases E (11 catches), F (1), G (1), H (4), I (3): 20 + the #21
RULE-19 drafting catch — the substrate-honest pre-flight discipline operating
at the substrate-state register; all caught before edits landed.

## Forward Queue

- **Sub-phase J — ADR-0028** ("Forward-Substrate: Elixir/BEAM Coordination Layer
  for Capsule Supervision + OtzarComm + DBGI Integration") — the commitment-to-ship
  for the Sub-box 2 Phase 2 Elixir/BEAM coordination layer; the 6 BEAM-compatibility
  patterns in ADR-0026's middleware substrate make the port mechanical. ADR-0028
  will back-cite ADR-0026 (and may reference ADR-0027). This commit's own hash is
  backfilled into the canonical-record §6 I-entry + `section-12-progress.md` at
  sub-phase J per the post-commit-hash discipline.
- **Onboarding-doc evolution as the project grows**: `onboarding.md` (AI-tool
  sessions) and `onboarding-for-engineers.md` (human engineers) are both kept
  substrate-coherent — RULE-count, ADR-count, and discipline references updated
  in lockstep with `CLAUDE.md`.
- **Future RULE additions**: every new RULE requires an ADR per `CLAUDE.md` §11
  (the ADR drafts the change; the same commit lands the ADR + the `CLAUDE.md`
  amendment with a RULE 14 back-cite); RULE 20 itself now governs *who* may make
  such a change (the Founder).
- **Substrate-observation-to-RULE promotion path** (future ADR — likely ADR-0029
  or later): a future ADR may formalize a substrate-observation-to-RULE promotion
  path, recognizing that substrate-honest observations accumulating across
  multiple commits (the kind documented in the ADR "Substrate-State Catches
  Resolved" sections, the canonical-record docs, and
  `docs/contributing/onboarding-for-engineers.md`) may prove beneficial enough at
  the substrate-state register to warrant formal RULE-tier promotion. The
  promotion path itself would require Founder authorization per RULE 20; the
  future ADR would canonicalize the observability + criteria + process. Until
  that ADR lands, RULE 20's authorization-tier-only model is canonical (RULE
  additions/modifications remain Founder-only). RULE 20 carries a matching
  "Forward substrate" paragraph in `CLAUDE.md` §3.

Bidirectional citations (cited from):

- ADR-0020 (Two-Register IP Discipline) — load-bearing: RULE 20 (this ADR's
  decision) exists to protect ADR-0020's Register-2 patent-implementation
  evidence trail against rogue-engineer/rogue-AI modifications of the governing
  substrate (RULES + ADRs). ADR-0020's "(cited from)" block back-cites this ADR.
- Forward: ADR-0028 (sub-phase J — the Elixir/BEAM coordination-layer
  commitment-to-ship) will back-cite this ADR.
- `docs/contributing/onboarding-for-engineers.md` (NEW, this commit) — the
  human-engineer onboarding doc canonicalizes RULE 20 in practice + the
  substrate-honest discipline + the ADR-0020 framing; it cites this ADR as the
  decision lineage.
