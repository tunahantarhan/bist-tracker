"""Backtest of the primary filter's second step on 5m bars: a closed 5m bar above its MA(N).

The main backtest (`backtest_primary_filter`) covers two years but only has hourly bars,
so it cannot model the 5m MA(20) confirmation. Yahoo keeps 5m bars for ~60 days only;
this script reads the candle masters the live pipeline already holds in Redis (L2,
`candles_v1:*`, no Yahoo calls) and replays the last month:

1. RSI trendline signals on closed primary-timeframe bars (walk-forward, same definition
   as live scoring and the main backtest).
2. For each new signal: the first closed 5m bar after the signal bar whose close is above
   its N-bar SMA, until the close of the `window`-th next session (live default 1).
3. Returns after 1 and 5 sessions from the RSI bar's close and from the confirming bar's
   close; confirmed vs unconfirmed signals.

    python -m app.scripts.backtest_ma_confirmation
    python -m app.scripts.backtest_ma_confirmation --length 20 --window 1 --set min_peak=65

The sample is small (one month); read it as a first look, not a verdict.
"""

import argparse
import asyncio
import json
import pickle
import zlib

import numpy as np
import pandas as pd
from redis import asyncio as aioredis

from app.core.config import settings
from app.providers.yfinance_provider import L2_PREFIX, four_hour_labels, resample
from app.scripts.backtest_primary_filter import CACHE_DIR, forward_metrics, load_universe_and_rule, onsets, peak_and_breakout
from app.services.rule_engine import RuleEngine


def confirm_bar(m5: pd.DataFrame, after: pd.Timestamp, length: int, window: int) -> int | None:
    """Position of the first 5m bar starting at/after `after` that closed above its SMA(length),
    within `window` sessions after the signal's session (0 = same day)."""
    close = m5["Close"].astype(float)
    ma = RuleEngine.get_indicator_series(m5, "SMA", {"length": length})
    days = m5.index.normalize()
    sessions = days.unique()
    k = sessions.searchsorted(after.normalize()) + window
    limit_day = sessions[min(k, len(sessions) - 1)]
    start = m5.index.searchsorted(after)
    c, a = close.to_numpy(dtype=float), ma.to_numpy(dtype=float)
    for j in range(start, len(m5)):
        if days[j] > limit_day:
            break
        if not np.isnan(a[j]) and c[j] > a[j]:
            return j
    return None


def analyse(symbol: str, frames: dict, rule, length: int, window: int, since: pd.Timestamp, min_gap: int) -> list[dict]:
    hourly, m5, daily = frames.get("1h"), frames.get("5m"), frames.get("1d")
    if hourly is None or m5 is None or daily is None or len(m5) < length + 10:
        return []
    frame = resample(hourly, "4h") if rule.timeframe == "4h" else hourly
    if len(frame) < rule.lookback + 40:
        return []
    close = frame["Close"].astype(float)
    pb = peak_and_breakout(close, rule)
    met = (pb["breakout"] & (pb["peak"] >= float(rule.params["min_peak"]))).to_numpy()
    labels = four_hour_labels(hourly.index) if rule.timeframe == "4h" else hourly.index
    last_hour = pd.Series(hourly.index, index=labels).groupby(level=0).last()
    daily_n = daily.copy()
    daily_n.index = daily_n.index.normalize()
    bench = pd.Series(dtype=float)

    rows = []
    for i in onsets(met, min_gap):
        ts = frame.index[i]
        if ts < since:
            continue  # no 5m history to confirm against
        bar_end = last_hour.get(ts, ts) + pd.Timedelta(hours=1)
        entry = float(close.iloc[i])
        row = {"symbol": symbol, "time": ts.isoformat(), "stage": pb["stage"].iloc[i], "entry": entry,
               **{f"rsi_{k}": v for k, v in forward_metrics(ts, entry, daily_n, bench).items() if k.startswith("ret")}}
        j = confirm_bar(m5, bar_end, length, window)
        row["confirmed"] = j is not None
        if j is not None:
            cts, cprice = m5.index[j], float(m5["Close"].iloc[j])
            row.update({"confirm_time": cts.isoformat(), "confirm_price": cprice,
                        # trading time from the signal bar's close: 5m bars in between
                        "wait_minutes": int((j - m5.index.searchsorted(bar_end)) * 5),
                        "same_session": cts.normalize() == bar_end.normalize(),
                        **{f"ma_{k}": v for k, v in forward_metrics(cts, cprice, daily_n, bench).items() if k.startswith("ret")}})
        rows.append(row)
    return rows


