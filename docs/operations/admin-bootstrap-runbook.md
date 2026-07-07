# Foundation Admin Bootstrap Runbook

## 1. FILE / PURPOSE / CONNECTS TO

**FILE**: `docs/operations/admin-bootstrap-runbook.md`

**PURPOSE**: Documents the canonical procedure for bringing up the **first NIOV operator admin** in a fresh Foundation deployment — the only privileged grant that cannot be performed through the normal UI / API self-service flows because Foundation refuses to grant `can_admin_niov` to itself. Closes the "admin bootstrap runbook MISSING" gap surfaced by the Section 10 production-readiness audit (PR #164).

**CONNECTS TO**:

- `docs/operations/deployment-runbook.md` (deploy + parity + observability companion)
- `docs/operations/rollback-runbook.md` (rollback companion)
- `docs/operations/smoke-test-checklist.md` (post-bootstrap verification)
- `docs/operations/monitoring-and-healthcheck.md` (post-bootstrap observability)
- ADR-0002 (append-only audit chain — bootstrap events are recorded)
- ADR-0004 (service-owned auth gate)
- ADR-0019 (cryptographic suite — first credentials)
- ADR-0025 (Schema-Push-Target Discipline — no `db push` against production)
- ADR-0027 (governance + RULE 20)
- ADR-0050 (break-glass time-boxed audit — bootstrap is **not** break-glass)
- `packages/database/prisma/schema.prisma:240-241` (TAR `can_admin_niov` / `can_admin_org`)
- `apps/api/src/services/governance/dandelion.service.ts` (Phase 0 atomic createOrg requires an actor)

## 2. Scope and Non-Goals

### 2.1 In scope

- First-ever `can_admin_niov` grant on a clean Foundation deployment.
- The single-use bootstrap script (`scripts/bootstrap-first-admin.ts`) that future operators may build to encode this procedure (proposed; not implemented in this runbook).
- Audit posture for the bootstrap event (must be recorded; never silent).
- Recovery path if the first admin loses credentials before a second admin exists.

### 2.2 Out of scope

- Subsequent admin grants — those flow through the dual-control admin grant path (ADR-0026) and `auth-admin.routes.ts`.
- Org-admin (`can_admin_org`) bootstrap — that happens through Dandelion Phase 0 / `dandelion.service.ts` once a NIOV operator admin exists.
- Break-glass (ADR-0050) — time-boxed emergency access, distinct from the steady-state bootstrap.
- Production secrets distribution — covered by deployment-runbook §13.

## 3. Absolute Safety Boundaries

The following constraints are non-negotiable.

1. **Never grant `can_admin_niov` through a public route.** No HTTP path may issue this capability.
2. **Never run `npm run db:push` against production.** Schema changes go through deploy pipeline per ADR-0025.
3. **Never store the first admin's password in plaintext** anywhere — including this runbook, commit history, CI logs, or chat messages. Use `BCRYPT_ROUNDS ≥ 12` per `apps/api/src/boot-validation.ts`.
4. **Never bootstrap without an audit row.** Every bootstrap action must produce an `AuditEvent` row even when no API key yet exists — use the `SYSTEM_PRINCIPAL` actor lineage.
5. **Never reuse the first admin's credentials for any non-administrative purpose.** Founder-tier operator only.
6. **Never share the bootstrap procedure or credentials via Slack / Email / Notion / chat.** Direct out-of-band channel only (signed envelope, in-person, etc.).
7. **Never run the bootstrap procedure on production from a developer laptop without explicit Founder authorization** — production credentials live in the deployment target's secret store.

## 4. Pre-Flight Checklist

Before running the bootstrap:

- [ ] Deployment runbook §5 (Pre-Deploy Verification) complete.
- [ ] Production database reachable via the pooler URL and direct URL.
- [ ] `npm run db:generate` + `npm run db:push` already executed against `DIRECT_URL` per ADR-0025 (NOT bare; via the canonical script per ADR-0024).
- [ ] `scripts/apply-pgvector-extension.ts` + `scripts/apply-audit-triggers.ts` + `scripts/apply-hnsw-index.ts` executed.
- [ ] BEFORE DELETE trigger on `audit_events` confirmed via `psql`:
  ```sql
  SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_events'::regclass AND NOT tgisinternal;
  -- expect at least the audit_events_before_delete_trigger row
  ```
- [ ] No Entity rows yet present:
  ```sql
  SELECT COUNT(*) FROM entities WHERE deleted_at IS NULL;
  -- expect 0; if > 0, the bootstrap has already occurred — STOP
  ```
- [ ] Out-of-band channel for the first admin's credentials confirmed with the Founder.
- [ ] BCRYPT_ROUNDS = 12 (verify via env in production runtime — `boot-validation.ts` rejects < 12 in production).

## 5. Bootstrap Procedure (Manual) — ⚠️ STALE, DO NOT EXECUTE

> **[2026-07-06 — BOOTSTRAP-NIOV-OPERATOR]** The §8.1 forward-substrate
> script now exists: **`scripts/bootstrap-niov-operator.ts`** — use §5A
> below. The manual SQL in §5.4 has DRIFTED from the live schema and
> will fail (and must not be "fixed" by hand): it targets
> `trust_assertion_records` (real table: `token_attribute_repositories`)
> and `entity_credentials` (does not exist — `password_hash` lives on
> `entities`), uses `primary_email` (real column: `email`), references
> TAR columns that do not exist (`can_invoke_connectors`,
> `can_admin_hive`, `can_admin_billing`), and omits required fields
> (`public_key`; `tar_hash`, which only `computeTARHash` can produce).
> §§5.1–5.7 are preserved for procedure-shape lineage only.

## 5A. Bootstrap Procedure (Script — CANONICAL)

`scripts/bootstrap-niov-operator.ts` mints the dedicated NIOV platform
operator accounts through the canonical helpers (`createEntity` =
entity + wallet + TAR + audits in one transaction; then the
executePhase0 STEP-10 TAR-grant discipline: `can_admin_niov: true` +
`computeTARHash` recompute + `tar_version` increment +
`TAR_PERMISSIONS_UPDATE` audit + a `BOOTSTRAP_NIOV_OPERATOR`
ADMIN_ACTION summary event).

**Why not the daily Otzar login:** the founder's app account
(`can_admin_org` via `scripts/founder-bootstrap.ts`) is an org-tier
credential used for daily work; boundary §3.5 forbids reusing operator
credentials for non-administrative purposes, and platform-root must be
a separate blast-radius. The allowlist therefore accepts ONLY:

- `niov-operator-1@niovlabs.com` — allowed when the ACTIVE
  `can_admin_niov` census is **0**
- `niov-operator-2@niovlabs.com` — allowed when the census is
  **exactly 1**
- census ≥ 2 → bootstrap always refuses (dual control already possible)

**Operator #2 reality (2026-07-06):** §5.7's "standard admin grant
path (dual-control per ADR-0026)" has NOT shipped — no HTTP route may
grant `can_admin_niov` (boundary §3.1), and the account-creation
registry entry is forward-substrate. Until that governed route exists,
operator #2 is ALSO created through this founder-authorized script
(hence the census-1 rule). Building the governed grant route is a P1
follow-up.

Safety gates, all in code: production refuses without
`ALLOW_FOUNDER_BOOTSTRAP=true` set inline; dry-run unless `--apply`;
apply additionally requires `FOUNDER_BOOTSTRAP_CONFIRM` set to the
exact phrase `I AUTHORIZE NIOV OPERATOR BOOTSTRAP`; duplicate email
refuses (recovery = §6 rail); the one-time password prints exactly
once (or comes from `NIOV_OPERATOR_PASSWORD`), is bcrypt-hashed via
the canonical rail, and never reaches audit details, disk, or the
repo. Rotate it within 24 hours of first sign-in (§5.7 step 1 still
applies).

### 5A.1 Commands (run from the repo root, founder-authorized)

```sh
# 0) Read-only census (any time):
set -a; . ./.env; set +a; npx tsx scripts/bootstrap-niov-operator.ts --verify

# 1) Operator #1 — dry-run, then apply:
npx tsx scripts/bootstrap-niov-operator.ts --email niov-operator-1@niovlabs.com
ALLOW_FOUNDER_BOOTSTRAP=true \
FOUNDER_BOOTSTRAP_CONFIRM="I AUTHORIZE NIOV OPERATOR BOOTSTRAP" \
npx tsx scripts/bootstrap-niov-operator.ts --email niov-operator-1@niovlabs.com --apply

# 2) Operator #2 — same shape (census must now be exactly 1):
ALLOW_FOUNDER_BOOTSTRAP=true \
FOUNDER_BOOTSTRAP_CONFIRM="I AUTHORIZE NIOV OPERATOR BOOTSTRAP" \
npx tsx scripts/bootstrap-niov-operator.ts --email niov-operator-2@niovlabs.com --apply

# 3) Verify: census shows 2; then a first-login probe per §5.6 with
#    requested_operations ["read","write","admin_niov"] must echo
#    admin_niov back.
```

Environment sourcing determines the target database — source the
PRODUCTION env only for the founder-authorized run, in a shell you
close afterward; `ALLOW_FOUNDER_BOOTSTRAP` and the confirm phrase are
set inline per command and never persisted. Append a §7 history row
after each apply.

## 5-legacy. Original Manual Procedure (stale — see banner above)

Until `scripts/bootstrap-first-admin.ts` exists, follow this manual procedure.

### 5.1 Generate the first admin password out-of-band

Generate a strong random password (≥ 24 chars, mixed case + digits + symbols). Pass it to the first admin via an authenticated out-of-band channel. Do **not** record it in this repo, git history, or any chat tool.

### 5.2 Hash the password

In a one-time terminal session (developer laptop is acceptable for the **hashing** step only):

```sh
cd "/path/to/niov-foundation"
node -e "import('@niov/auth').then(m => m.hashPassword('REPLACE_WITH_PASSWORD').then(h => console.log(h)))"
```

Copy the resulting hash into the SQL block below. Close the terminal session; clear the shell history (`history -c` or close the tab).

### 5.3 Open a one-time `psql` session against production

Use the `DIRECT_URL` (not the pooler). Confirm you are connected to the production database before continuing.

### 5.4 Insert the first admin in a single transaction

Execute the following block in `psql`. All rows are inserted in a single atomic transaction; if any step fails, the entire bootstrap rolls back.

```sql
BEGIN;

-- 1) The first PERSON Entity.
INSERT INTO entities (
  entity_id, entity_type, status, primary_email,
  display_name, hierarchy_level, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'PERSON',
  'ACTIVE',
  'first-admin@example.com',  -- REPLACE
  'First NIOV Operator',       -- REPLACE
  0,
  NOW(),
  NOW()
)
RETURNING entity_id \gset first_admin_

-- 2) TAR with can_admin_niov = TRUE.
INSERT INTO trust_assertion_records (
  tar_id, entity_id,
  can_read_capsules, can_write_capsules, can_share_capsules,
  can_admin_org, can_admin_niov, can_invoke_connectors,
  can_admin_hive, can_admin_billing,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  :'first_admin_entity_id',
  TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE,
  TRUE, TRUE,
  NOW(),
  NOW()
);

-- 3) Password credential (bcrypt hash from §5.2).
INSERT INTO entity_credentials (
  credential_id, entity_id, password_hash, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  :'first_admin_entity_id',
  'REPLACE_WITH_BCRYPT_HASH_FROM_STEP_5_2',
  NOW(),
  NOW()
);

-- 4) Audit row — bootstrap is recorded.
INSERT INTO audit_events (
  audit_id, event_type, source_entity_id, target_entity_id,
  outcome, details, previous_event_hash, event_hash,
  jurisdiction, created_at
) VALUES (
  gen_random_uuid(),
  'ADMIN_ACTION',
  :'first_admin_entity_id',  -- self-bootstrap; no prior actor exists
  :'first_admin_entity_id',
  'SUCCESS',
  jsonb_build_object(
    'action', 'BOOTSTRAP_FIRST_ADMIN',
    'tar_capabilities', jsonb_build_array(
      'can_read_capsules','can_write_capsules','can_share_capsules',
      'can_admin_org','can_admin_niov','can_invoke_connectors',
      'can_admin_hive','can_admin_billing'
    )
  ),
  NULL,    -- first event; no previous hash
  encode(digest('BOOTSTRAP_FIRST_ADMIN', 'sha256'), 'hex'),  -- placeholder; canonical hash on next write
  'GLOBAL',
  NOW()
);

COMMIT;
```

**Important:** the `event_hash` placeholder above is intentionally non-canonical; the next regular `writeAuditEvent` call from the application will compute the canonical SHA-256 14-field hash and rebuild the chain. Bootstrap rows are tolerated as the chain origin per ADR-0002 §Initial Chain Bootstrap.

### 5.5 Verify the bootstrap

In a fresh `psql` session:

```sql
-- The Entity exists and is ACTIVE.
SELECT entity_id, primary_email, display_name, status
FROM entities WHERE primary_email = 'first-admin@example.com';

-- The TAR has can_admin_niov.
SELECT t.can_admin_niov, t.can_admin_org, t.can_admin_hive
FROM trust_assertion_records t
JOIN entities e ON e.entity_id = t.entity_id
WHERE e.primary_email = 'first-admin@example.com';

-- A credential row exists.
SELECT COUNT(*) FROM entity_credentials c
JOIN entities e ON e.entity_id = c.entity_id
WHERE e.primary_email = 'first-admin@example.com';
-- expect 1

-- The audit event exists with BOOTSTRAP_FIRST_ADMIN action.
SELECT details->>'action', outcome
FROM audit_events
WHERE details->>'action' = 'BOOTSTRAP_FIRST_ADMIN';
```

### 5.6 First sign-in test

From any client (cURL is sufficient):

```sh
curl -X POST "${FOUNDATION_API_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"first-admin@example.com","password":"REPLACE_WITH_PASSWORD"}'
```

Expect HTTP 200 + JWT bearer token. Subsequent admin operations (creating the first organization via Dandelion Phase 0, etc.) use this bearer.

### 5.7 Rotate the bootstrap password

Within 24 hours of the first sign-in:

1. The first admin signs in and changes their password through the normal authenticated flow.
2. The second admin is created via the standard admin grant path (dual-control per ADR-0026).
3. The first admin **may** rotate their TAR capability set to remove `can_admin_billing` etc. if appropriate scope-reduction is desired.

## 6. Recovery: Lost First Admin Credentials Before Second Admin Exists

If the first admin's credentials are lost or the first admin departs before a second admin is created, recovery requires a **second bootstrap** under explicit Founder authorization, with the prior admin first soft-disabled.

### 6.1 Soft-disable the previous admin

```sql
BEGIN;
UPDATE entities SET status = 'INACTIVE', deleted_at = NOW()
WHERE primary_email = 'lost-admin@example.com';
INSERT INTO audit_events (
  audit_id, event_type, source_entity_id, target_entity_id,
  outcome, details, jurisdiction, created_at
) VALUES (
  gen_random_uuid(),
  'ADMIN_ACTION',
  (SELECT entity_id FROM entities WHERE primary_email = 'lost-admin@example.com'),
  (SELECT entity_id FROM entities WHERE primary_email = 'lost-admin@example.com'),
  'SUCCESS',
  jsonb_build_object('action', 'BOOTSTRAP_RECOVERY_PRIOR_ADMIN_DISABLED'),
  'GLOBAL',
  NOW()
);
COMMIT;
```

Per RULE 10, the prior admin's row is preserved (`deleted_at` set; not removed). Their audit history remains intact.

### 6.2 Run a fresh bootstrap

Re-run §5 with a different `primary_email`. Do **not** reuse the prior admin's email — the unique-constraint will block it (intentionally; ADR-0027 governance posture).

### 6.3 Record the recovery rationale

Capture the recovery rationale in `docs/operations/admin-bootstrap-runbook.md` §7 or a build-log entry (`docs/build-log/YYYY-MM-DD-bootstrap-recovery.md`). Recovery is rare; documenting it improves future audit readiness.

## 7. Bootstrap History

| Date | Deployment | First admin email (redacted) | Operator (Founder authorization) | Audit event |
|------|------------|------------------------------|----------------------------------|-------------|
| n/a  | n/a        | n/a                          | n/a                              | n/a         |

Append a row per bootstrap. Real values may be redacted to `<entity_id>` / `<email_domain>` — the audit-event ID is the unambiguous reference.

## 8. Future Improvements

Forward-substrate (not implemented at this runbook):

1. **`scripts/bootstrap-first-admin.ts`** — ✅ SHIPPED 2026-07-06 as `scripts/bootstrap-niov-operator.ts` (§5A): canonical-helper implementation (no raw SQL, no db-push involvement), allowlisted two-operator support with census gating, dry-run default, inline founder-authorization env switches, unit suite `tests/unit/bootstrap-niov-operator.test.ts`.
2. **GOVSEC.5 break-glass parity** — extend break-glass (ADR-0050) to cover "lost first admin" without requiring a fresh bootstrap. Currently break-glass requires an existing admin to grant.
3. **Post-bootstrap healthcheck** — automated smoke (per `smoke-test-checklist.md` §4) called from `bootstrap-first-admin.ts`.
