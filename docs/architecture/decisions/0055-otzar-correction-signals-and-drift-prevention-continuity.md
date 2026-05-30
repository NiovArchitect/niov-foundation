# ADR-0055: Otzar Correction Signals and Drift-Prevention Continuity

## Status

Accepted 2026-05-27

Decider: Founder. Authorized at
`[OTZAR-WAVE-2C-ADR-0055-CORRECTION-CONVERSATION-LINKAGE-WRITE-AND-ACCEPT-AUTH]`.

This is the **Wave 2C contract ADR**. It is design-only: it locks the
endpoint contract, the one additive nullable schema link, and the
narrow Wave-2C-vs-Wave-3 boundary. It adds **no code, no endpoints,
and performs no schema migration in this phase** — implementation
lands under a separate EXECUTE-VERIFY authorization. Governed by, and
extends, ADR-0052 (build-order step 5–6: correction signals supporting
drift prevention) and the doctrine in
`docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`. Closes
ADR-0054's explicitly-deferred non-goal "conversation→correction
linkage."

## Context

Wave 1 (ADR-0051) gave Otzar a live, response-only chat transparency
surface. Wave 2A (ADR-0053) gave each employee a safe, self-scoped My
Twin role-scope profile and locked drift detection as a **Wave 3**
capability. Wave 2B (ADR-0054) added safe, metadata-only conversation
look-back and explicitly deferred `conversation→correction linkage`
as a non-goal — `corrections_count` was excluded "because corrections
are not linked to conversations."

Substrate facts verified on `main` @ `1ffa01d`
(`apps/api/src/routes/otzar-observation.routes.ts`,
`apps/api/src/services/otzar/observation.service.ts`,
`apps/api/src/services/feedback/feedback.service.ts`,
`apps/api/src/services/otzar/otzar.service.ts`,
`packages/database/prisma/schema.prisma`,
`packages/database/src/queries/audit.ts`):

- `POST /api/v1/otzar/correction` exists today; bearer + `write`; body
  `{ event_type?, description, target_capsule_id? }`. The body has
  **no `conversation_id` field**.
- `ObservationService.processCorrection` writes a `CapsuleType.CORRECTION`
  capsule to the caller's wallet with tags
  `["correction", "correction-of-<targetCapsuleId>"]` and
  `payload_summary = "${incorrect_description} → ${correct_behavior}"`.
- `feedback.service.ts` `propagateCorrection` snaps the correction
  capsule and (if named) the target capsule to
  `RELEVANCE_CORRECTION_BUMP = RELEVANCE_MAX = 1.0`; emits the
  existing `CORRECTION_PROPAGATED` audit literal (RAA 12.8 §5.2 chain
  / D-2D-D10-6); best-effort (failure logged, never 500s).
- `conductSession` Layer 1 reads active `CORRECTION` capsules **before**
  the role template (Section 11B); the LLM fixture
  `tests/fixtures/llm/unit-otzar-correction-layer-priority.json`
  pins this ordering.
- `getMyTwin` already returns a real `recent_correction_count` (a
  Prisma count of the caller's `CORRECTION` capsules — not fabricated).
- `MemoryCapsule` has `target_capsule_id String? @db.Uuid` (the
  corrected-target link) and indexes it. **There is no
  `conversation_id` column on `MemoryCapsule`** today; CORRECTION
  capsules carry no conversation link.
- Corrections are not surfaced in `ConversationDetailView` (ADR-0054
  §Decision 8 + §Non-goals). The Control Tower's `Corrections.tsx`
  page and `api.otzar.correction()` client already exist and submit
  corrections; they do not yet pass or surface `conversation_id`.
- ADR-0053 §5 (Drift-prevention foundations) explicitly locks the
  Wave-2C-vs-Wave-3 boundary: "Full drift detection (recurring
  `CORRECTION` → `IntelligencePattern` write-side, stale-context
  warnings, drift-signal contract, proactive suggestions) is a
  **Wave 3** capability."
