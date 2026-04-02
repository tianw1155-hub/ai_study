"""
LLM Layer - 调用用户配置的模型和 API Key
支持 OpenAI / Anthropic / Google / xAI 兼容接口
"""

import os
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class LLMClient:
    """统一的 LLM 客户端，支持多模型"""

    # 模型 → API 基础 URL 和路径
    MODEL_CONFIGS = {
        # OpenAI
        "gpt-4o": {"base_url": "https://api.openai.com/v1", "path": "/chat/completions"},
        "gpt-4o-mini": {"base_url": "https://api.openai.com/v1", "path": "/chat/completions"},
        "gpt-4-turbo": {"base_url": "https://api.openai.com/v1", "path": "/chat/completions"},
        # Anthropic
        "claude-3-5-sonnet-latest": {"base_url": "https://api.anthropic.com/v1", "path": "/messages"},
        "claude-3-5-haiku-latest": {"base_url": "https://api.anthropic.com/v1", "path": "/messages"},
        "claude-3-opus-latest": {"base_url": "https://api.anthropic.com/v1", "path": "/messages"},
        # Google
        "gemini-2.0-flash": {"base_url": "https://generativelanguage.googleapis.com/v1beta", "path": "/models"},
        "gemini-1.5-pro": {"base_url": "https://generativelanguage.googleapis.com/v1beta", "path": "/models"},
        # xAI / Grok
        "grok-3": {"base_url": "https://api.x.ai/v1", "path": "/chat/completions"},
        "grok-2": {"base_url": "https://api.x.ai/v1", "path": "/chat/completions"},
        # MiniMax
        "MiniMax-Text-01": {"base_url": "https://api.minimax.chat/v1", "path": "/chat/completions"},
        "abab6.5s-chat": {"base_url": "https://api.minimax.chat/v1", "path": "/chat/completions"},
        "abab6.5-chat": {"base_url": "https://api.minimax.chat/v1", "path": "/chat/completions"},
        "minimax/M2.7": {"base_url": "https://api.minimax.chat/v1", "path": "/chat/completions"},
    }

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key
        self.config = self.MODEL_CONFIGS.get(model, {})
        self.base_url = self.config.get("base_url", "https://api.openai.com/v1")
        self.path = self.config.get("path", "/chat/completions")
        self._client = httpx.AsyncClient(timeout=120.0)

    async def complete(self, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
        """发送对话，返回内容"""
        if "anthropic" in self.base_url:
            return await self._complete_anthropic(system_prompt, user_prompt, temperature)
        elif "google" in self.base_url:
            return await self._complete_google(system_prompt, user_prompt, temperature)
        else:
            return await self._complete_openai_compat(system_prompt, user_prompt, temperature)

    async def _complete_openai_compat(self, system: str, user: str, temp: float) -> str:
        """OpenAI 兼容接口（OpenAI / xAI / 本地代理）"""
        url = f"{self.base_url}{self.path}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temp,
        }
        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    async def _complete_anthropic(self, system: str, user: str, temp: float) -> str:
        """Anthropic Claude 接口"""
        url = f"{self.base_url}{self.path}"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "temperature": temp,
            "max_tokens": 4096,
        }
        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]

    async def _complete_google(self, system: str, user: str, temp: float) -> str:
        """Google Gemini 接口"""
        model_name = self.model.replace(".", "-")
        url = f"{self.base_url}/models/{model_name}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": f"[System] {system}\n\n[User] {user}"}]}],
            "generationConfig": {"temperature": temp, "maxOutputTokens": 4096},
        }
        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

    async def close(self):
        await self._client.aclose()
