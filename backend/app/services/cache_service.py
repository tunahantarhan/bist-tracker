import json
import logging
from io import StringIO
from typing import Any

import pandas as pd
import redis.asyncio as redis

from app.core.config import settings

logger = logging.getLogger(__name__)
redis_client = redis.from_url(settings.redis_url, decode_responses=True)

class CacheService:
    DEFAULT_EXPIRATION = 300   # 5 minutes
    OVERVIEW_EXPIRATION = 60   # 60 seconds for global screener overview
    MARKET_EXPIRATION = 20     # 20 seconds for single stock chart candles

    @staticmethod
    async def get_cached_dataframe(key: str) -> pd.DataFrame | None:
        try:
            cached_data = await redis_client.get(key)
            if cached_data:
                return pd.read_json(StringIO(cached_data), orient="split")
        except Exception as e:
            logger.warning("Redis read error (DataFrame): %s", e)
        return None

    @staticmethod
    async def set_cached_dataframe(key: str, df: pd.DataFrame, expiration: int = DEFAULT_EXPIRATION):
        try:
            json_data = df.to_json(orient="split")
            await redis_client.setex(key, expiration, json_data)
        except Exception as e:
            logger.warning("Redis write error (DataFrame): %s", e)

    @staticmethod
    async def get_json(key: str) -> Any | None:
        """Retrieves and deserializes JSON payload from Redis."""
        try:
            raw = await redis_client.get(key)
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning("Redis read error (JSON): %s", e)
        return None

    @staticmethod
    async def set_json(key: str, data: Any, expiration: int = DEFAULT_EXPIRATION):
        """Serializes and caches data in Redis with TTL."""
        try:
            payload = json.dumps(data)
            await redis_client.setex(key, int(expiration), payload)
        except Exception as e:
            logger.warning("Redis write error (JSON): %s", e)

    @staticmethod
    async def delete_pattern(pattern: str):
        """Removes every key matching a glob pattern (used for cache invalidation)."""
        try:
            keys = [k async for k in redis_client.scan_iter(match=pattern, count=500)]
            if keys:
                await redis_client.delete(*keys)
        except Exception as e:
            logger.warning("Redis pattern delete error: %s", e)

    @staticmethod
    async def delete_key(key: str):
        """Removes a key from Redis."""
        try:
            await redis_client.delete(key)
        except Exception as e:
            logger.warning("Redis delete error: %s", e)