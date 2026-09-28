"""Tests for quodeq.api.routes_project_data — dashboard/accumulated/eval/violation routes."""
from __future__ import annotations

from unittest.mock import ANY, MagicMock, patch

import pytest
from flask import Flask

from quodeq.api.routes_project_data import register_project_data_routes
from quodeq.core.types import EvalPending


@pytest.fixture
def client():
    app = Flask(__name__)
    provider = MagicMock()
    with patch("quodeq.api.routes_project_data.reports_dir", return_value="/tmp/reports"):
        register_project_data_routes(app, provider)
    app.config["TESTING"] = True
    with app.test_client() as c:
        c._provider = provider
        yield c


class TestDashboardRoute:
    def test_success(self, client):
        client._provider.get_dashboard.return_value = {"score": 85}
        resp = client.get("/api/projects/myproj/dashboard")
        assert resp.status_code == 200

    def test_not_found(self, client):
        client._provider.get_dashboard.side_effect = FileNotFoundError
        resp = client.get("/api/projects/myproj/dashboard")
        assert resp.status_code == 404

    def test_with_run_param(self, client):
        client._provider.get_dashboard.return_value = {"score": 90}
        resp = client.get("/api/projects/myproj/dashboard?run=run123")
        assert resp.status_code == 200

    def test_invalid_project(self, client):
        resp = client.get("/api/projects/..secret/dashboard")
        assert resp.status_code == 400

    def test_invalid_project_names_the_parameter(self, client):
        resp = client.get("/api/projects/..secret/dashboard")
        body = resp.get_json()
        assert body["code"] == "INVALID_INPUT"
        assert body["error"] == "project must be a plain path segment, got '..secret'"


class TestAccumulatedRoute:
    def test_success(self, client):
        client._provider.get_accumulated.return_value = {"dims": []}
        resp = client.get("/api/projects/myproj/accumulated")
        assert resp.status_code == 200

    def test_not_found(self, client):
        client._provider.get_accumulated.return_value = None
        resp = client.get("/api/projects/myproj/accumulated")
        assert resp.status_code == 404

    def test_with_as_of(self, client):
        client._provider.get_accumulated.return_value = {"dims": []}
        resp = client.get("/api/projects/myproj/accumulated?asOf=2024-01-01")
        assert resp.status_code == 200


class TestDimensionEvalRoute:
    def test_success(self, client):
        client._provider.get_dimension_eval.return_value = {"findings": []}
        resp = client.get("/api/projects/p/runs/r/dimensions/d/eval")
        assert resp.status_code == 200

    def test_not_found(self, client):
        client._provider.get_dimension_eval.return_value = None
        resp = client.get("/api/projects/p/runs/r/dimensions/d/eval")
        assert resp.status_code == 404

    def test_waiting(self, client):
        client._provider.get_dimension_eval.return_value = EvalPending(project="p", run_id="r", dimension="d")
        resp = client.get("/api/projects/p/runs/r/dimensions/d/eval")
        assert resp.status_code == 202

    def test_invalid_params(self, client):
        resp = client.get("/api/projects/..evil/runs/r/dimensions/d/eval")
        assert resp.status_code == 400

    def test_invalid_run_id_names_the_parameter(self, client):
        # Validated one at a time: project is fine, run_id is the culprit.
        resp = client.get("/api/projects/p/runs/foo..bar/dimensions/d/eval")
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] == "INVALID_INPUT"
        assert body["error"] == "run_id must be a plain path segment, got 'foo..bar'"

    def test_invalid_dimension_names_the_parameter(self, client):
        resp = client.get("/api/projects/p/runs/r/dimensions/foo..bar/eval")
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] == "INVALID_INPUT"
        assert body["error"] == "dimension must be a plain path segment, got 'foo..bar'"


class TestRunViolationsRoute:
    def test_success(self, client):
        from quodeq.core.types import ViolationSummary
        client._provider.get_violations.return_value = ViolationSummary()
        resp = client.get("/api/projects/p/runs/r/violations")
        assert resp.status_code == 200

    def test_not_found(self, client):
        client._provider.get_violations.side_effect = FileNotFoundError
        resp = client.get("/api/projects/p/runs/r/violations")
        assert resp.status_code == 404


class TestLiveFindingsRoute:
    URL = "/api/projects/p/runs/r/live-findings"

    def test_success_passes_dimensions_through(self, client):
        client._provider.get_live_findings.return_value = {
            "project": "p", "runId": "r",
            "dimensions": {"security": {"state": "ready", "violations": [{"file": "a.py"}]}},
        }
        resp = client.get(f"{self.URL}?dimensions=security,usability")
        assert resp.status_code == 200
        assert resp.get_json()["dimensions"]["security"]["violations"] == [{"file": "a.py"}]
        client._provider.get_live_findings.assert_called_once_with(ANY, "p", "r", ["security", "usability"])

    def test_dimensions_param_is_deduped_and_trimmed(self, client):
        client._provider.get_live_findings.return_value = {"project": "p", "runId": "r", "dimensions": {}}
        resp = client.get(f"{self.URL}?dimensions=a,,a, b ,")
        assert resp.status_code == 200
        client._provider.get_live_findings.assert_called_once_with(ANY, "p", "r", ["a", "b"])

    def test_missing_dimensions_is_400(self, client):
        resp = client.get(self.URL)
        assert resp.status_code == 400
        assert resp.get_json()["code"] == "INVALID_INPUT"

    def test_empty_dimensions_is_400(self, client):
        resp = client.get(f"{self.URL}?dimensions=,,")
        assert resp.status_code == 400

    def test_invalid_dimension_segment_is_400(self, client):
        resp = client.get(f"{self.URL}?dimensions=security,..evil")
        assert resp.status_code == 400
        assert "dimensions" in resp.get_json()["error"]

    def test_invalid_run_id_is_400(self, client):
        resp = client.get("/api/projects/p/runs/foo..bar/live-findings?dimensions=security")
        assert resp.status_code == 400

    def test_missing_run_is_404(self, client):
        client._provider.get_live_findings.return_value = None
        resp = client.get(f"{self.URL}?dimensions=security")
        assert resp.status_code == 404
