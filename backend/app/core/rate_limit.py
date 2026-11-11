"""Fixed-window rate limiting on Redis for the authentication endpoints.

Fails open: if Redis is unreachable, requests are allowed (and a warning is logged)
rather than locking every user out.
"""

import logging

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.services.cache_service import redis_client

logger = logging.getLogger(__name__)

_PREFIX = "ratelimit"


def client_ip(request: Request) -> str:
    # The header is client-controlled unless a trusted reverse proxy overwrites it,
    # so it is only read when TRUST_PROXY_HEADERS is enabled for the deployment.
    forwarded = request.headers.get("x-forwarded-for") if settings.TRUST_PROXY_HEADERS else None
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _too_many(retry_after: int) -> HTTPException:
    minutes = max(1, round(retry_after / 60))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "rate_limited",
            "message": f"Çok fazla deneme yapıldı. Lütfen {minutes} dakika sonra tekrar deneyin.",
        },
        headers={"Retry-After": str(retry_after)},
    )


async def hit(key: str, limit: int, window_seconds: int) -> None:
    """Counts one request; raises 429 once `limit` is exceeded within the window."""
    full_key = f"{_PREFIX}:{key}"
    try:
        count = await redis_client.incr(full_key)
        if count == 1:
            await redis_client.expire(full_key, window_seconds)
        if count > limit:
            ttl = await redis_client.ttl(full_key)
            raise _too_many(ttl if ttl and ttl > 0 else window_seconds)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Rate limiter unavailable (%s): %s", key, e)


async def ensure_below(key: str, limit: int) -> None:
    """Raises 429 if `key` already reached `limit` (counted separately via `record`)."""
    full_key = f"{_PREFIX}:{key}"
    try:
        raw = await redis_client.get(full_key)
        if raw is not None and int(raw) >= limit:
            ttl = await redis_client.ttl(full_key)
            raise _too_many(ttl if ttl and ttl > 0 else 60)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Rate limiter unavailable (%s): %s", key, e)


async def record(key: str, window_seconds: int) -> None:
    """Counts a failure (e.g. a wrong password) for `ensure_below`."""
    full_key = f"{_PREFIX}:{key}"
    try:
        count = await redis_client.incr(full_key)
        if count == 1:
            await redis_client.expire(full_key, window_seconds)
    except Exception as e:
        logger.warning("Rate limiter unavailable (%s): %s", key, e)


async def reset(key: str) -> None:
    try:
        await redis_client.delete(f"{_PREFIX}:{key}")
    except Exception as e:
        logger.warning("Rate limiter unavailable (%s): %s", key, e)
