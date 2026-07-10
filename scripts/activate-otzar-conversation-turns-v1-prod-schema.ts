// FILE: scripts/activate-otzar-conversation-turns-v1-prod-schema.ts
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1] CORRECTION of the empty v0 conversation-turn
//          draft (activated by activate-otzar-conversation-turns-prod-schema.ts before
//          the schema contract was finalized) to the production-shaped v1 model
//          (docs/otzar/OTZAR_CONTINUITY_SCHEMA_CONTRACT.md):
//            - otzar_conversation_turns: DROP the two ambiguous v0-only columns
//              (actor_entity_id, visibility); ADD subject_entity_id/author_entity_id
//              (NOT NULL), twin_entity_id, content_hash (NOT NULL); SET org_entity_id
//              NOT NULL; swap the actor index for (org, subject).
//            - otzar_conversations: ADD archived_at, deleted_at, retention_expires_at,
//              last_summary_at, turn_seq (atomic sequence allocator).
//
// SAFETY: The DROP/ADD-NOT-NULL steps are safe ONLY because the v0 table is EMPTY and
//         UNUSED (no runtime ever wrote it). This script therefore REFUSES to run if
//         otzar_conversation_turns contains ANY row — the correction can never destroy
//         data. Idempotent (IF EXISTS / IF NOT EXISTS). Approval-gated. Secret-
//         redacting. DDL generated read-only via `prisma migrate diff` (v0 → v1).
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-otzar-conversation-turns-v1-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-otzar-conversation-turns-v1-prod-schema.ts --dry-run
//   NIOV_APPROVE_OTZAR_CONTINUITY_V1_PROD_SCHEMA='APPROVE OTZAR CONTINUITY V1 PROD SCHEMA CORRECTION — empty-draft only' \
//     node --require dotenv/config --import tsx scripts/activate-otzar-conversation-turns-v1-prod-schema.ts
//
// CONNECTS TO: packages/database/prisma/schema.prisma (OtzarConversation +
//              OtzarConversationTurn v1), scripts/activate-otzar-conversation-turns-prod-schema.ts
//              (the v0 it corrects), ADR-0025.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_OTZAR_CONTINUITY_V1_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE OTZAR CONTINUITY V1 PROD SCHEMA CORRECTION — empty-draft only";

const DDL_ALTER_CONVERSATIONS = `ALTER TABLE "otzar_conversations"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_summary_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retention_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "turn_seq" INTEGER NOT NULL DEFAULT 0;`;

const DDL_DROP_ACTOR_INDEX = `DROP INDEX IF EXISTS "otzar_conversation_turns_actor_entity_id_idx";`;

const DDL_ALTER_TURNS = `ALTER TABLE "otzar_conversation_turns"
  DROP COLUMN IF EXISTS "actor_entity_id",
  DROP COLUMN IF EXISTS "visibility",
  ADD COLUMN IF NOT EXISTS "subject_entity_id" UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS "author_entity_id" UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS "twin_entity_id" UUID,
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT NOT NULL,
  ALTER COLUMN "org_entity_id" SET NOT NULL;`;

const DDL_SUBJECT_INDEX = `CREATE INDEX IF NOT EXISTS "otzar_conversation_turns_org_entity_id_subject_entity_id_idx" ON "otzar_conversation_turns"("org_entity_id", "subject_entity_id");`;

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
  console.log(`activate-otzar-conversation-turns-v1-prod-schema.ts — [OTZAR-CONTINUITY P5 Stage 1] empty-draft correction

Corrects the EMPTY v0 otzar_conversation_turns table to the v1 model + adds
otzar_conversations lifecycle columns. REFUSES if the turns table has any row.
Idempotent (IF EXISTS / IF NOT EXISTS). Approval-gated.

FLAGS
  --dry-run   Print target (redacted) + row-count guard + the exact DDL; apply nothing.
  --help      This message.

REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL          target DB (via dotenv; redacted in output)
  ${APPROVAL_ENV}    must equal exactly:
      "${APPROVAL_PHRASE}"
`);
}

async function turnRowCount(prisma: PrismaClient): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
    `SELECT count(*)::int AS c FROM otzar_conversation_turns`,
  );
  return Number(r[0]?.c ?? 0);
}

async function shape(prisma: PrismaClient): Promise<{ subject: boolean; actor: boolean; turnSeq: boolean }> {
  const q = async (table: string, col: string): Promise<boolean> => {
    const r = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${col}') AS f`,
    );
    return Boolean(r[0]?.f);
  };
  return {
    subject: await q("otzar_conversation_turns", "subject_entity_id"),
    actor: await q("otzar_conversation_turns", "actor_entity_id"),
    turnSeq: await q("otzar_conversations", "turn_seq"),
  };
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

  console.log("=== [OTZAR-CONTINUITY P5 Stage 1] CONVERSATION-TURN v0→v1 CORRECTION (empty-draft only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    correct otzar_conversation_turns identity model + add otzar_conversations lifecycle cols`);
  console.log(`Safety:   REFUSES if the turns table has any row; idempotent (IF EXISTS/IF NOT EXISTS)`);

  const prisma = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  try {
    const rows = await turnRowCount(prisma);
    const before = await shape(prisma);
    console.log(`\nGuard:  otzar_conversation_turns row count = ${rows}`);
    console.log(`Before: subject_col=${before.subject} actor_col=${before.actor} turn_seq_col=${before.turnSeq}`);

    if (rows > 0) {
      console.error(`\n[activate] REFUSING: turns table has ${rows} row(s) — the correction drops columns and would risk data. Aborting.\n`);
      process.exit(3);
    }

    if (dryRun) {
      console.log("\n--- DDL that WOULD be applied ---\n");
      console.log(DDL_ALTER_CONVERSATIONS);
      console.log(DDL_DROP_ACTOR_INDEX);
      console.log(DDL_ALTER_TURNS);
      console.log(DDL_SUBJECT_INDEX);
      console.log("\n[activate] DRY-RUN — nothing applied.\n");
      return;
    }

    if ((process.env[APPROVAL_ENV] ?? "") !== APPROVAL_PHRASE) {
      console.error(`\n[activate] REFUSING: ${APPROVAL_ENV} must equal exactly the approval phrase.\n`);
      process.exit(1);
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(DDL_ALTER_CONVERSATIONS);
      await tx.$executeRawUnsafe(DDL_DROP_ACTOR_INDEX);
      await tx.$executeRawUnsafe(DDL_ALTER_TURNS);
      await tx.$executeRawUnsafe(DDL_SUBJECT_INDEX);
    });

    const after = await shape(prisma);
    console.log(`After:  subject_col=${after.subject} actor_col=${after.actor} turn_seq_col=${after.turnSeq}`);
    if (!after.subject || after.actor || !after.turnSeq) {
      console.error("\n[activate] FAILED: v1 shape not achieved after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — conversation-turn schema corrected to v1 (empty-draft only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
