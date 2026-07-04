// FILE: external-collaborator-identity.service.ts
// PURPOSE: [T-3B] Governed dedupe for external collaborators — reduce
//          redundancy WITHOUT false confidence. Matching order (all
//          org-scoped, active records only):
//            1. exact EMAIL identifier match (human-provided evidence) —
//             reuse, even across differing display names;
//            2. legacy email COLUMN exact match — reuse + backfill the
//             identifier row;
//            3. VERIFIED MANUAL_ALIAS exact match (admin-approved) — reuse;
//             an unverified alias never matches;
//            4. exact display-name match — reuse ONLY when there is exactly
//             one active match AND the account context is consistent
//             (existing has no account link, or the candidate's company
//             normalizes to the same account, or the candidate carries no
//             company). Same name + a DIFFERENT account = a different
//             person: create-new, never merge ("possible match — review"
//             is Option B's future affordance).
//          Ambiguity (multiple matches) refuses to decide: no match
//          returned. Revoked/deleted records never match. Cross-org can
//          never match (every query is org-keyed).
// CONNECTS TO: external-collaborator.service.ts (track path),
//          dandelion-seed.service.ts (promotion path),
//          external-organization.service.ts (normalizeOrgName),
//          tests/integration/external-collaborator-identity.test.ts.

import { prisma } from "@niov/database";
import type { ExternalCollaborator } from "@prisma/client";
import { normalizeOrgName } from "./external-organization.service.js";

const IDENTIFIER_TYPES = new Set([
  "EMAIL", "SLACK_USER", "ZOOM_PARTICIPANT", "CALENDAR_ATTENDEE",
  "MANUAL_ALIAS", "PHONE", "OTHER",
]);

export function normalizeIdentifierValue(type: string, value: string): string {
  const v = value.trim().toLowerCase();
  if (type === "MANUAL_ALIAS") return normalizeOrgName(v); // whitespace-collapsed name
  return v;
}

export type CollaboratorMatch =
  | { matched: true; collaborator: ExternalCollaborator; matched_by: "email_identifier" | "email_column" | "verified_alias" | "name_governed" }
  | { matched: false; ambiguous: boolean };

// WHAT: find the ONE safe existing collaborator for a governed candidate.
export async function findExistingCollaboratorMatch(args: {
  org_entity_id: string;
  display_name: string;
  email?: string | null;
  company_label?: string | null;
}): Promise<CollaboratorMatch> {
  const org = args.org_entity_id;

  // 1-2. Email evidence (identifier row, then legacy column).
  const email =
    typeof args.email === "string" && args.email.includes("@")
      ? args.email.trim().toLowerCase()
      : null;
  if (email !== null) {
    const viaIdentifier = await prisma.externalCollaboratorIdentifier.findFirst({
      where: {
        org_entity_id: org,
        identifier_type: "EMAIL",
        identifier_value_normalized: email,
        deleted_at: null,
        external_collaborator: { deleted_at: null },
      },
      include: { external_collaborator: true },
    });
    if (viaIdentifier !== null) {
      return { matched: true, collaborator: viaIdentifier.external_collaborator, matched_by: "email_identifier" };
    }
    const viaColumn = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: org, email: { equals: email, mode: "insensitive" }, deleted_at: null },
    });
    if (viaColumn !== null) {
      await recordCollaboratorIdentifier({
        org_entity_id: org,
        external_collaborator_id: viaColumn.external_collaborator_id,
        identifier_type: "EMAIL",
        identifier_value: email,
        confidence: "high",
        source_system: "legacy_email_backfill",
      });
      return { matched: true, collaborator: viaColumn, matched_by: "email_column" };
    }
  }

  // 3. Admin-verified alias (an unverified alias never matches).
  const aliasKey = normalizeIdentifierValue("MANUAL_ALIAS", args.display_name);
  if (aliasKey.length > 0) {
    const viaAlias = await prisma.externalCollaboratorIdentifier.findFirst({
      where: {
        org_entity_id: org,
        identifier_type: "MANUAL_ALIAS",
        identifier_value_normalized: aliasKey,
        deleted_at: null,
        verified_by_entity_id: { not: null },
        external_collaborator: { deleted_at: null },
      },
      include: { external_collaborator: true },
    });
    if (viaAlias !== null) {
      return { matched: true, collaborator: viaAlias.external_collaborator, matched_by: "verified_alias" };
    }
  }

  // 4. Exact display name — unique active match with consistent account
  //    context only.
  const byName = await prisma.externalCollaborator.findMany({
    where: {
      org_entity_id: org,
      display_name: { equals: args.display_name.trim(), mode: "insensitive" },
      deleted_at: null,
    },
    include: { external_organization: { select: { normalized_name: true } } },
  });
  if (byName.length === 0) return { matched: false, ambiguous: false };
  if (byName.length > 1) return { matched: false, ambiguous: true };
  const candidateCompany =
    typeof args.company_label === "string" && args.company_label.trim().length > 0
      ? normalizeOrgName(args.company_label)
      : null;
  const only = byName[0]!;
  const existingCompany =
    only.external_organization?.normalized_name ??
    (only.company_name !== null ? normalizeOrgName(only.company_name) : null);
  const consistent =
    candidateCompany === null ||
    existingCompany === null ||
    candidateCompany === existingCompany;
  if (!consistent) {
    // Same name, DIFFERENT account — a different person until a human says
    // otherwise. Never merge.
    return { matched: false, ambiguous: true };
  }
  return { matched: true, collaborator: only, matched_by: "name_governed" };
}

// WHAT: record identifier evidence (idempotent on the org-scoped unique).
export async function recordCollaboratorIdentifier(args: {
  org_entity_id: string;
  external_collaborator_id: string;
  identifier_type: string;
  identifier_value: string;
  confidence?: "high" | "medium" | "low";
  source_system?: string;
  verified_by_entity_id?: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!IDENTIFIER_TYPES.has(args.identifier_type)) {
    return { ok: false, code: "INVALID_IDENTIFIER_TYPE" };
  }
  const value = normalizeIdentifierValue(args.identifier_type, args.identifier_value);
  if (value.length === 0) return { ok: false, code: "INVALID_IDENTIFIER" };
  const existing = await prisma.externalCollaboratorIdentifier.findFirst({
    where: {
      org_entity_id: args.org_entity_id,
      identifier_type: args.identifier_type,
      identifier_value_normalized: value,
      deleted_at: null,
    },
    select: { identifier_id: true },
  });
  if (existing !== null) return { ok: true };
  await prisma.externalCollaboratorIdentifier.create({
    data: {
      org_entity_id: args.org_entity_id,
      external_collaborator_id: args.external_collaborator_id,
      identifier_type: args.identifier_type,
      identifier_value_normalized: value,
      confidence: args.confidence ?? "low",
      source_system: args.source_system ?? null,
      verified_by_entity_id: args.verified_by_entity_id ?? null,
      ...(args.verified_by_entity_id !== undefined ? { verified_at: new Date() } : {}),
    },
  });
  return { ok: true };
}
