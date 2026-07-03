// FILE: dandelion-growth.test.ts
// PURPOSE: Phase 1237 — integration test for Dandelion: governed
//          org-growth recommendations from real substrate, the
//          employee onboarding view, and the consent-gated memory
//          path (Action(PROPOSED) — NO capsule until approval).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { computeTARHash, prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  getOnboardingIntrosForCaller,
  getOrgGrowthForCaller,
  proposeOnboardingMemoryForCaller,
} from "../../apps/api/src/services/otzar/dandelion-growth.service.js";

const TEST_PREFIX = "__niov_test__phase1237__";

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

async function cleanupDandelionArtifacts(): Promise<void> {
  // Actions + dual-control escalations created by the consent path
  // reference test entities by FK; remove them before entity cleanup.
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
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
  const testActions = await prisma.action.findMany({
    where: {
      OR: [{ source_entity_id: { in: ids } }, { org_entity_id: { in: ids } }],
    },
    select: { action_id: true },
  });
  const actionIds = testActions.map((a) => a.action_id);
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
}

describe("Phase 1237 — Dandelion org growth", () => {
  let orgId = "";
  let adminId = "";
  let connectedId = "";
  let lonelyId = "";

  async function grantOrgAdmin(entityId: string): Promise<void> {
    // Dual-control approver eligibility requires an ACTIVE TAR with
    // can_admin_org — mirror the canonical makeOrgMember fixture.
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: { can_admin_org: true },
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

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupDandelionArtifacts();
    await cleanupTestData();
    orgId = await makeEntity("Dandelion Org", "COMPANY", 5);
    adminId = await makeEntity("Dandelion Admin", "PERSON", 4);
    await grantOrgAdmin(adminId);
    connectedId = await makeEntity("Connected Colleague", "PERSON", 3);
    lonelyId = await makeEntity("Lonely Newcomer", "PERSON", 3);
    for (const id of [adminId, connectedId, lonelyId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
    // Profiles for admin + connected so PREPARE_ONBOARDING targets
    // only the newcomer.
    for (const [id, title] of [
      [adminId, "Founder"],
      [connectedId, "Tech Lead"],
    ] as const) {
      await prisma.entityProfile.create({
        data: { entity_id: id, job_title: title },
      });
    }
    // [PROD-UX-BUGD] The newcomer has REAL org placement — a manager edge
    // (reports to the colleague) and a department — so the growth copy must
    // acknowledge it instead of calling them "not connected".
    await prisma.entityMembership.create({
      data: { parent_id: connectedId, child_id: lonelyId, is_active: true, hierarchy_level: 2 },
    });
    await prisma.entityMembership.updateMany({
      where: { parent_id: orgId, child_id: lonelyId },
      data: { department: "Engineering" },
    });
    // Connect admin + colleague to a project so only the newcomer is
    // without one.
    const project = await prisma.workProject.create({
      data: {
        org_entity_id: orgId,
        name: `${TEST_PREFIX} Launch Project`,
        created_by_entity_id: adminId,
      },
    });
    for (const id of [adminId, connectedId]) {
      await prisma.workProjectMember.create({
        data: {
          project_id: project.project_id,
          org_entity_id: orgId,
          entity_id: id,
          role: "MEMBER",
        },
      });
    }
  });

  afterAll(async () => {
    await cleanupDandelionArtifacts();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("admin sees governed growth recommendations from real substrate", async () => {
    // An external relationship without an internal owner...
    await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId,
        display_name: `${TEST_PREFIX} Maria External`,
        company_name: "MICE Global",
        created_by_entity_id: adminId,
      },
    });
    // ...and an overloaded commitment owner.
    const workspace = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId,
        title: `${TEST_PREFIX} Launch Workspace`,
        created_by_entity_id: adminId,
      },
    });
    for (let i = 0; i < 3; i++) {
      await prisma.collaborationCommitment.create({
        data: {
          workspace_id: workspace.workspace_id,
          org_entity_id: orgId,
          owner_entity_id: connectedId,
          owner_display_name: `${TEST_PREFIX} Connected Colleague`,
          text: `${TEST_PREFIX} commitment ${i}`,
          assignment_reason: "test fixture",
          added_by_entity_id: adminId,
        },
      });
    }

    const r = await getOrgGrowthForCaller(adminId);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    const kinds = r.growth.recommendations.map((x) => x.kind);
    expect(kinds).toContain("ASSIGN_INTERNAL_OWNER");
    expect(kinds).toContain("REDUCE_OVERLOAD");
    expect(kinds).toContain("NEEDS_PROJECT_OR_WORKSPACE");
    expect(kinds).toContain("PREPARE_ONBOARDING");
    expect(r.growth.headline).toContain("strengthen your organization");
    expect(r.growth.signals.unowned_external_count).toBe(1);
    expect(r.growth.signals.members_without_project_count).toBe(1);

    // [PROD-UX-BUGD] The recommendation states the person's TRUE org
    // relationship (member, on their manager's team) and names the ONE
    // missing object (a first project/workspace) — never "not connected".
    const rec = r.growth.recommendations.find((x) => x.kind === "NEEDS_PROJECT_OR_WORKSPACE")!;
    expect(rec.title).toContain("needs a first project or workspace");
    expect(rec.why).toContain("already part of your organization");
    expect(rec.why).toContain("'s team"); // the real manager edge is acknowledged
    expect(`${rec.title} ${rec.why}`).not.toMatch(/isn't connected|not connected|disconnected/i);
    // Structured source-of-truth metadata, read from the canonical stores.
    expect(rec.context).toEqual({
      person_entity_id: lonelyId, // stable id for keying/dismissal (duplicate-name safe)
      org_member: true,
      has_department: true,
      has_manager: true,
      has_project_or_workspace: false,
      missing_connection_type: "PROJECT_OR_WORKSPACE",
    });

    // Safe view: no emails, no memory contents. (Entity ids are ALLOWED as
    // stable references in context — a founder-ratified BUGD contract change;
    // they resolve identity where display names must not.)
    const serialized = JSON.stringify(r.growth);
    expect(serialized).not.toContain("@niov-test.com");

    // A person who is NOT an org member never appears as a teammate.
    const outsider = await makeEntity("Outsider Person", "PERSON", 3);
    const r2 = await getOrgGrowthForCaller(adminId);
    if (r2.ok === false) throw new Error("expected ok");
    expect(JSON.stringify(r2.growth)).not.toContain("Outsider Person");
    expect(JSON.stringify(r2.growth)).not.toContain(outsider);
  });

  it("non-admin members cannot read the org-growth view", async () => {
    const r = await getOrgGrowthForCaller(connectedId);
    expect(r).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
  });

  // [PROD-UX-ASSIGN] THE TRUTH-CHANGED PROOF: after the admin assigns the
  // newcomer to a project (org-admin override on the EXISTING membership
  // write path), the NEEDS_PROJECT_OR_WORKSPACE recommendation disappears
  // because the org graph changed — not because any UI hid it.
  it("assigning the person a first project makes NEEDS_PROJECT_OR_WORKSPACE disappear (data change, not UI hiding)", async () => {
    // Before: the newcomer is recommended (no project/workspace).
    const before = await getOrgGrowthForCaller(adminId);
    if (before.ok === false) throw new Error("expected ok");
    expect(
      before.growth.recommendations.some(
        (r) => r.kind === "NEEDS_PROJECT_OR_WORKSPACE" && r.context?.person_entity_id === lonelyId,
      ),
    ).toBe(true);

    // The admin assigns them through the existing write path with the
    // org-admin override (the /org/assignments route's exact call).
    const project = await prisma.workProject.create({
      data: {
        org_entity_id: orgId,
        name: `${TEST_PREFIX} First Assignment Project`,
        state: "ACTIVE",
        created_by_entity_id: adminId,
      },
    });
    const { addWorkProjectMemberForCaller } = await import(
      "../../apps/api/src/services/otzar/work-project.service.js"
    );
    const assigned = await addWorkProjectMemberForCaller({
      callerEntityId: adminId,
      projectId: project.project_id,
      entityId: lonelyId,
      actorIsOrgAdmin: true,
      actorOrgEntityId: orgId,
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.audit_event_id.length).toBeGreaterThan(0);

    // After: the recommendation is GONE for this person — the truth changed.
    const after = await getOrgGrowthForCaller(adminId);
    if (after.ok === false) throw new Error("expected ok");
    expect(
      after.growth.recommendations.some(
        (r) => r.kind === "NEEDS_PROJECT_OR_WORKSPACE" && r.context?.person_entity_id === lonelyId,
      ),
    ).toBe(false);
    expect(after.growth.signals.members_without_project_count).toBe(0);
  });

  it("a healthy org gets the calm headline and zero recommendations", async () => {
    // Give the newcomer a profile + project so nothing fires.
    await prisma.entityProfile.create({
      data: { entity_id: lonelyId, job_title: "Engineer" },
    });
    const project = await prisma.workProject.findFirst({
      where: { org_entity_id: orgId },
    });
    if (project === null) throw new Error("expected project");
    await prisma.workProjectMember.create({
      data: {
        project_id: project.project_id,
        org_entity_id: orgId,
        entity_id: lonelyId,
        role: "MEMBER",
      },
    });
    const r = await getOrgGrowthForCaller(adminId);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.growth.recommendations).toEqual([]);
    expect(r.growth.headline).toContain("looks healthy");
  });

  it("employee onboarding view is scoped, warm, and consent-honest", async () => {
    const r = await getOnboardingIntrosForCaller(lonelyId);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.onboarding.greeting).toContain("I'm Otzar");
    expect(r.onboarding.teammates_to_meet.length).toBeGreaterThan(0);
    expect(r.onboarding.memory_consent_note).toContain(
      "Otzar only remembers what you approve",
    );
    // Teammates are display names + role labels only.
    const serialized = JSON.stringify(r.onboarding);
    expect(serialized).not.toContain("@niov-test.com");
    expect(serialized).not.toContain(adminId);
  });

  it("onboarding memory is consent-gated: PROPOSED action, NO capsule until approval", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    const r = await proposeOnboardingMemoryForCaller({
      callerEntityId: lonelyId,
      preferred_name: "Lonnie",
      pronunciation: "LON-ee",
      quiet_preference: "Quiet during the morning standup",
    });
    if (r.ok === false)
      throw new Error(`expected ok, got ${r.code}: ${JSON.stringify(r)}`);
    expect(r.view.action_type).toBe("RECORD_CAPSULE");
    expect(["PROPOSED", "APPROVED"]).toContain(r.view.status);

    // The consent gate holds: no capsule exists until the executor
    // runs an APPROVED action — proposing alone writes nothing.
    const capsulesAfter = await prisma.memoryCapsule.count();
    expect(capsulesAfter).toBe(capsulesBefore);

    // Retrying the same consent payload reuses the same action
    // (idempotent — no duplicate pending approvals).
    const again = await proposeOnboardingMemoryForCaller({
      callerEntityId: lonelyId,
      preferred_name: "Lonnie",
      pronunciation: "LON-ee",
      quiet_preference: "Quiet during the morning standup",
    });
    if (again.ok === false) throw new Error("expected ok");
    expect(again.view.action_id).toBe(r.view.action_id);
  });

  it("empty consent payloads are refused", async () => {
    const r = await proposeOnboardingMemoryForCaller({
      callerEntityId: lonelyId,
      preferred_name: "   ",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("NOTHING_TO_REMEMBER");
  });
});
