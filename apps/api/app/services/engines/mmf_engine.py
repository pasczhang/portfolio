"""SFC Code on Unit Trusts and Mutual Funds Ch. 8.2 MMF metrics.

Reference limits (SFC UT Code §8.2):
- WAM <= 60 calendar days (floating: next reset; fixed: legal maturity)
- WAL <= 120 calendar days (always legal final maturity)
- Daily liquid assets (DLA) >= 10% of NAV
- Weekly liquid assets (WLA) >= 30% of NAV
- Shadow NAV collar: 25 bps warning / 50 bps critical
- Hedged class FX overlay tolerance: 98%–102%

WAM/WAL day counts are calendar days after HK business-day following adjustment
(weekend/holiday maturities roll forward). DLA/WLA windows use HK business days.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from enum import StrEnum
from functools import lru_cache
from typing import Sequence

import numpy as np
import polars as pl
import QuantLib as ql
from pydantic import BaseModel, Field

from app.models.enums import AssetClass, CouponType, HedgeStatus, ShareClassType

WAM_LIMIT_DAYS = 60
WAL_LIMIT_DAYS = 120
DLA_MIN_RATIO = Decimal("0.10")
WLA_MIN_RATIO = Decimal("0.30")
SHADOW_WARNING_RATIO = Decimal("0.0025")
SHADOW_CRITICAL_RATIO = Decimal("0.005")
HEDGE_RATIO_LOW = Decimal("0.98")
HEDGE_RATIO_HIGH = Decimal("1.02")

_DEC_DAYS = Decimal("0.000001")
_DEC_RATIO = Decimal("0.00000001")


class ShadowDeviationStatus(StrEnum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class EnginePosition(BaseModel):
    security_id: str
    book_value: Decimal = Field(ge=0)
    coupon_type: CouponType
    maturity_date: date
    rate_reset_date: date | None = None
    asset_class: AssetClass
    is_sovereign: bool = False
    settlement_lag_business_days: int = Field(default=0, ge=0, le=5)
    pledged_ratio: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    issuer_id: str = "UNKNOWN"
    issuer_name: str | None = None
    coupon_rate: Decimal | None = Field(default=None, ge=0)
    shadow_mtm: Decimal | None = Field(default=None, ge=0)

    @property
    def free_book_value(self) -> Decimal:
        return (self.book_value * (Decimal("1") - self.pledged_ratio)).quantize(Decimal("0.00000001"))

    @property
    def mark_to_market(self) -> Decimal:
        return self.shadow_mtm if self.shadow_mtm is not None else self.book_value


class CashLadderEntry(BaseModel):
    amount: Decimal
    available_on: date
    is_overnight_deposit: bool = False


class ShareClassSnapshot(BaseModel):
    share_class_id: str
    nav: Decimal = Field(ge=0)
    class_type: ShareClassType = ShareClassType.BASE


class FxForwardSnapshot(BaseModel):
    share_class_id: str
    notional: Decimal = Field(ge=0)
    status: HedgeStatus = HedgeStatus.OPEN


class WamWalMetrics(BaseModel):
    wam_days: Decimal
    wal_days: Decimal
    wam_limit_days: int = WAM_LIMIT_DAYS
    wal_limit_days: int = WAL_LIMIT_DAYS
    wam_within_limit: bool
    wal_within_limit: bool
    within_limit: bool
    total_book_value: Decimal
    position_count: int


class LiquidityMetrics(BaseModel):
    dla_amount: Decimal
    wla_amount: Decimal
    dla_ratio: Decimal
    wla_ratio: Decimal
    dla_min_ratio: Decimal = DLA_MIN_RATIO
    wla_min_ratio: Decimal = WLA_MIN_RATIO
    dla_compliant: bool
    wla_compliant: bool
    compliant: bool
    total_nav: Decimal


class ShadowPricingMetrics(BaseModel):
    amortized_cost_nav: Decimal
    mtm_nav: Decimal
    deviation_ratio: Decimal
    deviation_bps: Decimal
    status: ShadowDeviationStatus


class FxHedgeRatioRow(BaseModel):
    share_class_id: str
    hedge_ratio: Decimal | None
    fx_notional: Decimal
    class_nav: Decimal
    within_tolerance: bool
    applicable: bool
    tolerance_low: Decimal = HEDGE_RATIO_LOW
    tolerance_high: Decimal = HEDGE_RATIO_HIGH


def _to_decimal(value: float | Decimal, quant: Decimal) -> Decimal:
    if isinstance(value, Decimal):
        return value.quantize(quant, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(quant, rounding=ROUND_HALF_UP)


def _ql_date(value: date) -> ql.Date:
    return ql.Date(value.day, value.month, value.year)


@lru_cache(maxsize=16)
def hk_weekday_holidays(start: date, end: date) -> tuple[date, ...]:
    """HK public holidays that fall on weekdays (weekends handled by NumPy)."""
    calendar = ql.HongKong()
    holidays: list[date] = []
    cursor = start
    one_day = timedelta(days=1)
    while cursor <= end:
        ql_d = _ql_date(cursor)
        if (not calendar.isBusinessDay(ql_d)) and ql_d.weekday() not in (ql.Saturday, ql.Sunday):
            holidays.append(cursor)
        cursor += one_day
    return tuple(holidays)


def _holiday_array(start: date, end: date) -> np.ndarray:
    return np.array(hk_weekday_holidays(start, end), dtype="datetime64[D]")


def _as_datetime64(values: Sequence[date] | np.ndarray) -> np.ndarray:
    return np.asarray(values, dtype="datetime64[D]")


def _following(dates: np.ndarray, holidays: np.ndarray) -> np.ndarray:
    if dates.size == 0:
        return dates
    return np.busday_offset(dates, 0, roll="forward", holidays=holidays)


def _calendar_days(as_of: date, end_dates: np.ndarray, holidays: np.ndarray) -> np.ndarray:
    adjusted = _following(end_dates, holidays)
    origin = np.datetime64(as_of, "D")
    delta = (adjusted - origin).astype("timedelta64[D]").astype(np.int32)
    return np.maximum(delta, 0)


def _business_days(as_of: date, end_dates: np.ndarray, holidays: np.ndarray) -> np.ndarray:
    adjusted = _following(end_dates, holidays)
    origin = np.datetime64(as_of, "D")
    counts = np.busday_count(origin, adjusted, holidays=holidays)
    return np.maximum(counts.astype(np.int32), 0)


def _positions_frame(positions: Sequence[EnginePosition]) -> pl.DataFrame:
    rows = [item.model_dump() for item in positions]
    return pl.DataFrame(rows, infer_schema_length=len(rows))


def calculate_wam_and_wal(
    positions: Sequence[EnginePosition],
    current_date: date,
) -> WamWalMetrics:
    """SFC §8.2 WAM (<=60d) and WAL (<=120d), amortized-cost weighted.

    Floating-rate assets contribute time to next reset; fixed-rate assets
    contribute time to legal final maturity. WAL always uses legal final
    maturity. FX overlay forwards are excluded from the eligible MMF book.
    """
    eligible = [
        pos
        for pos in positions
        if pos.asset_class is not AssetClass.FX_FORWARD and pos.book_value > 0
    ]
    if not eligible:
        return WamWalMetrics(
            wam_days=Decimal("0"),
            wal_days=Decimal("0"),
            wam_within_limit=True,
            wal_within_limit=True,
            within_limit=True,
            total_book_value=Decimal("0"),
            position_count=0,
        )

    frame = _positions_frame(eligible)
    weights = frame["book_value"].cast(pl.Float64).to_numpy()
    total = float(weights.sum())
    maturity = _as_datetime64(frame["maturity_date"].to_list())
    reset_raw = frame["rate_reset_date"].to_list()
    maturity_dates = frame["maturity_date"].to_list()
    reset_filled = [
        reset if reset is not None else mat
        for reset, mat in zip(reset_raw, maturity_dates, strict=True)
    ]
    reset = _as_datetime64(reset_filled)
    coupon_label = np.array([str(value) for value in frame["coupon_type"].to_list()])
    is_floating = coupon_label == CouponType.FLOATING.value
    wam_end = maturity.copy()
    wam_end[is_floating] = reset[is_floating]

    horizon_end = current_date + timedelta(days=400)
    holidays = _holiday_array(current_date - timedelta(days=7), horizon_end)
    wam_days = _calendar_days(current_date, wam_end, holidays).astype(np.float64)
    wal_days = _calendar_days(current_date, maturity, holidays).astype(np.float64)
    share = weights / total
    wam = float(np.dot(share, wam_days))
    wal = float(np.dot(share, wal_days))
    wam_dec = _to_decimal(wam, _DEC_DAYS)
    wal_dec = _to_decimal(wal, _DEC_DAYS)
    wam_ok = wam_dec <= WAM_LIMIT_DAYS
    wal_ok = wal_dec <= WAL_LIMIT_DAYS
    return WamWalMetrics(
        wam_days=wam_dec,
        wal_days=wal_dec,
        wam_within_limit=wam_ok,
        wal_within_limit=wal_ok,
        within_limit=wam_ok and wal_ok,
        total_book_value=_to_decimal(Decimal(str(total)), Decimal("0.00000001")),
        position_count=len(eligible),
    )


def _unencumbered(book_value: np.ndarray, pledged_ratio: np.ndarray) -> np.ndarray:
    return book_value * (1.0 - pledged_ratio)


def calculate_liquidity_ratios(
    positions: Sequence[EnginePosition],
    cash_ladder: Sequence[CashLadderEntry],
    total_nav: Decimal,
    current_date: date | None = None,
) -> LiquidityMetrics:
    """SFC §8.2 DLA (>=10%) and WLA (>=30%).

    DLA: cash, overnight deposits, next-business-day sovereigns / T+0-1 govvies.
    WLA: DLA plus assets maturing within 5 HK business days, plus T-bills.
    Encumbered (pledged) book value is excluded from liquid amounts.
    """
    if total_nav <= 0:
        raise ValueError("total_nav must be positive")

    as_of = current_date or date.today()
    horizon_end = as_of + timedelta(days=40)
    holidays = _holiday_array(as_of - timedelta(days=7), horizon_end)

    dla_cutoff = np.busday_offset(
        np.datetime64(as_of, "D"), 1, roll="forward", holidays=holidays
    )
    wla_cutoff = np.busday_offset(
        np.datetime64(as_of, "D"), 5, roll="forward", holidays=holidays
    )

    dla_cash = Decimal("0")
    wla_cash = Decimal("0")
    for entry in cash_ladder:
        avail = np.datetime64(entry.available_on, "D")
        amount = entry.amount
        if amount <= 0:
            continue
        if avail <= dla_cutoff:
            dla_cash += amount
            wla_cash += amount
        elif avail <= wla_cutoff:
            wla_cash += amount

    dla_pos = Decimal("0")
    wla_pos = Decimal("0")
    book_positions = [pos for pos in positions if pos.asset_class is not AssetClass.FX_FORWARD]
    if book_positions:
        frame = _positions_frame(book_positions)
        book = frame["book_value"].cast(pl.Float64).to_numpy()
        pledged = frame["pledged_ratio"].cast(pl.Float64).to_numpy()
        free = _unencumbered(book, pledged)
        maturity = _as_datetime64(frame["maturity_date"].to_list())
        bdays = _business_days(as_of, maturity, holidays)
        asset = frame["asset_class"].to_list()
        sovereign = frame["is_sovereign"].to_numpy().astype(bool)
        lag = frame["settlement_lag_business_days"].cast(pl.Int32).to_numpy()

        is_tbill = np.array(
            [item in (AssetClass.T_BILL, AssetClass.T_BILL.value) for item in asset]
        )
        is_deposit = np.array(
            [item in (AssetClass.DEPOSIT, AssetClass.DEPOSIT.value) for item in asset]
        )
        is_repo = np.array(
            [item in (AssetClass.REPO, AssetClass.REPO.value) for item in asset]
        )

        next_day_gov = sovereign & (lag <= 1)
        dla_mask = (
            ((is_deposit | is_repo) & (bdays <= 1))
            | (is_tbill & next_day_gov)
            | ((sovereign & ~is_tbill) & (lag <= 1) & (bdays <= 1))
        )
        wla_mask = dla_mask | (bdays <= 5) | is_tbill

        dla_pos = Decimal(str(float(free[dla_mask].sum())))
        wla_pos = Decimal(str(float(free[wla_mask].sum())))

    dla_amount = dla_cash + dla_pos
    wla_amount = wla_cash + wla_pos
    if wla_amount < dla_amount:
        wla_amount = dla_amount

    dla_ratio = (dla_amount / total_nav).quantize(_DEC_RATIO, rounding=ROUND_HALF_UP)
    wla_ratio = (wla_amount / total_nav).quantize(_DEC_RATIO, rounding=ROUND_HALF_UP)
    dla_ok = dla_ratio >= DLA_MIN_RATIO
    wla_ok = wla_ratio >= WLA_MIN_RATIO
    return LiquidityMetrics(
        dla_amount=_to_decimal(dla_amount, Decimal("0.00000001")),
        wla_amount=_to_decimal(wla_amount, Decimal("0.00000001")),
        dla_ratio=dla_ratio,
        wla_ratio=wla_ratio,
        dla_compliant=dla_ok,
        wla_compliant=wla_ok,
        compliant=dla_ok and wla_ok,
        total_nav=total_nav,
    )


def calculate_shadow_pricing_deviation(
    amortized_cost_nav: Decimal,
    mtm_nav: Decimal,
) -> ShadowPricingMetrics:
    """Absolute shadow NAV deviation vs amortized-cost NAV (SFC collar)."""
    if amortized_cost_nav == 0:
        if mtm_nav == 0:
            deviation = Decimal("0")
            status = ShadowDeviationStatus.NORMAL
        else:
            deviation = Decimal("1")
            status = ShadowDeviationStatus.CRITICAL
    else:
        deviation = (abs(mtm_nav - amortized_cost_nav) / abs(amortized_cost_nav)).quantize(
            _DEC_RATIO, rounding=ROUND_HALF_UP
        )
        if deviation >= SHADOW_CRITICAL_RATIO:
            status = ShadowDeviationStatus.CRITICAL
        elif deviation >= SHADOW_WARNING_RATIO:
            status = ShadowDeviationStatus.WARNING
        else:
            status = ShadowDeviationStatus.NORMAL

    return ShadowPricingMetrics(
        amortized_cost_nav=amortized_cost_nav,
        mtm_nav=mtm_nav,
        deviation_ratio=deviation,
        deviation_bps=(deviation * Decimal("10000")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        status=status,
    )


def calculate_fx_hedge_ratios(
    share_classes: Sequence[ShareClassSnapshot],
    fx_forwards: Sequence[FxForwardSnapshot],
) -> list[FxHedgeRatioRow]:
    """Hedge ratio = open FX forward notional / share-class NAV; band [98%, 102%]."""
    if not share_classes:
        return []

    class_frame = pl.DataFrame([item.model_dump() for item in share_classes])
    open_fx = [
        item.model_dump()
        for item in fx_forwards
        if item.status is HedgeStatus.OPEN or item.status == HedgeStatus.OPEN.value
    ]
    if open_fx:
        fx_frame = (
            pl.DataFrame(open_fx)
            .group_by("share_class_id")
            .agg(pl.col("notional").sum().alias("fx_notional"))
        )
        joined = class_frame.join(fx_frame, on="share_class_id", how="left")
    else:
        joined = class_frame.with_columns(pl.lit(0.0).alias("fx_notional"))

    joined = joined.with_columns(pl.col("fx_notional").fill_null(Decimal("0")))
    rows: list[FxHedgeRatioRow] = []
    for rec in joined.iter_rows(named=True):
        class_type = rec["class_type"]
        is_hedged = class_type in (ShareClassType.HEDGED, ShareClassType.HEDGED.value)
        nav = Decimal(str(rec["nav"]))
        notional = Decimal(str(rec["fx_notional"]))
        if not is_hedged:
            rows.append(
                FxHedgeRatioRow(
                    share_class_id=rec["share_class_id"],
                    hedge_ratio=None,
                    fx_notional=notional,
                    class_nav=nav,
                    within_tolerance=True,
                    applicable=False,
                )
            )
            continue
        if nav == 0:
            rows.append(
                FxHedgeRatioRow(
                    share_class_id=rec["share_class_id"],
                    hedge_ratio=None,
                    fx_notional=notional,
                    class_nav=nav,
                    within_tolerance=False,
                    applicable=True,
                )
            )
            continue
        ratio = (notional / nav).quantize(_DEC_RATIO, rounding=ROUND_HALF_UP)
        rows.append(
            FxHedgeRatioRow(
                share_class_id=rec["share_class_id"],
                hedge_ratio=ratio,
                fx_notional=notional,
                class_nav=nav,
                within_tolerance=HEDGE_RATIO_LOW <= ratio <= HEDGE_RATIO_HIGH,
                applicable=True,
            )
        )
    return rows


class MMFEngine:
    """Facade for SFC §8.2 vectorized MMF tests."""

    calculate_wam_and_wal = staticmethod(calculate_wam_and_wal)
    calculate_liquidity_ratios = staticmethod(calculate_liquidity_ratios)
    calculate_shadow_pricing_deviation = staticmethod(calculate_shadow_pricing_deviation)
    calculate_fx_hedge_ratios = staticmethod(calculate_fx_hedge_ratios)
