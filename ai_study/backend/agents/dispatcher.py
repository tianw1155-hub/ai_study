"""
Dispatcher - 任务调度器
负责协调 PM / Coder / Tester Agent 的执行流程
"""

import logging
from typing import Dict, Any
from .llm import LLMClient
from .pm_agent import PMAgent
from .coder_agent import CoderAgent
from .tester_agent import TesterAgent
from .base import Log

logger = logging.getLogger(__name__)


class Dispatcher:
    """
    调度器：接收任务，依次调度 PM → Coder → Tester
    每一步的结果存入 context 供下一步使用
    """

    def __init__(self, model: str, api_key: str):
        self.llm = LLMClient(model, api_key)
        self.pm = PMAgent("PM", self.llm)
        self.coder = CoderAgent("Coder", self.llm)
        self.tester = TesterAgent("Tester", self.llm)

    async def process_requirement(self, requirement: str, user_id: str = "anonymous", language: str = "python", framework: str = "") -> Dict[str, Any]:
        """
        处理完整的需求流程：
        1. PM 分析需求，生成 PRD，拆解任务
        2. Coder 根据每个子任务生成代码
        3. Tester 为代码生成测试用例
        """
        all_logs = [Log("Dispatcher", f"开始处理需求（用户: {user_id}）").to_dict()]

        context = {
            "requirement": requirement,
            "user_id": user_id,
            "language": language,
            "framework": framework,
        }

        # Step 1: PM Agent
        all_logs.append(Log("Dispatcher", "阶段1: PM Agent 分析需求").to_dict())
        pm_result = await self.pm.run(context)
        all_logs.extend([Log(l["agent"], l["message"], l.get("level", "INFO")).to_dict() for l in pm_result.get("logs", [])])

        if not pm_result.get("success"):
            return {
                "success": False,
                "error": pm_result.get("error", "PM Agent failed"),
                "logs": all_logs,
            }

        context["prd"] = pm_result["prd"]
        context["tasks"] = pm_result.get("tasks", [])

        # Step 2: Coder Agent（为每个子任务生成代码）
        all_logs.append(Log("Dispatcher", f"阶段2: Coder Agent 生成代码（{len(context['tasks'])} 个任务）").to_dict())
        code_results = []
        for i, task in enumerate(context["tasks"]):
            task_context = {
                **context,
                "task": task,
                "task_index": i,
            }
            coder_result = await self.coder.run(task_context)
            all_logs.extend([Log(l["agent"], l["message"], l.get("level", "INFO")).to_dict() for l in coder_result.get("logs", [])])
            code_results.append({
                "task": task,
                "result": coder_result,
            })

        # 汇总所有代码文件
        all_code_files = []
        for cr in code_results:
            if cr["result"].get("success"):
                all_code_files.extend(cr["result"].get("files", []))

        # Step 3: Tester Agent（为所有代码生成测试）
        all_logs.append(Log("Dispatcher", "阶段3: Tester Agent 生成测试用例").to_dict())
        if all_code_files:
            test_context = {
                **context,
                "code_files": [f for f in all_code_files if f.get("content")],
            }
            test_result = await self.tester.run(test_context)
            all_logs.extend([Log(l["agent"], l["message"], l.get("level", "INFO")).to_dict() for l in test_result.get("logs", [])])
        else:
            test_result = {"success": False, "error": "No code to test", "test_files": []}

        all_logs.append(Log("Dispatcher", "处理完成").to_dict())

        return {
            "success": True,
            "prd": context["prd"],
            "tasks": context["tasks"],
            "code_files": all_code_files,
            "test_files": test_result.get("test_files", []),
            "logs": all_logs,
        }

    async def process_single_task(self, task: Dict[str, Any], prd: str = "", code_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """处理单个任务（Coder Agent）"""
        context = {
            "task": task,
            "prd": prd,
            **(code_context or {}),
        }
        return await self.coder.run(context)

    async def close(self):
        await self.llm.close()
