"""dismiss_by_type closes every active finding of one requirement in a scope, once."""
from __future__ import annotations

from pathlib import Path

from quodeq.core.events.models import JudgmentCreatedEvent, JudgmentPayload
from quodeq.data.events.writer import EventLogWriter
from quodeq.data.projection.projector import Projector
from quodeq.services.dismiss_by_type import DismissScope, dismiss_by_type, select_findings
from quodeq.services.dismissed import dismissed_keys
from quodeq.services.wiring import read_action_events

_DIM = "Maintainability"
_RUN = "run-1"


def _finding(i: int, *, req: str, practice: str = "Modifiability", file: str | None = None) -> dict:
    return dict(practice_id=practice, verdict="violation", dimension=_DIM, file=file or f"f{i}.py",
                line=10 + i, reason="r", req=req, severity="minor", snippet=f"code {i}")


def _seed(project_dir: Path, findings: list[dict]) -> Path:
    run_dir = project_dir / _RUN
    run_dir.mkdir(parents=True)
    log = run_dir / "events.jsonl"
    writer = EventLogWriter(log)
    for f in findings:
        writer.emit(JudgmentCreatedEvent(payload=JudgmentPayload(**f)))
    Projector().project(log, run_dir)
    return run_dir


def test_select_findings_scopes_by_req_dimension_principle_and_file(tmp_path: Path) -> None:
    run_dir = _seed(tmp_path, [
        _finding(1, req="M-MDF-1"), _finding(2, req="M-MDF-1", practice="Analyzability"),
        _finding(3, req="M-MDF-1", file="f1.py"), _finding(4, req="M-ANA-9"), _finding(5, req=""),
    ])
    assert len(select_findings(run_dir, DismissScope("M-MDF-1", "maintainability"))) == 3
    assert len(select_findings(run_dir, DismissScope("M-MDF-1", _DIM, principle="Modifiability"))) == 2
    assert len(select_findings(run_dir, DismissScope("M-MDF-1", _DIM, file="f1.py"))) == 2


def test_empty_req_never_matches(tmp_path: Path) -> None:
    run_dir = _seed(tmp_path, [_finding(1, req="")])
    assert select_findings(run_dir, DismissScope("", _DIM)) == []


def test_dismiss_by_type_emits_one_event_per_finding(tmp_path: Path) -> None:
    run_dir = _seed(tmp_path, [_finding(1, req="M-MDF-1"), _finding(2, req="M-MDF-1"), _finding(3, req="M-ANA-9")])
    n = dismiss_by_type(tmp_path, run_dir, DismissScope("M-MDF-1", _DIM, reason="type closed"))
    assert n == 2
    events = list(read_action_events(tmp_path))
    assert [e.payload.req for e in events] == ["M-MDF-1", "M-MDF-1"]
    assert all(e.payload.fingerprint for e in events)


def test_dismissed_type_matches_its_findings_only(tmp_path: Path) -> None:
    run_dir = _seed(tmp_path, [_finding(1, req="M-MDF-1"), _finding(3, req="M-ANA-9")])
    dismiss_by_type(tmp_path, run_dir, DismissScope("M-MDF-1", _DIM))
    keys = dismissed_keys(tmp_path)
    assert keys.matches(req="M-MDF-1", principle="Modifiability", file="f1.py", line=11, snippet="code 1")
    assert not keys.matches(req="M-ANA-9", principle="Modifiability", file="f3.py", line=13, snippet="code 3")


def test_dismiss_by_type_is_idempotent(tmp_path: Path) -> None:
    run_dir = _seed(tmp_path, [_finding(1, req="M-MDF-1"), _finding(2, req="M-MDF-1")])
    assert dismiss_by_type(tmp_path, run_dir, DismissScope("M-MDF-1", _DIM)) == 2
    assert dismiss_by_type(tmp_path, run_dir, DismissScope("M-MDF-1", _DIM)) == 0
    assert len(list(read_action_events(tmp_path))) == 2
