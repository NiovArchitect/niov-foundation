// FILE: escalation.test.ts (unit)
// PURPOSE: Cover the 8 functions in services/governance/escalation.service.ts
//          (landed at 40dac21 / [D-2D-D10-2]): createEscalationForCaller,
//          getEscalationForCaller, listEscalationsPendingForCaller,
//          countEscalationsPending, the approve/reject pair (sharing the
//          internal transitionPendingForCaller helper), and expireEscalation.
//          Direct service calls; route-level coverage is future work
//          (the escalation routes land in a later Sub-box-1 commit).
// CONNECTS TO: services/governance/escalation.service.ts (via "@niov/api"),
//              the escalation_requests + entities + audit_events tables,
//              tests/helpers.ts (entity fixtures + cleanup).
//
// 4-FRAMING-REGISTER CROSS-REFERENCE (RULE 17):
//   - RAA 12.8 §5.2 -- canonical escalation status workflow (PENDING ->
//     APPROVED/REJECTED/EXPIRED) that this service implements.
//   - Section 12.5 Sub-box 1 -- the human-in-the-loop primitive this
//     test surface anchors.
//   - RAA 12.8 §5.9 item 1 -- the priming-context EscalationItem
//     consumer-side shape (priming.ts) that drives listEscalationsPendingForCaller.
//   - ADR-0011 -- unit-tier discipline: containerized Postgres, fixture
//     LLM (not exercised here), target <60s suite runtime.
//
// cleanupTestEscalations RATIONALE: EscalationRequest's entity relations
// have NO onDelete: Cascade (deliberate -- RULE 10: production entities
// are never hard-deleted, only soft-deleted via deleted_at, so a cascade
// is meaningless there; and the audit-adjacent lineage is preserved).
// But helpers.ts:cleanupTestData() DOES hard-delete test entities, which
// would FK-fail against any escalation_requests row referencing them.
// So this test owns its own escalation_requests cleanup -- the same
// pattern as auth tests owning rate-limit reset -- running BEFORE
// cleanupTestData() in beforeAll / afterEach / afterAll.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  approveEscalationForCaller,
  countEscalationsPending,
  createEscalationForCaller,
  createGateEscalationForCaller,
  expireEscalation,
  getEscalationForCaller,
  listEscalationsPendingForCaller,
  rejectEscalationForCaller,
} from "@niov/api";
import {
  createCapsule,
  createEntity,
  getWalletByEntityId,
  prisma,
  SYSTEM_PRINCIPALS,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import { safeApproverReason } from "../../apps/api/src/services/governance/escalation.service.js";

// WHAT: Delete every escalation_requests row that references a test
//        entity (source / target / resolver). Query-based (not
//        ID-parametrized) so it also clears stale rows left by a
//        previous run -- mirrors how cleanupTestData() itself works.
// INPUT: None.
// OUTPUT: A promise that resolves once the rows are gone.
// WHY: Must run BEFORE cleanupTestData() -- see the file-header
//      cleanupTestEscalations RATIONALE block.
async function cleanupTestEscalations(): Promise<void> {
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
}

// WHAT: Build a fresh PERSON entity for use as a test party.
// INPUT: None.
// OUTPUT: The new entity_id.
// WHY: Source / target / resolver all need real Entity rows (the
//      escalation_requests FKs point at entities.entity_id).
async function makeParty(): Promise<string> {
  const e = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  return e.entity_id;
}

// WHAT: Build a capsule owned by a given entity; return its capsule_id.
// INPUT: ownerId (the capsule owner; createEntity already minted their
//        wallet in the same tx per Section 1B).
// OUTPUT: The new capsule_id.
// WHY: createGateEscalationForCaller takes a real capsule_id (the
//      escalation_requests.capsule_id FK points at memory_capsules);
//      the other escalation tests pass capsule_id null and so do not
//      need a real capsule, but the gate-escalation path does.
async function makeCapsuleFor(ownerId: string): Promise<string> {
  const wallet = await getWalletByEntityId(ownerId);
  const capsule = await createCapsule(
    makeCapsuleInput(wallet!.wallet_id, ownerId),
  );
  return capsule.capsule_id;
}

// WHAT: Find the audit_events row this escalation produced.
// INPUT: escalationId.
// OUTPUT: { event_type, actor_entity_id, details }, or undefined if none.
//          system_principal (for the expire path) lives inside details
//          -- writeAuditEvent merges it there (12C.0 Item 7), there is
//          no top-level column.
// WHY: The audit assertions verify the pre-success write inside the
//      transaction (ADR-0002 + RULE 4); we locate the row by the
//      escalation_id embedded in details rather than by actor (the
//      expire path has a null actor).
async function findEscalationAudit(
  escalationId: string,
): Promise<
  | { event_type: string; actor_entity_id: string | null; details: Record<string, unknown> }
  | undefined
> {
  const rows = await prisma.auditEvent.findMany({
    where: { event_type: "ADMIN_ACTION" },
    orderBy: { timestamp: "desc" },
    take: 50,
  });
  const match = rows.find((r) => {
    const d = r.details as Record<string, unknown>;
    return d.escalation_id === escalationId;
  });
  if (match === undefined) return undefined;
  return {
    event_type: match.event_type,
    actor_entity_id: match.actor_entity_id,
    details: match.details as Record<string, unknown>,
  };
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterEach(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

let sourceId = "";
let targetId = "";
let resolverId = "";

beforeEach(async () => {
  sourceId = await makeParty();
  targetId = await makeParty();
  resolverId = await makeParty();
});

describe("createEscalationForCaller", () => {
  it("creates a PENDING row with the caller as source and returns the full record", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "needs a human eye",
    });
    expect(created.escalation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.status).toBe("PENDING");
    expect(created.source_entity_id).toBe(sourceId);
    expect(created.target_entity_id).toBe(targetId);
    expect(created.escalation_type).toBe("HUMAN_REVIEW_REQUIRED");
    expect(created.severity).toBe("HIGH");
    expect(created.description).toBe("needs a human eye");
    expect(created.resolved_by_entity_id).toBeNull();
    expect(created.resolved_at).toBeNull();
  });

  it("stores the optional resolver at create time", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "POLICY_CONFLICT",
      severity: "MEDIUM",
      description: "policy clash",
      resolver_entity_id: resolverId,
    });
    expect(created.resolved_by_entity_id).toBe(resolverId);
    expect(created.status).toBe("PENDING");
  });

  it("writes the ESCALATION_CREATED audit event inside the same transaction", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "THRESHOLD_BREACH",
      severity: "CRITICAL",
      description: "threshold tripped",
    });
    const audit = await findEscalationAudit(created.escalation_id);
    expect(audit).toBeDefined();
    expect(audit!.event_type).toBe("ADMIN_ACTION");
    expect(audit!.actor_entity_id).toBe(sourceId);
    expect(audit!.details.action).toBe("ESCALATION_CREATED");
    expect(audit!.details.escalation_type).toBe("THRESHOLD_BREACH");
    expect(audit!.details.severity).toBe("CRITICAL");
  });

  it("rejects a non-existent target_entity_id (FK invariant -- nothing is persisted)", async () => {
    await expect(
      createEscalationForCaller(sourceId, {
        target_entity_id: "00000000-0000-0000-0000-000000000000",
        escalation_type: "AUTHORIZATION_FAILURE",
        severity: "LOW",
        description: "bad target",
      }),
    ).rejects.toThrow();
    const orphan = await prisma.escalationRequest.findMany({
      where: { source_entity_id: sourceId },
    });
    expect(orphan).toHaveLength(0);
  });
});

