# OTZAR Human Attention and Autonomy Model

**Date:** 2026-07-28  
**Status:** Canonical doctrine (maps to live policy + Today hierarchy)  
**Rule:** Human attention is scarce. Approvals are not a KPI.

## One sentence

Otzar acts autonomously inside proven authority, policy, confidence, and reversibility bounds; humans review exceptions, consequential changes, uncertain interpretations, and out-of-bounds actions.

## What Otzar is not

```
extract → ask approve → ask verify → ask approve again → more admin work
```

That is a second job: *approve, approve, verify*. It contradicts AI Teammates.

## Correct operating shapes

```
Most work:     observe → understand → organize → execute within policy → verify → report
Some work:     observe → draft → ask once → execute → learn
Exceptional:   observe → surface uncertainty/consequence → human decision
Prohibited:    deny and explain (do not solicit fake approval)
```

## When Otzar may act without interruption

All of the following already established:

| Condition | Live substrate (examples) |
|-----------|---------------------------|
| Identity / org / role | Auth session + TAR + EntityMembership |
| Authority | TAR capabilities + dual-control where required |
| Policy | `evaluateActionPolicy` + ActionPolicy rows + OrgSettings |
| Source authorized | Wallet / permission / COSMP gates |
| Risk within ceiling | ActionRiskTier LOW with explicit AUTO_APPROVE |
| Observable + auditable | Action attempts, audit chain, proof capsules |
| Reversible / correctable | Soft-delete, correction, cancel paths |

Live proof already includes: LOW `RECORD_CAPSULE` under HITL default + explicit ActionPolicy → auto-approve → SUCCEEDED.

## When Otzar must interrupt a human

Only when the human is uniquely needed:

- ambiguity / conflicting sources  
- insufficient confidence  
- ownership unclear  
- medium/high risk or dual-control  
- material correction with downstream impact  
- external / financial / legal / access change  
- payload change after approval  
- required approver missing → **block**, do not invent  

## Metrics (measure; do not game)

| Metric | Direction of health |
|--------|---------------------|
| Autonomous actions completed | Up (within policy) |
| Human intervention rate | Down for routines |
| Low-value prompts suppressed | Up |
| Exception accuracy | Up |
| Correction rate after autonomous action | Down |
| Rollback rate | Low + explained |
| Approvals as share of total actions | Low is good for routine work |

**Do not celebrate a large approval count.** High volume often means poor autonomy design.

## User-facing principle

> Otzar asks only when you are uniquely needed.

## Cross-links

- Policy: `docs/security/OTZAR_ACTION_APPROVAL_POLICY_POSTURE.md`  
- Decision model: `docs/ai/OTZAR_AUTONOMY_DECISION_MODEL.md`  
- Candidate review (exceptions): `docs/product/OTZAR_GOVERNED_CANDIDATE_REVIEW.md`  
- Today hierarchy: `docs/product/OTZAR_FOUNDER_TODAY_SIGNAL_CONTRACT.md`  
