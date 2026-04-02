"""
Base Agent - 所有 Agent 的基类
"""

import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from .llm import LLMClient

logger = logging.getLogger(__name__)


class Agent(ABC):
    """Agent 基类"""

    def __init__(self, name: str, llm: LLMClient):
        self.name = name
        self.llm = llm

    @abstractmethod
    async def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """执行 Agent 逻辑，返回结果字典"""
        pass

    async def think(self, system_prompt: str, user_prompt: str, temp: float = 0.7) -> str:
        """调用 LLM，返回内容"""
        try:
            result = await self.llm.complete(system_prompt, user_prompt, temp)
            return result
        except Exception as e:
            logger.error(f"[{self.name}] LLM 调用失败: {e}")
            return ""


class Log:
    """结构化日志条目"""

    def __init__(self, agent: str, message: str, level: str = "INFO"):
        self.agent = agent
        self.message = message
        self.level = level

    def to_dict(self) -> Dict[str, str]:
        return {"agent": self.agent, "message": self.message, "level": self.level}
