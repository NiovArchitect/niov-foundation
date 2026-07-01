// FILE: source-event.ts
// PURPOSE: Slice A — the normalized Work Signal / Evidence Event abstraction that
//          UN-SILOS intake. Every source (transcript, meeting, Slack, Gmail,
//          Drive, Calendar, Jira, Linear, GitHub, Fathom, MCP, webhook, manual)
//          normalizes into ONE `WorkSourceEvent`, and every event feeds the SAME
//          transform chain into the SAME canonical `WorkLedgerEntry`. There is
//          NO second ledger and NO parallel data lake — a source is just a
//          `sourceType`. Transcript ingestion becomes one adapter over this.
// CONNECTS TO: comms-ingest.service.ts (ingestSourceEvent), work-ledger.service
//          (createLedgerEntry source_type + source evidence).

/** The originating system for a work signal. `TRANSCRIPT`/`MEETING` are the
 *  already-wired sources; the rest are wired as their read rails become real.
 *  A source with no live read rail is ingestable via an explicit event payload
 *  but is marked connector_missing rather than claimed as an automated pull. */
export type SourceSystem =
  | "TRANSCRIPT"
  | "MEETING"
  | "SLACK"
  | "GMAIL"
  | "DRIVE"
  | "CALENDAR"
  | "JIRA"
  | "LINEAR"
  | "GITHUB"
  | "FATHOM"
  | "MCP"
  | "WEBHOOK"
  | "MANUAL";

/** A single evidence span backing extracted work — preserved end to end so the
 *  ledger row can always prove where the work came from. */
export interface SourceEvidenceSpan {
  quote: string;
  speaker?: string | null;
  offset?: number | null;
}

/** The one normalized intake shape. Any connector/adapter produces this; the
 *  ingest core consumes only this. */
export interface WorkSourceEvent {
  /** Ledger `source_type` this event maps to (e.g. TRANSCRIPT, SLACK, GMAIL). */
  sourceType: string;
  sourceSystem: SourceSystem;
  /** Stable id within the source system (message id, thread id, doc id, issue id). */
  sourceId: string;
  sourceUrl?: string | null;
  /** Who authored/sent the signal. `email`/`handle` enable cross-source identity
   *  reconciliation (Slice C) when the display name alone doesn't match. */
  actor: { name: string; entityId?: string | null; handle?: string | null; email?: string | null };
  participants: Array<{ name: string; entityId?: string | null; email?: string | null; handle?: string | null }>;
  /** ISO 8601. */
  timestamp: string;
  /** Org scope; resolved from the caller when absent. */
  orgEntityId?: string | null;
  /** The governed caller performing/authorizing the ingestion (scope + audit). */
  callerEntityId: string;
  projectHint?: string | null;
  teamHint?: string | null;
  /** Human title for the source record; derived from the summary when absent. */
  title?: string | null;
  /** The text/content to extract work from. */
  content: string;
  contentSummary?: string | null;
  evidenceSpans?: SourceEvidenceSpan[];
  sensitivity?: "public" | "internal" | "confidential" | "restricted";
  permissionScope?: string | null;
  /** The connector binding / MCP identity that produced the event, if any. */
  connectorIdentity?: string | null;
  /** Source-supplied confidence 0..1 (defaults applied downstream). */
  confidence?: number;
  /** Explicit dedupe key; else derived from (system, id). */
  dedupeKey?: string | null;
  /** Correlates all events from one ingestion pass. */
  ingestionRunId?: string | null;
  audit?: Record<string, unknown>;
}

/** Deterministic dedupe key so re-ingesting the SAME source event is idempotent
 *  (never creates duplicate work). Stable across runs. */
export function sourceDedupeKey(e: Pick<WorkSourceEvent, "sourceSystem" | "sourceId" | "dedupeKey">): string {
  const explicit = (e.dedupeKey ?? "").trim();
  if (explicit.length > 0) return explicit;
  return `${e.sourceSystem}:${e.sourceId}`;
}

/** The source-evidence metadata block attached to every ledger row produced from
 *  a source event — so the canonical record can always answer "where did this
 *  come from?" regardless of the source. */
