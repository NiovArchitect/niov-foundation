# CLAUDE.md

Authoritative operational rules for Claude Code sessions in
`niov-foundation`. Read this entire file before every action.
The 11 preserved RULES (0-10) and RULES 12-20 — added
incrementally since Section 12C.0.5 (12-16 in the 12C.0.5 batch;
17 from RAA 12.7; 18 from Gate 9; 19 from ADR-0020; 20 from
ADR-0027) — define what every session in this repo internalizes;
the rest of the file provides the project context those rules
operate against.

This file replaces the pre-Section-12 `claude.md` (lowercase)
in Section 12C.0.5 Phase 3a. The 11 preserved RULES are quoted
verbatim from the prior file; RULES 12-16 emerged from Phase 1-2
substrate work in that same commit, and RULES 17-20 were added
subsequently (each with its own ADR or substrate-work lineage).

## 1. Project Overview

`niov-foundation` is the protocol layer of the NIOV Labs
platform — the cryptographic governance layer that keeps humans
permanently in control of what AI can know. It implements the
**COSMP** (Contextual Orchestration and Scoped Memory Protocol,
patent US 12,517,919) and the **DMW** (Decentralized Memory
Wallet) substrate referenced in patents US 12,164,537 and
US 12,399,904. AI is projected to surpass human intelligence as
early as 2026; without a governance layer, AI consolidates all
human knowledge without consent, audit, or compensation. Every
architectural decision in this repo serves the mission of
preventing that.

Entities (people, companies, AI agents, devices, governments)
own their intelligence in **Memory Capsules** stored in their
DMW. The COSMP Protocol governs every access; the **Contextual
Orchestration Engine (COE)** retrieves the right capsules at
the right time. Applications like Otzar (the conversational
intelligence product) run on top of this Foundation. Every
data access is audited and attributed.

`niov-foundation` is **not** the Otzar product or the
otzar-control-tower frontend. The Foundation
is backend-only. Tech stack: Node.js + TypeScript + Fastify
(API), Postgres 16+ with Prisma ORM (database; provider-agnostic
per ADR-0018, current operator deployment Supabase), Upstash
Redis (cache), Supabase Storage (storage), Vitest (tests). The
substrate is deployment-target agnostic per ADR-0018 (managed
cloud, sovereign cloud, on-premise, or air-gapped); current
operator deployment is Supabase-hosted. There is no
blockchain, no distributed ledger, no smart contracts, no
token. **DECENTRALIZED in DMW means SOVEREIGNTY, not
infrastructure** — no central authority owns or controls entity
intelligence; the COSMP protocol enforces this cryptographically
in code, not policy.

Glossary terms (Memory Capsule, COSMP, COE, DMW, EntityComplianceProfile,
writeAuditEvent, etc.) are defined in
`docs/reference/glossary.md`. Do not redefine them here or in
new code; cite the glossary entry.

## 2. Repository Structure

```
niov-foundation/
├── apps/
│   └── api/                          (Fastify backend)
│       ├── src/
│       │   ├── routes/               (HTTP endpoints)
│       │   ├── services/             (business logic)
│       │   │   ├── auth.service.ts
│       │   │   ├── coe/              (COE service)
│       │   │   ├── compliance/       (Compliance Router)
│       │   │   ├── cosmp/            (COSMP 7 operations)
│       │   │   ├── feedback/         (Seven Feedback Loops)
│       │   │   ├── governance/       (org/dandelion)
│       │   │   ├── hive/             (Hive Intelligence)
│       │   │   ├── llm/              (LLM provider)
│       │   │   ├── monetization/     (70/30 split)
│       │   │   └── otzar/            (8-layer prompt + truncation)
│       │   ├── middleware/
│       │   ├── logger.ts             (structured Pino logger)
│       │   ├── boot-validation.ts    (startup invariants)
│       │   └── server.ts             (Fastify entrypoint)
│       └── tsconfig.json
├── packages/
│   ├── auth/                         (password + crypto helpers)
│   └── database/                     (Prisma schema + queries)
│       ├── prisma/schema.prisma
│       └── src/queries/
├── tests/
│   ├── unit/                         (anchor + service tests)
│   ├── integration/                  (HTTP round-trip tests)
│   └── helpers.ts                    (fixture synthesis)
├── docs/
│   ├── architecture/
│   │   ├── README.md                 (ADR catalog)
│   │   └── decisions/                (ADRs 0001-0019 + template)
│   ├── reference/
│   │   ├── glossary.md
│   │   ├── architectural-anchors.md
│   │   └── section-12-progress.md
│   ├── contributing/                 (code style, testing, agents)
│   ├── COMPLIANCE_ARCHITECTURE_REVIEW.md
│   ├── STRUCTURED_LOGGING_SCHEMA.md
│   ├── AUDIT_RETENTION_POSTURE.md
│   └── FIPS_DEPLOYMENT_POSTURE.md
├── CLAUDE.md                         (this file)
├── AGENTS.md                         (multi-LLM router; Phase 3b)
├── README.md                         (repo entrypoint; Phase 3c)
├── package.json                      (npm workspaces)
├── tsconfig.base.json                (strict + noUncheckedIndexedAccess)
└── vitest.config.ts                  (300s timeout, retry=2)
```

## 3. Critical Operating Rules

These rules govern every session. Rules 0-10 are preserved
verbatim from the pre-Section-12 `claude.md`; RULES 12-20 were
added incrementally since Section 12C.0.5 — Rules 12-16 from the
12C.0.5 Phase 1-2 substrate work; RULE 17 from RAA 12.7; RULE 18
from Gate 9; RULE 19 from ADR-0020; RULE 20 from ADR-0027. RULE
11 is intentionally vacant — the prior file had 11 rules numbered
0-10, and new rules start at 12 to maintain stable numbering as
the rule list grows.

