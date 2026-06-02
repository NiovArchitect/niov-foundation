# ADR-0092 — DMW Runtime Expansion Doctrine (Design-Only)

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

LEI sequence Step 8 per Founder direction. The DMW (Decentralized Memory Wallet) substrate referenced in patents US 12,164,537 + US 12,399,904 is foundational to NIOV — it's how entities own their intelligence. Founder direction:

> "DMW is not just a concept."
> "DMW runtime must eventually support: memory scopes; authority scopes; permission grants; consent grants; retention decisions; forgetting decisions; delegation to AI Twins; delegation to AI Teammates; receipts; revocation; scoped memory use in actions; scoped memory use in voice; scoped memory use in workflows."
> "First DMW runtime slice should be bounded: scope record; grant/revoke record; audit event; no private memory exposure; no manager access to private memory; no cross-tenant memory; no global memory fusion."
> "DMW must support people, enterprises, agents, devices, and future entities over time."

### Substrate-honest pre-flight (RULE 13)

Per-primitive LIVE / PARTIAL / FORWARD-SUBSTRATE map (audit conducted 2026-06-02):

| Founder primitive | Status | LIVE substrate |
|---|---|---|
| **Memory scopes** | LIVE | `MemoryCapsule.topic_tags[]` + `storage_tier` + wallet boundary at COSMP services |
| **Authority scopes** | LIVE | `TokenAttributeRepository` capabilities + `clearance_required` + `clearance_ceiling` + AI lower defaults per ADR-0046 |
| **Permission grants** | LIVE | `Permission` model + 5 `DurationType` values (TEMPORARY / SHORT_TERM / LONG_TERM / PERMANENT / SESSION_ONLY) + 3 `access_scope` levels (METADATA_ONLY / SUMMARY / FULL) + `bridge_id` grouping |
| **Consent grants** | **PARTIAL** | No explicit Consent model; permissions imply consent today; forward-substrate per ADR-0079 transcript policy |
| **Retention decisions** | LIVE | `DecayType` enum (5 values) + `expires_at` + `decay_rate` + lazy-at-read execution per ADR-0044 |
| **Forgetting decisions** | LIVE | `relevance_score` + `feedback_loop_score` + `RELEVANCE_FORGET_FLOOR = 0.2` (ADR-0022 frozen anchor) + soft-delete `deleted_at` per RULE 10 |
| **Delegation to AI Twins** | LIVE | `TwinConfig` autonomy + `SkillPackage` + `TwinSkill` + dual-context wallet routing (ADR-0046 Amendment 1) |
| **Delegation to AI Teammates** | **FORWARD-SUBSTRATE** | Multi-agent swarm coordination not yet substrate-formalized; ADR-0039 hive-scale dispatch substrate exists at infrastructure tier |
| **Receipts** | **FORWARD-SUBSTRATE** | Append-only audit chain per ADR-0002 is the audit-of-record but is NOT receipts (no caller-presentable proof artifact) |
| **Revocation** | LIVE | `Permission.revoked_at` + `revoked_by_entity_id` + `PermissionStatus.REVOKED` + session invalidation cascade |
| **Scoped memory use in actions** | LIVE | `Action` + `policy_envelope` (frozen TAR / OrgSettings / TwinConfig snapshot) + `ActionPolicy` per-(org, action_type, risk_tier) + `ActionDecision` 4-state enum |
| **Scoped memory use in voice** | **PARTIAL** | `OtzarConversation.source_type = "CHAT"` (voice implied at envelope tier per ADR-0085 §5); voice-specific scope-projection forward-substrate per ADR-0079 Layer 1-4 architecture |
| **Scoped memory use in workflows** | LIVE | `Workflow` model + W4 catalog (ADR-0081 §2.2 Stage 3 LIVE) + W5 promotion (ADR-0086 LIVE) + ActionPolicy gating |
| **Multi-entity-type support** | LIVE (4/7) | `EntityType` enum: PERSON / COMPANY / AI_AGENT / DEVICE LIVE; APPLICATION / GOVERNMENT / REGULATOR reserved (REGULATOR partially live via ADR-0036) |

