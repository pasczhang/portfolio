from datetime import date

from fastapi import APIRouter, Query

from app.services.holdings_service import HoldingsResponse, build_holdings

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/holdings", response_model=HoldingsResponse)
async def list_holdings(as_of: date | None = Query(default=None)) -> HoldingsResponse:
    return build_holdings(as_of)
