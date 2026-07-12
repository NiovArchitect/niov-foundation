// FILE: activate-org-truth-prod-schema.ts
// PURPOSE: [SECTION-10 ORG-TRUTH] Additive-ONLY production activation of the governed
//          organizational-truth-promotion substrate: `org_truth_records`, `org_truth_conflict_sets`,
//          `org_truth_conflict_candidates` + their indexes (incl. the PARTIAL UNIQUE index enforcing
//          "at most one PROMOTED row per (org, truth_key)" that Prisma cannot express in-schema).
//          Same authorized mechanism as scripts/activate-truth-evidence-prod-schema.ts /
//          activate-decision-rights-prod-schema.ts: exact-scope, idempotent (IF NOT EXISTS),
//          approval-gated, secret-redacting, FIXED additive DDL — never DROP/ALTER an existing
//          object. Fresh tables (no backfill). SET LOCAL lock/statement timeouts; current_schema()-
//          scoped presence + post-apply verify.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-org-truth-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-org-truth-prod-schema.ts --dry-run
//   NIOV_APPROVE_ORG_TRUTH_PROD_SCHEMA='APPROVE ORG TRUTH PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-org-truth-prod-schema.ts
//
// EXIT CODES: 1 = no URL / approval mismatch; 2 = post-apply verification failed.
// CONNECTS TO: packages/database/prisma/schema.prisma (OrgTruthRecord / OrgTruthConflictSet /
//              OrgTruthConflictCandidate), apps/api/src/startup/schema-manifest.ts (the manifest
//              entries land with the RUNTIME consumer PR, NOT before these tables exist), ADR-0025.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_ORG_TRUTH_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE ORG TRUTH PROD SCHEMA ACTIVATION — additive only";

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "org_truth_records" (
    "truth_record_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "decision_domain" TEXT NOT NULL,
    "subject_ref" UUID,
    "subject_ref_class" TEXT,
    "workspace_id" UUID,
    "twin_entity_id" UUID,
    "truth_key" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "winning_source_record_type" TEXT,
    "winning_source_record_id" UUID,
    "winning_source_version" INTEGER,
    "winning_source_hash" TEXT,
    "promotion_evidence_snapshot_id" UUID,
    "communication_lineage_ref" TEXT,
    "truth_class" TEXT,
    "truth_weight_rank" INTEGER,
    "authority_ref" TEXT,
    "promoter_entity_id" UUID,
    "promoted_at" TIMESTAMP(3),
    "supersedes_truth_record_id" UUID,
    "superseded_by_truth_record_id" UUID,
    "retraction_reason" TEXT,
    "correction_ref" UUID,
    "conflict_set_ref" UUID,
    "title" TEXT,
    "value" JSONB NOT NULL DEFAULT '{}',
    "value_type" TEXT,
    "value_unit" TEXT,
    "effective_start" TIMESTAMP(3),
    "effective_end" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "visibility_scope" TEXT NOT NULL DEFAULT 'SUBJECT',
    "retention_class" TEXT NOT NULL DEFAULT 'STANDARD',
    "origin_key" TEXT,
    CONSTRAINT "org_truth_records_pkey" PRIMARY KEY ("truth_record_id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "org_truth_records_org_entity_id_origin_key_key" ON "org_truth_records"("org_entity_id", "origin_key")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_records_org_entity_id_truth_key_idx" ON "org_truth_records"("org_entity_id", "truth_key")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_records_org_entity_id_decision_domain_idx" ON "org_truth_records"("org_entity_id", "decision_domain")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_records_conflict_set_ref_idx" ON "org_truth_records"("conflict_set_ref")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_records_winning_source_record_id_idx" ON "org_truth_records"("winning_source_record_id")`,
  // The core invariant Prisma can't express: at most ONE currently-PROMOTED answer per (org, key).
  `CREATE UNIQUE INDEX IF NOT EXISTS "org_truth_records_one_promoted_per_key" ON "org_truth_records"("org_entity_id", "truth_key") WHERE "state" = 'PROMOTED'`,

  `CREATE TABLE IF NOT EXISTS "org_truth_conflict_sets" (
    "conflict_set_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "truth_key" TEXT NOT NULL,
    "decision_domain" TEXT NOT NULL,
    "subject_ref" UUID,
    "subject_ref_class" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolver_entity_id" UUID,
    "resolution_reason" TEXT,
    "winning_source_record_id" UUID,
    "resulting_truth_record_id" UUID,
    "review_obligation_id" UUID,
    "candidate_set_fingerprint" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "origin_key" TEXT,
    CONSTRAINT "org_truth_conflict_sets_pkey" PRIMARY KEY ("conflict_set_id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "org_truth_conflict_sets_org_entity_id_origin_key_key" ON "org_truth_conflict_sets"("org_entity_id", "origin_key")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_conflict_sets_org_entity_id_truth_key_idx" ON "org_truth_conflict_sets"("org_entity_id", "truth_key")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_conflict_sets_org_entity_id_state_idx" ON "org_truth_conflict_sets"("org_entity_id", "state")`,

  `CREATE TABLE IF NOT EXISTS "org_truth_conflict_candidates" (
    "candidate_id" UUID NOT NULL,
    "conflict_set_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "source_record_type" TEXT NOT NULL,
    "source_record_id" UUID NOT NULL,
    "source_version" INTEGER,
    "source_hash" TEXT,
    "communication_act" TEXT,
    "truth_class" TEXT,
    "truth_weight_rank" INTEGER,
    "authority_status" TEXT,
    "currentness" TEXT,
    "source_integrity_state" TEXT,
    "permission_eligible" BOOLEAN NOT NULL DEFAULT true,
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "retracted" BOOLEAN NOT NULL DEFAULT false,
    "is_winner" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_truth_conflict_candidates_pkey" PRIMARY KEY ("candidate_id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "org_truth_conflict_candidates_src_key" ON "org_truth_conflict_candidates"("conflict_set_id", "source_record_type", "source_record_id")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_conflict_candidates_conflict_set_id_idx" ON "org_truth_conflict_candidates"("conflict_set_id")`,
  `CREATE INDEX IF NOT EXISTS "org_truth_conflict_candidates_org_entity_id_idx" ON "org_truth_conflict_candidates"("org_entity_id")`,
];

const REQUIRED_TABLES = ["org_truth_records", "org_truth_conflict_sets", "org_truth_conflict_candidates"] as const;
const REQUIRED_INDEXES = [
  "org_truth_records_org_entity_id_origin_key_key",
  "org_truth_records_one_promoted_per_key",
  "org_truth_conflict_sets_org_entity_id_origin_key_key",
  "org_truth_conflict_candidates_src_key",
] as const;

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
  console.log(`activate-org-truth-prod-schema.ts — [SECTION-10 ORG-TRUTH] additive-only

Applies ONLY: CREATE TABLE org_truth_records / org_truth_conflict_sets /
org_truth_conflict_candidates + their indexes (incl. a PARTIAL UNIQUE
"one PROMOTED per (org, truth_key)"). Idempotent (IF NOT EXISTS). Never
DROP/ALTER. Fresh tables (no backfill).

FLAGS  --dry-run  print target (redacted) + DDL; apply nothing.   --help
REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL   target DB (dotenv; redacted)
  ${APPROVAL_ENV}   must equal exactly "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<{ tables: Record<string, boolean>; indexes: Record<string, boolean>; rows: Record<string, number | null> }> {
  const tables: Record<string, boolean> = {};
  const rows: Record<string, number | null> = {};
  for (const t of REQUIRED_TABLES) {
    const r = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname=current_schema() AND tablename=$1) AS f`, t,
    );
    tables[t] = Boolean(r[0]?.f);
    if (tables[t]) {
      const c = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
      rows[t] = c[0] ? Number(c[0].n) : null;
    } else {
      rows[t] = null;
    }
  }
  const indexes: Record<string, boolean> = {};
  for (const i of REQUIRED_INDEXES) {
    const r = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=$1) AS f`, i,
    );
    indexes[i] = Boolean(r[0]?.f);
  }
  return { tables, indexes, rows };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return printHelp();
  const dryRun = argv.includes("--dry-run");
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    console.error("\n[activate] REFUSING: neither DIRECT_URL nor DATABASE_URL set (load via dotenv).\n");
    process.exit(1);
  }
  console.log("=== [SECTION-10 ORG-TRUTH] PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    CREATE TABLE org_truth_records / org_truth_conflict_sets / org_truth_conflict_candidates + indexes`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); fresh tables (no backfill); never DROP/ALTER existing`);

  if (dryRun) {
    console.log("\n--- DDL that WOULD be applied ---\n");
    for (const s of DDL) console.log(s + ";");
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
    console.log(`\nBefore: ${JSON.stringify(before)}`);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '30s'`);
      for (const s of DDL) await tx.$executeRawUnsafe(s);
    });
    const after = await present(prisma);
    console.log(`After:  ${JSON.stringify(after)}`);
    const tablesOk = REQUIRED_TABLES.every((t) => after.tables[t]);
    const indexesOk = REQUIRED_INDEXES.every((i) => after.indexes[i]);
    if (!tablesOk || !indexesOk) {
      console.error("\n[activate] FAILED: org-truth tables or required indexes not present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — org-truth substrate activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
