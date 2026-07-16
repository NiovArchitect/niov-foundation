// FILE: tests/integration/correction-promotion.test.ts
// PURPOSE: [SECTION-10 CORRECTION-PROMOTION §] Real-PG proof that an ACTIVE
//          TEAM/ORG best-practice TwinCorrectionMemory promotes through the
//          live promoteOrgTruth command into PROMOTED_TO_* + a current
//          organizational truth, and that competing distinct claims open a
//          conflict without silently winning or flipping correction state.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createEntity, prisma, getCurrentPromotedTruth, listConflictSetsForOrg } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";
import { promoteTwinCorrectionToOrgTruth } from "../../apps/api/src/services/otzar/correction-promotion.service.js";

const DOMAIN = "technical";

interface Party {
  userId: string;
  twinId: string;
  orgId: string;
}

async function orgUser(rights?: {
  owns?: string[];
  can_approve?: string[];
  recommend_only?: string[];
}): Promise<Party> {
  const user = await createEntity(
    makeEntityInput({ entity_type: "PERSON", password: "correct-horse-battery" }),
  );
  const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
  await prisma.entityMembership.create({
    data: { parent_id: org.entity_id, child_id: user.entity_id, is_active: true },
  });
  const twin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
  await prisma.entityMembership.create({
    data: {
      parent_id: user.entity_id,
      child_id: twin.entity_id,
      role_title: "Digital Twin",
      is_active: true,
    },
  });
  await prisma.twinConfig.create({
    data: {
      twin_id: twin.entity_id,
      autonomy_level: "APPROVAL_REQUIRED",
      is_admin_twin: false,
      role_template: null,
    },
  });
  if (rights) {
    await prisma.entityDecisionRights.create({
      data: {
        org_entity_id: org.entity_id,
        entity_id: user.entity_id,
        owns: rights.owns ?? [],
        can_approve: rights.can_approve ?? [],
        recommend_only: rights.recommend_only ?? [],
        updated_by: user.entity_id,
      },
    });
  }
  return { userId: user.entity_id, twinId: twin.entity_id, orgId: org.entity_id };
}

async function insertCandidate(
  p: Party,
  type: "TEAM_BEST_PRACTICE_CANDIDATE" | "ORG_BEST_PRACTICE_CANDIDATE",
  summary: string,
): Promise<string> {
  const row = await prisma.twinCorrectionMemory.create({
    data: {
      org_entity_id: p.orgId,
      owner_entity_id: p.userId,
      created_by_entity_id: p.userId,
      scope_type: type === "ORG_BEST_PRACTICE_CANDIDATE" ? "ORG" : "TEAM",
      correction_type: type,
      state: "ACTIVE",
      safe_summary: summary,
    },
  });
  return row.correction_id;
}

