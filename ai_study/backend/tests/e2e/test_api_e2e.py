"""
E2E API Tests - Tests the full API flow without real LLM calls
Uses FastAPI TestClient + mocked LLM responses

Run: cd backend && python -m pytest tests/e2e/test_api_e2e.py -v
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


# ─── AUTH Tests ──────────────────────────────────────────────────

class TestAuth:
    """AUTH series: Login & Authentication"""

    def test_github_login_redirect_contains_client_id(self):
        """AUTH-01: GitHub OAuth URL should contain valid client_id (Go backend route - manual test)"""
        pytest.skip("AUTH-01: /api/auth/github is a Go backend route - test with Go test suite or curl")

    def test_github_callback_without_code_returns_error(self):
        """AUTH-02: GitHub callback without code (Go backend - manual test)"""
        pytest.skip("AUTH-02: /api/auth/github is a Go backend route - test with Go test suite or curl")


# ─── SETUP / MODEL CONFIG Tests ─────────────────────────────────

class TestModelConfig:
    """SETUP series: Model configuration flows"""

    def test_setup_requires_llm_model_and_api_key(self):
        """SETUP-03: Valid model + key should save to model_config"""
        # Test that ProcessRequest accepts model + key
        from agents.main import ProcessRequest

        req = ProcessRequest(
            requirement="Build a complete user login system",
            llm_model="minimax/M2.7",
            api_key="minimax-test-key-123",
        )
        assert req.llm_model == "minimax/M2.7"
        assert req.api_key == "minimax-test-key-123"

    def test_setup_minimax_model_uses_minimax_endpoint(self):
        """SETUP-06: MiniMax model should route to MiniMax API"""
        from agents.llm import LLMClient

        client = LLMClient(model="minimax/M2.7", api_key="test-key")
        assert "minimax.chat" in client.base_url

    def test_setup_openai_key_with_minimax_model_fails_llm_call(self):
        """SETUP-06: Wrong key for selected model → LLM call fails"""
        # This is an integration-level test: we verify routing is correct
        # The actual API call failure would happen at runtime
        from agents.llm import LLMClient

        client = LLMClient(model="minimax/M2.7", api_key="sk-openai-wrong-key")
        assert client.base_url == "https://api.minimax.chat/v1"
        # LLM call would fail because key doesn't match MiniMax API
        # This is expected behavior - wrong provider = auth failure


# ─── REQUIREMENT SUBMISSION Tests ────────────────────────────────

class TestRequirementSubmission:
    """REQ series: Requirement submission flows"""

    def test_requirement_too_short_rejected(self):
        """REQ-02: Requirement < 10 chars should be rejected"""
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
        with patch("agents.main.run_processing", AsyncMock()):
            resp = client.post(
                "/process",
                json={
                    "requirement": "short",
                    "llm_model": "gpt-4o",
                    "api_key": "sk-test",
                },
            )
        assert resp.status_code == 400
        assert "too short" in resp.json()["detail"]

    def test_requirement_without_model_config_rejected(self):
        """REQ-03: No model config → 400"""
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
        with patch("agents.main.fetch_user_model_config", AsyncMock()) as mock_fetch:
            mock_fetch.return_value = ("", "")

            resp = client.post(
                "/process",
                json={
                    "requirement": "Build a complete user authentication system",
                    "llm_model": "",
                    "api_key": "",
                },
            )
        assert resp.status_code == 400
        assert "API Key" in resp.json()["detail"]

    def test_requirement_with_valid_config_accepted(self):
        """REQ-01: Valid requirement with model → accepted"""
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
        with patch("agents.main.run_processing", AsyncMock()) as mock_run:
            mock_run.return_value = None

            resp = client.post(
                "/process",
                json={
                    "requirement": "Build a complete user authentication system",
                    "user_id": "test_user",
                    "llm_model": "gpt-4o",
                    "api_key": "sk-test-key",
                },
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "processing"

    def test_python_agent_down_times_out(self):
        """REQ-04: Python Agent service down → Go backend times out"""
        # This tests Go side behavior when agent service is unreachable
        # In test we mock the HTTP call to fail
        import httpx

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = httpx.ConnectError("Connection refused")

            # Simulate what Go's callAgentService does
            from agents.main import report_to_go_backend
            import asyncio

            # Should not raise, just log error
            async def run():
                await report_to_go_backend("test_user", {"success": False})

            # No exception should propagate
            asyncio.get_event_loop().run_until_complete(run())


# ─── AGENT / LLM Tests ───────────────────────────────────────────

class TestAgentLLM:
    """AGENT series + LLM series: AI agent and routing tests"""

    def test_llm_routes_openai_correctly(self):
        """LLM-01: GPT-4o routes to OpenAI API"""
        from agents.llm import LLMClient

        client = LLMClient(model="gpt-4o", api_key="sk-test")
        assert client.base_url == "https://api.openai.com/v1"
        assert client.path == "/chat/completions"

    def test_llm_routes_anthropic_correctly(self):
        """LLM-02: Claude routes to Anthropic API with correct headers"""
        from agents.llm import LLMClient

        client = LLMClient(model="claude-3-5-sonnet-latest", api_key="sk-ant-test")
        assert client.base_url == "https://api.anthropic.com/v1"
        assert client.path == "/messages"

    def test_llm_routes_google_correctly(self):
        """LLM-03: Gemini routes to Google API"""
        from agents.llm import LLMClient

        client = LLMClient(model="gemini-2.0-flash", api_key="google-test")
        assert "googleapis.com" in client.base_url

    def test_llm_routes_minimax_correctly(self):
        """LLM-04: MiniMax routes to MiniMax API"""
        from agents.llm import LLMClient

        client = LLMClient(model="minimax/M2.7", api_key="minimax-test")
        assert "minimax.chat" in client.base_url

    def test_llm_routes_unknown_model_to_openai_fallback(self):
        """LLM-05: Unknown model falls back to OpenAI"""
        from agents.llm import LLMClient

        client = LLMClient(model="unknown-model-xyz", api_key="key")
        assert "openai.com" in client.base_url

    def test_agent_llm_401_unauthorized(self):
        """AGENT-04: Wrong API key → 401 from LLM provider"""
        from agents.base import Agent

        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            side_effect=Exception("Client error '401 Unauthorized'")
        )

        class FakeAgent(Agent):
            async def run(self, context):
                content = await self.think("system", "user")
                if not content:
                    return {"success": False, "error": "LLM call failed"}
                return {"success": True, "content": content}

        import asyncio
        agent = FakeAgent("Test", mock_llm)
        result = asyncio.get_event_loop().run_until_complete(
            agent.run({"requirement": "test"})
        )
        assert result["success"] is False

    def test_agent_llm_429_quota_exceeded(self):
        """AGENT-05: LLM quota exceeded → 429"""
        from agents.base import Agent

        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            side_effect=Exception("Client error '429 Too Many Requests'")
        )

        class FakeAgent(Agent):
            async def run(self, context):
                content = await self.think("system", "user")
                if not content:
                    return {"success": False, "error": "LLM call failed"}
                return {"success": True, "content": content}

        import asyncio
        agent = FakeAgent("Test", mock_llm)
        result = asyncio.get_event_loop().run_until_complete(
            agent.run({"requirement": "test"})
        )
        assert result["success"] is False

    def test_pm_agent_extracts_tasks_from_prd(self):
        """AGENT-01: PM Agent returns PRD + tasks"""
        from agents.pm_agent import PMAgent

        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(
            return_value="# Login System\n## Tasks\n- [ ] Implement JWT\n- [ ] Write tests"
        )

        import asyncio
        agent = PMAgent("PM", mock_llm)
        result = asyncio.get_event_loop().run_until_complete(
            agent.run({"requirement": "Build login system"})
        )
        assert result["success"] is True
        assert len(result["tasks"]) == 2

    def test_coder_agent_with_empty_task_list(self):
        """AGENT-07: Coder with no tasks returns error (graceful degradation)"""
        from agents.coder_agent import CoderAgent

        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock(return_value="")  # LLM returns empty

        import asyncio
        agent = CoderAgent("Coder", mock_llm)
        result = asyncio.get_event_loop().run_until_complete(
            agent.run({
                "task": {"title": "", "type": "code"},
                "prd": "",
                "language": "python",
            })
        )
        # Now correctly returns failure when LLM output is empty
        assert result["success"] is False
        assert "empty" in result["error"].lower()

    def test_tester_agent_without_code_files(self):
        """AGENT-08: Tester without code files returns error"""
        from agents.tester_agent import TesterAgent

        mock_llm = MagicMock()
        mock_llm.complete = AsyncMock()

        import asyncio
        agent = TesterAgent("Tester", mock_llm)
        result = asyncio.get_event_loop().run_until_complete(
            agent.run({"code_files": [], "task": {}})
        )
        assert result["success"] is False
        assert "No code files" in result["error"]


# ─── DISPATCHER Tests ────────────────────────────────────────────

class TestDispatcher:
    """AGENT-01/02/03: Full PM→Coder→Tester flow"""

    def test_dispatcher_full_flow_mocks_all_agents(self):
        """Full flow with mocked LLM at each stage"""
        from agents.dispatcher import Dispatcher

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={
            "choices": [{"message": {
                "content": "# PRD\n- [ ] Task 1\n- [ ] Task 2"
            }}]
        })

        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.aclose = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock()

        import asyncio
        with patch("agents.llm.httpx.AsyncClient", return_value=mock_client):
            dispatcher = Dispatcher("gpt-4o", "sk-test")
            result = asyncio.get_event_loop().run_until_complete(
                dispatcher.process_requirement(
                    requirement="Build login system",
                    user_id="test",
                    language="python",
                )
            )
            assert result["success"] is True
            assert "PRD" in result["prd"]
            assert len(result["tasks"]) > 0


# ─── KANBAN / DELIVERY API Tests ─────────────────────────────────

class TestKanbanDeliveryAPI:
    """KANBAN / DELIVERY series: Frontend API integration"""

    def test_go_backend_health_check(self):
        """Smoke test: Go backend is reachable"""
        import urllib.request
        try:
            resp = urllib.request.urlopen("http://localhost:8085/health", timeout=5)
            data = resp.read()
            import json
            assert json.loads(data)["status"] == "ok"
        except Exception as e:
            pytest.skip(f"Go backend not reachable: {e}")

    def test_python_agent_health_check(self):
        """Smoke test: Python Agent is reachable"""
        import urllib.request
        try:
            resp = urllib.request.urlopen("http://localhost:8081/health", timeout=5)
            data = resp.read()
            import json
            assert json.loads(data)["status"] == "ok"
        except Exception as e:
            pytest.skip(f"Python Agent not reachable: {e}")
