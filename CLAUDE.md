# CLAUDE.md

Authoritative operational rules for Claude Code sessions in
`niov-foundation`. Read this entire file before every action.
The 11 preserved RULES (0-10) and the 5 RULES added in Section
12C.0.5 (12-16) define what every session in this repo
internalizes; the rest of the file provides the project context
those rules operate against.

This file replaces the pre-Section-12 `claude.md` (lowercase)
in Section 12C.0.5 Phase 3a. The 11 preserved RULES are quoted
verbatim from the prior file; the new RULES emerged from Phase
1-2 substrate work in the same commit.

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

`niov-foundation` is **not** the Otzar product, the Glonari
deployment, or the otzar-control-tower frontend. The Foundation
is backend-only. Tech stack: Node.js + TypeScript + Fastify
(API), Supabase PostgreSQL with Prisma ORM (database), Upstash
Redis (cache), Supabase Storage (storage), Vitest (tests). All
infrastructure is centralized cloud services. There is no
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
│   │   └── decisions/                (ADRs 0001-0017 + template)
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
verbatim from the pre-Section-12 `claude.md`; Rules 12-16 were
added in Section 12C.0.5 from Phase 1-2 substrate work. RULE 11
is intentionally vacant — the prior file had 11 rules numbered
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
`docs/contributing/code-style.md` §Logging.

## 4. Architectural Vocabulary

This file is not the glossary. Vocabulary lives in three
authoritative locations:

- `docs/reference/glossary.md` — every Foundation-specific
  term (Memory Capsule, COSMP, COE, DMW, EntityComplianceProfile,
  writeAuditEvent, SYSTEM_PRINCIPALS, etc.) with definitions,
  schema citations, and capitalization conventions
- `docs/reference/architectural-anchors.md` — the 6
  runtime-enforced architectural properties (DRIFT 9 audit +
  permissions filter narrowing, DRIFT 2 Option C no-console,
  DRIFT 12 chainKey priority, frozen `CRYPTO_CONFIG`, frozen
  `SYSTEM_PRINCIPALS`)
- `docs/architecture/decisions/` — the 17 ADRs with
  Decision / Consequences / Alternatives in Michael Nygard
  format

When a term, anchor, or decision is non-obvious in code or
documentation, **cite the reference**, do not redefine.

## 5. Key Architectural Decisions

The 17 ADRs as of Track A Gate 8a. The `docs/architecture/README.md`
is the source of truth for ADR navigation; this is a quick-
reference jump table.

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
  - Gate 2 (OrbStack install): CLOSED (operator-side)
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
  - **Gate 8b (CLAUDE.md update): IN FLIGHT (this commit)**
  - Gate 8c (testing.md + onboarding.md): QUEUED
  - Gate 8d (discipline-pattern documentation): QUEUED
- Independent companion tracks (canonical references; landed
  alongside Track A):
  - G5b-I Resolution: CLOSED `fbc7942`
  - ADR-0016 Pin-and-Optimize Framework: CLOSED `782154c`
  - ADR-0017 Production Discipline: CLOSED `444cf56`
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

- **`docs/architecture/`** — ADR-0001 through ADR-0017 plus
  the template (`0000-template.md`) and the architecture
  README. Start with `docs/architecture/README.md`.
- **`docs/reference/`** — `glossary.md` (term definitions),
  `architectural-anchors.md` (the 6 runtime invariants),
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
