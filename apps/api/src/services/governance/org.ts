// FILE: org.ts
// PURPOSE: Two helpers for resolving an entity to its org and the
//          org's settings sheet. The strict variant throws so /org/*
//          and /platform/* routes can fail fast on missing-org. The
//          tolerant variant returns spec defaults so the gateway and
//          login can run safely against orgless / pre-Dandelion
//          entities (the 311 baseline tests rely on this).
// CONNECTS TO: AuthService.login (session timeout), gateway.middleware
//              (IP whitelist), every /org/* and /platform/* route
//              (org scope).

import { prisma, type OrgSettings } from "@niov/database";

// WHAT: How many EntityMembership hops getOrgEntityId will walk
//        before declaring the chain pathologically deep.
// INPUT: Used as a constant.
// OUTPUT: The number 7.
// WHY: Spec page 11 -- "Max depth 7. Throws ORG_HIERARCHY_TOO_DEEP".
//      Naming the constant means we can change the rule in one place.
export const MAX_ORG_HIERARCHY_DEPTH = 7;

// WHAT: The spec defaults for OrgSettings, used whenever an entity
//        has no org or its org has not had its OrgSettings row
//        created yet (pre-Dandelion / Section 9).
// INPUT: Used as a constant.
// OUTPUT: An OrgSettings-shaped object minus org_entity_id and
//         updated_at (which the merger fills in per call).
// WHY: This is the single source of truth for OrgSettings defaults
//      across login, the gateway, and any future /org/* code that
//      needs to know "what would the value be if no row exists".
//      Using these matches the column defaults in schema.prisma.
export const ORG_SETTINGS_DEFAULTS = Object.freeze({
  session_timeout_minutes: 480,
  mfa_required: false,
  ip_whitelist: [] as string[],
  auto_approve_low_risk: false,
  cross_dept_collab: true,
  swarm_formation: true,
  dept_data_isolation: true,
  audit_ai_actions: true,
  require_human_approval: true,
  federated_learning: true,
  track_external_entities: true,
  industry: null as string | null,
  // CAR Sub-box 2 sub-phase 2 [CAR-SUB-BOX-2-SCHEMA] per ADR-0037
  // Sub-decisions 2 + 5: organization-default jurisdictional anchor.
  // Operator-set explicit input only (no cascade — this IS the
  // cascade source for Entity.jurisdiction + MemoryCapsule.jurisdiction
  // defaulting at sub-phase 3 [CAR-SUB-BOX-2-SERVICES] register
  // substantively). Defaults to null so existing orgs without
  // operator-set jurisdiction observe no behavior change.
  default_jurisdiction: null as string | null,
}) satisfies Omit<OrgSettings, "org_entity_id" | "updated_at">;

// WHAT: The shape returned by getOrgSettingsOrDefaults -- the row
//        when present, otherwise spec defaults with org_entity_id
//        possibly null (when the entity has no org chain at all).
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Lets callers disambiguate "entity is in an org but no
//      OrgSettings row" from "entity has no org" via the
//      org_entity_id field.
export interface MergedOrgSettings {
  org_entity_id: string | null;
  session_timeout_minutes: number;
  mfa_required: boolean;
  ip_whitelist: string[];
  auto_approve_low_risk: boolean;
  cross_dept_collab: boolean;
  swarm_formation: boolean;
  dept_data_isolation: boolean;
  audit_ai_actions: boolean;
  require_human_approval: boolean;
  federated_learning: boolean;
  track_external_entities: boolean;
  industry: string | null;
  // CAR Sub-box 2 sub-phase 2 [CAR-SUB-BOX-2-SCHEMA] per ADR-0037
  // Sub-decision 2: mirror the OrgSettings.default_jurisdiction column
  // at the manually-defined merged-shape interface so callers consuming
  // MergedOrgSettings via getOrgSettingsOrDefaults observe the
  // jurisdictional anchor consistently with the schema substrate.
  default_jurisdiction: string | null;
}

// WHAT: Walk up EntityMembership from one entity, looking for a
//        COMPANY ancestor.
// INPUT: The caller's entity_id.
// OUTPUT: The org's entity_id (a COMPANY entity).
// WHY: Used by every /org/* and /platform/* route to scope the
//      caller to their org. THROWS on no-org or chain-too-deep so
//      the route can fail fast with a clear error code.
//      Errors thrown: NOT_IN_ANY_ORG, ORG_HIERARCHY_TOO_DEEP
//      (both as Error.message for simple pattern-matching).
export async function getOrgEntityId(callerEntityId: string): Promise<string> {
  // The caller might BE the org (a COMPANY entity).
  const callerEntity = await prisma.entity.findUnique({
    where: { entity_id: callerEntityId },
    select: { entity_type: true },
  });
  if (callerEntity?.entity_type === "COMPANY") {
    return callerEntityId;
  }

  let current = callerEntityId;
  for (let depth = 0; depth < MAX_ORG_HIERARCHY_DEPTH; depth++) {
    const membership = await prisma.entityMembership.findFirst({
      where: { child_id: current, is_active: true },
      select: { parent_id: true },
    });
    if (membership === null) {
      throw new Error("NOT_IN_ANY_ORG");
    }
    const parent = await prisma.entity.findUnique({
      where: { entity_id: membership.parent_id },
      select: { entity_type: true },
    });
    if (parent?.entity_type === "COMPANY") {
      return membership.parent_id;
    }
    current = membership.parent_id;
  }
  throw new Error("ORG_HIERARCHY_TOO_DEEP");
}

// WHAT: Resolve the OrgSettings for one entity, falling back to
//        spec defaults whenever any of the lookup steps would have
//        thrown.
// INPUT: The caller's entity_id.
// OUTPUT: A MergedOrgSettings -- either the live row (when found)
//         or spec defaults (when not).
// WHY: Login and the gateway IP-whitelist check both run for every
//      authenticated request. They cannot throw on orgless or
//      pre-Dandelion entities, or the 311 baseline tests would
//      regress. This helper guarantees a non-throwing read with
//      schema-default behavior whenever data is missing.
export async function getOrgSettingsOrDefaults(
  callerEntityId: string,
): Promise<MergedOrgSettings> {
  let orgEntityId: string | null = null;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch (err) {
    // Tolerate the two known walk-failure codes; let anything else
    // (e.g., DB connection issues) bubble up.
    if (
      err instanceof Error &&
      (err.message === "NOT_IN_ANY_ORG" ||
        err.message === "ORG_HIERARCHY_TOO_DEEP")
    ) {
      return { org_entity_id: null, ...ORG_SETTINGS_DEFAULTS };
    }
    throw err;
  }

  const row = await prisma.orgSettings.findUnique({
    where: { org_entity_id: orgEntityId },
  });
  if (row === null) {
    return { org_entity_id: orgEntityId, ...ORG_SETTINGS_DEFAULTS };
  }
  return {
    org_entity_id: row.org_entity_id,
    session_timeout_minutes: row.session_timeout_minutes,
    mfa_required: row.mfa_required,
    ip_whitelist: row.ip_whitelist,
    auto_approve_low_risk: row.auto_approve_low_risk,
    cross_dept_collab: row.cross_dept_collab,
    swarm_formation: row.swarm_formation,
    dept_data_isolation: row.dept_data_isolation,
    audit_ai_actions: row.audit_ai_actions,
    require_human_approval: row.require_human_approval,
    federated_learning: row.federated_learning,
    track_external_entities: row.track_external_entities,
    industry: row.industry,
    default_jurisdiction: row.default_jurisdiction,
  };
}
