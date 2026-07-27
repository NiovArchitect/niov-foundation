# OTZAR Demo Data Dependency Map

**Date:** 2026-07-27

```
Entity (PERSON)
  → EntityMembership (org)
  → TAR / Wallet
  → TwinConfig + AI_AGENT child (optional)
  → WorkProjectMember
  → Obligation (subject)
  → Handoff (party)
  → Action / WorkLedgerEntry
  → Notification
  → TwinCollaborationRequest
  → MemoryCapsule (wallet)
  → org_roster (identity-context)  [FILTER synthetic]
  → team-work-summary              [FILTER synthetic]
  → CT People directory            [FILTER synthetic]
```

## Critical edges for synthetic retirement

| If we remove membership of rc2-admin | Risk |
|--------------------------------------|------|
| Open obligations subject | orphan work visible under other filters |
| Hierarchy edges | admin structure tools still need care |
| Dual-control audit rows | keep forever |
| Login still possible | account remains; just not coworker-projected |

## Safe order

1. Filter all product projections (DONE Slice 1 UI + Slice 2 server roster/team)  
2. Inventory open work owned by synthetic IDs (SQL/ops — needs live DB credentials)  
3. Re-own or complete that work  
4. Soft-deactivate membership (is_active=false) not hard delete  
5. Keep Entity for audit referential integrity  
