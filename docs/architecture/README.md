# Architecture Directory

Architecture-level documentation for niov-foundation. This
directory holds Architecture Decision Records (ADRs) — the
captured rationale behind every load-bearing architectural
choice in the codebase. ADRs explain *why* a decision was made,
not *what* was made (the codebase is the source of truth for
the *what*; ADRs prevent re-litigation of the *why*).

This directory is distinct from:

- `docs/reference/` — substrate documentation (glossary,
  architectural-anchors catalog, section-progress trackers)
- `docs/contributing/` — contributor guides (code style,
  testing, multi-LLM operation)

## Directory Structure

```
docs/architecture/
├── README.md                           (this file — index)
└── decisions/
    ├── 0000-template.md                (ADR template + how-to)
    ├── 0001-three-wallet-architecture.md
    ├── 0002-append-only-audit-chain.md
    ├── 0003-frozen-config-tamper-anchors.md
    ├── 0004-service-owned-auth-gate.md
    ├── 0005-no-console-in-apps-api-src.md
    ├── 0006-cross-org-leak-prevention.md
    ├── 0007-manual-bearer-auth-compliance-endpoints.md
    ├── 0008-entity-compliance-profile-org-level.md
    ├── 0009-cosmp-seven-operation-enumeration.md
    └── 0010-foundation-tests-legitimately-slow.md
```

## Architectural Decision Records (ADRs)

ADRs use the Michael Nygard format with niov-foundation
extensions (Easier/Harder consequence split, bidirectional
citation block, ISO-dated Status). The template at
`decisions/0000-template.md` includes both the structure and
the "How To Use This Template" guidance for new ADRs.

ADR catalog as of [BEAM-COSMP-INTEROP-ADR] (2026-05-13;
37 ADRs):

