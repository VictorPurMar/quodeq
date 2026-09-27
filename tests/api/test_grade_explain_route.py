"""GET .../dimensions/<dimension>/explain serves the score stages per principle."""
from __future__ import annotations

from http import HTTPStatus

import pytest

from quodeq.api.app import create_app
from tests.api._scores_routes_helpers import _scorable_violations, _seed_run

_PROJECT = "proj"
_RUN = "run-1"


@pytest.fixture(autouse=True)
def _no_auth(monkeypatch):
    monkeypatch.delenv("QUODEQ_API_KEY", raising=False)


@pytest.fixture
def client(tmp_path, monkeypatch):
    evals = tmp_path / "evaluations"
    _seed_run(evals, _PROJECT, _RUN, _scorable_violations())
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    return create_app(static_dist=None, api_key=None).test_client()


def test_explain_route_returns_stages(client) -> None:
    resp = client.get(f"/api/projects/{_PROJECT}/runs/{_RUN}/dimensions/Security/explain")
    assert resp.status_code == HTTPStatus.OK
    body = resp.get_json()
    assert body["dimension"] == "Security"
    principle = body["principles"][0]
    assert principle["principleId"] == "P1"
    assert set(principle["stages"]) >= {"types", "base", "lift", "ceiling", "floor", "final", "grade"}


def test_explain_route_unknown_dimension_is_404(client) -> None:
    resp = client.get(f"/api/projects/{_PROJECT}/runs/{_RUN}/dimensions/usability/explain")
    assert (resp.status_code, resp.get_json()["code"]) == (HTTPStatus.NOT_FOUND, "NOT_FOUND")
    assert resp.get_json()["error"] == "Dimension not found"


def test_explain_route_unknown_run_is_404(client) -> None:
    resp = client.get(f"/api/projects/{_PROJECT}/runs/nope/dimensions/Security/explain")
    assert resp.status_code == HTTPStatus.NOT_FOUND


def test_explain_route_rejects_bad_segment(client) -> None:
    resp = client.get(f"/api/projects/{_PROJECT}/runs/{_RUN}/dimensions/..%2Fx/explain")
    assert resp.status_code in (HTTPStatus.BAD_REQUEST, HTTPStatus.NOT_FOUND)
