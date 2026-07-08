// FILE: source-integrity.test.ts (integration, real Postgres)
// PURPOSE: [SOURCE-INTEGRITY] Lock the two-filter trust boundary on the
//          DOCUMENT_CONTEXT retrieval path + the snapshot-preserving
//          revalidation lifecycle:
//            1. RETRIEVAL ALLOWLIST — a seeded doc surfaces in all 3 pools
//               (candidates / background-answer / boundaries) while VERIFIED;
//               a CANCELLED doc disappears from all three.
//            2. REVALIDATION (injected upstream fetch — no real Google docs
//               are touched):
//               - same hash  -> AVAILABLE + SOURCE_VERIFIED audit
//               - diff hash  -> CHANGED_UPSTREAM; import_hash + snapshot +
//                 external_source.content_sha256 PRESERVED; row demoted out of
//                 ALL 3 pools EVEN THOUGH ledger status is still VERIFIED
//                 (this proves both filters are load-bearing).
//               - NOT_FOUND  -> SOURCE_DELETED, demoted
//               - 403-family -> ACCESS_REVOKED, demoted
// CONNECTS TO: document-context.service.ts (import + revalidation),
//          context-candidates / background-answer / context-boundaries pools,
//          source-integrity.ts, connector-data.routes.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { computeTARHash, prisma } from "@niov/database";
import { buildApp, MemoryNonceStore } from "@niov/api";
import {
  importGoogleDocForCaller,
  revalidateImportedDocForCaller,
  type FetchDocText,
} from "../../apps/api/src/services/otzar/document-context.service.js";
import { getContextCandidatesForLedgerEntry } from "../../apps/api/src/services/work-os/context-candidates.service.js";
import { answerNamedSubjectBackground } from "../../apps/api/src/services/work-os/background-answer.service.js";
import { getContextBoundaries } from "../../apps/api/src/services/work-os/context-boundaries.service.js";
import { createLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { cleanupTestData, ensureAuditTriggers, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

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
async function cleanup(): Promise<void> {
  const ents = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = ents.map((e) => e.entity_id);
  if (ids.length === 0) return;
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

// Build an injected upstream fetch that ignores its args and returns a fixed
// result — the seam that lets us drive changed / deleted / revoked branches
// WITHOUT corrupting or deleting a real Google doc.
function fetchReturning(
  result: Awaited<ReturnType<FetchDocText>>,
): FetchDocText {
  return async () => result;
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

describe("[SOURCE-INTEGRITY] retrieval allowlist + revalidation lifecycle (DB)", () => {
  let app: FastifyInstance;
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

  // Import ONE doc as an org-owned reference-context row (carries
  // source_integrity AVAILABLE + import_hash == content_sha256).
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
  // Is `title` currently retrievable via all three pools for `subject`?
  async function appearsInCandidates(workRowId: string, title: string): Promise<boolean> {
    const r = await getContextCandidatesForLedgerEntry({
      ledger_entry_id: workRowId,
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
    });
    return r.ok === true && r.candidates.some((c) => c.title_label === title);
  }
  async function appearsInBackground(subject: string): Promise<boolean> {
    const r = await answerNamedSubjectBackground({
      org_entity_id: orgId,
      caller_entity_id: adminId,
      is_manager: true,
      question: `What do we know about ${subject}?`,
    });
    return r.ok === true && r.answer.used_sources.includes("seeded_background_retrieval");
  }
  async function appearsInBoundaries(title: string): Promise<boolean> {
    const b = await getContextBoundaries(orgId);
    return b.recent_documents.some((d) => d.title_label === title);
  }
  async function integrityState(ledgerEntryId: string): Promise<{
    status: string;
    state: string | undefined;
    importHash: string | undefined;
    upstreamHash: string | undefined;
    snapshotSha: string | undefined;
    summary: string | null;
  }> {
    const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: ledgerEntryId } });
    const d = (row!.details ?? {}) as Record<string, unknown>;
    const si = (d.source_integrity ?? {}) as Record<string, unknown>;
    const doc = (d.document ?? {}) as Record<string, unknown>;
    const ext = (doc.external_source ?? {}) as Record<string, unknown>;
    return {
      status: row!.status,
      state: si.state as string | undefined,
      importHash: si.import_hash as string | undefined,
      upstreamHash: si.upstream_hash as string | undefined,
      snapshotSha: ext.content_sha256 as string | undefined,
      summary: row!.summary,
    };
  }
  async function auditExists(eventType: string): Promise<boolean> {
    const row = await prisma.auditEvent.findFirst({
      where: { event_type: eventType, target_entity_id: orgId },
    });
    return row !== null;
  }

  beforeAll(async () => {
    await ensureAuditTriggers();
    app = await buildApp({
      jwtSecret: "source-integrity-test-secret",
      sessionNonceStore: new MemoryNonceStore(),
      declarationStore: new MemoryNonceStore(),
    });
  });
  beforeEach(async () => {
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("SI Org", "COMPANY");
    adminId = await makeEntity("SI Admin", "PERSON");
    await grantOrgAdmin(adminId);
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: adminId, is_active: true, is_admin: true },
    });
  });
  afterAll(async () => {
    await app.close();
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("a VERIFIED doc surfaces in all 3 pools; a CANCELLED doc disappears from all three", async () => {
    const sha = `sha256:${"a".repeat(64)}`;
    const title = "Harborview deployment runbook";
    const docId = await importDoc("gdoc-cancel", title, "Harborview deployment ownership and escalation steps.", sha);
    const workId = await makeWorkRow("Harborview deployment readiness review");

    expect(await appearsInCandidates(workId, title)).toBe(true);
    expect(await appearsInBackground("Harborview")).toBe(true);
    expect(await appearsInBoundaries(title)).toBe(true);

    // Withdraw the doc (reachable via PATCH /work-os/ledger/:id in production).
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: docId },
      data: { status: "CANCELLED" },
    });

    expect(await appearsInCandidates(workId, title)).toBe(false);
    expect(await appearsInBackground("Harborview")).toBe(false);
    expect(await appearsInBoundaries(title)).toBe(false);
  });

  it("revalidation: unchanged upstream stays AVAILABLE and audits SOURCE_VERIFIED", async () => {
    const sha = `sha256:${"b".repeat(64)}`;
    const docId = await importDoc("gdoc-same", "Kestrel onboarding SOP", "Kestrel onboarding checklist.", sha);
    const before = await integrityState(docId);
    expect(before.state).toBe("AVAILABLE");

    const r = await revalidateImportedDocForCaller(adminId, docId, {
      fetchDocText: fetchReturning(okExport("gdoc-same", sha)),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toBe("AVAILABLE");
      expect(r.changed).toBe(false);
    }
    const after = await integrityState(docId);
    expect(after.state).toBe("AVAILABLE");
    expect(await auditExists("SOURCE_VERIFIED")).toBe(true);
  });

  it("revalidation: changed upstream demotes to CHANGED_UPSTREAM, PRESERVES the snapshot, and drops from all 3 pools while status stays VERIFIED", async () => {
    const importSha = `sha256:${"c".repeat(64)}`;
    const upstreamSha = `sha256:${"d".repeat(64)}`;
    const title = "Meridian rollout plan";
    const docId = await importDoc("gdoc-changed", title, "Meridian rollout milestones and Meridian owners.", importSha);
    const workId = await makeWorkRow("Meridian rollout schedule sync");

    // Retrievable while AVAILABLE.
    expect(await appearsInCandidates(workId, title)).toBe(true);
    expect(await appearsInBackground("Meridian")).toBe(true);
    expect(await appearsInBoundaries(title)).toBe(true);
    const before = await integrityState(docId);

    const r = await revalidateImportedDocForCaller(adminId, docId, {
      fetchDocText: fetchReturning(okExport("gdoc-changed", upstreamSha)),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toBe("CHANGED_UPSTREAM");
      expect(r.changed).toBe(true);
    }

    const after = await integrityState(docId);
    // Ledger status is UNTOUCHED — the demotion lives entirely in
    // source_integrity, which is exactly why the retrieval JS post-filter
    // (not just the status allowlist) is load-bearing.
    expect(after.status).toBe("VERIFIED");
    expect(after.state).toBe("CHANGED_UPSTREAM");
    // Snapshot PRESERVED: import_hash + external_source hash + body untouched.
    expect(after.importHash).toBe(importSha);
    expect(after.snapshotSha).toBe(importSha);
    expect(after.summary).toBe(before.summary);
    // The NEW upstream hash is recorded separately.
    expect(after.upstreamHash).toBe(upstreamSha);

    // Demoted out of every pool.
    expect(await appearsInCandidates(workId, title)).toBe(false);
    expect(await appearsInBackground("Meridian")).toBe(false);
    expect(await appearsInBoundaries(title)).toBe(false);
    expect(await auditExists("SOURCE_CHANGED_UPSTREAM")).toBe(true);
  });

  it("revalidation: NOT_FOUND demotes to SOURCE_DELETED; 403-family demotes to ACCESS_REVOKED (both drop from retrieval)", async () => {
    const deletedTitle = "Solstice deployment handbook";
    const revokedTitle = "Aurora vendor agreement";
    const deletedId = await importDoc("gdoc-deleted", deletedTitle, "Solstice deployment details.", `sha256:${"e".repeat(64)}`);
    const revokedId = await importDoc("gdoc-revoked", revokedTitle, "Aurora vendor terms.", `sha256:${"f".repeat(64)}`);
    const delWork = await makeWorkRow("Solstice deployment refresh");
    const revWork = await makeWorkRow("Aurora vendor renewal");

    expect(await appearsInCandidates(delWork, deletedTitle)).toBe(true);
    expect(await appearsInCandidates(revWork, revokedTitle)).toBe(true);

    const del = await revalidateImportedDocForCaller(adminId, deletedId, {
      fetchDocText: fetchReturning({ ok: false, code: "NOT_FOUND" }),
    });
    expect(del.ok === true && del.state).toBe("SOURCE_DELETED");

    const rev = await revalidateImportedDocForCaller(adminId, revokedId, {
      fetchDocText: fetchReturning({ ok: false, code: "SCOPE_REAUTH_REQUIRED" }),
    });
    expect(rev.ok === true && rev.state).toBe("ACCESS_REVOKED");

    expect((await integrityState(deletedId)).status).toBe("VERIFIED");
    expect((await integrityState(revokedId)).status).toBe("VERIFIED");
    expect(await appearsInCandidates(delWork, deletedTitle)).toBe(false);
    expect(await appearsInCandidates(revWork, revokedTitle)).toBe(false);
    expect(await appearsInBackground("Solstice")).toBe(false);
    expect(await appearsInBackground("Aurora")).toBe(false);
    expect(await auditExists("SOURCE_DELETED")).toBe(true);
    expect(await auditExists("SOURCE_ACCESS_REVOKED")).toBe(true);
  });
});
