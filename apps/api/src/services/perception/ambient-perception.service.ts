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
  "GLASSES_NOTE",
  "LENS_CONTEXT",
  "AMBIENT_DEVICE_PACKET",
  "GLASSES_VISUAL_FRAME",
  "SCREEN_CONTEXT",
  "DOCUMENT_CONTEXT",
  "LOCATION_SIGNAL",
];

// Future ambient sources are reserved in the contract but not accepted by the
// runtime yet — the plain capture path only accepts the wired text-stream
// sources. Device-originated packets use captureDevicePerception (below).
const WIRED_SOURCE_TYPES: ReadonlySet<AmbientSourceType> = new Set([
  "MEETING_TRANSCRIPT",
  "VOICE_NOTE",
  "CONVERSATION_SNIPPET",
  "IMPORTED_NOTES",
]);

// Phase 1287-A — device-originated TEXT ambient packets accepted through the
// governed device-capture adapter. TEXT only — never raw frames / visual /
// biometric. GLASSES_VISUAL_FRAME etc. remain reserved + unprocessed.
const DEVICE_SOURCE_TYPES: ReadonlySet<AmbientSourceType> = new Set([
  "GLASSES_NOTE",
  "LENS_CONTEXT",
  "AMBIENT_DEVICE_PACKET",
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
    case "GLASSES_NOTE":
    case "LENS_CONTEXT":
    case "AMBIENT_DEVICE_PACKET":
      return "AMBIENT_DEVICE";
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

// ── Glasses / lens device-capture adapter (Phase 1287-A) ────────────────────
// Device input is UNTRUSTED until normalized, scoped, and validated. This is an
// intake CONTRACT for future glasses/lens adapters, NOT always-on capture and
// NOT a hardware/camera path. TEXT packets only — raw frames / images / visual
// / biometric / appearance are rejected and never processed.

export interface DeviceContextInput {
  device_type?: "glasses" | "lens" | "earbuds" | "desktop" | "mobile" | "unknown";
  device_id?: string; // opaque hardware id — NEVER trusted for auth/scope, NOT stored
  capture_mode?: "manual" | "voice_confirmed" | "user_tapped" | "scheduled" | "unknown";
}
export interface ConsentInput {
  user_initiated: boolean;
  capture_visible_to_user: boolean;
  bystander_sensitive: boolean;
  recording_disclosed?: boolean;
}
export interface VisibilityInput {
  scope: "private" | "thread" | "org" | "unknown";
}
export interface ContextHintInput {
  meeting_title?: string;
  related_person_name?: string; // a USER-TYPED label only — never inferred from appearance
  related_project?: string;
  location_label?: string;
}

export type DeviceCaptureResult =
  | { ok: true; entry: WorkLedgerView; disposition: "STORED" | "STORED_PRIVATE_DOWNGRADED" }
  | {
      ok: false;
      code:
        | "INVALID_REQUEST"
        | "SOURCE_NOT_SUPPORTED"
        | "RAW_FRAME_REJECTED"
        | "CONSENT_REQUIRED"
        | "BYSTANDER_BLOCKED";
      message: string;
    };

// WHAT: capture a device-originated TEXT ambient packet (glasses/lens/ambient
//        device) into the SAME governed pipeline as meeting intelligence, after
//        strict Foundation validation. Deterministic capture is primary +
//        non-blocking; advisory enrichment is best-effort.
// INPUT: org + caller (from the AUTHED session — device identity is ignored) +
//        the device packet (source_type + text + consent + visibility + device/
//        context metadata) (+ optional list of forbidden raw-media keys the
//        route detected on the request).
// OUTPUT: the created Work Ledger entry, or an honest rejection. Never creates a
//         task, never sends, never performs face/biometric/appearance analysis.
export async function captureDevicePerception(args: {
  org_entity_id: string;
  caller_entity_id: string;
  source_type: AmbientSourceType;
  text: string;
  observed_at?: string;
  device_context?: DeviceContextInput;
  consent: ConsentInput;
  visibility?: VisibilityInput;
  context_hint?: ContextHintInput;
  // Forbidden raw-media keys (image / frame / video / ...) the route saw on the
  // request body. Non-empty ⇒ reject — Foundation never accepts raw frames.
  raw_media_keys?: ReadonlyArray<string>;
  runtime?: MeetingIntelligenceRuntimeConfig;
}): Promise<DeviceCaptureResult> {
  // 1) Text required (TEXT-only adapter).
  if (typeof args.text !== "string" || args.text.trim().length === 0) {
    return { ok: false, code: "INVALID_REQUEST", message: "text is required" };
  }
  // 2) Raw camera frames / images are NEVER accepted or stored.
  if (args.raw_media_keys !== undefined && args.raw_media_keys.length > 0) {
    return {
      ok: false,
      code: "RAW_FRAME_REJECTED",
      message: "raw camera frames / images are not accepted; send a short text note instead",
    };
  }
  // 3) Source must be a wired DEVICE text source. Reserved visual sources
  //    (GLASSES_VISUAL_FRAME / SCREEN_CONTEXT / ...) are not processed.
  if (!AMBIENT_SOURCE_TYPES.includes(args.source_type)) {
    return { ok: false, code: "INVALID_REQUEST", message: "invalid source_type" };
  }
  if (!DEVICE_SOURCE_TYPES.has(args.source_type)) {
    return {
      ok: false,
      code: "SOURCE_NOT_SUPPORTED",
      message:
        "this source_type is not a supported device text packet; visual/frame sources are not processed",
    };
  }
  // 4) Consent: explicit, user-initiated, visible capture only. No always-on /
  //    invisible / undisclosed capture enters Foundation.
  const consent = args.consent;
  if (
    typeof consent !== "object" ||
    consent === null ||
    consent.user_initiated !== true ||
    consent.capture_visible_to_user !== true
  ) {
    return {
      ok: false,
      code: "CONSENT_REQUIRED",
      message: "device capture requires an explicit, user-initiated, visible capture",
    };
  }
  // 5) Bystander-sensitive packets: only safe to store PRIVATELY, with any
  //    person hint stripped. Anything else is blocked.
  const scope = args.visibility?.scope ?? "private";
  let disposition: "STORED" | "STORED_PRIVATE_DOWNGRADED" = "STORED";
  if (consent.bystander_sensitive === true) {
    if (scope !== "private") {
      return {
        ok: false,
        code: "BYSTANDER_BLOCKED",
        message: "bystander-sensitive capture can only be stored privately",
      };
    }
    disposition = "STORED_PRIVATE_DOWNGRADED";
  }

  // Sanitized, safe metadata only. device_id is NOT stored (untrusted hardware
  // id); a bystander-sensitive packet drops the person hint entirely.
  const safeContextHint: Record<string, string> = {};
  if (args.context_hint !== undefined) {
    if (typeof args.context_hint.meeting_title === "string") safeContextHint.meeting_title = args.context_hint.meeting_title.slice(0, 200);
    if (typeof args.context_hint.related_project === "string") safeContextHint.related_project = args.context_hint.related_project.slice(0, 120);
    if (typeof args.context_hint.location_label === "string") safeContextHint.location_label = args.context_hint.location_label.slice(0, 120);
    if (
      disposition !== "STORED_PRIVATE_DOWNGRADED" &&
      typeof args.context_hint.related_person_name === "string"
    ) {
      safeContextHint.related_person_name = args.context_hint.related_person_name.slice(0, 120);
    }
  }

  const created = await createLedgerEntry({
    org_entity_id: args.org_entity_id,
    ledger_type: "MEETING",
    source_type: ledgerSourceType(args.source_type),
    title: deriveCaptureTitle(args.text),
    owner_entity_id: args.caller_entity_id, // session is the only authority
    requester_entity_id: args.caller_entity_id,
    details: {
      ambient_source_type: args.source_type,
      device_context: {
        device_type: args.device_context?.device_type ?? "unknown",
        capture_mode: args.device_context?.capture_mode ?? "unknown",
      },
      consent: {
        user_initiated: consent.user_initiated,
        capture_visible_to_user: consent.capture_visible_to_user,
        bystander_sensitive: consent.bystander_sensitive === true,
        recording_disclosed: consent.recording_disclosed === true,
      },
      visibility: { scope },
      ...(Object.keys(safeContextHint).length > 0 ? { context_hint: safeContextHint } : {}),
      ...(typeof args.observed_at === "string" ? { observed_at: args.observed_at } : {}),
      meeting_intelligence: pendingEnvelope("MEETING_INTELLIGENCE", new Date().toISOString()),
    },
  });
  if (created.ok === false) {
    return { ok: false, code: "INVALID_REQUEST", message: created.message };
  }

  // Fire-and-forget the SAME advisory enrichment (text candidates only; no
  // visual / identity processing). The response is already complete.
  void enrichMeetingIntelligenceAsync({
    ledger_entry_id: created.entry.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    transcript: args.text,
    source_type: args.source_type,
    ...(args.runtime !== undefined ? { runtime: args.runtime } : {}),
  });

  return { ok: true, entry: created.entry, disposition };
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
