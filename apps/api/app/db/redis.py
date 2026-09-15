from __future__ import annotations

import redis.asyncio as redis

from app.core.config import settings

redis_client: redis.Redis = redis.from_url(
    str(settings.redis_url),
    encoding="utf-8",
    decode_responses=True,
)

POSITION_CACHE_PREFIX = "pms:positions"


def position_key(fund_id: str) -> str:
    return f"{POSITION_CACHE_PREFIX}:{fund_id}"


async def ping_redis() -> bool:
    return bool(await redis_client.ping())


async def close_redis() -> None:
    await redis_client.aclose()