### RULE 0 -- HUMANS ARE ALWAYS SOVEREIGN (THE FOUNDATION RULE)

No AI agent, robot, device, or application can access a human
entity data without that human explicit revocable permission.
This is enforced cryptographically -- not by policy.
AI entities have lower default permission ceilings than humans.
Only a human entity can grant LONG_TERM or PERMANENT access.
AI entities cannot grant access to other AI entities.
A human can revoke ALL access to their wallet in one action.
This rule governs every other decision in this system.

### RULE 1 -- BUILD FORWARD ONLY

Never delete, overwrite, or restructure code that is already working.
Only ADD new code. Ask before touching any prior section.

### RULE 2 -- ONE SECTION AT A TIME

Complete = code written + all tests passing + green light confirmed.
Never start Section N+1 while Section N has failing tests.

### RULE 3 -- TESTS ARE NOT OPTIONAL

Every function gets a test. Every endpoint gets a test.

### RULE 4 -- AUDIT TRAIL IS SACRED

Every action that touches data gets logged BEFORE the response is sent.
If the audit write fails, the entire action fails. No exceptions.

### RULE 5 -- PERMISSIONS BEFORE DATA -- IN THIS EXACT ORDER

1. Authentication 2. Clearance 3. Permission 4. Conditions
Never skip. Never combine.

### RULE 6 -- COMMENTS ON EVERYTHING

Every file: FILE / PURPOSE / CONNECTS TO header
Every function: WHAT / INPUT / OUTPUT / WHY comment

### RULE 7 -- TEST AGENT RUNS AFTER EVERY SECTION

Run: npx vitest run
Report: X passed, Y failed, list all failures with file and line.
Section not complete until zero tests fail.

### RULE 8 -- REPAIR AGENT RULES

1. Fix one failing test at a time
2. State what you are changing and why before the change
3. Make minimum change -- do not refactor other things
4. Re-run the specific test immediately after the fix
5. After 3 failed attempts: STOP, explain in plain English, wait
6. NEVER modify test files -- only production code

### RULE 9 -- MODULAR CONNECTIONS

Services connect through APIs only. No cross-service DB reads.

### RULE 10 -- NOTHING IS EVER DELETED

Deletion = setting deleted_at timestamp. Record stays. Always.

**Clarifying note (Section 12C.0.5):** For audit_events
specifically, the BEFORE DELETE trigger
(`packages/database/src/queries/audit.ts`) enforces this rule
at the database level — see ADR-0002 (append-only audit chain).
Section 12.5 Sub-box 5 Family 4 will introduce
**pseudonymization for right-to-erasure compliance** (GDPR
Article 17): the audit row stays, but PII fields can be
pseudonymized in-place. Pseudonymization preserves chain
integrity (the SHA-256 chain links remain valid because the
row is updated, not deleted). This is the Foundation pattern
for reconciling Rule 10 with regulatory erasure obligations;
do not implement pre-emptively.

### RULE 12 -- PRE-FLIGHT GREP BEFORE DRAFTING

Before writing or modifying substrate (ADRs, reference docs,
contributing guides, or any documentation that cites code):
verify the cited substrate against the actual repo. Read the
cited files, run the cited greps, confirm the cited config
values. This rule emerged from Phase 1-2 of Section 12C.0.5;
the discipline's externalization is the "SUBSTRATE-HONESTY
DRIFTS" section in every Phase 1-2 verification report.
See `docs/contributing/README.md` §Operational Disciplines.

### RULE 13 -- SURFACE DRIFTS INLINE OVER SILENT FIX

When pre-flight grep finds a mismatch between spec and
substrate (or between two pieces of substrate), surface the
drift in the verification report and request resolution.
Do not silently patch the gap in an unrelated commit. The
canonical examples are the Phase 1E COSMP expansion correction
(Capsule Owned Sovereign vs. patent-canonical Contextual
Orchestration and Scoped Memory) and the Phase 2c agent-state
`.gitignore` patterns. See `docs/contributing/README.md`
§Operational Disciplines.

### RULE 14 -- BIDIRECTIONAL CITATION DISCIPLINE

Any new ADR or reference doc that cites another ADR or
reference doc must be matched by a back-citation in the cited
file in the same commit. The discipline ensures the citation
graph is closed and a future reader grepping any file in the
graph can navigate to every related file. See
`docs/architecture/README.md` §Bidirectional Citation
Discipline for the full rationale.

### RULE 15 -- SINGLE-CYCLE TEST DISCIPLINE

Foundation's full-suite test runtime is 90-110 minutes (per
ADR-0010). Two `vitest` runs against the shared Supabase test
schema produce fixture collision; only one cycle runs at a
time. While Agent A's `vitest` runs, Agent B can edit / lint /
typecheck — but no tests. See ADR-0010 and
`docs/contributing/parallel-sessions.md` §Test-Cycle
Discipline. Track A (post-Section-12C.0.5) introduces
containerized Postgres for unit tests, removing this constraint.

### RULE 16 -- NO `console.*` IN `apps/api/src`

`console.log`, `console.warn`, `console.error`, `console.info`,
`console.debug` are forbidden inside `apps/api/src/`. The
runtime invariant is locked by
`tests/unit/no-console-in-api-src.test.ts` (the DRIFT 2
Option C anchor). Use the structured logger
(`apps/api/src/logger.ts` for module-level / boot-time;
`request.log.*` or `fastify.log.*` for request-scoped). See
ADR-0005 (no `console.*` in `apps/api/src`) and
`docs/contributing/code-style.md` §Logging. Enforced at TEST
tier via `tests/unit/no-console-in-api-src.test.ts` and at
git-hook tier via `.husky/pre-commit` per ADR-0024
(pre-commit-hook-posture).

### RULE 17 -- ARCHITECTURAL FRAMING IS LOAD-ON-OPEN

