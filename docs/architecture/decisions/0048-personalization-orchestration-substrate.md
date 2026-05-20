# ADR-0048: Foundation/COSMP Personalization-Orchestration Substrate (Phase 3 Sub-Arc 3)

## Status

Accepted 2026-05-20

ADR-0048 closure cascade LANDED at PERS.6 `[COSMP-PERSONALIZATION-CLOSURE]`
per Founder Q-PERS.6-α α-1 + β-1 + γ-1 + δ-1 + ε-1 + ζ-1 + η-1 + θ-2 LOCKS
at `[COSMP-PERSONALIZATION-CLOSURE-EXECUTE-VERIFY-AUTH]`. Phase 3 Sub-Arc 3
(Foundation/COSMP Personalization-Orchestration Substrate) is CLOSED
2026-05-20. Phase 3 global status is NOT flipped — all Phase 3 sub-arcs are
now CLOSED (the global-closure prerequisite is met), but Phase 3 global
closure requires a separate explicit Founder QLOCK.

## Context

Phase 3 (Dynamic Memory Accuracy at Scale) Sub-Arc 2 (Capsule Layer
Substrate Umbrella per ADR-0041) is CLOSED at canonical-state register
substantively (Accepted 2026-05-19). Memory Capsules are now the
governed memory substrate across mutation discrimination (ADR-0042),
pgvector embedding (ADR-0043), decay execution (ADR-0044), capsule-
level staleness (ADR-0045), and AI_AGENT dual-context routing
(ADR-0046), hardened by ADR-0047.

The next production-critical Foundation layer is **personalization-
orchestration**. Per Founder directive, the goal is **NOT app-layer
personalization** — it is **Foundation/COSMP-governed working-set
construction** for apps, APIs, and agents. The core principle:

- The **Foundation/COSMP constructs the governed working set** before
  the LLM sees any context.
- The **LLM must never decide what memory it is allowed to see.**
- **Apps compose UX** (Otzar and other apps may call the Foundation
  through APIs/tools).
- **Otzar consumes** the working set; **agents reason over** the
  working set.
- **Permissions, wallet boundaries, clearance, audit, and capsule
  state remain Foundation-owned.**

Personalization must be **dynamic, not static**: it changes by moment,
location, role, task, and permission state. The Foundation must be
**permission-aware but not permission-fragile** — it must support
optimal personalization with rich permissions, degraded personalization
with partial permissions, safe minimal personalization with denied
permissions, and clear uncertainty disclosure when data is missing.
Personal and enterprise DMW boundaries are non-negotiable; no silent
cross-context bridging.

This ADR is the canonical decision substrate for Phase 3 Sub-Arc 3.
It is **docs-only** per Q-PERS-α α-1; substantive implementation lands
at PERS.2 through PERS.6.

### Research arc (RULE 21 pre-authorization research at canonical-knowledge register substantively)

Per RULE 21, a Hawkseye reconnaissance research arc canonical at
canonical-knowledge register substantively informed this ADR
(`[COSMP-PERSONALIZATION-ORCHESTRATION-SUBSTRATE-HAWKSEYE]`; sources
retrieved 2026-05-19):

- **Context engineering + agent memory + working sets** — 2026
  industry direction treats context engineering as architecting the
  entire information environment (memory + tools + retrieval + state),
  not just the prompt; working-set construction layers tool
  definitions + scoped conversation history + dynamically fetched
  knowledge + user profiles combining static preferences with live
  behavioral signals; memory is a first-class architectural component
  with its own benchmark suite (OpenAI Cookbook context-
  personalization; Mem0 State of AI Agent Memory 2026; Supermemory;
  Taskade context-engineering field guide).

- **Permission-aware + privacy-preserving personalization** — OAuth2
  delegated to MCP servers ensures agents operate only with the
  logged-in user's permissions; multi-granularity management mitigates
  the privacy-personalization trade-off (Puda arXiv:2602.08268 shows
  predefined category subsets achieve 97.2% of full-history
  personalization performance while preserving user control);
  on-device processing + federated learning enable personalization
  without transmitting sensitive data (ACM 2025 Aligning Personalized
  AI Agents with Users' Privacy Preference; VERTU enterprise data-
  security 2026; SparkCo personal-AI-agent 2026).

- **Enterprise AI governance + agent orchestration + MCP tool-
  mediated context** — MCP is the de facto 2026 standard for agent
  communication; A2A protocol enables dynamic capability discovery;
  the structural scaling problem is context inconsistency across agent
  memory stores; enterprises require governance frameworks (audit
  trails + approval workflows + chain-of-custody logging) (AetherLink
  enterprise orchestration guide 2026; OneReach MCP multi-agent;
  Atlan multi-agent orchestration; FifthRow April 2026 enterprise
  orchestration playbook).

