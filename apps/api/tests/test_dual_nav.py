from datetime import date
from decimal import Decimal

from app.services.engines.dual_nav import calculate_shadow_nav, dcf_price, interpolate_curve, USD_CURVE


def test_cnav_is_one() -> None:
    snap = calculate_shadow_nav(date(2026, 9, 15))
    assert snap.kpis.accounting_nav == Decimal("1.00000")
    assert snap.kpis.units == snap.kpis.accounting_aum
    types = {p.asset_type for p in snap.positions}
    assert types == {"T-Bill", "NCD", "TD", "CASH"}
    assert snap.kpis.cash == Decimal("8000000.00")
    assert len(snap.positions) == 5


def test_dcf_discounts_positive_rates() -> None:
    pv = dcf_price(Decimal("100"), 365, Decimal("0.05"), Decimal("0.003"))
    assert pv < Decimal("100")
    assert pv > Decimal("90")


def test_curve_interpolation() -> None:
    r = interpolate_curve(90, USD_CURVE)
    assert Decimal("0.048") < r < Decimal("0.054")


def test_stress_can_breach_red_line() -> None:
    base = calculate_shadow_nav(date(2026, 9, 15))
    shock = calculate_shadow_nav(date(2026, 9, 15), curve_shift_bps=100, spread_widen_bps=50)
    assert shock.kpis.shadow_nav < base.kpis.shadow_nav
    assert shock.kpis.status == "BREACH"
    assert shock.vnav_trigger is True
