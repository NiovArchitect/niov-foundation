// FILE: external-collaborator-identity.test.ts (integration, real Postgres)
// PURPOSE: [T-3B] lock governed collaborator dedupe: email evidence reuses
//          across differing names; verified aliases reuse, unverified never;
//          same name + different account never merges; ambiguity refuses to
//          decide; revoked records never match; cross-org same email never
//          merges; the J1 duplicate scenario (seed-promote then track) is
//          FIXED; audit records the reuse decision; T-1 still lights up on
//          a reused record; no identifiers/emails leak or enter wallets.
// CONNECTS TO: external-collaborator-identity.service.ts + track/promotion
//          wires.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import {
  findExistingCollaboratorMatch,
  recordCollaboratorIdentifier,
} from "../../apps/api/src/services/otzar/external-collaborator-identity.service.js";
import { trackExternalCollaboratorForCaller } from "../../apps/api/src/services/otzar/external-collaborator.service.js";
import { approveSeed } from "../../apps/api/src/services/otzar/dandelion-seed.service.js";
import { getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extcolid__";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

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
  await prisma.externalCommitment.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaboratorIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workspaceExternalMembership.deleteMany({
    where: { external_collaborator: { org_entity_id: { in: ids } } },
  });
  await prisma.externalOrganizationIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaborator.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalOrganization.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationMembership.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationWorkspace.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}