- **Confused-deputy risk in multi-agent systems** — the classical
  confused-deputy access-control vulnerability is amplified at the
  orchestration tier where credential delegation chains compound;
  re-validation at each agent hop is the canonical mitigation
  (extends the ADR-0046 §RS-G6-2 confused-deputy research arc:
  Cloud Security Alliance + HashiCorp + Quarkslab + BeyondTrust).

- **TurboQuant / vector-KV compression (deferred optimization)** —
  TurboQuant (Google DeepMind, ICLR 2026; arXiv:2504.19874) achieves
  3-bit KV-cache quantization, ≥6× memory reduction, ~8× faster
  attention, data-oblivious + training-free + near-lossless
  (PolarQuant + 1-bit QJL residual). Relevant to KV-cache
  compression + vector search + embedding compression + edge/local
  inference + high-concurrency agent orchestration. **Deferred** per
  Q-PERS-κ κ-1 (see §11).

Research sources are listed in §References.

## Governing RULES

- **RULE 0** (Humans Always Sovereign): personalization cannot
  silently expand authority, infer forbidden context, or cross
  personal/enterprise DMW boundaries; humans/entities remain
  sovereign over what the working set may include.
- **RULE 10** (Nothing is ever deleted): personalization-signal
  recording + working-set construction preserve soft-delete
  discipline; no hard-delete.
- **RULE 11** (Prisma/Ecto cross-language boundary): personalization
  substrate respects the cross-language data-ownership boundary per
  ADR-0033 §Decision 7; BEAM locality reuse (DMWWorker / WalletCache)
  for the local/domain-scoped working-set builder.
- **RULE 12** (pre-flight grep before drafting): substrate-state
  ground truth verified at HEAD `03ebcd7` register substantively
  (COE assembleContext + EntityProfile + OrgSettings + TwinConfig +
  Permission.conditions + Otzar priming + CapsuleType taxonomy all
  grep-confirmed).
- **RULE 13** (surface drifts inline): missing substrate, permission
  gaps, API bottleneck risk, and cross-context leakage risk surfaced
  inline at §Substrate-State Observations + §Adversarial Threat
  Model.
- **RULE 20** (Founder-only RULE/ADR modification): Founder
  authorization explicit at PERS.1 landing per
  `[COSMP-PERSONALIZATION-ORCHESTRATION-QLOCK]` +
  `[COSMP-PERSONALIZATION-PERS.1-EXECUTE-VERIFY-AUTH]`.
- **RULE 21** (current-source research before substrate-architectural
  pastes): research arc embedded at §Context above; Hawkseye
  reconnaissance canonical at canonical-knowledge register
  substantively.

## Substrate-State Observations

### §A — The governed working-set constructor already exists

`apps/api/src/services/coe/coe.service.ts:172` `assembleContext(
sessionToken, requestText, tokenBudget, context)` runs the canonical
governed 7-step working-set construction flow at canonical-execution
register substantively:

1. **understand** — `extractKeywords(requestText)`
2. **load** — validate session → resolve wallet →
   `prisma.memoryCapsule.findMany({wallet_id, deleted_at: null,
   clearance_required: {lte: session.clearance_ceiling}})`
3. **score** — `combinedScore(tagOverlap, relevance, recency)` per
   ADR-0022 formula
4. **select** — within token budget; FOUNDATIONAL first (never counts
   toward budget); `RELEVANCE_FORGET_FLOOR` filter
5. **negotiate** in parallel (NEGOTIATE gate: `ai_access_blocked` +
   `requires_validation` + `clearance_required` per ADR-0046
   enforcement-surface inventory)
6. **read content**
7. **return** governed context package

**The LLM receives the governed context package, NOT raw DB access.**
This is the Founder's core principle, already implemented. Apps reach
this through `coe.routes.ts`. The personalization-orchestration arc
EXTENDS this constructor; it does not replace it.

### §B — Stable identity substrate exists

`EntityProfile` (`packages/database/prisma/schema.prisma:813`):
`first_name`, `last_name`, `job_title`, `username`, `phone`,
`timezone @default("America/New_York")`, `bio`, `avatar_url`. → name,
role (job_title), and timezone are LIVE stable identity signals.
**Missing**: `preferred_name`, `pronouns`, `locale`/`language`
(schema disposition deferred to PERS.2).

### §C — Enterprise governance defaults exist

`OrgSettings` (`schema.prisma:834`): `dept_data_isolation
@default(true)`, `require_human_approval @default(true)`,
`audit_ai_actions @default(true)`, `cross_dept_collab`,
`federated_learning`, `mfa_required`, `ip_whitelist`,
`default_jurisdiction`, `industry`. → enterprise-admin governed
workspace defaults are LIVE.

