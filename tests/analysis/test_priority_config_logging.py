"""load_priority_config must not swallow a missing/malformed config silently."""
from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import patch

from quodeq.analysis.subagents.priority_config import (
    load_priority_config,
    reset_priority_config_cache,
)
from quodeq.analysis.subagents.priority_scoring import compute_base_score


def test_load_priority_config_logs_missing_file(caplog, tmp_path):
    fake_paths = SimpleNamespace(root=tmp_path)  # no config/file_priority.json here
    reset_priority_config_cache()
    try:
        with patch(
            "quodeq.analysis.subagents.priority_config.default_paths",
            return_value=fake_paths,
        ), caplog.at_level(logging.WARNING):
            result = load_priority_config()
        assert "default_path_score" in result
        assert any("file_priority" in r.message.lower() for r in caplog.records)
    finally:
        reset_priority_config_cache()


def test_a_missing_config_file_still_scores_files(tmp_path):
    fake_paths = SimpleNamespace(root=tmp_path)  # no config/file_priority.json here
    reset_priority_config_cache()
    try:
        with patch(
            "quodeq.analysis.subagents.priority_config.default_paths",
            return_value=fake_paths,
        ):
            assert compute_base_score("src/quodeq/api/app.py") > 0
    finally:
        reset_priority_config_cache()


def test_a_config_file_that_is_not_an_object_falls_back_to_defaults(tmp_path):
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "file_priority.json").write_text("[]", encoding="utf-8")
    reset_priority_config_cache()
    try:
        with patch(
            "quodeq.analysis.subagents.priority_config.default_paths",
            return_value=SimpleNamespace(root=tmp_path),
        ):
            assert compute_base_score("src/main.py") > 0
    finally:
        reset_priority_config_cache()
