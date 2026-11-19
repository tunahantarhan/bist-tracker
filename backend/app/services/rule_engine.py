import logging
import pandas as pd
import pandas_ta as ta
import numpy as np
from typing import Dict, Any, Tuple, List

logger = logging.getLogger(__name__)

class RuleEngine:
    # Defaults of the breakout definition; rules may override any of them in indicator_2_params.
    TRENDLINE_DEFAULTS: Dict[str, float] = {
        "length": 14,
        "lookback": 60,
        "min_peak": 55.0,          # main peak T1 must reach this RSI level
        "max_trend_end": 30.0,     # the line must be at or below this level where RSI breaks it
        "min_peak_gap": 5,         # bars between T1 and T2
        "min_bounce": 5.0,         # T2 must be a real reaction high: RSI points above the low before it
        "pivot_bars": 2,           # T2 is a swing high over this many bars on each side
        "max_bars_since_break": 4, # the breakout must be this recent (bars), not an old state
        "confirm_bars": 2,         # bars RSI has to stay above the line (break bar included)
    }

    @classmethod
    def trendline_params(cls, params: Dict[str, Any] | None) -> Dict[str, float]:
        merged = dict(cls.TRENDLINE_DEFAULTS)
        for key, value in (params or {}).items():
            if key == "rsi_length":
                key = "length"
            if key in merged and value is not None:
                merged[key] = float(value)
        for key in ("length", "lookback", "min_peak_gap", "pivot_bars", "max_bars_since_break", "confirm_bars"):
            merged[key] = int(merged[key])
        return merged

    @staticmethod
    def trendline_geometry(
        rsi: np.ndarray, lookback: int, min_peak_gap: int = 5, min_bounce: float = 5.0, pivot_bars: int = 2,
    ) -> Tuple[int, float, float, int, float, bool]:
        """Descending RSI resistance line on `rsi` (only the given, i.e. past, values are used).

        1. Main peak T1 = highest RSI in the lookback window (excluding the last 3 bars).
        2. T2 candidates are swing highs after T1: at least `min_peak_gap` bars later, lower
           than T1, the highest point over `pivot_bars` bars on both sides, and at least
           `min_bounce` RSI points above the lowest RSI between T1 and them (a reaction high,
           not a flicker inside a slide).
        3. The flattest T1 -> T2 line is the resistance: every candidate lies on or under it.

        Without a valid T2 there is no line (`found_t2` False, slope -0.1 as a placeholder).
        Returns (x1, y1, slope, t2_x, t2_y, found_t2). Shared by live scoring and the
        walk-forward backtest so both use exactly the same definition.
        """
        n = len(rsi)
        start_idx = max(0, n - lookback)
        search_end = n - 3
        if search_end <= start_idx + 2:
            start_idx = max(0, n - 30)

        window = rsi[start_idx:search_end]
        if window.size == 0 or np.all(np.isnan(window)):
            raise ValueError("Empty RSI window for trendline detection.")

        x1 = start_idx + int(np.nanargmax(window))
        y1 = float(rsi[x1])

        best_slope = -float("inf")
        found_t2 = False
        t2_x, t2_y = x1 + 1, y1
        running_low = np.inf
        for idx in range(x1 + 1, n - pivot_bars):
            val = rsi[idx]
            if idx - x1 >= min_peak_gap and val < y1 and val - running_low >= min_bounce:
                left = rsi[idx - pivot_bars:idx]
                right = rsi[idx + 1:idx + 1 + pivot_bars]
                if val >= np.nanmax(left) and val > np.nanmax(right):
                    s = (val - y1) / float(idx - x1)
                    if s > best_slope:
                        best_slope, t2_x, t2_y, found_t2 = s, idx, float(val), True
            running_low = min(running_low, val)

        slope = best_slope if found_t2 and best_slope < 0 else -0.1
        return x1, y1, float(slope), t2_x, t2_y, bool(found_t2 and best_slope < 0)

    @classmethod
    def trendline_signal(cls, rsi: np.ndarray, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
        """Evaluates the breakout at the last bar of `rsi` and explains each check.

        A breakout counts only if RSI itself rose through the line (a crossover bar where
        RSI went up and ended above the line's previous level), not when a steep line slid
        under a flat or falling RSI. It must have happened in the bottom region
        (line <= `max_trend_end` at the crossing), recently (`max_bars_since_break`), and RSI
        must still be above the line after `confirm_bars` bars.
        """
        p = cls.trendline_params(params)
        n = len(rsi)
        x1, y1, slope, t2_x, t2_y, found_t2 = cls.trendline_geometry(
            rsi, p["lookback"], p["min_peak_gap"], p["min_bounce"], p["pivot_bars"]
        )

        def line(i: int) -> float:
            return y1 + slope * (i - x1)

        break_x = None
        if found_t2:
            for c in range(n - 1, t2_x, -1):
                if not rsi[c] > line(c):
                    break  # RSI is (back) under the line: no live breakout
                if rsi[c - 1] <= line(c - 1):
                    break_x = c
                    break

        line_at_break = line(break_x) if break_x is not None else None
        bars_since = (n - 1 - break_x) if break_x is not None else None
        checks = {
            "peak": y1 >= p["min_peak"],
            "second_peak": found_t2,
            "rising_break": break_x is not None
            and rsi[break_x] > rsi[break_x - 1]
            and rsi[break_x] > line(break_x - 1),
            "low_break": line_at_break is not None and 0.0 < line_at_break <= p["max_trend_end"],
            "fresh": bars_since is not None and bars_since <= p["max_bars_since_break"],
            "confirmed": bars_since is not None and bars_since + 1 >= p["confirm_bars"],
        }
        return {
            "x1": x1, "y1": y1, "slope": slope, "t2_x": t2_x, "t2_y": t2_y if found_t2 else None,
            "found_t2": found_t2, "break_x": break_x, "line_at_break": line_at_break,
            "bars_since_break": bars_since, "checks": checks, "valid": all(checks.values()),
        }

    @classmethod
    def calculate_rsi_downtrend_series(
        cls, close: pd.Series, params: Dict[str, Any] | None = None
    ) -> Tuple[pd.Series, Dict[str, Any]]:
        """RSI descending trendline (see `trendline_geometry`) plus the breakout checks of
        `trendline_signal`; `peak_qualifies` is True only if every check passes."""
        p = cls.trendline_params(params)
        rsi = ta.rsi(close, length=p["length"])
        if rsi is None or len(rsi.dropna()) < 15:
            raise ValueError("Insufficient data to compute RSI trendline.")

        values = rsi.to_numpy(dtype=float)
        n = len(values)
        sig = cls.trendline_signal(values, p)
        x1, y1, slope = sig["x1"], sig["y1"], sig["slope"]

        trend_values = np.full(n, np.nan)
        if sig["found_t2"]:
            raw = y1 + slope * np.arange(n - x1, dtype=float)
            # drawn down to 0 at most; the value used for the comparison is the last one
            trend_values[x1:] = np.where(raw >= 0, raw, np.nan)
            if np.isnan(trend_values[-1]):
                trend_values[-1] = 0.0
        else:
            trend_values[-2:] = 100.0  # no resistance line yet: RSI cannot be "above" it
        trend_series = pd.Series(trend_values, index=rsi.index)

        meta = {
            "peak_rsi": round(y1, 2),
            "peak_qualifies": sig["valid"],
            "slope": round(float(slope), 3) if sig["found_t2"] else None,
            "start_pos": x1,
            "end_pos": n - 1,
            "t2_x": sig["t2_x"] if sig["found_t2"] else None,
            "t2_y": round(sig["t2_y"], 2) if sig["found_t2"] else None,
            "current_trend_val": round(float(trend_values[-1]), 2),
            "break_bars_ago": sig["bars_since_break"],
            "line_at_break": round(sig["line_at_break"], 2) if sig["line_at_break"] is not None else None,
            "trend_checks": sig["checks"],
        }
        return trend_series, meta

    @classmethod
    def get_indicator_series(cls, df: pd.DataFrame, indicator: str, params: Dict[str, Any] | None) -> pd.Series | None:
        if df.empty or len(df) < 5:  # Need at least a few candles to compute anything
            return None

        params = params or {}
        close_col = "Close" if "Close" in df.columns else "close"
        close = df[close_col].astype(float)

        ind = indicator.upper()

        if ind == "PRICE":
            return close

        elif ind == "RSI":
            length = int(params.get("length", params.get("period", 14)))
            return ta.rsi(close, length=length)

        elif ind == "RSI_TRENDLINE":
            trend_series, _ = cls.calculate_rsi_downtrend_series(close, params)
            return trend_series

        elif ind in ["SMA", "MA"]:
            length = int(params.get("length", params.get("period", 50)))
            return ta.sma(close, length=length)

        elif ind == "EMA":
            length = int(params.get("length", params.get("period", 50)))
            return ta.ema(close, length=length)

        elif ind in ["STOCH_RSI", "STOCH_RSI_K", "STOCH_RSI_D"]:
            length = int(params.get("length", 14))
            rsi_length = int(params.get("rsi_length", 14))
            k = int(params.get("k", 3))
            d = int(params.get("d", 3))
            stoch_df = ta.stochrsi(close, length=length, rsi_length=rsi_length, k=k, d=d)
            if stoch_df is None or stoch_df.empty:
                raise ValueError("Failed to calculate Stoch RSI.")
            return stoch_df.iloc[:, 1] if ind == "STOCH_RSI_D" else stoch_df.iloc[:, 0]

        elif ind in ["MACD", "MACD_LINE", "MACD_SIGNAL", "MACD_HIST"]:
            fast = int(params.get("fast", 12))
            slow = int(params.get("slow", 26))
            signal = int(params.get("signal", 9))
            macd_df = ta.macd(close, fast=fast, slow=slow, signal=signal)
            if macd_df is None or macd_df.empty:
                raise ValueError("Failed to calculate MACD.")
            if ind == "MACD_HIST":
                return macd_df.iloc[:, 1]
            elif ind == "MACD_SIGNAL":
                return macd_df.iloc[:, 2]
            return macd_df.iloc[:, 0]

        elif ind in ["BOLLINGER_UPPER", "BOLLINGER_MIDDLE", "BOLLINGER_LOWER", "BB_UPPER", "BB_MIDDLE", "BB_LOWER"]:
            length = int(params.get("length", 22))
            std_dev = float(params.get("std_dev", 2.0))
            bb_df = ta.bbands(close, length=length, std=std_dev)
            if bb_df is None or bb_df.empty:
                raise ValueError("Failed to calculate Bollinger Bands.")
            if ind in ["BOLLINGER_LOWER", "BB_LOWER"]:
                return bb_df.iloc[:, 0]
            elif ind in ["BOLLINGER_MIDDLE", "BB_MIDDLE"]:
                return bb_df.iloc[:, 1]
            return bb_df.iloc[:, 2]

        else:
            raise ValueError(f"Unsupported indicator type: {indicator}")

    @classmethod
    def evaluate_single_rule(cls, df: pd.DataFrame, rule: Any) -> Tuple[bool, float, float, Dict[str, Any]]:
        extra_meta: Dict[str, Any] = {}
        series_1 = cls.get_indicator_series(df, rule.indicator_1, rule.indicator_1_params)
        
        if series_1 is None or len(series_1.dropna()) < 2:
            return False, 0.0, 0.0, extra_meta

        curr_1 = float(series_1.iloc[-1])
        prev_1 = float(series_1.iloc[-2])

        if rule.target_type == "static":
            curr_2 = float(rule.static_value or 0.0)
            prev_2 = curr_2
        else:
            if (rule.indicator_2 or "").upper() == "RSI_TRENDLINE":
                close_col = "Close" if "Close" in df.columns else "close"
                series_2, extra_meta = cls.calculate_rsi_downtrend_series(
                    df[close_col].astype(float), rule.indicator_2_params
                )
            else:
                series_2 = cls.get_indicator_series(df, rule.indicator_2, rule.indicator_2_params)

            if series_2 is None or len(series_2.dropna()) < 2:
                return False, curr_1, 0.0, extra_meta
            curr_2 = float(series_2.iloc[-1])
            prev_2 = float(series_2.iloc[-2])

        cond = rule.condition
        is_met = False

        if cond == ">":
            is_met = curr_1 > curr_2
        elif cond == "<":
            is_met = curr_1 < curr_2
        elif cond == ">=":
            is_met = curr_1 >= curr_2
        elif cond == "<=":
            is_met = curr_1 <= curr_2
        elif cond == "==":
            is_met = round(curr_1, 2) == round(curr_2, 2)
        elif cond == "crosses_above":
            is_met = (prev_1 <= prev_2) and (curr_1 > curr_2)
        elif cond == "crosses_below":
            is_met = (prev_1 >= prev_2) and (curr_1 < curr_2)
        else:
            raise ValueError(f"Unsupported condition operator: {cond}")

        # While evaluating RSI Trendline, check the both conditions
        if extra_meta and not extra_meta.get("peak_qualifies", True):
            is_met = False

        return is_met, round(curr_1, 2), round(curr_2, 2), extra_meta

    @classmethod
    def evaluate_symbol(
        cls,
        default_df: pd.DataFrame,
        rules: List[Any],
        dataframes_by_tf: Dict[str, pd.DataFrame] | None = None,
    ) -> Dict[str, Any]:
        total_score = 0.0
        breakdown = []
        primary_filters_exist = any(getattr(r, "is_primary_filter", False) for r in rules)
        all_primary_filters_passed = True

        for rule in rules:
            tf = getattr(rule, "timeframe", "1d") or "1d"
            is_primary = bool(getattr(rule, "is_primary_filter", False))
            target_df = (dataframes_by_tf or {}).get(tf, default_df)

            # Shared descriptive fields so the UI can render "RSI 32.75 < 30.00" style explanations
            base_item: Dict[str, Any] = {
                "id": rule.id,
                "name": rule.name,
                "timeframe": tf,
                "is_primary_filter": is_primary,
                "condition_text": rule.description or rule.name,
                "condition": rule.condition,
                "target_type": rule.target_type,
                "indicator_1": rule.indicator_1,
                "indicator_1_params": rule.indicator_1_params or {},
                "indicator_2": rule.indicator_2,
                "indicator_2_params": rule.indicator_2_params or {},
                "static_value": rule.static_value,
                "score_impact": round(float(rule.score_impact), 2),
            }

            try:
                is_met, val_1, val_2, meta = cls.evaluate_single_rule(target_df, rule)
                if is_primary and not is_met:
                    all_primary_filters_passed = False

                impact = float(rule.score_impact) if is_met else 0.0
                total_score += impact

                breakdown.append({
                    **base_item,
                    "is_met": is_met,
                    "earned_score": round(impact, 2),
                    "current_value": val_1,
                    "target_value": val_2,
                    "slope": meta.get("slope"),
                    "peak_rsi": meta.get("peak_rsi"),
                    "peak_qualifies": meta.get("peak_qualifies"),
                    "trend_checks": meta.get("trend_checks"),
                    "break_bars_ago": meta.get("break_bars_ago"),
                    "line_at_break": meta.get("line_at_break"),
                })
            except Exception as e:
                if is_primary:
                    all_primary_filters_passed = False
                logger.warning("Rule %s (%s) evaluation failed: %s", rule.id, rule.name, e)
                breakdown.append({
                    **base_item,
                    "is_met": False,
                    "earned_score": 0.0,
                    "error": str(e),
                })

        clamped_score = max(0.0, min(100.0, round(total_score, 2)))

        return {
            "total_score": clamped_score,
            "primary_filter_passed": all_primary_filters_passed if primary_filters_exist else True,
            "has_primary_filter": primary_filters_exist,
            "rules_breakdown": breakdown,
        }