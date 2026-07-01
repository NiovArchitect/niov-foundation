// FILE: goal.test.ts (integration, real Postgres)
// PURPOSE: Slice D — the Goal layer. A goal is a GOAL-typed WorkLedger row (no new
//          table); work links via goal_id; progress is a DETERMINISTIC rollup of
//          the linked work's status. Proves create (personal/org), link/unlink,
//          progress %, scoped listing, authority (org goals need a manager),
//          no cross-tenant leak, and that GOAL rows never pollute My Work.
//          NO LLM (deterministic).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { createGoal, linkWorkToGoal, unlinkWorkFromGoal, getGoalProgress, listGoals } from "@niov/api";
import { createLedgerEntry, getMyWork } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__goal__";
const pk = (s: string): string => `-----BEGIN PUBLIC KEY-----\n${s}\n-----END PUBLIC KEY-----`;
async function makeEntity(name: string, type: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${name.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: pk(name), display_name: `${TEST_PREFIX} ${name}`, entity_type: type, clearance_level: 3, status: "ACTIVE",
  });
  return e.entity_id;
}
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({ where: { display_name: { startsWith: TEST_PREFIX } }, select: { entity_id: true } });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}
async function makeWork(orgId: string, ownerId: string, title: string, status: string): Promise<string> {
  const r = await createLedgerEntry({
    org_entity_id: orgId, ledger_type: "COMMITMENT", source_type: "MANUAL",
    owner_entity_id: ownerId, requester_entity_id: ownerId, title, status, extraction_source: "MANUAL",
  });
  if (!r.ok) throw new Error("makeWork failed");
  return r.entry.ledger_entry_id;
}

describe("goal layer — objectives, work↔goal, progress (DB)", () => {
  let orgId = "", callerId = "", eveId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Goal Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    eveId = await makeEntity("Eve Uninvolved", "PERSON");
    for (const id of [callerId, eveId]) {
      await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: id, is_active: true } });
    }
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("creates a goal, links work, and rolls up DETERMINISTIC progress", async () => {
    const g = await createGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, title: "Ship the launch demo", target: "Q3", description: "Launch readiness" });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.goal.scope).toBe("personal");
    expect(g.goal.status).toBe("GOAL_ACTIVE");
    expect(g.goal.target).toBe("Q3");

    // Two work items under the goal; one done, one still open.
    const w1 = await makeWork(orgId, callerId, "Repo access", "EXECUTED");
    const w2 = await makeWork(orgId, callerId, "Google sign-in", "PROPOSED");
    expect((await linkWorkToGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, ledger_entry_id: w1, goal_id: g.goal.goal_id })).ok).toBe(true);
    expect((await linkWorkToGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, ledger_entry_id: w2, goal_id: g.goal.goal_id })).ok).toBe(true);

    const p = await getGoalProgress({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, goal_id: g.goal.goal_id });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.linked_count).toBe(2);
    expect(p.done_count).toBe(1);
    expect(p.progress_pct).toBe(50); // 1 of 2 done

    // Unlink one → progress recomputes.
    await unlinkWorkFromGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, ledger_entry_id: w2 });
    const p2 = await getGoalProgress({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, goal_id: g.goal.goal_id });
    if (p2.ok) {
      expect(p2.linked_count).toBe(1);
      expect(p2.progress_pct).toBe(100); // the remaining linked item is done
    }
  });

  it("GOAL rows never appear as work in My Work", async () => {
    await createGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, title: "A personal objective" });
    const mine = await getMyWork({ org_entity_id: orgId, caller_entity_id: callerId });
    expect(mine.every((w) => w.ledger_type !== "GOAL")).toBe(true);
  });

  it("org goals require manager authority; personal listing is self-scoped", async () => {
    const denied = await createGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, title: "Org objective", scope: "org" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("NOT_PERMITTED");
    const orgGoal = await createGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: true, title: "Org objective", scope: "org" });
    expect(orgGoal.ok).toBe(true);
    if (orgGoal.ok) expect(orgGoal.goal.scope).toBe("org");

    // Caller's own goals (self scope) list only theirs; Eve sees none of them.
    await createGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, title: "Caller personal goal" });
    const eveList = await listGoals({ org_entity_id: orgId, caller_entity_id: eveId, is_manager: false, scope: "self" });
    expect(eveList.ok).toBe(true);
    if (eveList.ok) expect(eveList.goals.every((x) => x.title !== "Caller personal goal")).toBe(true);
  });

  it("no cross-tenant leak: another org cannot see or touch this org's goal", async () => {
    const g = await createGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, title: "Private objective" });
    if (!g.ok) return;
    const otherOrg = await makeEntity("Other Org", "COMPANY");
    const otherCaller = await makeEntity("Other Caller", "PERSON");
    await prisma.entityMembership.create({ data: { parent_id: otherOrg, child_id: otherCaller, is_active: true } });
    // The goal lives in orgId; querying it under another org must NOT find it.
    const p = await getGoalProgress({ org_entity_id: otherOrg, caller_entity_id: otherCaller, is_manager: true, goal_id: g.goal.goal_id });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe("GOAL_NOT_FOUND");
  });

  it("an uninvolved user cannot read a personal goal's progress", async () => {
    const g = await createGoal({ org_entity_id: orgId, caller_entity_id: callerId, is_manager: false, title: "Caller-only goal" });
    if (!g.ok) return;
    const p = await getGoalProgress({ org_entity_id: orgId, caller_entity_id: eveId, is_manager: false, goal_id: g.goal.goal_id });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe("NOT_PERMITTED");
  });
});
