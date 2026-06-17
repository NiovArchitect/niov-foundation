"""Phase 1285-V — deterministic meeting / ambient-perception intelligence.

Advisory only; no LLM, no chain-of-thought, no full transcript echoed.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

TRANSCRIPT = "\n".join(
    [
        "Sadeil: Welcome to the launch follow-up meeting.",
        "Sadeil: David, can you review the UI flow by Friday?",
        "David: I'll review the flow by Friday.",
        "Samiksha: We decided to go with the new onboarding copy.",
        "Annie: We're blocked on the compliance sign-off.",
        "Sadeil: Open question, do we need legal to approve the launch date?",
    ]
)


def _types(candidates):
    return {c["candidate_type"] for c in candidates}


def test_meeting_intelligence_extracts_closed_vocab_candidates():
    r = client.post("/jobs/meeting-intelligence", json={"transcript": TRANSCRIPT, "source_type": "MEETING_TRANSCRIPT"})
    assert r.status_code == 200
    body = r.json()
    assert body["provider_mode"] == "PYTHON"
    types = _types(body["candidates"])
    # The clean transcript yields commitment/decision/blocker/open-question.
    assert "COMMITMENT" in types
    assert "DECISION" in types
    assert "BLOCKER" in types
    assert "OPEN_QUESTION" in types
    # A concise summary is the first substantive line, not a paraphrase.
    assert body["summary"] is not None
    assert len(body["summary"]) <= 600


def test_evidence_is_short_marker_not_full_transcript():
    r = client.post("/jobs/meeting-intelligence", json={"transcript": TRANSCRIPT})
    body = r.json()
    for c in body["candidates"]:
        assert len(c["evidence_phrase"]) <= 160
        assert len(c["text"]) <= 280
        # The full transcript is never echoed back in a single field.
        assert c["text"] != TRANSCRIPT


def test_due_date_lifts_action_confidence_to_high():
    r = client.post("/jobs/meeting-intelligence", json={"transcript": "David: I'll send the proof notes by Friday."})
    body = r.json()
    commit = [c for c in body["candidates"] if c["candidate_type"] == "COMMITMENT"]
    assert commit and commit[0]["confidence"] == "HIGH"


def test_empty_signal_transcript_returns_no_candidates():
    r = client.post("/jobs/meeting-intelligence", json={"transcript": "Hello. Nice weather today."})
    body = r.json()
    assert body["candidates"] == []


def test_rejects_extra_fields_and_empty_transcript():
    assert client.post("/jobs/meeting-intelligence", json={"transcript": "x", "bogus": 1}).status_code == 422
    assert client.post("/jobs/meeting-intelligence", json={"transcript": ""}).status_code == 422
