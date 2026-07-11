// FILE: scripts/deploy-preflight-schema.ts
// PURPOSE: [RELEASE DISCIPLINE — prevents the 602cc31 incident] Before ANY manual Foundation
//          deploy, print whether the CURRENT working tree's schema-manifest is satisfied by the
//          TARGET database — i.e. whether this commit is DEPLOYABLE NOW or NOT DEPLOYABLE until a
//          schema activation runs. Runs the SAME checkSchemaManifest the startup boot guard runs
//          (fail-before-listen), so a green preflight means the deploy will not crash-loop on
//          STARTUP_SCHEMA_INCOMPATIBLE. Read-only. Never prints credentials.
//
//          The incident this prevents: main advanced past a continuity-only deploy target to a
//          Stage-2 commit that added an `obligations` manifest requirement; deploying main's head
//          without first activating the table crash-looped the ENTIRE API. This preflight surfaces
//          exactly that delta BEFORE the deploy.
//
// USAGE:
//   node --require dotenv/config --import tsx scripts/deploy-preflight-schema.ts
//   (loads the target DB from .env — DIRECT_URL/DATABASE_URL; redacted in output)
// EXIT: 0 = DEPLOYABLE NOW; 2 = NOT DEPLOYABLE (activate schema first); 1 = probe unavailable / no URL.
// CONNECTS TO: apps/api/src/startup/schema-manifest.ts (the boot guard), scripts/activate-*-prod-schema.ts.

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { checkSchemaManifest } from "../apps/api/src/startup/schema-manifest.js";

function redact(url: string | undefined): string {
  if (!url) return "<unset>";
  try {
    const u = new URL(url);
    return `${u.protocol}//<redacted>@${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "").split("?")[0]}`;
  } catch {
    return "<unparseable; redacted>";
  }
}

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    console.error("\n[preflight] REFUSING: neither DIRECT_URL nor DATABASE_URL set (load via dotenv).\n");
    process.exit(1);
  }
  let sha = "<unknown>";
  try { sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { /* non-git context */ }
  console.log("=== DEPLOY PREFLIGHT — schema-manifest compatibility ===");
  console.log(`Commit (working tree HEAD): ${sha}`);
  console.log(`Target DB:                  ${redact(url)}`);

  const prisma = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  try {
    let result;
    try {
      result = await checkSchemaManifest(prisma);
    } catch (e) {
      console.error(`\n[preflight] PROBE UNAVAILABLE — could not read the target catalog (DB unreachable?). Not a schema verdict.\n  ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    }
    if (result.status === "compatible") {
      console.log("\n  ✅ DEPLOYABLE NOW — the target DB satisfies this commit's schema manifest.\n");
      process.exit(0);
    }
    console.log("\n  ⛔ NOT DEPLOYABLE — ACTIVATE SCHEMA FIRST. The target DB is behind this commit:\n");
    for (const issue of result.issues) console.log(`     - ${JSON.stringify(issue)}`);
    const missingTables = [...new Set(result.issues.filter((i) => i.kind === "table_missing").map((i) => i.table))];
    if (missingTables.length > 0) {
      console.log(`\n  Missing table(s): ${missingTables.join(", ")}.`);
      console.log("  Run the matching additive activation script (scripts/activate-<table>-prod-schema.ts) with its");
      console.log("  approval phrase FIRST, re-run this preflight until green, THEN deploy this exact commit.\n");
    }
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[preflight] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
