from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, model_validator

from app.models.enums import Currency, TradeSide, TransactionStatus, TransactionType
from app.schemas.common import Money, ORMModel, Rate


class TransactionCreate(BaseModel):
    fund_id: str
    share_class_id: str | None = None
    security_id: str
    txn_type: TransactionType
    side: TradeSide
    trade_date: date
    value_date: date
    settle_date: date
    face_amount: Money
    price: Rate
    yield_rate: Rate | None = None
    notional: Money
    currency: Currency
    counterparty: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_settlement(self) -> TransactionCreate:
        if self.settle_date < self.trade_date:
            raise ValueError("settle_date must be on/after trade_date")
        if self.face_amount <= 0 or self.notional <= 0:
            raise ValueError("face_amount and notional must be positive")
        return self


class TransactionRead(ORMModel):
    id: str
    fund_id: str
    share_class_id: str | None
    security_id: str
    txn_type: TransactionType
    side: TradeSide
    trade_date: date
    value_date: date
    settle_date: date
    face_amount: Money
    price: Rate
    yield_rate: Rate | None
    notional: Money
    currency: Currency
    counterparty: str | None
    status: TransactionStatus
    booked_at: datetime | None
