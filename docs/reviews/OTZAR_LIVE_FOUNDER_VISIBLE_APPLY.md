# OTZAR — LIVE FOUNDER-VISIBLE WORK OS APPLY

**Date:** 2026-07-28  
**Status:** Merged + deployed; governance restored; authenticated browser incomplete (no DEMO_SHARED_PASSWORD in agent env)  
**Does NOT claim:** FOUNDER_EXPERIENCE_APPROVED / RC2_SIGNAL_FREEZE_RESTORED / YC_RELEASE_CANDIDATE_READY

## PRs

| Repo | PR | Head commit | Merge commit |
|------|----|-------------|--------------|
| Foundation | https://github.com/NiovArchitect/niov-foundation/pull/743 | `b1c9eb1` | `0e16363` |
| Control Tower | https://github.com/NiovArchitect/otzar-control-tower/pull/224 | `e864bd5` (incl. CI-fix) | `031fde0` |

## Deploy parity

| Service | Source main | Deploy commit | Status |
|---------|-------------|---------------|--------|
| otzar-api | `0e1636343f108d211d03508fb65a0d12232df60f` | same | **live** |
| otzar-app | `031fde0430a3e8448e4c76d7e9a0ffea6776ceb8` | same | **live** |

- API health `git_commit`: `0e1636343f108d211d03508fb65a0d12232df60f`  
- App bundle: `assets/index-BK2Optzf.js` (changed from `index-BbmHSYkv.js`)  
- Caretaker Relay: **not deployed / not touched**

## Independent review (reconciled)

### Foundation (b1c9eb1)

- **Backend architecture:** Rung 1 exception is narrow (LOW + ActionPolicy AUTO_APPROVE + org_auto_approve_low_risk); fall-through to later rungs.  
- **AppSec / IAM:** No title-based authority; no wildcard action_type; MEDIUM/HIGH not auto-approved via exception.  
- **HITL:** HITL default restored to true on demo org after deploy.  
- **Audit:** Dual-control path keeps reason `org-require-human-approval`.  
- **Reality / code review:** APPROVED for merge (CI all green).

### Control Tower (4016dc4 + e864bd5)

- **Product/UX:** Real API projections on Today/People/Needs me; progressive disclosure for UUIDs.  
- **Privacy:** SAFE summaries only; no CoT/prompts.  
- **Accessibility / FE:** Receipt structure semantic; unit 64/64 + full CI verify green after CI-fix.  
- **Reality / code review:** APPROVED for merge.

## Live governance restore (NIOV Labs `a4ddc200-…`)

| Setting | Before | After |
|---------|--------|-------|
| `require_human_approval` | `false` | **`true`** |
| `auto_approve_low_risk` | `true` | **`true`** (intentional bounded) |

Explicit ActionPolicies retained:

- RECORD_CAPSULE / LOW → AUTO_APPROVE  
- SEND_INTERNAL_NOTIFICATION / LOW → AUTO_APPROVE  

No wildcards. No second admin invented.

## Bundle marker proof (served production JS)

Present in `assets/index-BK2Optzf.js`:

- How AI Teammates collaborated  
- AI collaboration  
- Failed — not completed  
- Running — not finished yet  
- What was excluded  
- Otzar handled  
- MCP denial (capability-first detail)

Auth-gated routes return **401** without credentials.

## Authenticated browser census

**NOT COMPLETE** — agent environment lacks `DEMO_SHARED_PASSWORD` / `/tmp/demo_pw_val`.

Founder must run credentialed smoke with vault credentials:

```bash
export OTZAR_SMOKE_EMAIL=sadeil@niovlabs.com
export DEMO_SHARED_PASSWORD='…'   # from vault — never paste into chat
# Then browser walkthrough Today → People → Needs me
```

## Backend truth still live

| Object | State |
|--------|--------|
| Action `8253d602-…` | SUCCEEDED RECORD_CAPSULE |
| Action `2a2c176b-…` | FAILED SEND_INTERNAL_NOTIFICATION |
| Collab `8e46a8e6-…` | COMPLETED |
| Proof capsule `1b1c5011-…` | (prior arc) |

## Remaining gaps for founder

1. Full 4-persona authenticated browser census  
2. Governed candidate Accept/Correct/Reject product loop  
3. Correction fanout multi-surface browser proof  
4. Talk answer for collaboration receipt  
5. Live policy matrix with authenticated action create (LOW w/ and w/o policy)  
6. Calendar capability depth beyond VIEW  

## Claims

```
FOUNDER EXPERIENCE: AWAITING REVIEW
RC2 SIGNAL FREEZE: NOT RESTORED
YC RELEASE CANDIDATE: NOT READY UNTIL FOUNDER APPROVAL
CARETAKER RELAY TOUCHED: NO
BACKGROUND OTZAR WORKERS: 0
```