### §D — Role + autonomy substrate exists

`TwinConfig` (`schema.prisma:863`): `autonomy_level
@default("APPROVAL_REQUIRED")`, `role_template`, `is_admin_twin`,
`approver_entity_id`, `swarm_enabled`. → role + autonomy + approver
context LIVE.

### §E — Permission/consent model is conditions-JSON-extensible

`Permission` model: capsule-level `bridge_id` + `grantor` + `grantee`
+ `access_scope (METADATA_ONLY | SUMMARY | FULL)` + `duration_type` +
`conditions Json @default("{}")` + status. Consent already rides
`conditions` JSON (`health_data_consent`, `student_consent` per
`compliance.service.ts:216-236`). → location/calendar/email/contacts
permission grants can be expressed in `conditions` JSON, likely
without schema changes (PERS.2 resolves).

### §F — Moment-awareness (time) precedent exists

`apps/api/src/services/otzar/priming.ts:267` `getPriming(...)` is the
STEP 0 moment-context layer: `getCommitmentsDueSoon(48h horizon via
commitment_date)`, recent decisions, patterns, external entities,
pending approvals; time-window queries; `PRIMING_TTL_SECONDS` caching.
`recencyScore` (`coe/keywords.ts:74`) makes retrieval recency-aware.

### §G — Degraded-mode patterns exist at app layer (not Foundation-canonical)

`otzar.service.ts`: `NULL_ROLE_TEMPLATE_FALLBACK`, tolerant orgless
resolution, `degradedClose` path, `FALLBACK` topic extraction. →
graceful degradation is established practice but lives in the Otzar
app, NOT canonicalized as a Foundation/COSMP contract (PERS.4
canonicalizes).

### §H — Personalization capsule taxonomy partially canonical

CapsuleType enum: `PREFERENCE`, `DEVICE_DATA`, `SESSION_LEARNING`,
`BEHAVIORAL_PATTERN`, `IDENTITY`, `DOMAIN_KNOWLEDGE`, `FOUNDATIONAL`,
etc. → stable/dynamic/ephemeral taxonomy mapping needs explicit
canonicalization (see §Decision §7).

### §I — Missing substrate (GREENFIELD/PARTIAL)

- moment-context resolver (location/active-app/current-task/calendar-
  proximity/device) — GREENFIELD (no location/geo/active-app/device
  fields anywhere)
- 4-tier permission envelope abstraction — PARTIAL (capsule-level
  Permission exists; no domain-level integration-permission envelope)
- Foundation-tier degraded/uncertainty contract — PARTIAL (Otzar app
  degrades; Foundation does not canonicalize)
- high-level `buildPersonalizedWorkingSet` API — PARTIAL (COE
  assembleContext close but takes only `{ip_address}` context)
- cross-context (personal↔enterprise) scoped-authorization workflow —
  PARTIAL (EntityMembership + Permission + SHARE/REVOKE exist; no
  canonical personal-DMW-assists-enterprise-with-scope workflow)
- personalization-signal recording with provenance — GREENFIELD
- `preferred_name` / `pronouns` / `locale` on EntityProfile —
  GREENFIELD (PERS.2 disposition)

## Decision

NIOV Foundation canonicalizes **Foundation/COSMP personalization-
orchestration** at substrate-architectural register substantively as
follows.

### §1 — Foundation-owned governed working-set construction

The Foundation/COSMP constructs the governed working set. The
existing COE `assembleContext` (§A) is the canonical constructor; the
personalization arc extends it with moment context + permission
envelope. The LLM/agent runtime receives scoped working sets only.

### §2 — API/tool-mediated access, not raw DB access

Apps and agents reach the Foundation through scoped API/tool entry
points (the existing route layer + the new high-level orchestrator at
§9). Raw database/capsule access is never exposed to apps or the LLM.

### §3 — Otzar/app-owned UX and consent screens

Otzar and other apps own the conversational UX, task workflows,
user-facing consent screens, and integration onboarding. Apps compose
UX over the Foundation-built working set.

### §4 — LLM/agent runtime receives scoped working sets only

The LLM reasons over the scoped working set, may ask COSMP for
additional scoped context, and proposes actions — but never bypasses
Foundation policy and never scans raw memory.

### §5 — Dynamic personalization from stable + dynamic + ephemeral signals

Personalization is constructed from stable signals (identity,
durable preferences), dynamic signals (behavioral patterns, session
learning, task/project context), and ephemeral signals (moment
context: time, location, active app, task, device, calendar
proximity). See §7 taxonomy.

