from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.position import Position
from app.models.security import SecurityMaster
from app.schemas.analytics import LiquidityLadderBucket, LiquidityLadderResult


def _bucket(as_of: date, maturity: date) -> str:
    days = (maturity - as_of).days
    if days <= 1:
        return "T0"
    if days <= 5:
        return "T1_5"
    return "GT5"


class LiquidityLadderEngine:
    """Daily / weekly liquid asset buckets for SFC public MMF liquidity tests."""

    async def compute(
        self, session: AsyncSession, fund_id: str, as_of: date
    ) -> LiquidityLadderResult:
        stmt = (
            select(Position, SecurityMaster)
            .join(SecurityMaster, SecurityMaster.id == Position.security_id)
            .where(Position.fund_id == fund_id, Position.as_of_date == as_of)
        )
        rows = (await session.execute(stmt)).all()
        aum = sum((p.amortized_cost for p, _ in rows), Decimal("0"))
        buckets: dict[str, Decimal] = {"T0": Decimal("0"), "T1_5": Decimal("0"), "GT5": Decimal("0")}
        for pos, security in rows:
            key = _bucket(as_of, security.maturity_date)
            buckets[key] = buckets.get(key, Decimal("0")) + pos.amortized_cost

        def pct(amount: Decimal) -> Decimal:
            return (amount / aum * 100).quantize(Decimal("0.01")) if aum else Decimal("0")

        daily = buckets.get("T0", Decimal("0"))
        weekly = daily + buckets.get("T1_5", Decimal("0"))
        return LiquidityLadderResult(
            fund_id=fund_id,
            aum=aum,
            daily_liquid_pct=pct(daily),
            weekly_liquid_pct=pct(weekly),
            buckets=[
                LiquidityLadderBucket(bucket=k, amount=v, weight=pct(v))
                for k, v in buckets.items()
            ],
        )
