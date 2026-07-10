// FILE: scripts/activate-otzar-conversation-turns-prod-schema.ts
// PURPOSE: [OTZAR-CONTINUITY P5A] Additive-ONLY production activation of the
//          durable conversation-turn transcript schema:
//            - 5 nullable/defaulted columns ADDED to `otzar_conversations`
//              (org_entity_id, last_active_at, timezone, summary_version,
//               retention_class) + 1 composite index,
//            - the new `otzar_conversation_turns` table + its 4 indexes
//              (2 unique: (conversation_id, sequence) and
//               (conversation_id, request_id)).
//          Same authorized mechanism as scripts/activate-cohort-*-prod-schema.ts:
//          exact-scope, idempotent, approval-gated, secret-redacting, FIXED
//          hardcoded additive DDL — can never DROP/ALTER an existing object or
//          column. All added columns are nullable or defaulted (no backfill).
//
//          DDL generated read-only via `prisma migrate diff
//          --from-schema-datamodel <origin/main schema> --to-schema-datamodel
//          <new schema> --script` and verified to contain ONLY
//          ALTER TABLE ADD COLUMN / CREATE TABLE / CREATE INDEX (no DROP/ALTER
//          of existing objects). Rendered idempotent here (IF NOT EXISTS).
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-otzar-conversation-turns-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-otzar-conversation-turns-prod-schema.ts --dry-run
//   NIOV_APPROVE_OTZAR_CONTINUITY_PROD_SCHEMA='APPROVE OTZAR CONTINUITY PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-otzar-conversation-turns-prod-schema.ts
//
// CONNECTS TO: packages/database/prisma/schema.prisma (OtzarConversation additive
//              fields + OtzarConversationTurn model),
//              packages/database/src/queries/otzar-conversation-turns.ts,
//              ADR-0025 (Schema-Push-Target Discipline; raw-DDL additive path).

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_OTZAR_CONTINUITY_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE OTZAR CONTINUITY PROD SCHEMA ACTIVATION — additive only";

// All 5 columns are nullable or defaulted → no backfill, safe on a populated table.
const DDL_ALTER_CONVERSATIONS = `ALTER TABLE "otzar_conversations"
  ADD COLUMN IF NOT EXISTS "org_entity_id" UUID,
  ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "timezone" TEXT,
  ADD COLUMN IF NOT EXISTS "summary_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retention_class" TEXT NOT NULL DEFAULT 'STANDARD';`;

const DDL_TABLE_TURNS = `CREATE TABLE IF NOT EXISTS "otzar_conversation_turns" (
    "turn_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "org_entity_id" UUID,
    "actor_entity_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "request_id" TEXT,
    "reply_to_turn_id" UUID,
    "action_ref" UUID,
    "supersedes_turn_id" UUID,
    "source_channel" TEXT NOT NULL DEFAULT 'CHAT',
    "model_provider" TEXT,
    "retention_class" TEXT NOT NULL DEFAULT 'STANDARD',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otzar_conversation_turns_pkey" PRIMARY KEY ("turn_id")
);`;

const DDL_INDEXES = [
  `CREATE INDEX IF NOT EXISTS "otzar_conversations_org_entity_id_entity_id_last_active_at_idx" ON "otzar_conversations"("org_entity_id", "entity_id", "last_active_at");`,
  `CREATE INDEX IF NOT EXISTS "otzar_conversation_turns_conversation_id_created_at_idx" ON "otzar_conversation_turns"("conversation_id", "created_at");`,
  `CREATE INDEX IF NOT EXISTS "otzar_conversation_turns_actor_entity_id_idx" ON "otzar_conversation_turns"("actor_entity_id");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "otzar_conversation_turns_conversation_id_sequence_key" ON "otzar_conversation_turns"("conversation_id", "sequence");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "otzar_conversation_turns_conversation_id_request_id_key" ON "otzar_conversation_turns"("conversation_id", "request_id");`,
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
  console.log(`activate-otzar-conversation-turns-prod-schema.ts — [OTZAR-CONTINUITY P5A] additive-only activation

Applies ONLY: ALTER TABLE otzar_conversations ADD COLUMN (×5, nullable/defaulted);
CREATE TABLE otzar_conversation_turns; 5 CREATE INDEX (2 unique). Idempotent
(IF NOT EXISTS). Never DROP/ALTER an existing object or column. No backfill.

FLAGS
  --dry-run   Print target (redacted) + the exact DDL; apply nothing.
  --help      This message.

REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL          target DB (via dotenv; redacted in output)
  ${APPROVAL_ENV}    must equal exactly:
      "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<{ turns: boolean; orgCol: boolean }> {
  const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='otzar_conversation_turns') AS f`,
  );
  const c = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='otzar_conversations' AND column_name='org_entity_id') AS f`,
  );
  return { turns: Boolean(t[0]?.f), orgCol: Boolean(c[0]?.f) };
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

  console.log("=== [OTZAR-CONTINUITY P5A] CONVERSATION-TURN PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    ADD 5 cols to otzar_conversations + CREATE TABLE otzar_conversation_turns + 5 indexes`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); nullable/defaulted cols (no backfill); never DROP/ALTER existing`);

  if (dryRun) {
    console.log("\n--- DDL that WOULD be applied ---\n");
    console.log(DDL_ALTER_CONVERSATIONS);
    console.log(DDL_TABLE_TURNS);
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
    console.log(`\nBefore: turns_table=${before.turns} org_col=${before.orgCol}`);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(DDL_ALTER_CONVERSATIONS);
      await tx.$executeRawUnsafe(DDL_TABLE_TURNS);
      for (const idx of DDL_INDEXES) await tx.$executeRawUnsafe(idx);
    });
    const after = await present(prisma);
    console.log(`After:  turns_table=${after.turns} org_col=${after.orgCol}`);
    if (!after.turns || !after.orgCol) {
      console.error("\n[activate] FAILED: conversation-turn objects not present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — conversation-turn transcript schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
