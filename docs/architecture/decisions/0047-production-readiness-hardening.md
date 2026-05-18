# ADR-0047 — Post-Gap-3 Production-Readiness Hardening Mini-Arc

## Status

Accepted 2026-05-18

ADR-0047 closure cascade LANDED at PR.4 per Q-PR.4-α α-1 LOCK +
Q-PR.4-ε ε-2 LOCK at `[PR-HARDENING-RUNBOOK-CLOSURE-PR.4-EXECUTE-VERIFY-AUTH]`.
Post-Gap-3 Production-Readiness Hardening Mini-Arc CLOSED at canonical-
state register substantively. PR.1 + PR.2 + PR.3 + PR.4 all LANDED.
Sub-arc 2 remains IN FLIGHT per Q-PR-δ + Q-PR-μ LOCK. Gap 4 / ADR-0044
may start after PR.4 lands per Q-PR-μ Option α LOCK.

## Context

ADR-0043 Gap 3 pgvector Embedding closed at G3.10 commit `08b10ef`
(2026-05-18). G3 mini-arc 10/10 complete. ADR-0043 Status flipped from
`Proposed 2026-05-17` to `Accepted 2026-05-18`. ADR-0035 §9 cluster
expanded 36 → 38 observations with the 37th D-VITEST-NPX-CONFIG-DEFAULT-
LOADS-PRODUCTION-SUPABASE + 38th D-LOCAL-DEV-ENV-CROSS-LANGUAGE-
OWNERSHIP-DRIFT promotions canonical at substrate-build register
substantively per Founder Q-G3.10-ε LOCK Option α.

Sub-arc 2 remains IN FLIGHT pending Gap 4 (ADR-0044 Decay Execution
Formalization) + Gap 5 (ADR-0045 Capsule-Level Staleness Detection) +
optional Gap 6 (ADR-0046 AI_AGENT EntityType-Discriminated Capsule
Routing) + later Sub-arc 2 closure cascade per ADR-0041 CL.1 scope
patch register substantively. ADR-0044 / ADR-0045 / ADR-0046 forward-
substrate reservations are load-bearing across ~78 cross-references at
7 files canonical at canonical-state register substantively at HEAD
`08b10ef`; the patent-implementation evidence lineage at ADR-0041
umbrella per ADR-0020 two-register IP discipline depends on these
reservations remaining stable.

The 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-
SUPABASE is a **live-production safety boundary**: bare `npx vitest
run <file>` invocations route through `vitest.config.ts` which loads
`.env` and points focused tests at production Supabase pooler
`aws-1-us-east-2.pooler.supabase.com:6543`. Recurrence-1 surfaced at
G3.9 Tier 2 (2026-05-18); production schema rejected the test inserts
before any data was written, but the substrate-trap is canonical at
canonical-prose register substantively (Drift G4-A acknowledged at
`vitest.unit.config.ts:13-19`) yet unenforced at canonical-execution
register substantively. The 38th observation D-LOCAL-DEV-ENV-CROSS-
LANGUAGE-OWNERSHIP-DRIFT captures recurrence-3 of the local-
development environment + cross-language data ownership boundary
pattern per ADR-0033 §Decision 7 + Q-5BII-EXEC-5 (Prisma owns shared-
table DDL; Ecto owns Elixir-internal DDL).

Gap 3 production substrate is functionally complete + privacy-protected
at substrate-build register substantively (G3.6 SimilarityService 6
RULE 0 SQL-tier filters + G3.9 production-contract integration tests
J5-J8 prove end-to-end ADD+UPDATE roundtrip + RULE 0 joint adversarial
fixture + NULL graceful exclusion under real HNSW). However the
production deployment runbook is missing, cross-environment parity is
only Supabase-verified (AWS RDS + self-hosted untested at canonical-
execution register substantively), and the local-development substrate-
build discipline must mirror CI canonical at canonical-execution
register substantively to prevent recurrence.

Foundation is pre-launch (no live customers); however the operator's
`.env` `DATABASE_URL` resolves to a production Supabase pooler, and
ADR-0037 jurisdiction tagging substrate is NOT YET deployed to that
production target (G3.9 Tier 2 surface). Cross-environment parity must
be verified read-only before any live-production claim canonical at
canonical-coherence register substantively per RULE 0 production-safety
boundary.

This ADR canonicalizes a 4-sub-phase Post-Gap-3 Production-Readiness
Hardening Mini-Arc PR.1-PR.4 to harden the Foundation substrate as an
enterprise/government-grade production-bound surface BEFORE Sub-arc 2
Gap 4 begins per Founder Q-PR-μ LOCK Option α discipline.

