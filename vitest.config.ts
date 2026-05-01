// FILE: vitest.config.ts
// PURPOSE: Configure the Vitest test runner for the whole monorepo.
// CONNECTS TO: All test files under /tests, the .env file (loaded so tests
//              can reach the Supabase database), and the @niov/database
//              package which the tests import.

import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

// WHAT: Load environment variables from .env into process.env before tests run.
// INPUT: The .env file at the repository root.
// OUTPUT: process.env populated with DATABASE_URL and friends.
// WHY: The NIOV Foundation never hard-codes secrets. Tests reach the real
//      Supabase database, so they need DATABASE_URL exactly like production.
loadEnv();

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
