"""Phase 1285-W — deterministic semantic rerank.

Advisory only; no LLM, no chain-of-thought, no embeddings. The reranker may only
reorder candidates Foundation already allowed: every returned candidate_id must
be one that was sent in, and a non-match is dropped (never given fake relevance).
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CANDIDATES = [
    {
        "candidate_id": "led-1",
        "candidate_type": "DECISION",
        "title": "Onboarding copy decision",
        "summary": "We decided to go with the new onboarding copy.",
        "source_type": "MEETING_TRANSCRIPT",
        "related_people": ["Samiksha Rao"],
        "status": "OPEN",
    },
    {
        "candidate_id": "led-2",
        "candidate_type": "BLOCKER",
        "title": "Compliance sign-off blocker",
        "summary": "Blocked on the compliance sign-off from Vishesh.",
        "source_type": "WORK_LEDGER",
        "related_people": ["Vishesh Patel"],
        "status": "BLOCKED",
    },
    {
        "candidate_id": "led-3",
        "candidate_type": "TASK",
        "title": "Order new office chairs",
        "summary": "Facilities to order standing desks.",
        "source_type": "WORK_LEDGER",
        "related_people": ["Annie Wu"],
        "status": "OPEN",
    },
]


def _ids(ranked):
    return [r["candidate_id"] for r in ranked]


def test_ranks_by_lexical_relevance_and_returns_only_input_ids():
    r = client.post(
        "/jobs/semantic-rerank",
        json={"query": "what did we decide about onboarding", "candidates": CANDIDATES},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provider_mode"] == "PYTHON"
    ids = _ids(body["ranked_candidates"])
    # The onboarding decision is the strongest match and ranks first.
    assert ids[0] == "led-1"
    # The irrelevant office-chairs task carries no query overlap and is dropped.
    assert "led-3" not in ids
    # Every returned id was in the input set.
    allowed = {c["candidate_id"] for c in CANDIDATES}
    assert all(i in allowed for i in ids)


def test_related_person_name_matches():
    r = client.post(
        "/jobs/semantic-rerank",
        json={"query": "show blockers related to Vishesh", "candidates": CANDIDATES},
    )
    body = r.json()
    ids = _ids(body["ranked_candidates"])
    assert ids[0] == "led-2"  # blocker + Vishesh both hit


def test_no_match_returns_empty_not_fabricated():
    r = client.post(
        "/jobs/semantic-rerank",
        json={"query": "quarterly revenue forecast spreadsheet", "candidates": CANDIDATES},
    )
    body = r.json()
    assert body["ranked_candidates"] == []


def test_max_results_caps_output():
    r = client.post(
        "/jobs/semantic-rerank",
        json={"query": "onboarding compliance order", "candidates": CANDIDATES, "max_results": 1},
    )
    body = r.json()
    assert len(body["ranked_candidates"]) == 1


def test_reason_is_short_closed_phrase():
    r = client.post(
        "/jobs/semantic-rerank",
        json={"query": "onboarding decision", "candidates": CANDIDATES},
    )
    body = r.json()
    for rc in body["ranked_candidates"]:
        assert 0 < len(rc["reason"]) <= 160
        assert isinstance(rc["score"], int)


def test_rejects_extra_fields_and_empty_query():
    assert client.post("/jobs/semantic-rerank", json={"query": "x", "candidates": [], "bogus": 1}).status_code == 422
    assert client.post("/jobs/semantic-rerank", json={"query": "", "candidates": []}).status_code == 422
    # A candidate with an unknown extra field is rejected (no contract drift).
    bad = {"query": "x", "candidates": [{"candidate_id": "c", "candidate_type": "T", "title": "t", "leak": 1}]}
    assert client.post("/jobs/semantic-rerank", json=bad).status_code == 422