**LIVE DMW services** (`apps/api/src/services/cosmp/`):
- `read.service.ts` — READ operation; scope-filtered content via `AccessScope`; access-count increment
- `write.service.ts` — WRITE operation; decay persistence; mutation discrimination (ADR-0042); embedding (ADR-0043)
- `share.service.ts` — SHARE operation; multi-capsule grants under one `bridge_id`; grantee session invalidation
- `negotiate.service.ts` — NEGOTIATE operation; access-declaration nonce-store; permission pre-flight
- `similarity.service.ts` — Semantic capsule linkage (ADR-0043 §G3.6)
- `jurisdiction-enforcement.ts` — Jurisdictional anchor (ADR-0037)
- `regulator-enforcement.ts` — REGULATOR entity access (ADR-0036)
- `regulator-expiry.service.ts` — Regulator lawful-basis expiry (ADR-0036)

**The gap ADR-0092 closes:** the Founder names 14 DMW runtime primitives. 10 are LIVE. 4 are PARTIAL/FORWARD. ADR-0092 names the smallest-viable expansion candidates that move the 4 gaps toward LIVE without introducing surveillance / scoring / cross-tenant fusion.

## Decision

### 1. DMW Runtime is a CONTROL-PLANE LAYER atop the LIVE storage + permission substrate

DMW Runtime expansion is NOT a wholesale rebuild of the wallet + capsule + permission substrate. That substrate is mature per ADR-0001 (three-wallet foundational) + the 8 cosmp services above. DMW Runtime expansion adds **control-plane substrate** that operationalizes the 4 PARTIAL/FORWARD primitives — consent grants, AI Teammate delegation, receipts, voice-scoped memory.

Same isolation discipline as Sesame (ADR-0089) + Python (ADR-0090) + BEAM (ADR-0091): each new control-plane primitive lives in its own substrate boundary; never bypasses existing storage / permission / audit / sovereignty.

### 2. DMW Runtime primitives MUST preserve the 7 inviolable bans (Founder direction)

Per Founder direction every DMW Runtime expansion slice MUST satisfy:

1. **No private memory exposure** — Personal DMW capsules NEVER readable by manager or org admin without explicit revocable consent grant.
2. **No manager access to private memory** — Personal DMW is sovereign to the entity who owns it.
3. **No cross-tenant memory** — DMW boundary is same-org per ADR-0049 GOVSEC.7; no cross-tenant fusion.
4. **No global memory fusion** — Foundation NEVER aggregates DMWs across orgs into a global memory pool.
5. **Scope record discipline** — every scope grant has a recorded artifact (LIVE via Permission model; extends to Consent via §4 below).
6. **Grant/revoke record discipline** — every grant has a revocation path (LIVE via Permission.revoked_at + status; extends to Consent revocation via §4).
7. **Audit event discipline** — every DMW operation emits an audit event per RULE 4 (LIVE via existing audit literals).

### 3. Multi-entity-type support inheritance

Per Founder direction *"DMW must support people, enterprises, agents, devices, and future entities over time."* The existing `EntityType` enum already covers this:

- **PERSON** (LIVE) — humans; Personal DMW
- **COMPANY** (LIVE) — orgs / enterprises; Enterprise DMW
- **AI_AGENT** (LIVE) — digital twins + teammates; Personal-mapped via wallet routing (ADR-0046 Amendment 1)
- **DEVICE** (LIVE) — Device DMW; cold-sharded (ADR-0040)
- **APPLICATION** (RESERVED) — future app-identity principals
- **GOVERNMENT** (RESERVED) — GOVSEC hardening forward-substrate (ADR-0049)
- **REGULATOR** (LIVE; restricted) — tenant-internal regulatory authority (ADR-0036 LawfulBasis chain)

DMW Runtime expansion preserves this enum verbatim; no new EntityType values land at this slice.

### 4. The 4 gap-closure candidate slices

The 4 PARTIAL/FORWARD primitives map to 4 Founder-named candidate slices. ADR-0092 enumerates; Founder picks at per-slice authorization based on next LEI sequence consumer.

**Candidate A: Consent Grant + Receipt substrate**

