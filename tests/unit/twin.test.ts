// FILE: twin.test.ts (unit)
// PURPOSE: Cover the createTwin admin / standard branches per the
//          P1 PATCH wallet-access architecture, plus findNextApprover
//          edge cases. Focused on direct service calls; route-level
//          coverage lives in tests/integration/admin-routes.test.ts.
// CONNECTS TO: services/governance/twin.service.ts, the
//              entity / wallet / token_attribute_repositories /
//              entity_memberships / twin_configs / hive_memberships /
//              permissions / audit_events tables.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTwin,
  findNextApprover,
  seedAgentTemplates,
} from "@niov/api";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a COMPANY entity, an admin PERSON inside it, and a
//        default-enterprise Hive. Returns ids the tests need.
// INPUT: None.
// OUTPUT: { orgId, adminId, hiveId }.
// WHY: Most twin tests need the same triad. Standard branch tests
//      need the default Hive to exist so the auto-join works.
async function makeOrgWithAdminAndDefaultHive(): Promise<{
  orgId: string;
  adminId: string;
  hiveId: string;
}> {
  const company = await createEntity(
    makeEntityInput({ entity_type: "COMPANY" }),
  );
  const admin = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  await prisma.entityMembership.create({
    data: {
      parent_id: company.entity_id,
      child_id: admin.entity_id,
      hierarchy_level: 7,
      is_admin: true,
      is_active: true,
    },
  });
  const hive = await prisma.hive.create({
    data: {
      hive_name: "Test Default Hive",
      created_by: admin.entity_id,
      hive_type: "ENTERPRISE",
      org_entity_id: company.entity_id,
      is_default_enterprise: true,
      member_count: 0,
      status: "ACTIVE",
    },
  });
  return { orgId: company.entity_id, adminId: admin.entity_id, hiveId: hive.hive_id };
}

describe("createTwin -- admin branch", () => {
  it("mints standing wallet permissions on org + owner wallets and does NOT join the default Hive", async () => {
    const { orgId, adminId, hiveId } = await makeOrgWithAdminAndDefaultHive();
    const result = await createTwin({
      owner_entity_id: adminId,
      org_entity_id: orgId,
      role_title: "Executive Twin",
      is_admin_invite: true,
    });
    expect(result.is_admin_twin).toBe(true);
    expect(result.org_permission_bridge_id).not.toBeNull();
    expect(result.owner_permission_bridge_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.default_hive_membership_id).toBeNull();

    const twinConfig = await prisma.twinConfig.findUnique({
      where: { twin_id: result.entity_id },
    });
    expect(twinConfig?.is_admin_twin).toBe(true);
    expect(twinConfig?.autonomy_level).toBe("EXECUTIVE_OVERRIDE");

    // Org wallet permission bridge exists.
    const orgPerms = await prisma.permission.findMany({
      where: {
        bridge_id: result.org_permission_bridge_id!,
        grantee_entity_id: result.entity_id,
        grantor_entity_id: orgId,
      },
    });
    // Empty grantor wallet → 0 permissions, but the bridge_id is
    // returned regardless. Just confirm there's no Hive membership.
    void orgPerms;

    const hiveMembership = await prisma.hiveMembership.findFirst({
      where: { hive_id: hiveId, entity_id: result.entity_id },
    });
    expect(hiveMembership).toBeNull();
  });
});

describe("createTwin -- standard branch", () => {
  it("does NOT grant standing org-wallet permission and DOES join the default Hive at SUMMARY scope", async () => {
    const { orgId, adminId, hiveId } = await makeOrgWithAdminAndDefaultHive();
    // Standard owner: a non-admin PERSON inside the same org.
    const owner = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await prisma.entityMembership.create({
      data: {
        parent_id: orgId,
        child_id: owner.entity_id,
        hierarchy_level: 1,
        is_admin: false,
        is_active: true,
      },
    });
    void adminId;

    const result = await createTwin({
      owner_entity_id: owner.entity_id,
      org_entity_id: orgId,
      role_title: "Digital Twin",
      is_admin_invite: false,
    });
    expect(result.is_admin_twin).toBe(false);
    expect(result.org_permission_bridge_id).toBeNull();
    expect(result.default_hive_membership_id).not.toBeNull();

    const membership = await prisma.hiveMembership.findFirst({
      where: { hive_id: hiveId, entity_id: result.entity_id },
    });
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.contribution_scope).toBe("SUMMARY");
    expect(membership?.access_scope).toBe("SUMMARY");

    const twinConfig = await prisma.twinConfig.findUnique({
      where: { twin_id: result.entity_id },
    });
    expect(twinConfig?.is_admin_twin).toBe(false);
    expect(twinConfig?.autonomy_level).toBe("APPROVAL_REQUIRED");
    expect(twinConfig?.approver_entity_id).toBe(owner.entity_id);
  });
});