export function sourceEvidenceDetails(e: WorkSourceEvent): Record<string, unknown> {
  return {
    source: `${e.sourceSystem.toLowerCase()}_ingest`,
    source_type: e.sourceType,
    source_system: e.sourceSystem,
    source_id: e.sourceId,
    ...(e.sourceUrl ? { source_url: e.sourceUrl } : {}),
    dedupe_key: sourceDedupeKey(e),
    ...(e.ingestionRunId ? { ingestion_run_id: e.ingestionRunId } : {}),
    ...(e.connectorIdentity ? { connector_identity: e.connectorIdentity } : {}),
    ...(e.sensitivity ? { sensitivity: e.sensitivity } : {}),
    source_actor: e.actor.name,
    source_timestamp: e.timestamp,
  };
}

/** Result of normalizing arbitrary (non-transcript) source content: a trusted
 *  extraction text + quality stats, mirroring the transcript segmenter's shape
 *  so the downstream chain is identical. Low-quality/noisy content yields little
 *  or no trusted text, so it cannot mint high-confidence work. */
export interface SourceContentQuality {
  trustedText: string;
  stats: { total: number; trusted: number; quarantined: number; noisy_tail_start_index: number | null };
}

// A line is "noisy" if it's empty, pure punctuation/filler, or a repeated token
// wall ("you you you", "ok ok ok", "......") — the same gibberish the transcript
// segmenter quarantines, generalized to any source line.
const NOISY_LINE = /^[\s.…,;:!?_\-*=]+$|^(?:\b(\w+)\b[\s,]*)\1{2,}$|^(?:ok|yes|no|thanks?|thank you|you)(?:[\s,]+(?:ok|yes|no|thanks?|thank you|you))+$/i;

/** A Slack message as returned by `conversations.history` (the one read rail that
 *  returns real text). Minimal shape — only what intake needs. */
export interface SlackMessageLike {
  ts: string;
  text: string;
  user_name?: string | null;
  user?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  permalink?: string | null;
  participants?: string[];
}

/**
 * Adapter: a real Slack message → normalized WorkSourceEvent. This is the
 * "wire the source" mapping. NOTE (boundary): automated Slack PULL requires a
 * connected Slack binding (slack-read.provider `conversations.history`); until a
 * binding exists the source is connector_missing/setup_required and events must
 * be pushed to /otzar/ingest/source-event. Actor is the Slack handle/user id —
 * handle→entity resolution is follow-on work, so a real Slack actor lands as
 * NEEDS_OWNER unless the owner is named in the message text.
 */
export function slackMessageToSourceEvent(
  msg: SlackMessageLike,
  callerEntityId: string,
): WorkSourceEvent {
  return {
    sourceType: "CONNECTOR",
    sourceSystem: "SLACK",
    sourceId: msg.ts,
    sourceUrl: msg.permalink ?? null,
    actor: { name: msg.user_name ?? msg.user ?? "", ...(msg.user ? { handle: msg.user } : {}) },
    participants: (msg.participants ?? []).map((name) => ({ name })),
    timestamp: new Date(Math.floor(Number(msg.ts) * 1000) || Date.now()).toISOString(),
    callerEntityId,
    ...(msg.channel_name ? { teamHint: msg.channel_name } : {}),
    ...(msg.channel_name ? { title: `Slack · #${msg.channel_name}` } : {}),
    content: msg.text,
    connectorIdentity: msg.channel_id ?? null,
    dedupeKey: `SLACK:${msg.channel_id ?? "dm"}:${msg.ts}`,
  };
}

/** Generic quality/normalization for non-transcript content. Splits into lines,
 *  quarantines noisy ones, and returns the trusted remainder. Deterministic. */
export function normalizeSourceContent(content: string): SourceContentQuality {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.filter((l) => l.length > 0);
  const trusted: string[] = [];
  let quarantined = 0;
  for (const line of nonEmpty) {
    if (line.length < 3 || NOISY_LINE.test(line)) {
      quarantined += 1;
      continue;
    }
    trusted.push(line);
  }
  return {
    trustedText: trusted.join("\n"),
    stats: {
      total: nonEmpty.length,
      trusted: trusted.length,
      quarantined,
      noisy_tail_start_index: null,
    },
  };
}
