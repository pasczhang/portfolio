from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class WamWalResult(BaseModel):
    fund_id: str
    wam_days: Decimal
    wal_days: Decimal
    wam_limit_days: int
    wal_limit_days: int
    within_limit: bool


class LiquidityLadderBucket(BaseModel):
    bucket: str
    amount: Decimal
    weight: Decimal = Field(ge=0)


class LiquidityLadderResult(BaseModel):
    fund_id: str
    aum: Decimal
    daily_liquid_pct: Decimal
    weekly_liquid_pct: Decimal
    buckets: list[LiquidityLadderBucket]