## Governing RULES

This mini-arc is governed by RULE 0 + RULE 11 + RULE 12 + RULE 13 +
RULE 20 + RULE 21 canonical per CLAUDE.md operating manual.

- **RULE 0** — Humans Always Sovereign (Foundation Rule). No
  production Supabase writes during tests; no secret exposure in commit
  bodies / docs / logs / audit details; no vector / embedding /
  distance / audit metadata leakage in HTTP responses or audit
  records. Patent-implementation evidence preserved per ADR-0020.

- **RULE 11** — Wider Knowledge Check for Elixir/BEAM Substrate +
  Prisma/Ecto cross-language data ownership boundary remains explicit
  per ADR-0033 §Decision 7 + Q-5BII-EXEC-5. Prisma owns shared-table
  DDL; Ecto owns Elixir-internal DDL. Broader canonical-pattern
  research before authorizing cross-language fixes.

- **RULE 12** — Pre-flight grep before drafting. All claims grep /
  repo-evidence grounded. Substrate-state ground truth verified at
  file/line register substantively before V1 paste authoring.

- **RULE 13** — Surface substrate traps + uncertainty inline. Never
  silently fix or normalize them. The PR.1 Hawkseye surfaced D-PR.1-
  ADR-NUMBERING-FORWARD-SUBSTRATE-RESERVATION-CASCADE-IMPACT as a
  ~78-reference renumbering cascade risk; Founder Q-PR-κ amended to
  Option γ (ADR-0047) at canonical-execution register substantively
  per RULE 13 substrate-honest discipline + RULE 20 Founder amendment
  authority.

- **RULE 20** — Rule-Modification Authority (Founder-only). Founder
  authorization required BEFORE any edit, staging, commit, push, OR
  production-affecting action. AI assistant surfaces proposals; Founder
  lands. Production-deploy-pipeline-affecting decisions require
  explicit Founder authorization separate from in-repo edits.

- **RULE 21** — Pre-Authorization Research Arc. Current source / repo
  inspection at canonical-knowledge register substantively REQUIRED
  before architecture / build recommendations. Cross-language /
  external-library / wire-format / substrate-architectural pastes
  require evidence citations embedded in authorization paste body at
  canonical-prose register substantively. This ADR's §Context register
  embeds the substrate-state ground truth canonical at HEAD `08b10ef`.

## Decision

Run a compressed 4-sub-phase Post-Gap-3 Production-Readiness Hardening
Mini-Arc PR.1-PR.4 per Founder Q-PR-α LOCK Option α + Q-PR-β LOCK
Option β. This is a **production-safety hardening arc**, NOT a
convenience cleanup, per Founder QLOCK Mode section + the 37th + 38th
ADR-0035 §9 observations canonical at substrate-build register
substantively. The production-safety hardening arc framing is canonical
at canonical-rule register substantively: production-safety boundaries
are enforced at every sub-phase PR.1-PR.4 per RULE 0 + RULE 13 +
RULE 20 discipline. This mini-arc lands between Gap 3 closure (commit
`08b10ef`) and Gap 4 start; Gap 4 starts only after PR.4 lands per
Q-PR-μ LOCK Option α.

Mini-arc decomposition:

| Sub-phase | Tag | Authorized scope | Status |
|-----------|-----|------------------|--------|
| **PR.1** | `[PR-HARDENING-ADR]` | 4 MOD + 1 NEW docs-only (this commit creates ADR-0047 Proposed) | this commit |
| **PR.2** | `[PR-VITEST-CONFIG-HARDENING]` | substantive `vitest.config.ts` fail-closed default + NEW guard unit test | forward-substrate |
| **PR.3** | `[PR-LOCAL-DB-AND-PARITY-HARDENING]` | substantive NEW `scripts/local-test-db-refresh.sh` + NEW read-only production parity verification script + docs | forward-substrate |
| **PR.4** | `[PR-HARDENING-RUNBOOK-CLOSURE]` | NEW `docs/operations/deployment-runbook.md` + closure cascade + Status → Accepted | forward-substrate |

## Sub-decisions

### Sub-decision 1: Hardening mini-arc disposition (Q-PR-α LOCK Option α)

Run pre-Gap-4 hardening mini-arc. Rationale: Gap 3 is closed but
production-readiness hardening must happen before adding Gap 4 decay
complexity. The vitest production-Supabase trap is a live-production
safety boundary canonical at canonical-rule register substantively per
RULE 0, not a cosmetic issue. Local-dev / cross-language ownership
drift should be encoded before more Sub-arc 2 substrate accumulates
per RULE 13 substrate-honest discipline.

