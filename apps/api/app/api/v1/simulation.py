from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.enums import AssetClass
from app.services.book_store import TradeCreate, add_trade, live_book
from app.services.engines.simulation import (
    PortfolioSnapshot,
    PreTradeWhatIfResult,
    ProposedTrade,
    SimulationEngine,
    _usd_notional,
)
from app.services.holdings_service import HoldingsResponse, build_holdings
from app.schemas.simulation import PreTradeRequest

router = APIRouter(prefix="/simulation", tags=["simulation"])


class CommitRequest(BaseModel):
    trade: ProposedTrade
    trader: str = "PM Desk"


class CommitResponse(BaseModel):
    blotter: dict
    what_if: PreTradeWhatIfResult
    holdings: HoldingsResponse


def _live_snapshot(as_of: date | None = None) -> PortfolioSnapshot:
    as_of = as_of or date.today()
    positions, cash = live_book(as_of)
    return PortfolioSnapshot(as_of=as_of, positions=positions, cash=cash)


def _blotter_type(trade: ProposedTrade) -> tuple[str, str]:
    if trade.asset_class is AssetClass.DEPOSIT:
        return "DEPOSIT", "TD"
    if trade.asset_class is AssetClass.CD:
        return "BUY", "NCD"
    if trade.asset_class is AssetClass.T_BILL:
        return "BUY", "T-Bill"
    if trade.asset_class is AssetClass.REPO:
        return "REPO", "REPO"
    return "BUY", "NCD"


@router.post("/pre-trade", response_model=PreTradeWhatIfResult)
async def pre_trade_what_if(payload: PreTradeRequest) -> PreTradeWhatIfResult:
    snap = _live_snapshot(payload.snapshot.as_of if payload.snapshot else None)
    return SimulationEngine().pre_trade_what_if(snap, payload.trade)


@router.post("/pre-trade/commit", response_model=CommitResponse)
async def commit_pre_trade(payload: CommitRequest) -> CommitResponse:
    snap = _live_snapshot()
    result = SimulationEngine().pre_trade_what_if(snap, payload.trade)
    if result.intercept:
        raise HTTPException(status_code=409, detail={"gate": result.gate_title, "flags": [f.model_dump() for f in result.flags]})
    trade_type, product = _blotter_type(payload.trade)
    blotter = add_trade(
        TradeCreate(
            trade_type=trade_type,
            counterparty=payload.trade.issuer_name or payload.trade.issuer_id,
            amount=_usd_notional(payload.trade),
            rate=payload.trade.coupon_rate or 0,
            tenor_days=min(max(payload.trade.tenor_days, 1), 397),
            trader=payload.trader,
            currency=str(payload.trade.currency),
            product_type=product,
        )
    )
    return CommitResponse(
        blotter=blotter.model_dump(mode="json"),
        what_if=result,
        holdings=build_holdings(),
    )