- Closes gaps: **Consent grants** + **Receipts**.
- Shape: NEW `ConsentGrant` Prisma model (`consent_id` + `grantor_entity_id` + `grantee_entity_id` + `purpose` closed-vocab + `permission_id` FK + `consent_state` enum REQUESTED|APPROVED|DENIED|EXPIRED|REVOKED + `valid_from` + `valid_until` + `revoked_at` + `revoked_by`); NEW `Receipt` Prisma model (`receipt_id` + `consent_id` FK + `permission_id` FK + `audit_event_id` FK + `timestamp_sealed` + `receipt_hash` chained into audit chain per ADR-0002).
- Scope: converts implicit permission-grant into explicit consent + cryptographic receipt binding. Caller can present a receipt as proof of grant for compliance / dispute / audit drilldown.
- Composes against: Permission model LIVE + AuditEvent chain LIVE + ADR-0036 LawfulBasis pattern.
- 1 NEW audit literal candidate: `CONSENT_GRANT_RECORDED` (append-only per ADR-0042 §Q-γ.1). Revocation rides existing `PERMISSION_REVOKED`.

**Candidate B: Scoped Voice Memory Gate**

- Closes gap: **Scoped memory use in voice**.
- Shape: NEW `ConversationMemoryScope` Prisma model (`scope_id` + `conversation_id` FK + `entity_id` + `access_scope` enum + `capsule_types[]` allowed + `context_signals_only` boolean + `expires_at` + `created_at`); NEW `VoiceAccessLog` Prisma model (`log_id` + `conversation_id` FK + `entity_id` + `voice_provider` enum (TEXT_ONLY / LOCAL_MOCK / SESAME_CSM_1B per ADR-0089) + `duration_minutes` + `capsule_access_count` + `signals_projected_count`).
- Scope: pins voice-first memory boundary per conversation. Composes against ADR-0079 Layer 1-4 architecture + ADR-0085 §5 VoiceIntentEnvelope + ADR-0089 §5 VoiceProviderAdapter.
- Composes against: OtzarConversation LIVE + VoiceIntentEnvelope LIVE.
- 1 NEW audit literal candidate: `CONVERSATION_MEMORY_SCOPE_DECLARED`. Voice-specific access rides existing VF.2 6 voice literals.

**Candidate C: AI Teammate Delegation Frame**

- Closes gap: **Delegation to AI Teammates**.
- Shape: NEW `TeamDelegation` Prisma model (`delegation_id` + `delegator_entity_id` + `team_entity_id` + `capability_scope[]` closed-vocab + `supervision_required` boolean + `revocation_bridge_id` + `valid_from` + `valid_until` + `status` enum ACTIVE|REVOKED|EXPIRED); NEW `SwarmBoundary` Prisma model (`boundary_id` + `team_entity_id` FK + `capsule_access_mode` enum METADATA_ONLY|SCOPED_SUMMARY|FULL_SCOPED + `cross_team_reach` boolean + `escalation_on_exceed` enum DENY|ESCALATE_TO_W5|AUDIT_ONLY).
- Scope: formalizes multi-AI-agent teams (distinct from dual-context AI_AGENT routing per ADR-0046). Names delegation frame + enforces swarm boundary.
- Composes against: EntityType.AI_AGENT LIVE + EntityMembership LIVE + Hive Intelligence Runtime (ADR-0087) + W5 (ADR-0086) + Section 2 (ADR-0057).
- 1-2 NEW audit literal candidates: `TEAM_DELEGATION_CREATED` + `SWARM_BOUNDARY_DECLARED`. Revocation rides existing pattern.

**Substrate-honest framing:** these 3 candidates are NOT independent — they compose. Receipts (Candidate A) become more valuable when voice access (Candidate B) is scoped. Team delegation (Candidate C) needs consent records (Candidate A) to be meaningful. The Founder picker at per-slice authorization MAY land them in any order; the substrate composition graph stays coherent because each candidate is additive to LIVE substrate.

### 5. DMW Runtime expansion does NOT migrate existing substrate

Per the substrate-honest framing precedent (ADR-0091 §6): existing DMW substrate stays canonical. ADR-0092 ADDS control-plane primitives; it does NOT migrate Permission to Consent, does NOT migrate Wallet to a new model, does NOT replace COSMP services, does NOT change `EntityType` enum.

If a future Founder authorization decides a structural migration is needed (e.g., Permission becomes a subset of Consent), that migration lands at a separate slice ADR with explicit migration plan + reversible boundaries + RULE 21 research arc.

### 6. The 7 pre-implementation requirements (every DM1-DM10 slice MUST satisfy)

Per Founder direction every DMW Runtime expansion slice MUST:

