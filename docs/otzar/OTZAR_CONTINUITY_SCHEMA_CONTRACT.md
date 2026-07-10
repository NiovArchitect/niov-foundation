# Otzar Continuity — Complete Additive Schema Contract (P5/P6)

**Status: DESIGN LOCKED (2026-07-10). Implemented across coordinated focused PRs.**
This is the single additive data-model contract for the whole internally-achievable
P5/P6 continuity system, per founder directive ("produce one full schema contract for
all internally achievable P5/P6 data requirements … activation must be coordinated and
dependency-aware"). Every change is additive (ADR-0025). Production activation is
staged (below), but each stage is independently complete and cannot create a
code/schema partial state.

## Incident note (must read)

A v0 turn table (`otzar_conversation_turns`) and 5 additive `otzar_conversations`
columns were merged (FND `61c4271`, PR #617) and activated in prod **before** this
contract was finalized. The table is **empty and unused** (no runtime wiring was
deployed). This contract **corrects** that v0 additively (SET NOT NULL and new
identity columns are trivial on an empty table; the two v0-only columns
`actor_entity_id` and `visibility` are dropped as a same-day empty-draft correction,
not a data migration). No data was ever written; no rollback of live behavior needed.

## Identity doctrine (applies to every model)

Separate **relationship ownership** from **message authorship**:
- `org_entity_id` — the tenant that owns the thread/turn/memory. **NON-NULL on all
  newly-created rows.**
- `subject_entity_id` — the **human user** whose private Otzar relationship/thread
  this belongs to. Isolation is keyed on (org, subject).
- `author_entity_id` — the entity that **authored** this turn: the subject (USER
  turns), the Twin (ASSISTANT turns), or a governed system entity (SYSTEM turns).
- `twin_entity_id` — the Twin participating/authoring, where applicable (nullable).

A single ambiguous `actor_entity_id` is **not** used. Legacy `OtzarConversation` rows
retain nullable compat fields, but **all newly-created threads/turns/memories receive
org + subject + author (+ twin where applicable)**.

Private conversation content is **PRIVATE by construction**. There is **no
`visibility=ORG` switch**. Organization truth is reached only through the governed
**promotion lineage** (§7).

---

## 1. Thread model — `OtzarConversation` (field doctrine + additions)

**Existing fields (doctrine clarified):**
- `conversation_id` (PK, uuid) — the thread id (server-authoritative; the client
  echoes it, never authors it).
- `entity_id` — **the subject/owner human user** (the person whose Otzar relationship
  this thread is). This is the thread's `subject_entity_id`. (Kept for compat; the
  lifecycle service treats it as subject.)
- `twin_id` — the Twin participating in the thread.
- `source_type` — CHAT | VOICE | AMBIENT origin.
- `participants[]` — entity ids permitted to participate.
- `message_count` — coarse counter (kept; not authoritative for turn sequence).
- `status` — lifecycle: `ACTIVE | ARCHIVED | CLOSED | DELETED`.
- `started_at`, `closed_at`, `summary_capsule_id` (close-time learning capsule; a
  distinct concern from the live structured summary in §6).

**Additive fields (nullable for legacy; set on every new thread):**
| field | type | purpose |
|---|---|---|
| `org_entity_id` | uuid? | tenant owner; enforced NON-NULL at write for new threads |
| `last_active_at` | timestamp? | most-recent restoration ordering (P5B) |
| `timezone` | text? | tz snapshot at thread start (temporal grounding) |
| `summary_version` | int (0) | current structured-summary version (§6) |
| `retention_class` | text (STANDARD) | retention classification (§10) |
| `archived_at` | timestamp? | when archived |
| `deleted_at` | timestamp? | delete-eligible tombstone (content redacted, row kept for lineage) |
| `retention_expires_at` | timestamp? | when transcript content is eligible for expiry |
| `last_summary_at` | timestamp? | when the structured summary was last regenerated |
| `turn_seq` | int (0) | **atomic per-thread turn sequence allocator** (§5) |

**Ownership enforcement:** org is enforced at write; a thread is never reused across
orgs. A **typed thread lifecycle service** (`OtzarThreadService`) owns all state
transitions (open/touch/archive/reopen/close/delete-eligible) — no scattered string
updates.

## 2. Turn model — `OtzarConversationTurn` (CORRECTED, replaces v0)

| field | type | notes |
|---|---|---|
| `turn_id` | uuid PK | |
| `conversation_id` | uuid | thread (must exist + pass ownership checks §3) |
| `org_entity_id` | uuid **NOT NULL** | tenant |
| `subject_entity_id` | uuid **NOT NULL** | the human user whose private thread |
| `author_entity_id` | uuid **NOT NULL** | who authored (subject / twin / system) |
| `twin_entity_id` | uuid? | Twin where applicable |
| `role` | text | USER \| ASSISTANT \| SYSTEM |
| `content` | text | SAFE text only (ADR-0057 §16); 8k cap |
| `content_hash` | text | sha-256 of content — idempotency same/different-content check (§4) |
| `sequence` | int | monotonic per thread (from `turn_seq`, §5) |
| `request_id` | text? | client idempotency key (§4) |
| `reply_to_turn_id` | uuid? | assistant→user linkage |
| `action_ref` | uuid? | WorkLedgerEntry proposal/action this turn concerns |
| `supersedes_turn_id` | uuid? | correction/supersession lineage |
| `source_channel` | text (CHAT) | CHAT \| VOICE \| AMBIENT |
| `model_provider` | text? | safe model/provider label (never keys) |
| `retention_class` | text (STANDARD) | |
| `created_at` | timestamp | |

Unique `(conversation_id, sequence)` (correctness backstop) + `(conversation_id,
request_id)` (idempotency). **Dropped from v0:** `actor_entity_id` (ambiguous),
`visibility` (org promotion is §7, not a string switch).

## 3. Structural ownership checks (query layer, not just routes)

Every append/list/read takes an **expected scope** `{org_entity_id,
subject_entity_id, twin_entity_id?, conversation_id}` and verifies, in the data layer:
1. the conversation exists,
2. it belongs to the expected org,
3. the subject user owns/participates,
4. the Twin matches the thread relationship (when material),
5. the thread is not `DELETED`,
6. the operation is permitted for the lifecycle state (e.g. no append to CLOSED).

A mismatch returns a typed `ThreadScopeError` (never silently reads another tenant's
thread). No append/read by bare conversation UUID. Tests: cross-org, cross-user,
cross-Twin, archived, closed, deleted.

## 4. Idempotency contract (end-to-end, wired through routes)

- Optional `request_id` on every relevant Otzar route (stable format, bounded length,
  validated).
- same thread + same `request_id` + same `content_hash` → return the existing
  turn/result (no duplicate, no re-invocation).
- same thread + same `request_id` + **different** content → stable
  `IdempotencyConflictError`.
- different thread + same `request_id` → allowed.
- The assistant response is linked idempotently to its user request; a **response-lost
  retry returns the persisted assistant result** rather than re-invoking the
  model/tool. (Assistant turn carries the resolved-request linkage.)
- Tests: two tabs, duplicate network retries.

## 5. Sequence allocator — DECISION: atomic counter (Option B)

`OtzarConversation.turn_seq` incremented atomically:
`UPDATE otzar_conversations SET turn_seq = turn_seq + 1, last_active_at = now()
WHERE conversation_id = $1 [AND ownership predicates] RETURNING turn_seq`.
- **Collision:** impossible — the UPDATE is atomic under any isolation level; each
  caller gets a distinct value.
- **Concurrency:** row-level lock on the thread row serializes allocation per thread;
  different threads never contend.
- **Transaction boundary:** allocation + turn insert in one transaction; on insert
  failure the tx rolls back (no gap consumed on rollback; gaps are otherwise
  impossible).
- **Retry:** none needed (no read-max race).
- **Ordering:** strictly monotonic per thread.
- **Two-device:** two devices serialize on the thread row; both get distinct
  sequences; the unique `(conversation_id, sequence)` index is the correctness
  backstop.
- **Requires the thread row to exist** → unifies allocation with the ownership check
  (§3): a missing/foreign thread yields 0 updated rows → reject. Supersedes the v0
  `pg_advisory_xact_lock(hashtext(...))` (32-bit key, collision-prone).

## 6. Structured summary — DECISION: dedicated `OtzarConversationSummary`

`summary_capsule_id`/`MemoryCapsule` is the **close-time learning capsule** (a
different concern) and lacks version lineage + source-turn-range + supersession. Add a
dedicated versioned model:
`{ summary_id, conversation_id, org_entity_id, subject_entity_id, version,
source_seq_from, source_seq_to, active_goal, active_topic, unresolved_questions[],
pending_action_refs[], completed_action_refs[], decisions[], corrections[],
superseded_facts[], preferences[], interpersonal_refs[], provider_model?, generated_at,
retention_class }`. One ACTIVE version per thread (`OtzarConversation.summary_version`
points at it); prior versions retained for lineage. Summary generation failure never
loses turns/actions (turns are the source of truth). Bounded; not a raw warehouse.

## 7. Relationship memory — `OtzarRelationshipMemory` (safe v1)

Lifecycle `CANDIDATE → CONFIRMED → ACTIVE → SUPERSEDED → REJECTED → EXPIRED → DELETED`.
`{ memory_id, org_entity_id, subject_entity_id, twin_entity_id?, category,
normalized_value, display_value, confidence, provenance, origin
(EXPLICIT|OBSERVED|INFERRED), source_conversation_id, source_turn_id, status,
superseded_by_id?, retention_class, expires_at?, created_at, updated_at }`.
Only EXPLICIT or CONFIRMED memories are authoritative; repeated OBSERVED sightings
create CANDIDATEs; LLM INFERRED alone is never authoritative. Ops: remember (explicit
→ CONFIRMED), candidate-create, confirm, reject, correct, supersede, forget, retrieve,
permission isolation. Never uses raw transcript rows as authoritative memory.

## 8. Organization-promotion lineage — `OtzarOrgPromotion`

Private → shared is **only** via a governed record, never a visibility flag.
`{ promotion_id, org_entity_id, source_conversation_id?, source_turn_id?,
source_memory_id?, promoting_actor_entity_id, authority_decision,
promoted_fact_ref, target_org_memory_id, permission_scope, approval_state, is_current,
superseded_by_id?, created_at, updated_at }`. Requires a governed trigger: explicit
user instruction, approved decision, trusted source, verified commitment, authorized
correction, or explicit policy rule. Tests: denial + private-user isolation.

## 9. General action state — extend `WorkLedgerEntry` (typed additive)

The 15-state machine (`DRAFTED, AWAITING_CONFIRMATION, APPROVED, REJECTED, SUPERSEDED,
EXECUTING, SUCCEEDED, FAILED, BLOCKED, EXPIRED, CANCELLED, COMPENSATION_REQUIRED,
COMPENSATING, COMPENSATED, COMPENSATION_FAILED`) is validated via an array (like
`LEDGER_STATUSES`). Add typed additive fields (not hidden in unvalidated JSON):
`provider_attempt_id, external_result_id, action_idempotency_key, original_action_id,
superseded_action_id, compensating_action_id, originating_turn_id, proposal_turn_id,
approval_turn_id, execution_lease_version, failure_class`. Reuse the existing CAS-claim
pattern for execution leasing. Prove existing status-string + details JSON is
insufficient before adding a companion model; prefer additive columns on
`WorkLedgerEntry`.

## 10. Retention / clear / delete semantics

- **Start new conversation** — new thread; old thread untouched.
- **Archive** — `status=ARCHIVED`, `archived_at` set; reopenable.
- **Reopen** — `ARCHIVED→ACTIVE`.
- **Clear visible transcript** — a **client-side view** action; does NOT delete
  durable turns (transcript is the record).
- **Delete-eligible private content** — content **redaction/tombstone**: `deleted_at`
  set, `content` nulled, the row kept for sequence/action/audit lineage.
- **Retention expiry** — `retention_expires_at` drives eligibility; a governed sweep
  redacts expired content.
- **Preserve** — action/audit proof and promoted org truth are never touched by a
  transcript clear/delete.
- **Forget relationship memory** — `OtzarRelationshipMemory.status=DELETED`.
- **Cancel action / expire draft** — WorkLedger state transitions.
`Clear` never maps to destructive deletion of every layer.

## 11. Coordinated activation staging

Each stage is independently complete (no code/schema partial state):
- **Stage 1 (this PR): thread lifecycle + corrected turns.** Correct the empty v0
  turn table + add the thread lifecycle/`turn_seq` columns. Ownership-checked,
  idempotent, atomic-sequence query layer + tests. Runtime wiring is a SEPARATE later
  PR (no runtime uses these tables until then), so activating Stage 1 cannot create a
  partial state.
- **Stage 2: structured summary + relationship memory + promotion lineage** (§6–§8) —
  new tables, no runtime dependency until their services ship.
- **Stage 3: action-state additive fields** (§9) on WorkLedgerEntry — additive
  columns; existing action code keeps working (reads only the new fields when present).
- **Startup manifest (§12) ships BEFORE any runtime code that depends on a stage.**

## 12. Generalized startup schema manifest (P6)

A read-only, fail-closed preflight run **before listen**, `current_schema()`-scoped,
no writes, no bypass. Verifies existence + column type + nullability + correctness-
critical uniqueness/constraints (NOT performance-only indexes) for: the 6
IntegrationCredential identity columns, `memory_capsules.voice_note_id`, thread
lifecycle fields, the turn table + required columns + the two unique constraints,
summary objects, relationship-memory objects, promotion lineage, and action-state
critical fields. Deterministic sanitized failure message on any gap.

---

## Implementation order (each: schema-first → tests → PR → CI → coordinated activate → wire → deploy → verify)

1. **Stage 1** — thread lifecycle + corrected turns (schema + corrective prod script +
   ownership/idempotent/atomic-seq query layer + tests). *(this PR)*
2. Startup manifest covering Stage 1 (+ existing identity cols / voice_note_id).
3. Stage 1 runtime wiring (conductSession turn persistence, request_id through routes).
4. Stage 2 — summary + relationship memory + promotion (schema, services, tests).
5. Stage 3 — action-state additive fields + compensation flows.
6. Retention/clear/delete services + CT UX (P5J/P5M), cross-device (P5F),
   model-resilience envelope (P5K), temporal completion (P5L).
7. Manifest extended to cover every stage's runtime-critical schema.
