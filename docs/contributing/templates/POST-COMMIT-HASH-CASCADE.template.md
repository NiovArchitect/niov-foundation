# Template: Post-Commit-Hash Cascade

Copy-paste-and-fill scaffold for the post-commit-hash cascade pattern.
Implements **Optimization 2** from ADR-0029 (Substrate-Build
Optimizations: Cascade-Inventory Scripts + Commit-Class Templates +
Strategy-Tier Prose Discipline). This template enumerates the *minimum*
post-commit-hash-cascade scope — verify against actual repo state with
`scripts/preflight/cascade-grep.sh hash` before drafting.

## When this template applies

A multi-sub-phase arc commits a sub-phase X that drops a `this commit`
placeholder into multiple canonical surfaces (canonical-record §6,
section-12-progress, CLAUDE.md §5 jump-table). At sub-phase X+1 (or
later), the prior sub-phase's now-known short hash needs to **backfill**
those placeholders so the substrate is grep-coherent.

The dual-control arc (`[SEC-DUAL-CONTROL-*]`, sub-phases A→J,
`b34c5cf`→`88eb4d6`) is the worked example — each sub-phase B-J's
commit body backfilled the prior sub-phase's `this commit` placeholder
in the canonical-record §6 arc-list and section-12-progress.md row 33.

Sub-phase J (the arc-closure sub-phase) is the exception: per sub-phase
J Decision 3, the J-sub-phase's own `this commit` placeholders stay
**permanent** — never backfilled — because backfilling J's hash into
its own row would change the arc's hash-chain length and obscure the
arc-closure substrate. Permanent placeholders preserve the exact arc
count (10 commits for the dual-control arc).

**Placeholder fields** (replace literally with concrete values):

- `{prior-bracket}` — the bracket name of the sub-phase being backfilled (e.g., `[SEC-CONTRIBUTOR-GOVERNANCE]`)
- `{NEW_BRACKET}` — the bracket name of the current commit (e.g., `[SEC-BEAM-FORWARD-SUBSTRATE]`)
- `{prior-short-hash}` — the prior sub-phase's now-known short hash (e.g., `62d472c`)
- `{Y}` — the prior sub-phase letter (e.g., `I`) or number (e.g., `9`)
- `{Y+1}` — the current sub-phase letter / number
- `{canonical-record-doc}` — the arc's canonical-record filename (e.g., `dual-control-operations-canonical-record.md`)
- `{adr-X}` — the arc's primary ADR (e.g., `ADR-0026`)

---

## Standard post-commit-hash-cascade checklist

Walk this list at pre-flight for any sub-phase X+1 that backfills sub-phase X's hash.

- [ ] **`docs/architecture/{canonical-record-doc}.md` §6** (arc-list):
  - [ ] The prior sub-phase's row: `**X** {prior-bracket}` line — change
    `this commit (hash cascaded at sub-phase {Y+1})` → `` `{prior-short-hash}` (cascaded at sub-phase {Y+1} `{NEW_BRACKET}`) ``
- [ ] **`docs/reference/section-12-progress.md`** — the arc's row (e.g., row 33):
  - [ ] The arc-hash chain in the 3rd column: append `→{prior-short-hash}` to the running hash chain
  - [ ] The body cell's `this commit [{prior-bracket}]` placeholder → `` `{prior-short-hash}` [{prior-bracket}] ``
- [ ] **`CLAUDE.md` §5 jump-table** (if the arc's primary ADR has a hash-chain in its §5 line — the catch #22 / #25 pattern):
  - [ ] The `{adr-X}` line: `sub-phase {Y} forward` → `→{prior-short-hash}; (sub-phase {Y+1} forward)`
  - [ ] OR (for arc-closure): drop the `forward` annotation; the final hash lands inline as part of the closing-marker
- [ ] **`CLAUDE.md` §6 build-cycle section** (if the arc appears in §6 with a sub-phase row):
  - [ ] The sub-phase row: `CLOSED \`{prior-short-hash}\``

## Permanent vs backfilled

| Sub-phase position | Placeholder treatment |
| --- | --- |
| Sub-phase 1 to N-1 (mid-arc) | Backfill at sub-phase {Y+1}: `this commit (hash cascaded at sub-phase {Y+1})` → `` `{prior-short-hash}` `` |
| Sub-phase N (arc-closure) | **Permanent placeholder.** `this commit` stays. Per sub-phase J Decision 3 — backfilling the arc-closure sub-phase's own hash into its own row obscures the arc-count. |

The cascade-grep `hash` subcommand surfaces both. The reviewer distinguishes:

- **Mid-arc `this commit`** — substrate-honest at the time of writing; *will* be backfilled at sub-phase {Y+1}.
- **Arc-closure `this commit`** — substrate-honest as a permanent marker; **never** backfilled.

**Verification:**

```bash
scripts/preflight/cascade-grep.sh hash
```

Confirm that no stale `forward: ADR-N` or `sub-phase X forward`
placeholders remain that should have been backfilled at sub-phase X+1.
Permanent arc-closure placeholders are expected to surface; the
reviewer marks them ✓ as substrate-state invariants.

## Minimum-not-exhaustive disclaimer

This template enumerates the **minimum** post-commit-hash-cascade scope
based on historical patterns (the dual-control arc sub-phases A-J, the
Track A gates). Novel arcs may have additional placeholder surfaces
the template doesn't pre-enumerate — for example, an arc that
publishes a sub-phase-by-sub-phase commit-body table in an ADR's
Implementation Detail section cascades into that table; an arc that
emits a per-sub-phase progress-summary in `README.md` cascades there.
Always verify with `cascade-grep.sh hash` and read the cited files; the
template feeds RULE 12 / RULE 13 / RULE 18, not replaces them.

## Lineage

ADR-0029 (Substrate-Build Optimizations: …) — this template is
Optimization 2 of three. The dual-control arc sub-phases A-J
(`b34c5cf`→`88eb4d6`) and the sub-phase J Decision 3 (permanent
placeholders) are the worked examples the template encodes.
