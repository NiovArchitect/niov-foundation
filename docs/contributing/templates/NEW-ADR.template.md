# Template: New ADR

Copy-paste-and-fill scaffold for landing a new Architectural Decision
Record. Implements **Optimization 2** from ADR-0029 (Substrate-Build
Optimizations: Cascade-Inventory Scripts + Commit-Class Templates +
Strategy-Tier Prose Discipline). This template enumerates the *minimum*
ADR-cascade scope — verify against actual repo state with
`scripts/preflight/cascade-grep.sh adr {N}` before drafting.

**Placeholder fields** (replace literally with concrete values):

- `{N}` — ADR number (e.g., `29`)
- `{NNNN}` — zero-padded ADR number (e.g., `0029`)
- `{N-1}` — previous ADR number
- `{NNNN-PREV}` — zero-padded previous ADR number
- `{kebab-slug}` — title in kebab-case (e.g., `substrate-build-optimizations`)
- `{Title}` — display title
- `{YYYY-MM-DD}` — landing date
- `{Trigger}` — one-line description of what surfaced that prompted this ADR
- `{OLD_MARKER}` — the previous ADR-catalog header marker bracket (e.g., `[SEC-BEAM-FORWARD-SUBSTRATE]`)
- `{NEW_BRACKET}` — the bracket name of the commit landing this ADR (e.g., `[SUBSTRATE-BUILD-ADR]`)
- `{parent-hash}` — short hash of the parent commit (e.g., `88eb4d6`)
- `{REGISTER}` — one-line register descriptor for the §5 jump-table line

---

## File 1 — `docs/architecture/decisions/{NNNN}-{kebab-slug}.md` (NEW)

ADRs use no `ADR-` filename prefix; the filename is `{NNNN}-{kebab-slug}.md`.
The 7-section structure is the canonical Foundation ADR shape; deviate
only with deliberate justification surfaced in the verification report.

```markdown
# ADR-{NNNN}: {Title}

**Status**: Active
**Date**: {YYYY-MM-DD}
**Trigger**: {Trigger}

## Context

{Frame the substrate state that prompted the decision. What's in the
repo today? What surfaced? What constraint is in play? Be concrete —
cite ADR numbers, file paths, line numbers, commit hashes. Avoid
abstract generalities; the substrate-honest test is whether a reader
can grep every claim.}

## Decision

{State the decision in plain language. If there are sub-decisions,
enumerate them (Decision A / Decision B / Decision C). Each sub-decision
should be independently citable.}

## Implementation Detail

{Where the decision lives in code or substrate. File paths, function
names, config values, anchor-test names. If the decision is doc-only,
the canonical document is the implementation.}

## Consequences

**Easier:**

- {What gets easier; what risk class is now reduced; what work can now
  proceed.}

**Harder:**

- {What gets harder; what maintenance cost is now incurred; what
  follow-up obligations exist.}

## Forward Queue

- {Pending work that this ADR forward-references. Future ADRs, future
  sub-phases, future deferred decisions. If empty, say so explicitly:
  "No forward-queued work."}

## Substrate-State Catches Resolved

- {Catches surfaced during the pre-flight or pre-edit verification for
  this ADR's landing commit. Include the catch number, the substrate
  state observed, and the resolution. If zero, say so: "Zero new
  substrate-state catches at pre-flight — the cascade landscape
  verified clean."}

## Bidirectional citations (cited from):

- ADR-XXXX (one-line description of the citation relationship —
  load-bearing or prose-mention; cite the §, the line if relevant).

{One line per ADR that cites this ADR. Per RULE 14, each cited ADR's
own "Bidirectional citations (cited from):" block gets a back-cite to
this ADR in the same commit.}
```

## Standard ADR-cascade checklist

Walk this list at pre-flight. Each item is either part of the planned
cascade (✓ in scope) or deliberately out of scope (✓ noted with reason)
or a missed cascade target (✗ surface per RULE 13).

- [ ] **`docs/architecture/README.md`** — ADR catalog:
  - [ ] Header: `{N-1} ADRs as of {OLD_MARKER}` → `{N} ADRs as of {NEW_BRACKET}` (`{parent-hash}` parent; `{YYYY-MM-DD}`)
  - [ ] New `**ADR-{NNNN}**` catalog line after `**ADR-{NNNN-PREV}**`
- [ ] **`CLAUDE.md` §4 (Architectural Vocabulary)** — reference-roots:
  - [ ] `the {N-1} ADRs` → `the {N} ADRs`
- [ ] **`CLAUDE.md` §5 (Key Architectural Decisions)** — jump-table:
  - [ ] Header: `The {N-1} ADRs as of {OLD_MARKER} (\`{old-parent-hash}\` parent; …)` → `The {N} ADRs as of {NEW_BRACKET} (\`{parent-hash}\` parent; {YYYY-MM-DD})`
  - [ ] New `**ADR-{NNNN}**` jump-table line after `**ADR-{NNNN-PREV}**`
- [ ] **`CLAUDE.md` §10 (Where to Read More)** — documentation-roots:
  - [ ] `ADR-0001 through ADR-{NNNN-PREV}` → `ADR-0001 through ADR-{NNNN}`
- [ ] **Back-cite cascade** — for each load-bearing ADR-X cited by ADR-{NNNN}:
  - [ ] Add a line in ADR-X's `Bidirectional citations (cited from):` block
    pointing to ADR-{NNNN} with the citation-relationship descriptor
    (RULE 14)

**Verification:**

```bash
scripts/preflight/cascade-grep.sh adr {N}
```

The cascade-grep output surfaces all files and lines that match the
ADR-{N} cascade patterns. Walk each match: confirm in-scope, mark
deliberately-out, or surface as a missed target.

## Minimum-not-exhaustive disclaimer

This template enumerates the **minimum** ADR-cascade scope based on
historical patterns (ADR-0001 through ADR-0029). Novel ADRs may have
additional cascade targets the template doesn't pre-enumerate — for
example, an ADR that adds a new architectural anchor cascades into
`docs/reference/architectural-anchors.md`; an ADR that supersedes a
prior ADR cascades into the superseded ADR's Status block. Always
verify with `cascade-grep.sh adr {N}` and read the cited files; the
template feeds RULE 12 / RULE 13 / RULE 18, not replaces them.

## Lineage

ADR-0029 (Substrate-Build Optimizations: …) — this template is
Optimization 2 of three. The dual-control arc (`[SEC-DUAL-CONTROL-*]`,
`[SEC-CONTRIBUTOR-GOVERNANCE]`, `[SEC-BEAM-FORWARD-SUBSTRATE]`) is the
worked-example arc the template encodes.
