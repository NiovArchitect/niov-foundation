// FILE: vitest.integration.config.ts
// PURPOSE: Vitest config for the integration tier per ADR-0011.
//          Containerized Postgres (localhost:5433 via .env.test)
//          plus mock or fixture-based LLM provider per ADR-0012 +
//          ADR-0014. Exercises HTTP round-trips via Fastify's
//          inject() — the distinguishing characteristic from the
//          unit tier per ADR-0011 §Decision rule 2. Target
//          full-suite runtime: under 10 minutes.
// CONNECTS TO: tests/integration/**/*.test.ts (the integration-tier
//              test surface), .env.test (committed test environment
//              from Half A), docker-compose.test.yml (containerized
//              Postgres brought up via scripts/test-db-up.sh).
//
// This file is one of three tier-specific configs per ADR-0011
// §Decision. The legacy vitest.config.ts remains untouched for
// backward compatibility (Drift G4-A). The new `npm run
// test:integration` script (Gate 4 G4.2) uses this config.
//
// retry: 0 (Drift G4-B): same rationale as the unit tier;
// containerized Postgres is deterministic, so retries would mask
// real failures.
//
// Test-classification note: ADR-0011 §Decision rule 2 places any
// test using `buildApp` + `app.inject` in the integration tier.
// `tests/unit/monetization.test.ts` is currently misclassified
// under this rule (Drift G4-C) and migrates to integration tier
// at Gate 5; this config will pick it up automatically once it
// moves into the tests/integration/ directory.

import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// WHAT: Load .env.test (same path resolution as unit tier).
// INPUT: .env.test at repo root.
// OUTPUT: process.env populated with the test-environment values.
// WHY: Identical loading discipline to the unit tier — both tiers
//      run against the same containerized Postgres + the same
//      mock/fixture LLM substrate. The tier distinction is the
//      test-file location and the buildApp+app.inject usage,
//      not the runtime environment.
loadDotenv({ path: resolve(process.cwd(), ".env.test") });

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: "test" },
    retry: 0,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
