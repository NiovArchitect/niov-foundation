# OTZAR Global State and Context Model

**Date:** 2026-07-27  
**Purpose:** One coherent model for employee / manager / founder / admin projections.

## Layers

1. **Authentication state** — JWT in memory only (CT auth store). Refresh = re-login.
2. **Identity context** — entity_id, email, org membership, role/title, admin capabilities.
3. **Authority context** — permissions, twin grants, escalation rights, autonomy ceilings.
4. **Work context** — open obligations, handoffs, actions, ledger entries, projects, waiting-on.
5. **Memory context** — wallet-scoped capsules via COE; corrections; work-style prefs.
6. **Truth context** — OrgTruth records, conflicts, evidence weights (when promoted).
7. **Integration context** — connector OAuth status, last sync, external blocks.
8. **Coach context** — first-use walkthrough version, step index, completed/paused (local + best-effort server).

## Projection by role

| Role | Emphasize | Hide / soft-gate |
|------|-----------|------------------|
| Employee | Needs me, own work, Talk | Team capacity if unauthorized |
| Manager | Team work, blocked, approvals | Other teams' private memory |
| Founder/CEO | Decisions, momentum, blockers | Raw engineering harness |
| Admin | Setup, People, Connections, Governance, Dandelion queue | Commercial surfaces primary |

## Invariants

- Same org_entity_id across Today, People, Action Center, Twin, Admin.
- No cross-tenant data in any projection.
- LLM never chooses memory set (COE owns).
- Skip walkthrough ≠ complete walkthrough.
