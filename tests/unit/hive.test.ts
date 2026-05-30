// FILE: hive.test.ts (unit)
// PURPOSE: Verify the Hive Intelligence flows -- create, invite,
//          remove, build aggregate, read intelligence -- plus the
//          two privacy / access guarantees the spec calls out:
//          aggregate never contains entity_ids; removed members
//          lose access immediately.
// CONNECTS TO: HiveService, AuthService, WriteService (for fixture
//              capsules), MemoryNonceStore, MemoryContentStore,
//              ContentEncryption.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  FixtureBasedEmbeddingProvider,
  HiveService,
  MemoryContentStore,
  MemoryNonceStore,
  WriteService,
  type CreateHiveSuccess,
  type InviteSuccess,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

const TEST_JWT_SECRET = "hive-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh stack of services with isolated stores.
// INPUT: None.
// OUTPUT: { auth, write, hive, contentStore }.
// WHY: Each test gets a clean slate.
function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
    new FixtureBasedEmbeddingProvider(),
  );
  const hive = new HiveService(auth, encryption, contentStore);
  return { auth, write, hive, contentStore };
}

// WHAT: Create a fresh COMPANY entity to serve as the "org" parent
//        for hive members. Section 3 Wave 2 (ADR-0059) requires
//        every v1 Hive to resolve a non-null org_entity_id; the
//        loginAs helper binds new PERSON entities into a freshly
//        created org so getOrgEntityId(callerId) resolves.
// INPUT: None.
// OUTPUT: The new org's entity_id.
// WHY: One org per test gives clean RULE 0 isolation between
//      otherwise-unrelated PERSON entities; per-test org also
//      means default-enterprise uniqueness checks never collide.
async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

// WHAT: Bind an entity to an org via EntityMembership (active).
// INPUT: org_entity_id + child_entity_id.
// OUTPUT: A promise resolving once the membership row exists.
// WHY: Section 3 Wave 2 inviteToHive enforces same-org via
//      EntityMembership lookups; tests need that linkage to exist.
async function bindToOrg(orgId: string, childId: string): Promise<void> {
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: childId,
      role_title: "MEMBER",
      is_active: true,
    },
  });
}

// WHAT: Grant can_create_hives on an entity's TAR + refresh tar_hash.
// INPUT: entity_id.
// OUTPUT: A promise resolving once the TAR is updated.
// WHY: Section 3 Wave 2 enforces TAR can_create_hives on
//      createHive; tests need fresh entities to carry the
//      capability before logging in.
async function grantCanCreateHives(entityId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { can_create_hives: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const newHash = computeTARHash({
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: fresh.can_admin_niov,
    can_admin_org: fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { tar_hash: newHash },
  });
}

// WHAT: Create + log in a PERSON entity, bind to an optional shared
//        org, and (optionally) grant `can_create_hives`.
// INPUT: AuthService; ops bag; opts.orgId (shared org; if absent a
//        fresh per-caller org is minted); opts.grantHiveCreate
//        (defaults true so existing tests keep working).
// OUTPUT: { entity, token, orgId }.
// WHY: Section 3 Wave 2 enforcement requires both TAR
//      can_create_hives + an org parent. The helper handles both
//      transparently so legacy test signatures stay short.
async function loginAs(
  auth: AuthService,
  ops: string[] = ["read", "write", "share", "create_hives"],
  opts: { orgId?: string; grantHiveCreate?: boolean } = {},
) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const orgId = opts.orgId ?? (await makeTestOrg());
  await bindToOrg(orgId, entity.entity_id);
  if (opts.grantHiveCreate !== false) {
    await grantCanCreateHives(entity.entity_id);
  }
  const login = await auth.login(input.email!, password, ops, {
    ip_address: null,
  });
  if (!login.ok) throw new Error(`login failed in test setup: ${login.code}`);
  return { entity, token: login.token, orgId };
}

