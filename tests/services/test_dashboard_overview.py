"""The overview dashboard: same scalars as the full one, no bodies, memoized."""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

import quodeq.services.dashboard as dashboard_mod
from quodeq.core.types.dashboard_view import DashboardView
from quodeq.services import _dashboard_overview
from quodeq.services.dashboard import build_dashboard
from quodeq.services.dismissed import dismiss_finding
from quodeq.shared.stamp_memo import StampCache

RUN = "20260101T000000"


def _write_run(reports: Path, project: str = "proj", run_id: str = RUN) -> Path:
    """A legacy-style on-disk run with two violations in one dimension
    (the same shape tests/services/test_dashboard_build_filtering.py uses)."""
    run_dir = reports / project / run_id
    eval_dir = run_dir / "evaluation"
    eval_dir.mkdir(parents=True)
    violations = [
        {"principle": "N/A", "req": "N/A", "file": "src/a.py", "line": 73,
         "title": "Arbitrary file read", "severity": "critical", "snippet": "open(p)", "context": "def f():", "reason": "r"},
        {"principle": "Modularity", "req": "M-MOD-1", "file": "src/b.py", "line": 5,
         "title": "Oversized function", "severity": "major", "snippet": "def g():", "context": "...", "reason": "r"},
    ]
    (eval_dir / "maintainability.json").write_text(json.dumps({
        "dimension": "maintainability",
        "overallScore": "6.0/10", "overallGrade": "Fair",
        "principles": [], "violations": violations, "compliance": [],
        "totals": {"violationCount": 2, "complianceCount": 0, "severity": {"critical": 1, "major": 1, "minor": 0}},
    }), encoding="utf-8")
    evidence_dir = run_dir / "evidence"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "manifest.json").write_text('{"language_stats": {}}', encoding="utf-8")
    return run_dir


@pytest.fixture(autouse=True)
def _fresh_memo():
    with patch.object(_dashboard_overview, "_CACHE", StampCache()):
        yield


def _dim(body):
    return body["dimensions"][0]


def test_overview_has_no_bodies_and_same_scalars(tmp_path: Path) -> None:
    _write_run(tmp_path)
    full = build_dashboard(str(tmp_path), "proj", "latest")
    overview = build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW)
    f, o = _dim(full), _dim(overview)
    assert "violations" not in o and "compliance" not in o
    assert len(f["violations"]) == 2
    assert o["openTypes"] == 2
    for key in ("overallScore", "overallGrade", "totals", "dismissedCount", "suppressedCount", "dimension"):
        assert o.get(key) == f.get(key), key
    assert overview["trend"] == full["trend"]
    assert overview["selectedRun"] == full["selectedRun"]


def test_dismissal_invalidates_overview_memo(tmp_path: Path) -> None:
    _write_run(tmp_path)
    before = _dim(build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW))
    dismiss_finding(tmp_path / "proj", {"req": "N/A", "file": "src/a.py", "line": 73})
    after = _dim(build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW))
    full = _dim(build_dashboard(str(tmp_path), "proj", "latest"))
    assert before["totals"]["violationCount"] == 2
    assert after["totals"]["violationCount"] == 1 == full["totals"]["violationCount"]
    assert after["dismissedCount"] == 1 == full["dismissedCount"]
    assert after["openTypes"] == 1


def test_unchanged_run_is_not_reparsed(tmp_path: Path) -> None:
    _write_run(tmp_path)
    with patch.object(dashboard_mod, "read_run_data", wraps=dashboard_mod.read_run_data) as spy:
        build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW)
        build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW)
    assert spy.call_count == 1


def test_touched_eval_file_reparses(tmp_path: Path) -> None:
    run_dir = _write_run(tmp_path)
    path = run_dir / "evaluation" / "maintainability.json"
    with patch.object(dashboard_mod, "read_run_data", wraps=dashboard_mod.read_run_data) as spy:
        build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW)
        st = path.stat()
        os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))
        build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW)
    assert spy.call_count == 2


def test_full_view_still_reparses_each_time(tmp_path: Path) -> None:
    _write_run(tmp_path)
    with patch.object(dashboard_mod, "read_run_data", wraps=dashboard_mod.read_run_data) as spy:
        build_dashboard(str(tmp_path), "proj", "latest")
        build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.FULL)
    assert spy.call_count == 2


def test_overview_with_no_runs_matches_full(tmp_path: Path) -> None:
    (tmp_path / "proj").mkdir()
    full = build_dashboard(str(tmp_path), "proj", "latest")
    overview = build_dashboard(str(tmp_path), "proj", "latest", view=DashboardView.OVERVIEW)
    assert overview == full
    assert overview["dimensions"] == []
