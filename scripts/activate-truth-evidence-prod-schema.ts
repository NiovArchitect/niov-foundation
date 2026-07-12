// FILE: scripts/activate-truth-evidence-prod-schema.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE] Additive-ONLY production activation of the point-in-time
//          evidence-snapshot schema: the new `truth_evidence_snapshots` table + its indexes (1
//          unique). Same authorized mechanism as scripts/activate-obligations/handoffs-*.ts:
//          exact-scope, idempotent (IF NOT EXISTS), approval-gated, secret-redacting, FIXED
//          additive DDL — never DROP/ALTER an existing object. Fresh table (no backfill). SET
//          LOCAL lock/statement timeouts; current_schema()-scoped presence + post-apply verify.
//          DDL generated read-only via `prisma migrate diff`.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-truth-evidence-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-truth-evidence-prod-schema.ts --dry-run
//   NIOV_APPROVE_TRUTH_EVIDENCE_PROD_SCHEMA='APPROVE TRUTH EVIDENCE PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-truth-evidence-prod-schema.ts
//
// EXIT CODES: 1 = no URL / approval mismatch; 2 = post-apply verification failed.
// CONNECTS TO: packages/database/prisma/schema.prisma (TruthEvidenceSnapshot),
//              apps/api/src/startup/schema-manifest.ts (manifest entry lands with the runtime
//              consumer PR, NOT before this table exists), ADR-0025.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_TRUTH_EVIDENCE_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE TRUTH EVIDENCE PROD SCHEMA ACTIVATION — additive only";

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "truth_evidence_snapshots" (
    "snapshot_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "subject_entity_id" UUID,
    "twin_entity_id" UUID,
    "subject_ref" UUID,
    "subject_ref_class" TEXT,
    "decision_point" TEXT NOT NULL,
    "source_record_type" TEXT NOT NULL,
    "source_record_id" UUID NOT NULL,
    "source_version" INTEGER,
    "source_hash" TEXT,
    "source_timestamp" TIMESTAMP(3),
    "source_system" TEXT,
    "source_integrity_state" TEXT,
    "communication_act" TEXT,
    "truth_class" TEXT,
    "truth_weight_rank" INTEGER,
    "authority_class" TEXT,
    "authority_lineage_ref" TEXT,
    "agreement_lineage_ref" TEXT,
    "decision_rights_ref" TEXT,
    "currentness" TEXT,
    "permission_snapshot" JSONB,
    "conflict_indicator" BOOLEAN NOT NULL DEFAULT false,
    "conflict_set_ref" TEXT,
    "superseded_at_capture" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolver_version" TEXT NOT NULL,
    "evidence_fingerprint" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "origin_key" TEXT,
    "obligation_id" UUID,
    "handoff_id" UUID,
    "handoff_obligation_id" UUID,
    "request_record_id" UUID,
    "action_ref" UUID,
    "source_turn_id" UUID,
    "conversation_id" UUID,
    "audit_event_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "truth_evidence_snapshots_pkey" PRIMARY KEY ("snapshot_id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "truth_evidence_snapshots_org_entity_id_origin_key_key" ON "truth_evidence_snapshots"("org_entity_id", "origin_key")`,
  `CREATE INDEX IF NOT EXISTS "truth_evidence_snapshots_org_entity_id_source_record_type_s_idx" ON "truth_evidence_snapshots"("org_entity_id", "source_record_type", "source_record_id")`,
  `CREATE INDEX IF NOT EXISTS "truth_evidence_snapshots_obligation_id_idx" ON "truth_evidence_snapshots"("obligation_id")`,
  `CREATE INDEX IF NOT EXISTS "truth_evidence_snapshots_handoff_id_idx" ON "truth_evidence_snapshots"("handoff_id")`,
  `CREATE INDEX IF NOT EXISTS "truth_evidence_snapshots_evidence_fingerprint_idx" ON "truth_evidence_snapshots"("evidence_fingerprint")`,
  `CREATE INDEX IF NOT EXISTS "truth_evidence_snapshots_source_record_id_idx" ON "truth_evidence_snapshots"("source_record_id")`,
  `CREATE INDEX IF NOT EXISTS "truth_evidence_snapshots_conversation_id_idx" ON "truth_evidence_snapshots"("conversation_id")`,
];

const REQUIRED_UNIQUE = "truth_evidence_snapshots_org_entity_id_origin_key_key";

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
  console.log(`activate-truth-evidence-prod-schema.ts — [OTZAR STAGE-2 TRUTH-EVIDENCE] additive-only

Applies ONLY: CREATE TABLE truth_evidence_snapshots + indexes (1 unique). Idempotent (IF NOT
EXISTS). Never DROP/ALTER. Fresh table (no backfill).

FLAGS  --dry-run  print target (redacted) + DDL; apply nothing.   --help
REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL   target DB (dotenv; redacted)
  ${APPROVAL_ENV}   must equal exactly "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<{ table: boolean; uniq: boolean; rows: number | null }> {
  const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname=current_schema() AND tablename='truth_evidence_snapshots') AS f`,
  );
  const table = Boolean(t[0]?.f);
  const i = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=$1) AS f`, REQUIRED_UNIQUE,
  );
  let rows: number | null = null;
  if (table) {
    const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint AS n FROM "truth_evidence_snapshots"`);
    rows = r[0] ? Number(r[0].n) : null;
  }
  return { table, uniq: Boolean(i[0]?.f), rows };
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
  console.log("=== [OTZAR STAGE-2 TRUTH-EVIDENCE] PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    CREATE TABLE truth_evidence_snapshots + indexes (1 unique)`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); fresh table (no backfill); never DROP/ALTER existing`);

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
    if (!after.table || !after.uniq) {
      console.error("\n[activate] FAILED: truth_evidence_snapshots table or unique index not present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — truth-evidence schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
