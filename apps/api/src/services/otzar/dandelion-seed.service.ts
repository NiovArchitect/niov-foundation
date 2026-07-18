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
import { getOrCreateExternalOrganizationForCaller } from "./external-organization.service.js";
import {
  findExistingCollaboratorMatch,
  listPossibleCollaboratorMatches,
  recordCollaboratorIdentifier,
  type PossibleCollaboratorMatch,
} from "./external-collaborator-identity.service.js";
import {
  addWorkProjectMemberForCaller,
} from "./work-project.service.js";
import { assignManager } from "../governance/hierarchy.service.js";
import { makeNotificationService } from "../notification/notification.service.js";

const notificationService = makeNotificationService({});

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
  /** [T-3C] review_external_party seeds only, and only when candidates
   *  exist: safe labels + a machine id for the decision call. Computed at
   *  projection time (never stored — matches must be fresh). Otzar lists;
   *  the admin decides. */
  possible_matches?: PossibleCollaboratorMatch[];
  /** Phase B — soft proposed manager on set_manager seeds (admin must confirm). */
  proposed_manager_entity_id?: string | null;
  proposed_manager_name?: string | null;
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
  /** Phase B — soft hierarchy proposal (never auto-applied). */
  proposed_manager_entity_id?: string | null;
  proposed_manager_name?: string | null;
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
    ...(typeof d.proposed_manager_entity_id === "string" ||
    d.proposed_manager_entity_id === null
      ? {
          proposed_manager_entity_id: d.proposed_manager_entity_id ?? null,
          proposed_manager_name:
            typeof d.proposed_manager_name === "string"
              ? d.proposed_manager_name
              : null,
        }
      : {}),
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
  const seeds = rows.map((r) => projectSeed(r as SeedRow));
  // [T-3C] fresh possible-match projection for OPEN external review seeds —
  // Otzar lists candidates; the admin decides. Bounded: external seeds are
  // rare and the lister caps at 3 candidates each.
  for (const seed of seeds) {
    if (seed.seed_type !== "review_external_party" || seed.reviewed) continue;
    if (seed.subject_name === null || seed.subject_name.trim().length === 0) continue;
    const d = (rows.find((r) => r.ledger_entry_id === seed.seed_id)?.details ?? {}) as Record<string, unknown>;
    const matches = await listPossibleCollaboratorMatches({
      org_entity_id: orgEntityId,
      display_name: seed.subject_name,
      company_label: typeof d.company_label === "string" ? d.company_label : null,
    });
    if (matches.length > 0) seed.possible_matches = matches;
  }
  return seeds;
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
  /** [T-3C] admin decision for review_external_party seeds:
   *  "link_existing" (requires linkExternalCollaboratorId — a candidate
   *  from possible_matches) or "track_new" (force a fresh governed record).
   *  Absent = the T-3B safe default (evidence match or create). Ambiguity
   *  is never decided silently — that is exactly what these decisions are
   *  for. Dismiss = the existing reject verb. */
  decision?: "link_existing" | "track_new";
  linkExternalCollaboratorId?: string;
  /**
   * [A.3] Exception path only: org-admin may supply project_id to place the
   * person immediately. Default path routes a TASK to their manager / lead.
   * Never auto-picks a project.
   */
  project_id?: string;
  /**
   * Phase B — for set_manager seeds: admin-confirmed manager. Falls back to
   * proposed_manager_entity_id on the seed when absent. Never auto-picks.
   */
  manager_entity_id?: string | null;
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
    // [T-3C] explicit admin decision: LINK to a chosen existing candidate.
    if (args.decision === "link_existing") {
      if (typeof args.linkExternalCollaboratorId !== "string" || args.linkExternalCollaboratorId.length === 0) {
        return { ok: false, code: "INVALID_REQUEST", message: "link_existing requires link_external_collaborator_id" };
      }
      const candidate = await prisma.externalCollaborator.findFirst({
        where: {
          external_collaborator_id: args.linkExternalCollaboratorId,
          org_entity_id: args.orgEntityId, // cross-org candidates impossible
          deleted_at: null, // revoked/deleted candidates refused
        },
      });
      if (candidate === null) {
        return { ok: false, code: "INVALID_REQUEST", message: "candidate is not an active external collaborator in this organization" };
      }
      // Record the subject name as an ADMIN-VERIFIED alias when it differs —
      // the same ambiguity self-resolves next time (audited evidence).
      let aliasAdded = false;
      if (candidate.display_name.trim().toLowerCase() !== subjectName.toLowerCase()) {
        const rec = await recordCollaboratorIdentifier({
          org_entity_id: args.orgEntityId,
          external_collaborator_id: candidate.external_collaborator_id,
          identifier_type: "MANUAL_ALIAS",
          identifier_value: subjectName,
          confidence: "high",
          source_system: "seed_link_decision",
          verified_by_entity_id: args.adminEntityId,
        });
        aliasAdded = rec.ok;
      }
      await writeAuditEvent({
        event_type: "EXTERNAL_COLLABORATOR_TRACKED",
        outcome: "SUCCESS",
        actor_entity_id: args.adminEntityId,
        target_entity_id: args.adminEntityId,
        details: {
          decision: "link_existing",
          from_seed_id: args.seedId,
          external_collaborator_id: candidate.external_collaborator_id,
          alias_added: aliasAdded,
          org_entity_id: args.orgEntityId,
        },
      });
      resultingAction = "linked to the existing external collaborator — no duplicate created";
      return transition(args.seedId, args.orgEntityId, args.adminEntityId, "SEED_APPROVED", { resulting_action: resultingAction }, "DANDELION_SEED_APPROVED");
    }

    // [T-3B] the SAME governed matcher as manual tracking: email/alias
    // evidence and unique consistent-account name matches reuse; ambiguity
    // or a different account creates new (never merges). An explicit
    // "track_new" decision skips the matcher — the admin has decided this
    // is a distinct person.
    const companyLabelForMatch =
      typeof (d as Record<string, unknown>).company_label === "string"
        ? ((d as Record<string, unknown>).company_label as string)
        : null;
    const existingMatch =
      args.decision === "track_new"
        ? ({ matched: false, ambiguous: false } as const)
        : await findExistingCollaboratorMatch({
            org_entity_id: args.orgEntityId,
            display_name: subjectName,
            company_label: companyLabelForMatch,
          });
    if (existingMatch.matched) {
      resultingAction = "already tracked as an external collaborator — no duplicate created";
    } else {
      // [T-3] link the governed external ORGANIZATION when the seed carries
      // a company label (governed path: the admin's approval confirms it).
      const companyLabel =
        typeof (d as Record<string, unknown>).company_label === "string"
          ? ((d as Record<string, unknown>).company_label as string).trim()
          : "";
      const externalOrg =
        companyLabel.length > 0
          ? await getOrCreateExternalOrganizationForCaller({
              org_entity_id: args.orgEntityId,
              caller_entity_id: args.adminEntityId,
              company_label: companyLabel,
              relationship_type: relationship,
              source: "dandelion_seed_approval",
            })
          : null;
      const created = await prisma.externalCollaborator.create({
        data: {
          org_entity_id: args.orgEntityId,
          display_name: subjectName,
          relationship_type: relationship as never,
          created_by_entity_id: args.adminEntityId,
          ...(companyLabel.length > 0 ? { company_name: companyLabel.slice(0, 120) } : {}),
          external_org_id: externalOrg?.external_org_id ?? null,
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
  } else if (d.seed_type === "add_project_membership") {
    // Placement is manager/lead work. Default: TASK for their manager.
    // Optional project_id = org-admin exception only (explicit override).
    const subject =
      typeof d.subject_name === "string" && d.subject_name.trim().length > 0
        ? d.subject_name.trim()
        : "this person";
    const subjectId =
      typeof d.subject_entity_id === "string" ? d.subject_entity_id : null;
    const projectId =
      typeof args.project_id === "string" && args.project_id.length > 0
        ? args.project_id
        : null;

    if (projectId !== null && subjectId !== null) {
      // Admin exception: place now (still explicit project — never auto-pick).
      const project = await prisma.workProject.findFirst({
        where: {
          project_id: projectId,
          org_entity_id: args.orgEntityId,
          state: "ACTIVE",
        },
        select: { project_id: true, name: true },
      });
      if (project === null) {
        return {
          ok: false,
          code: "INVALID_REQUEST",
          message: "Choose an active project in your organization.",
        };
      }
      const added = await addWorkProjectMemberForCaller({
        callerEntityId: args.adminEntityId,
        projectId: project.project_id,
        entityId: subjectId,
        role: "MEMBER",
        actorIsOrgAdmin: true,
        actorOrgEntityId: args.orgEntityId,
      });
      if (!added.ok && added.code !== "ALREADY_MEMBER") {
        return {
          ok: false,
          code: "INVALID_REQUEST",
          message: `Could not assign to project (${added.code}).`,
        };
      }
      resultingAction =
        added.ok === false && added.code === "ALREADY_MEMBER"
          ? `already on project “${project.name}” — seed closed (admin exception)`
          : `admin exception: assigned to “${project.name}” — normally their manager places them`;
    } else {
      // Default grow path: task for their manager (or reviewer if none).
      let managerId: string | null = null;
      if (subjectId !== null) {
        const mgrEdge = await prisma.entityMembership.findFirst({
          where: {
            child_id: subjectId,
            is_active: true,
            // Manager edge is person→person: parent is manager, not the org.
            parent_id: { not: args.orgEntityId },
          },
          select: { parent_id: true },
        });
        if (mgrEdge !== null) {
          const parent = await prisma.entity.findFirst({
            where: {
              entity_id: mgrEdge.parent_id,
              entity_type: "PERSON",
              status: "ACTIVE",
              deleted_at: null,
            },
            select: { entity_id: true },
          });
          managerId = parent?.entity_id ?? null;
        }
      }
      const taskOwner = managerId ?? args.adminEntityId;
      const setup = await createLedgerEntry({
        org_entity_id: args.orgEntityId,
        ledger_type: "TASK",
        source_type: "TRANSCRIPT",
        owner_entity_id: taskOwner,
        ...(subjectId !== null ? { target_entity_id: subjectId } : {}),
        title:
          managerId !== null
            ? `Place ${subject} on a first project (you manage them)`
            : `Place ${subject} on a first project (no manager set — hierarchy or lead needed)`,
        status: "NEEDS_APPROVAL",
        priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC",
        next_action:
          managerId !== null
            ? "As their manager, add them to a project you lead — Otzar does not auto-assign."
            : "Set their manager in hierarchy, or a project lead adds them to a project.",
        details: {
          source: "dandelion_seed_approval",
          from_seed_id: args.seedId,
          seed_type: d.seed_type,
          subject_entity_id: subjectId,
          routed_to_manager: managerId !== null,
          manager_entity_id: managerId,
          placement_authority: "MANAGER_OR_PROJECT_LEAD",
        },
      });
      resultingAction = setup.ok
        ? managerId !== null
          ? `routed to their manager — they place ${subject} on a project they lead`
          : `task created — no manager on file; set hierarchy or a project lead places them`
        : "approved; placement task pending";
    }
  } else if (d.seed_type === "add_team_membership") {
    const subject =
      typeof d.subject_name === "string" && d.subject_name.trim().length > 0
        ? d.subject_name.trim()
        : "this person";
    const setup = await createLedgerEntry({
      org_entity_id: args.orgEntityId,
      ledger_type: "TASK",
      source_type: "TRANSCRIPT",
      owner_entity_id: args.adminEntityId,
      ...(typeof d.subject_entity_id === "string"
        ? { target_entity_id: d.subject_entity_id }
        : {}),
      title: `Assign ${subject} to a team`,
      status: "NEEDS_APPROVAL",
      priority: "ROUTINE",
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      next_action: "Choose team membership — Otzar did not auto-assign.",
      details: {
        source: "dandelion_seed_approval",
        from_seed_id: args.seedId,
        seed_type: d.seed_type,
        subject_entity_id: d.subject_entity_id ?? null,
      },
    });
    resultingAction = setup.ok
      ? `team assignment setup created — not auto-joined`
      : "approved; team setup pending";
  } else if (d.seed_type === "set_manager") {
    // Phase B — hierarchy propose + admin confirmation. Never auto-writes.
    const subjectId =
      typeof d.subject_entity_id === "string" ? d.subject_entity_id : null;
    if (subjectId === null) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Hierarchy seed is missing the person.",
      };
    }
    const fromBody =
      args.manager_entity_id !== undefined
        ? args.manager_entity_id
        : undefined;
    const fromProposal =
      typeof d.proposed_manager_entity_id === "string" &&
      d.proposed_manager_entity_id.length > 0
        ? d.proposed_manager_entity_id
        : null;
    const managerId =
      fromBody !== undefined
        ? fromBody
        : fromProposal;
    if (managerId === null || managerId === undefined || managerId.length === 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Choose a manager to confirm this reporting relationship.",
      };
    }
    const assigned = await assignManager({
      org_entity_id: args.orgEntityId,
      actor_entity_id: args.adminEntityId,
      person_entity_id: subjectId,
      manager_entity_id: managerId,
    });
    if (!assigned.ok) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message:
          assigned.code === "CYCLE"
            ? "That manager would create a reporting cycle."
            : assigned.code === "MANAGER_NOT_FOUND" ||
                assigned.code === "PERSON_NOT_FOUND"
              ? "That person is not in your organization."
              : "Could not save the reporting change.",
      };
    }
    const subjectName =
      typeof d.subject_name === "string" && d.subject_name.trim().length > 0
        ? d.subject_name.trim()
        : "this person";
    const proposedName =
      typeof d.proposed_manager_name === "string"
        ? d.proposed_manager_name
        : null;
    resultingAction =
      proposedName !== null && managerId === d.proposed_manager_entity_id
        ? `confirmed: ${subjectName} reports to ${proposedName}`
        : `manager set for ${subjectName}`;
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

