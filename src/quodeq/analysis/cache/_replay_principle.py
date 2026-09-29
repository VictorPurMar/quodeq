"""Give a replayed cache finding its principle when the entry has none.

An entry written while its standard was not loaded carries a requirement code
and no principle. The repair goes on the event only: the cache entry and the
evidence JSONL row stay as they were.
"""
from __future__ import annotations

from dataclasses import dataclass

from quodeq.analysis.run_types import RunConfig
from quodeq.context.trust_model import TrustModel
from quodeq.data.projection.principle_from_req import (
    PrincipleLookup,
    default_standards_dirs,
    make_principle_lookup,
)


@dataclass(frozen=True)
class ReplayPolicy:
    """What a replay applies to cached findings: the trust model the severity
    gates read, and the lookup that gives a principle-less finding its principle."""

    trust_model: TrustModel | None = None
    principle_lookup: PrincipleLookup | None = None


def replay_principle_lookup(config: RunConfig) -> PrincipleLookup:
    """Requirement-to-principle lookup over this run's standards (custom
    evaluators first, then the built-in ones), or the install's when the
    run configures neither."""
    compiled = config.standards_dir / "compiled" if config.standards_dir else None
    evaluators = config.evaluators_dir
    if compiled is None and evaluators is None:
        compiled, evaluators = default_standards_dirs()
    return make_principle_lookup(compiled, evaluators)


def with_principle(finding: dict, lookup: PrincipleLookup | None) -> dict:
    """*finding* with ``p`` set from its ``req`` when it has none.

    Copy, do not mutate: the dict belongs to the cache entry. An entry written
    while its standard was not loaded has a requirement code and no principle.
    """
    if lookup is None or finding.get("p") or not finding.get("req"):
        return finding
    principle = lookup(finding.get("d") or "", finding["req"])
    return {**finding, "p": principle} if principle else finding
