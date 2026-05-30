# ADR-0053: Otzar Employee AI Twin Role-Scope Profile and Drift-Prevention Foundations

## Status

Accepted 2026-05-27

Decider: Founder. Authorized at
`[OTZAR-WAVE-2-ADR-0053-EMPLOYEE-TWIN-ROLE-SCOPE-PROFILE-WRITE-AND-ACCEPT-AUTH]`.

This is the **Wave 2 contract ADR** for the Otzar employee AI Twin. It
is design-only: it locks scope, boundaries, and sequencing. It adds
**no code, no schema, no endpoints, no tests** — implementation lands
under a separate EXECUTE-VERIFY authorization. It is governed by, and
extends, the doctrine in ADR-0052 and
`docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md`.

## Context

Wave 1 (ADR-0051) gave Otzar its first governed transparency surface
("Why this answer?"). Wave 2 must deepen the **employee AI Twin** —
build-order step 3 in ADR-0052 (My Twin role/scope profile) — without
overclaiming autonomy, drift detection, coordination, or reporting that
the substrate does not yet support.

Current facts (verified on `main` @ `6bf54c7`):

- `GET /api/v1/otzar/my-twin` (`apps/api/src/services/otzar/otzar.service.ts`,
  `getMyTwin`) returns identity/config/membership basics only:
  `twin_id`, `display_name`, `role_title`, `autonomy_mode`,
  `swarm_enabled`, `role_template`, `is_admin_twin`, `status`, `skills`,
  `approver`, `created_at`/`updated_at`, `has_multiple_twins`,
  `twin_count`. The profile is **thin**: `skills` is usually empty
  (`seedSkillPackages` is a no-op), `role_template` is never applied
  (`createTwin` leaves it null), and `EntityProfile`
  (`job_title`/`department`/`timezone`) is **not** joined in.
- Conversations are **metadata-only** (`OtzarConversation`); no raw
  transcripts or message bodies are persisted.
- `closeConversation` writes a `CONVERSATION_LEARNING` summary capsule
  to the employee wallet, but there is **no `summary_capsule_id` link**
  on the conversation row (only `storage_location` encodes the
  `conversation_id`).
- `observe` ingests decisions/commitments/work-patterns/key-topics/
  external-entities into governed capsules (PORTABILITY routing:
  decisions → org/ENTERPRISE wallet; personal items → employee/PERSONAL
  wallet).
- `correction` writes `CORRECTION` capsules to the employee wallet and
  those are **already prioritized in `conductSession` Layer 1, before
  the role template** — the first real human-alignment primitive.
- Escalations support approve/reject of gate-fail escalations; there is
  **no general execution engine**.
- `IntelligencePattern` is **read-only-consumed** today (priming +
  admin reads); **no write-side drift detector** exists.
- `CompoundingMetrics` is written by Dandelion onboarding and by
  conversation-close.
- **No `Project` model, no notification model.** Drift prevention,
  best-practice learning, proactive coordination, AI-Twin-to-AI-Twin
  coordination, reports, listeners, hives, desktop, Agent Playground,
  and autonomy are **not implemented**.

The substrate for a richer **role-scope profile** already exists and
can be **derived** safely: `EntityProfile`, `EntityMembership`
(`role_title`/`department`/`hierarchy_level`/`is_admin`/`is_active`),
`TwinConfig`, the TAR capability flags and `Permission`/`AccessScope`
(exposed only as safe labels), `MemoryCapsule` counts, and
`OtzarConversation` metadata.

## Decision

Foundation will, in Wave 2, additively deepen the employee AI Twin into
a **governed role-scope profile**, derived-first, self-scoped, and free
of internals. Wave 2A is primary; Wave 2B is a bounded follow-on; drift
prevention is foundations-only. The locks:

1. **Wave 2A (primary) — additively extend `GET /api/v1/otzar/my-twin`**
   into a richer employee AI Twin role-scope profile. It is
   **self-scoped only**: a caller reads only **their own** twin profile —
   no other employees' scope, no cross-tenant data, no raw permission
   internals, no bridge IDs, no capability flags, no raw clearance
   numbers, no hidden evaluation, no surveillance framing.

