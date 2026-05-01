// FILE: tar.test.ts
// PURPOSE: Verify the TAR query functions, the auto-creation rule
//          (entity creation creates Entity + Wallet + TAR atomically),
//          the tar_hash recomputation on update, and the session
//          invalidation cascade when a TAR mutates.
// CONNECTS TO: tar.ts under /packages/database/src/queries, the
//              token_attribute_repositories table, and the sessions
//              table that gets invalidated when a TAR changes.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkCapability,
  computeTARHash,
  createEntity,
  createTAR,
  defaultCeilingFor,
  getTARByEntityId,
  getWalletByEntityId,
  invalidateEntitySessions,
  prisma,
  updateTARPermissions,
} from "@niov/database";
import { cleanupTestData, makeEntityInput } from "../helpers.js";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Insert an ACTIVE Session row directly for an entity. Section 2
//        will introduce a real createSession; until then, tests need
//        to fabricate sessions to verify TAR-driven invalidation.
// INPUT: The entity_id and the tar_hash to snapshot into the session.
// OUTPUT: The created Session record.
// WHY: TAR mutation has to flip these to INVALIDATED. We need a way
//      to plant them in the test setup.
async function makeActiveSession(entityId: string, tarHash: string) {
  return prisma.session.create({
    data: {
      entity_id: entityId,
      tar_hash_at_creation: tarHash,
      allowed_operations: ["read"],
      clearance_ceiling: 6,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
}

describe("createEntity now creates Entity + Wallet + TAR atomically", () => {
  it("a freshly created PERSON has a wallet AND a TAR", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(person.entity_id);
    const tar = await getTARByEntityId(person.entity_id);
    expect(wallet).not.toBeNull();
    expect(tar).not.toBeNull();
    expect(tar?.entity_id).toBe(person.entity_id);
  });

  it("emits ENTITY_CREATE, WALLET_CREATE, and TAR_CREATE audit rows in one transaction", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const logs = await prisma.auditLog.findMany({
      where: { entity_id: person.entity_id },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("ENTITY_CREATE");
    expect(actions).toContain("WALLET_CREATE");
    expect(actions).toContain("TAR_CREATE");
  });

  it("PERSON gets clearance_ceiling 6 by default", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);
    expect(tar?.clearance_ceiling).toBe(6);
  });

  it("AI_AGENT gets clearance_ceiling 2 by default", async () => {
    const agent = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const tar = await getTARByEntityId(agent.entity_id);
    expect(tar?.clearance_ceiling).toBe(2);
  });

  it("DEVICE gets clearance_ceiling 1 by default", async () => {
    const device = await createEntity(
      makeEntityInput({ entity_type: "DEVICE", email: null }),
    );
    const tar = await getTARByEntityId(device.entity_id);
    expect(tar?.clearance_ceiling).toBe(1);
  });

  it("COMPANY gets clearance_ceiling 4 by default", async () => {
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const tar = await getTARByEntityId(company.entity_id);
    expect(tar?.clearance_ceiling).toBe(4);
  });

  it("APPLICATION gets clearance_ceiling 2 by default", async () => {
    const app = await createEntity(
      makeEntityInput({ entity_type: "APPLICATION", email: null }),
    );
    const tar = await getTARByEntityId(app.entity_id);
    expect(tar?.clearance_ceiling).toBe(2);
  });

  it("starts with the schema-default capability flags (login/read/write/share)", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);
    expect(tar?.can_login).toBe(true);
    expect(tar?.can_read_capsules).toBe(true);
    expect(tar?.can_write_capsules).toBe(true);
    expect(tar?.can_share_capsules).toBe(true);
    expect(tar?.can_create_hives).toBe(false);
    expect(tar?.can_access_external_api).toBe(false);
    expect(tar?.can_admin_niov).toBe(false);
    expect(tar?.can_admin_org).toBe(false);
  });

  it("starts with monetization_role=NEITHER and tar_version=1", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);
    expect(tar?.monetization_role).toBe("NEITHER");
    expect(tar?.tar_version).toBe(1);
    expect(tar?.tar_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("createTAR (standalone) uniqueness", () => {
  it("cannot create two TARs for the same entity", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    // Auto-creation already gave the entity a TAR; a second call must fail.
    await expect(createTAR(person.entity_id)).rejects.toThrow();
  });
});

describe("checkCapability", () => {
  it("returns true for default-on capabilities", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    expect(await checkCapability(person.entity_id, "can_login")).toBe(true);
    expect(await checkCapability(person.entity_id, "can_read_capsules")).toBe(
      true,
    );
  });

  it("returns false for default-off capabilities", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    expect(await checkCapability(person.entity_id, "can_admin_niov")).toBe(
      false,
    );
    expect(await checkCapability(person.entity_id, "can_create_hives")).toBe(
      false,
    );
  });

  it("returns false when the entity has no TAR", async () => {
    const result = await checkCapability(
      "00000000-0000-0000-0000-000000000000",
      "can_login",
    );
    expect(result).toBe(false);
  });

  it("returns false when the TAR is REVOKED", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);
    await updateTARPermissions(tar!.tar_id, { status: "REVOKED" });
    expect(await checkCapability(person.entity_id, "can_login")).toBe(false);
  });

  it("returns false when the TAR is SUSPENDED", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);
    await updateTARPermissions(tar!.tar_id, { status: "SUSPENDED" });
    expect(await checkCapability(person.entity_id, "can_login")).toBe(false);
  });
});

