# Cloud Portability Posture

> **What this is.** The canonical statement of how NIOV Foundation +
> Otzar deploy to cloud, what secrets go where, and the three-tier
> separation between platform, tenant, and employee credentials.
>
> **Companion files.** `azure-deployment.md` (Azure-first targets) /
> `aws-deployment.md` (AWS-compatible targets) / `secrets-inventory.md`
> (named secrets and where each one lives).

## 1. Cloud portability commitment

Per ADR-0018 (Deployment-Target Agnosticism Posture), Foundation is
**provider-agnostic** at the substrate tier:

- Postgres is Postgres. Azure Database for PostgreSQL, AWS RDS for
  PostgreSQL, and self-hosted Postgres all work because the storage
  contract is Postgres-compatible.
- Secrets are vault-backed. Azure Key Vault and AWS Secrets Manager
  both satisfy the rule. Local dev uses `.env.local` (never
  committed).
- Container image is the deployable. We build one image per app and
  publish it to a registry the target cloud can read (ACR for Azure,
  ECR for AWS).
- Observability is pluggable. Application Insights, CloudWatch, or
  any OTLP endpoint can ingest the structured Pino logs and OTEL
  metrics.

**Default target today: Azure.** AWS is fully supported because of
the substrate posture; pick the target that matches the customer's
existing infra.

## 2. Three-tier credential separation — CRITICAL

There are three distinct classes of credentials. **They must not be
mixed.**

### 2.1 NIOV platform secrets
Owned by NIOV Labs. Used to run the Foundation + Otzar platform
itself.

Examples: `DATABASE_URL` for the platform-hosted DB, `JWT_SECRET` for
auth, `ENCRYPTION_KEY` for content encryption, observability keys,
cloud deployment credentials (Azure subscription / AWS account
credentials used by CI/CD), an optional NIOV-hosted LLM provider key,
an optional NIOV-hosted voice provider key, an optional NIOV billing
provider key.

Storage:
- **Azure** → `niov/platform/{environment}/*` in Azure Key Vault.
- **AWS** → `niov/platform/{environment}/*` in Secrets Manager.
- **CI/CD** → GitHub environment secrets (with environment protection
  rules where appropriate).
- **Local dev** → `.env.local` (never committed; gitignored).

These secrets are NEVER:
- exposed to customer admins,
- shown in Control Tower,
- echoed in audit / log payloads,
- committed,
- shared across tenants.

### 2.2 Customer / tenant secrets
Owned by each customer / company / tenant. Used to connect the
**customer's own** tools (their Slack workspace, their Microsoft 365,
their Google Workspace, their Jira, their Linear, their internal
APIs, their MCP servers, their model/voice providers if they choose
to bring their own).

Storage pattern (per directive):
- **Azure** → `niov/tenants/{org_entity_id}/connectors/{connection_id}/secret`
- **Azure (MCP)** → `niov/tenants/{org_entity_id}/mcp/{mcp_connection_id}/secret`
- **AWS** → `niov/tenants/{org_entity_id}/connectors/{connection_id}/secret`
- **AWS (MCP)** → `niov/tenants/{org_entity_id}/mcp/{mcp_connection_id}/secret`

Application tables store a `secret_ref` (the vault path) — **never** a
raw secret. The existing `ConnectorBinding.secret_ref` pattern is the
canonical example.

These secrets are NEVER:
- listed in `.env.example`,
- exposed as global platform env vars,
- pulled from a NIOV-owned vault path,
- visible to NIOV operators without explicit time-bounded
  audited support-access grants,
- visible to other tenants.

Forward-substrate connector framework (architecture documented in
the FOUNDER-CLARITY directive on tenant-owned API keys):
- `ConnectorProviderDefinition` — catalog of supported providers
  with auth modes and write-mode defaults.
- `TenantConnectorConnection` — per-tenant connection metadata
  carrying `secret_ref`.
- `ConnectorScopeGrant` — per-team / per-project / per-employee
  scope.
- `McpServerConnection` + `McpToolPolicy` — MCP rails with
  per-tool policy.

Each customer admin connects their own tools through the Control
Tower onboarding flow. NIOV provides the framework; NIOV does NOT
own customer keys.

### 2.3 Employee-scoped grants
Owned by individual employees. The EDX-4 `TwinAuthorityGrant`
substrate is the canonical example. Employees grant their AI Twin
authority to act on their behalf — one-time / session / short-term /
project-scoped / long-term / indefinite / until-revoked /
sensitive-case-by-case.

