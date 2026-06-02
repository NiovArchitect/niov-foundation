# Voice Interaction Map — 13 Otzar Product Surfaces

Per ADR-0085 §7. Voice is evaluated at every Otzar product surface. No surface is voice-only — every voice intent has a typed equivalent. Voice expands modality; it does not gate modality.

## Per-surface catalog

### 1. Onboarding / Dandelion

**Canonical voice intents:**
- "Tell me about my company's connectors"
- "What roles does Dandelion suggest for my team?"
- "Recommend my starter envelope"
- "Walk me through the Dandelion 6-stage maturity model"
- "Show me what governance approvals I need to activate the team archetype"

**Default risk tier:** LOW

**Governance hooks:** Dandelion read-only preview per ADR-0080 + ADR-0082 Amendment 1. No activation per voice — admin still approves via typed confirmation per ADR-0080 §23 Amendment 7 D6 DUAL-CONTROL wiring.

---

### 2. Admin Twin

**Canonical voice intents:**
- "Show me pending approvals"
- "Summarize last week's audit chain"
- "Are any connectors unhealthy?"
- "What policies were updated this month?"
- "Brief me on the org's compliance posture"

**Default risk tier:** LOW (read paths) / MEDIUM (proposed admin actions)

**Governance hooks:** Admin Twin runs in admin scope per ADR-0053; voice intents that propose admin-tier mutations (e.g., "approve the pending workflow execution") materialize as Section 2 Actions and ride the same `can_admin_org` gate as the typed equivalent.

---

### 3. AI Twin interaction

**Canonical voice intents:**
- "Draft a reply to this Slack thread"
- "What did I commit to in yesterday's meeting?"
- "Summarize my unread Linear issues"
- "Help me think through this design decision"
- "What's on my calendar today?"

**Default risk tier:** LOW (drafts + summaries) / MEDIUM (proposed external actions)

**Governance hooks:** DMW scope per ADR-0001 + RULE 0. AI Twin's voice path inherits the same EntityComplianceProfile permission ceiling as the typed path. "Send this Slack reply" voice intent materializes as a MEDIUM-risk proposed action requiring explicit confirmation before delivery.

---

### 4. AI Teammate interaction

**Canonical voice intents:**
- "Help me review this PR"
- "Summarize this Jira project's risk"
- "What did the team decide about the auth migration?"
- "Run a sprint risk summary"

**Default risk tier:** LOW–MEDIUM

**Governance hooks:** AI Teammate runs in role scope per ADR-0080 RoleTemplate. Cross-tenant boundary absolute per ADR-0049 GOVSEC.7 — a Teammate cannot voice-leak context across tenants.

---

### 5. Workflow recommendations

**Canonical voice intents:**
- "What workflows can I run this week?"
- "Propose a sprint risk summary workflow"
- "Recommend workflows for my role"

**Default risk tier:** MEDIUM

**Governance hooks:** Per ADR-0081 (Section 9 Workflows Doctrine) — workflows produce proposed actions. Voice-proposed workflow recommendations are stored as recommendations only; activation requires typed admin confirmation.

---

### 6. Proposed Actions

**Canonical voice intents:**
- "Create a proposed action to send the standup follow-up"
- "Propose updating the Jira sprint status"
- "Draft a proposed action for the customer follow-up"

**Default risk tier:** MEDIUM

**Governance hooks:** Voice intent materializes as a Section 2 Action with `status: PROPOSED`. The Action rides the canonical Action lifecycle (policy decision + approval if applicable + idempotency + audit). Voice can draft freely; execution requires explicit confirmation per the risk tier.

---

### 7. Approval requests

**Canonical voice intents:**
- "Approve the workflow execution that's pending my review"
- "Reject the proposed Slack send"
- "Show me what needs my approval"

**Default risk tier:** HIGH

**Governance hooks:** Approval is HIGH-risk because it affects another caller's execution path. Voice "approve" intent requires explicit confirmation (text or voice "yes") AND fires the Section 2 + ADR-0026 dual-control gate. The audit trail records the approval just like the typed path.

