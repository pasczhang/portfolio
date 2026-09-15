from fastapi import APIRouter

from app.services.desk_analytics import ComplianceDashboard, build_compliance

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.get("/dashboard", response_model=ComplianceDashboard)
async def compliance_dashboard() -> ComplianceDashboard:
    return build_compliance()


@router.get("/breaches")
async def list_breaches() -> list[dict]:
    dash = build_compliance()
    return [a.model_dump(mode="json") for a in dash.alerts]
