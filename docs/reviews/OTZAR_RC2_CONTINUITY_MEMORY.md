# OTZAR RC2 SIGNAL FREEZE — Continuity Memory (compaction-safe)

**Updated:** 2026-07-27  
**Campaign:** `OTZAR-RC2-SIGNAL-FREEZE`  
**Process lead:** Agent Zero (PLAN→BUILD→QA; founder still owns FOUNDER_EXPERIENCE_APPROVED)  
**User authorization:** `BEGIN WHOLE-SYSTEM RC2 EXECUTION NOW` = execute BUILD for this bounded release

---

## 1. Mission (never lose this)

Otzar is an **ambient enterprise AI Work OS**. Employees + managers + founders + admins collaborate toward team goals, deals, contracts, and company mission. Each person has an **AI Teammate** that produces **measurable, governed results** under hierarchy and permission — not a chatbot, not surveillance.

**RC2 law:** Preserve working intelligence underneath. Recompose human surfaces. Prove claims live.

**This release is NOT:** Gate B scale, Gate C Relay product, Gate D GOVSEC packaging, commercial billing, native mobile, Caretaker, backend rewrite.

**This release IS:** First-hour signal freeze — Login → Today → walkthrough continuity → People honesty → Action Center real work → grounded Twin → Connections honesty → Admin operating shell → deploy parity → founder can approve.

---

## 2. Repositories (exclusive writers)

| Repo | Path | HEAD at campaign start | Role |
|------|------|------------------------|------|
| Foundation | `/Users/genghishameha/dev/NIOV Labs/github/niov-foundation` | `afe1491` | Backend; only change if Twin grounding needs it |
| Control Tower | `/Users/genghishameha/dev/NIOV Labs/github/otzar-control-tower` | `96eb954` | **Primary surface work** |
| Relay | `…/otzar-relay` | `da62edc` | Out of scope unless proven required |
| Caretaker* | FORBIDDEN | — | Never touch |

**Live at campaign start:**
- API `https://api.otzar.ai/api/v1/health` → `git_commit=afe1491…`, DB connected
- App `https://app.otzar.ai` → HTTP 200, bundle `index-DmQQIMEk.js`

---

## 3. Status vocabulary (mandatory)

coded → tested → PR → merged → deployed → live bundle verified → LIVE_ROUTE_VERIFIED → FOUNDER_VISIBLE  
**Never claim FOUNDER_EXPERIENCE_APPROVED or YC_RELEASE_CANDIDATE_READY without founder.**

---

## 4. Known P0 residual (from YC_RC2_STATUS + audit)

1. Walkthrough intercepts Talk/orb pointer events when open  
2. People structure glance below fold / depth residual  
3. Talk path blocked when guide open  
4. Home trust / bands signal  
5. Connections honesty (Meet external block — never fake)  
6. Thread-grounded Twin gap (system map)  
7. Deploy lag risk  
8. Copy: technical language, em dashes, harness residue  

Backend preserved classifications (do not break): project loop, doc propagation, calendar, work OS, work-style, cross-tenant unit guards.

---

## 5. Specialist team (Agency Agents)

| Agent | Path | Assignment | Auth |
|-------|------|------------|------|
| Orchestrator | specialized/agents-orchestrator.md | Pipeline, sequencing | lead |
| Product Manager | product/product-manager.md | Journey scope | consult |
| Sprint Prioritizer | product/product-sprint-prioritizer.md | Cut thrash | consult |
| Senior PM | project-management/project-manager-senior.md | Task order | consult |
| UX Architect | design/design-ux-architect.md | Surface recomposition | consult |
| Persona Walkthrough | design/design-persona-walkthrough.md | First hour | consult |
| UI Finish Gate | design/design-ui-finish-gate-reviewer.md | Signal polish | consult |
| Frontend Dev | engineering/engineering-frontend-developer.md | CT implementation | **write CT** |
| Backend Architect | engineering/engineering-backend-architect.md | Twin grounding only if needed | write FND if needed |
| Minimal Change | engineering/engineering-minimal-change-engineer.md | Surgical diffs | write |
| AI Engineer | engineering/engineering-ai-engineer.md | Grounded Twin | consult/write FND |
| Code Reviewer | engineering/engineering-code-reviewer.md | Diff review | read |
| Reality Checker | testing/testing-reality-checker.md | Default NEEDS WORK | read |
| Evidence Collector | testing/testing-evidence-collector.md | Fingerprints | read |
| API Tester | testing/testing-api-tester.md | Health/contracts | read |
| Test Automation | testing/testing-test-automation-engineer.md | Unit/e2e | write tests |
| DevOps | engineering/engineering-devops-automator.md | Deploy gate only | after approval |

**No content-designer file** in roster (design-ui-designer used for copy signal).

---

## 6. Collaboration cells

| Cell | Domains | Decision rule |
|------|---------|---------------|
| C1 Experience Signal | Today, walkthrough, copy | UX Architect + Frontend; preserve nav deep links |
| C2 People + Authority | People hover/cards | No title=authority; auth-gated fields only |
| C3 Action + Work | Action Center, handoffs | Real ledger/action items; no fake rows |
| C4 Twin Grounding | Talk, COE, thread | Prefer existing conductSession + work-os thread; no rewrite |
| C5 Connections Honesty | OAuth, Meet | External block stays honest |
| C6 Admin Shell | Hubs, Dandelion packaging | Operating not commercial |

---

## 7. Shared contracts to freeze

1. Status vocabulary (above)  
2. RC2 preserve/recompose law  
3. Product language: Members · AI Teammates · Knowledge Items · Access Control (never Entity/Capsule/Twin in customer copy)  
4. Action Center = exception queue  
5. Dandelion = Organization seeding engine, human surface under Organization  
6. JWT in memory only  
7. api.ts only HTTP surface  
8. Capability preservation registry  

---

## 8. Execution order

1. Continuity memory + required review artifacts (docs) — **DONE**  
2. CT diagnosis of P0 FAIL list in code — **DONE**  
3. Minimal CT fixes: walkthrough skip/restart, People viewport, team-status routing — **DONE (local CT working tree)**  
4. Foundation product change — **SKIPPED** (APIs already present)  
5. Unit tests + typecheck — **DONE** (28 unit pass; tsc pass)  
6. Diff + review — **IN PROGRESS** (present to founder)  
7. Commit/PR CT — **AWAITING founder APPLY approval**  
8. Deploy — **BLOCKED until merge + founder/deploy gate**  
9. Live fingerprint re-verify after deploy  

### CT files changed (local, uncommitted)

- `src/components/first-use/FirstUseReveal.tsx`
- `src/components/otzar/PeopleStructureGlance.tsx`
- `src/lib/voice/voice-action-runtime.ts`
- `src/pages/app/Preferences.tsx`
- `tests/unit/ask-twin.test.ts`
- `tests/unit/first-use-walkthrough.test.ts`

---

## 9. Stop conditions

- 3 QA failures same area → escalate  
- Another writer on repo → stop  
- Founder rejects → record residuals  
- Never touch Caretaker  

---

## 10. After compaction

Re-read this file + `RC2_CONTROLLING_DIRECTION.md` + `YC_RC2_STATUS.md` + git status both repos + live health/bundle. Resume from §8 current step.
