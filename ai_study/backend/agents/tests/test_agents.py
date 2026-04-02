"""
Tests for individual agents (PM, Coder, Tester)
LLM HTTP calls are mocked so these run fast without network.
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.llm import LLMClient
from agents.pm_agent import PMAgent
from agents.coder_agent import CoderAgent
from agents.tester_agent import TesterAgent
from agents.dispatcher import Dispatcher


# ─── LLM Client Tests ────────────────────────────────────────────

class TestLLMClient:
    """Test LLM client routes requests to correct API endpoints"""

    def test_openai_model_uses_openai_endpoint(self):
        client = LLMClient(model="gpt-4o", api_key="sk-test")
        assert "openai.com" in client.base_url
        assert client.path == "/chat/completions"

    def test_anthropic_model_uses_anthropic_endpoint(self):
        client = LLMClient(model="claude-3-5-sonnet-latest", api_key="sk-ant")
        assert "anthropic.com" in client.base_url
        assert client.path == "/messages"

    def test_google_model_uses_google_endpoint(self):
        client = LLMClient(model="gemini-2.0-flash", api_key="google-key")
        assert "googleapis.com" in client.base_url

    def test_minimax_model_uses_minimax_endpoint(self):
        client = LLMClient(model="minimax/M2.7", api_key="minimax-key")
        assert "minimax.chat" in client.base_url
        assert client.path == "/chat/completions"

    def test_unknown_model_falls_back_to_openai(self):
        client = LLMClient(model="unknown-model", api_key="key")
        assert "openai.com" in client.base_url  # fallback


# ─── PM Agent Tests ─────────────────────────────────────────────

class TestPMAgent:
    """Test PM Agent extracts tasks and PRD correctly"""

    @pytest.mark.asyncio
    async def test_pm_generates_prd(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value="# PRD\n## Features\n- [ ] Task 1\n- [ ] Task 2"
        )

        agent = PMAgent("PM", mock_llm)
        result = await agent.run({"requirement": "Build a REST API for user management"})

        assert result["success"] is True
        assert "PRD" in result["prd"]
        assert len(result["tasks"]) == 2
        assert result["tasks"][0]["title"] == "Task 1"

    @pytest.mark.asyncio
    async def test_pm_handles_llm_error(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(side_effect=Exception("LLM failed"))

        agent = PMAgent("PM", mock_llm)
        result = await agent.run({"requirement": "Build a REST API"})

        assert result["success"] is False
        # Error message reflects empty LLM output (graceful degradation)
        assert "empty" in result["error"] or "failed" in result["error"]

    @pytest.mark.asyncio
    async def test_pm_extracts_test_task_type(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value="# PRD\n- [ ] Write unit tests for the auth module"
        )

        agent = PMAgent("PM", mock_llm)
        result = await agent.run({"requirement": "Add tests for auth module"})

        assert any(t["type"] == "test" for t in result["tasks"])


# ─── Coder Agent Tests ────────────────────────────────────────────

class TestCoderAgent:
    """Test Coder Agent generates code from tasks"""

    @pytest.mark.asyncio
    async def test_coder_generates_code(self):
        mock_llm = MagicMock()
        # The code block must have a newline after ```python for the regex to match
        mock_llm.complete = AsyncMock(
            return_value="```\nfile: main.py\ndef hello():\n    return 'world'\n```"
        )

        agent = CoderAgent("Coder", mock_llm)
        result = await agent.run({
            "task": {"title": "Hello function", "type": "code"},
            "prd": "",
            "language": "python",
        })

        assert result["success"] is True
        assert len(result["files"]) >= 1
        assert "def hello" in result["files"][0]["content"]

    @pytest.mark.asyncio
    async def test_coder_extracts_multiple_code_blocks(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(return_value=(
            "```\nfile: main.py\ndef main(): pass\n```\n"
            "```\nfile: utils.py\ndef util(): pass\n```"
        ))

        agent = CoderAgent("Coder", mock_llm)
        result = await agent.run({
            "task": {"title": "Two files", "type": "code"},
            "language": "python",
        })

        assert len(result["files"]) == 2


# ─── Tester Agent Tests ───────────────────────────────────────────

class TestTesterAgent:
    """Test Tester Agent generates tests for code"""

    @pytest.mark.asyncio
    async def test_tester_requires_code_files(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock()

        agent = TesterAgent("Tester", mock_llm)
        result = await agent.run({
            "code_files": [],  # empty
            "task": {"title": "Test something"},
        })

        assert result["success"] is False
        assert "No code files" in result["error"]

    @pytest.mark.asyncio
    async def test_tester_generates_tests(self):
        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value="```\ndef test_hello():\n    assert hello() == 'world'\n```"
        )

        agent = TesterAgent("Tester", mock_llm)
        result = await agent.run({
            "code_files": [{"path": "main.py", "content": "def hello(): return 'world'"}],
            "task": {"title": "Test hello"},
        })

        assert result["success"] is True
        assert len(result["test_files"]) >= 1


# ─── Dispatcher Tests ────────────────────────────────────────────

class TestDispatcher:
    """Test Dispatcher coordinates PM → Coder → Tester"""

    @pytest.mark.asyncio
    async def test_dispatcher_full_flow(self):
        """Full flow: PM → Coder → Tester, returns all artifacts"""
        # Mock httpx.AsyncClient at the module where it's instantiated (llm.py)
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={
            "choices": [{"message": {"content": "# PRD\n- [ ] Task 1"}}]
        })

        mock_client = MagicMock()
        mock_post = AsyncMock(return_value=mock_response)
        mock_client.post = mock_post
        mock_client.aclose = AsyncMock()

        async def mock_async_enter():
            return mock_client
        mock_client.__aenter__ = mock_async_enter
        mock_client.__aexit__ = AsyncMock()

        with patch("agents.llm.httpx.AsyncClient", return_value=mock_client):
            dispatcher = Dispatcher("gpt-4o", "sk-test")
            result = await dispatcher.process_requirement(
                requirement="Build a login system",
                user_id="test",
                language="python",
            )

            assert result["success"] is True
            assert "PRD" in result["prd"]

            await dispatcher.close()

    @pytest.mark.asyncio
    async def test_dispatcher_single_task(self):
        """process_single_task only calls Coder"""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={
            "choices": [{"message": {"content": "```\ndef f(): pass\n```"}}]
        })

        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.aclose = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()

        with patch("agents.llm.httpx.AsyncClient", return_value=mock_client):
            dispatcher = Dispatcher("gpt-4o", "sk-test")
            result = await dispatcher.process_single_task(
                task={"title": "Single task", "type": "code"},
                prd="",
            )

            assert result["success"] is True
            assert len(result["files"]) >= 1

            await dispatcher.close()
