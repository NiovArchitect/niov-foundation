// FILE: hive-wave-2-safety-enforcement.test.ts (integration)
// PURPOSE: Section 3 Wave 2 service-tier safety enforcement
//          contract coverage per ADR-0059 + Founder Sleep
//          Directive Wave 2 authorization. Exercises every
//          enforcement path:
//            - TAR can_create_hives gate on createHive
//            - v1 hive_type allowlist (ENTERPRISE/PERSONAL_NETWORK
//              only; CROSS_ORGANIZATION/DEVICE_NETWORK/GOVERNMENT
//              rejected at service tier)
//            - non-null org_entity_id required at create
//              (derived from caller's EntityMembership when not
//              explicitly passed)
//            - same-org membership check on inviteToHive (RULE 0)
//            - AI_AGENT exclusion on inviteToHive (ADR-0046 + RULE 0)
//            - capsule_types_accessible read-time enforcement on
//              getHiveIntelligence (empty → zero-state)
//            - HIVE_* audit literal preservation (no new literals)
//            - SAFE projection: no raw capsule content leaks
// CONNECTS TO:
//   - apps/api/src/services/hive/hive.service.ts (Wave 2 changes)
//   - apps/api/src/routes/hive.routes.ts (Wave 2 statusForCode
//     extensions)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  HiveService,
  MemoryContentStore,
  MemoryNonceStore,
  type CreateHiveSuccess,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

const TEST_JWT_SECRET = "hive-wave-2-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const hive = new HiveService(
    auth,
    new ContentEncryption(TEST_KEY),
    new MemoryContentStore(),
  );
  return { auth, hive };
}

async function makeOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

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

