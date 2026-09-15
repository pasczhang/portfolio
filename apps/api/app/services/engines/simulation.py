"""Pre-trade what-if vs current MMF snapshot (SFC §8.2 gates)."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from enum import StrEnum
from typing import Annotated, Sequence
from uuid import uuid4

from pydantic import BaseModel, Field, BeforeValidator, model_validator

from app.models.enums import AssetClass, CouponType, Currency, TradeSide
from app.services.engines.mmf_engine import (
    DLA_MIN_RATIO,
    WAL_LIMIT_DAYS,
    WAM_LIMIT_DAYS,
    CashLadderEntry,
    EnginePosition,
    calculate_liquidity_ratios,
    calculate_wam_and_wal,
)
from app.services.engines.stress_test import _cash_entries, _money, _nav, _ratio

ISSUER_LIMIT = Decimal("0.10")
ISSUER_PRIVILEGED = Decimal("0.20")
ISSUER_WATCH = Decimal("0.08")
MAX_RESIDUAL_DAYS = 397
WLA_PRETRADE_FLOOR = Decimal("0.20")
WAM_WATCH_DAYS = Decimal("55")
WAL_WATCH_DAYS = Decimal("108")
HKD_PER_USD = Decimal("7.80")
_ASSET_ALIASES = {
    "TD": AssetClass.DEPOSIT,
    "NCD": AssetClass.CD,
    "REVERSE REPO": AssetClass.REPO,
    "REVERSEREPO": AssetClass.REPO,
    "REVERSE_REPO": AssetClass.REPO,
    "REPO": AssetClass.REPO,
}


def _coerce_asset(value: object) -> AssetClass:
    if isinstance(value, AssetClass):
        return value
    key = str(value).strip().upper().replace("-", " ")
    if key in _ASSET_ALIASES:
        return _ASSET_ALIASES[key]
    return AssetClass(str(value))


AssetClassField = Annotated[AssetClass, BeforeValidator(_coerce_asset)]


class DecisionSeverity(StrEnum):
    PASS = "PASS"
    WATCH = "WATCH"
    BLOCK = "BLOCK"


class ProposedTrade(BaseModel):
    side: TradeSide = TradeSide.BUY
    notional: Decimal = Field(gt=0)
    currency: Currency = Currency.USD
    asset_class: AssetClassField = AssetClass.DEPOSIT
    issuer_id: str
    issuer_name: str | None = None
    tenor_days: int = Field(gt=0, le=800)
    coupon_type: CouponType = CouponType.FIXED
    coupon_rate: Decimal | None = Field(default=None, ge=0)
    settlement_lag_business_days: int = 0
    is_sovereign: bool = False
    security_id: str | None = None
    name: str | None = None

    @model_validator(mode="after")
    def infer_sovereign(self) -> ProposedTrade:
        if self.asset_class is AssetClass.T_BILL:
            self.is_sovereign = True
        return self


class PortfolioSnapshot(BaseModel):
    as_of: date
    positions: list[EnginePosition]
    cash: list[CashLadderEntry] | Decimal = Decimal("0")


class MetricDelta(BaseModel):
    id: str
    label: str
    unit: str
    before: Decimal
    after: Decimal
    delta: Decimal
    limit: Decimal | None = None
    floor: Decimal | None = None
    breached: bool = False
    watch: bool = False
    note: str | None = None


class ConcentrationRow(BaseModel):
    issuer_id: str
    issuer_name: str | None
    before_amount: Decimal
    after_amount: Decimal
    before_pct: Decimal
    after_pct: Decimal
    limit_pct: Decimal = ISSUER_LIMIT
    privileged_limit_pct: Decimal = ISSUER_PRIVILEGED
    privileged: bool = False
    breached: bool
    is_trade_issuer: bool = False


class ComplianceFlag(BaseModel):
    code: str
    severity: DecisionSeverity
    message: str
    clause: str | None = None


class PreTradeWhatIfResult(BaseModel):
    trade: ProposedTrade
    as_of: date
    nav_before: Decimal
    nav_after: Decimal
    cash_after: Decimal
    metrics: list[MetricDelta]
    concentration: list[ConcentrationRow]
    flags: list[ComplianceFlag]
    decision: DecisionSeverity
    allow: bool
    intercept: bool
    gate_title: str = "PRE-TRADE PASS"
    gate_detail: str = ""
    chart: dict[str, object]


def _metric(
    id_: str,
    label: str,
    unit: str,
    before: Decimal,
    after: Decimal,
    *,
    limit: Decimal | None = None,
    floor: Decimal | None = None,
) -> MetricDelta:
    delta = (after - before).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    breached = False
    watch = False
    if limit is not None and after > limit:
        breached = True
    if floor is not None and after < floor:
        breached = True
    if limit is not None and not breached and after > limit * Decimal("0.9"):
        watch = True
    if floor is not None and not breached and after < floor * Decimal("1.1"):
        watch = True
    return MetricDelta(
        id=id_,
        label=label,
        unit=unit,
        before=before,
        after=after,
        delta=delta,
        limit=limit,
        floor=floor,
        breached=breached,
        watch=watch,
        note=None,
    )


def _usd_notional(trade: ProposedTrade) -> Decimal:
    if trade.currency is Currency.HKD:
        return (trade.notional / HKD_PER_USD).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return trade.notional


def _portfolio_yield_pct(positions: Sequence[EnginePosition], nav: Decimal) -> Decimal:
    if nav <= 0:
        return Decimal("0")
    weighted = sum((pos.book_value * (pos.coupon_rate or Decimal("0")) for pos in positions), Decimal("0"))
    return _ratio(weighted / nav * 100)


def _issuer_map(
    positions: Sequence[EnginePosition],
) -> dict[str, tuple[str | None, Decimal, bool]]:
    agg: dict[str, tuple[str | None, Decimal, bool]] = {}
    for pos in positions:
        if pos.asset_class is AssetClass.FX_FORWARD:
            continue
        name, amount, privileged = agg.get(pos.issuer_id, (pos.issuer_name, Decimal("0"), False))
        agg[pos.issuer_id] = (
            pos.issuer_name or name,
            amount + pos.book_value,
            privileged or pos.is_sovereign,
        )
    return agg


def _apply_trade(
    snapshot: PortfolioSnapshot,
    trade: ProposedTrade,
) -> tuple[list[EnginePosition], list[CashLadderEntry], list[ComplianceFlag]]:
    flags: list[ComplianceFlag] = []
    cash = _cash_entries(snapshot.cash, snapshot.as_of)
    positions = [p.model_copy() for p in snapshot.positions]
    notional = _usd_notional(trade)

    if trade.side is TradeSide.BUY:
        remaining = notional
        new_cash: list[CashLadderEntry] = []
        for entry in sorted(cash, key=lambda e: e.available_on):
            if remaining <= 0:
                new_cash.append(entry)
                continue
            take = min(entry.amount, remaining)
            leftover = entry.amount - take
            remaining -= take
            if leftover > 0:
                new_cash.append(entry.model_copy(update={"amount": leftover}))
        cash = new_cash
        if remaining > 0:
            flags.append(
                ComplianceFlag(
                    code="CASH_SHORTFALL",
                    severity=DecisionSeverity.BLOCK,
                    message=f"Cash shortfall {remaining} vs trade notional {notional}",
                )
            )
        maturity = snapshot.as_of + timedelta(days=trade.tenor_days)
        reset = None
        if trade.coupon_type is CouponType.FLOATING:
            reset = snapshot.as_of + timedelta(days=min(30, trade.tenor_days))
        positions.append(
            EnginePosition(
                security_id=trade.security_id or f"whatif-{uuid4()}",
                book_value=notional,
                coupon_type=trade.coupon_type,
                maturity_date=maturity,
                rate_reset_date=reset,
                asset_class=trade.asset_class,
                is_sovereign=trade.is_sovereign,
                settlement_lag_business_days=trade.settlement_lag_business_days,
                issuer_id=trade.issuer_id,
                issuer_name=trade.issuer_name,
                coupon_rate=trade.coupon_rate,
                shadow_mtm=notional,
            )
        )
    else:
        remaining = notional
        new_pos: list[EnginePosition] = []
        for pos in positions:
            if remaining <= 0 or pos.issuer_id != trade.issuer_id or pos.asset_class != trade.asset_class:
                new_pos.append(pos)
                continue
            take = min(pos.book_value, remaining)
            remaining -= take
            leftover = pos.book_value - take
            if leftover > 0:
                new_pos.append(pos.model_copy(update={"book_value": leftover}))
        positions = new_pos
        cash = cash + [CashLadderEntry(amount=notional - remaining, available_on=snapshot.as_of)]
        if remaining > 0:
            flags.append(
                ComplianceFlag(
                    code="POSITION_SHORTFALL",
                    severity=DecisionSeverity.BLOCK,
                    message="Sell quantity exceeds issuer/asset holdings",
                )
            )

    if trade.tenor_days > MAX_RESIDUAL_DAYS and not trade.is_sovereign:
        flags.append(
                ComplianceFlag(
                    code="MATURITY_397",
                    severity=DecisionSeverity.BLOCK,
                    clause="SFC 8.2",
                    message=(
                        f"SFC 8.2: residual maturity {trade.tenor_days}D exceeds 397D single-asset limit"
                    ),
                )
        )
    return positions, cash, flags


class SimulationEngine:
    def pre_trade_what_if(
        self,
        snapshot: PortfolioSnapshot,
        trade: ProposedTrade,
    ) -> PreTradeWhatIfResult:
        as_of = snapshot.as_of
        cash_before = _cash_entries(snapshot.cash, as_of)
        nav_before = _nav(snapshot.positions, cash_before)
        if nav_before <= 0:
            raise ValueError("portfolio NAV must be positive")

        wam_b = calculate_wam_and_wal(snapshot.positions, as_of)
        liq_b = calculate_liquidity_ratios(snapshot.positions, cash_before, nav_before, current_date=as_of)
        issuers_b = _issuer_map(snapshot.positions)

        positions_a, cash_a, flags = _apply_trade(snapshot, trade)
        nav_after = _nav(positions_a, cash_a)
        if nav_after <= 0:
            nav_after = Decimal("0.01")
        wam_a = calculate_wam_and_wal(positions_a, as_of)
        liq_a = calculate_liquidity_ratios(positions_a, cash_a, nav_after, current_date=as_of)
        issuers_a = _issuer_map(positions_a)

        empty_iss = (trade.issuer_name, Decimal("0"), trade.is_sovereign)
        trade_name_a, trade_amt_a, trade_priv = issuers_a.get(trade.issuer_id, empty_iss)
        trade_amt_b = issuers_b.get(trade.issuer_id, empty_iss)[1]
        trade_pct_b = trade_amt_b / nav_before if nav_before else Decimal("0")
        trade_pct_a = trade_amt_a / nav_after if nav_after else Decimal("0")
        issuer_cap = ISSUER_PRIVILEGED if (trade.is_sovereign or trade_priv) else ISSUER_LIMIT
        yield_b = _portfolio_yield_pct(snapshot.positions, nav_before)
        yield_a = _portfolio_yield_pct(positions_a, nav_after)
        dla_a_pct = _ratio(liq_a.dla_ratio * 100)
        wla_a_pct = _ratio(liq_a.wla_ratio * 100)

        aum_metric = _metric("aum", "Total AUM", "usd", nav_before, nav_after)
        wam_metric = _metric("wam", "WAM", "days", wam_b.wam_days, wam_a.wam_days, limit=Decimal(WAM_LIMIT_DAYS))
        wal_metric = _metric("wal", "WAL", "days", wam_b.wal_days, wam_a.wal_days, limit=Decimal(WAL_LIMIT_DAYS))
        if not wam_metric.breached and wam_a.wam_days > WAM_WATCH_DAYS:
            wam_metric.watch = True
        if not wal_metric.breached and wam_a.wal_days > WAL_WATCH_DAYS:
            wal_metric.watch = True
        issuer_metric = _metric(
            "issuer",
            f"Issuer {trade.issuer_name or trade.issuer_id}",
            "pct",
            _ratio(trade_pct_b * 100),
            _ratio(trade_pct_a * 100),
            limit=_ratio(issuer_cap * 100),
        )
        issuer_metric.note = "10% standard / 20% privileged"
        wla_metric = _metric(
            "wla",
            "WLA",
            "pct",
            _ratio(liq_b.wla_ratio * 100),
            wla_a_pct,
            floor=_ratio(WLA_PRETRADE_FLOOR * 100),
        )
        metrics = [
            aum_metric,
            wam_metric,
            wal_metric,
            issuer_metric,
            _metric(
                "dla",
                "DLA",
                "pct",
                _ratio(liq_b.dla_ratio * 100),
                dla_a_pct,
                floor=_ratio(DLA_MIN_RATIO * 100),
            ),
            wla_metric,
            _metric("yield", "Portfolio Yield", "pct", yield_b, yield_a),
        ]

        if trade_pct_a > ISSUER_PRIVILEGED:
            flags.append(
                ComplianceFlag(
                    code="ISSUER_20PCT",
                    severity=DecisionSeverity.BLOCK,
                    clause="SFC 8.2",
                    message=(
                        f"SFC 8.2: issuer exposure {_ratio(trade_pct_a * 100)}% exceeds "
                        f"20% privileged concentration cap ({trade.issuer_name or trade.issuer_id})"
                    ),
                )
            )
        elif trade_pct_a > ISSUER_LIMIT and not (trade.is_sovereign or trade_priv):
            flags.append(
                ComplianceFlag(
                    code="ISSUER_10PCT",
                    severity=DecisionSeverity.BLOCK,
                    clause="SFC 8.2",
                    message=(
                        f"SFC 8.2: issuer exposure {_ratio(trade_pct_a * 100)}% exceeds "
                        f"10% single-issuer limit (privileged cap 20%) — {trade.issuer_name or trade.issuer_id}"
                    ),
                )
            )
        elif trade_pct_a > ISSUER_WATCH and not (trade.is_sovereign or trade_priv):
            flags.append(
                ComplianceFlag(
                    code="ISSUER_WATCH",
                    severity=DecisionSeverity.WATCH,
                    clause="SFC 8.2",
                    message=(
                        f"SFC 8.2: issuer exposure {_ratio(trade_pct_a * 100)}% approaching "
                        f"10% single-issuer limit ({trade.issuer_name or trade.issuer_id})"
                    ),
                )
            )
        if wam_a.wam_days > WAM_LIMIT_DAYS:
            flags.append(
                ComplianceFlag(
                    code="WAM_60",
                    severity=DecisionSeverity.BLOCK,
                    clause="SFC 8.2(f)",
                    message=f"SFC 8.2(f): WAM {_ratio(wam_a.wam_days)}D exceeds 60D limit",
                )
            )
        elif wam_a.wam_days > WAM_WATCH_DAYS:
            flags.append(
                ComplianceFlag(
                    code="WAM_WATCH",
                    severity=DecisionSeverity.WATCH,
                    clause="SFC 8.2(f)",
                    message=f"SFC 8.2(f): WAM {_ratio(wam_a.wam_days)}D approaching 60D cap",
                )
            )
        if wam_a.wal_days > WAL_LIMIT_DAYS:
            flags.append(
                ComplianceFlag(
                    code="WAL_120",
                    severity=DecisionSeverity.BLOCK,
                    clause="SFC 8.2(g)",
                    message=f"SFC 8.2(g): WAL {_ratio(wam_a.wal_days)}D exceeds 120D limit",
                )
            )
        elif wam_a.wal_days > WAL_WATCH_DAYS:
            flags.append(
                ComplianceFlag(
                    code="WAL_WATCH",
                    severity=DecisionSeverity.WATCH,
                    clause="SFC 8.2(g)",
                    message=f"SFC 8.2(g): WAL {_ratio(wam_a.wal_days)}D approaching 120D cap",
                )
            )
        if dla_a_pct < DLA_MIN_RATIO * 100:
            flags.append(
                ComplianceFlag(
                    code="DLA_10PCT",
                    severity=DecisionSeverity.BLOCK,
                    clause="SFC 8.2",
                    message=f"SFC 8.2: DLA {dla_a_pct}% below 10% daily liquidity floor",
                )
            )
        if wla_a_pct < WLA_PRETRADE_FLOOR * 100:
            flags.append(
                ComplianceFlag(
                    code="WLA_20PCT",
                    severity=DecisionSeverity.BLOCK,
                    clause="SFC 8.2",
                    message=f"SFC 8.2: WLA {wla_a_pct}% below 20% weekly liquidity floor",
                )
            )

        ids = set(issuers_b) | set(issuers_a)
        concentration: list[ConcentrationRow] = []
        for issuer_id in sorted(ids):
            name_b, amt_b, priv_b = issuers_b.get(issuer_id, (None, Decimal("0"), False))
            name_a, amt_a, priv_a = issuers_a.get(issuer_id, (None, Decimal("0"), False))
            privileged = priv_a or priv_b
            pct_b = amt_b / nav_before if nav_before else Decimal("0")
            pct_a = amt_a / nav_after if nav_after else Decimal("0")
            cap = ISSUER_PRIVILEGED if privileged else ISSUER_LIMIT
            concentration.append(
                ConcentrationRow(
                    issuer_id=issuer_id,
                    issuer_name=name_a or name_b,
                    before_amount=_money(amt_b),
                    after_amount=_money(amt_a),
                    before_pct=_ratio(pct_b),
                    after_pct=_ratio(pct_a),
                    limit_pct=cap,
                    privileged=privileged,
                    breached=pct_a > cap,
                    is_trade_issuer=issuer_id == trade.issuer_id,
                )
            )
        concentration.sort(key=lambda r: r.after_pct, reverse=True)

        severities = [f.severity for f in flags]
        if DecisionSeverity.BLOCK in severities:
            decision = DecisionSeverity.BLOCK
            gate_title = "SFC 违规阻断（BREACH DETECTED）"
            gate_detail = "拟投交易触发 SFC 8.2 硬性限额，禁止提交。"
        elif DecisionSeverity.WATCH in severities:
            decision = DecisionSeverity.WATCH
            gate_title = "接近预警（WARNING）"
            gate_detail = "指标接近 SFC 8.2 阈值，可提交但需投委会关注。"
        else:
            decision = DecisionSeverity.PASS
            gate_title = "合规通过（PRE-TRADE PASS）"
            gate_detail = "WAM / WAL / 397D / 集中度 / DLA / WLA 均在限额内。"

        chart = {
            "bars": {
                "categories": [m.label for m in metrics],
                "before": [float(m.before) for m in metrics],
                "after": [float(m.after) for m in metrics],
                "limits": [
                    float(m.limit) if m.limit is not None else (float(m.floor) if m.floor is not None else None)
                    for m in metrics
                ],
            },
            "issuer_pie_after": [
                {"id": r.issuer_id, "name": r.issuer_name or r.issuer_id, "pct": float(r.after_pct * 100)}
                for r in concentration[:8]
            ],
            "delta_line": [{"x": m.id, "y": float(m.delta), "label": m.label} for m in metrics],
        }
        return PreTradeWhatIfResult(
            trade=trade,
            as_of=as_of,
            nav_before=_money(nav_before),
            nav_after=_money(nav_after),
            cash_after=_money(sum((c.amount for c in cash_a), Decimal("0"))),
            metrics=metrics,
            concentration=concentration,
            flags=flags,
            decision=decision,
            allow=decision is not DecisionSeverity.BLOCK,
            intercept=decision is DecisionSeverity.BLOCK,
            gate_title=gate_title,
            gate_detail=gate_detail,
            chart=chart,
        )
