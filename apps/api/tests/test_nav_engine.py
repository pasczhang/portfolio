from app.engines.nav import NavEngine
from decimal import Decimal


def test_collar_bps() -> None:
    engine = NavEngine()
    assert engine.is_within_collar(
        official=Decimal("1.0000"),
        shadow=Decimal("1.0010"),
        limit_bps=Decimal("20"),
    )
