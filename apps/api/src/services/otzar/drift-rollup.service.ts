// FILE: drift-rollup.service.ts
// PURPOSE: Section 1 Wave 4C — Otzar cross-conversation drift
//          rollup per ADR-0058 §9 forward-substrate item +
//          Founder Wave 4C direction. Pure derived read-only
//          self-scoped service that computes a per-caller
//          summary of drift posture across ALL the caller's
//          conversations + the Wave 4A wallet-level stale-
//          context signal. Self-scoped only; no manager
//          visibility; no employee scoring; no per-conversation
//          attribution beyond aggregate counts.
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts
//     (analyzeDriftRollupForCaller method added)
//   - apps/api/src/routes/otzar.routes.ts (NEW GET /api/v1/otzar/
//     drift-rollup route)
//   - apps/api/src/services/otzar/drift-signal.service.ts
//     (Wave 3 per-conversation; same audit literal +
//     CORRECTION_VELOCITY_THRESHOLD_DEFAULT reuse)
//   - apps/api/src/services/otzar/stale-context-signal.service.ts
//     (Wave 4A wallet-level stale signal; rollup folds in
//     stale_capsule_count for the holistic view)
//   - ADR-0058 §9 cross-conversation Twin-level rollup
//     forward-substrate item
//
// PRIVACY INVARIANT:
//   - Response carries closed-vocab posture label + aggregate
//     counts + locked coaching/boundary notes ONLY. NEVER
//     conversation IDs, capsule IDs, transcripts, raw
//     corrections, topic tag values, per-conversation
//     attribution, or AI-generated freeform commentary.
//   - Audit reuses ADMIN_ACTION + DRIFT_SIGNAL_READ literal
//     with source_signal: "CROSS_CONVERSATION_ROLLUP"
//     discriminator. No new audit literal.

import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { CORRECTION_VELOCITY_THRESHOLD_DEFAULT } from "./drift-signal.service.js";

// WHAT: Closed-vocabulary drift rollup posture labels.
// INPUT: Used as a string-literal union.
// OUTPUT: None — type only.
// WHY: Three labels at v1:
//   - AT_RISK: caller has at least one conversation with
//     elevated correction velocity OR at least one stale-
//     context capsule. Coaching prompt for the caller +
//     their Twin.
//   - NORMAL: caller has at least one conversation OR
//     evaluable capsule; no AT_RISK signal fires.
//   - INSUFFICIENT_DATA: caller has zero conversations AND
//     zero evaluable capsules — honest zero-state.
export type DriftRollupLabel =
  | "AT_RISK"
  | "NORMAL"
  | "INSUFFICIENT_DATA";

// WHAT: SAFE projection envelope for the rollup.
// INPUT: Used as a return type only.
// OUTPUT: None — type only.
// WHY: Closed-vocab fields + aggregate counts only. NEVER
//      conversation IDs, capsule IDs, per-conversation
//      attribution.
export interface DriftRollupView {
  signal: { label: DriftRollupLabel; honest_note: string };
  conversations_evaluated: number;
  conversations_with_elevated_velocity: number;
  capsules_evaluated: number;
  stale_capsule_count: number;
  coaching_note: string;
  boundary_note: string;
}

// WHAT: Canonical coaching + boundary copy. Test-anchored.
// INPUT: None.
// OUTPUT: Constant strings.
// WHY: Coaching framing locked at the service tier so future
//      drift to evaluative tone surfaces as a test failure.
//      Founder Wave 4C boundary explicit: NO surveillance, NO
//      employee score, NO manager surface.
export const DRIFT_ROLLUP_COACHING_NOTE =
  "Drift rollup is a self-scoped recalibration prompt across " +
  "your conversations and your wallet context. It is not an " +
  "employee evaluation. It is not visible to a manager. It is " +
  "derived live from your own corrections and your own context " +
  "metadata.";

export const DRIFT_ROLLUP_BOUNDARY_NOTE =
  "This is not a transcript. This is not an employee score. " +
  "This is not a manager surface. This is not a cross-employee " +
  "comparison. Raw conversation content, raw correction text, " +
  "and per-conversation attribution are never returned.";

const DRIFT_ROLLUP_SIGNAL_NOTES: Readonly<
  Record<DriftRollupLabel, string>
> = Object.freeze({
  AT_RISK:
    "Your drift posture shows at least one conversation with " +
    "elevated correction velocity OR at least one stale-context " +
    "capsule. Consider revisiting recent Twin sessions or " +
    "refreshing context.",
  NORMAL:
    "Your drift posture across conversations and context is " +
    "within normal bounds. No recalibration prompts fire.",
  INSUFFICIENT_DATA:
    "Your account has zero conversations and zero evaluable " +
    "context capsules. No drift rollup can be derived yet.",
});

// WHAT: Input shape — token-only (self-scoped).
// INPUT: Used as a parameter type only.
// OUTPUT: None — type only.
// WHY: Mirrors GetStaleContextSignalInput; no conversation_id
//      or scope qualifier (per-caller is the v1 boundary).
export interface GetDriftRollupInput {
  token: string;
}

// WHAT: Successful return shape.
// INPUT: Used as a return-union arm.
// OUTPUT: None — type only.
// WHY: Symmetric with other Wave 3/4A success shapes.
export interface DriftRollupSuccess extends DriftRollupView {
  ok: true;
}

// WHAT: Failure return shape (session-only).
// INPUT: Used as a return-union arm.
// OUTPUT: None — type only.
// WHY: Matches StaleContextSignalFailure shape verbatim.
export interface DriftRollupFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED";
  message: string;
}

