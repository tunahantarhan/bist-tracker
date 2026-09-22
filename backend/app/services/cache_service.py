import pandas as pd
import redis.asyncio as redis
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

class CacheService:
    CACHE_EXPIRATION = 300 # Datas are cached for 5 minutes (300 seconds)

    @staticmethod
    async def get_cached_dataframe(key: str) -> pd.DataFrame | None:
        cached_data = await redis_client.get(key)
        if cached_data:
            return pd.read_json(cached_data, orient="split")
        return None

    @staticmethod
    async def set_cached_dataframe(key: str, df: pd.DataFrame):
        json_data = df.to_json(orient="split")
        await redis_client.setex(key, CacheService.CACHE_EXPIRATION, json_data)