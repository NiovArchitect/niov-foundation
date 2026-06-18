// FILE: scripts/activate-cohort-prod-schema.ts
// PURPOSE: Phase 1305-B — additive-ONLY production activation of the 1305-A
//          cohort schema (the `CohortProductStatus` enum + `cohort_data_products`
//          table + its 5 indexes). This is the authorized one-off raw-DDL
//          mechanism per the autonomous directive: exact-scope, idempotent,
//          approval-gated, secret-redacting. It is NOT `prisma db push` and runs
//          a FIXED, hardcoded, additive-only DDL set — it can never DROP or
//          ALTER an existing object, so it cannot be destructive by construction.
//
//          The exact DDL below was generated read-only via
//          `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel
//          ... --script` against the production DB and verified to contain ONLY
//          CREATE TYPE / CREATE TABLE / CREATE INDEX for the cohort objects (no
//          DROP, no ALTER, references only the pre-existing DataSensitivityClass
//          + MarketplaceDiscoveryScope enums). Made idempotent here
//          (IF NOT EXISTS / pg_type guard) so re-runs are safe.
//
// GUARANTEES:
//   - Touches ONLY the cohort enum + table + indexes. Never memory_capsules,
//     never HNSW, never any existing table/column/enum/trigger.
//   - Read DATABASE_URL via dotenv at runtime (never falls back, never printed;
//     host/db/port redacted-summary only).
//   - Requires the exact approval phrase env gate for a real apply.
//   - Re-verifies object presence after apply.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-cohort-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-cohort-prod-schema.ts --dry-run
//   NIOV_APPROVE_COHORT_PROD_SCHEMA='APPROVE COHORT PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-cohort-prod-schema.ts
//
// CONNECTS TO: packages/database/prisma/schema.prisma (CohortDataProduct model),
//              ADR-0025 (Schema-Push-Target Discipline; raw-DDL additive path),
//              scripts/verify-production-parity.ts (read-only parity verifier).

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_COHORT_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE COHORT PROD SCHEMA ACTIVATION — additive only";

// The FIXED additive-only DDL (idempotent). Order matters: enum → table → indexes.
const DDL_ENUM = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CohortProductStatus') THEN
    CREATE TYPE "CohortProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
  END IF;
END $$;`;

const DDL_TABLE = `CREATE TABLE IF NOT EXISTS "cohort_data_products" (
    "cohort_product_id" UUID NOT NULL,
    "listing_id" UUID,
    "provider_entity_id" UUID NOT NULL,
    "provider_org_entity_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cohort_type" TEXT NOT NULL,
    "capsule_type_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "access_modes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowed_uses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sensitivity_class" "DataSensitivityClass" NOT NULL DEFAULT 'STANDARD',
    "sensitive_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minimum_cohort_size" INTEGER NOT NULL DEFAULT 50,
    "consent_required" BOOLEAN NOT NULL DEFAULT true,
    "opt_in_required" BOOLEAN NOT NULL DEFAULT true,
    "revocation_supported" BOOLEAN NOT NULL DEFAULT true,
    "proof_required" BOOLEAN NOT NULL DEFAULT true,
    "raw_body_excluded" BOOLEAN NOT NULL DEFAULT true,
    "training_allowed" BOOLEAN NOT NULL DEFAULT false,
    "model_improvement_allowed" BOOLEAN NOT NULL DEFAULT false,
    "redistribution_allowed" BOOLEAN NOT NULL DEFAULT false,
    "commercial_use_allowed" BOOLEAN NOT NULL DEFAULT false,
    "retention_policy" TEXT,
    "pricing_model" JSONB NOT NULL DEFAULT '{}',
    "metering_unit" TEXT,
    "revenue_share_policy" JSONB,
    "status" "CohortProductStatus" NOT NULL DEFAULT 'DRAFT',
    "discovery_scope" "MarketplaceDiscoveryScope" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cohort_data_products_pkey" PRIMARY KEY ("cohort_product_id")
);`;

const DDL_INDEXES = [
  `CREATE INDEX IF NOT EXISTS "cohort_data_products_provider_entity_id_idx" ON "cohort_data_products"("provider_entity_id");`,
  `CREATE INDEX IF NOT EXISTS "cohort_data_products_provider_org_entity_id_idx" ON "cohort_data_products"("provider_org_entity_id");`,
  `CREATE INDEX IF NOT EXISTS "cohort_data_products_status_idx" ON "cohort_data_products"("status");`,
  `CREATE INDEX IF NOT EXISTS "cohort_data_products_discovery_scope_idx" ON "cohort_data_products"("discovery_scope");`,
  `CREATE INDEX IF NOT EXISTS "cohort_data_products_cohort_type_idx" ON "cohort_data_products"("cohort_type");`,
];

function redact(url: string | undefined): string {
  if (!url) return "<unset>";
  try {
    const u = new URL(url);
    return `${u.protocol}//<redacted>@${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "").split("?")[0]}`;
  } catch {
    return "<unparseable; redacted>";
  }
}

