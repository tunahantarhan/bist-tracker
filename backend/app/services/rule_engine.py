import pandas as pd
import pandas_ta as ta
import numpy as np
from typing import Dict, Any, Tuple, List

class RuleEngine:
    @staticmethod
    def calculate_rsi_downtrend_series(
        close: pd.Series, params: Dict[str, Any] | None = None
    ) -> Tuple[pd.Series, Dict[str, Any]]:
        """
        Decline Trendline:
        1. Finds the main peak (T1).
        2. Finds the best slope that limits the price from above by finding local peaks (T2) after T1.
        3. Confirms that the tip of the trend does not fall into "bottom regions" (e.g., below 30).
        """
        params = params or {}
        rsi_length = int(params.get("length", params.get("rsi_length", 14)))
        lookback = int(params.get("lookback", 60))
        min_peak_rsi = float(params.get("min_peak", 55.0))
        
        # Trendline is allowed to go down to 0-30
        max_trend_end = float(params.get("max_trend_end", 30.0))

        rsi = ta.rsi(close, length=rsi_length)
        if rsi is None or len(rsi.dropna()) < 15:
            raise ValueError("Insufficient data to compute RSI trendline.")

        n = len(rsi)
        start_idx = max(0, n - lookback)
        search_end = n - 3

        if search_end <= start_idx + 2:
            start_idx = max(0, n - 30)

        window = rsi.iloc[start_idx:search_end]
        if window.dropna().empty:
            raise ValueError("Empty RSI window for trendline detection.")

        # 1)
        peak_pos_rel = int(np.nanargmax(window.values))
        x1 = start_idx + peak_pos_rel
        y1 = float(rsi.iloc[x1])

        # 2)
        best_slope = -float('inf')
        found_t2 = False
        t2_x = x1 + 1
        t2_y = y1

        # Only find local peaks after the main peak (x1)
        peaks = []
        for idx in range(x1 + 2, n - 1):
            val_prev = float(rsi.iloc[idx-1])
            val_curr = float(rsi.iloc[idx])
            val_next = float(rsi.iloc[idx+1])
            if val_curr > val_prev and val_curr > val_next:
                peaks.append((idx, val_curr))

        # From the first peak, draw a tangent line to a second peak below it
        for px, py in peaks:
            if py < y1:  # The second peak must be below the first peak
                s = (py - y1) / float(px - x1)
                # To find the widest angle (the outermost/topmost) resistance line, take the max slope
                if s > best_slope:
                    best_slope = s
                    t2_x = px
                    t2_y = py
                    found_t2 = True

        # If there is no clear local peak, consider the best slope to the lowest point after the main peak
        if not found_t2:
            for idx in range(x1 + 2, n - 1):
                py = float(rsi.iloc[idx])
                if py < y1:
                    s = (py - y1) / float(idx - x1)
                    if s > best_slope:
                        best_slope = s
                        t2_x = idx
                        t2_y = py
                        found_t2 = True

        # If there is no trend or the slope is upward, assign a slightly downward invalid slope
        if not found_t2 or best_slope >= 0:
            slope = -0.1
        else:
            slope = best_slope

        # 3)
        trend_values = np.full(n, np.nan)
        for idx in range(x1, n):
            line_val = y1 + slope * (idx - x1)
            trend_values[idx] = max(0.0, min(100.0, line_val))

        trend_series = pd.Series(trend_values, index=rsi.index)

        # Tip of the trend (current value of the trend)
        current_trend_val = trend_values[n - 1]

        # Rule: The tip of the trend must have fallen into the defined bottom region (0-40)
        is_low_enough = current_trend_val <= max_trend_end

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
        if df.empty or len(df) < 5:  # En azından kapanış verisi alacak kadar mum olmalı
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

            try:
                is_met, val_1, val_2, meta = cls.evaluate_single_rule(target_df, rule)
                if is_primary and not is_met:
                    all_primary_filters_passed = False

                impact = float(rule.score_impact) if is_met else 0.0
                total_score += impact

                breakdown.append({
                    "id": rule.id,
                    "name": rule.name,
                    "timeframe": tf,
                    "is_primary_filter": is_primary,
                    "condition_text": rule.description or rule.name,
                    "is_met": is_met,
                    "score_impact": round(float(rule.score_impact), 2),
                    "earned_score": round(impact, 2),
                    "current_value": val_1,
                    "target_value": val_2,
                    "slope": meta.get("slope"),
                    "peak_rsi": meta.get("peak_rsi"),
                })
            except Exception as e:
                if is_primary:
                    all_primary_filters_passed = False
                print(f"Error evaluating rule ID {rule.id} ({rule.name}): {e}")
                breakdown.append({
                    "id": rule.id,
                    "name": rule.name,
                    "timeframe": tf,
                    "is_primary_filter": is_primary,
                    "condition_text": rule.description or rule.name,
                    "is_met": False,
                    "score_impact": round(float(rule.score_impact), 2),
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