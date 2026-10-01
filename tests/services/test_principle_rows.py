"""Principle grades persist next to the cached per-run scalars (``run_principle_scalars``)."""
from __future__ import annotations

import pytest

from quodeq.core.observability import NULL_LOG
from quodeq.core.types import DimensionResult
from quodeq.core.types.report import PrincipleGrade
from quodeq.data.sqlite.score_cache_principles import principle_rows
from quodeq.data.sqlite.score_cache_rows import scalar_dimension
from quodeq.data.sqlite.score_cache_store import read_cached_rows, write_cached_rows
from quodeq.services.score_cache import make_cache_backed_fetcher, open_score_cache


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))


def _dims() -> list[DimensionResult]:
    return [
        DimensionResult(
            dimension="security", overall_score="7.0/10", overall_grade="Fair",
            principles=[PrincipleGrade("P1", "6.0/10", "Fair"), PrincipleGrade("P2", "8.0/10", "Good")],
        ),
        DimensionResult(
            dimension="reliability", overall_score="9.0/10", overall_grade="Good",
            principles=[PrincipleGrade("R1", None, None), PrincipleGrade(None, "1.0/10", "Poor")],
        ),
    ]


def _stored(conn, run_id: str, version: str) -> dict[str, list[tuple]]:
    rows = conn.execute(
        "SELECT dimension, principle, score, grade FROM run_principle_scalars"
        " WHERE project='proj' AND run_id=? AND version=? ORDER BY rowid", (run_id, version))
    out: dict[str, list[tuple]] = {}
    for dim, *grade in rows:
        out.setdefault(dim, []).append(tuple(grade))
    return out


_EXPECTED = {
    "security": [("P1", "6.0/10", "Fair"), ("P2", "8.0/10", "Good")],
    "reliability": [("R1", None, None)],
}


def test_principle_rows_skip_unnamed_principles():
    assert principle_rows(_dims()) == [
        ("security", "P1", "6.0/10", "Fair"), ("security", "P2", "8.0/10", "Good"),
        ("reliability", "R1", None, None),
    ]


class TestStore:
    def test_rows_persist_with_the_scalars(self):
        with open_score_cache() as conn:
            write_cached_rows(conn, "proj", "r1", "v1", _dims(), principle_rows(_dims()))
            stored = _stored(conn, "r1", "v1")
        assert stored == _EXPECTED

    def test_rows_are_keyed_by_run_and_version(self):
        with open_score_cache() as conn:
            write_cached_rows(conn, "proj", "r1", "v1", _dims(), principle_rows(_dims()))
            write_cached_rows(conn, "proj", "r2", "v2", _dims()[:1], principle_rows(_dims()[:1]))
            first, second = _stored(conn, "r1", "v1"), _stored(conn, "r2", "v2")
        assert first == _EXPECTED
        assert second == {"security": _EXPECTED["security"]}

    def test_rewrite_replaces_the_runs_principle_rows(self):
        with open_score_cache() as conn:
            write_cached_rows(conn, "proj", "r1", "v1", _dims(), principle_rows(_dims()))
            write_cached_rows(conn, "proj", "r1", "v2", _dims()[1:], principle_rows(_dims()[1:]))
            stale, fresh = _stored(conn, "r1", "v1"), _stored(conn, "r1", "v2")
        assert stale == {}
        assert fresh == {"reliability": _EXPECTED["reliability"]}

    def test_the_served_dimension_rows_stay_principle_free(self):
        with open_score_cache() as conn:
            write_cached_rows(conn, "proj", "r1", "v1", _dims(), principle_rows(_dims()))
            back = read_cached_rows(conn, "proj", "r1", "v1")
        assert back is not None and all(d.principles == [] for d in back)

    def test_scalar_rows_still_read_back(self):
        with open_score_cache() as conn:
            write_cached_rows(conn, "proj", "r1", "v1", _dims(), principle_rows(_dims()))
            back = read_cached_rows(conn, "proj", "r1", "v1")
        assert [(d.dimension, d.overall_score) for d in back] == [("reliability", "9.0/10"), ("security", "7.0/10")]

    def test_schema_declares_the_table(self):
        with open_score_cache() as conn:
            cols = [row[1] for row in conn.execute("PRAGMA table_info(run_principle_scalars)")]
        assert cols == ["project", "run_id", "version", "dimension", "principle", "score", "grade"]


def test_scalar_dimension_still_drops_principles():
    assert scalar_dimension(_dims()[0]).principles == []


def test_cache_backed_fetcher_writes_principle_rows_on_a_miss():
    fetch = make_cache_backed_fetcher("proj", lambda _rid: "v1", lambda _rid: _dims(), log=NULL_LOG)
    served = fetch("r1")
    with open_score_cache() as conn:
        stored = _stored(conn, "r1", "v1")
    assert all(d.principles == [] for d in served)
    assert stored == _EXPECTED
