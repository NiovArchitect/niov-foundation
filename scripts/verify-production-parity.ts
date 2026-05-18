// FILE: scripts/verify-production-parity.ts
// PURPOSE: Read-only production schema parity verifier per ADR-0047
//          Sub-decision 4 (Q-PR-ε Option α) + ADR-0035 §9 38th
//          observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT.
//          Verifies that a target Postgres database has the expected
//          schema shape (columns, extensions, indexes, triggers) that
//          the repo source-of-truth declares as canonical.
//
// CONNECTS TO:
//   - @prisma/client (uses PrismaClient datasourceUrl override per
//     Prisma 6.x canonical pattern; READ-ONLY $queryRawUnsafe only)
//   - ADR-0025 (Schema-Push-Target Discipline; production schema
//     changes go through deploy pipeline, NEVER via this script)
//   - ADR-0037 (jurisdiction tagging substrate; checks columns 1-4)
//   - ADR-0042 (mutation_type substrate; check 5)
//   - ADR-0043 (pgvector embedding + HNSW substrate; checks 6-8)
//   - ADR-0002 (audit triggers; checks 9-10)
//   - ADR-0033 §Q-5BII-EXEC-5 (Ecto-owned idempotency_keys;
//     INFORMATIONAL check 11)
//
// USAGE:
//   PARITY_DATABASE_URL='postgresql://user:pass@host:port/db' \
//     npx tsx scripts/verify-production-parity.ts [--dry-run|--help]
//
//   --help     Print usage + safety boundaries + ADR citations.
//   --dry-run  Print check enumeration; do NOT connect to any DB.
//
// REQUIRED ENV:
//   PARITY_DATABASE_URL  Explicit; the read-only target connection
//                        URL. NEVER falls back to DATABASE_URL or
//                        .env per Founder Q-PR-ε Option α LOCK.
//
// OPTIONAL ENV:
//   ALLOW_LOCAL_PARITY_CHECK=1  Required to point this script at a
//                               localhost target. Defense-in-depth
//                               against accidental local-target
//                               checks (the local DB is verified by
//                               scripts/local-test-db-refresh.sh
//                               separately).
//
// EXIT CODES (per Q-PR-η LOCK):
//   0  No drift found (all required checks PASS).
//   1  Usage / runtime / auth / config error.
//   2  Drift found (one or more required checks FAIL).
//
// GOVERNANCE:
//   - RULE 0  — read-only target access; never mutates the DB; never
//               prints PARITY_DATABASE_URL value, username, password,
//               or full URL. Hostname / database / port only.
//   - RULE 11 — Prisma/Ecto cross-language data ownership boundary
//               preserved per ADR-0033 §Decision 7 + Q-5BII-EXEC-5;
//               idempotency_keys check is INFORMATIONAL (Ecto-owned;
//               production target may or may not have Elixir/BEAM
//               deployed yet).
//   - RULE 13 — drift inventory surfaced inline; explicit exit codes
//               for machine-readable consumption.
//   - RULE 20 — Founder-authorized via PR.3
//               [PR-HARDENING-LOCAL-DB-AND-PARITY-PR.3-EXECUTE-VERIFY-AUTH].
//               Any production migration / deploy requires SEPARATE
//               explicit Founder deployment authorization per ADR-0025.
//
// SAFETY BOUNDARY:
//   This script is READ-ONLY. It uses prisma.$queryRawUnsafe with
//   information_schema / pg_extension / pg_indexes / pg_trigger /
//   pg_tables SELECT-only queries. It DOES NOT use $executeRaw or any
//   Prisma mutation verb (create / update / delete / upsert).
//   ANY PRODUCTION MIGRATION OR DEPLOY REQUIRES SEPARATE FOUNDER
//   AUTHORIZATION PER ADR-0025 + RULE 20.

import { PrismaClient } from "@prisma/client";

interface CheckResult {
  name: string;
  tier: "REQUIRED" | "INFO";
  passed: boolean;
  detail: string;
}

