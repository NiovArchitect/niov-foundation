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
import { reconcileIdentity } from "./identity-reconciliation.service.js";

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

// ── [T-3C] Possible-match PROJECTION (the chooser's data) ───────────────────
// Lists candidates for a human to decide on — it NEVER decides. Org-scoped,
// active records only, cap 3, safe labels only (emails/domains/identifier
// values never project; the machine id is for the decision call, never copy).
export interface PossibleCollaboratorMatch {
  external_collaborator_id: string;
  display_label: string;
  company_label?: string;
  relationship_label?: string;
  reason: "Verified alias" | "Same company" | "Similar name in this account";
  confidence: "high" | "medium" | "low";
}

// Exported for [T-4]: the manager exception summary reuses the same closed
// vocabulary (never a backend enum in customer copy).
export const RELATIONSHIP_LABELS: Record<string, string> = {
  CLIENT: "Client", VENDOR: "Vendor", CONTRACTOR: "Contractor",
  PARTNER: "Partner", INVESTOR: "Investor", ADVISOR: "Advisor",
  AGENCY: "Agency", REGULATOR: "Regulator", PROSPECT: "Prospect",
  CANDIDATE: "Candidate", OTHER: "External",
};

export async function listPossibleCollaboratorMatches(args: {
  org_entity_id: string;
  display_name: string;
  company_label?: string | null;
}): Promise<PossibleCollaboratorMatch[]> {
  const out = new Map<string, PossibleCollaboratorMatch>();
  const push = (
    c: { external_collaborator_id: string; display_name: string; company_name: string | null; relationship_type: string },
    reason: PossibleCollaboratorMatch["reason"],
    confidence: PossibleCollaboratorMatch["confidence"],
  ) => {
    if (out.has(c.external_collaborator_id)) return;
    out.set(c.external_collaborator_id, {
      external_collaborator_id: c.external_collaborator_id,
      display_label: c.display_name,
      ...(c.company_name !== null ? { company_label: c.company_name } : {}),
      relationship_label: RELATIONSHIP_LABELS[c.relationship_type] ?? "External",
      reason,
      confidence,
    });
  };

  // Verified alias — the strongest listed evidence.
  const aliasKey = normalizeIdentifierValue("MANUAL_ALIAS", args.display_name);
  if (aliasKey.length > 0) {
    const viaAlias = await prisma.externalCollaboratorIdentifier.findMany({
      where: {
        org_entity_id: args.org_entity_id,
        identifier_type: "MANUAL_ALIAS",
        identifier_value_normalized: aliasKey,
        deleted_at: null,
        verified_by_entity_id: { not: null },
        external_collaborator: { deleted_at: null },
      },
      include: { external_collaborator: true },
      take: 3,
    });
    for (const a of viaAlias) push(a.external_collaborator, "Verified alias", "high");
  }

  // Exact-name matches (the ambiguity T-3B refuses to decide).
  const byName = await prisma.externalCollaborator.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      display_name: { equals: args.display_name.trim(), mode: "insensitive" },
      deleted_at: null,
    },
    take: 5,
  });
  const candidateCompany =
    typeof args.company_label === "string" && args.company_label.trim().length > 0
      ? normalizeOrgName(args.company_label)
      : null;
  for (const c of byName) {
    const sameCompany =
      candidateCompany !== null &&
      c.company_name !== null &&
      normalizeOrgName(c.company_name) === candidateCompany;
    push(c, sameCompany ? "Same company" : "Similar name in this account", sameCompany ? "medium" : "low");
  }
  return [...out.values()].slice(0, 3);
}

// ── [T-2.5] NAME the external state ─────────────────────────────────────────
// Identity reconciliation can say who an internal member is; this says WHICH
// KIND of non-member a source actor is — a governed external collaborator, an
// observed external party needing review, an ambiguous possible match, or
// simply unknown. READ-ONLY (never records identifiers, never creates
// anything), org-scoped, deterministic. It reduces confusion without creating
// false certainty: an unknown coworker and an external party are not the same
// thing, and neither becomes "the same person" without proof.
export interface ExternalResolution {
  state:
    | "internal_member"
    | "governed_external"
    | "observed_external_needs_review"
    | "possible_external_match"
    | "unknown";
  /** Display-name copy only — never an email, domain, or machine id. */
  label?: string;
  external_org_label?: string;
  relationship_label?: string;
  /** T-1 projection party vocab (lowercase, customer-safe) for the
   *  details.external_context write target. Parity with the
   *  external-context RELATIONSHIP_MAP semantics. */
  party_type?: string;
  confidence: "high" | "medium" | "low";
  /** The open review seed for an observed party, when one exists — a
   *  machine id for the admin queue, never card copy. */
  review_seed_id?: string;
}