describe("createGateEscalationForCaller", () => {
  it("creates a COMPLIANCE_GATE escalation on the first gate-fail (source=caller, target=owner, capsule set, severity HIGH, PENDING, no resolver)", async () => {
    const ownerId = await makeParty();
    const capsuleId = await makeCapsuleFor(ownerId);
    const created = await createGateEscalationForCaller(
      sourceId, // caller (the restricted-class requester)
      capsuleId,
      ownerId,
    );
    expect(created.source_entity_id).toBe(sourceId);
    expect(created.target_entity_id).toBe(ownerId);
    expect(created.capsule_id).toBe(capsuleId);
    expect(created.escalation_type).toBe("COMPLIANCE_GATE");
    expect(created.severity).toBe("HIGH");
    expect(created.status).toBe("PENDING");
    expect(created.resolved_by_entity_id).toBeNull();
    // ESCALATION_CREATED audit event fired on the create path.
    const audit = await findEscalationAudit(created.escalation_id);
    expect(audit).toBeDefined();
    expect(audit!.details.action).toBe("ESCALATION_CREATED");
  });

  it("get-or-create dedups: a second gate-fail with the same (source, capsule) returns the same row and writes no second audit event", async () => {
    const ownerId = await makeParty();
    const capsuleId = await makeCapsuleFor(ownerId);
    const first = await createGateEscalationForCaller(sourceId, capsuleId, ownerId);
    const second = await createGateEscalationForCaller(sourceId, capsuleId, ownerId);
    expect(second.escalation_id).toBe(first.escalation_id);
    const rows = await prisma.escalationRequest.findMany({
      where: { source_entity_id: sourceId, capsule_id: capsuleId },
    });
    expect(rows).toHaveLength(1);
    const auditCount = await prisma.auditEvent.count({
      where: {
        event_type: "ADMIN_ACTION",
        details: { path: ["escalation_id"], equals: first.escalation_id },
      },
    });
    expect(auditCount).toBe(1);
  });

  it("creates a fresh PENDING escalation after the prior one is resolved", async () => {
    const ownerId = await makeParty();
    const capsuleId = await makeCapsuleFor(ownerId);
    const first = await createGateEscalationForCaller(sourceId, capsuleId, ownerId);
    await approveEscalationForCaller(ownerId, first.escalation_id);
    const second = await createGateEscalationForCaller(sourceId, capsuleId, ownerId);
    expect(second.escalation_id).not.toBe(first.escalation_id);
    expect(second.status).toBe("PENDING");
  });
});

