# Testing

Test infrastructure conventions specific to niov-foundation.
Not a general vitest tutorial. The reader is assumed to have
read `docs/contributing/code-style.md` (this file does not
re-cover documentation blocks or naming conventions; it covers
how Foundation's tests are organized, what runtime to expect,
and how anchor tests work).

## The 90-110 Minute Reality

Foundation's full-suite test runtime is **90-110 minutes** when
exercising the real-LLM tier against real Supabase + real
Anthropic. This is not a bug; it is the design. See ADR-0010
(Foundation tests are legitimately slow) for the full rationale.

The runtime is real because the suite calls real Supabase and
(for some tiers) real LLM APIs. Mocking those layers would
defeat the verification gate — the audit chain integrity test
needs a real Postgres BEFORE DELETE trigger; the structured
logger redaction test needs the real Pino runtime; the
compliance-state read needs the real audit-event projection.

Track A three-tier stratification (per **ADR-0011**) cuts the
sub-box-scale verification cycle to **<11 minutes** by routing
unit + integration tests through containerized Postgres + a
hardened mock LLM (per ADR-0013 + ADR-0014); only the
real-LLM tier (`tests/real-llm/`) pays the full 90-110 minute
cost, and that tier runs on a nightly schedule rather than on
every edit cycle. See §Test Tiers below.

### Diagnostic patterns (healthy slow vs hung)

When in doubt about a long-running test process, the diagnostic
sequence from ADR-0010 distinguishes "slow but alive" from
"genuinely deadlocked":

```bash
ps -ef | grep vitest | grep -v grep            # process alive?
wc -l <log-file-path>                          # log growing?
sample <PID> 2 -mayDie | head -50              # libuv idle?
```

A healthy slow run shows a live PID, a continuously-growing
log file, and a `sample` output dominated by `uv__io_poll` /
`kevent` (libuv waiting on network). A genuine deadlock shows
the same PID with stalled log growth and a different
`sample` profile (no kevent, no progress).

### The pkill anti-pattern

**Do not `pkill` a running test process.** The 300-second
per-test timeout with 2 retries (configured in
`vitest.config.ts`) is intentional Supabase tail-latency
absorption. Pkilling a healthy run loses verification signal
and forces a full re-run. The misdiagnosis cost during
Section 12C.0 was high enough to justify ADR-0010; the
discipline is now committed substrate.

### Track A (closed; Gates 1-7)

Track A test infrastructure isolation **landed** across Gates
1 through 7 between 2026-05-05 and 2026-05-07. The closing
landmarks:

| Gate | SHA | Substrate landed |
|---|---|---|
| Track A Lock | `d728cd4` | ADRs 0011 / 0012 / 0013 |
| Gate 3a | `081d35e` | Containerized Postgres infrastructure |
| Gate 3 ADR | `2a14dec` | ADR-0014 supersedes ADR-0012 hash dispatch |
| Gate 3b | `16b4482` | FixtureBasedLLMProvider + 10 recorded fixtures |
| Gate 4 | `925761d` | Tier-specific vitest configs (~37× speedup) |
| Gate 5a | `c5c8b00` | Foundational substrate + monetization re-classification |
| Gate 5b | `9260c53` | Consumer adoption + real-LLM tier (483/484 tests across 3 tiers) |
| G5b-I | `fbc7942` | Reframe — recording script + test coverage gaps |
| Gate 6 | `cae8cf4` | Reproducibility verification (3-cycle determinism; ADR-0011 amendment) |
| Gate 7 | `78cf1b5` | CI workflow architecture (ADR-0015; 8 locked decisions A-H) |

The verification cycle for sub-box-scale work is now **<11
minutes** (unit + integration via containerized Postgres +
hardened mock LLM). The 90-110 minute reality remains for
the nightly real-LLM tier and any operator-triggered
`workflow_dispatch` runs.

## Test Tiers

Three tiers are LIVE per **ADR-0011** (three-tier test
stratification) — Gate 1 lock at `d728cd4`, real-LLM tier
landed at Gate 5b `9260c53`, reproducibility evidence at Gate
6 `cae8cf4`. Each tier has its own `vitest.<tier>.config.ts`
(per Gate 4 `925761d`) and its own npm script (`test:unit`,
`test:integration`, `test:real-llm`).

### 3.1 Unit tests — `tests/unit/`

