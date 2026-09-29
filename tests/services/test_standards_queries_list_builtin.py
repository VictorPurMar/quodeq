"""list_builtin must skip malformed per-dimension entries, mirroring list_custom."""
from __future__ import annotations

from pathlib import Path

from quodeq.services._standards_queries import list_builtin


def test_list_builtin_skips_dimension_missing_id() -> None:
    """A dimension entry missing 'id' must be skipped, not raise, mirroring
    list_custom's try/except (OSError, ValueError, KeyError) guard."""
    dimensions_data = {
        "applies": [
            {"id": "security", "source": "OWASP"},
            {"source": "no id here"},  # malformed: missing required 'id'
            {"id": "performance", "source": "ISO"},
        ]
    }

    def fake_read_json(path: Path) -> dict:
        return dimensions_data

    result = list_builtin(
        dimensions_file=Path("/fake/dimensions.json"),
        compiled_dir=Path("/fake/compiled"),
        read_json=fake_read_json,
    )

    ids = [meta.id for meta in result]
    assert ids == ["security", "performance"]


def test_bundled_standards_carry_their_family_and_edition() -> None:
    """ISO dimensions read as the builtin family at edition 25010; accessibility
    is its own WCAG family at 2.2; quodeq standards have no edition."""
    import json

    import quodeq

    data_dir = Path(quodeq.__file__).parent / "data"
    metas = {
        m.id: m for m in list_builtin(
            dimensions_file=data_dir / "config" / "dimensions.json",
            compiled_dir=data_dir / "standards" / "compiled",
            read_json=lambda p: json.loads(p.read_text(encoding="utf-8")),
        )
    }

    assert (metas["security"].type, metas["security"].subtype) == ("builtin", "25010")
    assert (metas["accessibility"].type, metas["accessibility"].subtype) == ("wcag", "2.2")
    assert (metas["clean-architecture"].type, metas["clean-architecture"].subtype) == ("quodeq", None)
    assert metas["accessibility"].requirement_count == 35
