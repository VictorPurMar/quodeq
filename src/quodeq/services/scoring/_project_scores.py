"""Full dashboard scores payload: accumulated + trend + available runs.

Split from ``scoring/__init__.py`` to keep that file under the size
ratchet's 300-line cap. ``get_project_scores`` stays re-exported from there.
Fetchers are called through the ``_fetchers`` module attribute (not names
bound into this module's namespace) so tests can still
``monkeypatch.setattr(_fetchers, "make_scoring_trend_fetcher", ...)`` and have it
take effect here.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from quodeq.core.run.state import TERMINAL_STATES, RunState
from quodeq.core.scoring.params import ScoringParams
from quodeq.services.dashboard_trend import build_accumulated_trend
from quodeq.services.accumulated import compute_accumulated
from quodeq.services.grade_formula import is_custom, load_params
from quodeq.services.scoring_view import select_trend_runs
from quodeq.services.score_cache import (
    accumulated_cache_version,
    accumulated_stale_scope,
    cached_accumulated,
    per_run_versions,
    suppression_state_fingerprint,
)
from quodeq.services.deleted import deleted_keys
from quodeq.services.dismissed import dismissed_keys
from quodeq.services.suppression_keys import SuppressionKeys
from quodeq.shared.log_sink import SHARED_LOG
from quodeq.shared.stamp_memo import StampCache
from quodeq.services.wiring import find_children, list_runs, run_fingerprint
from quodeq.services.scoring import _fetchers
from quodeq.services.scoring._deps import ScoringDeps, NO_DEPS
from quodeq.services.scoring._rescoring import rescore_accumulated_with_coverage


@dataclass(frozen=True, slots=True)
class _ScoresRequest:
    """One ``get_project_scores`` call's inputs, shared by its accumulated steps."""

    reports_root: Path
    project: str
    as_of: str | None
    params: ScoringParams
    deps: ScoringDeps


def _compute_accumulated_payload(req: _ScoresRequest, rescore_complete: list[bool]) -> dict:
    """Compute accumulated dims + summary, rescored, tracking coverage in
    *rescore_complete* (a 1-element list used as an outparam) so the caller's
    cache-eligibility check can see it."""
    acc = compute_accumulated(
        str(req.reports_root), req.project, req.as_of, params=req.params, log=SHARED_LOG,
    )
    if acc is None:
        acc = {"dimensions": [], "summary": {}}
    payload, complete = rescore_accumulated_with_coverage(
        acc, req.reports_root, req.project, params=req.params, deps=req.deps,
    )
    rescore_complete[0] = complete
    return payload


def _resolve_accumulated(
    req: _ScoresRequest, rescore_complete: list[bool],
    run_versions: list[tuple], keys: SuppressionKeys,
) -> dict:
    """Compute (or fetch from cache) the accumulated dims + summary."""
    if find_children(req.reports_root, req.project):
        # Parent aggregation pulls child projects' dismissals/runs into the
        # payload, which the project-scoped cache version can't see -- bypass
        # the cache for parents to avoid serving stale data.
        return _compute_accumulated_payload(req, rescore_complete)
    stale_scope = accumulated_stale_scope(
        req.params, run_versions, req.as_of,
        suppression_state_fingerprint(req.params, keys.dismissed, keys.deleted),
    )
    return (req.deps.cached_accumulated or cached_accumulated)(
        req.project, accumulated_cache_version(req.params, run_versions, req.as_of),
        lambda: _compute_accumulated_payload(req, rescore_complete),
        cacheable=lambda _payload: rescore_complete[0],
        stale_scope=stale_scope, log=SHARED_LOG,
    )


def _resolve_trend(
    reports_root: Path, project: str, params: ScoringParams,
    deps: ScoringDeps | None, all_runs: list,
) -> list[dict]:
    """Build trend using the appropriate fetcher: scalar fast path when there
    are no active dismissals/deletions, rescoring (findings) path otherwise.
    Shared trend rule (scoring_view.select_trend_runs): cancelled/failed
    runs are excluded — their partial scores are misleading on the history
    chart. They remain in availableRuns so the UI can show them when the
    user asks for them explicitly."""
    scoreable_runs = select_trend_runs(all_runs)
    history_runs = scoreable_runs[:_fetchers.max_history_runs()]
    # Only completed runs may be persisted to the score cache: an in-progress
    # run's scalar set is still growing, and the cache version can't see that,
    # so caching its partial set would strand a stale row (e.g. 1 of 6 dims)
    # served forever after the run finishes.
    cacheable_run_ids = {r.run_id for r in history_runs if r.status is RunState.DONE}
    trend_fetcher = _fetchers.make_scoring_trend_fetcher(
        reports_root, project, params=params, cacheable_run_ids=cacheable_run_ids,
        deps=deps,
    )
    return build_accumulated_trend(history_runs, trend_fetcher, params=params)


def _empty_project_scores(scoring_meta: dict) -> dict[str, Any]:
    return {
        "accumulated": {"dimensions": [], "summary": {}},
        "trend": [],
        "availableRuns": [],
        "scoring": scoring_meta,
    }


