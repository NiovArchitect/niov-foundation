// FILE: resolve-entities.test.ts (unit)
// PURPOSE: Phase 1285-H — lock the single shared identity resolver contract:
//          known ids resolve to their display name (unresolved=false); unknown
//          / blank / null ids resolve to the canonical "Unknown entity" label
//          (unresolved=true) and are NEVER dropped or surfaced as a raw UUID.
// CONNECTS TO: apps/api/src/services/identity/resolve-entities.ts

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createEntity, prisma } from "@niov/database";
import {
  resolveEntityNames,
  nameFrom,
  UNRESOLVED_ENTITY_LABEL,
} from "../../apps/api/src/services/identity/resolve-entities.js";
import { cleanupTestData, makeEntityInput, ensureAuditTriggers } from "../helpers.js";

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("resolveEntityNames — single canonical identity contract", () => {
  it("resolves known ids to their display name (unresolved=false)", async () => {
    await ensureAuditTriggers();
    const a = await createEntity({ ...makeEntityInput({ entity_type: "PERSON" }), display_name: "Sadeil Lewis" });
    const b = await createEntity({ ...makeEntityInput({ entity_type: "PERSON" }), display_name: "David Odie" });
    const map = await resolveEntityNames([a.entity_id, b.entity_id]);
    expect(map.get(a.entity_id)).toEqual({ display_name: "Sadeil Lewis", unresolved: false });
    expect(map.get(b.entity_id)).toEqual({ display_name: "David Odie", unresolved: false });
  });

  it("an unknown id resolves to the canonical label with unresolved=true (never a UUID)", async () => {
    const missing = randomUUID();
    const map = await resolveEntityNames([missing]);
    const r = map.get(missing);
    expect(r).toBeDefined();
    expect(r!.display_name).toBe(UNRESOLVED_ENTITY_LABEL);
    expect(r!.unresolved).toBe(true);
    // The label is never the raw id.
    expect(r!.display_name).not.toBe(missing);
  });

  it("drops null/blank ids from the lookup but never from the contract (nameFrom always labels)", async () => {
    const map = await resolveEntityNames([null, undefined, ""]);
    expect(map.size).toBe(0);
    // nameFrom never returns a UUID or empty — always a canonical label.
    expect(nameFrom(map, null)).toBe(UNRESOLVED_ENTITY_LABEL);
    expect(nameFrom(map, "some-unmapped-id")).toBe(UNRESOLVED_ENTITY_LABEL);
  });

  it("deduplicates repeated ids", async () => {
    const a = await createEntity({ ...makeEntityInput({ entity_type: "PERSON" }), display_name: "Repeat Person" });
    const map = await resolveEntityNames([a.entity_id, a.entity_id, a.entity_id]);
    expect(map.size).toBe(1);
    expect(nameFrom(map, a.entity_id)).toBe("Repeat Person");
  });
});