2. **Safe profile fields** the implementation MAY expose (safe, derived):
   - *identity:* `twin_id`, `display_name`, `status`, `created_at`/`updated_at`
   - *role:* `role_title`, `job_title` (if available), `department` (if
     available), `hierarchy_level` (only if safe), `is_admin_twin`
   - *scope summary:* tenant/organization scope **label** (if safe),
     department memberships (if safe), active membership count,
     `has_multiple_twins`/`twin_count`, a **high-level permission posture
     label** (NOT raw RBAC/ABAC permissions), an approval/escalation
     posture **label**
   - *assistance profile:* `autonomy_mode`, `swarm_enabled`,
     `role_template` status, `skills` (only if real; else empty/omitted),
     current assistance boundaries
   - *governance:* approver relationship (if present); a statement that
     actions require permission/policy/approval when crossing a
     threshold; a statement that observation is permissioned work
     context, **not surveillance**
   - *continuity:* recent conversation count; recent correction count
     (if safely derived); recent learning-summary count (if safely
     derived) — **no raw transcript content**

3. **Derived-first model.** Wave 2A does **not** add `Project` or
   `Responsibility` models. It derives from existing substrate first —
   `EntityProfile`, `EntityMembership`, `TwinConfig`, TAR/`Permission`/
   `AccessScope` (safe labels only), `MemoryCapsule` counts/summaries (only
   if safe), `OtzarConversation` metadata, escalation relationships. New
   `Project`/`Responsibility` models require a later ADR.

4. **Wave 2B (bounded follow-on) — conversation look-back.** May be
   included only if it stays safe: **metadata and summary only — no raw
   transcripts, no raw message bodies, no hidden prompts, no
   chain-of-thought, no cross-tenant data, no unpermitted teammate
   data.** The preferred future additive schema link is
   **`summary_capsule_id` on `OtzarConversation`** (vs. deriving by
   `storage_location`/`topic_tags`); this ADR **locks `summary_capsule_id`
   as the preferred approach but does not implement it**. The schema add
   itself is deferred to the Wave 2B EXECUTE-VERIFY.

5. **Drift-prevention foundations (not implemented here).** `CORRECTION`
   is the first real human-alignment primitive (capsules exist and are
   prioritized in `conductSession`). Wave 2A may safely expose only
   **correction counts, learning counts, and a profile-level "alignment
   signals available" boolean/label** — **no hidden evaluation, no
   employee scoring, no productivity policing.** Full **drift** detection
   (recurring correction → `IntelligencePattern` write-side, stale-context
   warnings, an explicit drift-signal contract, proactive suggestions —
   always under permissioned/governed scope) is a **Wave 3** capability,
   not Wave 2.

   **Wave 3 drift-signal contract landed at ADR-0058** (2026-05-30) —
   self-scoped per-conversation `GET /api/v1/otzar/conversations/:id/drift-signals`
   surfacing closed-vocabulary coaching labels (`CORRECTION_VELOCITY_ELEVATED`
   + `RECURRING_CORRECTION_THEME`); explicit anti-surveillance boundary +
   no schema migration + no new audit literal + pure derived from existing
   substrate. `IntelligencePattern` auto-write + stale-context drift +
   proactive suggestions remain forward-substrate behind separate slice
   authorizations.

6. **Control Tower implication (deferred).** Control Tower will later
   consume the role-scope profile and eventually render AI-generated
   admin clarity, but Wave 2A does **not** build Control Tower reporting.
   **No fake dashboards** without backend events.

7. **Required sequencing.** **Foundation role/scope profile contract
   first**, then Foundation tests, then Control Tower My Twin UI
   consumption second, then conversation look-back third (if included),
   then the drift primitive after the role/scope profile is real.

8. **Non-goals (explicit).** No autonomy; no execution engine; no
   MCP/connectors; no raw transcripts; no listener sidecar; no hives; no
   Agent Playground; no desktop; no AI-Twin-to-AI-Twin communication yet;
   no Control Tower reports yet; no notification system yet;
   **no employee surveillance**; no productivity policing; no hidden
   evaluation; no cross-tenant leakage; no raw unpermitted data; no fake
   tools/verification/memory/autonomy claims.

## Consequences

### Easier

- The employee can understand what their AI Twin is **scoped to help
  with** — role, scope, governance posture, and continuity at a glance.
- A safer, richer frontend My Twin UI (Control Tower) can be built on a
  stable contract.
