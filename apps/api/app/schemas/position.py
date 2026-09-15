from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import PledgeStatus, PricingSource
from app.schemas.common import Money, ORMModel, Rate
from app.schemas.security import SecurityMasterRead


class PositionCreate(BaseModel):
    fund_id: str
    share_class_id: str | None = None
    security_id: str
    as_of_date: date
    face_amount: Money
    amortized_cost_book_value: Money
    accrued_interest: Money = Field(default=Decimal("0"))
    shadow_fair_value: Money | None = None
    pricing_source: PricingSource | None = None
    bval_score: Rate | None = None
    pledge_status: PledgeStatus = PledgeStatus.UNENCUMBERED
    pledged_face_amount: Money = Field(default=Decimal("0"))
    wam_days: Rate | None = None
    wal_days: Rate | None = None

    @model_validator(mode="after")
    def validate_pledge(self) -> PositionCreate:
        if self.pledged_face_amount > self.face_amount:
            raise ValueError("pledged_face_amount cannot exceed face_amount")
        if self.pledge_status is PledgeStatus.UNENCUMBERED and self.pledged_face_amount != 0:
            raise ValueError("unencumbered positions must have zero pledged face")
        return self


class PositionRead(ORMModel):
    id: str
    fund_id: str
    share_class_id: str | None
    security_id: str
    as_of_date: date
    face_amount: Money
    amortized_cost_book_value: Money
    accrued_interest: Money
    shadow_fair_value: Money | None
    pricing_source: PricingSource | None
    bval_score: Rate | None
    pledge_status: PledgeStatus
    pledged_face_amount: Money
    wam_days: Rate | None
    wal_days: Rate | None
    security: SecurityMasterRead | None = None


class LivePosition(BaseModel):
    security_id: str
    face_amount: Money
    amortized_cost_book_value: Money
    accrued_interest: Money
    shadow_fair_value: Money | None = None
    as_of: date
