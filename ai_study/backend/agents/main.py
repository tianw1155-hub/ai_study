"""
DevPilot Python Agent Service (HTTP API)

接收 Go 后端的任务调度请求，用用户配置的 API Key 调用 LLM

启动：cd backend && python -m agents.main
端口：8081
"""

import os
import logging
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import httpx

from agents.dispatcher import Dispatcher  # noqa: E402 (module-level for testability)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Go 后端地址（写回结果用）
GO_API = os.environ.get("GO_API_URL", "http://localhost:8085")


# ─── Request / Response 模型 ───────────────────────────────────────

class ProcessRequest(BaseModel):
    requirement: str
    user_id: Optional[str] = "anonymous"
    language: Optional[str] = "python"
    framework: Optional[str] = ""
    llm_model: Optional[str] = ""
    api_key: Optional[str] = ""


class TaskSubmitRequest(BaseModel):
    task_id: str
    task: dict
    prd: Optional[str] = ""
    language: Optional[str] = "python"
    llm_model: Optional[str] = ""
    api_key: Optional[str] = ""


# ─── FastAPI App ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Agent service started on :8081")
    yield
    logger.info("Agent service shutting down")


app = FastAPI(title="DevPilot Agent Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent"}


@app.post("/process")
async def process_requirement(req: ProcessRequest, background: BackgroundTasks):
    """
    处理完整需求流程：PM → Coder → Tester
    这是一个后台任务，立即返回 task_id，结果由 Go 后端轮询
    """
    if not req.requirement or len(req.requirement) < 10:
        raise HTTPException(status_code=400, detail="Requirement too short")

    # 优先用请求体里的模型配置（用户刚在 setup 页面配置的）
    model = req.llm_model or ""
    api_key = req.api_key or ""

    # 如果请求体没有，尝试从 Go 后端获取（登录用户已存储的配置）
    if not model or not api_key:
        stored_model, stored_key = await fetch_user_model_config(req.user_id or "anonymous")
        model = model or stored_model
        api_key = api_key or stored_key

    if not model or not api_key:
        raise HTTPException(status_code=400, detail="模型配置缺失，请先在 /setup 页面配置 API Key")

    # 启动后台处理
    background.add_task(
        run_processing, req.requirement, req.user_id, req.language, req.framework, model, api_key
    )

    return {
        "status": "processing",
        "message": "Requirement is being processed",
        "user_id": req.user_id,
    }


# ─── Background processing ─────────────────────────────────────────

async def run_processing(
    requirement: str,
    user_id: str,
    language: str,
    framework: str,
    model: str,
    api_key: str,
):
    """后台运行完整流程（供 BackgroundTasks 调用）"""

    dispatcher = Dispatcher(model, api_key)
    try:
        result = await dispatcher.process_requirement(
            requirement, user_id, language, framework
        )
        logger.info(
            f"[{user_id}] Processing complete: success={result.get('success')}"
        )
        await report_to_go_backend(user_id, result)
    finally:
        await dispatcher.close()


async def fetch_user_model_config(user_id: str) -> tuple:
    """
    从 Go 后端获取用户的模型配置
    GET /api/users/{user_id}/model-config
    返回 {"llm_model": "...", "api_key": "..."}
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GO_API}/api/users/{user_id}/model-config", timeout=5.0
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("llm_model", ""), data.get("api_key", "")
    except Exception as e:
        logger.warning(
            f"fetch_user_model_config failed for {user_id}: {e} — using defaults"
        )
    return "", ""


async def report_to_go_backend(user_id: str, result: dict):
    """将处理结果报告给 Go 后端"""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{GO_API}/api/agent/result",
                json={"user_id": user_id, "result": result},
                timeout=10.0,
            )
    except Exception as e:
        logger.error(f"report_to_go_backend failed: {e}")


@app.post("/task/submit")
async def submit_task(req: TaskSubmitRequest):
    """接收单个任务处理请求（Coder Agent）"""
    if not req.llm_model or not req.api_key:
        raise HTTPException(
            status_code=400, detail="llm_model and api_key are required"
        )

    dispatcher = Dispatcher(req.llm_model, req.api_key)
    try:
        result = await dispatcher.process_single_task(req.task, req.prd)
        return result
    finally:
        await dispatcher.close()


@app.post("/task/{task_id}/cancel")
async def cancel_task(task_id: str):
    """取消任务（占位，供扩展）"""
    return {"status": "cancelled", "task_id": task_id}
