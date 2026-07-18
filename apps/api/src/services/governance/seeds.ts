// FILE: seeds.ts
// PURPOSE: Boot-time seed functions for Section 9 governance and
//          domain-intelligence tables. Idempotent so they can be
//          called from buildApp on every start without duplicating
//          rows. Where data hasn't been specified yet, the seed is
//          a no-op stub with a TODO referencing the later box that
//          will fill it in.
// CONNECTS TO: prisma (writes seed rows), buildApp (calls these
//              once at boot).

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  computeTARHash,
  prisma,
  writeAudit,
} from "@niov/database";
import { logger } from "../../logger.js";

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

// WHAT: YAML frontmatter + body splitter.
// INPUT: The full markdown file contents.
// OUTPUT: { frontmatter (parsed object), body (string after the
//          second --- delimiter) }.
// WHY: Hand-rolled because we only support a tightly controlled
//      frontmatter shape: role_name (string), role_category
//      (string), skill_packages (string array), autonomy_default
//      (string). YAML frontmatter follows Jekyll convention but
//      this parser only handles the subset we actually use.
//      Adding more fields requires updating this parser.
function parseTemplateFile(raw: string): {
  frontmatter: {
    role_name: string;
    role_category: string;
    skill_packages: string[];
    required_tools: string[];
    autonomy_default: string;
  };
  body: string;
} {
  // Match opening ---, capture frontmatter block, then body.
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (match === null) {
    throw new Error("template parse: missing --- frontmatter delimiters");
  }
  const fmText = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const fm: Record<string, string | string[]> = {};
  for (const line of fmText.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.+)$/);
    if (m === null) continue;
    const key = m[1]!;
    const valueRaw = m[2]!.trim();
    if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      // Array of quoted strings: ["a", "b", "c"].
      const inner = valueRaw.slice(1, -1).trim();
      const items =
        inner.length === 0
          ? []
          : inner.split(",").map((s) =>
              s.trim().replace(/^["']|["']$/g, ""),
            );
      fm[key] = items;
    } else {
      fm[key] = valueRaw.replace(/^["']|["']$/g, "");
    }
  }
  return {
    frontmatter: {
      role_name: String(fm.role_name ?? ""),
      role_category: String(fm.role_category ?? ""),
      skill_packages: Array.isArray(fm.skill_packages)
        ? (fm.skill_packages as string[])
        : [],
      // [GAP-H TOOLS] Provider keys this role's twin needs connected.
      required_tools: Array.isArray(fm.required_tools)
        ? (fm.required_tools as string[])
        : [],
      autonomy_default: String(fm.autonomy_default ?? "APPROVAL_REQUIRED"),
    },
    body,
  };
}

// WHAT: Seed all 13 role-template rows from
//        apps/api/templates/roles/*.md into the AgentTemplate table.
// INPUT: An optional directory override (tests use a fixture dir).
// OUTPUT: Number of rows upserted.
// WHY: Section 11B's createTwin role-template apply path reads from
//      this table. Idempotent via role_name @unique upsert: re-run
//      after editing a markdown file refreshes the corresponding
//      row's content + skill_packages without touching org-custom
//      templates (those carry org_entity_id !== null and is_custom
//      true).
export async function seedAgentTemplates(
  templatesDir?: string,
): Promise<number> {
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  // Docker WORKDIR is /repo; local may be monorepo root or apps/api.
  // Try candidates so role templates always seed in production.
  // Resolve relative to this module first (works under tsx Docker WORKDIR
  // /repo and local monorepo) so required_tools always land in production.
  let moduleDir: string | null = null;
  try {
    const { fileURLToPath } = await import("node:url");
    moduleDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    moduleDir = null;
  }
  const candidates = templatesDir
    ? [templatesDir]
    : [
        ...(moduleDir
          ? [
              // apps/api/src/services/governance → apps/api/templates/roles
              path.resolve(moduleDir, "../../../templates/roles"),
            ]
          : []),
        path.resolve(process.cwd(), "apps/api/templates/roles"),
        path.resolve(process.cwd(), "templates/roles"),
        path.resolve(process.cwd(), "../templates/roles"),
        path.resolve(process.cwd(), "../../apps/api/templates/roles"),
      ];
  let dir: string | null = null;
  let entries: string[] = [];
  for (const candidate of candidates) {
    try {
      entries = await fs.readdir(candidate);
      if (entries.some((e) => e.endsWith(".md"))) {
        dir = candidate;
        break;
      }
    } catch {
      // try next
    }
  }
  if (dir === null) {
    // Directory missing -- treat as no-op (caller can choose to
    // surface the absence as an error elsewhere).
    return 0;
  }
  const files = entries.filter((e) => e.endsWith(".md"));
  let upserted = 0;
  for (const file of files) {
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const { frontmatter, body } = parseTemplateFile(raw);
    if (frontmatter.role_name.length === 0) continue;
    await prisma.agentTemplate.upsert({
      where: { role_name: frontmatter.role_name },
      create: {
        role_name: frontmatter.role_name,
        role_category: frontmatter.role_category,
        template_content: body,
        skill_packages: frontmatter.skill_packages,
        required_tools: frontmatter.required_tools,
        autonomy_default: frontmatter.autonomy_default,
        is_custom: false,
        org_entity_id: null,
      },
      update: {
        role_category: frontmatter.role_category,
        template_content: body,
        skill_packages: frontmatter.skill_packages,
        required_tools: frontmatter.required_tools,
        autonomy_default: frontmatter.autonomy_default,
      },
    });
    upserted++;
  }
  return upserted;
}

// WHAT: Seed the seven FeedbackLoopHealth rows on boot.
// INPUT: None.
// OUTPUT: A promise that resolves once rows are upserted.
// WHY: Section 10 Loop 7 reads this table to detect stale loops.
//      Seeding all seven rows on boot guarantees Loop 7 has
//      something to compare against from day one. Idempotent via
//      createMany skipDuplicates -- re-running on a populated DB
//      leaves existing rows untouched (so we don't reset their
//      last_run timestamps).
export async function seedFeedbackLoopHealth(): Promise<void> {
  await prisma.feedbackLoopHealth.createMany({
    data: [
      { loop_id: "loop_1", loop_name: "Capsule Relevance" },
      { loop_id: "loop_2", loop_name: "Token Efficiency" },
      { loop_id: "loop_3", loop_name: "Permission Patterns" },
      { loop_id: "loop_4", loop_name: "Hive Aggregate Refresh" },
      { loop_id: "loop_5", loop_name: "Anomaly Detection" },
      { loop_id: "loop_6", loop_name: "Monetization Demand" },
      { loop_id: "loop_7", loop_name: "Meta Health Check" },
    ],
    skipDuplicates: true,
  });
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

// WHAT: The Otzar APPLICATION entity's TAR capability set.
// INPUT: Used as a constant.
// OUTPUT: A snapshot of TAR fields ready for hashing + persistence.
// WHY: Otzar is an APPLICATION entity that consumes Foundation
//      primitives (read/write/share capsules + external API
//      access). can_create_hives is EXPLICIT FALSE: Hive creation
//      belongs to the Dandelion Phase 0 admin path, not Otzar.
//      Setting it false here means a future feature accidentally
//      calling createHive from Otzar will surface as a denied
//      permission rather than silently succeeding.
const OTZAR_TAR_POLICY = {
  can_login: true,
  can_read_capsules: true,
  can_write_capsules: true,
  can_share_capsules: true,
  can_create_hives: false,
  can_access_external_api: true,
  can_admin_niov: false,
  can_admin_org: false,
  clearance_ceiling: 4,
  monetization_role: "NEITHER" as const,
  compliance_frameworks: [] as string[],
  status: "ACTIVE" as const,
};

// WHAT: The result of seedOtzarEntity.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Tests + buildApp can both reach for the resolved entity_id
//      without re-querying. created=true when a brand new
//      APPLICATION entity was minted; false when an existing one
//      was found via OTZAR_ENTITY_ID.
export interface SeedOtzarEntityResult {
  otzar_entity_id: string;
  created: boolean;
}

// WHAT: Idempotent seed that ensures the Otzar APPLICATION entity
//        exists with the right TAR.
// INPUT: An optional override env-var bag (tests pass a custom env).
// OUTPUT: { otzar_entity_id, created }.
// WHY: In production OTZAR_ENTITY_ID is set in .env and points at
//      the existing entity; we look it up + reconcile the TAR
//      capability flags so a TAR drift doesn't block Otzar at
//      runtime. In dev/test OTZAR_ENTITY_ID is unset; we mint a
//      fresh APPLICATION entity, set up its TAR, log a warning with
//      the new id so the operator can drop it into .env.
//      Re-running with the same OTZAR_ENTITY_ID is a no-op (TAR is
//      already canonical). The print-and-warn pattern is the only
//      safe way to bootstrap Otzar's identity without baking a
//      hardcoded UUID into the codebase.
export async function seedOtzarEntity(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeedOtzarEntityResult> {
  const existingId =
    typeof env.OTZAR_ENTITY_ID === "string" && env.OTZAR_ENTITY_ID.length > 0
      ? env.OTZAR_ENTITY_ID
      : null;

  if (existingId !== null) {
    const found = await prisma.entity.findUnique({
      where: { entity_id: existingId },
    });
    if (found !== null) {
      // Reconcile TAR (idempotent).
      await reconcileOtzarTar(existingId);
      return { otzar_entity_id: existingId, created: false };
    }
    // Configured ID points at a missing entity; fall through to
    // create a fresh one and warn loudly.
    logger.warn(
      `[seedOtzarEntity] OTZAR_ENTITY_ID=${existingId} does not exist in the DB; creating a fresh APPLICATION entity.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const newId = randomUUID();
    await tx.entity.create({
      data: {
        entity_id: newId,
        entity_type: "APPLICATION",
        display_name: "Otzar",
        public_key: `pk_otzar_${newId}`,
        status: "ACTIVE",
        clearance_level: 4,
      },
    });
    await tx.wallet.create({
      data: {
        entity_id: newId,
        wallet_type: "PERSONAL",
        niov_can_access_contents: false,
      },
    });
    await tx.tokenAttributeRepository.create({
      data: {
        entity_id: newId,
        ...OTZAR_TAR_POLICY,
        tar_hash: computeTARHash(OTZAR_TAR_POLICY),
        tar_version: 1,
      },
    });
    await writeAudit(tx, {
      action: "ENTITY_CREATE",
      entity_id: newId,
      actor_id: null,
      meta: {
        entity_type: "APPLICATION",
        display_name: "Otzar",
        via: "seedOtzarEntity",
      },
    });
    logger.warn(
      `[seedOtzarEntity] Created new Otzar APPLICATION entity. Add to .env: OTZAR_ENTITY_ID=${newId}`,
    );
    return { otzar_entity_id: newId, created: true };
  });
}

// WHAT: Force the existing Otzar entity's TAR to canonical policy.
// INPUT: The Otzar entity_id.
// OUTPUT: A promise that resolves once the TAR is reconciled.
// WHY: A TAR can drift if an admin tweaks it manually or a prior
//      seed used a different policy. Re-applying the canonical
//      values + recomputing the hash keeps Otzar's capabilities
//      stable across boots. Idempotent.
async function reconcileOtzarTar(entityId: string): Promise<void> {
  const newHash = computeTARHash(OTZAR_TAR_POLICY);
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: {
      ...OTZAR_TAR_POLICY,
      tar_hash: newHash,
    },
  });
}
