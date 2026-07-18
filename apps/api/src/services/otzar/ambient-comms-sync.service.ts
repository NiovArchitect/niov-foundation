// FILE: ambient-comms-sync.service.ts
// PURPOSE: Primary communications intake — Otzar pulls from connected tools
//          (Google Meet transcripts first), normalizes to WorkSourceEvent, and
//          feeds the SAME ingest spine as manual paste. Manual/demo capture is
//          a FALLBACK only. Never invents transcripts; NO_TRANSCRIPT is honest.
//          Network-effect ready: multi-speaker lines fan into per-owner work
//          via existing ingestSourceEvent → planWorkItems.
// CONNECTS TO: connector-data-read (Meet list/fetch), source-event adapters,
//              comms-ingest (ingestSourceEvent), otzar/comms/ambient-sync routes.

import { getOrgEntityId } from "../governance/org.js";
import {
  fetchMeetTranscriptForOrg,
  listMeetConferenceRecordsForOrg,
} from "../connector/connector-data-read.service.js";
import { getOAuthStatusForOrg } from "../connector/connector-oauth.service.js";
import { googleMeetTranscriptToSourceEvent } from "./source-event.js";
import { ingestSourceEvent } from "./comms-ingest.service.js";
import type { LLMProvider } from "../llm/llm.service.js";
import { prisma } from "@niov/database";

export type AmbientSourceStatus =
  | "connected_auto"
  | "ready_to_connect"
  | "not_configured"
  | "error_reconnect";

export interface AmbientCommsSourceView {
  source_id: string;
  label: string;
  description: string;
  status: AmbientSourceStatus;
  status_label: string;
  /** True when Otzar can pull without the human pasting. */
  automatic: boolean;
  is_primary: boolean;
  is_fallback: boolean;
}

export interface AmbientCommsSourcesResult {
  ok: true;
  headline: string;
  sources: AmbientCommsSourceView[];
  primary_message: string;
  fallback_message: string;
}

export interface AmbientSyncRecordResult {
  record_id: string;
  outcome:
    | "ingested"
    | "already_ingested"
    | "no_transcript"
    | "skipped"
    | "error";
  work_items_created?: number;
  code?: string;
}

export interface AmbientCommsSyncResult {
  ok: true;
  scanned: number;
  ingested: number;
  already_ingested: number;
  no_transcript: number;
  errors: number;
  records: AmbientSyncRecordResult[];
  message: string;
}

export type AmbientCommsSyncFailure =
  | { ok: false; code: "NO_ORG_FOR_CALLER" }
  | { ok: false; code: "GOOGLE_NOT_CONNECTED"; message: string }
  | { ok: false; code: "PROVIDER_ERROR"; message: string; detail?: string };

function statusLabel(s: AmbientSourceStatus): string {
  switch (s) {
    case "connected_auto":
      return "Auto-syncing";
    case "ready_to_connect":
      return "Ready to connect";
    case "error_reconnect":
      return "Reconnect needed";
    case "not_configured":
    default:
      return "Not connected";
  }
}

// WHAT: Honest inventory of auto vs fallback comms sources for Comms UX.
// WHY: Product doctrine — ingestion is ambient/automatic; paste is fallback.
export async function getAmbientCommsSourcesForCaller(
  callerEntityId: string,
): Promise<AmbientCommsSourcesResult | { ok: false; code: "NO_ORG_FOR_CALLER" }> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  const oauth = await getOAuthStatusForOrg(orgEntityId).catch(() => ({
    ok: true as const,
    providers: [] as Array<{ provider: string; status: string }>,
  }));
  const google = oauth.providers.find((p) => p.provider === "GOOGLE_WORKSPACE");
  let googleStatus: AmbientSourceStatus = "not_configured";
  if (google?.status === "VERIFIED" || google?.status === "CONNECTED_UNVERIFIED") {
    googleStatus = "connected_auto";
  } else if (google?.status === "ERROR_NEEDS_RECONNECT") {
    googleStatus = "error_reconnect";
  } else if (google?.status === "READY_FOR_CONSENT") {
    googleStatus = "ready_to_connect";
  }

  const sources: AmbientCommsSourceView[] = [
    {
      source_id: "google_meet",
      label: "Google Meet",
      description:
        "Post-meeting transcripts pull automatically when Workspace is connected.",
      status: googleStatus,
      status_label: statusLabel(googleStatus),
      automatic: true,
      is_primary: true,
      is_fallback: false,
    },
    {
      source_id: "manual_paste",
      label: "Paste or live capture",
      description:
        "Fallback when a source is not connected yet or a conversation happened offline.",
      status: "connected_auto",
      status_label: "Fallback available",
      automatic: false,
      is_primary: false,
      is_fallback: true,
    },
  ];

  const autoConnected = sources.filter(
    (s) => s.automatic && s.status === "connected_auto",
  ).length;
  const headline =
    autoConnected > 0
      ? "Otzar is pulling communications from your connected tools."
      : "Connect a tool so Otzar can capture work automatically — paste remains a fallback.";

  return {
    ok: true,
    headline,
    sources,
    primary_message:
      "Connected tools are the primary path. Otzar turns real meetings and messages into owned work.",
    fallback_message:
      "Manual paste and demo capture are fallbacks only — for offline moments or while tools reconnect.",
  };
}

