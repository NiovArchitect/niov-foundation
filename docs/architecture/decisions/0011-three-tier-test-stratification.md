# ADR-0011: Three-tier test stratification

## Status

Proposed 2026-05-06 (Track A architectural lock; will move to
Accepted when the Track A architectural-lock commit lands)

## Context

ADR-0010 documents the problem: 90-110 minute full-suite
runtime from real Supabase + real LLM calls. Every verification
cycle pays this tax; sub-box-scale work like Section 12.5
Sub-box 1's dual-control middleware iteration is prohibitively
slow.

Two constraints shape the solution. Real-stack coverage catches
real bugs — eliminating real calls suite-wide would lose the
verification value ADR-0010 protects (the "Mock everything"
alternative was rejected there). And the existing 482-test
surface is not uniformly slow: most tests don't need real LLM
behavior, and a unit/integration split already exists in the
directory layout.

The solution: stratify into three tiers with gating tuned to
each tier's cost. ADR-0010 gestured at this; this ADR locks
tier definitions, the classification rule, and gating
discipline. ADR-0012 specifies the mock LLM; ADR-0013 specifies
containerized Postgres. All three land in the same
architectural-lock commit.

## Decision

Foundation adopts three named test tiers:

- **Unit tier (`tests/unit/`).** Containerized Postgres + the
  hardened mock LLM (per ADR-0012). Target full-suite runtime:
  **under 60 seconds.** Runs on save during development.
- **Integration tier (`tests/integration/`).** Containerized
  Postgres + the hardened mock LLM. Exercises HTTP round-trips
  via Fastify's `inject()`. Target full-suite runtime:
  **under 10 minutes.** Runs on commit-staging and on every PR
  + push to main via CI.
- **Real-LLM tier (`tests/real-llm/`).** Real Supabase + real
  LLM provider. Target runtime unchanged at 90-110 minutes.
  Runs nightly via CI schedule and on pre-release tags via
  `workflow_dispatch`.

**Classification rule.** A test belongs to exactly one tier:

1. If the test asserts on behavior the mock LLM cannot
   meaningfully simulate (real 429 retry, real token counting,
   real provider error shape) → **real-LLM tier**.
2. Else if it exercises an HTTP round-trip via `buildApp` +
   `app.inject` → **integration tier**.
3. Else → **unit tier**.

Examples: `tests/unit/llm.test.ts` (mocked breaker, injected
clock) is unit (rule 3); integration HTTP + MockLLMProvider is
integration (rule 2); a real-Anthropic-429 breaker test is
real-LLM (rule 1).

**Gating discipline:**

- **Unit tier failure** blocks local save-to-stage (developers
  run `npm run test:unit` before staging).
- **Integration tier failure** blocks the commit (CI runs
  `npm run test:integration` on every PR + push to `main`).
