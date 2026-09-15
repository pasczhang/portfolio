from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.enums import AssetClass, CouponType, HedgeStatus, ShareClassType
from app.services.engines.mmf_engine import (
    CashLadderEntry,
    EnginePosition,
    FxForwardSnapshot,
    ShadowDeviationStatus,
    ShareClassSnapshot,
    calculate_fx_hedge_ratios,
    calculate_liquidity_ratios,
    calculate_shadow_pricing_deviation,
    calculate_wam_and_wal,
    hk_weekday_holidays,
)

AS_OF = date(2026, 9, 10)  # Thursday


def _pos(
    *,
    security_id: str,
    book_value: str,
    coupon_type: CouponType,
    maturity: date,
    reset: date | None = None,
    asset_class: AssetClass = AssetClass.CP,
    is_sovereign: bool = False,
    lag: int = 0,
    pledged: str = "0",
) -> EnginePosition:
    return EnginePosition(
        security_id=security_id,
        book_value=Decimal(book_value),
        coupon_type=coupon_type,
        maturity_date=maturity,
        rate_reset_date=reset,
        asset_class=asset_class,
        is_sovereign=is_sovereign,
        settlement_lag_business_days=lag,
        pledged_ratio=Decimal(pledged),
    )


def test_empty_book_wam_wal_within_limits() -> None:
    metrics = calculate_wam_and_wal([], AS_OF)
    assert metrics.wam_days == Decimal("0")
    assert metrics.wal_days == Decimal("0")
    assert metrics.within_limit
    assert metrics.position_count == 0


def test_fixed_wam_equals_wal() -> None:
    maturity = date(2026, 10, 8)  # Thursday, 28 calendar days
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="CP1",
                book_value="100",
                coupon_type=CouponType.FIXED,
                maturity=maturity,
            )
        ],
        AS_OF,
    )
    assert metrics.wam_days == metrics.wal_days
    assert metrics.wam_days == Decimal("28")
    assert metrics.within_limit


def test_floating_uses_reset_for_wam_maturity_for_wal() -> None:
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="FRN1",
                book_value="100",
                coupon_type=CouponType.FLOATING,
                maturity=date(2026, 12, 9),
                reset=date(2026, 9, 17),
                asset_class=AssetClass.CD,
            )
        ],
        AS_OF,
    )
    assert metrics.wam_days == Decimal("7")
    assert metrics.wal_days == Decimal("90")
    assert metrics.wam_within_limit
    assert metrics.wal_within_limit


def test_weighted_mix_numpy_dot_product() -> None:
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="FIX",
                book_value="50",
                coupon_type=CouponType.FIXED,
                maturity=date(2026, 9, 30),
            ),
            _pos(
                security_id="FLT",
                book_value="50",
                coupon_type=CouponType.FLOATING,
                maturity=date(2026, 12, 9),
                reset=date(2026, 9, 17),
                asset_class=AssetClass.CD,
            ),
        ],
        AS_OF,
    )
    assert metrics.wam_days == Decimal("13.5")
    assert metrics.wal_days == Decimal("55")


def test_past_reset_clips_wam_to_zero() -> None:
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="FRN2",
                book_value="10",
                coupon_type=CouponType.FLOATING,
                maturity=date(2026, 10, 20),
                reset=AS_OF - timedelta(days=1),
                asset_class=AssetClass.DEPOSIT,
            )
        ],
        AS_OF,
    )
    assert metrics.wam_days == Decimal("0")
    assert metrics.wal_days == Decimal("40")


def test_weekend_maturity_rolls_following_monday() -> None:
    friday = date(2026, 9, 11)
    saturday = date(2026, 9, 12)
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="WKND",
                book_value="1",
                coupon_type=CouponType.FIXED,
                maturity=saturday,
            )
        ],
        friday,
    )
    monday = date(2026, 9, 14)
    assert metrics.wam_days == Decimal((monday - friday).days)
    assert metrics.wam_days == Decimal("3")


