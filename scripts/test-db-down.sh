#!/usr/bin/env bash
# Foundation test database teardown.
# Removes container + volumes for clean state.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Stopping and removing Postgres container + volumes..."
docker compose -f docker-compose.test.yml --env-file .env.test down -v

echo "==> Done."
