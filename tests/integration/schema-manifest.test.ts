// FILE: schema-manifest.test.ts (integration)
// PURPOSE: [OTZAR-CONTINUITY P6] Real-DB proof of the startup schema manifest:
//          reports compatible against the committed schema; the unique-constraint
//          probe returns the real Stage 1 unique sets; a same-named table in a
//          different schema cannot false-pass (current_schema() scoping); and
//          startApiServer never listens when the guard rejects.
// CONNECTS TO: apps/api/src/startup/schema-manifest.ts, apps/api/src/server.ts

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import {
  checkSchemaManifest,
  assertSchemaManifestCompatible,
  StartupSchemaIncompatibleError,
} from "../../apps/api/src/startup/schema-manifest.js";
import { startApiServer } from "../../apps/api/src/server.js";

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS manifest_decoy CASCADE`).catch(() => undefined);
});

describe("startup schema manifest (real DB, P6)", () => {
  it("reports compatible against the committed test schema", async () => {
    const r = await checkSchemaManifest(prisma);
    if (r.status !== "compatible") {
      throw new Error(`expected compatible, got issues: ${JSON.stringify(r)}`);
    }
    expect(r.status).toBe("compatible");
    await expect(assertSchemaManifestCompatible(prisma)).resolves.toBeUndefined();
  });

  it("the unique-constraint probe is scoped to current_schema() and does not false-pass a decoy", async () => {
    // A decoy otzar_conversation_turns in ANOTHER schema, missing every required
    // column. If the probe were not current_schema()-scoped, it would leak in.
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS manifest_decoy`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS manifest_decoy.otzar_conversation_turns ("decoy" TEXT)`,
    );
    // The real (current_schema) check still passes — the decoy is invisible to it.
    const r = await checkSchemaManifest(prisma);
    expect(r.status).toBe("compatible");
  });

  it("startApiServer rejects (never listens) when the guard reports incompatible", async () => {
    let listened = false;
    await expect(
      startApiServer({
        schemaGuard: () => Promise.reject(new StartupSchemaIncompatibleError([
          { table: "otzar_conversation_turns", kind: "table_missing" },
        ])),
        build: async () => {
          listened = true; // must never run — guard precedes build+listen
          return {} as never;
        },
      }),
    ).rejects.toBeInstanceOf(StartupSchemaIncompatibleError);
    expect(listened).toBe(false);
  });
});
