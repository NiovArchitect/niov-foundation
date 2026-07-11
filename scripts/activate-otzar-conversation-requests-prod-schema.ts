// FILE: scripts/activate-otzar-conversation-requests-prod-schema.ts
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 §2] Additive-ONLY production activation of the
//          durable logical-request processing schema:
//            - otzar_conversation_turns += response_to_turn_id (nullable) + its UNIQUE
//              index (the one-canonical-response backstop),
//            - the new otzar_conversation_requests table + its indexes (3 unique:
//              user_turn_id, canonical_assistant_turn_id, (conversation_id,
//              client_request_id)).
//          Same authorized mechanism as scripts/activate-otzar-conversation-turns-*.ts:
//          exact-scope, idempotent (IF NOT EXISTS), approval-gated, secret-redacting,
//          FIXED additive DDL — never DROP/ALTER an existing object or column. All added
//          columns are nullable (no backfill).
//
//          DDL generated read-only via `prisma migrate diff` (origin/main → new) and
//          verified to contain only ADD COLUMN / CREATE TABLE / CREATE INDEX.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-otzar-conversation-requests-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-otzar-conversation-requests-prod-schema.ts --dry-run
//   NIOV_APPROVE_OTZAR_REQUESTS_PROD_SCHEMA='APPROVE OTZAR REQUESTS PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-otzar-conversation-requests-prod-schema.ts
//
// CONNECTS TO: packages/database/prisma/schema.prisma (OtzarConversationRequest +
//              OtzarConversationTurn.response_to_turn_id),
//              apps/api/src/startup/schema-manifest.ts, ADR-0025.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_OTZAR_REQUESTS_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE OTZAR REQUESTS PROD SCHEMA ACTIVATION — additive only";

const DDL: string[] = [
  `ALTER TABLE "otzar_conversation_turns" ADD COLUMN IF NOT EXISTS "response_to_turn_id" UUID`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "otzar_conversation_turns_response_to_turn_id_key" ON "otzar_conversation_turns"("response_to_turn_id")`,
  `CREATE TABLE IF NOT EXISTS "otzar_conversation_requests" (
    "request_record_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_turn_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "subject_entity_id" UUID NOT NULL,
    "twin_entity_id" UUID NOT NULL,
    "client_request_id" TEXT,
    "content_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RECEIVED',
    "processing_version" INTEGER NOT NULL DEFAULT 0,
    "lease_token" TEXT,
    "lease_acquired_at" TIMESTAMP(3),
    "lease_expires_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "canonical_assistant_turn_id" UUID,
    "action_ref" UUID,
    "provider_attempt_ref" UUID,
    "response_class" TEXT,
    "failure_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "otzar_conversation_requests_pkey" PRIMARY KEY ("request_record_id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "otzar_conversation_requests_user_turn_id_key" ON "otzar_conversation_requests"("user_turn_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "otzar_conversation_requests_canonical_assistant_turn_id_key" ON "otzar_conversation_requests"("canonical_assistant_turn_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "otzar_conversation_requests_conversation_id_client_request__key" ON "otzar_conversation_requests"("conversation_id", "client_request_id")`,
  `CREATE INDEX IF NOT EXISTS "otzar_conversation_requests_conversation_id_idx" ON "otzar_conversation_requests"("conversation_id")`,
  `CREATE INDEX IF NOT EXISTS "otzar_conversation_requests_org_entity_id_subject_entity_id_idx" ON "otzar_conversation_requests"("org_entity_id", "subject_entity_id")`,
  `CREATE INDEX IF NOT EXISTS "otzar_conversation_requests_state_lease_expires_at_idx" ON "otzar_conversation_requests"("state", "lease_expires_at")`,
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
  console.log(`activate-otzar-conversation-requests-prod-schema.ts — [OTZAR-CONTINUITY P5 Stage 1 §2] additive-only

Applies ONLY: ADD COLUMN otzar_conversation_turns.response_to_turn_id + its UNIQUE index;
CREATE TABLE otzar_conversation_requests + 6 indexes (3 unique). Idempotent (IF NOT
EXISTS). Never DROP/ALTER. No backfill.

FLAGS  --dry-run  print target (redacted) + DDL; apply nothing.   --help
REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL   target DB (dotenv; redacted)
  ${APPROVAL_ENV}   must equal exactly "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<{ table: boolean; col: boolean }> {
  const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='otzar_conversation_requests') AS f`,
  );
  const c = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='otzar_conversation_turns' AND column_name='response_to_turn_id') AS f`,
  );
  return { table: Boolean(t[0]?.f), col: Boolean(c[0]?.f) };
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
  console.log("=== [OTZAR-CONTINUITY P5 Stage 1 §2] REQUEST-PROCESSING PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    ADD otzar_conversation_turns.response_to_turn_id + CREATE TABLE otzar_conversation_requests`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); nullable cols (no backfill); never DROP/ALTER existing`);

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
    console.log(`\nBefore: requests_table=${before.table} response_to_turn_id_col=${before.col}`);
    await prisma.$transaction(async (tx) => {
      for (const s of DDL) await tx.$executeRawUnsafe(s);
    });
    const after = await present(prisma);
    console.log(`After:  requests_table=${after.table} response_to_turn_id_col=${after.col}`);
    if (!after.table || !after.col) {
      console.error("\n[activate] FAILED: request-processing objects not present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — request-processing schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
