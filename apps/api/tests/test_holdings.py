from datetime import date

from app.services.holdings_service import build_holdings
from app.seed_data import SEED_HOLDINGS


def test_seed_holdings_cover_td_ncd_tbill() -> None:
    types = {item.product_type for item in SEED_HOLDINGS}
    assert types == {"TD", "NCD", "T-Bill"}


def test_build_holdings_rows() -> None:
    payload = build_holdings(date(2026, 9, 10))
    assert payload.row_count == len(SEED_HOLDINGS)
    assert payload.holdings
    hsbc = next(row for row in payload.holdings if row.security_id == "TD-HSBC-ON")
    assert hsbc.product_type == "TD"
    assert hsbc.counterparty == "HSBC"
    assert hsbc.tenor == "1D"
    assert hsbc.wam_contribution > 0 or hsbc.tenor_days == 1
    boc = next(row for row in payload.holdings if row.security_id == "NCD-BOC-60")
    assert boc.wam_days == 7
    assert boc.wal_days == 60
