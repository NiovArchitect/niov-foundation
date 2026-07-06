// FILE: activate-decision-rights-prod-schema.ts
// PURPOSE: [BLOCK-3A] additive-ONLY production activation of the
//          EntityDecisionRights schema (the `entity_decision_rights` table +
//          its unique key + org index). Same authorized mechanism as
//          scripts/activate-cohort-access-request-prod-schema.ts (1307-B),
//          activate-cohort-contribution-prod-schema.ts (1306-B) and
//          activate-cohort-prod-schema.ts (1305-B): exact-scope, idempotent,
//          approval-gated, secret-redacting, FIXED hardcoded additive DDL —
//          can never DROP/ALTER an existing object. No enum: the
//          DecisionDomain vocabulary is service-validated TEXT[] (the enum
//          lives in decision-rights.ts).
//
//          DDL generated read-only via `prisma migrate diff --from-empty
//          --to-schema-datamodel ... --script` and verified to contain ONLY
//          CREATE TABLE / CREATE INDEX for the decision-rights objects.
//          No backfill: absence of a row = no structured rights (the
//          transcript heuristics continue); no existing row is touched.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-decision-rights-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-decision-rights-prod-schema.ts --dry-run
//   NIOV_APPROVE_DECISION_RIGHTS_PROD_SCHEMA='APPROVE DECISION RIGHTS PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-decision-rights-prod-schema.ts
//
// CONNECTS TO: packages/database/prisma/schema.prisma (EntityDecisionRights),
//              apps/api/src/services/otzar/decision-rights-store.service.ts,
//              ADR-0025 (Schema-Push-Target Discipline; raw-DDL additive path).

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_DECISION_RIGHTS_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE DECISION RIGHTS PROD SCHEMA ACTIVATION — additive only";

const DDL_TABLE = `CREATE TABLE IF NOT EXISTS "entity_decision_rights" (
    "rights_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "owns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "can_approve" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommend_only" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_decision_rights_pkey" PRIMARY KEY ("rights_id")
);`;

const DDL_INDEXES = [
  `CREATE INDEX IF NOT EXISTS "entity_decision_rights_org_entity_id_idx" ON "entity_decision_rights"("org_entity_id");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "entity_decision_rights_org_entity_id_entity_id_key" ON "entity_decision_rights"("org_entity_id", "entity_id");`,
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
  console.log(`activate-decision-rights-prod-schema.ts — [BLOCK-3A] additive-only activation

Applies ONLY: CREATE TABLE "entity_decision_rights"; 2 CREATE INDEX.
Idempotent (IF NOT EXISTS). Never DROP/ALTER. Never touches an existing
object. No backfill; no rows are written.

FLAGS
  --dry-run   Print target (redacted) + the exact DDL; apply nothing.
  --help      This message.

REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL          target DB (via dotenv; redacted in output)
  ${APPROVAL_ENV}    must equal exactly:
      "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<{ table: boolean; uniqueKey: boolean }> {
  const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='entity_decision_rights') AS f`,
  );
  const k = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='entity_decision_rights_org_entity_id_entity_id_key') AS f`,
  );
  return { table: Boolean(t[0]?.f), uniqueKey: Boolean(k[0]?.f) };
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

  console.log("=== BLOCK-3A DECISION RIGHTS PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    CREATE TABLE entity_decision_rights + 2 indexes`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); never DROP/ALTER; no backfill; no rows written`);

  if (dryRun) {
    console.log("\n--- DDL that WOULD be applied ---\n");
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
    console.log(`\nBefore: table=${before.table} uniqueKey=${before.uniqueKey}`);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(DDL_TABLE);
      for (const idx of DDL_INDEXES) await tx.$executeRawUnsafe(idx);
    });
    const after = await present(prisma);
    console.log(`After:  table=${after.table} uniqueKey=${after.uniqueKey}`);
    if (!after.table || !after.uniqueKey) {
      console.error("\n[activate] FAILED: decision-rights objects not present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — decision-rights schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
