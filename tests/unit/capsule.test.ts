// FILE: capsule.test.ts
// PURPOSE: Verify the eight MemoryCapsule query functions, the
//          FOUNDATIONAL-stays-in-HOT special rule, and the soft-delete
//          / metadata-hiding behavior the spec calls out.
// CONNECTS TO: capsule.ts under /packages/database/src/queries/, the
//              memory_capsules table, and the audit table where every
//              capsule operation must leave a row.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCapsule,
  createEntity,
  getCapsuleMetadata,
  getCapsuleWithContent,
  getWalletByEntityId,
  searchByTopicTags,
  updateRelevanceScore,
  updateStorageTier,
  incrementAccessCount,
  softDeleteCapsule,
  prisma,
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

// WHAT: Create an entity, look up its auto-created wallet, and return
//        both ids ready for capsule tests.
// INPUT: None.
// OUTPUT: { entityId, walletId }.
// WHY: Most capsule tests start by needing a wallet to attach to, and
//      this saves three lines of boilerplate per test.
async function setupWalletForTest(): Promise<{
  entityId: string;
  walletId: string;
}> {
  const entity = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  const wallet = await getWalletByEntityId(entity.entity_id);
  return { entityId: entity.entity_id, walletId: wallet!.wallet_id };
}

// WHAT: Helper that fetches the audit rows tied to one entity, newest first.
// INPUT: An entity_id.
// OUTPUT: Array of AuditLog rows.
// WHY: Tests need to confirm Rule 4 -- every capsule action wrote an
//      audit row tied to the right entity.
async function auditRowsFor(entityId: string) {
  return prisma.auditLog.findMany({
    where: { entity_id: entityId },
    orderBy: { created_at: "desc" },
  });
}

describe("createCapsule", () => {
  it("creates a capsule with the requested fields", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));

    expect(created.capsule_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(created.wallet_id).toBe(walletId);
    expect(created.entity_id).toBe(entityId);
    expect(created.version).toBe(1);
    expect(created.relevance_score).toBe(1.0);
    expect(created.feedback_loop_score).toBe(0.0);
    expect(created.storage_tier).toBe("WARM");
    expect(created.access_count).toBe(0);
    expect(created.deleted_at).toBeNull();
  });

  it("writes a CAPSULE_CREATE audit row", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    await createCapsule(makeCapsuleInput(walletId, entityId));
    const logs = await auditRowsFor(entityId);
    expect(logs.some((l) => l.action === "CAPSULE_CREATE")).toBe(true);
  });

  it("rejects relevance_score outside 0..1", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    await expect(
      createCapsule(
        makeCapsuleInput(walletId, entityId, { relevance_score: 1.5 }),
      ),
    ).rejects.toThrow(/relevance_score/);
    await expect(
      createCapsule(
        makeCapsuleInput(walletId, entityId, { relevance_score: -0.1 }),
      ),
    ).rejects.toThrow(/relevance_score/);
  });

  it("rejects clearance_required outside 0..6", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    await expect(
      createCapsule(
        makeCapsuleInput(walletId, entityId, { clearance_required: 7 }),
      ),
    ).rejects.toThrow(/clearance_required/);
  });
});

