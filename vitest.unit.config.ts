// FILE: vitest.unit.config.ts
// PURPOSE: Vitest config for the unit tier per ADR-0011.
//          Containerized Postgres (localhost:5433 via .env.test)
//          plus mock or fixture-based LLM provider per ADR-0012 +
//          ADR-0014. Target full-suite runtime: under 60 seconds.
// CONNECTS TO: tests/unit/**/*.test.ts (the unit-tier test surface),
//              .env.test (committed test environment from Half A),
//              docker-compose.test.yml (containerized Postgres
//              brought up via scripts/test-db-up.sh).
//
// This file is one of three tier-specific configs (alongside
// vitest.integration.config.ts and vitest.real-llm.config.ts) per
// ADR-0011 §Decision. The legacy vitest.config.ts remains in place
// for backward compatibility (Drift G4-A): the existing `npm test`
// script continues to use it against real Supabase per ADR-0010's
// pre-Track-A baseline. The new `npm run test:unit` script
// (Gate 4 G4.2) uses this config against containerized Postgres.
//
// retry: 0 (Drift G4-B): the legacy vitest.config.ts uses retry: 2
// to absorb single-query Supabase tail-latency hangs documented in
// ADR-0010. Containerized Postgres is deterministic; retries would
// hide real test failures here. Setting retry: 0 surfaces failures
// directly.

import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// WHAT: Load .env.test into process.env so the @niov/database
//        Prisma client picks up DATABASE_URL pointing at the
//        containerized Postgres at localhost:5433.
// INPUT: .env.test at the repo root (committed substrate from
//         Half A).
// OUTPUT: process.env populated with NODE_ENV=test, DATABASE_URL,
//          DIRECT_URL, JWT_SECRET, stub LLM keys, etc.
// WHY: Explicitly loading only .env.test (not .env, not
//      .env.local) isolates the unit tier from production
//      credentials. Critical: vitest's own loadEnv helper loads
//      multiple files by mode pattern; using dotenv directly
//      with an explicit path matches scripts/record-llm-fixtures.ts
//      and avoids accidentally pulling in real Supabase URLs.
loadDotenv({ path: resolve(process.cwd(), ".env.test") });

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
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
