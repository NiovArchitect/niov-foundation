"""Deterministic operational analytics / execution health (Phase 1285-Z).

Advisory only. Foundation assembles a SCOPED execution-health snapshot
(deterministic metrics + top items) and sends ONLY safe summaries here. This
module aggregates, scores, and summarizes; it NEVER creates work, notifies
anyone, sends a message, introduces a new item or person, or references an id
outside the snapshot. Every name in overloaded_people comes from the supplied
top_items.related_people; every risk/focus line comes from a supplied item title.

No LLM. No chain-of-thought. The health score is a transparent additive
penalty over the supplied metrics so it is fully explainable. Foundation
re-validates + re-scopes the result and keeps the deterministic metrics primary.
"""

from __future__ import annotations

from collections import Counter

from .schemas import (
    OperationalAnalyticsInput,
    OperationalAnalyticsResult,
    OpsMetrics,
)


def _status(score: int) -> str:
    if score >= 80:
        return "HEALTHY"
    if score >= 60:
        return "WATCH"
    if score >= 35:
        return "AT_RISK"
    return "CRITICAL"


def _health_score(m: OpsMetrics) -> int:
    score = 100
    score -= m.blocked_count * 8
    score -= m.overdue_count * 5
    score -= m.critical_risk_count * 10
    score -= m.high_risk_count * 4
    score -= m.no_next_action_count * 2
    score -= m.waiting_on_count * 2
    score -= m.recent_failed_count * 5
    return max(0, min(100, score))


def operational_analytics(payload: OperationalAnalyticsInput) -> OperationalAnalyticsResult:
    m = payload.metrics
    cap = payload.max_results or 10

    score = _health_score(m)
    status = _status(score)

    items = sorted(payload.top_items, key=lambda it: (it.risk_score or 0), reverse=True)

    top_risks = [
        f"{it.title} ({it.severity or 'risk'})"
        for it in items
        if it.severity in ("HIGH", "CRITICAL") or (it.risk_score or 0) >= 60
    ][:cap]

    recurring_blockers = [
        it.title for it in items if it.item_type == "UNRESOLVED_BLOCKER" or it.status == "BLOCKED"
    ][:cap]

    people = Counter(p for it in items for p in it.related_people)
    overloaded_people = [name for name, cnt in people.most_common() if cnt >= 2][:cap]

    suggested_focus = [it.title for it in items][:3]

    recommended: list[str] = []
    if m.blocked_count:
        recommended.append("Clear the blockers first.")
    if m.overdue_count:
        recommended.append("Bring overdue work current.")
    if m.no_next_action_count:
        recommended.append("Assign owners and next actions to unowned work.")
    if m.waiting_on_count:
        recommended.append("Follow up on what you are waiting on.")
    if not recommended:
        recommended.append("Maintain current pace; no critical pressure detected.")

    summary = (
        f"{m.total_work} active items: {m.blocked_count} blocked, {m.overdue_count} overdue, "
        f"{m.waiting_on_count} waiting on someone, {m.no_next_action_count} with no next action. "
        f"Execution status {status}."
    )

    confidence = "HIGH" if m.total_work >= 5 else "MEDIUM" if m.total_work > 0 else "LOW"
    human = status in ("AT_RISK", "CRITICAL") or m.critical_risk_count > 0

    return OperationalAnalyticsResult(
        health_score=score,
        execution_status=status,  # type: ignore[arg-type]
        summary=summary[:600],
        top_risks=top_risks,
        recurring_blockers=recurring_blockers,
        overloaded_people=overloaded_people,
        suggested_focus=suggested_focus,
        recommended_next_actions=recommended[:cap],
        confidence=confidence,  # type: ignore[arg-type]
        human_review_needed=human,
    )
