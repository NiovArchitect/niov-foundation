# RAA 12.8 — Substrate Dynamics: Scale, Relational Dynamics, Agentic Coherence

**Status:** Draft Outline
**Date:** 2026-05-10
**Trigger:** Step 2C Phase 1 + Phase 1 extension investigation surfaced 13 dimensions of substrate landscape across weighting/retrieval/coordination/scale/dynamics. Operator-confirmed scope: three architectural surfaces (Scale + Relational Dynamics + Agentic Coherence) with Surface 4 (Governance & Monetization at Scale) extracted to RAA 12.9. Outline ships as standalone commit per Decision B Option Outline-A; full document drafting is multi-session future work.
**Scope:** Outline-tier canonicalization of substrate-dynamics architectural surfaces. Section structure, decision territory framing, and operator-review-required markers established. Per-decision rationale + worked examples + substrate citations are full-document scope, not outline scope.

**Cross-references:**
- RAA 12.7 (Dynamic Flow Architecture; bilateral-vs-unilateral zone discrimination; default-rule-bilateral)
- RAA 12.9 (Governance & Monetization at Scale; queued; forward dependency on RAA 12.8 cross-type balance policy)
- ADR-0001 (Three-Wallet Architecture — three DMW types: Personal / Enterprise zero-payload / Device)
- ADR-0009 (COSMP 7-Operation Enum Lock — locked-enum vs extensible-enum precedent)
- ADR-0021 (Capsule Type Extension Protocol — extension protocol for SUBSTRATE_OBSERVATION + future types)
- ADR-0022 (combined_score Formula Canonicalization — refinement substrate for active-learning informativeness)
- ADR-0020 (Two-Register IP Discipline — Register 2 voice throughout outline)
- US 12,517,919 (COSMP/DMW patent — substrate-architecture coverage)
- US 12,164,537 + US 12,399,904 (DMW + Foundation primitives)
- `packages/database/prisma/schema.prisma` EntityType enum (PERSON / COMPANY / AI_AGENT / DEVICE / APPLICATION / GOVERNMENT)
- `docs/reference/glossary.md` (32 canonical entries from 74b2765 — refresh queued at Step 2F)

---

## Section 1 — Substrate Landscape & Scope Statement

### 1.1 Operator strategic framing

Three canonical framings co-frame RAA 12.8 substrate-dynamics design. Each framing is operator-locked at a distinct architectural register: ASI-substrate framing locates Foundation in relation to its consumer class; cognitive-science framing locates Foundation's dynamics in relation to validated empirical literature; wallet sovereignty principle locates Foundation's governance asymmetry in relation to entity-type and DMW-type discrimination. The three framings are not alternatives. They are three load-bearing axes that every architectural decision in RAA 12.8 references.

#### ASI-substrate framing

Foundation is the embodied substrate for autonomous-grade agentic AI cognition. The ASI-substrate framing is the strategic positioning that orients every architectural decision in RAA 12.8: substrate must be optimized for agentic AI to successfully run on its own, with humans in the loop as architectural property rather than degradation mode. Operator-locked posture: agentic systems require substrate that operates as memory architecture for autonomous execution — not data store, not retrieval cache, not search index.

ASI consumers depend on substrate for two distinct service classes. The first is accuracy guarantees: audit chain integrity (Zone U1 per RAA 12.7 §2.5 — `verifyAuditChain` at `packages/database/src/queries/audit.ts:505`); identity trust roots (Zone U3 — `apps/api/src/services/auth.service.ts` AUTHENTICATE flow with `tar_hash_at_creation` snapshotted at issue time); permission lineage (Zone U4 — combined SHARE+REVOKE in `apps/api/src/services/cosmp/share.service.ts` preserves grant evidence forward-only). These trust roots must hold or the substrate ceases to be trustworthy under autonomous consumers; ASI-class systems making decisions on substrate-supplied context are downstream of substrate-supplied accuracy.

