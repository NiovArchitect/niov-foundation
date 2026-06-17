# ADR-0057: Autonomous Execution Core Substrate

- **Status:** Accepted 2026-05-28
- **Phase:** Section 2 of the 10 required production sections — Autonomous
  Execution Core. **Design-first ADR; no code, schema, audit literal, route,
  service, middleware, or test change in this ADR.**
- **Gap:** GAP-AEC-1 (no execution-tier substrate; `TwinConfig.autonomy_level`
  is config-only; `Workflow` does not run; no `Action` model exists).
- **Supersedes / amends:** none. Companion to ADR-0026 (dual-control + Phase E
  target resolver), ADR-0050 (BG.2 break-glass), ADR-0052 (Otzar Domain
  General Intelligence + Governed Synchronicity), ADR-0053 (Twin role-scope
  profile), ADR-0049 (GOVSEC umbrella), ADR-0002 (append-only audit chain),
  ADR-0036 (REGULATOR + LawfulBasis audit-chain extension precedent), and
  ADR-0042 (capsule mutation discrimination — additive-audit-literal
  precedent).

## Amendment 1 — SAFE recipient/requester display labels on the Action read surface (Founder-authorized 2026-06-16)

**Status:** Accepted 2026-06-16. **Authorization:** explicit Founder
authorization per RULE 20 (Otzar Work OS Phase 1285-N follow-up, BLOCKER 2):
the Action Center cannot keep rendering generic "Internal note" cards — an
authorized approver/admin must see *who* an action is for to make a decision —
but message body / payload / envelope must stay forbidden.

**Decision.** `SafeActionView` (`apps/api/src/services/action/views.ts`) gains
two OPTIONAL fields, resolved by the read services
(`list.service.ts` + `get.service.ts`) via the canonical
`resolveEntityNames` resolver:

- `target_label?: string | null` — the recipient's resolved DISPLAY NAME.
- `requester_label?: string | null` — the source/requester's resolved DISPLAY NAME.

For `target_label`, the structural `target_entity_id` (governance / dual-control
target) is used when present; for `SEND_INTERNAL_NOTIFICATION` rows that carry
the recipient only in `payload_redacted.recipient_entity_id`, the service reads
that id **server-side ONLY** to resolve a display label. `target_entity_id`
keeps its dual-control routing meaning (it is NOT repurposed as the recipient),
and the payload + the recipient UUID never leave the service tier — only the
resolved label does.

**Narrow scope — what this does NOT change:**

- These are display-name labels ONLY. The routing UUIDs `target_entity_id` and
  `source_entity_id` remain FORBIDDEN in the response per §10 (unchanged); they
  never leave the service tier.
- Raw `payload_summary` / `payload_redacted` body text, the full policy
  envelope, `policy_envelope_hash`, and every other §10 forbidden field stay
  forbidden (unchanged). Message body is NOT exposed server-side.
- A label is `null` when the entity cannot be resolved — the UI renders
  "recipient unavailable" + an unresolved badge, never a UUID, never a fake.
- Authorization is unchanged: labels ride the existing self-scope (caller ==
  `source_entity_id`) OR `can_admin_org`-over-same-org read spine. A
  cross-tenant reader gets no rows, hence no labels — no cross-tenant leakage,
  no permission bypass.
- `projectActionView` stays a pure mapper (ADR-0026 §5 Pattern 6): the service
  resolves names and passes a `SafeActionLabels` object in; the mapper only
  copies the safe labels.

The `tests/unit/no-leak-guard.test.ts` forbidden-token anchor is preserved
(`target_label` / `requester_label` are not forbidden tokens; the UUID + body
tokens still never serialize). Integration coverage at
`tests/integration/action-list.test.ts` asserts the labels resolve to display
names AND that the UUIDs + payload body never appear in the response.

## Context

Section 2 of the 10 required production sections per the Founder Directive
2026-05-28 is the **Autonomous Execution Core** — bounded, governed,
audit-aware execution of actions that an entity (a Twin, an operator, an
admin) proposes. The directive is explicit: *"This is not an MVP path; the
correct response to complexity is to chunk more coherently, not defer."*

The substrate is now ready to land an Autonomous Execution Core design
because the two governance prerequisites it depends on are LIVE:

- **Dual-control + Phase E target resolution is LIVE.** Per ADR-0026 +
  Amendment 1, `resolveDualControlTarget` at
  `apps/api/src/services/governance/escalation.service.ts:331` produces a
  structurally independent approver via the Class A → B → C → D contract.
  The middleware fail-closes at 503 `ESCALATION_TARGET_NOT_FOUND` with the
  `DUAL_CONTROL_NO_APPROVER_AVAILABLE` marker when no eligible approver
  exists. The 4 LIVE `PRIVILEGED_ENDPOINTS` at
  `apps/api/src/security/privileged-endpoints.ts:99-146` all exercise this
  resolver.
- **BG.2 break-glass is LIVE.** Per ADR-0050 + Amendment 1, the
  break-glass recognition seam at
  `apps/api/src/middleware/dual-control.middleware.ts:445-491` short-circuits
  the denied path when a valid `BreakGlassGrant` is presented for the matched
  action. Break-glass is time-boxed, single-use, explicitly justified,
  scoped to the 4 LIVE `PRIVILEGED_ENDPOINTS` action types, auditable
  (`BREAK_GLASS_INVOKED / USED / EXPIRED / REVIEWED` + the
  `DUAL_CONTROL_BREAK_GLASS_DELEGATED` marker), and reviewer-≠-source.

What the repo does **NOT** have today (Rule 0; file:line evidence from the
[AUTONOMOUS-EXECUTION-CORE-PLANNING-QLOCK] read-only inspection):