### §6 — Permission-aware but not permission-fragile

The Foundation supports optimal/degraded/safe-minimal personalization
across the 4-tier permission matrix (§Permission Matrix). Missing
context produces graceful degradation + uncertainty disclosure, NOT
hallucinated specificity.

### §7 — Personal/enterprise DMW boundaries non-negotiable; no silent bridging

Personal and enterprise DMW boundaries remain non-negotiable per
ADR-0001 + ADR-0046 dual-context routing. No silent cross-context
bridging: personal-DMW data may assist enterprise work and vice versa
ONLY with explicit scoped authorization (§Enterprise vs Personal
Governance).

### §8 — Moment-context only when permissioned

Moment context may include time, location, active app/session, task,
device, calendar proximity, and local relevance — only when
permissioned per the 4-tier matrix. Denied permissions degrade
gracefully.

## Permission Matrix

Per Q-PERS-γ γ-1, four canonical permission tiers:

### Tier 1 — Required substrate data

Minimum for safe Foundation function: `entity_id`, `wallet_id`,
`entity_type`, `wallet_type`/context, role/context (enterprise),
permission scope, audit state, session/request actor, timezone/locale
where available, memory-access policy. **Substrate**: LIVE (Entity +
Wallet + Session + TAR + EntityProfile.timezone + clearance_ceiling).

### Tier 2 — Accuracy-enhancing data

Improves personalization: name/preferred_name, location/approximate
location, calendar, contacts/team graph, work apps/tasks/projects,
email/communication metadata, files/folders, device context, routine
patterns, conversation preferences, role/responsibility context.
**Substrate**: PARTIAL (name + role + EntityMembership team graph +
PREFERENCE/BEHAVIORAL_PATTERN capsules LIVE; location/calendar/
contacts/email/device/active-task GREENFIELD).

### Tier 3 — Optional enrichment data

High-value but sensitive: health/wellness, financial/spending,
browsing/research history, smart home, mobility/commute, social
preferences, local environment/weather. **Substrate**: health gated
by `health_data_consent`; rest GREENFIELD (permission grants in
`conditions` JSON).

### Tier 4 — Denied/unavailable permissions

Required behavior: degrade gracefully; disclose uncertainty where
relevant; do NOT hallucinate missing context; do NOT infer across
forbidden contexts; request permission only when needed; audit
denied/missing context where policy requires. **Substrate**: app-
layer degradation exists; Foundation-tier contract GREENFIELD (PERS.4).

## Personalization Capsule Taxonomy

Per Q-PERS-η η-1, stable/dynamic/ephemeral mapping:

- **Stable** — `IDENTITY`, `PREFERENCE`, `FOUNDATIONAL`,
  `DOMAIN_KNOWLEDGE`. Durable; rarely changes; FOUNDATIONAL never
  decays (ADR-0044) and is never budget-counted (§A step 4).
- **Dynamic** — `BEHAVIORAL_PATTERN`, `SESSION_LEARNING`,
  `DEVICE_DATA`, and `DOMAIN_KNOWLEDGE` where project/task-specific.
  Subject to decay (ADR-0044) + staleness detection (ADR-0045).
- **Ephemeral** — moment-context inputs (active session, current
  task, current location/time/calendar/device signals). NOT durable
  unless recorded through explicit `recordPersonalizationSignal`
  policy (§9). Ephemeral signals are working-set construction INPUTS,
  not stored capsules, unless promoted via explicit provenance-
  recorded signal.

**Schema disposition**: whether ephemeral moment-context requires NEW
schema fields or fits in `Session` / `Permission.conditions` JSON +
capsule-based recording is **deferred to PERS.2**. Default posture:
prefer conditions-JSON + capsule-based (no schema delta) where
possible.

## Foundation / API / Otzar / LLM Boundary

- **Foundation/COSMP** owns policy, working-set construction,
  retrieval, permission enforcement, audit, capsule orchestration.
- **API/tool layer** exposes scoped entry points + validation +
  rate-limit/auth; no raw DB; no LLM permission decisions.
- **Otzar/app layer** owns UX, chat flow, consent UI, integration
  onboarding.
- **LLM/agent runtime** reasons over scoped working sets and proposes
  actions; never bypasses Foundation policy; never scans raw memory.

## Hybrid API Strategy

Per Q-PERS-δ δ-3, a high-level orchestrator endpoint composes the
primitives server-side in one round trip (avoiding bottleneck-prone
chains of calls), with reusable internal primitives:

- **`buildPersonalizedWorkingSet(actor, wallet_context, task,
  moment_context)`** — the canonical high-level app entry point;
  wraps COE assembleContext + moment context + permission envelope;
  one round trip at moment-of-ask.
