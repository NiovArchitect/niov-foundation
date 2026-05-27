# ADR-0051: Otzar Chat Transparency and COE-Governed Retrieval Surfacing

## Status

Accepted 2026-05-26

Decider: Founder. Authorized at `[OTZAR-WAVE-1-ADR-0051-WRITE-AND-ACCEPT-AUTH]`.

This is the Wave 1 contract ADR for the first real Otzar enterprise
experience. It governs a backend response-contract change only; the
implementing code lands under a separate EXECUTE-VERIFY authorization.

## Context

Otzar chat runs through `OtzarService.conductSession`
(`apps/api/src/services/otzar/otzar.service.ts`). conductSession
assembles an 8-layer prompt and, for layers 4 and 5, calls the
governed `COE.assembleContext` path (`apps/api/src/services/coe/
coe.service.ts`) — the LIVE working-set constructor canonicalized by
ADR-0048, where the Foundation (not the LLM) decides what memory is
in scope, under permission, clearance, and conditions.

`COE.assembleContext` already returns rich, governed metadata in its
`AssembleContextSuccess` shape: `capsules_loaded`,
`capsules_skipped_low_relevance`, `capsules_skipped_budget`,
`capsules_denied_permission`, `tokens_consumed`, and
`context: ContextItem[]` (each `{capsule_id, capsule_type,
topic_tags, content}`). conductSession consumes the context items to
build the prompt but **discards** this metadata — it returns only a
scalar `context_used` count plus `tokens_consumed`, `response`, and
`conversation_id`.

The employee therefore cannot see *what* governed context informed a
reply, nor that governance (permission denials, low-relevance and
budget skips) is actively working. Otzar reads as a black box rather
than as governed enterprise intelligence.

### Problem

Make Otzar chat *visibly governed* — surface what context was used —
without (a) bypassing the canonical `COE.assembleContext` path, (b)
adding a parallel similarity-retrieval path (deferred by ADR-0043
§Q-G3.6-ε pending an ADR-0022 amendment), (c) exposing raw prompts /
chain-of-thought / raw memory content / vectors / permission
internals / cross-tenant or unpermitted-teammate data, or (d)
restructuring closed Otzar code in violation of RULE 1.

## Decision

Foundation will surface, additively, the governed context metadata
that `COE.assembleContext` **already produces**.

1. **Surface, do not rebuild.** Wave 1 projects the existing `coe`
   result (and existing layer counts) into safe, product-facing
   transparency. No new retrieval engine is added.
2. **No similarity path, no COE bypass.** `similarity.service` is
   NOT wired into `conductSession`. Wiring it would touch
   retrieval-scope and scoring and requires a separate
   Founder-authorized ADR-0022 amendment (ADR-0043 §Q-G3.6-ε).
3. **Additive contract only.** `ConductSessionSuccess` gains two
   OPTIONAL fields — `transparency` and `context_provenance`.
   `response`, `context_used`, `tokens_consumed`, and
   `conversation_id` are unchanged (backward-compatible). The
   `context_used` computation is preserved verbatim.
4. **conductSession change is purely additive.** Capture the
   already-computed `coe` metadata and existing layer counts and
   map them into the new fields. No change to scoring (ADR-0022),
   truncation, layer logic, or the COE call itself.
5. **No new audit literal.** Transparency is a read-only projection
   of activity COE already audited (`readService` writes
   `CAPSULE_CONTENT_READ` inside `assembleContext`; conductSession
   writes `CONVERSATION_STARTED`). RULE 4 is satisfied by the
   existing audit path; no ADR-0002 amendment.
6. **Ingestion stays COSMP-first.** Enterprise context ingestion
   uses the existing `POST /cosmp/capsule` write path (governed by
   ADR-0021 CapsuleType and ADR-0042 mutation discrimination). No
   `/otzar/context/ingest` route and no new CapsuleType/source enum
   are introduced in Wave 1; a `source_type` taxonomy, if needed, is
   deferred to a future ADR aligned with ADR-0021/ADR-0042.
7. **Foundation-first.** The Foundation response contract lands and
   verifies first; `otzar-control-tower` consumes it second.

## Non-Goals

No MCP sidecar. No transcript persistence. No raw audio. No connector
execution. No verification sidecar. No desktop. No hives/team
collaboration. No Agent Playground. No autonomous workflow execution.
No billing/seat model. No `similarity.service` chat wiring. No
ADR-0022 scoring amendment in this ADR. No extension of
`COE.ContextItem` display metadata in Wave 1 (marked future).

## Safe Response Contract

Unchanged on `ConductSessionSuccess`: `ok`, `response`,
`context_used` (number), `tokens_consumed` (number),
`conversation_id`.

New OPTIONAL, additive fields:

