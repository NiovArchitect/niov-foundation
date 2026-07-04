// FILE: external-organization.service.ts
// PURPOSE: [T-3] The governed external ORGANIZATION key — the beginning of
//          external identity resolution, not a CRM. Matching policy (the
//          founder's evidence doctrine):
//            - names are labels, not identity; identifiers are evidence;
//            - reuse happens ONLY on an exact org-scoped normalized-name
//              match, and ONLY from governed/manual paths (promotion,
//              manual tracking) — observed ingestion never reaches here;
//            - personal email domains are NEVER organization identifiers
//              (hard denylist);
//            - ambiguity or missing evidence → no link (null), never a
//              merge; cross-org same-name is separate by schema
//              (@@unique([org_entity_id, normalized_name]));
//            - creation is audited with who confirmed it.
// CONNECTS TO: external-collaborator.service.ts (manual track path),
//          dandelion-seed.service.ts (promotion path),
//          work-os/external-context.service.ts (label preference),
//          tests/integration/external-organization.test.ts.

import { prisma, writeAuditEvent } from "@niov/database";
import type { ExternalOrganization } from "@prisma/client";

/** Lowercase, collapse whitespace, strip trailing corporate suffixes noise-
 *  free enough for an exact-match key. Deterministic; never fuzzy. */
export function normalizeOrgName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Personal email providers can never identify an ORGANIZATION. */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
]);

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

const IDENTIFIER_TYPES = new Set([
  "DOMAIN", "EMAIL_DOMAIN", "SLACK_TEAM", "ZOOM_ACCOUNT",
  "CRM_ACCOUNT_ID", "MANUAL_ALIAS", "WEBSITE", "OTHER",
]);

// WHAT: get-or-create the org-scoped ExternalOrganization for a company
// label arriving through a GOVERNED/MANUAL path. Returns null when the
// label is empty after normalization (no link, never a guess).
// AUDIT: creation writes EXTERNAL_ORGANIZATION_CREATED with the confirming
// human; exact-match reuse is silent (no duplicate audit for no-ops).
export async function getOrCreateExternalOrganizationForCaller(args: {
  org_entity_id: string;
  caller_entity_id: string;
  company_label: string;
  relationship_type?: string;
  /** Optional corporate-domain evidence (e.g. from a work email). Personal
   *  email domains are dropped, never stored. */
  domain_evidence?: string | null;
  /** Provenance for the audit + identifier rows. */
  source: "manual_track" | "dandelion_seed_approval" | "admin";
}): Promise<ExternalOrganization | null> {
  const normalized = normalizeOrgName(args.company_label);
  if (normalized.length === 0) return null;

  const existing = await prisma.externalOrganization.findFirst({
    where: {
      org_entity_id: args.org_entity_id,
      normalized_name: normalized,
      deleted_at: null,
    },
  });
  if (existing !== null) return existing;

  const VALID_RELATIONSHIPS = new Set([
    "CLIENT", "VENDOR", "CONTRACTOR", "PARTNER", "INVESTOR",
    "ADVISOR", "AGENCY", "REGULATOR", "PROSPECT", "CANDIDATE", "OTHER",
  ]);
  const relationship =
    args.relationship_type !== undefined && VALID_RELATIONSHIPS.has(args.relationship_type)
      ? args.relationship_type
      : "OTHER";

  const domain =
    typeof args.domain_evidence === "string" &&
    args.domain_evidence.trim().length > 0 &&
    !isPersonalEmailDomain(args.domain_evidence)
      ? args.domain_evidence.trim().toLowerCase()
      : null;

  const created = await prisma.externalOrganization.create({
    data: {
      org_entity_id: args.org_entity_id,
      display_name: args.company_label.trim().slice(0, 120),
      normalized_name: normalized,
      relationship_type: relationship as never,
      primary_domain: domain,
      created_by_entity_id: args.caller_entity_id,
    },
  });
  if (domain !== null) {
    await prisma.externalOrganizationIdentifier.create({
      data: {
        org_entity_id: args.org_entity_id,
        external_org_id: created.external_org_id,
        identifier_type: "EMAIL_DOMAIN",
        identifier_value_normalized: domain,
        confidence: "medium", // corporate domain, unverified
        source_system: args.source,
      },
    });
  }
  await writeAuditEvent({
    event_type: "EXTERNAL_ORGANIZATION_CREATED",
    outcome: "SUCCESS",
    actor_entity_id: args.caller_entity_id,
    target_entity_id: args.caller_entity_id,
    details: {
      external_org_id: created.external_org_id,
      relationship_type: relationship,
      source: args.source,
      org_entity_id: args.org_entity_id,
      has_domain_evidence: domain !== null,
    },
  });
  return created;
}

// WHAT: record an additional identifier as evidence (governed callers only).
// Personal email domains refused; duplicates idempotent (unique constraint).
export async function addExternalOrganizationIdentifier(args: {
  org_entity_id: string;
  external_org_id: string;
  identifier_type: string;
  identifier_value: string;
  confidence?: "high" | "medium" | "low";
  source_system?: string;
  verified_by_entity_id?: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!IDENTIFIER_TYPES.has(args.identifier_type)) {
    return { ok: false, code: "INVALID_IDENTIFIER_TYPE" };
  }
  const value = args.identifier_value.trim().toLowerCase();
  if (value.length === 0) return { ok: false, code: "INVALID_IDENTIFIER" };
  if (
    (args.identifier_type === "DOMAIN" || args.identifier_type === "EMAIL_DOMAIN") &&
    isPersonalEmailDomain(value)
  ) {
    return { ok: false, code: "PERSONAL_DOMAIN_NOT_AN_ORG_IDENTIFIER" };
  }
  const existing = await prisma.externalOrganizationIdentifier.findFirst({
    where: {
      org_entity_id: args.org_entity_id,
      identifier_type: args.identifier_type,
      identifier_value_normalized: value,
      deleted_at: null,
    },
  });
  if (existing !== null) return { ok: true };
  await prisma.externalOrganizationIdentifier.create({
    data: {
      org_entity_id: args.org_entity_id,
      external_org_id: args.external_org_id,
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
