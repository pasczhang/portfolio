"""Dual NAV engine: amortised-cost CNAV vs mark-to-model / mark-to-market shadow NAV."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from math import sin
from typing import Literal

from pydantic import BaseModel

Q_MONEY = Decimal("0.01")
Q_NAV = Decimal("0.00001")
Q_RATE = Decimal("0.0000001")
Q_BPS = Decimal("0.1")
YELLOW_RATIO = Decimal("0.0020")  # 20 bps
RED_RATIO = Decimal("0.0050")  # 50 bps

SpreadRating = Literal["A-1+", "A-1", "A-2", "SOVEREIGN"]
DayCount = Literal["ACT/365", "ACT/360"]
AssetType = Literal["TD", "NCD", "T-Bill", "CASH"]
ValLevel = Literal["1", "2", "3"]


CREDIT_SPREAD_BPS = {
    "A-1+": Decimal("15"),
    "A-1": Decimal("30"),
    "A-2": Decimal("65"),
    "SOVEREIGN": Decimal("0"),
}

# Benchmark par yields vs residual days
USD_CURVE: list[tuple[int, Decimal]] = [
    (1, Decimal("0.0532")),
    (7, Decimal("0.0530")),
    (30, Decimal("0.0528")),
    (90, Decimal("0.0515")),
    (180, Decimal("0.0505")),
    (365, Decimal("0.0485")),
]
HKD_CURVE: list[tuple[int, Decimal]] = [
    (1, Decimal("0.0415")),
    (7, Decimal("0.0410")),
    (30, Decimal("0.0405")),
    (90, Decimal("0.0395")),
    (180, Decimal("0.0380")),
    (365, Decimal("0.0365")),
]


def _money(value: Decimal) -> Decimal:
    return value.quantize(Q_MONEY, rounding=ROUND_HALF_UP)


def _nav5(value: Decimal) -> Decimal:
    return value.quantize(Q_NAV, rounding=ROUND_HALF_UP)


def _bps1(value: Decimal) -> Decimal:
    return value.quantize(Q_BPS, rounding=ROUND_HALF_UP)


def interpolate_curve(days: int, curve: list[tuple[int, Decimal]]) -> Decimal:
    days = max(days, 1)
    if days <= curve[0][0]:
        return curve[0][1]
    for i in range(1, len(curve)):
        d0, r0 = curve[i - 1]
        d1, r1 = curve[i]
        if days <= d1:
            w = Decimal(days - d0) / Decimal(d1 - d0)
            return (r0 + (r1 - r0) * w).quantize(Q_RATE, rounding=ROUND_HALF_UP)
    return curve[-1][1]


def dcf_price(cashflow: Decimal, days: int, rate: Decimal, spread: Decimal) -> Decimal:
    """PV = CF / (1 + r + s)^(days/365)."""
    if cashflow <= 0:
        return Decimal("0")
    t = Decimal(max(days, 0)) / Decimal("365")
    if t == 0:
        return _money(cashflow)
    base = Decimal("1") + rate + spread
    if base <= 0:
        base = Decimal("0.0001")
    pv = Decimal(float(cashflow) / (float(base) ** float(t)))
    return _money(pv)


class CashflowPoint(BaseModel):
    date: date
    days: int
    amount: Decimal
    description: str


class DualPositionInput(BaseModel):
    security_id: str
    isin: str
    name: str
    asset_type: AssetType
    issuer: str
    currency: str = "USD"
    rating: SpreadRating
    day_count: DayCount
    value_date: date
    maturity_date: date
    face: Decimal
    purchase: Decimal
    inception_yield: Decimal
    coupon: Decimal = Decimal("0")
    level: ValLevel
    pricing_source: str
    bval_clean: Decimal | None = None
    liquidity_bps: Decimal = Decimal("0")


class DualPositionResult(BaseModel):
    security_id: str
    isin: str
    name: str
    asset_type: str
    issuer: str
    currency: str
    rating: str
    days_to_maturity: int
    day_count: str
    amortised_book: Decimal
    shadow_value: Decimal
    diff_amount: Decimal
    diff_bps: Decimal
    pricing_source: str
    discount_rate: Decimal
    credit_spread: Decimal
    all_in_rate: Decimal
    level: str
    inception_yield: Decimal
    coupon: Decimal
    face: Decimal
    cashflows: list[CashflowPoint]
    model_notes: str


class DualNavKpis(BaseModel):
    accounting_nav: Decimal
    shadow_nav: Decimal
    deviation_ratio: Decimal
    deviation_pct: Decimal
    deviation_bps: Decimal
    status: str
    units: Decimal
    accounting_aum: Decimal
    shadow_aum: Decimal
    cash: Decimal


class DualNavPoint(BaseModel):
    date: date
    accounting_nav: Decimal
    shadow_nav: Decimal
    deviation_bps: Decimal


class DualNavSnapshot(BaseModel):
    as_of: date
    fund_code: str = "BAM-USD-MMF"
    kpis: DualNavKpis
    positions: list[DualPositionResult]
    history: list[DualNavPoint]
    yellow_bps: Decimal = Decimal("20")
    red_bps: Decimal = Decimal("50")
    curve_shift_bps: int = 0
    spread_widen_bps: int = 0
    vnav_trigger: bool = False
    report: dict[str, str] | None = None


def demo_dual_book(as_of: date) -> tuple[list[DualPositionInput], Decimal]:
    """1 T-Bill, 2 bank NCDs, 1 TD, plus cash."""
    positions = [
        DualPositionInput(
            security_id="TB-UST-6M",
            isin="US912797ND21",
            name="US Treasury Bill 6M",
            asset_type="T-Bill",
            issuer="US Treasury",
            currency="USD",
            rating="SOVEREIGN",
            day_count="ACT/360",
            value_date=as_of - timedelta(days=7),
            maturity_date=as_of + timedelta(days=360),
            face=Decimal("60000000"),
            purchase=Decimal("56928000"),
            inception_yield=Decimal("0.0512"),
            coupon=Decimal("0"),
            level="1",
            pricing_source="Bloomberg BVAL / CMP",
            bval_clean=Decimal("94.920"),
            liquidity_bps=Decimal("0"),
        ),
        DualPositionInput(
            security_id="NCD-BOCHK-3M",
            isin="HK0000951234",
            name="BOCHK 3M HKD NCD",
            asset_type="NCD",
            issuer="Bank of China",
            currency="HKD",
            rating="A-1",
            day_count="ACT/365",
            value_date=as_of - timedelta(days=14),
            maturity_date=as_of + timedelta(days=91),
            face=Decimal("15000000"),
            purchase=Decimal("14985000"),
            inception_yield=Decimal("0.0485"),
            coupon=Decimal("0.0485"),
            level="2",
            pricing_source="Mark-to-Model DCF · HIBOR / EFB",
            liquidity_bps=Decimal("5"),
        ),
        DualPositionInput(
            security_id="NCD-ICBC-1M",
            isin="XS2589631470",
            name="ICBC Asia 1M USD CD",
            asset_type="NCD",
            issuer="ICBC",
            currency="USD",
            rating="A-1",
            day_count="ACT/360",
            value_date=as_of - timedelta(days=5),
            maturity_date=as_of + timedelta(days=30),
            face=Decimal("12000000"),
            purchase=Decimal("11992000"),
            inception_yield=Decimal("0.0525"),
            coupon=Decimal("0.0525"),
            level="2",
            pricing_source="Mark-to-Model DCF · SOFR / UST",
            liquidity_bps=Decimal("5"),
        ),
        DualPositionInput(
            security_id="TD-HSBC-7D",
            isin="CUSTOM_TD",
            name="HSBC 7D USD Time Deposit",
            asset_type="TD",
            issuer="HSBC",
            currency="USD",
            rating="A-1+",
            day_count="ACT/365",
            value_date=as_of,
            maturity_date=as_of + timedelta(days=7),
            face=Decimal("10000000"),
            purchase=Decimal("10000000"),
            inception_yield=Decimal("0.0435"),
            coupon=Decimal("0.0435"),
            level="3",
            pricing_source="Mark-to-Model DCF · SOFR + bank spread",
            liquidity_bps=Decimal("8"),
        ),
        DualPositionInput(
            security_id="CASH-USD",
            isin="CASH",
            name="USD overnight cash",
            asset_type="CASH",
            issuer="Custodian",
            currency="USD",
            rating="SOVEREIGN",
            day_count="ACT/365",
            value_date=as_of,
            maturity_date=as_of,
            face=Decimal("8000000"),
            purchase=Decimal("8000000"),
            inception_yield=Decimal("0"),
            coupon=Decimal("0"),
            level="1",
            pricing_source="Custodian cash",
            liquidity_bps=Decimal("0"),
        ),
    ]
    cash = Decimal("0")
    return positions, cash


def _basis(day_count: DayCount) -> Decimal:
    return Decimal("360") if day_count == "ACT/360" else Decimal("365")


def _redemption(pos: DualPositionInput) -> Decimal:
    original = max((pos.maturity_date - pos.value_date).days, 1)
    if pos.asset_type == "T-Bill" or pos.coupon == 0:
        return pos.face
    return _money(pos.face * (Decimal("1") + pos.coupon * Decimal(original) / _basis(pos.day_count)))


def amortised_cost(pos: DualPositionInput, as_of: date) -> Decimal:
    original = max((pos.maturity_date - pos.value_date).days, 1)
    elapsed = min(max((as_of - pos.value_date).days, 0), original)
    redemption = _redemption(pos)
    return _money(pos.purchase + (redemption - pos.purchase) * Decimal(elapsed) / Decimal(original))


def _curve_for(pos: DualPositionInput) -> list[tuple[int, Decimal]]:
    return HKD_CURVE if pos.currency == "HKD" else USD_CURVE


def value_position(
    pos: DualPositionInput,
    as_of: date,
    *,
    curve_shift_bps: int = 0,
    spread_widen_bps: int = 0,
) -> DualPositionResult:
    remaining = max((pos.maturity_date - as_of).days, 0)
    book = amortised_cost(pos, as_of)
    redemption = _redemption(pos)
    credit = CREDIT_SPREAD_BPS[pos.rating] + pos.liquidity_bps + Decimal(spread_widen_bps)
    spread = credit / Decimal("10000")
    bench = interpolate_curve(max(remaining, 1), _curve_for(pos)) + Decimal(curve_shift_bps) / Decimal("10000")
    all_in = bench + spread
    cf = [
        CashflowPoint(
            date=pos.maturity_date,
            days=remaining,
            amount=redemption,
            description="Maturity redemption (principal + coupon if any)",
        )
    ]
    if pos.asset_type == "CASH":
        shadow = book
        notes = "Cash at par; no discounting."
        source = pos.pricing_source
    elif pos.level == "1" and pos.bval_clean is not None and curve_shift_bps == 0 and spread_widen_bps == 0:
        accrued = Decimal("0")
        shadow = _money(pos.face * pos.bval_clean / Decimal("100") + accrued)
        notes = (
            f"Level 1 BVAL clean {pos.bval_clean} + accrued {accrued}. "
            f"Unstressed mark-to-market; curve {pos.currency} {float(bench)*100:.3f}%."
        )
        source = pos.pricing_source
    elif pos.level == "1" and pos.bval_clean is not None:
        shadow = dcf_price(redemption, remaining, bench, spread)
        notes = (
            f"Level 1 stressed off BVAL {pos.bval_clean} via DCF. "
            f"PV = {redemption} / (1 + {float(all_in)*100:.3f}%)^({remaining}/365)."
        )
        source = pos.pricing_source
    else:
        shadow = dcf_price(redemption, remaining, bench, spread)
        notes = (
            f"DCF PV = {redemption} / (1 + {float(all_in)*100:.3f}%)^({remaining}/365). "
            f"Benchmark {float(bench)*100:.3f}% + credit {credit}bps."
        )
        source = pos.pricing_source
    diff = _money(shadow - book)
    diff_bps = _bps1(diff / book * Decimal("10000")) if book else Decimal("0")
    return DualPositionResult(
        security_id=pos.security_id,
        isin=pos.isin,
        name=pos.name,
        asset_type=pos.asset_type,
        issuer=pos.issuer,
        currency=pos.currency,
        rating=pos.rating,
        days_to_maturity=remaining,
        day_count=pos.day_count,
        amortised_book=book,
        shadow_value=shadow,
        diff_amount=diff,
        diff_bps=diff_bps,
        pricing_source=source,
        discount_rate=bench.quantize(Decimal("0.000001")),
        credit_spread=spread.quantize(Decimal("0.000001")),
        all_in_rate=all_in.quantize(Decimal("0.000001")),
        level=pos.level,
        inception_yield=pos.inception_yield,
        coupon=pos.coupon,
        face=pos.face,
        cashflows=cf,
        model_notes=notes,
    )


def _status(abs_ratio: Decimal) -> str:
    if abs_ratio <= YELLOW_RATIO:
        return "NORMAL"
    if abs_ratio <= RED_RATIO:
        return "WARNING"
    return "BREACH"


def calculate_shadow_nav(
    as_of: date | None = None,
    *,
    curve_shift_bps: int = 0,
    spread_widen_bps: int = 0,
) -> DualNavSnapshot:
    as_of = as_of or date(2026, 9, 15)
    book, _extra_cash = demo_dual_book(as_of)
    rows = [value_position(p, as_of, curve_shift_bps=curve_shift_bps, spread_widen_bps=spread_widen_bps) for p in book]
    cash = _money(sum((r.shadow_value for r in rows if r.asset_type == "CASH"), Decimal("0")) + _extra_cash)
    accounting_aum = _money(sum((r.amortised_book for r in rows), Decimal("0")))
    shadow_aum = _money(sum((r.shadow_value for r in rows), Decimal("0")))
    units = accounting_aum  # constant $1.00000 CNAV
    accounting_nav = Decimal("1.00000")
    shadow_nav = _nav5(shadow_aum / units) if units else accounting_nav
    dev_ratio = ((shadow_nav - accounting_nav) / accounting_nav).quantize(Decimal("0.0000001"), rounding=ROUND_HALF_UP)
    abs_ratio = abs(dev_ratio)
    status = _status(abs_ratio)
    history: list[DualNavPoint] = []
    for i in range(29, -1, -1):
        d = as_of - timedelta(days=i)
        wave = Decimal(str(0.00004 * sin(i / 3.7)))
        s = _nav5(shadow_nav + wave - Decimal("0.00002") * Decimal((i % 4) - 1))
        history.append(
            DualNavPoint(
                date=d,
                accounting_nav=accounting_nav,
                shadow_nav=s,
                deviation_bps=_bps1((s - accounting_nav) * Decimal("10000")),
            )
        )
    history[-1] = DualNavPoint(
        date=as_of,
        accounting_nav=accounting_nav,
        shadow_nav=shadow_nav,
        deviation_bps=_bps1(dev_ratio * Decimal("10000")),
    )
    vnav = status == "BREACH"
    report = None
    if vnav:
        report = {
            "title": "SFC 偏离度超标报告简表",
            "fund": "BAM-USD-MMF",
            "as_of": as_of.isoformat(),
            "accounting_nav": str(accounting_nav),
            "shadow_nav": str(shadow_nav),
            "deviation_bps": str(_bps1(dev_ratio * Decimal("10000"))),
            "action": "建议启动浮动净值（VNAV）切换预案，并按《单位信托守则》第 8.2 章向证监会报备。",
            "stress": f"curve +{curve_shift_bps}bps / spread +{spread_widen_bps}bps",
        }
    return DualNavSnapshot(
        as_of=as_of,
        kpis=DualNavKpis(
            accounting_nav=accounting_nav,
            shadow_nav=shadow_nav,
            deviation_ratio=dev_ratio,
            deviation_pct=(dev_ratio * Decimal("100")).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP),
            deviation_bps=_bps1(dev_ratio * Decimal("10000")),
            status=status,
            units=_money(units),
            accounting_aum=accounting_aum,
            shadow_aum=shadow_aum,
            cash=_money(cash),
        ),
        positions=rows,
        history=history,
        curve_shift_bps=curve_shift_bps,
        spread_widen_bps=spread_widen_bps,
        vnav_trigger=vnav,
        report=report,
    )
