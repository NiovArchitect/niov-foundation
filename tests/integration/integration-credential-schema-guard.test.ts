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
});
