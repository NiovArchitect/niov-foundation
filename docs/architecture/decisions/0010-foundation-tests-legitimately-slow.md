# ADR-0010: Foundation tests are legitimately slow (90-110 min)

## Status

Accepted 2026-05-04 (Section 12C.0 emergent lesson)

## Context

During Section 12C.0 build cycle, Foundation full-suite test
runs were repeatedly misdiagnosed as hangs and forcibly killed
via `pkill`. The misdiagnoses cost wall-clock and produced
inconsistent verification reports. Root cause: Foundation's
test suite uses real Supabase + LLM API calls; full-suite
runtime is legitimately 90-110 minutes.

Three diagnostic findings:

- Vitest config has `retry=2` + `testTimeout=300000` (300
  seconds per test) specifically to absorb Supabase tail-latency.
  The config comment names this rationale.
- Test process is alive throughout the run (`ps -ef | grep vitest`
  confirms), the log file grows continuously (`wc -l` on the log
  shows progress), and process sampling
  (`sample <PID> 2 -mayDie`) shows normal libuv idle pattern
  (`uv__io_poll`, `kevent`), not deadlock.
- Healthy slow is not the same as hung. The diagnostic
  distinction matters because pkilling a healthy run loses the
  verification signal and forces a complete re-run.

The build-cycle pattern that emerged: three pkilled runs early
in Section 12C.0, then one full successful run (5648 seconds =
94 minutes) that established the baseline. After that baseline,
full-suite runs took 107-110 minutes consistently for the
remainder of the build cycle.

The test slowness is not desirable — it constrains iteration
speed on dependent work like Section 12.5 Sub-box 1. Track A
(test infrastructure isolation) is queued to address it
post-Section-12C.0.5.

## Decision

Foundation full-suite test runtime is documented as 90-110
minutes. The build-cycle discipline:

- **Do not pkill running tests.** The 300-second per-test
  timeout with 2 retries is intentional; pkilling is the
  disease, not the cure.
- **Diagnostic when in doubt:** `ps -ef | grep vitest | grep -v grep`
  (process alive), `wc -l <log file>` (log growing),
  `sample <PID> 2 -mayDie | head -50` (libuv idle pattern, not
  deadlock).
- **Plan verification cadence around the 90-110 minute reality.**
  Sub-section commits accommodate the runtime cost; do not
  schedule tight serial verification gates.

Track A test infrastructure isolation is queued post-Section-
12C.0.5. Track A introduces containerized Postgres for unit
tests (<60s), mocked LLM provider for integration tier, and
real-LLM coverage reserved for nightly / pre-release.

## Consequences

### Easier

- Build-cycle wall-clock budgeting matches reality
- Misdiagnosis-driven re-runs are prevented
- Diagnostic pattern is documented as committed substrate

### Harder

- Iteration speed on dependent work is constrained until Track
  A delivers (Sub-box 1 dual-control middleware iteration would
  be prohibitively slow without Track A)
- Section 12.5 dependency ordering routes through Track A; the
  branch can't accelerate until Track A lands
- New contributors have to internalize the wall-clock reality
  before their first verification cycle (`CLAUDE.md` Section 7
  documents this; new contributors read it)

## Alternatives Considered

### Mock everything (zero real-service dependencies in tests)

Rejected at Section 12C.0 time. Foundation needs end-to-end
coverage including real audit chain integrity, real
pseudo-random generation, real Pino logger emission. Mocking
the layers that matter most defeats the verification gate.

### Pkill on any "stuck" appearance

Rejected. Misdiagnosed three times in Section 12C.0; forces
complete re-runs that cost more than waiting.

### Skip full-suite verification on small commits

Rejected. The verification gate's value comes from being
non-negotiable; conditional verification creates a culture
where verification is optional.

## References

- `vitest.config.ts` (the `retry=2` + `testTimeout=300000`
  config with rationale comment)
- Section 12C.0 architectural lesson 7 (Foundation test suite
  is legitimately slow)
- Track A queue entry in
  `docs/reference/section-12-progress.md`
- `9671776` (Section 12.5 Compliance Architecture Review;
  documented test slowness in the build cycle context)

Bidirectional citations (cited from):

- `docs/reference/section-12-progress.md` (Track A dependency
  note cites this ADR)
- `docs/reference/architectural-anchors.md` (header references
  this ADR in the discipline context)
- `docs/contributing/testing.md` (Phase 2b will cite this ADR
  for the runtime expectation)
