"""Market scanning and per-symbol analysis.

Scores must not depend on what the user happens to look at, so every rule is always
evaluated on a canonical candle set per timeframe (`EVALUATION_PERIODS`). The chart
period chosen in the UI only affects what is drawn.

Serving strategy (whole BIST, ~600 symbols):
  * The overview is served stale-while-revalidate: requests always get the last
    snapshot immediately; a single background scan refreshes it. The very first scan
    publishes partial results as it goes (most liquid symbols first).
  * Per-symbol evaluations are memoised on (rules, candle versions, quote) so an
    unchanged symbol is not re-scored, and CPU-heavy indicator maths runs in worker
    threads so the event loop keeps answering requests during a scan.
  * Prices come from the batch quote snapshot (`providers/quotes.py`), the single
    source of truth shared by ticker, overview, detail and the chart's last candle.
"""

import asyncio
import logging
import math
import time
from types import SimpleNamespace
from typing import Any, Sequence

import numpy as np
import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.default_rules import PRIMARY_TRENDLINE_PARAMS
from app.core.market_hours import market_state
from app.core.stock_catalog import STOCK_CATALOG
from app.models.rule import Rule
from app.models.universe import UniverseStock
from app.providers.quotes import Quote, quote_book
from app.providers.yahoo_gateway import background_lane
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
# Finest first, so coarser intraday frames can be derived from finer ones on bootstrap
TIMEFRAME_ORDER = ["5m", "15m", "1h", "4h", "1d"]

DEFAULT_PRIMARY_TIMEFRAME = "1h"
DEFAULT_TRENDLINE_PARAMS = PRIMARY_TRENDLINE_PARAMS
FALLBACK_UNIVERSE = ["THYAO", "AKBNK", "KCHOL", "TUPRS", "GARAN"]

OVERVIEW_CACHE_KEY = "bist_market_overview_v3"
OVERVIEW_FRESH_SECONDS = 60  # older snapshots trigger a background refresh
OVERVIEW_KEEP_SECONDS = 24 * 3600  # how long Redis keeps the last snapshot (instant restarts)
SYMBOL_CACHE_TTL_SECONDS = 20
FUNDAMENTALS_TTL_SECONDS = 6 * 3600
SCAN_CONCURRENCY = 12
PROGRESS_PUBLISH_EVERY = 25

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
_overview_memory: dict[str, Any] = {"data": None}
_scan_state: dict[str, Any] = {"task": None, "done": 0, "total": 0, "partial": [], "last_duration": None}
_eval_memo: dict[str, tuple[tuple, dict[str, Any]]] = {}


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


RULE_FIELDS = (
    "id", "name", "description", "timeframe", "is_primary_filter", "indicator_1", "indicator_1_params",
    "condition", "target_type", "indicator_2", "indicator_2_params", "static_value", "score_impact",
)


def snapshot_rules(rules: Sequence[Rule]) -> list[SimpleNamespace]:
    """Plain copies of ORM rules: safe to read from worker threads and after a rollback."""
    return [SimpleNamespace(**{f: getattr(r, f) for f in RULE_FIELDS}) for r in rules]


def _rules_signature(rules: Sequence[Any]) -> tuple:
    return tuple(repr([getattr(r, f) for f in RULE_FIELDS]) for r in rules)


def get_primary_rule(rules: Sequence[Any]) -> Any | None:
    return next((r for r in rules if r.is_primary_filter), None)


def required_timeframes(rules: Sequence[Any]) -> set[str]:
    tfs = {(r.timeframe or "1d") for r in rules}
    tfs.add("1d")  # daily candles drive periodic returns
    primary = get_primary_rule(rules)
    tfs.add(primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME)
    return tfs


async def load_evaluation_frames(symbol: str, timeframes: set[str]) -> dict[str, pd.DataFrame]:
    """Loads frames finest-first (sequentially) so 15m can be derived from 5m, 4h from 1h."""
    frames: dict[str, pd.DataFrame] = {}
    for tf in sorted(timeframes, key=lambda t: TIMEFRAME_ORDER.index(t) if t in TIMEFRAME_ORDER else 99):
        try:
            df = await provider.fetch_historical_data(
                symbol=symbol, interval=tf, period=EVALUATION_PERIODS.get(tf, "6mo")
            )
        except Exception as e:
            logger.debug("Frame %s/%s unavailable: %s", symbol, tf, e)
            continue
        if df is not None and not df.empty:
            frames[tf] = df.dropna(subset=["Close"])
    return frames


