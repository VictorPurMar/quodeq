"""Wire shaping for GET .../runs/<run>/live-findings: camelCase rows, since offsets."""
from __future__ import annotations

from http import HTTPStatus

from flask import Flask

from quodeq.api.live_findings_wire import live_findings_response
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


def _body(payload, since=None):
    app = Flask(__name__)
    with app.app_context():
        result = live_findings_response(payload, since)
        if isinstance(result, tuple):
            resp, status = result
        else:
            resp, status = result, HTTPStatus.OK
        return resp.get_json(), status


def test_none_is_404() -> None:
    body, status = _body(None)
    assert status == HTTPStatus.NOT_FOUND
    assert body["code"] == "NOT_FOUND"


def test_stored_rows_keep_every_field() -> None:
    # The feed's expanded row renders reason, reqRefs, context and snippet
    # (components/findingDetail.jsx), so rows go through whole; only the
    # report-level principles/compliance are left out of this endpoint.
    body, status = _body({"project": "p", "runId": "r", "dimensions": {
        "security": {"state": LiveFindingState.READY, "violations": [STORED_ROW]},
    }})
    assert status == HTTPStatus.OK
    (row,) = body["dimensions"]["security"]["violations"]
    assert row == STORED_ROW


def test_live_rows_are_camelized() -> None:
    body, _ = _body({"project": "p", "runId": "r", "dimensions": {
        "security": {"state": LiveFindingState.READY, "violations": [LIVE_ROW]},
    }})
    (row,) = body["dimensions"]["security"]["violations"]
    assert row["practiceId"] == "P1" and row["file"] == "a.py" and row["severity"] == "major"
    assert row["reason"] == "explanation"


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
    assert body["dimensions"]["usability"] == {"state": "waiting", "violations": [], "count": 0, "since": 0}
    assert body["dimensions"]["made-up"] == {"state": "missing", "violations": [], "count": 0, "since": 0}


def test_error_state_passes_through() -> None:
    body, status = _body({"project": "p", "runId": "r", "dimensions": {
        "security": {"state": LiveFindingState.ERROR, "violations": []},
    }})
    assert status == HTTPStatus.OK
    assert body["dimensions"]["security"] == {"state": "error", "violations": [], "count": 0, "since": 0}


def _dims_with(rows):
    return {"project": "p", "runId": "r", "dimensions": {
        "security": {"state": LiveFindingState.READY, "violations": rows},
    }}


def _rows(n):
    return [{**STORED_ROW, "line": i} for i in range(n)]


class TestSinceOffsets:
    def test_no_since_returns_every_row_with_count(self) -> None:
        body, _ = _body(_dims_with(_rows(3)))
        entry = body["dimensions"]["security"]
        assert entry["count"] == 3 and entry["since"] == 0
        assert [r["line"] for r in entry["violations"]] == [0, 1, 2]

    def test_second_call_returns_only_rows_after_since(self) -> None:
        first, _ = _body(_dims_with(_rows(3)))
        second, _ = _body(_dims_with(_rows(5)), {"security": first["dimensions"]["security"]["count"]})
        entry = second["dimensions"]["security"]
        assert entry["count"] == 5 and entry["since"] == 3
        first_lines = {r["line"] for r in first["dimensions"]["security"]["violations"]}
        second_lines = {r["line"] for r in entry["violations"]}
        assert second_lines == {3, 4} and not (first_lines & second_lines)

    def test_second_call_bytes_scale_with_new_rows_not_total(self) -> None:
        import json
        full, _ = _body(_dims_with(_rows(50)))
        delta, _ = _body(_dims_with(_rows(52)), {"security": 50})
        assert len(json.dumps(delta)) * 10 < len(json.dumps(full))

    def test_since_equal_to_count_returns_no_rows(self) -> None:
        body, _ = _body(_dims_with(_rows(3)), {"security": 3})
        entry = body["dimensions"]["security"]
        assert entry["violations"] == [] and entry["count"] == 3 and entry["since"] == 3

    def test_since_past_count_resets_to_full_list(self) -> None:
        # Rows can shrink (a dismissed finding); the client cannot splice a
        # delta onto a list it no longer holds, so the server starts over.
        body, _ = _body(_dims_with(_rows(2)), {"security": 5})
        entry = body["dimensions"]["security"]
        assert entry["since"] == 0 and len(entry["violations"]) == 2

    def test_since_for_unknown_dimension_is_ignored(self) -> None:
        body, _ = _body(_dims_with(_rows(2)), {"other": 9})
        assert len(body["dimensions"]["security"]["violations"]) == 2


class TestParseSince:
    def test_absent_is_empty(self) -> None:
        from quodeq.api.live_findings_wire import parse_since
        assert parse_since(None) == {} and parse_since("") == {}

    def test_pairs_are_parsed(self) -> None:
        from quodeq.api.live_findings_wire import parse_since
        assert parse_since("security:3, usability:0 ,") == {"security": 3, "usability": 0}

    def test_malformed_is_none(self) -> None:
        from quodeq.api.live_findings_wire import parse_since
        assert parse_since("security") is None
        assert parse_since("security:x") is None
        assert parse_since("security:-1") is None
