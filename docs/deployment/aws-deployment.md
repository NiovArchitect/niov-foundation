# AWS-Compatible Deployment

> **Posture.** AWS is fully supported because of the cloud-portability
> commitment in `cloud-portability.md`. Use AWS when the customer's
> existing infrastructure is AWS-centric. Azure remains the default
> target (see `azure-deployment.md`).

## 1. Target topology

| Component | AWS target |
|---|---|
| Foundation API | ECS Fargate **or** App Runner |
| Control Tower | S3 + CloudFront **or** App Runner |
| Database | RDS for PostgreSQL with `pgvector` extension |
| Secrets | AWS Secrets Manager |
| Container registry | ECR |
| Observability | CloudWatch Logs / Metrics; optional X-Ray |
| Optional LLM (NIOV-tier) | Bedrock |

## 2. Provisioning order (AWS CLI sketch)

```sh
ENV=staging
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO=niov/foundation-api
RDS_ID=niov-${ENV}-pg

# ECR
aws ecr create-repository --repository-name $ECR_REPO --region $REGION

# RDS Postgres 16 with pgvector
aws rds create-db-instance \
  --db-instance-identifier $RDS_ID \
  --engine postgres --engine-version 16 \
  --db-instance-class db.t4g.small \
  --master-username otzar \
  --master-user-password "$(aws secretsmanager get-random-password --query RandomPassword --output text)" \
  --allocated-storage 20 \
  --region $REGION
# After provisioning, enable pgvector:
#   psql … -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Secrets Manager paths (see §3)
aws secretsmanager create-secret \
  --name niov/platform/${ENV}/database-url \
  --secret-string "postgresql://…" \
  --region $REGION
```

## 3. Secrets Manager layout

```
niov/platform/{environment}/
├── database-url
├── jwt-secret
├── encryption-key
├── cloudwatch-log-group
└── ...

niov/tenants/{org_entity_id}/
├── connectors/{connection_id}/secret
└── mcp/{mcp_connection_id}/secret
```

Same three-tier separation as Azure — NIOV platform paths and
per-tenant paths are distinct prefixes, never mixed. The
Foundation API uses an IAM role (instance / task / App Runner
role) to read these paths at runtime.

## 4. ECS Fargate task definition (sketch)

```json
{
  "family": "niov-foundation-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "<account>.dkr.ecr.<region>.amazonaws.com/niov/foundation-api:<sha>",
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:niov/platform/staging/database-url"},
        {"name": "JWT_SECRET",   "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:niov/platform/staging/jwt-secret"},
        {"name": "ENCRYPTION_KEY","valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:niov/platform/staging/encryption-key"}
      ],
      "environment": [
        {"name": "CORS_ORIGIN",       "value": "https://ct.staging.example.com"},
        {"name": "PUBLIC_APP_URL",    "value": "https://api.staging.example.com"},
        {"name": "LOG_LEVEL",         "value": "info"},
        {"name": "AUDIT_LOG_LEVEL",   "value": "info"},
        {"name": "METRICS_ENABLED",   "value": "true"},
        {"name": "CONNECTOR_WRITE_ENABLED",   "value": "false"},
        {"name": "PAYMENT_RAILS_ENABLED",     "value": "false"},
        {"name": "LIVE_MIC_CAPTURE_ENABLED",  "value": "false"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/niov/foundation-api",
          "awslogs-region": "<region>",
          "awslogs-stream-prefix": "api"
        }
      }
    }
  ]
}
```

## 5. Customer-owned vs NIOV-owned credentials on AWS

Same three-tier separation. NIOV-owned secrets at
`niov/platform/...` paths; customer-owned secrets at
`niov/tenants/{org_entity_id}/...` paths. Foundation API uses its
task role to read these paths; customer admins write them via the
Control Tower connector onboarding flow.

NIOV must NEVER store customer keys at platform paths.

## 6. Bedrock (optional NIOV-tier LLM)

```
AWS_BEDROCK_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-6-20251122-v1:0
```

These live at `niov/platform/{environment}/aws-bedrock-*` and are
only set if NIOV chooses Bedrock as its hosted-LLM provider for a
particular environment. Customers who bring their own Anthropic /
OpenAI subscription store those keys at their tenant paths.

## 7. CloudWatch wiring

The Foundation API's Pino logger ships JSON to stdout; the ECS
`awslogs` driver forwards to CloudWatch. For OTEL metrics, set
`OTEL_EXPORTER_OTLP_ENDPOINT` to a collector running in the same
VPC; the collector forwards to CloudWatch Metrics or to a managed
OTLP backend.

## 8. CI/CD on GitHub Actions → AWS

```
build → npm install + npm run build (Foundation + Control Tower)
test  → npm run test:unit + npm run test:integration (Foundation)
        npm test (Control Tower)
image → docker build + aws ecr get-login-password +
        docker tag + docker push
deploy staging → aws ecs update-service --force-new-deployment
                 with GitHub environment protection
smoke → docs/operations/smoke-test-checklist.md
```

No live deploy step runs without an authorized GitHub environment.
