// FILE: role-template-repair.service.ts
// PURPOSE: Phase D / deep-smoke — backfill TwinConfig.role_template for
//          existing AI teammates that were provisioned with the shell label
//          "Digital Twin" (or otherwise null template). Resolves from the
//          owner's job_title / org membership role_title via the same
//          resolveRoleTemplateSlug catalog as createTwin. Idempotent; never
//          invents a template; never overwrites a non-null template unless
//          force=true.
// CONNECTS TO: role-template-resolver, AgentTemplate seed, org.ai-teammates
//              repair route, twin.service createTwin.

import { prisma, writeAuditEvent } from "@niov/database";
import { resolveRoleTemplateSlug } from "./role-template-resolver.js";

export interface RoleTemplateRepairItem {
  twin_id: string;
  owner_entity_id: string;
  owner_display_name: string | null;
  previous_role_template: string | null;
  applied_role_template: string | null;
  source: "job_title" | "org_role_title" | "unchanged" | "no_match" | "skipped_existing";
}

export interface RoleTemplateRepairResult {
  ok: true;
  org_entity_id: string;
  scanned: number;
  applied: number;
  skipped: number;
  unmatched: number;
  items: RoleTemplateRepairItem[];
}

// WHAT: Repair null/missing role templates for every twin in the org.
// WHY: Live smoke found all 8 demo twins with role_template=null because
//      membership role_title was "Digital Twin". Humans need role-aware
//      AI Teammates without re-provisioning.
export async function repairRoleTemplatesForOrg(args: {
  org_entity_id: string;
  actor_entity_id: string;
  /** When true, re-resolve even if a template is already set. */
  force?: boolean;
}): Promise<RoleTemplateRepairResult> {
  const force = args.force === true;
  const orgEntityId = args.org_entity_id;

  const orgMemberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true, role_title: true },
  });
  const memberIds = orgMemberships.map((m) => m.child_id);
  const orgRoleByMember = new Map(
    orgMemberships.map((m) => [m.child_id, m.role_title]),
  );

  const twinMemberships = await prisma.entityMembership.findMany({
    where: { parent_id: { in: memberIds }, is_active: true },
    select: { child_id: true, parent_id: true },
  });
  const twinIds = twinMemberships.map((tm) => tm.child_id);
  const ownerByTwin = new Map(
    twinMemberships.map((tm) => [tm.child_id, tm.parent_id]),
  );

  const [twins, configs, owners, profiles] = await Promise.all([
    prisma.entity.findMany({
      where: {
        entity_id: { in: twinIds },
        entity_type: "AI_AGENT",
        deleted_at: null,
      },
      select: { entity_id: true },
    }),
    prisma.twinConfig.findMany({
      where: { twin_id: { in: twinIds } },
      select: { twin_id: true, role_template: true },
    }),
    prisma.entity.findMany({
      where: {
        entity_id: { in: memberIds },
        entity_type: "PERSON",
        deleted_at: null,
      },
      select: { entity_id: true, display_name: true },
    }),
    prisma.entityProfile.findMany({
      where: { entity_id: { in: memberIds } },
      select: { entity_id: true, job_title: true },
    }),
  ]);

  const configByTwin = new Map(configs.map((c) => [c.twin_id, c]));
  const ownerNameById = new Map(owners.map((o) => [o.entity_id, o.display_name]));
  const jobByOwner = new Map(profiles.map((p) => [p.entity_id, p.job_title]));

  const items: RoleTemplateRepairItem[] = [];
  let applied = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const twin of twins) {
    const ownerId = ownerByTwin.get(twin.entity_id);
    if (ownerId === undefined) continue;
    const prev = configByTwin.get(twin.entity_id)?.role_template ?? null;
    const ownerName = ownerNameById.get(ownerId) ?? null;

    if (prev !== null && prev.length > 0 && !force) {
      skipped += 1;
      items.push({
        twin_id: twin.entity_id,
        owner_entity_id: ownerId,
        owner_display_name: ownerName,
        previous_role_template: prev,
        applied_role_template: prev,
        source: "skipped_existing",
      });
      continue;
    }

    const jobTitle = jobByOwner.get(ownerId) ?? null;
    let slug = resolveRoleTemplateSlug(jobTitle);
    let source: RoleTemplateRepairItem["source"] = "job_title";
    if (slug === null) {
      slug = resolveRoleTemplateSlug(orgRoleByMember.get(ownerId) ?? null);
      source = "org_role_title";
    }
    if (slug === null) {
      unmatched += 1;
      items.push({
        twin_id: twin.entity_id,
        owner_entity_id: ownerId,
        owner_display_name: ownerName,
        previous_role_template: prev,
        applied_role_template: null,
        source: "no_match",
      });
      continue;
    }

    const template = await prisma.agentTemplate.findFirst({
      where: {
        role_name: slug,
        OR: [{ org_entity_id: null }, { org_entity_id: orgEntityId }],
      },
      select: { role_name: true },
    });
    if (template === null) {
      unmatched += 1;
      items.push({
        twin_id: twin.entity_id,
        owner_entity_id: ownerId,
        owner_display_name: ownerName,
        previous_role_template: prev,
        applied_role_template: null,
        source: "no_match",
      });
      continue;
    }

    if (prev === template.role_name) {
      skipped += 1;
      items.push({
        twin_id: twin.entity_id,
        owner_entity_id: ownerId,
        owner_display_name: ownerName,
        previous_role_template: prev,
        applied_role_template: prev,
        source: "unchanged",
      });
      continue;
    }

    await prisma.twinConfig.update({
      where: { twin_id: twin.entity_id },
      data: { role_template: template.role_name },
    });
    applied += 1;
    items.push({
      twin_id: twin.entity_id,
      owner_entity_id: ownerId,
      owner_display_name: ownerName,
      previous_role_template: prev,
      applied_role_template: template.role_name,
      source,
    });
  }

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: orgEntityId,
    details: {
      action: "REPAIR_ROLE_TEMPLATES",
      scanned: twins.length,
      applied,
      skipped,
      unmatched,
      force,
    },
  });

  return {
    ok: true,
    org_entity_id: orgEntityId,
    scanned: twins.length,
    applied,
    skipped,
    unmatched,
    items,
  };
}
