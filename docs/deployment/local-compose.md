# Local Docker Compose

`docker-compose.local.yml` brings up the full Foundation + Otzar
backend stack in containers on a single host.

## What runs

| Service | Container | Port | Image source |
|---|---|---|---|
| Postgres 16 + pgvector | `niov-local-pg` | 5433 → 5432 | `pgvector/pgvector:0.8.2-pg16-trixie` |
| Foundation API | `niov-local-foundation-api` | 3000 | `./Dockerfile` |
| Python intelligence | `niov-local-python-intelligence` | 8000 | `./services/python-intelligence/Dockerfile` |
| Collaboration Supervisor (BEAM) | `niov-local-collaboration-supervisor` | 4001 | `./apps/collaboration_supervisor/Dockerfile` |

Control Tower runs separately via Vite (`npm run dev`) and points at
the Foundation API at `http://localhost:3000`.

## Boot

```sh
# from the niov-foundation repo root
docker compose -f docker-compose.local.yml up --build -d

# Apply schema + audit triggers AFTER Postgres is healthy.
# These run against the compose Postgres at localhost:5433.
npm run db:push:test
npx tsx scripts/apply-audit-triggers.ts

# Then bring up Control Tower in a second terminal.
cd ../otzar-control-tower
echo "VITE_API_BASE_URL=http://localhost:3000/api/v1" > .env.local
npm install
npm run dev
```

## Verify

```sh
curl -s http://localhost:3000/health | jq                          # Foundation
curl -s http://localhost:8000/health | jq                          # Python
curl -s http://localhost:4001/health | jq                          # BEAM
curl -s http://localhost:8080/healthz                              # CT (when running via Dockerfile instead of Vite)
```

## Tear down

```sh
docker compose -f docker-compose.local.yml down -v
```

`down -v` removes the `niov_local_pg` volume — your local Postgres
data is wiped. Drop the `-v` if you want to keep it.

## Three-tier credential separation

This compose file ONLY carries **NIOV PLATFORM** local-dev secrets
(JWT_SECRET / ENCRYPTION_KEY / DATABASE_URL) and the local-dev string
values are explicitly NOT production-safe. Production values must
come from Azure Key Vault / AWS Secrets Manager per
`docs/deployment/cloud-portability.md` §2.1.

**Customer connector keys** (Slack / Microsoft 365 / Google
Workspace / Jira / Linear / GitHub etc.) do NOT appear here. Each
customer connects their own tools through the per-tenant connector
onboarding flow; secrets live at `niov/tenants/{org_entity_id}/...`
vault paths. See `docs/deployment/secrets-inventory.md`.

**Employee-scoped grants** (TwinAuthorityGrant) live in Postgres as
governed substrate; no compose configuration touches them.

## Customizing ports

Edit the `ports:` entries in `docker-compose.local.yml`. The Foundation
API container reaches sibling services via the compose network, so
internal hostnames (`postgres`, `python-intelligence`,
`collaboration-supervisor`) work even when host-side port mappings
change.

## When NOT to use this

- Production deployments: use `docs/deployment/azure-deployment.md` or
  `docs/deployment/aws-deployment.md`.
- Test tiers: the existing `docker-compose.test.yml` is the
  test-database-only compose per ADR-0011 / ADR-0013.
- CI: GitHub Actions services blocks per `.github/workflows/ci.yml`.
