"""Tests for the conversation-to-work signal enricher (Phase 1282)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.enricher import extract_work_signals
from app.main import app
from app.schemas import WorkSignalExtractionInput

client = TestClient(app)


def _extract(text: str):
    return extract_work_signals(WorkSignalExtractionInput(text=text))


def test_follow_up_detected() -> None:
    r = _extract("I'll follow up with Dana tomorrow")
    types = {s.signal_type for s in r.signals}
    assert "FOLLOW_UP" in types
    assert "COMMITMENT" in types  # "i'll "
    assert r.multi_intent is True


def test_delegation_detected() -> None:
    r = _extract("Can you ask Priya to send the report")
    types = {s.signal_type for s in r.signals}
    assert "DELEGATION" in types
    assert r.primary_signal is not None


def test_blocker_detected() -> None:
    r = _extract("We are blocked, waiting on legal to approve")
    types = {s.signal_type for s in r.signals}
    assert "BLOCKER" in types
    assert "APPROVAL_NEEDED" in types


def test_decision_detected() -> None:
    r = _extract("We decided to go with the second vendor")
    assert any(s.signal_type == "DECISION" for s in r.signals)


def test_two_markers_same_type_is_high_confidence() -> None:
    r = _extract("We are blocked and stuck on the migration")
    blocker = next(s for s in r.signals if s.signal_type == "BLOCKER")
    assert blocker.confidence == "HIGH"


def test_no_signal_for_neutral_text() -> None:
    r = _extract("The weather is nice today")
    assert r.signals == []
    assert r.primary_signal is None
    assert r.multi_intent is False


def test_evidence_phrase_never_echoes_full_text() -> None:
    long_text = "I'll " + ("x" * 3000)
    r = _extract(long_text)
    for s in r.signals:
        assert len(s.evidence_phrase) <= 120


def test_route_returns_closed_vocab() -> None:
    resp = client.post(
        "/jobs/extract-work-signals",
        json={"text": "I need to follow up and please ask Sam to review"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider_mode"] == "PYTHON"
    assert isinstance(body["signals"], list)
    for s in body["signals"]:
        assert s["signal_type"] in {
            "FOLLOW_UP", "COMMITMENT", "TASK", "DELEGATION",
            "DECISION", "BLOCKER", "APPROVAL_NEEDED",
        }
        assert s["confidence"] in {"HIGH", "MEDIUM", "LOW"}


def test_route_rejects_extra_fields() -> None:
    resp = client.post(
        "/jobs/extract-work-signals",
        json={"text": "hello", "rogue_field": "x"},
    )
    assert resp.status_code == 422


def test_route_rejects_empty_text() -> None:
    resp = client.post("/jobs/extract-work-signals", json={"text": ""})
    assert resp.status_code == 422
