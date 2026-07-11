// FILE: tests/unit/schema-manifest.test.ts
// PURPOSE: [OTZAR-CONTINUITY P6] Prove the generalized startup schema manifest:
//          compatible pass, every incompatibility class (table/column/type/
//          nullability/unique), decoy cannot false-pass, DB-outage classification,
//          read-only (no writes), sanitized errors, and the two reproduced
//          incidents (voice_note_id, Stage 1 turn table).
// CONNECTS TO: apps/api/src/startup/schema-manifest.ts

import { describe, expect, it } from "vitest";
import {
  SCHEMA_MANIFEST,
  checkSchemaManifest,
  assertSchemaManifestCompatible,
  StartupSchemaIncompatibleError,
  StartupSchemaProbeUnavailableError,
  STARTUP_SCHEMA_INCOMPATIBLE,
  STARTUP_SCHEMA_PROBE_UNAVAILABLE,
  type SchemaProbe,
} from "../../apps/api/src/startup/schema-manifest.js";

interface ColRow { column_name: string; data_type: string; is_nullable: "YES" | "NO" }
interface Spec { columns: Record<string, ColRow[]>; uniques: Record<string, string[][]> }

// A fully-compatible spec derived from the manifest itself.
function compatibleSpec(): Spec {
  const columns: Record<string, ColRow[]> = {};
  const uniques: Record<string, string[][]> = {};
  for (const req of SCHEMA_MANIFEST) {
    columns[req.table] = req.columns.map((c) => ({
      column_name: c.name,
      data_type: c.dataType,
      is_nullable: c.notNull === true ? "NO" : "YES",
    }));
    // request_id is referenced by a unique but not a column requirement — add it so
    // the unique's column set can be satisfied by the fake.
    if (req.table === "otzar_conversation_turns") {
      columns[req.table]!.push({ column_name: "request_id", data_type: "text", is_nullable: "YES" });
    }
    uniques[req.table] = (req.uniques ?? []).map((u) => u.columns);
  }
  return { columns, uniques };
}

const writes: string[] = [];
function fakeDb(spec: Spec): SchemaProbe {
  return {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      if (!/^\s*SELECT/i.test(query)) writes.push(query); // record any non-SELECT
      const table = String(values[0]);
      if (query.includes("information_schema.columns")) return (spec.columns[table] ?? []) as T;
      if (query.includes("pg_index")) return (spec.uniques[table] ?? []).map((cols) => ({ cols })) as T;
      throw new Error("unexpected query");
    },
  };
}

const clone = (s: Spec): Spec => JSON.parse(JSON.stringify(s)) as Spec;

describe("startup schema manifest (P6)", () => {
  it("passes when every requirement is present (and issues only SELECTs)", async () => {
    writes.length = 0;
    const r = await checkSchemaManifest(fakeDb(compatibleSpec()));
    expect(r.status).toBe("compatible");
    expect(writes).toHaveLength(0); // read-only
    await expect(assertSchemaManifestCompatible(fakeDb(compatibleSpec()))).resolves.toBeUndefined();
  });

  it("detects a missing table", async () => {
    const s = clone(compatibleSpec());
    delete s.columns["otzar_conversation_turns"];
    const r = await checkSchemaManifest(fakeDb(s));
    expect(r.status).toBe("incompatible");
    if (r.status !== "incompatible") throw new Error();
    expect(r.issues).toContainEqual({ table: "otzar_conversation_turns", kind: "table_missing" });
  });

  it("detects a missing column (reproduces the voice_note_id incident)", async () => {
    const s = clone(compatibleSpec());
    s.columns["memory_capsules"] = []; // voice_note_id gone → table_missing (empty ⇒ absent)
    const r1 = await checkSchemaManifest(fakeDb(s));
    expect(r1.status).toBe("incompatible");
    // And when the table exists but only voice_note_id is dropped:
    const s2 = clone(compatibleSpec());
    s2.columns["memory_capsules"] = [{ column_name: "other", data_type: "text", is_nullable: "YES" }];
    const r2 = await checkSchemaManifest(fakeDb(s2));
    if (r2.status !== "incompatible") throw new Error();
    expect(r2.issues).toContainEqual({ table: "memory_capsules", kind: "column_missing", column: "voice_note_id" });
  });

  it("detects a wrong column type (reproduces a Stage 1 turn mismatch)", async () => {
    const s = clone(compatibleSpec());
    const col = s.columns["otzar_conversation_turns"]!.find((c) => c.column_name === "subject_entity_id")!;
    col.data_type = "text"; // should be uuid
    const r = await checkSchemaManifest(fakeDb(s));
    if (r.status !== "incompatible") throw new Error();
    expect(r.issues).toContainEqual({
      table: "otzar_conversation_turns", kind: "column_type",
      column: "subject_entity_id", expected: "uuid", actual: "text",
    });
  });

  it("detects wrong (nullable) material nullability", async () => {
    const s = clone(compatibleSpec());
    const col = s.columns["otzar_conversation_turns"]!.find((c) => c.column_name === "org_entity_id")!;
    col.is_nullable = "YES"; // manifest requires NOT NULL
    const r = await checkSchemaManifest(fakeDb(s));
    if (r.status !== "incompatible") throw new Error();
    expect(r.issues).toContainEqual({ table: "otzar_conversation_turns", kind: "column_nullable", column: "org_entity_id" });
  });

  it("detects a missing unique constraint", async () => {
    const s = clone(compatibleSpec());
    s.uniques["otzar_conversation_turns"] = [["conversation_id", "sequence"]]; // dropped request_id unique
    const r = await checkSchemaManifest(fakeDb(s));
    if (r.status !== "incompatible") throw new Error();
    expect(r.issues).toContainEqual({
      table: "otzar_conversation_turns", kind: "unique_missing", columns: ["conversation_id", "request_id"],
    });
  });

  it("a decoy table with the right name but wrong columns cannot false-pass", async () => {
    const s = clone(compatibleSpec());
    // Decoy: the turns table exists but with unrelated columns (as a same-named table
    // in another schema would surface — current_schema() scoping is enforced by the
    // real query; here we prove the classifier rejects a wrong shape).
    s.columns["otzar_conversation_turns"] = [{ column_name: "id", data_type: "uuid", is_nullable: "NO" }];
    const r = await checkSchemaManifest(fakeDb(s));
    expect(r.status).toBe("incompatible");
  });

  it("classifies a probe/DB outage as PROBE_UNAVAILABLE, never as a schema gap", async () => {
    const outage: SchemaProbe = { async $queryRawUnsafe() { throw new Error("connection refused: postgres://secret@host"); } };
    await expect(assertSchemaManifestCompatible(outage)).rejects.toBeInstanceOf(StartupSchemaProbeUnavailableError);
    await expect(assertSchemaManifestCompatible(outage)).rejects.toHaveProperty("code", STARTUP_SCHEMA_PROBE_UNAVAILABLE);
  });

  it("incompatible assertion throws the stable code and a SANITIZED message (no secrets)", async () => {
    const s = clone(compatibleSpec());
    delete s.columns["otzar_conversations"];
    let err: unknown;
    try { await assertSchemaManifestCompatible(fakeDb(s)); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(StartupSchemaIncompatibleError);
    expect((err as StartupSchemaIncompatibleError).code).toBe(STARTUP_SCHEMA_INCOMPATIBLE);
    const msg = (err as Error).message;
    expect(msg).toContain("otzar_conversations");
    expect(msg).not.toMatch(/postgres:\/\/|password|@.*:\d+\//i); // no connection string / secret
  });
});
