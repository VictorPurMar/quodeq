"""A cached finding replayed without a principle gets it from its requirement.

Entries written while a standard was not loaded carry ``req`` but no ``p``.
Replayed into the event log as they are, the SQL grade tables see a blank
principle. The repair goes on the event only: the cache entry and the
evidence JSONL row stay as they were.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from types import SimpleNamespace

from quodeq.analysis.cache.dimension_helpers import ClassifyResult
from quodeq.analysis.cache.dimension_runner import (
    ReplayPolicy,
    emit_cached_findings,
    replay_principle_lookup,
    write_findings,
)
from quodeq.data.projection.principle_from_req import make_principle_lookup

DIM = "accessibility"


def _standard(directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{DIM}.json").write_text(json.dumps({"id": DIM, "principles": [
        {"name": "Perceivable", "requirements": [{"id": "ACC-PER-01"}]},
        {"name": "Operable", "requirements": [{"id": "ACC-OPR-01"}]},
    ]}), encoding="utf-8")
    return directory


def _finding(req: str, principle: str | None = None) -> dict:
    row = {
        "file": "a.kt", "line": 1, "t": "compliance", "w": "t", "d": DIM,
        "req": req, "severity": "minor", "snippet": "x", "reason": "r",
    }
    if principle is not None:
        row["p"] = principle
    return row


class _Recorder:
    def __init__(self, _path: Path) -> None:
        self.events: list = []

    def emit(self, event) -> None:
        self.events.append(event)


def _emit(tmp_path: Path, findings: list[dict], lookup) -> list[str]:
    writers: list[_Recorder] = []

    def factory(path: Path) -> _Recorder:
        writers.append(_Recorder(path))
        return writers[0]

    emit_cached_findings(tmp_path / "events.jsonl", findings, writer_factory=factory,
                         principle_lookup=lookup)
    return [e.payload.practice_id for e in writers[0].events]


def test_a_finding_without_a_principle_is_emitted_under_its_req_principle(tmp_path: Path) -> None:
    lookup = make_principle_lookup(_standard(tmp_path / "compiled"))

    assert _emit(tmp_path, [_finding("ACC-PER-01"), _finding("ACC-OPR-01")], lookup) == [
        "Perceivable", "Operable",
    ]


def test_a_finding_that_has_a_principle_is_emitted_as_it_is(tmp_path: Path) -> None:
    lookup = make_principle_lookup(_standard(tmp_path / "compiled"))

    assert _emit(tmp_path, [_finding("ACC-PER-01", principle="Custom")], lookup) == ["Custom"]


def test_a_req_the_standard_does_not_define_stays_blank_and_is_logged(
    tmp_path: Path, caplog,
) -> None:
    lookup = make_principle_lookup(_standard(tmp_path / "compiled"))

    with caplog.at_level(logging.WARNING):
        emitted = _emit(tmp_path, [_finding("ZZZ-NOPE-99"), _finding("ZZZ-NOPE-98")], lookup)

    assert emitted == ["", ""]
    assert "2" in caplog.text and DIM in caplog.text


def test_without_a_lookup_nothing_changes(tmp_path: Path) -> None:
    assert _emit(tmp_path, [_finding("ACC-PER-01")], None) == [""]


def test_the_cache_owned_dict_is_not_mutated(tmp_path: Path) -> None:
    lookup = make_principle_lookup(_standard(tmp_path / "compiled"))
    original = _finding("ACC-PER-01")

    _emit(tmp_path, [original], lookup)

    assert "p" not in original


def test_write_findings_repairs_the_event_but_not_the_jsonl_row(tmp_path: Path) -> None:
    lookup = make_principle_lookup(_standard(tmp_path / "compiled"))
    (tmp_path / "evidence").mkdir()
    jsonl = tmp_path / "evidence" / f"{DIM}_evidence.jsonl"
    classify = ClassifyResult(cached_findings=[_finding("ACC-PER-01")], unconsolidated_findings=[])

    write_findings(jsonl, classify, append=False, policy=ReplayPolicy(principle_lookup=lookup))

    row = json.loads(jsonl.read_text().splitlines()[0])
    assert "p" not in row and row["carried_forward"] is True
    event = json.loads((tmp_path / "events.jsonl").read_text().splitlines()[0])
    assert event["payload"]["practice_id"] == "Perceivable"


def test_the_runs_lookup_reads_the_configured_standards(tmp_path: Path) -> None:
    standards = tmp_path / "standards"
    _standard(standards / "compiled")
    config = SimpleNamespace(standards_dir=standards, evaluators_dir=None)

    assert replay_principle_lookup(config)(DIM, "ACC-OPR-01") == "Operable"


def test_the_runs_custom_evaluator_wins_over_the_built_in(tmp_path: Path) -> None:
    standards = tmp_path / "standards"
    _standard(standards / "compiled")
    evaluators = tmp_path / "evaluators"
    evaluators.mkdir()
    (evaluators / f"{DIM}.json").write_text(json.dumps({"id": DIM, "principles": [
        {"name": "Override", "requirements": [{"id": "ACC-PER-01"}]},
    ]}), encoding="utf-8")
    config = SimpleNamespace(standards_dir=standards, evaluators_dir=evaluators)

    assert replay_principle_lookup(config)(DIM, "ACC-PER-01") == "Override"
