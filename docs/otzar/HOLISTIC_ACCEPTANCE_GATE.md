# Otzar Holistic Acceptance Gate

> **Purpose:** Close the founder acceptance gate. This document is the
> durable record of proven state, open blockers, and phase order.
> Do **not** treat API smoke alone as completion.
>
> **Updated:** 2026-07-19T08:56Z (CT tip live + browser investor green)

---

## 0. Precise proven state (do not inflate)

| Surface | Exact value | As of (UTC) |
|---------|-------------|-------------|
| **Foundation live `git_commit`** | `d9ac931f6861b35541626bf2361eee3d7bb32c28` (`d9ac931`) | 2026-07-19 ~08:55 |
| **Foundation main tip** | `034b8c7` — gate record `#714` (may lag live until FND auto-deploy) | 2026-07-19 |
| **Foundation historical anchor** | `1c184c9` wallet portability `#709` | retained |
| **CT main SHA** | `8ab66a1` — project context + open-work + #171 Sign in | 2026-07-18 |
| **Live static HTML last-modified** | **`2026-07-19T08:32:59Z`** | deploy advanced |
| **Live JS bundle** | `/assets/index-CiFLTkjP.js` (~1.99MB, sha256_16 `d36c0a7c46a26bf6`) | **200** |
| **Live CSS bundle** | `/assets/index-DzNUeESq.css` | **200** |
| **Live login CTA** | **`Sign in`** (#171) | **proven** |
| **Live open-work-lane** | present in bundle + browser | **proven** |
| **Live project-context-panel** | present in bundle + browser | **proven** |
| **Live Phase F markers** | `otzar-text-luminous` / grain / ambient | **present** |
| **Render deploy SHA** | still **unavailable** via API (`RENDER_API_KEY` 401) | observability open |
| **128 scenarios** | U/C/T/X × 32 catalog | shipped |
| **8 personas** | sadeil…walter | live login green |
| **Browser investor journey** | Playwright hard **PASS** on live tip | 2026-07-19 ~08:56 |
| **Google Doc / Calendar** | provider-created IDs retained | provider-proven |
| **Google Meet** | **NOT operational** — `SCOPE_REAUTH_REQUIRED` | external blocker |

### UI completeness rule

- **Code on main is now on live** for #171 Sign in, open-work lane, and project context (`index-CiFLTkjP.js` @ 08:32:59Z).
- HTTP 200 on routes is **still not** screen completion — browser journey + composed surfaces are the bar.

---

## 1. Control Tower deployment — closed for tip

| Question | Finding |
|----------|---------|
| Exact CT main | `8ab66a1` |
| Live JS | `index-CiFLTkjP.js` @ **08:32:59Z** |
| Sign in CTA | **YES** |
| open-work-lane | **YES** |
| project-context-panel | **YES** |
| app / JS / CSS 200 | **YES** |
| Render API observability | still 401 — operator should rotate key |

Earlier lag (18:22Z Phase F-only bundle) **resolved** overnight auto-deploy.

---

## 2. Five-minute investor journey — browser proven (live tip)

**Actor:** `sadeil@niovlabs.com` · **Base:** `https://app.otzar.ai` · **~69s**

| Step | Result |
|------|--------|
| Login CTA Sign in | **PASS** |
| Understand Otzar | **PASS** |
| Role / shell | **PASS** |
| Home activity + counts | **PASS** |
| Needs me / Next | **PASS** |
| API my-work (49) | **PASS** |
| Open-work UI (44 ledger items) | **PASS** |
| Deep-link item detail | **PASS** |
| Team | **PASS** |
| Projects (10) + context panel people+work | **PASS** |
| Comms / Meet reauth honesty | **PASS** (external block visible) |
| AI Teammate role language | **PASS** |
| Ambient “What is my team doing?” | **PASS** |
| Console hard crashes | **PASS** (401/409 network noise expected for Meet/auth) |

### P0 disposition

| ID | Status |
|----|--------|
| P0-CT-DEPLOY-LAG | **CLOSED** for tip `8ab66a1` |
| P0-LOGIN-CTA | **CLOSED** on live |
| P0-OPEN-WORK-HIDE | **CLOSED** on live (44 items) |
| P0-MEET | **OPEN** external reauth |
| P0-PROJECT-COMPOSE | **PARTIAL** — people + open work + meetings composed; full docs/calendar/obligations lineage still thin |
| P0-ROUTE-COUNT | **OPEN** — further shrink still needed |
| P0-CT-DEPLOY-OBS | **OPEN** — Render API key 401 |

---

## 3. Route disposition (implement shrink)

| Disposition | Routes |
|-------------|--------|
| **KEEP** | `/app` Today, `/app/action-center` (Needs me + open work), `/app/comms`, `/app/collaboration`, `/app/my-memory`, `/app/my-twin`, `/app/work-projects` (context panel), `/app/voice` |
| **REDIRECT (live)** | my-work→action-center, my-day→Today, approvals→action-center, team-work→Today, blind-spots→action-center |
| **MOVE TO MORE / HIDDEN** | schedule, preferences, corrections, connector-health, authority, meeting-captures, … |
| **MOVE TO ADMIN** | seeding, tools, users, analytics, security, marketplace, … |
| **REMOVE / FINISH** | placeholder workflows |

Primary employee nav remains five calm entries + More. Further admin-side merge next.

---

## 4–8. Phase status

| Workstream | Status |
|------------|--------|
| Project-centered coherence | **PARTIAL→stronger** — browser: context panel people+work; meetings section present; doc/calendar proof still separate provider path |
| Document quality + edit propagation | **PARTIAL** — create proven; edit→revision open |
| Hierarchy / Dandelion confirmation UX | **OPEN** (API seeds green) |
| OOTB AI Teammate value | **PARTIAL** — templates live; multi-role first-5-min open |
| Enterprise connector scale | **PARTIAL** — Meet blocked; domain-wide open |

---

## 9. Google Meet — external blocker

**Single action:** Tools & Connections → Reconnect Google Workspace (all Meet scopes) + Meet API enabled → ambient-sync until not SCOPE_REAUTH.

Do not claim Meet operational.

---

## 10. Harness

| Asset | Status |
|-------|--------|
| Enterprise smoke U/C/T/X | live green historically |
| UX/PROJECT/PROVIDER/INVESTOR suite | in `#714` smoke script |
| Investor browser e2e | **PASS on live tip** |

---

## 11. Whole program (preserved)

### Active now

1. CT deployment tip — **closed** for `8ab66a1` live
2. Investor journey — **browser-proven** on tip
3. Project compose — **partial** (panel live)
4. UI consolidation / route shrink — **in progress**
5. Provider proof — Docs/Calendar yes; **Meet blocked**

### Next

- Dandelion / hierarchy confirmation UX
- Role-templated AI Teammate first-5-min (all roles)
- Enterprise connector provisioning
- Ambient desktop/voice proof

### Preserved roadmap

- Otzar Relay **prerequisites** then Relay
- Elixir/BEAM real-time boundary
- Mobile/desktop messaging client
- Phone credential + portable professional identity
- Communication-to-execution at scale
- Regulator/compliance disclosure substrate

**Do not begin Relay before Foundation prerequisites close.**

---

## 12. Completion gate checklist

| Criterion | State |
|-----------|-------|
| Latest CT UI live | **YES** (`index-CiFLTkjP.js`, Sign in, open-work, project context) |
| Route count materially consolidated | **PARTIAL** |
| Investor journey browser-proven | **YES** (live tip) |
| No dead-end counts / generic redirects | **IMPROVED** (open-work + deep link) |
| One project coherently represented | **PARTIAL** (people + work composed) |
| Useful Docs + Calendar provider-proven | **YES** |
| Document edit propagation | **NO** |
| Team activity aggregation | **PARTIAL** (ambient pass) |
| Meaningful truth candidate identity | **NO** (no open conflict) |
| Dandelion/hierarchy truthfully established | **PARTIAL** |
| Role templates immediate value | **PARTIAL** |
| Connector setup understandable | **PARTIAL** |
| Multi-role experience proven | **PARTIAL** (API) |
| No cross-tenant / cross-Twin leakage | **NOT FULLY RE-PROVEN** |
| Every retained screen E2E | **NO** |

**Gate status: OPEN** — tip live + investor browser green; Meet external; compose/docs-edit/hierarchy/route-shrink remain.

---

## Next ordered actions

1. ~~CT tip live + investor re-run~~ **DONE 2026-07-19**
2. Route disposition shrink (admin + dead More entries)
3. Doc edit propagation proof
4. Multi-role first-5-min twin browser
5. Meet reauth follow-through (operator)
6. Dandelion confirmation UX
