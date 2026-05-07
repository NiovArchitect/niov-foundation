// FILE: audit-event-id-surfacing.test.ts (integration)
//
// PURPOSE: All audit_event_id surfacing contract tests.
// Verifies that write-side endpoints return an audit_event_id that
// resolves to a real AuditEvent row. Section 12B.0 added the first
// 6 tests; future sections add tests here when they introduce new
// write endpoints requiring audit-aware-UI integration.
//
// THE CONTRACT BEING TESTED:
// Every audit-aware write endpoint surfaces audit_event_id on its
// success response. The frontend audit-aware UI keys off this field
// to render a clickable "Audit logged: AUDIT_ID_<id>" toast that
// links to the audit row in Security & Audit.
//
// Failure responses intentionally do NOT include audit_event_id;
// audit rows for denied operations are still written server-side
// for compliance/forensic record but are not surfaced to the
// client. See ShareSuccess JSDoc in share.service.ts for the
// architectural rationale.
//
// CONNECTS TO:
// - apps/api/src/services/governance/dandelion.service.ts (Phase3Result)
// - apps/api/src/services/governance/twin.service.ts (CreateTwinResult)
// - apps/api/src/services/cosmp/share.service.ts (ShareSuccess + RevokeSuccess)
// - apps/api/src/routes/org.routes.ts (POST /org/members + PATCH /org/ai-teammates/:id)
// - apps/api/src/routes/cosmp.routes.ts (POST /cosmp/share + DELETE /cosmp/share/:id)

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "audit-event-id-surfacing-secret";
const TEST_KEY = randomBytes(32);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let app: FastifyInstance;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Mint a PERSON entity, flip its TAR to grant the listed admin
//        capabilities, log them in.
// INPUT: Capability flags.
// OUTPUT: { entityId, token, ip }.
// WHY: Mirrors the admin-routes.test.ts pattern. We bypass
//      /platform/orgs's gate by mutating the TAR via prisma directly.
async function makeAdminAndLogin(opts: {
  can_admin_niov?: boolean;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);

  if (opts.can_admin_niov === true || opts.can_admin_org === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: {
        can_admin_niov: opts.can_admin_niov === true,
        can_admin_org: opts.can_admin_org === true,
      },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished mid-test");
    const { computeTARHash } = await import("@niov/database");
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
      where: { entity_id: entity.entity_id },
      data: { tar_hash: newHash },
    });
  }

  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write", "share"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  return {
    entityId: entity.entity_id,
    token: (login.json() as { token: string }).token,
    ip,
  };
}

// WHAT: Build an entire org via Phase 0 and login the admin so the
//        test can drive /org/* and /cosmp/* routes against a real
//        org context.
// INPUT: None.
// OUTPUT: { orgId, adminId, adminToken, adminIp, adminEmail, defaultHiveId }.
async function createOrgAndAdmin(): Promise<{
  orgId: string;
  adminId: string;
  adminToken: string;
  adminIp: string;
  adminEmail: string;
  defaultHiveId: string;
}> {
  const platformAdmin = await makeAdminAndLogin({ can_admin_niov: true });
  const companyName = `${TEST_PREFIX}auditidco_${randomUUID()}`;
  const adminEmail = `${TEST_PREFIX}auditidadmin_${randomUUID()}@niov.test`;
  const adminPassword = "correct-horse-battery";
  const orgResponse = await app.inject({
    method: "POST",
    url: "/api/v1/platform/orgs",
    headers: { authorization: `Bearer ${platformAdmin.token}` },
    payload: {
      company_name: companyName,
      admin_email: adminEmail,
      admin_password: adminPassword,
      industry: "TECH",
    },
    remoteAddress: platformAdmin.ip,
  });
  if (orgResponse.statusCode !== 201) {
    throw new Error(`createOrg failed: ${orgResponse.statusCode}`);
  }
  const orgBody = orgResponse.json() as {
    org_entity_id: string;
    admin_entity_id: string;
    default_hive_id: string;
  };
  const adminIp = `10.99.88.${Math.floor(Math.random() * 254) + 1}`;
  const adminLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: adminEmail,
      password: adminPassword,
      requested_operations: ["read", "write", "share"],
    },
    remoteAddress: adminIp,
  });
  if (adminLogin.statusCode !== 200) {
    throw new Error(`admin login failed: ${adminLogin.statusCode}`);
  }
  return {
    orgId: orgBody.org_entity_id,
    adminId: orgBody.admin_entity_id,
    adminToken: (adminLogin.json() as { token: string }).token,
    adminIp,
    adminEmail,
    defaultHiveId: orgBody.default_hive_id,
  };
}

