# OTZAR Authenticated Browser Census

**Date:** 2026-07-27  
**Status:** PARTIAL — code-route inventory + API-backed surface map; full multi-persona credentialed click-through incomplete in this agent environment  
**CT deploy reference:** `629813d` (+ local `feat/founder-visible-work-os` pending merge)  
**Foundation deploy reference:** `03cc5bf` (+ local policy Rung 1 fix pending merge)

## Persona budget (required)

| Context | Purpose | Status this run |
|---------|---------|-----------------|
| Founder | Today loop, approvals, team | API smoke only — browser incomplete |
| Employee | Self-scoped work, Talk | Not completed |
| Manager/Admin | Structure, dual-control honesty | Not completed |
| Adversarial second org | Isolation | Not completed |

## Surface matrix

| # | Surface | Route | Primary job | Source of truth | Loading / empty / error | Residual notes |
|---|---------|-------|-------------|-----------------|-------------------------|----------------|
| 1 | Today | `/app` | What needs me + what Otzar completed | AmbientWorkSurface, DGI, actions, collab, team-work | Calm empty; errors soft-fail | Enhanced handled band + collab receipts (local) |
| 2 | Action Center | `/app/action-center` | Decisions + lifecycle | `api.actions.list` | Tabs; empty copy honest | SUCCEEDED≠“Sent”; FAILED/TIMED_OUT honest |
| 3 | Candidate review | Action Center / OrgTruth / Transcript | Accept candidates | PARTIAL rails | — | **NOT COMPLETE** product loop |
| 4 | People | `/app/collaboration` | Roster + help | contextHealth, collab API | Empty lists | **Receipt section added (local)** |
| 5 | Person detail | People → cockpit | One person | PersonCockpit | — | Browser pending |
| 6 | Projects | `/app/work-projects` | Project list | WorkProject | — | Browser pending |
| 7 | Project detail | project id | Members / work | WorkProject | — | Browser pending |
| 8 | Floating Talk | AmbientOtzarBar | Primary conversation | conductSession | — | Browser pending |
| 9 | Conversation history | `/app/voice` etc. | Continuity | conversations API | — | Browser pending |
| 10 | Connections | `/app/connector-health` | OAuth honesty | enterpriseTools | Reconnect labeled | Calendar VIEW only proven historically |
| 11 | Notifications | Bell | Alerts | Notification | — | Fanout not browser-proven |
| 12 | Approvals | Action Center pending + escalations | Human approval | Escalation | Dual-control block honesty | No second admin |
| 13 | Handoffs | Action Center | Incoming/outgoing | handoffs API | Ack from Today | PASS at API |
| 14 | Execution status | Action Center tabs | SUCCEEDED/FAILED/RUNNING | Action + attempts | RUNNING not “done” | Engine PASS |
| 15 | Proof | Action detail / capsule | Proof capsule | Action attempts + capsule | Progressive disclosure | API PASS; UI partial |
| 16 | Corrections | `/app/corrections` | Correction signals | correction APIs | — | Fanout **NOT PROVEN** across all surfaces |
| 17 | Memory | `/app/my-memory` | Capsules | wallet capsules | — | Browser pending |
| 18 | Work-style learning | work-style candidates | Style approve/reject | work-style API | — | Not launch candidates |
| 19 | Guided Setup | setup routes | Onboarding | setup services | — | Browser pending |
| 20 | Dandelion | setup / growth details | Growth suggestions | dandelion | Below fold on People | Browser pending |
| 21 | Preferences | `/app/preferences` | Prefs | prefs | — | Browser pending |
| 22 | Admin / users | `/users`, hubs | Authority | admin APIs | Synthetic filter P1 | Browser pending |
| 23 | More | Ambient More | Secondary | nav | — | Browser pending |
| 24–27 | Loading / empty / error / unauthorized | all | Honesty | — | Soft-fail common | Full matrix **NOT COMPLETE** |

## What is *not* claimed

- FOUNDER_EXPERIENCE_APPROVED  
- Full zero residual counts without screenshot evidence  
- Correction fanout across Today + Talk + notifications  
- Calendar beyond VIEW/UNDERSTAND  

## Next agent step

Credentialed Playwright/live browser with demo accounts (secrets from vault, never chat): founder → employee → manager → second-org isolation; fill `docs/testing/OTZAR_AUTHENTICATED_BROWSER_RESULTS.json` with screenshot paths.
