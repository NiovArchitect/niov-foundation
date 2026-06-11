// FILE: ai-employee.service.ts
// PURPOSE: Phase 1240 — AI Employee provisioning + boundaries. An AI
//          Employee is the ADR-0046 "Enterprise AI Agent" context
//          made first-class: an AI_AGENT entity owned by the ORG
//          (EntityMembership parent = COMPANY) with an ENTERPRISE
//          wallet — which is exactly what the Phase 1228 DMW Registry
//          already projects as DMW type AI_EMPLOYEE.
//
//          Boundaries hold BY CONSTRUCTION (no new enforcement code —
//          the RULE 0 substrate applies automatically):
//          - TAR clearance_ceiling = 2 (AI_AGENT default; tar.ts:105)
//          - ENTERPRISE wallet ⇒ niov_can_access_contents = false
//          - AI cannot grant to AI; AI grantors default SESSION_ONLY
//          - sovereignty cap: AI cannot raise another AI's ceiling
//          - autonomy APPROVAL_REQUIRED with a HUMAN approver — the
//            provisioning admin — so nothing executes ungoverned.
//
// GOVERNANCE POSTURE:
//   - Provision + deactivate are org-admin gated (clearance >= 4,
//     Phase 1230 convention).
//   - Deactivation suspends the entity AND revokes every ACTIVE
//     TwinAuthorityGrant where the AI Employee is the grantee — a
//     one-action authority kill switch (RULE 0 revocability).
//   - Audit before response on every transition (RULE 4): the
//     ENTITY_REGISTERED / ENTITY_SUSPENDED literals with
//     details.action discriminators (AI_EMPLOYEE_PROVISIONED /
//     AI_EMPLOYEE_DEACTIVATED) — no new literals needed.
//
// CONNECTS TO:
//   - apps/api/src/services/governance/twin.service.ts (the
//     provisioning pattern this mirrors, swapped to the Enterprise
//     context per ADR-0046 canonical signals: explicit wallet_type +
//     EntityMembership parent = org)
//   - apps/api/src/services/dmw/dmw-registry.service.ts (projects
//     these entities as AI_EMPLOYEE DMWs)
//   - apps/api/src/routes/otzar-ai-employees.routes.ts
//   - tests/integration/ai-employee.test.ts

import { randomUUID } from "node:crypto";
import {
  createTARInTx,
  createWalletInTx,
  prisma,
  writeAuditEvent,
  writeTARCreateAudit,
  writeWalletCreateAudit,
} from "@niov/database";
import { getOrgEntityId } from "./org.js";

type Failure = { ok: false; code: string; message?: string };

export interface AiEmployeeView {
  entity_id: string;
  display_name: string;
  role_title: string;
  status: string;
  dmw_type: "AI_EMPLOYEE";
  autonomy_level: string;
  /** Display name of the human approver — never a raw id. */
  approver_display_name: string | null;
  active_grants_count: number;
  created_at: string;
}

const ROLE_TITLE_MAX = 80;

async function requireOrgAdmin(
  callerEntityId: string,
): Promise<{ ok: true; orgEntityId: string } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const caller = await prisma.entity.findUnique({
    where: { entity_id: callerEntityId },
    select: { clearance_level: true },
  });
  if (caller === null || caller.clearance_level < 4) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  return { ok: true, orgEntityId };
}

// ─── provision ───────────────────────────────────────────────

