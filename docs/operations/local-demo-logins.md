# Local Demo Logins — NIOV Labs Team

> **Local / staging only. Do not use in production.**
> Seeded by `scripts/demo-team-seed.ts` +
> `scripts/demo-collaboration-seed.ts`. Refuses to run unless
> `ALLOW_DEMO_SEED=true` OR `NODE_ENV != production` OR
> `DATABASE_URL` points at localhost.

## Org

| Field | Value |
|---|---|
| Org name | NIOV Labs |
| Org domain | niovlabs.com |
| Bootstrap-org email | `bootstrap-org@niovlabs.com` (system row; not a real user) |
| Collaboration policy | Autonomous Internal Flow (SAME_TEAM + SAME_PROJECT → ALLOW) |

## Founder

| Email | Password | Title | Capabilities |
|---|---|---|---|
| `sadeil@niovlabs.com` | `LocalTest-SafePassword-123!` | Founder & CEO | `can_admin_org`, `can_login`, `can_read_capsules`, `can_write_capsules`, `can_share_capsules`, `can_create_hives`, `can_access_external_api` |

Seeded by `scripts/founder-bootstrap.ts`. Re-running rotates the
password in place; if you supply `FOUNDER_BOOTSTRAP_PASSWORD` in the
environment it uses that, otherwise it generates + prints a one-time
random password.

## Teammates (all share one local-only password)

| Email | Password | Title | Twin email | Project memberships |
|---|---|---|---|---|
| `david@niovlabs.com` | `LocalTest-SafePassword-123!` | Tech Lead | `twin-david@niovlabs.com` | **Owner** of Foundation Runtime Deployment; member of Otzar Live Test + Enterprise Demo Readiness |
| `vishesh@niovlabs.com` | `LocalTest-SafePassword-123!` | AI UI Engineer | `twin-vishesh@niovlabs.com` | Otzar Live Test + Enterprise Demo Readiness |
| `samiksha@niovlabs.com` | `LocalTest-SafePassword-123!` | AI/NLP Engineer | `twin-samiksha@niovlabs.com` | Otzar Live Test + Foundation Runtime Deployment |
| `shweta@niovlabs.com` | `LocalTest-SafePassword-123!` | Go-to-Market Lead | `twin-shweta@niovlabs.com` | Enterprise Demo Readiness |
| `william@niovlabs.com` | `LocalTest-SafePassword-123!` | Product Lead | `twin-william@niovlabs.com` | **Owner** of Enterprise Demo Readiness; member of Otzar Live Test |
| `annie@niovlabs.com` | `LocalTest-SafePassword-123!` | Risk & Compliance Lead | `twin-annie@niovlabs.com` | Enterprise Demo Readiness |
| `walter@niovlabs.com` | `LocalTest-SafePassword-123!` | Media Lead | `twin-walter@niovlabs.com` | Enterprise Demo Readiness |

Each teammate has:
- a `PERSON` entity row + bcrypt-hashed password
- canonical `can_login` / `can_read_capsules` / `can_write_capsules` / `can_share_capsules` TAR flags (no admin)
- an `EntityMembership` row inside NIOV Labs (`is_active=true`, `role_title=<title>`)
- an `AI_AGENT` Twin child entity reachable from `EntityMembership(parent=person, child=twin, role_title="Digital Twin")`
- `WorkProjectMember` rows for every project listed above

## Projects

| Name | Owner |
|---|---|
| Otzar Live Test | Sadeil + per-user OWNER/MEMBER from the table above |
| Foundation Runtime Deployment | Sadeil + David (OWNER) + Samiksha (MEMBER) |
| Enterprise Demo Readiness | Sadeil + William (OWNER) + David, Vishesh, Shweta, Annie, Walter (MEMBER) |

## Seeded collaboration sessions

Seeded by `scripts/demo-collaboration-seed.ts`. Six sessions, full state matrix:

| # | Requester (Twin) | Target | State | Sensitivity | Project |
|---|---|---|---|---|---|
| 1 | Sadeil → David | Twin | IN_PROGRESS | MODERATE | Foundation Runtime Deployment |
| 2 | Sadeil → Vishesh | Twin | COMPLETED | LOW | Otzar Live Test |
| 3 | Sadeil → Samiksha | Twin | REQUESTED | MODERATE | Otzar Live Test |
| 4 | William → Shweta | Twin | ACCEPTED | MODERATE | Enterprise Demo Readiness |
| 5 | Annie → Sadeil | Person | NEEDS_APPROVAL | LEGAL | Enterprise Demo Readiness |
| 6 | Sadeil → Walter | Twin | BLOCKED (`MISSING_PROJECT_MEMBERSHIP`) | CUSTOMER_SENSITIVE | Enterprise Demo Readiness |

Every row is tagged `[DEMO]` in `safe_summary` so the seed can wipe
+ recreate cleanly on re-run.

## How to switch logins

1. Open the Login page at `http://localhost:5173/login` (or in the
   `Otzar.app` window).
2. In **DEV mode only**, the login form shows a "Local dev only —
   seeded demo accounts" picker. Click any tile to fill the email.
3. Paste the shared password `LocalTest-SafePassword-123!`.
4. Click Sign in.

Sadeil lands at the org-admin Control Tower (`/`); every other
teammate lands at `/app` (employee shell).

## Walkthrough — proving collaboration

| Step | What you should see |
|---|---|
| Log in as Sadeil | "Talk to Otzar" pill bottom-right; outbound collaboration sessions visible at `/app/collaboration` (David / Vishesh / Samiksha / Walter); inbound 1 (Annie's approval ask) |
| Log out, log in as David | Inbound 1 (Sadeil's "is runtime ready?" — IN_PROGRESS) at `/app/collaboration` |
| Log in as Annie | Outbound 1 (NEEDS_APPROVAL); sees Sadeil's pending sign-off |
| Log in as Walter | Inbound 1 (BLOCKED — `MISSING_PROJECT_MEMBERSHIP`); demonstrates the policy-blocker rendering path |

## How to re-seed

```sh
cd niov-foundation
set -a; . ./.env.demo.local; set +a

# Founder (rotates password — capture from stdout)
FOUNDER_BOOTSTRAP_PASSWORD=LocalTest-SafePassword-123! \
  npx tsx scripts/founder-bootstrap.ts

# 7 teammates + Twins + project memberships
DEMO_TEAM_PASSWORD=LocalTest-SafePassword-123! \
  npx tsx scripts/demo-team-seed.ts

# 6 collaboration sessions (idempotent — wipes prior `[DEMO]` rows first)
npx tsx scripts/demo-collaboration-seed.ts
```

## Security posture

- The 8 demo passwords live ONLY in this doc + the seed script
  defaults. They are explicitly NOT production-safe.
- No real customer data is ever ingested by these scripts.
- Each seed script refuses to run when `DATABASE_URL` doesn't point
  at localhost (unless `ALLOW_DEMO_SEED=true` is also set, which
  Founder-only production deployments would gate at the env-injection
  tier).
- Re-running rotates passwords in place; old hashes are overwritten.
- Demo collaboration rows are tagged `[DEMO]` in `safe_summary` and
  wiped on every re-run; production collaboration rows are never
  touched.
