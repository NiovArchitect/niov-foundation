# OTZAR Team Truth Reconciliation (proposed)

**Date:** 2026-07-27  
**Sources:** `scripts/provision-demo-team-accounts.ts` ALLOWLIST + founder direction  
**Rule:** Do not silently rewrite authority or hierarchy without conflict resolution  

| Email | Current script display | Current script title | Founder direction | Proposed display title | Functional role | Authority (script) | Conflict? |
|-------|------------------------|----------------------|-------------------|------------------------|-----------------|--------------------|-----------|
| sadeil@niovlabs.com | Sadeil Lewis | Founder & CEO | Founder and CEO | Founder & CEO | Org admin + founder | can_admin_org | **NONE** |
| david@niovlabs.com | David Odie | Tech Lead | Technical Lead | Tech Lead | Engineering lead | base TAR | **NONE** (wording only) |
| annie@niovlabs.com | Annie | Risk & Compliance Lead | Senior Engineer and Researcher | **NEEDS FOUNDER** | Engineering/research vs compliance | base TAR | **YES** — title conflict |
| william@niovlabs.com | William | Product Lead | CPO / Product Lead | **NEEDS FOUNDER** | Product | base TAR | **YES** — CPO vs Product Lead |
| shweta@niovlabs.com | Shweta | Go-to-Market Lead | Marketing / GTM | Go-to-Market Lead | GTM | base TAR | **NONE** (synonym) |
| walter@niovlabs.com | Walter | Media Lead | Video / Media | Media Lead | Media | base TAR | **NONE** (synonym) |
| vishesh@niovlabs.com | Vishesh Sharma | AI UI Engineer | Keep if supported | AI UI Engineer | Experience engineering | base TAR | **NONE** |
| samiksha@niovlabs.com | Samiksha Sharma | AI/NLP Engineer | Keep if supported | AI/NLP Engineer | Intelligence engineering | base TAR | **NONE** |
| Sumeet | (not on allowlist) | — | Must not label Ops unless verified | **Do not invent** | — | — | **NONE** if absent |

## Manager / hierarchy

Not re-written this session. Soft-isolation of synthetics does not change allowlist reporting lines.  
Live hierarchy edges require authenticated inventory after soft-isolate apply.

## AI Teammate templates

Forward: map titles to existing role templates in `apps/api/templates/roles` without inventing new authority.

## FOUNDER APPROVAL REQUIRED

1. Annie: Risk & Compliance Lead **vs** Senior Engineer and Researcher  
2. William: Product Lead **vs** CPO  

All other rows are non-conflicting wording alignment.  
