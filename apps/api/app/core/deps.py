from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.fund_service import FundService


async def get_fund_service(
    session: AsyncSession,
) -> AsyncGenerator[FundService, None]:
    yield FundService(session)


__all__ = ["get_db", "get_fund_service"]
