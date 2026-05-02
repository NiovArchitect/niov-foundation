// FILE: seeds.ts
// PURPOSE: Boot-time seed functions for Section 9 governance and
//          domain-intelligence tables. Idempotent so they can be
//          called from buildApp on every start without duplicating
//          rows. Where data hasn't been specified yet, the seed is
//          a no-op stub with a TODO referencing the later box that
//          will fill it in.
// CONNECTS TO: prisma (writes seed rows), buildApp (calls these
//              once at boot).

import type { Prisma } from "@prisma/client";
import { prisma } from "@niov/database";

// WHAT: Ensure the single MonetizationConfig row exists at the
//        spec defaults (70/30 split).
// INPUT: None.
// OUTPUT: A promise that resolves once the row is in place.
// WHY: Section 9 schema defines MonetizationConfig but the active
//      revenue split is still hardcoded in Section 6's
//      monetization.service.ts. Seeding one row at boot prepares
//      the table so a future PATCH /platform/monetization/config
//      route can update it without races. Idempotent: if any row
//      already exists we leave it alone.
export async function seedMonetizationConfig(): Promise<void> {
  const existing = await prisma.monetizationConfig.findFirst({
    select: { config_id: true },
  });
  if (existing !== null) return;
  await prisma.monetizationConfig.create({
    data: {
      niov_fee_share: 0.3,
      holder_share: 0.7,
    },
  });
}

// WHAT: Stub for the 8 standard SkillPackage rows.
// INPUT: None.
// OUTPUT: A no-op promise.
// WHY: The spec's "8 standard packages" list is not in this paste
//      box -- it lands later when the AI Teammate management box
//      is pasted. Stubbing as a no-op now keeps the buildApp
//      seed phase complete and idempotent; the implementation
//      will land alongside the package roster.
//
// TODO(Section 9 / "AI Teammate management" box): replace this
// stub with upsert calls for the 8 standard SkillPackage rows.
// Use upsert keyed on the unique `name` column so re-running
// this seed stays idempotent.
export async function seedSkillPackages(): Promise<void> {
  // Intentional no-op until the package roster ships.
}

// WHAT: Stub for the 13 role templates loaded from /templates/roles/.
// INPUT: None.
// OUTPUT: A no-op promise.
// WHY: The role-template files (.md) and their target table do not
//      yet exist in the repo. Stub today; implement when the
//      templates land.
//
// TODO(later in Section 9 / role-template box): read the 13 .md
// files from a /templates/roles/ directory and upsert one row per
// template into whichever table the spec introduces for them.
export async function seedAgentTemplates(): Promise<void> {
  // Intentional no-op until role templates ship.
}

// WHAT: The canonical industry vocabulary maps from PDF page 12.
//        Keys are uppercase industry names (matching OrgSettings.industry
//        values); each value is the list of domain terms to seed.
// INPUT: Used as a constant lookup table.
// OUTPUT: None.
// WHY: Per-spec these are the exact terms each industry's twins
//      should recognize on day one. Keeping them in one frozen map
//      means changes are auditable in code review.
const INDUSTRY_TERMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  TECH: [
    "Sprint",
    "Backlog",
    "PR",
    "CI/CD",
    "SLA",
    "API",
    "DevOps",
    "Scrum",
    "KPI",
  ],
  HEALTHCARE: [
    "EHR",
    "HIPAA",
    "PHI",
    "ICD-10",
    "Prior Auth",
    "Census",
    "Discharge",
  ],
  FINANCE: [
    "P&L",
    "ARR",
    "MRR",
    "LTV",
    "CAC",
    "IRR",
    "EBITDA",
    "LOC",
    "AUM",
    "SOX",
  ],
  MANUFACTURING: [
    "BOM",
    "COGS",
    "OEE",
    "Kanban",
    "Kaizen",
    "SKU",
    "WIP",
    "RFQ",
    "MRP",
  ],
  SERVICES: [
    "Retainer",
    "SoW",
    "NPS",
    "CSAT",
    "Churn",
    "Upsell",
    "QBR",
    "ARR",
  ],
});

// WHAT: Per-org seed of DomainVocabulary entries from an industry
//        template.
// INPUT: The org's entity_id, the industry string from OrgSettings,
//        and an optional transaction client (Phase 0 composes this
//        seed inside its outer atomic transaction).
// OUTPUT: A promise resolving once rows are upserted (or no-op when
//         industry is null / not in the table).
// WHY: Each twin's first interaction must already recognize the
//      org's domain language. Idempotent via the
//      @@unique([org_entity_id, term]) constraint -- repeated calls
//      with the same industry produce the same final state.
export async function seedIndustryDomainTemplates(
  orgEntityId: string,
  industry: string | null,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (industry === null) return;
  const upper = industry.toUpperCase();
  const terms = INDUSTRY_TERMS[upper];
  if (terms === undefined || terms.length === 0) {
    // Unknown industry: no seed list, no-op. Future sections may
    // add new industries to the map; we do not error here.
    return;
  }
  const db = tx ?? prisma;
  await db.domainVocabulary.createMany({
    data: terms.map((term) => ({
      org_entity_id: orgEntityId,
      term,
      term_type: "ACRONYM",
    })),
    skipDuplicates: true,
  });
}
