// FILE: helpers.ts
// PURPOSE: Shared utilities for the test suite -- generating unique test
//          data and cleaning up rows that tests create. Production code
//          never hard-deletes (Rule 10), but a test database has to be
//          kept tidy or it fills up forever.
// CONNECTS TO: The Vitest config, every file under /tests, and the Prisma
//              client exported by @niov/database.

import { randomUUID } from "node:crypto";
import { applyAuditEventTriggers, prisma } from "@niov/database";
import type {
  CreateCapsuleInput,
  CreateEntityInput,
  EntityType,
} from "@niov/database";

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

// WHAT: Build a CreateCapsuleInput object with safe defaults.
// INPUT: The wallet_id and entity_id the capsule belongs to, plus an
//        optional partial override for any other field.
// OUTPUT: A complete CreateCapsuleInput ready to pass to createCapsule.
// WHY: Tests should not have to spell out every required field every
//      time. Defaults match a generic, non-FOUNDATIONAL capsule so
//      tests that DO want FOUNDATIONAL behavior must opt in explicitly.
export function makeCapsuleInput(
  walletId: string,
  entityId: string,
  overrides: Partial<CreateCapsuleInput> = {},
): CreateCapsuleInput {
  const id = randomUUID();
  return {
    wallet_id: walletId,
    entity_id: entityId,
    capsule_type: "PREFERENCE",
    topic_tags: [`${TEST_PREFIX}tag_${id}`],
    decay_type: "TIME_BASED",
    payload_summary: `${TEST_PREFIX}summary_${id}`,
    payload_size_tokens: 100,
    storage_location: `niov-test://capsules/${id}`,
    content_hash: `sha256:${id.replace(/-/g, "")}`,
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

    // audit_events is enforced append-only by a Postgres trigger.
    // Tests still need to clean up the rows their entities created, so
    // we briefly disable the trigger, delete only rows tied to test
    // entities, and re-enable the trigger before exiting.
    try {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events DISABLE TRIGGER USER",
      );
      await prisma.auditEvent.deleteMany({
        where: {
          OR: [
            { actor_entity_id: { in: ids } },
            { target_entity_id: { in: ids } },
          ],
        },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events ENABLE TRIGGER USER",
      );
    }

    await prisma.entity.deleteMany({
      where: { entity_id: { in: ids } },
    });
  }
}

// WHAT: Make sure the append-only Postgres trigger is installed on the
//        audit_events table.
// INPUT: None.
// OUTPUT: A promise that resolves once the trigger is in place.
// WHY: Tests need the trigger active to verify Section 1E behaviors.
//      applyAuditEventTriggers is idempotent, so calling it from
//      every suite's beforeAll is safe.
export async function ensureAuditTriggers(): Promise<void> {
  await applyAuditEventTriggers();
}
