"""Candle history from Yahoo Finance, built to scan the whole BIST (~600 symbols).

Request budget is the bottleneck (Yahoo answers bursts with HTTP 429), so:

* **Master frames per (symbol, interval)** live in memory (L1) and Redis (L2, survives
  restarts). Charts and rules slice them; resampled views (4h) are derived, not fetched.
* **Incremental sync:** after the one-time deep bootstrap only the last few days are
  fetched and merged (day-granular replace), never the whole history again.
* **Resampling cascade:** one delta fetch of the finest intraday interval (e.g. 5m) is
  aggregated into every coarser intraday master (15m, 1h). This was verified to be
  bit-identical to Yahoo's own 15m/1h bars, so 1 request refreshes 3 frames.
* **Session-aware freshness:** in session a master is re-synced every few minutes
  (with per-symbol deterministic jitter so refreshes spread across scans); after the
  close it stays valid until the next session, so nights/weekends cost nothing.
* **Price consistency:** prices are split-adjusted but *not* dividend-adjusted
  (`auto_adjust=False`), matching official closes and the unadjusted intraday bars.
  Intraday bars lack the 18:00-18:10 closing auction, so each past session's last bar
  is reconciled with the official daily close, and the live quote (see `quotes.py`) is
  overlaid on the last bar. Chart, scores and displayed price therefore agree.
"""

import asyncio
import logging
import math
import pickle
import time
import zlib
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from redis import asyncio as aioredis

from app.core.config import settings
from app.core.market_hours import CONTINUOUS_CLOSE, TR_TZ, is_bist_open, last_session_close
from app.providers.base import BaseDataProvider
from app.providers.quotes import Quote, quote_book, to_yahoo_symbol
from app.providers.yahoo_gateway import RateLimitedError, gateway

logger = logging.getLogger(__name__)

OHLCV = ["Open", "High", "Low", "Close", "Volume"]
AGG = {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}

DEFAULT_PERIOD_BY_INTERVAL = {"5m": "5d", "15m": "5d", "1h": "6mo", "4h": "6mo", "1d": "1y", "1wk": "2y"}
INTRADAY_MAX_PERIODS = {
    "5m": {"5d", "1mo"},
    "15m": {"5d", "1mo"},
    "1h": {"1mo", "3mo", "6mo", "1y", "2y"},
    "4h": {"1mo", "3mo", "6mo", "1y", "2y"},
}
PERIOD_TO_DAYS = {"5d": 5, "1mo": 31, "3mo": 93, "6mo": 186, "1y": 366, "2y": 732, "5y": 1826}

# Minimum bootstrap depth per Yahoo interval (rule evaluation needs this much history)
MIN_BOOTSTRAP_PERIOD = {"5m": "1mo", "15m": "1mo", "1h": "6mo", "1d": "2y"}

# Intraday intervals we keep masters for, finest first, with their resample rule.
# Yahoo's hourly bars start at :30 (09:30, 10:30, ...), hence the offset.
INTRADAY_MINUTES = {"5m": 5, "15m": 15, "1h": 60}
RESAMPLE_RULE = {"5m": ("5min", None), "15m": ("15min", None), "1h": ("1h", "30min")}

DELTA_PERIOD = "5d"
AFTER_CLOSE_GRACE = 20 * 60  # delayed feed: final bars arrive ~15 min after the close
L2_TTL_SECONDS = 3 * 24 * 3600
L2_PREFIX = "candles_v1:"
MAX_RECONCILE_GAP = 0.10  # ignore daily closes that differ >10% from the last bar (bad data)
# Daily close vs the day's last intraday close normally differ by the closing auction
# (BIST price limit is 10%); a day-to-day step in that ratio beyond 30% is a scale break.
SCALE_BREAK = math.log(1.3)
REBUILD_AFTER_SECONDS = 3 * 24 * 3600  # periodic deep refetch picks up new split adjustments


@dataclass
class Master:
    df: pd.DataFrame  # raw OHLCV as Yahoo returned it (tz Europe/Istanbul)
    days: int  # history depth covered
    synced_at: float  # last successful network sync
    built_at: float = 0.0  # last deep (bootstrap) fetch


@dataclass
class SymbolStore:
    masters: dict[str, Master] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    l2_checked: bool = False


_stores: dict[str, SymbolStore] = {}
_l2 = aioredis.from_url(settings.redis_url)  # binary client (pickled frames)

