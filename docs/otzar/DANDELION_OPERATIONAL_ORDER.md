# Dandelion Operational Order

> How Otzar grows an organization without mass invites, auto-grants, or dashboard chaos.
> Canonical product order for Phase A. Complements ADR-0082 activation catalogs
> (maturity stages A–F) — this document is the **day-to-day operational spine**.

## Canonical phrase

**Otzar listens. Seeds land. Admins choose. Growth stays governed.**

Dandelion never mass-invites, never auto-creates people from noise, never grants
access on approve, and always reconnects activation to the company root (org,
policy, role, audit).

## Five layers (strict order)

| # | Layer | What it is | Substrate (already exists) | Who |
|---|--------|------------|----------------------------|-----|
| **1** | **Listen** | Work evidence + org graph facts | Comms ingest, work-graph events, entity membership, projects | System |
| **2** | **Discover** | Calm recommendations (ephemeral) | `GET /otzar/dandelion/org-growth` | Admin read |
| **3** | **Seed** | Durable, approval-gated proposals | `ORG_SEEDING` ledger rows · `GET /org/dandelion/seeds` | Admin queue |
| **4** | **Govern** | Approve / hold / reject | seed lifecycle · never auto-apply | Admin write |
| **5** | **Grow** | Next governed step only | setup TASK, external track, assignment prompt | Human does work |

Employee **onboarding pollination** (`/otzar/dandelion/onboarding`) is a parallel
self-scoped path — consent-gated memory only; never admin topology.

Activation **envelope plans** (docs/dandelion-activation, Stage F) are the
**plan-tier** map for first-time org setup. Operational Dandelion (this file)
is the **ongoing** map after the org is live.

## Root-first triage (admin seed queues)

When seeds land, admins review in this order — structure before tools:

1. **People Otzar heard about** — activate / resolve identity (can't route work without people)
2. **Structure — projects & teams** — first project, membership, support roles
3. **Tools Otzar noticed** — connector / grant_tool_access (setup action only)
4. **External collaborators** — review before tracking (no auto-promote)
5. **Ambiguous / low confidence** — confirm before acting
6. **Held** — paused
7. **Resolved** — approved / rejected / applied

## Seed type vocabulary (single registry)

| Seed type | Layer 3 meaning | On approve (layer 5) |
|-----------|-----------------|----------------------|
| `confirm_or_activate_person` | Person from workstream | Next governed step (no auto-invite) |
| `resolve_identity` | Who is this? | Confirm identity |
| `add_project_membership` | Needs first project / workspace | Setup TASK: assign to a project — **no auto-membership** |
| `add_team_membership` | Team structure | Setup TASK — no auto-join |
| `confirm_support_role` | Support edge, not owner | Confirm role |
| `add_work_owner_edge` | Ownership relationship | Confirm owner |
| `grant_tool_access` / `connector_setup` | Tool gap from real work | Setup TASK — **access NOT granted** |
| `review_external_party` | External mention | Track or link — **no access grant** |

## Discovery → Seed bridge (operational path)

Org-growth recommendations (layer 2) must be able to **land as seeds** (layer 3)
so structure gaps are not a separate dead-end list.

- `POST /org/dandelion/seeds/sync-from-growth` (admin)
- Idempotent: one open seed per `(seed_type, subject_entity_id)` 
- Sources: `needs_first_project_people` → `add_project_membership`
- Never writes membership; never invites; never grants tools

## Invariants (do not break)

1. No auto-invite, auto-user-create from noise, or auto-grant on approve  
2. `ORG_SEEDING` excluded from My Work / Team Work  
3. Tenant isolation on every seed load  
4. Every transition audits `ADMIN_ACTION`  
5. Employee surfaces never show admin Dandelion jargon  
6. Work-evidence seeds and structure seeds share **one** admin queue  

## Related

- ADR-0082 Dandelion Activation Architecture (+ Amendment 1)  
- Ambient Work OS Design Law §3 Dandelion Propagation Law  
- `dandelion-growth.service.ts` · `dandelion-seed.service.ts` · `work-graph-memory.ts`  
- CT: Organization Seeding (`/organization-seeding`)
