"""Walk-forward backtest of the primary filter (RSI descending-trendline breakout).

Answers "which `min_peak` threshold should we use?" with data instead of anecdotes:
for every stock in the active universe and every closed bar of the last ~2 years, the
primary rule is evaluated using only the data available at that bar (no look-ahead),
for several `min_peak` values at once. Each new signal is then followed for 1, 5 and
20 trading days and compared with BIST 100 over the same window.

    python -m app.scripts.backtest_primary_filter                       # thresholds 55,60,62.5,65,70
    python -m app.scripts.backtest_primary_filter --thresholds 60,65 --refresh

Price data is downloaded once (through the shared rate limiter) and cached under
`backend/.cache/backtest/`; reruns are offline. Outputs `signals.csv` and
`summary.json` there and prints a Markdown summary.

Caveats (also printed): survivorship bias (today's listings only), closed-bar signals
(live scoring may fire inside a bar), no commissions/slippage, overlapping windows.
"""

import argparse
import asyncio
import json
import math
import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import pandas_ta as ta
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.default_rules import PRIMARY_TRENDLINE_PARAMS
from app.models.rule import Rule
from app.models.universe import UniverseStock
from app.providers.yahoo_gateway import RateLimitedError, gateway
from app.providers.yfinance_provider import _history_sync, align_scale_breaks, reconcile_session_closes, resample
from app.services.rule_engine import RuleEngine

CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "backtest"
BENCHMARK = "XU100.IS"
HORIZONS = (1, 5, 20)
DEFAULT_THRESHOLDS = (55.0, 60.0, 62.5, 65.0, 70.0)
LIQUID_TURNOVER_TL = 50_000_000  # median daily turnover (close x volume) over 20 sessions
DATA_INTEGRITY_GAP = math.log(1.15)  # entry vs same-session daily close (price limit is 10%)
skipped_bad_data = [0]
TARGET_GAIN_PCT = 2.0  # "did it rise 2% within 5 sessions?" (consultant's informal yardstick)


@dataclass
class PrimaryRule:
    timeframe: str
    length: int
    lookback: int
    max_trend_end: float


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

async def _download(symbol: str, refresh: bool) -> tuple[pd.DataFrame, pd.DataFrame] | None:
    path = CACHE_DIR / f"{symbol}.pkl"
    if path.exists() and not refresh:
        return pickle.loads(path.read_bytes())
    ysym = symbol if symbol.endswith(".IS") else f"{symbol}.IS"
    for attempt in range(6):
        try:
            hourly = await gateway.call(_history_sync, ysym, "2y", "1h")
            daily = await gateway.call(_history_sync, ysym, "5y", "1d")
            break
        except RateLimitedError:
            await asyncio.sleep(max(5, gateway.stats()["breaker_seconds_left"]) + attempt * 5)
        except Exception as e:
            print(f"  {symbol}: download failed ({e})")
            return None
    else:
        return None
    if hourly.empty or daily.empty:
        return None
    path.write_bytes(pickle.dumps((hourly, daily)))
    return hourly, daily


async def load_universe_and_rule() -> tuple[list[str], PrimaryRule]:
    async with AsyncSessionLocal() as db:
        symbols = list((await db.execute(
            select(UniverseStock.symbol).where(UniverseStock.is_active.is_(True)).order_by(UniverseStock.symbol)
        )).scalars().all())
        primary = (await db.execute(
            select(Rule).where(Rule.is_primary_filter.is_(True), Rule.is_active.is_(True))
        )).scalars().first()
    params = dict(PRIMARY_TRENDLINE_PARAMS)
    timeframe = "1h"
    if primary is not None:
        params.update(primary.indicator_2_params or {})
        timeframe = primary.timeframe or timeframe
    rule = PrimaryRule(
        timeframe=timeframe,
        length=int(params.get("length", 14)),
        lookback=int(params.get("lookback", 80)),
        max_trend_end=float(params.get("max_trend_end", 30.0)),
    )
    return symbols, rule


# ---------------------------------------------------------------------------
# Signal generation (walk-forward)
# ---------------------------------------------------------------------------

def peak_and_breakout(close: pd.Series, rule: PrimaryRule) -> pd.DataFrame:
    """Per bar: the trendline's main peak (y1) and whether RSI is above a low-enough line.

    The `min_peak` gate is the only part that depends on the threshold, so the
    (expensive) geometry is computed once per bar and every threshold is a cheap filter.
    """
    rsi = ta.rsi(close, length=rule.length)
    values = rsi.to_numpy(dtype=float)
    warmup = rule.length + 20
    peak = np.full(len(values), np.nan)
    breakout = np.zeros(len(values), dtype=bool)
    for t in range(warmup, len(values)):
        prefix = values[: t + 1]  # RSI (Wilder RMA) is causal: prefix values equal a fresh computation
        try:
            x1, y1, slope, *_ = RuleEngine.trendline_geometry(prefix, rule.lookback)
        except ValueError:
            continue
        tip = min(100.0, max(0.0, y1 + slope * (t - x1)))
        peak[t] = y1
        breakout[t] = bool(values[t] > tip and tip <= rule.max_trend_end)
    return pd.DataFrame({"peak": peak, "breakout": breakout}, index=close.index)