Containerized Postgres (per ADR-0013 — `postgres:16.4-alpine`)
+ FixtureBasedLLMProvider (per ADR-0014, supersedes ADR-0012's
hash-by-content dispatch with key-based dispatch). Target
full-suite runtime: **under 60 seconds.** Runs locally on save
during development.

Files in this tier:

- Architectural anchor tests
  (`tests/unit/no-console-in-api-src.test.ts`,
  `tests/unit/audit-system-principals.test.ts`,
  `tests/unit/boot-validation.test.ts`)
- Service-class behavior tests
  (`tests/unit/auth.test.ts`,
  `tests/unit/compliance.test.ts`,
  `tests/unit/coe.test.ts`,
  `tests/unit/otzar.test.ts`)
- Schema and trigger tests
  (`tests/unit/audit.test.ts`,
  `tests/unit/capsule.test.ts`,
  `tests/unit/permission.test.ts`)

The "unit" distinction is **scope**, not **isolation**: tests
in this tier exercise one service class or one anchor invariant
at a time, not full HTTP round trips. Database calls hit the
local containerized Postgres, not Supabase.

### 3.2 Integration tests — `tests/integration/`

Containerized Postgres + FixtureBasedLLMProvider, like the
unit tier — with the addition of end-to-end HTTP round trips
against a Fastify instance via `app.inject()`. Target
full-suite runtime: **under 10 minutes.** Runs on every PR +
push to main via CI (per ADR-0015 Decision C).

Files in this tier:

- `tests/integration/admin-routes.test.ts` (DRIFT 9 anchor
  for filter narrowing — see ADR-0006)
- `tests/integration/auth.test.ts`
- `tests/integration/compliance-state.test.ts`
- `tests/integration/share-revoke.test.ts`
- `tests/integration/audit-event-id-surfacing.test.ts`
- `tests/integration/feedback-routes.test.ts`
- `tests/integration/gateway.test.ts`
- `tests/integration/observation-routes.test.ts`
- `tests/integration/otzar-routes.test.ts`
- `tests/integration/p2-conversation-learning.test.ts`

Real audit chain, real Fastify, real Pino — but mocked LLM
(via FixtureBasedLLMProvider). LLM-touching tests that need
real provider behavior live in the real-LLM tier instead.

### 3.3 Real-LLM tier — `tests/real-llm/`

Real Supabase + real LLM provider (Anthropic by default per
`PREFERRED_LLM=anthropic`). Target runtime: **90-110 minutes**.
Runs nightly via CI schedule (`0 9 * * *` UTC per ADR-0015
Decision A) and on `workflow_dispatch` for ad-hoc invocation.

Used for assertions the mock LLM cannot meaningfully simulate:

- Real 429 retry / backoff behavior
- Real token counting against the live provider
- Real provider error shape regression detection

Per ADR-0011 classification rule, a test belongs in the
real-LLM tier if and only if it makes one of those assertions.
Everything else is integration (rule 2) or unit (rule 3).

Cost per nightly run: ~$0.013 (per Gate 6 reproducibility
evidence). The nightly schedule plus `workflow_dispatch`
covers production-bound verification without paying real-LLM
cost on every PR.

## Anchor Test Discipline

An **architectural anchor** is a runtime-enforced invariant
that future contributors might unintentionally violate without
the test catching them. Anchors are documented in
`docs/reference/architectural-anchors.md`. The 6 current
anchors are:

| # | Anchor | Test path |
|---|---|---|
| 1 | DRIFT 9 — audit filter narrowing | `tests/integration/admin-routes.test.ts:643` |
| 2 | DRIFT 9 — permissions filter narrowing | `tests/integration/admin-routes.test.ts:752` |
| 3 | DRIFT 2 Option C — no `console.*` in `apps/api/src` | `tests/unit/no-console-in-api-src.test.ts` |
| 4 | DRIFT 12 — `writeAuditEvent` chainKey priority backwards-compat | `tests/unit/audit-system-principals.test.ts` |
| 5 | Frozen `CRYPTO_CONFIG` (tamper resistance) | `tests/unit/boot-validation.test.ts` |
| 6 | Frozen `SYSTEM_PRINCIPALS` (tamper resistance) | `tests/unit/audit-system-principals.test.ts:39-44` |

