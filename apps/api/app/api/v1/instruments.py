from datetime import date

from fastapi import APIRouter, Query

from app.services.security_master_demo import SecurityMasterLite, list_security_master

router = APIRouter(prefix="/instruments", tags=["instruments"])


@router.get("", response_model=list[SecurityMasterLite])
async def list_instruments(
    q: str | None = Query(default=None, description="Search code / ISIN / name / issuer"),
    as_of: date | None = Query(default=None),
) -> list[SecurityMasterLite]:
    return list_security_master(as_of=as_of or date(2026, 9, 15), query=q)


@router.get("/search", response_model=list[SecurityMasterLite])
async def search_instruments(q: str = "", as_of: date | None = None) -> list[SecurityMasterLite]:
    return list_security_master(as_of=as_of or date(2026, 9, 15), query=q)
