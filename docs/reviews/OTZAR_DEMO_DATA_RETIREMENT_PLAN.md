# OTZAR Demo Data Retirement Plan

**Status:** PLANNED — no destructive run this session  
**Authority:** Founder QLOCK required before membership deactivation on production-adjacent DB

## Phase R1 — Projection hygiene (IN FLIGHT)

- [x] CT display filter  
- [x] Foundation org_roster filter  
- [x] Foundation team-work people filter  
- [ ] Hierarchy list endpoints filter (if any return peer emails)  
- [ ] Admin Users badge “Test account”  

## Phase R2 — Live inventory (requires DEMO_SHARED_PASSWORD + DB)

Query:

```sql
-- illustrative; run only with explicit operator approval
SELECT email, display_name, entity_id, status
FROM entities
WHERE entity_type = 'PERSON'
  AND (
    email ILIKE '%rc2-admin%'
    OR email ILIKE 'rc2-%'
    OR email ILIKE '%r03-s250%'
  );
```

Then inventory obligations/handoffs by those entity_ids.

## Phase R3 — Soft isolate

- Set `entity_membership.is_active = false` for synthetic in founder org  
- Or move membership to dedicated test org  
- Do **not** DELETE  

## Phase R4 — Test isolation

- RC2 multi-admin tests create principals in **test schema / test org only**  
- Never POST /org/members synthetic admins into investor production org  

## Phase R5 — Narrative rebuild

- Align titles with Founder-confirmed roles  
- Seed only objects on the YC operating narrative  
