"""Compare-screen endpoints.

/api/fleet/compare?projects=a,b,c -- the slim accumulated scores + trend of
every listed project in one response, findings stripped, over one
score-cache connection. A project that is unknown or fails to build is
reported in ``errors`` by name and does not block the others.

/api/projects/{project}/compare-summary -- the same summary for one project.
"""
from __future__ import annotations

import logging
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, jsonify, request

from quodeq.api._constants import CODE_INTERNAL_ERROR, CODE_INVALID_INPUT, CODE_NOT_FOUND
from quodeq.api.helpers import json_error, validate_segment
from quodeq.api.routes_common import reports_dir
from quodeq.services.compare import COMPARE_ERRORS, build_compare_summary, build_fleet_compare
from quodeq.shared.log_sink import LoggerSink

_logger = logging.getLogger(__name__)
#: The sink the fleet builder reports per-project failures through.
FLEET_LOG = LoggerSink(_logger)

FLEET_PROJECTS_ARG = "projects"


def fleet_projects_or_error() -> list[str] | tuple[Response, int]:
    """The ``projects`` query list (comma separated, blanks dropped), or a coded 400.

    Every name is checked as a path segment before any filesystem access;
    an empty list is a 400 too, since a fleet request without projects is a
    client error rather than an empty fleet.
    """
    names = [n.strip() for n in request.args.get(FLEET_PROJECTS_ARG, "").split(",")]
    names = [n for n in names if n]
    if not names:
        return json_error(f"{FLEET_PROJECTS_ARG} is required", HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT)
    err = validate_segment(*names, message="Invalid project name")
    return err if err is not None else names


def register_compare_routes(app: Flask) -> None:
    """Register the Compare endpoints."""

    @app.get("/api/fleet/compare")
    def fleet_compare() -> Response | tuple[Response, int]:
        names = fleet_projects_or_error()
        if not isinstance(names, list):
            return names
        return jsonify(build_fleet_compare(Path(reports_dir()), names, log=FLEET_LOG))

    @app.get("/api/projects/<project>/compare-summary")
    def project_compare_summary(project: str) -> Response | tuple[Response, int]:
        err = validate_segment(project)
        if err is not None:
            return err
        try:
            result = build_compare_summary(Path(reports_dir()), project)
        except COMPARE_ERRORS:
            _logger.exception("Unexpected error building compare summary for project %s", project)
            return json_error("Failed to load compare summary", HTTPStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_ERROR)
        if result is None:
            return json_error("Project not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
        return jsonify(result)