function printHelp(): void {
  console.log(`activate-cohort-prod-schema.ts — Phase 1305-B additive-only cohort activation

Applies ONLY: CREATE TYPE "CohortProductStatus"; CREATE TABLE "cohort_data_products";
5 CREATE INDEX. Idempotent (IF NOT EXISTS / pg_type guard). Never DROP/ALTER.
Never touches memory_capsules / HNSW / any existing object.

FLAGS
  --dry-run   Print target (redacted) + the exact DDL; apply nothing.
  --help      This message.

REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL                       target DB (via dotenv; redacted in output)
  ${APPROVAL_ENV}    must equal exactly:
      "${APPROVAL_PHRASE}"
`);
}

async function objectsPresent(prisma: PrismaClient): Promise<{ table: boolean; enumType: boolean }> {
  const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cohort_data_products') AS f`,
  );
  const e = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname='CohortProductStatus') AS f`,
  );
  return { table: Boolean(t[0]?.f), enumType: Boolean(e[0]?.f) };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const dryRun = argv.includes("--dry-run");

  // DDL prefers DIRECT_URL (the non-pooled :5432 connection Prisma's directUrl
  // exists for) — interactive transactions + DDL over the Supabase transaction
  // pooler (:6543) are the classic failure point. Falls back to DATABASE_URL.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    console.error("\n[activate] REFUSING: neither DIRECT_URL nor DATABASE_URL set (load via dotenv).\n");
    process.exit(1);
  }

  console.log("=== PHASE 1305-B COHORT PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    CREATE TYPE CohortProductStatus + CREATE TABLE cohort_data_products + 5 indexes`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); never DROP/ALTER; never touches memory_capsules/HNSW`);

  if (dryRun) {
    console.log("\n--- DDL that WOULD be applied ---\n");
    console.log(DDL_ENUM);
    console.log(DDL_TABLE);
    for (const i of DDL_INDEXES) console.log(i);
    console.log("\n[activate] DRY-RUN — nothing applied.\n");
    return;
  }

  const approval = process.env[APPROVAL_ENV] ?? "";
  if (approval !== APPROVAL_PHRASE) {
    console.error(
      `\n[activate] REFUSING: ${APPROVAL_ENV} must equal exactly the approval phrase.\n`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  try {
    const before = await objectsPresent(prisma);
    console.log(`\nBefore: table=${before.table} enum=${before.enumType}`);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(DDL_ENUM);
      await tx.$executeRawUnsafe(DDL_TABLE);
      for (const idx of DDL_INDEXES) await tx.$executeRawUnsafe(idx);
    });

    const after = await objectsPresent(prisma);
    console.log(`After:  table=${after.table} enum=${after.enumType}`);
    if (!after.table || !after.enumType) {
      console.error("\n[activate] FAILED: cohort objects not present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — cohort schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