def stats(series: pd.Series) -> dict:
    s = series.dropna()
    return {"n": int(len(s)), "mean": round(s.mean(), 2) if len(s) else None,
            "median": round(s.median(), 2) if len(s) else None,
            "hit": round((s > 0).mean() * 100, 1) if len(s) else None}


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--length", type=int, default=20, help="5m bars in the average")
    parser.add_argument("--window", type=int, default=1, help="sessions after the signal's session")
    parser.add_argument("--min-gap-bars", type=int, default=2)
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    args = parser.parse_args()

    symbols, rule = await load_universe_and_rule(dict(kv.split("=", 1) for kv in args.set))
    redis = aioredis.from_url(settings.redis_url)
    data: dict[str, dict] = {}
    for sym in symbols:
        blob = await redis.get(L2_PREFIX + f"{sym}.IS")
        if blob:
            data[sym] = {iv: v[0] for iv, v in pickle.loads(zlib.decompress(blob)).items()}
    await redis.aclose()
    starts = sorted(d["5m"].index[0] for d in data.values() if "5m" in d and len(d["5m"]))
    if not starts:
        raise SystemExit("No 5m candles in Redis; run the API (it fills the L2 cache) first")
    # skip the first day: the 5m average needs `length` bars of history
    since = starts[len(starts) // 2].normalize() + pd.Timedelta(days=1)
    print(f"Primary rule {rule.timeframe}, min_peak {rule.params['min_peak']:g}; {len(data)} symbols; "
          f"5m MA({args.length}), window {args.window}; signals from {since:%Y-%m-%d}")

    rows = []
    for sym, frames in data.items():
        rows.extend(await asyncio.to_thread(analyse, sym, frames, rule, args.length, args.window, since, args.min_gap_bars))
    df = pd.DataFrame(rows)
    if df.empty:
        raise SystemExit("No RSI signals in the period")
    conf, unconf = df[df.confirmed], df[~df.confirmed]
    summary = {
        "signals": int(len(df)), "confirmed": int(len(conf)),
        "confirmed_pct": round(len(conf) / len(df) * 100, 1),
        "median_wait_trading_minutes": int(conf["wait_minutes"].median()) if len(conf) else None,
        "confirmed_first_bar_pct": round((conf["wait_minutes"] == 0).mean() * 100, 1) if len(conf) else None,
        "confirmed_same_session_pct": round(conf["same_session"].mean() * 100, 1) if len(conf) else None,
        "all_from_rsi_close": {h: stats(df[f"rsi_ret_{h}d"]) for h in (1, 5)},
        "confirmed_from_rsi_close": {h: stats(conf[f"rsi_ret_{h}d"]) for h in (1, 5)},
        "confirmed_from_confirm_bar": {h: stats(conf.get(f"ma_ret_{h}d", pd.Series(dtype=float))) for h in (1, 5)},
        "unconfirmed_from_rsi_close": {h: stats(unconf[f"rsi_ret_{h}d"]) for h in (1, 5)},
        "meta": {"since": since.isoformat(), "length": args.length, "window": args.window, "rule": rule.__dict__},
    }
    df.to_csv(CACHE_DIR / "ma_confirmation_signals.csv", index=False)
    (CACHE_DIR / "ma_confirmation_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    print(json.dumps({k: v for k, v in summary.items() if k != "meta"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
