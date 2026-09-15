from fastapi import APIRouter, HTTPException

from app.services.position_cache import PositionCacheService

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("/live/{fund_id}")
async def live_positions(fund_id: str) -> dict:
    cached = await PositionCacheService().get(fund_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="live positions not in cache")
    return cached
