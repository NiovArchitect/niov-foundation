// FILE: tests/unit/activate-cohort-prod-schema.test.ts
// PURPOSE: Phase 1305-B — guard the safety invariants of the one-off cohort
//          production-activation script: additive-ONLY DDL (no DROP/ALTER),
//          exact approval-phrase gate, idempotent (IF NOT EXISTS / pg_type
//          guard), and that it never touches memory_capsules / HNSW / any
//          existing object. Pure, DB-free checks.
// CONNECTS TO: scripts/activate-cohort-prod-schema.ts

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, "scripts/activate-cohort-prod-schema.ts");
const APPROVAL_PHRASE = "APPROVE COHORT PROD SCHEMA ACTIVATION — additive only";
const src = readFileSync(SCRIPT, "utf8");

describe("Phase 1305-B — cohort prod-schema activation safety invariants", () => {
  it("is additive-only — no destructive DDL STATEMENT (prose mentioning DROP/ALTER is allowed)", () => {
    // Match destructive SQL operations precisely (object follows the verb), so
    // the safety banner ("can never DROP or ALTER an existing object") doesn't
    // false-trigger.
    expect(src).not.toMatch(/DROP\s+(TABLE|TYPE|INDEX|COLUMN|CONSTRAINT|SCHEMA|DATABASE)/i);
    expect(src).not.toMatch(/ALTER\s+(TABLE|TYPE|INDEX|COLUMN|SCHEMA)/i);
    expect(src).not.toMatch(/TRUNCATE/i);
    expect(src).not.toMatch(/DELETE\s+FROM/i);
  });

  it("only creates the cohort enum + table + indexes (never operates on memory_capsules / HNSW)", () => {
    expect(src).toContain('CREATE TYPE "CohortProductStatus"');
    expect(src).toContain('CREATE TABLE IF NOT EXISTS "cohort_data_products"');
    // Never references the memory_capsules table as a DDL target, never builds
    // an HNSW index (the comment may mention them in prose — that's fine).
    expect(src).not.toContain('"memory_capsules"');
    expect(src).not.toMatch(/USING\s+hnsw/i);
  });

  it("is idempotent (IF NOT EXISTS + pg_type guard)", () => {
    expect(src).toContain("CREATE TABLE IF NOT EXISTS");
    expect(src).toContain("CREATE INDEX IF NOT EXISTS");
    expect(src).toContain("SELECT 1 FROM pg_type WHERE typname = 'CohortProductStatus'");
  });

  it("requires the exact approval phrase gate", () => {
    expect(src).toContain("NIOV_APPROVE_COHORT_PROD_SCHEMA");
    expect(src).toContain(APPROVAL_PHRASE);
  });

  it("prefers DIRECT_URL for DDL and never prints the connection URL", () => {
    expect(src).toContain("DIRECT_URL");
    // redact() must mask credentials in any URL it prints.
    expect(src).toContain("<redacted>");
  });

  it("--help is leak-free and describes the additive scope", () => {
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", SCRIPT, "--help"],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
    );
    expect(out).toContain(APPROVAL_PHRASE);
    expect(out).toContain("additive");
    expect(out).not.toMatch(/DROP\s+(TABLE|TYPE|INDEX)/i);
  });
});