// WHAT: Assert audit_event_id is a UUID, look it up, assert event_type + SUCCESS.
// INPUT: The audit_event_id to verify, the expected event_type literal.
// OUTPUT: A promise that resolves once all assertions pass.
// WHY: The contract is universal across endpoints; centralizing the
//      assertions keeps each test focused on the endpoint's wiring.
async function assertAuditEventIdResolves(
  auditEventId: unknown,
  expectedEventType: string,
): Promise<void> {
  expect(typeof auditEventId).toBe("string");
  expect(auditEventId).toMatch(UUID_REGEX);
  const row = await prisma.auditEvent.findUnique({
    where: { audit_id: auditEventId as string },
  });
  expect(row).not.toBeNull();
  expect(row!.event_type).toBe(expectedEventType);
  expect(row!.outcome).toBe("SUCCESS");
}

describe("12B.0: audit_event_id surfaced on write endpoint responses", () => {
  // ──────────────────────────────────────────────────────────────────
  // Test 1 -- POST /org/members
  // Endpoint emits ADMIN_ACTION (action=ORG_MEMBER_ADDED).
  // ──────────────────────────────────────────────────────────────────
  it("POST /org/members surfaces audit_event_id resolving to an ADMIN_ACTION row", async () => {
    const ctx = await createOrgAndAdmin();
    const newEmail = `${TEST_PREFIX}auditmem_${randomUUID()}@niov.test`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        email: newEmail,
        password: "correct-horse-battery",
        first_name: "Audit",
        last_name: "Member",
        role_title: "Engineer",
        hierarchy_level: 1,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: true;
      entity_id: string;
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);
    await assertAuditEventIdResolves(body.audit_event_id, "ADMIN_ACTION");
  });

  // ──────────────────────────────────────────────────────────────────
  // Test 2 -- POST /org/onboarding/invite
  // Endpoint emits ADMIN_ACTION (action=ONBOARDING_INVITE_ACCEPTED).
  // Wraps the Phase 3 commit; entity_id must already be a pending
  // member (created via /org/members above).
  // ──────────────────────────────────────────────────────────────────
  it("POST /org/onboarding/invite surfaces audit_event_id resolving to an ADMIN_ACTION row", async () => {
    const ctx = await createOrgAndAdmin();
    // Step 1: create the pending member via /org/members.
    const newEmail = `${TEST_PREFIX}auditinvite_${randomUUID()}@niov.test`;
    const memberResponse = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        email: newEmail,
        password: "correct-horse-battery",
        first_name: "Invite",
        last_name: "Target",
        role_title: "Engineer",
        hierarchy_level: 1,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(memberResponse.statusCode).toBe(201);
    const memberBody = memberResponse.json() as { entity_id: string };

    // Step 2: drive Phase 3 commit.
    const inviteResponse = await app.inject({
      method: "POST",
      url: "/api/v1/org/onboarding/invite",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { entity_id: memberBody.entity_id },
      remoteAddress: ctx.adminIp,
    });
    expect(inviteResponse.statusCode).toBe(200);
    const inviteBody = inviteResponse.json() as {
      ok: true;
      twin_id: string;
      audit_event_id: string;
    };
    expect(inviteBody.ok).toBe(true);
    await assertAuditEventIdResolves(inviteBody.audit_event_id, "ADMIN_ACTION");
  });

  // ──────────────────────────────────────────────────────────────────
  // Test 3 -- POST /org/ai-teammates
  // Endpoint emits ADMIN_ACTION (action=TWIN_CREATED).
  // ──────────────────────────────────────────────────────────────────
  it("POST /org/ai-teammates surfaces audit_event_id resolving to an ADMIN_ACTION row", async () => {
    const ctx = await createOrgAndAdmin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        owner_entity_id: ctx.adminId,
        role_title: `${TEST_PREFIX}role_${randomUUID()}`,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      ok: true;
      entity_id: string;
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);
    await assertAuditEventIdResolves(body.audit_event_id, "ADMIN_ACTION");
  });

  // ──────────────────────────────────────────────────────────────────
  // Test 4 -- PATCH /org/ai-teammates/:id
  // Endpoint emits ADMIN_ACTION (action=AI_TEAMMATE_UPDATE).
  // ──────────────────────────────────────────────────────────────────
  it("PATCH /org/ai-teammates/:id surfaces audit_event_id resolving to an ADMIN_ACTION row", async () => {
    const ctx = await createOrgAndAdmin();
    // Step 1: create a twin to update.
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        owner_entity_id: ctx.adminId,
        role_title: `${TEST_PREFIX}roleforpatch_${randomUUID()}`,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(createResponse.statusCode).toBe(201);
    const twinId = (createResponse.json() as { entity_id: string }).entity_id;

    // Step 2: PATCH a mutable field.
    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/ai-teammates/${twinId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { swarm_enabled: true },
      remoteAddress: ctx.adminIp,
    });
    expect(patchResponse.statusCode).toBe(200);
    const body = patchResponse.json() as {
      ok: true;
      twin_config: { twin_id: string; swarm_enabled: boolean };
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.twin_config.swarm_enabled).toBe(true);
    await assertAuditEventIdResolves(body.audit_event_id, "ADMIN_ACTION");
  });

  // ──────────────────────────────────────────────────────────────────
  // Test 5 -- POST /cosmp/share
  // Endpoint emits PERMISSION_CREATED summary row.
  // ──────────────────────────────────────────────────────────────────
  it("POST /cosmp/share surfaces audit_event_id resolving to a PERMISSION_CREATED row", async () => {
    const ctx = await createOrgAndAdmin();

    // Step 1: admin creates a capsule to share.
    const createCapsule = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: [`${TEST_PREFIX}auditshare_${randomUUID()}`],
        payload_summary: `${TEST_PREFIX}share-summary`,
        content: `${TEST_PREFIX}share-content`,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(createCapsule.statusCode).toBe(201);
    const capsuleId = (createCapsule.json() as { capsule_id: string })
      .capsule_id;

    // Step 2: create a grantee in a separate org so they exist as a TAR.
    const grantee = await createOrgAndAdmin();

    // Step 3: share.
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        grantee_entity_id: grantee.adminId,
        capsule_grants: [
          {
            capsule_id: capsuleId,
            scope: "SUMMARY",
            duration_type: "TEMPORARY",
          },
        ],
      },
      remoteAddress: ctx.adminIp,
    });
    expect(share.statusCode).toBe(201);
    const body = share.json() as {
      ok: true;
      bridge_id: string;
      permissions_created: string[];
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.bridge_id).toMatch(UUID_REGEX);
    await assertAuditEventIdResolves(body.audit_event_id, "PERMISSION_CREATED");
  });

  // ──────────────────────────────────────────────────────────────────
  // Test 6 -- DELETE /cosmp/share/:bridgeId
  // Endpoint emits PERMISSION_REVOKED summary row.
  // ──────────────────────────────────────────────────────────────────
  it("DELETE /cosmp/share/:bridgeId surfaces audit_event_id resolving to a PERMISSION_REVOKED row", async () => {
    const ctx = await createOrgAndAdmin();

    // Step 1: create capsule.
    const createCapsule = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/capsule",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        capsule_type: "PREFERENCE",
        topic_tags: [`${TEST_PREFIX}auditrevoke_${randomUUID()}`],
        payload_summary: `${TEST_PREFIX}revoke-summary`,
        content: `${TEST_PREFIX}revoke-content`,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(createCapsule.statusCode).toBe(201);
    const capsuleId = (createCapsule.json() as { capsule_id: string })
      .capsule_id;

    // Step 2: create grantee + share.
    const grantee = await createOrgAndAdmin();
    const share = await app.inject({
      method: "POST",
      url: "/api/v1/cosmp/share",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        grantee_entity_id: grantee.adminId,
        capsule_grants: [
          {
            capsule_id: capsuleId,
            scope: "SUMMARY",
            duration_type: "TEMPORARY",
          },
        ],
      },
      remoteAddress: ctx.adminIp,
    });
    expect(share.statusCode).toBe(201);
    const bridgeId = (share.json() as { bridge_id: string }).bridge_id;

    // Step 3: revoke.
    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/cosmp/share/${bridgeId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(revoke.statusCode).toBe(200);
    const body = revoke.json() as {
      ok: true;
      bridge_id: string;
      revoked_count: number;
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.bridge_id).toBe(bridgeId);
    await assertAuditEventIdResolves(body.audit_event_id, "PERMISSION_REVOKED");
  });

  // ──────────────────────────────────────────────────────────────────
  // Test 7 -- POST /org/ai-teammates/:id/skills
  // Endpoint emits ADMIN_ACTION (action=TWIN_SKILLS_ASSIGNED).
  // 12B-FOUNDATION (skills audit) extension: this handler had no
  // audit emission before today (Section 1E Rule 4 violation surfaced
  // during 12B.3 pre-flight). Now emits + surfaces audit_event_id,
  // matching the contract on the 6 prior write endpoints.
  //
  // Q1(b) -- details payload includes twin_owner_entity_id so
  // forensic analysis is self-contained without an EntityMembership
  // join 18 months from now.
  // ──────────────────────────────────────────────────────────────────
  it("POST /org/ai-teammates/:id/skills surfaces audit_event_id resolving to an ADMIN_ACTION row", async () => {
    const ctx = await createOrgAndAdmin();

    // Step 1: create a twin owned by the admin.
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        owner_entity_id: ctx.adminId,
        role_title: `${TEST_PREFIX}roleforskills_${randomUUID()}`,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(createResponse.statusCode).toBe(201);
    const twinId = (createResponse.json() as { entity_id: string }).entity_id;

    // Step 2: create a SkillPackage locally. seedSkillPackages() at
    // apps/api/src/services/governance/seeds.ts is a no-op stub
    // (Section 9 product work pending), so we manually insert one
    // for this test to avoid fresh-vs-warm-container state dependency.
    const pkg = await prisma.skillPackage.create({
      data: {
        name: `${TEST_PREFIX}audit_skill_assign_${randomUUID()}`,
        category: "test",
        description: "Test package for skill-assign audit",
        capability_flags: ["test_flag"],
      },
    });
    const packageId = pkg.package_id;
    const packageName = pkg.name;

    // Step 3: assign the skill.
    const assignResponse = await app.inject({
      method: "POST",
      url: `/api/v1/org/ai-teammates/${twinId}/skills`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { package_id: packageId },
      remoteAddress: ctx.adminIp,
    });
    expect(assignResponse.statusCode).toBe(200);
    const body = assignResponse.json() as {
      ok: true;
      skill: { twin_id: string; package_id: string };
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.skill.twin_id).toBe(twinId);
    expect(body.skill.package_id).toBe(packageId);

    // Step 4: assert the audit row resolves with the expected
    // event_type + details payload (Q1(b) baked-in fields).
    await assertAuditEventIdResolves(body.audit_event_id, "ADMIN_ACTION");
    const auditRow = await prisma.auditEvent.findUnique({
      where: { audit_id: body.audit_event_id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.actor_entity_id).toBe(ctx.adminId);
    expect(auditRow!.target_entity_id).toBe(twinId);
    const details = auditRow!.details as Record<string, unknown>;
    expect(details.action).toBe("TWIN_SKILLS_ASSIGNED");
    expect(details.twin_id).toBe(twinId);
    expect(details.skill_package_id).toBe(packageId);
    expect(typeof details.package_name).toBe("string");
    expect((details.package_name as string).length).toBeGreaterThan(0);
    expect(details.package_name).toBe(packageName);
    // Q1(b): twin_owner_entity_id baked into details. The twin was
    // created with owner_entity_id=ctx.adminId via the normal flow,
    // so the EntityMembership row exists and the field is populated.
    expect(typeof details.twin_owner_entity_id).toBe("string");
    expect(details.twin_owner_entity_id).toBe(ctx.adminId);
  });

  // 12C.0 Item 1: DELETE /org/ai-teammates/:id/skills/:packageId
  // surfaces audit_event_id resolving to an ADMIN_ACTION row with
  // details.action: "TWIN_SKILL_REMOVED" (singular -- DELETE removes
  // one package per call). Symmetric to the POST emission shape.
  it("DELETE /org/ai-teammates/:id/skills/:packageId surfaces audit_event_id resolving to an ADMIN_ACTION row", async () => {
    const ctx = await createOrgAndAdmin();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/org/ai-teammates",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        owner_entity_id: ctx.adminId,
        role_title: `${TEST_PREFIX}rolefordel_${randomUUID()}`,
      },
      remoteAddress: ctx.adminIp,
    });
    expect(createResponse.statusCode).toBe(201);
    const twinId = (createResponse.json() as { entity_id: string }).entity_id;

    // Create a SkillPackage locally (seedSkillPackages no-op stub
    // avoidance per Drift G7-PRE-C resolution).
    const pkg = await prisma.skillPackage.create({
      data: {
        name: `${TEST_PREFIX}audit_skill_unassign_${randomUUID()}`,
        category: "test",
        description: "Test package for skill-unassign audit",
        capability_flags: ["test_flag"],
      },
    });
    const packageId = pkg.package_id;
    const packageName = pkg.name;

    // Assign first so we have something to delete.
    const assignResponse = await app.inject({
      method: "POST",
      url: `/api/v1/org/ai-teammates/${twinId}/skills`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { package_id: packageId },
      remoteAddress: ctx.adminIp,
    });
    expect(assignResponse.statusCode).toBe(200);

    // Now delete it.
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/org/ai-teammates/${twinId}/skills/${packageId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      remoteAddress: ctx.adminIp,
    });
    expect(deleteResponse.statusCode).toBe(200);
    const body = deleteResponse.json() as {
      ok: true;
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);

    await assertAuditEventIdResolves(body.audit_event_id, "ADMIN_ACTION");
    const auditRow = await prisma.auditEvent.findUnique({
      where: { audit_id: body.audit_event_id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.actor_entity_id).toBe(ctx.adminId);
    expect(auditRow!.target_entity_id).toBe(twinId);
    const details = auditRow!.details as Record<string, unknown>;
    expect(details.action).toBe("TWIN_SKILL_REMOVED");
    expect(details.twin_id).toBe(twinId);
    expect(details.skill_package_id).toBe(packageId);
    expect(details.package_name).toBe(packageName);
    expect(details.twin_owner_entity_id).toBe(ctx.adminId);

    // Verify the TwinSkill row was actually removed.
    const remaining = await prisma.twinSkill.findFirst({
      where: { twin_id: twinId, package_id: packageId },
    });
    expect(remaining).toBeNull();
  });

  // 12C.0 Item 2: PATCH /org/entities/:id surfaces audit_event_id
  // resolving to an ADMIN_ACTION row with details.action:
  // "ORG_ENTITY_UPDATE". Closes the last
  // pending-foundation-extension sentinel in otzar-control-tower
  // (12B.2 Members job_title edit + Suspend/Reactivate).
  it("PATCH /org/entities/:id surfaces audit_event_id resolving to an ADMIN_ACTION row", async () => {
    const ctx = await createOrgAndAdmin();

    // Step 1: invite a new member into the org so we have an entity
    // to PATCH.
    const memberEmail = `${TEST_PREFIX}patchee_${randomUUID()}@niov.test`;
    const memberResponse = await app.inject({
      method: "POST",
      url: "/api/v1/org/members",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        email: memberEmail,
        password: "correct-horse-battery",
        first_name: "Initial",
        last_name: "Member",
      },
      remoteAddress: ctx.adminIp,
    });
    expect(memberResponse.statusCode).toBe(201);
    const memberId = (memberResponse.json() as { entity_id: string })
      .entity_id;

    // Step 2: PATCH a profile field.
    const newJobTitle = `${TEST_PREFIX}patched_${randomUUID()}`;
    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/org/entities/${memberId}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { job_title: newJobTitle },
      remoteAddress: ctx.adminIp,
    });
    expect(patchResponse.statusCode).toBe(200);
    const body = patchResponse.json() as {
      ok: true;
      audit_event_id: string;
    };
    expect(body.ok).toBe(true);

    // Step 3: assert the audit row resolves and details look right.
    // 12C.0 anchor: the response now carries audit_event_id; the
    // pending-foundation-extension sentinel in otzar-control-tower
    // can be removed.
    await assertAuditEventIdResolves(body.audit_event_id, "ADMIN_ACTION");
    const auditRow = await prisma.auditEvent.findUnique({
      where: { audit_id: body.audit_event_id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.actor_entity_id).toBe(ctx.adminId);
    expect(auditRow!.target_entity_id).toBe(memberId);
    const details = auditRow!.details as Record<string, unknown>;
    expect(details.action).toBe("ORG_ENTITY_UPDATE");
    // fields_changed should contain only job_title (the field we
    // actually modified), not all 7 writable profile fields.
    expect(Array.isArray(details.fields_changed)).toBe(true);
    const fieldsChanged = details.fields_changed as string[];
    expect(fieldsChanged).toEqual(["job_title"]);
  });
});
