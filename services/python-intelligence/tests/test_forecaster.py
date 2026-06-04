from fastapi.testclient import TestClient

from app.forecaster import forecast_project_risk
from app.main import app
from app.schemas import ProjectRiskInput

client = TestClient(app)


def test_archived_project_returns_none():
    out = forecast_project_risk(
        [
            ProjectRiskInput(
                project_id="p1",
                state="ARCHIVED",
                member_count=2,
                days_since_last_action=100,
                blocked_collaborations_count=5,
                pending_approvals_count=5,
                expiring_authority_grants_count=2,
            )
        ]
    )
    forecast = out.forecasts[0]
    assert forecast.project_risk_level == "NONE"
    assert forecast.reasons == []
    assert forecast.mitigations == []


def test_stale_project_with_blocked_collabs_scores_high():
    out = forecast_project_risk(
        [
            ProjectRiskInput(
                project_id="p1",
                state="ACTIVE",
                member_count=2,
                days_since_last_action=45,
                blocked_collaborations_count=3,
                pending_approvals_count=0,
                expiring_authority_grants_count=0,
            )
        ]
    )
    forecast = out.forecasts[0]
    assert forecast.project_risk_level in ("HIGH", "CRITICAL")
    assert "STALE_PROJECT_NO_RECENT_ACTION" in forecast.reasons
    assert "BLOCKED_COLLABORATIONS" in forecast.reasons
    assert "PICK_UP_PROJECT" in forecast.mitigations
    assert "RESOLVE_BLOCKED_COLLABORATIONS" in forecast.mitigations


def test_no_members_flags_invite():
    out = forecast_project_risk(
        [
            ProjectRiskInput(
                project_id="p1",
                state="ACTIVE",
                member_count=0,
                days_since_last_action=2,
                blocked_collaborations_count=0,
                pending_approvals_count=0,
                expiring_authority_grants_count=0,
            )
        ]
    )
    forecast = out.forecasts[0]
    assert "NO_PROJECT_MEMBERS" in forecast.reasons
    assert "INVITE_MEMBERS" in forecast.mitigations


def test_missing_days_yields_insufficient_context():
    out = forecast_project_risk(
        [
            ProjectRiskInput(
                project_id="p1",
                state="ACTIVE",
                member_count=2,
                days_since_last_action=None,
            )
        ]
    )
    forecast = out.forecasts[0]
    assert "INSUFFICIENT_CONTEXT" in forecast.reasons
    assert "GATHER_MORE_CONTEXT" in forecast.mitigations
    assert forecast.project_risk_level == "NONE"
    assert forecast.confidence == "INSUFFICIENT_CONTEXT"


def test_forecast_route_round_trips_multiple_projects():
    payload = {
        "projects": [
            {
                "project_id": "a",
                "state": "ACTIVE",
                "member_count": 2,
                "days_since_last_action": 1,
            },
            {
                "project_id": "b",
                "state": "ARCHIVED",
                "member_count": 1,
                "days_since_last_action": 100,
            },
        ]
    }
    response = client.post("/forecast/project-risk", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["provider_mode"] == "PYTHON"
    assert len(body["forecasts"]) == 2
    project_ids = {f["project_id"] for f in body["forecasts"]}
    assert project_ids == {"a", "b"}


def test_forecast_route_rejects_unknown_state():
    bad = {
        "projects": [
            {
                "project_id": "a",
                "state": "PAUSED",  # not in enum
                "member_count": 1,
                "days_since_last_action": 0,
            }
        ]
    }
    response = client.post("/forecast/project-risk", json=bad)
    assert response.status_code == 422
