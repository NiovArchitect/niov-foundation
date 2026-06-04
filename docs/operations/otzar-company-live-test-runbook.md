# Otzar Company Live-Test Runbook

> **Purpose.** Walk a real company through a today-test of Otzar end-to-end:
> employee My Twin, authority grants, preferences, collaboration, projects,
> voice-ready chat, admin org policy. Distinct from the production
> deployment runbook (`docs/operations/deployment-runbook.md`) and the
> smoke checklist (`docs/operations/smoke-test-checklist.md`).
>
> **When to use:** customer pilot kickoff; internal "tomorrow morning"
> dry-runs; new-hire onboarding to the platform. NOT for routine
> production deploys.

## 1. What's live for today's tests

The substrate landed across Foundation PRs #258–#289 and Control
Tower PRs #33–#40. Customer-facing surface today:

| Surface | Route | Status |
|---|---|---|
| Employee My Twin workspace | `/app/my-twin` | live (sidecars + role-scope profile) |
| Employee authority grants | `/app/authority-grants` | live (create / list / revoke; 8 duration classes × 10 sensitivity classes × 9 scope types) |
| Employee preferences (structured work-style memory) | `/app/preferences` | live (14 correction types × 6 scope types) |
| Employee collaboration | `/app/collaboration` | live (inbound + outbound + accept / reject / cancel / complete) |
| Employee work projects | `/app/work-projects` | live (create / list / archive / members) |
| Employee voice-ready chat | `/app/voice-ready` | live (text transcript → structured speech-ready reply) |
| Employee free-form correction | `/app/corrections` | live (ADR-0055 Wave 2C — conversation-tied) |
| Admin org collaboration policy | `/collaboration-policy` | live (3 quick presets + manual upsert) |
| Admin connectors / dandelion / onboarding | `/connectors`, `/onboarding`, etc. | live (read-first; writes Founder-gated per ADR-0084) |

## 2. Local / staging setup

### 2.1 Required services
- **Postgres 16** with `pgvector` extension. Use Docker:
  ```sh
  docker run -d --name niov-pg -p 5433:5432 \
    -e POSTGRES_PASSWORD=otzar -e POSTGRES_USER=otzar \
    -e POSTGRES_DB=foundation_test \
    pgvector/pgvector:0.8.2-pg16-trixie
  ```
- **Node 22.x** (`.nvmrc` pinned).
- **Redis** (Upstash or local) if you exercise the priming cache path.

### 2.2 Foundation start
```sh
cd niov-foundation
npm install
npm run db:push:test     # apply Prisma schema to localhost:5433 (ADR-0025)
npx tsx scripts/apply-audit-triggers.ts
npm run dev              # Fastify on localhost:3000
```

### 2.3 Control Tower start
```sh
cd otzar-control-tower
npm install
# point Vite at the local Foundation
echo "VITE_API_BASE_URL=http://localhost:3000/api/v1" > .env.local
npm run dev              # Vite on localhost:5173
```

### 2.4 Seed / demo data
Today's pilot uses real entities created through the running API
rather than a static seed dump. The five-minute seed:

1. Register a **COMPANY** entity via `POST /api/v1/auth/admin-register`
   (use the bootstrap admin path documented in
   `docs/operations/admin-bootstrap-runbook.md`).
2. Register a **PERSON** entity (the test employee) and attach to the
   COMPANY via `EntityMembership(parent_id=org, child_id=employee)`.
