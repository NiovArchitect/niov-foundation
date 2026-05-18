// FILE: apply-hnsw-index.ts
// PURPOSE: G3.3 HNSW index installer per ADR-0043 §Sub-decision 1
//          (Q-G3-α LOCK) + ADR-0041 §Sub-decision 3 Q-E LOCK (HNSW +
//          cosine) + Q-G3.3-α/β/ε LOCKS. Wraps `CREATE INDEX IF NOT
//          EXISTS memory_capsules_embedding_hnsw_idx ...` for command-
//          line invocation. Idempotent (the IF NOT EXISTS clause makes
//          repeat invocations safe).
// CONNECTS TO: @niov/database (prisma client), scripts/test-db-up.sh
//              (invokes this AFTER scripts/apply-audit-triggers.ts —
//              the embedding column must exist BEFORE the index is
//              created), .github/workflows/ci.yml +
//              nightly-real-llm.yml (same ordering per Q-G3.3-η).
//
// USAGE: npx tsx scripts/apply-hnsw-index.ts
// REQUIRES: DATABASE_URL in env. The `vector` extension must be
//           registered (scripts/apply-pgvector-extension.ts) AND the
//           `embedding` column must exist on `memory_capsules`
//           (created by `prisma db push` after the schema declares
//           `embedding Unsupported("vector(1536)")?`).
//
// INDEX SHAPE (per Q-G3.3-α/β/ε LOCKS):
// - Name: memory_capsules_embedding_hnsw_idx
// - Method: USING hnsw (per ADR-0041 Q-E LOCK)
// - Operator class: vector_cosine_ops (per ADR-0041 Q-E LOCK)
// - Partial: WHERE embedding IS NOT NULL AND deleted_at IS NULL
//   (per Q-G3.3-β LOCK; skips legacy unembedded capsules + RULE 10
//   soft-deleted rows)
// - Parameters: defaults m = 16, ef_construction = 64 (per Q-G3.3-ε
//   LOCK and RS-4 pgvector canonical defaults; no explicit WITH clause)
//
// SAFE ON EMPTY TABLE: HNSW can build on empty memory_capsules per
// pgvector 0.8.2 + ADR-0043 §Context (RS-4). No CONCURRENTLY in test;
// production migration runner can use CONCURRENTLY when applied to a
// populated table for zero-downtime.

import { prisma } from "@niov/database";

// WHAT: Entry-point that validates env, applies the HNSW index DDL,
//        and exits with a non-zero code on any failure.
// INPUT: None (reads process.env.DATABASE_URL).
// OUTPUT: A promise that resolves when the index is created (or
//          already exists); process.exit(1) on failure.
// WHY: Per ADR-0043 §Sub-decision 1 + ADR-0041 Q-E LOCK + Q-G3.3
//      LOCKS, the HNSW index lives at the schema substrate register.
//      G3.6 retrieval consumes already-stable index substrate.
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

  process.stdout.write(
    "Applying HNSW index memory_capsules_embedding_hnsw_idx (USING hnsw vector_cosine_ops; partial WHERE embedding IS NOT NULL AND deleted_at IS NULL)...\n",
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS memory_capsules_embedding_hnsw_idx
       ON memory_capsules
       USING hnsw (embedding vector_cosine_ops)
       WHERE embedding IS NOT NULL AND deleted_at IS NULL;`,
  );
  process.stdout.write("HNSW index installed (or already present).\n");
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`ERROR applying HNSW index: ${message}\n`);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
