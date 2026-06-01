# ADR-0054: Otzar Conversation Look-back and Safe Continuity Surfacing

## Status

Accepted 2026-05-27

Decider: Founder. Authorized at
`[OTZAR-WAVE-2B-ADR-0054-CONVERSATION-LOOKBACK-WRITE-AND-ACCEPT-AUTH]`.

This is the **Wave 2B contract ADR**. It is design-only: it locks the
endpoint contract, the one additive schema link, and the
derivable-vs-deferred boundary. It adds **no code, no endpoints, and
performs no schema migration in this phase** — implementation lands
under a separate EXECUTE-VERIFY authorization. Governed by, and
extends, ADR-0052 (build-order step 4 "Conversations/look-back") and
the doctrine in `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`.

## Context

Wave 1 (ADR-0051) gave Otzar a live, response-only chat transparency
surface. Wave 2A (ADR-0053) gave each employee a safe, self-scoped My
Twin role-scope profile. Conversations remain **metadata-only**, and
the Enterprise Production Readiness QLOCK recommended Conversation
Look-back as the next product wave.

Substrate facts verified on `main` @ `3bb773d`
(`apps/api/src/services/otzar/otzar.service.ts`,
`packages/database/prisma/schema.prisma`):

- `OtzarConversation` stores only metadata: `conversation_id`,
  `entity_id`, `twin_id`, `source_type`, `participants[]`,
  `message_count`, `status`, `started_at`, `closed_at`.
- `GET /api/v1/otzar/conversations` returns a metadata-only,
  self-scoped, paginated list. There is **no**
  `GET /api/v1/otzar/conversations/:id` route.
- `/otzar/conversation/close` writes one `CONVERSATION_LEARNING`
  capsule to the **employee** wallet (`payload_summary` = the close
  summary; `topic_tags` = extracted topics;
  `storage_location` = `niov://otzar/conv/{conversation_id}/{capsule_id}`),
  flips `status → CLOSED` + `closed_at`, and emits a
  `CONVERSATION_CLOSED` audit carrying `details.capsule_id`.
- **`summary_capsule_id` is stored nowhere.** The conversation↔summary
  link exists today only as the `storage_location` string + the
  `CONVERSATION_CLOSED` audit detail (fragile string-parsing — the
  prior-QLOCK D-OTZ-3 drift). ADR-0053 §4 **locked
  `summary_capsule_id` as the preferred future additive link**.
- **Corrections are not linked to conversations** (`CORRECTION`
  capsules reference a target capsule, not a `conversation_id`).
- **transparency / context_provenance are response-only** (computed in
  `conductSession`, returned, discarded) — never persisted per
  conversation.
- **Raw messages / transcripts are not persisted** (`conversation_history`
  is ephemeral client input).

The honest consequence: a Wave 2B look-back detail is safely
achievable **only for metadata + the close summary + topics**. Richer
signals (per-conversation transparency, access-limited, corrections
count, continuity) were never stored and must not be fabricated.

## Decision

Foundation will add a **safe, self-scoped, additive conversation
look-back detail endpoint**, backed by one additive nullable schema
link, surfacing only what is honestly derivable. The locks:

1. **New endpoint:** `GET /api/v1/otzar/conversations/:id` — bearer +
   `read` capability; **self-scoped** (only the caller's own
   conversations).

2. **Minimal additive response contract:**
   ```
   {
     ok: true,
     conversation: {
       conversation_id: string,
       twin_id: string,
       source_type: string,
       status: "ACTIVE" | "CLOSED",
       started_at: string,            // ISO
       closed_at: string | null,
       message_count: number,
       summary: string | null,        // close-summary text; null if not closed/linked
       topics: string[],              // [] if none/unavailable
       summary_available: boolean,
       summary_capsule_id: string | null,
       detail_availability: "SUMMARY_AVAILABLE" | "NO_SUMMARY_YET" | "ACTIVE_NOT_CLOSED",
       transparency_available: false, // always false in Wave 2B (see Decision 8)
       continuity_note: string        // honest note (see Decision 8)
     }
   }
   ```

3. **`detail_availability` enum:** `SUMMARY_AVAILABLE` (closed + linked
   summary resolved), `NO_SUMMARY_YET` (closed but no
   `summary_capsule_id` link / summary not resolvable),
   `ACTIVE_NOT_CLOSED` (conversation still ACTIVE — no summary yet).

