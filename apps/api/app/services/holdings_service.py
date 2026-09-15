from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel

from app.models.enums import CouponType
from app.seed_data import SeedHolding
from app.services.book_store import live_holdings


class HoldingDetail(BaseModel):
    security_id: str
    instrument: str
    product_type: str
    counterparty: str
    value_date: date
    maturity_date: date
    coupon_rate: Decimal
    coupon_rate_pct: Decimal
    tenor_days: int
    tenor: str
    amortized_cost: Decimal
    shadow_mtm: Decimal
    wam_days: Decimal
    wam_contribution: Decimal
    wal_days: Decimal
    weight_pct: Decimal
    fund_code: str = "BAM-USD-MMF"


class HoldingsResponse(BaseModel):
    as_of: date
    fund_code: str = "BAM-USD-MMF"
    aum_securities: Decimal
    row_count: int
    holdings: list[HoldingDetail]


def _q(value: Decimal, places: str = "0.01") -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


def _wam_days(item: SeedHolding, as_of: date, maturity: date, reset: date | None) -> int:
    end = reset if item.coupon_type is CouponType.FLOATING and reset is not None else maturity
    return max((end - as_of).days, 0)


def build_holdings(as_of: date | None = None) -> HoldingsResponse:
    as_of = as_of or date.today()
    materialized: list[tuple[SeedHolding, date, date, date | None]] = []
    for item in live_holdings():
        value_date = as_of + timedelta(days=item.value_date_offset)
        maturity = as_of + timedelta(days=item.maturity_offset)
        reset = as_of + timedelta(days=item.reset_offset) if item.reset_offset is not None else None
        materialized.append((item, value_date, maturity, reset))

    total = sum((item.amortized_cost for item, *_ in materialized), Decimal("0"))
    rows: list[HoldingDetail] = []
    for item, value_date, maturity, reset in materialized:
        tenor_days = max((maturity - as_of).days, 0)
        wam = Decimal(_wam_days(item, as_of, maturity, reset))
        wal = Decimal(tenor_days)
        weight = (item.amortized_cost / total) if total else Decimal("0")
        rows.append(
            HoldingDetail(
                security_id=item.security_id,
                instrument=item.instrument,
                product_type=item.product_type,
                counterparty=item.counterparty,
                value_date=value_date,
                maturity_date=maturity,
                coupon_rate=item.coupon_rate,
                coupon_rate_pct=_q(item.coupon_rate * 100, "0.001"),
                tenor_days=tenor_days,
                tenor=f"{tenor_days}D",
                amortized_cost=_q(item.amortized_cost),
                shadow_mtm=_q(item.shadow_mtm),
                wam_days=_q(wam, "0.01"),
                wam_contribution=_q(weight * wam, "0.01"),
                wal_days=_q(wal, "0.01"),
                weight_pct=_q(weight * 100, "0.01"),
            )
        )
    rows.sort(key=lambda r: (r.maturity_date, r.security_id))
    return HoldingsResponse(
        as_of=as_of,
        aum_securities=_q(total),
        row_count=len(rows),
        holdings=rows,
    )
