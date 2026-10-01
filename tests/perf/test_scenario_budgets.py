"""Budgets for the fleet, history, polling and agent-spawn paths.

Same contract as ``test_request_budgets.py``: each scenario runs once on a
fixed fixture, its reads are counted, and the counts must equal the values
committed in ``scenario_budgets.json``. Two coarser metrics ride along:
response bytes per request (exact) and tracemalloc peak per scenario (a 20%
band, see ``_scenario_fixture.check_budgets``). The peak is taken on a warm
repeat of the scenario, measured once more if over budget, so it does not
depend on what the worker ran before or on one-off interpreter events.

Rewrite the budgets with ``QUODEQ_UPDATE_BUDGETS=1`` and commit the file in
the same PR as the change that moved them.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from quodeq.analysis.mcp.args import parse_args
from quodeq.analysis.mcp import findings_server
from quodeq.api.app import create_app
from quodeq.config.paths import default_paths
from quodeq.services import compare as compare_service
from tests.perf._budget_fixture import PROJECT, count_io, seed_project
from tests.perf._scenario_fixture import (
    AS_OF, FLEET, RUNNING_DIMENSIONS, RUNNING_JOB, RUNNING_RUN,
    PEAK_HEADROOM, check_budgets, freeze_progress_clock, get_ok, peak_kib, seed_fleet, seed_running_run,
)

_BUDGETS = Path(__file__).with_name("scenario_budgets.json")

pytestmark = pytest.mark.real_standards


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("QUODEQ_API_KEY", raising=False)
    reports = tmp_path / "evaluations"
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(reports))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    seed_project(reports)
    seed_running_run(reports)
    seed_fleet(reports)
    freeze_progress_clock(monkeypatch)
    app = create_app(static_dist=None, api_key=None)
    client = app.test_client()
    client.reports = reports
    return client


def _measure(monkeypatch, run, *, extra=lambda: {}, peak_budget=None) -> dict[str, int]:
    """Count I/O and bytes on a first run of *run*; take the tracemalloc peak from a warm repeat.

    A first call pays for lazy imports, module caches and the coverage tracer,
    and how much of that is still unpaid depends on what the xdist worker ran
    before, so the peak comes from a second run. One-off interpreter events
    can still land on that run (the interned-string table growing showed up
    as a 7 MiB allocation out of ``pathlib`` on macOS), so a peak over
    *peak_budget* is measured once more and the lower value kept. The repeat
    is conditional because each run is ~1500 file operations, which on the
    Windows runners is slow enough to matter against the test timeout.
    *extra* is snapshotted after the counting run; ``peak_budget=False``
    skips the peak for scenarios whose next call must stay cold.
    """
    with count_io(monkeypatch) as counts:
        response_bytes = run()
    out = {**counts, **extra(), "response_bytes": response_bytes}
    if peak_budget is False:
        return out
    with peak_kib() as measured:
        run()
    out["peak_kib"] = measured["peak_kib"]
    if peak_budget is not None and out["peak_kib"] > peak_budget * (1 + PEAK_HEADROOM):
        with peak_kib() as measured:
            run()
        out["peak_kib"] = min(out["peak_kib"], measured["peak_kib"])
    return out


def _compare_fleet(client, monkeypatch, peak_budget):
    calls = {"get_project_scores": 0}
    real = compare_service.get_project_scores

    def spy(*args, **kwargs):
        calls["get_project_scores"] += 1
        return real(*args, **kwargs)

    monkeypatch.setattr(compare_service, "get_project_scores", spy)
    return _measure(monkeypatch, lambda: sum(
        get_ok(client, f"/api/projects/{name}/compare-summary") for name in FLEET),
        extra=lambda: dict(calls), peak_budget=peak_budget)


def _scores_as_of(client):
    return get_ok(client, f"/api/projects/{PROJECT}/scores?asOf={AS_OF}")


def _eval_poll_tick(client):
    dims = ",".join(RUNNING_DIMENSIONS)
    return sum(get_ok(client, url) for url in (
        f"/api/evaluations/{RUNNING_JOB}",
        f"/api/evaluations/{RUNNING_JOB}/progress",
        f"/api/projects/{PROJECT}/runs/{RUNNING_RUN}/live-findings?dimensions={dims}",
    ))


def _agent_spawn(client):
    run_dir = client.reports / PROJECT / RUNNING_RUN
    findings_path = run_dir / "evidence" / "maintainability_evidence.jsonl"
    paths = default_paths()
    sa = parse_args([
        str(findings_path), "--compiled-dir", str(paths.standards_dir / "compiled"),
        "--standards-dir", str(paths.standards_dir), "--dimension", "maintainability",
        "--agent-id", "budget", "--work-dir", str(run_dir),
        "--cache-root", str(run_dir.parent.parent / "cache"), "--model-id", "budget-model",
    ])
    ctx = findings_server._build_compiled_context(sa)
    with findings_path.open("a", encoding="utf-8") as fh:
        findings_server._build_router(fh, findings_path, ctx, sa)
    return 0


def _scenarios(client, monkeypatch, budgets) -> dict[str, dict[str, int]]:
    def peak_budget(name):
        return budgets.get(name, {}).get("peak_kib")

    out: dict[str, dict[str, int]] = {}
    out["compare_fleet_10"] = _compare_fleet(client, monkeypatch, peak_budget("compare_fleet_10"))
    out["scores_as_of_cold"] = _measure(monkeypatch, lambda: _scores_as_of(client), peak_budget=False)
    out["scores_as_of_warm"] = _measure(
        monkeypatch, lambda: _scores_as_of(client), peak_budget=peak_budget("scores_as_of_warm"))
    out["eval_poll_tick"] = _measure(
        monkeypatch, lambda: _eval_poll_tick(client), peak_budget=peak_budget("eval_poll_tick"))
    out["agent_spawn"] = _measure(
        monkeypatch, lambda: _agent_spawn(client), peak_budget=peak_budget("agent_spawn"))
    return out


# Each scenario runs two to three times over ~1500 file operations; ~100s on
# the Windows runners when idle, which the suite-wide 240s cap does not cover
# once the runner is saturated.
@pytest.mark.timeout(480)
def test_scenario_reads_stay_within_budget(client, monkeypatch):
    updating = bool(os.environ.get("QUODEQ_UPDATE_BUDGETS"))
    budgets = {} if updating else json.loads(_BUDGETS.read_text(encoding="utf-8"))
    measured = _scenarios(client, monkeypatch, budgets)
    if updating:
        _BUDGETS.write_text(json.dumps(measured, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        pytest.skip("budgets rewritten")
    check_budgets(measured, budgets)
