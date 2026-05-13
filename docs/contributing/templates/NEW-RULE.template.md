# Template: New RULE

Copy-paste-and-fill scaffold for landing a new operating RULE in
`CLAUDE.md` §3. Implements **Optimization 2** from ADR-0029
(Substrate-Build Optimizations: Cascade-Inventory Scripts +
Commit-Class Templates + Strategy-Tier Prose Discipline). This template
enumerates the *minimum* RULE-cascade scope — verify against actual
repo state with `scripts/preflight/cascade-grep.sh rule {N}` before
drafting.

## RULE 20 reminder — Founder authorization required

Per ADR-0027 (Contributor Governance) and RULE 20 (Rule-Modification
Authority), only the patent-holder Founder may add, modify, or remove
operating RULES. A pull request landing a new RULE must:

1. Cite **RULE 20** explicitly in the PR description.
2. Surface for **explicit Founder authorization** before merge.
3. Land **alongside an ADR** that documents the decision lineage
   (per CLAUDE.md §11 — major changes require an ADR).

This authorization gate applies even to RULE additions that look
mechanical (e.g., a numbering bump). The substrate-honesty principle:
RULES are load-bearing across the entire repo and every AI session;
modifications require the highest authorization tier.

**Placeholder fields** (replace literally with concrete values):

- `{N}` — new RULE number
- `{N-1}` — previous most-recent RULE number
- `{TITLE}` — RULE title (uppercase, terse — e.g., `BUILD FORWARD ONLY`)
- `{NNNN}` — zero-padded ADR number for the ADR drafting this RULE
- `{ADR-CITATION}` — the ADR reference (e.g., `ADR-0027`)

---

## File 1 — `CLAUDE.md` §3 (NEW block)

Placement: after `### RULE {N-1} -- {prior-title}` block, before
`## 4. Architectural Vocabulary`. The RULES are numbered stably for
citation purposes across the project's history (per CLAUDE.md §11 —
the 11 preserved RULES 0-10 are never reordered; new RULES 12+ follow
the same discipline).

```markdown
### RULE {N} -- {TITLE}

{Rule body — plain-language statement of the constraint or discipline.
Lead with the rule itself, then surrounding context. Typical body
length: 5-15 lines. If the rule has a runtime anchor or enforcement
tier, cite it (e.g., "Enforced at TEST tier via
`tests/unit/no-console-in-api-src.test.ts` and at git-hook tier via
`.husky/pre-commit` per ADR-0024.").}

Lineage: this rule emerged from {context — e.g., "Phase 1-2 of Section
12C.0.5"; "RAA 12.7 (commit `0fd8da7`)"; the dual-control arc sub-phase
I}; see {ADR-CITATION} for the decision lineage.
```

## Standard RULE-cascade checklist

Walk this list at pre-flight. Each item is either part of the planned
cascade (✓ in scope) or deliberately out of scope (✓ noted) or a
missed cascade target (✗ surface per RULE 13).

- [ ] **`CLAUDE.md` preamble** (line ~5, the file-opening paragraph):
  - [ ] `RULES (0-10)` count phrasing — confirm unchanged (0-10 are
    preserved; only RULES 12+ change with new additions)
  - [ ] `RULES 12-{N-1}` → `RULES 12-{N}` (the post-Section-12C.0.5
    added-RULES range)
- [ ] **`CLAUDE.md` §3 intro**: same RULE-count reconciliation as the
  preamble — the §3 intro paragraph names the range of preserved + new
  RULES.
- [ ] **`CLAUDE.md` §5 jump-table** (if the new RULE has a linked ADR):
  - [ ] The `**ADR-{NNNN}**` jump-table line references the new RULE
    in its register descriptor
- [ ] **`docs/contributing/onboarding.md`** — multiple sites:
  - [ ] Line ~29 (the load-on-open RULE inventory): `{N-1} RULES (0-10 + 12-{N-1})` → `{N} RULES (0-10 + 12-{N})`
  - [ ] Line ~57 (same pattern): same reconciliation
  - [ ] Line ~357 (closing summary): same reconciliation
  - [ ] §3 Step 1 (the RULE-loading step): the RULE-inventory list
    gains the new RULE
- [ ] **`docs/contributing/onboarding-for-engineers.md`** §2 (if the
  contributor-onboarding doc surfaces RULE/ADR counts):
  - [ ] Update the count phrasing
- [ ] **Linked ADR cascade** — the ADR drafting this RULE (per CLAUDE.md
  §11, major RULE changes require an ADR):
  - [ ] The ADR lands in the same commit as the RULE addition
  - [ ] The ADR's `Bidirectional citations (cited from):` block gets a
    line from CLAUDE.md §3 (the RULE references the ADR)
  - [ ] RULE-14 back-cite discipline: any cross-cited ADRs get
    bidirectional citations in the same commit

**Verification:**

```bash
scripts/preflight/cascade-grep.sh rule {N}
```

The cascade-grep output surfaces all files and lines that match the
RULE-{N} cascade patterns. Walk each match: confirm in-scope, mark
deliberately-out, or surface as a missed target.

## Minimum-not-exhaustive disclaimer

This template enumerates the **minimum** RULE-cascade scope based on
historical patterns (RULES 0-10 preserved; RULES 12-20 added). Novel
RULES may have additional cascade targets the template doesn't
pre-enumerate — for example, a RULE with a runtime anchor cascades
into `docs/reference/architectural-anchors.md` and the anchor's
locking test file; a RULE that introduces a new pre-commit-hook check
cascades into `.husky/pre-commit`. Always verify with `cascade-grep.sh
rule {N}` and read the cited files; the template feeds RULE 12 /
RULE 13 / RULE 18, not replaces them.

## Lineage

ADR-0029 (Substrate-Build Optimizations: …) — this template is
Optimization 2 of three. The dual-control arc's RULE 20 addition
(sub-phase I, `[SEC-CONTRIBUTOR-GOVERNANCE]`, `62d472c`) is the most
recent worked-example RULE landing the template encodes.