Foundation's architectural framing is not optional context
for AI tool sessions; it is the lens through which substrate
work is understood. Sessions that begin without loading the
framing operate on incomplete substrate. Architectural framing
established in canonical RAA documents must be cross-referenced
in this operating manual and read on session opening per the
onboarding ritual.

Currently canonical: `docs/architecture/dynamic-flow-architecture.md`
(RAA 12.7) — Foundation as embodied substrate for AI cognition;
qi-and-blood metaphor; bilateral-vs-unilateral zone discrimination;
default-rule-bilateral. As additional canonical RAAs land in
`docs/architecture/`, they join this load list.

Operationalized via `docs/contributing/onboarding.md` §3 Step 5.
Lineage: this rule emerged from RAA 12.7 (commit `0fd8da7`); see
Gate 9 commit body for the operator directive.

### RULE 18 -- VERIFY OPERATION TYPE AGAINST ACTUAL FILE STATE

When investigation surfaces an edit plan, the operation verb
(move / update / replace / insert / create) must match what
the substrate actually supports. Plans that assume "move" when
the source does not exist, "update" when the field is absent,
or "extend" when the structure is closed are substrate-
incoherent — they describe an edit against an idealized file
rather than the real one. Investigation must verify the
operation verb against the actual current file state and
surface the correction inline before drafting.

Lineage: this rule emerged from D-G9-3 surfaced during Gate 9
investigation; see this commit body for the precedent case.

### RULE 19 -- TWO-REGISTER IP DISCIPLINE

Foundation operates in two registers: Register 1 (AI authorship
lens — private architectural scaffolding: metaphors, philosophical
framing, conceptual handles) and Register 2 (concrete form —
business-grade canonical topology: entities, wallets, capsules,
COSMP, hardened ASI-grade substrate documentation).

Metaphors stay in Register 1. Concrete form is what enters
Register 2. Authorship voice for all canonical RAA documents,
business surfaces, customer documentation, integration partner
materials, government procurement materials, and patent licensee
disclosures is Register 2 only. Register 1 framing is loaded as
AI-internal context (via RULE 17 architectural framing load-on-
open) to inform structural reasoning but is not exposed in
document body.

Identity-level naming (named individuals — adversarial actors,
current and former team members in operational context, third-
party legal counterparts, vendor relationships under NDA,
financial counterparts, investor relationships, hiring-pipeline
candidates, advisor relationships — project internal codenames
not yet publicly disclosed, future-product naming pre-
announcement, partnership relationships pre-announcement, and
discontinued-engagement names) is Register 1 content. It never
enters canonical documentation, commits, ADRs, RAAs, business
surfaces, or any repo-visible surface.

Verify which register a document operates in before selecting
voice — extension of RULE 18 spec-vs-substrate-coherence
discipline to the register-discrimination dimension.
Cross-register bleed (Register 1 framing appearing in a Register
2 surface) is a substrate-honesty drift; surface inline per RULE
13 and correct before the document ships.

See ADR-0020 for the decision lineage. RAA 12.7 §1 (qi-and-blood
metaphor) is the canonical Register-1 example; ADR-0001 +
ADR-0019 + `docs/contributing/onboarding.md` §1 are canonical
Register-2 examples.

### RULE 20 -- RULE-MODIFICATION AUTHORITY

Only the patent-holder Founder may modify, add, or remove RULES
(`CLAUDE.md`) or ADRs (`docs/architecture/decisions/*.md`).

Pull requests proposing such modifications must explicitly cite
this RULE in the PR description and surface the proposed
modification for explicit Founder authorization before merge.

Contributors and AI assistants (including Claude, Claude Code,
Codex, Cursor, and any other AI coding tools) MUST NOT modify
`CLAUDE.md` RULES or `docs/architecture/decisions/*.md` content
without explicit Founder authorization, even when authorized to
modify other repository files. An AI assistant surfaces a
RULE/ADR-modification proposal as a substrate-state observation
per RULE 13 rather than executing it, and cites this RULE when
declining; drafting a *proposed* amendment for the Founder's
review is permitted (drafting is not modifying — the Founder's
authorization is the act that lands it).

Rationale: this RULE protects the patent-implementation evidence
trail per ADR-0020 (two-register IP discipline) against
rogue-engineer or rogue-AI substrate modifications that could
erode the substrate-state coherence the patent-holder substrate
depends on. RULES + ADRs constitute the authorization-tier
substrate of the codebase; modifications to that substrate
require the same authorization tier as substrate creation. The
substrate-honest pre-flight discipline (RULE 12/13/18) is the
behavioral half — surface, don't silently patch; this RULE is
the authority half — even when surfaced, a RULE/ADR change is
the Founder's. See ADR-0027 for the decision lineage and
`docs/contributing/onboarding-for-engineers.md` for the
contributor-facing operationalization.

Forward substrate: a future ADR may formalize a
substrate-observation-to-RULE promotion path — recognizing that
substrate-honest observations accumulating across multiple
commits (the kind documented in ADR "Substrate-State Catches
Resolved" sections, the canonical-record docs, and
`docs/contributing/onboarding-for-engineers.md`) may prove
beneficial enough at the substrate-state register to warrant
formal RULE-tier promotion. Until that ADR lands, RULE
additions/modifications remain Founder-only per the authority
half above.

## 4. Architectural Vocabulary

This file is not the glossary. Vocabulary lives in three
authoritative locations:

- `docs/reference/glossary.md` — every Foundation-specific
  term (Memory Capsule, COSMP, COE, DMW, EntityComplianceProfile,
  writeAuditEvent, SYSTEM_PRINCIPALS, etc.) with definitions,
  schema citations, and capitalization conventions
