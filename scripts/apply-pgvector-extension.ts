// FILE: apply-pgvector-extension.ts
// PURPOSE: G3.3 pgvector extension installer per ADR-0043 §Sub-decision 2
//          (Q-G3-β LOCK) + Q-G3.3-ζ LOCK. Wraps `CREATE EXTENSION IF NOT
//          EXISTS vector;` for command-line invocation. Idempotent (the
//          IF NOT EXISTS clause makes repeat invocations safe).
// CONNECTS TO: @niov/database (prisma client), scripts/test-db-up.sh
//              (invokes this AFTER docker compose up + BEFORE
//              scripts/prisma-db-push-test.sh), .github/workflows/ci.yml
//              + nightly-real-llm.yml (same ordering per Q-G3.3-η).
//
// USAGE: npx tsx scripts/apply-pgvector-extension.ts
// REQUIRES: DATABASE_URL in env; loaded by test-db-up.sh from
//           .env.test or set as a job-level env in CI workflows.
//
// ORDERING (per Q-G3.3-θ): this script MUST run BEFORE `prisma db push`
// because the `embedding Unsupported("vector(1536)")?` column on
// MemoryCapsule requires the `vector` type to be registered in Postgres
// before the ALTER TABLE statement that prisma db push generates can
// succeed. HNSW index creation (scripts/apply-hnsw-index.ts) runs AFTER
// prisma db push because the embedding column must exist first.

import { prisma } from "@niov/database";

// WHAT: Entry-point that validates env, applies `CREATE EXTENSION
//        IF NOT EXISTS vector;`, and exits with a non-zero code on
//        any failure.
// INPUT: None (reads process.env.DATABASE_URL).
// OUTPUT: A promise that resolves when the extension is registered;
//          process.exit(1) on failure.
// WHY: Per ADR-0043 §Sub-decision 2 (Q-G3-β LOCK), pgvector substrate
//      is owned at the Prisma + raw-SQL post-push register. This
//      script handles the extension creation half; HNSW index
//      creation is the post-push counterpart.
async function main(): Promise<void> {
  if (
    typeof process.env.DATABASE_URL !== "string" ||
    process.env.DATABASE_URL.length === 0
  ) {
    process.stderr.write(
      "ERROR: DATABASE_URL not set in environment\n",
    );
    process.exit(1);
  }

  process.stdout.write("Applying pgvector extension (CREATE EXTENSION IF NOT EXISTS vector)...\n");
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;");
  process.stdout.write("pgvector extension installed (or already present).\n");
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`ERROR applying pgvector extension: ${message}\n`);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