def price_of_record(quote: Quote | None, daily: pd.DataFrame | None, fallback: pd.DataFrame | None = None) -> dict[str, Any]:
    """The price shown everywhere: live quote first, daily candles only as a fallback."""
    if quote is not None:
        return {
            "current_price": round(quote.price, 2),
            "change_pct": quote.change_pct,
            "prev_close": round(quote.prev_close, 2) if quote.prev_close else None,
            "price_time": quote.time,
        }
    source = daily if daily is not None and len(daily) >= 2 else fallback
    if source is None or source.empty:
        return {"current_price": None, "change_pct": 0.0, "prev_close": None, "price_time": None}
    closes = source["Close"].astype(float).dropna()
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) > 1 else last
    return {
        "current_price": round(last, 2),
        "change_pct": _pct_change(last, prev),
        "prev_close": round(prev, 2),
        "price_time": int(closes.index[-1].timestamp()),
    }


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


def _feed_meta(quotes: dict[str, Quote]) -> dict[str, Any]:
    times = [q.time for q in quotes.values() if q.symbol.endswith(".IS")]
    delays = [q.delay_minutes for q in quotes.values() if q.symbol.endswith(".IS")]
    return {
        "quotes_as_of": max(times) if times else None,
        "delay_minutes": max(delays) if delays else 15,
        "market_state": market_state(),
    }


# ---------------------------------------------------------------------------
# Market overview (whole universe)
# ---------------------------------------------------------------------------

async def _active_universe(db: AsyncSession) -> list[str]:
    result = await db.execute(select(UniverseStock.symbol).where(UniverseStock.is_active.is_(True)))
    symbols = list(result.scalars().all())
    return symbols or FALLBACK_UNIVERSE


EMPTY_EVALUATION = {"total_score": 0.0, "primary_filter_passed": False, "has_primary_filter": False, "rules_breakdown": []}


async def _evaluate_for_overview(
    symbol: str, rules: list[Any], rules_sig: tuple, timeframes: set[str], primary_tf: str, quote: Quote | None
) -> dict[str, Any] | None:
    try:
        frames = await load_evaluation_frames(symbol, timeframes)
        default_df = frames.get(primary_tf)
        if default_df is None:
            default_df = next(iter(frames.values()), None)
        if default_df is None or len(default_df) < 2:
            return None

        memo_key = (rules_sig, provider.data_version(symbol), quote.price if quote else None, quote.time if quote else None)
        memo = _eval_memo.get(symbol)
        if memo and memo[0] == memo_key:
            evaluation = memo[1]
        else:
            evaluation = (
                await asyncio.to_thread(RuleEngine.evaluate_symbol, default_df, rules, frames)
                if rules else EMPTY_EVALUATION
            )
            _eval_memo[symbol] = (memo_key, evaluation)

        price = price_of_record(quote, frames.get("1d"), default_df)
        if price["current_price"] is None:
            return None
        return {
            "symbol": symbol,
            "name": stock_name(symbol),
            "current_price": price["current_price"],
            "change_pct": price["change_pct"],
            "score": evaluation["total_score"],
            "primary_filter_passed": evaluation["primary_filter_passed"],
            "has_primary_filter": evaluation["has_primary_filter"],
            "rules_breakdown": evaluation.get("rules_breakdown", []),
        }
    except Exception as e:
        logger.info("Overview scan skipped for %s: %s", symbol, e)
        return None


def _build_payload(items: list[dict[str, Any]], primary_tf: str, quotes: dict[str, Quote], **extra: Any) -> dict[str, Any]:
    return sanitize_for_json({
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
        "status": "ready",
        **_feed_meta(quotes),
        **extra,
    })


def _liquidity(quote: Quote | None) -> float:
    if quote is None:
        return 0.0
    return (quote.avg_volume_3m or quote.volume or 0.0) * quote.price


