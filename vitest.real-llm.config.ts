// FILE: vitest.real-llm.config.ts
// PURPOSE: Vitest config for the real-LLM nightly tier per
//          ADR-0011. Real Supabase + real Anthropic provider via
//          getLLMProvider(). Target runtime: 90-110 minutes per
//          ADR-0010's documented baseline.
// CONNECTS TO: tests/real-llm/**/*.test.ts (the real-LLM-tier test
//              surface; directory does NOT exist as of Track A
//              Gate 4 — see Drift G4-D), .env.test +
//              .env.test.local (operator-populated real
//              credentials from Half A's .env.test.local.example
//              template).
//
// CI POLICY: nightly schedule + on-demand workflow_dispatch ONLY,
//            never on PR/push (cost control). Track A Gate 7
//            introduces the GitHub Actions workflow that enforces
//            this policy. Local invocation via `npm run
//            test:real-llm` (Gate 4 G4.2) requires a real
//            ANTHROPIC_API_KEY in .env.test.local; the
//            module-top guard below fails fast if the key is the
//            stub value from .env.test.
//
// retry: 2 PRESERVATION (Drift G4-B): the unit and integration
// tiers use retry: 0 because containerized Postgres is
// deterministic. The real-LLM tier preserves retry: 2 because it
// runs against real Supabase, which has the tail-latency behavior
// ADR-0010 documented (single-query hangs roughly once per ~280
// invocations against shared free-tier infra).
//
// FORWARD-LOOKING SUBSTRATE (Drift G4-D): tests/real-llm/ does
// not exist as of this commit. The include pattern is committed
// substrate matching ADR-0011's tier definition verbatim; Gate 5
// introduces real-LLM tests. Running this config today reports
// "no tests found" — that is correct behavior.

import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// WHAT: Load .env.test for default values, then .env.test.local
//        with override:true so operator-supplied real credentials
//        replace the stub values.
// INPUT: .env.test (committed) + .env.test.local (gitignored,
//         operator-created from .env.test.local.example).
// OUTPUT: process.env populated with real Supabase URL + real
//          ANTHROPIC_API_KEY (when .env.test.local is correctly
//          populated).
// WHY: This dual-load mirrors the recording script's pattern from
//      Half B (scripts/record-llm-fixtures.ts) so both
//      maintainer-driven flows (recording + real-LLM nightly)
//      treat .env.test.local as the single source of truth for
//      real credentials. override:true is required on the second
//      call because dotenv's default behavior preserves
//      already-set env vars; without override, .env.test's stub
//      values would win.
loadDotenv({ path: resolve(process.cwd(), ".env.test") });
loadDotenv({
  path: resolve(process.cwd(), ".env.test.local"),
  override: true,
});

// WHAT: Module-top guard against running with stub credentials.
// INPUT: process.env.ANTHROPIC_API_KEY after both .env files
//         have loaded.
// OUTPUT: throws a clear error if the value is still the stub
//          from .env.test, otherwise returns silently.
// WHY: The most common operator failure mode is forgetting to
//      create .env.test.local from the example template. Failing
//      fast at config load (rather than per-test, which would
//      surface as confusing test failures) gives the operator an
//      immediate, actionable message naming the missing file.
//      The stub value 'test-stub-not-real' is the canonical
//      sentinel from .env.test (Half A); detecting it here means
//      .env.test.local either does not exist or did not include
//      ANTHROPIC_API_KEY.
const STUB_VALUE = "test-stub-not-real";
if (
  typeof process.env.ANTHROPIC_API_KEY !== "string" ||
  process.env.ANTHROPIC_API_KEY === STUB_VALUE
) {
  throw new Error(
    "vitest.real-llm.config.ts: ANTHROPIC_API_KEY is unset or " +
      "still the stub value from .env.test. The real-LLM tier " +
      "requires real credentials. Create .env.test.local from " +
      ".env.test.local.example and populate ANTHROPIC_API_KEY " +
      "with a real Anthropic key (sk-ant-...) before running " +
      "this config.",
  );
}

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/real-llm/**/*.test.ts"],
    // tests/real-llm/ does not yet exist (Drift G4-D forward-
    // looking substrate). vitest 2.x exits with code 1 when no
    // tests are found unless this flag is set. Until Gate 5
    // introduces real-LLM tests, an empty discovery is the
    // correct outcome, not a failure.
    passWithNoTests: true,
    testTimeout: 300_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: "test" },
    retry: 2,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
