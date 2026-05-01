// FILE: permission.test.ts
// PURPOSE: Verify the eight Permission query functions plus the
//          sovereignty rules from Rule 0 (only PERSON can grant
//          LONG_TERM/PERMANENT, AI_AGENT cannot grant to AI_AGENT,
//          grantor must own the capsule's wallet) and the three
//          required behaviors the spec calls out.
// CONNECTS TO: permission.ts under /packages/database/src/queries/,
//              the permissions table, and the audit table.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkPermission,
  createCapsule,
  createEntity,
  createPermission,
  createPermissionBridge,
  expireOldPermissions,
  getWalletByEntityId,
  listPermissionsGranted,
  listPermissionsReceived,
  prisma,
  revokeBridge,
  revokePermission,
} from "@niov/database";
import {
  cleanupTestData,
  makeCapsuleInput,
  makeEntityInput,
} from "../helpers.js";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Set up a grantor (PERSON), a grantee (PERSON), and one capsule
//        owned by the grantor.
// INPUT: None.
// OUTPUT: { grantor, grantee, capsule } with their ids and rows.
// WHY: Most permission tests need this triad. Encapsulating it keeps
//      each test focused on the permission behavior under test.
async function makeGrantSetup() {
  const grantor = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  const grantee = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  const wallet = await getWalletByEntityId(grantor.entity_id);
  const capsule = await createCapsule(
    makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
  );
  return { grantor, grantee, capsule };
}

describe("createPermission -- basic behavior", () => {
  it("creates a permission row with the requested fields", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    expect(permission.permission_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(permission.bridge_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(permission.access_scope).toBe("SUMMARY");
    expect(permission.duration_type).toBe("TEMPORARY");
    expect(permission.status).toBe("ACTIVE");
    expect(permission.expires_at).toBeInstanceOf(Date);
  });

  it("defaults TEMPORARY expires_at to ~24 hours from now", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const before = Date.now();
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const after = Date.now();
    const expiry = permission.expires_at!.getTime();
    expect(expiry).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
    expect(expiry).toBeLessThan(after + 25 * 60 * 60 * 1000);
  });

  it("defaults PERMANENT to expires_at = null", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "PERMANENT",
    });
    expect(permission.expires_at).toBeNull();
  });

  it("writes a PERMISSION_CREATE audit row tied to the grantor", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const logs = await prisma.auditLog.findMany({
      where: {
        entity_id: grantor.entity_id,
        action: "PERMISSION_CREATE",
      },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Sovereignty: only PERSON can grant LONG_TERM or PERMANENT", () => {
  it("PERSON can grant LONG_TERM", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "LONG_TERM",
    });
    expect(permission.duration_type).toBe("LONG_TERM");
  });

  it("AI_AGENT cannot grant LONG_TERM", async () => {
    const aiGrantor = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const grantee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(aiGrantor.entity_id);
    const capsule = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, aiGrantor.entity_id),
    );
    await expect(
      createPermission({
        capsule_id: capsule.capsule_id,
        grantor_entity_id: aiGrantor.entity_id,
        grantee_entity_id: grantee.entity_id,
        access_scope: "FULL",
        duration_type: "LONG_TERM",
      }),
    ).rejects.toThrow(/Sovereignty/);
  });

  it("AI_AGENT cannot grant PERMANENT", async () => {
    const aiGrantor = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const grantee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(aiGrantor.entity_id);
    const capsule = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, aiGrantor.entity_id),
    );
    await expect(
      createPermission({
        capsule_id: capsule.capsule_id,
        grantor_entity_id: aiGrantor.entity_id,
        grantee_entity_id: grantee.entity_id,
        access_scope: "FULL",
        duration_type: "PERMANENT",
      }),
    ).rejects.toThrow(/Sovereignty/);
  });

  it("COMPANY cannot grant PERMANENT", async () => {
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const grantee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(company.entity_id);
    const capsule = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, company.entity_id),
    );
    await expect(
      createPermission({
        capsule_id: capsule.capsule_id,
        grantor_entity_id: company.entity_id,
        grantee_entity_id: grantee.entity_id,
        access_scope: "FULL",
        duration_type: "PERMANENT",
      }),
    ).rejects.toThrow(/Sovereignty/);
  });
});