async def compute_overview(db: AsyncSession) -> dict[str, Any]:
    started = time.time()
    rules = snapshot_rules(await get_active_rules(db))
    rules_sig = _rules_signature(rules)
    primary = get_primary_rule(rules)
    primary_tf = primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME
    timeframes = required_timeframes(rules)
    symbols = await _active_universe(db)

    background_lane.set(True)  # this task and its children yield to interactive requests
    quotes = await quote_book.get_quotes(symbols)
    # Most liquid first: during the very first (cold) scan they show up earliest
    symbols.sort(key=lambda s: _liquidity(quotes.get(s)), reverse=True)

    _scan_state.update(done=0, total=len(symbols), partial=[])
    semaphore = asyncio.Semaphore(SCAN_CONCURRENCY)

    async def _guarded(sym: str):
        async with semaphore:
            result = await _evaluate_for_overview(sym, rules, rules_sig, timeframes, primary_tf, quotes.get(sym))
        _scan_state["done"] += 1
        if result is not None:
            _scan_state["partial"].append(result)
        return result

    results = await asyncio.gather(*[_guarded(s) for s in symbols])
    items = [r for r in results if r is not None]
    _scan_state["last_duration"] = round(time.time() - started, 1)
    _scan_state["partial"] = []
    return _build_payload(items, primary_tf, quotes, scan_seconds=_scan_state["last_duration"], universe_size=len(symbols))


async def _refresh_overview() -> dict[str, Any]:
    async with _overview_lock:
        async with AsyncSessionLocal() as db:
            payload = await compute_overview(db)
        _overview_memory["data"] = payload
        await CacheService.set_json(OVERVIEW_CACHE_KEY, payload, expiration=OVERVIEW_KEEP_SECONDS)
        return payload


def _log_refresh_failure(task: asyncio.Task) -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.error("Background overview refresh failed: %r", task.exception())


def _spawn_refresh() -> None:
    task = _scan_state.get("task")
    if task is None or task.done():
        _scan_state["task"] = asyncio.create_task(_refresh_overview())
        _scan_state["task"].add_done_callback(_log_refresh_failure)


async def _snapshot() -> dict[str, Any] | None:
    data = _overview_memory["data"]
    if data is None:
        data = await CacheService.get_json(OVERVIEW_CACHE_KEY)
        if data is not None:
            _overview_memory["data"] = data
    return data


def _warming_payload() -> dict[str, Any]:
    partial = list(_scan_state["partial"])
    return _build_payload(
        partial,
        DEFAULT_PRIMARY_TIMEFRAME,
        {},
        status="warming",
        progress={"done": _scan_state["done"], "total": _scan_state["total"]},
    )


async def get_overview(db: AsyncSession | None = None, force_refresh: bool = False) -> dict[str, Any]:
    """Stale-while-revalidate overview.

    * force_refresh (scheduler): scans now and returns the fresh snapshot.
    * otherwise: returns the last snapshot immediately and refreshes it in the
      background when it is older than `OVERVIEW_FRESH_SECONDS`. Before the first
      snapshot exists, partial results of the running scan are returned.
    """
    if force_refresh:
        task = _scan_state.get("task")
        if task is not None and not task.done():
            return await task  # a scan is already running; share it (single flight)
        _spawn_refresh()
        return await _scan_state["task"]

    data = await _snapshot()
    if data is None:
        _spawn_refresh()
        return _warming_payload()
    if time.time() - (data.get("generated_at") or 0) > OVERVIEW_FRESH_SECONDS:
        _spawn_refresh()
    return data


