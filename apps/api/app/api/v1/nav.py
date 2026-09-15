from fastapi import APIRouter, Query

from app.services.desk_analytics import NavMonitor, build_nav_monitor
from app.services.engines.dual_nav import DualNavSnapshot, calculate_shadow_nav

router = APIRouter(prefix="/nav", tags=["nav"])


@router.get("/dual", response_model=DualNavSnapshot)
async def dual_nav(
    curve_shift_bps: int = Query(0),
    spread_widen_bps: int = Query(0),
) -> DualNavSnapshot:
    return calculate_shadow_nav(curve_shift_bps=curve_shift_bps, spread_widen_bps=spread_widen_bps)


@router.get("/monitor", response_model=NavMonitor)
async def nav_monitor() -> NavMonitor:
    return build_nav_monitor()


@router.get("")
async def list_nav() -> list[dict]:
    mon = build_nav_monitor()
    return [p.model_dump(mode="json") for p in mon.series]
