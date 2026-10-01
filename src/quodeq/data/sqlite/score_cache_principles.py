"""Reads and writes of ``run_principle_scalars``, the per-principle companion of ``run_scalars``.

One row per (project, run, version, dimension, principle) with the principle's
score and grade, written and deleted together with the run's ``run_scalars``
rows so a hit on either version carries both. The served ``DimensionResult``
stays principle-free (its payload shape is pinned by the golden test); the
as-of and compare builders will read these rows directly.
"""
from __future__ import annotations

import sqlite3

from quodeq.core.types import DimensionResult

#: One row to write: ``(dimension, principle, score, grade)``.
PrincipleRow = tuple[str, str, str | None, str | None]


def principle_rows(dims: list[DimensionResult]) -> list[PrincipleRow]:
    """The principle rows of *dims*, skipping unnamed principles and dimensions."""
    return [(d.dimension, p.principle, p.score, p.grade)
            for d in dims if d.dimension for p in d.principles if p.principle]


def write_principle_rows(
    conn: sqlite3.Connection, project: str, run_id: str, version: str, rows: list[PrincipleRow],
) -> None:
    """Replace the run's principle rows with *rows* at *version*. Does not commit."""
    conn.execute("DELETE FROM run_principle_scalars WHERE project=? AND run_id=?", (project, run_id))
    conn.executemany(
        "INSERT OR REPLACE INTO run_principle_scalars"
        " (project, run_id, version, dimension, principle, score, grade) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(project, run_id, version, *row) for row in rows],
    )

