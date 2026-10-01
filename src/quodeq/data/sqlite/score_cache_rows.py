"""The ``run_scalars`` row shape and its mapping to and from ``DimensionResult``.

A leaf module: the schema (``score_cache_db``) needs the column names for its
migration and the store (``score_cache_store``) needs the mapping, and neither
may import the other.

Two projections of a dimension live here. ``row_dimension`` is what the store
keeps: score, grade, counts, files read and principle grades, enough for the
accumulated walk to pick and grade a winning run without its findings.
``scalar_dimension`` is the narrower shape the trend serves, pinned by the
golden payloads: no principles, no files read.
"""
from __future__ import annotations

from dataclasses import replace

from quodeq.core.types import DimensionResult
from quodeq.core.types.dimension import open_types_of
from quodeq.core.types.finding import SeverityTally, Totals
from quodeq.core.types.severity import SEVERITY_ORDER

#: The count columns after ``dimension, overall_score, overall_grade``, in
#: SELECT and INSERT order. One column per severity, named after the
#: vocabulary, plus the tally's unknown bucket.
RUN_SCALARS_COUNT_COLUMNS: tuple[str, ...] = (
    "violation_count", "compliance_count", *(s.value for s in SEVERITY_ORDER), "unknown", "open_types",
)
#: Every column after the key, in SELECT and INSERT order. The ones after the
#: first three are added by migration to a table created before them.
RUN_SCALARS_COLUMNS: tuple[str, ...] = (
    "dimension", "overall_score", "overall_grade", *RUN_SCALARS_COUNT_COLUMNS, "files_read",
)


def row_dimension(d: DimensionResult) -> DimensionResult:
    """*d* reduced to what the store keeps: score, grade, counts, files read and principles."""
    return DimensionResult(dimension=d.dimension, overall_score=d.overall_score,
                           overall_grade=d.overall_grade, principles=list(d.principles),
                           totals=d.totals, open_types=open_types_of(d), files_read=d.files_read)


def scalar_dimension(d: DimensionResult) -> DimensionResult:
    """*d* reduced to what the trend serves: score, grade and counts, no findings.

    History's majors and open-types columns read the counts, so they travel
    with it. Principles and files read stay behind (see the module docstring).
    """
    return replace(row_dimension(d), principles=[], files_read=None)


def dimension_from_row(row: tuple) -> DimensionResult:
    """One ``RUN_SCALARS_COLUMNS`` row as a row dimension, without its principles.

    A row written before the counts were stored (or for a dimension that had
    none) has NULL counts and reads back without totals, never as zeros.
    """
    col = dict(zip(RUN_SCALARS_COLUMNS, row, strict=True))
    totals = None
    if col["violation_count"] is not None:
        severity = SeverityTally(**{s.value: col[s.value] or 0 for s in SEVERITY_ORDER}, unknown=col["unknown"] or 0)
        totals = Totals(violation_count=col["violation_count"], compliance_count=col["compliance_count"] or 0,
                        severity=severity)
    return DimensionResult(dimension=col["dimension"], overall_score=col["overall_score"],
                           overall_grade=col["overall_grade"], totals=totals, open_types=col["open_types"],
                           files_read=col["files_read"])


def row_values(d: DimensionResult) -> tuple:
    """*d* as a ``RUN_SCALARS_COLUMNS`` tuple: NULL counts when it carries no totals."""
    t = d.totals
    if t is None:
        counts: tuple = (*(None for _ in RUN_SCALARS_COUNT_COLUMNS[:-1]), d.open_types)
    else:
        sev = t.severity
        counts = (t.violation_count, t.compliance_count, *(getattr(sev, s.value) for s in SEVERITY_ORDER),
                  sev.unknown, d.open_types)
    return (d.dimension, d.overall_score, d.overall_grade, *counts, d.files_read)
