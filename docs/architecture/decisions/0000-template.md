# ADR-NNNN: [Short title of decision]

## Status

[Proposed | Accepted YYYY-MM-DD | Deprecated | Superseded by ADR-NNNN]

[If Superseded, link to the superseding ADR by number and title.]

## Context

[What is the issue we're seeing that motivates this decision?
Describe the architectural pressure, the constraints involved,
and the non-negotiables. Be specific — vague context produces
vague decisions. 100-300 words typical.]

## Decision

[What is the change we're proposing or have agreed to? State the
decision in active voice with a clear actor: "Foundation will…"
or "All new code will…" Avoid passive constructions that hide
who is accountable. Cite specific file paths, function names,
or schema columns where the decision will land. 50-200 words
typical.]

## Consequences

[What becomes easier or more difficult? Enumerate both. Easy
wins go first; hard trade-offs go second. Be honest about the
costs — an ADR that hides trade-offs invites future engineers
to undo the decision without understanding why. 100-300 words
typical.]

### Easier

- [Bullet]
- [Bullet]

### Harder

- [Bullet]
- [Bullet]

## Alternatives Considered

[What did we reject and why? Name each alternative explicitly,
state the rejection reason, and reference where the rejection
discussion happened (e.g., "rejected during Section 12C.0 plan-
draft phase, see DRIFT 14 resolution"). 100-300 words typical.]

### [Alternative 1 name]

[Why rejected.]

### [Alternative 2 name]

[Why rejected.]

## References

[Links to commits, code paths, prior ADRs, external docs, user
memories, build cycle artifacts. Format:

- Code: `path/to/file.ts:line` or `path/to/file.ts`
- Commits: `commit-short-sha` (subject line in italics)
- ADRs: ADR-NNNN
- External: full URL or document name
- User memories: "User memory #N" (when applicable)

Bidirectional citations: if this ADR is cited from another
file (glossary, anchors catalog, CLAUDE.md), the citing file
is listed here. Bidirectional citation surfaces broken links
when either side drifts.]

---

## How To Use This Template

1. Copy this file to `docs/architecture/decisions/NNNN-short-title.md`
   where NNNN is the next unused number, zero-padded to 4 digits.
   Check existing ADRs to find the highest current number.

2. Fill in the placeholders in this order: Status (start with
   `Proposed`), Context, Decision, Alternatives Considered,
   Consequences, References. Drafting in this order forces the
   author to think about *why* before *what*, and *what was
   rejected* before *what becomes harder*.

3. Submit for review. After acceptance:
   - Update Status to `Accepted YYYY-MM-DD`.
   - If the ADR introduces a new architectural anchor, add the
     anchor to `docs/reference/architectural-anchors.md` in the
     same commit.
   - If the ADR introduces new terminology, add it to
     `docs/reference/glossary.md` in the same commit.
   - If the ADR supersedes a prior ADR, update the prior ADR's
     Status to `Superseded by ADR-NNNN` in the same commit.

4. Bidirectional citation discipline: every file that cites this
   ADR (glossary, anchors catalog, CLAUDE.md sections, code
   JSDoc) gets listed in the References section. This ensures
   broken cross-references surface when either side drifts.

5. ADR titles are short and active-voice: "Three-wallet
   architecture" not "Decision about wallet structure";
   "Frozen-config tamper anchors" not "Choice of immutable
   configuration approach."

## niov-foundation-specific extensions to standard Nygard format

Two extensions distinguish Foundation's ADRs from the canonical
Michael Nygard template:

1. **Status accepts explicit ISO date.** Foundation work happens
   in commit-traceable batches; knowing when a decision was
   accepted matters for compliance posture (SOC 2 / FedRAMP)
   and for understanding which decisions were live during which
   build cycle. Use `Accepted 2026-05-04` rather than just
   `Accepted`.

2. **Consequences split into Easier / Harder sub-sections.** The
   standard Nygard format leaves trade-off enumeration optional;
   Foundation makes it explicit because ADRs with vague
   consequences get re-litigated later. Easier-first ordering
   encodes that we list wins before we list costs
   (psychologically harder, more honest).
