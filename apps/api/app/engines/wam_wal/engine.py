from __future__ import annotations

from datetime import date
from decimal import Decimal

import QuantLib as ql
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fund import Fund
from app.models.position import Position
from app.models.security import SecurityMaster
from app.schemas.analytics import WamWalResult


def _ql_date(d: date) -> ql.Date:
    return ql.Date(d.day, d.month, d.year)


def remaining_days(as_of: date, maturity: date) -> int:
    return int(_ql_date(maturity) - _ql_date(as_of))


class WamWalEngine:
    """SFC-style WAM (to next rate reset / residual life) and WAL (to legal final)."""

    async def compute(self, session: AsyncSession, fund_id: str, as_of: date) -> WamWalResult:
        fund = await session.get(Fund, fund_id)
        if fund is None:
            raise ValueError(f"fund not found: {fund_id}")

        stmt = (
            select(Position, SecurityMaster)
            .join(SecurityMaster, SecurityMaster.id == Position.security_id)
            .where(Position.fund_id == fund_id, Position.as_of_date == as_of)
        )
        rows = (await session.execute(stmt)).all()
        total = sum((p.amortized_cost for p, _ in rows), Decimal("0"))
        if total == 0:
            return WamWalResult(
                fund_id=fund_id,
                wam_days=Decimal("0"),
                wal_days=Decimal("0"),
                wam_limit_days=fund.wam_limit_days,
                wal_limit_days=fund.wal_limit_days,
                within_limit=True,
            )

        wam_num = Decimal("0")
        wal_num = Decimal("0")
        for pos, security in rows:
            wal = remaining_days(as_of, security.maturity_date)
            reset = security.rate_reset_date or security.maturity_date
            wam = remaining_days(as_of, reset)
            wgt = pos.amortized_cost / total
            wam_num += Decimal(wam) * wgt
            wal_num += Decimal(wal) * wgt

        return WamWalResult(
            fund_id=fund_id,
            wam_days=wam_num.quantize(Decimal("0.01")),
            wal_days=wal_num.quantize(Decimal("0.01")),
            wam_limit_days=fund.wam_limit_days,
            wal_limit_days=fund.wal_limit_days,
            within_limit=wam_num <= fund.wam_limit_days and wal_num <= fund.wal_limit_days,
        )
