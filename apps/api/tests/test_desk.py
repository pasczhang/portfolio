from app.services.desk_analytics import (
    build_compliance,
    build_nav_monitor,
    build_runoff,
    build_tenor_distribution,
    build_yield_curve_shock,
)
from app.services.book_store import TradeCreate, add_trade, live_trades, reset_book


def test_compliance_dashboard_has_cards_and_alerts() -> None:
    reset_book()
    dash = build_compliance()
    codes = {c.code for c in dash.cards}
    assert {"WAM", "WAL", "MAX_RESIDUAL", "DLA", "WLA"} <= codes
    assert dash.concentration
    assert dash.alerts
    assert dash.aum > 0


def test_tenor_buckets_complete() -> None:
    dist = build_tenor_distribution()
    assert [b.bucket for b in dist.buckets] == ["0-7D", "8-30D", "31-60D", "61-90D", "90D+"]
    assert dist.total > 0


def test_yield_and_runoff() -> None:
    shock = build_yield_curve_shock(50)
    assert shock.selected.shift_bps == 50
    assert len(shock.curve) == 7
    pack = build_runoff()
    assert [s.redemption_pct for s in pack.scenarios] == [10, 20, 30]


def test_nav_monitor_30d() -> None:
    mon = build_nav_monitor()
    assert len(mon.series) == 30
    assert mon.official_nav == 1
    assert mon.attribution


def test_blotter_add_trade_refreshes_holdings() -> None:
    reset_book()
    n0 = len(live_trades())
    trade = add_trade(
        TradeCreate(
            trade_type="DEPOSIT",
            counterparty="Hang Seng",
            amount=1_000_000,
            rate="0.042",
            tenor_days=5,
            trader="QA",
        )
    )
    assert trade.trade_type == "DEPOSIT"
    assert len(live_trades()) == n0 + 1
    reset_book()
