"""Deterministic project-risk forecaster.

Scores each project's risk level using closed-vocab counts. Mirrors
the safety posture of ``ranker``:

- No employee scoring.
- No productivity ranking.
- No personal blame.
- No chain-of-thought.
- Reasons + mitigations are closed-vocab labels only.

Future TS consumers (e.g., a /api/v1/otzar/my-twin/project-risk
route) will validate the output against the same closed-vocab gate.
"""

from __future__ import annotations

from .schemas import (
    ProjectRiskForecast,
    ProjectRiskForecastResponse,
    ProjectRiskInput,
    ProjectRiskMitigation,
    ProjectRiskReason,
)

# Thresholds — deliberate, tunable, no learned weights.
STALE_DAYS_LOW = 7
STALE_DAYS_MODERATE = 14
STALE_DAYS_HIGH = 30


def _score_project(project: ProjectRiskInput) -> ProjectRiskForecast:
    reasons: list[ProjectRiskReason] = []
    mitigations: list[ProjectRiskMitigation] = []
    risk_score = 0

    if project.state == "ARCHIVED":
        # Archived projects don't carry risk; signal NONE explicitly.
        return ProjectRiskForecast(
            project_id=project.project_id,
            project_risk_level="NONE",
            reasons=[],
            mitigations=[],
            confidence="HIGH",
        )

    if project.member_count == 0:
        reasons.append("NO_PROJECT_MEMBERS")
        mitigations.append("INVITE_MEMBERS")
        risk_score += 2

    days = project.days_since_last_action
    if days is None:
        reasons.append("INSUFFICIENT_CONTEXT")
        mitigations.append("GATHER_MORE_CONTEXT")
        # Don't bump risk_score — missing data is not a risk by itself.
    else:
        if days >= STALE_DAYS_HIGH:
            reasons.append("STALE_PROJECT_NO_RECENT_ACTION")
            mitigations.append("PICK_UP_PROJECT")
            risk_score += 3
        elif days >= STALE_DAYS_MODERATE:
            reasons.append("STALE_PROJECT_NO_RECENT_ACTION")
            mitigations.append("PICK_UP_PROJECT")
            risk_score += 2
        elif days >= STALE_DAYS_LOW:
            reasons.append("STALE_PROJECT_NO_RECENT_ACTION")
            mitigations.append("PICK_UP_PROJECT")
            risk_score += 1

    if project.blocked_collaborations_count > 0:
        reasons.append("BLOCKED_COLLABORATIONS")
        mitigations.append("RESOLVE_BLOCKED_COLLABORATIONS")
        risk_score += min(project.blocked_collaborations_count, 3)

    if project.pending_approvals_count >= 3:
        reasons.append("PENDING_APPROVAL_BACKLOG")
        mitigations.append("CLEAR_APPROVAL_BACKLOG")
        risk_score += 2
    elif project.pending_approvals_count > 0:
        reasons.append("PENDING_APPROVAL_BACKLOG")
        mitigations.append("CLEAR_APPROVAL_BACKLOG")
        risk_score += 1

    if project.expiring_authority_grants_count > 0:
        reasons.append("AUTHORITY_GRANTS_EXPIRING")
        mitigations.append("RENEW_AUTHORITY_GRANTS")
        risk_score += 1

    if risk_score >= 6:
        level = "CRITICAL"
        confidence = "HIGH"
    elif risk_score >= 4:
        level = "HIGH"
        confidence = "MEDIUM"
    elif risk_score >= 2:
        level = "MODERATE"
        confidence = "MEDIUM"
    elif risk_score == 1:
        level = "LOW"
        confidence = "LOW"
    else:
        level = "NONE"
        confidence = "INSUFFICIENT_CONTEXT" if days is None else "HIGH"

    # De-dupe while preserving order.
    seen_reasons: set[str] = set()
    deduped_reasons: list[ProjectRiskReason] = []
    for r in reasons:
        if r not in seen_reasons:
            seen_reasons.add(r)
            deduped_reasons.append(r)

    seen_mitigations: set[str] = set()
    deduped_mitigations: list[ProjectRiskMitigation] = []
    for m in mitigations:
        if m not in seen_mitigations:
            seen_mitigations.add(m)
            deduped_mitigations.append(m)

    return ProjectRiskForecast(
        project_id=project.project_id,
        project_risk_level=level,  # type: ignore[arg-type]
        reasons=deduped_reasons,
        mitigations=deduped_mitigations,
        confidence=confidence,  # type: ignore[arg-type]
    )


def forecast_project_risk(
    projects: list[ProjectRiskInput],
) -> ProjectRiskForecastResponse:
    return ProjectRiskForecastResponse(
        forecasts=[_score_project(p) for p in projects],
    )
