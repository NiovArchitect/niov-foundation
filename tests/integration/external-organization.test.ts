// FILE: external-organization.test.ts (integration, real Postgres)
// PURPOSE: [T-3] lock the governed external-organization key: org-scoped
//          reuse (same name in one org = one row; same name in two customer
//          orgs = two rows, forever); collaborator links; both governed
//          paths (manual track + Dandelion promotion) create/reuse; T-1
//          prefers the organization label; null link stays a safe fallback;
//          personal email domains never identify an organization; nothing
//          enters personal memory; no raw domains/emails in projections.
// CONNECTS TO: external-organization.service.ts,
//          external-collaborator.service.ts (manual path),
//          dandelion-seed.service.ts (promotion path),
//          work-os/external-context.service.ts (T-1 label preference).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import {
  getOrCreateExternalOrganizationForCaller,
  addExternalOrganizationIdentifier,
  normalizeOrgName,
  isPersonalEmailDomain,
} from "../../apps/api/src/services/otzar/external-organization.service.js";
import { trackExternalCollaboratorForCaller } from "../../apps/api/src/services/otzar/external-collaborator.service.js";
import { approveSeed } from "../../apps/api/src/services/otzar/dandelion-seed.service.js";
import { getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extorg__";

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
  await prisma.externalCommitment.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workspaceExternalMembership.deleteMany({
    where: { external_collaborator: { org_entity_id: { in: ids } } },
  });
  await prisma.externalOrganizationIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaboratorIdentifier.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalCollaborator.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.externalOrganization.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationMembership.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.collaborationWorkspace.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}