- `TwinConfig.autonomy_level` (`packages/database/prisma/schema.prisma:879`)
  is a `String` field that defaults to `"APPROVAL_REQUIRED"`. Consumers are
  **read-only**:
  - `apps/api/src/routes/org.routes.ts:838-850` (analytics counts).
  - `apps/api/src/routes/org.routes.ts:1538-1647` (`PATCH
    /org/ai-teammates/:id` validator + audit lineage); the validator accepts
    `APPROVAL_REQUIRED | EXECUTIVE_OVERRIDE | OBSERVE_ONLY`.
  - `apps/api/src/services/governance/twin.service.ts:233-357` (create-time
    defaulting; admin twins get `EXECUTIVE_OVERRIDE`).
  - `apps/api/src/services/otzar/otzar.service.ts:1063,1096` (echo into
    `getMyTwin` response shape).
  **No runtime gate consults `autonomy_level` to allow or deny anything.**
- `OrgSettings.require_human_approval` (`schema.prisma:858`),
  `OrgSettings.auto_approve_low_risk` (`schema.prisma:853`), and
  `OrgSettings.audit_ai_actions` (`schema.prisma:857`) exist and are
  serialized in admin routes (`apps/api/src/routes/org.routes.ts:741`;
  `apps/api/src/services/governance/org.ts:46,79,178`). **None of them
  gates an executor — there is no executor.**
- `Workflow` (`schema.prisma:937-950`) is a `{ workflow_id, org_entity_id,
  name, trigger_type (String), actions (Json), enabled, ... }` table. The
  three routes at `apps/api/src/routes/org.routes.ts:1220-1328` (GET list /
  POST / PATCH) **persist and read** but never trigger or execute anything.
  `trigger_type` is an untyped `String`; `actions` is a `Json` blob with no
  schema. There is no `Workflow → Action` orchestration code.
- `IntegrationCredential` (`schema.prisma:983`) exists but the only repo
  reference is a console-catalog row at
  `apps/api/src/services/console.service.ts:828` marking it `PARTIAL`. **No
  connector / webhook / external invocation code reads this credential.**
- The `Otzar` transparency layer carries `approval_required: boolean` at
  `apps/api/src/services/otzar/transparency.ts:43` but the value is **always
  `false`** (Wave 1 has no tool calls per L168 + L208).
- `AUDIT_EVENT_TYPE_VALUES` at `packages/database/src/queries/audit.ts` (51
  literals: covers `ADMIN_ACTION`, `CAPSULE_*`, `CAPSULE_MUTATION_*`,
  `NEGOTIATE`, `SHARE`, `REVOKE`, `REGULATOR_ACCESS_*`, `BREAK_GLASS_*`,
  `CAPSULE_SIMILARITY_SEARCH`, `CONVERSATION_*`). **No `ACTION_*` cluster
  exists.**
- The 4 LIVE `PRIVILEGED_ENDPOINTS` are all `can_admin_niov`-tier; **no LIVE
  entry exercises the Phase E Class B (org-admin) branch yet**.

Therefore the next architectural layer is the **Action substrate** — a
canonical `Action` lifecycle, a policy evaluator, and an executor — **not**
connectors first. Connectors (MCP / webhook / outbound API) remain Section
4 and must depend on the Action / Executor contract canonicalized here.
Per ADR-0052 §14 the Governed Synchronicity Loop is Observe → Understand →
Align → Assist → Coordinate → Approve → **Execute** → Report → Learn →
Improve; ADR-0057 canonicalizes the substrate for the *Execute* step under
the Founder's sequencing guard *"governance before autonomy."*

## Standards / Source Basis (RULE 21 research arc)

This ADR is informed by the [AUTONOMOUS-EXECUTION-CORE-PLANNING-QLOCK]
research arc (HITL / NIST AI RMF agentic profile / NIST SP 800-53 AU-2 /
AU-3 / BullMQ + Trigger.dev + pg-boss queue-pattern 2026 best practice).
Substrate decisions in this ADR were cross-checked against:

- NIST AI RMF (govern / map / measure / manage) — every autonomous action
  has an owner, a risk tier, an approval rule, and an IR plan. Substrate
  shape: `Action.source_entity_id`, `Action.risk_tier`,
  `ActionPolicy.default_decision`, audit chain per ADR-0002.
- NIST SP 800-53 AU-2 / AU-3 — audit records must capture the decision
  chain (triggering conditions, decision logic, action taken, downstream
  effect). Substrate shape: 10 NEW `ACTION_*` audit literals carrying
  `decision`, `policy_envelope_hash`, `attempt_number`, `outcome`,
  `error_class`.
- HITL / HOTL architecture (Strata 2026; CSA AAGATE) — HITL for high-risk;
  HOTL ("kill switch") for routine. Substrate shape: `autonomy_level` is
  load-bearing; cancellation route exists; RUNNING cancellation is
  privileged.
- Queue / worker best practice (BullMQ / pg-boss / Trigger.dev 2026) —
  separate worker from API; idempotency keys; DLQ; store IDs not objects.
  Substrate shape: `Action.idempotency_key` UNIQUE; in-process executor
  first, BullMQ/pg-boss/BEAM deferred to a later ADR amendment if needed.
- ADR-0026 Phase E target resolver as the canonical fail-closed resolver
  pattern; ADR-0050 BG.2 as the canonical break-glass recognition seam;
  ADR-0042 as the additive-audit-literal precedent; ADR-0036 as the
  audit-chain-extension precedent.

External research informs framing only; **repo truth (file:line evidence
above) is primary** per Rule 0.

## Decision

### 1. Action lifecycle

`Action.status` is a discriminated state machine with 10 canonical states:

```
                                       ┌──────────────┐
                                       │  PROPOSED    │
                                       └───────┬──────┘
                                               │ policy evaluator
                          ┌────────────────────┼────────────────────┐
                          │                    │                    │
                          ▼                    ▼                    ▼
                   ┌──────────────┐    ┌──────────────┐     ┌──────────────┐
                   │  REJECTED    │    │  APPROVED    │     │   EXPIRED    │
                   └──────────────┘    └───────┬──────┘     └──────────────┘
                                               │ scheduler
                                               ▼
                                       ┌──────────────┐
                                       │  SCHEDULED   │
                                       └───────┬──────┘
                                               │ worker pick
                                               ▼
                                       ┌──────────────┐
                                       │   RUNNING    │
                                       └───────┬──────┘
                          ┌────────────────────┼────────────────────┐
                          │                    │                    │
                          ▼                    ▼                    ▼
                  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                  │  SUCCEEDED   │     │   FAILED     │     │  TIMED_OUT   │
                  └──────────────┘     └──────────────┘     └──────────────┘

         CANCELLED is reachable from PROPOSED, APPROVED, SCHEDULED, or RUNNING
         (RUNNING → CANCELLED is privileged; see §6 + §11 below).
```

