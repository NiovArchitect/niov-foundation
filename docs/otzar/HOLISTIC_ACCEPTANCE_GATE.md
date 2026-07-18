# Otzar Holistic Acceptance Gate

> **Purpose:** Close the founder acceptance gate. This document is the
> durable record of proven state, open blockers, and phase order.
> Do **not** treat API smoke alone as completion.
>
> **Updated:** 2026-07-18 (gate opened after CT deploy reconciliation)

---

## 0. Precise proven state (do not inflate)

| Surface | Exact value | As of (UTC) |
|---------|-------------|-------------|
| **Foundation live `git_commit`** | `86746d3a25c020a8d9655210defaaa392a820817` (`86746d3`) | 2026-07-18 ~18:25 |
| **Foundation main tip** | includes enterprise smoke harness `#711`, catalog `#710`, wallet `#709`, ambient `#708` | 2026-07-18 |
| **CT main SHA** | `d959c3055ba5bb67884a8604a6ac1e09df7a5af3` (`d959c30`) — Phase F wave-2 `#170` | 2026-07-18 16:02 merge |
| **CT Phase F commits on main** | `e790836` (#169 full redesign) · `d959c30` (#170 wave-2 surfaces) | — |
| **Live static HTML last-modified** | `2026-07-18T18:22:57Z` | after lag resolved |
| **Live JS bundle** | `/assets/index-4BPnPgW8.js` (sha256_16 `bb2c2242a02dc520`, ~1.96MB) | 200 |
| **Live CSS bundle** | `/assets/index-DzNUeESq.css` (sha256_16 `8b75a8a24623f5ef`) | 200 |
| **Live Phase F UI markers** | `otzar-cta-fill`, `otzar-stage`, `otzar-text-luminous`, `otzar-grain`, `ambient-sync`, `comms/sources`, `Fallback capture`, `wallet-portability` | **present** |
| **Stale bundles** | `index-CDlk9VVC.js` / `index-B-5fGBB_` | **absent** from live index |
| **Render deploy SHA** | **Unavailable** — `RENDER_API_KEY` returns **401 Unauthorized** | cannot read service deploys via API |
| **Render service (yaml)** | `otzar-app` static, `branch: main`, `autoDeploy: true` | render.yaml |
| **128 scenarios** | U/C/T/X × 32 in `ENTERPRISE_SCENARIO_CATALOG.md` | shipped |
| **8 personas** | sadeil, david, vishesh, samiksha, william, annie, shweta, walter | live login green |
| **API harness** | `otzar-whole-system-smoke.sh` + `otzar-enterprise-scenario-smoke.sh` | fails=0 |
| **Fan-out** | multi-person COMMITMENTs → owner My Work `can_complete` | live-proven |
| **Third-party** | workspace `[SMOKE] Client pilot collab` + Acme external membership | live-proven |
| **CT routes HTTP** | 40–48 SPA paths return 200 | shell only — **not** UX completion |
| **Google Doc (provider)** | CREATED `document_id=1crM7tht5mo0q3gRGTEtfomqUREHNa9FGy0z_WDwYAZg`, `body_inserted=true`, `body_char_count=109`, link live | 2026-07-18 |
| **Google Calendar (provider)** | CREATED `event_id=6fvolsv24tnauctmn8qrk2hqh4`, html_link live, start/end set | 2026-07-18 |
| **Google Meet ingestion** | **NOT operational** — ambient-sync returns `SCOPE_REAUTH_REQUIRED` despite OAuth status listing `meetings.space.readonly` | external / token-path blocker |

### UI completeness rule

- **Code on main ≠ deployed.** Earlier lag left live on pre-Phase-F assets until ~18:22Z.
- **Live bundle now contains Phase F markers** — visual redesign may be described as **deployed** only with the exact bundle IDs above.
- **Browser UX acceptance** is still required (journey, consolidation, project coherence). HTTP 200 on 40 routes is **not** screen completion.

---

## 1. Control Tower deployment lag — diagnosis & resolution

### Diagnosis

| Question | Finding |
|----------|---------|
| Exact CT main SHA | `d959c3055ba5bb67884a8604a6ac1e09df7a5af3` |
| Exact live JS/CSS | `index-4BPnPgW8.js` / `index-DzNUeESq.css` @ last-modified **18:22:57Z** |
| Phase F commits | `#169` `e790836`, `#170` `d959c30` |
| CI on those merges | GitHub Actions **CI verify success** on main push for both |
| Why lag occurred | Between ~16:02 merge and ~18:22 deploy (~2h20). Render Auto-Deploy was slow or queued; agent **cannot** inspect deploys (`RENDER_API_KEY` 401). |
| Render waiting/failed/skipped? | **Unknown via API** (auth failure). Inference: deploy **eventually succeeded** (new assets + markers). |
| Wrong branch/service? | yaml says `otzar-app` / `main` / `autoDeploy: true` — matches product; no evidence of wrong branch once deploy landed |

### Repair of deployment rail

| Action | Status |
|--------|--------|
| Verify live assets 200 + no stale refs | **DONE** |
| Record Render key failure | **DONE** — operator must rotate `RENDER_API_KEY` for deploy observability |
| Force-deploy API | **BLOCKED** — 401 |
| Rely on autoDeploy after green main | **Working** (laggy but completed) |

### Deploy verification checklist

| Check | Result |
|-------|--------|
| Deployed CT SHA (exact from Render) | **Unknown** (API 401) |
| Inferred includes `#169`+`#170` | **Yes** (markers + post-merge last-modified) |
| app / JS / CSS 200 | **Yes** |
| No stale asset references in index | **Yes** |
| New UI markers present | **Yes** |
| Console-breaking errors | **Browser e2e in progress / pending report** |

---

## 2. Five-minute investor journey — status

### Run mode

- **Synthetic org:** NIOV Labs live demo (`org_entity_id` a4ddc200-…)
- **Actor:** `sadeil@niovlabs.com` (FOUNDER / CEO template)
- **API product path:** executed (see below)
- **Browser path:** Playwright live specs running / must be recorded separately

### Journey outcomes (API product path)

| Step | Result | Notes |
|------|--------|-------|
| Understand Otzar / login | PASS | ops=6 |
| Role recognition | PASS | FOUNDER + chief-executive-officer + 5 packs |
| Home reconcilable activity | PARTIAL | my-day headline + my-work count + DGI; **browser count=list reconciliation still required** |
| Counts open exact work | NOT BROWSER-PROVEN | API lists exist |
| Next → real decision | PARTIAL | DGI `next_best_step.kind=ADVANCE_OBLIGATION` |
| Team activity | PARTIAL | `/otzar/team-work` ok |
| Project coherence (one surface) | **OPEN** | projects list ok; composed project UI not proven |
| Non-empty Google Doc | **PASS (provider)** | body_inserted, 109 chars, real link |
| Real Calendar event | **PASS (provider)** | real event_id + html_link |
| Proof links open providers | **PASS** | docs.google.com + google.com/calendar links returned |
| AI↔AI info request | **OPEN** | not run this cycle |
| Restricted refuse | **OPEN** | not run this cycle |
| Truth conflict resolve | **OPEN** | conflicts list empty (n=0) — no live conflict to resolve |
| Simple UI | **OPEN** | requires browser + route consolidation |

### P0 trust failures (this cycle)

| ID | Failure | Disposition |
|----|---------|-------------|
| P0-CT-DEPLOY-OBS | Cannot read Render deploy SHA | Operator: rotate RENDER_API_KEY |
| P0-MEET | ambient-sync SCOPE_REAUTH_REQUIRED | External reauth / token path (see §9) |
| P0-JOURNEY-UX | Investor journey not fully browser-proven | Run/repair Playwright journey |
| P0-LOGIN-CTA | Live login button labeled **Continue** (Phase F); e2e + users expect **Sign in** — browser journey timed out at first click | CT PR **#171** restores Sign in; re-run e2e after autoDeploy |
| P0-PROJECT-COMPOSE | Project not composed single surface | Product work after journey |
| P0-ROUTE-COUNT | 40+ routes still available | Route disposition + consolidation |

---

## 3. Route disposition (initial — must implement)

HTTP 200 is **not** KEEP.

| Disposition | Routes (initial) |
|-------------|------------------|
| **KEEP** (primary loop) | `/app` Today, `/app/action-center`, `/app/comms`, `/app/my-work`, `/app/my-twin`, `/app/collaboration-workspaces`, `/app/work-projects` (as project context entry), `/app/my-memory` |
| **MERGE into Today / project context** | blind-spots, operational-health, team-work (as panels), meeting-captures (into Comms/project) |
| **MOVE TO DRAWER / More** | preferences, account-security, work-schedule, connector-health, authority-grants, corrections, voice |
| **MOVE TO ADMIN** | organization-seeding, tools-connections, ai-teammates (admin), users, connectors, connector-rails, analytics, security-audit, policies, retention, voice-providers, review-center, marketplace, cohorts, access-grants, intelligence, reports |
| **REDIRECT** | `/app/my-day`→Today, `/app/approvals`→action-center, `/app/voice-ready`→voice (already) |
| **REMOVE / FINISH later** | placeholder workflows, duplicate conversation entry points, dead coming-soon admin entries (already hidden when `VITE_SHOW_COMING_SOON` false) |

**Implementation of removals:** next PR after browser journey P0s — do not expand route count.

---

## 4–8. Phase status (truthful)

| Workstream | Status |
|------------|--------|
| Project-centered coherence | **OPEN** — list proven; single composed project surface not acceptance-proven |
| Document quality + edit propagation | **PARTIAL** — create+body_inserted proven; section quality + edit→revision not yet |
| Hierarchy / Dandelion confirmation UX | **OPEN** — seeds API green; drag-and-drop confirmation not proven as product |
| OOTB AI Teammate value | **PARTIAL** — all 8 templates+packs live; first-5-min role chats not browser-proven |
| Enterprise connector scale | **PARTIAL** — org Google VERIFIED; Slack/M365/Zoom APP_CREDENTIALS_MISSING; no domain-wide provisioning proof |

---

## 9. Google Meet — external blocker (not completion)

### Observed

- OAuth status for `GOOGLE_WORKSPACE`: **VERIFIED**
- Granted scopes list **includes** `https://www.googleapis.com/auth/meetings.space.readonly`
- `POST /otzar/comms/ambient-sync` still returns:
  - `code: SCOPE_REAUTH_REQUIRED`
  - message: reconnect Workspace and grant Meet transcript access
  - detail: `SCOPE_REAUTH_REQUIRED` from Meet conference list

### Interpretation

Token/path used for Meet conferenceRecords may still be rejected by Google (stale sealed credential, insufficient effective grant, or Meet API enablement) **despite** scope listed on status. **Do not claim Meet operational.**

### Single sanctioned operator action

1. As org admin in Control Tower → **Tools & Connections** (or Connectors OAuth).
2. **Reconnect Google Workspace** and approve **all** requested scopes, ensuring Meet space/transcript access is granted.
3. Confirm Google Cloud project has **Google Meet API** enabled for the OAuth client.
4. Re-run: `POST /api/v1/otzar/comms/ambient-sync` until `ok:true` or honest `NO_TRANSCRIPT` (not SCOPE_REAUTH).

**Do not search for or paste credentials in agent logs.**

### After reauth success criteria

Meet source discovery → transcript/artifact → participants → lineage → project link → extract → obligations → reports.

---

## 10. Harness extension (required next)

Existing: endpoint + multi-persona + SPA shell.

**Add categories:** UX · PROJECT · PROVIDER · HIERARCHY · CONNECTOR · INVESTOR  

**Must assert:** count=list equality, deep links, project composition, doc body quality, calendar match, CT bundle markers live, no cross-tenant leak, etc.

Script: extend `otzar-enterprise-scenario-smoke.sh` — do not replace catalog.

---

## 11. Whole program ledger (preserved)

### Active now

1. CT deployment reconciliation — **largely closed** (live Phase F bundle; Render observability open)
2. Five-minute investor journey — **in progress**
3. Project-centered coherence — **open**
4. UI consolidation (fewer screens) — **open** (disposition drafted)
5. Live provider proof — **Docs+Calendar created; Meet blocked**

### Next

- Dandelion / hierarchy confirmation UX
- Role-templated AI Teammate first-5-min value (browser)
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
| Latest CT UI live | **YES** (bundle markers; exact Render SHA unknown) |
| Route count materially consolidated | **NO** |
| Investor journey browser-proven | **NO** (API partial) |
| No dead-end counts / generic redirects | **NO** (not browser-proven) |
| One project coherently represented | **NO** |
| Useful Docs + Calendar provider-proven | **YES** (created this cycle) |
| Document edit propagation | **NO** |
| Team activity aggregation | **PARTIAL** |
| Meaningful truth candidate identity | **NO** (no open conflict) |
| Dandelion/hierarchy truthfully established | **PARTIAL** (API only) |
| Role templates immediate value | **PARTIAL** (data yes; UX journey no) |
| Connector setup understandable | **PARTIAL** |
| Multi-role experience proven | **PARTIAL** (API multi-persona) |
| No cross-tenant / cross-Twin leakage | **NOT FULLY RE-PROVEN this cycle** |
| Every retained screen E2E | **NO** (shell 200 only) |

**Gate status: OPEN — not complete.**

---

## Next ordered actions (no “build anything”)

1. ~~CT deploy lag~~ → record closed with live bundle; fix Render key observability.
2. Finish **browser** five-minute investor journey; repair every P0.
3. Compose **one project** surface proof.
4. Implement route disposition (shrink app).
5. Doc edit propagation + Meet reauth follow-through.
6. Extend harness with UX/PROVIDER/PROJECT assertions.
