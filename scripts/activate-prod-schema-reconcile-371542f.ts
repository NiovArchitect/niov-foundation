// FILE: activate-prod-schema-reconcile-371542f.ts
// PURPOSE: [INCIDENT 2026-07-10] COORDINATED additive-only production schema
//          reconciliation for the CURRENTLY-LIVE Foundation SHA `371542f`. That
//          SHA's Prisma client expects columns prod is missing, so live is
//          actively failing `memoryCapsule.create()` ("column
//          memory_capsules.voice_note_id does not exist") and would fail
//          connector/OAuth reads on the six absent identity columns.
//
//          This applies EVERY runtime-required additive object the live SHA needs
//          — NOT a piecemeal identity-only apply (that would leave memory_capsules
//          still broken and flip the identity guard falsely green):
//            A. integration_credentials: 6 nullable identity columns (FND 371542f)
//            B. memory_capsules.voice_note_id UUID (nullable) + its index
//               (FND 615b6b1, shipped 2026-06-22 — client shipped, schema never
//               applied to prod; the active incident).
//          The cosmetic index RENAME on external_collaborator_identifiers is
//          deliberately EXCLUDED (not availability-critical; a rename is not
//          IF-NOT-EXISTS-idempotent → avoidable risk).
//
//          Same authorized mechanism as scripts/activate-decision-rights-prod-schema.ts
//          and the cohort activations: exact-scope, idempotent, approval-gated,
//          secret-redacting, FIXED hardcoded additive DDL — can never DROP/ALTER an
//          existing object or rewrite/backfill a row. All columns nullable → no
//          existing row is touched.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/activate-prod-schema-reconcile-371542f.ts --help
//   node --require dotenv/config --import tsx scripts/activate-prod-schema-reconcile-371542f.ts --dry-run
//   NIOV_APPROVE_PROD_SCHEMA_RECONCILE_371542F='APPROVE PROD SCHEMA RECONCILE 371542f — additive only (6 identity + voice_note_id + idx)' \
//     node --require dotenv/config --import tsx scripts/activate-prod-schema-reconcile-371542f.ts
//
// CONNECTS TO: packages/database/prisma/schema.prisma (IntegrationCredential, MemoryCapsule),
//              apps/api/src/startup/integration-credential-schema-guard.ts,
//              ADR-0025 (Schema-Push-Target Discipline; raw-DDL additive path).

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_PROD_SCHEMA_RECONCILE_371542F";
const APPROVAL_PHRASE =
  "APPROVE PROD SCHEMA RECONCILE 371542f — additive only (6 identity + voice_note_id + idx)";

// column: table.column → (DDL type, expected information_schema.data_type, precision?)
const COLUMNS: ReadonlyArray<{
  table: string;
  name: string;
  ddlType: string;
  dataType: string;
  datetimePrecision?: number;
}> = [
  { table: "integration_credentials", name: "external_account_subject", ddlType: "TEXT", dataType: "text" },
  { table: "integration_credentials", name: "external_account_email", ddlType: "TEXT", dataType: "text" },
  { table: "integration_credentials", name: "external_account_email_verified", ddlType: "BOOLEAN", dataType: "boolean" },
  { table: "integration_credentials", name: "external_account_issuer", ddlType: "TEXT", dataType: "text" },
  { table: "integration_credentials", name: "external_account_pinned_at", ddlType: "TIMESTAMP(3)", dataType: "timestamp without time zone", datetimePrecision: 3 },
  { table: "integration_credentials", name: "external_account_last_verified_at", ddlType: "TIMESTAMP(3)", dataType: "timestamp without time zone", datetimePrecision: 3 },
  { table: "memory_capsules", name: "voice_note_id", ddlType: "UUID", dataType: "uuid" },
];

const INDEX = {
  name: "memory_capsules_voice_note_id_idx",
  ddl: `CREATE INDEX IF NOT EXISTS "memory_capsules_voice_note_id_idx" ON "memory_capsules"("voice_note_id");`,
};

const TABLES = ["integration_credentials", "memory_capsules"] as const;

function columnDdl(table: string, name: string, ddlType: string): string {
  return `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${name}" ${ddlType};`;
}

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
  console.log(`activate-prod-schema-reconcile-371542f.ts — COORDINATED additive-only reconcile

Applies (idempotent IF NOT EXISTS; never DROP/ALTER; nullable; no backfill):
  - 6 identity columns on integration_credentials
  - voice_note_id UUID on memory_capsules + memory_capsules_voice_note_id_idx
Excludes the cosmetic external_collaborator_identifiers index RENAME (not idempotent).

FLAGS
  --dry-run   Print target (redacted) + DDL + current presence; apply nothing.
  --help      This message.

REQUIRED ENV FOR A REAL APPLY
  DIRECT_URL / DATABASE_URL          target DB (via dotenv; redacted in output)
  ${APPROVAL_ENV}    must equal exactly:
      "${APPROVAL_PHRASE}"
`);
}

interface ColumnFact { table: string; name: string; present: boolean; is_nullable: string | null; data_type: string | null; datetime_precision: number | null; }

