// FILE: truncation.ts
// PURPOSE: P3 token-budget truncation algorithm. Pure function over
//          a layered prompt bundle. The non-negotiable correctness
//          invariant: NEVER trim layers L1, L2, L3, L4, L6 -- they
//          are identity / governance / role anchors. If even after
//          emptying L8 + L5 + L7 the budget is still exceeded, throw
//          TokenBudgetExceededError. Wrong outputs from a partial
//          identity stack are worse than a clear error.
// CONNECTS TO: otzar.service.ts (only consumer).

// WHAT: Bundle of all 8 layers + the priming string, in the exact
//        assembly order conductSession produces.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: L5 and L8 are mutable lists (we shift items off the front to
//      respect "drop oldest first" for L8 and "drop lowest relevance
//      first" for L5). L1, L2, L3, L4, L6, L7 + priming are strings;
//      L7 is the only string-layer the truncator may zero out.
//      Identity-floor layers (L1-L4, L6) MUST be byte-identical
//      pre/post truncation -- enforced by test #1.
export interface LayerBundle {
  priming: string;
  L1: string; // CORRECTION capsules joined
  L2: string; // role template content
  L3: string; // WORK_PATTERN/COMM_PREF/DECISION_STYLE joined
  L4: string; // FOUNDATIONAL via COE
  L5_items: { content: string; relevance_score: number }[];
  L6: string; // TaskQueue stub (empty for 11B)
  L7: string; // morning brief
  L8_items: string[]; // conversation_history items, oldest first
}

// WHAT: The shape carried inside TokenBudgetExceededError.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Future tooling will key off this shape; getting it right now
//      saves a Section 13 cleanup. identity_floor lets the caller
//      report "you needed N tokens for identity layers but only gave
//      M". trimmed counts how many items were shifted off L8 / L5
//      and whether L7 was zeroed.
export interface TokenBudgetExceededDetail {
  identity_floor: number;
  budget: number;
  trimmed: { L8: number; L5: number; L7: number };
}

// WHAT: Error thrown when no amount of trimming can fit the bundle
//        into budget without violating identity layers.
// INPUT: A TokenBudgetExceededDetail.
// OUTPUT: None.
// WHY: Discriminated by name "TokenBudgetExceededError" so callers
//      can branch on it cleanly; route handler maps to HTTP 413
//      with the detail in the response body.
export class TokenBudgetExceededError extends Error {
  readonly detail: TokenBudgetExceededDetail;
  constructor(detail: TokenBudgetExceededDetail) {
    super("TOKEN_BUDGET_EXCEEDED");
    this.name = "TokenBudgetExceededError";
    this.detail = detail;
  }
}

// WHAT: Successful return shape.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Caller wants the post-truncation bundle (to assemble the
//      final prompt) AND counters for observability + tests.
export interface TruncateResult {
  final: LayerBundle;
  total_tokens: number;
  trimmed: { L8: number; L5: number; L7: number };
}

// WHAT: Compute total token count for a bundle.
// INPUT: A bundle and the tokenizer.
// OUTPUT: An integer.
// WHY: Reused inside the truncation loop. Joins the layers in the
//      exact order they will be sent to the LLM so the count
//      matches what the LLM actually sees.
function computeTotal(
  bundle: LayerBundle,
  countTokens: (text: string) => number,
): number {
  const joined =
    bundle.priming +
    "\n" +
    bundle.L1 +
    "\n" +
    bundle.L2 +
    "\n" +
    bundle.L3 +
    "\n" +
    bundle.L4 +
    "\n" +
    bundle.L5_items.map((i) => i.content).join("\n") +
    "\n" +
    bundle.L6 +
    "\n" +
    bundle.L7 +
    "\n" +
    bundle.L8_items.join("\n");
  return countTokens(joined);
}

// WHAT: Compute identity-floor tokens (the layers we will NEVER trim).
// INPUT: A bundle and the tokenizer.
// OUTPUT: An integer.
// WHY: Reported in TokenBudgetExceededError.detail so the operator
//      can size their budget. priming + L1 + L2 + L3 + L4 + L6.
//      L7 is excluded because it CAN be trimmed (zeroed) by the
//      algorithm; if even priming + L1-L4 + L6 don't fit, that's
//      the floor we surface.
function computeIdentityFloor(
  bundle: LayerBundle,
  countTokens: (text: string) => number,
): number {
  const joined =
    bundle.priming +
    "\n" +
    bundle.L1 +
    "\n" +
    bundle.L2 +
    "\n" +
    bundle.L3 +
    "\n" +
    bundle.L4 +
    "\n" +
    bundle.L6;
  return countTokens(joined);
}

// WHAT: P3 truncation algorithm.
// INPUT: { bundle, budget, countTokens }.
// OUTPUT: A TruncateResult or throws TokenBudgetExceededError.
// WHY: Pure function over an immutable input bundle (we copy
//      L5_items and L8_items so the caller's arrays aren't mutated).
//      Trim order: L8 first (oldest message off the front), L5
//      second (lowest relevance first), L7 third (zeroed entirely).
//      L1, L2, L3, L4, L6 are NEVER touched -- if even all three
//      trimmable layers cleared still over budget, throw with
//      detail.
export function truncateToTokenBudget(args: {
  bundle: LayerBundle;
  budget: number;
  countTokens: (text: string) => number;
}): TruncateResult {
  // Copy mutable lists so we don't mutate the caller's input.
  const final: LayerBundle = {
    ...args.bundle,
    L5_items: [...args.bundle.L5_items],
    L8_items: [...args.bundle.L8_items],
  };
  const trimmed = { L8: 0, L5: 0, L7: 0 };

  let total = computeTotal(final, args.countTokens);
  if (total <= args.budget) {
    return { final, total_tokens: total, trimmed };
  }

  // STAGE 1 -- trim L8 (oldest first). Keep at least one message
  // so the LLM has the most-recent turn for context.
  while (total > args.budget && final.L8_items.length > 1) {
    final.L8_items.shift();
    trimmed.L8++;
    total = computeTotal(final, args.countTokens);
  }
  if (total <= args.budget) {
    return { final, total_tokens: total, trimmed };
  }

  // STAGE 2 -- trim L5 (lowest relevance first). Sort ascending
  // then shift off the front.
  final.L5_items.sort((a, b) => a.relevance_score - b.relevance_score);
  while (total > args.budget && final.L5_items.length > 0) {
    final.L5_items.shift();
    trimmed.L5++;
    total = computeTotal(final, args.countTokens);
  }
  if (total <= args.budget) {
    return { final, total_tokens: total, trimmed };
  }

  // STAGE 3 -- zero out L7 (morning brief is nice-to-have).
  if (total > args.budget && final.L7.length > 0) {
    final.L7 = "";
    trimmed.L7 = 1;
    total = computeTotal(final, args.countTokens);
  }
  if (total <= args.budget) {
    return { final, total_tokens: total, trimmed };
  }

  // FINAL GUARD -- identity layers cannot fit. Throw with detail
  // so the route handler can return a structured 413.
  throw new TokenBudgetExceededError({
    identity_floor: computeIdentityFloor(final, args.countTokens),
    budget: args.budget,
    trimmed,
  });
}
