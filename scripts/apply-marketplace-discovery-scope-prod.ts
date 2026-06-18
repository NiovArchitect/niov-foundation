// FILE: scripts/apply-marketplace-discovery-scope-prod.ts
// PURPOSE: Phase 1303-C — ONE-OFF, Founder-authorized, additive-only production
//          activation of the 1301-A Federation Cloud discovery schema delta.
//          Applies EXACTLY three additive objects, all idempotent:
//            1. MarketplaceDiscoveryScope enum (PRIVATE, CROSS_ORG)
//            2. marketplace_listings.discovery_scope column (NOT NULL DEFAULT 'PRIVATE')
//            3. marketplace_listings_discovery_scope_idx index
//
//          This is NOT a general migration tool. It exists because the 1297-B
//          db-push guard (scripts/prisma-db-push-guard.sh) correctly REFUSES
//          production by design (ADR-0025), there is no migrations dir, and the
//          deploy pipeline has no schema step — yet the Founder explicitly
//          authorized this one additive delta via the "Push mechanism" decision
//          (option 1: one-off raw-DDL apply script). The 1297-B guard is left
//          intact; this script does NOT use `prisma db push`.
//
// CONNECTS TO:
//   - @prisma/client (PrismaClient datasourceUrl override; DDL via
//     $executeRawUnsafe; read-only post-verify via $queryRawUnsafe)
//   - ADR-0025 (Schema-Push-Target Discipline; generic prod schema push stays
//     guarded — this is a narrow, explicitly-authorized exception, not a new
//     general path)
//   - scripts/verify-production-parity.ts (read-only parity verifier; the
//     secret-redaction + target-parsing pattern mirrors that script)
//   - 1301-A (packages/database/prisma/schema.prisma MarketplaceDiscoveryScope +
//     MarketplaceListing.discovery_scope — the source-of-truth this activates)
//
// USAGE (production activation; Founder-authorized one-off):
//   NIOV_APPROVE_DISCOVERY_SCOPE_PROD_DDL="APPROVE PROD SCHEMA PUSH — additive only" \
//     npx tsx scripts/apply-marketplace-discovery-scope-prod.ts
//   (DATABASE_URL + DIRECT_URL are read from the ambient env / .env; the DDL is
//    applied over DIRECT_URL — session mode, correct for DDL.)
//
//   --help      Print usage + safety boundaries; no DB connection.
//   --dry-run   Print target (redacted) + the exact DDL; do NOT connect/mutate.
//
// SAFETY BOUNDARIES:
//   - ADDITIVE ONLY. The only verbs are CREATE TYPE (inside an idempotent DO
//     block), ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT
//     EXISTS. The script self-scans its own statements and ABORTS if any
//     destructive token (DROP / DELETE / TRUNCATE / ALTER...DROP / RESET /
//     FORCE / CASCADE) is present — defense-in-depth against repurposing.
//   - IDEMPOTENT. Safe to run more than once.
//   - APPROVAL-GATED. Refuses unless NIOV_APPROVE_DISCOVERY_SCOPE_PROD_DDL holds
//     the EXACT Founder approval phrase.
//   - TARGET-CLARITY. Refuses if DATABASE_URL or DIRECT_URL is missing, or if
//     their hosts disagree (ambiguous target).
//   - NO SECRETS. Prints host / database / port only — never the URL, user, or
//     password.
//   - NO HNSW. Does not touch memory_capsules_embedding_hnsw_idx (separate
//     pre-existing ADR-0043 scope).
//   - NO prisma db push. Does not modify the 1297-B guard.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_DISCOVERY_SCOPE_PROD_DDL";
const APPROVAL_PHRASE = "APPROVE PROD SCHEMA PUSH — additive only";

// The EXACT additive DDL statements (run in order). Each is idempotent.
const DDL_STATEMENTS: ReadonlyArray<{ label: string; sql: string }> = [
  {
    label: "1/3 MarketplaceDiscoveryScope enum (idempotent DO block)",
    sql: `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'MarketplaceDiscoveryScope'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "MarketplaceDiscoveryScope" AS ENUM ('PRIVATE', 'CROSS_ORG');
  END IF;
END
$$;`,
  },
  {
    label: "2/3 marketplace_listings.discovery_scope column (additive, default PRIVATE)",
    sql: `ALTER TABLE "marketplace_listings"
  ADD COLUMN IF NOT EXISTS "discovery_scope" "MarketplaceDiscoveryScope" NOT NULL DEFAULT 'PRIVATE';`,
  },
  {
    label: "3/3 marketplace_listings_discovery_scope_idx index (additive)",
    sql: `CREATE INDEX IF NOT EXISTS "marketplace_listings_discovery_scope_idx"
  ON "marketplace_listings" ("discovery_scope");`,
  },
];

// Destructive tokens that must NEVER appear in this script's statements.
// CREATE TYPE / ADD COLUMN / CREATE INDEX are additive and contain none of these.
const FORBIDDEN_TOKENS: ReadonlyArray<RegExp> = [
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bTRUNCATE\b/i,
  /\bRESET\b/i,
  /\bFORCE\b/i,
  /\bCASCADE\b/i,
  /ALTER\s+TABLE\b[\s\S]*\bDROP\b/i,
];