4. **Summary behavior:** `summary` is derived **only** from the linked
   `CONVERSATION_LEARNING` capsule's `payload_summary`; `topics` only
   from that capsule's `topic_tags`. `summary_capsule_id` is nullable
   and additive. Pre-existing conversations may have
   `summary_capsule_id = null`; **no backfill is required** (they
   resolve to `NO_SUMMARY_YET`).

5. **Additive schema decision:** add nullable
   `summary_capsule_id String? @db.Uuid` to `OtzarConversation`. This
   implements the ADR-0053-preferred explicit summary link and
   replaces fragile `storage_location` string parsing. (Schema lands
   in the EXECUTE phase, not this ADR.)

6. **`closeConversation` behavior:** when `/otzar/conversation/close`
   creates the `CONVERSATION_LEARNING` capsule, it sets
   `OtzarConversation.summary_capsule_id` to that capsule's id (same
   transaction-adjacent write; additive).

7. **Safe boundary — Wave 2B must NOT persist or expose:** raw
   transcripts; raw messages; raw prompts; hidden chain-of-thought;
   raw context content; vectors/embeddings; permission-envelope
   internals; bridge IDs; capability flags; cross-tenant data; fake
   retrospective transparency; fake corrections count; fake
   per-conversation continuity. `summary` is a close summary, **not a
   transcript** — there are **no raw transcripts** in Wave 2B.

8. **Honest deferred fields:** `transparency_available` is **always
   false** in Wave 2B because ADR-0051 transparency /
   `context_provenance` is live **response-only** and not persisted.
   `continuity_note` must state that per-conversation correction /
   transparency signals are not retained in Wave 2B. `corrections_count`
   is **not** included (corrections are not linked to conversations).
   `context_provenance` is **not** included retroactively.
   `access_limited` is **not** included retroactively (not persisted).
   **Do not fabricate** any of these for past conversations.

9. **Access and scope:** the detail endpoint is self-scoped — a caller
   may retrieve only conversations where `OtzarConversation.entity_id`
   equals the authenticated entity. Cross-caller access returns
   `NOT_CONVERSATION_OWNER` (403) per existing close-route style; an
   unknown id returns `CONVERSATION_NOT_FOUND` (404); session failures
   map to `SESSION_*` (401) / `OPERATION_NOT_PERMITTED` (403). Reuse
   the existing `OtzarFailure` codes — no new audit literal.

10. **Migration discipline:** the `summary_capsule_id` schema change
    must use the repo-approved path (`npm run db:push:test` /
    `scripts/prisma-db-push-test.sh`) per ADR-0025 — **never bare
    `prisma db push`**.

11. **Testing requirements (for the EXECUTE phase):** `closeConversation`
    sets `summary_capsule_id`; detail returns metadata + summary +
    topics for a closed+linked conversation (`SUMMARY_AVAILABLE`);
    `ACTIVE_NOT_CLOSED` returns `summary: null`; `NO_SUMMARY_YET`
    returns `summary: null` gracefully; self-scope enforced;
    cross-caller denied; list endpoint remains backward-compatible;
    wire-level no-leak test (no transcript / raw prompt / raw context /
    vector / embedding / `storage_location` / `content_hash` /
    permission internals / bridge IDs / capability flags). Tests use
    the repo-approved tier configs (`vitest.{unit,integration}.config.ts`),
    **not bare `vitest`** (ADR-0035 §37).

12. **Implementation order:** ADR/docs (this) → schema
    `summary_capsule_id` → `closeConversation` sets the link → pure
    mapper → `getConversationDetail` service → `GET /otzar/conversations/:id`
    route → unit + integration tests → **merge Foundation first** →
    only then the Control Tower consumer.

13. **Control Tower (later, after Foundation merge):** a conversation
    detail UI may show metadata, summary, topics, and
    `detail_availability`, with an honest note that transcripts /
    per-conversation transparency / corrections are not retained in
    Wave 2B. It must **not** show raw transcripts or fake history.

14. **Explicit non-goals:** raw transcript persistence/UI; listener
    execution; MCP/connectors; hives; Agent Playground; autonomous
    execution; enterprise reporting; full audit viewer;
    dashboards-without-events; billing; per-conversation transparency
    persistence; conversation→correction linkage; retroactive
    fabrication of transparency/corrections for past conversations.

## Consequences

### Easier

- Employees gain calm, governed look-back (what a past conversation
  was about, when, and its safe close summary) without transcripts.
- The `summary_capsule_id` link makes the conversation↔summary
  relationship queryable, retiring the fragile `storage_location`
  string-parse (D-OTZ-3).
- The contract is additive and backward-compatible (the list endpoint
  is unchanged); honest nulls + `detail_availability` keep it from
  overclaiming.