def onsets(met: np.ndarray, min_gap: int) -> list[int]:
    """Bars where the condition turns true, ignoring re-triggers within `min_gap` bars."""
    out: list[int] = []
    last = -10**9
    for i in range(1, len(met)):
        if met[i] and not met[i - 1] and i - last >= min_gap:
            out.append(i)
            last = i
    return out


def forward_metrics(
    ts: pd.Timestamp, entry: float, daily: pd.DataFrame, bench: pd.Series
) -> dict[str, float | None]:
    """Returns after 1/5/20 sessions (session close), excess vs BIST 100, and 5-session MFE."""
    day = ts.normalize()
    pos = daily.index.searchsorted(day)  # signal session
    if pos >= len(daily) or daily.index[pos] != day:
        return {}
    closes = daily["Close"].to_numpy(dtype=float)
    highs = daily["High"].to_numpy(dtype=float)
    out: dict[str, float | None] = {}
    for h in HORIZONS:
        j = pos + h
        if j >= len(daily):
            out[f"ret_{h}d"] = out[f"excess_{h}d"] = None
            continue
        ret = (closes[j] / entry - 1) * 100
        out[f"ret_{h}d"] = ret
        d0, d1 = daily.index[pos], daily.index[j]
        if d0 in bench.index and d1 in bench.index:
            out[f"excess_{h}d"] = ret - (bench[d1] / bench[d0] - 1) * 100
        else:
            out[f"excess_{h}d"] = None
    window = highs[pos + 1: pos + 6]
    out["mfe_5d"] = (window.max() / entry - 1) * 100 if window.size else None
    return out


def analyse_symbol(
    symbol: str, hourly: pd.DataFrame, daily: pd.DataFrame, bench: pd.Series,
    rule: PrimaryRule, thresholds: list[float], min_gap: int,
) -> list[dict]:
    # same data hygiene as the live pipeline: split-adjustment alignment, closing-auction reconciliation
    daily, hourly, _ = align_scale_breaks(daily, hourly)
    hourly = reconcile_session_closes(hourly, daily, before=pd.Timestamp.now(tz=hourly.index.tz).normalize())
    frame = resample(hourly, "4h") if rule.timeframe == "4h" else hourly
    if len(frame) < rule.lookback + 40:
        return []
    close = frame["Close"].astype(float)
    pb = peak_and_breakout(close, rule)
    daily_n = daily.copy()
    daily_n.index = daily_n.index.normalize()
    # previous sessions only, so the liquidity bucket uses no same-day information
    turnover = (daily_n["Close"] * daily_n["Volume"]).rolling(20, min_periods=5).median().shift(1)

    rows: list[dict] = []
    for thr in thresholds:
        met = (pb["breakout"] & (pb["peak"] >= thr)).to_numpy()
        for i in onsets(met, min_gap):
            ts = frame.index[i]
            entry = float(close.iloc[i])
            metrics = forward_metrics(ts, entry, daily_n, bench)
            if not metrics:
                continue
            day_close = daily_n["Close"].get(ts.normalize())
            if day_close is None or abs(math.log(entry / day_close)) > DATA_INTEGRITY_GAP:
                skipped_bad_data[0] += 1  # residual vendor data error: entry not on the daily scale
                continue
            day = ts.normalize()
            rows.append({
                "threshold": thr,
                "symbol": symbol,
                "time": ts.isoformat(),
                "entry": round(entry, 4),
                "peak_rsi": round(float(pb["peak"].iloc[i]), 2),
                "turnover_tl": float(turnover.get(day, np.nan)) if day in turnover.index else None,
                **metrics,
            })
    return rows


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def summarise(df: pd.DataFrame, thresholds: list[float], sessions: int) -> list[dict]:
    out = []
    for thr in thresholds:
        for scope, sub in (("Tümü", df[df.threshold == thr]),
                           ("Likit", df[(df.threshold == thr) & (df.turnover_tl >= LIQUID_TURNOVER_TL)])):
            row: dict = {"threshold": thr, "scope": scope, "signals": int(len(sub)),
                         "per_day": round(len(sub) / sessions, 2) if sessions else None,
                         "symbols": int(sub.symbol.nunique())}
            for h in HORIZONS:
                r = sub[f"ret_{h}d"].dropna()
                e = sub[f"excess_{h}d"].dropna()
                row[f"mean_{h}d"] = round(r.mean(), 2) if len(r) else None
                row[f"median_{h}d"] = round(r.median(), 2) if len(r) else None
                row[f"hit_{h}d"] = round((r > 0).mean() * 100, 1) if len(r) else None
                row[f"excess_{h}d"] = round(e.mean(), 2) if len(e) else None
            mfe = sub["mfe_5d"].dropna()
            row["target_hit_5d"] = round((mfe >= TARGET_GAIN_PCT).mean() * 100, 1) if len(mfe) else None
            out.append(row)
    return out


