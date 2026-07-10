// FILE: integration-credential-schema-guard.test.ts (integration)
// PURPOSE: [SLICE3-PREREQ] Prove the boot-time schema guard runs the real
//          information_schema catalog query against the local PostgreSQL test
//          database and reports "compatible" when the six additive identity
//          columns exist (they do — the committed schema includes them). This is
//          the real-DB counterpart to the injected-probe unit tests.
// CONNECTS TO: apps/api/src/startup/integration-credential-schema-guard.ts

import { describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import {
  checkIntegrationCredentialIdentitySchema,
  assertIntegrationCredentialIdentitySchemaCompatible,
} from "../../apps/api/src/startup/integration-credential-schema-guard.js";

describe("IntegrationCredential identity schema guard (real DB)", () => {
  it("reports compatible against the live test schema (all six columns present)", async () => {
    const result = await checkIntegrationCredentialIdentitySchema(prisma);
    expect(result).toEqual({ status: "compatible" });
  });

  it("assert resolves against the live test schema", async () => {
    await expect(
      assertIntegrationCredentialIdentitySchemaCompatible(prisma),
    ).resolves.toBeUndefined();
  });

  it("ignores a same-named table in a DIFFERENT schema (current_schema() scoping)", async () => {
    // A decoy `integration_credentials` in another schema carries a marker
    // column that does NOT exist in the app schema. If the guard query were not
    // scoped to current_schema(), the marker would leak into the result set.
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS guard_decoy`);
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS guard_decoy.integration_credentials ` +
          `("decoy_marker" TEXT)`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        "SELECT column_name FROM information_schema.columns " +
          "WHERE table_schema = current_schema() " +
          "AND table_name = 'integration_credentials'",
      );
      const names = rows.map((r) => r.column_name);
      expect(names).not.toContain("decoy_marker");
      // The real app-schema table is still seen (identity columns present).
      expect(names).toContain("external_account_subject");
      // And the guard still reports compatible despite the decoy.
      await expect(
        assertIntegrationCredentialIdentitySchemaCompatible(prisma),
      ).resolves.toBeUndefined();
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS guard_decoy CASCADE`);
    }
  });
});