---

### 8. Connector questions

**Canonical voice intents:**
- "Is my Linear binding healthy?"
- "Show me the last failed connector invocation"
- "What scopes does my Slack binding have?"

**Default risk tier:** LOW

**Governance hooks:** Connector read-only metadata path. `can_admin_org` gate enforced before the voice intent surfaces binding details. No secret values surface — voice surfaces the `secret_ref` env-var NAME just like the CT page does.

---

### 9. Meeting follow-ups

**Canonical voice intents:**
- "Draft action items from today's meeting"
- "Summarize the design review I just attended"
- "What did the team commit to in standup?"

**Default risk tier:** MEDIUM

**Governance hooks:** Meeting transcripts are governed per ADR-0079 transcript substrate policy. Voice meeting follow-ups inherit the same retention class + no-leak rules as typed transcript reads. Proposed follow-up actions ride the Section 2 Action runtime.

---

### 10. Hives

**Canonical voice intents:**
- "What's the team's current focus?"
- "Coordinate the design review across the hive"
- "What blocked the team this week?"

**Default risk tier:** LOW–MEDIUM

**Governance hooks:** Hives are team-scoped intelligence per Section 3 + ADR-0059. Voice intent respects hive membership; cross-hive leakage structurally impossible per the existing hive query path.

---

### 11. Agent Playground

**Canonical voice intents:**
- "Run a simulation of the sprint-risk-summary workflow"
- "Explain why the simulated agent chose that path"
- "Compare the candidate outcomes for this scenario"

**Default risk tier:** LOW

**Governance hooks:** Per Section 5 + ADR-0077. Simulation runtime is sandboxed; voice intent triggers simulations that ride the existing Playground governance pipeline. No Action runtime side effects.

---

### 12. Audit explanations

**Canonical voice intents:**
- "Why did the policy deny that action?"
- "Explain the chain link for event X"
- "Walk me through last week's break-glass invocation"

**Default risk tier:** LOW

**Governance hooks:** Audit-viewer read path per Section 7 + ADR-0071 cross-scope verify-chain. Scope gates TAR-authoritative; voice intent inherits the same `self / org / platform / regulator` scope discrimination. Regulator scope requires LawfulBasis per ADR-0036.

---

### 13. Executive briefings

**Canonical voice intents:**
- "Brief me on the compliance posture this quarter"
- "What were the top risk signals this month?"
- "Summarize the org's autonomous execution activity"

**Default risk tier:** LOW–MEDIUM

**Governance hooks:** Executive briefings are aggregate-only per ADR-0052 doctrine — no per-employee scoring; no manager-surveillance framing. Voice briefings surface the same aggregates as the typed Control Tower briefing surface; no extra inference is performed for the voice path.

---

## Surface-to-risk-tier summary

| Surface | LOW | MEDIUM | HIGH |
|---|---|---|---|
| 1 Onboarding / Dandelion | ✓ | | |
| 2 Admin Twin | ✓ | ✓ | |
| 3 AI Twin | ✓ | ✓ | |
| 4 AI Teammate | ✓ | ✓ | |
| 5 Workflow recommendations | | ✓ | |
| 6 Proposed Actions | | ✓ | |
| 7 Approval requests | | | ✓ |
| 8 Connector questions | ✓ | | |
| 9 Meeting follow-ups | | ✓ | |
| 10 Hives | ✓ | ✓ | |
| 11 Agent Playground | ✓ | | |
| 12 Audit explanations | ✓ | | |
| 13 Executive briefings | ✓ | ✓ | |

## Forbidden voice intents (across all surfaces)

- "Show me what my employees said in their private chats"
- "Score my team's productivity"
- "Profile my employees psychologically"
- "Tell me about [protected attribute] of my team"
- "Bypass the approval and just send it"
- "Send this without auditing it"
- "Talk to [tenant B's] data"
- "Show me regulator-confidential evidence" (without LawfulBasis)
- "Guarantee this action is compliant" (no certainty claims; per ADR-0070)
