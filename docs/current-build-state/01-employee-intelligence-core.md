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

## Current status — PRODUCTION-GRADE COMPLETE for v1 Foundation drift-detection backend scope

Foundational substrate landed pre-Section-12, plus Otzar Wave canon
(ADR-0051/0052/0053/0054/0055/0058) landed 2026-05-27/28, plus the
**drift-detection arc** completed 2026-05-30:

- Wave 3A `779a286` — ADR-0058 design.
- Wave 3B `a2f0498` — per-conversation drift signals
  (CORRECTION_VELOCITY_ELEVATED + RECURRING_CORRECTION_THEME).
- **Wave 4A (PR #108)** — stale-context drift signal
  (wallet-level FRESH_CONTEXT / STALE_CONTEXT_RISK /
  INSUFFICIENT_DATA; consumes ADR-0045 G5.1 embedding-lag
  substrate).
- **Wave 4B (POLICY_DRIFT role-scope conflict)** — **SKIPPED**
  per RULE 13 substrate-honest Phase 0 finding: POLICY_DRIFT
  error_class is NOT emitted by any current handler;
  substrate-derivation impossible at v1 without separate
  Founder slice authorization for a producer.
- **Wave 4C (PR #109)** — cross-conversation drift rollup
  (self-scoped AT_RISK / NORMAL / INSUFFICIENT_DATA; folds
  Wave 3 per-conversation + Wave 4A wallet-level signals).

**Section 1 drift-detection arc closeout 2026-05-30**: 3 live
drift-signal routes, all self-scoped + closed-vocab + locked
coaching/boundary copy explicitly disclaiming surveillance
framing. Universal invariants: bearer + "read" only (NEVER admin
gate; NEVER manager surface); `ADMIN_ACTION + DRIFT_SIGNAL_READ`
audit with `source_signal` discriminator (3 values:
no-discriminator-for-Wave-3-per-conversation / STALE_CONTEXT_WALLET /
CROSS_CONVERSATION_ROLLUP); zero new audit literals across all 3
signals; zero schema migration across all 3 signals; zero new
external dependencies; 38 drift-arc integration tests total
(13 per-conversation Wave 3 + 13 stale-context Wave 4A + 12
rollup Wave 4C).

**Important scope wording**: closes the **Foundation backend
drift-detection substrate + the Wave 5 review-gated
proposed-pattern substrate + the Wave 6A symbiotic advisory
surface + the Wave 6B priming hook into assembleContext**
for v1 self-scoped coaching/alignment trust loop. **Wave 6B
LANDED 2026-05-31 (PR #124 `625ddbf`)** implements the
influence half of active-pattern-consumption per ADR-0067:
accepted patterns become bounded, owner-controlled alignment
context for the Twin via a sidecar field on
`assembleContext` + a labeled prompt section in
`conductSession`. Visible alignment priming, not hidden
memory mutation.
Wave 5 LANDED 2026-05-30 (PR #114 `7661ba9`): NEW
`OtzarProposedPattern` Prisma model + service + 4 self-scoped
routes + 36 integration tests; closes ADR-0058 §"Forward queue"
item 1 + ADR-0066 §3-§7 at the implementation register.
**Wave 6A LANDED 2026-05-30 (PR #121 `6b84a99`)**: NEW
symbiotic advisory surface on `GET /api/v1/otzar/my-twin`
exposing the caller's OWN ACCEPTED `OtzarProposedPattern`
rows as `accepted_patterns[]`. The user teaches the Twin
through review-and-acceptance; the Twin reflects accepted
patterns back as visible alignment memory — NOT correction
logging, NOT employee coaching, NOT compliance reminders,
NOT surveillance. Remaining ADR-0058 §Forward queue items still
forward-substrate: operator-tunable thresholds per org; drift
digest connector fan-out; Control Tower drift UX; role-scope-
conflict signal pending a POLICY_DRIFT producer. ADR-0066 §9
non-goals continue as forward-substrate: active pattern
consumption (Wave 6+ — how an ACCEPTED pattern informs the AI
teammate's behavior); manager/admin review surface (forbidden);
LLM-generated proposal text (forbidden); background scheduler;
true consecutive-day tracking.

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
- **Wave 6B — symbiotic priming hook into `COE.assembleContext`
  (PR #124; `625ddbf`)** — extends Wave 6A visibility half
  with the **influence half** of active-pattern-consumption
  per ADR-0067. Implements Option (d) **sidecar-field design
  lock** (NOT score-boost; NOT capsule pipeline mutation; NOT
  pre-filter keyword injection). Two consumer surfaces:
  - **`POST /api/v1/coe/context`** body extended with optional
    `include_alignment_patterns?: boolean` (default true;
    explicit owner opt-out). Response extended with optional
    `alignment_patterns?: readonly AcceptedPatternAdvisoryView[]`
    (reuses Wave 6A projection verbatim).
  - **`conductSession` 8-layer prompt builder** renders a
    NEW labeled `L_ALIGNMENT` section between
    `truncated.final.priming` and `truncated.final.L1`:
    `[OWNER'S ACCEPTED ALIGNMENT PATTERNS — visible advisory
    context the owner has reviewed and accepted as alignment
    guidance. These are owner-controlled hints, not memory
    rewrites; the owner remains sovereign over which
    patterns are accepted, archived, or ignored.]` followed
    by bulleted SAFE rows showing `pattern_label` +
    `source_signal_type` + `confidence_label` + `accepted_at`
    + `safe_summary` + `advisory_note`. `pattern_id` is
    deliberately excluded from the LLM prompt (debug-only).
  Service: `apps/api/src/services/coe/coe.service.ts` (NEW
  STEP 6.5 sidecar read with owner-scope enforced by-construction
  via `session.entity_id`; read failures swallowed silently);
  `apps/api/src/services/otzar/otzar.service.ts` (NEW
  `L_ALIGNMENT` capture + injection; outside truncation
  budget to preserve alignment fidelity). Server wiring:
  `OtzarProposedPatternService` constructor reordered BEFORE
  `COEService` to enable the 6th-arg dependency injection.
  **NO score-boost** (ADR-0022 `combined_score` frozen
  anchor preserved). **NO new audit literal** (inherits
  existing `ADMIN_ACTION+COE_ASSEMBLE_CONTEXT` audit posture).
  **NO schema migration.** **NO capsule pipeline mutation**
  (counters verified identical with/without sidecar). 14
  integration tests at
  `tests/integration/coe-alignment-patterns-sidecar.test.ts`.

- **Wave 6A — symbiotic advisory surface on `/api/v1/otzar/my-twin`
  (PR #121; `6b84a99`)** — extends the existing Wave 2A
  getMyTwin response with an optional `accepted_patterns[]`
  field projecting the caller's OWN ACCEPTED
  `OtzarProposedPattern` rows as visible alignment guidance.
  Symbiotic framing per Founder Wave 6A clarification: the
  user teaches the Twin through review-and-acceptance; the
  Twin reflects accepted patterns back as visible alignment
  memory. Forbidden language ("score" / "surveillance" /
  "manager" / "compliance" / "discipline") verified absent
  from the advisory_note template copy. **NO assembleContext
  touch** (Wave 6B forward-substrate). **NO new audit
  literal** (preserves Wave 2A no-audit posture). **NO
  schema migration.** SAFE projection enforced by
  `AcceptedPatternAdvisoryView` (7 fields only: pattern_id +
  closed-vocab source/label/confidence + safe_summary +
  accepted_at + symbiotic advisory_note); v1 bounded limit
  default 5 / cap 25; sorted by `reviewed_at DESC`. PROPOSED
  / REJECTED / ARCHIVED rows excluded. Cross-owner isolation
  verified (caller A cannot see caller B's accepted patterns).
  15 integration tests at `tests/integration/
  my-twin-accepted-patterns.test.ts`.

- **Wave 5 — `/api/v1/otzar/my-twin/proposed-patterns/*` (PR #114;
  ADR-0066)** — 4 self-scoped routes for the review-gated
  proposed-pattern lifecycle:
  - `POST /api/v1/otzar/my-twin/proposed-patterns/sweep` —
    run on-demand recurrence detection; create any new PROPOSED
    rows; deduplicate against existing PROPOSED|ACCEPTED non-
    archived rows.
  - `GET /api/v1/otzar/my-twin/proposed-patterns?status&limit&include_archived` —
    list caller's proposed patterns (default excludes ARCHIVED).
  - `GET /api/v1/otzar/my-twin/proposed-patterns/:id` —
    owner-only detail.
  - `PATCH /api/v1/otzar/my-twin/proposed-patterns/:id` —
    owner state-transition (PROPOSED → ACCEPTED | REJECTED |
    ARCHIVED; ACCEPTED|REJECTED → ARCHIVED; ARCHIVED terminal).
  Service: `apps/api/src/services/otzar/proposed-pattern.service.ts`.
  Recurrence-detection function reads ONLY the caller's own
  drift substrate (CORRECTION capsules in caller's wallet +
  caller's wallet capsule freshness). Auto-write = AUTO-PROPOSE,
  NOT auto-commit. NEW `OtzarProposedPattern` Prisma model (14
  columns + 2 indexes) deliberately separate from the existing
  org-scoped `IntelligencePattern` (preserved unchanged per
  RULE 1; verified untouched across full test cycle).
  ADMIN_ACTION + 5-discriminator audit (PROPOSED / READ /
  ACCEPTED / REJECTED / ARCHIVED); ZERO new audit literal;
  safe details only (no safe_summary text; no raw correction/
  transcript/capsule content; no conversation IDs; no numeric
  scores). 36 integration tests; SAFE projection enforced by
  enumeration.

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
7. ~~**`IntelligencePattern` auto-write from recurring correction
   themes**~~ — **IMPLEMENTATION LANDED at PR #114 `7661ba9`
   (2026-05-30)** as Section 1 Wave 5 `OtzarProposedPattern`
   review-gated proposal lifecycle per ADR-0066 §3-§7.
   ~~**Wave 6 active-pattern-consumption** remains forward-
   substrate behind separate Founder authorization per
   ADR-0066 §9.~~ — **Wave 6A LANDED at PR #121 `6b84a99`
   (2026-05-30)** as the symbiotic advisory surface on
   `getMyTwin` (accepted_patterns[] projection; no audit; no
   assembleContext touch; no schema). **Wave 6B DESIGN
   LANDED at ADR-0067 (2026-05-30) + IMPLEMENTATION LANDED
   at PR #124 `625ddbf` (2026-05-31)** as the sidecar-field
   priming hook into `COE.assembleContext` (separate from
   the capsule pipeline; reuses Wave 6A
   `AcceptedPatternAdvisoryView` verbatim; explicit owner
   opt-out via `include_alignment_patterns: false`;
   labeled LLM-tier `L_ALIGNMENT` prompt section; ZERO new
   audit literal; ZERO schema migration; ZERO
   combined_score amendment per ADR-0022 frozen anchor;
   ZERO capsule pipeline mutation; 14 integration tests).
   **Active-pattern-consumption is now FULLY LIVE** (Wave
   6A visibility + Wave 6B influence; symbiotic alignment
   loop closed at both registers).
8. **Cross-team aggregation governance** — design substrate for
   safe aggregation of permissioned signals across an org's
   employee twins (likely lands as a future CAR Sub-box; not yet
   designed).
9. ~~**Otzar Wave 3 — Scoped Twin Proactivity**~~ —
   **IMPLEMENTATION LANDED at PR #127 `8474863` (2026-05-31)**
   per ADR-0068. NEW `apps/api/src/services/otzar/proactivity.service.ts`
   ships the `assembleProactiveCards` pure-function helper +
   closed-vocab type set + `PROACTIVE_CARD_TEMPLATES` (locked
   copy verbatim per ADR-0068 §5) + `PROACTIVE_CARDS_MY_TWIN_MAX
   = 4` + `ALIGNMENT_CHECK_IN_DAYS = 14`. `MyTwinView` extended
   with optional `proactive_cards?` sidecar; `GetMyTwinInput`
   extended with optional `include_proactive_cards?` opt-out;
   `GET /api/v1/otzar/my-twin` accepts
   `?include_proactive_cards=true|false` querystring (typos →
   default; never 400). 5 closed-vocab card_types live:
   `ACCEPTED_PATTERN_REMINDER` + `PROPOSED_PATTERN_REVIEW_AVAILABLE`
   + `STALE_CONTEXT_REFRESH_SUGGESTED` + `DRIFT_REVIEW_SUGGESTED`
   + `ALIGNMENT_CHECK_IN`. Deterministic SHA-256 16-char
   `card_key` (hashes only SAFE components: card_type +
   source_signal_type + closed-vocab discriminator + ISO day) so
   the client can persist a local dismiss across same-day reads.
   RULE 13 + RULE 18 substrate-honest correction surfaced
   inline: Wave 4A `analyzeStaleContextForCaller` + Wave 4C
   `analyzeDriftRollupForCaller` + Wave 5
   `OtzarProposedPatternService.list()` all emit audit +
   re-validate session, so Wave 3 cannot consume them from
   inside `getMyTwin` without violating ADR-0068 §11 "ZERO new
   audit row". Resolved via 3 NEW additive pure helpers
   (`computeStaleContextLabelForEntity`,
   `computeDriftRollupLabelForEntity`,
   `findOldestPendingProposedForOwner`) that share the
   derivation logic verbatim without audit emission. Existing
   Wave 4A/4C/5 routes preserved unchanged (RULE 1 additive
   only). ZERO `NotificationService` integration. ZERO
   `conductSession` / `assembleContext` touch. ZERO Action /
   `OtzarProposedPattern` / `MemoryCapsule` /
   `OtzarConversation` / `IntelligencePattern` mutation. ZERO
   external delivery. ZERO LLM-generated text. ZERO manager
   visibility. ZERO schema migration. ZERO new audit literal. 18
   integration tests + 90/90 Wave 5/6A/6B/4A/4C regression
   preserved. Forward-substrate after closure: persistent
   `ProactiveCardDismissal` model; Twin-as-source
   `NotificationService` extension; `conductSession`
   proactivity preamble; NEW `/proactive-cards` route; external
   delivery via Section 4 connectors; LLM-generated proactive
   text; background scheduler / cadence persistence; Control
   Tower proactivity UX (out-of-Foundation-scope). Closes
   ADR-0052 §9 proactivity-vs-autonomy + ADR-0053 §5
   "proactive suggestions" forward-queue entries at the
   implementation register.

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
- ~~Otzar Wave 3 Twin Proactivity (ADR-0068) is design-only~~
  — **IMPLEMENTATION LANDED at PR #127 `8474863` (2026-05-31)**.
  `MyTwinView.proactive_cards?` is LIVE. Future proactivity
  extensions (persistent dismissal, Twin-as-source notification,
  `conductSession` preamble, LLM-generated text, external
  delivery, background scheduler, Control Tower UX) remain
  forward-substrate behind separate Founder authorization per
  ADR-0068 §"Forward queue".

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
