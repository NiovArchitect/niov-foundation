// FILE: ai-employee.test.ts
// PURPOSE: Phase 1240 — integration test for AI Employee governance:
//          provisioning creates the ADR-0046 Enterprise AI Agent
//          context (AI_AGENT + ENTERPRISE wallet + org membership +
//          APPROVAL_REQUIRED autonomy with a HUMAN approver), the
//          RULE 0 boundary set holds by construction (TAR ceiling 2,
//          no admin capabilities, no external API), the DMW Registry
//          projects it as AI_EMPLOYEE, deactivation is a one-action
//          kill switch (suspend + revoke all ACTIVE grants), and
//          everything is org-scoped with no existence oracle.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  deactivateAiEmployeeForCaller,
  listAiEmployeesForCaller,
  provisionAiEmployeeForCaller,
} from "../../apps/api/src/services/governance/ai-employee.service.js";
import { listOrgDMWForCaller } from "../../apps/api/src/services/dmw/dmw-registry.service.js";

const TEST_PREFIX = "__niov_test__phase1240__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeEntity(
  displayName: string,
  entityType: "PERSON" | "COMPANY",
  clearance = 3,
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: clearance,
    status: "ACTIVE",
  });
  return e.entity_id;
}

async function cleanupAiEmployees(): Promise<void> {
  // Provisioned AI entities carry the pk_ai_employee_ prefix; remove
  // their dependents before entity cleanup.
  const ais = await prisma.entity.findMany({
    where: { public_key: { startsWith: "pk_ai_employee_" } },
    select: { entity_id: true },
  });
  const ids = ais.map((a) => a.entity_id);
  if (ids.length === 0) return;
  await prisma.twinAuthorityGrant.deleteMany({
    where: { grantee_entity_id: { in: ids } },
  });
  await prisma.twinConfig.deleteMany({ where: { twin_id: { in: ids } } });
  await prisma.entityMembership.deleteMany({
    where: { child_id: { in: ids } },
  });
  await prisma.walletBalance.deleteMany({
    where: { entity_id: { in: ids } },
  });
  await prisma.wallet.deleteMany({ where: { entity_id: { in: ids } } });
  await prisma.tokenAttributeRepository.deleteMany({
    where: { entity_id: { in: ids } },
  });
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
  await prisma.entity.deleteMany({ where: { entity_id: { in: ids } } });
}

