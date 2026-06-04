// FILE: python-ranking.service.ts
// PURPOSE: Phase 5 — Foundation-side TypeScript client wrapper for
//          the Python intelligence runtime per the [FOUNDER-AUTH —
//          COMPLETE FOUNDATION + OTZAR LIVE-TEST READINESS]
//          directive. Implements the "Employee Twin next-action
//          recommendation ranking" first safe slice as a fixture-
//          first, deterministic, no-LLM, no-secret-required ranking
//          surface that can be enabled in the future by pointing
//          PYTHON_INTELLIGENCE_RUNTIME_URL at a real Python service.
//
// DESIGN POSTURE (per directive):
//   - No external LLM calls.
//   - No external provider keys.
//   - No raw private memory passed in (caller passes safe
//     summaries / closed-vocab signals only).
//   - No chain-of-thought ever returned.
//   - Output is a closed-vocab ranked list. TypeScript validates
//     it and is the sole policy / approval / DMW / audit authority
//     — Python never executes actions.
//   - When `PYTHON_INTELLIGENCE_RUNTIME_URL` is unset OR
//     `PYTHON_FIXTURE_MODE=true` OR the Python call times out /
//     errors, the wrapper falls back to a deterministic in-process
//     ranker so today's live tests proceed without Python infra.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts (future
//     consumers — e.g., a /api/v1/otzar/my-twin/next-actions
//     route — can call rankEmployeeTwinNextActions to surface
//     ranked suggestions on MyTwinView)

// WHAT: Inputs the caller hands to the ranker. All fields are SAFE
//        counts / closed-vocab labels — no raw memory, no raw
//        transcripts, no chain-of-thought, no secrets. Mirrors the
//        EDX-1 MyTwinView sidecars + EDX-3 ConductSession envelope.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Centralizes the "safe payload" contract so the Python
//      runtime (when enabled) and the fixture fallback see the
//      same shape.
export interface NextActionRankingInput {
  pending_approvals_count: number;
  recent_action_count: number;
  active_authority_grants_count: number;
  expiring_soon_grants_count: number;
  sensitive_case_by_case_grants_count: number;
  active_preferences_count: number;
  active_sensitivity_boundaries_count: number;
  collaboration_inbox_pending_count: number;
  collaboration_needs_approval_count: number;
  collaboration_blocked_count: number;
  active_project_count: number;
  most_recent_action_at: string | null;
  most_recent_collaboration_at: string | null;
  // ConductSession envelope state (most recent chat turn). Optional
  // — when absent the ranker reasons from sidecar counts only.
  conduct_session_next_step?:
    | "ANSWERED"
    | "NEEDS_CLARIFICATION"
    | "NEEDS_APPROVAL"
    | "ACTION_PROPOSED"
    | "ACTION_CREATED"
    | "BLOCKED_BY_POLICY"
    | "BLOCKED_BY_SCOPE"
    | "COLLABORATION_REQUEST_SUGGESTED"
    | "MEMORY_CORRECTION_AVAILABLE";
  conduct_session_approval_required?: boolean;
  conduct_session_collaboration_suggested?: boolean;
}

// WHAT: Closed-vocab reason labels for a ranked suggestion. Names
//        the WHY in product-friendly terms.
export type NextActionReason =
  | "PENDING_APPROVALS_AWAITING_YOU"
  | "AUTHORITY_GRANT_EXPIRING_SOON"
  | "SENSITIVE_GRANT_REQUIRES_CASE_BY_CASE"
  | "COLLABORATION_INBOX_NEEDS_RESPONSE"
  | "COLLABORATION_NEEDS_YOUR_APPROVAL"
  | "COLLABORATION_BLOCKED_NEEDS_ATTENTION"
  | "CHAT_NEEDS_APPROVAL"
  | "CHAT_NEEDS_CLARIFICATION"
  | "CHAT_COLLABORATION_SUGGESTED"
  | "PROJECT_ACTIVITY_RESUMING"
  | "TEACH_YOUR_TWIN_PREFERENCES"
  | "REVIEW_RECENT_ACTIONS";

export type NextActionConfidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INSUFFICIENT_CONTEXT";

