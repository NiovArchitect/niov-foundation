// FILE: onboarding.service.ts
// PURPOSE: Phase 1230 — production onboarding / admin readiness
//          orchestrator. Computes the current checklist state by
//          inspecting existing substrate (Entity / EntityMembership /
//          ActionPolicy / OrgSettings / ConnectorBinding) +
//          persists explicit step-completion timestamps in
//          OrgOnboardingState.
//
//          Output is a structured checklist: every step has a
//          status ("PENDING" / "READY" / "MISSING_KEYS" /
//          "ATTENTION") + a human-readable summary + optional
//          action_required text.
//
// PRIVACY (RULE 0):
//   - Only org admins see the full checklist for their org.
//   - Connector status reports counts + missing-key flags, never
//     credential material.

import { writeAuditEvent } from "@niov/database";
import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import { listSTTProviderStatuses } from "../voice/stt-provider.js";

export type OnboardingStepStatus = "PENDING" | "READY" | "MISSING_KEYS" | "ATTENTION";

export interface OnboardingStep {
  step_id: string;
  label: string;
  status: OnboardingStepStatus;
  summary: string;
  completed_at: string | null;
  action_required?: string;
}

export interface OnboardingChecklist {
  org_entity_id: string;
  mode: "DEMO" | "PRODUCTION";
  ready_for_production_at: string | null;
  steps: OnboardingStep[];
  /** Forward facts the admin should see. */
  facts: {
    total_members: number;
    admin_members: number;
    role_archetypes_assigned: number;
    action_policies_configured: number;
    connector_bindings: number;
    stt_providers_available: number;
    stt_providers_missing_keys: number;
    has_open_audit_chain: boolean;
    schema_migration_state:
      | "LOCAL_ONLY"
      | "PROD_MIGRATION_ACKNOWLEDGED"
      | "PROD_MIGRATION_APPLIED";
  };
}

// ─── load / upsert helpers ────────────────────────────────────

async function loadOrCreateState(orgEntityId: string): Promise<{
  mode: "DEMO" | "PRODUCTION";
  org_created_at: Date | null;
  admins_invited_at: Date | null;
  roles_assigned_at: Date | null;
  role_archetypes_assigned_at: Date | null;
  action_policy_configured_at: Date | null;
  connector_status_reviewed_at: Date | null;
  dmw_defaults_configured_at: Date | null;
  cosmp_defaults_configured_at: Date | null;
  demo_seed_loaded_at: Date | null;
  prod_schema_migration_acknowledged_at: Date | null;
  ready_for_production_at: Date | null;
}> {
  const row = await prisma.orgOnboardingState.upsert({
    where: { org_entity_id: orgEntityId },
    update: {},
    create: { org_entity_id: orgEntityId, mode: "DEMO" },
  });
  return row;
}

// ─── service: get checklist ──────────────────────────────────