describe("Sovereignty: AI_AGENT cannot grant to AI_AGENT", () => {
  it("AI_AGENT to AI_AGENT grant is rejected", async () => {
    const aiA = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const aiB = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const wallet = await getWalletByEntityId(aiA.entity_id);
    const capsule = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, aiA.entity_id),
    );
    await expect(
      createPermission({
        capsule_id: capsule.capsule_id,
        grantor_entity_id: aiA.entity_id,
        grantee_entity_id: aiB.entity_id,
        access_scope: "SUMMARY",
        duration_type: "TEMPORARY",
      }),
    ).rejects.toThrow(/AI_AGENT/);
  });

  it("AI_AGENT to PERSON grant is allowed", async () => {
    const aiGrantor = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const human = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(aiGrantor.entity_id);
    const capsule = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, aiGrantor.entity_id),
    );
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: aiGrantor.entity_id,
      grantee_entity_id: human.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    expect(permission.status).toBe("ACTIVE");
  });
});

describe("Sovereignty: grantor must own the capsule's wallet", () => {
  it("rejects when grantor does not own the capsule", async () => {
    const owner = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const interloper = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const grantee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(owner.entity_id);
    const capsule = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, owner.entity_id),
    );
    await expect(
      createPermission({
        capsule_id: capsule.capsule_id,
        grantor_entity_id: interloper.entity_id,
        grantee_entity_id: grantee.entity_id,
        access_scope: "FULL",
        duration_type: "TEMPORARY",
      }),
    ).rejects.toThrow(/Sovereignty/);
  });
});

describe("AI_AGENT grantor defaults to SESSION_ONLY", () => {
  it("uses SESSION_ONLY when no duration_type is passed", async () => {
    const aiGrantor = await createEntity(
      makeEntityInput({ entity_type: "AI_AGENT", email: null }),
    );
    const human = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(aiGrantor.entity_id);
    const capsule = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, aiGrantor.entity_id),
    );
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: aiGrantor.entity_id,
      grantee_entity_id: human.entity_id,
      access_scope: "SUMMARY",
    });
    expect(permission.duration_type).toBe("SESSION_ONLY");
  });
});

describe("checkPermission", () => {
  it("returns the permission for a valid ACTIVE grant", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const created = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const result = await checkPermission(capsule.capsule_id, grantee.entity_id);
    expect(result?.permission_id).toBe(created.permission_id);
  });

  it("returns null when no permission exists", async () => {
    const { grantee, capsule } = await makeGrantSetup();
    const result = await checkPermission(capsule.capsule_id, grantee.entity_id);
    expect(result).toBeNull();
  });

  it("returns null for an expired permission", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
      expires_at: new Date(Date.now() - 1000),
    });
    const result = await checkPermission(capsule.capsule_id, grantee.entity_id);
    expect(result).toBeNull();
  });

  it("returns null for a revoked permission", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    await revokePermission(permission.permission_id, grantor.entity_id);
    const result = await checkPermission(capsule.capsule_id, grantee.entity_id);
    expect(result).toBeNull();
  });

  it("returns null when an explicit NONE block exists, even if a grant also exists", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "METADATA_ONLY",
      duration_type: "NONE",
    });
    const result = await checkPermission(capsule.capsule_id, grantee.entity_id);
    expect(result).toBeNull();
  });

  it("writes a PERMISSION_CHECK audit row", async () => {
    const { grantee, capsule } = await makeGrantSetup();
    await checkPermission(capsule.capsule_id, grantee.entity_id);
    const logs = await prisma.auditLog.findMany({
      where: {
        entity_id: grantee.entity_id,
        action: "PERMISSION_CHECK",
      },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("revokePermission", () => {
  it("flips status to REVOKED and stamps revoker fields", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const permission = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const after = await revokePermission(
      permission.permission_id,
      grantor.entity_id,
    );
    expect(after.status).toBe("REVOKED");
    expect(after.revoked_at).toBeInstanceOf(Date);
    expect(after.revoked_by_entity_id).toBe(grantor.entity_id);
  });
});

describe("createPermissionBridge and revokeBridge", () => {
  it("creates one row per capsule, all sharing one bridge_id", async () => {
    const grantor = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const grantee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(grantor.entity_id);
    const c1 = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
    );
    const c2 = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
    );
    const c3 = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
    );

    const bridge = await createPermissionBridge(
      [c1.capsule_id, c2.capsule_id, c3.capsule_id],
      grantor.entity_id,
      grantee.entity_id,
      "SUMMARY",
      { duration_type: "TEMPORARY" },
    );
    expect(bridge.length).toBe(3);
    const bridgeIds = new Set(bridge.map((p) => p.bridge_id));
    expect(bridgeIds.size).toBe(1);
  });

  it("revokeBridge revokes ALL permissions sharing that bridge_id", async () => {
    const grantor = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const grantee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(grantor.entity_id);
    const c1 = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
    );
    const c2 = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
    );

    const bridge = await createPermissionBridge(
      [c1.capsule_id, c2.capsule_id],
      grantor.entity_id,
      grantee.entity_id,
      "SUMMARY",
      { duration_type: "TEMPORARY" },
    );

    const count = await revokeBridge(bridge[0]!.bridge_id, grantor.entity_id);
    expect(count).toBe(2);

    const checkA = await checkPermission(c1.capsule_id, grantee.entity_id);
    const checkB = await checkPermission(c2.capsule_id, grantee.entity_id);
    expect(checkA).toBeNull();
    expect(checkB).toBeNull();
  });

  it("revokeBridge does not touch permissions from other bridges", async () => {
    const grantor = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const grantee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const wallet = await getWalletByEntityId(grantor.entity_id);
    const c1 = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
    );
    const c2 = await createCapsule(
      makeCapsuleInput(wallet!.wallet_id, grantor.entity_id),
    );

    const bridgeA = await createPermissionBridge(
      [c1.capsule_id],
      grantor.entity_id,
      grantee.entity_id,
      "SUMMARY",
      { duration_type: "TEMPORARY" },
    );
    const bridgeB = await createPermissionBridge(
      [c2.capsule_id],
      grantor.entity_id,
      grantee.entity_id,
      "FULL",
      { duration_type: "TEMPORARY" },
    );

    await revokeBridge(bridgeA[0]!.bridge_id, grantor.entity_id);
    const survivor = await checkPermission(c2.capsule_id, grantee.entity_id);
    expect(survivor?.permission_id).toBe(bridgeB[0]!.permission_id);
  });
});

