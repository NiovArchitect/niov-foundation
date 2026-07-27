# OTZAR RC2 — Whole-System Dependency Graph

**Status:** CURRENT for Signal Freeze  
**Date:** 2026-07-27

```
Identity (Session JWT)
  → Role / capabilities (isOrgAdmin, etc.)
    → First-use walkthrough plan (role steps)
    → Today (AmbientWorkSurface) bands
    → People (hierarchy + directory)
    → Action Center (actions, escalations, handoffs, ledger)
    → Talk / Twin
         ├─ WORK_OS_QUERIES → durable surfaces (team-work, needs me, today)
         └─ conductSession → COE → MemoryCapsule + authority
    → Connections (OAuth status honest)
    → Admin shell (setup, governance, hubs)
         └─ Dandelion seeding engine (preserved under Organization)

Shared truth substrates (Foundation — do not rewrite):
  WorkLedgerEntry · Action* · Obligation · Handoff
  OrgTruth* · TwinCorrectionMemory · dgi-coherence · team-work-summary
  Connector OAuth · Permission / Escalation / BreakGlass
```

## Cross-surface rules

| From | Depends on | Must not |
|------|------------|----------|
| Today "what changed" | dgi-coherence + handoffs + twin_work | Invent activity |
| People structure | org.hierarchy | Expose unauthorized peers |
| Action Center | action + work-os APIs | Fake obligations |
| Twin team status | team-work route / summary | LLM hallucination when data exists |
| Connections | oauth status | Claim Meet live if blocked |
| Walkthrough | first-use state | Complete on Skip |
| Admin Dandelion | growth/seed APIs | Delete engine for UI cleanup |

## Integration cell decisions

| Cell | Decision |
|------|----------|
| C1 Experience | Skip = pause; Restart after complete; Talk z-65 > coach z-45 |
| C4 Twin ground | Expand WORK_OS_QUERIES; no conductSession rewrite |
| C2 People | Structure glance sticky + scroll-into-view |
| C5 Connections | No code change; honesty already doctrine |
| C6 Admin | No commercial nav re-enable |