- **`resolveMomentContext(actor, session, permissions)`** — resolves
  time (LIVE) + location/calendar/device (permissioned); cacheable
  with TTL.
- **`resolvePermissionEnvelope(actor, domain, requested_context)`** —
  maps the 4-tier permission matrix; reads OrgSettings +
  Permission.conditions.
- **`retrieveRelevantCapsules(actor, task, policy, filters)`** —
  EXISTS as COE assembleContext; extend signature with moment context.
- **`summarizeScopedCapsules(actor, target, purpose)`** — SUMMARY-
  scope cross-entity summary (ADR-0046 dual-context safe).
- **`requestCrossEntityContext(actor, target_entity, purpose)`** —
  personal↔enterprise scoped bridge; explicit Permission + audit
  (prefer reuse of SHARE/REVOKE + Permission bridge).
- **`proposeMemoryUpdate(actor, capsule_id, patch, reason)`** —
  EXISTS as write.service mutation discrimination (ADR-0042).
- **`recordPersonalizationSignal(actor, signal, provenance)`** —
  writes PREFERENCE/BEHAVIORAL_PATTERN capsule with provenance.
- **`explainContextUsed(response_id)`** — audit-backed working-set
  explanation (auditability requirement).
- **`degradeWhenContextMissing(actor, missing_permissions)`** —
  Foundation-tier degraded contract.

**Design principles**: DMW/domain-locality + caching (precedent:
`WalletCache` ETS + `PRIMING_TTL_SECONDS` + DMWWorker per-entity
locality from ADR-0038/0039). Moment context + permission envelope
cached per-session with short TTL; capsule retrieval stays live for
freshness. Deeper optimization deferred until measured (Q-PERS-ι ι-3).

## Audit-Literal Proposals

Per Q-PERS-θ θ-2, the following audit literals are **proposed but not
implemented at PERS.1** (implementation deferred to a later clean-
transition phase per ADR-0042 §Q-γ.1 discipline; final literal names
may be refined):

- `WORKING_SET_BUILT`
- `CONTEXT_USED_MANIFEST_RECORDED`
- `PERSONALIZATION_DEGRADED`
- `CROSS_ENTITY_CONTEXT_REQUESTED`
- `PERSONALIZATION_SIGNAL_RECORDED`

## TurboQuant Disposition

Per Q-PERS-κ κ-1, TurboQuant / TurboQuant-like structures are
**future research only**. Relevant to KV-cache compression, vector
search, embedding compression, local/edge inference, and high-
concurrency agent orchestration. NOT a dependency of the current
personalization substrate. Do NOT adopt until measured bottlenecks
justify it (ADR-0016 Pin-and-Optimize measure-first discipline).
Preserve the ADR-0043 embedding-PII caution (Q-G3-ζ): embeddings are
source-content-derived PII inside the same trust boundary; any future
quantization layer must preserve auditability + privacy guarantees.

## Privacy-Policy Implications

Per Q-PERS-λ λ-1:

- **Baseline data for safe service**: Tier 1 required substrate data
  is the minimum for safe Foundation function.
- **Permissioned integrations for optimal personalization**: Tier 2 +
  Tier 3 data is opt-in, scoped, revocable.
- **Personal vs enterprise governance distinction**: personal DMW is
  user-consent-governed outside the enterprise domain; enterprise DMW
  is admin-policy-governed inside the enterprise domain.
- **Enterprise admin policy inside enterprise domain**: OrgSettings
  defaults govern workspace behavior; enterprise cannot govern
  personal-life context outside the enterprise domain.
- **Personal DMW user consent outside enterprise domain**: individual
  grants/revokes; personal routines/preferences do not auto-flow to
  enterprise.
- **No silent cross-context bridging**: cross-context assistance
  requires explicit scoped authorization + audit.
- **Transparency around degraded behavior**: when permissions are
  denied, the Foundation discloses uncertainty rather than
  hallucinating specificity.

## Adversarial Threat Model

