"""Unified scoring API endpoints.

/api/projects/{project}/scores          -- full dashboard payload (accumulated + trend)
/api/projects/{project}/scores/{runId}  -- single run detail (for Explorer)
/api/projects/{project}/compliance-detail -- compliance detail /scores defers

All rescore logic happens server-side. The frontend never calls /api/rescore
directly when using these endpoints.
"""
from __future__ import annotations

import logging
import sqlite3
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, jsonify, request

from quodeq.api._constants import CODE_INTERNAL_ERROR, CODE_INVALID_INPUT, CODE_NOT_FOUND
from quodeq.api.helpers import json_error, validate_segment
from quodeq.api.routes_common import reports_dir
from quodeq.core.types.finding_type import FindingType, parse_finding_type
from quodeq.services.scoring import get_project_scores_stamped, get_scores_slim
from quodeq.services.scoring.compliance_detail import defer_finding_detail, finding_detail
from quodeq.services.warmup import engine as warmup_engine
from quodeq.shared.stamp_memo import StampCache

_logger = logging.getLogger(__name__)

#: Shipped (deferred) payloads per (reports dir, project), reused while the
#: stamp holds; the service only stamps a project's latest payload.
WIRE_MEMO_MAX = 8
_WIRE = StampCache(max_entries=WIRE_MEMO_MAX, name="scores.wire")

KIND_PARAM = "kind"


def _load_scores(project: str) -> tuple[tuple[dict, tuple | None] | None, tuple[Response, int] | None]:
    """The full payload and its stamp (None when nothing memoizes), or an error."""
    as_of = request.args.get("asOf")
    eval_dir = reports_dir()
    try:
        result, stamp = get_project_scores_stamped(Path(eval_dir), project, as_of)
    except (OSError, sqlite3.Error, ValueError):
        _logger.exception("Unexpected error fetching scores for project %s", project)
        return None, json_error("Failed to load scores", HTTPStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_ERROR)
    if result is None:
        return None, json_error("Project not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    return (result, stamp), None


def _wire_payload(project: str, result: dict, stamp: tuple | None) -> dict:
    """The deferred payload, memoized on *stamp* when there is one.

    The stored dict is never mutated: ``defer_finding_detail`` copies what it
    changes and ``jsonify`` only reads.
    """
    if stamp is None:
        return defer_finding_detail(result)
    key = f"{reports_dir()}|{project}"
    hit = _WIRE.get(key, stamp)
    if hit is not None:
        return hit  # type: ignore[return-value]
    wire = defer_finding_detail(result)
    _WIRE.put(key, stamp, wire)
    return wire


def register_scores_routes(app: Flask) -> None:
    """Register unified scoring endpoints."""

    @app.get("/api/projects/<project>/scores")
    def project_scores(project: str) -> Response | tuple[Response, int]:
        err = validate_segment(project)
        if err:
            return err
        warmup_engine.prioritise(project)
        loaded, err = _load_scores(project)
        if err:
            return err
        return jsonify(_wire_payload(project, *loaded))

    @app.get("/api/projects/<project>/scores/<run_id>")
    def project_run_scores(project: str, run_id: str) -> Response | tuple[Response, int]:
        err = validate_segment(project, run_id)
        if err:
            return err
        eval_dir = reports_dir()
        try:
            result = get_scores_slim(Path(eval_dir), project, run_id)
        except FileNotFoundError:
            return json_error("Run not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
        except (OSError, sqlite3.Error, ValueError):
            _logger.exception("Unexpected error fetching run scores for project %s run %s", project, run_id)
            return json_error(
                "could not read run scores", HTTPStatus.INTERNAL_SERVER_ERROR, "SCORES_READ_FAILED"
            )
        return jsonify(result)

    _register_compliance_detail_route(app)


def _register_compliance_detail_route(app: Flask) -> None:
    @app.get("/api/projects/<project>/compliance-detail")
    def project_compliance_detail(project: str) -> Response | tuple[Response, int]:
        dimension = request.args.get("dimension")
        if not dimension:
            return json_error("dimension is required", HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT)
        err = validate_segment(project, dimension)
        if err:
            return err
        # ``kind`` picks the accumulated list to refill; compliance is the
        # pre-kind default so existing callers keep working.
        raw_kind = request.args.get(KIND_PARAM)
        kind = FindingType.COMPLIANCE if not raw_kind else parse_finding_type(raw_kind)
        if kind is None:
            return json_error(
                f"{KIND_PARAM} must be one of {[k.value for k in FindingType]}, got {raw_kind!r}",
                HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT,
            )
        loaded, err = _load_scores(project)
        if err:
            return err
        items = finding_detail(
            loaded[0], dimension, kind,
            principle=request.args.get("principle"),
            path_prefix=request.args.get("pathPrefix"),
        )
        return jsonify({"items": items})
