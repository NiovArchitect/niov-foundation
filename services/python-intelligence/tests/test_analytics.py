"""Phase 1285-Z — deterministic operational analytics / execution health.

Advisory only; no LLM, no chain-of-thought. The service scores from the supplied
metrics ONLY and names risks/people ONLY from the supplied top_items — it never
invents an item or a person.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _snapshot(over_metrics=None, items=None):
    metrics = {
        "total_work": 12,
        "overdue_count": 2,
        "blocked_count": 3,
        "waiting_on_count": 1,
        "no_next_action_count": 1,
        "high_risk_count": 2,
        "critical_risk_count": 1,
        "recent_completed_count": 4,
        "recent_failed_count": 1,
    }
    if over_metrics:
        metrics.update(over_metrics)
    return {
        "snapshot_id": "snap-1",
        "scope": "team",
        "metrics": metrics,
        "top_items": items if items is not None else [
            {"item_id": "UNRESOLVED_BLOCKER:1", "item_type": "UNRESOLVED_BLOCKER", "title": "Compliance blocker", "severity": "CRITICAL", "risk_score": 90, "related_people": ["Vishesh Patel"]},
            {"item_id": "OVERDUE_WORK:2", "item_type": "OVERDUE_WORK", "title": "Launch checklist", "severity": "HIGH", "risk_score": 70, "related_people": ["Vishesh Patel"]},
            {"item_id": "NO_NEXT_ACTION:3", "item_type": "NO_NEXT_ACTION", "title": "Vendor intro", "severity": "LOW", "risk_score": 22, "related_people": ["Annie Wu"]},
        ],
    }


def test_computes_health_and_status_from_metrics():
    r = client.post("/jobs/operational-analytics", json=_snapshot())
    assert r.status_code == 200
    b = r.json()
    assert b["provider_mode"] == "PYTHON"
    assert 0 <= b["health_score"] <= 100
    assert b["execution_status"] in ("HEALTHY", "WATCH", "AT_RISK", "CRITICAL")
    # Heavy blocked + critical load drags it down out of HEALTHY.
    assert b["execution_status"] in ("WATCH", "AT_RISK", "CRITICAL")


def test_top_risks_and_blockers_come_only_from_items():
    b = client.post("/jobs/operational-analytics", json=_snapshot()).json()
    assert any("Compliance blocker" in r for r in b["top_risks"])
    assert "Compliance blocker" in b["recurring_blockers"]
    # The low-severity vendor intro is not a top risk.
    assert all("Vendor intro" not in r for r in b["top_risks"])


def test_overloaded_people_only_from_related_people_and_repeated():
    b = client.post("/jobs/operational-analytics", json=_snapshot()).json()
    # Vishesh appears on two items => overloaded; Annie appears once => not.
    assert "Vishesh Patel" in b["overloaded_people"]
    assert "Annie Wu" not in b["overloaded_people"]


def test_healthy_when_clean():
    b = client.post("/jobs/operational-analytics", json=_snapshot(
        {"overdue_count": 0, "blocked_count": 0, "waiting_on_count": 0, "no_next_action_count": 0, "high_risk_count": 0, "critical_risk_count": 0, "recent_failed_count": 0},
        items=[],
    )).json()
    assert b["health_score"] == 100
    assert b["execution_status"] == "HEALTHY"
    assert b["overloaded_people"] == []
    assert b["human_review_needed"] is False


def test_caps_and_closed_vocab():
    b = client.post("/jobs/operational-analytics", json={**_snapshot(), "max_results": 1}).json()
    assert len(b["top_risks"]) <= 1
    assert b["confidence"] in ("HIGH", "MEDIUM", "LOW")
    assert len(b["summary"]) <= 600


def test_rejects_extra_fields_and_bad_status():
    assert client.post("/jobs/operational-analytics", json={**_snapshot(), "bogus": 1}).status_code == 422
    bad = _snapshot()
    bad["scope"] = "galaxy"
    assert client.post("/jobs/operational-analytics", json=bad).status_code == 422
    bad2 = _snapshot()
    bad2["metrics"]["blocked_count"] = -1
    assert client.post("/jobs/operational-analytics", json=bad2).status_code == 422