| # | Threat | Current protection | Gap | Severity |
|---|---|---|---|---|
| **TP1** | Personal routine leaks into enterprise working set | Per-wallet scoping in COE; ADR-0001 cross-wallet prevention | Moment-context enrichment must not bypass wallet scope | HIGH |
| **TP2** | Enterprise data leaks into personal context | Same per-wallet scoping | Cross-entity summary primitive must enforce SUMMARY scope + audit | HIGH |
| **TP3** | Location/calendar permission-denied → hallucinated context | Otzar app degrades; Foundation does not canonicalize | Foundation-tier degraded contract + uncertainty disclosure (PERS.4) | HIGH |
| **TP4** | LLM attempts raw memory bypass | Enforced by construction (LLM never queries DB; COE gates) | none — preserve invariant | LOW |
| **TP5** | Confused-deputy chain-of-agent overreach | ADR-0046 (AI cannot grant to AI, ai_capped, sovereignty caps, isRestrictedAiClass) | Orchestration chain extends deputy surface; re-validate at each hop | MEDIUM |
| **TP6** | Personalization-signal poisoning (adversarial preference injection) | write.service mutation discrimination (ADR-0042) + audit | recordPersonalizationSignal needs provenance + validation | MEDIUM |
| **TP7** | Stale moment context (cached location/calendar serves wrong moment) | staleness detection (ADR-0045) for capsules; moment-context cache GREENFIELD | TTL discipline + staleness disclosure for moment context | MEDIUM |
| **TP8** | Deanonymization via preference inference defeating jurisdiction tagging | jurisdiction tagging (ADR-0037) | personalization inference must respect jurisdiction boundaries | MEDIUM |
| **TP9** | API bottleneck from chained calls degrades availability | WalletCache + priming TTL precedent | high-level orchestrator + caching (§9) | MEDIUM |
| **TP10** | Audit gap: cannot reconstruct why context was exposed | audit chain (ADR-0002) + ai_capped + entity_type | NEW working-set/context-used/degradation audit literals (§Audit-Literal Proposals) | MEDIUM-HIGH |
| **TP11** | Synthetic DMW simulation fails to detect cross-context leak | none yet (PERS.5 GREENFIELD) | simulation harness must include adversarial cross-context fixtures | MEDIUM |
| **TP12** | TurboQuant/compression changes semantic retrieval without auditability | none (deferred) | if adopted later, must preserve audit + PII guarantees per ADR-0043 | LOW (deferred) |

**Net**: no code-tier vulnerability in the existing governed-retrieval
substrate. The HIGH-severity threats (TP1/TP2/TP3) are about the NEW
moment-context + degraded-mode + cross-context surfaces that do not
exist yet — which is why the substantive mini-arc (PERS.2-PERS.6) must
canonicalize them before app/UI consumption.

## Sub-decisions

- **Q-PERS-α α-1**: ADR docs-only first (this PERS.1 commit).
- **Q-PERS-β β-1** (with β-3 framing): Foundation owns governed
  working-set construction; apps compose UX.
- **Q-PERS-γ γ-1**: required/recommended/optional/denied permission
  matrix (§Permission Matrix).
- **Q-PERS-δ δ-3**: hybrid high-level `buildPersonalizedWorkingSet` +
  COSMP primitives (§Hybrid API Strategy).
- **Q-PERS-ε ε-1**: integration-test simulation harness with 10
  scenarios before demo/UI theater (PERS.5).
- **Q-PERS-ζ ζ-1**: location/time first-class moment context with
  permission tiers (§8 + §Permission Matrix).
- **Q-PERS-η η-1**: stable/dynamic/ephemeral personalization-capsule
  taxonomy (§Personalization Capsule Taxonomy).
- **Q-PERS-θ θ-2**: NEW audit literals proposed for working-set
  construction / context-used / degradation; implementation deferred
  to later clean-transition phase (§Audit-Literal Proposals).
- **Q-PERS-ι ι-1** (with measure-first ι-3 framing): local/domain-
  scoped working-set builder with caching; deeper optimization
  measure-first.
- **Q-PERS-κ κ-1**: TurboQuant future research arc only (§TurboQuant
  Disposition).
- **Q-PERS-λ λ-1**: privacy-policy implications included (§Privacy-
  Policy Implications).

## Consequences

### Positive

- Canonical Foundation-owned governed personalization-orchestration
  substrate; the LLM never decides what it sees.
- Permission-aware-but-not-fragile across the 4-tier matrix.
- Personal/enterprise DMW boundary + no-silent-leakage preserved.
- Patent-implementation evidence trail (ADR-0020) extended to the
  personalization-orchestration tier for enterprise/government
  procurement.
- Builds on existing substrate (COE + EntityProfile + OrgSettings +
  TwinConfig + Permission + Otzar priming + CapsuleType taxonomy) —
  extension, not greenfield rewrite.

### Negative

- 5-sub-phase substantive follow-on (PERS.2-PERS.6) including possible
  schema delta (PERS.2) + new high-level API (PERS.3) + degraded
  contract (PERS.4) + simulation harness (PERS.5) + audit literals
  (PERS.6). Founder authorization required at every sub-phase.
- Moment-context (location/calendar/device) introduces HIGH-
  sensitivity PII surfaces requiring careful permission + audit
  discipline.

### Neutral

