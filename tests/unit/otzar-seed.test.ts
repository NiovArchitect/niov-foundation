// FILE: otzar-seed.test.ts (unit)
// PURPOSE: Cover seedOtzarEntity's two paths: bootstrap-create
//          (no OTZAR_ENTITY_ID set) and idempotent-update (set).
// CONNECTS TO: services/governance/seeds.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedOtzarEntity } from "@niov/api";
import { prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  // Hard-clean Otzar entities created during tests by their
  // display_name "Otzar" (we only target ones we just minted).
  await prisma.entity.deleteMany({
    where: { display_name: "Otzar", entity_type: "APPLICATION" },
  });
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("seedOtzarEntity", () => {
  it("creates a new APPLICATION entity when OTZAR_ENTITY_ID is unset", async () => {
    const result = await seedOtzarEntity({});
    expect(result.created).toBe(true);
    expect(result.otzar_entity_id).toMatch(/^[0-9a-f-]{36}$/);
    const entity = await prisma.entity.findUnique({
      where: { entity_id: result.otzar_entity_id },
    });
    expect(entity?.entity_type).toBe("APPLICATION");
    expect(entity?.display_name).toBe("Otzar");
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: result.otzar_entity_id },
    });
    // Q1 explicit-false guard: can_create_hives must be false on Otzar.
    expect(tar?.can_create_hives).toBe(false);
    // Otzar-specific capabilities: read/write/share + external_api.
    expect(tar?.can_read_capsules).toBe(true);
    expect(tar?.can_write_capsules).toBe(true);
    expect(tar?.can_share_capsules).toBe(true);
    expect(tar?.can_access_external_api).toBe(true);
    void TEST_PREFIX;
  });

  it("is idempotent: re-running with OTZAR_ENTITY_ID pointing at an existing entity does NOT create a duplicate", async () => {
    const first = await seedOtzarEntity({});
    expect(first.created).toBe(true);
    // Now run again with the env var pointing at the freshly-created
    // entity; created must flip to false and no new entity row should
    // be added.
    const before = await prisma.entity.count({
      where: { entity_type: "APPLICATION", display_name: "Otzar" },
    });
    const second = await seedOtzarEntity({
      OTZAR_ENTITY_ID: first.otzar_entity_id,
    });
    expect(second.created).toBe(false);
    expect(second.otzar_entity_id).toBe(first.otzar_entity_id);
    const after = await prisma.entity.count({
      where: { entity_type: "APPLICATION", display_name: "Otzar" },
    });
    expect(after).toBe(before);
  });
});
