// FILE: onboarding.test.ts
// PURPOSE: Phase 1230 — integration test for the production
//          onboarding / admin readiness checklist.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  getOnboardingChecklistForCaller,
  completeOnboardingStepForCaller,
  setOnboardingModeForCaller,
} from "../../apps/api/src/services/onboarding/onboarding.service.js";

const TEST_PREFIX = "__niov_test__phase1230__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeOrgEntity(displayName: string): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}.org@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: "COMPANY",
    clearance_level: 5,
    status: "ACTIVE",
  });
  return e.entity_id;
}

async function makePerson(
  displayName: string,
  orgEntityId: string,
  clearance = 3,
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: "PERSON",
    clearance_level: clearance,
    status: "ACTIVE",
  });
  await prisma.entityMembership.create({
    data: { parent_id: orgEntityId, child_id: e.entity_id, is_active: true },
  });
  return e.entity_id;
}

describe("Phase 1230 — onboarding readiness", () => {
  let orgId = "";
  let adminId = "";
  let regularId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeOrgEntity("Onboarding Org");
    adminId = await makePerson("Onboarding Admin", orgId, 4); // admin
    regularId = await makePerson("Onboarding Regular", orgId, 3);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("getOnboardingChecklistForCaller returns 11 steps with computed statuses", async () => {
    const r = await getOnboardingChecklistForCaller(adminId);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.checklist.steps.length).toBe(11);
    expect(r.checklist.mode).toBe("DEMO");
    // Org exists → ORG_CREATED is READY (auto_ready).
    const orgStep = r.checklist.steps.find((s) => s.step_id === "ORG_CREATED");
    expect(orgStep?.status).toBe("READY");
    // 1 admin → ADMINS_INVITED auto-ready.
    const adminStep = r.checklist.steps.find((s) => s.step_id === "ADMINS_INVITED");
    expect(adminStep?.status).toBe("READY");
    // 2 people → ROLES_ASSIGNED auto-ready.
    const rolesStep = r.checklist.steps.find((s) => s.step_id === "ROLES_ASSIGNED");
    expect(rolesStep?.status).toBe("READY");
    // Facts surface real counts.
    expect(r.checklist.facts.total_members).toBe(2);
    expect(r.checklist.facts.admin_members).toBe(1);
  });

  it("completeOnboardingStepForCaller requires admin (clearance_level >= 4)", async () => {
    const r1 = await completeOnboardingStepForCaller({
      callerEntityId: regularId,
      step: "DMW_DEFAULTS_CONFIGURED",
    });
    expect(r1.ok).toBe(false);
    if (r1.ok === true) throw new Error("expected denial");
    expect(r1.code).toBe("ADMIN_REQUIRED");

    const r2 = await completeOnboardingStepForCaller({
      callerEntityId: adminId,
      step: "DMW_DEFAULTS_CONFIGURED",
    });
    expect(r2.ok).toBe(true);
    if (r2.ok === false) throw new Error("expected ok");
    const step = r2.checklist.steps.find(
      (s) => s.step_id === "DMW_DEFAULTS_CONFIGURED",
    );
    expect(step?.status).toBe("READY");
    expect(step?.completed_at).not.toBeNull();
  });

  it("setOnboardingModeForCaller flips DEMO → PRODUCTION + audit emitted", async () => {
    const r = await setOnboardingModeForCaller({
      callerEntityId: adminId,
      mode: "PRODUCTION",
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.checklist.mode).toBe("PRODUCTION");
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "ONBOARDING_MODE_CHANGED", actor_entity_id: adminId },
    });
    expect(audits.length).toBe(1);
  });

  it("READY_FOR_PRODUCTION emits ONBOARDING_READY_FOR_PRODUCTION literal", async () => {
    const r = await completeOnboardingStepForCaller({
      callerEntityId: adminId,
      step: "READY_FOR_PRODUCTION",
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ONBOARDING_READY_FOR_PRODUCTION",
        actor_entity_id: adminId,
      },
    });
    expect(audits.length).toBe(1);
  });
});
