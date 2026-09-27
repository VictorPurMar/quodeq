"""``dismiss_by_type`` closes every active finding of one requirement code in a scope."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from quodeq.core.events.models import FindingDismissed, FindingDismissedEvent
from quodeq.core.finding_identity import snippet_fingerprint
from quodeq.core.types.finding_type import FindingType
from quodeq.services.dismissed import dismissed_keys
from quodeq.services.wiring import ActionLogWriter, read_active_findings


@dataclass(frozen=True, slots=True)
class DismissScope:
    """Which findings to dismiss: one requirement code in one dimension,
    narrowed to a principle and/or a file when given."""

    req: str
    dimension: str
    principle: str | None = None
    file: str | None = None
    reason: str | None = None


def _in_scope(row: dict, scope: DismissScope) -> bool:
    if row.get("verdict") != FindingType.VIOLATION or not scope.req or row.get("requirement") != scope.req:
        return False
    if str(row.get("dimension") or "").lower() != scope.dimension.lower():
        return False
    if scope.principle is not None and row.get("practice_id") != scope.principle:
        return False
    return scope.file is None or row.get("file") == scope.file


def select_findings(run_dir: Path, scope: DismissScope) -> list[dict]:
    """Active violation rows of *run_dir* inside *scope*."""
    return [row for row in read_active_findings(run_dir) if _in_scope(row, scope)]


def _event(row: dict, scope: DismissScope) -> FindingDismissedEvent:
    payload = FindingDismissed(
        req=scope.req, file=row["file"], line=int(row["line"]), reason=scope.reason,
        fingerprint=snippet_fingerprint(scope.req, row.get("snippet")),
    )
    return FindingDismissedEvent(payload=payload)


def dismiss_by_type(project_dir: Path, run_dir: Path, scope: DismissScope) -> int:
    """Emit one dismissal per finding in *scope* that is not dismissed yet,
    in one batch. Returns how many were emitted."""
    known = dismissed_keys(project_dir)
    rows = [
        row for row in select_findings(run_dir, scope)
        if not known.matches(req=scope.req, principle=row.get("practice_id") or "",
                             file=row["file"], line=int(row["line"]), snippet=row.get("snippet"))
    ]
    events = [_event(row, scope) for row in rows]
    ActionLogWriter(project_dir).emit_many(events)
    return len(events)
