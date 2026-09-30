"""Wire shaping for GET .../runs/<run_id>/live-findings.

``services.live_findings.get_live_findings`` hands back each dimension's
rows in whatever shape the dimension eval produced: stored camelCase dicts
once ``evaluation/<dim>.json`` exists, ``Finding`` dataclasses while the
run is still writing evidence. This is the one place that camelizes them.
Rows go through whole: the feed's expanded row renders reason, reqRefs,
context and snippet (``components/findingDetail.jsx``). What this endpoint
leaves out is the report-level part of a dimension eval (principles,
compliance), which is most of its bytes.

``since`` (``dim:n,dim:n``) is each dimension's row count the client
already holds. The response carries every row after that offset plus the
dimension's total ``count``, so a polling client sends the whole list only
on its first request. When the list shrank below the offset (a dismissed
finding) the offset resets to 0 and the full list comes back; the echoed
``since`` tells the client which case it got.
"""
from __future__ import annotations

from http import HTTPStatus

from flask import Response, jsonify

from quodeq.api._constants import CODE_NOT_FOUND
from quodeq.api.helpers import json_error
from quodeq.shared.serialization import to_camel_dict

DIMENSIONS_KEY = "dimensions"
VIOLATIONS_KEY = "violations"
COUNT_KEY = "count"
SINCE_KEY = "since"
SINCE_PARAM = "since"
SINCE_PAIR_SEP = ","
SINCE_KV_SEP = ":"
NO_OFFSET = 0


def parse_since(raw: str | None) -> dict[str, int] | None:
    """``dim:n,dim:n`` to ``{dim: n}``; ``{}`` when absent, None when malformed."""
    out: dict[str, int] = {}
    for pair in (raw or "").split(SINCE_PAIR_SEP):
        pair = pair.strip()
        if not pair:
            continue
        dim, sep, n = pair.partition(SINCE_KV_SEP)
        if not sep or not dim.strip() or not n.strip().isdigit():
            return None
        out[dim.strip()] = int(n)
    return out


def _slice_entry(entry: dict, offset: int) -> dict:
    rows = list(entry.get(VIOLATIONS_KEY) or [])
    if offset > len(rows):
        offset = NO_OFFSET
    return {
        **entry,
        COUNT_KEY: len(rows),
        SINCE_KEY: offset,
        VIOLATIONS_KEY: to_camel_dict(rows[offset:]),
    }


def live_findings_response(
    payload: dict | None, since: dict[str, int] | None = None,
) -> Response | tuple[Response, int]:
    """404 when the run does not exist, else the body with camelCase rows
    after each dimension's ``since`` offset."""
    if payload is None:
        return json_error("Run not found", HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    offsets = since or {}
    dimensions = {
        dim: _slice_entry(entry, offsets.get(dim, NO_OFFSET))
        for dim, entry in (payload.get(DIMENSIONS_KEY) or {}).items()
    }
    return jsonify({**payload, DIMENSIONS_KEY: dimensions})