def test_hk_holiday_maturity_rolls_following() -> None:
    as_of = date(2026, 9, 30)
    national_day = date(2026, 10, 1)
    holidays = hk_weekday_holidays(as_of, date(2026, 10, 10))
    if national_day not in holidays:
        pytest.skip("QuantLib HK calendar does not mark 2026-10-01 as a weekday holiday")
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="NDAY",
                book_value="1",
                coupon_type=CouponType.FIXED,
                maturity=national_day,
                asset_class=AssetClass.T_BILL,
                is_sovereign=True,
            )
        ],
        as_of,
    )
    unadjusted = Decimal((national_day - as_of).days)
    assert metrics.wam_days > unadjusted
    assert metrics.wam_days == Decimal("2")


def test_wam_breach_above_60_days() -> None:
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="LONG",
                book_value="100",
                coupon_type=CouponType.FIXED,
                maturity=date(2026, 11, 24),
            )
        ],
        AS_OF,
    )
    assert not metrics.wam_within_limit
    assert metrics.wal_within_limit
    assert not metrics.within_limit


def test_wal_breach_above_120_days() -> None:
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="FRN3",
                book_value="100",
                coupon_type=CouponType.FLOATING,
                maturity=date(2027, 1, 15),
                reset=date(2026, 9, 17),
                asset_class=AssetClass.CD,
            )
        ],
        AS_OF,
    )
    assert metrics.wam_within_limit
    assert not metrics.wal_within_limit


def test_fx_forward_excluded_from_wam_book() -> None:
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="FX1",
                book_value="999",
                coupon_type=CouponType.FIXED,
                maturity=AS_OF + timedelta(days=30),
                asset_class=AssetClass.FX_FORWARD,
            )
        ],
        AS_OF,
    )
    assert metrics.position_count == 0
    assert metrics.wam_days == Decimal("0")


def test_zero_book_value_ignored() -> None:
    metrics = calculate_wam_and_wal(
        [
            _pos(
                security_id="ZERO",
                book_value="0",
                coupon_type=CouponType.FIXED,
                maturity=AS_OF + timedelta(days=10),
            )
        ],
        AS_OF,
    )
    assert metrics.position_count == 0


def test_liquidity_dla_cash_and_overnight() -> None:
    result = calculate_liquidity_ratios(
        positions=[],
        cash_ladder=[
            CashLadderEntry(amount=Decimal("10"), available_on=AS_OF, is_overnight_deposit=False),
            CashLadderEntry(
                amount=Decimal("5"),
                available_on=date(2026, 9, 11),
                is_overnight_deposit=True,
            ),
        ],
        total_nav=Decimal("100"),
        current_date=AS_OF,
    )
    assert result.dla_ratio == Decimal("0.15")
    assert result.wla_ratio == Decimal("0.15")
    assert result.dla_compliant
    assert not result.wla_compliant


def test_liquidity_t_bill_counts_as_wla_and_t1_gov_as_dla() -> None:
    result = calculate_liquidity_ratios(
        positions=[
            _pos(
                security_id="TB",
                book_value="20",
                coupon_type=CouponType.FIXED,
                maturity=AS_OF + timedelta(days=80),
                asset_class=AssetClass.T_BILL,
                is_sovereign=True,
                lag=1,
            ),
            _pos(
                security_id="CP",
                book_value="10",
                coupon_type=CouponType.FIXED,
                maturity=date(2026, 9, 16),
                asset_class=AssetClass.CP,
            ),
        ],
        cash_ladder=[CashLadderEntry(amount=Decimal("10"), available_on=AS_OF)],
        total_nav=Decimal("100"),
        current_date=AS_OF,
    )
    assert result.dla_amount == Decimal("30")
    assert result.wla_amount == Decimal("40")
    assert result.dla_compliant
    assert result.wla_compliant


def test_liquidity_five_business_days_skips_weekend() -> None:
    result = calculate_liquidity_ratios(
        positions=[
            _pos(
                security_id="CP5",
                book_value="30",
                coupon_type=CouponType.FIXED,
                maturity=date(2026, 9, 17),
                asset_class=AssetClass.CP,
            )
        ],
        cash_ladder=[],
        total_nav=Decimal("100"),
        current_date=AS_OF,
    )
    assert result.dla_amount == Decimal("0")
    assert result.wla_amount == Decimal("30")
    assert result.wla_compliant
    assert not result.dla_compliant


