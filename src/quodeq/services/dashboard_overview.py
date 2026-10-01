"""The Overview dashboard's selected-run dimensions, slim and memoized.

The full dashboard parses the selected run's evaluation files, filters
dismissals and rescores on every request, then ships every violation and
compliance body: 10 to 34 MB the Overview never renders. The overview view
keeps the same scalars (the dismiss-adjusted, rescored ones) but memoizes
them, slimmed, on the stamps of everything that can change them: the run's
own files (``run_fingerprint``) and the project's dismissal, deletion and
rule files, plus the scoring params. The memo miss pays the full parse;
every other request pays a few ``stat`` calls.

Not in the stamp: the compiled standards and evaluator directories the
evidence rescore reads the req-to-principle map from. A standards
recompile therefore refreshes a project's overview scalars on its next
run write or dismissal, or on API restart, not immediately.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from quodeq.core.scoring.params import ScoringParams, params_to_dict
from quodeq.core.types import DimensionResult
from quodeq.services._accumulated_data import slim_dimensions
from quodeq.services.wiring import (
    ACTIONS_LOG_FILENAME,
    DELETED_FILENAME,
    SUPPRESSION_RULES_FILENAME,
    RunInfo,
    run_fingerprint,
)
from quodeq.shared.stamp_memo import StampCache, file_stamp

#: (slim dims, dismissed counts, suppressed counts) for a few runs' worth.
MEMO_MAX_ENTRIES = 16

#: Process-wide memo; tests patch this with a fresh ``StampCache``.
_CACHE = StampCache(max_entries=MEMO_MAX_ENTRIES, name="dashboard_overview")

SelectedDims = tuple[list[DimensionResult], dict[str, int], dict[str, int]]


def overview_stamp(reports_root: Path, project: str, run_id: str, params: ScoringParams) -> tuple:
    """Everything that can change the selected run's rescored scalars."""
    project_dir = reports_root / project
    return (
        run_fingerprint(project_dir / run_id),
        file_stamp(project_dir / ACTIONS_LOG_FILENAME),
        file_stamp(project_dir / DELETED_FILENAME),
        file_stamp(project_dir / SUPPRESSION_RULES_FILENAME),
        json.dumps(params_to_dict(params), sort_keys=True),
    )


def resolve_overview_dims(
    reports_root: Path, project: str, selected_run: RunInfo, params: ScoringParams,
    resolve_full: Callable[[], SelectedDims],
) -> SelectedDims:
    """*resolve_full*'s result with the bodies dropped, reused while the stamp holds."""
    key = f"{reports_root}|{project}|{selected_run.run_id}"
    stamp = overview_stamp(reports_root, project, selected_run.run_id, params)
    hit = _CACHE.get(key, stamp)
    if hit is not None:
        return hit  # type: ignore[return-value]
    dims, dismissed_counts, suppressed_counts = resolve_full()
    entry: Any = (slim_dimensions(dims), dismissed_counts, suppressed_counts)
    _CACHE.put(key, stamp, entry)
    return entry
