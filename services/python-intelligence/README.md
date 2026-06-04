# NIOV Python Intelligence

FastAPI service that exposes the deterministic ranker + project-risk
forecaster the Foundation TS wrapper at
`apps/api/src/services/intelligence/python-ranking.service.ts`
consumes. No external LLM calls, no provider keys, no raw memory,
no chain-of-thought. TypeScript remains the sole policy /
approval / DMW / audit authority — this service only ranks
closed-vocab signals.

## Quick start

```sh
cd services/python-intelligence
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Point Foundation at it:

```sh
PYTHON_INTELLIGENCE_RUNTIME_URL=http://localhost:8000 \
PYTHON_RUNTIME_ENABLED=true \
  npm run dev   # from the Foundation repo root
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness probe |
| POST | `/rank-next-actions` | per-employee next-action ranking |
| POST | `/forecast/project-risk` | per-project risk forecaster |

The ranking endpoint URL matches what the Foundation TS wrapper
calls (`${PYTHON_INTELLIGENCE_RUNTIME_URL}/rank-next-actions`).

## Safety posture

- Pydantic schemas reject any extra field (so `chain_of_thought`,
  raw text, or unbounded blobs cannot sneak in).
- All reasons / risks / confidence labels are closed-vocab
  `Literal` types.
- `safe_title` strings are bounded to 200 characters.
- No employee scoring, no productivity ranking, no surveillance
  framing in the output.
- Interactive docs (`/docs`, `/redoc`, `/openapi.json`) are
  disabled in the FastAPI app.

## Docker

```sh
docker build -t niov/python-intelligence:dev services/python-intelligence
docker run --rm -p 8000:8000 niov/python-intelligence:dev
```

The image runs as a non-root user and includes a HEALTHCHECK
hitting `/health`.
