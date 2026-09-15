from __future__ import annotations

from datetime import date

import QuantLib as ql


class PricingEngine:
    """QuantLib discount / money-market pricing facade."""

    def discount_factor(self, rate: float, days: int, basis: str = "Act/365") -> float:
        dc = ql.Actual365Fixed() if basis == "Act/365" else ql.Actual360()
        t = days / dc.yearFraction(ql.Date(1, 1, 2024), ql.Date(1, 1, 2025))
        return 1.0 / (1.0 + rate * t)

    def money_market_price(self, face: float, rate: float, as_of: date, maturity: date) -> float:
        days = (maturity - as_of).days
        return face * self.discount_factor(rate, max(days, 0))
