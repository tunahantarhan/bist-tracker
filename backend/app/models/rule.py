from __future__ import annotations
from datetime import datetime
from typing import Any, TYPE_CHECKING
from sqlalchemy import String, Float, Boolean, DateTime, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.notification import Notification

class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    
    # 1. Main Indicator (E.g., "RSI", "SMA", "MACD", "BOLLINGER", "STOCH_RSI")
    indicator_1: Mapped[str] = mapped_column(String, nullable=False)
    # Indicator Parameters (E.g., {"period": 14} or {"length": 22, "std_dev": 2})
    indicator_1_params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True) 
    
    # Comparison Condition (E.g., ">", "<", "crosses_above", "crosses_below", "between")
    condition: Mapped[str] = mapped_column(String, nullable=False)
    
    # Target Type: "static" (static number, e.g., 30) or "indicator" (another indicator, e.g., MA 200)
    target_type: Mapped[str] = mapped_column(String, nullable=False) 
    
    # If the taget is a static value (E.g., RSI < 30),
    # then we need to specify the static value.
    static_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    # If the taget is an indicator (E.g., SMA 50 > SMA 200), 
    # then we need to specify the second indicator and its parameters.
    indicator_2: Mapped[str | None] = mapped_column(String, nullable=True)
    indicator_2_params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    
    # When the rule is satisfied, this score impact will be added to the stock's score. 
    score_impact: Mapped[float] = mapped_column(Float, nullable=False)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.now,
        nullable=False,
    )

    notifications: Mapped[list[Notification]] = relationship(
         "Notification", back_populates="rule", cascade="all, delete-orphan"
 )