- ADR-0054 §Acceptance + §Non-goals leaves `conversation→correction
  linkage` as the explicit Wave 2C gap.
- The `IntelligencePattern` model carries `evidence Json @default("[]")
  // [{conversation_id, date, excerpt}]` — an org-scoped pattern store
  **not** populated from `CORRECTION` capsules today; Wave 2C does
  **not** wire that path (Wave 3).

The honest consequence: Wave 2C closes the conversation→correction
linkage gap **with one nullable column and one new safe sub-resource**;
it does not cross into Wave 3 drift detection, IntelligencePattern
auto-write, manager visibility, employee scoring, or fabricated
"best practice learned" claims.

## Decision

Foundation will add a **safe, self-scoped, additive correction-signal
sub-resource on the conversation look-back surface**, backed by one
additive nullable schema link, surfacing only what is honestly
derivable. The locks:

1. **Scope of Wave 2C.** Wave 2C links correction submissions to
   conversation continuity at submit time, and exposes per-conversation
   correction-signal **counts and freshness** through a safe
   self-scoped sub-resource. Wave 2C does **not** implement:
   full drift detection; drift score; stale-context warnings;
   proactive drift suggestions; `IntelligencePattern` auto-write
   from corrections; org-wide correction pattern aggregation;
   manager dashboards; employee scoring; autonomous execution;
   transcript replay; raw message replay; listener execution; hives;
   MCP/connectors; Agent Playground; enterprise reporting; billing;
   full audit viewer.

2. **Additive schema decision.** Add nullable
   `conversation_id String? @db.Uuid` to `MemoryCapsule` plus the
   composite index `@@index([wallet_id, capsule_type, conversation_id])`.
   The column is **nullable and additive**; no backfill; no new model;
   no new enum; no new audit literal; no FK constraint to
   `OtzarConversation` (service code owns existence + self-scope
   checks per the Section 9 pattern). Pre-existing `CORRECTION`
   capsules remain valid with `conversation_id = null`. Schema lands
   in the EXECUTE phase, not this ADR.

3. **Extend `POST /api/v1/otzar/correction`.** Current body:
   `{ event_type?, description, target_capsule_id? }`. Wave 2C body:
   `{ event_type?, description, target_capsule_id?, conversation_id? }`.
   `conversation_id` is **optional**. When omitted, current behavior
   is unchanged (correction persists with `conversation_id = null`).
   When provided, the service validates that the conversation exists
   and that `OtzarConversation.entity_id` equals the authenticated
   caller; on success the resulting `CORRECTION` capsule stores
   `conversation_id`. Unknown conversation → `CONVERSATION_NOT_FOUND`
   (404). Cross-caller conversation → `NOT_CONVERSATION_OWNER` (403).
   Reuse existing `OtzarFailure`/`ObserveFailure` code conventions;
   **no new audit literal**.

4. **New safe read endpoint:**
   `GET /api/v1/otzar/conversations/:id/corrections` — bearer +
   `read` capability; **self-scoped**. Cross-caller →
   `NOT_CONVERSATION_OWNER` (403). Unknown id →
   `CONVERSATION_NOT_FOUND` (404). Session failures map to `SESSION_*`
   (401) / `OPERATION_NOT_PERMITTED` (403) per existing patterns. Reuse
   the existing `OtzarFailure` codes — **no new audit literal**.

5. **Safe response contract:**
   ```
   {
     ok: true,
     conversation_id: string,
     corrections_count: number,
     has_corrections: boolean,
     last_correction_at: string | null,   // ISO 8601, or null
     drift_prevention_note: string,
     continuity_note: string
   }
   ```
   Definitions:
   - `corrections_count` is a **real Prisma count** of `MemoryCapsule`
     rows where `wallet_id` belongs to the caller (resolved by the
     service from the validated session), `capsule_type = 'CORRECTION'`,
     `conversation_id = :id`, and `deleted_at IS NULL`.
   - `has_corrections = corrections_count > 0`.
   - `last_correction_at` is the ISO 8601 timestamp of the most-recent
     linked `CORRECTION` capsule's `created_at`, or `null` when
     `corrections_count = 0`.
   - `drift_prevention_note` is a fixed, honest, non-surveillance
     sentence (locked in §Decision 9 below).
   - `continuity_note` is a fixed, honest sentence describing that
     these are scoped correction signals, not transcript replay
     (locked in §Decision 9 below).