describe("getEscalationForCaller", () => {
  it("lets the source read the escalation", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "source reads",
    });
    const row = await getEscalationForCaller(sourceId, created.escalation_id);
    expect(row?.escalation_id).toBe(created.escalation_id);
  });

  it("lets the target read the escalation", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "target reads",
    });
    const row = await getEscalationForCaller(targetId, created.escalation_id);
    expect(row?.escalation_id).toBe(created.escalation_id);
  });

  it("lets the designated resolver read the escalation", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "resolver reads",
      resolver_entity_id: resolverId,
    });
    const row = await getEscalationForCaller(resolverId, created.escalation_id);
    expect(row?.escalation_id).toBe(created.escalation_id);
  });

  it("throws ESCALATION_FORBIDDEN for a non-party caller", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "outsider blocked",
    });
    const outsider = await makeParty();
    await expect(
      getEscalationForCaller(outsider, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_FORBIDDEN/);
  });

  it("returns null for a non-existent escalation_id", async () => {
    const row = await getEscalationForCaller(
      sourceId,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(row).toBeNull();
  });
});

describe("listEscalationsPendingForCaller", () => {
  it("returns the caller's pending escalations as full 13-field rows when caller == target", async () => {
    await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "row one",
    });
    const rows = await listEscalationsPendingForCaller(targetId, targetId, 10);
    expect(rows).toHaveLength(1);
    // Full record -- the consumer (priming.ts) does the projection, not the service.
    expect(rows[0]!).toHaveProperty("escalation_id");
    expect(rows[0]!).toHaveProperty("escalation_type");
    expect(rows[0]!).toHaveProperty("created_at");
    expect(rows[0]!.status).toBe("PENDING");
  });

  it("throws ESCALATION_FORBIDDEN when caller != target", async () => {
    await expect(
      listEscalationsPendingForCaller(sourceId, targetId, 10),
    ).rejects.toThrow(/ESCALATION_FORBIDDEN/);
  });

  it("honors the take limit", async () => {
    for (let i = 0; i < 3; i += 1) {
      await createEscalationForCaller(sourceId, {
        target_entity_id: targetId,
        escalation_type: "HUMAN_REVIEW_REQUIRED",
        severity: "MEDIUM",
        description: `limit-${i}`,
      });
    }
    const rows = await listEscalationsPendingForCaller(targetId, targetId, 2);
    expect(rows).toHaveLength(2);
  });

  it("returns only PENDING rows (APPROVED / REJECTED / EXPIRED excluded)", async () => {
    const a = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "to-approve",
    });
    const r = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "to-reject",
    });
    const e = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "to-expire",
    });
    await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "stays-pending",
    });
    await approveEscalationForCaller(targetId, a.escalation_id);
    await rejectEscalationForCaller(targetId, r.escalation_id);
    await expireEscalation(e.escalation_id);
    const rows = await listEscalationsPendingForCaller(targetId, targetId, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe("stays-pending");
  });

  it("orders newest-first by created_at", async () => {
    const first = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "LOW",
      description: "older",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "LOW",
      description: "newer",
    });
    const rows = await listEscalationsPendingForCaller(targetId, targetId, 10);
    expect(rows.map((x) => x.escalation_id)).toEqual([
      second.escalation_id,
      first.escalation_id,
    ]);
  });
});