- `docs/reference/architectural-anchors.md` — the 8
  runtime-enforced architectural properties (DRIFT 9 audit +
  permissions filter narrowing, DRIFT 2 Option C no-console,
  DRIFT 12 chainKey priority, frozen `CRYPTO_CONFIG`, frozen
  `SYSTEM_PRINCIPALS`, `combined_score` coefficient invariants
  per ADR-0022, `RELEVANCE_FORGET_FLOOR` behavioral lock per
  ADR-0022) — plus the "Anchor Mechanisms" taxonomy (`Object.freeze`
  / value-pin / behavioral-lock)
- `docs/architecture/decisions/` — the 32 ADRs with
  Decision / Consequences / Alternatives in Michael Nygard
  format

When a term, anchor, or decision is non-obvious in code or
documentation, **cite the reference**, do not redefine.

## 5. Key Architectural Decisions

The 32 ADRs as of [BEAM-COSMP-INTEROP-ADR] (`5712a2b` parent;
2026-05-13). The `docs/architecture/README.md` is the source of
truth for ADR navigation; this is a quick-reference jump table.

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
- **ADR-0011** — Three-tier test stratification (Track A Gate 1; Gate 6 reproducibility-verification amendment in-place at `cae8cf4`)
- **ADR-0012** — Test-mode LLM provider hardening (Track A Gate 1; hash-dispatch decision superseded in part by ADR-0014)
- **ADR-0013** — Containerized Postgres for unit and integration tiers (Track A Gate 1; `postgres:16.4-alpine` pin)
- **ADR-0014** — FixtureBasedLLMProvider key-based dispatch (Track A Gate 3 ADR amendment; supersedes ADR-0012's hash-by-content dispatch)
- **ADR-0015** — CI Workflow Architecture (Track A Gate 7; 8 locked decisions A-H including postgres + Node pins)
- **ADR-0016** — Pin-and-Optimize Framework (substrate-pinning canonical reference; companion to ADR-0017; five-question template)
- **ADR-0017** — Production Discipline (substrate-investigation canonical reference; companion to ADR-0016; nine-step template)
- **ADR-0018** — Deployment-Target Agnosticism Posture (substrate-portability canonical reference; companion to ADR-0016/0017/0019; five-step decision template; commit `657a794`)
- **ADR-0019** — Cryptographic-Suite Posture (substrate-cryptographic-resilience canonical reference; companion to ADR-0016/0017/0018; six-step decision template; commit `7216784`)
- **ADR-0020** — Two-Register IP Discipline (IP-discipline register; the protected-name boundary + RULE 19 at canonical-record register; commit `75a90de` [TRACK-A-RULE-19])
- **ADR-0021** — Capsule Type Extension Protocol (extension-protocol register; CapsuleType enum extension pattern + the PRICING_TABLE `monetization.service.ts:30` deliberate-blocker worked example)
- **ADR-0022** — combined_score Formula Canonicalization (scoring-formula register; the 0.45/0.35/0.20 coefficients + recency 7-day/90-day thresholds; amended at [SEC-INT6-ADR0022] `d743e4c` for the INT-6 frozen-anchors-family informativeness-coefficient join — formula extension is Step 2E)
- **ADR-0023** — Security Headers Posture (security-headers register; the `@fastify/helmet` posture; production-readiness audit lineage)
- **ADR-0024** — Pre-Commit Hook Posture (git-hook-tier enforcement register; husky `^9.1.7`; `.husky/pre-commit` runs the db-push guard (ADR-0025) → typecheck baseline → the RULE 16 no-console anchor; `--no-verify` override preserved)
- **ADR-0025** — Schema-Push-Target Discipline (schema-push-target register; the `prisma db push` explicit-env-target rule + `scripts/prisma-db-push-test.sh` + the `.husky/pre-commit` db-push guard + the `db:push:test` alias; the [D-2D-D10-4] production-schema-push trap; [SEC-DBPUSH] mini-arc `d8d6236`→`e1dbc1e`→`ed9a519`→`5a18491`)
- **ADR-0026** — Dual-Control Middleware Pattern + Privileged Endpoint Registry + Per-Route Binding Discipline (dual-control register; the Sub-box 2 Phase 1 bundle — `requireDualControl` Fastify preHandler + `PRIVILEGED_ENDPOINTS` runtime registry + the `preHandler` BINDING CONTRACT + the 6 BEAM-compatibility patterns + the `executePhase0` setup-primitive boundary; LIVE on Operation A `PATCH /platform/monetization/config` + Operation B `POST /platform/orgs`; operational companion `docs/architecture/dual-control-operations-canonical-record.md`; [SEC-DUAL-CONTROL] arc `b34c5cf`→`6a1a380`→`d42e2a6`→`9628efa`→`3f2f329`→`34eea82`→`ceb418f`→`135fee0`→`62d472c`→ this commit; the 10-commit arc closed at sub-phase J)
- **ADR-0027** — Contributor Governance + AI-Alignment + Rule-Modification Authority (governance register; the authorization-tier protection — RULE 20: only the patent-holder Founder may modify/add/remove RULES or ADRs; the AI-alignment discipline — surface RULE/ADR-modification proposals per RULE 13, don't execute; the contributor-onboarding surface `docs/contributing/onboarding-for-engineers.md` NEW; cites ADR-0020 — RULE 20 protects ADR-0020's Register-2 evidence trail; [SEC-CONTRIBUTOR-GOVERNANCE] sub-phase I of the Sub-box 2 Phase 1 arc)
- **ADR-0028** — Forward-Substrate: Elixir/BEAM Coordination Layer for Capsule Supervision + OtzarComm + DBGI Integration (forward-substrate register; the Sub-box 2 Phase 2 commitment-to-ship — NIOV commits to ship the Elixir/BEAM COSMP coordination layer as a production service, a 6-8-commit / ~3-4-week mini-arc; the three-language stack canonicalization — Fastify+TypeScript API + Elixir COSMP coordination + Python ML + Postgres storage; migration triggers — >1M capsules / >10M-100M daily OtzarComm / multi-region; cites ADR-0026 load-bearingly for the 6 BEAM-compatibility patterns it commits to ship; [SEC-BEAM-FORWARD-SUBSTRATE] sub-phase J — the arc-closure commit; companion canonical-record-analog doc forward-queued at Phase 2)
- **ADR-0029** — Substrate-Build Optimizations: Cascade-Inventory Scripts + Commit-Class Templates + Strategy-Tier Prose Discipline (substrate-build register; the three optimizations addressing the 26-catch dual-control-arc patterns + the discipline's token-cost dimension — (1) `scripts/preflight/` cascade-grep scripts that surface the full cascade landscape before authorization, (2) `docs/contributing/templates/` commit-class scaffolds enumerating standard cascade scopes by template, (3) strategy-tier prose discipline — plain language at the authorization tier, the engineering-tier pre-flight stays full-fidelity; substrate placement for #3 — RULE 21 vs §-guidance — deferred to the sub-phase-4 pre-flight; cites ADR-0028 — the forward-queue source; [SUBSTRATE-BUILD-ADR] sub-phase 1 of the SUBSTRATE-BUILD-OPTIMIZATIONS arc — the decision document; sub-phases 2-5 implement)
- **ADR-0030** — Phase 2 Elixir/BEAM Implementation: Mix Umbrella + COSMP Router + DBGI Supervisor + Three-Language Stack Canonicalization (Phase-2-implementation register; the 16-sub-phase Block B mini-arc (expanded 13 → 14 at sub-phase 4a per Q-G split — see ADR-0031; 14 → 15 at sub-phase 5a per Q-P split — see ADR-0032; 15 → 16 at sub-phase 5b-i per Q-R split — see ADR-0033 forthcoming) that ships Elixir/BEAM substrate as production Foundation services — COSMP coordination layer (sub-phases 2-6: mix umbrella, OTP app, GenServer with the 6 BEAM patterns instantiated, gRPC interop, integration tests); DBGI supervisor (sub-phases 7-10: OTP app, `:pg`+`:gproc` process-group registry, libcluster multi-region topology, integration tests); operational substrate (sub-phases 11-13: telemetry observability, BEAM-coordination-canonical-record analog doc, arc-closure cascade); three-language stack canonicalization (TypeScript API + Elixir COSMP + Postgres storage; Python ML future); cites ADR-0028 load-bearing — the forward-queue source + the commitment-to-ship ADR-0030 fulfills; cites ADR-0026 load-bearing — the 6 BEAM-compatibility patterns canonical at §5 the Phase 2 substrate ports to production Elixir/BEAM; cites ADR-0020 + ADR-0025 prose-mention; [BEAM-PHASE-2-ADR] sub-phase 1 of the Block B Phase 2 mini-arc — the decision document; sub-phases 2-13 implement)
- **ADR-0031** — BEAM Routing Substrate Architecture (sub-phase 4a decision-substrate register; the Block B sub-phase 4a/4b split per Q-G — sub-phase 4a lands ADR-0031 documenting GenServer state shape + 7-op `handle_call` dispatch + `Capsule` placeholder (7 layers per US 12,517,919) + supervision tree integration + idempotency deferral to sub-phase 5/6 (Q-D) + load-bearing subset of ADR-0026 §5 BEAM patterns — **patterns 1 (message-passing), 2 (supervisor-friendly failures), 6 (pure transformation)** instantiated at sub-phase 4b; **patterns 3, 4, 5 forward-queued** to sub-phases 5/6 with their consumers; cites ADR-0030 load-bearing — this ADR is the sub-phase 4a decision substrate; cites ADR-0026 load-bearing — §5 patterns subset; cites ADR-0028 + ADR-0020 + ADR-0016 + ADR-0029 prose-mention; [BEAM-COSMP-GENSERVER-ADR] sub-phase 4a of Block B Phase 2 mini-arc — decision substrate; sub-phase 4b instantiates)
- **ADR-0032** — BEAM gRPC Interop Architecture (sub-phase 5a decision-substrate register for Block B; documents cross-language transport boundary between Fastify+TypeScript API and Elixir+BEAM routing layer — `:grpc` + `:protobuf` canonical Elixir libraries + `@grpc/grpc-js` + `@grpc/proto-loader` TypeScript libraries + sync unary call semantics for 7 patent-canonical COSMP ops per US 12,517,919 + Protobuf canonical encoding with patent-verbatim Capsule field numbers 1-7 matching layer ordering + auth boundary at Fastify (NOT gRPC layer) per RULE 20/ADR-0027 + error envelope `oneof` discipline informed by ADR-0026 §5 Pattern 2 + `.proto` versioning via package namespace evolution; cites ADR-0031 load-bearing — sub-phase 5b instantiates ADR-0032's decisions; cites ADR-0030 + ADR-0028 + ADR-0026 §5 + ADR-0027 + ADR-0020 + ADR-0016 prose-mention; [BEAM-COSMP-INTEROP-ADR] sub-phase 5a of Block B mini-arc — decision substrate; sub-phase 5b-i [BEAM-COSMP-INTEROP-GRPC] instantiates)
- **ADR-0033** — BEAM Persistence + Idempotency + Audit-Chain Cryptographic Substrate Architecture (sub-phase 5b-ii decision-substrate register for Block B; documents the persistence + idempotency + audit-chain triple-paired substrate at the Elixir register — `:ecto_sql` + `:postgrex` canonical Elixir Postgres stack per Q-PERSISTENCE-DEPS + local containerized Postgres at `localhost:5433/foundation_test` for tests per D-5BII-EXEC-1 Option β + Supabase pooler with `prepare: :unnamed` for prod/dev + two-tier Elixir naming (`CosmpRouter.Capsule` runtime 7-layer per US 12,517,919 + `CosmpRouter.MemoryCapsule` Ecto persistence 30-field mirror of Prisma's `MemoryCapsule` per Q-CAPSULE-NAME Fork β Refined) + `CosmpRouter.Capsule.Translator` pure pack/unpack projection per ADR-0026 §5 Pattern 6 + byte-equivalent `canonical_record/1` + `canonical_json/1` + `sha256_hex/1` audit primitive (TS↔Elixir SHA-256 hash chain interchange verified by 10 fixture pairs at every CI run) + `DateTime.truncate(:millisecond)` load-bearing for byte-equivalence per D-5BII-EXEC-2 + `SYSTEM_PRINCIPALS.COSMP_ROUTER` 5th principal extension at TS register (D-5BII-EXEC-3) + dual-mode `write_audit_event/1` standalone + `write_audit_event/3` composed Ecto.Multi (composed-mode default for COSMP WRITE/SHARE/REVOKE per RULE 4 + ADR-0026 §5 Pattern 4 compound) + Storage facade (ETS hot-tier preserved per ADR-0031 Q-T + Postgres source-of-truth per ADR-0033 §5; ETS-first read with Postgres fallthrough; Postgres write authoritative) + Ecto-owned `idempotency_keys` table per D-5BII-EXEC-5 hybrid Option β (Prisma owns shared-table DDL per ADR-0025; Ecto owns Elixir-internal DDL — first instantiation at sub-phase 5b-iii Commit A migration `priv/repo/migrations/20260514040407_create_idempotency_keys.exs`) + Pattern 4 + Pattern 5 idempotent verification keys compound + BEFORE DELETE trigger ownership at TS register per D-5BII-EXEC-6 + `System.get_env("DATABASE_URL")` at `config/runtime.exs` per D-5BII-EXEC-7 (no `:dotenvy` Hex dep); cites ADR-0002 load-bearing — TS audit-chain canonical ported byte-equivalent at Elixir register; cites ADR-0011 + ADR-0013 + ADR-0015 — containerized Postgres test register; cites ADR-0025 — Schema-Push-Target Discipline migration ownership boundary; cites ADR-0026 §5 — 6 BEAM patterns; cites ADR-0028 — forward-queue source; cites ADR-0030 — Phase 2 implementation register; cites ADR-0031 Q-D — idempotency-strategy forward-queue resolved here; cites ADR-0032 — sub-phase 5b decision substrate split per Q-R; D-CI-FRESH-1+2+3+IDEMPOTENCY-3 substrate-build canonical lessons cluster operational at cross-environment register; sub-phases 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] (substrate) + 5b-iii Commit A [BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY] (Pattern 4/5 substrate) + 5b-iii Commit B [BEAM-COSMP-INTEROP-INTEGRATION-ROUTER] (Router 7-op composed-mode integration consuming the substrate at patent-canonical 7-op surface) collectively land the ADR-0033 substrate; comprehensive end-to-end Router DB-touching tests forward-queued to sub-phase 6 [BEAM-COSMP-INTEGRATION-TESTS] per D-5BIII-COMMITB-1+2+3 substrate-build observations)

ADR amendments and supersession follow the discipline in
`docs/architecture/README.md` §ADR Lifecycle.

## 6. Section 12 Build Cycle

Sections 1-11 (Foundation) closed pre-Section-12. The
Section 12 build cycle covers Foundation hardening + Otzar
Control Tower frontend + Compliance Architecture Review +
this documentation infrastructure batch. Recent landmarks:

- `f3359fb` — Section 12C.0 Commit 2 (Foundation compliance
  hardening: 5 items)
- `9671776` — Section 12.5 Compliance Architecture Review
  (24 dimensions, 6 patent claim families)
- Section 12C.0.5 — this commit (operating manual + docs
  infrastructure)
- Track A — IN FLIGHT (post-Section-12C.0.5):
  - Gate 1 (architectural lock; ADRs 0011/0012/0013): CLOSED `d728cd4`
  - Gate 2 REVISED (Colima canonicalization; ADR-0013 amendment per RULE 13 substrate-honest discipline; substrate-active runtime is Colima 0.10.1 on operator's Intel Mac; OrbStack + Docker Desktop confirmed NOT installed; multi-runtime contributor onboarding flexibility preserved at ADR-0011 register): IN FLIGHT (`[TRACK-A-G2]`)
  - Gate 3 Half A (containerized Postgres infra): CLOSED `081d35e`
  - Gate 3 ADR amendment (ADR-0014 supersedes ADR-0012 dispatch): CLOSED `2a14dec`
  - Gate 3 Half B (FixtureBasedLLMProvider + 10 fixtures): CLOSED `16b4482`
  - Gate 4 (tier configs + npm scripts): CLOSED `925761d`
  - Gate 5a (foundational substrate): CLOSED `c5c8b00`
  - Gate 5b (consumer adoption + 3-tier verification): CLOSED `9260c53`
  - Gate 6 (reproducibility evidence; ADR-0011 amendment): CLOSED `cae8cf4`
  - Gate 7-pre (lock-file sync): CLOSED `e8a559e`
  - Gate 7 (CI workflow architecture; ADR-0015): CLOSED `78cf1b5`
  - Gate 7-post (Drift G7-E fix): CLOSED `9f8e909`
  - Gate 7-post-2 (Drift G7-PRE-C fix): CLOSED `2fbc057`
  - Gate 8a (ADR cross-citation back-references): CLOSED `3febf83`
  - Gate 8b (CLAUDE.md update): CLOSED `3a571fb`
  - Gate 8b-amendment (ADR-0018/0019 + audit-bucket closure): CLOSED `7269a7a`
  - Gate 8c (onboarding.md + testing.md back-citations): CLOSED `bea1b33`
  - Gate 8d (discipline-pattern documentation; scope expanded per ADR-0019 to include hardcoded algorithm literal cleanup at `createCipheriv`, `createHash`, `"sha256:"` prefix sites): CLOSED `2fc025a`
  - Gate 8e (ADR-0016 amendment adding deployment-target + cryptographic-suite worked example categories): CLOSED `e829644`
- Independent companion tracks (canonical references; landed
  alongside Track A):
  - G5b-I Resolution: CLOSED `fbc7942`
  - ADR-0016 Pin-and-Optimize Framework: CLOSED `782154c`
  - ADR-0017 Production Discipline: CLOSED `444cf56`
  - ADR-0018 Deployment-Target Agnosticism Posture: CLOSED `657a794`
  - ADR-0019 Cryptographic-Suite Posture: CLOSED `7216784`
  - FIPS_DEPLOYMENT_POSTURE.md alignment to ADR-0019: CLOSED `38d941f`

**Substrate-discipline canonical reference quartet — framing
growth-drift acknowledgment.** ADR-0016 and ADR-0017 frame the
canonical references as a "pair." ADR-0018 frames as a "trio."
ADR-0019 frames as a "quartet." Each framing was correct as-of
writing — when ADR-0016 landed (`782154c`), ADR-0017 was the
only companion canonical reference; when ADR-0019 landed
(`7216784`), all four existed. The four ADRs operate coherently
as a quartet despite the asymmetric internal framing language
— no factual error occurs; each ADR's framing is true about
its time of writing. ADR-0016/0017/0018 are NOT retroactively
amended to use "quartet" because substrate-honesty principle
favors contemporaneous accuracy: the patent-holder
implementation record values truthful chronology over
retroactive uniformity. New ADRs joining the canonical
reference set will continue using the count appropriate to
their landing time — the next ADR after 0019 would frame as
the "fifth canonical reference" or "fifth leg of substrate-
discipline canonical references."

- Section 12.5 Sub-boxes 1-9 — queued after Track A

The live tracker is `docs/reference/section-12-progress.md`.
This section is a snapshot at commit time; the tracker is the
source of truth going forward.

## 7. Operating in This Repo

Practical guidance for an agent starting work:

- **Pre-flight grep before drafting** (RULE 12). Read cited
  files, verify cited config values, confirm cited paths
  before writing about them.
- **Cite ADRs by number, not by title.** "ADR-0006" is
  stable; the title may be amended.
- **Use the existing JSDoc WHAT/INPUT/OUTPUT/WHY pattern**
  for new code, transitioning to TSDoc for code added in
  Section 12C.0.5 onward (additive-only docs structure). See
  `docs/contributing/code-style.md` §Documentation Blocks.
- **Use the structured logger, never `console.*`** (RULE 16).
  See `docs/contributing/code-style.md` §Logging.
- **Run one test cycle at a time** (RULE 15). The 90-110
  minute reality is why concurrent runs are infeasible against
  the shared Supabase test schema.
- **Match the FILE / PURPOSE / CONNECTS TO header** on new
  modules (RULE 6). See `docs/contributing/code-style.md`
  §File Headers.
- **Use the service-owned auth gate pattern** for any new
  session-token-gated method: `${operation}ForCaller(token, …)`.
  Canonical example:
  `apps/api/src/services/compliance/compliance.service.ts:528`
  (`getComplianceStateForCaller`). See ADR-0004.
- **Compose filters AS AND with the existing org-scope
  predicate** for any new filter parameter on a query endpoint.
  Never replace the org-scope predicate; never broaden scope.
  See ADR-0006 and `tests/integration/admin-routes.test.ts`
  (DRIFT 9 anchor).
- **Pin external dependencies via the Pin-and-Optimize
  Framework** (ADR-0016). Every external dependency
  (runtime version, container image, package version, schema
  version, third-party SDK) gets pinned to a specific version
  with the dominant optimization axis documented per the
  five-question template. Decisions E + H of ADR-0015
  (postgres:16.4-alpine + Node 22.11.0) are the canonical
  worked examples.
- **Investigate drifts via the Production Discipline**
  (ADR-0017). The nine-step template applies to all substrate
  investigations: frame the drift, distinguish observation
  from inference, verify inferred premises empirically before
  fix design, reframe based on evidence, identify root causes
  end-to-end, design defense-in-depth fix scope, apply with
  three-approvals discipline, encode prevention (substrate
  test or pre-flight check), document the lineage. The G5b-I
  Resolution Gate is the canonical worked example.
- **Document deployment-target portability via the
  Deployment-Target Agnosticism Posture** (ADR-0018). The
  five-step decision template applies when a customer
  deployment-target requirement surfaces (sovereign cloud,
  on-premise, air-gapped, blockchain substrate): identify the
  category, verify Postgres-compatibility constraints, identify
  deployment-target-specific work (IaC, KMS, IDP, audit-trail
  crosswalk), verify the agnosticism still holds, document the
  deployment as a worked example. AWS GovCloud RDS for
  PostgreSQL is the queued canonical worked example for the
  sovereign-cloud category.
- **Document cryptographic-suite resilience via the
  Cryptographic-Suite Posture** (ADR-0019). The six-step
  decision template applies when a new cryptographic operation
  is needed (signature, hash, encryption, KDF, random, HMAC,
  key exchange): identify the operation, verify whether
  `CRYPTO_CONFIG` already covers it, if new primitive needed
  apply PQC-aware selection (FIPS 203/204/205 or hybrid), add
  to `CRYPTO_CONFIG` with anchor test, document re-evaluation
  triggers, document migration path for in-flight data. The
  current symmetric-only stack (HS256, SHA-256, AES-256-GCM,
  bcrypt) is the canonical worked example — post-quantum ready
  by primitive selection with zero Shor's-vulnerable crypto in
  production.
- **Use plain language at the authorization tier** (the
  strategy-tier prose discipline; ADR-0029 Optimization 3).
  Where Claude Code speaks to the operator about engineering
  decisions, state the substrate-state observation directly;
  drop the recursive register-canonical phrasing
  ("substrate-state-observation register canonical at the
  substrate-state register"). The engineering-tier pre-flight
  discipline (pre-flight reports, catch surfacings, commit
  bodies) stays full-fidelity — this addresses
  authorization-tier prose only. Behavioral constraint, not
  hook-enforced.

For commits, use the section-prefix convention observed in
`git log`:

```
[SECTION-XX-DESCRIPTOR] One-line subject (test count or item count)
```

See `docs/contributing/parallel-sessions.md` §Branch and
Commit Discipline.

## 8. Cross-Repo Awareness

The sibling `otzar-control-tower` repo (Vite + React frontend
for the Otzar product's Control Tower) shares an agent fleet
with this Foundation repo. The two repos have different
substrates (backend protocol layer vs. frontend product surface)
and different conventions (Foundation: WHAT/INPUT/OUTPUT/WHY +
TSDoc going forward; otzar-control-tower has its own JSDoc
patterns). Foundation extensions that frontend work depends on
follow the Cross-Repo Discipline pattern: Foundation work lands
FIRST as `[SECTION-XX-FOUNDATION]` commit with own tests; the
frontend consumes the new contract in a SECOND commit.

See `docs/contributing/codex-vs-claude-code.md` §Cross-Repo
Note for the operational pattern. Section 12B's foundation
extensions (`6151812`, `ca6e982`, `ee4dafb`) are the canonical
examples.

## 9. What Not to Do

Concrete anti-patterns observable across the build cycle:

- **Do not invent substrate.** Citing an ADR by number without
  reading it produces fabricated content. Read the ADR.
- **Do not skip pre-flight grep** (RULE 12). The discipline
  exists because skipping it produces silent drift between
  spec and substrate.
- **Do not run two test cycles concurrently** (RULE 15). The
  shared Supabase test schema cannot absorb fixture collision
  between concurrent runs.
- **Do not modify `.cursorrules` in this commit.** The
  pre-Section-12 file has known gaps (see
  `docs/contributing/cursor-bootstrap.md` §Substrate Drift)
  but a clean amendment is queued for a future commit, not
  this one.
- **Do not modify `.gitignore` for agent-state directories.**
  Section 12C.0.5 Phase 4 will specify any additions needed
  to support typedoc output and similar generated artifacts;
  the exact paths are pinned in Phase 4, not here. Agent-
  state patterns (`.claude/`, `.codex/`, `.cursor/`) are
  flagged for a separate future amendment outside Phase 4.
- **Do not assume the patent text — verify against
  US 12,517,919.** The Phase 1E Batch 3 COSMP correction
  (initial drafts said "Capsule Owned Sovereign Memory
  Protocol"; patent locks "Contextual Orchestration and
  Scoped Memory Protocol") is the canonical example of what
  goes wrong when patent text is paraphrased rather than
  cited.
- **Do not pkill running tests.** The 300s per-test timeout
  with 2 retries is intentional Supabase tail-latency
  absorption (ADR-0010). Pkilling is the disease, not the
  cure.
- **Do not write `console.*` calls in `apps/api/src`**
  (RULE 16). The anchor test catches this; preempt the test
  failure by using the structured logger from the start.
- **Do not delete rows in production code** (RULE 10). Use
  `deleted_at` timestamps. The audit chain has a BEFORE DELETE
  trigger that will fail the action.

## 10. Where to Read More

Four documentation roots cover the substrate of the project:

- **`docs/architecture/`** — ADR-0001 through ADR-0032 plus
  the template (`0000-template.md`) and the architecture
  README. Start with `docs/architecture/README.md`.
- **`docs/reference/`** — `glossary.md` (term definitions),
  `architectural-anchors.md` (the 8 runtime invariants),
  `section-12-progress.md` (live build tracker).
- **`docs/contributing/`** — `README.md` index plus
  `code-style.md`, `testing.md`, `parallel-sessions.md`,
  `codex-vs-claude-code.md`, `cursor-bootstrap.md`,
  `chatgpt-bootstrap.md`. Start with the README's reading
  order.
- **`AGENTS.md`** (Phase 3b in this same commit) — multi-LLM
  router defining Claude Code, Codex, Cursor, and ChatGPT
  authoritative scopes alongside this CLAUDE.md.

External substrate referenced by this repo:

- Patent US 12,517,919 (COSMP claims and 7-layer Memory
  Capsule conceptual structure)
- Patent US 12,164,537 + US 12,399,904 (DMW + Foundation
  primitives)
- COSMP specification (external; defines protocol-level
  semantics)

## 11. Maintenance

How `CLAUDE.md` gets updated:

- **Major changes** (new RULE, new section, replacement of an
  existing RULE) require an ADR. The ADR drafts the change,
  the same commit lands the ADR + the CLAUDE.md amendment
  with a back-citation to the ADR (RULE 14).
- **Minor amendments** (new pointer, clarification, cross-ref
  update) can land in any commit. The commit message should
  name the section being amended.
- **The 11 preserved RULES (0-10) are not reordered or
  removed without an ADR explicitly superseding them.** The
  numbering is stable for citation purposes across the
  project's history.
- **New RULES (12+) follow the same discipline.** Adding RULE
  17 requires the ADR + bidirectional-citation amendment.
- **Maintain pointer integrity.** When a referenced file is
  renamed or moved, update the pointers here in the same
  commit. Stale pointers are silent drift (RULE 13).

When this file conflicts with code: the code is what runs;
this file documents intent. If a conflict surfaces, the
resolution is an ADR documenting which one needs to change
and why.