// WHAT: Pull recent Google Meet transcripts into the governed ingest spine.
// WHY: Humans should not paste meetings. Auto path scales with org network.
export async function runAmbientCommsSyncForCaller(args: {
  callerEntityId: string;
  llmProvider: LLMProvider;
  /** Cap Meet records scanned this pass (default 8). */
  max_records?: number;
}): Promise<AmbientCommsSyncResult | AmbientCommsSyncFailure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(args.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  const oauth = await getOAuthStatusForOrg(orgEntityId).catch(() => null);
  const google = oauth?.providers.find((p) => p.provider === "GOOGLE_WORKSPACE");
  const googleOk =
    google?.status === "VERIFIED" || google?.status === "CONNECTED_UNVERIFIED";
  if (!googleOk) {
    return {
      ok: false,
      code: "GOOGLE_NOT_CONNECTED",
      message:
        "Connect Google Workspace so Otzar can auto-pull Meet transcripts. Paste remains available as fallback.",
    };
  }

  const maxRecords = Math.min(Math.max(args.max_records ?? 8, 1), 25);
  const listed = await listMeetConferenceRecordsForOrg({
    actor_entity_id: args.callerEntityId,
    org_entity_id: orgEntityId,
    page_size: maxRecords,
  });
  if (listed.ok === false) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: "Could not list Meet conference records.",
      detail: listed.code,
    };
  }

  const caller = await prisma.entity.findFirst({
    where: { entity_id: args.callerEntityId, deleted_at: null },
    select: { display_name: true },
  });
  const callerName = caller?.display_name ?? "Otzar ambient sync";

  const records: AmbientSyncRecordResult[] = [];
  let ingested = 0;
  let already = 0;
  let noTranscript = 0;
  let errors = 0;

  for (const rec of listed.records.slice(0, maxRecords)) {
    const fetched = await fetchMeetTranscriptForOrg({
      actor_entity_id: args.callerEntityId,
      org_entity_id: orgEntityId,
      record_id: rec.record_id,
    });
    if (fetched.ok === false) {
      if (fetched.code === "NO_TRANSCRIPT") {
        noTranscript += 1;
        records.push({ record_id: rec.record_id, outcome: "no_transcript" });
      } else {
        errors += 1;
        records.push({
          record_id: rec.record_id,
          outcome: "error",
          code: fetched.code,
        });
      }
      continue;
    }

    const event = googleMeetTranscriptToSourceEvent({
      recordId: rec.record_id,
      meetingLabel:
        fetched.start_time.length > 0
          ? `meeting of ${fetched.start_time.slice(0, 10)}`
          : rec.record_id,
      transcript: fetched.transcript,
      callerEntityId: args.callerEntityId,
      callerName,
      orgEntityId,
      startTimeIso: fetched.start_time,
      nowIso: new Date().toISOString(),
    });

    const result = await ingestSourceEvent(event, {
      llmProvider: args.llmProvider,
    });
    if (result.ok === false) {
      if (result.code === "ALREADY_INGESTED") {
        already += 1;
        records.push({
          record_id: rec.record_id,
          outcome: "already_ingested",
        });
      } else {
        errors += 1;
        records.push({
          record_id: rec.record_id,
          outcome: "error",
          code: result.code,
        });
      }
      continue;
    }

    ingested += 1;
    const workN =
      "work_items" in result && Array.isArray(result.work_items)
        ? result.work_items.length
        : 0;
    records.push({
      record_id: rec.record_id,
      outcome: "ingested",
      work_items_created: workN,
    });
  }

  const message =
    ingested > 0
      ? `Pulled ${ingested} meeting${ingested === 1 ? "" : "s"} into governed work.`
      : already > 0 && ingested === 0
        ? "Connected meetings are already in Otzar — nothing new to pull."
        : noTranscript > 0 && ingested === 0
          ? "Meetings found, but none had transcripts yet (honest — no fabrication)."
          : "No new Meet transcripts to pull.";

  return {
    ok: true,
    scanned: listed.records.slice(0, maxRecords).length,
    ingested,
    already_ingested: already,
    no_transcript: noTranscript,
    errors,
    records,
    message,
  };
}
