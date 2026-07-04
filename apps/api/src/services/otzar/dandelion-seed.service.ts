// FILE: dandelion-seed.service.ts
// PURPOSE: [SECTION-12-WORKGRAPH] The admin-governed approve/reject/hold lifecycle
//          for Dandelion org-seeding seeds. Seeds (Phase 6) are persisted as
//          ORG_SEEDING WorkLedgerEntry rows (no duplicate model). This is the
//          admin queue + the safe transitions:
//            - APPROVE  → marks SEED_APPROVED and, for a tool/connector seed,
//              CREATES a setup-required action (NEVER auto-grants access).
//            - REJECT   → marks SEED_REJECTED + records the reason (correction/audit
//              so future routing improves).
//            - HOLD     → marks SEED_HELD (visible but inactive).
//          Admin-gated (the route enforces can_admin_org); tenant-isolated; every
//          transition writes an audit event. NEVER auto-applies, never invites,
//          never grants access.
// RUNTIME (ADR-0090): TS — admin governance/authorization stays in the Foundation
//   authority tier.
// CONNECTS TO: work-os/work-ledger.service.ts (createLedgerEntry), work-graph-
//   memory.ts (seed source), routes/otzar.routes.ts (admin endpoints),
//   tests/integration/dandelion-seed.test.ts.

import { prisma, writeAuditEvent } from "@niov/database";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";

export interface OrgSeedView {
  seed_id: string;
  seed_type: string;
  subject_name: string | null;
  /** The resolved org entity for the subject when known (else null). */
  subject_entity_id: string | null;
  /** Stable grouping key for the Organization Seeding queues: the resolved entity id
   *  when known, else the normalized subject name, else the seed type. The frontend
   *  clusters duplicate suggestions for the same person/target under one grouped card
   *  (so five "activate David" seeds render as one David group, at 5,000-person scale). */
  subject_key: string;
  recommended_action: string;
  source_evidence: string | null;
  source_conversation_id: string | null;
  confidence: string;
  approval_required: boolean;
  policy_status: string;
  sensitivity: string;
  risk_if_ignored: string | null;
  status: string; // SEED_PROPOSED | SEED_NEEDS_REVIEW | SEED_APPROVED | SEED_REJECTED | SEED_HELD | ...
  resulting_action: string | null;
  rejection_reason: string | null;
  hold_reason: string | null;
  reviewed: boolean;
  created_at: string;
}

type SeedDetails = {
  seed_type?: string;
  subject_name?: string | null;
  subject_entity_id?: string | null;
  recommended_action?: string;
  source_conversation_id?: string | null;
  confidence?: string;
  approval_required?: boolean;
  policy_status?: string;
  sensitivity?: string;
  risk_if_ignored?: string | null;
  resulting_action?: string | null;
  rejection_reason?: string | null;
  hold_reason?: string | null;
  reviewer_entity_id?: string | null;
  reviewed_at?: string | null;
};

type SeedRow = {
  ledger_entry_id: string;
  org_entity_id: string;
  ledger_type: string;
  title: string;
  status: string;
  details: unknown;
  evidence: unknown;
  created_at: Date;
};

function projectSeed(row: SeedRow): OrgSeedView {
  const d = (row.details ?? {}) as SeedDetails;
  const ev = Array.isArray(row.evidence) ? (row.evidence as Array<{ quote?: string }>) : [];
  const subjectName = d.subject_name ?? null;
  const subjectEntityId = d.subject_entity_id ?? null;
  const seedType = d.seed_type ?? "unknown";
  const subjectKey =
    subjectEntityId !== null
      ? `entity:${subjectEntityId}`
      : subjectName !== null && subjectName.trim().length > 0
        ? `name:${subjectName.trim().toLowerCase()}`
        : `type:${seedType}`;
  return {
    seed_id: row.ledger_entry_id,
    seed_type: seedType,
    subject_name: subjectName,
    subject_entity_id: subjectEntityId,
    subject_key: subjectKey,
    recommended_action: d.recommended_action ?? row.title,
    source_evidence: ev[0]?.quote ?? null,
    source_conversation_id: d.source_conversation_id ?? null,
    confidence: d.confidence ?? "medium",
    approval_required: d.approval_required ?? true,
    policy_status: d.policy_status ?? "needs_review",
    sensitivity: d.sensitivity ?? "internal",
    risk_if_ignored: d.risk_if_ignored ?? null,
    status: row.status,
    resulting_action: d.resulting_action ?? null,
    rejection_reason: d.rejection_reason ?? null,
    hold_reason: d.hold_reason ?? null,
    reviewed: d.reviewed_at != null,
    created_at: row.created_at.toISOString(),
  };
}

