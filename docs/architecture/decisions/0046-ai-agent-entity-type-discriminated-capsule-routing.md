# ADR-0046: AI_AGENT EntityType-Discriminated Capsule Routing (Sub-arc 2 Gap 6)

## Status

Accepted 2026-05-19

## Context

Phase 3 (Dynamic Memory Accuracy at Scale) Sub-arc 2 Gap 6
canonicalized at substrate-architectural register substantively per
ADR-0041 §Sub-decision 6 (AI_AGENT EntityType-Discriminated Capsule
Routing per optional ADR-0046). G6.1 `[BEAM-CAPSULE-ROUTING-ADR]` is
the canonical first sub-phase per Founder Q-G6-α α-1 LOCK at
`[BEAM-CAPSULE-ROUTING-G6-QLOCK]` register substantively.

This ADR canonicalizes the **dual-context AI_AGENT routing model** at
substrate-architectural register substantively for the Foundation
capsule layer. AI_AGENT is canonical at **EntityType** register
substantively (actor identity per RULE 0); AI_AGENT is **NOT** a
WalletType value. PERSONAL and ENTERPRISE are wallet/storage/
governance contexts. AI_AGENT may route to either PERSONAL or
ENTERPRISE wallet context depending on deployment/use context per
Founder dual-context correction at `[BEAM-CAPSULE-ROUTING-G6-FOUNDER-
CORRECTION]` register substantively.

The runtime substrate at HEAD `5fcdbde` (G5.4) **already supports
both contexts** via two canonical context-resolution signals: (a)
explicit `wallet_type` override in `createEntity` input (twin
onboarding path), and (b) `defaultWalletTypeFor(AI_AGENT) =
ENTERPRISE` defensive fallback for bare AI_AGENT creates without
explicit context. The missing production artifact is canonical
dual-context documentation + test-anchored governance semantics — not
runtime code at G6.1.

### Research arc (RULE 21 pre-authorization research at canonical-knowledge register substantively)

Per RULE 21 substantive register pre-authorization research arc at
canonical-knowledge register substantively, 4 research streams
canonical at canonical-knowledge register substantively informed
this ADR (retrieved 2026-05-19):

- **RS-G6-1: Agent identity vs storage/account separation.** 2026
  industry direction (Microsoft Entra Agent ID, Okta AI Agents in
  Universal Directory, Google Vertex AI Agent Identity) models AI
  agents as first-class identity principals distinct from service
  accounts and human users. NIOV's `EntityType.AI_AGENT` aligns at
  the identity-principal register substantively. Memory-scope tagging
  (user_id + agent_id + run_id + session_id + app_id + org_id) is
  the emerging best-practice for multi-scope memory isolation.

- **RS-G6-2: Confused-deputy in agentic systems.** The classical
  confused-deputy access-control vulnerability has re-emerged as a
  high-severity threat pattern in 2026 AI agent deployments per
  Cloud Security Alliance + HashiCorp + Quarkslab + BeyondTrust
  literature. MCP server design, memory-as-trusted-context features,
  and multi-agent input chains are the canonical attack surfaces.
  NIOV's `isRestrictedAiClass`, `ai_capped`, `ai_access_blocked`,
  `requires_validation`, AI-cannot-grant-to-AI, AI-cannot-raise-AI-
  ceiling, and AI-FULL-scope-silent-cap-to-SUMMARY substantively
  implement the canonical confused-deputy mitigations.

- **RS-G6-3: Enterprise/government AI-agent auditability.** Per
  Atlan + IBL + BigID + MarkTechPost research, federal and SOC 2
  compliance requirements canonical at 2026 register substantively
  demand: every AI agent interaction logged, attributed, exportable
  for FOIA/IG investigations; column-level lineage for provenance;
  active metadata for freshness signals; decision traces for audit
  trails; chain-of-custody logging at autonomous-operation register.
  NIOV's audit chain + RULE 4 + RULE 10 + SYSTEM_PRINCIPALS + canonical_
  record + jurisdiction tagging substantively delivers this register
  substantively at canonical-execution register.

- **RS-G6-4: NIST AI Agent Standards Initiative + capability-token
  patterns.** February 2026 NIST Center for AI Standards and
  Innovation launched the AI Agent Standards Initiative canonical at
  canonical-knowledge register substantively. Federal direction:
  zero-trust principles for agent authorization; least-privilege
  task-scoped capability tokens; short-lived expiring tokens;
  task-scoped (not deployment-scoped) permissions; action-level
  approvals for high-impact decisions; chain-of-custody logging for
  autonomous operations. SP 800-53 control overlays in development.
  NIOV's Permission + Session + TAR + audit chain + bridge_id pattern
  substantively maps to this family at canonical-architectural
  register substantively.

Research sources verified at canonical-knowledge register
substantively are listed in §References RS-G6-1 through RS-G6-4
below.

## Governing RULES

- **RULE 0** (Humans Always Sovereign): AI_AGENT routing must not
  silently expand authority; AI_AGENT cannot grant access to other
  AI_AGENT entities; AI_AGENT memory cannot become a backdoor into
  human/company/regulator memory; explicit human/entity recall and
  override must remain possible; AI entities have lower default
  permission ceilings than humans.
- **RULE 10** (Nothing is ever deleted): AI_AGENT capsule operations
  preserve `deleted_at` soft-delete discipline; AI_AGENT cannot
  trigger hard-delete; revocation paths must preserve audit row
  permanence.
- **RULE 11** (Prisma/Ecto cross-language ownership boundary):
  AI_AGENT canonical at EntityType register substantively per
  Prisma-owned `EntityType` enum at `packages/database/prisma/schema.
  prisma`; Ecto schemas at `apps/cosmp_router/lib/cosmp_router/
  schemas/` provide read-only projection; BEAM observer-only at G6.1.
- **RULE 12** (pre-flight grep before drafting): substrate-state
  ground truth verified at HEAD `5fcdbde` register substantively;
  all anchor citations grep-confirmed pre-authorization.
- **RULE 13** (surface drift inline): substrate-honest drift between
  prior ADR/glossary/Elixir-docstring prose (which collapses to
  single-default-only claims) vs runtime dual-context substrate is
  surfaced canonical at §RULE 13 substrate-honest drift surfaces
  below; correction lands at G6.2 doc-and-test cascade.
- **RULE 20** (Founder-only RULE/ADR modification): Founder
  authorization explicit at G6.1 substantive landing per
  `[BEAM-CAPSULE-ROUTING-G6-QLOCK]` + `[BEAM-CAPSULE-ROUTING-G6.1-
  EXECUTE-VERIFY-AUTH]`.
- **RULE 21** (current-source research before substrate-architectural
  pastes): research arc embedded at §Context above; 4 research
  streams (RS-G6-1 through RS-G6-4) retrieved 2026-05-19 canonical
  at canonical-knowledge register substantively.

## Decision

NIOV Foundation lands the **canonical dual-context AI_AGENT routing
model** at substrate-architectural register substantively, with the
following four canonical patterns:

### Personal AI Agent context

- **EntityType** = `AI_AGENT`
- **WalletType / governance context** = `PERSONAL`
- **EntityMembership** parent = `PERSON` owner, child = `AI_AGENT`
  entity
- **NIOV content access** = `niov_can_access_contents = true` per
  `defaultNiovAccessFor(PERSONAL)` canonical at
  `packages/database/src/queries/wallet.ts:68-70` register
  substantively
- **Use cases**: digital twin of an individual employee per ADR-0001
  design intent; personal AI agent of a non-enterprise user; AI
  assistant under individual sovereignty
- **GDPR Article 20 portability**: preserved (PERSONAL wallet is
  portable per ADR-0001 §Decision substantively)
- **Anchor (live in code at HEAD `5fcdbde`)**:
  `apps/api/src/services/governance/twin.service.ts:189-191` explicit
  `wallet_type: "PERSONAL"` override in `createWalletInTx` call

### Enterprise AI Agent context

- **EntityType** = `AI_AGENT`
- **WalletType / governance context** = `ENTERPRISE`
- **EntityMembership** parent = `COMPANY` / organization / agency,
  child = `AI_AGENT` entity
