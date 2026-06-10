// FILE: meeting-capture.test.ts
// PURPOSE: Phase 1222 — integration test for the provider-agnostic
//          MeetingCapture substrate. Covers: receive with all-
//          consented participants → PROCESSED; receive with any
//          NOT_CONSENTED → BLOCKED_PARTICIPANT_CONSENT; attach to
//          a workspace (only when not blocked).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  receiveMeetingCaptureForCaller,
  attachCaptureToWorkspaceForCaller,
} from "../../apps/api/src/services/otzar/meeting-capture.service.js";
import { createCollaborationWorkspaceForCaller } from "../../apps/api/src/services/otzar/collaboration-workspace.service.js";

const TEST_PREFIX = "__niov_test__phase1222__";

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

describe("Phase 1222 — MeetingCapture", () => {
  let orgId = "";
  let sadeilId = "";
  let davidId = "";
  let workspaceId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeOrgEntity("MC Org");
    sadeilId = await makePerson("Sadeil MC", orgId);
    davidId = await makePerson("David MC", orgId);
    const ws = await createCollaborationWorkspaceForCaller({
      callerEntityId: sadeilId,
      title: "MC Workspace",
      visibility: "INTERNAL_ONLY",
      initialMembers: [
        {
          member_entity_id: davidId,
          role_label: "Tech Lead",
          access_level: "CONTRIBUTE",
        },
      ],
    });
    if (ws.ok === false) throw new Error("workspace create failed");
    workspaceId = ws.workspace.workspace_id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("all-consented participants → PROCESSED", async () => {
    const r = await receiveMeetingCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "GOOGLE_MEET",
      providerMeetingId: "meet-abc-xyz-123",
      title: "Demo planning",
      participants: [
        {
          display_name: "Sadeil MC",
          participant_entity_id: sadeilId,
          consent_state: "CONSENTED",
          consent_source: "google_meet_invite",
        },
        {
          display_name: "David MC",
          participant_entity_id: davidId,
          consent_state: "CONSENTED",
          consent_source: "google_meet_invite",
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("receive failed");
    expect(r.meeting_capture.status).toBe("PROCESSED");
    expect(r.meeting_capture.provider).toBe("GOOGLE_MEET");
    expect(r.meeting_capture.has_transcript).toBe(false);
    expect(r.participants.length).toBe(2);
  });

  it("a NOT_CONSENTED participant → BLOCKED_PARTICIPANT_CONSENT + attach fails", async () => {
    const r = await receiveMeetingCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "ZOOM",
      title: "External demo",
      participants: [
        {
          display_name: "Sadeil MC",
          participant_entity_id: sadeilId,
          consent_state: "CONSENTED",
        },
        {
          display_name: "External Person",
          consent_state: "NOT_CONSENTED",
        },
      ],
    });
    if (r.ok === false) throw new Error("receive failed");
    expect(r.meeting_capture.status).toBe("BLOCKED_PARTICIPANT_CONSENT");
    const attach = await attachCaptureToWorkspaceForCaller({
      meetingCaptureId: r.meeting_capture.meeting_capture_id,
      workspaceId,
      callerEntityId: sadeilId,
    });
    expect(attach.ok).toBe(false);
    if (attach.ok === false) {
      expect(attach.code).toBe("BLOCKED_PARTICIPANT_CONSENT");
    }
  });

  it("attach a processed capture into the workspace with decisions + commitments", async () => {
    const r = await receiveMeetingCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "MANUAL_UPLOAD",
      title: "Launch Follow-Up Meeting",
      summary: "Sadeil and David aligned on launch readiness.",
      participants: [
        {
          display_name: "Sadeil MC",
          participant_entity_id: sadeilId,
          consent_state: "CONSENTED",
        },
        {
          display_name: "David MC",
          participant_entity_id: davidId,
          consent_state: "CONSENTED",
        },
      ],
    });
    if (r.ok === false) throw new Error("receive failed");
    const attach = await attachCaptureToWorkspaceForCaller({
      meetingCaptureId: r.meeting_capture.meeting_capture_id,
      workspaceId,
      callerEntityId: sadeilId,
      decisions: ["Keep internal note workflows inside Otzar for now."],
      commitments: [
        {
          text: "David reviews the UI flow by Friday.",
          source_excerpt: "Sadeil asked David to review the UI flow by Friday.",
        },
      ],
    });
    expect(attach.ok).toBe(true);
    if (attach.ok === false) throw new Error("attach failed");
    expect(attach.meeting_capture.status).toBe("ATTACHED_TO_WORKSPACE");
    expect(attach.meeting_capture.workspace_id).toBe(workspaceId);
    // The import-comms-output flow registered 1 decision + 1
    // commitment + resolver picked David as owner.
    const decisions = await prisma.collaborationDecision.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
    });
    const commitments = await prisma.collaborationCommitment.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
    });
    expect(decisions.length).toBe(1);
    expect(commitments.length).toBe(1);
    expect(commitments[0]?.owner_entity_id).toBe(davidId);
  });
});
