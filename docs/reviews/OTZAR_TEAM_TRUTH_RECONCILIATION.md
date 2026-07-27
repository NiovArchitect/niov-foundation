# OTZAR Team Truth Reconciliation

**Date:** 2026-07-27  
**Sources:** `scripts/provision-demo-team-accounts.ts` ALLOWLIST + founder direction  
**Rule:** Title / role-template display only — do **not** silently rewrite authority, hierarchy, approvals, org ownership, tool authority, or data visibility.

## Founder title decisions (AUTHORIZED)

| Person | Canonical email | Display name | Previous title | **Authorized display title** | Functional role (internal) | Authority | Manager | Conflict resolved? |
|--------|-----------------|--------------|----------------|------------------------------|----------------------------|-----------|---------|--------------------|
| Sadeil Lewis | sadeil@niovlabs.com | Sadeil Lewis | Founder & CEO | Founder & CEO | Org admin + founder | can_admin_org (unchanged) | — | YES |
| David Odie | david@niovlabs.com | David Odie | Tech Lead | Tech Lead (Technical Lead synonym) | Engineering lead | base TAR (unchanged) | Sadeil (expected) | YES |
| **Annie** | annie@niovlabs.com | Annie | Risk & Compliance Lead | **Senior Engineer and Researcher** | Engineering / research | base TAR (**no change**) | Sadeil (expected) | **YES — founder resolved** |
| **William / Will** | william@niovlabs.com | William | Product Lead | **CPO** | Product (Product Lead functional OK internally) | base TAR (**no change**) | Sadeil (expected) | **YES — founder resolved** |
| Shweta | shweta@niovlabs.com | Shweta | Go-to-Market Lead | Go-to-Market Lead | Marketing / GTM | base TAR | Sadeil (expected) | YES |
| Walter | walter@niovlabs.com | Walter | Media Lead | Media Lead | Video / Media | base TAR | Sadeil (expected) | YES |
| Vishesh Sharma | vishesh@niovlabs.com | Vishesh Sharma | AI UI Engineer | AI UI Engineer (retain if verified live) | Experience engineering | base TAR | Sadeil (expected) | retain only if live-verified |
| Samiksha Sharma | samiksha@niovlabs.com | Samiksha Sharma | AI/NLP Engineer | AI/NLP Engineer (retain if verified live) | Intelligence engineering | base TAR | Sadeil (expected) | retain only if live-verified |
| Sumeet | (not on allowlist) | — | — | **Do not invent** | — | — | — | Do **not** label Operations unless org truth proves it |

## Mutation scope for title reconciliation

**AUTHORIZED mutations only:**

- `Entity.display` fields / membership `role_title` string for Annie → `Senior Engineer and Researcher`
- membership `role_title` string for William → `CPO`
- AI-Teammate **role template selection** if currently bound to compliance/product-lead labels solely because of the old title (template label only; no permission expansion)

**FORBIDDEN without separate approval:**

- permissions / TAR flags
- hierarchy edges / manager rewrites
- approval rights / dual-control bindings
- organization ownership
- tool authority / connector scopes
- data visibility / wallet access

**AUTHORITY CHANGES FROM TITLE RECONCILIATION: 0** (title strings only)

## Affected surfaces (title string consumers)

| Surface | How title appears |
|---------|-------------------|
| People / org roster | membership `role_title` / profile job_title |
| My Twin / AI-Teammate | role_template label may lag until re-mapped |
| Admin users | role_title column |
| Talk / team-work capacity | may show role labels if projected |
| provision-demo-team-accounts.ts | ALLOWLIST `title` field (source of future provision) |

## Affected tests

| Test / seed | Change |
|-------------|--------|
| `tests/unit/synthetic-principal.test.ts` | allowlist emails unchanged; titles not asserted |
| `scripts/provision-demo-team-accounts.ts` | ALLOWLIST titles for Annie + William |
| demo seed docs (`docs/operations/local-demo-logins.md`) | display titles aligned |
| Live integration smoke asserting "Risk & Compliance" or "Product Lead" | update expected display string only |

## AI-Teammate role template

| Person | Prior template cue | Proposed template selection | Authority impact |
|--------|--------------------|----------------------------|------------------|
| Annie | finance-analyst / compliance-adjacent if any | software-engineer or research-aligned template if available | **none** (template label) |
| William | product-manager | product-manager or CPO-equivalent product template if exists | **none** |

Do not invent a new privileged template.

## Live apply status

| Step | Status |
|------|--------|
| Founder title decision recorded | **DONE** |
| Source ALLOWLIST titles updated | pending same commit |
| Production membership role_title apply | **BLOCKED** — secure prod DB path required (Render job / valid DATABASE_URL) |
| Hierarchy / authority re-verify after apply | pending live inventory |

## Manager / hierarchy

Soft-isolation of synthetics does not change allowlist reporting lines.  
Live hierarchy edges require authenticated inventory after soft-isolate apply on production.
