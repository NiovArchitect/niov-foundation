// FILE: drift-signal.service.ts
// PURPOSE: Section 1 Wave 3B — Otzar drift detection coaching/alignment
//          trust loop per ADR-0058. Pure derived read-only service that
//          computes per-conversation drift signals from the caller's
//          own CORRECTION capsules. Self-scoped; no manager visibility;
//          no employee scoring; no raw conversation content; no
//          persisted "drift profile" row.
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts (analyzeConversation
//     Drift surface added to OtzarService alongside getConversationCorrections)
//   - apps/api/src/routes/otzar.routes.ts (NEW GET /api/v1/otzar/
//     conversations/:id/drift-signals route mirrors Wave 2C
//     /corrections pattern)
//   - packages/database/src/queries/audit.ts (writeAuditEvent +
//     ADMIN_ACTION + details.action = DRIFT_SIGNAL_READ — NO new
//     audit literal per ADR-0058 §4)
//   - apps/api/src/services/otzar/conversation-corrections.ts (Wave 2C
//     sibling projection; same shape conventions)
//
// PRIVACY INVARIANT (ADR-0058 §2 + §7):
//   - Response carries closed-vocabulary signal labels + safe counts +
//     honest notes ONLY. NEVER raw correction text, capsule IDs, topic
//     tag values, payload_summary, conversation transcripts, numeric
//     scores, per-employee comparison fields, or AI-generated freeform
//     commentary about the employee.
//   - Audit row carries the FACT of the read + the signal LABELS +
//     the signal count. NEVER the topic tag values, NEVER the
//     correction texts.
//   - Topic tag VALUES are intentionally NEVER returned to the caller
//     (even though the caller technically owns them via their own
//     wallet) — the LABEL fires but the tags themselves stay in the
//     caller's wallet. This is the strictest interpretation of
//     "no content surface beyond Wave 2C SAFE projection" per
//     ADR-0058 §1.

import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import type { OtzarFailure } from "./otzar.service.js";

// WHAT: The fixed velocity threshold above which the
//        CORRECTION_VELOCITY_ELEVATED signal fires (ADR-0058 §5).
// INPUT: None.
// OUTPUT: A constant integer.
// WHY: Service-tier constant per ADR-0058 §"Implementation detail".
//      A correction count STRICTLY GREATER THAN this threshold fires
//      the signal (so 4+ corrections fire when threshold=3). Future
//      operator-tunable per-org override is forward-substrate.
export const CORRECTION_VELOCITY_THRESHOLD_DEFAULT = 3;

// WHAT: Topic tag prefixes auto-added by ObservationService.processCorrection
//        that do not indicate a recurring theme. Per ADR-0058 §5 +
//        §"Implementation detail" — only operator-supplied additional
//        tags count toward the RECURRING_CORRECTION_THEME signal.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: processCorrection always auto-emits the literal `correction` +
//      a prefix `correction-of-<targetCapsuleId>` tag. Both are
//      mechanical (one bookmarks the capsule type; one tracks the
//      corrected target). Neither indicates a recurring theme. The
//      v1 service v1 honestly notes that until operator-supplied
//      topic tag input lands as a separate slice, RECURRING_CORRECTION_
//      THEME will rarely fire.
const RECURRING_THEME_GENERIC_LITERAL_TAG = "correction";
const RECURRING_THEME_GENERIC_PREFIX = "correction-of-";

// WHAT: The closed-vocabulary drift-signal label set (ADR-0058 §5).
//        Future labels add by additive extension behind a separate
//        slice authorization.
// INPUT: Used as a string-literal union.
// OUTPUT: None — type only.
// WHY: Closed vocabulary so Control Tower clients (forward-substrate)
//      branch on label strings deterministically; never on freeform
//      AI-generated text.
export type DriftSignalLabel =
  | "CORRECTION_VELOCITY_ELEVATED"
  | "RECURRING_CORRECTION_THEME";

// WHAT: The shape of one signal entry in the response.
// INPUT: Used as a return type only.
// OUTPUT: None — type only.
// WHY: Each entry carries the closed-vocabulary label + a fixed
//      honest_note string that explains the coaching framing without
//      employee-evaluation framing.
export interface DriftSignalEntry {
  label: DriftSignalLabel;
  honest_note: string;
}

// WHAT: The full success-response projection. Closed shape per
//        ADR-0058 §7.
// INPUT: Used as a return type only.
// OUTPUT: None — type only.
// WHY: Closed shape so future Prisma column additions don't
//      automatically appear in the response; future drift signal
//      additions require an explicit label + honest_note literal
//      (and adding a new label is itself a separate slice).
export interface DriftSignalsView {
  conversation_id: string;
  drift_signals: ReadonlyArray<DriftSignalEntry>;
  signal_count: number;
  corrections_observed: number;
  coaching_note: string;
  boundary_note: string;
}

// WHAT: Canonical copy locked at ADR-0058 §"Implementation detail".
// INPUT: None.
// OUTPUT: A constant string.
// WHY: Test-anchored copy so any future drift to a less-coaching /
//      more-evaluative tone surfaces as a failing test in
//      tests/integration/otzar-drift-signals.test.ts.
export const DRIFT_COACHING_NOTE =
  "Drift signals are coaching prompts for the Twin and the user. " +
  "They are not employee evaluation. They are not visible to a manager. " +
  "They are derived live from your own corrections.";

export const DRIFT_BOUNDARY_NOTE =
  "This is not a transcript. This is not an employee score. " +
  "This is not a manager surface. Raw correction content is never returned.";

// WHAT: Locked per-label honest_note copy. Per ADR-0058 §7 the
//        coaching prose is part of the contract.
const DRIFT_SIGNAL_NOTES: Readonly<Record<DriftSignalLabel, string>> =
  Object.freeze({
    CORRECTION_VELOCITY_ELEVATED:
      "Multiple corrections in this conversation. Consider revisiting the Twin's role template or clarifying intent.",
    RECURRING_CORRECTION_THEME:
      "Two or more corrections share a theme tag. Consider a single clarifying correction at the theme level.",
  });

// WHAT: Input shape for analyzeConversationDrift.
// INPUT: Used as a parameter type only.
// OUTPUT: None — type only.
// WHY: Mirrors GetConversationCorrectionsInput exactly so the route
//      layer integration is symmetric with Wave 2C.
export interface GetConversationDriftSignalsInput {
  token: string;
  conversation_id: string;
}

// WHAT: Successful return shape for analyzeConversationDrift.
// INPUT: Used as a return-union arm.
// OUTPUT: None — type only.
// WHY: Discriminated success carries the SAFE projection directly +
//      `ok: true`; matches the OtzarService convention.
export interface ConversationDriftSignalsSuccess extends DriftSignalsView {
  ok: true;
}

// WHAT: Compute the safe drift-signal projection for one conversation,
//        scoped to one caller's wallet.
// INPUT: AuthService + input.
// OUTPUT: ConversationDriftSignalsSuccess | OtzarFailure.
// WHY: Pure derived read service per ADR-0058 §3 (no schema migration
//      + reuses existing wallet_id + capsule_type + conversation_id
//      index). Self-scope enforced BEFORE any signal computation so
//      a cross-caller probe never reveals the existence (or non-
//      existence) of another entity's correction footprint.
//
// ALGORITHM (ADR-0058 §5):
//   1. Validate session (read scope).
//   2. Resolve conversation; cross-caller → 403; unknown → 404.
//   3. Resolve caller's wallet (entity_id → wallet_id). No wallet →
//      honest zero-state response.
//   4. SELECT capsule_id (only — keep query payload-free), topic_tags,
//      created_at FROM memory_capsule WHERE wallet_id = caller's
//      wallet AND capsule_type = 'CORRECTION' AND conversation_id =
//      :id AND deleted_at IS NULL. This is the indexed hot path.
//   5. corrections_observed = number of rows returned.
//   6. CORRECTION_VELOCITY_ELEVATED fires when corrections_observed
//      > CORRECTION_VELOCITY_THRESHOLD_DEFAULT.
//   7. RECURRING_CORRECTION_THEME fires when 2+ corrections share
//      any topic tag that is NOT the generic literal "correction"
//      and NOT prefixed "correction-of-".
//   8. Emit ADMIN_ACTION:DRIFT_SIGNAL_READ audit row with the FACT
//      of the read + signal_count + signal LABEL strings. Audit
//      details NEVER carry topic tag values, capsule IDs, or any
//      content.
//   9. Return the SAFE projection.
export async function analyzeConversationDrift(args: {
  authService: AuthService;
  input: GetConversationDriftSignalsInput;
}): Promise<ConversationDriftSignalsSuccess | OtzarFailure> {
  const session = await args.authService.validateSession(
    args.input.token,
    "read",
  );
  if (!session.valid) {
    return {
      ok: false,
      code: session.code,
      message: "Drift signals denied",
    };
  }
  const ownerEntityId = session.entity_id;

  // Step 2 — conversation existence + self-scope BEFORE any signal
  // computation. Mirrors Wave 2C `getConversationCorrections` order
  // verbatim so a cross-caller probe collapses to the same 403/404
  // surface.
  const conv = await prisma.otzarConversation.findUnique({
    where: { conversation_id: args.input.conversation_id },
    select: { conversation_id: true, entity_id: true },
  });
  if (conv === null) {
    return {
      ok: false,
      code: "CONVERSATION_NOT_FOUND",
      message: "Conversation not found",
    };
  }
  if (conv.entity_id !== ownerEntityId) {
    return {
      ok: false,
      code: "NOT_CONVERSATION_OWNER",
      message: "Caller does not own this conversation",
    };
  }

  // Step 3 — resolve wallet.
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: ownerEntityId },
    select: { wallet_id: true },
  });
  if (wallet === null) {
    // Honest zero-state: authenticated caller owns the conversation
    // but has no wallet (edge case; should not happen in production
    // but handled symmetrically with Wave 2C). Emit the audit row +
    // return zero-signal projection.
    await emitDriftSignalRead({
      actor_entity_id: ownerEntityId,
      conversation_id: conv.conversation_id,
      signal_count: 0,
      signals_present: [],
    });
    return {
      ok: true,
      ...buildSafeView({
        conversation_id: conv.conversation_id,
        corrections_observed: 0,
        labels: [],
      }),
    };
  }

  // Step 4 — single indexed query covering both signals. SELECT
  // topic_tags + created_at ONLY (no payload_summary, no content_hash,
  // no target_capsule_id — those are FORBIDDEN per ADR-0058 §7).
  const rows = await prisma.memoryCapsule.findMany({
    where: {
      wallet_id: wallet.wallet_id,
      capsule_type: "CORRECTION",
      conversation_id: conv.conversation_id,
      deleted_at: null,
    },
    select: { topic_tags: true },
  });

  const corrections_observed = rows.length;
  const labels: DriftSignalLabel[] = [];

  // Step 6 — velocity signal.
  if (corrections_observed > CORRECTION_VELOCITY_THRESHOLD_DEFAULT) {
    labels.push("CORRECTION_VELOCITY_ELEVATED");
  }

  // Step 7 — recurring-theme signal. Filter each row's topic_tags to
  // operator-supplied tags (drop the auto-tags), then count the
  // multiplicity of every remaining tag. A tag appearing 2+ times
  // across distinct corrections fires the signal.
  if (corrections_observed >= 2) {
    const themeCounts = new Map<string, number>();
    for (const row of rows) {
      const seen = new Set<string>();
      for (const tag of row.topic_tags) {
        if (
          tag === RECURRING_THEME_GENERIC_LITERAL_TAG ||
          tag.startsWith(RECURRING_THEME_GENERIC_PREFIX)
        ) {
          continue;
        }
        if (seen.has(tag)) continue;
        seen.add(tag);
        themeCounts.set(tag, (themeCounts.get(tag) ?? 0) + 1);
      }
    }
    let hasRecurring = false;
    for (const count of themeCounts.values()) {
      if (count >= 2) {
        hasRecurring = true;
        break;
      }
    }
    if (hasRecurring) {
      labels.push("RECURRING_CORRECTION_THEME");
    }
  }

  // Step 8 — audit emission with the FACT of the read + closed-
  // vocabulary signal LABELS only.
  await emitDriftSignalRead({
    actor_entity_id: ownerEntityId,
    conversation_id: conv.conversation_id,
    signal_count: labels.length,
    signals_present: labels,
  });

  // Step 9 — SAFE projection.
  return {
    ok: true,
    ...buildSafeView({
      conversation_id: conv.conversation_id,
      corrections_observed,
      labels,
    }),
  };
}

