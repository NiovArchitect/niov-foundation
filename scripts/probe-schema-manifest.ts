// FILE: scripts/probe-schema-manifest.ts
// PURPOSE: [OTZAR-CONTINUITY P6] Read-only operator probe of the startup schema
//          manifest against a target DB (DATABASE_URL/DIRECT_URL via dotenv).
//          Prints compatible|incompatible with sanitized issues. Applies nothing.
//          Use before deploying a manifest-bearing SHA to confirm prod is ahead of
//          or level with the code.
// USAGE: node --require dotenv/config --import tsx scripts/probe-schema-manifest.ts
import { PrismaClient } from "@prisma/client";
import { checkSchemaManifest } from "../apps/api/src/startup/schema-manifest.js";

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("[probe] REFUSING: no DATABASE_URL/DIRECT_URL");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  try {
    const r = await checkSchemaManifest(prisma);
    console.log("[probe] manifest:", JSON.stringify(r));
    process.exitCode = r.status === "compatible" ? 0 : 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[probe] FAILED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