export async function getOnboardingChecklistForCaller(
  callerEntityId: string,
): Promise<
  | { ok: true; checklist: OnboardingChecklist }
  | { ok: false; code: string }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const state = await loadOrCreateState(orgEntityId);

  // Compute "live" facts from existing substrate.
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true },
  });
  const memberIds = memberships.map((m) => m.child_id);
  const persons = await prisma.entity.findMany({
    where: {
      entity_id: { in: memberIds },
      entity_type: "PERSON",
      status: "ACTIVE",
    },
    select: { entity_id: true, clearance_level: true },
  });
  const adminMembers = persons.filter((p) => p.clearance_level >= 4).length;
  const actionPolicies = await prisma.actionPolicy.count({
    where: { org_entity_id: orgEntityId },
  });
  const connectorBindings = await prisma.connectorBinding.count({
    where: { org_entity_id: orgEntityId },
  });
  const sttProviders = listSTTProviderStatuses();
  const sttAvailable = sttProviders.filter(
    (p) => p.status === "CONFIGURED" || p.status === "DEMO_ONLY",
  ).length;
  const sttMissingKeys = sttProviders.filter(
    (p) => p.status === "MISSING_CREDENTIAL",
  ).length;
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { org_entity_id: orgEntityId },
  });
  const recentAudit = await prisma.auditEvent.count({
    where: {
      OR: [
        { actor_entity_id: { in: memberIds } },
        { target_entity_id: { in: memberIds } },
      ],
      timestamp: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    },
  });

  function step(args: {
    step_id: string;
    label: string;
    completed_at: Date | null;
    auto_ready: boolean;
    summary_pending: string;
    summary_ready: string;
    summary_attention?: string;
    attention?: boolean;
    missing_keys?: boolean;
    action_required?: string;
  }): OnboardingStep {
    let status: OnboardingStepStatus = "PENDING";
    if (args.missing_keys === true) status = "MISSING_KEYS";
    else if (args.attention === true) status = "ATTENTION";
    else if (args.completed_at !== null || args.auto_ready) status = "READY";
    const result: OnboardingStep = {
      step_id: args.step_id,
      label: args.label,
      status,
      summary:
        status === "READY"
          ? args.summary_ready
          : status === "ATTENTION"
            ? args.summary_attention ?? args.summary_pending
            : args.summary_pending,
      completed_at: args.completed_at?.toISOString() ?? null,
    };
    if (args.action_required !== undefined) {
      result.action_required = args.action_required;
    }
    return result;
  }

  const steps: OnboardingStep[] = [];
  steps.push(
    step({
      step_id: "ORG_CREATED",
      label: "Organization created",
      completed_at: state.org_created_at,
      auto_ready: true, // org exists if we got here
      summary_pending: "Create the organization in NIOV.",
      summary_ready: `Org ${orgEntityId.slice(0, 8)}… is active.`,
    }),
  );
  steps.push(
    step({
      step_id: "ADMINS_INVITED",
      label: "Admins invited",
      completed_at: state.admins_invited_at,
      auto_ready: adminMembers >= 1,
      summary_pending:
        "Invite at least one admin (clearance_level ≥ 4) into the org.",
      summary_ready: `${adminMembers} admin${adminMembers === 1 ? "" : "s"} active in the org.`,
    }),
  );
  steps.push(
    step({
      step_id: "ROLES_ASSIGNED",
      label: "Roles assigned to teammates",
      completed_at: state.roles_assigned_at,
      auto_ready: persons.length >= 2,
      summary_pending:
        "Add teammates and assign role labels (Founder / Tech Lead / Compliance / etc.).",
      summary_ready: `${persons.length} teammates have roles configured.`,
    }),
  );
  steps.push(
    step({
      step_id: "ROLE_ARCHETYPES_ASSIGNED",
      label: "Role archetypes mapped",
      completed_at: state.role_archetypes_assigned_at,
      auto_ready: state.role_archetypes_assigned_at !== null,
      summary_pending:
        "Map each teammate to one of the 13 role archetypes (CTO / CMO / etc.).",
      summary_ready: "Role archetypes are assigned.",
    }),
  );
  steps.push(
    step({
      step_id: "ACTION_POLICY_CONFIGURED",
      label: "Approval policy configured",
      completed_at: state.action_policy_configured_at,
      auto_ready: actionPolicies >= 1,
      summary_pending: "Configure approval thresholds in the action policy.",
      summary_ready: `${actionPolicies} action policies configured.`,
    }),
  );
  steps.push(
    step({
      step_id: "CONNECTOR_STATUS_REVIEWED",
      label: "Connector status reviewed",
      completed_at: state.connector_status_reviewed_at,
      auto_ready: connectorBindings >= 1 || state.connector_status_reviewed_at !== null,
      summary_pending:
        "Decide which external connectors (Google / Slack / Zoom / Email) the org will use.",
      summary_ready: `${connectorBindings} connector bindings registered.`,
      missing_keys: sttMissingKeys > 0,
      action_required:
        sttMissingKeys > 0
          ? `STT providers missing credentials: ${sttMissingKeys}. Configure or use DEMO_FIXTURE.`
          : undefined,
    }),
  );
  steps.push(
    step({
      step_id: "DMW_DEFAULTS_CONFIGURED",
      label: "DMW defaults configured",
      completed_at: state.dmw_defaults_configured_at,
      auto_ready: orgSettings !== null,
      summary_pending: "Set DMW defaults — consent posture, scope, retention.",
      summary_ready: "DMW defaults are configured.",
    }),
  );
  steps.push(
    step({
      step_id: "COSMP_DEFAULTS_CONFIGURED",
      label: "COSMP memory defaults configured",
      completed_at: state.cosmp_defaults_configured_at,
      auto_ready: orgSettings !== null,
      summary_pending:
        "Set memory defaults — sensitivity floor, mutation policy, TTL.",
      summary_ready: "COSMP memory defaults are configured.",
    }),
  );
  steps.push(
    step({
      step_id: "PROD_SCHEMA_MIGRATION_ACKNOWLEDGED",
      label: "Production schema migration acknowledged",
      completed_at: state.prod_schema_migration_acknowledged_at,
      auto_ready: state.prod_schema_migration_acknowledged_at !== null,
      summary_pending:
        "Production Supabase needs the additive Phase 1221 + 1222 + 1223 + 1230 schema. Push via `npx prisma db push` against prod credentials.",
      summary_ready: "Production schema migration acknowledged by an admin.",
    }),
  );
  steps.push(
    step({
      step_id: "DEMO_SEED_LOADED",
      label: "Demo seed data loaded (DEMO mode only)",
      completed_at: state.demo_seed_loaded_at,
      auto_ready: state.demo_seed_loaded_at !== null || state.mode === "PRODUCTION",
      summary_pending:
        "In DEMO mode, load the canonical demo dataset (Launch Collaboration + MICE Event).",
      summary_ready:
        state.mode === "PRODUCTION"
          ? "Production mode — demo seed is intentionally not loaded."
          : "Demo seed loaded.",
    }),
  );
  steps.push(
    step({
      step_id: "READY_FOR_PRODUCTION",
      label: "Ready for production handoff",
      completed_at: state.ready_for_production_at,
      auto_ready: state.ready_for_production_at !== null,
      summary_pending: "Complete the previous steps before flipping the org to PRODUCTION mode.",
      summary_ready: "Org is ready for production handoff.",
    }),
  );

  return {
    ok: true,
    checklist: {
      org_entity_id: orgEntityId,
      mode: state.mode,
      ready_for_production_at: state.ready_for_production_at?.toISOString() ?? null,
      steps,
      facts: {
        total_members: persons.length,
        admin_members: adminMembers,
        role_archetypes_assigned:
          state.role_archetypes_assigned_at !== null ? persons.length : 0,
        action_policies_configured: actionPolicies,
        connector_bindings: connectorBindings,
        stt_providers_available: sttAvailable,
        stt_providers_missing_keys: sttMissingKeys,
        has_open_audit_chain: recentAudit > 0,
        schema_migration_state:
          state.prod_schema_migration_acknowledged_at !== null
            ? "PROD_MIGRATION_ACKNOWLEDGED"
            : "LOCAL_ONLY",
      },
    },
  };
}

