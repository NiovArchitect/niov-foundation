// FILE: dandelion.service.ts
// PURPOSE: The four-phase Dandelion onboarding flow that bootstraps
//          a new org and propagates twin creation through the org's
//          hierarchy.
//          Phase 0 -- atomic createOrg: COMPANY entity, OrgSettings,
//                     domain vocabulary seed, default Hive, the very
//                     first admin PERSON, admin twin, initial
//                     CompoundingMetrics row. All in one big
//                     prisma.$transaction.
//          Phase 1 -- bulk member add (handled by /org/members
//                     routes; pure data-layer call, not in this
//                     file).
//          Phase 2 -- analyze: build the propagation order (admin
//                     first, then by hierarchy_level descending,
//                     then by outgoing-membership count).
//          Phase 3 -- atomic invite-accept: flip entity ACTIVE,
//                     mint the twin, increment metrics. Rolls back
//                     on any failure.
//          Phase 4 -- status read + propagation reorder.
// CONNECTS TO: createTwin (Section 9), createSystemPermission, the
//              entity / org_settings / hive / hive_memberships /
//              entity_memberships / domain_vocabulary /
//              onboarding_sessions / compounding_metrics tables,
//              writeAuditEvent (Section 1E hash chain), and
//              seedIndustryDomainTemplates.

import { randomUUID } from "node:crypto";
import { hashPassword } from "@niov/auth";
import type { Prisma } from "@prisma/client";
import {
  computeTARHash,
  createTARInTx,
  createWalletInTx,
  prisma,
  writeAudit,
  writeAuditEvent,
  writeTARCreateAudit,
  writeWalletCreateAudit,
} from "@niov/database";
import { createTwin } from "./twin.service.js";
import { seedIndustryDomainTemplates } from "./seeds.js";

// WHAT: Inputs to executePhase0 (the createOrg flow).
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Centralizes the creation contract so the POST /platform/orgs
//      route handler stays a thin shim.
export interface Phase0Input {
  company_name: string;
  industry: string | null;
  admin_email: string;
  admin_password: string;
  admin_first_name?: string | null;
  admin_last_name?: string | null;
  /**
   * The NIOV Platform Admin who triggered this createOrg. Logged in
   * the audit trail. Null is permitted for the very-first-org
   * bootstrap path (Section 14 admin tooling will close this gap).
   */
  actor_entity_id?: string | null;
}

// WHAT: Successful Phase 0 return shape.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Caller wants to display "org X created with admin Y, twin
//      Z" without re-querying the database.
export interface Phase0Result {
  org_entity_id: string;
  admin_entity_id: string;
  admin_twin_id: string;
  default_hive_id: string;
}

// WHAT: One row of the propagation_order JSON Phase 2 emits.
// INPUT: Used as a parameter / return type.
// OUTPUT: None.
// WHY: Gives the operator a stable shape to render in the Control
//      Tower's onboarding queue UI.
export interface PropagationEntry {
  entity_id: string;
  display_name: string;
  hierarchy_level: number;
  is_admin: boolean;
  reason: string;
  status: "PENDING" | "ACTIVATED";
  activated_at: string | null;
}

// WHAT: Phase 2 (analyze) return shape.
export interface Phase2Result {
  org_entity_id: string;
  mode: "HIERARCHY" | "INTELLIGENCE";
  total_users: number;
  propagation_order: PropagationEntry[];
}

// WHAT: Phase 3 (invite) return shape.
//
// 12B.0: audit_event_id is the audit_id of the
// ADMIN_ACTION (action=ONBOARDING_INVITE_ACCEPTED) row written
// inside the same transaction that mints the twin. Surfaced so
// audit-aware UI can render a clickable link from the action
// confirmation toast to the audit row in Security & Audit.
export interface Phase3Result {
  org_entity_id: string;
  entity_id: string;
  twin_id: string;
  hive_membership_id: string | null;
  activation_credential: string;
  audit_event_id: string;
}

// WHAT: Phase 4 status return shape.
export interface Phase4Status {
  org_entity_id: string;
  total_users: number;
  onboarded_count: number;
  pending_count: number;
  compound_score: number;
  propagation_order: PropagationEntry[];
}