export type SeedActionFailure = { ok: false; code: "NOT_FOUND" | "INVALID_REQUEST"; message: string };
export type SeedActionSuccess = { ok: true; seed: OrgSeedView };

/** List the org's Dandelion seeds (admin only — enforced at the route). Tenant-isolated. */
export async function listOrgSeeds(orgEntityId: string): Promise<OrgSeedView[]> {
  const rows = await prisma.workLedgerEntry.findMany({
    where: { org_entity_id: orgEntityId, ledger_type: "ORG_SEEDING" },
    orderBy: { created_at: "desc" },
    take: 200,
  });
  return rows.map((r) => projectSeed(r as SeedRow));
}

async function loadSeed(seedId: string, orgEntityId: string): Promise<SeedRow | null> {
  const row = await prisma.workLedgerEntry.findUnique({ where: { ledger_entry_id: seedId } });
  // Tenant-safe: a seed in another org is reported as not-found (no cross-tenant leak).
  if (row === null || row.org_entity_id !== orgEntityId || row.ledger_type !== "ORG_SEEDING") return null;
  return row as unknown as SeedRow;
}

async function transition(
  seedId: string,
  orgEntityId: string,
  adminEntityId: string,
  newStatus: string,
  extraDetails: Partial<SeedDetails>,
  auditAction: string,
): Promise<SeedActionSuccess | SeedActionFailure> {
  const row = await loadSeed(seedId, orgEntityId);
  if (row === null) return { ok: false, code: "NOT_FOUND", message: "seed not found" };
  const details: SeedDetails = {
    ...((row.details ?? {}) as SeedDetails),
    ...extraDetails,
    reviewer_entity_id: adminEntityId,
    reviewed_at: new Date().toISOString(),
  };
  const updated = await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: seedId },
    data: { status: newStatus, details: details as object, verified_at: new Date() },
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: adminEntityId,
    target_entity_id: adminEntityId,
    details: { action: auditAction, seed_id: seedId, seed_type: details.seed_type, org_entity_id: orgEntityId },
  });
  return { ok: true, seed: projectSeed(updated as SeedRow) };
}

const TOOL_SEED_TYPES = new Set(["grant_tool_access", "connector_setup"]);

/**
 * Approve a seed. Does NOT grant access or invite anyone. For a tool/connector
 * seed it CREATES a setup-required action (so approval ADVANCES to the next
 * governed step, never fakes completion). For other seeds it records the approval
 * for the next governed step.
 */
