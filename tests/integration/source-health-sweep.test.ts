// FILE: source-health-sweep.test.ts (integration, real Postgres)
// PURPOSE: [SOURCE-HEALTH-SWEEP] Lock the bounded re-verification sweep over
//          ALREADY-IMPORTED DOCUMENT_CONTEXT rows + its admin notifications:
//            - one same-hash doc  -> AVAILABLE, NO notification (no noise)
//            - one diff-hash doc  -> CHANGED_UPSTREAM, notified
//            - one NOT_FOUND doc  -> SOURCE_DELETED, notified
//            - one 403-family doc -> ACCESS_REVOKED, notified
//            - one transient doc  -> REVALIDATION_UNAVAILABLE: NO demotion,
//              NO notification, NO state change (a network blip is not health)
//          Asserts summary tallies, ONE SOURCE_HEALTH_CHANGED notification per
//          DEMOTED doc (none for AVAILABLE / transient), and that a demoted row
//          drops out of retrieval. The injected upstream fetch DISPATCHES ON
//          file_id so one sweep drives all outcomes WITHOUT any real network.
// CONNECTS TO: source-health.service.ts, document-context.service.ts,
//          notification.service.ts, context-candidates.service.ts,
//          source-integrity.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import {
  sourceHealthSweepForCaller,
  SOURCE_HEALTH_NOTIFICATION_CLASS,
} from "../../apps/api/src/services/otzar/source-health.service.js";
import {
  importGoogleDocForCaller,
  type FetchDocText,
} from "../../apps/api/src/services/otzar/document-context.service.js";
import { getContextCandidatesForLedgerEntry } from "../../apps/api/src/services/work-os/context-candidates.service.js";
import { createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}
async function makeEntity(displayName: string, entityType: "PERSON" | "COMPANY"): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/[^a-z0-9]/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName + randomUUID()),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: entityType,
    clearance_level: 3,
    status: "ACTIVE",
  });
  return e.entity_id;
}

// Notifications MUST be deleted BEFORE the test entities they reference — this
// sweep (unlike the revalidate-only test) creates real Notification rows.
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient_entity_id: { in: ids } },
        { source_entity_id: { in: ids } },
        { org_entity_id: { in: ids } },
      ],
    },
  });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
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

// An injected upstream fetch that DISPATCHES on file_id so ONE sweep drives
// every branch (the shared source-integrity helper ignores its args and can't).
function fetchByFileId(
  map: Record<string, Awaited<ReturnType<FetchDocText>>>,
): FetchDocText {
  return async (args) => {
    const hit = map[args.file_id];
    if (hit === undefined) throw new Error(`unexpected file_id in test fetch: ${args.file_id}`);
    return hit;
  };
}
function okExport(fileId: string, contentSha256: string): Awaited<ReturnType<FetchDocText>> {
  return {
    ok: true,
    provider: "google",
    file_id: fileId,
    name: "upstream",
    modified_time: "2026-07-05T00:00:00Z",
    web_view_link: null,
    content_sha256: contentSha256,
    text: "upstream text",
  };
}

