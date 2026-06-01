# Foundation Rollback Runbook

## 1. FILE / PURPOSE / CONNECTS TO

**FILE**: `docs/operations/rollback-runbook.md`

**PURPOSE**: Focused decision-tree runbook for rolling back a Foundation production deploy. Companion to `deployment-runbook.md` §11 (which establishes the rollback posture); this document is the **operator-facing playbook** for "something is wrong with the latest deploy — what do I do right now?" Closes the "rollback runbook MISSING" gap surfaced by Section 10 production-readiness audit (PR #164).

**CONNECTS TO**:

- `docs/operations/deployment-runbook.md` §11 (rollback posture)
- `docs/operations/admin-bootstrap-runbook.md` (companion bootstrap doc)
- `docs/operations/smoke-test-checklist.md` (post-rollback verification)
- `docs/operations/monitoring-and-healthcheck.md` (detection signals)
- ADR-0002 (append-only audit chain — rollback does NOT delete audit rows)
- ADR-0010 (legitimately slow tests — do not bypass CI to rush a rollback)
- ADR-0025 (Schema-Push-Target Discipline — schema changes go through deploy pipeline)
- ADR-0033 §Decision 7 (cross-language ownership boundary)
- ADR-0047 (production-readiness hardening lineage)
- RULE 10 (nothing is ever deleted — soft-delete pattern)
- RULE 13 (surface drifts inline)

## 2. When to Roll Back

### 2.1 Roll back immediately

These signals warrant immediate rollback:

| Signal | Threshold | Action |
|--------|-----------|--------|
| API 5xx error rate | > 5% over 5 min | rollback per §4 |
| Audit chain `verify-chain` failure | any | rollback per §4 + incident |
| Boot-time validation fail in production | any | rollback + check env vars |
| Database connection pool exhausted, persistent | > 5 min, pool ≥ 80% | rollback + check `DATABASE_URL` |
| Pre-RULE-16 console output detected in production logs | any | rollback per §4 |
| Forbidden audit field surfaced (raw query / embeddings / etc.) | any | rollback + incident |
| Cross-tenant data leak observed | any | rollback IMMEDIATELY + incident + Founder notification |
| Permission grant surface elevated unexpectedly | any | rollback + audit review |

### 2.2 Do NOT roll back; investigate first

These signals are usually fixable in place; rollback may not help:

- Single-customer error (likely data-specific; rollback won't fix).
- OpenAI / Anthropic provider outage (transient; degrade per `deployment-runbook.md` §11.4).
- Slow query observed once (investigate query plan).
- Audit volume up but no chain breakage (normal traffic variation).

### 2.3 Stop conditions — NEVER roll back without

- ✗ Founder authorization, if rollback would revert a Founder-authorized landed slice.
- ✗ A successful `verify-chain` snapshot taken **before** rollback (preserves chain integrity proof at rollback time).
- ✗ A clear understanding of what schema changes the rollback target predates — rollback past an additive migration is safe; rollback past a destructive migration is destructive.

## 3. Rollback Decision Tree

```
ALERT
  │
  ├─ Is the API responding at all?
  │    ├─ NO  → boot validation failure or pool exhaustion → §4.1 code rollback + env check
  │    └─ YES → continue
  │
  ├─ Is the audit chain valid?
  │    ├─ NO  → §4.5 chain-break path (Founder authorization required)
  │    └─ YES → continue
  │
  ├─ Is the failure related to a specific deploy commit?
  │    ├─ Code-only change (no schema migration) → §4.1 code rollback
  │    ├─ Additive schema change → §4.2 code-only rollback (schema stays)
  │    ├─ Destructive schema change → §4.3 STOP + Founder authorization
  │    └─ Connector / provider change → §4.4 degrade path first
  │
  └─ Is data exfiltration / cross-tenant leak suspected?
       └─ YES → §4.6 emergency lockdown
```

## 4. Rollback Procedures

### 4.1 Code-only rollback (most common)

For commits that did **not** introduce schema changes:

```sh
# 1. Identify the last-known-good commit
git log --oneline -20

# 2. Tag the broken state for forensics (do not delete the broken deploy)
git tag rollback-from-<YYYY-MM-DD-HHMM> <broken-head-sha>
git push origin rollback-from-<YYYY-MM-DD-HHMM>

# 3. Revert the offending commit(s) via a new commit (do NOT git reset --hard)
git revert <broken-sha>
git push origin main

# 4. Wait for CI green (per ADR-0010, full suite is 90-110 min; partial pass + manual verify is acceptable for emergency)
# 5. Trigger deploy via the deployment-target pipeline
```

**Why `git revert`, not `git reset`:** `revert` preserves the broken commit for forensic review and lets the next-fix-forward commit cleanly contradict it. `reset --hard` rewrites history and breaks ADR-0020 patent-implementation evidence lineage.

### 4.2 Code-only rollback past an additive schema change

For commits where the offending code change shipped alongside an additive migration (new column / new table / new index):

1. Verify additivity in the migration file or `prisma migrate diff`:
   ```sh
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
   ```
2. The schema change can stay; old code ignores the new field.
3. Roll back code only per §4.1.
4. Plan the destructive remediation (deferred fix forward).

### 4.3 Destructive schema change — STOP

Rollback past a destructive migration (column drop / table drop / type change / index reshape that loses data) requires **explicit Founder authorization** and a documented restore plan. Do NOT execute under time pressure.

Restore path options:

- **Supabase managed backup**: restore the database to a point-in-time before the destructive change. Requires brief downtime; preserves data.
- **Forward fix**: ship a corrective commit that handles the broken state without rollback. Usually faster but riskier.
- **Hybrid**: temporarily disable the affected feature (env flag) while planning the restore.

If a Founder-authorized destructive rollback is approved, document the lineage:
- A new ADR or build-log entry capturing the decision.
- The pre-restore `verify-chain` snapshot.
- The chosen restore point.
- Post-restore smoke per `smoke-test-checklist.md` §4.

### 4.4 Connector / provider degrade path

Per `deployment-runbook.md` §11.4: degrade rather than roll back when the failure is in an external provider (OpenAI, Anthropic, a future Section 4 connector).

```sh
# Example: OpenAI embedding degrade
# Flip provider env in deployment target:
EMBEDDING_PROVIDER=fixture
```

Effect: capsule writes generate deterministic fixture vectors; similarity search returns semantically-degraded but functional results. Document in the build-log; Founder authorization required before flipping in production per `deployment-runbook.md` §11.4.

### 4.5 Audit chain break path

If `GET /api/v1/audit/verify-chain?scope=self` returns `verified: false`:

1. Capture the response (`broken_at_event_id` + `failure_reason`).
2. Snapshot the audit_events table (DB-level backup) for forensics.
3. Notify the Founder immediately. Chain breakage is a RULE 4 violation surface and may indicate (a) a database corruption event, (b) an attempted tampering, or (c) a bug in `writeAuditEvent` chain-link logic.
4. Do NOT delete or modify audit_events to "fix" the chain. The BEFORE DELETE trigger will block deletes; the BEFORE UPDATE trigger will block updates. Any attempt is itself an incident.
5. The correct remediation is forward-only: emit a NEW chain-break record at the next `writeAuditEvent`. Reverification continues from the new chain origin.

### 4.6 Emergency lockdown (cross-tenant leak suspected)

If cross-tenant data exfiltration is **observed** (not just suspected):

```sh
# 1. Immediately block public ingress at the CDN / load balancer.
# 2. Snapshot the audit_events table for forensics.
# 3. Notify the Founder.
# 4. Rotate JWT_SECRET and ENCRYPTION_KEY (forces all sessions to re-auth).
# 5. Pause connector activity (if connectors exist):
#    - Disable all ConnectorBinding rows: UPDATE connector_bindings SET enabled = FALSE WHERE deleted_at IS NULL;
# 6. Trigger code rollback per §4.1 to the last-known-good.
# 7. Run cross-tenant audit verification per `monitoring-and-healthcheck.md` §5.
```

## 5. Post-Rollback Verification

After any rollback, run the smoke-test checklist (`smoke-test-checklist.md` §4) end-to-end. At minimum:

- [ ] `GET /api/v1/health` returns `ok: true` with `database: ok`.
- [ ] First admin can sign in.
- [ ] `GET /api/v1/audit/verify-chain?scope=self` returns `verified: true`.
- [ ] CT loads `/login`, `/`, `/security-audit`, `/approvals`, `/policies`, `/agent-playground`, `/onboarding` (Dandelion Preview) without errors for the admin user.
- [ ] No console.* output in the production API logs.
- [ ] No forbidden audit fields in the last 100 audit_events.
- [ ] Action runtime is processing: `GET /api/v1/actions/:id` returns a recent successful Action lifecycle.

If any check fails, decision-tree per §3 again — secondary rollback may be required.

## 6. Rollback History

| Date | From SHA | To SHA | Reason | Founder approval? | Build-log |
|------|----------|--------|--------|-------------------|-----------|
| n/a  | n/a      | n/a    | n/a    | n/a               | n/a       |

Append a row per rollback event. Cross-link to the `docs/build-log/` entry for the forensic detail.

## 7. Future Improvements

Forward-substrate:

1. **Automated rollback trigger** — wire a deployment-target health-probe to the §3 decision tree so a sustained 5xx rate auto-flags rollback as a recommendation (not auto-execute).
2. **Post-deploy canary** — deploy to a canary environment first; promote only after smoke + post-deploy parity check (`scripts/verify-production-parity.ts` is the seed).
3. **Schema-rollback rehearsal** — at every destructive migration, capture the restore script + rehearse on a staging snapshot before production deploy.
