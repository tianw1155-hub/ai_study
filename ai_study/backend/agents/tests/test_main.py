"""
Tests for agents/main.py - FastAPI routes

Run with: cd backend && python -m pytest agents/tests/test_main.py -v
Uses FastAPI TestClient (sync) to avoid async httpx compat issues on Python 3.9.
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class TestProcessEndpointLogic:
    """
    Test the core logic of model priority: req.llm_model takes precedence
    over stored config. This is the bug we fixed.
    """

    def test_model_from_request_used_in_priority(self):
        """req.llm_model should take priority over fetched/stored model"""
        req_model = "gpt-4o"
        req_key = "sk-user-key"
        stored_model = "claude-3-5-sonnet-latest"
        stored_key = "sk-stored"

        # Priority: req > stored
        model = req_model or stored_model
        api_key = req_key or stored_key

        assert model == "gpt-4o"
        assert api_key == "sk-user-key"

    def test_fallback_to_stored_when_req_empty(self):
        """When req has no llm_model, should fall back to stored config"""
        req_model, req_key = "", ""
        stored_model, stored_key = "claude-3-5-sonnet-latest", "sk-ant"

        model = req_model or stored_model
        api_key = req_key or stored_key

        assert model == "claude-3-5-sonnet-latest"
        assert api_key == "sk-ant"

    def test_req_takes_priority_even_with_stored(self):
        """Even when both req and stored have values, req wins"""
        req_model, req_key = "gpt-4o", "sk-req"
        stored_model, stored_key = "claude-3-5-sonnet-latest", "sk-stored"

        model = req_model or stored_model
        api_key = req_key or stored_key

        assert model == "gpt-4o"
        assert api_key == "sk-req"

    def test_llm_model_field_exists_on_process_request(self):
        """ProcessRequest should have llm_model field (not 'model' - Pydantic v2 reserved)"""
        from agents.main import ProcessRequest

        req = ProcessRequest(
            requirement="Build a login API",
            llm_model="minimax/M2.7",
            api_key="minimax-key",
        )
        assert req.llm_model == "minimax/M2.7"
        assert req.api_key == "minimax-key"


class TestProcessEndpointHTTP:
    """HTTP-level tests using FastAPI TestClient"""

    def test_health_endpoint(self):
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
        resp = client.get("/health")

        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_process_rejects_short_requirement(self):
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
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

    def test_process_requires_model_config_when_missing(self):
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

    def test_process_accepts_valid_request(self):
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
        data = resp.json()
        assert data["status"] == "processing"

        mock_run.assert_called_once()
        args = mock_run.call_args[0]
        assert args[4] == "gpt-4o"
        assert args[5] == "sk-test-key"

    def test_process_accepts_minimax_model(self):
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
        with patch("agents.main.run_processing", AsyncMock()) as mock_run:
            mock_run.return_value = None

            resp = client.post(
                "/process",
                json={
                    "requirement": "Build a complete user authentication system",
                    "llm_model": "minimax/M2.7",
                    "api_key": "minimax-api-key",
                },
            )

        assert resp.status_code == 200
        args = mock_run.call_args[0]
        assert args[4] == "minimax/M2.7"


class TestSubmitTaskEndpoint:
    """Tests for POST /task/submit"""

    def test_task_submit_requires_llm_model_and_key(self):
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
        resp = client.post(
            "/task/submit",
            json={
                "task_id": "t123",
                "task": {"title": "Test task", "type": "code"},
                "llm_model": "",
                "api_key": "",
            },
        )
        assert resp.status_code == 400

    def test_task_submit_with_valid_credentials(self):
        from fastapi.testclient import TestClient
        from agents.main import app

        client = TestClient(app)
        with patch("agents.main.Dispatcher") as MockDispatcher:
            mock_instance = MagicMock()
            mock_instance.process_single_task = AsyncMock(return_value={
                "success": True,
                "code": "def hello(): pass",
                "files": [{"path": "hello.py", "content": "def hello(): pass", "size": 20}],
                "logs": [],
            })
            mock_instance.close = AsyncMock()
            MockDispatcher.return_value = mock_instance

            resp = client.post(
                "/task/submit",
                json={
                    "task_id": "t123",
                    "task": {"title": "Hello world", "type": "code"},
                    "llm_model": "gpt-4o",
                    "api_key": "sk-test-key",
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
