# Otzar Work OS — Collaboration Doctrine

Status: Living doctrine (Phase 1284). This document captures the
product + architecture truth for Otzar's collaboration substrate so
future build sessions do not drift back into chatbot / ticket-form /
page-hopping patterns. It is doctrine, not an ADR — it does not change
RULES or ADRs. Where it touches governance it cites the existing RULES.

## 1. What Otzar is

Otzar is a **domain-general Work OS alignment layer** for organizations.
It turns conversation into governed, persistent, explainable, routed work
across: people → roles → hierarchy → authority → goals → projects →
conversations → meetings → commitments → decisions → blockers → tasks →
approvals → execution attempts → verification → memory → audit → learning.

Otzar is **not** a chatbot, **not** a ticket form, **not** a page-hopping
admin dashboard, and **not** "cards with no forward movement."

## 2. Core principles

- **Conversation is the primary surface of work.** Most real work happens
  in conversation; Otzar must understand organizational truth from
  conversation and route it properly.
- **Otzar should complete simple routed work end-to-end when policy
  allows.** It must not create manual labor when the user already
  expressed intent (e.g. naming a recipient who is in the roster).
- **Confirm must advance the workflow.** Confirm must lead to exactly one
  of: Sent internally · Proposed and waiting on a named approver · Saved as
  a task/request delivered to the recipient's My Work · Blocked with a clear
  reason and next step. It must never dead-end on a placeholder page.
- **Manual picklists are a fallback, not the primary flow.** A target
  picker appears only when resolution is ambiguous or unknown.
- **Developer codes must not be primary admin UI.** Raw action codes
  (e.g. `DUAL_CONTROL:ACTION_CREATE_SEND_INTERNAL_NOTIFICATION`) belong in
  an advanced View/Why/debug section, never as the headline of an approval.
- **Every routed action must have durable proof** (Work Ledger entry +
  execution attempts + audit), with sender, recipient, thread, and status
  always clear.

## 3. Governance invariants (cite, do not re-derive)

- **Humans are sovereign (RULE 0).** No AI accesses human/entity data
  without explicit, revocable, governed permission. AI Twins have lower
  default ceilings; an AI cannot grant access to another AI.
- **Authority is not consent.** Being able to act (authority) is distinct
  from a human agreeing to it (consent). A CEO recording a decision is an
  authority act; sending a notification to a person, or executing an
  external write, may still require that person's confirmation or a policy
  approval. The UI must say *which* of these is happening.
- **Knowledge access and action authority are separate.** Reading scoped
  context ≠ permission to act on it.
- **AI Twins must never impersonate humans or fabricate consent.** A Twin
  may draft, summarize, or propose within scope; it must not answer *as*
  another person or invent their agreement.
- **Audit trail is sacred (RULE 4).** The routed action is logged before the
  response is sent.

## 4. Isolation doctrine (Phase 1284 Priority-0)

Personal conversation state is **per-user**, never globally shared:

- Personal chat transcript is scoped by the authenticated user. The Control
  Tower keys local chat persistence by the authenticated session
  (`otzar.conversation.v2.${scopeId}`) and clears the visible transcript on
  logout. If the authenticated user is unknown, the chat is empty — it never
  shows a prior user's transcript (safety guard).
- The backend is the source of truth and is **caller-scoped**: AI Twin
  context, DMW/memory retrieval, embeddings search, and Work Ledger reads
  are all filtered by the authenticated caller's `entity_id` →
  `wallet_id`/`org_entity_id` (RULE 0). The personal chat transcript is
  local display state and is **never** sent to the backend as cross-user AI
  context — the ambient bar sends only the current utterance.
- Separate, distinct concepts that must never be conflated:
  personal conversation with Otzar · a shared collaboration thread · an
  inbound request from another user · a project/team thread · an AI Twin
  thread.

## 5. The general collaboration model

Collaboration resolves "**who/what is the target?**" into a **governed
target object**, never a hardcoded person. Target types (designed-for):
`PERSON`, `AI_TWIN`, `TEAM`, `PROJECT`, `ROLE`, `DEPARTMENT`,
`EXTERNAL_CONTACT`, `ORG_BROADCAST` (broadcast only if policy allows).

The single resolver (`resolveCollaborationTarget`, Phase 1284) is used by
chat, voice, the People page, and request-create so the same RBAC-governed
answer is produced everywhere. It:

- resolves an exact unique org member automatically (PERSON/AI_TWIN);
- surfaces candidates when ambiguous;
- returns NOT_FOUND for unknown people (never fabricates an attendee);
- labels external collaborators as external (not org employees);
- never passes a display name or malformed id into a UUID column —
  malformed ids return a clean `INVALID_ID`, never a raw Prisma error.

Every routed collaboration answers: who initiated it · who/what is the
target · what relationship exists (same-team / same-project / cross-team /
sensitive / executive / compliance / external) · what policy applies · is
approval required · is it delivered/proposed/blocked/pending/responded ·
what proof + audit exists · what the recipient can do next.

The reusable substrate already present in the repo: `TwinCollaborationRequest`
(multi-target-type request + state machine + approval), `Notification` +
`Action` (SEND_INTERNAL_NOTIFICATION) + `EscalationRequest` (dual-control),
`WorkLedgerEntry` (durable proof), and the COE/DMW caller-scoped retrieval.
Build on these; do not duplicate them.

## 6. Acceptance posture

The live two-user Sadeil ↔ David loop is **Proof Case A**, not the
architecture. Phase 1284 is complete only when the resolver, policy gate,
collaboration record, inbound/outbound UX, reply/thread model, and
human-readable approvals are **general** — i.e. the same system supports
David, Samiksha, Vishesh, a team, a project, or an AI Twin without
special-casing — AND the isolation invariants in §4 are proven.

## 7. Anti-patterns (do not do)

- Do not build a hardcoded David flow or a one-off direct-message feature.
- Do not route Confirm to a page that does not complete the action.
- Do not force a manual recipient pick when the recipient is explicit and
  resolvable.
- Do not show raw action/policy codes as the primary approval copy.
- Do not let one user's chat/transcript appear in another user's session.
- Do not generate an AI Twin answer *as* another human.
- Do not send Slack/email/calendar/external notifications unless explicitly
  enabled and approved.
