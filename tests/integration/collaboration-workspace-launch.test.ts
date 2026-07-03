// FILE: collaboration-workspace-launch.test.ts
// PURPOSE: Phase 1221 — canonical end-to-end Founder acceptance
//          scenario: Sadeil creates the "Launch Collaboration"
//          workspace, adds David / Samiksha / Annie, imports the
//          DEMO_SCRIPTED comms output, the resolver assigns each
//          commitment to the correct owner, Sadeil confirms each
//          follow-up, the workspace shows a SEND_INTERNAL_NOTIFICATION
//          Action per owner, the audit chain records the full
//          lineage, and NO external write occurs.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  createCollaborationWorkspaceForCaller,
  importCommsOutputForWorkspaceForCaller,
  confirmCommitmentForCaller,
  getCollaborationWorkspaceDetailForCaller,
  addCollaborationMemberForCaller,
  archiveCollaborationWorkspaceForCaller,
} from "../../apps/api/src/services/otzar/collaboration-workspace.service.js";

const TEST_PREFIX = "__niov_test__phase1221__";

function fakePublicKey(seed: string): string {
  // Minimal placeholder PEM-shape string; the test path never
  // verifies it cryptographically.
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
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: "PERSON",
    clearance_level: 3,
    status: "ACTIVE",
  });
  await prisma.entityMembership.create({
    data: {
      parent_id: orgEntityId,
      child_id: e.entity_id,
      is_active: true,
    },
  });
  return e.entity_id;
}

async function seedOrgActionPolicy(orgEntityId: string): Promise<void> {
  await prisma.orgSettings.upsert({
    where: { org_entity_id: orgEntityId },
    update: {
      auto_approve_low_risk: true,
      require_human_approval: false,
    },
    create: {
      org_entity_id: orgEntityId,
      auto_approve_low_risk: true,
      require_human_approval: false,
    },
  });
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: orgEntityId,
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
      },
    },
    update: { default_decision: "AUTO_APPROVE" },
    create: {
      org_entity_id: orgEntityId,
      action_type: "SEND_INTERNAL_NOTIFICATION",
      risk_tier: "LOW",
      default_decision: "AUTO_APPROVE",
      updated_by: orgEntityId,
    },
  });
}

