from datetime import date

from app.services.engines.cash_ladder import (
    build_cash_ladder,
    is_business_day,
    modified_following,
)


def test_modified_following_weekend() -> None:
    sat = date(2026, 9, 26)
    assert not is_business_day(sat, "HK")
    assert modified_following(sat, "HK") == date(2026, 9, 28)


def test_modified_following_month_end() -> None:
    # Saturday 31 Oct 2026 — following would be Nov; modified following stays in October.
    raw = date(2026, 10, 31)
    adj = modified_following(raw, "US")
    assert adj.month == 10
    assert is_business_day(adj, "US")


def test_ladder_demo_shape() -> None:
    snap = build_cash_ladder(date(2026, 9, 15))
    kinds = {e.kind for e in snap.events}
    assert {"MATURITY", "COUPON", "DVP", "SUBSCRIPTION", "REDEMPTION", "FEE"} <= kinds
    ncds = [e for e in snap.events if e.kind == "MATURITY" and e.security_id.startswith("NCD") and e.days <= 3]
    tds = [e for e in snap.events if e.kind == "MATURITY" and e.security_id.startswith("TD") and e.days <= 3]
    assert len(ncds) >= 2
    assert len(tds) >= 1
    assert any(e.kind == "COUPON" for e in snap.events)
    assert any(e.kind == "DVP" and e.days == 2 for e in snap.events)
    assert snap.opening_cash == snap.available_cash
    assert len(snap.sfc_buckets) == 7
    assert len(snap.chart_buckets) == 10
    assert snap.reinvest


def test_coupon_rolls_off_weekend() -> None:
    snap = build_cash_ladder(date(2026, 9, 15))
    rolled = [e for e in snap.events if e.rolled]
    assert rolled
    boc = next(e for e in snap.events if e.event_id == "cpn-NCD-BOC-60")
    assert boc.adjusted_date.weekday() < 5