describe("FOUNDATIONAL decay capsules always live in HOT storage", () => {
  it("forces HOT when decay_type is FOUNDATIONAL even if WARM was requested", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const capsule = await createCapsule(
      makeCapsuleInput(walletId, entityId, {
        decay_type: "FOUNDATIONAL",
        capsule_type: "FOUNDATIONAL",
        storage_tier: "WARM",
      }),
    );
    expect(capsule.storage_tier).toBe("HOT");
  });

  it("keeps HOT when decay_type is FOUNDATIONAL and HOT was requested", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const capsule = await createCapsule(
      makeCapsuleInput(walletId, entityId, {
        decay_type: "FOUNDATIONAL",
        capsule_type: "FOUNDATIONAL",
        storage_tier: "HOT",
      }),
    );
    expect(capsule.storage_tier).toBe("HOT");
  });

  it("refuses to demote a FOUNDATIONAL capsule to WARM via updateStorageTier", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const capsule = await createCapsule(
      makeCapsuleInput(walletId, entityId, {
        decay_type: "FOUNDATIONAL",
        capsule_type: "FOUNDATIONAL",
      }),
    );
    await expect(
      updateStorageTier(capsule.capsule_id, "WARM"),
    ).rejects.toThrow(/FOUNDATIONAL/);
  });

  it("refuses to demote a FOUNDATIONAL capsule to COLD via updateStorageTier", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const capsule = await createCapsule(
      makeCapsuleInput(walletId, entityId, {
        decay_type: "FOUNDATIONAL",
        capsule_type: "FOUNDATIONAL",
      }),
    );
    await expect(
      updateStorageTier(capsule.capsule_id, "COLD"),
    ).rejects.toThrow(/FOUNDATIONAL/);
  });
});

describe("getCapsuleMetadata", () => {
  it("does NOT return the storage_location field", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    const metadata = await getCapsuleMetadata(created.capsule_id);

    expect(metadata).not.toBeNull();
    expect(metadata).not.toHaveProperty("storage_location");
    // sanity: other fields should still be there
    expect(metadata?.capsule_id).toBe(created.capsule_id);
    expect(metadata?.payload_summary).toBe(created.payload_summary);
  });

  it("returns null for a non-existent capsule_id", async () => {
    const result = await getCapsuleMetadata(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeNull();
  });

  it("returns null for a soft-deleted capsule", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await softDeleteCapsule(created.capsule_id);
    const result = await getCapsuleMetadata(created.capsule_id);
    expect(result).toBeNull();
  });

  it("writes a CAPSULE_READ_METADATA audit row", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await getCapsuleMetadata(created.capsule_id);
    const logs = await auditRowsFor(entityId);
    expect(logs.some((l) => l.action === "CAPSULE_READ_METADATA")).toBe(true);
  });
});

describe("getCapsuleWithContent", () => {
  it("returns the full capsule including storage_location", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    const full = await getCapsuleWithContent(created.capsule_id);
    expect(full?.storage_location).toBe(created.storage_location);
  });

  it("returns null for a soft-deleted capsule", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await softDeleteCapsule(created.capsule_id);
    const result = await getCapsuleWithContent(created.capsule_id);
    expect(result).toBeNull();
  });

  it("writes a CAPSULE_READ_WITH_CONTENT audit row", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await getCapsuleWithContent(created.capsule_id);
    const logs = await auditRowsFor(entityId);
    expect(logs.some((l) => l.action === "CAPSULE_READ_WITH_CONTENT")).toBe(
      true,
    );
  });
});

describe("searchByTopicTags", () => {
  it("returns only capsules whose tags overlap with the search tags", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const a = await createCapsule(
      makeCapsuleInput(walletId, entityId, { topic_tags: ["alpha", "beta"] }),
    );
    const b = await createCapsule(
      makeCapsuleInput(walletId, entityId, { topic_tags: ["gamma"] }),
    );

    const matches = await searchByTopicTags({
      walletId,
      tags: ["alpha"],
    });

    expect(matches.some((c) => c.capsule_id === a.capsule_id)).toBe(true);
    expect(matches.some((c) => c.capsule_id === b.capsule_id)).toBe(false);
  });

  it("respects minRelevanceScore", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const high = await createCapsule(
      makeCapsuleInput(walletId, entityId, {
        topic_tags: ["search-high"],
        relevance_score: 0.9,
      }),
    );
    const low = await createCapsule(
      makeCapsuleInput(walletId, entityId, {
        topic_tags: ["search-high"],
        relevance_score: 0.2,
      }),
    );

    const matches = await searchByTopicTags({
      walletId,
      tags: ["search-high"],
      minRelevanceScore: 0.5,
    });

    expect(matches.some((c) => c.capsule_id === high.capsule_id)).toBe(true);
    expect(matches.some((c) => c.capsule_id === low.capsule_id)).toBe(false);
  });

  it("excludes soft-deleted capsules", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(
      makeCapsuleInput(walletId, entityId, { topic_tags: ["search-deleted"] }),
    );
    await softDeleteCapsule(created.capsule_id);
    const matches = await searchByTopicTags({
      walletId,
      tags: ["search-deleted"],
    });
    expect(matches.some((c) => c.capsule_id === created.capsule_id)).toBe(
      false,
    );
  });

  it("does not return capsules from other wallets", async () => {
    const setupA = await setupWalletForTest();
    const setupB = await setupWalletForTest();
    const inA = await createCapsule(
      makeCapsuleInput(setupA.walletId, setupA.entityId, {
        topic_tags: ["shared-tag"],
      }),
    );
    await createCapsule(
      makeCapsuleInput(setupB.walletId, setupB.entityId, {
        topic_tags: ["shared-tag"],
      }),
    );
    const matches = await searchByTopicTags({
      walletId: setupA.walletId,
      tags: ["shared-tag"],
    });
    expect(matches.length).toBe(1);
    expect(matches[0]?.capsule_id).toBe(inA.capsule_id);
  });
});

