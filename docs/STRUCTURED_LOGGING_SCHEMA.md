# Structured Logging Schema

This document specifies the field schema Foundation emits via its
structured logger (Fastify request-logger + the shared module
logger in `apps/api/src/logger.ts`). Both surfaces produce
identical JSON-line output so SIEM ingestion treats them
uniformly.

12C.0 Item 8 closes Compliance Architecture Review finding 1.7
(continuous monitoring hooks YELLOW). Pre-12C.0, Fastify's logger
was disabled and 16 freeform `console.*` strings dotted
`apps/api/src`. Post-12C.0, all operational output is structured
JSON consumable by Splunk / Datadog Cloud SIEM / Sentinel /
Chronicle without custom parsing.

## 1. Output Format

Every log line is a single JSON object on its own line, written
to stdout. Pino default serializers produce `level`, `time`, and
the spread of any fields the call site passed.

The `formatters.level` config converts pino's numeric level into
a string label (`level: "info"`) so SIEM tools can pivot directly
on the field rather than mapping number-to-name in ingest rules.

The `timestamp: pino.stdTimeFunctions.isoTime` config produces ISO
8601 strings (`time: "2026-05-04T18:23:45.123Z"`) for direct
sortability and timezone-safe ingestion.

## 2. Expected Fields

| Field | Type | When | Notes |
|---|---|---|---|
| `level` | string | Always | One of `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `time` | string | Always | ISO 8601 UTC |
| `msg` | string | Most calls | The human-readable message |
| `req.id` | string | Request scope | Auto-injected by Fastify; pivot for request correlation |
| `req.method` | string | Request scope | HTTP method |
| `req.url` | string | Request scope | Path |
| `res.statusCode` | number | Response scope | HTTP status code |
| `responseTime` | number | Response scope | ms |
| `actor_entity_id` | string | When passed by caller | UUID of the authenticated entity |
| `session_id` | string | When passed by caller | UUID of the active session |
| `audit_event_id` | string | When an audit event was emitted in this request | UUID, links to AuditEvent row |
| `op` | string | Service-class hooks + scheduled tasks | Logical operation name (e.g., `"share.create"`, `"loop_2"`) |
| `outcome` | string | Where measurable | One of `"success"` / `"failure"` / `"partial"` |
| `duration_ms` | number | Where measured | Wall-clock duration |
| `error_code` | string | When `outcome=failure` | Foundation error code (e.g., `"GRANTEE_NO_TAR"`) |
| `err` | object | When passed via `logger.error({ err })` | Pino's standard error serializer |

Service-class call sites are encouraged (not required) to include
`op`, `outcome`, and `duration_ms` so SIEM dashboards can group
operations cleanly.

## 3. Redact Paths

Per DRIFT 13 expanded list, Fastify's pino logger applies the
following redactions automatically. Every path is replaced with
the literal `"[REDACTED]"` before serialization. Redactions apply
to both request-context and response-context log entries.

| Path | Why redacted |
|---|---|
| `req.headers.authorization` | Bearer tokens (credential) |
| `req.headers.cookie` | Session cookies (credential) |
| `req.body.password` | Plaintext password during login / password-change flows |
| `req.body.token` | Pasted tokens in dev / curl flows |
| `req.body.email` | User PII (GDPR Article 4(1) personal data) |
| `req.body.public_key` | Cryptographic material (not strictly secret but treated conservatively) |
| `req.body.message` | Otzar conversation content (potentially carries other data subjects' PII per `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 5 reasoning) |

Default-redacted with explicit-allow override is the safer
posture than default-exposed: a service-class log call that
explicitly passes `email` or `password` as a non-`req.body.*`
field is NOT redacted automatically. Service callers must take
care not to log credentials in custom-shaped payloads. SIEM
ingestion side has its own redact-on-ingest rules as defense in
depth.

## 4. SIEM Ingestion

The JSON-line output from stdout is consumable by every major
SIEM tool's docker-log-driver / fluentd / vector / promtail
pipeline:

- **Splunk**: HEC ingestion with `sourcetype: niov-foundation`
  produces searchable fields directly from the JSON keys.
- **Datadog Cloud SIEM**: container log ingestion auto-parses
  JSON; pivot on `level`, `req.id`, `actor_entity_id`,
  `audit_event_id`.
- **Microsoft Sentinel**: log analytics with `JSON_*` parsers
  promotes top-level fields into queryable columns.
- **Google Chronicle**: UDM normalization mapping treats `time`
  as the event timestamp and `msg` as the description.

For FedRAMP ConMon, the structured-JSON output meets the
"automated log analysis" requirement called out in NIST 800-53
Rev 5 CA-7. Pre-12C.0 freeform-string output did not meet this
bar.

## 5. Cross-Reference

- `apps/api/src/logger.ts` — shared module logger (service-class
  + boot-time use)
- `apps/api/src/server.ts` — Fastify request-logger config
  (request-scope use)
- `tests/unit/no-console-in-api-src.test.ts` — DRIFT 2 Option C
  invariant test (zero `console.*` in apps/api/src)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Section 1 Dimension
  1.7 — original review finding YELLOW that 12C.0 Item 8 closed
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Cross-Cutting Tension 5
  — hash + content split rationale that informs the
  `req.body.message` redact path
