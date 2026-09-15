from app.services.security_master_demo import list_security_master
from datetime import date


def test_security_master_contains_required_names() -> None:
    rows = list_security_master(as_of=date(2026, 9, 15))
    codes = {r.security_code for r in rows}
    assert {"HK0000951234", "US912797ND21", "XS2589631470", "CUSTOM_TD"} <= codes
    boc = next(r for r in rows if r.security_code == "HK0000951234")
    assert boc.issuer_name == "Bank of China"
    assert boc.days_to_maturity == 91
    assert float(boc.coupon_rate_pct) == 4.85
    ust = next(r for r in rows if r.security_code == "US912797ND21")
    assert ust.days_to_maturity == 181
    icbc = next(r for r in rows if r.security_code == "XS2589631470")
    assert icbc.days_to_maturity == 30


def test_security_master_search_bochk() -> None:
    rows = list_security_master(as_of=date(2026, 9, 15), query="BOCHK")
    assert len(rows) == 1
    assert rows[0].security_code == "HK0000951234"
