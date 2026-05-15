// FILE: helpers.ts
// PURPOSE: Shared utilities for the test suite -- generating unique test
//          data and cleaning up rows that tests create. Production code
//          never hard-deletes (Rule 10), but a test database has to be
//          kept tidy or it fills up forever.
// CONNECTS TO: The Vitest config, every file under /tests, and the Prisma
//              client exported by @niov/database.

import { randomUUID } from "node:crypto";
import { beforeEach } from "vitest";
import {
  FixtureBasedLLMProvider,
  type LLMProvider,
  type RateLimitStore,
} from "@niov/api";
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

// WHAT: Build a CreateEntityInput object for a REGULATOR fixture with
//        safe random values. REGULATOR is DISTINCT FROM GOVERNMENT
//        per ADR-0036 Sub-decision 1; this helper exists so tests do
//        not accidentally use GOVERNMENT for regulator-access flows.
// INPUT: An optional partial override; entity_type override to anything
//        other than REGULATOR is rejected at the type level.
// OUTPUT: A CreateEntityInput with entity_type pinned to REGULATOR.
// WHY: REGULATOR test setup needs entity_type === "REGULATOR" + regulator-
//      specific TAR fields populated separately via updateTARPermissions
//      (or via direct prisma.tokenAttributeRepository.update). This
//      helper produces a consistent REGULATOR entity input; tests
//      populate regulator_jurisdiction / regulator_authority_scope /
//      regulator_credentialed_by on the auto-created TAR per their
//      validation needs.
export function makeRegulatorEntityInput(
  overrides: Omit<Partial<CreateEntityInput>, "entity_type"> = {},
): CreateEntityInput {
  const id = randomUUID();
  return {
    entity_type: "REGULATOR" satisfies EntityType,
    display_name: `${TEST_PREFIX}regulator_${id}`,
    public_key: `regulator_pk_${id}`,
    email: `${TEST_PREFIX}regulator_${id}@niov.test`,
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

// WHAT: Stand up a fresh Otzar APPLICATION entity for tests that
//        need an OTZAR_ENTITY_ID without depending on .env.
// INPUT: None.
// OUTPUT: The new Otzar entity_id.
// WHY: Most Section 11 tests reference Otzar; rather than each test
//      seeding it inline, this helper centralizes the setup so the
//      pattern stays DRY. Calls seedOtzarEntity with an empty env
//      (forces creation path) and returns the resulting id.
export async function createOtzarApplicationEntity(): Promise<string> {
  const { seedOtzarEntity } = await import("@niov/api");
  const result = await seedOtzarEntity({});
  return result.otzar_entity_id;
}

// WHAT: Construct a test-side LLMProvider adapter that wraps
//        FixtureBasedLLMProvider with a pre-bound fixture key.
// INPUT: fixtureKey -- the recorded fixture identifier per ADR-0014.
// OUTPUT: An LLMProvider whose generateResponse routes to
//          FixtureBasedLLMProvider with the bound key.
// WHY: Production code at otzar.service.ts:400, :627 and
//      observation.service.ts:295 calls
//      provider.generateResponse(args) without opts. Tests need to
//      dispatch by fixtureKey without modifying production call
//      sites. The adapter satisfies the LLMProvider interface
//      and pre-binds the fixture key internally; production code
//      remains unchanged.
//
//      Per Track A Gate 5 Decision 3 (test-side adapter pattern).
//      The 4 fixture-migration target test files
//      (tests/integration/otzar-routes.test.ts,
//       tests/integration/observation-routes.test.ts,
//       tests/unit/otzar.test.ts, tests/unit/observation.test.ts)
//      use this helper instead of `new MockLLMProvider([...])` for
//      their happy-path test cases that map to recorded fixtures.
//      Tests that script error sequences (circuit-breaker matrix,
//      retry tests) continue using MockLLMProvider directly per
//      ADR-0012's preservation.
export function makeFixtureProvider(fixtureKey: string): LLMProvider {
  const provider = new FixtureBasedLLMProvider();
  return {
    name: provider.name,
    generateResponse(args, _opts) {
      return provider.generateResponse(args, { fixtureKey });
    },
  };
}

// WHAT: Construct a test-side LLMProvider adapter that wraps
//        FixtureBasedLLMProvider with a SEQUENCE of pre-bound
//        fixture keys, dispensing them one per generateResponse
//        call in order.
// INPUT: keys -- array of recorded fixture identifiers per
//         ADR-0014, in the order calls will consume them.
// OUTPUT: An LLMProvider whose generateResponse routes the Nth
//          call to FixtureBasedLLMProvider with the Nth key in
//          the sequence.
// WHY: Integration tests (e.g., tests/integration/
//      otzar-routes.test.ts) construct one app in beforeAll and
//      run multiple it() blocks against it. The shared app's
//      LLMProvider is bound at construction time, so a single-key
//      makeFixtureProvider can only serve one fixture's response
//      for ALL calls.
//
//      This helper mirrors MockLLMProvider's sequence-dispensing
//      semantics (FIFO consumption) so integration tests can
//      replay distinct recorded responses across multiple LLM
//      calls within a single app instance.
//
//      Strict failure: if more calls are made than fixtures
//      provided, throws -- mirrors FixtureBasedLLMProvider's
//      strict missing-fixture semantics. Tests that need lenient
//      fallback should use MockLLMProvider directly.
//
//      Per Track A Gate 5 Decision 6 (Drift G5b-G).
export function makeSequencedFixtureProvider(
  keys: readonly string[],
): LLMProvider {
  if (keys.length === 0) {
    throw new Error(
      "makeSequencedFixtureProvider: keys array must be non-empty",
    );
  }
  const provider = new FixtureBasedLLMProvider();
  let callIndex = 0;
  return {
    name: provider.name,
    generateResponse(args, _opts) {
      if (callIndex >= keys.length) {
        throw new Error(
          `makeSequencedFixtureProvider: exhausted ${keys.length} keys; ` +
            `call #${callIndex + 1} has no corresponding fixture. ` +
            `Provide more keys or use MockLLMProvider for lenient sequencing.`,
        );
      }
      const key = keys[callIndex]!;
      callIndex += 1;
      return provider.generateResponse(args, { fixtureKey: key });
    },
  };
}

// WHAT: Reset the rate-limit store between tests.
// INPUT: store -- the RateLimitStore (typically a
//         MemoryRateLimitStore in tests; the helper accepts any
//         impl honoring the RateLimitStore.reset contract).
// OUTPUT: A promise that resolves when reset is complete.
// WHY: Per Drift G4-G, containerized Postgres runs ~37x faster
//      than real Supabase. Rapid-fire test logins now collide
//      with the auth rate limiter that real-Supabase latency
//      naturally avoided. Tests that need clean rate-limit state
//      per case call this in beforeEach.
//
//      Tests that explicitly assert on rate-limit BEHAVIOR
//      (e.g., tests/integration/gateway.test.ts:349) should NOT
//      call this; they should set up rate-limit state
//      deterministically.
export async function resetRateLimits(
  store: RateLimitStore,
): Promise<void> {
  await store.reset();
}

// WHAT: beforeEach convenience that registers resetRateLimits as
//        a hook against the given store.
// INPUT: store -- the RateLimitStore to reset between cases.
// OUTPUT: None (registers a beforeEach hook).
// WHY: Tests that need clean rate-limit state in every describe
//      block can call this once at the describe level rather than
//      repeating beforeEach blocks across many it() cases.
//      Same exclusion as resetRateLimits: rate-limit-BEHAVIOR
//      tests must NOT use this convenience.
export function withCleanRateLimits(store: RateLimitStore): void {
  beforeEach(async () => {
    await resetRateLimits(store);
  });
}
