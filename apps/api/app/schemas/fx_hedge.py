from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.enums import Currency, HedgeStatus, HedgeType
from app.schemas.common import Money, ORMModel, Rate


class FXHedgeCreate(BaseModel):
    fund_id: str
    share_class_id: str
    security_id: str
    transaction_id: str | None = None
    position_id: str | None = None
    hedge_type: HedgeType
    pair: str = Field(min_length=6, max_length=7, examples=["USDHKD", "USDCNH"])
    base_ccy: Currency
    quote_ccy: Currency
    near_date: date | None = None
    maturity_date: date
    bought_ccy: Currency
    sold_ccy: Currency
    bought_amount: Money
    sold_amount: Money
    forward_rate: Rate
    hedged_base_notional: Money

    @model_validator(mode="after")
    def validate_pair_and_swap(self) -> FXHedgeCreate:
        if self.base_ccy == self.quote_ccy:
            raise ValueError("base_ccy and quote_ccy must differ")
        if self.bought_ccy == self.sold_ccy:
            raise ValueError("bought_ccy and sold_ccy must differ")
        if self.hedge_type is HedgeType.FX_SWAP and self.near_date is None:
            raise ValueError("near_date is required for FX_Swap")
        if self.near_date is not None and self.near_date > self.maturity_date:
            raise ValueError("near_date must be on/before maturity_date")
        expected = f"{self.base_ccy.value}{self.quote_ccy.value}"
        if self.pair.replace("/", "") != expected:
            raise ValueError(f"pair must match {expected}")
        return self


class FXHedgeRead(ORMModel):
    id: str
    fund_id: str
    share_class_id: str
    security_id: str
    transaction_id: str | None
    position_id: str | None
    hedge_type: HedgeType
    pair: str
    base_ccy: Currency
    quote_ccy: Currency
    near_date: date | None
    maturity_date: date
    bought_ccy: Currency
    sold_ccy: Currency
    bought_amount: Money
    sold_amount: Money
    forward_rate: Rate
    hedged_base_notional: Money
    status: HedgeStatus
