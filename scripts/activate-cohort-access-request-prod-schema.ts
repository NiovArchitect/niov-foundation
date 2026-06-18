// FILE: scripts/activate-cohort-access-request-prod-schema.ts
// PURPOSE: Phase 1307-B — additive-ONLY production activation of the 1307-A
//          cohort ACCESS REQUEST schema (the `CohortAccessRequestStatus` enum +
//          `cohort_access_requests` table + its 4 indexes). Same authorized
//          mechanism as scripts/activate-cohort-contribution-prod-schema.ts
//          (1306-B) and scripts/activate-cohort-prod-schema.ts (1305-B):
//          exact-scope, idempotent, approval-gated, secret-redacting, FIXED
//          hardcoded additive DDL — can never DROP/ALTER an existing object.
//
//          DDL generated read-only via `prisma migrate diff
//          --from-schema-datasource ... --to-schema-datamodel ... --script`
//          against production and verified to contain ONLY CREATE TYPE / CREATE
//          TABLE / CREATE INDEX for the access-request objects (no DROP/ALTER;
//          references the cohort_data_products table activated in 1305-B and the
//          cohort_contributions table activated in 1306-B — neither touched).
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-cohort-access-request-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-cohort-access-request-prod-schema.ts --dry-run
//   NIOV_APPROVE_COHORT_PROD_SCHEMA='APPROVE COHORT PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-cohort-access-request-prod-schema.ts
//
// CONNECTS TO: packages/database/prisma/schema.prisma (CohortAccessRequest model),
//              scripts/activate-cohort-contribution-prod-schema.ts (1306-B sibling),
//              ADR-0025 (Schema-Push-Target Discipline; raw-DDL additive path).

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_COHORT_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE COHORT PROD SCHEMA ACTIVATION — additive only";

const DDL_ENUM = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CohortAccessRequestStatus') THEN
    CREATE TYPE "CohortAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVOKED', 'EXPIRED');
  END IF;
END $$;`;

const DDL_TABLE = `CREATE TABLE IF NOT EXISTS "cohort_access_requests" (
    "request_id" UUID NOT NULL,
    "cohort_product_id" UUID NOT NULL,
    "buyer_entity_id" UUID NOT NULL,
    "buyer_org_entity_id" UUID,
    "provider_entity_id" UUID NOT NULL,
    "provider_org_entity_id" UUID,
    "intended_use" TEXT NOT NULL,
    "requested_access_mode" TEXT NOT NULL,
    "status" "CohortAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "proof_required" BOOLEAN NOT NULL DEFAULT false,
    "retention_policy" TEXT,
    "decision_reason" TEXT,
    "decided_by_entity_id" UUID,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cohort_access_requests_pkey" PRIMARY KEY ("request_id")
);`;

const DDL_INDEXES = [
  `CREATE INDEX IF NOT EXISTS "cohort_access_requests_cohort_product_id_idx" ON "cohort_access_requests"("cohort_product_id");`,
  `CREATE INDEX IF NOT EXISTS "cohort_access_requests_buyer_entity_id_idx" ON "cohort_access_requests"("buyer_entity_id");`,
  `CREATE INDEX IF NOT EXISTS "cohort_access_requests_provider_entity_id_idx" ON "cohort_access_requests"("provider_entity_id");`,
  `CREATE INDEX IF NOT EXISTS "cohort_access_requests_status_idx" ON "cohort_access_requests"("status");`,
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
  console.log(`activate-cohort-access-request-prod-schema.ts — Phase 1307-B additive-only activation

Applies ONLY: CREATE TYPE "CohortAccessRequestStatus"; CREATE TABLE
"cohort_access_requests"; 4 CREATE INDEX. Idempotent (IF NOT EXISTS / pg_type
guard). Never DROP/ALTER. Never touches any existing object.

FLAGS
  --dry-run   Print target (redacted) + the exact DDL; apply nothing.
  --help      This message.

REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL          target DB (via dotenv; redacted in output)
  ${APPROVAL_ENV}    must equal exactly:
      "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<{ table: boolean; enumType: boolean }> {
  const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cohort_access_requests') AS f`,
  );
  const e = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname='CohortAccessRequestStatus') AS f`,
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

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    console.error("\n[activate] REFUSING: neither DIRECT_URL nor DATABASE_URL set (load via dotenv).\n");
    process.exit(1);
  }

  console.log("=== PHASE 1307-B COHORT ACCESS REQUEST PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    CREATE TYPE CohortAccessRequestStatus + CREATE TABLE cohort_access_requests + 4 indexes`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); never DROP/ALTER; never touches existing objects`);

  if (dryRun) {
    console.log("\n--- DDL that WOULD be applied ---\n");
    console.log(DDL_ENUM);
    console.log(DDL_TABLE);
    for (const i of DDL_INDEXES) console.log(i);
    console.log("\n[activate] DRY-RUN — nothing applied.\n");
    return;
  }

  if ((process.env[APPROVAL_ENV] ?? "") !== APPROVAL_PHRASE) {
    console.error(`\n[activate] REFUSING: ${APPROVAL_ENV} must equal exactly the approval phrase.\n`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  try {
    const before = await present(prisma);
    console.log(`\nBefore: table=${before.table} enum=${before.enumType}`);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(DDL_ENUM);
      await tx.$executeRawUnsafe(DDL_TABLE);
      for (const idx of DDL_INDEXES) await tx.$executeRawUnsafe(idx);
    });
    const after = await present(prisma);
    console.log(`After:  table=${after.table} enum=${after.enumType}`);
    if (!after.table || !after.enumType) {
      console.error("\n[activate] FAILED: access-request objects not present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — cohort access request schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
