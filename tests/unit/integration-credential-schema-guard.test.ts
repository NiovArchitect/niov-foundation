// FILE: integration-credential-schema-guard.test.ts (unit)
// PURPOSE: [SLICE3-PREREQ] Lock the boot-time schema-compatibility guard. Proves it
//          classifies compatible / one-missing / many-missing / table-missing /
//          probe-unavailable correctly, performs NO writes, leaks no secrets, and
//          is wired so `startApiServer` runs it BEFORE building or listening — and
//          never listens when it fails.
// CONNECTS TO:
//   - apps/api/src/startup/integration-credential-schema-guard.ts
//   - apps/api/src/server.ts (startApiServer ordering)

import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { startApiServer } from "@niov/api";
import {
  REQUIRED_IDENTITY_COLUMNS,
  INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE,
  checkIntegrationCredentialIdentitySchema,
  assertIntegrationCredentialIdentitySchemaCompatible,
  IntegrationCredentialSchemaIncompatibleError,
  IntegrationCredentialSchemaProbeUnavailableError,
  type SchemaProbe,
} from "../../apps/api/src/startup/integration-credential-schema-guard.js";

// A probe that returns a fixed column set and records every query it saw, so we
// can assert the guard is READ-ONLY (only a SELECT against information_schema).
function probeReturning(columns: string[]): SchemaProbe & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    $queryRawUnsafe: (async (query: string) => {
      queries.push(query);
      return columns.map((c) => ({ column_name: c }));
    }) as SchemaProbe["$queryRawUnsafe"],
  };
}

const ALL = [...REQUIRED_IDENTITY_COLUMNS];
const OTHER = ["credential_id", "org_entity_id", "tool", "webhook_secret"];

describe("IntegrationCredential identity schema guard", () => {
  it("1. all six columns present → compatible (no throw)", async () => {
    const db = probeReturning([...OTHER, ...ALL]);
    await expect(checkIntegrationCredentialIdentitySchema(db)).resolves.toEqual({
      status: "compatible",
    });
    await expect(
      assertIntegrationCredentialIdentitySchemaCompatible(db),
    ).resolves.toBeUndefined();
  });

  it("2. one column missing → fails with the stable error code + that column", async () => {
    const db = probeReturning([...OTHER, ...ALL.filter((c) => c !== "external_account_subject")]);
    const check = await checkIntegrationCredentialIdentitySchema(db);
    expect(check).toEqual({ status: "columns_missing", missing: ["external_account_subject"] });
    await expect(
      assertIntegrationCredentialIdentitySchemaCompatible(db),
    ).rejects.toMatchObject({
      code: INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE,
      missingColumns: ["external_account_subject"],
      tableMissing: false,
    });
  });

  it("3. multiple columns missing → all reported deterministically (schema order)", async () => {
    const db = probeReturning([...OTHER, "external_account_email", "external_account_issuer"]);
    const check = await checkIntegrationCredentialIdentitySchema(db);
    // Deterministic order = REQUIRED_IDENTITY_COLUMNS order, not the DB's.
    expect(check).toEqual({
      status: "columns_missing",
      missing: [
        "external_account_subject",
        "external_account_email_verified",
        "external_account_pinned_at",
        "external_account_last_verified_at",
      ],
    });
  });

  it("4. table missing (empty catalog result) → fails safely, all columns listed", async () => {
    const db = probeReturning([]);
    expect(await checkIntegrationCredentialIdentitySchema(db)).toEqual({ status: "table_missing" });
    await expect(
      assertIntegrationCredentialIdentitySchemaCompatible(db),
    ).rejects.toMatchObject({
      code: INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE,
      tableMissing: true,
      missingColumns: ALL,
    });
  });

  it("5. database query failure → probe-unavailable, NOT a false 'compatible' or 'missing'", async () => {
    const db: SchemaProbe = {
      $queryRawUnsafe: (async () => {
        throw new Error("connection refused postgres://user:secret@db.internal:5432");
      }) as SchemaProbe["$queryRawUnsafe"],
    };
    const err = await assertIntegrationCredentialIdentitySchemaCompatible(db).catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationCredentialSchemaProbeUnavailableError);
    expect(err).not.toBeInstanceOf(IntegrationCredentialSchemaIncompatibleError);
    // The sanitized error carries NO connection string / credentials.
    expect(String(err.message)).not.toContain("secret");
    expect(String(err.message)).not.toContain("postgres://");
    expect(String(err.message)).not.toContain("db.internal");
  });

  it("6. performs no writes — only a read-only information_schema SELECT", async () => {
    const db = probeReturning([...OTHER, ...ALL]);
    await assertIntegrationCredentialIdentitySchemaCompatible(db);
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0]).toMatch(/^SELECT\s+column_name\s+FROM\s+information_schema\.columns/i);
    expect(db.queries[0]).not.toMatch(/INSERT|UPDATE|DELETE|ALTER|CREATE|DROP/i);
  });

  it("7. incompatible-error output contains no DB URL / credentials / tokens / sealed values", async () => {
    const err = new IntegrationCredentialSchemaIncompatibleError(
      ["external_account_subject"],
      false,
    );
    const text = `${err.name} ${err.message}`;
    for (const forbidden of ["postgres://", "password", "webhook_secret", "access_token", "Bearer", "@"]) {
      expect(text).not.toContain(forbidden);
    }
    // It DOES name the missing column (column names are not secrets) + remediation.
    expect(err.message).toContain("external_account_subject");
    expect(err.message).toContain("Apply the approved additive IntegrationCredential identity schema");
  });

  it("8+9. startApiServer runs the guard BEFORE build/listen and never builds/listens when it fails", async () => {
    const order: string[] = [];
    const build = vi.fn(async () => {
      order.push("build");
      return {} as FastifyInstance;
    });
    const failingGuard = vi.fn(async () => {
      order.push("guard");
      throw new IntegrationCredentialSchemaIncompatibleError(["external_account_subject"], false);
    });
    await expect(startApiServer({ schemaGuard: failingGuard, build })).rejects.toMatchObject({
      code: INTEGRATION_CREDENTIAL_SCHEMA_INCOMPATIBLE,
    });
    expect(failingGuard).toHaveBeenCalledTimes(1);
    // The app is NEVER built (hence never listens) when the guard fails.
    expect(build).not.toHaveBeenCalled();
    expect(order).toEqual(["guard"]);
  });

  it("10. startApiServer with a passing guard builds + listens, guard first (injectable seam)", async () => {
    const order: string[] = [];
    const listen = vi.fn(async () => {
      order.push("listen");
    });
    const fakeApp = { listen, log: { info: vi.fn() } } as unknown as FastifyInstance;
    const passingGuard = vi.fn(async () => {
      order.push("guard");
    });
    const build = vi.fn(async () => {
      order.push("build");
      return fakeApp;
    });
    const returned = await startApiServer({ schemaGuard: passingGuard, build });
    expect(returned).toBe(fakeApp);
    expect(order).toEqual(["guard", "build", "listen"]);
    expect(listen).toHaveBeenCalledWith({ port: expect.any(Number), host: "0.0.0.0" });
  });
});
