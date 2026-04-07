#!/bin/bash
# Rebuild and restart the ai_study backend

set -e

BACKEND_DIR="/Users/tianwei/.openclaw/workspace/ai_study/backend"
cd "$BACKEND_DIR"

echo "[1/4] Killing old backend on port 8080..."
kill $(lsof -ti:8080) 2>/dev/null || true
sleep 1

echo "[2/4] Building new binary..."
go build -o devpilot-api ./cmd/api/

echo "[3/4] Starting new backend..."
./devpilot-api &
sleep 2

echo "[4/4] Health check..."
curl -s http://localhost:8080/health && echo ""

echo ""
echo "Done! Backend is running on port 8080"