describe("Phase 1221 — Launch Collaboration acceptance", () => {
  let orgId = "";
  let sadeilId = "";
  let davidId = "";
  let samikshaId = "";
  let annieId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeOrgEntity("NIOV Test Org");
    sadeilId = await makePerson("Sadeil Lewis", orgId);
    davidId = await makePerson("David Odie", orgId);
    samikshaId = await makePerson("Samiksha Sharma", orgId);
    annieId = await makePerson("Annie Wells", orgId);
    await seedOrgActionPolicy(orgId);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("Sadeil creates Launch workspace → David/Samiksha/Annie added → comms import resolves all owners → confirm flows produce 3 SEND_INTERNAL_NOTIFICATION actions + audit lineage", async () => {
    // 1) Sadeil creates workspace with the three teammates as
    //    initial members.
    const created = await createCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      title: "Launch Collaboration",
      description: "Otzar launch readiness",
      visibility: "INTERNAL_ONLY",
      sourceType: "COMMS_CAPTURE",
      initialMembers: [
        {
          member_entity_id: davidId,
          role_label: "Tech Lead",
          responsibility_summary: "UI flow review",
          access_level: "CONTRIBUTE",
        },
        {
          member_entity_id: samikshaId,
          role_label: "AI/NLP Engineer",
          responsibility_summary: "AI trial review",
          access_level: "CONTRIBUTE",
        },
        {
          member_entity_id: annieId,
          role_label: "Risk & Compliance Lead",
          responsibility_summary: "compliance review",
          access_level: "CONTRIBUTE",
        },
      ],
    });
    expect(created.ok).toBe(true);
    if (created.ok === false) throw new Error("create failed");
    const workspaceId = created.workspace.workspace_id;
    expect(created.members.length).toBe(4); // 3 + Sadeil himself

    // 2) Import the DEMO_SCRIPTED comms output.
    const imp = await importCommsOutputForWorkspaceForCaller({
      workspaceId,
      callerEntityId: sadeilId,
      summary:
        "Sadeil, David, Samiksha, and Annie aligned on the Otzar launch follow-up.",
      decisions: [
        "Keep internal note workflows inside Otzar notifications only for now.",
        "Do not enable Slack or email sending until explicit connector approval is finished.",
      ],
      commitments: [
        {
          text: "David reviews the UI flow by Friday.",
          source_excerpt:
            "Sadeil asked David to review the UI flow by Friday.",
        },
        {
          text: "Samiksha reviews the AI/NLP trial notes and summarizes any concerns.",
          source_excerpt:
            "Samiksha agreed to review the AI/NLP trial notes and summarize any concerns.",
        },
        {
          text: "Annie completes the compliance review this week once the summary is ready.",
          source_excerpt:
            "Annie said she can complete a compliance review this week if the summary is ready.",
        },
      ],
    });
    expect(imp.ok).toBe(true);
    if (imp.ok === false) throw new Error("import failed");
    expect(imp.decisions.length).toBe(2);
    expect(imp.commitments.length).toBe(3);

    // 3) Verify resolver assigned the right owners.
    const davidCommitment = imp.commitments.find(
      (c) => c.owner_entity_id === davidId,
    );
    const samikshaCommitment = imp.commitments.find(
      (c) => c.owner_entity_id === samikshaId,
    );
    const annieCommitment = imp.commitments.find(
      (c) => c.owner_entity_id === annieId,
    );
    expect(davidCommitment).toBeDefined();
    expect(samikshaCommitment).toBeDefined();
    expect(annieCommitment).toBeDefined();
    expect(davidCommitment!.resolution_status).toBe("RESOLVED");
    expect(davidCommitment!.confidence).toBe("HIGH");
    expect(davidCommitment!.assignment_reason).toContain("David");
    expect(samikshaCommitment!.assignment_reason).toContain("agreed");
    expect(annieCommitment!.assignment_reason).toContain("agreed");

    // 4) Sadeil confirms each follow-up — produces governed
    //    SEND_INTERNAL_NOTIFICATION Actions.
    const conf1 = await confirmCommitmentForCaller({
      workspaceId,
      commitmentId: davidCommitment!.commitment_id,
      callerEntityId: sadeilId,
    });
    const conf2 = await confirmCommitmentForCaller({
      workspaceId,
      commitmentId: samikshaCommitment!.commitment_id,
      callerEntityId: sadeilId,
    });
    const conf3 = await confirmCommitmentForCaller({
      workspaceId,
      commitmentId: annieCommitment!.commitment_id,
      callerEntityId: sadeilId,
    });
    expect(conf1.ok).toBe(true);
    expect(conf2.ok).toBe(true);
    expect(conf3.ok).toBe(true);
    if (
      conf1.ok === false ||
      conf2.ok === false ||
      conf3.ok === false
    )
      throw new Error("confirm failed");

    expect(conf1.action.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    expect(conf2.action.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    expect(conf3.action.action_type).toBe("SEND_INTERNAL_NOTIFICATION");

    // 5) Verify the Actions have target_entity_id set to each owner.
    const action1 = await prisma.action.findUnique({
      where: { action_id: conf1.action.action_id },
    });
    const action2 = await prisma.action.findUnique({
      where: { action_id: conf2.action.action_id },
    });
    const action3 = await prisma.action.findUnique({
      where: { action_id: conf3.action.action_id },
    });
    expect(action1?.target_entity_id).toBe(davidId);
    expect(action2?.target_entity_id).toBe(samikshaId);
    expect(action3?.target_entity_id).toBe(annieId);

    // 6) Workspace detail shows 3 commitments now ACTION_CREATED + 3
    //    linked_actions + 2 decisions.
    const detail = await getCollaborationWorkspaceDetailForCaller(
      workspaceId,
      sadeilId,
    );
    expect(detail.ok).toBe(true);
    if (detail.ok === false) throw new Error("detail failed");
    expect(detail.detail.commitments.length).toBe(3);
    expect(detail.detail.decisions.length).toBe(2);
    expect(detail.detail.linked_actions.length).toBe(3);

    // 7) Audit-chain assertions — full lineage present.
    const auditRows = await prisma.auditEvent.findMany({
      where: {
        details: {
          path: ["workspace_id"],
          equals: workspaceId,
        },
      },
      select: { event_type: true },
    });
    const eventTypes = auditRows.map((r) => r.event_type);
    expect(eventTypes).toContain("WORKSPACE_CREATED");
    expect(eventTypes.filter((e) => e === "WORKSPACE_MEMBER_ADDED").length).toBe(
      3,
    );
    expect(
      eventTypes.filter((e) => e === "WORKSPACE_DECISION_ADDED").length,
    ).toBe(2);
    expect(
      eventTypes.filter((e) => e === "WORKSPACE_COMMITMENT_ADDED").length,
    ).toBe(3);
    expect(
      eventTypes.filter((e) => e === "WORKSPACE_COMMITMENT_CONFIRMED").length,
    ).toBe(3);
    expect(
      eventTypes.filter((e) => e === "WORKSPACE_ACTION_LINKED").length,
    ).toBe(3);

    // 8) The Action target_entity_id encodes the recipient. The
    //    SEND_INTERNAL_NOTIFICATION executor will create
    //    Notification rows on its next cron tick (cron is async; the
    //    service-tier guarantee is that target_entity_id is wired
    //    correctly, which is asserted at (5) above).

    // 9) NO external connector writes — no INVOKE_CONNECTOR
    //    actions and no external commitments scoped to THIS org.
    const invokeConnectorActions = await prisma.action.findMany({
      where: {
        action_type: "INVOKE_CONNECTOR",
        org_entity_id: orgId,
      },
    });
    expect(invokeConnectorActions.length).toBe(0);
    const externalCommitments = await prisma.externalCommitment.findMany({
      where: { workspace_id: workspaceId },
    });
    expect(externalCommitments.length).toBe(0);
  });

  it("ignores OUTSIDE_WORKSPACE name (org-roster but not workspace member)", async () => {
    // Create Maria as an org member but NOT a workspace member.
    const mariaId = await makePerson("Maria Lopez", orgId);
    expect(mariaId.length).toBeGreaterThan(0);

    const created = await createCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      title: "Small Workspace",
      visibility: "INTERNAL_ONLY",
      initialMembers: [
        {
          member_entity_id: davidId,
          role_label: "Tech Lead",
          access_level: "CONTRIBUTE",
        },
      ],
    });
    if (created.ok === false) throw new Error("create failed");
    const wsId = created.workspace.workspace_id;
    const imp = await importCommsOutputForWorkspaceForCaller({
      workspaceId: wsId,
      callerEntityId: sadeilId,
      decisions: [],
      commitments: [
        {
          text: "Maria sends the booth dimensions by Friday.",
          source_excerpt: "Maria said she would send the booth dimensions.",
        },
      ],
    });
    if (imp.ok === false) throw new Error("import failed");
    expect(imp.commitments[0]?.resolution_status).toBe("UNRESOLVED");
    expect(imp.commitments[0]?.owner_entity_id).toBeNull();
    expect(imp.commitments[0]?.assignment_reason.toLowerCase()).toContain(
      "workspace",
    );
  });

  it("confirm fails with COMMITMENT_NOT_RESOLVED for unresolved commitments", async () => {
    const created = await createCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      title: "Solo Workspace",
      visibility: "INTERNAL_ONLY",
    });
    if (created.ok === false) throw new Error("create failed");
    const wsId = created.workspace.workspace_id;
    const imp = await importCommsOutputForWorkspaceForCaller({
      workspaceId: wsId,
      callerEntityId: sadeilId,
      decisions: [],
      commitments: [
        {
          text: "Someone should pick up the snacks.",
          source_excerpt: "Someone should pick up the snacks.",
        },
      ],
    });
    if (imp.ok === false) throw new Error("import failed");
    expect(imp.commitments[0]?.resolution_status).toBe("UNRESOLVED");
    const c = imp.commitments[0]!;
    const conf = await confirmCommitmentForCaller({
      workspaceId: wsId,
      commitmentId: c.commitment_id,
      callerEntityId: sadeilId,
    });
    expect(conf.ok).toBe(false);
    if (conf.ok === false) {
      expect(conf.code).toBe("COMMITMENT_NOT_RESOLVED");
    }
  });

  it("rejects external members when workspace visibility is INTERNAL_ONLY", async () => {
    const created = await createCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      title: "Internal Workspace",
      visibility: "INTERNAL_ONLY",
    });
    if (created.ok === false) throw new Error("create failed");
    const wsId = created.workspace.workspace_id;
    // Make an entity in a different org.
    const otherOrgId = await makeOrgEntity("Other Org");
    const externalPersonId = await makePerson("Outside Person", otherOrgId);
    const add = await addCollaborationMemberForCaller({
      workspaceId: wsId,
      callerEntityId: sadeilId,
      memberEntityId: externalPersonId,
      roleLabel: "Outside collaborator",
      memberType: "EXTERNAL",
    });
    expect(add.ok).toBe(false);
    if (add.ok === false) {
      expect(add.code).toBe("EXTERNAL_NOT_PERMITTED");
    }
  });

  // ── [GAP-C] the workspace archive rail: reversibility parity with projects ──

  it("the creator (APPROVE) archives the workspace: audited, idempotent, never hard-deleted", async () => {
    const created = await createCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      title: "Archive Rail Workspace",
      visibility: "INTERNAL_ONLY",
      sourceType: "MANUAL",
      initialMembers: [
        { member_entity_id: davidId, role_label: "Tech Lead", access_level: "CONTRIBUTE" },
      ],
    });
    expect(created.ok).toBe(true);
    if (created.ok === false) throw new Error("create failed");
    const wsId = created.workspace.workspace_id;

    // A CONTRIBUTE member cannot archive (authority boundary).
    const denied = await archiveCollaborationWorkspaceForCaller({
      callerEntityId: davidId,
      workspaceId: wsId,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok === false) expect(denied.code).toBe("NOT_WORKSPACE_APPROVER");

    // A non-member cannot archive either.
    const outsider = await archiveCollaborationWorkspaceForCaller({
      callerEntityId: annieId,
      workspaceId: wsId,
    });
    expect(outsider.ok).toBe(false);

    // The creator (APPROVE) archives it — audited, status flip only.
    const archived = await archiveCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      workspaceId: wsId,
    });
    expect(archived.ok).toBe(true);
    if (archived.ok === false) throw new Error("archive failed");
    expect(archived.workspace.status).toBe("ARCHIVED");
    expect(archived.audit_event_id.length).toBeGreaterThan(0);
    const row = await prisma.collaborationWorkspace.findUnique({
      where: { workspace_id: wsId },
    });
    expect(row?.status).toBe("ARCHIVED");
    expect(row?.archived_at).not.toBeNull();
    expect(row?.deleted_at).toBeNull(); // RULE 10 — never hard-deleted

    // Idempotent: archiving again refuses honestly.
    const again = await archiveCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      workspaceId: wsId,
    });
    expect(again.ok).toBe(false);
    if (again.ok === false) expect(again.code).toBe("ALREADY_ARCHIVED");
  });
});
