# RAA 12.8 — Substrate Dynamics: Scale, Relational Dynamics, Agentic Coherence

**Status:** Draft Outline
**Date:** 2026-05-10
**Trigger:** Step 2C Phase 1 + Phase 1 extension investigation surfaced 13 dimensions of substrate landscape across weighting/retrieval/coordination/scale/dynamics. Operator-confirmed scope: three architectural surfaces (Scale + Relational Dynamics + Agentic Coherence) with Surface 4 (Governance & Monetization at Scale) extracted to RAA 12.9. Outline ships as standalone commit per Decision B Option Outline-A; full document drafting is multi-session future work.
**Scope:** Outline-tier canonicalization of substrate-dynamics architectural surfaces. Section structure, decision territory framing, and operator-review-required markers established. Per-decision rationale + worked examples + substrate citations are full-document scope, not outline scope.

**Cross-references:**
- RAA 12.7 (Dynamic Flow Architecture; bilateral-vs-unilateral zone discrimination; default-rule-bilateral)
- RAA 12.9 (Governance & Monetization at Scale; queued; forward dependency on RAA 12.8 cross-type balance policy)
- ADR-0001 (Three-Wallet Architecture — three DMW types: Personal / Enterprise / Device; substrate-honest framing per Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` — Enterprise carries company data with forget-on-detach at Permission tier per Zone U4; memory entry #16 "zero-payload" framing is corrective territory)
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

Per memory entry #16 (substrate-honest correction per Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`), three DMW types exist with distinct sovereignty postures: **Personal DMW** (owner-human is sovereign per RULE 0; owner grants LONG_TERM and PERMANENT permissions; AI_AGENT cannot grant to AI_AGENT directly per RULE 0); **Enterprise DMW** (carries company data with forget-on-detach at Permission tier per Zone U4 — substrate-honest correction to memory entry #16 zero-payload framing; forget-on-detach semantics live at Permission tier, not at WalletType-tier; per-purpose Permission scoping allows differentiated access per Permission terms; revocation removes access via REVOKE operation; sovereignty-preserving by construction — enterprise cannot retain individual data beyond Permission grants); **Device DMW** (device-owner sovereignty: the human who owns the device is sovereign; device cannot grant beyond owner-permitted scope; device acts within owner-bounded delegation).

Per `EntityType` enum at `packages/database/prisma/schema.prisma`, six entity types exist: PERSON, COMPANY, AI_AGENT, DEVICE, APPLICATION, GOVERNMENT. The six entity types coordinate via universal substrate primitives (COE retrieval per `apps/api/src/services/coe/coe.service.ts`; Hive participation per `apps/api/src/services/hive/hive.service.ts`; bilateral feedback per `apps/api/src/services/feedback/feedback.service.ts` Loop 1) but operate within per-DMW-type governance constraints. The mapping from six EntityType values to three DMW types is canonicalized at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` with six EntityType mappings RESOLVED: PERSON → Personal; COMPANY → Enterprise (per Correction A); DEVICE → Device; AI_AGENT → owning-entity-derived DMW (per Correction B owning-entity-derived discipline; recursive resolution via EntityMembership substrate primitive); APPLICATION → Enterprise; GOVERNMENT → Custom Government DMW (NET-NEW substrate primitive extension via ADR-0021 pattern).

The wallet sovereignty principle propagates throughout RAA 12.8. Cross-section reach is not optional context but architectural load-bearing constraint:

- **§4.8 Hive coordination** respects per-DMW-type sovereignty per Corrections A+B canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`: Enterprise participation operates per Permission-scoped access with forget-on-detach at Permission tier (Correction A); AI_AGENT participation bounded by owning-entity sovereignty per owning-entity-derived discipline (Correction B); Personal full-owner-sovereignty per RULE 0; Device per device-owner sovereignty.
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
- Three-Wallet Architecture with sovereignty rules (Personal / Enterprise / Device per ADR-0001 + memory entry #16; substrate-honest framing per Correction A canonical at §5.8 amendment — Enterprise carries data with forget-on-detach at Permission tier)
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

Surface 2 also operationalizes lateral flow (closes D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift via §4.7) and reframes Hive aggregation as DMW-to-DMW coordination per Correction 2 (closes D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY drift via §4.8). Hive coordination respects per-DMW-type sovereignty per Correction 4 + Corrections A+B canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`: Enterprise participates per Permission-scoped access with forget-on-detach at Permission tier (Correction A); AI_AGENT participation bounded by owning-entity sovereignty per owning-entity-derived discipline (Correction B).

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

- **Within entity sovereignty.** Lateral flow does not cross entity ownership boundary; lateral flow respects per-DMW-type sovereignty per Correction 4 by construction. When lateral flow operates within a single wallet, sovereignty is preserved trivially. When lateral flow operates across wallets (multi-DMW retrieval per Surface 1), the per-DMW-type sovereignty rules canonicalized at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` apply as scheduling constraints per Corrections A+B canonical — Personal contributes full payload-permitting capsules; Enterprise contributes data per Permission-scoped access with forget-on-detach at Permission tier (Correction A); AI_AGENT contributes within owning-entity sovereignty per owning-entity-derived discipline (Correction B); Device contributes within device-owner sovereignty. Lateral-flow architecture must encode the per-DMW-type discipline; lateral flow that bypasses sovereignty rules is incoherent under RULE 0 sovereign-human invariance.

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
- **Per-DMW-type sovereignty note.** Spreading activation within Personal DMW operates with full owner-sovereignty per RULE 0; spreading activation within Enterprise DMW respects Permission-scoped access with forget-on-detach at Permission tier per Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` (activation propagates per Permission grant scope; Permission revocation detaches access); spreading activation within Device DMW respects device-owner sovereignty.

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
- **Per-DMW-type sovereignty constraint per Correction 4 + Corrections A+B canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`.** Hive coordination respects per-DMW-type sovereignty: Enterprise participates per Permission-scoped access with forget-on-detach at Permission tier (Correction A — substrate-honest correction to zero-payload framing); AI_AGENT participation bounded by owning-entity sovereignty per owning-entity-derived discipline (Correction B — owning-entity's sovereignty bounds AI_AGENT's Hive participation through recursive resolution); Personal full owner-sovereignty per RULE 0; Device per device-owner sovereignty. The L6 consumer-side lateral zone applies these constraints when conditioning retrieval salience — aggregate from Personal-DMW-only Hive conditions retrieval differently than aggregate from mixed-DMW-type Hive.

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
- Per Correction 4 + Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`: per-DMW-type aggregates may differ in semantic — Personal DMW carries `avg_relevance_score` semantic; Enterprise DMW carries aggregate semantic per Permission-scoped access with forget-on-detach at Permission tier (substrate-honest correction to zero-payload framing — Enterprise carries data; aggregate operates within Permission grant scope). The per-DMW-type variation is canonicalized at §5.8 amendment; §3.5 references the variation as forward dependency.

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
- **Enterprise DMW.** Carries company data with forget-on-detach at Permission tier per Zone U4 (per Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` — substrate-honest correction to memory entry #16 zero-payload framing). Surface 1 §3.8 enforces sovereignty at scheduling: Enterprise retrieval pipeline contributes data per Permission-scoped access; per-purpose Permission scoping allows differentiated access per Permission terms; forget-on-detach operates at Permission revocation tier (Zone U4 per RAA 12.7 §2.5). Permissioned DMWs holding Permission grants from Enterprise forget Enterprise data on Permission detach.
- **AI_AGENT DMW.** Contribution bounded by owning-entity sovereignty per Correction B owning-entity-derived discipline canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` (any entity can own AI_AGENT, not PERSON-only; six AI_AGENT sub-mappings: PERSON-owned → Personal; COMPANY-owned → Enterprise; APPLICATION-owned → Enterprise; GOVERNMENT-owned → Custom Government; DEVICE-owned → Device; AI_AGENT-owned → recursive; Standalone → AI_AGENT-tier). AI_AGENT-owned wallet contribution operates within owning-entity's permission grants; recursive resolution terminates at sovereign-human entity or AI_AGENT-tier baseline per RULE 0 invariance + Correction C forward-folded (human-permission-gating substrate-tier invariant). Surface 1 §3.8 enforces the constraint at scheduling: AI_AGENT retrieval pipeline operates with scope reflecting owning-entity sovereignty; cross-wallet ranking respects the bounded scope.
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

Section 4 canonicalizes Surface 2 of RAA 12.8 substrate-dynamics architecture. Surface 2 designs the conjunction of five mathematical/architectural fields composing as substrate primitive: spreading activation networks + hypergraph relational consumption + resonance/coherence dynamics + self-organizing emergent retrieval + context-dependent salience. Section 4 closes two Phase 1 / Phase 1 extension drifts inline (D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER via §4.7; D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY via §4.8) and surfaces an OPERATOR REVIEW REQUIRED marker at §4.3 (D-2D-D13-HYPERGRAPH-NAMING-PRECISION precision decision). Section 4 §4.9 enumerates the Step 2E engineering surface that closes the architectural canonicalization with implementation work.

### 4.1 Five-field integration framing

Operator-confirmed scope: Surface 2 integrates five mathematical/architectural fields in conjunction, not in sequence. Integration is the design surface, not selection of one field. The five fields compose at substrate-architecture register; substrate must support all five operating concurrently within Surface 1 §3.6 latency budget bounds.

#### Five fields enumerated

- **Field 1 — Spreading activation networks** (Quillian 1968 onward; Collins & Loftus 1975 spreading-activation theory of semantic memory; Anderson ACT-R 1976+). Activation propagates through associative network structures during retrieval; activated nodes activate connected nodes with decay. Foundation primitive: `MemoryCapsule.connected_capsule_ids: String[]` (verified substrate-active in writes; per D-2C-D2 drift currently dormant in retrieval). Field 1 operationalizes the dormant primitive; closes D-2C-D2 via §4.7.
- **Field 2 — Hypergraph relational consumption.** N-ary capsule co-membership in shared relational structures conditions retrieval. Foundation primitive: directed embedded binary edges (`connected_capsule_ids` + `connected_entity_ids`) — not true N-ary hypergraph per D-2D-D13 drift. §4.3 carries OPERATOR REVIEW REQUIRED precision decision (Option A true hypergraph upgrade vs Option B vocabulary patch).
- **Field 3 — Resonance/coherence dynamics** (Hofstadter & Mitchell Copycat 1992; Hofstadter Fluid Concepts and Creative Analogies 1995; Mitchell Metacat 1993). Capsules reinforce or contradict each other; coherent sets emerge from local-interaction dynamics. Foundation primitive: NET-NEW at substrate (verified zero substrate primitives per Phase 1 extension D13 grep). §4.4 designs the schema additions + detection algorithms.
- **Field 4 — Self-organizing emergent retrieval** (complexity science; local-interaction-driven selection rather than top-down score-rank-select). Foundation primitive: NET-NEW at substrate (verified zero emergent / self-organizing primitives per D13 grep). §4.5 designs the convergence discipline + parameter bounds.
- **Field 5 — Context-dependent salience** (Bartlett 1932 *Remembering*; Schank scripts 1977; Rumelhart schemata; situated cognition literature). Same capsule scores differently across session states. Foundation primitive: NET-NEW at substrate (verified zero context-dependent salience primitives per D13 grep). `combined_score` per ADR-0022 is session-state-independent. §4.6 designs the session-state-conditioned scoring function.

#### Conjunction novelty at substrate-architecture register

Each field individually is well-documented in cognitive-science / database-systems literature. Foundation's contribution is the conjunction at substrate-architecture register: substrate carries all five fields composing concurrently within COSMP/DMW protocol governance; no other memory architecture composes the conjunction at substrate-tier with sovereignty-respecting cross-entity coordination + cryptographic anchoring + audit-chain integrity per RAA 12.7 §2.5 trust roots.

The conjunction operates within bounded compute budget per Surface 1 §3.6 latency budget (≤10ms target band for cross-wallet retrieval; ≤5ms for single-wallet pre-filter + scoring; conjunction operates within bound). Bounded conjunction is the architectural property — substrate composes the five fields without exceeding ASI-consumer latency requirements. The boundedness is non-trivial: spreading activation alone can exceed latency budgets at high hop counts; resonance/coherence detection alone can exceed budgets at high pair-comparison counts; emergent retrieval alone can exceed budgets without convergence parameters. The conjunction bounds emerge from the joint architecture — Field 1 + Field 4 share iteration budget; Field 3 detection runs within Field 4 convergence; Field 5 conditioning composes with Field 1 propagation.

#### Cross-section reach

Surface 2 couples to other RAA 12.8 surfaces at multiple points per §6:

- **§3.6 latency budget bounds** field operation. All five fields must operate within Surface 1 §3.6 budgets; convergence + propagation + detection algorithms are bounded by latency.
- **§3.7 query complexity bounds** condition Field 1 max-hops + Field 4 max-iterations.
- **§5.5 active-learning informativeness consumes Field 5 salience signal** per INT-2. The two architectures share substrate primitive — substrate that knows which retrievals were informative is substrate that observes its own behavior; Field 5 salience signal feeds informativeness weighting.
- **§6.5 INT-5 spreading activation activates connected_capsule_ids** dormant primitive. Field 1 (§4.2) IS the canonical lateral consumer that closes D-2C-D2 via §4.7.

### 4.2 Field 1 — Spreading activation networks (Quillian 1968+; Collins & Loftus 1975; Anderson ACT-R 1976+)

Activation propagates through `MemoryCapsule.connected_capsule_ids` edges during retrieval; capsule activation conditions other capsules' candidate scoring within the same query cycle. Field 1 is the canonical lateral zone L1 consumer per Section 2 §2.3 + RAA 12.7 §2.5 lateral class.

#### Substrate primitive — verified active in writes; dormant in retrieval

Pre-flight verification (substrate-evidence gathering before draft): `MemoryCapsule.connected_capsule_ids: String[]` and `MemoryCapsule.connected_entity_ids: String[]` are substrate-active in writes per `apps/api/src/services/cosmp/write.service.ts:53-54` (interface declarations), `:79-80` (update interface declarations), `:334-335` (create-data assignments), `:546-549` (update-data assignments). Five write sites total; consumer sites in retrieval-tier code: zero. The dormancy is the D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift surfaced at Phase 1 investigation and closed by §4.7 lateral flow operationalization.

#### Cognitive-science grounding

The field operationalizes the cognitive-science-validated mechanism of associative spreading activation. Quillian 1968 introduced the spreading-activation hypothesis for semantic memory; Collins & Loftus 1975 formalized the spreading-activation theory of semantic processing as substrate-tier mechanism; Anderson ACT-R 1976+ embedded spreading activation as core architectural primitive in cognitive architecture. The literature is decades-validated; Foundation operationalizes the mechanism within COSMP/DMW protocol governance — substrate-architecture register, not engineering optimization.

#### Architectural decisions

Surface 2 §4.2 canonicalizes:

- **Seed capsules emerge from initial scoring.** Top-K candidates from `combined_score` ranking per ADR-0022 become activation seeds. The seed set is bounded per Surface 1 §3.4 candidate budget; activation proceeds from bounded seed set.
- **Activation propagates through `connected_capsule_ids` edges with per-edge decay.** The decay coefficient is bounded — typical 0.7 (each hop reduces propagated activation to 70% of source); ceiling 0.9 (slower decay; deeper propagation). Decay coefficient resolves during full-document drafting per operator review; outline establishes the decision territory.
- **Activation accumulates per-candidate.** A capsule activated by multiple seed capsules accumulates activation (not max-of, but sum-with-decay). The accumulation conditions the candidate's `combined_score` — activation contributes a weighted addend to the score formula. Coefficient resolves during full-document drafting.
- **Activation propagation respects RELEVANCE_FORGET_FLOOR per `coe.service.ts:44`.** Sub-floor capsules are excluded from activation propagation source set; sub-floor activated capsules are not promoted above floor by activation alone (the floor is intentional-forgetting per cognitive-science framing per §1.1 + Anderson, Bjork & Bjork 1994; activation does not bypass intentional forgetting).
- **Max hops bounded per Surface 1 §3.7 query complexity bound.** Typical: 3 hops. Ceiling: 5 hops. Beyond ceiling, activation propagation exceeds latency budget; bound enforced at COE entry per §3.7.

#### Drift closure — D-2C-D2 via §4.7

Field 1 spreading activation IS the canonical lateral flow consumer of `connected_capsule_ids` substrate primitive. The dormant primitive becomes consumer-active when §4.7 lateral flow operationalization implements the spreading-activation traversal in COE retrieval. Substrate-honesty discipline operating per RULE 13: D-2C-D2 surfaced inline at investigation; closure mechanism canonical here; engineering implementation enumerated at §4.9 Step 2E.

#### Cross-section reach

- §3.6 latency budget bounds activation propagation depth (typical 3 hops within ≤5ms scoring budget)
- §3.7 max-hops complexity bound (ceiling 5)
- §6.5 INT-5 (Field 1 + D2 dormant primitive joint canonicalization)
- §4.7 lateral flow operationalization (D-2C-D2 closure)
- §4.5 Field 4 emergent retrieval composes Field 1 with Fields 3+5 within bounded compute budget

### 4.3 Field 2 — Hypergraph relational consumption — OPERATOR REVIEW REQUIRED (D-2D-D13 precision decision)

Substrate primitive: `MemoryCapsule.connected_capsule_ids: String[]` and `MemoryCapsule.connected_entity_ids: String[]` are directed embedded binary edges (binary edge graph), not true N-ary hypergraph. The vocabulary distinction matters for substrate-architecture canonicalization; per D-2D-D13-HYPERGRAPH-NAMING-PRECISION drift surfaced at Phase 1 extension, the precision decision requires operator review.

#### Verified substrate state

Pre-flight verification confirms current substrate state:
- `connected_capsule_ids String[]` field on MemoryCapsule — array of capsule UUIDs, ordered, possibly duplicate-free (no schema constraint enforces uniqueness)
- `connected_entity_ids String[]` field on MemoryCapsule — array of entity UUIDs
- Both fields are directed (reference outward from the carrier capsule); both are binary at edge level (each entry is a single target reference); zero N-ary hyperedge primitive currently exists at substrate

The substrate carries an embedded edge list, not a hypergraph. The drift surfaced at Phase 1 extension noted that glossary canonical vocabulary referenced "hypergraph" while substrate carried "binary edge graph" — substrate-vocabulary inconsistency.

#### OPERATOR REVIEW REQUIRED — two architectural options

**OPERATOR REVIEW REQUIRED:** precision decision between two paths. Both options strengthen substrate vocabulary precision; the trade-off is engineering effort vs relational expressiveness.

**Option A — True N-ary hypergraph upgrade.**

Add `CapsuleRelation` Prisma model with `members: String[]` for N-ary capsule co-membership:

```prisma
model CapsuleRelation {
  relation_id   String   @id @default(uuid()) @db.Uuid
  members       String[] // N-ary capsule UUIDs
  relation_type String?  // optional semantic type
  created_at    DateTime @default(now())
  // ... per-DMW-type sovereignty + audit fields
}
```

Schema migration via Prisma `db push` per ADR-0001 no-migrations-directory pattern. Write-tier changes: SHARE / WRITE operations may create CapsuleRelation rows alongside connected_capsule_ids. Retrieval-tier changes: Field 1 spreading activation Field 2 hypergraph traversal extends to CapsuleRelation members.

- **Engineering effort.** Substantial. New Prisma model + schema migration + write-tier changes + retrieval-tier changes + per-DMW-type sovereignty enforcement at hypergraph traversal.
- **Relational expressiveness.** N-ary co-membership — capsules participate in shared relational structures with arbitrary arity. Hypergraph traversal supports queries like "all capsules participating in relation R alongside capsule C" without binary-edge-list expansion.
- **Patent claim coverage.** Extends substrate-architecture-level coverage for true N-ary hypergraph relational structure — US 12,164,537 (DMW + Foundation primitives) + US 12,517,919 (COSMP/DMW protocol) territory. Substantive forward extension.
- **Vocabulary precision.** "Hypergraph" canonical vocabulary aligns with substrate primitive.

**Option B — Vocabulary patch.**

Rename glossary "hypergraph" canonical vocabulary to "directed edge graph" or "embedded edge list". Substrate stays as-is. Glossary update at Step 2F refresh (post-RAA-12.8-full-document).

- **Engineering effort.** Zero substrate engineering. Glossary refresh only; documentation-tier work.
- **Relational expressiveness.** Limited to binary edges. N-ary co-membership emulated via shared connected_capsule_ids entries (every member of an N-ary relation has every other member in its connected_capsule_ids list — combinatorial expansion at write tier).
- **Patent claim coverage.** Substrate-architecture-level coverage at binary-edge graph register. Less broad than Option A; still substantive territory (binary edge graphs are themselves patent-claim-worthy when composed within COSMP/DMW protocol governance).
- **Vocabulary precision.** Glossary aligns with substrate primitive at "directed edge graph" register.

#### Substrate-honest articulation of trade-off

Option A engineering effort is substantial — multi-sprint scope including new Prisma model + per-DMW-type sovereignty + retrieval traversal + audit-chain extension to relational events. Option B zero-engineering effort delivers vocabulary precision without expressiveness extension. Operator review weighs:

- Patent-implementation-evidence value of N-ary hypergraph claim territory vs binary-edge-graph claim territory (Option A broader; Option B narrower-but-substantive)
- Engineering capacity at Step 2E (Surface 1 + Surface 2 + Surface 3 each enumerate substantial Step 2E surfaces; Option A adds further substantial scope)
- Adversarial-actor protection per Decision Patent-A (precise vocabulary preempts vocabulary-drift argument; both options achieve precision)

Operator review required at full-document drafting; outline canonicalizes the decision territory; default until operator review = decision deferred to operator at Step 2D-completion or Step 2E-planning.

#### Cross-section reach

- §6.4 INT-4 cross-type-balance-at-scale (Field 2 expressiveness conditions cross-type query patterns at scale; Option A enables N-ary cross-type relational queries that Option B requires combinatorial binary-edge expansion to express)
- §4.7 lateral flow operationalization (Field 2 traversal joins Field 1 spreading activation as lateral flow consumer; both Options A and B operate as lateral consumers)

### 4.4 Field 3 — Resonance/coherence dynamics (Hofstadter Copycat 1992; Metacat 1993; Fluid Concepts 1995)

Capsules reinforce or contradict each other within retrieval cycles; coherent sets emerge from local-interaction dynamics; substrate carries `coherence_score` and detection algorithms as net-new primitives. Field 3 is the substrate-tier canonicalization of resonance/coherence dynamics from cognitive-science / fluid-analogies-research literature.

#### Verified NET-NEW substrate state

Pre-flight verification (Phase 1 extension D13 grep + Section 4 pre-flight): zero substrate primitives exist for resonance/coherence dynamics. `grep "coherence_score|coherence_dynamics|reinforcement_detect|contradiction_detect" apps/api/src --include="*.ts"` returns zero results. `MemoryCapsule` schema contains zero coherence-related fields. Substrate state is genuinely NET-NEW; Field 3 designs the primitives.

#### Cognitive-science grounding

Hofstadter & Mitchell Copycat 1992 introduced the architecture of fluid analogies — concepts as activation patterns; coherence as emergent property of analogy-making; contradiction-resolution as architectural mechanism. Hofstadter *Fluid Concepts and Creative Analogies* 1995 generalized the framework as cognitive architecture. Mitchell *Metacat* 1993 extended the framework with explicit reflection on analogy-making (the substrate-observation-of-substrate primitive that couples to Surface 3 §5.3 self-introspection). Foundation operationalizes resonance/coherence dynamics within COSMP/DMW protocol governance at substrate-architecture register.

#### Architectural decisions — schema additions

Surface 2 §4.4 canonicalizes net-new schema additions:

- **`coherence_score Float`** — capsule-pair-scoped or capsule-set-scoped coherence value. Coherence operates at two registers (decision per operator review during full-document drafting; both registers canonicalized as candidates):
  - **Capsule-pair tier.** New Prisma model `CapsulePairCoherence` keyed on `(capsule_id_a, capsule_id_b)` composite; `coherence_score` field per pair; reinforcement / contradiction signal field. Pair-tier supports localized coherence detection.
  - **Capsule-set tier.** Aggregate coherence_score over a retrieval set (e.g., the candidates entering a query cycle). Set-tier supports retrieval-set-level coherence emergence.
- **Reinforcement-detection algorithm.** Capsules with overlapping `topic_tags` + complementary content reinforce each other; coherence_score increases. Algorithm specification: tag overlap > threshold AND content semantic-similarity > threshold (where semantic-similarity is computed via vector-tier retrieval if available, or content-hash overlap if not).
- **Contradiction-detection algorithm.** Capsules with overlapping `topic_tags` + opposing content contradict each other; coherence_score decreases or surfaces explicit contradiction signal. Algorithm specification: tag overlap > threshold AND content semantic-distance > threshold.

#### Resonance/coherence as retrieval-time-conditioning

Coherence_score conditions retrieval scoring per the lateral class architecture (Section 2 §2.3 Zone L3). High-coherence capsules cluster in retrieval (capsules that reinforce each other co-retrieve more often); contradictions surface inline rather than silently coexisting in returned context (substrate makes contradiction visible to ASI-consumer rather than presenting contradictory context as if coherent).

The retrieval-time-conditioning is intra-query-cycle (lateral flow per Section 2 §2.2); contradictions discovered during retrieval may trigger retrieval-set adjustment within the bounded compute budget per Surface 1 §3.6 latency budget. Contradictions discovered post-retrieval (during Surface 3 §5.5 informativeness weighting) feed back to Loop 1 relevance updates per RAA 12.7 §2.5 Zone B1 — bilateral feedback closes the loop.

#### Per-DMW-type sovereignty per Correction 4

Cross-wallet coherence detection requires per-DMW-type scheduling constraint per Surface 1 §3.8. Adversarial-actor protection: contradiction detection must not surface contradictions across sovereignty boundaries that would expose private capsule content from other wallets. Substrate enforces:

- **Personal DMW intra-wallet.** Coherence detection operates within single Personal wallet with full owner-sovereignty per RULE 0; contradictions surface to owner.
- **Enterprise DMW.** Coherence detection operates per Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` — Enterprise carries data; coherence operates over Permission-scoped access; cross-Enterprise coherence respects Permission-tier sovereignty boundaries (forget-on-detach via Zone U4).
- **AI_AGENT DMW.** Coherence detection bounded by owning-entity sovereignty per Correction B owning-entity-derived discipline canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` (any entity can own AI_AGENT); AI_AGENT-owned wallet coherence operates within owning-entity's permission grants; recursive resolution preserves RULE 0 invariance per Correction C forward-folded (human-permission-gating substrate-tier invariant).
- **Device DMW.** Coherence detection bounded by device-owner sovereignty.
- **Cross-wallet coherence.** Operates with per-DMW-type scheduling constraint per Surface 1 §3.8; coherence signals cross-wallet only where sovereignty permits.

#### Coupling to Surface 1 §3.5 materialized aggregates

Per-(entity, capsule_type) `avg_relevance_score` from Surface 1 §3.5 materialized aggregates informs per-type baseline; coherence operates relative to baseline. A capsule's coherence with another capsule is computed as deviation-from-baseline rather than absolute score; baseline normalization respects cross-type balance per D-2C-D6 territory.

### 4.5 Field 4 — Self-organizing emergent retrieval (complexity science; local-interaction-driven selection)

Retrieval set emerges from local capsule-interaction dynamics rather than top-down deterministic score-rank-select. Field 4 is the meta-zone that coordinates Fields 1+3+5 jointly producing a retrieval set within bounded compute budget. Field 4 is genuinely NET-NEW at substrate per Phase 1 extension D13 verification.

#### Verified NET-NEW substrate state

Pre-flight verification: zero current emergent / self-organizing primitives. `grep "emergent.*retriev|self.*organiz|local.*interaction" apps/api/src --include="*.ts"` returns zero results. Current COE retrieval at `apps/api/src/services/coe/coe.service.ts:230-260` is fully top-down deterministic — `combinedScore` per ADR-0022 + score-rank-sort + budget-cap select. Field 4 designs the architectural transition from top-down to emergent.

#### Architectural decisions — local-interaction-driven selection

Surface 2 §4.5 canonicalizes:

- **Local interactions.** Spreading activation (Field 1) + resonance/coherence (Field 3) + context-conditioning (Field 5) operating concurrently within bounded compute budget. Fields 1+3+5 each contribute conditioning signals to the candidate set; the conditioning is co-temporal (lateral per Section 2 §2.2).
- **Final retrieval set is the equilibrium state.** No top-down score-rank-select. The retrieval set emerges as the candidates that satisfy joint conditioning from Fields 1+3+5 within the convergence parameters.
- **Convergence parameters bound emergence.** Three parameters jointly bound convergence:
  - **Iteration cap.** Max iterations before equilibrium accepted; bounded by Surface 1 §3.6 latency budget (typical: 5-10 iterations within ≤5ms scoring budget; ceiling: 15 iterations within ≤10ms ceiling).
  - **Stability threshold.** Acceptable change-per-iteration before convergence declared; typical: 5% change in score-set across iteration; ceiling: 10%. Below threshold, retrieval set stabilized.
  - **Activation floor.** Sub-floor activations excluded from emergence; respects RELEVANCE_FORGET_FLOOR per `coe.service.ts:44` invariant.

#### Field 4 as meta-zone for Fields 1+3+5

Field 4 composition is intra-query-cycle by definition (per Section 2 §2.2 lateral class); equilibrium emerges within bounded compute budget rather than across cycles. The composition is non-trivial:

- **Field 1 propagates activation** through `connected_capsule_ids` (per §4.2)
- **Field 3 detects coherence/contradiction** between activated capsules (per §4.4)
- **Field 5 conditions per-capsule salience** by session state (per §4.6)
- **Field 4 iterates until convergence** — Fields 1+3+5 conditioning compose; iteration adjusts candidate set; equilibrium emerges when conditioning produces stable retrieval set

Field 4 is the architectural primitive that makes Surface 2 a coherent design rather than five independent fields. Without Field 4, the five fields would compose ad-hoc per query cycle without convergence guarantees; Field 4 canonicalizes the equilibrium discipline.

#### Cross-section reach

- §3.6 latency budget bounds iteration cap (typical 5-10 iterations within ≤5ms; ceiling 15 within ≤10ms)
- §3.7 query complexity bound enforces emergence termination (max iterations bounded; emergence cannot exceed bound)
- §4.2 Field 1 spreading activation operates within Field 4 emergence
- §4.4 Field 3 resonance/coherence detection operates within Field 4 emergence
- §4.6 Field 5 context-dependent salience operates within Field 4 emergence

### 4.6 Field 5 — Context-dependent salience (Bartlett 1932; Schank scripts 1977; situated cognition)

Same capsule scores differently across session states. Conversation history conditions salience; prior retrievals in session condition salience; recent outcome patterns condition salience. Field 5 is the canonical lateral zone L5 per Section 2 §2.3.

#### Verified NET-NEW substrate state

Pre-flight verification: zero current context-dependent salience primitives. `grep "context.*depend|salience|situated.*cognition|context.*aware" apps/api/src --include="*.ts"` returns zero results. `combinedScore` formula at `apps/api/src/services/coe/keywords.ts:87-93` per ADR-0022 is session-state-independent — same capsules score identically regardless of conversation history, prior retrievals in session, recent outcome patterns. Field 5 designs the session-state-conditioned scoring extension.

#### Cognitive-science grounding

Bartlett 1932 *Remembering* introduced schema-conditioned reconstruction — memory retrieval reconstructs against schema templates rather than reading literal traces. Same "memory" reconstructs differently across schema contexts. Schank scripts 1977 formalized the schema framework as substrate-tier mechanism; Rumelhart schemata (Rumelhart 1980) extended the framework. Situated cognition literature (Suchman 1987; Hutchins 1995) extended the framework to environment-conditioned cognition. Foundation operationalizes context-dependent salience within COSMP/DMW protocol governance.

#### Architectural decisions — session-state input pipeline

Surface 2 §4.6 canonicalizes:

- **Session-state input to scoring function.** `assembleContext(sessionToken, requestText, tokenBudget, context)` extends with session-state argument carrying conversation history + prior retrievals + recent outcomes. The session-state shape resolves during full-document drafting per operator review.
- **Conversation-history capsule-aware scoring.** Capsules referenced earlier in session weight higher within same session (recency-of-reference signal beyond `recencyScore` per ADR-0022 — distinct from absolute recency; this is session-recency).
- **Outcome-pattern-aware scoring.** Capsules that resolved similar prior session ambiguities weight higher. The outcome-pattern signal is computed from Loop 1 substrate-active feedback at `feedback.service.ts` — session-bounded outcome history conditions retrieval.
- **Salience signal output for INT-2 consumption.** Field 5 produces an explicit salience signal (per-capsule, per-query) consumed by Surface 3 §5.5 active-learning informativeness. The signal IS the substrate primitive that feeds informativeness weighting per INT-2.

#### Coupling with Surface 3 §5.5 active-learning informativeness per INT-2

Per Phase 1 extension INT-2: D8 informativeness signal IS D11 self-introspection primitive; substrate that knows which retrievals were informative is substrate that observes its own behavior. Field 5 salience signal IS the substrate signal that feeds informativeness weighting at Surface 3 §5.5 — capsule that resolved an ambiguity in this session conditions higher informativeness for similar future situations. Designing Field 5 designs the input to §5.5 informativeness; the two architectures share substrate primitive.

#### Per-DMW-type sovereignty

Salience signal is scoped per-wallet — Personal session-state conditions Personal wallet salience; cross-wallet salience composition operates with per-DMW-type scheduling per Surface 1 §3.8. Adversarial-actor protection: salience signal does not leak session content across sovereignty boundaries; salience operates at signal-tier (per-capsule weight modifier), not at content-tier (no payload information flows through salience signal across wallets).

### 4.7 Lateral flow operationalization (closes D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift)

Section 4.7 closes the D-2C-D2 drift by canonicalizing the consumer surface for the dormant `connected_capsule_ids` substrate primitive. Field 1 spreading activation IS the canonical lateral flow consumer per L1 lateral zone + INT-5.

#### Drift closure mechanism

Drift D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER surfaced at Phase 1 investigation (D2 finding): `connected_capsule_ids` substrate-active in writes (verified at pre-flight: 5 write sites in `apps/api/src/services/cosmp/write.service.ts`); consumer in retrieval-tier code: zero. Closing the drift requires canonicalizing a consumer surface; §4.7 designates Field 1 spreading activation as the canonical consumer.

#### Lateral flow architecture

Surface 2 §4.7 canonicalizes:

- **Seed capsules from initial pre-filter + scoring.** Per Surface 1 §3.3 index-driven candidate pre-filter + ADR-0022 `combined_score` ranking; top-K candidates emerge as activation seeds.
- **Activation propagation through `connected_capsule_ids` edges.** Per Field 1 §4.2 architectural decisions: per-edge decay; max hops bounded by §3.7 query complexity bound; activation accumulates per-candidate.
- **Activated capsules condition `combined_score`.** Activation signal contributes weighted addend to score (per Field 1 §4.2).
- **Lateral flow respects per-DMW-type sovereignty per §3.8.** Cross-wallet activation propagation respects scheduling constraint — activation does not propagate across sovereignty boundaries that would expose other-wallet capsule content; per-wallet sub-graphs propagate independently with cross-wallet aggregation at Surface 1 §3.8 mechanics.

#### Substrate primitive transition

The `connected_capsule_ids` substrate primitive transitions from dormant (write-only) to substrate-active consumer surface. Substrate-honesty discipline operating per RULE 13: drift surfaced inline at investigation; closure mechanism canonical at §4.7; engineering implementation enumerated at §4.9 Step 2E.

#### Cross-section reach

- §4.2 Field 1 architectural decisions (Field 1 mechanics canonicalize the consumer surface §4.7 designates)
- §6.5 INT-5 Field 1 + D2 dormant primitive joint canonicalization
- §3.8 per-DMW-type sovereignty as scheduling constraint applies to lateral flow

### 4.8 Hive aggregation as DMW-to-DMW coordination per Correction 2 + per-DMW-type sovereignty per Correction 4 (closes D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY drift)

Section 4.8 closes the D-2D-D9 drift by canonicalizing the consumer-side lateral flow for Hive aggregate consumption. Per Correction 2: Hive IS the substrate mechanism for wallets to coordinate via shared intelligence — not aggregation artifact. Per Correction 4: Hive coordination respects per-DMW-type sovereignty.

#### Verified substrate state

Pre-flight verification (substrate-evidence gathering before draft):

- **Hive Prisma model** (`packages/database/prisma/schema.prisma`): `hive_id` / `hive_name` / `created_by` / `hive_type` / `governance_terms` / `aggregate_capsule_id String?` / `member_count` / `status` / `org_entity_id` / `is_default_enterprise`. Aggregate is NOT stored in a separate "HiveAggregate" model — aggregate is a `DOMAIN_KNOWLEDGE` Capsule referenced by `Hive.aggregate_capsule_id` foreign key (substrate-honest acknowledgment per RULE 13 — the model is `Hive`; the aggregate lives in the Capsule registry).
- **HiveMembership Prisma model**: `hive_id` / `entity_id` / `capsule_types_contributed: String[]` / `contribution_scope: AccessScope` / `capsule_types_accessible: String[]` / `access_scope: AccessScope` / `joined_at` / `expires_at` / `status`. The HiveMembership model carries richer per-DMW-type sovereignty primitives than baseline assumption: `capsule_types_contributed` + `contribution_scope` + `capsule_types_accessible` + `access_scope` are existing substrate-tier sovereignty enforcement primitives.
- **`buildHiveAggregate`** at `apps/api/src/services/hive/hive.service.ts:651` — substrate-active production. Loop 4 cron rebuild every 30 min via `feedback.service.ts:424` — substrate-active scheduling. `LOOP_4_MIN_MEMBERS = 3` at `feedback.service.ts:106` — verified active 3-member floor invariant.
- **`HIVE_AGGREGATE_TAG_FLOOR = 3`** at `hive.service.ts:154` — verified active substrate constant. `hive.service.ts:707` filters tags by floor: `.filter(([, count]) => count >= HIVE_AGGREGATE_TAG_FLOOR)`. Privacy-preserving by construction per memory entry #16.
- **`getHiveIntelligence`** at `hive.service.ts:539` — explicit dedicated read endpoint; substrate-active.
- **COE Hive aggregate consumer** (verify D-2D-D9 zero): `grep "hiveAggregate|HiveAggregate|hive_aggregate|getHiveIntelligence" apps/api/src/services/coe/coe.service.ts` returns zero matches — D-2D-D9 asymmetry confirmed at substrate-state.

#### Per Correction 2 reframing

Per Correction 2 (folded at outline commit `10ef10f`): Hive is not aggregation artifact; Hive IS the substrate mechanism for wallets (= entities, including AI_AGENT entities) to coordinate via shared intelligence. The reframing operationalizes:

- **Wallets ARE entities; entities ARE represented by wallets; Hives ARE coordination across entity-wallets.** The vocabulary precision matters: Hive is not data structure (aggregation) but coordination primitive (DMW-to-DMW). The substrate mechanism is wallet-to-wallet via Hive membership.
- **COE provides each participating wallet/agent its memory capsule information through Hive participation.** Hive aggregate is consumed at retrieval-time as explicit context layer — COE assembleContext incorporates Hive aggregate alongside personal capsules, not as score-rank lottery candidate.
- **Feedback loop is data flowing back from wallets maintaining relevance + informativeness + Hive coherence.** Bilateral cross-entity flow per RAA 12.7 §2.5 Zone B2 preserves; Loop 1 substrate-active feedback per Zone B1 within each contributing wallet preserves; the §4.8 reframing canonicalizes the consumer-side lateral flow.

#### Per Correction 4 sovereignty constraint

Per Correction 4 (folded at outline commit `10ef10f`): Hive coordination respects per-DMW-type sovereignty. Substrate-tier coordination primitives are universal across entity types; governance rules are per-DMW-type because underlying sovereignty differs across DMW types.

- **Personal DMW.** Full owner-sovereignty per RULE 0; owner-human grants Hive participation; full-payload contribution permitted; full-payload consumption permitted via aggregate.
- **Enterprise DMW.** Per Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`: Enterprise carries company data with forget-on-detach at Permission tier per Zone U4. Hive aggregation in Enterprise context operates per Permission-scoped access; aggregate body respects Permission-tier sovereignty (`HIVE_AGGREGATE_TAG_FLOOR = 3` privacy boundary preserved); aggregate consumption respects forget-on-detach semantics at Permission revocation tier.
- **AI_AGENT DMW.** Participation bounded by owning-entity sovereignty per Correction B owning-entity-derived discipline canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`. AI_AGENT-owned wallet contributes to Hive within owning-entity's permission grants; recursive resolution preserves RULE 0 invariance per Correction C forward-folded (human-permission-gating substrate-tier invariant); consumption operates within bounded scope.
- **Device DMW.** Participation bounded by device-owner sovereignty.

The HiveMembership substrate primitives (`capsule_types_contributed` / `contribution_scope` / `capsule_types_accessible` / `access_scope`) are the existing substrate-tier sovereignty enforcement primitives — Surface 2 §4.8 reframes them per Correction 4 as per-DMW-type sovereignty operating at HiveMembership tier. The substrate already carries the discipline; §4.8 canonicalizes the operational semantics.

#### Closes D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY

Drift D-2D-D9 surfaced at Phase 1 extension: production substrate-active (verified `buildHiveAggregate` + Loop 4 cron + 3-member floor + audit event); consumption asymmetric (verified zero COE Hive consumer; explicit endpoint `getHiveIntelligence` reads aggregate; COE assembleContext does NOT consume aggregate via privileged path).

§4.8 canonicalizes:

- **Production-side bilateral cross-entity coordination** (Zone B2 per RAA 12.7 §2.5; preserved from RAA 12.7). Hive aggregate built via Loop 4 cron over HIVE_AGGREGATE_TAG_FLOOR-filtered tags from contributing members.
- **Consumer-side lateral flow** within receiving entity's wallet (Zone L6 per Section 2 §2.3; new lateral consumer canonicalized at §4.8). COE assembleContext consumes Hive aggregate via privileged path — aggregate enters context assembly as explicit layer alongside personal capsules.
- **Per-DMW-type sovereignty as scheduling constraint per Correction 4.** Consumption operates at retrieval-time, not at result-rendering time per Surface 1 §3.8 discipline. Sovereignty enforcement at consumer side per Corrections A+B canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`: Personal consumes full aggregate; Enterprise consumes Permission-scoped data with forget-on-detach at Permission tier (Correction A); AI_AGENT consumes within owning-entity-derived bounds (Correction B); Device consumes within device-owner bounds. Correction D forward-folded (permission-trickle-through-non-human-DMW): when AI_AGENT consumption traverses owning-entity chain, permission ultimately trickles through to sovereign-human decision per RULE 0 + Correction C.

#### Privacy boundary preserved by construction

Privacy boundary per memory entry #16: aggregate body contains zero individual entity IDs; 3-member floor (`HIVE_AGGREGATE_TAG_FLOOR = 3`) ensures no single member's tags dominate. The privacy-preservation is by-construction substrate property — aggregate cannot accidentally leak individual entity content because aggregation operates at tag-frequency tier above 3-member threshold. Surface 2 §4.8 preserves the privacy boundary in consumer-side operationalization.

Adversarial-actor protection per Decision Patent-A + RULE 19: aggregate consumption respects sovereignty constraints at retrieval-time, not at result-rendering time (per Surface 1 §3.8 discipline). Consumer-side enforcement prevents aggregation-then-filter sovereignty-erasure pattern; aggregation respects sovereignty at production tier (HIVE_AGGREGATE_TAG_FLOOR floor + zero-individual-IDs invariant); consumption respects sovereignty at retrieval tier (per-DMW-type scheduling constraint).

### 4.9 Step 2E engineering surface enumerated

Section 4 canonicalizes Surface 2 architectural decisions; Step 2E (per RAA 12.8 forward queue + §1.4) implements the canonicalization. The §4.9 enumeration surfaces the substrate-honest engineering surface — specific implementation work needed to close the architectural canonicalization with substrate-active behavior.

Step 2E engineering surface for Surface 2:

- **D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER closure** — implement Field 1 spreading activation per §4.2 + §4.7. Engineering tier: extend COE assembleContext STEP 3 candidate set with spreading-activation traversal from top-K seeds through `connected_capsule_ids` with per-edge decay; bounded by §3.7 max-hops complexity bound. Closes the dormant primitive surfaced at Phase 1 D2.
- **D-2D-D13-HYPERGRAPH-NAMING-PRECISION closure** — per operator review at §4.3 (Option A: CapsuleRelation Prisma model + schema migration + write-tier changes + retrieval-tier hypergraph traversal; Option B: glossary refresh + vocabulary patch). Decision deferred to operator at Step 2D-completion or Step 2E-planning.
- **Field 3 resonance/coherence dynamics** — schema additions (`coherence_score Float` field; `CapsulePairCoherence` Prisma model OR set-tier aggregate per operator review during full-document drafting); reinforcement-detection algorithm implementation; contradiction-detection algorithm implementation. Schema migration via Prisma `db push`.
- **Field 4 emergent retrieval** — convergence parameter implementation (iteration cap + stability threshold + activation floor); iteration cap enforcement bounded by Surface 1 §3.6 latency budget; emergence equilibrium algorithm composing Fields 1+3+5.
- **Field 5 context-dependent salience** — session-state input pipeline (extend `assembleContext` interface with session-state argument); conversation-history capsule-aware scoring; outcome-pattern-aware scoring (consume Loop 1 substrate-active feedback at `feedback.service.ts`); salience signal output for INT-2 consumption at Surface 3 §5.5.
- **D-2D-D9-AGGREGATE-CONSUMER-ASYMMETRY closure** — implement COE-aggregate consumption path per §4.8 with per-DMW-type sovereignty as scheduling constraint per Correction 4. Engineering tier: extend COE assembleContext to consume `Hive.aggregate_capsule_id` reference + `getHiveIntelligence` semantic; aggregate enters context assembly as explicit layer; sovereignty enforcement at consumer side per HiveMembership `contribution_scope` / `access_scope` primitives.

#### Engineering effort estimate

Surface 2 Step 2E engineering surface is substantial — multi-sprint scope across §4.2-§4.8. Field 3 + Field 4 + Field 5 are NET-NEW substrate primitives requiring schema additions + algorithm implementation; Field 1 + §4.7 + §4.8 are dormant-primitive-activation work building on existing substrate. ADR-0017 production-discipline applies to each implementation surface (substrate-investigation discipline; substrate-honesty drift surfacing; coordinated test coverage).

Per Decision 4 (all blocks required due to interconnection), Surface 2 engineering work proceeds after RAA 12.8 full-document drafting completes (Sections 5-10); the engineering surface is sequenced after architectural canonicalization. Section 4.9 enumeration is the canonical Step 2E reference for Surface 2 work scope.

---

## Section 5 — Surface 3: Agentic Coherence

Section 5 canonicalizes Surface 3 of RAA 12.8 substrate-dynamics architecture. Surface 3 designs how substrate stays coherent under autonomous agentic execution AND human-in-the-loop validation as first-class architectural property. Section 5 closes four Phase 1 / Phase 1 extension drifts inline (D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL via §5.2; D-2D-D11-AGENT-TO-AGENT-INTENTIONAL-VS-GAP via §5.4; D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY via §5.5; D-2C-D5-ACCESS-BASED-STUB via §5.7) and surfaces two OPERATOR REVIEW REQUIRED markers (§5.6 DurationType-vs-DecayType collision per D-2C-D5-DURATION-COLLISION; §5.8 NEW Per-DMW-Type Sovereignty Rules per Correction 4). Section 5 §5.9 enumerates the Step 2E engineering surface that closes the architectural canonicalization with implementation work.

### 5.1 Dual-posture canonicalization per Correction 4

Per Correction 4 (folded at outline commit `10ef10f`) + Correction C forward-folded at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`: dual-posture is not "humans validate AI outputs" simple model. Dual-posture is "humans-in-the-loop is the underlying sovereignty principle; AI_AGENT autonomy operates under owning-entity sovereignty boundaries with human-permission-gating substrate-tier invariant (Correction C)." Per Correction B canonical at §5.8 amendment: AI_AGENT owning-entity-derived mapping — recursive resolution terminates at sovereign-human entity or AI_AGENT-tier baseline (Standalone case); RULE 0 invariance never bypassed by intermediate non-human DMW layers. The sovereignty principle is foundational architectural property, not opt-in feature.

#### Substrate primitives supporting dual-posture — verified active

Pre-flight verification (substrate-evidence gathering before draft) confirmed substrate-active dual-posture primitives:

- **AI sovereignty cap at NEGOTIATE.** `apps/api/src/services/cosmp/negotiate.service.ts:367-374` enforces: `if (requester.entity_type === "AI_AGENT" && grantedScope === "FULL" && !permissionAllowsAiFull(permission)) { grantedScope = "SUMMARY"; }`. AI_AGENT cannot keep FULL scope unless an explicit human override flag is set on Permission. Substrate-honest path correction: file is at `services/cosmp/negotiate.service.ts` (not at `services/negotiate.service.ts`).
- **Restricted entity types.** `negotiate.service.ts:115` discriminates AI_AGENT + DEVICE as restricted entity types via `entityType === "AI_AGENT" || entityType === "DEVICE"` predicate.
- **Explicit human override flag.** `negotiate.service.ts:129` — `permissionAllowsAiFull(permission)` returns `true` only when `conditions.allow_ai_full === true`. The override is per-Permission-row and explicit; default behavior caps AI scope.
- **AI sovereignty audit signal.** `negotiate.service.ts:410` audit details include `ai_capped: requester.entity_type === "AI_AGENT" && requestedScope === "FULL" && grantedScope !== "FULL"`. Substrate makes the cap event observable in audit chain per Zone U1 + Zone U4.
- **EXECUTIVE_OVERRIDE autonomy level in TwinConfig.** `apps/api/src/services/governance/twin.service.ts:233` assigns `autonomyLevel = isAdmin ? "EXECUTIVE_OVERRIDE" : "APPROVAL_REQUIRED"`. TwinConfig substrate-active per `dandelion.service.ts:398` admin-twin creation flow.
- **AI_AGENT entity-type discrimination in EntityType enum.** Verified verbatim: `enum EntityType { PERSON COMPANY AI_AGENT DEVICE APPLICATION GOVERNMENT }`.

#### Cross-section reach

Surface 3 §5.1 dual-posture couples to:

- **§3.8 Surface 1** — per-DMW-type sovereignty as scheduling constraint per Correction 4 enforces dual-posture at parallel-orchestration tier
- **§5.4 agent-to-agent coordination per Corrections 1+3+4** — extends dual-posture to multi-agent scenarios; substrate-mediated allowed; direct cross-AI grant forbidden per RULE 0
- **§5.8 per-DMW-type sovereignty rules** — operationalizes dual-posture as per-DMW-type governance constraint
- **RAA 12.7 §2.5 Zones U3 + U4** — identity verification + permission grant lineage are the trust roots dual-posture depends on

### 5.2 Human-in-the-loop primitives expansion (closes D-2D-D10 drift)

Section 5.2 closes the D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL drift by canonicalizing the EscalationRequest substrate territory + validation gate flags + approval workflow primitives + correction propagation chain.

#### Verified substrate state — D-2D-D10 confirmed

Pre-flight verification confirmed the drift state:

- **`EscalationItem` interface present** at `apps/api/src/services/otzar/priming.ts:36`: `interface EscalationItem { description: string; severity: string; }`
- **`getEscalationsPending` stub** at `priming.ts:131-134` returns empty array `[]`
- **TODO Section 14 comment** at `priming.ts:128`: `// TODO(Section 14): Replace with prisma.escalationRequest.findMany`
- **EscalationRequest Prisma model NOT YET BUILT** — `grep "model.*[Ee]scalation" packages/database/prisma/schema.prisma` returns zero matches; substrate carries the consumer-side shape but not the storage-side model

Drift D-2D-D10 confirmed at substrate-state. The priming context shape is ahead of the substrate model; canonical resolution canonicalizes the EscalationRequest model.

#### Surface 3 §5.2 expansion territory

- **EscalationRequest Prisma model.** Schema addition with fields: `escalation_id` (UUID PK); `source_entity_id` + `target_entity_id` (entity references); `capsule_id` (optional capsule context reference); `escalation_type` (enum value indicating reason for escalation); `severity` (enum value); `status` (PENDING / APPROVED / REJECTED / EXPIRED); `created_at` / `resolved_at` (timestamps); `resolution_metadata` (JSON for resolver context); `resolved_by_entity_id` (resolver entity).
- **Status workflow.** PENDING → APPROVED/REJECTED/EXPIRED transitions; status transition writes audit event per Zone U1; transition restricted to authorized resolver per per-DMW-type sovereignty rules at §5.8.
- **Validation gate flags.** `requires_validation` flag on Capsule or Permission; gate-trigger conditions specified per per-DMW-type policy; gate-resolution audit lineage per Zone U4.
- **Approval workflow primitives.** Multi-step approval chains (chained EscalationRequest rows); per-step approver discrimination via EntityMembership traversal per §3.8; timeout policies via `expires_at` field.
- **Correction propagation chain.** When human corrects AI output, correction flows back to: (a) feedback service Loop 1 informativeness signal per §5.5 (correction = max informativeness per INT-3); (b) capsule relevance_score update; (c) audit chain correction event per Zone U1; (d) Hive coordination influences aggregate per §4.8 if cross-Hive correction.

#### Cross-section reach

- **§5.5 active-learning informativeness** — correction propagation chain per INT-3 is the high-informativeness signal feeding Loop 1 refinement
- **§4.8 Hive coordination** — corrections within Hive context propagate to aggregate per Correction 2 + Correction 4 sovereignty
- **RAA 12.7 §2.5 Zone U1** — escalation status transitions write audit events forward-only per audit chain integrity

### 5.3 Self-introspection NET-NEW (SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021)

Substrate currently has zero self-introspection primitives per Phase 1 extension D11 + Section 5 pre-flight verification. Surface 3 §5.3 adds substrate primitive for substrate writing capsules about substrate state via the ADR-0021 Capsule Type Extension Protocol.

#### Verified NET-NEW substrate state

Pre-flight verification confirmed:

- **CapsuleType enum** verified verbatim at `packages/database/prisma/schema.prisma`: 20 values (9 original — FOUNDATIONAL / PREFERENCE / RELATIONSHIP / DOMAIN_KNOWLEDGE / BEHAVIORAL_PATTERN / IDENTITY / DEVICE_DATA / SESSION_LEARNING / COMPLIANCE_RECORD; 11 Section 11A — CONVERSATION_LEARNING / TASK_LEARNING / WORK_PATTERN / COMMUNICATION_PREF / DECISION_STYLE / COMMITMENT / BLOCKER / RISK / HANDOFF / DECISION / CORRECTION). SUBSTRATE_OBSERVATION confirmed absent.
- **System-principal infrastructure substrate-active.** `SYSTEM_PRINCIPALS.SCHEDULER` at `apps/api/src/services/feedback/scheduler.ts:56` and `SYSTEM_PRINCIPALS.FEEDBACK_LOOP` at `apps/api/src/services/feedback/feedback.service.ts:633`. Substrate already has the system-principal pattern for substrate-tier audit attribution; SUBSTRATE_OBSERVATION composes with existing infrastructure.

#### ADR-0021 extension protocol applies cleanly

ADR-0021 (Capsule Type Extension Protocol) governs extensions to the CapsuleType enum: existing 20 values immutability invariant preserved; new value added via single canonical addition; PRICING_TABLE entry update per ADR-0021 Decision Step 3 deliberate-blocker worked example. SUBSTRATE_OBSERVATION as net-new CapsuleType extension exercises the protocol cleanly.

#### Surface 3 §5.3 canonicalizes

- **SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021 protocol.** Schema migration via Prisma `db push`; PRICING_TABLE entry per ADR-0021 Decision Step 3 (substantive deliberate-blocker worked example for the protocol).
- **System-principal-owned wallet.** Substrate-tier observation events written as Capsules into a wallet owned by a SYSTEM_PRINCIPAL (e.g., new `SYSTEM_PRINCIPALS.SUBSTRATE_OBSERVER` constant added alongside existing SCHEDULER + FEEDBACK_LOOP).
- **Observable substrate state.** Per-(entity, capsule_type) relevance distribution shifts; per-wallet retrieval pattern changes; informativeness signal trends; spreading-activation propagation patterns per Field 1; coherence/contradiction signals per Field 3; salience-conditioned scoring patterns per Field 5.

#### INT-2 coupling — self-introspection IS informativeness primitive

Per Phase 1 extension INT-2: D8 informativeness signal IS D11 self-introspection primitive. Substrate that knows which retrievals were informative is substrate that observes its own behavior. SUBSTRATE_OBSERVATION CapsuleType per §5.3 IS the substrate primitive that feeds active-learning informativeness at §5.5 — designing one designs the other; the two architectures share substrate primitive.

#### Self-introspection coupling to Surface 2 Field 5 context-dependent salience

Substrate observations condition salience for substrate-administrator queries — when a substrate admin queries about substrate state, retrieval surfaces SUBSTRATE_OBSERVATION Capsules with high salience. Substrate becomes its own consumer of context per Field 5 §4.6 conditioning.

### 5.4 Agent-to-agent coordination per Corrections 1+3+4 (closes D-2D-D11 drift)

Section 5.4 closes the D-2D-D11-AGENT-TO-AGENT-INTENTIONAL-VS-GAP drift by canonicalizing the substrate-mediated-vs-direct-grant distinction per Corrections 1+3+4 jointly.

#### Per Correction 1 broader scope

AI_AGENT entities are first-class peer entities with their own DMWs per memory entry #21 + EntityType enum (verified at substrate). Two AI_AGENT entities can coordinate via substrate primitives PERSON entities use — there is no entity-type-tier restriction on coordination primitives.

#### Per Correction 3 entity-type uniformity

Whether participating entities are PERSON, AI_AGENT, COMPANY, DEVICE, APPLICATION, or GOVERNMENT, they coordinate via the same substrate primitives (COE retrieval per §3.1-§3.8; Hive participation per §4.8; bilateral feedback Loop 1 per RAA 12.7 §2.5 Zone B1). Universal coordination pattern at primitive level — the substrate-tier mechanism does not change with entity type.

#### Per Correction 4 sovereignty constraint

AI_AGENT first-class for coordination AND constrained by owning-entity sovereignty per Correction B owning-entity-derived discipline canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` (any entity can own AI_AGENT; recursive resolution preserves RULE 0 invariance at substrate-tier per Correction C forward-folded human-permission-gating substrate-tier invariant). The architectural distinction is exact:

- **Forbidden per RULE 0:** AI_AGENT_A directly grants Permission to AI_AGENT_B. Cross-AI direct permission grant breaks RULE 0 sovereign-human invariance. AI cannot be the sovereign granting access.
- **Allowed per substrate primitives:** AI_AGENT_A and AI_AGENT_B both have wallets; COE provides each its capsule context per §3.8 parallel orchestration; Hive aggregates form across AI_AGENT entities per §4.8 (HiveMembership substrate-active for any EntityType); bilateral feedback Loop 1 flows between agent wallets per Zone B1. Substrate-mediated coordination is architecturally distinct from direct permission grant.

#### Drift closure mechanism

D-2D-D11 surfaced at Phase 1 extension as "intentional restriction vs substrate gap" — substrate appeared to forbid agent-to-agent coordination, but Phase 1 extension investigation surfaced that the restriction was direct-permission-grant (per RULE 0) not substrate-mediated-coordination. The distinction:

- **Direct grant path forbidden** — AI_AGENT_A creates Permission row where `grantor_entity_id = AI_AGENT_A` and `grantee_entity_id = AI_AGENT_B`. Forbidden per RULE 0 + Permission creation logic.
- **Substrate-mediated path allowed** — AI_AGENT_A writes Capsule into its wallet; owning-entity (PERSON / COMPANY / APPLICATION / GOVERNMENT / DEVICE / AI_AGENT-recursive per Correction B canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`) grants AI_AGENT_B's owning-entity access via Permission; recursive resolution of owning-entity chain ultimately terminates at sovereign-human entity per Correction C forward-folded human-permission-gating substrate-tier invariant; AI_AGENT_B retrieves AI_AGENT_A's Capsule via COE under owning-entity's permission. Substrate carries primitives for the allowed pattern; engineering work formalizes the coordination interface per §5.9 Step 2E.

#### Cross-section reach

- **§4.8 Hive coordination per Correction 2** — agents coordinate via Hive participation; substrate-mediated mechanism canonical
- **§3.8 parallel orchestration per Correction 4** — cross-wallet COE supports AI_AGENT-to-AI_AGENT context-sharing under owning-entity sovereignty per Correction B canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`
- **§5.1 dual-posture** — agent-to-agent coordination operates within human-sovereign boundaries per §5.1 framing

### 5.5 Active-learning informativeness as refinement (closes D-2D-D8 drift; INT-2 + INT-3 + INT-6 territory)

Section 5.5 closes the D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY drift by framing active-learning informativeness as refinement of existing Loop 1 substrate (not net-new dimension).

#### Verified Loop 1 substrate state

Pre-flight verification (substrate-evidence gathering before draft) confirmed Loop 1 substrate-active at `apps/api/src/services/feedback/feedback.service.ts`:

- **Constants** at lines 85-88: `RELEVANCE_USED_BUMP = 0.05`; `RELEVANCE_UNUSED_DECAY = 0.02`; `RELEVANCE_MIN = 0.0`; `RELEVANCE_MAX = 1.0`
- **Update logic** at lines 219-228: Used capsules `relevance_score += RELEVANCE_USED_BUMP` (capped at RELEVANCE_MAX); unused capsules `relevance_score -= RELEVANCE_UNUSED_DECAY` (floored at RELEVANCE_MIN)
- **Loop 1 trigger** at line 35: 1440 minutes (event-driven; stale if no recordOutcome in 24h)
- **`recordOutcome`** is the substrate-active feedback signal; Loop 1 processes outcomes into relevance updates

#### Refinement framing per RAA 12.7 §4.1 + §8 + §10

RAA 12.7 §4.1 + §8 + §10 framed active-learning informativeness as forward enhancement of Loop 1 — research patterns include RELEAP (2025), ORIS (2024), multi-armed bandits, Thompson sampling. Surface 3 §5.5 frames informativeness as refinement of the canonicalized substrate primitive — not introduction of net-new primitive.

The distinction matters per D-2D-D8 drift framing: existing `relevance_score` is partial informativeness signal degraded by uniform updates (every used Capsule gets +0.05 regardless of contribution quality; every unused Capsule gets -0.02 regardless of contextual relevance). Informativeness weighting refines the existing substrate signal:

- **Differential bump.** Capsules contributing high-informativeness outcomes (e.g., correction-resolving Capsules per INT-3) receive larger bump than baseline-relevance Capsules
- **Differential decay.** Unused Capsules in contexts where their unused-ness is informative (e.g., explicitly-rejected context layers) receive larger decay than baseline-irrelevant Capsules
- **Coefficient parameterization.** Informativeness coefficients become tamper-anchored architectural property per INT-6

#### INT-2 coupling — Field 5 salience IS informativeness input

Per Phase 1 extension INT-2: Field 5 salience signal at Surface 2 §4.6 IS the substrate signal feeding informativeness weighting. Capsule that resolved an ambiguity in this session conditions higher informativeness for similar future situations — salience signal output at §4.6 is informativeness input at §5.5.

#### INT-3 coupling — correction = max informativeness

Per Phase 1 extension INT-3: human correction propagation chain per §5.2 IS the high-informativeness signal. When human corrects AI output, the corrected Capsules carry maximum informativeness — the correction event is the rarest and most-informative outcome signal. Surface 3 §5.5 weights correction-resolving Capsules with maximum bump coefficient.

#### INT-6 coupling — informativeness function joins frozen-anchors family

Per Phase 1 extension INT-6: informativeness function coefficients become tamper-anchored architectural property like `combined_score` per ADR-0022. The informativeness function joins the frozen-anchors family alongside `combined_score` coefficients + `RELEVANCE_FORGET_FLOOR` per ADR-0022.

#### Refinement preserves patent-implementation-evidence continuity

Refinement (extension of canonicalized substrate primitive) preserves patent-implementation-evidence continuity per Zone U2 + Decision Patent-A. Net-new primitive introduction would create discontinuity in the evidence chain; refinement is additive to the existing substrate. ADR-0022 amendment path per Forward implications canonicalizes the informativeness component extension — combined_score per ADR-0022 amends rather than supersedes.

### 5.6 DurationType vs DecayType collision resolution — OPERATOR REVIEW REQUIRED (D-2C-D5)

Section 5.6 surfaces the D-2C-D5-DURATION-COLLISION drift as OPERATOR REVIEW REQUIRED marker — substrate carries semantic overlap between two enums that requires operator decision.

#### Verified substrate-state collision

Pre-flight verification (substrate-evidence gathering before draft) confirmed the collision at substrate-state:

- **DurationType enum (6 values)** at `packages/database/prisma/schema.prisma`: TEMPORARY / SHORT_TERM / LONG_TERM / **PERMANENT** / **SESSION_ONLY** / NONE. Used in Permission lifetime context (4 usage sites in `apps/api/src`).
- **DecayType enum (5 values)** at `packages/database/prisma/schema.prisma`: FOUNDATIONAL / TIME_BASED / ACCESS_BASED / **PERMANENT** / **SESSION_ONLY**. Used in MemoryCapsule decay context (6 usage sites in `apps/api/src`).
- **Collision verified.** PERMANENT and SESSION_ONLY are present in BOTH enums (verified verbatim). The collision is exact, not approximate — same value names with potentially different semantics across enum boundary.

#### OPERATOR REVIEW REQUIRED — two architectural options

**Option A — Operationalize.** Canonicalize the semantic overlap as architectural property:

- DurationType governs Permission lifetime (how long the grant is valid)
- DecayType governs Capsule relevance lifecycle (how the Capsule's relevance evolves over time)
- PERMANENT in DurationType = Permission valid indefinitely; PERMANENT in DecayType = Capsule relevance does not decay
- SESSION_ONLY in DurationType = Permission valid only within issuing session; SESSION_ONLY in DecayType = Capsule relevance scoped to session lifetime
- The two PERMANENTs (or two SESSION_ONLYs) operate at different architectural registers; the substrate distinction preserves vocabulary and adds clarification
- Engineering effort: zero substrate engineering; canonical documentation clarifies the distinction at §5.6

**Option B — Rename.** Rename DecayType values to disambiguate from DurationType:

- `PERMANENT` → `DECAY_PERMANENT`
- `SESSION_ONLY` → `DECAY_SESSION_ONLY`
- Substrate semantics preserved; vocabulary precision strengthened
- Engineering effort: substantial — schema migration via Prisma `db push` + existing code updates (6 DecayType usage sites + tests + queries) + canonical reference updates

#### Substrate-honest articulation of trade-off

Option A engineering effort is zero (documentation-tier work); Option B engineering effort is substantial (schema migration + code updates). Option A vocabulary remains overlapping but operationally distinguished; Option B vocabulary is unambiguous.

Default until operator review: Option A operationalize (preserves substrate-state without rename engineering cost). Decision deferred to operator at Step 2D-completion or Step 2E-planning.

### 5.7 ACCESS_BASED behavioral closure (deferred to Step 2E per D-2C-D5-ACCESS-BASED-STUB)

Section 5.7 frames the D-2C-D5-ACCESS-BASED-STUB drift — substrate carries the ACCESS_BASED DecayType enum value but the operational behavior is stub-only. Closure framing canonical at §5.7; engineering implementation deferred to Step 2E.

#### Verified stub state

Pre-flight verification confirmed:

- **ACCESS_BASED enum value present** at `packages/database/prisma/schema.prisma:380` within DecayType enum
- **Comment-only stub** at `packages/database/src/queries/capsule.ts:402`: `// WHY: The decay job and feedback loops use access_count to keep ACCESS_BASED capsules relevant while they are being used.` The comment describes intent but no operational behavior implements it.
- **Substrate fields present** for the intended behavior: `MemoryCapsule.access_count Int @default(0)` (incremented by `incrementAccessCount` at `capsule.ts:402`); `MemoryCapsule.last_accessed_at DateTime?` (timestamped on access). The fields exist; the decay logic operating against them does not.

#### Surface 3 §5.7 closure framing

ACCESS_BASED differentiates from TIME_BASED via access-pattern-driven decay:

- **TIME_BASED** decay: `relevance_score` decays per `recencyScore` formula per ADR-0022 (linear decay day 7→90; floor at day 90)
- **ACCESS_BASED** decay: `relevance_score` decay rate conditioned on `access_count` and `last_accessed_at` — frequently-accessed Capsules decay slower; long-unaccessed Capsules decay faster than TIME_BASED baseline

Engineering implementation deferred to Step 2E per §5.9. The substrate already carries the fields needed for ACCESS_BASED behavior (`access_count` + `last_accessed_at` + `incrementAccessCount` write path); the decay-rate-conditioning logic against the fields is the engineering work.

### 5.8 Per-DMW-Type Sovereignty Rules (NEW SECTION per Correction 4) — Six EntityType Mappings Canonical

Section 5.8 is the most strategically consequential canonicalization in RAA 12.8. Three pending operator-review-required mappings (AI_AGENT / APPLICATION / GOVERNMENT) are RESOLVED in this amendment per operator decision; the resolution folds Correction A (Enterprise framing — substrate-honest correction to memory entry #16 zero-payload framing) and Correction B (AI_AGENT owning-entity-derived mapping — substrate-honest correction to PERSON-owned-only framing) inline. Six EntityType mappings now canonical at substrate-architecture register; backwards-propagation requirement to §3.8 + §4.4 + §4.6 + §4.8 + §5.1 + §5.2 + §5.4 + §6.1 zero-payload references queued per Commit 2; forward-flagged Corrections C/D/E surface NEW substrate territory.

#### Verified substrate evidence

- **EntityType enum (6 values)** verified verbatim at `packages/database/prisma/schema.prisma`: PERSON / COMPANY / AI_AGENT / DEVICE / APPLICATION / GOVERNMENT
- **WalletType enum (3 values) verified verbatim** at `packages/database/prisma/schema.prisma`: PERSONAL / ENTERPRISE / DEVICE
- **Wallet model** verified verbatim: `wallet_id` PK + `entity_id @unique` (1:1 entity-wallet relationship) + `wallet_type WalletType` + `niov_can_access_contents Boolean` (substrate property discriminating NIOV access patterns per wallet type) + `monetization_enabled Boolean` + `total_capsule_count Int` + `capsules MemoryCapsule[]` relation. ENTERPRISE wallets carry MemoryCapsules at substrate level (substrate-honest acknowledgment — NOT zero-payload per substrate state).
- **TwinConfig model** verified verbatim: `twin_id` PK + `autonomy_level` ("APPROVAL_REQUIRED" default; "EXECUTIVE_OVERRIDE" for admin twins) + `swarm_enabled` + `role_template` + `is_admin_twin` + `approver_entity_id` + `skills TwinSkill[]`. Twin creation pattern at `apps/api/src/services/governance/twin.service.ts:160-263` is substrate-active PERSON-owned AI_AGENT canonical case via EntityMembership(parent=owner_entity_id, child=twin) traversal.
- **Permission model** verified verbatim: `permission_id` PK + `bridge_id` (grouping) + `capsule_id` + `grantor_entity_id` + `grantee_entity_id` + `access_scope AccessScope` + `duration_type DurationType` + `can_share_forward Boolean` + `monetization_active Boolean` + `valid_from` + `expires_at` + `conditions Json` + `status PermissionStatus` + `revoked_at` + `revoked_by_entity_id`. SHARE/REVOKE substrate-active via `apps/api/src/services/cosmp/share.service.ts`; REVOKE flips permissions to REVOKED in transactional sweep; `PERMISSION_REVOKED` audit event at `share.service.ts:362`. Substrate-honest acknowledgment: no explicit `forget_on_detach` primitive — forget-on-detach semantics operate at Permission revocation tier (Zone U4 per RAA 12.7 §2.5).
- **ENTERPRISE wallet substrate-active** at `apps/api/src/services/governance/dandelion.service.ts:205` (org creation flow); PERSONAL wallet substrate-active at multiple sites (twin.service.ts:191; auth-admin.routes.ts:162; seeds.ts:387; org.routes.ts:202; dandelion.service.ts:269).
- **Memory entry #16 substrate-honest correction:** Memory entry framed three DMW types as "Personal / Enterprise zero-payload / Device"; verified substrate state at WalletType enum + Wallet model carries `PERSONAL / ENTERPRISE / DEVICE` with no explicit "zero-payload" property. The "zero-payload" framing is the corrective territory Correction A canonicalizes — Enterprise DMW carries company data; payload-carrying is uniform across WalletType per substrate state; forget-on-detach semantics live at Permission tier, not at WalletType-tier.

#### Three direct mappings — refined per Correction A

- **PERSON → Personal DMW.** Direct mapping; canonical case. Owner-human is sovereign per RULE 0; only owner-human grants LONG_TERM or PERMANENT (per DurationType enum at §5.6); full-payload contribution permitted; full-payload consumption permitted. Wallet `wallet_type: "PERSONAL"`; `niov_can_access_contents` substrate property discriminates NIOV access patterns per wallet type.
- **COMPANY → Enterprise DMW.** Direct mapping; canonical case. Substrate-honest correction per Correction A: Enterprise DMW carries company data — NOT zero-payload as memory entry #16 framed. The architectural property is: Enterprise carries payload data (capsules with full content) at substrate level (verified substrate-active at `dandelion.service.ts:205`); forget-on-detach semantics live at Permission tier (revoke detaches grantee access; capsule remains in grantor's wallet); per-purpose Permission scoping allows permissioned DMWs (Personal DMWs holding Permission grants from Enterprise) to retain specific data subset per Permission terms; revocation removes access (Zone U4 per RAA 12.7 §2.5); forget-on-detach is NOT a wallet-type-tier property but a Permission-tier property operating uniformly across all wallet types. Wallet `wallet_type: "ENTERPRISE"`; `niov_can_access_contents` substrate property may discriminate Enterprise from Personal NIOV access patterns per substrate state.
- **DEVICE → Device DMW.** Direct mapping; canonical case. Device-owner sovereignty: the human who owns the device is sovereign; device cannot grant beyond owner-permitted scope. Device acts within owner-bounded delegation. Wallet `wallet_type: "DEVICE"`.

#### Three pending mappings — RESOLVED per operator decision

**AI_AGENT → Owning-entity-derived DMW (Correction B canonical).** Substrate-honest correction per Correction B: any entity can own AI_AGENT, not just PERSON. The AI_AGENT mapping derives from owning-entity DMW type — recursive resolution via EntityMembership(parent=owning_entity, child=AI_AGENT) substrate primitive verified at `apps/api/src/services/governance/twin.service.ts:160-263`. Six owning-entity-discriminated sub-mappings canonicalized:

- **PERSON-owned AI_AGENT → Personal DMW.** Canonical twin pattern; substrate-active at `twin.service.ts:191` (`wallet_type: "PERSONAL"`); EntityMembership(parent=owner_entity_id, child=twin); TwinConfig with autonomy_level (APPROVAL_REQUIRED default or EXECUTIVE_OVERRIDE for admin twins); approver_entity_id routes governance through owning-human. The PERSON-owned canonical case is the substrate-active operational reference for the owning-entity-derived discipline.
- **COMPANY-owned AI_AGENT → Enterprise DMW.** Corporate AI assistant pattern; AI_AGENT owned by COMPANY entity carries Enterprise wallet; payload contribution permitted at enterprise scope per Correction A Enterprise framing; sovereignty bounded by owning-COMPANY's enterprise governance terms. NET-NEW substrate territory per pre-flight verification (current substrate primitives focus on PERSON-owned twin pattern; COMPANY-owned AI_AGENT engineering work enumerated at §5.9).
- **APPLICATION-owned AI_AGENT → Enterprise DMW.** Application-tier AI pattern; APPLICATION is enterprise-tier per APPLICATION→Enterprise canonical mapping (below); AI_AGENT owned by APPLICATION entity inherits Enterprise DMW type. NET-NEW substrate territory.
- **GOVERNMENT-owned AI_AGENT → Custom Government DMW.** Government-tier AI pattern; AI_AGENT owned by GOVERNMENT entity inherits Custom Government DMW type with FedRAMP/IL4/IL5/IL6/CMMC sovereignty constraints. NET-NEW substrate territory; depends on Custom Government DMW type primitive resolution per GOVERNMENT→Custom Government mapping (below).
- **DEVICE-owned AI_AGENT → Device DMW.** Device-embedded AI pattern; AI_AGENT owned by DEVICE entity inherits Device DMW type. NET-NEW substrate territory.
- **AI_AGENT-owned AI_AGENT → Recursive resolution.** Multi-agent coordination pattern; AI_AGENT owned by another AI_AGENT entity inherits the parent AI_AGENT's DMW configuration recursively. Recursive resolution terminates at non-AI_AGENT owning-entity (PERSON / COMPANY / APPLICATION / GOVERNMENT / DEVICE); the recursion is well-defined because EntityMembership traversal terminates when parent_id references non-AI_AGENT entity. Per RULE 0: AI_AGENT cannot grant to AI_AGENT directly; recursive AI_AGENT ownership operates via substrate-mediated coordination per §5.4, not via direct cross-AI permission grant. NET-NEW substrate territory.
- **Standalone AI_AGENT (no owning-entity) → AI_AGENT-tier DMW.** Independent agent pattern; AI_AGENT entity with no parent EntityMembership row carries AI_AGENT-tier DMW with baseline sovereignty constraints + RULE 0 invariance preserved (AI_AGENT cannot grant LONG_TERM or PERMANENT; AI_AGENT cannot grant to AI_AGENT directly). NET-NEW substrate territory; baseline-tier behavior canonicalized as substrate-architecture coverage default for independent agents.

The owning-entity-derived discipline is the canonical resolution mechanism. Operator decision per Correction B: AI_AGENT mapping is NOT a single direct mapping but a recursive resolution against owning-entity DMW type via EntityMembership substrate primitive.

**APPLICATION → Enterprise DMW.** Operator decision: APPLICATION is enterprise-tier tool; applications are deployed by enterprises (COMPANY / GOVERNMENT) or by individuals (PERSON); the deployment context determines the encapsulating sovereignty boundary, but APPLICATION itself maps to Enterprise DMW pattern. Wallet `wallet_type: "ENTERPRISE"`; payload contribution permitted at enterprise scope per Correction A Enterprise framing; sovereignty bounded by application-owner (the entity that deploys the application — human, organization, or government). NET-NEW substrate territory per pre-flight verification (current substrate primitives focus on PERSON / COMPANY direct mappings; APPLICATION deployment engineering work enumerated at §5.9).

**GOVERNMENT → Custom Government DMW.** Operator decision: GOVERNMENT-jurisdiction sovereignty differs from commercial enterprise sovereignty substantively — regulatory governance applies with per-jurisdiction sovereignty rules; FedRAMP / IL4 / IL5 / IL6 / CMMC compliance constraints per memory entry #21; compliance-request authority operates at governmental scope; regulatory governance leeway differs from commercial governance. Custom Government DMW type designation required — NET-NEW substrate primitive extension per ADR-0021 Capsule Type Extension Protocol pattern (analogous to capsule-type extension; substrate-tier WalletType enum extension with `GOVERNMENT` value or compliance-discriminator field on existing ENTERPRISE WalletType). NET-NEW substrate territory; engineering work enumerated at §5.9. The architectural property: GOVERNMENT mapping recognizes regulatory-tier sovereignty as substrate-tier discrimination — substantive substrate-architecture coverage extension under US 12,517,919 per §8.4 continuation patent candidate territory.

#### Substrate-honest correction folded — Correction A (Enterprise framing)

Memory entry #16 referenced "Enterprise zero-payload" framing — the framing is corrective territory; substrate-honest correction folded inline at §5.8 amendment canonical record:

- **Memory entry #16 framing:** "three DMW types: Personal / Enterprise zero-payload / Device"
- **Substrate-honest correction:** Enterprise DMW carries company data; WalletType enum has explicit `ENTERPRISE` value (PERSONAL / ENTERPRISE / DEVICE per verbatim verification); Wallet model carries `capsules MemoryCapsule[]` relation uniformly across all wallet types; ENTERPRISE wallet substrate-active at `dandelion.service.ts:205` org creation flow
- **Architectural property:** forget-on-detach semantics live at Permission tier (Zone U4 per RAA 12.7 §2.5) — Permission revoke flow detaches grantee access; capsule remains in grantor's wallet (RULE 10 invariance preserved — nothing deleted; only access detached). Permissioned DMWs (Personal DMWs holding Permission grants from Enterprise) forget Enterprise data on Permission detach via REVOKE operation
- **Per-purpose Permission scoping:** Permission `conditions Json` field carries per-purpose access semantics; permissioned DMW may retain specific data subset per Permission terms while detaching other data subset per separate Permission terms
- **Backwards-propagation requirement per Commit 2:** "Enterprise zero-payload" framing appears at multiple §RAA-12.8 sites — §3.8 parallel orchestration mechanics; §4.4 Field 3 resonance/coherence; §4.6 Field 5 salience; §4.8 Hive coordination; §5.1 dual-posture canonicalization; §5.2 HITL primitives expansion; §5.4 agent-to-agent coordination; §6.1 INT-1 cross-wallet context layer. Commit 2 ships backwards-amendment to all sites; Correction A folded at §5.8 origin for canonical-record-tier reference + backwards-propagation flagged
- **§5.8 amendment canonical record reflects substrate truth:** Enterprise framing per Correction A folded inline; backwards-propagation tracked for Commit 2

#### Substrate-honest correction folded — Correction B (AI_AGENT owning-entity-derived)

Memory entry #21 + Correction 4 + RULE 0 framed AI_AGENT as "bounded by owning-human sovereignty" — the framing is partial corrective territory; substrate-honest correction folded inline at §5.8 amendment canonical record:

- **Memory entry #21 framing:** "AI_AGENT first-class peer entities with their own DMWs; bounded by owning-human sovereignty"
- **Substrate-honest correction:** any entity can own AI_AGENT, not just PERSON. EntityType enum permits any entity type as `parent_id` in EntityMembership row; the substrate primitive does not restrict owning-entity type to PERSON
- **Substrate-active operational reference (PERSON-owned canonical case):** `apps/api/src/services/governance/twin.service.ts:160-263` createTwin flow; EntityMembership(parent_id=input.owner_entity_id, child_id=newly-created-AI_AGENT-twin); TwinConfig.approver_entity_id routes governance through owning-entity (PERSON in current substrate-active flows)
- **Architectural property:** AI_AGENT DMW type derives from owning-entity DMW type via recursive resolution against EntityMembership substrate primitive. PERSON-owned → Personal; COMPANY-owned → Enterprise; APPLICATION-owned → Enterprise; GOVERNMENT-owned → Custom Government; DEVICE-owned → Device; AI_AGENT-owned → recursive (resolves to non-AI_AGENT owning-entity); standalone → AI_AGENT-tier
- **Substrate-active vs NET-NEW state:** PERSON-owned AI_AGENT is substrate-active (twin pattern operational); other five sub-mappings (COMPANY-owned / APPLICATION-owned / GOVERNMENT-owned / DEVICE-owned / AI_AGENT-owned / standalone) are NET-NEW substrate territory. Engineering work for owning-entity-derived resolution mechanism enumerated at §5.9 Step 2E
- **RULE 0 sovereign-human invariance preserved:** owning-entity-derived discipline preserves RULE 0 (AI_AGENT cannot grant LONG_TERM or PERMANENT; AI_AGENT cannot grant to AI_AGENT directly); when owning-entity is non-human (COMPANY / APPLICATION / GOVERNMENT / DEVICE / AI_AGENT), the recursive resolution propagates through to a sovereign-human entity at the ultimate parent — every owning-entity chain terminates at a human-sovereign root or at the AI_AGENT-tier baseline (standalone case); RULE 0 invariance never bypassed
- **Backwards-propagation requirement per Commit 2:** "AI_AGENT bounded by owning-human sovereignty" framing appears at §5.1 dual-posture canonicalization; §5.4 agent-to-agent coordination; §6.1 INT-1 cross-wallet context layer. Commit 2 ships backwards-amendment to all sites; Correction B folded at §5.8 origin for canonical-record-tier reference + backwards-propagation flagged
- **§5.8 amendment canonical record reflects substrate truth:** AI_AGENT owning-entity-derived per Correction B folded inline; backwards-propagation tracked for Commit 2

#### Forward-flagged substrate territory (Corrections C/D/E + backwards-propagation requirement)

Three additional substrate corrections surfaced during operator review of §5.8 amendment; forward-flagged for subsequent commit territory:

- **Correction C — Human-permission-gating substrate-tier invariant.** RULE 0 sovereign-human invariance operates at policy-tier per current substrate; substrate-tier invariant for human-permission-gating (all permission grants ultimately gated by human-sovereign decision; substrate enforces the gating mechanism, not policy-tier reliance) is NEW substrate territory. Forward-flagged for backwards-propagation commit territory; engineering work enumerated at §5.9 if Correction C resolves to substrate-tier discipline canonicalization.
- **Correction D — Permission-trickle-through-non-human-DMW.** When non-human-DMW (Enterprise / Device / AI_AGENT) carries Permission grants, the grant ultimately trickles through to a human-sovereign decision per RULE 0 + Correction C; substrate-tier mechanism for permission trickle-through is NEW substrate territory. Forward-flagged for backwards-propagation commit territory.
- **Correction E — Substrate-vs-configuration separation.** Substrate primitives (WalletType enum + Wallet model + Permission model + TwinConfig model) are substrate-tier; per-DMW-type configuration parameters (`niov_can_access_contents` Boolean + `monetization_enabled` + autonomy_level + access_scope) are configuration-tier. The separation matters per architectural register — substrate-tier canonicalization at §5.8 distinct from per-DMW-type configuration canonicalization at future commit (post-RAA-12.8 substrate-engineering scope). Forward-flagged for NEW substrate territory commit.

Backwards-propagation requirement per Commit 2: §5.8 amendment canonicalizes Correction A + Correction B at canonical-record-tier reference; "Enterprise zero-payload" framing + "AI_AGENT bounded by owning-human" framing appear at multiple RAA 12.8 sites that require backwards-amendment for substrate-truth coherence across canonical record. Commit 2 ships backwards-amendment per coordinated commit discipline.

#### Universal coordination primitives + per-DMW-type governance (preserved)

The architectural distinction per Correction 3 + Correction 4: coordination primitives are universal (substrate-tier mechanisms operate the same across entity types); governance rules are per-DMW-type (sovereignty constraints differ across DMW types). The two operate at distinct architectural registers.

The §5.8 amendment operationalizes the per-DMW-type governance dimension with six EntityType mappings canonical: substrate sovereignty enforcement per §3.8 + §4.8 + §5.4 + §6.1 has canonical reference for entity-type-discriminated scheduling constraints. The six-mapping resolution preserves universal coordination primitives — COE retrieval / Hive participation / bilateral feedback Loop 1 operate uniformly across all EntityType values per Correction 3 entity-type uniformity; per-DMW-type governance asymmetries operate per Correction 4 sovereignty constraints.

#### Patent-implementation-evidence territory (expanded per amendment)

Per-DMW-type sovereignty differentiation per six EntityType mappings is substantive substrate-architecture coverage extension under US 12,517,919. Continuation patent candidate per §8.4 — the §5.8 amendment expands the candidate territory:

- **AI_AGENT owning-entity-derived discipline** per Correction B — substantive substrate-architecture coverage; recursive resolution mechanism operating against EntityMembership substrate primitive; six sub-mappings canonical
- **APPLICATION → Enterprise DMW mapping** per operator decision — substrate-architecture coverage at application-tier sovereignty register
- **GOVERNMENT → Custom Government DMW mapping** per operator decision — substantive substrate-architecture coverage at regulatory-tier sovereignty register; Custom Government DMW NET-NEW substrate primitive extension flagged for continuation patent territory
- **Correction A Enterprise framing** — substrate-honest correction strengthens patent-implementation-evidence by reflecting substrate truth (Enterprise carries payload; forget-on-detach semantics at Permission tier; NOT zero-payload property) at canonical-record-tier
- **Forward-flagged Corrections C/D/E** — NEW substrate territory; substantive substrate-architecture coverage extension territories surfaced for future continuation patent candidate review

Adversarial-actor protection per Decision Patent-A: substrate-honest framing at §5.8 amendment canonical record strengthens defensive publication strategy. Substrate truth at canonical-record-tier provides evidentiary mass that adversarial actors cannot dispute through framing-tier challenges — the substrate carries the six EntityType mappings with owning-entity-derived resolution per Correction B; substrate is what runs; canonical record reflects substrate truth.

#### Cross-section reach (updated)

- **§3.8 Surface 1 parallel orchestration** — per-DMW-type sovereignty as scheduling constraint per Correction 4; §5.8 amendment canonicalizes six EntityType-to-DMW-type mappings that §3.8 references; backwards-propagation per Commit 2 amends §3.8 "Enterprise zero-payload" framing
- **§4.4 Field 3 resonance/coherence** — cross-wallet coherence detection respects per-DMW-type sovereignty per Correction 4; backwards-propagation per Commit 2 amends §4.4 Enterprise framing
- **§4.6 Field 5 context-dependent salience** — cross-wallet salience signal scoped per-wallet per per-DMW-type discipline; backwards-propagation per Commit 2 amends §4.6 Enterprise framing
- **§4.8 Hive coordination per Correction 2 + Correction 4** — HiveMembership sovereignty primitives align with §5.8 six mappings; backwards-propagation per Commit 2 amends §4.8 Enterprise framing
- **§5.1 dual-posture canonicalization** — backwards-propagation per Commit 2 amends §5.1 AI_AGENT framing (owning-entity-derived per Correction B; not PERSON-owned-only)
- **§5.2 HITL primitives expansion** — backwards-propagation per Commit 2 amends §5.2 framing where Enterprise / AI_AGENT references occur
- **§5.4 agent-to-agent coordination per Corrections 1+3+4** — backwards-propagation per Commit 2 amends §5.4 AI_AGENT framing (any entity can own AI_AGENT)
- **§6 cross-surface architectural decisions** — INT-1 unified cross-wallet context layer references §5.8 per-DMW-type discipline; backwards-propagation per Commit 2 amends §6.1 Enterprise + AI_AGENT framing
- **§7.4 frozen-anchors family extension** — frozen-anchors discipline applies across all six DMW types per §5.8 amendment canonicalization
- **§8.4 continuation patent candidate** — §5.8 amendment expands continuation patent candidate territory per six-mapping canonicalization + Correction A + Correction B + forward-flagged Corrections C/D/E
- **Memory entry #16 substrate-honest correction territory** — Correction A operates per substrate truth at WalletType enum + Wallet model verbatim verification
- **Memory entry #21 substrate-honest correction territory** — Correction B operates per substrate truth at EntityMembership + TwinConfig verbatim verification

### 5.9 Step 2E engineering surface enumerated

Section 5 canonicalizes Surface 3 architectural decisions; Step 2E implements the canonicalization. The §5.9 enumeration surfaces the substrate-honest engineering surface for Surface 3.

Step 2E engineering surface for Surface 3:

- **D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure** — implement EscalationRequest Prisma model per §5.2; validation gate flags primitives; approval workflow primitives; correction propagation chain. Schema migration via Prisma `db push`. Replace `getEscalationsPending` stub at `priming.ts:131-134` with substrate-active `prisma.escalationRequest.findMany` per TODO Section 14.
- **SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021 protocol** per §5.3 — schema enum extension; PRICING_TABLE entry update per ADR-0021 Decision Step 3 deliberate-blocker; SYSTEM_PRINCIPALS.SUBSTRATE_OBSERVER constant addition; substrate-tier observation event writer implementation; coupling to INT-2 informativeness consumer at §5.5.
- **D-2D-D11-AGENT-TO-AGENT-INTENTIONAL-VS-GAP closure** — substrate-mediated agent-to-agent coordination canonical interface per §5.4. Engineering tier: formalize the COE cross-wallet retrieval path for AI_AGENT-to-AI_AGENT context-sharing under owning-entity sovereignty per Correction B owning-entity-derived discipline canonical at §5.8 amendment; Hive coordination for AI_AGENT participation per §4.8.
- **D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY closure** — active-learning informativeness coefficient implementation per §5.5. Differential bump for high-informativeness outcomes (correction-resolving Capsules per INT-3); differential decay for explicitly-rejected context layers; informativeness function joins frozen-anchors family per INT-6; ADR-0022 amendment path for combined_score component extension.
- **DurationType-vs-DecayType collision resolution implementation** per §5.6 operator review (Option A: zero substrate engineering; documentation clarification; Option B: schema migration + 6 DecayType usage site updates).
- **ACCESS_BASED behavioral implementation** per §5.7 (decay-rate-conditioning on `access_count` + `last_accessed_at`; differentiation from TIME_BASED recencyScore per ADR-0022).
- **Per-DMW-type sovereignty rules implementation** per §5.8 (after operator decisions resolve AI_AGENT / APPLICATION / GOVERNMENT mappings). Engineering tier: per-DMW-type scheduling constraint enforcement at §3.8 cross-wallet retrieval; per-DMW-type HiveMembership constraint at §4.8 Hive coordination.

#### Engineering effort estimate

Surface 3 Step 2E engineering surface is substantial — multi-sprint scope across §5.2-§5.8. The EscalationRequest model + SUBSTRATE_OBSERVATION extension + informativeness coefficient implementation are NET-NEW substrate work; the DurationType-vs-DecayType resolution + ACCESS_BASED closure + per-DMW-type sovereignty rules build on existing substrate. ADR-0017 production-discipline applies to each implementation surface.

Per Decision 4 (all blocks required due to interconnection), Surface 3 engineering work proceeds after RAA 12.8 full-document drafting completes (Sections 6-10); the engineering surface is sequenced after architectural canonicalization. Section 5.9 enumeration is the canonical Step 2E reference for Surface 3 work scope.

### 5.10 Correction E substrate territory — Substrate-vs-configuration separation canonical

Section 5.10 canonicalizes Correction E substrate territory per operator decision (Commit 3 of 6 amendment chain following §5.8 amendment Commit 1 at `604aac6` + 18-site body-text amendment Commit 2 at `2cced88`). Correction E forward-flagged at §5.8 amendment canonical record as NEW substrate territory; §5.10 expands the canonicalization with substrate-vs-configuration separation + permission-batching primitives + permission-class taxonomy + permission-trickle-through architecture + auto-grant authorization primitives + cognitive-load measurement primitives. Three OPERATOR REVIEW REQUIRED markers preserved for research-pending architectural decisions (specific batching algorithm choice + specific auto-grant threshold values + specific cognitive-load measurement methodology).

#### Substrate-vs-configuration separation canonical (per operator decision)

Foundation operates as substrate-tier platform with API configuration surface; enterprises and governments configure policies against Foundation API. The architectural separation matters at three distinct registers:

**Substrate-tier invariants (Foundation-owned; substrate ALWAYS enforces):**

- **RULE 0 sovereign-human invariance** — humans are always sovereign over data they own; no AI agent, robot, device, or application accesses human entity data without explicit revocable permission; enforced cryptographically at substrate-tier, not by policy.
- **Correction C human-permission-gating substrate-tier invariant** — recursive resolution of owning-entity chain ultimately terminates at sovereign-human entity OR at AI_AGENT-tier baseline (Standalone case); substrate-tier mechanism prevents bypass via intermediate non-human DMW layers; RULE 0 invariance never bypassed.
- **Correction D permission-trickle-through-non-human-DMW** — when non-human-DMW (Enterprise / Device / AI_AGENT) carries Permission grants, the grant ultimately trickles through to sovereign-human decision per RULE 0 + Correction C; substrate-tier flow primitive enforces the trickle-through architecture; substrate-tier mechanism for non-human-DMW Permission grants cannot be circumvented by application-tier policy.

**Substrate-tier primitives (Foundation-owned; substrate exposes via API):**

- **WalletType enum + Wallet model** — substrate-tier wallet typing (PERSONAL / ENTERPRISE / DEVICE per Wallet schema verified; `niov_can_access_contents Boolean` substrate property discriminating NIOV access patterns per wallet type).
- **Permission model + DurationType + PermissionStatus** — substrate-tier permission grant primitives (DurationType enum: TEMPORARY / SHORT_TERM / LONG_TERM / PERMANENT / SESSION_ONLY / NONE; PermissionStatus enum: ACTIVE / REVOKED / EXPIRED; verified substrate-active).
- **TwinConfig model** — substrate-tier twin governance (autonomy_level + is_admin_twin + approver_entity_id; PERSON-owned AI_AGENT canonical case substrate-active at `apps/api/src/services/governance/twin.service.ts:160-263`).
- **EscalationRequest model** — substrate-tier escalation workflow (D-2D-D10 closure territory; NOT YET BUILT per pre-flight verification — `EscalationItem` interface at `priming.ts:36` + `getEscalationsPending` stub at `priming.ts:131-134` returning `[]`; Section 14 TODO at `priming.ts:128` + `routes/org.routes.ts:1140-1169`).
- **SUBSTRATE_OBSERVATION CapsuleType** — substrate-tier observation primitive (NET-NEW per §5.3; ADR-0021 extension protocol path; SYSTEM_PRINCIPALS infrastructure substrate-active per SCHEDULER + FEEDBACK_LOOP precedent at `scheduler.ts:56` + `feedback.service.ts:633`).

**API configuration surface (Foundation-exposed; enterprises/governments configure):**

- Data residency policies (which substrate deployment + geographic region)
- Server choice policies (managed cloud vs sovereign cloud vs on-premise vs air-gapped per ADR-0018)
- Permission policies (which DurationType values application uses; auto-grant scope; auto-grant thresholds per configuration)
- Cognitive-load thresholds (application-tier UX policies)
- Compliance framework selection (FedRAMP / IL4 / IL5 / IL6 / CMMC per `EntityComplianceProfile`)

**Salesforce-pattern reference:** platform provides primitives + sovereignty enforcement at substrate-tier; enterprises configure their policies on top via API. Foundation operates as substrate-tier platform; enterprise/government configuration occurs at API surface tier; substrate-tier invariants cannot be bypassed by configuration.

#### Permission-batching primitives canonical

Permission grant flow at scale benefits from batching primitives that operate at substrate-tier. Substrate-tier permission-batching primitives:

- **`permission_batch` entity primitive** — NET-NEW substrate territory; substrate-tier data structure for batched permission grants (multiple Permission rows grouped under a single batch identifier; analogous to `bridge_id` pattern in existing Permission model that groups SHARE permissions).
- **Batch grouping mechanism** — per-batch grouping discipline operates at substrate-tier; application cannot bypass substrate batching by creating individual Permission rows when batching is required per substrate policy.
- **API surface for batched permission flow** — Foundation exposes batched-permission API endpoints; application consumes the API to issue / accept / revoke batches.
- **Substrate-enforced cognitive-load thresholds** — substrate enforces maximum batch size + maximum concurrent batches + maximum batch frequency per cognitive-load discipline; application configures threshold values within substrate-tier bounds.
- **RULE 0 invariance preserved per batch** — every batch element subject to RULE 0 sovereign-human invariance; substrate enforces per-element + per-batch sovereignty constraints.

**OPERATOR REVIEW REQUIRED — specific batching algorithm choice:** research-pending. Three candidate approaches surfaced for operator review during full-document drafting completion or Step 2E planning:

- **(a) Google / Anthropic / OpenAI best practices** — adopt established batching algorithm from research-leading AI platforms; substrate-architectural-coverage alignment with industry research.
- **(b) Cognitive-science-grounded algorithm** — batching algorithm grounded in cognitive-load research (Miller 7±2 + Sweller cognitive load theory + working-memory chunking); substrate-architectural-coverage alignment with cognitive-science framing per §1.1.
- **(c) Novel optimization** — substrate-tier batching algorithm designed for Foundation's specific permission-trickle-through architecture (Correction D) + AI_AGENT owning-entity-derived recursion (Correction B); novel substrate-architectural-coverage if no clean precedent exists for the recursive owning-entity-chain batching territory.

Default until operator review: (b) cognitive-science-grounded algorithm. Decision deferred to operator at Step 2D-completion or Step 2E-planning per coordinated architectural-engineering discipline.

#### Permission-class taxonomy canonical per Correction C

Permission classes operate as substrate-tier discrimination over the DurationType enum (verified verbatim per pre-flight). Substrate-tier permission-class taxonomy:

- **LONG_TERM permissions** — substrate-tier discrimination canonical; per RULE 0, only owner-human grants LONG_TERM permissions (AI_AGENT cannot grant LONG_TERM directly per RULE 0; substrate enforces).
- **SHORT_TERM permissions** — substrate-tier discrimination canonical; bounded-duration grants with automatic expiry via `expires_at` field.
- **PERMANENT permissions** — substrate-tier discrimination canonical; per RULE 0, only owner-human grants PERMANENT permissions; substrate enforces; coordinates with §5.6 DurationType-vs-DecayType collision territory (OPERATOR REVIEW REQUIRED per §5.6 — PERMANENT appears in both DurationType + DecayType enums).
- **TEMPORARY permissions** — substrate-tier discrimination canonical; ephemeral grants with explicit cleanup mechanisms.
- **SESSION_ONLY permissions** — substrate-tier discrimination canonical; coordinates with §5.6 collision territory.
- **NONE** — sentinel value for permission grants with no duration constraint specified.

Permission-class informs:
- Permission-batching primitives (batching algorithm choice per §5.10 OPERATOR REVIEW above)
- Auto-grant authorization (per-class auto-grant policies vs RULE 0 boundaries)
- Cognitive-load presentation (per-class UX framing at application tier)
- §3.8 parallel orchestration scheduling (per-DMW-type sovereignty + permission-class-aware scheduling)

#### Permission-trickle-through-non-human-DMW flow architecture canonical per Correction D

Substrate-tier flow primitive (already forward-folded at §5.2 + §6.1 per Commit 2 backwards-propagation; §5.10 expands canonicalization):

- **When non-human-DMW carries Permission grants** (Enterprise / Device / AI_AGENT), the grant ultimately trickles through to a human-sovereign decision per RULE 0 + Correction C.
- **Recursive resolution via EntityMembership substrate primitive** — `parent_id` chain traversal terminates at sovereign-human entity OR at AI_AGENT-tier baseline (Standalone case per §5.8 amendment six AI_AGENT sub-mappings).
- **RULE 0 invariance preserved by construction** — substrate primitive enforces invariance; substrate primitive cannot be bypassed by application policy.
- **EscalationRequest model is the substrate-active operational reference** — once D-2D-D10 closure ships per §5.2 + §5.9 Step 2E engineering surface, EscalationRequest workflow operationalizes the trickle-through architecture; pending substrate state per pre-flight verification (EscalationItem interface present; Prisma model NOT YET BUILT; Section 14 TODO).
- **Trickle-through audit trail** — every Permission grant in non-human-DMW chain produces audit trail per Zone U4 (permission grant lineage); audit chain preserves trickle-through resolution evidence.

#### Auto-grant authorization primitives canonical

Auto-grant primitives operate at substrate-tier with RULE 0 boundary enforcement:

**Substrate-enforced RULE 0 boundaries (Foundation ALWAYS enforces):**

- Substrate ALWAYS gates LONG_TERM grants — only owner-human can grant LONG_TERM; AI_AGENT cannot grant LONG_TERM directly; substrate-tier predicate enforces.
- Substrate ALWAYS gates PERMANENT grants — only owner-human can grant PERMANENT; AI_AGENT cannot grant PERMANENT directly; substrate-tier predicate enforces.
- Substrate ALWAYS gates AI_AGENT-as-sovereign-grantor attempts — AI_AGENT cannot grant to AI_AGENT directly (RULE 0); substrate-tier predicate enforces at Permission creation time (`packages/database/src/queries/permission.ts` per schema comment).
- Substrate ALWAYS gates cross-DMW-type Permission flows that would bypass owning-human sovereignty — recursive resolution via EntityMembership per Correction C.

**Application-configured policies (enterprises/governments configure within substrate bounds):**

- Auto-grant thresholds (per-CapsuleType auto-grant policies; per-grantee-role auto-grant policies)
- Auto-grant scope (which DurationType values are auto-grantable per application; subset of substrate-allowed DurationTypes)
- Cognitive-budget allocation (per-user cognitive-load budget per period; auto-grant frequency policies)
- Per-application auto-grant audit posture (compliance-tier audit configuration)

Substrate enforces RULE 0 boundaries regardless of application configuration. Application cannot configure auto-grant policy that violates substrate-tier invariants.

**OPERATOR REVIEW REQUIRED — specific auto-grant threshold values:** research-pending. Three candidate approaches surfaced:

- **(a) Conservative thresholds** — minimal auto-grant scope (auto-grant only TEMPORARY + SHORT_TERM per default; manual review for LONG_TERM + PERMANENT); favors cognitive-load minimization.
- **(b) Moderate thresholds** — balanced auto-grant scope (auto-grant TEMPORARY + SHORT_TERM + LONG_TERM-within-trusted-grantee-set per default; manual review for PERMANENT + cross-trust-boundary LONG_TERM); favors operational throughput.
- **(c) Application-tier-discretionary thresholds** — substrate enforces RULE 0 boundaries only; application configures all auto-grant thresholds; favors application-tier flexibility.

Default until operator review: (a) conservative thresholds at substrate-tier defaults; application configures more permissive thresholds within substrate-tier bounds. Decision deferred to operator at Step 2D-completion or Step 2E-planning.

#### Cognitive-load measurement primitives canonical

Substrate observes via SUBSTRATE_OBSERVATION CapsuleType (per §5.3 NET-NEW; ADR-0021 extension protocol path); application interprets substrate observation per application-tier UX:

- **SUBSTRATE_OBSERVATION events** carry substrate-tier observation data (per-(entity, capsule_type) relevance distribution shifts; per-wallet retrieval pattern changes; informativeness signal trends; permission grant frequency; permission grant rejection patterns).
- **Substrate observation primitive substrate-active infrastructure** — SYSTEM_PRINCIPALS.SUBSTRATE_OBSERVER constant addition per §5.9 Step 2E; SUBSTRATE_OBSERVATION events written into system-principal-owned wallet.
- **Cognitive-load measurement signal** — substrate-tier signal derived from SUBSTRATE_OBSERVATION events; application interprets signal for cognitive-load presentation.
- **INT-2 coupling preserved** — SUBSTRATE_OBSERVATION IS informativeness primitive per §6.2; cognitive-load measurement primitive coexists with informativeness coupling.

**OPERATOR REVIEW REQUIRED — specific cognitive-load measurement methodology:** research-pending. Four candidate approaches surfaced:

- **(a) Request count per period** — substrate observes permission request frequency per unit time; cognitive-load signal = request count above baseline threshold.
- **(b) Request frequency variance** — substrate observes variance in request timing; cognitive-load signal = variance below threshold (indicates burst attention demand) OR above threshold (indicates fatigue distribution).
- **(c) User-reported friction** — application surfaces explicit user friction signals (user dismisses permission requests rapidly; user rejects pattern of similar permissions); substrate records via SUBSTRATE_OBSERVATION.
- **(d) User-engagement-pattern** — substrate observes user engagement patterns (session duration; conversation-pattern depth; permission-accept rate); cognitive-load signal = pattern correlation with predicted friction.

Default until operator review: (a) + (c) combined (request count + explicit user-reported friction; baseline-pattern measurement methodology). Decision deferred to operator at Step 2D-completion or Step 2E-planning per coordinated architectural-engineering discipline.

#### Patent-implementation-evidence territory expanded

Correction E substrate territory canonicalization expands continuation patent candidate territory per §8.4. Substrate-vs-configuration separation + permission-batching primitives + permission-class taxonomy + permission-trickle-through architecture + auto-grant authorization primitives + cognitive-load measurement primitives compose substantive substrate-architecture coverage extension under US 12,517,919:

- **Substrate-vs-configuration separation as architectural property** — substrate-tier platform with API configuration surface; Foundation patent-implementation-evidence advanced by canonicalization at canonical-record register.
- **Permission-batching primitives** — substrate-tier permission flow architecture; NEW substrate primitive territory; continuation patent candidate per §8.4.
- **Permission-class taxonomy at substrate-tier** — substrate-tier discrimination over DurationType enum; substantive substrate-architecture coverage canonicalization.
- **Permission-trickle-through-non-human-DMW** — substrate-tier flow primitive (already canonicalized at §5.8 amendment + §5.2 + §6.1 per Commit 2; §5.10 expansion strengthens patent-implementation-evidence).
- **Auto-grant authorization primitives** — substrate-tier RULE 0 boundary enforcement + application-configured policies; substantive substrate-architecture coverage canonicalization.
- **Cognitive-load measurement primitives** — substrate-tier observation primitive via SUBSTRATE_OBSERVATION + application-tier interpretation; substantive substrate-architecture coverage canonicalization.

Adversarial-actor protection per Decision Patent-A defensive publication strategy operates uniformly: substrate truth canonical at body-text register per Path B-2 backwards-propagation + Correction E NEW substrate territory canonicalization at §5.10 strengthens evidentiary mass throughout RAA 12.8 document.

#### Cross-section reach

Correction E substrate territory couples to:

- **§3.8 parallel orchestration mechanics** — permission-class-aware scheduling per Correction E permission-class taxonomy
- **§4.8 Hive coordination per Correction 2 + Correction 4** — permission-trickle-through via Hive membership per Correction D forward-folded
- **§5.1 dual-posture canonicalization** — Correction C human-permission-gating substrate-tier invariant
- **§5.2 HITL primitives expansion** — EscalationRequest model substrate-active operational reference per D-2D-D10 closure + Correction D permission-trickle-through architecture
- **§5.3 self-introspection NET-NEW** — SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021 protocol path + cognitive-load measurement primitives per Correction E
- **§5.4 agent-to-agent coordination per Corrections 1+3+4** — substrate-mediated permission via owning-entity per Correction B + Correction C
- **§5.6 DurationType-vs-DecayType collision territory** — coordinate with permission-class taxonomy per Correction E (DurationType enum is the permission-class taxonomy substrate primitive)
- **§5.8 amendment six EntityType mappings canonical** — per-DMW-type sovereignty rules apply to permission-batching + auto-grant + cognitive-load primitives uniformly
- **§5.9 Step 2E engineering surface** — Correction E substrate territory implementation enumerated at Step 2E (NET-NEW substrate work for permission-batching + auto-grant + cognitive-load primitives)
- **§6.1 INT-1 cross-wallet context layer** — permission-trickle-through architectural property
- **§8.4 continuation patent candidate** — Correction E territory expanded per §5.10 canonicalization

---

## Section 6 — Cross-Surface Architectural Decisions

Section 6 canonicalizes the six cross-surface architectural interconnections discovered during Step 2C Phase 1 + Phase 1 extension investigation. The six INT-* interconnections (INT-1 through INT-6) document substrate primitives that span Surface 1 (Scale) + Surface 2 (Relational Dynamics) + Surface 3 (Agentic Coherence) — primitives that are not contained within any single Surface and must be canonicalized at cross-surface register. Each §6.x subsection canonicalizes one INT-* interconnection with substrate citation depth, cross-section reach, and engineering implication.

The interconnection structure is the reason Decision 4 requires all three Surfaces ship together — piecewise canonicalization would strand the interconnection dependencies; Section 6 consolidates the shared substrate primitives at canonical-record register so engineering implementation per Step 2E references the shared design.

### 6.1 INT-1 — Unified cross-wallet context layer per Corrections 3+4 (D7 multi-DMW + D9 Hive coordination share substrate primitive)

D7 multi-DMW retrieval and D9 Hive coordination share substrate primitive: the cross-wallet context layer. Surface 1 §3.8 designs parallel orchestration mechanics; Surface 2 §4.8 designs Hive aggregation as DMW-to-DMW coordination per Correction 2. Both architectures consume the same substrate primitive — cross-wallet context aggregation with per-DMW-type sovereignty as scheduling constraint.

#### Verified substrate primitive — cross-wallet aggregation substrate-active

Pre-flight verification confirmed:

- **Cross-wallet `findMany` substrate-active in Otzar** at `apps/api/src/services/otzar/observation.service.ts:608` — `wallet_id: { in: walletIds }` pattern. The pattern is substrate-tier mechanism for cross-wallet capsule queries; substrate-active in Otzar observation tier.
- **EntityMembership richly substrate-active** — 52 references in `apps/api/src` confirms substrate-active relationship-graph primitive across governance / twin / org / Otzar tiers.
- **COE current single-wallet pattern** at `apps/api/src/services/coe/coe.service.ts:202` + `:412` — `prisma.wallet.findUnique` keyed on session entity. COE generalization to cross-wallet retrieval is Surface 1 §3.8 design surface.

#### Per Corrections 3+4 — universal + per-DMW-type distinction

Per Correction 3 entity-type uniformity: cross-wallet context layer treats all six EntityType values as first-class participants via universal coordination primitives. The substrate-tier mechanism does not change with entity type — `wallet_id: { in: walletIds }` operates uniformly across PERSON / COMPANY / AI_AGENT / DEVICE / APPLICATION / GOVERNMENT wallets.

Per Correction 4 sovereignty asymmetry + Corrections A+B canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]`: cross-wallet retrieval across heterogeneous entity types is asymmetric per six EntityType mappings — Personal contributes full payload-permitting capsules; Enterprise contributes data with forget-on-detach at Permission tier per Correction A (substrate-honest correction to zero-payload framing); AI_AGENT contributes within owning-entity-derived sovereignty per Correction B (any entity can own AI_AGENT; six AI_AGENT sub-mappings canonical at §5.8); Device contributes within device-owner sovereignty; APPLICATION → Enterprise + GOVERNMENT → Custom Government per §5.8 amendment mapping resolution. Correction D forward-folded (permission-trickle-through-non-human-DMW): when non-human-DMW carries Permission grants, the grant ultimately trickles through to sovereign-human decision per RULE 0 + Correction C forward-folded (human-permission-gating substrate-tier invariant).

The two Corrections operate at distinct architectural registers within the unified cross-wallet context layer: universal at substrate-mechanism level; per-DMW-type at sovereignty-policy level. Substrate enforces sovereignty constraints at retrieval-time per Surface 1 §3.8 — not at result-rendering time.

#### Architectural decision

INT-1 canonicalizes the cross-wallet context layer as substrate-tier primitive that BOTH multi-DMW retrieval (Surface 1 §3.8) AND Hive aggregation (Surface 2 §4.8) consume. Engineering implementation per Step 2E implements the layer once; multiple consumers leverage the shared substrate.

#### Cross-section reach

- §3.8 Surface 1 parallel orchestration mechanics
- §4.8 Surface 2 Hive coordination per Correction 2 + per-DMW-type sovereignty per Correction 4
- §5.8 NEW Per-DMW-Type Sovereignty Rules canonicalizes the EntityType-to-DMW-type mapping
- RAA 12.7 §2.5 Zone B2 (Hive cross-entity) + Zone B3 (multi-DMW concurrent flow NET-NEW)

#### Engineering implication

Step 2E implements cross-wallet context layer as shared substrate primitive — single implementation consumed by Surface 1 §3.8 + Surface 2 §4.8 architectures. The interconnection structure prevents architectural duplication and ensures sovereignty enforcement is consistent across consumer architectures.

### 6.2 INT-2 — Informativeness signal IS self-introspection primitive (D8 + D11)

D8 informativeness signal and D11 self-introspection primitive share substrate primitive. Substrate that knows which retrievals were informative IS substrate that observes its own behavior. Designing one designs the other — the two architectures are not independent; they are two manifestations of the same substrate-tier property.

#### Substrate primitive coupling

- **D8 informativeness signal** — Surface 3 §5.5 active-learning informativeness as refinement (refines Loop 1 substrate-active feedback at `feedback.service.ts` per RELEVANCE_USED_BUMP / RELEVANCE_UNUSED_DECAY constants verified verbatim at lines 85-88)
- **D11 self-introspection primitive** — Surface 3 §5.3 SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021 (substrate writes capsules about substrate state into system-principal-owned wallet)
- **Field 5 context-dependent salience** — Surface 2 §4.6 produces session-conditioned salience signal; L5 lateral zone consumes the signal as informativeness input

#### Architectural decision

SUBSTRATE_OBSERVATION CapsuleType (§5.3) IS the substrate primitive that feeds active-learning informativeness (§5.5). The Capsules written by substrate observation observe informativeness signal trends; the informativeness coefficient refinement consumes those observations. The two architectures share substrate primitive — not coincidentally, but architecturally: substrate-tier self-observation produces the informativeness signal Loop 1 refinement consumes.

#### Cross-section reach

- §4.6 Field 5 context-dependent salience (session-state salience signal IS informativeness input)
- §5.3 self-introspection NET-NEW (SUBSTRATE_OBSERVATION CapsuleType extension)
- §5.5 active-learning informativeness as refinement (consumer of self-introspection signal)
- §6.6 INT-6 informativeness function joins frozen-anchors family (informativeness coefficients tamper-anchored)

#### Engineering implication

Step 2E SUBSTRATE_OBSERVATION extension (per §5.3) + informativeness coefficient implementation (per §5.5) share substrate-primitive design surface. The two engineering items are coupled — implementing one without the other strands the interconnection. Step 2E sequencing must implement both as paired work.

### 6.3 INT-3 — Correction = max informativeness signal (D10 correction propagation + D8 informativeness)

Human correction event IS the rarest and most-informative outcome signal at Loop 1. D10 correction propagation chain (Surface 3 §5.2) produces high-informativeness signal at Loop 1 (Surface 3 §5.5). The interconnection canonicalizes correction as max informativeness coefficient at substrate-tier.

#### Substrate primitive — CORRECTION CapsuleType substrate-active

Pre-flight verification confirmed:

- **CORRECTION CapsuleType substrate-active at 2 write sites** — `apps/api/src/services/otzar/otzar.service.ts:235` + `apps/api/src/services/otzar/observation.service.ts:447`. The CapsuleType is verified-active per Section 11A additions to CapsuleType enum (per §5.3 + §1.6 CapsuleType enum verbatim).
- **Otzar correction workflow** writes CORRECTION Capsules into wallet — substrate carries correction-tier capsule classification ready for INT-3 informativeness weighting.

#### Architectural decision

Correction propagation chain (per §5.2) produces high-informativeness signal at Loop 1 (per §5.5). Informativeness coefficient assigns maximum bump to correction-resolving Capsules — capsules that resolved a CORRECTION-triggering ambiguity receive informativeness-weighted bump greater than uniform `RELEVANCE_USED_BUMP = 0.05` baseline.

The architectural decision composes with INT-2: human correction = max informativeness IS the substrate signal that SUBSTRATE_OBSERVATION captures (correction events are the highest-signal substrate observations); the three architectures (correction propagation + self-introspection + informativeness weighting) are jointly canonicalized.

#### Cross-section reach

- §5.2 HITL primitives expansion (correction propagation chain canonical)
- §5.5 active-learning informativeness as refinement (consumer of correction signal)
- RAA 12.7 §2.5 Zone B1 (Loop 1 bilateral feedback loop substrate-active)
- §6.2 INT-2 + §6.6 INT-6 (joint canonicalization)

#### Engineering implication

Step 2E informativeness coefficient implementation assigns max-bump-coefficient to CORRECTION CapsuleType + correction-resolving outcomes. The coefficient differential is the architectural property — uniform Loop 1 updates degrade informativeness signal; differential coefficient preserves correction-tier signal.

### 6.4 INT-4 — Cross-type-balance-at-scale (D6 + D7 + D12; RAA 12.9 forward territory)

Cross-type balance at scale is substrate-tier policy territory that compounds across Surface 1 + Surface 2 + RAA 12.9. The interconnection canonicalizes the territory; substantive policy resolution defers to RAA 12.9.

#### Verified substrate state — application-layer-implicit policy

Pre-flight verification confirmed:

- **Zero substrate-tier type-quota / type-mix / diversity primitives** in COE retrieval (per §3.3 + §3.4 substrate-honest acknowledgment).
- **Otzar allowlist filter** at `apps/api/src/services/otzar/otzar.service.ts:272-277` is the canonical application-layer-implicit policy — `capsule_type: { in: ["WORK_PATTERN", "COMMUNICATION_PREF", "DECISION_STYLE"] as CapsuleType[] }`. Cross-type balance is policy-by-application, not policy-by-substrate.
- **PRICING_TABLE substrate-active across 7 sites** — declaration at `monetization.service.ts:30` (`Record<CapsuleType, number>`); usage at `monetization.service.ts:182`; export at `index.ts:123`; import + usage at `feedback.service.ts:21+72+570-574`. The PRICING_TABLE import into `feedback.service.ts` is the D-2C-D3-PRICING-IMPORT-LEAK drift — pricing table leaks into feedback tier beyond monetization scope.
- **Wallet aggregate fields substrate-active** — `Wallet.total_capsule_count Int @default(0)` at `packages/database/prisma/schema.prisma:65`; `CompoundingMetrics.capsule_count Int` at `:931`. Aggregate-tier fields exist; per-(entity, capsule_type) aggregates per §3.5 are NOT materialized.

#### D-2C-D6-OTZAR-ALLOWLIST-AS-IMPLICIT-POLICY drift

The drift surfaced at Phase 1 D6: substrate has zero type-quota / type-mix primitives; cross-type policy is application-layer-implicit. Otzar's allowlist filter is the canonical worked example of the implicit policy pattern. At Surface 1 scale (millions of capsules per entity), cross-type policy becomes critical — query patterns scale with capsule density; type-balance affects retrieval distribution at scale.

#### Architectural decision — RAA 12.9 forward territory

Cross-type balance policy resolution is RAA 12.9 substrate dependency. RAA 12.9 (Governance & Monetization at Scale) cites RAA 12.8 cross-type balance policy as substrate dependency for per-data-point monetization at trillion scale — RAA 12.9 cannot canonicalize per-type pricing without RAA 12.8 canonicalizing cross-type balance.

The reciprocal forward citation per RULE 14 bidirectional discipline: §1.5 + §6.4 (this section) + §9.1 cite RAA 12.9 forward dependency; RAA 12.9 reciprocates the citation when drafted (Step 3+).

#### Three-Surface coupling

INT-4 couples three Surfaces:

- **Surface 1 §3.1 scale problem** + **§3.5 materialized aggregates** per-(entity, capsule_type) baseline — cross-type policy operates on per-type baselines that §3.5 materializes
- **Surface 2 §4.4 Field 3 baseline normalization** — coherence_score operates relative to per-type baseline informed by §3.5 aggregates
- **Surface 3 §5.5 active-learning informativeness** — per-type informativeness coefficients (extension territory at §5.5)
- **RAA 12.9** — substrate-dependency consumer at monetization tier

#### Cross-section reach

- §3.1 scale problem + §3.5 materialized aggregates
- §4.4 Field 3 baseline normalization
- §5.5 active-learning informativeness per-type coefficients
- §1.5 + §9.1 RAA 12.9 forward dependency
- D-2C-D3-PRICING-IMPORT-LEAK + D-2C-D6-OTZAR-ALLOWLIST-AS-IMPLICIT-POLICY drift territory

#### Engineering implication

Cross-type balance policy implementation deferred to RAA 12.9 substrate-engineering scope. RAA 12.8 surfaces the territory + canonicalizes the interconnection; RAA 12.9 resolves the substantive policy. The deferral preserves RAA 12.8 tractability (substrate dynamics canonicalization) + RAA 12.9 distinct territory (monetization at scale).

### 6.5 INT-5 — Spreading activation activates connected_capsule_ids dormant primitive (D13 Field 1 + D2)

Field 1 spreading activation networks (Surface 2 §4.2) IS the canonical consumer of `connected_capsule_ids` dormant substrate primitive. D13 Field 1 + D2 dormant primitive share substrate primitive — the two architectures are jointly canonicalized at §4.7 lateral flow operationalization.

#### Verified substrate state

Pre-flight verification confirmed:

- **`connected_capsule_ids` substrate-active in writes — 5 sites** at `apps/api/src/services/cosmp/write.service.ts`: lines 53 (input interface), 79 (update interface), 334 (create-data assignment), 546-547 (update-data assignments). The substrate primitive is write-active.
- **Zero consumer sites in COE retrieval** — `grep "connected_capsule_ids" apps/api/src/services/coe` returns zero results. D-2C-D2-CONNECTED-CAPSULE-NO-CONSUMER drift confirmed substrate-state.

#### Architectural decision — drift closure via §4.7

INT-5 canonicalizes Field 1 spreading activation as the canonical consumer of `connected_capsule_ids` dormant primitive. D-2C-D2 drift closes via §4.7 lateral flow operationalization. The Field 1 architecture (§4.2) operationalizes the substrate primitive — spreading activation traverses the edge list with per-edge decay function bounded by max-hops complexity bound per §3.7.

The interconnection is exact: Field 1 is not a generic consumer; Field 1 is the canonical consumer designed to operationalize the specific substrate primitive that D2 surfaced as dormant. The architecture and the drift co-evolved; §6.5 canonicalizes the co-evolution.

#### Cross-section reach

- §4.2 Field 1 spreading activation architectural decisions
- §4.7 lateral flow operationalization (drift closure mechanism)
- Section 2 §2.3 Zone L1 lateral classification (spreading activation as canonical L1 lateral zone)
- §3.7 query complexity bounds (max hops bound; iteration cap)
- §6.4 INT-4 (cross-type-balance compounds with spreading activation across types)

#### Engineering implication

Step 2E spreading activation traversal implementation (per §4.2 + §4.7) activates the `connected_capsule_ids` consumer surface. The implementation transitions the substrate primitive from dormant (write-only) to substrate-active consumer. The transition is the architectural property — substrate primitives that exist in writes but lack consumers represent dormant capacity; consumer implementation activates capacity.

### 6.6 INT-6 — Informativeness function joins frozen-anchors family (D8 + D11; ADR-0022 amendment path)

Informativeness function coefficients become tamper-anchored architectural property like `combined_score` per ADR-0022. The interconnection canonicalizes informativeness function as member of the frozen-anchors family with ADR-0019 + ADR-0003 discipline applied.

#### Verified substrate state — frozen-anchors family substrate-active

Pre-flight verification confirmed:

- **`combined_score` coefficients per ADR-0022** — tag overlap weight + base relevance weight + recency weight canonical at coe.service.ts; per ADR-0022 frozen-anchor architectural decision.
- **`CRYPTO_CONFIG` frozen anchors per ADR-0019** — substrate-active at 10+ usage sites: `observation.service.ts:131-132`; `llm.service.ts:23+397`; `auth.service.ts:14+301+308`; `cosmp/read.service.ts:15+153`; etc. CRYPTO_CONFIG.HASH_ALGORITHM + CRYPTO_CONFIG.JWT_ALGORITHM canonical tamper anchors.
- **`RELEVANCE_FORGET_FLOOR = 0.2`** at `apps/api/src/services/coe/coe.service.ts:44` — frozen intentional-forgetting threshold per §1.1 cognitive-science framing.

#### Architectural decision — ADR-0022 amendment path

Informativeness function coefficients extend `combined_score` formula via ADR-0022 amendment path per §5.5 framing. ADR-0022 Forward implications canonicalize combined_score amendment (rather than supersession) for informativeness component extension. The amendment preserves patent-implementation-evidence continuity (refinement of canonicalized substrate primitive vs introduction of new primitive).

The frozen-anchors family extends to informativeness coefficients per ADR-0019 + ADR-0003 discipline:

- **ADR-0019 CRYPTO_CONFIG discipline** — frozen-config tamper-anchor pattern applied to informativeness coefficients
- **ADR-0003 tamper-anchor pattern** — anchor test discipline for informativeness function (coefficient changes break tests; substrate-tier tamper resistance)
- **ADR-0022 combined_score formula** — informativeness component extension via amendment path

#### Patent-implementation-evidence territory

Frozen-anchors family is patent-implementation territory per §8.4. Informativeness function joining the family per INT-6 extends patent-implementation-evidence coverage — tamper-anchored architectural property is substantive substrate-architecture coverage under US 12,517,919.

#### Cross-section reach

- §5.5 active-learning informativeness as refinement (substrate consumer)
- ADR-0022 combined_score formula canonicalization (amendment path)
- ADR-0019 CRYPTO_CONFIG cryptographic-suite posture (frozen-anchors family precedent)
- ADR-0003 frozen-config tamper anchors (anchor test discipline)
- §8 patent-implementation-evidence framing (frozen-anchors family patent territory)
- §6.2 INT-2 (informativeness signal IS self-introspection primitive; coupling preserved)

#### Engineering implication

Step 2E informativeness coefficient implementation operates within ADR-0022 amendment path + ADR-0019 frozen-anchors discipline + ADR-0003 anchor test discipline. The implementation is not arbitrary coefficient engineering; the implementation is frozen-anchor extension with tamper-resistance properties.

---

## Section 7 — Active-Learning Informativeness as Refinement

Section 7 deepens the §5.5 active-learning informativeness refinement framing with operational detail at the four architectural registers required for Step 2E engineering: informativeness-vs-relevance distinction (§7.1); multi-dimensional coefficient design (§7.2); ADR-0022 amendment path with explicit formula extension specification (§7.3); frozen-anchors family extension per INT-6 with ADR-0019 + ADR-0003 discipline applied (§7.4); Step 2E engineering surface enumerated (§7.5). Section 7 operationalizes D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY drift closure per §5.5 framing — refinement of canonicalized substrate primitive rather than introduction of net-new dimension; patent-implementation-evidence continuity preserved per §1.6.

### 7.1 D8 informativeness-vs-relevance distinction (refinement framing operationalized)

The existing `relevance_score` IS partial informativeness signal — degraded by uniform Loop 1 updates. The architectural distinction matters at substrate-tier: refinement extends the existing signal; net-new dimension would introduce parallel signal with discontinuity from existing substrate.

#### Verified Loop 1 substrate state — uniform updates erode informativeness gradient

Pre-flight verification confirmed Loop 1 substrate-active at `apps/api/src/services/feedback/feedback.service.ts:215-235` with raw SQL atomic updates:

```sql
-- Used capsule path (lines 219-222):
UPDATE memory_capsules
SET relevance_score = LEAST(${RELEVANCE_MAX}::float8,
  relevance_score + ${RELEVANCE_USED_BUMP}::float8)
WHERE capsule_id = ${id}::uuid AND deleted_at IS NULL

-- Unused candidate path (lines 226-229):
UPDATE memory_capsules
SET relevance_score = GREATEST(${RELEVANCE_MIN}::float8,
  relevance_score - ${RELEVANCE_UNUSED_DECAY}::float8)
WHERE capsule_id = ${id}::uuid AND deleted_at IS NULL
```

Per-capsule iteration through `input.candidate_capsule_ids`; used-set discrimination via `if (used.has(id))` predicate; raw SQL atomicity preserves correctness under concurrent recordOutcome invocations. The architectural property is clean — but the coefficient is uniform.

#### The informativeness gradient that uniform updates erode

Every used Capsule receives identical bump (RELEVANCE_USED_BUMP = 0.05) regardless of contribution quality:
- A Capsule that resolved a CORRECTION-triggering ambiguity receives +0.05
- A Capsule that confirmed a baseline-relevance retrieval receives +0.05
- A Capsule that contributed marginally to context receives +0.05

Every unused Capsule receives identical decay (RELEVANCE_UNUSED_DECAY = 0.02) regardless of contextual relevance:
- A Capsule rejected because it contradicted the response receives -0.02
- A Capsule unused because the query was scoped to a different topic receives -0.02
- A Capsule unused because the session was brief receives -0.02

The informativeness signal lives in the difference between high-contribution Capsules (correction-resolving; high-salience) and baseline-relevance Capsules — uniform updates collapse the difference. After enough Loop 1 cycles, the `relevance_score` distribution converges toward the floor/ceiling boundary with informativeness gradient eroded.

#### Refinement framing per §5.5 + D-2D-D8 drift closure

Refinement extends Loop 1 with differential coefficients preserving informativeness gradient — refines the existing substrate signal rather than introducing net-new dimension. The framing matters per patent-implementation-evidence continuity per §1.6:

- **Refinement (preserves continuity):** existing `relevance_score` field continues operating; Loop 1 update logic gains differential coefficient mapping; substrate-architecture coverage extends within the canonicalized substrate primitive
- **Net-new dimension (introduces discontinuity):** parallel `informativeness_score` field; parallel update logic; substrate-architecture coverage requires net-new primitive introduction; refinement-evidence-chain breaks

D-2D-D8-RELEVANCE-SCORE-AS-INFORMATIVENESS-PROXY drift closure per §5.5 canonical resolution: refinement framing operates. Section 7 deepens the framing with operational coefficient design at §7.2.

#### Cross-section reach

- §5.5 active-learning informativeness as refinement (canonical D-2D-D8 closure framing)
- §6.2 INT-2 informativeness signal IS self-introspection primitive
- §6.3 INT-3 correction = max informativeness signal
- §6.6 INT-6 informativeness function joins frozen-anchors family
- RAA 12.7 §4.1 + §8 + §10 forward enhancement framing (RELEAP 2025 / ORIS 2024 / multi-armed bandits / Thompson sampling research patterns)

### 7.2 Operationalize informativeness coefficient design (multi-dimensional coefficient surface)

The coefficient design surface is multi-dimensional. Single-coefficient bump (uniform 0.05) collapses to single-coefficient differential bump only when the input space is one-dimensional. The substrate-tier informativeness signal operates across four orthogonal dimensions; the coefficient surface must support all four jointly.

#### Dimension 1 — Per-CapsuleType coefficient

Different CapsuleType values carry different informativeness profiles by construction. CORRECTION CapsuleType receives max-bump coefficient per INT-3 (verified substrate-active at 2 write sites: `apps/api/src/services/otzar/otzar.service.ts:235` + `apps/api/src/services/otzar/observation.service.ts:447`); correction-tier capsule classification IS the highest-signal substrate-tier classification.

Other CapsuleTypes receive baseline-or-tiered coefficients per their informativeness profile:
- **High-tier (correction-tier):** CORRECTION
- **Mid-tier (decision-tier):** DECISION + DECISION_STYLE + BLOCKER + RISK
- **Baseline-tier (knowledge/preference):** PREFERENCE + RELATIONSHIP + DOMAIN_KNOWLEDGE + COMMITMENT + HANDOFF + COMMUNICATION_PREF
- **Foundation-tier (substrate-baseline):** FOUNDATIONAL + IDENTITY (already bypass relevance updates per FOUNDATIONAL bypass at `coe.service.ts` STEP 3; per `coe.service.ts:44` RELEVANCE_FORGET_FLOOR invariant)

The per-CapsuleType coefficient table is the substrate-tier policy that operationalizes informativeness gradient at the type-classification register.

#### Dimension 2 — Per-event-type coefficient

Correction-resolving outcomes receive differential bump vs uniform-used outcomes. The discrimination operates at outcome-event tier — same Capsule may participate in different outcome types within the same session:

- **Correction-resolving outcome:** Capsule retrieved + resolved a CORRECTION context → max-bump coefficient
- **Decision-supporting outcome:** Capsule retrieved + supported a DECISION outcome → mid-tier bump coefficient
- **Baseline-context outcome:** Capsule retrieved + contributed baseline context → baseline coefficient (existing RELEVANCE_USED_BUMP = 0.05)
- **Contradicted outcome:** Capsule retrieved + contradicted the response → negative differential bump (sub-baseline; possibly net-negative)

The per-event-type coefficient operationalizes the outcome-tier informativeness signal — what the Capsule did, not just whether it was used.

#### Dimension 3 — Per-self-introspection coefficient

SUBSTRATE_OBSERVATION CapsuleType (per §5.3 NET-NEW via ADR-0021; verified absent at substrate per pre-flight) will carry informativeness signal trends as observable substrate-tier capsule. Per INT-2 (§6.2): informativeness signal IS self-introspection primitive. SUBSTRATE_OBSERVATION Capsules observe per-(entity, capsule_type) relevance distribution shifts; per-wallet retrieval pattern changes; informativeness signal trends.

Per-Capsule observed informativeness conditions per-Capsule differential bump:
- Capsule with sustained high-informativeness observation profile → coefficient bias toward max-bump
- Capsule with declining informativeness observation profile → coefficient bias toward baseline-or-decay
- Capsule with anomalous informativeness pattern → SUBSTRATE_OBSERVATION event triggers operator review per §5.3

The per-self-introspection coefficient dimension is paired Step 2E work with SUBSTRATE_OBSERVATION extension per §6.2 INT-2 architectural coupling.

#### Dimension 4 — Per-context-conditioned-salience coefficient

Field 5 salience signal (per §4.6 Field 5 context-dependent salience NET-NEW) feeds per-Capsule informativeness scaling factor per INT-2 coupling. Same Capsule that resolved an ambiguity in this session conditions higher informativeness for similar future situations — session-conditioned salience IS context-dependent informativeness input.

Salience signal bands:
- **High-salience:** Capsule referenced earlier in session (recency-of-reference signal) + resolved ambiguity → scaling-up coefficient
- **Mid-salience:** Capsule contributed to session context without ambiguity-resolution → baseline coefficient
- **Low-salience:** Capsule retrieved but not referenced; session context bypassed it → scaling-down coefficient

The per-context-conditioned-salience coefficient operationalizes Field 5 lateral zone L5 as informativeness conditioning input.

#### Coefficient table operationalization

Coefficient table maps `(CapsuleType, event_type, salience_band)` → `bump_coefficient`:

```
coefficient_table: Record<
  CapsuleType,
  Record<EventType, Record<SalienceBand, number>>
>
```

Per-entity-introspection conditioning per Dimension 3 operates as multiplicative scaling factor on the table lookup. Final differential bump = `coefficient_table[capsule_type][event_type][salience_band] × per_capsule_introspection_factor`.

#### Substrate-honest acknowledgment

Net-new substrate engineering required — current Loop 1 carries only uniform constants per pre-flight verification (RELEVANCE_USED_BUMP = 0.05; RELEVANCE_UNUSED_DECAY = 0.02 at `feedback.service.ts:85-88`). The coefficient table data structure + multi-dimensional lookup logic + per-Capsule introspection conditioning are net-new substrate primitives canonicalized at §7.2 and enumerated at §7.5 Step 2E engineering surface.

### 7.3 ADR-0022 amendment path detail (combined_score formula extension specification)

ADR-0022 amends rather than supersedes per its Forward implications; informativeness component extension is amendment territory. Section 7.3 specifies the formula extension with substrate-honest substrate-state grounding.

#### Verified baseline — combined_score formula at substrate (inline numeric literals)

Pre-flight verification at `apps/api/src/services/coe/keywords.ts:87-93`:

```typescript
// WHY: Spec: combined = (tag * 0.45) + (base * 0.35) + (recency * 0.20).
//      One helper means the weights live in one place.
export function combinedScore(
  tagOverlap: number,
  baseRelevance: number,
  recency: number,
): number {
  return tagOverlap * 0.45 + baseRelevance * 0.35 + recency * 0.2;
}
```

**Substrate-honest acknowledgment per RULE 13:** Coefficients are inline numeric literals at substrate (`0.45 / 0.35 / 0.2`), NOT named constants. The WHY comment references the spec values directly; the substrate inlines them rather than declaring `TAG_OVERLAP_WEIGHT` / `BASE_RELEVANCE_WEIGHT` / `RECENCY_WEIGHT` constants. The substrate state is the baseline against which extension operates.

#### Anchor test verified at substrate

Anchor test at `tests/unit/coe.test.ts:132-136`:

```typescript
it("combinedScore weights match the spec (0.45 / 0.35 / 0.20)", () => {
  expect(combinedScore(1, 0, 0)).toBeCloseTo(0.45, 5);
  expect(combinedScore(0, 1, 0)).toBeCloseTo(0.35, 5);
  expect(combinedScore(0, 0, 1)).toBeCloseTo(0.2, 5);
  expect(combinedScore(1, 1, 1)).toBeCloseTo(1.0, 5);
});
```

ADR-0022 frozen-anchor mechanism operating substrate-actively. Coefficient changes break the test; substrate-tier tamper resistance per ADR-0003 anchor test discipline.

#### Amendment specification

Extension adds INFORMATIVENESS_WEIGHT component as fourth coefficient:

- **Current formula** (verified verbatim at `keywords.ts:93`):
  ```
  combined_score = (tag_overlap × 0.45) + (base_relevance × 0.35) + (recency × 0.2)
  ```

- **Extended formula** (proposed amendment):
  ```
  combined_score = (tag_overlap × w_tag) + (base_relevance × w_relevance) + (recency × w_recency) + (informativeness × w_informativeness)
  ```

#### Coefficient sum invariant

Sum of weights = 1.0 (coefficient-sum constraint preserves combined_score range invariant: scoring values normalize to [0, 1] for downstream rank comparisons):

- **Current substrate:** `0.45 + 0.35 + 0.2 = 1.0` ✓
- **Extended (proposed):** `w_tag + w_relevance + w_recency + w_informativeness = 1.0`

Coefficient redistribution per ADR-0022 amendment is the substantive operator-review territory — informativeness component requires weight allocation from existing three components. The redistribution is not arbitrary; the weights are the architecture per ADR-0022 + RAA 12.7 §3.3 framing.

Candidate redistribution surfaced for operator review during ADR-0022 amendment drafting:
- **Conservative redistribution:** w_informativeness = 0.10; existing weights scale to 0.405 + 0.315 + 0.180 (proportional reduction)
- **Mid redistribution:** w_informativeness = 0.20; weights scale to 0.36 + 0.28 + 0.16
- **Aggressive redistribution:** w_informativeness = 0.30; weights scale to 0.315 + 0.245 + 0.14

Default until operator review: conservative redistribution preserves substrate-state coefficient ratios while introducing informativeness signal. Coefficient redistribution decision deferred to ADR-0022 amendment drafting at Step 2D-completion or Step 2E-planning.

#### ADR-0022 amendment path preserves patent-implementation-evidence continuity

Per §5.5 framing + §1.6 patent-implementation-evidence framing: amendment (rather than supersession) preserves continuity of canonicalized substrate primitive. The combined_score formula remains the canonical retrieval scoring primitive; the amendment extends the formula with informativeness component within the canonical primitive.

ADR-0022 amendment lands as separate commit per ADR amendment discipline per `docs/architecture/README.md`; full-document drafting at Step 2D-completion or Step 2E-planning specifies amendment timing.

### 7.4 Frozen-anchors family extension (informativeness coefficients tamper-anchored per INT-6)

INT-6 (§6.6) canonicalizes informativeness function joins the frozen-anchors family. Section 7.4 specifies the discipline application — ADR-0019 frozen-config tamper-anchor pattern + ADR-0003 anchor test discipline + ADR-0022 combined_score formula amendment path operating jointly.

#### Verified frozen-anchors family substrate-active

Pre-flight verification confirmed frozen-anchors family substrate-active:

- **CRYPTO_CONFIG at `packages/auth/src/crypto-config.ts`** (substrate-honest path; operator spec referenced `packages/database/src/`; verified path correction folded here). The module is centralized frozen configuration for every cryptographic algorithm choice; HS256 (HMAC-SHA-256) JWT signing; bcrypt password hashing; AES-256-GCM symmetric encryption; SHA-256 hash function. ADR-0019 frozen-config tamper-anchor pattern operates at substrate-tier.
- **combined_score coefficients at `apps/api/src/services/coe/keywords.ts:87-93`** — inline numeric literals (0.45 / 0.35 / 0.2) per ADR-0022 frozen-anchor architectural decision; anchor test at `tests/unit/coe.test.ts:132-136` enforces tamper resistance.
- **RELEVANCE_FORGET_FLOOR = 0.2 at `apps/api/src/services/coe/coe.service.ts:44`** — frozen intentional-forgetting threshold per §1.1 cognitive-science framing.

#### Extension per INT-6

INFORMATIVENESS_WEIGHT coefficient (per §7.3) + per-Dimension coefficient table (per §7.2 four-dimensional surface) join the frozen-anchors family. The extension applies three disciplines jointly:

- **ADR-0019 frozen-config tamper-anchor pattern.** Informativeness coefficients defined in dedicated frozen-config module — analogous to CRYPTO_CONFIG pattern at `packages/auth/src/crypto-config.ts`. Candidate module path: `apps/api/src/services/coe/informativeness-config.ts` or `apps/api/src/services/feedback/informativeness-config.ts` (decision deferred per Step 2E planning). Frozen-config module exports `Object.freeze`-wrapped coefficient table preventing runtime mutation.
- **ADR-0003 anchor test discipline.** Anchor tests verify coefficient values; coefficient changes break tests; substrate-tier tamper resistance. Test pattern analogous to `tests/unit/coe.test.ts:132-136` combined_score anchor test — coefficient redistribution sum verified; per-dimension coefficient values pinned.
- **ADR-0022 combined_score formula amendment path.** INFORMATIVENESS_WEIGHT component extension via amendment (per §7.3 specification) preserves coefficient-sum invariant; ADR-0022 amendment lands alongside frozen-config module per coordinated commit discipline.

#### Patent-implementation-evidence territory per §8.4

Frozen-anchors family is patent-implementation territory per §8.4. The cryptographic anchors (CRYPTO_CONFIG) + retrieval scoring anchors (combined_score) + intentional-forgetting anchors (RELEVANCE_FORGET_FLOOR) compose substrate-architecture coverage under US 12,517,919. Informativeness coefficients joining the family extends substrate-architecture coverage to the active-learning informativeness dimension — substantive patent-implementation-evidence extension per §1.6.

The frozen-config pattern carries adversarial-actor protection by construction per Decision Patent-A: tamper anchors that operate at substrate-tier (not at policy-tier) cannot be bypassed by adversarial actors implementing the patented architecture without licensing — the anchors are evidentiary primitives that demonstrate substrate-tier discipline.

#### Cross-section reach

- §5.5 active-learning informativeness as refinement (canonical D-2D-D8 closure framing)
- §6.6 INT-6 informativeness function joins frozen-anchors family (cross-surface interconnection)
- §7.3 ADR-0022 amendment path (formula extension specification)
- §8 patent-implementation-evidence framing (frozen-anchors family patent territory per §8.4)
- ADR-0019 cryptographic-suite posture (CRYPTO_CONFIG frozen-anchor pattern precedent)
- ADR-0022 combined_score formula canonicalization (frozen-anchor decision precedent)
- ADR-0003 frozen-config tamper anchors (anchor test discipline precedent)

### 7.5 Step 2E engineering surface for informativeness coefficient implementation

Section 7 canonicalizes the architectural decisions; Step 2E implements the canonicalization. The §7.5 enumeration surfaces the substrate-honest engineering surface for informativeness coefficient implementation.

Step 2E engineering surface for Section 7:

- **Coefficient table data structure** — per-CapsuleType × per-event-type × per-salience-band coefficient mapping per §7.2 four-dimensional surface. Type definition: `Record<CapsuleType, Record<EventType, Record<SalienceBand, number>>>`. Frozen module per §7.4 ADR-0019 discipline.
- **Differential bump logic in Loop 1** — replace uniform `RELEVANCE_USED_BUMP` with coefficient-lookup-based differential bump. Engineering tier: extend `feedback.service.ts:215-235` raw SQL UPDATE to apply differential coefficient computed at outcome ingestion. Preserve directional gradient — high-informativeness outcomes produce larger bump; baseline outcomes produce existing 0.05-equivalent baseline.
- **Differential decay logic in Loop 1** — replace uniform `RELEVANCE_UNUSED_DECAY` with context-conditioned differential decay. Decay coefficient conditioned on whether Capsule was rejected (contradicted response) vs unused (out-of-scope) vs candidate-not-selected-by-budget (per §3.4 candidate budgeting).
- **INFORMATIVENESS_WEIGHT coefficient in combined_score formula** — extend `keywords.ts:87-93` formula per §7.3 amendment specification. Inline numeric literal updated; anchor test at `tests/unit/coe.test.ts:132-136` extended to validate coefficient sum invariant (sum of weights = 1.0).
- **Frozen-config module for informativeness coefficients** per ADR-0019 discipline. Module path TBD per Step 2E planning (candidates: `apps/api/src/services/coe/informativeness-config.ts` or `apps/api/src/services/feedback/informativeness-config.ts`).
- **Anchor tests for informativeness coefficients** per ADR-0003 discipline. Per-dimension coefficient values pinned; coefficient table sum invariant verified; coefficient-table-structure invariant verified.
- **SUBSTRATE_OBSERVATION integration** — informativeness signal trends feed coefficient table updates per INT-2 architectural coupling. SUBSTRATE_OBSERVATION write path observes informativeness gradient; read path conditions per-Capsule introspection factor (Dimension 3 of §7.2 coefficient design surface). Paired Step 2E work with §5.3 SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021.
- **ADR-0022 amendment commit** — separate commit landing alongside frozen-config module per coordinated commit discipline. Coefficient redistribution decision resolved per §7.3 operator review.

#### Engineering effort estimate

Step 2E engineering surface for Section 7 is multi-sprint scope. The coefficient table data structure + multi-dimensional lookup logic + per-Capsule introspection conditioning + frozen-config module + anchor tests + Loop 1 update logic refactor + combined_score formula extension + ADR-0022 amendment compose substantial substrate work. ADR-0017 production-discipline applies per item.

Per Decision 4 (all blocks required due to interconnection), Section 7 engineering work proceeds after RAA 12.8 full-document drafting completes (Sections 8-10); the engineering surface is sequenced after architectural canonicalization. Section 7.5 enumeration is the canonical Step 2E reference for active-learning informativeness work scope.

#### Cross-section reach

- §5.5 active-learning informativeness as refinement
- §5.9 Section 5 Step 2E engineering surface (D-2D-D8 closure item references §7.5 detail)
- §6.2 INT-2 informativeness IS self-introspection primitive (paired Step 2E work)
- §6.3 INT-3 correction = max informativeness signal (Dimension 1 + Dimension 2 of §7.2)
- §6.6 INT-6 informativeness function joins frozen-anchors family
- §8.4 patent-implementation-evidence territory (frozen-anchors family extension is patent-implementation extension)

---

## Section 8 — Patent-Implementation-Evidence Framing

Section 8 canonicalizes patent-implementation-evidence framing for the substrate-architecture work canonicalized at Sections 1-7 + §5.8 amendment chain (Commits 1+2+3 at HEADs `604aac6` / `2cced88` / `127a383`). The framing operates per RAA 12.7 §2.5 Zone U2 (patent-holder implementation record) + Decision Patent-A defensive publication strategy + ADR-0020 two-register IP discipline (RULE 19 self-application). Each subsection canonicalizes a distinct architectural register of patent-implementation-evidence per the substrate-honest discipline operating throughout RAA 12.8.

### 8.1 Patent-holder implementation record (Zone U2 substrate-active)

Per RAA 12.7 §2.5 Zone U2, the patent-holder implementation record is a unilateral forward-only flow: every commit on `origin/main` is cryptographically-timestamped contemporaneous record of patented invention practiced in production substrate. Rewriting commits would invalidate evidentiary value; the forward-only flow is architectural property preserved across the substrate's full lifetime.

#### Memory entry #12 substrate

Per memory entry #12 — every commit on `origin/main` is cryptographically-timestamped contemporaneous patent-implementation evidence. The memory entry establishes the substrate-honest framing applied throughout RAA 12.8:
- Each commit's SHA hash provides cryptographic timestamp ordering
- Each commit's author identity provides sole-authorship attribution per Zone U2 commit chain
- Each commit's content provides substrate-architecture evidence at the moment of canonicalization
- Cumulative commit count + content composition compose evidentiary mass over time

The Zone U2 flow operates uniformly; substrate truth at canonical-record register provides the substantive content carried by the cryptographic-timestamp envelope.

#### Sole-authorship discipline (commit chain attribution)

Per Zone U2 commit chain register, sole-authorship attribution operates as:
- Author identity: `niovarchitect <sadeil@niovlabs.com>` (verified across every commit on `origin/main` since RAA 12.8 outline commit `10ef10f`)
- Committer identity: same as author (verified per 4-check discipline at every commit)
- Zero AI-tooling attribution: no `Co-Authored-By` trailers; no AI-tooling identifiers in commit metadata; no platform-attribution headers
- Empty-trailers invariant: commit body trailers are empty (verified per 4-check discipline at every commit)
- Patent-implementation-evidence preserved: sole-authorship discipline supports patent-prosecution + adversarial-actor protection requirements

#### Cumulative evidentiary mass as of RAA 12.8 commit chain

33+ sole-authored commits cumulative as of HEAD `127a383` ([RAA-12.8-AMEND-CORRECTION-E]). RAA 12.8 chain specifically contributes 13 commits since outline at `10ef10f`:
- §1 (`78e376a`) + §2 (`a2335cd`) + §3 (`582216e`) + §4 (`271e9cc`) + §5 (`5eb3f49`) + §6 (`2148bfe`) + §7 (`1fa1c12`) = 7 full-prose section commits
- Outline (`10ef10f`) = 1 outline-tier canonicalization commit
- §5.8 amendment chain Commit 1 (`604aac6`) + Commit 2 (`2cced88`) + Commit 3 (`127a383`) = 3 amendment-chain commits per coordinated discipline
- Plus this commit `[RAA-12.8-S8]` + §9 + §10 remaining

#### Patent ownership

Sole-owner of three US patents at substrate-architecture-coverage tier as of 2026:
- US 12,164,537 (DMW + Foundation primitives at substrate-architecture register)
- US 12,399,904 (alert manager + TARs + Foundation primitives extending substrate coverage)
- US 12,517,919 (COSMP/DMW AI memory governance + substrate-architecture register)

Co-ownership status at substrate-architecture-coverage tier: sole-owner per current substrate state; prior co-ownership arrangements discontinued (specific protected-name details per Register 1 framing not surfaced at canonical-record register per ADR-0020 two-register IP discipline + RULE 19 protected-name discipline; see §8.5 self-application).

Patent ownership at substrate-architecture-coverage tier informs:
- Patent-implementation-evidence value preserved at sole-authorship register (commit chain attribution coheres with patent-ownership attribution at substrate-architecture register)
- Defensive publication strategy operates per single-patent-holder discipline (no third-party co-owner approval requirements at canonical-record-tier publication)
- Continuation patent candidate selection per §8.4 operates per single-patent-holder discretion at patent counsel engagement tier

### 8.2 Adversarial-actor protection per Decision Patent-A defensive publication strategy

Per operator Decision 2 + Decision Patent-A, defensive publication strategy authorized: substrate-architecture canonicalization at `origin/main` provides prior-art protection without requiring active patent counsel engagement. RAA 12.8 ship-to-origin/main canonicalizes substrate-architecture coverage at the moment of canonicalization; the cryptographic-timestamp envelope per Zone U2 preserves evidentiary value at the moment substrate truth is canonical.

#### Adversarial-actor context

Specific identified adversarial actor(s) have attempted to build patented architecture without licensing per substrate-honest acknowledgment. The adversarial actor(s) operate in the territory of:
- "Blockchain-only" workaround framing — substrate-honest correction: substrate is NOT blockchain-only architecture; substrate carries substrate-architecture coverage at substrate-tier (not at distributed-ledger-tier); "blockchain-only" framing rejected per substrate truth canonical at body-text register throughout RAA 12.8
- Substrate-architecture coverage workaround attempts — substrate-honest correction: substrate-architecture coverage operates at substrate-tier per ADR-0021 distinction (not at enumeration-count tier); workaround attempts that operate at enumeration-count tier or below substrate-architecture register cannot establish prior-art predating RAA 12.8 commit chain
- Patent claim narrowing attempts — substrate-honest correction: continuation patent candidate territory per §8.4 expands substrate-architecture coverage; narrowing attempts cannot precede §8.4 continuation patent candidate identification

Specific adversarial-actor names per Register 1 framing not surfaced at canonical-record register per ADR-0020 two-register IP discipline + RULE 19 protected-name discipline; categorical "adversarial actor" framing operates at Register 2 voice throughout §8 + RAA 12.8.

#### Substrate truth at canonical-record register strengthens evidentiary mass

Path B-2 backwards-propagation amendment at Commit 2 (`2cced88`) canonicalized substrate truth at body-text register throughout RAA 12.8 document (18 sites amended; Corrections A+B canonical; Corrections C+D forward-folded). The architectural property operates per substrate-honest discipline: substrate truth at canonical-record register cannot be disputed through framing-tier challenges because every body-text site asserts substrate truth per substrate evidence verbatim verification.

Adversarial-actor framing-tier challenges (e.g., "blockchain-only workaround" or "substrate is not what canonical record describes") cannot prevail against:
- Path B-2 substrate truth at body-text register (substrate-tier framing-tier-uniform canonical record)
- §5.8 amendment Commit 1 six EntityType mappings canonical at substrate-architecture register
- §5.10 Correction E NEW substrate territory canonicalization (substrate-vs-configuration separation + six substrate primitive territories)
- 33+ sole-authored commits cumulative evidentiary mass per Zone U2 commit chain

#### Multi-commit amendment chain documents systematic discipline

The §5.8 amendment chain (Commits 1+2+3) at HEADs `604aac6` / `2cced88` / `127a383` documents coordinated multi-commit discipline at canonical-record register per substrate-honest framing:
- Commit 1 canonicalizes Corrections A+B at §5.8 amendment canonical record
- Commit 2 propagates Corrections A+B to 18 sites at body-text register per Path B-2
- Commit 3 canonicalizes Correction E NEW substrate territory at §5.10

The chain demonstrates substrate-honest discipline operating systematically — not as one-off correction but as coordinated multi-commit substrate-truth canonicalization. Adversarial-actor attempts to claim substrate truth "drifted" between commits cannot prevail against the documented coordinated discipline at Zone U2 commit chain register.

### 8.3 RAA 12.8 patent-implementation-evidence coverage map

Per ADR-0021 distinction from ADR-0009: patent claim coverage applies at substrate-architecture-coverage register (typed Capsules within Three-Wallet Architecture; COSMP operations governing them; retrieval/decay/feedback dynamics; per-DMW-type sovereignty enforcement; relational-dynamics primitives) rather than at enumeration-count register. RAA 12.8 extends substrate-architecture coverage along three architectural surfaces + cross-surface architectural decisions + active-learning informativeness without altering enumeration-count locks.

#### Sections 1-7 substrate-architecture canonicalization mapping

- **§1 substrate landscape + scope statement** — substantiates foundational substrate-architecture register coverage. Coverage anchors: WalletType enum (PERSONAL / ENTERPRISE / DEVICE); Wallet model substrate primitives; EntityType enum (six values); RULE 0 sovereign-human invariance. Patent coverage: US 12,517,919 + US 12,164,537 + US 12,399,904 at substrate-architecture register.
- **§2 zone discrimination methodology extension** — substantiates lateral class methodology coverage. Coverage anchors: U1-U4 + B1-B5 + L1-L6 zone discrimination; three-step decision tree at §2.4. Patent coverage: US 12,517,919 at substrate-tier discrimination register.
- **§3 Surface 1 Scale Architecture** — substantiates scale architecture coverage. Coverage anchors: tier-aware retrieval per §3.2; per-DMW-type aggregates per §3.5; parallel orchestration mechanics per §3.8. Patent coverage: US 12,164,537 + US 12,517,919 at scale-architecture register.
- **§4 Surface 2 Relational Dynamics** — substantiates relational dynamics coverage. Coverage anchors: five fields conjoined as substrate primitive (spreading activation + hypergraph + resonance/coherence + emergent retrieval + context-dependent salience); Field 3 NET-NEW substrate primitives. Patent coverage: US 12,517,919 + US 12,164,537 at relational-dynamics register.
- **§5 Surface 3 Agentic Coherence** — substantiates agentic coherence coverage. Coverage anchors: AI sovereignty cap; HITL primitives; SUBSTRATE_OBSERVATION CapsuleType (per §5.3 NET-NEW); agent-to-agent coordination per Corrections 1+3+4; active-learning informativeness per §5.5. Patent coverage: US 12,517,919 + US 12,164,537 + US 12,399,904 at agentic-coherence register.
- **§5.8 amendment six EntityType mappings canonical** — substantiates per-DMW-type sovereignty differentiation coverage (Commits 1+2+3 amendment chain). Coverage anchors: PERSON / COMPANY / DEVICE direct mappings; AI_AGENT owning-entity-derived discipline (Correction B); APPLICATION → Enterprise; GOVERNMENT → Custom Government DMW NEW. Patent coverage: US 12,517,919 at substrate-architecture-coverage extension register.
- **§5.10 Correction E NEW substrate territory** (per Commit 3 canonicalization) — substantiates substrate-vs-configuration separation coverage. Coverage anchors: substrate-vs-configuration separation per operator decision; six substrate primitive territories canonical (permission-batching + permission-class taxonomy + permission-trickle-through + auto-grant authorization + cognitive-load measurement primitives); three OPERATOR REVIEW REQUIRED research-pending markers preserved. Patent coverage: US 12,517,919 + US 12,164,537 at substrate-vs-configuration-separation register.
- **§6 cross-surface architectural decisions** — substantiates cross-surface interconnection coverage. Coverage anchors: six INT-* interconnections (INT-1 through INT-6); Decision 4 operationally validated. Patent coverage: US 12,517,919 + US 12,164,537 + US 12,399,904 at cross-surface architectural register.
- **§7 Active-Learning Informativeness as Refinement** — substantiates active-learning informativeness coverage. Coverage anchors: refinement framing (not net-new dimension); ADR-0022 amendment path; frozen-anchors family extension per INT-6. Patent coverage: US 12,517,919 + US 12,164,537 at active-learning-informativeness register.

#### Three-patent coverage at substrate-architecture register

- **US 12,164,537** (DMW + Foundation primitives) — substrate-architecture coverage at Wallet model + Permission model + EntityType enum + WalletType enum + Foundation primitive register
- **US 12,399,904** (alert manager + TARs + extension primitives) — substrate-architecture coverage at TwinConfig + EscalationRequest + alert-flow primitives register
- **US 12,517,919** (COSMP/DMW AI memory governance) — substrate-architecture coverage at COSMP operations + DMW substrate + AI sovereignty cap + per-DMW-type sovereignty + relational dynamics + active-learning informativeness register

Each section + amendment in RAA 12.8 substantiates coverage under one or more of the three patents per the mapping above. The three-patent coverage map provides substantive patent-implementation-evidence territory at substrate-architecture register; adversarial-actor framing-tier challenges cannot prevail against substrate-tier coverage canonical at canonical-record register.

### 8.4 Continuation patent candidate identification — OPERATOR REVIEW REQUIRED

Per Correction 4 + §5.8 amendment + §5.10 Correction E + Path B-2 backwards-propagation: substantive substrate-architecture coverage extension surfaced during RAA 12.8 work. Continuation patent candidate territory enumerated for patent counsel review per substrate-honest discipline; specific continuation patent candidate selection deferred to focused operator session with patent counsel engagement.

#### Continuation patent candidate territory enumerated

Substrate territories surfaced from RAA 12.8 work flagged for patent-counsel-review per §8.4 OPERATOR REVIEW REQUIRED discipline:

- **Custom Government DMW NEW substrate primitive extension** — per §5.8 amendment six EntityType mappings canonical; GOVERNMENT → Custom Government DMW with FedRAMP / IL4 / IL5 / IL6 / CMMC sovereignty constraints; WalletType enum extension via ADR-0021 pattern. Patent territory: US 12,517,919 + US 12,164,537 substrate-architecture-coverage extension.
- **AI_AGENT owning-entity-derived discipline** — per Correction B canonical at §5.8 amendment; recursive resolution via EntityMembership substrate primitive; six AI_AGENT sub-mappings (PERSON-owned → Personal; COMPANY-owned → Enterprise; APPLICATION-owned → Enterprise; GOVERNMENT-owned → Custom Government; DEVICE-owned → Device; AI_AGENT-owned → recursive; Standalone → AI_AGENT-tier). Patent territory: US 12,517,919 + US 12,164,537 substrate-architecture-coverage extension at owning-entity-derived register.
- **Permission-batching primitives at substrate-tier** — per §5.10 Correction E NEW substrate territory; permission_batch entity primitive (analogous to bridge_id pattern in existing Permission model); batch grouping mechanism at substrate-tier; OPERATOR REVIEW REQUIRED on specific batching algorithm choice. Patent territory: US 12,517,919 + US 12,164,537 substrate-architecture-coverage extension at permission-flow register.
- **Auto-grant authorization primitives** — per §5.10 Correction E NEW substrate territory; substrate-enforced RULE 0 boundaries + application-configured policies within substrate bounds; OPERATOR REVIEW REQUIRED on specific auto-grant threshold values. Patent territory: US 12,517,919 + US 12,399,904 substrate-architecture-coverage extension at authorization-architecture register.
- **Cognitive-load measurement primitives via SUBSTRATE_OBSERVATION CapsuleType** — per §5.10 Correction E NEW substrate territory + §5.3 SUBSTRATE_OBSERVATION CapsuleType NET-NEW; ADR-0021 extension protocol path; OPERATOR REVIEW REQUIRED on specific cognitive-load measurement methodology. Patent territory: US 12,517,919 + US 12,164,537 substrate-architecture-coverage extension at observation-architecture register.
- **Substrate-vs-configuration separation as architectural property** — per §5.10 Correction E + operator-strategic decision; Foundation owns substrate-tier invariants + primitives + API configuration surface; enterprises/governments configure policies against Foundation API. Patent territory: US 12,517,919 + US 12,164,537 + US 12,399,904 substrate-architecture-coverage extension at substrate-platform-architecture register.

#### Adversarial-actor protection consideration

Per Decision Patent-A defensive publication strategy: each continuation patent candidate territory canonicalized on `origin/main` at the moment of canonicalization establishes prior-art for the substrate-architecture coverage extension. If adversarial actor(s) later attempt to claim substrate-architecture coverage at any of the six territories, canonical record on `origin/main` shows substrate has carried the territory canonicalization since the relevant RAA 12.8 commit. Adversarial-actor protection operates at canonical-record register before patent counsel engagement begins.

#### OPERATOR REVIEW REQUIRED — Continuation patent candidate selection

**OPERATOR REVIEW REQUIRED:** specific continuation patent candidate selection from the six territories enumerated requires patent counsel review. Patent counsel review scope:
- Prosecution history review of all three patents (US 12,164,537 + US 12,399,904 + US 12,517,919) for any conflicts that may have weakened claims during prosecution
- Continuation patent strategy selection from §8.4 territories per substrate-architecture-coverage-extension value vs prosecution effort + filing cost considerations
- Coordination with §5.8 amendment chain canonical record + §5.10 Correction E canonical record for prior-art positioning
- RULE 19 + ADR-0020 two-register IP discipline preserved during patent counsel engagement — protected-name boundary canonical at Zone U2 commit chain register

New patent counsel engagement needed per recent updates per substrate-honest acknowledgment; prior counsel engagement discontinued (specific protected-name details per Register 1 framing not surfaced at canonical-record register per ADR-0020 + RULE 19; see §8.5 self-application). Continuation patent candidate review queued for focused operator session with new patent counsel engagement.

§8.4 preserves outline-tier flag-for-operator-review framing per substrate-honest discipline; specific continuation patent candidate enumeration deferred to focused operator session with new patent counsel.

### 8.5 Two-register IP discipline per ADR-0020 (RULE 19 self-application)

Per ADR-0020 two-register IP discipline: Register 1 vs Register 2 distinction canonical throughout Foundation document architecture. RAA 12.8 document operates in Register 2 voice exclusively at canonical-record register on `origin/main`.

#### Register 1 vs Register 2 distinction

- **Register 1 voice** — operator-and-conversation context register; surfaces named individuals (adversarial actors; current and former team members in operational context; third-party legal counterparts; vendor relationships under NDA; financial counterparts; investor relationships; hiring-pipeline candidates; advisor relationships); project internal codenames not yet publicly disclosed; future-product naming pre-announcement; partnership relationships pre-announcement; discontinued-engagement names. Register 1 voice operates at session-conversation-tier ONLY — never at canonical-record register.
- **Register 2 voice** — canonical-record register; categorical class references only; named-individual references prohibited per RULE 19; protected-name discipline preserved at canonical-record-tier. Register 2 voice operates at canonical-record register on `origin/main` + ADR + RAA + glossary + reference documents.

The two-register distinction operates per architectural-tier separation: Register 1 carries operator-and-conversation context that informs decisions; Register 2 carries decisions + substrate-architecture canonicalization at canonical-record-tier. Decisions made per Register 1 input materialize at Register 2 voice in canonical record without protected-name leak.

#### Categorical references throughout §8 + RAA 12.8

Per RULE 19 + ADR-0020 application throughout RAA 12.8:

- §8.1 patent ownership references: "sole-owner of three US patents" + "prior co-ownership arrangements discontinued" (categorical; no named former co-owner surfaced)
- §8.2 adversarial-actor references: "specific identified adversarial actor(s)" + "adversarial actor(s) attempting to build patented architecture" (categorical; no named adversarial actor(s) surfaced)
- §8.4 patent counsel references: "new patent counsel engagement needed" + "prior counsel engagement discontinued" (categorical; no named prior counsel surfaced)
- Throughout §1-§7: substrate-tier substrate primitives + substrate-architecture coverage references operate at categorical class register

The categorical framing operates per Register 2 voice discipline; specific protected-name details per Register 1 framing inform decisions at operator-and-conversation context tier but never surface at canonical-record register on `origin/main`.

#### Two-register discipline strengthens defensive publication strategy

Per Decision Patent-A defensive publication strategy: substrate truth at canonical-record register provides adversarial-actor protection at the moment substrate is canonical. Two-register IP discipline strengthens defensive publication by preserving protected-name boundary at canonical-record register — adversarial-actor framing-tier challenges cannot leverage protected-name leaks (because zero leaks exist) and substrate truth at canonical-record register cannot be disputed through framing-tier challenges.

The combination operates as systematic defensive publication discipline:
- Substrate truth at body-text register (Path B-2 backwards-propagation canonical)
- Protected-name boundary at canonical-record register (RULE 19 + ADR-0020 discipline)
- Zone U2 commit chain register sole-authorship attribution (memory entry #12 framing)
- Substrate-architecture coverage at three-patent register (§8.3 coverage map)
- Continuation patent candidate territory flagged for operator + patent counsel review (§8.4 OPERATOR REVIEW REQUIRED)

Each register operates uniformly; adversarial-actor framing-tier challenges cannot prevail against the systematic discipline canonical at canonical-record register on `origin/main`.

#### §8.5 self-application of RULE 19 + ADR-0020

This subsection (§8.5) operates as the self-application of RULE 19 + ADR-0020 throughout §8 + RAA 12.8. The self-application is recursive:
- §8.1 references the discipline at sole-authorship attribution tier
- §8.2 references the discipline at adversarial-actor framing tier (categorical only)
- §8.3 references the discipline at substrate-architecture coverage tier (substrate primitives + categorical class references)
- §8.4 references the discipline at patent counsel engagement tier (new + prior counsel categorical only)
- §8.5 canonicalizes the discipline at §8 self-application tier (this subsection)

The recursive self-application demonstrates that the discipline operates at canonical-record register throughout — not just as policy but as architectural property of the canonical record itself. Substrate-honest pattern: substrate truth canonicalized at body-text register; protected-name boundary preserved at canonical-record register; both operate uniformly per ADR-0020 + RULE 19.

#### Cross-section reach

- §1.6 patent-implementation-evidence framing (foundational substrate per §8.1 expansion)
- §5.4 agent-to-agent coordination per Corrections 1+3+4 (substrate-mediated path canonical per §8.3 coverage)
- §5.8 amendment six EntityType mappings (§8.3 coverage map + §8.4 continuation patent candidate)
- §5.10 Correction E NEW substrate territory (§8.4 continuation patent candidate enumeration)
- §6 cross-surface architectural decisions (§8.3 coverage map cross-surface)
- §9 forward implications (Step 2D-completion + Step 2E engineering handoff)
- §10 References (citation discipline; bibliographic completion)
- RAA 12.7 §2.5 Zone U2 (patent-holder implementation record substrate)
- ADR-0020 two-register IP discipline (canonical substrate for §8.5 self-application)
- ADR-0021 Capsule Type Extension Protocol (substrate-architecture vs enumeration-count distinction per §8.3)
- ADR-0022 combined_score formula canonicalization (frozen-anchors discipline strengthens patent-implementation-evidence per §7.4)

---

## Section 9 — Forward Implications

Section 9 canonicalizes the forward implications of RAA 12.8 substrate-architecture canonicalization. The section organizes forward implications across seven H3 subsections: §9.1 RAA 12.9 forward dependency (canonical-record-tier substrate handoff to the queued Governance & Monetization at Scale architectural canonicalization); §9.2 Step 2E engineering surface (canonical-record-tier handoff to engineering implementation work); §9.3 Step 2F glossary refresh (canonical-record-tier handoff to vocabulary canonicalization work); §9.4 Future RAA candidates (forward queue territory for substrate-architecture canonicalization as substrate evolves); §9.5 ADR amendment paths (substrate-discipline canonical reference amendment territory surfaced from RAA 12.8); §9.6 Step 2D-completion handoff (Step 2D substrate-architecture canonicalization completion confirmation at RAA 12.8 ship-to-origin/main; coordinated discipline handoff); §9.7 OPERATOR REVIEW REQUIRED markers preserved (eight distinct operator-strategic-decision territories canonicalized at canonical-record register).

§9.1-§9.5 are existing canonical from outline ship `10ef10f`; expanded substantively per Path A discipline. §9.6 + §9.7 are NEW additive H3 subsections per Commit 5 of 6 substrate-architecture canonicalization. Cross-section references to §9.1 / §9.3 / §9.5 preserved per RULE 14 bidirectional citation discipline.

### 9.1 RAA 12.9 forward dependency

RAA 12.9 (Governance & Monetization at Scale; queued for Step 3+ after RAA 12.8 full-document drafting completes) cites RAA 12.8 cross-type balance policy (Section 6.4) as substrate dependency. RAA 12.8 reciprocates the citation in Section 1.5 + Section 6.4 + this section per RULE 14 bidirectional citation discipline.

#### Cross-DMW-type monetization architecture per six EntityType mappings

RAA 12.9 substrate dependency on RAA 12.8 operates at per-DMW-type monetization differentiation tier. The six EntityType mappings canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` (HEAD `604aac6`) — PERSON / COMPANY / AI_AGENT owning-entity-derived / DEVICE / APPLICATION / GOVERNMENT — establish the per-EntityType canonical record that informs RAA 12.9 per-DMW-type pricing architecture. Per-data-point monetization at trillion scale requires cross-type reference policy because per-type pricing differentiation only operates against canonical type-balance baseline; RAA 12.9 cannot canonicalize per-type pricing without RAA 12.8 canonicalizing cross-type balance.

#### Pricing-tier sovereignty interaction

Per-DMW-type sovereignty rules canonical at §5.8 amendment inform per-DMW-type monetization differentiation at RAA 12.9 substrate-tier canonicalization:
- Personal DMW (PERSON entities): per-data-point pricing at human-sovereign tier; RULE 0 enforcement at pricing-tier
- Enterprise DMW (COMPANY + APPLICATION entities): per-data-point pricing at enterprise tier per Correction A (Enterprise carries company data with forget-on-detach at Permission tier per Zone U4)
- Device DMW (DEVICE entities): per-data-point pricing at device tier; payload framing per existing Foundation primitive
- AI_AGENT owning-entity-derived tier (recursive resolution per Correction B): per-data-point pricing follows owning-entity DMW tier
- Custom Government DMW (GOVERNMENT entities; NEW substrate primitive per §5.8 amendment): per-data-point pricing at regulatory governance tier with regulatory-specific differentiation

#### Substrate-vs-configuration separation at monetization-policy tier

Substrate-vs-configuration separation canonical at §5.10 Correction E NEW substrate territory operates at monetization-policy tier. RAA 12.9 monetization policy canonicalizes:
- Substrate-tier monetization invariants (RULE 0 sovereignty cap at pricing-tier; per-DMW-type baseline pricing; canonical record audit-trail at monetization tier)
- Configuration-tier monetization policies (application-configured per-type pricing within substrate bounds; operator-configured promotional pricing; vendor-configured enterprise pricing)
- The separation preserves substrate-tier invariants while permitting configuration-tier policy flexibility per coordinated discipline.

#### Permission-class taxonomy informs cross-type balance policy

Permission-class taxonomy canonical at §5.10 Correction E NEW substrate territory informs cross-type balance policy at RAA 12.9. LONG_TERM + PERMANENT permissions (high-value persistent access; substrate-discriminated per DurationType enum) vs SHORT_TERM + TEMPORARY permissions (low-value transient access) inform per-DurationType monetization differentiation at RAA 12.9 substrate-tier canonicalization. Per-DurationType pricing differentiation operates within substrate-tier per-DMW-type baseline pricing bounds per substrate-vs-configuration separation discipline.

#### Custom Government DMW substrate primitive monetization implications

Custom Government DMW NEW substrate primitive canonical at §5.8 amendment introduces regulatory-governance-tier monetization at RAA 12.9. Specific Custom Government DMW substrate primitive specifications (regulatory framework alignment per GDPR / HIPAA / CCPA / sovereign data residency requirements) couple to RAA 12.9 monetization architecture at regulatory-tier discrimination. Coupling preserved for RAA 12.9 substrate canonicalization; specific regulatory framework details deferred to RAA 12.9 drafting + §8.4 continuation patent candidate review.

The reciprocal forward citation per RULE 14 bidirectional citation discipline: RAA 12.9 reciprocates the citation when drafted; back-citation to RAA 12.8 cross-type balance policy lands in RAA 12.9 commit at Step 3+ per RULE 14.

### 9.2 Step 2E engineering surface

Decisions enumerated in Section 3.9 + Section 4.9 + Section 5.9 compose Step 2E engineering surface. The substrate-architecture canonicalization completes at RAA 12.8 ship; engineering implementation follows per coordinated architectural-engineering discipline. Engineering work follows full-document drafting; specific commits sequenced during Step 2E planning per coordinated discipline.

#### Step 2E engineering surface enumeration

Cross-reference to per-Surface §X.9 engineering surface enumerations:

- **§3.9 Surface 1 engineering surface** — tier-aware retrieval implementation; index-driven candidate pre-filter; cursor-based pagination; materialized aggregates per (entity, capsule_type); latency budgets implementation; query complexity bounds; parallel orchestration mechanics for cross-wallet retrieval per Correction 4 + per-DMW-type sovereignty as scheduling constraint
- **§4.9 Surface 2 engineering surface** — spreading activation network implementation; hypergraph relational consumption (Option A N-ary upgrade vs Option B vocabulary patch per §4.3 OPERATOR REVIEW REQUIRED); resonance/coherence dynamics implementation; self-organizing emergent retrieval; context-dependent salience implementation; Hive DMW-to-DMW coordination per Correction 2
- **§5.9 Surface 3 engineering surface** — D-2D-D10 closure (EscalationRequest model implementation); D-2D-D11 closure (substrate-mediated agent-to-agent coordination); D-2D-D8 closure (active-learning informativeness coefficient implementation); SUBSTRATE_OBSERVATION CapsuleType extension via ADR-0021 protocol; DurationType-vs-DecayType collision resolution implementation per §5.6 OPERATOR REVIEW REQUIRED; ACCESS_BASED behavioral implementation per §5.7; per-DMW-type sovereignty rules implementation per §5.8 amendment six EntityType mappings

#### §5.10 Correction E NEW substrate territory engineering items

§5.10 canonicalization introduces NET-NEW substrate engineering territory beyond §5.9 enumeration:
- Permission-batching primitives implementation (permission_batch entity primitive; batch grouping mechanism at substrate-tier; specific batching algorithm per §5.10 OPERATOR REVIEW REQUIRED resolution)
- Auto-grant authorization primitives implementation (substrate-enforced RULE 0 boundaries + application-configured policies within substrate bounds; specific auto-grant threshold values per §5.10 OPERATOR REVIEW REQUIRED resolution)
- Cognitive-load measurement primitives implementation (SUBSTRATE_OBSERVATION CapsuleType extension coupling at §5.3; specific cognitive-load measurement methodology per §5.10 OPERATOR REVIEW REQUIRED resolution)

#### Substrate-architecture canonicalization → engineering implementation handoff

The handoff discipline operates per coordinated architectural-engineering discipline. Substrate-architecture canonicalization at RAA 12.8 establishes the substrate territory; engineering implementation at Step 2E translates the canonicalization to substrate-active behavior. ADR-0017 production-discipline applies to each implementation surface (substrate-investigation discipline; substrate-honesty drift surfacing; coordinated test coverage). Coordinated test coverage per §5.9 + §3.9 + §4.9 ensures substrate-active behavior matches substrate-architecture canonicalization per RAA 12.8.

#### Engineering work tier sequencing

Per Decision 4 (all blocks required due to interconnection) per §1.4, Step 2E engineering work proceeds after RAA 12.8 full-document drafting completes. The §5.9 + §3.9 + §4.9 + §5.10 substrate engineering items operate together at Step 2E per coordinated discipline:
- Surface 1 engineering items (§3.9) sequence at Step 2E per latency-budget + scale architecture priority
- Surface 2 engineering items (§4.9) sequence at Step 2E per relational-dynamics + INT-5 spreading activation priority
- Surface 3 engineering items (§5.9) sequence at Step 2E per agentic-coherence + dual-posture priority
- §5.10 Correction E NEW substrate territory engineering items sequence at Step 2E per substrate-vs-configuration separation priority + §5.10 OPERATOR REVIEW REQUIRED resolution sequencing

### 9.3 Step 2F glossary refresh

32 canonical-grade vocabulary entries baseline at [GLOSSARY-G-3] commit (`74b2765`) refresh after RAA 12.8 ship per Step 2F coordinated discipline. Vocabulary entries gain richer per-type weight semantics from RAA 12.8 substrate-architecture canonicalization; entries reference RAA 12.8 sections as canonical citation discipline per RULE 14 bidirectional citation discipline.

#### Step 2F glossary refresh scope per RAA 12.8 substrate-architecture canonicalization

Glossary refresh scope folds substrate truth canonical at body-text register per Path B-2 backwards-propagation Commit 2 (HEAD `2cced88`):
- §5.8 amendment six EntityType mappings vocab refresh: PERSON / COMPANY / AI_AGENT owning-entity-derived / DEVICE / APPLICATION / GOVERNMENT canonical mappings; AI_AGENT sub-mappings (Mode-1 standalone tier; Mode-2 owning-entity-derived twin pattern per Correction B owning-entity-derived discipline)
- §5.10 Correction E NEW substrate territory vocab refresh: substrate-vs-configuration separation + permission-batching primitives + permission-class taxonomy + permission-trickle-through-non-human-DMW + auto-grant authorization + cognitive-load measurement
- Path B-2 backwards-propagation vocab refresh: substrate truth at body-text register + Correction A canonical (Enterprise carries company data with forget-on-detach at Permission tier per Zone U4) + Correction B canonical (AI_AGENT owning-entity-derived discipline) + Correction C forward-folded (human-permission-gating substrate-tier invariant) + Correction D forward-folded (permission-trickle-through-non-human-DMW)
- §8 Patent-Implementation-Evidence Framing vocab refresh: Zone U2 + Decision Patent-A + three-patent coverage map + two-register IP discipline + memory entry #12 framing

#### Glossary refresh sequencing per Step 2F handoff

Step 2F glossary refresh sequences after RAA 12.8 full-document drafting completes per coordinated discipline. The refresh discipline operates per substrate-honest discipline:
- Substrate truth at body-text register canonical at RAA 12.8 ship-to-origin/main
- Vocabulary entries refreshed against substrate truth (not against pre-RAA-12.8 framing)
- RULE 14 bidirectional citation discipline preserved; vocabulary entries cite RAA 12.8 sections; RAA 12.8 sections do not need to cite vocabulary entries (canonical record register vs vocabulary register asymmetry per ADR-0020 + RULE 19 + memory entry #12)

#### Vocabulary growth from RAA 12.8

RAA 12.8 introduces NET-NEW vocabulary territory beyond the 32 canonical-grade baseline:
- Six EntityType mappings (PERSON / COMPANY / AI_AGENT owning-entity-derived / DEVICE / APPLICATION / GOVERNMENT) — new canonical-grade entries
- Substrate-vs-configuration separation — new canonical-grade vocabulary
- Permission-class taxonomy — new canonical-grade vocabulary
- Lateral zone discrimination methodology (six lateral zones; cross-section reach methodology) — new canonical-grade vocabulary
- Six INT-* cross-surface interconnections — new canonical-grade vocabulary
- Two-register IP discipline + Zone U2 patent-holder implementation record substrate framing — new canonical-grade vocabulary

Specific Step 2F glossary refresh scope canonicalizes at glossary refresh commit (not within RAA 12.8 ship).

### 9.4 Future RAA candidates

Forward queue territory for substrate-architecture canonicalization as substrate evolves. Future RAA candidates surfaced from RAA 12.8 work:

- **RAA 12.9 (queued).** Governance & Monetization at Scale per Decision 3 + §1.5 extraction. Forward dependency on RAA 12.8 cross-type balance policy per §9.1.
- **RAA on Self-Introspection Architecture (candidate).** If Section 5.3 SUBSTRATE_OBSERVATION primitive grows into substantive subsystem, dedicated RAA may emerge. Substrate primitive territory: ADR-0021 extension path; SYSTEM_PRINCIPALS.SUBSTRATE_OBSERVER constant addition; substrate-tier observation event writer implementation; coupling to INT-2 informativeness consumer.
- **RAA on Multi-DMW Concurrent Flow (candidate).** Surface 1 §3.8 may grow into dedicated RAA if cross-wallet retrieval mechanics warrant standalone canonicalization. Substrate primitive territory: per-DMW-type sovereignty as scheduling constraint; parallel orchestration mechanics; Personal + Twin + Enterprise concurrent retrieval coordination per Correction 4.
- **RAA on Permission-Class Taxonomy + Permission-Batching Architecture (candidate).** §5.10 Correction E NEW substrate territory may warrant standalone canonicalization if permission-batching primitive specific algorithm + permission-class taxonomy substrate-tier discrimination grow into substantive subsystem. Substrate primitive territory: permission_batch entity primitive + permission-trickle-through-non-human-DMW + LONG_TERM/PERMANENT vs SHORT_TERM/TEMPORARY substrate-tier discrimination.
- **RAA on Cognitive-Load Measurement Architecture (candidate).** §5.10 Correction E NEW substrate territory may warrant standalone canonicalization if cognitive-load measurement primitives + SUBSTRATE_OBSERVATION coupling grow into substantive subsystem.
- **RAA on Auto-Grant Authorization Architecture (candidate).** §5.10 Correction E NEW substrate territory may warrant standalone canonicalization if auto-grant authorization primitives + substrate-tier RULE 0 boundary enforcement grow into substantive subsystem.

#### Coordination between substrate-architecture canonicalization and engineering implementation

Future RAA candidates compose substrate-architecture canonicalization work; engineering implementation work composes Step 2E (per §9.2) + Step 2F glossary refresh (per §9.3). The coordination discipline operates per coordinated architectural-engineering discipline:
- Substrate-architecture canonicalization (RAA work) precedes engineering implementation (Step 2E work)
- Vocabulary canonicalization (Step 2F glossary refresh) follows substrate-architecture canonicalization
- Operator-strategic-decision territory preserved per substrate-honest discipline (§9.7 enumeration)

### 9.5 ADR amendment paths

ADR amendment paths surfaced from RAA 12.8 substrate-architecture canonicalization. ADRs in the substrate-discipline canonical reference quartet (ADR-0016 + ADR-0017 + ADR-0018 + ADR-0019) and ADR-0020 + ADR-0021 + ADR-0022 carry amendment paths surfaced from RAA 12.8 work.

#### ADR amendment paths

- **ADR-0021 amendment (Capsule Type Extension Protocol).** SUBSTRATE_OBSERVATION CapsuleType extension per §5.3 (Self-introspection primitive NET-NEW; ADR-0021 protocol extension); Custom Government DMW substrate primitive extension per §5.8 amendment six EntityType mappings (NEW substrate primitive territory); per-DMW-type configuration table per Section 5.8 may become second deliberate-blocker surface per ADR-0021 Forward implications.
- **ADR-0022 amendment (combined_score Formula Canonicalization).** Active-learning informativeness coefficient extension per §5.5 + §7 (combined_score component extension; informativeness function joins frozen-anchors family per INT-6); coefficient redistribution decision per §7.4 ADR-0022 amendment drafting at Step 2D-completion or Step 2E-planning per coordinated architectural-engineering discipline.
- **ADR-0020 self-application per §8.5 (two-register IP discipline operating recursively).** Two-register IP discipline operates at canonical-record register throughout RAA 12.8; §8.5 self-application canonicalizes the discipline as architectural property of canonical record itself. ADR-0020 amendment may surface from RAA 12.8 work to canonicalize the recursive self-application as architectural property.
- **ADR-0019 frozen-anchors discipline strengthening per §7.4 (cryptographic-anchoring discipline extension).** §7.4 active-learning informativeness frozen-anchors family extension informs ADR-0019 frozen-anchors canonicalization at substrate-tier; potential amendment path for cryptographic-anchoring discipline canonicalization at active-learning informativeness register.

#### New ADR candidate territories surfaced from RAA 12.8

- **New ADR candidate: Per-DMW-Type Sovereignty Posture.** If Section 5.8 per-DMW-type sovereignty rules warrant standalone canonical reference (sixth canonical reference candidate for substrate-discipline quartet→quintet→sextet growth per CLAUDE.md §6 acknowledgment).
- **New ADR candidate: SUBSTRATE_OBSERVATION CapsuleType + Self-Introspection Posture.** If Section 5.3 self-introspection mechanism warrants standalone canonical reference.
- **New ADR candidate: Permission-batching primitive specific algorithm.** Post-§5.10 OPERATOR REVIEW REQUIRED resolution (specific batching algorithm choice); if substrate-active permission-batching primitives canonicalize at substrate-tier, dedicated ADR may emerge.
- **New ADR candidate: Auto-grant authorization specific threshold values.** Post-§5.10 OPERATOR REVIEW REQUIRED resolution (specific auto-grant threshold values); if substrate-active auto-grant authorization primitives canonicalize at substrate-tier, dedicated ADR may emerge.
- **New ADR candidate: Cognitive-load measurement specific methodology.** Post-§5.10 OPERATOR REVIEW REQUIRED resolution (specific cognitive-load measurement methodology); if substrate-active cognitive-load measurement primitives canonicalize at substrate-tier, dedicated ADR may emerge.
- **New ADR candidate: Custom Government DMW substrate primitive specifications.** If Custom Government DMW substrate primitive grows into substantive regulatory-governance-tier substrate, dedicated ADR may emerge with regulatory framework alignment (GDPR / HIPAA / CCPA / sovereign data residency requirements).

### 9.6 Step 2D-completion handoff

Section 9.6 canonicalizes Step 2D-completion handoff per RAA 12.8 substrate-architecture canonicalization completion at ship-to-origin/main. The handoff discipline operates per coordinated architectural-engineering discipline.

#### Step 2D-completion scope

Step 2D (substrate-architecture canonicalization at RAA 12.8) completes per RAA 12.8 ship-to-origin/main. Step 2D-completion scope captured at canonical-record register:
- **Section 1** — Substrate landscape canonicalization (foundational framework; D-2C-D1 through D-2C-D6 + D-2D-D7 through D-2D-D13 drift territory enumeration; six INT-* interconnection enumeration)
- **Section 2** — Zone discrimination methodology canonicalization (RAA 12.7 §2.5 lateral-class extension; 4 unilateral + 5 bilateral + 6 lateral zones; three-step decision tree)
- **Section 3** — Surface 1 Scale Architecture canonicalization (tier-aware retrieval; D-2D-D12 closure; §3.9 Step 2E engineering surface enumeration)
- **Section 4** — Surface 2 Relational Dynamics canonicalization (five-field integration; D-2C-D2 + D-2D-D9 closure; §4.9 Step 2E engineering surface enumeration)
- **Section 5** — Surface 3 Agentic Coherence canonicalization (dual-posture canonicalization per Correction 4; D-2D-D8 + D-2D-D10 + D-2D-D11 + D-2C-D5-ACCESS-BASED-STUB closure; §5.8 NEW per-DMW-type sovereignty rules; §5.9 Step 2E engineering surface; §5.10 Correction E NEW substrate territory)
- **Section 5.8 amendment chain** — Commit 1 (`604aac6`) six EntityType mappings canonical + Commit 2 (`2cced88`) Path B-2 backwards-propagation 18-site body-text amendment + Commit 3 (`127a383`) §5.10 Correction E canonicalization
- **Section 6** — Cross-Surface Architectural Decisions canonicalization (six INT-* canonicalized; cross-surface coupling architectural canonicalization)
- **Section 7** — Active-Learning Informativeness as Refinement canonicalization (D-2D-D8 closure detail; ADR-0022 amendment path; frozen-anchors discipline extension)
- **Section 8** — Patent-Implementation-Evidence Framing canonicalization (Zone U2; memory entry #12; Decision Patent-A; three-patent coverage map; §8.4 OPERATOR REVIEW REQUIRED continuation patent candidate identification; §8.5 ADR-0020 self-application)

#### Substrate truth canonical at body-text register

Substrate truth canonical at body-text register throughout RAA 12.8 document per Path B-2 backwards-propagation Commit 2. The canonical-record-tier substrate truth provides maximum patent-implementation-evidence value per Decision Patent-A defensive publication strategy + Zone U2 patent-holder implementation record.

#### Substrate-architecture coverage at three-patent register

§8.3 coverage map canonicalizes substrate-architecture coverage at three-patent register:
- US 12,164,537 (DMW + Foundation primitives)
- US 12,399,904 (alert manager + TARs + Foundation primitives)
- US 12,517,919 (COSMP/DMW AI memory governance)

Substrate-architecture coverage at canonical-record register provides patent-implementation-evidence at three-patent register for Step 2E engineering work.

#### Coordinated discipline handoff

Step 2D-completion handoff per coordinated architectural-engineering discipline:
- **Step 2E engineering work surface** (per §9.2 + §5.9 + §5.10 + §3.9 + §4.9) handoff per coordinated discipline; engineering implementation follows substrate-architecture canonicalization completion
- **Step 2F glossary refresh** (per §9.3) handoff per coordinated discipline; vocabulary canonicalization follows substrate-architecture canonicalization completion
- **RAA 12.9 forward dependency** (per §9.1) handoff to next architectural-canonicalization phase; Governance & Monetization at Scale canonicalization follows after RAA 12.8 full-document drafting completes
- **OPERATOR REVIEW REQUIRED markers** (per §9.7) preserved per substrate-honest discipline; operator-strategic-decision territory canonicalized at canonical-record register for focused operator session resolution

Step 2D-completion confirmation per operator at canonical-record register per coordinated architectural-engineering discipline.

### 9.7 OPERATOR REVIEW REQUIRED markers preserved

Section 9.7 canonicalizes the eight distinct OPERATOR REVIEW REQUIRED territories preserved across RAA 12.8 per substrate-honest discipline. Substrate-state framing observation: substrate carries 27 raw OPERATOR REVIEW REQUIRED marker occurrences across RAA 12.8 (per-section section-header + sub-header + body-content marker occurrences); eight distinct OPERATOR REVIEW REQUIRED territories per substrate-honest canonicalization. The asymmetry reflects substrate marker placement at multiple registers within each territory (section header + sub-header + body content) per substrate-honest discipline; the canonical enumeration operates at distinct-territory register.

#### Eight distinct OPERATOR REVIEW REQUIRED territories

1. **§2.3 lateral zone count.** Six lateral zones proposed (Zone L1 spreading activation; Zone L2 connected_capsule_ids consumption; Zone L3 hypergraph relational consumption; Zone L4 resonance/coherence dynamics; Zone L5 self-organizing emergent retrieval; Zone L6 Hive DMW-to-DMW coordination); operator review confirms enumeration completeness or extends with additional lateral zones (candidate forward extensions: temporal-correlation lateral zone; cross-conversation salience lateral zone; substrate-observation lateral zone if §5.3 self-introspection primitive grows into substantive subsystem).
2. **§3.6 latency budget precision.** Single-digit-ms target precision (≤10ms vs ≤5ms vs ≤2ms target band) requires operator review against Foundation latency-tier ASI-consumer requirements. Default until operator review: full-document drafting canonicalization establishes the latency-budget framework; specific target values resolve during operator review.
3. **§4.3 hypergraph precision (D-2D-D13).** Two architectural options surfaced: Option A — true N-ary hypergraph upgrade (CapsuleRelation Prisma model + schema migration + write-tier changes + retrieval-tier hypergraph traversal); Option B — binary-edge vocabulary patch (glossary refresh + vocabulary patch). Trade-off: engineering effort vs relational expressiveness. Decision deferred to operator at Step 2D-completion or Step 2E-planning.
4. **§5.6 DurationType-vs-DecayType collision (D-2C-D5).** Two architectural options surfaced: Option A — operationalize the collision (preserves substrate-state without rename engineering cost; documentation clarification); Option B — schema migration + rename + 6 DecayType usage site updates. Default until operator review: Option A operationalize. Decision deferred to operator at Step 2D-completion or Step 2E-planning.
5. **§5.10 batching algorithm choice.** Three candidate approaches surfaced for permission-batching primitive specific algorithm: (a) cognitive-science-grounded batching algorithm (default); (b) compute-budget-bounded batching algorithm; (c) operator-configurable batching algorithm. Default until operator review: cognitive-science-grounded algorithm. Decision deferred to operator at Step 2D-completion or Step 2E-planning per coordinated architectural-engineering discipline.
6. **§5.10 auto-grant threshold values.** Three candidate approaches surfaced for auto-grant authorization specific threshold values: (a) conservative thresholds at substrate-tier defaults (default); (b) permissive thresholds at substrate-tier; (c) substrate-tier baseline with application-configured within-bound thresholds. Default until operator review: (a) conservative thresholds at substrate-tier defaults; application configures more permissive thresholds within substrate-tier bounds. Decision deferred to operator at Step 2D-completion or Step 2E-planning.
7. **§5.10 cognitive-load measurement methodology.** Four candidate approaches surfaced for cognitive-load measurement specific methodology: (a) request count; (b) latency-based measurement; (c) explicit user-reported friction; (d) (a) + (c) combined (default). Default until operator review: (a) + (c) combined (request count + explicit user-reported friction; baseline-pattern measurement methodology). Decision deferred to operator at Step 2D-completion or Step 2E-planning per coordinated architectural-engineering discipline.
8. **§8.4 continuation patent candidate selection.** Six continuation patent candidate territories surfaced: Custom Government DMW NEW substrate primitive extension; AI_AGENT owning-entity-derived discipline; permission-batching primitives at substrate-tier; auto-grant authorization primitives; cognitive-load measurement primitives via SUBSTRATE_OBSERVATION; substrate-vs-configuration separation as architectural property. Specific continuation patent candidate selection deferred to patent counsel review per §8.4 OPERATOR REVIEW REQUIRED. New patent counsel engagement needed (Register 2 categorical framing; specific protected-name details per Register 1 framing not surfaced per ADR-0020 + RULE 19).

#### Substrate-honest discipline preserves operator-strategic-decision territory

The eight distinct territories canonicalize operator-strategic-decision territory at canonical-record register per substrate-honest discipline. Specific decisions deferred to focused operator session per coordinated discipline; the canonicalization documents the territory rather than pre-committing to specific resolution. The discipline operates per RAA 12.8 substrate-honest discipline + §8.5 ADR-0020 self-application: substrate-honest framing observations + operator-strategic-decision territory + protected-name discipline preserved throughout RAA 12.8 substrate-architecture canonicalization.

#### §9.7 documents the operator-decision discipline operating throughout RAA 12.8

§9.7 canonicalization operates as architectural property of canonical record: the operator-decision discipline operates as substrate-honest discipline throughout RAA 12.8 substrate-architecture canonicalization. Future architectural canonicalization work (RAA 12.9 + future RAA candidates per §9.4) inherits the operator-decision discipline per RAA 12.8 precedent.

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

- Memory entry #16 — three DMW types (Personal / Enterprise / Device; substrate-honest framing per Correction A canonical at §5.8 amendment `[RAA-12.8-S5-AMEND-1]` — Enterprise carries data with forget-on-detach at Permission tier; memory entry #16 "zero-payload" framing is corrective territory); Section 5.8 mapping foundation
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
