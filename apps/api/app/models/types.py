from __future__ import annotations

from sqlalchemy import Enum as SAEnum
from sqlalchemy.types import Numeric, String

from app.models.enums import (
    AssetClass,
    CouponType,
    Currency,
    DayCount,
    HedgeStatus,
    HedgeType,
    PaymentFrequency,
    PledgeStatus,
    PricingSource,
    ShareClassType,
    TradeSide,
    TransactionStatus,
    TransactionType,
)

Money = Numeric(24, 8)
Rate = Numeric(18, 10)
NavPx = Numeric(24, 10)
CcyCode = String(3)
RatingCode = String(16)


def str_enum(enum_cls: type, *, length: int = 32) -> SAEnum:
    return SAEnum(
        enum_cls,
        native_enum=False,
        length=length,
        validate_strings=True,
        values_callable=lambda members: [item.value for item in members],
    )


asset_class_col = str_enum(AssetClass, length=16)
coupon_type_col = str_enum(CouponType, length=16)
currency_col = str_enum(Currency, length=3)
payment_freq_col = str_enum(PaymentFrequency, length=16)
day_count_col = str_enum(DayCount, length=16)
txn_type_col = str_enum(TransactionType, length=16)
trade_side_col = str_enum(TradeSide, length=8)
txn_status_col = str_enum(TransactionStatus, length=16)
pledge_status_col = str_enum(PledgeStatus, length=16)
pricing_source_col = str_enum(PricingSource, length=16)
share_class_type_col = str_enum(ShareClassType, length=16)
hedge_type_col = str_enum(HedgeType, length=16)
hedge_status_col = str_enum(HedgeStatus, length=16)