// WHAT: Stub for AgentBoundary seeding (Section 16).
// INPUT: Transaction client and org's entity_id.
// OUTPUT: A no-op promise.
// WHY: AgentBoundary table doesn't exist yet. Kept as a stub so the
//      Phase 0 call site stays canonical; Section 16 swaps this
//      no-op for the real createMany call without changing Phase 0.
async function seedAgentBoundaries(
  tx: Prisma.TransactionClient,
  orgEntityId: string,
): Promise<void> {
  void tx;
  void orgEntityId;
  // TODO(Section 16): seed default AgentBoundary rows for the new
  // org. Use tx.agentBoundary.createMany once that model lands.
}

// WHAT: Stub for CollaborationRule seeding (Section 16).
// INPUT: Transaction client and org's entity_id.
// OUTPUT: A no-op promise.
// WHY: Same rationale as seedAgentBoundaries.
async function seedCollaborationRules(
  tx: Prisma.TransactionClient,
  orgEntityId: string,
): Promise<void> {
  void tx;
  void orgEntityId;
  // TODO(Section 16): seed default CollaborationRule rows.
}

// WHAT: Stub for ObservationConsent seeding (Section 16).
// INPUT: Transaction client and entity_id (the activating user).
// OUTPUT: A no-op promise.
// WHY: ObservationConsent rows track per-entity consent for the
//      observation pipeline; the table doesn't exist yet.
async function createObservationConsent(
  tx: Prisma.TransactionClient,
  entityId: string,
): Promise<void> {
  void tx;
  void entityId;
  // TODO(Section 16): create default ObservationConsent row.
}

