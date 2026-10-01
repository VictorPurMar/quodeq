"""Score-cache DB plumbing: path resolution, schema, and corrupt-db repair.

Disposable/best-effort by design: a corrupt or older-schema db is unlinked and
rebuilt instead of surfacing an error to the caller.
"""
from __future__ import annotations

import logging
import sqlite3
import threading
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Iterator

from quodeq.data.sqlite.constants import SQLITE_BUSY_TIMEOUT_MS
from quodeq.data.sqlite._score_cache_epoch import (
    CACHE_WRITER_EPOCH, RUN_KEYS_SHAPE_SINCE_EPOCH, RUN_KEYS_SHAPE_VERSION,
)
from quodeq.data.sqlite.score_cache_rows import RUN_SCALARS_COUNT_COLUMNS
from quodeq.shared.env import get_score_cache_path

_logger = logging.getLogger(__name__)

# Shared-root isolation seam: when serving read endpoints from a
# second (shared) clone, the score cache must not mix rows with the local
# clone's cache. Unset (None) in every normal code path, so the default
# behavior below is byte-identical to before this seam existed.
_CACHE_PATH_OVERRIDE: ContextVar[str | None] = ContextVar(
    "score_cache_path_override", default=None
)


@contextmanager
def score_cache_path_override(path: str | Path) -> Iterator[None]:
    """Route score-cache reads/writes to *path* instead of the default DB.

    Active only for the duration of the ``with`` block (and any code it
    calls, via contextvars' task-local propagation); always restored,
    including when the block raises.
    """
    token = _CACHE_PATH_OVERRIDE.set(str(path))
    try:
        yield
    finally:
        _CACHE_PATH_OVERRIDE.reset(token)


_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS run_scalars ("
    " project TEXT NOT NULL, run_id TEXT NOT NULL, version TEXT NOT NULL,"
    " dimension TEXT NOT NULL, overall_score TEXT, overall_grade TEXT,"
    " violation_count INTEGER, compliance_count INTEGER,"
    " critical INTEGER, major INTEGER, minor INTEGER, unknown INTEGER, open_types INTEGER,"
    " updated_at TEXT NOT NULL DEFAULT (datetime('now')),"
    " PRIMARY KEY (project, run_id, dimension, version));"
    "CREATE INDEX IF NOT EXISTS idx_run_scalars_lookup ON run_scalars(project, version);"
    "CREATE TABLE IF NOT EXISTS run_principle_scalars ("
    " project TEXT NOT NULL, run_id TEXT NOT NULL, version TEXT NOT NULL,"
    " dimension TEXT NOT NULL, principle TEXT NOT NULL, score TEXT, grade TEXT,"
    " PRIMARY KEY (project, run_id, dimension, principle, version));"
    "CREATE INDEX IF NOT EXISTS idx_run_principle_scalars_lookup ON run_principle_scalars(project, version);"
    "CREATE TABLE IF NOT EXISTS accumulated_cache ("
    " project TEXT NOT NULL, version TEXT NOT NULL, payload TEXT NOT NULL,"
    " updated_at TEXT NOT NULL DEFAULT (datetime('now')),"
    " PRIMARY KEY (project, version));"
    "CREATE TABLE IF NOT EXISTS project_summary_cache ("
    " project TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT NOT NULL);"
    "CREATE TABLE IF NOT EXISTS run_keys ("
    " project TEXT NOT NULL, run_id TEXT NOT NULL,"
    " dismiss_keys TEXT NOT NULL, class_keys TEXT NOT NULL,"
    " PRIMARY KEY (project, run_id));"
    "CREATE TABLE IF NOT EXISTS cache_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
)


_META_WRITER_EPOCH = "writer_epoch"
_META_RUN_KEYS_SHAPE = "run_keys_shape"


