"""FilesystemActionProvider.get_live_findings forwards its dirs to the service."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from quodeq.services.filesystem import FilesystemActionProvider


def test_forwards_compiled_and_evaluators_dirs(tmp_path: Path) -> None:
    provider = FilesystemActionProvider()
    with patch("quodeq.services.filesystem.live_findings.get_live_findings", return_value={"ok": 1}) as fn:
        out = provider.get_live_findings(str(tmp_path), "proj", "run1", ["security", "usability"])
    assert out == {"ok": 1}
    fn.assert_called_once_with(
        str(tmp_path), "proj", "run1", ["security", "usability"],
        compiled_dir=provider._compiled_dir, evaluators_dir=provider._evaluators_dir,
    )
