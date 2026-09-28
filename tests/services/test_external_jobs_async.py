"""The external-run cancel returns without waiting out the SIGTERM grace window.

The cancel route calls this on a Flask request thread; waiting the grace
window (30s by default) plus the SIGKILL settle there held the worker for the
whole time a run took to die. Only SIGTERM is sent inline now.
"""
from __future__ import annotations

import os
import signal
import threading
import time

from quodeq.services._external_jobs import _FORCE_KILL_SIGNAL, ProcessControl, cancel_external_run
from tests._timeouts import budget

_GRACE_S = 3.0


def _write_pid(tmp_path) -> None:
    # A live pid, so the .pid lookup accepts it; the stub control never signals it.
    run_dir = tmp_path / "proj" / "run"
    run_dir.mkdir(parents=True)
    (run_dir / ".pid").write_text(str(os.getpid()))


class _StubbornProcess:
    """A pid that ignores SIGTERM and dies on SIGKILL."""

    def __init__(self) -> None:
        self.signals: list[int] = []
        self.killed = threading.Event()

    def kill_tree(self, _pid: int, sig: int) -> None:
        # The second signal is the escalation (SIGKILL; SIGTERM again on Windows).
        self.signals.append(sig)
        if len(self.signals) > 1:
            self.killed.set()

    def alive(self, _pid: int) -> bool:
        return not self.killed.is_set()


def test_cancel_returns_before_the_grace_window_and_escalates_in_the_background(tmp_path):
    _write_pid(tmp_path)
    proc = _StubbornProcess()
    background: list[threading.Thread] = []

    def _start(fn, name):
        thread = threading.Thread(target=fn, name=name, daemon=True)
        background.append(thread)
        thread.start()

    control = ProcessControl(kill_tree=proc.kill_tree, pid_alive=proc.alive, start_background=_start)

    start = time.monotonic()
    result = cancel_external_run("proj", "run", tmp_path, grace_period_s=_GRACE_S, control=control)
    elapsed = time.monotonic() - start

    assert result is True
    assert elapsed < _GRACE_S / 3, f"cancel blocked {elapsed:.2f}s on a {_GRACE_S}s grace window"
    assert proc.signals == [signal.SIGTERM]
    assert len(background) == 1
    background[0].join(timeout=budget(_GRACE_S + 5))
    assert proc.signals[-1] == _FORCE_KILL_SIGNAL


def test_wait_true_blocks_until_the_process_is_gone(tmp_path):
    _write_pid(tmp_path)
    proc = _StubbornProcess()

    def _no_background(_fn, _name):
        raise AssertionError("wait=True must escalate inline")

    control = ProcessControl(kill_tree=proc.kill_tree, pid_alive=proc.alive, start_background=_no_background)

    result = cancel_external_run("proj", "run", tmp_path, grace_period_s=0.05, control=control, wait=True)

    assert result is True
    assert proc.signals == [signal.SIGTERM, _FORCE_KILL_SIGNAL]
