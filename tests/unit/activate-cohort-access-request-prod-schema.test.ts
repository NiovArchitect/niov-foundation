// FILE: tests/unit/activate-cohort-access-request-prod-schema.test.ts
// PURPOSE: Phase 1307-B — guard the safety invariants of the cohort access-request
//          production-activation script: additive-ONLY DDL (no DROP/ALTER),
//          exact approval-phrase gate, idempotent (IF NOT EXISTS / pg_type
//          guard), never operates on existing tables. Pure, DB-free.
// CONNECTS TO: scripts/activate-cohort-access-request-prod-schema.ts

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, "scripts/activate-cohort-access-request-prod-schema.ts");
const APPROVAL_PHRASE = "APPROVE COHORT PROD SCHEMA ACTIVATION — additive only";
const src = readFileSync(SCRIPT, "utf8");

describe("Phase 1307-B — cohort access-request prod-activation safety invariants", () => {
  it("is additive-only — no destructive DDL statement", () => {
    expect(src).not.toMatch(/DROP\s+(TABLE|TYPE|INDEX|COLUMN|CONSTRAINT|SCHEMA|DATABASE)/i);
    expect(src).not.toMatch(/ALTER\s+(TABLE|TYPE|INDEX|COLUMN|SCHEMA)/i);
    expect(src).not.toMatch(/TRUNCATE/i);
    expect(src).not.toMatch(/DELETE\s+FROM/i);
  });

  it("only creates the access-request enum + table + indexes", () => {
    expect(src).toContain('CREATE TYPE "CohortAccessRequestStatus"');
    expect(src).toContain('CREATE TABLE IF NOT EXISTS "cohort_access_requests"');
    // Never operates on other tables.
    expect(src).not.toContain('"memory_capsules"');
    expect(src).not.toContain('"cohort_data_products" (');
    expect(src).not.toContain('"cohort_contributions" (');
    expect(src).not.toMatch(/USING\s+hnsw/i);
  });

  it("is idempotent (IF NOT EXISTS + pg_type guard)", () => {
    expect(src).toContain("CREATE TABLE IF NOT EXISTS");
    expect(src).toContain("CREATE INDEX IF NOT EXISTS");
    expect(src).toContain("SELECT 1 FROM pg_type WHERE typname = 'CohortAccessRequestStatus'");
  });

  it("requires the exact approval phrase + prefers DIRECT_URL + redacts the URL", () => {
    expect(src).toContain("NIOV_APPROVE_COHORT_PROD_SCHEMA");
    expect(src).toContain(APPROVAL_PHRASE);
    expect(src).toContain("DIRECT_URL");
    expect(src).toContain("<redacted>");
  });

  it("--help is leak-free and describes the additive scope", () => {
    const out = execFileSync(process.execPath, ["--import", "tsx", SCRIPT, "--help"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(out).toContain(APPROVAL_PHRASE);
    expect(out).toContain("additive");
    expect(out).not.toMatch(/DROP\s+(TABLE|TYPE|INDEX)/i);
  });
});