These grants:
- Are stored in `twin_authority_grants` with a closed-vocab state
  machine.
- Are visible to the employee via `/app/authority-grants`.
- Are NEVER visible to admins or NIOV operators in raw form unless
  the employee explicitly shares them.
- Cannot exceed org policy.
- Are revocable by the employee at any time.

## 3. Required platform env vars (today)

The minimum set Foundation needs to boot. See `.env.example` at
the repo root for the canonical template.

```
# Core
DATABASE_URL              # Postgres connection string
DIRECT_URL                # optional — Prisma migrations bypass pooler
JWT_SECRET                # auth token signing key
ENCRYPTION_KEY            # 32-byte content encryption key
CORS_ORIGIN               # comma-separated allowed origins
PUBLIC_APP_URL            # https URL of Foundation API
CONTROL_TOWER_URL         # https URL of Control Tower
LOG_LEVEL                 # info / debug / warn / error
AUDIT_LOG_LEVEL           # info / debug / warn / error

# Python intelligence runtime (optional; fixture-first fallback)
PYTHON_INTELLIGENCE_RUNTIME_URL  # blank → fixture fallback
PYTHON_RUNTIME_ENABLED           # true / false
PYTHON_RUNTIME_TIMEOUT_MS        # default 1500
PYTHON_FIXTURE_MODE              # true → force fixture fallback

# BEAM coordination runtime (optional; fallback to TS projection)
BEAM_RUNTIME_URL                 # blank → fallback
BEAM_RUNTIME_ENABLED             # true / false

# Voice (forward-substrate; default off)
VOICE_PROVIDER                   # text_only / local_mock / self_hosted_csm1b / external
VOICE_OUTPUT_ENABLED             # default false
LIVE_MIC_CAPTURE_ENABLED         # default false
RAW_AUDIO_RETENTION_ENABLED      # default false

# Connectors (Founder-gated; default off)
CONNECTOR_WRITE_ENABLED          # default false

# Billing (no live provider today)
BILLING_PROVIDER                 # mock / provider_later
PAYMENT_RAILS_ENABLED            # default false

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT      # optional OTLP endpoint
SENTRY_DSN                       # optional Sentry DSN
METRICS_ENABLED                  # true / false

# Security
DATA_RETENTION_MODE              # standard / extended / regulatory
AUDIT_RETENTION_DAYS             # default 365
CHAIN_OF_THOUGHT_STORAGE_ENABLED # default false
```

**Customer connector keys are NOT here.** Each customer connects
their own tools through the Control Tower per-tenant flow; the
secret lives in their tenant-scoped vault path.

## 4. Health endpoints

Every deployment exposes:

- `/health` — Foundation API liveness.
- `/ready` — DB connectivity + audit-trigger health.
- (forward-substrate) `/health/python` — fixture mode or live URL
  status when the Python ranker is exercised.
- (forward-substrate) `/health/beam` — DISABLED / READY_NOT_ACTIVE /
  ACTIVE / UNREACHABLE per the BEAM Collaboration Handoff Supervisor.

Control Tower health is verified by Vite's `npm run build` succeeding
and by the CT vitest suite running green.

## 5. Container readiness audit

Foundation API: TypeScript + Fastify; Node 22.x; Prisma client
generated at build time. The image needs `node:22-alpine` (or a
compatible LTS slim image) and a `db:push` step at first boot.

Control Tower: Vite + React. Static build artifacts served by any
static-file host (Azure Static Web Apps, AWS S3 + CloudFront, an
nginx sidecar in front of the API, etc.).

If a `Dockerfile` is missing for either app, treat that as
forward-substrate per the deployment phase that lands the
container image. The runbook section below documents the
expected build steps.

## 6. CI/CD readiness

Today's GitHub Actions workflow (`.github/workflows/ci.yml`)
verifies build correctness (typecheck / unit tier / integration tier
/ Elixir tier) on every PR. **No live deploy steps run from CI
today.** The runbook below shows the planned shape; do not enable
any live deploy without explicit Founder authorization.

```
build:           npm install + npm run build
test:            npm run test:unit + npm run test:integration
docker build:    docker build -t niov/foundation-api:${{ sha }} .
docker push:     login to ACR / ECR + push
deploy staging:  az containerapp update / aws ecs update-service
                 (with environment protection)
smoke after:     run docs/operations/smoke-test-checklist.md
```
