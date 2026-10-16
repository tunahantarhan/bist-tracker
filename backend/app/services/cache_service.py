import json
import os
from typing import Any
import pandas as pd
import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

class CacheService:
    DEFAULT_EXPIRATION = 300   # 5 minutes
    OVERVIEW_EXPIRATION = 60   # 60 seconds for global screener overview
    MARKET_EXPIRATION = 20     # 20 seconds for single stock chart candles

    @staticmethod
    async def get_cached_dataframe(key: str) -> pd.DataFrame | None:
        try:
            cached_data = await redis_client.get(key)
            if cached_data:
                return pd.read_json(cached_data, orient="split")
        except Exception as e:
            print(f"[CACHE WARNING] Redis read error (DataFrame): {e}")
        return None

    @staticmethod
    async def set_cached_dataframe(key: str, df: pd.DataFrame, expiration: int = DEFAULT_EXPIRATION):
        try:
            json_data = df.to_json(orient="split")
            await redis_client.setex(key, expiration, json_data)
        except Exception as e:
            print(f"[CACHE WARNING] Redis write error (DataFrame): {e}")

    @staticmethod
    async def get_json(key: str) -> Any | None:
        """Retrieves and deserializes JSON payload from Redis."""
        try:
            raw = await redis_client.get(key)
            if raw:
                return json.loads(raw)
        except Exception as e:
            print(f"[CACHE WARNING] Redis read error (JSON): {e}")
        return None

    @staticmethod
    async def set_json(key: str, data: Any, expiration: int = DEFAULT_EXPIRATION):
        """Serializes and caches data in Redis with TTL."""
        try:
            payload = json.dumps(data)
            await redis_client.setex(key, expiration, payload)
        except Exception as e:
            print(f"[CACHE WARNING] Redis write error (JSON): {e}")

    @staticmethod
    async def delete_key(key: str):
        """Removes a key from Redis."""
        try:
            await redis_client.delete(key)
        except Exception as e:
            print(f"[CACHE WARNING] Redis delete error: {e}")