1. **Audit existing DMW substrate per RULE 13** — the per-primitive map above is the canonical pre-flight reference for every slice.
2. **Verify Prisma schema additivity** — new models extend `schema.prisma` via additive forward-substrate per ADR-0021 deliberate-blocker pattern; no breaking field changes to existing models.
3. **Verify migration discipline** — every new model lands via `db:push:test` per ADR-0025 (NEVER bare `prisma db push`).
4. **Verify audit literal additions** — new literals via ADR-0042 §Q-γ.1 clean-transition (append-only; no ADR-0002 amendment).
5. **Verify same-org boundary at query tier** — every DMW Runtime read scopes to caller's org per ADR-0049 GOVSEC.7; no cross-org joins.
6. **Verify W5 compose-path for any Action proposal** — Foundation governance proposes via W5 (ADR-0086); never bypasses.
7. **Start with bounded scope, not wholesale rebuild** — each DM-slice introduces ONE candidate (A or B or C); never bundles.

### 7. Implementation ladder — 10 forward-substrate slices

V1 is doctrine-only at this ADR. Each implementation slice DM1-DM10 requires separate Founder authorization.

- **DM1 — First DMW Runtime substrate landing** (Founder picks Candidate A / B / C from §4 at per-slice authorization). Single model addition + service-tier helper + integration tests + audit emission.
- **DM2 — Second DMW Runtime substrate landing** (the next Candidate A / B / C per Founder pick).
- **DM3 — Third DMW Runtime substrate landing** (the remaining Candidate A / B / C).
- **DM4 — Cross-substrate composition slice** (e.g., Consent-bound Voice scope: Candidate A + Candidate B compose).
- **DM5 — Hive Intelligence Runtime + Team Delegation integration** (Candidate C feeds Hive Intelligence Runtime forward-queue signals per ADR-0087 §9).
- **DM6 — Section 2 Action + Consent receipt integration** (Candidate A consent receipts surface in ActionView for compliance drilldown).
- **DM7 — Voice + Sesame + Voice Memory Scope integration** (Candidate B + ADR-0089 VS5+ when both authorized).
- **DM8 — Personal DMW portability primitive** (cross-tenant portability per Founder direction "future entities over time"; portability MUST preserve same-org boundary at each tenant).
- **DM9 — Device DMW lifecycle primitives** (device retirement / replacement / forwarded ownership; composes against ADR-0040 DEVICE shard).
- **DM10 — Future entity types (APPLICATION + GOVERNMENT) activation** (each requires separate ADR + RULE 21 research arc for their respective sovereignty model).

### 8. NO Python / Sesame / BEAM / connector-write / blockchain bypass

Per cross-LEI sequence discipline: DMW Runtime expansion does NOT bypass Python (ADR-0090), Sesame CSM-1B (ADR-0089), BEAM (ADR-0091), Section 4 connector writes (ADR-0084 ≥C6), Section 2 Action authority (ADR-0057), W5 promotion gate (ADR-0086), ECIL surveillance bans (ADR-0088 §4), or blockchain/USDC (Founder-gated).

### 9. NO new model / dep / audit literal / migration at this ADR

Design-only. No `schema.prisma` change. No `AUDIT_EVENT_TYPE_VALUES` extension. No Prisma migration. No new dependency. No new route. No new service. The ADR locks the doctrine + candidate slate; each DM-slice lands its own substrate.

### 10. RULE 0 sovereignty preserved at every tier

Every DMW Runtime expansion inherits same-org boundary per ADR-0049 GOVSEC.7, entity-bound scoping per RULE 0, no AI clearance raise per RULE 0, no AI-to-AI LONG_TERM/PERMANENT grant per RULE 0. The Founder ban *"no global memory fusion"* extends to all DMW Runtime primitives — Foundation NEVER aggregates DMWs across orgs into a unified memory pool, regardless of how convenient that might be for cross-tenant Hive signal computation. Cross-tenant DMW fusion is structurally forbidden at Foundation governance per ADR-0049 GOVSEC.7.

### 11. Patent-implementation evidence

Per ADR-0020 two-register IP discipline. DMW Runtime expansion advances the patent-implementation evidence trail for US 12,164,537 + US 12,399,904 (DMW + Foundation primitives) by:

1. Naming the gap between implicit permission-grant and explicit consent-+ receipt (Candidate A) at the substrate-architectural register.
2. Scoping voice memory access at the per-conversation tier (Candidate B) without surveillance.
3. Formalizing AI Teammate delegation frames with swarm boundaries (Candidate C) that preserve RULE 0 sovereignty across multi-agent coordination.

The cryptographically-timestamped W5 + Hive Intelligence Runtime + DMW Runtime commit lineage all join the patent-implementation evidence trail.

## Consequences

**Positive.**

- The DMW Runtime Expansion register is named, bounded, and locked. The 7 inviolable bans (Founder direction) are canonical.
- The 14 Founder-named primitives map cleanly to LIVE / PARTIAL / FORWARD substrate. The 4 PARTIAL/FORWARD primitives are addressed by 3 candidate slices (A + B + C; Candidate A closes 2 gaps).
- The substrate-honest framing prevents wholesale rebuild framing. Existing wallet + capsule + permission substrate stays canonical; DMW Runtime ADDS control-plane.
- The 7 pre-implementation requirements lock the per-slice discipline.
- 10-slice forward-substrate ladder DM1-DM10 is enumerated; each slice has bounded scope.
- Multi-entity-type support per Founder direction is preserved verbatim (4 LIVE + 3 reserved); future activation of APPLICATION / GOVERNMENT lands at DM10 with separate RULE 21 research arc.
- Composition with Hive Intelligence Runtime (ADR-0087) + W5 (ADR-0086) + ECIL (ADR-0088) + Sesame (ADR-0089) + Python (ADR-0090) + BEAM (ADR-0091) is explicit — DMW Runtime sits at the same substrate-layer register as those siblings.

**Negative.**

- The 3 candidates are NOT independent — they compose. Founder picker may need to weigh which order maximizes downstream LEI sequence value (Consent + Receipt enables Voice scope drilldown; Team Delegation needs Consent to be meaningful).
- Each candidate adds a Prisma model. While additive per §6, this widens the Foundation schema surface. The k=5 minimum-population gate from Section 6 patterns may need to be applied to query interfaces against these new models to prevent re-identification.
- Voice Memory Scope (Candidate B) depends on Sesame readiness ADR-0089 VS5+ to be operationally useful for self-hosted voice. Until VS5 lands, the scope is exercised against TextOnlyVoiceProvider / LocalMockVoiceProvider only.

**Forward-substrate (NOT authorized by this ADR).**

- All 10 implementation slices DM1-DM10.
- Cross-tenant DMW portability mechanism (DM8; preserves same-org boundary at each tenant; never enables cross-tenant fusion).
- APPLICATION + GOVERNMENT EntityType activation (DM10; separate RULE 21 research arc).
- Receipt-presentation API at user-facing tier (forward-substrate; receipts are immutable audit artifacts at Foundation tier first).
- Voice-scoped retention class operator UI (forward-substrate; substrate first, CT second per ADR-0077 §8.4).
- AI Teammate Hive Intelligence Runtime composition at runtime (composes against ADR-0087 V2 signals).

## Alternatives

**Alternative A: Bundle Candidates A + B + C into V1.** Rejected per Founder direction *"First DMW runtime slice should be bounded."* Bundling violates the bounded-scope principle.

**Alternative B: Skip the doctrine ADR; land Candidate A directly.** Rejected — the per-LEI-sequence discipline established by ADRs 0088 / 0089 / 0090 / 0091 establishes the doctrine-first pattern. Each LEI sequence step starts with the readiness/expansion doctrine.

**Alternative C: Pick Candidate A (Consent + Receipt) at this ADR.** Rejected — the Founder picker at per-slice authorization is determined by the next LEI sequence consumer. ADR-0092 names candidates; doesn't pick.

**Alternative D: Migrate existing Permission model to subsume Consent.** Rejected at V1 — substrate-honest framing keeps existing Permission canonical; ConsentGrant adds a complementary control-plane primitive. Future migration is forward-substrate to a separate slice ADR if structural alignment becomes warranted.

**Alternative E: Define a new "Memory Sovereignty Registry" mega-model encompassing all 3 candidates.** Rejected — violates §5 substrate-honest framing + §6 §7 bounded-scope discipline. Each candidate stays a separate model with clean composition rather than a monolithic primitive.

## Cross-references

