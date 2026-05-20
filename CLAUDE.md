# CLAUDE.md

Authoritative operational rules for Claude Code sessions in
`niov-foundation`. Read this entire file before every action.
The 11 preserved RULES (0-10) and RULES 12-21 -- added
incrementally since Section 12C.0.5 (12-16 in the 12C.0.5 batch;
17 from RAA 12.7; 18 from Gate 9; 19 from ADR-0020; 20 from
ADR-0027; 21 from ADR-0035 sub-arc 1 sub-phase b cluster
expansion 25th observation) -- define what every session in this
repo internalizes;
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
11 was vacant from Section 12C.0.5 until sub-phase 6c
`[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]` (2026-05-14) when it
was filled with the D-WIDER-KNOWLEDGE-CHECK substrate-build
discipline (Elixir/BEAM canonical-pattern research at pre-flight)
per ADR-0035 Founder-authorized creation. 21 RULES canonical
(0-21 with RULE 21 newly added per Founder authorization
2026-05-16 sub-arc 1 sub-phase b register substantively per
[OPS-RULE-21-PRE-AUTHORIZATION-RESEARCH-ARC-CANONICAL] commit
+ ADR-0035 sub-arc 1 sub-phase b cluster expansion 25th
observation register substantively).

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

### RULE 11 -- WIDER KNOWLEDGE CHECK FOR ELIXIR/BEAM SUBSTRATE

When working with Elixir or BEAM substrate and substrate-state
observations suggest architectural-register coupling, research
broader Elixir/BEAM community canonical patterns BEFORE
authorizing fixes at the local substrate.

**Trigger conditions:**

- Non-deterministic test failures across iteration attempts
- Supervised GenServer behavior across test boundaries
- ETS / Sandbox / DBConnection ownership questions
- Cross-test-cycle state contamination patterns
- Any substrate-state observation where local iteration on
  substrate-state observations isn't converging on substrate-
  coherence

**Required reading:** `docs/contributing/elixir-beam-best-practices.md`
(canonical Elixir/BEAM patterns + 6 canonical sources +
when-to-use checklist).

**Pre-flight integration:** surface canonical pattern findings
to operator-tier BEFORE authorizing substantive edits. Local
Sandbox / supervised-GenServer / ETS iteration without
community-canonical pattern check is substrate-build discipline
failure when observations point at architectural-register
coupling — research the architectural pattern first, then
authorize the fix at the substrate-coherent register.

**Substrate-build observation lineage:** D-WIDER-KNOWLEDGE-CHECK
observation surfaced at sub-phase 6 pre-flight when three Sandbox
pattern probes (`Sandbox.allow`, `Sandbox.mode {:shared, self()}`,
`start_owner!`/`stop_owner`) all worked in isolation but none
resolved full-suite cross-test-cycle cascade. Operator-tier
strategic call established the discipline; ADR-0034 documented
the canonical Elixir community testability pattern + the
D-WIDER-KNOWLEDGE-CHECK observation at substrate-build register;
ADR-0035 + RULE 11 canonical the discipline at the
operating-manual register for all future Elixir/BEAM substrate
work.

**Founder authorization per RULE 20:** explicit at this RULE's
substantive landing (2026-05-14; sub-phase 6c
`[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]` per ADR-0035).

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

### RULE 21 -- PRE-AUTHORIZATION RESEARCH ARC FOR SUBSTRATE-ARCHITECTURAL PASTES

Substrate-architectural authorization pastes touching external
libraries, new substrate patterns, cross-application boundaries,
cross-language boundaries, or wire-format changes substantively
require canonical research arc landed at canonical-knowledge
register BEFORE authorization fires at canonical-execution
register substantively. Distinct from RULE 11 (Elixir/BEAM
test-substrate iteration-loop research) at canonical-rule
register substantively: RULE 21 fires at PRE-AUTHORIZATION
register substantively (paste-authoring + initial pre-flight);
RULE 11 fires at ITERATION-LOOP register substantively (local
debugging stalls + non-deterministic test failures). Both rules
canonical at distinct triggers + distinct remediation paths.

**Trigger conditions:**

- External library version semantics (e.g., Horde 0.10 members
  config; Protocol Buffers proto3 backward-compat field-addition)
- Wire-format conventions across language boundaries (e.g.,
  protobuf field numbering; gRPC schema evolution)
- Cross-application umbrella dependencies (e.g., circular
  dependency rejection; callback behavior pattern selection)
- Cross-language strict-mode interactions (e.g., TypeScript
  exactOptionalPropertyTypes; Ecto cross-language schema dual
  ownership at ADR-0033 register)
- Substrate-state ground truth verification (column ownership;
  enum values; actual canonical paths vs assumed paths; actual
  canonical document structure vs assumed structure)

**Required discipline at paste-authoring register substantively:**

- Claude (paste-authoring register) does web-fetch + web-search
  on canonical authoritative source BEFORE drafting authorization
  paste body
- Evidence citations (URLs + canonical doc names + commit SHA
  where applicable) embedded in authorization paste body at
  canonical-prose register substantively
- Substrate-state ground truth grep on actual repo state
  canonical at pre-flight Step 1 register substantively BEFORE
  any writes fire at canonical-execution register
- Actual canonical document structure (sub-section headings,
  file paths, module names, function signatures) verified by
  grep BEFORE drafting paste references at canonical-prose
  register

**Substrate-build observation lineage:** 5 canonical recurrence
sites at sub-arc 1 sub-phase b register substantively (B.3 revert
register substantively + B.6.1 register substantively + B.6.2
register substantively + B.6.3 pre-flight register substantively
+ cross-cutting register substantively); promoted from forward-
queued substrate-build observation at commit-body-only register
substantively to canonical RULE per Option β substrate-honest
discipline; ADR-0035 sub-arc 1 sub-phase b cluster expansion
sub-section NEW at this RULE's substantive landing canonical at
substrate-architectural register substantively with 25th
observation entry.

**Substrate-honest cost-benefit:** research arc adds approximately
5-15 minutes per substrate-architectural paste at incremental cost
register substantively; prevents fix-forward cascade canonical at
canonical-execution register per D-FIX-FORWARD-PATTERN-LIMIT-AT-
N-EQUALS-2 forward-queued at B.3 revert register substantively.
Net substrate at canonical-coherence register substantively
positive at canonical-execution + canonical-knowledge + canonical-
state register.

**Founder authorization per RULE 20:** explicit at this RULE's
substantive landing (2026-05-16; sub-arc 1 sub-phase b register
substantively per `[OPS-RULE-21-PRE-AUTHORIZATION-RESEARCH-ARC-
CANONICAL]` per ADR-0035 sub-arc 1 sub-phase b cluster expansion
sub-section register substantively).

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
- `docs/architecture/decisions/` — the 37 ADRs with
  Decision / Consequences / Alternatives in Michael Nygard
  format

When a term, anchor, or decision is non-obvious in code or
documentation, **cite the reference**, do not redefine.

## 5. Key Architectural Decisions

The 37 ADRs as of [CAR-SUB-BOX-2-ADR] (sub-phase 1 of CAR
Sub-box 2 mini-arc per ADR-0037; 2026-05-15). The
`docs/architecture/README.md` is the source of truth for ADR
navigation; this is a quick-reference jump table.

