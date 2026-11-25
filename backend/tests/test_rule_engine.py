"""Rule engine: score arithmetic, conditions, timeframe routing and the RSI trendline signal."""

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from app.services.rule_engine import RuleEngine


def _rule(id, indicator_1="PRICE", condition=">", static_value=None, indicator_2=None, score_impact=10.0,
          timeframe="1d", is_primary_filter=False, indicator_1_params=None, indicator_2_params=None):
    return SimpleNamespace(
        id=id, name=f"rule {id}", description=None, timeframe=timeframe, is_primary_filter=is_primary_filter,
        indicator_1=indicator_1, indicator_1_params=indicator_1_params or {}, condition=condition,
        target_type="static" if indicator_2 is None else "indicator", static_value=static_value,
        indicator_2=indicator_2, indicator_2_params=indicator_2_params or {}, score_impact=score_impact,
    )


def _closes(values) -> pd.DataFrame:
    idx = pd.date_range("2026-11-02", periods=len(values), freq="D")
    v = np.asarray(values, dtype=float)
    return pd.DataFrame({"Open": v, "High": v, "Low": v, "Close": v, "Volume": 1.0}, index=idx)


# -- score -------------------------------------------------------------------

def test_score_is_the_weighted_sum_of_met_rules():
    df = _closes([100, 101, 102, 103, 104, 105])
    rules = [
        _rule(1, condition=">", static_value=100, score_impact=12.5),   # 105 > 100 met
        _rule(2, condition="<", static_value=100, score_impact=40.0),   # not met
        _rule(3, condition=">=", static_value=105, score_impact=7.25),  # boundary met
    ]
    result = RuleEngine.evaluate_symbol(df, rules)
    assert result["total_score"] == 19.75
    assert [r["earned_score"] for r in result["rules_breakdown"]] == [12.5, 0.0, 7.25]
    assert [r["is_met"] for r in result["rules_breakdown"]] == [True, False, True]
    assert result["has_primary_filter"] is False and result["primary_filter_passed"] is True


def test_score_is_clamped_to_100():
    df = _closes([100, 101, 102, 103, 104, 105])
    rules = [_rule(i, static_value=1, score_impact=40.0) for i in range(3)]
    assert RuleEngine.evaluate_symbol(df, rules)["total_score"] == 100.0


def test_primary_filter_gates_the_result_but_not_the_score():
    df = _closes([100, 101, 102, 103, 104, 105])
    rules = [
        _rule(1, condition="<", static_value=100, score_impact=25.0, is_primary_filter=True),
        _rule(2, condition=">", static_value=100, score_impact=10.0),
    ]
    result = RuleEngine.evaluate_symbol(df, rules)
    assert result["has_primary_filter"] is True and result["primary_filter_passed"] is False
    assert result["total_score"] == 10.0


def test_a_failing_rule_scores_zero_and_fails_the_primary_filter():
    df = _closes([100, 101, 102, 103, 104, 105])
    rules = [
        _rule(1, indicator_1="NOT_AN_INDICATOR", static_value=1, score_impact=50.0, is_primary_filter=True),
        _rule(2, static_value=1, score_impact=10.0),
    ]
    result = RuleEngine.evaluate_symbol(df, rules)
    broken = result["rules_breakdown"][0]
    assert broken["is_met"] is False and broken["earned_score"] == 0.0 and "error" in broken
    assert result["primary_filter_passed"] is False and result["total_score"] == 10.0


def test_each_rule_runs_on_its_own_timeframe():
    daily = _closes([100, 100, 100, 100, 100, 100])
    hourly = _closes([200, 200, 200, 200, 200, 200])
    rules = [_rule(1, condition=">", static_value=150, timeframe="1h"), _rule(2, condition=">", static_value=150)]
    result = RuleEngine.evaluate_symbol(daily, rules, {"1h": hourly, "1d": daily})
    assert [r["is_met"] for r in result["rules_breakdown"]] == [True, False]
    assert result["rules_breakdown"][0]["current_value"] == 200.0


# -- conditions ----------------------------------------------------------------

