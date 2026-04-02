#!/bin/bash
# 本地冒烟测试脚本 - 每次 commit 前手动跑或加到 pre-commit hook
# 用法: ./test_smoke.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_PID=""
FRONTEND_PID=""
FAILED=0

cleanup() {
  echo "🧹 清理进程..."
  [[ -n "$BACKEND_PID" ]] && kill $BACKEND_PID 2>/dev/null
  [[ -n "$FRONTEND_PID" ]] && kill $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT

echo "=== 1. 启动 PostgreSQL ==="
cd "$BACKEND_DIR"
docker-compose up -d postgres
for i in $(seq 1 30); do
  docker exec devpilot-postgres pg_isready -U devpilot -d devpilot 2>/dev/null && break
  sleep 1
done
echo "✅ PostgreSQL ready"

echo "=== 2. 启动后端 ==="
cd "$BACKEND_DIR"
PORT=8080 go run ./cmd/api/main.go &
BACKEND_PID=$!
for i in $(seq 1 15); do
  curl -sf http://localhost:8080/health 2>/dev/null && echo " ✅ 后端 ready on :8080" && break
  sleep 1
done

echo "=== 3. 启动前端 ==="
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
for i in $(seq 1 30); do
  curl -sf http://localhost:3000 -o /dev/null 2>/dev/null && echo " ✅ 前端 ready on :3000" && break
  sleep 2
done

echo "=== 4. 集成测试：提交需求（走前端代理→后端） ==="
RESPONSE=$(curl -sf -X POST http://localhost:3000/api/requirements/submit \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试需求：创建一个登录页面","user_id":"ci-test"}' 2>&1) && echo "$RESPONSE" | head -c 200
if echo "$RESPONSE" | grep -q "requirement_id\|task_id"; then
  echo ""
  echo "✅ 需求提交接口 OK"
else
  echo ""
  echo "❌ 需求提交接口失败: $RESPONSE"
  FAILED=1
fi

echo "=== 5. 集成测试：获取任务列表 ==="
TASKS=$(curl -sf http://localhost:3000/api/tasks 2>&1) && echo "✅ 任务列表接口 OK"
if [ $? -ne 0 ]; then
  echo "❌ 任务列表接口失败"
  FAILED=1
fi

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "🎉 所有测试通过！"
else
  echo ""
  echo "❌ 测试失败，请检查后端是否正常运行"
  exit 1
fi
