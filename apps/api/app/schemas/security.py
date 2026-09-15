from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import AssetClass, CouponType, Currency, DayCount, PaymentFrequency
from app.schemas.common import ORMModel, Rate


class IssuerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    lei: str | None = Field(default=None, min_length=20, max_length=20)
    country: str | None = Field(default=None, min_length=2, max_length=2)
    sector: str | None = None
    parent_issuer_id: str | None = None


class IssuerRead(ORMModel):
    id: str
    name: str
    lei: str | None
    country: str | None
    sector: str | None
    parent_issuer_id: str | None


class SecurityMasterCreate(BaseModel):
    security_code: str = Field(min_length=1, max_length=32)
    isin: str | None = Field(default=None, min_length=12, max_length=12)
    name: str = Field(min_length=1, max_length=256)
    asset_class: AssetClass
    issuer_id: str
    coupon_type: CouponType
    value_date: date
    maturity_date: date
    rate_reset_date: date | None = None
    coupon_rate: Rate | None = None
    payment_frequency: PaymentFrequency = PaymentFrequency.AT_MATURITY
    currency: Currency
    day_count: DayCount = DayCount.ACT_365
    rating_sp_short: str | None = Field(default=None, max_length=16)
    rating_sp_long: str | None = Field(default=None, max_length=16)
    rating_moodys_short: str | None = Field(default=None, max_length=16)
    rating_moodys_long: str | None = Field(default=None, max_length=16)
    rating_fitch_short: str | None = Field(default=None, max_length=16)
    rating_fitch_long: str | None = Field(default=None, max_length=16)
    notes: str | None = None

    @field_validator("isin")
    @classmethod
    def isin_upper(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @model_validator(mode="after")
    def validate_tenor_and_reset(self) -> SecurityMasterCreate:
        if self.maturity_date < self.value_date:
            raise ValueError("maturity_date must be on/after value_date")
        if self.coupon_type is CouponType.FLOATING and self.rate_reset_date is None:
            raise ValueError("rate_reset_date is required when coupon_type is Floating")
        if self.asset_class in {AssetClass.CP, AssetClass.T_BILL} and self.coupon_rate is None:
            pass
        return self


class SecurityMasterUpdate(BaseModel):
    name: str | None = None
    rate_reset_date: date | None = None
    coupon_rate: Rate | None = None
    rating_sp_short: str | None = None
    rating_sp_long: str | None = None
    rating_moodys_short: str | None = None
    rating_moodys_long: str | None = None
    rating_fitch_short: str | None = None
    rating_fitch_long: str | None = None
    notes: str | None = None


class SecurityMasterRead(ORMModel):
    id: str
    security_code: str
    isin: str | None
    name: str
    asset_class: AssetClass
    issuer_id: str
    coupon_type: CouponType
    value_date: date
    maturity_date: date
    rate_reset_date: date | None
    coupon_rate: Rate | None
    payment_frequency: PaymentFrequency
    currency: Currency
    day_count: DayCount
    rating_sp_short: str | None
    rating_sp_long: str | None
    rating_moodys_short: str | None
    rating_moodys_long: str | None
    rating_fitch_short: str | None
    rating_fitch_long: str | None
    issuer: IssuerRead | None = None
