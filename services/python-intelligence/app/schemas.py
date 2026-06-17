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


# --- Meeting / ambient-perception intelligence (Phase 1285-V) ---------------
# ADVISORY only. Foundation governs the call, validates + scopes + audits the
# output, and decides what becomes governed work. No LLM, no chain-of-thought,
# no raw transcript retained. Detection is deterministic phrase/structure
# heuristics; evidence_phrase is a SHORT matched snippet, never the full
# transcript. The same contract is the runway for future glasses/lens ambient
# context packets (capture -> normalize -> deterministic -> advisory ->
# Foundation validation -> governed surfaces).

MeetingCandidateType = Literal[
    "SUMMARY",
    "DECISION",
    "ACTION_ITEM",
    "BLOCKER",
    "RISK",
    "OPEN_QUESTION",
    "COMMITMENT",
    "FOLLOW_UP",
    "DRAFT_SUGGESTION",
]

MeetingCandidateConfidence = Literal["HIGH", "MEDIUM", "LOW"]


class MeetingIntelligenceInput(BaseModel):
    """A captured perception stream (meeting transcript / conversation note /
    imported notes). Foundation governs the call; we never persist it."""

    model_config = ConfigDict(extra="forbid")

    transcript: str = Field(min_length=1, max_length=20000)
    source_type: Optional[str] = Field(default=None, max_length=40)


class MeetingIntelligenceCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_type: MeetingCandidateType
    # A short, safe extraction (never the full transcript).
    text: str = Field(min_length=1, max_length=280)
    confidence: MeetingCandidateConfidence
    evidence_phrase: str = Field(min_length=1, max_length=160)


class MeetingIntelligenceResult(BaseModel):
    """Advisory meeting intelligence. ``summary`` is a concise deterministic
    synthesis (None when nothing usable). Candidates are closed-vocab."""

    model_config = ConfigDict(extra="forbid")

    summary: Optional[str] = Field(default=None, max_length=600)
    candidates: list[MeetingIntelligenceCandidate]
    provider_mode: Literal["PYTHON"] = "PYTHON"


# --- Semantic retrieval rerank (Phase 1285-W) -------------------------------
# ADVISORY only. Foundation assembles a scoped, RBAC/ABAC-checked candidate set
# and sends ONLY safe summaries here (titles, short summaries, resolved display
# names — never raw private content, never raw entity UUIDs as the meaning).
# This service reranks the candidates Foundation already allowed by deterministic
# lexical relevance. It NEVER returns a candidate_id that was not in the input,
# never requests more data, never invents content, and produces no embeddings.
# No LLM, no chain-of-thought. Foundation re-validates every returned id and
# treats scores as advisory.


class SemanticRerankCandidate(BaseModel):
    """One Foundation-allowed candidate's safe summary. ``related_people`` are
    resolved display names (never raw UUIDs)."""

    model_config = ConfigDict(extra="forbid")

    candidate_id: str = Field(min_length=1, max_length=200)
    candidate_type: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=400)
    summary: Optional[str] = Field(default=None, max_length=2000)
    source_type: Optional[str] = Field(default=None, max_length=60)
    created_at: Optional[str] = Field(default=None, max_length=40)
    updated_at: Optional[str] = Field(default=None, max_length=40)
    related_people: list[str] = Field(default_factory=list, max_length=40)
    status: Optional[str] = Field(default=None, max_length=60)


class SemanticRerankInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=2000)
    candidates: list[SemanticRerankCandidate] = Field(default_factory=list, max_length=500)
    max_results: Optional[int] = Field(default=None, ge=1, le=200)


class RankedCandidate(BaseModel):
    """An advisory rank for a candidate Foundation already allowed. ``score`` is
    a relative relevance integer; ``reason`` is a short closed phrase (no CoT)."""

    model_config = ConfigDict(extra="forbid")

    candidate_id: str = Field(min_length=1, max_length=200)
    score: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=160)


class SemanticRerankResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ranked_candidates: list[RankedCandidate]
    provider_mode: Literal["PYTHON"] = "PYTHON"


# --- Risk scoring (Phase 1285-X) --------------------------------------------
# ADVISORY only. Foundation assembles a scoped, deterministic candidate set
# (watcher findings over durable work — overdue / blocked / waiting-on / no-
# next-action) and sends ONLY safe summaries + boolean signal flags here. This
# service scores + explains + recommends; it NEVER creates work, notifies anyone,
# decides scope/ownership/permission, or returns a candidate_id that was not in
# the input. No LLM, no chain-of-thought. Deterministic watcher findings stay
# primary; Foundation validates + scopes every score.

RiskSeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
RiskConfidence = Literal["HIGH", "MEDIUM", "LOW"]
RiskSignal = Literal[
    "OVERDUE",
    "BLOCKED",
    "WAITING_ON",
    "NO_NEXT_ACTION",
    "AGING",
    "HIGH_BASE_SEVERITY",
]


class RiskScoreCandidate(BaseModel):
    """One Foundation-scoped work/watcher candidate's safe summary + signals.
    ``related_people`` are resolved display names (never raw UUIDs)."""

    model_config = ConfigDict(extra="forbid")

    candidate_id: str = Field(min_length=1, max_length=200)
    candidate_type: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=400)
    summary: Optional[str] = Field(default=None, max_length=2000)
    base_severity: RiskSeverity
    age_hours: Optional[float] = Field(default=None, ge=0)
    overdue: bool = False
    blocked: bool = False
    waiting_on: bool = False
    no_next_action: bool = False
    related_people: list[str] = Field(default_factory=list, max_length=40)


class RiskScoringInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidates: list[RiskScoreCandidate] = Field(default_factory=list, max_length=500)
    max_results: Optional[int] = Field(default=None, ge=1, le=500)


class RiskScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_id: str = Field(min_length=1, max_length=200)
    risk_score: int = Field(ge=0, le=100)
    severity: RiskSeverity
    confidence: RiskConfidence
    reason: str = Field(min_length=1, max_length=200)
    contributing_signals: list[RiskSignal] = Field(default_factory=list, max_length=8)
    suggested_next_action: str = Field(min_length=1, max_length=160)
    human_review_needed: bool


class RiskScoringResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scores: list[RiskScore]
    provider_mode: Literal["PYTHON"] = "PYTHON"


# --- Draft tone intelligence (Phase 1285-Y) ---------------------------------
# ADVISORY only. Foundation governs the call and is the sole authority on send /
# approval / recipients / intent. This service evaluates a PROPOSED message and
# proposes a cleaner revision; it NEVER sends, approves, decides recipients or
# permissions, impersonates anyone, or overwrites the user's intent. No LLM, no
# chain-of-thought. Detection is deterministic phrase/structure heuristics; the
# suggested_revision is a safe transform of the original (em-dashes removed, mild
# softening) — recipient-facing text never contains an em dash.

DraftChannel = Literal[
    "internal_message",
    "email",
    "meeting_follow_up",
    "action_proposal",
    "voice_draft",
    "unknown",
]

DraftToneLabel = Literal[
    "CLEAR",
    "WARM",
    "DIRECT",
    "TOO_HARSH",
    "TOO_VAGUE",
    "TOO_LONG",
    "NEEDS_CONTEXT",
    "EXECUTIVE_READY",
    "RISKY",
]

DraftRiskFlag = Literal[
    "EM_DASH",
    "HARSH_TONE",
    "BLAME_LANGUAGE",
    "AMBIGUOUS_RECIPIENT",
    "MISSING_CONTEXT",
    "TOO_MANY_WORDS",
    "POSSIBLE_POLICY_RISK",
    "EXTERNAL_SEND_REQUIRES_APPROVAL",
]

DraftConfidence = Literal["HIGH", "MEDIUM", "LOW"]


class DraftRecipientContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: Optional[str] = Field(default=None, max_length=200)
    relationship: Optional[str] = Field(default=None, max_length=80)
    internal: bool


class DraftConstraints(BaseModel):
    model_config = ConfigDict(extra="forbid")

    no_em_dash: bool = True
    preserve_intent: bool = True
    approval_required: Optional[bool] = None


class DraftToneInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_id: Optional[str] = Field(default=None, max_length=200)
    draft_text: str = Field(min_length=1, max_length=8000)
    channel: DraftChannel
    recipient_context: Optional[DraftRecipientContext] = None
    intent: Optional[str] = Field(default=None, max_length=2000)
    constraints: Optional[DraftConstraints] = None


class DraftToneResult(BaseModel):
    """Advisory draft assessment + a safe suggested revision. ``suggested_revision``
    is a transform of the original (never an em dash); ``preserves_intent`` is the
    deterministic guarantee that no recipient/commitment was added."""

    model_config = ConfigDict(extra="forbid")

    quality_score: int = Field(ge=0, le=100)
    tone_label: DraftToneLabel
    risk_flags: list[DraftRiskFlag] = Field(default_factory=list, max_length=12)
    suggested_revision: str = Field(min_length=1, max_length=8000)
    reason: str = Field(min_length=1, max_length=300)
    confidence: DraftConfidence
    approval_required: bool
    preserves_intent: bool
    provider_mode: Literal["PYTHON"] = "PYTHON"


# --- Health -----------------------------------------------------------------


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    service: Literal["niov-python-intelligence"] = "niov-python-intelligence"
    version: str