6. **Forbidden response fields (no-leak invariants).** The corrections
   sub-resource **must not** return: raw correction `payload_summary`;
   raw correction `payload_content`; correction `capsule_id` lists;
   `target_capsule_id`; target capsule content; transcripts; raw
   messages; raw prompts; hidden chain-of-thought; raw context;
   `storage_location`; `content_hash`; vectors; embeddings;
   permission-envelope internals; bridge IDs; capability flags; other
   users' data; cross-tenant data; drift score; employee score;
   best-practice learned/applied status; manager visibility fields;
   organization-wide aggregation.

7. **Submitted vs learned/applied — explicit semantic distinction.**
   A correction submitted by an employee is **not** the same as a
   verified best practice. Wave 2C surfaces only **submitted/available**
   correction signals (counts + last-seen timestamp). Wave 2C must
   **not** claim "best practice learned," "behavior permanently
   fixed," "drift prevented," or "AI fixed itself." The existing Layer
   1 prompt priority and `RELEVANCE_MAX` propagation are real, but
   must be described as **scoped correction priority** for the
   caller's own Twin within the caller's wallet — not proof of
   autonomous learning or organization-wide best practice.

8. **`ConversationDetailView` is unchanged.** Wave 2C does **not**
   modify the ADR-0054 `ConversationDetailView` shape:
   `transparency_available` stays `false`; `continuity_note` is
   unchanged; no `corrections_count` is added to the detail view.
   Correction signals live on the new `/corrections` sub-resource
   (the cleanest additive shape; keeps ADR-0054's contract
   backward-compatible and avoids retroactive fabrication for past
   conversations).

9. **Safe frontend language (locks Control Tower copy guidance).**
   Allowed: "Correction signals"; "Corrections linked to this
   conversation"; "Not enough correction history yet"; "This does not
   expose raw messages."; "Corrections help your Twin prioritize
   future context within scope."; "This is not an employee score.";
   "This is not a transcript." Forbidden: "drift score"; "employee
   score"; "manager monitoring"; "surveillance"; "full history";
   "message replay"; "best practice learned"; "AI fixed itself";
   "autonomous drift prevention"; "all corrections across the org."
   The `drift_prevention_note` and `continuity_note` Foundation
   returns must be drawn from the allowed language and reviewed at
   EXECUTE time against §Decision 6.

10. **Access and scope.** Both the extended `POST /otzar/correction`
    and the new `GET /otzar/conversations/:id/corrections` are
    self-scoped: a caller may only link or read corrections for a
    conversation where `OtzarConversation.entity_id` equals the
    authenticated entity. The Wave 2C contract introduces no
    cross-caller, manager, or organization-wide read path.

11. **Migration discipline.** The `MemoryCapsule.conversation_id`
    schema add must use the repo-approved path (`npm run db:push:test`
    / `scripts/prisma-db-push-test.sh`) per ADR-0025 — **never bare
    `prisma db push`**, **never** `--accept-data-loss`. If the local
    test DB requires reconciliation (ADR-0035 §38 cross-language
    ownership drift / ADR-0047 PR.3 precedent), use
    `scripts/local-test-db-refresh.sh` only.

12. **Cross-language boundary.** Wave 2C does **not** require any
    Elixir/BEAM change. Per ADR-0033 cross-language data-ownership
    discipline, Prisma owns the new `conversation_id` column;
    `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex`
    does **not** need to add the field to the Ecto schema (mirroring
    the ADR-0033 Q-G3-θ / G3.8 precedent for `embedding`). A
    docstring annotation at EXECUTE time is optional, not required.

