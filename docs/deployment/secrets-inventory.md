# Secrets Inventory

> **Canonical list** of every secret the Foundation + Otzar platform
> ever touches. Each row names the secret, who owns it, where it
> lives, and when it must be set.
>
> **Three-tier separation discipline.** Per the FOUNDER-CLARITY
> customer-owned-API-keys directive: NIOV platform secrets, customer
> tenant secrets, and employee-scoped grants are kept apart. NIOV
> Labs does NOT centralize customer API keys.

## 1. Tier 1 — NIOV Platform secrets

Owned by NIOV Labs. Required for the platform to boot.

### 1.1 Core auth + storage

| Secret | Required? | Vault path | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | `niov/platform/{env}/database-url` | Postgres connection string (Azure DB / RDS / self-hosted) |
| `DIRECT_URL` | optional | `niov/platform/{env}/direct-url` | Prisma direct (bypass pooler) — for `db:push` / migrations |
| `JWT_SECRET` | yes | `niov/platform/{env}/jwt-secret` | session token signing key (≥32 bytes) |
| `ENCRYPTION_KEY` | yes | `niov/platform/{env}/encryption-key` | 32-byte content-encryption key |

### 1.2 Cloud deployment (Tier 1 — CI/CD only)

Azure CI/CD:
- `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET` (service principal for GitHub Actions →
  Azure deploy). Stored as **GitHub environment secrets** with
  environment protection rules.
- `AZURE_RESOURCE_GROUP`, `AZURE_KEY_VAULT_NAME`,
  `AZURE_CONTAINER_REGISTRY_NAME` — non-secret; stored as
  workflow vars.

AWS CI/CD:
- OIDC-based federated identity preferred (`AWS_GITHUB_OIDC_ROLE_ARN`).
- Fallback (avoid in production): `AWS_ACCESS_KEY_ID` +
  `AWS_SECRET_ACCESS_KEY` as GitHub environment secrets.

### 1.3 Optional NIOV-tier LLM (only when NIOV is reselling inference)

| Secret | Owner | Notes |
|---|---|---|
| `LLM_PROVIDER` | NIOV | `azure_openai` / `openai` / `anthropic` / `local` / `mock` |
| `AZURE_OPENAI_ENDPOINT` | NIOV | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | NIOV | Azure OpenAI subscription key |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | NIOV | Specific model deployment |
| `OPENAI_API_KEY` | NIOV | only if `LLM_PROVIDER=openai` for NIOV-hosted inference |
| `ANTHROPIC_API_KEY` | NIOV | only if `LLM_PROVIDER=anthropic` for NIOV-hosted inference |
| `MODEL_ROUTER_DEFAULT_MODEL` | NIOV | default model id when LLM router is enabled |

**If a customer brings their own LLM subscription**, that key is a
Tier 2 (tenant) secret stored at the tenant vault path — NEVER at
the platform path.

### 1.4 Optional NIOV-tier voice (only when NIOV hosts voice)

| Secret | Owner | Notes |
|---|---|---|
| `VOICE_PROVIDER` | NIOV | `text_only` / `local_mock` / `self_hosted_csm1b` / `external` |
| `VOICE_OUTPUT_ENABLED` | NIOV | default `false` |
| `LIVE_MIC_CAPTURE_ENABLED` | NIOV | default `false` |
| `RAW_AUDIO_RETENTION_ENABLED` | NIOV | default `false` |
| `CSM1B_MODEL_PATH` | NIOV | local file path to a self-hosted CSM-1B model |
| `CSM1B_RUNTIME_URL` | NIOV | URL of a hosted CSM-1B runtime |
| `AZURE_SPEECH_KEY` | NIOV | only if Azure Speech is chosen as the NIOV-hosted voice provider |
| `AZURE_SPEECH_REGION` | NIOV | matching region |
| `TTS_PROVIDER` / `STT_PROVIDER` | NIOV | future provider keys; not set today |

### 1.5 Optional NIOV-tier billing

| Secret | Owner | Notes |
|---|---|---|
| `BILLING_PROVIDER` | NIOV | `mock` / `provider_later` (no live billing today) |
| `STRIPE_SECRET_KEY` | NIOV | only after Founder-authorized billing provider decision |
| `STRIPE_WEBHOOK_SECRET` | NIOV | only if Stripe is enabled |
| `PAYMENT_RAILS_ENABLED` | NIOV | default `false` |

