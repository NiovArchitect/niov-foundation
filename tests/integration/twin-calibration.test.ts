// FILE: twin-calibration.test.ts (integration, real Postgres)
// PURPOSE: [CS-3] lock the twin-calibration rail: preference-only content
//          rides the SAME consent gate as onboarding memory — an
//          Action(PROPOSED, RECORD_CAPSULE) into the caller's OWN wallet,
//          saved only after approval (nothing touches MemoryCapsule at
//          propose time); field caps enforced; idempotent per content;
//          self-scoped by construction (the route has no target param);
//          calibration content is preference SHAPE, never company lineage.
// CONNECTS TO: dandelion-growth.service.ts (proposeTwinCalibrationForCaller),
//          otzar-dandelion.routes.ts (POST /otzar/twin/calibration), Gap V.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import {
  buildTwinCalibrationContent,
  proposeTwinCalibrationForCaller,
} from "../../apps/api/src/services/otzar/dandelion-growth.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/[^a-z0-9]/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName + randomUUID()),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  const actions = await prisma.action.findMany({
    where: { source_entity_id: { in: ids } },
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
      await prisma.actionResult.deleteMany({ where: { attempt_id: { in: attemptIds } } });
      await prisma.actionAttempt.deleteMany({ where: { attempt_id: { in: attemptIds } } });
    }
    await prisma.action.deleteMany({ where: { action_id: { in: actionIds } } });
  }
}

describe("[CS-3] twin calibration — preference-only, consent-gated (DB)", () => {
  let orgId = "";
  let callerId = "";

  async function grantOrgAdmin(entityId: string): Promise<void> {
    // Dual-control approver eligibility (mirrors the canonical fixture).
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: { can_admin_org: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entityId },
    });
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: {
        tar_hash: computeTARHash({
          can_login: fresh!.can_login,
          can_read_capsules: fresh!.can_read_capsules,
          can_write_capsules: fresh!.can_write_capsules,
          can_share_capsules: fresh!.can_share_capsules,
          can_create_hives: fresh!.can_create_hives,
          can_access_external_api: fresh!.can_access_external_api,
          can_admin_niov: fresh!.can_admin_niov,
          can_admin_org: fresh!.can_admin_org,
          clearance_ceiling: fresh!.clearance_ceiling,
          monetization_role: fresh!.monetization_role,
          compliance_frameworks: fresh!.compliance_frameworks,
          status: fresh!.status,
        }),
      },
    });
  }

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Cal Org", "COMPANY");
    callerId = await makeEntity("Cal Person", "PERSON");
    const adminId = await makeEntity("Cal Admin", "PERSON");
    await grantOrgAdmin(adminId);
    for (const id of [callerId, adminId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("propose creates a PROPOSED RECORD_CAPSULE action into the caller's own scope — and writes NO capsule until approval", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    const r = await proposeTwinCalibrationForCaller({
      callerEntityId: callerId,
      summary_preference: "Concise bullets, action items first",
      tone_preference: "Warm and direct",
      reminder_preference: "Remind me early",
      decision_support_preference: "Show risks first, then a recommended next step",
      writing_style_text: "Short context, then the action.",
      current_focus_text: "Customer onboarding quality this quarter.",
      do_not_do_text: "Do not send anything without asking.",
    });
    if (r.ok === false) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
    const action = await prisma.action.findUnique({ where: { action_id: r.view.action_id } });
    expect(action).not.toBeNull();
    expect(action!.action_type).toBe("RECORD_CAPSULE");
    expect(action!.status).toBe("PROPOSED");
    expect(action!.source_entity_id).toBe(callerId);
    const payload = action!.payload_redacted as Record<string, unknown>;
    expect(payload.capsule_type).toBe("PREFERENCE");
    expect(payload.topic_tags).toEqual(["calibration", "preference", "twin"]);
    const content = payload.content as string;
    for (const line of [
      "Summary preference: Concise bullets, action items first",
      "Communication tone: Warm and direct",
      "Reminder preference: Remind me early",
      "Decision support preference: Show risks first, then a recommended next step",
      "Writing style (in their own words): Short context, then the action.",
      "Current focus and responsibilities: Customer onboarding quality this quarter.",
      "Do not do: Do not send anything without asking.",
    ]) {
      expect(content).toContain(line);
    }
    // The consent gate holds: no memory exists until the user approves.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    // Calibration is preference shape — never company lineage.
    expect(JSON.stringify(payload)).not.toMatch(/seeded_context|source_lineage|meeting_capture/);
  });

  it("idempotent per content: re-proposing the same preferences never duplicates the pending approval", async () => {
    const input = { callerEntityId: callerId, tone_preference: "Concise and professional" };
    const first = await proposeTwinCalibrationForCaller(input);
    const second = await proposeTwinCalibrationForCaller(input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const actions = await prisma.action.findMany({
      where: { source_entity_id: callerId, action_type: "RECORD_CAPSULE" },
    });
    expect(actions.length).toBe(1);
  });

  it("caps and emptiness: fields clip at 600 chars; nothing-provided refuses honestly", async () => {
    const long = "x".repeat(1000);
    const content = buildTwinCalibrationContent({ writing_style_text: long });
    expect(content!.length).toBeLessThanOrEqual("Writing style (in their own words): ".length + 600);
    const empty = await proposeTwinCalibrationForCaller({ callerEntityId: callerId });
    expect(empty.ok).toBe(false);
    if (empty.ok === false) expect(empty.code).toBe("NOTHING_TO_REMEMBER");
  });
});