function printHelp(): void {
  process.stdout.write(`scripts/apply-marketplace-discovery-scope-prod.ts
ONE-OFF, Founder-authorized, additive-only production activation of the 1301-A
Federation Cloud discovery schema delta (enum + column + index). Idempotent.

USAGE:
  ${APPROVAL_ENV}="${APPROVAL_PHRASE}" \\
    npx tsx scripts/apply-marketplace-discovery-scope-prod.ts [--dry-run|--help]

FLAGS:
  --help     Print this block; no DB connection.
  --dry-run  Print redacted target + the exact DDL; do NOT connect or mutate.

REQUIRED ENV:
  ${APPROVAL_ENV}   Must equal exactly: ${APPROVAL_PHRASE}
  DATABASE_URL + DIRECT_URL          Both required; hosts must agree (target
                                     clarity). DDL is applied over DIRECT_URL.

SAFETY:
  Additive only (CREATE TYPE / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
  EXISTS). Self-aborts on any destructive token. Idempotent. Prints host /
  database / port only (no secrets). Does NOT touch HNSW. Does NOT use prisma
  db push. Does NOT modify the 1297-B guard.
`);
}

// Parse host/port/db from a postgresql:// URL without exposing credentials.
function safeTarget(url: string): { host: string; port: string; database: string } | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port,
      database: u.pathname.replace(/^\//, "").split("?")[0] ?? "",
    };
  } catch {
    return null;
  }
}

function fail(msg: string): never {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const dryRun = process.argv.includes("--dry-run");

  process.stdout.write("=== 1301-A Discovery Schema Activation (ADDITIVE, ONE-OFF) ===\n");
  process.stdout.write(
    "Additive only: CREATE TYPE / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.\n",
  );
  process.stdout.write("The 1297-B guard is NOT used or modified. prisma db push is NOT used.\n\n");

  // Defense-in-depth: refuse if any statement contains a destructive token.
  for (const stmt of DDL_STATEMENTS) {
    for (const bad of FORBIDDEN_TOKENS) {
      if (bad.test(stmt.sql)) {
        fail(
          `refusing — statement "${stmt.label}" matched a forbidden destructive token (${String(bad)}). This script is additive-only.`,
        );
      }
    }
  }

  // Approval gate (skipped only for --dry-run, which never connects/mutates).
  const approval = process.env[APPROVAL_ENV];
  if (!dryRun && approval !== APPROVAL_PHRASE) {
    fail(
      `${APPROVAL_ENV} must equal exactly the Founder approval phrase. ` +
        `Refusing to run. Use --help for usage, or --dry-run to preview without connecting.`,
    );
  }

  // Target clarity: both URLs present + host agreement.
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0)
    fail("DATABASE_URL is not set — target is unclear; refusing.");
  if (typeof directUrl !== "string" || directUrl.length === 0)
    fail("DIRECT_URL is not set — target is unclear; refusing (per Founder requirement #7).");
  const dbTarget = safeTarget(databaseUrl);
  const directTarget = safeTarget(directUrl);
  if (dbTarget === null || directTarget === null)
    fail("DATABASE_URL / DIRECT_URL is not a valid postgresql:// URL; refusing.");
  if (dbTarget.host !== directTarget.host)
    fail(
      `DATABASE_URL host (${dbTarget.host}) and DIRECT_URL host (${directTarget.host}) disagree — ambiguous target; refusing.`,
    );

  process.stdout.write(
    `Target (DDL applied over DIRECT_URL): host=${directTarget.host} database=${directTarget.database} port=${directTarget.port}\n`,
  );
  process.stdout.write(
    `(DATABASE_URL host=${dbTarget.host} port=${dbTarget.port} — hosts agree.)\n\n`,
  );

  if (dryRun) {
    process.stdout.write("=== DRY-RUN — the following additive DDL WOULD be applied ===\n");
    for (const stmt of DDL_STATEMENTS) {
      process.stdout.write(`\n-- ${stmt.label}\n${stmt.sql}\n`);
    }
    process.stdout.write("\nDRY-RUN: no DB connection, no mutation.\n");
    process.exit(0);
  }

  // Apply over DIRECT_URL (session mode — correct for DDL).
  const prisma = new PrismaClient({ datasourceUrl: directUrl, log: ["error"] });
  try {
    for (const stmt of DDL_STATEMENTS) {
      process.stdout.write(`Applying ${stmt.label}...\n`);
      await prisma.$executeRawUnsafe(stmt.sql);
    }

    // Read-only post-verify (idempotent; SELECT EXISTS only).
    process.stdout.write("\n=== Post-apply verification (read-only) ===\n");
    const enumRows = await prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'MarketplaceDiscoveryScope' AND n.nspname = 'public'
       ) AS found`,
    );
    const colRows = await prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'marketplace_listings'
           AND column_name = 'discovery_scope'
       ) AS found`,
    );
    const idxRows = await prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'marketplace_listings_discovery_scope_idx'
       ) AS found`,
    );
    const enumOk = Boolean(enumRows[0]?.found);
    const colOk = Boolean(colRows[0]?.found);
    const idxOk = Boolean(idxRows[0]?.found);
    process.stdout.write(`${enumOk ? "✓" : "✗"} MarketplaceDiscoveryScope enum present\n`);
    process.stdout.write(`${colOk ? "✓" : "✗"} marketplace_listings.discovery_scope column present\n`);
    process.stdout.write(`${idxOk ? "✓" : "✗"} marketplace_listings_discovery_scope_idx index present\n`);

    await prisma.$disconnect();

    if (enumOk && colOk && idxOk) {
      process.stdout.write("\nSUCCESS: 1301-A discovery schema delta is present (additive, idempotent).\n");
      process.exit(0);
    }
    fail("post-apply verification did not confirm all three objects; investigate before restart.");
  } catch (error: unknown) {
    await prisma.$disconnect().catch(() => undefined);
    const msg = error instanceof Error ? error.message : String(error);
    fail(`apply failed: ${msg}`);
  }
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(1);
});
