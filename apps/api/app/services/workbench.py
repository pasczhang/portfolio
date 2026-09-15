"""PM workbench snapshot: SFC metrics + T+0..T+30 cash calendar."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel

from app.services.book_store import live_book
from app.services.engines.mmf_engine import (
    CashLadderEntry,
    EnginePosition,
    calculate_liquidity_ratios,
    calculate_shadow_pricing_deviation,
    calculate_wam_and_wal,
)


class CashLadderRow(BaseModel):
    date: date
    tenor: str
    subscription_inflow: Decimal
    redemption_outflow: Decimal
    principal_maturity: Decimal
    interest_income: Decimal
    fx_hedge_flow: Decimal
    closing_cash: Decimal
    net_flow: Decimal


class WorkbenchSnapshot(BaseModel):
    as_of: date
    fund_code: str = "BAM-USD-MMF"
    aum: Decimal
    official_nav: Decimal
    shadow_nav: Decimal
    deviation_bps: Decimal
    deviation_status: str
    wam_days: Decimal
    wal_days: Decimal
    dla_pct: Decimal
    wla_pct: Decimal
    wam_limit: int = 60
    wal_limit: int = 120
    dla_floor: Decimal = Decimal("10")
    wla_floor: Decimal = Decimal("30")
    cash_ladder: list[CashLadderRow]
    positions: list[EnginePosition]
    cash: list[CashLadderEntry]
    updated_at: str


def demo_book(as_of: date) -> tuple[list[EnginePosition], list[CashLadderEntry]]:
    return live_book(as_of)


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def build_cash_ladder(
    as_of: date,
    positions: list[EnginePosition],
    opening_cash: Decimal,
) -> list[CashLadderRow]:
    rows: list[CashLadderRow] = []
    cash = opening_cash
    for offset in range(0, 31):
        day = as_of + timedelta(days=offset)
        weekday = day.weekday() < 5
        sub = Decimal("2500000") if weekday and offset in {2, 9, 16, 23} else Decimal("0")
        if weekday and offset in {4, 11}:
            sub = Decimal("0")
        red = Decimal("1800000") if weekday and offset in {3, 10, 17} else Decimal("0")
        principal = sum(
            (p.book_value for p in positions if p.maturity_date == day),
            Decimal("0"),
        )
        interest = Decimal("0")
        if weekday:
            interest = sum((p.book_value * (p.coupon_rate or Decimal("0.04")) / Decimal("365") for p in positions), Decimal("0"))
        fx = Decimal("0")
        if offset in {5, 19}:
            fx = Decimal("-350000")
        if offset == 12:
            fx = Decimal("350000")
        net = sub - red + principal + interest + fx
        cash = cash + net
        rows.append(
            CashLadderRow(
                date=day,
                tenor=f"T+{offset}",
                subscription_inflow=_money(sub),
                redemption_outflow=_money(red),
                principal_maturity=_money(principal),
                interest_income=_money(interest),
                fx_hedge_flow=_money(fx),
                closing_cash=_money(cash),
                net_flow=_money(net),
            )
        )
    return rows


def build_workbench(as_of: date | None = None) -> WorkbenchSnapshot:
    as_of = as_of or date.today()
    positions, cash = demo_book(as_of)
    aum = sum((p.book_value for p in positions), Decimal("0")) + sum((c.amount for c in cash), Decimal("0"))
    mtm = sum((p.mark_to_market for p in positions), Decimal("0")) + sum((c.amount for c in cash), Decimal("0"))
    units = Decimal("100000000")
    official = (aum / units).quantize(Decimal("0.0001"))
    shadow = (mtm / units).quantize(Decimal("0.0001"))
    wam = calculate_wam_and_wal(positions, as_of)
    liq = calculate_liquidity_ratios(positions, cash, aum, current_date=as_of)
    collar = calculate_shadow_pricing_deviation(official, shadow)
    opening = sum((c.amount for c in cash if c.available_on <= as_of), Decimal("0"))

    return WorkbenchSnapshot(
        as_of=as_of,
        aum=_money(aum),
        official_nav=official,
        shadow_nav=shadow,
        deviation_bps=collar.deviation_bps,
        deviation_status=collar.status.value,
        wam_days=wam.wam_days,
        wal_days=wam.wal_days,
        dla_pct=(liq.dla_ratio * 100).quantize(Decimal("0.01")),
        wla_pct=(liq.wla_ratio * 100).quantize(Decimal("0.01")),
        cash_ladder=build_cash_ladder(as_of, positions, opening),
        positions=positions,
        cash=cash,
        updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
