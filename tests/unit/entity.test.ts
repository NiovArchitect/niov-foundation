// FILE: entity.test.ts
// PURPOSE: Verify every Entity query function behaves correctly and that
//          each one writes the audit row Rule 4 demands.
// CONNECTS TO: The seven query functions in /packages/database/src/queries/
//              entity.ts, the audit table, and the test helpers in
//              /tests/helpers.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEntity,
  getEntityById,
  getEntityByEmail,
  updateEntityStatus,
  incrementFailedAuth,
  resetFailedAuth,
  listEntities,
  prisma,
  MAX_CLEARANCE,
} from "@niov/database";
import { cleanupTestData, makeEntityInput, TEST_PREFIX } from "../helpers.js";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Helper that fetches the audit rows tied to one entity, newest first.
// INPUT: An entity_id.
// OUTPUT: Array of AuditLog rows.
// WHY: Tests need to confirm Rule 4 -- every action wrote an audit row.
async function auditRowsFor(entityId: string) {
  return prisma.auditLog.findMany({
    where: { entity_id: entityId },
    orderBy: { created_at: "desc" },
  });
}

describe("createEntity", () => {
  it("creates an entity with the requested fields", async () => {
    const input = makeEntityInput({ entity_type: "COMPANY" });
    const created = await createEntity(input);

    expect(created.entity_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(created.entity_type).toBe("COMPANY");
    expect(created.display_name).toBe(input.display_name);
    expect(created.email).toBe(input.email);
    expect(created.status).toBe("ACTIVE");
    expect(created.clearance_level).toBe(0);
    expect(created.failed_auth_attempts).toBe(0);
    expect(created.deleted_at).toBeNull();
  });

  it("writes an ENTITY_CREATE audit row in the same transaction", async () => {
    const created = await createEntity(makeEntityInput());
    const logs = await auditRowsFor(created.entity_id);
    expect(logs.length).toBe(1);
    expect(logs[0]?.action).toBe("ENTITY_CREATE");
  });

  it("accepts a null email for AI agents and devices", async () => {
    const agent = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    expect(agent.email).toBeNull();
  });

  it("rejects clearance_level below 0", async () => {
    await expect(
      createEntity(makeEntityInput({ clearance_level: -1 })),
    ).rejects.toThrow(/clearance_level/);
  });

  it("rejects clearance_level above 6", async () => {
    await expect(
      createEntity(makeEntityInput({ clearance_level: 7 })),
    ).rejects.toThrow(/clearance_level/);
  });

  it("accepts the boundary values 0 and 6", async () => {
    const low = await createEntity(makeEntityInput({ clearance_level: 0 }));
    const high = await createEntity(
      makeEntityInput({ clearance_level: MAX_CLEARANCE }),
    );
    expect(low.clearance_level).toBe(0);
    expect(high.clearance_level).toBe(6);
  });
});

describe("getEntityById", () => {
  it("returns the entity when it exists and is not deleted", async () => {
    const created = await createEntity(makeEntityInput());
    const fetched = await getEntityById(created.entity_id);
    expect(fetched?.entity_id).toBe(created.entity_id);
  });

  it("returns null for a non-existent id", async () => {
    const result = await getEntityById(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeNull();
  });

  it("returns null for a soft-deleted entity", async () => {
    const created = await createEntity(makeEntityInput());
    await updateEntityStatus(created.entity_id, "DELETED");
    const fetched = await getEntityById(created.entity_id);
    expect(fetched).toBeNull();
  });

  it("writes an ENTITY_READ_BY_ID audit row", async () => {
    const created = await createEntity(makeEntityInput());
    await getEntityById(created.entity_id);
    const logs = await auditRowsFor(created.entity_id);
    const reads = logs.filter((l) => l.action === "ENTITY_READ_BY_ID");
    expect(reads.length).toBeGreaterThanOrEqual(1);
  });
});

describe("getEntityByEmail", () => {
  it("returns the entity when the email matches and entity is alive", async () => {
    const input = makeEntityInput();
    const created = await createEntity(input);
    const fetched = await getEntityByEmail(input.email!);
    expect(fetched?.entity_id).toBe(created.entity_id);
  });

  it("returns null for an unknown email", async () => {
    const fetched = await getEntityByEmail(
      `${TEST_PREFIX}does-not-exist@niov.test`,
    );
    expect(fetched).toBeNull();
  });

  it("returns null for a soft-deleted entity even if the email matches", async () => {
    const input = makeEntityInput();
    const created = await createEntity(input);
    await updateEntityStatus(created.entity_id, "DELETED");
    const fetched = await getEntityByEmail(input.email!);
    expect(fetched).toBeNull();
  });
});

describe("updateEntityStatus", () => {
  it("updates the status field", async () => {
    const created = await createEntity(makeEntityInput());
    const updated = await updateEntityStatus(created.entity_id, "SUSPENDED");
    expect(updated.status).toBe("SUSPENDED");
  });

  it("sets suspended_at when moving to SUSPENDED", async () => {
    const created = await createEntity(makeEntityInput());
    const updated = await updateEntityStatus(created.entity_id, "SUSPENDED");
    expect(updated.suspended_at).toBeInstanceOf(Date);
  });

  it("sets deleted_at when moving to DELETED", async () => {
    const created = await createEntity(makeEntityInput());
    const updated = await updateEntityStatus(created.entity_id, "DELETED");
    expect(updated.deleted_at).toBeInstanceOf(Date);
  });

  it("clears suspended_at when moving back to ACTIVE", async () => {
    const created = await createEntity(makeEntityInput());
    await updateEntityStatus(created.entity_id, "SUSPENDED");
    const reactivated = await updateEntityStatus(
      created.entity_id,
      "ACTIVE",
    );
    expect(reactivated.suspended_at).toBeNull();
    expect(reactivated.status).toBe("ACTIVE");
  });

  it("writes an ENTITY_STATUS_UPDATE audit row", async () => {
    const created = await createEntity(makeEntityInput());
    await updateEntityStatus(created.entity_id, "SUSPENDED");
    const logs = await auditRowsFor(created.entity_id);
    const updates = logs.filter((l) => l.action === "ENTITY_STATUS_UPDATE");
    expect(updates.length).toBe(1);
  });
});

describe("incrementFailedAuth", () => {
  it("adds 1 to failed_auth_attempts", async () => {
    const created = await createEntity(makeEntityInput());
    const after = await incrementFailedAuth(created.entity_id);
    expect(after.failed_auth_attempts).toBe(1);
  });

  it("can be called repeatedly and keeps counting", async () => {
    const created = await createEntity(makeEntityInput());
    await incrementFailedAuth(created.entity_id);
    await incrementFailedAuth(created.entity_id);
    const after = await incrementFailedAuth(created.entity_id);
    expect(after.failed_auth_attempts).toBe(3);
  });

  it("writes an audit row each time it is called", async () => {
    const created = await createEntity(makeEntityInput());
    await incrementFailedAuth(created.entity_id);
    await incrementFailedAuth(created.entity_id);
    const logs = await auditRowsFor(created.entity_id);
    const fails = logs.filter(
      (l) => l.action === "ENTITY_FAILED_AUTH_INCREMENT",
    );
    expect(fails.length).toBe(2);
  });
});

describe("resetFailedAuth", () => {
  it("sets failed_auth_attempts back to zero", async () => {
    const created = await createEntity(makeEntityInput());
    await incrementFailedAuth(created.entity_id);
    await incrementFailedAuth(created.entity_id);
    const after = await resetFailedAuth(created.entity_id);
    expect(after.failed_auth_attempts).toBe(0);
  });

  it("writes an ENTITY_FAILED_AUTH_RESET audit row", async () => {
    const created = await createEntity(makeEntityInput());
    await resetFailedAuth(created.entity_id);
    const logs = await auditRowsFor(created.entity_id);
    const resets = logs.filter(
      (l) => l.action === "ENTITY_FAILED_AUTH_RESET",
    );
    expect(resets.length).toBe(1);
  });
});

describe("listEntities", () => {
  it("returns entities matching the entity_type filter", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );

    const persons = await listEntities({ entity_type: "PERSON" });
    const companies = await listEntities({ entity_type: "COMPANY" });

    expect(persons.some((e) => e.entity_id === person.entity_id)).toBe(true);
    expect(persons.some((e) => e.entity_id === company.entity_id)).toBe(false);
    expect(companies.some((e) => e.entity_id === company.entity_id)).toBe(true);
  });

  it("returns entities matching the status filter", async () => {
    const a = await createEntity(makeEntityInput());
    const b = await createEntity(makeEntityInput());
    await updateEntityStatus(b.entity_id, "SUSPENDED");

    const active = await listEntities({ status: "ACTIVE" });
    const suspended = await listEntities({ status: "SUSPENDED" });

    expect(active.some((e) => e.entity_id === a.entity_id)).toBe(true);
    expect(active.some((e) => e.entity_id === b.entity_id)).toBe(false);
    expect(suspended.some((e) => e.entity_id === b.entity_id)).toBe(true);
  });

  it("hides soft-deleted entities by default", async () => {
    const created = await createEntity(makeEntityInput());
    await updateEntityStatus(created.entity_id, "DELETED");
    const list = await listEntities({});
    expect(list.some((e) => e.entity_id === created.entity_id)).toBe(false);
  });

  it("includes soft-deleted entities when include_deleted is true", async () => {
    const created = await createEntity(makeEntityInput());
    await updateEntityStatus(created.entity_id, "DELETED");
    const list = await listEntities({ include_deleted: true });
    expect(list.some((e) => e.entity_id === created.entity_id)).toBe(true);
  });

  it("writes an ENTITY_LIST audit row each time it is called", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "ENTITY_LIST" },
    });
    await listEntities({ entity_type: "PERSON" });
    const after = await prisma.auditLog.count({
      where: { action: "ENTITY_LIST" },
    });
    expect(after).toBe(before + 1);
  });
});
