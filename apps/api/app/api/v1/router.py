from fastapi import APIRouter

from app.api.v1.analytics import router as analytics_router
from app.api.v1.compliance import router as compliance_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.funds import router as funds_router
from app.api.v1.instruments import router as instruments_router
from app.api.v1.liquidity import router as liquidity_router
from app.api.v1.nav import router as nav_router
from app.api.v1.portfolio import router as portfolio_router
from app.api.v1.positions import router as positions_router
from app.api.v1.reporting import router as reporting_router
from app.api.v1.simulation import router as simulation_router
from app.api.v1.stress import router as stress_router
from app.api.v1.trades import router as trades_router

api_router = APIRouter()
api_router.include_router(funds_router)
api_router.include_router(instruments_router)
api_router.include_router(positions_router)
api_router.include_router(portfolio_router)
api_router.include_router(trades_router)
api_router.include_router(nav_router)
api_router.include_router(liquidity_router)
api_router.include_router(reporting_router)
api_router.include_router(compliance_router)
api_router.include_router(analytics_router)
api_router.include_router(stress_router)
api_router.include_router(simulation_router)
api_router.include_router(dashboard_router)
