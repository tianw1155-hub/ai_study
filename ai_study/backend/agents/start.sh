#!/bin/bash
# Start DevPilot Python Agent Service

cd "$(dirname "$0")"

echo "Installing Python dependencies..."
pip install -q -r requirements.txt

echo "Starting Agent service on :8081..."
uvicorn agents.main:app --host 0.0.0.0 --port 8081 --reload
