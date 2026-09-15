from __future__ import annotations

import json
from decimal import Decimal

from app.db.redis import POSITION_CACHE_PREFIX, position_key, redis_client
from app.core.config import settings


class PositionCacheService:
    """Hot path: live positions by fund for blotter / risk widgets."""

    async def get(self, fund_id: str) -> dict | None:
        raw = await redis_client.get(position_key(fund_id))
        return json.loads(raw) if raw else None

    async def set(self, fund_id: str, payload: dict) -> None:
        await redis_client.set(
            position_key(fund_id),
            json.dumps(payload, default=_json_default),
            ex=settings.redis_position_ttl_seconds,
        )

    async def invalidate(self, fund_id: str) -> None:
        await redis_client.delete(position_key(fund_id))

    async def keys(self) -> list[str]:
        return [k async for k in redis_client.scan_iter(f"{POSITION_CACHE_PREFIX}:*")]


def _json_default(value: object) -> str:
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"not json serializable: {type(value)}")