describe("[T-3] external organization — governed identity key, not a CRM (DB)", () => {
  let orgA = "";
  let orgB = "";
  let callerId = "";
  let adminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgA = await makeEntity("EO Org A", "COMPANY");
    orgB = await makeEntity("EO Org B", "COMPANY");
    callerId = await makeEntity("Sadeil Caller", "PERSON");
    adminId = await makeEntity("Admin Ada", "PERSON");
    for (const id of [callerId, adminId]) {
      await prisma.entityMembership.create({
        data: { parent_id: orgA, child_id: id, is_active: true },
      });
    }
  });
  afterAll(async () => {
    await cleanup();
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("same name in ONE org reuses one row; same name in TWO customer orgs is TWO rows forever", async () => {
    const a1 = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgA, caller_entity_id: callerId,
      company_label: "Acme Corp", relationship_type: "CLIENT", source: "manual_track",
    });
    const a2 = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgA, caller_entity_id: callerId,
      company_label: "  acme  CORP ", source: "manual_track", // normalization reuses
    });
    expect(a1!.external_org_id).toBe(a2!.external_org_id);
    expect(normalizeOrgName("  Acme,  Corp. ")).toBe("acme corp");

    const b1 = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgB, caller_entity_id: callerId,
      company_label: "Acme Corp", source: "manual_track",
    });
    expect(b1!.external_org_id).not.toBe(a1!.external_org_id);
    expect(await prisma.externalOrganization.count({ where: { normalized_name: "acme corp" } })).toBe(2);
    // Creation audited with the confirming human.
    const audit = await prisma.auditEvent.findFirst({
      where: { event_type: "EXTERNAL_ORGANIZATION_CREATED", actor_entity_id: callerId },
    });
    expect(audit).not.toBeNull();
  });

  it("manual track links the collaborator to the org; corporate email domain becomes evidence; personal domains never do", async () => {
    const ws = await prisma.collaborationWorkspace.create({
      data: { org_entity_id: orgA, title: `${TEST_PREFIX} WS`, created_by_entity_id: callerId },
    });
    await prisma.collaborationMembership.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgA,
        member_entity_id: callerId, member_display_name: "Sadeil",
        role_label: "Lead", member_type: "INTERNAL", access_level: "CONTRIBUTE",
      },
    });
    const tracked = await trackExternalCollaboratorForCaller({
      workspaceId: ws.workspace_id,
      callerEntityId: callerId,
      displayName: "Jordan Vale",
      email: "jordan@acmecorp.com",
      companyName: "AcmeCorp",
      relationshipType: "CLIENT",
    } as never);
    expect((tracked as { ok: boolean }).ok).toBe(true);
    const collab = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: orgA, display_name: "Jordan Vale" },
      include: { external_organization: { include: { identifiers: true } } },
    });
    expect(collab!.external_org_id).not.toBeNull();
    expect(collab!.external_organization!.display_name).toBe("AcmeCorp");
    const ids = collab!.external_organization!.identifiers;
    expect(ids.length).toBe(1);
    expect(ids[0]!.identifier_type).toBe("EMAIL_DOMAIN");
    expect(ids[0]!.identifier_value_normalized).toBe("acmecorp.com");
    expect(ids[0]!.confidence).toBe("medium");

    // A personal email domain is NEVER an organization identifier.
    const tracked2 = await trackExternalCollaboratorForCaller({
      workspaceId: ws.workspace_id,
      callerEntityId: callerId,
      displayName: "Freelance Fran",
      email: "fran@gmail.com",
      companyName: "Fran Consulting",
    } as never);
    expect((tracked2 as { ok: boolean }).ok).toBe(true);
    const fran = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: orgA, display_name: "Freelance Fran" },
      include: { external_organization: { include: { identifiers: true } } },
    });
    expect(fran!.external_org_id).not.toBeNull();
    expect(fran!.external_organization!.identifiers.length).toBe(0);
    expect(fran!.external_organization!.primary_domain).toBeNull();
    expect(isPersonalEmailDomain("GMAIL.COM")).toBe(true);
    // Explicit identifier add also refuses personal domains.
    const refused = await addExternalOrganizationIdentifier({
      org_entity_id: orgA,
      external_org_id: fran!.external_org_id!,
      identifier_type: "EMAIL_DOMAIN",
      identifier_value: "outlook.com",
    });
    expect(refused.ok).toBe(false);
  });

  it("Dandelion promotion with a company label creates/reuses the org; without one, external_org_id stays null (safe fallback)", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    // A seed carrying a company label (the T-2 shape + company_label).
    const seed = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgA, ledger_type: "ORG_SEEDING", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} review Morgan`, status: "SEED_NEEDS_REVIEW", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", evidence: [],
        details: {
          seed_type: "review_external_party",
          subject_name: "Morgan Reeve",
          relationship_guess: "PROSPECT",
          company_label: "Globex",
          approval_required: true,
        },
      },
    });
    const approved = await approveSeed({
      seedId: seed.ledger_entry_id, orgEntityId: orgA, adminEntityId: adminId,
    });
    expect(approved.ok).toBe(true);
    const collab = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: orgA, display_name: "Morgan Reeve" },
      include: { external_organization: true },
    });
    expect(collab!.external_organization!.display_name).toBe("Globex");
    expect(collab!.external_organization!.relationship_type).toBe("PROSPECT");

    // A label-less seed promotes with a NULL org link — honest, no guess.
    const seed2 = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgA, ledger_type: "ORG_SEEDING", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} review Casey`, status: "SEED_NEEDS_REVIEW", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", evidence: [],
        details: {
          seed_type: "review_external_party",
          subject_name: "Casey Flint",
          relationship_guess: "VENDOR",
          approval_required: true,
        },
      },
    });
    const approved2 = await approveSeed({
      seedId: seed2.ledger_entry_id, orgEntityId: orgA, adminEntityId: adminId,
    });
    expect(approved2.ok).toBe(true);
    const casey = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: orgA, display_name: "Casey Flint" },
    });
    expect(casey!.external_org_id).toBeNull();
    // No personal-memory writes across either promotion.
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
  });

  it("T-1 external_context prefers the ORGANIZATION label and never leaks domains/emails; null link still renders the fallback", async () => {
    // Linked collaborator whose denormalized company_name DIFFERS from the
    // governed org display name — the org label must win.
    const org = await getOrCreateExternalOrganizationForCaller({
      org_entity_id: orgA, caller_entity_id: callerId,
      company_label: "Acme Corporation", relationship_type: "CLIENT",
      domain_evidence: "acmecorp.com", source: "manual_track",
    });
    const collab = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgA, display_name: "Riley Cross",
        company_name: "acme (old label)", relationship_type: "CLIENT",
        external_org_id: org!.external_org_id, created_by_entity_id: callerId,
        email: `${TEST_PREFIX}riley@acmecorp.com`,
      },
    });
    const ws = await prisma.collaborationWorkspace.create({
      data: { org_entity_id: orgA, title: `${TEST_PREFIX} Acme WS`, created_by_entity_id: callerId },
    });
    const convId = randomUUID();
    await prisma.externalCommitment.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgA,
        external_collaborator_id: collab.external_collaborator_id,
        direction: "EXTERNAL_OWES_INTERNAL",
        text: "Acme sends the signed SOW",
        source_conversation_id: convId,
        added_by_entity_id: callerId,
      },
    });
    const row = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgA, ledger_type: "FOLLOW_UP", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} chase SOW`, status: "PROPOSED", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", owner_entity_id: callerId,
        conversation_id: convId, details: {}, evidence: [],
      },
    });
    const gated = await getLedgerEntry({
      ledger_entry_id: row.ledger_entry_id, org_entity_id: orgA,
      caller_entity_id: callerId, is_manager: false,
    });
    expect(gated.ok).toBe(true);
    if (!gated.ok) return;
    expect(gated.entry.external_context?.external_org_label).toBe("Acme Corporation");
    expect(gated.entry.external_context?.safe_context_label).toBe("Waiting on Acme Corporation");
    const raw = JSON.stringify(gated.entry);
    expect(raw).not.toContain("acmecorp.com"); // domains/emails never project
    expect(raw).not.toContain("@");

    // Backward compatibility: an UNLINKED collaborator still renders its
    // denormalized company_name (T-1 unchanged when external_org_id null).
    const collab2 = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgA, display_name: "Solo Sam", company_name: "Initech",
        relationship_type: "VENDOR", created_by_entity_id: callerId,
      },
    });
    const conv2 = randomUUID();
    await prisma.externalCommitment.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgA,
        external_collaborator_id: collab2.external_collaborator_id,
        direction: "EXTERNAL_OWES_INTERNAL", text: "Initech ships the part",
        source_conversation_id: conv2, added_by_entity_id: callerId,
      },
    });
    const row2 = await prisma.workLedgerEntry.create({
      data: {
        org_entity_id: orgA, ledger_type: "FOLLOW_UP", source_type: "VOICE_COMMAND",
        title: `${TEST_PREFIX} chase part`, status: "PROPOSED", priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC", owner_entity_id: callerId,
        conversation_id: conv2, details: {}, evidence: [],
      },
    });
    const gated2 = await getLedgerEntry({
      ledger_entry_id: row2.ledger_entry_id, org_entity_id: orgA,
      caller_entity_id: callerId, is_manager: false,
    });
    expect(gated2.ok).toBe(true);
    if (gated2.ok) {
      expect(gated2.entry.external_context?.external_org_label).toBe("Initech");
    }
  });
});
