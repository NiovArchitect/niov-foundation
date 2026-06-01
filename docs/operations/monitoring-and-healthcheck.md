# Foundation Monitoring + Healthcheck Guidance

## 1. FILE / PURPOSE / CONNECTS TO

**FILE**: `docs/operations/monitoring-and-healthcheck.md`

**PURPOSE**: Operator-facing guidance for what to monitor in production, how to interpret the existing `/api/v1/health` endpoint, what alerting policies to configure, and what observability is *intentionally deferred* (e.g., Prometheus / OpenTelemetry full integration per GOVSEC.2). Closes the "metrics / dashboards / alerting / monitoring deferred" gap surfaced by Section 10 production-readiness audit (PR #164) — at the *documentation* register; implementation deferred to the dedicated GOVSEC.2 wave.

**CONNECTS TO**:

- `docs/operations/deployment-runbook.md` §12 (observability foundation)
- `docs/operations/rollback-runbook.md` §2 (rollback trigger signals come from here)
- `docs/operations/smoke-test-checklist.md` (continuous-cadence smoke)
- `docs/operations/admin-bootstrap-runbook.md` (bootstrap observability)
- ADR-0002 (audit chain — primary observability signal)
- ADR-0019 (cryptographic-suite posture — secret-handling discipline)
- ADR-0049 (GOVSEC umbrella; GOVSEC.2 = future Prometheus/OTel integration wave)
- ADR-0071 (cross-scope verify-chain — chain health probe)
- RULE 4 (audit trail is sacred)
- RULE 16 (no `console.*` in `apps/api/src`)

## 2. Scope and Non-Goals

### 2.1 In scope

- The currently-LIVE `/api/v1/health` endpoint surface.
- Audit chain as the canonical RULE-4-grade observability primitive.
- Pino structured logging discipline + safe field policy.
- Alerting policy suggestions based on existing signals.
- What an operator should watch in the first 24 / 48 / 168 hours after deploy.

### 2.2 Out of scope (forward-substrate)

- Prometheus or OpenTelemetry integration (deferred to GOVSEC.2).
- Operational dashboards (Grafana / Datadog / CloudWatch) — operator chooses; no NIOV-specific implementation.
- Sentry / Rollbar error aggregation.
- Section 3 Hive-event-stream metrics (Section 3 dependency).
- Section 4 connector metrics (Section 4 dependency).
- Customer-visible status page.

## 3. The `/api/v1/health` Surface

### 3.1 Contract

```
GET /api/v1/health → 200 OK
Content-Type: application/json
{
  "ok": true,
  "version": "0.0.1",
  "timestamp": "2026-06-01T00:00:00.000Z",
  "database": "ok"
}
```

### 3.2 Internal behavior

The endpoint:
1. Pings the database with `SELECT 1` through the Prisma client.
2. Returns `database: "ok"` if the query succeeds; otherwise `database: "error"` and HTTP 200 with `ok: false` (the route deliberately returns 200 even on degradation, to avoid noisy 5xx during transient pool exhaustion).
3. Does **not** ping Redis / OpenAI / any other external dependency. Single-purpose: API + DB are alive.
4. Is exempt from rate limiting at the route layer — uptime probes should fire reliably.

### 3.3 What an operator should NOT infer from `/health = ok`

- ✗ "All connectors are alive" — connector status is per-binding, not part of health.
- ✗ "Redis is alive" — rate-limit subsystem fails open per `apps/api/src/rate-limit.ts`.
- ✗ "Audit chain is intact" — chain integrity is verified via `/api/v1/audit/verify-chain`, not `/health`.
- ✗ "OpenAI / Anthropic are responsive" — embedding / LLM degradation is invisible to this endpoint.

### 3.4 Uptime monitor configuration

Configure the deployment target's uptime monitor (Supabase / AWS / GCP / Vercel / etc.):

- Probe URL: `${FOUNDATION_API_URL}/api/v1/health`
- Cadence: 1 minute
- Timeout: 5 seconds
- Failure threshold: 3 consecutive failures → alert
- Alert channel: PagerDuty / OpsGenie / on-call email

## 4. Audit Chain as Observability

The audit chain is the **canonical** RULE-4-grade observability signal. Every action that touches data emits an `AuditEvent` row. The chain has cryptographic integrity (SHA-256 14-field canonical record per ADR-0033 + ADR-0071).

### 4.1 Periodic chain verification

Schedule a job that calls:

```
GET ${FOUNDATION_API_URL}/api/v1/audit/verify-chain?scope=self
Authorization: Bearer ${OPERATOR_TOKEN}
```

Cadence: hourly. Alert if `verified: false`.

For multi-tenant operators with `can_admin_niov`, also probe `scope=platform`. Regulator-scope probes are not part of operational monitoring; they fire only on a `LawfulBasis` invocation.

### 4.2 Audit volume baseline

Establish a baseline for audit-event emission rate (events/min) per scope. Deviation > 50% from baseline → alert (sustained dip suggests a write-path failure; sustained spike suggests an attack or runaway loop).

Sample query:

```sql
SELECT date_trunc('minute', created_at) AS bucket, COUNT(*) AS events
FROM audit_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY bucket ORDER BY bucket;
```

### 4.3 Forbidden-field scan

Daily scan: enumerate `audit_events.details::jsonb` keys. Any new top-level key not in the canonical allowlist should be reviewed. The canonical allowlist is maintained in `apps/api/src/services/auditing/*` and the per-ADR field policies (e.g., `deployment-runbook.md` §12.3).

## 5. Logging Discipline

### 5.1 Pino structured logging

Foundation uses Pino structured JSON logging per `apps/api/src/logger.ts`. Operators ingesting logs should:

- Index `level`, `time`, `req.id`, `req.url`, `res.statusCode`, `err.code`.
- Redact `authorization`, `cookie`, `password`, `token`, `email`, `public_key` at ingestion (Pino redaction is configured at the source per `logger.ts`; verify at the log pipeline as defense-in-depth).
- Never index raw `prompt_text`, `query_text`, `payload_content` — these should not appear in logs at all; redaction at ingestion is a safety net.

### 5.2 No-console invariant

Per RULE 16, the API must produce **zero** `console.*` output. Production logs should be scanned (manual or automated) for `console.log` / `console.warn` / `console.error` / `console.info` / `console.debug` substrings. Any occurrence is a violation — rollback per `rollback-runbook.md` §2.1.

### 5.3 Log retention

Operator's choice; ADR-0019 cryptographic-suite posture applies — logs containing personal data must respect jurisdiction-specific retention (GDPR Article 17 alignment per `audit-retention-posture.md`). Suggested defaults:

- API access logs: 30 days hot, 1 year cold.
- Audit logs: replicate the on-DB retention policy (currently indefinite; pseudonymization on Article-17 request per ADR-0002 §RULE 10 amendment).
- Boot / deploy logs: 90 days.

## 6. Alerting Policy Suggestions

| Signal | Source | Threshold | Severity | Action |
|--------|--------|-----------|----------|--------|
| `/health` returning `ok: false` | uptime monitor | 3 consecutive | P1 | rollback decision-tree §3 |
| 5xx error rate > 5% | log pipeline | 5 min window | P1 | rollback per §2.1 |
| Audit chain `verified: false` | hourly cron | any | P1 | rollback chain-break path §4.5 |
| New forbidden field in `audit_events.details` | daily scan | any | P2 | investigate; likely a code regression |
| `console.*` output in production logs | hourly scan | any | P2 | rollback per RULE 16 |
| Database connection pool > 80% | DB metrics (Supabase / RDS) | 5 min | P2 | investigate query plans + scale if needed |
| OpenAI / Anthropic provider 4xx-5xx rate > 20% | provider error logs | 10 min | P3 | degrade path per `deployment-runbook.md` §11.4 |
| Action runtime backlog | Prisma query | > 100 PENDING actions | P3 | investigate executor + scale |
| Rate limit 429s | log pipeline | > 5% of total traffic | P3 | investigate — possible attack or misconfigured client |
| Cross-tenant access in audit_events | weekly review | any | P0 | emergency lockdown per §4.6 of rollback runbook |

## 7. First 24 / 48 / 168 Hours Post-Deploy

### 7.1 First 24 hours

- Hourly chain verification.
- Manual review of the first 200 audit_events emitted post-deploy (sanity check: actor / outcome / details shape).
- Watch the `/health` uptime cadence.
- Watch DB connection pool utilization.
- Run the full `smoke-test-checklist.md` §4 at +0h and again at +12h.

### 7.2 First 48 hours

- Verify the audit volume baseline established in §4.2 is stable.
- Run the no-leak guard scan on the last 1,000 audit_events.
- Re-run smoke checklist at +24h and +48h.

### 7.3 First 7 days (168 hours)

- Weekly smoke checklist (per §2 cadence).
- Cross-tenant audit review (per row in alerting table above).
- Audit retention check (rows beyond retention policy should not still be hot).
- Performance baseline confirmed (query latency p50 / p95 / p99 stable).

## 8. Known Deferrals

Per Section 10 audit + GOVSEC.2 umbrella (ADR-0049):

- **Prometheus / OpenTelemetry metric emission** — deferred. Operators may scrape `/health` for a binary signal and infer everything else from logs + audit chain.
- **Operational dashboards (Grafana / Datadog)** — operator-choice; no NIOV-specific Grafana JSON provided.
- **Error aggregation (Sentry / Rollbar)** — deferred to a dedicated wave (no ADR yet).
- **Customer status page** — Statuspage / Atlassian / instatus integration; operator-choice; no NIOV-specific template provided.
- **Synthetic user-journey monitoring** — extension of `smoke-test-checklist.md` §4.11 to a continuous Playwright probe; deferred.

These deferrals are tracked in `docs/current-build-state/10-deployment-security-go-live-operations.md` §Observability readiness.

## 9. Future Improvements

Forward-substrate (gated by separate Founder authorization per RULE 20):

1. **GOVSEC.2 implementation** — per ADR-0049 GOVSEC umbrella; lands Prometheus + OpenTelemetry + safe metric registry.
2. **Operator dashboard pack** — Grafana JSON template + Datadog dashboard template encoding §6 alerting policy.
3. **Automated forbidden-field scanner** — daily cron + alert per §4.3.
4. **Synthetic monitor harness** — Playwright probe running §5.4 + §6.1 of `smoke-test-checklist.md`.
