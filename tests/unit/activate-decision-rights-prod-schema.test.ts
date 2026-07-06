// FILE: tests/unit/activate-decision-rights-prod-schema.test.ts
// PURPOSE: [BLOCK-3A] guard the safety invariants of the decision-rights
//          production-activation script: additive-ONLY DDL (no DROP/ALTER),
//          exact approval-phrase gate, idempotent (IF NOT EXISTS), no
//          backfill (never INSERT/UPDATE), and that it only ever creates the
//          entity_decision_rights objects. Pure, DB-free checks.
// CONNECTS TO: scripts/activate-decision-rights-prod-schema.ts

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, "scripts/activate-decision-rights-prod-schema.ts");
const APPROVAL_PHRASE = "APPROVE DECISION RIGHTS PROD SCHEMA ACTIVATION — additive only";
const src = readFileSync(SCRIPT, "utf8");

describe("[BLOCK-3A] decision-rights prod-schema activation safety invariants", () => {
  it("is additive-only — no destructive DDL statement, no backfill writes", () => {
    expect(src).not.toMatch(/DROP\s+(TABLE|TYPE|INDEX|COLUMN|CONSTRAINT|SCHEMA|DATABASE)/i);
    expect(src).not.toMatch(/ALTER\s+(TABLE|TYPE|INDEX|COLUMN|SCHEMA)/i);
    expect(src).not.toMatch(/TRUNCATE/i);
    expect(src).not.toMatch(/DELETE\s+FROM/i);
    // No backfill: the script never writes rows.
    expect(src).not.toMatch(/INSERT\s+INTO/i);
    expect(src).not.toMatch(/UPDATE\s+"?entity/i);
  });

  it("only creates the entity_decision_rights table + its two indexes", () => {
    expect(src).toContain('CREATE TABLE IF NOT EXISTS "entity_decision_rights"');
    expect(src).toContain('"entity_decision_rights_org_entity_id_idx"');
    expect(src).toContain('"entity_decision_rights_org_entity_id_entity_id_key"');
    // Plane discipline: never a DDL target on hierarchy, TAR, twin config,
    // profiles, or capsules.
    for (const forbidden of [
      '"entity_memberships"',
      '"token_attribute_repositories"',
      '"twin_configs"',
      '"entity_profiles"',
      '"memory_capsules"',
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("is idempotent (IF NOT EXISTS on table and both indexes)", () => {
    expect(src).toContain("CREATE TABLE IF NOT EXISTS");
    expect(src).toContain("CREATE INDEX IF NOT EXISTS");
    expect(src).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
  });

  it("requires the exact approval phrase gate", () => {
    expect(src).toContain("NIOV_APPROVE_DECISION_RIGHTS_PROD_SCHEMA");
    expect(src).toContain(APPROVAL_PHRASE);
  });

  it("prefers DIRECT_URL for DDL and never prints the connection URL", () => {
    expect(src).toContain("DIRECT_URL");
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