// ── Phase A: Discover → Seed → ambient grow ─────────────────────────────────
// Structure gaps should NOT become admin homework. Otzar lands a placement
// task on the manager's Work OS + a light notification — humans stay in flow.
// See docs/otzar/DANDELION_OPERATIONAL_ORDER.md.

const OPEN_SEED_STATUSES = [
  "SEED_PROPOSED",
  "SEED_NEEDS_REVIEW",
  "SEED_HELD",
] as const;

/** Resolve active person-manager of subject (parent of person edge). */
async function resolveManagerOfPerson(args: {
  orgEntityId: string;
  personEntityId: string;
}): Promise<string | null> {
  const edges = await prisma.entityMembership.findMany({
    where: {
      child_id: args.personEntityId,
      is_active: true,
      parent_id: { not: args.orgEntityId },
    },
    select: { parent_id: true },
    take: 8,
  });
  for (const e of edges) {
    const parent = await prisma.entity.findFirst({
      where: {
        entity_id: e.parent_id,
        entity_type: "PERSON",
        status: "ACTIVE",
        deleted_at: null,
      },
      select: { entity_id: true },
    });
    if (parent !== null) return parent.entity_id;
  }
  return null;
}

/**
 * Ambient grow: place a TASK on the manager's My Work + notify them.
 * Does NOT write membership. Manager/lead acts when ready — or ignores.
 */
