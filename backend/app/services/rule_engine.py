import pandas as pd
import pandas_ta as ta
from typing import Dict, Any, Tuple, List

class RuleEngine:
    @staticmethod
    def get_indicator_series(df: pd.DataFrame, indicator: str, params: Dict[str, Any] | None) -> pd.Series:
        """
        Calculates the technical indicator series from OHLCV DataFrame.
        Returns a pandas Series to support both static comparisons and crossover checks.
        """
        if df.empty or len(df) < 30:
            raise ValueError("Insufficient historical data for indicator calculation.")

        params = params or {}
        
        # Ensure we access the Close column regardless of capitalization
        close_col = "Close" if "Close" in df.columns else "close"
        close = df[close_col].astype(float)

        ind = indicator.upper()

        if ind == "PRICE":
            return close

        elif ind == "RSI":
            length = int(params.get("length", params.get("period", 14)))
            return ta.rsi(close, length=length)

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
            # Column 0 is %K, Column 1 is %D
            return stoch_df.iloc[:, 1] if ind == "STOCH_RSI_D" else stoch_df.iloc[:, 0]

        elif ind in ["MACD", "MACD_LINE", "MACD_SIGNAL", "MACD_HIST"]:
            fast = int(params.get("fast", 12))
            slow = int(params.get("slow", 26))
            signal = int(params.get("signal", 9))
            macd_df = ta.macd(close, fast=fast, slow=slow, signal=signal)
            if macd_df is None or macd_df.empty:
                raise ValueError("Failed to calculate MACD.")
            # Column 0: MACD Line, Column 1: Histogram, Column 2: Signal Line
            if ind == "MACD_HIST":
                return macd_df.iloc[:, 1]
            elif ind == "MACD_SIGNAL":
                return macd_df.iloc[:, 2]
            return macd_df.iloc[:, 0]

        elif ind in ["BOLLINGER_UPPER", "BOLLINGER_MIDDLE", "BOLLINGER_LOWER", "BB_UPPER", "BB_MIDDLE", "BB_LOWER"]:
            # Default consultant parameters: length 22, std_dev 2.0
            length = int(params.get("length", 22))
            std_dev = float(params.get("std_dev", 2.0))
            bb_df = ta.bbands(close, length=length, std=std_dev)
            if bb_df is None or bb_df.empty:
                raise ValueError("Failed to calculate Bollinger Bands.")
            # Column 0: Lower Band, Column 1: Middle Band, Column 2: Upper Band
            if ind in ["BOLLINGER_LOWER", "BB_LOWER"]:
                return bb_df.iloc[:, 0]
            elif ind in ["BOLLINGER_MIDDLE", "BB_MIDDLE"]:
                return bb_df.iloc[:, 1]
            return bb_df.iloc[:, 2]

        else:
            raise ValueError(f"Unsupported indicator type: {indicator}")

    @classmethod
    def evaluate_single_rule(cls, df: pd.DataFrame, rule: Any) -> Tuple[bool, float, float]:
        """
        Evaluates a single dynamic rule against the stock's DataFrame.
        Returns (is_condition_met, current_val_1, current_target_val).
        """
        series_1 = cls.get_indicator_series(df, rule.indicator_1, rule.indicator_1_params)
        if series_1 is None or len(series_1.dropna()) < 2:
            return False, 0.0, 0.0

        curr_1 = float(series_1.iloc[-1])
        prev_1 = float(series_1.iloc[-2])

        # Determine target values (either a static float or a second indicator series)
        if rule.target_type == "static":
            curr_2 = float(rule.static_value or 0.0)
            prev_2 = curr_2
        else:
            series_2 = cls.get_indicator_series(df, rule.indicator_2, rule.indicator_2_params)
            if series_2 is None or len(series_2.dropna()) < 2:
                return False, curr_1, 0.0
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

        return is_met, round(curr_1, 2), round(curr_2, 2)

    @classmethod
    def evaluate_symbol(cls, df: pd.DataFrame, rules: List[Any]) -> Dict[str, Any]:
        """
        Processes all active global rules for a given stock DataFrame.
        Calculates the precise (millimetric) confidence score and rule breakdown.
        """
        total_score = 0.0
        breakdown = []

        for rule in rules:
            try:
                is_met, val_1, val_2 = cls.evaluate_single_rule(df, rule)
                impact = float(rule.score_impact) if is_met else 0.0
                total_score += impact

                breakdown.append({
                    "id": rule.id,
                    "name": rule.name,
                    "condition_text": rule.description or rule.name,
                    "is_met": is_met,
                    "score_impact": round(float(rule.score_impact), 2),
                    "earned_score": round(impact, 2),
                    "current_value": val_1,
                    "target_value": val_2
                })
            except Exception as e:
                print(f"Error evaluating rule ID {rule.id} ({rule.name}): {e}")
                breakdown.append({
                    "id": rule.id,
                    "name": rule.name,
                    "condition_text": rule.description or rule.name,
                    "is_met": False,
                    "score_impact": round(float(rule.score_impact), 2),
                    "earned_score": 0.0,
                    "error": str(e)
                })

        # Clamp total score between 0 and 100 while preserving decimal precision (e.g., 78.20)
        clamped_score = max(0.0, min(100.0, round(total_score, 2)))

        return {
            "total_score": clamped_score,
            "rules_breakdown": breakdown
        }