// FILE: stale-context-signal.service.ts
// PURPOSE: Section 1 Wave 4A — Otzar stale-context drift signal
//          per ADR-0058 §9 + ADR-0045 G5.1. Pure derived
//          read-only service that computes a self-scoped wallet-
//          level "is the caller's persisted context stale?"
//          signal from existing MemoryCapsule embedding-lag
//          metadata. Self-scoped; no manager visibility; no
//          employee scoring; no raw capsule/content/transcript
//          exposure; no chain-of-thought; no prompts.
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts (analyzeStale
//     ContextForCaller surface added to OtzarService)
//   - apps/api/src/routes/otzar.routes.ts (NEW GET /api/v1/otzar/
//     stale-context-signal route)
//   - apps/api/src/services/otzar/drift-signal.service.ts (Wave 3
//     sibling; ADMIN_ACTION + DRIFT_SIGNAL_READ audit reused with
//     new source_signal discriminator; no new audit literal)
//   - ADR-0058 §9 stale-context-drift forward-substrate item
//   - ADR-0045 G5.1 canonical embedding-lag staleness substrate
//
// PRIVACY INVARIANT (ADR-0058 §2 + §7 + ADR-0045 §G5.1):
//   - Response carries closed-vocabulary signal label + safe
//     counts + honest coaching/boundary notes ONLY. NEVER raw
//     capsule content, capsule IDs, content_hash values,
//     embedding_content_hash values, storage_location,
//     payload_summary, topic tag values, transcripts, numeric
//     scores, per-capsule attribution, or AI-generated
//     freeform commentary.
//   - Audit row carries the FACT of the read + the signal
//     LABEL + counts + source_signal discriminator. NEVER
//     raw hash values or capsule identifiers.

import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";

// WHAT: The closed-vocabulary stale-context signal label set
//        per ADR-0058 §9 + Founder Wave 4A direction.
// INPUT: Used as a string-literal union.
// OUTPUT: None — type only.
// WHY: Closed vocab so future consumers branch deterministically
//      on label strings. Three labels at v1:
//        - FRESH_CONTEXT: caller has at least one evaluable
//          capsule and ZERO stale-embedding capsules.
//        - STALE_CONTEXT_RISK: caller has at least one
//          stale-embedding capsule (embedding_content_hash !=
//          content_hash per ADR-0045 G5.1 canonical signal).
//        - INSUFFICIENT_DATA: caller has zero evaluable
//          capsules (new/empty wallet OR all capsules
//          excluded). Honest zero-state — not a "PASS".
export type StaleContextLabel =
  | "FRESH_CONTEXT"
  | "STALE_CONTEXT_RISK"
  | "INSUFFICIENT_DATA";

// WHAT: One signal entry — the label + honest_note prose.
// INPUT: Used as a return type only.
// OUTPUT: None — type only.
// WHY: Mirrors DriftSignalEntry shape (Wave 3 sibling) so
//      future Control Tower clients consume both routes via
//      one closed-shape pattern.
export interface StaleContextSignalEntry {
  label: StaleContextLabel;
  honest_note: string;
}

// WHAT: The full SAFE projection response. Closed shape per
//        ADR-0058 §7 + ADR-0045 G5.1 no-leak discipline.
// INPUT: Used as a return type only.
// OUTPUT: None — type only.
// WHY: Counts are safe (aggregate cardinalities of the caller's
//      own wallet); coaching_note / boundary_note are locked
//      copy preserving the alignment/coaching framing per
//      ADR-0058 §"Implementation detail".
export interface StaleContextSignalsView {
  signal: StaleContextSignalEntry;
  capsules_evaluated: number;
  stale_capsule_count: number;
  coaching_note: string;
  boundary_note: string;
}

// WHAT: Canonical coaching + boundary copy locked at this
//        service. Test-anchored so any drift to a less-coaching
//        / more-evaluative tone surfaces as a failing test.
// INPUT: None.
// OUTPUT: Constant strings.
// WHY: Per ADR-0058 §"Implementation detail" the coaching prose
//      is part of the contract. Founder Wave 4A boundary
//      explicit: NO surveillance framing, NO employee score,
//      NO manager surface, NO autonomous enforcement.
export const STALE_CONTEXT_COACHING_NOTE =
  "Stale-context signal is a recalibration prompt for the " +
  "Twin and the user. It indicates persisted context whose " +
  "embedding lags behind its content. It is not an employee " +
  "evaluation. It is not visible to a manager. It is derived " +
  "live from your own wallet's existing metadata.";

export const STALE_CONTEXT_BOUNDARY_NOTE =
  "This is not a transcript. This is not an employee score. " +
  "This is not a manager surface. Raw capsule content, raw " +
  "embedding vectors, content hashes, and storage locations " +
  "are never returned.";

// WHAT: Locked per-label honest_note copy.
// INPUT: None.
// OUTPUT: Frozen Record.
// WHY: ADR-0058 §7 contract — explicit coaching framing per
//      label, locked at this service tier so accidental copy
//      drift surfaces as a test failure.
const STALE_CONTEXT_SIGNAL_NOTES: Readonly<
  Record<StaleContextLabel, string>
> = Object.freeze({
  FRESH_CONTEXT:
    "Your persisted context embeddings appear current. " +
    "Twin retrieval should reflect your most recent content updates.",
  STALE_CONTEXT_RISK:
    "One or more of your context capsules has an embedding " +
    "that lags behind its content. Twin retrieval may surface " +
    "older content shape; consider re-embedding via the " +
    "existing context refresh path.",
  INSUFFICIENT_DATA:
    "Your wallet has zero capsules to evaluate for embedding " +
    "freshness. No stale-context signal can be derived yet.",
});

// WHAT: Input shape for analyzeStaleContextForCaller.
// INPUT: Used as a parameter type only.
// OUTPUT: None — type only.
// WHY: Token-only input mirrors the Wave 3 drift-signal route
//      pattern. No conversation_id at v1 (per-conversation
//      tracing is forward-substrate per ADR-0058 §9; v1
//      derives over the caller's whole wallet).
export interface GetStaleContextSignalInput {
  token: string;
}

// WHAT: Successful return shape.
// INPUT: Used as a return-union arm.
// OUTPUT: None — type only.
// WHY: Mirrors ConversationDriftSignalsSuccess (Wave 3 sibling)
//      so route layer is symmetric.
export interface StaleContextSignalSuccess extends StaleContextSignalsView {
  ok: true;
}

// WHAT: Failure return shape — subset of OtzarFailure for
//        session-only failures (no conversation lookup at this
//        route).
// INPUT: Used as a return-union arm.
// OUTPUT: None — type only.
// WHY: Restricting the failure surface keeps the type discipline
//      tight; route tier maps these codes to HTTP status.
export interface StaleContextSignalFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED";
  message: string;
}

