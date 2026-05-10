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

Three canonical framings ground RAA 12.8 substrate-dynamics design:

**ASI-substrate framing.** Foundation is the embodied substrate for ASI cognition. ASI consumers depend on substrate for accuracy guarantees (audit chain integrity, identity trust, permission lineage) AND for situated intelligence (relational dynamics, retrieval coherence, agentic coordination). The substrate must serve both layers without compromise.

**Cognitive-science framing.** Memory is not retrieval-from-storage; memory is reconstruction conditioned by context, relational structure, and prior outcomes. Substrate that treats memory as static retrieval-by-key breaks under ASI consumers. RAA 12.8 canonicalizes substrate as dynamic-reconstruction-engine grounded in spreading activation (Quillian 1968+), schema-conditioned reconstruction (Bartlett 1932; Schank scripts), resonance/coherence dynamics (Hofstadter), and emergent local-interaction-driven retrieval (complexity science).

**Wallet sovereignty principle (per Correction 4).** Wallets are designed to keep humans in the loop and preserve sovereignty over their data. Wallet sovereignty is the foundational architectural constraint: substrate-tier coordination primitives are universal across entity types, but governance rules are per-DMW-type because underlying sovereignty differs across DMW types. Per memory entry #16, the three DMW types (Personal / Enterprise zero-payload / Device) have different sovereignty postures; per `EntityType` enum, the six entity types coordinate via universal substrate primitives but operate within per-DMW-type governance constraints. This principle co-frames RAA 12.8 alongside ASI-substrate and intentional-forgetting per RULE 0 sovereign-human invariance.

### 1.2 ASI-substrate framing (boundary)

RAA 12.8 designs the **cognitive dynamics layer** of substrate. The trust root layer (audit chain, identity, permission lineage, frozen tamper anchors) is canonicalized in RAA 12.7 §2.5 Zones U1-U4 + ADR-0002 + ADR-0003 + ADR-0019. RAA 12.8 must extend cognition without compromising trust roots. This is the boundary: dynamics layer extensions never weaken unilateral guarantees that ASI relies on as accuracy anchors.

### 1.3 Investigation findings consolidated (13 dimensions reference)

Step 2C Phase 1 + Phase 1 extension surfaced substrate landscape across 13 dimensions. Phase 1 (D1-D6): push/pull flow; lateral flow; weighting primitives; Otzar application-layer; DecayType behavioral; cross-type balance. Phase 1 extension (D7-D13): multi-DMW retrieval; active-learning informativeness; Hive aggregation consumption; human-in-the-loop primitives; ASI-relevant substrate properties; scale-related substrate properties; five-field integration readiness.

Net BUILT/DOCUMENTED/GAP table consolidates evidence. Critical interconnections (INT-1 through INT-6) consolidate cross-dimension dependencies. Drift catalog (D-2C-D2 through D-2D-D13-HYPERGRAPH-NAMING-PRECISION) consolidates substrate-honesty observations.

RAA 12.8 design references this investigation as substrate evidence; full investigation report retained in commit lineage at HEAD `3c2eb99` ([ADR-0022]) preceding outline commit.

### 1.4 Three architectural surfaces

**Surface 1 — Scale Architecture.** Substrate behavior at O(10²) → O(10⁷) capsules-per-entity scale. Tier-aware retrieval, candidate pre-filter, pagination, materialized aggregates, latency budgets, query complexity bounds, parallel orchestration mechanics.

**Surface 2 — Relational Dynamics.** Five-field integration in conjunction: spreading activation + true-or-precise hypergraph + resonance/coherence + emergent retrieval + context-dependent salience. Lateral flow operationalization. Hive aggregation as DMW-to-DMW coordination per Correction 2.

**Surface 3 — Agentic Coherence.** Dual-posture canonicalization (humans-in-the-loop sovereignty + AI_AGENT autonomy within human-sovereign boundaries). Human-in-the-loop primitives expansion. Self-introspection. Agent-to-agent coordination per Corrections 1+3+4. Active-learning informativeness as refinement. DurationType/DecayType collision resolution. Per-DMW-type sovereignty rules (Section 5.8 per Correction 4).

### 1.5 Surface 4 deferred to RAA 12.9

