"""Single choke point for every Yahoo Finance HTTP call made by this process.

Yahoo has no official quota and answers bursts with HTTP 429, so all calls share:
  * a token bucket (steady request rate with a small burst allowance),
  * a concurrency cap,
  * a circuit breaker: after a 429 every caller backs off (exponentially, with jitter)
    instead of hammering the API; callers serve stale cache while the breaker is open,
  * counters exposed to the admin "system health" card.
"""

import asyncio
import contextvars
import logging
import random
import time
from collections import deque
from typing import Any, Callable, TypeVar

from yfinance.exceptions import YFRateLimitError

from app.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

BREAKER_BASE_SECONDS = 30.0
BREAKER_MAX_SECONDS = 600.0


# Set to True inside scanner tasks. Background calls share a few dedicated slots, so an
# interactive request (a user opening a chart) never queues behind hundreds of scan calls.
background_lane: contextvars.ContextVar[bool] = contextvars.ContextVar("yahoo_background_lane", default=False)


class RateLimitedError(RuntimeError):
    """Raised instead of calling Yahoo while the circuit breaker is open."""


class AsyncTokenBucket:
    def __init__(self, rate: float, capacity: int):
        self.rate = rate
        self.capacity = capacity
        self._tokens = float(capacity)
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    def _refill(self) -> None:
        now = time.monotonic()
        self._tokens = min(self.capacity, self._tokens + (now - self._updated) * self.rate)
        self._updated = now

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                self._refill()
                if self._tokens >= 1:
                    self._tokens -= 1
                    return
                await asyncio.sleep((1 - self._tokens) / self.rate)


def _is_rate_limit(exc: BaseException) -> bool:
    if isinstance(exc, YFRateLimitError):
        return True
    text = str(exc).lower()
    return "429" in text or "too many requests" in text or "rate limit" in text


class YahooGateway:
    def __init__(self) -> None:
        self.bucket = AsyncTokenBucket(settings.YAHOO_MAX_RPS, settings.YAHOO_BURST)
        self.semaphore = asyncio.Semaphore(settings.YAHOO_CONCURRENCY)
        self.background_slots = asyncio.Semaphore(max(1, settings.YAHOO_CONCURRENCY // 2))
        self.breaker_until = 0.0
        self._strikes = 0
        self._calls: deque[float] = deque()  # timestamps of the last hour, for the health card
        self.total_calls = 0
        self.rate_limited = 0
        self.failures = 0
        self.last_rate_limit_at: float | None = None

    @property
    def breaker_open(self) -> bool:
        return time.time() < self.breaker_until

    def _trip(self) -> None:
        self._strikes += 1
        backoff = min(BREAKER_MAX_SECONDS, BREAKER_BASE_SECONDS * 2 ** (self._strikes - 1))
        backoff *= random.uniform(0.8, 1.2)  # jitter: avoid synchronised retries
        self.breaker_until = time.time() + backoff
        self.rate_limited += 1
        self.last_rate_limit_at = time.time()
        logger.warning("Yahoo rate limit hit; pausing requests for %.0fs (strike %d)", backoff, self._strikes)

    async def call(self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """Runs a blocking yfinance call in a worker thread under the shared budget."""
        if background_lane.get():
            async with self.background_slots:
                return await self._call(fn, *args, **kwargs)
        return await self._call(fn, *args, **kwargs)

    async def _call(self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        if self.breaker_open:
            raise RateLimitedError("Yahoo circuit breaker open")
        await self.bucket.acquire()
        async with self.semaphore:
            if self.breaker_open:  # tripped while we were queued
                raise RateLimitedError("Yahoo circuit breaker open")
            now = time.time()
            self._calls.append(now)
            while self._calls and self._calls[0] < now - 3600:
                self._calls.popleft()
            self.total_calls += 1
            try:
                result = await asyncio.to_thread(fn, *args, **kwargs)
            except Exception as exc:
                if _is_rate_limit(exc):
                    self._trip()
                    raise RateLimitedError(str(exc)) from exc
                self.failures += 1
                raise
            self._strikes = 0
            return result

    def stats(self) -> dict[str, Any]:
        cutoff = time.time() - 3600
        return {
            "calls_last_hour": sum(1 for t in self._calls if t >= cutoff),
            "total_calls": self.total_calls,
            "rate_limited": self.rate_limited,
            "failures": self.failures,
            "breaker_open": self.breaker_open,
            "breaker_seconds_left": max(0, round(self.breaker_until - time.time())),
            "last_rate_limit_at": self.last_rate_limit_at,
            "max_rps": settings.YAHOO_MAX_RPS,
        }


gateway = YahooGateway()
