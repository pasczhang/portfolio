from __future__ import annotations

from datetime import date
from decimal import Decimal


class NavEngine:
    """Amortized-cost official NAV and shadow MTM NAV with collar vs official."""

    def collar_bps(self, official: Decimal, shadow: Decimal) -> Decimal:
        if official == 0:
            return Decimal("0")
        return ((shadow - official) / official * Decimal("10000")).quantize(Decimal("0.01"))

    def is_within_collar(self, official: Decimal, shadow: Decimal, limit_bps: Decimal = Decimal("20")) -> bool:
        return abs(self.collar_bps(official, shadow)) <= limit_bps