// WHAT: Atomic Phase 0 -- createOrg + admin + admin twin + default
//        Hive + initial metrics, all in one prisma.$transaction.
// INPUT: A Phase0Input.
// OUTPUT: A Phase0Result on success. Throws on any failure (the
//         outer transaction rolls back atomically).
// WHY: "Half-created orgs are unacceptable" -- if the admin twin
//      fails to mint, neither the COMPANY entity nor the default
//      Hive can survive. The transaction guarantees that.
//      Order is hand-tuned: COMPANY first (other rows reference
//      its entity_id); admin LATER (Hive.created_by needs a real
//      admin entity_id, so we create the Hive AFTER the admin);
//      twin LAST (createTwin reads the default Hive and the admin's
//      EntityMembership.is_admin flag).
export async function executePhase0(input: Phase0Input): Promise<Phase0Result> {
  // bcrypt the admin password OUTSIDE the transaction -- bcrypt is
  // CPU-bound, no point holding row locks while it runs.
  const passwordHash = await hashPassword(input.admin_password);

  return prisma.$transaction(
    async (tx) => {
      const actorId = input.actor_entity_id ?? null;

      // STEP 1 -- COMPANY entity (org root). Manually inline what
      // createEntity does so wallet + TAR + audit all land inside
      // this outer transaction.
      const orgEntityId = randomUUID();
      await tx.entity.create({
        data: {
          entity_id: orgEntityId,
          entity_type: "COMPANY",
          display_name: input.company_name,
          public_key: `pk_org_${orgEntityId}`,
          status: "ACTIVE",
          clearance_level: 4,
        },
      });
      const orgWallet = await createWalletInTx(tx, {
        entity_id: orgEntityId,
        wallet_type: "ENTERPRISE",
      });
      await writeWalletCreateAudit(tx, orgWallet, actorId);
      const orgTar = await createTARInTx(tx, {
        entity_id: orgEntityId,
        entity_type: "COMPANY",
      });
      await writeTARCreateAudit(tx, orgTar, actorId);
      await writeAudit(tx, {
        action: "ENTITY_CREATE",
        entity_id: orgEntityId,
        actor_id: actorId,
        meta: {
          entity_type: "COMPANY",
          display_name: input.company_name,
          via: "dandelion_phase_0",
        },
      });

      // STEP 2 -- EntityProfile for COMPANY (display sheet).
      await tx.entityProfile.create({
        data: {
          profile_id: randomUUID(),
          entity_id: orgEntityId,
          first_name: null,
          last_name: null,
          job_title: null,
        },
      });

      // STEP 3 -- OrgSettings row at spec defaults plus the
      // industry the caller selected.
      await tx.orgSettings.create({
        data: {
          org_entity_id: orgEntityId,
          industry: input.industry,
        },
      });

      // STEP 4 + 5 -- AgentBoundary + CollaborationRule stubs.
      await seedAgentBoundaries(tx, orgEntityId);
      await seedCollaborationRules(tx, orgEntityId);

      // STEP 6 -- domain vocabulary seed for the chosen industry.
      await seedIndustryDomainTemplates(orgEntityId, input.industry, tx);

      // STEP 7 -- admin PERSON entity. Same inline pattern as the
      // COMPANY above.
      const adminEntityId = randomUUID();
      await tx.entity.create({
        data: {
          entity_id: adminEntityId,
          entity_type: "PERSON",
          display_name: `${input.admin_first_name ?? ""} ${input.admin_last_name ?? ""}`.trim() ||
            input.admin_email,
          public_key: `pk_person_${adminEntityId}`,
          email: input.admin_email,
          password_hash: passwordHash,
          status: "ACTIVE",
          clearance_level: 6,
        },
      });
      const adminWallet = await createWalletInTx(tx, {
        entity_id: adminEntityId,
        wallet_type: "PERSONAL",
      });
      await writeWalletCreateAudit(tx, adminWallet, actorId);
      const adminTar = await createTARInTx(tx, {
        entity_id: adminEntityId,
        entity_type: "PERSON",
      });
      await writeTARCreateAudit(tx, adminTar, actorId);
      await writeAudit(tx, {
        action: "ENTITY_CREATE",
        entity_id: adminEntityId,
        actor_id: actorId,
        meta: {
          entity_type: "PERSON",
          display_name: input.admin_email,
          via: "dandelion_phase_0_admin",
        },
      });

      // STEP 8 -- admin EntityProfile.
      await tx.entityProfile.create({
        data: {
          profile_id: randomUUID(),
          entity_id: adminEntityId,
          first_name: input.admin_first_name ?? null,
          last_name: input.admin_last_name ?? null,
          job_title: "Org Administrator",
        },
      });

      // STEP 9 -- EntityMembership(parent=COMPANY, child=admin)
      // with is_admin=true and hierarchy_level at the top of the
      // 0..7 ladder.
      await tx.entityMembership.create({
        data: {
          parent_id: orgEntityId,
          child_id: adminEntityId,
          role_title: "Org Administrator",
          hierarchy_level: 7,
          is_admin: true,
          is_active: true,
        },
      });

      // STEP 10 -- update the admin's TAR to grant can_admin_org.
      // Inline (no updateTARPermissions call) so the change lands
      // in this outer transaction. computeTARHash is a pure
      // function that re-derives the hash from the new fields.
      const updatedAdminPolicy = {
        can_login: adminTar.can_login,
        can_read_capsules: adminTar.can_read_capsules,
        can_write_capsules: adminTar.can_write_capsules,
        can_share_capsules: adminTar.can_share_capsules,
        can_create_hives: adminTar.can_create_hives,
        can_access_external_api: adminTar.can_access_external_api,
        can_admin_niov: adminTar.can_admin_niov,
        can_admin_org: true,
        clearance_ceiling: adminTar.clearance_ceiling,
        monetization_role: adminTar.monetization_role,
        compliance_frameworks: adminTar.compliance_frameworks,
        status: adminTar.status,
      };
      const newAdminHash = computeTARHash(updatedAdminPolicy);
      await tx.tokenAttributeRepository.update({
        where: { tar_id: adminTar.tar_id },
        data: {
          can_admin_org: true,
          tar_hash: newAdminHash,
          tar_version: { increment: 1 },
        },
      });
      await writeAudit(tx, {
        action: "TAR_PERMISSIONS_UPDATE",
        entity_id: adminEntityId,
        actor_id: actorId,
        meta: {
          tar_id: adminTar.tar_id,
          new_hash: newAdminHash,
          changed_fields: ["can_admin_org"],
          via: "dandelion_phase_0",
        },
      });

      // STEP 11 -- create the org's default-enterprise Hive.
      // Application-level uniqueness check first (matches what
      // hiveService.createHive does for non-Phase-0 callers).
      const existingDefault = await tx.hive.findFirst({
        where: {
          org_entity_id: orgEntityId,
          is_default_enterprise: true,
        },
        select: { hive_id: true },
      });
      if (existingDefault !== null) {
        throw new Error("DEFAULT_HIVE_ALREADY_EXISTS");
      }
      const defaultHiveId = randomUUID();
      await tx.hive.create({
        data: {
          hive_id: defaultHiveId,
          hive_name: `${input.company_name} -- Default Knowledge`,
          created_by: adminEntityId,
          hive_type: "ENTERPRISE",
          governance_terms: {},
          member_count: 0,
          status: "ACTIVE",
          org_entity_id: orgEntityId,
          is_default_enterprise: true,
        },
      });
      await writeAuditEvent(
        {
          event_type: "HIVE_CREATED",
          outcome: "SUCCESS",
          actor_entity_id: actorId,
          target_entity_id: adminEntityId,
          details: {
            hive_id: defaultHiveId,
            hive_type: "ENTERPRISE",
            is_default_enterprise: true,
            org_entity_id: orgEntityId,
            via: "dandelion_phase_0",
          },
        },
        tx,
      );

      // STEP 12 -- mint the admin twin. Composed inside this same
      // outer transaction via createTwin's optional tx parameter.
      // The admin twin gets EXECUTIVE_OVERRIDE autonomy, standing
      // wallet permissions on org + owner wallets, and is NOT
      // joined to the default Hive.
      const adminTwin = await createTwin(
        {
          owner_entity_id: adminEntityId,
          org_entity_id: orgEntityId,
          role_title: "Executive Twin",
          is_admin_invite: true,
          actor_entity_id: actorId,
        },
        tx,
      );

      // STEP 13 -- initial CompoundingMetrics snapshot.
      await tx.compoundingMetrics.create({
        data: {
          metric_id: randomUUID(),
          org_entity_id: orgEntityId,
          compound_score: 0,
          capsule_count: 0,
          decision_count: 0,
          pattern_count: 0,
          vocab_count: 0,
          external_count: 0,
          active_twins: 1, // admin twin
          completion_rate: 0,
        },
      });

      // STEP 14 -- summary audit event for the entire createOrg
      // operation.
      await writeAuditEvent(
        {
          event_type: "ADMIN_ACTION",
          outcome: "SUCCESS",
          actor_entity_id: actorId,
          target_entity_id: orgEntityId,
          details: {
            action: "DANDELION_PHASE_0_COMPLETE",
            org_entity_id: orgEntityId,
            admin_entity_id: adminEntityId,
            admin_twin_id: adminTwin.entity_id,
            default_hive_id: defaultHiveId,
            industry: input.industry,
          },
        },
        tx,
      );

      return {
        org_entity_id: orgEntityId,
        admin_entity_id: adminEntityId,
        admin_twin_id: adminTwin.entity_id,
        default_hive_id: defaultHiveId,
      };
    },
    {
      // Phase 0 is a long transaction (createTwin alone touches 10+
      // rows). Generous timeout so a busy Supabase tail-latency
      // tick does not abort the rollback test.
      maxWait: 30_000,
      timeout: 60_000,
    },
  );
}

