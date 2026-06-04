# Azure-First Deployment

> **Default target.** Azure is the preferred cloud per Founder
> direction. Foundation + Otzar deploy cleanly on Azure today; AWS
> remains fully supported per `aws-deployment.md` because of the
> substrate posture in `cloud-portability.md`.

## 1. Target topology

| Component | Azure target | Notes |
|---|---|---|
| Foundation API | Azure Container Apps **or** Azure App Service | Container Apps preferred for HTTP autoscale + revisions; App Service for simpler workloads |
| Control Tower | Azure Static Web Apps **or** Azure App Service | Static Web Apps preferred for the Vite SPA |
| Database | Azure Database for PostgreSQL — Flexible Server | with `pgvector` extension enabled |
| Secrets | Azure Key Vault | three-tier separation per `cloud-portability.md` §2 |
| Container registry | Azure Container Registry (ACR) | push from CI |
| Observability | Application Insights + Log Analytics | OTLP-compatible exporter wired to `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Optional NIOV LLM | Azure OpenAI | platform-tier only — customer-owned model keys live in tenant vault paths per §4 |
| Optional NIOV voice | Azure AI Speech | only if the Founder authorizes a hosted voice path |

## 2. Provisioning order (Azure CLI sketch)

```sh
# Variables
ENV=staging
LOCATION=eastus
RG=niov-${ENV}
KV=niov-${ENV}-kv
ACR=niov${ENV}acr        # ACR name rules: lowercase, no dashes
PG=niov-${ENV}-pg
APP=niov-${ENV}-api
CT=niov-${ENV}-ct

# Resource group
az group create -n $RG -l $LOCATION

# Key Vault
az keyvault create -n $KV -g $RG -l $LOCATION --enable-rbac-authorization true

# Container Registry
az acr create -n $ACR -g $RG -l $LOCATION --sku Standard --admin-enabled false

# PostgreSQL Flexible Server with pgvector
az postgres flexible-server create \
  -n $PG -g $RG -l $LOCATION \
  --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16 \
  --admin-user otzar \
  --admin-password "$(openssl rand -base64 24)" \
  --public-access 0.0.0.0
# Enable pgvector
az postgres flexible-server parameter set \
  -g $RG -s $PG --name azure.extensions --value vector
# Create the DB
az postgres flexible-server db create -g $RG -s $PG -d foundation

# Container Apps environment
az containerapp env create \
  -n niov-${ENV}-env -g $RG -l $LOCATION

# Foundation API container app
az containerapp create \
  -n $APP -g $RG \
  --environment niov-${ENV}-env \
  --image $ACR.azurecr.io/niov/foundation-api:initial \
  --ingress external --target-port 3000 \
  --secrets database-url=@$KV/niov-platform-${ENV}-database-url \
            jwt-secret=@$KV/niov-platform-${ENV}-jwt-secret \
            encryption-key=@$KV/niov-platform-${ENV}-encryption-key \
  --env-vars DATABASE_URL=secretref:database-url \
             JWT_SECRET=secretref:jwt-secret \
             ENCRYPTION_KEY=secretref:encryption-key \
             CORS_ORIGIN=https://${CT}.azurestaticapps.net \
             PUBLIC_APP_URL=https://${APP}.${LOCATION}.azurecontainerapps.io \
             LOG_LEVEL=info \
             AUDIT_LOG_LEVEL=info \
             METRICS_ENABLED=true \
             CONNECTOR_WRITE_ENABLED=false \
             PAYMENT_RAILS_ENABLED=false \
             LIVE_MIC_CAPTURE_ENABLED=false
```

## 3. Key Vault layout

```
niov/platform/{environment}/
├── database-url
├── direct-url
├── jwt-secret
├── encryption-key
├── application-insights-connection-string
├── azure-openai-api-key           (optional, NIOV-tier only)
└── ...

niov/tenants/{org_entity_id}/
├── connectors/{connection_id}/secret
└── mcp/{mcp_connection_id}/secret
```

The `niov/tenants/...` paths are **per-tenant** — each customer's
connector and MCP credentials live under their own org entity_id
prefix. The Foundation API uses Managed Identity to read these
paths at runtime; customer admins write them through the Control
Tower connector onboarding flow (forward-substrate).

## 4. Customer-owned vs NIOV-owned credentials on Azure

NIOV-owned (`niov/platform/...`):
- Foundation infra: DB / JWT / encryption / observability.
- Optional NIOV-hosted LLM provider key — only if NIOV is reselling
  inference to its customers.
- Optional NIOV-hosted voice provider key — only if NIOV is
  reselling voice.

Customer-owned (`niov/tenants/{org_entity_id}/...`):
- Customer Microsoft 365 OAuth.
- Customer Slack workspace app.
- Customer Google Workspace OAuth.
- Customer Jira / Atlassian / Linear / Salesforce / HubSpot /
  GitHub / GitLab / Notion / Confluence OAuth.
- Customer-supplied model provider key (if the customer brings
  their own Anthropic / OpenAI / Azure OpenAI subscription).
- Customer-supplied voice provider key (if the customer brings
  their own Azure Speech / Eleven Labs / etc.).
- Customer internal API tokens.
- Customer MCP server credentials.

NIOV must NEVER store customer keys in the platform vault paths.

## 5. Application Insights wiring

Set `AZURE_APPLICATIONINSIGHTS_CONNECTION_STRING` from the
deployed Application Insights resource. The Foundation API's Pino
logger ships structured JSON; an Application Insights agent (or an
OTLP exporter pointing at App Insights' OTLP ingestion endpoint)
picks them up.

## 6. CI/CD on GitHub Actions → Azure

```
build → npm install + npm run build (Foundation + Control Tower)
test  → npm run test:unit + npm run test:integration (Foundation)
        npm test (Control Tower)
image → az acr build -t $ACR.azurecr.io/niov/foundation-api:${{ sha }} .
deploy staging → az containerapp update --name $APP -g $RG \
                   --image $ACR.azurecr.io/niov/foundation-api:${{ sha }}
                 with GitHub environment protection
smoke → docs/operations/smoke-test-checklist.md
```

**No live deploy step runs without an authorized GitHub
environment.** The deploy workflow is forward-substrate until the
Founder authorizes a staging or production environment with
appropriate environment protection rules.
