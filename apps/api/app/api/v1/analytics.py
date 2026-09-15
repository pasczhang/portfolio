from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.engines.liquidity import LiquidityLadderEngine
from app.engines.wam_wal import WamWalEngine
from app.schemas.analytics import LiquidityLadderResult, WamWalResult
from app.services.desk_analytics import (
    RunoffPack,
    TenorDistribution,
    YieldCurveShock,
    build_runoff,
    build_tenor_distribution,
    build_yield_curve_shock,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/tenor-distribution", response_model=TenorDistribution)
async def tenor_distribution() -> TenorDistribution:
    return build_tenor_distribution()


@router.get("/yield-curve-shock", response_model=YieldCurveShock)
async def yield_curve_shock(shift_bps: int = Query(0)) -> YieldCurveShock:
    allowed = {-100, -50, -25, 0, 25, 50, 100}
    if shift_bps not in allowed:
        shift_bps = min(allowed, key=lambda x: abs(x - shift_bps))
    return build_yield_curve_shock(shift_bps)


@router.get("/runoff", response_model=RunoffPack)
async def runoff() -> RunoffPack:
    return build_runoff()



@router.get("/wam-wal", response_model=WamWalResult)
async def wam_wal(
    fund_id: str,
    as_of: date = Query(...),
    session: AsyncSession = Depends(get_db),
) -> WamWalResult:
    return await WamWalEngine().compute(session, fund_id, as_of)


@router.get("/liquidity-ladder", response_model=LiquidityLadderResult)
async def liquidity_ladder(
    fund_id: str,
    as_of: date = Query(...),
    session: AsyncSession = Depends(get_db),
) -> LiquidityLadderResult:
    return await LiquidityLadderEngine().compute(session, fund_id, as_of)
