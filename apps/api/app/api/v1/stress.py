from fastapi import APIRouter

from app.schemas.stress import RateShockRequest, RedemptionShockRequest
from app.services.engines.stress_test import InterestRateShockResult, RedemptionShockResult, StressTestEngine

router = APIRouter(prefix="/stress", tags=["stress"])


@router.post("/redemption", response_model=RedemptionShockResult)
async def redemption_shock(payload: RedemptionShockRequest) -> RedemptionShockResult:
    holdings = payload.investor_holdings or None
    return StressTestEngine().redemption_shock(
        payload.scenario_pct,
        payload.positions,
        payload.cash,
        as_of=payload.as_of,
        top_n_institutional=payload.top_n_institutional,
        investor_holdings=holdings,
        fire_sale_haircut=payload.fire_sale_haircut,
    )


@router.post("/rates", response_model=InterestRateShockResult)
async def interest_rate_shock(payload: RateShockRequest) -> InterestRateShockResult:
    return StressTestEngine().interest_rate_shock(
        payload.positions,
        payload.bp_shifts,
        as_of=payload.as_of,
        cash=payload.cash,
    )