describe("updateTARPermissions changes the hash and version", () => {
  it("tar_hash changes when ANY permission is updated", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const before = await getTARByEntityId(person.entity_id);
    const updated = await updateTARPermissions(before!.tar_id, {
      can_create_hives: true,
    });
    expect(updated.tar_hash).not.toBe(before!.tar_hash);
  });

  it("tar_hash changes when clearance_ceiling is updated", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const before = await getTARByEntityId(person.entity_id);
    const updated = await updateTARPermissions(before!.tar_id, {
      clearance_ceiling: 5,
    });
    expect(updated.tar_hash).not.toBe(before!.tar_hash);
    expect(updated.clearance_ceiling).toBe(5);
  });

  it("tar_hash changes when monetization_role is updated", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const before = await getTARByEntityId(person.entity_id);
    const updated = await updateTARPermissions(before!.tar_id, {
      monetization_role: "EARNER",
    });
    expect(updated.tar_hash).not.toBe(before!.tar_hash);
  });

  it("bumps tar_version on every update", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const before = await getTARByEntityId(person.entity_id);
    const v2 = await updateTARPermissions(before!.tar_id, {
      can_create_hives: true,
    });
    const v3 = await updateTARPermissions(before!.tar_id, {
      can_admin_org: true,
    });
    expect(v2.tar_version).toBe(before!.tar_version + 1);
    expect(v3.tar_version).toBe(v2.tar_version + 1);
  });

  it("rejects clearance_ceiling outside 0..6", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);
    await expect(
      updateTARPermissions(tar!.tar_id, { clearance_ceiling: 7 }),
    ).rejects.toThrow(/clearance_ceiling/);
  });
});

describe("Session invalidation when TAR is updated", () => {
  it("flips every ACTIVE session for that entity to INVALIDATED", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);

    const s1 = await makeActiveSession(person.entity_id, tar!.tar_hash);
    const s2 = await makeActiveSession(person.entity_id, tar!.tar_hash);

    await updateTARPermissions(tar!.tar_id, { can_create_hives: true });

    const after1 = await prisma.session.findUnique({
      where: { session_id: s1.session_id },
    });
    const after2 = await prisma.session.findUnique({
      where: { session_id: s2.session_id },
    });
    expect(after1?.status).toBe("INVALIDATED");
    expect(after2?.status).toBe("INVALIDATED");
    expect(after1?.invalidated_at).toBeInstanceOf(Date);
  });

  it("does not touch already-EXPIRED sessions", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);

    const expired = await prisma.session.create({
      data: {
        entity_id: person.entity_id,
        tar_hash_at_creation: tar!.tar_hash,
        allowed_operations: ["read"],
        clearance_ceiling: 6,
        status: "EXPIRED",
        expires_at: new Date(Date.now() - 1000),
      },
    });

    await updateTARPermissions(tar!.tar_id, { can_create_hives: true });

    const after = await prisma.session.findUnique({
      where: { session_id: expired.session_id },
    });
    expect(after?.status).toBe("EXPIRED");
    expect(after?.invalidated_at).toBeNull();
  });

  it("does not invalidate sessions belonging to OTHER entities", async () => {
    const a = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    const b = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    const tarA = await getTARByEntityId(a.entity_id);
    const tarB = await getTARByEntityId(b.entity_id);

    const sessionB = await makeActiveSession(b.entity_id, tarB!.tar_hash);

    await updateTARPermissions(tarA!.tar_id, { can_create_hives: true });

    const after = await prisma.session.findUnique({
      where: { session_id: sessionB.session_id },
    });
    expect(after?.status).toBe("ACTIVE");
  });
});

