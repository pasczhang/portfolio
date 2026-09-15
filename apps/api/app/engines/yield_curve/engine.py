from __future__ import annotations

from datetime import date

import QuantLib as ql


class YieldCurveEngine:
    def build_zero_curve(
        self,
        as_of: date,
        tenors: list[str],
        rates: list[float],
        calendar: ql.Calendar | None = None,
    ) -> ql.YieldTermStructureHandle:
        cal = calendar or ql.HongKong()
        ql_as_of = ql.Date(as_of.day, as_of.month, as_of.year)
        ql.Settings.instance().evaluationDate = ql_as_of
        dates = [ql_as_of]
        for tenor in tenors:
            dates.append(cal.advance(ql_as_of, ql.Period(tenor)))
        curve = ql.ZeroCurve(dates, [rates[0]] + rates, ql.Actual365Fixed(), cal)
        curve.enableExtrapolation()
        return ql.YieldTermStructureHandle(curve)
