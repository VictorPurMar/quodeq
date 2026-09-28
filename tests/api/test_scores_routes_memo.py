"""/scores ships one memoized wire payload per stamp; the detail route reads per kind."""
from __future__ import annotations

import pytest

from quodeq.api.app import create_app
from quodeq.shared.stamp_memo import StampCache


def _payload() -> dict:
    return {
        "accumulated": {"dimensions": [
            {"dimension": "security",
             "violations": [{"file": "a.py", "line": 1, "practiceId": "P1", "title": "t", "snippet": "s", "reason": "r", "context": "c", "reqRefs": []}],
             "compliance": [{"file": "b.py", "line": 2, "practiceId": "P1", "title": "ok", "snippet": "s", "reason": "r", "context": "c", "reqRefs": []}]},
        ], "summary": {}},
        "trend": [], "availableRuns": [], "scoring": {"customFormula": False},
    }


@pytest.fixture()
def served(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(tmp_path / "reports"))
    state = {"stamp": ("v1",), "calls": 0, "payload": _payload()}

    def fake_stamped(root, project, as_of=None, *a, **kw):
        state["calls"] += 1
        return state["payload"], state["stamp"]

    monkeypatch.setattr("quodeq.api._scores_routes.get_project_scores_stamped", fake_stamped)
    monkeypatch.setattr("quodeq.api._scores_routes._WIRE", StampCache())
    app = create_app(test_config={"TESTING": True})
    with app.test_client() as c:
        yield c, state


def test_same_stamp_serves_the_same_deferred_payload(served):
    c, state = served
    a = c.get("/api/projects/p/scores").get_json()
    b = c.get("/api/projects/p/scores").get_json()
    assert a == b
    v = a["accumulated"]["dimensions"][0]["violations"][0]
    assert v["detailDeferred"] is True and "snippet" not in v and "reqRefs" not in v
    assert state["calls"] == 2


def test_new_stamp_rebuilds(served):
    c, state = served
    c.get("/api/projects/p/scores")
    state["stamp"] = ("v2",)
    state["payload"]["accumulated"]["dimensions"][0]["violations"][0]["title"] = "changed"
    body = c.get("/api/projects/p/scores").get_json()
    assert body["accumulated"]["dimensions"][0]["violations"][0]["title"] == "changed"


def test_unchanged_stamp_keeps_the_memoized_body_even_if_the_source_mutates(served):
    c, state = served
    c.get("/api/projects/p/scores")
    state["payload"]["accumulated"]["dimensions"][0]["violations"][0]["title"] = "mutated"
    body = c.get("/api/projects/p/scores").get_json()
    assert body["accumulated"]["dimensions"][0]["violations"][0]["title"] == "t"


def test_detail_endpoint_serves_violations_and_compliance(served):
    c, _ = served
    v = c.get("/api/projects/p/compliance-detail?dimension=security&kind=violation").get_json()["items"]
    assert v[0]["snippet"] == "s" and v[0]["reqRefs"] == []
    comp = c.get("/api/projects/p/compliance-detail?dimension=security").get_json()["items"]
    assert comp[0]["file"] == "b.py" and comp[0]["reason"] == "r"
    assert c.get("/api/projects/p/compliance-detail?dimension=security&kind=other").status_code == 400
