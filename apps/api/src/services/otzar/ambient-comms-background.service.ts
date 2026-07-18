// FILE: ambient-comms-background.service.ts
// PURPOSE: Server-side ambient communications pull — Otzar auto-syncs Meet
//          (and later other sources) for orgs with connected Google Workspace
//          WITHOUT requiring a human to open the Comms page. Manual paste
//          remains fallback only. Best-effort: never invents transcripts;
//          SCOPE_REAUTH / no-transcript are honest skips.
// CONNECTS TO: ambient-comms-sync.service (per-caller pull), IntegrationCredential
//          (org OAuth rows), action/scheduler (cron registration), server boot.

import { prisma } from "@niov/database";
import type { LLMProvider } from "../llm/llm.service.js";
import { runAmbientCommsSyncForCaller } from "./ambient-comms-sync.service.js";

/** IntegrationCredential.tool for Google Workspace OAuth (connector-oauth). */
export const GOOGLE_OAUTH_TOOL = "OAUTH_GOOGLE_WORKSPACE";

export interface AmbientBackgroundTickResult {
  orgs_considered: number;
  orgs_synced: number;
  ingested: number;
  skipped: number;
  errors: number;
}

/**
 * WHAT: One background pass — for each org with a live Google OAuth credential,
 *       pull recent Meet transcripts into the governed ingest spine.
 * WHY:  State-of-the-art Work OS does not wait for humans to open Comms.
 *       Connected tools are the primary path; this tick is the continuous rail.
 */
export async function tickAmbientCommsOrgSync(args: {
  llmProvider: LLMProvider;
  /** Cap orgs per tick (default 15). */
  max_orgs?: number;
  /** Cap Meet records per org (default 5). */
  max_records_per_org?: number;
}): Promise<AmbientBackgroundTickResult> {
  const maxOrgs = Math.min(Math.max(args.max_orgs ?? 15, 1), 50);
  const maxRecords = Math.min(Math.max(args.max_records_per_org ?? 5, 1), 15);

  const creds = await prisma.integrationCredential.findMany({
    where: { tool: GOOGLE_OAUTH_TOOL, enabled: true },
    select: { org_entity_id: true },
    take: maxOrgs,
    orderBy: { created_at: "asc" },
  });

  let orgs_synced = 0;
  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  for (const cred of creds) {
    const actor = await prisma.entityMembership.findFirst({
      where: {
        parent_id: cred.org_entity_id,
        is_active: true,
      },
      orderBy: [{ is_admin: "desc" }, { created_at: "asc" }],
      select: { child_id: true },
    });
    if (actor === null) {
      skipped += 1;
      continue;
    }

    try {
      const result = await runAmbientCommsSyncForCaller({
        callerEntityId: actor.child_id,
        llmProvider: args.llmProvider,
        max_records: maxRecords,
      });
      if (result.ok === false) {
        // Not connected / reauth / provider: honest skip, not a hard error storm.
        if (
          result.code === "GOOGLE_NOT_CONNECTED" ||
          result.code === "SCOPE_REAUTH_REQUIRED" ||
          result.code === "NO_ORG_FOR_CALLER"
        ) {
          skipped += 1;
        } else {
          errors += 1;
        }
        continue;
      }
      orgs_synced += 1;
      ingested += result.ingested;
    } catch {
      errors += 1;
    }
  }

  return {
    orgs_considered: creds.length,
    orgs_synced,
    ingested,
    skipped,
    errors,
  };
}
