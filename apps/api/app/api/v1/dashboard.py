from datetime import date
import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.services.workbench import WorkbenchSnapshot, build_workbench

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/workbench", response_model=WorkbenchSnapshot)
async def workbench(as_of: date | None = Query(default=None)) -> WorkbenchSnapshot:
    return build_workbench(as_of)


@router.websocket("/ws")
async def workbench_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(build_workbench().model_dump(mode="json"))
            await asyncio.sleep(15)
    except WebSocketDisconnect:
        return