Governance & Monetization at Scale (per-data-point + per-customer granular controls; AI-mediated supply/demand pricing; cohort discoverability) extracted to dedicated RAA 12.9 per operator Decision 3. Boundary check: substrate-vocabulary distinct from Surfaces 1-3; patent-claim coverage couples to US 12,164,537 + US 12,399,904 distinct from US 12,517,919; engineering effort separation preserves RAA 12.8 tractability. RAA 12.9 cites RAA 12.8 cross-type balance policy as substrate dependency; reciprocal forward citation captured at Section 9.1.

### 1.6 Patent-implementation-evidence framing

Per Decision 2 (defensive publication strategy authorized; patent counsel not currently engaged), RAA 12.8 ship-to-origin/main establishes contemporaneous patent-implementation record. Per memory entry #12, every commit on origin/main is cryptographically-timestamped contemporaneous record of NIOV Labs implementing patented invention. RAA 12.8 commit count + commit content compose evidentiary mass. Per-DMW-type sovereignty differentiation (Section 5.8 per Correction 4) is flagged as continuation patent candidate per Section 8.4.

---

## Section 2 — Zone Discrimination Methodology Extension

### 2.1 RAA 12.7 §2.5 verbatim precedent

RAA 12.7 §2.5 canonicalizes zone discrimination across two flow-direction classes: 4 unilateral (U1 audit chain integrity / U2 patent-holder implementation record / U3 identity verification / U4 permission grant lineage) + 5 bilateral (B1 feedback loop circulation / B2 cross-entity resonance Hive / B3 multi-DMW concurrent flow / B4 cross-entity similar-trait resonance / B5 real-time proximity awareness).

Default rule: bilateral. Static-data paradigm assumes unilateral by default; Foundation rejects static-data paradigm; therefore Foundation default is bilateral unless a correctness guarantee demands unilateral.

### 2.2 Lateral class introduction (third flow-direction)

RAA 12.8 introduces a third flow-direction class: **lateral**. Lateral flow operates between capsules within a wallet (or across wallets for multi-DMW retrieval per Surface 1) without conforming to forward-only (unilateral) or feedback-loop (bilateral) patterns. Lateral flow is co-temporal: capsules co-activate, co-resonate, co-condition each other's salience during retrieval.

Lateral class is necessary because the five-field integration (Surface 2) introduces dynamics that neither unilateral nor bilateral captures. Spreading activation is not feedback-loop closure; it is co-temporal propagation. Hypergraph relational consumption is not forward-only flow; it is N-ary co-membership query. Resonance/coherence is not appended-row chain; it is real-time mutual-conditioning between capsules.

### 2.3 Lateral zone enumeration (operator-review-required marker — count = 6 proposed)

**OPERATOR REVIEW REQUIRED:** lateral zone count of 6 is proposed; full-document drafting confirms count or extends. Six lateral zones proposed:

- **L1 — Capsule-to-capsule spreading activation.** Activation propagates through `connected_capsule_ids` edges during retrieval; capsule activation conditions other capsules' candidate scoring within the same query cycle.
- **L2 — Hypergraph relational consumption.** N-ary capsule co-membership in shared relational structures conditions retrieval; precision decision (true hypergraph vs directed-edge-list) deferred to Section 4.3.
- **L3 — Resonance/coherence dynamics.** Capsules reinforce or contradict each other; coherence_score conditions retrieval; contradiction-detection surfaces capsule-pair conflicts during context assembly.
- **L4 — Emergent retrieval.** Retrieval set emerges from local capsule-interaction dynamics rather than top-down score-rank-select; convergence parameters condition emergence.
- **L5 — Context-dependent salience.** Session state (conversation history, prior retrievals, recent outcome patterns) conditions per-capsule salience; same capsule set scores differently across session states.
- **L6 — Hive-aggregate consumption.** Hive aggregates condition retrieval as explicit context layer alongside personal capsules per Correction 2 reframing; aggregate salience conditions retrieval scoring; closure of Zone B2 PARTIAL.

### 2.4 Zone discrimination decision tree

Forward architectural decisions reference the extended zone classification. New capability is asked: **"U, B, or L — and why?"** before flow direction is chosen.

- If correctness guarantee demands forward-only: U class (audit, identity, lineage, patent record).
- Else if outcome must propagate back to update substrate state for future cycles: B class (feedback loops, cross-entity resonance, multi-DMW outcome propagation).
- Else if co-temporal mutual-conditioning between capsules within a query cycle: L class (the six lateral zones).
- Default L when retrieval-time dynamics; default B when learning-cycle dynamics; default U only when correctness demands.