async function inspect(prisma: PrismaClient): Promise<{ tables: Record<string, boolean>; columns: ColumnFact[]; indexPresent: boolean; rowCounts: Record<string, number | null>; }> {
  const tables: Record<string, boolean> = {};
  const rowCounts: Record<string, number | null> = {};
  const columns: ColumnFact[] = [];
  for (const table of TABLES) {
    const t = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = '${table}') AS f`,
    );
    tables[table] = Boolean(t[0]?.f);
    if (tables[table]) {
      const c = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
      rowCounts[table] = c[0] !== undefined ? Number(c[0].n) : null;
    } else {
      rowCounts[table] = null;
    }
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string; is_nullable: string; data_type: string; datetime_precision: number | null }>>(
    `SELECT table_name, column_name, is_nullable, data_type, datetime_precision
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name IN ('integration_credentials','memory_capsules')`,
  );
  const byKey = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r]));
  for (const spec of COLUMNS) {
    const r = byKey.get(`${spec.table}.${spec.name}`);
    columns.push({ table: spec.table, name: spec.name, present: r !== undefined, is_nullable: r?.is_nullable ?? null, data_type: r?.data_type ?? null, datetime_precision: r?.datetime_precision ?? null });
  }
  const idx = await prisma.$queryRawUnsafe<Array<{ f: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = '${INDEX.name}') AS f`,
  );
  return { tables, columns, indexPresent: Boolean(idx[0]?.f), rowCounts };
}

function conflicts(columns: ColumnFact[]): string[] {
  const out: string[] = [];
  for (const spec of COLUMNS) {
    const fact = columns.find((f) => f.table === spec.table && f.name === spec.name);
    if (fact === undefined || !fact.present) continue;
    if (fact.is_nullable !== "YES") out.push(`${spec.table}.${spec.name}: NOT NULL (expected nullable)`);
    if (fact.data_type !== spec.dataType) out.push(`${spec.table}.${spec.name}: data_type=${fact.data_type} (expected ${spec.dataType})`);
    if (spec.datetimePrecision !== undefined && fact.datetime_precision !== spec.datetimePrecision) out.push(`${spec.table}.${spec.name}: datetime_precision=${fact.datetime_precision} (expected ${spec.datetimePrecision})`);
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { printHelp(); return; }
  const dryRun = argv.includes("--dry-run");

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || url.length === 0) { console.error("\n[reconcile] REFUSING: neither DIRECT_URL nor DATABASE_URL set (load via dotenv).\n"); process.exit(1); }

  console.log("=== PROD SCHEMA RECONCILE for live SHA 371542f (additive-only, coordinated) ===");
  console.log(`Target:   ${redact(url)}`);
  console.log(`Scope:    6 identity cols + memory_capsules.voice_note_id + its index (all additive)`);
  console.log(`Safety:   idempotent (IF NOT EXISTS); never DROP/ALTER; no backfill; no rows written`);
  console.log("\n--- DDL ---");
  for (const c of COLUMNS) console.log(columnDdl(c.table, c.name, c.ddlType));
  console.log(INDEX.ddl);

  const prisma = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  try {
    const before = await inspect(prisma);
    console.log(`\nBefore: tables=${JSON.stringify(before.tables)} rowCounts=${JSON.stringify(before.rowCounts)} indexPresent=${before.indexPresent}`);
    for (const c of before.columns) console.log(`  ${c.table}.${c.name}: present=${c.present}`);

    for (const table of TABLES) {
      if (!before.tables[table]) { console.error(`\n[reconcile] REFUSING: table "${table}" not found in current schema — unexpected; investigate.\n`); process.exit(3); }
    }
    const conf = conflicts(before.columns);
    if (conf.length > 0) { console.error(`\n[reconcile] REFUSING: existing column type/nullability conflict(s):\n  ${conf.join("\n  ")}\n`); process.exit(4); }

    if (dryRun) {
      const missing = before.columns.filter((c) => !c.present).map((c) => `${c.table}.${c.name}`);
      console.log(`\n[reconcile] DRY-RUN — nothing applied. Missing columns: [${missing.join(", ")}] | index missing: ${!before.indexPresent}\n`);
      return;
    }

    if ((process.env[APPROVAL_ENV] ?? "") !== APPROVAL_PHRASE) { console.error(`\n[reconcile] REFUSING: ${APPROVAL_ENV} must equal exactly the approval phrase.\n`); process.exit(1); }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '30s'`);
      for (const c of COLUMNS) await tx.$executeRawUnsafe(columnDdl(c.table, c.name, c.ddlType));
      await tx.$executeRawUnsafe(INDEX.ddl);
    });

    const after = await inspect(prisma);
    const stillMissing = after.columns.filter((c) => !c.present).map((c) => `${c.table}.${c.name}`);
    const afterConf = conflicts(after.columns);
    console.log(`\nAfter:  rowCounts=${JSON.stringify(after.rowCounts)} indexPresent=${after.indexPresent}`);
    for (const c of after.columns) console.log(`  ${c.table}.${c.name}: present=${c.present} nullable=${c.is_nullable} type=${c.data_type}`);

    if (stillMissing.length > 0) { console.error(`\n[reconcile] FAILED: columns still missing: [${stillMissing.join(", ")}]\n`); process.exit(2); }
    if (!after.indexPresent) { console.error(`\n[reconcile] FAILED: index ${INDEX.name} not present after apply.\n`); process.exit(2); }
    if (afterConf.length > 0) { console.error(`\n[reconcile] FAILED: post-apply conflict(s):\n  ${afterConf.join("\n  ")}\n`); process.exit(2); }
    for (const table of TABLES) {
      if (before.rowCounts[table] !== after.rowCounts[table]) { console.error(`\n[reconcile] FAILED: ${table} row count changed (${before.rowCounts[table]} → ${after.rowCounts[table]}).\n`); process.exit(2); }
    }
    console.log(`\n[reconcile] DONE — all additive objects present, all nullable, row counts unchanged.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error("[reconcile] FAILED:", err instanceof Error ? err.message : String(err)); process.exit(1); });
