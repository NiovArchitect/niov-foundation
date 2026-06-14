# Otzar Flow Map

Status: Living doctrine (Phase 1284 Wave 2). Companion to
`otzar-work-os-collaboration-doctrine.md`. This maps Otzar's
interaction flows so every button **advances work** instead of merely
navigating. It is product doctrine — it does not change RULES/ADRs.

## Button-to-process doctrine

Every clickable thing is the entry to a process chain, not a page jump.
Before shipping a button as a primary UX action, it must answer:

1. Intent · 2. Object (person/message/thread/project/team/blocker/
decision/task/approval/ledger entry/AI Twin) · 3. Authority/policy ·
4. Next best action · 5. What happens automatically · 6. What needs
confirmation · 7. What needs approval · 8. Proof/audit created ·
9. What the user sees afterward · 10. What Otzar learns.

If a button has no mapped next process, it is not shipped as a primary
action. A button must **advance work**, never dead-end.

## Friction-removal rules

Automate what is safe and obvious. Ask the user **only** when: target
is ambiguous · policy requires approval · content is sensitive · action
is external · authority is insufficient · risk is high · genuine consent
is needed. Never re-ask context Otzar already has; never force manual
re-selection of an already-resolved target; never route to a page that
doesn't contain the relevant object; never create approvals for low-risk
human-authored internal notes; never make users hunt for where to reply.

## Flows

Each flow: entry → actor → target → object type → policy check →
automatic action → user confirmation → possible approval → destination →
next action → proof/audit → learning signal.

### 1. Direct internal message (Sadeil → David → reply → Sadeil)
- Entry: chat/voice "tell/message/let David know …" → classifier →
  draft card (executeMessageAction).
- Actor: human sender. Target: resolved org member. Object: message.
- Policy: human-authority, LOW-risk, internal inbox → **no dual-control**.
- Confirmation: Confirm button OR "I confirm"/"send it" applies to the
  active draft. Approval: none (unless sensitive/external/high-risk).
- Automatic: recipient resolved via `resolveCollaborationTarget`.
- Destination: card → "Delivered to David Odie".
- Proof: Notification + Work Ledger entry + audit (`POST /work-os/internal-messages`).
- Recipient view: inbox item "From: Sadeil · Founder"; tap → **message
  thread** (not Comms) → reply composer → reply via the SAME
  human-authority path back to the sender → original sender receives it.
- Learning: recipient correct? draft edited? confirmed/cancelled? replied?

### 2. Notification routing matrix
| Notification kind | Opens |
|---|---|
| Direct internal message (`DIRECT_MESSAGE`/message) | **`/app/inbox/:id` message thread** (From/To/body/reply/proof) |
| Linked governed Action / approval / dual-control | Action Center focused on the action |
| Connector / OAuth / integration | Connector Rails |
| Collaboration request | People & Collaboration |
| Meeting / calendar | My Day |
| System / health | System Health |
| Capture / comms draft | Comms capture detail |
Direct messages NEVER open the generic Comms capture page.

### 3. People & Collaboration (relationship cockpit — forward-substrate)
- Entry: click a person/team/project card (clickable, not a target-id form).
- Destination: that entity's collaboration cockpit.
- Per person: Message · Ask their Twin · Request help · Assign/review
  work · View shared projects · View pending work between us · View
  blockers involving them · What I owe / they owe · Collaboration history+proof.
- Per team/project: Message · Flag blocker · Ask team/project Twin ·
  Open decisions · Waiting-on · Risks/blind spots · Active Work Ledger ·
  Start/import capture.
- Each action is one click from the cockpit; manual target-id is debug-only.
- Status: **next focused unit** (this map authorizes it; not yet built).

### 4. Comms (conversation intelligence / capture cockpit)
- Purpose ONLY: start capture · import notes/transcripts · review captured
  conversations · extract follow-ups/decisions/blockers/commitments ·
  approve generated artifacts → Work Ledger · feed learning loops.
- NOT the destination for direct messages (unless it renders the thread).
- Copy should read "Capture conversations and convert them into governed work."

### 5. Action Center (formal approvals only)
- Entry: a policy-gated action (external/sensitive/high-risk/dual-control).
- Shows human-readable approval (who/why/what/preview/policy/risk/what-if),
  not raw `DUAL_CONTROL:…` codes. Approve/reject → execution → proof →
  notify affected. NOT used for ordinary human-authority internal notes.

### 6. Work Ledger / My Work / Team Work / Blind Spots
- Durable proof/state: tasks/blockers/decisions/commitments/follow-ups/
  execution attempts/verification/watchers. Reached from View/Why, not the
  primary comms UI. Each item shows owner/target/status/proof/next action.

### 7. AI Twin
- ask Twin → policy/context check (scoped to caller) → scoped answer/
  proposal → proof → optional human confirmation. A Twin never impersonates
  a human or fabricates consent.

## Ambient learning / self-improvement loop

Every process emits signals: recipient correct? · draft edited? ·
confirmed/cancelled? · replied? · work completed? · blocker resolved? ·
watcher helped? · approval too slow? · routing caused friction? · answer
corrected? These improve future routing, draft quality, follow-up/reminder
timing, project/people awareness, blocker detection, Twin usefulness, and
org alignment — via governed feedback/proof loops, not more manual pages.

**North star:** Otzar is ambient — it removes coordination drag and turns
communication into governed work intelligence, rather than adding pages and
manual task labor.
