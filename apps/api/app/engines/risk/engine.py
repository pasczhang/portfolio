from __future__ import annotations

from decimal import Decimal


class StressEngine:
    """Simple parallel yield shock for MMF shadow NAV sensitivity."""

    def parallel_yield_shock(self, market_value: Decimal, duration: Decimal, shock_bps: Decimal) -> Decimal:
        return (market_value * duration * shock_bps / Decimal("10000")).quantize(Decimal("0.01"))
