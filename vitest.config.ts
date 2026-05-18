// FILE: vitest.config.ts
// PURPOSE: Configure the Vitest test runner for the whole monorepo
//          with fail-closed production-Supabase boundary per ADR-0047
//          Sub-decision 3 (Q-PR-γ Option α) + ADR-0035 §9 37th
//          observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-PRODUCTION-
//          SUPABASE.
// CONNECTS TO: All test files under /tests, `.env.test` (loaded by
//              default; containerized Postgres at localhost:5433 per
//              ADR-0013), `.env` (loaded ONLY when ALLOW_PROD_TEST_ENV
//              is literally "1" per Founder discipline at canonical-
//              rule register substantively per RULE 0), and the
//              @niov/database package which the tests import.
//
// CI RULE: no production Supabase writes during tests; no secret
//          exposure in error messages (only hostname is referenced;
//          username / password / database / full URL are never
//          printed).
//
// HISTORY: Previously loaded `.env` unconditionally via bare
//          loadEnv() (recurrence-1 surfaced at G3.9 Tier 2 per
//          ADR-0035 §9 37th observation; commit `b478191` PR.1
//          documented the canonical safety trap; this commit PR.2
//          closes the trap at canonical-execution register
//          substantively).

import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// WHAT: Resolve which env file to load — `.env.test` by default
//        (containerized localhost:5433 Postgres test DB) OR `.env`
//        (production target) ONLY if ALLOW_PROD_TEST_ENV is the
//        literal string "1".
// INPUT: process.env.ALLOW_PROD_TEST_ENV.
// OUTPUT: process.env populated from the resolved env file before
//         defineConfig() runs.
// WHY: ADR-0035 §9 37th observation: bare `npx vitest run <file>`
//      previously routed through this config and loaded `.env` (the
//      production Supabase pooler), risking accidental production
//      writes. ADR-0047 Sub-decision 3 (Q-PR-γ Option α) requires
//      this config to fail-closed against production by default;
//      explicit opt-in is the only path to production-target test
//      execution per Founder discipline at canonical-rule register
//      substantively.
const ALLOW_PROD = process.env.ALLOW_PROD_TEST_ENV === "1";

if (ALLOW_PROD) {
  // Opt-in path: explicit Founder-authorized production-target test
  // execution. Caller responsibility per RULE 0 + RULE 20. The
  // hostname-validation gate below will short-circuit (because
  // ALLOW_PROD is true) but the in-test guard
  // `tests/unit/test-env-config-safety.test.ts` will still assert
  // a local DATABASE_URL host — providing defense-in-depth for
  // accidentally-wide test runs.
  loadEnv();
} else {
  // Default path: containerized localhost:5433 Postgres test DB
  // per ADR-0013. This is the canonical local + CI test target.
  loadEnv({ path: resolve(process.cwd(), ".env.test") });
}

// WHAT: Extract hostname from a postgresql:// connection URL.
// INPUT: A DATABASE_URL string (possibly undefined).
// OUTPUT: The hostname string, or null if parse fails or URL is
//         undefined.
// WHY: Validate DATABASE_URL host is local without referencing the
//      full URL value (which contains credentials). Per RULE 0, no
//      secret content may be printed in error messages.
function extractHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const SAFE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const dbHost = extractHost(process.env.DATABASE_URL);

if (dbHost !== null && !SAFE_HOSTS.has(dbHost) && !ALLOW_PROD) {
  // Fail-closed: refuse to start the test runner when DATABASE_URL
  // points at a non-local host without explicit opt-in.
  // Error message contains hostname only (public DNS info) — never
  // the full DATABASE_URL (which contains username + password +
  // database name) per RULE 0 secret-exposure boundary.
  throw new Error(
    `vitest.config.ts: DATABASE_URL host '${dbHost}' is not local ` +
      `(expected: localhost / 127.0.0.1 / ::1). ` +
      `Per ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-` +
      `DEFAULT-LOADS-PRODUCTION-SUPABASE + ADR-0047 Sub-decision 3, ` +
      `non-local DATABASE_URL is forbidden under default test ` +
      `execution. Use 'npm run test:unit' or 'npm run test:integration' ` +
      `(canonical tier scripts), OR pass ` +
      `--config vitest.unit.config.ts / vitest.integration.config.ts ` +
      `explicitly, OR set ALLOW_PROD_TEST_ENV=1 to explicitly opt in ` +
      `to production-target test execution per Founder discipline at ` +
      `RULE 0 register.`,
  );
}

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: "test" },
    // Each test gets up to 2 retries to absorb single-query
    // Supabase tail-latency hangs that show up roughly once per
    // ~280 test invocations against shared free-tier infra when
    // ALLOW_PROD_TEST_ENV=1 is set. The logic under test is
    // deterministic; the network is not. Default-path (.env.test
    // → localhost) execution is deterministic; retries are
    // harmless overhead.
    retry: 2,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
