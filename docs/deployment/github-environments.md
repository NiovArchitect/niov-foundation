# GitHub Environments + Deploy Workflows

Documents the `staging` and `production` GitHub Environments the
`.github/workflows/deploy-staging.yml` and `deploy-production.yml`
workflows consume, plus the per-environment secrets/vars layout.

## Environment-protection posture

Per the [FOUNDER-AUTH — FULL DEPLOYED RUNTIMES] directive:

- **`production` requires explicit Founder authorization** as a required
  reviewer (configure via Settings → Environments → production →
  Deployment protection rules).
- **`staging` MAY auto-deploy from main** after CI is green, but
  configure a wait timer (e.g., 5 minutes) so an oncoming rollback is
  cheap.
- Branch restrictions: `production` should be limited to `main` and to
  release tags; `staging` to `main`.

## Per-environment configuration

Each environment carries its own **variables** (non-secret config) and
**secrets** (cloud credentials). The cleanest split:

### Repository variables (apply to all environments)

| Name | Purpose |
|---|---|
| _none required_ | All cloud target config lives at environment scope |

### Environment variables (per environment)

| Name | Example value (staging) | Example value (production) |
|---|---|---|
| `CLOUD_TARGET` | `azure` | `azure` |
| `STAGING_PUBLIC_URL` / `PRODUCTION_PUBLIC_URL` | `https://api.staging.niov.example.com` | `https://api.niov.example.com` |
| `AZURE_RESOURCE_GROUP` | `niov-staging` | `niov-prod` |
| `AZURE_CONTAINER_APP_NAME` | `niov-staging-api` | `niov-prod-api` |
| `AZURE_CONTAINER_REGISTRY` | `niovstagingacr` | `niovprodacr` |
| `AWS_REGION` | `us-east-1` | `us-east-1` |
| `AWS_ECS_CLUSTER` | `niov-staging` | `niov-prod` |
| `AWS_ECS_SERVICE` | `foundation-api` | `foundation-api` |

### Environment secrets (per environment)

Only the cloud the customer chose needs to be populated.

**Azure target:**

| Secret | Purpose |
|---|---|
| `AZURE_CLIENT_ID` | OIDC service principal client ID |
| `AZURE_TENANT_ID` | Azure tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription |

**AWS target:**

| Secret | Purpose |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | OIDC-assumable role ARN granting ECR + ECS access |

## Customer-tenant secrets DO NOT belong here

Per `docs/deployment/cloud-portability.md` §2.2 (three-tier credential
separation), customer connector and MCP secrets live at
`niov/tenants/{org_entity_id}/...` vault paths — NEVER as GitHub
Actions secrets. The deploy workflows enforce this by NOT requesting
any customer credential.

## Graceful no-op posture

When `CLOUD_TARGET` is unset on an environment (the default for a
fresh repo), the deploy workflows exit 0 with an explanatory notice
rather than failing. This keeps `push` to main green while the
Founder configures the environment.

## What this PR does NOT do

- Does NOT create the GitHub environments themselves (that is repo-
  admin configuration outside the workflow file).
- Does NOT actually run cloud deploy commands (the commands are
  emitted as `::notice::` lines until credentials are verified).
- Does NOT push images to a registry (Phase 4 lays the workflow
  scaffold; registry push is a follow-on PR after the registry
  itself is provisioned).

The substrate is ready; activation is a configuration step.