ADR-0005 (no `console.*` in `apps/api/src`) and ADR-0006
(cross-org leak prevention) are the canonical write-ups for
anchors 3 and 1+2.

### When to add a new anchor

Add an anchor test when:

- The property is architectural (not feature-level), AND
- A future contributor or LLM could plausibly violate it
  without realizing, AND
- The violation would be hard to catch in code review
  (e.g., a single `console.log` added to a service file
  during debugging and then committed)

Do not promote every test to anchor status. Ordinary feature
tests stay ordinary; anchors are the small set of invariants
the codebase commits to enforce structurally.

### Grep-vs-call-site discipline (Section 12C.0 lesson 3)

When a grep-based anchor test scans source files, the regex
must distinguish executable calls from JSDoc literal mentions.
The canonical pattern, from
`tests/unit/no-console-in-api-src.test.ts:66`:

```ts
const CONSOLE_CALL_RE = /console\.(?:log|error|warn|info|debug)\s*\(/;
```

The trailing `\s*\(` ensures only call sites match. JSDoc text
like `// console.error only` (no parenthesis) is excluded
correctly; JSDoc with literal call syntax like
`// console.error("...")` would still match, but Foundation's
JSDoc convention does not include example-call literals — so
the false-positive risk is zero in practice. New grep anchors
should follow this same call-site discriminator pattern.

### Failure-message discipline

Anchor tests print every offending location, not just the
first. The pattern from `no-console-in-api-src.test.ts:115-124`:
build a multi-line message with `path:line  →  source` per hit
so a contributor adding multiple violations gets one
consolidated failure rather than fixing one and hitting the
next on rerun.

## Test Fixture Validity

Section 12C.0 architectural lesson 4: **test fixture validity
is not the same as production validity.** A test that needs
"a valid permission row" can either (a) call the production
write path that creates one, or (b) synthesize the row via
direct Prisma insert. The choice depends on what's under test.

- **Use a real production-path call** when the call itself is
  the system under test. If the test is asserting that
  `negotiate()` produces the right permission shape, the call
  must be real.
- **Synthesize via Prisma insert** when the test is asserting
  something downstream of the call. If the test is asserting
  that `getApplicableFrameworks()` returns the right
  frameworks given a profile row, synthesize the profile row
  directly — the production path that creates profiles is not
  what's under test.

The risk: assuming the production path produces a fixture
valid for the test you're writing. The production path may
have invariants the test fixture doesn't need (or vice versa).
When uncertain, synthesize directly and document the
assumption.

Helpers for fixture synthesis live in `tests/helpers.ts`
(single file, not a directory):

- `TEST_PREFIX = "__niov_test__"` — every synthesized row
  carries this prefix so cleanup can find it
- `makeEntityInput(overrides?)` — generates a unique
  `CreateEntityInput` with random UUIDs
- `cleanupTestData()`, `ensureAuditTriggers()`, etc.

New helpers go in the same file unless the helper is large
enough to warrant its own module.

## Vitest Configuration

Four configs cover Foundation's testing surface:

- `vitest.config.ts` — legacy full-suite config, retained
  for `npm test` backwards-compat. Calls real Supabase +
  real LLM. Do not use for new development; prefer the tier
  configs.
- `vitest.unit.config.ts` (per Gate 4 `925761d`) — drives
  `npm run test:unit`. Containerized Postgres + mock LLM.
- `vitest.integration.config.ts` — drives `npm run
  test:integration`. Same container + mock posture; HTTP
  round trips enabled.
- `vitest.real-llm.config.ts` — drives `npm run
  test:real-llm`. Real Supabase + real Anthropic.
  Stub-key guard at lines 75-88 fails fast if
  `ANTHROPIC_API_KEY` is missing or stubbed.

Key configuration values shared across configs:

- `testTimeout: 300_000` (300s per test) — Supabase
  tail-latency absorption per ADR-0010
- `retry: 2` — same rationale; the network is not
  deterministic, the logic under test is
- `hookTimeout: 60_000` — generous beforeAll/afterAll budget
  for cleanup queries that touch many rows
- `pool: "forks"` with `singleFork: true` — single forked
  process so Prisma connection pools don't fight each other
  across vitest workers
- `env: { NODE_ENV: "test" }` — flips
  `apps/api/src/logger.ts` to `level: "silent"` so test
  stdout stays clean
