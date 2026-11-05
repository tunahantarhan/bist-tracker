"""Market scanning and per-symbol analysis.

Scores must not depend on what the user happens to look at, so every rule is always
evaluated on a canonical candle set per timeframe (`EVALUATION_PERIODS`). The chart
period chosen in the UI only affects what is drawn.
"""

import asyncio
import logging
import math
import time
from typing import Any, Sequence

import numpy as np
import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.stock_catalog import STOCK_CATALOG
from app.models.rule import Rule
from app.models.universe import UniverseStock
from app.providers.yfinance_provider import YFinanceProvider
from app.services.cache_service import CacheService
from app.services.rule_engine import RuleEngine

logger = logging.getLogger(__name__)

provider = YFinanceProvider()

# Candle depth used for rule evaluation; deep enough for slow indicators (e.g. daily MA200)
EVALUATION_PERIODS: dict[str, str] = {
    "5m": "1mo",
    "15m": "1mo",
    "1h": "6mo",
    "4h": "6mo",
    "1d": "2y",
}

DEFAULT_PRIMARY_TIMEFRAME = "4h"
DEFAULT_TRENDLINE_PARAMS = {"length": 14, "lookback": 60, "min_peak": 55.0, "max_trend_end": 30.0}
FALLBACK_UNIVERSE = ["THYAO", "AKBNK", "KCHOL", "TUPRS", "GARAN"]

OVERVIEW_CACHE_KEY = "bist_market_overview_v2"
OVERVIEW_TTL_SECONDS = 60
SYMBOL_CACHE_TTL_SECONDS = 20
FUNDAMENTALS_TTL_SECONDS = 6 * 3600
SCAN_CONCURRENCY = 6

