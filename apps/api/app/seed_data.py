"""Canonical demo book for HK public MMF (TD / NCD / T-Bill).

Used by `/portfolio/holdings`, workbench snapshot, and local seed scripts.
Dates are relative to the as-of valuation date.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.models.enums import AssetClass, CouponType
from app.services.engines.mmf_engine import CashLadderEntry, EnginePosition

ProductType = Literal["TD", "NCD", "T-Bill", "REPO"]


class SeedHolding(BaseModel):
    security_id: str
    instrument: str
    product_type: ProductType
    counterparty: str
    value_date_offset: int
    maturity_offset: int
    coupon_rate: Decimal
    coupon_type: CouponType = CouponType.FIXED
    reset_offset: int | None = None
    face_amount: Decimal
    amortized_cost: Decimal
    shadow_mtm: Decimal
    is_sovereign: bool = False
    settlement_lag_business_days: int = 0


SEED_HOLDINGS: list[SeedHolding] = [
    SeedHolding(
        security_id="TD-HSBC-ON",
        instrument="HSBC Overnight Time Deposit",
        product_type="TD",
        counterparty="HSBC",
        value_date_offset=0,
        maturity_offset=1,
        coupon_rate=Decimal("0.041"),
        face_amount=Decimal("12000000"),
        amortized_cost=Decimal("12000000"),
        shadow_mtm=Decimal("12001200"),
    ),
    SeedHolding(
        security_id="TD-SCB-7D",
        instrument="Standard Chartered 7D Time Deposit",
        product_type="TD",
        counterparty="Standard Chartered",
        value_date_offset=-2,
        maturity_offset=7,
        coupon_rate=Decimal("0.0435"),
        face_amount=Decimal("8000000"),
        amortized_cost=Decimal("8001200"),
        shadow_mtm=Decimal("8000800"),
    ),
    SeedHolding(
        security_id="NCD-BOC-60",
        instrument="Bank of China NCD FRN",
        product_type="NCD",
        counterparty="Bank of China",
        value_date_offset=-15,
        maturity_offset=60,
        coupon_rate=Decimal("0.044"),
        coupon_type=CouponType.FLOATING,
        reset_offset=7,
        face_amount=Decimal("15000000"),
        amortized_cost=Decimal("15000000"),
        shadow_mtm=Decimal("15005000"),
    ),
    SeedHolding(
        security_id="NCD-ICBC-45",
        instrument="ICBC Negotiable CD",
        product_type="NCD",
        counterparty="ICBC",
        value_date_offset=-10,
        maturity_offset=45,
        coupon_rate=Decimal("0.046"),
        face_amount=Decimal("10000000"),
        amortized_cost=Decimal("9975000"),
        shadow_mtm=Decimal("9962000"),
    ),
    SeedHolding(
        security_id="TB-UST-4W",
        instrument="US Treasury Bill 4W",
        product_type="T-Bill",
        counterparty="US Treasury",
        value_date_offset=-7,
        maturity_offset=21,
        coupon_rate=Decimal("0.048"),
        face_amount=Decimal("28000000"),
        amortized_cost=Decimal("27940000"),
        shadow_mtm=Decimal("27986000"),
        is_sovereign=True,
        settlement_lag_business_days=1,
    ),
    SeedHolding(
        security_id="TB-HKMA-2W",
        instrument="HKMA Exchange Fund Bill 14D",
        product_type="T-Bill",
        counterparty="HKMA",
        value_date_offset=-3,
        maturity_offset=14,
        coupon_rate=Decimal("0.039"),
        face_amount=Decimal("7000000"),
        amortized_cost=Decimal("6988000"),
        shadow_mtm=Decimal("6991000"),
        is_sovereign=True,
        settlement_lag_business_days=1,
    ),
]

SEED_CASH_ONSHORE = Decimal("18000000")
SEED_CASH_OVERNIGHT = Decimal("7000000")

_PRODUCT_TO_ASSET: dict[ProductType, AssetClass] = {
    "TD": AssetClass.DEPOSIT,
    "NCD": AssetClass.CD,
    "T-Bill": AssetClass.T_BILL,
    "REPO": AssetClass.REPO,
}


def seed_cash(as_of: date) -> list[CashLadderEntry]:
    return [
        CashLadderEntry(amount=SEED_CASH_ONSHORE, available_on=as_of, is_overnight_deposit=False),
        CashLadderEntry(
            amount=SEED_CASH_OVERNIGHT,
            available_on=as_of + timedelta(days=1),
            is_overnight_deposit=True,
        ),
    ]


def holdings_to_engine(items: list[SeedHolding], as_of: date) -> list[EnginePosition]:
    rows: list[EnginePosition] = []
    for item in items:
        reset = as_of + timedelta(days=item.reset_offset) if item.reset_offset is not None else None
        rows.append(
            EnginePosition(
                security_id=item.security_id,
                book_value=item.amortized_cost,
                coupon_type=item.coupon_type,
                maturity_date=as_of + timedelta(days=item.maturity_offset),
                rate_reset_date=reset,
                asset_class=_PRODUCT_TO_ASSET[item.product_type],
                is_sovereign=item.is_sovereign,
                settlement_lag_business_days=item.settlement_lag_business_days,
                issuer_id=item.counterparty.upper().replace(" ", "-"),
                issuer_name=item.counterparty,
                coupon_rate=item.coupon_rate,
                shadow_mtm=item.shadow_mtm,
            )
        )
    return rows


def seed_engine_positions(as_of: date) -> list[EnginePosition]:
    return holdings_to_engine(SEED_HOLDINGS, as_of)


def seed_book(as_of: date) -> tuple[list[EnginePosition], list[CashLadderEntry]]:
    return seed_engine_positions(as_of), seed_cash(as_of)
