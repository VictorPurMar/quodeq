"""GET /api/projects/<project>/runs/<run_id>/dimensions/<dimension>/explain."""
from __future__ import annotations

import logging
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response

from quodeq.api._constants import CODE_INTERNAL_ERROR, CODE_NOT_FOUND
from quodeq.api._http_cache import conditional_json
from quodeq.api.helpers import json_error, validate_segment
from quodeq.api.routes_common import reports_dir
from quodeq.services.grade_explain import DimensionNotFound, explain_dimension

_logger = logging.getLogger(__name__)
_ROUTE = "/api/projects/<project>/runs/<run_id>/dimensions/<dimension>/explain"


def grade_explain(project: str, run_id: str, dimension: str) -> Response | tuple[Response, int]:
    """The score stages per principle, from the scorer's own tallies."""
    err = validate_segment(project, run_id, dimension)
    if err is not None:
        return err
    try:
        payload = explain_dimension(Path(reports_dir()), project, run_id, dimension)
    except DimensionNotFound:
        return json_error("Dimension not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    except FileNotFoundError:
        return json_error("Run not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    except (OSError, ValueError):
        _logger.exception("Failed to explain %s of run %s for %s", dimension, run_id, project)
        return json_error("Failed to explain the grade", HTTPStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_ERROR)
    return conditional_json(payload, max_age=0)


def register_grade_explain_routes(app: Flask) -> None:
    """Bind the explain route."""
    app.get(_ROUTE)(grade_explain)