// WHAT: Build the SAFE response projection from the computed inputs.
//        Closed shape so future Prisma columns don't auto-leak.
// INPUT: conversation_id + corrections_observed + labels.
// OUTPUT: DriftSignalsView.
// WHY: Single projection factory so every code path returning a
//      DriftSignalsView lands the same canonical copy.
function buildSafeView(args: {
  conversation_id: string;
  corrections_observed: number;
  labels: ReadonlyArray<DriftSignalLabel>;
}): DriftSignalsView {
  return {
    conversation_id: args.conversation_id,
    drift_signals: args.labels.map((label) => ({
      label,
      honest_note: DRIFT_SIGNAL_NOTES[label],
    })),
    signal_count: args.labels.length,
    corrections_observed: args.corrections_observed,
    coaching_note: DRIFT_COACHING_NOTE,
    boundary_note: DRIFT_BOUNDARY_NOTE,
  };
}

// WHAT: Emit the watching-the-watchers ADMIN_ACTION audit row for a
//        drift-signal read. NO new audit literal per ADR-0058 §4 +
//        Section 7 + Section 4 Wave 2/4/5/7 precedent.
// INPUT: actor_entity_id + conversation_id + signal_count + signals
//        present labels.
// OUTPUT: Promise<void>.
// WHY: RULE 4 — every read of a privileged surface emits its own
//      audit row. Audit details carry the FACT + closed-vocabulary
//      labels only; NEVER topic tag values, capsule IDs, or content.
async function emitDriftSignalRead(args: {
  actor_entity_id: string;
  conversation_id: string;
  signal_count: number;
  signals_present: ReadonlyArray<DriftSignalLabel>;
}): Promise<void> {
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    details: {
      action: "DRIFT_SIGNAL_READ",
      conversation_id: args.conversation_id,
      signal_count: args.signal_count,
      // Spread as a fresh array so Prisma's JsonInput typing is
      // satisfied without leaking the ReadonlyArray brand.
      signals_present: [...args.signals_present],
    },
  });
}