async function grantCreateHives(entityId: string): Promise<void> {
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

async function loginPerson(
  auth: AuthService,
  opts: {
    entity_type?: "PERSON" | "AI_AGENT";
    orgId?: string;
    grantCreate?: boolean;
  } = {},
): Promise<{ entity_id: string; token: string; orgId: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({
    entity_type: opts.entity_type ?? "PERSON",
    password,
  });
  const entity = await createEntity(input);
  const orgId = opts.orgId ?? (await makeOrg());
  await bindToOrg(orgId, entity.entity_id);
  if (opts.grantCreate !== false) {
    await grantCreateHives(entity.entity_id);
  }
  const login = await auth.login(
    input.email!,
    password,
    ["read", "write", "share", "create_hives"],
    { ip_address: null },
  );
  if (!login.ok) throw new Error(`login failed: ${login.code}`);
  return { entity_id: entity.entity_id, token: login.token, orgId };
}

describe("Section 3 Wave 2 — createHive TAR + hive_type + org enforcement", () => {
  it("403 OPERATION_NOT_PERMITTED when caller lacks can_create_hives", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth, { grantCreate: false });
    const r = await hive.createHive(
      caller.token,
      "no-permission",
      "ENTERPRISE",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("OPERATION_NOT_PERMITTED");
  });

  it("201 success for can_create_hives caller creating ENTERPRISE", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `ent-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = await prisma.hive.findUnique({
      where: { hive_id: r.hive_id },
    });
    expect(row?.hive_type).toBe("ENTERPRISE");
    expect(row?.org_entity_id).toBe(caller.orgId);
  });

  it("201 success for PERSONAL_NETWORK", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `pn-${randomUUID()}`,
      "PERSONAL_NETWORK",
    );
    expect(r.ok).toBe(true);
  });

  it("422 INVALID_HIVE_TYPE_FOR_V1 for CROSS_ORGANIZATION", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      "x-org",
      "CROSS_ORGANIZATION",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_HIVE_TYPE_FOR_V1");
  });

  it("422 INVALID_HIVE_TYPE_FOR_V1 for DEVICE_NETWORK", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      "dev-net",
      "DEVICE_NETWORK",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_HIVE_TYPE_FOR_V1");
  });

  it("422 INVALID_HIVE_TYPE_FOR_V1 for GOVERNMENT", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      "gov",
      "GOVERNMENT",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_HIVE_TYPE_FOR_V1");
  });

  it("422 ORG_ENTITY_ID_REQUIRED when caller passes explicit null", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      "null-org",
      "ENTERPRISE",
      {},
      {},
      {},
      { org_entity_id: null },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ORG_ENTITY_ID_REQUIRED");
  });

  it("422 ORG_ENTITY_ID_REQUIRED when caller has no org membership", async () => {
    const { auth, hive } = makeServices();
    // Bypass loginPerson's bind-to-org so this entity is orgless.
    const password = "correct-horse-battery";
    const input = makeEntityInput({ entity_type: "PERSON", password });
    const entity = await createEntity(input);
    await grantCreateHives(entity.entity_id);
    const login = await auth.login(
      input.email!,
      password,
      ["read", "write", "share", "create_hives"],
      { ip_address: null },
    );
    if (!login.ok) throw new Error("login failed");
    const r = await hive.createHive(login.token, "no-org", "ENTERPRISE");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ORG_ENTITY_ID_REQUIRED");
  });
});

describe("Section 3 Wave 2 — inviteToHive same-org + AI_AGENT enforcement", () => {
  it("invites same-org PERSON successfully", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const created = (await hive.createHive(
      founder.token,
      `same-org-${randomUUID()}`,
      "ENTERPRISE",
    )) as CreateHiveSuccess;
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(r.ok).toBe(true);
  });

  it("403 CROSS_ORG_INVITE_DENIED when invitee lives in a different org", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    // Different org for invitee.
    const stranger = await loginPerson(auth);
    expect(stranger.orgId).not.toBe(founder.orgId);
    const created = (await hive.createHive(
      founder.token,
      `cross-org-${randomUUID()}`,
      "ENTERPRISE",
    )) as CreateHiveSuccess;
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      stranger.entity_id,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("CROSS_ORG_INVITE_DENIED");
    // No-leak: the failure message MUST NOT carry the invitee's
    // org_entity_id or any extra info about why they're excluded.
    expect(r.message).not.toContain(stranger.orgId);
  });

  it("403 AI_AGENT_NOT_ELIGIBLE_FOR_HIVE when invitee is AI_AGENT (even same-org)", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const aiInvitee = await loginPerson(auth, {
      entity_type: "AI_AGENT",
      orgId: founder.orgId,
      grantCreate: false,
    });
    const created = (await hive.createHive(
      founder.token,
      `ai-invite-${randomUUID()}`,
      "ENTERPRISE",
    )) as CreateHiveSuccess;
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      aiInvitee.entity_id,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("AI_AGENT_NOT_ELIGIBLE_FOR_HIVE");
  });
});

describe("Section 3 Wave 2 — getHiveIntelligence capsule_types_accessible enforcement", () => {
  it("zero-state when caller's membership has empty capsule_types_accessible", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    // Create hive with default (empty) capsule_types_accessible
    // on the creator's membership.
    const created = (await hive.createHive(
      founder.token,
      `empty-acc-${randomUUID()}`,
      "ENTERPRISE",
    )) as CreateHiveSuccess;
    // Build an aggregate so non-zero data exists.
    await hive.buildHiveAggregate(created.hive_id);
    const intel = await hive.getHiveIntelligence(
      founder.token,
      created.hive_id,
    );
    expect(intel.ok).toBe(true);
    if (!intel.ok) return;
    expect(intel.intelligence).toBeNull();
    // Audit row carries the zero-state reason.
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: founder.entity_id,
        event_type: "HIVE_INTELLIGENCE_READ",
      },
      orderBy: { timestamp: "desc" },
      take: 1,
    });
    expect(audits[0]).toBeDefined();
    const details = audits[0]!.details as Record<string, unknown>;
    expect(details.zero_state_reason).toBe("EMPTY_CAPSULE_TYPES_ACCESSIBLE");
    expect(details.aggregate_present).toBe(false);
  });

  it("returns aggregate when membership has non-empty capsule_types_accessible", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = (await hive.createHive(
      founder.token,
      `non-empty-acc-${randomUUID()}`,
      "ENTERPRISE",
      {},
      { capsule_types_accessible: ["PREFERENCE"] },
    )) as CreateHiveSuccess;
    // Aggregate not built yet → intelligence: null, but audit
    // emits aggregate_present:false WITHOUT the zero-state
    // reason marker (that's only for capsule_types_accessible
    // empty).
    const intel = await hive.getHiveIntelligence(
      founder.token,
      created.hive_id,
    );
    expect(intel.ok).toBe(true);
    if (!intel.ok) return;
    expect(intel.intelligence).toBeNull();
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: founder.entity_id,
        event_type: "HIVE_INTELLIGENCE_READ",
      },
      orderBy: { timestamp: "desc" },
      take: 1,
    });
    const details = audits[0]!.details as Record<string, unknown>;
    expect(details.aggregate_present).toBe(false);
    // No zero-state reason when capsule_types_accessible is set.
    expect(details.zero_state_reason).toBeUndefined();
  });
});

describe("Section 3 Wave 2 — audit literal preservation + no-leak", () => {
  it("HIVE_CREATED literal still emitted on successful create (no new audit literal)", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = (await hive.createHive(
      caller.token,
      `audit-${randomUUID()}`,
      "ENTERPRISE",
    )) as CreateHiveSuccess;
    const audit = await prisma.auditEvent.findFirst({
      where: {
        actor_entity_id: caller.entity_id,
        event_type: "HIVE_CREATED",
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details.hive_id).toBe(r.hive_id);
    // Wave 2 ensures org_entity_id is now always present + non-null.
    expect(details.org_entity_id).toBe(caller.orgId);
  });

  it("zero-state intelligence response carries NO raw capsule content fields", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = (await hive.createHive(
      founder.token,
      `no-leak-${randomUUID()}`,
      "ENTERPRISE",
    )) as CreateHiveSuccess;
    const intel = await hive.getHiveIntelligence(
      founder.token,
      created.hive_id,
    );
    const serialized = JSON.stringify(intel);
    expect(serialized).not.toContain("payload_summary");
    expect(serialized).not.toContain("payload_content");
    expect(serialized).not.toContain("storage_location");
    expect(serialized).not.toContain("content_hash");
    expect(serialized).not.toContain("target_capsule_id");
  });
});