### 1.6 Observability (Tier 1)

| Secret | Owner | Notes |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | NIOV | OTLP collector endpoint |
| `SENTRY_DSN` | NIOV | Sentry project DSN (optional) |
| `AZURE_APPLICATIONINSIGHTS_CONNECTION_STRING` | NIOV | when deployed on Azure |
| `AWS_CLOUDWATCH_LOG_GROUP` | NIOV | when deployed on AWS |
| `LOG_LEVEL` | NIOV | `info` / `debug` / `warn` / `error` |
| `AUDIT_LOG_LEVEL` | NIOV | same vocab |
| `METRICS_ENABLED` | NIOV | `true` / `false` |

### 1.7 Security posture

| Secret | Owner | Notes |
|---|---|---|
| `DATA_RETENTION_MODE` | NIOV | `standard` / `extended` / `regulatory` |
| `AUDIT_RETENTION_DAYS` | NIOV | default `365` |
| `RAW_TRANSCRIPT_RETENTION_ENABLED` | NIOV | default `false` |
| `CHAIN_OF_THOUGHT_STORAGE_ENABLED` | NIOV | default `false` |
| `KMS_KEY_ID` / `AZURE_KEY_VAULT_KEY_NAME` | NIOV | for at-rest encryption integration |

### 1.8 Python intelligence runtime (Tier 1)

| Secret | Owner | Notes |
|---|---|---|
| `PYTHON_INTELLIGENCE_RUNTIME_URL` | NIOV | blank → fixture fallback (Phase 5 default) |
| `PYTHON_RUNTIME_ENABLED` | NIOV | `true` / `false` |
| `PYTHON_RUNTIME_TIMEOUT_MS` | NIOV | default `1500` |
| `PYTHON_FIXTURE_MODE` | NIOV | `true` → force fixture even if URL is set |

### 1.9 BEAM coordination runtime (Tier 1)

| Secret | Owner | Notes |
|---|---|---|
| `BEAM_RUNTIME_URL` | NIOV | blank → TS-projection fallback (Phase 6 default) |
| `BEAM_RUNTIME_ENABLED` | NIOV | `true` / `false` |
| `BEAM_COOKIE` | NIOV | only if distributed Erlang is used |
| `BEAM_NODE_NAME` | NIOV | only if distributed |

## 2. Tier 2 — Customer / tenant secrets

Owned by **each customer**. Stored at tenant-scoped vault paths.
**NEVER** stored as global platform env vars. **NEVER** committed
to `.env.example`. **NEVER** shared across tenants.

Vault path pattern:
- Azure → `niov/tenants/{org_entity_id}/connectors/{connection_id}/secret`
- Azure (MCP) → `niov/tenants/{org_entity_id}/mcp/{mcp_connection_id}/secret`
- AWS → `niov/tenants/{org_entity_id}/connectors/{connection_id}/secret`
- AWS (MCP) → `niov/tenants/{org_entity_id}/mcp/{mcp_connection_id}/secret`

Application tables store `secret_ref` (vault path) only — never the
raw secret. Existing canonical example: `ConnectorBinding.secret_ref`.

### 2.1 Connector OAuth / API keys (customer-owned)

| Provider | Auth mode | When set |
|---|---|---|
| Google Workspace | OAuth2 | customer admin connects through Control Tower |
| Microsoft 365 | OAuth2 | customer admin connects through Control Tower |
| Slack workspace | OAuth2 / App token | customer admin connects through Control Tower |
| Jira / Atlassian | OAuth2 / API token | customer admin connects through Control Tower |
| Linear | OAuth2 | customer admin connects through Control Tower |
| Salesforce | OAuth2 | customer admin connects through Control Tower |
| HubSpot | OAuth2 / API key | customer admin connects through Control Tower |
| GitHub / GitLab | OAuth2 / PAT | customer admin connects through Control Tower |
| Notion / Confluence | OAuth2 | customer admin connects through Control Tower |
| Internal customer API | API key | customer admin connects through Control Tower |

