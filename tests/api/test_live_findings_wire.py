"""Wire shaping for GET .../runs/<run>/live-findings: camelCase, slim rows."""
from __future__ import annotations

from http import HTTPStatus

from flask import Flask

from quodeq.api.live_findings_wire import LIVE_FINDING_KEYS, live_findings_response
from quodeq.core.types import Finding
from quodeq.services.live_findings import LiveFindingState

STORED_ROW = {
    "practiceId": "Authenticity", "req": "S-AUT-3", "file": "src/a.py", "line": 12, "endLine": 14,
    "severity": "minor", "title": "Path traversal", "snippet": "Path(x)", "context": "def f():",
    "reason": "because", "reqRefs": [{"label": "CWE-22", "url": "https://cwe.mitre.org/22"}],
    "confidence": 25, "carriedForward": False, "provenanceDowngrade": False,
}

LIVE_ROW = Finding(
    practice_id="P1", verdict="violation", file="a.py", line=10,
    title="Bad thing", reason="explanation", severity="major",
)


def _body(payload):
    app = Flask(__name__)
    with app.app_context():
        result = live_findings_response(payload)
        if isinstance(result, tuple):
            resp, status = result
        else:
            resp, status = result, HTTPStatus.OK
        return resp.get_json(), status


def test_none_is_404() -> None:
    body, status = _body(None)
    assert status == HTTPStatus.NOT_FOUND
    assert body["code"] == "NOT_FOUND"


def test_stored_rows_are_slimmed() -> None:
    body, status = _body({"project": "p", "runId": "r", "dimensions": {
        "security": {"state": LiveFindingState.READY, "violations": [STORED_ROW]},
    }})
    assert status == HTTPStatus.OK
    (row,) = body["dimensions"]["security"]["violations"]
    assert set(row) <= set(LIVE_FINDING_KEYS)
    assert row["file"] == "src/a.py" and row["line"] == 12 and row["practiceId"] == "Authenticity"
    assert row["severity"] == "minor" and row["title"] == "Path traversal" and row["confidence"] == 25
    for dropped in ("context", "snippet", "reason", "reqRefs"):
        assert dropped not in row


def test_live_rows_are_camelized_and_slimmed() -> None:
    body, _ = _body({"project": "p", "runId": "r", "dimensions": {
        "security": {"state": LiveFindingState.READY, "violations": [LIVE_ROW]},
    }})
    (row,) = body["dimensions"]["security"]["violations"]
    assert row["practiceId"] == "P1" and row["file"] == "a.py" and row["severity"] == "major"
    assert "reason" not in row and "verdict" not in row


def test_absent_optional_keys_are_omitted_not_null() -> None:
    body, _ = _body({"project": "p", "runId": "r", "dimensions": {
        "security": {"state": LiveFindingState.READY, "violations": [LIVE_ROW]},
    }})
    (row,) = body["dimensions"]["security"]["violations"]
    assert "endLine" not in row and "req" not in row and "scope" not in row


def test_waiting_and_missing_pass_through() -> None:
    body, _ = _body({"project": "p", "runId": "r", "dimensions": {
        "usability": {"state": LiveFindingState.WAITING, "violations": []},
        "made-up": {"state": LiveFindingState.MISSING, "violations": []},
    }})
    assert body["project"] == "p" and body["runId"] == "r"
    assert body["dimensions"]["usability"] == {"state": "waiting", "violations": []}
    assert body["dimensions"]["made-up"] == {"state": "missing", "violations": []}
