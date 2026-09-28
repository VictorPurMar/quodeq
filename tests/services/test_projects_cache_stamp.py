"""The "rebuild once warm-up moves while a summary is pending" rule, on both tiers.

The full-payload tier is pinned in test_projects_cache_entities.py; this file
pins the paginated (hydrated) tier, which shares one stamp rule with it.
"""
from __future__ import annotations

from unittest.mock import patch

from quodeq.core.types import ProjectEntry
from quodeq.services.filesystem import ProjectsCache

_INDEX_TARGET = "quodeq.services._projects_cache._fs_project_index.build_project_index"
_ENTRIES_TARGET = "quodeq.services._projects_cache._fs_project_index.build_project_entries"
_GENERATION_TARGET = "quodeq.services._projects_cache.warmup_engine.generation"


def _page_twice(pending: bool, *, warmed_between: bool = False) -> int:
    """Request the same page twice; return how many times hydration rebuilt it."""
    index = [ProjectEntry(id="p1", name="p1")]
    hydrated = [ProjectEntry(id="p1", name="p1", summary_pending=pending)]
    with patch(_INDEX_TARGET, return_value=index), patch(
        _ENTRIES_TARGET, return_value=hydrated,
    ) as build, patch(_GENERATION_TARGET, side_effect=_generations(warmed_between)):
        cache = ProjectsCache()
        cache.list("/reports", offset=0, limit=10)
        cache.list("/reports", offset=0, limit=10)
    return build.call_count


def _generations(warmed_between: bool):
    """Warm-up generation per call: it moves after the first build when *warmed_between*."""
    first = [0]
    rest = 1 if warmed_between else 0
    return lambda: first.pop() if first else rest


def test_pending_hydrated_entries_are_reused_until_warmup_moves():
    assert _page_twice(pending=True) == 1


def test_pending_hydrated_entries_rebuild_once_a_project_warms():
    assert _page_twice(pending=True, warmed_between=True) == 2


def test_settled_hydrated_entries_are_served_from_the_cache():
    assert _page_twice(pending=False) == 1