describe("updateRelevanceScore", () => {
  it("updates the relevance_score field", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    const updated = await updateRelevanceScore(created.capsule_id, 0.42);
    expect(updated.relevance_score).toBeCloseTo(0.42, 5);
  });

  it("rejects scores outside 0..1", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await expect(
      updateRelevanceScore(created.capsule_id, 1.1),
    ).rejects.toThrow(/relevance_score/);
  });

  it("writes a CAPSULE_RELEVANCE_UPDATE audit row", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await updateRelevanceScore(created.capsule_id, 0.5);
    const logs = await auditRowsFor(entityId);
    expect(logs.some((l) => l.action === "CAPSULE_RELEVANCE_UPDATE")).toBe(
      true,
    );
  });
});

describe("updateStorageTier (non-FOUNDATIONAL)", () => {
  it("can promote a TIME_BASED capsule from WARM to HOT", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    const updated = await updateStorageTier(created.capsule_id, "HOT");
    expect(updated.storage_tier).toBe("HOT");
  });

  it("can demote a TIME_BASED capsule to COLD", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    const updated = await updateStorageTier(created.capsule_id, "COLD");
    expect(updated.storage_tier).toBe("COLD");
  });

  it("throws when the capsule does not exist", async () => {
    await expect(
      updateStorageTier("00000000-0000-0000-0000-000000000000", "HOT"),
    ).rejects.toThrow();
  });
});

describe("incrementAccessCount", () => {
  it("adds 1 to access_count and stamps last_accessed_at", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    expect(created.last_accessed_at).toBeNull();
    const after = await incrementAccessCount(created.capsule_id);
    expect(after.access_count).toBe(1);
    expect(after.last_accessed_at).toBeInstanceOf(Date);
  });

  it("can be called repeatedly and keeps counting", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await incrementAccessCount(created.capsule_id);
    await incrementAccessCount(created.capsule_id);
    const after = await incrementAccessCount(created.capsule_id);
    expect(after.access_count).toBe(3);
  });
});

describe("softDeleteCapsule", () => {
  it("sets deleted_at but keeps the row in the database", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await softDeleteCapsule(created.capsule_id);

    const raw = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: created.capsule_id },
    });
    expect(raw).not.toBeNull();
    expect(raw?.deleted_at).toBeInstanceOf(Date);
  });

  it("makes the capsule invisible to getCapsuleMetadata", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await softDeleteCapsule(created.capsule_id);
    const result = await getCapsuleMetadata(created.capsule_id);
    expect(result).toBeNull();
  });

  it("writes a CAPSULE_SOFT_DELETE audit row", async () => {
    const { walletId, entityId } = await setupWalletForTest();
    const created = await createCapsule(makeCapsuleInput(walletId, entityId));
    await softDeleteCapsule(created.capsule_id);
    const logs = await auditRowsFor(entityId);
    expect(logs.some((l) => l.action === "CAPSULE_SOFT_DELETE")).toBe(true);
  });
});
