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
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Sequence

import numpy as np
import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.default_rules import PRIMARY_TRENDLINE_PARAMS
from app.core.market_hours import market_state, now_tr, session_close_after
from app.core.stock_catalog import STOCK_CATALOG
from app.models.rule import Rule
from app.models.universe import UniverseStock
from app.providers.quotes import Quote, quote_book
from app.providers.yahoo_gateway import background_lane
from app.providers.yfinance_provider import YFinanceProvider, four_hour_labels
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
# N-day average of intraday bars (SMA_DAYS rules)
DAY_AVERAGE_INDICATOR = "SMA_DAYS"
DAY_AVERAGE_COLOR = "#eab308"
CONFIRM_COLOR = "#f97316"  # the primary filter's second-step average
TF_LABELS = {"5m": "5dk", "15m": "15dk", "1h": "1s"}
LINE_COLORS = ["#3b82f6", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16", "#14b8a6", "#f43f5e"]

# Second step of the primary filter: after the RSI signal the stock is "armed"; it becomes a
# signal once price is above the N-bar moving average of 5m bars (the consultant's "20'lik
# ortalama" on the 5m chart) within the waiting window.
ARMED_STATE_KEY = "primary_armed_v3"  # v1: 20-day average, v2: live price instead of closed bars
CONFIRM_DEFAULTS = {"confirm_ma_length": 0, "confirm_ma_timeframe": "5m", "confirm_window_sessions": 1}
LEGACY_CONFIRM_LENGTH = 20  # rules saved with the old `confirm_ma_days` keep the step on
CONFIRM_TIMEFRAMES = ("5m", "15m", "1h")

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


def detail_timeframes(rules: Sequence[Any]) -> set[str]:
    """Evaluation frames plus hourly bars for day-average lines (5m history is only ~1 month)
    and the second step's frame for its chart line."""
    tfs = required_timeframes(rules)
    uses_day_average = any(
        DAY_AVERAGE_INDICATOR in ((r.indicator_1 or "").upper(), (r.indicator_2 or "").upper()) for r in rules
    )
    if uses_day_average:
        tfs.add("1h")
    confirm = confirm_settings(get_primary_rule(rules))
    if confirm.enabled:
        tfs.add(confirm.timeframe)
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


@dataclass(frozen=True)
class ConfirmSettings:
    """Second step of the primary filter: price above the `length`-bar SMA of `timeframe` bars
    within `window` sessions after the RSI signal (0 = until that session's close)."""
    length: int = 0
    timeframe: str = "5m"
    window: int = 1

    @property
    def enabled(self) -> bool:
        return self.length > 0

    @property
    def label(self) -> str:
        return f"{TF_LABELS.get(self.timeframe, self.timeframe)} MA({self.length})"


def confirm_settings(primary: Any | None) -> ConfirmSettings:
    params = {**CONFIRM_DEFAULTS, **((primary.indicator_2_params or {}) if primary else {})}
    try:
        length = int(float(params["confirm_ma_length"] or 0))
        if length <= 0 and float(params.get("confirm_ma_days") or 0) > 0:
            length = LEGACY_CONFIRM_LENGTH
        timeframe = str(params["confirm_ma_timeframe"] or "5m")
        window = int(float(params["confirm_window_sessions"] or 0))
    except (TypeError, ValueError):
        return ConfirmSettings()
    if timeframe not in CONFIRM_TIMEFRAMES:
        timeframe = "5m"
    return ConfirmSettings(max(0, length), timeframe, max(0, window))


def confirm_average_series(df: pd.DataFrame | None, length: int) -> pd.Series | None:
    if df is None or df.empty:
        return None
    return RuleEngine.get_indicator_series(df, "SMA", {"length": length})


def closed_bar_check(df: pd.DataFrame | None, length: int, market_open: bool) -> dict[str, Any] | None:
    """Close and average of the last *closed* bar. While the market is open the last bar is
    still forming (the live quote is overlaid on it), so a price that only ticks a kuruş over
    the line does not count: the bar has to close above its average."""
    ma = confirm_average_series(df, length)
    if ma is None:
        return None
    closes = df["Close"].astype(float)
    if market_open and len(closes) > 1:
        closes, ma = closes.iloc[:-1], ma.iloc[:-1]
    valid = ma.notna() & closes.notna()
    if not valid.any():
        return None
    ts = valid[valid].index[-1]
    close, average = float(closes.loc[ts]), float(ma.loc[ts])
    return {"bar": pd.Timestamp(ts).isoformat(), "close": round(close, 4), "average": round(average, 4), "above": close > average}


async def confirm_check(symbol: str, settings: ConfirmSettings) -> dict[str, Any] | None:
    """Second-step check on the latest closed bar of the confirmation timeframe."""
    try:
        df = await provider.fetch_historical_data(
            symbol=symbol, interval=settings.timeframe, period=EVALUATION_PERIODS.get(settings.timeframe, "1mo")
        )
    except Exception as e:
        logger.debug("MA confirmation frame %s/%s unavailable: %s", symbol, settings.timeframe, e)
        return None
    return closed_bar_check(df, settings.length, market_state() != "closed")


def _confirm_payload(settings: ConfirmSettings, check: dict[str, Any] | None, arm: dict[str, Any] | None) -> dict[str, Any]:
    """What the UI and the alert show about the second step. `last_*` is the latest closed bar,
    `confirm_*` the bar that confirmed the signal (kept for the rest of the window)."""
    check = check or {}
    arm = arm or {}
    return {
        "length": settings.length, "timeframe": settings.timeframe, "label": settings.label,
        "window_sessions": settings.window,
        "average": check.get("average"),
        "last_close": check.get("close"), "last_bar": check.get("bar"), "above": check.get("above"),
        "armed_at": arm.get("armed_at"), "deadline": arm.get("deadline"), "rsi_price": arm.get("rsi_price"),
        "confirmed_at": arm.get("confirmed_at"), "confirm_bar": arm.get("confirm_bar"),
        "confirm_close": arm.get("confirm_close"), "confirm_average": arm.get("confirm_average"),
    }


def primary_filter_info(primary: Any | None) -> dict[str, Any] | None:
    """Parameters of both steps, so the UI can explain the filter with the live settings."""
    if primary is None:
        return None
    p = RuleEngine.trendline_params(primary.indicator_2_params)  # exactly what the rule engine uses
    confirm = confirm_settings(primary)
    return {
        "name": primary.name, "timeframe": primary.timeframe,
        "lookback": p["lookback"], "min_peak": p["min_peak"], "max_trend_end": p["max_trend_end"],
        "confirm_bars": p["confirm_bars"], "max_bars_since_break": p["max_bars_since_break"],
        "near_gap": p["near_gap"],
        "confirm": {"length": confirm.length, "timeframe": confirm.timeframe, "label": confirm.label,
                    "window_sessions": confirm.window} if confirm.enabled else None,
    }


async def _armed_state() -> dict[str, dict[str, Any]]:
    state = await CacheService.get_json(ARMED_STATE_KEY) or {}
    now = time.time()
    return {sym: a for sym, a in state.items() if a.get("deadline", 0) > now}


async def apply_primary_confirmation(items: list[dict[str, Any]], primary: Any | None) -> None:
    """Turns the RSI stage into the final primary filter result (in place).

    `primary_rsi_passed` is the RSI breakout itself; it arms the stock for
    `confirm_window_sessions` sessions. `primary_filter_passed` becomes True once a 5m bar
    closes above its `confirm_ma_length`-bar average while armed, and stays True for the
    rest of the window (`signal_ttl` lets alerts fire once per arming). Armed stocks that are
    still waiting for that bar are listed as `primary_waiting`.
    """
    settings = confirm_settings(primary)
    window = settings.window
    for item in items:
        item["primary_rsi_passed"] = bool(item.get("primary_filter_passed"))
    if primary is None or not settings.enabled:
        return

    state = await _armed_state()
    now = time.time()
    for item in items:
        sym = item["symbol"]
        arm = state.get(sym)
        if item["primary_rsi_passed"] and arm is None:
            arm = state[sym] = {
                "armed_at": now,
                "deadline": session_close_after(now_tr(), window).timestamp(),
                "rsi_price": item.get("current_price"),
            }
        item["primary_filter_passed"] = False
        if arm is None:
            continue
        check = await confirm_check(sym, settings)
        if check and check["above"] and not arm.get("confirmed_at"):
            arm.update(confirmed_at=now, confirm_bar=check["bar"], confirm_close=check["close"],
                       confirm_average=check["average"])
        item["primary_filter_passed"] = bool(arm.get("confirmed_at"))
        item["primary_confirm"] = _confirm_payload(settings, check, arm)
        item["signal_ttl"] = max(60, int(arm["deadline"] - now))
    await CacheService.set_json(ARMED_STATE_KEY, state, expiration=(window + 4) * 86400)


async def primary_confirmation_status(symbol: str, primary: Any | None) -> dict[str, Any] | None:
    """Read-only view of the second step for the detail page (arming happens in scans)."""
    settings = confirm_settings(primary)
    if primary is None or not settings.enabled:
        return None
    arm = (await _armed_state()).get(symbol)
    return _confirm_payload(settings, await confirm_check(symbol, settings), arm)


def _build_payload(items: list[dict[str, Any]], primary_tf: str, quotes: dict[str, Quote], **extra: Any) -> dict[str, Any]:
    return sanitize_for_json({
        "items": items,
        "rsi_passed": sorted(
            [i for i in items if i["has_primary_filter"] and i["primary_filter_passed"]],
            key=lambda x: x["score"],
            reverse=True,
        ),
        # RSI signal given, waiting for a 5m bar to close above the average
        "primary_waiting": sorted(
            [i for i in items if i.get("primary_confirm") and not i["primary_filter_passed"]],
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
    await apply_primary_confirmation(items, primary)
    _scan_state["last_duration"] = round(time.time() - started, 1)
    _scan_state["partial"] = []
    return _build_payload(
        items, primary_tf, quotes, scan_seconds=_scan_state["last_duration"], universe_size=len(symbols),
        primary_filter=primary_filter_info(primary),
    )


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
        "primary_waiting": slim(payload.get("primary_waiting", [])),
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


def align_to_chart(series: pd.Series, chart_index: pd.DatetimeIndex, interval: str) -> pd.Series:
    """Value of a finer-grained series at the close of every chart bar (the last value that
    falls inside the bar). Chart bars are labelled by their start, except BIST 4h session bars."""
    series = series.dropna()
    if series.empty or chart_index.empty:
        return pd.Series(np.nan, index=chart_index)
    daily_chart = bool((chart_index == chart_index.normalize()).all())
    if interval == "4h" and not daily_chart:
        labels = four_hour_labels(series.index)
    else:
        pos = chart_index.searchsorted(series.index, side="right") - 1
        series = series[pos >= 0]
        labels = chart_index[pos[pos >= 0]]
    per_bar = series.groupby(labels).last()
    return per_bar.reindex(chart_index)


def day_average_series(frames: dict[str, pd.DataFrame], timeframe: str, days: int) -> pd.Series | None:
    """N-day average of the rule's intraday closes. Yahoo keeps only ~1 month of 5m bars, so the
    part before the first full N-day window is filled from hourly bars (same average, coarser)."""
    parts: list[pd.Series] = []
    for tf in dict.fromkeys((timeframe, "1h")):
        df = frames.get(tf)
        if tf not in ("5m", "15m", "1h") or df is None or df.empty:
            continue
        ma = RuleEngine.session_sma(df["Close"].dropna().astype(float), days).dropna()
        if parts and not parts[0].empty:
            ma = ma[ma.index < parts[0].index[0]]
        parts.append(ma)
    parts = [p for p in parts if not p.empty]
    return pd.concat(parts).sort_index() if parts else None


def _day_average_overlays(
    chart_df: pd.DataFrame, times: list[str], rules: Sequence[Any], frames: dict[str, pd.DataFrame], interval: str
) -> list[dict[str, Any]]:
    overlays: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for rule in rules:
        pairs = [(rule.indicator_1, rule.indicator_1_params)]
        if rule.target_type == "indicator" and rule.indicator_2:
            pairs.append((rule.indicator_2, rule.indicator_2_params))
        for name, params in pairs:
            if (name or "").upper() != DAY_AVERAGE_INDICATOR:
                continue
            params = params or {}
            days = int(params.get("days", params.get("length", 20)))
            tf = rule.timeframe or "5m"
            if (tf, days) in seen:
                continue
            seen.add((tf, days))
            try:
                series = day_average_series(frames, tf, days)
                aligned = align_to_chart(series, chart_df.index, interval) if series is not None else None
            except Exception as e:
                logger.debug("Day average overlay %s/%s skipped: %s", tf, days, e)
                continue
            overlays.append({
                "name": f"Ort. {days}G ({TF_LABELS.get(tf, tf)})",
                "color": DAY_AVERAGE_COLOR,
                "data": _series_points(times, aligned),
            })
    return overlays


def _confirm_overlay(
    chart_df: pd.DataFrame, times: list[str], rules: Sequence[Any], frames: dict[str, pd.DataFrame], interval: str
) -> list[dict[str, Any]]:
    """The second step's average: drawn from the chart's own bars on its timeframe, otherwise
    its value at the close of every chart bar."""
    settings = confirm_settings(get_primary_rule(rules))
    if not settings.enabled:
        return []
    try:
        if interval == settings.timeframe:
            series = confirm_average_series(chart_df, settings.length)
        else:
            series = confirm_average_series(frames.get(settings.timeframe), settings.length)
            series = align_to_chart(series, chart_df.index, interval) if series is not None else None
    except Exception as e:
        logger.debug("Confirmation overlay skipped: %s", e)
        return []
    if series is None:
        return []
    return [{"name": f"Teyit {settings.label}", "color": CONFIRM_COLOR, "data": _series_points(times, series)}]


def _build_overlays(
    chart_df: pd.DataFrame,
    times: list[str],
    rules: Sequence[Any],
    frames: dict[str, pd.DataFrame] | None = None,
    interval: str = "1d",
) -> list[dict[str, Any]]:
    # the second step's average first: it is the reference line of the primary filter
    overlays = _confirm_overlay(chart_df, times, rules, frames or {}, interval)
    overlays += _day_average_overlays(chart_df, times, rules, frames or {}, interval)
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
    if not checks.get("steep", True):
        return f"Çizgi çok yatık (eğim {meta.get('slope')}, en az -{p['min_slope']:g})"
    if meta.get("stage") == "near":
        return f"Kesmeye yakın · çizginin {meta.get('near_gap')} puan altında, RSI yükseliyor"
    ago = meta.get("break_bars_ago")
    if ago is None:
        gap = meta.get("near_gap")
        return f"Kırılım bekleniyor (çizgiye {gap:g} puan)" if gap is not None and gap > 0 else "Kırılım bekleniyor"
    if not checks.get("rsi_dip", True):
        return f"RSI dibi {meta.get('rsi_dip')} · en fazla {p['max_rsi_dip']:g} olmalı"
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


def _build_detail_body(
    chart_df: pd.DataFrame, frames: dict[str, pd.DataFrame], rules: list[Any], interval: str
) -> dict[str, Any]:
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
        "indicators": _build_overlays(chart_df, times, rules, frames, interval),
        "rsi_pane": _build_rsi_pane(chart_df, times, primary),
        "periodic_returns": _periodic_returns(frames.get("1d")),
    }


async def get_symbol_detail(
    db: AsyncSession, symbol: str, interval: str = "4h", period: str | None = None
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
        load_evaluation_frames(symbol, detail_timeframes(rules)),
    )

    if chart_df is None or chart_df.empty:
        return None
    chart_df = chart_df.dropna(subset=["Open", "High", "Low", "Close"])
    if chart_df.empty:
        return None

    body, fundamentals, confirm = await asyncio.gather(
        asyncio.to_thread(_build_detail_body, chart_df, frames, rules, interval),
        get_fundamentals(symbol, quote),
        primary_confirmation_status(symbol, get_primary_rule(rules)),
    )
    body["primary_rsi_passed"] = body["primary_filter_passed"]
    if confirm is not None:  # second step enabled: the filter passes once the average is crossed
        body["primary_filter_passed"] = bool(confirm["confirmed_at"])
        body["primary_confirm"] = confirm
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
