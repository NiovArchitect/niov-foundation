# ADR-0029: Substrate-Build Optimizations: Cascade-Inventory Scripts + Commit-Class Templates + Strategy-Tier Prose Discipline

**Status**: Active
**Date**: 2026-05-12
**Trigger**: Sub-box 2 Phase 1 closed at sub-phase J (`88eb4d6`) with the
10-commit dual-control arc canonical on `origin/main`. The arc surfaced 26
substrate-honest catches across sub-phases E/F/G/H/I/J — every one caught at
pre-flight or pre-edit; zero broken commits. ADR-0028's Forward Queue committed
to three substrate-build optimizations addressing the catch patterns + the
token-cost dimension of the discipline. This ADR formalizes those three
optimizations as decisions; sub-phases 2-5 of the SUBSTRATE-BUILD-OPTIMIZATIONS
arc implement them.

## Context

The 26-catch arc demonstrates the substrate-honest pre-flight discipline (RULE
12 — pre-flight grep; RULE 13 — surface drifts; RULE 18 — verify operation type
+ all files referencing the substrate) works at the engineering tier: every
catch surfaced before any edit chained, and `origin/main` carries zero broken
commits across the arc. The discipline is the asset — it is exactly what makes
the patent-implementation record (ADR-0020 Register 2) robust, and ADR-0027 +
RULE 20 canonicalize its authorization-tier protection.

But surfacing, deciding, and resolving each catch costs tokens — roughly a
couple thousand per catch on average across the arc, a meaningful fraction of
the arc's total session cost. Three patterns recurred:

