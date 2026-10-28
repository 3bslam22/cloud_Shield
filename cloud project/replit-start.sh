#!/usr/bin/env bash
set -euo pipefail

echo "==> Setting up Python environment"
if [ ! -d ".venv" ]; then
  python3.12 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

echo "==> Installing frontend dependencies"
corepack pnpm@11.25.0 install --frozen-lockfile

echo "==> Building React frontend"
corepack pnpm@11.25.0 build

echo "==> Starting CloudShield (FastAPI + built frontend)"
exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-3000}" --workers 1
