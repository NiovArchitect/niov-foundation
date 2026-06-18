// FILE: scripts/soft-delete-otzar-orphans-prod.ts
// PURPOSE: Phase 1303-E — ONE-OFF, Founder-authorized, SOFT-DELETE-ONLY cleanup of
//          the THREE confirmed-empty Otzar APPLICATION orphan entities created by
//          prior unpinned API boots. Soft-delete = SET deleted_at = now() (RULE 10).
//          Sets deleted_at on EXACTLY three allowlisted entity_ids and NOTHING else.
//
//          This is NOT a general mutation tool. It exists because there is no
//          existing safe prod entity-mutation helper (the 1297-B guard governs
//          schema only, ADR-0025), yet the Founder explicitly authorized this exact
//          soft-delete via the Phase 1303-E directive. NO hard delete. NO wallet-row
//          deletion. NO schema change. NO prisma db push. NO broad table update.
//
// CONNECTS TO:
//   - @prisma/client (PrismaClient datasourceUrl override; UPDATE via
//     $executeRawUnsafe; read-only verify via $queryRawUnsafe)
//   - RULE 10 (Nothing is ever deleted — deletion = setting deleted_at; record stays)
//   - ADR-0025 (Schema-Push-Target Discipline; this is a data soft-delete, not a
//     schema push — the 1297-B guard is left intact and unused)
//   - scripts/apply-marketplace-discovery-scope-prod.ts (the 1303-C one-off; this
//     mirrors its approval-gate / target-clarity / secret-redaction / self-scan
//     / post-verify patterns)
//   - 1303-D orphan inventory (CURRENT_BUILD_STATE.md §#2) — the source-of-truth
//     for the canonical pin (8347070c…) and the three orphan IDs
//
// USAGE (Founder-authorized one-off):
//   NIOV_APPROVE_OTZAR_ORPHAN_SOFT_DELETE="APPROVE OTZAR ORPHAN SOFT DELETE — exact three IDs only" \
//     npx tsx scripts/soft-delete-otzar-orphans-prod.ts
//   (DATABASE_URL + DIRECT_URL read from ambient env / .env; UPDATE applied over
//    DIRECT_URL — session mode.)
//
//   --help      Print usage + safety boundaries; no DB connection.
//   --dry-run   Print target (redacted) + the exact UPDATE + the allowlist; do NOT
//               connect/mutate.
//
// SAFETY BOUNDARIES:
//   - SOFT-DELETE ONLY. The only verb is UPDATE ... SET deleted_at = now(). The
//     script self-scans its statement and ABORTS on any destructive token (DROP /
//     DELETE / TRUNCATE / ALTER / RESET / FORCE / CASCADE). "deleted_at" does NOT
//     match the \bDELETE\b token (word boundary).
//   - EXACT ALLOWLIST. Mutates ONLY the three hard-coded orphan IDs, AND only rows
//     that are still entity_type='APPLICATION' AND display_name='Otzar' AND
//     deleted_at IS NULL. The canonical ID is asserted ABSENT from the allowlist.
//   - PREFLIGHT-GATED. Before mutating, re-verifies each orphan is APPLICATION /
//     Otzar / deleted_at NULL / 0 sessions / 0 api_keys / 0 capsules, and that the
//     canonical entity remains active. ABORTS the whole run if any check fails.
//   - BOUNDED EFFECT. Asserts the UPDATE affected EXACTLY three rows; anything else
//     is treated as a failure (no further writes; reports for investigation).
//   - APPROVAL-GATED. Refuses unless the env var holds the EXACT Founder phrase.
//   - TARGET-CLARITY. Refuses if DATABASE_URL or DIRECT_URL is missing or hosts
//     disagree.
//   - NO SECRETS. Prints host / database / port only.
//   - NO wallet deletion. NO hard delete. NO schema change. NO prisma db push.

import { PrismaClient } from "@prisma/client";

const APPROVAL_ENV = "NIOV_APPROVE_OTZAR_ORPHAN_SOFT_DELETE";
const APPROVAL_PHRASE = "APPROVE OTZAR ORPHAN SOFT DELETE — exact three IDs only";