// WHAT: Print usage + safety boundaries + ADR citations.
// WHY: --help is non-destructive; safe at any time.
function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`scripts/verify-production-parity.ts — read-only production parity verifier.

USAGE:
  PARITY_DATABASE_URL='postgresql://user:pass@host:port/db' \\
    npx tsx scripts/verify-production-parity.ts [--dry-run|--help]

FLAGS:
  --help     Print this usage block + ADR citations.
  --dry-run  Print check enumeration; do NOT connect to any DB.

REQUIRED ENV:
  PARITY_DATABASE_URL  Explicit target connection URL. Never falls back
                       to DATABASE_URL or .env per Q-PR-ε α LOCK.

OPTIONAL ENV:
  ALLOW_LOCAL_PARITY_CHECK=1  Required to target localhost. Defense-in-
                              depth against accidental local-target
                              checks (use local-test-db-refresh.sh for
                              local DB instead).

EXIT CODES:
  0  No drift.
  1  Usage / runtime / auth / config error.
  2  Drift found (one or more REQUIRED checks FAIL).

SAFETY BOUNDARIES (per RULE 0 + RULE 11 + RULE 13 + RULE 20):
  - READ-ONLY: \\$queryRawUnsafe with information_schema / pg_* SELECT
    queries only.
  - NO mutation: no \\$executeRaw, no create/update/delete/upsert verbs.
  - NO secret printing: hostname / database / port only.
  - Production migration / deploy requires SEPARATE Founder authorization
    per ADR-0025 + RULE 20.

CHECK INVENTORY (11 checks; 10 REQUIRED + 1 INFO):
  1.  entities.jurisdiction column (REQUIRED; ADR-0037)
  2.  memory_capsules.jurisdiction column (REQUIRED; ADR-0037)
  3.  audit_events.jurisdiction column (REQUIRED; ADR-0037)
  4.  org_settings.default_jurisdiction column (REQUIRED; ADR-0037)
  5.  memory_capsules.mutation_type column (REQUIRED; ADR-0042)
  6.  memory_capsules.embedding column type vector(1536) (REQUIRED;
      ADR-0043)
  7.  pgvector extension installed (REQUIRED; ADR-0043)
  8.  memory_capsules_embedding_hnsw_idx exists (REQUIRED; ADR-0043)
  9.  audit_events_no_delete trigger present (REQUIRED; ADR-0002)
  10. audit_events_no_update trigger present (REQUIRED; ADR-0002)
  11. idempotency_keys table present (INFORMATIONAL; Ecto-owned per
      ADR-0033 §Q-5BII-EXEC-5; production may or may not have
      Elixir/BEAM deployed)

CITATIONS:
  ADR-0035 §9 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-
    DRIFT (this script closes the parity-verification half at canonical-
    execution register substantively)
  ADR-0047 Sub-decision 4 (Q-PR-ε LOCK Option α)
  ADR-0025 (Schema-Push-Target Discipline; production migration boundary)
  RULE 20 (Founder authorization required for production-affecting actions)
`);
}

// WHAT: Extract host / port / db from a postgresql:// URL via the
//        canonical URL parser.
// WHY: Per RULE 0, no full URL / credentials may be printed; only
//      host / port / db. Uses node:url URL class for parsing.
function safeParseTargetMetadata(
  url: string,
): { host: string; port: string; database: string } | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port,
      database: parsed.pathname.replace(/^\//, "").split("?")[0] ?? "",
    };
  } catch {
    return null;
  }
}