describe("[SOURCE-HEALTH-SWEEP] bounded re-verification + admin notifications (DB)", () => {
  let orgId = "";
  let adminId = "";

  async function grantOrgAdmin(entityId: string): Promise<void> {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: { can_admin_org: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({ where: { entity_id: entityId } });
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entityId },
      data: {
        tar_hash: computeTARHash({
          can_login: fresh!.can_login,
          can_read_capsules: fresh!.can_read_capsules,
          can_write_capsules: fresh!.can_write_capsules,
          can_share_capsules: fresh!.can_share_capsules,
          can_create_hives: fresh!.can_create_hives,
          can_access_external_api: fresh!.can_access_external_api,
          can_admin_niov: fresh!.can_admin_niov,
          can_admin_org: fresh!.can_admin_org,
          clearance_ceiling: fresh!.clearance_ceiling,
          monetization_role: fresh!.monetization_role,
          compliance_frameworks: fresh!.compliance_frameworks,
          status: fresh!.status,
        }),
      },
    });
  }

  async function importDoc(fileId: string, name: string, text: string, sha: string): Promise<string> {
    const r = await importGoogleDocForCaller(adminId, {
      file_id: fileId,
      name,
      text,
      modified_time: "2026-06-01T00:00:00Z",
      web_view_link: null,
      content_sha256: sha,
      source_kind: "SOP",
      currentness: "historical",
    });
    if (r.ok === false) throw new Error(`import failed: ${JSON.stringify(r)}`);
    return r.ledger_entry_id;
  }
  async function makeWorkRow(title: string): Promise<string> {
    const created = await createLedgerEntry({
      org_entity_id: orgId,
      ledger_type: "TASK",
      title,
      owner_entity_id: adminId,
      requester_entity_id: adminId,
    });
    if (created.ok === false) throw new Error("create failed");
    return created.entry.ledger_entry_id;
  }
  async function appearsInCandidates(workRowId: string, title: string): Promise<boolean> {
    const r = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workRowId,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
    });
    return r.ok === true && r.candidates.some((c) => c.title_label === title);
  }
  async function integrityState(ledgerEntryId: string): Promise<string | undefined> {
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerEntryId } });
    const d = (row!.details ?? {}) as Record<string, unknown>;
    const si = (d.source_integrity ?? {}) as Record<string, unknown>;
    return si.state as string | undefined;
  }
  async function healthNotifications(): Promise<Array<{ body_summary: string }>> {
    return prisma.notification.findMany({
      where: {
        recipient_entity_id: adminId,
        notification_class: SOURCE_HEALTH_NOTIFICATION_CLASS,
      },
      select: { body_summary: true },
    });
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("SH Org", "COMPANY");
    adminId = await makeEntity("SH Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("sweeps the four outcomes: tallies correct, ONE notification per demoted doc, none for AVAILABLE, demoted row drops from retrieval", async () => {
    const sameSha = `sha256:${"a".repeat(64)}`;
    const changedImportSha = `sha256:${"b".repeat(64)}`;
    const changedUpstreamSha = `sha256:${"c".repeat(64)}`;

    const availTitle = "Kestrel onboarding SOP";
    const changedTitle = "Meridian rollout plan";
    const deletedTitle = "Solstice deployment handbook";
    const revokedTitle = "Aurora vendor agreement";

    await importDoc("gdoc-available", availTitle, "Kestrel onboarding checklist.", sameSha);
    const changedId = await importDoc("gdoc-changed", changedTitle, "Meridian rollout milestones and Meridian owners.", changedImportSha);
    const deletedId = await importDoc("gdoc-deleted", deletedTitle, "Solstice deployment details.", `sha256:${"d".repeat(64)}`);
    await importDoc("gdoc-revoked", revokedTitle, "Aurora vendor terms.", `sha256:${"e".repeat(64)}`);

    const changedWork = await makeWorkRow("Meridian rollout schedule sync");
    // Demoted-doc drop-from-retrieval control: retrievable while AVAILABLE.
    expect(await appearsInCandidates(changedWork, changedTitle)).toBe(true);

    const sweep = await sourceHealthSweepForCaller(adminId, {
      fetchDocText: fetchByFileId({
        "gdoc-available": okExport("gdoc-available", sameSha),
        "gdoc-changed": okExport("gdoc-changed", changedUpstreamSha),
        "gdoc-deleted": { ok: false, code: "NOT_FOUND" },
        "gdoc-revoked": { ok: false, code: "SCOPE_REAUTH_REQUIRED" },
      }),
    });

    expect(sweep.ok).toBe(true);
    if (sweep.ok) {
      expect(sweep.summary.checked).toBe(4);
      expect(sweep.summary.verified).toBe(1);
      expect(sweep.summary.changed_upstream).toBe(1);
      expect(sweep.summary.source_deleted).toBe(1);
      expect(sweep.summary.access_revoked).toBe(1);
      expect(sweep.summary.corrupt).toBe(0);
      expect(sweep.summary.unavailable).toBe(0);
      // ONE notification per DEMOTED doc — never for the AVAILABLE one.
      expect(sweep.summary.notified).toBe(3);
    }

    // Per-state persistence.
    expect(await integrityState(changedId)).toBe("CHANGED_UPSTREAM");
    expect(await integrityState(deletedId)).toBe("SOURCE_DELETED");

    // Exactly 3 SOURCE_HEALTH_CHANGED notifications, one naming each demoted
    // doc — and none naming the healthy AVAILABLE doc.
    const notes = await healthNotifications();
    expect(notes.length).toBe(3);
    const bodies = notes.map((n) => n.body_summary).join("\n");
    expect(bodies).toContain(changedTitle);
    expect(bodies).toContain(deletedTitle);
    expect(bodies).toContain(revokedTitle);
    expect(bodies).not.toContain(availTitle);

    // The demoted (changed) row is dropped from active retrieval.
    expect(await appearsInCandidates(changedWork, changedTitle)).toBe(false);
  });

  it("transient REVALIDATION_UNAVAILABLE is NOT a health change: no demotion, no notification, snapshot untouched", async () => {
    const sha = `sha256:${"f".repeat(64)}`;
    const title = "Harborview deployment runbook";
    const docId = await importDoc("gdoc-transient", title, "Harborview deployment ownership.", sha);

    const sweep = await sourceHealthSweepForCaller(adminId, {
      // NOT_CONNECTED is a transient/infra code -> REVALIDATION_UNAVAILABLE.
      fetchDocText: fetchByFileId({ "gdoc-transient": { ok: false, code: "NOT_CONNECTED" } }),
    });

    expect(sweep.ok).toBe(true);
    if (sweep.ok) {
      expect(sweep.summary.checked).toBe(1);
      expect(sweep.summary.unavailable).toBe(1);
      expect(sweep.summary.verified).toBe(0);
      expect(sweep.summary.changed_upstream).toBe(0);
      expect(sweep.summary.notified).toBe(0);
    }

    // Snapshot left AVAILABLE (a network blip never demotes a good snapshot).
    expect(await integrityState(docId)).toBe("AVAILABLE");
    // No notification emitted for a transient blip.
    expect((await healthNotifications()).length).toBe(0);
  });
});
