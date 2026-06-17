"""Phase 1285-Y — deterministic draft tone / quality intelligence.

Advisory only; no LLM, no chain-of-thought. The service evaluates and proposes a
safe revision: em-dashes are removed from the suggested_revision, harsh/vague
text is flagged, intent is preserved by construction, and it never sends or
decides recipients.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _post(body):
    return client.post("/jobs/draft-tone", json=body)


def test_returns_closed_vocab_assessment():
    r = _post({"draft_text": "Hi Sam, could you review the launch checklist? Thanks.", "channel": "internal_message", "recipient_context": {"display_name": "Sam", "internal": True}})
    assert r.status_code == 200
    b = r.json()
    assert b["provider_mode"] == "PYTHON"
    assert b["tone_label"] in ("CLEAR", "WARM", "DIRECT", "TOO_HARSH", "TOO_VAGUE", "TOO_LONG", "NEEDS_CONTEXT", "EXECUTIVE_READY", "RISKY")
    assert 0 <= b["quality_score"] <= 100
    assert b["confidence"] in ("HIGH", "MEDIUM", "LOW")
    assert b["preserves_intent"] is True
    for f in b["risk_flags"]:
        assert f in ("EM_DASH", "HARSH_TONE", "BLAME_LANGUAGE", "AMBIGUOUS_RECIPIENT", "MISSING_CONTEXT", "TOO_MANY_WORDS", "POSSIBLE_POLICY_RISK", "EXTERNAL_SEND_REQUIRES_APPROVAL")


def test_removes_em_dashes_from_suggested_revision():
    r = _post({"draft_text": "We shipped the build — finally — and it works.", "channel": "internal_message", "recipient_context": {"internal": True}})
    b = r.json()
    assert "EM_DASH" in b["risk_flags"]
    assert "—" not in b["suggested_revision"]
    assert "–" not in b["suggested_revision"]


def test_flags_harsh_and_blame_tone():
    r = _post({"draft_text": "You failed to send this. This is unacceptable. Fix it ASAP.", "channel": "internal_message", "recipient_context": {"internal": True}})
    b = r.json()
    assert b["tone_label"] == "TOO_HARSH"
    assert "HARSH_TONE" in b["risk_flags"] or "BLAME_LANGUAGE" in b["risk_flags"]
    # Softened: the order/blame language is rephrased, not echoed verbatim.
    assert "ASAP" not in b["suggested_revision"]
    assert b["preserves_intent"] is True


def test_external_email_requires_approval():
    r = _post({"draft_text": "Please find the report attached.", "channel": "email", "recipient_context": {"display_name": "Client", "internal": False}})
    b = r.json()
    assert b["approval_required"] is True
    assert "EXTERNAL_SEND_REQUIRES_APPROVAL" in b["risk_flags"]


def test_flags_vague_text():
    r = _post({"draft_text": "do the thing", "channel": "internal_message", "recipient_context": {"internal": True}})
    b = r.json()
    assert "MISSING_CONTEXT" in b["risk_flags"]
    assert b["tone_label"] in ("TOO_VAGUE", "NEEDS_CONTEXT")


def test_rejects_extra_fields_and_empty_text():
    assert _post({"draft_text": "x", "channel": "internal_message", "bogus": 1}).status_code == 422
    assert _post({"draft_text": "", "channel": "internal_message"}).status_code == 422
    assert _post({"draft_text": "x", "channel": "carrier_pigeon"}).status_code == 422