OVERLAY_INDICATORS = {
    "SMA", "MA", "EMA",
    "BOLLINGER_UPPER", "BOLLINGER_MIDDLE", "BOLLINGER_LOWER",
    "BB_UPPER", "BB_MIDDLE", "BB_LOWER",
}
OVERLAY_LABELS = {
    "SMA": "MA", "MA": "MA", "EMA": "EMA",
    "BOLLINGER_UPPER": "BB Üst", "BB_UPPER": "BB Üst",
    "BOLLINGER_MIDDLE": "BB Orta", "BB_MIDDLE": "BB Orta",
    "BOLLINGER_LOWER": "BB Alt", "BB_LOWER": "BB Alt",
}
LINE_COLORS = ["#3b82f6", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16", "#14b8a6", "#f43f5e"]

_overview_lock = asyncio.Lock()
_overview_memory: dict[str, Any] = {"timestamp": 0.0, "data": None}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sanitize_for_json(obj: Any) -> Any:
    """Recursively converts numpy scalars and replaces NaN/Infinity with None so the payload is strict JSON."""
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    try:
        if pd.isna(obj):
            return None
    except (TypeError, ValueError):
        pass
    return obj


def stock_name(symbol: str) -> str:
    return STOCK_CATALOG.get(symbol, symbol)


def _pct_change(curr: float, prev: float) -> float:
    return round(((curr - prev) / prev) * 100, 2) if prev and prev > 0 else 0.0


async def get_active_rules(db: AsyncSession) -> list[Rule]:
    result = await db.execute(
        select(Rule).where(Rule.is_active.is_(True)).order_by(Rule.is_primary_filter.desc(), Rule.id.asc())
    )
    return list(result.scalars().all())


def get_primary_rule(rules: Sequence[Rule]) -> Rule | None:
    return next((r for r in rules if r.is_primary_filter), None)


def required_timeframes(rules: Sequence[Rule]) -> set[str]:
    tfs = {(r.timeframe or "1d") for r in rules}
    tfs.add("1d")  # daily candles drive price change and periodic returns
    primary = get_primary_rule(rules)
    tfs.add(primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME)
    return tfs


async def load_evaluation_frames(symbol: str, timeframes: set[str]) -> dict[str, pd.DataFrame]:
    async def _load(tf: str) -> tuple[str, pd.DataFrame | None]:
        try:
            df = await provider.fetch_historical_data(
                symbol=symbol, interval=tf, period=EVALUATION_PERIODS.get(tf, "6mo")
            )
            if df is None or df.empty:
                return tf, None
            return tf, df.dropna(subset=["Close"])
        except Exception as e:
            logger.debug("Frame %s/%s unavailable: %s", symbol, tf, e)
            return tf, None

    loaded = await asyncio.gather(*[_load(tf) for tf in timeframes])
    return {tf: df for tf, df in loaded if df is not None and not df.empty}


def _daily_price_change(frames: dict[str, pd.DataFrame], fallback: pd.DataFrame) -> tuple[float, float]:
    daily = frames.get("1d")
    source = daily if daily is not None and len(daily) >= 2 else fallback
    closes = source["Close"].astype(float).dropna()
    last_close = float(closes.iloc[-1])
    prev_close = float(closes.iloc[-2]) if len(closes) > 1 else last_close
    return round(last_close, 2), _pct_change(last_close, prev_close)


def _periodic_returns(daily_df: pd.DataFrame | None) -> list[dict[str, Any]]:
    if daily_df is None or len(daily_df) < 2:
        return []
    closes = daily_df["Close"].astype(float).dropna().tolist()
    if len(closes) < 2:
        return []
    curr = closes[-1]

    def _ret(bars_ago: int) -> float:
        return _pct_change(curr, closes[max(0, len(closes) - 1 - bars_ago)])

    # Trading-day approximations
    return [
        {"label": "1 Hafta", "period": "1H", "change_pct": _ret(5)},
        {"label": "1 Ay", "period": "1A", "change_pct": _ret(21)},
        {"label": "3 Ay", "period": "3A", "change_pct": _ret(63)},
        {"label": "6 Ay", "period": "6A", "change_pct": _ret(126)},
        {"label": "1 Yıl", "period": "1Y", "change_pct": _ret(252)},
    ]


# ---------------------------------------------------------------------------
# Market overview (whole universe)
# ---------------------------------------------------------------------------

async def _active_universe(db: AsyncSession) -> list[str]:
    result = await db.execute(select(UniverseStock.symbol).where(UniverseStock.is_active.is_(True)))
    symbols = list(result.scalars().all())
    return symbols or FALLBACK_UNIVERSE


async def _evaluate_for_overview(
    symbol: str, rules: list[Rule], timeframes: set[str], primary_tf: str
) -> dict[str, Any] | None:
    try:
        frames = await load_evaluation_frames(symbol, timeframes)
        default_df = frames.get(primary_tf)
        if default_df is None:
            default_df = next(iter(frames.values()), None)
        if default_df is None or len(default_df) < 2:
            return None

        price, change_pct = _daily_price_change(frames, default_df)
        evaluation = (
            RuleEngine.evaluate_symbol(default_df, rules, dataframes_by_tf=frames)
            if rules
            else {"total_score": 0.0, "primary_filter_passed": False, "has_primary_filter": False, "rules_breakdown": []}
        )
        return {
            "symbol": symbol,
            "name": stock_name(symbol),
            "current_price": price,
            "change_pct": change_pct,
            "score": evaluation["total_score"],
            "primary_filter_passed": evaluation["primary_filter_passed"],
            "has_primary_filter": evaluation["has_primary_filter"],
            "rules_breakdown": evaluation.get("rules_breakdown", []),
        }
    except Exception as e:
        logger.info("Overview scan skipped for %s: %s", symbol, e)
        return None


async def compute_overview(db: AsyncSession) -> dict[str, Any]:
    rules = await get_active_rules(db)
    primary = get_primary_rule(rules)
    primary_tf = primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME
    timeframes = required_timeframes(rules)
    symbols = await _active_universe(db)

    semaphore = asyncio.Semaphore(SCAN_CONCURRENCY)

    async def _guarded(sym: str):
        async with semaphore:
            return await _evaluate_for_overview(sym, rules, timeframes, primary_tf)

    results = await asyncio.gather(*[_guarded(s) for s in symbols])
    items = [r for r in results if r is not None]

    payload = {
        "items": items,
        "rsi_passed": sorted(
            [i for i in items if i["has_primary_filter"] and i["primary_filter_passed"]],
            key=lambda x: x["score"],
            reverse=True,
        ),
        "top_scored": sorted(items, key=lambda x: (x["score"], x["change_pct"]), reverse=True)[:10],
        "top_priced": sorted(items, key=lambda x: x["current_price"], reverse=True)[:10],
        "primary_filter_timeframe": primary_tf,
        "generated_at": time.time(),
    }
    return sanitize_for_json(payload)


async def get_overview(db: AsyncSession, force_refresh: bool = False) -> dict[str, Any]:
    """Cached overview with a single-flight guard so concurrent callers share one scan."""

    def _memory_hit() -> dict[str, Any] | None:
        data = _overview_memory["data"]
        if data is not None and (time.time() - _overview_memory["timestamp"]) < OVERVIEW_TTL_SECONDS:
            return data
        return None

    if not force_refresh:
        cached = await CacheService.get_json(OVERVIEW_CACHE_KEY) or _memory_hit()
        if cached:
            return cached

    async with _overview_lock:
        if not force_refresh:
            cached = await CacheService.get_json(OVERVIEW_CACHE_KEY) or _memory_hit()
            if cached:
                return cached

        payload = await compute_overview(db)
        _overview_memory["timestamp"] = time.time()
        _overview_memory["data"] = payload
        await CacheService.set_json(OVERVIEW_CACHE_KEY, payload, expiration=OVERVIEW_TTL_SECONDS)
        return payload


async def invalidate_market_caches() -> None:
    """Called whenever rules or the universe change."""
    _overview_memory["timestamp"] = 0.0
    _overview_memory["data"] = None
    await CacheService.delete_key(OVERVIEW_CACHE_KEY)
    await CacheService.delete_pattern("bist_market_stock_*")


# ---------------------------------------------------------------------------
# Single symbol detail
# ---------------------------------------------------------------------------

def _fetch_fundamentals_sync(symbol: str) -> dict[str, Any]:
    tk = yf.Ticker(f"{symbol}.IS")
    f_info = tk.fast_info
    market_cap = getattr(f_info, "market_cap", None)
    year_high = getattr(f_info, "year_high", None)
    year_low = getattr(f_info, "year_low", None)

    pe = pb = free_float_pct = None
    try:
        info = tk.info
        pe = info.get("trailingPE") or info.get("forwardPE")
        pb = info.get("priceToBook")
        float_shares = info.get("floatShares")
        shares_out = info.get("sharesOutstanding")
        if float_shares and shares_out:
            free_float_pct = round(float_shares / shares_out * 100, 2)
    except Exception:
        pass  # `info` is slow/unreliable for some BIST tickers; fast_info values are still useful

    return {
        "market_cap": market_cap,
        "pe_ratio": round(float(pe), 2) if pe else None,
        "pb_ratio": round(float(pb), 2) if pb else None,
        "free_float_pct": free_float_pct,
        "year_high": round(float(year_high), 2) if year_high else None,
        "year_low": round(float(year_low), 2) if year_low else None,
    }


async def get_fundamentals(symbol: str) -> dict[str, Any]:
    key = f"bist_fundamentals_{symbol}"
    cached = await CacheService.get_json(key)
    if cached is not None:
        return cached
    try:
        data = sanitize_for_json(await asyncio.to_thread(_fetch_fundamentals_sync, symbol))
    except Exception as e:
        logger.info("Fundamentals unavailable for %s: %s", symbol, e)
        return {}
    await CacheService.set_json(key, data, expiration=FUNDAMENTALS_TTL_SECONDS)
    return data


def _series_points(times: list[str], series: pd.Series | None) -> list[dict[str, Any]]:
    if series is None:
        return []
    return [
        {"time": t, "value": round(float(v), 2)}
        for t, v in zip(times, series.tolist())
        if pd.notna(v) and not math.isinf(v)
    ]


def _build_overlays(chart_df: pd.DataFrame, times: list[str], rules: Sequence[Rule]) -> list[dict[str, Any]]:
    overlays: list[dict[str, Any]] = []
    seen: set[str] = set()

    for rule in rules:
        pairs = [(rule.indicator_1, rule.indicator_1_params)]
        if rule.target_type == "indicator" and rule.indicator_2:
            pairs.append((rule.indicator_2, rule.indicator_2_params))

        for name, params in pairs:
            if not name or name.upper() not in OVERLAY_INDICATORS:
                continue
            params = params or {}
            length = params.get("length", params.get("period", ""))
            key = f"{name.upper()}_{length}"
            if key in seen:
                continue
            seen.add(key)
            try:
                series = RuleEngine.get_indicator_series(chart_df, name, params)
            except Exception as e:
                logger.debug("Overlay %s skipped: %s", key, e)
                continue
            overlays.append({
                "name": f"{OVERLAY_LABELS.get(name.upper(), name.upper())} ({length})" if length else name.upper(),
                "color": LINE_COLORS[len(overlays) % len(LINE_COLORS)],
                "data": _series_points(times, series),
            })
    return overlays


def _build_rsi_pane(chart_df: pd.DataFrame, times: list[str], primary: Rule | None) -> dict[str, Any]:
    params = dict(DEFAULT_TRENDLINE_PARAMS)
    if primary and primary.indicator_2_params:
        params.update(primary.indicator_2_params)

    pane: dict[str, Any] = {"rsi": [], "trendline": [], "slope": None, "peak_rsi": None}
    try:
        closes = chart_df["Close"].astype(float)
        rsi = RuleEngine.get_indicator_series(chart_df, "RSI", {"length": int(params.get("length", 14))})
        trend, meta = RuleEngine.calculate_rsi_downtrend_series(closes, params)
        pane.update(
            rsi=_series_points(times, rsi),
            trendline=_series_points(times, trend),
            slope=meta.get("slope"),
            peak_rsi=meta.get("peak_rsi"),
        )
    except Exception as e:
        logger.debug("RSI pane skipped: %s", e)
    return pane


async def get_symbol_detail(
    db: AsyncSession, symbol: str, interval: str = "4h", period: str | None = None
) -> dict[str, Any] | None:
    symbol = symbol.upper()
    cache_key = f"bist_market_stock_{symbol}_{interval}_{period or 'default'}"
    cached = await CacheService.get_json(cache_key)
    if cached:
        return cached

    rules = await get_active_rules(db)
    chart_df, frames, fundamentals = await asyncio.gather(
        provider.fetch_historical_data(symbol=symbol, period=period, interval=interval),
        load_evaluation_frames(symbol, required_timeframes(rules)),
        get_fundamentals(symbol),
    )

    if chart_df is None or chart_df.empty:
        return None
    chart_df = chart_df.dropna(subset=["Open", "High", "Low", "Close"])
    if chart_df.empty:
        return None

    df_reset = chart_df.reset_index()
    date_col = "Datetime" if "Datetime" in df_reset.columns else "Date"
    times = df_reset[date_col].astype(str).tolist()
    candles = [
        {"time": t, "open": round(float(o), 2), "high": round(float(h), 2), "low": round(float(lo), 2), "close": round(float(c), 2)}
        for t, o, h, lo, c in zip(times, df_reset["Open"], df_reset["High"], df_reset["Low"], df_reset["Close"])
    ]

    price, change_pct = _daily_price_change(frames, chart_df)
    primary = get_primary_rule(rules)

    evaluation: dict[str, Any] = {
        "total_score": 0.0,
        "primary_filter_passed": False,
        "has_primary_filter": False,
        "rules_breakdown": [],
    }
    if rules and frames:
        default_df = frames.get(primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME, chart_df)
        evaluation = RuleEngine.evaluate_symbol(default_df, rules, dataframes_by_tf=frames)

    payload = sanitize_for_json({
        "symbol": symbol,
        "name": stock_name(symbol),
        "interval": interval,
        "period": period,
        "current_price": price,
        "change_pct": change_pct,
        "candles": candles,
        "score": evaluation["total_score"],
        "primary_filter_passed": evaluation["primary_filter_passed"],
        "primary_filter_timeframe": primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME,
        "has_primary_filter": evaluation["has_primary_filter"],
        "rules_breakdown": evaluation["rules_breakdown"],
        "indicators": _build_overlays(chart_df, times, rules),
        "rsi_pane": _build_rsi_pane(chart_df, times, primary),
        "periodic_returns": _periodic_returns(frames.get("1d")),
        "fundamentals": fundamentals or {},
    })

    await CacheService.set_json(cache_key, payload, expiration=SYMBOL_CACHE_TTL_SECONDS)
    return payload