// WHAT: Phase 2 -- analyze the org and produce the propagation
//        order.
// INPUT: The org's entity_id.
// OUTPUT: A Phase2Result.
// WHY: HIERARCHY MODE walks all members of the org, sorts admin
//      first, then by hierarchy_level descending. INTELLIGENCE MODE
//      requires the CONVERSATION_LEARNING capsule type which is not
//      a thing yet (Section 11), so we always pick HIERARCHY for
//      now. TODO(Section 11): swap to INTELLIGENCE when relevant
//      capsules exist.
export async function analyzePhase2(
  orgEntityId: string,
): Promise<Phase2Result> {
  // Pull every active EntityMembership under this org.
  const memberships = await prisma.entityMembership.findMany({
    where: {
      parent_id: orgEntityId,
      is_active: true,
    },
  });

  if (memberships.length === 0) {
    // Edge case: an org that hasn't bulk-imported anyone yet still
    // has its admin via the Phase 0 membership. If we got here
    // with zero rows the caller is asking before they should.
    return {
      org_entity_id: orgEntityId,
      mode: "HIERARCHY",
      total_users: 0,
      propagation_order: [],
    };
  }

  // Hydrate display names and stable PERSON-only filtering. Twins
  // (AI_AGENT children of org members) are excluded here -- they
  // get created by Phase 3 invite, not directly enqueued.
  const childIds = memberships.map((m) => m.child_id);
  const entities = await prisma.entity.findMany({
    where: { entity_id: { in: childIds }, deleted_at: null },
  });
  const entityById = new Map(entities.map((e) => [e.entity_id, e]));

  // Outgoing-membership counts: how many active children each
  // member has under THEM (i.e., their span of control). Used as a
  // tiebreaker after hierarchy_level.
  const outgoingCounts = new Map<string, number>();
  for (const cid of childIds) {
    const count = await prisma.entityMembership.count({
      where: { parent_id: cid, is_active: true },
    });
    outgoingCounts.set(cid, count);
  }

  // Status from existing OnboardingSession (so reorders are
  // sticky across analyses).
  const session = await prisma.onboardingSession.findUnique({
    where: { org_entity_id: orgEntityId },
  });
  const previousOrder =
    (session?.propagation_order as unknown as PropagationEntry[] | undefined) ??
    [];
  const statusByEntity = new Map(
    previousOrder.map((p) => [p.entity_id, { status: p.status, activated_at: p.activated_at }]),
  );

  const candidates: PropagationEntry[] = memberships
    .filter((m) => entityById.has(m.child_id))
    .filter((m) => entityById.get(m.child_id)!.entity_type === "PERSON")
    .map((m) => {
      const e = entityById.get(m.child_id)!;
      const prior = statusByEntity.get(m.child_id);
      return {
        entity_id: m.child_id,
        display_name: e.display_name,
        hierarchy_level: m.hierarchy_level,
        is_admin: m.is_admin,
        reason: m.is_admin
          ? "Org administrator (top of hierarchy)"
          : `Hierarchy level ${m.hierarchy_level}, ${outgoingCounts.get(m.child_id) ?? 0} reports`,
        status: prior?.status ?? "PENDING",
        activated_at: prior?.activated_at ?? null,
      };
    });

  candidates.sort((a, b) => {
    if (a.is_admin && !b.is_admin) return -1;
    if (!a.is_admin && b.is_admin) return 1;
    if (a.hierarchy_level !== b.hierarchy_level) {
      return b.hierarchy_level - a.hierarchy_level;
    }
    return (
      (outgoingCounts.get(b.entity_id) ?? 0) -
      (outgoingCounts.get(a.entity_id) ?? 0)
    );
  });

  // Persist the order via OnboardingSession so Phase 4 reads from
  // a single source of truth.
  await prisma.onboardingSession.upsert({
    where: { org_entity_id: orgEntityId },
    create: {
      session_id: randomUUID(),
      org_entity_id: orgEntityId,
      propagation_order: candidates as unknown as Prisma.InputJsonValue,
      total_users: candidates.length,
      onboarded_count: candidates.filter((c) => c.status === "ACTIVATED").length,
    },
    update: {
      propagation_order: candidates as unknown as Prisma.InputJsonValue,
      total_users: candidates.length,
      onboarded_count: candidates.filter((c) => c.status === "ACTIVATED").length,
    },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: null,
    target_entity_id: orgEntityId,
    details: {
      action: "DANDELION_PHASE_2_ANALYZE",
      mode: "HIERARCHY",
      total_users: candidates.length,
    },
  });

  return {
    org_entity_id: orgEntityId,
    mode: "HIERARCHY",
    total_users: candidates.length,
    propagation_order: candidates,
  };
}

