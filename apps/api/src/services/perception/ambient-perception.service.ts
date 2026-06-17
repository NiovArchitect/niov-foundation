// FILE: ambient-perception.service.ts
// PURPOSE: Phase 1285-V — the ambient perception pipeline. A captured
//          perception stream (meeting transcript / conversation note / imported
//          notes; future: glasses/lens packets) flows: capture -> normalize ->
//          DETERMINISTIC Foundation pass (a durable Work Ledger MEETING entry,
//          tenant/user-scoped, audited) -> ASYNC Python advisory MEETING_
//          INTELLIGENCE -> Foundation validation -> governed surfaces (Comms
//          recent-artifacts, My Work, Ask-Twin context). Deterministic capture
//          is primary and NEVER blocks on Python; advisory intelligence is
//          stored SEPARATELY on details.meeting_intelligence and never mutates
//          governed truth, never creates a flood of work items, never sends.
// CONNECTS TO: work-os/work-ledger.service.ts (deterministic capture entry),
//          intelligence/python-perception.service.ts (the bounded client),
//          intelligence/python-intelligence.ts (envelope + validation),
//          execution-verification.service.ts (proof), routes/work-os-ledger
//          .routes.ts; tests/unit/ambient-perception.test.ts.

import { prisma } from "@niov/database";
import { logger } from "../../logger.js";
import { createLedgerEntry, type WorkLedgerView } from "../work-os/work-ledger.service.js";
import { recordExecutionAttempt } from "../work-os/execution-verification.service.js";
import {
  extractMeetingIntelligence,
  type MeetingIntelligenceRuntimeConfig,
} from "../intelligence/python-perception.service.js";
import {
  pendingEnvelope,
  buildMeetingIntelligenceEnvelope,
  validateMeetingEnvelope,
  type AmbientSourceType,
} from "../intelligence/python-intelligence.js";

const AMBIENT_SOURCE_TYPES: ReadonlyArray<AmbientSourceType> = [
  "MEETING_TRANSCRIPT",
  "VOICE_NOTE",
  "CONVERSATION_SNIPPET",
  "IMPORTED_NOTES",
  "GLASSES_VISUAL_FRAME",
  "SCREEN_CONTEXT",
  "DOCUMENT_CONTEXT",
  "LOCATION_SIGNAL",
];

// Future ambient sources are reserved in the contract but not accepted by the
// runtime yet — capture only the wired text-stream sources for now.
const WIRED_SOURCE_TYPES: ReadonlySet<AmbientSourceType> = new Set([
  "MEETING_TRANSCRIPT",
  "VOICE_NOTE",
  "CONVERSATION_SNIPPET",
  "IMPORTED_NOTES",
]);

// Map an ambient source to the durable WorkLedgerEntry.source_type vocab.
function ledgerSourceType(source: AmbientSourceType): string {
  switch (source) {
    case "VOICE_NOTE":
      return "VOICE_COMMAND";
    case "CONVERSATION_SNIPPET":
      return "CHAT";
    case "IMPORTED_NOTES":
      return "MANUAL";
    default:
      return "TRANSCRIPT"; // MEETING_TRANSCRIPT
  }
}

// WHAT: a concise, DETERMINISTIC capture title (no AI). The first substantive
//        line, trimmed; never the whole transcript.
function deriveCaptureTitle(text: string): string {
  const firstLine = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .find((l) => l.length >= 3);
  if (firstLine === undefined) return "Captured conversation";
  const trimmed = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
  return trimmed;
}

export type CapturePerceptionResult =
  | { ok: true; entry: WorkLedgerView }
  | { ok: false; code: "INVALID_REQUEST"; message: string };

