// FILE: external-review-chooser.test.ts (integration, real Postgres)
// PURPOSE: [T-3C] lock the possible-match review chooser: open external
//          review seeds project SAFE candidates (active-only, org-scoped,
//          labels + machine id — never emails/domains/identifier values);
//          the admin's explicit decisions work (link_existing reuses the
//          chosen record + records a verified alias + audits; track_new
//          forces a distinct record; dismiss = reject creates nothing);
//          invalid/cross-org/deleted candidates are refused; T-1 lights up
//          after a link; nothing enters personal memory.
// CONNECTS TO: dandelion-seed.service.ts ([T-3C] decision + projection),
//          external-collaborator-identity.service.ts (candidate lister).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@niov/database";
import {
  approveSeed,
  rejectSeed,
  listOrgSeeds,
} from "../../apps/api/src/services/otzar/dandelion-seed.service.js";
import { getLedgerEntry } from "../../apps/api/src/services/work-os/work-ledger.service.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";

const TEST_PREFIX = "__niov_test__extchooser__";
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
  await prisma.collaborationWorkspace.deleteMany({ where: { org_entity_id: { in: ids } } });
  await prisma.workLedgerEntry.deleteMany({ where: { org_entity_id: { in: ids } } });
}

async function mkSeed(orgId: string, subject: string, company?: string) {
  return prisma.workLedgerEntry.create({
    data: {
      org_entity_id: orgId, ledger_type: "ORG_SEEDING", source_type: "VOICE_COMMAND",
      title: `${TEST_PREFIX} review ${subject}`, status: "SEED_NEEDS_REVIEW", priority: "ROUTINE",
      extraction_source: "TYPESCRIPT_DETERMINISTIC", evidence: [],
      details: {
        seed_type: "review_external_party", subject_name: subject,
        relationship_guess: "CLIENT", approval_required: true,
        ...(company !== undefined ? { company_label: company } : {}),
      },
    },
  });
}

