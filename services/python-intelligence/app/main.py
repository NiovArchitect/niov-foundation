"""FastAPI entrypoint.

Exposes three endpoints the Foundation TS wrapper consumes:

- ``GET  /health``           — liveness probe
- ``POST /rank-next-actions`` — the canonical ranking endpoint
                                 (URL matches the TS wrapper at
                                 apps/api/src/services/intelligence/
                                 python-ranking.service.ts which posts to
                                 ``${pythonUrl}/rank-next-actions``)
- ``POST /forecast/project-risk`` — per-project risk forecaster

All endpoints reject extra fields (Pydantic ``extra='forbid'``) so any
drift between the TS contract and this service surfaces as a 422.

Run locally::

    cd services/python-intelligence
    pip install -r requirements.txt
    uvicorn app.main:app --host 0.0.0.0 --port 8000

Point Foundation at it::

    PYTHON_INTELLIGENCE_RUNTIME_URL=http://localhost:8000 npm run dev
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

from fastapi import FastAPI

from .enricher import extract_work_signals
from .forecaster import forecast_project_risk
from .meeting import extract_meeting_intelligence
from .analytics import operational_analytics
from .draft_tone import evaluate_draft_tone
from .ranker import rank_next_actions
from .rerank import rerank_candidates
from .risk import score_risk
from .schemas import (
    DraftToneInput,
    DraftToneResult,
    HealthResponse,
    OperationalAnalyticsInput,
    OperationalAnalyticsResult,
    MeetingIntelligenceInput,
    MeetingIntelligenceResult,
    NextActionRankingInput,
    NextActionRankingResult,
    ProjectRiskForecastRequest,
    ProjectRiskForecastResponse,
    RiskScoringInput,
    RiskScoringResult,
    SemanticRerankInput,
    SemanticRerankResult,
    WorkSignalExtractionInput,
    WorkSignalExtractionResult,
)


def _resolve_version() -> str:
    try:
        return version("niov-python-intelligence")
    except PackageNotFoundError:
        return "0.1.0"


app = FastAPI(
    title="NIOV Python Intelligence",
    version=_resolve_version(),
    docs_url=None,  # Disable interactive docs in production posture.
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(version=_resolve_version())


@app.post("/rank-next-actions", response_model=NextActionRankingResult)
def rank_next_actions_route(payload: NextActionRankingInput) -> NextActionRankingResult:
    return rank_next_actions(payload)


@app.post("/forecast/project-risk", response_model=ProjectRiskForecastResponse)
def forecast_project_risk_route(
    payload: ProjectRiskForecastRequest,
) -> ProjectRiskForecastResponse:
    return forecast_project_risk(payload.projects)


@app.post("/jobs/extract-work-signals", response_model=WorkSignalExtractionResult)
def extract_work_signals_route(
    payload: WorkSignalExtractionInput,
) -> WorkSignalExtractionResult:
    # Advisory enrichment only. Foundation's deterministic extraction stays
    # primary; this never decides ownership/policy/target and never executes.
    return extract_work_signals(payload)


@app.post("/jobs/meeting-intelligence", response_model=MeetingIntelligenceResult)
def meeting_intelligence_route(
    payload: MeetingIntelligenceInput,
) -> MeetingIntelligenceResult:
    # Phase 1285-V — advisory meeting / ambient-perception intelligence.
    # Foundation's deterministic capture stays primary and is the sole policy/
    # ownership/scope authority; this never decides ownership/policy/target,
    # never executes, never sends, and never retains the transcript.
    return extract_meeting_intelligence(payload)


@app.post("/jobs/semantic-rerank", response_model=SemanticRerankResult)
def semantic_rerank_route(payload: SemanticRerankInput) -> SemanticRerankResult:
    # Phase 1285-W — advisory semantic rerank over a Foundation-scoped candidate
    # set. Foundation already enforced RBAC/ABAC + tenant scope when it assembled
    # the candidates; this only reorders them by deterministic lexical relevance.
    # It returns ONLY candidate_ids present in the input, never grants permission,
    # never decides scope, and never becomes the source of truth. Foundation
    # re-validates every returned id.
    return rerank_candidates(payload)


@app.post("/jobs/score-risk", response_model=RiskScoringResult)
def score_risk_route(payload: RiskScoringInput) -> RiskScoringResult:
    # Phase 1285-X — advisory risk scoring over a Foundation-scoped candidate set
    # (deterministic watcher findings over durable work). This scores, explains,
    # and recommends ONLY; it never creates work, notifies anyone, decides scope/
    # ownership/permission, or returns a candidate_id not present in the input.
    # Deterministic watcher findings stay primary; Foundation re-validates every
    # score and treats it as advisory.
    return score_risk(payload)


@app.post("/jobs/draft-tone", response_model=DraftToneResult)
def draft_tone_route(payload: DraftToneInput) -> DraftToneResult:
    # Phase 1285-Y — advisory draft tone / quality intelligence. This evaluates a
    # PROPOSED message and proposes a cleaner revision; it NEVER sends, approves,
    # decides recipients or permissions, impersonates anyone, or overwrites the
    # user's intent. The suggested_revision is a safe transform of the original
    # (no em dash). Foundation re-validates the revision + keeps approval gates.
    return evaluate_draft_tone(payload)


@app.post("/jobs/operational-analytics", response_model=OperationalAnalyticsResult)
def operational_analytics_route(
    payload: OperationalAnalyticsInput,
) -> OperationalAnalyticsResult:
    # Phase 1285-Z — advisory operational analytics over a Foundation-scoped
    # execution-health snapshot. This aggregates, scores, and summarizes ONLY;
    # it never creates work, notifies anyone, sends a message, introduces a new
    # item or person, or references an id outside the snapshot. Deterministic
    # metrics stay primary; Foundation re-validates + re-scopes the result.
    return operational_analytics(payload)