- Future drift prevention is grounded in a known role/scope rather than
  inferred from raw data.
- Control Tower can later reason from the profile contract.
- Avoids fake autonomy and keeps Wave 2 honest about what is live.

### Harder

- The profile must carefully avoid raw permission internals, bridge IDs,
  capability flags, and raw clearance — only safe labels.
- Project/responsibility data is derived/limited until new models exist
  (a later ADR).
- Conversation look-back remains limited until transcript governance is
  decided (a separate Founder/privacy decision).
- Control Tower reports remain deferred until steps 3–7 are real.

## Alternatives Considered

### Build drift detection (Wave 2C) first

Rejected: drift signals without a real role/scope to ground them produce
false positives and risk cross-scope leakage. Role/scope (Wave 2A) is the
prerequisite (ADR-0052 build order: step 3 before steps 5/6).

### Add `Project`/`Responsibility` models now

Rejected: premature. Wave 2A derives from existing substrate
(`EntityMembership`/`EntityProfile`/`TwinConfig`). New first-class models
warrant their own ADR once the derived profile proves the need.

### Persist raw transcripts to enable richer look-back

Rejected: transcript persistence is gated on a separate Founder/privacy
governance decision; Wave 2B stays metadata + summary only.

### Build the Control Tower report surface in Wave 2

Rejected: that is build-order step 10 and would be a fake dashboard
without the steps 3–7 backend events. Deferred.

## Acceptance Criteria

The future Wave 2A implementation must:

- remain **additive / backward-compatible** (preserve every existing
  `getMyTwin`/`ConductSessionSuccess` field);
- expose only **safe, self-scoped** profile data;
- include tests proving **no raw permission internals, bridge IDs,
  capability flags, raw clearance numbers, cross-tenant data, or
  transcript content** are exposed;
- keep Wave 2A distinct from Wave 2B/2C if implementation scope requires;
- update Control Tower **only after** the Foundation contract exists.

## References

- Doctrine: `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md` (§3
  human employee model, §4 AI Twin model, §5 watching-is-not-surveillance,
  §6 drift prevention, §17 build order)
- Code: `apps/api/src/services/otzar/otzar.service.ts` (`getMyTwin`,
  `ConductSessionSuccess`, `closeConversation`, `listConversations`),
  `apps/api/src/services/otzar/transparency.ts`,
  `apps/api/src/routes/otzar.routes.ts`
- Schema: `packages/database/prisma/schema.prisma` (`EntityProfile`,
  `EntityMembership`, `TwinConfig`, `Permission`, `MemoryCapsule`,
  `OtzarConversation`, `IntelligencePattern`, `CompoundingMetrics`)
- ADRs: ADR-0052 (DGI doctrine + build order — parent), ADR-0051 (Wave 1
  additive transparency contract — additive-extension precedent),
  ADR-0048 (COE governed working-set — scope grounding), ADR-0002
  (append-only audit chain — governance/proof)
- Rules: RULE 0 (sovereignty), RULE 1 (build forward only / additive),
  RULE 4 (audit before response), RULE 9 (modular connections), RULE 13
  (surface drifts inline), RULE 20 (rule/ADR authority), RULE 21
  (pre-authorization research arc; cross-repo wire-format/frontend-contract
  implication — the `my-twin` response contract is consumed by
  `otzar-control-tower`)
- Authorization:
  `[OTZAR-WAVE-2-ADR-0053-EMPLOYEE-TWIN-ROLE-SCOPE-PROFILE-WRITE-AND-ACCEPT-AUTH]`
  (Founder, 2026-05-27)

Bidirectional citations (cited from):

- `docs/architecture/README.md` §Architectural Decision Records
- `CLAUDE.md` §5 (ADR quick-reference jump table)
- `docs/otzar/README.md` (Otzar docs index)
- ADR-0054 (Otzar Conversation Look-back and Safe Continuity
  Surfacing) — the Wave 2B contract implements this ADR's §4
  preferred `summary_capsule_id` link on `OtzarConversation`.
- ADR-0055 (Otzar Correction Signals and Drift-Prevention
  Continuity) — the Wave 2C contract is the per-conversation half
  of this ADR's §5 "drift-prevention foundations"; full drift
  detection remains the Wave 3 boundary §5 locked.
