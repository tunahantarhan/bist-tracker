"""How often does a primary-filter signal seen inside a forming bar survive the bar's close?

The live scan evaluates the RSI trendline on the last, still forming bar (the live quote is
its close), so a signal can appear mid-bar and be gone when the bar closes ("repaint";
the consultant's "sinyaller girip çıkıyor"). This replays the last ~2 years from the
backtest cache: for every primary-timeframe bar, the forming bar is rebuilt at every
hourly step inside it and the rule is evaluated exactly like a live scan would; then the
first intrabar signal is compared with the closed-bar result.

    python -m app.scripts.measure_intrabar_signals            # uses backend/.cache/backtest
    python -m app.scripts.measure_intrabar_signals --limit 50 --set min_peak=65

Outcomes per intrabar signal (only bars where the previous closed bar had no signal):
  kept     - the bar closed with the signal still valid
  late     - gone at the close, but valid again on one of the next two closed bars
  phantom  - gone at the close and not back within two bars
Plus `close_only`: signals that exist only at the close (never visible inside the bar).
Forward returns are measured from the intrabar signal price (what a trader acting on the
alert would get) and, for comparison, from the closed bar's price.
"""

import argparse
import asyncio
import json
import os
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.providers.yfinance_provider import align_scale_breaks, four_hour_labels, reconcile_session_closes, resample
from app.scripts.backtest_primary_filter import (
    BENCHMARK, CACHE_DIR, PrimaryRule, _download, forward_metrics, load_universe_and_rule, peak_and_breakout,
)
from app.services.rule_engine import RuleEngine

LATE_BARS = 2


def _wilder_state(close: pd.Series, length: int) -> tuple[np.ndarray, np.ndarray]:
    """Average gain / loss after every bar, exactly as pandas_ta's RSI (RMA = ewm, adjust=False)."""
    diff = close.diff()
    alpha = 1.0 / length
    gain = diff.clip(lower=0).ewm(alpha=alpha, adjust=False).mean().to_numpy(dtype=float)
    loss = (-diff.clip(upper=0)).ewm(alpha=alpha, adjust=False).mean().to_numpy(dtype=float)
    return gain, loss


def _forming_rsi(gain_prev: float, loss_prev: float, prev_close: float, close: float, length: int) -> float:
    alpha = 1.0 / length
    d = close - prev_close
    g = gain_prev * (1 - alpha) + max(d, 0.0) * alpha
    l = loss_prev * (1 - alpha) + max(-d, 0.0) * alpha
    return 100.0 * g / (g + l) if g + l > 0 else 50.0


def _valid(rsi: np.ndarray, params: dict, min_peak: float) -> bool:
    try:
        sig = RuleEngine.trendline_signal(rsi, params)
    except ValueError:
        return False
    return bool(sig["valid"]) and sig["y1"] >= min_peak


