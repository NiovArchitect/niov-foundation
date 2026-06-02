# Risk-Tiered Voice Action Model

Per ADR-0085 §3. Voice actions are classified into three risk tiers; the tier determines what governance gate fires before delivery.

Voice can draft freely within scope. Voice cannot execute risky actions without governance. **There is no separate "voice bypass" risk tier.** Voice rides the same Section 2 Action runtime governance pipeline as typed text.

## The three tiers

### LOW RISK — voice intent is the confirmation

**Characteristics:** Read-only or draft-only intents. No external system side effect. No state mutation outside the caller's own DMW capsules. No effect on another caller.

**Governance gate:** Audit only. The voice intent is the confirmation (the caller said it; they meant it).

**Worked examples:**
- "Ask my Twin: what did I commit to in yesterday's meeting?" — read-only DMW query.
- "Summarize approved context" — read-only context-resolver query.
- "Explain my day" — calendar + task + recent-Action read.
- "Draft a message" — draft-only; never sent. The draft is held as a `proposed_action` with `intent_class: "LOW"` and `confirmation_state: "NOT_NEEDED"` (or upgraded to `MEDIUM` if the caller asks to send).
- "Find a document" — metadata search; subject to DMW scope.
- "Read a safe brief" — pre-generated brief surfaced via voice.

**Audit literal:** `VOICE_INTENT_RECEIVED` (forward-substrate at VF.2) + the standard read-path audit literal (e.g., `CAPSULE_CONTENT_READ`, `AUDIT_VIEW_AUDIT_EVENT_LIST_READ`).

---

### MEDIUM RISK — explicit confirmation required

**Characteristics:** Voice intent proposes a state change OR an external-system-facing action OR an effect on another caller. The proposed action materializes as a Section 2 Action with `status: PROPOSED`. **Explicit confirmation (text or voice "yes") required** before the Action transitions to `RUNNING`.

**Governance gate:** Confirmation modal + audit. The caller's confirmation is itself emitted as an audit event before delivery.

**Worked examples:**
- "Propose a workflow" — materializes as a Workflow proposed-action per Section 9.
- "Draft a Slack response and send it" — draft is LOW; send is MEDIUM. The send fires only after explicit confirmation.
- "Prepare a meeting follow-up" — drafted follow-up materializes as a `proposed_action`; sending it MEDIUM-tier requires confirmation.
- "Suggest a task" — creates a `proposed_action`; assignment is MEDIUM.
- "Create a proposed action to send the standup follow-up" — explicit creation of a `proposed_action` always MEDIUM (the action is the side effect).

**Audit literal:** `VOICE_INTENT_RECEIVED` + `VOICE_INTENT_CONFIRMED` (forward-substrate at VF.2) + the standard `ACTION_*` audit chain.

**Confirmation flow:**
1. Envelope construction with `intent_class: "MEDIUM"` + `confirmation_state: "PENDING"`.
2. Foundation emits `VOICE_INTENT_RECEIVED` audit event.
3. Caller is prompted (typed or spoken) for confirmation.
4. On `CONFIRMED`: Foundation emits `VOICE_INTENT_CONFIRMED` audit event; the `proposed_action` transitions to `RUNNING` per Section 2.
5. On `REJECTED` or `EXPIRED`: Foundation emits `VOICE_INTENT_REJECTED` / `VOICE_INTENT_EXPIRED`; the envelope closes; no Action runtime side effect.

---

### HIGH RISK — explicit confirmation + Section 2 governance gate

**Characteristics:** Voice intent causes an external-system change, modifies governance state, affects compliance posture, or affects another caller's authorization. Includes everything in MEDIUM + the standard Section 2 dual-control gate per ADR-0026.

**Governance gate:** Confirmation + ADR-0026 dual-control (where applicable) + the standard Section 2 policy decision + the standard Section 9 approval chain (where applicable) + audit.

**Worked examples:**
- "Send a message" — actually sends a Slack / Email message via a connector. Requires confirmation + the connector binding policy decision.
- "Update an external system" — connector write. Forward-substrate at ≥C6 per ADR-0084.
- "Modify permissions" — `PROPOSE_PERMISSION_GRANT` Action per Section 2. Requires confirmation + approval per the standard Section 9 path.
- "Approve spending" — Section 2 Action with monetization-tier policy decision.
- "Disclose compliance material" — requires LawfulBasis per ADR-0036.
- "Change connector settings" — `can_admin_org` gate + ADR-0026 dual-control.
- "Activate workflows" — Section 9 governance gate.

**Audit literal:** `VOICE_INTENT_RECEIVED` + `VOICE_INTENT_CONFIRMED` + (optionally) `VOICE_INTENT_APPROVAL_GRANTED` + the standard `ACTION_*` audit chain + (where applicable) `DUAL_CONTROL_*` audit literals.

**Confirmation + approval flow:**
1. Envelope construction with `intent_class: "HIGH"` + `confirmation_state: "PENDING"` + `approval_chain_state: "PENDING"` (if applicable).
2. Foundation emits `VOICE_INTENT_RECEIVED` audit event.
3. Caller is prompted for confirmation.
4. On `CONFIRMED`: Foundation emits `VOICE_INTENT_CONFIRMED`.
5. If `approval_chain_state` is `PENDING`: Section 9 approval flow fires. ADR-0026 dual-control gate fires where applicable (e.g., `ORG_ACTION_POLICY_UPDATE` per PR #206).
6. On `APPROVED`: the `proposed_action` transitions to `RUNNING`.
7. On `REJECTED` at any tier: the envelope closes; no Action runtime side effect; audit chain records the rejection.

## Forbidden tier overrides

The risk tier cannot be lowered by voice intent semantics. A caller cannot say "I authorize you to skip approval and just send it" to downgrade a HIGH intent to MEDIUM. The tier is determined by the Action surface, not the caller's voice request.

If a caller's voice intent attempts to bypass governance, the envelope is closed with `closed_reason: "POLICY_DENIED"` and a `VOICE_INTENT_REJECTED` audit event fires.

## Per-surface default tier matrix

See [interaction-map.md](./interaction-map.md) §Surface-to-risk-tier summary. Every surface's default tier is recorded; specific intents at a surface can be elevated (never demoted) based on the proposed action.

## Reading

- [ADR-0085 §3](../architecture/decisions/0085-voice-first-product-doctrine.md) — Risk-tiered voice action model (canonical decision substrate)
- [ADR-0026](../architecture/decisions/0026-dual-control-middleware-pattern-privileged-endpoint-registry-and-per-route-binding-discipline.md) — Dual-control middleware
- [ADR-0057](../architecture/decisions/0057-section-2-autonomous-execution-core.md) — Section 2 Action runtime
- [interaction-map.md](./interaction-map.md) — 13-surface catalog
- [voice-intent-envelope.md](./voice-intent-envelope.md) — Substrate object
