// FILE: proactivity.service.ts
// PURPOSE: Section 1 Wave 3 ADR-0068 — Otzar scoped Twin
//          proactivity. Pure derivation of bounded closed-vocab
//          proactive cards for one owner from existing self-
//          scoped substrate (Wave 5 PROPOSED / ACCEPTED readers
//          + Wave 4A wallet-stale signal + Wave 4C cross-
//          conversation rollup + ACCEPTED reviewed_at periodic
//          check-in). No persistence; no audit emission; no
//          mutation; no LLM-generated text; no external delivery;
//          no NotificationService integration; no Action
//          creation; no connector invocation; no schema
//          migration; no new audit literal.
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts (consumed by
//     getMyTwin Wave 3 sidecar; mirrors Wave 6A
//     accepted_patterns sidecar wiring per ADR-0067 §4 + §5)
//   - apps/api/src/services/otzar/proposed-pattern.service.ts
//     (Wave 5 + Wave 6A readers: listAcceptedPatternsForOwner +
//     findOldestPendingProposedForOwner)
//   - apps/api/src/services/otzar/stale-context-signal.service.ts
//     (Wave 4A computeStaleContextLabelForEntity pure helper)
//   - apps/api/src/services/otzar/drift-rollup.service.ts
//     (Wave 4C computeDriftRollupLabelForEntity pure helper)
//   - ADR-0068 §1-§14 design lock
//
// FOUNDER LOCKS (per ADR-0068 §1-§14):
//   - The Twin is staying with the user, not watching the user.
//   - Cards may be ignored/dismissed/opted-out with no
//     consequence.
//   - Twin proactivity is suggestion only — execution stays in
//     Section 2 Action runtime.
//   - Closed-vocab card_type + action_hint + priority_label +
//     source_signal_type sets locked at this commit; growth is
//     additive behind separate Founder authorization.
//   - title / body / honest_note copy is closed-vocab template
//     locked at the service tier (NEVER LLM-generated; NEVER
//     raw correction text; NEVER references manager / scoring /
//     surveillance / compliance / discipline / risk-profile /
//     employee-weakness language).
//   - Same-day deterministic card_key for client-side dismiss.

import { createHash } from "node:crypto";
import type {
  AcceptedPatternAdvisoryView,
  OtzarProposedPatternConfidence,
  OtzarProposedPatternLabel,
  OtzarProposedPatternService,
  OtzarProposedPatternSourceSignalType,
} from "./proposed-pattern.service.js";
import { computeStaleContextLabelForEntity } from "./stale-context-signal.service.js";
import { computeDriftRollupLabelForEntity } from "./drift-rollup.service.js";

// WHAT: Closed-vocab proactive card_type set per ADR-0068 §4.
// INPUT: Used as a string-literal union + type guard source.
// OUTPUT: None — type only.
// WHY: 5 v1 card_types. Additive growth behind separate
//      Founder authorization at each future slice.
export const PROACTIVE_CARD_TYPE_VALUES = [
  "ACCEPTED_PATTERN_REMINDER",
  "PROPOSED_PATTERN_REVIEW_AVAILABLE",
  "STALE_CONTEXT_REFRESH_SUGGESTED",
  "DRIFT_REVIEW_SUGGESTED",
  "ALIGNMENT_CHECK_IN",
] as const;
export type ProactiveCardType = (typeof PROACTIVE_CARD_TYPE_VALUES)[number];

// WHAT: Closed-vocab action_hint per ADR-0068 §3.
export const PROACTIVE_CARD_ACTION_HINT_VALUES = [
  "REVIEW_PATTERN",
  "REFRESH_CONTEXT",
  "CONTINUE_CONVERSATION",
  "DISMISS",
  "NO_ACTION",
] as const;
export type ProactiveCardActionHint =
  (typeof PROACTIVE_CARD_ACTION_HINT_VALUES)[number];

// WHAT: Closed-vocab priority label.
export const PROACTIVE_CARD_PRIORITY_LABEL_VALUES = ["LOW", "NORMAL", "HIGH"] as const;
export type ProactiveCardPriorityLabel =
  (typeof PROACTIVE_CARD_PRIORITY_LABEL_VALUES)[number];

// WHAT: Closed-vocab source signal types.
export const PROACTIVE_CARD_SOURCE_SIGNAL_TYPE_VALUES = [
  "ACCEPTED_PATTERN",
  "PROPOSED_PATTERN",
  "WALLET_STALE_CONTEXT",
  "CROSS_CONVERSATION_ROLLUP",
  "ALIGNMENT_PERIODIC",
] as const;
export type ProactiveCardSourceSignalType =
  (typeof PROACTIVE_CARD_SOURCE_SIGNAL_TYPE_VALUES)[number];

// WHAT: Bounded cap on cards surfaced per response per ADR-0068
//        §4. v1 starts at 4; growth requires separate Founder
//        authorization.
export const PROACTIVE_CARDS_MY_TWIN_MAX = 4;

// WHAT: Periodic alignment-check-in threshold in days per
//        ADR-0068 §4. Pure derivation from ACCEPTED reviewed_at;
//        no per-owner schedule; no scheduler.
export const ALIGNMENT_CHECK_IN_DAYS = 14;

// WHAT: SAFE projection of one proactive card per ADR-0068 §3.
// INPUT: Used as a value type only.
// OUTPUT: None.
// WHY: Closed-vocab fields only. Forbidden by type construction:
//      raw text / source row IDs (except deterministic card_key) /
//      conversation IDs / capsule IDs / target_capsule_id /
//      payload_summary / topic tag values / content_hash /
//      embedding_content_hash / vectors / embeddings / storage
//      locations / permission internals / bridge IDs / secret
//      refs / cross-owner data / cross-org data / manager fields /
//      drift score / employee score / compliance score / chain-
//      of-thought / prompts.
export interface ProactiveCardView {
  card_key: string;
  card_type: ProactiveCardType;
  title: string;
  body: string;
  source_signal_type: ProactiveCardSourceSignalType;
  pattern_label?: OtzarProposedPatternLabel;
  generated_at: string;
  priority_label: ProactiveCardPriorityLabel;
  action_hint: ProactiveCardActionHint;
  honest_note: string;
}

// WHAT: Closed-vocab title / body / honest_note templates per
//        ADR-0068 §5. Locked at the service tier; never
//        LLM-generated; never raw correction text; never
//        references manager / scoring / surveillance / compliance
//        / discipline / risk-profile / employee-weakness
//        language. All 5 v1 card_types exhaustively covered.
//        Future card_types extend this map alongside the
//        card_type set itself.
export const PROACTIVE_CARD_TEMPLATES: Readonly<
  Record<
    ProactiveCardType,
    { title: string; body: string; honest_note: string }
  >
> = {
  ACCEPTED_PATTERN_REMINDER: {
    title: "Your Twin remembers the alignment patterns you accepted.",
    body: "Your Twin is keeping recently accepted alignment guidance in mind when it helps you. You remain sovereign — you can archive any pattern at any time.",
    honest_note:
      "This is not an evaluation. It is not visible to managers. It is not shared across the org.",
  },
  PROPOSED_PATTERN_REVIEW_AVAILABLE: {
    title: "Your Twin has alignment patterns waiting for your review.",
    body: "Your Twin has noticed a recurring signal in your own work and proposed an alignment pattern. Review it when convenient — accepting or rejecting it is entirely your call.",
    honest_note:
      "Proposed patterns are derived only from your own corrections and drift signals. They are never visible to managers and never auto-applied.",
  },
  STALE_CONTEXT_REFRESH_SUGGESTED: {
    title: "Some of your saved memory may be out of sync.",
    body: "Some of your memory has fallen out of sync with its source content. A refresh may help your Twin work from current information.",
    honest_note:
      "This is not a memory rewrite. Nothing is deleted, edited, or republished without your action.",
  },
  DRIFT_REVIEW_SUGGESTED: {
    title: "A recurring alignment pattern may be worth a review.",
    body: "Multiple recent conversations show overlapping drift signals. A short review may help your Twin stay aligned with how you actually want to work.",
    honest_note:
      "This is coaching for your own benefit. It is not an employee score, not visible to managers, and not shared across the org.",
  },
  ALIGNMENT_CHECK_IN: {
    title: "Your Twin is staying with your alignment guidance.",
    body: "You have accepted alignment patterns that your Twin continues to remember. No action is needed — this is just a quiet check-in.",
    honest_note: "Your Twin is not judging you. It is staying with you.",
  },
};

// WHAT: Deterministic ordering for proactive cards before the
//        cap is applied per ADR-0068 §4 ordering rule.
const CARD_TYPE_ORDER: Readonly<Record<ProactiveCardType, number>> = {
  PROPOSED_PATTERN_REVIEW_AVAILABLE: 0,
  STALE_CONTEXT_REFRESH_SUGGESTED: 1,
  DRIFT_REVIEW_SUGGESTED: 2,
  ACCEPTED_PATTERN_REMINDER: 3,
  ALIGNMENT_CHECK_IN: 4,
};

// WHAT: Inputs for assembleProactiveCards.
// INPUT: Used as a parameter type.
// OUTPUT: None — type only.
// WHY: Optional reader dependencies so the helper degrades
//      gracefully when individual readers are not wired in test
//      fixtures (mirrors Wave 6B sidecar swallow pattern).
//      ownerEntityId MUST be a verified session.entity_id —
//      the helper does NOT validate sessions and does NOT
//      cross owner boundaries.
//      `now` defaults to the current time when omitted; tests
//      inject deterministic values.
export interface AssembleProactiveCardsInput {
  ownerEntityId: string;
  proposedPatternService?: OtzarProposedPatternService;
  computeStaleContext?: typeof computeStaleContextLabelForEntity;
  computeDriftRollup?: typeof computeDriftRollupLabelForEntity;
  now?: Date;
}

// WHAT: Compute the deterministic ISO date (YYYY-MM-DD) used as
//        the day component of card_key per ADR-0068 §3.
// INPUT: A Date.
// OUTPUT: An ISO date string in UTC (10 chars).
// WHY: Same-day reads with same substrate state produce the
//      same card_key; client-side dismiss is stable per day.
function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// WHAT: Deterministic SHA-256-based card_key per ADR-0068 §3.
// INPUT: card_type + source_signal_type + safe discriminator +
//        the ISO day component.
// OUTPUT: 16-char hex prefix of the SHA-256 hash.
// WHY: Hash only SAFE deterministic components so the card_key
//      itself never leaks raw IDs or content. Stable across
//      same-day reads with same substrate state per ADR-0068 §3.
function computeCardKey(args: {
  card_type: ProactiveCardType;
  source_signal_type: ProactiveCardSourceSignalType;
  discriminator: string;
  isoDay: string;
}): string {
  const payload = [
    args.card_type,
    args.source_signal_type,
    args.discriminator,
    args.isoDay,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// WHAT: Days-between helper for the ALIGNMENT_CHECK_IN threshold.
// INPUT: two Dates.
// OUTPUT: integer days (a - b, floor).
// WHY: Avoids importing a date library. Day boundaries computed
//      in UTC for determinism.
function daysBetween(later: Date, earlier: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

// WHAT: Per-source read failures are caught silently so a
//        transient read miss on one signal never breaks the
//        remaining cards. Mirrors the Wave 6B sidecar swallow
//        pattern per ADR-0068 §6.
async function safeRead<T>(
  read: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

// WHAT: Pure-function helper that assembles up to
//        PROACTIVE_CARDS_MY_TWIN_MAX = 4 closed-vocab proactive
//        cards for the given owner from existing self-scoped
//        substrate per ADR-0068 §6.
// INPUT: AssembleProactiveCardsInput.
// OUTPUT: A readonly array of ProactiveCardView; empty when no
//         signals fire.
// WHY: ADR-0068 §6 implementation contract. RULE 0 owner-scope
//      enforced by the caller (the ownerEntityId passed here
//      MUST be a verified session.entity_id). No I/O beyond the
//      injected readers; no audit emission; no persistence; no
//      cross-owner read; no manager surface.
export async function assembleProactiveCards(
  input: AssembleProactiveCardsInput,
): Promise<readonly ProactiveCardView[]> {
  const now = input.now ?? new Date();
  const day = isoDay(now);
  const generatedAt = now.toISOString();
  const cards: ProactiveCardView[] = [];

  // ── ACCEPTED + PROPOSED reads via Wave 5 / 6A pure readers ──
  // Both are independent — a failure on one MUST NOT poison the
  // other. The pendingProposed read serves both
  // PROPOSED_PATTERN_REVIEW_AVAILABLE (when present) and
  // ALIGNMENT_CHECK_IN (suppressed when present).
  const acceptedPatterns: readonly AcceptedPatternAdvisoryView[] | undefined =
    input.proposedPatternService === undefined
      ? undefined
      : await safeRead(() =>
          input.proposedPatternService!.listAcceptedPatternsForOwner(
            input.ownerEntityId,
          ),
        );
  const pendingProposed =
    input.proposedPatternService === undefined
      ? undefined
      : await safeRead(() =>
          input.proposedPatternService!.findOldestPendingProposedForOwner(
            input.ownerEntityId,
          ),
        );

  // PROPOSED_PATTERN_REVIEW_AVAILABLE — when at least one
  // non-archived PROPOSED row exists.
  if (pendingProposed) {
    const template = PROACTIVE_CARD_TEMPLATES.PROPOSED_PATTERN_REVIEW_AVAILABLE;
    cards.push({
      card_key: computeCardKey({
        card_type: "PROPOSED_PATTERN_REVIEW_AVAILABLE",
        source_signal_type: "PROPOSED_PATTERN",
        discriminator: `${pendingProposed.source_signal_type}|${pendingProposed.pattern_label}`,
        isoDay: day,
      }),
      card_type: "PROPOSED_PATTERN_REVIEW_AVAILABLE",
      title: template.title,
      body: template.body,
      source_signal_type: "PROPOSED_PATTERN",
      pattern_label: pendingProposed.pattern_label,
      generated_at: generatedAt,
      priority_label: "NORMAL",
      action_hint: "REVIEW_PATTERN",
      honest_note: template.honest_note,
    });
  }

  // ── STALE_CONTEXT via Wave 4A pure helper ──
  if (input.computeStaleContext !== undefined) {
    const result = await safeRead(() =>
      input.computeStaleContext!({ entity_id: input.ownerEntityId }),
    );
    if (result !== undefined && result.label === "STALE_CONTEXT_RISK") {
      const template = PROACTIVE_CARD_TEMPLATES.STALE_CONTEXT_REFRESH_SUGGESTED;
      cards.push({
        card_key: computeCardKey({
          card_type: "STALE_CONTEXT_REFRESH_SUGGESTED",
          source_signal_type: "WALLET_STALE_CONTEXT",
          discriminator: "STALE_CONTEXT_RISK",
          isoDay: day,
        }),
        card_type: "STALE_CONTEXT_REFRESH_SUGGESTED",
        title: template.title,
        body: template.body,
        source_signal_type: "WALLET_STALE_CONTEXT",
        generated_at: generatedAt,
        priority_label: "LOW",
        action_hint: "REFRESH_CONTEXT",
        honest_note: template.honest_note,
      });
    }
  }

  // ── DRIFT_REVIEW via Wave 4C pure helper ──
  if (input.computeDriftRollup !== undefined) {
    const result = await safeRead(() =>
      input.computeDriftRollup!({ entity_id: input.ownerEntityId }),
    );
    if (result !== undefined && result.label === "AT_RISK") {
      const template = PROACTIVE_CARD_TEMPLATES.DRIFT_REVIEW_SUGGESTED;
      cards.push({
        card_key: computeCardKey({
          card_type: "DRIFT_REVIEW_SUGGESTED",
          source_signal_type: "CROSS_CONVERSATION_ROLLUP",
          discriminator: "AT_RISK",
          isoDay: day,
        }),
        card_type: "DRIFT_REVIEW_SUGGESTED",
        title: template.title,
        body: template.body,
        source_signal_type: "CROSS_CONVERSATION_ROLLUP",
        generated_at: generatedAt,
        priority_label: "NORMAL",
        action_hint: "REVIEW_PATTERN",
        honest_note: template.honest_note,
      });
    }
  }

  // ── ACCEPTED_PATTERN_REMINDER — surfaces at most ONE card
  // across all accepted patterns per ADR-0068 §4 (the most
  // recently accepted; not one per pattern).
  if (acceptedPatterns !== undefined && acceptedPatterns.length > 0) {
    const newest = acceptedPatterns[0]!;
    const template = PROACTIVE_CARD_TEMPLATES.ACCEPTED_PATTERN_REMINDER;
    cards.push({
      card_key: computeCardKey({
        card_type: "ACCEPTED_PATTERN_REMINDER",
        source_signal_type: "ACCEPTED_PATTERN",
        discriminator: `${newest.source_signal_type}|${newest.pattern_label}`,
        isoDay: day,
      }),
      card_type: "ACCEPTED_PATTERN_REMINDER",
      title: template.title,
      body: template.body,
      source_signal_type: "ACCEPTED_PATTERN",
      pattern_label: newest.pattern_label,
      generated_at: generatedAt,
      priority_label: "LOW",
      action_hint: "CONTINUE_CONVERSATION",
      honest_note: template.honest_note,
    });
  }

  // ── ALIGNMENT_CHECK_IN — symbiotic periodic check-in.
  // Fires ONLY when (a) owner has ≥1 ACCEPTED pattern, (b) most
  // recent reviewed_at is older than ALIGNMENT_CHECK_IN_DAYS,
  // and (c) NO PROPOSED rows currently waiting (PROPOSED rows
  // already get their own card and dominate the symbiotic
  // surface). Per ADR-0068 §4.
  if (
    pendingProposed === null &&
    acceptedPatterns !== undefined &&
    acceptedPatterns.length > 0
  ) {
    const newest = acceptedPatterns[0]!;
    const newestReviewedAt = new Date(newest.accepted_at);
    if (
      !Number.isNaN(newestReviewedAt.getTime()) &&
      daysBetween(now, newestReviewedAt) >= ALIGNMENT_CHECK_IN_DAYS
    ) {
      const template = PROACTIVE_CARD_TEMPLATES.ALIGNMENT_CHECK_IN;
      cards.push({
        card_key: computeCardKey({
          card_type: "ALIGNMENT_CHECK_IN",
          source_signal_type: "ALIGNMENT_PERIODIC",
          discriminator: "PERIODIC",
          isoDay: day,
        }),
        card_type: "ALIGNMENT_CHECK_IN",
        title: template.title,
        body: template.body,
        source_signal_type: "ALIGNMENT_PERIODIC",
        generated_at: generatedAt,
        priority_label: "LOW",
        action_hint: "NO_ACTION",
        honest_note: template.honest_note,
      });
    }
  }

  // ── Deterministic ordering + cap per ADR-0068 §4.
  cards.sort(
    (a, b) => CARD_TYPE_ORDER[a.card_type] - CARD_TYPE_ORDER[b.card_type],
  );
  return cards.slice(0, PROACTIVE_CARDS_MY_TWIN_MAX);
}

// Re-export the pure types referenced in ProactiveCardView's
// optional pattern_label field so consumers don't have to
// double-import.
export type {
  OtzarProposedPatternLabel,
  OtzarProposedPatternSourceSignalType,
  OtzarProposedPatternConfidence,
};
