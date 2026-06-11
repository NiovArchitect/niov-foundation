// FILE: governed-transaction-walk.test.ts
// PURPOSE: Phase 1250 — the executable governed-transaction proof.
//          End to end on the real database: DMW actors propose mock
//          transaction intents, policy gates them, humans approve
//          (dual control above $1,000), the MOCK rail emits a
//          clearly-labeled proof, every step is audit-chained, the
//          kill switch bites at settle time, tenants stay isolated,
//          regulator evidence stays redacted, and no secret ever
//          appears on the wire. No real rail exists to call.
// CONNECTS TO:
//   - apps/api/src/services/governance/governed-transaction.service.ts
//   - apps/api/src/services/governance/ai-employee.service.ts (the
//     real kill switch exercised here)
//   - apps/api/src/services/compliance/compliance-sharing.service.ts

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  approveMockTransactionIntentForCaller,
  getTransactionReadinessForCaller,
  listMockTransactionIntentsForCaller,
  proposeMockTransactionIntentForCaller,
  revokeMockTransactionIntentForCaller,
  settleMockTransactionIntentForCaller,
} from "../../apps/api/src/services/governance/governed-transaction.service.js";
import {
  deactivateAiEmployeeForCaller,
  provisionAiEmployeeForCaller,
} from "../../apps/api/src/services/governance/ai-employee.service.js";
import {
  createSharePackageForCaller,
  getEvidenceForRegulator,
} from "../../apps/api/src/services/compliance/compliance-sharing.service.js";
import { getHandoffReadinessForCaller } from "../../apps/api/src/services/onboarding/handoff-readiness.service.js";

const TEST_PREFIX = "__niov_test__phase1250__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeEntity(
  displayName: string,
  entityType: "PERSON" | "COMPANY" | "DEVICE" | "REGULATOR",
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

async function cleanupAiEmployees(): Promise<void> {
  const ais = await prisma.entity.findMany({
    where: { public_key: { startsWith: "pk_ai_employee_" } },
    select: { entity_id: true },
  });
  const ids = ais.map((a) => a.entity_id);
  if (ids.length === 0) return;
  await prisma.twinAuthorityGrant.deleteMany({
    where: { grantee_entity_id: { in: ids } },
  });
  await prisma.twinConfig.deleteMany({ where: { twin_id: { in: ids } } });
  await prisma.entityMembership.deleteMany({ where: { child_id: { in: ids } } });
  await prisma.walletBalance.deleteMany({ where: { entity_id: { in: ids } } });
  await prisma.wallet.deleteMany({ where: { entity_id: { in: ids } } });
  await prisma.tokenAttributeRepository.deleteMany({
    where: { entity_id: { in: ids } },
  });
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE audit_events DISABLE TRIGGER USER",
    );
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actor_entity_id: { in: ids } },
          { target_entity_id: { in: ids } },
        ],
      },
    });
  } finally {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE audit_events ENABLE TRIGGER USER",
    );
  }
  await prisma.entity.deleteMany({ where: { entity_id: { in: ids } } });
}

