# Pre-flight Substrate-Build Scripts

Cascade-target inventory scripts that surface the full cascade landscape before
authorization. Implements **Optimization 1** from ADR-0029 (Substrate-Build
Optimizations: Cascade-Inventory Scripts + Commit-Class Templates +
Strategy-Tier Prose Discipline).

## Why this exists

The Sub-box 2 Phase 1 dual-control arc (sub-phases A→J) surfaced **26
substrate-honest catches** at pre-flight or pre-edit — every one caught before
edits chained. **7 of those 26** (≈27% of the arc) were *scope-undercount*
catches: a cascade target the *planned scope* missed but a *grep* would have
surfaced. Invisible to recall; visible to pattern search.

This script mechanizes the grep so the reviewer (operator or Claude Code) sees
the full cascade landscape *before* drafting edits. It is **advisory**: it
surfaces matches; the reviewer confirms each match is in the planned cascade or
deliberately out of scope. It does **not** replace:

- **RULE 12** (pre-flight grep) — read the cited files; verify the cited config.
- **RULE 13** (surface drifts) — when pre-flight finds a mismatch between plan
  and substrate, surface it in the report, request resolution.
- **RULE 18** (verify operation type / substrate-state) — including the
  RULE-18 extension that emerged from sub-phase F catch #12: verify *all*
  existing files that reference the substrate being modified, not just the
  substrate itself.

It feeds them.

## When to invoke

Pre-flight tier — before drafting edits for any commit that:

- **Adds or removes an ADR** → `scripts/preflight/cascade-grep.sh adr <N>`
- **Adds or modifies a RULE** → `scripts/preflight/cascade-grep.sh rule <N>`
- **Has a post-commit-hash cascade** (a previous commit's hash needs to
  cascade into existing `this commit` placeholders or an arc-hash chain) →
  `scripts/preflight/cascade-grep.sh hash`
- **Lands a new ADR that may affect RULE counts and may have hash cascade** →
  `scripts/preflight/cascade-grep.sh all <N>`

The reviewer then walks the output: each match is either part of the planned
cascade (✓ in scope) or deliberately out of scope (✓ noted) or a missed
cascade target (✗ surface per RULE 13). Empty output for a subcommand is
itself a substrate-state observation — the pattern is absent from the canonical
surfaces.

## Usage

```bash
# ADR cascade for ADR-0029 (29 ADRs canonical)
scripts/preflight/cascade-grep.sh adr 29
# Surfaces: "29 ADRs" / "the 29 ADRs" / "ADR-0029" / "ADR-0001 through ADR-0029"
# in docs/ + CLAUDE.md + AGENTS.md.

# RULE cascade for RULE 20 (20 RULES canonical)
scripts/preflight/cascade-grep.sh rule 20
# Surfaces: "RULE 20" / "20 RULES" / "RULES 12-20" + preamble + §3-intro
# RULE-count phrasings.

# Post-commit-hash placeholders + arc-hash chains
scripts/preflight/cascade-grep.sh hash
# Surfaces: "this commit" / "forward: ADR-N" / "sub-phase X forward" /
# multi-hash arc-chain lines.

# All three at once (typical for a new-ADR landing that also touches RULE counts)
scripts/preflight/cascade-grep.sh all 29

# Canary self-test (runs against current repo state)
scripts/preflight/cascade-grep.sh --self-test

# Help
scripts/preflight/cascade-grep.sh --help
```

Output is `file:line: matched-pattern` — one match per line; greppable; pipeable
into `less` or `awk` for filtering. The script always exits 0 (advisory; no fail
mode), except `--self-test`, which exits 1 on a canary assertion failure.

## `--self-test`

The self-test runs canary assertions against the current repo state. The
canaries are substrate-state invariants at HEAD:

1. **ADR-0029 references exist** in `CLAUDE.md` + `docs/architecture/README.md`.
2. **RULE 20 / 20 RULES references exist** in `CLAUDE.md` + `docs/contributing/onboarding.md`.
3. **`this commit` placeholders exist** in the canonical-record §6 J-entry +
   `docs/reference/section-12-progress.md` row 33 (per sub-phase J Decision 3 —
   the permanent J-hash placeholders that keep the dual-control arc at exactly
   10 commits).

A self-test failure means either:

- **(a) the script's regex drifted** from the substrate — fix the regex; or
- **(b) the substrate drifted** from the canonical state — surface per RULE 13.

Either way it is a substrate-state observation worth surfacing. The self-test
is intentionally narrow (3 canaries) — broad enough to catch a script bug
across the three subcommands; not a substitute for human review.

## How to extend

A new cascade pattern → three coordinated edits:

1. **Add a `case` arm** in the dispatcher at the bottom of `cascade-grep.sh`.
2. **Add a `grep_<kind>` function** that runs `cascade_grep "<pattern>"`. Keep
   patterns pure-grep (no external dependencies beyond `grep` / `find` / `awk`);
   keep the search paths to `SEARCH_PATHS` (or extend it deliberately, with a
   comment justifying the widening).
3. **Add a `--self-test` canary** for the new pattern if it represents a
   substrate-state invariant at HEAD.

Document the new subcommand in `usage()` + in this README.

## Lineage

ADR-0029 (the decision document) → this implementation (sub-phase 2 of the
SUBSTRATE-BUILD-OPTIMIZATIONS arc: `[SUBSTRATE-BUILD-INVENTORY-SCRIPTS]`). The
dual-control arc (`[SEC-DUAL-CONTROL-*]` / `[SEC-CONTRIBUTOR-GOVERNANCE]` /
`[SEC-BEAM-FORWARD-SUBSTRATE]`, commits `b34c5cf` through `88eb4d6`) is the
worked example the catch patterns came from.

Sub-phases 3-5 of the SUBSTRATE-BUILD-OPTIMIZATIONS arc add:

- `[SUBSTRATE-BUILD-COMMIT-TEMPLATES]` — `docs/contributing/templates/` commit-class scaffolds.
- `[SUBSTRATE-BUILD-PROSE-GUIDANCE]` — strategy-tier prose discipline (RULE 21 vs §-guidance, decided at the sub-phase-4 pre-flight).
- `[SUBSTRATE-BUILD-ONBOARDING-CASCADE]` — `onboarding.md` + `onboarding-for-engineers.md` references.