export async function routeStructurePlacementAmbient(args: {
  orgEntityId: string;
  subjectEntityId: string;
  subjectName: string;
  seedId: string;
  actorEntityId: string;
}): Promise<{ manager_entity_id: string | null; task_id: string | null }> {
  const managerId = await resolveManagerOfPerson({
    orgEntityId: args.orgEntityId,
    personEntityId: args.subjectEntityId,
  });
  const taskOwner = managerId ?? args.actorEntityId;
  const title =
    managerId !== null
      ? `Place ${args.subjectName} on a first project`
      : `Place ${args.subjectName} on a first project (no manager set)`;
  const made = await createLedgerEntry({
    org_entity_id: args.orgEntityId,
    ledger_type: "TASK",
    source_type: "TRANSCRIPT",
    owner_entity_id: taskOwner,
    target_entity_id: args.subjectEntityId,
    title,
    summary:
      managerId !== null
        ? `Otzar noticed ${args.subjectName} has no project yet. You manage them — when convenient, add them to a project you lead. Nothing urgent unless their work is blocked.`
        : `${args.subjectName} has no project and no manager on file. A project lead or hierarchy update will clear this.`,
    status: "DETECTED",
    priority: "ROUTINE",
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    next_action:
      managerId !== null
        ? "When ready: add them to a project you lead (Projects → People)."
        : "Set manager in hierarchy, or a project owner invites them.",
    details: {
      ambient_placement: true,
      from_seed_id: args.seedId,
      seed_type: "add_project_membership",
      subject_entity_id: args.subjectEntityId,
      manager_entity_id: managerId,
      placement_authority: "MANAGER_OR_PROJECT_LEAD",
      non_blocking: true,
    },
  });
  if (made.ok && managerId !== null) {
    try {
      await notificationService.createInternalNotification({
        org_entity_id: args.orgEntityId,
        recipient_entity_id: managerId,
        source_entity_id: args.actorEntityId,
        notification_class: "STRUCTURE_PLACEMENT_NEEDED",
        body_summary: `${args.subjectName} still needs a first project — place them when it fits. Otzar will not nag.`,
        action_id: null,
      });
    } catch {
      // notify best-effort
    }
  }
  // Mark seed as ambiently routed (still open for hold/reject oversight).
  const seedRow = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: args.seedId },
    select: { details: true },
  });
  const prev =
    typeof seedRow?.details === "object" && seedRow.details !== null
      ? (seedRow.details as Record<string, unknown>)
      : {};
  await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: args.seedId },
    data: {
      next_action:
        managerId !== null
          ? "Ambient: on manager's work — no admin action required"
          : "Ambient: placement task created — hierarchy gap",
      details: {
        ...prev,
        ambient_routed_at: new Date().toISOString(),
        ambient_manager_entity_id: managerId,
        ambient_task_id: made.ok ? made.entry.ledger_entry_id : null,
        placement_authority: "MANAGER_OR_PROJECT_LEAD",
      } as object,
    },
  });
  return {
    manager_entity_id: managerId,
    task_id: made.ok ? made.entry.ledger_entry_id : null,
  };
}

