"""The two outcomes of admission. There is no third, half-derived one."""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from quodeq.core.admission.facts import FindingFacts


class UnmappedReason(StrEnum):
    """Why a finding could not be placed in its standard."""

    NO_STANDARD = "no_standard"            # the dimension has no loaded standard
    MISSING_REQUIREMENT = "missing_requirement"  # no requirement code and no usable hint
    UNKNOWN_REQUIREMENT = "unknown_requirement"  # a code the standard does not define


@dataclass(frozen=True, slots=True)
class Admitted:
    """A finding with every standard-derived field set.

    ``req`` is the canonical requirement id, or None for a legacy row that
    named its principle directly. ``folded`` is True when the reported code was
    a near miss (case, prefix, leading zeros) folded onto the canonical one;
    ``routed`` is True when the code belongs to another loaded dimension.
    """

    facts: FindingFacts
    dimension: str
    req: str | None
    principle: str
    refs: tuple[dict, ...] = ()
    folded: bool = False
    routed: bool = False


@dataclass(frozen=True, slots=True)
class Unmapped:
    """A finding the standard cannot place, kept with the reason and hints.

    ``nearest`` lists valid requirement ids of the declared dimension, closest
    first, for telling the model what it could have meant.
    """

    facts: FindingFacts
    dimension: str | None
    reason: UnmappedReason
    nearest: tuple[str, ...] = ()