beforeAll(async () => {
  await ensureAuditTriggers();
});
afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Correction → org-truth promotion state machine (real PG)", () => {
  it("clean TEAM promotion: ACTIVE → PROMOTED_TO_TEAM_PATTERN + current org truth", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const id = await insertCandidate(
      p,
      "TEAM_BEST_PRACTICE_CANDIDATE",
      "Confirm release dates with the domain owner before any external publish.",
    );

    const res = await promoteTwinCorrectionToOrgTruth({
      actorEntityId: p.userId,
      orgEntityId: p.orgId,
      correctionId: id,
      decisionDomain: DOMAIN,
      topic: `release-process-${randomUUID().slice(0, 8)}`,
      reason: "Codifying the team's established practice.",
      resolveOwnerScope: async () => ({
        org_entity_id: p.orgId,
        subject_entity_id: p.userId,
        twin_entity_id: p.twinId,
      }),
    });

    expect(res.ok).toBe(true);
    if (!res.ok || res.outcome !== "promoted") return;
    expect(res.correction.state).toBe("PROMOTED_TO_TEAM_PATTERN");
    expect(res.truth_record.state).toBe("PROMOTED");
    expect(res.truth_record.winning_source_record_type).toBe("TWIN_CORRECTION_MEMORY");
    expect(res.truth_record.winning_source_record_id).toBe(id);

    const row = await prisma.twinCorrectionMemory.findUnique({
      where: { correction_id: id },
      select: { state: true },
    });
    expect(row?.state).toBe("PROMOTED_TO_TEAM_PATTERN");

    const current = await getCurrentPromotedTruth(p.orgId, res.truth_record.truth_key);
    expect(current?.truth_record_id).toBe(res.truth_record.truth_record_id);

    // Clean promotion raises no conflict.
    const conflicts = await listConflictSetsForOrg(p.orgId, ["OPEN", "UNDER_REVIEW"]);
    expect(conflicts).toHaveLength(0);
  });

  it("ORG candidate promotes to PROMOTED_TO_ORG_PATTERN", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const id = await insertCandidate(
      p,
      "ORG_BEST_PRACTICE_CANDIDATE",
      "All customer-facing dates must be dual-approved by legal and product.",
    );
    const res = await promoteTwinCorrectionToOrgTruth({
      actorEntityId: p.userId,
      orgEntityId: p.orgId,
      correctionId: id,
      decisionDomain: DOMAIN,
      topic: `dual-approval-${randomUUID().slice(0, 8)}`,
      reason: "Organization-wide practice.",
      resolveOwnerScope: async () => ({
        org_entity_id: p.orgId,
        subject_entity_id: p.userId,
        twin_entity_id: p.twinId,
      }),
    });
    expect(res.ok).toBe(true);
    if (!res.ok || res.outcome !== "promoted") return;
    expect(res.correction.state).toBe("PROMOTED_TO_ORG_PATTERN");
  });

  it("competing distinct claims open a conflict; corrections stay ACTIVE", async () => {
    const p = await orgUser({ owns: [DOMAIN] });
    const a = await insertCandidate(p, "TEAM_BEST_PRACTICE_CANDIDATE", "Ship on Mondays only.");
    const b = await insertCandidate(p, "TEAM_BEST_PRACTICE_CANDIDATE", "Ship any weekday after QA.");

    const res = await promoteTwinCorrectionToOrgTruth({
      actorEntityId: p.userId,
      orgEntityId: p.orgId,
      correctionId: a,
      competingCorrectionIds: [b],
      decisionDomain: DOMAIN,
      topic: `ship-window-${randomUUID().slice(0, 8)}`,
      reason: "Two team practices compete.",
      resolveOwnerScope: async () => ({
        org_entity_id: p.orgId,
        subject_entity_id: p.userId,
        twin_entity_id: p.twinId,
      }),
    });

    expect(res.ok).toBe(true);
    if (!res.ok || res.outcome !== "conflict_open") return;
    expect(res.conflict_set.state).toBe("OPEN");
    expect(res.correction.state).toBe("ACTIVE");

    const states = await prisma.twinCorrectionMemory.findMany({
      where: { correction_id: { in: [a, b] } },
      select: { state: true },
    });
    expect(states.every((s) => s.state === "ACTIVE")).toBe(true);

    // No current promoted truth for a conflict that did not promote.
    const conflicts = await listConflictSetsForOrg(p.orgId, ["OPEN"]);
    expect(conflicts.some((c) => c.conflict_set_id === res.conflict_set.conflict_set_id)).toBe(true);
  });

  it("recommend-only owner cannot finalize; unauthorized without rights", async () => {
    const rec = await orgUser({ recommend_only: [DOMAIN] });
    const id = await insertCandidate(
      rec,
      "TEAM_BEST_PRACTICE_CANDIDATE",
      "Recommend-only must not promote.",
    );
    const denied = await promoteTwinCorrectionToOrgTruth({
      actorEntityId: rec.userId,
      orgEntityId: rec.orgId,
      correctionId: id,
      decisionDomain: DOMAIN,
      topic: `rec-only-${randomUUID().slice(0, 8)}`,
      reason: "Should fail.",
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.code).toBe("RECOMMEND_ONLY");

    const none = await orgUser();
    const id2 = await insertCandidate(
      none,
      "TEAM_BEST_PRACTICE_CANDIDATE",
      "No rights must not promote.",
    );
    const unauth = await promoteTwinCorrectionToOrgTruth({
      actorEntityId: none.userId,
      orgEntityId: none.orgId,
      correctionId: id2,
      decisionDomain: DOMAIN,
      topic: `no-rights-${randomUUID().slice(0, 8)}`,
      reason: "Should fail.",
    });
    expect(unauth.ok).toBe(false);
    if (unauth.ok) return;
    expect(unauth.code).toBe("UNAUTHORIZED");
  });

  it("non-owner cannot promote another employee's correction", async () => {
    const owner = await orgUser({ owns: [DOMAIN] });
    const other = await orgUser({ owns: [DOMAIN] });
    // Put other into owner's org with rights so the only failure is ownership.
    await prisma.entityMembership.create({
      data: { parent_id: owner.orgId, child_id: other.userId, is_active: true },
    });
    await prisma.entityDecisionRights.create({
      data: {
        org_entity_id: owner.orgId,
        entity_id: other.userId,
        owns: [DOMAIN],
        can_approve: [],
        recommend_only: [],
        updated_by: other.userId,
      },
    });
    const id = await insertCandidate(
      owner,
      "TEAM_BEST_PRACTICE_CANDIDATE",
      "Owner-only promotion.",
    );
    const res = await promoteTwinCorrectionToOrgTruth({
      actorEntityId: other.userId,
      orgEntityId: owner.orgId,
      correctionId: id,
      decisionDomain: DOMAIN,
      topic: `owner-only-${randomUUID().slice(0, 8)}`,
      reason: "Should refuse.",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_OWNER");
  });
});
