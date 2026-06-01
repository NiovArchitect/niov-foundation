# Foundation Production Smoke-Test Checklist

## 1. FILE / PURPOSE / CONNECTS TO

**FILE**: `docs/operations/smoke-test-checklist.md`

**PURPOSE**: Manual production smoke-test procedure run by a NIOV operator after every deploy, after every rollback, and on a configured cadence in production. Distinct from the CI suite (which verifies code correctness pre-merge); the smoke checklist verifies **the live production deployment behaves correctly from a user-visible perspective**. Closes the "smoke test suite MISSING" gap surfaced by Section 10 production-readiness audit (PR #164).

**CONNECTS TO**:

- `docs/operations/deployment-runbook.md` (deploy companion)
- `docs/operations/rollback-runbook.md` (post-rollback companion)
- `docs/operations/admin-bootstrap-runbook.md` (post-bootstrap companion)
- `docs/operations/monitoring-and-healthcheck.md` (continuous observability companion)
- ADR-0002 (audit chain)
- ADR-0026 (dual-control middleware)
- ADR-0050 (break-glass)
- ADR-0057 (autonomous execution core; Action runtime smoke surfaces)
- ADR-0071 (cross-scope verify-chain)
- ADR-0078 / ADR-0079 (transcript posture — never default-expose raw)

## 2. When to Run

| Event | Cadence | Required by |
|-------|---------|-------------|
| Initial bootstrap | once per deployment | this runbook + admin-bootstrap-runbook |
| Post-deploy | every deploy | deployment-runbook §10 |
| Post-rollback | every rollback | rollback-runbook §5 |
| Production health cadence | weekly | this runbook |
| Pre-customer-launch | once | go-live checklist |
| Post-incident | once | rollback-runbook §6 |

## 3. Smoke Roles

| Role | What they verify |
|------|------------------|
| NIOV operator (first admin) | every check below |
| Test "employee" entity (created at deploy time) | Otzar chat surface, calendar surface, audit visibility |
| Test "twin" entity (per ADR-0046 dual-context routing) | Twin chat round-trip; CORRECTION signal |
| Test "regulator" entity (per ADR-0036 LawfulBasis) | regulator-view route (only if regulator scope is launch-critical) |

The smoke role tests should run against a `production-smoke` org separate from real customer orgs. The smoke org is preserved between deploys to maintain audit chain continuity.

## 4. Smoke Checklist

Run in order. Stop at any failure and escalate to rollback-runbook §3.

### 4.1 Health

- [ ] `GET ${FOUNDATION_API_URL}/api/v1/health` returns HTTP 200 with `{ ok: true, version, timestamp, database: "ok" }`.
- [ ] `database` is `"ok"` (the endpoint executes `SELECT 1`).
- [ ] Response latency < 500ms.

### 4.2 Auth round-trip

- [ ] `POST /api/v1/auth/login` with the first admin's email + password → HTTP 200 + JWT bearer.
- [ ] `GET /api/v1/auth/validate` with the bearer → HTTP 200 + entity info.
- [ ] `POST /api/v1/auth/logout` → HTTP 204 (or 200 depending on route impl).

### 4.3 Audit chain integrity

- [ ] `GET /api/v1/audit/verify-chain?scope=self` → `verified: true` + `checked_event_count > 0`.
- [ ] `GET /api/v1/audit/verify-chain?scope=org` → `verified: true` (admin only).
- [ ] No `broken_at_event_id` or `failure_reason` in either response.

### 4.4 COSMP read / write / share round-trip

- [ ] Create a Memory Capsule via `POST /api/v1/cosmp/capsule` with a known `payload_summary`.
- [ ] Read it back via `GET /api/v1/cosmp/capsule/:id` — payload matches.
- [ ] Share it via `POST /api/v1/cosmp/share` to the test "employee" entity.
- [ ] Confirm the share via the employee's bearer + audit lookup.
- [ ] Verify a `CAPSULE_CREATED` + `CAPSULE_SHARED` audit event pair appears in `/api/v1/audit/events`.

### 4.5 Otzar conversation round-trip

- [ ] Start a conversation via the employee bearer.
- [ ] Send one user message; receive one Twin response.
- [ ] Confirm the conversation row appears in `OtzarConversation` (admin verify via `/api/v1/audit/events` filtered by `event_type = CONVERSATION_STARTED`).
- [ ] Close the conversation; verify the `summary_capsule_id` link populates on the conversation row (per ADR-0054).

### 4.6 Action runtime

- [ ] Submit a `RECORD_CAPSULE` Action via the admin bearer.
- [ ] Poll `GET /api/v1/actions/:id` until `status = SUCCESS` (or `FAILED` for forensic review).
- [ ] Verify `ACTION_SUBMITTED` + `ACTION_DISPATCHED` + `ACTION_COMPLETED` audit lineage.

### 4.7 Dual-control (ADR-0026)

- [ ] Attempt `PATCH /api/v1/platform/monetization/config` with the first admin's bearer alone — expect HTTP 403 / 409 indicating dual-control required.
- [ ] Run the full dual-control flow with a second admin if one exists (skip if only the first admin is provisioned).

### 4.8 Break-glass (ADR-0050)

- [ ] Verify break-glass grant table is empty for the smoke org:
  ```sql
  SELECT COUNT(*) FROM break_glass_grants WHERE org_entity_id = '<smoke-org-id>' AND used_at IS NULL;
  -- expect 0
  ```
- [ ] Do NOT issue a real break-glass during smoke; the substrate's existence is what is verified.

### 4.9 Connector surface (read-only)

- [ ] `GET /api/v1/org/connectors` returns the current connector binding list for the smoke org (may be empty).
- [ ] If any binding is `enabled = true`, run the OutboundWebhookProvider smoke (POST to a test webhook target) only with explicit approval.

### 4.10 Agent Playground (Section 5 Wave 10)

- [ ] `GET /api/v1/playground/scenarios` returns HTTP 200 (may return an empty list).
- [ ] Create a smoke scenario via `POST /api/v1/playground/scenarios` — receives 201.
- [ ] Generate candidates → compare outcomes → best path round-trip succeeds.

### 4.11 Control Tower load (live URL)

- [ ] CT URL loads `/login`.
- [ ] After sign-in: `/`, `/security-audit`, `/approvals`, `/policies`, `/agent-playground`, `/onboarding` (Dandelion Preview), `/users`, `/ai-teammates` all render without errors.
- [ ] No console errors in the browser dev tools.
- [ ] The forbidden-copy guard surfaces (no surveillance / scoring / certainty framing) are not visible in any rendered page.

### 4.12 No-leak runtime sanity

- [ ] Sample 100 recent `audit_events` rows via `GET /api/v1/audit/events?limit=100`.
- [ ] Verify NONE of the rows' `details` JSON contain any forbidden field:
  - raw `query_text`, `query_keywords`, query vector
  - result vectors, `vector_hash`, `embedding_sample`, `distances`
  - raw transcript, raw email body, raw doc content
  - `secret_ref` payload, `connector_payload` raw
  - `chain_of_thought`, `prompt_text`
  - `compensation`, protected-class data

### 4.13 No console output in production logs

- [ ] Scan the last hour of API logs via the deployment-target log explorer.
- [ ] Search for `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`. **Zero results expected** per RULE 16.

### 4.14 CORS + Helmet headers

- [ ] `GET ${FOUNDATION_API_URL}/api/v1/health` with `Origin: https://random-non-allowed.example.com` returns CORS deny.
- [ ] `GET ${FOUNDATION_API_URL}/api/v1/health` with the CT URL as `Origin` returns CORS allow.
- [ ] Response headers include `strict-transport-security`, `x-content-type-options: nosniff`, `referrer-policy`, etc. (Helmet defaults).

### 4.15 Rate limiting

- [ ] Issue 100 rapid `GET /api/v1/health` calls from the same IP. Expect at least one HTTP 429 after the limit.
- [ ] Wait the configured retry-after window; verify normal traffic resumes.

## 5. Smoke Result Recording

| Date | Deploy SHA | Trigger | Failures (list checks) | Operator | Outcome |
|------|-----------|---------|------------------------|----------|---------|
| n/a  | n/a       | n/a     | n/a                    | n/a      | n/a     |

Append a row per smoke run. Outcome ∈ `{ PASS, FAILED → ROLLBACK, FAILED → FIX_FORWARD, PARTIAL_PASS }`.

## 6. Future Improvements

Forward-substrate:

1. **`scripts/production-smoke.ts`** — automate §4.1 – §4.4 + §4.13 + §4.14 as a single CLI invocation.
2. **CT playwright smoke** — extend CT E2E coverage to include §4.11 via Playwright run against the production CT URL.
3. **Audit-no-leak guard** — automated daily scan of `audit_events.details` for forbidden field tokens (extension of the existing test-tier `no-leak-guard.test.ts`).
4. **Synthetic monitor** — wire §4.1 health check into a synthetic uptime monitor with 1-minute cadence.
