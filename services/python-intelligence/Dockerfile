# NIOV Python Intelligence runtime — FastAPI + uvicorn.
#
# Build:
#   docker build -t niov/python-intelligence:dev services/python-intelligence
#
# Run:
#   docker run --rm -p 8000:8000 niov/python-intelligence:dev
#
# Health:
#   curl -s http://localhost:8000/health | jq

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Non-root user for runtime
RUN groupadd --system --gid 1001 niov && \
    useradd --system --uid 1001 --gid niov niov

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY app /app/app

USER niov

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request, sys; \
sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=3).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
