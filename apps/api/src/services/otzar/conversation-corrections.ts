// FILE: conversation-corrections.ts
// PURPOSE: Wave 2C Otzar conversation-correction-signals projection
//          (ADR-0055). Pure function that maps a caller's own
//          per-conversation CORRECTION counts + last-seen freshness
//          into a safe, self-scoped view. No DB, no LLM, no network —
//          a projection only. Lives in its own file (like
//          conversation-detail.ts / transparency.ts) so it is
//          unit-testable without a database.
// CONNECTS TO: otzar.service.ts (getConversationCorrections consumes
//              the mapper and surfaces the result on the
//              GET /api/v1/otzar/conversations/:id/corrections route).
//
// ADR-0055 safety constraints enforced HERE by construction:
//   - the input shape carries ONLY the conversation_id, a numeric
//     correction count, and a Date | null for the most-recent linked
//     correction's created_at; raw correction payload_summary /
//     payload_content / target_capsule_id / capsule IDs / vectors /
//     storage_location are NOT in the input type and can never be
//     serialized
//   - drift_prevention_note + continuity_note are fixed honest prose
//     locked at this module — no surveillance framing, no "best
//     practice learned" / "drift prevented" / "AI fixed itself"
//   - the output never claims employee score, drift score, manager
//     visibility, or org-wide aggregation; the surface is
//     self-scoped per ADR-0055 §Decision 10

// WHAT: The honest note surfaced on every corrections response. Frames
//        correction signals as scoped Twin context priority — NOT
//        autonomous learning, NOT a transcript, NOT employee scoring.
//        (ADR-0055 §Decision 9 allowed copy.)
export const CORRECTION_DRIFT_PREVENTION_NOTE =
  "Correction signals help your Twin prioritize future context within " +
  "scope. This does not expose raw messages. This is not an employee score.";

// WHAT: The honest continuity note. Anti-overclaim, mirrors the Wave
//        2B continuity_note shape: a metadata view, never transcript
//        replay; "submitted/available," not "best practice learned."
export const CORRECTION_CONTINUITY_NOTE =
  "Corrections are scoped signals attached to your own wallet; they " +
  "improve future context priority within scope and are not a " +
  "transcript or replay of raw messages.";

// WHAT: The safe, self-scoped corrections-signal projection
//        (ADR-0055 §Decision 5).
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Counts + last-seen freshness ONLY. last_correction_at is an ISO
//      string (Fastify serializes Date as ISO on the wire) or null
//      when the count is 0. NEVER carries correction payloads,
//      target_capsule_id, capsule IDs, vectors/embeddings,
//      storage_location, content_hash, permission internals, bridge
//      IDs, capability flags, drift score, employee score,
//      best-practice-learned status, manager fields, or cross-tenant
//      data.
export interface ConversationCorrectionsView {
  conversation_id: string;
  corrections_count: number;
  has_corrections: boolean;
  last_correction_at: string | null;
  drift_prevention_note: string;
  continuity_note: string;
}

// WHAT: Minimal structural input for the mapper. The shape deliberately
//        OMITS raw correction payloads + target_capsule_id + capsule
//        IDs + vectors + storage_location so the mapper cannot
//        serialize them.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Keeps the mapper a pure projection and a compile-time guarantee
//      that raw correction internals never enter it.
export interface ConversationCorrectionsInput {
  conversation_id: string;
  corrections_count: number;
  // The Date of the most recent linked CORRECTION capsule's created_at,
  // or null when corrections_count is 0. Date in / ISO string out.
  last_correction_at: Date | null;
}

// WHAT: Project a per-conversation correction count + last-seen Date
//        into the Wave 2C corrections view.
// INPUT: ConversationCorrectionsInput.
// OUTPUT: ConversationCorrectionsView.
// WHY: Pure projection (ADR-0055). has_corrections is derived from
//      corrections_count > 0; last_correction_at is ISO-serialized or
//      null; drift_prevention_note + continuity_note are the locked
//      anti-overclaim notes. Submitted/available — NOT
//      learned/applied (ADR-0055 §Decision 7).
export function projectConversationCorrections(
  input: ConversationCorrectionsInput,
): ConversationCorrectionsView {
  return {
    conversation_id: input.conversation_id,
    corrections_count: input.corrections_count,
    has_corrections: input.corrections_count > 0,
    last_correction_at:
      input.last_correction_at === null
        ? null
        : input.last_correction_at.toISOString(),
    drift_prevention_note: CORRECTION_DRIFT_PREVENTION_NOTE,
    continuity_note: CORRECTION_CONTINUITY_NOTE,
  };
}
