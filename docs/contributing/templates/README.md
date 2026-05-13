# Commit-Class Templates

Copy-paste-and-fill scaffolds for the recurring commit classes the
Foundation build cycle produces. Implements **Optimization 2** from
ADR-0029 (Substrate-Build Optimizations: Cascade-Inventory Scripts +
Commit-Class Templates + Strategy-Tier Prose Discipline).

## Why this exists

The Sub-box 2 Phase 1 dual-control arc (sub-phases A→J, `b34c5cf` →
`88eb4d6`) surfaced **26 substrate-honest catches** at pre-flight or
pre-edit — every one caught before edits chained. A meaningful fraction
were **cascade-scope misjudgment** catches: the planning tier
reconstructed the cascade scope by recall (per-arc, per-sub-phase), and
recall missed cascade surfaces that pattern-search would have
surfaced. Templates fix that by **enumerating the standard cascade
scope by commit class** rather than by recall.

The templates are scaffolds, not enforcement. They feed the discipline:

- **RULE 12** (pre-flight grep) — read the cited files; verify the
  cited config; the template tells you *what* to read.
- **RULE 13** (surface drifts) — when the template's enumerated
  cascade doesn't match actual repo state, surface the drift.
- **RULE 18** (verify operation type / substrate-state) — the
  template's enumerated cascade is the *minimum*; novel commits
  may surface additional targets the template doesn't pre-enumerate.

## Templates in this directory

| Commit class | Template | Cascade-grep subcommand |
| --- | --- | --- |
| Adding an ADR | `NEW-ADR.template.md` | `cascade-grep.sh adr {N}` |
| Adding a RULE (Founder-authorized per RULE 20) | `NEW-RULE.template.md` | `cascade-grep.sh rule {N}` |
| Backfilling a sub-phase X's hash into prior `this commit` placeholders | `POST-COMMIT-HASH-CASCADE.template.md` | `cascade-grep.sh hash` |

## How to use a template

1. **Identify the commit class.** Adding an ADR? Use `NEW-ADR.template.md`.
   Adding a RULE? Use `NEW-RULE.template.md` (and confirm RULE 20
   authorization). Backfilling a prior sub-phase's hash? Use
   `POST-COMMIT-HASH-CASCADE.template.md`.
2. **Read the template top to bottom.** The placeholder-field block at
   the top lists every literal placeholder (`{N}`, `{NNNN}`,
   `{bracket}`, `{short-hash}`, `{title}`, …) that the template uses.
3. **Run the cascade-grep verification** (the bottom of each template
   names the subcommand). The output surfaces the actual cascade
   landscape from the repo at this moment.
4. **Walk the template's checklist against the cascade-grep output.**
   Each item is either part of the planned cascade (✓ in scope) or
   deliberately out of scope (✓ noted with reason) or a missed
   cascade target (✗ surface per RULE 13).
5. **Draft the commit body using the cascade as scope.** The pre-flight
   surface lists which files the commit touches; the cascade-grep
   output anchors the file inventory in observed substrate.

## Minimum-not-exhaustive framing

Each template enumerates the **minimum** cascade scope based on
historical patterns. Novel commits may have additional cascade
targets the template doesn't pre-enumerate — for example, an ADR that
adds a new architectural anchor cascades into
`docs/reference/architectural-anchors.md`; a RULE that introduces a
new pre-commit-hook check cascades into `.husky/pre-commit`. The
templates are scaffolds against the typical case; the cascade-grep
tool and RULE 12 pre-flight grep are the authoritative verifications.

## Relationship to `scripts/preflight/cascade-grep.sh`

The templates and the cascade-grep script are **complements**:

- **Templates enumerate** the expected cascade scope by commit class
  (recall-shaped: "for a new ADR, the cascade targets are X, Y, Z").
- **Cascade-grep verifies** the cascade against actual repo state
  (grep-shaped: "the repo currently contains references to ADR-N at
  these lines"). Empty output is itself a substrate-state observation.

Together they let the reviewer cross-check expected vs actual cascade
scope before authorizing edits. Neither alone is sufficient:

- Templates alone risk stale enumerations as the substrate evolves.
- Cascade-grep alone surfaces matches without the "what should be here"
  context the template provides.

## How to extend

A new recurring commit class → a new template + an update to this README.

1. **Identify the commit class.** A pattern that recurs across the
   build cycle and has a well-defined cascade scope (the bar is
   "appears in 3+ commits with the same cascade shape"). Examples that
   *do not* meet the bar: one-off cleanups, single-file edits, ad-hoc
   substrate doc tweaks.
2. **Draft the template.** Use the existing three templates as
   structural references. Each template has: a `Why this exists` /
   `When this template applies` block; a placeholder-field list; the
   substantive body (file scaffolds, structure, etc.); a standard
   cascade checklist; a verification block naming the cascade-grep
   subcommand; a `Minimum-not-exhaustive disclaimer`; a `Lineage`
   block citing ADR-0029 + the worked example.
3. **Update this README's table.** Add a row to the "Templates in this
   directory" table linking the new template + its cascade-grep
   subcommand (if a new subcommand is needed, add it to
   `scripts/preflight/cascade-grep.sh` per its own How-to-extend block
   first).
4. **Cite ADR-0029** in the template's Lineage block. New templates
   are extensions of ADR-0029's Optimization 2; the citation closes the
   substrate graph.

## Lineage

ADR-0029 (Substrate-Build Optimizations: Cascade-Inventory Scripts +
Commit-Class Templates + Strategy-Tier Prose Discipline) — this
directory implements Optimization 2 of three. ADR-0028
(`[SEC-BEAM-FORWARD-SUBSTRATE]`) forward-queued this directory in its
"Substrate-build optimizations" Forward-Queue bullet; sub-phase 3 of
the SUBSTRATE-BUILD-OPTIMIZATIONS arc (`[SUBSTRATE-BUILD-COMMIT-TEMPLATES]`)
lands the templates.

The dual-control arc (`[SEC-DUAL-CONTROL-*]`,
`[SEC-CONTRIBUTOR-GOVERNANCE]`, `[SEC-BEAM-FORWARD-SUBSTRATE]`,
commits `b34c5cf`→`88eb4d6`) is the worked example the cascade
patterns came from — 26 catches across the arc, every one caught
before edits chained, with the cascade-scope-misjudgment catches
being the specific pattern these templates pre-empt.

Sub-phases 4-5 of the SUBSTRATE-BUILD-OPTIMIZATIONS arc add:

- `[SUBSTRATE-BUILD-PROSE-GUIDANCE]` — strategy-tier prose discipline
  (CLAUDE.md §7 bullet per ADR-0029 Optimization 3, decided at
  sub-phase 4 → this commit).
- `[SUBSTRATE-BUILD-ONBOARDING-CASCADE]` — `onboarding.md` +
  `onboarding-for-engineers.md` references to the templates and
  cascade-grep tool.