### Sub-decision 2: Compressed 4-sub-phase decomposition (Q-PR-β LOCK Option β)

Compressed 4-sub-phase decomposition PR.1-PR.4 selected over the
6-sub-phase shape. Rationale: smallest safe production-readiness path
canonical at canonical-execution register substantively; preserves
substrate-build discipline tempo between Gap 3 closure and Gap 4 start.
PR.1 preflight to be revisited at PR.2 if compression proves unsafe
canonical at substrate-build register substantively per Q-PR-β LOCK
explicit clause.

### Sub-decision 3: Vitest config hardening (Q-PR-γ LOCK Option α)

PR.2 substantive landing scope: fail-closed `vitest.config.ts` default
+ NEW guard unit test. `vitest.config.ts` must fail closed against
production Supabase by default. Default local/test execution must load
`.env.test` or require explicit safe config. Production-target test
execution must require an explicit opt-in flag such as
`ALLOW_PROD_TEST_ENV=1`. NEW guard test proving test runs do not use
production `DATABASE_URL` by default. No secret values may be printed
in logs / docs / commit bodies canonical at canonical-rule register
substantively per RULE 0.

### Sub-decision 4: Local DB refresh + production parity verifier (Q-PR-δ + Q-PR-ε LOCK Option α)

PR.3 substantive landing scope: NEW `scripts/local-test-db-refresh.sh`
+ NEW read-only production parity verification script.

The local refresh script encodes the canonical 7-step refresh sequence
from ADR-0035 §9 38th observation:

1. (Pre-condition) Postgres container running on `localhost:5433`
2. Drop Ecto-owned tables (`schema_migrations` + `idempotency_keys`
   per ADR-0033 §Decision Q-5BII-EXEC-5)
3. `npx tsx scripts/apply-pgvector-extension.ts`
4. `npm run db:push:test` (ADR-0025 schema-push-target wrapper)
5. Apply audit triggers per ADR-0002
6. `npx tsx scripts/apply-hnsw-index.ts`
7. `MIX_ENV=test mix ecto.migrate` (restores Ecto-owned tables)

The local refresh script must be localhost/test-only and must fail
closed if `DATABASE_URL` is not local/test canonical at canonical-rule
register substantively per RULE 0.

The production parity verification script is read-only. It must never
mutate production. It must not print secrets. It must report drift
inventory only. Any production migration / deploy remains separate and
requires explicit Founder deployment authorization per ADR-0025 +
RULE 20.

Prisma/Ecto ownership boundaries preserved per RULE 11 + ADR-0033
§Decision 7 + Q-5BII-EXEC-5: Prisma owns shared-table DDL; Ecto owns
Elixir-internal DDL.

### Sub-decision 5: CI label freshness deferral (Q-PR-ζ LOCK Option α)

CI job labels at `.github/workflows/ci.yml` ("Unit tier (371 tests)"
+ "Integration tier (111 tests + 1 skipped)") are stale relative to
actual baselines (552 unit + 211 + 1 skipped integration). LOW
severity; not a production-safety blocker; deferred past Sub-arc 2
canonical at canonical-state register substantively.

### Sub-decision 6: TS baseline 12 deferral (Q-PR-η LOCK Option α)

12 known TS errors at the strict baseline per ADR-0015 Decision B.
11 of 12 are NOT production-blocking; 1 of 12 (`monetization.service.ts:30`
PRICING_TABLE incomplete) is INTENTIONAL deliberate-blocker per
ADR-0021 §Capsule Type Extension Protocol. Baseline preserved + CI-
enforced. Not a Gap 4 blocker. TS-reduction arc deferred to separate
later mini-arc canonical at canonical-state register substantively.

### Sub-decision 7: pgvector_ex naming drift deferral (Q-PR-θ LOCK Option α)

ADR-0043 §Q-G3-θ references `pgvector_ex` (Hex package; old name).
Canonical Elixir Hex package is `pgvector` (current name). G3.8
deliberately excluded Elixir vector access (β-A LOCK). Cosmetic
drift; deferred to α-3 future Elixir vector implementation if/when
authorized canonical at canonical-state register substantively.

### Sub-decision 8: Deployment runbook (Q-PR-ι LOCK Option α)

PR.4 substantive landing scope: NEW
`docs/operations/deployment-runbook.md`. Required content canonical at
canonical-prose register substantively:

- Gap 3 deploy order: pgvector extension → Prisma schema push /
  migration discipline → audit triggers → HNSW index → Ecto
  migrations → verification gates
- Rollback posture (column drop + index drop + audit row preservation
  per ADR-0002 + ADR-0010 audit-chain immutability)
- Parity checks (cross-environment per ADR-0018 — Supabase + AWS RDS
  + self-hosted notes where applicable)
- Secret-handling discipline (env-file scoping; no commit-body
  exposure; ADR-0019 cryptographic-suite posture for in-flight secret
  protection)
- No-production-write test discipline (PR.2 vitest hardening
  enforcement at canonical-execution register substantively)
- OpenAI embedding provider failure / degradation expectations (G3.4
  EmbeddingResult discriminated union 5 error_class; G3.5 degrade-on-
  failure RULE 0 discipline)
- Supabase / RDS / self-hosted notes where applicable per ADR-0018
  deployment-target agnosticism posture

### Sub-decision 9: ADR numbering — ADR-0047 selected (Q-PR-κ amended Option γ)

Founder Q-PR-κ originally LOCKED Option α (ADR-0044 for hardening +
shift Gap 4 → ADR-0045 + Gap 5 → ADR-0046 + Gap 6 → ADR-0047). PR.1
Hawkseye preflight surfaced D-PR.1-ADR-NUMBERING-FORWARD-SUBSTRATE-
RESERVATION-CASCADE-IMPACT per RULE 13 substrate-honest discipline:
~78 cross-references to ADR-0044 / ADR-0045 / ADR-0046 across 7 files
canonical at canonical-state register substantively at HEAD `08b10ef`;
forward-substrate references are load-bearing per ADR-0020 patent-
implementation evidence lineage.

Founder amended Q-PR-κ to Option γ per
`[Q-PR-κ-AMENDMENT-OPTION-γ]` (this commit register substantively).
**ADR-0047 selected for hardening**. Gap 4 (ADR-0044) + Gap 5
(ADR-0045) + optional Gap 6 (ADR-0046) forward-substrate reservations
**preserved**. Zero existing cross-references modified at PR.1; only
NEW ADR-0047 references added per RULE 14 bidirectional citation
discipline.

### Sub-decision 10: Pre-launch mandatory gate (Q-PR-λ LOCK Option β)

Pre-launch mandatory gate compressed for 4-sub-phase arc:

- **PR.2** Vitest config hardening (mandatory before live launch;
  closes Drift G4-A live-production safety boundary)
- **PR.3** production parity verification path (mandatory before live
  launch; verifies cross-environment schema drift inventory)
- **PR.4** deployment runbook + closure (mandatory before live launch;
  documented deploy / rollback / parity posture)

Before any live-production claim, all three must be landed canonical
at canonical-state register substantively per RULE 0 production-
safety boundary discipline.

### Sub-decision 11: Sub-arc 2 continuation discipline (Q-PR-μ LOCK Option α)

Gap 4 starts ONLY after PR.4 lands canonical at canonical-state
register substantively. No parallel Gap 4 work during hardening unless
Founder explicitly authorizes a separate exception per RULE 20.

## Consequences

### Positive

- Live-production safety boundary closed at canonical-execution
  register substantively per RULE 0 (PR.2)
- Local-development substrate-build discipline mirrors CI canonical at
  canonical-execution register substantively (PR.3)
- Production parity drift inventory available pre-launch (PR.3)
- Deployment runbook canonical at canonical-prose register
  substantively (PR.4)
- Patent-implementation evidence lineage preserved at ADR-0041
  umbrella canonical at canonical-state register substantively per
  ADR-0020 (Q-PR-κ amended Option γ)
- 4-sub-phase decomposition minimizes time between Gap 3 closure and
  Gap 4 start

### Negative

- Adds 4 commits between Gap 3 closure and Gap 4 start (~5-7 days
  before Gap 4 begins)
- ADR catalog grows by 1 entry (ADR-0047)
- ADR-0035 §9 cluster may grow further at PR.4 closure if substrate-
  state observations promote (deferred to PR.4 disposition)

### Neutral

- Sub-arc 2 status field remains IN FLIGHT throughout the hardening
  mini-arc per Q-PR-δ + Q-PR-μ LOCK
- ADR-0043 Status preserved as Accepted 2026-05-18 throughout
- No production code / schema / test / CI / package / Elixir / audit
  changes at PR.1 per Q-PR-η LOCK + Q-PR-κ Option γ minimum-touch

## Alternatives Considered

### Option α — ADR-0044 for hardening + Gap 4/5/6 renumbering cascade