export type GrowthSeedCandidate = {
  seed_type: "add_project_membership" | "set_manager";
  subject_entity_id: string;
  subject_name: string;
  recommended_action: string;
  source_evidence: string;
  risk_if_ignored: string;
  proposed_manager_entity_id?: string | null;
  proposed_manager_name?: string | null;
};

// WHAT: Pure plan of structure seeds from growth people list (unit-testable).
// WHY: Layer 2 → layer 3 without inventing people who are not org members.
export function planStructureSeedsFromGrowth(people: Array<{
  person_entity_id: string;
  display_name: string;
}>): GrowthSeedCandidate[] {
  const out: GrowthSeedCandidate[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    const id = p.person_entity_id.trim();
    const name = p.display_name.trim();
    if (id.length === 0 || name.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      seed_type: "add_project_membership",
      subject_entity_id: id,
      subject_name: name,
      recommended_action: `Assign ${name} to a first project or workspace`,
      source_evidence: `${name} is an org member without a live project/workspace assignment (org structure scan).`,
      risk_if_ignored:
        "Work, tools, and Twin context stay harder to route accurately for this person.",
    });
  }
  return out;
}

// WHAT: Pure plan of hierarchy (set_manager) seeds from growth manager gaps.
// WHY: Phase B — Otzar proposes; admin confirms. Never auto-writes hierarchy.
export function planManagerSeedsFromGrowth(
  people: Array<{
    person_entity_id: string;
    display_name: string;
    proposed_manager_entity_id?: string | null;
    proposed_manager_name?: string | null;
  }>,
): GrowthSeedCandidate[] {
  const out: GrowthSeedCandidate[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    const id = p.person_entity_id.trim();
    const name = p.display_name.trim();
    if (id.length === 0 || name.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const proposedId =
      typeof p.proposed_manager_entity_id === "string" &&
      p.proposed_manager_entity_id.trim().length > 0
        ? p.proposed_manager_entity_id.trim()
        : null;
    const proposedName =
      typeof p.proposed_manager_name === "string" &&
      p.proposed_manager_name.trim().length > 0
        ? p.proposed_manager_name.trim()
        : null;
    out.push({
      seed_type: "set_manager",
      subject_entity_id: id,
      subject_name: name,
      recommended_action:
        proposedName !== null
          ? `Confirm ${name} reports to ${proposedName}`
          : `Set a manager for ${name}`,
      source_evidence:
        proposedName !== null
          ? `${name} has no manager on file. Otzar proposes ${proposedName} from department and existing leadership — confirm or choose someone else.`
          : `${name} is an org member with no manager on the reporting structure (hierarchy scan).`,
      risk_if_ignored:
        "Reviews, ambient placement, and team routing lack a reporting home for this person.",
      proposed_manager_entity_id: proposedId,
      proposed_manager_name: proposedName,
    });
  }
  return out;
}

/**
 * Materialize org-growth structure discoveries into the governed seed queue.
 * Idempotent: skips when an open seed already exists for the same type+subject.
 * NEVER creates memberships, invites, or grants access.
 * Phase B: also lands set_manager hierarchy proposals for admin confirmation.
 */
export async function syncGrowthDiscoveriesToSeeds(args: {
  orgEntityId: string;
  adminEntityId: string;
  needs_first_project_people: Array<{
    person_entity_id: string;
    display_name: string;
  }>;
  needs_manager_people?: Array<{
    person_entity_id: string;
    display_name: string;
    proposed_manager_entity_id?: string | null;
    proposed_manager_name?: string | null;
  }>;
}): Promise<{
  ok: true;
  created: number;
  skipped_existing: number;
  seeds: OrgSeedView[];
}> {
  const planned = [
    ...planStructureSeedsFromGrowth(args.needs_first_project_people),
    ...planManagerSeedsFromGrowth(args.needs_manager_people ?? []),
  ];
  let created = 0;
  let skipped = 0;
  const fresh: OrgSeedView[] = [];

  // Load open seeds once for idempotency (not per candidate).
  const openRows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.orgEntityId,
      ledger_type: "ORG_SEEDING",
      status: { in: [...OPEN_SEED_STATUSES] },
    },
    select: { ledger_entry_id: true, details: true },
    take: 200,
  });
  const openKeys = new Set(
    openRows.map((r) => {
      const d = (r.details ?? {}) as SeedDetails;
      return `${d.seed_type ?? ""}::${d.subject_entity_id ?? ""}`;
    }),
  );

  for (const cand of planned.slice(0, 80)) {
    const key = `${cand.seed_type}::${cand.subject_entity_id}`;
    if (openKeys.has(key)) {
      skipped += 1;
      continue;
    }

    const isHierarchy = cand.seed_type === "set_manager";
    const made = await createLedgerEntry({
      org_entity_id: args.orgEntityId,
      ledger_type: "ORG_SEEDING",
      source_type: "TRANSCRIPT",
      title: cand.recommended_action,
      summary: cand.source_evidence,
      status: "SEED_PROPOSED",
      priority: "ROUTINE",
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      owner_entity_id: args.adminEntityId,
      next_action: isHierarchy
        ? "Admin confirms manager — Otzar does not write hierarchy alone"
        : "Ambient: Otzar routes placement to their manager — admin oversight only",
      evidence: [{ quote: cand.source_evidence }],
      details: {
        seed_type: cand.seed_type,
        subject_name: cand.subject_name,
        subject_entity_id: cand.subject_entity_id,
        recommended_action: cand.recommended_action,
        source_conversation_id: null,
        confidence: "high",
        approval_required: isHierarchy,
        policy_status: "needs_review",
        sensitivity: "internal",
        risk_if_ignored: cand.risk_if_ignored,
        discovery_source: isHierarchy
          ? "org_growth_hierarchy"
          : "org_growth_structure",
        ...(isHierarchy
          ? {
              proposed_manager_entity_id:
                cand.proposed_manager_entity_id ?? null,
              proposed_manager_name: cand.proposed_manager_name ?? null,
            }
          : {}),
      },
    });
    if (made.ok) {
      created += 1;
      openKeys.add(key);
      // Project gaps: ambient route to manager. Hierarchy: admin confirm only.
      if (!isHierarchy) {
        await routeStructurePlacementAmbient({
          orgEntityId: args.orgEntityId,
          subjectEntityId: cand.subject_entity_id,
          subjectName: cand.subject_name,
          seedId: made.entry.ledger_entry_id,
          actorEntityId: args.adminEntityId,
        });
      }
      const row = await prisma.workLedgerEntry.findUnique({
        where: { ledger_entry_id: made.entry.ledger_entry_id },
      });
      if (row) fresh.push(projectSeed(row as unknown as SeedRow));
    }
  }

  if (created > 0) {
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: args.adminEntityId,
      target_entity_id: args.adminEntityId,
      details: {
        action: "DANDELION_SYNC_GROWTH_TO_SEEDS",
        org_entity_id: args.orgEntityId,
        created,
        skipped_existing: skipped,
      },
    });
  }

  return { ok: true, created, skipped_existing: skipped, seeds: fresh };
}