- **ADR-0001** — Three-wallet architecture (foundational) — **Amendment 1** LANDED at G6.2 `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` 2026-05-19: preserves Personal DMW / digital twin claim verbatim + narrows to Personal AI Agent context + adds companion Enterprise AI Agent context per ADR-0046 dual-context routing model + RULE 14 bidirectional citation to ADR-0046
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
- **ADR-0013** — Containerized Postgres for unit and integration tiers (Track A Gate 1; `postgres:16.4-alpine` pin) (amended at G3.2 — image pin updated to `pgvector/pgvector:0.8.2-pg16-trixie` per ADR-0043 §Sub-decision 1 Q-G3-α LOCK)
- **ADR-0014** — FixtureBasedLLMProvider key-based dispatch (Track A Gate 3 ADR amendment; supersedes ADR-0012's hash-by-content dispatch)
- **ADR-0015** — CI Workflow Architecture (Track A Gate 7; 8 locked decisions A-H including postgres + Node pins) (Decision E amended at G3.2 — CI service containers use `pgvector/pgvector:0.8.2-pg16-trixie` per ADR-0043 §Sub-decision 1 Q-G3-α LOCK)
- **ADR-0016** — Pin-and-Optimize Framework (substrate-pinning canonical reference; companion to ADR-0017; five-question template) (new worked example at G3.2 — `pgvector/pgvector:0.8.2-pg16-trixie` image pin per ADR-0043 §Sub-decision 1 Q-G3-α LOCK + Q-G3.2-α LOCK)
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
- **ADR-0030** — Phase 2 Elixir/BEAM Implementation: Mix Umbrella + COSMP Router + DBGI Supervisor + Three-Language Stack Canonicalization (Phase-2-implementation register; the 19-sub-phase Block B mini-arc (expanded 13 → 14 at sub-phase 4a per Q-G split — see ADR-0031; 14 → 15 at sub-phase 5a per Q-P split — see ADR-0032; 15 → 16 at sub-phase 5b-i per Q-R split — see ADR-0033; 16 → 17 at sub-phase 5b-iii per Q-NEW-SPLIT split — see ADR-0033 §Forward path; 17 → 18 at sub-phase 6a per Q-NEW-SPLIT-2 split — see ADR-0034; 18 → 19 at sub-phase 6c per Q-NEW-SPLIT-3 split — see ADR-0035) that ships Elixir/BEAM substrate as production Foundation services — COSMP coordination layer (sub-phases 2-6: mix umbrella, OTP app, GenServer with the 6 BEAM patterns instantiated, gRPC interop, integration tests); DBGI supervisor (sub-phases 7-10: OTP app, `:pg`+`:gproc` process-group registry, libcluster multi-region topology, integration tests); operational substrate (sub-phases 11-13: telemetry observability, BEAM-coordination-canonical-record analog doc, arc-closure cascade); three-language stack canonicalization (TypeScript API + Elixir COSMP + Postgres storage; Python ML future); cites ADR-0028 load-bearing — the forward-queue source + the commitment-to-ship ADR-0030 fulfills; cites ADR-0026 load-bearing — the 6 BEAM-compatibility patterns canonical at §5 the Phase 2 substrate ports to production Elixir/BEAM; cites ADR-0020 + ADR-0025 prose-mention; [BEAM-PHASE-2-ADR] sub-phase 1 of the Block B Phase 2 mini-arc — the decision document; sub-phases 2-13 implement)
- **ADR-0031** — BEAM Routing Substrate Architecture (sub-phase 4a decision-substrate register; the Block B sub-phase 4a/4b split per Q-G — sub-phase 4a lands ADR-0031 documenting GenServer state shape + 7-op `handle_call` dispatch + `Capsule` placeholder (7 layers per US 12,517,919) + supervision tree integration + idempotency deferral to sub-phase 5/6 (Q-D) + load-bearing subset of ADR-0026 §5 BEAM patterns — **patterns 1 (message-passing), 2 (supervisor-friendly failures), 6 (pure transformation)** instantiated at sub-phase 4b; **patterns 3, 4, 5 forward-queued** to sub-phases 5/6 with their consumers; cites ADR-0030 load-bearing — this ADR is the sub-phase 4a decision substrate; cites ADR-0026 load-bearing — §5 patterns subset; cites ADR-0028 + ADR-0020 + ADR-0016 + ADR-0029 prose-mention; [BEAM-COSMP-GENSERVER-ADR] sub-phase 4a of Block B Phase 2 mini-arc — decision substrate; sub-phase 4b instantiates)
- **ADR-0032** — BEAM gRPC Interop Architecture (sub-phase 5a decision-substrate register for Block B; documents cross-language transport boundary between Fastify+TypeScript API and Elixir+BEAM routing layer — `:grpc` + `:protobuf` canonical Elixir libraries + `@grpc/grpc-js` + `@grpc/proto-loader` TypeScript libraries + sync unary call semantics for 7 patent-canonical COSMP ops per US 12,517,919 + Protobuf canonical encoding with patent-verbatim Capsule field numbers 1-7 matching layer ordering + auth boundary at Fastify (NOT gRPC layer) per RULE 20/ADR-0027 + error envelope `oneof` discipline informed by ADR-0026 §5 Pattern 2 + `.proto` versioning via package namespace evolution; cites ADR-0031 load-bearing — sub-phase 5b instantiates ADR-0032's decisions; cites ADR-0030 + ADR-0028 + ADR-0026 §5 + ADR-0027 + ADR-0020 + ADR-0016 prose-mention; [BEAM-COSMP-INTEROP-ADR] sub-phase 5a of Block B mini-arc — decision substrate; sub-phase 5b-i [BEAM-COSMP-INTEROP-GRPC] instantiates)
- **ADR-0033** — BEAM Persistence + Idempotency + Audit-Chain Cryptographic Substrate Architecture (sub-phase 5b-ii decision-substrate register for Block B; documents the persistence + idempotency + audit-chain triple-paired substrate at the Elixir register — `:ecto_sql` + `:postgrex` canonical Elixir Postgres stack per Q-PERSISTENCE-DEPS + local containerized Postgres at `localhost:5433/foundation_test` for tests per D-5BII-EXEC-1 Option β + Supabase pooler with `prepare: :unnamed` for prod/dev + two-tier Elixir naming (`CosmpRouter.Capsule` runtime 7-layer per US 12,517,919 + `CosmpRouter.MemoryCapsule` Ecto persistence 30-field mirror of Prisma's `MemoryCapsule` per Q-CAPSULE-NAME Fork β Refined) + `CosmpRouter.Capsule.Translator` pure pack/unpack projection per ADR-0026 §5 Pattern 6 + byte-equivalent `canonical_record/1` + `canonical_json/1` + `sha256_hex/1` audit primitive (TS↔Elixir SHA-256 hash chain interchange verified by 10 fixture pairs at every CI run) + `DateTime.truncate(:millisecond)` load-bearing for byte-equivalence per D-5BII-EXEC-2 + `SYSTEM_PRINCIPALS.COSMP_ROUTER` 5th principal extension at TS register (D-5BII-EXEC-3) + dual-mode `write_audit_event/1` standalone + `write_audit_event/3` composed Ecto.Multi (composed-mode default for COSMP WRITE/SHARE/REVOKE per RULE 4 + ADR-0026 §5 Pattern 4 compound) + Storage facade (ETS hot-tier preserved per ADR-0031 Q-T + Postgres source-of-truth per ADR-0033 §5; ETS-first read with Postgres fallthrough; Postgres write authoritative) + Ecto-owned `idempotency_keys` table per D-5BII-EXEC-5 hybrid Option β (Prisma owns shared-table DDL per ADR-0025; Ecto owns Elixir-internal DDL — first instantiation at sub-phase 5b-iii Commit A migration `priv/repo/migrations/20260514040407_create_idempotency_keys.exs`) + Pattern 4 + Pattern 5 idempotent verification keys compound + BEFORE DELETE trigger ownership at TS register per D-5BII-EXEC-6 + `System.get_env("DATABASE_URL")` at `config/runtime.exs` per D-5BII-EXEC-7 (no `:dotenvy` Hex dep); cites ADR-0002 load-bearing — TS audit-chain canonical ported byte-equivalent at Elixir register; cites ADR-0011 + ADR-0013 + ADR-0015 — containerized Postgres test register; cites ADR-0025 — Schema-Push-Target Discipline migration ownership boundary; cites ADR-0026 §5 — 6 BEAM patterns; cites ADR-0028 — forward-queue source; cites ADR-0030 — Phase 2 implementation register; cites ADR-0031 Q-D — idempotency-strategy forward-queue resolved here; cites ADR-0032 — sub-phase 5b decision substrate split per Q-R; D-CI-FRESH-1+2+3+IDEMPOTENCY-3 substrate-build canonical lessons cluster operational at cross-environment register; sub-phases 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] (substrate) + 5b-iii Commit A [BEAM-COSMP-INTEROP-INTEGRATION-IDEMPOTENCY] (Pattern 4/5 substrate) + 5b-iii Commit B [BEAM-COSMP-INTEROP-INTEGRATION-ROUTER] (Router 7-op composed-mode integration consuming the substrate at patent-canonical 7-op surface) collectively land the ADR-0033 substrate; comprehensive end-to-end Router DB-touching tests forward-queued to sub-phase 6 [BEAM-COSMP-INTEGRATION-TESTS] per D-5BIII-COMMITB-1+2+3 substrate-build observations)
- **ADR-0034** — BEAM COSMP Testability Refactor Pattern (sub-phase 6a substrate-build register for Block B; documents the canonical Elixir community testability pattern + **D-WIDER-KNOWLEDGE-CHECK** substrate-build discipline NEW — substrate-build discipline at Elixir/BEAM register includes broader community pattern research before authorizing fixes when substrate-state observations suggest architectural-register coupling; Sub-decision 1 explicit `name` first arg per KV.Registry canonical at `CosmpRouter.Storage.ETS` public functions (`put/3`, `get/2`, `delete/2`, `list/1`, `clear/1`); Sub-decision 2 Router state holds `storage_ets` reference + Storage facade `:ets` opt threading via `get/2`, `put/3`, `delete/2`, `clear/1`; Sub-decision 3 GRPC.Server hardcoded `CosmpRouter.Router` reference deferred to 6b via `Sandbox.allow` canonical Ecto pattern for app-supervised GenServer case (per-test register) + Sub-decision 3-amendment (post-sub-phase-6b Phase 3 Step 3-e) discriminates per-test `Sandbox.allow` canonical vs sequential-multi-test `start_owner!`/`stop_owner` canonical Ecto v3 pattern at canonical-pattern register; Sub-decision 4 ETS table name = GenServer name (same atom; KV.Registry canonical — Elixir process registry + ETS registry are distinct namespaces); Sub-decision 5 NEW ADR at substrate-build register; production singleton supervision tree unchanged via default `:name = __MODULE__` opt fallback; per-test instances via `CosmpRouter.RouterTestHelpers.start_router!/1` + `start_sandbox_owner!/0` (NEW `apps/cosmp_router/test/support/router_test_helpers.ex`; `mix.exs` `elixirc_paths(:test)` MOD); wider-knowledge sources canonical at the ADR — Ecto.Adapters.SQL.Sandbox docs (`start_owner!`/`stop_owner`), Sean Lewis "Elixir Concurrent Testing Architecture", DockYard "Understanding Test Concurrency in Elixir", KV.Registry Mix-OTP tutorial, Thoughtbot dynamic-names article, Elixir Forum supervised-GenServer testing threads; substrate-build cluster expanded to 8 canonical observations (D-CI-FRESH-1/2/3 + D-IDEMPOTENCY-3 + D-5BIII-COMMITB-1/2/3-REFINED + D-SUBSTRATE-LANDING-PREEMPT + D-AUDIT-OUTCOME-ENUM + D-ABORT-CONDITION-PRECISION + D-WIDER-KNOWLEDGE-CHECK NEW); cites ADR-0031 + ADR-0033 + ADR-0026 §5 + ADR-0030 + ADR-0020 + RULE 20 (Founder authorization explicit at this ADR's creation) + RULE 13 (pre-flight surface preceded authorization); sub-phase 6a of Block B mini-arc — substrate landed at `[BEAM-COSMP-TESTABILITY-REFACTOR]`; sub-phase 6b `[BEAM-COSMP-INTEGRATION-TESTS]` consumes substrate; sub-phases 7-13 DBGI substrate port testability discipline pattern; Block B count 17 → 18 at sub-phase 6a per Q-NEW-SPLIT-2 + 18 → 19 at sub-phase 6c per Q-NEW-SPLIT-3 — see ADR-0035; cumulative-lineage cascade at 6c closure)
- **ADR-0035** — Substrate-Build Discipline Canonical (sub-phase 6c substrate-build register for Block B; canonicalizes 9 substrate-build discipline observations across Block B mini-arc sub-phases 5b-ii through 6c — D-CI-FRESH-1/2/3 (CI services fresh-per-job; mirror canonical workflow VERBATIM) + D-IDEMPOTENCY-3 (substrate-landing commit includes its CI register MOD) + D-5BIII-COMMITB-1/2/3-REFINED (Sandbox + supervised-GenServer fragility resolved at architectural register, not Sandbox API register) + D-SUBSTRATE-LANDING-PREEMPT (substantive substrate-landing commits absorb forward-reference markers naturally) + D-AUDIT-OUTCOME-ENUM (integration-test-tier catches substrate-coherence bugs unit-tier excluded missed) + D-ABORT-CONDITION-PRECISION (abort conditions need substrate-state ground truth precision) + D-WIDER-KNOWLEDGE-CHECK (Elixir/BEAM broader community pattern research before authorizing fixes when substrate-state observations suggest architectural coupling — substrate-binding at RULE 11) + **D-CASCADE-SCOPE-PRECISION NEW** (pre-flight grep surfaces actual cumulative-lineage cascade scope; operator-tier estimates are starting points, not ground truth — surfaced when 6c pre-flight found ~20 sites vs operator's ~12-18 estimate); Sub-decision 1 RULE 11 fills vacant rule slot with D-WIDER-KNOWLEDGE-CHECK discipline at operating-manual register; Sub-decision 2 ADR-0035 catalogs the 9 observations with sub-phase + commit lineage; Sub-decision 3 `docs/contributing/elixir-beam-best-practices.md` (NEW) curated reference for new team members + their AI tools (6 canonical Elixir/BEAM sources + pattern catalog + when-to-use checklist); Sub-decision 4 onboarding cascade — `docs/contributing/onboarding-for-engineers.md` §1 (pre-flight discipline integration: RULE 11 / 12 / 13 / 18) + §2 (20 RULES + 35 ADRs canonical; RULE 11 substantively filled at 6c) + §6 (recommended reading: elixir-beam-best-practices.md as required reading); Sub-decision 5 ADR-0035 sits at substrate-build register alongside ADR-0027 + ADR-0029 — three registers, one discipline (ADR-0034 architectural; ADR-0035 substrate-build; RULE 11 operating-manual); cites ADR-0027 + ADR-0029 (substrate-build register precedents) + ADR-0034 (D-WIDER-KNOWLEDGE-CHECK origin + canonical Elixir testability pattern) + ADR-0030 (Block B mini-arc context) + ADR-0031 + ADR-0033 + RULE 11 + RULE 13 + RULE 20 (Founder authorization explicit at this ADR's creation); sub-phase 6c of Block B mini-arc — substrate landed at `[BEAM-WIDER-KNOWLEDGE-CHECK-DISCIPLINE]`; Block B count 18 → 19 per Q-NEW-SPLIT-3; cumulative-lineage cascade 17 → 19 absorbed at this commit per D-CASCADE-SCOPE-PRECISION + D-SUBSTRATE-LANDING-PREEMPT — ~20 sites rotated; sub-phases 7-13 DBGI substrate inherit canonical discipline from session-start; **cluster expanded 9 → 17 at sub-phase 6b commit `7ef95a2` + 17 → 23 at ADR amendment commit [post-d9a6766] per Option β substrate-honest discipline (5 NEW observations 18-22: D-AMENDMENT-FORWARD-QUEUE-CLOSURE-CASCADE + D-PRE-COMMITTED-ADR-CANONICAL-VERIFICATION + D-GIT-STATUS-SHORT-UNTRACKED-DIR-COLLAPSE + D-PHASE-8-PG-VS-GPROC-DISCRIMINATION + D-STRATEGIC-TIER-TEMPORAL-ESTIMATE-OVER-PROJECTION; 23rd D-CLUSTER-NUMBERING-DRIFT documents pre-existing L94/L118 duplicate "10." numbering preserved at substrate-state ground truth per Option β; D-OBSERVATION-CLUSTER-SUBSTRATE-ARCHITECTURAL-BOUNDARY 24th candidate recursively forward-queued); ADR-0030 §DBGI sub-phase 8 amendment LANDED at same commit per D-PHASE-8-PG-VS-GPROC-DISCRIMINATION 21st canonical**)
- **ADR-0036** — REGULATOR Principal + Lawful-Basis Attestation Pattern (CAR Sub-box 3 register; the patent-implementation evidence substrate for CAR §2.1 REGULATOR Entity Type + §2.2 Lawful-Basis Attestation per Family 1 — extends US 12,164,537 (COSMP) + US 12,399,904 (DMW) into regulatory-access territory; 8 sub-decisions all RESOLVED across the 7-sub-phase Sub-box 3 mini-arc — Sub-decision 1 REGULATOR EntityType distinct from GOVERNMENT (CAR §2.1 correctness-hazard guard); Sub-decision 2 3 regulator-specific TAR fields (regulator_jurisdiction + regulator_authority_scope + regulator_credentialed_by); Sub-decision 3 LawfulBasis Prisma model + LawfulBasisType enum (6 values: SUBPOENA + REGULATORY_AUTHORITY + COURT_ORDER + DPA_REQUEST + MLAT_REQUEST + CONSENT_OF_DATA_SUBJECT); Sub-decision 4 3 AuditEvent event_type literals (REGULATOR_ACCESS_GRANTED + REGULATOR_ACCESS_REVOKED + REGULATOR_ACCESS_EXPIRED-reserved); Sub-decision 5 hybrid lawful-basis cryptographic binding via canonical_record/1 12 → 14 fields at TS + Elixir registers (positions 13 + 14 = lawful_basis_id + lawful_basis_chain_hash); Sub-decision 6 dual-control binding for regulator-grant routes per ADR-0026; Sub-decision 7 REGULATOR authentication credentialing pattern (presence-check at sub-phase 6; National PKI + EU eIDAS forward-queued); Sub-decision 8 SYSTEM_PRINCIPAL extension RESOLVED at sub-phase 5 commit body — NO new principal added; SYSTEM_PRINCIPALS frozen-anchor count remains 5; future REGULATOR_ACCESS_EXPIRED uses existing SCHEDULER if implemented; cites ADR-0019 (cryptographic-suite posture) + ADR-0020 (Register-2 patent-implementation evidence) + ADR-0026 (dual-control middleware pattern) + ADR-0033 (audit-chain byte-equivalence; canonical_record/1 12 → 14 extension); Status: Accepted at sub-phase 7 [SUB-BOX-3-CLOSURE] commit; 7-sub-phase mini-arc lineage `4981d3a → db6e0d7 → d0b5c64 → f9d0694 → 71af2c6 → d6f9e18 → this commit`)
- **ADR-0037** — Jurisdiction Tagging Architecture for Entity / MemoryCapsule / AuditEvent / OrgSettings (CAR Sub-box 2 register; the data-tier jurisdiction-tagging substrate for CAR §1.6 Regional / Sovereignty Boundaries + §2.4 Jurisdictional Scope; 9 sub-decisions to land across the 6-sub-phase CAR Sub-box 2 mini-arc — Sub-decision 1 single-String jurisdiction representation per Q-NEW-1 LOCKED Option α (matches LawfulBasis.jurisdiction_invoked precedent; multi-jurisdiction is REGULATOR-tier-only at TAR.regulator_jurisdiction[]); Sub-decision 2 4 jurisdiction columns at Entity + MemoryCapsule + AuditEvent + OrgSettings; Sub-decision 3 AuditEvent.jurisdiction is row-metadata-only per Q-NEW-3 LOCKED Option β (NOT extending canonical_record/1; preserves Sub-box 3 sub-phase 4 14-field byte-equivalence + 12 fixture pairs + cosmp_router default tier 137/0 unchanged); Sub-decision 4 MemoryCapsule.jurisdiction immutable after creation per Q-NEW-4 LOCKED Option α (cross-region transfer is forward-queued explicit workflow); Sub-decision 5 service-tier defaulting cascade at createEntity + createCapsule + writeAuditEvent helpers per Q-NEW-6 LOCKED Option α (Prisma cannot do cross-row defaults); Sub-decision 6 NEW assertJurisdictionalScope pure-function helper at apps/api/src/services/cosmp/jurisdiction-enforcement.ts per Q-NEW-2 LOCKED Option α (mirrors sub-phase 6 of Sub-box 3 regulator-enforcement.ts pattern; 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction); Sub-decision 7 COSMP enforcement at NEGOTIATE start-check + readContent TOCTOU re-check + SHARE start-check + REVOKE start-check + WRITE create-time defaulting + WRITE update-time immutability enforcement; Sub-decision 8 REGULATOR integration LawfulBasis.jurisdiction_invoked === MemoryCapsule.jurisdiction match per Q-NEW-5 LOCKED Option α (augments — does NOT replace — TAR.regulator_jurisdiction check from Sub-box 3); Sub-decision 9 enables downstream CAR Sub-boxes 4 (DecisionRecord + DataSubjectReference + Agent Attestation) + 5 (jurisdiction-aware deletion variants) + 8 (Cross-Tenant Compliance Benchmarking; meta-jurisdiction aggregates) + 9 (Capsule Compliance Provenance); cites ADR-0036 §Substrate-Honest Distinctions (closes the previously preserved QUEUED reference) + ADR-0026 §5 (BEAM-compatibility patterns inheritance) + GDPR Articles 44-50 + Schrems II + FedRAMP boundary + CMMC SC.L2-3.13 (legal/security context citations only; no compliance certification claim); patent relevance: NONE directly per CAR §1.6 verbatim ("region tagging is conventional") — NO Patent-Implementation Evidence section; NO ADR-0020 cite; NO ADR-0019 cite; NO ADR-0033 cite; ADR-0035 §9 NO promotion per Q-NEW-9 LOCKED Option α; Status: Accepted at sub-phase 6 [CAR-SUB-BOX-2-CLOSURE] commit; 6-sub-phase mini-arc lineage `c72fabd → 93f96ec → 3fab20d → 6efdf44 → 7faf2ac → this commit`)
- **ADR-0038** — DMW Worker per-DMW Supervised Process (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 1 sub-phase a register; canonicalizes the DMWWorker GenServer module at `apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex` that uses the BEAM scaffolding LANDED at sub-phases 8-11; 8 sub-decisions all locked at α-default per Q-A through Q-G — Sub-decision 1 module location at apps/dbgi_supervisor/lib/dbgi_supervisor/dmw_worker.ex; Sub-decision 2 identity addressing by entity_id via `{:via, Registry, {DbgiSupervisor.Registry, entity_id}}` Registry key + `"dmw:#{entity_id}"` Phoenix.Tracker topic; Sub-decision 3 tier dispatch axis on WalletType 3-tier (PERSONAL + ENTERPRISE + DEVICE); Sub-decision 4 lifecycle pattern lazy-spawn on first COSMP operation against the wallet's entity_id; Sub-decision 5 state stateless plus Phoenix.Tracker presence only at sub-phase a; Sub-decision 6 DMWWorker vs cosmp_router relationship separate-layer (cosmp_router stays as-is at sub-phase a; re-wire forward-substrate to sub-arc 1 sub-phase b and beyond); Sub-decision 7 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction; Sub-decision 8 testability per ADR-0034 (name-configurable + start_supervised! patterns; tests exercise spawn via DynamicSupervisor + Registry lookup + Phoenix.Tracker presence on init + presence absence on terminate + tier-differentiated behavior + parallel DMWWorkers for distinct entity_ids + stop-then-restart resilience); cites ADR-0026 §5 (BEAM-compatibility patterns) + ADR-0028 §3 (BEAM Coordination Layer) + ADR-0028 §Forward Queue (per-capsule supervised Elixir process forward-substrate item this ADR substantively closes at per-DMW granularity per the NEW append-only LANDED sub-paragraph at ADR-0028 §Forward Queue lines 162-173 register substantively) + ADR-0034 (BEAM testability discipline); hybrid hot/cold framing canonical at substantive register (ENTERPRISE always-hot + PERSONAL/AI_AGENT promote-on-activity from cold shard substrate + DEVICE always-cold shard-mapped); ADR-0035 §9 NO promotion per Q-C LOCKED Option α (D-ADR-AMENDMENT-PATTERN-VARIANCE-DISCIPLINE forward-queued at commit-body-only register); Status: Accepted 2026-05-15 at sub-arc 1 sub-phase a `[BEAM-DBGI-DMWWORKER-CLOSURE]` commit; 3-commit mini-arc lineage `3b431bf` → `56e0eaa` → this commit)
- **ADR-0039** — Hive-Scale Per-DMW Dispatch Substrate for ENTERPRISE Wallets (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 1 sub-phase b register; canonicalizes the hive-scale per-DMW dispatch substrate that delivers per-DMW parallelism at hive scale at runtime for ENTERPRISE wallets per ADR-0038 DMWWorker substrate canonical at sub-phase a runtime register; 13 sub-decisions all locked at α-default per Q-A through Q-G at canonical-knowledge register substantively informed by 5 rounds of research at canonical Elixir/BEAM register — Sub-decision 1 per-DMW GenServer via Horde Registry + Horde DynamicSupervisor (Discord per-entity GenServer precedent at canonical-knowledge register at millions-of-entities scale; CRDT-based distributed Registry + handoff on node failure); Sub-decision 2 cosmp_router pure-module refactor at single-source-of-truth register (NEW `CosmpRouter.Operations` module at `apps/cosmp_router/lib/cosmp_router/operations.ex` with 7 pure-module primitives extracted from `CosmpRouter.Router`; Elixir anti-pattern resolution at canonical Elixir hexdocs register substantively; `CosmpRouter.Router` GenServer stays at backward-compat register substantively as legacy passthrough wrapper invoking pure-module primitives at module-level register; 137-test cosmp_router baseline preserved by construction); Sub-decision 3 DMWWorker COSMP op handlers invoking `CosmpRouter.Operations` primitives at module-level register (single-source-of-truth preserved; per-DMW parallelism delivers because each ENTERPRISE entity_id's DMWWorker has its own GenServer mailbox); Sub-decision 4 NEW `CosmpRouter.WalletLookup` module at `apps/cosmp_router/lib/cosmp_router/wallet_lookup.ex` (per-request indexed point-lookup pattern inherited from ADR-0036 REGULATOR per-request indexed point-lookup discipline; no caching at sub-phase b; Sub-decision 5 ETS substrate delivers caching); Sub-decision 5 NEW ETS read-optimized cache at `apps/cosmp_router/lib/cosmp_router/wallet_cache.ex` (`:set + :public + :named_table + read_concurrency: true + write_concurrency: true + decentralized_counters: true`; cache hit returns wallet_type at ETS read register without GenServer mailbox bottleneck; cache miss delegates to `CosmpRouter.WalletLookup`); Sub-decision 6 COSMP protobuf envelope extension with optional entity_id field across 7 op request messages at `apps/cosmp_router/proto/cosmp.proto` + MOD `apps/api/src/services/cosmp-client.ts` (backward-compat fallback to `CosmpRouter.Router` single-GenServer dispatch when entity_id absent; preserves 137-test cosmp_router baseline without requiring test envelope updates); Sub-decision 7 tier-routed dispatch shim at `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` (ENTERPRISE through DMWWorker via `{:via, Horde.Registry, {DbgiSupervisor.HordeRegistry, entity_id}}`; PERSONAL/AI_AGENT/DEVICE through `CosmpRouter.Router` unchanged delegating to `CosmpRouter.Operations` primitives); Sub-decision 8 ENTERPRISE-only scope at sub-phase b register (PERSONAL/AI_AGENT promote-on-activity substrate forward-substrate to sub-phase c; DEVICE always-cold shard-mapped substrate forward-substrate to sub-phase d and beyond); Sub-decision 9 7-commit mini-arc decomposition (B.1 `[BEAM-DBGI-HIVE-DISPATCH-ADR]` docs-only ADR + B.2 `[BEAM-COSMP-OPERATIONS-PURE-MODULE]` substantive Operations module + Router delegation + B.3 `[BEAM-DBGI-HORDE-SUBSTRATE]` substantive Horde Registry + Horde DynamicSupervisor children + Horde dependency + public API + B.4 `[BEAM-DBGI-WALLET-LOOKUP-CODE]` substantive WalletLookup module + B.5 `[BEAM-DBGI-WALLET-CACHE-ETS]` substantive WalletCache ETS substrate + B.6 `[BEAM-DBGI-HIVE-DISPATCH-INTEGRATION]` substantive protobuf envelope + cosmp-client.ts + DMWWorker COSMP handlers + grpc/server.ex tier-routed dispatch shim + integration tests + B.7 `[BEAM-DBGI-HIVE-DISPATCH-CLOSURE]` docs-only closure cascade); Sub-decision 10 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction (CosmpRouter.Operations pure-module primitives are stateless functions at canonical BEAM register; DMWWorker COSMP op handlers invoke primitives at module-level register at single-source-of-truth register; Horde substrate preserves BEAM-compatibility at canonical-coherence register); Sub-decision 11 Elixir anti-pattern compliance at canonical-knowledge register (cosmp_router pure-module refactor resolves GenServer-wrapping-stateless-logic anti-pattern at canonical Elixir hexdocs register substantively); Sub-decision 12 testability per ADR-0034 (Operations unit tests + Horde substrate unit tests + WalletLookup unit tests + WalletCache unit tests + tier-routed dispatch integration tests exercising ENTERPRISE-through-DMWWorker + non-ENTERPRISE-through-cosmp_router + missing entity_id fallback + parallel ENTERPRISE DMWWorkers without serialization); Sub-decision 13 patent-implementation evidence at canonical decision register substantively (Discord per-entity GenServer + Horde + ETS + cosmp_router pure-module refactor combination delivers patent at hive scale; substantively distinguishes NIOV substrate from any unauthorized parallel build at "blockchain-only" claim register); cites ADR-0026 §5 (BEAM-compatibility patterns) + ADR-0028 §3 (BEAM Coordination Layer) + ADR-0028 §Forward Queue (per-capsule supervised Elixir process forward-substrate item this ADR substantively progresses at ENTERPRISE tier hive-scale COSMP execution per the NEW append-only LANDED sub-paragraph at ADR-0028 §Forward Queue register substantively) + ADR-0034 (BEAM testability discipline) + ADR-0036 (REGULATOR per-request indexed point-lookup pattern inherited at WalletLookup) + ADR-0038 (DMW Worker per-DMW Supervised Process; DMWWorker substrate canonical at sub-phase a runtime register that this ADR's hive-scale dispatch substrate consumes); hybrid hot/cold framing canonical at substantive register (ENTERPRISE always-hot per-DMW supervised process now executes COSMP ops at hive scale via DMWWorker handlers invoking CosmpRouter.Operations primitives + PERSONAL/AI_AGENT promote-on-activity from cold shard substrate forward-substrate to sub-phase c + DEVICE always-cold shard-mapped substrate forward-substrate to sub-phase d); Phoenix.PubSub hive fanout substrate + Broadway pipeline at high-throughput register + hive algorithm at weighting architecture per Entry #28 substantively forward-substrate at sub-phase c + sub-phase d + sub-arc 2 register substantively; ADR-0035 §9 NO promotion (D-OPERATOR-CHALLENGE-CHALLENGE-RESEARCH-PRE-LOCK-DISCIPLINE + D-WIDER-KNOWLEDGE-CHECK-PRE-ADR-AUTHORIZATION-DISCIPLINE NEW canonical at this commit forward-queued at commit-body-only register); Status: Accepted 2026-05-17 at sub-arc 1 sub-phase b `[BEAM-DBGI-HIVE-DISPATCH-CLOSURE]` Commit 7 of 7 (10 substantive commits + 1 revert + 1 redraft + 1 RULE 21 promotion mid-arc canonical at patent-implementation evidence register; ADR-0039 §Post-Closure Implementation Lineage canonical at substrate-architectural register substantively) + **Amendment 1** LANDED 2026-05-17 at sub-arc 1 sub-phase c `[BEAM-DBGI-PROMOTE-ON-ACTIVITY-ADR-AMENDMENT]` Commit 4 of 5 (PERSONAL-promoted scope widening per §Sub-decision 8 amendment register substantively; ENTERPRISE tier ALWAYS dispatches through per-DMW substrate canonical at canonical-execution register substantively + PERSONAL tier conditionally dispatches through per-DMW substrate when ActivityCounter threshold crossed canonical at canonical-coherence register substantively (default 5 activities canonical at canonical-state register substantively; idle eviction releases DMWWorker resources when entity inactivity exceeds configured idle TTL — default 5 minutes canonical) + DEVICE tier ALWAYS Router fallback canonical at backward-compat register substantively; AI_AGENT disposition forward-substrate at sub-arc 2 capsule layer canonical at canonical-coherence register substantively per D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation register substantively (AI_AGENT canonical at EntityType register substantively per ADR-0033 cross-language data ownership register substantively NOT WalletType register substantively); implementation lineage canonical at patent-implementation evidence register substantively per ADR-0020 two-register IP discipline canonical: C.1 d09b80b ActivityCounter ETS substrate + C.2 1dd1d64 stop_dmw_worker_horde/2 + idle eviction periodic task + C.3 18300c3 PERSONAL promote-on-activity dispatch + dispatch_with_promote_check/4 + dispatch_promoted/4 helpers at grpc/server.ex; H2 Amendment 1 subsection per ADR-0011 canonical convention canonical at canonical-prose register substantively preserves Accepted §Sub-decision 8 body audit trail canonical at canonical-honest register substantively per ADR-0020 two-register IP discipline canonical; ADR-0035 cluster expansion 26th + 27th observations promoted at sub-arc 1 sub-phase c C.5 `[BEAM-DBGI-PROMOTE-ON-ACTIVITY-CLOSURE]` register substantively — 26th D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT recurrence-3 + 27th D-PASTE-AUTHORING-FAILED-TO-GREP-CANONICAL-STATE-BEFORE-PREMISE-LOCK recurrence-6) + **Amendment 2** LANDED at G6.2 `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` 2026-05-19: substrate-honest correction at L106-108 + L250-253 + §Sub-decision 1 + §Amendment 1 prose; documents dual-context AI_AGENT dispatch path per ADR-0046 (Personal AI Agent twin → PERSONAL wallet → personal/promote-on-activity dispatch shim; Enterprise AI Agent → ENTERPRISE wallet → DMWWorker hot dispatch); wallet_type column is canonical BEAM dispatch signal; prior substrate-build observations + research arc + Horde + cosmp_router pure-module decisions preserved verbatim; RULE 14 bidirectional citation to ADR-0046; closes D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation register substantively

- **ADR-0040** — DEVICE Cold-Shard Substrate (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 1 sub-phase d register; canonicalizes Jump Consistent Hash (Lamping-Veach 2014) at pure stateless module register substantively for K=128-1024 consistent-hash dispatch routing per ADR-0038 §Sub-decision 3 + §Forward Queue line 249 register substantively; 11 sub-decisions all locked at α-default per Founder Q-A through Q-F LOCKS at `[BEAM-DBGI-DEVICE-COLDSHARD-QLOCK]` register substantively — Sub-decision 1 Jump Consistent Hash algorithm (canonical Lamping-Veach semantics: 64-bit unsigned LCG `key = key * 2862933555777941757 + 1` + return `b` last assigned bucket NOT `j` overshot value + `import Bitwise` required for `<<<` + `>>>` operators canonical at canonical-execution register substantively); Sub-decision 2 pure stateless module + config (no GenServer; no supervised child; no ETS hot path; resolves GenServer-wrapping-stateless-logic anti-pattern per Elixir hexdocs canonical + ADR-0039 §Sub-decision 11 precedent; avoids D-SUPERVISION-TREE-EXPANSION-TEST-COHERENCE-DRIFT recurrence-4 per ADR-0035 26th observation discipline); Sub-decision 3 module name `CosmpRouter.DeviceShard` at `apps/cosmp_router/lib/cosmp_router/device_shard.ex` (Founder Q-F OVERRIDE of D.0 report `CosmpRouter.DeviceShardManager` recommendation — "Manager" suffix implies process/state ownership canonical at semantic register substantively; pure stateless substrate per Q-B LOCKED warrants "DeviceShard" without suffix; mirrors `CosmpRouter.WalletLookup` + `CosmpRouter.Operations` pure-module naming family); Sub-decision 4 K default 256 / range [128, 1024] per ADR-0038 §Forward Queue line 249 / config at umbrella `config/config.exs` (`config :cosmp_router, CosmpRouter.DeviceShard, shard_count: 256`) / fail-fast validation on K outside range; Sub-decision 5 dispatch integration at `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` adds explicit `{:ok, :device}` branch BEFORE `_other_tier` catch-all + NEW `dispatch_device_shard/3` private helper (forward-substrate to D.3); DEVICE cold semantics preserved (NO DMWWorker spawn for DEVICE; pure dispatch routing through shard-id-augmented Router fallback per Founder Q-B substrate disposition); Sub-decision 6 AI_AGENT remains canonical at PERSONAL branch register substantively per ADR-0039 L251-255 + D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation register substantively (AI_AGENT is EntityType NOT WalletType; maps to PERSONAL wallet_type at INSERT register per TS-side `defaultWalletTypeFor/1`; AI_AGENT MUST NOT be pulled into DEVICE lane; forward-substrate AI_AGENT EntityType-discriminated capsule routing at sub-arc 2 capsule layer); Sub-decision 7 4-commit mini-arc decomposition (D.1 `[BEAM-DBGI-DEVICE-COLDSHARD-ADR]` docs-only ADR-0040 NEW + D.0 research arc embedded + section-12-progress sub-phase d row IN FLIGHT + architecture/README + CLAUDE.md catalog refresh — **D.1 LOCKS architectural substrate; does NOT close ADR-0038 §Forward Queue item**; D.2 `[BEAM-DBGI-DEVICE-SHARD-MODULE]` substantive code NEW `CosmpRouter.DeviceShard` pure module + Jump Hash implementation + `import Bitwise` + `assign_shard/2` + `valid_shard_count?/1` guard + NEW unit tests + umbrella `config/config.exs` `shard_count: 256` default — **D.2 implements substrate; does NOT close Forward Queue item**; D.3 `[BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]` substantive code MOD `grpc/server.ex` explicit `:device` branch + `dispatch_device_shard/3` + NEW integration tests — **D.3 wires dispatch; does NOT close Forward Queue item**; D.4 `[BEAM-DBGI-DEVICE-COLDSHARD-CLOSURE]` docs-only closure cascade ADR-0040 Status: Proposed → Accepted + Post-Closure Implementation Lineage + section-12-progress sub-phase d row CLOSED + CURRENT_BUILD_STATE NEW H2 sub-phase d closure section + ADR-0038/0039 catalog refresh + ADR-0035 cluster expansion observations if surfaced — **D.4 CLOSES ADR-0038 §Forward Queue K=128-1024 DEVICE cold-shard item at canonical-state register substantively at sub-phase d closure register substantively**); Sub-decision 8 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction (Pattern 6 pure transformation is CORE PATTERN canonical at canonical-coherence register substantively; Jump Hash IS pure transformation); Sub-decision 9 Elixir anti-pattern compliance at canonical-knowledge register substantively (resolves GenServer-wrapping-stateless-logic anti-pattern per Elixir hexdocs canonical + ADR-0039 §Sub-decision 11 precedent + B.2 Operations refactor precedent); Sub-decision 10 testability per ADR-0034 (pure function trivially testable; unit + property-based distribution + stability + minimal-remap + dispatch integration tests forward-substrate at D.2/D.3 register substantively); Sub-decision 11 patent-implementation evidence at canonical decision register substantively per ADR-0020 two-register IP discipline canonical (Jump Hash + pure module + config delivers ADR-0038 §Forward Queue target; cryptographically-timestamped D.1 + D.2 + D.3 + D.4 commit lineage distinguishes NIOV substrate from any unauthorized parallel build at "blockchain-only" claim register substantively per operator memory entry adversarial actors disposition); cites ADR-0011 §Amendment + ADR-0020 + ADR-0026 §5 + ADR-0028 §3 and §Forward Queue + ADR-0033 + ADR-0034 + ADR-0035 + ADR-0038 §Sub-decision 3 and §Forward Queue + ADR-0039 §Sub-decision 7/8 + Amendment 1 + RULE 11 + RULE 13 + RULE 20 + RULE 21; D.0 `[BEAM-DBGI-DEVICE-COLDSHARD-RESEARCH-ARC]` Rule 21 research arc embedded at §Context register substantively per `67f6112` RULE 21 promotion commit body precedent register substantively (5 parallel WebSearch queries + 1 WebFetch on Discord ex_hash_ring source; arXiv:1406.2294 Lamping-Veach + Wikipedia Rendezvous + Metabrew Ketama + hexdocs.pm/elixir/Bitwise + Discord ex_hash_ring + Bitwalker libring + Erlang Jump Hash reference impls); Status: **Accepted 2026-05-17** at sub-arc 1 sub-phase d `[BEAM-DBGI-DEVICE-COLDSHARD-CLOSURE]` Commit 4 of 4; 4-commit mini-arc lineage `353c618` → `6e19f61` → `28a5abc` → this commit per ADR-0040 §Post-Closure Implementation Lineage register substantively (D.1 `353c618` `[BEAM-DBGI-DEVICE-COLDSHARD-ADR]` ADR-0040 architecture lock + D.0 Rule 21 research arc embedded; D.2 `6e19f61` `[BEAM-DBGI-DEVICE-SHARD-MODULE]` substantive code NEW CosmpRouter.DeviceShard pure stateless Jump Hash module (SHA-256 first-8-byte stable 64-bit key + Lamping-Veach canonical Jump Hash + `import Bitwise` + 64-bit unsigned wrap via modulo 2^64 + return bucket b not overshot j + assign_shard/1 + assign_shard/2 + configured_shard_count/0 + valid_shard_count?/1 + validate_shard_count!/1) + umbrella `config/config.exs` default `shard_count: 256` + 15 NEW unit tests; D.3 `28a5abc` `[BEAM-DBGI-DEVICE-SHARD-DISPATCH-INTEGRATION]` substantive code MOD `apps/cosmp_router/lib/cosmp_router/grpc/server.ex` explicit `{:ok, :device}` branch BEFORE `{:ok, _other_tier}` catch-all + NEW private `dispatch_device_shard/3` helper invoking `CosmpRouter.DeviceShard.assign_shard/1` + 7 NEW integration tests at `apps/cosmp_router/test/cosmp_router/grpc/device_shard_dispatch_test.exs` with discriminator pattern (invalid DeviceShard config raises ArgumentError on DEVICE dispatch proves explicit DEVICE branch is exercised and DEVICE no longer rides `_other_tier` catch-all); D.4 this commit docs-only closure cascade ADR-0040 Status Proposed → Accepted + Post-Closure Implementation Lineage + section-12-progress.md sub-phase d IN FLIGHT → CLOSED + CURRENT_BUILD_STATE.md NEW H2 sub-phase d closure section + architecture/README + CLAUDE.md ADR-0040 catalog refresh from Proposed to Accepted + ADR-0038 §Forward Queue K=128-1024 DEVICE cold-shard item final closure at canonical-state register substantively per ADR-0040 §Sub-decision 7 + ADR-0035 28th observation D-PASTE-AUTHORIZATION-FAILED-TO-GREP-DISPATCH-HELPER-ARG-ORDER promotion recurrence-7 of 27th observation pattern register substantively); **final runtime state at canonical-execution register substantively**: DEVICE wallet_type resolves through `CosmpRouter.WalletCache.wallet_type_for/1`; `grpc/server.ex` dispatches `{:ok, :device}` through `dispatch_device_shard/3`; deterministic shard assignment via Jump Hash; Router request shape unchanged; DEVICE remains cold (NO DMWWorker spawn for DEVICE; NO per-device GenServer; NO ETS hot path; NO supervised child); AI_AGENT remains canonical at PERSONAL branch register substantively per ADR-0039 L251-255 + D-AI-AGENT-ENTITY-TYPE-vs-WALLET-TYPE-DISCRIMINATION-DRIFT observation register substantively; **final test surface**: `CosmpRouter.DeviceShardTest` 15/0 + `CosmpRouter.GRPC.DeviceShardDispatchTest` 7/0 + `cosmp_router` default 218/0 + 1 skipped + `dbgi_supervisor` default 67/0 (19 excluded) + CI green across all 4 jobs at D.1 + D.2 + D.3 + D.4 register substantively)
- **ADR-0041** — Capsule Layer Substrate Umbrella (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 2 register; umbrella ADR canonicalizing 4-gap capsule layer substrate via per-gap ADR forward-substrate (ADR-0042 Gap 1 Mutation Discrimination + ADR-0043 Gap 3 pgvector Embedding + ADR-0044 Gap 4 Decay Execution Formalization + ADR-0045 Gap 5 Capsule-Level Staleness Detection + optional ADR-0046 AI_AGENT EntityType-Discriminated Capsule Routing); 9 sub-decisions all locked at α-default per Founder Q-A through Q-L LOCKS at `[BEAM-CAPSULE-LAYER-QLOCK]` register substantively + Founder RULE 0 continuity patch at `[BEAM-CAPSULE-LAYER-ADR-RULE0-PATCH]` register substantively + Founder CL.1 scope patch at `[BEAM-CAPSULE-LAYER-ADR-CL1-SCOPE-PATCH]` register substantively — Sub-decision 1 umbrella + per-gap ADR strategy (Option B per Q-A; capsule layer is patent-implementation core per US 12,517,919; warrants depth per gap canonical at canonical-prose register substantively; CAR Sub-box pattern precedent); Sub-decision 2 Gap 1 Mutation Discrimination forward-substrate ADR-0042 (ADD/UPDATE/MERGE/NOOP NIOV-domain enum per Q-G; greenfield per Q-D; version + previous_version + content_hash anchor substrate exists; canonical_record/1 14-field byte-equivalent canonical at ADR-0033 register); Sub-decision 3 Gap 3 pgvector Embedding forward-substrate ADR-0043 (HNSW + cosine per Q-E; text-embedding-3-small at 1536 dims per Q-F; greenfield per Q-D; pgvector index strategy LOCKED at umbrella; embedding model LOCKED at umbrella; ADR-0043 must verify Supabase pgvector availability + Prisma vector handling + migration strategy + cost projections at billion-capsule register substantively + Matryoshka truncation disposition BEFORE code at canonical-execution register substantively); Sub-decision 4 Gap 4 Decay Execution Formalization forward-substrate ADR-0044 (lazy-at-read per Q-H; PARTIAL substrate per Q-D — lazy-at-read pattern at coe.service.ts:235 + L387 forget-floor + L524 Loop 1 hook exist; scheduler/recompute substrate GREENFIELD); Sub-decision 5 Gap 5 Capsule-Level Staleness Detection forward-substrate ADR-0045 (distinct from feedback-loop per Q-I; GREENFIELD at capsule register per Q-D; feedback-loop staleness exists separately at feedback.service.ts:169 substrate and MUST NOT be conflated); Sub-decision 6 AI_AGENT EntityType-discriminated capsule routing (Q-J LOCKED; AI_AGENT remains EntityType NOT WalletType; AI_AGENT continues mapping to PERSONAL wallet_type for storage/economic tier per defaultWalletTypeFor/1 helper; Sub-arc 2 decides capsule-layer routing using EntityType NOT WalletType; RULE 0 lower default permission ceilings preserved canonical at canonical-rule register substantively per CLAUDE.md L134); Sub-decision 7 weighting architecture per Entry #28 reference (document-register only per Q-B + Q-D; combined_score canonical at ADR-0022; per-gap mini-arcs contribute to weighting; NO standalone ADR); Sub-decision 8 testability + migration discipline per ADR-0034 + ADR-0025 + ADR-0033 (per-gap unit tests + per-gap integration tests + discriminator test pattern per ADR-0035 28th observation + Prisma migration discipline + cross-language byte-equivalence); Sub-decision 9 patent-implementation evidence per ADR-0020 + RULE 0 governance canonical at canonical-rule register substantively (capsule layer is substrate where human-entity data lives; mutation discrimination governs write semantics touching revocable permission boundaries; pgvector processes human-entity content; AI_AGENT routing preserves RULE 0 lower default permission ceilings; cryptographically-timestamped CL.1 + per-gap commits + closure cascade lineage); cites RULE 0 + RULE 11 + RULE 13 + RULE 20 + RULE 21 + ADR-0011 §Amendment + ADR-0020 + ADR-0022 + ADR-0025 + ADR-0026 §5 + ADR-0028 §3 + ADR-0033 + ADR-0034 + ADR-0035 + ADR-0038 + ADR-0039 + ADR-0040 + arXiv:1406.2294 Lamping-Veach + Elixir Bitwise hexdocs + pgvector + OpenAI text-embedding-3 + Mem0 + Atlan freshness sources; CL.0 `[BEAM-CAPSULE-LAYER-RESEARCH-ARC]` Rule 21 research arc embedded at §Context register substantively per `67f6112` RULE 21 promotion commit body precedent register substantively (5 parallel WebSearches on pgvector + OpenAI embeddings + event sourcing mutation + temporal decay + knowledge staleness + 14 documented sources); Status: **Accepted 2026-05-19** at Sub-arc 2 closure cascade `[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE]` per Founder Q-SA2-α α-1 + Q-SA2-β β-1 + Q-SA2-γ γ-1 + Q-SA2-δ δ-1 + Q-SA2-ε ε-1 + Q-SA2-ζ ζ-1 + Q-SA2-η η-1 LOCKS at `[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-QLOCK]` + `[BEAM-CAPSULE-LAYER-SUB-ARC-2-CLOSURE-EXECUTE-VERIFY-AUTH]` register substantively (8-row lineage CL.1 → G1.6 → G3.10 `08b10ef` → PR.4 `e60122c` → G4.4 `a05040f` → G5.4 `5fcdbde` → G6.4 `5b5b143` → this commit; all 5 per-gap ADRs canonical at canonical-state register substantively as Accepted: ADR-0042 Gap 1 (G1.6) + ADR-0043 Gap 3 (G3.10 `08b10ef` 2026-05-18) + ADR-0044 Gap 4 (G4.4 `a05040f` 2026-05-18) + ADR-0045 Gap 5 (G5.4 `5fcdbde` 2026-05-18) + ADR-0046 Gap 6 (G6.4 `5b5b143` 2026-05-19); companion hardening ADR-0047 (PR.4 `e60122c` 2026-05-18 Accepted) included in Sub-arc 2 closure lineage; G6.3 `[BEAM-CAPSULE-ROUTING-CONTEXT-RESOLVER]` remains DEFERRED forward-substrate dormant per Founder G6.3 disposition LOCK + Q-G6.4-η η-1 + Q-SA2-η η-1 LOCK preservation (not a closure blocker); **Phase 3 Sub-Arc 2 Capsule Layer Substrate Umbrella CLOSED at canonical-state register substantively**; 5 MOD docs-only at this closure cascade per Q-SA2-γ γ-1 LOCK; ADR-0041 NEW H2 `## Sub-arc 2 Closure Cascade (2026-05-19)` + NEW H2 `## Post-Closure Implementation Lineage` (8-row table) + Status flip + Founder Authorization Sub-arc 2 closure citations; **NO ADR-0035 modification at Sub-arc 2 closure per Q-SA2-δ δ-1 LOCK** (G3.10 already promoted Gap 3 observations to ADR-0035 §9 cluster expansion 36 → 38; G4.4 / G5.4 / G6.4 followed minimum-touch precedent; G6.2 drifts resolved in-place at QLOCK correction); **Phase 3 global status preserved per Q-SA2-ζ ζ-1 LOCK** (Sub-arc 2 closure closes Capsule Layer Substrate Umbrella exclusively; Phase 3 global closure requires separate explicit Founder QLOCK + substrate-state proof that no other Phase 3 sub-arcs remain open); canonical closure precedent G4.4 / G5.4 / G6.4 minimum-touch at umbrella tier; **forward-substrate next strategic arc**: Foundation/COSMP personalization-orchestration substrate Hawkseye per Q-SA2-η η-1 LOCK (research + Hawkseye phase first; substantive personalization / orchestration implementation requires separate Founder authorization + Hawkseye disposition); G6.3 helper remains DEFERRED dormant; forward-substrate items reserved across Sub-arc 2 mini-arcs (ADR-0044 dormant TTL + DecayType enum semantic; ADR-0045 dormant filtering / ranking / lifecycle / audit-literal expansion; ADR-0046 G6.3 helper; ADR-0042 §Q-γ.1 clean-transition discipline) remain dormant unless future Founder-authorized ADR amendments land them) + **§Sub-decision 6 amendment** LANDED at G6.2 `[BEAM-CAPSULE-ROUTING-DOC-AND-TEST-CASCADE]` 2026-05-19: replaces hard-mapping prose ("AI_AGENT continues mapping to PERSONAL wallet_type") with ADR-0046 dual-context routing model (Personal AI Agent + Enterprise AI Agent + defensive fallback); preserves Gap 6 lineage; preserves Sub-arc 2 IN FLIGHT; canonical context-resolution signals = explicit `wallet_type` override + EntityMembership parent/child relationship + defensive fallback; RULE 14 bidirectional citation to ADR-0046

- **ADR-0042** — Capsule Mutation Discrimination ADD/UPDATE/MERGE/NOOP (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 2 Gap 1 register substantively; canonicalizes capsule-mutation discrimination architecture for the MemoryCapsule write path at apps/api/src/services/cosmp/write.service.ts substantively at createCapsule L257 + updateCapsule L420 + processContentForStorage L200 exact substrate name preserved per RULE 13 ground-truth surface; 13 sub-decisions all locked at α-default per Founder Q-α through Q-ν LOCKS at `[BEAM-CAPSULE-MUTATION-QLOCK]` + Founder RULE 0 continuity patch + Founder placeholder patch + Founder Step 3 patch + Founder Path B compaction-loss recovery patch + Founder mini-arc-drift patch + Founder Q-γ.1 final-authorization patch substantively — Q-α MutationType enum location → Prisma-owned (TypeScript canonical register) per ADR-0033 cross-language data ownership; Q-β MutationType field → nullable mutation_type MutationType? on MemoryCapsule adjacent to version + previous_version + content_hash; Q-γ Audit event literal disposition → 4 NEW append-only CAPSULE_MUTATION_ADD/UPDATE/MERGE/NOOP literals extending existing 36-literal AUDIT_EVENT_TYPE_VALUES set substantively (capsule-class subset of 5 literals CAPSULE_CREATED + CAPSULE_METADATA_READ + CAPSULE_CONTENT_READ + CAPSULE_UPDATED + CAPSULE_DELETED preserved per RULE 10; no generic write-class literal predates the discriminated set in the substrate) with Disposition Q-γ.1 clean-transition LOCKED per `[BEAM-CAPSULE-MUTATION-G1.1-QGAMMA-FINAL-AUTH]` (G1.3 transitions write.service.ts emission from CAPSULE_CREATED/CAPSULE_UPDATED to discriminated CAPSULE_MUTATION_*); Q-δ NOOP audit emission → audit-only with zero MemoryCapsule write and zero version increment; Q-ε Primary discriminator → split-discriminator content_hash + canonical_record + version/expected_version; Q-ζ TS-side canonical record → TS-canonical port matching Elixir audit.ex:146 byte-for-byte; Q-η Optimistic concurrency → optional expected_version + CAPSULE_VERSION_CONFLICT envelope per RFC 7232 §3.1 If-Match canonical; Q-θ Mutation discrimination location → write.service.ts boundary at discriminateMutation helper preserving processContentForStorage exact substrate name per RULE 13; Q-ι Elixir role → support/verification only with conditional G1.4 substantive change if grep-proven; Q-κ AI_AGENT disposition → deferred to optional ADR-0046 per ADR-0041 §Sub-decision 6 carryover; Q-λ RULE 0 governance → explicit at every mutation-discrimination decision; Q-μ G1 mini-arc decomposition → 6 commits (G1.1 [BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR] docs-only ADR + G1.2 [CAPSULE-MUTATION-PRISMA-MIGRATION] substantive Prisma migration + audit-literal generation + G1.3 [CAPSULE-MUTATION-WRITE-SERVICE] substantive discriminateMutation + ADD/UPDATE/MERGE/NOOP write semantics + expected_version + conditional G1.4 [CAPSULE-MUTATION-ELIXIR-AUDIT] substantive Elixir audit/canonical/idempotency support if G1.4 pre-flight grep proves substantive Elixir change needed at canonical_record/1 field-projection register substantively + G1.5 [CAPSULE-MUTATION-TESTS] substantive TS unit/integration + cross-language canonical_record + audit/idempotency tests + G1.6 [BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE] docs-only closure cascade); Q-ν Tag prefix → mixed BEAM/CAPSULE; cites RULE 0 + RULE 4 + RULE 10 + RULE 11 + RULE 13 + RULE 20 + RULE 21 + ADR-0002 (append-only audit chain) + ADR-0011 §Amendment + ADR-0020 (patent-implementation evidence) + ADR-0022 (combined_score downstream consumer) + ADR-0025 (schema-push-target discipline for G1.2 migration) + ADR-0026 §5 (6 BEAM-compatibility patterns preserved by construction; Pattern 4 + Pattern 6 explicit) + ADR-0028 §3 + §Forward Queue + ADR-0033 (cross-language data ownership + canonical_record byte-equivalence) + ADR-0034 (BEAM testability discipline) + ADR-0035 (substrate-build discipline; potential cluster expansion at G1.6 closure) + ADR-0036 (REGULATOR per-request indexed point-lookup precedent) + ADR-0037 (jurisdiction immutable-after-creation precedent) + ADR-0038 (DMW Worker per-DMW supervised process) + ADR-0039 + Amendment 1 (hive-scale + promote-on-activity) + ADR-0040 (DEVICE cold-shard) + ADR-0041 (parent umbrella; Gap 1 forward-substrate) + Patent US 12,517,919 + US 12,164,537 + US 12,399,904 + RFC 7232 §3.1 + RFC 6902 + RFC 7396 + Bernstein-Hadzilacos-Goodman §4.2 + Greg Young CQRS + Martin Fowler Event Sourcing + Eric Evans DDD Domain Events + PostgreSQL JSONB merge semantics + Mem0 + Anthropic Claude Memory; G1.0 `[BEAM-CAPSULE-MUTATION-RESEARCH-ARC]` RULE 21 research arc embedded at §Context register substantively (NIOV-domain vs CRUD mutation taxonomy + OCC idioms + content-hash-as-discriminator patterns + cross-language data-ownership boundaries + audit-literal extension discipline + grep-grounded AUDIT_EVENT_TYPE_VALUES substrate-state ground truth surface); Status: Accepted 2026-05-17 at sub-arc 2 Gap 1 G1.6 `[BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE]` (G1 mini-arc 6 commits LANDED: G1.1 [BEAM-CAPSULE-MUTATION-DISCRIMINATION-ADR] `2cb0028` docs-only ADR + G1.2 [CAPSULE-MUTATION-PRISMA-MIGRATION] `dfcbbb1` substantive Prisma migration + G1.3 [CAPSULE-MUTATION-WRITE-SERVICE] `16c562c` substantive write-service discrimination + G1.3-fix [CAPSULE-MUTATION-WRITE-SERVICE-G1.3-INTEGRATION-FIX] `8f047de` minimal integration test waiver extension + G1.4 [CAPSULE-MUTATION-ELIXIR-AUDIT] `3505fde` formal SKIP record per §Sub-decision Q-ι default LOCK + G1.5 [CAPSULE-MUTATION-TESTS] `16567eb` substantive test substrate + G1.6 [BEAM-CAPSULE-MUTATION-DISCRIMINATION-CLOSURE] this commit docs-only closure cascade; Gap 1 Capsule Mutation Discrimination CLOSED at canonical-state register substantively; Sub-arc 2 remains IN FLIGHT pending Gap 3 + Gap 4 + Gap 5 + optional Gap 6 + later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch register substantively; D-TEST-TIER-WAIVER-SCOPE-PRECISION substrate-build observation promoted to ADR-0035 §9 cluster as 36th canonical at G1.6 per Q-G1.6-α LOCK)
- **ADR-0043** — pgvector Embedding (text-embedding-3-small @ 1536 dims; HNSW + cosine) (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 2 Gap 3 register substantively; canonicalizes semantic-retrieval substrate for the MemoryCapsule layer per ADR-0041 §Sub-decision 3 (CL.1 LOCKED Q-E HNSW + cosine + Q-F text-embedding-3-small at 1536 dimensions); 11 Q-G3 sub-decisions / locks Q-G3-α through Q-G3-κ canonicalized at Founder disposition `[CAPSULE-EMBEDDING-ADR-0043-QLOCK-DISPOSITION]` register substantively — Q-G3-α pgvector-enabled Postgres image LOCKED for local/test/CI (specific image pin deferred to G3.2); Q-G3-β Prisma-owned MemoryCapsule DDL per ADR-0033 with `embedding Unsupported("vector(1536)")?` field + raw-SQL post-push scripts (`apply-pgvector-extension.ts` + `apply-hnsw-index.ts`) deferred to G3.3 (per RS-2 Prisma generated-client incomplete for vector types per Prisma Issue #27857; runtime access via `prisma.$queryRaw` / `$executeRaw`); Q-G3-γ text-embedding-3-small at 1536 dimensions production default LOCKED with Matryoshka truncation (256/512/1024 via OpenAI `dimensions` API parameter per RS-6) forward-substrate only; Q-G3-δ NO ADR-0022 amendment at G3.1 — combined_score formula at `apps/api/src/services/coe/keywords.ts:87-93` preserved verbatim; four integration paths enumerated for G3.6 (replace tagOverlap / 4th coefficient / rerank / prefilter); paths (a) + (b) require Founder-authorized ADR-0022 amendment at G3.6; Q-G3-ε hybrid write-first / lazy-backfill LOCKED (ADD generates / UPDATE+MERGE regenerate / NOOP preserves; legacy capsules lazy-on-first-read; bulk backfill conditional G3.7); Q-G3-ζ embeddings = source-content-derived PII per RULE 0 per RS-5 (Vec2Text + ALGEN + Zero2Text inversion attack literature) — embeddings live inside same trust boundary as source content; raw vectors NEVER returned to users/AI_AGENT/external clients by default; similarity search MUST enforce wallet_id + entity permissions + clearance_required + deleted_at null + ai_access_blocked + requires_validation; Q-G3-η NEW append-only `CAPSULE_SIMILARITY_SEARCH` audit literal proposed at G3.1 (substantive AUDIT_EVENT_TYPE_VALUES extension deferred to G3.6 per Q-γ.1 clean-transition pattern); Q-G3-θ β-A LOCKED skip Ecto vector field per ADR-0033 cross-language data-ownership boundary (Prisma owns DDL; no `pgvector_ex` hex dep; no Ecto vector field at first implementation); Q-G3-ι direct dependency on Gap 1 mutation_type semantics (ADD generate / UPDATE+MERGE regenerate / NOOP preserve no embedding work); Q-G3 deployment-agnosticism per ADR-0018 (Supabase + AWS RDS for PostgreSQL + self-hosted Postgres parity per RS-7); Q-G3-κ G3 mini-arc decomposition 10 commits (G3.1 docs-only ADR + G3.2 infra image switch + G3.3 schema + G3.4 provider + G3.5 write-integration + G3.6 retrieval + G3.7 conditional backfill + G3.8 conditional Elixir + G3.9 tests + G3.10 docs-only closure); CL.0 RULE 21 research arc embedded at ADR-0043 §Context register substantively (7 WebSearches RS-1 through RS-7 + 1 WebFetch against current public sources retrieved 2026-05-17; no Q-E or Q-F LOCK contradiction surfaced); cites RULE 0 + RULE 4 + RULE 10 + RULE 11 + RULE 13 + RULE 20 + RULE 21 + ADR-0002 + ADR-0011 + ADR-0013 (forward amendment in G3.2) + ADR-0015 (forward amendment in G3.2) + ADR-0016 (forward worked example in G3.2) + ADR-0018 + ADR-0020 + ADR-0022 (explicit NO amendment at G3.1) + ADR-0025 + ADR-0026 §5 + ADR-0033 §Decision 7 + ADR-0034 + ADR-0035 + ADR-0041 §Sub-decision 3 (parent umbrella; Gap 3 forward-substrate) + ADR-0042 (Gap 1 mutation_type substrate; Q-G3-ι integration) + Patent US 12,517,919 + US 12,164,537 + US 12,399,904; Status: Proposed 2026-05-17 at sub-arc 2 Gap 3 G3.1 `[BEAM-CAPSULE-EMBEDDING-ADR]` (G3.1 LOCKS architecture only at canonical-prose register substantively; G3.1 does NOT close Gap 3 at canonical-state register substantively; Gap 3 closure requires G3.2-G3.10 substantively per Q-G3-κ; Sub-arc 2 closure requires Gap 4 + Gap 5 + optional Gap 6 + later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch register substantively) (G3.2 image pin LANDED at canonical-execution register substantively — `pgvector/pgvector:0.8.2-pg16-trixie` at 5 substantive image substitutions across 3 infra files + 4 prose refresh sites at .github/workflows/ci.yml; ADR-0013/0015/0016 amended in-place at G3.2 per Q-G3.2-γ/δ/ε; ADR-0043 Status preserved as Proposed; G3.3-G3.10 forward-substrate per Q-G3-κ) (G3.3 schema + extension + HNSW index LANDED at canonical-execution register substantively — Prisma `embedding Unsupported("vector(1536)")?` field placed immediately after `mutation_type` per Q-G3.3-δ + `previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]` per Q-G3.3-γ + NEW `scripts/apply-pgvector-extension.ts` + NEW `scripts/apply-hnsw-index.ts` (partial HNSW cosine index per Q-G3.3-β; defaults per Q-G3.3-ε) per Q-G3.3-ζ + 5-step `test-db-up.sh` retrofit per Q-G3.3-θ + CI/nightly orchestration per Q-G3.3-η; ADR-0043 Status preserved as Proposed; D-G3.3-LOCAL-CONTAINER-DRIFT surfaced docs-only per Q-G3.3-λ; G3.4-G3.10 forward-substrate per Q-G3-κ) (G3.4 embedding provider substrate LANDED at canonical-execution register substantively — NEW `apps/api/src/services/embedding/embedding.service.ts` single-file per Q-G3.4-α (mirrors `llm.service.ts`) with EmbeddingProvider interface + EmbeddingResult discriminated union (5 error_class per Q-G3.4-κ) + OpenAIEmbeddingProvider (reuses OPENAI_API_KEY per Q-G3.4-θ) + FixtureBasedEmbeddingProvider (deterministic SHA-256 1536-dim vectors per Q-G3.4-γ) + getEmbeddingProvider() factory per Q-G3.4-β + computeFixtureVector helper + 10 unit tests per Q-G3.4-η at `tests/unit/embedding.test.ts` + barrel re-export per Q-G3.4-ι; no new dependency (openai SDK already at L42); no write/retrieval integration; ADR-0043 Status preserved as Proposed; G3.5-G3.10 forward-substrate per Q-G3-κ) (G3.5 write-integration substrate LANDED at canonical-execution register substantively — write.service.ts integrates EmbeddingProvider as 6th constructor arg per Q-G3.5-δ; createCapsule + updateCapsule UPDATE branches call provider + persist via inline `tx.$executeRawUnsafe('UPDATE memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id = $2::uuid', ...)` per Q-G3.5-γ; MERGE preserves embedding per Q-G3.5-β; NOOP skips provider per Q-G3-ι; failure = degrade per Q-G3.5-α (capsule writes succeed; embedding NULL); audit metadata per Q-G3.5-η (embedding_generated/model/dimensions/tokens_used/failure_class/failure_message/skip_reason; NEVER vector content); 9 NEW write tests E1-E9 (E7 + E8 verbatim names carry degrade-policy behavioral proof) + 1 integration persistence test verifying raw SQL queryRaw; no CircuitBreaker per Q-G3.5-θ; no CAPSULE_SIMILARITY_SEARCH literal per Q-G3.5-ι (G3.6 forward-substrate); ADR-0043 Status preserved as Proposed; G3.6-G3.10 forward-substrate per Q-G3-κ) (G3.6 retrieval substrate LANDED at canonical-execution register substantively — NEW `apps/api/src/services/cosmp/similarity.service.ts` per Q-G3.6-α α-1 with `SimilarityService.searchBySimilarity` invoking raw SQL pgvector cosine query (6 RULE 0 SQL-tier filters before ranking: wallet_id + deleted_at + ai_access_blocked + requires_validation + clearance_required + embedding NOT NULL; `ORDER BY embedding <=> $::vector(1536) ASC`; HNSW iterative scan `SET LOCAL hnsw.iterative_scan = strict_order` + `SET LOCAL hnsw.ef_search = 100` per Q-G3.6-γ.2); NEW `POST /api/v1/cosmp/search` route per Q-G3.6-β β-1; MOD `packages/database/src/queries/audit.ts` appends `CAPSULE_SIMILARITY_SEARCH` literal per Q-G3.6-δ + Q-γ.1 clean-transition; response shape capsule_id + capsule_type + payload_summary only (NO vector / NO distance per Q-G3.6-γ.1); audit details allowed = query_length/topK/minSimilarity/result_count/filters_applied/embedding_generated; FORBIDDEN = raw query text / truncated query / query_keywords_redacted / query vector / result vectors / vector_hash / embedding_sample / distances / per-dimension stats; neutral `emitSimilarityAudit(outcome, ...)` helper per V2 Correction 5; provider failure per Q-G3.6-θ degrades to SUCCESS audit (NEVER DENIED); empty result per Q-G3.6-ι is SUCCESS (NEVER DENIED); topK default 10 / max 50 per Q-G3.6-η; COE integration deferred per Q-G3.6-ε — coe/** + keywords.ts + ADR-0022 ALL UNTOUCHED; 12 unit tests S1-S12 + 4 integration tests J1-J4 (S3-S9+S11 + J1 named-block isolation); no CircuitBreaker; no schema/CI/compose/package changes; ADR-0043 Status preserved as Proposed; G3.7-G3.10 forward-substrate per Q-G3-κ) (G3.7 conditional backfill formally SKIPPED at canonical-state register substantively (2026-05-18) per Q-G3.7-α α-1 LOCK + Q-G3.7-η 5-MOD-docs-only scope LOCK at `[CAPSULE-EMBEDDING-BACKFILL-G3.7-QLOCK]`; substrate-state ground truth at HEAD `371e108` has no proven production population of legacy capsules requiring backfill — every capsule on origin/main was created via post-G3.5 WriteService with embedding generation at create-time; G3.6 similarity service already enforces `embedding IS NOT NULL` graceful-exclusion in raw SQL filter set; Q-G3-ε default disposition (lazy-on-first-read suffices; bulk-backfill remains forward-substrate unless Founder explicitly authorizes later) authorized SKIP path; G1.4 SKIP precedent (commit `3505fde` `[CAPSULE-MUTATION-ELIXIR-AUDIT]` per ADR-0042 §Sub-decision Q-ι default LOCK) is canonical mini-arc SKIP pattern G3.7 mirrors; no code/test/schema/CI/package/Elixir/audit-literal changes; no `CAPSULE_EMBEDDING_BACKFILL` audit literal added; ADR-0022 + ADR-0011/0013/0014/0015/0016/0025/0033/0034/0035/0041/0042 ALL UNTOUCHED; ADR-0043 Status preserved as Proposed; G3.7 does NOT close Gap 3; G3 mini-arc 7/10 after G3.7 SKIP lands; G3.8 + G3.9 + G3.10 forward-substrate per Q-G3-κ) (G3.8 Elixir-boundary contract LANDED at canonical-execution register substantively (2026-05-18) per Q-G3.8-α α-2 LOCK + Q-G3.8-β/γ/δ/ε at `[CAPSULE-EMBEDDING-ELIXIR-G3.8-QLOCK]`; substantive landing, NOT a SKIP; consumer-driven framing: Foundation production readiness DELIBERATELY EXCLUDES Elixir-side vector access at HEAD `ee0b01b`; TS/Prisma own vector write/retrieval at G3.5/G3.6; BEAM/COSMP coordination operates over 7 COSMP ops + MemoryCapsule lifecycle/routing — NOT embedding distance; MOD `apps/cosmp_router/lib/cosmp_router/schemas/memory_capsule.ex` extends moduledoc with explicit "Embedding column boundary (G3.8 / Q-G3-θ β-A LOCK)" H2 section per Q-G3.8-γ (Prisma-owned + intentionally not Ecto-visible + Q-G3-θ β-A LOCK + ADR-0033 §Decision 7 + RULE 0 + RULE 11 + test anchor + D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT naming reconciliation); MOD `apps/cosmp_router/test/cosmp_router/schemas/memory_capsule_test.exs` adds NEW explicit named test (verbatim Q-G3.8-β title) asserting `refute :embedding in MemoryCapsule.__schema__(:fields)`; cosmp_router default tier baseline 218 → 219; no `mix.exs` / `mix.lock` changes; no pgvector / pgvector_ex dep; no Ecto vector field; no Translator pack/unpack extension; no protobuf / gRPC vector extension; no ADR-0033 amendment at G3.8; ADR-0022 + 0011/0013/0014/0015/0016/0025/0034/0035/0041/0042 ALL UNTOUCHED; coe/** + keywords.ts + read.service.ts + write.service.ts + similarity.service.ts UNTOUCHED; ADR-0043 Status preserved as Proposed; G3.8 does NOT close Gap 3; G3 mini-arc 8/10 after G3.8 LANDS; G3.9 + G3.10 forward-substrate per Q-G3-κ) (G3.9 production-contract integration tests LANDED at canonical-execution register substantively (2026-05-18) per Q-G3.9-α α-1 LOCK + 10 additional Q-G3.9 LOCKs at `[CAPSULE-EMBEDDING-PRODUCTION-CONTRACT-G3.9-QLOCK]`; substantive test-only landing; 1 MOD `tests/integration/similarity-search.test.ts` + 0 NEW; 4 NEW integration tests J5-J8 (J5 end-to-end ADD via WriteService persists embedding then SimilaritySearch retrieves same-wallet capsule + J6 end-to-end UPDATE via WriteService regenerates embedding then SimilaritySearch reflects updated content + J7 integration-tier RULE 0 privacy filter joint adversarial fixture excludes all 4 disqualifying capsules under real HNSW + J8 integration-tier embedding-NULL capsule gracefully excluded without crash under real HNSW); J7 5-capsule fixture (1 ELIGIBLE + 1 BLOCKED `ai_access_blocked=true` + 1 PENDING `requires_validation=true` + 1 SOFT `deleted_at IS NOT NULL` + 1 HIGH-CLEARANCE `clearance_required=999`); HTTP response privacy invariants asserted in all 4 NEW tests (no vector / no embedding / no distance / no cosine_distance substrings); CAPSULE_SIMILARITY_SEARCH audit metadata safety asserted in J5 (no raw query / no query_keywords / no query_text / no vector_hash / no embedding_sample / no "distances"); integration baseline 207 → 211 + 1 skipped; no `apps/**` / `packages/**` / `scripts/**` / `schema.prisma` / DB scripts / CI / package / lockfile / `mix.exs` / `mix.lock` / `audit.ts` changes; ADR-0022 + ADR-0033 + ADR-0043 Status UNTOUCHED; 3 in-arc RULE 13 observations forward-queued at commit-body-only register (D-J4-ALREADY-COVERS-3-OF-4-J7-FILTERS-AT-INTEGRATION-TIER + D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE-AT-G3.9-TIER-2 + D-PRISMA-ECTO-CROSS-LANGUAGE-SCHEMA-MIGRATIONS-OWNERSHIP-COLLISION-AT-LOCAL-REFRESH); G3.9 does NOT close Gap 3; G3 mini-arc 9/10 after G3.9 LANDS; G3.10 forward-substrate per Q-G3-κ) (G3.10 Gap 3 CLOSED docs-only closure cascade LANDED at canonical-state register substantively (2026-05-18) per Q-G3.10-α LOCK + 10 additional Q-G3.10 LOCKs at `[BEAM-CAPSULE-EMBEDDING-CLOSURE-G3.10-QLOCK]`; **Gap 3 pgvector Embedding CLOSED at canonical-state register substantively**; ADR-0043 Status flipped from `Proposed 2026-05-17` to **Accepted 2026-05-18** at G3.10 register substantively per Q-G3.10-γ LOCK; 6 MOD docs-only + 0 NEW; **ADR-0035 §9 cluster expansion Option α (cluster 36 → 38 observations)** — 37th D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE (critical production-safety substrate trap; bare `npx vitest run <file>` routes through `vitest.config.ts` loading `.env` → production Supabase pooler; canonical commands MUST use `--config vitest.{unit,integration}.config.ts` OR `npm run test:{unit,integration}`) + 38th D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT (umbrella unifying D-G3.3-LOCAL-CONTAINER-DRIFT + D-LOCAL-ECTO-MIGRATION-STATE-DRIFT-AT-G3.8-TIER-2 + D-PRISMA-ECTO-CROSS-LANGUAGE-SCHEMA-MIGRATIONS-OWNERSHIP-COLLISION-AT-LOCAL-REFRESH at local-development environment + cross-language data ownership boundary per ADR-0033 §Decision 7 + Q-5BII-EXEC-5); 4 commit-body-only observations preserved (D-PGVECTOR-EX-HEX-PACKAGE-NAME-DRIFT-AT-Q-G3-θ + D-ELIXIR-VECTOR-CONSUMER-DELIBERATELY-EXCLUDED-AT-FOUNDATION-PRODUCTION-READINESS + D-IMPLICIT-VS-EXPLICIT-BOUNDARY-CONTRACT-AT-Q-G3-θ-G3.3-DEFERRAL + D-J4-ALREADY-COVERS-3-OF-4-J7-FILTERS-AT-INTEGRATION-TIER); G3 mini-arc 10/10 complete; **Sub-arc 2 status field remains IN FLIGHT** per Q-G3.10-δ + Q-G3.10-ι (closure cascade forward-substrate pending Gap 4 + Gap 5 + optional Gap 6 + later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope patch); COE / ADR-0022 integration remains forward-substrate per Q-G3.10-κ (NOT a Gap 3 closure dependency); no production code/schema/test/CI/package/Elixir/audit.ts changes per Q-G3.10-η; ADR-0022 + ADR-0033 UNTOUCHED per Q-G3.10-ζ; patent-implementation evidence per ADR-0020 two-register IP discipline — G3.1-G3.10 lineage at ADR-0043 §Post-Closure Implementation Lineage canonical at canonical-execution register substantively; Status: Accepted 2026-05-18)
- **ADR-0044** — Decay Execution Formalization (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 2 Gap 4 register substantively; canonicalizes existing lazy-at-read decay substrate per ADR-0041 §Sub-decision 4 Q-H LOCK; 12 Q-G4 sub-decisions / locks Q-G4-α through Q-G4-μ at `[BEAM-CAPSULE-DECAY-G4-QLOCK]` — Q-G4-α α-1 docs-only ADR first; Q-G4-β β-1 lazy-at-read only; Q-G4-γ γ-5 6 targets (relevance_score + combined_score recency + last_accessed_at + access_count + O-G4.1-1 expires_at TTL substrate observation + O-G4.1-2 DecayType enum semantics substrate observation); Q-G4-δ δ-1 no schema changes at G4.1; Q-G4-ε Gap 4 / Gap 5 boundary canonical; Q-G4-ζ RULE 0 no-auto-deletion canonical (FOUNDATIONAL bypass + explicit-recall bypass + soft-delete-only); Q-G4-η η-1 existing audit literals suffice; Q-G4-θ θ-1 similarity integration explicit DEFER (SimilarityService UNTOUCHED; ADR-0043 G3.9 privacy proofs preserved; no ADR-0022 amendment); Q-G4-ι ι-1 canonicalize existing substrate first; Q-G4-κ κ-1 BEAM observer only at G4.1 (no Elixir-side decay computation; no scheduler dependency); Q-G4-λ λ-1 cite existing frozen anchor tests only (tests/unit/coe.test.ts:121-129 + :132-136); Q-G4-μ μ-2 4-phase mini-arc decomposition (G4.1 ADR + G4.2 substrate observation + G4.3 conditional impl SKIP-by-default + G4.4 closure cascade); RULE 21 research arc embedded at §Context (RS-1 Mem0 + RS-2 Ebbinghaus/SM-2/FSRS + RS-3 LRU/LFU/ARC analogy only + RS-4 RAG temporal weighting + RS-5 Oban/Quantum future-substrate context); 2 substrate-state observations surfaced per RULE 13 (O-G4.1-1 expires_at TTL not enforced + O-G4.1-2 DecayType enum 5 values only FOUNDATIONAL has explicit substrate behavior); cites RULE 0 + RULE 11 + RULE 12 + RULE 13 + RULE 20 + RULE 21 + ADR-0011 + ADR-0015 + ADR-0018 + ADR-0020 (preserves ADR-0045/0046 reservations per patent-implementation lineage) + ADR-0021 (FOUNDATIONAL bypass + DecayType extension protocol) + ADR-0022 (explicit NO amendment at G4.1; combined_score + RELEVANCE_* constants preserved) + ADR-0026 §5 + ADR-0027 + ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (cross-language boundary; BEAM Translator round-trip preservation) + ADR-0035 + ADR-0041 §Sub-decision 4 Q-H LOCK (parent umbrella) + ADR-0042 §Q-γ.1 clean-transition discipline (future audit literal expansion path) + ADR-0043 (Gap 3 closure parent; SimilarityService UNTOUCHED at G4.1) + ADR-0047 (Post-Gap-3 hardening closure parent) + Patent US 12,517,919 + US 12,164,537 + US 12,399,904; Sub-arc 2 status field remains IN FLIGHT throughout G4.1-G4.4; 4-phase implementation lineage (G4.1 this commit docs-only ADR + G4.2 substrate observation phase forward-substrate + G4.3 conditional impl SKIP-by-default forward-substrate + G4.4 closure cascade forward-substrate); Status: **Accepted 2026-05-18** at G4.4 `[BEAM-CAPSULE-DECAY-CLOSURE]` per Founder Q-G4.4-α α-1 + Q-G4.4-β β-1 + Q-G4.4-γ γ-1 + Q-G4.4-δ δ-1 + Q-G4.4-ε ε-1 + Q-G4.4-ζ ζ-1 + Q-G4.4-η η-1 LOCKS at `[BEAM-CAPSULE-DECAY-CLOSURE-G4.4-QLOCK]` + `[BEAM-CAPSULE-DECAY-CLOSURE-G4.4-EXECUTE-VERIFY-AUTH]` register substantively (4-commit lineage `7097bb8` → `ce33c3a` → `b558f64` → this commit; G4.1 LANDED 2026-05-18 at `7097bb8` ADR-0044 NEW Proposed + 4 MOD + 1 NEW docs-only + RULE 21 research arc + 2 substrate-state observations O-G4.1-1/O-G4.1-2; G4.2 LANDED 2026-05-18 at `ce33c3a` substrate observation phase + 3 MOD docs-only + Q-G4.2-α α-2 deferred TTL + Q-G4.2-β β-2 deferred DecayType enum semantics + Q-G4.2-γ γ-1 G4.3 formal SKIP determination + NEW O-G4.2-3 substrate-state observation; G4.3 SKIPPED 2026-05-18 at `b558f64` formal SKIP record + 3 MOD docs-only + no implementation landed + canonical SKIP per G1.4 (`3505fde`) + G3.7 (`ee0b01b`) precedents; G4.4 LANDED 2026-05-18 at this commit docs-only closure cascade + 5 MOD + Status flip + Gap 4 row Status flip IN FLIGHT → CLOSED + README/CLAUDE catalogs flipped per Q-G4.4-ε ε-1 LOCK + NO ADR-0035 modification per Q-G4.4-δ δ-1 LOCK + Sub-arc 2 preserved IN FLIGHT per Q-G4.4-ζ ζ-1 LOCK + Gap 5 / ADR-0045 starts next per Q-G4.4-η η-1 LOCK + canonical closure cascade per G3.10 (`08b10ef`) + PR.4 (`e60122c`) + G1.6 precedents; **Gap 4 Decay Execution Formalization CLOSED at canonical-state register substantively**; ADR-0044 forward-substrate is dormant unless future Founder-authorized ADR amendment lands TTL enforcement or non-FOUNDATIONAL DecayType enum semantics)
- **ADR-0045** — Capsule-Level Staleness Detection (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 2 Gap 5 register substantively; canonicalizes capsule-level staleness detection model per ADR-0041 §Sub-decision 5 Q-I LOCK; 12 Q-G5 sub-decisions / locks Q-G5-α through Q-G5-μ at `[BEAM-CAPSULE-STALENESS-G5-QLOCK]` — Q-G5-α α-1 docs-only ADR first; Q-G5-β β-4 hybrid detection + ranking + lifecycle no-deletion model; Q-G5-γ γ-5 4 canonical dimensions (content age + embedding lag + coverage drift + semantic validity per Atlan canonical 4-dimension framework + STALE benchmark Implicit Conflict + Mem0 reconciliation); Q-G5-δ δ-1 + δ-5 no schema changes at G5.1 (defer to G5.2/G5.3); Q-G5-ε ε-4 defer audit literals to G5.2/G5.3; Q-G5-ζ ζ-5 phased integration no code at G5.1; Q-G5-η canonical RULE 0 governance bullets (staleness never deletes + explicit-recall + FOUNDATIONAL bypass + reversible filtering + user/entity authority); Q-G5-θ canonical Gap 4/5 boundary (Gap 4 = time/use-based ranking; Gap 5 = semantic/currentness/validity detection; do not collapse into decay_score); Q-G5-ι canonical Gap 3/5 boundary (Gap 3 = embedding generation/retrieval; Gap 5 = detecting embedding-content skew; G3.9 J5-J8 privacy proofs preserved; no vector/distance/raw query leakage at any G5 surface); Q-G5-κ κ-1 BEAM observer-only at G5.1 (no Elixir staleness computation); Q-G5-λ λ-1 cite existing frozen anchor tests only; Q-G5-μ 4-phase mini-arc decomposition (G5.1 ADR + G5.2 substrate observation + G5.3 conditional impl SKIP-or-implement + G5.4 closure cascade); RULE 21 research arc embedded at §Context (RS-G5-1 STALE benchmark + Mem0 + MemPalace + Memory Worth + RS-G5-2 arXiv:2509.19376 + RisingWave staleness gap + continuous-ETL + RS-G5-3 Atlan canonical 4-dimension framework + 3-layer monitoring + context drift signals + RS-G5-4 DeDrift + Self-Aware Vector Embeddings + MPZCH + Encord + RS-G5-5 When to Forget memory governance + Acuvity transparency + LinkedIn Cognitive Memory Agent human-validation; 14+ documented sources); mandatory feedback-loop staleness vs capsule-level staleness discrimination canonical per RULE 13 (existing feedback-loop staleness at feedback.service.ts:683 runLoop7Once + FEEDBACK_LOOP_STALE + Loop7Result.stale_loops targets FeedbackLoopHealth rows NOT MemoryCapsule rows; MUST NOT be conflated per ADR-0041 §Sub-decision 5 Q-I LOCK explicit); cites RULE 0 + RULE 10 + RULE 11 + RULE 12 + RULE 13 + RULE 20 + RULE 21 + ADR-0011 §Amendment + ADR-0015 + ADR-0018 + ADR-0020 + ADR-0021 (FOUNDATIONAL bypass inheritance) + ADR-0022 (FROZEN; no amendment at G5.1) + ADR-0025 + ADR-0026 §5 + ADR-0027 + ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (cross-language boundary; BEAM Translator round-trip preservation) + ADR-0034 + ADR-0035 + ADR-0041 §Sub-decision 5 Q-I LOCK (parent umbrella) + ADR-0042 §Q-γ.1 clean-transition discipline (future audit literal expansion path) + ADR-0043 (Gap 3 closure parent; SimilarityService G3.9 J5-J8 privacy proofs preserved at all G5 surfaces) + ADR-0044 (Gap 4 closure parent; Gap 4/5 boundary canonical) + ADR-0047 (Post-Gap-3 hardening closure parent) + Patent US 12,517,919 + US 12,164,537 + US 12,399,904; Sub-arc 2 status field remains IN FLIGHT throughout G5.1-G5.4 per Q-G5-μ + ADR-0041 CL.1 scope patch; 4-phase implementation lineage (G5.1 this commit docs-only ADR + G5.2 substrate observation phase forward-substrate + G5.3 conditional impl SKIP-or-implement forward-substrate + G5.4 closure cascade forward-substrate); Status: **Accepted 2026-05-18** at G5.4 `[BEAM-CAPSULE-STALENESS-CLOSURE]` per Founder Q-G5.4-α α-1 + Q-G5.4-β β-1 + Q-G5.4-γ γ-1 + Q-G5.4-δ δ-1 + Q-G5.4-ε ε-1 + Q-G5.4-ζ ζ-1 + Q-G5.4-η η-1 LOCKS at `[BEAM-CAPSULE-STALENESS-CLOSURE-G5.4-QLOCK]` + `[BEAM-CAPSULE-STALENESS-CLOSURE-G5.4-EXECUTE-VERIFY-AUTH]` register substantively (4-commit lineage `0a21d62` → `14667a1` → `e6e93b8` → this commit; G5.1 LANDED 2026-05-18 at `0a21d62` ADR-0045 NEW Proposed + 4 MOD + 1 NEW docs-only + RULE 21 research arc embedded + canonical 4-dimension staleness model + 12 Q-G5 sub-decisions canonical + mandatory feedback-loop vs capsule-level staleness discrimination canonical per RULE 13; G5.2 LANDED 2026-05-18 at `14667a1` substrate observation phase + 3 MOD docs-only + Q-G5.2-α α-2 minimum-viable embedding lag schema disposition + Q-G5.2-β β-1 defer audit literals + Q-G5.2-γ γ-2 write.service-only integration + Q-G5.2-δ δ-2 G5.3 minimal substantive implementation + NEW O-G5.2-1 substrate-state observation (feedback_loop_score three-register discrimination canonical); G5.3 LANDED 2026-05-18 at `e6e93b8` minimum-viable embedding lag implementation + 11 MOD substantive + docs + 2 NEW MemoryCapsule fields (`embedding_content_hash` + `embedding_generated_at`) + write.service Prisma data conditional spread for ADD + UPDATE branches + Ecto schema + Translator pack/unpack pass-through + unit tests L1-L5 + integration tests L6-L7 + UPDATE-failure stale-detection semantic substrate-honest preservation of G3.5 Q-G3.5-α degrade-policy; G5.4 LANDED 2026-05-18 at this commit docs-only closure cascade + 5 MOD per Q-G5.4-γ γ-1 LOCK + Status flip Proposed → Accepted + Gap 5 row Status flip IN FLIGHT → CLOSED + README/CLAUDE catalogs flipped per Q-G5.4-ε ε-1 LOCK + NO ADR-0035 modification per Q-G5.4-δ δ-1 LOCK + Sub-arc 2 preserved IN FLIGHT per Q-G5.4-ζ ζ-1 LOCK + optional Gap 6 / ADR-0046 next under Path A per Q-G5.4-η η-1 LOCK + canonical closure cascade per G3.10 (`08b10ef`) + G4.4 (`a05040f` minimum-touch precedent G5.4 mirrors exactly) + PR.4 (`e60122c`) + G1.6 precedents; **Gap 5 Capsule-Level Staleness Detection CLOSED at canonical-state register substantively**; ADR-0045 forward-substrate after closure is dormant unless future Founder-authorized ADR amendment lands filtering / ranking / lifecycle / audit-literal expansion / COE / SimilarityService / read.service / feedback.service integration)
- **ADR-0046** — AI_AGENT EntityType-Discriminated Capsule Routing (Phase 3: Dynamic Memory Accuracy at Scale sub-arc 2 Gap 6 register substantively; canonicalizes dual-context AI_AGENT routing model per ADR-0041 §Sub-decision 6 forward-substrate reservation closed by this ADR; Founder dual-context correction explicit at `[BEAM-CAPSULE-ROUTING-G6-FOUNDER-CORRECTION]` register substantively; 10 Q-G6 sub-decisions / locks Q-G6-α through Q-G6-ι at `[BEAM-CAPSULE-ROUTING-G6-QLOCK]` — Q-G6-α α-1 docs-only ADR first; Q-G6-β β-1 dual-context routing (AI_AGENT routes to PERSONAL or ENTERPRISE depending on use/deployment context); Q-G6-γ γ-1 no schema changes at G6.1 (EntityMembership + explicit `wallet_type` override are canonical context-resolution signals; γ-2/γ-3/γ-4 schema discriminators DEFERRED forward-substrate); Q-G6-δ δ-1 docs-only ADR first no TS code (δ-3 `resolveAiAgentWalletContext` helper DEFERRED at G6.3 forward-substrate per Founder G6.3 disposition LOCK); Q-G6-ε ε-2 BEAM Translator pass-through already in place at `apps/cosmp_router/lib/cosmp_router/capsule/translator.ex` (3 Elixir module docstring corrections + grpc/server.ex:266 forward-substrate comment closure at G6.2); Q-G6-ζ ζ-1 existing audit literals + emission metadata suffice (ai_capped + details.entity_type + ai_access_blocked + requires_validation already emitted at negotiate.service.ts:625-630; ζ-2 NEW `AI_AGENT_ROUTING_DECISION` literal DEFERRED forward-substrate); Q-G6-η η-2 add TS unit tests proving dual-context behavior at G6.2 (bare AI_AGENT → ENTERPRISE preserved + explicit override AI_AGENT → PERSONAL works + twin AI_AGENT → PERSONAL via twin.service.ts:189-191 preserved); Q-G6-θ θ-1 run Gap 6 mini-arc before Sub-arc 2 closure cascade; Q-G6-ι ι-1 (refined) Gap 6 is production-blocking at the canonicalization tier (compliance + patent-implementation evidence per ADR-0020 + CISO/SOC 2 audit completeness) while runtime substrate is already production-safe for both contexts at HEAD `5fcdbde` register substantively; G6.3 disposition LOCK DEFERRED (substantive `resolveAiAgentWalletContext` helper not in current closure path); **dual-context model canonical at canonical-prose register substantively**: Personal AI Agent context = AI_AGENT + PERSONAL + EntityMembership(parent=PERSON owner, child=AI_AGENT) + `niov_can_access_contents = true` + LIVE production product flow via `apps/api/src/services/governance/twin.service.ts:189-191` explicit `wallet_type: "PERSONAL"` override per ADR-0001 design intent for digital twins; Enterprise AI Agent context = AI_AGENT + ENTERPRISE + EntityMembership(parent=COMPANY / organization / agency, child=AI_AGENT) + `niov_can_access_contents = false` + forward-substrate product surface with defensive infrastructure live via `packages/database/src/queries/wallet.ts:39-58` `defaultWalletTypeFor(AI_AGENT) = ENTERPRISE` RULE 0 safe default; canonical context-resolution signals = explicit `wallet_type` override + EntityMembership parent/child relationship + defensive fallback when context is ambiguous; RULE 21 research arc embedded at §Context (RS-G6-1 agent identity vs storage/account separation: Mem0 + Aembit + ResilientCyber + GitGuardian + Built In; RS-G6-2 confused-deputy in agentic systems: Cloud Security Alliance + HashiCorp + Quarkslab + BeyondTrust + Safeguard.sh; RS-G6-3 enterprise/government auditability: Atlan + IBL + BigID + MarkTechPost + AGAT Software; RS-G6-4 NIST AI Agent Standards Initiative + least-privilege capability tokens: Build MVP Fast + WorkOS + Security Boulevard + Biometric Update + CSA; 20+ documented public sources retrieved 2026-05-19); 11-row enforcement surface inventory canonical at §B (defaultWalletTypeFor RULE 0 defensive fallback + AI_AGENT clearance_ceiling 2 + sovereignty cap on raising AI ceiling + AI cannot grant to AI + AI grantors default SESSION_ONLY + isRestrictedAiClass + AI sovereignty cap on FULL scope + ai_capped audit + similarity SQL filters + embedding provider denial + twin EntityMembership fusion); 10-row adversarial threat model canonical at §Threat Model T1-T10 (net verdict: no code-tier vulnerability at HEAD `5fcdbde`; T1+T2+T4+T5+T7 are documentation-canonicalization gaps ADR-0046 closes; T3+T6+T8+T9+T10 substantively defended at canonical-execution register substantively); 8 RULE 13 substrate-honest drift surfaces canonical at §C for G6.2 doc-and-test cascade (ADR-0001 L46+L90 + glossary "Digital Twin Wallet" entry + ADR-0039 L106-108 + L250-253 + Sub-decision 8 Amendment 1 + ADR-0041 §Sub-decision 6 hard-mapping prose + wallet_lookup.ex + schemas/wallet.ex + activity_counter.ex moduledocs + grpc/server.ex:266 forward-substrate comment); cites RULE 0 + RULE 10 + RULE 11 + RULE 12 + RULE 13 + RULE 20 + RULE 21 + ADR-0001 (foundational; Personal DMW claim preserved + narrowed at G6.2) + ADR-0002 + ADR-0011 §Amendment + ADR-0020 (patent-implementation evidence) + ADR-0021 (FOUNDATIONAL bypass inheritance) + ADR-0022 (FROZEN; no amendment at G6.1) + ADR-0026 §5 (Pattern 6 pure transformation preserved at Translator) + ADR-0027 + ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (BEAM observer-only at G6.1) + ADR-0034 + ADR-0035 + ADR-0036 (REGULATOR per-request indexed point-lookup pattern at WalletLookup) + ADR-0037 (jurisdiction immutability) + ADR-0038 (DMW Worker per-DMW Supervised Process) + ADR-0039 (Gap 4/5/6 dual-context routing path documentation gap closed at G6.2 Amendment 2) + ADR-0040 (DEVICE cold-shard) + ADR-0041 §Sub-decision 6 (parent umbrella; Gap 6 forward-substrate reservation closed by this ADR) + ADR-0042 (Gap 1 mutation discrimination; clean-transition discipline) + ADR-0043 (Gap 3 closure parent; G3.9 J5-J8 privacy proofs preserved) + ADR-0044 (Gap 4 closure parent) + ADR-0045 (Gap 5 closure parent; minimum-touch G4.4 / G5.4 closure precedent) + ADR-0047 (Post-Gap-3 hardening closure parent) + Patent US 12,517,919 + US 12,164,537 + US 12,399,904; Sub-arc 2 status field remains IN FLIGHT throughout G6.1-G6.4 per Q-G6-θ + ADR-0041 CL.1 scope patch; 4-phase implementation lineage (G6.1 this commit docs-only ADR + G6.2 doc-and-test cascade forward-substrate + G6.3 substantive helper DEFERRED forward-substrate per Founder G6.3 disposition LOCK + G6.4 closure cascade forward-substrate); Status: **Accepted 2026-05-19** at G6.4 `[BEAM-CAPSULE-ROUTING-CLOSURE]` per Founder Q-G6.4-α α-1 + Q-G6.4-β β-1 + Q-G6.4-γ γ-1 + Q-G6.4-δ δ-1 + Q-G6.4-ε ε-1 + Q-G6.4-ζ ζ-1 + Q-G6.4-η η-1 LOCKS at `[BEAM-CAPSULE-ROUTING-G6.4-QLOCK]` + `[BEAM-CAPSULE-ROUTING-G6.4-EXECUTE-VERIFY-AUTH]` register substantively (3-commit lineage `c130826` → `9c3943d` → this commit with G6.3 DEFERRED; G6.1 LANDED 2026-05-19 at `c130826` ADR-0046 NEW Proposed + 4 MOD + 1 NEW docs-only + RULE 21 research arc embedded + canonical dual-context routing model + 10 Q-G6 sub-decisions canonical + 11-row enforcement surface inventory + 10-row adversarial threat model T1-T10 + 8 RULE 13 substrate-honest drift surfaces for G6.2 cascade; G6.2 LANDED 2026-05-19 at `9c3943d` doc-and-test cascade + 13 MOD + 0 NEW corrected scope per Q-G6.2-ι (D-G6.2-1 + D-G6.2-2 drifts resolved at `[BEAM-CAPSULE-ROUTING-G6.2-QLOCK-CORRECTION]`) + ADR-0001 in-place Amendment 1 (preserve + narrow Personal DMW / digital twin claim to Personal AI Agent context + add Enterprise AI Agent companion + RULE 14 bidirectional citation) + ADR-0039 in-place Amendment 2 (dual-context BEAM dispatch path documentation; wallet_type column canonical dispatch signal; prior substrate-build observations + research arc + Horde + cosmp_router pure-module decisions preserved verbatim) + ADR-0041 §Sub-decision 6 amendment (replace hard-mapping prose with ADR-0046 dual-context model) + ADR-0046 G6.2 cascade section + glossary "Digital Twin Wallet" narrowed + NEW "Personal AI Agent" + NEW "Enterprise AI Agent" entries + 3 Elixir module docstring corrections + grpc/server.ex:266 forward-substrate comment closure + CLAUDE.md catalog updates + 4 NEW dual-context TS unit tests; baseline deltas unit 562 → 566 (+4 NEW tests); G6.3 DEFERRED forward-substrate per Founder G6.3 disposition LOCK + Q-G6.4-η η-1 LOCK preservation; G6.4 LANDED 2026-05-19 at this commit docs-only closure cascade + 5 MOD per Q-G6.4-γ γ-1 LOCK + ADR-0046 Status flip Proposed → Accepted + Gap 6 row Status IN FLIGHT → CLOSED + README + CLAUDE.md catalogs flipped per Q-G6.4-ε ε-1 LOCK + **NO ADR-0035 modification per Q-G6.4-δ δ-1 LOCK** (G6.2 drifts resolved in-place; no new recurring substrate-build discipline observation requires ADR-0035 promotion at G6.4) + Sub-arc 2 preserved IN FLIGHT per Q-G6.4-ζ ζ-1 LOCK + canonical closure cascade per G4.4 (`a05040f` minimum-touch precedent G6.4 mirrors exactly) + G5.4 (`5fcdbde` canonical 5-file scope identical to G6.4) + G3.10 (`08b10ef`) precedents; **Gap 6 AI_AGENT EntityType-Discriminated Capsule Routing CLOSED at canonical-state register substantively**; ADR-0046 forward-substrate after closure is dormant for substantive code unless future Founder-authorized QLOCK lands G6.3 helper AND a real product flow surfaces unresolved ambiguity at wallet-defaulting tier — current G6.2 verification PASS substantively does not surface such ambiguity; Sub-arc 2 closure cascade remains forward-substrate after this commit per Q-G6.4-ζ ζ-1 LOCK + ADR-0041 CL.1 scope patch)
- **ADR-0047** — Post-Gap-3 Production-Readiness Hardening Mini-Arc (Post-Gap-3 hardening register substantively; canonicalizes 4-sub-phase compressed hardening mini-arc PR.1-PR.4 between Gap 3 closure at commit `08b10ef` and Gap 4 start per Founder Q-PR-α LOCK Option α + Q-PR-β LOCK Option β; 11 Q-PR sub-decisions Q-PR-α through Q-PR-μ canonical at `[POST-GAP-3-PRODUCTION-READINESS-HARDENING-QLOCK]`; Q-PR-γ Option α fail-closed `vitest.config.ts` + NEW guard unit test at PR.2 closes Drift G4-A live-production safety boundary per ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE; Q-PR-δ Option α NEW `scripts/local-test-db-refresh.sh` at PR.3 encoding canonical 7-step refresh per ADR-0035 §9 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT; Q-PR-ε Option α NEW read-only production parity verification script at PR.3 (no mutations; no secret exposure; drift inventory only); Q-PR-ι Option α NEW `docs/operations/deployment-runbook.md` at PR.4; Q-PR-κ amended Option γ — ADR-0047 selected; ADR-0044 Gap 4 / ADR-0045 Gap 5 / ADR-0046 optional Gap 6 forward-substrate reservations PRESERVED per PR.1 Hawkseye D-PR.1-ADR-NUMBERING-FORWARD-SUBSTRATE-RESERVATION-CASCADE-IMPACT RULE 13 surface; Q-PR-λ Option β pre-launch mandatory gate (PR.2 vitest hardening + PR.3 parity verifier + PR.4 deployment runbook); Q-PR-μ Option α Gap 4 starts only after PR.4 lands; governing RULES RULE 0 + RULE 11 + RULE 12 + RULE 13 + RULE 20 + RULE 21 canonical at substrate-architectural register substantively per Founder QLOCK Mode section; production-safety hardening arc framing canonical (NOT convenience cleanup); cites RULE 0 + RULE 11 + RULE 12 + RULE 13 + RULE 20 + RULE 21 + ADR-0002 + ADR-0011 (Drift G4-A acknowledgment) + ADR-0013 + ADR-0015 + ADR-0018 + ADR-0019 + ADR-0020 (preserves ADR-0044/0045/0046 reservations per patent-implementation lineage) + ADR-0021 + ADR-0025 + ADR-0027 + ADR-0033 §Decision 7 + Q-5BII-EXEC-5 + ADR-0035 §9 37th + 38th + ADR-0037 + ADR-0041 (parent umbrella preserved) + ADR-0043 (closure parent register substantively Accepted 2026-05-18) + ADR-0044 / ADR-0045 / ADR-0046 reservations PRESERVED + Patent US 12,517,919 + US 12,164,537 + US 12,399,904; Sub-arc 2 status field remains IN FLIGHT throughout the hardening mini-arc; Status: Proposed 2026-05-18 at PR.1 (PR.1 docs-only ADR creation); **PR.2 LANDED** at commit `57edb3b` — ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE CLOSED at canonical-execution register substantively (MOD `vitest.config.ts` hardened fail-closed + NEW `tests/unit/test-env-config-safety.test.ts` 5-test guard); **PR.3 LANDED** at commit `bb26126` — ADR-0035 §9 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT CLOSED at canonical-execution register substantively (NEW `scripts/local-test-db-refresh.sh` + NEW `scripts/verify-production-parity.ts`); **PR.4 LANDED** at this commit — **Post-Gap-3 Production-Readiness Hardening Mini-Arc CLOSED at canonical-state register substantively** per Q-PR.4-α α-1 + Q-PR.4-β β-1 + Q-PR.4-γ γ-1 + Q-PR.4-δ δ-1 + Q-PR.4-ε ε-2 + Q-PR.4-ζ ζ-1 + Q-PR.4-η η-1 LOCKS (6 MOD + 1 NEW docs-only closure cascade; NEW `docs/operations/deployment-runbook.md` 13-section full production-readiness runbook; ADR-0035 §9 RULE 14 back-citation footers at 37th + 38th observations per Q-PR.4-β β-1 LOCK; Sub-arc 2 status field remains IN FLIGHT per Q-PR-δ + Q-PR-ι LOCK; Gap 4 / ADR-0044 may start after PR.4 lands per Q-PR-μ Option α LOCK; PR.1-PR.4 lineage `b478191` → `57edb3b` → `bb26126` → this commit); **Status: Accepted 2026-05-18** at PR.4 closure cascade canonical at canonical-state register substantively)

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
