from fastapi.testclient import TestClient

from app.main import app
from app.ranker import rank_next_actions
from app.schemas import NextActionRankingInput

client = TestClient(app)


def _empty() -> NextActionRankingInput:
    return NextActionRankingInput(
        pending_approvals_count=0,
        recent_action_count=0,
        active_authority_grants_count=0,
        expiring_soon_grants_count=0,
        sensitive_case_by_case_grants_count=0,
        active_preferences_count=1,
        active_sensitivity_boundaries_count=1,
        collaboration_inbox_pending_count=0,
        collaboration_needs_approval_count=0,
        collaboration_blocked_count=0,
        active_project_count=0,
        most_recent_action_at=None,
        most_recent_collaboration_at=None,
    )


def test_ranker_returns_insufficient_context_when_nothing_pressing():
    result = rank_next_actions(_empty())
    assert len(result.suggestions) == 1
    only = result.suggestions[0]
    assert only.confidence == "INSUFFICIENT_CONTEXT"
    assert only.rank == 1
    assert only.score == 0


def test_ranker_pending_approvals_dominate():
    payload = _empty()
    payload.pending_approvals_count = 3
    result = rank_next_actions(payload)
    assert result.suggestions[0].reason == "PENDING_APPROVALS_AWAITING_YOU"
    assert result.suggestions[0].risk == "APPROVAL_REQUIRED"
    assert result.suggestions[0].rank == 1


def test_ranker_collaboration_blocked_ranks_above_inbox():
    payload = _empty()
    payload.collaboration_blocked_count = 2
    payload.collaboration_inbox_pending_count = 5
    result = rank_next_actions(payload)
    ranks = {s.reason: s.rank for s in result.suggestions}
    assert ranks["COLLABORATION_BLOCKED_NEEDS_ATTENTION"] < ranks[
        "COLLABORATION_INBOX_NEEDS_RESPONSE"
    ]


def test_ranker_caps_at_six_suggestions():
    payload = NextActionRankingInput(
        pending_approvals_count=1,
        recent_action_count=10,
        active_authority_grants_count=1,
        expiring_soon_grants_count=1,
        sensitive_case_by_case_grants_count=1,
        active_preferences_count=0,
        active_sensitivity_boundaries_count=0,
        collaboration_inbox_pending_count=1,
        collaboration_needs_approval_count=1,
        collaboration_blocked_count=1,
        active_project_count=1,
        most_recent_action_at=None,
        most_recent_collaboration_at=None,
        conduct_session_next_step="NEEDS_CLARIFICATION",
        conduct_session_approval_required=True,
        conduct_session_collaboration_suggested=True,
    )
    result = rank_next_actions(payload)
    assert len(result.suggestions) == 6
    # ranks must be 1..6 contiguous
    assert [s.rank for s in result.suggestions] == [1, 2, 3, 4, 5, 6]


def test_ranker_route_round_trips():
    payload = {
        "pending_approvals_count": 2,
        "recent_action_count": 0,
        "active_authority_grants_count": 0,
        "expiring_soon_grants_count": 0,
        "sensitive_case_by_case_grants_count": 0,
        "active_preferences_count": 1,
        "active_sensitivity_boundaries_count": 1,
        "collaboration_inbox_pending_count": 0,
        "collaboration_needs_approval_count": 0,
        "collaboration_blocked_count": 0,
        "active_project_count": 0,
        "most_recent_action_at": None,
        "most_recent_collaboration_at": None,
    }
    response = client.post("/rank-next-actions", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["provider_mode"] == "PYTHON"
    assert isinstance(body["suggestions"], list)
    assert body["suggestions"][0]["reason"] == "PENDING_APPROVALS_AWAITING_YOU"


def test_ranker_rejects_extra_field():
    bad = {
        "pending_approvals_count": 0,
        "recent_action_count": 0,
        "active_authority_grants_count": 0,
        "expiring_soon_grants_count": 0,
        "sensitive_case_by_case_grants_count": 0,
        "active_preferences_count": 1,
        "active_sensitivity_boundaries_count": 1,
        "collaboration_inbox_pending_count": 0,
        "collaboration_needs_approval_count": 0,
        "collaboration_blocked_count": 0,
        "active_project_count": 0,
        "most_recent_action_at": None,
        "most_recent_collaboration_at": None,
        "chain_of_thought": "this should be rejected",
    }
    response = client.post("/rank-next-actions", json=bad)
    assert response.status_code == 422


def test_ranker_rejects_negative_count():
    bad = {
        "pending_approvals_count": -1,
        "recent_action_count": 0,
        "active_authority_grants_count": 0,
        "expiring_soon_grants_count": 0,
        "sensitive_case_by_case_grants_count": 0,
        "active_preferences_count": 1,
        "active_sensitivity_boundaries_count": 1,
        "collaboration_inbox_pending_count": 0,
        "collaboration_needs_approval_count": 0,
        "collaboration_blocked_count": 0,
        "active_project_count": 0,
        "most_recent_action_at": None,
        "most_recent_collaboration_at": None,
    }
    response = client.post("/rank-next-actions", json=bad)
    assert response.status_code == 422
