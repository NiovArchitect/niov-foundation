// FILE: conversation-detail.ts
// PURPOSE: Wave 2B Otzar conversation look-back projection (ADR-0054).
//          Pure function that maps a conversation row + the OPTIONAL
//          linked CONVERSATION_LEARNING summary capsule into a safe,
//          self-scoped detail view. No DB, no LLM, no network — a
//          projection only. Lives in its own file (like transparency.ts
//          / truncation.ts) so it is unit-testable without a database.
// CONNECTS TO: otzar.service.ts (getConversationDetail consumes the
//              mapper and surfaces the result on the
//              GET /api/v1/otzar/conversations/:id route).
//
// ADR-0054 safety constraints enforced HERE by construction:
//   - the input summary-capsule shape carries ONLY payload_summary +
//     topic_tags; raw ContextItem/capsule content, storage_location,
//     content_hash, vectors/embeddings are NOT in the input type and can
//     never be serialized
//   - transparency_available is always false (ADR-0051 transparency /
//     context_provenance is live response-only, never persisted per
//     conversation; do not fabricate it retroactively)
//   - no corrections_count / access_limited / context_provenance /
//     per-conversation continuity (not linked / not persisted) — do not
//     fabricate them
//   - `summary` is a close summary, NOT a transcript; there are no raw
//     transcripts in Wave 2B

// WHAT: The honest note surfaced on every detail response explaining what
//        Wave 2B does NOT retain (anti-overclaim).
export const CONVERSATION_CONTINUITY_NOTE =
  "Per-conversation correction and transparency signals are not retained " +
  "in Wave 2B; this is a metadata and close-summary view, not a transcript.";

// WHAT: detail-availability state for a conversation look-back (ADR-0054).
export type ConversationDetailAvailability =
  | "SUMMARY_AVAILABLE"
  | "NO_SUMMARY_YET"
  | "ACTIVE_NOT_CLOSED";

// WHAT: The safe, self-scoped conversation look-back projection.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Metadata + close summary + topics ONLY. started_at/closed_at are
//      Date (serialized to ISO on the wire by Fastify, matching the list
//      endpoint's ConversationListItem). NEVER carries transcripts, raw
//      messages, prompts, raw context, vectors/embeddings, storage_location,
//      content_hash, permission internals, bridge IDs, or capability flags.
export interface ConversationDetailView {
  conversation_id: string;
  twin_id: string;
  source_type: string;
  status: string;
  started_at: Date;
  closed_at: Date | null;
  message_count: number;
  summary: string | null;
  topics: string[];
  summary_available: boolean;
  summary_capsule_id: string | null;
  detail_availability: ConversationDetailAvailability;
  transparency_available: false;
  continuity_note: string;
}

// WHAT: Minimal structural input for the mapper. The summary-capsule shape
//        deliberately OMITS content / storage_location / content_hash /
//        vectors so the mapper cannot serialize them.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Keeps the mapper a pure projection and a compile-time guarantee
//      that raw capsule internals never enter it.
export interface ConversationDetailInput {
  conversation: {
    conversation_id: string;
    twin_id: string;
    source_type: string;
    status: string;
    started_at: Date;
    closed_at: Date | null;
    message_count: number;
    summary_capsule_id: string | null;
  };
  // The linked CONVERSATION_LEARNING summary capsule, resolved by the
  // explicit summary_capsule_id only. null when not closed / not linked /
  // missing. Safe fields only.
  summaryCapsule: { payload_summary: string; topic_tags: string[] } | null;
}

// WHAT: Project a conversation row (+ optional linked summary capsule) into
//        the Wave 2B look-back detail view.
// INPUT: ConversationDetailInput.
// OUTPUT: ConversationDetailView.
// WHY: Pure projection (ADR-0054). detail_availability mapping:
//      status !== "CLOSED"            -> ACTIVE_NOT_CLOSED (summary null);
//      closed && summaryCapsule null  -> NO_SUMMARY_YET (summary null);
//      closed && summaryCapsule set   -> SUMMARY_AVAILABLE (summary +
//                                        topics from the capsule).
//      transparency_available is always false (response-only, not
//      persisted); continuity_note is the honest anti-overclaim note.
export function projectConversationDetail(
  input: ConversationDetailInput,
): ConversationDetailView {
  const c = input.conversation;
  const isClosed = c.status === "CLOSED";

  let detailAvailability: ConversationDetailAvailability;
  let summary: string | null = null;
  let topics: string[] = [];

  if (!isClosed) {
    detailAvailability = "ACTIVE_NOT_CLOSED";
  } else if (input.summaryCapsule === null) {
    detailAvailability = "NO_SUMMARY_YET";
  } else {
    detailAvailability = "SUMMARY_AVAILABLE";
    summary = input.summaryCapsule.payload_summary;
    topics = input.summaryCapsule.topic_tags;
  }

  return {
    conversation_id: c.conversation_id,
    twin_id: c.twin_id,
    source_type: c.source_type,
    status: c.status,
    started_at: c.started_at,
    closed_at: c.closed_at,
    message_count: c.message_count,
    summary,
    topics,
    summary_available: detailAvailability === "SUMMARY_AVAILABLE",
    summary_capsule_id: c.summary_capsule_id,
    detail_availability: detailAvailability,
    transparency_available: false,
    continuity_note: CONVERSATION_CONTINUITY_NOTE,
  };
}