- Runtime substrate unchanged at PERS.1 (docs-only).
- TurboQuant deferred; no compression dependency.
- Sub-arc 2 + all per-gap ADRs preserved Accepted/CLOSED.

## Alternatives Considered

- **App-layer personalization (β-2)** — REJECTED. Founder directive:
  the Foundation, not the app, must construct the governed working
  set; the LLM must not decide what it sees.
- **Static personalization** — REJECTED. Personalization changes by
  moment, location, role, task, permission state; dynamic
  personalization is the Founder directive.
- **High-level API only / primitives only (δ-1 / δ-2)** — REJECTED in
  favor of hybrid δ-3 (orchestrator + primitives) to balance one-
  round-trip app ergonomics with reusable internals.
- **Defer / SKIP** — REJECTED. Production-critical Founder framing +
  real GREENFIELD gaps + HIGH-severity TP1/TP2/TP3 threats.
- **Adopt TurboQuant now (κ-3)** — REJECTED. No measured bottleneck;
  ADR-0016 measure-first discipline; embedding-PII caution.

## References

### Foundation RULES

- RULE 0 + RULE 10 + RULE 11 + RULE 12 + RULE 13 + RULE 20 + RULE 21
  at `CLAUDE.md` §3 RULES.

### Foundation ADRs

- ADR-0001 (Three-wallet architecture; personal/enterprise DMW
  boundary; §Amendment 1 dual-context AI_AGENT)
- ADR-0002 (Append-only audit chain; audit-literal proposals build on
  this)
- ADR-0011 §Amendment (three-tier test stratification; PERS.5
  simulation lands at integration tier)
- ADR-0016 (Pin-and-Optimize; measure-first discipline for TurboQuant
  deferral)
- ADR-0020 (Two-register IP discipline; patent-implementation evidence
  trail)
- ADR-0022 (combined_score formula; COE scoring at §A step 3)
- ADR-0033 §Decision 7 (cross-language data ownership; BEAM locality
  reuse)
- ADR-0036 (REGULATOR per-request indexed point-lookup; WalletLookup
  pattern for permission envelope)
- ADR-0037 (Jurisdiction tagging; personalization inference must
  respect jurisdiction boundaries per TP8)
- ADR-0038 + ADR-0039 (DMWWorker + Horde + WalletCache; local/domain-
  scoped builder locality + caching precedent)
- ADR-0042 (Capsule mutation discrimination; proposeMemoryUpdate +
  clean-transition discipline for audit-literal expansion)
- ADR-0043 (pgvector embedding; embedding-PII caution preserved for
  TurboQuant deferral; G3.9 J5-J8 privacy proofs)
- ADR-0044 (Decay execution formalization; dynamic-capsule decay)
- ADR-0045 (Capsule-level staleness detection; stale-moment-context
  discipline per TP7)
- ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing; dual-
  context + confused-deputy mitigations + cross-context safety)
- ADR-0047 (Post-Gap-3 production-readiness hardening)
- ADR-0041 (Capsule Layer Substrate Umbrella; Sub-arc 2 closed parent)

### Research arc sources (retrieved 2026-05-19; Hawkseye)

- Context engineering + agent memory: OpenAI Cookbook context-
  personalization; Mem0 State of AI Agent Memory 2026; Supermemory
  context-engineering guide; Taskade context-engineering field guide
- Permission-aware + privacy-preserving personalization: Puda
  arXiv:2602.08268; ACM 2025 Aligning Personalized AI Agents with
  Users' Privacy Preference; VERTU enterprise data-security 2026;
  SparkCo personal-AI-agent 2026
- Enterprise governance + orchestration + MCP: AetherLink enterprise
  orchestration guide 2026; OneReach MCP multi-agent; Atlan multi-
  agent orchestration; FifthRow April 2026 enterprise orchestration
  playbook
- Confused-deputy (orchestration tier): Cloud Security Alliance +
  HashiCorp + Quarkslab + BeyondTrust (ADR-0046 §RS-G6-2 extension)
- TurboQuant: Google DeepMind ICLR 2026 arXiv:2504.19874; InfoQ
  TurboQuant compression 2026

### Patent references

- US 12,517,919 (COSMP; 7-layer Memory Capsule; governed working-set
  construction is COSMP-canonical)
- US 12,164,537 + US 12,399,904 (DMW + Foundation primitives;
  personal/enterprise DMW boundary)

## Founder Authorization

Founder authorization explicit at PERS.1 docs-only ADR landing per
RULE 20 at:

- `[COSMP-PERSONALIZATION-ORCHESTRATION-SUBSTRATE-HAWKSEYE]`
- `[COSMP-PERSONALIZATION-ORCHESTRATION-QLOCK]`
- `[COSMP-PERSONALIZATION-PERS.1-EXECUTE-VERIFY-AUTH]`

