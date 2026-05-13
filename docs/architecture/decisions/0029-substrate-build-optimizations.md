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
only. **Substrate placement: CLAUDE.md §7 prose-discipline bullet (Option B),
decided at sub-phase 4 pre-flight (`[SUBSTRATE-BUILD-PROSE-GUIDANCE]`,
`49222ad`).** Rationale: failure-mode-category distinction — RULES 12/13/18 govern
substrate-correctness failures (high blast radius: silent drift, scope
undercount, spec-vs-substrate incoherence); the prose discipline governs
cosmetic-quality failures (low blast radius: recursive phrasing accretion).
Keeping the weight-class boundary clean preserves RULE-list coherence. Lived
experience from sub-phases 2-3 confirmed behavioral tractability — strategy-tier
prose stayed reasonable without RULE-tier enforcement. Lighter cascade (3 files
MOD vs 6-8 files for Option A) preserves sub-phase 5
`[SUBSTRATE-BUILD-ONBOARDING-CASCADE]` scope cleanly (Option A would have
anticipated the onboarding-doc updates sub-phase 5 owns).

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
- **Sub-phase 4 `[SUBSTRATE-BUILD-PROSE-GUIDANCE]`** — CLOSED at `49222ad`.
  Optimization 3 substrate placement resolved to **CLAUDE.md §7 prose-discipline
  bullet (Option B)** per the failure-mode-category distinction (RULES govern
  substrate-correctness; the prose discipline governs cosmetic-quality), the
  lived-experience evidence from sub-phases 2-3, and the lighter-cascade
  preservation of sub-phase 5's scope.
- **Sub-phase 5 `[SUBSTRATE-BUILD-ONBOARDING-CASCADE]`** — CLOSED at this
  commit. Onboarding-doc cascade (onboarding.md §6 + onboarding-for-engineers.md
  §1 + §6) gains references to `scripts/preflight/cascade-grep.sh` +
  `docs/contributing/templates/` + the CLAUDE.md §7 prose-discipline bullet.
  Sub-phase-4 hash `49222ad` backfilled into the 4 placeholder sites (3 in this
  ADR — Decision § lines 98-99 line-wrapped, Forward Queue line 182,
  Bidirectional citations line 237; 1 in `docs/contributing/templates/README.md`
  line 131) — the first completed worked example of
  `POST-COMMIT-HASH-CASCADE.template.md`'s mid-arc backfill pattern. Catch
  #1b from sub-phase 3 resolved (`docs/contributing/README.md` line 99 stale
  `decisions/0001-0010` reference); catch #2 from sub-phase 5 pre-flight
  resolved (`docs/contributing/onboarding-for-engineers.md` 3 sites of stale
  "27 ADRs" → "29 ADRs"). `docs/reference/section-12-progress.md` gains a
  SUBSTRATE-BUILD-OPTIMIZATIONS arc-closure row with permanent "this commit"
  placeholder per sub-phase J Decision 3 precedent. **The 5-commit
  SUBSTRATE-BUILD-OPTIMIZATIONS arc is CLOSED** (`ba78216` → `37e4bcc` →
  `9f0514b` → `49222ad` → this commit).