describe("countEscalationsPending", () => {
  it("counts pending escalations with no auth gate (plain helper -- route-tier auth is canonical)", async () => {
    await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "COMPLIANCE_GATE",
      severity: "HIGH",
      description: "count-1",
    });
    await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "COMPLIANCE_GATE",
      severity: "HIGH",
      description: "count-2",
    });
    // Called directly with the target id -- no caller fixture, by design.
    const n = await countEscalationsPending(targetId);
    expect(n).toBe(2);
  });

  it("counts only PENDING (terminal-status rows excluded)", async () => {
    const a = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "count-approve",
    });
    await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "count-pending",
    });
    await approveEscalationForCaller(targetId, a.escalation_id);
    expect(await countEscalationsPending(targetId)).toBe(1);
  });

  it("scopes the count to the requested target", async () => {
    const otherTarget = await makeParty();
    await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "for-target",
    });
    await createEscalationForCaller(sourceId, {
      target_entity_id: otherTarget,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "for-other-1",
    });
    await createEscalationForCaller(sourceId, {
      target_entity_id: otherTarget,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "for-other-2",
    });
    expect(await countEscalationsPending(targetId)).toBe(1);
    expect(await countEscalationsPending(otherTarget)).toBe(2);
  });
});

describe("approveEscalationForCaller", () => {
  it("lets the target approve: status -> APPROVED, resolved_at set, resolution_metadata stored", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "approve-me",
    });
    const updated = await approveEscalationForCaller(
      targetId,
      created.escalation_id,
      { reviewed_by: "manager" },
    );
    expect(updated.status).toBe("APPROVED");
    expect(updated.resolved_at).not.toBeNull();
    expect(updated.resolved_by_entity_id).toBe(targetId);
    expect(updated.resolution_metadata).toEqual({ reviewed_by: "manager" });
  });

  it("lets the designated resolver approve", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "resolver-approves",
      resolver_entity_id: resolverId,
    });
    const updated = await approveEscalationForCaller(
      resolverId,
      created.escalation_id,
    );
    expect(updated.status).toBe("APPROVED");
    expect(updated.resolved_by_entity_id).toBe(resolverId);
  });

  it("forbids the source from self-approving", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "no-self-approve",
    });
    await expect(
      approveEscalationForCaller(sourceId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_FORBIDDEN/);
  });

  // GOVSEC.5 GAP-C1: the dual-control sub-phase E placeholder creates a SELF-TARGET
  // escalation (target_entity_id === source_entity_id). Without the source-guard,
  // caller === target would let the source self-resolve a hollow dual-control. The
  // self-approval guard must forbid the source even when source === target.
  it("forbids the source from self-approving a SELF-TARGET dual-control escalation (GAP-C1)", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: sourceId, // self-target placeholder shape (source === target)
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: "no-self-approve-self-target",
    });
    expect(created.source_entity_id).toBe(sourceId);
    expect(created.target_entity_id).toBe(sourceId);
    await expect(
      approveEscalationForCaller(sourceId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_FORBIDDEN/);
  });

  it("throws ESCALATION_INVALID_TRANSITION when approving an already-APPROVED row", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "double-approve",
    });
    await approveEscalationForCaller(targetId, created.escalation_id);
    await expect(
      approveEscalationForCaller(targetId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_INVALID_TRANSITION/);
  });

  it("throws ESCALATION_INVALID_TRANSITION when approving a REJECTED row", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "reject-then-approve",
    });
    await rejectEscalationForCaller(targetId, created.escalation_id);
    await expect(
      approveEscalationForCaller(targetId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_INVALID_TRANSITION/);
  });

  it("throws ESCALATION_INVALID_TRANSITION when approving an EXPIRED row", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "expire-then-approve",
    });
    await expireEscalation(created.escalation_id);
    await expect(
      approveEscalationForCaller(targetId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_INVALID_TRANSITION/);
  });

  it("writes the ESCALATION_APPROVED audit event before returning", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "approve-audit",
    });
    await approveEscalationForCaller(targetId, created.escalation_id);
    const audit = await findEscalationAudit(created.escalation_id);
    expect(audit).toBeDefined();
    expect(audit!.event_type).toBe("ADMIN_ACTION");
    expect(audit!.actor_entity_id).toBe(targetId);
    expect(audit!.details.action).toBe("ESCALATION_APPROVED");
    expect(audit!.details.previous_status).toBe("PENDING");
    expect(audit!.details.new_status).toBe("APPROVED");
  });
});