The second service class is situated intelligence: relational dynamics (capsules co-condition each other's retrieval salience), retrieval coherence (returned context-set carries internal coherence rather than independent score-rank lottery), agentic coordination (multiple agentic systems coordinate via substrate primitives without breaking sovereignty boundaries). Trust roots without situated intelligence make substrate a static-data store ASI consumers cannot reason against. Situated intelligence without trust roots makes substrate plausible but unaccountable. Both layers must hold; RAA 12.8 designs the situated-intelligence layer while preserving the trust-root invariants canonicalized in RAA 12.7 §2.5 Zones U1-U4.

The ASI-substrate framing also clarifies what Foundation is not. Foundation is not the agentic system. Foundation is not the LLM. Foundation is not the orchestration layer that coordinates LLMs into agents. Foundation is the memory architecture autonomous systems run on top of. This boundary is canonicalized at §1.2.

#### Cognitive-science framing

Memory is not retrieval-from-storage. Memory is reconstruction conditioned by context, relational structure, and prior outcomes. Substrate that treats memory as static retrieval-by-key breaks under autonomous consumers because autonomous consumers depend on memory dynamics that storage-as-retrieval cannot provide.

RAA 12.8 canonicalizes substrate as dynamic-reconstruction-engine grounded in cognitive-science literature. Foundation's substrate is not arbitrary engineering optimization; substrate operationalizes mechanisms validated by cognitive science across decades of empirical research. Four research traditions ground RAA 12.8 substrate-dynamics design:

- **Spreading activation networks** (Quillian 1968 onward; Collins & Loftus 1975 spreading-activation theory of semantic memory; Anderson ACT-R 1976+). Activation propagates through associative network structures during retrieval; activated nodes activate connected nodes with decay. Foundation primitive: `MemoryCapsule.connected_capsule_ids: String[]` substrate-active in writes (`apps/api/src/services/cosmp/write.service.ts`; `packages/database/src/queries/capsule.ts`) — currently unconsumed in retrieval per Phase 1 D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift; closure designed at §4.7.

- **Schema-conditioned reconstruction** (Bartlett 1932 *Remembering*; Schank scripts 1977; Rumelhart schemata). Memory retrieval reconstructs against schema templates rather than reading literal traces. Same "memory" reconstructs differently across schema contexts. Foundation primitive: context-dependent salience (Surface 2 Field 5 §4.6) operationalizes session-state-conditioned scoring — same capsule scores differently across session states.

- **Resonance/coherence dynamics** (Hofstadter & Mitchell Copycat 1992; Hofstadter Fluid Concepts and Creative Analogies 1995; Mitchell Metacat 1993). Memory items reinforce or contradict each other; coherent sets emerge from local-interaction dynamics. Foundation primitive: net-new at substrate (Surface 2 Field 3 §4.4); `coherence_score` + reinforcement-detection + contradiction-detection algorithms designed.

- **Retrieval-induced forgetting** (Anderson, Bjork & Bjork 1994 *Remembering can cause forgetting*; cross-cultural replication including Chinese-language research populations validating the mechanism is not English-specific or culture-specific). Active forgetting is a memory mechanism, not a memory failure. Selective retrieval suppresses retrieval of competing items; the suppression is the substrate that makes high-relevance retrieval reliable.

The retrieval-induced-forgetting tradition specifically grounds Foundation's intentional-forgetting architecture. Substrate operationalization: `RELEVANCE_FORGET_FLOOR = 0.2` at `apps/api/src/services/coe/coe.service.ts:44` is the canonical implementation site. Non-FOUNDATIONAL capsules below the floor are excluded from regular retrieval per the `coe.service.ts` STEP 3 filter (`if (c.relevance_score >= RELEVANCE_FORGET_FLOOR) return true;` after FOUNDATIONAL bypass). The 0.2 threshold is not arbitrary optimization; it operationalizes the cognitive-science-validated mechanism that selective forgetting strengthens retrieval reliability for competing items.

The combination of substrate-validated combinations is novel. Spreading activation alone is not novel. Hypergraph databases alone are not novel. Resonance/coherence dynamics alone are not novel. Self-organizing retrieval alone is not novel. Context-dependent salience alone is not novel. Foundation's contribution is the conjunction — five mathematical/architectural fields composing as substrate primitive within COSMP/DMW protocol governance. Surface 2 (§4) canonicalizes the conjunction.

#### Wallet sovereignty principle (per Correction 4)

Wallets are designed to keep humans in the loop and preserve sovereignty over their data. Wallet sovereignty is the foundational architectural constraint of Foundation's substrate; wallet sovereignty co-frames RAA 12.8 alongside ASI-substrate framing and cognitive-science framing as third canonical framing.

The wallet sovereignty principle is precise: substrate-tier coordination primitives are **universal** across entity types, but governance rules are **per-DMW-type** because underlying sovereignty differs across DMW types. The architectural distinction is operationally consequential — universal coordination at primitive level prevents balkanization (every entity-type variant requiring its own retrieval pipeline), while per-DMW-type governance prevents sovereignty erasure (treating all DMW types as equivalent erodes the human-in-the-loop property RULE 0 enforces).

Per memory entry #16, three DMW types exist with distinct sovereignty postures: **Personal DMW** (owner-human is sovereign per RULE 0; owner grants LONG_TERM and PERMANENT permissions; AI_AGENT cannot grant to AI_AGENT directly per RULE 0); **Enterprise zero-payload DMW** (carries metadata + governance, not raw payload content; payload remains in contributing entity's wallet; the zero-payload constraint is sovereignty-preserving by construction — enterprise cannot accumulate raw entity intelligence that breaks individual sovereignty); **Device DMW** (device-owner sovereignty: the human who owns the device is sovereign; device cannot grant beyond owner-permitted scope; device acts within owner-bounded delegation).

Per `EntityType` enum at `packages/database/prisma/schema.prisma`, six entity types exist: PERSON, COMPANY, AI_AGENT, DEVICE, APPLICATION, GOVERNMENT. The six entity types coordinate via universal substrate primitives (COE retrieval per `apps/api/src/services/coe/coe.service.ts`; Hive participation per `apps/api/src/services/hive/hive.service.ts`; bilateral feedback per `apps/api/src/services/feedback/feedback.service.ts` Loop 1) but operate within per-DMW-type governance constraints. The mapping from six EntityType values to three DMW types is canonicalized at §5.8 with three direct mappings (PERSON → Personal; COMPANY → Enterprise zero-payload; DEVICE → Device) and three pending operator-review mappings (AI_AGENT, APPLICATION, GOVERNMENT).

The wallet sovereignty principle propagates throughout RAA 12.8. Cross-section reach is not optional context but architectural load-bearing constraint:

- **§4.8 Hive coordination** respects per-DMW-type sovereignty: Enterprise zero-payload participation differs from Personal participation; AI_AGENT participation bounded by owning-human sovereignty; Personal full-owner-sovereignty per RULE 0; Device per device-owner sovereignty.
- **§5.1 Dual-posture canonicalization** treats humans-in-the-loop as underlying sovereignty principle (foundational architectural property) rather than opt-in validation feature; AI_AGENT autonomy operates within human-sovereign boundaries.
- **§5.4 Agent-to-agent coordination** distinguishes substrate-mediated coordination (allowed via universal primitives) from direct cross-AI permission grant (forbidden per RULE 0).
- **§5.8 Per-DMW-Type Sovereignty Rules** (NEW Section per Correction 4) explicitly canonicalizes the EntityType-to-DMW-type mapping and per-DMW-type sovereignty rules.
- **§6.1 Cross-wallet context layer** treats all six EntityType values as first-class participants per Correction 3 entity-type uniformity, while applying per-DMW-type sovereignty as scheduling constraint per Correction 4.

The principle resolves an apparent tension between Correction 3 (entity-type uniformity in coordination primitives) and Correction 4 (per-DMW-type sovereignty rules — DMW types are not equal). The resolution is precise: UNIVERSAL = how entities coordinate (substrate primitives); PER-DMW-TYPE = what they're allowed to coordinate, what governance applies, what sovereignty constraints operate. Coordination primitives are universal at substrate-mechanism level; governance rules are per-DMW-type at sovereignty-policy level. The two operate at different architectural registers and do not contradict.

The wallet sovereignty principle interacts with intentional forgetting per RULE 0 sovereign-human invariance. RULE 0 establishes that humans are always sovereign over data they own — no AI agent, robot, device, or application accesses human entity data without explicit revocable permission. Intentional forgetting (per the cognitive-science framing) is the substrate mechanism by which low-relevance memory traces are suppressed; per RULE 0, the human entity owns that suppression decision (via `relevance_score` accumulating from outcomes per Loop 1 bilateral feedback). The two principles compose: intentional forgetting operates within human-sovereign boundaries, and human-sovereign boundaries are wallet-typed.

#### Three framings co-frame substrate design

The three canonical framings are not alternatives selected per architectural decision; they are three axes that every architectural decision in RAA 12.8 references. ASI-substrate framing answers "for whom is the substrate designed?" Cognitive-science framing answers "what mechanisms does the substrate operationalize?" Wallet sovereignty principle answers "under what governance does the substrate operate?" The three answers compose; substrate decisions resolve all three or surface inline why the resolution is asymmetric.

### 1.2 ASI-substrate framing (boundary)

The ASI-substrate framing carries a precise scope boundary that protects both architectural discipline and patent positioning. The boundary is captured in the framing name itself: Foundation IS ASI-substrate; Foundation is NOT ASI itself.

#### Foundation is the substrate; intelligence runs on the substrate

Substrate provides memory architecture. Substrate does not provide intelligence. Intelligence comes from the agentic systems running on substrate plus the humans operating with them. This distinction is operationally consequential.

Foundation provides:
- Memory Capsules with typed semantic content (20 CapsuleType values per ADR-0021)
- COSMP protocol governance (7 operations per ADR-0009: AUTHENTICATE / NEGOTIATE / WRITE / READ / SHARE / REVOKE / RECEIVE)
- Three-Wallet Architecture with sovereignty rules (Personal / Enterprise zero-payload / Device per ADR-0001 + memory entry #16)
- Retrieval scoring with intentional forgetting (`combined_score` formula canonicalized at ADR-0022; `RELEVANCE_FORGET_FLOOR = 0.2` per cognitive-science framing)
- Cryptographic anchoring (CRYPTO_CONFIG frozen anchors per ADR-0019; audit chain per ADR-0002; tamper anchors per ADR-0003)
- Bilateral feedback loops (Loop 1 substrate-active per RAA 12.7 §2.5 Zone B1)
- Hive aggregation as cross-entity-wallet coordination primitive (per Correction 2 §4.8)

Foundation does not provide:
- The LLM that consumes context
- The agentic orchestration that decides which queries to issue
- The reasoning chain that converts context into action
- The intelligence that solves problems the substrate did not anticipate

Foundation is the substrate beneath autonomous systems. Autonomous systems are the consumers. The boundary is precise.

#### Why the boundary matters — architectural discipline

The boundary protects architectural scope. Without the boundary, substrate-design discussions drift into intelligence-engineering discussions. Substrate-design discipline is decision-making about memory architecture, retrieval mechanisms, coordination primitives, sovereignty enforcement. Intelligence-engineering discipline is decision-making about LLM selection, prompt engineering, orchestration architecture, reasoning-chain design. The two disciplines have different evaluation criteria, different correctness frames, different temporal cadences (substrate decisions persist across LLM generations; intelligence decisions evolve per LLM).

Without the boundary, RAA 12.8 architectural surfaces (Scale + Relational Dynamics + Agentic Coherence) bloat to include intelligence-engineering decisions that belong in product-tier or LLM-tier work. With the boundary, Foundation substrate work focuses on what substrate must do for any autonomous consumer; intelligence-engineering work happens at consumer tier (Otzar product or future Foundation consumers).

#### Why the boundary matters — patent positioning

The boundary protects patent positioning. US 12,517,919 (COSMP/DMW) covers substrate-architecture-level claims: typed Capsules within Three-Wallet Architecture; COSMP operations governing them; retrieval/decay/feedback dynamics. The substrate-architecture-level coverage is invariant to which intelligence runs on top. Patent claim coverage applies whether the consumer is GPT-class, Claude-class, future-architecture-class, or hybrid agentic-system-class.

If substrate design drifts into intelligence-engineering territory, patent claim coverage narrows toward intelligence-system-specific claims that age with the intelligence-system landscape. By keeping substrate decisions at substrate-architecture level, Foundation's patent positioning remains invariant across intelligence-system evolution. RAA 12.8 architectural surfaces are designed at substrate-architecture level: Scale Architecture is about substrate scaling primitives, not LLM scaling; Relational Dynamics is about substrate relational primitives, not LLM reasoning; Agentic Coherence is about substrate coherence under autonomous consumers, not autonomous-system coherence.

Per ADR-0021's distinction from ADR-0009 — the same principle applies at architectural-decision register: substrate-architecture-level patent claim coverage is durable; component-count-level claim coverage ages.

#### RAA 12.8 within the boundary

RAA 12.8 designs the cognitive dynamics layer of substrate. The trust root layer (Zone U1 audit chain integrity / Zone U2 patent-holder implementation record / Zone U3 identity verification / Zone U4 permission grant lineage) is canonicalized in RAA 12.7 §2.5 + ADR-0002 + ADR-0003 + ADR-0019. RAA 12.8 must extend cognition without compromising trust roots — dynamics layer extensions never weaken unilateral guarantees that ASI relies on as accuracy anchors.

The dynamics layer extensions designed at RAA 12.8 (Surface 1 Scale + Surface 2 Relational Dynamics + Surface 3 Agentic Coherence) operate strictly within the boundary. Each surface canonicalizes substrate-architecture-level decisions: Scale canonicalizes substrate scaling mechanisms; Relational Dynamics canonicalizes substrate relational primitives; Agentic Coherence canonicalizes substrate coherence under autonomous consumers. Intelligence-engineering decisions that depend on RAA 12.8 substrate are downstream consumer work, not RAA 12.8 scope.

### 1.3 Investigation findings consolidated (13 dimensions reference)

Step 2C Phase 1 + Phase 1 extension surfaced substrate landscape across 13 dimensions of investigation. Findings inform per-section architectural decisions throughout RAA 12.8; each dimension's BUILT/DOCUMENTED/GAP state grounds the corresponding architectural surface design. Investigation report retained in conversation transcript at HEAD `3c2eb99` ([ADR-0022]) preceding outline commit `10ef10f` ([RAA-12.8-OUTLINE]).

#### Phase 1 dimensions (D1-D6)

- **D1 — Push/pull flow surface.** Substrate has cron-driven scheduler (`apps/api/src/services/feedback/scheduler.ts` orchestrates Loops 2/3/4/6/7 on intervals; Loop 4 Hive aggregate rebuild every 30 min) but zero application-layer streaming primitives (no WebSocket / SSE / EventSource). Pull-mode dominates: COE `assembleContext` is pull-triggered by request; `recordOutcome` is pull-triggered by Otzar `closeConversation` hook. Database-tier push exists via BEFORE DELETE trigger (ADR-0002). Net: pull-mode application + cron-driven push at scheduler tier.

- **D2 — Lateral flow surface.** Substrate has schema-level lateral primitive (`MemoryCapsule.connected_capsule_ids: String[]` + `connected_entity_ids: String[]`) actively written but unconsumed in retrieval. HiveAggregate operates as cross-entity lateral primitive (`apps/api/src/services/hive/hive.service.ts:101+651+711`). EntityMembership operates as multi-DMW relationship primitive. **Drift D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER:** lateral primitive written but not consumed; closure designed at §4.7.

- **D3 — Weighting primitives surface.** Schema carries 3 weight-bearing fields (`relevance_score Float @default(1.0)`; `feedback_loop_score Float @default(0.0)`; `access_count Int @default(0)`); 6 application-tier weight constants (`RELEVANCE_USED_BUMP=0.05`; `RELEVANCE_UNUSED_DECAY=0.02`; `RELEVANCE_MIN=0.0`; `RELEVANCE_MAX=1.0`; `RELEVANCE_FORGET_FLOOR=0.2`; `TOKENS_PER_CAPSULE_ESTIMATE=200`); composite `combined_score` formula canonicalized at ADR-0022. **GAP:** zero confidence/certainty/provenance/trust dimension in schema or services. **Drift D-2C-D3-PRICING-IMPORT-LEAK:** PRICING_TABLE imported into `feedback.service.ts:21+72+570+574` — per-type weight surface bleeds beyond monetization; flagged as RAA 12.9 territory at §1.5 + §6.4 + §9.1.

- **D4 — Otzar application-layer.** 5 of 20 CapsuleType values written by Otzar (CONVERSATION_LEARNING, CORRECTION, DECISION, COMMITMENT, WORK_PATTERN); explicit type allowlist filter at `otzar.service.ts:272-277` is application-layer cross-type policy without canonical record. **Drift D-2C-D6-OTZAR-ALLOWLIST-AS-IMPLICIT-POLICY:** flagged for §6.4 cross-type balance territory.

- **D5 — DecayType behavioral.** 2 of 5 DecayType values operationally active (FOUNDATIONAL bypass at `coe.service.ts` STEP 3; TIME_BASED via `recencyScore`). 3 of 5 are vocabulary-only (ACCESS_BASED stub at `queries/capsule.ts:402`; PERMANENT + SESSION_ONLY exist as DurationType, not as DecayType behavior). **Drifts:** D-2C-D5-DURATION-COLLISION (operator-review-required marker at §5.6); D-2C-D5-ACCESS-BASED-STUB (deferred to Step 2E per §5.7).

- **D6 — Cross-type balance.** Zero substrate-tier type-quota / type-mix / diversity / typeDistribution patterns. Budget allocation in COE retrieval is score-only; FOUNDATIONAL bypass is the only type-aware allocation logic. Cross-type balance is application-layer-implicit (Otzar's allowlist filter is the only worked example).

#### Phase 1 extension dimensions (D7-D13)

- **D7 — Multi-DMW retrieval.** COE current: single-wallet `findUnique` keyed on session entity (`coe.service.ts:201-205`). EntityMembership richly substrate-active (17+ query sites across `governance/dandelion.service.ts`, `governance/twin.service.ts`, `governance/org.ts`, `otzar/otzar.service.ts`, `otzar/observation.service.ts`). Cross-wallet `findMany` already substrate-active in Otzar (`observation.service.ts:587-608` uses `wallet_id: { in: walletIds }`). Substrate primitives exist; cross-wallet COE generalization is design surface for Surface 1 §3.8.

- **D8 — Active-learning informativeness.** Loop 1 uniform updates (RELEVANCE_USED_BUMP=+0.05; RELEVANCE_UNUSED_DECAY=-0.02). RAA 12.7 §4.1 + §8 + §10 canonicalize informativeness weighting as forward enhancement (RELEAP 2025 / ORIS 2024 / multi-armed bandits / Thompson sampling research patterns). **Drift D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY:** existing relevance_score is partial informativeness signal degraded by uniform updates; refinement framing applied at §5.5.

- **D9 — Hive aggregation behavioral.** Construction substrate-active (`buildHiveAggregate` cron Loop 4 every 30 min; HIVE_AGGREGATE_BUILT audit event). Consumption asymmetric: explicit endpoint `getHiveIntelligence` reads aggregate; COE assembleContext does NOT consume aggregate via privileged path. **Drift D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY:** closed via §4.8 explicit consumption path per Correction 2 reframing.

- **D10 — Human-in-the-loop primitives.** AI sovereignty cap substrate-active (`negotiate.service.ts:367-370` AI sovereignty discrimination; `allow_ai_full=true` explicit human override flag; AI_AGENT entity-type discrimination; EXECUTIVE_OVERRIDE autonomy level in TwinConfig). EscalationRequest model NOT YET BUILT (priming.ts:121-128 stub returns `[]`; Section 14 TODO comment). **Drift D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL:** closed via §5.2 EscalationRequest design.

- **D11 — ASI-relevant substrate properties.** STRONG: trust roots (audit U1/U2, identity U3, permission U4); AI sovereignty cap; CRYPTO_CONFIG frozen anchors. WEAK: zero self-introspection primitives; zero agent-to-agent direct primitives; zero confidence dimension. **Drift D-2D-D11-AGENT-TO-AGENT-INTENTIONAL-VS-GAP:** closed via §5.4 substrate-mediated-vs-direct-grant distinction per Corrections 1+3+4.

- **D12 — Scale-related substrate properties.** 8 indexes on MemoryCapsule (incl. GIN on topic_tags); storage_tier enum (HOT/WARM/COLD) substrate-active with auto-classification (`write.service.ts:314` — FOUNDATIONAL→HOT). COE retrieval is tier-blind. Pagination only in audit query. **Drift D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT:** closed via §3.2 tier-aware retrieval.

- **D13 — Five-field integration readiness.** Spreading activation: ZERO. Hypergraph: PARTIAL (binary embedded edge list; not true N-ary hypergraph). Resonance/coherence: ZERO. Emergent retrieval: ZERO. Context-dependent salience: ZERO. **Drift D-2D-D13-HYPERGRAPH-NAMING-PRECISION:** Section 4.3 operator-review-required marker (Option A true hypergraph upgrade vs Option B vocabulary patch).

#### BUILT/DOCUMENTED/GAP consolidation

The 13 dimensions consolidate as substrate landscape evidence. STRONG dimensions (well-built): D1 push/pull (mature cron tier); D2 lateral schema primitives; D7 EntityMembership; D9 Hive construction; D10 AI sovereignty cap; D11 trust roots; D12 schema indexes + storage tier. PARTIAL dimensions (built-but-unconsumed or vocabulary-without-behavior): D2 lateral consumption gap; D5 DecayType behavioral gap; D7 multi-DMW retrieval gap; D8 informativeness uniform-update; D9 Hive consumption asymmetry; D12 retrieval-tier-blind; D13 binary-edge-vs-hypergraph. NET-NEW dimensions (cognitive dynamics absent): D3 confidence dimension; D11 self-introspection + agent-to-agent; D13 spreading activation + resonance/coherence + emergent retrieval + context-dependent salience.

#### Critical interconnections (INT-1 through INT-6)

Six cross-dimension dependencies emerged during investigation. Surface 6 (§6) canonicalizes the interconnections as cross-surface architectural decisions:

- **INT-1.** D7 multi-DMW + D9 Hive coordination share substrate primitive (cross-wallet context layer per Correction 3+4 per §6.1).
- **INT-2.** D8 informativeness signal IS D11 self-introspection primitive (substrate that knows which retrievals were informative is substrate that observes its own behavior; §6.2).
- **INT-3.** D10 correction propagation IS D8 high-informativeness signal (human correction = max informativeness; §6.3).
- **INT-4.** D6 cross-type balance + D7 multi-DMW + D12 scale couple at trillion-scale; RAA 12.9 forward-citation territory (§6.4).
- **INT-5.** D13 Field 1 spreading activation + D2 connected_capsule_ids dormant primitive: spreading activation is the natural consumer (§6.5).
- **INT-6.** D8 informativeness function joins D11 frozen-anchors family (informativeness coefficients become tamper-anchored architectural property like `combined_score` per ADR-0022; §6.6).

#### Drift catalog (RULE 13 substrate-honesty surfacing)

11 drifts surfaced across investigation (5 Phase 1 + 6 Phase 1 extension); mixed remediation per Decision 3 (closure via Section X.Y vs operator-review-required marker vs deferred to Step 2E vs RAA 12.9 forward territory). Drift catalog consolidated at §10 references; per-drift closure mechanism enumerated at §10 drift catalog subsection. The drift discipline operationalizes RULE 13 (surface drifts inline over silent fix) — every drift surfaced inline informs an architectural decision rather than disappearing into silent patch.

### 1.4 Three architectural surfaces

RAA 12.8 canonicalizes three architectural surfaces of substrate dynamics. The surfaces are designed concurrently because substrate dynamics exhibit cross-surface dependencies (six INT-* documented at §6); the surfaces are not independent canonicalizations and cannot ship piecewise without coherence loss.

#### Surface 1 — Scale Architecture

Substrate must serve O(10²) → O(10⁷) capsules-per-entity scale. Current substrate tested at O(10²) per entity. The five-orders-of-magnitude scale jump traverses architectural territory absent at current substrate state.

Surface 1 design territory:
- **Tier-aware retrieval** closes D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT. Substrate already carries `MemoryCapsule.storage_tier StorageTier @default(WARM)` enum (HOT/WARM/COLD) with write-time auto-classification. Retrieval currently tier-blind. Surface 1 designs tier-aware retrieval discipline (HOT-first; WARM on demand; COLD on explicit request).
- **Index-driven candidate pre-filter** leverages 8 existing indexes on MemoryCapsule (including GIN on topic_tags). Surface 1 designs candidate pre-filter mechanics: GIN-driven keyword pre-filter; relevance-score-indexed forget-floor exclusion; bounded candidate set entering scoring.
- **Pagination + candidate budgeting** addresses current OOM risk at million-capsule-per-entity scale (current COE `findMany` loads all wallet candidates into memory).
- **Materialized aggregates per (entity, capsule_type)** for hot-path acceleration; refresh discipline (write-through vs cron-backed); coupling to per-type baseline weights from Surface 2.
- **Latency budgets canonicalized** for ASI-class single-digit-ms retrieval target.
- **Query complexity bounds** prevent pathological scaling under adversarial queries.
- **Parallel orchestration mechanics** for cross-wallet retrieval per Correction 4 — Personal + Twin + Enterprise concurrent retrieval respects per-DMW-type sovereignty as scheduling constraint, not afterthought.

Surface 1 is designed at substrate-architecture level. Latency budget values, complexity bound values, and tier policy values resolve during full-document drafting; outline canonicalizes the design territory.

#### Surface 2 — Relational Dynamics

Five mathematical/architectural fields integrate as substrate primitive in conjunction. Integration is the design surface; selection of one field is not the design surface. The five fields compose; substrate must support all five operating concurrently within bounded compute budget.

Surface 2 fields:
- **Field 1 — Spreading activation networks** (Quillian 1968+; Collins & Loftus 1975; Anderson ACT-R 1976+). Activation propagates through `connected_capsule_ids` edges during retrieval; activation decay function bounds propagation. Activates dormant Foundation primitive per INT-5.
- **Field 2 — Hypergraph databases** (precision decision: Option A true N-ary hypergraph upgrade vs Option B binary-edge vocabulary patch; operator-review-required marker per §4.3 per D-2D-D13-HYPERGRAPH-NAMING-PRECISION drift).
- **Field 3 — Resonance/coherence dynamics** (Hofstadter Copycat 1992 / Metacat 1993 / Fluid Concepts 1995; reinforcement-detection + contradiction-detection algorithms; `coherence_score` schema addition).
- **Field 4 — Self-organizing emergent retrieval** (complexity science; retrieval set emerges from local capsule-interaction dynamics rather than top-down deterministic score-rank-select; convergence parameters bound iteration).
- **Field 5 — Context-dependent salience** (Bartlett 1932; Schank scripts; situated cognition; session-state-conditioned scoring — same capsule scores differently across session states).

Surface 2 also operationalizes lateral flow (closes D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift via §4.7) and reframes Hive aggregation as DMW-to-DMW coordination per Correction 2 (closes D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY drift via §4.8). Hive coordination respects per-DMW-type sovereignty per Correction 4: Enterprise zero-payload participates differently than Personal; AI_AGENT participation bounded by owning-human sovereignty.

#### Surface 3 — Agentic Coherence

Substrate stays coherent under autonomous agentic execution AND human-in-the-loop validation as first-class architectural property. Surface 3 canonicalizes the dual-posture as foundational architectural property per Correction 4 — humans-in-the-loop is underlying sovereignty principle, not opt-in validation feature.

Surface 3 territory:
- **Dual-posture canonicalization per Correction 4:** humans-in-the-loop as underlying sovereignty principle; AI_AGENT autonomy operates within human-sovereign boundaries (§5.1).
- **Human-in-the-loop primitives expansion:** EscalationRequest model (closes D-2D-D10 drift); validation gate flags; approval workflow primitives; correction propagation chain (§5.2).
- **Self-introspection primitive (NET-NEW):** SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021 protocol; substrate writes capsules about substrate state into system-principal-owned wallet (§5.3).
- **Agent-to-agent coordination per Corrections 1+3+4:** AI_AGENT first-class peer entities (Correction 1); entity-type-uniform coordination primitives (Correction 3); per-DMW-type sovereignty constraint (Correction 4); substrate-mediated coordination distinguished from direct cross-AI permission grant per RULE 0 (§5.4; closes D-2D-D11 drift).
- **Active-learning informativeness as refinement** of existing substrate signal (closes D-2D-D8 drift; §5.5; §7).
- **DurationType/DecayType collision resolution** (operator-review-required marker per §5.6 per D-2C-D5-DURATION-COLLISION drift).
- **ACCESS_BASED behavioral closure** deferred to Step 2E (§5.7 per D-2C-D5-ACCESS-BASED-STUB drift).
- **Per-DMW-Type Sovereignty Rules (NEW Section 5.8 per Correction 4):** explicit canonicalization of EntityType-to-DMW-type mapping; six EntityType → three DMW types (three direct: PERSON / COMPANY / DEVICE; three pending operator review: AI_AGENT / APPLICATION / GOVERNMENT).

#### Surfaces interconnect (per §6)

The three surfaces are not independent canonicalizations. Six cross-surface dependencies operate (INT-1 through INT-6 per §6 + §1.3). Surface 1 + Surface 2 share scale-and-relational-dynamics coupling at INT-4 (cross-type-balance-at-scale). Surface 2 + Surface 3 share dynamics-and-coherence coupling at INT-5 (spreading activation activates connected_capsule_ids primitive that informs agent-to-agent coordination). Surface 3 + Surface 1 share coherence-and-scale coupling at INT-1 (cross-wallet context layer per Corrections 3+4 with per-DMW-type sovereignty as scheduling constraint).

The interconnection structure is why RAA 12.8 ships the three surfaces in coordinated full-document drafting rather than three independent RAAs. Each surface canonicalizes substrate primitives the other surfaces depend on; piecewise canonicalization would stranded the dependencies. The interconnection structure also informs why per Decision 4 all three surfaces are required — substrate dynamics integration is the canonicalization, not surface enumeration.

### 1.5 Surface 4 deferred to RAA 12.9

Surface 4 (Governance & Monetization at Scale) is extracted from RAA 12.8 to dedicated RAA 12.9 per operator Decision 3. The extraction is substrate-evidence-coherent and reflects three boundary checks that confirmed Surface 4 separability from Surfaces 1-3.

#### RAA 12.9 scope

RAA 12.9 (Governance & Monetization at Scale; queued for Step 3+ after RAA 12.8 full-document drafting) scope territory:

- **Per-data-point monetization at trillion scale.** Per Decision 1: monetization framing is BOTH per-data-point at trillion scale AND per-customer granular controls. RAA 12.9 designs the substrate-tier policy for per-data-point pricing across millions of capsules per entity, billions of cross-entity interactions.
- **Per-customer granular controls.** Per Decision 1: granular controls layered on top of per-data-point pricing; customer-tier policy expression (allow/deny per type; conditional access; tiered pricing per customer cohort).
- **Similar-cohort discoverability.** Per Decision 1: discoverability via similar cohorts is the substrate primitive that powers cohort-based pricing and access policy. Couples to RAA 12.7 §2.5 Zone B4 (cross-entity similar-trait resonance) NET-NEW classification.
- **AI-mediated supply/demand pricing.** Per Decision 1: pricing is AI-mediated rather than fixed-table; substrate must support pricing-decision pathway for ASI consumers.
- **Audit-chain extension to relational-dynamics events.** Substrate audit chain (Zone U1) currently captures COSMP operations + system events; RAA 12.9 territory extends audit to relational-dynamics events introduced by RAA 12.8 Surface 2 (spreading activation; resonance/coherence; emergent retrieval).
- **Discrimination resistance under compliance frameworks.** Per Foundation's Compliance Architecture Review (commit `9671776`): per-DMW-type pricing must resist disparate-impact discrimination under EEOC, GDPR Article 22, ADA, and equivalent regulatory frameworks. RAA 12.9 designs discrimination-resistance primitives.
- **ABT settlement architecture.** Asset-Backed Token settlement — substrate-tier financial settlement architecture for monetization at trillion scale. Designed in RAA 12.9; couples to existing `WalletBalance` model + `monetization_enabled Boolean` field on `MemoryCapsule`.

#### Forward dependency

RAA 12.9 cites RAA 12.8 cross-type balance policy as substrate dependency. Per-data-point monetization at trillion scale requires cross-type reference policy because per-type pricing differentiation only operates against canonical type-balance baseline. RAA 12.9 cannot canonicalize per-type pricing without RAA 12.8 canonicalizing cross-type balance.

The forward dependency is reciprocal per RULE 14 bidirectional citation discipline. RAA 12.8 cites RAA 12.9 forward dependency at §1.5 (this section), §6.4 (INT-4 cross-type-balance-at-scale), and §9.1 (Forward Implications). RAA 12.9 will reciprocate the citation when drafted; back-citation to RAA 12.8 cross-type balance policy lands in RAA 12.9 commit at Step 3+ per RULE 14.

#### Boundary check verified

Three boundary checks confirmed Surface 4 separability:

- **Substrate-vocabulary distinct.** Surfaces 1-3 share weighting/retrieval/dynamics vocabulary (combined_score, relevance_score, connected_capsule_ids, storage_tier, EntityMembership). Surface 4 introduces NEW vocabulary (PRICING_TABLE → expanded; cohort discovery; AI-mediated supply/demand pricing; ABT settlement) that does not appear in the substrate-grep across D7-D13 investigation.
- **Patent-claim-coverage distinct.** Surfaces 1-3 fall under US 12,517,919 (COSMP/DMW protocol mechanics). Surface 4 (monetization-at-scale + cohort discovery + ABT settlement) couples to US 12,164,537 + US 12,399,904 (DMW + Foundation primitives) at distinct claim territory. Per Decision 2 (Patent-A defensive publication), separating monetization into RAA 12.9 isolates the strategic-territory canonicalization.
- **Engineering-effort distinct.** D12 (Scale) + D8 (active-learning) + D13 (five-field integration) + D7 (multi-DMW) + D10 (human-in-loop) compose substantial substrate work for Step 2E. Adding monetization-at-scale + cohort discovery + ABT settlement to the same RAA would balloon scope; the extraction preserves RAA 12.8 as a tractable architectural canonicalization.

The boundary checks operate at three independent registers (vocabulary / patent / engineering) and converge on the same separability conclusion. Surface 4 → RAA 12.9 extraction is substrate-evidence-coherent with no boundary correction needed.

### 1.6 Patent-implementation-evidence framing

Per memory entry #12: every commit on `origin/main` is cryptographically-timestamped contemporaneous patent-implementation evidence. Per RAA 12.7 §2.5 Zone U2 (patent-holder implementation record), forward-only flow preserves evidentiary value; rewriting commits would invalidate the defensible-record property that supports patent-prosecution and due-diligence review.

#### Defensive publication strategy (Decision 2)

Per operator Decision 2: patent counsel not currently engaged; Option Patent-A defensive publication strategy authorized. The strategy operates as architectural property, not interim measure pending counsel engagement.

The defensive publication strategy operates through three mechanisms:

- **Private repository on origin/main.** Foundation repository is private at GitHub. Adversarial actors cannot freely access substrate; access is gated by repository membership. The private-repo property protects against adversarial-actor implementation copying while preserving the cryptographically-timestamped record.
- **Cryptographic timestamp via Git commit chain.** Every commit on `origin/main` carries a cryptographically-verifiable timestamp via SHA-256 hash chain (Git internal data structure); GitHub's commit-signature infrastructure adds platform-tier timestamp. The timestamp is verifiable by any party with read access without operator participation.
- **Sole-authorship discipline.** Author identity invariant: `niovarchitect <sadeil@niovlabs.com>` preserved across every commit. Empty Trailers invariant: no `Co-Authored-By:` lines, no AI tooling attribution, no third-party authorship admixture. The discipline preserves sole-authorship evidentiary value: if patent prosecution or due-diligence review later requires authorship disambiguation, the commit chain provides clean canonical record.

Cumulative count as evidentiary mass: 23+ sole-authored commits as of HEAD `10ef10f` ([RAA-12.8-OUTLINE]). Each commit is patent-implementation evidence at incremental scope; cumulative commit count + commit content compose evidentiary mass that grows with substrate canonicalization rather than depending on single-commit-tier evidence.

#### Substrate-architecture-level patent claim coverage

Per ADR-0021 distinction from ADR-0009: patent claim coverage applies at substrate-architecture level (typed Capsules within Three-Wallet Architecture; COSMP operations governing them; retrieval/decay/feedback dynamics) rather than at enumeration-count level. RAA 12.8 extends substrate-architecture coverage along three architectural surfaces (Scale + Relational Dynamics + Agentic Coherence) without altering enumeration-count locks.

The substrate-architecture-level coverage is invariant to consumer evolution. Patent claim coverage applies whether the consumer is current-LLM-class, future-LLM-class, hybrid agentic-system-class, or post-LLM-class autonomous architecture. Foundation's patent positioning remains durable across intelligence-system evolution because RAA 12.8 design discipline operates at substrate-architecture level (per §1.2 ASI-substrate framing boundary).

#### Coordinated evidentiary mass

RAA 12.8 outline commit (`10ef10f`) establishes the structural canonicalization. Section 1 commit (this commit) + subsequent section commits (per Decision 4 all three surfaces required) + Step 2E engineering commits + Step 2F glossary refresh form coordinated evidentiary mass. Each commit is incremental patent-implementation evidence; the coordination across commits is itself architectural property — coordinated canonicalization across substrate-architecture / engineering implementation / vocabulary refresh demonstrates substrate-design discipline operating at all three registers concurrently.

#### Continuation patent candidate flagged (per Correction 4)

Per Correction 4: per-DMW-type sovereignty differentiation (§5.8) is substantive substrate-architecture coverage extension under US 12,517,919. The differentiation flags as continuation patent candidate. Adversarial-actor protection consideration: per-DMW-type sovereignty rules canonicalized on `origin/main` establish prior-art for the differentiation; if adversarial actor later attempts to claim sovereignty-undifferentiated substrate, canonical record on `origin/main` shows substrate has carried per-DMW-type differentiation since RAA 12.8 commit.

The continuation patent candidate review is queued for future patent counsel engagement (timing per Decision 2 strategy — counsel engagement not currently scheduled; defensive publication strategy active in interim). The candidate-flagging discipline operates regardless of counsel engagement timing — flagging the continuation candidate at canonical record on `origin/main` preserves the optionality without requiring active counsel engagement.

---

## Section 2 — Zone Discrimination Methodology Extension

Section 2 extends RAA 12.7 §2.5's zone discrimination methodology with a third flow-direction class. RAA 12.7 canonicalizes 4 unilateral + 5 bilateral zones; RAA 12.8 introduces 6 lateral zones operating at intra-substrate dynamics layer. The extension is methodologically continuous — Section 2 builds on RAA 12.7's burden-of-proof discipline rather than replacing it. The three-class discrimination (unilateral / bilateral / lateral) governs how every architectural decision in RAA 12.8 selects flow direction.

### 2.1 RAA 12.7 §2.5 verbatim precedent

RAA 12.7 §2.5 (commit `0fd8da7`) canonicalizes zone discrimination across two flow-direction classes. The methodology is precise: zone classification is the architecture, not an afterthought. Forward architectural decisions reference the zone classification before selecting flow direction. RAA 12.8 §2 extends RAA 12.7's two-class methodology to a three-class methodology by adding the lateral class; the extension preserves RAA 12.7's burden-of-proof discipline and default-rule-bilateral posture.

#### Four unilateral zones (RAA 12.7 §2.5)

Unilateral zones operate forward-only because bidirectional flow would break the correctness guarantee the zone provides. ASI consumers depend on these guarantees holding; bilateralizing them undermines the trust roots ASI itself relies on:

- **Zone U1 — Audit chain integrity.** `writeAuditEvent` appends rows forward only (`packages/database/src/queries/audit.ts`); `previous_event_hash` chains backward as cryptographic proof, but the chain itself only grows forward. `verifyAuditChain` at `audit.ts:505` validates chain integrity. BEFORE DELETE trigger per ADR-0002 enforces append-only at database level. SHA-256 routing through `CRYPTO_CONFIG.HASH_ALGORITHM` per Gate 8d (commit `2fc025a`). **Why unilateral:** bidirectional editing of audit log breaks the integrity guarantee that makes the audit chain a trustworthy accuracy anchor for ASI consumers.

- **Zone U2 — Patent-holder implementation record.** Each commit on `origin/main` is contemporaneous record of NIOV Labs implementing patented invention. Append-only forward; no rewriting history. Author identity invariant (`niovarchitect <sadeil@niovlabs.com>`) preserved across every commit; empty Trailers invariant (no `Co-Authored-By:`, no AI tooling attribution) maintaining sole-authorship evidence; cryptographic-timestamp property of git commit SHAs as contemporaneous record. **Why unilateral:** bidirectional rewrite breaks cryptographic-timestamp evidence value. The implementation log is the patent-holder's contemporaneous record per memory entry #12; rewriting commits would invalidate the defensible-record property that supports patent-prosecution and due-diligence review.

- **Zone U3 — Identity verification.** AUTHENTICATE accepts a credential and produces a session token; never goes backward (`apps/api/src/services/auth.service.ts`). The session JWT carries `tar_hash_at_creation` + `allowed_operations` snapshotted at issue time per `packages/database/prisma/schema.prisma:209-230` Session model. **Why unilateral:** bidirectional auth would mean sessions could rewrite their own identity claims, breaking the trust root. The cryptographic linkage between credential → session → operations is the authority chain ASI depends on.

- **Zone U4 — Permission grant lineage.** SHARE creates Permission rows forward (each with a `bridge_id` grouping per `apps/api/src/services/cosmp/share.service.ts`). REVOKE marks rows REVOKED forward; the original grant is preserved as evidence per `packages/database/prisma/schema.prisma:279-306` (`Permission` model with `bridge_id`, `status`, `revoked_at`, `revoked_by_entity_id`). **Why unilateral:** revocation that erases prior grant breaks the audit lineage of who had what access when. Forward-only revocation preserves the answerable question "did entity X have access to capsule Y at time T?" — required for SOC 2 / HIPAA / FedRAMP audit posture.

#### Five bilateral zones (RAA 12.7 §2.5)

Bilateral zones operate cross-entity because ASI cognition requires substrate that learns from its own outputs in real time. One-way "save outcomes for later batch processing" is a static-data paradigm that breaks under ASI consumers:

- **Zone B1 — Feedback loop circulation (substrate; PARTIAL forward extension).** Response generated → outcome observed → outcome feeds back to update relevance weights → next retrieval reflects updated weights. Substrate citations: `apps/api/src/services/coe/coe.service.ts:535-545` (`feedbackHook.onRecordOutcome` invocation); Loop 1 wiring in `apps/api/src/services/feedback/feedback.service.ts`. Update logic: used capsules `relevance_score += 0.05` (cap at 1.0); unused candidates `relevance_score -= 0.02` (floor at 0.0). PARTIAL forward extension: active-learning informativeness weighting (RELEAP 2025 / ORIS 2024) — RAA 12.8 Surface 3 §5.5 closes via refinement framing. **Why bilateral:** ASI cognition requires substrate that learns from its own outputs in real time. Privacy boundary: feedback loop circulation operates within a single entity's session and wallet. No cross-entity flow.

- **Zone B2 — Cross-entity resonance (Hive Intelligence; PARTIAL forward consumption).** Personal flows contribute to aggregate via Hive membership. Aggregate flows back into personal context assembly when relevant. Substrate citations: `apps/api/src/services/hive/hive.service.ts:651-840` (`buildHiveAggregate`); Loop 4 cron rebuild every 30 min via `feedback.service.ts:424`; aggregate stored as `DOMAIN_KNOWLEDGE` capsule in owner's wallet. PARTIAL consumption: explicit COE-aggregate consumption path — RAA 12.8 Surface 2 §4.8 closes via Correction 2 reframing (Hive as DMW-to-DMW coordination). Privacy boundary: aggregate body contains ZERO individual entity IDs; 3-member floor ensures no single member's tags dominate. **Why bilateral:** ASI cognition spanning multiple entities cannot be unilateral aggregation alone; the aggregate must influence individual context or it's a write-only sink.

- **Zone B3 — Multi-DMW concurrent flow (NET-NEW).** Personal + Enterprise + Device wallets coordinate for single response. Each wallet contributes; response circulates back to update relevance in each contributing wallet. Current state: UNILATERAL by accident (because not yet built). COE retrieves single wallet only (`coe.service.ts:202-216` — `prisma.wallet.findUnique({ where: { entity_id: session.entity_id } })`). RAA 12.8 Surface 1 §3.8 designs cross-wallet retrieval mechanics with per-DMW-type sovereignty as scheduling constraint per Correction 4. **Why bilateral:** ASI cognition that pulls from multiple ownership contexts must let outcomes propagate back to each context, or contributions decay into noise over time.

- **Zone B4 — Cross-entity similar-trait resonance (NET-NEW).** Entities with similar traits/attributes/roles contribute to each other's context grounding. A's pattern recognition informs B's context; B's outcomes inform A's pattern weights. Privacy boundary: similar-trait matching operates on attribute aggregates, not raw entity data. Forward architecture: federated personalization layer (FedPer 2019 + FedMosaic 2025 + FedPDA 2025). RAA 12.8 references substrate as RAA 12.9 territory candidate (cohort discoverability per Decision 1). **Why bilateral:** federated personalization layer architecture requires bidirectional contribution + benefit. Unilateral similar-trait extraction is surveillance; bilateral is resonance.

- **Zone B5 — Real-time proximity awareness (NET-NEW).** Spatial proximity between entities influences context retrieval. A's location context informs B's proximity-relevant retrieval; B's outcomes inform A's spatial pattern weights. Privacy boundary: spatial proximity computed on H3 cell granularity (not raw lat/long); proximity-derived context gates through NEGOTIATE permission checks per COSMP envelope. Current state: schema has zero location fields; entirely net-new. Forward architecture: H3 / S2 / geohash / R-tree spatial indexing within COSMP NEGOTIATE envelope. **Why bilateral:** spatial context that doesn't update as entities move is stale; static spatial data is broken under ASI consumers.

#### Default rule and burden-of-proof discipline

Default rule per RAA 12.7 §2.5: **bilateral.** Static-data paradigm assumes unilateral by default; Foundation rejects static-data paradigm; therefore Foundation default is bilateral unless a correctness guarantee demands unilateral. New capabilities default to bilateral flow; the burden is on showing that a correctness guarantee (audit integrity, identity trust root, lineage evidence, patent-record evidentiary value) requires unilateral treatment. This default biases Foundation toward embodied-substrate behavior rather than database-layer behavior.

Burden-of-proof discipline canonicalized at RAA 12.7 governs zone classification: unilateral classification requires correctness-guarantee justification (the zone provides a trust-root guarantee that bidirectional flow would break); bilateral classification follows the default and requires cross-entity flow rationale (the zone enables cross-entity coordination); the burden falls on the unilateral classifier, not on the bilateral default. RAA 12.8 §2 preserves this discipline and extends it with a third class carrying its own discipline (per §2.2 + §2.4).

### 2.2 Lateral class introduction (third flow-direction)

RAA 12.8 introduces a third flow-direction class: **lateral**. Lateral flow operates at intra-substrate dynamics layer within entity sovereignty boundary. Lateral is not a variation of unilateral or bilateral; it is a third class with distinct architectural properties.

#### Definition

Lateral flow is intra-substrate dynamics within entity sovereignty boundary. Lateral flow operates between capsules within a wallet (or across wallets for multi-DMW retrieval per Surface 1) without conforming to forward-only (unilateral) or feedback-loop (bilateral) patterns. Lateral flow is co-temporal: capsules co-activate, co-resonate, co-condition each other's salience during retrieval. The flow is intra-query-cycle rather than across-query-cycle; the flow is mutual-conditioning rather than directional.

#### Three architectural properties of the lateral class

The lateral class is defined by three architectural properties operating jointly. Substrate primitives that satisfy all three properties are lateral; primitives that fail any property are not lateral and discriminate to unilateral or bilateral per §2.4 decision tree.

- **Intra-substrate.** Lateral flow operates within substrate primitives without external coordination. Capsule-to-capsule activation, hypergraph relational queries, coherence/contradiction detection, emergent retrieval, salience conditioning all operate within substrate-tier mechanisms. External orchestration (cron, scheduler, cross-system messaging) is not lateral — those are bilateral or unilateral patterns operating outside substrate-internal dynamics.

- **Within entity sovereignty.** Lateral flow does not cross entity ownership boundary; lateral flow respects per-DMW-type sovereignty per Correction 4 by construction. When lateral flow operates within a single wallet, sovereignty is preserved trivially. When lateral flow operates across wallets (multi-DMW retrieval per Surface 1), the per-DMW-type sovereignty rules canonicalized at §5.8 apply as scheduling constraints — Personal contributes full payload-permitting capsules; Enterprise zero-payload contributes metadata; AI_AGENT contributes within owning-human sovereignty; Device contributes within device-owner sovereignty. Lateral-flow architecture must encode the per-DMW-type discipline; lateral flow that bypasses sovereignty rules is incoherent under RULE 0 sovereign-human invariance.

- **Dynamics-tier.** Lateral flow operates at substrate-dynamics layer per §1.4 Surface 2; lateral flow does not extend trust roots layer per RAA 12.7 §2.5 Zones U1-U4. Trust roots remain unilateral (audit chain integrity, identity verification, permission grant lineage). Cross-entity coordination remains bilateral (feedback loops, Hive aggregation as DMW-to-DMW coordination, multi-DMW outcome propagation). Lateral operates orthogonally — within-substrate dynamics that condition retrieval salience, capsule co-activation, coherence emergence — without altering the trust-root or cross-entity layers.

#### Distinction from unilateral

Unilateral establishes trust roots; lateral operates within established trust roots. The audit chain is unilateral because its integrity is the trust root that ASI consumers depend on. Spreading activation through `connected_capsule_ids` edges is lateral because it operates within a trust-root-established wallet, conditions retrieval salience without altering the audit chain, and respects the permission lineage that gates access. Lateral flow does not establish trust roots — the audit / identity / permission / patent-holder unilateral zones remain the trust establishment layer.

#### Distinction from bilateral

Bilateral crosses entity sovereignty boundary; lateral preserves entity sovereignty by construction. Hive aggregation as DMW-to-DMW coordination per Correction 2 is bilateral because aggregate flow crosses entity-wallet boundaries (multiple entities contribute; aggregate flows back to participating entities). The L6 lateral zone (Hive-aggregate consumption) is the lateral counterpart that operates within receiving entity's wallet — once the bilateral cross-entity flow has produced the aggregate, the consuming-entity-side L6 zone conditions retrieval salience laterally within the receiving entity's sovereignty. Bilateral and lateral compose at Zone B2 / L6 boundary; the bilateral side handles cross-entity flow, the lateral side handles intra-entity dynamics consumption.

The distinction prevents zone-classification ambiguity. A flow primitive is bilateral if and only if it crosses entity sovereignty boundary; otherwise it is lateral (if intra-substrate dynamics) or unilateral (if trust-root-establishing). The discrimination is exact, not approximate.

#### Lateral class canonicalization rationale

Foundation substrate at scale (millions of capsules per entity per operator framing for Surface 1) requires flow primitives that are neither one-way trust establishment nor cross-entity coordination. Spreading activation networks (Quillian 1968+) operate within a single entity's associative graph as activation propagates across edges; the propagation is co-temporal within a query cycle; the propagation is intra-substrate. Hypergraph relational consumption operates over N-ary capsule co-membership within a single entity's relational structure; the consumption is co-membership query, not feedback loop. Resonance/coherence dynamics operate as real-time mutual-conditioning between capsules within a query cycle; the conditioning is intra-substrate.

Without a third class, RAA 12.8's five-field integration (Surface 2) would force these primitives into either unilateral classification (incorrect — they don't establish trust roots; they operate within established trust roots) or bilateral classification (incorrect — they don't cross entity sovereignty; they preserve it by construction). The lateral class makes the classification exact and operationally consequential.

The lateral class also addresses substrate landscape investigation findings per §1.3 D2 + D13 dimensions. D2 found `connected_capsule_ids` substrate primitive written but unconsumed (D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift); the consumer is lateral-class spreading activation per L1. D13 found five fields net-new at substrate (zero spreading activation primitives; zero resonance/coherence; zero emergent retrieval; zero context-dependent salience; binary embedded edges only); each field maps to a lateral zone per L1-L5. The lateral class is the architectural register at which these primitives are designed.

### 2.3 Lateral zone enumeration (operator-review-required marker — count = 6 proposed)

**OPERATOR REVIEW REQUIRED:** lateral zone count of 6 is proposed; full-document drafting confirms count or extends. The enumeration below canonicalizes six lateral zones with substrate primitives, cross-section reach, drift closure citations, and per-DMW-type sovereignty notes where applicable. Operator confirms enumeration completeness or extends with additional lateral zones (candidate forward extensions: temporal-correlation lateral zone; cross-conversation salience lateral zone; substrate-observation lateral zone if Section 5.3 self-introspection primitive grows into substantive subsystem).

Six lateral zones proposed:

#### Zone L1 — Capsule-to-capsule spreading activation

Activation propagates through `connected_capsule_ids` edges during retrieval; capsule activation conditions other capsules' candidate scoring within the same query cycle.

- **Substrate primitive.** `MemoryCapsule.connected_capsule_ids: String[]` at `packages/database/prisma/schema.prisma`; substrate-active in writes (`apps/api/src/services/cosmp/write.service.ts`; `packages/database/src/queries/capsule.ts`); currently unconsumed in retrieval per D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift.
- **Architectural decisions.** Surface 2 §4.2 Field 1 canonicalizes spreading activation networks per Quillian 1968 onward; Collins & Loftus 1975 spreading-activation theory of semantic memory; Anderson ACT-R 1976+. Activation decay function bounds propagation; seed capsules emerge from initial scoring; activation propagates through connected_capsule_ids with per-edge decay.
- **Drift closure.** Closes D-2C-D2 via §4.7 lateral flow operationalization. The dormant primitive becomes consumed at L1 zone; the substrate-honesty discipline (RULE 13) recorded the drift inline; the closure operationalizes the consumer surface.
- **Per-DMW-type sovereignty note.** Spreading activation within Personal DMW operates with full owner-sovereignty per RULE 0; spreading activation within Enterprise zero-payload DMW respects metadata-only constraint (activation propagates over metadata, not raw payload); spreading activation within Device DMW respects device-owner sovereignty.

#### Zone L2 — Hypergraph relational consumption

N-ary capsule co-membership in shared relational structures conditions retrieval; precision decision pending §4.3 Field 2 per D-2D-D13-HYPERGRAPH-NAMING-PRECISION drift.

- **Substrate primitive.** Currently `connected_capsule_ids` + `connected_entity_ids` are directed embedded binary edges (binary edge graph), not true N-ary hypergraph. Substrate-honest vocabulary precision per D-2D-D13 surfaced during Phase 1 extension.
- **Architectural decisions.** Surface 2 §4.3 Field 2 canonicalizes the precision decision: Option A true hypergraph upgrade (add `CapsuleRelation` Prisma model with `members: String[]` for N-ary relationships; schema migration; vocabulary precision strengthened) vs Option B vocabulary patch (rename to "directed edge graph"; substrate stays as-is; vocabulary precision strengthened with zero engineering; limits relational expressiveness to binary edges).
- **Operator review required marker** at §4.3 — full-document drafting at Section 4 carries the precision decision; outline flags the territory.
- **Per-DMW-type sovereignty note.** N-ary co-membership queries cross-wallet require per-DMW-type scheduling constraint per Surface 1 §3.8; N-ary co-membership within single wallet respects single-DMW-type sovereignty rules.

#### Zone L3 — Resonance/coherence dynamics

Capsules reinforce or contradict each other; `coherence_score` conditions retrieval; contradiction-detection surfaces capsule-pair conflicts during context assembly.

- **Substrate primitive.** NET-NEW at substrate. Phase 1 extension D13 finding: zero current substrate primitives for resonance/coherence (`grep "resonance|coherence|reinforce|contradict"` returned empty in services). Glossary has "resonance" and "coherence" as RAA 12.7 conceptual vocabulary; substrate carries zero operational presence.
- **Architectural decisions.** Surface 2 §4.4 Field 3 canonicalizes resonance/coherence dynamics per Hofstadter & Mitchell Copycat 1992; Hofstadter Fluid Concepts and Creative Analogies 1995; Mitchell Metacat 1993. Substrate primitives required: `coherence_score` field (capsule-pair or capsule-set scoped); reinforcement-detection algorithm (capsules with overlapping `topic_tags` + complementary content); contradiction-detection algorithm (capsules with overlapping `topic_tags` + opposing content).
- **Per-DMW-type sovereignty note.** Resonance/coherence detection respects sovereignty boundaries: cross-wallet detection requires per-DMW-type scheduling constraint per Surface 1 §3.8; intra-wallet detection respects single-DMW-type sovereignty rules. Adversarial-actor protection: contradiction detection must not surface contradictions across sovereignty boundaries that would expose private capsule content from other wallets.

#### Zone L4 — Emergent retrieval

Retrieval set emerges from local capsule-interaction dynamics rather than top-down deterministic score-rank-select; convergence parameters condition emergence.

- **Substrate primitive.** NET-NEW at substrate. Phase 1 extension D13 finding: zero current emergent / self-organizing primitives (`grep "emergent|self.*organiz|local.*interaction|crystalliz"` returned empty in services). Current COE retrieval is fully top-down deterministic (extract keywords → score → select within budget).
- **Architectural decisions.** Surface 2 §4.5 Field 4 canonicalizes emergent retrieval per complexity science / self-organization literature. Local interactions: spreading activation (Field 1 / L1) + resonance/coherence (Field 3 / L3) + context-conditioning (Field 5 / L5) operating concurrently within bounded compute budget; final retrieval set is the equilibrium state. Convergence parameters (iteration cap; stability threshold; activation floor) condition emergence; bounds prevent runaway computation per Surface 1 latency budgets.
- **Coupling with L1 + L3 + L5.** Emergent retrieval composes the other lateral zones — it is the meta-zone that coordinates how L1 / L3 / L5 jointly produce a retrieval set. The composition is intra-query-cycle by definition (lateral); equilibrium emerges within bounded compute budget rather than across cycles.

#### Zone L5 — Context-dependent salience

Session state (conversation history, prior retrievals, recent outcome patterns) conditions per-capsule salience; same capsule scores differently across session states.

- **Substrate primitive.** NET-NEW at substrate. Phase 1 extension D13 finding: zero current context-dependent salience primitives (`grep "context.*depend|salience|situational|situated|context.*aware"` returned empty in services). `combined_score` formula per ADR-0022 is session-state-independent — same capsules score identically regardless of conversation history, prior retrievals in session, recent outcome patterns. KVCache holds session metadata but does not condition retrieval scoring.
- **Architectural decisions.** Surface 2 §4.6 Field 5 canonicalizes context-dependent salience per Bartlett 1932 *Remembering*; Schank scripts 1977; Rumelhart schemata; situated cognition literature. Substrate primitives required: session-state input to scoring function; conversation-history capsule-aware scoring; outcome-pattern-aware scoring.
- **Coupling with Surface 3 active-learning informativeness §5.5.** Salience conditioning IS the substrate signal that feeds informativeness weighting (capsule that resolved an ambiguity in this session conditions higher informativeness for similar future situations). The L5 lateral zone produces session-conditioned salience; the §5.5 active-learning informativeness consumes the salience signal as informativeness input; the two architectures share substrate primitive per INT-2.

#### Zone L6 — Hive-aggregate consumption

Hive aggregates condition retrieval as explicit context layer alongside personal capsules per Correction 2 reframing; aggregate salience conditions retrieval scoring; closure of Zone B2 PARTIAL.

- **Substrate primitive.** Hive aggregate construction substrate-active per Loop 4 cron rebuild every 30 min (`feedback.service.ts:424`; `hive.service.ts:651-840`); aggregate stored as `DOMAIN_KNOWLEDGE` capsule in owner's wallet. Consumption asymmetric per D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY drift: explicit endpoint `getHiveIntelligence` reads aggregate; COE assembleContext does NOT consume aggregate via privileged path.
- **Architectural decisions.** Surface 2 §4.8 canonicalizes Hive aggregation as DMW-to-DMW coordination per Correction 2 (Hive IS the substrate mechanism for wallets to coordinate via shared intelligence; not aggregation artifact). The L6 zone canonicalizes the consumer-side lateral flow: once Hive aggregate has been produced via bilateral cross-entity coordination (Zone B2), the consumer wallet's L6 lateral zone conditions retrieval salience by treating the aggregate as explicit context layer alongside personal capsules.
- **Drift closure.** Closes D-2D-D9 via §4.8 explicit COE-aggregate consumption path. The bilateral cross-entity production remains Zone B2; the lateral consumer-side flow is Zone L6; the two zones compose at the production-consumption boundary.
- **Per-DMW-type sovereignty constraint per Correction 4.** Hive coordination respects per-DMW-type sovereignty: Enterprise zero-payload participates differently than Personal (zero-payload constraint conditions what Enterprise contributes); AI_AGENT participation bounded by owning-human sovereignty (owning human's sovereignty bounds AI_AGENT's Hive participation); Personal full owner-sovereignty per RULE 0; Device per device-owner sovereignty. The L6 consumer-side lateral zone applies these constraints when conditioning retrieval salience — aggregate from Personal-DMW-only Hive conditions retrieval differently than aggregate from mixed-DMW-type Hive.

### 2.4 Zone discrimination decision tree

Forward architectural decisions reference the extended three-class zone classification. Section 2.4 canonicalizes the decision tree extending RAA 12.7 §2.5: every new substrate capability is asked **"U, B, or L — and why?"** before flow direction is chosen. The decision tree operates via three-step discrimination with burden-of-proof discipline per class.

#### Three-step discrimination

The decision tree applies three steps in order. Steps are not independent; the order encodes the discipline that trust roots take precedence over cross-entity coordination, and cross-entity coordination takes precedence over intra-substrate dynamics.

**Step 1 — Does the flow establish a trust root?**

If YES → **unilateral classification**. The flow joins Zone U1-U4 family (audit chain integrity / patent-holder implementation record / identity verification / permission grant lineage) or extends the unilateral class with new trust-root-establishing zone. Burden-of-proof discipline: classifier surfaces the correctness-guarantee justification (which trust root the zone provides; what bidirectional flow would break; why ASI consumers depend on the guarantee holding). Classification requires explicit ADR or RAA section canonicalizing the trust-root extension.

If NO → continue to Step 2.

**Step 2 — Does the flow cross entity sovereignty boundary?**

If YES → **bilateral classification**. The flow joins Zone B1-B5 family (feedback loop circulation / cross-entity Hive aggregation / multi-DMW concurrent flow / cross-entity similar-trait resonance / real-time proximity awareness) or extends the bilateral class with new cross-entity zone. Burden-of-proof discipline: classifier surfaces the cross-entity flow rationale (which entities coordinate; what flows back; why the aggregate must influence individual context). Classification respects RAA 12.7 default-rule-bilateral — cross-entity flow is the bilateral-default territory.

If NO → continue to Step 3.

**Step 3 — Does the flow operate at intra-substrate dynamics layer within entity sovereignty?**

If YES → **lateral classification**. The flow joins Zone L1-L6 family (capsule-to-capsule spreading activation / hypergraph relational consumption / resonance/coherence dynamics / emergent retrieval / context-dependent salience / Hive-aggregate consumption) or extends the lateral class with new intra-substrate zone. Burden-of-proof discipline: classifier surfaces the three-property test (intra-substrate / within entity sovereignty / dynamics-tier per §2.2); classification respects per-DMW-type sovereignty per Correction 4 by construction.

If NO → **flow type undetermined**; substrate-honest investigation required per RULE 13. Failure to discriminate may indicate the flow is novel architectural territory not anticipated by RAA 12.7 + RAA 12.8 zone discrimination methodology; investigation surfaces the gap inline; resolution may require methodology extension via future RAA.

#### Burden-of-proof discipline per class

Each zone class carries its own burden-of-proof discipline:

- **Unilateral (U class) — correctness-guarantee justification.** Classifier must surface what trust root the zone provides and what bidirectional flow would break. Burden falls on the unilateral classifier; bilateral default holds otherwise. Worked examples: U1 audit chain integrity provides the trust root that ASI accuracy anchors against (per RAA 12.7 §3.4 + §7); U2 patent-holder implementation record provides the trust root that defensive publication strategy depends on (per Decision Patent-A); U3 identity verification provides the trust root that authority chains derive from; U4 permission grant lineage provides the trust root that audit-trail-required compliance frameworks (SOC 2 / HIPAA / FedRAMP) depend on.

- **Bilateral (B class) — cross-entity flow rationale.** Classifier must surface which entities coordinate, what flows back, and why the aggregate must influence individual context. Default-rule per RAA 12.7 — bilateral is the default class; classification follows the default unless one of the other classifications applies. Worked examples: B1 feedback loop circulation requires bidirectional outcome-to-relevance flow within single-entity context; B2 Hive aggregation requires cross-entity contribution + aggregate consumption; B3 multi-DMW requires multi-wallet contribution + per-wallet outcome propagation.

- **Lateral (L class) — intra-substrate dynamics + within-sovereignty discipline.** Classifier must satisfy the three architectural properties (intra-substrate / within entity sovereignty / dynamics-tier per §2.2). Burden falls on the lateral classifier; the discrimination from unilateral and bilateral is exact, not approximate. Worked examples: L1 spreading activation operates within wallet via `connected_capsule_ids` edges (intra-substrate; within sovereignty; dynamics-tier); L3 resonance/coherence operates within wallet via `coherence_score` (NET-NEW substrate primitive; intra-substrate; within sovereignty; dynamics-tier); L6 Hive-aggregate consumption operates within receiving wallet after bilateral cross-entity production has completed (intra-substrate; within sovereignty; dynamics-tier on receiving side).

#### Default rules per architectural register

The decision tree composes with default rules at architectural register:

- **Default U** when correctness demands forward-only flow (the trust-root-establishing default; rare; requires explicit canonicalization).
- **Default B** when learning-cycle dynamics cross entity sovereignty (the cross-entity-coordination default; common; default-rule-bilateral per RAA 12.7).
- **Default L** when retrieval-time dynamics operate within entity sovereignty (the intra-substrate-dynamics default; emerging at substrate as Surface 2 fields land; expected to grow as relational-dynamics primitives canonicalize).

The defaults are not pre-emptive classification; they are the burden-of-proof anchors. New capabilities default to bilateral per RAA 12.7; the burden is on showing unilateral or lateral classification. RAA 12.8's lateral-class introduction does not modify the default-rule-bilateral posture; it adds a third class with its own discipline operating alongside the existing bilateral default.

#### Worked example — `connected_capsule_ids` consumer surface

Applying the decision tree to the `connected_capsule_ids` consumer surface (D-2C-D2 drift closure):

- **Step 1.** Does spreading activation through `connected_capsule_ids` establish a trust root? **No.** The activation propagates within trust-root-established context (audit chain integrity holds; identity verification holds; permission lineage holds); the activation does not establish trust roots itself.
- **Step 2.** Does spreading activation cross entity sovereignty boundary? **No.** The activation operates within a single wallet's `connected_capsule_ids` graph; the activation does not cross entity ownership.
- **Step 3.** Does spreading activation operate at intra-substrate dynamics layer within entity sovereignty? **Yes.** The activation is intra-substrate (operates via substrate-tier `connected_capsule_ids` primitive); within entity sovereignty (single-wallet scope); dynamics-tier (operates at substrate-dynamics layer per Surface 2 §4.2).
- **Classification.** Lateral; Zone L1.

The worked example confirms the decision tree produces exact classification. The `connected_capsule_ids` consumer surface canonicalizes at Surface 2 §4.7 as L1 lateral zone; substrate-honest discipline closes the D-2C-D2 drift.

#### Worked example — multi-DMW concurrent flow

Applying the decision tree to multi-DMW concurrent flow (Zone B3 per RAA 12.7):

- **Step 1.** Does multi-DMW concurrent flow establish a trust root? **No.** Multi-DMW retrieval operates within trust-root-established context per individual wallet.
- **Step 2.** Does multi-DMW concurrent flow cross entity sovereignty boundary? **Yes.** Personal + Twin + Enterprise concurrent retrieval crosses three entity sovereignty boundaries by definition.
- **Classification.** Bilateral; Zone B3 (per RAA 12.7 §2.5 classification preserved). RAA 12.8 does NOT reclassify B3 as lateral; the cross-entity sovereignty boundary discriminates the classification at Step 2 before reaching Step 3.

The worked example confirms the decision tree preserves RAA 12.7 §2.5 zone classifications. Lateral-class introduction extends the classification space; lateral does not absorb existing bilateral zones. Zone B3 remains bilateral; the per-DMW-type sovereignty as scheduling constraint per Correction 4 operates at Surface 1 §3.8 cross-wallet retrieval mechanics, not via reclassification to lateral.

---

## Section 3 — Surface 1: Scale Architecture

Section 3 canonicalizes Surface 1 of RAA 12.8 substrate-dynamics architecture. Surface 1 designs how substrate behaves at O(10⁷) capsules per entity — five orders of magnitude beyond current substrate state. Surface 1 closes the D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT inline (§3.2) and surfaces the architectural territory for tier-aware retrieval, index-driven candidate pre-filter, cursor-based pagination, materialized aggregates, latency budgets, query complexity bounds, and parallel orchestration with per-DMW-type sovereignty as scheduling constraint per Correction 4. Section 3 §3.9 enumerates the Step 2E engineering surface that closes the architectural canonicalization with implementation work.

### 3.1 Scale problem statement

Foundation substrate must serve O(10⁷) capsules per entity. Current substrate is tested at O(10²) per entity. The five-orders-of-magnitude scale jump traverses architectural territory absent at current substrate state; the territory must be canonicalized at substrate-architecture level before engineering implementation per ADR-0017 production discipline.

#### Operator strategic framing

Per operator strategic framing: "millions of capsules per entity orchestrating with interconnecting relationships." The framing is operator-locked at memory-entry register; the substrate-design implication is that retrieval architecture must scale alongside capsule density without degrading ASI-consumer latency requirements (per §3.6) or sovereignty guarantees (per RULE 0 + §3.8 + §5.8). Scale is not a performance optimization concern; scale is an architectural property that determines whether substrate continues to serve autonomous-grade agentic execution as entity intelligence accumulates.

#### Five-orders-of-magnitude scale territory

The O(10²) → O(10⁷) jump is not a single architectural transition but a sequence of architectural territories with distinct dominant constraints:

- **O(10²) → O(10³).** Acceptable with current substrate architecture. COE retrieval at `apps/api/src/services/coe/coe.service.ts:201-216` performs `findUnique` on wallet + `findMany` over wallet-scoped candidates + score-rank-select within budget. Tier-blind retrieval still completes within ASI-consumer latency budgets at O(10³) candidates entering memory.
- **O(10³) → O(10⁵).** Requires tier-aware retrieval (§3.2) + index-driven candidate pre-filter (§3.3). At O(10⁵) candidates entering memory, score-rank-select across all candidates exceeds ASI-consumer latency budgets per §3.6; pre-filter discipline bounds candidates entering scoring.
- **O(10⁵) → O(10⁷).** Requires materialized aggregates (§3.5) + parallel orchestration mechanics (§3.8). At O(10⁷) candidates per entity, even tier-aware index-driven pre-filter cannot complete within latency budgets without pre-computed per-(entity, capsule_type) aggregates; cross-wallet retrieval (Zone B3 NET-NEW per RAA 12.7) requires parallel orchestration with sovereignty-respecting scheduling.

The architectural territories nest: §3.2-§3.3 are necessary conditions for §3.5 + §3.8; the lower-scale territories' design is preserved as scale grows rather than replaced. Substrate architecture is additive across scale territories per RULE 1 build-forward-only discipline.

#### Cross-section dependencies

Surface 1 Scale couples to other RAA 12.8 surfaces at multiple points per §6 cross-surface architectural decisions:

- **INT-4 cross-type-balance-at-scale.** Cross-type balance (D-2C-D6 territory) becomes critical at Surface 1 scale; cross-wallet retrieval (§3.8) compounds the type-balance problem. Surface 1 + Surface 2 jointly address the substrate-tier policy. RAA 12.9 cites the substrate-tier policy as dependency for per-data-point monetization at trillion scale.
- **INT-5 spreading activation activates connected_capsule_ids.** Surface 2 §4.2 Field 1 spreading activation operates over `connected_capsule_ids` substrate primitive; the activation propagates within Surface 1 latency budgets. Surface 1 §3.6 latency budgets bound activation propagation depth; Surface 2 §4.2 activation algorithm operates within those bounds.
- **§5.8 Per-DMW-Type Sovereignty Rules.** Surface 1 §3.8 parallel orchestration requires the EntityType-to-DMW-type mapping canonicalized at Section 5.8. Cross-wallet scheduling depends on which DMW type each contributing wallet operates as.

#### Latency commitment

ASI-class consumers depend on substrate retrieval at single-digit-millisecond latency. Substrate that breaks under ASI-consumer latency requirements ceases to serve agentic-grade autonomous execution; latency is not a performance metric but an architectural property that determines whether substrate qualifies as ASI-substrate per §1.1 ASI-substrate framing. RAA 12.7 §3.4 canonicalizes audit-chain integrity as ASI accuracy anchor; RAA 12.8 §3.6 canonicalizes retrieval latency as ASI cognitive-cycle anchor. Both anchors must hold or substrate fails its design role.

### 3.2 Tier-aware retrieval (closes D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT)

Substrate already carries the storage tier primitive at write tier; retrieval currently does not consume the primitive. Surface 1 §3.2 closes the gap.

#### Substrate primitive — verified active

`MemoryCapsule.storage_tier StorageTier @default(WARM)` at `packages/database/prisma/schema.prisma`; `enum StorageTier { HOT WARM COLD }`. Auto-classification at `apps/api/src/services/cosmp/write.service.ts:314`:

```ts
const storageTier: StorageTier =
  decayType === "FOUNDATIONAL" ? "HOT" : input.storage_tier ?? "WARM";
```

The auto-classification is substrate-active: FOUNDATIONAL Capsules promote to HOT at write time; explicit `input.storage_tier` override allowed; default WARM otherwise. Schema indexes include `@@index([storage_tier])` for index-driven tier filter at scale.

#### D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT

Phase 1 extension D12 finding: COE `assembleContext` does NOT consume `storage_tier` in candidate selection. The current `findMany` filter at `coe.service.ts:214-227` filters on `wallet_id`, `deleted_at`, `clearance_required` — no `storage_tier` clause. Substrate carries the tier primitive at write tier and at schema index tier; retrieval is tier-blind. Drift surfaced inline per RULE 13; closure via Section 3.2 architectural canonicalization.

#### Tier-aware retrieval policy

Surface 1 §3.2 canonicalizes the tier-aware retrieval policy:

- **HOT-tier first.** HOT capsules enter scoring before WARM/COLD. The HOT tier carries FOUNDATIONAL Capsules (per write-time auto-classification) plus explicit-override HOT capsules. Hot-path retrieval is HOT-tier-only at first-pass; latency budget per §3.6 is bounded by HOT-tier candidate set size.
- **WARM-tier on demand.** WARM capsules enter scoring when HOT-tier candidate set is under threshold (typical: HOT-tier candidate count below `maxCapsules` per §3.4 candidate budget). WARM-tier retrieval extends candidate set when HOT-tier alone does not satisfy the query.
- **COLD-tier on explicit request.** COLD capsules enter scoring only when query carries explicit tier-COLD signal — archive query, long-form research query, or explicit operator-issued query carrying COLD-tier flag. COLD-tier retrieval is opt-in and operates with relaxed latency budget per §3.6.

#### Tier transitions

Surface 1 §3.2 also canonicalizes tier transition discipline operating at substrate-tier:

- **WARM → HOT promotion.** When `access_count` crosses a threshold within a sustained window (typical: 10+ accesses within 7 days), the substrate promotes the WARM Capsule to HOT. Promotion improves retrieval latency for emerging hot-path Capsules; promotion is automatic and substrate-internal.
- **HOT → WARM demotion.** When `relevance_score` drops below a threshold for a sustained period (typical: relevance_score below 0.5 for 30+ days post-FOUNDATIONAL-classification), the substrate demotes the HOT Capsule to WARM. Demotion releases HOT-tier candidate budget for newly-promoted Capsules.
- **WARM → COLD demotion.** When `last_accessed_at` exceeds a configurable archival window (typical: 365 days) AND `relevance_score` is below RELEVANCE_FORGET_FLOOR (per `coe.service.ts:44` constant = 0.2), the substrate demotes WARM → COLD. The demotion respects RAA 12.7 / cognitive-science framing: long-unaccessed-low-relevance Capsules are intentional-forgetting candidates per the retrieval-induced-forgetting tradition (Anderson, Bjork & Bjork 1994).

#### FOUNDATIONAL bypass invariant

Tier-aware retrieval respects the FOUNDATIONAL bypass per `coe.service.ts` STEP 3 filter (`if (c.decay_type === "FOUNDATIONAL") return true;` after FOUNDATIONAL bypass; verified at `coe.service.ts:233-240`). FOUNDATIONAL Capsules bypass the relevance floor; the same bypass applies to the tier filter — FOUNDATIONAL Capsules are HOT-tier-classified at write time (per `write.service.ts:314`) and bypass tier-demotion. The invariant preserves the cognitive-science framing: identity / name / permanent commitments do not decay, regardless of access pattern.

### 3.3 Index-driven candidate pre-filter (substrate-honest schema state)

Current COE retrieval at `coe.service.ts:214-227` performs `findMany` over `wallet_id` + filters in TypeScript per row (`allCandidates.filter`). At O(10⁵) candidates per wallet, the pattern loads all candidates into application memory before filtering — incompatible with §3.6 latency budgets and §3.4 memory bounds. Surface 1 §3.3 designs index-driven candidate pre-filter operating at database tier.

#### Substrate-honest schema state — 7 indexes on MemoryCapsule (verified)

Schema verification (per `packages/database/prisma/schema.prisma` MemoryCapsule model) confirms **seven indexes** currently on the model:

- `@@index([wallet_id])` — wallet-scoped retrieval (current COE entry filter)
- `@@index([entity_id])` — entity-scoped queries
- `@@index([capsule_type])` — type-filter retrieval (Otzar allowlist + future per-type routing)
- `@@index([decay_type])` — decay-class queries
- `@@index([storage_tier])` — tier-aware retrieval per §3.2
- `@@index([deleted_at])` — soft-delete filter (RULE 10 invariant)
- `@@index([topic_tags], type: Gin)` — GIN-tier topic-tag overlap queries

The seven indexes establish the index-driven pre-filter substrate. Three additional indexes are commonly assumed but not present in current schema: `relevance_score`, `last_updated_at`, `connected_capsule_ids`. Substrate-honest acknowledgment: relevance-score range scan per §3.3 below requires new schema index added at Step 2E (per §3.9 engineering surface); the current substrate state is the baseline against which Surface 1 designs.

#### Index-driven candidate pre-filter mechanics

Surface 1 §3.3 canonicalizes the pre-filter pipeline operating at database tier:

- **Step 1 — GIN-driven topic_tags overlap pre-filter.** Query keyword extraction (per `extractKeywords` at `coe.service.ts:190+`) produces a query-tag set. Database query: `WHERE topic_tags && query_tags` leveraging the GIN index. The `&&` operator (PostgreSQL array-overlap) is GIN-indexable and produces a bounded candidate set in single-digit-ms even at O(10⁷) capsule scale per wallet.
- **Step 2 — relevance_score >= RELEVANCE_FORGET_FLOOR exclusion.** Per `coe.service.ts:44` `RELEVANCE_FORGET_FLOOR = 0.2`. Database query adds `AND (decay_type = 'FOUNDATIONAL' OR relevance_score >= 0.2)`. The clause requires a new index on `relevance_score` (Step 2E engineering work per §3.9); without the index, the clause is a sequential scan over the GIN-pre-filtered set, which is acceptable at O(10³) post-Step-1 candidates but degrades at higher scales.
- **Step 3 — storage_tier filter per §3.2.** Database query adds `AND storage_tier = 'HOT'` (HOT-tier-first first-pass). Leverages existing `@@index([storage_tier])`. WARM/COLD tier inclusion is conditional per §3.2 policy.
- **Step 4 — capsule_type filter per session-context allowlist.** Otzar's existing pattern at `apps/api/src/services/otzar/otzar.service.ts:272-277` is the canonical worked example: `capsule_type: { in: [...] as CapsuleType[] }`. Database query adds the IN clause. Leverages existing `@@index([capsule_type])`. Per Correction 3 entity-type uniformity, the allowlist mechanism is entity-type-uniform — same primitive applies to Personal / Twin / Enterprise / Device retrievals; per-DMW-type sovereignty operates as scheduling constraint per §3.8, not as type-filter modification.
- **Step 5 — bounded candidate set entering scoring.** Pre-filter produces a candidate set bounded at O(100-500) entries even at O(10⁷) wallet capsule count. Combined `combined_score` scoring per ADR-0022 operates over the bounded set; selection within `maxCapsules` budget per §3.4 + `coe.service.ts:37` `TOKENS_PER_CAPSULE_ESTIMATE = 200`.

#### Architectural decisions

Surface 1 §3.3 canonicalizes:

- Pre-filter is **candidate-set-bounding**, not result-set-bounding. The final result still applies `combined_score` ranking + token budget; pre-filter limits which candidates enter scoring, not which capsules enter the response.
- Pre-filter respects FOUNDATIONAL bypass — FOUNDATIONAL Capsules enter scoring regardless of pre-filter state (Step 2 filter explicitly preserves FOUNDATIONAL via the `decay_type = 'FOUNDATIONAL' OR ...` clause).
- GIN index utilization is the canonical pre-filter primitive at substrate-tier. The GIN index on `topic_tags` is the existing substrate primitive that makes O(10⁷) candidate scan tractable.
- Pre-filter latency budget per §3.6: target ≤5ms for pre-filter pipeline (Step 1 + Step 2 + Step 3 + Step 4). The budget conditions which Step-2E indexes warrant addition (relevance_score range scan adds ~1-3ms without index; with index, sub-ms).

### 3.4 Pagination + candidate budgeting

Current COE retrieval at `coe.service.ts:214-227` calls `findMany` without `skip` / `take` — all wallet candidates load into application memory. Substrate-honest acknowledgment: at O(10⁷) per-wallet capsule count, the pattern OOMs; the substrate ceases to operate. Surface 1 §3.4 closes the OOM risk via cursor-based pagination + bounded candidate budget.

#### Cursor-based pagination architecture

Surface 1 §3.4 canonicalizes cursor-based pagination:

- **Cursor primitive.** Last `(relevance_score, capsule_id)` tuple from prior page. Pagination cursor is opaque to caller; cursor encodes position within pre-filtered candidate set.
- **Page size bound.** Bounded candidate budget per page (typical: 100 candidates per page; ceiling: 500 candidates per page). Page size derived from `TOKENS_PER_CAPSULE_ESTIMATE = 200` per `coe.service.ts:37` — page size aligns with candidate budget such that one page maximally fills the token budget.
- **Pagination terminates** when score budget exhausted (top-K candidates ranked + selected within budget) OR page count budget exhausted (max pages per query bound per §3.7 query complexity bounds) OR pre-filter candidate set exhausted.
- **Memory bound.** Pagination ensures O(page_size) memory per query, not O(wallet_capsule_count) memory. The bound is the architectural property that closes the OOM risk.

#### Candidate budgeting

Surface 1 §3.4 also canonicalizes candidate budgeting per ADR-0022 + existing substrate constants:

- `TOKENS_PER_CAPSULE_ESTIMATE = 200` per `coe.service.ts:37` — existing substrate constant. Token budget input is derived from session context window allowance (caller-supplied via `assembleContext(sessionToken, requestText, tokenBudget, context)` per `coe.service.ts:172`).
- Candidate budget: `maxCapsules = floor(tokenBudget / TOKENS_PER_CAPSULE_ESTIMATE)` per existing `coe.service.ts:191-194` logic. The expression already operates substrate-side; Surface 1 §3.4 preserves the formula and adds pagination layer above.
- Final selection ranked by `combined_score` per ADR-0022; selected within `maxCapsules` budget; FOUNDATIONAL Capsules first per `coe.service.ts:248-256` STEP 4 logic — selection mechanics canonicalized at ADR-0022 are preserved by §3.4 pagination architecture.

#### Architectural decisions

Surface 1 §3.4 canonicalizes:

- Pagination is **candidate-pagination, not result-pagination.** Paginated candidates flow into `combined_score` ranking; result is single ranked set within budget. The distinction matters because result-pagination would break ASI-consumer cognitive-cycle invariants (a single retrieval cycle returns a single ranked context-set, not a paginated stream).
- Memory bound is the architectural property; pagination ensures memory usage scales with page size, not wallet capsule count.
- Pagination respects per-DMW-type sovereignty per §3.8: cross-wallet pagination interleaves per-wallet pages with sovereignty-respecting scheduling. Cross-wallet pagination is not a separate pagination mechanism but the per-wallet pagination operating in parallel with cross-wallet aggregation per §3.8.

### 3.5 Materialized aggregates per (entity, capsule_type) with refresh discipline

Current substrate has `Wallet.total_capsule_count Int @default(0)` (per `packages/database/prisma/schema.prisma` Wallet model) and `CompoundingMetrics.capsule_count` (org-level metrics tracked via `apps/api/src/services/otzar/otzar.service.ts:564-575`). Per-(entity, capsule_type) aggregates are NOT materialized; substrate computes per-type counts at query time via `prisma.memoryCapsule.count` (verified at `apps/api/src/services/otzar/observation.service.ts:606`). At O(10⁷) capsule scale, query-time count operations exceed §3.6 latency budgets. Surface 1 §3.5 designs materialized per-(entity, capsule_type) aggregates for hot-path acceleration.

#### Materialized aggregate content

Surface 1 §3.5 canonicalizes per-(entity, capsule_type) aggregate content. Each aggregate row carries:

- **count** — total non-deleted Capsules of the type within the entity's wallet
- **avg_relevance_score** — mean of `relevance_score` across non-FOUNDATIONAL Capsules of the type (FOUNDATIONAL excluded because their relevance is invariant by construction)
- **avg_feedback_loop_score** — mean of `feedback_loop_score` across Capsules of the type (Loop 1 substrate-active per RAA 12.7 §2.5 Zone B1)
- **most_recent_write_at** — `MAX(last_updated_at)` across non-deleted Capsules of the type
- **hot_tier_percentage** — fraction of Capsules of the type in HOT storage tier per §3.2

The aggregate row is keyed on `(entity_id, capsule_type)` — primary key composite. Schema addition at Step 2E per §3.9 engineering surface.

#### Refresh discipline

Surface 1 §3.5 canonicalizes hybrid refresh discipline:

- **Write-through for relevance + feedback updates.** `relevance_score` and `feedback_loop_score` mutations (Loop 1 update path at `apps/api/src/services/feedback/feedback.service.ts`) update aggregate atomically. Atomicity preserves correctness invariants; eventual-consistency risk minimized at substrate boundary.
- **Cron-backed for count + recency updates.** Capsule count and `most_recent_write_at` rebuild via cron (Loop 2 schedule per `apps/api/src/services/feedback/scheduler.ts`). Operational simplicity; staleness window bounded by cron frequency. The hybrid discipline trades correctness-tier (write-through for hot signals) for operational-tier (cron for cold signals).
- **Hot-tier-percentage rebuild on tier-transition.** Tier transitions per §3.2 (WARM→HOT promotion; HOT→WARM demotion) trigger hot_tier_percentage recomputation. The recomputation is amortized — only the affected aggregate row is updated.

#### Coupling to Surface 2 §4.4 per-type baseline weights

The materialized aggregates couple to Surface 2 §4.4 Field 3 resonance/coherence dynamics at substrate-tier:

- **Per-(entity, capsule_type) avg_relevance_score informs per-type baseline weight.** Type baseline operates as scoring normalization factor — a Capsule scored relative to its type's baseline rather than absolute score. Cross-type comparison normalized.
- **Coupling preserves substrate-honest cross-type balance per D-2C-D6 territory.** D-2C-D6-OTZAR-ALLOWLIST-AS-IMPLICIT-POLICY drift surfaced cross-type balance as application-layer-implicit. Per-type baseline weights make cross-type balance substrate-tier-explicit; the discipline is deferred to RAA 12.9 §6.4 for monetization-at-scale framing.
- **Forward-citation reciprocal.** Surface 2 §4.4 cites Surface 1 §3.5 materialized aggregates as substrate dependency; Surface 1 §3.5 reciprocates per RULE 14 bidirectional citation discipline.

#### Architectural decisions

Surface 1 §3.5 canonicalizes:

- Materialized aggregates enable scoring decisions without scan of all wallet Capsules. The architectural property is essential at O(10⁷) scale per §3.1.
- Refresh discipline canonicalization respects substrate atomicity invariants per ADR-0001 + ADR-0002. Write-through atomicity holds within the existing transactional envelope; cron-backed refresh operates outside hot-path retrieval.
- Per Correction 4: per-DMW-type aggregates may differ in semantic — Personal DMW carries `avg_relevance_score` semantic; Enterprise zero-payload DMW may carry `metadata-density` semantic instead (raw payload absent; aggregate operates over metadata only). The per-DMW-type variation is canonicalized at §5.8; §3.5 references the variation as forward dependency.

### 3.6 Latency budgets canonicalized — OPERATOR REVIEW REQUIRED (single-digit-ms target precision)

ASI-class consumer latency requirement: single-digit milliseconds for COE `assembleContext`. Surface 1 §3.6 canonicalizes latency budgets per pipeline stage; operator review required for target-precision values.

#### Latency budget breakdown

Single-wallet retrieval (current COE pattern extended with §3.2-§3.4):

- **Pre-filter:** ≤5ms target. GIN index scan + relevance-score range scan (post-Step-2E index addition) + tier filter + type filter. Latency dominated by GIN scan at high tag overlap; typical 1-3ms; ceiling 5ms.
- **Scoring:** ≤5ms target. `combined_score` computation per candidate over bounded candidate set per §3.3-§3.4 (target: 100-500 candidates entering scoring). At 500 candidates × ~10μs per scoring computation = ~5ms.
- **Total assembleContext:** ≤10ms target; ≤20ms ceiling.

Cross-wallet retrieval (per §3.8 parallel orchestration):

- **Per-wallet retrieval:** ≤10ms target (single-wallet pipeline running concurrently for each contributing wallet).
- **Cross-wallet aggregation:** ≤5ms target (parallel results merge + cross-wallet `combined_score` re-ranking + final budget application).
- **Total cross-wallet assembleContext:** ≤15ms target; ≤30ms ceiling.

#### OPERATOR REVIEW REQUIRED — single-digit-ms target precision

**OPERATOR REVIEW REQUIRED:** single-digit-ms target precision (≤10ms vs ≤5ms vs ≤2ms target band) requires operator review against Foundation latency-tier ASI-consumer requirements. The Surface 1 §3.6 canonicalization establishes the latency-budget framework; specific target values resolve during full-document drafting at Section 3 (this section) — operator confirms target band or directs alternate target band.

Three candidate target bands surfaced inline:

- **≤10ms target band.** Conservative; allows substrate to operate alongside other latency-budget consumers (LLM inference; orchestration layer; rendering). Risk: aggressive ASI consumers may exceed budget when chaining multiple retrievals per cognitive cycle.
- **≤5ms target band.** Aggressive; substrate-internal target leaves headroom for other latency-budget consumers. Risk: at O(10⁷) capsule scale per §3.5, materialized aggregate refresh discipline must be bullet-proof to maintain budget.
- **≤2ms target band.** ASI-grade autonomous-execution target; substrate operates as memory architecture for chains of cognitive cycles per second. Risk: requires aggressive engineering at Step 2E (specialized indexes, possibly Redis-tier hot-path caching for §3.5 aggregates).

Operator confirms target band during full-document drafting; outline territory establishes the decision framework. Default until operator review: ≤10ms target band as Surface 1 §3.6 canonical baseline.

#### Cross-section reach

Surface 1 §3.6 latency budgets condition:

- §3.7 query complexity bounds — bounds enforce latency budget under adversarial queries
- §3.8 parallel orchestration — distributes latency across wallets via concurrent retrieval pipelines
- §4.5 emergent retrieval convergence parameters — Surface 2 §4.5 emergent retrieval iteration cap is bounded by §3.6 latency budget
- §5.5 active-learning informativeness — Surface 3 §5.5 informativeness-weighted Loop 1 update operates within §3.6 latency-tier budgets

### 3.7 Query complexity bounds (adversarial-query resistance)

Substrate must not degrade pathologically under adversarial queries. Adversarial queries craft inputs that exhaust pre-filter budget, bypass tier filter via wildcard expansion, or trigger denial-of-service via crafted query complexity. Surface 1 §3.7 canonicalizes query complexity bounds operating as architectural property.

#### Query complexity bounds

Surface 1 §3.7 canonicalizes:

- **Maximum topic_tags per query:** bounded constant. Typical: 20 tags. Ceiling: 50 tags. Bound prevents GIN-scan budget exhaustion via wildcard tag expansion.
- **Maximum candidate-set size entering scoring:** bounded constant per §3.3-§3.4 candidate budget. Typical: 500 candidates. Ceiling: 2000 candidates. Bound prevents scoring-stage latency budget exhaustion.
- **Maximum wall-clock latency per query:** ceiling per §3.6. ≤30ms cross-wallet ceiling. Queries exceeding ceiling are terminated and surfaced as substrate-honest errors per RULE 13.
- **Maximum cross-wallet count per query:** bounded constant. Typical: 3 wallets (Personal + Twin + Enterprise canonical case). Ceiling: 10 wallets (multi-wallet enterprise scenarios). Bound prevents parallel-orchestration scheduling cost from dominating retrieval latency.
- **Maximum spreading-activation hops per Surface 2 §4.2 Field 1:** bounded constant. Typical: 3 hops. Ceiling: 5 hops. Bound prevents activation propagation from exhausting compute budget; coupled with §3.6 latency budget.

#### Architectural decisions

Surface 1 §3.7 canonicalizes:

- **Bound enforcement at COE entry point.** Queries exceeding any bound are rejected before substrate work begins. Rejection surfaces inline as substrate-honest error per RULE 13 — `INVALID_REQUEST` discriminated-union response with bound-violation reason.
- **Bound values enumerated explicitly** — typical and ceiling. Typical band is the substrate-design baseline; ceiling band is the upper bound beyond which substrate behavior becomes pathological.
- **Bound violations are denial-of-service-resistance properties.** Adversarial query crafting cannot exceed bounds; bounded retrieval is architectural property, not defensive engineering.

#### Adversarial-actor protection per RULE 19 + Decision Patent-A

Per Decision Patent-A defensive publication strategy + RULE 19 two-register IP discipline: query complexity bounds prevent adversarial actors from extracting substrate behavior via crafted query patterns. Pathological-degradation queries that trigger predictable substrate behavior are denial-of-service-resistance failures and substrate-information-leak failures simultaneously. Bounds canonicalize the resistance property at substrate-architecture level.

### 3.8 Parallel orchestration mechanics — cross-wallet retrieval; per-DMW-type sovereignty as scheduling constraint per Correction 4

Cross-wallet retrieval (Zone B3 NET-NEW per RAA 12.7 §2.5) operates as parallel orchestration with per-DMW-type sovereignty operating as scheduling constraint per Correction 4. Section 3.8 canonicalizes the parallel orchestration architecture with sovereignty-as-scheduling-constraint discipline.

#### Substrate primitive precedent — verified active

Cross-wallet `findMany` substrate-active in Otzar at `apps/api/src/services/otzar/observation.service.ts:587-608`:

```ts
const wallets = await prisma.wallet.findMany({
  where: { entity_id: { in: memberIds } },
  select: { wallet_id: true },
});
const walletIds = wallets.map((w) => w.wallet_id);
// ...
const count = await prisma.memoryCapsule.count({
  where: {
    wallet_id: { in: walletIds },
    deleted_at: null,
    // ...
  },
});
```

The pattern proves cross-wallet retrieval is substrate-active — not net-new at substrate. The pattern is currently scoped to Otzar observation tier; COE generalization is the §3.8 design surface.

EntityMembership query sites in the substrate: 52 references across `apps/api/src/**/*.ts` (verified). The richness of EntityMembership integration substantiates cross-wallet retrieval as a foundational substrate property — the relationship-graph primitive is substrate-active across governance, twin, organization, and Otzar tiers; Surface 1 §3.8 canonicalizes COE-tier consumption.

#### COE current state — single-wallet only

COE retrieval at `apps/api/src/services/coe/coe.service.ts:201-205`:

```ts
const wallet = await prisma.wallet.findUnique({
  where: { entity_id: session.entity_id },
  select: { wallet_id: true },
});
```

The current pattern is `findUnique` keyed on session entity — strict single-wallet retrieval. Schema enforces `Wallet.entity_id @unique` (1:1 entity-wallet relationship per ADR-0001 Three-Wallet Architecture). Cross-wallet generalization is the §3.8 architectural canonicalization; engineering implementation is enumerated at §3.9 Step 2E.

#### Parallel orchestration architecture

Surface 1 §3.8 canonicalizes:

- **Per-wallet retrieval pipelines run concurrently.** Each contributing wallet (Personal + Twin + Enterprise + Device per canonical multi-DMW scenario) executes its own retrieval pipeline (§3.2 tier filter → §3.3 pre-filter → §3.4 pagination → bounded candidate set with §3.6 latency budget).
- **Cross-wallet aggregation.** Bounded candidate sets from each per-wallet pipeline are merged. Combined `combined_score` per ADR-0022 is re-ranked across the merged set (cross-wallet candidates compete on score within the merged context).
- **Final budget applied.** Total candidate budget applied at cross-wallet level; FOUNDATIONAL bypass per ADR-0022 + `coe.service.ts:248` operates across the merged set.
- **Latency bounded per §3.6.** Per-wallet retrieval at ≤10ms target; cross-wallet aggregation at ≤5ms target; total cross-wallet assembleContext at ≤15ms target.

#### Per-DMW-type sovereignty as scheduling constraint per Correction 4

The architectural distinction per Correction 4 is precise: per-DMW-type sovereignty operates as **scheduling constraint** at parallel orchestration tier — not as **post-hoc filter** at result-rendering tier. The distinction matters because post-hoc filtering creates sovereignty-erasure risk (substrate computed across sovereignty boundaries; filter applied after; sovereignty broken in window between computation and filter). Substrate enforces sovereignty constraints at retrieval-time, not at result-rendering time.

Per-DMW-type sovereignty constraints applied at scheduling tier:

- **Personal DMW.** Full-payload contribution per RULE 0 owner-sovereignty. Personal DMW retrieval pipeline operates without payload restriction; full Capsule metadata + payload flows into cross-wallet ranking.
- **Enterprise zero-payload DMW.** Metadata-only contribution per zero-payload constraint. Per memory entry #16, the zero-payload constraint is sovereignty-preserving by construction — Enterprise DMW carries metadata + governance, not raw payload content; payload remains in contributing entity's wallet. Surface 1 §3.8 enforces the constraint at scheduling: Enterprise retrieval pipeline excludes raw payload from cross-wallet aggregation; Enterprise contributes metadata weights into cross-wallet `combined_score` ranking; raw payload retrieval routes to the originating Personal wallet via Permission lineage per Zone U4.
- **AI_AGENT DMW.** Contribution bounded by owning-human sovereignty per Correction 4 + RULE 0 + memory entry #21. AI_AGENT-owned wallet contribution operates within owning-human's permission grants; the AI_AGENT retrieval pipeline scope is constrained by what the owning human has permitted the AI_AGENT to access. Surface 1 §3.8 enforces the constraint at scheduling: AI_AGENT retrieval pipeline operates with reduced scope reflecting owning-human sovereignty; cross-wallet ranking respects the bounded scope.
- **Device DMW.** Contribution bounded by device-owner sovereignty. Device DMW retrieval pipeline operates within device-owner permitted scope; device cannot contribute capsules beyond owner-permitted access. Sovereignty enforcement at scheduling tier; cross-wallet ranking operates over scope-respecting candidates only.

#### Architectural decisions

Surface 1 §3.8 canonicalizes:

- **Per-DMW-type sovereignty operates as scheduling constraint.** Which wallets contribute; what each wallet contributes; how contributions weight in cross-wallet ranking — all determined at scheduling tier, not at result-rendering tier. Per-DMW-type sovereignty is architectural-tier property, not engineering-tier defensive measure.
- **Substrate enforces sovereignty constraints at retrieval-time.** Sovereignty-erasure risk minimized by enforcing at substrate boundary rather than at consumer boundary.
- **Cross-section reach.** §5.8 per-DMW-type sovereignty rules canonicalize the EntityType-to-DMW-type mapping; §3.8 references the mapping as scheduling constraint. Bidirectional citation per RULE 14: §3.8 cites §5.8; §5.8 reciprocates with reference to §3.8 cross-wallet retrieval mechanics.
- **Scope-respecting candidate sets per Correction 4.** Surface 1 §3.8 design preserves substrate-honesty per RULE 13: each per-wallet pipeline emits candidates within its sovereignty scope; cross-wallet merge does not introduce capsules outside the contributing wallet's scope; result-set composition reflects the sovereignty asymmetry.

### 3.9 Step 2E engineering surface enumerated

Section 3 canonicalizes Surface 1 architectural decisions; Step 2E (per RAA 12.8 forward queue + §1.4) implements the canonicalization. The §3.9 enumeration surfaces the substrate-honest engineering surface — specific implementation work needed to close the architectural canonicalization with substrate-active behavior.

Step 2E engineering surface for Surface 1:

- **D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT closure** — implement tier-aware retrieval per §3.2. Tier filter added to COE `assembleContext` `findMany` clause; tier transition logic added to `feedback.service.ts` Loop schedule. Closes the drift first surfaced at Phase 1 extension D12.
- **GIN-driven candidate pre-filter implementation per §3.3** — add `topic_tags && query_tags` clause to COE `findMany`. Schema-side: existing GIN index on `topic_tags` already supports the clause. Engineering-tier: rewrite `coe.service.ts:214-227` `findMany` to leverage GIN index.
- **relevance_score range-scan index** — add `@@index([relevance_score])` to MemoryCapsule schema per §3.3 Step 2 substrate-honesty. The index supports the Step 2 `relevance_score >= RELEVANCE_FORGET_FLOOR` clause. Schema migration via Prisma `db push` per ADR-0001 (no migrations directory).
- **Cursor-based pagination implementation per §3.4** — add cursor parameter to `assembleContext` interface; rewrite `findMany` to use cursor + take semantics; implement page count budget enforcement.
- **Materialized aggregate schema + write-through + refresh implementation per §3.5** — new Prisma model `EntityCapsuleTypeAggregate` keyed on `(entity_id, capsule_type)` composite; write-through update logic in `feedback.service.ts` Loop 1 path; cron-backed rebuild logic in scheduler. Schema migration via Prisma `db push`.
- **Latency budget enforcement** — typed Result<latency> returns from `assembleContext`; latency-bound exceptions emitted when budgets exceeded; observability per `apps/api/src/logger.ts` structured logging.
- **Query complexity bound enforcement at COE entry point** — bound check at `assembleContext` entry; bound violations return `INVALID_REQUEST` discriminated-union response per existing pattern at `coe.service.ts:178-184`.
- **Cross-wallet COE retrieval generalization per §3.8** — extension of single-wallet `findUnique` to multi-wallet `findMany` with `wallet_id: { in: walletIds }` pattern. EntityMembership-driven wallet aggregation. Per-DMW-type sovereignty as scheduling constraint per Correction 4. Cross-wallet `combined_score` re-ranking. Engineering effort estimate: substantial (multi-sprint scope); coupling to §3.5 materialized aggregates (cross-wallet ranking benefits from per-(entity, capsule_type) aggregate access).

#### Engineering effort estimate

Surface 1 Step 2E engineering surface is substantial — multi-sprint scope across §3.2-§3.8. The architectural canonicalization in this RAA enables coordinated implementation: each engineering item references the §3.x section that canonicalizes the architectural decision; ADR-0017 production-discipline applies to each implementation surface (substrate-investigation discipline; substrate-honesty drift surfacing; coordinated test coverage).

Per Decision 4 (all blocks required due to interconnection), Surface 1 engineering work proceeds after RAA 12.8 full-document drafting completes (Sections 3-10); the engineering surface is sequenced after architectural canonicalization. Section 3.9 enumeration is the canonical Step 2E reference for Surface 1 work scope.

---

## Section 4 — Surface 2: Relational Dynamics

### 4.1 Five-field integration framing

Operator-confirmed scope: Surface 2 integrates five mathematical/architectural fields in conjunction, not in sequence. Integration is the design surface, not selection of one field. Spreading activation provides propagation primitive; hypergraph provides relational structure primitive; resonance/coherence provides mutual-conditioning primitive; emergent retrieval provides selection-from-local-interaction primitive; context-dependent salience provides session-conditioning primitive. The five fields compose; substrate must support all five operating concurrently.

### 4.2 Field 1 — Spreading activation (Quillian 1968+)

Activation propagates through capsule edges during retrieval. Foundation primitive: `MemoryCapsule.connected_capsule_ids: String[]` substrate-active in writes (`write.service.ts`; `queries/capsule.ts`) but unconsumed in retrieval (per D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift). Surface 2 activates the primitive: spreading-activation traversal from seed capsules (top-K from initial scoring) through `connected_capsule_ids` with activation decay function.

### 4.3 Field 2 — Hypergraph precision decision (operator-review-required marker)

**OPERATOR REVIEW REQUIRED:** precision decision between two paths. Per D-2D-D13-HYPERGRAPH-NAMING-PRECISION drift, current substrate is directed embedded binary edge list, not true hypergraph. Two paths:

- **Option A — True hypergraph upgrade.** Add `CapsuleRelation` model with `members: String[]` for N-ary relationships. Schema migration. Vocabulary precision strengthened. Substantial engineering effort.
- **Option B — Vocabulary patch.** Rename to "directed edge graph" or "embedded edge list" in canonical vocabulary; substrate stays as-is. Vocabulary precision strengthened with zero engineering. Limits relational expressiveness to binary edges.

Decision deferred to full-document drafting; outline flags the territory and surfaces both options. Adversarial-actor protection consideration per memory entry #12: imprecise vocabulary (claiming hypergraph when substrate has edge list) creates argument surface; precise vocabulary preempts argument.

### 4.4 Field 3 — Resonance/coherence dynamics (Hofstadter)

Capsules reinforce or contradict each other. Substrate primitives required: `coherence_score` field (capsule-pair or capsule-set scoped); reinforcement-detection algorithm (capsules with overlapping topic_tags + complementary content); contradiction-detection algorithm (capsules with overlapping topic_tags + opposing content). Surface 2 designs the schema additions and detection-algorithm specifications.

### 4.5 Field 4 — Emergent retrieval (complexity science)

Retrieval set emerges from local capsule-interaction dynamics rather than top-down deterministic score-rank-select. Local interactions: spreading activation (Field 1) + resonance/coherence (Field 3) + context-conditioning (Field 5) operating concurrently within bounded compute budget; final retrieval set is the equilibrium state.

Convergence parameters (iteration cap; stability threshold; activation floor) condition emergence. Surface 2 designs the convergence discipline; bounds prevent runaway computation per Surface 1 latency budgets.

### 4.6 Field 5 — Context-dependent salience (Bartlett 1932; Schank scripts)

Same capsule scores differently across session states. Conversation history conditions salience; prior retrievals in session condition salience; recent outcome patterns condition salience. Substrate primitives required: session-state input to scoring function; conversation-history capsule-aware scoring; outcome-pattern-aware scoring.

Coupling to Surface 3 active-learning informativeness: salience conditioning IS the substrate signal that feeds informativeness weighting (capsule that resolved an ambiguity in this session conditions higher informativeness for similar future situations).

### 4.7 Lateral flow operationalization (closes D-2C-D2)

Closes D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift. Substrate has `connected_capsule_ids` and `connected_entity_ids` actively written but unconsumed. Surface 2 operationalizes consumption via Field 1 spreading activation; Section 4.7 canonicalizes the consumer surface.

### 4.8 Hive aggregation as DMW-to-DMW coordination per Correction 2 + per-DMW-type sovereignty per Correction 4 (closes D-2D-D9)

**Per Correction 2 reframing:** Hive is not aggregation artifact; Hive IS the substrate mechanism for wallets (= entities, including AI_AGENT entities) to coordinate via shared intelligence. Wallets ARE entities; entities ARE represented by wallets; Hives ARE coordination across entity-wallets. COE provides each participating wallet/agent its memory capsule information through Hive participation. Feedback loop is data flowing back from wallets maintaining relevance + informativeness + Hive coherence.

**Per Correction 4 sovereignty constraint:** Hive coordination respects per-DMW-type sovereignty. Enterprise DMW zero-payload participates differently than Personal DMW (zero-payload constraint conditions what Enterprise can contribute); AI_AGENT wallet participation constrained by owning-human sovereignty (owning human's sovereignty bounds AI_AGENT's Hive participation); Personal DMW participates with full owner-sovereignty per RULE 0; Device DMW participates per device-owner sovereignty.

**Closes D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY:** explicit COE-aggregate consumption path canonicalized; aggregate enters context assembly as explicit layer rather than score-rank lottery.

### 4.9 Surface 2 decisions list

Decision territory enumerated:
- D-S2-1: Field 2 hypergraph precision (Option A upgrade vs Option B vocabulary patch — per Section 4.3 marker)
- D-S2-2: Spreading activation decay function specification
- D-S2-3: Coherence/contradiction detection algorithm specification
- D-S2-4: Emergent retrieval convergence parameters (iteration cap; stability threshold; activation floor)
- D-S2-5: Context-dependent salience scoring function (session-state input shape)
- D-S2-6: Hive coordination per-DMW-type sovereignty schedule (which DMW types participate how per Correction 4)
- D-S2-7: COE-aggregate consumption path mechanics (explicit context layer assembly)

---

## Section 5 — Surface 3: Agentic Coherence

### 5.1 Dual-posture canonicalization per Correction 4

**Per Correction 4 reframing:** Dual-posture is not "humans validate AI outputs" simple model. Dual-posture is "humans-in-the-loop is the underlying sovereignty principle; AI_AGENT autonomy operates within human-sovereign boundaries." The sovereignty principle is foundational architectural property, not opt-in feature.

Substrate primitives supporting dual-posture (already substrate-active): AI sovereignty cap at NEGOTIATE (`negotiate.service.ts:367-370`); explicit human override flag on Permission (`negotiate.service.ts:368` — `allow_ai_full=true`); AI_AGENT entity-type discrimination in EntityType enum; EXECUTIVE_OVERRIDE autonomy level in TwinConfig. RAA 12.8 extends the substrate with EscalationRequest model (Section 5.2) and correction-propagation chain (Section 5.2).

### 5.2 Human-in-the-loop primitives expansion

Substrate state per Phase 1 extension D10: priming.ts already shapes context as `escalations: EscalationItem[]` while EscalationRequest Prisma model does not exist (Section 14 TODO at `priming.ts:128`). Closes D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL drift.

Surface 3 expansion territory:
- **EscalationRequest model.** Prisma schema addition; status workflow (PENDING → APPROVED/REJECTED/EXPIRED); escalation-source-entity + escalation-target-entity + capsule-context-set linkage.
- **Validation gate flags.** `requires_validation` flag on Capsule or Permission; gate-trigger conditions; gate-resolution audit lineage.
- **Approval workflow primitives.** Multi-step approval chains; per-step approver discrimination; timeout policies.
- **Correction propagation chain.** When human corrects AI output, correction flows back to: (a) feedback service (Loop 1 informativeness signal per Section 5.5); (b) capsule relevance update; (c) audit chain (correction event); (d) Hive coordination (correction influences aggregate per Section 4.8).

### 5.3 Self-introspection primitive (NET-NEW)

Substrate currently has zero self-introspection primitives (per Phase 1 extension D11). Surface 3 adds substrate primitive for substrate writing capsules about substrate state.

Mechanism: `SUBSTRATE_OBSERVATION` CapsuleType extension per ADR-0021 (single canonical addition exercises ADR-0021 extension protocol; PRICING_TABLE update bundled). Substrate-tier observation events written as capsules into a system-principal-owned wallet (HIVE_AGGREGATE_BUILT system principal precedent; see `audit.ts:103`). Observable substrate state: per-(entity, capsule_type) relevance distribution shifts; per-wallet retrieval pattern changes; informativeness signal trends.

Self-introspection coupling to Surface 2 Field 5 context-dependent salience: substrate observations condition salience for substrate-administrator queries; substrate becomes its own consumer of context.

### 5.4 Agent-to-agent coordination per Corrections 1+3+4

**Per Correction 1 broader scope:** AI_AGENT entities are first-class peer entities with their own DMWs (per memory entry #21 + EntityType enum). Two AI_AGENT entities can coordinate via substrate primitives PERSON entities use.

**Per Correction 3 entity-type uniformity:** Whether participating entities are PERSON, AI_AGENT, COMPANY, DEVICE, APPLICATION, or GOVERNMENT, they coordinate via the same substrate primitives (COE retrieval, Hive participation, bilateral feedback). Universal coordination pattern at primitive level.

**Per Correction 4 sovereignty constraint:** AI_AGENT first-class for coordination AND constrained by owning-human sovereignty for governance. The architectural distinction:

- **Forbidden per RULE 0:** AI_AGENT_A directly grants Permission to AI_AGENT_B. Cross-AI direct permission grant breaks RULE 0.
- **Allowed per substrate primitives:** AI_AGENT_A and AI_AGENT_B both have wallets; COE provides each its capsule context; Hive aggregates form across AI_AGENT entities; bilateral feedback flows between agent wallets. Substrate-mediated coordination is architecturally distinct from direct permission grant.

Closes D-2D-D11-AGENT-TO-AGENT-INTENTIONAL-VS-GAP drift: agent-to-agent coordination is substrate-mediated (allowed) vs direct-grant-mediated (forbidden); substrate carries primitives for the allowed pattern via existing COE/Hive/feedback architecture extended for AI_AGENT-to-AI_AGENT participation.

### 5.5 Active-learning informativeness as refinement (closes D-2D-D8)

Per RAA 12.7 §4.1 + §8 + §10 forward enhancement framing + Phase 1 extension D8 finding: substrate Loop 1 closes the bilateral feedback loop with uniform updates (RELEVANCE_USED_BUMP=+0.05; RELEVANCE_UNUSED_DECAY=-0.02). Forward enhancement is informativeness weighting per RELEAP 2025 / ORIS 2024 / multi-armed bandits / Thompson sampling research patterns canonicalized in RAA 12.7.

Surface 3 frames informativeness as refinement, not net-new dimension (per D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY drift): existing relevance_score is partial informativeness signal degraded by uniform updates; informativeness weighting refines existing substrate signal. Refinement preserves patent-implementation-evidence continuity (extension of canonicalized substrate primitive vs introduction of new primitive).

Coupling to ADR-0022: combined_score amends rather than supersedes; ADR-0022 Forward implications canonicalize this path; RAA 12.8 may necessitate ADR-0022 amendment to add informativeness component.

### 5.6 DurationType vs DecayType collision resolution (operator-review-required marker)

**OPERATOR REVIEW REQUIRED:** PERMANENT + SESSION_ONLY exist as both DurationType (Permission model — operational) and DecayType (MemoryCapsule model — vocabulary-only) per D-2C-D5-DURATION-COLLISION drift. Two options:

- **Option A — Operationalize.** DecayType PERMANENT + SESSION_ONLY gain behavioral paths in retrieval (PERMANENT bypasses time-based decay independent of FOUNDATIONAL; SESSION_ONLY filters by session boundary). Substrate-coherent vocabulary-to-behavior conversion.
- **Option B — Rename.** Rename DecayType values to disambiguate from DurationType (e.g., `DECAY_PERMANENT`, `DECAY_SESSION_ONLY`) preserving vocabulary distinction without operationalizing. Schema migration; existing code updates.

Decision deferred to full-document drafting; outline flags the territory.

### 5.7 ACCESS_BASED behavioral closure (deferred to Step 2E)

Per D-2C-D5-ACCESS-BASED-STUB drift: comment-only stub at `queries/capsule.ts:402` ("ACCESS_BASED capsules relevant while they are being used") is intent-without-implementation. Surface 3 frames the closure (ACCESS_BASED differentiates from TIME_BASED via access-pattern-driven decay; access_count + recent-access-window condition decay rate). Engineering implementation deferred to Step 2E.

### 5.8 Per-DMW-Type Sovereignty Rules (NEW SECTION per Correction 4 — operator-review-required marker)

**OPERATOR REVIEW REQUIRED:** explicit canonicalization of how six EntityType values translate to wallet governance rules. Per memory entry #16, three DMW types exist (Personal / Enterprise zero-payload / Device). Per EntityType enum, six entity types exist (PERSON / COMPANY / AI_AGENT / DEVICE / APPLICATION / GOVERNMENT).

**Mapping question requiring operator review:**

- **PERSON → Personal DMW.** Direct mapping; canonical case.
- **COMPANY → Enterprise zero-payload DMW.** Direct mapping; canonical case per memory entry #16.
- **DEVICE → Device DMW.** Direct mapping; canonical case.
- **AI_AGENT → ?** Maps to owning-human's Personal DMW (twin pattern per `governance/twin.service.ts`)? Or warrants its own DMW type designation?
- **APPLICATION → ?** Maps to which existing DMW type? Or warrants its own DMW type designation?
- **GOVERNMENT → ?** Maps to Enterprise zero-payload DMW? Or warrants its own DMW type designation given regulatory sovereignty differs from commercial enterprise?

**Sovereignty rules per-DMW-type (canonical territory):**

- **Personal DMW.** Owner-human is sovereign per RULE 0; only owner-human grants LONG_TERM or PERMANENT; AI_AGENT cannot grant to AI_AGENT.
- **Enterprise zero-payload DMW.** Zero-payload constraint: enterprise carries metadata + governance, not raw payload content; payload remains in contributing entity's wallet; per memory entry #16.
- **Device DMW.** Device-owner sovereignty (the human who owns the device); device cannot grant beyond owner-permitted scope.
- **AI_AGENT (mapping pending operator review).** Owning-human sovereignty bounds AI_AGENT autonomy; AI_AGENT cannot grant to AI_AGENT directly per RULE 0; substrate-mediated coordination allowed per Section 5.4.
- **APPLICATION (mapping pending operator review).** Application-owner sovereignty (the human or organization deploying the application); sovereignty rules pending.
- **GOVERNMENT (mapping pending operator review).** Government-jurisdiction sovereignty; regulatory governance applies; per-jurisdiction sovereignty rules pending.

**Patent-implementation-evidence territory:** per-DMW-type sovereignty differentiation is substantive substrate-architecture coverage extension under US 12,517,919. Continuation patent candidate per Section 8.4. Operator-review-required marker captures the patent-territory implication.

### 5.9 Surface 3 decisions list

Decision territory enumerated:
- D-S3-1: EscalationRequest model schema
- D-S3-2: Validation gate flag mechanics
- D-S3-3: Approval workflow primitives
- D-S3-4: Correction propagation chain mechanics
- D-S3-5: Self-introspection — SUBSTRATE_OBSERVATION CapsuleType + system-principal wallet + observation-event schema
- D-S3-6: Agent-to-agent coordination — substrate-mediated coordination mechanics for AI_AGENT-to-AI_AGENT (Hive participation; cross-wallet COE)
- D-S3-7: Active-learning informativeness function (refinement coefficients + signal computation)
- D-S3-8: DurationType-vs-DecayType resolution (Option A operationalize vs Option B rename — per Section 5.6 marker)
- D-S3-9: Per-DMW-type sovereignty rules — six EntityType → DMW type mapping (per Section 5.8 marker)

---

## Section 6 — Cross-Surface Architectural Decisions

### 6.1 INT-1 unified cross-wallet context layer per Corrections 3+4

Per Correction 3 entity-type uniformity: cross-wallet context layer treats all six EntityType values as first-class participants via universal coordination primitives. Per Correction 4 sovereignty asymmetry: cross-wallet retrieval across heterogeneous entity types is asymmetric — Enterprise zero-payload contributes metadata; Personal contributes full payload-permitting capsules; AI_AGENT contributes within owning-human sovereignty; Device contributes within device-owner sovereignty; APPLICATION + GOVERNMENT per Section 5.8 mapping resolution.

Multi-DMW retrieval (Surface 1 §3.8) + Hive consumption (Surface 2 §4.8) share substrate primitive: cross-wallet context layer with per-DMW-type sovereignty as scheduling constraint.

### 6.2 INT-2 informativeness signal IS self-introspection primitive

Per Phase 1 extension INT-2: active-learning informativeness (Surface 3 §5.5) is also the substrate primitive for self-introspection (Surface 3 §5.3). Substrate that knows which retrievals were informative is substrate that observes its own behavior. Designing one designs both. SUBSTRATE_OBSERVATION CapsuleType captures informativeness trend observations as first-class capsules.

### 6.3 INT-3 correction propagation IS high-informativeness signal

Per Phase 1 extension INT-3: when a human corrects an AI output (Surface 3 §5.2), the corrected capsules carry maximum informativeness (Surface 3 §5.5). Correction propagation chain = high-signal informativeness input. Surface 3 designs both as coupled subsystem.

### 6.4 INT-4 cross-type-balance-at-scale (Surfaces 1+2+RAA 12.9 forward)

Cross-type balance (Phase 1 D6) becomes critical at Surface 1 scale (millions of capsules per entity); cross-wallet retrieval (Surface 1 §3.8) compounds the type-balance problem. Surface 1 + Surface 2 jointly address the substrate-tier policy. RAA 12.9 cites the substrate-tier policy as dependency for per-data-point monetization at trillion scale.

### 6.5 INT-5 spreading activation activates dormant connected_capsule_ids

Per Phase 1 extension INT-5: spreading activation (Surface 2 Field 1 §4.2) is the natural consumer of `connected_capsule_ids` substrate primitive. Closes D-2C-D2 drift via Surface 2 design.

### 6.6 INT-6 informativeness function joins frozen-anchors family

Per Phase 1 extension INT-6: informativeness function (Surface 3 §5.5) coefficients become tamper-anchored architectural property like `combined_score` coefficients (per ADR-0022). RAA 12.8 must lock the informativeness function with anchor test discipline; placement alongside `CRYPTO_CONFIG` + `combined_score` test anchors per ADR-0003 frozen-config tamper-anchor pattern.

---

## Section 7 — Active-Learning Informativeness as Refinement

### 7.1 Substrate continuity claim

Existing `relevance_score` accumulates informativeness implicitly via uniform Loop 1 updates. The signal is partial informativeness signal degraded by uniform updates. Active-learning informativeness refines existing substrate signal rather than introducing net-new dimension. Refinement preserves patent-implementation-evidence continuity per Section 1.6.

### 7.2 Refinement decisions reference

Surface 3 §5.5 decision D-S3-7 specifies refinement function. Coefficients: outcome-informativeness scoring weight; surprise-driven retention multiplier; exploration budget allocation. Function locked via anchor test per Section 6.6.

### 7.3 Forward ADR amendment

Per ADR-0022 Forward implications: combined_score amends rather than supersedes; informativeness component extension is amendment territory. RAA 12.8 ship-to-origin/main may necessitate ADR-0022 amendment in subsequent commit; outline flags the amendment path; full-document drafting confirms timing.

---

## Section 8 — Patent-Implementation-Evidence Framing

### 8.1 Cryptographically-timestamped contemporaneous record

Per memory entry #12, every commit on origin/main is cryptographically-timestamped contemporaneous record. RAA 12.8 outline commit + RAA 12.8 full-document commit + Step 2E engineering commits compose evidentiary mass. Per Zone U2 (RAA 12.7 §2.5), patent-holder implementation record is unilateral forward-only flow; rewriting commits would invalidate evidentiary value.

### 8.2 Defensive publication strategy

Per operator Decision 2, patent counsel not currently engaged; Option Patent-A defensive publication strategy authorized. RAA 12.8 ship-to-origin/main provides prior-art protection. Defensive publication preserves patent-prosecution optionality without requiring active counsel engagement.

### 8.3 Substrate-architecture-level patent claim coverage

Per ADR-0021 distinction from ADR-0009: patent claim coverage applies at substrate-architecture level (typed Capsules within Three-Wallet Architecture; COSMP operations governing them; retrieval/decay/feedback dynamics) rather than at enumeration-count level. RAA 12.8 extends substrate-architecture coverage along three surfaces (Scale + Relational Dynamics + Agentic Coherence) without altering enumeration-count locks.

### 8.4 Continuation patent candidate identification

Per Correction 4: per-DMW-type sovereignty differentiation (Section 5.8) is substantive substrate-architecture coverage extension under US 12,517,919. Continuation patent candidate identified. Adversarial-actor protection consideration: per-DMW-type sovereignty rules canonicalized on origin/main establish prior-art for the differentiation; if adversarial actor later attempts to claim sovereignty-undifferentiated substrate, canonical record on origin/main shows substrate has carried per-DMW-type differentiation since RAA 12.8 commit. Continuation patent candidate review queued for future patent counsel engagement (timing per Decision 2 strategy).

---

## Section 9 — Forward Implications

### 9.1 RAA 12.9 forward dependency

RAA 12.9 (Governance & Monetization at Scale) cites RAA 12.8 cross-type balance policy (Section 6.4) as substrate dependency. RAA 12.8 reciprocates the citation in Section 1.5 + Section 6.4 + this section per RULE 14 bidirectional citation discipline. RAA 12.9 drafting follows after RAA 12.8 full-document drafting per Step 3+ sequence.

### 9.2 Step 2E engineering surface

Decisions enumerated in Section 3.9 + Section 4.9 + Section 5.9 compose Step 2E engineering surface. Per-DMW-type sovereignty rule implementation per Correction 4 (Section 5.8 Decision D-S3-9) included in Step 2E surface. Engineering work follows full-document drafting; specific commits sequenced during Step 2E planning.

### 9.3 Step 2F glossary refresh

32 canonical entries from 74b2765 refresh after RAA 12.8 ship; entries gain richer per-type weight semantics; entries reference RAA 12.8 sections as canonical citation discipline per RULE 14.

### 9.4 Future RAA candidates

- **RAA 12.9 (queued).** Governance & Monetization at Scale per Decision 3.
- **RAA on Self-Introspection Architecture (candidate).** If Section 5.3 SUBSTRATE_OBSERVATION primitive grows into substantive subsystem, dedicated RAA may emerge.
- **RAA on Multi-DMW Concurrent Flow (candidate).** Surface 1 §3.8 may grow into dedicated RAA if cross-wallet retrieval mechanics warrant standalone canonicalization.

### 9.5 ADR amendment paths

- **ADR-0021 amendment.** Per-DMW-type configuration table (Section 5.8) may become second deliberate-blocker surface; ADR-0021 amendment enumerates per its own Forward implications.
- **ADR-0022 amendment.** combined_score informativeness component extension (Section 7.3) per ADR-0022 Forward implications.
- **New ADR candidate: Per-DMW-Type Sovereignty Posture.** If Section 5.8 per-DMW-type sovereignty rules warrant standalone canonical reference (sixth canonical reference candidate for substrate-discipline quartet→quintet→sextet growth per CLAUDE.md §6 acknowledgment).
- **New ADR candidate: SUBSTRATE_OBSERVATION CapsuleType + Self-Introspection Posture.** If Section 5.3 self-introspection mechanism warrants standalone canonical reference.

---

## Section 10 — References

### ADRs (substrate-tier canonical decisions)

- ADR-0001 (Three-Wallet Architecture) — three DMW types; Section 5.8 mapping foundation
- ADR-0002 (Append-Only Audit Chain) — Zone U1 substrate; Section 1.2 boundary
- ADR-0003 (Frozen-Config Tamper Anchors) — Section 6.6 anchor pattern
- ADR-0006 (Cross-Org Leak Prevention) — Surface 1 cross-wallet boundary; Surface 2 Hive coordination
- ADR-0009 (COSMP 7-Operation Enum Lock) — locked-enum precedent; Section 5.3 distinction
- ADR-0010 (Foundation Tests Are Legitimately Slow) — Surface 1 test-cycle constraint
- ADR-0015 Decision B (12-error TypeScript baseline) — ADR-0021 amendment mechanism
- ADR-0016 (Pin-and-Optimize Framework) — substrate-pinning canonical reference
- ADR-0017 (Production Discipline) — substrate-investigation canonical reference; Step 2C investigation pattern
- ADR-0018 (Deployment-Target Agnosticism) — substrate-portability canonical reference
- ADR-0019 (Cryptographic-Suite Posture) — substrate-cryptographic-resilience canonical reference
- ADR-0020 (Two-Register IP Discipline) — Register 2 voice applied throughout outline
- ADR-0021 (Capsule Type Extension Protocol) — Section 5.3 SUBSTRATE_OBSERVATION extension; Section 9.5 amendment path
- ADR-0022 (combined_score Formula Canonicalization) — Section 5.5 refinement substrate; Section 7.3 amendment path

### RAAs (substrate-tier architectural records)

- RAA 12.7 (Dynamic Flow Architecture; commit `0fd8da7`) — bilateral-vs-unilateral zone discrimination; Section 2.1 verbatim precedent; lateral-class extension premise
- RAA 12.9 (Governance & Monetization at Scale; queued) — Section 1.5 deferral; Section 6.4 + Section 9.1 forward dependency

### Patent references

- US 12,517,919 — COSMP/DMW patent; substrate-architecture coverage
- US 12,164,537 — DMW + Foundation primitives
- US 12,399,904 — DMW + Foundation primitives

### Substrate citations (verified during Step 2C investigation)

- `apps/api/src/services/coe/coe.service.ts` — single-wallet retrieval; STEP 3 FOUNDATIONAL bypass; Section 3.2-3.4 + Section 3.8 design surface
- `apps/api/src/services/coe/keywords.ts` — combined_score formula canonicalized at ADR-0022
- `apps/api/src/services/feedback/feedback.service.ts` — Loop 1 uniform updates; Section 5.5 refinement target
- `apps/api/src/services/hive/hive.service.ts` — buildHiveAggregate; Section 4.8 reframing target
- `apps/api/src/services/cosmp/negotiate.service.ts` — AI sovereignty cap; Section 5.1 substrate primitive
- `apps/api/src/services/governance/twin.service.ts` — EntityMembership traversal; Section 5.8 AI_AGENT-PERSON mapping pattern
- `apps/api/src/services/otzar/observation.service.ts` — cross-wallet `findMany` precedent; Section 3.8 multi-DMW pattern
- `apps/api/src/services/otzar/priming.ts` — escalations shape; Section 5.2 EscalationRequest target
- `packages/database/prisma/schema.prisma` — EntityType enum + Wallet model + MemoryCapsule model + EntityMembership model + DurationType + DecayType + StorageTier
- `packages/database/src/queries/audit.ts` — verifyAuditChain + HIVE_AGGREGATE_BUILT system principal precedent
- `packages/database/src/queries/capsule.ts:402` — ACCESS_BASED comment-only stub (Section 5.7 closure target)

### Glossary canonical entries

- `docs/reference/glossary.md` — 32 canonical entries from 74b2765; Step 2F refresh queued per Section 9.3

### Drift catalog (RULE 13 substrate-honesty surfacing during Step 2C)

- D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER — closed via Surface 2 §4.7
- D-2C-D5-DURATION-COLLISION — Section 5.6 operator-review-required marker
- D-2C-D5-ACCESS-BASED-STUB — Section 5.7 deferred to Step 2E
- D-2C-D6-OTZAR-ALLOWLIST-AS-IMPLICIT-POLICY — Section 6.4 cross-type balance territory
- D-2C-D3-PRICING-IMPORT-LEAK — RAA 12.9 territory; flagged forward
- D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY — closed via Surface 2 §4.8
- D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL — closed via Surface 3 §5.2 EscalationRequest
- D-2D-D11-AGENT-TO-AGENT-INTENTIONAL-VS-GAP — closed via Surface 3 §5.4 substrate-mediated-vs-direct-grant distinction
- D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT — closed via Surface 1 §3.2
- D-2D-D13-HYPERGRAPH-NAMING-PRECISION — Section 4.3 operator-review-required marker
- D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY — Surface 3 §5.5 refinement framing

### CLAUDE.md operating rules referenced

- RULE 0 (Sovereign-Human Invariance) — Section 1.1 wallet sovereignty principle; Section 5.4 cross-AI direct grant prohibition
- RULE 13 (Surface Drifts Inline Over Silent Fix) — drift catalog above
- RULE 14 (Bidirectional Citation Discipline) — Section 9.1 RAA 12.9 reciprocal citation; Section 10 reference completeness
- RULE 17 (Architectural Framing Is Load-On-Open) — RAA 12.7 + RAA 12.8 Foundation-substrate context
- RULE 18 (Verify Operation Type Against Actual File State) — Section 5.6 + Section 5.8 operator-review-required-markers identify substrate-state verification points
- RULE 19 (Two-Register IP Discipline) — Register 2 voice operating throughout outline; zero protected-name leak verified at staging

### Memory entries referenced

- Memory entry #16 — three DMW types (Personal / Enterprise zero-payload / Device); Section 5.8 mapping foundation
- Memory entry #21 — AI_AGENT first-class entity; Section 5.4 coordination foundation
- Memory entry #12 — every commit on origin/main is contemporaneous patent-implementation evidence; Section 1.6 + Section 8.1 + Section 8.4 framing

### Investigation lineage

- Step 2C Phase 1 investigation (D1-D6) — substrate landscape pre-RAA-12.8
- Step 2C Phase 1 extension investigation (D7-D13) — substrate landscape extended
- HEAD `3c2eb99` ([ADR-0022]) — investigation complete; outline drafting follows

### Outline-level operator-review-required markers

- **Section 4.3 — Field 2 hypergraph precision.** Option A true hypergraph upgrade vs Option B vocabulary patch.
- **Section 5.6 — DurationType-vs-DecayType collision resolution.** Option A operationalize vs Option B rename.
- **Section 2.3 — Lateral zone count.** 6 proposed; operator confirms or extends.
- **Section 5.8 — Per-DMW-Type Sovereignty Rules (per Correction 4).** Six EntityType → three DMW types mapping; AI_AGENT / APPLICATION / GOVERNMENT mapping pending; operator confirms mapping or extends DMW type designations.

These resolve during full-document drafting, not at outline commit.
