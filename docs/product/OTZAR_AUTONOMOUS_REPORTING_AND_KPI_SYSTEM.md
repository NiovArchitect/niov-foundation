# OTZAR Autonomous Reporting and KPI System

**Date:** 2026-07-28  
**Status:** Doctrine + partial live projections (Today, team-work, action lists)  

## Intent

Role-appropriate management signal updates from **real events** — not a human assembling status decks.

## Personas

| Persona | Autonomous signal |
|---------|-------------------|
| **Employee** | What changed · what Otzar handled · what needs me · blocked · next priority |
| **Manager** | Team movement · blockers · ownership gaps · handoffs · approvals · cycle · AI collab · risk |
| **Executive** | Objective progress · material change · blockers · decisions needed · work done · proof · exception rate · improvement trends |

## Signal compression

- Do not show every operational event.  
- Group communications under secondary lane.  
- Prefer outcomes over activity counts.  
- Exception rate is more useful than approval volume.

## Live substrate

| Signal | Source |
|--------|--------|
| What matters / completed / team / secondary comms | `founder-signal-hierarchy` + AmbientWorkSurface |
| Team open work | `GET /otzar/team-work` |
| Action SUCCEEDED/FAILED | `GET /actions` + Action Center |
| Collab receipts | Collaboration People surface |
| Approvals count | Presence + escalations |

## Forward

- Named KPI catalog with event-sourced refresh  
- Exception accuracy / intervention rate dashboards  
- Manager pack without Control Tower scavenger hunt  

## Honesty

Reports must not invent metrics. Prefer **absent** over **fake green**.
