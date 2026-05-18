# Section 12 Progress Tracker

This file tracks the multi-batch effort to land Section 12 of
the Foundation build. Section 12 is the production-readiness +
compliance hardening + frontend dashboard work that brings
Foundation from "MVP-functional" to "FedRAMP-eligible enterprise
platform."

This is **committed substrate** — the tracker is updated in
each commit that closes a sub-section, so the live state is
always greppable from the current HEAD. Cross-reference
`docs/reference/architectural-anchors.md` for the anchors that
each sub-section locks, and `docs/architecture/decisions/` for
the ADRs that document the decisions.

**Recalibrated timeline:** 5-8 weeks comfortable at demonstrated
pace; 3 weeks ambitious; 2 weeks tight. Original 5-7 month
estimate (anchored on industry cadence with idle time + slow
verification) abandoned. All future estimates calibrate against
demonstrated pace, not industry standard.

## Status Table

| Sub-section | Status | Commit | Description |
|---|---|---|---|
| 12B (Otzar Control Tower foundation) | CLOSED | `otzar-control-tower @ 0a28f90` | Foundation for admin console; 12 architectural anchors |
| 12.5 (Compliance Architecture Review) | CLOSED | `9671776` | 24 dimensions assessed; 9 patent-relevant findings; 6 claim families; 9 sub-boxes dependency-ordered |
| 12C.0 Commit 1 (endpoint extensions) | CLOSED | `2aa1a88` | DELETE skill + PATCH entities audit_event_id + audit filters + bridge_id filter; +16 tests; 2 anchor properties (DRIFT 9 audit + permissions) |
| 12C.0 Commit 2 (compliance hardening) | CLOSED | `f3359fb` | crypto-config + retention posture + system principals + structured logging + /compliance/state; +22 tests; 4 anchor properties (DRIFT 2 Option C, DRIFT 12, frozen CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS) |
| 12C.0.5 (operating manual + docs) | CLOSED | `23e263d` | CLAUDE.md + AGENTS.md + 10 ADRs + contributing guides + reference catalog |
| Track A (test infrastructure isolation) | SUBSTANTIVELY COMPLETE | `d728cd4` → `5be42e5` | 18 gates closed + REVISED Gate 2 (Colima canonicalization per RULE 13 substrate-state drift correction); containerized Postgres + mocked LLM tier-stratification per ADR-0011; full chain at CURRENT_BUILD_STATE.md §5 |
| 12.5 Sub-box 1 (EscalationRequest + dual-control) | **CLOSED** | `dc0a26f` | Substrate-complete at `dc0a26f` ([D-2D-D10-7]); closure-amendment at [D-2D-D10-8]. 4-framing-register closure (substrate + service + route + canonical-record tiers) of D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL per RAA 12.8 §5.2 + §5.9 item 1: EscalationRequest model + 7-fn service + validation gate flag + gate-fail→COMPLIANCE_GATE coupling + correction propagation chain + escalation HTTP routes; +33 unit (escalation.test.ts) + 10 unit (gate-flag/coupling/propagation cases) + 8 integration (escalation-routes.test.ts); [ADDENDUM-DMW-SLM] canonical-record addendum landed alongside; no new architectural anchors; glossary +4 entries (Validation Gate Flag, AI Access Block, Correction Propagation, Escalation Routes). See "Sub-box 1 CLOSED" narrative below for the arc chronology + 6-item forward queue. |
| 12.5 Sub-box 2 Phase 1 (dual-control middleware) | **CLOSED** | `b34c5cf` → `135fee0` → `62d472c` → this commit | The privileged-action dual-control gate per `COMPLIANCE_ARCHITECTURE_REVIEW.md` Tension 3 (consumes the generalized `requireDualControl` preHandler forward-queued from [D-2D-D10-7]). 10-commit arc — sub-phases A–J landed (`b34c5cf` → `135fee0` [H] → `62d472c` [I] → this commit [J]; the `135fee0` H-hash + `62d472c` I-hash backfilled per the post-commit-hash discipline; J's own hash lives in the commit body — "this commit" here refers to the J commit by substrate position, keeping the arc at exactly 10 commits). **The 10-commit Sub-box 2 Phase 1 arc is CLOSED.** ADR-0026 (the dual-control middleware bundle) landed at sub-phase H; ADR-0027 (contributor governance + RULE 20) at sub-phase I; ADR-0028 (the Elixir/BEAM COSMP coordination-layer Phase 2 commitment-to-ship) at sub-phase J; operational companion `docs/architecture/dual-control-operations-canonical-record.md`. Sub-box 2 Phase 2 (the 6-8-commit / ~3-4-week Elixir/BEAM mini-arc per ADR-0028) is queued. |
| SUBSTRATE-BUILD-OPTIMIZATIONS (substrate-build meta-tooling per ADR-0029) | **CLOSED** | `ba78216` → `37e4bcc` → `9f0514b` → `49222ad` → this commit | The substrate-build optimizations arc per ADR-0029 — Optimization 1 (`scripts/preflight/cascade-grep.sh` + README at `37e4bcc`), Optimization 2 (`docs/contributing/templates/` commit-class scaffolds at `9f0514b`), Optimization 3 (CLAUDE.md §7 prose-discipline bullet at `49222ad`); sub-phase 5 onboarding cascade (`onboarding.md` §6 + `onboarding-for-engineers.md` §1 + §6) + post-commit-hash backfills (the first completed worked example of `POST-COMMIT-HASH-CASCADE.template.md`) + catch #1b resolution (`docs/contributing/README.md` line 99 stale `decisions/0001-0010` reference) + catch #2 resolution (`onboarding-for-engineers.md` 3 sites of stale "27 ADRs" → "29 ADRs") at this commit. **The 5-commit SUBSTRATE-BUILD-OPTIMIZATIONS arc is CLOSED.** Per sub-phase J Decision 3 precedent, sub-phase-5's own hash lives in the commit body — "this commit" here refers to the sub-phase-5 commit by substrate position, keeping the arc at exactly 5 commits. 4 distinct catches across the arc; all resolved in-arc; zero broken commits on origin/main. The arc addresses the 26-catch dual-control arc patterns by reducing token-cost-per-catch for future engineering arcs. |
| 12.5 Sub-box 2 Phase 2 (Block B / BEAM mini-arc) | **CLOSED** | `5712a2b` → `d72682c` → `54ef59c` → this commit | The Elixir/BEAM COSMP coordination layer + DBGI supervisor + three-language stack canonicalization per ADR-0028 (commitment-to-ship) + ADR-0030 (Phase 2 implementation). 19-sub-phase mini-arc (expanded from the original 6-8-commit estimate per ADR-0034 + ADR-0035 sub-phase splits per Q-NEW-SPLIT-2 + Q-NEW-SPLIT-3): sub-phases 1-6c (cosmp_router: mix umbrella, OTP app, GenServer 7-COSMP-op dispatch with 6 BEAM patterns instantiated, gRPC interop, persistence + idempotency + audit chain, testability refactor, substrate-build discipline canonical) + sub-phases 7-10 (dbgi_supervisor: OTP app, `:pg` modern OTP-native process-group registry, libcluster + Phoenix.PubSub + Phoenix.Tracker multi-region cluster, `:peer` multi-node integration tests with partition recovery) + sub-phases 11-13 (telemetry + metrics + Prometheus bridge + structured Logger + no-identity-label discipline, BEAM coordination canonical record, arc-closure cascade). ADRs landed: 0030 (Phase 2 implementation) + 0031 (BEAM routing substrate) + 0032 (BEAM gRPC interop) + 0033 (BEAM persistence + idempotency + audit-chain cryptographic substrate) + 0034 (BEAM COSMP testability refactor; D-WIDER-KNOWLEDGE-CHECK origin) + 0035 (substrate-build discipline canonical; observations 1-34 including 30th D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET + 32nd D-PHASE-10-DISCONNECT-TEST-CASCADE + 33rd D-PHASE-10-PARTITION-SURVIVAL-CANONICAL + 34th D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE PROMOTED to numbered cluster). Operational companion `docs/architecture/beam-coordination-canonical-record.md` LANDED at `54ef59c` per sub-phase 12. Forward-looking items remaining (per-capsule supervised Elixir process; OtzarComm message routing at scale; Python ML substrate; multi-region production topology; migration triggers; `:gproc` backward-compatibility; partition-tolerance expansion; Federation Cloud + cohort + depersonalization; robotics/machinery EntityType extension) documented at `beam-coordination-canonical-record.md` §11 Forward paths. Per sub-phase J Decision 3 precedent, sub-phase-13's own hash lives in the commit body — "this commit" here refers to the sub-phase-13 commit by substrate position, keeping the arc at exactly 19 sub-phases. |
| 12.5 CAR Sub-box 2 — Jurisdiction Tagging (1.6 + 2.4) | **CLOSED** | `c72fabd` → `93f96ec` → `3fab20d` → `6efdf44` → `7faf2ac` → this commit | **Distinct from progress tracker "Sub-box 2 Phase 1/Phase 2" above** per D-CAR-SUB-BOX-NUMBERING-DRIFT canonical at ADR-0035 §9 35th. CAR Sub-box 2 substrate LANDED: `Entity.jurisdiction` + `MemoryCapsule.jurisdiction` + `AuditEvent.jurisdiction` + `OrgSettings.default_jurisdiction` schema fields (all `String?` nullable) + 3 B-tree indexes (entities + memory_capsules + audit_events) + `assertJurisdictionalScope` pure-function helper at `apps/api/src/services/cosmp/jurisdiction-enforcement.ts` + service-tier defaulting cascade at `createEntity` (passthrough) + `createCapsule` (owner Entity cascade) + `writeAuditEvent` (row-metadata passthrough) + COSMP enforcement at NEGOTIATE start-check (before owner shortcut) + readContent TOCTOU re-check (before content load) + SHARE per-capsule start-check + REVOKE bounded-bridge capsule fetch + per-capsule start-check + WRITE create-time cascade (inline at WriteService per Q2 LOCKED Option α) + WRITE update-time actor↔existing capsule enforcement + `getCapsuleMetadata` select clause extended with `jurisdiction` (minimum-touch; full projection repair forward-queued per D-COSMP-METADATA-SELECT-CLAUSE-DRIFT) + 4 jurisdiction failure codes mapped to HTTP 403 at `cosmp.routes.ts` statusForCode + REGULATOR `LawfulBasis.jurisdiction_invoked` ↔ `MemoryCapsule.jurisdiction` match via basis-authoritative actor substitution (per Q1 LOCKED Option α at sub-phase 5) with null-capsule backward-compat guard (per Q-RULE-13-REGULATOR-NULL-CAPSULE-POLICY LOCKED Option α). 6-sub-phase mini-arc per ADR-0037 §Implementation Detail: sub-phase 1 `[CAR-SUB-BOX-2-ADR]` `c72fabd` ADR-0037 (Proposed) + this row IN FLIGHT + ADR-0036 §References RULE 14 back-cite landed; sub-phase 2 `[CAR-SUB-BOX-2-SCHEMA]` `93f96ec` +4 nullable jurisdiction columns + 3 indexes + ORG_SETTINGS_DEFAULTS/MergedOrgSettings/getOrgSettingsOrDefaults substrate-coherence amendment per Q-RULE-13-ORG-SETTINGS-DEFAULTS LOCKED Option α; sub-phase 3 `[CAR-SUB-BOX-2-SERVICES]` `3fab20d` NEW `jurisdiction-enforcement.ts` + Entity/Capsule/Audit jurisdiction passthrough + narrow `@niov/api` re-export per Q-RULE-13-INTERNAL-HELPER-TEST-IMPORT LOCKED Option α (17 unit tests); sub-phase 4 `[CAR-SUB-BOX-2-COSMP-ENFORCEMENT]` `6efdf44` NEGOTIATE start-check + readContent TOCTOU re-check + SHARE per-capsule + REVOKE bounded-bridge fetch + WRITE create cascade + WRITE update enforcement + getCapsuleMetadata select extension + 4 jurisdiction codes → 403 (20 integration tests); sub-phase 5 `[CAR-SUB-BOX-2-REGULATOR-INTEGRATION]` `7faf2ac` basis-authoritative substitution + null-capsule backward-compat guard + REGULATOR jurisdiction-denial audit enrichment (7 integration tests Section I); sub-phase 6 `[CAR-SUB-BOX-2-CLOSURE]` this commit ADR-0037 Status: Proposed → Accepted + Post-Closure Implementation Lineage block + this row CLOSED + architecture/README + CLAUDE.md ADR catalog ADR-0037 entry minimum-touch + CURRENT_BUILD_STATE.md minimum-touch entry. ADR-0037 Sub-decisions 1-9 all RESOLVED (per ADR-0037 §Post-Closure Implementation Lineage). **Preserved substrate-coherence boundaries at substantive register substantively**: AuditEvent.jurisdiction remains row metadata only (NOT in canonical_record/1 per Q-NEW-3 LOCKED Option β); canonical_record/1 remains 14 fields; Elixir audit-chain UNCHANGED; 12 fixture pairs UNCHANGED; cosmp_router default tier 137/0 PRESERVED. **Test substrate at closure**: TypeScript baseline 12 preserved (Sub-phase 4 surfaced substrate improvement at `getCapsuleMetadata` missing-fields list — jurisdiction removed — without count drift); unit tier 508/508; integration tier 198 + 1 skipped (171 baseline + 20 sub-phase 4 + 7 sub-phase 5); cosmp_router default tier 137/0; CI green at every sub-phase landing. **Patent relevance: NONE directly** per CAR §1.6 verbatim. 5 substrate-build observations forward-queued in commit-body-only canonical at substantive register substantively per Q-NEW-9 LOCKED at sub-phase 1 + subsequent sub-phase LOCKs (D-SCHEMA-DEFAULT-CONSTANT-COHERENCE-DRIFT + D-INTERNAL-HELPER-UNIT-TEST-IMPORT-CONVENTION + D-COSMP-METADATA-SELECT-CLAUSE-DRIFT + D-REGULATOR-ACTOR-JURISDICTION-POLICY-DECISION + D-REGULATOR-NULL-CAPSULE-BACKWARD-COMPAT-BOUNDARY); NOT promoted to ADR-0035 §9 numbered cluster. **Downstream sub-boxes dependency-unblocked at substrate-state ground truth register substantively**: CAR Sub-box 4 (DecisionRecord + DataSubjectReference + Agent Attestation per CAR §2.5/§2.7/§3.6 — data subject jurisdiction now available); CAR Sub-box 5 (jurisdiction-aware deletion variants + GDPR Article 17 pseudonymization per CAR §2.6/§3.4 — jurisdiction-scoped deletion now possible); CAR Sub-box 8 (Cross-Tenant Compliance Benchmarking per CAR §3.5 — meta-jurisdiction aggregates now possible); CAR Sub-box 9 (Capsule Compliance Provenance per CAR §3.7 — capsule jurisdictional anchor now persisted). **Forward-queued items preserved at substrate-state ground truth register substantively** (per ADR-0037 §Forward Queue): physical data residency enforcement; legal transfer determination engine (Schrems II / GDPR Article 44-50); real-time country/legal rules engine; cross-region capsule transfer workflow; multi-jurisdiction capsule support; canonical_record/1 jurisdiction binding (cryptographic) if future evidence justifies; Cross-Tenant Compliance Benchmarking patent-relevance analysis per CAR §1.6 forward path; AuditEvent.jurisdiction automatic operation-context propagation refinement; GLOBAL wildcard / jurisdiction vocabulary lock; grantee↔capsule or grantee↔actor jurisdiction checks for SHARE if future policy requires; full `getCapsuleMetadata` projection repair (D-COSMP-METADATA-SELECT-CLAUSE-DRIFT). **NOT claimed**: legal compliance certification; physical data residency enforcement; full FedRAMP / CMMC / GDPR certification; legal transfer determination; real-time country/legal rules engine; multi-jurisdiction capsule support; cross-region transfer workflow; canonical_record/1 jurisdiction binding (cryptographic); per-target LawfulBasis binding; grantee jurisdiction checks at SHARE; GLOBAL wildcard; Sub-boxes 4 / 5 / 8 / 9 implementation; full DMW-to-DMW orchestration; BEAM/Broadway high-volume orchestration in this mini-arc; Federation Cloud monetization; external PKI / EU eIDAS / national registry integration; direct patent relevance. The 6-sub-phase CAR Sub-box 2 mini-arc is CLOSED. |
| 12.5 CAR Sub-box 3 — REGULATOR + Lawful-Basis (2.1 + 2.2) | **CLOSED** | `4981d3a` → `db6e0d7` → `d0b5c64` → `f9d0694` → `71af2c6` → `d6f9e18` → this commit | The REGULATOR principal class (distinct from GOVERNMENT) + LawfulBasis Prisma model + LawfulBasisType enum + REGULATOR_ACCESS_GRANTED/REVOKED/EXPIRED-reserved event types + hybrid cryptographic binding (lawful_basis_id + lawful_basis_chain_hash) into COSMP audit chain canonical_record/1 at TS↔Elixir byte-equivalence + dual-control on regulator-grant routes + credentialing-authority authentication pattern + REGULATOR lawful-basis enforcement at COSMP NEGOTIATE/readContent/SHARE/REVOKE entry points. **Patent-relevant per CAR §2.2 Family 1** — extends US 12,164,537 (COSMP) + US 12,399,904 (DMW). 7-sub-phase mini-arc per ADR-0036 §Implementation Detail: sub-phase 1 `[SUB-BOX-3-ADR]` `4981d3a` ADR-0036 + ADR-0035 §9 35th D-CAR-SUB-BOX-NUMBERING-DRIFT + RULE 14 back-cites to ADR-0019/0020/0026/0033; sub-phase 2 `[SUB-BOX-3-SCHEMA]` `db6e0d7` EntityType.REGULATOR + 3 TAR fields (regulator_jurisdiction + regulator_authority_scope + regulator_credentialed_by) + LawfulBasisType enum (6 values: SUBPOENA + REGULATORY_AUTHORITY + COURT_ORDER + DPA_REQUEST + MLAT_REQUEST + CONSENT_OF_DATA_SUBJECT) + LawfulBasis Prisma model; sub-phase 3 `[SUB-BOX-3-SERVICES]` `d0b5c64` LawfulBasis canonical hash helpers + REGULATOR validation (32 unit tests); sub-phase 4 `[SUB-BOX-3-AUDIT-CHAIN]` `f9d0694` canonical_record/1 12 → 14 fields at TS + Elixir registers + LawfulBasis Elixir mirror + 12 fixture pairs + AuditEvent row schema +2 columns (lawful_basis_id + lawful_basis_chain_hash) + ADR-0033 §Decision 4a inline amendment + ADR-0036 Sub-decision 5 backwards-compat deployment-state precondition clarification; sub-phase 5 `[SUB-BOX-3-ROUTES]` `71af2c6` REGULATOR grant + revoke routes + dual-control binding (Operation C + Operation D in PRIVILEGED_ENDPOINTS; both can_admin_niov-tier preserving Tension 3 Category (1) invariant) + 3 event_type literals landed at AUDIT_EVENT_TYPE_VALUES + audit-event-only revocation model (no durable RegulatorAccessGrant table; revoke target-attribution via LawfulBasis.audit_id → AuditEvent.target_entity_id chain) + ADR-0036 Sub-decision 8 RESOLVED in commit body (NO new SYSTEM_PRINCIPAL; SYSTEM_PRINCIPALS frozen-anchor count remains 5) (23 integration tests); sub-phase 6 `[SUB-BOX-3-COSMP-ENFORCEMENT]` `d6f9e18` REGULATOR lawful-basis enforcement at NEGOTIATE start-check + readContent TOCTOU re-check + SHARE start-check + REVOKE share start-check + getActiveLawfulBasisForRegulator 9-condition active-grant query helper (3 indexed point-lookups; no scans) + enforceRegulatorCOSMPAccess shared service-tier helper + X-Lawful-Basis-Id HTTP header transport + 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction (forward-portable to ADR-0028 Elixir Broadway pipeline) (18 integration tests); sub-phase 7 `[SUB-BOX-3-CLOSURE]` this commit ADR-0036 Status: Proposed → Accepted + Post-Closure Implementation Lineage block + this row CLOSED + architecture/README + CLAUDE.md ADR catalog ADR-0036 entry + CURRENT_BUILD_STATE.md minimum-touch entry + dual-control-operations-canonical-record.md head amendment note. ADR-0036 Sub-decisions 1-8 all RESOLVED (per ADR-0036 §Post-Closure Implementation Lineage). 5 substrate-build observations forward-queued in commit-body-only canonical at substantive register substantively per Q-NEW-9 LOCKED at sub-phase 6 + Q-NEW-3 LOCKED at sub-phase 7 (D-LAWFUL-BASIS-IS-AUTHORITY-TIER-NOT-PER-TARGET + D-OPERATION-SCOPE-VOCABULARY-GAP + D-NO-CENTRALIZED-ENFORCEMENT-BOTTLENECK-AT-TS-REGISTER + D-COSMP-IS-ORCHESTRATION-NOT-SINGLE-REQUEST-RESPONSE-LAYER + D-SUB-PHASE-6-IS-ENFORCEMENT-SLICE-NOT-FULL-ORCHESTRATION); NOT promoted to ADR-0035 §9 numbered cluster. **Whole-COSMP scalability discipline canonical at substantive register substantively per sub-phase 6 commit-body §Whole-COSMP scalability and orchestration alignment**: per-request indexed point-lookups + no global locks + no unbounded capsule scans + no capsule-content authorization reads + no cross-request caching + revocation/expiry fail-closed for new checks IMPLEMENTED at TS COSMP route/service tier; whole-COSMP high-concurrency orchestration substrate (BEAM/Broadway/GenStage backpressure; per-capsule supervision; cross-DMW coordination layer; per-DMW throughput controls; streaming capsule push/pull semantics; billion-scale operation under live concurrent load) remains architectural intent / forward-substrate per ADR-0028 + the 6 BEAM-compatibility patterns from ADR-0026 §5; NOT implemented. **Forward-queued items preserved at substrate-state ground truth register substantively** (12 items per Sub-phase 7 closure preservation): CAR Sub-box 2 Jurisdiction Tagging remains QUEUED (distinct substrate per ADR-0036 §Substrate-Honest Distinctions; `Entity.jurisdiction` + `MemoryCapsule.jurisdiction` + `AuditEvent.jurisdiction` + `OrgSettings.default_jurisdiction` + `assertJurisdictionalScope()` NOT landed); per-target-entity LawfulBasis binding (D-LAWFUL-BASIS-IS-AUTHORITY-TIER-NOT-PER-TARGET); operation-type scope vocabulary unification (D-OPERATION-SCOPE-VOCABULARY-GAP; CAPSULE_READ / CAPSULE_SHARE / CAPSULE_REVOKE constants); REGULATOR_ACCESS_EXPIRED scheduler emission using existing SYSTEM_PRINCIPALS.SCHEDULER (literal reserved at sub-phase 5; NOT emitted); full BEAM/Broadway/GenStage high-volume orchestration tier per ADR-0028 forward-substrate; full DMW-to-DMW / agent-to-agent orchestration substrate; per-DMW backpressure / partitioning / throughput controls; streaming capsule push/pull semantics with provenance attribution per chunk; per-capsule jurisdiction enforcement (depends on CAR Sub-box 2); real-time credentialing-authority registry / CRL / National PKI / EU eIDAS integration per ADR-0036 Sub-decision 7 §Forward-queued; active-grant materialized view OR cached-active-grant table only if future query density proves need (sub-phase 6 substrate uses per-request indexed point-lookup; sufficient at canonical scale); DMW whole-system architecture ADR if later needed (sub-phase 6 operator clarification canonicalizes whole-COSMP framing as architectural intent). The 7-sub-phase Sub-box 3 mini-arc is CLOSED. |
| 12.5 CAR Sub-boxes 4-9 | QUEUED | — | Dependency-ordered per `COMPLIANCE_ARCHITECTURE_REVIEW.md` §Recommended Sequencing. Sub-box 4 (DecisionRecord + DataSubjectReference + Agent Attestation) depends on CAR Sub-box 2 jurisdiction tagging. Sub-box 5 (EntityIdentity + Pseudonymization + Erasure) depends on CAR Sub-box 2. Sub-box 6 (NIST Control Mappings) independent. Sub-box 7 (ComplianceAttestation) depends on Sub-box 6 + CAR Sub-box 4. Sub-box 8 (Cross-Tenant Compliance Benchmarking) depends on CAR Sub-box 2. Sub-box 9 (Capsule Compliance Provenance) depends on CAR Sub-box 2 + Sub-box 6. |
| Phase 3 Sub-Arc 1 Sub-Phase b — Hive-Scale Per-DMW Dispatch ENTERPRISE per ADR-0039 | **CLOSED** (`a0ed2c5` → `9069430` → `eb6daee` → `7709993` → `4c52271` → `768736b` → `24d3b52` → `57b9f8d` → `eb6482d` → `67f6112` → `3242c17` → this commit) | this commit | Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase b Commit 1 of 7 per ADR-0039 §Decision Sub-decision 9 7-commit mini-arc decomposition (ADR + Operations pure-module + Horde substrate + WalletLookup + WalletCache + integration + closure). ADR-0039 NEW (Hive-Scale Per-DMW Dispatch Substrate for ENTERPRISE Wallets; Status Proposed 2026-05-16) + ADR-0028 §Forward Queue NEW append-only LANDED sub-paragraph (sub-arc 1 sub-phase b ENTERPRISE hive-scale dispatch update; per-DMW COSMP execution progresses at ENTERPRISE tier per ADR-0039 per Horde plus cosmp_router pure-module refactor plus DMWWorker COSMP handlers plus ETS read-cache substrate) + ADR-0028 §Bidirectional citations (cited from) NEW entry (RULE 14 back-citation) + catalog refreshes across architecture/README + CLAUDE + this row NEW + CURRENT_BUILD_STATE NEW H2 section. ADR-0039 canonicalizes 13 sub-decisions at substrate-architectural register: per-DMW GenServer via Horde Registry + Horde DynamicSupervisor + cosmp_router pure-module refactor at single-source-of-truth register (Elixir anti-pattern resolution at canonical Elixir hexdocs register) + DMWWorker COSMP op handlers invoking CosmpRouter.Operations primitives at module-level register + NEW CosmpRouter.WalletLookup module + NEW ETS read-optimized cache + COSMP protobuf envelope entity_id extension + tier-routed dispatch shim at grpc/server.ex + ENTERPRISE-only scope + 7-commit mini-arc + 6 BEAM-compatibility patterns preserved + Elixir anti-pattern compliance + testability per ADR-0034 + patent-implementation evidence at canonical decision register. Q-A through Q-G operator-tier locks all approved at recommended defaults α at canonical decision register substantively at Option α Path (e) Hive substrate canonical at canonical-knowledge register substantively informed by 5 rounds of research at canonical Elixir/BEAM register substantively. **Substrate-architectural framing canonical at substantive register**: Discord per-entity GenServer precedent at canonical production register substantively at millions-of-entities scale + Horde Registry + Horde DynamicSupervisor at distributed cluster register + ETS read-optimized cache at per-node register + cosmp_router pure-module refactor at single-source-of-truth register substantively delivers canonical Elixir + BEAM pattern at production register substantively that substantively delivers the patent at hive scale register substantively at patent-implementation evidence register substantively. **Substrate-state ground truth register**: sub-phase b delivers per-DMW parallelism at hive scale at runtime for ENTERPRISE tier; the architectural target named in the README and monetization essay (hundreds to thousands of parallel COSMP operations per DMW for the workloads that need it; hive intelligence across millions of memory capsules with push and pull dataflow in real time and no parallel action bottleneck) delivers at runtime for ENTERPRISE tier at sub-phase b closure (Commit B.7); PERSONAL/AI_AGENT promote-on-activity substrate forward-substrate to sub-phase c; DEVICE cold-shard substrate forward-substrate to sub-phase d; Phoenix.PubSub hive fanout + Broadway pipeline + hive algorithm at weighting architecture per Entry #28 forward-substrate to sub-phase c + sub-phase d + sub-arc 2. **7-commit decomposition** per ADR-0039 §Decision Sub-decision 9: Commit B.1 `[BEAM-DBGI-HIVE-DISPATCH-ADR]` docs-only at this commit; Commit B.2 `[BEAM-COSMP-OPERATIONS-PURE-MODULE]` NEW Operations module + MOD Router delegation + unit tests forward-substrate; Commit B.3 `[BEAM-DBGI-HORDE-SUBSTRATE]` NEW Horde Registry + Horde DynamicSupervisor children + Horde dependency + public API + unit tests forward-substrate; Commit B.4 `[BEAM-DBGI-WALLET-LOOKUP-CODE]` NEW WalletLookup module + unit tests forward-substrate; Commit B.5 `[BEAM-DBGI-WALLET-CACHE-ETS]` NEW WalletCache ETS module + supervised table + unit tests forward-substrate; Commit B.6 `[BEAM-DBGI-HIVE-DISPATCH-INTEGRATION]` MOD protobuf entity_id + MOD cosmp-client.ts + MOD DMWWorker COSMP handlers + MOD grpc/server.ex tier-routed dispatch shim + integration tests forward-substrate; Commit B.7 `[BEAM-DBGI-HIVE-DISPATCH-CLOSURE]` docs-only closure cascade forward-substrate. |
| Phase 3 Sub-Arc 1 Sub-Phase c — PERSONAL Promote-on-Activity per ADR-0039 Amendment 1 | **CLOSED** (`d09b80b` → `1dd1d64` → `18300c3` → `b7fa258` → this commit) | this commit | Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase c CLOSED at Commit 5 of 5 per 5-commit mini-arc decomposition canonical at operator decision register substantively. ADR-0039 Amendment 1 LANDED at C.4 `b7fa258` canonical at canonical-prose register substantively per ADR-0011 §Amendment canonical convention (H2 Amendment subsection canonical at canonical-prose register substantively preserves Accepted §Sub-decision 8 body at canonical-honest register substantively per ADR-0020 two-register IP discipline canonical). PERSONAL promote-on-activity substrate canonical at canonical-execution register substantively: ActivityCounter ETS atomic counter (C.1; `:ets.update_counter/4` + `decentralized_counters: true` per dockyard.com production rate-limiter pattern register substantively) + stop_dmw_worker_horde/2 Horde-API trio symmetry + idle eviction periodic task (C.2; Process.send_after self-tick + `:ets.select/2` match-spec + defensive handle_info catch-all) + dispatch_with_promote_check/4 + dispatch_promoted/4 helpers at grpc/server.ex (C.3; record_activity + should_promote? threshold check + lazy-spawn DMWWorker via Horde via-tuple on threshold crossover) + ADR-0039 Amendment 1 widening §Sub-decision 8 scope from ENTERPRISE-only to ENTERPRISE + PERSONAL-promoted with AI_AGENT disposition forward-substrate (C.4). **Substrate-state ground truth at closure register substantively**: PERSONAL entities promote to per-DMW DMWWorker via Horde Registry on activity threshold crossover (default 5 activities) canonical at canonical-execution register substantively + idle eviction releases DMWWorker resources when inactivity exceeds configured idle TTL (default 5 minutes) canonical at canonical-coherence register substantively + DEVICE entities preserve sub-phase a Router fallback canonical at backward-compat register substantively (forward-substrate to sub-phase d cold-shard substrate per ADR-0038 Sub-decision 3 tier 3 register) + AI_AGENT disposition forward-substrate at sub-arc 2 capsule layer canonical at canonical-coherence register substantively (AI_AGENT canonical at EntityType register substantively per ADR-0033 cross-language data ownership register substantively NOT WalletType register; Prisma WalletType enum enumerates PERSONAL + ENTERPRISE + DEVICE only canonical at canonical-coherence register substantively per D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation canonical at C.3 commit body register substantively). **Test surface at closure**: cosmp_router default + integration 196/0 + 1 skipped (172 baseline at B.7 + 11 NEW ActivityCounter at C.1 + 11 NEW eviction at C.2 + 6 NEW promote_on_activity at C.3 - reconciled to 196 absolute per actual test count at canonical-state register substantively) + dbgi_supervisor default 67/0 (63 baseline at B.7 + 4 NEW stop_dmw_worker_horde at C.2; 19 excluded by default) + dbgi_supervisor integration 86/0; CI green at every commit landing. **5-commit decomposition LANDED**: Commit C.1 `[BEAM-DBGI-PROMOTE-ACTIVITY-COUNTER]` `d09b80b` NEW ActivityCounter ETS substrate + supervision tree integration + 11 unit tests; Commit C.2 `[BEAM-DBGI-PROMOTE-IDLE-EVICTION]` `1dd1d64` NEW stop_dmw_worker_horde/2 + eviction periodic task + DMWWorker stop + 11 NEW tests (4 stop + 7 eviction); Commit C.3 `[BEAM-DBGI-PROMOTE-TIER-ROUTED-DISPATCH]` `18300c3` MOD grpc/server.ex dispatch_tier_routed PERSONAL branch + NEW dispatch_with_promote_check/4 + dispatch_promoted/4 + 6 NEW promote_on_activity integration tests; Commit C.4 `[BEAM-DBGI-PROMOTE-ON-ACTIVITY-ADR-AMENDMENT]` `b7fa258` ADR-0039 NEW H2 Amendment 1 section (+159 lines; §Sub-decision 8 scope widening + AI_AGENT disposition + implementation lineage); Commit C.5 `[BEAM-DBGI-PROMOTE-ON-ACTIVITY-CLOSURE]` this commit docs-only closure cascade (this row NEW CLOSED + architecture/README + CLAUDE.md ADR-0039 entry refresh + CURRENT_BUILD_STATE H2 CLOSED + ADR-0035 cluster expansion 26th + 27th observations promoted). **Forward-substrate at canonical-state register**: sub-arc 1 sub-phase d (DEVICE cold-shard substrate at canonical-architectural register substantively per ADR-0038 Sub-decision 3 tier 3 register) + sub-arc 2 (capsule layer canonical at canonical-coherence register substantively per memory entry weighting architecture substantively; AI_AGENT EntityType-discriminated dispatch forward-substrate at this register) + sub-arc 3 (benchmark + bi-temporal + tier automation canonical at canonical-state register substantively). 14 substrate-build observations forward-queued at commit-body-only register substantively per Option β substrate-honest discipline (D-ETS-ATOMIC-COUNTER-CANONICAL + D-DECENTRALIZED-COUNTERS-OPTIMIZATION-CANONICAL + D-HORDE-API-TRIO-SYMMETRY-CANONICAL + D-GENSERVER-PERIODIC-TASK-CANONICAL + D-DEFENSIVE-HANDLE-INFO-CATCH-ALL-CANONICAL + D-ETS-SELECT-MATCH-SPEC-CANONICAL + D-TEST-FIXTURE-COUNT-MISMATCH-PRE-COMMIT-DETECTION-DISCIPLINE + D-PROMOTE-ON-ACTIVITY-DISPATCH-CANONICAL + D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT + D-DISPATCH-SHIM-PROMOTE-CHECK-PATTERN-CANONICAL + D-DEVICE-SKIPS-PROMOTE-CHECK-AT-SUBSTRATE-STATE + D-ADR-AMENDMENT-PRESERVES-ACCEPTED-BODY-CANONICAL + D-PROSE-ONLY-COMMIT-CANONICAL + D-ADR-AMENDMENT-H2-VS-H3-DISCRIMINATION); 2 PROMOTED to ADR-0035 cluster expansion at C.5 register substantively (26th D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT recurrence-3 + 27th D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-BEFORE-PREMISE-LOCK recurrence-6). The 5-commit sub-arc 1 sub-phase c mini-arc is CLOSED. |
| Phase 3 Sub-Arc 2 — Capsule Layer Substrate Umbrella per ADR-0041 | **IN FLIGHT** (`this commit`) | this commit | Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 2 capsule layer substrate umbrella IN FLIGHT at CL.1 docs-only umbrella commit register substantively per ADR-0041 §Sub-decision 1 Option B umbrella + per-gap ADR strategy register substantively per Founder Q-A LOCKED at [BEAM-CAPSULE-LAYER-QLOCK] register substantively. **CL.1 LOCKS the umbrella architecture only canonical at canonical-prose register substantively at this commit register substantively. CL.1 does NOT close Sub-arc 2 at canonical-state register substantively. Sub-arc 2 remains IN FLIGHT at canonical-state register substantively. Per-gap implementation closure remains forward-substrate to ADR-0042 (Gap 1 Mutation Discrimination) + ADR-0043 (Gap 3 pgvector Embedding) + ADR-0044 (Gap 4 Decay Execution Formalization) + ADR-0045 (Gap 5 Capsule-Level Staleness Detection) + optional ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing) per Founder Q-C LOCKED at canonical-coherence register substantively. Final Sub-arc 2 closure requires a later closure cascade canonical at canonical-state register substantively (per-gap mini-arc total commit count NOT locked at this register substantively).** ADR-0041 NEW (Capsule Layer Substrate Umbrella; Status Proposed 2026-05-17) embeds CL.0 [BEAM-CAPSULE-LAYER-RESEARCH-ARC] Rule 21 research arc canonical at canonical-knowledge register substantively (5 parallel WebSearches + 14 documented sources: pgvector + OpenAI text-embedding-3 + event sourcing mutation + temporal decay + knowledge staleness). ADR-0041 canonicalizes 9 sub-decisions at substrate-architectural register substantively per Founder Q-A through Q-L LOCKS at [BEAM-CAPSULE-LAYER-QLOCK] register substantively + Founder RULE 0 continuity patch at [BEAM-CAPSULE-LAYER-ADR-RULE0-PATCH] register substantively + Founder CL.1 scope patch at [BEAM-CAPSULE-LAYER-ADR-CL1-SCOPE-PATCH] register substantively: umbrella + per-gap ADR strategy (Option B); ADR-0042 forward-substrate Gap 1 Mutation Discrimination (ADD/UPDATE/MERGE/NOOP NIOV-domain enum; greenfield at code register); ADR-0043 forward-substrate Gap 3 pgvector Embedding (HNSW + cosine LOCKED; text-embedding-3-small at 1536 dims LOCKED; greenfield at code/schema register); ADR-0044 forward-substrate Gap 4 Decay Execution Formalization (lazy-at-read LOCKED; partial at canonical-state register); ADR-0045 forward-substrate Gap 5 Capsule-Level Staleness Detection (distinct from feedback-loop; greenfield at capsule register); AI_AGENT EntityType-discriminated capsule routing (Q-J LOCKED; AI_AGENT remains EntityType NOT WalletType; AI_AGENT continues mapping to PERSONAL wallet_type for storage tier per defaultWalletTypeFor/1 helper); weighting architecture per Entry #28 reference (document-register only); testability + migration discipline per ADR-0034 + ADR-0025 + ADR-0033; patent-implementation evidence per ADR-0020 + RULE 0 governance canonical at canonical-rule register substantively. **Substrate-architectural framing canonical at substantive register**: capsule layer is patent-implementation core per US 12,517,919 + US 12,164,537 + US 12,399,904; RULE 0 (Humans Always Sovereign) governs every Sub-arc 2 substrate-architectural decision at canonical-rule register substantively. **Substrate-state ground truth register**: MemoryCapsule Prisma schema canonical (27 fields + CapsuleType 20-value enum + DecayType 5-value enum + EntityType distinct from WalletType); COSMP TypeScript services exist (negotiate/read/share/write/jurisdiction-enforcement/regulator-enforcement); Elixir capsule substrate exists (capsule/ + capsule.ex + schemas/memory_capsule.ex per ADR-0031 7-layer + ADR-0033 cross-language); Gap 1 greenfield + Gap 3 greenfield + Gap 4 partial (lazy-at-read at coe.service.ts:235) + Gap 5 greenfield (feedback-loop staleness exists separately at feedback.service.ts:169 distinct register); AI_AGENT EntityType + AI_AGENT detection exist at negotiate.service.ts:143 but capsule-routing branch greenfield. **Per-gap forward-substrate at canonical-state register**: ADR-0042 (Gap 1) + ADR-0043 (Gap 3) + ADR-0044 (Gap 4) + ADR-0045 (Gap 5) + optional ADR-0046 (AI_AGENT capsule routing if ADR-0041 §Sub-decision 1 + ADR-0042 prose determines separate ADR warranted at canonical-coherence register substantively); per-gap mini-arcs land canonical at canonical-execution register substantively at per-gap commit lineages register substantively. **CL.1 docs-only commit register substantively LOCKS the ADR-0041 umbrella architectural substrate canonical at canonical-prose register substantively; implementation closure remains forward-substrate to per-gap ADR mini-arcs + final Sub-arc 2 closure cascade canonical at canonical-state register substantively per Founder CL.1 scope patch at [BEAM-CAPSULE-LAYER-ADR-CL1-SCOPE-PATCH] register substantively.** **Gap 1 Capsule Mutation Discrimination CLOSED** at G1.6 `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` register substantively. G1.1-G1.6 all LANDED at canonical-execution register substantively per ADR-0042 §Sub-decision Q-μ 6-commit mini-arc decomposition. Lineage: G1.1 `2cb0028` [BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR] docs-only ADR + G1.2 `dfcbbb1` [CAPSULE-MUTATION-PRISMA-MIGRATION] substantive Prisma migration + G1.3 `16c562c` [CAPSULE-MUTATION-WRITE-SERVICE] substantive write-service discrimination + G1.3-fix `8f047de` [CAPSULE-MUTATION-WRITE-SERVICE-G1.3-INTEGRATION-FIX] minimal integration test waiver extension + G1.4 `3505fde` [CAPSULE-MUTATION-ELIXIR-AUDIT] formal SKIP record per Q-ι default LOCK + G1.5 `16567eb` [CAPSULE-MUTATION-TESTS] substantive tests + G1.6 this commit [BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE] docs-only closure cascade. D-TEST-TIER-WAIVER-SCOPE-PRECISION substrate-build observation promoted to ADR-0035 §9 cluster as 36th canonical at G1.6 per Q-G1.6-α LOCK. **Gap 3 pgvector Embedding IN FLIGHT** at G3.1 `[BEAM-CAPSULE-EMBEDDING-ADR]` register substantively. ADR-0043 NEW Proposed 2026-05-17; G3.1 LOCKS architecture only at canonical-prose register substantively. G3.1 does NOT close Gap 3 at canonical-state register substantively. Gap 3 closure requires G3.2-G3.10 substantively per ADR-0043 §Sub-decision 11 (Q-G3-κ). 11 Q-G3 sub-decisions / locks Q-G3-α through Q-G3-κ all LOCKED at `[CAPSULE-EMBEDDING-ADR-0043-QLOCK-DISPOSITION]` register substantively. **G3.2 LANDED** at `[CAPSULE-EMBEDDING-INFRA]` register substantively (2026-05-17). pgvector-enabled Postgres image pin `pgvector/pgvector:0.8.2-pg16-trixie` LANDED at local/test/CI per ADR-0043 §Sub-decision 1 (Q-G3-α LOCK) + Q-G3.2-α LOCK at `[CAPSULE-EMBEDDING-INFRA-G3.2-QLOCK]`. 5 substantive image substitutions across 3 infra files (docker-compose.test.yml + .github/workflows/ci.yml + .github/workflows/nightly-real-llm.yml) + 4 prose/comment refresh sites at ci.yml. ADR-0013 + ADR-0015 + ADR-0016 amended in-place at G3.2 per Q-G3.2-γ/δ/ε. G3.2 does NOT close Gap 3 at canonical-state register substantively. **G3.3 LANDED** at `[CAPSULE-EMBEDDING-SCHEMA]` register substantively (2026-05-17). Prisma `embedding Unsupported("vector(1536)")?` field + `previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]` LANDED per ADR-0043 §Sub-decision 2 (Q-G3-β LOCK) + 12 Q-G3.3-α through Q-G3.3-λ LOCKS at `[CAPSULE-EMBEDDING-SCHEMA-G3.3-QLOCK]`. NEW `scripts/apply-pgvector-extension.ts` + `scripts/apply-hnsw-index.ts` per Q-G3.3-ζ. `scripts/test-db-up.sh` retrofit to 5-step bring-up (compose up → extension → push → audit triggers → HNSW index) per Q-G3.3-θ. CI Unit/Integration/Elixir tiers + nightly-real-llm orchestration updated per Q-G3.3-η. HNSW index `memory_capsules_embedding_hnsw_idx` USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL AND deleted_at IS NULL — partial per Q-G3.3-β; defaults m=16, ef_construction=64 per Q-G3.3-ε. D-G3.3-LOCAL-CONTAINER-DRIFT surfaced docs-only per Q-G3.3-λ (ADR-0035 promotion deferred to G3.10). G3.3 does NOT close Gap 3. **G3.4 LANDED** at `[CAPSULE-EMBEDDING-PROVIDER]` register substantively (2026-05-17). Embedding provider abstraction LANDED per ADR-0043 §Sub-decision 3 (Q-G3-γ LOCK; text-embedding-3-small @ 1536 dims) + 12 Q-G3.4-α through Q-G3.4-λ LOCKS at `[CAPSULE-EMBEDDING-PROVIDER-G3.4-QLOCK]`. NEW `apps/api/src/services/embedding/embedding.service.ts` single-file per Q-G3.4-α (mirrors `llm.service.ts`) with EmbeddingProvider interface + EmbeddingResult discriminated union (5 error_class values per Q-G3.4-κ: AUTH / RATE_LIMIT / PROVIDER_ERROR / DIMENSION_MISMATCH / VALIDATION) + OpenAIEmbeddingProvider (reuses OPENAI_API_KEY per Q-G3.4-θ) + FixtureBasedEmbeddingProvider (deterministic SHA-256-based 1536-dim vectors per Q-G3.4-γ) + getEmbeddingProvider() factory (Q-G3.4-β) + computeFixtureVector helper. NEW `tests/unit/embedding.test.ts` with 10 unit tests per Q-G3.4-η; no real OpenAI calls. `apps/api/src/index.ts` barrel re-export per Q-G3.4-ι. No new dependency (openai SDK already at L42). No write/retrieval integration (G3.5/G3.6 forward-substrate). No ADR-0022 amendment (Q-G3-δ preserved). G3.4 does NOT close Gap 3. **G3.5 LANDED** at `[CAPSULE-EMBEDDING-WRITE-INTEGRATION]` register substantively (2026-05-17). Write-path integration LANDED per ADR-0043 §Sub-decision 9 (Q-G3-ι mutation_type matrix) + 12 Q-G3.5-α through Q-G3.5-λ LOCKS at `[CAPSULE-EMBEDDING-WRITE-G3.5-QLOCK]`. MOD `apps/api/src/services/cosmp/write.service.ts` 6th constructor arg `embeddingProvider: EmbeddingProvider` per Q-G3.5-δ; createCapsule + updateCapsule UPDATE branches call `embeddingProvider.generateEmbedding`; MERGE per Q-G3.5-β skips (content_hash unchanged); NOOP per Q-G3-ι preserves. Inline `tx.$executeRawUnsafe('UPDATE memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id = $2::uuid', ...)` at 2 sites per Q-G3.5-γ. MOD `apps/api/src/server.ts` passes `getEmbeddingProvider()`. Failure policy = degrade gracefully per Q-G3.5-α (RULE 0; capsule writes succeed even on provider outage; embedding NULL preserved; G3.7 lazy backfill catches). Audit metadata per Q-G3.5-η: success = `embedding_generated/model/dimensions/tokens_used`; degrade = `embedding_generated: false, embedding_failure_class, embedding_failure_message`; MERGE-skip = `embedding_skip_reason`. NEVER vector content. MOD `tests/unit/cosmp/write.test.ts` (26 baseline + 9 NEW E1-E9 ADD/UPDATE/MERGE/NOOP + degrade matrix; E7 + E8 verbatim test names provide degrade-policy behavioral proof) + `tests/unit/feedback.test.ts` makeServices() updated; NEW `tests/integration/embedding-write.test.ts` verifies DB persistence via raw SQL queryRaw + API-boundary no-vector + MERGE preservation. No CircuitBreaker (Q-G3.5-θ). No `CAPSULE_SIMILARITY_SEARCH` literal (Q-G3.5-ι deferred to G3.6). No ADR-0022 amendment (Q-G3-δ preserved). G3.5 does NOT close Gap 3. **G3.6 LANDED** at `[CAPSULE-EMBEDDING-RETRIEVAL]` register substantively (2026-05-18). Standalone similarity retrieval API LANDED per ADR-0043 §Sub-decision 11 + 10 Q-G3.6 LOCKS at `[CAPSULE-EMBEDDING-RETRIEVAL-G3.6-QLOCK]`. NEW `apps/api/src/services/cosmp/similarity.service.ts` per Q-G3.6-α α-1 with `SimilarityService.searchBySimilarity` invoking raw SQL pgvector cosine query with 6 RULE 0 SQL-tier privacy filters (wallet_id + deleted_at + ai_access_blocked + requires_validation + clearance_required + embedding NOT NULL) + `ORDER BY embedding <=> $::vector(1536) ASC` + `LIMIT` per Q-G3.6-γ. NEW `POST /api/v1/cosmp/search` route per Q-G3.6-β β-1. HNSW iterative scan `SET LOCAL hnsw.iterative_scan = strict_order` + `SET LOCAL hnsw.ef_search = 100` per Q-G3.6-γ.2 (RULE 21 research arc: pgvector filter-after-scan default caveat; iterative scan canonical remediation in pgvector 0.8.0+). MOD `packages/database/src/queries/audit.ts` appends `CAPSULE_SIMILARITY_SEARCH` literal per Q-G3.6-δ + Q-γ.1 clean-transition (both type union AND array constant). Audit details allowed fields per Q-G3.6-δ: query_length / topK / minSimilarity / result_count / filters_applied / embedding_generated (+ embedding_failure_class/message in degrade). FORBIDDEN audit fields per Q-G3.6-δ: raw query text / truncated query / query_keywords_redacted / query vector / result vectors / vector_hash / embedding_sample / distances / per-dimension stats. Response shape per Q-G3.6-γ.1: matches[].{capsule_id, capsule_type, payload_summary} only; NO vector / NO distance / NO embedding fields. Neutral `emitSimilarityAudit(outcome, ...)` helper per V2 Correction 5; provider failure per Q-G3.6-θ degrades to SUCCESS audit with result_count:0 + embedding_failure_class (NEVER DENIED); empty result per Q-G3.6-ι is SUCCESS (NEVER DENIED); only auth/session/permission/caller-bug failures emit DENIED. topK default 10 / max 50 / reject-larger with TOPK_OUT_OF_RANGE per Q-G3.6-η. COE integration DEFERRED past G3.6 per Q-G3.6-ε: `apps/api/src/services/coe/**` + `apps/api/src/services/coe/keywords.ts` + ADR-0022 ALL UNTOUCHED. NEW `tests/unit/cosmp/similarity.test.ts` 12 unit tests S1-S12 with stable verbatim names (S3-S9+S11 named-block isolation per Tier 1 Gate 15) + NEW `tests/integration/similarity-search.test.ts` 4 integration tests J1-J4 (J1 named-block isolation per Tier 1 Gate 16 / V2 Correction 4 — HTTP response body verified to exclude vector / embedding / distance fields). No CircuitBreaker. No schema/CI/compose/package changes. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.6 does NOT close Gap 3. Sub-arc 2 status field **IN FLIGHT** unchanged by this commit. **G3.7 SKIPPED** at `[CAPSULE-EMBEDDING-BACKFILL]` register substantively (2026-05-18). Conditional lazy backfill formally SKIPPED per ADR-0043 §Sub-decision 5 (Q-G3-ε default disposition) + Q-G3.7-α α-1 LOCK + Q-G3.7-η 5-MOD-docs-only scope LOCK at `[CAPSULE-EMBEDDING-BACKFILL-G3.7-QLOCK]`. Substrate-state at HEAD `371e108` has no proven production population of legacy capsules requiring lazy backfill; every capsule on origin/main was created via post-G3.5 WriteService with embedding generation at create-time. G3.6 similarity service already enforces `embedding IS NOT NULL` graceful-exclusion semantics in raw SQL filter set. Bulk-backfill remains forward-substrate per Q-G3-ε unless Founder explicitly authorizes later. G1.4 SKIP precedent (commit `3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]` per ADR-0042 §Sub-decision Q-ι default LOCK) is the canonical mini-arc SKIP pattern G3.7 mirrors. No code/test changes per Q-G3.7-β/γ/δ/ε/ζ N/A under α-1 SKIP. No audit literal added (no `CAPSULE_EMBEDDING_BACKFILL`). No `apps/api/**` / `tests/**` / `packages/**` / `scripts/**` / schema / CI / package / Elixir changes. ADR-0022 + ADR-0011/0013/0014/0015/0016/0025/0033/0034/0035/0041/0042 ALL UNTOUCHED. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.7 does NOT close Gap 3 at canonical-state register substantively. G3 mini-arc advances 6/10 → 7/10 after G3.7 SKIP lands (G3.1 ADR + G3.2 infra + G3.3 schema + G3.4 provider + G3.5 write-integration + G3.6 retrieval + G3.7 SKIP); G3.8 + G3.9 + G3.10 forward-substrate. Sub-arc 2 status field **IN FLIGHT** unchanged by this commit. **G3.8 LANDED** at `[CAPSULE-EMBEDDING-ELIXIR]` register substantively (2026-05-18). Elixir-boundary contract LANDED per ADR-0043 §Sub-decision 8 (Q-G3-θ β-A LOCK preserved) + 5 Q-G3.8 sub-decisions / locks Q-G3.8-α α-2 + Q-G3.8-β/γ/δ/ε at `[CAPSULE-EMBEDDING-ELIXIR-G3.8-QLOCK]`. **Substantive landing, NOT a SKIP.** Consumer-driven framing: Foundation production readiness DELIBERATELY EXCLUDES Elixir-side vector access at HEAD `ee0b01b` (architectural decision per ADR-0033 §Decision 7 cross-language data-ownership boundary + Q-G3-θ β-A + ADR-0028/0030/0039 BEAM coordination layer scope; NOT a not-yet state). TypeScript/Prisma own vector write (G3.5) + retrieval (G3.6). BEAM/COSMP coordination (cosmp_router 7-RPC + DMW worker + DBGI supervisor) operates over 7 COSMP ops + MemoryCapsule lifecycle/routing — NOT embedding distance. MOD `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex` extends moduledoc with explicit "Embedding column boundary (G3.8 / Q-G3-θ β-A LOCK)" H2 section containing 8 required content elements per Q-G3.8-γ (Prisma-owned + intentionally not Ecto-visible + 4 forward-substrate conditions + RULE 0 safeguards + Q-G3-θ β-A current state + test anchor + D-PGVECTOR-EX naming reconciliation). MOD `apps/cosmp_router/test/cosmp_router/schemas/memory_capsule_test.exs` adds NEW explicit named test (verbatim Q-G3.8-β title: "embedding column is Prisma-owned and intentionally absent from Ecto schema per Q-G3-θ β-A LOCK + ADR-0043 §Sub-decision 8") asserting `refute :embedding in MemoryCapsule.__schema__(:fields)`. Cosmp_router default tier baseline 218 → 219 after G3.8 LANDS. No `mix.exs` / `mix.lock` changes; no `pgvector` / `pgvector_ex` dep; no Ecto vector field; no Translator pack/unpack extension; no protobuf / gRPC vector extension; no ADR-0033 amendment at G3.8 (cross-language data-ownership boundary preserved). ADR-0022 + ADR-0011/0013/0014/0015/0016/0025/0034/0035/0041/0042 ALL UNTOUCHED. `coe/**` + `keywords.ts` + `read.service.ts` + `write.service.ts` + `similarity.service.ts` UNTOUCHED. `apps/dbgi_supervisor/**` UNTOUCHED. All other `apps/cosmp_router/**` paths beyond the 2 authorized Elixir files UNTOUCHED. 3 RULE 13 forward-queued observations at commit-body-only register substantively (NOT promoted to ADR-0035 §9 cluster at G3.8): D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-Q-G3-θ + D-ELIXIR-VECTOR-CONSUMER-DELIBERATELY-EXCLUDED-AT-FOUNDATION-PRODUCTION-READINESS + D-IMPLICIT-VS-EXPLICIT-BOUNDARY-CONTRACT-AT-Q-G3-θ-G3.3-DEFERRAL. G1.4 SKIP precedent (`3505fde`) + G3.7 SKIP precedent (`ee0b01b`) comparison: G3.8 mirrors the docs-only + minimal-Elixir-touch discipline but is SUBSTANTIVE LANDING per Founder reframing — boundary contract is the production substrate at G3.8. ADR-0043 Status preserved as `Proposed 2026-05-17`. G3.8 does NOT close Gap 3 at canonical-state register substantively. G3 mini-arc advances 7/10 → 8/10 after G3.8 LANDS (G3.1 ADR + G3.2 infra + G3.3 schema + G3.4 provider + G3.5 write-integration + G3.6 retrieval + G3.7 SKIP + G3.8 Elixir-boundary LANDED); G3.9 + G3.10 forward-substrate. Sub-arc 2 status field **IN FLIGHT** unchanged by this commit. **Sub-arc 2 remains IN FLIGHT** pending Gap 3 (ADR-0043 pgvector Embedding) + Gap 4 (ADR-0044 Decay Execution Formalization) + Gap 5 (ADR-0045 Capsule-Level Staleness Detection) + optional Gap 6 (ADR-0046 AI_AGENT EntityType-Discriminated Capsule Routing) per ADR-0041 CL.1 scope patch register substantively. |
| Phase 3 Sub-Arc 1 Sub-Phase d — DEVICE Cold-Shard Substrate per ADR-0040 | **CLOSED** (`353c618` → `6e19f61` → `28a5abc` → this commit) | this commit | Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase d CLOSED at Commit 4 of 4 per ADR-0040 §Sub-decision 7 4-commit mini-arc decomposition. D.1 `353c618` `[BEAM-DBGI-DEVICE-COLDSHARD-ADR]` landed ADR-0040 architecture lock + D.0 Rule 21 research arc embedded (5 parallel WebSearch + 1 WebFetch on Discord ex_hash_ring; Jump Hash + Rendezvous + Ring/Ketama + Elixir Bitwise + library survey). D.2 `6e19f61` `[BEAM-DBGI-DEVICE-SHARD-MODULE]` landed NEW CosmpRouter.DeviceShard pure stateless module (SHA-256 first-8-byte stable 64-bit key + Lamping-Veach Jump Consistent Hash + import Bitwise + 64-bit unsigned wrap via modulo 2^64 + return bucket b not overshot j + assign_shard/1 + assign_shard/2 + configured_shard_count/0 + valid_shard_count?/1 + validate_shard_count!/1) + umbrella config/config.exs default shard_count: 256 + 15 unit tests. D.3 `28a5abc` `[BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]` landed MOD grpc/server.ex explicit `{:ok, :device}` branch BEFORE `{:ok, _other_tier}` catch-all + NEW private dispatch_device_shard/3 helper invoking CosmpRouter.DeviceShard.assign_shard/1 + 7 NEW integration tests (discriminator pattern: invalid DeviceShard config raises ArgumentError on DEVICE dispatch proves explicit DEVICE branch is exercised and DEVICE no longer rides _other_tier catch-all). D.4 this commit docs-only closure cascade (ADR-0040 Status Proposed → Accepted + Post-Closure Implementation Lineage + this row IN FLIGHT → CLOSED + CURRENT_BUILD_STATE NEW H2 sub-phase d closure section + architecture/README + CLAUDE.md ADR-0040 catalog refresh from Proposed to Accepted + ADR-0038 §Forward Queue K=128-1024 DEVICE cold-shard item final closure at canonical-state register substantively + ADR-0035 28th observation D-PASTE-AUTHORIZATION-FAILED-TO-GREP-DISPATCH-HELPER-ARG-ORDER promotion recurrence-7 of 27th observation pattern). **Substrate-state at closure**: DEVICE wallet_type resolves through CosmpRouter.WalletCache.wallet_type_for/1; grpc/server.ex dispatches `{:ok, :device}` through dispatch_device_shard/3; deterministic shard assignment via Jump Hash; Router request shape unchanged; DEVICE remains cold (NO DMWWorker spawn for DEVICE; NO per-device GenServer; NO ETS hot path; NO supervised child); AI_AGENT remains canonical at PERSONAL branch register substantively per ADR-0039 L251-255 + D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation register substantively. **Final test surface at closure**: CosmpRouter.DeviceShardTest 15/0; CosmpRouter.GRPC.DeviceShardDispatchTest 7/0; cosmp_router default 218/0 + 1 skipped; dbgi_supervisor default 67/0 (19 excluded); CI green across all 4 jobs at D.1 + D.2 + D.3 + D.4. **ADR-0038 §Forward Queue K=128-1024 DEVICE cold-shard item is CLOSED** at canonical-state register substantively at this commit register substantively per ADR-0040 §Sub-decision 7. **Forward-substrate at canonical-state register substantively**: sub-arc 2 capsule layer Gaps 1+3+4+5 (ADD/UPDATE/MERGE/NOOP mutation discrimination + pgvector embedding + decay execution + staleness detection + weighting architecture per Entry #28); sub-arc 3 benchmark + bi-temporal + tier automation; optional DEVICE shard observability/per-shard metrics remain forward-substrate at sub-arc 3 register substantively if later required. 16 substrate-build observations across D.1-D.4 register substantively preserved at commit-body-only register substantively per Option β substrate-honest discipline; 1 PROMOTED to ADR-0035 28th observation at this commit register substantively (D-PASTE-AUTHORIZATION-FAILED-TO-GREP-DISPATCH-HELPER-ARG-ORDER recurrence-7 of 27th observation pattern register substantively). The 4-commit sub-arc 1 sub-phase d mini-arc is CLOSED. |
| Phase 3 Sub-Arc 1 Sub-Phase a — DMW Worker per ADR-0038 | **CLOSED** | `3b431bf` → `56e0eaa` → this commit | Phase 3 (Dynamic Memory Accuracy at Scale) sub-arc 1 sub-phase a CLOSED at Commit 3 of 3 per SYNTHESIS-SUB-PHASE-A-DECOMPOSITION (ADR + CODE + CLOSURE). ADR-0038 Status: Proposed 2026-05-15 → Accepted 2026-05-15 + NEW ## Post-Closure Implementation Lineage section appended at document tail. ADR-0028 §Forward Queue per-capsule supervised Elixir process forward-queue item substantively closed at per-DMW granularity per Commit 1 `3b431bf` NEW append-only LANDED sub-paragraph. DMWWorker GenServer module substantively LANDED at Commit 2 `56e0eaa`: NEW `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` (160 lines) + MOD `apps/dbgi_supervisor/lib/dbgi_supervisor.ex` (+93 lines; 3 new public API functions: `start_dmw_worker/2` + `whereis_dmw_worker/1` + `stop_dmw_worker/1`) + NEW `apps/dbgi_supervisor/test/dbgi_supervisor/dmw_worker_test.exs` (171 lines; 13 unit tests across 3 describe blocks). ADR-0038 8 sub-decisions all RESOLVED (per ADR-0038 §Post-Closure Implementation Lineage). **Test substrate at closure**: DMWWorker targeted tests 13/0; full dbgi_supervisor default tier 55/0 (42 baseline + 13 new; no regression); Elixir compile clean (no warnings on new code); CI green at Commits 1 + 2. **Substrate-architectural framing canonical at substantive register**: hybrid hot/cold per-DMW substrate Option C LOCKED — ENTERPRISE always-hot per-DMW supervised process + PERSONAL/AI_AGENT promote-on-activity from cold shard substrate to hot per-DMW substrate + DEVICE always-cold shard-mapped substrate. Q-A through Q-G operator-tier locks all approved at recommended defaults α. **Substrate-state ground truth register**: per-DMW supervised process substrate canonical at runtime register at sub-phase a closure; the architectural target named in the README and monetization essay (hundreds to thousands of parallel COSMP operations per DMW for the workloads that need it) does NOT yet deliver at runtime because cosmp_router single-GenServer pattern remains the serialization bottleneck; sub-arc 1 sub-phase b and beyond re-wire cosmp_router to dispatch through DMWWorkers. **3-commit decomposition LANDED**: Commit 1 `[BEAM-DBGI-DMWWORKER-ADR]` `3b431bf` docs-only (ADR-0038 NEW + ADR-0028 amendments + catalog refreshes); Commit 2 `[BEAM-DBGI-DMWWORKER-CODE]` `56e0eaa` substantive code (DMWWorker module + public API + 13 tests); Commit 3 `[BEAM-DBGI-DMWWORKER-CLOSURE]` this commit docs-only closure cascade (ADR-0038 Status Accepted + Post-Closure Lineage + this row CLOSED + catalog refreshes + CURRENT_BUILD_STATE H2 CLOSED). **Forward-substrate at canonical-state register**: sub-arc 1 sub-phase b candidates — cosmp_router re-wire to dispatch through per-entity DMWWorkers + ENTERPRISE always-hot per-DMW process pool implementation + PERSONAL/AI_AGENT promote-on-activity tier promotion substrate + DEVICE cold-shard mapping with K=128-1024 consistent-hash shards. **NOT claimed at sub-phase a**: cosmp_router single-GenServer bottleneck resolution (forward-substrate to sub-phase b); per-capsule supervised process at finer-grained register (forward-substrate); ETS cache substrate (forward-substrate); cross-language TS → Elixir wallet_type mapping (forward-substrate; sub-phase a Elixir-tier consumers use atoms directly); EntityType 7-tier dispatch (forward-substrate if architectural target requires); eviction TTL (forward-substrate). 8 substrate-build observations forward-queued in commit-body-only canonical at substantive register per Option β substrate-honest discipline (D-AUTHORIZATION-PASTE-PROSE-VS-SCOPE-DISTINCTION + D-ADR-CATALOG-ENTRY-CHRONOLOGY-RESIDUAL + D-PUSH-RECONCILIATION-MID-COMMIT + D-OPERATOR-CORRECTION-EXTENSION-DISCIPLINE + D-OPERATOR-FRAMING-REALIGNMENT-DISCIPLINE + D-SUBSTANTIVE-CASCADE-PROSE-DRIFT + D-ADR-AMENDMENT-PATTERN-VARIANCE-DISCIPLINE + D-DMWWORKER-LAZY-SPAWN-PATTERN-CANONICAL + D-DMWWORKER-CLOSURE-CASCADE-PATTERN-CANONICAL NEW canonical at this commit); NOT promoted to ADR-0035 §9 numbered cluster. The 3-commit sub-arc 1 sub-phase a mini-arc is CLOSED. |
| 12C.1 (frontend Playground + Intelligence) | QUEUED | — | 6 cleanup items including 3 sentinel sites in otzar-control-tower (`MemberDetailDrawer.tsx:284`, `Users.tsx:175`, `Users.tsx:195`) |
| 12D (Security & Audit screen) | QUEUED | — | Frontend |
| 12E (Policies / Sharing rules) | QUEUED | — | Frontend |
| 12F (System Health, Settings, Onboarding, accessibility) | QUEUED | — | Frontend polish; consumes Sub-box 1's EscalationRequest in Pending Approvals UI |

## Dependency Notes

**Track A DELIVERED; Sub-box 1 unblocked.** The 90-110 minute
Foundation full-suite test cycle (per ADR-0010) made Sub-box 1's
dual-control middleware iteration prohibitively slow. Track A
test infrastructure isolation (18 gates + REVISED Gate 2 closed
on origin/main per `CURRENT_BUILD_STATE.md` §5) delivered
containerized Postgres + mocked LLM tier-stratification per
ADR-0011: unit subset <60s; integration tier 5-15 min; real-LLM
reserved for nightly / pre-release. Sub-box 1 is now unblocked
as Phase 2 primary engineering scope candidate per substrate
truth canonical at session-anchor canonical reference register
(`docs/CURRENT_BUILD_STATE.md` refreshed at `ecfdf7f` Phase 1a).

**Sub-box 1 = D-2D-D10 unified engineering territory (4-framing-
register cross-reference per RAA 12.8 §9.6 Step 2D-completion
handoff discipline):** Sub-box 1 (EscalationRequest + dual-control
middleware; Foundation primitive blocking Bucket B) coincides
with D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure per RAA 12.8
substrate-architecture canonicalization. The single engineering
work substantiates 4 framing registers concurrently:

- **RAA 12.8 §5.2** (EscalationRequest Prisma model + validation
  gate flags + approval workflow + correction propagation chain;
  D-2D-D10 closure detail)
- **Section 12.5 Sub-box 1** (Foundation primitive blocking Bucket
  B; dual-control middleware framing)
- **RAA 12.8 §5.9 item 1** (Step 2E engineering surface
  enumeration; canonical engineering surface for Surface 3)
- **Section 14 admin-tooling box** (existing TODO comment framing
  at `apps/api/src/services/otzar/priming.ts:131-134`:
  "EscalationRequest table doesn't exist yet. The Section 14
  admin-tooling box introduces it.")

Substrate-state observation per RULE 13: priming.ts substrate-
actual path is `apps/api/src/services/otzar/priming.ts` (otzar
service register, NOT coe service register as RAA 12.8 §5.9
ambiguously referenced). Implementation path canonical at otzar
service register; engineering scope unified per Phase 2
substrate-honest discipline.

**Sub-boxes 2-9 depend on Sub-box 1:** Sub-box 1 introduces the
`EscalationRequest` primitive + dual-control middleware that
several downstream sub-boxes consume:

- Sub-box 2 (privileged action audit chain) extends dual-control
  to specific endpoint families
- Sub-box 5 (GDPR Article 17 pseudonymization-with-attestation,
  Family 4) requires escalation for any deletion-equivalent
  action
- Sub-box 7 (verifiable-credentials + compliance attestation
  reports, Family 5) requires escalation for credential issuance

**Substrate-state note: Sub-box numbering divergence (RULE 13).**
The Sub-box enumeration used in this tracker (Sub-box 1 =
EscalationRequest + dual-control; Sub-box 2 = privileged action
audit chain; Sub-box 5 = GDPR Article 17 pseudonymization; Sub-box
7 = verifiable-credentials + compliance attestation) is a
**working-tracker designation**. The **authoritative** sub-box
enumeration is at `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` lines
2200+ (the "Engineering surface" section): Sub-box 1 =
EscalationRequest + dual-control middleware (matches this tracker);
Sub-box 2 = Jurisdiction tagging; Sub-box 3 = REGULATOR +
Lawful-Basis; Sub-box 4 = DecisionRecord + DataSubjectReference +
Agent Attestation; Sub-box 5 = EntityIdentity + Pseudonymization +
Erasure; Sub-box 6 = NIST Control Mappings + SSP Evidence
Generator; Sub-box 7 = ComplianceAttestation + Selective
Disclosure; Sub-box 8 = Cross-Tenant Compliance Benchmarking;
Sub-box 9 = Capsule Compliance Provenance. The divergence at
Sub-box 2+ is pre-existing across landed commits (including the
immutable `[SEC-SUBBOX1-ITEM4-DEFER]` `49e2934` commit body, which
references "Sub-box 2 (privileged action audit chain)", and the
`[SEC-SUBBOX1-ITEM5-DEFER]` `263bf77` + `[SEC-SUBBOX1-ITEM6-DEFER]`
`dd6fc09` bodies). Full renumbering reconciliation is forward-queued
as a separate careful pass (it must handle the immutable commit-body
references). Future sessions: when reading "Sub-box N" references in
this tracker, treat them as working-tracker designations; for
authoritative sub-box scope per the engineering surface, consult
`docs/COMPLIANCE_ARCHITECTURE_REVIEW.md`.

**12C.1 frontend depends on no Foundation work** but waits for
design alignment. Specifically: the 3 sentinel sites in
otzar-control-tower (`MemberDetailDrawer.tsx:284`,
`Users.tsx:175`, `Users.tsx:195`) currently emit
`"pending-foundation-extension"` as a placeholder
`audit_event_id`; they consume Foundation Commit 1's
`PATCH /org/entities` audit_event_id surfacing (closed at
`2aa1a88`). Cleanup is purely a frontend swap from placeholder
to real audit event ID.

**Sub-section gates are explicit:** Each sub-section CLOSED
status requires (a) a clean push to main, (b) verification report
approved, (c) architectural anchor catalog updated if new
anchors landed, (d) glossary updated if new terms landed.

### Sub-box 1 CLOSED — D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure (2026-05-11)

Sub-box 1 closes as a **4-framing-register event** — substrate +
service + route + canonical-record tiers all on origin/main:

- **Substrate-tier** (RAA 12.8 §5.2 canonical pieces — the four
  closure pieces):
  - [D-2D-D10-1] `8202771` — EscalationRequest Prisma schema (13
    fields + 4 relations + 7 indexes + EscalationStatus /
    EscalationType enums)
  - [D-2D-D10-2] `40dac21` — escalation.service.ts (7 exported
    functions: create / get / list-pending / count / approve /
    reject / expire; pre-success audit-in-tx per ADR-0002 + RULE 4)
  - [D-2D-D10-3] `d96b16a` — escalation.service.ts unit coverage
    (33 cases / 7 describe) + `@niov/api` re-export
  - [D-2D-D10-4] `33a25c6` — `requires_validation` gate flag on
    MemoryCapsule (read-side NEGOTIATE denial; ai_access_blocked
    mirror)
  - [D-2D-D10-5] `6d9b636` — gate-fail → `COMPLIANCE_GATE`
    escalation coupling (`createGateEscalationForCaller`,
    get-or-create dedup; negotiate.service.ts wire)
  - [D-2D-D10-6] `38205b3` — correction propagation chain
    (`propagateCorrection` snap-to-`RELEVANCE_MAX`; `CORRECTION_PROPAGATED`
    Zone U1 audit; processCorrection wire)
- **Route-tier** (HTTP surface):
  - [D-2D-D10-7] `dc0a26f` — escalation HTTP routes (`POST
    :id/approve`, `POST :id/reject`, `GET :id`, `GET /pending`;
    service-tier source≠resolver dual-control gate; 8 integration
    tests)
- **Canonical-record-tier**:
  - [ADDENDUM-DMW-SLM] `67fb083` — DMW federation as emergent
    SLM/LLM-equivalent inference surface (the inference-tier
    consequence of US 12,164,537 / US 12,399,904 / US 12,517,919
    patent claims; prior-art posture; landed alongside as a
    standalone canonical-record commit)
  - [D-2D-D10-8] (this commit) — Sub-box 1 closure amendment +
    RULE 14 back-citations into RAA 12.8 + ADR-0020
- **Discipline-tier** (substrate-honest pattern infrastructure
  that landed during the arc):
  - [SEC-HELMET] `68179ee` — @fastify/helmet substrate + ADR-0023
    (security-headers posture)
  - [DOCS-HUSKY] `6012b59` — husky 9.x pre-commit hook + ADR-0024
    (pre-commit-hook posture)

**Arc commit chronology (Day-6 arc; 2026-05-11; 11 cumulative
commits in the window):** [D-2D-D10-1] → [SEC-HELMET] →
[DOCS-HUSKY] → [D-2D-D10-2] → [D-2D-D10-3] → [D-2D-D10-4] →
[ADDENDUM-DMW-SLM] → [D-2D-D10-5] → [D-2D-D10-6] → [D-2D-D10-7] →
[D-2D-D10-8]. The "9-commit-window arc" framing in the commit
bodies counts [SEC-HELMET] + [DOCS-HUSKY] + [D-2D-D10-2..8]
(9 commits); [D-2D-D10-1] preceded the arc-window ("Phase 2
Commit 1"); [ADDENDUM-DMW-SLM] interleaved as a standalone
canonical-record commit.

**Three consecutive ADDENDUM-DMW-SLM substantiation events** form
a continuous multi-register patent-implementation-evidence chain
on origin/main:

- **Canonical-record register** — the ADDENDUM landed at
  `67fb083` (framing SLM/LLM-equivalence as a consequence of the
  existing patent claims)
- **Service-tier register, §5** — [D-2D-D10-5] `6d9b636`
  substantiated "Audit lineage per operation (Zone U1-U4)" at the
  gate-resolution chain (gate-fail → COMPLIANCE_GATE escalation →
  human review → status-transition audit event)
- **Service-tier register, §3** — [D-2D-D10-6] `38205b3`
  substantiated "confidence accumulation" + "personalization
  confidence" (a correction snaps relevance to RELEVANCE_MAX —
  the max-informativeness signal driving the DMW's contextual
  inference surface)
- **Route-tier register, §5** — [D-2D-D10-7] `dc0a26f`
  substantiated "Audit lineage per operation (Zone U1-U4)" +
  "Permission-governed composition" at the HTTP approve/reject
  surface (resolver as actor; source≠resolver gate)

**Substrate-honest pre-flight verification pattern operational
across the arc** (26-consecutive-commit count at [D-2D-D10-8]).
Substrate-state drifts caught + resolved in real time per
RULE 13: production schema-push target drift at [D-2D-D10-4]
(`prisma db push` auto-loaded `.env` → hit production
`memory_capsules`; resolved Option A — leave the additive
column; forward-queued as [SEC-DBPUSH-DISCIPLINE]/ADR-0025);
draft-not-in-session at [ADDENDUM-DMW-SLM] (the "draft I
provided" was not in the session transcript → STAND DOWN +
operator re-paste → landed verbatim); audit-lookup `orderBy`
correction at [D-2D-D10-7] (`findFirst` by `details.escalation_id`
matched the earlier `ESCALATION_CREATED` event before the
resolution event → caught at the isolated test run → fixed inline
with `orderBy: { timestamp: "desc" }` before staging). DRIFT 2
REDUX: the `cleanupTestEscalations` test-local-cleanup pattern
([D-2D-D10-3] Option A — escalation_requests rows FK-block
`cleanupTestData()`'s hard-delete of test entities) is now
operational across 3 test files (escalation.test.ts /
cosmp/negotiate.test.ts / integration/escalation-routes.test.ts);
the shared `helpers.ts:cleanupTestData()` was deliberately NOT
extended ([D-2D-D10-3] Option C rejection — blast-radius coupling).

**Forward queue (6 items deferred from the arc; NOT landed at
[D-2D-D10-8]):**

1. **[SEC-DBPUSH-DISCIPLINE] — COMPLETE.** The [SEC-DBPUSH] mini-arc
   landed across 4 commits on 2026-05-12 (sequential per the
   [ADDENDUM-DMW-SLM] register-separation precedent): [SEC-DBPUSH-ADR]
   `d8d6236` (canonical-record — ADR-0025 Schema-Push-Target Discipline:
   schema-push commands MUST use an explicit env-target qualifier;
   production schema changes via the deploy pipeline only) →
   [SEC-DBPUSH-WRAPPER] `e1dbc1e` (engineering substrate —
   `scripts/prisma-db-push-test.sh` wrapper: loads `.env.test`, 4
   fail-closed checks, then `prisma db push --schema=… --skip-generate`
   with the validated env; + the `db:push:test` npm alias; `db:push`
   UNCHANGED — CI safe via workflow-set `DATABASE_URL`) →
   [SEC-DBPUSH-HOOK] `ed9a519` (local-tier enforcement —
   `.husky/pre-commit` db-push guard as the first check, POSIX-sh-safe,
   precise allowlist, self-tests; `scripts/test-db-up.sh` step-2 retrofit
   to invoke the wrapper; `scripts/test-db-push-wrapper.sh` 3-case smoke
   test; + the `test:db-push-wrapper` npm alias) → [SEC-DBPUSH-CLOSE]
   (closing — ADR-0024/0025 amendments + this tracker amendment + the
   `Schema-Push-Target Discipline` glossary entry per RULE 17). The CI
   workflow guard substrate is forward-queued substantively-tangential
   per the [SEC-DBPUSH-CLOSE] Q1 Option C scope decision: the workflow
   YAML has zero bare `npx prisma db push` today (CI's `npm run db:push`
   is safe via a workflow-set `DATABASE_URL`); the realistic threat
   surface is local invocation auto-loading `.env`, covered by the
   pre-commit hook at [SEC-DBPUSH-HOOK]. Source: [D-2D-D10-4]
   Observation 1 (the production schema-push target drift event) +
   [D-2D-D10-1] near-certain analogous exposure.
2. **INT-6 frozen-anchors / ADR-0022 amendment — COMPLETE.** Landed
   at [SEC-INT6-ADR0022] on 2026-05-12 as a canonical-record-tier
   amendment to ADR-0022 (combined_score Formula Canonicalization).
   The informativeness-coefficient family (`RELEVANCE_USED_BUMP` /
   `RELEVANCE_UNUSED_DECAY` / `RELEVANCE_MIN` / `RELEVANCE_MAX` /
   `RELEVANCE_CORRECTION_BUMP` / `RELEVANCE_FORGET_FLOOR`) joins
   the frozen-anchors family alongside `combined_score` per
   RAA 12.8 §6.6 + §7.4. The formula extension itself (4th
   coefficient `INFORMATIVENESS_WEIGHT` + coefficient redistribution
   + frozen-config module + Loop 1 differential-bump/decay refactor
   + anchor tests for new coefficients) is explicitly Step 2E
   engineering substrate per RAA 12.8 §7.3 + §7.5 — multi-sprint;
   NET-NEW; lands alongside the frozen-config module per
   coordinated commit discipline. The ADR-0022 amendment also
   tightened its RAA-12.8 References entries from generic to the
   specific landed sections (§6.6 / §7.3 / §7.4 / §7.5) and added
   a "Bidirectional citations (cited from):" sub-block per the
   `docs/architecture/README.md` discipline (the [SEC-DBPUSH-ADR]
   ADR-0024 precedent). Cataloging `combined_score` +
   `RELEVANCE_FORGET_FLOOR` into `architectural-anchors.md`, and
   the README ADR-catalog refresh, are deferred to a future
   `[DOCS-CATALOG-REFRESH]`. Source: [D-2D-D10-6] Observation 3
   (the substrate-tier landing at `RELEVANCE_CORRECTION_BUMP =
   RELEVANCE_MAX`); this amendment is the canonical-record-tier
   follow-up.
3. **RAA-12.9-tier glossary concept entries — COMPLETE.** Landed
   at [SEC-RAA12-9-GLOSSARY] on 2026-05-12 — 3 substantive concept
   entries elaborating ADDENDUM-DMW-SLM §3 (SLM-equivalence
   threshold) + §4 (LLM-equivalence threshold) + §5 (categorical
   distinction from market-tier swarm intelligence) + §7 (prior-art
   posture protection) + §8 (does-not-claim guardrails) + §9
   (forward-queue framing): `Inference Surface` (## I section;
   emergent inference characteristic substrate), `LLM-Equivalence-Hive`
   (new ## L section; DMW federation under hive composition), and
   `SLM-Equivalence` (## S section; individual DMW under continuous
   COSMP feedback-loop operation). Each entry: definition +
   ADDENDUM-DMW-SLM cross-references + the 3 patents (US 12,164,537
   / US 12,399,904 / US 12,517,919) + RAA 12.8 §5 (Surface 3 —
   Agentic Coherence runtime-tier substantiation register) + the §8
   does-not-claim guardrails reflected + "See also" sibling entries
   per RULE 17 future-session-loading. ADDENDUM-DMW-SLM also gained a
   "Bidirectional citations (cited from):" sub-block at this commit
   (discipline-alignment fix per the [SEC-DBPUSH-ADR] ADR-0024 +
   [SEC-INT6-ADR0022] ADR-0022 precedents). "RAA-12.9-tier" is a
   register designation, not a citation — there is no RAA 12.9
   document; the source-of-substance is ADDENDUM-DMW-SLM. Source:
   ADDENDUM-DMW-SLM §9 "forward-queue candidates; not specified
   here" framing — canonicalized at this commit.
4. **Generalized `requireDualControl` preHandler — DEFERRED to Sub-box 2
   substantive substrate.** Marked DEFERRED at [SEC-SUBBOX1-ITEM4-DEFER]
   on 2026-05-12 per Sub-box dependency-ordering substrate canonical.
   Substrate-state observation: `requireDualControl` does NOT exist as
   code — zero Fastify-preHandler consumers across `apps/api/src/`; the 2
   grep matches at `apps/api/src/routes/escalation.routes.ts` (lines 11 +
   32) are WHY-comment forward-queue framing references, not call sites.
   The dual-control gate is enforced service-tier only via the
   `transitionPendingForCaller` skeleton gate at
   `apps/api/src/services/governance/escalation.service.ts` (a source-only
   caller fails; caller === target OR caller === resolved_by may
   transition) — the [D-2D-D10-7] Observation 1 scope decision was
   deliberately to NOT add route-tier dual-control middleware; the
   service-tier gate is the canonical 1-consumer substrate, the routes
   (requireAuth preHandler only) map domain-string throws to HTTP codes.
   Canonical destination: Sub-box 2 (privileged action audit chain)
   enumerated privileged endpoint families — the substantively-substantial
   2nd+ consumers; the refactor trigger is canonical at the 2nd consumer
   landing per the COMPLIANCE_ARCHITECTURE_REVIEW.md "enumerated
   dual-control set, not a general primitive" framing. YAGNI rationale:
   generalizing a Fastify preHandler against one service-tier-only
   consumer is premature substrate; the second consumer (enumerated
   privileged endpoint families per Sub-box 2 substrate) is the canonical
   refactor trigger — substantively-substantial substrate observation per
   Sub-box dependency-ordering. Substrate-state cross-doc drift observation
   per RULE 13: section-12-progress.md's "Sub-box 2 = privileged action
   audit chain" numbering does NOT match COMPLIANCE_ARCHITECTURE_REVIEW.md's
   "Sub-box 2 = Jurisdiction tagging" numbering; the cross-doc drift is
   pre-existing and out of scope for this amendment (forward-queued to a
   future reconciliation pass / [DOCS-CATALOG-REFRESH] candidate). Source:
   [D-2D-D10-7] Observation 1 + COMPLIANCE_ARCHITECTURE_REVIEW.md
   "enumerated dual-control set, not a general primitive" framing.
5. **§5.8 per-DMW-type sovereignty integration of the escalation
   gate — DEFERRED to RAA 12.8 §5.9 item 7 (Step 2E engineering
   surface).** Marked DEFERRED at [SEC-SUBBOX1-ITEM5-DEFER] on
   2026-05-12 per Sub-box dependency-ordering substrate canonical.
   Substrate-state observation: RAA 12.8 §5.8 substantive substrate
   is already complete at RAA-tier per the [RAA-12.8-S5-AMEND-1]
   amendment chain (`604aac6` Commit 1 six EntityType mappings +
   `2cced88` Commit 2 18-site body-text amendment + `127a383`
   Commit 3 §5.10 Correction E) — the six EntityType → WalletType
   mappings canonical (PERSON → Personal full-owner-sovereignty per
   RULE 0; COMPANY → Enterprise Permission-scoped with forget-on-detach
   at Permission tier per Correction A; DEVICE → Device device-owner
   sovereignty; AI_AGENT → owning-entity-derived recursion via
   EntityMembership terminating at sovereign-human or AI_AGENT-tier
   baseline per Correction B; APPLICATION → Enterprise enterprise-scoped;
   GOVERNMENT → Custom Government NET-NEW substrate primitive with
   FedRAMP/IL4/IL5/IL6/CMMC) + per-DMW-type sovereignty rules +
   Corrections C/D/E canonical at §5.10. Nothing to add at
   canonical-record register at this commit — the substrate is
   canonical-record-complete at RAA-tier. The escalation-gate
   integration itself (wiring per-DMW-type sovereignty rules into the
   `transitionPendingForCaller` authorization logic at
   `apps/api/src/services/governance/escalation.service.ts:276` to
   replace the current skeleton gate at lines 290-296 — `caller ===
   target OR caller === resolved_by may transition`) is explicitly
   RAA 12.8 §5.9 item 7 (Step 2E engineering surface): "Per-DMW-type
   sovereignty rules implementation per §5.8 (after operator decisions
   resolve AI_AGENT / APPLICATION / GOVERNMENT mappings). Engineering
   tier: per-DMW-type scheduling constraint enforcement at §3.8
   cross-wallet retrieval; per-DMW-type HiveMembership constraint at
   §4.8 Hive coordination." Multi-sprint Step 2E engineering substrate
   canonical per RAA 12.8 §5.9 + Decision 4 — sequenced after
   architectural canonicalization completes (Sections 6-10). The §5.9
   "after operator decisions resolve AI_AGENT / APPLICATION /
   GOVERNMENT mappings" precondition is now SATISFIED per the
   [RAA-12.8-S5-AMEND-1] chain — the item is unblocked for Step 2E
   substantively. The `escalation.service.ts` header (lines 60-65) +
   the `transitionPendingForCaller` block (lines 269-296) already
   carry the FORWARD QUEUE per §5.8 framing substantively — no code
   amendment needed at canonical-record register; the forward-queue
   framing is canonical at code register already. Substrate-state
   distinction observation per RULE 13: this deferral destination
   (RAA 12.8 §5.9 item 7 / Step 2E engineering surface) is a different
   organizing frame from the [SEC-SUBBOX1-ITEM4-DEFER] destination
   (Sub-box 2 per COMPLIANCE_ARCHITECTURE_REVIEW.md numbering — the
   privileged action audit chain enumerated privileged endpoint
   families). Two different canonical destinations for two different
   forward-queue items — preserve the distinction; the pre-existing
   cross-doc Sub-box numbering drift from item 4 is separate substrate
   (forward-queued to a future reconciliation pass /
   [DOCS-CATALOG-REFRESH] candidate). Source: RAA 12.8 §5.8 (six
   EntityType→WalletType mappings + per-DMW-type sovereignty rules) +
   RAA 12.8 §5.9 item 7 (Step 2E engineering surface enumeration) +
   [RAA-12.8-S5-AMEND-1] amendment chain (`604aac6` + `2cced88` +
   `127a383`).
6. **EntityMembership-traversal multi-step approval chains —
   DEFERRED to Step 2E engineering (RAA 12.8 §5.2 approval-workflow-
   primitives multi-step-chain portion / §5.9 item 1).** Marked
   DEFERRED at [SEC-SUBBOX1-ITEM6-DEFER] on 2026-05-12 per Sub-box
   dependency-ordering substrate canonical. Substrate-state
   observation: RAA 12.8 §5.2 multi-step approval chain substantive
   substrate canonical at architectural register — quoted verbatim:
   "Approval workflow primitives. Multi-step approval chains (chained
   EscalationRequest rows); per-step approver discrimination via
   EntityMembership traversal per §3.8; timeout policies via
   expires_at field." The D-2D-D10 closure arc ([D-2D-D10-1..8])
   implemented the SINGLE-STEP EscalationRequest substrate canonical
   (Prisma model at `packages/database/prisma/schema.prisma:1105` —
   escalation_id PK + source/target/resolver entity FKs + status enum
   + severity + expires_at timeout + indexes; 7-fn service at
   `apps/api/src/services/governance/escalation.service.ts`;
   validation gate flag + gate-fail→COMPLIANCE_GATE coupling;
   correction propagation chain; HTTP routes at
   `apps/api/src/routes/escalation.routes.ts`). The multi-step-chain
   portion (chained EscalationRequest rows + per-step approver
   discrimination + per-step timeout) was deliberately deferred to
   this forward-queue item 6 — Sub-box 1 CLOSED status was declared
   "substrate-complete at dc0a26f" with the single-step model
   canonical; multi-step is NET-NEW engineering substrate. Required
   NET-NEW substrate per RAA 12.8 §5.2 + §3.8 framing: (a)
   `parent_escalation_id String? @db.Uuid` self-reference field on
   `EscalationRequest` + relation + index for chain traversal; (b)
   per-step approver logic replacing the current
   `transitionPendingForCaller` skeleton gate (lines 290-296: `caller
   === target OR caller === resolved_by may transition`) with
   EntityMembership-traversal-based per-step approver discrimination
   per §3.8 (the `EntityMembership` model at
   `packages/database/prisma/schema.prisma:695` already exists with
   parent_id/child_id/role_title/hierarchy_level/is_admin substrate
   canonical; the multi-step substrate consumes EntityMembership
   canonical traversal logic per §3.8 — walking the
   parent/child/hierarchy graph to discriminate per-step approver
   eligibility based on role/department/hierarchy_level); (c) per-step
   timeout canonical per the existing `expires_at` field extended to
   per-step granularity; (d) audit chain extension per Zone U1-U4
   substantive substrate canonical at each chain step. Destination
   canonical: RAA 12.8 §5.9 item 1 (Step 2E engineering surface) —
   quoted verbatim: "D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL closure —
   implement EscalationRequest Prisma model per §5.2; validation gate
   flags primitives; approval workflow primitives; correction
   propagation chain." The multi-step-chain portion of "approval
   workflow primitives" is the remaining engineering substrate
   canonical from §5.9 item 1's enumeration. Multi-sprint Step 2E
   engineering substantively-canonical per RAA 12.8 §5.9 + Decision 4
   — sequenced after architectural canonicalization completes
   (Sections 6-10). Substrate-state distinction observation per RULE
   13: this deferral destination (RAA 12.8 §5.2 approval-workflow-
   primitives multi-step-chain portion / §5.9 item 1 Step 2E
   engineering surface) is a different organizing frame from the
   [SEC-SUBBOX1-ITEM4-DEFER] destination (Sub-box 2 per
   COMPLIANCE_ARCHITECTURE_REVIEW.md numbering) and the
   [SEC-SUBBOX1-ITEM5-DEFER] destination (RAA 12.8 §5.9 item 7 / Step
   2E engineering surface for per-DMW-type sovereignty integration).
   Three different canonical destinations for three different
   forward-queue items — preserve all three distinctions; items 4 and
   5 are at distinct §5.9 items (4 → Sub-box 2 enumerated privileged
   endpoint families; 5 → §5.9 item 7; 6 → §5.9 item 1
   approval-workflow-primitives multi-step portion). The pre-existing
   cross-doc Sub-box numbering drift from item 4 is separate substrate
   (forward-queued to a future reconciliation pass /
   [DOCS-CATALOG-REFRESH] candidate). Substrate-state observation per
   RULE 17: this commit closes Sub-box 1 forward-queue substantively —
   3 COMPLETE (items 1+2+3) + 3 DEFERRED (items 4+5+6) — substantively
   FULLY canonical-record-substrate-complete. Source: RAA 12.8 §5.2
   ("Approval workflow primitives. Multi-step approval chains ...") +
   RAA 12.8 §5.9 item 1 ("D-2D-D10-PRIMING-SHAPE-AHEAD-OF-MODEL
   closure — ... approval workflow primitives ...") + the D-2D-D10
   closure arc ([D-2D-D10-1..8] commits implementing the single-step
   substrate canonical) + Decision 4 (Step 2E sequenced after
   architectural canonicalization).

## How To Update This Tracker

When a sub-section closes:

1. Update the row's Status from `IN PROGRESS` or `QUEUED` to
   `CLOSED`.
2. Update the row's Commit cell with the closing commit's short
   hash.
3. Update the row's Description with the actual delivered scope
   (test count, anchor count, etc.) — not the planned scope.
4. Add a new row below for the next IN PROGRESS sub-section.
5. The update lands in the same commit that closes the sub-
   section, so the tracker's HEAD always reflects reality.

When an architectural anchor lands:

1. Note the anchor count change in the relevant row's Description.
2. Cross-reference the anchor's full entry in
   `docs/reference/architectural-anchors.md`.
3. If the anchor introduces a new architectural pattern, the
   ADR for that pattern lands in the same commit.

## See Also

- `docs/CURRENT_BUILD_STATE.md` — session-anchor canonical
  reference for build state; §3 cross-cutting substrate-
  architecture canonicalization work; §4 Section 12.5 sub-box
  framing table (refreshed at `ecfdf7f` Phase 1a; 2026-05-11)
- `docs/architecture/raa-12-8-substrate-dynamics.md` — RAA 12.8
  substrate-architecture canonicalization (14-commit chain
  canonical at `e31f948`; 2026-05-11); §5.2 D-2D-D10 closure
  detail + §5.9 Step 2E engineering surface enumeration + §9.6
  Step 2D-completion handoff discipline
- `docs/reference/architectural-anchors.md` — runtime invariants
  catalog (8 anchors as of [DOCS-CATALOG-REFRESH-ANCHORS] —
  commit 2 of 2 of the [DOCS-CATALOG-REFRESH] mini-arc; anchors
  7 + 8 — `combined_score` coefficient invariants (VALUE-PIN) +
  `RELEVANCE_FORGET_FLOOR` behavioral lock (BEHAVIORAL-LOCK) per
  ADR-0022 — added there)
- `docs/architecture/decisions/` — Architecture Decision Records
  (25 ADRs canonical at 2026-05-12 per [SEC-DBPUSH-CLOSE] `5a18491`
  + the [SEC-INT6-ADR0022] `d743e4c` ADR-0022 amendment; ADRs
  0023/0024/0025 + the ADR-0022 amendment landed after 2026-05-11)
- `docs/reference/glossary.md` — term definitions (32 canonical-
  grade entries landed at `74b2765` [GLOSSARY-G-3]; + 8 entries
  added across Section 12.5 substrate — Validation Gate Flag / AI
  Access Block / Correction Propagation / Escalation Routes per the
  [D-2D-D10] arc; Schema-Push-Target Discipline per
  [SEC-DBPUSH-CLOSE]; Inference Surface / LLM-Equivalence-Hive /
  SLM-Equivalence per [SEC-RAA12-9-GLOSSARY]; current total ~85
  `**`-prefixed entries; Step 2F full refresh queued per RAA 12.8
  §9.3)
- `CLAUDE.md` — operating manual (Section 2 mirrors this tracker
  in summary form)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` — Section 12.5
  committed substrate; sub-box 1-9 dependency ordering originates
  here
