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

from .forecaster import forecast_project_risk
from .ranker import rank_next_actions
from .schemas import (
    HealthResponse,
    NextActionRankingInput,
    NextActionRankingResult,
    ProjectRiskForecastRequest,
    ProjectRiskForecastResponse,
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
