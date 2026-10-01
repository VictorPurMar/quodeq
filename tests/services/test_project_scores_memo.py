"""get_project_scores memoizes the full payload on a stamp of its inputs."""
from __future__ import annotations

import json
import os
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import pytest

from quodeq.services.dismissed import dismiss_finding
from quodeq.services.scoring import get_project_scores, get_project_scores_stamped
from quodeq.services.scoring_deps import ScoringDeps
from quodeq.shared.stamp_memo import StampCache

RUN = "20260101T000000"
_MODULE = "quodeq.services.scoring._project_scores"


def _write_run(reports: Path, project: str = "proj", run_id: str = RUN, state: str = "done") -> Path:
    run_dir = reports / project / run_id
    eval_dir = run_dir / "evaluation"
    eval_dir.mkdir(parents=True)
    violations = [
        {"principle": "N/A", "req": "N/A", "file": "src/a.py", "line": 73, "title": "Arbitrary file read", "severity": "critical"},
        {"principle": "Modularity", "req": "M-MOD-1", "file": "src/b.py", "line": 5, "title": "Oversized function", "severity": "major"},
    ]
    (eval_dir / "maintainability.json").write_text(json.dumps({
        "dimension": "maintainability", "overallScore": "6.0/10", "overallGrade": "Fair",
        "principles": [], "violations": violations, "compliance": [],
        "totals": {"violationCount": 2, "complianceCount": 0, "severity": {"critical": 1, "major": 1, "minor": 0}},
    }), encoding="utf-8")
    (run_dir / "evidence").mkdir(parents=True)
    (run_dir / "evidence" / "manifest.json").write_text('{"language_stats": {}}', encoding="utf-8")
    (run_dir / "status.json").write_text(json.dumps({"state": state, "dateISO": "2026-01-01T00:00:00Z"}))
    return run_dir


@pytest.fixture(autouse=True)
def _fresh_memo():
    with patch(f"{_MODULE}._PAYLOADS", StampCache()):
        yield


def _counting_deps() -> tuple[ScoringDeps, list]:
    calls: list = []

    def cached_accumulated(project, version, compute, *, cacheable, stale_scope=None, log=None):
        calls.append(version)
        return compute()

    return ScoringDeps(cached_accumulated=cached_accumulated), calls


def test_second_request_reuses_the_payload(tmp_path: Path) -> None:
    _write_run(tmp_path)
    deps, calls = _counting_deps()
    first, stamp1 = get_project_scores_stamped(tmp_path, "proj", None, deps)
    second, stamp2 = get_project_scores_stamped(tmp_path, "proj", None, deps)
    assert first is second and stamp1 == stamp2
    assert len(calls) == 1


def test_dismissal_changes_the_stamp_and_recomputes(tmp_path: Path) -> None:
    _write_run(tmp_path)
    deps, calls = _counting_deps()
    _, stamp1 = get_project_scores_stamped(tmp_path, "proj", None, deps)
    dismiss_finding(tmp_path / "proj", {"req": "N/A", "file": "src/a.py", "line": 73})
    payload, stamp2 = get_project_scores_stamped(tmp_path, "proj", None, deps)
    assert stamp2 != stamp1
    assert len(calls) == 2
    assert payload["accumulated"]["dimensions"][0]["totals"]["violationCount"] == 1


def test_run_status_change_alone_changes_the_stamp(tmp_path: Path) -> None:
    # A run is RUNNING while a live process holds its pid (status.json only
    # settles terminal states), so the pid resolver is what flips here.
    _write_run(tmp_path, state="running")
    deps, _ = _counting_deps()
    with patch("quodeq.data.fs.report_parser.runs.resolve_external_pid", return_value=os.getpid()):
        first, stamp1 = get_project_scores_stamped(tmp_path, "proj", None, deps)
    assert str(first["availableRuns"][0]["status"]) == "running"
    with patch("quodeq.data.fs.report_parser.runs.resolve_external_pid", return_value=None):
        second, stamp2 = get_project_scores_stamped(tmp_path, "proj", None, deps)
    assert stamp2 != stamp1
    assert str(second["availableRuns"][0]["status"]) == "done"


def test_incomplete_rescore_is_not_memoized(tmp_path: Path) -> None:
    """A winning run whose full read lacks a graded dimension is served, not memoized."""
    _write_run(tmp_path)
    deps, calls = _counting_deps()
    deps = replace(deps, base_fetcher_factory=lambda _rr, _p: (lambda _run_id: []))
    get_project_scores_stamped(tmp_path, "proj", None, deps)
    get_project_scores_stamped(tmp_path, "proj", None, deps)
    assert len(calls) == 2


def test_missing_and_empty_projects_have_no_stamp(tmp_path: Path) -> None:
    assert get_project_scores_stamped(tmp_path, "nope") == (None, None)
    (tmp_path / "empty").mkdir()
    payload, stamp = get_project_scores_stamped(tmp_path, "empty")
    assert stamp is None and payload["availableRuns"] == []


def test_get_project_scores_still_returns_the_payload(tmp_path: Path) -> None:
    _write_run(tmp_path)
    assert get_project_scores(tmp_path, "proj")["availableRuns"][0]["runId"] == RUN


def test_a_running_run_writing_files_changes_the_stamp(tmp_path: Path) -> None:
    # A run in flight has no version of its own in the accumulated cache key
    # (only touching suppressions count), so its files are stamped directly:
    # the trend point for that run must follow what it has scored so far.
    run_dir = _write_run(tmp_path, state="running")
    deps, calls = _counting_deps()
    with patch("quodeq.data.fs.report_parser.runs.resolve_external_pid", return_value=os.getpid()):
        _, stamp1 = get_project_scores_stamped(tmp_path, "proj", None, deps)
        (run_dir / "evaluation" / "security.json").write_text(json.dumps({
            "dimension": "security", "overallScore": "8.0/10", "overallGrade": "Good",
            "principles": [], "violations": [], "compliance": [],
        }), encoding="utf-8")
        _, stamp2 = get_project_scores_stamped(tmp_path, "proj", None, deps)
    assert stamp2 != stamp1
    assert len(calls) == 2


def test_as_of_requests_are_not_memoized(tmp_path: Path) -> None:
    # One entry per project keeps the memo small; as-of payloads are frozen
    # client-side already.
    _write_run(tmp_path)
    deps, calls = _counting_deps()
    payload, stamp = get_project_scores_stamped(tmp_path, "proj", RUN, deps)
    assert stamp is None and payload["availableRuns"][0]["runId"] == RUN
    get_project_scores_stamped(tmp_path, "proj", RUN, deps)
    assert len(calls) == 2


def test_parent_projects_skip_the_per_run_versions(tmp_path: Path) -> None:
    _write_run(tmp_path)
    with patch(f"{_MODULE}.find_children", return_value=["child"]), \
         patch(f"{_MODULE}.per_run_versions") as versions:
        payload, stamp = get_project_scores_stamped(tmp_path, "proj")
    assert stamp is None and payload is not None
    versions.assert_not_called()
