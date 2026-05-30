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

## Current status (PARTIAL — production-grade; Wave 3 drift detection LIVE)

Foundational substrate landed pre-Section-12 (Sections 1–11 closed
substrate primitives), plus the Otzar Wave canon (ADR-0051 / 0052 /
0053 / 0054 / 0055 / 0058) landed on main as live routes in commits
`3bb773d` (Wave 2A — 2026-05-27), `1ffa01d` (Wave 2B — 2026-05-27),
`c56bd57` (Wave 2C — 2026-05-28), `779a286` (Wave 3A — ADR-0058 —
2026-05-30), and `a2f0498` (Wave 3B — drift signal service +
per-conversation route — 2026-05-30). Wave 3 drift detection is
now LIVE as a coaching/alignment trust loop per the Founder Sleep
Directive boundary; advanced drift signals (stale-context,
role-scope-conflict, cross-conversation rollup, IntelligencePattern
auto-write) remain forward-substrate behind separate slice
authorization.

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
- **`GET /api/v1/otzar/conversations/:id/drift-signals` (Wave 3B —
  ADR-0058)** — per-conversation drift coaching/alignment trust
  loop. Self-scoped; closed-vocabulary signal labels
  (`CORRECTION_VELOCITY_ELEVATED` + `RECURRING_CORRECTION_THEME`);
  safe counts + canonical coaching/boundary copy; NEVER raw
  correction payloads / capsule IDs / topic tag values / manager
  surface / employee scoring / numeric "drift score". Service:
  `apps/api/src/services/otzar/drift-signal.service.ts`. Mirrors
  Wave 2C `/corrections` self-scope verbatim (cross-caller → 403
  NOT_CONVERSATION_OWNER; unknown id → 404 CONVERSATION_NOT_FOUND).
  ADMIN_ACTION:DRIFT_SIGNAL_READ audit emission (no new audit
  literal). Pure derived read-only — no schema migration; no
  persisted "drift profile" row.

## What is NOT live

- **Wave 3 advanced drift signals** (beyond Wave 3B's v1
  closed-vocabulary `CORRECTION_VELOCITY_ELEVATED` +
  `RECURRING_CORRECTION_THEME`):
  - Stale-context drift signal (would consume ADR-0044/0045
    decay + staleness substrate) — forward-substrate per
    ADR-0058 §9.
  - Role-scope conflict drift signal (would consume Section 2
    ActionAttempt `error_class = POLICY_DRIFT`) — forward-
    substrate per ADR-0058 §9.
  - Cross-conversation Twin-level rollup
    (`GET /api/v1/otzar/my-twin/drift-signals`) — forward-
    substrate per ADR-0058 §9.
  - Org-wide aggregate drift — explicit Wave 3 non-goal per
    ADR-0058 §1; requires Founder product decision.
  - `IntelligencePattern` auto-write from recurring correction
    themes — separate slice + Founder authorization.
  - Operator-tunable velocity thresholds (per-org OrgSettings
    override) — forward-substrate.
  - Drift digest connector fan-out (via Section 4 Wave 5/7
    connector substrate) — forward-substrate.
  - Numeric "drift score" / "compliance score" / "quality
    score" — explicitly forbidden by ADR-0058 §1 + §7
    forbidden fields; never to be implemented.
- **Real-time conversation summarization** beyond `summary_capsule_id`
  linkage. The summary capsule itself is created by the existing
  COSMP write path; richer summarization is forward-substrate.
- **Cross-team / cross-org employee-intelligence aggregation** —
  RULE 0 sovereignty boundaries enforce per-entity scope; any
  cross-tenant analytics is forward-substrate per CAR Sub-box 8.
- **Control Tower drift UX** — frontend lives in
  [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower);
  Foundation owns the safe backend projection.

## Landed PRs (Otzar Wave canon)

| Commit | Date | Description |
|---|---|---|
| `3bb773d` | 2026-05-27 | Add Otzar My Twin role-scope profile (Wave 2A — ADR-0053) |
| `1ffa01d` | 2026-05-27 | Add Otzar conversation look-back detail (Wave 2B — ADR-0054) |
| `c56bd57` | 2026-05-28 | Add Otzar correction-to-conversation linkage (Wave 2C — ADR-0055) |
| `779a286` | 2026-05-30 | Add Section 1 Wave 3A — ADR-0058 drift detection design + boundary (#82) |
| `e7b4a17` | 2026-05-30 | Add Section 1 Wave 3B — drift signal service + per-conversation route (#83) |

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

1. **Cross-conversation Twin-level drift rollup** —
   `GET /api/v1/otzar/my-twin/drift-signals` aggregating the
   caller's own drift signals across all their conversations.
   Forward-substrate per ADR-0058 §9 (separate slice
   authorization required to preserve the closed-vocabulary
   contract).
2. **Stale-context drift signal** — would consume ADR-0044/0045
   decay + staleness substrate (`MemoryCapsule.embedding_
   generated_at` + `embedding_content_hash != content_hash`)
   for capsules the conversation actually consumed.
   Forward-substrate per ADR-0058 §9; requires conversation
   context-trace join.
3. **Role-scope conflict drift signal** — would consume Section 2
   ActionAttempt `error_class = POLICY_DRIFT` rows where the
   Twin attempted action beyond its scope. Forward-substrate
   per ADR-0058 §9; cross-section join.
4. **Operator-tunable velocity thresholds** — per-org
   `CORRECTION_VELOCITY_THRESHOLD` override via OrgSettings
   field. Forward-substrate per ADR-0058 §9.
5. **Drift digest connector fan-out** — caller opts in to
   pushing their OWN drift signals to a registered Section 4
   ConnectorBinding (per-binding fan_out_mode + the existing
   NotificationService fan-out hook). Forward-substrate per
   ADR-0058 §9; never a manager push.
6. **Richer conversation summarization** — extend
   `summary_capsule_id` writer at `closeConversation` to produce
   higher-fidelity summaries (RULE 21 research arc required if
   the summarization crosses provider / LLM boundaries).
7. **`IntelligencePattern` auto-write from recurring correction
   themes** — separate slice + Founder authorization per
   ADR-0053 §5 + ADR-0058 §9.
8. **Cross-team aggregation governance** — design substrate for
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