// ─── service: complete a step ────────────────────────────────

export type OnboardingStepId =
  | "ORG_CREATED"
  | "ADMINS_INVITED"
  | "ROLES_ASSIGNED"
  | "ROLE_ARCHETYPES_ASSIGNED"
  | "ACTION_POLICY_CONFIGURED"
  | "CONNECTOR_STATUS_REVIEWED"
  | "DMW_DEFAULTS_CONFIGURED"
  | "COSMP_DEFAULTS_CONFIGURED"
  | "DEMO_SEED_LOADED"
  | "PROD_SCHEMA_MIGRATION_ACKNOWLEDGED"
  | "READY_FOR_PRODUCTION";

const STEP_TO_COLUMN: Record<OnboardingStepId, string> = {
  ORG_CREATED: "org_created_at",
  ADMINS_INVITED: "admins_invited_at",
  ROLES_ASSIGNED: "roles_assigned_at",
  ROLE_ARCHETYPES_ASSIGNED: "role_archetypes_assigned_at",
  ACTION_POLICY_CONFIGURED: "action_policy_configured_at",
  CONNECTOR_STATUS_REVIEWED: "connector_status_reviewed_at",
  DMW_DEFAULTS_CONFIGURED: "dmw_defaults_configured_at",
  COSMP_DEFAULTS_CONFIGURED: "cosmp_defaults_configured_at",
  DEMO_SEED_LOADED: "demo_seed_loaded_at",
  PROD_SCHEMA_MIGRATION_ACKNOWLEDGED:
    "prod_schema_migration_acknowledged_at",
  READY_FOR_PRODUCTION: "ready_for_production_at",
};

export async function completeOnboardingStepForCaller(input: {
  callerEntityId: string;
  step: OnboardingStepId;
}): Promise<
  | { ok: true; checklist: OnboardingChecklist }
  | { ok: false; code: string }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  // Admin gate: caller must have clearance_level >= 4.
  const caller = await prisma.entity.findUnique({
    where: { entity_id: input.callerEntityId },
    select: { clearance_level: true },
  });
  if (caller === null || caller.clearance_level < 4) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  const column = STEP_TO_COLUMN[input.step];
  await loadOrCreateState(orgEntityId);
  await prisma.orgOnboardingState.update({
    where: { org_entity_id: orgEntityId },
    data: {
      [column]: new Date(),
      updated_by_entity_id: input.callerEntityId,
    } as Record<string, unknown>,
  });
  const event_type =
    input.step === "READY_FOR_PRODUCTION"
      ? "ONBOARDING_READY_FOR_PRODUCTION"
      : "ONBOARDING_STEP_COMPLETED";
  await writeAuditEvent({
    event_type,
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      org_entity_id: orgEntityId,
      step_name: input.step,
    },
  });
  return getOnboardingChecklistForCaller(input.callerEntityId);
}

// ─── service: set mode (DEMO ↔ PRODUCTION) ───────────────────

export async function setOnboardingModeForCaller(input: {
  callerEntityId: string;
  mode: "DEMO" | "PRODUCTION";
}): Promise<
  | { ok: true; checklist: OnboardingChecklist }
  | { ok: false; code: string }
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const caller = await prisma.entity.findUnique({
    where: { entity_id: input.callerEntityId },
    select: { clearance_level: true },
  });
  if (caller === null || caller.clearance_level < 4) {
    return { ok: false, code: "ADMIN_REQUIRED" };
  }
  await loadOrCreateState(orgEntityId);
  await prisma.orgOnboardingState.update({
    where: { org_entity_id: orgEntityId },
    data: {
      mode: input.mode,
      updated_by_entity_id: input.callerEntityId,
    },
  });
  await writeAuditEvent({
    event_type: "ONBOARDING_MODE_CHANGED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      org_entity_id: orgEntityId,
      mode: input.mode,
    },
  });
  return getOnboardingChecklistForCaller(input.callerEntityId);
}
