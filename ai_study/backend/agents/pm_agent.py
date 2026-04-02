"""
PM Agent - 产品经理 Agent
负责分析需求、拆解任务、生成 PRD
"""

from typing import Dict, Any
from .base import Agent, Log

PM_SYSTEM_PROMPT = """你是一个资深产品经理，擅长将用户模糊的需求转化为结构清晰的 PRD。

输出要求：
1. 先分析需求的完整性和细节
2. 识别关键技术难点和风险
3. 拆解为可执行的任务列表
4. 最终输出一份完整的 PRD（Markdown 格式）

PRD 必须包含：
- # 需求标题
- ## 需求概述（背景、目标、范围）
- ## 功能详细描述（每个功能的交互逻辑、输入输出）
- ## 用户故事（User Story 格式）
- ## 技术约束与依赖
- ## 任务拆解（列出每个子任务，供 Coder 执行）"""


class PMAgent(Agent):
    """PM Agent：分析需求，拆解任务"""

    async def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        logs = [Log(self.name, "PM Agent: 开始分析需求").to_dict()]

        requirement = context["requirement"]
        user_id = context.get("user_id", "anonymous")

        logs.append(Log(self.name, f"PM Agent: 正在分析需求（{len(requirement)}字符）").to_dict())

        user_prompt = f"""用户原始需求：
{requirement}

请根据以上需求，生成完整的 PRD，并拆解出具体的开发任务。"""

        try:
            prd_content = await self.think(PM_SYSTEM_PROMPT, user_prompt, temp=0.7)
            if not prd_content:
                logs.append(Log(self.name, "PM Agent: LLM 返回为空", "ERROR").to_dict())
                return {"success": False, "error": "LLM returned empty content", "logs": logs}
            logs.append(Log(self.name, "PM Agent: PRD 生成完成").to_dict())

            # 尝试从 PRD 中提取任务列表
            tasks = self._extract_tasks(prd_content)
            logs.append(Log(self.name, f"PM Agent: 拆解出 {len(tasks)} 个子任务").to_dict())

            return {
                "success": True,
                "prd": prd_content,
                "tasks": tasks,
                "logs": logs,
            }
        except Exception as e:
            logs.append(Log(self.name, f"PM Agent: 失败 - {e}", "ERROR").to_dict())
            return {"success": False, "error": str(e), "logs": logs}

    def _extract_tasks(self, prd: str) -> list:
        """从 PRD 文本中提取任务列表"""
        tasks = []
        lines = prd.split("\n")
        for line in lines:
            line = line.strip()
            # 识别任务列表项（- [ ] task 或 - task）
            if line.startswith("- [ ]") or line.startswith("- "):
                task_text = line.lstrip("- [] ").strip()
                if task_text and len(task_text) > 5:
                    tasks.append({
                        "title": task_text,
                        "type": self._infer_task_type(task_text),
                        "priority": "medium",
                    })
        # 如果没找到任务列表，手动根据 PRD 内容推断
        if not tasks:
            tasks = [
                {"title": "搭建项目基础结构", "type": "code", "priority": "high"},
                {"title": "实现核心业务逻辑", "type": "code", "priority": "high"},
                {"title": "编写单元测试", "type": "test", "priority": "medium"},
                {"title": "编写集成测试", "type": "test", "priority": "medium"},
            ]
        return tasks

    def _infer_task_type(self, task_text: str) -> str:
        """根据任务文本推断类型"""
        text = task_text.lower()
        if any(k in text for k in ["测试", "test", "验证", "校验"]):
            return "test"
        if any(k in text for k in ["部署", "deploy", "发布", "上线"]):
            return "deploy"
        if any(k in text for k in ["文档", "doc", "readme"]):
            return "document"
        return "code"