stats_counters = {"full_fetches": 0, "delta_fetches": 0, "derived": 0, "l2_restores": 0, "scale_fixes": 0}


# ---------------------------------------------------------------------------
# Pure helpers (unit tested)
# ---------------------------------------------------------------------------

def _clean(df: pd.DataFrame | None) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=OHLCV)
    out = df[[c for c in OHLCV if c in df.columns]].dropna(subset=["Close"])
    return out[~out.index.duplicated(keep="last")].sort_index()


# BIST 4h bars as TradingView draws them: 10:00-14:00, 14:00-18:00 and the 18:00 closing
# auction. Yahoo's hourly bars start at :30, so the session is split at 13:30 and 17:30
# (the 17:30 bar carries the reconciled official close). Minutes from midnight -> label.
FOUR_HOUR_SESSION_SPLITS = ((17 * 60 + 30, 18 * 60), (13 * 60 + 30, 14 * 60), (0, 10 * 60))


def four_hour_labels(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """The 4h bar (10:00 / 14:00 / 18:00) each intraday timestamp belongs to."""
    minutes = index.hour * 60 + index.minute
    label = np.full(len(index), FOUR_HOUR_SESSION_SPLITS[-1][1])
    for start, lab in reversed(FOUR_HOUR_SESSION_SPLITS[:-1]):
        label = np.where(minutes >= start, lab, label)
    return index.normalize() + pd.to_timedelta(label, unit="m")


def _resample_4h_session(df: pd.DataFrame) -> pd.DataFrame:
    out = df.groupby(four_hour_labels(df.index)).agg(AGG).dropna(subset=["Close"])
    out.index.name = df.index.name
    return out


def resample(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    """Aggregates finer candles into `interval` bars aligned like Yahoo's own bars
    (4h: aligned to the BIST session like TradingView, see `FOUR_HOUR_SESSION_SPLITS`)."""
    if df.empty:
        return df
    if interval == "4h":
        return _resample_4h_session(df)
    rule, offset = RESAMPLE_RULE[interval]
    return df.resample(rule, offset=offset).agg(AGG).dropna(subset=["Close"])


def merge_days(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    """Replaces every calendar day covered by `new` (deltas always start at a session open)."""
    if new.empty:
        return old
    if old.empty:
        return new
    cutoff = new.index.min().normalize()
    return pd.concat([old[old.index < cutoff], new]).sort_index()


def reconcile_session_closes(intraday: pd.DataFrame, daily: pd.DataFrame | None, before: pd.Timestamp) -> pd.DataFrame:
    """Folds the closing-auction price (official daily close) into each session's last bar.

    Only days strictly before `before` are touched; the current session is handled by
    the live quote overlay.
    """
    if intraday.empty or daily is None or daily.empty:
        return intraday
    df = intraday.copy()
    days = df.index.normalize()
    last_of_day = ~pd.Index(days).duplicated(keep="last")
    closes = daily["Close"].copy()
    closes.index = closes.index.tz_convert(df.index.tz).normalize()
    closes = closes[~closes.index.duplicated(keep="last")]

    idx = df.index[last_of_day & (days < before.normalize())]
    official = pd.Series(idx.normalize(), index=idx).map(closes).dropna()
    if official.empty:
        return df
    current = df.loc[official.index, "Close"]
    ok = ((official - current).abs() / current) <= MAX_RECONCILE_GAP
    official = official[ok]
    df.loc[official.index, "Close"] = official
    df.loc[official.index, "High"] = df.loc[official.index, "High"].combine(official, max)
    df.loc[official.index, "Low"] = df.loc[official.index, "Low"].combine(official, min)
    return df


def _rescale(df: pd.DataFrame, mask: np.ndarray, factor: float) -> None:
    df.loc[mask, ["Open", "High", "Low", "Close"]] *= factor
    df.loc[mask, "Volume"] /= factor


def align_scale_breaks(daily: pd.DataFrame, intraday: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """Repairs split/bonus-issue adjustments that Yahoo applied to one series but not the other.

    Yahoo sometimes back-adjusts a split (BIST "bedelsiz sermaye artırımı") in the hourly
    history but not in the daily one, or vice versa (~8% of BIST symbols, e.g. MERKO
    7.38:1). The ratio daily close / last intraday close of the same session is ~1;
    a sudden persistent step in it marks the break. At each break (latest first) the
    series that actually jumps across the break is the mis-adjusted one, and its history
    before the break is rescaled onto the other series. Returns (daily, intraday, fixes).
    """
    if daily is None or daily.empty or intraday is None or intraday.empty:
        return daily, intraday, 0
    daily, intraday = daily.copy(), intraday.copy()
    for col in ("Volume",):
        daily[col] = daily[col].astype(float)
        intraday[col] = intraday[col].astype(float)
    tz = intraday.index.tz
    fixes = 0
    for _ in range(20):
        d_close = daily["Close"].copy()
        d_close.index = d_close.index.tz_convert(tz).normalize() if d_close.index.tz else d_close.index.normalize()
        d_close = d_close[~d_close.index.duplicated(keep="last")]
        h_close = intraday.groupby(intraday.index.normalize())["Close"].last()
        days = d_close.index.intersection(h_close.index)
        if len(days) < 2:
            break
        d = d_close[days].to_numpy(dtype=float)
        h = h_close[days].to_numpy(dtype=float)
        lr = np.log(d / h)
        breaks = np.nonzero(np.abs(np.diff(lr)) > SCALE_BREAK)[0]
        if breaks.size == 0:
            break
        b = int(breaks[-1]) + 1  # break between days[b-1] and days[b]
        cut = days[b]
        daily_jump = abs(math.log(d[b] / d[b - 1]))
        intraday_jump = abs(math.log(h[b] / h[b - 1]))
        if daily_jump >= intraday_jump:
            d_days = daily.index.tz_convert(tz).normalize() if daily.index.tz else daily.index.normalize()
            _rescale(daily, np.asarray(d_days < cut), math.exp(lr[b] - lr[b - 1]))
        else:
            _rescale(intraday, np.asarray(intraday.index.normalize() < cut), math.exp(lr[b - 1] - lr[b]))
        fixes += 1
    return daily, intraday, fixes


def _bin_start(ts: pd.Timestamp, interval: str) -> pd.Timestamp:
    if interval == "1h":
        return (ts - pd.Timedelta(minutes=30)).floor("1h") + pd.Timedelta(minutes=30)
    return ts.floor(f"{INTRADAY_MINUTES[interval]}min")


def overlay_quote(df: pd.DataFrame, interval: str, quote: Quote | None) -> pd.DataFrame:
    """Aligns the newest bar with the live quote (the app's single price of record)."""
    if quote is None or df.empty:
        return df
    tz = df.index.tz or TR_TZ
    qt = pd.Timestamp(quote.time, unit="s", tz="UTC").tz_convert(tz)
    price = quote.price
    df = df.copy()
    last = df.index[-1]

    if interval == "1d":
        qday = qt.normalize()
        if qday < last.normalize():
            return df
        high = max(v for v in (quote.high, price) if v is not None)
        low = min(v for v in (quote.low, price) if v is not None)
        if qday == last.normalize():
            df.loc[last, "Close"] = price
            df.loc[last, "High"] = max(df.loc[last, "High"], high)
            df.loc[last, "Low"] = min(df.loc[last, "Low"], low)
            if quote.volume:
                df.loc[last, "Volume"] = quote.volume
        else:
            df.loc[qday] = [quote.open or price, high, low, price, quote.volume or 0.0]
        return df

    if qt < last:
        return df  # candles are newer than the quote
    bar = timedelta(minutes=INTRADAY_MINUTES.get(interval, 60))
    same_day = qt.normalize() == last.normalize()
    if qt < last + bar or (same_day and qt.time() >= CONTINUOUS_CLOSE):
        # inside the last bar, or the closing-auction print: fold into the last bar
        df.loc[last, "Close"] = price
        df.loc[last, "High"] = max(df.loc[last, "High"], price)
        df.loc[last, "Low"] = min(df.loc[last, "Low"], price)
    else:
        # a new bar has started since the last candle sync
        df.loc[_bin_start(qt, interval)] = [price, price, price, price, 0.0]
    return df


def _jitter(symbol: str) -> float:
    """Deterministic 0.85-1.15 factor so ~600 symbols do not all expire in the same scan."""
    return 0.85 + 0.3 * ((zlib.crc32(symbol.encode()) % 1000) / 1000)


def is_stale(master: Master, ttl_seconds: float, symbol: str, now: float | None = None) -> bool:
    now = now or time.time()
    age = now - master.synced_at
    if is_bist_open():
        return age >= ttl_seconds * _jitter(symbol)
    # Closed: one sync after the (delayed) final bars is enough until the next session
    settled = last_session_close().timestamp() + AFTER_CLOSE_GRACE
    return master.synced_at < settled <= now and age >= 120


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

def _store(yahoo_symbol: str) -> SymbolStore:
    store = _stores.get(yahoo_symbol)
    if store is None:
        store = _stores[yahoo_symbol] = SymbolStore()
    return store


def _history_sync(yahoo_symbol: str, period: str, interval: str) -> pd.DataFrame:
    df = yf.Ticker(yahoo_symbol).history(period=period, interval=interval, auto_adjust=False, actions=False)
    return _clean(df)


class YFinanceProvider(BaseDataProvider):

    def _format_symbol(self, symbol: str) -> str:
        return to_yahoo_symbol(symbol)

    # -- L2 (Redis) persistence ------------------------------------------------

    async def _l2_load(self, ysym: str, store: SymbolStore) -> None:
        store.l2_checked = True
        try:
            blob = await _l2.get(L2_PREFIX + ysym)
            if not blob:
                return
            data: dict[str, Any] = pickle.loads(zlib.decompress(blob))
            for iv, (df, days, synced_at, *rest) in data.items():
                if iv not in store.masters:
                    store.masters[iv] = Master(df, days, synced_at, rest[0] if rest else synced_at)
            stats_counters["l2_restores"] += 1
        except Exception as e:
            logger.debug("L2 restore failed for %s: %s", ysym, e)

    async def _l2_save(self, ysym: str, store: SymbolStore) -> None:
        try:
            data = {iv: (m.df, m.days, m.synced_at, m.built_at) for iv, m in store.masters.items()}
            blob = zlib.compress(pickle.dumps(data, protocol=pickle.HIGHEST_PROTOCOL), 3)
            await _l2.set(L2_PREFIX + ysym, blob, ex=L2_TTL_SECONDS)
        except Exception as e:
            logger.debug("L2 save failed for %s: %s", ysym, e)

    # -- master maintenance ----------------------------------------------------

    async def _bootstrap(self, ysym: str, store: SymbolStore, interval: str, period: str) -> None:
        days = PERIOD_TO_DAYS.get(period, 366)
        # Derive from a finer master that already covers the depth (no request needed)
        if interval in INTRADAY_MINUTES:
            for finer, m in sorted(store.masters.items(), key=lambda kv: INTRADAY_MINUTES.get(kv[0], 10**6)):
                if (
                    finer in INTRADAY_MINUTES
                    and INTRADAY_MINUTES[finer] < INTRADAY_MINUTES[interval]
                    and m.days >= days
                ):
                    store.masters[interval] = Master(resample(m.df, interval), m.days, m.synced_at, m.built_at)
                    stats_counters["derived"] += 1
                    return
        df = await gateway.call(_history_sync, ysym, period, interval)
        stats_counters["full_fetches"] += 1
        if not df.empty:
            now = time.time()
            store.masters[interval] = Master(df, days, now, now)

    async def _sync_intraday(self, ysym: str, store: SymbolStore) -> None:
        intraday = sorted((iv for iv in store.masters if iv in INTRADAY_MINUTES), key=INTRADAY_MINUTES.get)
        if not intraday:
            return
        finest = intraday[0]
        delta = await gateway.call(_history_sync, ysym, DELTA_PERIOD, finest)
        stats_counters["delta_fetches"] += 1
        now = time.time()
        for iv in intraday:
            master = store.masters[iv]
            part = delta if iv == finest else resample(delta, iv)
            master.df = merge_days(master.df, part)
            master.synced_at = now

    async def _sync_daily(self, ysym: str, store: SymbolStore) -> None:
        delta = await gateway.call(_history_sync, ysym, DELTA_PERIOD, "1d")
        stats_counters["delta_fetches"] += 1
        master = store.masters["1d"]
        master.df = merge_days(master.df, delta)
        master.synced_at = time.time()

    async def _ensure(self, ysym: str, interval: str, period: str) -> Master | None:
        """Makes sure the master for `interval` covers `period` and is fresh enough."""
        store = _store(ysym)
        need_days = PERIOD_TO_DAYS.get(period, 366)
        async with store.lock:
            if not store.l2_checked:
                await self._l2_load(ysym, store)
            changed = False
            try:
                master = store.masters.get(interval)
                rebuild_due = (
                    master is not None
                    and not is_bist_open()
                    and time.time() - master.built_at > REBUILD_AFTER_SECONDS * _jitter(ysym)
                )
                if master is None or master.days < need_days or master.df.empty or rebuild_due:
                    await self._bootstrap(ysym, store, interval, period)
                    changed = True
                elif interval == "1d":
                    if is_stale(master, settings.DAILY_REFRESH_MINUTES * 60, ysym):
                        await self._sync_daily(ysym, store)
                        changed = True
                elif is_stale(master, settings.INTRADAY_REFRESH_MINUTES * 60, ysym):
                    await self._sync_intraday(ysym, store)
                    changed = True
            except RateLimitedError:
                pass  # serve whatever we have (possibly stale)
            except Exception as e:
                logger.debug("Candle sync failed for %s/%s: %s", ysym, interval, e)
            if changed:
                self._align_store(ysym, store)
                await self._l2_save(ysym, store)
            return store.masters.get(interval)

    @staticmethod
    def _align_store(ysym: str, store: SymbolStore) -> None:
        """Keeps daily and intraday masters on the same split-adjustment scale."""
        daily = store.masters.get("1d")
        if daily is None:
            return
        for iv in ("1h", "15m", "5m"):  # longest overlap first: it fixes the daily series too
            m = store.masters.get(iv)
            if m is None:
                continue
            fixed_daily, fixed_intraday, fixes = align_scale_breaks(daily.df, m.df)
            if fixes:
                daily.df, m.df = fixed_daily, fixed_intraday
                stats_counters["scale_fixes"] += fixes
                logger.info("Aligned %d split-adjustment break(s) between 1d and %s for %s", fixes, iv, ysym)

    def data_version(self, symbol: str) -> tuple:
        """Changes whenever any master of the symbol is re-synced (for memoised scoring)."""
        store = _stores.get(to_yahoo_symbol(symbol))
        if not store:
            return ()
        return tuple(sorted((iv, m.synced_at) for iv, m in store.masters.items()))

    # -- public API ------------------------------------------------------------

    async def fetch_historical_data(
        self, symbol: str, period: str | None = None, interval: str = "1d", live: bool = True
    ) -> pd.DataFrame:
        """OHLCV for `interval` covering `period`; with `live`, the last bar follows the quote."""
        ysym = to_yahoo_symbol(symbol)
        requested_period = period or DEFAULT_PERIOD_BY_INTERVAL.get(interval, "1y")

        effective_interval = interval
        if effective_interval in INTRADAY_MAX_PERIODS and requested_period not in INTRADAY_MAX_PERIODS[effective_interval]:
            if requested_period in {"2y", "5y"}:
                effective_interval = "1d"
            else:
                requested_period = DEFAULT_PERIOD_BY_INTERVAL[effective_interval]

        yf_interval = "1h" if effective_interval == "4h" else effective_interval
        req_days = PERIOD_TO_DAYS.get(requested_period, 366)
        min_period = MIN_BOOTSTRAP_PERIOD.get(yf_interval)
        fetch_period = requested_period
        if min_period and PERIOD_TO_DAYS[min_period] > req_days:
            fetch_period = min_period

        master = await self._ensure(ysym, yf_interval, fetch_period)
        if master is None or master.df.empty:
            return pd.DataFrame()
        df = master.df

        if yf_interval in INTRADAY_MINUTES:
            daily = _stores[ysym].masters.get("1d")
            df = reconcile_session_closes(df, daily.df if daily else None, pd.Timestamp.now(tz=df.index.tz))
        if live:
            df = overlay_quote(df, yf_interval, quote_book.peek(ysym))
        if effective_interval == "4h":
            df = resample(df, "4h")
        return self._slice_by_period(df, requested_period)

    def _slice_by_period(self, df: pd.DataFrame, period: str) -> pd.DataFrame:
        if df.empty or period not in PERIOD_TO_DAYS:
            return df
        cutoff = df.index.max() - pd.Timedelta(days=PERIOD_TO_DAYS[period])
        sliced = df[df.index >= cutoff]
        return sliced if not sliced.empty else df


def provider_stats() -> dict[str, Any]:
    frames = sum(len(s.masters) for s in _stores.values())
    rows = sum(len(m.df) for s in _stores.values() for m in s.masters.values())
    return {"symbols_cached": len(_stores), "frames_cached": frames, "candles_cached": rows, **stats_counters}
