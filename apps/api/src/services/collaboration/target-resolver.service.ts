// FILE: target-resolver.service.ts
// PURPOSE: Phase 1284 Wave 1 — the GENERAL governed collaboration target
//          resolver. The whole collaboration substrate (chat, voice, People
//          page, request-create) routes through this ONE primitive so
//          "who/what is the target?" always resolves into a governed target
//          object — never a hardcoded person, never a raw name shoved into a
//          UUID column. Generalizes resolveTargetInOrg (PERSON/AI_AGENT)
//          and is designed to grow into TEAM / PROJECT / ROLE / DEPARTMENT /
//          EXTERNAL_CONTACT / ORG_BROADCAST under the same contract.
// CONNECTS TO: work-os/authority-context.service.ts (resolveTargetInOrg),
//          otzar/twin-collaboration.service.ts (UUID guard), the
//          collaboration routes, and the CT chat/voice + People surfaces.
//
// GOVERNANCE: tenant-scoped — only resolves entities that are active members
// of the caller's org (RULE 0). A UUID that is NOT an in-org entity resolves
// to NOT_FOUND, never leaked. A non-UUID, non-matching string resolves to
// NOT_FOUND/AMBIGUOUS — it is NEVER passed to a UUID DB column.

import { prisma } from "@niov/database";
import { resolveTargetInOrg } from "../work-os/authority-context.service.js";

// WHAT: canonical UUID v1-v8 shape check. The single guard every caller uses
//        before a value may touch a Prisma UUID column.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

// The governed target-type vocabulary. PERSON + AI_TWIN resolve live in
// Wave 1; TEAM/PROJECT/ROLE/DEPARTMENT/EXTERNAL_CONTACT/ORG_BROADCAST are
// part of the contract now and resolve as later waves wire their lookups.
export const COLLABORATION_TARGET_TYPES = [
  "PERSON",
  "AI_TWIN",
  "TEAM",
  "PROJECT",
  "ROLE",
  "DEPARTMENT",
  "EXTERNAL_CONTACT",
  "ORG_BROADCAST",
] as const;
export type CollaborationTargetType = (typeof COLLABORATION_TARGET_TYPES)[number];

export type TargetResolutionKind =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "INVALID_ID"
  | "EMPTY";

export interface TargetCandidate {
  entity_id: string;
  display_name: string;
  role_title: string | null;
  target_type: CollaborationTargetType;
}

export interface GovernedTarget {
  kind: TargetResolutionKind;
  target_type: CollaborationTargetType | null;
  target_entity_id: string | null;
  display_name: string | null;
  role_title: string | null;
  is_external: boolean;
  candidates: TargetCandidate[];
  // Human-readable, UI-safe explanation of the resolution outcome.
  reason: string;
}

export interface ResolveTargetOptions {
  // A caller-asserted type hint (e.g. the People card knows it's a PERSON,
  // a team request knows it's a TEAM). Advisory — resolution still verifies.
  hint?: CollaborationTargetType;
}

function personType(entityType: string): CollaborationTargetType {
  return entityType === "AI_AGENT" ? "AI_TWIN" : "PERSON";
}

