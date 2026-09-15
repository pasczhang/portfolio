from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models.enums import AssetClass, CouponType, TradeSide
from app.services.engines.mmf_engine import CashLadderEntry, EnginePosition
from app.services.engines.simulation import PortfolioSnapshot, ProposedTrade, SimulationEngine
from app.services.engines.stress_test import InvestorHolding, StressTestEngine

AS_OF = date(2026, 9, 10)


def _cash(amount: str) -> list[CashLadderEntry]:
    return [CashLadderEntry(amount=Decimal(amount), available_on=AS_OF)]


def _cp(security_id: str, book: str, issuer: str = "BANK-B") -> EnginePosition:
    return EnginePosition(
        security_id=security_id,
        book_value=Decimal(book),
        coupon_type=CouponType.FIXED,
        maturity_date=date(2026, 12, 9),
        asset_class=AssetClass.CP,
        issuer_id=issuer,
        issuer_name=issuer,
        coupon_rate=Decimal("0.04"),
        shadow_mtm=Decimal(book),
    )


def test_redemption_10pct_covered_by_cash() -> None:
    result = StressTestEngine().redemption_shock(
        Decimal("0.10"),
        [_cp("CP1", "80")],
        _cash("20"),
        as_of=AS_OF,
    )
    assert result.outflow == Decimal("10.00")
    assert result.fire_sale_required is False
    assert result.shadow_nav_loss == Decimal("0.00")
    assert result.cash_after == Decimal("10.00")
    assert "FIRE_SALE" not in result.flags
    assert result.chart["liquidity_before_after"]["categories"] == ["DLA %", "WLA %"]


def test_redemption_pct_as_whole_number() -> None:
    result = StressTestEngine().redemption_shock(
        Decimal("10"),
        [_cp("CP1", "80")],
        _cash("20"),
        as_of=AS_OF,
    )
    assert result.scenario_pct == Decimal("0.1000")
    assert result.outflow == Decimal("10.00")


def test_redemption_requires_fire_sale() -> None:
    result = StressTestEngine().redemption_shock(
        Decimal("0.40"),
        [_cp("CP1", "80")],
        _cash("20"),
        as_of=AS_OF,
        fire_sale_haircut=Decimal("0.01"),
    )
    assert result.fire_sale_required is True
    assert result.illiquid_sold == Decimal("20.00")
    assert result.shadow_nav_loss == Decimal("0.20")
    assert "FIRE_SALE" in result.flags


def test_top_n_institutional_redemption() -> None:
    result = StressTestEngine().redemption_shock(
        None,
        [_cp("CP1", "80")],
        _cash("20"),
        as_of=AS_OF,
        top_n_institutional=1,
        investor_holdings=[
            InvestorHolding(investor_id="A", nav_amount=Decimal("25"), is_institutional=True),
            InvestorHolding(investor_id="B", nav_amount=Decimal("15"), is_institutional=True),
            InvestorHolding(investor_id="C", nav_amount=Decimal("10"), is_institutional=False),
        ],
    )
    assert result.scenario_type == "top_1_institutional"
    assert result.outflow == Decimal("25.00")


def test_rate_hike_lowers_fixed_mtm_and_widens_collar() -> None:
    pos = EnginePosition(
        security_id="DEP1",
        book_value=Decimal("100"),
        coupon_type=CouponType.FIXED,
        maturity_date=date(2026, 12, 9),
        asset_class=AssetClass.DEPOSIT,
        issuer_id="BANK-A",
        coupon_rate=Decimal("0.04"),
        shadow_mtm=Decimal("100"),
    )
    result = StressTestEngine().interest_rate_shock(
        [pos],
        bp_shifts=[-50, 100],
        as_of=AS_OF,
        cash=Decimal("0"),
    )
    down, up = result.scenarios
    assert down.shift_bps == -50
    assert up.shift_bps == 100
    assert up.mtm_nav < down.mtm_nav
    assert up.delta_mtm < 0
    assert result.chart["nav_vs_shift"][0].x == -50


def test_pre_trade_bank_deposit_blocks_issuer_cap() -> None:
    snapshot = PortfolioSnapshot(
        as_of=AS_OF,
        positions=[_cp("CP1", "80", "BANK-B")],
        cash=_cash("20"),
    )
    trade = ProposedTrade(
        side=TradeSide.BUY,
        notional=Decimal("15"),
        issuer_id="BANK-A",
        issuer_name="Bank A",
        tenor_days=90,
        asset_class=AssetClass.DEPOSIT,
        coupon_rate=Decimal("0.045"),
    )
    result = SimulationEngine().pre_trade_what_if(snapshot, trade)
    issuer = next(m for m in result.metrics if m.id == "issuer")
    assert issuer.after > issuer.before
    assert result.intercept is True
    assert result.allow is False
    assert result.decision.value == "BLOCK"
    assert any(f.code == "ISSUER_10PCT" for f in result.flags)
    assert "bars" in result.chart


def test_pre_trade_small_deposit_passes() -> None:
    snapshot = PortfolioSnapshot(
        as_of=AS_OF,
        positions=[
            EnginePosition(
                security_id="ON1",
                book_value=Decimal("50"),
                coupon_type=CouponType.FIXED,
                maturity_date=date(2026, 9, 11),
                asset_class=AssetClass.DEPOSIT,
                issuer_id="BANK-B",
                coupon_rate=Decimal("0.03"),
            ),
            EnginePosition(
                security_id="TB1",
                book_value=Decimal("20"),
                coupon_type=CouponType.FIXED,
                maturity_date=date(2026, 9, 24),
                asset_class=AssetClass.T_BILL,
                is_sovereign=True,
                settlement_lag_business_days=1,
                issuer_id="UST",
                coupon_rate=Decimal("0.04"),
            ),
        ],
        cash=_cash("30"),
    )
    trade = ProposedTrade(
        notional=Decimal("5"),
        issuer_id="BANK-A",
        issuer_name="Bank A",
        tenor_days=90,
        asset_class=AssetClass.DEPOSIT,
    )
    result = SimulationEngine().pre_trade_what_if(snapshot, trade)
    assert result.intercept is False, result.flags
    assert result.allow is True
    wam = next(m for m in result.metrics if m.id == "wam")
    assert wam.after >= wam.before
    assert {m.id for m in result.metrics} >= {"aum", "wam", "wal", "issuer", "dla", "wla", "yield"}
    assert result.gate_title


def test_pre_trade_397_day_block() -> None:
    snapshot = PortfolioSnapshot(
        as_of=AS_OF,
        positions=[_cp("CP1", "80")],
        cash=_cash("20"),
    )
    result = SimulationEngine().pre_trade_what_if(
        snapshot,
        ProposedTrade(
            notional=Decimal("1"),
            issuer_id="BANK-A",
            tenor_days=400,
            asset_class=AssetClass.DEPOSIT,
        ),
    )
    assert any(f.code == "MATURITY_397" for f in result.flags)
    assert result.intercept is True