def analyse(args: tuple) -> dict:
    symbol, hourly, daily, bench, rule = args
    daily, hourly, _ = align_scale_breaks(daily, hourly)
    hourly = reconcile_session_closes(hourly, daily, before=pd.Timestamp.now(tz=hourly.index.tz).normalize())
    four_h = rule.timeframe == "4h"
    frame = resample(hourly, "4h") if four_h else hourly
    out = {"symbol": symbol, "rows": [], "close_only": 0, "closed_signals": 0}
    if len(frame) < rule.lookback + 40 or four_h is False:
        return out
    close = frame["Close"].astype(float)
    length = rule.length
    min_peak = float(rule.params["min_peak"])
    params = {**rule.params, "min_peak": 0.0}
    pb = peak_and_breakout(close, rule)
    closed_valid = (pb["breakout"] & (pb["peak"] >= min_peak)).to_numpy()
    rsi = ta.rsi(close, length=length).to_numpy(dtype=float)
    gain, loss = _wilder_state(close, length)
    closes = close.to_numpy(dtype=float)

    labels = four_hour_labels(hourly.index)
    groups = pd.Series(np.arange(len(hourly)), index=labels).groupby(level=0).apply(list)
    h_close = hourly["Close"].to_numpy(dtype=float)
    daily_n = daily.copy()
    daily_n.index = daily_n.index.normalize()

    warmup = length + 20
    for i in range(max(warmup, 1), len(frame)):
        if closed_valid[i - 1]:
            continue  # already a signal: a live scan would not see a new one here
        positions = groups.get(frame.index[i], [])
        fired = None
        for pos in positions[:-1]:  # the last hourly step is the bar's close
            r = _forming_rsi(gain[i - 1], loss[i - 1], closes[i - 1], h_close[pos], length)
            arr = np.concatenate([rsi[:i], [r]])
            if _valid(arr, params, min_peak):
                fired = pos
                break
        if closed_valid[i]:
            out["closed_signals"] += 1
        if fired is None:
            if closed_valid[i]:
                out["close_only"] += 1
            continue
        if closed_valid[i]:
            outcome = "kept"
        elif closed_valid[i + 1: i + 1 + LATE_BARS].any():
            outcome = "late"
        else:
            outcome = "phantom"
        ts = hourly.index[fired]
        m_fire = forward_metrics(ts, float(h_close[fired]), daily_n, bench)
        m_close = forward_metrics(frame.index[i], float(closes[i]), daily_n, bench)
        out["rows"].append({
            "symbol": symbol, "time": ts.isoformat(), "outcome": outcome,
            "ret_5d": m_fire.get("ret_5d"), "ret_20d": m_fire.get("ret_20d"),
            "close_ret_5d": m_close.get("ret_5d"),
        })
    return out


def summarise(rows: pd.DataFrame, close_only: int, closed_signals: int) -> dict:
    total = len(rows)
    res = {"intrabar_signals": total, "closed_bar_signals": closed_signals, "close_only": close_only, "outcomes": {}}
    for outcome in ("kept", "late", "phantom"):
        sub = rows[rows.outcome == outcome]
        r5 = sub["ret_5d"].dropna()
        res["outcomes"][outcome] = {
            "count": int(len(sub)),
            "share_pct": round(len(sub) / total * 100, 1) if total else None,
            "mean_5d": round(r5.mean(), 2) if len(r5) else None,
            "hit_5d": round((r5 > 0).mean() * 100, 1) if len(r5) else None,
        }
    kept = rows[rows.outcome == "kept"]
    both = kept[["ret_5d", "close_ret_5d"]].dropna()
    res["kept_entry_vs_close_5d"] = {
        "intrabar_mean": round(both["ret_5d"].mean(), 2) if len(both) else None,
        "close_mean": round(both["close_ret_5d"].mean(), 2) if len(both) else None,
    }
    return res


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = parser.parse_args()

    symbols, rule = await load_universe_and_rule(dict(kv.split("=", 1) for kv in args.set))
    if args.limit:
        symbols = symbols[: args.limit]
    print(f"Primary rule: {rule.timeframe}, min_peak {rule.params['min_peak']:g}; {len(symbols)} symbols")
    bench_data = await _download(BENCHMARK, False)
    bench = bench_data[1]["Close"].astype(float)
    bench.index = bench.index.normalize()

    jobs = []
    for sym in symbols:
        if not (CACHE_DIR / f"{sym}.pkl").exists():
            continue  # offline only: never hits Yahoo
        got = await _download(sym, False)
        if got is not None:
            jobs.append((sym, got[0], got[1], bench, rule))

    rows, close_only, closed_signals = [], 0, 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        for k, res in enumerate(pool.map(analyse, jobs, chunksize=4), 1):
            rows.extend(res["rows"])
            close_only += res["close_only"]
            closed_signals += res["closed_signals"]
            if k % 100 == 0:
                print(f"  {k}/{len(jobs)}")

    df = pd.DataFrame(rows, columns=["symbol", "time", "outcome", "ret_5d", "ret_20d", "close_ret_5d"])
    summary = summarise(df, close_only, closed_signals)
    summary["meta"] = {"symbols": len(jobs), "rule": rule.__dict__, "late_bars": LATE_BARS}
    df.to_csv(CACHE_DIR / "intrabar_signals.csv", index=False)
    (CACHE_DIR / "intrabar_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    print(json.dumps({k: v for k, v in summary.items() if k != "meta"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
