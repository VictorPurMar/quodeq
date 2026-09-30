"""Project dashboard, accumulated, evaluation, and violation routes."""
from __future__ import annotations

from http import HTTPStatus
from typing import Any

from flask import Flask, Response, jsonify, request

from quodeq.api._constants import CODE_INVALID_INPUT, CODE_NOT_FOUND
from quodeq.api.dimension_eval_wire import dimension_eval_response
from quodeq.api.helpers import json_error
from quodeq.core.types.dashboard_view import DashboardView
from quodeq.api.live_findings_wire import SINCE_PARAM, live_findings_response, parse_since
from quodeq.api.routes_common import reports_dir
from quodeq.shared.serialization import to_camel_dict
from quodeq.services.base import ActionProvider
from quodeq.services.run_constants import LATEST_RUN
from quodeq.shared.validation import validate_path_segment


def _validate_params(**params: str) -> tuple[Response, int] | None:
    """Validate each named route parameter one at a time, so the first
    invalid one names itself in the error message instead of a generic
    "Invalid parameter"."""
    for name, value in params.items():
        try:
            validate_path_segment(value)
        except ValueError:
            return json_error(
                f"{name} must be a plain path segment, got {value!r}",
                HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT,
            )
    return None


DIMENSIONS_PARAM = "dimensions"
DIMENSIONS_SEP = ","


def _parse_dimensions(raw: str | None) -> list[str] | tuple[Response, int]:
    """The ``dimensions`` query list: trimmed, empties dropped, order kept,
    duplicates dropped; a 400 when nothing is left or a name is not a plain
    path segment."""
    names = [s.strip() for s in (raw or "").split(DIMENSIONS_SEP)]
    unique = list(dict.fromkeys(n for n in names if n))
    if not unique:
        return json_error(
            f"{DIMENSIONS_PARAM} must list at least one dimension",
            HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT,
        )
    for name in unique:
        err = _validate_params(dimensions=name)
        if err:
            return err
    return unique


VIEW_PARAM = "view"


def _parse_view(raw: str | None) -> DashboardView | tuple[Response, int]:
    """``?view=``: absent means full; anything else must be a DashboardView."""
    if not raw:
        return DashboardView.FULL
    try:
        return DashboardView(raw)
    except ValueError:
        return json_error(
            f"{VIEW_PARAM} must be one of {[v.value for v in DashboardView]}, got {raw!r}",
            HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT,
        )


def _dashboard_response(provider: ActionProvider, project: str, args: Any) -> Response | tuple[Response, int]:
    """The dashboard body for ``?run=`` and ``?view=``: the full shape by
    default, the overview shape (no dimension bodies) on request."""
    run = args.get("run", LATEST_RUN)
    view = _parse_view(args.get(VIEW_PARAM))
    if not isinstance(view, DashboardView):
        return view
    fetch = provider.get_dashboard_overview if view is DashboardView.OVERVIEW else provider.get_dashboard
    try:
        return jsonify(fetch(reports_dir(), project, run))
    except FileNotFoundError:
        return json_error("Dashboard data not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)


def register_project_data_routes(app: Flask, provider: ActionProvider) -> None:
    """Register project dashboard, accumulated, evaluation, and violation routes."""

    @app.get("/api/projects/<project>/dashboard")
    def dashboard(project: str) -> Response | tuple[Response, int]:
        err = _validate_params(project=project)
        if err:
            return err
        return _dashboard_response(provider, project, request.args)

    @app.get("/api/projects/<project>/accumulated")
    def accumulated(project: str) -> Response | tuple[Response, int]:
        err = _validate_params(project=project)
        if err:
            return err
        as_of = request.args.get("asOf")
        payload = provider.get_accumulated(reports_dir(), project, as_of)
        if payload is None:
            return json_error("Project not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
        return jsonify(payload)

    @app.get("/api/projects/<project>/runs/<run_id>/dimensions/<dimension>/eval")
    def dimension_eval(project: str, run_id: str, dimension: str) -> Response | tuple[Response, int]:
        err = _validate_params(project=project, run_id=run_id, dimension=dimension)
        if err:
            return err
        return dimension_eval_response(provider.get_dimension_eval(reports_dir(), project, run_id, dimension))

    @app.get("/api/projects/<project>/runs/<run_id>/live-findings")
    def live_findings(project: str, run_id: str) -> Response | tuple[Response, int]:
        err = _validate_params(project=project, run_id=run_id)
        if err:
            return err
        dimensions = _parse_dimensions(request.args.get(DIMENSIONS_PARAM))
        if not isinstance(dimensions, list):
            return dimensions
        since = parse_since(request.args.get(SINCE_PARAM))
        if since is None:
            return json_error(
                f"{SINCE_PARAM} must be dim:count pairs", HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT,
            )
        return live_findings_response(
            provider.get_live_findings(reports_dir(), project, run_id, dimensions), since,
        )

    @app.get("/api/projects/<project>/runs/<run_id>/violations")
    def run_violations(project: str, run_id: str) -> Response | tuple[Response, int]:
        err = _validate_params(project=project, run_id=run_id)
        if err:
            return err
        try:
            payload = provider.get_violations(reports_dir(), project, run_id)
        except FileNotFoundError:
            return json_error("Violation data not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
        return jsonify(to_camel_dict(payload))
