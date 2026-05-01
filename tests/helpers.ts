// FILE: helpers.ts
// PURPOSE: Shared utilities for the test suite -- generating unique test
//          data and cleaning up rows that tests create. Production code
//          never hard-deletes (Rule 10), but a test database has to be
//          kept tidy or it fills up forever.
// CONNECTS TO: The Vitest config, every file under /tests, and the Prisma
//              client exported by @niov/database.

import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import type { CreateEntityInput, EntityType } from "@niov/database";

// WHAT: A short, recognizable prefix used on every piece of test data so
//        the cleanup helper can find and remove only the rows the tests
//        created.
// INPUT: None.
// OUTPUT: A string literal.
// WHY: Without a prefix we would risk wiping rows that real users created.
export const TEST_PREFIX = "__niov_test__";

// WHAT: Build a CreateEntityInput object with safe random values.
// INPUT: An optional partial override so a test can pin specific fields.
// OUTPUT: A complete CreateEntityInput object ready to pass to createEntity.
// WHY: Tests should not collide on unique columns (email). Generating fresh
//      data per test means tests can run in any order and still pass.
export function makeEntityInput(
  overrides: Partial<CreateEntityInput> = {},
): CreateEntityInput {
  const id = randomUUID();
  return {
    entity_type: "PERSON" satisfies EntityType,
    display_name: `${TEST_PREFIX}name_${id}`,
    public_key: `pk_${id}`,
    email: `${TEST_PREFIX}${id}@niov.test`,
    ...overrides,
  };
}

// WHAT: Hard-delete every test row this suite created (entities + their
//        audit logs).
// INPUT: None.
// OUTPUT: A promise that resolves once cleanup is finished.
// WHY: We never hard delete in production, but a test database needs to
//      be wiped between runs or it would fill with stale rows forever.
//      We only target rows whose display_name carries TEST_PREFIX, so
//      real data is never at risk.
export async function cleanupTestData(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);

  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entity_id: { in: ids } },
    });
    await prisma.entity.deleteMany({
      where: { entity_id: { in: ids } },
    });
  }
}