13. **Testing requirements (for the EXECUTE phase).**
    - `processCorrection` persists `conversation_id` when provided
      and valid.
    - `processCorrection` preserves backward compatibility when
      `conversation_id` is omitted (`recent_correction_count` and
      Layer 1 priority remain unchanged).
    - `processCorrection` returns `CONVERSATION_NOT_FOUND` for
      unknown `conversation_id`.
    - `processCorrection` returns `NOT_CONVERSATION_OWNER` for
      cross-caller `conversation_id`.
    - `GET /otzar/conversations/:id/corrections` returns the real
      count, `has_corrections`, and ISO `last_correction_at` for a
      caller's own linked conversation.
    - `GET …/corrections` returns the safe zero state
      (`corrections_count: 0`, `has_corrections: false`,
      `last_correction_at: null`).
    - `GET …/corrections` cross-caller denied
      (`NOT_CONVERSATION_OWNER` / 403).
    - `GET …/corrections` unknown conversation denied
      (`CONVERSATION_NOT_FOUND` / 404).
    - Wire-level no-leak test asserts none of the §Decision 6
      forbidden fields appear in the JSON.
    - `ConversationDetailView` regression: ADR-0054 detail tests
      stay green; the shape is unchanged.
    - `getMyTwin` regression: `recent_correction_count` semantics
      unchanged.
    - Layer 1 LLM-fixture priority test stays green.
    - RULE 16 no-console anchor stays green; the 12-error typecheck
      baseline is preserved.
    - Tests use the repo-approved tier configs
      (`vitest.{unit,integration}.config.ts`) — **never bare
      `vitest`** (ADR-0035 §37).

14. **Implementation order (locked).** ADR/docs (this) → schema
    `MemoryCapsule.conversation_id` + composite index → local test
    DB reconciliation if needed → Prisma client regenerate → extend
    `POST /otzar/correction` (service + route) → pure mapper
    `projectConversationCorrections` → `getConversationCorrections`
    service method → `GET /otzar/conversations/:id/corrections` route
    → unit + integration + no-leak tests → **merge Foundation first**
    → only then Control Tower planning/implementation. ADR-0054's
    `ConversationDetailView` and the `/conversations/:id` endpoint
    are not touched.

## Consequences

### Easier

