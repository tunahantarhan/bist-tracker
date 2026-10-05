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
        Mathematically models the visual 'Blue Descending RSI Trendline' (y = m*x + b).
        1. Calculates RSI(length).
        2. Finds the major peak (T1) within the lookback window (excluding the last 3 bars).
        3. Finds the upper-envelope descending resistance line from T1 to the second anchor peak (T2)
           prior to the latest bar, or uses an optional user-specified slope.
        Returns the trendline as a pandas Series and metadata (slope, peak values, breakout status).
        """
        params = params or {}
        rsi_length = int(params.get("length", params.get("rsi_length", 14)))
        lookback = int(params.get("lookback", 60))
        min_peak_rsi = float(params.get("min_peak", 55.0))
        custom_slope = params.get("slope", None)  # Optional manual negative slope (e.g., -0.35)

        rsi = ta.rsi(close, length=rsi_length)
        if rsi is None or len(rsi.dropna()) < 15:
            raise ValueError("Insufficient data to compute RSI trendline.")

        n = len(rsi)
        start_idx = max(0, n - lookback)
        search_end = n - 3  # Leave at least 3 bars after peak to form a descending line

        if search_end <= start_idx + 2:
            start_idx = max(0, n - 30)

        window = rsi.iloc[start_idx:search_end]
        if window.dropna().empty:
            raise ValueError("Empty RSI window for trendline detection.")

        # 1. Locate Primary Peak (T1)
        peak_pos_rel = int(np.nanargmax(window.values))
        x1 = start_idx + peak_pos_rel
        y1 = float(rsi.iloc[x1])

        # 2. Determine Slope (m)
        if custom_slope is not None and float(custom_slope) < 0:
            slope = float(custom_slope)
            x2 = n - 2
            y2 = y1 + slope * (x2 - x1)
        else:
            # Find the upper-envelope anchor point between x1+2 and n-2 (excluding current bar n-1 so breakout can happen)
            best_slope = -0.25  # Default gentle downward slope fallback
            found_anchor = False
            best_x2 = x1 + 1

            # Search for the least-negative (highest resistance) downward slope that bounds intermediate bars
            candidate_slopes = []
            for idx in range(x1 + 2, n - 1):
                val = float(rsi.iloc[idx])
                if np.isnan(val):
                    continue
                s = (val - y1) / float(idx - x1)
                if -2.5 <= s <= -0.05:
                    candidate_slopes.append((s, idx, val))

            if candidate_slopes:
                # Pick the upper bounding resistance line among valid negative slopes
                candidate_slopes.sort(key=lambda item: item[0], reverse=True)
                best_slope, best_x2, _ = candidate_slopes[0]
                found_anchor = True

            slope = best_slope
            x2 = best_x2 if found_anchor else n - 2
            y2 = y1 + slope * (x2 - x1)

        # 3. Build the Trendline Series from Peak (x1) to Present (n-1)
        trend_values = np.full(n, np.nan)
        for idx in range(x1, n):
            line_val = y1 + slope * (idx - x1)
            # Clamp visual line between 0 and 100
            trend_values[idx] = max(0.0, min(100.0, line_val))

        trend_series = pd.Series(trend_values, index=rsi.index)
        meta = {
            "peak_rsi": round(y1, 2),
            "peak_qualifies": y1 >= min_peak_rsi,
            "slope": round(float(slope), 3),
            "start_pos": x1,
            "end_pos": n - 1,
        }
        return trend_series, meta

    @classmethod
    def get_indicator_series(cls, df: pd.DataFrame, indicator: str, params: Dict[str, Any] | None) -> pd.Series:
        """
        Calculates the technical indicator series from OHLCV DataFrame.
        Returns a pandas Series to support both static comparisons and crossover checks.
        """
        if df.empty or len(df) < 25:
            raise ValueError("Insufficient historical data for indicator calculation.")

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
        """
        Evaluates a single dynamic rule against the stock's DataFrame.
        Returns (is_condition_met, current_val_1, current_target_val, extra_meta).
        """
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

        # If evaluating RSI_TRENDLINE, ensure the historical peak met the minimum RSI threshold
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
        """
        Processes all active global rules across their respective timeframes (5m, 15m, 1h, 4h, 1d).
        Enforces Two-Stage Funnel filtering if any active rule is marked as `is_primary_filter`.
        """
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