---

## Section 3 — Surface 1: Scale Architecture

### 3.1 Scale target framing

Substrate must serve O(10⁷) capsules per entity. Current substrate tested at O(10²) per entity. Scale jump traverses five orders of magnitude. Per-DMW-type sovereignty rules (Section 5.8 per Correction 4) apply asymmetrically: Personal DMW carries individual-human capsule density; Enterprise DMW zero-payload carries metadata-only density; Device DMW carries machine-generated telemetry density. Scale architecture must accommodate heterogeneous density.

### 3.2 Tier-aware retrieval (closes D-2D-D12-STORAGE-TIER-RETRIEVAL-DRIFT)

Substrate already carries `MemoryCapsule.storage_tier StorageTier @default(WARM)` enum (HOT/WARM/COLD) with write-time auto-classification (`write.service.ts:314` — FOUNDATIONAL→HOT). Retrieval is currently tier-blind. Surface 1 closes the gap: HOT-tier-first retrieval; WARM-tier on demand; COLD-tier read-on-explicit-request. Closes D-2D-D12 drift.

### 3.3 Index-driven candidate pre-filter

Current COE retrieval loads all wallet candidates into memory then filters/scores client-side. Substrate has 8 indexes on MemoryCapsule including GIN on topic_tags. Surface 1 design: leverage GIN index for keyword-driven candidate pre-filter; relevance-score-indexed pre-filter for forget-floor exclusion; bounded candidate set entering scoring stage.

### 3.4 Pagination + candidate budgeting

Current pagination exists only in audit query (`audit.ts:487-488`). COE retrieval has no pagination. Surface 1 design: cursor-based pagination for retrieval; candidate budget bounds (cap candidate set entering scoring); progressive retrieval for large-context-budget cases.

### 3.5 Materialized aggregates per (entity, capsule_type)

Current substrate has `Wallet.total_capsule_count` (substrate-tracked) and `CompoundingMetrics.capsule_count` (org-level). Per-type aggregates not materialized. Surface 1 design: materialized per-(entity, capsule_type) aggregates for hot-path acceleration; refresh discipline (write-through vs cron-backed); coupling to per-type baseline weights from Surface 2.

### 3.6 Latency budgets canonicalized

ASI-class agentic execution demands single-digit-ms retrieval latency. Surface 1 canonicalizes per-stage budget: candidate pre-filter (≤Xms), scoring (≤Yms), NEGOTIATE parallelism (≤Zms), context assembly total (≤Tms). Specific values emerge during full-document drafting; outline establishes the canonicalization pattern.

### 3.7 Query complexity bounds

Surface 1 bounds query complexity: maximum N candidates entering scoring (function of token budget + tier policy); maximum K capsules returned; maximum M hops in spreading activation (Surface 2 coupling); maximum pagination depth. Bounds prevent pathological scaling under adversarial queries.

### 3.8 Parallel orchestration mechanics

Cross-wallet retrieval (closes Zone B3 per RAA 12.7) operates per-DMW-type-asymmetric per Correction 4. Personal + Twin + Enterprise concurrent retrieval respects each wallet's sovereignty constraints: Enterprise zero-payload constraint applies even when retrieval crosses into Enterprise DMW; AI_AGENT-owned wallet constraint applies (owning-human sovereignty bounds twin autonomy). Parallel orchestration must encode per-wallet sovereignty as scheduling constraint, not afterthought.

### 3.9 Surface 1 decisions list

Decision territory enumerated; each decision receives Decision/Consequences/Alternatives treatment in full-document drafting:
- D-S1-1: Tier-aware retrieval policy (HOT-first vs unified scoring with tier weight)
- D-S1-2: Candidate pre-filter algorithm (GIN-driven topic_tags vs relevance-floor-driven vs combined)
- D-S1-3: Pagination strategy (cursor vs offset; bounds)
- D-S1-4: Materialized aggregate refresh discipline (write-through vs cron)
- D-S1-5: Latency budget per-stage values
- D-S1-6: Query complexity bounds values
- D-S1-7: Cross-wallet parallel orchestration scheduling (sovereignty-as-scheduling-constraint mechanics)

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