```
transparency?: {
  context_items_used: number;          // mirrors context_used
  items_skipped_low_relevance: number; // = coe.capsules_skipped_low_relevance
  items_skipped_budget: number;        // = coe.capsules_skipped_budget
  access_limited: boolean;             // = coe.capsules_denied_permission > 0
                                       //   (coarse boolean ONLY; the raw denied
                                       //    count is NOT serialized — see below)
  retrieval_status: "USED" | "NO_MATCHES" | "DEGRADED" | "SKIPPED";
  retrieval_source: "COE_ASSEMBLE_CONTEXT";
  retrieval_reason: string;            // friendly; no internals
  memory_updated: boolean;             // false in Wave 1 (writes occur at close)
  tool_calls: [];                      // empty in Wave 1
  approval_required: boolean;          // false in Wave 1 (no escalation in chat path)
  verification_status: "NOT_ACTIVE";
}

context_provenance?: Array<{
  context_id: string;        // opaque internal ref (= caller-permitted capsule_id);
                             //   NOT displayed prominently in UI (decision 10)
  title: string | null;      // friendly, derived from topic_tags[0] else null
  source_type: string;       // friendly label mapped from capsule_type (NOT raw enum)
  scope: "PERSONAL" | "ENTERPRISE" | "UNKNOWN";  // "UNKNOWN" in Wave 1 (decision 9)
  content_available: boolean;// true (item was loaded under permission)
  reason: string;            // e.g. "Relevant to your message"
  tokens_used?: number;      // omitted in Wave 1 (only aggregate is known)
  created_at?: string;       // omitted in Wave 1 (not on ContextItem)
}>
```

Contract rules:

- `access_limited` is a coarse boolean. The raw
  `capsules_denied_permission` integer is NOT serialized. The
  product surface should phrase it as "Some context was excluded by
  enterprise access rules" — never a raw denied count, never any
  identifier of excluded data.
- `items_skipped_low_relevance` / `items_skipped_budget` are
  relevance/budget counts (not permission-sensitive) and may be
  shown as plain numbers.
- `context_provenance` is built ONLY from `coe.context[]` — items
  the caller was already permitted to load. L1/L3 layers may be
  counted into `context_items_used` but are not itemized in Wave 1.
- `context_id` is an opaque internal reference; the frontend must
  not display it prominently and must avoid substrate jargon
  ("context item" / "knowledge item", never "capsule" / "vector").
- `retrieval_status` mapping: `coe.ok && context.length > 0` →
  `USED`; `coe.ok && context.length === 0` → `NO_MATCHES`; `!coe.ok`
  (chat still proceeds) → `DEGRADED`; zero/empty budget or
  no-candidate path → `SKIPPED`.

## Security / Privacy Constraints

Never serialized: raw prompts; hidden chain-of-thought; raw
`ContextItem.content`; raw vectors/embeddings; per-item
relevance/score internals; permission-envelope internals;
`capsules_denied_permission` raw count; bridge IDs; capability
flags; cross-tenant data; unpermitted-teammate data; raw
`capsule_type` enum in customer-facing copy. Provenance derives only
from already-permitted COE context items, so no new disclosure
surface is created.

## Audit Requirements

No new audit literal in Wave 1. Transparency is a projection of
already-governed, already-audited COE activity; the existing
`CAPSULE_CONTENT_READ` (COE/readService) and `CONVERSATION_STARTED`
(conductSession) events remain the audit path (RULE 4). Any future
ingestion/source-type change must follow ADR-0021/ADR-0042 and the
audit-before-response discipline.

## Verification Requirements

Foundation: `typecheck`, `lint`, `build`; targeted unit tests for
the transparency mapper (status mapping, forbidden-field absence,
backward-compat when fields omitted); a targeted route/service
integration test for `/otzar/conversation/message`. Run only via
`--config vitest.unit.config.ts` / `npm run test:unit` /
`npm run test:integration` — never bare `vitest run` (ADR-0035 §37
production-Supabase trap). Unit-tier containerized Postgres
(Docker/Colima) or Supabase test secrets are gated to the separate
EXECUTE-VERIFY authorization. Frontend (`otzar-control-tower`):
`typecheck`, `lint`, `test`, `build` in the consuming phase.

## Rollout Sequence

1. Accept ADR-0051 (this commit).
2. Foundation implements the additive transparency contract +
   tests (`[OTZAR-WAVE-1-FOUNDATION-TRANSPARENCY-EXECUTE-VERIFY-AUTH]`).
3. Foundation verifies and lands first.
4. `otzar-control-tower` consumes the contract with a
   `TransparencyPanel`
   (`[OTZAR-WAVE-1-CONTROL-TOWER-TRANSPARENCY-EXECUTE-VERIFY-AUTH]`).
5. Frontend verifies and lands second.
6. Later waves: MCP connectors, transcripts, verification sidecar,
   desktop, hives, Agent Playground, autonomous execution, billing.

## Consequences

### Easier

- Employees see the governed context behind a reply; governance
  (skips, access limits) becomes visible — Otzar reads as governed
  enterprise intelligence.