export type NextActionRisk =
  | "NONE"
  | "APPROVAL_REQUIRED"
  | "POLICY_REVIEW"
  | "MISSING_CONTEXT"
  | "CROSS_TEAM_DEPENDENCY"
  | "PROJECT_BLOCKER"
  | "DMW_SCOPE_NEEDED";

export interface NextActionSuggestion {
  rank: number;
  reason: NextActionReason;
  safe_title: string;
  confidence: NextActionConfidence;
  risk: NextActionRisk;
  score: number;
}

export interface NextActionRankingResult {
  suggestions: ReadonlyArray<NextActionSuggestion>;
  provider_mode: "FIXTURE" | "PYTHON";
  fallback_reason?:
    | "PROVIDER_DISABLED"
    | "PROVIDER_URL_NOT_SET"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_INVALID_RESPONSE"
    | "PROVIDER_ERROR";
}

// WHAT: Cap on the ranker timeout. Bounded short so the chat surface
//        never stalls on Python latency.
const DEFAULT_TIMEOUT_MS = 1500;

// WHAT: Cap on suggestions returned. The UI can render the top-N
//        without a separate "show more" flow.
const MAX_SUGGESTIONS = 6;

// WHAT: Compute fixture-mode ranking. Deterministic. Used when
//        Python runtime is disabled / unset / times out / errors.
// INPUT: NextActionRankingInput.
// OUTPUT: NextActionRankingResult with provider_mode = "FIXTURE".
// WHY: A pure function that surfaces obvious next actions from the
//      safe counts. No LLM, no Python, no secret. Each candidate
//      surfaces with a score derived from a simple heuristic — the
//      UI sorts by score and renders the top MAX_SUGGESTIONS.
export function rankNextActionsFixture(
  input: NextActionRankingInput,
): NextActionRankingResult {
  const candidates: NextActionSuggestion[] = [];

  if (input.pending_approvals_count > 0) {
    candidates.push({
      rank: 0,
      reason: "PENDING_APPROVALS_AWAITING_YOU",
      safe_title: `${input.pending_approvals_count} approval${
        input.pending_approvals_count === 1 ? "" : "s"
      } awaiting you`,
      confidence: "HIGH",
      risk: "APPROVAL_REQUIRED",
      score: 100 + input.pending_approvals_count * 10,
    });
  }
  if (input.collaboration_needs_approval_count > 0) {
    candidates.push({
      rank: 0,
      reason: "COLLABORATION_NEEDS_YOUR_APPROVAL",
      safe_title: `${input.collaboration_needs_approval_count} collaboration request${
        input.collaboration_needs_approval_count === 1 ? "" : "s"
      } need your approval`,
      confidence: "HIGH",
      risk: "APPROVAL_REQUIRED",
      score: 95 + input.collaboration_needs_approval_count * 5,
    });
  }
  if (input.collaboration_blocked_count > 0) {
    candidates.push({
      rank: 0,
      reason: "COLLABORATION_BLOCKED_NEEDS_ATTENTION",
      safe_title: `${input.collaboration_blocked_count} blocked collaboration${
        input.collaboration_blocked_count === 1 ? "" : "s"
      } — review the reason`,
      confidence: "MEDIUM",
      risk: "POLICY_REVIEW",
      score: 80 + input.collaboration_blocked_count * 5,
    });
  }
  if (input.expiring_soon_grants_count > 0) {
    candidates.push({
      rank: 0,
      reason: "AUTHORITY_GRANT_EXPIRING_SOON",
      safe_title: `${input.expiring_soon_grants_count} authority grant${
        input.expiring_soon_grants_count === 1 ? "" : "s"
      } expiring soon`,
      confidence: "HIGH",
      risk: "NONE",
      score: 75 + input.expiring_soon_grants_count * 3,
    });
  }
  if (input.sensitive_case_by_case_grants_count > 0) {
    candidates.push({
      rank: 0,
      reason: "SENSITIVE_GRANT_REQUIRES_CASE_BY_CASE",
      safe_title: "Sensitive case-by-case grants still need your decision",
      confidence: "MEDIUM",
      risk: "APPROVAL_REQUIRED",
      score: 70,
    });
  }
  if (input.collaboration_inbox_pending_count > 0) {
    candidates.push({
      rank: 0,
      reason: "COLLABORATION_INBOX_NEEDS_RESPONSE",
      safe_title: `${input.collaboration_inbox_pending_count} inbound request${
        input.collaboration_inbox_pending_count === 1 ? "" : "s"
      } pending your response`,
      confidence: "HIGH",
      risk: "NONE",
      score: 65 + input.collaboration_inbox_pending_count * 2,
    });
  }
  if (input.conduct_session_approval_required === true) {
    candidates.push({
      rank: 0,
      reason: "CHAT_NEEDS_APPROVAL",
      safe_title: "Your recent chat needs approval before it proceeds",
      confidence: "HIGH",
      risk: "APPROVAL_REQUIRED",
      score: 60,
    });
  }
  if (input.conduct_session_next_step === "NEEDS_CLARIFICATION") {
    candidates.push({
      rank: 0,
      reason: "CHAT_NEEDS_CLARIFICATION",
      safe_title: "Your recent chat needs clarification",
      confidence: "MEDIUM",
      risk: "MISSING_CONTEXT",
      score: 55,
    });
  }
  if (input.conduct_session_collaboration_suggested === true) {
    candidates.push({
      rank: 0,
      reason: "CHAT_COLLABORATION_SUGGESTED",
      safe_title: "Your recent chat suggests opening a collaboration request",
      confidence: "MEDIUM",
      risk: "CROSS_TEAM_DEPENDENCY",
      score: 50,
    });
  }
  if (input.active_project_count > 0 && input.recent_action_count === 0) {
    candidates.push({
      rank: 0,
      reason: "PROJECT_ACTIVITY_RESUMING",
      safe_title: "You have active projects without recent action — pick one up",
      confidence: "LOW",
      risk: "PROJECT_BLOCKER",
      score: 30,
    });
  }
  if (
    input.active_preferences_count === 0 &&
    input.active_sensitivity_boundaries_count === 0
  ) {
    candidates.push({
      rank: 0,
      reason: "TEACH_YOUR_TWIN_PREFERENCES",
      safe_title: "Teach your Twin your preferences and sensitivity boundaries",
      confidence: "LOW",
      risk: "NONE",
      score: 20,
    });
  }
  if (input.recent_action_count >= 5) {
    candidates.push({
      rank: 0,
      reason: "REVIEW_RECENT_ACTIONS",
      safe_title: `Review your ${input.recent_action_count} recent actions`,
      confidence: "LOW",
      risk: "NONE",
      score: 15,
    });
  }

  // If nothing fired, surface INSUFFICIENT_CONTEXT as a single calm
  // suggestion so the consumer can render a non-empty state without
  // implying a problem.
  if (candidates.length === 0) {
    return {
      suggestions: [
        {
          rank: 1,
          reason: "TEACH_YOUR_TWIN_PREFERENCES",
          safe_title: "Nothing pressing right now — teach your Twin or check in later",
          confidence: "INSUFFICIENT_CONTEXT",
          risk: "NONE",
          score: 0,
        },
      ],
      provider_mode: "FIXTURE",
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, MAX_SUGGESTIONS).map((s, i) => ({
    ...s,
    rank: i + 1,
  }));
  return { suggestions: top, provider_mode: "FIXTURE" };
}

// WHAT: Schema validator for a candidate payload returned by the
//        Python runtime. Defends against invalid / malicious /
//        chain-of-thought-laden responses.
// INPUT: Unknown JSON value.
// OUTPUT: NextActionRankingResult | null. Null when invalid.
// WHY: TypeScript is the sole policy authority — Python output is
//      treated as untrusted and validated before being surfaced.
export function validatePythonRankingResponse(
  raw: unknown,
): NextActionRankingResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as { suggestions?: unknown };
  if (!Array.isArray(obj.suggestions)) return null;
  const ALLOWED_REASONS: ReadonlySet<NextActionReason> = new Set([
    "PENDING_APPROVALS_AWAITING_YOU",
    "AUTHORITY_GRANT_EXPIRING_SOON",
    "SENSITIVE_GRANT_REQUIRES_CASE_BY_CASE",
    "COLLABORATION_INBOX_NEEDS_RESPONSE",
    "COLLABORATION_NEEDS_YOUR_APPROVAL",
    "COLLABORATION_BLOCKED_NEEDS_ATTENTION",
    "CHAT_NEEDS_APPROVAL",
    "CHAT_NEEDS_CLARIFICATION",
    "CHAT_COLLABORATION_SUGGESTED",
    "PROJECT_ACTIVITY_RESUMING",
    "TEACH_YOUR_TWIN_PREFERENCES",
    "REVIEW_RECENT_ACTIONS",
  ]);
  const ALLOWED_CONFIDENCE: ReadonlySet<NextActionConfidence> = new Set([
    "HIGH",
    "MEDIUM",
    "LOW",
    "INSUFFICIENT_CONTEXT",
  ]);
  const ALLOWED_RISK: ReadonlySet<NextActionRisk> = new Set([
    "NONE",
    "APPROVAL_REQUIRED",
    "POLICY_REVIEW",
    "MISSING_CONTEXT",
    "CROSS_TEAM_DEPENDENCY",
    "PROJECT_BLOCKER",
    "DMW_SCOPE_NEEDED",
  ]);
  const suggestions: NextActionSuggestion[] = [];
  for (const item of obj.suggestions as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as {
      rank?: unknown;
      reason?: unknown;
      safe_title?: unknown;
      confidence?: unknown;
      risk?: unknown;
      score?: unknown;
    };
    if (typeof s.rank !== "number") return null;
    if (
      typeof s.reason !== "string" ||
      !ALLOWED_REASONS.has(s.reason as NextActionReason)
    )
      return null;
    if (typeof s.safe_title !== "string" || s.safe_title.length === 0) return null;
    if (
      typeof s.confidence !== "string" ||
      !ALLOWED_CONFIDENCE.has(s.confidence as NextActionConfidence)
    )
      return null;
    if (
      typeof s.risk !== "string" ||
      !ALLOWED_RISK.has(s.risk as NextActionRisk)
    )
      return null;
    if (typeof s.score !== "number") return null;
    // Bound safe_title length to prevent chain-of-thought sneak-in.
    if (s.safe_title.length > 200) return null;
    suggestions.push({
      rank: s.rank,
      reason: s.reason as NextActionReason,
      safe_title: s.safe_title,
      confidence: s.confidence as NextActionConfidence,
      risk: s.risk as NextActionRisk,
      score: s.score,
    });
  }
  if (suggestions.length === 0) return null;
  return { suggestions, provider_mode: "PYTHON" };
}