describe("Phase 1240 — AI Employee governance", () => {
  let orgId = "";
  let adminId = "";
  let memberId = "";
  let otherOrgId = "";
  let otherAdminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupAiEmployees();
    await cleanupTestData();
    orgId = await makeEntity("AiEmp Org", "COMPANY", 5);
    adminId = await makeEntity("AiEmp Admin", "PERSON", 4);
    memberId = await makeEntity("AiEmp Member", "PERSON", 3);
    for (const id of [adminId, memberId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
    otherOrgId = await makeEntity("AiEmp Other Org", "COMPANY", 5);
    otherAdminId = await makeEntity("AiEmp Other Admin", "PERSON", 4);
    await prisma.entityMembership.create({
      data: { parent_id: otherOrgId, child_id: otherAdminId, is_active: true },
    });
  });

  afterAll(async () => {
    await cleanupAiEmployees();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("admin provisions an AI Employee with the full RULE 0 boundary set by construction", async () => {
    const r = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Research Assistant",
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error(`expected ok, got ${r.code}`);
    expect(r.ai_employee.dmw_type).toBe("AI_EMPLOYEE");
    expect(r.ai_employee.role_title).toBe("Research Assistant");
    expect(r.ai_employee.autonomy_level).toBe("APPROVAL_REQUIRED");
    expect(r.ai_employee.approver_display_name).toContain("AiEmp Admin");
    expect(r.ai_employee.active_grants_count).toBe(0);

    const id = r.ai_employee.entity_id;
    // ADR-0046 Enterprise context: AI_AGENT + ENTERPRISE wallet.
    const entity = await prisma.entity.findUnique({
      where: { entity_id: id },
    });
    expect(entity?.entity_type).toBe("AI_AGENT");
    expect(entity?.clearance_level).toBe(0);
    const wallet = await prisma.wallet.findFirst({
      where: { entity_id: id },
    });
    expect(wallet?.wallet_type).toBe("ENTERPRISE");
    // RULE 0 boundary set: TAR ceiling 2, no admin caps, no external
    // API — NO broad default access.
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: id },
    });
    expect(tar?.clearance_ceiling).toBe(2);
    expect(tar?.can_admin_org).toBe(false);
    expect(tar?.can_admin_niov).toBe(false);
    expect(tar?.can_access_external_api).toBe(false);
    // Provisioning audit with the discriminator.
    const audit = await prisma.auditEvent.findFirst({
      where: { event_type: "ENTITY_REGISTERED", target_entity_id: id },
    });
    expect(audit).not.toBeNull();
  });

  it("the DMW Registry projects the provisioned entity as AI_EMPLOYEE", async () => {
    const r = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Compliance Drafter",
    });
    if (r.ok === false) throw new Error("expected ok");
    const registry = await listOrgDMWForCaller(adminId);
    if (registry.ok === false) throw new Error("expected registry ok");
    const aiEmps = registry.entries.filter(
      (e) => e.dmw_type === "AI_EMPLOYEE",
    );
    expect(aiEmps.length).toBe(1);
  });

  it("non-admins cannot provision; duplicates conflict; empty roles refused", async () => {
    const denied = await provisionAiEmployeeForCaller({
      callerEntityId: memberId,
      roleTitle: "Should Fail",
    });
    expect(denied).toEqual({ ok: false, code: "ADMIN_REQUIRED" });

    const first = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Ops Analyst",
    });
    expect(first.ok).toBe(true);
    const dup = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Ops Analyst",
    });
    expect(dup.ok).toBe(false);
    if (dup.ok === false) expect(dup.code).toBe("AI_EMPLOYEE_ALREADY_EXISTS");

    const empty = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "   ",
    });
    expect(empty.ok).toBe(false);
    if (empty.ok === false) expect(empty.code).toBe("ROLE_TITLE_REQUIRED");
  });

  it("personal twins are NEVER listed as AI Employees; lists are org-scoped", async () => {
    await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Docs Writer",
    });
    // A personal twin: AI_AGENT under a PERSON parent with a PERSONAL
    // wallet — must not appear.
    const twinId = await makeEntity("Personal Twin", "PERSON", 0);
    await prisma.entity.update({
      where: { entity_id: twinId },
      data: { entity_type: "AI_AGENT" },
    });
    await prisma.entityMembership.create({
      data: { parent_id: memberId, child_id: twinId, is_active: true },
    });

    const mine = await listAiEmployeesForCaller(memberId);
    if (mine.ok === false) throw new Error("expected ok");
    expect(mine.ai_employees.length).toBe(1);
    expect(mine.ai_employees[0]?.role_title).toBe("Docs Writer");

    const theirs = await listAiEmployeesForCaller(otherAdminId);
    if (theirs.ok === false) throw new Error("expected ok");
    expect(theirs.ai_employees.length).toBe(0);
  });

  it("deactivation is the kill switch: suspend + revoke all ACTIVE grants; cross-org probes 404", async () => {
    const r = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Scheduler",
    });
    if (r.ok === false) throw new Error("expected ok");
    const id = r.ai_employee.entity_id;
    // Two ACTIVE grants to the AI Employee.
    for (let i = 0; i < 2; i++) {
      await prisma.twinAuthorityGrant.create({
        data: {
          org_entity_id: orgId,
          grantor_entity_id: adminId,
          grantee_entity_id: id,
          scope_type: "ACTION_TYPE",
          action_type: "SEND_INTERNAL_NOTIFICATION",
          duration_class: "SHORT_TERM",
          sensitivity_class: "LOW",
          state: "ACTIVE",
          purpose_summary: `${TEST_PREFIX} grant ${i}`,
        },
      });
    }

    // Cross-org admin cannot even see it.
    const probe = await deactivateAiEmployeeForCaller({
      callerEntityId: otherAdminId,
      aiEmployeeEntityId: id,
    });
    expect(probe).toEqual({ ok: false, code: "AI_EMPLOYEE_NOT_FOUND" });

    const done = await deactivateAiEmployeeForCaller({
      callerEntityId: adminId,
      aiEmployeeEntityId: id,
    });
    expect(done.ok).toBe(true);
    if (done.ok === false) throw new Error("expected ok");
    expect(done.revoked_grants_count).toBe(2);

    const entity = await prisma.entity.findUnique({
      where: { entity_id: id },
    });
    expect(entity?.status).toBe("SUSPENDED");
    const activeGrants = await prisma.twinAuthorityGrant.count({
      where: { grantee_entity_id: id, state: "ACTIVE" },
    });
    expect(activeGrants).toBe(0);
    const audit = await prisma.auditEvent.findFirst({
      where: { event_type: "ENTITY_SUSPENDED", target_entity_id: id },
    });
    expect(audit).not.toBeNull();

    const again = await deactivateAiEmployeeForCaller({
      callerEntityId: adminId,
      aiEmployeeEntityId: id,
    });
    expect(again).toEqual({ ok: false, code: "ALREADY_DEACTIVATED" });
  });

  it("views carry safe fields only — no raw ids beyond entity_id, no emails", async () => {
    const r = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Safe Fields",
    });
    if (r.ok === false) throw new Error("expected ok");
    const serialized = JSON.stringify(r.ai_employee);
    expect(serialized).not.toContain("@niov-test.com");
    expect(serialized).not.toContain("approver_entity_id");
    expect(serialized).not.toContain("wallet_id");
    expect(serialized).not.toContain("public_key");
  });
});