Founder authorization explicit at PERS.6 closure cascade (Status flip
Proposed → Accepted; this ADR edit + the CLAUDE.md §5 catalog status-sync
authorized per RULE 20) at:

- `[COSMP-PERSONALIZATION-CLOSURE-HAWKSEYE-QLOCK]`
- `[COSMP-PERSONALIZATION-CLOSURE-EXECUTE-VERIFY-AUTH]`

## Post-Closure Implementation Lineage

Reconciled to landed reality per RULE 13 (the pre-closure table's
"authorized scope" column was aspirational; several items diverged from
what shipped — notably PERS.3 wraps `assembleContext` rather than
extending its signature, and PERS.5 became a 3-sub-phase mini-arc).

| Sub-phase | Tag | Landed scope | Commit |
|-----------|-----|--------------|--------|
| PERS.1 | `[COSMP-PERSONALIZATION-ADR]` | docs-only ADR-0048 NEW Proposed; canonical personalization-orchestration model; RULE 21 Hawkseye research arc; 4-tier permission matrix; stable/dynamic/ephemeral taxonomy; Foundation/API/Otzar/LLM boundary; hybrid API strategy; audit-literal proposals; TurboQuant deferral; privacy-policy implications; 12-row threat model; 11 Q-PERS sub-decisions | `ce3a6a5` |
| PERS.2 | `[COSMP-PERMISSION-ENVELOPE-MOMENT-CONTEXT]` | NEW `temporal-personalization.ts` (5 temporal classes) + `permission-envelope.service.ts` (`resolvePermissionEnvelope`, 4-tier) + `moment-context.service.ts` (`resolveMomentContext`, injected `now`); no schema delta (caller-supplied / conditions-JSON); no new audit literals | `2fe7bfb` |
| PERS.3 | `[COSMP-BUILD-WORKING-SET-API]` | NEW `working-set.service.ts` — `WorkingSetService.buildPersonalizedWorkingSet` **wraps** COE `assembleContext` (no signature change; via the `ContextAssembler` seam); domain READ from established `wallet_type`; **no caching**; service-level only (no route) | `8c16c14` |
| PERS.4 | `[COSMP-DEGRADED-MODE-CONTRACT]` | NEW `degraded-mode-contract.ts` (13-reason `DegradedReason` taxonomy + `DISCLOSURE_POLICY` + `CONSUMER_OBLIGATIONS` + `buildDegradedContract`); integrated into the working set; audience-tier doctrine; no new audit literals | `d0980ce` |
| PERS.5a | `[COSMP-SYNTHETIC-DMW-VIEWS]` | NEW production `SessionContextResolver` (`createSessionContextResolver` + `prismaWalletContextLookup`) + `projectConsumerView`/`projectAdminView` (consumer/admin projection split) | `d28f20f` |
| PERS.5b | `[COSMP-SYNTHETIC-DMW-SIMULATION]` | lifelike multi-DMW integration harness: **5 employees + 5 digital twins + 1 enterprise DMW + project source-of-truth**; accepted→SoT fixture convention; scoped-summary + SUMMARY-scope NEGOTIATE alignment; **single-wallet spine**; all 8 obligations proven across **S1–S10** scenarios | `27db2e2` |
| PERS.5c | `[COSMP-SYNTHETIC-DMW-CLOSURE]` | docs-only closure of the PERS.5 mini-arc | `8ad41fe` |
| PERS.6 | `[COSMP-PERSONALIZATION-CLOSURE]` | docs-only closure cascade; Status Proposed → Accepted; Sub-Arc 3 CLOSED; **audit literals deferred** (forward-substrate, not implemented); no ADR-0035 promotion; catalog status-sync | this commit |

Status flipped from `Proposed 2026-05-19` to **`Accepted 2026-05-20`** at
PERS.6 closure cascade canonical at canonical-state register substantively.
Phase 3 Sub-Arc 3 is **CLOSED 2026-05-20**. Sub-arc 2 + all per-gap ADRs
preserved Accepted/CLOSED. **Phase 3 global status is NOT flipped** — all
Phase 3 sub-arcs are now CLOSED (the global-closure prerequisite is met), but
Phase 3 global closure requires a separate explicit Founder QLOCK. The five
proposed audit literals (`WORKING_SET_BUILT` + `CONTEXT_USED_MANIFEST_RECORDED`
+ `PERSONALIZATION_DEGRADED` + `CROSS_ENTITY_CONTEXT_REQUESTED` +
`PERSONALIZATION_SIGNAL_RECORDED`) remain forward-substrate per §Audit-Literal
Proposals (deferred to a clean-transition phase; not implemented at closure).
