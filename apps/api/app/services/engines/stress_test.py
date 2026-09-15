"""SFC §8.2 liquidity / rate stress tests with chart-ready JSON payloads."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Sequence

import numpy as np
from pydantic import BaseModel, Field

from app.models.enums import AssetClass, CouponType
from app.services.engines.mmf_engine import (
    DLA_MIN_RATIO,
    WLA_MIN_RATIO,
    CashLadderEntry,
    EnginePosition,
    LiquidityMetrics,
    ShadowPricingMetrics,
    WamWalMetrics,
    _as_datetime64,
    _business_days,
    _holiday_array,
    calculate_liquidity_ratios,
    calculate_shadow_pricing_deviation,
    calculate_wam_and_wal,
)

_Q = Decimal("0.01")
_Q_MONEY = Decimal("0.01")
DEFAULT_FIRE_SALE_HAIRCUT = Decimal("0.005")  # 50 bps on illiquid sales


class InvestorHolding(BaseModel):
    investor_id: str
    nav_amount: Decimal = Field(ge=0)
    is_institutional: bool = True
    name: str | None = None


class WaterfallBar(BaseModel):
    bucket: str
    tier: int
    capacity: Decimal
    consumed: Decimal
    remaining: Decimal
    haircut_loss: Decimal = Decimal("0")


class ChartSeriesPoint(BaseModel):
    x: float | int | str
    y: float
    y2: float | None = None
    label: str | None = None


class RedemptionShockResult(BaseModel):
    scenario_type: str
    scenario_pct: Decimal
    outflow: Decimal
    nav_before: Decimal
    nav_after: Decimal
    cash_before: Decimal
    cash_after: Decimal
    dla_before: Decimal
    dla_after: Decimal
    wla_before: Decimal
    wla_after: Decimal
    dla_ratio_before: Decimal
    dla_ratio_after: Decimal
    wla_ratio_before: Decimal
    wla_ratio_after: Decimal
    dla_compliant_after: bool
    wla_compliant_after: bool
    fire_sale_required: bool
    illiquid_sold: Decimal
    fire_sale_haircut: Decimal
    shadow_nav_loss: Decimal
    shadow_before: ShadowPricingMetrics
    shadow_after: ShadowPricingMetrics
    wam_wal_after: WamWalMetrics
    liquidity_after: LiquidityMetrics
    waterfall: list[WaterfallBar]
    chart: dict[str, list[ChartSeriesPoint] | dict[str, list[float | str]]]
    flags: list[str]


class RateScenarioPoint(BaseModel):
    shift_bps: int
    mtm_nav: Decimal
    amortized_nav: Decimal
    delta_mtm: Decimal
    delta_nav_bps: Decimal
    shadow: ShadowPricingMetrics
    chart_point: ChartSeriesPoint


class InterestRateShockResult(BaseModel):
    as_of: date
    amortized_nav: Decimal
    base_mtm_nav: Decimal
    bp_shifts: list[int]
    scenarios: list[RateScenarioPoint]
    chart: dict[str, list[ChartSeriesPoint]]
    worst_deviation_bps: Decimal
    flags: list[str]


def _money(value: Decimal) -> Decimal:
    return value.quantize(_Q_MONEY, rounding=ROUND_HALF_UP)


def _ratio(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _as_fraction(scenario_pct: Decimal) -> Decimal:
    if scenario_pct < 0:
        raise ValueError("scenario_pct must be >= 0")
    if scenario_pct > 1:
        return (scenario_pct / Decimal("100")).quantize(Decimal("0.00000001"))
    return scenario_pct


def _total_cash(cash: Sequence[CashLadderEntry] | Decimal) -> Decimal:
    if isinstance(cash, Decimal):
        return cash
    return sum((item.amount for item in cash), Decimal("0"))


def _cash_entries(cash: Sequence[CashLadderEntry] | Decimal, as_of: date) -> list[CashLadderEntry]:
    if isinstance(cash, Decimal):
        return [CashLadderEntry(amount=cash, available_on=as_of)] if cash else []
    return [item.model_copy() for item in cash]


def _nav(positions: Sequence[EnginePosition], cash: Sequence[CashLadderEntry]) -> Decimal:
    books = sum((p.book_value for p in positions), Decimal("0"))
    return books + sum((c.amount for c in cash), Decimal("0"))


def _mtm_nav(positions: Sequence[EnginePosition], cash: Sequence[CashLadderEntry]) -> Decimal:
    marks = sum((p.mark_to_market for p in positions), Decimal("0"))
    return marks + sum((c.amount for c in cash), Decimal("0"))


def _tag_cash(entries: Sequence[CashLadderEntry], as_of: date) -> list[tuple[int, str, CashLadderEntry]]:
    holidays = _holiday_array(as_of - timedelta(days=7), as_of + timedelta(days=40))
    dla_cutoff = np.busday_offset(np.datetime64(as_of, "D"), 1, roll="forward", holidays=holidays)
    wla_cutoff = np.busday_offset(np.datetime64(as_of, "D"), 5, roll="forward", holidays=holidays)
    tagged: list[tuple[int, str, CashLadderEntry]] = []
    for i, entry in enumerate(entries):
        avail = np.datetime64(entry.available_on, "D")
        if avail <= dla_cutoff:
            tagged.append((0, f"cash:{i}", entry))
        elif avail <= wla_cutoff:
            tagged.append((2, f"cash:{i}", entry))
        else:
            tagged.append((3, f"cash:{i}", entry))
    return tagged


def _tag_positions(positions: Sequence[EnginePosition], as_of: date) -> list[tuple[int, EnginePosition, Decimal]]:
    book = [p for p in positions if p.asset_class is not AssetClass.FX_FORWARD and p.free_book_value > 0]
    if not book:
        return []
    holidays = _holiday_array(as_of - timedelta(days=7), as_of + timedelta(days=400))
    maturity = _as_datetime64([p.maturity_date for p in book])
    bdays = _business_days(as_of, maturity, holidays)
    tagged: list[tuple[int, EnginePosition, Decimal]] = []
    for pos, bd in zip(book, bdays, strict=True):
        is_tbill = pos.asset_class is AssetClass.T_BILL
        is_deposit = pos.asset_class is AssetClass.DEPOSIT
        is_repo = pos.asset_class is AssetClass.REPO
        dla = ((is_deposit or is_repo) and int(bd) <= 1) or (
            is_tbill and pos.is_sovereign and pos.settlement_lag_business_days <= 1
        ) or (pos.is_sovereign and not is_tbill and pos.settlement_lag_business_days <= 1 and int(bd) <= 1)
        wla = bool(dla) or int(bd) <= 5 or is_tbill
        if dla:
            tier = 1
        elif wla:
            tier = 2
        else:
            tier = 3
        tagged.append((tier, pos, pos.free_book_value))
    tagged.sort(key=lambda row: (row[0], row[1].maturity_date, -row[2]))
    return tagged


def _outflow_amount(
    nav: Decimal,
    scenario_pct: Decimal | None,
    top_n_institutional: int | None,
    investor_holdings: Sequence[InvestorHolding] | None,
) -> tuple[Decimal, Decimal, str]:
    if top_n_institutional is not None:
        if not investor_holdings:
            raise ValueError("investor_holdings required when top_n_institutional is set")
        inst = sorted(
            (h for h in investor_holdings if h.is_institutional),
            key=lambda h: h.nav_amount,
            reverse=True,
        )[:top_n_institutional]
        outflow = sum((h.nav_amount for h in inst), Decimal("0"))
        pct = (outflow / nav) if nav else Decimal("0")
        return outflow, pct, f"top_{top_n_institutional}_institutional"
    if scenario_pct is None:
        raise ValueError("provide scenario_pct or top_n_institutional")
    pct = _as_fraction(scenario_pct)
    return nav * pct, pct, "fund_pct"


class StressTestEngine:
    def redemption_shock(
        self,
        scenario_pct: Decimal | None,
        positions: Sequence[EnginePosition],
        cash: Sequence[CashLadderEntry] | Decimal,
        *,
        as_of: date,
        top_n_institutional: int | None = None,
        investor_holdings: Sequence[InvestorHolding] | None = None,
        fire_sale_haircut: Decimal = DEFAULT_FIRE_SALE_HAIRCUT,
    ) -> RedemptionShockResult:
        cash_book = _cash_entries(cash, as_of)
        pos_book = [p.model_copy() for p in positions]
        nav_before = _nav(pos_book, cash_book)
        if nav_before <= 0:
            raise ValueError("portfolio NAV must be positive")
        outflow, pct, scenario_type = _outflow_amount(
            nav_before, scenario_pct, top_n_institutional, investor_holdings
        )
        outflow = min(outflow, nav_before)

        liq_before = calculate_liquidity_ratios(pos_book, cash_book, nav_before, current_date=as_of)
        shadow_before = calculate_shadow_pricing_deviation(
            nav_before, _mtm_nav(pos_book, cash_book)
        )

        buckets: list[dict] = []
        for tier, key, entry in sorted(_tag_cash(cash_book, as_of), key=lambda r: (r[0], r[2].available_on)):
            buckets.append(
                {
                    "tier": tier,
                    "name": "Cash / overnight" if tier == 0 else ("Weekly cash" if tier == 2 else "Term cash"),
                    "key": key,
                    "kind": "cash",
                    "amount": entry.amount,
                    "haircut": Decimal("0"),
                    "entry": entry,
                }
            )
        for tier, pos, free in _tag_positions(pos_book, as_of):
            buckets.append(
                {
                    "tier": tier,
                    "name": {1: "DLA securities", 2: "WLA securities", 3: "Illiquid / fire-sale"}[tier],
                    "key": pos.security_id,
                    "kind": "position",
                    "amount": free,
                    "haircut": fire_sale_haircut if tier == 3 else Decimal("0"),
                    "position": pos,
                }
            )
        buckets.sort(key=lambda b: (b["tier"], -float(b["amount"])))

        remaining_need = outflow
        waterfall_agg: dict[str, WaterfallBar] = {}
        cash_remaining = {i: e.model_copy() for i, e in enumerate(cash_book)}
        pos_remaining = {p.security_id: p.model_copy() for p in pos_book}
        illiquid_sold = Decimal("0")
        haircut_loss = Decimal("0")

        for bucket in buckets:
            if remaining_need <= 0:
                capacity = bucket["amount"]
                name = bucket["name"]
                bar = waterfall_agg.get(name)
                if bar is None:
                    waterfall_agg[name] = WaterfallBar(
                        bucket=name,
                        tier=bucket["tier"],
                        capacity=capacity,
                        consumed=Decimal("0"),
                        remaining=capacity,
                    )
                else:
                    waterfall_agg[name] = bar.model_copy(
                        update={
                            "capacity": bar.capacity + capacity,
                            "remaining": bar.remaining + capacity,
                        }
                    )
                continue

            take = min(bucket["amount"], remaining_need)
            loss = take * bucket["haircut"]
            haircut_loss += loss
            remaining_need -= take
            if bucket["tier"] == 3:
                illiquid_sold += take

            name = bucket["name"]
            bar = waterfall_agg.get(name)
            if bar is None:
                waterfall_agg[name] = WaterfallBar(
                    bucket=name,
                    tier=bucket["tier"],
                    capacity=bucket["amount"],
                    consumed=take,
                    remaining=bucket["amount"] - take,
                    haircut_loss=loss,
                )
            else:
                waterfall_agg[name] = bar.model_copy(
                    update={
                        "capacity": bar.capacity + bucket["amount"],
                        "consumed": bar.consumed + take,
                        "remaining": bar.remaining + (bucket["amount"] - take),
                        "haircut_loss": bar.haircut_loss + loss,
                    }
                )

            if bucket["kind"] == "cash":
                idx = int(str(bucket["key"]).split(":")[1])
                entry = cash_remaining[idx]
                cash_remaining[idx] = entry.model_copy(update={"amount": entry.amount - take})
            else:
                pos = pos_remaining[bucket["key"]]
                new_book = pos.book_value - take
                new_mtm = None
                if pos.shadow_mtm is not None:
                    scale = (new_book / pos.book_value) if pos.book_value else Decimal("0")
                    new_mtm = pos.shadow_mtm * scale
                pos_remaining[bucket["key"]] = pos.model_copy(
                    update={"book_value": max(new_book, Decimal("0")), "shadow_mtm": new_mtm}
                )

        leftover = remaining_need
        cash_after_list = [e for e in cash_remaining.values() if e.amount > 0]
        pos_after = [p for p in pos_remaining.values() if p.book_value > 0]
        nav_after = _nav(pos_after, cash_after_list)
        if leftover > 0:
            # Unfunded (should not happen if outflow <= NAV); treat as extra NAV hit.
            nav_after = max(nav_after - leftover, Decimal("0"))

        liq_after = (
            calculate_liquidity_ratios(pos_after, cash_after_list, nav_after, current_date=as_of)
            if nav_after > 0
            else LiquidityMetrics(
                dla_amount=Decimal("0"),
                wla_amount=Decimal("0"),
                dla_ratio=Decimal("0"),
                wla_ratio=Decimal("0"),
                dla_compliant=False,
                wla_compliant=False,
                compliant=False,
                total_nav=Decimal("0"),
            )
        )
        mtm_after = _mtm_nav(pos_after, cash_after_list) - haircut_loss
        amort_after = nav_after
        shadow_after = calculate_shadow_pricing_deviation(amort_after, mtm_after) if amort_after > 0 else (
            calculate_shadow_pricing_deviation(Decimal("0"), Decimal("0"))
        )
        wam_after = calculate_wam_and_wal(pos_after, as_of)
        fire_sale = illiquid_sold > 0

        flags: list[str] = []
        if fire_sale:
            flags.append("FIRE_SALE")
        if not liq_after.dla_compliant:
            flags.append("DLA_BREACH")
        if not liq_after.wla_compliant:
            flags.append("WLA_BREACH")
        if shadow_after.status.value != "NORMAL":
            flags.append(f"SHADOW_{shadow_after.status.value}")
        if leftover > 0:
            flags.append("UNFUNDED_REDEMPTION")

        waterfall = sorted(waterfall_agg.values(), key=lambda b: b.tier)
        chart = {
            "waterfall": [
                ChartSeriesPoint(
                    x=bar.bucket,
                    y=float(bar.consumed),
                    y2=float(bar.remaining),
                    label=bar.bucket,
                )
                for bar in waterfall
            ],
            "liquidity_before_after": {
                "categories": ["DLA %", "WLA %"],
                "before": [float(liq_before.dla_ratio * 100), float(liq_before.wla_ratio * 100)],
                "after": [float(liq_after.dla_ratio * 100), float(liq_after.wla_ratio * 100)],
                "limits": [float(DLA_MIN_RATIO * 100), float(WLA_MIN_RATIO * 100)],
            },
            "nav": [
                ChartSeriesPoint(x="Before", y=float(nav_before), label="NAV"),
                ChartSeriesPoint(x="After", y=float(nav_after), label="NAV"),
            ],
        }
        return RedemptionShockResult(
            scenario_type=scenario_type,
            scenario_pct=_ratio(pct),
            outflow=_money(outflow),
            nav_before=_money(nav_before),
            nav_after=_money(nav_after),
            cash_before=_money(_total_cash(cash_book)),
            cash_after=_money(_total_cash(cash_after_list)),
            dla_before=_money(liq_before.dla_amount),
            dla_after=_money(liq_after.dla_amount),
            wla_before=_money(liq_before.wla_amount),
            wla_after=_money(liq_after.wla_amount),
            dla_ratio_before=_ratio(liq_before.dla_ratio),
            dla_ratio_after=_ratio(liq_after.dla_ratio),
            wla_ratio_before=_ratio(liq_before.wla_ratio),
            wla_ratio_after=_ratio(liq_after.wla_ratio),
            dla_compliant_after=liq_after.dla_compliant,
            wla_compliant_after=liq_after.wla_compliant,
            fire_sale_required=fire_sale,
            illiquid_sold=_money(illiquid_sold),
            fire_sale_haircut=fire_sale_haircut,
            shadow_nav_loss=_money(haircut_loss),
            shadow_before=shadow_before,
            shadow_after=shadow_after,
            wam_wal_after=wam_after,
            liquidity_after=liq_after,
            waterfall=waterfall,
            chart=chart,
            flags=flags,
        )

    def interest_rate_shock(
        self,
        positions: Sequence[EnginePosition],
        bp_shifts: Sequence[int] = (-50, -25, 25, 50, 100),
        *,
        as_of: date,
        cash: Sequence[CashLadderEntry] | Decimal = Decimal("0"),
    ) -> InterestRateShockResult:
        cash_book = _cash_entries(cash, as_of)
        amortized = _nav(list(positions), cash_book)
        if amortized <= 0:
            raise ValueError("portfolio NAV must be positive")
        base_mtm = _mtm_nav(list(positions), cash_book)
        holidays = _holiday_array(as_of - timedelta(days=7), as_of + timedelta(days=400))

        scenarios: list[RateScenarioPoint] = []
        flags: list[str] = []
        for shift in bp_shifts:
            mtm = sum((c.amount for c in cash_book), Decimal("0"))
            dy = float(shift) / 10000.0
            for pos in positions:
                if pos.asset_class is AssetClass.FX_FORWARD:
                    mtm += pos.mark_to_market
                    continue
                end = pos.rate_reset_date or pos.maturity_date
                if pos.coupon_type is CouponType.FLOATING:
                    days = int(_business_days(as_of, _as_datetime64([end]), holidays)[0])
                    t = max(days, 0) / 365.0
                else:
                    t = max((pos.maturity_date - as_of).days, 0) / 365.0
                y = float(pos.coupon_rate) if pos.coupon_rate is not None else 0.04
                if t <= 0:
                    ratio = 1.0
                else:
                    ratio = (1.0 + y * t) / (1.0 + (y + dy) * t)
                mtm += pos.mark_to_market * Decimal(str(ratio))
            shadow = calculate_shadow_pricing_deviation(amortized, mtm)
            delta = mtm - base_mtm
            delta_bps = (delta / amortized * Decimal("10000")).quantize(_Q, rounding=ROUND_HALF_UP)
            if shadow.status.value != "NORMAL":
                flags.append(f"{shift:+d}bp:{shadow.status.value}")
            scenarios.append(
                RateScenarioPoint(
                    shift_bps=int(shift),
                    mtm_nav=_money(mtm),
                    amortized_nav=_money(amortized),
                    delta_mtm=_money(delta),
                    delta_nav_bps=delta_bps,
                    shadow=shadow,
                    chart_point=ChartSeriesPoint(
                        x=int(shift),
                        y=float(_money(mtm)),
                        y2=float(shadow.deviation_bps),
                        label=f"{shift:+d}bp",
                    ),
                )
            )

        worst = max((s.shadow.deviation_bps for s in scenarios), default=Decimal("0"))
        return InterestRateShockResult(
            as_of=as_of,
            amortized_nav=_money(amortized),
            base_mtm_nav=_money(base_mtm),
            bp_shifts=[int(s) for s in bp_shifts],
            scenarios=scenarios,
            chart={"nav_vs_shift": [s.chart_point for s in scenarios]},
            worst_deviation_bps=worst,
            flags=sorted(set(flags)),
        )
