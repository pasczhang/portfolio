from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from app.services.engines.mmf_engine import CashLadderEntry, EnginePosition
from app.services.engines.stress_test import (
    InterestRateShockResult,
    InvestorHolding,
    RedemptionShockResult,
    StressTestEngine,
)

router_prefix = "/stress"


class RedemptionShockRequest(BaseModel):
    as_of: date
    positions: list[EnginePosition]
    cash: list[CashLadderEntry] | Decimal = Decimal("0")
    scenario_pct: Decimal | None = Field(default=None, description="0.10 or 10 for 10%")
    top_n_institutional: int | None = None
    investor_holdings: list[InvestorHolding] = Field(default_factory=list)
    fire_sale_haircut: Decimal = Decimal("0.005")


class RateShockRequest(BaseModel):
    as_of: date
    positions: list[EnginePosition]
    cash: list[CashLadderEntry] | Decimal = Decimal("0")
    bp_shifts: list[int] = Field(default_factory=lambda: [-50, -25, 25, 50, 100])
