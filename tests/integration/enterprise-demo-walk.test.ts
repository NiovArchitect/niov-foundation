// FILE: enterprise-demo-walk.test.ts
// PURPOSE: Phase 1245 — the deterministic enterprise demo walk. One
//          scenario, credential-free, walking the handoff chain the
//          runbook §18 documents: org setup → readiness truth →
//          My Day intelligence → calendar quiet → Dandelion (growth +
//          consent-gated memory) → AI Employee provisioning →
//          Observe → workspace ledger import → compliance share
//          package → regulator redacted read → revocation → twin
//          collaboration governance → zero external writes.
//
//          Every step here is ALSO covered by its own phase suite;
//          this file proves the chain holds END-TO-END in one org,
//          one seed, one deterministic pass — the executable mirror
//          of docs/operations/enterprise-handoff-runbook.md §18.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { computeTARHash, prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { getOnboardingChecklistForCaller } from "../../apps/api/src/services/onboarding/onboarding.service.js";
import { getHandoffReadinessForCaller } from "../../apps/api/src/services/onboarding/handoff-readiness.service.js";
import { getMyDayIntelligenceForCaller } from "../../apps/api/src/services/otzar/my-day-intelligence.service.js";
import { getCalendarContextForCaller } from "../../apps/api/src/services/otzar/calendar-context.service.js";
import {
  getOrgGrowthForCaller,
  proposeOnboardingMemoryForCaller,
} from "../../apps/api/src/services/otzar/dandelion-growth.service.js";
import { provisionAiEmployeeForCaller } from "../../apps/api/src/services/governance/ai-employee.service.js";
import {
  attachObserveCaptureToWorkspaceForCaller,
  extractObserveCaptureForCaller,
} from "../../apps/api/src/services/otzar/observe-intake.service.js";
import {
  createSharePackageForCaller,
  getEvidenceForRegulator,
  revokeSharePackageForCaller,
} from "../../apps/api/src/services/compliance/compliance-sharing.service.js";

const TEST_PREFIX = "__niov_test__phase1245__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeEntity(
  displayName: string,
  entityType: "PERSON" | "COMPANY" | "REGULATOR",
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

async function grantOrgAdminTar(entityId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { can_admin_org: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished");
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      tar_hash: computeTARHash({
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
      }),
    },
  });
}

async function cleanupDemoArtifacts(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: {
      OR: [
        { display_name: { startsWith: TEST_PREFIX } },
        { public_key: { startsWith: "pk_ai_employee_" } },
      ],
    },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.escalationRequest.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { target_entity_id: { in: ids } },
        { resolved_by_entity_id: { in: ids } },
      ],
    },
  });
  const actions = await prisma.action.findMany({
    where: {
      OR: [{ source_entity_id: { in: ids } }, { org_entity_id: { in: ids } }],
    },
    select: { action_id: true },
  });
  const actionIds = actions.map((a) => a.action_id);
  if (actionIds.length > 0) {
    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: { in: actionIds } },
      select: { attempt_id: true },
    });
    const attemptIds = attempts.map((a) => a.attempt_id);
    if (attemptIds.length > 0) {
      await prisma.actionResult.deleteMany({
        where: { attempt_id: { in: attemptIds } },
      });
      await prisma.actionAttempt.deleteMany({
        where: { attempt_id: { in: attemptIds } },
      });
    }
    await prisma.action.deleteMany({
      where: { action_id: { in: actionIds } },
    });
  }
  await prisma.complianceSharePackage.deleteMany({
    where: { purpose: { startsWith: TEST_PREFIX } },
  });
  // AI employee dependents (mirrors the Phase 1240 cleanup).
  await prisma.twinAuthorityGrant.deleteMany({
    where: { grantee_entity_id: { in: ids } },
  });
  await prisma.twinConfig.deleteMany({ where: { twin_id: { in: ids } } });
  const aiOnly = await prisma.entity.findMany({
    where: { public_key: { startsWith: "pk_ai_employee_" } },
    select: { entity_id: true },
  });
  const aiIds = aiOnly.map((a) => a.entity_id);
  if (aiIds.length > 0) {
    await prisma.entityMembership.deleteMany({
      where: { child_id: { in: aiIds } },
    });
    await prisma.walletBalance.deleteMany({
      where: { entity_id: { in: aiIds } },
    });
    await prisma.wallet.deleteMany({ where: { entity_id: { in: aiIds } } });
    await prisma.tokenAttributeRepository.deleteMany({
      where: { entity_id: { in: aiIds } },
    });
    try {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events DISABLE TRIGGER USER",
      );
      await prisma.auditEvent.deleteMany({
        where: {
          OR: [
            { actor_entity_id: { in: aiIds } },
            { target_entity_id: { in: aiIds } },
          ],
        },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE audit_events ENABLE TRIGGER USER",
      );
    }
    await prisma.entity.deleteMany({
      where: { entity_id: { in: aiIds } },
    });
  }
}