**Terminal states (immutable except audit append):** `SUCCEEDED`, `FAILED`,
`CANCELLED`, `TIMED_OUT`, `REJECTED`, `EXPIRED`. **Every transition is
audit-visible** via the 10 NEW `ACTION_*` literals at §10. Transitions are
guarded by a state machine in the future `action.service.ts`:
forbidden-transition attempts throw `ACTION_INVALID_TRANSITION`. Soft
delete via `Action.deleted_at` per RULE 10; the row stays, audit chain
preserved.

### 2. Proposed schema intent

The schema lands in a **later EXECUTE-VERIFY QLOCK**; this ADR does NOT
modify `schema.prisma`. The canonical shape is:

- **`Action`** — `action_id` (PK), `source_entity_id` (FK Entity; the
  proposer — a Twin, operator, or admin), `org_entity_id` (FK Entity;
  cross-org leak guard per ADR-0006), `target_entity_id` (FK Entity?,
  nullable), `action_type` (enum), `risk_tier` (enum), `policy_envelope`
  (Json — frozen TAR/OrgSettings/TwinConfig/Permission snapshot at
  create-time per §3 + §4), `payload_summary` (String — safe, allowlisted
  fields only), `payload_redacted` (Json — safe-fields-only at create-time,
  per per-action-type allowlist), `idempotency_key` (String UNIQUE),
  `escalation_id` (FK EscalationRequest?, nullable), `status` (enum),
  `expires_at` (DateTime?, terminal `EXPIRED` if not picked up),
  `created_at`, `updated_at`, `deleted_at`. Indices: `(org_entity_id,
  status, created_at)`, `(source_entity_id, status)`, UNIQUE
  `(idempotency_key)`.
- **`ActionAttempt`** — `attempt_id` (PK), `action_id` (FK), `attempt_number`
  (Int), `started_at`, `ended_at?`, `outcome` (enum), `worker_id?` (String,
  the in-process worker identity), `error_class?` (enum literal),
  `error_summary?` (String, SAFE: enum-bound or pre-canonicalized), `deleted_at`.
  Indices: `(action_id, attempt_number)`.
- **`ActionResult`** — `result_id` (PK), `attempt_id` (FK), `result_summary`
  (String, SAFE), `result_metadata` (Json — safe-fields-only; per-action-type
  allowlist; **NEVER** raw external content), `created_at`.
- **`ActionPolicy`** — `policy_id` (PK), `org_entity_id` (FK Entity),
  `action_type` (enum), `risk_tier` (enum), `default_decision` (enum
  `ActionDecision`), `require_admin_capability` (`can_admin_org` |
  `can_admin_niov` | null), `updated_by` (FK Entity), `updated_at`. UNIQUE
  `(org_entity_id, action_type, risk_tier)`.

**Proposed enums:**

- `ActionStatus { PROPOSED, APPROVED, SCHEDULED, RUNNING, SUCCEEDED, FAILED,
  CANCELLED, TIMED_OUT, REJECTED, EXPIRED }`.
- `ActionType` — initial canonical set is intentionally small (e.g.,
  `RECORD_CAPSULE`, `PROPOSE_PERMISSION_GRANT`,
  `SEND_INTERNAL_NOTIFICATION`); enum extension follows the ADR-0021
  Capsule Type Extension Protocol pattern (deliberate-blocker per-type
  validator + per-type safe-field allowlist).
- `ActionRiskTier { LOW, MEDIUM, HIGH, CRITICAL }`.
- `ActionDecision { AUTO_APPROVE, REQUIRE_DUAL_CONTROL, REQUIRE_BREAK_GLASS,
  FORBIDDEN }`.
- `ActionAttemptOutcome { SUCCEEDED, FAILED, TIMED_OUT, CANCELLED }`.

Schema EXECUTE lands per RULE 1 + ADR-0025 (`db:push:test` at the test
container only; the live-DB push lands per the canonical
`prisma-db-push-test.sh` discipline).

### 3. Policy evaluator

The policy evaluator is a **pure deterministic function** (BEAM-compatibility
pattern 6 per ADR-0026 §5; same shape as `resolveDualControlTarget`'s
discriminated-union contract). It receives a snapshot of all the inputs at
create-time, returns a discriminated union, and writes nothing.

**Signature:**

```ts
evaluateActionPolicy(input: {
  callerEntityId: string;
  org_entity_id: string;
  action_type: ActionType;
  risk_tier: ActionRiskTier;
  policy_envelope: PolicyEnvelope; // frozen snapshot: see below
}): ActionDecisionResult;
```

**`PolicyEnvelope` snapshot fields (frozen at create-time):**

- `twin_autonomy_level: "APPROVAL_REQUIRED" | "EXECUTIVE_OVERRIDE" |
  "OBSERVE_ONLY"`.
- `org_require_human_approval: boolean`.
- `org_auto_approve_low_risk: boolean`.
- `org_audit_ai_actions: boolean`.
- `entity_profile_safe_view: { job_title?: string; role_template?: string }`
  (no PII beyond what is already exposed in `getMyTwin`).
- `tar_capability_bits: { can_admin_org: boolean; can_admin_niov: boolean;
  can_write_capsules: boolean; can_share_capsules: boolean; ... }`.
- `permission_set_summary: { count: number; bridges: string[] }` (no
  per-permission detail; per-action-type checks reference the live
  `Permission` table at executor time).
- `action_policy_row: ActionPolicy | null` (the matched per-org policy).

**Discriminated-union return:**