- **Scope-undercount catches** — 7 of the 26 (#14 the `section-12-progress.md`
  path; #15 the RULE-14 back-cite cascade; #16 the canonical-record §4+§6+§8+line19
  cascade scope; #20 the existing `onboarding.md` "19 RULES" cascade target; #22
  the CLAUDE.md §5 ADR-0026-line arc-hash chain; #24 the canonical-record cascade
  scope at sub-phase J; #25 the same arc-hash-chain pattern recurring). Every one
  was a cascade target the *planned* scope missed but a *grep* would have surfaced:
  invisible to recall, visible to a pattern search.
- **Cascade-scope misjudgment** — the planning-tier subset of the above: multi-section
  docs (the canonical-record's §4+§6+§8+line19; CLAUDE.md's preamble + §3-intro + §5
  + §10 + §11), the post-commit-hash cascade (canonical-record §6 + `section-12-progress.md`
  row + the CLAUDE.md §5 arc-hash chain). These are *standard* cascade scopes for
  their commit class — reconstructed by recall each time rather than captured by
  template.
- **Recursive-prose bloat at the strategy tier** — register-canonical phrasing
  ("substrate-state-observation register canonical at the substrate-state register")
  accreted across authorization-tier responses with no substrate value, materially
  inflating token cost without improving substrate clarity.

The optimization frame is **token cost vs build risk**, not catch elimination.
Catches are the discipline working; the goal is reducing their friction — surface
the cascade landscape mechanically rather than by recall, capture standard cascade
scopes by template, and keep authorization-tier prose plain (while the
engineering-tier pre-flight discipline stays full-fidelity — that is where the
substrate-honesty lives and it does not get trimmed).

## Decision

NIOV Labs commits to three substrate-build optimizations, implemented across
sub-phases 2-5 of the SUBSTRATE-BUILD-OPTIMIZATIONS arc:

**Optimization 1 — Automated cascade-target inventory** (sub-phase 2). Pre-flight
scripts at `scripts/preflight/` that grep the repo for substrate-state patterns
and surface the full cascade landscape *before* authorization, pre-empting
scope-undercount. Specification (the canonical shape; the sub-phase-2 pre-flight
fixes the exact CLI):
- `scripts/preflight/cascade-grep.sh <N> <kind>` greps `docs/`, `CLAUDE.md`,
  `AGENTS.md` for, by kind:
  - **ADR cascade**: `<N> ADRs` / `the <N> ADRs` / `ADR-00<N>` / `ADR-0001 through ADR-00<N>` / `[<bracket>]` markers in ADR-catalog headers.
  - **RULE cascade**: `RULE <N>` / `<N> RULES` / `RULES 12-<N>` / preamble + §3-intro RULE-count phrasings.
  - **Post-commit-hash cascade**: `this commit` / `forward: ADR-<N>` / `sub-phase X forward` / `<bracket> forward` / arc-hash chains.
- Output: `file:line — matched pattern`; the pre-flight reviewer (Claude Code or
  the operator) inspects each match and confirms it is either in the planned
  cascade or deliberately out of scope, before authorizing edits. The script is
  *advisory* — it surfaces; the reviewer decides. It does not replace the RULE
  12/13/18 discipline; it feeds it.

**Optimization 2 — Commit-class templates** (sub-phase 3). Standard scaffolds at
`docs/contributing/templates/`, one per commit class, that enumerate the standard
cascade scope by template rather than by recall. Three initial templates (more
added as the substrate evolves):
- `NEW-ADR.template.md` — the ADR structure (Status / Date / Trigger; the `## `
  sections; the Bidirectional-citations block) + the standard ADR-landing cascade
  (README ADR catalog count + marker + entry; CLAUDE.md §4 count + §5 header count
  + §5 jump-table entry + §10 count; any load-bearing back-cite — the cited ADR's
  "(cited from)" block).
- `NEW-RULE.template.md` — the CLAUDE.md §3 RULE placement + the preamble + §3-intro
  RULE-count update + the `onboarding.md` "N RULES" cascade + the `onboarding-for-engineers.md`
  reference + the linked ADR (per CLAUDE.md §11 — every new RULE requires an ADR;
  RULE 20 — Founder authorization).
- `POST-COMMIT-HASH-CASCADE.template.md` — the canonical-record §6 arc-list entry
  + the `section-12-progress.md` row + the CLAUDE.md §5 arc-hash chain (the
  "this commit" placeholder convention; when to backfill vs leave permanent).

**Optimization 3 — Strategy-tier prose discipline** (sub-phase 4). Plain language
at the authorization tier — where Claude Code speaks to the operator about
engineering decisions. Drop the recursive register-canonical phrasing; state the
substrate-state observation directly. The substrate-honest pre-flight discipline
at the *engineering* tier (the pre-flight reports, the catch surfacings, the
commit bodies) stays full-fidelity — this addresses authorization-tier prose
only. **Substrate placement is deferred to the sub-phase-4 pre-flight**: a new
RULE (RULE 21 — same shape as RULE 12/13/18, citable, keeps the discipline-set
coherent) versus a non-RULE CLAUDE.md §-guidance subsection (a "new pointer /
clarification" minor amendment). Both preserve the substantive substrate; the
choice benefits from lived experience after sub-phases 2-3 land — by then the
session work will have shown whether the discipline reads better as a numbered
RULE or as operating guidance. (If RULE 21: per CLAUDE.md §11 the sub-phase-4
commit lands the RULE-21 amendment + a RULE-14 back-cite to this ADR, under
Founder authorization per RULE 20.)

**Sub-phase 5 — Onboarding cascade**. `onboarding.md` (AI-tool sessions) and
`onboarding-for-engineers.md` (human engineers) gain references to the new
substrate: the `scripts/preflight/` cascade-grep scripts, the
`docs/contributing/templates/` commit-class scaffolds, and the strategy-tier
prose discipline per sub-phase 4's resolution.

## Implementation Detail

- **Sub-phase 2 `[SUBSTRATE-BUILD-INVENTORY-SCRIPTS]`** — `scripts/preflight/cascade-grep.sh`
  + a thin wrapper for the common pre-flight invocations + a `scripts/preflight/README.md`
  usage note. Integration-style self-tests (the script produces the expected
  match set against the current repo state) if the logic warrants them — likely a
  small smoke test rather than a unit suite (the script is grep composition, not
  business logic). No `apps/api/src` impact → RULE 16 trivially N/A; the script is
  shell, not TypeScript → TS baseline trivially preserved.
- **Sub-phase 3 `[SUBSTRATE-BUILD-COMMIT-TEMPLATES]`** — `docs/contributing/templates/NEW-ADR.template.md`
  + `NEW-RULE.template.md` + `POST-COMMIT-HASH-CASCADE.template.md` +
  `docs/contributing/templates/README.md` (when to use which; the templates are
  scaffolds, not enforcement — the reviewer still verifies). Doc-tier; cascades the
  `docs/contributing/README.md` reading-order list.
- **Sub-phase 4 `[SUBSTRATE-BUILD-PROSE-GUIDANCE]`** — the substrate-placement
  decision (RULE 21 or CLAUDE.md §-guidance) made at the sub-phase-4 pre-flight; the
  substrate text itself (~50-100 lines: the discipline statement, the
  authorization-tier-vs-engineering-tier distinction, the examples). If RULE 21: the
  full RULE-21 amendment cascade (CLAUDE.md §3 + preamble + §3-intro RULE-count +
  `onboarding.md` + `onboarding-for-engineers.md` + the RULE-14 back-cite to this
  ADR) per CLAUDE.md §11 + RULE 20.
- **Sub-phase 5 `[SUBSTRATE-BUILD-ONBOARDING-CASCADE]`** — `onboarding.md` gains a
  "pre-flight tooling" pointer (the cascade-grep scripts + the commit-class
  templates); `onboarding-for-engineers.md` gains the same pointer + the
  strategy-tier prose discipline per sub-phase 4. Doc-tier.

## Consequences

**Easier:**
- The cascade landscape is surfaced mechanically (a script run) rather than
  reconstructed by recall — the scope-undercount catch pattern is pre-empted at
  pre-flight rather than caught after the plan is drafted.
- Phase 2 (the Elixir/BEAM mini-arc per ADR-0028) executes faster — the scripts +
  templates carry the cascade-scope knowledge that this arc accumulated by hand.
- Commit-class templates eliminate per-commit cascade-scope reconstruction — a
  "NEW ADR" commit starts from the template's enumerated cascade, not from
  memory.
- Strategy-tier prose discipline reduces authorization-tier token cost — the
  per-response register-canonical accretion is dropped; the substrate-state
  observation is stated directly.
- The substrate-honest pre-flight discipline at the engineering tier is unchanged
  — full-fidelity pre-flight reports, catch surfacings, and commit bodies; the
  optimization trims the *authorization-tier prose around* the discipline, not the
  discipline itself.

**Harder:**
- The scripts need maintenance as the substrate evolves — a new RULE-count
  phrasing, a new ADR cascade convention, a new commit class all require a script
  update; a stale script that misses a pattern is worse than no script (false
  confidence). The sub-phase-2 implementation includes the script's own
  "verify-against-current-repo-state" self-test for exactly this.
- Templates need updating per new commit class — the three initial templates
  cover the common cases; an unusual commit (a multi-RULE amendment, a
  schema-change cascade) still needs hand-scoping until a template exists for it.
- The prose discipline is a *behavioral* constraint sessions must internalize —
  unlike CLAUDE.md/ADR substrate, it is not enforced by a hook; it is a habit (or,
  if RULE 21, a RULE the session reads on open).
- Each implementation sub-phase (2-5) has its own pre-flight + cascade cost — the
  arc pays four small upfront costs to reduce a larger recurring one.

## Forward Queue

- **Sub-phase 2 `[SUBSTRATE-BUILD-INVENTORY-SCRIPTS]`** — `scripts/preflight/cascade-grep.sh`
  + wrapper + `scripts/preflight/README.md` + smoke test.
- **Sub-phase 3 `[SUBSTRATE-BUILD-COMMIT-TEMPLATES]`** — the 3 commit-class templates
  + `docs/contributing/templates/README.md`.
- **Sub-phase 4 `[SUBSTRATE-BUILD-PROSE-GUIDANCE]`** — the substrate-placement decision
  (RULE 21 vs §-guidance) + the substrate text + (if RULE 21) the RULE-21 amendment
  cascade.
- **Sub-phase 5 `[SUBSTRATE-BUILD-ONBOARDING-CASCADE]`** — the onboarding-doc updates.
- **Potential ADR-0030** — if Sub-box 2 Phase 2 (the Elixir/BEAM mini-arc) surfaces
  new substrate-build patterns (a dual-runtime cascade convention; an Elixir-tier
  pre-flight discipline), a follow-up ADR formalizes them.

## Substrate-State Catches Resolved

Sub-phase 1: **none new.** The pre-flight verified the cascade landscape clean —
the 4-file scope (1 NEW + 3 MOD) the plan named matched the actual cascade
exactly; the CLAUDE.md §5 ADR-0028 line carried no "this commit"/arc-hash-chain
placeholder needing update; AGENTS.md carried no ADR-count reference; no anchor
test asserts on the ADR count. This is itself a substrate-state observation worth
marking: **the discipline converges toward fewer catches as the cascade landscape
becomes familiar.** The substantive engineering arc (sub-phases E-J) surfaced 26
catches across genuinely-novel substrate (the EscalationRequest model, the
middleware, the route bindings, the ADR/RULE cascades); the documentation-tier
follow-up arc's first sub-phase surfaces zero — the cascade patterns are now
known, and the substrate-build optimizations in this ADR aim to reduce friction
on the catches that do still surface in future *engineering* arcs (where the
substrate is novel and the cascade scope is genuinely uncertain).

Bidirectional citations (cited from):

- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule
  Supervision + OtzarComm + DBGI Integration; landed at sub-phase J
  `[SEC-BEAM-FORWARD-SUBSTRATE]`) — forward-queued this ADR in its
  "Substrate-build optimizations" Forward-Queue bullet; load-bearing (this ADR
  fulfills that forward-queue commitment). ADR-0028's "(cited from)" block
  back-cites this ADR.
- ADR-0020 (Two-Register IP Discipline) — referenced in this ADR's Context for
  the patent-implementation-record framing the substrate-honest discipline serves;
  prose-mention, not a load-bearing dependency → no formal "(cited from)" back-cite
  (the citation-restraint precedent).
