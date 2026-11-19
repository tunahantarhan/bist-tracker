"""Pure helpers of the market data pipeline (no network)."""

import asyncio
import time
from datetime import datetime

import numpy as np
import pytest
import pandas as pd

from app.core.market_hours import TR_TZ, last_session_close, market_state, next_session_open
from app.providers.quotes import Quote
from app.providers.yahoo_gateway import AsyncTokenBucket
from app.providers.yfinance_provider import (
    merge_days,
    overlay_quote,
    reconcile_session_closes,
    resample,
)
from app.scripts.sync_stock_catalog import prettify_name
from app.services.market_service import price_of_record, public_overview

TZ = "Europe/Istanbul"


def _bars(start: str, periods: int, freq: str, base: float = 100.0) -> pd.DataFrame:
    idx = pd.date_range(start, periods=periods, freq=freq, tz=TZ)
    close = base + np.arange(periods, dtype=float)
    return pd.DataFrame(
        {"Open": close - 0.5, "High": close + 1, "Low": close - 1, "Close": close, "Volume": np.full(periods, 10.0)},
        index=idx,
    )


def _quote(ts: str, price: float, **kw) -> Quote:
    return Quote(
        symbol="TEST.IS", price=price, prev_close=kw.get("prev_close", 100.0), open=kw.get("open"),
        high=kw.get("high"), low=kw.get("low"), volume=kw.get("volume"),
        time=int(pd.Timestamp(ts, tz=TZ).timestamp()), market_state="REGULAR", delay_minutes=15,
    )


# -- resampling ---------------------------------------------------------------

def test_resample_5m_to_1h_uses_yahoo_half_hour_bins():
    five = _bars("2026-11-12 09:55", 12, "5min")  # 09:55 .. 10:50
    hourly = resample(five, "1h")
    assert list(hourly.index.strftime("%H:%M")) == ["09:30", "10:30"]
    first = hourly.iloc[0]
    assert first["Open"] == five.iloc[0]["Open"]
    assert first["Close"] == five.loc["2026-11-12 10:25", "Close"]
    assert first["Volume"] == 7 * 10.0  # 09:55..10:25


def test_resample_5m_to_15m_aggregates_ohlcv():
    five = _bars("2026-11-12 10:00", 6, "5min")
    q = resample(five, "15m")
    assert len(q) == 2
    assert q.iloc[0]["High"] == five.iloc[:3]["High"].max()
    assert q.iloc[0]["Low"] == five.iloc[:3]["Low"].min()


# -- incremental merge --------------------------------------------------------

def test_merge_days_replaces_whole_days_and_keeps_history():
    old = _bars("2026-11-10 10:00", 3, "1D")
    old.index = pd.DatetimeIndex([pd.Timestamp(f"2026-11-{d} 10:00", tz=TZ) for d in (10, 11, 12)])
    new = _bars("2026-11-12 10:00", 2, "1h", base=500)
    merged = merge_days(old, new)
    assert merged.loc["2026-11-10"].iloc[0]["Close"] == 100.0  # untouched
    assert len(merged.loc["2026-11-12"]) == 2  # day replaced by delta
    assert merged.index.is_monotonic_increasing


# -- closing-auction reconciliation ------------------------------------------

def test_reconcile_folds_official_close_into_last_bar_of_past_days():
    intraday = _bars("2026-11-12 16:30", 3, "30min", base=319.0)  # last bar 17:30, close 321
    daily = pd.DataFrame(
        {"Open": [315.5], "High": [325.75], "Low": [315.5], "Close": [319.0], "Volume": [1.0]},
        index=pd.DatetimeIndex([pd.Timestamp("2026-11-12", tz=TZ)]),
    )
    out = reconcile_session_closes(intraday, daily, before=pd.Timestamp("2026-11-13 12:00", tz=TZ))
    assert out.iloc[-1]["Close"] == 319.0
    assert out.iloc[-1]["Low"] <= 319.0 <= out.iloc[-1]["High"]
    assert out.iloc[0]["Close"] == intraday.iloc[0]["Close"]  # only the session's last bar changes


def test_reconcile_leaves_current_session_to_the_quote():
    intraday = _bars("2026-11-13 10:30", 2, "1h", base=320.0)
    daily = pd.DataFrame(
        {"Open": [1.0], "High": [1.0], "Low": [1.0], "Close": [330.0], "Volume": [1.0]},
        index=pd.DatetimeIndex([pd.Timestamp("2026-11-13", tz=TZ)]),
    )
    out = reconcile_session_closes(intraday, daily, before=pd.Timestamp("2026-11-13 12:00", tz=TZ))
    pd.testing.assert_frame_equal(out, intraday)