#: One full payload per project (latest only); a decoded payload can be tens
#: of MB, so the bound is a handful of projects, like the stale slots.
PAYLOAD_MEMO_MAX = 8
_PAYLOADS = StampCache(max_entries=PAYLOAD_MEMO_MAX)


def _payload_stamp(
    req: _ScoresRequest, all_runs: list, run_versions: list[tuple], keys: SuppressionKeys, custom: bool,
) -> tuple:
    """Everything the payload depends on: the accumulated version (params,
    per-run content), the project's suppression state, each run's status,
    the formula flag, and the files of every run still in flight (its cache
    version only sees suppressions that touch it, yet its trend point moves
    with every dimension it scores)."""
    project_dir = req.reports_root / req.project
    in_flight = tuple(
        (r.run_id, run_fingerprint(project_dir / r.run_id))
        for r in all_runs if r.status not in TERMINAL_STATES
    )
    return (
        accumulated_cache_version(req.params, run_versions, req.as_of),
        suppression_state_fingerprint(req.params, keys.dismissed, keys.deleted),
        tuple((r.run_id, str(r.status)) for r in all_runs),
        in_flight,
        custom,
    )


def _build_project_scores(
    req: _ScoresRequest, all_runs: list, scoring_meta: dict,
    run_versions: list[tuple], keys: SuppressionKeys,
) -> tuple[dict[str, Any], bool]:
    """The payload and whether its rescore covered every dimension."""
    # The rescore-coverage flag rides in a cell so the cacheable gate can see
    # it: a payload whose rescore missed dimensions must be served but never
    # persisted (its version hash can't self-invalidate).
    rescore_complete = [True]
    accumulated = _resolve_accumulated(req, rescore_complete, run_versions, keys)
    trend = _resolve_trend(req.reports_root, req.project, req.params, req.deps, all_runs)
    payload = {
        "accumulated": accumulated,
        "trend": trend,
        "availableRuns": [
            {"runId": r.run_id, "dateLabel": r.date_label, "status": r.status}
            for r in all_runs
        ],
        "scoring": scoring_meta,
    }
    return payload, rescore_complete[0]


def get_project_scores_stamped(
    reports_root: Path, project: str, as_of: str | None = None,
    deps: ScoringDeps | None = None,
) -> tuple[dict[str, Any] | None, tuple | None]:
    """The full scores payload for the dashboard, with the stamp it was built under.

    Returns a dict with:
      - accumulated: { dimensions, summary } (same shape as /accumulated endpoint)
      - trend: [{ runId, dateISO, ... }] (same shape as dashboard.trend)
      - availableRuns: [{ runId, dateLabel, status }]
    All scores have dismissals applied server-side.

    The payload is reused while the stamp holds, so an unchanged project
    costs the stamp (run listing, per-run versions) and no cache decode,
    trend rebuild or rescore. The stamp is None when there is nothing to
    memoize: no project, no runs, or a parent project (its payload folds in
    children the stamp cannot see).
    """
    if not (reports_root / project).exists():
        return None, None
    d = deps or NO_DEPS
    params = load_params()
    # How the numbers were produced, not what they are. A tuned formula moves
    # every score at once and leaves no other trace -- findings and runs are
    # unchanged -- so the Overview has to be able to say so next to the grade.
    scoring_meta = {"customFormula": (d.is_custom_formula or is_custom)()}
    all_runs = list_runs(reports_root, project)
    if not all_runs:
        return _empty_project_scores(scoring_meta), None
    req = _ScoresRequest(reports_root, project, as_of, params, d)
    project_dir = reports_root / project
    keys = SuppressionKeys(dismissed_keys(project_dir), deleted_keys(project_dir))
    parent = find_children(reports_root, project)
    # Parents never had per-run versions (they bypass the accumulated cache);
    # an as-of payload is frozen client-side already, so only the latest
    # payload of a project is worth an entry.
    if parent or as_of is not None:
        run_versions = [] if parent else per_run_versions(
            project_dir, project, params, [(r.run_id, r.status) for r in all_runs], keys=keys)
        return _build_project_scores(req, all_runs, scoring_meta, run_versions, keys)[0], None
    run_versions = per_run_versions(project_dir, project, params,
                                    [(r.run_id, r.status) for r in all_runs], keys=keys)
    stamp = _payload_stamp(req, all_runs, run_versions, keys, scoring_meta["customFormula"])
    key = f"{reports_root}|{project}"
    hit = _PAYLOADS.get(key, stamp)
    if hit is not None:
        return hit, stamp  # type: ignore[return-value]
    payload, complete = _build_project_scores(req, all_runs, scoring_meta, run_versions, keys)
    if complete:
        _PAYLOADS.put(key, stamp, payload)
    return payload, stamp


def get_project_scores(
    reports_root: Path, project: str, as_of: str | None = None,
    deps: ScoringDeps | None = None,
) -> dict[str, Any] | None:
    """The full scores payload for the dashboard (see ``get_project_scores_stamped``)."""
    return get_project_scores_stamped(reports_root, project, as_of, deps)[0]
