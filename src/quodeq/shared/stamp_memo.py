"""In-process memo keyed by an on-disk stamp.

A read that only depends on some files' contents can be reused while those
files have not changed. A stamp is whatever tuple identifies the inputs
(``file_stamp`` gives one file's mtime and size; callers combine several).
The stamp is taken before the read, so a write racing the read only costs
one extra recompute.

Bounded by a wholesale clear rather than an LRU: the set of keys a process
visits is small and stable, so the bound only guards against unbounded
growth.
"""
from __future__ import annotations

import threading
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

T = TypeVar("T")

MEMO_MAX = 4096


class StampCache:
    """Stamp-keyed store, bounded by a wholesale clear."""

    def __init__(self, max_entries: int = MEMO_MAX) -> None:
        self._entries: dict[str, tuple[tuple, object]] = {}
        self._lock = threading.Lock()
        self._max_entries = max_entries

    def get(self, key: str, stamp: tuple) -> object | None:
        """The value stored for *key* under *stamp*, or None when it is not current."""
        with self._lock:
            hit = self._entries.get(key)
        if hit is None or hit[0] != stamp:
            return None
        return hit[1]

    def put(self, key: str, stamp: tuple, value: object) -> None:
        """Store *value* for *key* under *stamp*, clearing wholesale when full."""
        with self._lock:
            if len(self._entries) >= self._max_entries:
                self._entries.clear()
            self._entries[key] = (stamp, value)

    def clear(self) -> None:
        """Drop every entry."""
        with self._lock:
            self._entries.clear()


#: Process-wide default; pass ``cache=`` to memoize into an isolated store.
DEFAULT_CACHE = StampCache()


def file_stamp(path: Path) -> tuple[int, int] | None:
    """Identity of *path*'s contents on disk, or None when it is not a file."""
    try:
        st = path.stat()
    except OSError:
        return None
    return (st.st_mtime_ns, st.st_size)


def memoized_by_stamp(
    key: str, stamp: tuple, compute: Callable[[], T | None], *, cache: StampCache | None = None,
) -> T | None:
    """``compute()`` for *key*, reused while *stamp* is unchanged.

    A None result is passed through without memoizing it, so a transient
    failure never freezes an empty result. Callers that hand the result out
    must copy it: the memo keeps the same object.
    """
    store = cache if cache is not None else DEFAULT_CACHE
    hit = store.get(key, stamp)
    if hit is not None:
        return hit  # type: ignore[return-value]
    value = compute()
    if value is None:
        return None
    store.put(key, stamp, value)
    return value