export async function provisionAiEmployeeForCaller(input: {
  callerEntityId: string;
  roleTitle: string;
  displayName?: string;
}): Promise<{ ok: true; ai_employee: AiEmployeeView } | Failure> {
  const gate = await requireOrgAdmin(input.callerEntityId);
  if (gate.ok === false) return gate;
  const orgEntityId = gate.orgEntityId;

  const roleTitle = input.roleTitle.trim().slice(0, ROLE_TITLE_MAX);
  if (roleTitle.length === 0) {
    return { ok: false, code: "ROLE_TITLE_REQUIRED" };
  }

  // One AI Employee per (org, role_title) — same uniqueness invariant
  // as twins, scoped to the org parent.
  const existing = await prisma.entityMembership.findFirst({
    where: {
      parent_id: orgEntityId,
      role_title: roleTitle,
      is_active: true,
    },
    select: { child_id: true },
  });
  if (existing !== null) {
    const child = await prisma.entity.findUnique({
      where: { entity_id: existing.child_id },
      select: { entity_type: true },
    });
    if (child?.entity_type === "AI_AGENT") {
      return { ok: false, code: "AI_EMPLOYEE_ALREADY_EXISTS" };
    }
  }

  const displayName =
    input.displayName !== undefined && input.displayName.trim() !== ""
      ? input.displayName.trim()
      : `AI Employee — ${roleTitle}`;

  const aiEntityId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.entity.create({
      data: {
        entity_id: aiEntityId,
        entity_type: "AI_AGENT",
        display_name: displayName,
        public_key: `pk_ai_employee_${aiEntityId}`,
        status: "ACTIVE",
        // RULE 0: lowest runtime clearance; the TAR ceiling (2 for
        // AI_AGENT) caps anything above it regardless.
        clearance_level: 0,
      },
    });
    // ADR-0046 Enterprise AI Agent context: EXPLICIT ENTERPRISE
    // wallet (canonical context-resolution signal #1).
    const wallet = await createWalletInTx(tx, {
      entity_id: aiEntityId,
      wallet_type: "ENTERPRISE",
    });
    await writeWalletCreateAudit(tx, wallet, input.callerEntityId);
    const tar = await createTARInTx(tx, {
      entity_id: aiEntityId,
      entity_type: "AI_AGENT",
    });
    await writeTARCreateAudit(tx, tar, input.callerEntityId);
    // Canonical signal #2: EntityMembership parent = the ORG.
    await tx.entityMembership.create({
      data: {
        parent_id: orgEntityId,
        child_id: aiEntityId,
        role_title: roleTitle,
        is_active: true,
        is_admin: false,
      },
    });
    // Approval gate: APPROVAL_REQUIRED autonomy with the provisioning
    // admin as the HUMAN approver. Nothing executes ungoverned.
    await tx.twinConfig.create({
      data: {
        twin_id: aiEntityId,
        autonomy_level: "APPROVAL_REQUIRED",
        approver_entity_id: input.callerEntityId,
      },
    });
    await writeAuditEvent(
      {
        event_type: "ENTITY_REGISTERED",
        outcome: "SUCCESS",
        actor_entity_id: input.callerEntityId,
        target_entity_id: aiEntityId,
        details: {
          action: "AI_EMPLOYEE_PROVISIONED",
          org_entity_id: orgEntityId,
          role_title: roleTitle,
          wallet_type: "ENTERPRISE",
          autonomy_level: "APPROVAL_REQUIRED",
        },
      },
      tx,
    );
  });

  const view = await projectView(aiEntityId, orgEntityId);
  if (view === null) return { ok: false, code: "PROVISION_FAILED" };
  return { ok: true, ai_employee: view };
}

// ─── list ────────────────────────────────────────────────────

export async function listAiEmployeesForCaller(
  callerEntityId: string,
): Promise<{ ok: true; ai_employees: AiEmployeeView[] } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true },
  });
  const ids = memberships.map((m) => m.child_id);
  if (ids.length === 0) return { ok: true, ai_employees: [] };
  const candidates = await prisma.entity.findMany({
    where: { entity_id: { in: ids }, entity_type: "AI_AGENT" },
    select: { entity_id: true },
  });
  const views: AiEmployeeView[] = [];
  for (const c of candidates) {
    const view = await projectView(c.entity_id, orgEntityId);
    // Only ENTERPRISE-wallet AI agents are AI Employees; personal
    // twins (PERSONAL wallet) are excluded by projectView.
    if (view !== null) views.push(view);
  }
  views.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return { ok: true, ai_employees: views };
}

// ─── deactivate (the kill switch) ────────────────────────────

