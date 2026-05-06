// FILE: apply-audit-triggers.ts
// PURPOSE: Foundation audit-trigger application script. Wraps
//          applyAuditEventTriggers (audit.ts:312-338) for
//          command-line invocation per ADR-0013 §Decision step 3.
//          Idempotent (the underlying function uses DROP IF
//          EXISTS before CREATE).
// CONNECTS TO: @niov/database (applyAuditEventTriggers export),
//              scripts/test-db-up.sh (invokes this via tsx after
//              prisma db push).
//
// USAGE: npx tsx scripts/apply-audit-triggers.ts
// REQUIRES: DATABASE_URL in env; loaded by test-db-up.sh from
//           .env.test before this script runs.

import { applyAuditEventTriggers } from "@niov/database";

// WHAT: Entry-point that validates env, applies triggers, and
//        exits with a non-zero code on any failure.
// INPUT: None (reads process.env.DATABASE_URL).
// OUTPUT: A promise that resolves when the triggers are applied;
//          process.exit(1) on failure.
// WHY: ADR-0013 §Decision step 3 needs a CLI-invocable wrapper
//      around the runtime applyAuditEventTriggers function so
//      bring-up scripts and CI can install the audit-events
//      triggers idempotently after schema push.
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

  process.stdout.write("Applying audit triggers...\n");
  await applyAuditEventTriggers();
  process.stdout.write("Audit triggers applied successfully.\n");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ERROR applying audit triggers: ${message}\n`);
  process.exit(1);
});