describe("invalidateEntitySessions (standalone)", () => {
  it("invalidates all ACTIVE sessions for the given entity", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const tar = await getTARByEntityId(person.entity_id);

    await makeActiveSession(person.entity_id, tar!.tar_hash);
    await makeActiveSession(person.entity_id, tar!.tar_hash);
    await makeActiveSession(person.entity_id, tar!.tar_hash);

    const count = await invalidateEntitySessions(
      person.entity_id,
      "ENTITY_SUSPENDED",
    );
    expect(count).toBe(3);
  });

  it("writes a SESSION_INVALIDATE audit row carrying the reason", async () => {
    const person = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await invalidateEntitySessions(person.entity_id, "ADMIN_ACTION");
    const logs = await prisma.auditLog.findMany({
      where: {
        entity_id: person.entity_id,
        action: "SESSION_INVALIDATE",
      },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Sovereignty: AI_AGENT cannot raise AI_AGENT ceiling", () => {
  it("AI_AGENT actor raising another AI_AGENT's ceiling is rejected", async () => {
    const aiA = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const aiB = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const tarB = await getTARByEntityId(aiB.entity_id);
    await expect(
      updateTARPermissions(
        tarB!.tar_id,
        { clearance_ceiling: 4 },
        { actor_entity_id: aiA.entity_id },
      ),
    ).rejects.toThrow(/Sovereignty/);
  });

  it("AI_AGENT actor LOWERING another AI_AGENT's ceiling is allowed", async () => {
    const aiA = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const aiB = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const tarB = await getTARByEntityId(aiB.entity_id);
    const updated = await updateTARPermissions(
      tarB!.tar_id,
      { clearance_ceiling: 1 },
      { actor_entity_id: aiA.entity_id },
    );
    expect(updated.clearance_ceiling).toBe(1);
  });

  it("PERSON actor raising an AI_AGENT's ceiling is allowed", async () => {
    const human = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const ai = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const tar = await getTARByEntityId(ai.entity_id);
    const updated = await updateTARPermissions(
      tar!.tar_id,
      { clearance_ceiling: 4 },
      { actor_entity_id: human.entity_id },
    );
    expect(updated.clearance_ceiling).toBe(4);
  });
});

describe("computeTARHash", () => {
  it("produces a 64-character hex SHA-256", () => {
    const hash = computeTARHash({
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
      can_create_hives: false,
      can_access_external_api: false,
      can_admin_niov: false,
      can_admin_org: false,
      clearance_ceiling: 6,
      monetization_role: "NEITHER",
      compliance_frameworks: [],
      status: "ACTIVE",
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across compliance_frameworks reorderings", () => {
    const a = computeTARHash({
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
      can_create_hives: false,
      can_access_external_api: false,
      can_admin_niov: false,
      can_admin_org: false,
      clearance_ceiling: 6,
      monetization_role: "NEITHER",
      compliance_frameworks: ["GDPR", "HIPAA"],
      status: "ACTIVE",
    });
    const b = computeTARHash({
      can_login: true,
      can_read_capsules: true,
      can_write_capsules: true,
      can_share_capsules: true,
      can_create_hives: false,
      can_access_external_api: false,
      can_admin_niov: false,
      can_admin_org: false,
      clearance_ceiling: 6,
      monetization_role: "NEITHER",
      compliance_frameworks: ["HIPAA", "GDPR"],
      status: "ACTIVE",
    });
    expect(a).toBe(b);
  });
});

describe("defaultCeilingFor table", () => {
  it("matches the sovereignty defaults for every EntityType", () => {
    expect(defaultCeilingFor("PERSON")).toBe(6);
    expect(defaultCeilingFor("COMPANY")).toBe(4);
    expect(defaultCeilingFor("GOVERNMENT")).toBe(4);
    expect(defaultCeilingFor("APPLICATION")).toBe(2);
    expect(defaultCeilingFor("AI_AGENT")).toBe(2);
    expect(defaultCeilingFor("DEVICE")).toBe(1);
  });
});
