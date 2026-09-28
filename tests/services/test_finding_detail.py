"""/scores defers detail from both accumulated lists; the detail route refills per kind."""
from __future__ import annotations

from quodeq.core.types.finding_type import FindingType
from quodeq.services.scoring.compliance_detail import DETAIL_FIELDS, defer_finding_detail, finding_detail


def _payload() -> dict:
    row = {
        "file": "a.py", "line": 1, "practiceId": "P1", "title": "t", "snippet": "s", "reason": "r",
        "context": "c", "reqRefs": [{"label": "x", "url": "u"}],
    }
    return {"accumulated": {"dimensions": [
        {"dimension": "security", "violations": [dict(row)], "compliance": [dict(row, file="b.py")]},
    ], "summary": {}}}


def test_defers_both_lists_without_mutating_the_input() -> None:
    payload = _payload()
    wire = defer_finding_detail(payload)
    for key in ("violations", "compliance"):
        item = wire["accumulated"]["dimensions"][0][key][0]
        assert item["detailDeferred"] is True
        assert not (set(item) & DETAIL_FIELDS)
        assert "title" in item and "file" in item
    assert payload["accumulated"]["dimensions"][0]["violations"][0]["snippet"] == "s"
    assert "detailDeferred" not in payload["accumulated"]["dimensions"][0]["compliance"][0]


def test_detail_filters_by_kind_principle_and_prefix() -> None:
    payload = _payload()
    assert finding_detail(payload, "security", FindingType.VIOLATION)[0]["file"] == "a.py"
    assert finding_detail(payload, "security", FindingType.COMPLIANCE)[0]["file"] == "b.py"
    assert finding_detail(payload, "security", FindingType.VIOLATION, principle="P9") == []
    assert finding_detail(payload, "security", FindingType.VIOLATION, path_prefix="a")[0]["reqRefs"]
    assert finding_detail(payload, "nope", FindingType.VIOLATION) == []


def test_payload_without_accumulated_is_returned_as_is() -> None:
    payload = {"trend": []}
    assert defer_finding_detail(payload) is payload
