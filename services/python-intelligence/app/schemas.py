"""Pydantic schemas mirroring the Foundation TS wrapper contract at
apps/api/src/services/intelligence/python-ranking.service.ts.

Closed-vocab strings everywhere. No raw memory. No transcripts. No
chain-of-thought. No secrets. The TS validator
(validatePythonRankingResponse) rejects any field that does not match
these schemas, so this file is the load-bearing contract.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# --- Ranking ----------------------------------------------------------------

NextActionReason = Literal[
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
]

NextActionConfidence = Literal["HIGH", "MEDIUM", "LOW", "INSUFFICIENT_CONTEXT"]

NextActionRisk = Literal[
    "NONE",
    "APPROVAL_REQUIRED",
    "POLICY_REVIEW",
    "MISSING_CONTEXT",
    "CROSS_TEAM_DEPENDENCY",
    "PROJECT_BLOCKER",
    "DMW_SCOPE_NEEDED",
]

ConductSessionNextStep = Literal[
    "ANSWERED",
    "NEEDS_CLARIFICATION",
    "NEEDS_APPROVAL",
    "ACTION_PROPOSED",
    "ACTION_CREATED",
    "BLOCKED_BY_POLICY",
    "BLOCKED_BY_SCOPE",
    "COLLABORATION_REQUEST_SUGGESTED",
    "MEMORY_CORRECTION_AVAILABLE",
]


class NextActionRankingInput(BaseModel):
    """Closed-vocab counts + flags from the Foundation TS wrapper.

    Mirrors the TypeScript ``NextActionRankingInput`` interface. Pydantic
    rejects extra fields so the Python service cannot drift from the
    TS contract.
    """

    model_config = ConfigDict(extra="forbid")

    pending_approvals_count: int = Field(ge=0)
    recent_action_count: int = Field(ge=0)
    active_authority_grants_count: int = Field(ge=0)
    expiring_soon_grants_count: int = Field(ge=0)
    sensitive_case_by_case_grants_count: int = Field(ge=0)
    active_preferences_count: int = Field(ge=0)
    active_sensitivity_boundaries_count: int = Field(ge=0)
    collaboration_inbox_pending_count: int = Field(ge=0)
    collaboration_needs_approval_count: int = Field(ge=0)
    collaboration_blocked_count: int = Field(ge=0)
    active_project_count: int = Field(ge=0)
    most_recent_action_at: Optional[str] = None
    most_recent_collaboration_at: Optional[str] = None
    conduct_session_next_step: Optional[ConductSessionNextStep] = None
    conduct_session_approval_required: Optional[bool] = None
    conduct_session_collaboration_suggested: Optional[bool] = None


class NextActionSuggestion(BaseModel):
    """One ranked suggestion the TS validator will accept."""

    model_config = ConfigDict(extra="forbid")

    rank: int = Field(ge=1)
    reason: NextActionReason
    safe_title: str = Field(min_length=1, max_length=200)
    confidence: NextActionConfidence
    risk: NextActionRisk
    score: int = Field(ge=0)


class NextActionRankingResult(BaseModel):
    """Top-N ranked next actions.

    ``provider_mode`` is always ``"PYTHON"`` from this service. The TS
    wrapper sets ``"FIXTURE"`` only on its own fallback path; if the
    Python service returns ``provider_mode != "PYTHON"`` the TS
    validator MAY accept the value (it does not enforce on read), but
    by convention we always emit ``"PYTHON"``.
    """

    model_config = ConfigDict(extra="forbid")

    suggestions: list[NextActionSuggestion]
    provider_mode: Literal["PYTHON"] = "PYTHON"


# --- Project risk forecast --------------------------------------------------

ProjectRiskLevel = Literal["NONE", "LOW", "MODERATE", "HIGH", "CRITICAL"]

ProjectRiskReason = Literal[
    "STALE_PROJECT_NO_RECENT_ACTION",
    "BLOCKED_COLLABORATIONS",
    "PENDING_APPROVAL_BACKLOG",
    "AUTHORITY_GRANTS_EXPIRING",
    "NO_PROJECT_MEMBERS",
    "INSUFFICIENT_CONTEXT",
]

ProjectRiskMitigation = Literal[
    "PICK_UP_PROJECT",
    "RESOLVE_BLOCKED_COLLABORATIONS",
    "CLEAR_APPROVAL_BACKLOG",
    "RENEW_AUTHORITY_GRANTS",
    "INVITE_MEMBERS",
    "GATHER_MORE_CONTEXT",
]


class ProjectRiskInput(BaseModel):
    """Per-project closed-vocab counts. Wrapped in a list at the
    request level so callers can score many projects in one call.
    """

    model_config = ConfigDict(extra="forbid")

    project_id: str = Field(min_length=1)
    state: Literal["ACTIVE", "ARCHIVED"]
    member_count: int = Field(ge=0)
    days_since_last_action: Optional[int] = Field(default=None, ge=0)
    blocked_collaborations_count: int = Field(ge=0, default=0)
    pending_approvals_count: int = Field(ge=0, default=0)
    expiring_authority_grants_count: int = Field(ge=0, default=0)


class ProjectRiskForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    projects: list[ProjectRiskInput] = Field(default_factory=list)


class ProjectRiskForecast(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str
    project_risk_level: ProjectRiskLevel
    reasons: list[ProjectRiskReason]
    mitigations: list[ProjectRiskMitigation]
    confidence: NextActionConfidence


class ProjectRiskForecastResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    forecasts: list[ProjectRiskForecast]
    provider_mode: Literal["PYTHON"] = "PYTHON"


# --- Conversation-to-work enrichment (Phase 1282) ---------------------------
# Advisory-only. Foundation's deterministic TypeScript extraction is always
# primary; this service surfaces ADDITIONAL closed-vocab work signals from a
# safe utterance. It NEVER decides ownership/policy/target — Foundation does.
# No LLM. No chain-of-thought. Detection is general phrase heuristics only.

WorkSignalType = Literal[
    "FOLLOW_UP",
    "COMMITMENT",
    "TASK",
    "DELEGATION",
    "DECISION",
    "BLOCKER",
    "APPROVAL_NEEDED",
]

WorkSignalConfidence = Literal["HIGH", "MEDIUM", "LOW"]


class WorkSignalExtractionInput(BaseModel):
    """A single safe utterance to analyse for work signals.

    ``text`` is the user's own spoken/typed command within their tenant;
    Foundation governs the call. We never persist it here and never echo
    more than the short matched marker phrase back.
    """

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=4000)
    source_type: Optional[str] = Field(default=None, max_length=40)


class WorkSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal_type: WorkSignalType
    confidence: WorkSignalConfidence
    evidence_phrase: str = Field(min_length=1, max_length=120)


class WorkSignalExtractionResult(BaseModel):
    """Closed-vocab advisory signals. ``primary_signal`` is the highest-
    confidence signal (None when nothing detected). ``multi_intent`` is
    True when two or more distinct signal types are present.
    """

    model_config = ConfigDict(extra="forbid")

    signals: list[WorkSignal]
    primary_signal: Optional[WorkSignalType] = None
    multi_intent: bool = False
    provider_mode: Literal["PYTHON"] = "PYTHON"


# --- Health -----------------------------------------------------------------


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    service: Literal["niov-python-intelligence"] = "niov-python-intelligence"
    version: str
