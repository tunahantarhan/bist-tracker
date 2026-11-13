"""Batch quote snapshot: the single source of truth for "current price" in the app.

One Yahoo `v7/finance/quote` call returns the live (15 min delayed for BIST) price,
the official previous close, today's OHLCV and fundamentals for up to ~150 symbols.
The ticker band, macro cards, overview, detail page and chart's last candle all read
the same snapshot, so they can no longer disagree with each other.

Candle history is still needed for indicators; see `yfinance_provider.py`.
"""

import asyncio
import logging
import time
from dataclasses import asdict, dataclass
from typing import Any, Iterable

from yfinance.data import YfData

from app.core.config import settings
from app.providers.yahoo_gateway import RateLimitedError, gateway

logger = logging.getLogger(__name__)

QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
CHUNK_SIZE = 150  # keeps the URL well under common length limits


@dataclass(frozen=True)
class Quote:
    symbol: str  # Yahoo symbol, e.g. THYAO.IS / USDTRY=X
    price: float
    prev_close: float | None
    open: float | None
    high: float | None
    low: float | None
    volume: float | None
    time: int  # unix seconds of the last trade the price reflects
    market_state: str | None  # Yahoo: PRE / REGULAR / POST / CLOSED
    delay_minutes: int
    market_cap: float | None = None
    year_high: float | None = None
    year_low: float | None = None
    pe_ratio: float | None = None
    pb_ratio: float | None = None
    shares_outstanding: float | None = None
    avg_volume_3m: float | None = None
    fetched_at: float = 0.0

    @property
    def change_pct(self) -> float:
        if not self.prev_close or self.prev_close <= 0:
            return 0.0
        return round((self.price - self.prev_close) / self.prev_close * 100, 2)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def to_yahoo_symbol(symbol: str) -> str:
    symbol = symbol.upper().strip()
    if symbol.endswith((".IS", "=X", "=F")) or symbol.startswith("^"):
        return symbol
    return f"{symbol}.IS"


def _num(value: Any) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN -> None


def _parse(row: dict[str, Any], fetched_at: float) -> Quote | None:
    price = _num(row.get("regularMarketPrice"))
    ts = row.get("regularMarketTime")
    if price is None or price <= 0 or not ts:
        return None
    return Quote(
        symbol=row["symbol"],
        price=price,
        prev_close=_num(row.get("regularMarketPreviousClose")),
        open=_num(row.get("regularMarketOpen")),
        high=_num(row.get("regularMarketDayHigh")),
        low=_num(row.get("regularMarketDayLow")),
        volume=_num(row.get("regularMarketVolume")),
        time=int(ts),
        market_state=row.get("marketState"),
        delay_minutes=int(row.get("exchangeDataDelayedBy") or 0),
        market_cap=_num(row.get("marketCap")),
        year_high=_num(row.get("fiftyTwoWeekHigh")),
        year_low=_num(row.get("fiftyTwoWeekLow")),
        pe_ratio=_num(row.get("trailingPE")),
        pb_ratio=_num(row.get("priceToBook")),
        shares_outstanding=_num(row.get("sharesOutstanding")),
        avg_volume_3m=_num(row.get("averageDailyVolume3Month")),
        fetched_at=fetched_at,
    )


class QuoteBook:
    def __init__(self) -> None:
        self._quotes: dict[str, Quote] = {}
        self._lock = asyncio.Lock()
        self._yf = YfData()

    def _fetch_chunk_sync(self, symbols: list[str]) -> list[dict[str, Any]]:
        data = self._yf.get_raw_json(QUOTE_URL, params={"symbols": ",".join(symbols), "formatted": "false"})
        return (data.get("quoteResponse") or {}).get("result") or []

    def peek(self, symbol: str) -> Quote | None:
        """Last known quote without any network call (may be stale or missing)."""
        return self._quotes.get(to_yahoo_symbol(symbol))

    async def get_quotes(self, symbols: Iterable[str], max_age: float | None = None) -> dict[str, Quote]:
        """Quotes keyed by the caller's symbol. Missing/failed symbols are simply absent.

        Only symbols older than `max_age` are refetched, in chunks; concurrent callers
        share one refresh. When Yahoo throttles us, stale quotes are returned.
        """
        max_age = settings.QUOTE_TTL_SECONDS if max_age is None else max_age
        wanted = {s: to_yahoo_symbol(s) for s in symbols}

        def _stale(now: float) -> list[str]:
            return sorted({
                y for y in wanted.values()
                if (q := self._quotes.get(y)) is None or now - q.fetched_at >= max_age
            })

        if _stale(time.time()):
            async with self._lock:
                stale = _stale(time.time())  # another caller may have refreshed meanwhile
                chunks = [stale[i:i + CHUNK_SIZE] for i in range(0, len(stale), CHUNK_SIZE)]
                for chunk in chunks:
                    try:
                        rows = await gateway.call(self._fetch_chunk_sync, chunk)
                    except RateLimitedError:
                        break  # serve what we have
                    except Exception as e:
                        logger.warning("Quote batch failed (%d symbols): %s", len(chunk), e)
                        continue
                    fetched_at = time.time()
                    for row in rows:
                        quote = _parse(row, fetched_at)
                        if quote:
                            self._quotes[quote.symbol] = quote

        return {s: q for s, y in wanted.items() if (q := self._quotes.get(y)) is not None}

    def stats(self) -> dict[str, Any]:
        newest = max((q.fetched_at for q in self._quotes.values()), default=None)
        return {"cached_quotes": len(self._quotes), "last_quote_refresh": newest}


quote_book = QuoteBook()