// WHAT: Run one check against the target DB; return CheckResult.
// WHY: Per Q-PR.3-ζ LOCK 11-check list; centralizes pass/fail reporting.
async function runCheck(
  prisma: PrismaClient,
  name: string,
  tier: "REQUIRED" | "INFO",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: () => Promise<Array<{ found: any }>>,
  detailIfFound: (rows: Array<{ found: unknown }>) => string,
  detailIfMissing: string,
): Promise<CheckResult> {
  try {
    const rows = await query();
    const passed = rows.length > 0 && Boolean(rows[0]?.found);
    return {
      name,
      tier,
      passed,
      detail: passed ? detailIfFound(rows) : detailIfMissing,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name,
      tier,
      passed: false,
      detail: `query error: ${msg}`,
    };
  }
}

// WHAT: Entry-point that parses flags, validates env, runs all 11
//        checks, and exits with the appropriate code.
// WHY: Per Q-PR-η LOCK + Q-PR.3-ζ + RULE 0 + RULE 11 + RULE 13 + RULE 20.
async function main(): Promise<void> {
  // --help short-circuit: no DB connection, no env requirement.
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const dryRun = process.argv.includes("--dry-run");

  // Print warning banner per Q-PR.3-ε requirement #6.
  // eslint-disable-next-line no-console
  console.log("=== Production Parity Verifier (READ-ONLY) ===");
  // eslint-disable-next-line no-console
  console.log(
    "WARNING: This script is READ-ONLY. Any production migration or deploy",
  );
  // eslint-disable-next-line no-console
  console.log(
    "         requires SEPARATE Founder authorization per ADR-0025 + RULE 20.",
  );
  // eslint-disable-next-line no-console
  console.log("");

  // Validate PARITY_DATABASE_URL (explicit; no fallback to DATABASE_URL).
  const parityUrl = process.env.PARITY_DATABASE_URL;
  if (typeof parityUrl !== "string" || parityUrl.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      "ERROR: PARITY_DATABASE_URL is not set. Per ADR-0047 Sub-decision 4",
    );
    // eslint-disable-next-line no-console
    console.error(
      "       (Q-PR-ε α LOCK), this script requires an explicit",
    );
    // eslint-disable-next-line no-console
    console.error(
      "       PARITY_DATABASE_URL and will NEVER fall back to DATABASE_URL.",
    );
    // eslint-disable-next-line no-console
    console.error("       Use --help for usage.");
    process.exit(1);
  }

  // Parse host/port/db without printing the full URL.
  const target = safeParseTargetMetadata(parityUrl);
  if (target === null) {
    // eslint-disable-next-line no-console
    console.error(
      "ERROR: PARITY_DATABASE_URL is not a valid postgresql:// URL.",
    );
    // eslint-disable-next-line no-console
    console.error("       Use --help for usage.");
    process.exit(1);
  }

  const { host, port, database } = target;

  // Fail-closed: refuse localhost without ALLOW_LOCAL_PARITY_CHECK=1.
  const allowLocal = process.env.ALLOW_LOCAL_PARITY_CHECK === "1";
  const SAFE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
  if (SAFE_LOCAL_HOSTS.has(host) && !allowLocal) {
    // eslint-disable-next-line no-console
    console.error(
      `ERROR: PARITY_DATABASE_URL host '${host}' is localhost. The parity`,
    );
    // eslint-disable-next-line no-console
    console.error(
      "       verifier refuses local-target checks unless ALLOW_LOCAL_PARITY_CHECK=1",
    );
    // eslint-disable-next-line no-console
    console.error(
      "       is set explicitly. For local-DB verification, use",
    );
    // eslint-disable-next-line no-console
    console.error(
      "       scripts/local-test-db-refresh.sh instead. Use --help for usage.",
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`Target: host=${host} database=${database} port=${port}`);

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log("=== DRY-RUN MODE ===");
    // eslint-disable-next-line no-console
    console.log("The following 11 checks WOULD run against the target:");
    // eslint-disable-next-line no-console
    console.log("  1.  entities.jurisdiction column (REQUIRED; ADR-0037)");
    // eslint-disable-next-line no-console
    console.log(
      "  2.  memory_capsules.jurisdiction column (REQUIRED; ADR-0037)",
    );
    // eslint-disable-next-line no-console
    console.log(
      "  3.  audit_events.jurisdiction column (REQUIRED; ADR-0037)",
    );
    // eslint-disable-next-line no-console
    console.log(
      "  4.  org_settings.default_jurisdiction column (REQUIRED; ADR-0037)",
    );
    // eslint-disable-next-line no-console
    console.log(
      "  5.  memory_capsules.mutation_type column (REQUIRED; ADR-0042)",
    );
    // eslint-disable-next-line no-console
    console.log(
      "  6.  memory_capsules.embedding column type vector(1536) (REQUIRED; ADR-0043)",
    );
    // eslint-disable-next-line no-console
    console.log("  7.  pgvector extension installed (REQUIRED; ADR-0043)");
    // eslint-disable-next-line no-console
    console.log(
      "  8.  memory_capsules_embedding_hnsw_idx exists (REQUIRED; ADR-0043)",
    );
    // eslint-disable-next-line no-console
    console.log(
      "  9.  audit_events_no_delete trigger present (REQUIRED; ADR-0002)",
    );
    // eslint-disable-next-line no-console
    console.log(
      "  10. audit_events_no_update trigger present (REQUIRED; ADR-0002)",
    );
    // eslint-disable-next-line no-console
    console.log(
      "  11. idempotency_keys table present (INFORMATIONAL; ADR-0033 §Q-5BII-EXEC-5)",
    );
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log("Skipping DB connection (--dry-run). No state read or mutated.");
    process.exit(0);
  }

  // Instantiate PrismaClient with explicit datasourceUrl override
  // per Q-PR-ε α LOCK; canonical Prisma 6.x pattern.
  const prisma = new PrismaClient({
    datasourceUrl: parityUrl,
    log: ["error"],
  });

  // 11 checks per Q-PR.3-ζ LOCK.
  const checks: CheckResult[] = [];

  // Check 1: entities.jurisdiction column.
  checks.push(
    await runCheck(
      prisma,
      "entities.jurisdiction column",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'entities'
               AND column_name = 'jurisdiction'
           ) AS found`,
        ),
      () => "column present (ADR-0037)",
      "column ABSENT — production schema is behind ADR-0037 jurisdiction tagging substrate",
    ),
  );

  // Check 2: memory_capsules.jurisdiction column.
  checks.push(
    await runCheck(
      prisma,
      "memory_capsules.jurisdiction column",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'memory_capsules'
               AND column_name = 'jurisdiction'
           ) AS found`,
        ),
      () => "column present (ADR-0037)",
      "column ABSENT — production schema is behind ADR-0037",
    ),
  );

  // Check 3: audit_events.jurisdiction column.
  checks.push(
    await runCheck(
      prisma,
      "audit_events.jurisdiction column",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'audit_events'
               AND column_name = 'jurisdiction'
           ) AS found`,
        ),
      () => "column present (ADR-0037)",
      "column ABSENT — production schema is behind ADR-0037",
    ),
  );

  // Check 4: org_settings.default_jurisdiction column.
  checks.push(
    await runCheck(
      prisma,
      "org_settings.default_jurisdiction column",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'org_settings'
               AND column_name = 'default_jurisdiction'
           ) AS found`,
        ),
      () => "column present (ADR-0037)",
      "column ABSENT — production schema is behind ADR-0037",
    ),
  );

  // Check 5: memory_capsules.mutation_type column.
  checks.push(
    await runCheck(
      prisma,
      "memory_capsules.mutation_type column",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'memory_capsules'
               AND column_name = 'mutation_type'
           ) AS found`,
        ),
      () => "column present (ADR-0042)",
      "column ABSENT — production schema is behind ADR-0042 mutation discrimination substrate",
    ),
  );

  // Check 6: memory_capsules.embedding column type vector(1536).
  checks.push(
    await runCheck(
      prisma,
      "memory_capsules.embedding column (vector type)",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'memory_capsules'
               AND column_name = 'embedding'
               AND udt_name = 'vector'
           ) AS found`,
        ),
      () => "column present with vector type (ADR-0043)",
      "column ABSENT or wrong type — production schema is behind ADR-0043 pgvector embedding substrate",
    ),
  );

  // Check 7: pgvector extension installed.
  checks.push(
    await runCheck(
      prisma,
      "pgvector extension",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_extension WHERE extname = 'vector'
           ) AS found`,
        ),
      () => "extension installed (ADR-0043)",
      "extension ABSENT — pgvector not installed; ADR-0043 substrate cannot function",
    ),
  );

  // Check 8: memory_capsules_embedding_hnsw_idx index.
  checks.push(
    await runCheck(
      prisma,
      "memory_capsules_embedding_hnsw_idx",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_indexes
             WHERE schemaname = 'public'
               AND indexname = 'memory_capsules_embedding_hnsw_idx'
           ) AS found`,
        ),
      () => "index present (ADR-0043)",
      "index ABSENT — HNSW retrieval substrate cannot function at production scale (ADR-0043)",
    ),
  );

  // Check 9: audit_events_no_delete trigger.
  checks.push(
    await runCheck(
      prisma,
      "audit_events_no_delete trigger",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_trigger
             WHERE tgname = 'audit_events_no_delete'
               AND NOT tgisinternal
           ) AS found`,
        ),
      () => "trigger present (ADR-0002)",
      "trigger ABSENT — append-only audit chain not enforced (ADR-0002)",
    ),
  );

  // Check 10: audit_events_no_update trigger.
  checks.push(
    await runCheck(
      prisma,
      "audit_events_no_update trigger",
      "REQUIRED",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_trigger
             WHERE tgname = 'audit_events_no_update'
               AND NOT tgisinternal
           ) AS found`,
        ),
      () => "trigger present (ADR-0002)",
      "trigger ABSENT — append-only audit chain not enforced (ADR-0002)",
    ),
  );

  // Check 11: idempotency_keys table presence (INFORMATIONAL).
  // Per ADR-0033 §Q-5BII-EXEC-5: Ecto-owned table; production target
  // may or may not have Elixir/BEAM deployed yet. Absence is NOT a
  // drift; presence is informational.
  checks.push(
    await runCheck(
      prisma,
      "idempotency_keys table (informational; Ecto-owned)",
      "INFO",
      () =>
        prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_tables
             WHERE schemaname = 'public'
               AND tablename = 'idempotency_keys'
           ) AS found`,
        ),
      () => "table present (Elixir/BEAM deployed; ADR-0033 §Q-5BII-EXEC-5)",
      "table absent (informational only; Ecto-owned per ADR-0033 §Q-5BII-EXEC-5; production may not have Elixir/BEAM deployed)",
    ),
  );

  await prisma.$disconnect();

  // Report.
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("=== Parity Check Results ===");
  let requiredFailures = 0;
  for (const c of checks) {
    const symbol = c.passed ? "✓" : "✗";
    const tierTag = `[${c.tier}]`.padEnd(11, " ");
    // eslint-disable-next-line no-console
    console.log(`${symbol} ${tierTag} ${c.name} — ${c.detail}`);
    if (!c.passed && c.tier === "REQUIRED") {
      requiredFailures += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log("");
  if (requiredFailures > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `DRIFT FOUND: ${requiredFailures} REQUIRED check(s) FAILED. Production schema is behind repo source-of-truth.`,
    );
    // eslint-disable-next-line no-console
    console.log(
      "ANY PRODUCTION MIGRATION OR DEPLOY REQUIRES SEPARATE FOUNDER AUTHORIZATION PER ADR-0025 + RULE 20.",
    );
    process.exit(2);
  } else {
    // eslint-disable-next-line no-console
    console.log("NO DRIFT: all REQUIRED checks PASS. Production schema is at repo source-of-truth parity.");
    process.exit(0);
  }
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