def to_markdown(summary: list[dict]) -> str:
    head = ("| Eşik | Kapsam | Sinyal | Sinyal/gün | Hisse | 1G ort. | 1G isabet | 5G ort. | 5G medyan | "
            "5G isabet | 5G XU100'e göre | 20G ort. | 20G isabet | 5G içinde +%2 |")
    sep = "|" + "---|" * 14
    lines = [head, sep]
    for r in summary:
        def f(v, pct=True):
            return "–" if v is None else (f"{v:+.2f}%" if pct else f"{v}")
        lines.append(
            f"| {r['threshold']:g} | {r['scope']} | {r['signals']} | {r['per_day']} | {r['symbols']} | "
            f"{f(r['mean_1d'])} | {f(r['hit_1d'], False)}% | {f(r['mean_5d'])} | {f(r['median_5d'])} | "
            f"{f(r['hit_5d'], False)}% | {f(r['excess_5d'])} | {f(r['mean_20d'])} | {f(r['hit_20d'], False)}% | "
            f"{f(r['target_hit_5d'], False)}% |"
        )
    return "\n".join(lines)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--thresholds", default=",".join(f"{t:g}" for t in DEFAULT_THRESHOLDS))
    parser.add_argument("--refresh", action="store_true", help="re-download cached price data")
    parser.add_argument("--min-gap-bars", type=int, default=8, help="ignore re-triggers within N bars (8 = 1 session on 1h)")
    parser.add_argument("--limit", type=int, default=0, help="only the first N symbols (smoke test)")
    args = parser.parse_args()
    thresholds = sorted(float(t) for t in args.thresholds.split(","))

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    symbols, rule = await load_universe_and_rule()
    if args.limit:
        symbols = symbols[: args.limit]
    print(f"Primary rule: {rule}; {len(symbols)} symbols; thresholds {thresholds}")

    bench_data = await _download(BENCHMARK, args.refresh)
    if bench_data is None:
        raise SystemExit("Benchmark (XU100) data unavailable")
    bench = bench_data[1]["Close"].astype(float)
    bench.index = bench.index.normalize()

    data: dict[str, tuple[pd.DataFrame, pd.DataFrame]] = {}
    for i, sym in enumerate(symbols, 1):
        got = await _download(sym, args.refresh)
        if got is not None:
            data[sym] = got
        if i % 50 == 0:
            print(f"  data {i}/{len(symbols)}")

    rows: list[dict] = []
    first_bar, last_bar = None, None
    for i, (sym, (hourly, daily)) in enumerate(data.items(), 1):
        rows.extend(await asyncio.to_thread(analyse_symbol, sym, hourly, daily, bench, rule, thresholds, args.min_gap_bars))
        first_bar = min(first_bar or hourly.index[0], hourly.index[0])
        last_bar = max(last_bar or hourly.index[-1], hourly.index[-1])
        if i % 100 == 0:
            print(f"  analysed {i}/{len(data)}")

    df = pd.DataFrame(rows)
    if df.empty:
        raise SystemExit("No signals found")
    # sessions covered by the signal search (after indicator warm-up)
    sessions = int(((bench.index >= first_bar.normalize()) & (bench.index <= last_bar.normalize())).sum())
    summary = summarise(df, thresholds, sessions)

    df.to_csv(CACHE_DIR / "signals.csv", index=False)
    meta = {
        "rule": rule.__dict__, "thresholds": thresholds, "symbols": len(data), "sessions": sessions,
        "period": [first_bar.isoformat(), last_bar.isoformat()], "min_gap_bars": args.min_gap_bars,
        "liquid_turnover_tl": LIQUID_TURNOVER_TL, "target_gain_pct": TARGET_GAIN_PCT,
        "skipped_bad_data": skipped_bad_data[0],
    }
    (CACHE_DIR / "summary.json").write_text(json.dumps({"meta": meta, "summary": summary}, ensure_ascii=False, indent=2))

    print(f"\nPeriod {first_bar:%Y-%m-%d} → {last_bar:%Y-%m-%d}, {sessions} sessions, {len(data)} symbols, "
          f"{skipped_bad_data[0]} signals dropped by the data-integrity check\n")
    print(to_markdown(summary))
    print("\nNotlar: bugünkü listedeki hisseler (survivorship bias), kapanmış mum sinyalleri, komisyon/kayma yok, "
          "pencereler örtüşebilir. Giriş fiyatı = sinyal mumunun kapanışı.")


if __name__ == "__main__":
    asyncio.run(main())
