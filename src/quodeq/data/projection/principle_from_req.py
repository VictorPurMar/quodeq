"""Assign a principle to a finding whose stored principle is blank.

A finding replayed from the result cache can carry its requirement code but no
principle (its scan ran before the standard was loaded). The grade tables must
not score those under a blank principle of their own. The requirement code is
the one field that survives, so the standard's requirement-to-principle map
places them. A code the standard does not define stays unassigned.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from quodeq.config.paths import default_paths
from quodeq.core.evidence.req_mapping import PrincipleResolver, build_principle_resolver
from quodeq.data.fs.standards_loader import read_req_to_principle_map

_logger = logging.getLogger(__name__)

PrincipleLookup = Callable[[str, str | None], str | None]


def _existing(path: Path | None) -> Path | None:
    return path if path is not None and path.is_dir() else None


def default_standards_dirs() -> tuple[Path | None, Path | None]:
    """(compiled_dir, evaluators_dir) of this install; None when absent."""
    paths = default_paths()
    compiled = paths.standards_dir / "compiled" if paths.standards_dir else None
    return _existing(compiled), _existing(paths.evaluators_dir)


def make_principle_lookup(
    compiled_dir: Path | None = None, evaluators_dir: Path | None = None,
) -> PrincipleLookup:
    """Return ``lookup(dimension, req) -> principle | None``.

    Resolvers are built once per dimension. A dimension whose standard defines
    no requirement ids never resolves: with nothing to map through, the code
    itself must not stand in for a principle.
    """
    resolvers: dict[str, PrincipleResolver] = {}

    def lookup(dimension: str, req: str | None) -> str | None:
        if not req or not dimension:
            return None
        key = dimension.lower()
        resolver = resolvers.get(key)
        if resolver is None:
            resolver = build_principle_resolver(
                key, evaluators_dir, compiled_dir, req_map_reader=read_req_to_principle_map,
            )
            resolvers[key] = resolver
        if not resolver.req_to_principle:
            return None
        return resolver.resolve(req)

    return lookup


def warn_unmapped(unmapped_by_dimension: dict[str, int]) -> None:
    """Say, once per dimension, how many findings could not be placed."""
    for dimension, count in sorted(unmapped_by_dimension.items()):
        _logger.warning(
            "%d %s finding(s) have no principle and their requirement code is not "
            "in the dimension's standard; left out of the grade", count, dimension,
        )
