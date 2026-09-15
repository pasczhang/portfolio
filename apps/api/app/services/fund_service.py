from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fund import Fund
from app.schemas.fund import FundCreate


class FundService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_funds(self) -> list[Fund]:
        result = await self.session.execute(select(Fund).order_by(Fund.code))
        return list(result.scalars().all())

    async def create_fund(self, payload: FundCreate) -> Fund:
        fund = Fund(**payload.model_dump())
        self.session.add(fund)
        await self.session.flush()
        return fund