Original Founder Q-PR-κ LOCK. Required ~78 cross-reference updates
across 7 files (Gap 4 → 0045; Gap 5 → 0046; Gap 6 → 0047). Substantial
docs churn; rewrites patent-implementation lineage at canonical-state
register substantively at ADR-0041 umbrella + 6 other files. PR.1
Hawkseye surfaced this per RULE 13. Founder amended to Option γ per
patent-implementation lineage preservation discipline. **Rejected**.

### Option β — ADR-0050 for hardening

Leapfrog past ADR-0047 to reserve 0047 / 0048 / 0049 for potential
intermediate sub-arc work. Acceptable but adds no operational benefit
over Option γ. **Considered + Rejected** (Founder LOCKed γ).

### Option γ — ADR-0047 for hardening (SELECTED)

Sequential next-free number after ADR-0046 (optional Gap 6
reservation). Zero existing cross-references modified at PR.1. NEW
ADR-0047 references ADDED per RULE 14 bidirectional citation
discipline. Lowest churn. Patent-implementation lineage preserved at
ADR-0041 umbrella canonical at canonical-state register substantively.

### Option δ — ADR-0044 for hardening + leave Gap 4/5/6 forward-substrate refs as "stale"

Substrate-dishonest per RULE 13. **NOT VIABLE**. Violates patent-
implementation evidence discipline per ADR-0020.

## References

- **RULE 0** — Humans Always Sovereign (CLAUDE.md L130-150)
- **RULE 11** — Wider Knowledge Check for Elixir/BEAM Substrate
  (CLAUDE.md L210-238)
- **RULE 12** — Pre-Flight Grep Before Drafting (CLAUDE.md L255-265)
- **RULE 13** — Surface Drifts Inline Over Silent Fix (CLAUDE.md
  L267-282)
- **RULE 20** — Rule-Modification Authority (CLAUDE.md L350-395)
- **RULE 21** — Pre-Authorization Research Arc for Substrate-
  Architectural Pastes (CLAUDE.md L397-470)
- **ADR-0002** — Append-Only Audit Chain with BEFORE DELETE Trigger
- **ADR-0010** — Foundation Tests Are Legitimately Slow
- **ADR-0011** — Three-Tier Test Stratification (Drift G4-A
  acknowledgment at `vitest.unit.config.ts:13-19`)
- **ADR-0013** — Containerized Postgres for Unit and Integration Tiers
- **ADR-0015** — CI Workflow Architecture
- **ADR-0018** — Deployment-Target Agnosticism Posture
- **ADR-0019** — Cryptographic-Suite Posture
- **ADR-0020** — Two-Register IP Discipline (patent-implementation
  evidence lineage discipline; preserves ADR-0044 / ADR-0045 / ADR-0046
  forward-substrate reservations)
- **ADR-0021** — Capsule Type Extension Protocol (PRICING_TABLE
  deliberate-blocker context for Q-PR-η TS baseline deferral)
- **ADR-0025** — Schema-Push-Target Discipline (`scripts/prisma-db-
  push-test.sh` wrapper; production schema changes go through deploy
  pipeline, not via db push)
- **ADR-0027** — Contributor Governance + AI-Alignment + Rule-
  Modification Authority
- **ADR-0033** — BEAM Persistence + Idempotency + Audit-Chain
  Cryptographic Substrate Architecture (§Decision 7 + §Q-5BII-EXEC-5
  cross-language data ownership boundary canonical)
- **ADR-0035** — Substrate-Build Discipline Canonical (§9 cluster
  37th D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE + 38th
  D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT observations)
- **ADR-0037** — Jurisdiction Tagging Architecture for Entity /
  MemoryCapsule / AuditEvent / OrgSettings (production Supabase
  schema parity context for PR.3 verifier)
- **ADR-0041** — Capsule Layer Substrate Umbrella (parent forward-
  substrate at ADR-0044 / ADR-0045 / ADR-0046 reservations canonical
  at canonical-state register substantively)
- **ADR-0043** — pgvector Embedding (closure parent register
  substantively; Accepted 2026-05-18)
- **ADR-0044** — Gap 4 Decay Execution Formalization (forward-substrate
  reservation **preserved** at canonical-state register substantively)
- **ADR-0045** — Gap 5 Capsule-Level Staleness Detection (forward-
  substrate reservation **preserved** at canonical-state register
  substantively)
- **ADR-0046** — optional Gap 6 AI_AGENT EntityType-Discriminated
  Capsule Routing (forward-substrate reservation **preserved** at
  canonical-state register substantively)
