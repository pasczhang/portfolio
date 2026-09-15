from pydantic import BaseModel

from app.services.engines.simulation import PortfolioSnapshot, PreTradeWhatIfResult, ProposedTrade


class PreTradeRequest(BaseModel):
    snapshot: PortfolioSnapshot
    trade: ProposedTrade
