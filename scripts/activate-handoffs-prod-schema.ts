// FILE: scripts/activate-handoffs-prod-schema.ts
// PURPOSE: [OTZAR STAGE-2 §L] Additive-ONLY production activation of the durable handoff schema:
//          the new `handoffs` + `handoff_obligations` tables + their indexes (2 unique). Same
//          authorized mechanism as scripts/activate-obligations-prod-schema.ts: exact-scope,
//          idempotent (IF NOT EXISTS), approval-gated, secret-redacting, FIXED additive DDL —
//          never DROP/ALTER an existing object. All columns are new (fresh tables).
//          SET LOCAL lock/statement timeouts; current_schema()-scoped presence + post-apply
//          verification; exit-code taxonomy. DDL generated read-only via `prisma migrate diff`.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-handoffs-prod-schema.ts --help
//   node --require dotenv/config --import tsx scripts/activate-handoffs-prod-schema.ts --dry-run
//   NIOV_APPROVE_HANDOFFS_PROD_SCHEMA='APPROVE HANDOFFS PROD SCHEMA ACTIVATION — additive only' \
//     node --require dotenv/config --import tsx scripts/activate-handoffs-prod-schema.ts
//
// EXIT CODES: 1 = no URL / approval mismatch; 2 = post-apply verification failed.
// CONNECTS TO: packages/database/prisma/schema.prisma (Handoff, HandoffObligation),
//              apps/api/src/startup/schema-manifest.ts (manifest entries land with the runtime
//              consumer PR, NOT before these tables exist), ADR-0025.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_HANDOFFS_PROD_SCHEMA";
const APPROVAL_PHRASE = "APPROVE HANDOFFS PROD SCHEMA ACTIVATION — additive only";

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "handoffs" (
    "handoff_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "twin_entity_id" UUID,
    "subject_ref" UUID,
    "subject_ref_class" TEXT,
    "creator_entity_id" UUID NOT NULL,
    "outgoing_responsible_entity_id" UUID NOT NULL,
    "incoming_responsible_entity_id" UUID,
    "workspace_id" UUID,
    "conversation_id" UUID,
    "source_turn_id" UUID,
    "escalation_id" UUID,
    "parent_handoff_id" UUID,
    "superseded_handoff_id" UUID,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "state" TEXT NOT NULL DEFAULT 'DRAFTED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ready_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "clarification_requested_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "acknowledged_turn_id" UUID,
    "acknowledged_by_entity_id" UUID,
    "audit_event_id" UUID,
    "visibility_scope" TEXT NOT NULL DEFAULT 'TEAM',
    "retention_class" TEXT NOT NULL DEFAULT 'STANDARD',
    "origin_key" TEXT,
    CONSTRAINT "handoffs_pkey" PRIMARY KEY ("handoff_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "handoff_obligations" (
    "handoff_obligation_id" UUID NOT NULL,
    "handoff_id" UUID NOT NULL,
    "obligation_id" UUID NOT NULL,
    "org_entity_id" UUID NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'PENDING',
    "disposition_at" TIMESTAMP(3),
    "disposition_by_entity_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "handoff_obligations_pkey" PRIMARY KEY ("handoff_obligation_id")
  )`,
  `CREATE INDEX IF NOT EXISTS "handoffs_org_entity_id_state_created_at_idx" ON "handoffs"("org_entity_id", "state", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "handoffs_outgoing_responsible_entity_id_state_idx" ON "handoffs"("outgoing_responsible_entity_id", "state")`,
  `CREATE INDEX IF NOT EXISTS "handoffs_incoming_responsible_entity_id_state_idx" ON "handoffs"("incoming_responsible_entity_id", "state")`,
  `CREATE INDEX IF NOT EXISTS "handoffs_workspace_id_state_idx" ON "handoffs"("workspace_id", "state")`,
  `CREATE INDEX IF NOT EXISTS "handoffs_conversation_id_idx" ON "handoffs"("conversation_id")`,
  `CREATE INDEX IF NOT EXISTS "handoffs_parent_handoff_id_idx" ON "handoffs"("parent_handoff_id")`,
  `CREATE INDEX IF NOT EXISTS "handoffs_state_due_at_idx" ON "handoffs"("state", "due_at")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "handoffs_org_entity_id_origin_key_key" ON "handoffs"("org_entity_id", "origin_key")`,
  `CREATE INDEX IF NOT EXISTS "handoff_obligations_handoff_id_idx" ON "handoff_obligations"("handoff_id")`,
  `CREATE INDEX IF NOT EXISTS "handoff_obligations_obligation_id_idx" ON "handoff_obligations"("obligation_id")`,
  `CREATE INDEX IF NOT EXISTS "handoff_obligations_org_entity_id_idx" ON "handoff_obligations"("org_entity_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "handoff_obligations_handoff_id_obligation_id_key" ON "handoff_obligations"("handoff_id", "obligation_id")`,
];

const REQUIRED = [
  { kind: "table", name: "handoffs" },
  { kind: "table", name: "handoff_obligations" },
  { kind: "index", name: "handoffs_org_entity_id_origin_key_key" },
  { kind: "index", name: "handoff_obligations_handoff_id_obligation_id_key" },
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
  console.log(`activate-handoffs-prod-schema.ts — [OTZAR STAGE-2 §L] additive-only

Applies ONLY: CREATE TABLE handoffs + handoff_obligations + their indexes (2 unique). Idempotent
(IF NOT EXISTS). Never DROP/ALTER. Fresh tables (no backfill).

FLAGS  --dry-run  print target (redacted) + DDL; apply nothing.   --help
REQUIRED ENV FOR A REAL APPLY
  DATABASE_URL / DIRECT_URL   target DB (dotenv; redacted)
  ${APPROVAL_ENV}   must equal exactly "${APPROVAL_PHRASE}"
`);
}

async function present(prisma: PrismaClient): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const r of REQUIRED) {
    if (r.kind === "table") {
      const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
        `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname=current_schema() AND tablename=$1) AS f`, r.name,
      );
      out[r.name] = Boolean(t[0]?.f);
    } else {
      const i = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
        `SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=$1) AS f`, r.name,
      );
      out[r.name] = Boolean(i[0]?.f);
    }
  }
  return out;
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
  console.log("=== [OTZAR STAGE-2 §L] HANDOFFS PROD SCHEMA ACTIVATION (additive-only) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    CREATE TABLE handoffs + handoff_obligations + indexes (2 unique)`);
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
    if (!Object.values(after).every(Boolean)) {
      console.error("\n[activate] FAILED: not all handoff objects present after apply.\n");
      process.exit(2);
    }
    console.log("\n[activate] DONE — handoff schema activated (additive-only).\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[activate] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
