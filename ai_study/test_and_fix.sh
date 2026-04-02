#!/bin/bash
set -e
cd /Users/tianwei/.openclaw/workspace/ai_study

echo "=== 1. 检查 Docker 状态 ==="
docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "docker not available"

echo ""
echo "=== 2. 启动 docker-compose ==="
cd backend
docker-compose up -d
echo "等待服务启动..."
sleep 5
docker ps --format "table {{.Names}}\t{{.Status}}"

echo ""
echo "=== 3. 检查 .env 配置 ==="
echo "Backend PORT:"
grep "^PORT=" backend/.env 2>/dev/null || echo "PORT not set (default 8080)"
echo "Frontend NEXT_PUBLIC_API_URL:"
grep "NEXT_PUBLIC_API_URL" frontend/.env.local 2>/dev/null || echo "not set"

echo ""
echo "=== 4. 启动后端 ==="
JWT_SECRET=test_secret_123 go run ./cmd/api/main.go &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
sleep 5

echo ""
echo "=== 5. 健康检查 ==="
curl -s http://localhost:8084/health | head -c 200 || curl -s http://localhost:8080/health | head -c 200

echo ""
echo "=== 6. 测试 API ==="
echo "GET /health:"
curl -s http://localhost:8084/health 2>/dev/null || curl -s http://localhost:8080/health 2>/dev/null || echo "Backend not reachable"

echo ""
echo "=== 7. 端口检查 ==="
ss -tlnp 2>/dev/null | grep -E "8080|8084|8085|5432|7233" || netstat -tlnp 2>/dev/null | grep -E "8080|8084|8085|5432|7233" || lsof -i :8080 -i :8084 -i :8085 -i :5432 2>/dev/null

echo ""
echo "=== 8. 杀后台进程 ==="
jobs -l
