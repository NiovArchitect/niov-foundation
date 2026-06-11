// FILE: cosmp-capsule-management.test.ts
// PURPOSE: Phase 1229 — integration test for COSMP capsule list +
//          revoke + audit + DMW revocation gate.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { createHash, randomUUID } from "crypto";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  listCapsulesForCaller,
  revokeCapsuleForCaller,
  getCOSMPAuditForCaller,
  isCapsuleUsable,
} from "../../apps/api/src/services/cosmp/capsule-management.service.js";

const TEST_PREFIX = "__niov_test__phase1229__";

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
    data: { parent_id: orgEntityId, child_id: e.entity_id, is_active: true },
  });
  return e.entity_id;
}

async function seedCapsule(args: {
  entityId: string;
  summary: string;
  type?: string;
}): Promise<string> {
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: args.entityId },
    select: { wallet_id: true },
  });
  if (wallet === null) throw new Error("wallet missing");
  const content_hash = createHash("sha256")
    .update(args.summary)
    .digest("hex");
  const row = await prisma.memoryCapsule.create({
    data: {
      capsule_id: randomUUID(),
      wallet_id: wallet.wallet_id,
      entity_id: args.entityId,
      capsule_type: (args.type ?? "PREFERENCE") as "PREFERENCE",
      topic_tags: [`${TEST_PREFIX}tag`],
      payload_summary: args.summary,
      payload_size_tokens: 8,
      storage_location: `${TEST_PREFIX}local`,
      decay_type: "TIME_BASED" as const,
      content_hash,
    },
  });
  return row.capsule_id;
}

describe("Phase 1229 — COSMP capsule management", () => {
  let orgId = "";
  let sadeilId = "";
  let davidId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeOrgEntity("COSMP Org");
    sadeilId = await makePerson("Sadeil COSMP", orgId);
    davidId = await makePerson("David COSMP", orgId);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("listCapsulesForCaller returns the caller's wallet capsules only", async () => {
    await seedCapsule({ entityId: sadeilId, summary: "Sadeil prefers coffee" });
    await seedCapsule({ entityId: sadeilId, summary: "Sadeil works EST" });
    await seedCapsule({ entityId: davidId, summary: "David likes tea" });
    const res = await listCapsulesForCaller({ callerEntityId: sadeilId });
    expect(res.ok).toBe(true);
    if (res.ok === false) throw new Error("expected ok");
    expect(res.total).toBe(2);
    expect(res.capsules.every((c) => c.entity_id === sadeilId)).toBe(true);
  });

  it("revokeCapsuleForCaller soft-deletes + emits CAPSULE_DELETED audit", async () => {
    const id = await seedCapsule({
      entityId: sadeilId,
      summary: "to revoke",
    });
    const res = await revokeCapsuleForCaller({
      callerEntityId: sadeilId,
      capsuleId: id,
      reason: "user requested",
    });
    expect(res.ok).toBe(true);
    const row = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: id },
    });
    expect(row?.deleted_at).not.toBeNull();
    const list = await listCapsulesForCaller({ callerEntityId: sadeilId });
    if (list.ok === false) throw new Error("list failed");
    // Default list excludes revoked.
    expect(list.capsules.find((c) => c.capsule_id === id)).toBeUndefined();
    // includeRevoked=true surfaces it.
    const withRevoked = await listCapsulesForCaller({
      callerEntityId: sadeilId,
      includeRevoked: true,
    });
    if (withRevoked.ok === false) throw new Error("list2 failed");
    expect(
      withRevoked.capsules.find((c) => c.capsule_id === id)?.status,
    ).toBe("REVOKED");
    // CAPSULE_DELETED audit landed.
    const audits = await prisma.auditEvent.findMany({
      where: { event_type: "CAPSULE_DELETED", actor_entity_id: sadeilId },
    });
    expect(audits.length).toBe(1);
  });

  it("revokeCapsuleForCaller refuses cross-owner revoke (NOT_OWNER)", async () => {
    const id = await seedCapsule({
      entityId: sadeilId,
      summary: "Sadeil's capsule",
    });
    const res = await revokeCapsuleForCaller({
      callerEntityId: davidId,
      capsuleId: id,
    });
    expect(res.ok).toBe(false);
    if (res.ok === true) throw new Error("expected denial");
    expect(res.code).toBe("NOT_OWNER");
  });

  it("DMW revocation gate — SUSPENDED entity cannot list capsules", async () => {
    await seedCapsule({ entityId: sadeilId, summary: "fine" });
    await prisma.entity.update({
      where: { entity_id: sadeilId },
      data: { status: "SUSPENDED" },
    });
    const res = await listCapsulesForCaller({ callerEntityId: sadeilId });
    expect(res.ok).toBe(false);
    if (res.ok === true) throw new Error("expected denial");
    expect(res.code).toBe("DMW_REVOKED");
  });

  it("isCapsuleUsable returns false after revoke", async () => {
    const id = await seedCapsule({ entityId: sadeilId, summary: "ok" });
    expect(await isCapsuleUsable(id)).toBe(true);
    await revokeCapsuleForCaller({ callerEntityId: sadeilId, capsuleId: id });
    expect(await isCapsuleUsable(id)).toBe(false);
  });

  it("getCOSMPAuditForCaller returns scoped audit summary", async () => {
    const id = await seedCapsule({ entityId: sadeilId, summary: "audit me" });
    await revokeCapsuleForCaller({ callerEntityId: sadeilId, capsuleId: id });
    const res = await getCOSMPAuditForCaller({ callerEntityId: sadeilId });
    expect(res.ok).toBe(true);
    if (res.ok === false) throw new Error("expected ok");
    expect(res.summary.total_events).toBeGreaterThan(0);
    expect(res.summary.by_event_type.CAPSULE_DELETED).toBe(1);
  });
});
