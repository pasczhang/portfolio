from fastapi import APIRouter

from app.services.book_store import TradeCreate, add_trade, live_trades

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("")
async def list_trades() -> list[dict]:
    return [t.model_dump(mode="json") for t in live_trades()]


@router.post("", status_code=201)
async def create_trade(payload: TradeCreate) -> dict:
    return add_trade(payload).model_dump(mode="json")
