from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.enums import AssetClass, CouponType, Currency, ShareClassType
from app.schemas.security import SecurityMasterCreate
from app.schemas.share_class import ShareClassCreate


def test_floating_requires_reset() -> None:
    with pytest.raises(ValidationError):
        SecurityMasterCreate(
            security_code="FRN1",
            name="USD FRN",
            asset_class=AssetClass.CD,
            issuer_id="00000000-0000-0000-0000-000000000001",
            coupon_type=CouponType.FLOATING,
            value_date=date(2026, 1, 15),
            maturity_date=date(2026, 7, 15),
            currency=Currency.USD,
            coupon_rate=Decimal("0.045"),
        )


def test_hedged_class_requires_target_ccy() -> None:
    with pytest.raises(ValidationError):
        ShareClassCreate(
            fund_id="00000000-0000-0000-0000-000000000001",
            code="HKD-H",
            name="HKD Hedged",
            ccy=Currency.HKD,
            class_type=ShareClassType.HEDGED,
        )