describe(`[T-3C] external review chooser (run ${RUN})`, () => {
  let orgId = "";
  let callerId = "";
  let adminId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanup();
    await cleanupTestData();
    orgId = await makeEntity("CH Org", "COMPANY");
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

  it("open review seeds project SAFE candidates — active-only, org-scoped, no emails/identifier values", async () => {
    const person = `Casey Choose ${RUN}`;
    // Two same-name collaborators (the T-3B ambiguity) + a deleted one +
    // a cross-org one — only the two active same-org rows may project.
    await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId, display_name: person, company_name: `Acme ${RUN}`,
        relationship_type: "CLIENT", created_by_entity_id: callerId,
        email: `${TEST_PREFIX}casey@acme-secret.test`,
      },
    });
    await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId, display_name: person, company_name: `Globex ${RUN}`,
        relationship_type: "VENDOR", created_by_entity_id: callerId,
      },
    });
    await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId, display_name: person, company_name: `DeletedCo ${RUN}`,
        relationship_type: "OTHER", created_by_entity_id: callerId, deleted_at: new Date(),
      },
    });
    const orgB = await makeEntity("CH Org B", "COMPANY");
    await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgB, display_name: person, company_name: `OtherOrgCo ${RUN}`,
        relationship_type: "CLIENT", created_by_entity_id: callerId,
      },
    });

    await mkSeed(orgId, person, `Acme ${RUN}`);
    const seeds = await listOrgSeeds(orgId);
    const seed = seeds.find((s) => s.subject_name === person);
    expect(seed?.possible_matches?.length).toBe(2);
    const labels = seed!.possible_matches!.map((m) => m.company_label);
    expect(labels).toContain(`Acme ${RUN}`);
    expect(labels).toContain(`Globex ${RUN}`);
    expect(labels).not.toContain(`DeletedCo ${RUN}`);
    expect(labels).not.toContain(`OtherOrgCo ${RUN}`);
    const acme = seed!.possible_matches!.find((m) => m.company_label === `Acme ${RUN}`);
    expect(acme!.reason).toBe("Same company");
    expect(acme!.confidence).toBe("medium");
    // Safe copy only — no emails/domains/identifier values anywhere.
    const raw = JSON.stringify(seed!.possible_matches);
    expect(raw).not.toContain("acme-secret.test");
    expect(raw).not.toContain("@");
  });

  it("link_existing reuses the CHOSEN record, records an admin-verified alias, audits the decision; T-1 lights up after the link", async () => {
    const capsulesBefore = await prisma.memoryCapsule.count();
    const canonical = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId, display_name: `Jordan Vale ${RUN}`,
        company_name: `Acme Link ${RUN}`, relationship_type: "CLIENT",
        created_by_entity_id: callerId,
      },
    });
    // The seed observed a VARIANT name — the exact ambiguity the chooser
    // exists for.
    const seed = await mkSeed(orgId, `Jordy Vale ${RUN}`);
    const linked = await approveSeed({
      seedId: seed.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId,
      decision: "link_existing",
      linkExternalCollaboratorId: canonical.external_collaborator_id,
    });
    expect(linked.ok).toBe(true);
    // No duplicate record was created.
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, deleted_at: null },
      }),
    ).toBe(1);
    // The variant name became an ADMIN-VERIFIED alias.
    const alias = await prisma.externalCollaboratorIdentifier.findFirst({
      where: {
        org_entity_id: orgId, identifier_type: "MANUAL_ALIAS",
        external_collaborator_id: canonical.external_collaborator_id,
      },
    });
    expect(alias).not.toBeNull();
    expect(alias!.verified_by_entity_id).toBe(adminId);
    // Audit records the decision.
    const audit = await prisma.auditEvent.findFirst({
      where: { event_type: "EXTERNAL_COLLABORATOR_TRACKED", actor_entity_id: adminId },
      orderBy: { timestamp: "desc" },
    });
    expect((audit!.details as Record<string, unknown>).decision).toBe("link_existing");
    expect((audit!.details as Record<string, unknown>).alias_added).toBe(true);

    // T-1 lights up through the linked record (conversation commitment).
    const ws = await prisma.collaborationWorkspace.create({
      data: { org_entity_id: orgId, title: `${TEST_PREFIX} ws ${RUN}`, created_by_entity_id: callerId },
    });
    const convId = randomUUID();
    await prisma.externalCommitment.create({
      data: {
        workspace_id: ws.workspace_id, org_entity_id: orgId,
        external_collaborator_id: canonical.external_collaborator_id,
        direction: "EXTERNAL_OWES_INTERNAL", text: `sends the SOW ${RUN}`,
        source_conversation_id: convId, added_by_entity_id: callerId,
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
      expect(gated.entry.external_context?.safe_context_label).toBe(`Waiting on Acme Link ${RUN}`);
    }
    expect(await prisma.memoryCapsule.count()).toBe(capsulesBefore);
  });

  it("track_new forces a DISTINCT record even when a name match exists; dismiss (reject) creates nothing; invalid candidates refused", async () => {
    const person = `Riley Fork ${RUN}`;
    await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgId, display_name: person, company_name: `Acme Fork ${RUN}`,
        relationship_type: "CLIENT", created_by_entity_id: callerId,
      },
    });
    // track_new: the admin says this is a DIFFERENT person.
    const seed1 = await mkSeed(orgId, person);
    const forked = await approveSeed({
      seedId: seed1.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId,
      decision: "track_new",
    });
    expect(forked.ok).toBe(true);
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, display_name: person, deleted_at: null },
      }),
    ).toBe(2);

    // dismiss = reject: no collaborator created.
    const seed2 = await mkSeed(orgId, `Nobody New ${RUN}`);
    const dismissed = await rejectSeed({
      seedId: seed2.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId,
      reason: "Not this person",
    });
    expect(dismissed.ok).toBe(true);
    expect(
      await prisma.externalCollaborator.count({
        where: { org_entity_id: orgId, display_name: `Nobody New ${RUN}` },
      }),
    ).toBe(0);

    // Invalid candidates refused: missing id, cross-org id, deleted id.
    const seed3 = await mkSeed(orgId, `Casey Refuse ${RUN}`);
    const missing = await approveSeed({
      seedId: seed3.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId,
      decision: "link_existing",
    });
    expect(missing.ok).toBe(false);
    const orgB = await makeEntity("CH Org C", "COMPANY");
    const foreign = await prisma.externalCollaborator.create({
      data: {
        org_entity_id: orgB, display_name: `Foreign ${RUN}`,
        relationship_type: "CLIENT", created_by_entity_id: callerId,
      },
    });
    const crossOrg = await approveSeed({
      seedId: seed3.ledger_entry_id, orgEntityId: orgId, adminEntityId: adminId,
      decision: "link_existing",
      linkExternalCollaboratorId: foreign.external_collaborator_id,
    });
    expect(crossOrg.ok).toBe(false);
  });
});
