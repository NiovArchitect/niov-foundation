# OOTB Catalog — Role Depth Layer (Wave 2.1)

> Per `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]` + `[FOUNDER-ADDENDUM-OTZAR-ADMINISTRATOR-AS-FIRST-CLASS-ROLE]` + `[FOUNDER-ADDENDUM-OTZAR-ADMIN-TWIN-AS-FIRST-CHAMPION-DGI-EXPERIENCE]`.

## What this directory is

Markdown-first, model-readable role-depth files that turn the Wave 2 starter-depth catalog into Domain General Intelligence substrate. Each file follows a canonical 27-section structure designed for model cognition + admin reading + future Dandelion consumption.

These files are **template metadata**. They are **not** permissions. They are **not** live connectors. They are **not** runtime activation. The governed envelope (per ADR-0080 Amendment 1) still applies.

Canonical lines preserved:
- "Otzar is Domain General Intelligence inside governed enterprise boundaries."
- "Dandelion shapes the starter profile; the DMW scopes memory; Foundation governance authorizes use."
- "Templates describe useful defaults. Governed envelopes define how those defaults may be used."
- "The Otzar Admin is the first champion of the company's governed intelligence layer."
- "The Admin Twin should make governance feel intelligent, not administrative."
- "Admins govern how memory is scoped; they do not get blanket access to private memory."
- "Each company's intelligence remains inside its own governed silo."
- **"Dandelion is not just onboarding; Dandelion is organizational seeding intelligence."**
- **"Admins govern the setup. Dandelion guides and accelerates the setup. Foundation authorizes activation. DMWs scope memory."**
- **"Dandelion maps the enterprise so Otzar can become useful without forcing the customer to hand-configure everything from zero."**
- **"Dandelion produces proposed maps. Foundation turns approved maps into governed capability."**

## Why Markdown

JSON is good for machines. Markdown is good for model cognition. Each role-depth file is read both ways:

- Models (Digital Twin substrate, Admin Twin synthesis) read the Markdown verbatim — it is the role's operating manual.
- Tools (validators, future Dandelion engine, future CT consumption) read the JSON index at `role-depth-index.json` for stable machine references.

## Canonical section structure

Every role-depth file uses these 27 sections in order. Sections may be brief in roles where the section has limited content, but they should not be skipped.

```
1.  Role summary
2.  Common titles
3.  Likely reports to
4.  Possible reports to
5.  Likely direct reports
6.  Possible direct reports
7.  Dotted-line relationships
8.  Cross-functional partners
9.  External collaborators
10. Core responsibilities
11. Common decisions
12. Common meetings
13. Common documents / artifacts
14. Common metrics / KPIs
15. Common tools
16. Common workflows
17. Approval authority
18. Approval dependencies
19. Delegated authority
20. Never-default permissions
21. Digital Twin day-one capabilities
22. First-week aha moments
23. Safe fallback without connectors
24. Connector implications
25. DMW / Memory Wallet scope notes
26. Governed context envelope notes
27. Collaboration map (upward / downward / peer / cross-functional / external / approval / escalation)
28. Risks and guardrails
29. Industry / company-size variants
```

## Files (Wave 2.1 v1 — DEEP roles + bounded summaries)

DEEP — full canonical depth per Founder direction:

- `otzar-administrator.md` — first-class role + Admin Twin first DGI champion
- `executive-assistant.md` — Wave 2 deepest example, ported into the role-depth format
- `ceo-founder.md`
- `cto.md`
- `product-owner-product-manager.md`
- `software-engineer.md`

SUBSTANTIVE — canonical depth, bounded:

- `board-member.md`
- `cmo.md`
- `coo.md`
- `cfo.md`
- `chro.md`
- `general-counsel.md`
- `project-program-manager.md`
- `ai-engineer-ml-engineer.md`
- `researcher-data-scientist-ux-researcher.md`
- `public-relations-communications.md`
- `sales-manager-account-executive.md`
- `customer-success-support-lead.md`
- `it-security-grc.md`
- `operations-manager.md`
- `general-employee-individual-contributor.md`

Total: 21 deep / substantive Markdown role files + this README + `role-depth-index.json` (machine-readable cross-reference).

## Out of scope (preserved)

- NO new Prisma schema
- NO routes, services, runtime activation
- NO permission grants from these templates
- NO connector code / OAuth / secrets
- NO Digital Twin profile creation
- NO LLM / Python / BEAM
- NO new audit literal
- NO mutation to existing `apps/api/src/services/governance/dandelion.service.ts`
- NO billing implementation
- NO Workflows runtime

Per `[FOUNDER-DOMAIN-GENERAL-OTZAR-ACTIVATION-EXPANSION-AUTH]`: subsequent ADRs (Workflows / Dandelion Activation / Billing / Connector Strategy) come AFTER Wave 2.1, in their own bounded slices.

## How Wave 4+ will consume this

When Dandelion Activation (Wave 4) lands, the recommendation engine reads:

1. `roles.json` for stable IDs + envelope metadata + connector preset references
2. `role-depth/<slug>.md` for human-readable role context + Admin / Twin reasoning substrate
3. `role-depth-index.json` for cross-references (which roles feed which workflows / aha moments / Dandelion question sets)

The Admin Twin (the first DGI experience) reads the Markdown verbatim to reason about company readiness, rollout planning, connector risk, policy gaps, and onboarding progress.

## Governance posture (universal across all role-depth files)

- Read-only by default.
- Write actions require explicit delegated authority.
- Approval gates for risky actions; dual-control for highest-risk.
- DMW / Memory Wallet scopes memory; admins govern policy, not private content.
- Forbidden inferences absolute: no employee scoring, no manager surveillance, no psychological profiling, no protected-attribute inference, no cross-tenant data leakage, no surveillance framing.
- Regulator-ready vocabulary per ADR-0070 (never claim "guaranteed compliant" / "regulator approved" / "no fine risk").

## See also

- ADR-0080 §Amendment 5 — Wave 2.1 closeout
- `../README.md` — Wave 2 catalog overview
- `../catalog.schema.json` — Wave 2 envelope schema
- `../connector-priority-matrix.md` — Wave 6 derived ranking
- `docs/architecture/decisions/0080-…ontology.md` — full ADR