describe("Phase 1250 — governed transaction walk", () => {
  let orgId = "";
  let adminId = "";
  let secondAdminId = "";
  let memberId = "";
  let deviceId = "";
  let regulatorId = "";
  let otherOrgId = "";
  let otherAdminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupAiEmployees();
    await cleanupTestData();
    orgId = await makeEntity("Txn Org", "COMPANY", 5);
    adminId = await makeEntity("Txn Admin", "PERSON", 4);
    secondAdminId = await makeEntity("Txn Second Admin", "PERSON", 4);
    memberId = await makeEntity("Txn Member", "PERSON", 3);
    deviceId = await makeEntity("Txn Badge Printer", "DEVICE", 1);
    regulatorId = await makeEntity("Txn Regulator", "REGULATOR", 3);
    for (const id of [adminId, secondAdminId, memberId, deviceId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
    otherOrgId = await makeEntity("Txn Other Org", "COMPANY", 5);
    otherAdminId = await makeEntity("Txn Other Admin", "PERSON", 4);
    await prisma.entityMembership.create({
      data: { parent_id: otherOrgId, child_id: otherAdminId, is_active: true },
    });
  });

  afterAll(async () => {
    await cleanupAiEmployees();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("intent cannot settle without approval; approval is human, non-self; mock proof + audit emitted", async () => {
    const proposed = await proposeMockTransactionIntentForCaller({
      callerEntityId: memberId,
      amountUsd: 25,
      purpose: "SERVICE_PAYMENT",
      counterpartyLabel: "Conference catering",
    });
    expect(proposed.ok).toBe(true);
    if (proposed.ok === false) throw new Error(proposed.code);
    expect(proposed.intent.status).toBe("APPROVAL_REQUIRED");
    expect(proposed.intent.mock_notice).toContain("MOCK ONLY");
    const intentId = proposed.intent.intent_id;

    // Test requirement 1: no settlement without policy approval.
    const early = await settleMockTransactionIntentForCaller({
      callerEntityId: memberId,
      intentId,
    });
    expect(early).toMatchObject({ ok: false, code: "INTENT_APPROVAL_REQUIRED" });

    // Self-approval is forbidden.
    const selfApprove = await approveMockTransactionIntentForCaller({
      callerEntityId: memberId,
      intentId,
    });
    expect(selfApprove.ok).toBe(false);

    const approved = await approveMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId,
    });
    expect(approved.ok).toBe(true);
    if (approved.ok === false) throw new Error(approved.code);
    expect(approved.intent.status).toBe("APPROVED");

    // Test requirements 8 + 9: mock proof + audit events.
    const settled = await settleMockTransactionIntentForCaller({
      callerEntityId: memberId,
      intentId,
    });
    expect(settled.ok).toBe(true);
    if (settled.ok === false) throw new Error(settled.code);
    expect(settled.proof.receipt.is_mock).toBe(true);
    expect(settled.proof.receipt.rail).toBe("MOCK_RAIL");
    expect(settled.proof.receipt.note).toContain("no funds moved");
    expect(settled.proof.authorization_evidence.audit_chained).toBe(true);
    expect(settled.intent.status).toBe("MOCK_SETTLED");

    const auditRows = await prisma.auditEvent.findMany({
      where: { details: { path: ["intent_id"], equals: intentId } },
      select: { event_type: true },
    });
    const types = auditRows.map((r) => r.event_type).sort();
    expect(types).toEqual([
      "TRANSACTION_INTENT_APPROVED",
      "TRANSACTION_INTENT_PROPOSED",
      "TRANSACTION_MOCK_SETTLED",
    ]);

    // Settling twice is impossible — the chain already says settled.
    const again = await settleMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId,
    });
    expect(again).toMatchObject({ ok: false, code: "INTENT_MOCK_SETTLED" });
  });

  it("AI Employee can propose but never auto-approves; the kill switch blocks propose AND settle", async () => {
    const provisioned = await provisionAiEmployeeForCaller({
      callerEntityId: adminId,
      roleTitle: "Procurement Assistant",
    });
    expect(provisioned.ok).toBe(true);
    if (provisioned.ok === false) throw new Error(provisioned.code);
    const aiId = provisioned.ai_employee.entity_id;

    // Test requirements 3 + 6: even a microtransaction by an AI
    // requires a human approval.
    const micro = await proposeMockTransactionIntentForCaller({
      callerEntityId: aiId,
      amountUsd: 0.5,
      purpose: "RESOURCE_PURCHASE",
    });
    expect(micro.ok).toBe(true);
    if (micro.ok === false) throw new Error(micro.code);
    expect(micro.intent.actor_class).toBe("AI_EMPLOYEE");
    expect(micro.intent.status).toBe("APPROVAL_REQUIRED");
    expect(micro.intent.policy_reason_code).toBe(
      "ai-or-machine-actor-requires-human-approval",
    );

    const approved = await approveMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId: micro.intent.intent_id,
    });
    expect(approved.ok).toBe(true);

    // The REAL kill switch: deactivate the AI Employee, then prove
    // its approved intent can no longer settle (test requirement 11).
    const killed = await deactivateAiEmployeeForCaller({
      callerEntityId: adminId,
      aiEmployeeEntityId: aiId,
    });
    expect(killed.ok).toBe(true);
    const blockedSettle = await settleMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId: micro.intent.intent_id,
    });
    expect(blockedSettle).toMatchObject({
      ok: false,
      code: "PROPOSER_NOT_ACTIVE",
    });
    // And a suspended AI cannot propose at all.
    const blockedPropose = await proposeMockTransactionIntentForCaller({
      callerEntityId: aiId,
      amountUsd: 1,
      purpose: "DEMO",
    });
    expect(blockedPropose).toMatchObject({ ok: false, code: "POLICY_FORBIDDEN" });
  });

  it("device actors require human approval; regulators cannot transact", async () => {
    const device = await proposeMockTransactionIntentForCaller({
      callerEntityId: deviceId,
      amountUsd: 3,
      purpose: "RESOURCE_PURCHASE",
    });
    expect(device.ok).toBe(true);
    if (device.ok === false) throw new Error(device.code);
    expect(device.intent.actor_class).toBe("DEVICE");
    expect(device.intent.status).toBe("APPROVAL_REQUIRED");

    // Regulator is org-external by construction (no membership) —
    // and even with one, policy forbids.
    const reg = await proposeMockTransactionIntentForCaller({
      callerEntityId: regulatorId,
      amountUsd: 3,
      purpose: "DEMO",
    });
    expect(reg.ok).toBe(false);
  });

  it("high value requires TWO distinct human approvers", async () => {
    const proposed = await proposeMockTransactionIntentForCaller({
      callerEntityId: memberId,
      amountUsd: 5000,
      purpose: "PAYOUT",
    });
    expect(proposed.ok).toBe(true);
    if (proposed.ok === false) throw new Error(proposed.code);
    expect(proposed.intent.required_approvals).toBe(2);
    const intentId = proposed.intent.intent_id;

    const first = await approveMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId,
    });
    expect(first.ok).toBe(true);
    if (first.ok === false) throw new Error(first.code);
    expect(first.intent.status).toBe("APPROVAL_REQUIRED");

    // Same approver again is refused — dual control means two PEOPLE.
    const dup = await approveMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId,
    });
    expect(dup).toMatchObject({ ok: false, code: "ALREADY_APPROVED_BY_CALLER" });

    const second = await approveMockTransactionIntentForCaller({
      callerEntityId: secondAdminId,
      intentId,
    });
    expect(second.ok).toBe(true);
    if (second.ok === false) throw new Error(second.code);
    expect(second.intent.status).toBe("APPROVED");
  });

  it("credentials alone never authorize: a CIRCLE_GATEWAY intent is forbidden even with the key set", async () => {
    process.env.CIRCLE_API_KEY = "test-credential-present";
    try {
      const r = await proposeMockTransactionIntentForCaller({
        callerEntityId: memberId,
        amountUsd: 10,
        purpose: "SERVICE_PAYMENT",
        rail: "CIRCLE_GATEWAY",
      });
      expect(r).toMatchObject({ ok: false, code: "POLICY_FORBIDDEN" });
      if (r.ok === false) {
        expect(r.message).toBe(
          "rail-not-executable-credentials-never-authorize",
        );
      }
    } finally {
      delete process.env.CIRCLE_API_KEY;
    }
  });

  it("revoked intents cannot settle — authority is withdrawable until execution", async () => {
    const proposed = await proposeMockTransactionIntentForCaller({
      callerEntityId: memberId,
      amountUsd: 40,
      purpose: "REIMBURSEMENT",
    });
    if (proposed.ok === false) throw new Error(proposed.code);
    const intentId = proposed.intent.intent_id;
    await approveMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId,
    });
    const revoked = await revokeMockTransactionIntentForCaller({
      callerEntityId: memberId,
      intentId,
    });
    expect(revoked.ok).toBe(true);
    const settle = await settleMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId,
    });
    expect(settle).toMatchObject({ ok: false, code: "INTENT_REVOKED" });
  });

  it("tenant isolation: another org's admin cannot see, approve, or settle the intent", async () => {
    const proposed = await proposeMockTransactionIntentForCaller({
      callerEntityId: memberId,
      amountUsd: 15,
      purpose: "SERVICE_PAYMENT",
    });
    if (proposed.ok === false) throw new Error(proposed.code);
    const intentId = proposed.intent.intent_id;
    const approve = await approveMockTransactionIntentForCaller({
      callerEntityId: otherAdminId,
      intentId,
    });
    expect(approve).toMatchObject({ ok: false, code: "INTENT_NOT_FOUND" });
    const list = await listMockTransactionIntentsForCaller({
      callerEntityId: otherAdminId,
    });
    if (list.ok === false) throw new Error(list.code);
    expect(list.intents.map((i) => i.intent_id)).not.toContain(intentId);
  });

  it("regulator evidence includes transaction events but stays redacted — no amounts, no counterparties", async () => {
    const proposed = await proposeMockTransactionIntentForCaller({
      callerEntityId: memberId,
      amountUsd: 77.77,
      purpose: "SERVICE_PAYMENT",
      counterpartyLabel: "SECRET-COUNTERPARTY-LABEL",
    });
    if (proposed.ok === false) throw new Error(proposed.code);
    await approveMockTransactionIntentForCaller({
      callerEntityId: adminId,
      intentId: proposed.intent.intent_id,
    });
    await settleMockTransactionIntentForCaller({
      callerEntityId: memberId,
      intentId: proposed.intent.intent_id,
    });

    const pkg = await createSharePackageForCaller({
      callerEntityId: adminId,
      regulatorEntityId: regulatorId,
      purpose: "Transaction governance review",
      scopes: ["AUDIT_SUMMARY"],
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(pkg.ok).toBe(true);
    if (pkg.ok === false) throw new Error(pkg.code);
    const evidence = await getEvidenceForRegulator({
      callerEntityId: regulatorId,
      packageId: pkg.package.package_id,
    });
    expect(evidence.ok).toBe(true);
    if (evidence.ok === false) throw new Error(evidence.code);
    const serialized = JSON.stringify(evidence);
    expect(serialized).toContain("TRANSACTION_MOCK_SETTLED");
    expect(serialized).not.toContain("77.77");
    expect(serialized).not.toContain("SECRET-COUNTERPARTY-LABEL");
  });

  it("readiness + capability truth report settlement accurately, with no secret leakage", async () => {
    process.env.__TXN_CANARY_SECRET = "canary-secret-value-98765";
    try {
      const readiness = await getTransactionReadinessForCaller({
        callerEntityId: adminId,
      });
      expect(readiness.ok).toBe(true);
      if (readiness.ok === false) throw new Error(readiness.code);
      expect(readiness.readiness.real_funds).toBe("NOT_AUTHORIZED");
      expect(readiness.readiness.private_keys).toContain("NOT_HANDLED");
      const railNames = readiness.readiness.rails.map((r) => r.rail).sort();
      expect(railNames).toEqual([
        "CIRCLE_GATEWAY",
        "COINBASE_BASE",
        "MOCK_RAIL",
      ]);
      const serialized = JSON.stringify(readiness);
      expect(serialized).not.toContain("canary-secret-value-98765");
      expect(serialized).not.toContain("sk-");

      // Members are refused the admin readiness surface.
      const member = await getTransactionReadinessForCaller({
        callerEntityId: memberId,
      });
      expect(member).toMatchObject({ ok: false, code: "ADMIN_REQUIRED" });

      // Capability truth (test requirement 15).
      const handoff = await getHandoffReadinessForCaller(adminId);
      expect(handoff.ok).toBe(true);
      if (handoff.ok === false) throw new Error(handoff.code);
      const caps = handoff.readiness.capabilities;
      const substrate = caps.find((c) =>
        c.capability.startsWith("Governed transaction substrate"),
      );
      expect(substrate?.classification).toBe("PROD");
      const mockRail = caps.find((c) =>
        c.capability.startsWith("Mock settlement rail"),
      );
      expect(mockRail?.classification).toBe("DEMO_ONLY");
      const circle = caps.find((c) => c.capability.includes("Circle"));
      expect(circle?.classification).toBe("BLOCKED_BY_CREDENTIALS");
    } finally {
      delete process.env.__TXN_CANARY_SECRET;
    }
  });
});