```ts
type ActionDecisionResult =
  | { ok: true; decision: "AUTO_APPROVE"; reason: string }
  | { ok: true; decision: "REQUIRE_DUAL_CONTROL"; reason: string }
  | { ok: true; decision: "REQUIRE_BREAK_GLASS"; reason: string }
  | { ok: true; decision: "FORBIDDEN"; reason: string }
  | { ok: false; reason: "POLICY_UNRESOLVED" | "ENVELOPE_INVALID" };
```

**Fail-closed posture:** `{ ok: false }` → action enters `REJECTED` with
`ACTION_REJECTED` audit emission; never queued. Missing / invalid /
ambiguous policy is treated as `POLICY_UNRESOLVED` (fail closed), NOT as
"default approve."

### 4. Autonomy semantics

The policy evaluator honors the following autonomy ladder. **Each rung is
load-bearing; later rungs cannot weaken earlier rungs.**

1. **`OrgSettings.require_human_approval = true` overrides everything.** If
   the org has set this flag, every action of every risk tier returns
   `REQUIRE_DUAL_CONTROL` regardless of `autonomy_level`. The flag
   defaults to `true` (`schema.prisma:858`); the safe org default is
   already HITL.
2. **`risk_tier = CRITICAL` is always `REQUIRE_DUAL_CONTROL` at minimum.**
   No autonomy level — not even `EXECUTIVE_OVERRIDE` — auto-approves a
   CRITICAL action. If the per-org `ActionPolicy` row sets the CRITICAL
   default to `FORBIDDEN`, that overrides.
3. **`autonomy_level = OBSERVE_ONLY` → all actions are `FORBIDDEN`.** A
   `OBSERVE_ONLY` Twin cannot execute any action. The validator already at
   `org.routes.ts:1645` enumerates `OBSERVE_ONLY`; the evaluator honors it.
4. **`autonomy_level = APPROVAL_REQUIRED` → all actions are
   `REQUIRE_DUAL_CONTROL`** unless the `ActionPolicy` row for the
   `(action_type, risk_tier)` pair explicitly grants `AUTO_APPROVE`.
   The Foundation default is HITL.
5. **`autonomy_level = EXECUTIVE_OVERRIDE` → LOW and MEDIUM may
   `AUTO_APPROVE` only if (a) the `ActionPolicy` row's
   `default_decision = AUTO_APPROVE` AND (b) for LOW only,
   `OrgSettings.auto_approve_low_risk = true`.** Otherwise:
   `REQUIRE_DUAL_CONTROL`. HIGH always `REQUIRE_DUAL_CONTROL`; CRITICAL per
   §4.2 above. There is no "blanket override" — `EXECUTIVE_OVERRIDE` is a
   *permission to be auto-approved subject to policy*, not a permission to
   skip policy.
6. **`OrgSettings.auto_approve_low_risk = true` is permissive for LOW
   only.** Combined with `EXECUTIVE_OVERRIDE` + an `AUTO_APPROVE` policy
   row, LOW actions execute without an `EscalationRequest`. The
   `ACTION_APPROVED` audit event still emits with `decision: "AUTO_APPROVE"`.

### 5. Dual-control relation (Phase E reuse)

Actions that the policy evaluator decides `REQUIRE_DUAL_CONTROL` create a
paired `EscalationRequest` of type `DUAL_CONTROL_REQUIRED` per the existing
ADR-0026 pipeline. The pairing is structural:

- The new `Action.escalation_id` carries the FK; the escalation's
  `source_entity_id = Action.source_entity_id` (the requester) per Phase E
  Invariant 1.
- The `EscalationRequest.target_entity_id` is supplied by
  `resolveDualControlTarget` (Class A → B → C → D). For `action_type` whose
  matched route is `can_admin_org`-tier (e.g.,
  `ORG_ACTION_POLICY_UPDATE`, see §7), Class B runs and picks the
  org-admin pool member; for `can_admin_niov`-tier actions (the 4
  pre-existing PRIVILEGED_ENDPOINTS), Class C runs.
- `target_entity_id` MUST NEVER silently fall back to
  `source_entity_id`; no eligible approver returns `{ ok: false,
  reason: "NO_ELIGIBLE_TARGET" }` → the Action transitions to `REJECTED`
  with the safe `DUAL_CONTROL_NO_APPROVER_AVAILABLE`-style marker on the
  action audit (`ACTION_REJECTED` + `decision_reason:
  "no-eligible-target"`).
- The GAP-C1 source-cannot-self-resolve guard at
  `escalation.service.ts:397-407` remains intact: even if a later edit
  re-introduced a same-identity target, the source still cannot self-resolve.
- **Approve / reject endpoints are reused.** `POST
  /api/v1/escalations/:id/approve` and `:id/reject` are the canonical
  resolution endpoints. There is no new `/actions/:id/approve` route.
  Transitioning the escalation transitions the paired Action: PENDING →
  APPROVED transitions Action PROPOSED → APPROVED; PENDING → REJECTED
  transitions Action PROPOSED → REJECTED. This re-uses the audit chain
  established at ADR-0026.

### 6. Break-glass relation (BG.2 reuse, no relaxation)

`ADR-0050 BG.2` is reused as the recognition seam for emergency-tier
execution; **break-glass is NOT a general bypass.** The break-glass
properties enumerated in ADR-0050 §Amendment 1 are preserved verbatim:

- **time-boxed** by mandatory non-null `valid_until`;
- **single-use** via atomic `ACTIVE → USED` in `markBreakGlassUsed`;
- **explicitly justified** at create-time;
- **scoped** to registered action types (initially the 4 LIVE
  PRIVILEGED_ENDPOINTS; expansion is per-action-type and per ADR);
- **auditable** via the four `BREAK_GLASS_*` literals + the
  `DUAL_CONTROL_BREAK_GLASS_DELEGATED` marker;
- **subject to two-person review** with `reviewer ≠ source`;
- **not a general bypass.**

For Actions, break-glass interacts with the executor as follows:

- The policy evaluator may return `REQUIRE_BREAK_GLASS` when the configured
  `ActionPolicy` row's `default_decision = REQUIRE_BREAK_GLASS`. This
  signals that no normal dual-control approver is available for this
  action type; the Action stays `PROPOSED` until a valid `BreakGlassGrant`
  for the matched `action_type` is presented at the privileged-endpoint
  binding tier or via an admin route.
