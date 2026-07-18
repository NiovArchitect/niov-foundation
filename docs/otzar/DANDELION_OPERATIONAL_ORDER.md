# Dandelion Operational Order

> How Otzar grows an organization without mass invites, auto-grants, or forcing
> people to live inside Otzar. Complements ADR-0082 activation catalogs.
> Experience law: **ambient, autonomous, non-blocking DGI**.

## Canonical phrase

**Otzar listens. Work lands in the right place. Humans stay in their flow.
Growth stays governed.**

Users do **not** live in Otzar. Otzar is the ambient layer that moves company
goals forward with domain-general intelligence — not another dashboard for
managers and admins to babysit.

## Experience law (non-negotiable)

| Law | Meaning |
|-----|---------|
| **Ambient** | Surfaces only when real state needs a human; otherwise quiet |
| **Autonomous** | Otzar routes, claims, and notifies without requiring a daily login ritual |
| **Non-blocking** | Gaps become light work + optional notice — never admin homework storms |
| **Governed** | Membership, tools, and identity still need authority; never silent grants |

## Five layers (strict order)

| # | Layer | What happens | Human burden |
|---|--------|--------------|--------------|
| **1** | **Listen** | Workstream + org graph | None |
| **2** | **Discover** | Structure / tool / identity signals | None (ephemeral or seed) |
| **3** | **Seed** | Durable proposal when policy cares | Admin oversight only when needed |
| **4** | **Route (ambient grow)** | Task + notification to the **right authority** (manager, project lead) | One light item in their existing Work OS / inbox — not a new app home |
| **5** | **Act** | Human places person / connects tool when it fits their day | Optional, non-nagging |

Admin **Organization Seeding** is an **oversight** surface (policy, hold/reject,
exceptions) — **not** where daily placement work is done.

## Who places people on projects

| Role | Authority |
|------|-----------|
| **Manager of the person** | Places reports onto projects they lead (OWNER) |
| **Project owner / lead** | Invites people onto their project |
| **Org admin** | Exception / bootstrap only — not the default path |

## Structure gap path (example)

```
Listen: member has no ACTIVE project
  → Discover (org-growth)
  → Seed (ORG_SEEDING, oversight)
  → Ambient: TASK on manager's My Work + calm notification
  → Manager (when ready): Projects → add person, or Talk to Otzar
  → Membership written under project-owner / manager authority
```

No auto-membership. No admin forced to pick a project for every person.

## Seed types (registry)

| Seed type | Ambient grow behavior |
|-----------|------------------------|
| `add_project_membership` | Route placement task to manager; admin may hold/reject |
| `grant_tool_access` / `connector_setup` | Setup TASK — never auto-grant access |
| `confirm_or_activate_person` / `resolve_identity` | Identity / activation path |
| `review_external_party` | Admin (or policy) review before track |

## Invariants

1. Never mass-invite or invent people from noise  
2. Never auto-grant tools or membership  
3. `ORG_SEEDING` excluded from employee My Work (oversight lane)  
4. Placement tasks **do** appear on the **manager’s** My Work (action lane)  
5. Tenant isolation + audit on membership writes  
6. Employee UI never becomes a Dandelion control panel  

## Related

- Ambient Work OS Design Law §3 Dandelion Propagation Law  
- `dandelion-growth.service.ts` · `dandelion-seed.service.ts` · `work-project.service.ts`  
- Phase C Twin work claim (same ambient “Twin is on this” pattern)
