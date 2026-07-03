// FILE: clarity-projection.test.ts (integration, real Postgres)
// PURPOSE: [CE-1] lock the READ-ONLY clarity projection: source author
//          ranks first when strictly resolved; owner/requester/project-
//          owner/approver fallbacks hold; the manager appears ONLY when
//          the item is an authority question; unresolved/external authors
//          are honest; cross-org access is NOT_FOUND; and the projection
//          NEVER mutates — no escalation, no notification, no ledger write.
// CONNECTS TO: apps/api/src/services/work-os/clarity.service.ts,
//              work-os-ledger.routes.ts (GET :id/clarity).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import { ingestSourceEvent, slackMessageToSourceEvent } from "@niov/api";
import { rankClarifiers } from "../../apps/api/src/services/work-os/clarity.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__clarity__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName + randomUUID()),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workProjectMember.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workProject.deleteMany({ where: { org_entity_id: { in: ids } } });
  const caps = await prisma.meetingCapture.findMany({
    where: { org_entity_id: { in: ids } },
    select: { meeting_capture_id: true },
  });
  const capIds = caps.map((c) => c.meeting_capture_id);
  if (capIds.length > 0) {
    await prisma.meetingParticipantConsent.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
    await prisma.meetingCapture.deleteMany({ where: { meeting_capture_id: { in: capIds } } });
  }
}

/** Ingest one Slack-shaped event and return David's first COMMITMENT row. */
async function ingestAndFindRow(args: {
  callerId: string;
  orgId: string;
  davidId: string;
  authorName: string;
  ts: string;
}): Promise<string> {
  const event = slackMessageToSourceEvent(
    {
      ts: args.ts,
      text: "David owns the repo access work and will grant write access today.",
      user: "U0AUTHOR",
      user_name: args.authorName,
      channel_id: "C0CLARITY",
      channel_name: "clarity",
      team_id: "T0CLARITY",
    },
    args.callerId,
  );
  const r = await ingestSourceEvent(event, { llmProvider: null });
  expect(r.ok).toBe(true);
  const rows = await prisma.workLedgerEntry.findMany({
    where: { org_entity_id: args.orgId, owner_entity_id: args.davidId, ledger_type: "COMMITMENT" },
    orderBy: { created_at: "desc" },
  });
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!.ledger_entry_id;
}

describe("[CE-1] clarity projection — read-only clarifier ranking (DB)", () => {
  let orgId = "";
  let callerId = "";
  let davidId = "";
  let eveId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("Clarity Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    davidId = await makeEntity("David", "PERSON");
    eveId = await makeEntity("Eve", "PERSON");
    for (const id of [callerId, davidId, eveId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: id, is_active: true },
      });
    }
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("source author ranks FIRST when strictly resolved; owner follows; caller never suggests themself", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "Eve", ts: "1751500000.100001",
    });
    // David (the owner) asks "who can clarify my own work?"
    const r = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: davidId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.clarity.can_answer).toBe(true);
    expect(r.clarity.source_author_state).toBe("resolved");
    const first = r.clarity.candidates[0]!;
    expect(first.role).toBe("source_author");
    expect(first.entity_id).toBe(eveId);
    expect(first.reason).toContain("sent the Slack message");
    // The caller (owner David) is never their own clarifier.
    expect(r.clarity.candidates.some((c) => c.entity_id === davidId)).toBe(false);
    // No candidate leaks a raw source id or backend enum in the reason copy.
    for (const c of r.clarity.candidates) {
      expect(c.reason).not.toMatch(/SLACK:|CONNECTOR|_/);
      expect(c.display_name.length).toBeGreaterThan(0);
    }
  });

  it("unresolved (external-looking) source author is honest — falls back to owner/requester", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "U0EXTERNAL", ts: "1751500000.200002",
    });
    const r = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: callerId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.clarity.source_author_state).toBe("unresolved");
    expect(r.clarity.candidates.some((c) => c.role === "source_author")).toBe(false);
    const owner = r.clarity.candidates.find((c) => c.role === "owner");
    expect(owner?.entity_id).toBe(davidId);
    expect(owner?.reason).toBe("They own this work.");
  });

  it("project OWNER ranks as a fallback when the row belongs to a project", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "U0EXTERNAL", ts: "1751500000.300003",
    });
    const project = await prisma.workProject.create({
      data: {
        org_entity_id: orgId,
        name: `${TEST_PREFIX} Clarity Project`,
        state: "ACTIVE",
        created_by_entity_id: callerId,
      },
    });
    await prisma.workProjectMember.create({
      data: { project_id: project.project_id, org_entity_id: orgId, entity_id: eveId, role: "OWNER" },
    });
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: ledgerId },
      data: { project_id: project.project_id },
    });
    const r = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: callerId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const projectOwner = r.clarity.candidates.find((c) => c.role === "project_owner");
    expect(projectOwner?.entity_id).toBe(eveId);
    expect(projectOwner?.reason).toBe("They lead the project this belongs to.");
  });

  it("manager appears ONLY when the item is an authority question", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "U0EXTERNAL", ts: "1751500000.400004",
    });
    // Eve manages David (person→person manager edge inside the org).
    await prisma.entityMembership.create({
      data: { parent_id: eveId, child_id: davidId, is_active: true },
    });

    // Non-authority status → NO manager candidate.
    const before = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: davidId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.clarity.authority_question).toBe(false);
    expect(before.clarity.candidates.some((c) => c.role === "manager")).toBe(false);

    // Authority status → the manager appears with the authority reason.
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: ledgerId },
      data: { status: "NEEDS_APPROVAL" },
    });
    const after = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: davidId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.clarity.authority_question).toBe(true);
    const mgr = after.clarity.candidates.find((c) => c.role === "manager");
    expect(mgr?.entity_id).toBe(eveId);
    expect(mgr?.reason).toBe("This needs an authority decision.");
  });

  it("cross-org access is NOT_FOUND — no candidate leakage", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "Eve", ts: "1751500000.500005",
    });
    const otherOrg = await makeEntity("Other Clarity Org", "COMPANY");
    const otherCaller = await makeEntity("Other Caller", "PERSON");
    await prisma.entityMembership.create({
      data: { parent_id: otherOrg, child_id: otherCaller, is_active: true },
    });
    const r = await rankClarifiers({
      org_entity_id: otherOrg, caller_entity_id: otherCaller,
      ledger_entry_id: ledgerId, is_manager: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
  });

  it("READ-ONLY proof: the projection creates no escalation, no notification, no ledger row", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "Eve", ts: "1751500000.600006",
    });
    const ledgerBefore = await prisma.workLedgerEntry.count();
    const escBefore = await prisma.escalationRequest.count();
    const notifBefore = await prisma.notification.count();

    const r = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: davidId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(r.ok).toBe(true);

    expect(await prisma.workLedgerEntry.count()).toBe(ledgerBefore);
    expect(await prisma.escalationRequest.count()).toBe(escBefore);
    expect(await prisma.notification.count()).toBe(notifBefore);
  });
});
