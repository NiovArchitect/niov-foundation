# ADR-0012: Test-mode LLM provider hardening

## Status

Accepted 2026-05-06 (Track A architectural-lock commit
`d728cd4`). §Decision hash-by-content dispatch superseded in
part by ADR-0014 (Track A Gate 3 amendment, 2026-05-06).
Other decisions in this ADR (`MockLLMProvider` preservation,
recording script architecture, strict missing-fixture
failure, tier integration) remain in effect.

## Context

`MockLLMProvider` already exists in
`apps/api/src/services/llm/llm.service.ts:317-362`. It
implements `LLMProvider` via a cursor-based queue
(`responses: LLMResult[]`, repeats last entry once exhausted),
wired into `NODE_ENV=test` at `server.ts:203-214` with a
1-entry stub. Six test files inject custom queues.

Queue dispatch is fragile. Tests must script the right number
of responses in the right order; refactoring breaks ordering;
multi-path tests can't share a provider instance. Responses
are hand-written JSON literals, not real-Claude outputs —
they don't surface real-provider quirks. As Track A introduces
unit + integration tiers (ADR-0011) that run on every save and
every commit, mock-scripting becomes a discipline tax on every
test author.

The Track A goal: production-grade determinism. A mock that
dispatches by input hash (same hash → same response, forever)
and is grounded in recorded real-Claude responses beats
queue-based mocking on every axis. This ADR locks the new
provider's contract, the recording flow, the fixture file
format, the missing-fixture failure mode, and the coexistence
rule with `MockLLMProvider`. Implementation lands in Gate 3.

## Decision

A new class `FixtureBasedLLMProvider` is added to
`apps/api/src/services/llm/llm.service.ts` (same file as
`MockLLMProvider`). It implements `LLMProvider` with the
following behavior:

- **Dispatch by input hash.** `generateResponse(args)` computes
  `sha256("${args.system}\n---\n${args.user}\n---\n${args.context ?? ""}")`
  and looks up the fixture file by the truncated hash (first
  16 hex chars of the digest).
- **Fixture library at `tests/fixtures/llm/`.** One JSON file
  per fixture, named `<truncated-hash>.json`. Each carries:
  full sha256 (collision sanity check), original input
  (system / user / context for human review), recorded
  response (`LLMResult` shape), recording timestamp, and
  Claude model identifier.
- **Strict missing-fixture failure.** If `generateResponse()`
  is called with input whose hash has no fixture, the
  provider throws an error naming the truncated hash, the
  input snippet, and the path to the recording script.
  **Silent fallback is forbidden** — it produces
  nondeterministic test outcomes, which is exactly what this
  ADR exists to prevent.

A recording script lands at `scripts/record-llm-fixtures.ts`,
consuming a curated prompt array (committed alongside the
script), calling real Claude with `temperature=0`, and writing
responses as fixture files. Requires `ANTHROPIC_API_KEY`; runs
on-demand by the maintainer, never in CI.

**Coexistence with `MockLLMProvider`.** Both classes remain.
Tests with scripted response sequences (circuit-breaker
matrix, retry sequencing) use `MockLLMProvider` because queue
semantics are the substrate. Tests needing realistic LLM
behavior without scripting (route-level integration,
observation pipeline) use `FixtureBasedLLMProvider`. Choice
is per-test, documented at the top of each test file.

**Tier integration per ADR-0011:** unit and integration tiers
use either provider as appropriate (both deterministic);
real-LLM tier uses `getLLMProvider()` and does not consult
fixtures.

## Consequences

### Easier

- **Tests stop scripting LLM responses.** The fixture is
  consulted by hash automatically. Test bodies focus on the
  behavior under test, not the mock plumbing.
- **Refactoring tests doesn't break ordering.** There is no
  ordering — there is hash-keyed lookup.
- **Real-Claude responses become permanent test substrate.**
  A response recorded today still drives tests next year. No
  drift inside the fixture; the file is committed substrate.
- **Recording is bounded.** New tests that need a fixture
  record it once via the script and then ignore the recording
  forever.
- **Determinism is mechanical.** Same hash → same response →
  same test result, deterministically.

### Harder

- **The fixture library grows.** Every new prompt-shape adds
  a fixture. Long-term, the directory could accumulate
  thousands of files. Mitigation: periodic fixture pruning
  in maintenance passes; un-referenced fixtures get removed.
- **Real-Claude drift is a fixture-staleness problem.** If
  Claude's behavior changes (model update, prompt-handling
  tweak), fixtures recorded before the change drive tests
  against stale behavior. Real-LLM nightly (per ADR-0011)
  catches drift, but only on a 24-hour lag; periodic
  re-recording may be required.
- **The recording script depends on `ANTHROPIC_API_KEY` in
  the environment.** Track A's CI does NOT run the recording
  script — it consumes committed fixtures only. The
  recording dependency lives on the maintainer's machine.
- **Missing-fixture failures require manual recording.** A
  new test whose hash isn't in the library fails with a clear
  error pointing at the recording script — recovery is
  mechanical but human-driven.
- **Hash collisions are theoretically possible.** sha256 +
  16-char prefix = 2^64 possibilities — vanishingly small at
  project scale. The fixture file carries the full hash for
  sanity-check verification on read; no further mitigation
  needed.
- **Fixture files carry recorded model output.** Recorded
  responses can include Claude's safety-related refusals or
  other policy-shaped responses. Fixtures must be reviewed
  before commit, same as any other test substrate.

## Alternatives Considered

### Queue-based mock only (status quo)

Reject. Fragility documented in §Context is the problem this
ADR solves. Status quo is preserved for the narrow
circuit-breaker / retry-sequencing case where queue semantics
ARE the test substrate, but is insufficient as the default
for unit and integration tiers.

### In-memory pattern matcher (regex / keyword dispatch)

Reject. Invents response shape rather than recording real
Claude. Dispatches on human-curated patterns that drift from
real behavior. ADR-0012's whole point is to ground tests in
real responses; pattern matching abandons that.

### Live recording (record real responses on every test run, cache by hash)

Reject. Non-deterministic against API rate limits, requires
`ANTHROPIC_API_KEY` in CI, defeats the offline-test goal.
Recording is maintainer-driven, not per-run.

### A small local LLM (e.g., a tiny model running locally)

Reject. Adds substantial dependency surface (model weights,
runtime, GPU optionality) and still doesn't match Claude's
behavior. Running a different model defeats the goal of
realistic Claude responses.

## References

- ADR-0010 (tests are legitimately slow) — Track A motivation
- ADR-0011 (three-tier test stratification) — tiers that
  consume this provider
- ADR-0013 (containerized Postgres) — companion ADR in same
  architectural-lock commit
- `apps/api/src/services/llm/llm.service.ts` — existing
  `MockLLMProvider` preserved; `FixtureBasedLLMProvider`
  lands here
- `apps/api/src/server.ts:203-214` — current `NODE_ENV=test`
  wiring; updated in Gate 3
- `tests/unit/llm.test.ts` — queue-based canonical consumer
  (continues using `MockLLMProvider`)
- `tests/integration/observation-routes.test.ts` — canonical
  fixture-tier migration target (Gate 5)
- `scripts/record-llm-fixtures.ts`, `tests/fixtures/llm/` —
  introduced in Gate 3

Bidirectional citations (cited from):

- ADR-0011, ADR-0013 (forward-cite for hardened-mock spec)
- `docs/contributing/testing.md` (back-citation in Gate 8)
- `docs/reference/architectural-anchors.md` — no anchor;
  fixture-keyed dispatch is discipline, not runtime invariant