// WHAT: capture an ambient perception stream into a durable, governed record
//        and kick off async advisory meeting intelligence (non-blocking).
// INPUT: org + caller + source_type + the captured text (+ optional runtime).
// OUTPUT: the created Work Ledger entry (deterministic truth). Python runs
//         best-effort after; the response NEVER waits on it.
export async function capturePerception(args: {
  org_entity_id: string;
  caller_entity_id: string;
  source_type: AmbientSourceType;
  text: string;
  runtime?: MeetingIntelligenceRuntimeConfig;
}): Promise<CapturePerceptionResult> {
  if (typeof args.text !== "string" || args.text.trim().length === 0) {
    return { ok: false, code: "INVALID_REQUEST", message: "text is required" };
  }
  if (!AMBIENT_SOURCE_TYPES.includes(args.source_type)) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid source_type" };
  }
  if (!WIRED_SOURCE_TYPES.has(args.source_type)) {
    // Reserved future ambient source (glasses/lens/screen/etc.) — honest, not faked.
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "source_type is reserved for a future ambient input adapter",
    };
  }

  // DETERMINISTIC Foundation pass: a durable, scoped, audited capture record.
  // The capturer owns it. Meeting intelligence starts PENDING and is filled
  // async; extraction_source stays deterministic (advisory never upgrades it).
  const created = await createLedgerEntry({
    org_entity_id: args.org_entity_id,
    ledger_type: "MEETING",
    source_type: ledgerSourceType(args.source_type),
    title: deriveCaptureTitle(args.text),
    owner_entity_id: args.caller_entity_id,
    requester_entity_id: args.caller_entity_id,
    details: {
      ambient_source_type: args.source_type,
      meeting_intelligence: pendingEnvelope("MEETING_INTELLIGENCE", new Date().toISOString()),
    },
  });
  if (created.ok === false) {
    return { ok: false, code: "INVALID_REQUEST", message: created.message };
  }

  // Fire-and-forget the advisory enrichment. The response is already complete.
  void enrichMeetingIntelligenceAsync({
    ledger_entry_id: created.entry.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    transcript: args.text,
    source_type: args.source_type,
    ...(args.runtime !== undefined ? { runtime: args.runtime } : {}),
  });

  return { ok: true, entry: created.entry };
}

// WHAT: best-effort, NON-BLOCKING meeting intelligence for a capture record.
//        Runs the Python MEETING_INTELLIGENCE capability, lets Foundation
//        validate it, and stores the perception envelope on
//        details.meeting_intelligence. NEVER throws; never mutates governed
//        truth (owner/requester/target/status/policy/scope); never creates
//        child work items; never sends; never upgrades extraction_source.
export async function enrichMeetingIntelligenceAsync(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  transcript: string;
  source_type?: string;
  runtime?: MeetingIntelligenceRuntimeConfig;
}): Promise<void> {
  try {
    const startedAt = Date.now();
    const result = await extractMeetingIntelligence(
      {
        transcript: args.transcript,
        ...(args.source_type !== undefined ? { source_type: args.source_type } : {}),
      },
      args.runtime ?? {},
    );
    const envelope = validateMeetingEnvelope(
      buildMeetingIntelligenceEnvelope(result, Date.now() - startedAt, new Date().toISOString()),
    );

    const current = await prisma.workLedgerEntry.findFirst({
      where: { ledger_entry_id: args.ledger_entry_id, org_entity_id: args.org_entity_id },
      select: { details: true },
    });
    if (current === null) return; // row gone (deleted/cross-tenant): nothing to patch.

    const baseDetails =
      typeof current.details === "object" && current.details !== null
        ? (current.details as Record<string, unknown>)
        : {};
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: args.ledger_entry_id },
      data: { details: { ...baseDetails, meeting_intelligence: envelope } as object },
    });

    const enriched = envelope.status === "PYTHON_ENRICHED";
    await recordExecutionAttempt({
      ledger_entry_id: args.ledger_entry_id,
      org_entity_id: args.org_entity_id,
      attempt_type: "PYTHON_ENRICHMENT",
      runtime: "PYTHON",
      evidence_type: "PROVIDER_RESPONSE",
      status: enriched ? "VERIFIED" : "FAILED",
      detail: {
        capability: envelope.capability,
        enrichment_status: envelope.status,
        authority: envelope.authority,
        candidate_count: envelope.candidates.length,
        latency_ms: envelope.latency_ms,
      },
      ...(enriched ? {} : { error_code: envelope.status }),
    });
  } catch (err) {
    // Best-effort: never break anything. Log the FACT of failure (NO raw
    // transcript / payload) and mark the envelope ERROR.
    logger.warn(
      { ledger_entry_id: args.ledger_entry_id, err: err instanceof Error ? err.message : "unknown" },
      "[ambient-perception] async meeting intelligence failed",
    );
    try {
      const current = await prisma.workLedgerEntry.findFirst({
        where: { ledger_entry_id: args.ledger_entry_id, org_entity_id: args.org_entity_id },
        select: { details: true },
      });
      if (current === null) return;
      const baseDetails =
        typeof current.details === "object" && current.details !== null
          ? (current.details as Record<string, unknown>)
          : {};
      const errorEnvelope = {
        ...pendingEnvelope("MEETING_INTELLIGENCE", new Date().toISOString()),
        status: "ERROR" as const,
        error_code: "ERROR",
      };
      await prisma.workLedgerEntry.update({
        where: { ledger_entry_id: args.ledger_entry_id },
        data: { details: { ...baseDetails, meeting_intelligence: errorEnvelope } as object },
      });
    } catch {
      // give up silently — the deterministic capture row is already intact.
    }
  }
}
