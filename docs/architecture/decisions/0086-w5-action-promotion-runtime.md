# ADR-0086 — W5 Action Promotion Runtime

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

ADR-0081 §2.2 Stage 3 landed the W4 Proposed Action substrate at `docs/proposed-action/` (PR #220 `692f124` 2026-06-02). 18 proposed actions across Team (4) + Business (6) + Enterprise (8) materialize from W3 Stage 2 workflow recommendations and carry, per item, a closed-vocab `actor_role` + `intended_external_system` + `proposed_payload_shape` (safe + forbidden field sets) + `governance_gates` (policy_decision_required + approval_chain_required + dual_control_required + audit_required=true RULE 4 invariant) + 5-state state_machine (`PROPOSED_NOT_AUTHORIZED → REVIEWED → APPROVED/REJECTED → PROMOTED_TO_ACTION/CANCELED`) + `retention_class`.

W4 is **static substrate**. Every proposed_action_state is `PROPOSED_NOT_AUTHORIZED`. The catalog cannot create a Section 2 Action row on its own. The W4 README + every per-archetype catalog explicitly defers runtime promotion to a Founder-authorized later slice and reserves the audit literal `PROPOSED_ACTION_REFERENCED` as forward-substrate per ADR-0042 §Q-γ.1 clean-transition.

Section 2 Action runtime (ADR-0057) owns governed autonomous execution. The canonical create surface is `POST /api/v1/actions` (`apps/api/src/routes/actions.routes.ts:50-96`) → `createActionForCaller(callerId, input)` at `apps/api/src/services/action/action.service.ts:1-149`. `VALID_ACTION_TYPES` (action.service.ts:89-99) covers `RECORD_CAPSULE` + `PROPOSE_PERMISSION_GRANT` + `SEND_INTERNAL_NOTIFICATION` + `INVOKE_CONNECTOR`. The runtime owns ACTION_PROPOSED + ACTION_APPROVED + ACTION_REJECTED + ACTION_SCHEDULED + ACTION_STARTED + ACTION_SUCCEEDED + ACTION_FAILED + ACTION_CANCELLED + ACTION_EXPIRED + ACTION_POLICY_UPDATE audit emissions (audit.ts:322-331). Policy evaluation + approval routing + executor + scheduler + expiry sweep + per-attempt AbortController all live inside Section 2.

ADR-0026 dual-control middleware is route-bound static (`PRIVILEGED_ENDPOINTS` at `apps/api/src/security/privileged-endpoints.ts:99-146`; `requireDualControl(endpoint)` factory at `apps/api/src/middleware/dual-control.middleware.ts`). Currently 6 routes are registered (platform-tier monetization-config + org-creation + regulator-grant + regulator-revoke + org-action-policies + dandelion-enterprise-activate).

**The gap W5 closes:** there is no governed bridge between W4 (static catalog) and Section 2 (autonomous-execution runtime). A proposed action sits at `PROPOSED_NOT_AUTHORIZED` and can be read, reviewed, approved/rejected by humans, but no service in the repo translates a `proposed-action.X.business.v1` catalog entry into a Section 2 Action row that the runtime can execute. The five-state machine's `PROMOTED_TO_ACTION` transition has no runtime owner.

W5 is **the governed bridge**. It is not full autonomy. It does not bypass policy, approval, or dual-control. It does not introduce connector writes, autonomous external execution, raw-payload exposure, or chain-of-thought leakage. It introduces the smallest viable promotion path so the Section 2 Action runtime can finally consume W4's intent.

## Decision

### 1. Catalog-id identification (no Prisma model)

W4 proposed actions stay identified by their **catalog `id` string** (e.g., `proposed-action.executive-commitment-followup-draft.business.v1`). W5 does **not** add a Prisma `ProposedAction` model, does **not** introduce a UUID, and does **not** require a schema migration. The catalog is loaded from disk at startup and frozen in memory.

A static catalog loader `apps/api/src/services/proposed-action/proposed-action-catalog.ts` reads the three JSON files (`team-proposed-actions.json` + `business-proposed-actions.json` + `enterprise-proposed-actions.json`), validates them against `proposed-action.schema.json` at load time, and exposes:

- `getProposedActionById(id: string): ProposedAction | null`
- `listProposedActions(): ReadonlyArray<ProposedAction>`

Tests can override the loader via dependency injection (mirrors the FixtureBasedLLMProvider DI pattern at ADR-0014). The frozen registry is the authoritative substrate at runtime.

### 2. Promotion service is the single conversion point

NEW `apps/api/src/services/proposed-action/proposed-action-promotion.service.ts` exposes:

```typescript
promoteProposedActionForCaller(
  callerId: string,
  input: {
    catalog_id: string;
    idempotency_key: string;
    payload_summary?: string;
    target_entity_id?: string;
  },
  options: { dual_control_satisfied: boolean }
): Promise<{ action: ActionView; proposed_action_catalog_id: string }>
```

The service:

1. Resolves the catalog entry via `getProposedActionById(input.catalog_id)`. Unknown id → typed failure `PROPOSED_ACTION_NOT_FOUND` (404).
2. Asserts `proposed_action_state` is the initial `PROPOSED_NOT_AUTHORIZED` (W4's only authored value). Future state-transition substrate (W6+) may relax this.
3. Evaluates `governance_gates`:
   - If `governance_gates.dual_control_required && !options.dual_control_satisfied` → typed failure `DUAL_CONTROL_REQUIRED` (409). The caller must use the dual-control-gated route per §4 below.
4. Maps the catalog entry to a Section 2 `CreateActionInput` per §3 below.
5. Invokes `createActionForCaller(callerId, createActionInput)` — Section 2 retains ALL execution authority. The promotion service does NOT bypass policy, approval, scheduler, retry, expiry, or audit. Section 2 emits `ACTION_PROPOSED` (or `ACTION_APPROVED` on policy AUTO_APPROVE short-circuit) verbatim.
6. Emits **NEW** audit literal `PROPOSED_ACTION_REFERENCED` (per ADR-0042 §Q-γ.1 clean-transition; additive append-only; no ADR-0002 amendment needed). Details: `{ catalog_id, action_id, plan_archetype_id, actor_role, intended_external_system, dual_control_required, dual_control_satisfied, approval_chain_required, policy_decision_required, retention_class }`. **Forbidden in audit details:** raw payload content, raw safe_field_set VALUES, raw forbidden_field_set VALUES, raw secret material, raw transcript, raw prompt, chain-of-thought, vendor token. The audit envelope carries metadata only.
7. Returns `{ action: ActionView, proposed_action_catalog_id }` — the Section 2 ActionView verbatim plus the back-reference. The caller can then read Section 2's lifecycle via the existing `GET /api/v1/actions/:id` (ADR-0057 §9 + §10).

### 3. Catalog → CreateActionInput mapping

The mapping is closed-vocab and deterministic:

| Catalog `intended_external_system` | Section 2 `action_type` |
|---|---|
| `INTERNAL_ONLY` | `SEND_INTERNAL_NOTIFICATION` |
| `OUTBOUND_WEBHOOK` | `INVOKE_CONNECTOR` |
| `SLACK` / `GOOGLE_WORKSPACE` / `JIRA_CLOUD` / `LINEAR` / `GITHUB` / `MICROSOFT_365` | `INVOKE_CONNECTOR` |

`payload_redacted` is a **SAFE projection** only — it carries `{ proposed_action_catalog_id, plan_archetype_id, actor_role, intended_external_system, operation: proposed_payload_shape.operation }`. It **never** carries the values of `safe_field_set` keys or any `forbidden_field_set` content. The promotion service cannot fabricate real payload data; W5 is the **promotion** path, not the **execution** path. Section 2's per-`ActionType` handler is what eventually materializes a real payload from policy + caller context + binding lookup (Section 4) at execute-time, with the existing `ACTION_*` audit chain enforcing every gate.

`payload_summary` defaults to the catalog entry's `name` (truncated to ≤200 chars per ADR-0057 §9). The caller MAY override via `input.payload_summary` for incident-specific narration.

`idempotency_key` is caller-provided; per ADR-0057 §9 it is required + ≤200 chars. The W5 promotion service does NOT generate it.

`target_entity_id` is caller-provided and optional. Section 2's policy evaluator decides whether it is required per `action_type`.

### 4. Two routes — dual-control discrimination at the HTTP boundary

Per ADR-0026 the dual-control middleware is route-bound static; the W5 surface mirrors that:

- **NEW** `POST /api/v1/proposed-actions/:catalog_id/promote` — bearer + `can_admin_org` only. Service path is taken with `dual_control_satisfied: false`. If the catalog flags `dual_control_required: true` → 409 `DUAL_CONTROL_REQUIRED` with the canonical hint `Use POST /api/v1/proposed-actions/:catalog_id/promote-dual-control`.
- **NEW** `POST /api/v1/proposed-actions/:catalog_id/promote-dual-control` — bearer + `can_admin_org` + `requireDualControl(PROPOSED_ACTION_DUAL_CONTROL_PROMOTION)` preHandler. Service path is taken with `dual_control_satisfied: true`. The middleware enforces the canonical ADR-0026 invariants (second-actor + non-self-approval + cooldown + audit DUAL_CONTROL_VERIFICATION_PRE / DUAL_CONTROL_VERIFICATION_POST).

This preserves the established route-bound static dual-control posture **without** introducing dynamic middleware dispatch (which would be a substrate-architectural deviation from ADR-0026).

A NEW `PrivilegedEndpoint` entry registers the dual-control-gated route:

```typescript
{
  method: "POST",
  route: "/api/v1/proposed-actions/:catalog_id/promote-dual-control",
  authTier: "can_admin_org",
  actionDescriptor: { type: "PROPOSED_ACTION_DUAL_CONTROL_PROMOTION", metadata: {} }
}
```

### 5. NEW audit literal — `PROPOSED_ACTION_REFERENCED`

Append-only literal added to `AUDIT_EVENT_TYPE_VALUES` per ADR-0042 §Q-γ.1 clean-transition discipline. The literal was reserved as forward-substrate by the W4 envelope (`audit_expectations: ["PROPOSED_ACTION_REFERENCED (forward-substrate clean-transition) when consumed"]`) — W5 lands the runtime emission. No ADR-0002 amendment is required because the audit literal extension is additive and the canonical_record byte-equivalence is preserved (the new literal doesn't change any existing AuditEvent row's field projection).

Emission policy:

- Fires on successful promotion (after `createActionForCaller` returns).
- Outcome: `SUCCESS` if Section 2 accepted the proposal; `DENIED` if Section 2 rejected at policy / approval / NO_ELIGIBLE_TARGET tier.
- Caller / source / target / actor follow the standard ADMIN_ACTION semantics; the W5 service is the source.

### 6. No new audit literal beyond `PROPOSED_ACTION_REFERENCED`

The dual-control middleware already emits its own canonical audit events. Section 2 owns the full `ACTION_*` chain. W5 introduces exactly one literal — the back-reference marker. This is consistent with the ADR-0042 §Q-γ.1 minimum-touch principle.

### 7. No autonomous external execution

The Founder's per-slice authorization is explicit: no connector writes, no real external message sending, no autonomous external execution. W5 enforces this **structurally** by deferring to Section 2:

- Section 2's `INVOKE_CONNECTOR` handler (Section 4) does NOT support write operations at this tier per ADR-0084. Writes are forward-substrate to ≥C6 per-connector slices requiring separate Founder authorization each.
- Section 2's `SEND_INTERNAL_NOTIFICATION` handler is internal-only per Wave 11.
- Section 2's policy evaluator can FORBID any combination — W5 never overrides.

If a future per-connector write capability lands (e.g., Slack `chat.postMessage`), the promotion service automatically becomes capable of promoting it **because the runtime handler exists** — not because W5 widened its scope. The Founder authorization gate stays at the runtime handler tier, not at the promotion bridge.

### 8. RULE 0 + sovereignty preserved

Per RULE 0 every audit / approval / handler in Section 2 already enforces same-org tenancy + caller-bound entity scoping. W5 inherits this. The promotion service never enables cross-org promotion, never bypasses entity sovereignty, never raises an AI entity's clearance ceiling, and never allows an AI grantor to grant LONG_TERM / PERMANENT scope to another AI.

### 9. No CT surface in this slice

The W5 backend lands first. Per ADR-0077 §8.4 three-state-lifecycle honesty + the established Foundation-first / CT-second cadence, a Control Tower consumer surface for "promote proposed action" is **forward-substrate** to a separate Founder-authorized slice. The Foundation contract must be production-grade before any visual / voice consumer surface composes against it.

### 10. Tests required

Mandatory test coverage at the unit + integration tier:

- **Happy path** — proposed action with `dual_control_required: false` + `approval_chain_required: false` → promotion creates ACTION_PROPOSED row + emits PROPOSED_ACTION_REFERENCED with SAFE details
- **Dual-control required, plain route** — catalog flag true on `/promote` → 409 `DUAL_CONTROL_REQUIRED`
- **Dual-control required, dual-control route** — catalog flag true on `/promote-dual-control` with two distinct admin actors → success
- **Approval-chain required** — catalog flag true → Section 2 routes to escalation per existing policy; promotion service does NOT bypass; PROPOSED_ACTION_REFERENCED still emits because the promotion proposal itself succeeded
- **Invalid catalog id** — 404 `PROPOSED_ACTION_NOT_FOUND`
- **Cross-org** — Section 2 policy evaluator already enforces; W5 inherits without new test surface
- **No-leak** — audit envelope assertion: never contains `safe_field_set` VALUES, `forbidden_field_set` content, raw payload, secret material, vendor token; payload_redacted carries only the catalog back-reference + closed-vocab fields
- **Self-approval guard** — same-caller cannot satisfy dual-control (existing ADR-0026 GAP-C1; W5 inherits)
- **Catalog validation at load** — invalid JSON, schema mismatch, duplicate ids → loader throws at startup (boot-validation discipline per existing boot-validation.ts pattern)

### 11. Stop conditions inherited

- No real LLM over enterprise data
- No microphone capture (voice path is forward-substrate per ADR-0085 §VF.5+; Founder-gated)
- No blockchain / USDC / Coinbase / Circle / Base / x402 wiring
- No employee scoring / surveillance
- No raw transcript / prompt / chain-of-thought exposure
- No new Prisma migration
- No schema model

## Consequences

**Positive.**

- The W4 → Section 2 bridge is closed at the canonical bridge tier without inflating substrate. Each future improvement (per-connector writes, voice-initiated promotion, Hive-coordinated promotion) lands as an additive slice composing against the same canonical surface.
- The audit chain extends additively (one new literal: `PROPOSED_ACTION_REFERENCED`) per ADR-0042 §Q-γ.1 clean-transition discipline. canonical_record byte-equivalence preserved.
- The route-bound dual-control posture of ADR-0026 is preserved (two routes, not dynamic middleware dispatch).
- Section 2 retains all execution authority — W5 cannot bypass policy / approval / dual-control / audit / sovereignty.
- No schema migration risk; the catalog stays as the JSON substrate W4 already authored.

**Negative.**

- Two routes for promotion is one more HTTP surface than a single dynamic-middleware route. The trade-off is preserving ADR-0026's route-bound posture; we accept the cost.
- The catalog is loaded from disk at startup. Operationally this means a catalog update requires a redeploy. Acceptable for the current 18-item set; a future move to a Prisma-backed catalog is forward-substrate, gated by an operational signal (catalog churn > N updates / week) per ADR-0017 Production Discipline.
- `payload_redacted` carries only the catalog back-reference; the real payload materialization happens later at the per-`ActionType` handler tier. Operators reading the Section 2 ActionView can see what was proposed but not what the executor will eventually deliver. This is the correct posture (least-privilege at the promotion tier) and matches Section 2's existing SAFE projection contract.

**Forward-substrate (not authorized by this ADR).**

- Per-connector write capabilities (each ≥C6 slice requires its own Founder-authorized ADR per ADR-0084).
- Voice-initiated promotion (composes against ADR-0085 VF.5+; Founder-gated).
- Hive-coordinated batch promotion (composes against the future Hive Intelligence Runtime ADR; Founder-gated).
- Section 9 Workflow Orchestrator that promotes multi-action sequences (composes against ADR-0081 §3+; Founder-gated).
- Prisma-backed ProposedActionLog model for human-tier audit of which proposed actions were promoted, when, by whom (forward-substrate; gated by the operational signal above).
- The `REVIEWED` / `APPROVED` / `REJECTED` / `CANCELED` substate transitions (W4 state_machine carries them but W5 only services the `PROMOTED_TO_ACTION` transition; the human-tier review/approve/reject UX is forward-substrate to W6).
- CT consumer surface for the W5 promotion routes (Foundation-first / CT-second cadence).

## Alternatives

**Alternative A: Dynamic dual-control middleware that inspects the catalog at request time.** Rejected because it deviates from ADR-0026's route-bound posture and introduces a substrate-architectural deviation (dynamic gate evaluation against caller-supplied input). The two-route approach preserves the canonical pattern.

**Alternative B: Prisma `ProposedActionLog` model with state-machine columns + audit trigger.** Rejected for the V1 because the current 18-item catalog does not justify a Prisma model. Operational churn would surface the migration trigger per ADR-0017; until then the in-memory frozen registry is the canonical substrate.

**Alternative C: Add a new `PROMOTE_PROPOSED_ACTION` Section 2 `action_type` so the promotion itself is a Section 2 Action.** Rejected because it conflates the promotion tier with the execution tier. The promotion is a one-shot translation; the resulting Section 2 Action carries the full execution lifecycle. Adding a meta-Action would double the audit chain without adding governance value.

**Alternative D: Embed the audit literal `PROPOSED_ACTION_REFERENCED` inside `ADMIN_ACTION + details.action = "PROPOSED_ACTION_REFERENCED"`** (discriminator pattern per Section 4 / Section 7 precedent) instead of a new top-level literal. Rejected because the W4 envelope explicitly reserved the literal as a top-level forward-substrate addition; landing it as a discriminator instead would create a substrate-honest drift between W4's reservation and W5's implementation. Per ADR-0042 §Q-γ.1 clean-transition the top-level addition is correct.

## Patent-implementation evidence

Per ADR-0020 two-register IP discipline, W5 advances the patent-implementation evidence trail by canonicalizing the **governed bridge between intent (W4 Proposed Action) and execution (Section 2 Action runtime)** at the substrate-architectural register. The bridge is what makes the Foundation's claim to "humans always sovereign" (RULE 0) implementable — proposed actions sit at `PROPOSED_NOT_AUTHORIZED` until a sovereign human-tier authorization (policy + approval + dual-control as applicable) promotes them. The cryptographically-timestamped W5 commit lineage joins the patent-implementation evidence trail for US 12,517,919 (COSMP) + US 12,164,537 + US 12,399,904.

## RULE references

RULE 0 (humans always sovereign) + RULE 4 (audit chain integrity) + RULE 10 (soft-delete; preserved — no rows deleted; PROPOSED_ACTION_REFERENCED is append-only) + RULE 13 (substrate-honest pre-flight) + RULE 16 (no console.* in apps/api/src) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (research arc pre-authorization — embedded above as the substrate-truth survey).

## Cross-references

ADR-0002 (append-only audit chain — preserved; not amended) ·
ADR-0017 (Production Discipline — operational-signal-gated future Prisma migration) ·
ADR-0020 (two-register IP discipline) ·
ADR-0026 (dual-control middleware pattern + registry + binding contract) ·
ADR-0042 §Q-γ.1 (clean-transition discipline for additive audit literals) ·
ADR-0057 (autonomous execution core substrate — the canonical create surface W5 composes against) ·
ADR-0077 §8.4 (three-state-lifecycle honesty — preserved; W5 emits a fresh `PROPOSED` Section 2 Action) ·
ADR-0081 §2.2 Stage 3 (W4 Proposed Action Substrate — the static catalog W5 consumes) ·
ADR-0084 (Section 4 MCP connector strategy — per-connector writes remain ≥C6 forward-substrate) ·
ADR-0085 (Voice-First Product Doctrine — voice-initiated promotion is forward-substrate per VF.5+).
