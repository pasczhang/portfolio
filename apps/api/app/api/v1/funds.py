from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.enums import Currency
from app.schemas.fund import FundCreate, FundRead
from app.services.fund_service import FundService

router = APIRouter(prefix="/funds", tags=["funds"])

# Keep in lockstep with apps/web/constants/funds.ts (frontend SSOT for desk chrome).
DEMO_FUNDS: list[FundRead] = [
    FundRead(
        id="bam-usd-mmf",
        code="BAM-USD-MMF",
        name="Balance USD Money Market Fund",
        base_ccy=Currency.USD,
        wam_limit_days=60,
        wal_limit_days=120,
        status="active",
        inception_date=date(2023, 3, 15),
    ),
    FundRead(
        id="bam-hkd-mmf",
        code="BAM-HKD-MMF",
        name="Balance HKD Money Market Fund",
        base_ccy=Currency.HKD,
        wam_limit_days=60,
        wal_limit_days=120,
        status="active",
        inception_date=date(2021, 6, 1),
    ),
]


@router.get("", response_model=list[FundRead])
async def list_funds() -> list[FundRead]:
    """Demo catalog while Postgres is not wired. Swap back to FundService when DB is up."""
    return DEMO_FUNDS


@router.post("", response_model=FundRead, status_code=201)
async def create_fund(
    payload: FundCreate, session: AsyncSession = Depends(get_db)
) -> FundRead:
    fund = await FundService(session).create_fund(payload)
    return FundRead.model_validate(fund)
