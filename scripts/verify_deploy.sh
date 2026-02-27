#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${1:-https://mylife-api.onrender.com}"
FRONTEND_URL="${2:-https://mylife-9js.pages.dev}"

echo "[1/3] Backend health check: ${BACKEND_URL}/api/v1/health"
backend_health="$(curl -fsS "${BACKEND_URL}/api/v1/health")"
echo "$backend_health"

echo "[2/3] Backend ping check: ${BACKEND_URL}/api/v1/ping"
backend_ping="$(curl -fsS "${BACKEND_URL}/api/v1/ping")"
echo "$backend_ping"

echo "[3/3] Frontend check: ${FRONTEND_URL}"
frontend_html="$(curl -fsS "${FRONTEND_URL}")"
if [[ "$frontend_html" == *"mylife"* ]] && [[ "$frontend_html" == *"React + FastAPI initial setup"* ]]; then
  echo "frontend OK"
else
  echo "frontend check failed"
  exit 1
fi

echo "Deploy verification passed."