// The EXACT three Founder-approved orphan IDs (and nothing else).
const ORPHAN_IDS: ReadonlyArray<string> = [
  "a35f644a-7855-4bab-8f67-6cd225e58645",
  "0a6fd440-3a45-45e2-a167-1bb1e5ee7cb5",
  "5fe4c5d9-9b20-43f7-9efd-97e7763ca99a",
];

// The canonical / provisional Otzar entity that MUST be preserved.
const CANONICAL_ID = "8347070c-0aae-48b4-99e8-b62414488bf8";

// SQL-literal list of the allowlisted IDs (UUIDs only — validated below).
function quotedIdList(): string {
  return ORPHAN_IDS.map((id) => `'${id}'`).join(", ");
}

// The single approved soft-delete UPDATE. Narrow by construction: the IN allowlist
// plus type/name/deleted_at guards. Mirrors the Founder's "Preferred mutation shape".
function buildUpdateSql(): string {
  return `UPDATE "entities"
  SET deleted_at = now()
  WHERE entity_id IN (${quotedIdList()})
    AND entity_type = 'APPLICATION'
    AND display_name = 'Otzar'
    AND deleted_at IS NULL;`;
}

// Destructive tokens that must NEVER appear in the mutation statement.
// (UPDATE ... SET deleted_at = now() contains none; \bDELETE\b will not match
//  "deleted_at" because of the trailing word character.)
const FORBIDDEN_TOKENS: ReadonlyArray<RegExp> = [
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\b/i,
  /\bRESET\b/i,
  /\bFORCE\b/i,
  /\bCASCADE\b/i,
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(msg: string): never {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(1);
}

function printHelp(): void {
  process.stdout.write(`scripts/soft-delete-otzar-orphans-prod.ts
ONE-OFF, Founder-authorized, SOFT-DELETE-ONLY cleanup of the three empty Otzar
APPLICATION orphan entities (RULE 10: deleted_at = now()). Preserves the canonical
entity ${CANONICAL_ID}.

USAGE:
  ${APPROVAL_ENV}="${APPROVAL_PHRASE}" \\
    npx tsx scripts/soft-delete-otzar-orphans-prod.ts [--dry-run|--help]

FLAGS:
  --help     Print this block; no DB connection.
  --dry-run  Print redacted target + the exact UPDATE + allowlist; no connect/mutate.

REQUIRED ENV:
  ${APPROVAL_ENV}   Must equal exactly: ${APPROVAL_PHRASE}
  DATABASE_URL + DIRECT_URL                Both required; hosts must agree. UPDATE
                                           applied over DIRECT_URL.

ALLOWLIST (the only rows touched):
${ORPHAN_IDS.map((id) => `  - ${id}`).join("\n")}

PRESERVED (asserted NOT in allowlist):
  - ${CANONICAL_ID}

SAFETY:
  Soft-delete only (UPDATE ... SET deleted_at = now()). Self-aborts on any
  destructive token. Preflight-gated (each orphan must be APPLICATION / Otzar /
  deleted_at NULL / 0 sessions / 0 api_keys / 0 capsules; canonical must be active).
  Asserts exactly three rows affected. Prints host/database/port only (no secrets).
  No wallet deletion, no hard delete, no schema change, no prisma db push.
`);
}

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

type Counts = {
  entity_type: string | null;
  display_name: string | null;
  deleted_at: Date | null;
  sessions: number;
  api_keys: number;
  capsules: number;
};

async function loadCounts(prisma: PrismaClient, id: string): Promise<Counts | null> {
  const e = await prisma.$queryRawUnsafe<Array<{ entity_type: string; display_name: string; deleted_at: Date | null }>>(
    `SELECT entity_type::text AS entity_type, display_name, deleted_at
       FROM "entities" WHERE entity_id = $1::uuid`,
    id,
  );
  if (e.length === 0) return null;
  const s = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM "sessions" WHERE entity_id = $1::uuid`,
    id,
  );
  const k = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM "api_keys" WHERE entity_id = $1::uuid`,
    id,
  );
  const c = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n
       FROM "memory_capsules" mc JOIN "wallets" wl ON wl.wallet_id = mc.wallet_id
      WHERE wl.entity_id = $1::uuid`,
    id,
  );
  return {
    entity_type: e[0]?.entity_type ?? null,
    display_name: e[0]?.display_name ?? null,
    deleted_at: e[0]?.deleted_at ?? null,
    sessions: s[0]?.n ?? -1,
    api_keys: k[0]?.n ?? -1,
    capsules: c[0]?.n ?? -1,
  };
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const dryRun = process.argv.includes("--dry-run");

  process.stdout.write("=== 1303-E Otzar APPLICATION Orphan Soft-Delete (RULE 10, ONE-OFF) ===\n");
  process.stdout.write("Soft-delete only: UPDATE ... SET deleted_at = now(). No hard delete. No schema change.\n\n");

  // Static invariants: allowlist is exactly three valid UUIDs; canonical absent.
  if (ORPHAN_IDS.length !== 3) fail(`allowlist must contain exactly 3 IDs; found ${ORPHAN_IDS.length}.`);
  for (const id of ORPHAN_IDS) {
    if (!UUID_RE.test(id)) fail(`allowlist contains a non-UUID value; refusing.`);
  }
  if (new Set(ORPHAN_IDS).size !== 3) fail("allowlist contains duplicates; refusing.");
  if (ORPHAN_IDS.includes(CANONICAL_ID))
    fail("canonical ID is present in the orphan allowlist — refusing (would delete the live entity).");

  const updateSql = buildUpdateSql();
  for (const bad of FORBIDDEN_TOKENS) {
    if (bad.test(updateSql)) {
      fail(`refusing — the UPDATE matched a forbidden destructive token (${String(bad)}). This script is soft-delete-only.`);
    }
  }
  if (!/^UPDATE\s+"entities"\s+SET\s+deleted_at\s*=\s*now\(\)/i.test(updateSql))
    fail("the mutation is not the approved soft-delete shape; refusing.");

  // Approval gate (skipped only for --dry-run).
  const approval = process.env[APPROVAL_ENV];
  if (!dryRun && approval !== APPROVAL_PHRASE) {
    fail(
      `${APPROVAL_ENV} must equal exactly the Founder approval phrase. ` +
        `Refusing. Use --help for usage, or --dry-run to preview without connecting.`,
    );
  }

  // Target clarity.
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0)
    fail("DATABASE_URL is not set — target is unclear; refusing.");
  if (typeof directUrl !== "string" || directUrl.length === 0)
    fail("DIRECT_URL is not set — target is unclear; refusing.");
  const dbTarget = safeTarget(databaseUrl);
  const directTarget = safeTarget(directUrl);
  if (dbTarget === null || directTarget === null)
    fail("DATABASE_URL / DIRECT_URL is not a valid postgresql:// URL; refusing.");
  if (dbTarget.host !== directTarget.host)
    fail(`DATABASE_URL host (${dbTarget.host}) and DIRECT_URL host (${directTarget.host}) disagree — ambiguous target; refusing.`);

  process.stdout.write(
    `Target (UPDATE applied over DIRECT_URL): host=${directTarget.host} database=${directTarget.database} port=${directTarget.port}\n`,
  );
  process.stdout.write(`(DATABASE_URL host=${dbTarget.host} port=${dbTarget.port} — hosts agree.)\n\n`);

  if (dryRun) {
    process.stdout.write("=== DRY-RUN — the following soft-delete WOULD be applied ===\n");
    process.stdout.write(`\nAllowlist (3):\n${ORPHAN_IDS.map((id) => `  - ${id}`).join("\n")}\n`);
    process.stdout.write(`Preserved (canonical): ${CANONICAL_ID}\n`);
    process.stdout.write(`\n${updateSql}\n`);
    process.stdout.write("\nDRY-RUN: no DB connection, no mutation.\n");
    process.exit(0);
  }

  const prisma = new PrismaClient({ datasourceUrl: directUrl, log: ["error"] });
  try {
    // ---- Preflight (read-only): each orphan must be safe; canonical must be active.
    process.stdout.write("=== Preflight (read-only) ===\n");
    for (const id of ORPHAN_IDS) {
      const c = await loadCounts(prisma, id);
      if (c === null) fail(`orphan ${id} not found — refusing (state changed since approval).`);
      const safe =
        c.entity_type === "APPLICATION" &&
        c.display_name === "Otzar" &&
        c.deleted_at === null &&
        c.sessions === 0 &&
        c.api_keys === 0 &&
        c.capsules === 0;
      process.stdout.write(
        `  orphan ${id.slice(0, 8)} type=${c.entity_type} name=${c.display_name} ` +
          `deleted_at=${c.deleted_at ? "SET" : "null"} sessions=${c.sessions} api_keys=${c.api_keys} capsules=${c.capsules} ` +
          `=> ${safe ? "SAFE" : "UNSAFE"}\n`,
      );
      if (!safe)
        fail(
          `orphan ${id} no longer meets the soft-delete preconditions (must be APPLICATION/Otzar/deleted_at NULL/0 sessions/0 api_keys/0 capsules). ` +
            `STOPPING before any mutation — none of the three were soft-deleted.`,
        );
    }
    const canon = await loadCounts(prisma, CANONICAL_ID);
    if (canon === null) fail(`canonical ${CANONICAL_ID} not found — refusing.`);
    if (canon.deleted_at !== null) fail(`canonical ${CANONICAL_ID} is already soft-deleted — refusing (unexpected).`);
    process.stdout.write(
      `  canonical ${CANONICAL_ID.slice(0, 8)} type=${canon.entity_type} name=${canon.display_name} deleted_at=null => PRESERVE\n`,
    );

    // ---- Mutation (soft-delete only).
    process.stdout.write("\n=== Applying soft-delete ===\n");
    const affected = await prisma.$executeRawUnsafe(updateSql);
    process.stdout.write(`Rows affected: ${affected}\n`);
    if (affected !== 3)
      fail(
        `expected exactly 3 rows affected, got ${affected}. Investigate immediately — ` +
          `the soft-delete did not match the intended exact-three allowlist.`,
      );

    // ---- Post-verify (read-only).
    process.stdout.write("\n=== Post-verify (read-only) ===\n");
    let allDeleted = true;
    for (const id of ORPHAN_IDS) {
      const r = await prisma.$queryRawUnsafe<Array<{ deleted_at: Date | null }>>(
        `SELECT deleted_at FROM "entities" WHERE entity_id = $1::uuid`,
        id,
      );
      const isDeleted = Boolean(r[0]?.deleted_at);
      allDeleted = allDeleted && isDeleted;
      process.stdout.write(`  ${isDeleted ? "✓" : "✗"} orphan ${id.slice(0, 8)} deleted_at ${isDeleted ? "SET" : "STILL NULL"}\n`);
    }
    const canonAfter = await prisma.$queryRawUnsafe<Array<{ deleted_at: Date | null }>>(
      `SELECT deleted_at FROM "entities" WHERE entity_id = $1::uuid`,
      CANONICAL_ID,
    );
    const canonActive = canonAfter.length === 1 && canonAfter[0]?.deleted_at == null;
    process.stdout.write(`  ${canonActive ? "✓" : "✗"} canonical ${CANONICAL_ID.slice(0, 8)} still ACTIVE (deleted_at null)\n`);

    const activeRows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM "entities" WHERE entity_type = 'APPLICATION' AND deleted_at IS NULL`,
    );
    const activeCount = activeRows[0]?.n ?? -1;
    process.stdout.write(`  ACTIVE APPLICATION count: ${activeCount} (expected 1)\n`);

    await prisma.$disconnect();

    if (allDeleted && canonActive && activeCount === 1) {
      process.stdout.write("\nSUCCESS: three orphans soft-deleted; canonical preserved; active APPLICATION count = 1.\n");
      process.exit(0);
    }
    fail("post-verify did not confirm the expected end state; investigate.");
  } catch (error: unknown) {
    await prisma.$disconnect().catch(() => undefined);
    const msg = error instanceof Error ? error.message : String(error);
    fail(`soft-delete failed: ${msg}`);
  }
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(1);
});