function partyTypeFromRelationship(rel: string): string {
  if (["CLIENT", "PROSPECT", "VENDOR", "PARTNER", "CONTRACTOR", "REGULATOR"].includes(rel)) {
    return rel.toLowerCase();
  }
  return rel === "AGENCY" ? "partner" : "unknown";
}

type GovernedRow = ExternalCollaborator & {
  external_organization?: { display_name: string } | null;
};

function governedResolution(collab: GovernedRow, confidence: "high" | "medium"): ExternalResolution {
  const orgLabel = collab.external_organization?.display_name ?? collab.company_name;
  return {
    state: "governed_external",
    label: collab.display_name,
    ...(orgLabel !== null && orgLabel !== undefined ? { external_org_label: orgLabel } : {}),
    relationship_label: RELATIONSHIP_LABELS[collab.relationship_type] ?? "External",
    party_type: partyTypeFromRelationship(collab.relationship_type),
    confidence,
  };
}

export async function classifyExternalActor(args: {
  org_entity_id: string;
  name?: string | null;
  email?: string | null;
}): Promise<ExternalResolution> {
  const org = args.org_entity_id;
  const name = (args.name ?? "").trim();
  const email =
    typeof args.email === "string" && args.email.includes("@")
      ? args.email.trim().toLowerCase()
      : null;
  if (name.length === 0 && email === null) return { state: "unknown", confidence: "low" };

  // 1. Internal roster wins — a member is never reclassified external, and an
  //    INTERNAL ambiguity (two Davids on the roster) stays internal: unknown,
  //    with the external tables never consulted.
  const internal = await reconcileIdentity(org, {
    name: name.length > 0 ? name : null,
    email,
    handle: null,
  });
  if (internal.entity_id !== null) {
    return { state: "internal_member", ...(name.length > 0 ? { label: name } : {}), confidence: "high" };
  }
  if (internal.method === "ambiguous") return { state: "unknown", confidence: "low" };

  // 2. Governed collaborator — the T-3B evidence order, READ-ONLY (the
  //    legacy-email path does NOT backfill an identifier here).
  if (email !== null) {
    const viaIdentifier = await prisma.externalCollaboratorIdentifier.findFirst({
      where: {
        org_entity_id: org,
        identifier_type: "EMAIL",
        identifier_value_normalized: email,
        deleted_at: null,
        external_collaborator: { deleted_at: null },
      },
      include: {
        external_collaborator: {
          include: { external_organization: { select: { display_name: true } } },
        },
      },
    });
    if (viaIdentifier !== null) {
      return governedResolution(viaIdentifier.external_collaborator, "high");
    }
    const viaColumn = await prisma.externalCollaborator.findFirst({
      where: { org_entity_id: org, email: { equals: email, mode: "insensitive" }, deleted_at: null },
      include: { external_organization: { select: { display_name: true } } },
    });
    if (viaColumn !== null) return governedResolution(viaColumn, "high");
  }
  if (name.length > 0) {
    const aliasKey = normalizeIdentifierValue("MANUAL_ALIAS", name);
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
        include: {
          external_collaborator: {
            include: { external_organization: { select: { display_name: true } } },
          },
        },
      });
      if (viaAlias !== null) return governedResolution(viaAlias.external_collaborator, "high");
    }
    const byName = await prisma.externalCollaborator.findMany({
      where: {
        org_entity_id: org,
        display_name: { equals: name, mode: "insensitive" },
        deleted_at: null,
      },
      include: { external_organization: { select: { display_name: true } } },
      take: 2,
    });
    if (byName.length === 1) return governedResolution(byName[0]!, "medium");

    // 3. Observed external party — review state, never trusted identity. The
    //    T-2A deterministic bar (the org's opt-in observed index knows the
    //    name) is what keeps the review queue evidence-based.
    const observed = await prisma.externalEntity.findFirst({
      where: { org_entity_id: org, name: { equals: name, mode: "insensitive" } },
      select: { external_id: true },
    });
    if (observed !== null) {
      const openSeed = await prisma.workLedgerEntry.findFirst({
        where: {
          org_entity_id: org,
          ledger_type: "ORG_SEEDING",
          status: { in: ["SEED_NEEDS_REVIEW", "SEED_PROPOSED"] },
          AND: [
            { details: { path: ["seed_type"], equals: "review_external_party" } },
            { details: { path: ["subject_name"], equals: name } },
          ],
        },
        select: { ledger_entry_id: true },
      });
      return {
        state: "observed_external_needs_review",
        label: name,
        confidence: "low",
        ...(openSeed !== null ? { review_seed_id: openSeed.ledger_entry_id } : {}),
      };
    }

    // 4. Ambiguous governed evidence (same-name collaborators) — admin review
    //    only, never card certainty: no org/relationship labels project.
    if (byName.length > 1) return { state: "possible_external_match", label: name, confidence: "low" };
  }

  // 5. Unknown stays unknown.
  return { state: "unknown", ...(name.length > 0 ? { label: name } : {}), confidence: "low" };
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