export async function deactivateAiEmployeeForCaller(input: {
  callerEntityId: string;
  aiEmployeeEntityId: string;
}): Promise<
  | { ok: true; entity_id: string; revoked_grants_count: number }
  | Failure
> {
  const gate = await requireOrgAdmin(input.callerEntityId);
  if (gate.ok === false) return gate;
  const orgEntityId = gate.orgEntityId;

  // The target must be an AI Employee of THIS org (no existence
  // oracle for cross-org probes).
  const view = await projectView(input.aiEmployeeEntityId, orgEntityId);
  if (view === null) {
    return { ok: false, code: "AI_EMPLOYEE_NOT_FOUND" };
  }
  if (view.status === "SUSPENDED") {
    return { ok: false, code: "ALREADY_DEACTIVATED" };
  }

  const revokedAt = new Date();
  let revokedCount = 0;
  await prisma.$transaction(async (tx) => {
    await tx.entity.update({
      where: { entity_id: input.aiEmployeeEntityId },
      data: { status: "SUSPENDED" },
    });
    const revoked = await tx.twinAuthorityGrant.updateMany({
      where: {
        grantee_entity_id: input.aiEmployeeEntityId,
        state: "ACTIVE",
      },
      data: {
        state: "REVOKED",
        revoked_at: revokedAt,
        revoked_by_entity_id: input.callerEntityId,
      },
    });
    revokedCount = revoked.count;
    await writeAuditEvent(
      {
        event_type: "ENTITY_SUSPENDED",
        outcome: "SUCCESS",
        actor_entity_id: input.callerEntityId,
        target_entity_id: input.aiEmployeeEntityId,
        details: {
          action: "AI_EMPLOYEE_DEACTIVATED",
          org_entity_id: orgEntityId,
          revoked_grants_count: revokedCount,
        },
      },
      tx,
    );
  });

  return {
    ok: true,
    entity_id: input.aiEmployeeEntityId,
    revoked_grants_count: revokedCount,
  };
}

// ─── safe projection ─────────────────────────────────────────

async function projectView(
  entityId: string,
  orgEntityId: string,
): Promise<AiEmployeeView | null> {
  const entity = await prisma.entity.findUnique({
    where: { entity_id: entityId },
    select: {
      entity_id: true,
      entity_type: true,
      display_name: true,
      status: true,
      created_at: true,
    },
  });
  if (entity === null || entity.entity_type !== "AI_AGENT") return null;

  // Must belong to THIS org.
  const membership = await prisma.entityMembership.findFirst({
    where: { parent_id: orgEntityId, child_id: entityId, is_active: true },
    select: { role_title: true },
  });
  if (membership === null) return null;

  // The AI_EMPLOYEE discriminator: ENTERPRISE wallet (ADR-0046).
  const wallet = await prisma.wallet.findFirst({
    where: { entity_id: entityId },
    select: { wallet_type: true },
  });
  if (wallet === null || wallet.wallet_type !== "ENTERPRISE") return null;

  const config = await prisma.twinConfig.findUnique({
    where: { twin_id: entityId },
    select: { autonomy_level: true, approver_entity_id: true },
  });
  let approverName: string | null = null;
  if (config?.approver_entity_id != null) {
    const approver = await prisma.entity.findUnique({
      where: { entity_id: config.approver_entity_id },
      select: { display_name: true },
    });
    approverName = approver?.display_name ?? null;
  }
  const grants = await prisma.twinAuthorityGrant.count({
    where: { grantee_entity_id: entityId, state: "ACTIVE" },
  });

  return {
    entity_id: entity.entity_id,
    display_name: entity.display_name,
    role_title: membership.role_title ?? "AI Employee",
    status: entity.status,
    dmw_type: "AI_EMPLOYEE",
    autonomy_level: config?.autonomy_level ?? "APPROVAL_REQUIRED",
    approver_display_name: approverName,
    active_grants_count: grants,
    created_at: entity.created_at.toISOString(),
  };
}
