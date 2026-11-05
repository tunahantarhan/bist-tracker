from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Timeframe = Literal["5m", "15m", "1h", "4h", "1d"]
Condition = Literal[">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"]
TargetType = Literal["static", "indicator"]

SUPPORTED_INDICATORS = {
    "PRICE", "RSI", "RSI_TRENDLINE", "SMA", "MA", "EMA",
    "STOCH_RSI", "STOCH_RSI_K", "STOCH_RSI_D",
    "MACD", "MACD_LINE", "MACD_SIGNAL", "MACD_HIST",
    "BOLLINGER_UPPER", "BOLLINGER_MIDDLE", "BOLLINGER_LOWER",
    "BB_UPPER", "BB_MIDDLE", "BB_LOWER",
}


def _validate_indicator(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip().upper()
    if v not in SUPPORTED_INDICATORS:
        raise ValueError(f"Desteklenmeyen indikatör: {v}")
    return v


class RuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    timeframe: Timeframe = "1d"
    is_primary_filter: bool = False
    indicator_1: str
    indicator_1_params: Optional[dict[str, Any]] = None
    condition: Condition
    target_type: TargetType
    static_value: Optional[float] = None
    indicator_2: Optional[str] = None
    indicator_2_params: Optional[dict[str, Any]] = None
    score_impact: float = Field(ge=0, le=100)
    is_active: bool = True

    @field_validator("indicator_1", "indicator_2")
    @classmethod
    def check_indicator(cls, v: Optional[str]) -> Optional[str]:
        return _validate_indicator(v)

    @model_validator(mode="after")
    def check_target(self):
        if self.target_type == "static" and self.static_value is None:
            raise ValueError("Sabit hedefli kuralda static_value zorunludur.")
        if self.target_type == "indicator" and not self.indicator_2:
            raise ValueError("İndikatör hedefli kuralda indicator_2 zorunludur.")
        return self


class RuleUpdate(BaseModel):
    """Partial update: only the provided fields are changed."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    timeframe: Optional[Timeframe] = None
    is_primary_filter: Optional[bool] = None
    indicator_1: Optional[str] = None
    indicator_1_params: Optional[dict[str, Any]] = None
    condition: Optional[Condition] = None
    target_type: Optional[TargetType] = None
    static_value: Optional[float] = None
    indicator_2: Optional[str] = None
    indicator_2_params: Optional[dict[str, Any]] = None
    score_impact: Optional[float] = Field(default=None, ge=0, le=100)
    is_active: Optional[bool] = None

    @field_validator("indicator_1", "indicator_2")
    @classmethod
    def check_indicator(cls, v: Optional[str]) -> Optional[str]:
        return _validate_indicator(v)


class RuleResponse(BaseModel):
    # Kept loose on purpose so legacy rows never break the listing
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    timeframe: str
    is_primary_filter: bool
    indicator_1: str
    indicator_1_params: Optional[dict[str, Any]] = None
    condition: str
    target_type: str
    static_value: Optional[float] = None
    indicator_2: Optional[str] = None
    indicator_2_params: Optional[dict[str, Any]] = None
    score_impact: float
    is_active: bool
    created_at: datetime
    updated_at: datetime