### 2.2 MCP server credentials (customer-owned)

| Field | Notes |
|---|---|
| `server_url` | customer's MCP endpoint |
| `auth_mode` | `OAUTH2` / `API_KEY` / `SERVICE_ACCOUNT` / `MCP_AUTH` / `NONE_FOR_LOCAL_MOCK` |
| `secret_ref` | tenant vault path |
| `allowed_tool_names` | customer admin chooses which tools their employees can use |
| `tool_policy_mode` | `READ_ONLY` / `APPROVAL_REQUIRED` / `BLOCKED_BY_DEFAULT` |

### 2.3 Customer-supplied model/voice provider keys (optional)

If a customer brings their own LLM or voice provider:

- Customer's `OPENAI_API_KEY` → tenant vault path.
- Customer's `ANTHROPIC_API_KEY` → tenant vault path.
- Customer's `AZURE_OPENAI_*` → tenant vault path.
- Customer's `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` → tenant vault path.
- Customer's `ELEVENLABS_API_KEY` → tenant vault path (only after
  customer explicit provider decision).

These are NEVER mixed with NIOV's platform-tier provider keys.

## 3. Tier 3 — Employee-scoped grants

Stored in Postgres, not in a secrets vault. Visible to the employee
who owns them; not visible to admins or NIOV operators in raw form
unless the employee explicitly shares.

| Substrate | Storage | Owner-visible |
|---|---|---|
| `TwinAuthorityGrant` (EDX-4) | `twin_authority_grants` | yes (Control Tower `/app/authority-grants`) |
| `TwinCorrectionMemory` (EDX-5) | `twin_correction_memories` | yes (Control Tower `/app/preferences`) |
| `TwinCollaborationRequest` (EDX-6) | `twin_collaboration_requests` | yes (Control Tower `/app/collaboration`) |
| `WorkProjectMember` (Phase 1) | `work_project_members` | yes (Control Tower `/app/work-projects/:id/members`) |
| `ConsentGrant` (DM1-A) | `consent_grants` | yes (Control Tower) |
| `Receipt` (DM1-B) | `receipts` | yes (Control Tower) |

These have closed-vocab state machines, audit lineage via
`ADMIN_ACTION` + `details.action` discriminator, and are revocable
by the owner at any time.

## 4. Required-by-environment matrix

| Secret | Local dev | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | yes (`.env.local`) | yes (vault) | yes (vault) |
| `JWT_SECRET` | yes (`.env.local`) | yes (vault) | yes (vault) |
| `ENCRYPTION_KEY` | yes (`.env.local`) | yes (vault) | yes (vault) |
| `CONNECTOR_WRITE_ENABLED` | `false` | `false` | only with Founder authorization |
| `LIVE_MIC_CAPTURE_ENABLED` | `false` | `false` | only with legal/retention/provider decision |
| `PAYMENT_RAILS_ENABLED` | `false` | `false` | only with explicit billing provider decision |
| `RAW_AUDIO_RETENTION_ENABLED` | `false` | `false` | `false` (default; only after explicit authorization) |
| `RAW_TRANSCRIPT_RETENTION_ENABLED` | `false` | `false` | `false` (default; only after explicit authorization) |
| `CHAIN_OF_THOUGHT_STORAGE_ENABLED` | `false` | `false` | `false` (always; structural posture) |

## 5. What the Founder needs to provide

To deploy the platform itself:
- Cloud account credentials (Azure subscription + service
  principal, OR AWS account + IAM role) — Tier 1.
- Database connection string for the platform DB — Tier 1.
- JWT signing key, encryption key — Tier 1 (generated, not provided
  externally).

To deploy with NIOV-hosted AI/voice:
- Choose `LLM_PROVIDER` (Azure OpenAI / OpenAI / Anthropic / local /
  mock). Supply provider key only if NIOV is hosting inference.
- Choose `VOICE_PROVIDER` (text_only / local_mock / self_hosted_csm1b
  / external). For today's tests, `text_only` requires no key.

**The Founder does NOT need to provide customer Slack/Google/
Microsoft/etc. keys.** Each customer admin connects their own tools
through Control Tower; those keys live at tenant vault paths.
