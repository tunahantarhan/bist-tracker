import logging
import pandas as pd
import pandas_ta as ta
import numpy as np
from typing import Dict, Any, Tuple, List

logger = logging.getLogger(__name__)

class RuleEngine:
    @staticmethod
    def trendline_geometry(rsi: np.ndarray, lookback: int) -> Tuple[int, float, float, int, float, bool]:
        """Descending RSI trendline on the series `rsi[:n]` (only past values are used).

        1. Main peak T1 = highest RSI in the lookback window (excluding the last 3 bars).
        2. Among local peaks after T1 that are below it, the one giving the flattest
           (max) slope defines the resistance line T1 -> T2; without local peaks, the
           flattest line to any lower point is used.
        3. An upward/undefined slope is replaced by a slightly falling invalid line.

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

        for idx in range(x1 + 2, n - 1):
            val = rsi[idx]
            if val > rsi[idx - 1] and val > rsi[idx + 1] and val < y1:
                s = (val - y1) / float(idx - x1)
                if s > best_slope:
                    best_slope, t2_x, t2_y, found_t2 = s, idx, float(val), True

        if not found_t2:
            for idx in range(x1 + 2, n - 1):
                val = rsi[idx]
                if val < y1:
                    s = (val - y1) / float(idx - x1)
                    if s > best_slope:
                        best_slope, t2_x, t2_y, found_t2 = s, idx, float(val), True

        slope = best_slope if found_t2 and best_slope < 0 else -0.1
        return x1, y1, float(slope), t2_x, t2_y, found_t2

    @staticmethod
    def calculate_rsi_downtrend_series(
        close: pd.Series, params: Dict[str, Any] | None = None
    ) -> Tuple[pd.Series, Dict[str, Any]]:
        """RSI descending trendline (see `trendline_geometry`) plus the qualification gates:
        the main peak must reach `min_peak` and the line's tip must be at or below
        `max_trend_end` (the line has fallen into the bottom region)."""
        params = params or {}
        rsi_length = int(params.get("length", params.get("rsi_length", 14)))
        lookback = int(params.get("lookback", 60))
        min_peak_rsi = float(params.get("min_peak", 55.0))
        max_trend_end = float(params.get("max_trend_end", 30.0))

        rsi = ta.rsi(close, length=rsi_length)
        if rsi is None or len(rsi.dropna()) < 15:
            raise ValueError("Insufficient data to compute RSI trendline.")

        values = rsi.to_numpy(dtype=float)
        n = len(values)
        x1, y1, slope, t2_x, t2_y, found_t2 = RuleEngine.trendline_geometry(values, lookback)

        trend_values = np.full(n, np.nan)
        trend_values[x1:] = np.clip(y1 + slope * np.arange(n - x1, dtype=float), 0.0, 100.0)
        trend_series = pd.Series(trend_values, index=rsi.index)

        current_trend_val = trend_values[n - 1]

        # Rule: The tip of the trend must have fallen into the defined bottom region (0-40)
        is_low_enough = bool(current_trend_val <= max_trend_end)

        meta = {
            "peak_rsi": round(y1, 2),
            "peak_qualifies": (y1 >= min_peak_rsi) and is_low_enough,
            "slope": round(float(slope), 3),
            "start_pos": x1,
            "end_pos": n - 1,
            "t2_x": t2_x,
            "t2_y": round(t2_y, 2) if found_t2 else None,
            "current_trend_val": round(current_trend_val, 2)
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