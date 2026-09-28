"""Wire shaping for GET .../runs/<run_id>/live-findings.

``services.live_findings.get_live_findings`` hands back each dimension's
rows in whatever shape the dimension eval produced: stored camelCase dicts
once ``evaluation/<dim>.json`` exists, ``Finding`` dataclasses while the
run is still writing evidence. This is the one place that camelizes them.
Rows go through whole: the feed's expanded row renders reason, reqRefs,
context and snippet (``components/findingDetail.jsx``). What this endpoint
leaves out is the report-level part of a dimension eval (principles,
compliance), which is most of its bytes.
"""
from __future__ import annotations

from http import HTTPStatus

from flask import Response, jsonify

from quodeq.api._constants import CODE_NOT_FOUND
from quodeq.api.helpers import json_error
from quodeq.shared.serialization import to_camel_dict

DIMENSIONS_KEY = "dimensions"
VIOLATIONS_KEY = "violations"


def live_findings_response(payload: dict | None) -> Response | tuple[Response, int]:
    """404 when the run does not exist, else the body with camelCase rows."""
    if payload is None:
        return json_error("Run not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    dimensions = {
        dim: {**entry, VIOLATIONS_KEY: to_camel_dict(list(entry.get(VIOLATIONS_KEY) or []))}
        for dim, entry in (payload.get(DIMENSIONS_KEY) or {}).items()
    }
    return jsonify({**payload, DIMENSIONS_KEY: dimensions})
