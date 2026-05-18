// FILE: test-env-config-safety.test.ts (unit; PR.2 guard)
// PURPOSE: Enforce ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-
//          DEFAULT-LOADS-PRODUCTION-SUPABASE at test-execution register
//          substantively per ADR-0047 Sub-decision 3 (Q-PR-γ Option α).
//          Asserts that test environment never points at production
//          Supabase by default + provides defense-in-depth even when
//          ALLOW_PROD_TEST_ENV=1 opt-in is set (a wide default unit
//          run accidentally pointed at production will fail at these
//          assertions before hitting any DB-touching test logic).
// CONNECTS TO: vitest.config.ts (hardened fail-closed default per
//              ADR-0047 Sub-decision 3 + ADR-0035 §9 37th
//              observation), .env.test (canonical containerized
//              Postgres target at localhost:5433 per ADR-0013),
//              ADR-0035 §9 37th observation, ADR-0047 PR.2
//              sub-decision.
//
// PRIVACY: Only the DATABASE_URL hostname is extracted and asserted;
//          the full URL (containing credentials) is never logged or
//          printed. On assertion failure, Vitest diff output shows
//          the hostname only — that is public DNS info, not a secret.
//          The full DATABASE_URL value is never interpolated into
//          assertion messages, error strings, or console output per
//          RULE 0 secret-exposure boundary.

import { describe, it, expect } from "vitest";

describe("PR.2 — test-env config safety (ADR-0035 §9 37th + ADR-0047 Sub-decision 3)", () => {
  it("NODE_ENV is set to 'test' when test runs under canonical config", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("DATABASE_URL is defined when test runs under canonical config", () => {
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  it("DATABASE_URL host is localhost / 127.0.0.1 / ::1 under default test execution", () => {
    const url = process.env.DATABASE_URL;
    expect(url).toBeDefined();
    // Parse hostname only; never print the full URL value.
    const host = new URL(url!).hostname;
    expect(["localhost", "127.0.0.1", "::1"]).toContain(host);
  });

  it("DATABASE_URL host is NOT a production Supabase pooler under default test execution", () => {
    const url = process.env.DATABASE_URL;
    expect(url).toBeDefined();
    // Parse hostname only; assert negative match against production
    // Supabase patterns. Per RULE 0, the assertion target is the
    // hostname (public DNS info), not the full DATABASE_URL.
    const host = new URL(url!).hostname;
    expect(host).not.toMatch(/\.supabase\.com$/);
    expect(host).not.toMatch(/\.pooler\./);
    expect(host).not.toMatch(/\.aws-\d+/);
  });

  it("guard test runs under tier config which loads .env.test (proves canonical env-file load)", () => {
    const url = process.env.DATABASE_URL;
    expect(url).toBeDefined();
    // .env.test sets DATABASE_URL=postgresql://postgres:postgres@localhost:5433/foundation_test.
    // The hardened vitest.config.ts default branch loads .env.test per
    // ADR-0047 Sub-decision 3 α-1; vitest.unit.config.ts also loads
    // .env.test. Either path reaches this assertion only when the
    // canonical containerized-Postgres env file was loaded by the
    // runtime config (defense-in-depth at test-execution register).
    expect(url).toContain("localhost");
  });
});