- Patent **US 12,517,919** (COSMP)
- Patent **US 12,164,537** (DMW)
- Patent **US 12,399,904** (Foundation primitives)

## Founder Authorization

Founder authorization explicit at PR.1 substantive landing per RULE 20
at `[POST-GAP-3-PRODUCTION-READINESS-HARDENING-QLOCK]` +
`[Q-PR-κ-AMENDMENT-OPTION-γ]` +
`[PR-HARDENING-ADR-PR.1-EXECUTE-VERIFY-AUTH]`.

## Implementation Lineage (forward-substrate)

| Sub-phase | Tag | Authorized scope | Status |
|-----------|-----|------------------|--------|
| PR.1 | `[PR-HARDENING-ADR]` | 4 MOD + 1 NEW docs-only (this commit creates ADR-0047) | this commit |
| PR.2 | `[PR-VITEST-CONFIG-HARDENING]` | substantive `vitest.config.ts` fail-closed + NEW guard test | forward-substrate |
| PR.3 | `[PR-LOCAL-DB-AND-PARITY-HARDENING]` | substantive 2 NEW scripts + docs | forward-substrate |
| PR.4 | `[PR-HARDENING-RUNBOOK-CLOSURE]` | NEW `docs/operations/deployment-runbook.md` + closure cascade + Status → Accepted | forward-substrate |

Status flipped from `Proposed 2026-05-18` to `Accepted 2026-05-18` at
PR.4 closure cascade canonical at canonical-state register
substantively (this commit).

## PR.2 LANDED — Fail-Closed vitest.config.ts + Guard Test (2026-05-18)

PR.2 `[PR-VITEST-CONFIG-HARDENING]` LANDED 2026-05-18 at commit
`57edb3b54658f28349e0f34d5346e76a1888be42`. Substantive 1 MOD + 1 NEW
landing per Founder Q-PR.2-α α-1 + Q-PR.2-β literal-"1" + Q-PR.2-γ
leave-package.json + Q-PR.2-δ + Q-PR.2-ε 5-it-blocks + Q-PR.2-ζ
no-docs + Q-PR.2-η 1 MOD + 1 NEW LOCKS at
`[PR-HARDENING-VITEST-CONFIG-PR.2-QLOCK]`.

**ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-
PRODUCTION-SUPABASE CLOSED at canonical-execution register
substantively** at PR.2 commit `57edb3b`.

Substrate landed:

- MOD `vitest.config.ts` — hardened fail-closed default. Default path
  loads `.env.test` (containerized localhost:5433 Postgres test DB
  per ADR-0013). Opt-in path loads `.env` ONLY when
  `ALLOW_PROD_TEST_ENV === "1"` (literal string "1"). DATABASE_URL
  host validation via `extractHost()` + `new URL(url).hostname`;
  refuses non-local hosts with hostname-only error message. Error
  message contains hostname only; NEVER credentials per RULE 0
  secret-exposure boundary.
- NEW `tests/unit/test-env-config-safety.test.ts` — 5 named-block
  guard tests: (1) NODE_ENV=test; (2) DATABASE_URL defined; (3) host
  is localhost/127.0.0.1/::1; (4) host is NOT a production Supabase
  pooler; (5) guard test runs under tier config which loads
  `.env.test`. Privacy discipline: only hostname extracted and
  asserted; full URL never logged.

T2.8 runtime probe proof at PR.2 PRE-STAGE substantively verified
the RULE 0 boundary: fake credentials (`fake-user`, `fake-pass`,
fake-db) NEVER appeared in error output; only hostname
`aws-1-us-east-2.pooler.supabase.com` (public DNS info) appeared.

Cosmp_router default tier + unit + integration baselines preserved.
Full unit tier 552 → 557 (552 baseline + 5 NEW guard tests).

## PR.3 LANDED — Local Refresh + Read-Only Parity Verifier (2026-05-18)

PR.3 `[PR-LOCAL-DB-AND-PARITY-HARDENING]` LANDED 2026-05-18 at commit
`bb261265dba1408dc44130b1efe599638705ac75`. Substantive 2 NEW + 0 MOD
landing per Founder Q-PR.3-α α-1 + Q-PR.3-β β-4 + Q-PR.3-γ γ-1 +
Q-PR.3-δ δ-1 + Q-PR.3-ε ε-1 + Q-PR.3-ζ 11-check + Q-PR.3-η stdout +
exit codes + Q-PR.3-θ no-package.json + Q-PR.3-ι no-docs + Q-PR.3-κ
2 NEW + 0 MOD LOCKS at `[PR-HARDENING-LOCAL-DB-AND-PARITY-PR.3-QLOCK]`.