// WHAT: Phase 3 -- atomic invite-accept for one entity.
// INPUT: The org's entity_id and the target entity's entity_id.
// OUTPUT: A Phase3Result on success. Throws on any failure (atomic
//         rollback).
// WHY: Activation flips the entity to ACTIVE, mints the twin, joins
//      the default Hive (standard branch), and increments metrics.
//      Half-completed activation is unsafe -- a twin without the
//      Hive membership cannot read org intelligence. So all of it
//      lives in one prisma.$transaction.
export async function executePhase3Invite(
  orgEntityId: string,
  entityId: string,
  actorEntityId: string | null = null,
): Promise<Phase3Result> {
  return prisma.$transaction(
    async (tx) => {
      // Confirm the entity belongs to this org via active
      // EntityMembership. THIS is the cross-tenant guard: an
      // attacker passing a foreign entity_id gets a 404-equivalent
      // "no pending member" error that reveals nothing about the
      // entity's existence in another org.
      const membership = await tx.entityMembership.findFirst({
        where: {
          parent_id: orgEntityId,
          child_id: entityId,
          is_active: true,
        },
      });
      if (membership === null) {
        throw new Error("PENDING_MEMBER_NOT_FOUND");
      }
      const targetEntity = await tx.entity.findUnique({
        where: { entity_id: entityId },
      });
      if (targetEntity === null) {
        throw new Error("PENDING_MEMBER_NOT_FOUND");
      }

      // STEP 1 -- flip status ACTIVE (idempotent if already ACTIVE).
      await tx.entity.update({
        where: { entity_id: entityId },
        data: { status: "ACTIVE" },
      });

      // STEP 2 -- generate activation credential. Returned to the
      // caller, NOT stored in the DB for MVP (Section 14 will tie
      // this to a one-time activation link table).
      const activationCredential = randomUUID();

      // STEP 3 -- ObservationConsent stub.
      await createObservationConsent(tx, entityId);

      // STEP 4 -- mint the twin. Branch is decided by
      // EntityMembership.is_admin -- admin invitees get an admin
      // twin (executive override), everyone else gets a standard
      // twin (joins the default Hive).
      const twin = await createTwin(
        {
          owner_entity_id: entityId,
          org_entity_id: orgEntityId,
          role_title: "Digital Twin",
          is_admin_invite: membership.is_admin,
          actor_entity_id: actorEntityId,
        },
        tx,
      );

      // STEP 5 -- update the OnboardingSession's propagation_order
      // JSON to flip this entity's status to ACTIVATED.
      const session = await tx.onboardingSession.findUnique({
        where: { org_entity_id: orgEntityId },
      });
      const order =
        (session?.propagation_order as unknown as PropagationEntry[]) ?? [];
      const now = new Date().toISOString();
      let onboardedCount = 0;
      const updatedOrder = order.map((entry) => {
        const next: PropagationEntry =
          entry.entity_id === entityId
            ? { ...entry, status: "ACTIVATED", activated_at: now }
            : entry;
        if (next.status === "ACTIVATED") onboardedCount += 1;
        return next;
      });
      if (session === null) {
        // No prior analyze run -- create the session row with this
        // single activated entry.
        await tx.onboardingSession.create({
          data: {
            session_id: randomUUID(),
            org_entity_id: orgEntityId,
            propagation_order: [
              {
                entity_id: entityId,
                display_name: targetEntity.display_name,
                hierarchy_level: membership.hierarchy_level,
                is_admin: membership.is_admin,
                reason: "Direct invite (no prior analyze)",
                status: "ACTIVATED",
                activated_at: now,
              },
            ] as unknown as Prisma.InputJsonValue,
            total_users: 1,
            onboarded_count: 1,
          },
        });
      } else {
        await tx.onboardingSession.update({
          where: { org_entity_id: orgEntityId },
          data: {
            propagation_order:
              updatedOrder as unknown as Prisma.InputJsonValue,
            onboarded_count: onboardedCount,
          },
        });
      }

      // STEP 6 -- if the entity is an admin, re-run the industry
      // domain seed. Idempotent (skipDuplicates) so this is safe.
      if (membership.is_admin) {
        const orgSettings = await tx.orgSettings.findUnique({
          where: { org_entity_id: orgEntityId },
        });
        await seedIndustryDomainTemplates(
          orgEntityId,
          orgSettings?.industry ?? null,
          tx,
        );
      }

      // STEP 7 -- audit the invite acceptance.
      // 12B.0: capture the audit row so Phase3Result surfaces
      // audit_event_id for audit-aware UI clickability on the
      // POST /org/onboarding/invite response.
      const inviteAudit = await writeAuditEvent(
        {
          event_type: "ADMIN_ACTION",
          outcome: "SUCCESS",
          actor_entity_id: actorEntityId,
          target_entity_id: entityId,
          details: {
            action: "ONBOARDING_INVITE_ACCEPTED",
            org_entity_id: orgEntityId,
            twin_id: twin.entity_id,
            is_admin_twin: twin.is_admin_twin,
            default_hive_membership_id: twin.default_hive_membership_id,
          },
        },
        tx,
      );

      // STEP 8 -- bump CompoundingMetrics.active_twins (latest row).
      const latestMetric = await tx.compoundingMetrics.findFirst({
        where: { org_entity_id: orgEntityId },
        orderBy: { measured_at: "desc" },
      });
      if (latestMetric !== null) {
        await tx.compoundingMetrics.update({
          where: { metric_id: latestMetric.metric_id },
          data: { active_twins: { increment: 1 } },
        });
      }

      return {
        org_entity_id: orgEntityId,
        entity_id: entityId,
        twin_id: twin.entity_id,
        hive_membership_id: twin.default_hive_membership_id,
        activation_credential: activationCredential,
        audit_event_id: inviteAudit.audit_id,
      };
    },
    {
      maxWait: 30_000,
      timeout: 60_000,
    },
  );
}