def _meta_value(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM cache_meta WHERE key=?", (key,)).fetchone()
    return row[0] if row is not None else None


def _stored_key_shape(conn: sqlite3.Connection) -> str | None:
    """The ``run_keys`` shape on disk; a cache from before the shape row infers it from its epoch."""
    shape = _meta_value(conn, _META_RUN_KEYS_SHAPE)
    if shape is not None:
        return shape
    epoch = _meta_value(conn, _META_WRITER_EPOCH)
    if epoch is not None and epoch.isdigit() and int(epoch) >= RUN_KEYS_SHAPE_SINCE_EPOCH:
        return RUN_KEYS_SHAPE_VERSION
    return None


def _rollback_quietly(conn: sqlite3.Connection) -> None:
    """Drop any pending transaction on *conn*; a failed rollback is only logged."""
    try:
        conn.rollback()
    except sqlite3.Error:
        _logger.debug("score cache rollback failed", exc_info=True)


def _sync_cache_meta(conn: sqlite3.Connection) -> None:
    """Record the writer epoch, purging ``run_keys`` once when its shape changed.

    ``run_scalars`` / ``accumulated_cache`` / ``project_summary_cache`` embed the
    epoch in their version hash and self-invalidate on a bump. ``run_keys`` rows
    are not version-keyed, so a stale shape would stay frozen; they are purged
    when ``RUN_KEYS_SHAPE_VERSION`` changes, and kept across a payload-only
    epoch bump, since recomputing them hashes every finding of every run.
    """
    try:
        if _meta_value(conn, _META_WRITER_EPOCH) == CACHE_WRITER_EPOCH and \
                _meta_value(conn, _META_RUN_KEYS_SHAPE) == RUN_KEYS_SHAPE_VERSION:
            return
        if _stored_key_shape(conn) != RUN_KEYS_SHAPE_VERSION:
            conn.execute("DELETE FROM run_keys")
        conn.executemany(
            "INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, ?)",
            ((_META_WRITER_EPOCH, CACHE_WRITER_EPOCH), (_META_RUN_KEYS_SHAPE, RUN_KEYS_SHAPE_VERSION)),
        )
        conn.commit()
    except sqlite3.Error:
        # Roll back a purge whose meta write failed, so no later commit on
        # this connection can land it without the shape row it belongs to.
        _rollback_quietly(conn)
        _logger.warning("score cache meta sync failed", exc_info=True)


def _ensure_run_scalars_columns(conn: sqlite3.Connection) -> None:
    """Add the count columns to a ``run_scalars`` table created before them.

    ``CREATE TABLE IF NOT EXISTS`` leaves an existing table as it is, so an
    older cache file keeps its narrow table. The counts are NULL on its old
    rows (which the epoch bump retires anyway) and stored on new ones.
    """
    try:
        present = {row[1] for row in conn.execute("PRAGMA table_info(run_scalars)")}
        missing = [c for c in RUN_SCALARS_COUNT_COLUMNS if c not in present]
        if not missing:
            return
        # sqlite3 autocommits each DDL statement unless a transaction is
        # open; one explicit transaction makes the migration all-or-nothing.
        conn.execute("BEGIN")
        for column in missing:
            conn.execute(f"ALTER TABLE run_scalars ADD COLUMN {column} INTEGER")
        conn.commit()
    except sqlite3.Error:
        _rollback_quietly(conn)
        _logger.warning("run_scalars column migration failed", exc_info=True)


def _init(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
        conn.executescript(_SCHEMA)
        conn.commit()
        _ensure_run_scalars_columns(conn)
        _sync_cache_meta(conn)
    except sqlite3.DatabaseError:
        # Close before re-raising so the caller's rebuild path can unlink the
        # file with no open handle (Windows raises PermissionError otherwise).
        conn.close()
        raise
    return conn


# Serializes _init (and the corrupt-db rebuild). Concurrent first-opens of a
# fresh DB race the schema DDL; the loser's lock error is indistinguishable
# from corruption here, so the rebuild path would unlink the file out from
# under the winner's live WAL connection (observed as a SIGBUS on the mmap'd
# -shm). Only open/rebuild is serialized — yielded connections stay concurrent.
_OPEN_LOCK = threading.Lock()

# Files this process has fully initialized, keyed by
# (path, st_dev, st_ino, CACHE_WRITER_EPOCH). A hit skips the DDL, the commit
# and the epoch purge. The inode is in the key so a deleted and recreated file
# misses; path plus epoch alone would skip the DDL on a fresh empty file.
_INITIALIZED: set[tuple[str, int, int, str]] = set()


def _identity(path: Path) -> tuple[str, int, int, str] | None:
    try:
        st = path.stat()
    except OSError:
        return None
    return (str(path), st.st_dev, st.st_ino, CACHE_WRITER_EPOCH)


def _connect_initialized(path: Path) -> sqlite3.Connection:
    """Fast path for a file already initialized here: connect, set the busy
    timeout, and prove the schema is still there with one single-row read
    (an inode can be reused by a brand-new file)."""
    conn = sqlite3.connect(path)
    try:
        conn.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
        row = conn.execute(
            "SELECT value FROM cache_meta WHERE key='writer_epoch'"
        ).fetchone()
    except sqlite3.DatabaseError:
        conn.close()
        raise
    if row is None or row[0] != CACHE_WRITER_EPOCH:
        conn.close()
        raise sqlite3.DatabaseError("score cache not initialized for this epoch")
    return conn


def _open_locked(path: Path) -> sqlite3.Connection:
    """Open *path*, running the full init only on a memo miss. Caller holds _OPEN_LOCK."""
    ident = _identity(path)
    if ident in _INITIALIZED:
        try:
            return _connect_initialized(path)
        except sqlite3.DatabaseError:
            _INITIALIZED.discard(ident)
    try:
        conn = _init(path)
    except sqlite3.OperationalError:
        # Lock contention, not corruption -- another connection is mid-write.
        # Propagate so the caller can retry; deleting the file here would
        # destroy a live, healthy database out from under its writer.
        raise
    except sqlite3.DatabaseError:
        _logger.warning("score cache at %s unreadable; rebuilding", path)
        path.unlink(missing_ok=True)
        conn = _init(path)
    ident = _identity(path)
    if ident is not None:
        _INITIALIZED.add(ident)
    return conn


def _forget(path: Path) -> None:
    """Drop every memo entry for *path*, so its next open runs the full init."""
    key = str(path)
    with _OPEN_LOCK:
        _INITIALIZED.difference_update({i for i in _INITIALIZED if i[0] == key})


@contextmanager
def open_score_cache() -> Iterator[sqlite3.Connection]:
    """Open the score cache DB (WAL). Rebuilds from scratch if corrupt/older-schema.

    The first open of a file in this process runs the full init; later opens
    of the same file only connect. A DatabaseError raised inside the block
    forgets the file, so the next open runs the full init again.
    """
    override = _CACHE_PATH_OVERRIDE.get()
    path = Path(override) if override else Path(get_score_cache_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    with _OPEN_LOCK:
        conn = _open_locked(path)
    try:
        yield conn
    except sqlite3.DatabaseError:
        _forget(path)
        raise
    finally:
        conn.close()