- **Real-LLM tier failure** blocks pre-release tag promotion
  (CI runs `npm run test:real-llm` nightly + on
  `workflow_dispatch`; nightly failures open an issue but
  don't block in-flight work; tag promotion blocks on failure).

**Tier upgrade discipline.** A test starts in its default tier
per the rule. If Gate 6 migration verification reveals a tier
mismatch, the author documents the reason in a comment block
at the top of the file and moves it. Edge-case judgment calls
commit their rationale alongside the test.

## Consequences

### Easier

- **Verification cycle drops from 90-110 minutes to <11 minutes
  for sub-box-scale work** (unit + integration tiers). Section
  12.5 Sub-box 1 iteration becomes feasible.
- **Feedback loop tightens.** Unit failures surface within 60
  seconds of save; developers fix in the same edit cycle.
- **CI cost goes down.** Integration tier pays no LLM API
  costs (hardened mock per ADR-0012); real-LLM tier runs once
  per 24 hours instead of once per push.
- **Test discipline scales.** The classification rule tells
  contributors which tier a new test belongs in without
  case-by-case design conversations.
- **Pre-release confidence preserved.** Real-LLM tier blocks
  tag promotion; production-bound code still gets full
  real-stack verification per ADR-0010.

### Harder

- **Edge-case classification requires judgment.** The rule
  covers 90%+ automatically; the remainder are judgment calls.
  Each judgment must be documented in a comment block at the
  top of the affected test file so the rationale is recoverable
  during re-evaluation.
- **Migration of 482 existing tests has cost.** Track A Gates
  5 and 6 carry this work. At least one test
  (`tests/unit/monetization.test.ts`) is already misclassified
  under the rule (uses `buildApp` + `app.inject`); it migrates
  to integration tier as part of Gate 5.
- **Mock-vs-real-LLM drift is now a real bug class.** The
  hardened mock (ADR-0012) approximates real behavior; real-LLM
  nightly catches drift on a 24-hour lag.
- **Tier-specific vitest configs add maintenance surface.**
  Three new configs (`vitest.{unit,integration,real-llm}.config.ts`)
  plus existing `vitest.config.ts` retained for `npm test`
  backwards-compat.
- **Container runtime is now a developer-machine prerequisite.**
  New contributors install OrbStack (or Docker Desktop) per
  ADR-0013 before running tests.
- **CI from scratch.** Foundation has no `.github/workflows/`
  today; Track A creates the CI surface with this ADR's
  gating discipline driving the workflow shape.

## Alternatives Considered

### Two-tier (fast + nightly)

Conflates unit and integration. Unit tests would carry HTTP
round-trip overhead unnecessarily, and the distinction between
service-class versus HTTP testing would be lost. Rejected: the
split is real, already reflected in the directory layout, and
worth preserving (unit tests shouldn't depend on Fastify wiring).

### Speed-only optimization (parallelize the existing suite)

Rejected: parallelization against the shared Supabase test
schema produces fixture collision (ADR-0010 +
parallel-sessions.md §Test-Cycle Discipline), and the dominant
cost is real LLM latency anyway. Local Postgres + tier
stratification addresses the root cause; parallelization can
layer on later.

### Mock everything (eliminate real-LLM tier)

Fastest but loses real-stack catchment. Rejected: mock-vs-real
drift is a real bug class (429 retry, token counting, error
shape). Nightly real-LLM preserves catchment without paying it
every cycle. ADR-0010 already rejected this; preserved here.

### Per-test schema isolation (containerized Postgres per test)

More rigorous than per-suite but adds 200-500ms × 482 tests =
1.6-4 minutes of container startup overhead. Rejected;
`singleFork: true` already serializes tests against a single
Postgres instance, sufficient under per-suite containerization
(ADR-0013). Revisit if intra-tier parallelization becomes
desirable post-Track-A.

## References

- ADR-0010 (Foundation tests are legitimately slow) — problem
  statement; "Mock everything" rejection is the design constraint
- ADR-0012 (mock LLM hardening) — companion ADR; specifies
  the hardened mock
- ADR-0013 (containerized Postgres) — companion ADR; specifies
  container provisioning
- `docs/contributing/testing.md` — two tiers today; updated to
  three in Track A Gate 8
- `docs/contributing/parallel-sessions.md` §Test-Cycle Discipline
- `CLAUDE.md` RULE 15 — single-cycle test discipline
- `tests/unit/`, `tests/integration/` — current directories;
  `tests/real-llm/` introduced here

Bidirectional citations (cited from):

- ADR-0012, ADR-0013 (forward-cite for tier definitions)
- `docs/contributing/testing.md`, `CLAUDE.md` RULE 15
  (back-citations in Track A Gate 8)
- `docs/reference/architectural-anchors.md` — no anchor;
  tier-classification is discipline, not runtime invariant

## Amendment: Reproducibility Verification Evidence (Track A Gate 6)

Status: Active
Date: 2026-05-06
Trigger: Track A Gate 6 reproducibility verification gate

### Context

ADR-0011's three-tier stratification claims that each tier
produces deterministic behavior at its layer of real-data
fidelity. Reproducibility — pass-rate identity and runtime
bounded variance across consecutive runs — is the empirical
claim that makes stratification load-bearing for enterprise
and government compliance review. This amendment documents
the empirical evidence supporting the claim, captured during
Track A Gates 5 and 6 execution.

### Reproducibility Evidence

#### Unit + Integration Tier (test:all)

| Run | Date | Source | Pass Rate | Duration |
|-----|------|--------|-----------|----------|
| 1 | 2026-05-06 | G5.7 Step 4 | 481/482 (1 skipped) | 150.47s |
| 2 | 2026-05-06 | G5.7 Step 6 | 481/482 (1 skipped) | 154.15s |
| 3 | 2026-05-06 | Gate 6 Step 2 | 481/482 (1 skipped) | 147.98s |

Pass-rate identity: confirmed across all 3 runs (481 passing
+ 1 deliberate skip = 482 total).
Duration variance: ~4.1% (range 6.17s over mean 150.87s).
Skip preserved: 1 deliberate skip preserved across all runs.

#### Real-LLM Tier (test:real-llm)

| Run | Date | Source | Pass Rate | Duration | Anthropic Cost |
|-----|------|--------|-----------|----------|----------------|
| 1 | 2026-05-06 | G5.6 close | 2/2 | 12.58s | ~$0.013 |
| 2 | 2026-05-06 | G5.7 Step 5 | 2/2 | 13.59s | ~$0.013 |
| 3 | 2026-05-06 | Gate 6 Step 2 | 2/2 | 13.58s | ~$0.013 |

Pass-rate identity: confirmed across all 3 runs.
Duration variance: ~7.6% (range 1.01s over mean 13.25s).
Cost variance: bounded within Decision 4 budget (~$0.013/run).

### Determinism Properties Verified

- Pass-rate identity: 100% across all 3 formal runs at each tier
- Duration variance: bounded within ~4% (unit+integration) and
  ~8% (real-LLM, larger relative range explained by Anthropic
  API latency variance)
- No flaky failures observed
- 1 deliberate skip preserved across all runs
- TS error baseline: 12 errors unchanged across all runs
  (no new errors introduced by the verification cycles)

### Implications

- Three-tier stratification produces empirically-verified
  deterministic behavior, supporting enterprise/government
  compliance posture.
- Gate 7 (GitHub Actions workflow) will enforce this
  reproducibility automatically on every PR and nightly
  schedule.
- Future regressions in determinism (e.g., new flaky tests,
  new race conditions, unbounded latency growth) will surface
  within 24 hours of nightly invocation.
- The 12 baseline TS errors (from prior Track A work) remain
  unchanged, indicating no new issues introduced by the
  verification cycles themselves.

### Drift surfaced during Gate 6

**Drift G6-A — Cold-start container variance observation.**
During Gate 6 Step 2, `test:all` was executed twice. The first
execution returned a wallclock of 159.56s (Postgres container
freshly brought up via `npm run db:test:up` immediately
before); the second execution returned 147.98s (Postgres
container warmed from the first run). Including the 159.56s
observation alongside the 3 formal runs widens the
unit+integration tier variance to ~7.6% (range 11.58s over
mean 153.04s, n=4). The pass-rate identity at 481/482 was
confirmed indirectly via `test:all`'s short-circuit chain
semantics (`test:unit && test:integration` would not run
integration if unit failed; integration completed normally
with checkmarks).

This observation suggests cold-start container variance may
contribute meaningfully to wallclock spread on the FIRST run
after `db:test:up`. Statistical sample (n=3-4) is too small
to pin down distribution. Gate 7's CI workflow will accumulate
larger n over time and provide a tighter empirical bound;
this amendment's ~4% (formal, n=3) and ~8% (extended, n=4)
bounds should be re-validated then.

The 159.56s observation is recorded here for substrate-honesty
rather than excluded; future amendments may revise variance
bounds based on Gate 7's CI accumulation.