// WHAT: Phase 4 -- read the current onboarding status for an org.
// INPUT: The org's entity_id.
// OUTPUT: A Phase4Status.
// WHY: Control Tower polls this for the live onboarding queue. No
//      audit write because reads happen on every refresh.
export async function getPhase4Status(
  orgEntityId: string,
): Promise<Phase4Status> {
  const session = await prisma.onboardingSession.findUnique({
    where: { org_entity_id: orgEntityId },
  });
  const order =
    (session?.propagation_order as unknown as PropagationEntry[]) ?? [];
  const total = session?.total_users ?? order.length;
  const onboarded = session?.onboarded_count ?? 0;
  const latestMetric = await prisma.compoundingMetrics.findFirst({
    where: { org_entity_id: orgEntityId },
    orderBy: { measured_at: "desc" },
  });
  return {
    org_entity_id: orgEntityId,
    total_users: total,
    onboarded_count: onboarded,
    pending_count: Math.max(total - onboarded, 0),
    compound_score: latestMetric?.compound_score ?? 0,
    propagation_order: order,
  };
}

// WHAT: Phase 4 -- reorder the propagation queue.
// INPUT: The org's entity_id and the new propagation order (caller
//        provides the same JSON shape Phase 2 emitted, possibly
//        re-sorted).
// OUTPUT: The persisted Phase4Status.
// WHY: Operators sometimes want to bring a specific person up the
//      queue ("activate the head of finance first"). This route
//      gives them that capability without re-running the full
//      analyze.
export async function reorderPhase4(
  orgEntityId: string,
  newOrder: PropagationEntry[],
): Promise<Phase4Status> {
  const onboardedCount = newOrder.filter((p) => p.status === "ACTIVATED")
    .length;
  await prisma.onboardingSession.upsert({
    where: { org_entity_id: orgEntityId },
    create: {
      session_id: randomUUID(),
      org_entity_id: orgEntityId,
      propagation_order: newOrder as unknown as Prisma.InputJsonValue,
      total_users: newOrder.length,
      onboarded_count: onboardedCount,
    },
    update: {
      propagation_order: newOrder as unknown as Prisma.InputJsonValue,
      total_users: newOrder.length,
      onboarded_count: onboardedCount,
    },
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: null,
    target_entity_id: orgEntityId,
    details: {
      action: "DANDELION_PHASE_4_REORDER",
      total_users: newOrder.length,
    },
  });
  return getPhase4Status(orgEntityId);
}