// WHAT: Top-level entry point. Calls Python when configured + enabled
//        + responsive; otherwise falls back to the fixture ranker.
// INPUT: NextActionRankingInput + optional runtime overrides (used by
//        tests to inject mocks deterministically).
// OUTPUT: NextActionRankingResult (always populated).
// WHY: The fallback discipline keeps today's live tests usable while
//      the Python runtime ships behind it.
export interface RankerRuntimeConfig {
  pythonUrl?: string | null;
  fixtureMode?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function rankEmployeeTwinNextActions(
  input: NextActionRankingInput,
  runtime: RankerRuntimeConfig = {},
): Promise<NextActionRankingResult> {
  const fixtureMode =
    runtime.fixtureMode ?? process.env.PYTHON_FIXTURE_MODE === "true";
  const pythonUrl =
    runtime.pythonUrl ?? process.env.PYTHON_INTELLIGENCE_RUNTIME_URL ?? null;

  if (fixtureMode) {
    return {
      ...rankNextActionsFixture(input),
      fallback_reason: "PROVIDER_DISABLED",
    };
  }
  if (pythonUrl === null || pythonUrl.length === 0) {
    return {
      ...rankNextActionsFixture(input),
      fallback_reason: "PROVIDER_URL_NOT_SET",
    };
  }

  const timeoutMs = runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchFn = runtime.fetchImpl ?? fetch;

  try {
    const response = await fetchFn(`${pythonUrl}/rank-next-actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ...rankNextActionsFixture(input),
        fallback_reason: "PROVIDER_ERROR",
      };
    }
    const raw = (await response.json()) as unknown;
    const validated = validatePythonRankingResponse(raw);
    if (validated === null) {
      return {
        ...rankNextActionsFixture(input),
        fallback_reason: "PROVIDER_INVALID_RESPONSE",
      };
    }
    return validated;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ...rankNextActionsFixture(input),
      fallback_reason: aborted ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}