describe(`[T-3B] collaborator identity + governed dedupe (run ${RUN})`, () => {
  let orgId = "";
  let callerId = "";
  let adminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("CI Org", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    adminId = await makeEntity("Admin Ada", "PERSON");
    for (const id of [callerId, adminId]) {
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

  async function makeWorkspace(title: string) {
    const ws = await prisma.collaborationWorkspace.create({
      data: {
        org_entity_id: orgId, title, created_by_entity_id: callerId,
        visibility: "EXTERNAL_ALLOWED",
      },
    });
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        member_entity_id: callerId, member_display_name: "Sadeil",
        role_label: "Lead", member_type: "INTERNAL", access_level: "CONTRIBUTE",
      },
    });
    return ws;
  }
  async function track(ws: string, over: Record<string, unknown>) {
    return trackExternalCollaboratorForCaller({
      workspaceId: ws, callerEntityId: callerId, ...over,
    } as never) as Promise<{ ok: boolean; external_collaborator?: { external_collaborator_id: string } }>;
  }

  it("the J1 duplicate scenario is FIXED: seed-promote then track = ONE governed record, second workspace reuses too", async () => {
    const person = `Jordan Fix ${RUN}`;
    // Seed-promote first (T-2 path).
    const seed = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId, ledger_type: "ORG_SEEDING", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} review`, status: "SEED_NEEDS_REVIEW", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", evidence: [],
        details: { seed_type: "review_external_party", subject_name: person, relationship_guess: "CLIENT", approval_required: true },
      },
    });
    expect((await approveSeed({ seedId: seed.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId })).ok).toBe(true);

    // Manual track for the SAME person (no conflicting account) → REUSES.
    const ws1 = await makeWorkspace(`WS1 ${RUN}`);
    const t1 = await track(ws1.workspace_id, { displayName: person, companyName: `Acme Fix ${RUN}` });
    expect(t1.ok).toBe(true);
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, display_name: person, deleted_at: null },
      }),
    ).toBe(1);
    // The reuse BACKFILLED the account link onto the promoted record.
    const collab = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: orgId, display_name: person },
      include: { external_organization: true },
    });
    expect(collab!.external_organization?.display_name).toBe(`Acme Fix ${RUN}`);
    // Audit recorded the reuse decision.
    const audit = await prisma.auditEvent.findFirst({
      where: { event_type: "EXTERNAL_COLLABORATOR_TRACKED", actor_entity_id: callerId },
      orderBy: { timestamp: "desc" },
    });
    expect((audit!.details as Record<string, unknown>).reused).toBe(true);
    expect((audit!.details as Record<string, unknown>).matched_by).toBe("name_governed");

    // Tracking in a SECOND workspace reuses again + adds only a membership.
    const ws2 = await makeWorkspace(`WS2 ${RUN}`);
    const t2 = await track(ws2.workspace_id, { displayName: person, companyName: `Acme Fix ${RUN}` });
    expect(t2.ok).toBe(true);
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, display_name: person, deleted_at: null },
      }),
    ).toBe(1);
    expect(
      await prisma.workspaceExternalMembership.count({
        where: { external_collaborator: { display_name: person, org_entity_id: orgId } },
      }),
    ).toBe(2);
  });

  it("email evidence reuses across DIFFERENT display names; cross-org same email never merges", async () => {
    const ws = await makeWorkspace(`WS-email ${RUN}`);
    const email = `jordan.${RUN}@acmefix.test`;
    const t1 = await track(ws.workspace_id, { displayName: `J. Vale ${RUN}`, email });
    expect(t1.ok).toBe(true);
    const t2 = await track(ws.workspace_id, { displayName: `Jordan Vale ${RUN}`, email });
    expect(t2.ok).toBe(true);
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, email: { equals: email }, deleted_at: null },
      }),
    ).toBe(1);

    // Cross-org: the same email in org B is a separate record forever.
    const orgB = await makeEntity("CI Org B", "COMPANY");
    const match = await findExistingCollaboratorMatch({
      org_entity_id: orgB, display_name: `Jordan Vale ${RUN}`, email,
    });
    expect(match.matched).toBe(false);
  });

  it("verified alias reuses; an UNVERIFIED alias never matches", async () => {
    const ws = await makeWorkspace(`WS-alias ${RUN}`);
    const t1 = await track(ws.workspace_id, { displayName: `Jonathan Vale ${RUN}` });
    expect(t1.ok).toBe(true);
    const id = t1.external_collaborator!.external_collaborator_id;

    // Unverified alias → no match.
    await recordCollaboratorIdentifier({
      org_entity_id: orgId, external_collaborator_id: id,
      identifier_type: "MANUAL_ALIAS", identifier_value: `Jon V ${RUN}`,
    });
    const unverified = await findExistingCollaboratorMatch({
      org_entity_id: orgId, display_name: `Jon V ${RUN}`,
    });
    expect(unverified.matched).toBe(false);

    // Admin-verified alias → reuse.
    await prisma.externalCollaboratorIdentifier.updateMany({
      where: { org_entity_id: orgId, identifier_type: "MANUAL_ALIAS" },
      data: { verified_by_entity_id: adminId, verified_at: new Date() },
    });
    const verified = await findExistingCollaboratorMatch({
      org_entity_id: orgId, display_name: `Jon V ${RUN}`,
    });
    expect(verified.matched).toBe(true);
    if (verified.matched) expect(verified.matched_by).toBe("verified_alias");
  });

  it("same name + DIFFERENT account never merges; ambiguity refuses; revoked records never match", async () => {
    const person = `Taylor Two ${RUN}`;
    const ws = await makeWorkspace(`WS-two ${RUN}`);
    const t1 = await track(ws.workspace_id, { displayName: person, companyName: `Acme Two ${RUN}` });
    expect(t1.ok).toBe(true);
    // Same name, DIFFERENT company → a second person, never a merge.
    const t2 = await track(ws.workspace_id, { displayName: person, companyName: `Globex Two ${RUN}` });
    expect(t2.ok).toBe(true);
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, display_name: person, deleted_at: null },
      }),
    ).toBe(2);
    // Now the name is ambiguous — a company-less candidate matches NOTHING.
    const ambiguous = await findExistingCollaboratorMatch({
      org_entity_id: orgId, display_name: person,
    });
    expect(ambiguous.matched).toBe(false);
    if (!ambiguous.matched) expect(ambiguous.ambiguous).toBe(true);

    // Revoked records never match: soft-delete both, then no match at all.
    await prisma.externalCollaborator.updateMany({
      where: { org_entity_id: orgId, display_name: person },
      data: { deleted_at: new Date() },
    });
    const afterDelete = await findExistingCollaboratorMatch({
      org_entity_id: orgId, display_name: person, company_label: `Acme Two ${RUN}`,
    });
    expect(afterDelete.matched).toBe(false);
  });

  it("T-1 lights up on a REUSED record; no identifiers/emails leak; nothing enters personal memory", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    const correctionsBefore = await prisma.twinCorrectionMemory.count();
    const ws = await makeWorkspace(`WS-t1 ${RUN}`);
    const person = `Dana Reuse ${RUN}`;
    const account = `Reuse Co ${RUN}`;
    const email = `dana.${RUN}@reuseco.test`;
    await track(ws.workspace_id, { displayName: person, companyName: account, email, relationshipType: "CLIENT" });
    const t2 = await track(ws.workspace_id, { displayName: person, companyName: account, email });
    expect(t2.ok).toBe(true);
    const collabId = t2.external_collaborator!.external_collaborator_id;

    const convId = randomUUID();
    await prisma.externalCommitment.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        external_collaborator_id: collabId, direction: "EXTERNAL_OWES_INTERNAL",
        text: `sends the SOW ${RUN}`, source_conversation_id: convId,
        added_by_entity_id: callerId,
      },
    });
    const row = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgId, ledger_type: "FOLLOW_UP", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} chase ${RUN}`, status: "PROPOSED", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", owner_entity_id: callerId,
        conversation_id: convId, details: {}, evidence: [],
      },
    });
    const gated = await getLedgerEntry({
      ledger_entry_id: row.ledger_entry_id, org_entity_id: orgId,
      caller_entity_id: callerId, is_manager: false,
    });
    expect(gated.ok).toBe(true);
    if (gated.ok) {
      expect(gated.entry.external_context?.safe_context_label).toBe(`Waiting on ${account}`);
      const raw = JSON.stringify(gated.entry);
      expect(raw).not.toContain(email);
      expect(raw).not.toContain("identifier");
    }
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
    expect(await prisma.twinCorrectionMemory.count()).toBe(correctionsBefore);
  });
});
