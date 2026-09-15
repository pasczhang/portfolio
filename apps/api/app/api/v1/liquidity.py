from fastapi import APIRouter

from app.services.engines.cash_ladder import CashLadderSnapshot, build_cash_ladder

router = APIRouter(prefix="/liquidity", tags=["liquidity"])


@router.get("/ladder", response_model=CashLadderSnapshot)
async def cash_ladder() -> CashLadderSnapshot:
    return build_cash_ladder()
