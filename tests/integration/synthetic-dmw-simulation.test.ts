// FILE: synthetic-dmw-simulation.test.ts (integration)
// PURPOSE: PERS.5b lifelike multi-DMW simulation (ADR-0048 Phase 3 Sub-Arc 3;
//          Q-PERS.5b). Seeds ONE living enterprise world (1 enterprise DMW +
//          project source-of-truth, 5 employees, 5 digital twins) and drives
//          the REAL governed working-set spine (real login → session →
//          prismaWalletContextLookup → createSessionContextResolver →
//          buildPersonalizedWorkingSet) to prove the 8 governance
//          obligations across ~10 scenarios S1–S10. Single-wallet working set
//          is the spine (coe.service.ts untouched); cross-wallet access is
//          proven via the NEGOTIATE permission path.
// CONNECTS TO: ./helpers/synthetic-dmw-world.js (world-builder + service stack)
//              + @niov/api (projectConsumerView/projectAdminView) + ../helpers.js.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { projectAdminView, projectConsumerView } from "@niov/api";
import { cleanupTestData, ensureAuditTriggers } from "../helpers.js";
import {
  buildServiceStack,
  buildSyntheticWorld,
  type ServiceStack,
  type SyntheticWorld,
} from "./helpers/synthetic-dmw-world.js";

const NOW = new Date("2026-05-20T15:00:00.000Z");
const BUDGET = 4000;

let stack: ServiceStack;
let world: SyntheticWorld;

// Build a working set for a principal token; requested_context can be tuned.
async function workingSet(token: string, requested: string[] = ["entity_id", "display_name"]) {
  return stack.workingSet.buildPersonalizedWorkingSet(token, {
    request_text: "my routine work style communication and the project",
    token_budget: BUDGET,
    requested_context: requested,
    now: NOW,
  });
}

function capsuleIds(ws: { capsules: readonly { capsule_id: string }[] }): string[] {
  return ws.capsules.map((c) => c.capsule_id);
}

// Cross-cutting: no raw retrieval internals ever leak into a response.
function assertNoRawInternals(obj: unknown): void {
  const s = JSON.stringify(obj);
  expect(s).not.toContain("embedding");
  expect(s).not.toContain("vector");
  expect(s).not.toContain("distance");
  expect(s).not.toContain("cosine");
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  stack = buildServiceStack();
  world = await buildSyntheticWorld(stack);
}, 300_000);

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("PERS.5b — obligations 1 & 2: no cross-DMW leakage (single-wallet spine)", () => {
  it("S1: an employee working set returns only that employee's own personal DMW", async () => {
    const out = await workingSet(world.employees["priya"]!.token);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.capsules.length).toBeGreaterThan(0);
    assertNoRawInternals(out);
  });

  it("S2: cross-wallet/cross-context — employee set never contains enterprise or other-wallet capsules", async () => {
    const out = await workingSet(world.employees["priya"]!.token);
    if (!out.ok) throw new Error("unreachable");
    const ids = capsuleIds(out);
    for (const entId of [
      world.enterprise.goal_capsule_id,
      world.enterprise.accepted_decision_id,
      world.enterprise.sensitive_capsule_id,
      world.enterprise.goal_summary_source_id,
    ]) {
      expect(ids).not.toContain(entId);
    }
    expect(ids).not.toContain(world.employees["liang"]!.clearance_gated_capsule_id);
    assertNoRawInternals(out);
  });
});

describe("PERS.5b — obligations 3 & 5: twin portability + scoped alignment", () => {
  it("S5: a twin working set includes the authorized goal summary and NO sensitive enterprise content", async () => {
    const twin = world.twins["priya"]!;
    const out = await workingSet(twin.token);
    if (!out.ok) throw new Error("unreachable");
    const ids = capsuleIds(out);
    expect(ids).toContain(twin.alignment_summary_id);
    expect(ids).not.toContain(world.enterprise.sensitive_capsule_id);
    expect(ids).not.toContain(world.enterprise.goal_capsule_id);
    assertNoRawInternals(out);
  });
});