describe("listPermissionsGranted / listPermissionsReceived", () => {
  it("listPermissionsGranted returns rows where the entity is the grantor", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const created = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const list = await listPermissionsGranted(grantor.entity_id);
    expect(list.some((p) => p.permission_id === created.permission_id)).toBe(
      true,
    );
  });

  it("listPermissionsReceived returns rows where the entity is the grantee", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const created = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
    });
    const list = await listPermissionsReceived(grantee.entity_id);
    expect(list.some((p) => p.permission_id === created.permission_id)).toBe(
      true,
    );
  });
});

describe("expireOldPermissions", () => {
  it("flips ACTIVE+expired permissions to EXPIRED and leaves others alone", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const stillFresh = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "SUMMARY",
      duration_type: "TEMPORARY",
    });
    const stale = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "TEMPORARY",
      expires_at: new Date(Date.now() - 10_000),
    });

    const swept = await expireOldPermissions();
    expect(swept).toBeGreaterThanOrEqual(1);

    const stillFreshAfter = await prisma.permission.findUnique({
      where: { permission_id: stillFresh.permission_id },
    });
    const staleAfter = await prisma.permission.findUnique({
      where: { permission_id: stale.permission_id },
    });
    expect(stillFreshAfter?.status).toBe("ACTIVE");
    expect(staleAfter?.status).toBe("EXPIRED");
  });

  it("never expires PERMANENT permissions (expires_at is null)", async () => {
    const { grantor, grantee, capsule } = await makeGrantSetup();
    const permanent = await createPermission({
      capsule_id: capsule.capsule_id,
      grantor_entity_id: grantor.entity_id,
      grantee_entity_id: grantee.entity_id,
      access_scope: "FULL",
      duration_type: "PERMANENT",
    });
    await expireOldPermissions();
    const after = await prisma.permission.findUnique({
      where: { permission_id: permanent.permission_id },
    });
    expect(after?.status).toBe("ACTIVE");
  });

  it("writes a PERMISSION_EXPIRY_SWEEP audit row", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "PERMISSION_EXPIRY_SWEEP" },
    });
    await expireOldPermissions();
    const after = await prisma.auditLog.count({
      where: { action: "PERMISSION_EXPIRY_SWEEP" },
    });
    expect(after).toBe(before + 1);
  });
});
