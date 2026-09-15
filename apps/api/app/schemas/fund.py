from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.models.enums import Currency
from app.schemas.common import Money, NavPx, ORMModel


class FundCreate(BaseModel):
    code: str = Field(max_length=32)
    name: str
    base_ccy: Currency = Currency.USD
    wam_limit_days: int = 60
    wal_limit_days: int = 120
    max_final_maturity_days: int = 397
    sfc_authorization_no: str | None = None
    trustee: str | None = None
    manager: str | None = None
    inception_date: date | None = None


class FundRead(ORMModel):
    id: str
    code: str
    name: str
    base_ccy: Currency
    wam_limit_days: int
    wal_limit_days: int
    status: str
    inception_date: date | None = None


class NavRead(ORMModel):
    id: str
    fund_id: str
    share_class_id: str
    nav_date: date
    official_nav: NavPx
    shadow_nav: NavPx | None = None
    collar_bps: NavPx | None = None
    aum: Money
    units_outstanding: Money
    status: str