- Break-glass MUST emit BOTH the existing `BREAK_GLASS_USED` literal (in-tx
  via `markBreakGlassUsed`) AND a new `ACTION_*` audit event for the
  paired Action's state transition (e.g., `ACTION_APPROVED` with
  `decision: "REQUIRE_BREAK_GLASS"` + the `grant_id` in safe metadata).
- A future EXECUTE-VERIFY may extend the BG.2 `PRIVILEGED_ACTION_TYPES`
  set in `break-glass.service.ts:43` to include new Action-Core action
  types; that extension is per-ADR (this ADR does NOT modify the set).
- The ADR-0026 GAP-C1 source-cannot-self-resolve guard remains intact.

### 7. PrivilegedEndpoint registry plan

The existing 4 LIVE PRIVILEGED_ENDPOINTS remain **unchanged** by this
ADR. New privileged operations must be registered deliberately (no
implicit gating). This ADR proposes one **NEW LIVE Class B entry** for
Section 2:

- **Operation E — `ORG_ACTION_POLICY_UPDATE`.**
  - Route: `PUT /api/v1/org/action-policies` (binds in a later
    EXECUTE-VERIFY).
  - `authTier`: `can_admin_org`.
  - `actionDescriptor`: `{ type: "ORG_ACTION_POLICY_UPDATE" }`.
  - Class B target resolver applies: org-admin pool member,
    deterministic-lowest-`entity_id`, cross-org candidates excluded
    structurally at the query tier per ADR-0026 Invariant 6.
  - This is the **first LIVE entry to exercise Class B at the integration
    tier.** Unit-tier Class B coverage already exists at
    `tests/unit/escalation-target-resolver.test.ts` (per PR #8 §9 Test 14).
  - Fail-closed: single-admin org → 503 `ESCALATION_TARGET_NOT_FOUND` +
    `DUAL_CONTROL_NO_APPROVER_AVAILABLE` marker per ADR-0026 Amendment 1
    §6.

**Class A explicit metadata** remains optional / forward-substrate. An org
admin may someday designate a specific approver via
`actionDescriptor.metadata.target_entity_id`; substrate is ready (Phase E
Class A) — no LIVE entry uses it today, and ADR-0057 does not introduce
one.

**Class C (`can_admin_niov`) entries** are preserved for platform-tier
operations. A future `ADMIN_ACTION_CANCEL` for NIOV-tier admin
intervention in RUNNING actions is a candidate but is OUT of scope for
ADR-0057.

### 8. Queue / worker posture

The initial implementation uses a **DB-backed in-process executor**. The
chosen pattern:

- A `setInterval`-driven worker reads `Action.status = SCHEDULED` rows
  using `FOR UPDATE SKIP LOCKED` (Postgres-native row-level locking; no
  external broker required at first phase).
- Queue payloads store **IDs** (`action_id`, `attempt_id`) — NEVER raw
  objects. The worker re-fetches `Action` + `policy_envelope` from
  durable storage at pick-time per ADR-0026 BEAM-compatibility pattern 3
  ("state reconstructible from durable storage").
- **Idempotency** at the create tier — `Action.idempotency_key` is
  UNIQUE. POST `/actions` with a duplicate key returns the existing
  `action_id` (no duplicate Action).
- **Retries** create new `ActionAttempt` rows. Each attempt is
  immutable. `attempt_number` is monotonic per Action.
- **Dead-letter / failure semantics** are auditable: after the
  per-action-type retry budget (configured per `ActionPolicy`), the
  Action terminalizes to `FAILED` with `ACTION_FAILED` + safe
  `error_class`. The Action stays queryable; the audit chain stays
  intact.
- **BullMQ / pg-boss / Trigger.dev** are NOT chosen in this ADR. A later
  ADR amendment (or ADR-0059) may externalize the queue if SLA + retry
  orchestration demands it, per the 2026 best practice
  research arc. This ADR pins the in-process posture and the migration
  trigger (>1000 RUNNING actions concurrently; >10k SCHEDULED backlog
  sustained over 24h; or operator request).
- **BEAM / Elixir orchestration** remains future substrate per
  ADR-0028 §Forward Queue + ADR-0030. The Action substrate is designed
  to port (Pattern 1 / 2 / 3 / 4 / 5 / 6 from ADR-0026 §5 preserved by
  construction); the porting decision is forward-substrate.

### 9. API contract intent

Routes below are **intent only**; implementation lands per the §16 build
sequence. Auth gating, dual-control posture, audit emission, and
no-leak response shapes are normative.

| Route | Method | Auth | Dual-control | Audit | Notes |
|---|---|---|---|---|---|
| `/api/v1/actions` | `POST` | bearer + `write` | NO at create (policy evaluator decides) | `ACTION_PROPOSED` (or `_APPROVED` if `AUTO_APPROVE` decision) | Body: `action_type`, `target_entity_id?`, `idempotency_key`, redacted `payload_summary`, safe `payload_redacted`. Response: `{ ok, action_id, status, requires_approval, escalation_id? }`. No raw payload echoed. |
| `/api/v1/actions` | `GET` | bearer + `read` | NO | NO | Self-scope only by default; `?org_scope=true` requires `can_admin_org`. Standard pagination. |
| `/api/v1/actions/:id` | `GET` | bearer + `read` | NO | NO | Safe Action view + `ActionAttempt` count + last `ActionResult.result_summary`. Forbidden fields per §10. |
| `/api/v1/actions/:id/cancel` | `POST` | bearer + `write` | NO at non-RUNNING; YES at RUNNING (privileged + break-glass-eligible) | `ACTION_CANCELLED` | Valid from `PROPOSED / APPROVED / SCHEDULED`. RUNNING cancellation is a privileged operation. |
| `/api/v1/actions/:id/approve` | — | — | — | — | **Reuse `POST /api/v1/escalations/:id/approve`** per §5. No new approve route. |
| `/api/v1/actions/:id/reject` | — | — | — | — | Same — reuse escalation reject. |
| `/api/v1/org/actions` | `GET` | bearer + `can_admin_org` | NO | NO | Org-scoped per the DRIFT-9 cross-org leak guard at the query tier. |
| `/api/v1/org/action-policies` | `GET` | bearer + `can_admin_org` | NO | NO | Read-only org-policy listing. |
| `/api/v1/org/action-policies` | `PUT` | bearer + `can_admin_org` | YES — NEW PRIVILEGED_ENDPOINT (`ORG_ACTION_POLICY_UPDATE`, Class B) | `ACTION_POLICY_UPDATE` (admin event) | Privileged because it changes the autonomy contract. |

Future routes (forward-substrate, NOT in scope):

- `/api/v1/console/actions` `GET` (NIOV-tier read across all orgs;
  standard console redaction).
- `/api/v1/console/actions/:id/admin-cancel` `POST` (NIOV-tier
  PrivilegedEndpoint candidate; Operation F).
- `/api/v1/workflows/:id/run` `POST` (orchestrates `Workflow → Action`
  per a future Workflow-orchestration ADR).

### 10. Audit and no-leak

**NEW audit literals** (10 total, additive append-only — same precedent
as `CAPSULE_MUTATION_*` (4) and `BREAK_GLASS_*` (4); **no ADR-0002
amendment needed**):

1. `ACTION_PROPOSED`
2. `ACTION_APPROVED`
3. `ACTION_REJECTED`
4. `ACTION_SCHEDULED`
5. `ACTION_STARTED`
6. `ACTION_SUCCEEDED`
7. `ACTION_FAILED`
8. `ACTION_CANCELLED`
9. `ACTION_EXPIRED`
10. `ACTION_POLICY_UPDATE`

Each `ACTION_*` event extends `AUDIT_EVENT_TYPE_VALUES` at
`packages/database/src/queries/audit.ts` in a later EXECUTE-VERIFY QLOCK.
The append-only chain per ADR-0002 + the
`audit_events_immutable()` BEFORE DELETE trigger is preserved.

**Safe audit details fields** (the per-event details JSON is constrained
to this allowlist):

- `action_id`
- `action_type`
- `risk_tier`
- `decision`
- `policy_envelope_hash` (SHA-256 of the canonicalized policy envelope;
  NOT the envelope itself)
- `actor_entity_id` (or `source_entity_id`) — already authorized for
  audit per ADR-0002 + ADR-0036
- `target_entity_id` — only where structurally safe (per Phase E
  Invariant 6; never disclosed to the caller in a fail-closed envelope)
- `escalation_id` — when paired
- `attempt_number` — for `_STARTED / _SUCCEEDED / _FAILED / _TIMED_OUT`
- `outcome` — enum-bound `ActionAttemptOutcome`
- `error_class` — enum literal only (e.g.,
  `EXECUTOR_TIMEOUT | POLICY_DRIFT | ENVELOPE_INVALID |
  PERMISSION_DENIED | INTERNAL_ERROR`); NEVER free-form text
- `route`, `method` — for `ACTION_POLICY_UPDATE`-class admin events
- `grant_id` — when the path is break-glass-delegated (already
  precedented at `DUAL_CONTROL_BREAK_GLASS_DELEGATED`)

**Forbidden audit details** (these MUST NEVER appear in `details`,
response bodies, or error envelopes):

- raw `payload_summary` body text
- full `payload_redacted` JSON
- raw external API responses
- raw HTTP headers
- secrets, credentials, API keys
- capsule content (`payload_summary`, `payload_content`,
  `storage_location`, `content_hash`)
- embeddings / vectors / per-dimension stats
- candidate-pool identities (per ADR-0026 §6)
- candidate-pool size
- full policy envelope JSON (the hash only)
- raw error text / stack traces (`error_class` enum only)
- justification text from break-glass grants (`grant_id` only)

The mapper-tier `projectActionView` / `projectActionResult` pattern (per
ADR-0051 / ADR-0054 / ADR-0055 mapper precedent) enforces forbidden-
field stripping by construction; the route never reaches into the
ORM-shaped object.

### 11. Idempotency / retries / timeout / cancellation

- **Idempotency.** `Action.idempotency_key` is UNIQUE. The create
  endpoint MUST treat a duplicate key as a successful no-op returning
  the existing `action_id`. Idempotency is the substrate-level guard
  against double-execution under at-least-once delivery semantics.
- **Retries.** Each retry creates a new `ActionAttempt` row with
  `attempt_number = max(prior) + 1`. The Action itself stays in
  `RUNNING` until terminal. Per-action-type retry budget is in the
  `ActionPolicy` row.
- **Timeout.** `Action.expires_at` controls the SCHEDULED-tier expiry
  (terminalizes to `EXPIRED` if not picked up). Per-attempt timeout
  lives in `ActionAttempt`; on timeout the attempt terminalizes to
  `TIMED_OUT` and the worker emits `ACTION_FAILED` with
  `error_class = "EXECUTOR_TIMEOUT"`.
- **Cancellation.** Allowed from `PROPOSED / APPROVED / SCHEDULED`.
  `RUNNING → CANCELLED` is **privileged**: requires either an admin
  capability or a valid break-glass grant for the matched action
  type. Terminal states (`SUCCEEDED / FAILED / CANCELLED / TIMED_OUT /
  REJECTED / EXPIRED`) are **immutable except audit append** per
  RULE 10 + ADR-0002.

### 12. Control Tower dependency map

Future Control Tower surfaces (NOT implemented in this ADR; CT-side
planning QLOCK owns implementation):

- **Actions Inbox** — caller's own Actions; safe-view-only; pagination;
  filter by status / risk tier. Consumes `GET /api/v1/actions`.
- **Action Detail drawer** — safe view of one Action including last
  `ActionResult.result_summary` and `ActionAttempt` count. Consumes
  `GET /api/v1/actions/:id`. NEVER displays raw payload / raw error /
  raw external responses.
- **Pending Approvals / Escalations bridge** — extends the existing
  CT escalation queue to show Action-paired escalations distinctly
  (action_type + risk_tier badges; safe `payload_summary`-only
  preview). Consumes the existing escalation routes + the new Action
  read routes.
- **Org Action Policy editor** — for `can_admin_org` operators; PUT
  flow gated by dual-control via the new `ORG_ACTION_POLICY_UPDATE`
  PrivilegedEndpoint. Surfaces the per-`(action_type, risk_tier)`
  decision matrix.
- **Admin Action Audit view** — NIOV-tier read of action audit
  events; cross-org; standard console redaction.
- **Safe status / outcome display** — status badges per
  `ActionStatus` enum; outcome badges per `ActionAttemptOutcome`;
  `error_class` displayed as a human-readable enum-bound label
  (never raw error text).

**No CT implementation in this ADR.** A separate CT planning QLOCK will
spec the Actions Inbox + Approvals bridge + Policy Editor + Admin Audit
View surfaces after the Foundation backend is end-to-end live and
stable.

### 13. Non-goals

This ADR explicitly does **NOT**:

- modify code, schema, routes, services, middleware, tests, package
  files, CI workflows, AGENTS.md, CLAUDE.md, or `docs/CURRENT_BUILD_STATE.md`
  in this QLOCK
- implement the `Action` / `ActionAttempt` / `ActionResult` /
  `ActionPolicy` models
- modify `prisma/schema.prisma`
- implement the policy evaluator
- implement the executor / worker
- implement any queue (in-process or external)
- implement MCP / connectors
- implement any Control Tower UI
- implement billing / entitlements gating
- modify the existing 4 LIVE `PRIVILEGED_ENDPOINTS`
- modify `TwinConfig` or `OrgSettings` schema
- modify `Workflow` or `IntegrationCredential`
- modify the existing dual-control middleware semantics beyond the
  Action-pairing extension documented above
- weaken the ADR-0026 GAP-C1 source-cannot-self-resolve guard
- weaken any ADR-0050 break-glass invariant
- make Autonomous Execution live
- introduce any `ACTION_*` audit literal at `audit.ts`
- introduce any new `EscalationType`

### 14. Unsafe claims after this ADR is Accepted

This ADR canonicalizes the substrate for Autonomous Execution Core. It
**does NOT make any of the following claims**:

- "Autonomous Execution is live."
- "AI Twin can execute actions."
- "`TwinConfig.autonomy_level` is enforced."
- "Workflows run."
- "Connectors / MCP are live."
- "Action queue exists."
- "Action audit trail exists."
- "Control Tower action UX exists."
- "Billing / entitlement gating for actions exists."
- "All 10 production sections are complete."
- "All GOVSEC is closed."
- "Break-glass is a general bypass."
- "TypeScript has zero errors."

These remain UNSAFE to claim until the corresponding EXECUTE-VERIFY
phases land (per §16 build sequence) and Control Tower + billing /
entitlement gating are separately scoped.

### 15. Test plan for the future code phases

The EXECUTE-VERIFY phases per §16 below MUST land at least these
test categories. Counts are targets, not contracts.

**Unit tier (target ~30 tests):**

- Policy evaluator pure-function tests: every autonomy ladder rung
  (§4) + `POLICY_UNRESOLVED` fail-closed + idempotency-key
  collision + envelope freeze + TAR-change-after-create-time
  fail-closed + soft-deleted-target-entity_id fail-closed.
- Action lifecycle transitions: every valid transition + every
  forbidden transition throws `ACTION_INVALID_TRANSITION`.
- Mapper / no-leak: forbidden fields never serialize.

**Integration tier (target ~20 tests + 4 BG.2 regressions + 6
dual-control-binding-style tests for `ORG_ACTION_POLICY_UPDATE`):**

- End-to-end Action lifecycle per risk tier (LOW + MEDIUM + HIGH +
  CRITICAL).
- Idempotency: repeated POST with same key returns same
  `action_id`.
- Cross-org leak guard (DRIFT-9 pattern).
- `ORG_ACTION_POLICY_UPDATE` PrivilegedEndpoint binding suite —
  **the first LIVE Class B integration coverage for Phase E.**
- BG.2 regression: valid grant for `ORG_ACTION_POLICY_UPDATE`
  short-circuits; consumed; second request denied; cross-action
  grant doesn't authorize.
- No-leak wire tests: forbidden fields never appear in response
  bodies, audit details, or error envelopes.

**Real-LLM tier:** 0 tests required (rule-based; no LLM dependency).

**Property / fuzz:** Optional later. Policy evaluator pure-function
property test is the natural candidate.

**Cross-org isolation:** covered by integration tier.

**Control Tower contract tests:** separate; CT-side planning QLOCK
owns.

### 16. Build sequence after ADR acceptance

Each step below is its own QLOCK. None of these are part of this ADR.

1. **ADR-0057 docs-only acceptance** (this QLOCK).
2. **CI no-leak guard EXECUTE-VERIFY** — Lane A4 from the prior
   planning packet. Lands BEFORE Section-2 code so the CI guard
   is in place to catch regressions in audit / response shapes.
3. **Schema + enums + audit literals EXECUTE-VERIFY** — Prisma
   model additions + `AUDIT_EVENT_TYPE_VALUES` extension + enums
   + `db:push:test` per ADR-0025. Smoke tests only.
4. **Policy evaluator + Action service EXECUTE-VERIFY** — pure
   evaluator + Action lifecycle service + unit tests. No routes.
5. **Read-side routes EXECUTE-VERIFY** — `GET /actions`,
   `GET /actions/:id`, `GET /org/actions`. Integration tests + no-leak
   assertions. Still no executor.
6. **Write-side routes + in-process executor EXECUTE-VERIFY** —
   `POST /actions`, `POST /actions/:id/cancel`, in-process worker,
   idempotency keys, integration tests, BG.2 regression.
7. **`ORG_ACTION_POLICY_UPDATE` PrivilegedEndpoint binding
   EXECUTE-VERIFY** — adds Operation E as the first LIVE Class B
   `can_admin_org` PrivilegedEndpoint. Full binding-style integration
   suite.
8. **CURRENT_BUILD_STATE docs refresh** — newest-first refresh.
9. **Control Tower Lane B planning** — separate CT-repo planning
   QLOCK (Actions Inbox + Approvals bridge + Policy Editor + Admin
   Audit View).
10. **ADR-0058 Connector / Executor Contract WRITE-AND-ACCEPT** —
    Section 4 / connectors. See §17 below.

### 17. Relationship to ADR-0058 (Connector / Executor Contract)

Section 4 (MCP / Connectors) of the 10 required production sections
remains the **next architectural layer** after Section 2 is live, but
is **NOT collapsed** into ADR-0057. ADR-0058 (forward-substrate; not
authored here) MUST canonicalize:

- the contract every external-tool connector (MCP, Slack, GitHub,
  Linear, generic webhook) must satisfy at the executor seam;
- the `IntegrationCredential` consumer surface;
- the connector error envelope + retry semantics;
- audit posture for outbound calls (separate forbidden-field list);
- no-leak in connector responses (responses MUST be re-mapped before
  Action result emission; raw third-party payloads NEVER reach
  `ActionResult.result_metadata`);
- credential rotation + revocation;
- per-action-type connector binding (which `ActionType` literals map
  to which connectors);
- BG.2 break-glass extension (whether connector emergencies require a
  new `PRIVILEGED_ACTION_TYPES` extension).

ADR-0057 explicitly does NOT define the connector contract. Foundation
ships Action-Core executors that perform Foundation-internal work
(audit, capsule operations, permission grants, notifications via the
existing Foundation surfaces) first. Connectors land per ADR-0058 + a
separate Section-4 EXECUTE-VERIFY sequence.

### 18. Founder authorization

Authorized under explicit Founder authorization per RULE 20 at
`[ADR-0057-AUTONOMOUS-EXECUTION-CORE-WRITE-AND-ACCEPT-AUTH]`
(2026-05-28). RULE 21 research arc embedded at §Standards / Source
Basis above (HITL / NIST AI RMF agentic profile / NIST SP 800-53
AU-2 / AU-3 / BullMQ + Trigger.dev + pg-boss queue-pattern 2026 best
practice + brief 2026-05-28 additional confirmation on AU-2 / AU-3
agentic audit content). Scope: docs-only ADR acceptance; no code /
schema / audit literal / route / service / middleware / test change.

Cites RULE 0 + RULE 1 + RULE 4 + RULE 10 + RULE 13 + RULE 16 + RULE
20 + RULE 21 + ADR-0001 (three-wallet architecture) + ADR-0002
(append-only audit chain + BEFORE DELETE trigger) + ADR-0006
(cross-org leak prevention) + ADR-0017 (Production Discipline) +
ADR-0021 (Capsule Type Extension Protocol; per-type validator
precedent) + ADR-0025 (Schema-Push-Target Discipline) + ADR-0026 +
ADR-0026 Amendment 1 (dual-control middleware + Phase E target
resolver) + ADR-0028 + ADR-0030 (BEAM forward-substrate) + ADR-0036
(REGULATOR + LawfulBasis audit-chain extension precedent) +
ADR-0042 (additive-audit-literal precedent) + ADR-0049 (GOVSEC
umbrella; ADR-0049 remains Proposed) + ADR-0050 + ADR-0050
Amendment 1 (BG.2 break-glass + GOVSEC.5 phase closure) + ADR-0051
(mapper-tier safe-projection precedent) + ADR-0052 (Otzar DGI
doctrine + Governed Synchronicity Loop "Execute" step) + ADR-0053
(twin role-scope profile; canonical non-goal list this ADR closes
the "execution engine" gap from) + ADR-0054 + ADR-0055 (mapper-tier
+ self-scope precedents).

## Consequences

### Easier

- The Foundation now has a canonical Section-2 design accepted at
  documentation tier; future Section-2 EXECUTE-VERIFY QLOCKs have a
  Rule-0 contract to verify against.
- The first LIVE Class B `PRIVILEGED_ENDPOINTS` entry has a
  forward-substrate home (`ORG_ACTION_POLICY_UPDATE`), promoting
  Phase E Class B from unit-tier-only to integration-tier coverage.
- Adding the `ACTION_*` literals follows the established additive
  precedent (no ADR-0002 amendment needed).
- The autonomy ladder (§4) is fully specified so the policy
  evaluator is a deterministic pure function — testable, replayable,
  and BEAM-portable.

### Harder

- Section 2 is now committed as a real production section, not as
  "later optional autonomy." Every future privileged endpoint that
  routes through dual-control inherits this Action-paired
  contract.
- Schema + audit-literal additions land per the build sequence;
  any deviation from the §16 ordering requires a separate
  Founder-authorized QLOCK.
- Connector / MCP integration (Section 4) is now *strictly* gated
  on a separate ADR-0058 — connectors cannot land before Section 2
  is live and stable.

### Substrate-honest distinctions

- "Autonomous Execution Core substrate is canonicalized at design
  tier" is SAFE to claim after this ADR is Accepted.
- "Autonomous Execution is live" is NOT safe; Section 2
  implementation is forward-substrate.
- "The 4 LIVE PRIVILEGED_ENDPOINTS are unchanged" is SAFE.
- "Class B (org-admin pool) is exercised at integration tier" is
  NOT safe until the `ORG_ACTION_POLICY_UPDATE` binding ships.
- "Workflows execute" is NOT safe; `Workflow` remains config-only
  per the current substrate.

## Status notes

- This ADR is accepted in a docs-only QLOCK. Substrate landings per
  §16 will not modify this ADR's body; later landings may add a
  `## Amendment N` section per the ADR-0026 / ADR-0050 /
  ADR-0042 minor-amendment precedent if Section-2 implementation
  reveals a substrate drift requiring reconciliation.
- This ADR does NOT modify `docs/CURRENT_BUILD_STATE.md`; a separate
  docs-refresh QLOCK will mark ADR-0057 as Accepted in the
  build-state truth-of-record per the established refresh pattern
  (cf. PR #9, PR #11).