- Closes ADR-0054's explicitly-deferred `conversation→correction
  linkage` non-goal with the minimum honest substrate.
- Employees and their Twins gain a real per-conversation correction
  count and last-seen freshness — calm, scoped continuity that
  matches what is actually persisted.
- The submit path becomes honest end-to-end: corrections can be
  linked to the conversation they were raised in (improving Layer 1
  priority precision over time without changing its semantics).
- Control Tower's existing `Corrections.tsx` and the conversation
  detail drawer can later render a small, safe correction-signals
  section without surveillance framing.

### Harder

- One additive nullable schema column on `MemoryCapsule` (the first
  correction-side schema change since the model landed) — must
  follow ADR-0025 push discipline.
- The boundary between Wave 2C and Wave 3 must be defended in code
  review: nothing in Wave 2C may write to `IntelligencePattern`
  from `CORRECTION` capsules, infer a drift score, or expose
  cross-employee aggregation.

  **Wave 3 drift-signal contract landed at ADR-0058** (2026-05-30):
  per-conversation `GET /api/v1/otzar/conversations/:id/drift-signals`
  consumes the Wave 2C `MemoryCapsule.conversation_id` linkage to
  surface closed-vocabulary coaching labels. Wave 3 honors the same
  self-scoped + no-content-leak + no-employee-scoring + no-manager-
  visibility boundary Wave 2C established. `IntelligencePattern`
  auto-write + drift-score persistence + cross-employee aggregation
  remain explicit non-goals through Wave 3.
- The safe frontend language (§Decision 9) constrains UX phrasing —
  copy must be reviewed against the allowed/forbidden lists at
  Control Tower implementation time.
- Pre-existing `CORRECTION` capsules remain `conversation_id = null`
  (no backfill); historic conversations resolve to `corrections_count:
  0` for those linkages even when a correction was submitted in
  the same session through the old non-linked path. Honest absence,
  not fabrication.

## Alternatives Considered

### Append `corrections_count` to `ConversationDetailView`

Rejected as the primary path. ADR-0054 §Decision 8 + §Non-goals
explicitly excluded `corrections_count` from `ConversationDetailView`,
and adding it would mean amending ADR-0054's locked surface. A
sibling sub-resource is the cleaner additive shape (RULE 1) and keeps
ADR-0054's contract backward-compatible.

### Tag-only linkage (extend `CORRECTION` capsule `topic_tags` with `for-conversation-<conversation_id>`)

Rejected. Tag-string parsing is the same fragility class as the
ADR-0054 `storage_location` string-parse (D-OTZ-3) and would not
support a composite index for the count query. The nullable
`conversation_id` column mirrors the established
`target_capsule_id` precedent (`MemoryCapsule:313`) and is
queryable cleanly.

### Surface a `signal_summary` / "best practice learned" text field

Rejected. Wave 2C cannot persistently track which corrections have
been "learned" beyond Layer 1 prompt-priority effects. A free-text
signal-summary surface would either fabricate semantics or quietly
leak raw correction `payload_summary`. The submitted-vs-learned
distinction (§Decision 7) is the honest answer.

### Build write-side drift detection (recurring CORRECTION → IntelligencePattern) now

Rejected. ADR-0053 §5 locks this as a **Wave 3** capability. Wave 2C
provides the *substrate* (per-conversation correction linkage) that
later enables it, but does not implement it.

### Expose org-wide correction patterns to managers

Rejected. Manager visibility into employee correction patterns is
surveillance framing forbidden by ADR-0052 §"Otzar does not watch
employees to judge them" and ADR-0053 §"no employee surveillance,
no productivity policing, no hidden evaluation." Manager-facing
governance summaries belong in Control Tower's
governance/executive-clarity layer (ADR-0052 §10) and only over
permissioned, aggregated, non-individualized signals — a separate
future ADR.

## Acceptance Criteria

The future Wave 2C implementation must: remain additive /
backward-compatible (`/conversation/message`, `/conversation/close`,
`/conversations`, `/conversations/:id`, `/my-twin`, `/correction`
without `conversation_id` all unchanged); be self-scoped; surface
only the §Decision 5 safe fields on the new sub-resource; never
expose any §Decision 6 forbidden field; honor the §Decision 7
submitted-vs-learned distinction; reuse the existing `OtzarFailure`
codes (no new audit literal); apply the schema add only via the
ADR-0025 path; include the §Decision 13 tests proving the no-leak,
self-scope, and backward-compatibility invariants.

## Patent-Implementation Evidence

Wave 2C is consistent with the COSMP and DMW patent claims as
implemented in Foundation:

- Correction signals are **scoped, wallet-bound continuity signals**
  attached to the caller's own conversation context — supporting
  COSMP-style governed context continuity (US 12,517,919) without
  cross-tenant data fusion.
- The linkage runs through the caller's own `MemoryCapsule` row in
  the caller's own wallet (DMW; US 12,164,537), preserving
  entity-scoped memory wallet behavior (US 12,399,904).
- The submitted-vs-learned distinction (§Decision 7) keeps
  patent-implementation claims accurate: prompt-priority effects are
  real and audited; "best practice learned" claims are not made.
- No raw transcript persistence and no cross-tenant aggregation
  preserve the sovereignty and audit-trail guarantees relied on by
  the patent-implementation record.

## References

- Doctrine: `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`
  (§5 watching-is-not-surveillance; §6 drift prevention; §7 governed
  best-practice learning; §17 build order; §19 non-goals)
- Code:
  - `apps/api/src/routes/otzar-observation.routes.ts` (POST
    `/otzar/correction`)
  - `apps/api/src/services/otzar/observation.service.ts`
    (`processCorrection`)
  - `apps/api/src/services/feedback/feedback.service.ts`
    (`propagateCorrection`, `RELEVANCE_CORRECTION_BUMP`)
  - `apps/api/src/services/otzar/otzar.service.ts` (Layer 1 priority;
    `getMyTwin` `recent_correction_count`)
  - `apps/api/src/services/otzar/conversation-detail.ts` (ADR-0054
    mapper — unchanged in Wave 2C)
  - `packages/database/src/queries/audit.ts` (existing
    `CORRECTION_PROPAGATED` literal — unchanged)
- Schema: `packages/database/prisma/schema.prisma` (`MemoryCapsule`;
  `OtzarConversation`; `IntelligencePattern` — read-only reference,
  not written from Wave 2C)
- Tests: `tests/integration/observation-routes.test.ts`,
  `tests/unit/observation.test.ts`, `tests/unit/feedback.test.ts`,
  `tests/unit/otzar-conversation-detail.test.ts` (regression baseline),
  `tests/fixtures/llm/unit-otzar-correction-layer-priority.json`
  (Layer 1 priority fixture — must remain green)
- ADRs: ADR-0054 (load-bearing — closes its deferred
  `conversation→correction linkage` non-goal; the
  `ConversationDetailView` contract is unchanged), ADR-0053
  (load-bearing — Wave 2C correction linkage is the per-conversation
  half of ADR-0053's "drift-prevention foundations"; full drift
  detection remains Wave 3), ADR-0052 (DGI doctrine + build order;
  watching-is-not-surveillance boundary), ADR-0051 (transparency is
  live response-only — Wave 2C does not create retrospective
  transparency history), ADR-0025 (schema-push-target discipline for
  the `MemoryCapsule.conversation_id` migration), ADR-0002
  (append-only audit chain — `CORRECTION_PROPAGATED` literal is
  existing and unchanged). Operational references: ADR-0033
  (cross-language data ownership — Prisma owns the new column);
  ADR-0035 §37 (`vitest` tier-config discipline); ADR-0035 §38 +
  ADR-0047 PR.3 (local test DB reconciliation if needed); ADR-0042
  (CORRECTION capsule lineage).
- Rules: RULE 0 (sovereignty), RULE 1 (build forward only / additive),
  RULE 4 (audit before response — `CORRECTION_PROPAGATED` already
  emitted; reads use existing patterns), RULE 9 (modular connections),
  RULE 13 (surface drifts inline), RULE 20 (rule/ADR authority),
  RULE 21 (cross-repo wire-format / frontend-contract implication —
  the `/corrections` sub-resource is consumed by
  `otzar-control-tower`)
- Patents: US 12,517,919 (COSMP); US 12,164,537 (DMW); US 12,399,904
- Authorization:
  `[OTZAR-WAVE-2C-ADR-0055-CORRECTION-CONVERSATION-LINKAGE-WRITE-AND-ACCEPT-AUTH]`
  (Founder, 2026-05-27)

Bidirectional citations (cited from):

- `docs/architecture/README.md` §Architectural Decision Records
- `CLAUDE.md` §5 (ADR quick-reference jump table)
- `docs/otzar/README.md` (Otzar docs index)
- ADR-0054 (Otzar Conversation Look-back and Safe Continuity
  Surfacing) — Wave 2C closes ADR-0054's explicitly-deferred
  `conversation→correction linkage` non-goal without modifying
  `ConversationDetailView`.
- ADR-0053 (Otzar Employee AI Twin Role-Scope Profile and
  Drift-Prevention Foundations) — Wave 2C is the per-conversation
  half of ADR-0053's "drift-prevention foundations"; full drift
  detection remains the Wave 3 boundary ADR-0053 §5 locked.
- ADR-0052 (Otzar Domain General Intelligence and Governed
  Synchronicity) — Wave 2C honors §5 (watching-is-not-surveillance),
  §6 (drift prevention is first-class but bounded), and §7 (governed
  best-practice learning without overclaiming).
