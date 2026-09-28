"""One slim payload for the Evaluate screen's live findings poll.

The per-dimension eval route returns a dimension's whole report (principles,
compliance, every violation field). The live feed reads a handful of keys
per row and counts rows per dimension, and it polls every 2 s for every
dimension of the running job, so on a 7-dimension run that was 7 requests
and tens of megabytes per tick. This returns every requested dimension in
one body and memoizes each dimension on the stamps of the files that can
change its rows, so an unchanged dimension costs a few ``stat`` calls. The
rows are handed back in whatever shape the dimension eval produced; the
route (``api/live_findings_wire.py``) camelizes them.

Only READY entries are memoized: a dimension with nothing written is cheap
to re-check, and a read failure the resolver swallows into "nothing found"
would otherwise be pinned until the process restarts. The memo holds whole
row lists, so it is bounded to a couple of runs' worth of dimensions; the
Evaluate screen polls one run at a time.
"""
from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum
from pathlib import Path
from typing import Any

from quodeq.core.types import EvalPending
from quodeq.services import fs_reports
from quodeq.services.wiring import ACTIONS_LOG_FILENAME, DELETED_FILENAME, dimension_evidence_file
from quodeq.shared.constants import EVIDENCE_DIRNAME
from quodeq.shared.stamp_memo import StampCache, file_stamp


class LiveFindingState(StrEnum):
    """What the per-dimension route would have answered for this dimension."""

    READY = "ready"      # a payload (200)
    WAITING = "waiting"  # EvalPending (202)
    MISSING = "missing"  # None (404)
    ERROR = "error"      # the resolver raised (500); the other dimensions still render


STATE_KEY = "state"
VIOLATIONS_KEY = "violations"

#: Whole row lists for (run, dimension): two 7-dimension runs' worth.
MEMO_MAX_ENTRIES = 16

#: Process-wide memo; tests patch this with a fresh ``StampCache``.
_CACHE = StampCache(max_entries=MEMO_MAX_ENTRIES)


def _entry(state: LiveFindingState, rows: list[Any]) -> dict[str, Any]:
    return {STATE_KEY: state, VIOLATIONS_KEY: rows}


def _source_paths(run_dir: Path, dimension: str) -> tuple[Path, ...]:
    """Every file whose change can change this dimension's rows."""
    project_dir = run_dir.parent
    return (
        run_dir / "evaluation" / f"{dimension}.json",
        run_dir / EVIDENCE_DIRNAME / f"{dimension}_evidence.json",
        dimension_evidence_file(run_dir, dimension),
        run_dir / EVIDENCE_DIRNAME / f"{dimension}_live.stream",
        project_dir / ACTIONS_LOG_FILENAME,
        project_dir / DELETED_FILENAME,
    )


def live_findings_stamp(run_dir: Path, dimension: str) -> tuple:
    """The memo stamp for one dimension: each source file's stamp, or None."""
    return tuple(file_stamp(p) for p in _source_paths(run_dir, dimension))


def _resolve(
    reports_dir: str, project: str, run_id: str, dimension: str,
    compiled_dir: Path | None, evaluators_dir: Path | None,
) -> dict[str, Any]:
    try:
        payload = fs_reports.get_dimension_eval(
            reports_dir, project, run_id, dimension,
            compiled_dir=compiled_dir, evaluators_dir=evaluators_dir,
        )
    except (OSError, ValueError, KeyError, TypeError):
        return _entry(LiveFindingState.ERROR, [])
    if payload is None:
        return _entry(LiveFindingState.MISSING, [])
    if isinstance(payload, EvalPending):
        return _entry(LiveFindingState.WAITING, [])
    rows = payload.get(VIOLATIONS_KEY) if isinstance(payload, dict) else payload.violations
    return _entry(LiveFindingState.READY, list(rows or []))


def _memoized_entry(run_dir: Path, dimension: str, compute: Any) -> dict[str, Any]:
    """The READY entry stored under the dimension's file stamps, else a fresh one."""
    key = f"{run_dir}|{dimension}"
    stamp = live_findings_stamp(run_dir, dimension)
    hit = _CACHE.get(key, stamp)
    if hit is not None:
        return hit  # type: ignore[return-value]
    entry = compute()
    if entry[STATE_KEY] == LiveFindingState.READY:
        _CACHE.put(key, stamp, entry)
    return entry


def get_live_findings(
    reports_dir: str, project: str, run_id: str, dimensions: Sequence[str],
    *, compiled_dir: Path | None = None, evaluators_dir: Path | None = None,
) -> dict[str, Any] | None:
    """The live feed body for *dimensions* of one run, or None when the run
    directory does not exist (or escapes *reports_dir*)."""
    root = Path(reports_dir).resolve()
    run_dir = (root / project / run_id).resolve()
    if not run_dir.is_relative_to(root) or not run_dir.is_dir():
        return None
    out: dict[str, Any] = {}
    for dimension in dimensions:
        out[dimension] = _memoized_entry(
            run_dir, dimension,
            lambda d=dimension: _resolve(reports_dir, project, run_id, d, compiled_dir, evaluators_dir),
        )
    return {"project": project, "runId": run_id, "dimensions": out}
