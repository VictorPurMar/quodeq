"""services.live_findings: one slim, memoized payload for the live feed."""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from quodeq.services import live_findings
from quodeq.services.live_findings import LiveFindingState, get_live_findings
from quodeq.shared.stamp_memo import StampCache

ROW = {
    "principle": "Authenticity", "req": "S-AUT-3", "file": "src/a.py", "line": 12, "end_line": 14,
    "severity": "minor", "title": "Path traversal", "snippet": "Path(x)", "context": "def f():",
    "reason": "because", "req_refs": [{"label": "CWE-22", "url": "https://cwe.mitre.org/22"}],
    "confidence": 25,
}


@pytest.fixture(autouse=True)
def _fresh_cache():
    with patch.object(live_findings, "_CACHE", StampCache()):
        yield


def _write_eval(run_dir: Path, dim: str, rows: list[dict]) -> Path:
    eval_dir = run_dir / "evaluation"
    eval_dir.mkdir(parents=True, exist_ok=True)
    path = eval_dir / f"{dim}.json"
    path.write_text(json.dumps({"dimension": dim, "principles": [], "violations": rows, "compliance": []}))
    return path


def _bump(path: Path) -> None:
    """A later mtime, so the stamp changes even on coarse filesystems."""
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))


def test_missing_run_dir_is_none(tmp_path: Path) -> None:
    (tmp_path / "proj").mkdir()
    assert get_live_findings(str(tmp_path), "proj", "nope", ["security"]) is None


def test_path_traversal_is_none(tmp_path: Path) -> None:
    assert get_live_findings(str(tmp_path), "../etc", "run", ["security"]) is None


def test_run_dir_without_files_is_waiting(tmp_path: Path) -> None:
    (tmp_path / "proj" / "run1").mkdir(parents=True)
    body = get_live_findings(str(tmp_path), "proj", "run1", ["security", "usability"])
    assert body is not None
    assert body["project"] == "proj" and body["runId"] == "run1"
    assert body["dimensions"]["security"] == {"state": LiveFindingState.WAITING, "violations": []}
    assert body["dimensions"]["usability"] == {"state": LiveFindingState.WAITING, "violations": []}


def test_unknown_dimension_is_missing(tmp_path: Path) -> None:
    run_dir = tmp_path / "proj" / "run1"
    _write_eval(run_dir, "security", [ROW])
    with patch.object(live_findings.fs_reports, "get_dimension_eval", return_value=None):
        body = get_live_findings(str(tmp_path), "proj", "run1", ["made-up"])
    assert body["dimensions"]["made-up"] == {"state": LiveFindingState.MISSING, "violations": []}


def test_ready_dimension_returns_its_rows(tmp_path: Path) -> None:
    run_dir = tmp_path / "proj" / "run1"
    _write_eval(run_dir, "security", [ROW])
    body = get_live_findings(str(tmp_path), "proj", "run1", ["security"])
    entry = body["dimensions"]["security"]
    assert entry["state"] == LiveFindingState.READY
    (row,) = entry["violations"]
    # Rows are the dimension eval's own (camelCase from the stored contract);
    # the route slims them.
    assert row["file"] == "src/a.py" and row["line"] == 12 and row["practiceId"] == "Authenticity"
    assert row["snippet"] == "Path(x)"


def test_unchanged_files_do_not_reparse(tmp_path: Path) -> None:
    run_dir = tmp_path / "proj" / "run1"
    _write_eval(run_dir, "security", [ROW])
    with patch.object(live_findings.fs_reports, "get_dimension_eval",
                      wraps=live_findings.fs_reports.get_dimension_eval) as spy:
        get_live_findings(str(tmp_path), "proj", "run1", ["security"])
        get_live_findings(str(tmp_path), "proj", "run1", ["security"])
    assert spy.call_count == 1


def test_touched_eval_file_reparses(tmp_path: Path) -> None:
    run_dir = tmp_path / "proj" / "run1"
    path = _write_eval(run_dir, "security", [ROW])
    with patch.object(live_findings.fs_reports, "get_dimension_eval",
                      wraps=live_findings.fs_reports.get_dimension_eval) as spy:
        get_live_findings(str(tmp_path), "proj", "run1", ["security"])
        _bump(path)
        get_live_findings(str(tmp_path), "proj", "run1", ["security"])
    assert spy.call_count == 2


def test_dismissal_invalidates_memo(tmp_path: Path) -> None:
    run_dir = tmp_path / "proj" / "run1"
    _write_eval(run_dir, "security", [ROW])
    actions = tmp_path / "proj" / "actions.jsonl"
    with patch.object(live_findings.fs_reports, "get_dimension_eval",
                      wraps=live_findings.fs_reports.get_dimension_eval) as spy:
        get_live_findings(str(tmp_path), "proj", "run1", ["security"])
        actions.write_text("")  # the file appearing is a stamp change
        get_live_findings(str(tmp_path), "proj", "run1", ["security"])
    assert spy.call_count == 2
