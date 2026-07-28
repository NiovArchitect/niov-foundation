# OTZAR Founder Today Signal Contract

**Date:** 2026-07-28  
**Audience:** Founders, YC reviewers, exec users  
**Status:** Implemented in Control Tower `founder-signal-hierarchy.ts` + AmbientWorkSurface

## The problem we solve (must be obvious in 10 seconds)

Enterprise AI consolidates knowledge and takes action without clear human control.
Otzar is the **governed Work OS**: AI Teammates work **autonomously inside proven
authority and policy**; humans govern **exceptions**, not every extracted line.

YC judges see hundreds of “AI assistant” apps. Otzar must **not** look like a noisy
inbox *or* an approval occupation. The first screen is the operating story:
what Otzar handled, what needs judgment, team movement — not communication volume
and not “approve everything.”

## Four questions (in order)

1. **What matters now?** — one primary objective / decision  
2. **What did Otzar complete?** — handoff, AI collab, action, proof  
3. **What needs a decision?** — **exceptions only** (approvals, stuck work, material blockers, dual-control blocks)  
4. **What is the team doing next?** — concise owner + open work  
5. **Communications (secondary)** — grouped replies, never the lead story  

Routine high-confidence organization and low-risk policy execution should **not**
appear as mandatory Approvals. See paths A–G in `docs/ai/OTZAR_AUTONOMY_DECISION_MODEL.md`.

## Forbidden primary signals

- Raw “N replies to review” as the only Needs me card  
- Large “N need review” org-structure volume as the lead hero  
- Forcing Accept/Correct/Reject on every extracted commitment  
- Celebrating approval volume as product success  
- Raw UUIDs, developer tokens, fixture residue  

## Implementation

- `src/lib/today/founder-signal-hierarchy.ts`  
- Wired for `executive` / `administrator` / org-admin on `/app`  
- Comms demoted to last lane with “grouped / secondary” copy  

## Acceptance

Within ten seconds a reviewer can say:

- what changed  
- what Otzar completed  
- what requires a human decision  
- who owns the next step  