export async function approveSeed(args: {
  seedId: string;
  orgEntityId: string;
  adminEntityId: string;
}): Promise<SeedActionSuccess | SeedActionFailure> {
  const row = await loadSeed(args.seedId, args.orgEntityId);
  if (row === null) return { ok: false, code: "NOT_FOUND", message: "seed not found" };
  const d = (row.details ?? {}) as SeedDetails;

  let resultingAction = "approved for the next governed step";
  // [T-2A] External-party promotion: approval of a review_external_party
  // seed creates (or reuses) the org-scoped GOVERNED ExternalCollaborator.
  // The admin's explicit approval IS the review boundary — a mention never
  // auto-promotes, and access is NOT granted (TRACKED_EXTERNAL, level NONE,
  // exactly like manual tracking). Idempotent per (org, name).
  if (d.seed_type === "review_external_party") {
    const subjectName =
      typeof (d as Record<string, unknown>).subject_name === "string"
        ? ((d as Record<string, unknown>).subject_name as string).trim()
        : "";
    if (subjectName.length === 0) {
      return { ok: false, code: "INVALID_REQUEST", message: "external review seed has no subject" };
    }
    const relationshipGuess =
      typeof (d as Record<string, unknown>).relationship_guess === "string"
        ? ((d as Record<string, unknown>).relationship_guess as string)
        : "";
    const VALID_RELATIONSHIPS = new Set([
      "CLIENT", "VENDOR", "CONTRACTOR", "PARTNER", "INVESTOR",
      "ADVISOR", "AGENCY", "REGULATOR", "PROSPECT", "CANDIDATE", "OTHER",
    ]);
    const relationship = VALID_RELATIONSHIPS.has(relationshipGuess)
      ? relationshipGuess
      : "OTHER";
    const existing = await prisma.externalCollaborator.findFirst({
      where: {
        org_entity_id: args.orgEntityId,
        display_name: { equals: subjectName, mode: "insensitive" },
        deleted_at: null,
      },
      select: { external_collaborator_id: true },
    });
    if (existing !== null) {
      resultingAction = "already tracked as an external collaborator — no duplicate created";
    } else {
      const created = await prisma.externalCollaborator.create({
        data: {
          org_entity_id: args.orgEntityId,
          display_name: subjectName,
          relationship_type: relationship as never,
          created_by_entity_id: args.adminEntityId,
        },
      });
      await writeAuditEvent({
        event_type: "EXTERNAL_COLLABORATOR_TRACKED",
        outcome: "SUCCESS",
        actor_entity_id: args.adminEntityId,
        target_entity_id: args.adminEntityId,
        details: {
          source: "dandelion_seed_approval",
          from_seed_id: args.seedId,
          external_collaborator_id: created.external_collaborator_id,
          relationship_type: relationship,
          org_entity_id: args.orgEntityId,
        },
      });
      resultingAction =
        "tracked as a governed external collaborator — access is NOT granted automatically";
    }
  }
  if (TOOL_SEED_TYPES.has(d.seed_type ?? "")) {
    // Approval creates a setup-required admin action — it does NOT grant access.
    const setup = await createLedgerEntry({
      org_entity_id: args.orgEntityId,
      ledger_type: "TASK",
      source_type: "CONNECTOR",
      owner_entity_id: args.adminEntityId,
      title: `Setup required: ${d.recommended_action ?? row.title}`,
      status: "NEEDS_APPROVAL",
      priority: "PROJECT_CRITICAL",
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      next_action: "Connect/authorize the required tool, then the work can proceed.",
      details: { source: "dandelion_seed_approval", from_seed_id: args.seedId, seed_type: d.seed_type },
    });
    resultingAction = setup.ok
      ? `setup action created (${setup.entry.ledger_entry_id}) — access is NOT granted automatically`
      : "approved; setup action creation pending";
  }
  return transition(args.seedId, args.orgEntityId, args.adminEntityId, "SEED_APPROVED", { resulting_action: resultingAction }, "DANDELION_SEED_APPROVED");
}

/** Reject a seed + record the correction reason (audit) so future routing improves. */
export async function rejectSeed(args: {
  seedId: string;
  orgEntityId: string;
  adminEntityId: string;
  reason?: string;
}): Promise<SeedActionSuccess | SeedActionFailure> {
  return transition(
    args.seedId,
    args.orgEntityId,
    args.adminEntityId,
    "SEED_REJECTED",
    { rejection_reason: args.reason ?? "Rejected by admin." },
    "DANDELION_SEED_REJECTED",
  );
}

/** Hold a seed — visible but inactive (no action taken). */
export async function holdSeed(args: {
  seedId: string;
  orgEntityId: string;
  adminEntityId: string;
  reason?: string;
}): Promise<SeedActionSuccess | SeedActionFailure> {
  return transition(
    args.seedId,
    args.orgEntityId,
    args.adminEntityId,
    "SEED_HELD",
    { hold_reason: args.reason ?? "Held for later." },
    "DANDELION_SEED_HELD",
  );
}
