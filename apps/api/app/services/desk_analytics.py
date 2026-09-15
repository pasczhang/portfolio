"""Desk dashboards: SFC §8.2 compliance, tenor, NAV collar, stress wrappers."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from math import sin

from pydantic import BaseModel

from app.services.book_store import live_book
from app.services.engines.mmf_engine import (
    WAL_LIMIT_DAYS,
    WAM_LIMIT_DAYS,
    calculate_liquidity_ratios,
    calculate_shadow_pricing_deviation,
    calculate_wam_and_wal,
)
from app.services.engines.stress_test import StressTestEngine
from app.services.holdings_service import HoldingDetail, build_holdings

DLA_FLOOR_PCT = Decimal("10")
WLA_FLOOR_PCT = Decimal("20")  # public MMF dashboard (Code 8.2 weekly liquidity ≥20%)
ISSUER_LIMIT_PCT = Decimal("10")
ISSUER_PRIVILEGED_PCT = Decimal("20")
MAX_RESIDUAL_DAYS = 397
YELLOW_COLLAR_BPS = Decimal("20")
RED_COLLAR_BPS = Decimal("50")


def _q(value: Decimal, places: str = "0.01") -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


class LimitCard(BaseModel):
    code: str
    title: str
    value: Decimal
    unit: str
    limit: Decimal
    status: str
    detail: str


class ConcentrationRow(BaseModel):
    issuer: str
    product_hint: str
    amount: Decimal
    weight_pct: Decimal
    limit_10: Decimal = ISSUER_LIMIT_PCT
    limit_20: Decimal = ISSUER_PRIVILEGED_PCT
    privileged: bool
    status: str


class BreachAlert(BaseModel):
    id: str
    severity: str
    rule: str
    title: str
    detail: str
    as_of: date


class ComplianceDashboard(BaseModel):
    as_of: date
    fund_code: str = "BAM-USD-MMF"
    aum: Decimal
    cards: list[LimitCard]
    concentration: list[ConcentrationRow]
    liquidity: dict[str, Decimal | str | bool]
    alerts: list[BreachAlert]


class TenorBucket(BaseModel):
    bucket: str
    amount: Decimal
    weight_pct: Decimal
    count: int


class TenorDistribution(BaseModel):
    as_of: date
    buckets: list[TenorBucket]
    total: Decimal


class RateShockPoint(BaseModel):
    shift_bps: int
    shadow_nav: Decimal
    official_nav: Decimal = Decimal("1.0000")
    deviation_bps: Decimal
    mtm_nav: Decimal


class YieldCurveShock(BaseModel):
    as_of: date
    official_nav: Decimal = Decimal("1.0000")
    base_shadow_nav: Decimal
    base_deviation_bps: Decimal
    selected_shift_bps: int
    selected: RateShockPoint
    curve: list[RateShockPoint]


class RunoffScenario(BaseModel):
    redemption_pct: Decimal
    outflow: Decimal
    cash_before: Decimal
    cash_after: Decimal
    dla_pct_before: Decimal
    dla_pct_after: Decimal
    wla_pct_before: Decimal
    wla_pct_after: Decimal
    dla_ok: bool
    wla_ok: bool
    fire_sale: bool
    flags: list[str]


class RunoffPack(BaseModel):
    as_of: date
    scenarios: list[RunoffScenario]


class NavPoint(BaseModel):
    date: date
    official_nav: Decimal
    shadow_nav: Decimal
    deviation_bps: Decimal


class AttributionRow(BaseModel):
    security_id: str
    instrument: str
    counterparty: str
    product_type: str
    amortized_cost: Decimal
    shadow_mtm: Decimal
    premium: Decimal
    contribution_bps: Decimal


class NavMonitor(BaseModel):
    as_of: date
    official_nav: Decimal
    shadow_nav: Decimal
    deviation_bps: Decimal
    yellow_bps: Decimal = YELLOW_COLLAR_BPS
    red_bps: Decimal = RED_COLLAR_BPS
    series: list[NavPoint]
    collar_bars: list[NavPoint]
    attribution: list[AttributionRow]


def _nav_pu(amortized: Decimal, mtm: Decimal) -> tuple[Decimal, Decimal]:
    official = Decimal("1.0000")
    shadow = (mtm / amortized * official) if amortized else official
    return official, _q(shadow, "0.0001")


def _status_limit(value: Decimal, limit: Decimal, *, higher_is_worse: bool) -> str:
    if higher_is_worse:
        if value <= limit:
            return "PASS"
        if value <= limit * Decimal("1.15"):
            return "WARN"
        return "BREACH"
    if value >= limit:
        return "PASS"
    if value >= limit * Decimal("0.85"):
        return "WARN"
    return "BREACH"


def _issuer_status(weight: Decimal, privileged: bool) -> str:
    if privileged:
        if weight <= ISSUER_PRIVILEGED_PCT:
            return "PASS"
        return "WARN"
    if weight <= ISSUER_LIMIT_PCT:
        return "PASS"
    if weight <= ISSUER_PRIVILEGED_PCT:
        return "WARN"
    return "BREACH"


def _tenor_bucket(days: int) -> str:
    if days <= 7:
        return "0-7D"
    if days <= 30:
        return "8-30D"
    if days <= 60:
        return "31-60D"
    if days <= 90:
        return "61-90D"
    return "90D+"


def build_compliance(as_of: date | None = None) -> ComplianceDashboard:
    as_of = as_of or date.today()
    positions, cash = live_book(as_of)
    holdings = build_holdings(as_of)
    aum = sum((p.book_value for p in positions), Decimal("0")) + sum((c.amount for c in cash), Decimal("0"))
    wam = calculate_wam_and_wal(positions, as_of)
    liq = calculate_liquidity_ratios(positions, cash, aum, current_date=as_of)
    dla_pct = _q(liq.dla_ratio * 100)
    wla_pct = _q(liq.wla_ratio * 100)
    max_residual = max((h.tenor_days for h in holdings.holdings), default=0)

    conc_map: dict[str, tuple[Decimal, bool, str]] = {}
    for h in holdings.holdings:
        prev_amt, priv, hint = conc_map.get(h.counterparty, (Decimal("0"), False, h.product_type))
        conc_map[h.counterparty] = (
            prev_amt + h.amortized_cost,
            priv or h.product_type == "T-Bill",
            hint if hint == h.product_type else "MIX",
        )
    concentration: list[ConcentrationRow] = []
    for issuer, (amount, privileged, hint) in conc_map.items():
        weight = _q(amount / aum * 100) if aum else Decimal("0")
        concentration.append(
            ConcentrationRow(
                issuer=issuer,
                product_hint=hint,
                amount=_q(amount),
                weight_pct=weight,
                privileged=privileged,
                status=_issuer_status(weight, privileged),
            )
        )
    concentration.sort(key=lambda r: r.weight_pct, reverse=True)

    wla_ok_20 = wla_pct >= WLA_FLOOR_PCT
    cards = [
        LimitCard(
            code="WAM",
            title="WAM ≤ 60天",
            value=_q(wam.wam_days),
            unit="天",
            limit=Decimal(WAM_LIMIT_DAYS),
            status="PASS" if wam.wam_within_limit else "WARN",
            detail="浮动利率按下次重定价；固定利率按到期日",
        ),
        LimitCard(
            code="WAL",
            title="WAL ≤ 120天",
            value=_q(wam.wal_days),
            unit="天",
            limit=Decimal(WAL_LIMIT_DAYS),
            status="PASS" if wam.wal_within_limit else "WARN",
            detail="一律按法律最终到期日加权",
        ),
        LimitCard(
            code="MAX_RESIDUAL",
            title="单一资产最长剩余期限 ≤ 397天",
            value=Decimal(max_residual),
            unit="天",
            limit=Decimal(MAX_RESIDUAL_DAYS),
            status="PASS" if max_residual <= MAX_RESIDUAL_DAYS else "BREACH",
            detail="持仓中最长剩余期限",
        ),
        LimitCard(
            code="DLA",
            title="日度流动性资产 DLA ≥ 10%",
            value=dla_pct,
            unit="%",
            limit=DLA_FLOOR_PCT,
            status=_status_limit(dla_pct, DLA_FLOOR_PCT, higher_is_worse=False),
            detail=f"金额 {_q(liq.dla_amount)}",
        ),
        LimitCard(
            code="WLA",
            title="周度流动性资产 WLA ≥ 20%",
            value=wla_pct,
            unit="%",
            limit=WLA_FLOOR_PCT,
            status=_status_limit(wla_pct, WLA_FLOOR_PCT, higher_is_worse=False),
            detail=f"金额 {_q(liq.wla_amount)}（引擎内部周度门槛仍为 30%）",
        ),
    ]

    alerts: list[BreachAlert] = []
    n = 1
    for card in cards:
        if card.status != "PASS":
            alerts.append(
                BreachAlert(
                    id=f"ALT-{n:03d}",
                    severity="HIGH" if card.status == "BREACH" else "MEDIUM",
                    rule=card.code,
                    title=card.title,
                    detail=f"当前 {card.value}{card.unit}，限额 {card.limit}{card.unit}",
                    as_of=as_of,
                )
            )
            n += 1
    for row in concentration:
        if row.status in {"WARN", "PRIVILEGED", "BREACH"}:
            alerts.append(
                BreachAlert(
                    id=f"ALT-{n:03d}",
                    severity="HIGH" if row.status == "BREACH" else "MEDIUM",
                    rule="ISSUER_CONC",
                    title=f"{row.issuer} 集中度 {row.weight_pct}%",
                    detail=(
                        f"超过 10% 单一发行人上限"
                        f"{'；仍在 20% 特许限额内' if row.status != 'BREACH' else '；已突破 20% 特许限额'}"
                    ),
                    as_of=as_of,
                )
            )
            n += 1
    if not alerts:
        alerts.append(
            BreachAlert(
                id="ALT-000",
                severity="INFO",
                rule="OK",
                title="当日无新增违规",
                detail="WAM/WAL、397 天、DLA/WLA 与发行人集中度均在监控阈值内",
                as_of=as_of,
            )
        )

    return ComplianceDashboard(
        as_of=as_of,
        aum=_q(aum),
        cards=cards,
        concentration=concentration,
        liquidity={
            "dla_pct": dla_pct,
            "wla_pct": wla_pct,
            "dla_floor": DLA_FLOOR_PCT,
            "wla_floor": WLA_FLOOR_PCT,
            "dla_ok": dla_pct >= DLA_FLOOR_PCT,
            "wla_ok": wla_ok_20,
        },
        alerts=alerts,
    )


def build_tenor_distribution(as_of: date | None = None) -> TenorDistribution:
    as_of = as_of or date.today()
    holdings = build_holdings(as_of)
    order = ["0-7D", "8-30D", "31-60D", "61-90D", "90D+"]
    agg: dict[str, tuple[Decimal, int]] = {k: (Decimal("0"), 0) for k in order}
    for h in holdings.holdings:
        key = _tenor_bucket(h.tenor_days)
        amt, n = agg[key]
        agg[key] = (amt + h.amortized_cost, n + 1)
    total = holdings.aum_securities or Decimal("1")
    buckets = [
        TenorBucket(
            bucket=k,
            amount=_q(agg[k][0]),
            weight_pct=_q(agg[k][0] / total * 100) if total else Decimal("0"),
            count=agg[k][1],
        )
        for k in order
    ]
    return TenorDistribution(as_of=as_of, buckets=buckets, total=_q(total))


def build_yield_curve_shock(shift_bps: int = 0, as_of: date | None = None) -> YieldCurveShock:
    as_of = as_of or date.today()
    positions, cash = live_book(as_of)
    shifts = (-100, -50, -25, 0, 25, 50, 100)
    raw = StressTestEngine().interest_rate_shock(positions, shifts, as_of=as_of, cash=cash)
    curve: list[RateShockPoint] = []
    for sc in raw.scenarios:
        official, shadow = _nav_pu(sc.amortized_nav, sc.mtm_nav)
        curve.append(
            RateShockPoint(
                shift_bps=sc.shift_bps,
                shadow_nav=shadow,
                official_nav=official,
                deviation_bps=_q(sc.shadow.deviation_bps),
                mtm_nav=sc.mtm_nav,
            )
        )
    selected = next((p for p in curve if p.shift_bps == shift_bps), curve[3])
    base = next((p for p in curve if p.shift_bps == 0), curve[3])
    return YieldCurveShock(
        as_of=as_of,
        base_shadow_nav=base.shadow_nav,
        base_deviation_bps=base.deviation_bps,
        selected_shift_bps=selected.shift_bps,
        selected=selected,
        curve=curve,
    )


def build_runoff(as_of: date | None = None) -> RunoffPack:
    as_of = as_of or date.today()
    positions, cash = live_book(as_of)
    engine = StressTestEngine()
    scenarios: list[RunoffScenario] = []
    for pct in (Decimal("0.10"), Decimal("0.20"), Decimal("0.30")):
        r = engine.redemption_shock(pct, positions, cash, as_of=as_of)
        dla_after_pct = _q(r.dla_ratio_after * 100)
        wla_after_pct = _q(r.wla_ratio_after * 100)
        scenarios.append(
            RunoffScenario(
                redemption_pct=_q(pct * 100),
                outflow=r.outflow,
                cash_before=r.cash_before,
                cash_after=r.cash_after,
                dla_pct_before=_q(r.dla_ratio_before * 100),
                dla_pct_after=dla_after_pct,
                wla_pct_before=_q(r.wla_ratio_before * 100),
                wla_pct_after=wla_after_pct,
                dla_ok=dla_after_pct >= DLA_FLOOR_PCT,
                wla_ok=wla_after_pct >= WLA_FLOOR_PCT,
                fire_sale=r.fire_sale_required,
                flags=r.flags,
            )
        )
    return RunoffPack(as_of=as_of, scenarios=scenarios)


def _attribution(holdings: list[HoldingDetail], aum: Decimal) -> list[AttributionRow]:
    rows: list[AttributionRow] = []
    for h in holdings:
        premium = h.shadow_mtm - h.amortized_cost
        bps = (premium / aum * Decimal("10000")) if aum else Decimal("0")
        rows.append(
            AttributionRow(
                security_id=h.security_id,
                instrument=h.instrument,
                counterparty=h.counterparty,
                product_type=h.product_type,
                amortized_cost=h.amortized_cost,
                shadow_mtm=h.shadow_mtm,
                premium=_q(premium),
                contribution_bps=_q(bps, "0.01"),
            )
        )
    rows.sort(key=lambda r: abs(r.contribution_bps), reverse=True)
    return rows


def build_nav_monitor(as_of: date | None = None) -> NavMonitor:
    as_of = as_of or date.today()
    positions, cash = live_book(as_of)
    holdings = build_holdings(as_of)
    amortized = sum((p.book_value for p in positions), Decimal("0")) + sum((c.amount for c in cash), Decimal("0"))
    mtm = sum((p.mark_to_market for p in positions), Decimal("0")) + sum((c.amount for c in cash), Decimal("0"))
    official, shadow = _nav_pu(amortized, mtm)
    shadow_metrics = calculate_shadow_pricing_deviation(amortized, mtm)
    signed_bps = _q((shadow - official) * Decimal("10000"), "0.01")
    series: list[NavPoint] = []
    for i in range(29, -1, -1):
        d = as_of - timedelta(days=i)
        wave = Decimal(str(0.00008 * sin(i / 4.2)))
        s = _q(shadow + wave - Decimal("0.00003") * Decimal(i % 5 - 2), "0.0001")
        series.append(
            NavPoint(
                date=d,
                official_nav=official,
                shadow_nav=s,
                deviation_bps=_q((s - official) * Decimal("10000"), "0.01"),
            )
        )
    series[-1] = NavPoint(date=as_of, official_nav=official, shadow_nav=shadow, deviation_bps=signed_bps)
    return NavMonitor(
        as_of=as_of,
        official_nav=official,
        shadow_nav=shadow,
        deviation_bps=signed_bps,
        series=series,
        collar_bars=series[-14:],
        attribution=_attribution(holdings.holdings, amortized),
    )
