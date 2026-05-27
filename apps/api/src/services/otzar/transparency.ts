// FILE: transparency.ts
// PURPOSE: Wave 1 Otzar chat transparency projection (ADR-0051). Pure
//          function that maps the governed metadata COE.assembleContext
//          ALREADY produces into safe, product-facing transparency +
//          context-provenance shapes. No retrieval, no scoring, no DB,
//          no LLM -- a projection only. Lives in its own file (like
//          truncation.ts / priming.ts) so it is unit-testable without a
//          database.
// CONNECTS TO: otzar.service.ts (conductSession consumes the mapper and
//              surfaces the result on ConductSessionSuccess). Deliberately
//              does NOT import coe.service.ts -- it accepts a minimal
//              structural input so the mapper can never reference raw
//              ContextItem.content (the input type omits it by construction).
//
// RULE 0 / ADR-0051 Security constraints enforced HERE by construction:
//   - raw ContextItem.content is NOT in the input type and never serialized
//   - capsules_denied_permission is read ONLY to derive the coarse
//     access_limited boolean; the raw integer is never serialized
//   - no vectors/embeddings, no permission-envelope internals, no bridge
//     IDs, no capability flags, no per-item scores, no cross-tenant or
//     unpermitted-teammate data are referenced
//   - context_id is an opaque reference (the already-permitted capsule_id);
//     only LOADED/permitted items are itemized -- denied/excluded IDs never
//     appear

// WHAT: Wave 1 chat transparency block (ADR-0051 Safe Response Contract).
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Surfaces that Otzar's reply is governed -- what context informed it,
//      what was skipped, and whether enterprise access rules excluded
//      anything -- without leaking internals. tool_calls is the empty tuple
//      in Wave 1 (no tools); verification_status is NOT_ACTIVE (no sidecar).
export interface ChatTransparency {
  context_items_used: number;
  items_skipped_low_relevance: number;
  items_skipped_budget: number;
  access_limited: boolean;
  retrieval_status: "USED" | "NO_MATCHES" | "DEGRADED" | "SKIPPED";
  retrieval_source: "COE_ASSEMBLE_CONTEXT";
  retrieval_reason: string;
  memory_updated: boolean;
  tool_calls: [];
  approval_required: boolean;
  verification_status: "NOT_ACTIVE";
}

// WHAT: One safe provenance row for a single piece of governed context
//        that informed the reply.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Built ONLY from already-permitted, already-loaded COE context
//      items. content_available signals the item was loaded under
//      permission; raw content is never carried. scope is "UNKNOWN" in
//      Wave 1 (ContextItem has no scope until a future COE extension);
//      tokens_used + created_at are omitted in Wave 1 (not available
//      per-item).
export interface ContextProvenanceItem {
  context_id: string;
  title: string | null;
  source_type: string;
  scope: "PERSONAL" | "ENTERPRISE" | "UNKNOWN";
  content_available: boolean;
  reason: string;
  tokens_used?: number;
  created_at?: string;
}

// WHAT: Minimal structural view of the COE.assembleContext result the
//        mapper needs. Deliberately OMITS ContextItem.content so the
//        mapper cannot serialize raw content. AssembleContextSuccess /
//        AssembleContextFailure satisfy this shape structurally.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Keeps the mapper a pure projection with no coe.service.ts import
//      and a compile-time guarantee that raw content never enters it.
export interface CoeTransparencyInput {
  ok: boolean;
  capsules_skipped_low_relevance?: number;
  capsules_skipped_budget?: number;
  capsules_denied_permission?: number;
  context?: ReadonlyArray<{
    capsule_id: string;
    capsule_type: string;
    topic_tags: string[];
  }>;
}

// WHAT: Friendly, customer-facing label for a capsule_type. Never exposes
//        substrate jargon ("capsule", "vector", raw enum).
// INPUT: A capsule_type string (the raw enum value, used only as a lookup key).
// OUTPUT: A human-readable source label; "Context" for anything unmapped.
// WHY: ADR-0051 requires a friendly source_type and forbids raw enum copy
//      in the customer-facing surface.
const FRIENDLY_SOURCE_TYPE: Readonly<Record<string, string>> = Object.freeze({
  FOUNDATIONAL: "Foundational knowledge",
  PREFERENCE: "Preference",
  RELATIONSHIP: "Relationship",
  DOMAIN_KNOWLEDGE: "Domain knowledge",
  BEHAVIORAL_PATTERN: "Behavioral pattern",
  IDENTITY: "Identity",
  DEVICE_DATA: "Device data",
  SESSION_LEARNING: "Session learning",
  COMPLIANCE_RECORD: "Compliance record",
  CONVERSATION_LEARNING: "Conversation learning",
  TASK_LEARNING: "Task learning",
  WORK_PATTERN: "Work pattern",
  COMMUNICATION_PREF: "Communication preference",
  DECISION_STYLE: "Decision style",
  COMMITMENT: "Commitment",
  BLOCKER: "Blocker",
  RISK: "Risk",
  HANDOFF: "Handoff",
  DECISION: "Decision",
  CORRECTION: "Correction",
});