describe("PERS.5b — obligation 4: accepted agreements are enterprise source-of-truth", () => {
  it("S3: the enterprise (COMPANY) working set is the project source-of-truth; zero employee personal capsules", async () => {
    const out = await workingSet(world.enterprise.token, ["entity_id"]);
    if (!out.ok) throw new Error("unreachable");
    const ids = capsuleIds(out);
    expect(ids).toContain(world.enterprise.goal_capsule_id);
    // No employee personal capsule leaks into the enterprise DMW.
    expect(ids).not.toContain(world.employees["dana"]!.clearance_gated_capsule_id);
    expect(ids).not.toContain(world.unaccepted_conversation_id);
    assertNoRawInternals(out);
  });

  it("S4: accepted DECISION is present in enterprise SoT; the un-accepted conversation is NOT", async () => {
    const ent = await workingSet(world.enterprise.token, ["entity_id"]);
    if (!ent.ok) throw new Error("unreachable");
    const entIds = capsuleIds(ent);
    expect(entIds).toContain(world.enterprise.accepted_decision_id);
    expect(entIds).not.toContain(world.unaccepted_conversation_id);

    // The un-accepted conversation stayed in Priya's personal wallet (exists, not promoted).
    const priya = await workingSet(world.employees["priya"]!.token, ["entity_id"]);
    if (!priya.ok) throw new Error("unreachable");
    expect(capsuleIds(priya)).toContain(world.unaccepted_conversation_id);
  });
});

describe("PERS.5b — obligation 5 grant path + obligation 6 RBAC/ABAC (NEGOTIATE)", () => {
  it("S6: a SUMMARY-scope NEGOTIATE of the shareable goal summary succeeds; FULL is not granted", async () => {
    const emp = world.employees["sara"]!;
    const summary = await stack.negotiate.negotiate(
      emp.token,
      world.enterprise.goal_summary_source_id,
      "SUMMARY",
      { ip_address: null },
    );
    expect(summary.ok).toBe(true);
    if (summary.ok) expect(summary.granted_scope).toBe("SUMMARY");

    const full = await stack.negotiate.negotiate(
      emp.token,
      world.enterprise.goal_summary_source_id,
      "FULL",
      { ip_address: null },
    );
    // FULL is never granted on a SUMMARY-scoped permission (downgraded or denied).
    if (full.ok) expect(full.granted_scope).not.toBe("FULL");
  });

  it("S7: a twin NEGOTIATE of the sensitive COMPLIANCE_RECORD is DENIED", async () => {
    const twin = world.twins["sara"]!;
    const res = await stack.negotiate.negotiate(
      twin.token,
      world.enterprise.sensitive_capsule_id,
      "SUMMARY",
      { ip_address: null },
    );
    expect(res.ok).toBe(false);
  });

  it("S8: clearance filtering — high-clearance entity sees its gated capsule; lower-clearance does not", async () => {
    const dana = await workingSet(world.employees["dana"]!.token);
    const liang = await workingSet(world.employees["liang"]!.token);
    if (!dana.ok || !liang.ok) throw new Error("unreachable");
    // Dana (ceiling 6) sees her clearance-5 capsule; Liang (ceiling 4) does not see his.
    expect(capsuleIds(dana)).toContain(world.employees["dana"]!.clearance_gated_capsule_id);
    expect(capsuleIds(liang)).not.toContain(world.employees["liang"]!.clearance_gated_capsule_id);
  });

  it("S9: ABAC — Eng lead reaches eng-detail FULL; Designer does not", async () => {
    const liang = await stack.negotiate.negotiate(
      world.employees["liang"]!.token,
      world.enterprise.eng_detail_id,
      "FULL",
      { ip_address: null },
    );
    expect(liang.ok).toBe(true);
    if (liang.ok) expect(liang.granted_scope).toBe("FULL");

    const marco = await stack.negotiate.negotiate(
      world.employees["marco"]!.token,
      world.enterprise.eng_detail_id,
      "SUMMARY",
      { ip_address: null },
    );
    expect(marco.ok).toBe(false);
  });
});

describe("PERS.5b — obligations 7 & 8: consumer graceful view vs admin full truth", () => {
  it("S10: projectConsumerView strips raw diagnostics; projectAdminView preserves the full degraded contract", async () => {
    // Request a personal-only ungranted key (location) → withheld; employees have
    // no EntityProfile → timezone fallback → fallback_used. Both yield degraded entries.
    const out = await workingSet(world.employees["marco"]!.token, [
      "entity_id",
      "timezone",
      "location",
    ]);
    if (!out.ok) throw new Error("unreachable");

    const admin = projectAdminView(out);
    expect(admin.view).toBe("admin");
    expect(admin.degraded.length).toBeGreaterThan(0);
    expect(typeof admin.audit_intent).toBe("string");
    expect(admin.consumer_obligations.length).toBeGreaterThan(0);

    const consumer = projectConsumerView(out);
    expect(consumer.view).toBe("consumer");
    expect(consumer.has_uncertainty || consumer.has_withheld_context).toBe(true);
    const s = JSON.stringify(consumer);
    for (const forbidden of [
      "audit_intent",
      "consumer_obligations",
      "advisory",
      "disposition",
      "tokens_consumed",
      "needs_permission",
      "fallback_used",
      "low_confidence",
    ]) {
      expect(s).not.toContain(forbidden);
    }
    assertNoRawInternals(admin);
    assertNoRawInternals(consumer);
  });
});
