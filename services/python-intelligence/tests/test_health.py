from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "niov-python-intelligence"
    assert "version" in body


def test_health_rejects_extra_field_on_post():
    # /health is GET-only; ensure POST is not silently accepted
    response = client.post("/health", json={})
    assert response.status_code == 405


def test_interactive_docs_disabled():
    # Production posture: no /docs, /redoc, /openapi.json
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