- Zero new retrieval, scoring, or audit surface; no new attack
  surface; fully backward-compatible response contract.
- No collision with ADR-0048 (COE remains the single retrieval
  path), ADR-0043 (similarity stays unwired), or ADR-0022 (scoring
  untouched).

### Harder

- `conductSession` (closed Otzar work) is touched — permitted only
  because the change is strictly additive and Founder-authorized
  under RULE 1.
- Wave 1 provenance is limited: `COE.ContextItem` carries no `scope`
  or `created_at`, so per-item `scope` is `"UNKNOWN"` and
  `created_at` is omitted until a future COE `ContextItem` extension
  (ADR-0048 territory).
- Deeper similarity/search retrieval and an ingestion `source_type`
  taxonomy remain deferred to later, separately-authorized ADRs.

## Alternatives Considered

### Wire `similarity.service` into conductSession

Rejected: bypasses the governed `COE.assembleContext` path and
touches retrieval scope/scoring; ADR-0043 §Q-G3.6-ε deferred this
pending a Founder-authorized ADR-0022 amendment.

### New `/otzar/context/ingest` route + `source_type` enum

Rejected: duplicates the existing `POST /cosmp/capsule` write path
and triggers ADR-0021 CapsuleType / ADR-0042 mutation-discrimination
enum churn for no Wave 1 value.

### Expose raw COE `ContextItem.content`, `capsule_id`, per-item scores

Rejected: leaks raw memory content and scoring internals; violates
RULE 0 and the security constraints above.

### Expose the raw `capsules_denied_permission` count

Rejected: a raw denied count is permission-sensitive; reduced to the
coarse `access_limited` boolean with a friendly UI phrasing.

### Frontend-first implementation

Rejected: violates the cross-repo discipline (Foundation contract
lands first; `otzar-control-tower` consumes second).

## Open Future Decisions

- Whether to amend ADR-0022 to wire `similarity.service` into chat
  retrieval/scoring.
- Whether to extend `COE.ContextItem` with display metadata (scope,
  created_at, friendly title).
- Whether to add a connector/transcript `source_type` taxonomy via a
  future ADR-0021/ADR-0042-aligned ADR.
- Whether to add a dedicated ingestion wrapper once COSMP source
  semantics are approved.
- Whether skipped/denied governance signals are shown to employees,
  admins only, or both.
- Transcript governance; MCP connector governance; verification
  sidecar design — all later waves.

## References

- Code: `apps/api/src/services/otzar/otzar.service.ts`
  (`conductSession`, `ConductSessionSuccess`)
- Code: `apps/api/src/routes/otzar.routes.ts`
  (`POST /api/v1/otzar/conversation/message`)
- Code: `apps/api/src/services/coe/coe.service.ts`
  (`assembleContext`, `AssembleContextSuccess`, `ContextItem`)
- Code: `apps/api/src/services/cosmp/read.service.ts`,
  `apps/api/src/services/cosmp/similarity.service.ts`,
  `apps/api/src/services/cosmp/write.service.ts`,
  `apps/api/src/routes/cosmp.routes.ts`
- ADRs: ADR-0048 (COE governed working-set; not bypassed),
  ADR-0043 (similarity deferred; §Q-G3.6-ε), ADR-0022 (scoring
  frozen; not amended here), ADR-0021 (CapsuleType extension
  protocol), ADR-0042 (mutation discrimination), ADR-0002
  (append-only audit chain; no new literal), ADR-0035 (§37
  production-Supabase test trap)
- Rules: RULE 0, RULE 1, RULE 4, RULE 6, RULE 9, RULE 13, RULE 20,
  RULE 21
- Authorization: `[OTZAR-WAVE-1-ADR-0051-WRITE-AND-ACCEPT-AUTH]`
  (Founder, 2026-05-26)

Bidirectional citations (cited from):

- `docs/architecture/README.md` §Architectural Decision Records
- `CLAUDE.md` §5 (ADR quick-reference jump table)
- RULE 14 OBLIGATION PENDING: back-citations into the cited ADRs
  (ADR-0048, ADR-0043, ADR-0022, ADR-0021, ADR-0042, ADR-0002,
  ADR-0035) are required in the same commit per RULE 14. This
  WRITE-AND-ACCEPT authorization enumerated only the ADR file plus
  the catalog index/jump-table; editing the cited ADR bodies is
  RULE-20-restricted and outside this authorization's scope. The
  back-citations are surfaced for explicit Founder authorization
  before this ADR is committed (RULE 13).
- ADR-0052 (Otzar Domain General Intelligence and Governed
  Synchronicity) — the doctrine ADR frames this Wave 1 transparency
  surface as "the first governed transparency surface in the larger
  Domain General Intelligence path."
- ADR-0053 (Otzar Employee AI Twin Role-Scope Profile and
  Drift-Prevention Foundations) — the Wave 2 contract follows this
  ADR's additive, backward-compatible extension precedent (extends
  `getMyTwin` without changing existing fields).