# -- live quote overlay -------------------------------------------------------

def test_overlay_updates_last_bar_inside_its_window():
    df = _bars("2026-11-13 10:30", 2, "1h", base=320.0)  # last bar 11:30
    out = overlay_quote(df, "1h", _quote("2026-11-13 11:50", 330.0))
    assert len(out) == 2
    assert out.iloc[-1]["Close"] == 330.0 and out.iloc[-1]["High"] == 330.0


def test_overlay_appends_new_bar_when_a_new_interval_started():
    df = _bars("2026-11-13 10:30", 2, "1h", base=320.0)  # last bar 11:30-12:30
    out = overlay_quote(df, "1h", _quote("2026-11-13 12:40", 318.0))
    assert out.index[-1] == pd.Timestamp("2026-11-13 12:30", tz=TZ)
    assert out.iloc[-1]["Close"] == 318.0


def test_overlay_folds_closing_auction_into_last_bar():
    df = _bars("2026-11-12 17:00", 4, "15min", base=319.0)  # last bar 17:45
    out = overlay_quote(df, "15m", _quote("2026-11-12 18:09", 318.5))
    assert len(out) == 4
    assert out.iloc[-1]["Close"] == 318.5


def test_overlay_daily_appends_today_from_quote():
    daily = _bars("2026-11-10", 3, "1D")
    out = overlay_quote(daily, "1d", _quote("2026-11-13 11:00", 105.0, open=101.0, high=106.0, low=100.5, volume=5e6))
    assert out.index[-1] == pd.Timestamp("2026-11-13", tz=TZ)
    assert list(out.iloc[-1]) == [101.0, 106.0, 100.5, 105.0, 5e6]


def test_overlay_ignores_quotes_older_than_candles():
    df = _bars("2026-11-13 10:30", 2, "1h")
    out = overlay_quote(df, "1h", _quote("2026-11-12 17:00", 1.0))
    pd.testing.assert_frame_equal(out, df)


# -- price of record ----------------------------------------------------------

def test_price_of_record_prefers_official_previous_close_from_quote():
    daily = _bars("2026-11-10", 3, "1D")
    p = price_of_record(_quote("2026-11-13 11:00", 320.75, prev_close=319.0), daily)
    assert p["current_price"] == 320.75
    assert p["change_pct"] == round((320.75 - 319.0) / 319.0 * 100, 2)


def test_price_of_record_falls_back_to_daily_candles():
    daily = _bars("2026-11-10", 3, "1D")
    p = price_of_record(None, daily)
    assert p["current_price"] == 102.0 and p["prev_close"] == 101.0


def test_public_overview_strips_rule_breakdowns():
    row = {"symbol": "X", "rules_breakdown": [{"id": 1}], "score": 10}
    out = public_overview({"items": [row], "rsi_passed": [row], "top_scored": [], "top_priced": []})
    assert "rules_breakdown" not in out["items"][0] and "rules_breakdown" not in out["rsi_passed"][0]
    assert row["rules_breakdown"]  # original snapshot untouched (alerts still need it)


# -- session calendar ---------------------------------------------------------

def test_session_helpers():
    friday_noon = datetime(2026, 11, 13, 12, 0, tzinfo=TR_TZ)
    saturday = datetime(2026, 11, 14, 12, 0, tzinfo=TR_TZ)
    assert market_state(friday_noon) == "open"
    assert market_state(datetime(2026, 11, 13, 18, 5, tzinfo=TR_TZ)) == "auction"
    assert market_state(saturday) == "closed"
    assert last_session_close(saturday) == datetime(2026, 11, 13, 18, 10, tzinfo=TR_TZ)
    assert last_session_close(friday_noon) == datetime(2026, 11, 12, 18, 10, tzinfo=TR_TZ)
    assert next_session_open(saturday) == datetime(2026, 11, 16, 10, 0, tzinfo=TR_TZ)


# -- request budget -----------------------------------------------------------

def test_token_bucket_enforces_rate_after_burst():
    async def run() -> float:
        bucket = AsyncTokenBucket(rate=20.0, capacity=2)
        start = time.monotonic()
        for _ in range(6):  # 2 from the burst, 4 at 20/s -> ~0.2 s
            await bucket.acquire()
        return time.monotonic() - start

    elapsed = asyncio.run(run())
    assert 0.15 <= elapsed < 0.5