- `loadEnv()` at module top — reads `.env` (and
  `.env.test.local` for tier configs) so tests get
  `DATABASE_URL` exactly like production

Per-test timeout overrides are rare and require a comment
citing the reason. If a test legitimately needs more than
300 seconds, the cause is usually a missing `await` rather
than a real timeout need; investigate before extending.

## Adding a New Test

Brief checklist:

1. **Which tier?** Apply the **ADR-0011 classification rule**
   in order; the test belongs in exactly one tier:
   1. If the test asserts on real-LLM behavior the mock
      cannot meaningfully simulate (real 429 retry, real
      token counting, real provider error shape) →
      **real-LLM tier** (`tests/real-llm/`).
   2. Else if it exercises an HTTP round-trip via `buildApp`
      + `app.inject` → **integration tier**
      (`tests/integration/`).
   3. Else → **unit tier** (`tests/unit/`).

   Edge-case judgment calls document the rationale in a
   comment block at the top of the file so re-evaluation
   later has the reasoning recoverable.
2. **Anchor?** If yes, follow §Anchor Test Discipline:
   document the property in `docs/reference/architectural-anchors.md`,
   use the call-site discriminator pattern for grep-based
   tests, print every offending location.
3. **Fixtures?** Real production-path call when the call is
   under test; synthesize via Prisma insert when it is not.
   Helpers live in `tests/helpers.ts`.
4. **New helper?** Add to `tests/helpers.ts` unless the
   helper is large enough to warrant its own module under
   `tests/`. Mark the helper with the `TEST_PREFIX` discipline.
5. **Cleanup?** Use `cleanupTestData()` in `afterAll`. Tests
   that synthesize rows without the `TEST_PREFIX` will leak
   data into the shared test database.

## CI Workflow Architecture

CI runs via two GitHub Actions workflows (per **ADR-0015**,
landed at Gate 7 `78cf1b5`):

- `.github/workflows/ci.yml` — PR-blocking. Three parallel
  jobs (typecheck + unit + integration) on every PR and
  every push to main.
- `.github/workflows/nightly-real-llm.yml` — scheduled
  real-LLM tier (09:00 UTC daily) + on-demand
  `workflow_dispatch`. Single job. Failure-issue automation
  creates a GitHub issue with pre-populated investigation
  checklist on every failure.

ADR-0015 locks 8 architectural decisions worth knowing when
extending CI:

| # | Decision | Locked value |
|---|---|---|
| A | Real-LLM nightly schedule | 09:00 UTC daily (`0 9 * * *`) |
| B | TypeScript baseline | strict 12-error threshold |
| C | PR check coverage | unit + integration + typecheck only |
| D | Workflow file split | `ci.yml` + `nightly-real-llm.yml` |
| E | Postgres image pin | `postgres:16.4-alpine` (parity-with-local axis) |
| F | Concurrency control nightly | allow concurrent runs (no concurrency block) |
| G | npm caching | `actions/setup-node@v4` `cache: 'npm'` |
| H | Node version pin | `.nvmrc` = `22.11.0` (LTS-compliance axis) |

Decision B's 12-error threshold is enforced by
`grep -c "error TS"` against `tsc --noEmit` output. New TS
errors are CI failures; future systematic reductions update
the threshold by deliberate ADR amendment, not auto-tracking.

Decisions E and H are the canonical worked examples for the
Pin-and-Optimize Framework — see §Test Infrastructure Pinning
below.

## Test Infrastructure Pinning

**ADR-0016** (Pin-and-Optimize Framework) is the canonical
reference for *what to pin and why*. Two test-infrastructure
pins are the framework's first concrete instances:

**`postgres:16.4-alpine`** (per ADR-0015 Decision E +
ADR-0013) — pinned on the **parity-with-local** axis. The
empirically-verified local runtime that produced ADR-0011's
reproducibility evidence used this exact image. Pinning to
the same tag in CI eliminates within-major drift between
local development and CI runs; the audit-chain integrity
test, the BEFORE DELETE trigger test, and the structured
logger redaction test all assume bit-identical Postgres
behavior between layers.