describe("rejectEscalationForCaller", () => {
  it("lets the target reject: status -> REJECTED, resolved_at set", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "reject-me",
    });
    const updated = await rejectEscalationForCaller(
      targetId,
      created.escalation_id,
    );
    expect(updated.status).toBe("REJECTED");
    expect(updated.resolved_at).not.toBeNull();
    expect(updated.resolved_by_entity_id).toBe(targetId);
  });

  it("forbids the source from self-rejecting", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "no-self-reject",
    });
    await expect(
      rejectEscalationForCaller(sourceId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_FORBIDDEN/);
  });

  // GOVSEC.5 GAP-C1: the source-guard also forbids self-rejecting a SELF-TARGET
  // (dual-control placeholder) escalation, where source === target.
  it("forbids the source from self-rejecting a SELF-TARGET dual-control escalation (GAP-C1)", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: sourceId, // self-target placeholder shape (source === target)
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: "no-self-reject-self-target",
    });
    await expect(
      rejectEscalationForCaller(sourceId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_FORBIDDEN/);
  });

  it("throws ESCALATION_INVALID_TRANSITION when rejecting a terminal-state row", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "approve-then-reject",
    });
    await approveEscalationForCaller(targetId, created.escalation_id);
    await expect(
      rejectEscalationForCaller(targetId, created.escalation_id),
    ).rejects.toThrow(/ESCALATION_INVALID_TRANSITION/);
  });

  it("writes the ESCALATION_REJECTED audit event before returning", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "reject-audit",
    });
    await rejectEscalationForCaller(targetId, created.escalation_id);
    const audit = await findEscalationAudit(created.escalation_id);
    expect(audit).toBeDefined();
    expect(audit!.details.action).toBe("ESCALATION_REJECTED");
    expect(audit!.details.new_status).toBe("REJECTED");
  });
});

describe("expireEscalation", () => {
  it("transitions a PENDING escalation to EXPIRED with no caller (system function)", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "expire-me",
      expires_at: new Date(Date.now() - 1000),
    });
    const updated = await expireEscalation(created.escalation_id);
    expect(updated.status).toBe("EXPIRED");
    expect(updated.resolved_at).not.toBeNull();
  });

  it("throws ESCALATION_INVALID_TRANSITION when expiring an APPROVED row", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "approved-not-expirable",
    });
    await approveEscalationForCaller(targetId, created.escalation_id);
    await expect(expireEscalation(created.escalation_id)).rejects.toThrow(
      /ESCALATION_INVALID_TRANSITION/,
    );
  });

  it("throws ESCALATION_INVALID_TRANSITION when expiring an already-EXPIRED row", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "double-expire",
    });
    await expireEscalation(created.escalation_id);
    await expect(expireEscalation(created.escalation_id)).rejects.toThrow(
      /ESCALATION_INVALID_TRANSITION/,
    );
  });

  it("throws ESCALATION_NOT_FOUND for a non-existent escalation_id", async () => {
    await expect(
      expireEscalation("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(/ESCALATION_NOT_FOUND/);
  });

  it("writes the ESCALATION_EXPIRED audit event with a null actor and the SCHEDULER system principal", async () => {
    const created = await createEscalationForCaller(sourceId, {
      target_entity_id: targetId,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      severity: "HIGH",
      description: "expire-audit",
    });
    await expireEscalation(created.escalation_id);
    const audit = await findEscalationAudit(created.escalation_id);
    expect(audit).toBeDefined();
    expect(audit!.event_type).toBe("ADMIN_ACTION");
    expect(audit!.actor_entity_id).toBeNull();
    expect(audit!.details.system_principal).toBe(SYSTEM_PRINCIPALS.SCHEDULER);
    expect(audit!.details.action).toBe("ESCALATION_EXPIRED");
    expect(audit!.details.new_status).toBe("EXPIRED");
  });
});

// ── [PROD-UX-APPROVAL-LOOP] safeApproverReason (pure) ────────────────────────
describe("safeApproverReason — the approver's human reason as a safe bounded scalar", () => {
  it("extracts a trimmed reason from resolution_metadata", () => {
    expect(safeApproverReason({ reason: "  Not appropriate — rework it.  " })).toBe(
      "Not appropriate — rework it.",
    );
  });

  it("returns null for missing/blank/non-string/non-object shapes (never invents a reason)", () => {
    expect(safeApproverReason(undefined)).toBeNull();
    expect(safeApproverReason({})).toBeNull();
    expect(safeApproverReason({ reason: "   " })).toBeNull();
    expect(safeApproverReason({ reason: 42 })).toBeNull();
    expect(safeApproverReason("just a string")).toBeNull();
    expect(safeApproverReason(["reason"])).toBeNull();
  });

  it("clamps an unbounded reason to 500 chars (audit details stay bounded)", () => {
    const out = safeApproverReason({ reason: "x".repeat(2000) });
    expect(out?.length).toBe(500);
  });
});
