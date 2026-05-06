# ADR-0014: FixtureBasedLLMProvider key-based dispatch

## Status

Proposed 2026-05-06 (Track A Gate 3 amendment; will move to
Accepted when this commit lands). Supersedes (in part)
ADR-0012 §Decision hash-by-content dispatch; other ADR-0012
decisions remain in effect.

## Context

ADR-0012 §Decision specified hash-by-content dispatch:
sha256 the `system+user+context` triple, truncate to 16 hex
chars, look up by that hash.

Track A Gate 3 Half B pre-flight surfaced Drift 3HB-A: all 5
fixture-migration targets (`tests/unit/otzar.test.ts`,
`tests/unit/observation.test.ts`, and
`tests/integration/{otzar-routes,observation-routes,p2-conversation-learning}.test.ts`)
construct entities via `makeEntityInput`
(`tests/helpers.ts:78-116`), generating random UUIDs that flow
into service-constructed prompts. `OtzarService.conductSession`
(`otzar.service.ts:383-403`) assembles an 8-layer system
prompt including user identity, twin config, and wallet
contents — all per-test randomized. The hash changes every run.

The architectural gap: ADR-0012 assumed deterministic prompts.
That assumption doesn't survive contact with real test inputs;
hash-by-content would produce a fixture library with zero
matchers. Not an implementation defect — a mismatch between
dispatch mechanism and consumer base.

This ADR replaces the dispatch with test-controlled fixture
keys. Hash is preserved as a derived sanity check. Other
ADR-0012 decisions — `MockLLMProvider` preservation, recording
script architecture, strict missing-fixture failure, tier
integration — remain in effect.

## Decision

**Interface change.** `LLMProvider.generateResponse` gains an
optional second parameter:

```ts
generateResponse(
  args: { system: string; user: string; context?: string },
  opts?: { fixtureKey?: string },
): Promise<LLMResult>
```

Production call sites (`otzar.service.ts:400,627`,
`observation.service.ts:295`) pass no opts; behavior unchanged.
Test sites pass `{ fixtureKey: "<key>" }` to opt into replay.
`MockLLMProvider` and `withCircuitBreaker` ignore opts.
`FixtureBasedLLMProvider` requires it and throws if missing.

**Fixture file naming.** `tests/fixtures/llm/<fixtureKey>.json`.
Keys are operator-chosen, descriptive, kebab-case (e.g.
`otzar-happy-path-001`, `observation-summarization-tech-industry`).

**Fixture file shape.** JSON carrying `fixtureKey`, `fullHash`
(sha256 of input — sanity check only), `input` (verbatim
system/user/context), `response` (recorded `LLMResult`), and
`metadata` (recordedAt, recordingTemperature: 0, sourceFile,
promptId). Half B specifies the exact field layout.

**Hash as sanity check.** When `FixtureBasedLLMProvider` loads
a fixture, it hashes the live input and compares against
`fixture.fullHash`. Mismatch logs a warning (both hashes +
input snippets) but does not fail — the test asserts on the
recorded response, not on input hash. A `HASH_DRIFT_FATAL=true`
env flag could promote warnings to errors; queued for Gate 7.

**Strict missing-fixture failure (preserved from ADR-0012).**
If `opts.fixtureKey` names a missing file, the provider throws
with the key + a pointer to `scripts/record-llm-fixtures.ts`.
Silent fallback remains forbidden.

**Recording script update.** Curated array entries become
`{ fixtureKey, system, user, context?, sourceFile, promptId }`.
Script writes `<fixtureKey>.json`. Implementation in Half B.

**MockLLMProvider unchanged.** ADR-0012's preservation remains
in effect; opts is ignored by queue-based dispatch.

## Consequences

### Easier

- **Non-deterministic-input tests become fixture-able.**
  Hash-by-content would exclude all 5 existing migration
  targets; key-based includes them.
- **Fixtures are human-discoverable.** A test asserts against
  `fixtureKey="otzar-happy-path-001"`; reviewers read the
  matching JSON file to see the expected response.
- **Curated array is genuinely curatable.** Operators choose
  meaningful keys, not opaque hashes.
- **Production code unaffected.** opts is optional; 3 existing
  call sites need no migration.
- **Hash drift is surveilled, not catastrophic.** Schema-field
  additions and prompt refactors surface a warning; fixtures
  keep working until intentionally re-recorded.

### Harder

- **`LLMProvider` interface gains a parameter.** Public-surface
  change; every implementation accepts opts even when
  ignoring it. Type signatures update across the codebase.
- **Fixture key naming is a contributor discipline.**
  Kebab-case + describe-scenario + match-source-intent are
  conventions, not enforced rules. Mitigation: CONTRIBUTING
  note in `docs/contributing/testing.md` at Gate 8 + PR review.
- **Hash drift warning is benign by default.** Tests pass
  against possibly-stale fixtures unless operators notice.
  Mitigation: nightly real-LLM tier catches behavior drift;
  `HASH_DRIFT_FATAL` available for pre-release.
- **One more ADR in the decisions directory.** Future readers
  read ADR-0012 + ADR-0014 in sequence; ADR-0012's Status
  references this ADR.
- **Existing 5 migration-target tests still require migration.**
  Track A Gate 5 carries this; ADR-0014 unblocks, doesn't
  perform.
- **Fixture re-recording is deliberate.** New scenario = pick
  key + add to curated array + run script. Documented in script header.

## Alternatives Considered

### Status quo (hash-by-raw-input per ADR-0012)

Reject. Drift 3HB-A surfaced that existing tests construct
non-deterministic prompts; hash-by-input cannot serve them.
Continuing this path produces a fixture library with zero
matchers — pure scaffolding, no test value.

### Input normalization before hashing (regex-strip UUIDs/timestamps)

Reject. Brittle. New random fields would silently break
normalization; tests would pass against wrong fixtures or
fail with cryptic hash mismatches. Production-grade
discipline rejects regex-driven dispatch.

### Rewrite tests to be deterministic (fixed UUIDs)

Reject. Existing tests rely on entity uniqueness for
cross-test isolation. Removing randomness creates new bugs
(FK collisions, cleanup contamination). The fix belongs at
the dispatch layer, not the input layer.

### Defer Half B until after Gate 5 migration

Reject. Track A's value compounds with every test cycle.
Fixture infrastructure is the largest contributor to test
speedup; deferring pushes Gate 5's value to the right.

## References

- ADR-0012 (test-mode LLM provider hardening) — **superseded
  in part**; §Decision hash-by-content dispatch replaced.
  Other ADR-0012 decisions (`MockLLMProvider` preservation,
  recording script architecture, strict missing-fixture
  failure, tier integration) remain in effect
- ADR-0011 (three-tier test stratification) — tiers consumed
- ADR-0013 (containerized Postgres) — companion infra; Half A
  at `081d35e`
- `apps/api/src/services/llm/llm.service.ts:37-44` —
  `LLMProvider` interface; gains opts parameter in Half B
- `tests/helpers.ts:78-116` — `makeEntityInput` (source of
  non-deterministic UUIDs)
- `tests/integration/otzar-routes.test.ts:108+` — canonical
  non-deterministic-prompt example; production call sites
  `otzar.service.ts:400,627` + `observation.service.ts:295`
- Track A Gate 5 — existing-test migration adopting
  `opts.fixtureKey`
- `docs/contributing/testing.md` — back-citation at Gate 8

Bidirectional citations (cited from):

- ADR-0012 §Status — in-place amendment in same commit
- `docs/reference/architectural-anchors.md` — no anchor;
  dispatch is discipline, not runtime invariant