def public_overview(payload: dict[str, Any]) -> dict[str, Any]:
    """Client view of a snapshot.

    * Drops per-rule breakdowns (only needed server-side for alerts) to keep the polled payload small.
    * Re-stamps prices from the live quote book (memory only, no network): scores come from the
      last scan, prices are always the current price of record, identical to ticker and detail.
    """
    def slim(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        for r in rows:
            row = {k: v for k, v in r.items() if k != "rules_breakdown"}
            quote = quote_book.peek(row.get("symbol", ""))
            if quote is not None:
                row["current_price"] = round(quote.price, 2)
                row["change_pct"] = quote.change_pct
            out.append(row)
        return out

    return {
        **payload,
        "items": slim(payload.get("items", [])),
        "rsi_passed": slim(payload.get("rsi_passed", [])),
        "top_scored": slim(payload.get("top_scored", [])),
        "top_priced": slim(payload.get("top_priced", [])),
    }


async def invalidate_market_caches(rescan: bool = True) -> None:
    """Called whenever rules or the universe change; starts a fresh scan in the background."""
    _overview_memory["data"] = None
    _eval_memo.clear()
    await CacheService.delete_key(OVERVIEW_CACHE_KEY)
    await CacheService.delete_pattern("bist_market_stock_*")
    if rescan:
        _spawn_refresh()


def scan_stats() -> dict[str, Any]:
    data = _overview_memory["data"] or {}
    task = _scan_state.get("task")
    return {
        "scan_running": bool(task is not None and not task.done()),
        "scan_progress": {"done": _scan_state["done"], "total": _scan_state["total"]},
        "last_scan_seconds": _scan_state["last_duration"],
        "snapshot_generated_at": data.get("generated_at"),
        "snapshot_items": len(data.get("items", [])),
        "memoised_symbols": len(_eval_memo),
    }


# ---------------------------------------------------------------------------
# Single symbol detail
# ---------------------------------------------------------------------------

def _free_float_sync(symbol: str) -> dict[str, Any]:
    """`Ticker.info` is slow (~1-2 s); only used for what the batch quote lacks."""
    info = yf.Ticker(f"{symbol}.IS").info
    float_shares = info.get("floatShares")
    shares_out = info.get("sharesOutstanding")
    pe = info.get("trailingPE") or info.get("forwardPE")
    return {
        "free_float_pct": round(float_shares / shares_out * 100, 2) if float_shares and shares_out else None,
        "pe_ratio": round(float(pe), 2) if pe else None,
    }


_enrichment_inflight: set[str] = set()


async def _enrich_fundamentals(symbol: str) -> None:
    from app.providers.yahoo_gateway import gateway

    try:
        extra = sanitize_for_json(await gateway.call(_free_float_sync, symbol))
        await CacheService.set_json(f"bist_fundamentals_extra_{symbol}", extra, expiration=FUNDAMENTALS_TTL_SECONDS)
    except Exception as e:
        logger.info("Fundamentals enrichment failed for %s: %s", symbol, e)
    finally:
        _enrichment_inflight.discard(symbol)


async def get_fundamentals(symbol: str, quote: Quote | None) -> dict[str, Any]:
    """Quote fields immediately; free float is fetched in the background and merged on the next poll."""
    extra = await CacheService.get_json(f"bist_fundamentals_extra_{symbol}")
    if extra is None and symbol not in _enrichment_inflight:
        _enrichment_inflight.add(symbol)
        asyncio.create_task(_enrich_fundamentals(symbol))
    extra = extra or {}
    q = quote
    return sanitize_for_json({
        "market_cap": q.market_cap if q else None,
        "pe_ratio": (round(q.pe_ratio, 2) if q and q.pe_ratio else None) or extra.get("pe_ratio"),
        "pb_ratio": round(q.pb_ratio, 2) if q and q.pb_ratio else None,
        "free_float_pct": extra.get("free_float_pct"),
        "year_high": round(q.year_high, 2) if q and q.year_high else None,
        "year_low": round(q.year_low, 2) if q and q.year_low else None,
    })


def _series_points(times: list[str], series: pd.Series | None) -> list[dict[str, Any]]:
    if series is None:
        return []
    return [
        {"time": t, "value": round(float(v), 2)}
        for t, v in zip(times, series.tolist())
        if pd.notna(v) and not math.isinf(v)
    ]


def _build_overlays(chart_df: pd.DataFrame, times: list[str], rules: Sequence[Any]) -> list[dict[str, Any]]:
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


def _trend_note(meta: dict[str, Any], p: dict[str, Any]) -> str:
    """One-line state of the descending trendline for the chart legend."""
    checks = meta.get("trend_checks") or {}
    if meta.get("t2_x") is None:
        if not checks.get("peak"):
            return f"Son {p['lookback']} mumda {p['min_peak']:g} üstü RSI tepesi yok"
        return "İkinci tepe oluşmadı, düşen trend yok"
    ago = meta.get("break_bars_ago")
    if ago is None:
        return "Kırılım bekleniyor"
    if not checks.get("rising_break") or not checks.get("low_break"):
        return f"Çizginin üstünde ({ago} mum), geçerli kırılım değil"
    return f"Kırıldı · {ago} mum önce" if checks.get("fresh") else f"Kırılım eskidi ({ago} mum önce)"


def _build_rsi_pane(chart_df: pd.DataFrame, times: list[str], primary: Any | None) -> dict[str, Any]:
    params = dict(DEFAULT_TRENDLINE_PARAMS)
    if primary and primary.indicator_2_params:
        params.update(primary.indicator_2_params)

    pane: dict[str, Any] = {"rsi": [], "trendline": [], "slope": None, "peak_rsi": None, "trend_note": None}
    try:
        closes = chart_df["Close"].astype(float)
        rsi = RuleEngine.get_indicator_series(chart_df, "RSI", {"length": int(params.get("length", 14))})
        trend, meta = RuleEngine.calculate_rsi_downtrend_series(closes, params)
        # no line without a valid second peak; the drawn part stops where it reaches 0
        drawn = trend.where(trend > 0) if meta.get("t2_x") is not None else trend.iloc[:0]
        pane.update(
            rsi=_series_points(times, rsi),
            trendline=_series_points(times, drawn),
            slope=meta.get("slope"),
            peak_rsi=meta.get("peak_rsi"),
            trend_note=_trend_note(meta, RuleEngine.trendline_params(params)),
        )
    except Exception as e:
        logger.debug("RSI pane skipped: %s", e)
    return pane


def _build_detail_body(chart_df: pd.DataFrame, frames: dict[str, pd.DataFrame], rules: list[Any]) -> dict[str, Any]:
    """CPU part of the detail payload (runs in a worker thread)."""
    df_reset = chart_df.reset_index()
    date_col = "Datetime" if "Datetime" in df_reset.columns else "Date"
    times = df_reset[date_col].astype(str).tolist()
    candles = [
        {"time": t, "open": round(float(o), 2), "high": round(float(h), 2), "low": round(float(lo), 2), "close": round(float(c), 2)}
        for t, o, h, lo, c in zip(times, df_reset["Open"], df_reset["High"], df_reset["Low"], df_reset["Close"])
    ]
    primary = get_primary_rule(rules)
    evaluation = EMPTY_EVALUATION
    if rules and frames:
        default_df = frames.get(primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME, chart_df)
        evaluation = RuleEngine.evaluate_symbol(default_df, rules, dataframes_by_tf=frames)
    return {
        "candles": candles,
        "score": evaluation["total_score"],
        "primary_filter_passed": evaluation["primary_filter_passed"],
        "primary_filter_timeframe": primary.timeframe if primary else DEFAULT_PRIMARY_TIMEFRAME,
        "has_primary_filter": evaluation["has_primary_filter"],
        "rules_breakdown": evaluation["rules_breakdown"],
        "indicators": _build_overlays(chart_df, times, rules),
        "rsi_pane": _build_rsi_pane(chart_df, times, primary),
        "periodic_returns": _periodic_returns(frames.get("1d")),
    }


async def get_symbol_detail(
    db: AsyncSession, symbol: str, interval: str = "1h", period: str | None = None
) -> dict[str, Any] | None:
    symbol = symbol.upper()
    cache_key = f"bist_market_stock_{symbol}_{interval}_{period or 'default'}"
    cached = await CacheService.get_json(cache_key)
    if cached:
        return cached

    rules = snapshot_rules(await get_active_rules(db))
    quote = (await quote_book.get_quotes([symbol])).get(symbol)  # refresh first: the chart overlays it
    chart_df, frames = await asyncio.gather(
        provider.fetch_historical_data(symbol=symbol, period=period, interval=interval),
        load_evaluation_frames(symbol, required_timeframes(rules)),
    )

    if chart_df is None or chart_df.empty:
        return None
    chart_df = chart_df.dropna(subset=["Open", "High", "Low", "Close"])
    if chart_df.empty:
        return None

    body, fundamentals = await asyncio.gather(
        asyncio.to_thread(_build_detail_body, chart_df, frames, rules),
        get_fundamentals(symbol, quote),
    )
    price = price_of_record(quote, frames.get("1d"), chart_df)

    payload = sanitize_for_json({
        "symbol": symbol,
        "name": stock_name(symbol),
        "interval": interval,
        "period": period,
        **price,
        "delay_minutes": quote.delay_minutes if quote else 15,
        "market_state": market_state(),
        **body,
        "fundamentals": fundamentals,
    })

    await CacheService.set_json(cache_key, payload, expiration=SYMBOL_CACHE_TTL_SECONDS)
    return payload
