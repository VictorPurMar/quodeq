"""The ``run_scalars`` row shape and its mapping to and from ``DimensionResult``.

A leaf module: the schema (``score_cache_db``) needs the column names for its
migration and the store (``score_cache_store``) needs the mapping, and neither
may import the other.
"""
from __future__ import annotations

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


def scalar_dimension(d: DimensionResult) -> DimensionResult:
    """*d* reduced to what the cache stores: score, grade and counts, no findings.

    The trend fetcher caches this shape and serves it for a build; History's
    majors and open-types columns read the counts, so they travel with it.
    """
    return DimensionResult(dimension=d.dimension, overall_score=d.overall_score,
                           overall_grade=d.overall_grade, totals=d.totals, open_types=open_types_of(d))


_ROW_FIELDS = ("dimension", "overall_score", "overall_grade", *RUN_SCALARS_COUNT_COLUMNS)


def dimension_from_row(row: tuple) -> DimensionResult:
    """One ``dimension, overall_score, overall_grade, *counts`` row as a scalar
    dimension. A row written before the counts were stored (or for a dimension
    that had none) has NULL counts and reads back without totals, never as zeros."""
    col = dict(zip(_ROW_FIELDS, row, strict=True))
    totals = None
    if col["violation_count"] is not None:
        severity = SeverityTally(**{s.value: col[s.value] or 0 for s in SEVERITY_ORDER}, unknown=col["unknown"] or 0)
        totals = Totals(violation_count=col["violation_count"], compliance_count=col["compliance_count"] or 0,
                        severity=severity)
    return DimensionResult(dimension=col["dimension"], overall_score=col["overall_score"],
                           overall_grade=col["overall_grade"], totals=totals, open_types=col["open_types"])


def row_counts(d: DimensionResult) -> tuple:
    """The stored counts of *d*, in ``RUN_SCALARS_COUNT_COLUMNS`` order: NULLs when it carries no totals."""
    t = d.totals
    if t is None:
        return (*(None for _ in RUN_SCALARS_COUNT_COLUMNS[:-1]), d.open_types)
    sev = t.severity
    return (t.violation_count, t.compliance_count, *(getattr(sev, s.value) for s in SEVERITY_ORDER),
            sev.unknown, d.open_types)
