// FILE: beam-status.test.ts
// PURPOSE: Phase 1241 — integration test for the BEAM production-path
//          consumers: honest runtime status in every mode,
//          participant-scoped supervised status with deterministic
//          Foundation fallback, no existence oracle, and the
//          observation-only invariant (reads never mutate).

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  getBeamRuntimeStatus,
  getCollaborationSupervisedStatusForCaller,
} from "../../apps/api/src/services/coordination/beam-collaboration-supervisor.service.js";

const TEST_PREFIX = "__niov_test__phase1241__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeEntity(displayName: string): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: "PERSON",
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}

describe("Phase 1241 — BEAM production-path consumers", () => {
  let orgId = "";
  let requesterId = "";
  let targetId = "";
  let outsiderId = "";
  let collaborationId = "";
  const savedEnabled = process.env.BEAM_RUNTIME_ENABLED;
  const savedUrl = process.env.BEAM_RUNTIME_URL;

  beforeEach(async () => {
    delete process.env.BEAM_RUNTIME_ENABLED;
    delete process.env.BEAM_RUNTIME_URL;
    await ensureAuditTriggers();
    await cleanupTestData();
    const org = await createEntity({
      email: `${TEST_PREFIX}org@niov-test.com`,
      public_key: fakePublicKey("org"),
      display_name: `${TEST_PREFIX} Beam Org`,
      entity_type: "COMPANY",
      clearance_level: 5,
      status: "ACTIVE",
    });
    orgId = org.entity_id;
    requesterId = await makeEntity("Beam Requester");
    targetId = await makeEntity("Beam Target");
    outsiderId = await makeEntity("Beam Outsider");
    for (const id of [requesterId, targetId, outsiderId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
    const row = await prisma.twinCollaborationRequest.create({
      data: {
        org_entity_id: orgId,
        requester_entity_id: requesterId,
        target_entity_id: targetId,
        request_type: "STATUS_REQUEST",
        target_type: "EMPLOYEE",
        state: "REQUESTED",
        safe_summary: `${TEST_PREFIX} supervised status check`,
      },
    });
    collaborationId = row.collaboration_id;
  });

  afterEach(() => {
    if (savedEnabled === undefined) delete process.env.BEAM_RUNTIME_ENABLED;
    else process.env.BEAM_RUNTIME_ENABLED = savedEnabled;
    if (savedUrl === undefined) delete process.env.BEAM_RUNTIME_URL;
    else process.env.BEAM_RUNTIME_URL = savedUrl;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("runtime status is honest in every mode", async () => {
    expect(
      (await getBeamRuntimeStatus({ enabled: false }))
        .collaboration_supervisor,
    ).toBe("DISABLED");
    expect(
      (await getBeamRuntimeStatus({ enabled: true, beamUrl: null }))
        .collaboration_supervisor,
    ).toBe("READY_NOT_ACTIVE");
    const okFetch = (async () =>
      new Response("{}", { status: 200 })) as unknown as typeof fetch;
    expect(
      (
        await getBeamRuntimeStatus({
          enabled: true,
          beamUrl: "http://beam.test",
          fetchImpl: okFetch,
        })
      ).collaboration_supervisor,
    ).toBe("ACTIVE");
    const failFetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    expect(
      (
        await getBeamRuntimeStatus({
          enabled: true,
          beamUrl: "http://beam.test",
          fetchImpl: failFetch,
        })
      ).collaboration_supervisor,
    ).toBe("UNREACHABLE");
  });

  it("participants read supervised status with the deterministic Foundation fallback", async () => {
    for (const caller of [requesterId, targetId]) {
      const r = await getCollaborationSupervisedStatusForCaller(
        caller,
        collaborationId,
        { enabled: false },
      );
      expect(r.ok).toBe(true);
      if (r.ok === false) throw new Error("expected ok");
      expect(r.status.provider_mode).toBe("DISABLED");
      expect(r.status.state).toBe("REQUESTED");
    }
  });

  it("non-participants get COLLABORATION_NOT_FOUND (no existence oracle)", async () => {
    const r = await getCollaborationSupervisedStatusForCaller(
      outsiderId,
      collaborationId,
      { enabled: false },
    );
    expect(r).toEqual({ ok: false, code: "COLLABORATION_NOT_FOUND" });
  });

  it("an unreachable BEAM runtime degrades to the Foundation projection, never an error", async () => {
    const failFetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const r = await getCollaborationSupervisedStatusForCaller(
      requesterId,
      collaborationId,
      { enabled: true, beamUrl: "http://beam.test", fetchImpl: failFetch },
    );
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.status.provider_mode).toBe("UNREACHABLE");
    expect(r.status.state).toBe("REQUESTED");
  });

  it("supervised reads are observation-only — the row never mutates", async () => {
    const before = await prisma.twinCollaborationRequest.findUnique({
      where: { collaboration_id: collaborationId },
    });
    await getCollaborationSupervisedStatusForCaller(
      requesterId,
      collaborationId,
      { enabled: false },
    );
    const after = await prisma.twinCollaborationRequest.findUnique({
      where: { collaboration_id: collaborationId },
    });
    expect(after).toEqual(before);
  });
});
