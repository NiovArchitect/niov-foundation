# Otzar Correction-Memory Learn-Loop

Status: read-path v1 SHIPPED (recipient corrections into Comms/meeting ingest).
Decision date: 2026-07-03. Founder-approved scope: read-path first; the BUG C
resolved FOLLOW_UP rows ARE the correction store; no duplicate memory writes;
no dead-end TwinCorrectionMemory records.

## The principle

When a human corrects Otzar through a governed surface, that decision must be
readable by the exact code that makes the next routing decision — or it must
not be called learning. Every correction influence is: **org-scoped, stable-ID
based, deterministic, explainable (evidence.source), and policy-subordinate**
(it can never bypass unauthorized / cross_team_needs_approval / RBAC / ABAC /
TAR / approval policy, and never mints auto-send).

## The store decision (why no new table, why not TwinCorrectionMemory)

- `OrgRecipientCorrection` existed only as a pure type + pure functions —
  no persistence, no runtime consumer. Kept for founder-feedback-text
  corrections (aliases / hard excludes); not the learn-loop store.
- `TwinCorrectionMemory` is per-owner Twin teaching with a free-text
  `safe_summary` column deliberately designed never to carry structured or
  raw data. Parsing entity IDs out of prose would be a hack, and rows written
  there would be dead-end memory for routing. **Not used. No rows written.**
- **The BUG C resolved FOLLOW_UP row is already a complete correction
  record**: org_entity_id, owner (actor), ledger_entry_id, the chosen stable
  target entity, decision provenance (`recipientSafety: "confirmed"` +
  `evidence.source: "caller_confirmed"` + preserved `alternativeCandidates` +
  `matchedToken`/quote), and the `FOLLOW_UP_RECIPIENT_RESOLVED`
  audit_event_id on the row. The write already existed — the learn-loop
  closes by READING it. Zero new writes, zero duplicate rails.

## Read-path v1 (shipped)

`ingestSourceEvent` (every transcript/source ingest) loads the org's 200 most
recent FOLLOW_UP rows (org-scoped WHERE — cross-tenant influence is
structurally impossible), parses caller-resolved decisions
(`resolvedDecisionFromFollowUpDetails`), aggregates them
(`derivePriorRecipientDecisions`), and threads them through
`extractFromCapturedText` → `governExtraction` → `classifyRecipient`:

1. **Prior SELECT → repeated-ambiguity resolution.** A select decision maps
   the COLLISION token (the token shared between the chosen person's name and
   every alternative — the token the human actually disambiguated) to the
   chosen stable entity_id. Conflicting selections drop the token entirely
   (humans disagreed → the question must stay). At ingest:
   - `governExtraction` deterministically **retargets** a proposed recipient
     to the prior selection when the proposed name token genuinely collides
     on the roster and the prior pick is an active roster member.
   - `classifyRecipient` treats a transcript-grounded prior-selected token as
     an **alias proof** (`mentionStatus: alias_mentioned`, evidence source
     `correction_memory`). Verdict lands at `likely` — human-reviewed, never
     send-ready by correction alone.
2. **Prior CONFIRM → softened repeat warning.** A confirm decision vouches
   for a stable entity. Next time that entity is proposed with no proof path,
   the verdict softens `out_of_scope → likely` (evidence source
   `caller_confirmed`) — a gentler review, not a bypass. Blocked policy still
   yields `unauthorized`; cross-team still yields `cross_team_needs_approval`;
   a hard `excludeEntityIds` exclusion still wins; `autonomyEligibility` never
   rises above `approval_required`.

Explainability: the influence is visible in `evidence.source`
(`correction_memory` / `caller_confirmed`) on the stored governance verdict —
auditable, loggable, and asserted in tests. No customer-facing "Otzar learned"
copy exists yet, by design (no UI claims until a UI slice needs them).

## Correction taxonomy

| # | Type | Source event | Stable IDs | Org scope | Policy boundary | Read where | Write now? | Use now? | Proof |
|---|------|-------------|-----------|-----------|-----------------|-----------|-----------|----------|-------|
| 1 | Recipient confirmation | BUG C confirm (`FOLLOW_UP_RECIPIENT_RESOLVED`, decision=confirm) | target entity_id, ledger_entry_id, audit_event_id | row org_entity_id | never past unauthorized / cross_team / exclusions; draft_only ceiling | ingest → classifyRecipient (`priorConfirmedEntityIds`) | already written (BUG C) | **YES (shipped)** | unit: soften + 4 never-bypass cases; integration: loop test |
| 2 | Ambiguous recipient selection | BUG C select (decision=select) | selected entity_id + collision token | row org_entity_id | same; conflicting selections self-cancel | ingest → governExtraction retarget + classifyRecipient (`priorSelections`) | already written (BUG C) | **YES (shipped)** | unit: same-entity-only, hostile-prior, conflict-drop; integration: select-once loop + cross-org isolation |
| 3 | Wrong owner / owner confirmation | none yet (no owner-correction surface writes durable decisions) | commitment ledger_entry_id + owner entity_id | org | ownership change must be audited like BUG C | future: work-item planner owner resolution | NO | NO — future | — |
| 4 | Project/workspace assignment | assignment slice (`/org/assignments`, `via_org_admin` audit) | person + target ids | org | admin-only write; dual membership gates | already canonical: org graph itself (growth, isActiveProjectMember) — membership IS the memory, no separate correction row needed | already written (canonical membership) | YES (shipped in assignment slice) | admin-routes +7, dandelion truth-changed/archive tests |
| 5 | Recommendation hide/dismiss | CT "Hide for now" | rec key | session-local only | must never masquerade as truth change | n/a | NO (session state) | current behavior only | dandelion unit tests |
| 6 | Approval/rejection outcome | Action/Escalation verdicts (`resolution_metadata.reason`) | action_id, approver entity_id | org | MUST NOT suppress future approvals without policy | future: action drafting/risk hints | already written (actions/escalations) | NO read yet — future, needs its own design | — |
| 7 | Tool/setup correction | none | — | — | — | future | NO | NO | — |
| 8 | Workflow observation | none | — | — | — | future — do not build | NO | NO | — |

## Hard rules encoded in code + tests

- No dead-end writes: the loop consumes the rows BUG C already writes; no new
  store; no TwinCorrectionMemory rows.
- No cross-org influence: org-scoped query + integration tests in both
  directions.
- No display-name identity: stable entity_ids end-to-end; display names are
  used only to recover the collision token a transcript used, never to
  identify a person.
- No policy bypass: unit-locked for unauthorized, cross_team_needs_approval,
  hard exclusions, and the autonomy ceiling.
- No LLM involvement: the entire loop is deterministic correction injection;
  prompts unchanged.
- No UI learning claims: none shipped; any future claim must render only from
  backend-proven `evidence.source` values.

## What remains future (honest)

- Owner-correction (type 3) has no durable correction surface yet.
- Approval-outcome learning (type 6) is written but unread; reading it into
  drafting/risk needs its own boundary design.
- Durable recommendation dismiss (type 5) is a product decision, not started.
- The confirm-vouch is entity-scoped, not context-scoped: a person vouched
  once softens future out_of_scope warnings for any work context. Verdict
  stays human-reviewed (`likely`), so the safety floor holds; a per-domain
  vouch scope is a future refinement if it proves too broad.
- Correction provenance is not yet customer-visible ("Using a prior
  correction from your organization" copy is specified but unshipped).
