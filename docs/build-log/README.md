# Build Log

> PR-specific black-box recorders for **major** architectural
> landings. Tier 4 of the Foundation 5-tier documentation
> hierarchy. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).
> Operational baton: [`../NEXT_ACTION.md`](../NEXT_ACTION.md).

## When to write a build-log entry

Create `docs/build-log/YYYY-MM-DD-pr-XX-slug.md` when the PR is:

- a **major architecture boundary** (new substrate cluster, new
  cross-application coupling, new wire format, new long-lived
  process tier);
- a **security or governance landing** (new privileged endpoint,
  new principal, new audit literal cluster, dual-control gate,
  break-glass surface);
- a **schema change** (Prisma model add / column add / enum
  extension / migration);
- a **cross-section integration** (substrate spanning more than
  one production section);
- **complex runtime behavior** (concurrency model, scheduler
  cadence, executor lifecycle, retry policy, timeout / cancel
  semantics);
- a **substrate-architectural paste** triggering the RULE 21
  pre-authorization research arc.

## When to skip a build-log entry

For **routine small routes** (a single endpoint + thin service +
straightforward tests, no new architectural boundary): skip the
build-log. The section file at `docs/current-build-state/XX.md`
captures the truth; that's enough.

The wave-based delivery discipline per
`[FOUNDATION-VELOCITY-CORRECTION]` means several routine routes
in the same section close as one wave with one section-file
update + one `NEXT_ACTION.md` touchup. No per-PR build-log entry
is required for a routine wave.

## File format

```markdown
# YYYY-MM-DD — PR #NN — short slug

## Why this PR

One-paragraph context: what gap this closed, what substrate it
introduced, what authorization landed it.

## What landed

- File-by-file detail. Commit hash. Branch name.
- Routes / services / schema / tests added.
- Founder gap-locks exercised.

## Architectural disclosures

- RULE 13 substrate-honest disclosures specific to this PR.
- Non-obvious design choices.
- Concurrency / safety contracts.

## Risks accepted

- Forward-substrate items left open.
- Known limitations.
- What this PR did NOT do (and why).

## Verification

- CI run ID + status.
- TypeScript baseline preserved at N residuals.
- Test counts.
- Pre-commit chain pass.

## Lineage

- Citing ADRs.
- Cited by (forward).
- Section file: [`../current-build-state/XX-section.md`](../current-build-state/XX-section.md).
```

## Discipline preserved

- Build-log entries are append-only (RULE 10 spirit applies to
  the historical record).
- Cross-reference to the section file is mandatory (RULE 14
  bidirectional citation).
- Authorization for any RULE / ADR claim still requires Founder
  sign-off per RULE 20.
- Build-log entries do NOT replace ADRs — ADRs are tier 5
  architectural law and remain at
  [`../architecture/decisions/`](../architecture/decisions/).
  Build-log entries narrate a specific PR's landing; ADRs
  canonicalize the decision behind the landing.

## Foundation 5-tier documentation hierarchy

| Tier | File | Purpose | Style |
|---|---|---|---|
| 1 | [`../NEXT_ACTION.md`](../NEXT_ACTION.md) | Operational baton | Compact, current, ≤ 150 lines. Read first every session. |
| 2 | [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md) | Lean master index | Concise but authoritative. 10-section status + global truths. Cap ≤ 1000 lines. |
| 3 | [`../current-build-state/XX-section.md`](../current-build-state/) | Canonical section truth | Detailed enough for client-ready continuity. Don't starve of necessary detail. |
| 4 | `docs/build-log/YYYY-MM-DD-pr-XX-slug.md` (this directory) | PR-specific black-box recorder | Detailed for major architecture boundaries; short or skipped for routine routes. |
| 5 | [`../architecture/decisions/`](../architecture/decisions/) | ADRs — durable architectural law | Deep, precise, rigorous. Never compressed for speed. |

The key rule: **move detail to the correct layer; do not delete
clarity.** Lean docs ≠ less rigorous docs. Client-ready
documentation means the right level of detail in the right
document.
