// FILE: collaboration-target-resolver.test.ts (integration)
// PURPOSE: Phase 1284 Wave 1 — prove the GENERAL governed target resolver
//          (resolveCollaborationTarget) resolves names + ids into governed
//          target objects, tenant-scoped, with the same answer for any
//          person (not a hardcoded David). Proves: exact name resolves;
//          ambiguity surfaces candidates; unknown is NOT_FOUND (never
//          fabricated); a UUID that is in-org resolves; a UUID not in-org is
//          NOT_FOUND (no cross-tenant leak); a malformed id is INVALID_ID
//          (never reaches a Prisma UUID column).
// CONNECTS TO: apps/api/src/services/collaboration/target-resolver.service.ts

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import {
  resolveCollaborationTarget,
  isUuid,
} from "../../apps/api/src/services/collaboration/target-resolver.service.js";

let ORG_ID: string;
let OTHER_ORG_ID: string;
let davidId: string;

async function addMember(orgId: string, displayName: string): Promise<string> {
  const input = makeEntityInput({ entity_type: "PERSON" });
  const ent = await createEntity({ ...input, display_name: displayName });
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: ent.entity_id, role_title: "MEMBER", is_active: true },
  });
  return ent.entity_id;
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
  const other = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org2_${randomUUID()}`,
    email: `${TEST_PREFIX}org2_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  OTHER_ORG_ID = other.entity_id;

  davidId = await addMember(ORG_ID, `${TEST_PREFIX}David Odie`);
  await addMember(ORG_ID, `${TEST_PREFIX}Samiksha Rao`);
  // Two "Sam" people to force ambiguity.
  await addMember(ORG_ID, `${TEST_PREFIX}Sam Carter`);
  await addMember(ORG_ID, `${TEST_PREFIX}Sam Patel`);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("isUuid guard", () => {
  it("accepts a real UUID and rejects names / malformed ids", () => {
    expect(isUuid(randomUUID())).toBe(true);
    expect(isUuid("David")).toBe(false);
    expect(isUuid("v1_local_draft_42")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("resolveCollaborationTarget (general, not hardcoded)", () => {
  it("resolves an exact unique person by name to a PERSON target", async () => {
    const r = await resolveCollaborationTarget(ORG_ID, "David");
    expect(r.kind).toBe("RESOLVED");
    expect(r.target_type).toBe("PERSON");
    expect(r.target_entity_id).toBe(davidId);
    expect(r.is_external).toBe(false);
  });

  it("resolves a different person (Samiksha) the same way — no special-casing", async () => {
    const r = await resolveCollaborationTarget(ORG_ID, "Samiksha");
    expect(r.kind).toBe("RESOLVED");
    expect(r.target_type).toBe("PERSON");
  });

  it("returns AMBIGUOUS with candidates for a name matching multiple people", async () => {
    const r = await resolveCollaborationTarget(ORG_ID, "Sam");
    expect(r.kind).toBe("AMBIGUOUS");
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("returns NOT_FOUND for an unknown person — never fabricates", async () => {
    const r = await resolveCollaborationTarget(ORG_ID, "Alex");
    expect(r.kind).toBe("NOT_FOUND");
    expect(r.target_entity_id).toBeNull();
  });

  it("resolves an in-org UUID to that member", async () => {
    const r = await resolveCollaborationTarget(ORG_ID, davidId);
    expect(r.kind).toBe("RESOLVED");
    expect(r.target_entity_id).toBe(davidId);
  });

  it("returns NOT_FOUND for a UUID that is not in this org (no cross-tenant leak)", async () => {
    const r = await resolveCollaborationTarget(OTHER_ORG_ID, davidId);
    expect(r.kind).toBe("NOT_FOUND");
    expect(r.target_entity_id).toBeNull();
  });

  it("returns INVALID_ID for a malformed id and never hits a UUID column", async () => {
    const r = await resolveCollaborationTarget(ORG_ID, "v1_local_draft_42");
    expect(r.kind).toBe("INVALID_ID");
  });

  it("returns EMPTY for blank input", async () => {
    const r = await resolveCollaborationTarget(ORG_ID, "   ");
    expect(r.kind).toBe("EMPTY");
  });
});