// WHAT: Compute the SAFE stale-context signal projection for
//        one caller's wallet.
// INPUT: AuthService + input { token }.
// OUTPUT: StaleContextSignalSuccess | StaleContextSignalFailure.
// WHY: Pure derived read service per ADR-0058 §3 (no schema
//      migration + reuses existing MemoryCapsule indexes).
//      Self-scope enforced BEFORE any signal computation; the
//      query is scoped to the caller's wallet via Wallet.entity_id
//      @unique → wallet_id lookup.
//
// ALGORITHM:
//   1. Validate session (read scope).
//   2. Resolve caller's wallet_id from session.entity_id via
//      Wallet table (unique on entity_id). No wallet → honest
//      INSUFFICIENT_DATA zero-state.
//   3. Count caller's evaluable capsules: deleted_at IS NULL
//      AND embedding_content_hash IS NOT NULL (only capsules
//      that have had an embedding generated are evaluable
//      per ADR-0045 G5.1 — capsules without embeddings are a
//      separate "never embedded" scenario, not stale-context).
//   4. Count caller's stale-embedding capsules: same filter +
//      embedding_content_hash != content_hash.
//   5. Map (capsules_evaluated, stale_capsule_count) to closed-
//      vocab label:
//        - capsules_evaluated == 0 → INSUFFICIENT_DATA
//        - stale_capsule_count > 0 → STALE_CONTEXT_RISK
//        - else → FRESH_CONTEXT
//   6. Emit ADMIN_ACTION:DRIFT_SIGNAL_READ audit row with the
//      FACT of the read + label + counts + source_signal =
//      "STALE_CONTEXT_WALLET" discriminator. Audit details
//      NEVER carry capsule IDs, hash values, or content.
//   7. Return the SAFE projection.
export async function analyzeStaleContextForCaller(args: {
  authService: AuthService;
  input: GetStaleContextSignalInput;
}): Promise<StaleContextSignalSuccess | StaleContextSignalFailure> {
  const session = await args.authService.validateSession(
    args.input.token,
    "read",
  );
  if (!session.valid) {
    return {
      ok: false,
      code: session.code,
      message: "Stale-context signal read denied",
    };
  }

  // Step 2 — resolve wallet_id.
  const wallet = await prisma.wallet.findUnique({
    where: { entity_id: session.entity_id },
    select: { wallet_id: true },
  });
  if (wallet === null) {
    await emitStaleContextAudit({
      actor_entity_id: session.entity_id,
      session_id: session.session_id,
      label: "INSUFFICIENT_DATA",
      capsules_evaluated: 0,
      stale_capsule_count: 0,
    });
    return {
      ok: true,
      signal: {
        label: "INSUFFICIENT_DATA",
        honest_note: STALE_CONTEXT_SIGNAL_NOTES.INSUFFICIENT_DATA,
      },
      capsules_evaluated: 0,
      stale_capsule_count: 0,
      coaching_note: STALE_CONTEXT_COACHING_NOTE,
      boundary_note: STALE_CONTEXT_BOUNDARY_NOTE,
    };
  }

  // Step 3 — count evaluable capsules.
  const capsulesEvaluated = await prisma.memoryCapsule.count({
    where: {
      wallet_id: wallet.wallet_id,
      deleted_at: null,
      embedding_content_hash: { not: null },
    },
  });

  // Step 4 — count stale-embedding capsules.
  let staleCount = 0;
  if (capsulesEvaluated > 0) {
    // Pull only the two hash columns for the count comparison;
    // never raw content. We must compare two columns from the
    // same row, which Prisma cannot express in a single where
    // clause without raw SQL — but pulling just the hashes is
    // safe (they are integrity tokens, not content). Compare
    // in-process.
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
        staleCount++;
      }
    }
  }

  // Step 5 — closed-vocab label.
  let label: StaleContextLabel;
  if (capsulesEvaluated === 0) {
    label = "INSUFFICIENT_DATA";
  } else if (staleCount > 0) {
    label = "STALE_CONTEXT_RISK";
  } else {
    label = "FRESH_CONTEXT";
  }

  // Step 6 — audit emit.
  await emitStaleContextAudit({
    actor_entity_id: session.entity_id,
    session_id: session.session_id,
    label,
    capsules_evaluated: capsulesEvaluated,
    stale_capsule_count: staleCount,
  });

  return {
    ok: true,
    signal: {
      label,
      honest_note: STALE_CONTEXT_SIGNAL_NOTES[label],
    },
    capsules_evaluated: capsulesEvaluated,
    stale_capsule_count: staleCount,
    coaching_note: STALE_CONTEXT_COACHING_NOTE,
    boundary_note: STALE_CONTEXT_BOUNDARY_NOTE,
  };
}

// WHAT: Centralized audit-emission helper for the stale-context
//        signal read.
// INPUT: Safe details only (no capsule IDs, no hash values).
// OUTPUT: void.
// WHY: ADR-0058 §4 — audit emission rides existing ADMIN_ACTION
//      literal + details.action = "DRIFT_SIGNAL_READ" discriminator.
//      source_signal discriminator narrows to the v1 wallet-level
//      stale-context source so the audit chain can distinguish
//      this signal from Wave 3 per-conversation drift reads
//      without a new audit literal.
async function emitStaleContextAudit(args: {
  actor_entity_id: string;
  session_id: string;
  label: StaleContextLabel;
  capsules_evaluated: number;
  stale_capsule_count: number;
}): Promise<void> {
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    session_id: args.session_id,
    details: {
      action: "DRIFT_SIGNAL_READ",
      source_signal: "STALE_CONTEXT_WALLET",
      label: args.label,
      capsules_evaluated: args.capsules_evaluated,
      stale_capsule_count: args.stale_capsule_count,
    },
  });
}
