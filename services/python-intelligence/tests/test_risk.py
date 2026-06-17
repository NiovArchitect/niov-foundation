"""Phase 1285-X — deterministic risk scoring.

Advisory only; no LLM, no chain-of-thought. The scorer may only score candidates
Foundation already scoped: every returned candidate_id must be one that was sent
in, scores are explainable from contributing_signals, and severity rises with the
signal load (blocked + overdue + aging > a single low-severity item).
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CANDIDATES = [
    {
        "candidate_id": "OVERDUE_WORK:led-1",
        "candidate_type": "OVERDUE_WORK",
        "title": "Ship the launch checklist",
        "base_severity": "HIGH",
        "age_hours": 240,
        "overdue": True,
    },
    {
        "candidate_id": "UNRESOLVED_BLOCKER:led-2",
        "candidate_type": "UNRESOLVED_BLOCKER",
        "title": "Compliance sign-off",
        "base_severity": "HIGH",
        "age_hours": 50,
        "blocked": True,
    },
    {
        "candidate_id": "NO_NEXT_ACTION:led-3",
        "candidate_type": "NO_NEXT_ACTION",
        "title": "Vendor intro",
        "base_severity": "LOW",
        "age_hours": 5,
        "no_next_action": True,
    },
]


def _by_id(scores):
    return {s["candidate_id"]: s for s in scores}


def test_scores_only_input_ids_and_explains_signals():
    r = client.post("/jobs/score-risk", json={"candidates": CANDIDATES})
    assert r.status_code == 200
    body = r.json()
    assert body["provider_mode"] == "PYTHON"
    allowed = {c["candidate_id"] for c in CANDIDATES}
    assert all(s["candidate_id"] in allowed for s in body["scores"])
    by = _by_id(body["scores"])
    # The blocked, high-base item carries the BLOCKED signal and needs review.
    blk = by["UNRESOLVED_BLOCKER:led-2"]
    assert "BLOCKED" in blk["contributing_signals"]
    assert blk["human_review_needed"] is True
    assert blk["severity"] in ("HIGH", "CRITICAL")


def test_severity_rises_with_signal_load():
    r = client.post("/jobs/score-risk", json={"candidates": CANDIDATES})
    by = _by_id(r.json()["scores"])
    low = by["NO_NEXT_ACTION:led-3"]["risk_score"]
    high = by["OVERDUE_WORK:led-1"]["risk_score"]
    assert high > low


def test_sorted_highest_risk_first_and_capped():
    r = client.post("/jobs/score-risk", json={"candidates": CANDIDATES, "max_results": 2})
    scores = r.json()["scores"]
    assert len(scores) == 2
    assert scores[0]["risk_score"] >= scores[1]["risk_score"]


def test_reason_and_action_are_short_closed_text():
    r = client.post("/jobs/score-risk", json={"candidates": CANDIDATES})
    for s in r.json()["scores"]:
        assert 0 < len(s["reason"]) <= 200
        assert 0 < len(s["suggested_next_action"]) <= 160
        assert isinstance(s["risk_score"], int)
        assert s["severity"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        for sig in s["contributing_signals"]:
            assert sig in ("OVERDUE", "BLOCKED", "WAITING_ON", "NO_NEXT_ACTION", "AGING", "HIGH_BASE_SEVERITY")


def test_rejects_extra_fields_and_bad_severity():
    assert client.post("/jobs/score-risk", json={"candidates": [], "bogus": 1}).status_code == 422
    bad = {"candidates": [{"candidate_id": "c", "candidate_type": "T", "title": "t", "base_severity": "WAT"}]}
    assert client.post("/jobs/score-risk", json=bad).status_code == 422
    leak = {"candidates": [{"candidate_id": "c", "candidate_type": "T", "title": "t", "base_severity": "LOW", "leak": 1}]}
    assert client.post("/jobs/score-risk", json=leak).status_code == 422
