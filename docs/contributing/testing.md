# Testing

Test infrastructure conventions specific to niov-foundation.
Not a general vitest tutorial. The reader is assumed to have
read `docs/contributing/code-style.md` (this file does not
re-cover documentation blocks or naming conventions; it covers
how Foundation's tests are organized, what runtime to expect,
and how anchor tests work).

## The 90-110 Minute Reality

Foundation's full-suite test runtime is **90-110 minutes**.
This is not a bug; it is the design. See ADR-0010 (Foundation
tests are legitimately slow) for the full rationale.

The runtime is real because the suite calls real Supabase and
(for some tiers) real LLM APIs. Mocking those layers would
defeat the verification gate — the audit chain integrity test
needs a real Postgres BEFORE DELETE trigger; the structured
logger redaction test needs the real Pino runtime; the
compliance-state read needs the real audit-event projection.

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

### Track A (future resolution)

Track A test infrastructure isolation is queued
post-Section-12C.0.5. Track A introduces containerized
Postgres for unit tests (<60s end-to-end), mocked LLM provider
for integration tier, and real-LLM coverage reserved for
nightly / pre-release. Until Track A lands, the 90-110 minute
reality is what every contributor budgets against.

## Test Tiers

Two tiers exist today; a third is planned for Track A.

### 3.1 Unit tests — `tests/unit/`

In-process, no external network calls beyond Supabase. Files
in this tier:

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

Despite the "unit" label, this tier still hits real Supabase
for any test that touches the database — Foundation has no
mocked Postgres today (Track A introduces one). The "unit"
distinction is **scope**, not **isolation**: tests in this
tier exercise one service class or one anchor invariant at a
time, not full HTTP round trips.

### 3.2 Integration tests — `tests/integration/`

End-to-end HTTP round trips against a Fastify instance.
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

Real Supabase, real audit chain, real Fastify, real Pino. LLM
calls in this tier may be real or env-gated depending on the
suite — there is no formal isolation marker today.

### 3.3 Real-LLM tier — Track A future state

ADR-0010's Track A direction reserves a real-LLM tier for
nightly / pre-release verification. **This tier does not have
a directory today.** Real-LLM coverage today is co-located in
the unit and integration tiers without a formal marker. Track
A will introduce the directory + marker; until then, treat
LLM-touching tests as integration-tier with the caveat that
they will be moved.

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

The full configuration lives in `vitest.config.ts`. Key
values:

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
- `loadEnv()` at module top — reads `.env` so tests get
  `DATABASE_URL` exactly like production

Per-test timeout overrides are rare and require a comment
citing the reason. If a test legitimately needs more than
300 seconds, the cause is usually a missing `await` rather
than a real timeout need; investigate before extending.

## Adding a New Test

Brief checklist:

1. **Which tier?** Unit (`tests/unit/`) for service-class or
   anchor invariants. Integration (`tests/integration/`) for
   HTTP round trips. The real-LLM tier does not exist as a
   directory today (Track A).
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

## See Also

- ADR-0005 (no `console.*` in `apps/api/src` — anchor 3)
- ADR-0006 (cross-org leak prevention — anchors 1, 2)
- ADR-0010 (Foundation tests are legitimately slow)
- `docs/reference/architectural-anchors.md` — full anchor
  catalog with locking-test details
- `vitest.config.ts` — the configuration referenced above
- `docs/contributing/code-style.md` — code conventions in
  test files (FILE/PURPOSE/CONNECTS TO header,
  WHAT/INPUT/OUTPUT/WHY blocks on exported helpers)
- `docs/contributing/parallel-sessions.md` — multi-agent
  test discipline (Phase 2c, coming)
