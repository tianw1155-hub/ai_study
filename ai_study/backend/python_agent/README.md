# Python Agent Stub

## 快速开始

### 1. 安装依赖

```bash
cd backend/python_agent
pip install -r requirements.txt
```

### 2. 生成 gRPC 代码 (可选)

如果 `agent_pb2.py` 和 `agent_pb2_grpc.py` 不存在，需要从 `agent.proto` 生成：

```bash
cd backend/python_agent
python -m grpc_tools.protoc \
    -I../api \
    --python_out=. \
    --grpc_python_out=. \
    ../api/agent.proto
```

这会生成:
- `agent_pb2.py` - 消息类型
- `agent_pb2_grpc.py` - 服务存根

### 3. 启动服务

```bash
python agent_server.py
# 默认监听 0.0.0.0:50051
```

## gRPC 接口说明

实现了 `agent.proto` 中定义的 5 个 RPC:

| RPC | 说明 | 当前状态 |
|-----|------|----------|
| `GeneratePRD` | PM Agent 生成 PRD | Mock 返回 |
| `GenerateCode` | Dev Agent 生成代码 | Mock 返回 |
| `GenerateTests` | Test Agent 生成测试用例 | Mock 返回 |
| `TriggerDeployment` | Ops Agent 触发部署 | Mock 返回 |
| `Ping` | 连通性测试 | 返回 pong |

## 生产环境改造

要实现真实的 LLM 调用，修改每个 RPC 方法中的 `TODO` 部分：

```python
def GeneratePRD(self, request, context):
    # 调用 DeepSeek/GPT API
    # llm_response = call_deepseek(prompt)
    # return agent_pb2.PRDResponse(...)
```

## Docker 集成

在 `docker-compose.yml` 中添加:

```yaml
python-agents:
  build: ./backend/python_agent
  ports:
    - "50051:50051"
  depends_on:
    - temporal
```

## 测试

```bash
# 启动 server
python agent_server.py &

# 测试 Ping
grpcurl -plaintext localhost:50051 agent.AgentService/Ping
```