// WHAT: Resolve a raw target reference (a typed/voiced name OR an id) into a
//        governed target object, tenant-scoped to the caller's org.
// INPUT: org_entity_id, the raw reference, optional type hint.
// OUTPUT: GovernedTarget — RESOLVED / AMBIGUOUS / NOT_FOUND / INVALID_ID /
//         EMPTY. Never throws; never invents a person; never returns a
//         cross-org entity.
// WHY: one resolver for chat, voice, People page, and request-create so the
//      same RBAC-governed answer is produced everywhere (Phase 1284 PART 2).
export async function resolveCollaborationTarget(
  orgEntityId: string,
  raw: string,
  opts: ResolveTargetOptions = {},
): Promise<GovernedTarget> {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return {
      kind: "EMPTY",
      target_type: null,
      target_entity_id: null,
      display_name: null,
      role_title: null,
      is_external: false,
      candidates: [],
      reason: "No recipient was provided.",
    };
  }

  // Path 1 — the reference is already a UUID. Verify it is an in-org entity
  // (RULE 0) before trusting it; a UUID that is not in this org is NOT_FOUND,
  // never leaked.
  if (isUuid(value)) {
    if (value === orgEntityId) {
      return {
        kind: "RESOLVED",
        target_type: "ORG_BROADCAST",
        target_entity_id: orgEntityId,
        display_name: "The organization",
        role_title: null,
        is_external: false,
        candidates: [],
        reason: "Resolved to the organization (org-level target).",
      };
    }
    const membership = await prisma.entityMembership.findFirst({
      where: { parent_id: orgEntityId, child_id: value, is_active: true },
      select: { role_title: true, child: { select: { entity_id: true, display_name: true, entity_type: true } } },
    });
    if (membership === null) {
      return {
        kind: "NOT_FOUND",
        target_type: null,
        target_entity_id: null,
        display_name: null,
        role_title: null,
        is_external: false,
        candidates: [],
        reason: "That id is not a member of your organization.",
      };
    }
    const tt = personType(membership.child.entity_type);
    return {
      kind: "RESOLVED",
      target_type: opts.hint ?? tt,
      target_entity_id: membership.child.entity_id,
      display_name: membership.child.display_name ?? "Unknown entity",
      role_title: membership.role_title,
      is_external: false,
      candidates: [],
      reason: `Resolved ${membership.child.display_name ?? "the target"} in your organization.`,
    };
  }

  // Path 2 — the reference looks like an id but is NOT a valid UUID. NEVER
  // pass it to a UUID column (this is the Phase 1283-surfaced Prisma crash).
  // Heuristic: contains no spaces and has an id-ish shape (digits/hyphens/
  // underscores) → treat as a malformed id rather than a name.
  if (!value.includes(" ") && /[_-]/.test(value) && /\d/.test(value) && value.length > 8) {
    return {
      kind: "INVALID_ID",
      target_type: null,
      target_entity_id: null,
      display_name: null,
      role_title: null,
      is_external: false,
      candidates: [],
      reason: "That looks like an id but is not a valid identifier.",
    };
  }

  // Path 3 — resolve as a name against the org roster (PERSON/AI_AGENT).
  const res = await resolveTargetInOrg(orgEntityId, value);
  if (res.code === "NOT_FOUND") {
    return {
      kind: "NOT_FOUND",
      target_type: null,
      target_entity_id: null,
      display_name: null,
      role_title: null,
      is_external: false,
      candidates: [],
      reason: `"${value}" is not in your organization roster.`,
    };
  }
  if (res.code === "AMBIGUOUS") {
    return {
      kind: "AMBIGUOUS",
      target_type: null,
      target_entity_id: null,
      display_name: null,
      role_title: null,
      is_external: false,
      candidates: res.candidates.map((c) => ({
        entity_id: c.entity_id,
        display_name: c.display_name,
        role_title: c.role_title,
        target_type: "PERSON" as CollaborationTargetType,
      })),
      reason: `"${value}" matches more than one person — choose one.`,
    };
  }
  // RESOLVED_INTERNAL_ENTITY
  const m = res.match!;
  // Look up entity_type to discriminate PERSON vs AI_TWIN.
  const ent = await prisma.entity.findUnique({
    where: { entity_id: m.entity_id },
    select: { entity_type: true },
  });
  const tt = personType(ent?.entity_type ?? "PERSON");
  return {
    kind: "RESOLVED",
    target_type: opts.hint ?? tt,
    target_entity_id: m.entity_id,
    display_name: m.display_name,
    role_title: m.role_title,
    is_external: false,
    candidates: [],
    reason: `Resolved ${m.display_name} in your organization.`,
  };
}
