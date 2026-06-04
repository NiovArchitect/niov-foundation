"""Deterministic next-action ranker.

Mirrors the TS fixture ranker at
``apps/api/src/services/intelligence/python-ranking.service.ts``
(``rankNextActionsFixture``) so the Foundation TS validator
(``validatePythonRankingResponse``) accepts the response shape and
emits the same closed-vocab reasons.

The Python implementation is intentionally a faithful port of the
TS heuristic, not a smarter ML model — production-grade ML belongs
behind feature flags + a dedicated forecaster, not the
chat-blocking next-action ranker.

Future evolution (behind feature flags only):

- Weight tuning per-tenant (no per-employee learning).
- Schedule-aware boosts (calendar context).
- TurboQuant-style scoring once Founder authorizes ADR-0048
  forward-substrate research.

None of those are present in this build.
"""

from __future__ import annotations

from .schemas import (
    NextActionRankingInput,
    NextActionRankingResult,
    NextActionSuggestion,
)

MAX_SUGGESTIONS = 6


def rank_next_actions(payload: NextActionRankingInput) -> NextActionRankingResult:
    candidates: list[NextActionSuggestion] = []

    if payload.pending_approvals_count > 0:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="PENDING_APPROVALS_AWAITING_YOU",
                safe_title=(
                    f"{payload.pending_approvals_count} approval"
                    f"{'' if payload.pending_approvals_count == 1 else 's'}"
                    " awaiting you"
                ),
                confidence="HIGH",
                risk="APPROVAL_REQUIRED",
                score=100 + payload.pending_approvals_count * 10,
            )
        )

    if payload.collaboration_needs_approval_count > 0:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="COLLABORATION_NEEDS_YOUR_APPROVAL",
                safe_title=(
                    f"{payload.collaboration_needs_approval_count} collaboration"
                    f" request"
                    f"{'' if payload.collaboration_needs_approval_count == 1 else 's'}"
                    " need your approval"
                ),
                confidence="HIGH",
                risk="APPROVAL_REQUIRED",
                score=95 + payload.collaboration_needs_approval_count * 5,
            )
        )

    if payload.collaboration_blocked_count > 0:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="COLLABORATION_BLOCKED_NEEDS_ATTENTION",
                safe_title=(
                    f"{payload.collaboration_blocked_count} blocked collaboration"
                    f"{'' if payload.collaboration_blocked_count == 1 else 's'}"
                    " — review the reason"
                ),
                confidence="MEDIUM",
                risk="POLICY_REVIEW",
                score=80 + payload.collaboration_blocked_count * 5,
            )
        )

    if payload.expiring_soon_grants_count > 0:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="AUTHORITY_GRANT_EXPIRING_SOON",
                safe_title=(
                    f"{payload.expiring_soon_grants_count} authority grant"
                    f"{'' if payload.expiring_soon_grants_count == 1 else 's'}"
                    " expiring soon"
                ),
                confidence="HIGH",
                risk="NONE",
                score=75 + payload.expiring_soon_grants_count * 3,
            )
        )

    if payload.sensitive_case_by_case_grants_count > 0:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="SENSITIVE_GRANT_REQUIRES_CASE_BY_CASE",
                safe_title="Sensitive case-by-case grants still need your decision",
                confidence="MEDIUM",
                risk="APPROVAL_REQUIRED",
                score=70,
            )
        )

    if payload.collaboration_inbox_pending_count > 0:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="COLLABORATION_INBOX_NEEDS_RESPONSE",
                safe_title=(
                    f"{payload.collaboration_inbox_pending_count} inbound request"
                    f"{'' if payload.collaboration_inbox_pending_count == 1 else 's'}"
                    " pending your response"
                ),
                confidence="HIGH",
                risk="NONE",
                score=65 + payload.collaboration_inbox_pending_count * 2,
            )
        )

    if payload.conduct_session_approval_required is True:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="CHAT_NEEDS_APPROVAL",
                safe_title="Your recent chat needs approval before it proceeds",
                confidence="HIGH",
                risk="APPROVAL_REQUIRED",
                score=60,
            )
        )

    if payload.conduct_session_next_step == "NEEDS_CLARIFICATION":
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="CHAT_NEEDS_CLARIFICATION",
                safe_title="Your recent chat needs clarification",
                confidence="MEDIUM",
                risk="MISSING_CONTEXT",
                score=55,
            )
        )

    if payload.conduct_session_collaboration_suggested is True:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="CHAT_COLLABORATION_SUGGESTED",
                safe_title="Your recent chat suggests opening a collaboration request",
                confidence="MEDIUM",
                risk="CROSS_TEAM_DEPENDENCY",
                score=50,
            )
        )

    if payload.active_project_count > 0 and payload.recent_action_count == 0:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="PROJECT_ACTIVITY_RESUMING",
                safe_title=(
                    "You have active projects without recent action — pick one up"
                ),
                confidence="LOW",
                risk="PROJECT_BLOCKER",
                score=30,
            )
        )

    if (
        payload.active_preferences_count == 0
        and payload.active_sensitivity_boundaries_count == 0
    ):
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="TEACH_YOUR_TWIN_PREFERENCES",
                safe_title="Teach your Twin your preferences and sensitivity boundaries",
                confidence="LOW",
                risk="NONE",
                score=20,
            )
        )

    if payload.recent_action_count >= 5:
        candidates.append(
            NextActionSuggestion(
                rank=1,
                reason="REVIEW_RECENT_ACTIONS",
                safe_title=(
                    f"Review your {payload.recent_action_count} recent actions"
                ),
                confidence="LOW",
                risk="NONE",
                score=15,
            )
        )

    if not candidates:
        return NextActionRankingResult(
            suggestions=[
                NextActionSuggestion(
                    rank=1,
                    reason="TEACH_YOUR_TWIN_PREFERENCES",
                    safe_title=(
                        "Nothing pressing right now — teach your Twin"
                        " or check in later"
                    ),
                    confidence="INSUFFICIENT_CONTEXT",
                    risk="NONE",
                    score=0,
                )
            ],
        )

    candidates.sort(key=lambda s: s.score, reverse=True)
    top = candidates[:MAX_SUGGESTIONS]
    re_ranked = [
        NextActionSuggestion(
            rank=i + 1,
            reason=s.reason,
            safe_title=s.safe_title,
            confidence=s.confidence,
            risk=s.risk,
            score=s.score,
        )
        for i, s in enumerate(top)
    ]
    return NextActionRankingResult(suggestions=re_ranked)
