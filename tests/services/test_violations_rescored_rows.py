"""The eval dict lists only the rows the run's rescore kept."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from quodeq.core.types import DimensionResult, Finding
from quodeq.services.violations import resolve_dimension_eval


def _row(file: str) -> dict:
    return {"principle": "P1", "file": file, "line": 1, "reason": "r"}


def _finding(file: str) -> Finding:
    return Finding(practice_id="P1", verdict="violation", file=file, line=1)


def _write_eval(tmp_path: Path, stored: dict) -> Path:
    base = tmp_path / "reports" / "proj" / "run"
    (base / "evaluation").mkdir(parents=True)
    (base / "evaluation" / "security.json").write_text(json.dumps(stored), encoding="utf-8")
    return base


def test_rows_the_rescore_hid_are_dropped_from_the_flat_lists(tmp_path) -> None:
    base = _write_eval(tmp_path, {
        "dimension": "security", "overallScore": "6.0/10", "overallGrade": "Adequate",
        "principles": [{"name": "P1", "violations": [_row("kept.py"), _row("hidden.py")], "compliance": [_row("ok.py")]}],
        "violations": [_row("kept.py"), _row("hidden.py")], "compliance": [_row("ok.py"), _row("gone.py")],
    })
    rescored = [DimensionResult(
        dimension="security", violations=[_finding("kept.py")], compliance=[_finding("ok.py")],
    )]
    with patch("quodeq.services.scoring.scored_run_dimensions", return_value=rescored):
        out = resolve_dimension_eval(base, "proj", "run", "security")

    assert [v["file"] for v in out["violations"]] == ["kept.py"]
    assert [c["file"] for c in out["compliance"]] == ["ok.py"]
    assert out["violations"][0]["reason"] == "r"


def test_rows_are_kept_when_the_rescore_is_unavailable(tmp_path) -> None:
    base = _write_eval(tmp_path, {
        "dimension": "security", "overallScore": "6.0/10", "overallGrade": "Adequate",
        "principles": [], "violations": [_row("a.py")], "compliance": [],
    })
    with patch("quodeq.services.scoring.scored_run_dimensions", side_effect=FileNotFoundError):
        out = resolve_dimension_eval(base, "proj", "run", "security")
    assert [v["file"] for v in out["violations"]] == ["a.py"]
