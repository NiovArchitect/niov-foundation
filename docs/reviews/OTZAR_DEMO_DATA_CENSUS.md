# OTZAR Demo Data Census

**Date:** 2026-07-27  
**Status:** DOCUMENT + classification (no mass mutation this commit)

## Seed / provision surfaces (code)

| Script / path | Role | Environment |
|---------------|------|-------------|
| `scripts/provision-demo-team-accounts.ts` | NIOV Labs org + 8 allowlisted people | Prod-connected demo (approval-gated) |
| `scripts/demo-team-seed.ts` | Localhost team seed | localhost |
| `scripts/demo-seed.ts` | Broad demo seed | localhost |
| `scripts/provision-demo-twins.ts` | Twins for demo people | gated |
| `scripts/provision-demo-dgi-work.ts` | DGI work objects | gated |
| `scripts/demo-collaboration-seed.ts` | Collab fixtures | gated |
| CT `src/lib/org/synthetic-s250/` | Structural S250 graph | unit / internal |
| CT `scripts/otzar-r03-s250-live-provision.mjs` | Live pressure accounts | operator-only |
| Live RC2 multi-admin POST /org/members | rc2-admin-* | production-adjacent (problem) |

## Object classes in product DB (models)

Entity, EntityMembership, EntityProfile, TwinConfig, WorkProject*, Obligation, Handoff, Action*, WorkLedgerEntry, ExecutionAttempt, Notification, OtzarConversation*, MemoryCapsule, MeetingCapture*, WorkComms*, IntegrationCredential, ConnectorBinding, OrgTruth*, TwinCollaborationRequest, TwinAuthorityGrant, TwinCorrectionMemory, Hierarchy memberships, …

## Classification policy

| Class | Action |
|-------|--------|
| Allowlisted demo team + their real work | **retain** |
| rc2-admin / r03-s250 / load-test | **isolate** (filter projections); archive later |
| Localhost-only seeds | **test-only** |
| Conflicting duplicate stories | **merge/rewrite** in narrative plan |
| Orphan work without owner | **archive** or re-own to allowlist |

## Current noise sources (evidence)

1. **RC2 second-admin principals** in same org as founder demo  
2. **S250 / R-03** pressure emails if provisioned against live org  
3. **Multiple seed generations** without retirement  
4. **Title drift** (script titles vs informal role language)  

## Next mutation (requires Founder QLOCK)

- Soft-tag or move synthetic memberships out of founder org primary hive  
- Or create dedicated `NIOV Test Lab` org for synthetic principals  
- Never delete audit/obligation history (RULE 10)  
