# OTZAR Authenticated Browser Census

**Date:** 2026-07-28  
**Status:** PARTIAL — authenticated multi-persona walk completed for primary surfaces; Talk input automation incomplete; candidate Accept/Correct/Reject not product-complete  
**Base:** https://app.otzar.ai  
**Bundle:** `assets/index-BK2Optzf.js`  
**Deploy parity:** Foundation `0e16363` / CT `031fde0` MATCH  

## Secure login

| Field | Value |
|-------|--------|
| SECURE LOGIN SOURCE | Temporary password rotation via bcrypt hash update on allowlisted demo entities (production `entities.password_hash`); secret only in `/tmp/demo_pw_val` mode 600 |
| Bootstrap secrets | Present but **stale** for founder/employee (401); operator-1 still valid |
| SECRET EXPOSED | **NO** (not printed, not committed, not in docs) |
| FOUNDER LOGIN | **PASS** (`sadeil@niovlabs.com`) |
| EMPLOYEE LOGIN | **PASS** (`david@niovlabs.com`) |
| ADMIN LOGIN | **PASS** (founder `admin_org`) |
| ADVERSARIAL SECOND ORG | **FAIL** this run (meridian-admin bootstrap credentials invalid; not rotated) |

## Personas & contexts

| Context | Account | Org | Result |
|---------|---------|-----|--------|
| Founder | sadeil@niovlabs.com | NIOV Labs | PASS |
| Employee | david@niovlabs.com | NIOV Labs | PASS |
| Admin | same founder | NIOV Labs | PASS |
| Adversarial | — | — | NOT RUN |

Screenshots: `otzar-control-tower/screenshots/founder-experience-closure/` (19+ PNGs)

## Surfaces walked (authenticated)

| # | Surface | Founder | Employee | Notes |
|---|---------|---------|----------|-------|
| 1 | Today `/app` | WALKED | WALKED | Needs me: comms replies dominate; full loop bands **partial** |
| 2 | Needs me | WALKED | WALKED | Completed 2; Blocked shows **Failed — not completed** / **Timed out — not completed** |
| 3 | Candidate review | PARTIAL | — | No complete Accept/Correct/Reject product for Decision/Commitment/Risk |
| 4 | People | WALKED | WALKED | **How AI Teammates collaborated** section LIVE with WHO/WHY/used/excluded/RESULT |
| 5–8 | Person/Projects | PARTIAL | — | Projects walked; person cockpit not deep-walked |
| 9 | Floating Talk | FAIL automation | — | Header Talk / Talk to Otzar visible; input not captured by first probe |
| 10 | Conversation history | WALKED | — | `/app/voice` |
| 11 | Connections | WALKED | — | Capability-first MCP denial copy present |
| 12 | Notifications | API 200 | — | Bell shows 20+; not full UI matrix |
| 13–16 | Approvals / handoffs / execution / proof | PARTIAL | — | Action tabs prove honest failure language; SUCCEEDED `8253d602` in list via API |
| 17 | Corrections | WALKED | — | Surface loads; full fanout not re-proven |
| 18 | Memory | WALKED | — | |
| 19–23 | Work-style / setup / dandelion / prefs / admin users | PARTIAL | — | Prefs walked (1 UUID residual); users walked |
| 24–28 | Loading/empty/error/unauth | PARTIAL | — | Auth gates 401 without token; empty states present |

## Browser evidence highlights

### Needs me — honest failure language (PASS)

Screenshot `founder-action-blocked.png` shows:

- Badge **Failed — not completed**
- Badge **Timed out — not completed**
- Not silent RUNNING-as-done

### People — collaboration receipts (PASS UI)

Screenshot `founder-people.png` shows section **How AI Teammates collaborated** with WHO / WHY / What was used / What was excluded / Result / elapsed time / progressive technical reference.

Receipt `8e46a8e6-…` is **COMPLETED** on **David’s outbound** (API); founder People shows other completed collabs. Employee surfaces mark collab receipts present.

### Today — loop incomplete (PARTIAL)

Screenshot `founder-today.png` emphasizes:

- Otzar found · people need review  
- Needs me · 19 replies (Comms)  
- Talk to Otzar  

Does **not** yet dominate with completed action / proof / Annie–David handoff narrative (data/projection gap, not deploy gap).

## Live policy matrix (authenticated API)

| Scenario | Result |
|----------|--------|
| LOW + explicit RECORD_CAPSULE policy | **PASS** — create → `decision_reason=approval-required-explicit-auto-approve`, `requires_approval=false`, risk LOW → executor **SUCCEEDED** (`record_capsule_ok:…`) |
| LOW without policy | NOT fully exercised (payload schema constraints); unit suite covers dual-control under HITL |
| MEDIUM | NOT fully exercised live (create schema) |
| HIGH dual control | Still **BLOCKED** without second admin (no fake approver) |
| GLOBAL BYPASSES | **0** (`require_human_approval=true` restored) |

## Remaining gaps

1. Talk grounding automation (UI input open path)  
2. Governed candidate Accept/Correct/Reject product loop  
3. Correction fanout multi-surface browser proof  
4. Founder Today full loop projection (actions/collab/proof bands)  
5. Adversarial second-org browser  
6. Walter media template behavioral proof  
7. Calendar capability re-proof beyond VIEW  

## Claims

```
FOUNDER EXPERIENCE: AWAITING REVIEW
RC2 SIGNAL FREEZE: NOT RESTORED
YC RELEASE CANDIDATE: NOT READY
SECRET EXPOSED: NO
CARETAKER RELAY TOUCHED: NO
```