- **NIOV content access** = `niov_can_access_contents = false` per
  `defaultNiovAccessFor(ENTERPRISE)` canonical (RULE 0 maximum-human-
  control default)
- **Use cases**: forward-substrate product surface for autonomous AI
  agents owned by an enterprise/organization/agency; government
  AI-agent deployments under organizational sovereignty; multi-agent
  enterprise systems
- **Defensive infrastructure**: live via `defaultWalletTypeFor(AI_
  AGENT) = ENTERPRISE` fallback; no current product code path
  creates Enterprise AI Agent entities (no public route exposes this
  flow at HEAD `5fcdbde`)
- **Anchor (defensive fallback at HEAD `5fcdbde`)**:
  `packages/database/src/queries/wallet.ts:39-58` `defaultWalletTypeFor`
  switch case `AI_AGENT → ENTERPRISE` with explicit RULE 0 comment

### Defensive fallback (canonical pattern)

`defaultWalletTypeFor(AI_AGENT) = ENTERPRISE` is the canonical RULE 0
defensive fallback for bare `createEntity({entity_type: "AI_AGENT"})`
calls that do NOT pass an explicit `wallet_type` override. The
fallback preserves RULE 0 by avoiding accidental PERSONAL/human-
authority assumptions for AI agent entities created outside the
canonical Personal AI Agent (twin) onboarding flow. The fallback is
**not** universal AI_AGENT routing — it is the safe default when
context is ambiguous.

### Canonical context-resolution signals

The runtime substrate uses two canonical signals to resolve AI_AGENT
routing context:

1. **Explicit `wallet_type` override** in `CreateEntityInput`
   (canonical for Personal AI Agent / twin pattern; used by
   `twin.service.ts:189-191`).
2. **EntityMembership parent/child relationship** (canonical for
   inferring context: `parent=PERSON` → Personal AI Agent; `parent=
   COMPANY` → Enterprise AI Agent).
3. **Defensive fallback** via `defaultWalletTypeFor(AI_AGENT) =
   ENTERPRISE` when no explicit override and no EntityMembership
   context is available at create-time (i.e., bare API-level
   `createEntity` calls).

Capsule-level routing then resolves via `wallet_id` (FK to Wallet,
which carries `wallet_type`) + `entity_id` (FK to Entity, which
carries `entity_type`) + `created_by` (write attribution) +
`connected_entity_ids` (subject/relation references). RULE 0 flags
(`ai_access_blocked`, `requires_validation`, `clearance_required`)
apply uniformly to AI_AGENT operations regardless of wallet context.

## Sub-decisions

### Sub-decision 1 — Q-G6-α α-1 LOCK: docs-only ADR-0046 first

Per Founder Q-G6-α α-1 LOCK at `[BEAM-CAPSULE-ROUTING-G6-QLOCK]`
register substantively, G6.1 lands ADR-0046 NEW Proposed as
canonical docs-only ADR. Substantive code lands at later sub-phases
(G6.2 doc-and-test cascade lands TS dual-context tests + Elixir
docstring corrections + ADR/glossary cascade per RULE 14). G6.3
substantive `resolveAiAgentWalletContext` helper canonical at
DEFERRED forward-substrate disposition per Founder Q-G6-δ δ-1 LOCK +
G6.3 disposition LOCK register substantively.

### Sub-decision 2 — Q-G6-β β-1 LOCK: dual-context routing canonical

Per Founder Q-G6-β β-1 LOCK, AI_AGENT routes to either PERSONAL or
ENTERPRISE wallet context depending on deployment/use context. Hard-
mapping to a single WalletType (β-4 ENTERPRISE-only or β-5 PERSONAL-
only) is REJECTED canonical at canonical-architectural register
substantively per Founder dual-context correction at `[BEAM-CAPSULE-
ROUTING-G6-FOUNDER-CORRECTION]` register substantively. Schema
discriminator (β-3 `capsule_routing_context` enum) is DEFERRED to
forward-substrate at γ-2 disposition register substantively per Sub-
decision 3 below.

### Sub-decision 3 — Q-G6-γ γ-1 LOCK: no schema changes at G6.1

Per Founder Q-G6-γ γ-1 LOCK, no schema changes land at G6.1.
`EntityMembership` parent/child relationship + explicit `wallet_type`
override in `CreateEntityInput` are the canonical context-resolution
signals; no NEW schema field is required. γ-2 (NEW
`capsule_routing_context` enum) + γ-3 (NEW `actor_entity_type` +
`acting_on_behalf_of_entity_id`) + γ-4 (NEW `owner_entity_type` +
`subject_entity_type` denormalized) are DEFERRED to forward-substrate
disposition; future Founder-authorized ADR amendment may evaluate
schema discriminator after G6.2 doc-and-test cascade lands and
test-coverage gaps surface (if any).

### Sub-decision 4 — Q-G6-δ δ-1 LOCK: no TS code at G6.1

Per Founder Q-G6-δ δ-1 LOCK, no TypeScript code changes at G6.1.
G6.2 doc-and-test cascade lands NEW dual-context TS unit tests + 3
Elixir module docstring corrections + ADR-0001/0039/0041 amendments
+ glossary updates + `grpc/server.ex:266` forward-substrate comment
closure + CLAUDE.md catalog updates. G6.3 substantive
`resolveAiAgentWalletContext` helper canonical at DEFERRED forward-
substrate disposition register substantively (δ-3 forward-substrate;
not part of current closure path).

### Sub-decision 5 — Q-G6-ε ε-2 LOCK: BEAM Translator pass-through preserved

Per Founder Q-G6-ε ε-2 LOCK, BEAM Translator pack/unpack at
`apps/cosmp_router/lib/cosmp_router/capsule/translator.ex` already
preserves all routing-critical metadata (RULE 0 flags
`clearance_required` + `ai_access_blocked` + `requires_validation`;
permissions layer `wallet_id` + `entity_id` + `created_by`;
relations layer `connected_entity_ids`). No Elixir code changes at
G6.1. Elixir module docstring corrections at 3 sites canonical at
G6.2 doc-and-test cascade register substantively (forward-substrate
to G6.2):

- `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex` moduledoc
- `apps/cosmp_router/lib/cosmp_router/schemas/wallet.ex` moduledoc
- `apps/cosmp_router/lib/cosmp_router/activity_counter.ex` comment

### Sub-decision 6 — Q-G6-ζ ζ-1 LOCK: existing audit literals suffice at G6.1

Per Founder Q-G6-ζ ζ-1 LOCK, existing audit literals + emission
metadata suffice at G6.1. The `ai_capped` boolean +
`details.entity_type` + `ai_access_blocked` + `requires_validation`
audit emissions canonical at `apps/api/src/services/cosmp/negotiate.
service.ts:625-630` register substantively. No NEW audit literals at
G6.1. ζ-2 (NEW `AI_AGENT_ROUTING_DECISION` literal) is DEFERRED to
forward-substrate disposition; future Founder-authorized ADR
amendment may evaluate after G6.2 test-coverage gaps surface (if
any).

### Sub-decision 7 — Q-G6-η η-2 LOCK: dual-context TS tests at G6.2

Per Founder Q-G6-η η-2 LOCK, TS unit tests proving dual-context
behavior land at G6.2 doc-and-test cascade (forward-substrate). New
test anchors will prove:

- **Bare AI_AGENT direct-create → ENTERPRISE wallet** (existing
  anchor at `tests/unit/wallet.test.ts:73-77`; ensure preserved)
- **Explicit `wallet_type: "PERSONAL"` override on AI_AGENT create
  → PERSONAL wallet** (NEW test anchor at G6.2)
- **Twin onboarding path → PERSONAL wallet via explicit override**
  (existing anchor via dandelion + twin tests; ensure preserved)
- **`niov_can_access_contents` correctly defaults: PERSONAL = true,
  ENTERPRISE = false** (existing anchors at
  `tests/unit/wallet.test.ts` ENTERPRISE + PERSONAL content-access
  rule tests; ensure preserved)
