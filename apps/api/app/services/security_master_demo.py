"""Mock HK public MMF security master for pre-trade lookup."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.models.enums import AssetClass, CouponType, Currency, DayCount


class SecurityMasterLite(BaseModel):
    security_code: str
    isin: str | None
    name: str
    asset_class: str
    engine_asset_class: AssetClass
    issuer_id: str
    issuer_name: str
    currency: Currency
    maturity_date: date | None
    coupon_rate: Decimal | None
    coupon_rate_pct: Decimal | None
    day_count: DayCount
    rating: str
    custom: bool = False
    days_to_maturity: int | None = None
    notes: str | None = None


def _dtm(maturity: date | None, as_of: date) -> int | None:
    if maturity is None:
        return None
    return max((maturity - as_of).days, 1)


def _catalog() -> list[dict]:
    return [
        {
            "security_code": "HK0000951234",
            "isin": "HK0000951234",
            "name": "BOCHK 3M HKD NCD",
            "asset_class": "NCD",
            "engine_asset_class": AssetClass.CD,
            "issuer_id": "BANK-OF-CHINA",
            "issuer_name": "Bank of China",
            "currency": Currency.HKD,
            "maturity_date": date(2026, 12, 15),
            "coupon_rate": Decimal("0.0485"),
            "coupon_rate_pct": Decimal("4.85"),
            "day_count": DayCount.ACT_365,
            "rating": "A-1",
            "custom": False,
            "notes": "BOCHK 3-month HKD negotiable CD",
        },
        {
            "security_code": "US912797ND21",
            "isin": "US912797ND21",
            "name": "US Treasury Bill 6M",
            "asset_class": "T-Bill",
            "engine_asset_class": AssetClass.T_BILL,
            "issuer_id": "US-TREASURY",
            "issuer_name": "US Treasury",
            "currency": Currency.USD,
            "maturity_date": date(2027, 3, 15),
            "coupon_rate": Decimal("0.0512"),
            "coupon_rate_pct": Decimal("5.12"),
            "day_count": DayCount.ACT_360,
            "rating": "A-1+",
            "custom": False,
            "notes": "6-month US T-Bill",
        },
        {
            "security_code": "XS2589631470",
            "isin": "XS2589631470",
            "name": "ICBC Asia 1M USD CD",
            "asset_class": "NCD",
            "engine_asset_class": AssetClass.CD,
            "issuer_id": "ICBC",
            "issuer_name": "ICBC",
            "currency": Currency.USD,
            "maturity_date": date(2026, 10, 15),
            "coupon_rate": Decimal("0.0525"),
            "coupon_rate_pct": Decimal("5.25"),
            "day_count": DayCount.ACT_360,
            "rating": "A-1",
            "custom": False,
            "notes": "ICBC Asia 1-month USD CD",
        },
        {
            "security_code": "HK0000882101",
            "isin": "HK0000882101",
            "name": "HSBC 7D USD Time Deposit",
            "asset_class": "TD",
            "engine_asset_class": AssetClass.DEPOSIT,
            "issuer_id": "HSBC",
            "issuer_name": "HSBC",
            "currency": Currency.USD,
            "maturity_date": date(2026, 9, 22),
            "coupon_rate": Decimal("0.0435"),
            "coupon_rate_pct": Decimal("4.35"),
            "day_count": DayCount.ACT_365,
            "rating": "A-1+",
            "custom": False,
        },
        {
            "security_code": "HK0000773319",
            "isin": "HK0000773319",
            "name": "Standard Chartered ON HKD TD",
            "asset_class": "TD",
            "engine_asset_class": AssetClass.DEPOSIT,
            "issuer_id": "STANDARD-CHARTERED",
            "issuer_name": "Standard Chartered",
            "currency": Currency.HKD,
            "maturity_date": date(2026, 9, 16),
            "coupon_rate": Decimal("0.0410"),
            "coupon_rate_pct": Decimal("4.10"),
            "day_count": DayCount.ACT_365,
            "rating": "A-1",
            "custom": False,
        },
        {
            "security_code": "HK0000664528",
            "isin": "HK0000664528",
            "name": "HKMA Exchange Fund Bill 3M",
            "asset_class": "T-Bill",
            "engine_asset_class": AssetClass.T_BILL,
            "issuer_id": "HKMA",
            "issuer_name": "HKMA",
            "currency": Currency.HKD,
            "maturity_date": date(2026, 12, 9),
            "coupon_rate": Decimal("0.0388"),
            "coupon_rate_pct": Decimal("3.88"),
            "day_count": DayCount.ACT_365,
            "rating": "A-1+",
            "custom": False,
        },
        {
            "security_code": "XS2591048821",
            "isin": "XS2591048821",
            "name": "Citi 14D USD CD",
            "asset_class": "NCD",
            "engine_asset_class": AssetClass.CD,
            "issuer_id": "CITI",
            "issuer_name": "Citi",
            "currency": Currency.USD,
            "maturity_date": date(2026, 9, 29),
            "coupon_rate": Decimal("0.0495"),
            "coupon_rate_pct": Decimal("4.95"),
            "day_count": DayCount.ACT_360,
            "rating": "A-1",
            "custom": False,
        },
        {
            "security_code": "CUSTOM_TD",
            "isin": None,
            "name": "自定义定期存款 (Bespoke Term Deposit)",
            "asset_class": "TD",
            "engine_asset_class": AssetClass.DEPOSIT,
            "issuer_id": "CUSTOM",
            "issuer_name": "HSBC",
            "currency": Currency.USD,
            "maturity_date": None,
            "coupon_rate": Decimal("0.045"),
            "coupon_rate_pct": Decimal("4.50"),
            "day_count": DayCount.ACT_365,
            "rating": "—",
            "custom": True,
            "notes": "Manual bank, tenor and rate",
        },
    ]


def list_security_master(as_of: date | None = None, query: str | None = None) -> list[SecurityMasterLite]:
    as_of = as_of or date(2026, 9, 15)
    q = (query or "").strip().lower()
    rows: list[SecurityMasterLite] = []
    for item in _catalog():
        row = SecurityMasterLite(**item, days_to_maturity=_dtm(item["maturity_date"], as_of))
        blob = " ".join(
            [
                row.security_code,
                row.isin or "",
                row.name,
                row.issuer_name,
                row.asset_class,
                row.rating,
            ]
        ).lower()
        if q and q not in blob:
            continue
        rows.append(row)
    return rows
