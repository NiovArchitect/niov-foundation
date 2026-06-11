// FILE: handoff-readiness.test.ts
// PURPOSE: Phase 1242 — integration test for the enterprise handoff
//          readiness aggregate: admin gate, honest schema/credential
//          representation, closed-vocab capability classes, and the
//          no-secrets boundary.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  APPROVAL_PHRASE,
  CAPABILITY_CLASSES,
  PENDING_SCHEMA_TABLES,
  getHandoffReadinessForCaller,
} from "../../apps/api/src/services/onboarding/handoff-readiness.service.js";

const TEST_PREFIX = "__niov_test__phase1242__";

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

describe("Phase 1242 — handoff readiness", () => {
  let orgId = "";
  let adminId = "";
  let memberId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeEntity("Handoff Org", "COMPANY", 5);
    adminId = await makeEntity("Handoff Admin", "PERSON", 4);
    memberId = await makeEntity("Handoff Member", "PERSON", 3);
    for (const id of [adminId, memberId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("admin gets the full truthful readiness aggregate", async () => {
    const r = await getHandoffReadinessForCaller(adminId);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error(`expected ok, got ${r.code}`);
    const v = r.readiness;
    expect(v.headline).toContain("ready for a full internal demo");
    expect(v.org.checklist_steps_total).toBe(11);
    expect(v.runtimes.length).toBeGreaterThanOrEqual(6);
    expect(v.connectors.length).toBeGreaterThan(5);
    // Pending schema is represented honestly with the approval gate.
    expect(v.schema.pending_push).toBe(true);
    expect(v.schema.pending_tables).toEqual([...PENDING_SCHEMA_TABLES]);
    expect(v.schema.approval_phrase).toBe(APPROVAL_PHRASE);
    expect(v.schema.note).toContain("additive only");
    // Capability classes are closed-vocab.
    for (const row of v.capabilities) {
      expect(CAPABILITY_CLASSES).toContain(row.classification);
    }
    // Circle/Base: architecture prepared (Phase 1247), implementation
    // honestly credential-gated + Founder-authorization-gated.
    const circle = v.capabilities.find((c) =>
      c.capability.includes("Circle"),
    );
    expect(circle?.classification).toBe("BLOCKED_BY_CREDENTIALS");
    expect(circle?.note).toContain("ADR-0094");
  });

  it("non-admin members are refused", async () => {
    const r = await getHandoffReadinessForCaller(memberId);
    expect(r).toEqual({ ok: false, code: "ADMIN_REQUIRED" });
  });

  it("no secrets or env values leak — only env NAMES for setup guidance", async () => {
    process.env.__HANDOFF_CANARY_SECRET = "super-secret-value-12345";
    try {
      const r = await getHandoffReadinessForCaller(adminId);
      if (r.ok === false) throw new Error("expected ok");
      const serialized = JSON.stringify(r.readiness);
      expect(serialized).not.toContain("super-secret-value-12345");
      expect(serialized).not.toContain("sk-");
      expect(serialized).not.toContain("client_secret");
      // Env NAMES are allowed (setup guidance), values are not:
      const gw = r.readiness.connectors.find(
        (c) => c.provider === "GOOGLE_WORKSPACE",
      );
      expect(gw?.required_envs).toContain("GOOGLE_OAUTH_CLIENT_ID");
    } finally {
      delete process.env.__HANDOFF_CANARY_SECRET;
    }
  });

  it("runtime rows are honest about fallbacks vs configuration", async () => {
    const r = await getHandoffReadinessForCaller(adminId);
    if (r.ok === false) throw new Error("expected ok");
    for (const rt of r.readiness.runtimes) {
      expect(["CONFIGURED", "FALLBACK_AVAILABLE", "NOT_CONFIGURED"]).toContain(
        rt.status,
      );
      expect(rt.note.length).toBeGreaterThan(10);
    }
    // BEAM defaults to fallback when the deploy flag is off.
    const beam = r.readiness.runtimes.find((x) =>
      x.runtime.includes("BEAM"),
    );
    expect(beam?.status).toBe("FALLBACK_AVAILABLE");
  });

  it("demo/prod separation is reported from the org's onboarding mode", async () => {
    const r = await getHandoffReadinessForCaller(adminId);
    if (r.ok === false) throw new Error("expected ok");
    expect(r.readiness.demo_prod_separation.mode).toBe("DEMO");
    expect(r.readiness.demo_prod_separation.note).toContain("Demo mode");
  });
});
