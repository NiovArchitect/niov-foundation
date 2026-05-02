// FILE: seeds.ts
// PURPOSE: Boot-time seed functions for Section 9 governance and
//          domain-intelligence tables. Idempotent so they can be
//          called from buildApp on every start without duplicating
//          rows. Where data hasn't been specified yet, the seed is
//          a no-op stub with a TODO referencing the later box that
//          will fill it in.
// CONNECTS TO: prisma (writes seed rows), buildApp (calls these
//              once at boot).

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

// WHAT: Per-org seed of DomainVocabulary entries from an industry
//        template.
// INPUT: The org's entity_id and the industry string from
//        OrgSettings.
// OUTPUT: A no-op promise (until Dandelion Phase 0 ships).
// WHY: Industry-specific vocabulary lists (TECH, HEALTHCARE, etc)
//      are spelled out on PDF page 12 inside the Dandelion Phase 0
//      paste box. That box wires the actual vocabulary in. This
//      stub preserves the call surface so future code paths
//      compile without hand-wiring the industry lists yet.
//
// TODO(Section 9 / Dandelion Phase 0 box): implement using the
// industry maps documented on page 12:
//   TECH: Sprint, Backlog, PR, CI/CD, SLA, API, DevOps, Scrum, KPI
//   HEALTHCARE: EHR, HIPAA, PHI, ICD-10, Prior Auth, Census, Discharge
//   FINANCE: P&L, ARR, MRR, LTV, CAC, IRR, EBITDA, LOC, AUM, SOX
//   MANUFACTURING: BOM, COGS, OEE, Kanban, Kaizen, SKU, WIP, RFQ, MRP
//   SERVICES: Retainer, SoW, NPS, CSAT, Churn, Upsell, QBR, ARR
// Each becomes one DomainVocabulary row with term_type = "ACRONYM".
// Use prisma.domainVocabulary.upsert keyed on
// @@unique([org_entity_id, term]) so re-running stays idempotent.
export async function seedIndustryDomainTemplates(
  orgEntityId: string,
  industry: string | null,
): Promise<void> {
  // Mark the parameters as used so the unused-args lint stays
  // green; intentional no-op until Dandelion Phase 0 wires this in.
  void orgEntityId;
  void industry;
}
