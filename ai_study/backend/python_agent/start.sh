#!/bin/bash
# Start Python Agent gRPC server with DeepSeek LLM

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Python Agent - DeepSeek LLM Integration"
echo "========================================"

# Generate proto Python files if not exists
if [ ! -f "agent_pb2.py" ] || [ ! -f "agent_pb2_grpc.py" ]; then
    echo "[1/3] Generating gRPC Python stubs..."
    python3 -m grpc_tools.protoc \
        -I../api \
        --python_out=. \
        --grpc_python_out=. \
        ../api/agent.proto
    
    # Fix import path for local module (ensure consistent import style)
    sed -i '' 's/from agent import agent_pb2 as agent__pb2/import agent_pb2 as agent__pb2/' agent_pb2_grpc.py 2>/dev/null || true
    echo "      Proto files generated."
else
    echo "[1/3] Proto files already exist, skipping..."
fi

# Check dependencies
echo "[2/3] Checking dependencies..."
python3 -c "import grpc; import openai" 2>/dev/null || {
    echo "      Installing dependencies..."
    python3 -m pip install -q -r requirements.txt
}
echo "      Dependencies OK."

# Start server
export DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "[3/3] WARNING: DEEPSEEK_API_KEY not set!"
    echo "      Get your key at: https://platform.deepseek.com"
    echo "      LLM calls will fail without it."
else
    echo "[3/3] DeepSeek API Key: configured"
fi

echo ""
echo "Starting gRPC server on 0.0.0.0:50051..."
echo "========================================"
python3 agent_server.py