describe("createHive", () => {
  it("creates a hive and adds the creator as the first member", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const result = await hive.createHive(
      founder.token,
      "Test Hive",
      "PERSONAL_NETWORK",
      { membership_min_clearance: 0 },
      { contribution_scope: "FULL", access_scope: "FULL" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = await prisma.hive.findUnique({
      where: { hive_id: result.hive_id },
    });
    expect(row?.created_by).toBe(founder.entity.entity_id);
    expect(row?.member_count).toBe(1);
    expect(row?.status).toBe("ACTIVE");
    const membership = await prisma.hiveMembership.findFirst({
      where: { hive_id: result.hive_id, entity_id: founder.entity.entity_id },
    });
    expect(membership?.status).toBe("ACTIVE");
  });

  it("rejects with INVALID_REQUEST when hive_name is missing", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const result = await hive.createHive(
      founder.token,
      "",
      "PERSONAL_NETWORK",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_REQUEST");
  });

  it("writes a HIVE_CREATED audit event", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const result = (await hive.createHive(
      founder.token,
      "Audited Hive",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    const events = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: founder.entity.entity_id,
        event_type: "HIVE_CREATED",
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(
      events.some((e) => {
        const details = e.details as { hive_id?: string };
        return details.hive_id === result.hive_id;
      }),
    ).toBe(true);
  });
});

describe("inviteToHive", () => {
  it("adds a new member and increments member_count", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const invitee = await loginAs(auth, undefined, { orgId: founder.orgId });
    const created = (await hive.createHive(
      founder.token,
      "Invite Test",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    const result = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity.entity_id,
      { contribution_scope: "SUMMARY", access_scope: "SUMMARY" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member_count).toBe(2);
    const membership = await prisma.hiveMembership.findFirst({
      where: {
        hive_id: created.hive_id,
        entity_id: invitee.entity.entity_id,
      },
    });
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.contribution_scope).toBe("SUMMARY");
  });

  it("rejects when the inviter is not the hive creator", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const intruder = await loginAs(auth);
    const invitee = await loginAs(auth, undefined, { orgId: founder.orgId });
    const created = (await hive.createHive(
      founder.token,
      "Auth Test",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    const result = await hive.inviteToHive(
      intruder.token,
      created.hive_id,
      invitee.entity.entity_id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_HIVE_CREATOR");
  });

  it("rejects when the invitee does not exist", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const created = (await hive.createHive(
      founder.token,
      "Ghost Test",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    const result = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVITEE_NOT_FOUND");
  });

  it("rejects when the entity is already an active member", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const invitee = await loginAs(auth, undefined, { orgId: founder.orgId });
    const created = (await hive.createHive(
      founder.token,
      "Dup Test",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity.entity_id,
    );
    const second = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity.entity_id,
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("ALREADY_MEMBER");
  });
});

describe("removeMember + access revocation", () => {
  it("flips membership.status to REMOVED and decrements count", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const member = await loginAs(auth, undefined, { orgId: founder.orgId });
    const created = (await hive.createHive(
      founder.token,
      "Remove Test",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    await hive.inviteToHive(
      founder.token,
      created.hive_id,
      member.entity.entity_id,
    );
    const result = await hive.removeMember(
      founder.token,
      created.hive_id,
      member.entity.entity_id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member_count).toBe(1);
    const row = await prisma.hiveMembership.findFirst({
      where: {
        hive_id: created.hive_id,
        entity_id: member.entity.entity_id,
      },
    });
    expect(row?.status).toBe("REMOVED");
  });

  it("removed member loses access to hive intelligence", async () => {
    const { auth, hive, write } = makeServices();
    const founder = await loginAs(auth);
    const member = await loginAs(auth, undefined, { orgId: founder.orgId });

    // Create the hive and invite the member.
    const created = (await hive.createHive(
      founder.token,
      "Access Test",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    await hive.inviteToHive(
      founder.token,
      created.hive_id,
      member.entity.entity_id,
    );

    // Three members each contribute capsules with the same tag so
    // the aggregate has at least one common tag. We only have two
    // accounts (founder + member); add one more for the 3-member
    // floor.
    const extra = await loginAs(auth, undefined, { orgId: founder.orgId });
    await hive.inviteToHive(
      founder.token,
      created.hive_id,
      extra.entity.entity_id,
    );
    for (const u of [founder, member, extra]) {
      await write.createCapsule(u.token, {
        capsule_type: "PREFERENCE",
        topic_tags: ["shared"],
        payload_summary: "shared interest",
        content: `content for ${u.entity.entity_id}`,
      });
    }

    // Build the aggregate.
    const built = await hive.buildHiveAggregate(created.hive_id);
    expect(built.ok).toBe(true);

    // Member can read intelligence while ACTIVE.
    const before = await hive.getHiveIntelligence(member.token, created.hive_id);
    expect(before.ok).toBe(true);

    // Founder removes the member.
    const removed = await hive.removeMember(
      founder.token,
      created.hive_id,
      member.entity.entity_id,
    );
    expect(removed.ok).toBe(true);

    // Member's session is still valid (TAR untouched), but the
    // membership row is REMOVED. Intelligence access must fail.
    const after = await hive.getHiveIntelligence(member.token, created.hive_id);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.code).toBe("NOT_HIVE_MEMBER");
  });

  it("rejects remove when the actor is not the hive creator", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const member = await loginAs(auth, undefined, { orgId: founder.orgId });
    const intruder = await loginAs(auth);
    const created = (await hive.createHive(
      founder.token,
      "Auth Remove Test",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    await hive.inviteToHive(
      founder.token,
      created.hive_id,
      member.entity.entity_id,
    );
    const result = await hive.removeMember(
      intruder.token,
      created.hive_id,
      member.entity.entity_id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_HIVE_CREATOR");
  });
});

describe("buildHiveAggregate + getHiveIntelligence", () => {
  it("aggregate contains common tags appearing in 3+ members and NO entity_ids (privacy)", async () => {
    const { auth, hive, write } = makeServices();
    const founder = await loginAs(auth);
    const m1 = await loginAs(auth, undefined, { orgId: founder.orgId });
    const m2 = await loginAs(auth, undefined, { orgId: founder.orgId });
    const m3 = await loginAs(auth, undefined, { orgId: founder.orgId });

    // Section 3 Wave 2: capsule_types_accessible non-empty so
    // the founder's getHiveIntelligence read returns the
    // aggregate (vs the new zero-state when empty). Mirror
    // the same on member invites so every member can read too.
    const created = (await hive.createHive(
      founder.token,
      "Privacy Test",
      "PERSONAL_NETWORK",
      {},
      { capsule_types_accessible: ["PREFERENCE"] },
    )) as CreateHiveSuccess;
    for (const m of [m1, m2, m3]) {
      const inv = (await hive.inviteToHive(
        founder.token,
        created.hive_id,
        m.entity.entity_id,
        { capsule_types_accessible: ["PREFERENCE"] },
      )) as InviteSuccess;
      void inv;
    }

    // m1, m2, m3 all share the "travel" tag (3 members) -> survives floor.
    // founder has its own private tag that nobody else has -> dropped.
    for (const m of [m1, m2, m3]) {
      await write.createCapsule(m.token, {
        capsule_type: "PREFERENCE",
        topic_tags: ["travel", `private-${m.entity.entity_id.slice(0, 8)}`],
        payload_summary: "travel preference",
        content: "I love long flights.",
      });
    }
    await write.createCapsule(founder.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["solo-tag-only-founder-has"],
      payload_summary: "founder only",
      content: "founder content",
    });

    const built = await hive.buildHiveAggregate(created.hive_id);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.member_count).toBe(4);
    // 3 members had "travel" -> survives. The "private-*" tags are
    // unique per member so they should NOT survive the 3-member floor.
    expect(built.common_tags_count).toBeGreaterThanOrEqual(1);

    const intel = await hive.getHiveIntelligence(founder.token, created.hive_id);
    expect(intel.ok).toBe(true);
    if (!intel.ok) return;
    expect(intel.intelligence?.common_topic_tags).toContain("travel");

    // PRIVACY ASSERTION: serialize the entire intelligence object
    // and verify it contains NONE of the member entity_ids.
    const serialized = JSON.stringify(intel.intelligence);
    for (const m of [founder, m1, m2, m3]) {
      expect(serialized).not.toContain(m.entity.entity_id);
    }
    // Also: solo founder tag should NOT appear.
    expect(intel.intelligence?.common_topic_tags).not.toContain(
      "solo-tag-only-founder-has",
    );
  });

  it("getHiveIntelligence returns null intelligence before any aggregate is built", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginAs(auth);
    const created = (await hive.createHive(
      founder.token,
      "Empty Hive",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    const result = await hive.getHiveIntelligence(
      founder.token,
      created.hive_id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intelligence).toBeNull();
  });

  it("non-member cannot read hive intelligence", async () => {
    const { auth, hive, write } = makeServices();
    const founder = await loginAs(auth);
    const stranger = await loginAs(auth);

    const created = (await hive.createHive(
      founder.token,
      "Closed Hive",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    await write.createCapsule(founder.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["x"],
      payload_summary: "x",
      content: "x",
    });
    await hive.buildHiveAggregate(created.hive_id);

    const result = await hive.getHiveIntelligence(
      stranger.token,
      created.hive_id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_HIVE_MEMBER");
  });

  it("re-building updates the existing aggregate capsule and bumps version", async () => {
    const { auth, hive, write } = makeServices();
    const founder = await loginAs(auth);
    const created = (await hive.createHive(
      founder.token,
      "Update Hive",
      "PERSONAL_NETWORK",
    )) as CreateHiveSuccess;
    await write.createCapsule(founder.token, {
      capsule_type: "PREFERENCE",
      topic_tags: ["one"],
      payload_summary: "x",
      content: "x",
    });
    const first = await hive.buildHiveAggregate(created.hive_id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await hive.buildHiveAggregate(created.hive_id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Same aggregate_capsule_id reused.
    expect(second.aggregate_capsule_id).toBe(first.aggregate_capsule_id);
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: first.aggregate_capsule_id },
    });
    expect(row?.version).toBeGreaterThan(1);
  });
});