// WHAT: Compute the SAFE cross-conversation drift rollup for
//        one caller.
// INPUT: AuthService + input { token }.
// OUTPUT: DriftRollupSuccess | DriftRollupFailure.
// WHY: Pure derived read service. Self-scope enforced BEFORE
//      any signal computation; all queries scoped to caller's
//      entity_id + wallet_id.
//
// ALGORITHM:
//   1. Validate session (read scope).
//   2. Count caller's OtzarConversations (entity_id = caller).
//   3. Resolve caller's wallet_id.
//   4. For each conversation, count CORRECTION capsules in the
//      caller's wallet linked via conversation_id. Count
//      conversations where corrections > velocity threshold.
//   5. Count caller's evaluable capsules (embedding_content_hash
//      not null + deleted_at null) + stale capsules (in-process
//      hash compare).
//   6. Map (conversation count, conversations_with_elevated_
//      velocity, capsules_evaluated, stale_capsule_count) to
//      closed-vocab posture label:
//        - 0 conversations + 0 evaluable capsules →
//          INSUFFICIENT_DATA
//        - any conversation with elevated velocity OR any
//          stale capsule → AT_RISK
//        - else → NORMAL
//   7. Emit ADMIN_ACTION:DRIFT_SIGNAL_READ audit with
//      source_signal = "CROSS_CONVERSATION_ROLLUP" + counts.
//   8. Return SAFE projection.
export async function analyzeDriftRollupForCaller(args: {
  authService: AuthService;
  input: GetDriftRollupInput;
}): Promise<DriftRollupSuccess | DriftRollupFailure> {
  const session = await args.authService.validateSession(
    args.input.token,
    "read",
  );
  if (!session.valid) {
    return {
      ok: false,
      code: session.code,
      message: "Drift rollup read denied",
    };
  }

  // Step 2 — caller's conversations.
  const conversations = await prisma.otzarConversation.findMany({
    where: { entity_id: session.entity_id },
    select: { conversation_id: true },
  });
  const conversationsEvaluated = conversations.length;

  // Step 3 — wallet (may be null for new accounts).
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: session.entity_id },
    select: { wallet_id: true },
  });

  // Step 4 — per-conversation correction counts (group at the
  // DB tier via groupBy to avoid N+1).
  let conversationsWithElevatedVelocity = 0;
  if (conversationsEvaluated > 0 && wallet !== null) {
    const conversationIds = conversations.map((c) => c.conversation_id);
    const grouped = await prisma.memoryCapsule.groupBy({
      by: ["conversation_id"],
      where: {
        wallet_id: wallet.wallet_id,
        capsule_type: "CORRECTION",
        conversation_id: { in: conversationIds },
        deleted_at: null,
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      if (
        row._count._all > CORRECTION_VELOCITY_THRESHOLD_DEFAULT &&
        row.conversation_id !== null
      ) {
        conversationsWithElevatedVelocity++;
      }
    }
  }

  // Step 5 — stale-context wallet counts (replicates Wave 4A
  // logic with the same query shape; not delegating to Wave
  // 4A's analyze function because we need raw counts here,
  // not the SAFE projection envelope).
  let capsulesEvaluated = 0;
  let staleCapsuleCount = 0;
  if (wallet !== null) {
    capsulesEvaluated = await prisma.memoryCapsule.count({
      where: {
        wallet_id: wallet.wallet_id,
        deleted_at: null,
        embedding_content_hash: { not: null },
      },
    });
    if (capsulesEvaluated > 0) {
      const rows = await prisma.memoryCapsule.findMany({
        where: {
          wallet_id: wallet.wallet_id,
          deleted_at: null,
          embedding_content_hash: { not: null },
        },
        select: { content_hash: true, embedding_content_hash: true },
      });
      for (const r of rows) {
        if (
          r.embedding_content_hash !== null &&
          r.embedding_content_hash !== r.content_hash
        ) {
          staleCapsuleCount++;
        }
      }
    }
  }

  // Step 6 — closed-vocab posture label.
  let label: DriftRollupLabel;
  if (conversationsEvaluated === 0 && capsulesEvaluated === 0) {
    label = "INSUFFICIENT_DATA";
  } else if (
    conversationsWithElevatedVelocity > 0 ||
    staleCapsuleCount > 0
  ) {
    label = "AT_RISK";
  } else {
    label = "NORMAL";
  }

  // Step 7 — audit.
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: session.entity_id,
    session_id: session.session_id,
    details: {
      action: "DRIFT_SIGNAL_READ",
      source_signal: "CROSS_CONVERSATION_ROLLUP",
      label,
      conversations_evaluated: conversationsEvaluated,
      conversations_with_elevated_velocity: conversationsWithElevatedVelocity,
      capsules_evaluated: capsulesEvaluated,
      stale_capsule_count: staleCapsuleCount,
    },
  });

  return {
    ok: true,
    signal: {
      label,
      honest_note: DRIFT_ROLLUP_SIGNAL_NOTES[label],
    },
    conversations_evaluated: conversationsEvaluated,
    conversations_with_elevated_velocity: conversationsWithElevatedVelocity,
    capsules_evaluated: capsulesEvaluated,
    stale_capsule_count: staleCapsuleCount,
    coaching_note: DRIFT_ROLLUP_COACHING_NOTE,
    boundary_note: DRIFT_ROLLUP_BOUNDARY_NOTE,
  };
}