**Node `22.11.0`** (per ADR-0015 Decision H + `.nvmrc`) —
pinned on the **LTS-compliance** axis. Operator's local
Node was v24.13.1 (current line) before this gate; pinning
the LTS major (22) gives Foundation runtime alignment with
SOC 2 / FedRAMP / ISO 27001 review windows where Node 22
LTS support extends through April 2027. The deliberate
divergence from local-parity (Decision E's axis) is itself
substrate-honest evidence: the Pin-and-Optimize Framework
holds when different runtimes pin on different
dominant-concern axes.

When adding a new test infrastructure dependency (container
image, runtime version, fixture format, recording schema),
apply the five-question template from ADR-0016:

1. What's the resource being pinned?
2. What dominant-concern axis governs the pin?
3. Does the pin satisfy that axis without unnecessary
   constraint?
4. What re-evaluation triggers should retire the pin?
5. Is the pin documented in the right ADR / contributing
   doc?

The framework reduces ambiguity but doesn't eliminate
operator judgment — see ADR-0016 §Consequences for the
maintenance overhead trade-off.

## When Tests Reveal Substrate Drift

A test that begins failing after substrate work — schema
migration, dependency upgrade, env-loader change — is almost
always surfacing a real drift between assumed and actual
substrate behavior. Resist the urge to "fix the test";
investigate the drift first.

**ADR-0017** (Production Discipline) codifies the nine-step
investigation template that emerged from drifts surfaced
during Gates 1-7. The full template lives in ADR-0017; the
operational summary is:

1. **Frame the drift** — what was expected, what was
   observed, what changed.
2. **Distinguish observation from inference** — separate
   "the test failed" (observation) from "the schema must be
   wrong" (inference).
3. **Verify inferred premises empirically before fix
   design** — don't design a fix until the inference is
   confirmed.
4. **Reframe based on evidence** — let the empirical
   verification rewrite the framing.
5. **Identify root causes end-to-end** — trace the drift to
   substrate, not just the test surface.
6. **Design defense-in-depth fix scope** — fix the root
   cause AND any propagation paths.
7. **Apply with three-approvals discipline** — file
   inventory, body, subject (matches the commit-time flow).
8. **Encode prevention** — substrate test, pre-flight check,
   or anchor that catches the same drift class next time.
9. **Document the lineage** — the drift, the investigation,
   the fix, and the prevention encoded in the commit body.

The G5b-I Resolution (commit `fbc7942`) is the canonical
worked example: a test failure that initially looked like a
recording-script bug was reframed (Step 4) into a
production-parser-confirmed-working observation, and
prevention was encoded by closing test coverage gaps rather
than patching the recording layer.

See `docs/contributing/onboarding.md` §The investigation
discipline for the contributor-onboarding walkthrough of the
same template.

## See Also

- ADR-0005 (no `console.*` in `apps/api/src` — anchor 3)
- ADR-0006 (cross-org leak prevention — anchors 1, 2)
- ADR-0010 (Foundation tests are legitimately slow)
- **ADR-0011** (three-tier test stratification — canonical
  reference for §Test Tiers + classification rule; Gate 6
  amendment in-place at `cae8cf4`)
- ADR-0012 (test-mode LLM provider hardening; partially
  superseded by ADR-0014's key-based dispatch)
- ADR-0013 (containerized Postgres for unit + integration
  tiers; pins `postgres:16.4-alpine`)
- ADR-0014 (FixtureBasedLLMProvider key-based dispatch;
  supersedes ADR-0012 dispatch)
- **ADR-0015** (CI Workflow Architecture — canonical
  reference for §CI Workflow Architecture + 8 locked
  decisions A-H)
- **ADR-0016** (Pin-and-Optimize Framework — canonical
  reference for §Test Infrastructure Pinning; substrate-
  discipline canonical reference quartet — what-to-pin)
- **ADR-0017** (Production Discipline — canonical reference
  for §When Tests Reveal Substrate Drift; substrate-
  discipline canonical reference quartet — how-to-investigate)
- `docs/reference/architectural-anchors.md` — full anchor
  catalog with locking-test details
- `vitest.config.ts` + `vitest.{unit,integration,real-llm}.config.ts`
  — the four configurations referenced above
- `docs/contributing/code-style.md` — code conventions in
  test files (FILE/PURPOSE/CONNECTS TO header,
  WHAT/INPUT/OUTPUT/WHY blocks on exported helpers)
- `docs/contributing/onboarding.md` — new contributor
  introduction including the ADR-0017 nine-step
  Production Discipline template
- `docs/contributing/parallel-sessions.md` — multi-agent
  test discipline (Phase 2c, coming)
