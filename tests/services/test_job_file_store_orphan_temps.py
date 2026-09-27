"""FileJobStore removes old orphan ``*.tmp`` files on startup and keeps recent ones."""
from __future__ import annotations

import os
import time
from datetime import timedelta
from pathlib import Path

from quodeq.services.jobs import FileJobStore

_ONE_DAY_S = timedelta(days=1).total_seconds()


def test_old_orphan_temp_is_removed_and_a_recent_one_kept(tmp_path: Path):
    old = tmp_path / "job-a.abc123.tmp"
    recent = tmp_path / "job-b.def456.tmp"
    old.write_text("{", encoding="utf-8")
    recent.write_text("{", encoding="utf-8")
    stale = time.time() - _ONE_DAY_S
    os.utime(old, (stale, stale))

    FileJobStore(persist_dir=tmp_path)

    assert not old.exists()
    assert recent.exists()