# -- catalog names ------------------------------------------------------------

def test_prettify_name_restores_turkish_words():
    assert prettify_name("Bms Celik Hasir Sanayi ve Ticaret A.S.") == "Bms Çelik Hasir Sanayi ve Ticaret A.Ş."
    assert prettify_name("Bogazici Beton Sanayi Ve Ticaret Anonim Sirketi").endswith("Ticaret A.Ş.")


# -- split-adjustment alignment ----------------------------------------------

def test_align_scale_breaks_rescales_the_series_that_jumps():
    from app.providers.yfinance_provider import align_scale_breaks

    days = pd.date_range("2026-05-01", periods=6, freq="1D", tz=TZ)
    true_close = np.array([100.0, 101.0, 102.0, 103.0, 104.0, 105.0])
    # hourly history is split-adjusted (/7), daily is not before the split on day 3
    daily = pd.DataFrame({"Open": true_close, "High": true_close, "Low": true_close,
                          "Close": true_close, "Volume": 1000.0}, index=days)
    daily.loc[days[:3], ["Open", "High", "Low", "Close"]] *= 7
    hourly = daily.copy() * 0 + 1
    hourly[["Open", "High", "Low", "Close"]] = np.repeat(true_close[:, None], 4, axis=1)
    hourly.index = days + pd.Timedelta(hours=17, minutes=30)

    fixed_daily, fixed_hourly, fixes = align_scale_breaks(daily, hourly)
    assert fixes == 1
    np.testing.assert_allclose(fixed_daily["Close"].to_numpy(), true_close)
    np.testing.assert_allclose(fixed_hourly["Close"].to_numpy(), true_close)  # untouched
    assert fixed_daily["Volume"].iloc[0] == pytest.approx(7000.0)  # volume scales inversely


def test_align_scale_breaks_ignores_normal_auction_moves():
    from app.providers.yfinance_provider import align_scale_breaks

    days = pd.date_range("2026-05-01", periods=4, freq="1D", tz=TZ)
    daily = _bars("2026-05-01", 4, "1D")
    hourly = daily.copy()
    hourly.index = days + pd.Timedelta(hours=17, minutes=30)
    hourly["Close"] = daily["Close"].to_numpy() * np.array([1.0, 1.08, 0.93, 1.0])  # <=10% auction gaps
    _, _, fixes = align_scale_breaks(daily, hourly)
    assert fixes == 0


# -- RSI trendline breakout ---------------------------------------------------

def _rsi_path(*segments: tuple[float, float, int]) -> np.ndarray:
    """Piecewise-linear RSI path: (from, to, bars) per segment."""
    parts = [np.linspace(a, b, n, endpoint=False) for a, b, n in segments]
    return np.concatenate(parts + [np.array([segments[-1][1]])])


def test_trendline_rejects_a_steep_line_sliding_under_flat_rsi():
    from app.services.rule_engine import RuleEngine

    # peak 65, collapse to 31, a 1-point flicker, then RSI drifts sideways while the line dives
    rsi = _rsi_path((50, 65, 10), (65, 31, 6), (31, 32, 2), (32, 31, 2), (31, 29, 12))
    sig = RuleEngine.trendline_signal(rsi, {"min_peak": 60, "lookback": 60})
    assert not sig["valid"]
    assert not sig["checks"]["second_peak"]  # the flicker is not a reaction high


def test_trendline_accepts_rsi_rising_through_a_low_line():
    from app.services.rule_engine import RuleEngine

    # peak 70, slide to 30, reaction high 45, slide to 22, then RSI climbs through the line
    rsi = _rsi_path((50, 70, 8), (70, 30, 12), (30, 45, 5), (45, 22, 14), (22, 34, 3))
    sig = RuleEngine.trendline_signal(rsi, {"min_peak": 60, "lookback": 60})
    assert sig["checks"]["second_peak"] and sig["checks"]["rising_break"]
    assert sig["line_at_break"] <= 30
    assert sig["valid"], sig["checks"]


def test_trendline_signal_expires_after_max_bars_since_break():
    from app.services.rule_engine import RuleEngine

    rsi = _rsi_path((50, 70, 8), (70, 30, 12), (30, 45, 5), (45, 22, 14), (22, 34, 3), (34, 40, 8))
    sig = RuleEngine.trendline_signal(rsi, {"min_peak": 60, "lookback": 60})
    assert sig["checks"]["rising_break"] and not sig["checks"]["fresh"]
    assert not sig["valid"]
