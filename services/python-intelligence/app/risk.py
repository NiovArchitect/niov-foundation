"""Deterministic risk scoring over a Foundation-scoped candidate set (Phase 1285-X).

Advisory only. Foundation assembles a deterministic, scoped candidate set
(watcher findings over durable work) and sends ONLY safe summaries + boolean
signal flags here. This module scores, explains, and recommends; it NEVER creates
work, notifies anyone, decides scope/ownership/permission, returns a candidate_id
that was not in the input, or fabricates a signal Foundation did not send.

No LLM. No chain-of-thought. No embeddings: a transparent additive heuristic
(base severity + signal boosts, clamped) so every score is explainable from the
contributing_signals alone. Foundation re-validates every score and treats it as
advisory; the deterministic watcher finding stays primary.
"""

from __future__ import annotations

from .schemas import (
    RiskScore,
    RiskScoreCandidate,
    RiskScoringInput,
    RiskScoringResult,
    RiskSignal,
)

_BASE: dict[str, int] = {"LOW": 20, "MEDIUM": 45, "HIGH": 70, "CRITICAL": 90}
_AGING_HOURS = 168  # 7 days

_SIGNAL_WORDS: dict[str, str] = {
    "OVERDUE": "overdue",
    "BLOCKED": "blocked",
    "WAITING_ON": "waiting on someone",
    "NO_NEXT_ACTION": "no next action",
    "AGING": "aging",
    "HIGH_BASE_SEVERITY": "high base severity",
}


def _severity_for(score: int) -> str:
    if score >= 85:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


def _confidence_for(score: int) -> str:
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def _action_for(c: RiskScoreCandidate, aging: bool) -> str:
    if c.blocked:
        return "Escalate to unblock this work."
    if c.overdue:
        return "Follow up to bring overdue work current."
    if c.waiting_on:
        return "Nudge the person you are waiting on."
    if c.no_next_action:
        return "Assign an owner and a clear next action."
    if aging:
        return "Review aging work and confirm it is still needed."
    return "Review and confirm the current status."


def _reason(signals: list[str], severity: str) -> str:
    if not signals:
        return f"No active risk signals; {severity.lower()} risk."
    words = [_SIGNAL_WORDS[s] for s in signals if s in _SIGNAL_WORDS]
    return f"{', '.join(words)}; {severity.lower()} risk."


def _score_one(c: RiskScoreCandidate) -> RiskScore:
    base = _BASE.get(c.base_severity, 20)
    signals: list[RiskSignal] = []
    boost = 0
    if c.overdue:
        boost += 15
        signals.append("OVERDUE")
    if c.blocked:
        boost += 20
        signals.append("BLOCKED")
    if c.waiting_on:
        boost += 10
        signals.append("WAITING_ON")
    if c.no_next_action:
        boost += 12
        signals.append("NO_NEXT_ACTION")
    aging = c.age_hours is not None and c.age_hours > _AGING_HOURS
    if aging:
        boost += 10
        signals.append("AGING")
    if c.base_severity in ("HIGH", "CRITICAL"):
        signals.append("HIGH_BASE_SEVERITY")

    score = max(0, min(100, base + boost))
    severity = _severity_for(score)
    return RiskScore(
        candidate_id=c.candidate_id,
        risk_score=score,
        severity=severity,  # type: ignore[arg-type]
        confidence=_confidence_for(score),  # type: ignore[arg-type]
        reason=_reason(signals, severity),
        contributing_signals=signals[:8],
        suggested_next_action=_action_for(c, aging),
        human_review_needed=severity in ("HIGH", "CRITICAL") or c.blocked,
    )


def score_risk(payload: RiskScoringInput) -> RiskScoringResult:
    max_results = payload.max_results or len(payload.candidates)
    scored = [_score_one(c) for c in payload.candidates]
    # Highest risk first; stable on ties (preserves Foundation's input order).
    scored.sort(key=lambda s: s.risk_score, reverse=True)
    return RiskScoringResult(scores=scored[:max_results])