**ADR-0035 §9 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-
OWNERSHIP-DRIFT CLOSED at canonical-execution register substantively**
at PR.3 commit `bb26126`. Read-only production parity verification
path added per ADR-0047 Sub-decision 4.

Substrate landed:

- NEW `scripts/local-test-db-refresh.sh` — canonical local refresh
  wrapper. Fail-closed validation at host (localhost/127.0.0.1) +
  database (`foundation_test`) + port (5433) per β-4 LOCK. Drops
  ONLY Ecto-owned tables (`schema_migrations` + `idempotency_keys`
  per ADR-0033 §Q-5BII-EXEC-5); Prisma-owned shared tables NEVER
  touched (RULE 11 boundary). Chains 5 canonical scripts:
  `apply-pgvector-extension.ts` + `prisma-db-push-test.sh` (via
  `npm run db:push:test`) + `apply-audit-triggers.ts` +
  `apply-hnsw-index.ts` + `MIX_ENV=test mix ecto.migrate`. Supports
  `--help` (usage + ADR/RULE citations) + `--dry-run` (skips all
  DB-touching commands). Never prints full DATABASE_URL; only
  host/db/port.

- NEW `scripts/verify-production-parity.ts` — read-only parity
  verifier. Requires `PARITY_DATABASE_URL` explicitly (Q-PR-ε α
  LOCK); NEVER falls back to `DATABASE_URL`; NEVER loads `.env`.
  Refuses localhost unless `ALLOW_LOCAL_PARITY_CHECK=1` set
  explicitly (defense-in-depth). Uses
  `new PrismaClient({ datasourceUrl: PARITY_DATABASE_URL })` Prisma
  6.19.3 canonical override pattern. READ-ONLY `$queryRawUnsafe` with
  `information_schema` / `pg_extension` / `pg_indexes` / `pg_trigger`
  / `pg_tables` SELECT queries ONLY. ZERO `$executeRaw` invocations;
  ZERO Prisma mutation verbs. Supports `--help` + `--dry-run`.
  Warning banner: production migration / deploy requires SEPARATE
  Founder authorization per ADR-0025 + RULE 20. Exit codes 0 (no
  drift) / 1 (config or runtime error) / 2 (drift found). 11 checks:
  4 jurisdiction columns (ADR-0037) + mutation_type (ADR-0042) +
  embedding (ADR-0043) + pgvector + HNSW (ADR-0043) + 2 audit
  triggers (ADR-0002) + idempotency_keys (INFORMATIONAL; ADR-0033).

T2.6 runtime probe proof at PR.3 PRE-STAGE substantively verified
the RULE 0 boundary: fake credentials (`fake-user`, `fake-pass`,
`fake-db`) NEVER appeared in error output; only `host=fake-host.example.com
database=fake-db port=5432` (public DNS info + db-name + port)
appeared.

## PR.4 LANDED — Deployment Runbook + Closure Cascade (2026-05-18)

PR.4 `[PR-HARDENING-RUNBOOK-CLOSURE]` LANDED 2026-05-18 at this
commit. Docs-only closure cascade per Founder Q-PR.4-α α-1 + Q-PR.4-β
β-1 + Q-PR.4-γ γ-1 + Q-PR.4-δ δ-1 + Q-PR.4-ε ε-2 + Q-PR.4-ζ ζ-1 +
Q-PR.4-η η-1 LOCKS at `[PR-HARDENING-RUNBOOK-CLOSURE-PR.4-QLOCK]`.

**ADR-0047 Status flipped from `Proposed 2026-05-18` to `Accepted
2026-05-18` at this commit.** Post-Gap-3 Production-Readiness
Hardening Mini-Arc CLOSED at canonical-state register substantively.
6 MOD + 1 NEW.

Substrate landed:

- NEW `docs/operations/deployment-runbook.md` — full production-
  readiness deployment runbook per Q-PR.4-δ δ-1 LOCK + ADR-0047
  §Sub-decision 8 (Q-PR-ι Option α LOCK). 13 required sections:
  FILE/PURPOSE/CONNECTS TO header + Scope and non-goals + Absolute
  safety boundaries + Environment classes + Pre-deploy verification
  + Local test DB refresh + Production/staging parity verification
  + Gap 3 deploy order + OpenAI embedding provider + Runtime
  verification + Rollback posture + Observability + Launch checklist
  + post-launch monitoring + known deferrals.
