# Otzar Holistic Acceptance Gate

> **Purpose:** Close the founder acceptance gate. This document is the
> durable record of proven state, open blockers, and phase order.
> Do **not** treat API smoke alone as completion.
>
> **Updated:** 2026-07-18T19:05Z (browser investor journey + CT deploy re-lag)

---

## 0. Precise proven state (do not inflate)

| Surface | Exact value | As of (UTC) |
|---------|-------------|-------------|
| **Foundation live `git_commit`** | `d9ac931f6861b35541626bf2361eee3d7bb32c28` (`d9ac931`) — gate doc `#712` | 2026-07-18 ~19:04 |
| **Foundation main tip** | same class as live (`d9ac931`); P0-LOGIN note branch may lag | 2026-07-18 |
| **Foundation historical anchor** | `1c184c9` wallet portability `#709` | still valid lineage |
| **CT main SHA** | `5c3c998` — open-work lane + investor e2e (after `a5c526d` #171 Sign in, `fa6268e` deploy nudge) | 2026-07-18 ~19:04 push |
| **CT Phase F commits on main** | `e790836` (#169) · `d959c30` (#170) · `a5c526d` (#171 Sign in) · `5c3c998` (Needs me open-work) | — |
| **Live static HTML last-modified** | **still** `2026-07-18T18:22:57Z` | **deploy lag re-opened** |
| **Live JS bundle** | `/assets/index-4BPnPgW8.js` | 200 |
| **Live CSS bundle** | `/assets/index-DzNUeESq.css` | 200 |
| **Live login submit CTA** | **`Continue`** (not `Sign in`) — pre-#171 | proven in bundle string |
| **Live Phase F UI markers** | present (`otzar-*`, ambient, wallet markers) | YES for #169/#170 class |
| **Render deploy SHA** | **Unavailable** — `RENDER_API_KEY` **401 Unauthorized** (key present, auth rejected) | force-deploy blocked |
| **Render service** | `otzar-app` `srv-d8t1qpj7uimc73db2il0`, branch `main`, `autoDeploy: true` (yaml) | origin + CF same last-modified |
| **128 scenarios** | U/C/T/X × 32 catalog | shipped |
| **8 personas** | sadeil…walter | live login green |
| **API harness** | enterprise + whole-system smoke | previously fails=0 |
| **Browser investor journey** | Playwright `otzar-live-investor-journey.spec.ts` | **run on live** (see §2) |
| **Google Doc / Calendar** | provider-created IDs retained from prior cycle | provider-proven |
| **Google Meet** | **NOT operational** — `SCOPE_REAUTH_REQUIRED` | external blocker |

### UI completeness rule

- **Code on main ≠ deployed.** Live is still `index-4BPnPgW8.js` @ 18:22:57Z while main is `5c3c998`.
- **Do not call Phase F+#171+#open-work live** until last-modified advances and CTA is `Sign in` and `open-work-lane` exists in the JS bundle.
- HTTP 200 on routes is **not** screen completion.

---

## 1. Control Tower deployment lag — current truth

### Diagnosis (this cycle)

| Question | Finding |
|----------|---------|
| Exact CT main SHA | `5c3c998` (includes #171 + open-work compose + investor e2e) |
| Exact live JS/CSS | `index-4BPnPgW8.js` / `index-DzNUeESq.css` @ **18:22:57Z** |
| Origin `otzar-app.onrender.com` | **same** last-modified / etag as `app.otzar.ai` — not Cloudflare-only |
| Phase F on live | **Yes** (markers) — #169/#170 class |
| #171 Sign in on live | **No** — submit still `Continue` |
| Open-work lane on live | **No** — bundle has `my-work-page` count 0; route redirects to action-center without ledger |
| CI on tip | GitHub Actions **verify** success on `fa6268e` and prior `#171`; tip `5c3c998` CI after push |
| Why auto-deploy did not advance | **Unknown without Render Events.** After #171 (18:36Z) and nudge `fa6268e` (18:45Z), live still 18:22Z. Same class of failure as 2026-06-29 **stale GitHub surface** (see CT `docs/RENDER_DEPLOY_NOTES.md`). |
| Render waiting/failed/skipped? | **Cannot read** (API 401). Inference: **not deploying tip** for ≥40+ minutes after green main pushes. |
| Wrong branch/service? | yaml + historical IDs still `otzar-app` / `main` — no evidence of wrong domain mapping; service simply not advancing commit |

### Repair actions taken

| Action | Status |
|--------|--------|
| Confirm RENDER_API_KEY | **FAIL** — 401 on list + force deploy |
| Force `POST …/srv-d8t1qpj7uimc73db2il0/deploys` | **BLOCKED** 401 |
| Fresh main commits to re-signal Auto-Deploy | **DONE** `fa6268e`, then `5c3c998` |
| Document incident in CT RENDER_DEPLOY_NOTES | **DONE** |
| Operator: rotate Render API key + reconnect GitHub on `otzar-app` | **REQUIRED** |

### Deploy verification (must re-run after live advances)

| Check | Current |
|-------|---------|
| Deployed CT SHA | Unknown |
| Live includes #171 Sign in | **NO** |
| Live includes open-work-lane | **NO** |
| app / JS / CSS 200 | YES |
| No stale refs in index | YES (self-consistent old tip) |

---

## 2. Five-minute investor journey — browser proven (partial)

### Run mode

- **Synthetic org:** NIOV Labs demo
- **Actor:** `sadeil@niovlabs.com` (founder)
- **Harness:** `tests/e2e/otzar-live-investor-journey.spec.ts` + `live-login.ts`
- **Base:** `https://app.otzar.ai`

### First browser pass (live, CTA=Continue, ~52s)

| Step | Result | Notes |
|------|--------|-------|
| Login | **PASS** | CTA recorded as **Continue** (deploy lag) |
| Understand Otzar | **PASS** | product language on shell |
| Role / shell | **PASS** | lands `/` admin; `/app` product shell works |
| Home activity | **PASS** | activity language + numeric tokens |
| Needs me / Next | **PASS** | Action Center + scheduled calendar cards |
| My Work / open objects | **FAIL (P0)** | Wave-1 `/app/my-work` → action-center; **no owned ledger UI** while API `GET /work-os/my-work` = **44 items** for founder |
| Team | **PASS** | team surface responsive |
| Projects | **PASS** | **10** project rows; **members panel** opens (compose partial) |
| Comms | **PASS** | Meet reauth messaging visible |
| AI Teammate | **PASS** | role/template language (not empty chat-only) |
| “What is my team doing?” | **PASS** | ambient answered |
| Truth | soft | SPA cookie probe 401 expected without bearer |
| Console | soft fail | 401/409 noise (Meet/auth paths) |

### P0 trust failures

| ID | Failure | Disposition |
|----|---------|-------------|
| P0-CT-DEPLOY-LAG | main `5c3c998` / #171 not live; CTA Continue | Operator reconnect Render GitHub + rotate API key; fresh pushes already sent |
| P0-OPEN-WORK-HIDE | Wave-1 redirect hid owned work | **FIXED on CT main** — `OpenWorkLane` in ActionCenter (`5c3c998`); **await deploy** |
| P0-LOGIN-CTA | Continue vs Sign in | **FIXED on main** `#171`; await deploy |
| P0-MEET | SCOPE_REAUTH_REQUIRED | External reauth (§9) |
| P0-PROJECT-COMPOSE | List+members only; not full project universe | Next after deploy |
| P0-ROUTE-COUNT | Still many routes | Disposition implement after journey green on live tip |

### Product fix shipped (awaiting live)

Needs me now includes:

- Renamed title **Needs me**
- **`open-work-lane`** with `open-work-count` + `WorkLedgerItem` from `GET /work-os/my-work` (filters terminal meetings to Scheduled lane)
- Investor e2e asserts API my-work + UI lane when present

---

## 3. Route disposition (initial — must implement)

HTTP 200 is **not** KEEP.

| Disposition | Routes (initial) |
|-------------|------------------|
| **KEEP** (primary loop) | `/app` Today, `/app/action-center` (Needs me = decisions **+ open work**), `/app/comms`, `/app/collaboration`, `/app/my-memory`, `/app/my-twin`, `/app/work-projects`, `/app/voice` |
| **REDIRECT (already)** | `/app/my-work`→action-center, `/app/my-day`→Today, `/app/approvals`→action-center, `/app/team-work`→Today, blind-spots/operational-health → consolidated |
| **MERGE into Today / project** | remaining orphan admin-like employee dumps |
| **MOVE TO DRAWER / More** | preferences, account-security, work-schedule, connector-health, authority-grants, corrections |
| **MOVE TO ADMIN** | organization-seeding, tools, users, analytics, security, policies, marketplace, cohorts, … |
| **REMOVE / FINISH** | placeholder workflows, coming-soon |

**Implementation:** open-work compose is the first trust repair of consolidation. Further shrink after live deploy of `5c3c998`.

---

## 4–8. Phase status (truthful)

| Workstream | Status |
|------------|--------|
| Project-centered coherence | **PARTIAL** — browser: 10 projects + members panel; not full people/docs/meetings/obligations one surface |
| Document quality + edit propagation | **PARTIAL** — create proven; quality/edit path open |
| Hierarchy / Dandelion confirmation UX | **OPEN** |
| OOTB AI Teammate value | **PARTIAL** — browser twin surface language pass; multi-role first-5-min open |
| Enterprise connector scale | **PARTIAL** — Meet blocked; domain-wide not proven |

---

## 9. Google Meet — external blocker (not completion)

### Observed

- OAuth status may list `meetings.space.readonly`
- Ambient sync still **SCOPE_REAUTH_REQUIRED**
- UI surfaces reconnect language (browser journey)

### Single sanctioned operator action

1. Control Tower → **Tools & Connections**
2. **Reconnect Google Workspace** — approve all scopes including Meet space/transcript
3. Confirm Google Cloud project has **Google Meet API** enabled
4. Re-run ambient-sync until not SCOPE_REAUTH

**Do not search for or paste credentials.**

---

## 10. Harness extension

| Asset | Status |
|-------|--------|
| `otzar-enterprise-scenario-smoke.sh` | U/C/T/X endpoint coverage |
| `otzar-live-investor-journey.spec.ts` | **INVESTOR** browser assertions |
| `live-login.ts` | deploy-tolerant Sign in \| Continue |
| Still required | UX count=list, PROJECT compose deep, PROVIDER edit propagation, HIERARCHY, CONNECTOR, CT bundle marker assert |

---

## 11. Whole program ledger (preserved)

### Active now

1. **CT deployment reconciliation** — Phase F live; **#171 + open-work not live** (rail stalled; key 401)
2. **Five-minute investor journey** — browser run done; P0 open-work fixed on main; re-run after deploy
3. **Project-centered coherence** — open (partial members)
4. **UI consolidation** — disposition + open-work compose; more shrink pending
5. **Live provider proof** — Docs+Calendar yes; Meet blocked

### Next

- Dandelion / hierarchy confirmation UX
- Role-templated AI Teammate first-5-min (all roles)
- Enterprise connector provisioning (domain-wide)
- Ambient desktop/voice proof

### Preserved roadmap (do not drop)

- Otzar Relay **prerequisites** then Relay
- Elixir/BEAM real-time communications boundary
- Mobile/desktop messaging client
- Phone credential + portable professional identity
- Communication-to-execution at scale
- Regulator/compliance disclosure substrate

**Do not begin Relay product work before Foundation prerequisites close.**

---

## 12. Completion gate checklist

| Criterion | State |
|-----------|-------|
| Latest CT UI live | **NO** — tip `5c3c998` / #171 not on live bundle |
| Route count materially consolidated | **PARTIAL** — redirects exist; open-work compose on main |
| Investor journey browser-proven | **PARTIAL** — run on live; open-work P0 until deploy |
| No dead-end counts / generic redirects | **NO** — open-work hide was dead-end; fix awaiting live |
| One project coherently represented | **PARTIAL** |
| Useful Docs + Calendar provider-proven | **YES** |
| Document edit propagation | **NO** |
| Team activity aggregation | **PARTIAL** (ambient team ask pass) |
| Meaningful truth candidate identity | **NO** |
| Dandelion/hierarchy truthfully established | **PARTIAL** |
| Role templates immediate value | **PARTIAL** |
| Connector setup understandable | **PARTIAL** |
| Multi-role experience proven | **PARTIAL** (API) |
| No cross-tenant / cross-Twin leakage | **NOT FULLY RE-PROVEN** |
| Every retained screen E2E | **NO** |

**Gate status: OPEN — not complete.**

---

## Next ordered actions (no “build anything”)

1. **Operator:** rotate `RENDER_API_KEY`; reconnect GitHub on Render `otzar-app` (`srv-d8t1qpj7uimc73db2il0`); deploy commit `5c3c998` (or tip).
2. Verify live: last-modified advances · CTA `Sign in` · `open-work-lane` in bundle · re-run investor e2e.
3. Project compose surface + route shrink.
4. Doc edit propagation + Meet reauth follow-through.
5. Extend harness UX/PROVIDER/PROJECT/HIERARCHY/CONNECTOR assertions.