- **ADR-0001** — Three-wallet architecture (foundational)
- **ADR-0002** — Append-only audit chain with BEFORE DELETE trigger (foundational)
- **ADR-0003** — Frozen-config tamper anchors (Section 12C.0)
- **ADR-0004** — Service-owned auth gate pattern (Section 12C.0)
- **ADR-0005** — No `console.*` in `apps/api/src` (Section 12C.0; DRIFT 2 Option C)
- **ADR-0006** — Cross-org leak prevention via filter narrowing (Section 12C.0)
- **ADR-0007** — Manual bearer auth for `/compliance/*` endpoints (Section 12C.0; will be superseded by Sub-box 7)
- **ADR-0008** — `EntityComplianceProfile` is org-level, not aggregated (Section 12C.0; DRIFT 15)
- **ADR-0009** — COSMP 7-operation enumeration (locked by patent US 12,517,919)
- **ADR-0010** — Foundation tests are legitimately slow (90-110 min) (Section 12C.0 emergent lesson)
- **ADR-0011** — Three-tier test stratification (Track A Gate 1; Gate 6 reproducibility-verification amendment in-place)
- **ADR-0012** — Test-mode LLM provider hardening (Track A Gate 1; hash-dispatch decision superseded in part by ADR-0014)
- **ADR-0013** — Containerized Postgres for unit and integration tiers (Track A Gate 1; `postgres:16.4-alpine` pin)
- **ADR-0014** — FixtureBasedLLMProvider key-based dispatch (Track A Gate 3; supersedes ADR-0012's hash-by-content dispatch)
- **ADR-0015** — CI Workflow Architecture (Track A Gate 7; 8 locked decisions A-H including postgres + Node pins)
- **ADR-0016** — Pin-and-Optimize Framework (substrate-pinning canonical reference; companion to ADR-0017/0018/0019; five-question template)
- **ADR-0017** — Production Discipline (substrate-investigation canonical reference; companion to ADR-0016/0018/0019; nine-step template)
- **ADR-0018** — Deployment-Target Agnosticism Posture (substrate-portability canonical reference; companion to ADR-0016/0017/0019; five-step decision template)
- **ADR-0019** — Cryptographic-Suite Posture (substrate-cryptographic-resilience canonical reference; companion to ADR-0016/0017/0018; six-step decision template)
- **ADR-0020** — Two-Register IP Discipline (IP-discipline register; the protected-name boundary + RULE 19 at canonical-record register)
- **ADR-0021** — Capsule Type Extension Protocol (extension-protocol register; CapsuleType enum extension pattern + the PRICING_TABLE deliberate-blocker worked example)
- **ADR-0022** — combined_score Formula Canonicalization (scoring-formula register; the 0.45/0.35/0.20 coefficients + recency thresholds; amended for the INT-6 frozen-anchors-family informativeness-coefficient join)
- **ADR-0023** — Security Headers Posture (security-headers register; the `@fastify/helmet` posture)
- **ADR-0024** — Pre-Commit Hook Posture (git-hook-tier enforcement register; husky pre-commit running the typecheck baseline + the RULE 16 no-console anchor + the ADR-0025 db-push guard)
- **ADR-0025** — Schema-Push-Target Discipline (schema-push-target register; the `prisma db push` explicit-env-target rule + the wrapper + the pre-commit db-push guard; the [D-2D-D10-4] production-schema-push trap)
- **ADR-0026** — Dual-Control Middleware Pattern + Privileged Endpoint Registry + Per-Route Binding Discipline (dual-control register; the Sub-box 2 Phase 1 architectural bundle — the `requireDualControl` Fastify preHandler + the `PRIVILEGED_ENDPOINTS` runtime registry + the `preHandler` binding contract + the 6 BEAM-compatibility patterns; the operational companion is `docs/architecture/dual-control-operations-canonical-record.md`)
- **ADR-0027** — Contributor Governance + AI-Alignment + Rule-Modification Authority (governance register; the authorization-tier protection — RULE 20: only the patent-holder Founder may modify/add/remove RULES or ADRs; the AI-alignment discipline — surface RULE/ADR-modification proposals per RULE 13, don't execute; onboarding companion `docs/contributing/onboarding-for-engineers.md`)
- **ADR-0028** — Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule Supervision + OtzarComm + DBGI Integration (forward-substrate register; the Sub-box 2 Phase 2 commitment-to-ship — NIOV commits to ship the Elixir/BEAM COSMP coordination layer as a production service, a 6-8-commit / ~3-4-week mini-arc; the three-language stack — Fastify+TypeScript API + Elixir COSMP + Python ML + Postgres storage; cites ADR-0026 for the 6 BEAM-compatibility patterns it commits to ship; the closing commit of the 10-commit Sub-box 2 Phase 1 arc)
- **ADR-0029** — Substrate-Build Optimizations: Cascade-Inventory Scripts + Commit-Class Templates + Strategy-Tier Prose Discipline (substrate-build register; the three optimizations addressing the 26-catch dual-control-arc patterns + the discipline's token-cost dimension — `scripts/preflight/` cascade-grep scripts, `docs/contributing/templates/` commit-class scaffolds, strategy-tier prose discipline; cites ADR-0028 — the forward-queue source; sub-phase 1 of the SUBSTRATE-BUILD-OPTIMIZATIONS arc — the decision document; sub-phases 2-5 implement)
- **ADR-0030** — Phase 2 Elixir/BEAM Implementation: Mix Umbrella + COSMP Router + DBGI Supervisor + Three-Language Stack Canonicalization (Phase-2-implementation register; the 19-sub-phase Block B mini-arc (expanded 13 → 14 at sub-phase 4a per Q-G split — see ADR-0031; 14 → 15 at sub-phase 5a per Q-P split — see ADR-0032; 15 → 16 at sub-phase 5b-i per Q-R split — see ADR-0033; 16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT split — see ADR-0033 §Forward path; 17 → 18 at sub-phase 6a per Q-NEW-SPLIT-2 split — see ADR-0034; 18 → 19 at sub-phase 6c per Q-NEW-SPLIT-3 split — see ADR-0035) that ships Elixir/BEAM substrate as production Foundation services — COSMP coordination layer + DBGI supervisor + observability + canonical-record-analog doc + arc-closure; three-language stack canonicalization (TypeScript API + Elixir COSMP + Postgres storage; Python ML future); cites ADR-0028 load-bearing — the forward-queue source + commitment-to-ship ADR-0030 fulfills; cites ADR-0026 load-bearing — the 6 BEAM-compatibility patterns canonical at §5 the Phase 2 substrate ports to production Elixir/BEAM; cites ADR-0020 + ADR-0025 prose-mention; sub-phase 1 of the Block B Phase 2 mini-arc — the decision document; sub-phases 2-13 implement)
- **ADR-0031** — BEAM Routing Substrate Architecture (sub-phase 4a decision-substrate register for Block B; documents COSMP routing GenServer state shape + 7-op `handle_call` dispatch (AUTHENTICATE / NEGOTIATE / READ / WRITE / SHARE / REVOKE / AUDIT) + `Capsule` 7-layer placeholder per US 12,517,919 + supervision tree integration + idempotency deferral to sub-phase 5/6 + load-bearing subset of ADR-0026 §5 BEAM patterns (patterns **1, 2, 6** instantiated at sub-phase 4b; patterns **3, 4, 5** forward-queued); cites ADR-0030 + ADR-0026 + ADR-0028 + ADR-0020 + ADR-0016 + ADR-0029; sub-phase 4a of Block B mini-arc — decision substrate; sub-phase 4b `[BEAM-COSMP-GENSERVER-CODE]` instantiates)
- **ADR-0032** — BEAM gRPC Interop Architecture (sub-phase 5a decision-substrate register for Block B; documents cross-language transport boundary between Fastify+TypeScript API and Elixir+BEAM routing layer — `:grpc` + `:protobuf` canonical Elixir libraries + `@grpc/grpc-js` + `@grpc/proto-loader` TypeScript libraries + sync unary call semantics for 7 patent-canonical COSMP ops + Protobuf canonical encoding with patent-verbatim Capsule field numbers 1-7 matching layer ordering + auth boundary at Fastify (NOT gRPC layer) per RULE 20/ADR-0027 + error envelope `oneof` discipline informed by ADR-0026 §5 Pattern 2 + `.proto` versioning via package namespace evolution; cites ADR-0031 load-bearing + ADR-0030 + ADR-0028 + ADR-0026 §5 + ADR-0027 + ADR-0020 + ADR-0016; sub-phase 5a of Block B mini-arc — decision substrate; sub-phase 5b-i `[BEAM-COSMP-INTEROP-GRPC]` instantiates)
- **ADR-0033** — BEAM Persistence + Idempotency + Audit-Chain Cryptographic Substrate Architecture (sub-phase 5b-ii decision-substrate register for Block B; documents the persistence + idempotency + audit-chain triple-paired substrate at the Elixir register — `:ecto_sql` + `:postgrex` canonical Elixir Postgres stack + local containerized Postgres at `localhost:5433/foundation_test` for tests (D-5BII-EXEC-1) + Supabase pooler with `prepare: :unnamed` for prod/dev + two-tier Elixir naming (`CosmpRouter.Capsule` runtime 7-layer + `CosmpRouter.MemoryCapsule` Ecto persistence 30-field) + `CosmpRouter.Capsule.Translator` pure pack/unpack projection + byte-equivalent `canonical_record/1` + `canonical_json/1` + `sha256_hex/1` audit primitive (TS↔Elixir SHA-256 hash chain interchange verified by 10 fixture pairs at every CI run) + `DateTime.truncate(:millisecond)` load-bearing for byte-equivalence + `SYSTEM_PRINCIPALS.COSMP_ROUTER` 5th principal + dual-mode `write_audit_event/1` standalone + `write_audit_event/3` composed Ecto.Multi + Storage facade (ETS hot-tier + Postgres source-of-truth) + Ecto-owned `idempotency_keys` table per D-5BII-EXEC-5 hybrid Option β (Prisma owns shared DDL; Ecto owns Elixir-internal DDL) + composed-mode discipline default for COSMP WRITE/SHARE/REVOKE per RULE 4 + ADR-0026 §5 Pattern 4 compound; cites ADR-0002 load-bearing — TS audit-chain canonical ported byte-equivalent; cites ADR-0011/0013/0015 + ADR-0025 + ADR-0026 §5 + ADR-0028 + ADR-0030 + ADR-0031 + ADR-0032; sub-phase 5b-ii of Block B mini-arc — substrate substrate landed at `[BEAM-COSMP-INTEROP-PERSISTENCE]`; sub-phase 5b-iii Commit A `[BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY]` landed Idempotency layer; sub-phase 5b-iii Commit B `[BEAM-COSMP-INTEROP-INTEGRATION-ROUTER]` landed Router refactor consuming the substrate at the patent-canonical 7-op surface)
- **ADR-0034** — BEAM COSMP Testability Refactor Pattern (sub-phase 6a substrate-build register for Block B; documents the canonical Elixir community testability pattern + **D-WIDER-KNOWLEDGE-CHECK** substrate-build discipline NEW — substrate-build discipline at Elixir/BEAM register includes broader community pattern research before authorizing fixes when substrate-state observations suggest architectural-register coupling; Sub-decision 1 explicit `name` first arg per KV.Registry canonical at `CosmpRouter.Storage.ETS` public functions (`put/3`, `get/2`, `delete/2`, `list/1`, `clear/1`); Sub-decision 2 Router state holds `storage_ets` reference + Storage facade `:ets` opt threading via `get/2`, `put/3`, `delete/2`, `clear/1`; Sub-decision 3 GRPC.Server hardcoded `CosmpRouter.Router` reference deferred to 6b via `Sandbox.allow` canonical Ecto pattern for app-supervised GenServer case (per-test register) + Sub-decision 3-amendment (post-sub-phase-6b Phase 3 Step 3-e) discriminates per-test `Sandbox.allow` canonical vs sequential-multi-test `start_owner!`/`stop_owner` canonical Ecto v3 pattern at canonical-pattern register; Sub-decision 4 ETS table name = GenServer name (same atom; KV.Registry canonical — Elixir process registry + ETS registry are distinct namespaces); Sub-decision 5 NEW ADR at substrate-build register; production singleton supervision tree unchanged via default `:name = __MODULE__` opt fallback; per-test instances via `CosmpRouter.RouterTestHelpers.start_router!/1` + `start_sandbox_owner!/0` (NEW `apps/cosmp_router/test/support/router_test_helpers.ex`; `mix.exs` `elixirc_paths(:test)` MOD); wider-knowledge sources canonical at the ADR — Ecto.Adapters.SQL.Sandbox docs (`start_owner!`/`stop_owner`), Sean Lewis "Elixir Concurrent Testing Architecture", DockYard "Understanding Test Concurrency in Elixir", KV.Registry Mix-OTP tutorial, Thoughtbot dynamic-names article, Elixir Forum supervised-GenServer testing threads; substrate-build cluster expanded to 8 canonical observations; cites ADR-0031 + ADR-0033 + ADR-0026 §5 + ADR-0030 + ADR-0020 + RULE 20 (Founder authorization explicit at this ADR's creation) + RULE 13 (pre-flight surface preceded authorization); sub-phase 6a of Block B mini-arc; sub-phase 6b `[BEAM-COSMP-INTEGRATION-TESTS]` consumes substrate; sub-phases 7-13 DBGI substrate port testability discipline pattern; cluster expanded to 9 canonical observations at ADR-0035 sub-phase 6c)
- **ADR-0035** — Substrate-Build Discipline Canonical (sub-phase 6c substrate-build register for Block B; canonicalizes 9 substrate-build discipline observations across Block B mini-arc sub-phases 5b-ii through 6c — D-CI-FRESH-1/2/3 + D-IDEMPOTENCY-3 + D-5BIII-COMMITB-1/2/3-REFINED + D-SUBSTRATE-LANDING-PREEMPT + D-AUDIT-OUTCOME-ENUM + D-ABORT-CONDITION-PRECISION + D-WIDER-KNOWLEDGE-CHECK + **D-CASCADE-SCOPE-PRECISION NEW** (pre-flight grep surfaces actual cumulative-lineage cascade scope; operator-tier estimates are starting points, not ground truth); Sub-decision 1 RULE 11 fills vacant rule slot with D-WIDER-KNOWLEDGE-CHECK discipline at operating-manual register (substrate-binding); Sub-decision 2 ADR-0035 catalogs 9 observations with sub-phase + commit lineage at substrate-build register; Sub-decision 3 `docs/contributing/elixir-beam-best-practices.md` (NEW) curated reference for new team members + their AI tools — 6 canonical Elixir/BEAM sources (Ecto.Adapters.SQL.Sandbox + Sean Lewis "Elixir Concurrent Testing Architecture" + DockYard "Understanding Test Concurrency in Elixir" + KV.Registry Mix-OTP canonical + Thoughtbot dynamic-names + Elixir Forum) + 8-pattern catalog NIOV uses + when-you-hit-an-Elixir/BEAM-problem checklist; Sub-decision 4 onboarding cascade — `docs/contributing/onboarding-for-engineers.md` §1 (pre-flight discipline integration: RULE 11 / 12 / 13 / 18) + §2 (20 RULES + 35 ADRs canonical; RULE 11 substantively filled at 6c) + §6 (recommended reading: elixir-beam-best-practices.md as required reading when contributor work touches Elixir/BEAM substrate); Sub-decision 5 ADR-0035 sits at substrate-build register alongside ADR-0027 + ADR-0029 — three registers, one discipline (ADR-0034 architectural; ADR-0035 substrate-build; RULE 11 operating-manual); cites ADR-0027 + ADR-0029 (substrate-build register precedents) + ADR-0034 (D-WIDER-KNOWLEDGE-CHECK origin) + ADR-0030 + ADR-0031 + ADR-0033 + RULE 11 + RULE 13 + RULE 20 (Founder authorization explicit at this ADR's creation); sub-phase 6c of Block B mini-arc — substrate landed at `[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]`; Block B count 18 → 19 per Q-NEW-SPLIT-3; cumulative-lineage cascade 17 → 19 absorbed at this commit per D-CASCADE-SCOPE-PRECISION + D-SUBSTRATE-LANDING-PREEMPT — ~20 sites rotated; **cluster expanded 9 → 17 at sub-phase 6b commit `7ef95a2` + 17 → 23 at ADR amendment commit [post-d9a6766] per Option β substrate-honest discipline (5 NEW observations 18-22: D-AMENDMENT-FORWARD-QUEUE-CLOSURE-CASCADE + D-PRE-COMMITTED-ADR-CANONICAL-VERIFICATION + D-GIT-STATUS-SHORT-UNTRACKED-DIR-COLLAPSE + D-PHASE-8-PG-VS-GPROC-DISCRIMINATION + D-STRATEGIC-TIER-TEMPORAL-ESTIMATE-OVER-PROJECTION; 23rd D-CLUSTER-NUMBERING-DRIFT documents pre-existing L94/L118 duplicate "10." numbering preserved at substrate-state ground truth per Option β; D-OBSERVATION-CLUSTER-SUBSTRATE-ARCHITECTURAL-BOUNDARY 24th candidate recursively forward-queued for cluster-split-vs-thematic-sub-ADRs decision when 25th+ observation surfaces); ADR-0030 §DBGI sub-phase 8 amendment LANDED at same commit per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical**)

- **ADR-0036** — REGULATOR Principal + Lawful-Basis Attestation Pattern (CAR Sub-box 3 register; the patent-implementation evidence substrate for CAR §2.1 REGULATOR Entity Type + §2.2 Lawful-Basis Attestation per Family 1 — extends US 12,164,537 (COSMP) + US 12,399,904 (DMW) into regulatory-access territory; 8 sub-decisions all RESOLVED across the 7-sub-phase Sub-box 3 mini-arc — Sub-decision 1 REGULATOR EntityType distinct from GOVERNMENT (CAR §2.1 correctness-hazard guard); Sub-decision 2 3 regulator-specific TAR fields (regulator_jurisdiction + regulator_authority_scope + regulator_credentialed_by); Sub-decision 3 LawfulBasis Prisma model + LawfulBasisType enum (6 values: SUBPOENA + REGULATORY_AUTHORITY + COURT_ORDER + DPA_REQUEST + MLAT_REQUEST + CONSENT_OF_DATA_SUBJECT); Sub-decision 4 3 AuditEvent event_type literals (REGULATOR_ACCESS_GRANTED + REGULATOR_ACCESS_REVOKED + REGULATOR_ACCESS_EXPIRED-reserved); Sub-decision 5 hybrid lawful-basis cryptographic binding via canonical_record/1 12 → 14 fields at TS + Elixir registers (positions 13 + 14 = lawful_basis_id + lawful_basis_chain_hash); Sub-decision 6 dual-control binding for regulator-grant routes per ADR-0026; Sub-decision 7 REGULATOR authentication credentialing pattern (presence-check at sub-phase 6; National PKI + EU eIDAS forward-queued); Sub-decision 8 SYSTEM_PRINCIPAL extension RESOLVED at sub-phase 5 commit body — NO new principal added; SYSTEM_PRINCIPALS frozen-anchor count remains 5; future REGULATOR_ACCESS_EXPIRED uses existing SCHEDULER if implemented; cites ADR-0019 (cryptographic-suite posture) + ADR-0020 (Register-2 patent-implementation evidence) + ADR-0026 (dual-control middleware pattern) + ADR-0033 (audit-chain byte-equivalence; canonical_record/1 12 → 14 extension); Status: Accepted at sub-phase 7 [SUB-BOX-3-CLOSURE] commit; 7-sub-phase mini-arc lineage `4981d3a → db6e0d7 → d0b5c64 → f9d0694 → 71af2c6 → d6f9e18 → this commit`)
- **ADR-0037** — Jurisdiction Tagging Architecture for Entity / MemoryCapsule / AuditEvent / OrgSettings (CAR Sub-box 2 register; the data-tier jurisdiction-tagging substrate for CAR §1.6 Regional / Sovereignty Boundaries + §2.4 Jurisdictional Scope; 9 sub-decisions to land across the 6-sub-phase CAR Sub-box 2 mini-arc — Sub-decision 1 single-String jurisdiction representation (matches LawfulBasis.jurisdiction_invoked precedent; multi-jurisdiction is REGULATOR-tier-only at TAR.regulator_jurisdiction[]); Sub-decision 2 4 jurisdiction columns at Entity + MemoryCapsule + AuditEvent + OrgSettings; Sub-decision 3 AuditEvent.jurisdiction is row-metadata-only (NOT extending canonical_record/1; preserves Sub-box 3 sub-phase 4 14-field byte-equivalence + 12 fixture pairs + cosmp_router default tier 137/0 unchanged); Sub-decision 4 MemoryCapsule.jurisdiction immutable after creation (cross-region transfer is forward-queued explicit workflow); Sub-decision 5 service-tier defaulting cascade at createEntity + createCapsule + writeAuditEvent helpers (Prisma cannot do cross-row defaults); Sub-decision 6 NEW assertJurisdictionalScope pure-function helper at apps/api/src/services/cosmp/jurisdiction-enforcement.ts (mirrors sub-phase 6 of Sub-box 3 regulator-enforcement.ts pattern; 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction); Sub-decision 7 COSMP enforcement at NEGOTIATE start-check + readContent TOCTOU re-check + SHARE start-check + REVOKE start-check + WRITE create-time defaulting + WRITE update-time immutability enforcement; Sub-decision 8 REGULATOR integration LawfulBasis.jurisdiction_invoked === MemoryCapsule.jurisdiction match (augments — does NOT replace — TAR.regulator_jurisdiction check from Sub-box 3); Sub-decision 9 enables downstream CAR Sub-boxes 4 (DecisionRecord + DataSubjectReference + Agent Attestation) + 5 (jurisdiction-aware deletion variants) + 8 (Cross-Tenant Compliance Benchmarking; meta-jurisdiction aggregates) + 9 (Capsule Compliance Provenance); cites ADR-0036 §Substrate-Honest Distinctions (closes the previously preserved QUEUED reference) + ADR-0026 §5 (BEAM-compatibility patterns inheritance) + GDPR Articles 44-50 + Schrems II + FedRAMP boundary + CMMC SC.L2-3.13 (legal/security context citations only; no compliance certification claim); patent relevance: NONE directly per CAR §1.6 verbatim ("region tagging is conventional") — NO Patent-Implementation Evidence section; NO ADR-0020 cite; NO ADR-0019 cite; NO ADR-0033 cite; Status: Accepted at sub-phase 6 [CAR-SUB-BOX-2-CLOSURE] commit; 6-sub-phase mini-arc lineage `c72fabd → 93f96ec → 3fab20d → 6efdf44 → 7faf2ac → this commit`)
- **ADR-0038** — DMW Worker per-DMW Supervised Process (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 1 sub-phase a register; the per-DMW supervised process substrate canonicalizing the DMWWorker GenServer module at `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` that uses the BEAM scaffolding LANDED at sub-phases 8-11; 8 sub-decisions at substrate-architectural register — Sub-decision 1 module location at apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex; Sub-decision 2 identity addressing by entity_id via `{:via, Registry, {DbgiSupervisor.Registry, entity_id}}` Registry key + `"dmw:#{entity_id}"` Phoenix.Tracker topic; Sub-decision 3 tier dispatch axis on WalletType 3-tier (PERSONAL + ENTERPRISE + DEVICE) right-sized for sub-phase a (EntityType 7-tier and any future compute_tier field forward-substrate); Sub-decision 4 lifecycle pattern lazy-spawn on first COSMP operation against the wallet's entity_id (consumer-tier-cost framing preserved; idle wallets cost nothing at memory-footprint register); Sub-decision 5 state stateless plus Phoenix.Tracker presence only at sub-phase a (ETS cache substrate forward-substrate); Sub-decision 6 DMWWorker vs cosmp_router relationship separate-layer (DMWWorker runs dbgi-tier lifecycle and coordination substrate; cosmp_router stays as single-GenServer COSMP-op dispatcher at sub-phase a; cosmp_router re-wire forward-substrate to sub-arc 1 sub-phase b and beyond); Sub-decision 7 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction; Sub-decision 8 testability per ADR-0034 (name-configurable substrate + start_supervised! patterns; tests exercise spawn via DynamicSupervisor + Registry lookup + Phoenix.Tracker presence on init + presence absence on terminate + tier-differentiated behavior + parallel DMWWorkers for distinct entity_ids + stop-then-restart resilience); cites ADR-0026 §5 (BEAM-compatibility patterns) + ADR-0028 §3 (BEAM Coordination Layer) + ADR-0028 §Forward Queue (per-capsule supervised Elixir process forward-substrate item this ADR substantively closes at per-DMW granularity) + ADR-0034 (BEAM testability discipline); hybrid hot/cold framing canonical at substantive register (ENTERPRISE always-hot + PERSONAL/AI_AGENT promote-on-activity + DEVICE always-cold shard-mapped); Status: Accepted 2026-05-15 at sub-arc 1 sub-phase a `[BEAM-DBGI-DMWWORKER-CLOSURE]` commit; 3-commit mini-arc lineage `3b431bf` → `56e0eaa` → this commit)

ADRs are sequentially numbered. Gaps are not closed when ADRs
are superseded or deprecated — a retired ADR keeps its number
with Status updated to "Superseded by ADR-NNNN" or "Deprecated."
This preserves citation stability across the ADR catalog over
time.

## ADR Lifecycle

Status flows: **Proposed** → **Accepted YYYY-MM-DD** → optionally
**Superseded by ADR-NNNN** or **Deprecated**.

Add a new ADR when an architectural decision is one that future
contributors will need to understand the rationale for. If a
decision is purely tactical and won't be referenced in six
months, it doesn't need an ADR.

Amend an existing ADR (in-place edit, same commit, no Status
change) for clarifications or to add new bidirectional
citations. Supersede an existing ADR (new ADR with explicit
"Supersedes ADR-NNNN" line, prior ADR's Status updated) when
a new architectural decision replaces an earlier one.

## Bidirectional Citation Discipline

Every ADR's References section ends with a "Bidirectional
citations (cited from)" block listing every other file that
cites it — glossary entries, architectural-anchors catalog
entries, other ADRs, code JSDoc comments. When adding a new
ADR that cites an existing ADR, the existing ADR's References
must be amended in the same commit to include the
back-citation.

The discipline ensures future readers grepping any file in the
citation graph can navigate to every related file. Broken
cross-references surface as missing back-citations during
review.

The two primary citation sources outside of ADRs themselves are
`docs/reference/glossary.md` (terminology + capitalization
conventions) and `docs/reference/architectural-anchors.md` (the
runtime-enforced architectural properties locked by tests).

## Cross-References

- `docs/reference/glossary.md` — term definitions and
  capitalization conventions
- `docs/reference/architectural-anchors.md` — the 8
  runtime-enforced architectural properties (DRIFT 9 audit,
  DRIFT 9 permissions, DRIFT 2 Option C, DRIFT 12, frozen
  CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS, `combined_score`
  coefficient invariants per ADR-0022, `RELEVANCE_FORGET_FLOOR`
  behavioral lock per ADR-0022) as of [DOCS-CATALOG-REFRESH-ANCHORS]
- `docs/reference/section-12-progress.md` — Section 12
  build-cycle live tracker
- `docs/contributing/` — contributor guides (coming in Phase 2
  of Section 12C.0.5)