3. Register an **AI_AGENT** entity (the employee's Twin) and attach as
   a child of the PERSON via `EntityMembership(role_title="Digital Twin")`.
4. Create a `TwinConfig` for the Twin with `autonomy_level=APPROVAL_REQUIRED`.
5. (Optional) apply the "Autonomous internal flow" preset on the
   admin `/collaboration-policy` page so same-team / same-project
   collaboration flows automatically during the test.

## 3. Employee test script

Run as the PERSON entity (logged in at `/app`).

1. **Open `/app`** → confirm the employee shell loads, nav shows Home /
   Chat / Observe / Corrections / Approvals / My Twin / Authority /
   Preferences / Collaboration / Projects / Voice / Conversations.
2. **`/app/my-twin`** → confirm identity card + role-scope profile +
   sidecars panel renders. Sidecars may be empty on a fresh org; that
   is expected.
3. **`/app/work-projects`** → create a project ("Phoenix launch"). You
   become OWNER. Click Members → add another employee's `entity_id`.
4. **`/app/authority-grants`** → grant your Twin authority. Pick
   `PERSONAL` scope + `SESSION` duration + `MODERATE` sensitivity. Add
   a purpose ("Draft follow-up emails"). Confirm row renders. Revoke
   it. Confirm Revoke disappears.
5. **`/app/preferences`** → teach your Twin a `TONE_PREFERENCE`
   (`PERSONAL`). Confirm row renders. Remove it.
6. **`/app/chat`** → send "what should I do today?". Confirm structured
   reply (`next_step=ANSWERED`).
7. **`/app/chat`** → send "send a slack message to ops". Confirm
   `next_step=NEEDS_APPROVAL` + `approval_reason=CONNECTOR_ACCESS`.
   The chat surface does NOT auto-create an action — that's the safety
   gate.
8. **`/app/chat`** → send "loop in legal on this contract". Confirm
   `next_step=COLLABORATION_REQUEST_SUGGESTED` + `target_type=TEAM`.
9. **`/app/voice-ready`** → paste / type a transcript. Confirm the
   structured reply card renders the same envelope as chat plus
   `provider_mode=TEXT_ONLY`.
10. **`/app/collaboration`** → create a `STATUS_REQUEST` to a same-org
    coworker. If admin policy applied "Autonomous internal flow", state
    will be `REQUESTED` (auto-routed). If not, `NEEDS_APPROVAL`.
11. **`/app/collaboration`** (as the target employee) → accept the
    request. Confirm it appears in your inbound list.

## 4. Admin test script

Run as a PERSON with `can_admin_org=true` (Control Tower side at `/`).

1. **`/collaboration-policy`** → click "Apply preset" on
   "Autonomous internal flow". Confirm 5 rows appear in the policy
   list.
2. **`/collaboration-policy`** → add a manual row: scope `CROSS_TEAM`
   + request_type `STATUS_REQUEST` + outcome `ALLOW`. Confirm it
   shows in the list.
3. **`/connectors`** → confirm the 6 OPERATING vendors (Slack /
   Microsoft 365 / Google Workspace / Jira / Linear / GitHub) render
   read-first. **Do NOT** enable connector writes for today's pilot
   unless the customer has supplied their own OAuth credentials AND
   the Founder has authorized writes for that vendor.
4. **`/onboarding`** (Dandelion) → run a starter-archetype activation
   walk if the customer wants the starter profile materialized.
5. **`/audit/events`** → confirm the day's collaboration / authority /
   preference / project actions all appear with closed-vocab
   `details.action` discriminators.

## 5. Known safe limitations today

- **Live microphone capture is OFF.** Voice route accepts a typed
  transcript only. `voice_output_supported=false`. Use device /
  browser TTS for the speech-ready text. (ADR-0085 + ADR-0089.)
- **Connector writes are gated.** All 6 OPERATING connectors run
  read-first or draft-only unless explicitly authorized per ADR-0084.
- **External writes default off.** Action proposals are recorded; the
  external delivery adapter set is forward-substrate.
- **Python intelligence runtime is fixture-first.** When
  `PYTHON_INTELLIGENCE_RUNTIME_URL` is unset or unreachable, the
  Employee Twin next-action ranker falls back to a deterministic
  in-process ranker. Switching to a real Python service requires no
  consumer change.
- **BEAM collaboration supervisor is wrapper-first.** When
  `BEAM_RUNTIME_ENABLED=true` + `BEAM_RUNTIME_URL` is set and
  reachable, the wrapper returns `provider_mode=ACTIVE`; otherwise it
  returns `provider_mode=DISABLED` / `READY_NOT_ACTIVE` / `UNREACHABLE`
  with a TS-projected status so live tests proceed.
- **No payment / billing rails are live.** Billing telemetry runs in
  soft-gate posture; entitlement checks ride existing
  `ENTITLEMENT_CHECK_DENIED` + `USAGE_METER_RECORDED` audit literals.
- **No blockchain / x402 rails.** All chain integration remains
  forward-substrate.

## 6. Safety invariants verified today

- No raw memory leakage on any employee surface.
- No raw transcript vault.
- No chain-of-thought storage.
- No employee scoring, manager monitoring, or surveillance framing.
- Cross-tenant blocked at substrate (`CROSS_ORG_DENIED` blocked_reason).
- Audit chain is append-only (`audit_events` BEFORE DELETE trigger
  per ADR-0002).
- Employee authority cannot exceed org policy.
- Org policy cannot override employee revocation.
- Connector writes remain blocked / draft-only unless explicitly
  authorized.
- Legal / financial / security / customer-sensitive defaults to
  dual-control via Phase 2 OrgCollaborationPolicy evaluator.

## 7. Smoke commands

```sh
# Foundation API
curl -s http://localhost:3000/health | jq

# CT (Vite dev) — manual: open http://localhost:5173/app

# Run the full Foundation unit tier (no DB needed for these):
cd niov-foundation && npm run test:unit

# Run the full CT tier:
cd otzar-control-tower && npm test

# Apply the production smoke checklist against this environment:
open docs/operations/smoke-test-checklist.md
```

## 8. If something goes wrong

- Use `docs/operations/rollback-runbook.md` for any production-tier
  rollback procedure.
- Audit lineage for every collaboration / authority / preference /
  project action is in `audit_events` keyed on `actor_entity_id`
  + `target_entity_id` + `details.action` discriminator. Use
  `/audit/events?scope=org` from an admin session to surface the
  evidence trail.
- For UI issues: check the browser console for `api.ts` 4xx mappings;
  every Foundation route returns a closed-vocab `code` the UI maps
  to friendly copy.

## 9. What's next after the pilot

- Customer-supplied connector OAuth (per tenant; see
  `docs/deployment/secrets-inventory.md` — NIOV does NOT own
  customer connector keys).
- Founder-authorized connector writes for specific verbs
  (per ADR-0084 ≥C6).
- Live audio path if/when the customer's legal/retention/provider
  decision unlocks ADR-0085 + ADR-0089.
- Python intelligence runtime stand-up (point
  `PYTHON_INTELLIGENCE_RUNTIME_URL` at a real service).
- BEAM Erlang node stand-up (point `BEAM_RUNTIME_URL` at a real
  Mix-managed application).