function friendlySourceType(capsuleType: string): string {
  return FRIENDLY_SOURCE_TYPE[capsuleType] ?? "Context";
}

// WHAT: Derive a friendly title from the first topic tag, else null.
// INPUT: The item's topic_tags array.
// OUTPUT: A non-empty topic-tag string, or null.
// WHY: ADR-0051: "derive title from topic_tags[0] if safe, otherwise
//      null". topic_tags are descriptive metadata of an already-permitted
//      item -- safe to surface.
function friendlyTitle(topicTags: string[]): string | null {
  const first = topicTags[0];
  if (typeof first === "string" && first.trim().length > 0) {
    return first;
  }
  return null;
}

// WHAT: Project COE governed metadata + the conductSession context_used
//        count into the Wave 1 transparency + context_provenance shapes.
// INPUT: { coe: a CoeTransparencyInput (the assembleContext result or a
//          safe summary), context_items_used: the existing context_used
//          scalar }.
// OUTPUT: { transparency, context_provenance }.
// WHY: Pure projection (ADR-0051 Decision 1 "surface, do not rebuild").
//      Status mapping: coe.ok && context.length > 0 -> USED; coe.ok &&
//      context.length === 0 -> NO_MATCHES; !coe.ok (chat still proceeds)
//      -> DEGRADED. SKIPPED is part of the contract type but is NOT emitted
//      in Wave 1 -- conductSession has no signal that cleanly distinguishes
//      a budget/no-candidate skip from NO_MATCHES, so SKIPPED is left for a
//      future COE-signal extension (ADR-0051 §Safe Response Contract note).
export function projectOtzarTransparency(input: {
  coe: CoeTransparencyInput;
  context_items_used: number;
}): { transparency: ChatTransparency; context_provenance: ContextProvenanceItem[] } {
  const { coe, context_items_used } = input;

  // DEGRADED: COE did not succeed, but conductSession still replies.
  if (!coe.ok) {
    return {
      transparency: {
        context_items_used,
        items_skipped_low_relevance: 0,
        items_skipped_budget: 0,
        access_limited: false,
        retrieval_status: "DEGRADED",
        retrieval_source: "COE_ASSEMBLE_CONTEXT",
        retrieval_reason:
          "Context retrieval was unavailable; replied without governed memory.",
        memory_updated: false,
        tool_calls: [],
        approval_required: false,
        verification_status: "NOT_ACTIVE",
      },
      context_provenance: [],
    };
  }

  const loaded = coe.context ?? [];
  const retrievalStatus: ChatTransparency["retrieval_status"] =
    loaded.length > 0 ? "USED" : "NO_MATCHES";

  // Coarse boolean ONLY -- the raw denied count is never serialized.
  const accessLimited = (coe.capsules_denied_permission ?? 0) > 0;

  const retrievalReason =
    retrievalStatus === "USED"
      ? "Used context relevant to your message."
      : "No stored context matched your message.";

  // Provenance is built ONLY from loaded, already-permitted items.
  const contextProvenance: ContextProvenanceItem[] = loaded.map((item) => ({
    context_id: item.capsule_id,
    title: friendlyTitle(item.topic_tags),
    source_type: friendlySourceType(item.capsule_type),
    scope: "UNKNOWN",
    content_available: true,
    reason: "Relevant to your message",
  }));

  return {
    transparency: {
      context_items_used,
      items_skipped_low_relevance: coe.capsules_skipped_low_relevance ?? 0,
      items_skipped_budget: coe.capsules_skipped_budget ?? 0,
      access_limited: accessLimited,
      retrieval_status: retrievalStatus,
      retrieval_source: "COE_ASSEMBLE_CONTEXT",
      retrieval_reason: retrievalReason,
      memory_updated: false,
      tool_calls: [],
      approval_required: false,
      verification_status: "NOT_ACTIVE",
    },
    context_provenance: contextProvenance,
  };
}