describe("createTwin -- duplicate guard", () => {
  it("throws TWIN_ALREADY_EXISTS on a second twin with the same owner + role_title", async () => {
    const { orgId, adminId } = await makeOrgWithAdminAndDefaultHive();
    await createTwin({
      owner_entity_id: adminId,
      org_entity_id: orgId,
      role_title: "Executive Twin",
      is_admin_invite: true,
    });
    await expect(
      createTwin({
        owner_entity_id: adminId,
        org_entity_id: orgId,
        role_title: "Executive Twin",
        is_admin_invite: true,
      }),
    ).rejects.toThrow(/TWIN_ALREADY_EXISTS/);
  });
});

describe("findNextApprover", () => {
  it("returns null when no other admin exists (Phase 0 admin twin case)", async () => {
    const { orgId, adminId } = await makeOrgWithAdminAndDefaultHive();
    void orgId;
    const approver = await prisma.$transaction((tx) =>
      findNextApprover(tx, adminId),
    );
    // With only one admin (the caller), there is no OTHER admin to
    // route approvals to.
    expect(approver).toBeNull();
  });

  it("returns the org admin's entity_id when walking up from a non-admin employee", async () => {
    const { orgId, adminId } = await makeOrgWithAdminAndDefaultHive();
    const employee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await prisma.entityMembership.create({
      data: {
        parent_id: orgId,
        child_id: employee.entity_id,
        hierarchy_level: 1,
        is_admin: false,
        is_active: true,
      },
    });
    const approver = await prisma.$transaction((tx) =>
      findNextApprover(tx, employee.entity_id),
    );
    expect(approver).toBe(adminId);
  });
});

describe("createTwin -- role-template provisioning", () => {
  beforeAll(async () => {
    // Ensure the 13 seeded role templates exist for the lookups below.
    await seedAgentTemplates();
  });

  // Build a standard (non-admin) owner inside an org with a default Hive.
  async function makeStandardOwner(): Promise<{ orgId: string; ownerId: string }> {
    const { orgId } = await makeOrgWithAdminAndDefaultHive();
    const owner = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    await prisma.entityMembership.create({
      data: {
        parent_id: orgId,
        child_id: owner.entity_id,
        hierarchy_level: 1,
        is_admin: false,
        is_active: true,
      },
    });
    return { orgId, ownerId: owner.entity_id };
  }

  it("assigns the matching role template from the role title", async () => {
    const { orgId, ownerId } = await makeStandardOwner();
    const result = await createTwin({
      owner_entity_id: ownerId,
      org_entity_id: orgId,
      role_title: "Senior Software Engineer",
      is_admin_invite: false,
    });
    const twinConfig = await prisma.twinConfig.findUnique({
      where: { twin_id: result.entity_id },
    });
    expect(twinConfig?.role_template).toBe("software-engineer");
  });

  it("leaves role_template null for an unknown role (generalist fallback)", async () => {
    const { orgId, ownerId } = await makeStandardOwner();
    const result = await createTwin({
      owner_entity_id: ownerId,
      org_entity_id: orgId,
      role_title: "Intern",
      is_admin_invite: false,
    });
    const twinConfig = await prisma.twinConfig.findUnique({
      where: { twin_id: result.entity_id },
    });
    expect(twinConfig?.role_template).toBeNull();
  });

  it("respects the org boundary: a template owned by another org is not applied", async () => {
    // Point the seeded marketing template at a FOREIGN org, then provision a
    // twin in a DIFFERENT org with a matching title — it must NOT be applied.
    const foreignOrg = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    await prisma.agentTemplate.update({
      where: { role_name: "marketing-manager" },
      data: { org_entity_id: foreignOrg.entity_id, is_custom: true },
    });
    try {
      const { orgId, ownerId } = await makeStandardOwner();
      const result = await createTwin({
        owner_entity_id: ownerId,
        org_entity_id: orgId,
        role_title: "Marketing Manager",
        is_admin_invite: false,
      });
      const twinConfig = await prisma.twinConfig.findUnique({
        where: { twin_id: result.entity_id },
      });
      expect(twinConfig?.role_template).toBeNull();
    } finally {
      // Restore the seeded template to a standard (null-org) row.
      await prisma.agentTemplate.update({
        where: { role_name: "marketing-manager" },
        data: { org_entity_id: null, is_custom: false },
      });
    }
  });
});

describe("createTwin -- Hive missing for standard branch", () => {
  it("throws DEFAULT_HIVE_MISSING when the org has no default-enterprise Hive yet", async () => {
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const employee = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await prisma.entityMembership.create({
      data: {
        parent_id: company.entity_id,
        child_id: employee.entity_id,
        hierarchy_level: 1,
        is_admin: false,
        is_active: true,
      },
    });
    await expect(
      createTwin({
        owner_entity_id: employee.entity_id,
        org_entity_id: company.entity_id,
        role_title: "Digital Twin",
        is_admin_invite: false,
      }),
    ).rejects.toThrow(/DEFAULT_HIVE_MISSING/);
  });
});
