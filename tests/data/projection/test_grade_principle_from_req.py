"""A finding stored without a principle is graded under the principle its
requirement code belongs to, never under a blank principle of its own.

Replayed cache entries written while a standard was not loaded carry ``req``
but no principle. The grade tables used to group them under ``""`` and average
that group into the dimension score.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from quodeq.core.events.models import Judgment
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.data.projection.grade_projector import compute_run_grades, load_grade_inputs
from quodeq.data.sqlite.state_store import SQLiteStateStore

DIM = "accessibility"
PER_PRINCIPLE = 6  # clears the medium-confidence floor without a file count


def _write_standard(directory: Path, dimension: str, principles: list[dict]) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{dimension}.json").write_text(
        json.dumps({"id": dimension, "principles": principles}), encoding="utf-8",
    )
    return directory


def _standard(directory: Path, dimension: str = DIM) -> Path:
    return _write_standard(directory, dimension, [
        {"name": "Perceivable", "requirements": [{"id": "ACC-PER-01"}, {"id": "ACC-PER-02"}]},
        {"name": "Operable", "requirements": [{"id": "ACC-OPR-01"}]},
    ])


def _seed(store: SQLiteStateStore, req: str, *, principle: str = "", n: int = PER_PRINCIPLE,
          verdict: str = "compliance", dimension: str = DIM) -> None:
    for i in range(n):
        store.record_finding(Judgment(
            practice_id=principle, verdict=verdict, dimension=dimension,
            file=f"{req}-{i}.kt", line=i + 1, reason="r", req=req, severity="minor",
        ))


def _grade(run_dir: Path, compiled: Path | None, evaluators: Path | None = None):
    return compute_run_grades(
        run_dir, DEFAULT_PARAMS, compiled_dir=compiled, evaluators_dir=evaluators,
    )


def _principles(rows) -> dict[str, dict]:
    return {grade["principle_id"]: grade for _dim, grade in rows}


def test_blank_principle_is_graded_under_the_principle_of_its_req(tmp_path: Path) -> None:
    compiled = _standard(tmp_path / "compiled")
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01")
    _seed(store, "ACC-OPR-01")

    rows, dims = _grade(tmp_path / "run", compiled)

    grades = _principles(rows)
    assert set(grades) == {"Perceivable", "Operable"}
    assert grades["Perceivable"]["grade"] != "Insufficient"
    assert grades["Operable"]["grade"] != "Insufficient"
    assert dims[0]["score"] is not None


def test_no_blank_group_and_the_dimension_mean_ignores_it(tmp_path: Path) -> None:
    compiled = _standard(tmp_path / "compiled")
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01", principle="Perceivable")
    _seed(store, "ACC-OPR-01", principle="Operable")
    _seed(store, "ACC-PER-02", n=PER_PRINCIPLE * 2, verdict="violation")  # blank, real req

    rows, dims = _grade(tmp_path / "run", compiled)

    grades = _principles(rows)
    assert "" not in grades
    assert dims[0]["score"] == round(
        sum(g["score"] for g in grades.values() if g["score"] is not None)
        / len([g for g in grades.values() if g["score"] is not None]), 1,
    )


def test_a_labelled_finding_keeps_its_stored_principle(tmp_path: Path) -> None:
    compiled = _standard(tmp_path / "compiled")
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01", principle="Perceivable")

    inputs = load_grade_inputs(tmp_path / "run", compiled_dir=compiled)

    assert set(inputs.compliance_by) == {(DIM, "Perceivable")}


def test_custom_standard_maps_its_own_codes(tmp_path: Path) -> None:
    evaluators = _write_standard(tmp_path / "evaluators", "mine", [
        {"name": "Alpha", "requirements": [{"id": "MY-AAA-01"}]},
        {"name": "Beta", "requirements": [{"id": "MY-BBB-01"}]},
    ])
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "MY-AAA-01", dimension="mine")
    _seed(store, "MY-BBB-01", dimension="mine")

    rows, _ = _grade(tmp_path / "run", None, evaluators)

    assert set(_principles(rows)) == {"Alpha", "Beta"}


def test_custom_standard_wins_over_the_built_in_of_the_same_name(tmp_path: Path) -> None:
    compiled = _standard(tmp_path / "compiled")
    evaluators = _write_standard(tmp_path / "evaluators", DIM, [
        {"name": "Override", "requirements": [{"id": "ACC-PER-01"}]},
    ])
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01")

    rows, _ = _grade(tmp_path / "run", compiled, evaluators)

    assert set(_principles(rows)) == {"Override"}


def test_a_near_miss_code_folds_onto_the_standards_code(tmp_path: Path) -> None:
    compiled = _standard(tmp_path / "compiled")
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "per-01")

    inputs = load_grade_inputs(tmp_path / "run", compiled_dir=compiled)

    assert set(inputs.compliance_by) == {(DIM, "Perceivable")}


def test_a_code_the_standard_does_not_define_is_unmapped_not_graded(
    tmp_path: Path, caplog: pytest.LogCaptureFixture,
) -> None:
    compiled = _standard(tmp_path / "compiled")
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01")
    _seed(store, "ZZZ-NOPE-99", n=3)

    with caplog.at_level(logging.WARNING):
        inputs = load_grade_inputs(tmp_path / "run", compiled_dir=compiled)

    assert set(inputs.compliance_by) == {(DIM, "Perceivable")}
    assert inputs.unmapped_by_dimension == {DIM: 3}
    assert "3" in caplog.text and DIM in caplog.text


@pytest.mark.parametrize("standard", ["absent", "no-ids"])
def test_without_a_usable_standard_a_req_never_becomes_a_principle(
    tmp_path: Path, standard: str,
) -> None:
    compiled = tmp_path / "compiled"
    compiled.mkdir()
    if standard == "no-ids":
        compiled = _write_standard(tmp_path / "compiled", DIM, [
            {"name": "Gamma", "requirements": [{"title": "no id field"}]},
        ])
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01")

    rows, dims = _grade(tmp_path / "run", compiled)

    assert rows == []
    assert dims == []
    inputs = load_grade_inputs(tmp_path / "run", compiled_dir=compiled)
    assert inputs.unmapped_by_dimension == {DIM: PER_PRINCIPLE}


def test_a_dimension_id_in_another_case_finds_its_standard(tmp_path: Path) -> None:
    compiled = _standard(tmp_path / "compiled")
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01", dimension="Accessibility")

    inputs = load_grade_inputs(tmp_path / "run", compiled_dir=compiled)

    assert set(inputs.compliance_by) == {("Accessibility", "Perceivable")}


def test_dismissed_findings_without_a_principle_count_under_their_req_principle(
    tmp_path: Path,
) -> None:
    compiled = _standard(tmp_path / "compiled")
    store = SQLiteStateStore(tmp_path / "run")
    _seed(store, "ACC-PER-01", principle="Perceivable")
    for i in range(2):
        store.record_finding(Judgment(
            practice_id="", verdict="dismissed", dimension=DIM, file=f"d{i}.kt",
            line=1, reason="r", req="ACC-PER-01", severity="minor",
        ))

    inputs = load_grade_inputs(tmp_path / "run", compiled_dir=compiled)

    assert inputs.dismissed_counts == {(DIM, "Perceivable"): 2}
