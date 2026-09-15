from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.enums import Currency, ShareClassType
from app.schemas.common import Money, NavPx, ORMModel


class ShareClassCreate(BaseModel):
    fund_id: str
    code: str = Field(max_length=32)
    name: str = Field(max_length=128)
    ccy: Currency
    class_type: ShareClassType = ShareClassType.BASE
    hedge_target_ccy: Currency | None = None
    hedge_ratio: NavPx = Field(default=1)
    nav_precision: int = 4
    min_initial_subscription: Money | None = None

    @model_validator(mode="after")
    def validate_hedge(self) -> ShareClassCreate:
        if self.class_type is ShareClassType.HEDGED and self.hedge_target_ccy is None:
            raise ValueError("hedge_target_ccy is required for Hedged share classes")
        if self.class_type is ShareClassType.BASE and self.hedge_target_ccy is not None:
            raise ValueError("Base share class must not set hedge_target_ccy")
        return self


class ShareClassRead(ORMModel):
    id: str
    fund_id: str
    code: str
    name: str
    ccy: Currency
    class_type: ShareClassType
    hedge_target_ccy: Currency | None
    hedge_ratio: NavPx
    nav_precision: int
    class_nav: NavPx | None
    class_nav_date: date | None
    class_aum: Money | None
    units_outstanding: Money | None
