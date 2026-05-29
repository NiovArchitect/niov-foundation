# Section 1 — Employee Intelligence Core

> Detailed canonical record for production Section 1. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

The substrate that lets the Foundation hold, govern, and surface
per-employee intelligence safely. Employee Twin role-scope profile,
correction signals, conversation continuity / look-back, drift
prevention foundations, scoped memory (DMW + Memory Capsules),
COSMP 7 operations, audit chain, compliance routing — all gated
through COSMP and DMW per the COSMP patent (US 12,517,919) and
DMW patents (US 12,164,537 + US 12,399,904).

## Current status (PARTIAL — production-grade)

Foundational substrate landed pre-Section-12 (Sections 1–11 closed
substrate primitives), plus the Otzar Wave canon (ADR-0051 / 0052 /
0053 / 0054 / 0055) landed on main as live routes in commits
`3bb773d` (Wave 2A — 2026-05-27), `1ffa01d` (Wave 2B — 2026-05-27),
and `c56bd57` (Wave 2C — 2026-05-28). Wave 3 drift detection
remains forward-substrate (not yet designed at the ADR register).

## What is live

### Foundational substrate

- COSMP 7 operations + audit chain + RULE 0 sovereignty enforcement.
- DMW substrate (wallet types: PERSONAL, ENTERPRISE, DEVICE per
  ADR-0001 with ADR-0046 dual-context AI_AGENT routing).
- COE governed-retrieval substrate (`assembleContext`).
- Otzar `conductSession` + `processCorrection` + `closeConversation`
  + `getMyTwin` employee twin surface.
- ADR-0048 personalization-orchestration substrate (Foundation-owned
  governed working-set construction; the LLM never decides what
  context it sees).
- Embedding substrate per ADR-0043 (pgvector + text-embedding-3-small
  + HNSW + cosine) with G3.9 J5–J8 privacy proofs.
- Capsule-level staleness substrate per ADR-0045 (embedding_lag
  detection).

### Live Otzar Wave 2 surfaces

- **`GET /api/v1/otzar/my-twin` (Wave 2A — ADR-0053)** — additively
  returns `role_scope_profile`: identity, role, scope_summary,
  assistance_profile, governance, continuity (recent conversation /
  correction / learning counts). Self-scoped to the caller; calm
  posture labels only — NO raw permission internals, bridge IDs,
  capability flags, clearance values, transcript content, or
  cross-tenant data. Derived from existing substrate
  (EntityProfile + EntityMembership + TwinConfig + TAR safe labels +
  OtzarConversation metadata + MemoryCapsule counts); no new
  models / no migration. Service:
  `apps/api/src/services/otzar/otzar.service.ts:getMyTwin`.
- **`GET /api/v1/otzar/conversations/:id` (Wave 2B — ADR-0054)** —
  safe self-scoped conversation look-back detail. Returns
  conversation metadata + `summary_capsule_id` link only. NEVER raw
  transcripts, message bodies, hidden prompts, chain-of-thought,
  cross-tenant data, or unpermitted teammate data. Service:
  `apps/api/src/services/otzar/conversation-detail.ts`.
- **`GET /api/v1/otzar/conversations/:id/corrections` (Wave 2C —
  ADR-0055)** — per-conversation correction-signal sub-resource.
  Counts + labels only; no correction-text leakage; no cross-
  conversation aggregation. Service:
  `apps/api/src/services/otzar/conversation-corrections.ts`.

## What is NOT live

- **Wave 3 drift detection / drift score / stale-context warnings /
  proactive suggestions / `IntelligencePattern` auto-write.** Per
  ADR-0053 §5 + ADR-0055 forward-substrate notes — Wave 3 is
  intentionally NOT yet designed at the ADR register; it requires
  its own Founder-authorized ADR + research arc.
- **Real-time conversation summarization** beyond `summary_capsule_id`
  linkage. The summary capsule itself is created by the existing
  COSMP write path; richer summarization is forward-substrate.
- **Cross-team / cross-org employee-intelligence aggregation** —
  RULE 0 sovereignty boundaries enforce per-entity scope; any
  cross-tenant analytics is forward-substrate per CAR Sub-box 8.

## Landed PRs (Otzar Wave canon)

| Commit | Date | Description |
|---|---|---|
| `3bb773d` | 2026-05-27 | Add Otzar My Twin role-scope profile (Wave 2A — ADR-0053) |
| `1ffa01d` | 2026-05-27 | Add Otzar conversation look-back detail (Wave 2B — ADR-0054) |
| `c56bd57` | 2026-05-28 | Add Otzar correction-to-conversation linkage (Wave 2C — ADR-0055) |

Pre-Section-12 foundational lineage: see the ADR catalog in
[`../../architecture/decisions/`](../../architecture/decisions/)
(0001 through ~0050 are the foundational substrate; ADR-0051 is the
Otzar Wave 1 transparency ADR; ADR-0052 the Domain General
Intelligence doctrine; ADR-0053/0054/0055 the Wave 2A/B/C
contracts).

## RULE 13 disclosures specific to Section 1

- Twin scope parity: Twin-of-employee operates inside the same
  RBAC / ABAC boundary as the employee, never above. Per ADR-0052
  doctrine.
- Permissioned work observation is NOT surveillance per ADR-0052;
  raw unpermitted data is never exposed.
- AI_AGENT entity-type-discriminated capsule routing canonical per
  ADR-0046; Personal AI Agent → PERSONAL wallet (twin / digital twin
  context); Enterprise AI Agent → ENTERPRISE wallet (organization
  context).
- **Section 01 file substrate-honest correction (2026-05-29):**
  prior versions of this file claimed Otzar Wave 2A/B/C were
  "design accepted; code forward-substrate." This was canonical
  truth drift — the code had in fact landed on main at commits
  `3bb773d` / `1ffa01d` / `c56bd57` between 2026-05-27 and
  2026-05-28, with full unit + integration test coverage. The
  drift was surfaced during Wave 5 reconnaissance when the
  substrate showed `role_scope_profile` already implemented at
  `otzar.service.ts:957-1105`. This refresh restores
  substrate-honesty per RULE 13.

## Next slices (priority order)

1. **Wave 3 drift detection ADR** — Founder-authorized ADR that
   designs recurring-correction → `IntelligencePattern` auto-write,
   stale-context warnings, explicit drift-signal contract,
   proactive-suggestion contract (all under permissioned /
   governed scope; no surveillance framing). Required before any
   Wave 3 implementation slice.
2. **Wave 3 Phase 1 implementation** — `IntelligencePattern`
   auto-write from recurring `CORRECTION` capsules (after the
   Wave 3 ADR lands).
3. **Richer conversation summarization** — extend
   `summary_capsule_id` writer at `closeConversation` to produce
   higher-fidelity summaries (RULE 21 research arc required if the
   summarization crosses provider / LLM boundaries).
4. **Cross-team aggregation governance** — design substrate for
   safe aggregation of permissioned signals across an org's
   employee twins (likely lands as a future CAR Sub-box; not yet
   designed).

## Risks / forward-substrate

- Wave 3 drift detection has known sensitivity:
  surveillance / productivity-policing framing is explicitly
  forbidden per ADR-0052. The ADR must canonicalize the line
  between "drift coaching for the employee's benefit" and
  "manager surveillance of the employee." Until that line is
  drawn at the ADR register, no Wave 3 code lands.
- The `role_scope_profile` continuity counts currently report
  totals; ADR-0053 reserves the `recent_` prefix for a future
  time-window contract change without breaking the response shape.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