- **`ai_capped` audit metadata preserved across both contexts**
  (extend existing `negotiate -- AI sovereignty` describe block)

### Sub-decision 8 — Q-G6-θ θ-1 LOCK: Gap 6 before Sub-arc 2 closure

Per Founder Q-G6-θ θ-1 LOCK, Gap 6 mini-arc runs BEFORE Sub-arc 2
closure cascade canonical at canonical-state register substantively
per ADR-0041 CL.1 scope patch register substantively. Sub-arc 2
closure cascade lands at separate later commit after G6.4 Gap 6
closure cascade lands canonical at canonical-state register
substantively.

### Sub-decision 9 — Q-G6-ι ι-1 (refined) LOCK: production-blocking at canonicalization tier

Per Founder Q-G6-ι ι-1 (refined) LOCK, Gap 6 is **production-
blocking at the canonicalization tier** (compliance + patent-
implementation evidence per ADR-0020 + CISO/SOC 2 audit
completeness) while runtime substrate is **already production-safe
for both contexts**. The CODE is production-safe at HEAD `5fcdbde`
register substantively; the DOCS are production-blocking for
enterprise/government compliance documentation because ADR-0001
foundational claim ("Digital twins are AI_AGENT entities with their
own Personal DMW") canonical at canonical-prose register
substantively + downstream ADR-0039 + ADR-0041 + 3 Elixir docstrings
+ glossary "Digital Twin Wallet" entry collapse the dual-context
model to single-context-only prose. G6.2 doc-and-test cascade
resolves the canonicalization-tier block.

### Sub-decision 10 — G6.3 DEFERRED disposition

Per Founder G6.3 disposition LOCK at `[BEAM-CAPSULE-ROUTING-G6-
QLOCK]` register substantively, G6.3 `[BEAM-CAPSULE-ROUTING-CONTEXT-
RESOLVER]` substantive `resolveAiAgentWalletContext(entityType,
deploymentContext?) → WalletType` helper is DEFERRED to forward-
substrate disposition. G6.3 is NOT part of the current Gap 6 closure
path. G6.3 may land later if a separate Founder QLOCK explicitly
authorizes it AND G6.2 verification proves unresolved ambiguity at
the wallet-defaulting tier (i.e., bare-AI_AGENT-with-no-explicit-
override-and-no-membership-context flows surface in production code
paths beyond `twin.service.ts`).

## Substrate-State Observations

### §A — Runtime ground-truth anchors at HEAD `5fcdbde`

#### Personal AI Agent (twin) path — LIVE production product flow

`apps/api/src/services/governance/twin.service.ts:182-220` is the
canonical Personal AI Agent creation path. Sequence:

1. `tx.entity.create({data: {entity_id: twinEntityId, entity_type:
   "AI_AGENT", display_name: ..., ...}})` at L180-188.
2. `createWalletInTx(tx, {entity_id: twinEntityId, wallet_type:
   "PERSONAL"})` at L189-191 — **explicit PERSONAL override**.
3. `createTARInTx(tx, {entity_id: twinEntityId, entity_type:
   "AI_AGENT"})` at L195-198 — TAR receives AI_AGENT defaults
   (clearance_ceiling 2; can-write/can-read defaults; SESSION_ONLY
   grant scope).
4. `writeAuditEvent({event_type: "ENTITY_REGISTERED", details: {
   action: "TWIN_ENTITY_CREATED", owner_entity_id, org_entity_id,
   role_title, is_admin_twin}})` at L199-216.
5. `tx.entityMembership.create({data: {parent_id: owner_entity_id,
   child_id: twinEntityId, role_title, ...}})` at STEP 3 register
   substantively.

Result: AI_AGENT entity in PERSONAL wallet, fused to owner PERSON via
EntityMembership(parent=PERSON, child=AI_AGENT). Matches ADR-0001
design intent (Personal DMW for digital twins, portable per GDPR
Article 20).

#### Enterprise AI Agent path — defensive forward-substrate

`packages/database/src/queries/wallet.ts:39-58` `defaultWalletTypeFor`
canonical at canonical-execution register substantively:

```ts
export function defaultWalletTypeFor(entityType: EntityType): WalletType {
  switch (entityType) {
    case "PERSON":
      return "PERSONAL";
    case "DEVICE":
      return "DEVICE";
    case "COMPANY":
    case "AI_AGENT":
    case "APPLICATION":
    case "GOVERNMENT":
    case "REGULATOR":
      // REGULATOR per ADR-0036 ... Rule 0 (maximum human control
      // by default) is why non-human entities default to ENTERPRISE
      // rather than PERSONAL.
      return "ENTERPRISE";
  }
}
```

When `createEntity({entity_type: "AI_AGENT"})` is called without
explicit `wallet_type` override, the fallback fires. NIOV content
access defaults to `false` per `defaultNiovAccessFor(ENTERPRISE)`
canonical at `wallet.ts:68-70` register substantively (RULE 0
maximum-human-control safe default).

Substrate-state ground truth at HEAD `5fcdbde` register
substantively: **no current product code path creates Enterprise AI
Agent entities.** Repo-wide scan confirms the only AI_AGENT-entity-
creating call sites are `twin.service.ts:182` + `twin.service.ts:
196` (twin TAR seed). `org.routes.ts:1428`, `otzar.service.ts:166`,
`platform.routes.ts:190` are read-only queries (not creates).
Defensive infrastructure in `defaultWalletTypeFor` is live but the
forward-substrate product surface is not yet shipped.

#### Org/personal/twin coexistence — dandelion onboarding canonical

`apps/api/src/services/governance/dandelion.service.ts` org
onboarding atomically creates:

- COMPANY entity → ENTERPRISE wallet (L205 explicit
  `wallet_type: "ENTERPRISE"`)
- Admin PERSON entity → PERSONAL wallet (L269 explicit
  `wallet_type: "PERSONAL"`)
- Admin twin (AI_AGENT) → PERSONAL wallet (L396 via `createTwin`
  → `twin.service.ts:189-191` explicit PERSONAL override)
- EntityMembership(parent=COMPANY, child=admin PERSON) at STEP 9
- EntityMembership(parent=admin PERSON, child=admin AI_AGENT twin)
  at twin.service.ts STEP 3

The substrate canonically expresses the three-wallet architecture
(ADR-0001) + the dual-context AI_AGENT routing model coherently
at canonical-execution register substantively.

### §B — Enforcement surface inventory (11 sites)

AI_AGENT discrimination is substantively defended across the
following 11 enforcement surfaces canonical at canonical-execution
register substantively at HEAD `5fcdbde`:

| # | Surface | Discrimination |
|---|---|---|
| 1 | `packages/database/src/queries/wallet.ts:39-58` | `defaultWalletTypeFor(AI_AGENT) = ENTERPRISE` defensive fallback per RULE 0 |
| 2 | `packages/database/src/queries/tar.ts:105` | `AI_AGENT: 2` clearance_ceiling default (vs PERSON 6) |
| 3 | `packages/database/src/queries/tar.ts:376-395` | Sovereignty: AI_AGENT actor cannot RAISE clearance ceiling on another AI_AGENT |
| 4 | `packages/database/src/queries/permission.ts:106-110` | Sovereignty: AI_AGENT entity cannot grant permission to another AI_AGENT entity (hard reject) |
| 5 | `packages/database/src/queries/permission.ts:122` | AI_AGENT grantor defaults to `SESSION_ONLY` scope (vs PERSON `TEMPORARY` default) |
| 6 | `apps/api/src/services/cosmp/negotiate.service.ts:142-143` | `isRestrictedAiClass(entityType) = AI_AGENT \|\| DEVICE` — restricted-class gating |
| 7 | `apps/api/src/services/cosmp/negotiate.service.ts:577-585` | AI sovereignty cap: AI_AGENT requested FULL scope demoted to SUMMARY unless explicit `allow_ai_full=true` human override |
| 8 | `apps/api/src/services/cosmp/negotiate.service.ts:625-630` | `ai_capped` audit metadata field emitted at every NEGOTIATE result |
| 9 | `apps/api/src/services/cosmp/similarity.service.ts:305-307` | SQL filters: `ai_access_blocked = false AND requires_validation = false AND clearance_required <= $3` |
| 10 | `apps/api/src/services/embedding/embedding.service.ts:19` | Comment-asserted: embedding "NEVER sent to AI_AGENT entities denied content access" per G3.5 Q-G3.5-α LOCK |
| 11 | `apps/api/src/services/governance/twin.service.ts:182-220` | Twin AI_AGENT created with explicit PERSONAL wallet + EntityMembership(parent=PERSON owner) fusion |

All 11 surfaces apply UNIFORMLY across Personal AI Agent + Enterprise
AI Agent + bare-fallback contexts. The RULE 0 governance discipline
canonical at canonical-rule register substantively does not
discriminate by wallet context; only the wallet defaulting + NIOV
content-access flag + EntityMembership fusion semantics differ
between Personal AI Agent and Enterprise AI Agent.

### §C — RULE 13 substrate-honest drift surfaces (G6.2 cascade targets)

Drift sites that surface in canonical prose register substantively
across the substrate and need correction/narrowing at G6.2 doc-and-
test cascade register substantively (forward-substrate to G6.2):

| Site | Current claim | G6.2 disposition |
|---|---|---|
| `docs/architecture/decisions/0001-three-wallet-architecture.md:46+90` | "Digital twins are `AI_AGENT` entities with their own Personal DMW" | Preserve (correct for Personal AI Agent context); add Amendment 1 narrowing claim + companion Enterprise AI Agent context |
| `docs/reference/glossary.md` "Digital Twin Wallet" entry | "Synonym for the Personal DMW belonging to an AI_AGENT entity (a digital twin)" | Preserve (correct for Personal AI Agent context); add NEW glossary entries for "Personal AI Agent" + "Enterprise AI Agent" |
| `docs/architecture/decisions/0039-hive-scale-per-dmw-dispatch-enterprise-wallets.md` (multiple sites L106-108 + L250-253 + Sub-decision 8 Amendment 1) | "AI_AGENT entities map to PERSONAL WalletType" (universal claim) | Amendment 2 surfacing dual-context routing (twin path → PERSONAL → promote-on-activity per ADR-0039 §Amendment 1; forward-substrate Enterprise AI Agent → ENTERPRISE → DMWWorker hot per ADR-0039 §Decision) |
| `docs/architecture/decisions/0041-capsule-layer-substrate-umbrella.md` §Sub-decision 6 | "AI_AGENT continues mapping to PERSONAL wallet_type for storage/economic tier" (universal claim) | Amendment replacing hard-mapping prose with dual-context model + back-citation to this ADR per RULE 14 |
| `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex` moduledoc | "PERSONAL (includes AI_AGENT entities per TS-side `defaultWalletTypeFor/1` mapping AI_AGENT EntityType to PERSONAL wallet_type at INSERT register)" | Correction: dual-context language acknowledging AI_AGENT may route to PERSONAL (twin path) or ENTERPRISE (defensive fallback) |
| `apps/cosmp_router/lib/cosmp_router/schemas/wallet.ex` moduledoc | Same claim as wallet_lookup.ex | Same correction |
| `apps/cosmp_router/lib/cosmp_router/activity_counter.ex` (L57 comment) | "PERSONAL-promoted + AI_AGENT-" fragment implying AI_AGENT-promoted path | Correction or removal: AI_AGENT routing path depends on wallet_type (PERSONAL twin → promote-on-activity; ENTERPRISE forward-substrate → DMWWorker hot) |
| `apps/cosmp_router/lib/cosmp_router/grpc/server.ex:266` comment | "Forward-substrate to AI_AGENT branch at C.4 ADR amendment register per ADR-0039 §Sub-decision" | Closure: AI_AGENT routing is canonical per this ADR; no separate AI_AGENT branch needed (wallet_type is the canonical signal) |

### §D — Test surface anchors

The following test anchors prove dual-context behavior at canonical-
execution register substantively and serve as the reference baseline
for G6.2 doc-and-test cascade:

- `tests/unit/wallet.test.ts:73-77`: `"defaults an AI_AGENT entity to
  an ENTERPRISE wallet"` — bare `createEntity({entity_type: "AI_
  AGENT"})` defensive fallback anchor.
- `tests/unit/wallet.test.ts:313-322`: `defaultWalletTypeFor` table
  test: PERSON → PERSONAL; COMPANY → ENTERPRISE; AI_AGENT →
  ENTERPRISE; DEVICE → DEVICE; APPLICATION → ENTERPRISE; GOVERNMENT
  → ENTERPRISE.
- `tests/unit/wallet.test.ts:322`-block: `"respects an explicit
  wallet_type override on createEntity"` — explicit override anchor.
- `tests/unit/wallet.test.ts` content-access rule: PERSONAL allows
  NIOV access; ENTERPRISE does NOT; DEVICE does NOT.
- `tests/unit/tar.test.ts:86-88`: `"AI_AGENT gets clearance_ceiling 2
  by default"`.
- `tests/unit/tar.test.ts:364-407`: `"Sovereignty: AI_AGENT cannot
  raise AI_AGENT ceiling"` describe block (4 tests).
- `tests/unit/tar.test.ts:473`: `defaultCeilingFor("AI_AGENT") = 2`.
- `tests/unit/permission.test.ts`: `"Sovereignty: only PERSON can
  grant LONG_TERM or PERMANENT"` (3 tests) + `"Sovereignty: AI_AGENT
  cannot grant to AI_AGENT"` (2 tests) + `"Sovereignty: grantor must
  own the capsule's wallet"`.
- `tests/unit/cosmp/negotiate.test.ts:468-588`: `"negotiate -- AI
  sovereignty"` describe block (9 tests: ai_access_blocked +
  requires_validation rejection paths + COMPLIANCE_GATE escalation
  coupling + AI_AGENT FULL silent cap + explicit human override
  preservation).
- `tests/unit/entity.test.ts:67`: `"accepts a null email for AI
  agents and devices"`.
- `tests/unit/dandelion.test.ts:85`: `expect(twin?.entity_type).
  toBe("AI_AGENT")` — twin pattern anchor.
- `tests/unit/otzar.test.ts:144-149`: twin onboarding for Otzar
  conductSession flow.

## Adversarial Threat Model

Threat model under dual-context lens at production-readiness
register substantively at HEAD `5fcdbde`:

| # | Threat | Current protection | Gap / ambiguity | Production severity | ADR-0046 owns? |
|---|---|---|---|---|---|
| **T1** | Personal AI Agent / twin silently routed to ENTERPRISE | `twin.service.ts:189-191` explicit `"PERSONAL"` override; dandelion + twin tests anchor the path | None at twin path | LOW (twin path correct) | YES — canonicalize the pattern |
| **T2** | Bare AI_AGENT direct-create silently routed to ENTERPRISE fallback | `defaultWalletTypeFor(AI_AGENT) = ENTERPRISE` RULE 0 safe default; `niov_can_access_contents = false` for ENTERPRISE | The default is conservative; may foreclose future personal-AI-agent-not-via-twin product paths | MEDIUM (forward-looking) | YES — document canonical model + decision tree |
| **T3** | AI_AGENT in PERSONAL wallet misread as human-owned memory | EntityType.AI_AGENT preserved separately from PERSON in Entity row; `isRestrictedAiClass` + `ai_capped` + sovereignty caps still apply at NEGOTIATE regardless of wallet_type | None observed | LOW | YES — cite anchors |
| **T4** | Twin fusion via EntityMembership misunderstood (no separate Fusion entity) | `EntityMembership(parent=owner PERSON, child=twin AI_AGENT)` at `twin.service.ts` STEP 3 is the canonical fusion mechanism per ADR-0001; permissions on Hive enforce the bond; REVOKE on departure removes membership | None observed | LOW | YES — document the canonical fusion model |
| **T5** | Enterprise AI Agent context lacks canonical product surface | `defaultWalletTypeFor` defensive fallback provides safe infrastructure but no canonical product flow documented or shipped | Forward-substrate gap; future Enterprise AI Agent product flows need explicit canonical surface | MEDIUM (forward-looking) | YES — canonicalize the Enterprise AI Agent context for forward-substrate use |
| **T6** | Cross-context retrieval confusion (Personal AI Agent capsule retrieved when querying Enterprise AI Agent context) | Each AI_AGENT entity has own `entity_id` + own `wallet_id`; reads scope `WHERE wallet_id = $`; G3.9 J7 adversarial integration test anchors RULE 0 privacy filters | None observed | LOW | YES — cite anchors |
| **T7** | EntityMembership presence as implicit context signal becomes ambiguous | `EntityMembership(parent=PERSON, child=AI_AGENT)` = Personal AI Agent / twin; `EntityMembership(parent=COMPANY, child=AI_AGENT)` = Enterprise AI Agent (forward-substrate) | Implicit; not canonicalized at API surface | MEDIUM | YES — document the canonical context-resolution rule |
| **T8** | Confused-deputy risk at twin acting on behalf of human | `created_by` field carries actor entity_id; `ai_capped` audit; AI sovereignty cap on FULL scope; AI cannot grant LONG_TERM/PERMANENT; AI cannot grant to AI | None observed (substantively defended via 11-row enforcement surface inventory at §B) | LOW (substantively defended) | YES — cite anchors |
| **T9** | BEAM Translator metadata loss across personal vs enterprise dispatch | Translator preserves `wallet_id` + `entity_id` + `created_by` + RULE 0 flags; Personal twin AI_AGENT (PERSONAL wallet) → `WalletCache.wallet_type_for/1` returns `:personal` → promote-on-activity dispatch; Enterprise (forward-substrate) → `:enterprise` → DMWWorker hot dispatch | None at dispatch level | LOW | YES — document dispatch path differences |
| **T10** | Audit reconstruction of Personal AI Agent vs Enterprise AI Agent operations | Audit emissions carry `entity_type`, `ai_capped`, `details.action`; `wallet_type` reconstructable from `wallet_id` join; `EntityMembership` reconstructable from query | Dispatch tier not denormalized into audit emission metadata | LOW-MEDIUM | YES — document canonical audit reconstruction recipe |

**Net adversarial verdict**: no T1-T10 case has a code-tier
vulnerability at HEAD `5fcdbde` register substantively. T1 + T2 + T4
+ T5 + T7 are documentation-canonicalization gaps that ADR-0046
substantively closes at canonical-prose register substantively. T3 +
T6 + T8 + T9 + T10 are substantively defended at canonical-execution
register substantively (cite anchors).

## Consequences

### Positive

- **Canonical dual-context AI_AGENT routing model** documented at
  canonical-prose register substantively; future engineers reading
  the ADR get correct guidance for both Personal AI Agent (twin) and
  Enterprise AI Agent (forward-substrate) flows.
- **Patent-implementation evidence trail** (ADR-0020 two-register IP
  discipline) is canonical at canonical-state register substantively
  for enterprise/government procurement + patent licensee disclosures
  + SOC 2 + FedRAMP + NIST AI Agent Standards compliance documentation
  audits.
- **RULE 13 substrate-honest drift surfaces** between ADR-0001 prose
  + downstream consumers + Elixir docstrings + runtime substrate are
  surfaced canonical at canonical-prose register substantively;
  G6.2 doc-and-test cascade resolves them per RULE 14 bidirectional
  citation discipline.
- **Forward-substrate Enterprise AI Agent product surface** can be
  built on top of the defensive `defaultWalletTypeFor(AI_AGENT) =
  ENTERPRISE` infrastructure without ADR re-canonicalization.
- **Confused-deputy mitigations** are canonical at canonical-prose
  register substantively per RS-G6-2 industry alignment.

### Negative

- **G6.2 doc-and-test cascade** is a non-trivial follow-on commit
  touching ADR-0001 (foundational) + ADR-0039 + ADR-0041 + glossary
  + 3 Elixir module docstrings + grpc/server.ex comment + CLAUDE.md
  catalog updates + NEW dual-context TS unit tests. Founder
  authorization required at every cascade scope per RULE 20.
- **Forward-substrate Enterprise AI Agent product flows** need
  explicit canonical surface at future product commit register
  substantively (not at G6.x register).
- **Defensive fallback semantics** require ongoing canonical
  documentation discipline; if future engineers remove the fallback
  thinking it's unnecessary, the bare-AI_AGENT-create RULE 0 safe
  default would regress.

### Neutral

- **Runtime substrate unchanged at G6.1** per Q-G6-α α-1 + Q-G6-δ δ-1
  + Q-G6-γ γ-1 + Q-G6-ε ε-2 LOCKs canonical at canonical-state
  register substantively.
- **Test surface unchanged at G6.1**; new dual-context test anchors
  land at G6.2 per Q-G6-η η-2 LOCK.
- **BEAM Translator preserved unchanged** per Q-G6-ε ε-2 LOCK
  canonical at canonical-state register substantively.
- **Audit literal inventory preserved unchanged** per Q-G6-ζ ζ-1 LOCK.

## Alternatives Considered

### Hard-mapping AI_AGENT → PERSONAL universally — REJECTED

Per Founder dual-context correction at `[BEAM-CAPSULE-ROUTING-G6-
FOUNDER-CORRECTION]` register substantively. Hard-mapping AI_AGENT to
PERSONAL universally would force Enterprise AI Agent forward-
substrate flows into PERSONAL-tier defaults (`niov_can_access_contents
= true`) which violates RULE 0 maximum-human-control discipline for
non-twin enterprise AI agent flows. ADR-0001 design intent for
digital twins (Personal DMW) is preserved as Personal AI Agent
context but NOT universalized.

### Hard-mapping AI_AGENT → ENTERPRISE universally — REJECTED

Per Founder dual-context correction. Hard-mapping AI_AGENT to
ENTERPRISE universally would foreclose ADR-0001 design intent for
digital twins (Personal DMW + GDPR Article 20 portability + employee-
data-portability semantics). The current twin onboarding pattern at
`twin.service.ts:189-191` explicit PERSONAL override correctly
implements ADR-0001; universalizing ENTERPRISE would regress the
current Personal AI Agent product flow.

### Schema discriminator (NEW `capsule_routing_context` enum) — DEFERRED

Per Founder Q-G6-γ γ-1 LOCK. A NEW schema field discriminating
Personal AI Agent vs Enterprise AI Agent capsules denormalized at the
MemoryCapsule row register substantively was evaluated. Decision:
DEFER. `EntityMembership` parent/child + explicit `wallet_type`
override are sufficient context-resolution signals at G6.1 register
substantively. Future Founder-authorized ADR amendment may evaluate
schema discriminator after G6.2 doc-and-test cascade lands and test-
coverage gaps surface (if any).

### Substantive `resolveAiAgentWalletContext` helper at G6.1 — DEFERRED

Per Founder Q-G6-δ δ-1 LOCK + G6.3 disposition LOCK. A substantive
helper at the API surface making context resolution explicit was
evaluated. Decision: DEFER to G6.3 forward-substrate disposition.
G6.3 is NOT part of the current closure path. Helper may land later
if a separate Founder QLOCK explicitly authorizes it AND G6.2
verification proves unresolved ambiguity at the wallet-defaulting
tier.

### Defer Gap 6 entirely / SKIP — REJECTED

Per Founder Q-G6-θ θ-1 + Q-G6-ι ι-1 (refined) LOCKs. Defer/SKIP
disposition would leave ADR-0001 substrate-honest drift unresolved at
canonical-state register substantively before Sub-arc 2 closure +
before enterprise/government procurement readiness register
substantively. Patent-implementation evidence trail per ADR-0020
two-register IP discipline canonical at canonical-rule register
substantively does not tolerate foundational-ADR drift unresolved at
release register substantively.

## References

### Foundation RULES

- RULE 0 (Humans Always Sovereign) at `CLAUDE.md` §3 RULES
- RULE 10 (Nothing is ever deleted) at `CLAUDE.md` §3 RULES
- RULE 11 (Wider knowledge check for Elixir/BEAM substrate) at
  `CLAUDE.md` §3 RULES
- RULE 12 (Pre-flight grep before drafting) at `CLAUDE.md` §3 RULES
- RULE 13 (Surface drifts inline over silent fix) at `CLAUDE.md`
  §3 RULES
- RULE 20 (Rule-modification authority) at `CLAUDE.md` §3 RULES
- RULE 21 (Pre-authorization research arc for substrate-architectural
  pastes) at `CLAUDE.md` §3 RULES

### Foundation ADRs

- ADR-0001 (Three-wallet architecture; foundational; Personal DMW
  claim for digital twins is preserved as Personal AI Agent context
  per this ADR + G6.2 cascade)
- ADR-0002 (Append-only audit chain; capsule-level audit emissions
  preserved across both contexts)
- ADR-0011 §Amendment (Three-tier test stratification; Tier 2
  baseline preserved at G6.1)
- ADR-0020 (Two-register IP discipline; patent-implementation evidence
  trail canonical at canonical-record register substantively)
- ADR-0021 (Capsule type extension protocol; cite for FOUNDATIONAL
  bypass inheritance pattern)
- ADR-0022 (combined_score formula canonicalization; FROZEN; no
  amendment at G6.1)
- ADR-0026 §5 (BEAM 6-pattern compatibility; Pattern 6 pure
  transformation preserved at Translator)
- ADR-0027 (Contributor governance + AI-alignment + rule-modification
  authority)
- ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (Prisma/Ecto cross-language
  data ownership; BEAM observer-only at G6.1)
- ADR-0034 (BEAM testability discipline; preserved at G6.1)
- ADR-0035 (Substrate-build discipline canonical; G6.2 cascade may
  add observations if substrate-build patterns surface)
- ADR-0036 (REGULATOR principal + lawful-basis attestation; cite for
  per-request indexed point-lookup pattern at WalletLookup)
- ADR-0037 (Jurisdiction tagging; cite for jurisdiction immutability
  pattern at MemoryCapsule)
- ADR-0038 (DMW Worker per-DMW Supervised Process; cite for hybrid
  hot/cold framing canonical at substantive register)
- ADR-0039 (Hive-scale per-DMW dispatch for ENTERPRISE wallets; G6.2
  cascade narrows AI_AGENT routing path claims to dual-context model)
- ADR-0040 (DEVICE cold-shard substrate; cite for tier discrimination
  pattern)
- ADR-0041 §Sub-decision 6 (parent umbrella; AI_AGENT EntityType-
  discriminated capsule routing forward-substrate reservation closed
  by this ADR; G6.2 cascade replaces hard-mapping prose with dual-
  context model)
- ADR-0042 (Gap 1 mutation discrimination; cite for clean-transition
  discipline at audit literal expansion path)
- ADR-0043 (Gap 3 pgvector embedding; G3.9 J5-J8 privacy proofs
  preserved at all G6 surfaces)
- ADR-0044 (Gap 4 decay execution formalization; cite for Gap 4/5/6
  boundary discipline)
- ADR-0045 (Gap 5 capsule-level staleness detection; cite for closure
  cascade precedent + minimum-touch G4.4 / G5.4 closure pattern)
- ADR-0047 (Post-Gap-3 production-readiness hardening; cite for
  hardening pattern at runtime safety)

### Research arc sources (RS-G6-1 through RS-G6-4; retrieved 2026-05-19)

- RS-G6-1 (agent identity vs storage separation): Mem0 State of AI
  Agent Memory 2026; Aembit IAM for Agentic AI 2026; ResilientCyber
  Identity Is the Agentic AI Problem; GitGuardian AI Agents
  Authentication; Built In Securing IAM for AI Agents
- RS-G6-2 (confused-deputy in agentic systems): Cloud Security
  Alliance Confused Deputy Attacks on Autonomous AI Agents; HashiCorp
  Before You Build Agentic AI Understand the Confused Deputy Problem;
  Quarkslab Agentic AI Confused Deputy Problem; BeyondTrust What Is
  The Confused Deputy Problem; Safeguard.sh AI Agent Confused Deputy
  Problem 2026
- RS-G6-3 (enterprise/government auditability): Atlan AI Agent
  Memory Governance; IBL Why Federal Agencies Need Sovereign AI
  Infrastructure 2026; BigID Emerging Trends in Agentic AI Governance
  Platforms 2026; MarkTechPost Enterprise AI Governance 2026; AGAT
  Software AI Agent Security 2026
- RS-G6-4 (NIST AI Agent Standards Initiative + least-privilege
  capability tokens): Build MVP Fast NIST AI Agent Standards
  Initiative 2026; WorkOS NIST AI Agent Standards Initiative
  Explained; Security Boulevard Least Privilege Access for AI Agents
  2026; Biometric Update NIST Concept Paper on AI Agent Identity and
  Authorization; Cloud Security Alliance NIST AI Agent Standards
  Federal Framework

### Patent references

- US 12,517,919 (COSMP + 7-layer Memory Capsule; AI_AGENT is canonical
  actor identity at EntityType register substantively)
- US 12,164,537 (DMW + Foundation primitives)
- US 12,399,904 (DMW + Foundation primitives)

## Founder Authorization

Founder authorization explicit at G6.1 substantive landing per RULE
20 at:

- `[BEAM-CAPSULE-ROUTING-G6-QLOCK]`
- `[BEAM-CAPSULE-ROUTING-G6.1-EXECUTE-VERIFY-AUTH]`

Founder dual-context correction explicit at:

- `[BEAM-CAPSULE-ROUTING-G6-FOUNDER-CORRECTION]`

Founder authorization explicit at G6.2 doc-and-test cascade landing
per RULE 20 at:

- `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK]`
- `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]` (substrate-state
  drifts D-G6.2-1 file-count + D-G6.2-2 ADR-0001 / ADR-0039 filename
  resolved)
- `[BEAM-CAPSULE-ROUTING-G6.2-EXECUTE-VERIFY-AUTH]`

Founder authorization explicit at G6.4 closure cascade landing per
RULE 20 at:

- `[BEAM-CAPSULE-ROUTING-G6.4-QLOCK]`
- `[BEAM-CAPSULE-ROUTING-G6.4-EXECUTE-VERIFY-AUTH]`

## G6.2 Doc-and-Test Cascade (2026-05-19)

G6.2 `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` doc-and-test
cascade LANDED 2026-05-19 (13 MOD + 0 NEW) per Founder Q-G6.2-α α-1
+ Q-G6.2-β β-1 + Q-G6.2-γ γ-1 + Q-G6.2-δ δ-1 + Q-G6.2-ε ε-1 +
Q-G6.2-ζ ζ-1 + Q-G6.2-η η-1 + Q-G6.2-θ θ-1 + Q-G6.2-ι (13 MOD + 0
NEW corrected) + Q-G6.2-κ κ-1 LOCKS at
`[BEAM-CAPSULE-ROUTING-G6.2-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]` +
`[BEAM-CAPSULE-ROUTING-G6.2-EXECUTE-VERIFY-AUTH]` register
substantively.

**Substrate landing (13 MOD; 0 NEW)**:

- MOD `docs/architecture/decisions/0001-three-wallet-architecture.md`
  in-place Amendment 1 per Q-G6.2-α α-1 LOCK: preserve Personal DMW
  / digital twin claim verbatim + narrow to Personal AI Agent
  context + add companion Enterprise AI Agent context + RULE 14
  bidirectional citation to this ADR.
- MOD `docs/architecture/decisions/0039-hive-scale-per-dmw-dispatch-enterprise-wallets.md`
  in-place Amendment 2 per Q-G6.2-β β-1 LOCK: substrate-honest
  correction at L106-108 + L250-253 + §Sub-decision 1 + §Amendment
  1 prose; document dual-context dispatch path (Personal AI Agent
  twin → PERSONAL → personal/promote-on-activity dispatch shim;
  Enterprise AI Agent → ENTERPRISE → DMWWorker hot dispatch);
  wallet_type column is canonical BEAM dispatch signal; preserve
  prior substrate-build observations + research arc + Horde +
  cosmp_router pure-module decisions verbatim; RULE 14
  bidirectional citation.
- MOD `docs/architecture/decisions/0041-capsule-layer-substrate-umbrella.md`
  §Sub-decision 6 amendment per Q-G6.2-γ γ-1 LOCK: replace hard-
  mapping prose with ADR-0046 dual-context model; preserve Gap 6
  lineage; preserve Sub-arc 2 IN FLIGHT; RULE 14 bidirectional
  citation.
- MOD this ADR with G6.2 cascade section + Implementation Lineage
  G6.1 row anchored at `c130826` + G6.2 row flipped LANDED 2026-05-
  19 + Founder Authorization G6.2 citations.
- MOD `docs/reference/glossary.md` per Q-G6.2-δ δ-1 LOCK: narrow
  "Digital Twin Wallet" entry to Personal AI Agent / twin context;
  NEW "Personal AI Agent" entry; NEW "Enterprise AI Agent" entry;
  cite ADR-0046.
- MOD `docs/reference/section-12-progress.md`: append G6.2 LANDED
  prose to Gap 6 row; preserve Gap 6 IN FLIGHT; preserve Sub-arc 2
  umbrella IN FLIGHT.
- MOD `docs/CURRENT_BUILD_STATE.md`: NEW H4 `#### G6.2 LANDED`
  section; state G6.3 helper remains DEFERRED; state G6.4 closure
  next.
- MOD `CLAUDE.md` ADR-0001 / ADR-0039 / ADR-0041 / ADR-0046 catalog
  entries with G6.2 amendment summaries.
- MOD `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex`
  moduledoc per Q-G6.2-ε ε-1 LOCK: dual-context correction; cite
  ADR-0046; no Elixir routing logic changes.
- MOD `apps/cosmp_router/lib/cosmp_router/schemas/wallet.ex`
  moduledoc per Q-G6.2-ε ε-1 LOCK: dual-context correction; cite
  ADR-0046; no Translator behavior changes.
- MOD `apps/cosmp_router/lib/cosmp_router/activity_counter.ex` L57
  comment per Q-G6.2-ε ε-1 LOCK: dual-context correction.
- MOD `apps/cosmp_router/lib/cosmp_router/grpc/server.ex:266`
  forward-substrate comment per Q-G6.2-ε ε-1 LOCK: closure
  canonical; AI_AGENT routing is canonical per ADR-0046; no
  separate AI_AGENT branch needed (wallet_type column is the
  canonical dispatch signal).
- MOD `tests/unit/wallet.test.ts` per Q-G6.2-ζ ζ-1 LOCK: NEW
  dual-context tests anchoring bare AI_AGENT → ENTERPRISE preserved
  + explicit PERSONAL override on AI_AGENT works + explicit
  ENTERPRISE override on AI_AGENT works + `niov_can_access_contents`
  differs correctly across contexts + `defaultWalletTypeFor(AI_AGENT)
  = ENTERPRISE` defensive fallback preserved.

**Critical coherence preserved at G6.2**: no schema.prisma changes;
no package.json / lockfile changes; no audit.ts changes per
Q-G6.2-η η-1 LOCK; no new audit literals; no read.service /
write.service / SimilarityService / COE / permission / TAR /
negotiate.service behavior changes (forbidden boundaries
preserved); no Elixir routing logic / Translator behavior changes
per Q-G6.2-ε ε-1 LOCK; no schema discriminator changes per
Q-G6.2-θ θ-1 LOCK; no `resolveAiAgentWalletContext` helper at G6.2
(G6.3 remains DEFERRED forward-substrate per Founder G6.3
disposition LOCK); no production-affecting actions; no real OpenAI
calls; no Supabase mutation; no secret exposure.

**Status preservation per Q-G6.2-κ κ-1 LOCK**: ADR-0046 Status
preserved `Proposed 2026-05-19` (G6.4 closure cascade is canonical
Status-flip commit per ADR-0046 §Implementation Lineage register
substantively); Gap 6 row Status preserved IN FLIGHT; Sub-arc 2
umbrella row Status preserved IN FLIGHT.

**G6.4 closure cascade forward-substrate next**: ADR-0046 Status
flip `Proposed 2026-05-19` → `Accepted 2026-05-XX` + Gap 6 row
Status flip IN FLIGHT → CLOSED + README + CLAUDE.md ADR-0046
catalog refresh + Sub-arc 2 preserved IN FLIGHT pending later
Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch register
substantively.

## Implementation Lineage (forward-substrate G6.1-G6.4)

| Sub-phase | Tag | Authorized scope | Status |
|-----------|-----|------------------|--------|
| G6.1 | `[BEAM-CAPSULE-ROUTING-ADR]` | 4 MOD + 1 NEW docs-only; ADR-0046 NEW Proposed; canonical dual-context routing model; RULE 21 research arc embedded (RS-G6-1 through RS-G6-4); 11-row enforcement surface inventory; 10-row adversarial threat model; RULE 13 substrate-honest drift surfaces (8 G6.2 cascade targets) | **G6.1 LANDED 2026-05-19 at `c130826`** |
| G6.2 | `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` | Docs cascade + new tests; ADR-0001 Amendment 1 (preserve + narrow Personal DMW claim); ADR-0039 Amendment 2 (dual-context routing path documentation); ADR-0041 §Sub-decision 6 amendment (replace hard-mapping prose); glossary "Digital Twin Wallet" narrow + NEW "Personal AI Agent" + "Enterprise AI Agent" entries; 3 Elixir module docstring corrections (wallet_lookup.ex + schemas/wallet.ex + activity_counter.ex); grpc/server.ex:266 forward-substrate comment closure; CLAUDE.md ADR-0001/0039/0041 catalog updates; NEW dual-context TS unit tests per Q-G6-η η-2 LOCK | **G6.2 LANDED 2026-05-19 at `9c3943d`** |
| G6.3 | `[BEAM-CAPSULE-ROUTING-CONTEXT-RESOLVER]` | Substantive `resolveAiAgentWalletContext` helper; entity.test.ts + wallet.test.ts test extensions for explicit context resolution | **DEFERRED** forward-substrate (not in current closure path per Founder G6.3 disposition LOCK + Q-G6.4-η η-1 LOCK preservation) |
| G6.4 | `[BEAM-CAPSULE-ROUTING-CLOSURE]` | Docs-only closure cascade; 5 MOD per Q-G6.4-γ γ-1 LOCK; ADR-0046 Status flip `Proposed 2026-05-19` → **`Accepted 2026-05-19`**; Gap 6 row Status flip IN FLIGHT → CLOSED; NO ADR-0035 modification per Q-G6.4-δ δ-1 LOCK; README + CLAUDE.md ADR-0046 catalog Status flip per Q-G6.4-ε ε-1 LOCK; Sub-arc 2 preserved IN FLIGHT per Q-G6.4-ζ ζ-1 LOCK; G6.3 helper preserved DEFERRED forward-substrate per Q-G6.4-η η-1 LOCK | **G6.4 LANDED 2026-05-19; Gap 6 CLOSED** |

Status flipped from `Proposed 2026-05-19` to **`Accepted 2026-05-19`**
at G6.4 closure cascade canonical at canonical-state register
substantively per Q-G6-α + Q-G6-θ + Q-G6.4-β β-1 LOCK + canonical
mini-arc closure precedent (G3.10 + G4.4 + G5.4 + PR.4 + G1.6).

**Sub-arc 2 status field remains IN FLIGHT throughout G6.1-G6.4**
per Q-G6-θ θ-1 + Q-G6.4-ζ ζ-1 LOCK + ADR-0041 CL.1 scope patch.
Sub-arc 2 closure cascade forward-substrate after G6.4 + remains a
separate later commit per ADR-0041 CL.1 scope patch register
substantively.

## G6.4 Closure Cascade (2026-05-19)

G6.4 `[BEAM-CAPSULE-ROUTING-CLOSURE]` docs-only closure cascade
LANDED 2026-05-19 (5 MOD) per Founder Q-G6.4-α α-1 LOCK + Q-G6.4-β
β-1 LOCK + Q-G6.4-γ γ-1 LOCK + Q-G6.4-δ δ-1 LOCK + Q-G6.4-ε ε-1
LOCK + Q-G6.4-ζ ζ-1 LOCK + Q-G6.4-η η-1 LOCK at
`[BEAM-CAPSULE-ROUTING-G6.4-QLOCK]` +
`[BEAM-CAPSULE-ROUTING-G6.4-EXECUTE-VERIFY-AUTH]` register
substantively. **Gap 6 AI_AGENT EntityType-Discriminated Capsule
Routing CLOSED at canonical-state register substantively.** ADR-0046
Status flipped from `Proposed 2026-05-19` to **`Accepted 2026-05-19`**
per Q-G6.4-β β-1 LOCK. Gap 6 mini-arc 3/3 substantive sub-phases
LANDED (G6.1 LANDED `c130826` + G6.2 LANDED `9c3943d` + G6.3
DEFERRED + G6.4 LANDED this commit). Sub-arc 2 remains IN FLIGHT
per Q-G6.4-ζ ζ-1 LOCK; Sub-arc 2 closure cascade is a separate
later commit per ADR-0041 CL.1 scope patch.

**Q-G6.4 locks canonical**:

- Q-G6.4-α α-1 — close ADR-0046 now at G6.4 closure cascade
  canonical at canonical-state register substantively.
- Q-G6.4-β β-1 — flip ADR-0046 Status `Proposed 2026-05-19` →
  **`Accepted 2026-05-19`**.
- Q-G6.4-γ γ-1 — 5 MOD docs-only file scope (this ADR + section-12-
  progress + CURRENT_BUILD_STATE + docs/architecture/README +
  CLAUDE.md).
- Q-G6.4-δ δ-1 — **no ADR-0035 modification at G6.4**. G6.2 drifts
  were resolved in-place through ADR-0001 / ADR-0039 / ADR-0041 /
  glossary / Elixir docstrings / grpc comment / TS tests. No new
  recurring substrate-build discipline observation requires ADR-0035
  promotion at G6.4. D-G6.2-1 file-count drift + D-G6.2-2 ADR-0001
  / ADR-0039 filename drift were handled immediately by QLOCK
  correction at `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]` and
  do not require ADR-0035 promotion now.
- Q-G6.4-ε ε-1 — update README + CLAUDE.md ADR-0046 catalog entries
  from `Proposed 2026-05-19` to **`Accepted 2026-05-19`** with tail
  refresh covering G6.2 + G6.4 substantive landing summary.
- Q-G6.4-ζ ζ-1 — preserve Sub-arc 2 status field as IN FLIGHT.
- Q-G6.4-η η-1 — preserve G6.3 `[BEAM-CAPSULE-ROUTING-CONTEXT-
  RESOLVER]` as DEFERRED forward-substrate. Do not implement
  `resolveAiAgentWalletContext`. Do not add schema fields. Do not
  modify runtime service behavior.

**Canonical closure precedents**: G4.4 (`a05040f` `[BEAM-CAPSULE-
DECAY-CLOSURE]`; 5 MOD docs-only; ADR-0044 Status flipped; **NO
ADR-0035 modification — minimum-touch precedent G6.4 mirrors
exactly**) + G5.4 (`5fcdbde` `[BEAM-CAPSULE-STALENESS-CLOSURE]`; 5
MOD docs-only; ADR-0045 Status flipped; NO ADR-0035 modification;
canonical 5-file scope identical to G6.4) + G3.10 (`08b10ef`
`[BEAM-CAPSULE-EMBEDDING-CLOSURE]`; 6 MOD docs-only; ADR-0043
Status flipped; ADR-0035 §9 cluster expansion 36 → 38 — G6.4 does
NOT follow this expansion-class precedent per Q-G6.4-δ δ-1 LOCK).
**G6.4 follows the G5.4 / G4.4 minimum-touch precedent exactly**:
5 MOD docs-only + Status flip + Gap row flip + catalog mirrors +
**NO ADR-0035 modification** per Q-G6.4-δ δ-1 LOCK.

**Founder authorization explicit at G6.4 closure cascade landing
per RULE 20**:

- `[BEAM-CAPSULE-ROUTING-G6.4-QLOCK]`
- `[BEAM-CAPSULE-ROUTING-G6.4-EXECUTE-VERIFY-AUTH]`

## Post-Closure Implementation Lineage

Post-Closure Implementation Lineage canonical at canonical-execution
register substantively per ADR-0020 two-register IP discipline:

| Sub-phase | Commit | Tag | Substantive landing |
|-----------|--------|-----|---------------------|
| G6.1 | `c130826` | `[BEAM-CAPSULE-ROUTING-ADR]` | ADR-0046 NEW Proposed; canonical dual-context routing model; RULE 21 research arc embedded (RS-G6-1 through RS-G6-4; 20+ documented public sources retrieved 2026-05-19); 11-row enforcement surface inventory; 10-row adversarial threat model T1-T10; 8 RULE 13 substrate-honest drift surfaces for G6.2 cascade; 10 Q-G6 sub-decisions canonical; 4-phase Implementation Lineage with G6.3 DEFERRED disposition |
| G6.2 | `9c3943d` | `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` | Doc-and-test cascade; 13 MOD + 0 NEW corrected scope per Q-G6.2-ι (drifts D-G6.2-1 file-count + D-G6.2-2 ADR-0001 / ADR-0039 filename resolved at `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]`); ADR-0001 in-place Amendment 1 + ADR-0039 in-place Amendment 2 + ADR-0041 §Sub-decision 6 amendment + ADR-0046 G6.2 cascade section + glossary "Digital Twin Wallet" narrow + NEW "Personal AI Agent" + "Enterprise AI Agent" entries + 3 Elixir module docstring corrections + grpc/server.ex:266 forward-substrate comment closure + CLAUDE.md catalog updates + 4 NEW dual-context TS unit tests; baseline deltas unit 562 → 566 (+4 NEW tests); RULE 14 bidirectional citation discipline across all 4 ADR amendments |
| G6.3 | DEFERRED | `[BEAM-CAPSULE-ROUTING-CONTEXT-RESOLVER]` | DEFERRED forward-substrate per Founder G6.3 disposition LOCK + Q-G6.4-η η-1 LOCK preservation; substantive `resolveAiAgentWalletContext` helper not in current closure path; may land later only if separate Founder QLOCK explicitly authorizes AND G6.2 verification proves unresolved ambiguity at wallet-defaulting tier — G6.2 verification PASS substantively does not surface such ambiguity |
| G6.4 | this commit | `[BEAM-CAPSULE-ROUTING-CLOSURE]` | Docs-only closure cascade; 5 MOD per Q-G6.4-γ γ-1 LOCK; ADR-0046 Status `Proposed 2026-05-19` → **`Accepted 2026-05-19`**; Gap 6 row Status IN FLIGHT → CLOSED; README + CLAUDE.md ADR-0046 catalogs flipped per Q-G6.4-ε ε-1 LOCK; NO ADR-0035 modification per Q-G6.4-δ δ-1 LOCK; Sub-arc 2 preserved IN FLIGHT per Q-G6.4-ζ ζ-1 LOCK; G6.3 helper preserved DEFERRED forward-substrate per Q-G6.4-η η-1 LOCK |

**ADR-0046 forward-substrate after closure**: dual-context AI_AGENT
routing model canonical at substrate-architectural register
substantively across ADR-0001 §Amendment 1 + ADR-0039 §Amendment 2
+ ADR-0041 §Sub-decision 6 amendment + ADR-0046 §Decision +
glossary + 3 Elixir module docstrings + grpc/server.ex:266 closure
+ TS dual-context test anchors. G6.3 `resolveAiAgentWalletContext`
helper remains DEFERRED dormant unless future Founder-authorized
QLOCK lands the helper AND a real product flow surfaces unresolved
ambiguity at the wallet-defaulting tier. Sub-arc 2 closure cascade
remains forward-substrate after this commit per Q-G6.4-ζ ζ-1 LOCK +
ADR-0041 CL.1 scope patch register substantively (separate later
commit).