ADR-0001 (three-wallet architecture; foundational DMW substrate; preserved verbatim) ·
ADR-0002 (append-only audit chain; preserved; Receipt model chains into) ·
ADR-0017 (Production Discipline; operational-signal-gated future slice cadence) ·
ADR-0020 (two-register IP discipline; patent-implementation evidence) ·
ADR-0021 (CapsuleType extension protocol; deliberate-blocker pattern for new models) ·
ADR-0022 (RELEVANCE_FORGET_FLOOR frozen anchor; preserved) ·
ADR-0025 (schema-push-target discipline; every new model uses `db:push:test`) ·
ADR-0026 (dual-control; preserved for privileged DMW operations) ·
ADR-0036 (LawfulBasis + REGULATOR substrate; precedent for chained consent attestations) ·
ADR-0037 (jurisdiction tagging; preserved across DMW Runtime models) ·
ADR-0040 (DEVICE cold-shard; preserved at DM9) ·
ADR-0042 §Q-γ.1 (clean-transition; future DMW audit literal additions per slice) ·
ADR-0044 (decay execution; preserved as canonical retention) ·
ADR-0046 (dual-context AI_AGENT routing; preserved; Candidate C composes against) ·
ADR-0048 (working-set provenance; DMW Runtime control-plane composes against) ·
ADR-0049 (GOVSEC.7 tenant isolation; same-org boundary inherited) ·
ADR-0050 (Break-Glass; DMW Runtime never bypasses) ·
ADR-0052 §8 (Otzar DGI doctrine; Twin-to-Twin coordination respects DMW boundaries) ·
ADR-0057 (Section 2 Action runtime; preserved as execution authority) ·
ADR-0058 (no manager surveillance; reinforced; Personal DMW protected) ·
ADR-0061 (Section 6 Enterprise Analytics SAFE projection; aggregate analytics over DMW state preserved) ·
ADR-0070 (Regulator-Ready doctrine; preserved) ·
ADR-0077 §8.4 (Foundation-first cadence; CT consumer surface forward-substrate) ·
ADR-0079 (Retention Class + Transcript Substrate Policy; Candidate B composes against Layer 1-4 architecture) ·
ADR-0080 (PermissionBundle; preserved; Consent extends) ·
ADR-0084 (Section 4 connector strategy; preserved; DMW Runtime never bypasses connector governance) ·
ADR-0085 §5 (VoiceIntentEnvelope; preserved; Candidate B composes against) ·
ADR-0086 (W5 Action Promotion Runtime; preserved; DMW Runtime proposes via W5) ·
ADR-0087 (Hive Intelligence Runtime V1; preserved; Candidate C feeds V2 signals) ·
ADR-0088 (ECIL Doctrine; preserved; voice scope composes with ECIL Tier 2+) ·
ADR-0089 (Sesame CSM-1B Readiness; preserved; Candidate B + VS5+ operationally compose) ·
ADR-0090 (Python Intelligence Runtime Readiness; preserved; DMW Runtime envelope feeds Python computations) ·
ADR-0091 (BEAM Living Coordination Runtime Expansion Doctrine; preserved; sibling expansion-doctrine pattern).

## RULE references

RULE 0 (humans always sovereign; Personal DMW is sovereign; no manager access; no cross-tenant fusion) + RULE 4 (audit chain integrity; Receipt model chains into per ADR-0002) + RULE 9 (modular service-tier connections; DMW Runtime services compose) + RULE 10 (soft-delete; preserved across new models) + RULE 11 (Elixir/BEAM canonical patterns; relevant at future BEAM-DMW coordination) + RULE 13 (substrate-honest pre-flight; embedded above as the per-primitive LIVE/PARTIAL/FORWARD map) + RULE 14 (bidirectional citation; this ADR cites and is cited by ADR-0001 / ADR-0048 / ADR-0079 / ADR-0085 / ADR-0086 / ADR-0087 / ADR-0088 / ADR-0089 / ADR-0090 / ADR-0091 catalog entries) + RULE 16 (no console.* in apps/api/src; preserved — no code in this slice) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc; this ADR's research arc IS the substrate-honest pre-flight per §Context — DMW canonical sources are already embedded in ADRs 0001 / 0009 / 0036 / 0044 / 0046 / 0048 / 0079 + patents US 12,164,537 + US 12,399,904).