def test_pledged_face_excluded_from_liquid_assets() -> None:
    result = calculate_liquidity_ratios(
        positions=[
            _pos(
                security_id="TB",
                book_value="30",
                coupon_type=CouponType.FIXED,
                maturity=AS_OF + timedelta(days=20),
                asset_class=AssetClass.T_BILL,
                is_sovereign=True,
                lag=1,
                pledged="1",
            )
        ],
        cash_ladder=[],
        total_nav=Decimal("100"),
        current_date=AS_OF,
    )
    assert result.dla_amount == Decimal("0")
    assert result.wla_amount == Decimal("0")


def test_liquidity_rejects_non_positive_nav() -> None:
    with pytest.raises(ValueError, match="total_nav"):
        calculate_liquidity_ratios([], [], Decimal("0"), current_date=AS_OF)


def test_shadow_boundaries() -> None:
    normal = calculate_shadow_pricing_deviation(Decimal("1.0000"), Decimal("1.00249999"))
    assert normal.status is ShadowDeviationStatus.NORMAL

    warning = calculate_shadow_pricing_deviation(Decimal("1.0000"), Decimal("1.0025"))
    assert warning.status is ShadowDeviationStatus.WARNING
    assert warning.deviation_bps == Decimal("25.00")

    still_warning = calculate_shadow_pricing_deviation(Decimal("1.0000"), Decimal("1.0049"))
    assert still_warning.status is ShadowDeviationStatus.WARNING

    critical = calculate_shadow_pricing_deviation(Decimal("1.0000"), Decimal("1.0050"))
    assert critical.status is ShadowDeviationStatus.CRITICAL

    below = calculate_shadow_pricing_deviation(Decimal("1.0000"), Decimal("0.9975"))
    assert below.status is ShadowDeviationStatus.WARNING


def test_shadow_zero_amortized() -> None:
    assert (
        calculate_shadow_pricing_deviation(Decimal("0"), Decimal("0")).status
        is ShadowDeviationStatus.NORMAL
    )
    assert (
        calculate_shadow_pricing_deviation(Decimal("0"), Decimal("1")).status
        is ShadowDeviationStatus.CRITICAL
    )


def test_fx_hedge_ratio_band() -> None:
    classes = [
        ShareClassSnapshot(
            share_class_id="usd",
            nav=Decimal("1000000"),
            class_type=ShareClassType.BASE,
        ),
        ShareClassSnapshot(
            share_class_id="hkd-h",
            nav=Decimal("1000000"),
            class_type=ShareClassType.HEDGED,
        ),
    ]
    forwards = [
        FxForwardSnapshot(share_class_id="hkd-h", notional=Decimal("400000")),
        FxForwardSnapshot(share_class_id="hkd-h", notional=Decimal("600000")),
        FxForwardSnapshot(
            share_class_id="hkd-h",
            notional=Decimal("999999"),
            status=HedgeStatus.SETTLED,
        ),
    ]
    rows = {row.share_class_id: row for row in calculate_fx_hedge_ratios(classes, forwards)}
    assert rows["usd"].applicable is False
    assert rows["usd"].within_tolerance is True
    assert rows["hkd-h"].hedge_ratio == Decimal("1")
    assert rows["hkd-h"].within_tolerance is True


@pytest.mark.parametrize(
    ("notional", "expected"),
    [
        (Decimal("980000"), True),
        (Decimal("1020000"), True),
        (Decimal("979999.99"), False),
        (Decimal("1020000.01"), False),
    ],
)
def test_fx_hedge_tolerance_edges(notional: Decimal, expected: bool) -> None:
    rows = calculate_fx_hedge_ratios(
        [
            ShareClassSnapshot(
                share_class_id="cnh-h",
                nav=Decimal("1000000"),
                class_type=ShareClassType.HEDGED,
            )
        ],
        [FxForwardSnapshot(share_class_id="cnh-h", notional=notional)],
    )
    assert rows[0].within_tolerance is expected


def test_fx_hedge_zero_nav_not_tolerant() -> None:
    rows = calculate_fx_hedge_ratios(
        [
            ShareClassSnapshot(
                share_class_id="empty",
                nav=Decimal("0"),
                class_type=ShareClassType.HEDGED,
            )
        ],
        [FxForwardSnapshot(share_class_id="empty", notional=Decimal("1"))],
    )
    assert rows[0].hedge_ratio is None
    assert rows[0].within_tolerance is False
