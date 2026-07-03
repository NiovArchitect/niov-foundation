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
import { requestClarificationForCaller } from "../../apps/api/src/services/work-os/clarification-request.service.js";
import {
  approveEscalationForCaller,
  listEscalationsPendingForCaller,
} from "../../apps/api/src/services/governance/escalation.service.js";
import { makeNotificationService } from "../../apps/api/src/services/notification/notification.service.js";
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

  // ── [CE-1.5] row target/recipient as a clarifier — durable row data only ──
  it("[CE-1.5] the row's target ranks after requester with plain recipient copy; never duplicated over a stronger role", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "U0EXTERNAL", ts: "1751500000.700007",
    });
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: ledgerId },
      data: { target_entity_id: eveId },
    });
    const r = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: davidId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const target = r.clarity.candidates.find((c) => c.role === "target");
    expect(target?.entity_id).toBe(eveId);
    expect(target?.reason).toBe("This work is addressed to them.");
    // Ranked after the requester (stronger roles first).
    const roles = r.clarity.candidates.map((c) => c.role);
    expect(roles.indexOf("target")).toBeGreaterThan(roles.indexOf("requester"));

    // When the target IS the owner, the stronger role wins — no duplicate.
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: ledgerId },
      data: { target_entity_id: davidId },
    });
    const asCaller = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: callerId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(asCaller.ok).toBe(true);
    if (!asCaller.ok) return;
    const davidRoles = asCaller.clarity.candidates.filter((c) => c.entity_id === davidId);
    expect(davidRoles.length).toBe(1);
    expect(davidRoles[0]!.role).toBe("owner");
  });

  it("[CE-1.5] a FOLLOW_UP's target reads as the recipient", async () => {
    const ledgerId = await ingestAndFindRow({
      callerId, orgId, davidId, authorName: "U0EXTERNAL", ts: "1751500000.800008",
    });
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: ledgerId },
      data: { ledger_type: "FOLLOW_UP", target_entity_id: eveId },
    });
    const r = await rankClarifiers({
      org_entity_id: orgId, caller_entity_id: davidId,
      ledger_entry_id: ledgerId, is_manager: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const target = r.clarity.candidates.find((c) => c.role === "target");
    expect(target?.reason).toBe("They are the recipient of this follow-up.");
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

  // ── [CE-2] governed clarification request — the durable object ──────────
  describe("[CE-2] requestClarificationForCaller", () => {
    async function setupWithTarget(ts: string): Promise<string> {
      const ledgerId = await ingestAndFindRow({
        callerId, orgId, davidId, authorName: "U0EXTERNAL", ts,
      });
      await prisma.workLedgerEntry.update({
        where: { ledger_entry_id: ledgerId },
        data: { target_entity_id: eveId },
      });
      return ledgerId;
    }
    const notificationService = makeNotificationService({});

    it("creates a HUMAN_REVIEW_REQUIRED escalation to a LATERAL clarifier — audited, linked, pointed, duplicate-safe", async () => {
      const ledgerId = await setupWithTarget("1751500001.100001");
      const escBefore = await prisma.escalationRequest.count();
      const notifBefore = await prisma.notification.count();

      // David (owner) asks Eve (the row's target — lateral, NOT a manager).
      const r = await requestClarificationForCaller({
        org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
        ledger_entry_id: ledgerId, clarifier_entity_id: eveId,
        notificationService,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.already_requested).toBe(false);
      expect(r.status).toBe("PENDING");
      expect(r.pointer_delivered).toBe(true);

      const esc = await prisma.escalationRequest.findUnique({
        where: { escalation_id: r.escalation_id },
      });
      expect(esc!.escalation_type).toBe("HUMAN_REVIEW_REQUIRED");
      expect(esc!.source_entity_id).toBe(davidId);
      expect(esc!.target_entity_id).toBe(eveId);
      expect(esc!.description).toContain("Clarification requested");
      expect(esc!.expires_at).not.toBeNull();
      const meta = esc!.resolution_metadata as Record<string, unknown>;
      expect(meta.kind).toBe("clarification");
      expect(meta.ledger_entry_id).toBe(ledgerId);

      // Audit exists (ESCALATION_CREATED from the create tx).
      const audits = await prisma.auditEvent.findMany({
        where: { actor_entity_id: davidId },
        orderBy: { timestamp: "desc" },
        take: 5,
      });
      const created = audits.find(
        (a) => (a.details as Record<string, unknown>)?.escalation_id === r.escalation_id,
      );
      expect(created).toBeDefined();

      // The pointer landed in the clarifier's inbox — exactly one.
      expect(await prisma.notification.count()).toBe(notifBefore + 1);

      // The clarifier's Review Center pending queue gained EXACTLY 1.
      const evePending = await listEscalationsPendingForCaller(eveId, eveId, 50);
      expect(evePending.some((e) => e.escalation_id === r.escalation_id)).toBe(true);

      // Duplicate request → idempotent, same escalation, no second row.
      const dup = await requestClarificationForCaller({
        org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
        ledger_entry_id: ledgerId, clarifier_entity_id: eveId,
        notificationService,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) {
        expect(dup.already_requested).toBe(true);
        expect(dup.escalation_id).toBe(r.escalation_id);
      }
      expect(await prisma.escalationRequest.count()).toBe(escBefore + 1);

      // The asker sees the pending state on the clarity projection.
      const ranked = await rankClarifiers({
        org_entity_id: orgId, caller_entity_id: davidId,
        ledger_entry_id: ledgerId, is_manager: false,
      });
      expect(ranked.ok).toBe(true);
      if (ranked.ok) {
        expect(ranked.clarity.pending_clarification?.escalation_id).toBe(r.escalation_id);
        expect(ranked.clarity.pending_clarification?.status).toBe("PENDING");
        expect(ranked.clarity.pending_clarification?.clarifier_entity_id).toBe(eveId);
      }
    });

    it("refuses a non-candidate, the caller themself, and a cross-org row", async () => {
      const ledgerId = await setupWithTarget("1751500001.200002");
      // A member who is NOT a candidate for this row.
      const frankId = await makeEntity("Frank Random", "PERSON");
      await prisma.entityMembership.create({
        data: { parent_id: orgId, child_id: frankId, is_active: true },
      });
      const notCandidate = await requestClarificationForCaller({
        org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
        ledger_entry_id: ledgerId, clarifier_entity_id: frankId,
        notificationService,
      });
      expect(notCandidate.ok).toBe(false);
      if (!notCandidate.ok) expect(notCandidate.code).toBe("NOT_A_CANDIDATE");

      // Self-clarifier impossible (the caller is never a candidate).
      const self = await requestClarificationForCaller({
        org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
        ledger_entry_id: ledgerId, clarifier_entity_id: davidId,
        notificationService,
      });
      expect(self.ok).toBe(false);

      // Cross-org caller cannot even see the row.
      const otherOrg = await makeEntity("Other CE2 Org", "COMPANY");
      const otherCaller = await makeEntity("Other CE2 Caller", "PERSON");
      await prisma.entityMembership.create({
        data: { parent_id: otherOrg, child_id: otherCaller, is_active: true },
      });
      const crossOrg = await requestClarificationForCaller({
        org_entity_id: otherOrg, caller_entity_id: otherCaller, is_manager: true,
        ledger_entry_id: ledgerId, clarifier_entity_id: eveId,
        notificationService,
      });
      expect(crossOrg.ok).toBe(false);
      if (!crossOrg.ok) expect(crossOrg.code).toBe("NOT_FOUND");
    });

    it("resolution flows back: clarifier resolves (source cannot), linkage survives the merge, asker sees the outcome", async () => {
      const ledgerId = await setupWithTarget("1751500001.300003");
      const r = await requestClarificationForCaller({
        org_entity_id: orgId, caller_entity_id: davidId, is_manager: false,
        ledger_entry_id: ledgerId, clarifier_entity_id: eveId,
        notificationService,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      // The asker (source) can NEVER resolve their own clarification.
      await expect(
        approveEscalationForCaller(davidId, r.escalation_id, { note: "self" }),
      ).rejects.toThrow("ESCALATION_FORBIDDEN");

      // The clarifier resolves with an answer; create-time linkage SURVIVES.
      const resolved = await approveEscalationForCaller(eveId, r.escalation_id, {
        answer: "It is assigned to you because you own repo access.",
      });
      expect(resolved.status).toBe("APPROVED");
      const meta = resolved.resolution_metadata as Record<string, unknown>;
      expect(meta.ledger_entry_id).toBe(ledgerId); // merge, not replace
      expect(meta.answer).toContain("repo access");

      // The asker's clarity projection now shows the resolved state.
      const ranked = await rankClarifiers({
        org_entity_id: orgId, caller_entity_id: davidId,
        ledger_entry_id: ledgerId, is_manager: false,
      });
      expect(ranked.ok).toBe(true);
      if (ranked.ok) {
        expect(ranked.clarity.pending_clarification?.status).toBe("APPROVED");
      }
    });
  });
});