- MOD this `docs/architecture/decisions/0047-production-readiness-
  hardening.md` — Status `Proposed 2026-05-18` → `Accepted 2026-05-18`
  + this PR.2 H2 + PR.3 H2 + PR.4 H2 + Post-Closure Implementation
  Lineage H2.
- MOD `docs/reference/section-12-progress.md` — Hardening Mini-Arc
  row Status IN FLIGHT → CLOSED + PR.2 + PR.3 + PR.4 LANDED prose +
  Gap 4 readiness statement per Q-PR-μ LOCK Option α.
- MOD `docs/CURRENT_BUILD_STATE.md` — H2 visibility update CLOSED
  2026-05-18 at PR.4 + NEW PR.2 H4 + NEW PR.3 H4 + NEW PR.4 H4.
- MOD `docs/architecture/README.md` — ADR-0047 catalog parenthetical
  Status Proposed → Accepted + PR.2/PR.3/PR.4 closure prose.
- MOD `CLAUDE.md` — ADR-0047 catalog mirror Status Proposed →
  Accepted + PR.2/PR.3/PR.4 closure prose.
- MOD `docs/architecture/decisions/0035-substrate-build-discipline-
  canonical.md` — RULE 14 back-citation footers at 37th + 38th
  observations per Q-PR.4-β β-1 LOCK. Preserves observation bodies
  verbatim; appends light "Resolved by ADR-0047 PR.2 commit `57edb3b`"
  + "Resolved by ADR-0047 PR.3 commit `bb26126`" notes.

Per Q-PR.4-γ γ-1 LOCK: in-arc PR.1/PR.2/PR.3 RULE 13 observations
(D-PR.1-ADR-NUMBERING-FORWARD-SUBSTRATE-RESERVATION-CASCADE-IMPACT +
D-PR.2-VERIFIER-GATE-20-REGEX-LITERAL-DOT-ESCAPING + D-PR.3-VERIFIER-
GATE-27-NEGATIVE-CONTEXT-DOCUMENTATION-FALSE-POSITIVE) remain
commit-body-only at canonical-state register substantively (NOT
promoted to ADR-0035 §9 cluster at PR.4).

**Sub-arc 2 status field remains IN FLIGHT** per Q-PR-δ + Q-PR-ι +
Q-PR.4-α LOCK. Sub-arc 2 closure cascade forward-substrate pending
Gap 4 + Gap 5 + optional Gap 6 + later Sub-arc 2 closure cascade per
ADR-0041 CL.1 scope patch register substantively.

**Gap 4 / ADR-0044 may start after PR.4 lands** per Q-PR-μ Option α
LOCK + Q-PR.4-η η-1 LOCK. The hardening mini-arc closure cascade at
PR.4 satisfies the pre-launch mandatory gate per Q-PR-λ Option β
LOCK (PR.2 vitest hardening + PR.3 production parity verifier + PR.4
deployment runbook all LANDED).

## Post-Closure Implementation Lineage

ADR-0047 Post-Gap-3 Production-Readiness Hardening Mini-Arc lineage
canonical at canonical-execution register substantively per ADR-0020
two-register IP discipline. 4-sub-phase compressed mini-arc
decomposition per Q-PR-β LOCK Option β.

| Sub-phase | Commit SHA | Tag + verbatim subject |
|-----------|------------|------------------------|
| PR.1 | `b478191` | `[PR-HARDENING-ADR]` PR.1: ADR-0047 NEW Proposed — Post-Gap-3 Production-Readiness Hardening |
| PR.2 | `57edb3b` | `[PR-VITEST-CONFIG-HARDENING]` PR.2: fail-closed vitest.config.ts + guard test (closes ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-SUPABASE) |
| PR.3 | `bb26126` | `[PR-LOCAL-DB-AND-PARITY-HARDENING]` PR.3: local refresh + read-only parity verifier (closes ADR-0035 §9 38th observation) |
| PR.4 | this commit | `[PR-HARDENING-RUNBOOK-CLOSURE]` PR.4: deployment runbook + ADR-0047 Accepted; hardening mini-arc CLOSED |

**Post-Gap-3 Production-Readiness Hardening Mini-Arc CLOSED at
canonical-state register substantively at PR.4.** Mini-arc 4/4
complete. ADR-0047 Status `Accepted 2026-05-18`. Sub-arc 2 closure
cascade forward-substrate per ADR-0041 CL.1 scope patch register
substantively. Gap 4 / ADR-0044 Decay Execution Formalization may
start after PR.4 lands per Q-PR-μ LOCK Option α.
