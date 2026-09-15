from datetime import date

from fastapi import APIRouter, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.services.engines.reporting import (
    ReportSnapshot,
    build_report_snapshot,
    save_sign_off,
    snapshot_to_csv,
)

router = APIRouter(prefix="/reporting", tags=["reporting"])


class SignOffIn(BaseModel):
    as_of: date
    officer: str
    notes: str = ""
    signed_at: str


@router.get("/snapshot", response_model=ReportSnapshot)
async def report_snapshot(as_of: date | None = Query(default=None)) -> ReportSnapshot:
    return build_report_snapshot(as_of)


@router.get("/wings.csv")
async def wings_csv(as_of: date | None = Query(default=None)) -> Response:
    snap = build_report_snapshot(as_of)
    body = "\ufeff" + snapshot_to_csv(snap)
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="SFC_8.2_WINGS_{snap.as_of.isoformat()}.csv"'},
    )


@router.post("/sign-off", response_model=ReportSnapshot)
async def report_sign_off(payload: SignOffIn) -> ReportSnapshot:
    save_sign_off(payload.as_of, payload.officer, payload.notes, payload.signed_at)
    return build_report_snapshot(payload.as_of)
