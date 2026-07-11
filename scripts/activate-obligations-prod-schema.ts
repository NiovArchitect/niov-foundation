// FILE: scripts/activate-obligations-prod-schema.ts
// PURPOSE: [OTZAR STAGE-2 §5/§7] Additive-ONLY production activation of the durable
//          organizational-obligation schema: the new `obligations` table + its indexes
//          (1 unique: (org_entity_id, origin_key); 8 non-unique). Same authorized mechanism
//          as scripts/activate-otzar-conversation-requests-*.ts: exact-scope, idempotent
//          (IF NOT EXISTS), approval-gated, secret-redacting, FIXED additive DDL — never
//          DROP/ALTER an existing object or column. All columns are new (fresh table).
//
//          Combines the CREATE-TABLE template (activate-otzar-conversation-requests) with the
//          reconcile-script rigor (SET LOCAL lock/statement timeouts; current_schema()-scoped
//          presence checks; post-apply verification; exit-code taxonomy).
//
//          DDL generated read-only via `prisma migrate diff` (origin/main → new) and verified
//          to contain only CREATE TABLE / CREATE INDEX (no ALTER/DROP of existing objects).
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-obligations-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-obligations-prod-schema.ts --dry-run
//   NIOV_APPROVE_OBLIGATIONS_PROD_SCHEMA='APPROVE OBLIGATIONS PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-obligations-prod-schema.ts
//
// EXIT CODES: 1 = no URL / approval mismatch; 2 = post-apply verification failed.
// CONNECTS TO: packages/database/prisma/schema.prisma (Obligation),
//              apps/api/src/startup/schema-manifest.ts (the `obligations` manifest entry
//              lands in the SAME PR as the runtime consumer, NOT before this table exists),
//              ADR-0025.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_OBLIGATIONS_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE OBLIGATIONS PROD SCHEMA ACTIVATION — additive only";

// FIXED additive DDL. Idempotent (IF NOT EXISTS). Never DROP/ALTER an existing object.
// Index names match `prisma migrate diff` output so they align with the test-tier `db push`.
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "obligations" (
    "obligation_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "subject_entity_id" UUID NOT NULL,
    "twin_entity_id" UUID,
    "subject_ref" UUID,
    "subject_ref_class" TEXT,
    "conversation_id" UUID,
    "source_turn_id" UUID,
    "request_record_id" UUID,
    "action_ref" UUID,
    "escalation_id" UUID,
    "parent_obligation_id" UUID,
    "superseded_obligation_id" UUID,
    "creator_entity_id" UUID NOT NULL,
    "responsible_entity_id" UUID NOT NULL,
    "assigned_workspace_id" UUID,
    "delegated_principal_id" UUID,
    "authority_scope" TEXT,
    "obligation_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "required_response_class" TEXT,
    "source_channel" TEXT NOT NULL DEFAULT 'CHAT',
    "provenance_class" TEXT NOT NULL DEFAULT 'CONVERSATION',
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "escalate_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "source_timezone" TEXT,
    "effective_at" TIMESTAMP(3),
    "acknowledged_turn_id" UUID,
    "completion_turn_id" UUID,
    "completion_action_ref" UUID,
    "completion_evidence" JSONB,
    "audit_event_id" UUID,
    "visibility_scope" TEXT NOT NULL DEFAULT 'SUBJECT',
    "retention_class" TEXT NOT NULL DEFAULT 'STANDARD',
    "origin_key" TEXT,
    CONSTRAINT "obligations_pkey" PRIMARY KEY ("obligation_id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "obligations_org_entity_id_origin_key_key" ON "obligations"("org_entity_id", "origin_key")`,
  `CREATE INDEX IF NOT EXISTS "obligations_org_entity_id_subject_entity_id_state_idx" ON "obligations"("org_entity_id", "subject_entity_id", "state")`,
  `CREATE INDEX IF NOT EXISTS "obligations_org_entity_id_state_created_at_idx" ON "obligations"("org_entity_id", "state", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "obligations_responsible_entity_id_state_idx" ON "obligations"("responsible_entity_id", "state")`,
  `CREATE INDEX IF NOT EXISTS "obligations_conversation_id_idx" ON "obligations"("conversation_id")`,
  `CREATE INDEX IF NOT EXISTS "obligations_request_record_id_idx" ON "obligations"("request_record_id")`,
  `CREATE INDEX IF NOT EXISTS "obligations_action_ref_idx" ON "obligations"("action_ref")`,
  `CREATE INDEX IF NOT EXISTS "obligations_parent_obligation_id_idx" ON "obligations"("parent_obligation_id")`,
  `CREATE INDEX IF NOT EXISTS "obligations_state_escalate_at_idx" ON "obligations"("state", "escalate_at")`,
];

// The unique index the startup schema-manifest will assert (correctness-critical: the
// create-or-get idempotency key). Verified present post-apply.
const REQUIRED_UNIQUE_INDEX = "obligations_org_entity_id_origin_key_key";

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
  console.log(`activate-obligations-prod-schema.ts — [OTZAR STAGE-2 §5] additive-only

Applies ONLY: CREATE TABLE obligations + 9 indexes (1 unique: (org_entity_id, origin_key)).
Idempotent (IF NOT EXISTS). Never DROP/ALTER. Fresh table (no backfill).

FLAGS  --dry-run  print target (redacted) + DDL; apply nothing.   --help
REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL   target DB (dotenv; redacted)
  ${APPROVAL_ENV}   must equal exactly "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<{ table: boolean; uniqueIdx: boolean; rowCount: number | null }> {
  const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname=current_schema() AND tablename='obligations') AS f`,
  );
  const tableExists = Boolean(t[0]?.f);
  const idx = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = current_schema() AND c.relname = $1
     ) AS f`,
    REQUIRED_UNIQUE_INDEX,
  );
  let rowCount: number | null = null;
  if (tableExists) {
    const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint AS n FROM "obligations"`);
    rowCount = r[0] ? Number(r[0].n) : null;
  }
  return { table: tableExists, uniqueIdx: Boolean(idx[0]?.f), rowCount };
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
  console.log("=== [OTZAR STAGE-2 §5] OBLIGATIONS PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    CREATE TABLE obligations + 9 indexes (1 unique)`);
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
    console.log(`\nBefore: obligations_table=${before.table} unique_idx=${before.uniqueIdx} rows=${before.rowCount ?? "n/a"}`);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '30s'`);
      for (const s of DDL) await tx.$executeRawUnsafe(s);
    });
    const after = await present(prisma);
    console.log(`After:  obligations_table=${after.table} unique_idx=${after.uniqueIdx} rows=${after.rowCount ?? "n/a"}`);
    // Post-apply verification: table + the correctness-critical unique index must exist, and a
    // pre-existing table must not have lost rows (a fresh table reads 0).
    if (!after.table || !after.uniqueIdx) {
      console.error("\n[activate] FAILED: obligations table or unique index not present after apply.\n");
      process.exit(2);
    }
    if (before.table && before.rowCount !== null && after.rowCount !== null && before.rowCount !== after.rowCount) {
      console.error(`\n[activate] FAILED: obligations row count changed (${before.rowCount} → ${after.rowCount}).\n`);
      process.exit(2);
    }
    console.log("\n[activate] DONE — obligations schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
