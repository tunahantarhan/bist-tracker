import pandas as pd
import pandas_ta as ta
from typing import Dict, Any, Tuple

class RuleEngine:
    @staticmethod
    def calculate_indicator(df: pd.DataFrame, rule_type: str, parameters: Dict[str, Any]) -> float:
        """
        From OHLCV data (DataFrame), the indicator is being calculated for the relative rule type
        and most recent (last) value is returned.
        """
        if df.empty or len(df) < 2:
            raise ValueError("Hesaplama için yetersiz veri.")

        if rule_type == "RSI":
            length = parameters.get("period", 14)
            # RSI calculation with pandas-ta
            df.ta.rsi(length=length, append=True)
            # Fetch the latest value from the calculated RSI column 
            return df[f"RSI_{length}"].iloc[-1]
            
        elif rule_type == "SMA":
            length = parameters.get("period", 20)
            df.ta.sma(length=length, append=True)
            return df[f"SMA_{length}"].iloc[-1]
            
        elif rule_type == "PRICE":
            return float(df["close"].iloc[-1])
            
        else:
            raise ValueError(f"Desteklenmeyen kural tipi: {rule_type}")

    @staticmethod
    def evaluate_rule(
        current_value: float,
        operator: str,
        threshold: float,
        previous_state: bool
    ) -> Tuple[bool, bool]:
        """
        The current value is being compared with target state and state change (False -> True) is checked.
        """
        is_condition_met = False

        if operator == ">":
            is_condition_met = current_value > threshold
        elif operator == "<":
            is_condition_met = current_value < threshold
        elif operator == ">=":
            is_condition_met = current_value >= threshold
        elif operator == "<=":
            is_condition_met = current_value <= threshold
        elif operator == "==":
            is_condition_met = current_value == threshold
        else:
            raise ValueError(f"Desteklenmeyen operatör: {operator}")

        # State Transition: Notification is being sent only if the state changes from False to True.
        should_trigger_notification = is_condition_met and not previous_state

        return is_condition_met, should_trigger_notification

    @classmethod
    def process_symbol_rules(cls, symbol_data: pd.DataFrame, rules: list) -> list:
        """
        DataFrame relevant to a stock and the rules dedicated to the same stock are processed in bulk.
        The list of notifications that need to be triggered is returned.
        """
        notifications_to_send = []

        for rule in rules:
            try:
                # 1. Calculate the current value of the indicator
                current_val = cls.calculate_indicator(
                    df=symbol_data, 
                    rule_type=rule.rule_type, 
                    parameters=rule.parameters
                )

                # 2. Review the rule and check the state transition
                new_state, should_notify = cls.evaluate_rule(
                    current_value=current_val,
                    operator=rule.operator,
                    threshold=rule.threshold,
                    previous_state=rule.last_state
                )

                # 3. If the state is changed, update the object for the database record.
                if new_state != rule.last_state:
                    rule.last_state = new_state
                    # Not: Bu aşamada SQLAlchemy session.commit() çağrılacak bir repository katmanı kullanılmalıdır.

                # 4. Notification decision
                if should_notify:
                    notifications_to_send.append({
                        "rule_id": rule.id,
                        "symbol": rule.symbol,
                        "message": f"{rule.symbol} için {rule.rule_type} değeri {current_val:.2f} oldu (Şart: {rule.operator} {rule.threshold})"
                    })

            except Exception as e:
                # Error logging (to the database or log service)
                print(f"Kural işleme hatası (Rule ID: {rule.id}): {e}")

        return notifications_to_send