- **ADR-0030 — LANDED** at Block B sub-phase 1 `[BEAM-PHASE-2-ADR]`; documents
  the Phase 2 implementation (mix umbrella + COSMP router + DBGI supervisor +
  three-language stack canonicalization). The original Forward-Queue framing
  ("Potential ADR-0030 — if Sub-box 2 Phase 2 surfaces new substrate-build
  patterns, a follow-up ADR formalizes them") was reframed at sub-phase 1
  (catch #2; see ADR-0030 Substrate-State Catches Resolved §). If new
  substrate-build patterns emerge from Phase 2 work (a dual-runtime cascade
  convention; an Elixir-tier pre-flight discipline), they'd land in ADR-0031+.

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

Sub-phase 5: **3 catches surfaced at pre-flight, all resolved in-commit (arc-closure
substrate observation).**

- **Catch #1 — script-tier limitation (`cascade-grep.sh` markdown line-wrap).**
  The `hash` subcommand's regex `this commit` is line-bounded; markdown-wrapped
  placeholders at 80-character boundaries are missed. ADR-0029 lines 98-99 had
  "this\ncommit" wrapped across two lines and the regex failed to surface it.
  Tool surfaced 3 of 4 sub-phase-4 placeholders mechanically; the line-wrap
  target required manual surfacing (operator discipline caught the 4th).
  **Not a sub-phase-5 blocker** — manually backfilled. Surfaced as a
  substrate-state observation for future improvement: a follow-up substrate-build
  commit could add `pcre2grep -M` multiline mode or a markdown-wrapping
  pre-collapse pass; potentially feeds ADR-0030 if Sub-box 2 Phase 2's
  Elixir/BEAM mini-arc surfaces additional substrate-build patterns. Tool earns
  its place — 75% mechanical surfacing is substantial token-cost reduction even
  at this regex fidelity.

  **Block A follow-up — RESOLVED at this commit.** The `cascade-grep.sh hash`
  subcommand gains multiline-aware behavior via an `awk` pre-collapse pass that
  joins consecutive non-empty lines into single-line paragraphs before regex
  matching. Substrate-state observation surfaced at Block A pre-flight:
  `pcre2grep -M` and `ripgrep -U` (the obvious multiline-grep tools) are
  unavailable on the operator's Intel Mac BSD grep substrate (BSD grep
  2.6.0-FreeBSD; `grep -P` returns `invalid option`); the awk pre-collapse
  approach is the POSIX-portable feasible implementation — not a preference
  choice, a substrate-state constraint. Canary 4 added to `--self-test`:
  asserts multiline-aware detection of the line-wrapped `this commit` permanent
  placeholder at ADR-0029 line 188-189 (the sub-phase 5 arc-closure placeholder
  per sub-phase J Decision 3 — stable across future arcs, won't be backfilled).
  The cascade-grep tool now mechanically surfaces line-wrapped placeholders
  (75% → ~100% improvement from Block A); operator discipline remains the
  safety net for cases neither line-bounded nor markdown-paragraph-bounded
  grep can catch. Output format note: multiline-aware results show the
  paragraph's `start_line`, not the exact match line — for wrapped paragraphs
  the reviewer reads from `start_line` to find the matched placeholder.
- **Catch #2 — pre-existing drift in `docs/contributing/onboarding-for-engineers.md`.**
  Three sites of stale "27 ADRs" at 29 ADRs canonical: line 53 (§2 title),
  line 67 (the ADRs catalog citation), line 183 (the Recommended Reading Order
  ADR-catalog citation). Resolved in this commit via Q-C:A (the file was being
  MOD-ed anyway per the onboarding cascade; substrate-coherent to bring to
  current).
- **Catch #1b from sub-phase 3 — deferred-then-resolved.**
  `docs/contributing/README.md` line 99 stale `decisions/0001-0010` reference
  at 29 ADRs canonical, surfaced at sub-phase 3 pre-flight, deferred there per
  scope-boundary discipline. Resolved in this commit via Q-A:A (the contributing-
  docs neighborhood was being touched per the onboarding cascade; coherent
  venue; 1-line fix).

**Arc-closure tally:** 4 distinct catches across the 5-commit
SUBSTRATE-BUILD-OPTIMIZATIONS arc (sub-phase 3 surfaced catch #1 + catch #1b;
sub-phase 5 surfaced catch #1 [script-tier] + catch #2 + catch #1b-resolution).
All resolved in-arc; zero broken commits on origin/main. The discipline-converges
observation holds: the cascade landscape becomes familiar; new catches surface
in narrower categories (pre-existing drift, tool-tier limitation) rather than
substantive-engineering-tier failures. 54-consecutive-commit substrate-honest
pre-flight verification pattern operational (55 after this commit lands).

Sub-phase 4: **zero new catches at pre-flight.** The cascade landscape for both
Q-A options (Option A: RULE 21 + full RULE-cascade; Option B: §7 bullet + light
cascade) was grep-clean — `cascade-grep.sh rule 21` returned only forward-references
in `docs/contributing/templates/README.md` and this ADR; no false positives. The
substrate text was already drafted (this ADR's Decision § had the verbatim
content); the placement targets were concrete. The discipline-converges
observation holds across 4 sub-phases of this arc — 1 pre-existing drift
surfaced at sub-phase 3 (catch #1: `docs/contributing/README.md` Reading Order
+ Files lists stale-missing `onboarding.md` + `onboarding-for-engineers.md`,
resolved same commit via Q-A:A-full); 1 additional pre-existing drift surfaced
inline for awareness at sub-phase 3 (catch #1b: `docs/contributing/README.md`
line 81 references `decisions/0001-0010`, stale at 29 ADRs canonical; deferred
to sub-phase 5 or a follow-up); zero new catches across sub-phases 1, 2, 4.
52-consecutive-commit substrate-honest pre-flight verification pattern
operational (53 after this lands).

Bidirectional citations (cited from):

- ADR-0028 (Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule
  Supervision + OtzarComm + DBGI Integration; landed at sub-phase J
  `[SEC-BEAM-FORWARD-SUBSTRATE]`) — forward-queued this ADR in its
  "Substrate-build optimizations" Forward-Queue bullet; load-bearing (this ADR
  fulfills that forward-queue commitment). ADR-0028's "(cited from)" block
  back-cites this ADR.
- CLAUDE.md §7 (Operating in This Repo; the prose-discipline bullet — landed at
  sub-phase 4 `[SUBSTRATE-BUILD-PROSE-GUIDANCE]`, `49222ad`) — load-bearing
  citation: the §7 bullet is the substrate placement of Optimization 3 resolved
  at sub-phase 4. The bullet cites this ADR as `ADR-0029 Optimization 3`; the
  citation graph closes across the §3 RULES / §7 guidance boundary.
- ADR-0020 (Two-Register IP Discipline) — referenced in this ADR's Context for
  the patent-implementation-record framing the substrate-honest discipline serves;
  prose-mention, not a load-bearing dependency → no formal "(cited from)" back-cite
  (the citation-restraint precedent).
