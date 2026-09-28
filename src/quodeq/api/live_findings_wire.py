"""Wire shaping for GET .../runs/<run_id>/live-findings.

``services.live_findings.get_live_findings`` hands back each dimension's
rows in whatever shape the dimension eval produced: stored camelCase dicts
once ``evaluation/<dim>.json`` exists, ``Finding`` dataclasses while the
run is still writing evidence. This is the one place that camelizes them
and keeps only the keys the live feed reads.
"""
from __future__ import annotations

from http import HTTPStatus

from flask import Response, jsonify

from quodeq.api._constants import CODE_NOT_FOUND
from quodeq.api.helpers import json_error
from quodeq.shared.serialization import to_camel_dict

#: The wire keys the live feed and the stat strip read. Everything else a
#: violation row carries (context, snippet, reason, reqRefs) is dropped.
LIVE_FINDING_KEYS: tuple[str, ...] = (
    "file", "line", "endLine", "severity", "practiceId", "req", "title",
    "carriedForward", "confidence", "provenanceDowngrade", "scope",
    "scopeDowngrade", "violationType", "cwe",
)

DIMENSIONS_KEY = "dimensions"
VIOLATIONS_KEY = "violations"


def _slim_row(row: object) -> dict:
    wire = to_camel_dict(row)
    if not isinstance(wire, dict):
        return {}
    return {k: wire[k] for k in LIVE_FINDING_KEYS if k in wire}


def live_findings_response(payload: dict | None) -> Response | tuple[Response, int]:
    """404 when the run does not exist, else the body with slim camelCase rows."""
    if payload is None:
        return json_error("Run not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    dimensions = {
        dim: {**entry, VIOLATIONS_KEY: [_slim_row(r) for r in entry.get(VIOLATIONS_KEY) or []]}
        for dim, entry in (payload.get(DIMENSIONS_KEY) or {}).items()
    }
    return jsonify({**payload, DIMENSIONS_KEY: dimensions})
