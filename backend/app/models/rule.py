from __future__ import annotations
import enum
from datetime import datetime
from typing import Any, TYPE_CHECKING
from sqlalchemy import String, Float, Boolean, DateTime, Enum, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.notification import Notification


class RuleType(str, enum.Enum):
    PRICE = "PRICE"
    RSI = "RSI"
    SMA = "SMA"


class RuleOperator(str, enum.Enum):
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_OR_EQUAL = ">="
    LESS_OR_EQUAL = "<="


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    symbol: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    rule_type: Mapped[RuleType] = mapped_column(Enum(RuleType), nullable=False)
    operator: Mapped[RuleOperator] = mapped_column(Enum(RuleOperator), nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_state: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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