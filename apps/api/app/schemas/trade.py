from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class TradeCreate(BaseModel):
    """Deprecated alias — use TransactionCreate."""

    fund_id: str
    security_id: str
    trade_type: str
    side: str
    trade_date: date
    settle_date: date
    quantity: Decimal
    price: Decimal
    notional: Decimal
    ccy: str = "HKD"
