"""Defer finding detail out of the /scores payload.

Violation and compliance items carry ``context``, ``snippet``, ``reason``
and ``reqRefs``, most of the payload's bytes. Only the Principle, File and
Finding pages and the Overview report render them, so /scores sends the
items without those fields (marked ``detailDeferred``) and
/compliance-detail serves them on demand, per kind, from the same
accumulated payload.
"""
from __future__ import annotations

from typing import Any

from quodeq.core.types.finding_type import FindingType

DETAIL_FIELDS = frozenset({"context", "snippet", "reason", "reqRefs"})
DETAIL_DEFERRED = "detailDeferred"
_LIST_KEY: dict[FindingType, str] = {FindingType.VIOLATION: "violations", FindingType.COMPLIANCE: "compliance"}


def _slim_item(item: dict[str, Any]) -> dict[str, Any]:
    slim = {k: v for k, v in item.items() if k not in DETAIL_FIELDS}
    slim[DETAIL_DEFERRED] = True
    return slim


def defer_finding_detail(payload: dict[str, Any]) -> dict[str, Any]:
    """*payload* with detail dropped from both accumulated lists.

    Copies every level it changes: the payload can be the accumulated cache's
    own dict, which later requests (including the detail route) read.
    """
    accumulated = payload.get("accumulated")
    if not isinstance(accumulated, dict):
        return payload
    dimensions = [
        {**dim, **{key: [_slim_item(c) for c in dim.get(key) or []] for key in _LIST_KEY.values()}}
        for dim in accumulated.get("dimensions") or []
    ]
    return {**payload, "accumulated": {**accumulated, "dimensions": dimensions}}


def finding_detail(
    payload: dict[str, Any], dimension: str, kind: FindingType,
    *, principle: str | None = None, path_prefix: str | None = None,
) -> list[dict[str, Any]]:
    """Full items of one kind in one accumulated dimension, in payload order."""
    dims = (payload.get("accumulated") or {}).get("dimensions") or []
    dim = next((d for d in dims if d.get("dimension") == dimension), None)
    if dim is None:
        return []
    return [
        c for c in dim.get(_LIST_KEY[kind]) or []
        if (principle is None or c.get("practiceId") == principle)
        and (path_prefix is None or str(c.get("file") or "").startswith(path_prefix))
    ]

