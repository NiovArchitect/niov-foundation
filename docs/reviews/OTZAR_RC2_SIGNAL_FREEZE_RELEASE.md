# OTZAR RC2 Signal Freeze — Release Record

**Date:** 2026-07-27  
**Campaign:** OTZAR-RC2-SIGNAL-FREEZE  
**Status vocabulary:**

| Gate | Status |
|------|--------|
| RC2 SIGNAL SLICE | **PUBLICLY DEPLOYED AND AUTOMATION-PROVEN** (static + unit + API contract) |
| FOUNDER EXPERIENCE | **AWAITING REVIEW** |
| RC2 SIGNAL FREEZE | **NOT RESTORED** |
| YC_RELEASE_CANDIDATE | **NOT READY** |
| FOUNDER_EXPERIENCE_APPROVED | **NOT claimed** |

---

## Commits

| Repo | Commit | Scope |
|------|--------|-------|
| **otzar-control-tower** | `28376f77e0104055d1cd9de6893996ca1bc4051d` | Product + tests (6 files) |
| **niov-foundation** | `3a8355a1ee96c59d35543198336bf2564123b42f` | Docs only (branch `docs/rc2-signal-freeze-audit-pack`, PR #736) |

Foundation **runtime** HEAD / live remains `afe1491d882cbca4b0ce95db6f85ec0ad85dd16f` (unchanged).

---

## Control Tower files committed

1. `src/components/first-use/FirstUseReveal.tsx`
2. `src/components/otzar/PeopleStructureGlance.tsx`
3. `src/lib/voice/voice-action-runtime.ts`
4. `src/pages/app/Preferences.tsx`
5. `tests/unit/ask-twin.test.ts`
6. `tests/unit/first-use-walkthrough.test.ts`

## Foundation documents committed (PR #736)

Under `docs/reviews/`, `docs/product/OTZAR_*`, `docs/testing/OTZAR_*` — 25 files, no `apps/` or `packages/`.

---

## Pre-deploy gates

| Gate | Result |
|------|--------|
| Targeted unit tests (28) | **PASS** |
| Typecheck | **PASS** |
| Production build | **PASS** (`index-CCcrna9M.js` local; Render builds own hash) |
| Lint | **PASS** (0 errors; pre-existing warnings unrelated) |
| API contract smoke | **PASS** (health ok; protected routes 401 SESSION_INVALID not 404) |
| Preservation regressions | **0** |
| Caretaker touched | **NO** |

---

## Deployment

| Field | Value |
|-------|-------|
| Service | `otzar-app` `srv-d8t1qpj7uimc73db2il0` |
| Branch | `main` |
| Source / target SHA | `28376f7` |
| Deploy ID | `dep-d9jrqjqd0e5s7384cksg` |
| Trigger | `scripts/otzar-render-deploy.sh` after CI green (auto-deploy lagged) |
| Bundle before | `assets/index-DmQQIMEk.js` |
| Bundle after | `assets/index-C-6AC26J.js` |
| App HTTP | 200 |
| API live SHA | `afe1491` (unchanged; correct) |
| Deploy parity | **YES** (markers present in live JS) |

### Live JS markers verified

- Restart walkthrough: 2  
- Skip for now: 1  
- Continue walkthrough: 1  
- walkthrough-restart: 2  
- people-structure-anchor: 1  
- walkthrough-skip-for-now: 1  
- /app/team-work: 3  
- team working: 1  
- what changed: 3  
- SCALE_PROVEN: 0  

---

## Public automated validation limits

Credentialed Playwright (`DEMO_SHARED_PASSWORD`) was **not available** in this agent environment.  
Therefore login/role/Action Center **authenticated** paths are **AWAITING FOUNDER** (not self-approved).

Static + unit + API + deploy parity: **PASS**.

---

## Founder walkthrough package

See final response section **FOUNDER WALKTHROUGH**.

---

## Remaining P0 (after this slice)

1. Founder personal experience verification  
2. Credentialed public smoke matrix (agent env lacked demo password)  
3. Thread-grounded Twin answers residual (system map)  
4. Meet external reauth honesty (not introduced by this slice)  

## Remaining P1

People cockpit depth · message→ledger auto-extract · session durability · Gate B/C/D programs