### Harder

- One additive nullable schema column is required (the first
  Otzar-conversation schema change since the model landed) — must
  follow ADR-0025 push discipline.
- Per-conversation transparency, corrections-count, and continuity are
  not available and are surfaced as honest absence — a UX limitation
  Wave 2B deliberately accepts rather than fabricate.
- Pre-existing conversations resolve to `NO_SUMMARY_YET` (no backfill).

## Alternatives Considered

### Derive the summary link from `storage_location` (no schema change)

Rejected as the primary path: string-LIKE matching on
`storage_location` is the fragile fallback D-OTZ-3 flagged, and
ADR-0053 §4 already locked `summary_capsule_id` as preferred. (It may
serve as a read-only fallback for pre-existing rows, but new
conversations use the column.)

### Persist transparency / context_provenance per conversation now

Rejected: that is a separate storage + privacy decision (embeddings
and context content are PII-adjacent per ADR-0043 §Q-G3-ζ). Wave 2B
surfaces `transparency_available: false` honestly instead.

### Surface a corrections count by linking corrections to conversations

Rejected: corrections are not linked to conversations today; adding
that link is a separate Wave 2C/3 decision. Wave 2B omits it rather
than fabricate.

### Expose raw messages / transcript

Rejected: no transcripts are persisted, and transcript
ownership/retention/scope is an undecided governance question. **No
raw transcripts** in Wave 2B.

## Acceptance Criteria

The future Wave 2B implementation must: remain additive /
backward-compatible (list endpoint unchanged); be self-scoped; surface
only metadata + close summary + topics; return honest nulls +
`detail_availability` for unavailable detail; never expose transcripts
/ raw prompts / raw context / vectors / permission internals / bridge
IDs / capability flags / cross-tenant data; set `summary_capsule_id`
at close; and include tests proving the no-leak and self-scope
invariants.

## References

- Doctrine: `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`
  (§17 build order step 4; §5 watching-is-not-surveillance; §19
  non-goals)
- Code: `apps/api/src/services/otzar/otzar.service.ts`
  (`closeConversation`, `listConversations`, `ConversationListItem`),
  `apps/api/src/routes/otzar.routes.ts`
- Schema: `packages/database/prisma/schema.prisma` (`OtzarConversation`,
  `MemoryCapsule` CONVERSATION_LEARNING)
- ADRs: ADR-0053 (load-bearing — the locked `summary_capsule_id`
  decision + role-scope precedent), ADR-0051 (transparency is live
  response-only — why it is not retroactively available), ADR-0052
  (DGI doctrine + build-order step 4), ADR-0002 (append-only audit
  chain — `CONVERSATION_CLOSED` already records the capsule link).
  Operational references (cross-cited at implementation): ADR-0042
  (CONVERSATION_LEARNING capsule), ADR-0025 (schema-push-target
  discipline for the `summary_capsule_id` migration).
- Rules: RULE 0 (sovereignty), RULE 1 (build forward only / additive),
  RULE 4 (audit before response), RULE 9 (modular connections), RULE 13
  (surface drifts inline), RULE 20 (rule/ADR authority), RULE 21
  (cross-repo wire-format / frontend-contract implication — the
  detail contract is consumed by `otzar-control-tower`)
- Authorization:
  `[OTZAR-WAVE-2B-ADR-0054-CONVERSATION-LOOKBACK-WRITE-AND-ACCEPT-AUTH]`
  (Founder, 2026-05-27)

Bidirectional citations (cited from):

- `docs/architecture/README.md` §Architectural Decision Records
- `CLAUDE.md` §5 (ADR quick-reference jump table)
- `docs/otzar/README.md` (Otzar docs index)
- ADR-0055 (Otzar Correction Signals and Drift-Prevention
  Continuity) — Wave 2C closes this ADR's explicitly-deferred
  `conversation→correction linkage` non-goal without modifying the
  Wave 2B `ConversationDetailView`; correction signals live on a
  sibling `/conversations/:id/corrections` sub-resource.

- **Cited by ADR-0078** (Conversation Substrate — Source-of-Truth Transcripts + `conversation_context_signals[]` Safe-Projection Layer for Agent Playground; design-only; Accepted 2026-05-31) — ADR-0078 inherits this ADR's safe-projection / closed-vocab / no-surveillance / self-scoped substrate discipline verbatim; ADR-0078 §3.3 `signal_source_type` includes a value reflecting this ADR's source role. Implementation gated on future ADR-0079 Transcript Substrate Policy. Bidirectional back-citation per RULE 14 + RULE 20.