@pytest.mark.parametrize("condition,value,expected", [
    (">", 105, False), (">=", 105, True), ("<", 106, True), ("<=", 104, False), ("==", 105.001, True),
])
def test_static_conditions(condition, value, expected):
    df = _closes([100, 101, 102, 103, 104, 105])
    met, current, target, _ = RuleEngine.evaluate_single_rule(df, _rule(1, condition=condition, static_value=value))
    assert met is expected and current == 105.0


def test_crosses_above_needs_the_cross_on_the_last_bar():
    rule = _rule(1, condition="crosses_above", indicator_2="SMA", indicator_2_params={"length": 3})
    crossed = _closes([10, 10, 10, 10, 9, 12])   # SMA3: ... 9.67 -> 10.33; price 9 -> 12
    already_above = _closes([10, 10, 10, 12, 13, 14])
    assert RuleEngine.evaluate_single_rule(crossed, rule)[0] is True
    assert RuleEngine.evaluate_single_rule(already_above, rule)[0] is False
    below = _rule(2, condition="crosses_below", indicator_2="SMA", indicator_2_params={"length": 3})
    assert RuleEngine.evaluate_single_rule(_closes([10, 10, 10, 10, 11, 8]), below)[0] is True


def test_too_few_candles_is_not_met():
    met, *_ = RuleEngine.evaluate_single_rule(_closes([100, 101, 102]), _rule(1, static_value=1))
    assert met is False


# -- RSI trendline signal ------------------------------------------------------
# T1 = 70 at bar 5, T2 = 50 at bar 25 (reaction high after a dip to 40): the line falls
# one RSI point per bar, so it is 30 at bar 45 and 28 at bar 47.

def _rsi(points) -> np.ndarray:
    xs, ys = zip(*points)
    return np.interp(np.arange(xs[-1] + 1), xs, ys)


BASE = [(0, 50), (5, 70), (20, 40), (25, 50), (45, 18)]


def test_rsi_rising_through_the_line_in_the_bottom_region_is_a_breakout():
    sig = RuleEngine.trendline_signal(_rsi(BASE + [(46, 22), (47, 30), (48, 33)]))
    assert (sig["x1"], sig["t2_x"]) == (5, 25) and sig["slope"] == pytest.approx(-1.0)
    assert sig["break_x"] == 47 and sig["line_at_break"] == pytest.approx(28.0)
    assert sig["stage"] == "break" and sig["valid"]
    assert all(sig["checks"][k] for k in ("peak", "second_peak", "rising_break", "low_break", "fresh", "confirmed"))


def test_a_line_sliding_under_a_flat_rsi_is_not_a_breakout():
    sig = RuleEngine.trendline_signal(_rsi(BASE[:-1] + [(40, 26), (51, 26)]))
    assert sig["break_x"] is not None  # the line did get under RSI...
    assert not sig["checks"]["rising_break"] and not sig["valid"]  # ...but RSI never rose through it


def test_rsi_rising_just_under_the_line_is_the_early_signal():
    sig = RuleEngine.trendline_signal(_rsi(BASE + [(46, 21), (47, 24)]))  # line 28 at bar 47: gap 4
    assert sig["break_x"] is None and sig["near_gap"] == pytest.approx(4.0)
    assert sig["stage"] == "near" and sig["valid"]
    off = RuleEngine.trendline_signal(_rsi(BASE + [(46, 21), (47, 24)]), {"near_gap": 0})
    assert not off["valid"] and "near" not in off["checks"]


def test_breakout_needs_a_high_enough_main_peak_and_must_be_fresh():
    rsi = _rsi(BASE + [(46, 22), (47, 30), (48, 33)])
    low_peak = RuleEngine.trendline_signal(rsi, {"min_peak": 75})
    assert not low_peak["checks"]["peak"] and not low_peak["valid"]
    stale = RuleEngine.trendline_signal(np.concatenate([rsi, np.linspace(34, 40, 6)]))  # 7 bars after the break
    assert stale["bars_since_break"] == 7 and not stale["checks"]["fresh"] and not stale["valid"]


def test_breakout_above_the_bottom_region_does_not_count():
    sig = RuleEngine.trendline_signal(_rsi(BASE + [(46, 22), (47, 30), (48, 33)]), {"max_trend_end": 25})
    assert not sig["checks"]["low_break"] and not sig["valid"]
