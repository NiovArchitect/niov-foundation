// FILE: dmw-registry.test.ts
// PURPOSE: Phase 1228 — integration test for the DMW Registry.
//          Covers: getMyDMWForCaller; listOrgDMWForCaller;
//          getDMWByIdForCaller cross-org rejection;
//          createDMWDelegationForCaller produces TeamDelegation;
//          revokeDMWDelegationForCaller flips status to REVOKED;
//          isDMWActive returns false for SUSPENDED entities.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  getMyDMWForCaller,
  listOrgDMWForCaller,
  getDMWByIdForCaller,
  createDMWDelegationForCaller,
  revokeDMWDelegationForCaller,
  isDMWActive,
} from "../../apps/api/src/services/dmw/dmw-registry.service.js";

const TEST_PREFIX = "__niov_test__phase1228__";

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

async function makeAITwin(
  displayName: string,
  controllerEntityId: string,
  orgEntityId: string,
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}twin.${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName} Twin`,
    entity_type: "AI_AGENT",
    clearance_level: 2,
    status: "ACTIVE",
    wallet_type: "PERSONAL",
  });
  // Two parent memberships: org + human controller.
  await prisma.entityMembership.create({
    data: { parent_id: orgEntityId, child_id: e.entity_id, is_active: true },
  });
  await prisma.entityMembership.create({
    data: { parent_id: controllerEntityId, child_id: e.entity_id, is_active: true },
  });
  return e.entity_id;
}

describe("Phase 1228 — DMW Registry", () => {
  let orgId = "";
  let sadeilId = "";
  let davidId = "";
  let twinId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeOrgEntity("DMW Org");
    sadeilId = await makePerson("Sadeil DMW", orgId);
    davidId = await makePerson("David DMW", orgId);
    twinId = await makeAITwin("Sadeil", sadeilId, orgId);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("getMyDMWForCaller maps PERSON → HUMAN; AI_AGENT+PERSONAL → AI_TWIN", async () => {
    const sadeil = await getMyDMWForCaller(sadeilId);
    expect(sadeil).not.toBeNull();
    expect(sadeil?.dmw_type).toBe("HUMAN");
    expect(sadeil?.display_name).toContain("Sadeil");

    const twin = await getMyDMWForCaller(twinId);
    expect(twin?.dmw_type).toBe("AI_TWIN");
    expect(twin?.controller_dmw_id).toBe(sadeilId);
  });

  it("listOrgDMWForCaller returns the org + members + twin", async () => {
    const res = await listOrgDMWForCaller(sadeilId);
    expect(res.ok).toBe(true);
    if (res.ok === false) throw new Error("expected ok");
    expect(res.entries.find((e) => e.dmw_type === "ENTERPRISE")?.dmw_id).toBe(
      orgId,
    );
    const humans = res.entries.filter((e) => e.dmw_type === "HUMAN");
    expect(humans.length).toBeGreaterThanOrEqual(2);
    const twins = res.entries.filter((e) => e.dmw_type === "AI_TWIN");
    expect(twins.length).toBe(1);
  });

  it("getDMWByIdForCaller refuses cross-org access", async () => {
    const otherOrgId = await makeOrgEntity("Other DMW Org");
    const outsiderId = await makePerson("Outsider", otherOrgId);
    const res = await getDMWByIdForCaller(outsiderId, sadeilId);
    expect(res.ok).toBe(false);
    if (res.ok === true) throw new Error("expected denial");
    expect(res.code).toBe("NOT_ALLOWED");
  });

  it("createDMWDelegationForCaller — controller delegates twin → David", async () => {
    const res = await createDMWDelegationForCaller({
      callerEntityId: sadeilId,
      targetDmwId: twinId,
      teamEntityId: davidId,
      capabilityScope: ["READ_SCHEDULE", "DRAFT_NOTIFICATION"],
    });
    expect(res.ok).toBe(true);
    if (res.ok === false) throw new Error("expected ok");
    expect(res.status).toBe("ACTIVE");
    expect(res.capability_scope).toContain("READ_SCHEDULE");
  });

  it("createDMWDelegationForCaller — non-controller is refused with NOT_CONTROLLER", async () => {
    const res = await createDMWDelegationForCaller({
      callerEntityId: davidId, // David is NOT the twin's controller
      targetDmwId: twinId,
      teamEntityId: davidId,
      capabilityScope: ["READ_SCHEDULE"],
    });
    expect(res.ok).toBe(false);
    if (res.ok === true) throw new Error("expected denial");
    expect(res.code).toBe("NOT_CONTROLLER");
  });

  it("revokeDMWDelegationForCaller — flips status + records revoked_by", async () => {
    const create = await createDMWDelegationForCaller({
      callerEntityId: sadeilId,
      targetDmwId: twinId,
      teamEntityId: davidId,
      capabilityScope: ["READ_SCHEDULE"],
    });
    if (create.ok === false) throw new Error("create failed");
    const revoke = await revokeDMWDelegationForCaller({
      delegationId: create.delegation_id,
      callerEntityId: sadeilId,
    });
    expect(revoke.ok).toBe(true);
    if (revoke.ok === false) throw new Error("revoke failed");
    const row = await prisma.teamDelegation.findUnique({
      where: { delegation_id: create.delegation_id },
    });
    expect(row?.status).toBe("REVOKED");
    expect(row?.revoked_by).toBe(sadeilId);
  });

  it("isDMWActive — SUSPENDED entity returns false", async () => {
    expect(await isDMWActive(sadeilId)).toBe(true);
    await prisma.entity.update({
      where: { entity_id: sadeilId },
      data: { status: "SUSPENDED" },
    });
    expect(await isDMWActive(sadeilId)).toBe(false);
  });
});