describe("Phase 1245 — the deterministic enterprise demo walk", () => {
  beforeEach(async () => {
    delete process.env.MOCK_CALENDAR_FIXTURE;
    await ensureAuditTriggers();
    await cleanupDemoArtifacts();
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupDemoArtifacts();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("walks the credential-free handoff chain end-to-end in one org", async () => {
    // ── Steps 1-3: org, admin, employees, roles ──
    const orgId = await makeEntity("Demo Org", "COMPANY", 5);
    const adminId = await makeEntity("Demo Admin", "PERSON", 4);
    const davidId = await makeEntity("Demo David", "PERSON", 3);
    const regulatorId = await makeEntity("Demo Regulator", "REGULATOR", 3);
    for (const id of [adminId, davidId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
    await grantOrgAdminTar(adminId);
    await prisma.entityProfile.create({
      data: { entity_id: adminId, job_title: "Founder" },
    });
    await prisma.entityProfile.create({
      data: { entity_id: davidId, job_title: "Tech Lead" },
    });

    const checklist = await getOnboardingChecklistForCaller(adminId);
    expect(checklist.ok).toBe(true);
    if (checklist.ok === false) throw new Error("checklist");
    expect(checklist.checklist.steps.length).toBe(11);

    // ── Steps 4-5: readiness truth (policy/connector honesty) ──
    const readiness = await getHandoffReadinessForCaller(adminId);
    expect(readiness.ok).toBe(true);
    if (readiness.ok === false) throw new Error("readiness");
    expect(readiness.readiness.schema.pending_push).toBe(true);
    expect(readiness.readiness.connectors.length).toBeGreaterThan(5);

    // ── Steps 6-7: My Day ranked intelligence (fixture-honest) ──
    const myDay = await getMyDayIntelligenceForCaller(davidId, {
      fixtureMode: true,
    });
    expect(myDay.ok).toBe(true);
    if (myDay.ok === false) throw new Error("myday");
    expect(myDay.intelligence.provider_status).toBe(
      "FIXTURE_PROVIDER_DISABLED",
    );

    // ── Step 9: calendar-aware quiet (scheduled meeting → quiet) ──
    await prisma.meetingCapture.create({
      data: {
        org_entity_id: orgId,
        provider: "GOOGLE_MEET",
        title: `${TEST_PREFIX} Launch sync`,
        scheduled_start: new Date(Date.now() - 5 * 60 * 1000),
        scheduled_end: new Date(Date.now() + 25 * 60 * 1000),
        captured_by_entity_id: davidId,
      },
    });
    const calendar = await getCalendarContextForCaller(davidId);
    if (calendar.ok === false) throw new Error("calendar");
    expect(calendar.context.quiet_recommended).toBe(true);
    expect(calendar.context.quiet_reason).toBe("IN_MEETING");

    // ── Dandelion: growth intelligence + consent-gated memory ──
    const growth = await getOrgGrowthForCaller(adminId);
    if (growth.ok === false) throw new Error("growth");
    expect(growth.growth.headline.length).toBeGreaterThan(10);

    const capsulesBefore = await prisma.memoryCapsule.count();
    const memory = await proposeOnboardingMemoryForCaller({
      callerEntityId: davidId,
      preferred_name: "David",
      pronunciation: "DAY-vid",
    });
    if (memory.ok === false) throw new Error(`memory: ${memory.code}`);
    expect(memory.view.action_type).toBe("RECORD_CAPSULE");
    // Consent gate: NO capsule until approval.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);

    // ── AI Employee with boundaries by construction ──
    const aiEmp = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Demo Research Assistant",
    });
    if (aiEmp.ok === false) throw new Error(`aiemp: ${aiEmp.code}`);
    expect(aiEmp.ai_employee.dmw_type).toBe("AI_EMPLOYEE");

    // ── Steps 10-13: Observe → decisions/commitments → workspace ──
    const observe = await extractObserveCaptureForCaller(
      {
        callerEntityId: davidId,
        provider: "DEMO_FIXTURE",
        sourceType: "DEMO",
        title: `${TEST_PREFIX} whiteboard`,
      },
      null,
    );
    if (observe.ok === false) throw new Error("observe");
    expect(observe.capture.extraction?.decisions.length).toBeGreaterThan(0);

    const workspace = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId,
        title: `${TEST_PREFIX} Launch Workspace`,
        created_by_entity_id: davidId,
      },
    });
    const attach = await attachObserveCaptureToWorkspaceForCaller({
      callerEntityId: davidId,
      observeCaptureId: observe.capture.observe_capture_id,
      workspaceId: workspace.workspace_id,
    });
    if (attach.ok === false) throw new Error("attach");
    expect(attach.imported_commitments).toBeGreaterThan(0);
    // Owners stay UNRESOLVED until a human confirms (step 13 honesty).
    const commitments = await prisma.collaborationCommitment.findMany({
      where: { workspace_id: workspace.workspace_id },
    });
    expect(
      commitments.every((c) => c.resolution_status === "UNRESOLVED"),
    ).toBe(true);

    // ── Steps 25-26: compliance share package → regulator read ──
    const pkg = await createSharePackageForCaller({
      callerEntityId: adminId,
      regulatorEntityId: regulatorId,
      purpose: `${TEST_PREFIX} quarterly review`,
      scopes: ["AUDIT_SUMMARY", "ACTION_COMPLIANCE"],
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (pkg.ok === false) throw new Error(`pkg: ${pkg.code}`);
    const evidence = await getEvidenceForRegulator({
      callerEntityId: regulatorId,
      packageId: pkg.package.package_id,
    });
    if (evidence.ok === false) throw new Error("evidence");
    // Redaction: counts/types only — never details payloads.
    const serialized = JSON.stringify(evidence.evidence);
    expect(serialized).not.toContain('"details"');
    expect(serialized).not.toContain("payload_content");
    // Revocation cuts access immediately.
    const revoked = await revokeSharePackageForCaller({
      callerEntityId: adminId,
      packageId: pkg.package.package_id,
    });
    expect(revoked.ok).toBe(true);
    const afterRevoke = await getEvidenceForRegulator({
      callerEntityId: regulatorId,
      packageId: pkg.package.package_id,
    });
    expect(afterRevoke).toEqual({ ok: false, code: "PACKAGE_REVOKED" });

    // ── Step 28: zero external writes in the entire walk ──
    const externalActions = await prisma.action.count({
      where: { org_entity_id: orgId, action_type: "INVOKE_CONNECTOR" },
    });
    expect(externalActions).toBe(0);

    // ── Step 24: the audit chain covered the chain ──
    const auditCount = await prisma.auditEvent.count({
      where: { actor_entity_id: { in: [adminId, davidId, regulatorId] } },
    });
    expect(auditCount).toBeGreaterThan(5);
  });
});
