# OTZAR Identity and Fixture Hygiene Audit

**Date:** 2026-07-27  
**Status:** IN PROGRESS — server filter landed; rows not deleted  
**Slice 1:** Frontend display filter only  
**Slice 2 (this):** Server-side `org_roster` + team-work filter  

## Problem

Founder-facing People/Talk projected **rc2-admin-*+sadeil@niovlabs.com** as coworkers. These are live Entity + membership rows created by RC2 multi-admin / dual-control tests (`RC2_SECOND_ADMIN_PROOF.md`), not human teammates.

Frontend filtering (CT `synthetic-principal.ts`) stopped UI leak. It does **not** stop:

- LLM org_roster (identity-context)
- team-work capacity aggregation
- hierarchy membership counts that still include synthetic children (partial)
- metrics inflation if not filtered at source
- admin Users screen if it lists all entities (admin may still see them)

## Classification

| Pattern | Class | Origin | Founder-facing |
|---------|-------|--------|----------------|
| `rc2-admin-*+sadeil@niovlabs.com` | test-only principal | RC2 second-admin / dual-control live tests | **HIDE** (filter) |
| `r03-s250+…@niovlabs.com` | pressure-test principal | R-03 S250 provision scripts | **HIDE** |
| Allowlist demo team (`sadeil`, `david`, `annie`, `william`, `shweta`, `walter`, `vishesh`, `samiksha`) | approved demo / real team | `provision-demo-team-accounts.ts` | **SHOW** |
| bootstrap-org@niovlabs.com | system org entity | demo bootstrap | not PERSON coworker |
| S250 synthetic graph (local harness) | test-only | `synthetic-s250/` | not production-facing when isolated |

## Verified allowlist (demo script)

From `scripts/provision-demo-team-accounts.ts` ALLOWLIST:

| Email | Display | Title |
|-------|---------|-------|
| sadeil@niovlabs.com | Sadeil Lewis | Founder & CEO |
| david@niovlabs.com | David Odie | Tech Lead |
| vishesh@niovlabs.com | Vishesh Sharma | AI UI Engineer |
| samiksha@niovlabs.com | Samiksha Sharma | AI/NLP Engineer |
| shweta@niovlabs.com | Shweta | Go-to-Market Lead |
| william@niovlabs.com | William | Product Lead |
| annie@niovlabs.com | Annie | Risk & Compliance Lead |
| walter@niovlabs.com | Walter | Media Lead |

**Note:** Prompt mentioned Annie as engineer/researcher and Will as CPO — **script truth** is Annie = Risk & Compliance Lead, William = Product Lead. Do not overwrite without Founder confirmation.

**Sumeet:** not on allowlist — must not invent operations role.

## Trace matrix (rc2-admin class)

| Surface | Before | After Slice 2 |
|---------|--------|---------------|
| CT People directory | filtered CT | still filtered CT |
| CT People structure | filtered CT | still filtered CT |
| identity-context org_roster → Talk LLM | **leaked** | **filtered server** |
| team-work-summary people | **leaked** | **filtered server** |
| hierarchy membership rows | still in DB | still in DB (admin Users may show) |
| obligations owned by synthetic | possible | capacity view ignores them |
| Delete rows | not done | not done (RULE 10 + dependency risk) |

## Decisions

1. **Filter, do not delete** synthetic principals in product projections (RULE 10; test re-use).  
2. **Shared pure detector** on Foundation + CT (same patterns).  
3. **Future:** tag entities with `fixture_class` column (optional ADR) for durable classification.  
4. **Admin Users:** may retain visibility for operators with clear “test account” badge (forward).  

## Implementation

- `apps/api/src/services/otzar/synthetic-principal.ts`  
- Wired: `identity-context.ts`, `team-work-summary.service.ts`  
- Tests: `tests/unit/synthetic-principal.test.ts`  

## Residual risk

- Hierarchy API still returns synthetic memberships; CT structure filters names.  
- Admin CT `/users` may still list them.  
- Metrics endpoints not fully audited.  
- Soft-delete / archive campaign for rc2-admin rows is **forward-queued** after dependency inventory.  
