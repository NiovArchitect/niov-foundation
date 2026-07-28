# OTZAR Governed Candidate Review

**Date:** 2026-07-27  
**Status:** PARTIAL — review rails exist; full Accept/Correct/Reject product loop not complete in authenticated UI

## Intent

Extraction already produces decisions, commitments, and risks. Founders and employees need a **complete human review experience** before candidates become accepted governed work.

## Existing substrate (do not rebuild)

| Surface | Role |
|---------|------|
| `POST /otzar/comms/extract` | Ephemeral structured extraction |
| `POST /otzar/observe/extract` | Observe path |
| `POST /otzar/context/extract-preview` | Document extract preview (review-first) |
| `OrgTruthReviewDrawer` | Org truth conflict candidates |
| `TranscriptActionReview` | Talk/transcript proposed actions (Save / Send / Dismiss) |
| Action Center | Actions, handoffs, obligations, evidence |
| Work-style candidates | Approve / reject on work-style only |

## Target review card fields

For every candidate:

- **Type:** Decision | Commitment | Risk | Handoff | Approval | Correction  
- Clear summary  
- Source speaker + excerpt  
- Project  
- Proposed owner  
- Due time  
- Confidence  
- Downstream impact  
- Approval requirement  

**Actions:** Accept · Correct · Reject · Change owner · Change due · Change project · Require approval · Open source  

**Rules:** Consequential candidates must not bulk-accept without review.

## Persistence contract

| Action | Persist |
|--------|---------|
| ACCEPT | Accepted truth/work, reviewer, time, source, audit |
| CORRECT | Original + corrected, editor, reason, downstream, audit |
| REJECT | Candidate history retained; current truth unchanged; reason; audit |

## Gap vs HEAD

1. No single Action Center tab that lists **comms extraction** candidates with Accept/Correct/Reject end-to-end.  
2. `TranscriptActionReview` covers Talk-proposed actions only (not full Decision/Commitment/Risk taxonomy).  
3. Org-truth drawer covers conflicts, not the full launch-decision candidate set.  
4. Document extract-preview is review-first but not the founder default path.

## Recommended path (no engine rewrite)

1. Prefer **Action Center** as host (already “Needs me”).  
2. Add a **Candidates** subsection fed by existing extract-preview / persisted extract review APIs when present — **do not** invent a parallel execution engine.  
3. Wire Accept → existing work-item / obligation create rails; Correct → correction promotion; Reject → history retain.  
4. Tests: unit for mapper + integration for accept/reject audit.

## Founder claim

**GOVERNED CANDIDATE REVIEW: NOT COMPLETE** until Accept/Correct/Reject is live for Decision/Commitment/Risk with audit and browser evidence.
